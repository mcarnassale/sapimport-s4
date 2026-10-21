/**
 * Baixa o $metadata REAL das APIs padrão do S/4HANA Cloud usadas como cadastros (OData V2) para
 * webapp/localService/s4api/<serviço>/metadata.xml — o mock passa a servir exatamente o contrato
 * do S/4 (mesma ideia do fetch-po-metadata / fetch-cbo-metadata). Rodar de novo quando a SAP
 * atualizar as APIs (release trimestral).
 *
 *  - API_PRODUCT_SRV       produtos (Communication Arrangement SAP_COM_0009)
 *  - API_BUSINESS_PARTNER  fornecedores/parceiros (SAP_COM_0008)
 *
 * Credenciais: usuário de comunicação em S4_API_USER/S4_API_PASSWORD (o mesmo nos arrangements);
 * host em S4_API_URL (padrão: tenant my404561).
 *
 * Uso: npm run fetch-api-metadata
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const S4_API_URL = process.env.S4_API_URL || "https://my404561-api.s4hana.cloud.sap";
const SERVICES = ["API_PRODUCT_SRV", "API_BUSINESS_PARTNER"];

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
	const dir = fileURLToPath(new URL(`../webapp/localService/s4api/${sService}/`, import.meta.url));
	mkdirSync(dir, { recursive: true });
	writeFileSync(dir + "metadata.xml", xml, "utf8");
	console.log(`Gravado ${dir}metadata.xml (${xml.length} bytes)`);
}
