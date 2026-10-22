/**
 * Baixa o $metadata REAL dos serviços dos Custom Business Objects (OData V2, YY1_ACX_*_CDS) do
 * tenant S/4HANA Cloud para webapp/localService/cbo/<serviço>/metadata.xml — o mock passa a servir
 * exatamente o contrato do S/4 (mesma ideia do fetch-po-metadata). Rodar de novo depois de
 * `npm run create-cbos` mudar algum CBO.
 *
 * Credenciais: usuário de comunicação do arrangement YY1_ACX_SAPIMPORT em S4_API_USER/
 * S4_API_PASSWORD; host em S4_API_URL (padrão: tenant my404561).
 *
 * Uso: npm run fetch-cbo-metadata
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const S4_API_URL = process.env.S4_API_URL || "https://my404561-api.s4hana.cloud.sap";
// CBOs (npm run create-cbos) e Custom CDS Views (npm run create-cds) — todos YY1_ACX_*_CDS
const SERVICES = [
	"YY1_ACX_DESPCAL_CDS", "YY1_ACX_IMPLAY_CDS", "YY1_ACX_IMPICFG_CDS", "YY1_ACX_IMPIPRV_CDS", "YY1_ACX_IMPPCH_CDS",
	"YY1_ACX_EXPENSE_CDS", "YY1_ACX_USAGE_CDS",
	"YY1_ACX_CURRENCY_CDS", "YY1_ACX_EXCHRATE_CDS", "YY1_ACX_TAXCODE_CDS", "YY1_ACX_GLACCOUNT_CDS", "YY1_ACX_STORLOC_CDS"
];

if (!process.env.S4_API_USER || !process.env.S4_API_PASSWORD) {
	console.error("S4_API_USER/S4_API_PASSWORD não definidas (variáveis de ambiente do usuário).");
	process.exit(1);
}
const auth = "Basic " + Buffer.from(`${process.env.S4_API_USER}:${process.env.S4_API_PASSWORD}`).toString("base64");
for (const sService of SERVICES) {
	const res = await fetch(`${S4_API_URL}/sap/opu/odata/sap/${sService}/$metadata`, { headers: { Authorization: auth } });
	if (!res.ok) {
		console.error(`${sService}: HTTP ${res.status} ${res.statusText} ao ler o $metadata`);
		process.exitCode = 1;
		continue;
	}
	const xml = await res.text();
	const dir = fileURLToPath(new URL(`../webapp/localService/cbo/${sService}/`, import.meta.url));
	mkdirSync(dir, { recursive: true });
	writeFileSync(dir + "metadata.xml", xml, "utf8");
	console.log(`Gravado ${dir}metadata.xml (${xml.length} bytes)`);
}
