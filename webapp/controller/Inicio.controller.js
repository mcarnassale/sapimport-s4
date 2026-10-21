sap.ui.define([
    "sap/ui/core/mvc/Controller"
], /**
 * @param {typeof import("sap/ui/core/mvc/Controller").default} Controller
 */ (Controller) => {
    "use strict";

    // Ported from ../sapimport/webapp/controller/Inicio.controller.js. All 5 original tiles now
    // exist (Processos/DespCalc/Layout/PreCalc/Configs). Don't confuse "PreCalc" here (this
    // standalone IMPIPRV/PRV1 master-list screen) with the already-ported "Pré Cálculo" tab
    // inside ProcessosDetail — same underlying CBO, different screen.

    return Controller.extend("acx.sapimport.s4.controller.Inicio", {
        onNavToConfigs() {
            this.getOwnerComponent().getRouter().navTo("RouteConfigs");
        },

        onNavToProcessosList() {
            this.getOwnerComponent().getRouter().navTo("RouteProcessosList");
        },

        onNavToDespCalc() {
            this.getOwnerComponent().getRouter().navTo("RouteDespCalc");
        },

        onNavToLayoutList() {
            this.getOwnerComponent().getRouter().navTo("RouteLayoutList");
        },

        onNavToPreCalcList() {
            this.getOwnerComponent().getRouter().navTo("RoutePreCalcList");
        }
    });
});
