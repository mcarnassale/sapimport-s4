sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "acx/sapimport/s4/model/cbo"
], /**
 * @param {typeof import("sap/ui/core/mvc/Controller").default} Controller
 * @param {typeof import("sap/ui/model/json/JSONModel").default} JSONModel
 * @param {typeof import("sap/ui/model/Filter").default} Filter
 * @param {typeof import("sap/ui/model/FilterOperator").default} FilterOperator
 * @param {typeof import("sap/m/SelectDialog").default} SelectDialog
 * @param {typeof import("sap/m/StandardListItem").default} StandardListItem
 * @param {typeof import("sap/m/MessageToast").default} MessageToast
 * @param {typeof import("sap/m/MessageBox").default} MessageBox
 * @param {object} cbo
 */ (Controller, JSONModel, Filter, FilterOperator, SelectDialog, StandardListItem, MessageToast, MessageBox, cbo) => {
    "use strict";

    // Ported from ../sapimport/webapp/controller/PreCalcDetail.controller.js. IMPIPRV/PRV1 vêm do
    // CBO YY1_ACX_IMPIPRV do S/4 (OData V2, nó filho "Itens" = navegação to_Itens). O documento
    // (cabeçalho + linhas) é editado num JSONModel local — default desta view — e gravado por
    // diferença no Salvar (cbo.readDocument/saveDocument): no V2 uma linha excluída só sai da
    // lista depois do submit, e a sap.ui.table não tem como escondê-la. Volta, por outro motivo,
    // ao array local que o original B1 também usava.
    //
    // Other differences:
    //  - fields bind without a "U_" prefix (CBO fields, not B1 UDFs).
    //  - onOpen/_onRouteMatched navigate/bind by SAP_UUID, not the B1 business key Code — same
    //    pattern as LayoutList/LayoutDetail.
    //  - CreateNF binds two-way via acx.sapimport.s4.model.YesNoType instead of the original's
    //    formatter + select-event + manual setProperty.
    //  - onDespCodeValueHelp targets the "AdditionalExpenses" lookup entity (ExpensCode/Name),
    //    not a separate "LandedCostsCodes" one — same substitution already made for
    //    ProcessosDetail's Pré Cálculo tab (see docs/processos-detail-port-notes.md round 5): one
    //    canonical placeholder lookup for this concept across the project, not two.
    //  - onCardCodeValueHelp drops the B1 original's CardType eq 'cSupplier' filter — this
    //    project's "BusinessPartners" placeholder lookup entity only has CardCode/CardName, no
    //    CardType field to filter on.
    //  - value helps e "Todas Desp" leem lookups do mainService (_getLookupModel / setModel nos
    //    diálogos).

    const NAV_LINES = "to_Itens";
    const NAVS = [NAV_LINES];

    const LINE_FIELDS = [
        "DespCode", "DespName", "TpCalc", "Currency", "PerDesp", "DesBase",
        "VrDesp", "QdeDias", "VrMax", "VrMim", "CardCode", "CardName",
        "ItemCode", "ItemName", "CreateNF"
    ];

    // Decimais como string (V2); QdeDias é inteiro no contrato, Edm.Decimal(10,0) no CBO
    const DEFAULT_LINE = {
        DespCode: "", DespName: "", TpCalc: "", Currency: "", PerDesp: cbo.toDecimal(0), DesBase: "",
        VrDesp: cbo.toDecimal(0), QdeDias: cbo.toInteger(0), VrMax: cbo.toDecimal(0), VrMim: cbo.toDecimal(0),
        CardCode: "", CardName: "", ItemCode: "", ItemName: "", CreateNF: "N"
    };

    return Controller.extend("acx.sapimport.s4.controller.PreCalcDetail", {
        onInit() {
            this.getView().setModel(new JSONModel({ newMode: false }), "detailView");
            // Documento em edição (JSONModel local, default da view; bindings relativos a "/")
            const oDocModel = new JSONModel({ [NAV_LINES]: [] });
            this.getView().setModel(oDocModel);
            this.getView().setBindingContext(oDocModel.createBindingContext("/"));
            this.getOwnerComponent().getRouter().getRoute("RoutePreCalcDetail").attachPatternMatched(this._onRouteMatched, this);
        },

        _getCboSource() {
            return cbo.source(this.getOwnerComponent(), "IMPIPRV");
        },

        _setDocument(oDoc, oOriginal) {
            this._oOriginal = oOriginal;
            this.getView().getModel().setData(oDoc);
            this.byId("linesTable").clearSelection();
        },

        async _onRouteMatched(oEvent) {
            const sUuid = oEvent.getParameter("arguments").uuid;
            const bNewMode = sUuid === "new";
            this.getView().getModel("detailView").setProperty("/newMode", bNewMode);

            if (bNewMode) {
                const oInitialData = this._oDuplicateData || { Code: "", Name: "" };
                const aInitialLines = this._oDuplicateLines || [];
                this._oDuplicateData = null;
                this._oDuplicateLines = null;
                this._setDocument(Object.assign({}, oInitialData, { [NAV_LINES]: aInitialLines }), undefined);
                return;
            }

            this._setDocument({ Code: "", Name: "", [NAV_LINES]: [] }, undefined);
            this.getView().setBusy(true);
            try {
                const oDoc = await cbo.readDocument(this._getCboSource().model, cbo.keyPath("IMPIPRV", sUuid), NAVS);
                this._setDocument(oDoc, cbo.cloneDocument(oDoc));
            } catch (oError) {
                MessageBox.error(this._t("preCalcSaveError", [oError.message || String(oError)]));
            } finally {
                this.getView().setBusy(false);
            }
        },

        onNavBack() {
            this.getOwnerComponent().getRouter().navTo("RoutePreCalcList");
        },

        _getLines() {
            return this.getView().getModel().getProperty("/" + NAV_LINES);
        },

        _setLines(aLines) {
            this.getView().getModel().setProperty("/" + NAV_LINES, aLines);
        },

        onAddLine() {
            this._setLines(this._getLines().concat({ ...DEFAULT_LINE }));
        },

        onDeleteLine() {
            const oTable = this.byId("linesTable");
            const aSelected = new Set(oTable.getSelectedIndices());
            this._setLines(this._getLines().filter((oLine, iIndex) => !aSelected.has(iIndex)));
            oTable.clearSelection();
        },

        _setLineProperty(oRowContext, sProperty, vValue) {
            oRowContext.getModel().setProperty(sProperty, vValue, oRowContext);
        },

        onDespCodeValueHelp(oEvent) {
            this._openLineValueHelp(oEvent, {
                key: "despCode",
                title: this._t("preCalcColDesp"),
                path: "/AdditionalExpenses",
                titleField: "ExpensCode",
                descField: "Name",
                apply: (oRowContext, oItem) => {
                    this._setLineProperty(oRowContext, "DespCode", oItem.getTitle());
                    this._setLineProperty(oRowContext, "DespName", oItem.getDescription());
                }
            });
        },

        onCurrencyValueHelp(oEvent) {
            this._openLineValueHelp(oEvent, {
                key: "currency",
                title: this._t("preCalcColCurrency"),
                path: "/Currencies",
                titleField: "Code",
                descField: "Name",
                apply: (oRowContext, oItem) => {
                    this._setLineProperty(oRowContext, "Currency", oItem.getTitle());
                }
            });
        },

        onCardCodeValueHelp(oEvent) {
            this._openLineValueHelp(oEvent, {
                key: "cardCode",
                title: this._t("preCalcColCard"),
                path: "/BusinessPartners",
                titleField: "CardCode",
                descField: "CardName",
                apply: (oRowContext, oItem) => {
                    this._setLineProperty(oRowContext, "CardCode", oItem.getTitle());
                    this._setLineProperty(oRowContext, "CardName", oItem.getDescription());
                }
            });
        },

        onItemCodeValueHelp(oEvent) {
            this._openLineValueHelp(oEvent, {
                key: "itemCode",
                title: this._t("preCalcColItem"),
                path: "/Items",
                titleField: "ItemCode",
                descField: "ItemName",
                apply: (oRowContext, oItem) => {
                    this._setLineProperty(oRowContext, "ItemCode", oItem.getTitle());
                    this._setLineProperty(oRowContext, "ItemName", oItem.getDescription());
                }
            });
        },

        _openLineValueHelp(oEvent, oConfig) {
            this._oLineValueHelpDialogs = this._oLineValueHelpDialogs || {};
            const sRowContextKey = "_" + oConfig.key + "RowContext";

            let oDialog = this._oLineValueHelpDialogs[oConfig.key];
            if (!oDialog) {
                oDialog = new SelectDialog({
                    title: oConfig.title,
                    items: {
                        path: oConfig.path,
                        template: new StandardListItem({
                            title: "{" + oConfig.titleField + "}",
                            description: "{" + oConfig.descField + "}"
                        })
                    },
                    search: (oSearchEvent) => {
                        const sValue = oSearchEvent.getParameter("value");
                        oSearchEvent.getSource().getBinding("items").filter(
                            new Filter(oConfig.titleField, FilterOperator.Contains, sValue)
                        );
                    },
                    confirm: (oConfirmEvent) => {
                        const oSelectedItem = oConfirmEvent.getParameter("selectedItem");
                        if (oSelectedItem) {
                            oConfig.apply(this[sRowContextKey], oSelectedItem);
                        }
                    }
                });
                // Lookups (despesas, moedas, parceiros, itens) vêm do mainService, não do documento local
                oDialog.setModel(this._getLookupModel());
                this.getView().addDependent(oDialog);
                this._oLineValueHelpDialogs[oConfig.key] = oDialog;
            }

            this[sRowContextKey] = oEvent.getSource().getBindingContext();
            oDialog.open();
        },

        onDuplicate() {
            const sName = this.getView().getModel().getProperty("/Name");
            const aNewLines = this._getLines().map((oSourceLine) => {
                const oNewLine = {};
                LINE_FIELDS.forEach((sField) => { oNewLine[sField] = oSourceLine[sField]; });
                return oNewLine;
            });

            this._oDuplicateData = { Code: "", Name: sName };
            this._oDuplicateLines = aNewLines;
            this.getOwnerComponent().getRouter().navTo("RoutePreCalcDetail", { uuid: "new" });
        },

        _getLookupModel() {
            return this.getOwnerComponent().getModel();
        },

        async onAllExpenses() {
            const oModel = this._getLookupModel();
            const aLines = this._getLines().slice();
            const aExistingCodes = aLines.map((oLine) => oLine.DespCode);

            const oExpensesBinding = oModel.bindList("/AdditionalExpenses", undefined, undefined, undefined, { $select: "ExpensCode,Name" });
            const aExpenses = await oExpensesBinding.requestContexts();

            aExpenses.forEach((oExpenseContext) => {
                const sCode = oExpenseContext.getProperty("ExpensCode");
                if (sCode && aExistingCodes.indexOf(sCode) === -1) {
                    aLines.push({
                        ...DEFAULT_LINE,
                        DespCode: sCode,
                        DespName: oExpenseContext.getProperty("Name")
                    });
                    aExistingCodes.push(sCode);
                }
            });
            this._setLines(aLines);
        },

        async onSave() {
            const { model: oModel, path: sSetPath } = this._getCboSource();
            const oDoc = this.getView().getModel().getData();
            this.getView().setBusy(true);
            try {
                await cbo.saveDocument(oModel, sSetPath, oDoc, this._oOriginal, NAVS);
                MessageToast.show(this._t("preCalcSaveSuccess"));
                this.onNavBack();
            } catch (oError) {
                cbo.reset(oModel);
                MessageBox.error(this._t("preCalcSaveError", [oError.message || String(oError)]));
            } finally {
                this.getView().setBusy(false);
            }
        },

        onCancel() {
            // Nada a desfazer no backend: a edição só existe no documento local
            this.onNavBack();
        },

        _t(sKey, aArgs) {
            return this.getView().getModel("i18n").getResourceBundle().getText(sKey, aArgs);
        }
    });
});
