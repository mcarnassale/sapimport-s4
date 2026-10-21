/* global module */
/**
 * Mock (sap-fe-mockserver) do comportamento do BO IMPPCH que não vem do metadata: no backend RAP o
 * DocEntry é numerado na criação (determination SetDocEntry + objeto de numeração ZIMPPCH, ver
 * scripts/generate-abap.js) e é somente leitura. Aqui: maior DocEntry + 1. Os dados iniciais
 * continuam em IMPPCH.json (sem getInitialDataSet aqui, o mockserver lê o .json).
 */
module.exports = {
	onBeforeAddEntry: async function (keyValues, data, odataRequest) {
		const aEntries = await this.base.getAllEntries(odataRequest);
		const iMax = aEntries.reduce((iAcc, oEntry) => Math.max(iAcc, Number(oEntry.DocEntry) || 0), 0);
		data.DocEntry = iMax + 1;
	}
};
