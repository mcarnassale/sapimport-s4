/**
 * Instala/atualiza o conteúdo de abap/ num sistema ABAP de desenvolvimento via ADT:
 * pacote (ABAP Cloud) -> cria objetos que faltam -> grava fontes -> ativação em massa ->
 * service binding OData V4 + publish. Idempotente: pode rodar de novo após `npm run generate-abap`.
 *
 * Uso: npm run deploy-abap   (env: SAP_URL, SAP_PASSWORD, ABAP_PACKAGE, ABAP_PREFIX)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Adt, BASE } from "./adt.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "abap");
const PKG = process.env.ABAP_PACKAGE || "$ZSAPIMPORT";
const P = (process.env.ABAP_PREFIX || "Z").toUpperCase();
const SRVD = `${P}UI_IMPORTPROCESS`;
const SRVB = `${SRVD}_O4`;

const EXT = {
	".doma.json": "DOMA", ".nrob.json": "NROB",
	".tabl.asddls": "TABL", ".ddls.asddls": "DDLS", ".bdef.asbdef": "BDEF", ".srvd.srvdsrv": "SRVD", ".clas.abap": "CLAS"
};
const ORDER = ["DOMA", "NROB", "TABL", "DDLS", "CLAS", "BDEF", "SRVD"];

const objs = [];
for (const f of fs.readdirSync(SRC)) {
	const ext = Object.keys(EXT).find((e) => f.endsWith(e));
	if (!ext) {
		continue; // .clas.locals_imp.abap é lido junto com a classe
	}
	const name = f.slice(0, -ext.length).toUpperCase();
	const o = { type: EXT[ext], name, source: fs.readFileSync(path.join(SRC, f), "utf8") };
	if (o.type === "CLAS") {
		const loc = path.join(SRC, f.replace(".clas.abap", ".clas.locals_imp.abap"));
		o.locals = fs.existsSync(loc) ? fs.readFileSync(loc, "utf8") : undefined;
	}
	objs.push(o);
}
objs.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));

const label = (src, fallback) => (src.match(/@EndUserText\.label\s*:\s*'([^']*)'/) || [])[1] || fallback;
const adt = new Adt();
try {
	if (!(await adt.packageExists(PKG))) {
		await adt.createPackage(PKG, "sapimport-s4 backend (ABAP Cloud)");
		console.log(`pacote ${PKG} criado`);
	}

	// Domínio não tem fonte: o create já leva o conteúdo (ver Adt.writeDomain)
	for (const o of objs.filter((x) => x.type === "DOMA")) {
		await adt.writeDomain(o.name, PKG, JSON.parse(o.source));
	}
	for (const o of objs.filter((x) => x.type !== "DOMA")) {
		if (!(await adt.exists(o.type, o.name))) {
			const sDescription = o.type === "NROB" ? JSON.parse(o.source).header.description : label(o.source, o.type === "CLAS" ? "Behavior pool" : "sapimport");
			await adt.create(o.type, o.name, PKG, sDescription);
			console.log(`criado ${o.type} ${o.name}`);
		} else if (o.type === "NROB") {
			// NROB já ativo: o servidor ignora header.description num PUT de fonte e a versão inativa
			// resultante não ativa ("description is missing"). Então só se grava no create; depois,
			// se a fonte mudou, avisa — apagar/recriar perderia os intervalos e o contador.
			const r = await adt.req("GET", `/sap/bc/adt/numberranges/objects/${o.name.toLowerCase()}/source/main?version=active`, { accept: "application/json" });
			const strip = (s) => { const j = JSON.parse(s); j.header.description = ""; return JSON.stringify(j); };
			if (strip(r.text) !== strip(o.source)) {
				console.warn(`AVISO: NROB ${o.name} difere do gerado e não é atualizado automaticamente — ajustar no ADT.`);
			}
			o.skip = true;
		}
	}
	for (const o of objs.filter((x) => x.type !== "DOMA" && !x.skip)) {
		if (o.type === "CLAS") {
			await adt.writeClass(o.name, o.source, o.locals);
		} else {
			await adt.writeSource(o.type, o.name, o.source);
		}
	}
	console.log(`${objs.length} fontes gravadas; ativando...`);

	// Em fases: um lote único com tudo (25 objetos) já derrubou a ativação com DBIF_REPO_SQL_ERROR/HTTP 500.
	// BDEF e classe ficam juntos (dependência circular: "implementation in class" x "FOR BEHAVIOR OF").
	const PHASES = [["DOMA"], ["NROB"], ["TABL"], ["DDLS"], ["CLAS", "BDEF"], ["SRVD"]];
	for (const aTypes of PHASES) {
		const aPhaseObjs = objs.filter((o) => aTypes.includes(o.type) && !o.skip);
		if (!aPhaseObjs.length) {
			continue;
		}
		const t0 = Date.now();
		const msgs = await adt.activate(aPhaseObjs);
		const errors = msgs.filter((m) => m.type === "E" || m.type === "A");
		for (const m of msgs) {
			console.log(`  [${m.type}] ${m.obj || "?"}: ${m.text}`);
		}
		console.log(`ativação ${aTypes.join("+")}: ${errors.length} erro(s), ${msgs.length - errors.length} aviso(s), ${((Date.now() - t0) / 1000).toFixed(0)}s`);
		if (errors.length) {
			throw new Error("ativação com erro");
		}
	}

	if (!(await adt.exists("SRVB", SRVB))) {
		await adt.createServiceBinding(SRVB, PKG, SRVD, "sapimport - processos (OData V4 UI)");
		console.log(`criado SRVB ${SRVB}`);
	}
	// O SRVB nasce INATIVO no create — precisa ativar antes do publish.
	const getBinding = async () => (await adt.req("GET", `/sap/bc/adt/businessservices/bindings/${SRVB.toLowerCase()}`, {
		accept: "application/vnd.sap.adt.businessservices.servicebinding.v2+xml"
	})).text;
	let sBinding = await getBinding();
	if (/adtcore:version="inactive"/.test(sBinding)) {
		const bMsgs = await adt.activate([{ type: "SRVB", name: SRVB }]);
		if (bMsgs.some((m) => m.type === "E")) {
			console.log(bMsgs);
			throw new Error("ativação com erro");
		}
		sBinding = await getBinding();
	}
	if (/srvb:published="true"/.test(sBinding)) {
		console.log(`SRVB ${SRVB} já publicado`);
	} else {
		console.log(`publish: ${(await adt.publishV4(SRVB)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200)}`);
	}
	const sServiceUrl = `/sap/opu/odata4/sap/${SRVB.toLowerCase()}/srvd/sap/${SRVD.toLowerCase()}/0001/`;
	console.log(`URL: ${sServiceUrl}`);

	// O mock do data source rapService usa o $metadata REAL — atualiza a cada deploy. Fetch simples,
	// fora da sessão ADT (chamada OData com o header stateful do ADT dá "Session no longer exists").
	const oMetaResp = await fetch(`${BASE}${sServiceUrl}$metadata?sap-client=${process.env.SAP_CLIENT || "001"}`, {
		headers: { Authorization: "Basic " + Buffer.from(`${process.env.SAP_USER || "DEVELOPER"}:${process.env.SAP_PASSWORD}`).toString("base64") }
	});
	if (!oMetaResp.ok) {
		throw new Error(`$metadata: HTTP ${oMetaResp.status}`);
	}
	fs.writeFileSync(path.join(ROOT, "webapp/localService/rapService/metadata.xml"), await oMetaResp.text(), "utf8");
	console.log("webapp/localService/rapService/metadata.xml atualizado");
} finally {
	await adt.close();
}
