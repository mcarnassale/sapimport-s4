sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "acx/sapimport/s4/model/cbo",
    "acx/sapimport/s4/model/lookups"
], /**
 * @param {typeof import("sap/ui/core/mvc/Controller").default} Controller
 * @param {typeof import("sap/m/MessageToast").default} MessageToast
 * @param {typeof import("sap/m/MessageBox").default} MessageBox
 * @param {typeof import("sap/m/SelectDialog").default} SelectDialog
 * @param {typeof import("sap/m/StandardListItem").default} StandardListItem
 * @param {typeof import("sap/ui/model/Filter").default} Filter
 * @param {typeof import("sap/ui/model/FilterOperator").default} FilterOperator
 * @param {object} cbo
 * @param {object} lookups
 */ (Controller, MessageToast, MessageBox, SelectDialog, StandardListItem, Filter, FilterOperator, cbo, lookups) => {
    "use strict";

    // Ported from ../sapimport/webapp/controller/DespCalc.controller.js. Differences:
    //  - fields bind without a "U_" prefix (CBO fields, not B1 UDFs): Code/Name/Currency/Valor.
    //  - the B1 original's Code/U_Code split (an Input on U_Code with a change handler that
    //    copies the first typed value into the real key field "Code", since B1's UDT Service
    //    Layer requires the business key set exactly once at creation and doesn't expose it as a
    //    directly editable bound field) is dropped entirely — this CBO keys on SAP_UUID, not
    //    Code, so Code is just a plain business field like any other and binds directly, no
    //    mirroring dance needed. onCodeChange has no equivalent here.
    //  - onRecalculate (already just a placeholder comment in the B1 original — "depends on how
    //    the Processos.cs business logic will be exposed to Fiori", button disabled there too)
    //    is now onNotImplemented, showing a toast instead of doing nothing silently.
    //  - DESPCAL vem do CBO YY1_ACX_DESPCAL do S/4 (modelo "despcal", OData V2, default desta
    //    view); o value help de moeda, das moedas do S/4 (model/lookups), por isso o diálogo recebe
    //    esse modelo explicitamente.

    return Controller.extend("acx.sapimport.s4.controller.DespCalc", {
        onInit() {
            this.getView().setModel(this.getOwnerComponent().getModel("despcal"));
            this.getOwnerComponent().getRouter().getRoute("RouteDespCalc").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched() {
            this._discardChanges();
        },

        // Reexibe as linhas escondidas por onDeleteRow (a lista reaproveita os itens ao reler, então
        // não voltam sozinhas) e relê do backend
        _discardChanges() {
            cbo.reset(this.getView().getModel());
            const oTable = this.byId("despCalcTable");
            oTable.getItems().forEach((oItem) => oItem.setVisible(true));
            oTable.getBinding("items").refresh(true);
        },

        onNavBack() {
            this.getOwnerComponent().getRouter().navTo("RouteInicio");
        },

        onAddRow() {
            const oBinding = this.byId("despCalcTable").getBinding("items");
            oBinding.create({
                Code: "",
                Name: "",
                Currency: "",
                Valor: cbo.toDecimal(0)
            });
        },

        onDeleteRow(oEvent) {
            const oItem = oEvent.getParameter("listItem");
            oItem.getBindingContext().delete({ groupId: "changes" });
            // No V2 a linha só sai da lista depois do submit; esconde já, como o V4 fazia
            oItem.setVisible(false);
        },

        onCurrencyValueHelp(oEvent) {
            const oInput = oEvent.getSource();
            if (!this._oCurrencyDialog) {
                const oSource = lookups.source(this.getOwnerComponent(), "Currencies");
                this._oCurrencyDialog = new SelectDialog({
                    title: this._t("despCalcColCurrency"),
                    items: {
                        path: oSource.path,
                        template: new StandardListItem({
                            title: `{${oSource.titleField}}`,
                            description: `{${oSource.descField}}`
                        })
                    },
                    search: (oSearchEvent) => {
                        const sValue = oSearchEvent.getParameter("value");
                        oSearchEvent.getSource().getBinding("items").filter(sValue ? new Filter({
                            filters: [oSource.titleField, oSource.descField].map((sField) => new Filter(sField, FilterOperator.Contains, sValue)),
                            and: false
                        }) : []);
                    },
                    confirm: (oConfirmEvent) => {
                        const oSelectedItem = oConfirmEvent.getParameter("selectedItem");
                        if (oSelectedItem && this._oCurrencyInput) {
                            this._oCurrencyInput.setValue(oSelectedItem.getTitle());
                        }
                    }
                });
                this._oCurrencyDialog.setModel(oSource.model);
                this.getView().addDependent(this._oCurrencyDialog);
            }
            this._oCurrencyInput = oInput;
            this._oCurrencyDialog.open();
        },

        _t(sKey, aArgs) {
            return this.getView().getModel("i18n").getResourceBundle().getText(sKey, aArgs);
        },

        async onSave() {
            try {
                await cbo.submit(this.getView().getModel());
                MessageToast.show(this._t("despCalcSaveSuccess"));
            } catch (oError) {
                MessageBox.error(this._t("despCalcSaveError", [oError.message || String(oError)]));
            }
        },

        onCancel() {
            this._discardChanges();
        },

        onNotImplemented() {
            MessageToast.show(this._t("notImplemented"));
        }
    });
});
