sap.ui.define([
    "sap/ui/core/mvc/Controller"
], /**
 * @param {typeof import("sap/ui/core/mvc/Controller").default} Controller
 */ (Controller) => {
    "use strict";

    // Ported from ../sapimport/webapp/controller/PreCalcList.controller.js. Same pattern as
    // LayoutList: navigates by SAP_UUID (the real CBO key), not the B1 business key Code.

    return Controller.extend("acx.sapimport.s4.controller.PreCalcList", {
        onInit() {
            // IMPIPRV vem do CBO YY1_ACX_IMPIPRV do S/4 (modelo "impiprv", OData V2, default da view)
            this.getView().setModel(this.getOwnerComponent().getModel("impiprv"));
            this.getOwnerComponent().getRouter().getRoute("RoutePreCalcList").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched() {
            const oBinding = this.byId("preCalcList").getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
        },

        onNavBack() {
            this.getOwnerComponent().getRouter().navTo("RouteInicio");
        },

        onAdd() {
            this.getOwnerComponent().getRouter().navTo("RoutePreCalcDetail", { uuid: "new" });
        },

        onOpen(oEvent) {
            const sUuid = oEvent.getSource().getBindingContext().getProperty("SAP_UUID");
            this.getOwnerComponent().getRouter().navTo("RoutePreCalcDetail", { uuid: sUuid });
        }
    });
});
