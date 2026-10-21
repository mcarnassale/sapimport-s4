sap.ui.define([
    "sap/ui/core/mvc/Controller"
], /**
 * @param {typeof import("sap/ui/core/mvc/Controller").default} Controller
 */ (Controller) => {
    "use strict";

    // Ported from ../sapimport/webapp/controller/LayoutList.controller.js. Differences:
    //  - onOpenLayout navigates by SAP_UUID (the row's real OData key), not Code — same pattern
    //    already established in ProcessosList/ProcessosDetail: the real key is already at hand
    //    here, no need for the B1 original's encodeURIComponent(Code) business-key indirection.

    return Controller.extend("acx.sapimport.s4.controller.LayoutList", {
        onInit() {
            // IMPLAY vem do CBO YY1_ACX_IMPLAY do S/4 (modelo "implay", OData V2, default da view)
            this.getView().setModel(this.getOwnerComponent().getModel("implay"));
            this.getOwnerComponent().getRouter().getRoute("RouteLayoutList").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched() {
            const oBinding = this.byId("layoutList").getBinding("items");
            if (oBinding) {
                oBinding.refresh();
            }
        },

        onNavBack() {
            this.getOwnerComponent().getRouter().navTo("RouteInicio");
        },

        onAdd() {
            this.getOwnerComponent().getRouter().navTo("RouteLayoutDetail", { uuid: "new" });
        },

        onOpenLayout(oEvent) {
            const sUuid = oEvent.getSource().getBindingContext().getProperty("SAP_UUID");
            this.getOwnerComponent().getRouter().navTo("RouteLayoutDetail", { uuid: sUuid });
        }
    });
});
