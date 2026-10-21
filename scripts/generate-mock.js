#!/usr/bin/env node
/**
 * Generates the local OData V4 mock (webapp/localService/mainService/metadata.xml + a few
 * fixture data/*.json files) for the CBOs designed in ../docs/cbo-design.md, from
 * scripts/schema-model.json (run extract-schema.js first).
 *
 * This is a MOCK shaped like a plausible S/4HANA Cloud Custom Business Object OData service —
 * not a real one. Field/entity naming here is this project's own placeholder convention until a
 * real tenant confirms the actual generated shape (see the "placeholder" caveats in
 * docs/cbo-design.md). Every custom field is emitted WITHOUT a "U_" prefix (unlike the B1
 * project) since a CBO's own fields aren't SAP B1 UDFs — there's no "U_" convention to carry
 * over. Every entity type also gets synthetic SAP-style admin fields
 * (SAP_UUID/CreatedByUser/LastChangedByUser/LastChangeDateTime) that don't exist in
 * schema-model.json (B1 has no equivalent) since real CBOs always carry these.
 *
 * Usage: node scripts/generate-mock.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const MODEL_FILE = path.resolve(__dirname, "schema-model.json");
const OUT_DIR = path.resolve(__dirname, "../webapp/localService/mainService");
const DATA_DIR = path.join(OUT_DIR, "data");

if (!fs.existsSync(MODEL_FILE)) {
    console.error(`schema-model.json not found — run 'node scripts/extract-schema.js' first`);
    process.exit(1);
}
const model = JSON.parse(fs.readFileSync(MODEL_FILE, "utf8"));

// B1 db_* type -> Edm type. See the mapping table in docs/cbo-design.md.
function edmType(oField) {
    switch (oField.Type) {
        case "db_Alpha": return { type: "Edm.String", maxLength: oField.Size || 254 };
        case "db_Memo": return { type: "Edm.String" }; // long text, no maxLength
        case "db_Numeric": return { type: "Edm.Int32" };
        case "db_Float": return { type: "Edm.Decimal", precision: 19, scale: 4 };
        case "db_Date": return { type: "Edm.Date" };
        default:
            throw new Error(`unmapped B1 field type "${oField.Type}" for field ${oField.Name} — extend edmType() before regenerating`);
    }
}

const ADMIN_FIELDS = [
    { name: "CreatedByUser", edm: { type: "Edm.String", maxLength: 12 } },
    { name: "LastChangedByUser", edm: { type: "Edm.String", maxLength: 12 } },
    { name: "LastChangeDateTime", edm: { type: "Edm.DateTimeOffset" } }
];

/**
 * @param {string} sEntityType      e.g. "IMPPCH"
 * @param {string} sKeyField        e.g. "DocEntry" or "Code"
 * @param {"Edm.Int32"|"Edm.String"} sKeyType
 * @param {Array}  aTableFields     raw fields from schema-model.json for this table
 * @param {Array<{name:string, target:string, multiplicity:"1"|"*"}>} aNavProps
 */
// B1's implicit structural parent-key column on a UDT child table (plain "DocEntry", auto-added
// by the DI-API, never created via ensureField) never appears in schema-model.json — extraction
// only sees ensureField() calls, i.e. genuine custom U_* fields. So a "DocEntry"/"DocNum" entry
// found here (e.g. PCH1's U_DocEntry/"Pedido" and U_DocNum/"Doc" — real Purchase-Order-link UDFs,
// confirmed against the B1 view/controller) is always a real business field, never a structural
// one to drop. The only real duplicate risk is the key field itself (sKeyField, e.g. "LineNum" on
// every PCH* child) showing up twice: once injected below, once already in aTableFields from its
// own ensureField call.
function buildEntityType(sEntityType, sKeyField, sKeyType, aTableFields, aNavProps) {
    const aBusinessFields = (aTableFields || []).filter(f => f.Name !== sKeyField);
    const aProps = [
        { name: "SAP_UUID", edm: { type: "Edm.Guid" }, key: true },
        // Code de UDT/UDO do B1 = 50 caracteres. Sem MaxLength viraria abap.string no RAP, que não
        // pode ser usado em WHERE (ex.: SELECT ... WHERE Code = '001' na escada do ImpSetup).
        { name: sKeyField, edm: sKeyType === "Edm.String" ? { type: sKeyType, maxLength: 50 } : { type: sKeyType } },
        ...aBusinessFields.map(f => ({ name: f.Name, edm: edmType(f), description: f.Description })),
        ...ADMIN_FIELDS
    ];
    return { name: sEntityType, keyProp: "SAP_UUID", props: aProps, navProps: aNavProps || [] };
}

const CBOS = [];

// CBOs também servidos pelo backend RAP (scripts/generate-abap.js: IMPPCH+PCH1-6, IMPICFG, IMPLAY):
// "Usage", "Old", "Order" e "Default" são palavras reservadas em CDS — sem escape possível. O
// contrato é renomeado aqui para mock e RAP exporem o mesmo nome de propriedade. (Reservada só no
// DDIC ficaria no contrato e seria renomeada só na tabela — DB_RENAME em generate-abap.js.)
const RAP_RENAME = { Usage: "UsageCode", Old: "OldValue", Order: "OrderNum", Default: "IsDefault" };
const RAP_SERVED = new Set(["IMPPCH", "IMPICFG", "IMPLAY", "DESPCAL", "IMPIPRV"]);
const applyRapRename = (oEntity) => {
    for (const prop of oEntity.props) {
        prop.name = RAP_RENAME[prop.name] || prop.name;
    }
};

// --- Standalone (no children) master-data-shaped CBOs: synthetic Code/Name key -------------
for (const [sEntitySet, sTable] of [
    ["IMPLAY", "ILAY"], ["CFLNFS", "CNFS"], ["CFLPOR", "CPOR"],
    ["CFLDUIMP", "CDUIMP"], ["CFLDESP", "CDES"]
]) {
    const root = buildEntityType(sEntitySet, "Code", "Edm.String", [
        { Name: "Name", Type: "db_Alpha", Size: 100 }, // implicit B1 Name column, not in schema-model.json
        ...(model.tables[sTable] || [])
    ], []);
    if (RAP_SERVED.has(sEntitySet)) {
        applyRapRename(root);
    }
    CBOS.push({ entitySet: sEntitySet, root });
}

// --- DESPCAL: Code/Name are already explicit fields in schema-model.json (see cbo-design.md) --
{
    const root = buildEntityType("DESPCAL", "Code", "Edm.String",
        (model.tables.DESPCAL || []).filter(f => f.Name !== "Code"), []);
    applyRapRename(root);
    CBOS.push({ entitySet: "DESPCAL", root });
}


// --- IMPICFG: singleton config, key=Code (always '001') ---------------------------------------
// Same implicit-B1-Name-column situation as the standalone CBOs above — ICFG_FIELDS never
// declares "Name" (it's a standard UDT column, not a custom one), so it must be added here too.
{
    const root = buildEntityType("IMPICFG", "Code", "Edm.String", [
        { Name: "Name", Type: "db_Alpha", Size: 100 },
        ...(model.tables.ICFG || [])
    ], []);
    applyRapRename(root);
    CBOS.push({ entitySet: "IMPICFG", root });
}

// --- IMPIPRV root (IPRV) + child PRV1 ----------------------------------------------------------
// Child nodes use a synthetic "LineId" as their conventional per-row ordinal (distinct from
// SAP_UUID, the real EDM key) — named "LineId", not "LineNum", because PCH1 has its own genuine
// custom field that strips down to "LineNum" (B1's U_LineNum/"Linha", a real business field, not
// a structural row counter); reusing "LineNum" here would silently collide with it. No PCH1-6/
// PRV1 table has a field named "LineId", so this is collision-free.
{
    const child = buildEntityType("PRV1", "LineId", "Edm.Int32", model.tables.PRV1 || [], []);
    const root = buildEntityType("IMPIPRV", "Code", "Edm.String", [
        { Name: "Name", Type: "db_Alpha", Size: 100 },
        ...(model.tables.IPRV || [])
    ], [{ name: "Itens", target: "PRV1", multiplicity: "*" }]);
    [root, child].forEach(applyRapRename);
    CBOS.push({ entitySet: "IMPIPRV", root, children: [child] });
}

// --- IMPPCH root (IPCH) + 6 child nodes (PCH1-6) -----------------------------------------------
{
    const CHILD_DEFS = [
        ["Itens", "PCH1"], ["Moeda", "PCH2"], ["Despacho", "PCH3"],
        ["Demurrage", "PCH4"], ["Previsao", "PCH5"], ["LoteSerie", "PCH6"]
    ];
    const children = CHILD_DEFS.map(([sNavName, sTable]) =>
        Object.assign(buildEntityType(sTable, "LineId", "Edm.Int32", model.tables[sTable] || [], []), { navName: sNavName })
    );
    const root = buildEntityType("IMPPCH", "DocEntry", "Edm.Int32", model.tables.IPCH || [],
        CHILD_DEFS.map(([sNavName, sTable]) => ({ name: sNavName, target: sTable, multiplicity: "*" })));
    [root, ...children].forEach(applyRapRename);
    // PCH1.DocEntry/DocNum guardam o pedido de compra de origem da linha. No B1 eram o DocEntry/
    // DocNum numéricos do OPOR; no S/4 o número do pedido (A_PurchaseOrder.PurchaseOrder) é
    // CHAR(10) com 10 dígitos ("4500000001") — não cabe em Int32 (o RAP recusa com "Conversion
    // error"). Viram String(10), mesmo tipo do PurchaseOrder real.
    const pch1 = children.find((c) => c.name === "PCH1");
    for (const prop of pch1.props.filter((x) => x.name === "DocEntry" || x.name === "DocNum")) {
        prop.edm = { type: "Edm.String", maxLength: 10 };
    }
    CBOS.push({ entitySet: "IMPPCH", root, children });
}

// --- Value-help lookup entities consumed by the Configs screen ---------------------------------
// PLACEHOLDER shapes only (Decision 1, docs/configs-port-notes.md) — same entity/field names as
// the B1 Service Layer originals, NOT the real S/4 API shapes (A_BusinessPartner, A_Product,
// GLAccount, ...), which use different field names and, for Product/GLAccount, push the
// description onto a separate language-dependent navigation. No admin fields on these (they're
// not CBOs — the mock stands in for whatever entity a real config screen would resolve to).
function buildLookupEntity(sName, sKeyField, sKeyType, aFields) {
    return {
        name: sName,
        keyProp: sKeyField,
        props: [{ name: sKeyField, edm: { type: sKeyType }, key: true }, ...aFields],
        navProps: []
    };
}
const LOOKUP_ENTITIES = [
    buildLookupEntity("AdditionalExpenses", "ExpensCode", "Edm.String",
        [{ name: "Name", edm: { type: "Edm.String", maxLength: 100 } }]),
    // Siscomex: needed by ProcessosDetail's "Inserir Pedidos" usage-text lookup
    // (_getSiscomexUsage in the B1 original).
    buildLookupEntity("NotaFiscalUsage", "ID", "Edm.Int32", [
        { name: "Usage", edm: { type: "Edm.String", maxLength: 100 } },
        { name: "Siscomex", edm: { type: "Edm.String", maxLength: 20 } }
    ]),
    buildLookupEntity("BusinessPartners", "CardCode", "Edm.String",
        [{ name: "CardName", edm: { type: "Edm.String", maxLength: 100 } }]),
    buildLookupEntity("SalesTaxCodes", "Code", "Edm.String",
        [{ name: "Name", edm: { type: "Edm.String", maxLength: 100 } }]),
    buildLookupEntity("ChartOfAccounts", "Code", "Edm.String",
        [{ name: "Name", edm: { type: "Edm.String", maxLength: 100 } }]),
    // PurchaseUnitWeight1/PurchaseWeightUnit1/NCMCode: needed by ProcessosDetail's "Inserir
    // Pedidos" (onInsertPedidos) weight calc — B1 original reads these via
    // $expand=NCMCodeSetup($select=NCMCode), flattened here into a plain field instead since
    // this is a placeholder entity, not a real nav-property-shaped one.
    buildLookupEntity("Items", "ItemCode", "Edm.String", [
        { name: "ItemName", edm: { type: "Edm.String", maxLength: 100 } },
        { name: "PurchaseUnitWeight1", edm: { type: "Edm.Decimal", precision: 19, scale: 4 } },
        { name: "PurchaseWeightUnit1", edm: { type: "Edm.Int32" } },
        { name: "NCMCode", edm: { type: "Edm.String", maxLength: 10 } }
    ]),
    buildLookupEntity("Warehouses", "WarehouseCode", "Edm.String",
        [{ name: "WarehouseName", edm: { type: "Edm.String", maxLength: 100 } }]),
    // Rate: cotação do dia em BRL — mock-only convenience (o B1 original chama a função OData
    // nativa SBOBobService_GetCurrencyRate do Service Layer, sem equivalente S/4; usado por
    // onAnexoPO2DI/_getCurrencyRateToday, ver docs/po2di-duimp-port-notes.md).
    buildLookupEntity("Currencies", "Code", "Edm.String", [
        { name: "Name", edm: { type: "Edm.String", maxLength: 100 } },
        { name: "Rate", edm: { type: "Edm.Decimal", precision: 19, scale: 6 } }
    ]),

    // Filial (OBPL no B1 original) — mapeamento real provável é J_1BBRANCH ("Business Place",
    // localização Brasil, fica entre Empresa e Centro, carrega o CNPJ), média confiança/não
    // confirmado contra tenant real, ver docs/cbo-design.md. ClientId/ClientSecret são as
    // credenciais do Portal Único por Filial (prioridade mais alta que o fallback por usuário,
    // dropado deliberadamente na porta do Configs — ver docs/configs-port-notes.md); WhsCode/
    // WhsTCode/SeqName são os outros 3 Custom Fields de OBPL, sem uso ainda em nenhuma tela.
    buildLookupEntity("BusinessPlaces", "BplId", "Edm.Int32", [
        { name: "Name", edm: { type: "Edm.String", maxLength: 100 } },
        { name: "TaxIdNumber", edm: { type: "Edm.String", maxLength: 20 } },
        { name: "WhsCode", edm: { type: "Edm.String", maxLength: 16 } },
        { name: "WhsTCode", edm: { type: "Edm.String", maxLength: 16 } },
        { name: "SeqName", edm: { type: "Edm.String", maxLength: 8 } },
        { name: "ClientId", edm: { type: "Edm.String", maxLength: 100 } },
        { name: "ClientSecret", edm: { type: "Edm.String", maxLength: 100 } }
    ])
    // Pedidos de compra NÃO são mais placeholder daqui: o app lê a API REAL do S/4
    // (api_purchaseorder_2, OData V4) pelo modelo "po", e no mock o data source
    // purchaseOrderService usa o $metadata real (npm run fetch-po-metadata) — fixtures em
    // PO_FIXTURES, mais abaixo.
];

// -------------------------------------------------------------------------------------------
// Emit CSDL/XML
// -------------------------------------------------------------------------------------------

function propXml(p) {
    const attrs = [`Name="${p.name}"`, `Type="${p.edm.type}"`];
    if (p.edm.maxLength) attrs.push(`MaxLength="${p.edm.maxLength}"`);
    if (p.edm.precision) attrs.push(`Precision="${p.edm.precision}"`);
    if (p.edm.scale !== undefined) attrs.push(`Scale="${p.edm.scale}"`);
    if (!p.key) attrs.push(`Nullable="true"`);
    return `                <Property ${attrs.join(" ")}/>`;
}

function entityTypeXml(oEntity) {
    const lines = [];
    lines.push(`                <EntityType Name="${oEntity.name}Type">`);
    lines.push(`                    <Key><PropertyRef Name="${oEntity.keyProp}"/></Key>`);
    for (const p of oEntity.props) lines.push(propXml(p));
    for (const nav of oEntity.navProps) {
        lines.push(`                <NavigationProperty Name="${nav.name}" Type="${nav.multiplicity === "*" ? `Collection(SAPB1S4.${nav.target}Type)` : `SAPB1S4.${nav.target}Type`}"/>`);
    }
    lines.push(`                </EntityType>`);
    return lines.join("\n");
}

const aAllEntityTypeBlocks = [];
const aAllEntitySetBlocks = [];
const aAllNavBindingBlocks = [];

for (const cbo of CBOS) {
    aAllEntityTypeBlocks.push(entityTypeXml(cbo.root));
    const navBindings = (cbo.root.navProps || []).map(nav =>
        `                    <NavigationPropertyBinding Path="${nav.name}" Target="${nav.target}"/>`);
    aAllEntitySetBlocks.push(
        `                <EntitySet Name="${cbo.entitySet}" EntityType="SAPB1S4.${cbo.root.name}Type">\n${navBindings.join("\n")}${navBindings.length ? "\n" : ""}                </EntitySet>`
    );
    for (const child of cbo.children || []) {
        aAllEntityTypeBlocks.push(entityTypeXml(child));
        aAllEntitySetBlocks.push(`                <EntitySet Name="${child.name}" EntityType="SAPB1S4.${child.name}Type"/>`);
    }
}

for (const lookup of LOOKUP_ENTITIES) {
    aAllEntityTypeBlocks.push(entityTypeXml(lookup));
    aAllEntitySetBlocks.push(`                <EntitySet Name="${lookup.name}" EntityType="SAPB1S4.${lookup.name}Type"/>`);
}

// --- ImpSetup: versão de dados do backend + GetStatus/RunSetup (checagem de startup) ---------
// Mesmo formato do serviço RAP real (scripts/abap-setup-templates.js), copiado do $metadata dele:
// function/action estáticas viram operações BOUND na coleção (_it: Collection(ImpSetupType)).
// O comportamento das operações no mock fica em rapService/data/ImpSetup.js (escrito à mão). O app
// usa o ImpSetup do data source rapService; este aqui só mantém o mainService coerente.
aAllEntityTypeBlocks.push(`                <EntityType Name="ImpSetupType">
                    <Key><PropertyRef Name="SetupId"/></Key>
                <Property Name="SetupId" Type="Edm.String" Nullable="false" MaxLength="20"/>
                <Property Name="SchemaVersion" Type="Edm.Int32" Nullable="false"/>
                <Property Name="CreatedByUser" Type="Edm.String" MaxLength="12"/>
                <Property Name="LastChangedByUser" Type="Edm.String" MaxLength="12"/>
                <Property Name="LastChangeDateTime" Type="Edm.DateTimeOffset"/>
                </EntityType>
                <ComplexType Name="ZD_IMPSETUP_STATUS">
                <Property Name="AppliedSteps" Type="Edm.Int32" Nullable="false"/>
                <Property Name="CurrentVersion" Type="Edm.Int32" Nullable="false"/>
                <Property Name="TargetVersion" Type="Edm.Int32" Nullable="false"/>
                </ComplexType>
                <Function Name="GetStatus" IsBound="true">
                    <Parameter Name="_it" Type="Collection(SAPB1S4.ImpSetupType)" Nullable="false"/>
                    <ReturnType Type="SAPB1S4.ZD_IMPSETUP_STATUS" Nullable="false"/>
                </Function>
                <Action Name="RunSetup" IsBound="true">
                    <Parameter Name="_it" Type="Collection(SAPB1S4.ImpSetupType)" Nullable="false"/>
                    <ReturnType Type="SAPB1S4.ZD_IMPSETUP_STATUS" Nullable="false"/>
                </Action>`);
aAllEntitySetBlocks.push(`                <EntitySet Name="ImpSetup" EntityType="SAPB1S4.ImpSetupType"/>`);

const sXml = `<?xml version="1.0" encoding="utf-8"?>
<!--
    MOCK metadata for the sapimport-s4 Custom Business Objects — see docs/cbo-design.md.
    Generated by scripts/generate-mock.js from scripts/schema-model.json. Do not hand-edit;
    change the generator or schema-model.json and re-run instead.

    This is a PLACEHOLDER shape (entity/service names, admin fields) until a real S/4HANA Cloud
    tenant confirms what the "Custom Business Objects" app actually generates.
-->
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
    <edmx:DataServices>
        <Schema Namespace="SAPB1S4" xmlns="http://docs.oasis-open.org/odata/ns/edm">
${aAllEntityTypeBlocks.join("\n")}
            <EntityContainer Name="EntityContainer">
${aAllEntitySetBlocks.join("\n")}
            </EntityContainer>
        </Schema>
    </edmx:DataServices>
</edmx:Edmx>
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "metadata.xml"), sXml, "utf8");
console.log(`Wrote ${path.join(OUT_DIR, "metadata.xml")}`);

// -------------------------------------------------------------------------------------------
// Fixture data — just enough to prove out root+child navigation for sap-fe-mockserver.
// Everything else falls back to generateMockData:true (see ui5-mock.yaml).
// -------------------------------------------------------------------------------------------

function sampleValue(p) {
    if (p.name === "SAP_UUID") return "00000000-0000-0000-0000-000000000001";
    // B1's Y/N-flag convention (db_Alpha, Size 1) — see the Boolean row in the type-mapping table
    // in docs/cbo-design.md. Defaulting these to "N" (not "sample X") keeps YesNoType-bound
    // CheckBoxes rendering sensibly instead of a string that happens to format as unchecked.
    if (p.edm.type === "Edm.String" && p.edm.maxLength === 1) return "N";
    if (p.edm.type === "Edm.String") return p.name === "Code" ? "IMP-0001" : `sample ${p.name}`;
    if (p.edm.type === "Edm.Int32") return 1;
    if (p.edm.type === "Edm.Decimal") return "0.00";
    if (p.edm.type === "Edm.Date") return "2026-09-10";
    if (p.edm.type === "Edm.DateTimeOffset") return "2026-09-10T12:00:00Z";
    if (p.edm.type === "Edm.Guid") return "00000000-0000-0000-0000-000000000001";
    return null;
}

function sampleRow(oEntity, oOverrides) {
    const row = {};
    for (const p of oEntity.props) row[p.name] = sampleValue(p);
    return Object.assign(row, oOverrides);
}

// IMPPCH+PCH1-6 (e ImpSetup) são servidos no app pelo modelo "rap" (data source rapService), que
// no mock usa o $metadata REAL do backend RAP (localService/rapService/metadata.xml, salvo pelo
// `npm run deploy-abap`) — por isso as fixtures deles vão pra lá, não pra mainService/data. O
// metadata real tem SAP_ParentUUID + ReferentialConstraint no _Parent de cada filho, o que deixa o
// mockserver correlacionar filho→pai (o metadata gerado aqui não tem, e Itens vinha sempre vazio).
const RAP_DATA_DIR = path.resolve(__dirname, "../webapp/localService/rapService/data");
const IMPPCH_UUID = "10000000-0000-0000-0000-000000000001";
const impch = CBOS.find(c => c.entitySet === "IMPPCH");
fs.writeFileSync(path.join(RAP_DATA_DIR, "IMPPCH.json"), JSON.stringify(
    [sampleRow(impch.root, { SAP_UUID: IMPPCH_UUID, DocEntry: 1, ProcNum: "IMP-0001" })],
    null, 2), "utf8");
const itens = impch.children.find(c => c.name === "PCH1");
fs.writeFileSync(path.join(RAP_DATA_DIR, "PCH1.json"), JSON.stringify(
    // DocEntry/LineNum apontam para uma linha do fixture de pedidos (purchaseOrderService,
    // pedido 4500000001, item 10) — deixa "Recalcular FOB" e afins testáveis no mock.
    [sampleRow(itens, {
        SAP_UUID: "20000000-0000-0000-0000-000000000001", SAP_ParentUUID: IMPPCH_UUID, LineId: 0,
        ItemCode: "ITEM-001", DocEntry: "4500000001", DocNum: "4500000001", LineNum: 10, Quantity: "100.00"
    })],
    null, 2), "utf8");

console.log(`Wrote fixture data for IMPPCH + PCH1 (root+child nav smoke test) under ${RAP_DATA_DIR}`);

// --- IMPICFG: must have a Code='001' row — the Configs screen's bindElement targets that exact
// key, and generateMockData:true has no way to know to use it (it would pick a random key). ---
// (vai para rapService/data: o app lê IMPICFG pelo modelo "rap", ver RAP_DATA_DIR acima)
const impicfg = CBOS.find(c => c.entitySet === "IMPICFG");
// Mesmos padrões da linha que o setup v3 do backend cria (DefaultValue dos UDFs do [@ICFG] + os
// SetConfig do Inicio.cs, ver icfgInitialValues em generate-abap.js) — sem isso as flags saíam
// todas "N" do sampleRow e o mock se comportava diferente do RAP (ex.: OverPC=N mudava a base de
// PIS/COFINS do Calcular CIF).
const ICFG_DEFAULTS = Object.fromEntries((model.tables.ICFG || [])
    .filter((f) => f.DefaultValue !== undefined && f.DefaultValue !== "")
    .map((f) => [f.Name, f.Type === "db_Numeric" ? Number(f.DefaultValue) : f.DefaultValue]));
Object.assign(ICFG_DEFAULTS, { Expenses: "N", CustoCOFM: "N", MetodoBuscaItem: "1" });
fs.writeFileSync(path.join(RAP_DATA_DIR, "IMPICFG.json"), JSON.stringify(
    [sampleRow(impicfg.root, {
        ...ICFG_DEFAULTS,
        SAP_UUID: "30000000-0000-0000-0000-000000000001",
        Code: "001", Name: "AddOn", Versao: "7.3.3",
        CombImp: "01+02", CombDi: "01+02", DispOrderComb: 1,
        UsageCode: 1, UsageT: 2, UsageF: 3, UsageI: 4, UsageL: 5,
        Financial: "01", TpSendAdu: "05", SepItemCodeDI: "1",
        // Produção, não Validação — o BusinessPlaces do Sidel carrega credenciais reais de
        // Produção (ver docs/po2di-duimp-port-notes.md); testar PO por DI contra Validação com
        // essas chaves dá 422 "Par de chaves inválido ou inexistente" no Portal Único real. Esse
        // valor só vale como DEFAULT de quando o mock é regerado/reiniciado — a tela Configs
        // ainda deixa trocar em tempo de execução (só não sobrevive a um restart do servidor,
        // como qualquer outra edição nesse mock).
        AmbientePU: "https://portalunico.siscomex.gov.br",
        MetodoBuscaItem: "1", PerfilPU: "IMPEXP",
        Precisao: "0.01", MaxItemNF: 60
    })],
    null, 2), "utf8");
console.log(`Wrote fixture data for IMPICFG (Code='001')`);

// --- Value-help lookup entities: a couple of rows each so the SelectDialogs show something ----
const LOOKUP_FIXTURES = {
    AdditionalExpenses: [
        { ExpensCode: "1", Name: "Frete" },
        { ExpensCode: "2", Name: "Seguro" }
    ],
    NotaFiscalUsage: [
        { ID: 1, Usage: "Uso e Consumo", Siscomex: "Uso e Consumo" },
        { ID: 2, Usage: "Revenda", Siscomex: "Revenda" }
    ],
    BusinessPartners: [
        { CardCode: "F00001", CardName: "Despachante Exemplo Ltda" },
        { CardCode: "F00002", CardName: "Fornecedor Previsão Ltda" }
    ],
    SalesTaxCodes: [
        { Code: "ISE", Name: "Isento" },
        { Code: "TRIB", Name: "Tributado" }
    ],
    ChartOfAccounts: [
        { Code: "1.1.01.001", Name: "Conta Transitória Importação" },
        { Code: "1.1.01.002", Name: "Adiantamentos a Fornecedores" }
    ],
    Items: [
        { ItemCode: "SERV-ADU", ItemName: "Serviço Aduaneiro", PurchaseUnitWeight1: 0, PurchaseWeightUnit1: 0, NCMCode: "" },
        { ItemCode: "SERV-DESP", ItemName: "Despesas Diversas", PurchaseUnitWeight1: 0, PurchaseWeightUnit1: 0, NCMCode: "" },
        // Itens "de verdade" (bens importáveis, não serviço) — pra alimentar o cálculo de peso
        // de "Inserir Pedidos" (2 = peso em gramas /1000, 3 = peso em kg direto, ver
        // docs/insert-pedidos-port-notes.md).
        { ItemCode: "ITEM-001", ItemName: "Componente Eletrônico", PurchaseUnitWeight1: 2500, PurchaseWeightUnit1: 2, NCMCode: "85171231" },
        { ItemCode: "ITEM-002", ItemName: "Peça Industrial", PurchaseUnitWeight1: 15, PurchaseWeightUnit1: 3, NCMCode: "84713012" }
    ],
    Warehouses: [
        { WarehouseCode: "TRANS", WarehouseName: "Depósito Trânsito" },
        { WarehouseCode: "01", WarehouseName: "Depósito Principal" }
    ],
    Currencies: [
        { Code: "USD", Name: "Dólar Americano", Rate: 5.0 },
        { Code: "EUR", Name: "Euro", Rate: 5.4 }
    ],
    // Dado real da OBPL do sapimport (B1) do cliente Sidel, colado pelo usuário — WhsCode/
    // WhsTCode/SeqName ficam em branco (não fornecidos). ClientSecret gravado em texto puro por
    // decisão explícita do usuário (é só o mock local, não vai pra produção).
    BusinessPlaces: [
        { BplId: 1, Name: "Sidel", TaxIdNumber: "61.438.206/0001-92", WhsCode: "", WhsTCode: "", SeqName: "", ClientId: "3f2huq6JeZH6GYFkyHlEEWClTeF3TU1r", ClientSecret: "UwBrIgoKI76FUh-yyeS_KfArYU1nHhEh" }
    ]
};
for (const [sEntity, aRows] of Object.entries(LOOKUP_FIXTURES)) {
    fs.writeFileSync(path.join(DATA_DIR, `${sEntity}.json`), JSON.stringify(aRows, null, 2), "utf8");
}
console.log(`Wrote fixture data for ${Object.keys(LOOKUP_FIXTURES).length} value-help lookup entities`);

// --- Pedidos de compra (purchaseOrderService = $metadata REAL do api_purchaseorder_2) ----------
// Campos e formatos como a API real devolve (conferido no tenant my404561): item e linha de remessa
// SEM zeros à esquerda ("10", "1"), peso líquido do item é POR UNIDADE (mesmo material, mesmo peso
// com qualquer quantidade), NCM em BR_NCM. 4 pedidos: 2 abertos de fornecedor estrangeiro (os que "Inserir Pedidos" deve listar),
// 1 de fornecedor nacional (_SupplierAddress.Country "BR", fica de fora) e 1 marcado p/ exclusão
// (PurchaseOrderDeletionCode "L", fica de fora). Empresa/centro 1410 = a empresa brasileira do
// tenant. Supplier reaproveita os códigos do fixture de BusinessPartners.
const PO_DATA_DIR = path.resolve(__dirname, "../webapp/localService/purchaseOrderService/data");
const poHeader = (sPo, sSupplier, sDate, sCurrency, sDeletion) => ({
    PurchaseOrder: sPo, PurchaseOrderType: "NB", CompanyCode: "1410", PurchasingOrganization: "1410",
    PurchasingGroup: "001", Supplier: sSupplier, PurchaseOrderDate: sDate, DocumentCurrency: sCurrency,
    ExchangeRate: sCurrency === "BRL" ? 1 : 5, PurchaseOrderDeletionCode: sDeletion
});
const poAddress = (sPo, sName, sCountry) => ({
    SupplierAddressID: "9" + sPo.slice(-4), PurchaseOrder: sPo, OrganizationName1: sName, Country: sCountry
});
const poItem = (sPo, sItem, sMaterial, sText, fQty, fPrice, sCurrency, sDeletion, fNetWeight, sNcm, sSuppMat) => ({
    PurchaseOrder: sPo, PurchaseOrderItem: sItem, Material: sMaterial, PurchaseOrderItemText: sText,
    CompanyCode: "1410", Plant: "1410", OrderQuantity: fQty, PurchaseOrderQuantityUnit: "PC",
    NetPriceAmount: fPrice, NetPriceQuantity: 1, DocumentCurrency: sCurrency, NetAmount: fQty * fPrice,
    PurchasingDocumentDeletionCode: sDeletion, SupplierMaterialNumber: sSuppMat,
    ItemNetWeight: fNetWeight, ItemWeightUnit: "KG", BR_NCM: sNcm
});
const poSchedule = (sPo, sItem, fQty, fOpen) => ({
    PurchaseOrder: sPo, PurchaseOrderItem: sItem, ScheduleLine: "1",
    ScheduleLineOrderQuantity: fQty, OpenPurchaseOrderQuantity: fOpen, PurchaseOrderQuantityUnit: "PC"
});
const PO_FIXTURES = {
    PurchaseOrder: [
        poHeader("4500000001", "F00002", "2026-08-15", "USD", ""),
        poHeader("4500000002", "F00001", "2026-08-20", "USD", ""),
        poHeader("4500000003", "F00002", "2026-08-22", "BRL", ""),
        poHeader("4500000004", "F00002", "2026-07-01", "USD", "L")
    ],
    PurchaseOrderSupplierAddress: [
        poAddress("4500000001", "Fornecedor Previsão Ltda", "US"),
        poAddress("4500000002", "Despachante Exemplo Ltda", "CN"),
        poAddress("4500000003", "Fornecedor Previsão Ltda", "BR"),
        poAddress("4500000004", "Fornecedor Previsão Ltda", "US")
    ],
    PurchaseOrderItem: [
        poItem("4500000001", "10", "ITEM-001", "Componente Eletrônico", 100, 25.5, "USD", "", 2.5, "8517.12.31", "SC-001"),
        poItem("4500000001", "20", "ITEM-002", "Peça Industrial", 50, 199.9, "USD", "", 15, "8471.30.12", "SC-002"),
        poItem("4500000002", "10", "ITEM-001", "Componente Eletrônico", 30, 25.5, "USD", "", 2.5, "8517.12.31", "SC-001"),
        poItem("4500000003", "10", "ITEM-002", "Peça Industrial", 10, 199.9, "BRL", "", 15, "8471.30.12", ""),
        poItem("4500000004", "10", "ITEM-001", "Componente Eletrônico", 20, 25.5, "USD", "L", 2.5, "8517.12.31", "")
    ],
    PurchaseOrderScheduleLine: [
        poSchedule("4500000001", "10", 100, 100),
        poSchedule("4500000001", "20", 50, 50),
        poSchedule("4500000002", "10", 30, 30),
        poSchedule("4500000003", "10", 10, 10),
        poSchedule("4500000004", "10", 20, 0)
    ]
};
for (const [sEntity, aRows] of Object.entries(PO_FIXTURES)) {
    fs.writeFileSync(path.join(PO_DATA_DIR, `${sEntity}.json`), JSON.stringify(aRows, null, 2), "utf8");
}
console.log(`Wrote fixture data for ${Object.keys(PO_FIXTURES).length} purchase-order entities under ${PO_DATA_DIR}`);

console.log("Every other entity set (IMPPCH's other 5 child nodes, IMPLAY, IMPIPRV/PRV1, CFLNFS/CFLPOR/CFLDUIMP/CFLDESP, DESPCAL) falls back to sap-fe-mockserver's generateMockData:true.");
