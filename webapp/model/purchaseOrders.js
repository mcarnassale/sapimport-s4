sap.ui.define([
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator"
], (Filter, FilterOperator) => {
	"use strict";

	/**
	 * Leitura de pedidos de compra na API REAL do S/4HANA Cloud (api_purchaseorder_2, OData V4 —
	 * Communication Arrangement SAP_COM_0053), modelo "po". Devolve objetos PLANOS com os nomes de
	 * campo da API, mais alguns derivados (marcados abaixo), no formato que "Inserir Pedidos" e o
	 * "Calcular FOB" consomem — a estrutura real (cabeçalho → _PurchaseOrderItem →
	 * _PurchaseOrderScheduleLineTP, nome/país do fornecedor em _SupplierAddress) fica só aqui.
	 *
	 * Decimais chegam como string (o V4 manda IEEE754Compatible=true) — convertidos para número.
	 */

	const ITEM_SELECT = "PurchaseOrder,PurchaseOrderItem,Material,PurchaseOrderItemText,Plant,"
		+ "OrderQuantity,PurchaseOrderQuantityUnit,NetPriceAmount,NetPriceQuantity,DocumentCurrency,NetAmount,"
		+ "PurchasingDocumentDeletionCode,SupplierMaterialNumber,ItemNetWeight,ItemWeightUnit,BR_NCM";
	const SCHEDULE_EXPAND = "_PurchaseOrderScheduleLineTP($select=OpenPurchaseOrderQuantity)";
	const NOT_DELETED = "PurchasingDocumentDeletionCode eq ''";

	/**
	 * Item da API → linha plana. Derivados:
	 *  - UnitPrice: NetPriceAmount é o preço por NetPriceQuantity (unidade de preço), não por unidade.
	 *  - OpenQuantity: soma de OpenPurchaseOrderQuantity das linhas de remessa (≙ OpenQty da POR1).
	 *  - InvoicedQuantity: sempre 0 — a API de pedido não traz histórico de fatura (precisaria da API
	 *    de fatura de fornecedor, fora do Communication Arrangement atual).
	 */
	function toLine(oItem) {
		const fPriceQty = Number(oItem.NetPriceQuantity) || 1;
		const aSchedule = oItem._PurchaseOrderScheduleLineTP || [];
		return {
			PurchaseOrder: oItem.PurchaseOrder,
			PurchaseOrderItem: oItem.PurchaseOrderItem,
			Material: oItem.Material,
			PurchaseOrderItemText: oItem.PurchaseOrderItemText,
			Plant: oItem.Plant,
			OrderQuantity: Number(oItem.OrderQuantity) || 0,
			PurchaseOrderQuantityUnit: oItem.PurchaseOrderQuantityUnit,
			NetPriceAmount: Number(oItem.NetPriceAmount) || 0,
			UnitPrice: (Number(oItem.NetPriceAmount) || 0) / fPriceQty,
			DocumentCurrency: oItem.DocumentCurrency,
			NetAmount: Number(oItem.NetAmount) || 0,
			PurchasingDocumentDeletionCode: oItem.PurchasingDocumentDeletionCode,
			SupplierMaterialNumber: oItem.SupplierMaterialNumber,
			ItemNetWeight: Number(oItem.ItemNetWeight) || 0,
			ItemWeightUnit: oItem.ItemWeightUnit,
			BR_NCM: oItem.BR_NCM,
			OpenQuantity: aSchedule.reduce((fSum, oLine) => fSum + (Number(oLine.OpenPurchaseOrderQuantity) || 0), 0),
			InvoicedQuantity: 0
		};
	}

	function toHeader(oOrder) {
		const oAddress = oOrder._SupplierAddress || {};
		return {
			PurchaseOrder: oOrder.PurchaseOrder,
			Supplier: oOrder.Supplier,
			SupplierName: oAddress.OrganizationName1 || "",
			SupplierCountry: oAddress.Country || "",
			CompanyCode: oOrder.CompanyCode,
			PurchaseOrderDate: oOrder.PurchaseOrderDate,
			DocumentCurrency: oOrder.DocumentCurrency
		};
	}

	async function requestAll(oModel, sPath, aFilters, mParameters, iMax) {
		const aContexts = await oModel.bindList(sPath, null, [], aFilters, mParameters).requestContexts(0, iMax);
		return aContexts.map((oCtx) => oCtx.getObject());
	}

	/**
	 * Busca do "Inserir Pedidos": pedidos não excluídos de fornecedor estrangeiro (país do endereço do
	 * fornecedor ≠ BR, mesma regra do original), com total (soma de NetAmount) e nº de itens em aberto
	 * calculados dos itens não excluídos.
	 */
	async function searchOpenForeignOrders(oModel, { dateFrom, dateTo, supplier }) {
		const aFilters = [
			new Filter("PurchaseOrderDeletionCode", FilterOperator.EQ, ""),
			new Filter("_SupplierAddress/Country", FilterOperator.NE, "BR")
		];
		if (dateFrom) {
			aFilters.push(new Filter("PurchaseOrderDate", FilterOperator.GE, dateFrom));
		}
		if (dateTo) {
			aFilters.push(new Filter("PurchaseOrderDate", FilterOperator.LE, dateTo));
		}
		if (supplier) {
			aFilters.push(new Filter("Supplier", FilterOperator.Contains, supplier));
		}
		const aOrders = await requestAll(oModel, "/PurchaseOrder", aFilters, {
			$select: "PurchaseOrder,Supplier,CompanyCode,PurchaseOrderDate,DocumentCurrency",
			$expand: "_SupplierAddress($select=OrganizationName1,Country),"
				+ `_PurchaseOrderItem($select=NetAmount;$filter=${NOT_DELETED};$expand=${SCHEDULE_EXPAND})`,
			$orderby: "PurchaseOrder desc"
		}, 100);
		return aOrders.map((oOrder) => {
			const aLines = (oOrder._PurchaseOrderItem || []).map(toLine);
			return Object.assign(toHeader(oOrder), {
				NetAmount: aLines.reduce((fSum, oLine) => fSum + oLine.NetAmount, 0),
				OpenItemCount: aLines.filter((oLine) => oLine.OpenQuantity > 0).length
			});
		});
	}

	/** Cabeçalho de um pedido (com nome/país do fornecedor), ou null se não existir */
	async function getOrder(oModel, sPurchaseOrder) {
		const aOrders = await requestAll(oModel, "/PurchaseOrder", [new Filter("PurchaseOrder", FilterOperator.EQ, sPurchaseOrder)], {
			$select: "PurchaseOrder,Supplier,CompanyCode,PurchaseOrderDate,DocumentCurrency",
			$expand: "_SupplierAddress($select=OrganizationName1,Country)"
		}, 1);
		return aOrders.length > 0 ? toHeader(aOrders[0]) : null;
	}

	/** Itens (linhas planas, ver toLine) de um ou mais pedidos; bNotDeletedOnly ignora os excluídos */
	async function getLines(oModel, aPurchaseOrders, bNotDeletedOnly) {
		if (aPurchaseOrders.length === 0) {
			return [];
		}
		const aFilters = [new Filter({
			filters: aPurchaseOrders.map((s) => new Filter("PurchaseOrder", FilterOperator.EQ, s)),
			and: false
		})];
		if (bNotDeletedOnly) {
			aFilters.push(new Filter("PurchasingDocumentDeletionCode", FilterOperator.EQ, ""));
		}
		const aItems = await requestAll(oModel, "/PurchaseOrderItem", aFilters, { $select: ITEM_SELECT, $expand: SCHEDULE_EXPAND }, 10000);
		return aItems.map(toLine);
	}

	return { searchOpenForeignOrders, getOrder, getLines };
});
