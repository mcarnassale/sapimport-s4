sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "acx/sapimport/s4/model/cbo"
], /**
 * @param {typeof import("sap/ui/core/mvc/Controller").default} Controller
 * @param {typeof import("sap/ui/model/Filter").default} Filter
 * @param {typeof import("sap/ui/model/FilterOperator").default} FilterOperator
 * @param {typeof import("sap/m/MessageBox").default} MessageBox
 * @param {typeof import("sap/m/MessageToast").default} MessageToast
 * @param {object} cbo
 */ (Controller, Filter, FilterOperator, MessageBox, MessageToast, cbo) => {
    "use strict";

    // Ported from ../sapimport/webapp/controller/ProcessosList.controller.js. Differences from
    // that version, all documented in docs/processos-list-port-notes.md:
    //  - fields bind without a "U_" prefix (CBO fields, not B1 UDFs): ProcNum/DINum/AgentCode/
    //    Layout/StatusProc.
    //  - the C# NotExisteDoc delete-blocking checks (DELETE_BLOCK_CHECKS in the B1 controller)
    //    were dropped entirely — they ran raw SQL against B1-only tables (PCH1/RPC1/OJDT/PDN1/
    //    INV1/DLN1/POR1) via the SQLQueries endpoint, neither of which exists for a CBO. Deleting
    //    a Processo here does not check for linked documents yet — see the port notes for what a
    //    real fix needs.
    //  - onOpen navigates by SAP_UUID (the row's real OData key), not DocEntry — matches how
    //    ProcessosDetail._onRouteMatched binds directly by key, no filter-first indirection
    //    needed since the real key is already at hand here.
    //  - delete is a plain OData DELETE of the CBO instance (cbo.remove) instead of a raw
    //    serviceLayer fetch — the CBO deletes the 6 child nodes along with it.

    return Controller.extend("acx.sapimport.s4.controller.ProcessosList", {
        onInit() {
            // IMPPCH vem do CBO YY1_ACX_IMPPCH do S/4 (modelo "imppch", OData V2) — default da view
            this.getView().setModel(this.getOwnerComponent().getModel("imppch"));
            this.getOwnerComponent().getRouter().getRoute("RouteProcessosList").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched() {
            const oBinding = this.byId("procList").getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
        },

        onSearch() {
            const sQuery = this.byId("procListSearchField").getValue();
            const sField = this.byId("procListSearchFieldSelect").getSelectedKey();
            const oBinding = this.byId("procList").getBinding("items");
            if (!oBinding) {
                return;
            }
            if (!sQuery) {
                oBinding.filter([]);
                return;
            }
            if (sField === "all") {
                oBinding.filter(new Filter({
                    filters: [
                        new Filter("ProcNum", FilterOperator.Contains, sQuery),
                        new Filter("DINum", FilterOperator.Contains, sQuery),
                        new Filter("AgentCode", FilterOperator.Contains, sQuery),
                        new Filter("Layout", FilterOperator.Contains, sQuery),
                        new Filter("StatusProc", FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            } else {
                oBinding.filter(new Filter(sField, FilterOperator.Contains, sQuery));
            }
        },

        onNavBack() {
            this.getOwnerComponent().getRouter().navTo("RouteInicio");
        },

        onAdd() {
            this.getOwnerComponent().getRouter().navTo("RouteProcessosDetail", { uuid: "new" });
        },

        onOpen(oEvent) {
            const sUuid = oEvent.getSource().getBindingContext().getProperty("SAP_UUID");
            this.getOwnerComponent().getRouter().navTo("RouteProcessosDetail", { uuid: sUuid });
        },

        _t(sKey, aArgs) {
            return this.getView().getModel("i18n").getResourceBundle().getText(sKey, aArgs);
        },

        async onDeleteProcesso(oEvent) {
            // O Button de excluir fica dentro do CustomListItem — pega o contexto do próprio
            // item da lista (o Button não tem binding context próprio).
            const oContext = oEvent.getSource().getParent().getBindingContext();
            const sProcNum = oContext.getProperty("ProcNum") || oContext.getProperty("SAP_UUID");

            MessageBox.confirm(this._t("procListDeleteConfirm", [sProcNum]), {
                title: this._t("procListDeleteConfirmTitle"),
                onClose: async (sAction) => {
                    if (sAction !== MessageBox.Action.OK) {
                        return;
                    }
                    try {
                        await cbo.remove(oContext.getModel(), oContext.getPath());
                        MessageToast.show(this._t("procListDeleteSuccess"));
                    } catch (oError) {
                        MessageBox.error(this._t("procListDeleteError", [oError.message || String(oError)]));
                    }
                }
            });
        }
    });
});
