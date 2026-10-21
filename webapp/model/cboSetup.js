sap.ui.define([
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"acx/sapimport/s4/model/cbo"
], (Filter, FilterOperator, cbo) => {
	"use strict";

	/**
	 * Preparação de DADOS dos Custom Business Objects na abertura do app — equivalente, com CBO, ao
	 * que o Inicio.cs fazia no B1 (SetVersion/SetConfig) e o ImpSetup fazia no backend RAP. A
	 * ESTRUTURA (os CBOs em si) não é criada aqui: vem de `npm run create-cbos` (dev) ou de
	 * Extensibility Template (cliente); este módulo só confere que ela existe.
	 *
	 * Resolve sempre (nunca rejeita) com { state, error?, retryable? } no mesmo formato do
	 * backendCheck, para a tela BackendStatus:
	 *  - "ok"              pronto (linha de configuração criada se faltava)
	 *  - "cboNotInstalled" serviço do CBO inexistente (404) — CBO não criado / fora do cenário
	 *  - "unreachable"     não foi possível falar com o S/4 (rede, autenticação, 5xx...)
	 *  - "cboSetupFailed"  falhou ao gravar os dados iniciais
	 */

	// Linha única de configuração (IMPICFG Code='001'): Code/Name do Functions.SetVersion do B1 +
	// DefaultValue de cada UDF do [@ICFG] + os SetConfig da escada do Inicio.cs (Expenses,
	// CustoCOFM, MetodoBuscaItem). Mesmos valores que o ImpSetup v3 do RAP gravava.
	const ICFG_DEFAULTS = {
		Code: "001", Name: "sapimport",
		AlterQde: "Y", ByPrice: "N", CardVar: "N", Consolid: "N", CustoCOFM: "N", Debug: "N",
		DespaCNPJ: "N", DespPrev: "N", DfCtainer: "N", DIItem: "N", DispOrderComb: "1", EverKg: "N",
		Expenses: "N", Fast: "N", FreteSeg: "N", IntS4Hana: "N", INVNFRF: "N", InvNoRm: "N",
		IsUsage: "N", LcrPrsmd: "N", LoteFreeTextNFN: "N", MaxItemNF: "200", Meprev: "N",
		MetodoBuscaItem: "1", MetodoNac: "1", NewDocs: "N", NFDebit: "N", NFDebt: "N", NFFilha: "N",
		OverPC: "Y", PesoPed: "N", Precisao: cbo.toDecimal(0.01), ProgBar: "Y", RecolheAC: "N",
		RMClosePO: "N", RmvDraft: "N", TaxOnly: "N", TravaRM: "N", UsarWhsPedido: "N", VlrsDin: "N"
	};

	async function readIcfg(oModel, sPath) {
		return cbo.read(oModel, sPath, {
			filters: [new Filter("Code", FilterOperator.EQ, ICFG_DEFAULTS.Code)],
			urlParameters: { $select: "SAP_UUID" }
		});
	}

	async function run(oComponent) {
		// Todos os CBOs migrados, não só o IMPICFG: confere que existem e deixa o metamodelo V2
		// carregado (ele carrega assíncrono, e cbo.toEdmValue o consulta de forma síncrona)
		for (const sEntity of Object.keys(cbo.ENTITIES)) {
			const oCboModel = cbo.source(oComponent, sEntity).model;
			try {
				await oCboModel.metadataLoaded(true);
				await oCboModel.getMetaModel().loaded();
			} catch (oError) {
				// $metadata que falhou fica guardado no modelo — só recarregando o app
				const iStatus = Number(oError && oError.statusCode);
				return { state: iStatus === 404 ? "cboNotInstalled" : "unreachable", error: `${cbo.ENTITIES[sEntity].set}: ${oError && oError.message}` };
			}
		}

		const { model: oModel, path: sPath } = cbo.source(oComponent, "IMPICFG");

		let aRows;
		try {
			aRows = await readIcfg(oModel, sPath);
		} catch (oError) {
			return { state: "unreachable", error: oError.message, retryable: true };
		}
		if (aRows.length) {
			return { state: "ok" };
		}
		try {
			oModel.createEntry(sPath, { properties: ICFG_DEFAULTS });
			await cbo.submit(oModel);
		} catch (oError) {
			cbo.reset(oModel);
			// Outra sessão abrindo o app ao mesmo tempo pode ter criado a linha primeiro (Code é
			// chave do CBO, o 2º create é recusado) — se ela existe agora, está tudo certo.
			const aNow = await readIcfg(oModel, sPath).catch(() => []);
			if (!aNow.length) {
				return { state: "cboSetupFailed", error: oError.message, retryable: true };
			}
		}
		return { state: "ok" };
	}

	return { ICFG_DEFAULTS, run };
});
