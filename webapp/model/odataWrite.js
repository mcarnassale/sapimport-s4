sap.ui.define([
	"sap/ui/core/Messaging"
], (Messaging) => {
	"use strict";

	/**
	 * Gravação no backend RAP (modelo "rap") — regras que o mock não cobrava e o RAP real cobra.
	 * Vale para create()/setProperty() diretos, sem binding type no meio (com binding type, o próprio
	 * tipo já converte).
	 */

	/**
	 * Valor para Edm.Decimal. O V4 manda IEEE754Compatible=true, então o RAP exige Decimal como
	 * STRING e recusa número ("invalid value '0'"). Arredonda na escala dos CBOs (19,4), senão uma
	 * conta como 0.1*3 vira 0.30000000000000004 e estoura a escala.
	 */
	function toDecimal(vValue) {
		return (Number(vValue) || 0).toFixed(4);
	}

	/**
	 * Converte vValue para o tipo Edm de sProperty no contexto (lido do metamodelo). Ex.: o título
	 * de um SelectDialog é sempre texto, e o RAP recusa texto num Edm.Int32. No RAP só datas são
	 * Nullable: vazio num inteiro vira 0.
	 */
	function toEdmValue(oContext, sProperty, vValue) {
		const oMetaModel = oContext.getModel().getMetaModel();
		const sType = oMetaModel.getObject(oMetaModel.getMetaPath(oContext.getPath() + "/" + sProperty) + "/$Type");
		switch (sType) {
			case "Edm.Int16":
			case "Edm.Int32":
			case "Edm.Byte":
			case "Edm.SByte":
				return vValue === "" || vValue === null || vValue === undefined ? 0 : Number(vValue);
			case "Edm.Decimal":
				return toDecimal(vValue);
			default:
				return vValue;
		}
	}

	/** Texto do erro mais recente que o backend devolveu (o V4 joga no Messaging central) */
	function lastBackendError() {
		const oLast = Messaging.getMessageModel().getData().filter((oMsg) => oMsg.getType() === "Error").pop();
		return oLast ? oLast.getMessage() : "";
	}

	/**
	 * submitBatch que de fato falha quando o backend recusa algo. O submitBatch do V4 só rejeita em
	 * falha de transporte: um request recusado vai pro Messaging e a mudança continua pendente — sem
	 * esse teste a tela dizia "salvo" com nada gravado. Rejeita com Error(texto do backend).
	 */
	async function submitOrThrow(oModel, sGroupId, sFallbackText) {
		await oModel.submitBatch(sGroupId);
		if (oModel.hasPendingChanges(sGroupId)) {
			throw new Error(lastBackendError() || sFallbackText);
		}
	}

	return { toDecimal, toEdmValue, lastBackendError, submitOrThrow };
});
