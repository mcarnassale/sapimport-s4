/**
 * Gera os objetos ABAP (RAP managed) equivalentes aos CBOs que já foram para o backend (lista BOS
 * abaixo), a partir do metadata.xml do mock — que é o contrato OData que o app já consome. Expõe os
 * MESMOS nomes de entity set / propriedade / navegação que o app espera.
 *
 * Alvo: ABAP for Cloud Development (language version 5) — requisito para entregar como add-on no
 * S/4HANA Cloud Public Edition. Por isso: BDEF em strict ( 2 ), autorização global e behavior pool.
 *
 * Saída em abap/ (formato fonte ADT, um arquivo por objeto). Rodar: npm run generate-abap
 * Prefixo dos objetos: ABAP_PREFIX (padrão "Z"; na entrega real vira o namespace registrado).
 *
 * Para levar mais um CBO para o RAP: nova entrada em BOS (+ o entity set dele no data source
 * rapService do app). Tudo vai no MESMO serviço (SERVICE), que é o que o modelo "rap" do app lê.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const METADATA = path.join(ROOT, "webapp/localService/mainService/metadata.xml");
const SCHEMA_MODEL = path.join(__dirname, "schema-model.json");
const OUT = path.join(ROOT, "abap");

const P = (process.env.ABAP_PREFIX || "Z").toUpperCase();
const p = P.toLowerCase();

const SERVICE = `${P}UI_IMPORTPROCESS`;

// DocEntry do IMPPCH: no B1 o UDO numerava sozinho; no RAP (chave = SAP_UUID) quem numera é um
// objeto de intervalo de numeração (NROB), chamado por uma determination on modify { create; }.
// O intervalo em si (DOCENTRY_NR_INTERVAL) é DADO: criado pela migração v2 do ImpSetup.
const DOCENTRY_DOMAIN = `${P}IMP_DOCENTRY`;
const DOCENTRY_NROB = `${P}IMPPCH`;
const DOCENTRY_NR_INTERVAL = "01";

// Nomes derivados de um nó: tabela, view R (interface) e C (projeção)
function node(sAlias, oOpts) {
	return {
		alias: sAlias,
		type: `${sAlias}Type`,
		table: `${p}${oOpts.tableSuffix || sAlias.toLowerCase()}`,
		rView: `${P}R_${oOpts.viewSuffix || sAlias}`,
		cView: `${P}C_${oOpts.viewSuffix || sAlias}`,
		label: oOpts.label
	};
}

// --- BOs no backend RAP --------------------------------------------------------------------
// children: nome da navegação no app (metadata.xml) -> nó filho.
// exposeCreateDelete: false = só update via OData (ex.: configuração singleton, criada pela
// escada do ImpSetup via EML — por isso o BDEF R continua com create).
const BOS = [
	{
		...node("IMPPCH", { label: "Processo de importacao" }),
		pool: `${P}BP_R_IMPPCH`,
		exposeCreateDelete: true,
		children: [
			{ nav: "Itens", alias: "PCH1", label: "Itens" },
			{ nav: "Moeda", alias: "PCH2", label: "Moeda" },
			{ nav: "Despacho", alias: "PCH3", label: "Despacho" },
			{ nav: "Demurrage", alias: "PCH4", label: "Demurrage" },
			{ nav: "Previsao", alias: "PCH5", label: "Previsao" },
			{ nav: "LoteSerie", alias: "PCH6", label: "Lote/Serie" }
		].map((c) => ({
			...c,
			...node(c.alias, { label: c.label, tableSuffix: `imppch_${c.alias.toLowerCase()}`, viewSuffix: `IMPPCH_${c.alias}` })
		})),
		readonly: ["DocEntry"],
		behaviorExtra: [
			"  determination SetDocEntry on modify { create; }",
			"  validation CheckDocEntry on save { create; }"
		],
		handlerDefs: docEntryHandlerDefs,
		handlerImpls: docEntryHandlerImpls
	},
	{
		...node("IMPICFG", { label: "Configuracao do sapimport" }),
		pool: `${P}BP_R_IMPICFG`,
		exposeCreateDelete: false,
		children: []
	},
	{
		...node("IMPLAY", { label: "Layout de importacao" }),
		pool: `${P}BP_R_IMPLAY`,
		exposeCreateDelete: true,
		children: []
	},
	{
		...node("DESPCAL", { label: "Despesa de calculo" }),
		pool: `${P}BP_R_DESPCAL`,
		exposeCreateDelete: true,
		children: []
	},
	{
		...node("IMPIPRV", { label: "Pre-calculo de despesas" }),
		pool: `${P}BP_R_IMPIPRV`,
		exposeCreateDelete: true,
		children: [
			{ nav: "Itens", alias: "PRV1", label: "Despesas do pre-calculo" }
		].map((c) => ({
			...c,
			...node(c.alias, { label: c.label, tableSuffix: `impiprv_${c.alias.toLowerCase()}`, viewSuffix: `IMPIPRV_${c.alias}` })
		}))
	}
];

// Palavras reservadas do DDIC: renomeadas só na tabela; a view CDS/OData mantém o nome original
// (o BDEF mapeia explicitamente). Descobertas na ativação real, não adivinhadas.
// "order"/"default" não aparecem aqui: também são reservadas em CDS, então já vêm renomeadas no
// contrato (OrderNum/IsDefault, RAP_RENAME em generate-mock.js).
const DB_RENAME = { usage: "usagecode", old: "oldvalue" };
const dbName = (sName) => DB_RENAME[sName.toLowerCase()] || sName.toLowerCase();
// Palavras reservadas também em CDS (Usage, Old) já chegam renomeadas no metadata.xml
// (RAP_RENAME em generate-mock.js), então não há mapeamento CDS aqui.
const cdsName = (sName) => sName;

function mappingClause(sTable, aFields) {
	const aRenamed = aFields.filter((f) => DB_RENAME[f.Name.toLowerCase()]);
	if (!aRenamed.length) {
		return [`  mapping for ${sTable} corresponding;`];
	}
	return [
		`  mapping for ${sTable} corresponding`,
		"  {",
		...aRenamed.map((f) => `    ${cdsName(f.Name)} = ${dbName(f.Name)};`),
		"  }"
	];
}
const ADMIN = ["CreatedByUser", "LastChangedByUser", "LastChangeDateTime"];

// --- parse metadata.xml (regex simples, o arquivo é gerado por nós e tem formato estável) ---
const sXml = fs.readFileSync(METADATA, "utf8");

function readEntityType(sName) {
	const m = sXml.match(new RegExp(`<EntityType Name="${sName}">([\\s\\S]*?)</EntityType>`));
	if (!m) {
		throw new Error(`EntityType ${sName} não encontrado em metadata.xml`);
	}
	return [...m[1].matchAll(/<Property\s+([^>]*?)\/>/g)].map((pr) => {
		const oAttr = {};
		for (const a of pr[1].matchAll(/(\w+)="([^"]*)"/g)) {
			oAttr[a[1]] = a[2];
		}
		return oAttr;
	});
}

function abapType(oProp) {
	switch (oProp.Type) {
		case "Edm.Guid": return "sysuuid_x16";
		case "Edm.Int32": return "abap.int4";
		case "Edm.Decimal": return `abap.dec(${oProp.Precision || 19},${oProp.Scale || 4})`;
		case "Edm.Date": return "abap.dats";
		case "Edm.String": return oProp.MaxLength ? `abap.char(${oProp.MaxLength})` : "abap.string(0)";
		default: throw new Error(`Tipo sem mapeamento: ${oProp.Type} (${oProp.Name})`);
	}
}

// Campos de negócio = tudo menos a chave e os campos administrativos (gerados à parte)
function businessFields(sType) {
	return readEntityType(sType).filter((f) => f.Name !== "SAP_UUID" && !ADMIN.includes(f.Name));
}

// --- geradores de fonte ---
function tableSource(oNode, aFields, bChild) {
	const aLines = [
		`@EndUserText.label : '${oNode.label}'`,
		"@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE",
		"@AbapCatalog.tableCategory : #TRANSPARENT",
		"@AbapCatalog.deliveryClass : #A",
		"@AbapCatalog.dataMaintenance : #RESTRICTED",
		`define table ${oNode.table} {`,
		"  key client          : abap.clnt not null;",
		"  key sap_uuid        : sysuuid_x16 not null;"
	];
	if (bChild) {
		aLines.push("  sap_parentuuid      : sysuuid_x16;");
	}
	for (const f of aFields) {
		aLines.push(`  ${dbName(f.Name).padEnd(19)} : ${abapType(f)};`);
	}
	aLines.push(
		"  createdbyuser       : abp_creation_user;",
		"  lastchangedbyuser   : abp_lastchange_user;",
		"  lastchangedatetime  : abp_lastchange_tstmpl;",
		"  locallastchanged    : abp_locinst_lastchange_tstmpl;",
		"}"
	);
	return aLines.join("\n") + "\n";
}

const ADMIN_ELEMENTS = [
	"  @Semantics.user.createdBy: true",
	"  createdbyuser      as CreatedByUser",
	"  @Semantics.user.lastChangedBy: true",
	"  lastchangedbyuser  as LastChangedByUser",
	"  @Semantics.systemDateTime.lastChangedAt: true",
	"  lastchangedatetime as LastChangeDateTime",
	"  @Semantics.systemDateTime.localInstanceLastChangedAt: true",
	"  locallastchanged   as LocalLastChanged"
];

// Lista de elementos CDS com vírgula entre eles (a última linha não leva)
function commaJoin(aLines) {
	return aLines.map((s, i) => (i < aLines.length - 1 && !s.trimStart().startsWith("@") ? `${s},` : s));
}

function rootRView(oBo, aFields) {
	return [
		"@AccessControl.authorizationCheck: #NOT_REQUIRED",
		`@EndUserText.label: '${oBo.label}'`,
		`define root view entity ${oBo.rView}`,
		`  as select from ${oBo.table}`,
		...oBo.children.map((c) => `  composition [0..*] of ${c.rView} as ${c.nav}`),
		"{",
		...commaJoin([
			"  key sap_uuid as SAP_UUID",
			...aFields.map((f) => `  ${dbName(f.Name)} as ${cdsName(f.Name)}`),
			...ADMIN_ELEMENTS,
			...oBo.children.map((c) => `  ${c.nav}`)
		]),
		"}"
	].join("\n") + "\n";
}

function childRView(oBo, oChild, aFields) {
	return [
		"@AccessControl.authorizationCheck: #NOT_REQUIRED",
		`@EndUserText.label: '${oChild.label}'`,
		`define view entity ${oChild.rView}`,
		`  as select from ${oChild.table}`,
		`  association to parent ${oBo.rView} as _Parent on $projection.SAP_ParentUUID = _Parent.SAP_UUID`,
		"{",
		...commaJoin([
			"  key sap_uuid   as SAP_UUID",
			"  sap_parentuuid as SAP_ParentUUID",
			...aFields.map((f) => `  ${dbName(f.Name)} as ${cdsName(f.Name)}`),
			...ADMIN_ELEMENTS,
			"  _Parent"
		]),
		"}"
	].join("\n") + "\n";
}

function elementList(aFields) {
	return [...aFields.map((f) => cdsName(f.Name)), ...ADMIN, "LocalLastChanged"].map((s) => `  ${s}`);
}

function rootCView(oBo, aFields) {
	return [
		"@AccessControl.authorizationCheck: #NOT_REQUIRED",
		`@EndUserText.label: '${oBo.label}'`,
		`define root view entity ${oBo.cView}`,
		"  provider contract transactional_query",
		`  as projection on ${oBo.rView}`,
		"{",
		...commaJoin([
			"  key SAP_UUID",
			...elementList(aFields),
			...oBo.children.map((c) => `  ${c.nav} : redirected to composition child ${c.cView}`)
		]),
		"}"
	].join("\n") + "\n";
}

function childCView(oBo, oChild, aFields) {
	return [
		"@AccessControl.authorizationCheck: #NOT_REQUIRED",
		`@EndUserText.label: '${oChild.label}'`,
		`define view entity ${oChild.cView}`,
		`  as projection on ${oChild.rView}`,
		"{",
		...commaJoin([
			"  key SAP_UUID",
			"  SAP_ParentUUID",
			...elementList(aFields),
			`  _Parent : redirected to parent ${oBo.cView}`
		]),
		"}"
	].join("\n") + "\n";
}

// managed + strict ( 2 ): exige autorização declarada (global no root, dependente nos filhos),
// implementada no behavior pool. Chave UUID por numbering managed.
function behaviorR(oBo) {
	const aOut = [
		`managed implementation in class ${oBo.pool.toLowerCase()} unique;`,
		"strict ( 2 );",
		"",
		`define behavior for ${oBo.rView} alias ${oBo.alias}`,
		`persistent table ${oBo.table}`,
		"lock master",
		"authorization master ( global )",
		"etag master LocalLastChanged",
		"{",
		"  create;",
		"  update;",
		"  delete;",
		"  field ( readonly, numbering : managed ) SAP_UUID;",
		`  field ( readonly ) ${[...(oBo.readonly || []), "CreatedByUser", "LastChangedByUser", "LastChangeDateTime", "LocalLastChanged"].join(", ")};`,
		...(oBo.behaviorExtra || []),
		...oBo.children.map((c) => `  association ${c.nav} { create; }`),
		...mappingClause(oBo.table, businessFields(oBo.type)),
		"}"
	];
	for (const c of oBo.children) {
		aOut.push(
			"",
			`define behavior for ${c.rView} alias ${c.alias}`,
			`persistent table ${c.table}`,
			"lock dependent by _Parent",
			"authorization dependent by _Parent",
			"etag master LocalLastChanged",
			"{",
			"  update;",
			"  delete;",
			"  field ( readonly, numbering : managed ) SAP_UUID;",
			"  field ( readonly ) SAP_ParentUUID, CreatedByUser, LastChangedByUser, LastChangeDateTime, LocalLastChanged;",
			"  association _Parent;",
			...mappingClause(c.table, businessFields(c.type)),
			"}"
		);
	}
	return aOut.join("\n") + "\n";
}

function behaviorC(oBo) {
	const aOut = [
		"projection;",
		"strict ( 2 );",
		"",
		`define behavior for ${oBo.cView} alias ${oBo.alias}`,
		"{",
		...(oBo.exposeCreateDelete ? ["  use create;"] : []),
		"  use update;",
		...(oBo.exposeCreateDelete ? ["  use delete;"] : []),
		...oBo.children.map((c) => `  use association ${c.nav} { create; }`),
		"}"
	];
	for (const c of oBo.children) {
		aOut.push(
			"",
			`define behavior for ${c.cView} alias ${c.alias}`,
			"{",
			"  use update;",
			"  use delete;",
			"  use association _Parent;",
			"}"
		);
	}
	return aOut.join("\n") + "\n";
}

// Behavior pool: classe global (vazia por definição) + handler local com a autorização global.
function behaviorPoolMain(oBo) {
	const sName = oBo.pool.toLowerCase();
	return [
		`CLASS ${sName} DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF ${oBo.rView.toLowerCase()}.`,
		"ENDCLASS.",
		"",
		`CLASS ${sName} IMPLEMENTATION.`,
		"ENDCLASS."
	].join("\n") + "\n";
}

function behaviorPoolLocals(oBo) {
	const sAlias = oBo.alias.toLowerCase();
	return [
		`CLASS lhc_${sAlias} DEFINITION INHERITING FROM cl_abap_behavior_handler.`,
		"  PRIVATE SECTION.",
		"    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION",
		`      IMPORTING REQUEST requested_authorizations FOR ${sAlias} RESULT result.`,
		...(oBo.handlerDefs ? oBo.handlerDefs(oBo) : []),
		"ENDCLASS.",
		"",
		`CLASS lhc_${sAlias} IMPLEMENTATION.`,
		...(oBo.handlerImpls ? oBo.handlerImpls(oBo) : []),
		"  METHOD get_global_authorizations.",
		"    \" TODO: trocar por AUTHORITY-CHECK num objeto de autorização próprio (IAM app/catálogo)",
		"    \" quando o produto tiver o modelo de autorização definido. Por ora, tudo liberado.",
		"    result = VALUE #( %create = if_abap_behv=>auth-allowed",
		"                      %update = if_abap_behv=>auth-allowed",
		"                      %delete = if_abap_behv=>auth-allowed ).",
		"  ENDMETHOD.",
		"ENDCLASS."
	].join("\n") + "\n";
}

// --- DocEntry do IMPPCH (handlers do behavior pool) ----------------------------------------
function docEntryHandlerDefs(oBo) {
	return [
		"    METHODS set_doc_entry FOR DETERMINE ON MODIFY",
		`      IMPORTING keys FOR ${oBo.alias}~SetDocEntry.`,
		"    METHODS check_doc_entry FOR VALIDATE ON SAVE",
		`      IMPORTING keys FOR ${oBo.alias}~CheckDocEntry.`
	];
}

function docEntryHandlerImpls(oBo) {
	const sAlias = oBo.alias.toLowerCase();
	const sR = oBo.rView.toLowerCase();
	return [
		"  METHOD set_doc_entry.",
		"    \" Equivalente ao DocEntry auto-numerado do UDO no B1. Número tirado do NROB na criação",
		"    \" (interaction phase, como o early numbering dos exemplos /DMO/ da SAP). Com buffer em",
		"    \" memória o número sai ao criar, não ao gravar: um Processo descartado deixa lacuna.",
		`    READ ENTITIES OF ${sR} IN LOCAL MODE`,
		`      ENTITY ${oBo.alias} FIELDS ( DocEntry ) WITH CORRESPONDING #( keys )`,
		"      RESULT DATA(lt_proc).",
		"    DELETE lt_proc WHERE DocEntry IS NOT INITIAL.",
		"    CHECK lt_proc IS NOT INITIAL.",
		"",
		`    DATA lt_update TYPE TABLE FOR UPDATE ${sR}.`,
		"    LOOP AT lt_proc INTO DATA(ls_proc).",
		"      TRY.",
		"          cl_numberrange_runtime=>number_get(",
		`            EXPORTING nr_range_nr = '${DOCENTRY_NR_INTERVAL}'`,
		`                      object      = '${DOCENTRY_NROB}'`,
		"            IMPORTING number      = DATA(lv_number) ).",
		"        CATCH cx_number_ranges INTO DATA(lx_nr).",
		"          \" Intervalo inexistente = ImpSetup v2 não rodou (o app roda RunSetup no startup)",
		`          APPEND VALUE #( %tky = ls_proc-%tky`,
		"                          %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error",
		`                                                        text     = lx_nr->get_text( ) ) ) TO reported-${sAlias}.`,
		"          CONTINUE.",
		"      ENDTRY.",
		"      APPEND VALUE #( %tky = ls_proc-%tky DocEntry = CONV i( lv_number ) %control-DocEntry = if_abap_behv=>mk-on ) TO lt_update.",
		"    ENDLOOP.",
		"",
		`    MODIFY ENTITIES OF ${sR} IN LOCAL MODE`,
		`      ENTITY ${oBo.alias} UPDATE FROM lt_update.`,
		"  ENDMETHOD.",
		"",
		"  METHOD check_doc_entry.",
		"    \" Rede de segurança do set_doc_entry: sem número (ex.: intervalo não criado), não grava.",
		`    READ ENTITIES OF ${sR} IN LOCAL MODE`,
		`      ENTITY ${oBo.alias} FIELDS ( DocEntry ) WITH CORRESPONDING #( keys )`,
		"      RESULT DATA(lt_proc).",
		"    LOOP AT lt_proc INTO DATA(ls_proc) WHERE DocEntry IS INITIAL.",
		`      APPEND VALUE #( %tky = ls_proc-%tky ) TO failed-${sAlias}.`,
		`      APPEND VALUE #( %tky = ls_proc-%tky`,
		"                      %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error",
		"                                                    \" new_message_with_text corta em 50 caracteres",
		`                                                    text     = 'Sem numeração p/ o Processo: rode o setup' ) ) TO reported-${sAlias}.`,
		"    ENDLOOP.",
		"  ENDMETHOD.",
		""
	];
}

// --- Linha inicial do IMPICFG (Code='001'), criada pela escada do ImpSetup -----------------
// Equivalente ao Functions.SetVersion do B1 (cria Code='001'/Name/Versao) + DefaultValue de cada
// UDF do [@ICFG] (o B1 aplica sozinho no Add; no RAP vai explícito) + os SetConfig da escada do
// Inicio.cs, que sobrescrevem alguns padrões numa instalação nova.
const ICFG_SETCONFIG = { Expenses: "N", CustoCOFM: "N", MetodoBuscaItem: "1" };
function icfgInitialValues() {
	const oModel = JSON.parse(fs.readFileSync(SCHEMA_MODEL, "utf8"));
	const aProps = readEntityType("IMPICFGType");
	const oTypeByName = Object.fromEntries(aProps.map((f) => [f.Name, f.Type]));
	const oValues = { Code: "001", Name: "sapimport" };
	for (const f of oModel.tables.ICFG || []) {
		if (f.DefaultValue !== undefined && f.DefaultValue !== "") {
			oValues[f.Name] = f.DefaultValue;
		}
	}
	Object.assign(oValues, ICFG_SETCONFIG);
	return Object.entries(oValues).map(([sName, sValue]) => {
		if (!oTypeByName[sName]) {
			throw new Error(`IMPICFG.${sName} (valor inicial) não existe no metadata`);
		}
		const bNumeric = ["Edm.Int32", "Edm.Decimal"].includes(oTypeByName[sName]);
		return { name: sName, abap: bNumeric ? `'${sValue}'` : `'${String(sValue).replace(/'/g, "''")}'` };
	});
}

// BO de versão/setup do backend (escrito à mão, ver abap-setup-templates.js)
const SETUP = require("./abap-setup-templates")(P, {
	nrObject: DOCENTRY_NROB,
	nrInterval: DOCENTRY_NR_INTERVAL,
	icfg: { rView: BOS[1].rView, alias: BOS[1].alias, values: icfgInitialValues() }
});

function serviceDefinition() {
	return [
		"@EndUserText.label: 'sapimport - processos de importacao'",
		`define service ${SERVICE} {`,
		...BOS.flatMap((b) => [
			`  expose ${b.cView} as ${b.alias};`,
			...b.children.map((c) => `  expose ${c.cView} as ${c.alias};`)
		]),
		SETUP.expose,
		"}"
	].join("\n") + "\n";
}

// --- escrita ---
fs.mkdirSync(OUT, { recursive: true });
const aWritten = [];
function write(sFile, sContent) {
	fs.writeFileSync(path.join(OUT, sFile), sContent);
	aWritten.push(sFile);
}

for (const oBo of BOS) {
	const aRootFields = businessFields(oBo.type);
	write(`${oBo.table}.tabl.asddls`, tableSource(oBo, aRootFields, false));
	write(`${oBo.rView.toLowerCase()}.ddls.asddls`, rootRView(oBo, aRootFields));
	write(`${oBo.cView.toLowerCase()}.ddls.asddls`, rootCView(oBo, aRootFields));
	for (const c of oBo.children) {
		const aFields = businessFields(c.type);
		write(`${c.table}.tabl.asddls`, tableSource(c, aFields, true));
		write(`${c.rView.toLowerCase()}.ddls.asddls`, childRView(oBo, c, aFields));
		write(`${c.cView.toLowerCase()}.ddls.asddls`, childCView(oBo, c, aFields));
	}
}

// Numeração do DocEntry: domínio (tamanho do número) + objeto de intervalo (fonte AFF nrob-v1).
// Buffer em memória (padrão SAP): rápido, mas pode deixar lacunas e, com vários servidores de
// aplicação, sair fora de ordem — aceitável para uma chave interna como o DocEntry do B1.
write(`${DOCENTRY_DOMAIN.toLowerCase()}.doma.json`, JSON.stringify({
	description: "sapimport - numero interno do processo",
	datatype: "NUMC",
	length: 10
}, null, 2) + "\n");
write(`${DOCENTRY_NROB.toLowerCase()}.nrob.json`, JSON.stringify({
	formatVersion: "1",
	header: { description: "sapimport - DocEntry do processo", originalLanguage: "en", abapLanguageVersion: "cloudDevelopment" },
	interval: { numberLengthDomain: DOCENTRY_DOMAIN, percentWarning: 10.0, subType: "", untilYear: false, rolling: false, prefix: false },
	configuration: { buffering: "mainBuffer", bufferedNumbers: 10 }
}, null, 2) + "\n");

for (const oBo of BOS) {
	write(`${oBo.rView.toLowerCase()}.bdef.asbdef`, behaviorR(oBo));
	write(`${oBo.cView.toLowerCase()}.bdef.asbdef`, behaviorC(oBo));
	write(`${oBo.pool.toLowerCase()}.clas.abap`, behaviorPoolMain(oBo));
	write(`${oBo.pool.toLowerCase()}.clas.locals_imp.abap`, behaviorPoolLocals(oBo));
}
for (const [sFile, sContent] of Object.entries(SETUP.files)) {
	write(sFile, sContent);
}
write(`${SERVICE.toLowerCase()}.srvd.srvdsrv`, serviceDefinition());

console.log(`${aWritten.length} arquivos em abap/:\n  ${aWritten.join("\n  ")}`);
console.log("Campos de negócio: " + BOS.map((b) =>
	[`${b.alias}=${businessFields(b.type).length}`, ...b.children.map((c) => `${c.alias}=${businessFields(c.type).length}`)].join(", ")
).join(" | "));
