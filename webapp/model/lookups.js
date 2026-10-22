sap.ui.define([
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/base/i18n/Localization",
	"acx/sapimport/s4/model/cbo"
], (Filter, FilterOperator, Sorter, Localization, cbo) => {
	"use strict";

	/**
	 * Cadastros do S/4HANA Cloud (OData V2), no lugar dos lookups placeholder do mainService:
	 *  - APIs padrão: fornecedores (API_BUSINESS_PARTNER, SAP_COM_0008, modelo "bp") e produtos
	 *    (API_PRODUCT_SRV, SAP_COM_0009, modelo "product");
	 *  - Custom CDS Views nossas (npm run create-cds, cenário YY1_ACX_SAPIMPORT): moedas, taxas de
	 *    câmbio, códigos de imposto, contas contábeis e depósitos (modelos "currency", "exchrate",
	 *    "taxcode", "glaccount", "storloc").
	 * As telas continuam pensando nos nomes antigos (entidade "BusinessPartners"/"Items"/
	 * "Currencies"..., campos CardCode/ItemCode/Code...): este módulo traduz — value help via
	 * source(), leituras de cálculo via getItemsInfo()/getSuppliers()/getRateToday().
	 * Lookup que não está aqui continua no mainService.
	 */

	const MAX_ROWS = 5000;

	/**
	 * Organização brasileira no tenant (customizing — em cada cliente podem ser outros valores):
	 * procedimento de cálculo de imposto (os códigos de imposto se repetem por país), plano de
	 * contas e centro cujos depósitos o app oferece; moeda local.
	 */
	const BRAZIL = { taxProcedure: "ABRX01", chartOfAccounts: "YCBR", plant: "1410", currency: "BRL" };

	// Descrição do produto no idioma de logon (A_ProductDescription tem uma linha por idioma)
	const language = () => Localization.getSAPLogonLanguage();

	// Value helps: entidade antiga -> { modelo, caminho, campo título/descrição, filtros fixos }
	const VALUE_HELPS = {
		BusinessPartners: { model: "bp", path: "/A_Supplier", titleField: "Supplier", descField: "SupplierName" },
		Items: {
			model: "product", path: "/A_ProductDescription", titleField: "Product", descField: "ProductDescription",
			filters: () => [new Filter("Language", FilterOperator.EQ, language())]
		},
		Currencies: { model: "currency", path: "/YY1_ACX_CURRENCY", titleField: "Currency", descField: "CurrencyName" },
		SalesTaxCodes: {
			model: "taxcode", path: "/YY1_ACX_TAXCODE", titleField: "TaxCode", descField: "TaxCodeName",
			filters: () => [new Filter("TaxCalculationProcedure", FilterOperator.EQ, BRAZIL.taxProcedure)]
		},
		ChartOfAccounts: {
			model: "glaccount", path: "/YY1_ACX_GLACCOUNT", titleField: "GLAccount", descField: "GLAccountName",
			filters: () => [new Filter("ChartOfAccounts", FilterOperator.EQ, BRAZIL.chartOfAccounts)]
		},
		Warehouses: {
			model: "storloc", path: "/YY1_ACX_STORLOC", titleField: "StorageLocation", descField: "StorageLocationName",
			filters: () => [new Filter("Plant", FilterOperator.EQ, BRAZIL.plant)]
		},
		// CBOs nossos (npm run create-cbos), mantidos pelo usuário no app gerado do próprio CBO:
		// despesas adicionais e utilização da NF ("Usage" é reservado no CBO: UsageName)
		AdditionalExpenses: { model: "expense", path: "/YY1_ACX_EXPENSE", titleField: "ExpensCode", descField: "Name" },
		NotaFiscalUsage: { model: "usage", path: "/YY1_ACX_USAGE", titleField: "ID", descField: "UsageName" }
	};

	/** { model, path, titleField, descField, filters } do value help de sEntity, ou undefined */
	function source(oComponent, sEntity) {
		const oDef = VALUE_HELPS[sEntity];
		return oDef && {
			model: oComponent.getModel(oDef.model), path: oDef.path, titleField: oDef.titleField,
			descField: oDef.descField, filters: oDef.filters ? oDef.filters() : []
		};
	}

	const anyOf = (sField, aValues) => new Filter({ filters: aValues.map((s) => new Filter(sField, FilterOperator.EQ, s)), and: false });

	// Peso líquido do produto por unidade básica, em kg (KG/G/LB); 0 = sem peso utilizável
	function netWeightKg(oProduct) {
		const fWeight = Number(oProduct.NetWeight) || 0;
		switch (oProduct.WeightUnit) {
			case "KG": return fWeight;
			case "G": return fWeight / 1000;
			case "LB": return fWeight * 0.45359237;
			default: return 0;
		}
	}

	/**
	 * Dados de cálculo de produtos, no formato do antigo lookup Items: { [código]: { ItemCode,
	 * ItemName, PurchaseUnitWeight1 (kg por unidade básica), PurchaseWeightUnit1 (3 = kg, como no
	 * B1; ausente se o produto não tem peso), NCMCode } }. NCM (ConsumptionTaxCtrlCode) é por
	 * centro — sPlant é o centro do item do pedido; sem centro, sem NCM. Produto que não existe no
	 * S/4 não aparece no resultado.
	 */
	async function getItemsInfo(oComponent, aCodes, sPlant) {
		const aUnique = [...new Set(aCodes.filter(Boolean))];
		if (!aUnique.length) {
			return {};
		}
		const oModel = oComponent.getModel("product");
		const [aProducts, aTexts, aPlants] = await Promise.all([
			cbo.read(oModel, "/A_Product", { filters: [anyOf("Product", aUnique)], urlParameters: { $select: "Product,NetWeight,WeightUnit", $top: MAX_ROWS } }),
			cbo.read(oModel, "/A_ProductDescription", {
				filters: [anyOf("Product", aUnique), new Filter("Language", FilterOperator.EQ, language())],
				urlParameters: { $select: "Product,ProductDescription", $top: MAX_ROWS }
			}),
			sPlant ? cbo.read(oModel, "/A_ProductPlant", {
				filters: [anyOf("Product", aUnique), new Filter("Plant", FilterOperator.EQ, sPlant)],
				urlParameters: { $select: "Product,ConsumptionTaxCtrlCode", $top: MAX_ROWS }
			}) : []
		]);
		const oText = Object.fromEntries(aTexts.map((o) => [o.Product, o.ProductDescription]));
		const oNcm = Object.fromEntries(aPlants.map((o) => [o.Product, o.ConsumptionTaxCtrlCode]));
		const oResult = {};
		aProducts.forEach((oProduct) => {
			const fKg = netWeightKg(oProduct);
			oResult[oProduct.Product] = Object.assign({
				ItemCode: oProduct.Product,
				ItemName: oText[oProduct.Product] || "",
				NCMCode: oNcm[oProduct.Product] || ""
			}, fKg > 0 ? { PurchaseUnitWeight1: fKg, PurchaseWeightUnit1: 3 } : {});
		});
		return oResult;
	}

	/** Conjunto dos códigos (de aCodes) que existem como produto no S/4 */
	async function existingProducts(oComponent, aCodes) {
		const aUnique = [...new Set(aCodes.filter(Boolean))];
		if (!aUnique.length) {
			return new Set();
		}
		const aProducts = await cbo.read(oComponent.getModel("product"), "/A_Product", {
			filters: [anyOf("Product", aUnique)], urlParameters: { $select: "Product", $top: MAX_ROWS }
		});
		return new Set(aProducts.map((o) => o.Product));
	}

	/**
	 * Fornecedores no formato do antigo lookup BusinessPartners ([{ CardCode, CardName }]),
	 * ordenados por nome. bForeignOnly: só com endereço fora do Brasil (o filtro Country <> 'BR'
	 * do original B1) — país vem do endereço do parceiro de negócio (A_Supplier não tem país), que no
	 * S/4 tem o mesmo número do fornecedor.
	 */
	async function getSuppliers(oComponent, bForeignOnly) {
		const oModel = oComponent.getModel("bp");
		const aSuppliers = await cbo.read(oModel, "/A_Supplier", { urlParameters: { $select: "Supplier,SupplierName", $top: MAX_ROWS } });
		let oAllowed;
		if (bForeignOnly) {
			const aAddresses = await cbo.read(oModel, "/A_BusinessPartnerAddress", {
				filters: [new Filter("Country", FilterOperator.NE, "BR")],
				urlParameters: { $select: "BusinessPartner", $top: MAX_ROWS * 4 }
			});
			oAllowed = new Set(aAddresses.map((o) => o.BusinessPartner));
		}
		return aSuppliers
			.filter((o) => !oAllowed || oAllowed.has(o.Supplier))
			.map((o) => ({ CardCode: o.Supplier, CardName: o.SupplierName }))
			.sort((a, b) => a.CardName.localeCompare(b.CardName));
	}

	// Taxa de uma linha de câmbio do S/4: valor em "to" de 1 unidade de "from". ExchangeRate
	// negativo = cotação indireta (como o S/4 guarda: -5,028 em BRL->USD = 1 USD custa 5,028 BRL);
	// as unidades (NumberOf...Units) são os fatores de conversão do par.
	function rateOf(oRow) {
		const fRate = Number(oRow.ExchangeRate) || 0;
		const fUnits = (Number(oRow.NumberOfTargetCurrencyUnits) || 1) / (Number(oRow.NumberOfSourceCurrencyUnits) || 1);
		if (!fRate) {
			return 0;
		}
		return (fRate > 0 ? fRate : 1 / -fRate) * fUnits;
	}

	async function latestRow(oModel, sFrom, sTo, oDate) {
		const [oRow] = await cbo.read(oModel, "/YY1_ACX_EXCHRATE", {
			filters: [
				new Filter("ExchangeRateType", FilterOperator.EQ, "M"),
				new Filter("SourceCurrency", FilterOperator.EQ, sFrom),
				new Filter("TargetCurrency", FilterOperator.EQ, sTo),
				new Filter("ExchangeRateEffectiveDate", FilterOperator.LE, oDate)
			],
			sorters: [new Sorter("ExchangeRateEffectiveDate", true)],
			urlParameters: { $top: 1 }
		});
		return oRow;
	}

	/**
	 * Taxa do dia (tipo M, cotação média) de sCurrency para a moeda local: quantos BRL vale 1 unidade
	 * de sCurrency em oDate (padrão: hoje). O S/4 pode ter a cotação cadastrada em qualquer um dos
	 * dois sentidos (no tenant, USD está em BRL->USD, indireta) — vale a mais recente dos dois.
	 * 0 = sem taxa cadastrada.
	 */
	async function getRateToday(oComponent, sCurrency, oDate) {
		if (!sCurrency) {
			return 0;
		}
		if (sCurrency === BRAZIL.currency) {
			return 1;
		}
		const oModel = oComponent.getModel("exchrate");
		const oAt = oDate || new Date();
		const [oDirect, oInverse] = await Promise.all([
			latestRow(oModel, sCurrency, BRAZIL.currency, oAt),
			latestRow(oModel, BRAZIL.currency, sCurrency, oAt)
		]);
		const fInverse = oInverse ? rateOf(oInverse) : 0;
		const aCandidates = [
			oDirect && { date: oDirect.ExchangeRateEffectiveDate, rate: rateOf(oDirect) },
			oInverse && fInverse && { date: oInverse.ExchangeRateEffectiveDate, rate: 1 / fInverse }
		].filter((o) => o && o.rate);
		aCandidates.sort((a, b) => b.date - a.date);
		return aCandidates.length ? aCandidates[0].rate : 0;
	}

	/** Despesas adicionais cadastradas, no formato do antigo lookup ([{ ExpensCode, Name }]) */
	async function getExpenses(oComponent) {
		const aRows = await cbo.read(oComponent.getModel("expense"), "/YY1_ACX_EXPENSE", {
			sorters: [new Sorter("ExpensCode")], urlParameters: { $select: "ExpensCode,Name", $top: MAX_ROWS }
		});
		return aRows.map((o) => ({ ExpensCode: o.ExpensCode, Name: o.Name }));
	}

	return { BRAZIL, source, getItemsInfo, existingProducts, getSuppliers, getRateToday, getExpenses };
});
