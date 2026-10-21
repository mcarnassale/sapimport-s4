/* global module */
/**
 * Mock (sap-fe-mockserver) do BO ImpSetup — simula GetStatus/RunSetup do backend RAP real
 * (ver scripts/abap-setup-templates.js). Escrito à mão; generate-mock.js só gera o metadata.
 *
 * Para simular cenários da checagem de startup, subir o mock com:
 *   MOCK_BACKEND_TARGET=<n>   versão alvo do "backend" (padrão 3). Menor que a exigida pelo app
 *                             (REQUIRED_BACKEND_VERSION em model/backendCheck.js) = "desatualizado".
 *   MOCK_BACKEND_CURRENT=<n>  versão já aplicada ao subir (padrão 0 = instalação nova, RunSetup roda).
 * O estado vale enquanto o servidor estiver de pé, como o resto do mock. O mockserver chama os
 * métodos com this = este objeto (é onde ele pendura this.base), então o estado fica em this.
 */
module.exports = {
	setupId: "SAPIMPORT",
	target: Number(process.env.MOCK_BACKEND_TARGET || 3),
	current: Number(process.env.MOCK_BACKEND_CURRENT || 0),

	getInitialDataSet: function () {
		return this.current > 0 ? [{ SetupId: this.setupId, SchemaVersion: this.current }] : [];
	},

	status: function (iApplied) {
		return { AppliedSteps: iApplied, CurrentVersion: this.current, TargetVersion: this.target };
	},

	executeAction: async function (actionDefinition, actionData, keys, odataRequest) {
		switch (actionDefinition.name) {
			case "GetStatus":
				return this.status(0);
			case "RunSetup": {
				const iApplied = Math.max(this.target - this.current, 0);
				if (iApplied > 0) {
					const bExists = this.current > 0;
					this.current = this.target;
					const oRow = { SetupId: this.setupId, SchemaVersion: this.current };
					if (bExists) {
						await this.base.updateEntry({ SetupId: this.setupId }, oRow, odataRequest);
					} else {
						await this.base.addEntry(oRow, odataRequest);
					}
				}
				return this.status(iApplied);
			}
			default:
				throw new Error(`Operação não simulada no mock: ${actionDefinition.name}`);
		}
	}
};
