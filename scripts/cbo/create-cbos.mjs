/**
 * Cria/atualiza no tenant S/4HANA Cloud os Custom Business Objects do sapimport, a partir do
 * contrato OData que o app já consome (webapp/localService/rapService/metadata.xml — o mesmo de
 * onde saiu o backend RAP). Equivalente de DEV ao que o Inicio.cs fazia no B1 (criar tabelas que
 * faltam); nos clientes a estrutura vai por Extensibility Template.
 *
 * Idempotente: CBO que já existe só ganha os nós/campos que faltam (nunca apaga nem altera tipo de
 * campo existente — divergências são só reportadas) e é publicado de novo se mudou algo.
 *
 * Uso: npm run cbo-browser   (1x: abre o Chrome de debug; fazer login no S/4)
 *      npm run create-cbos [-- IMPLAY IMPICFG ...]   (sem argumentos = todos)
 *      npm run create-cbos -- --dry-run              (só mostra o plano)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, guid, ZERO } from "./designer.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const METADATA = path.join(ROOT, "webapp/localService/rapService/metadata.xml");
// Prefixo dos CBOs: o tenant de demo é compartilhado com outros parceiros (o SAP põe o YY1_ sozinho)
const PREFIX = process.env.CBO_PREFIX || "ACX_";

// key: chave semântica do nó raiz (o CBO avisa que não dá para incluir chave depois do transporte).
// Só campo Text pode ser chave — por isso o IMPPCH (DocEntry numérico) fica sem.
const BOS = [
	{ name: "DESPCAL", key: "Code" },
	{ name: "IMPLAY", key: "Code" },
	{ name: "IMPICFG", key: "Code" },
	{ name: "IMPIPRV", key: "Code", children: [{ nav: "Itens", type: "PRV1" }] },
	{
		name: "IMPPCH", children: [
			{ nav: "Itens", type: "PCH1" },
			{ nav: "Moeda", type: "PCH2" },
			{ nav: "Despacho", type: "PCH3" },
			{ nav: "Demurrage", type: "PCH4" },
			{ nav: "Previsao", type: "PCH5" },
			{ nav: "LoteSerie", type: "PCH6" }
		]
	}
];

// Gerados pelo próprio CBO (System Administrative Data) ou técnicos do RAP
const SKIP = new Set(["SAP_UUID", "SAP_ParentUUID", "CreatedByUser", "LastChangedByUser", "LastChangeDateTime", "LocalLastChanged"]);
const TEXT_MAX = 500; // limite do CBO para campo Text (SCBO_CONSISTENCY_CHK/013)

const xml = fs.readFileSync(METADATA, "utf8");

function fieldsOf(sType) {
	const m = xml.match(new RegExp(`<EntityType Name="${sType}Type">([\\s\\S]*?)</EntityType>`));
	if (!m) {
		throw new Error(`EntityType ${sType}Type não encontrado em ${METADATA}`);
	}
	return [...m[1].matchAll(/<Property ([^>]*?)\/?>/g)]
		.map((p) => Object.fromEntries([...p[1].matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1], a[2]])))
		// "__*"/SAP__Messages: controles e mensagens que o RAP injeta no metadata
		.filter((p) => !SKIP.has(p.Name) && !p.Name.startsWith("__") && p.Name !== "SAP__Messages")
		.map((p) => ({ id: p.Name, ...cboType(p) }));
}

function cboType(p) {
	switch (p.Type) {
		case "Edm.String": return { type: "TEXT", length: Math.min(+(p.MaxLength || TEXT_MAX), TEXT_MAX), scale: 0 };
		case "Edm.Decimal": return { type: "NUMBER", length: +(p.Precision || 19), scale: +(p.Scale || 4) };
		case "Edm.Int32": return { type: "NUMBER", length: 10, scale: 0 };
		case "Edm.Date": return { type: "DATE", length: 0, scale: 0 };
		default: throw new Error(`Tipo sem mapeamento para CBO: ${p.Type} (${p.Name})`);
	}
}

// --- argumentos ---
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.filter((a) => !a.startsWith("--")).map((a) => a.toUpperCase());
const plan = BOS.filter((b) => !only.length || only.includes(b.name)).map((b) => ({
	...b,
	cboId: `YY1_${PREFIX}${b.name}`,
	nodes: [
		{ nodeId: `${PREFIX}${b.name}`, fields: fieldsOf(b.name), key: b.key },
		...(b.children || []).map((c) => ({ nodeId: c.nav, fields: fieldsOf(c.type), parent: true }))
	]
}));
if (only.length && plan.length !== only.length) {
	throw new Error(`CBO desconhecido. Válidos: ${BOS.map((b) => b.name).join(", ")}`);
}
for (const b of plan) {
	const f = b.key && b.nodes[0].fields.find((x) => x.id === b.key);
	if (b.key && f?.type !== "TEXT") {
		throw new Error(`${b.name}: chave ${b.key} precisa ser campo Text (é ${f?.type ?? "inexistente"})`);
	}
}

for (const b of plan) {
	console.log(`${b.cboId}: ${b.nodes.map((n) => `${n.nodeId} (${n.fields.length})`).join(", ")}`);
}
if (dryRun) {
	process.exit(0);
}

const api = await connect();
const { call, get, list } = api;

function report(label, messages) {
	for (const m of messages) {
		console.log(`    [${m.severity}] ${label}: ${m.text}`);
	}
	return messages.some((m) => m.severity === "error");
}

async function waitPublished(cboId) {
	for (let i = 0; i < 60; i++) {
		const [r] = await list(`I_Scbo_Registry_C?$filter=BusinessObjectID eq '${cboId}' and IsActiveEntity eq true&$select=PublishState,PublishStateDescription,NumFinishedStep,NumTotalSteps`);
		if (r && r.PublishState !== "P") {
			return r;
		}
		process.stdout.write(`    publicando ${r ? `${r.NumFinishedStep}/${r.NumTotalSteps}` : ""}...\r`);
		await new Promise((res) => setTimeout(res, 10000));
	}
	throw new Error(`${cboId}: publicação não terminou em 10 min`);
}

async function ensureCbo(b) {
	console.log(`\n== ${b.cboId}`);
	const sName = `${PREFIX}${b.name}`;
	let [reg] = await list(`I_Scbo_Registry_C?$filter=(PublishedBusinessObjectID eq '${b.cboId}' or BusinessObjectID eq '${b.cboId}') and IsActiveEntity eq true&$select=BusinessObjectID,PublishState`);
	if (!reg || reg.PublishState === "RF") {
		const desc = encodeURIComponent(sName);
		reg = (await call("POST", `I_Scbo_Registry_CCreate?BusinessObjectId='${b.cboId}'&Description='${desc}'&DescriptionPlural='${desc}s'&ScenarioId=''`)).d;
		console.log("  criado");
	}
	// Antes do 1º publish o ID interno é YY9_<hash>; depois vira o YY1_ publicado
	const id = reg.BusinessObjectID;

	let [draft] = await list(`I_Scbo_Registry_C?$filter=BusinessObjectID eq '${id}' and IsActiveEntity eq false&$select=DraftUUID`);
	if (!draft) {
		draft = (await call("POST", `I_Scbo_Registry_CEdit?BusinessObjectID='${id}'&DraftUUID=${guid(ZERO)}&IsActiveEntity=true`)).d;
	}
	let changed = false;

	const bo = await get(`I_Scbo_Registry_C(BusinessObjectID='${id}',DraftUUID=${guid(draft.DraftUUID)},IsActiveEntity=false)/to_Draft`);
	if (!bo.ServiceGenerationIndicator || !bo.SystemAdminDataGenInd) {
		await call("MERGE", `I_Scbo_Bo_c(BusinessObjectID='${id}',DraftUUID=${guid(bo.DraftUUID)},IsActiveEntity=false)`,
			{ ServiceGenerationIndicator: true, SystemAdminDataGenInd: true });
		changed = true;
		console.log("  Back End Service + System Administrative Data ligados");
	}

	const draftNodes = async () => list(`I_Scbo_Nodes_C?$filter=BusinessObjectID eq '${id}' and IsActiveEntity eq false&$select=NodeID,ParentNodeID,HLevel,DraftUUID`);
	let nodes = await draftNodes();
	const root = nodes.find((n) => n.HLevel === 0);
	for (const n of b.nodes.filter((x) => x.parent)) {
		if (!nodes.some((x) => x.NodeID === n.nodeId)) {
			await call("POST", `I_Scbo_Bo_c(BusinessObjectID='${id}',DraftUUID=${guid(bo.DraftUUID)},IsActiveEntity=false)/to_Node`,
				{ NodeIDForEdit: n.nodeId, ParentNodeID: root.NodeID, Description: n.nodeId, DescriptionPlural: n.nodeId });
			changed = true;
			console.log(`  nó ${n.nodeId} criado`);
		}
	}
	nodes = await draftNodes();

	for (const n of b.nodes) {
		const node = n.parent ? nodes.find((x) => x.NodeID === n.nodeId) : root;
		const nodePath = `I_Scbo_Nodes_C(BusinessObjectID='${id}',NodeID='${node.NodeID}',DraftUUID=${guid(node.DraftUUID)},IsActiveEntity=false)`;
		const existing = new Map((await list(`${nodePath}/to_Element?$select=ElementID,Type,Length,Scale,KeyIndicator,DraftUUID`)).map((e) => [e.ElementID, e]));
		let added = 0;
		for (const f of n.fields) {
			const e = existing.get(f.id);
			if (e) {
				if (e.Type !== f.type || +e.Length !== f.length || +e.Scale !== f.scale) {
					console.log(`    ! ${node.NodeID}.${f.id} existe como ${e.Type} ${+e.Length},${+e.Scale} (contrato: ${f.type} ${f.length},${f.scale}) — não alterado`);
				}
				if (e.KeyIndicator !== (f.id === n.key)) {
					await call("MERGE", `I_Scbo_Elements_C(BusinessObjectID='${id}',NodeID='${node.NodeID}',ElementID='${f.id}',DraftUUID=${guid(e.DraftUUID)},IsActiveEntity=false)`,
						{ KeyIndicator: f.id === n.key });
					changed = true;
					console.log(`    ${node.NodeID}.${f.id}: chave ${f.id === n.key ? "ligada" : "desligada"}`);
				}
				continue;
			}
			await call("POST", `${nodePath}/to_Element`, {
				ElementIDForEdit: f.id, Description: f.id, Type: f.type,
				Length: String(f.length), Scale: String(f.scale), KeyIndicator: f.id === n.key
			});
			added++;
		}
		if (added) {
			changed = true;
		}
		console.log(`  ${node.NodeID}: ${added} campo(s) novo(s), ${n.fields.length - added} já existiam`);
	}

	// "Activation" = Save Draft da tela: grava o rascunho na versão (não publicada) do CBO. O Check do
	// serviço olha essa versão, não o rascunho aberto — por isso a validação fica no Publish abaixo.
	await call("POST", `I_Scbo_Registry_CActivation?BusinessObjectID='${id}'&DraftUUID=${guid(draft.DraftUUID)}&IsActiveEntity=false`);

	const [active] = await list(`I_Scbo_Registry_C?$filter=BusinessObjectID eq '${id}' and IsActiveEntity eq true&$select=PublishState,DraftEtag,HasDraft`);
	// Sem versão pendente (HasDraft false): nada a publicar — acontece quando não mudou nada, e
	// também em mudança só de atributo (ex.: chave) num CBO já publicado, que o Save já aplica
	if (active.PublishState === "S" && (!changed || !active.HasDraft)) {
		console.log(changed ? "  salvo — já publicado, nada pendente" : "  sem mudanças — já publicado");
		return;
	}
	// 1º Publish sem confirmar = verificação de consistência (erros/avisos no sap-message); com só
	// avisos (ex.: "nó filho sem chave"), confirma como a tela faz.
	const publish = (bConfirmed) => call("POST", `I_Scbo_Registry_CPublish?BusinessObjectID='${id}'&DraftUUID=${guid(ZERO)}&IsActiveEntity=true&Confirmed=${bConfirmed}&ConfirmedEtag='${active.DraftEtag}'`);
	const pre = await publish(false);
	if (report("publish", pre.messages)) {
		throw new Error(`${b.cboId}: erro de consistência — corrigido o contrato/script, rode de novo (nada publicado)`);
	}
	if (pre.d?.PublishState !== "P") {
		await publish(true);
	}
	const done = await waitPublished(b.cboId);
	console.log(`  ${done.PublishStateDescription}`);
	if (done.PublishState !== "S") {
		throw new Error(`${b.cboId}: publicação terminou em ${done.PublishState}`);
	}
}

try {
	for (const b of plan) {
		await ensureCbo(b);
	}
	console.log("\nPróximo passo: adicionar o serviço de cada CBO novo ao cenário YY1_ACX_SAPIMPORT (Custom Communication Scenarios) e publicar o cenário.");
} catch (e) {
	console.error(`\nERRO: ${e.message}`);
	process.exitCode = 1;
}
api.disconnect();
