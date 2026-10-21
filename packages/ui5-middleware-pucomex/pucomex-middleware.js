// Real UI5 server-middleware for the Portal Único Siscomex "DUIMP"/"produto" lookups used by
// ProcessosDetail.controller.js's onAnexoPO2DI (DUIMP branch) — see docs/po2di-duimp-port-notes.md.
//
// Adapted from ../sapimport (B1)'s packages/ui5-middleware-pucomex/pucomex-middleware.js — same
// reason for existing: calling https://*.portalunico.siscomex.gov.br straight from the browser
// (even tunneled byte-transparently through fiori-tools-proxy) gets rejected with a 401 on
// x-csrf-token even though the token value itself is correct, confirmed live in that project from
// a plain HTTP client with none of a browser's Origin/Referer/Sec-Fetch-* headers. This middleware
// runs the actual two-step PUCOMEX call (authenticate, then fetch) from Node — a real API-client
// context — and hands the browser back just the plain JSON result. The browser never talks to
// PUCOMEX directly.
//
// Only the /duimp and /produtos routes are ported (PO2DI's DUIMP branch is the only feature in
// this project that needs them) — the B1 original's third route, /chaves-acesso, backs
// onDIChaveDuimp, a feature not ported here.
//
// Replaces packages/ui5-middleware-pucomex-mock (the fixture-only fake) in ui5-mock.yaml — this
// one makes REAL calls to the real Portal Único Siscomex API using whatever ClientId/ClientSecret
// the current Processo's Filial (BusinessPlaces) carries.

let oTokenCache = null;

async function getAccessToken(sAmbientePU, sPerfilPU, sClientId, sClientSecret) {
    const iNow = Date.now();
    if (oTokenCache && oTokenCache.sAmbientePU === sAmbientePU && oTokenCache.sClientId === sClientId
        && oTokenCache.iExpiresAt > iNow) {
        return oTokenCache;
    }

    const sBase = sAmbientePU.replace(/\/$/, "");
    const oResponse = await fetch(`${sBase}/portal/api/autenticar/chave-acesso`, {
        method: "POST",
        headers: {
            "Client-Id": sClientId,
            "Client-Secret": sClientSecret,
            "Role-Type": sPerfilPU || "",
            Accept: "application/json"
        }
    });
    if (!oResponse.ok) {
        const sBody = await oResponse.text().catch(() => "");
        let vBody;
        try { vBody = JSON.parse(sBody); } catch { vBody = sBody; }
        const oError = new Error(typeof vBody === "object" ? vBody.message || sBody : sBody || oResponse.statusText);
        oError.status = oResponse.status;
        oError.body = vBody;
        throw oError;
    }

    const sToken = oResponse.headers.get("set-token");
    const sCsrfToken = oResponse.headers.get("x-csrf-token");
    const sExpiration = oResponse.headers.get("x-csrf-expiration");
    if (!sToken) {
        const oError = new Error("Portal Único autenticou, mas não retornou o header set-token.");
        oError.status = 502;
        throw oError;
    }

    oTokenCache = {
        sAmbientePU, sClientId,
        // Sem prefixo "Bearer " — confirmado ao vivo no projeto B1 original (PUFunctions.cs:203):
        // o Portal Único amarra o x-csrf-token ao valor exato do Authorization; um "Bearer " a
        // mais já invalidava essa checagem.
        sAuthorization: sToken, sCsrfToken,
        iExpiresAt: sExpiration ? Number(sExpiration) : iNow + 5 * 60 * 1000
    };
    return oTokenCache;
}

function sendJson(res, iStatus, oBody) {
    const sJson = JSON.stringify(oBody);
    res.writeHead(iStatus, { "Content-Type": "application/json; charset=utf-8" });
    res.end(sJson);
}

async function puGet(sBase, oToken, sPath) {
    const oResponse = await fetch(`${sBase}${sPath}`, {
        headers: {
            Authorization: oToken.sAuthorization,
            "X-CSRF-Token": oToken.sCsrfToken || "",
            Accept: "application/json"
        }
    });
    const sBody = await oResponse.text().catch(() => "");
    let vBody;
    try { vBody = JSON.parse(sBody); } catch { vBody = sBody; }
    if (!oResponse.ok) {
        const oError = new Error(typeof vBody === "object" ? vBody.message || sBody : sBody);
        oError.status = oResponse.status;
        oError.body = vBody;
        throw oError;
    }
    return vBody;
}

// Mirrors the B1 original's ReadDuimp.GetDuimp/GetItem (ReadDuimp.cs:745-827) — resolve the
// current "versao" first, then fetch the DUIMP header and its (paginated, ATIVO-only) items with
// that version.
async function getDuimpVersao(sBase, oToken, sNumero) {
    return puGet(sBase, oToken, `/duimp-api/api/ext/duimp/${encodeURIComponent(sNumero)}/versoes`);
}

async function getDuimpItens(sBase, oToken, sNumero, iVersao) {
    const aItens = [];
    let iInicio = 1;
    const iTamanho = 100;
    for (;;) {
        const vPage = await puGet(
            sBase, oToken,
            `/duimp-api/api/ext/duimp/${encodeURIComponent(sNumero)}/${iVersao}/itens?inicial=${iInicio}&tamanho=${iTamanho}`
        );
        const aPage = Array.isArray(vPage) ? vPage : [];
        aItens.push(...aPage);
        if (aPage.length < iTamanho) {
            break;
        }
        iInicio += iTamanho;
    }
    return aItens.filter((oItem) => oItem.status === "ATIVO");
}

async function handleDuimp(oUrl, res) {
    const sAmbientePU = oUrl.searchParams.get("ambiente");
    const sPerfilPU = oUrl.searchParams.get("perfil") || "";
    const sClientId = oUrl.searchParams.get("clientId");
    const sClientSecret = oUrl.searchParams.get("clientSecret");
    const sNumero = oUrl.searchParams.get("numero");
    if (!sAmbientePU || !sClientId || !sClientSecret || !sNumero) {
        sendJson(res, 400, { message: "Parâmetros obrigatórios ausentes (ambiente/clientId/clientSecret/numero)." });
        return;
    }
    try {
        const sBase = sAmbientePU.replace(/\/$/, "");
        const oToken = await getAccessToken(sAmbientePU, sPerfilPU, sClientId, sClientSecret);
        const oVersao = await getDuimpVersao(sBase, oToken, sNumero);
        const iVersao = Number(oVersao.versao);
        const oDuimp = await puGet(sBase, oToken, `/duimp-api/api/ext/duimp/${encodeURIComponent(sNumero)}/${iVersao}`);
        const aItens = await getDuimpItens(sBase, oToken, sNumero, iVersao);
        sendJson(res, 200, { duimp: oDuimp, itens: aItens });
    } catch (oError) {
        console.error(`[pucomex-middleware] duimp ${oError.status || 500}:`, oError.message);
        sendJson(res, oError.status || 500, oError.body && typeof oError.body === "object" ? oError.body : { message: oError.message });
    }
}

// Mirrors the B1 original's ReadDuimp.GetProdutosFromPUParallel (ReadDuimp.cs:82-120) — one call
// to /catp/api/ext/produto per unique product code, capped at 5 concurrent requests.
async function getProdutos(sBase, oToken, sCnpj, aCodigos) {
    const CONCURRENCY = 5;
    const aProdutos = [];
    const aErros = [];
    let iNext = 0;

    async function worker() {
        for (;;) {
            const iIndex = iNext++;
            if (iIndex >= aCodigos.length) {
                return;
            }
            const iCodigo = aCodigos[iIndex];
            try {
                const vResponse = await puGet(sBase, oToken, `/catp/api/ext/produto?cpfCnpjRaiz=${encodeURIComponent(sCnpj)}&codigo=${iCodigo}`);
                const oProduto = Array.isArray(vResponse) ? vResponse[0] : vResponse;
                if (oProduto) {
                    aProdutos.push(oProduto);
                }
            } catch (oError) {
                aErros.push(`Produto ${iCodigo}: ${oError.message}`);
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, aCodigos.length) }, worker));
    return { produtos: aProdutos, erros: aErros };
}

async function handleProdutos(oUrl, res) {
    const sAmbientePU = oUrl.searchParams.get("ambiente");
    const sPerfilPU = oUrl.searchParams.get("perfil") || "";
    const sClientId = oUrl.searchParams.get("clientId");
    const sClientSecret = oUrl.searchParams.get("clientSecret");
    const sCnpj = oUrl.searchParams.get("cnpj");
    const aCodigos = (oUrl.searchParams.get("codigos") || "").split(",").map((s) => s.trim()).filter(Boolean).map(Number);
    if (!sAmbientePU || !sClientId || !sClientSecret || !sCnpj || aCodigos.length === 0) {
        sendJson(res, 400, { message: "Parâmetros obrigatórios ausentes (ambiente/clientId/clientSecret/cnpj/codigos)." });
        return;
    }
    try {
        const sBase = sAmbientePU.replace(/\/$/, "");
        const oToken = await getAccessToken(sAmbientePU, sPerfilPU, sClientId, sClientSecret);
        const oResult = await getProdutos(sBase, oToken, sCnpj, aCodigos);
        sendJson(res, 200, oResult);
    } catch (oError) {
        console.error(`[pucomex-middleware] produtos ${oError.status || 500}:`, oError.message);
        sendJson(res, oError.status || 500, { message: oError.message });
    }
}

module.exports = async function () {
    return async function pucomexMiddleware(req, res, next) {
        const oUrl = new URL(req.url, "http://localhost");

        if (oUrl.pathname === "/pucomex-server/duimp") {
            await handleDuimp(oUrl, res);
            return;
        }
        if (oUrl.pathname === "/pucomex-server/produtos") {
            await handleProdutos(oUrl, res);
            return;
        }
        next();
    };
};
