/**
 * Cliente dos serviços INTERNOS dos apps de extensibilidade Key User do S/4HANA Cloud (OData V2 com
 * draft): "Custom Business Objects" (APS_EXT_CBO_D_SRV, padrão) e "Custom CDS Views"
 * (APS_EXT_CCV_SRV). Não são APIs liberadas: é o que as próprias telas chamam — por isso só servem
 * como ferramenta de DESENVOLVIMENTO (podem mudar entre releases). Nos clientes, os objetos vão
 * por Extensibility Template.
 *
 * Autenticação: o tenant só aceita login SSO/SAML de usuário de negócio (comm user não acessa este
 * serviço), então a sessão vem de um Chrome aberto pelo `npm run cbo-browser` (porta de debug 9333)
 * onde o usuário fez login.
 */
import { chromium } from "playwright";

export const CBO_SERVICE = "APS_EXT_CBO_D_SRV";
export const CDS_VIEW_SERVICE = "APS_EXT_CCV_SRV";
export const DEBUG_PORT = 9333;
export const ZERO = "00000000-0000-0000-0000-000000000000";

export const guid = (u) => `guid'${u}'`;
const filter = (s) => s.replace(/ /g, "%20");

export async function connect(sService = CBO_SERVICE) {
	const SRV = `/sap/opu/odata/sap/${sService}/`;
	const browser = await chromium.connectOverCDP(`http://127.0.0.1:${DEBUG_PORT}`).catch(() => {
		throw new Error("Chrome de debug não encontrado — rode `npm run cbo-browser` e faça login no S/4.");
	});
	const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes("s4hana.cloud.sap"));
	if (!page) {
		throw new Error("Nenhuma aba do S/4 aberta no Chrome de debug — faça login no Launchpad.");
	}
	const origin = new URL(page.url()).origin;
	const tokenRes = await page.request.get(origin + SRV, { headers: { "x-csrf-token": "fetch" } });
	if (tokenRes.status() !== 200) {
		throw new Error(`Sessão do S/4 inválida (HTTP ${tokenRes.status()}) — refaça o login no Chrome de debug.`);
	}
	const token = tokenRes.headers()["x-csrf-token"];

	// Retorna { d, messages }: messages = sap-message (avisos/erros de consistência do CBO vêm aqui,
	// não no corpo — o Check responde 200 mesmo com erro).
	async function call(method, path, body) {
		const res = await page.request.fetch(origin + SRV + path, {
			method,
			headers: { "x-csrf-token": token, Accept: "application/json", "Content-Type": "application/json" },
			data: body ? JSON.stringify(body) : undefined
		});
		const text = await res.text();
		let json;
		try {
			json = JSON.parse(text);
		} catch {
			json = undefined;
		}
		if (res.status() >= 400) {
			const msg = json?.error?.message?.value || text.replace(/<[^>]+>/g, " ").slice(0, 400);
			const det = (json?.error?.innererror?.errordetails || []).map((d) => d.message).filter((m) => m !== msg);
			throw new Error(`${method} ${path} -> ${res.status()}: ${[msg, ...det].join(" | ")}`);
		}
		const header = res.headers()["sap-message"];
		const messages = [];
		if (header) {
			const m = JSON.parse(header);
			for (const x of [m, ...(m.details || [])]) {
				messages.push({ severity: x.severity, text: x.message });
			}
		}
		return { d: json?.d, messages };
	}

	const get = async (path) => (await call("GET", path)).d;
	const list = async (path) => (await get(filter(path))).results;
	// Sem browser.close(): num navegador conectado por CDP, fecharia o Chrome do usuário
	return { call, get, list, origin, disconnect: () => process.exit(process.exitCode || 0) };
}
