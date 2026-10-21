sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/core/BusyIndicator",
    "sap/ui/model/json/JSONModel",
    "acx/sapimport/s4/model/models",
    "acx/sapimport/s4/model/cboSetup"
], (UIComponent, BusyIndicator, JSONModel, models, cboSetup) => {
    "use strict";

    return UIComponent.extend("acx.sapimport.s4.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // No dbInfo/sqlConvert wiring (unlike the B1 sapimport project's Component.js): that was
            // SAP B1 HANA-vs-SQL-Server SQL-dialect detection, meaningless for S/4HANA Cloud.
            // schemaVersion/schemaMigrations (B1 creating its own tables at startup) has no S/4
            // equivalent either — the structure is the Custom Business Objects YY1_ACX_* (created by
            // `npm run create-cbos` in dev, Extensibility Template at customers). What survives is
            // the startup check + data setup, in the app itself (model/cboSetup.js: all CBOs exist,
            // creates the IMPICFG '001' row, like Inicio.cs did). The RAP backend's ImpSetup check
            // (model/backendCheck.js) is no longer used since every screen moved to the CBOs.
            this._checkBackend();
        },

        async _checkBackend() {
            BusyIndicator.show(0);
            const oResult = await cboSetup.run(this);
            BusyIndicator.hide();

            const oBackend = Object.assign({}, oResult);
            if (this.getModel("backend")) {
                this.getModel("backend").setData(oBackend);
            } else {
                this.setModel(new JSONModel(oBackend), "backend");
            }
            if (oResult.state === "ok") {
                this.getRouter().initialize();
                return;
            }
            // Sem roteamento: o app fica só na tela de status até o backend ser corrigido
            this.getRouter().getTargets().display("TargetBackendStatus");
        },

        /** Chamado pela tela de status ("Tentar novamente"), só quando o resultado é retryable */
        retryBackendCheck() {
            return this._checkBackend();
        }
    });
});
