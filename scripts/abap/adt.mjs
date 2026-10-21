/**
 * Cliente ADT mínimo (REST do ABAP Development Tools) para instalar o backend em sistema de
 * DESENVOLVIMENTO. Ferramenta de dev — a entrega para cliente é add-on/gCTS, não este script.
 *
 * Config por variável de ambiente: SAP_URL, SAP_USER (padrão DEVELOPER), SAP_PASSWORD, SAP_CLIENT.
 * Uma instância = uma sessão stateful (cookies + CSRF), necessária para lock/escrita/unlock.
 */
export const BASE = process.env.SAP_URL || "http://172.22.240.1:50000";
const CLIENT = process.env.SAP_CLIENT || "001";
const USER = process.env.SAP_USER || "DEVELOPER";
const AUTH = "Basic " + Buffer.from(`${USER}:${process.env.SAP_PASSWORD}`).toString("base64");

const TYPES = {
	TABL: { coll: "/sap/bc/adt/ddic/tables", adt: "TABL/DT", root: "blue:blueSource", ns: 'xmlns:blue="http://www.sap.com/wbobj/blue"' },
	DDLS: { coll: "/sap/bc/adt/ddic/ddl/sources", adt: "DDLS/DF", root: "ddl:ddlSource", ns: 'xmlns:ddl="http://www.sap.com/adt/ddic/ddlsources"' },
	BDEF: { coll: "/sap/bc/adt/bo/behaviordefinitions", adt: "BDEF/BDO", root: "blue:blueSource", ns: 'xmlns:blue="http://www.sap.com/wbobj/blue"', ct: "application/vnd.sap.adt.blues.v1+xml" },
	SRVD: { coll: "/sap/bc/adt/ddic/srvd/sources", adt: "SRVD/SRV", root: "srvd:srvdSource", ns: 'xmlns:srvd="http://www.sap.com/adt/ddic/srvdsources"', extra: ' srvd:srvdSourceType="S"' },
	CLAS: { coll: "/sap/bc/adt/oo/classes", adt: "CLAS/OC", root: "class:abapClass", ns: 'xmlns:class="http://www.sap.com/adt/oo/classes"' },
	// Objeto de intervalo de numeração: tipo "server driven" (fonte = JSON no formato AFF nrob-v1)
	NROB: { coll: "/sap/bc/adt/numberranges/objects", adt: "NROB/NRO", root: "blue:blueSource", ns: 'xmlns:blue="http://www.sap.com/wbobj/blue"', ct: "application/vnd.sap.adt.blues.v1+xml", srcCt: "application/json; charset=utf-8" },
	// Domínio: sem fonte, o objeto inteiro é o XML de metadados (ver writeDomain)
	DOMA: { coll: "/sap/bc/adt/ddic/domains", adt: "DOMA/DD" },
	SRVB: { coll: "/sap/bc/adt/businessservices/bindings", adt: "SRVB/SVB" }
};
export const objUrl = (type, name) => `${TYPES[type].coll}/${encodeURIComponent(name.toLowerCase())}`;
export const srcUrl = (type, name) => `${objUrl(type, name)}/source/main`;

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
/** Texto legível de uma resposta de erro ADT (XML/HTML) */
export const plain = (s, n = 800) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

export class Adt {
	constructor() {
		this.cookies = new Map();
		this.csrf = null;
	}

	async req(method, path, { body, ct, accept = "*/*", retried = false } = {}) {
		const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}sap-client=${CLIENT}`;
		const h = { Authorization: AUTH, Accept: accept, "X-sap-adt-sessiontype": "stateful" };
		if (this.cookies.size) {
			h.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
		}
		if (method !== "GET" && !this.csrf) {
			await this.fetchCsrf();
		}
		h["x-csrf-token"] = this.csrf || "Fetch";
		if (ct) {
			h["Content-Type"] = ct;
		}
		const res = await fetch(url, { method, headers: h, body });
		for (const c of res.headers.getSetCookie?.() || []) {
			const [kv] = c.split(";");
			const i = kv.indexOf("=");
			this.cookies.set(kv.slice(0, i), kv.slice(i + 1));
		}
		const tok = res.headers.get("x-csrf-token");
		if (tok && tok !== "Required") {
			this.csrf = tok;
		}
		const text = await res.text();
		if (res.status === 403 && tok === "Required" && method !== "GET" && !retried) {
			this.csrf = null;
			return this.req(method, path, { body, ct, accept, retried: true });
		}
		return { status: res.status, text };
	}

	/**
	 * Encerra a sessão stateful (request com header stateless). Sem isso, travas ENQUEUE que o
	 * servidor ainda associa à sessão (ex.: após DELETE de SRVB) ficam presas até o timeout.
	 */
	async close() {
		if (!this.cookies.size) {
			return;
		}
		await fetch(`${BASE}/sap/bc/adt/packages/%24tmp?sap-client=${CLIENT}`, {
			headers: {
				Authorization: AUTH,
				"X-sap-adt-sessiontype": "stateless",
				Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ")
			}
		}).then((r) => r.text()).catch(() => {});
		this.cookies.clear();
		this.csrf = null;
	}

	async fetchCsrf() {
		// /discovery não serve: o token que ela devolve não valida nos POSTs seguintes
		const r = await this.req("GET", "/sap/bc/adt/packages/%24tmp");
		if (!this.csrf) {
			throw new Error(`Sem CSRF token (HTTP ${r.status}) — conferir SAP_URL/SAP_PASSWORD`);
		}
	}

	ok(r, what) {
		if (r.status >= 300) {
			throw new Error(`${what} -> HTTP ${r.status}: ${plain(r.text)}`);
		}
		return r;
	}

	async lock(url) {
		const r = this.ok(await this.req("POST", `${url}?_action=LOCK&accessMode=MODIFY`, {
			accept: "application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result, application/*;q=0.8"
		}), `LOCK ${url}`);
		return r.text.match(/<LOCK_HANDLE>([^<]+)</)[1];
	}

	async unlock(url, h) {
		await this.req("POST", `${url}?_action=UNLOCK&lockHandle=${encodeURIComponent(h)}`);
	}

	async exists(type, name) {
		return (await this.req("GET", objUrl(type, name))).status === 200;
	}

	async packageExists(name) {
		return (await this.req("GET", `/sap/bc/adt/packages/${encodeURIComponent(name.toLowerCase())}`)).status === 200;
	}

	/** Cria o objeto vazio (inativo) como ABAP for Cloud Development */
	async create(type, name, pkg, description) {
		const t = TYPES[type];
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<${t.root} ${t.ns} xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${esc(description)}" adtcore:name="${name.toUpperCase()}" adtcore:type="${t.adt}" adtcore:masterLanguage="EN" adtcore:abapLanguageVersion="cloudDevelopment" adtcore:responsible="${USER}"${t.extra || ""}>
  <adtcore:packageRef adtcore:name="${esc(pkg)}"/>
</${t.root}>`;
		return this.ok(await this.req("POST", `${t.coll}?_package=${encodeURIComponent(pkg)}`, { body: xml, ct: t.ct || "application/*" }), `CREATE ${type} ${name}`);
	}

	/**
	 * Pacote local (software component LOCAL). languageVersion "5" = ABAP for Cloud Development
	 * (o ST SPAK_ST_PACKAGES recusa o nome "cloudDevelopment" aqui) e exige o conjunto completo de
	 * atributos, igual ao que o GET devolve.
	 */
	async createPackage(name, description, languageVersion = "5") {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${esc(description)}" adtcore:name="${esc(name)}" adtcore:type="DEVC/K" adtcore:version="active" adtcore:responsible="${USER}">
  <adtcore:packageRef adtcore:name="${esc(name)}"/>
  <pak:attributes pak:packageType="development" pak:isPackageTypeEditable="true" pak:isAddingObjectsAllowed="false" pak:isAddingObjectsAllowedEditable="true" pak:isEncapsulated="false" pak:isEncapsulationEditable="true" pak:isEncapsulationVisible="true" pak:recordChanges="false" pak:isRecordChangesEditable="false" pak:isSwitchVisible="false" pak:languageVersion="${languageVersion}" pak:isLanguageVersionVisible="true" pak:isLanguageVersionEditable="true"/>
  <pak:superPackage adtcore:name=""/>
  <pak:applicationComponent/>
  <pak:transport>
    <pak:softwareComponent pak:name="LOCAL"/>
    <pak:transportLayer pak:name=""/>
  </pak:transport>
  <pak:translation/>
  <pak:useAccesses/>
  <pak:packageInterfaces/>
  <pak:subPackages/>
</pak:package>`;
		return this.ok(await this.req("POST", "/sap/bc/adt/packages", { body: xml, ct: "application/*" }), `CREATE PACKAGE ${name}`);
	}

	async _put(url, h, source, ct = "text/plain; charset=utf-8") {
		return this.req("PUT", `${url}?lockHandle=${encodeURIComponent(h)}`, { body: source, ct });
	}

	async writeSource(type, name, source) {
		const o = objUrl(type, name);
		const h = await this.lock(o);
		try {
			this.ok(await this._put(srcUrl(type, name), h, source, TYPES[type].srcCt), `PUT ${type} ${name}`);
		} finally {
			await this.unlock(o, h);
		}
	}

	/** Classe: fonte principal + include de tipos locais (handlers do behavior pool), num só lock */
	async writeClass(name, main, localsImp) {
		const o = objUrl("CLAS", name);
		const h = await this.lock(o);
		try {
			this.ok(await this._put(srcUrl("CLAS", name), h, main), `PUT CLAS ${name}`);
			if (localsImp !== undefined) {
				const inc = `${o}/includes/implementations`;
				let r = await this._put(inc, h, localsImp);
				if (r.status === 404) {
					// classe nova: o include ainda não existe, precisa ser inicializado antes
					await this.req("POST", `${inc}?lockHandle=${encodeURIComponent(h)}`);
					r = await this._put(inc, h, localsImp);
				}
				this.ok(r, `PUT CLAS ${name} locals_imp`);
			}
		} finally {
			await this.unlock(o, h);
		}
	}

	/**
	 * Domínio (DOMA) a partir de uma spec simples { description, datatype, length, decimals? }.
	 * Domínio não tem /source/main: cria já com o conteúdo, ou regrava o XML inteiro sob lock.
	 */
	async writeDomain(name, pkg, spec) {
		const sLen = String(spec.length).padStart(6, "0");
		const sDec = String(spec.decimals || 0).padStart(6, "0");
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${esc(spec.description)}" adtcore:name="${name.toUpperCase()}" adtcore:type="DOMA/DD" adtcore:language="EN" adtcore:masterLanguage="EN" adtcore:abapLanguageVersion="cloudDevelopment" adtcore:responsible="${USER}">
  <adtcore:packageRef adtcore:name="${esc(pkg)}"/>
  <doma:content>
    <doma:typeInformation><doma:datatype>${spec.datatype}</doma:datatype><doma:length>${sLen}</doma:length><doma:decimals>${sDec}</doma:decimals></doma:typeInformation>
    <doma:outputInformation><doma:length>${sLen}</doma:length><doma:style>00</doma:style><doma:conversionExit/><doma:signExists>false</doma:signExists><doma:lowercase>false</doma:lowercase><doma:ampmFormat>false</doma:ampmFormat></doma:outputInformation>
    <doma:valueInformation><doma:valueTableRef/><doma:appendExists>false</doma:appendExists><doma:fixValues/></doma:valueInformation>
  </doma:content>
</doma:domain>`;
		const ct = "application/vnd.sap.adt.domains.v2+xml; charset=utf-8";
		if (!(await this.exists("DOMA", name))) {
			return this.ok(await this.req("POST", `${TYPES.DOMA.coll}?_package=${encodeURIComponent(pkg)}`, { body: xml, ct }), `CREATE DOMA ${name}`);
		}
		const o = objUrl("DOMA", name);
		const h = await this.lock(o);
		try {
			this.ok(await this.req("PUT", `${o}?lockHandle=${encodeURIComponent(h)}`, { body: xml, ct }), `PUT DOMA ${name}`);
		} finally {
			await this.unlock(o, h);
		}
	}

	async remove(type, name) {
		const o = objUrl(type, name);
		const h = await this.lock(o);
		const r = await this.req("DELETE", `${o}?lockHandle=${encodeURIComponent(h)}`);
		if (r.status >= 300) {
			await this.unlock(o, h);
			throw new Error(`DELETE ${type} ${name} -> HTTP ${r.status}: ${plain(r.text)}`);
		}
	}

	/** Ativação em massa (resolve dependências circulares). Retorna [{type:E|W|A, obj, text}] */
	async activate(objs) {
		const refs = objs.map((o) => `<adtcore:objectReference adtcore:uri="${objUrl(o.type, o.name)}" adtcore:name="${o.name.toUpperCase()}"/>`).join("");
		const body = `<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">${refs}</adtcore:objectReferences>`;
		const r = this.ok(await this.req("POST", "/sap/bc/adt/activation?method=activate&preauditRequested=false", { body, ct: "application/xml", accept: "application/xml" }), "ACTIVATE");
		return [...r.text.matchAll(/<msg [^>]*type="([EWA])"[^>]*>[\s\S]*?<txt>([^<]*)<\/txt>/g)].map((m) => ({
			type: m[1],
			obj: (m[0].match(/href="[^"]*\/([^/"#?]+)(?:\/source\/main)?[#"?]/) || [])[1],
			text: plain(m[2])
		}));
	}

	/** Service binding OData V4 (category 0 = UI) */
	async createServiceBinding(name, pkg, serviceDefinition, description) {
		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<srvb:serviceBinding xmlns:srvb="http://www.sap.com/adt/ddic/ServiceBindings" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${esc(description)}" adtcore:name="${name.toUpperCase()}" adtcore:type="SRVB/SVB" adtcore:language="EN" adtcore:masterLanguage="EN" adtcore:abapLanguageVersion="cloudDevelopment" adtcore:responsible="${USER}">
  <adtcore:packageRef adtcore:name="${esc(pkg)}"/>
  <srvb:services srvb:name="${name.toUpperCase()}">
    <srvb:content srvb:version="0001">
      <srvb:serviceDefinition adtcore:name="${serviceDefinition.toUpperCase()}"/>
    </srvb:content>
  </srvb:services>
  <srvb:binding srvb:category="0" srvb:type="ODATA" srvb:version="V4">
    <srvb:implementation adtcore:name=""/>
  </srvb:binding>
</srvb:serviceBinding>`;
		return this.ok(await this.req("POST", `${TYPES.SRVB.coll}?_package=${encodeURIComponent(pkg)}`, { body: xml, ct: "application/*" }), `CREATE SRVB ${name}`);
	}

	async publishV4(name, job = "publishjobs") {
		const r = await this.req("POST", `/sap/bc/adt/businessservices/odatav4/${job}?servicename=${encodeURIComponent(name.toUpperCase())}&serviceversion=0001`, {
			body: `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core"><adtcore:objectReference adtcore:name="${name.toUpperCase()}"/></adtcore:objectReferences>`,
			ct: "application/xml",
			accept: "application/vnd.sap.as+xml, application/*;q=0.8"
		});
		return this.ok(r, `${job} ${name}`).text;
	}
}
