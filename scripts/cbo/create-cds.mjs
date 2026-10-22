/**
 * Cria e publica no tenant S/4HANA Cloud as Custom CDS Views (cenário "External API") de que o
 * sapimport precisa para cadastros sem API padrão liberada: códigos de imposto, contas contábeis,
 * depósitos, moedas e taxas de câmbio. Cada view vira um serviço OData V2 YY1_ACX_<X>_CDS, que
 * entra no cenário de comunicação YY1_ACX_SAPIMPORT (manual, como os CBOs).
 *
 * Mesmo esquema do create-cbos: usa o serviço INTERNO do app Custom CDS Views pela sessão do
 * Chrome de debug — ferramenta de DEV; nos clientes as views vão por Extensibility Template.
 * Idempotente: view já publicada é pulada (não altera views existentes).
 *
 * Uso: npm run cbo-browser   (1x: abre o Chrome de debug; fazer login no S/4)
 *      npm run create-cds [-- TAXCODE CURRENCY ...]   (sem argumentos = todas)
 */
import { connect, guid, ZERO, CDS_VIEW_SERVICE } from "./designer.mjs";

const PREFIX = process.env.CBO_PREFIX || "ACX_";

// primary: fonte principal (os campos-chave dela entram sozinhos); text: associação de texto no
// idioma de logon (join pelos campos "on" + Language = idioma da sessão); fields: campos a mais
// da fonte principal; textFields: campos da associação de texto
const VIEWS = [
	{
		name: "TAXCODE", label: "Codigos de imposto",
		primary: "I_TaxCode",
		text: { source: "I_TaxCodeText", on: ["TaxCalculationProcedure", "TaxCode"], fields: ["TaxCodeName"] }
	},
	{
		name: "GLACCOUNT", label: "Contas contabeis",
		primary: "I_GLAccountInChartOfAccounts",
		text: { source: "I_GLAccountText", on: ["ChartOfAccounts", "GLAccount"], fields: ["GLAccountName"] }
	},
	{
		name: "STORLOC", label: "Depositos",
		primary: "I_StorageLocation",
		fields: ["StorageLocationName"]
	},
	{
		name: "CURRENCY", label: "Moedas",
		primary: "I_Currency",
		fields: ["Decimals"],
		text: { source: "I_CurrencyText", on: ["Currency"], fields: ["CurrencyName"] }
	},
	{
		name: "EXCHRATE", label: "Taxas de cambio",
		primary: "I_ExchangeRate",
		fields: ["ExchangeRate", "NumberOfSourceCurrencyUnits", "NumberOfTargetCurrencyUnits"]
	}
];

const hex = (sUuid) => sUuid.replace(/-/g, "").toUpperCase();

const only = process.argv.slice(2).map((a) => a.toUpperCase());
const plan = VIEWS.filter((v) => !only.length || only.includes(v.name));
if (only.length && plan.length !== only.length) {
	throw new Error(`View desconhecida. Válidas: ${VIEWS.map((v) => v.name).join(", ")}`);
}

const api = await connect(CDS_VIEW_SERVICE);
const { call, list } = api;

function failOn(label, messages) {
	const aErrors = messages.filter((m) => m.severity === "error");
	if (aErrors.length) {
		throw new Error(`${label}: ${aErrors.map((m) => m.text).join(" | ")}`);
	}
}

async function waitPublished(sName) {
	for (let i = 0; i < 60; i++) {
		const [r] = await list(`C_CustomCDSViewRoot?$filter=EntityName eq '${sName}' and IsActiveEntity eq true&$select=GenerationState,CDBStatusCode`);
		// "PS" = publicação em andamento; "P" = publicada
		if (r && r.GenerationState === "P") {
			return;
		}
		await new Promise((res) => setTimeout(res, 5000));
	}
	throw new Error(`${sName}: publicação não terminou em 5 min (veja o log no app Custom CDS Views)`);
}

async function ensureView(v) {
	const sName = `YY1_${PREFIX}${v.name}`;
	console.log(`\n== ${sName}`);
	const aExisting = await list(`C_CustomCDSViewRoot?$filter=EntityName eq '${sName}'&$select=IsActiveEntity,GenerationState`);
	if (aExisting.some((r) => r.IsActiveEntity && r.GenerationState === "P")) {
		console.log("  já publicada — pulada");
		return;
	}
	if (aExisting.length) {
		throw new Error(`${sName} existe sem estar publicada (rascunho?) — conclua ou exclua no app Custom CDS Views`);
	}

	await call("POST", `C_CustomCDSViewRootCheck_create?EntityName='${sName}'&Scenario='EXA'`);
	const oRoot = (await call("POST", "C_CustomCDSViewRoot", { CamelCaseEntityName: sName, EntityLabel: `${PREFIX}${v.name}`, Scenario: "EXA" })).d;
	const sDraft = `EntityName='${sName}'&DraftUUID=${guid(oRoot.DraftUUID)}&IsActiveEntity=false`;
	const sRoot = `C_CustomCDSViewRoot(EntityName='${sName}',DraftUUID=${guid(oRoot.DraftUUID)},IsActiveEntity=false)`;

	await call("POST", `C_CustomCDSViewRootAdd_primary_ds?${sDraft}&DatasourceName='${v.primary}'`);
	if (v.text) {
		await call("POST", `C_CustomCDSViewRootAdd_assoc_ds?${sDraft}&DatasourceName='${v.text.source}'`);
	}
	const aSources = await list(`${sRoot}/to_Datasource`);
	const oPrimary = aSources.find((d) => d.Type === "P");
	const elementPath = (oSource, sField) => `${hex(oSource.DataSourceUUID)}.${sField}`;
	// A fonte principal já traz as chaves e, em algumas views, o texto (ex.: StorageLocationName):
	// campo que já está na view não é incluído de novo (viraria Campo_1)
	const addElement = async (oSource, sField) => {
		const aCurrent = await list(`${sRoot}/to_Element?$select=DatasourceUUID,DatasourceElement`);
		if (aCurrent.some((e) => e.DatasourceUUID === oSource.DataSourceUUID && e.DatasourceElement === sField)) {
			return;
		}
		await call("POST", `${sRoot}/to_Element`, {
			ElementAlias: sField, DatasourceUUID: oSource.DataSourceUUID, DatasourceElement: sField, PathEdit: elementPath(oSource, sField)
		});
	};

	if (v.text) {
		const oText = aSources.find((d) => d.Type === "A");
		const sText = `C_CustomCDSViewDataSource(EntityName='${sName}',DataSourceUUID=${guid(oText.DataSourceUUID)},DraftUUID=${guid(oText.DraftUUID)},IsActiveEntity=false)`;
		// Operator "=", FieldValueType "S" = variável de sessão / "F" = campo de outra fonte
		await call("POST", `${sText}/to_JoinCondition`, { DataSourceField: "Language", Operator: "=", FieldValueType: "S", FieldValueSessionVariable: "lang" });
		for (const sField of v.text.on) {
			await call("POST", `${sText}/to_JoinCondition`, {
				DataSourceField: sField, Operator: "=", FieldValueType: "F",
				FieldValuePath: elementPath(oPrimary, sField), FieldValuePathDatasourceUUID: oPrimary.DataSourceUUID
			});
		}
		// Com o idioma fixado há no máximo um texto: 0..1 ("1")
		await call("MERGE", sText, { Cardinality: "1" });
		for (const sField of v.text.fields) {
			await addElement(oText, sField);
		}
	}
	for (const sField of v.fields || []) {
		await addElement(oPrimary, sField);
	}
	const aElements = await list(`${sRoot}/to_Element?$select=ElementAlias,KeyIndicator`);
	console.log(`  campos: ${aElements.map((e) => e.ElementAlias + (e.KeyIndicator ? "*" : "")).join(", ")}`);

	const oActivation = await call("POST", `C_CustomCDSViewRootActivation?${sDraft}`);
	failOn(`${sName} ativação`, oActivation.messages);
	const oPublish = await call("POST", `C_CustomCDSViewRootPublish?EntityName='${sName}'&DraftUUID=${guid(ZERO)}&IsActiveEntity=true`);
	failOn(`${sName} publicação`, oPublish.messages);
	await waitPublished(sName);
	console.log(`  publicada — serviço ${sName}_CDS`);
}

try {
	for (const v of plan) {
		await ensureView(v);
	}
	console.log("\nPróximo passo: adicionar os serviços YY1_ACX_*_CDS novos ao cenário YY1_ACX_SAPIMPORT (Custom Communication Scenarios) e publicar o cenário.");
} catch (e) {
	console.error(`\nERRO: ${e.message}`);
	process.exitCode = 1;
}
api.disconnect();
