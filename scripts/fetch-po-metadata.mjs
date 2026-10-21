/**
 * Baixa o $metadata REAL da API de Pedido de Compra (OData V4, api_purchaseorder_2) do tenant
 * S/4HANA Cloud e grava em webapp/localService/purchaseOrderService/metadata.xml — o mock passa a
 * servir exatamente o contrato do S/4 (mesma ideia do rapService, cujo metadata o deploy-abap
 * regrava). Rodar de novo quando a SAP atualizar a API (release trimestral).
 *
 * Credenciais: usuário de comunicação do Communication Arrangement SAP_COM_0053 (ACRUX_PED_COMPRA)
 * em S4_API_USER/S4_API_PASSWORD; host em S4_API_URL (padrão: tenant my404561).
 *
 * Uso: npm run fetch-po-metadata
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const S4_API_URL = process.env.S4_API_URL || "https://my404561-api.s4hana.cloud.sap";
const PO_SERVICE_PATH = "/sap/opu/odata4/sap/api_purchaseorder_2/srvd_a2x/sap/purchaseorder/0001/";

if (!process.env.S4_API_USER || !process.env.S4_API_PASSWORD) {
	console.error("S4_API_USER/S4_API_PASSWORD não definidas (variáveis de ambiente do usuário).");
	process.exit(1);
}
const auth = "Basic " + Buffer.from(`${process.env.S4_API_USER}:${process.env.S4_API_PASSWORD}`).toString("base64");
const res = await fetch(`${S4_API_URL}${PO_SERVICE_PATH}$metadata`, { headers: { Authorization: auth } });
if (!res.ok) {
	console.error(`HTTP ${res.status} ${res.statusText} ao ler o $metadata`);
	process.exit(1);
}
const xml = await res.text();
const target = fileURLToPath(new URL("../webapp/localService/purchaseOrderService/metadata.xml", import.meta.url));
writeFileSync(target, xml, "utf8");
console.log(`Gravado ${target} (${xml.length} bytes)`);
