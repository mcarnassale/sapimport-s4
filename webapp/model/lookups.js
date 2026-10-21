sap.ui.define([
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/base/i18n/Localization",
	"acx/sapimport/s4/model/cbo"
], (Filter, FilterOperator, Localization, cbo) => {
	"use strict";

	/**
	 * Cadastros vindos das APIs padrão do S/4HANA Cloud (OData V2), no lugar dos lookups
	 * placeholder do mainService: fornecedores (API_BUSINESS_PARTNER, SAP_COM_0008, modelo "bp") e
	 * produtos (API_PRODUCT_SRV, SAP_COM_0009, modelo "product"). As telas continuam pensando nos
	 * nomes antigos (entidade "BusinessPartners"/"Items", campos CardCode/ItemCode...): este módulo
	 * traduz — value help via source(), leituras de cálculo via getItemsInfo()/getSuppliers().
	 * Lookup que não está aqui continua no mainService.
	 */

	const MAX_ROWS = 5000;

	// Descrição do produto no idioma de logon (A_ProductDescription tem uma linha por idioma)
	const language = () => Localization.getSAPLogonLanguage();

	// Value helps: entidade antiga -> { modelo, caminho, campo título/descrição, filtros fixos }
	const VALUE_HELPS = {
		BusinessPartners: { model: "bp", path: "/A_Supplier", titleField: "Supplier", descField: "SupplierName" },
		Items: {
			model: "product", path: "/A_ProductDescription", titleField: "Product", descField: "ProductDescription",
			filters: () => [new Filter("Language", FilterOperator.EQ, language())]
		}
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

	return { source, getItemsInfo, existingProducts, getSuppliers };
});
