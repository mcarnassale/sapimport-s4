sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "acx/sapimport/s4/model/cbo"
], /**
 * @param {typeof import("sap/ui/core/mvc/Controller").default} Controller
 * @param {typeof import("sap/ui/model/Filter").default} Filter
 * @param {typeof import("sap/ui/model/FilterOperator").default} FilterOperator
 * @param {typeof import("sap/m/SelectDialog").default} SelectDialog
 * @param {typeof import("sap/m/StandardListItem").default} StandardListItem
 * @param {typeof import("sap/m/MessageToast").default} MessageToast
 * @param {typeof import("sap/m/MessageBox").default} MessageBox
 * @param {object} cbo
 */ (Controller, Filter, FilterOperator, SelectDialog, StandardListItem, MessageToast, MessageBox, cbo) => {
    "use strict";

    // Ported from ../sapimport/webapp/controller/Configs.controller.js. Differences from that
    // version, all documented in docs/configs-port-notes.md:
    //  - value-help entity/field names (AdditionalExpenses/BusinessPartners/etc.) are PLACEHOLDER
    //    mock entities, not real S/4 API shapes (Decision 1) — same onValueHelp mechanism though,
    //    only the customData driving it differs.
    //  - onSavePUCredentials + the ClientId/Secret fields + crypto.js are dropped (Decision 2).
    //  - onNavBack goes to RouteInicio (the menu screen, added later — see
    //    docs/inicio-port-notes.md); _getServiceBaseUrl is still dropped, nothing here needs the
    //    raw service base URL now that onSavePUCredentials is gone.
    //  - custom fields bind without a "U_" prefix (CBO fields, not B1 UDFs).
    //  - IMPICFG vem do CBO YY1_ACX_IMPICFG do S/4 (modelo "impicfg", OData V2, default desta
    //    view); os value helps continuam no mainService (lookups), por isso os diálogos recebem
    //    esse modelo explicitamente. "Usage" virou "UsageCode" (palavra reservada em CDS, nome
    //    herdado do backend RAP). A linha Code='001' é criada na abertura do app
    //    (model/cboSetup.js, como o Inicio.cs do B1), não por esta tela.

    const VALUE_HELP_TITLES = {
        AdditionalExpenses: "Despesas Adicionais",
        NotaFiscalUsage: "Utilização",
        BusinessPartners: "Parceiros de Negócio",
        SalesTaxCodes: "Códigos de Imposto",
        ChartOfAccounts: "Plano de Contas",
        Items: "Itens",
        Warehouses: "Depósitos"
    };

    return Controller.extend("acx.sapimport.s4.controller.Configs", {
        onInit() {
            this.getView().setModel(this.getOwnerComponent().getModel("impicfg"));
            this.getOwnerComponent().getRouter().getRoute("RouteConfigs").attachPatternMatched(this._onRouteMatched, this);
        },

        // CBOs key on their own generated SAP_UUID, not the B1 business key (Code='001' here) —
        // see the "chaves não sobrevivem 1:1" note in ../../docs/cbo-design.md. The B1 original's
        // direct bindElement({path: "/IMPICFG('001')"}) doesn't work against this shape (Code
        // isn't the EDM key), so resolve the singleton row by filtering on Code first, then bind
        // to whatever its real key path turns out to be.
        async _onRouteMatched() {
            const oModel = this.getView().getModel();
            cbo.reset(oModel);
            let aRows;
            try {
                aRows = await cbo.read(oModel, cbo.source(this.getOwnerComponent(), "IMPICFG").path, {
                    filters: [new Filter("Code", FilterOperator.EQ, "001")],
                    urlParameters: { $select: "SAP_UUID" }
                });
            } catch {
                aRows = [];
            }
            if (aRows.length === 0) {
                MessageBox.error(this.getView().getModel("i18n").getResourceBundle().getText("configsSaveError", ["IMPICFG Code='001' não encontrado"]));
                return;
            }
            this.getView().bindElement({ path: cbo.keyPath("IMPICFG", aRows[0].SAP_UUID) });
        },

        onNavBack() {
            this.getOwnerComponent().getRouter().navTo("RouteInicio");
        },

        onValueHelp(oEvent) {
            const oInput = oEvent.getSource();
            const sEntity = oInput.data("vhEntity");
            const sTitleField = oInput.data("vhTitleField");
            const sDescField = oInput.data("vhDescField");
            const sProperty = oInput.data("vhProperty");

            this._oValueHelpDialogs = this._oValueHelpDialogs || {};
            let oDialog = this._oValueHelpDialogs[sEntity];
            if (!oDialog) {
                oDialog = new SelectDialog({
                    title: VALUE_HELP_TITLES[sEntity] || sEntity,
                    items: {
                        path: "/" + sEntity,
                        template: new StandardListItem({
                            title: "{" + sTitleField + "}",
                            description: "{" + sDescField + "}"
                        })
                    },
                    search: (oSearchEvent) => {
                        const sValue = oSearchEvent.getParameter("value");
                        oSearchEvent.getSource().getBinding("items").filter(
                            new Filter(sTitleField, FilterOperator.Contains, sValue)
                        );
                    },
                    confirm: (oConfirmEvent) => {
                        const oSelectedItem = oConfirmEvent.getParameter("selectedItem");
                        if (oSelectedItem && this._oCurrentValueHelpProperty) {
                            const oContext = this.getView().getBindingContext();
                            // Converte pelo tipo Edm do campo (título do diálogo é sempre texto)
                            oContext.getModel().setProperty(this._oCurrentValueHelpProperty,
                                cbo.toEdmValue(oContext, this._oCurrentValueHelpProperty, oSelectedItem.getTitle()), oContext);
                        }
                    }
                });
                // Lookups vêm do mainService; sem isto o diálogo herdaria o modelo "impicfg" da view
                oDialog.setModel(this.getOwnerComponent().getModel());
                this.getView().addDependent(oDialog);
                this._oValueHelpDialogs[sEntity] = oDialog;
            }

            this._oCurrentValueHelpProperty = sProperty;
            oDialog.open();
        },

        async onSave() {
            try {
                await cbo.submit(this.getView().getModel());
                MessageToast.show(this.getView().getModel("i18n").getResourceBundle().getText("configsSaveSuccess"));
            } catch (oError) {
                MessageBox.error(this.getView().getModel("i18n").getResourceBundle().getText("configsSaveError", [oError.message || oError]));
            }
        },

        onCancel() {
            cbo.reset(this.getView().getModel());
        }
    });
});
