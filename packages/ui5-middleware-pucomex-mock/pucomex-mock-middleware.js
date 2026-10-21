// Mock counterpart of ../sapimport (B1)'s packages/ui5-middleware-pucomex/pucomex-middleware.js —
// that one runs the real two-step PUCOMEX Siscomex call (Node-side, to dodge a browser CORS/
// x-csrf-token rejection); this one fakes both routes with canned fixture data for local dev,
// same idea as scripts/generate-mock.js's OData fixtures but for this plain-REST side-channel
// (sap-fe-mockserver only mocks OData, not arbitrary routes like /pucomex-server/*).
//
// Registered ONLY in ui5-mock.yaml (not ui5.yaml) — a real deployment talks to the actual PUCOMEX
// gov API via a middleware like the B1 original's, not this one.
//
// Used by ProcessosDetail.controller.js's onAnexoPO2DI (DUIMP branch) — see
// docs/po2di-duimp-port-notes.md for the full feature port notes.

// One DUIMP with 3 items: 2 ATIVO (should end up in the resulting Pedido) + 1 CANCELADO (must be
// filtered out, same as the real _buildPedidoListFromDuimpItens logic expects). Item 1's produto
// code (1001) maps to an EXISTING Items fixture row (ITEM-001) to exercise the "update" path;
// item 2's (1002) maps to a NEW code (ITEM-999-NOVO) to exercise the "create" path.
const DUIMP_FIXTURE = {
    duimp: {
        numero: "26BR00000000001",
        identificacao: { importador: { ni: "61438206000192" } }
    },
    itens: [
        {
            status: "ATIVO",
            produto: { codigo: 1001 },
            mercadoria: {
                pesoLiquido: 250,
                quantidadeComercial: 100,
                valorUnitarioMoedaNegociada: 25.5,
                moedaNegociada: { codigo: "USD" }
            }
        },
        {
            status: "ATIVO",
            produto: { codigo: 1002 },
            mercadoria: {
                pesoLiquido: 15,
                quantidadeComercial: 50,
                valorUnitarioMoedaNegociada: 199.9,
                moedaNegociada: { codigo: "USD" }
            }
        },
        {
            status: "CANCELADO",
            produto: { codigo: 1003 },
            mercadoria: {
                pesoLiquido: 999,
                quantidadeComercial: 999,
                valorUnitarioMoedaNegociada: 999,
                moedaNegociada: { codigo: "USD" }
            }
        }
    ]
};

const PRODUTOS_FIXTURE = {
    1001: { codigo: 1001, codigosInterno: ["ITEM-001"], ncm: "85171231", descricao: "Componente Eletronico DUIMP", denominacao: "Componente Eletrônico" },
    1002: { codigo: 1002, codigosInterno: ["ITEM-999-NOVO"], ncm: "84713012", descricao: "Peca Nova DUIMP", denominacao: "Peça Industrial Nova" },
    1003: { codigo: 1003, codigosInterno: ["ITEM-CANCELADO"], ncm: "00000000", descricao: "Nao deveria aparecer", denominacao: "Nao deveria aparecer" }
};

function sendJson(res, iStatus, oBody) {
    const sJson = JSON.stringify(oBody);
    res.writeHead(iStatus, { "Content-Type": "application/json; charset=utf-8" });
    res.end(sJson);
}

function handleDuimp(oUrl, res) {
    const sAmbientePU = oUrl.searchParams.get("ambiente");
    const sClientId = oUrl.searchParams.get("clientId");
    const sClientSecret = oUrl.searchParams.get("clientSecret");
    const sNumero = oUrl.searchParams.get("numero");
    if (!sAmbientePU || !sClientId || !sClientSecret || !sNumero) {
        sendJson(res, 400, { message: "Parâmetros obrigatórios ausentes (ambiente/clientId/clientSecret/numero)." });
        return;
    }
    // Ecoa o número real recebido (o DINum digitado em iDINum na view) em vez do valor fixo do
    // fixture — a resposta continua sendo dado fake (itens/produto inventados), mas pelo menos o
    // número da DUIMP bate com o que o usuário realmente digitou, em vez de sempre mostrar
    // "26BR00000000001" não importa o que foi pedido.
    sendJson(res, 200, { ...DUIMP_FIXTURE, duimp: { ...DUIMP_FIXTURE.duimp, numero: sNumero } });
}

function handleProdutos(oUrl, res) {
    const sAmbientePU = oUrl.searchParams.get("ambiente");
    const sClientId = oUrl.searchParams.get("clientId");
    const sClientSecret = oUrl.searchParams.get("clientSecret");
    const sCnpj = oUrl.searchParams.get("cnpj");
    const aCodigos = (oUrl.searchParams.get("codigos") || "").split(",").map((s) => s.trim()).filter(Boolean).map(Number);
    if (!sAmbientePU || !sClientId || !sClientSecret || !sCnpj || aCodigos.length === 0) {
        sendJson(res, 400, { message: "Parâmetros obrigatórios ausentes (ambiente/clientId/clientSecret/cnpj/codigos)." });
        return;
    }
    const aProdutos = aCodigos.map((iCodigo) => PRODUTOS_FIXTURE[iCodigo]).filter(Boolean);
    sendJson(res, 200, { produtos: aProdutos, erros: [] });
}

module.exports = async function () {
    return async function pucomexMockMiddleware(req, res, next) {
        const oUrl = new URL(req.url, "http://localhost");

        if (oUrl.pathname === "/pucomex-server/duimp") {
            handleDuimp(oUrl, res);
            return;
        }
        if (oUrl.pathname === "/pucomex-server/produtos") {
            handleProdutos(oUrl, res);
            return;
        }
        next();
    };
};
