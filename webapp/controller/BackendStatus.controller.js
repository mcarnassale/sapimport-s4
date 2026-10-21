sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], (Controller, JSONModel) => {
    "use strict";

    // Estado da checagem (model/backendCheck.js, model/cboSetup.js) -> ilustração + chaves i18n de
    // título/descrição
    const STATES = {
        notInstalled: { illustration: "sapIllus-UnableToLoad", key: "backendNotInstalled" },
        outdated: { illustration: "sapIllus-UnableToLoad", key: "backendOutdated" },
        unreachable: { illustration: "sapIllus-Connection", key: "backendUnreachable" },
        setupFailed: { illustration: "sapIllus-ErrorScreen", key: "backendSetupFailed" },
        cboNotInstalled: { illustration: "sapIllus-UnableToLoad", key: "backendCboNotInstalled" },
        cboSetupFailed: { illustration: "sapIllus-ErrorScreen", key: "backendCboSetupFailed" }
    };

    return Controller.extend("acx.sapimport.s4.controller.BackendStatus", {
        onInit() {
            this.getView().setModel(new JSONModel({}), "view");
            this._updateTexts();
        },

        _updateTexts() {
            const oComponent = this.getOwnerComponent();
            const oBackend = oComponent.getModel("backend").getData();
            const oBundle = oComponent.getModel("i18n").getResourceBundle();
            const oState = STATES[oBackend.state] || STATES.unreachable;
            const oStatus = oBackend.status || {};

            let sDescription = oBundle.getText(`${oState.key}Text`, [
                oStatus.TargetVersion, oBackend.requiredVersion, oStatus.CurrentVersion
            ]);
            if (oBackend.error) {
                sDescription += `\n\n${oBackend.error}`;
            }
            this.getView().getModel("view").setData({
                illustration: oState.illustration,
                title: oBundle.getText(`${oState.key}Title`),
                description: sDescription,
                retryable: !!oBackend.retryable
            });
        },

        async onRetry() {
            // Se der certo, o Component inicializa o roteamento e a rota inicial substitui esta tela
            await this.getOwnerComponent().retryBackendCheck();
            this._updateTexts();
        }
    });
});
