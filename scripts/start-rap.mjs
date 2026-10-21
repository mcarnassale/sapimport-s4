/**
 * Sobe o app no modo híbrido (ui5-rap.yaml): IMPPCH/ImpSetup no backend RAP real, resto no mock.
 * O fiori-tools-proxy lê as credenciais de FIORI_TOOLS_USER/FIORI_TOOLS_PASSWORD — preenchidas
 * aqui a partir de SAP_USER (padrão DEVELOPER)/SAP_PASSWORD, as mesmas do deploy-abap e do MCP.
 *
 * Uso: npm run start-rap [-- <args extras do fiori run>]
 */
import { spawn } from "node:child_process";

if (!process.env.SAP_PASSWORD) {
	console.error("SAP_PASSWORD não definida (variável de ambiente do usuário).");
	process.exit(1);
}
const env = {
	...process.env,
	FIORI_TOOLS_USER: process.env.SAP_USER || "DEVELOPER",
	FIORI_TOOLS_PASSWORD: process.env.SAP_PASSWORD
};
const args = ["run", "--config", "./ui5-rap.yaml", ...(process.argv.length > 2 ? process.argv.slice(2) : ["--open", "/index.html"])];
const child = spawn("fiori", args, { env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
