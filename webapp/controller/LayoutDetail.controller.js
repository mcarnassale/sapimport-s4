sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "acx/sapimport/s4/model/cbo"
], /**
 * @param {typeof import("sap/ui/core/mvc/Controller").default} Controller
 * @param {typeof import("sap/ui/model/json/JSONModel").default} JSONModel
 * @param {typeof import("sap/ui/model/Filter").default} Filter
 * @param {typeof import("sap/ui/model/FilterOperator").default} FilterOperator
 * @param {typeof import("sap/m/MessageToast").default} MessageToast
 * @param {typeof import("sap/m/MessageBox").default} MessageBox
 * @param {object} cbo
 */ (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox, cbo) => {
    "use strict";

    // Ported from ../sapimport/webapp/controller/LayoutDetail.controller.js. Differences:
    //  - fields bind without a "U_" prefix (CBO fields, not B1 UDFs).
    //  - Y/N checkboxes bind two-way via acx.sapimport.s4.model.YesNoType instead of the
    //    original's manual formatter + select-event + _setYesNo dance — simpler, same pattern
    //    already used in Configs/ProcessosDetail.
    //  - _onRouteMatched binds by SAP_UUID (the real CBO key) instead of the B1 business key
    //    Code — LayoutList already navigates with the real key at hand, no
    //    encodeURIComponent(Code) indirection needed.
    //  - CreateDate/UpdateDate dropped — same standard-B1-UDO-admin-field gap already flagged for
    //    IMPICFG/IMPPCH (ensureField never captures them, so they don't exist on IMPLAYType).
    //  - IMPLAY vem do CBO YY1_ACX_IMPLAY do S/4 (modelo "implay", OData V2, default desta view).
    //    "Order" virou "OrderNum" e "Default" virou "IsDefault" (palavras reservadas em CDS, nomes
    //    herdados do backend RAP). As colunas de mapeamento são Edm.Decimal(10,0) no CBO (não há
    //    tipo inteiro), por isso string.

    const MAPPING_FIELDS = [
        "Invoice", "DocNum", "LineVisi", "DocEntry", "LineNum", "Quantity",
        "ItemCode", "WheightU", "Price", "Wheight", "LineTotal", "Container",
        "Frete", "Seguro", "Model", "OrderNum", "OrderItem", "BatchNum",
        "Serie", "PrdDate", "ExpDate", "PartNumber"
    ];

    return Controller.extend("acx.sapimport.s4.controller.LayoutDetail", {
        onInit() {
            this.getView().setModel(new JSONModel({ newMode: false }), "detailView");
            this.getView().setModel(this.getOwnerComponent().getModel("implay"));
            this.getOwnerComponent().getRouter().getRoute("RouteLayoutDetail").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched(oEvent) {
            const sUuid = oEvent.getParameter("arguments").uuid;
            const bNewMode = sUuid === "new";
            this.getView().getModel("detailView").setProperty("/newMode", bNewMode);
            // Descarta o que ficou pendente de uma visita anterior (ex.: "Novo" + voltar pela seta
            // sem Cancelar) — senão o próximo Salvar gravaria esse resto junto.
            cbo.reset(this.getView().getModel());

            if (bNewMode) {
                const oInitialData = {
                    Code: "",
                    Name: "",
                    FirstLine: "N",
                    IsDefault: "N",
                    SetPeso: "N",
                    SetPrice: "N",
                    BatchExplode: "N",
                    FileType: cbo.toInteger(1),
                    FilePath: "",
                    LayoutType: "0"
                };
                // 0 = coluna não mapeada
                MAPPING_FIELDS.forEach((sField) => { oInitialData[sField] = cbo.toInteger(0); });

                // unbindElement: depois de abrir um Layout existente (bindElement), o element
                // binding tem prioridade sobre setBindingContext — sem soltar, "Novo" continuava
                // preso ao Layout anterior.
                this.getView().unbindElement();
                const oContext = this.getView().getModel().createEntry(cbo.source(this.getOwnerComponent(), "IMPLAY").path, {
                    properties: oInitialData
                });
                this.getView().setBindingContext(oContext);
            } else {
                this.getView().bindElement({ path: cbo.keyPath("IMPLAY", sUuid) });
            }
        },

        onNavBack() {
            this.getOwnerComponent().getRouter().navTo("RouteLayoutList");
        },

        async onSave() {
            // (A releitura das 5 CheckBox Y/N antes de salvar, que existia aqui, era contorno de
            // uma corrida do V4 — escrita em contexto transiente antes da 1ª leitura. No V2 o bind
            // bidirecional grava síncrono no modelo; não precisa mais.)
            const oModel = this.getView().getModel();
            const oContext = this.getView().getBindingContext();
            const sCode = oContext.getProperty("Code");
            const sDefault = oContext.getProperty("IsDefault");

            try {
                // Só pode haver um Layout "Padrão" por vez — se este acabou de virar Default,
                // desmarca todos os outros que já eram.
                if (sDefault === "Y") {
                    const aOthers = await cbo.read(oModel, cbo.source(this.getOwnerComponent(), "IMPLAY").path, {
                        filters: [new Filter([
                            new Filter("IsDefault", FilterOperator.EQ, "Y"),
                            new Filter("Code", FilterOperator.NE, sCode)
                        ], true)],
                        urlParameters: { $select: "SAP_UUID,Code,IsDefault" }
                    });
                    aOthers.forEach((oOther) => oModel.setProperty(cbo.keyPath("IMPLAY", oOther.SAP_UUID) + "/IsDefault", "N"));
                }

                await cbo.submit(oModel);
                MessageToast.show(this._t("layoutSaveSuccess"));
                this.onNavBack();
            } catch (oError) {
                MessageBox.error(this._t("layoutSaveError", [oError.message || String(oError)]));
            }
        },

        onCancel() {
            cbo.reset(this.getView().getModel());
            this.onNavBack();
        },

        _t(sKey, aArgs) {
            return this.getView().getModel("i18n").getResourceBundle().getText(sKey, aArgs);
        }
    });
});
