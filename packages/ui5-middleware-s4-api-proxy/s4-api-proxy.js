// Proxy das APIs do S/4HANA Cloud (host "-api" do tenant) para o dev server, autenticando com o
// usuário de COMUNICAÇÃO do Communication Arrangement (S4_API_USER/S4_API_PASSWORD, variáveis de
// ambiente — nunca no repositório). Existe porque o fiori-tools-proxy só aceita um usuário para
// todos os backends (FIORI_TOOLS_USER), e esse já é o do backend RAP no ABAP Trial.
//
// O V4 lê por POST $batch, que exige CSRF token: o token é amarrado à sessão (cookies), então os
// cookies passam nos dois sentidos — no caminho de volta sem Domain/Secure/SameSite, senão o
// navegador não os guarda para http://localhost.
//
// configuration:
//   url:   host da API (S4_API_URL no ambiente tem prioridade)
//   paths: prefixos de URL encaminhados ao S/4 (o resto segue para o próximo middleware)
const https = require("node:https");

module.exports = async function ({ log, options }) {
    const oConfig = (options && options.configuration) || {};
    const oTarget = new URL(process.env.S4_API_URL || oConfig.url);
    const aPaths = oConfig.paths || [];
    const sUser = process.env.S4_API_USER;
    const sPassword = process.env.S4_API_PASSWORD;
    if (!sUser || !sPassword) {
        log.warn("S4_API_USER/S4_API_PASSWORD não definidas — chamadas ao S/4 vão responder 503");
    } else {
        log.info(`${aPaths.join(", ")} -> ${oTarget.origin} (usuário ${sUser})`);
    }
    const sAuth = "Basic " + Buffer.from(`${sUser}:${sPassword}`).toString("base64");

    return function s4ApiProxy(req, res, next) {
        const sUrl = req.originalUrl || req.url;
        if (!aPaths.some((sPath) => sUrl.startsWith(sPath))) {
            next();
            return;
        }
        if (!sUser || !sPassword) {
            res.statusCode = 503;
            res.end("S4_API_USER/S4_API_PASSWORD não definidas no ambiente do dev server");
            return;
        }

        const oHeaders = { ...req.headers, host: oTarget.host, authorization: sAuth };
        delete oHeaders.origin;
        delete oHeaders.referer;
        const oUpstream = https.request({
            hostname: oTarget.hostname,
            port: oTarget.port || 443,
            path: sUrl,
            method: req.method,
            headers: oHeaders
        }, (oResponse) => {
            const aCookies = oResponse.headers["set-cookie"];
            if (aCookies) {
                oResponse.headers["set-cookie"] = aCookies.map((sCookie) =>
                    sCookie.replace(/;\s*(domain=[^;]*|secure|samesite=[^;]*)/gi, ""));
            }
            res.writeHead(oResponse.statusCode, oResponse.headers);
            oResponse.pipe(res);
        });
        oUpstream.on("error", (oError) => {
            log.error(`${req.method} ${sUrl}: ${oError.message}`);
            if (!res.headersSent) {
                res.statusCode = 502;
            }
            res.end(`Falha ao falar com o S/4: ${oError.message}`);
        });
        req.pipe(oUpstream);
    };
};
