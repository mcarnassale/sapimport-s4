/**
 * Abre um Chrome separado (perfil próprio, porta de debug 9333) no Launchpad do tenant, para o
 * create-cbos.mjs usar a sessão SSO do usuário. Fazer login nele e deixar aberto.
 *
 * Uso: npm run cbo-browser   (env: S4_UI_URL, padrão o tenant my404561)
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEBUG_PORT } from "./designer.mjs";

const URL_UI = process.env.S4_UI_URL || "https://my404561.s4hana.cloud.sap/ui";
const CANDIDATES = [
	"C:/Program Files/Google/Chrome/Application/chrome.exe",
	"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
	"/usr/bin/google-chrome",
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
];
const exe = CANDIDATES.find((c) => fs.existsSync(c));
if (!exe) {
	throw new Error("Chrome/Edge não encontrado");
}
const profile = path.join(os.tmpdir(), "sapimport-cbo-chrome");
spawn(exe, [`--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--no-first-run", URL_UI], { detached: true, stdio: "ignore" }).unref();
console.log(`Chrome aberto (debug ${DEBUG_PORT}). Faça login no S/4 e depois rode: npm run create-cbos`);
