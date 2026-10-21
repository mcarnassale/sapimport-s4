# ProcessosDetail screen — port notes ("esqueleto mínimo" pass)

Ported from `../sapimport/webapp/view/ProcessosDetail.view.xml` (907 lines) +
`ProcessosDetail.controller.js` (**10,188 lines**) against the `IMPPCH` CBO designed in
[`cbo-design.md`](cbo-design.md) — the CBO flagged as the design's single biggest risk (134 root
fields + 6 child nodes, the Itens node alone carrying 84 fields). Given that size, the user
explicitly scoped this pass to an "esqueleto mínimo", built one tab at a time across 7 rounds:
header identification fields + **Itens** (round 1), **Taxas** + its `Moeda` sub-table (round 2,
completed in round 5), **Dados DI** (round 3), **Previsões** (round 4, shell only — no data
source), **Pré Cálculo** (round 5), **Numerários** (round 6, shell only — no data source), and
**Anexos** (round 7, fields only — no attachment table). **All 7 tabs from the B1 original now
exist in some form** — see "Status" at the end of this document for what that does and doesn't
mean. Everything else the original screen does — FOB/CIF calculation buttons; DI/DUIMP import and
compare via Portal Único; layout import/export; antidumping; linked-document buttons (Invoice/
NFN/NFR/RM/RMT); the `TabPreCal` template-auto-load feature; Numerários' Acerto/Adiantamento/
Razão actions; Anexos' file-attachment CRUD and PO-generation buttons — is **not ported**. As of
round 8, all of this now has its **UI restored** (same buttons/menus as the original) wired to a
single `onNotImplemented` stub handler — see round 8, below — so nothing is visually missing
anymore, but none of it does anything real yet. This was a deliberate architecture-validation
pass, not a feature-complete port.

## Round 2: Taxas tab

Added after the Itens-only pass was verified, on the user's explicit choice ("aba Taxas" over
"mais um nó filho" or another specific target) — a cheap increment (root-level form fields only,
no new table/child-node) that exercises more of `IMPPCH`'s 134 root fields without touching the
already-validated child-node binding architecture. All fields this tab needs (`SisComex`/
`Capatazia`/`Prepaid`/`Collect`/`Seguro`/`Aduaneiro`/`Outros`/`AntiDump`, their `Meto*`/`Curr*`
companions, `Courrier`/`Trading`/`PedPai`/`ICMSPre`/`TpSendAdu`/`Canal`/`Usage`, the location/date
fields, and the `To*`/`TToPIS`/`TToCOF` calculated totals) already existed on `IMPPCHType` — no
further CBO/generator gaps found here, unlike the Itens-tab round.

**Added a `Currencies` placeholder lookup entity** (`scripts/generate-mock.js`'s
`LOOKUP_ENTITIES`/`LOOKUP_FIXTURES`, `Code`/`Name` shape, 2 fixture rows USD/EUR) — the 6
currency value-help fields (`CurrPre`/`CurrCol`/`CurrSeg`/`CurrAdu`/`CurrOut`/`CurrAdp`) had no
backing entity yet. Same placeholder-entity convention already established in the Configs port
(real S/4 target likely `API_CURRENCY_SRV`, per `cbo-design.md`'s `OCRN`→Currency mapping, "alta"
confidence — unconfirmed shape without a tenant). Verified via Playwright: the value-help dialog
opens (title "Moedas"), lists both fixture rows, and selecting one writes the code into the field.

**Dropped**: `btnRecalcFob`/`btnRecalcCif` (the FOB/CIF calculation buttons) — out of scope, same
as the rest of the calculation logic. The 4 reform-tributária total fields (`ToIS`/`ToIBSMUN`/
`ToIBSUF`/`ToCBS`) are **always visible**, same simplification already applied to the Itens tab's
reform tax columns (dropping the `previsaoIsReforma` detection toggle).

**Correction (found and fixed in round 5, see below)**: this round's first pass missed that the
B1 original's Taxas `IconTabFilter` also contains a trailing `Moeda`/`PCH2` sub-table
(`currTable`, 3 fields: `CurrCode`/`CurrName`/`Rate`) — an actual oversight, not a scope decision,
since it's inside the same tab and just as cheap as the rest of Taxas. Added in round 5 alongside
Pré Cálculo.

## The actual point of this pass: validating the child-node binding architecture

[[feedback-odatav4-bindelement]] (in the B1 `sapimport` project's memory) documents a multi-round
debugging saga: SAP B1 Service Layer rejects **any** query option on `IMPPCH`'s 5 nested
`PCHnCollection` properties because they're modeled as structural `Collection(...)` properties,
not real navigation properties — the working fix there was abandoning live OData v4 list bindings
entirely in favor of local `JSONModel` arrays + a manual `PATCH` of the whole collection on save.

This project's `metadata.xml` (`scripts/generate-mock.js`) models `IMPPCH`'s 6 child nodes
(`Itens`/`Moeda`/`Despacho`/`Demurrage`/`Previsao`/`LoteSerie`) as **real `NavigationProperty`
associations** (`Collection(SAPB1S4.PCH1Type)` etc., with `NavigationPropertyBinding` entries),
not structural properties — a consequence of this project's CBO design already choosing real
`SAP_UUID` keys and explicit associations over B1's implicit same-table-name convention. That
means, in principle, the B1 project's whole workaround shouldn't be needed here: `itemsTable`
binds `rows="{Itens}"` **directly** (a plain relative V4 list binding against the header context),
using ordinary `oBinding.create({...})`/`oContext.delete()` for add/delete-line — no local array,
no manual PATCH-of-collections on save. `onSave` is correspondingly simpler than the B1 version:
one `submitBatch("deferred")` covers header scalar fields **and** the nested Itens creates/
updates/deletes in a single deep-create/update, since real navigation properties support that
where structural collections could not.

**This could not be fully verified against the mock.** `sap-fe-mockserver` has a known, previously
documented gap (see [[project-sapimport-s4-cbo-design]]): it doesn't correlate a hand-written child
fixture file (`PCH1.json`) to its parent (`IMPPCH.json`) for either `$expand` or a direct
navigation-property request — confirmed again this session via `curl`:
`GET IMPPCH(...)?$expand=Itens` returns the header with no expanded data, and
`GET IMPPCH(...)/Itens` returns `{"value":[]}` even though the fixture row exists. **Notably, this
comes back as a clean 200 with an empty array, not the B1 backend's hard 400 "Not supported query
option"** — a meaningfully different (better) outcome, consistent with these being real navigation
properties rather than structural ones, though it's a mock-only signal, not proof against a real
tenant. Concretely unverified: whether `Itens` rows actually render from server data, whether
`oBinding.create()`/`oContext.delete()` against this nav-property binding produce the request
shape a real S/4 CBO tooling expects, and whether the "new Processo" deep-create (header + Itens
rows in one `submitBatch`) actually reaches the server as one coherent payload. **All of this needs
re-verification once a real tenant or a richer mock (with real cross-entity-set correlation) is
available** — don't treat the architecture as proven, only as "not disproven by what the mock could
show."

## Two real bugs found in `scripts/generate-mock.js` while building this screen (both fixed)

Building the Itens table (the first time any consumer actually needed PCH1's exact field shape)
surfaced two pre-existing generator bugs, neither noticed during the original CBO-design or
Configs/ProcessosList passes since nothing had touched PCH1's fields yet:

1. **`LineNum` was duplicated in every child node's entity type** (`PCH1Type`..`PCH6Type` +
   `PRV1Type`). `buildEntityType()` always injected its `sKeyField` argument as a property, but
   never excluded that same name from the table's own extracted business fields — and
   `schema-model.json` already carries a genuine `ensureField("PCH1", "LineNum", ...)` entry (B1's
   `U_LineNum`, "Linha" — the origin document's line number, a real business field, not a
   structural one), so it appeared twice in the generated EDMX. Fixed by excluding `f.Name ===
   sKeyField` from the business-fields list in `buildEntityType`.
2. **`STRUCTURAL_CHILD_FIELDS` (`DocEntry`/`DocNum`) was silently dropping two genuine PCH1
   business fields.** The B1 view has three *different* underlying Service Layer properties that
   collide after `U_`-stripping: `{DocEntry}` (plain, no prefix — B1's **implicit** structural
   parent-key column every UDT child row gets automatically) vs. `{U_DocEntry}`/`{U_DocNum}`
   (genuinely custom UDFs — "Pedido"/linked Purchase Order and "Doc"/its DocNum, confirmed via
   `ensureField("PCH1", {Name: "DocEntry"/"DocNum"}, ...)` calls in `schemaMigrations.js`, i.e.
   real `SetField` calls, not automatic columns). The generator's filter conflated these: it
   assumed any schema-model.json entry named `DocEntry`/`DocNum` must be the implicit structural
   one — but that field is *never* extracted at all (`extract-schema.js` only ever sees
   `ensureField()` calls), so an entry with that name in `schema-model.json` is, by construction,
   always the genuine custom field. **Fixed by removing `STRUCTURAL_CHILD_FIELDS` entirely** — the
   true structural link is handled correctly already, by the CBO's navigation property itself
   (the "chaves não sobrevivem 1:1" principle in `cbo-design.md` — no exposed FK column needed).
   Verified no other PCH table (`PCH2`-`PCH6`, `PRV1`) has a field named `DocEntry`/`DocNum`, so
   this fix is isolated to PCH1.

   A **third, related rename** avoids the same class of collision resurfacing: the child node's
   synthetic per-row ordinal (previously also named `"LineNum"`, passed as `buildEntityType`'s
   `sKeyField`) is now called **`LineId`** instead — matching what the B1 view's own `#` column
   already calls it (`{LineId}` — a genuine B1 structural per-row sequence number, itself never
   extracted, same reasoning as `DocEntry`) and leaving PCH1's real `LineNum`/"Linha" business
   field alone. Verified no PCH table has a field literally named `LineId` either.

   `bIsChild` — now-unused after removing `STRUCTURAL_CHILD_FIELDS` — was dropped from
   `buildEntityType`'s signature (all 7 call sites updated).

**Run `npm run generate-mock` if you pull these generator changes and don't see them reflected** —
`webapp/localService/mainService/metadata.xml`/`data/*.json` are generated output, not hand-edited
(same discipline as [[feedback-stale-extraction-script-output]]).

## Field mapping decisions in the Itens table

- `colDocEntry` (B1's plain `{DocEntry}`, "Nº do documento") — **dropped**, no CBO equivalent and
  none needed: it was showing the implicit structural parent link, which this project's real
  `Itens` navigation property already handles without an exposed field.
- What was `colUDocEntry`/`{U_DocEntry}` ("Pedido") now binds `{DocEntry}` (the CBO's un-prefixed
  name for that same genuine business field, per the bug-fix above) — kept the same i18n label
  (`procColUDocEntry`). What was `colDocNum`/`{U_DocNum}` ("Doc") now binds `{DocNum}`.
- **Dropped the B1-web-client deep-link behavior** on both of those columns and on `ItemCode`:
  the originals were `Link` controls with `press="onOpenPurchaseOrder"`/`press="onOpenItemMaster"`,
  opening a SAP Business One web client URL scheme (`_openInWebClient`) that has no S/4/Fiori
  Launchpad equivalent designed yet. Rendered as plain `Text` here instead — an S/4 cross-app
  navigation (Manage Purchase Orders / Product master) would need its own design pass later.
- Reform-tributária columns (`Al_CBS`/`Ba_IS`/`Vr_IBSMUN`/etc.) are **always visible** here, unlike
  the B1 original's `visible="{= ${detailView>/previsaoIsReforma} }"` toggle (computed via
  `_detectReformaTributaria`/`_getQtdImpostos`, itself dependent on `SalesTaxCodes` master data
  that isn't designed for S/4 yet). Justified by `cbo-design.md` itself already noting these
  columns are "já presentes no schema atual" as first-class fields, not a legacy-detection toggle
  — simpler to just always show them for this pass than port the detection logic.
- All ~55 SapNumberType-bound columns (price/quantity/rate) were ported to plain
  `sap.ui.model.odata.type.Decimal`, same substitution already established for `Precisao` in the
  Configs port — `acx.sapimport.model.SapNumberType` was never carried into this project (B1-
  admin-info-driven formatting, no S/4-appropriate replacement decided yet).
- `LiDtEmi`/`LiDtVal` bind with `sap.ui.model.odata.type.Date`, not `DateTimeOffset` like the B1
  original — `PCH1Type` declares these as `Edm.Date` (whole-day, no time component), matching this
  project's schema, not a preference call.

## Header fields dropped, and why

- **`Status`, `CreateDate`, `UpdateDate`** — same class of gap already flagged in
  [[project-sapimport-s4-configs-screen]] for `IMPICFG`: these are standard B1 UDO admin fields,
  never created via `ensureField`, so `extract-schema.js` never captured them and they don't exist
  on `IMPPCHType` at all. Not fixed here (would mean revisiting the shared CBO/mock generation,
  out of scope for a single-screen port) — `IMPPCH` only carries `LastChangeDateTime`.
- **`BPLId` (Filial)** renders as a plain `Input` (Int32), not the original's
  `Select items="{/BusinessPlaces}"` — this project's mock has no `BusinessPlaces` entity, and
  `cbo-design.md` already flags `OBPL`/Filial as "baixa confiança, sem equivalente direto claro em
  S/4" (unresolved). Typing a raw ID is an honest placeholder until that's designed.
- **The "selected line"/foreign-suppliers filter toolbar**, the **Insert menu** (Pedidos/
  Processos/Invoices/Arquivo — bulk-insert features), the **Layout menu** (Import Data/Export
  Layout), the **DI menu** (Importar/Comparar/Lote-Série/DUIMP/Antidumping — all Portal Único-
  backed), and the **linked-documents toolbar** (Invoice/NFN/NFR/RM/RMT buttons in the Itens tab)
  were all dropped — each is a substantial, independent feature tied to CBOs/Custom Fields that
  either don't exist yet (linked-document types, per the same gap already flagged in
  [[project-sapimport-s4-processos-list-screen]] for the delete-blocking checks) or need their own
  scoping/design pass (DI/DUIMP Portal Único integration).

## Verified against the mock

ESLint clean. Verified via Playwright (recipe: [[feedback-sapimport-testing]]):

- Opening the existing fixture Processo (`IMP-0001`) binds the header correctly
  (`bindElement("/IMPPCH(<uuid>)")` by the real key, no filter indirection needed).
- `itemsTable`'s `rows` binding resolves to the relative path `"Itens"` (confirms the nav-property
  binding wires up); its length is `0` against the mock, consistent with the already-documented
  fixture-correlation gap, not a binding failure.
- `onAddLine` → `oBinding.create({...})` on that same relative nav-property binding: table length
  goes `0 → 1` client-side.
- Saving that existing Processo (header edit + the newly added Itens row) via `onSave` →
  `submitBatch("deferred")` completes with **no error and a success toast** — the nav-property deep
  create/update the whole point of this pass depends on actually round-trips through the mock's
  `$batch` cleanly.
- Creating a **new** Processo end-to-end: `ProcNum` auto-suggests `"IMP-0002"` (correctly
  incremented from the existing `"IMP-0001"` fixture row — verified the suggestion logic in
  isolation too, since a first chained test run read a stale `"IMP-0001"` due to a test-script
  timing issue, not an app bug), editing `DINum`, saving, and confirming via a direct
  `GET /IMPPCH` afterward that the real backend now has **2** rows — the second with
  `ProcNum:"IMP-0002"`/`DINum:"DI-TEST-001"`, proving the transient-entity create really persisted.
  Correctly navigates back to `RouteProcessosList` only on a successful save.
- The mock's `IMPPCH.json`/`PCH1.json` fixture files on disk are untouched by any of this (confirmed
  by re-reading them after the test run) — same in-memory-only mutation behavior already noted for
  `ProcessosList`'s delete test.

**Still unverified**, same root cause as the fixture-correlation gap above: whether `Itens` rows
that already exist on a real backend actually **load and render** when opening an existing
Processo (the mock can never answer this, since its child-fixture correlation is broken
regardless of what this app does) — needs a real tenant or a smarter mock.

**Taxas tab, verified separately**: opening the existing fixture Processo, switching to the Taxas
tab renders the form (`SisComex` shows `0`, correctly formatted from the fixture's raw `"0.00"`);
the `Currencies` value-help opens, lists both fixture rows, and confirms a selection into
`CurrPre`; saving (header-only edit this time, no Itens changes) completes with a success toast
and no error.

**Dados DI tab, verified separately**: form renders; both `despaTable`/`demurTable` bindings
resolve to the correct relative nav-property paths (`"Despacho"`/`"Demurrage"`); adding a line to
each (via the now-shared `_addChildLine`/`_deleteChildLine` helpers — see below) takes both from
length 0 to 1; saving (both new lines plus the earlier Itens/Taxas edits) completes with a success
toast and no error — the third distinct child node confirmed to round-trip through one
`submitBatch` alongside the header.

## Round 3: Dados DI tab

Added right after Taxas, continuing the same tab order as the B1 original. Two more `IMPPCH`
child nodes: `Despacho`/`PCH3` (3 fields: `DespaCode`/`DespaName`/`DespaNum`) and `Demurrage`/
`PCH4` (11 fields — `AgNavega`/`ContNum`/`DayDemur`/`DespaCode`/`DtContDev`/`DtPgDemur`/
`FreeTime`/`Navio`/`TotDemur`/`VlrDemur`, plus a `BloqSel` flag the B1 view never surfaced either,
left unbound here too), both confirmed present in the CBO with no gaps — same clean outcome as
Taxas, no further generator fixes needed this round. Header form fields (`ViaTransp`/`TpInterm`/
`TpDI`/`PvDtChega`/`PvDtEmbar`/`PvDtPres`/`PvDtChgFa`/`Entrpost`/`DesovaDt`/`RemoEnDt`) also all
existed on `IMPPCHType` already.

**Refactored `onAddLine`/`onDeleteLine` into shared `_addChildLine(sTableId, oDefaults)`/
`_deleteChildLine(sTableId)` helpers** — with a 3rd and 4th child-node table now following the
exact same nav-property-relative bind/create/delete pattern as Itens, keeping 3 near-identical
copies of the same ~15-line logic stopped being reasonable. `onAddLine`/`onDeleteLine`/
`onAddDespaLine`/`onDeleteDespaLine`/`onAddDemurLine`/`onDeleteDemurLine` are now thin one-line
wrappers calling the shared helpers with their own table id. This is the template to keep reusing
for any further child-node tables (Previsão/`PCH5`, LoteSerie/`PCH6`, Moeda/`PCH2` if that tab
gets ported later).

## Round 4: Previsões tab — shell only, no data

Unlike Itens/Despacho/Demurrage, **`previsaoRows` is not a CBO child node at all** — there's no
`PCH`-numbered table backing it, not even in the B1 original. It's a plain local `JSONModel`
array, populated exclusively by tax-determination business logic (`onImpPTax`/`onAtuaValor`/
`onRatearPeso`/`onCriarTax`/`onDeterminacao`/`onDeterminacaoAntiga`, all reading `Get_Imposto`/
`SalesTaxCodes`/`SalesTaxAuthorities` OData data — already flagged elsewhere in this project's
memory as unreliable against real data) and **never persisted** by `onSave` even in the B1
original (`onSave` there only ever touches `PCH1Collection`..`PCH5Collection`). Given that, the
user chose to port only the table shell: same ~48 columns (`Adicao`/`NCM`/`TaxCode`/`ExTaxCode`
plus all the rate/base/value columns per tax type), bound to an empty `detailView>/previsaoRows`
array, with **no toolbar, no calc buttons, no row-selection handler** — it renders correctly but
can never show a row until the determination logic gets its own scoping/port later.

**Two B1-specific things dropped, not just deferred:**
- The 2 DUIMP-mode-conditional columns (`itemDuimp`/`Seq` and `itemCode`, toggled by
  `detailView>/previsaoIsDuimpMode`) — meaningless without DI/DUIMP import, which sets that flag.
  Only the always-shown `NCM` column (`colPrev04`) was kept from that trio.
- The reform-tributária column visibility toggle — same simplification as Itens/Taxas, these 8
  columns (`AlIS`/`VrIS`/`AlIBSMUN`/`VrIBSMUN`/`AlIBSUF`/`VrIBSUF`/`AlCBS`/`VrCBS`) are always
  visible now.

**Verified via Playwright**: tab renders, table is empty (`getLength() === 0`, as expected — no
data source exists yet), and `onSave` still completes cleanly with the tab present (confirms
adding an always-empty local-JSONModel-bound table alongside 3 real nav-property-bound tables
doesn't interfere with `submitBatch`).

**Terminology trap for later, worth flagging now**: the CBO's `Previsao`/`PCH5` nav property
(16 fields, "linhas de previsão de custo" per `cbo-design.md`) does **not** back this "Previsões"
tab — it backs the **"Pré Cálculo"** tab (`procTabPreCalcFilter`/`preCalcTable`, ported next, see
round 5 below). Two very similarly-named tabs, two unrelated data sources.

## Round 5: Pré Cálculo tab

The 4th (and, per `cbo-design.md`, second-to-last) `IMPPCH` child node: `Previsao`/`PCH5`, 16
fields. All present on the CBO, no gaps — same clean outcome as Taxas/Dados DI. Header field
`U_TabPreCal` → `TabPreCal`; the 4 value-help fields in the table (`DespCode`/`Currency`/
`CardCode`/`ItemCode`) all reuse **already-existing** lookup entities (`AdditionalExpenses`,
`Currencies`, `BusinessPartners`, `Items`) — no new generator/mock work needed this round, unlike
Taxas' `Currencies` addition.

**Dropped: the `TabPreCal` template-auto-load feature** (`onTabPreCalValueHelp`/
`onTabPreCalChange`/`_onTabPreCalSelected` in the B1 original) — selecting a code there doesn't
just write a value, it fetches `IMPIPRV`'s `PRV1Collection` template lines, blocks the change if
any downstream document already has an NFN emitted (linked-document check, same class of gap
already flagged for `ProcessosList`'s delete-blocking checks — no linked-doc CBOs designed yet),
validates every template line has a `TpCalc`, **replaces the entire PCH5 table** with the
template's lines, and re-syncs `Currency`/`VrDesp` against `DESPCAL` master data live. That's a
real, self-contained feature, not a simple field mapping — `TabPreCal` here is a plain `Input`,
free text, no value-help, no side effects. Also dropped: the `description="{detailView>
/tabPreCalName}"` display (fed by `_updateTabPreCalName`, itself dependent on the dropped
feature).

**Verified via Playwright**: form renders; `preCalcTable`'s `rows` binding resolves to
`"Previsao"` (confirms this is the 4th distinct child node now proven against the same
`_addChildLine`/`_deleteChildLine` pattern); adding a line takes it from length 0 to 1; saving
(with the new Pré Cálculo line alongside the accumulated Itens/Despacho/Demurrage edits from
earlier rounds) completes with a success toast and no error. Did not re-verify the value-help
mechanism itself in this round (same generic `onValueHelp` already exercised 3 times in Configs/
Taxas/Pré Cálculo's own header fields — a templated `sap.ui.table.Table` cell's value-help icon
doesn't have a stable-enough DOM id to script reliably, not worth chasing given the mechanism
itself isn't new).

**Also fixed in this round: the missed `Moeda`/`PCH2` sub-table inside the Taxas tab** (see the
correction note under round 2, above) — added `currTable` (`rows="{Moeda}"`, `onAddCurrency`/
`onDeleteCurrency` via the shared helpers) right where the B1 original has it, at the end of
`procTabTaxasFilter`. Verified: binding resolves to `"Moeda"` (5th distinct child node), add-line
works, and — as a broader regression check — cycling through all 5 tabs (Itens/Taxas/Dados DI/
Previsões/Pré Cálculo) in one session and then saving still completes cleanly with one
`submitBatch` covering every accumulated edit.

## How to apply

Before extending this screen (adding another tab, wiring FOB/CIF calc, the Previsões
determination logic, etc.), read this document in full.

## Round 6: Numerários tab — shell only, no data

Same shape as Previsões: **not a CBO child node**, not even in the B1 original. `numerarios` is a
plain local array populated exclusively by `BindNumerarios` (a Journal-Entry-style ledger query —
`Tax`/`TransId`/`ActId`/`AcctName`/`TaxDate`/`Debit`/`Credit` per row — not ported) and is
read-only display data (`selectionMode="None"` even in the original; the only interaction is a
per-row "Sel" checkbox that recomputes the debit/credit totals shown in the footer toolbar).
**Worth noting**: half of this tab's action-button menu in the B1 original (`onNumAcertoDespesas`/
`onNumAjusteDespesas`/`onNumAtividades`/`onNumRazao`/`onNumRazaoCancelados`) is *itself* just a
`_showNumerarioNotImplemented()` stub even there — this tab was already partially unfinished in
the source project, not just heavy. Ported: the table shell (empty `detailView>/numerarios`) and
the totals footer toolbar; **dropped the entire action toolbar** (Acerto NF/Despesas,
Adiantamento, Ajuste Despesas, Atividades, Razão menu) — real accounting-entry-creation logic
tied to Journal Entry/linked-document CBOs that don't exist yet, same class of gap as
`ProcessosList`'s delete-blocking checks. Kept `onNumSelChange` (recomputes totals from
`Sel`-checked rows) since it's trivial and has zero real-backend dependency — currently a no-op in
practice since the table is always empty, but ready for when `BindNumerarios` eventually exists.
Also dropped the `TransId` column's `Link`/`press="onNumTransIdPress"` (navigates to a linked
Journal Entry document) in favor of plain `Text` — same reasoning as the B1-web-client deep-links
dropped from the Itens tab.

**Verified via Playwright**: tab renders, table and totals are empty/null as expected, and a
6-tab regression pass (cycling through every tab now ported, then saving) still completes with
one clean `submitBatch` and no error.

## Round 7: Anexos tab — fields only, no attachment table

Anexos splits into 3 unrelated pieces in the B1 original, each a different shape:

1. **A plain `IMPPCH` root-fields form** (`ShipStatus`/`GLDate`/`RemaksShip`/`Dscrption`/`Modal`/
   `PendingGL`/`QtyBoad`/`Service`/`Issue`/`GoodsType`/`BondedWhs`/`OnHold`/`StatusLI`/
   `FreightWdr`/`Canceled`/`Profit`) — same cheap shape as Taxas/Dados DI, all fields already on
   `IMPPCHType`, no gaps. **This is what got ported.**
2. **`anexosTable`** — a real file-attachment list (`FileNameFull`/`AttachmentDate`/`UserID`),
   backed by `_bindAttachments` reading SAP B1's native `Attachments2` Service Layer entity, with
   working Anexar/Baixar/Excluir (upload/download/delete) buttons. Unlike Previsões/Numerários,
   this isn't "no CBO node yet" — it's a **file-storage feature with no S/4-side design at all**
   in this project (no equivalent of `Attachments2` even sketched). **Not ported.**
3. **`procAnexoPOToolbar`**'s 2 buttons (`onAnexoCCPO`, `onAnexoPO2DI`) — "PO por CC"/"PO por DI",
   Purchase-Order-generation features. `onAnexoCCPO` is itself just a
   `_showNumerarioNotImplemented()` stub in the B1 original; `onAnexoPO2DI` is real, substantial
   logic. **Not ported** (the `Profit` field itself, which shared this toolbar in the original,
   was folded into the plain fields form instead).

User chose "só os campos simples" over also adding an empty attachments-table shell (the
Previsões/Numerários pattern) or including the PO-generation buttons.

**Verified via Playwright**: form renders with real fixture data (`ShipStatus` shows the fixture's
`"sample ShipStatus"`); editing a field and then a **full 7-tab regression** — cycling through
every tab now ported (Itens/Taxas/Dados DI/Previsões/Pré Cálculo/Numerários/Anexos) in one session
and saving — completes with one clean `submitBatch` and no error.

## Status: "esqueleto mínimo" scope now complete

All 7 tabs from the B1 original exist in some form: Itens/Taxas(+Moeda)/Dados DI/Pré Cálculo/
Demurrage-and-Despacho(inside Dados DI) are full CRUD against real `IMPPCH` child nodes;
Previsões/Numerários are empty shells with no data source; Anexos is fields-only, no attachment
table. **Nothing here should be mistaken for feature-complete** — see the "not ported" list in
this document's opening paragraph and each round's own notes for the substantial pieces
(calculations, imports, linked documents, file attachments, PO generation, template auto-load)
still missing. The next real step for this screen is almost certainly one of those business-logic
pieces, or a fresh CBO-design pass for whatever it depends on (linked-document CBOs, an S/4
attachment story, etc.) — not another tab.

## Round 8: all dropped buttons/menus restored as "Ainda não implementado" stubs

User's request: bring back every button/menu the original has (Inserir, Layout import/export,
documentos vinculados, Recalcular FOB/CIF, Previsões' determination buttons, `TabPreCal`'s
value-help, Numerários' actions, Anexos' Anexar/Baixar/Excluir + CCPO/PO2DI, the footer DI menu)
so the screen's shape matches the original, wired to a **single shared handler**
(`onNotImplemented`, shows a `MessageToast` with `procNotImplemented` = "Ainda não implementado")
instead of one dedicated JS function per button — same idea the B1 original itself already used
for a few of these (`_showNumerarioNotImplemented`). Real implementations come later, one feature
at a time.

**What got added back** (same labels/icons/placement as the B1 original, `press`/
`valueHelpRequest` repointed to `onNotImplemented`):
- Header: `btnInsert` MenuButton (Pedidos/Processos/Invoices/Arquivo), `btnLayout` MenuButton
  (Importar Dados/Exportar Layout).
- Itens tab: `procLinkedDocsToolbar` (5 buttons — Invoice/NFN/NFR/RM/RMT), `ItemCode` and the
  "Pedido" (`DocEntry`) columns converted back to `Link` (were plain `Text`).
- Taxas tab: `btnRecalcFob`/`btnRecalcCif`.
- Previsões tab: `procPrevisaoToolbar` (ImpPTax/AtuaValor menu, Ratear Peso, Criar Tax,
  Determinação/Determinação Antiga menu).
- Pré Cálculo tab: `TabPreCal` input got `showValueHelp`/`valueHelpRequest` back.
- Numerários tab: `procNumerariosToolbar` (Acerto NF/Despesas menu, Adiantamento, Ajuste
  Despesas, Atividades, Razão/Razão Cancelados menu), `TransId` column back to `Link`.
- Anexos tab: `procAnexosToolbar` (Anexar/Baixar/Excluir) + `anexosTable` itself (empty shell,
  `detailView>/anexos`, same pattern as Previsões/Numerários) + `procAnexoPOToolbar` (CCPO/PO2DI).
- Footer: `btnDI` MenuButton (Importar/Comparar/Lote-Série/Ver Série-Lote/Chave DUIMP/Ver
  Antidumping/Importar Antidumping).

**Not restored**: the hidden `importFileUploader` (`sap.ui.unified.FileUploader`) that backs
Layout import in the B1 original — it has no visible UI of its own (triggered programmatically),
so there was no "button" to restore; add it back together with the real Layout-import
implementation later. The foreign-supplier filter toolbar (`procSelectedLineToolbar`) and
`CreateDate`/`UpdateDate` display also stay dropped — informational bindings needing real backing
state, not buttons.

**Verified via Playwright**: clicked one stub in each affected area (header Insert menu item,
Taxas' Recalcular FOB, Previsões' Ratear Peso, Pré Cálculo's `TabPreCal` value-help icon,
Numerários' Adiantamento, Anexos' Anexar, the footer DI menu's Importar item) — every one shows
the `"Ainda não implementado"` toast. ESLint clean.

## Round 9: DI/DUIMP label toggle on `iDINum` change

Ported `onDINumChange`/`_updateDIDuimpLabels` (`EditText13_ValidateAfter`/`ChangeDItoDUIMP`,
`Processos.b1f.cs:18530-18632`) — the only real behavior attached to editing the "DI" field
(`iDINum`, bound to `DINum`) in the B1 original: when the value is longer than 14 characters
(a DUIMP access key, vs. a classic DI's shorter number), 8 UI texts swap from "DI" wording to
"DUIMP" wording — the field's own label, the footer DI menu's first 3 items (`miDIImportar`/
`miDIComparar`/`miDILoteSerie` — items 4-7 keep the same text in both branches, per the B1
original), the Previsões tab's `btnRatearPeso` ("Ratear Peso" ↔ "Atualizar Peso"), and
`btcImpPTax`'s own face text plus its 2 menu items (`miImpPTax`/`miAtuaValor`). Pure text/label
toggle, no other side effect — `iDINum` had no `change` handler at all before this round (it was
just `value="{DINum}"`, restored as a plain field like everything else in round 8).

Also called from `_onRouteMatched` in both branches — new Processo (right after creating the
transient context, `DINum` starts `""` so this is a no-op that just sets the default DI-wording)
and existing Processo (inside the `bindElement` `dataReceived` callback, after the not-found-error
check) — same as the B1 original calling `ChangeDItoDUIMP` from both `EditText13_ValidateAfter`
and `Form_DataLoadAfter`, so labels are correct immediately on open, not only after an edit.

Added the missing `*Duimp`/`procBtnAtualizarPeso` i18n keys (this project only had the DI-wording
half so far, copied verbatim from the B1 original's `i18n.properties`).

**Verified via Playwright** against the existing fixture (`IMP-0001`, `DINum: "sample DINum"` — 11
chars, so DI-wording by default): confirmed `lDINum`/`btcImpPTax`/`btnRatearPeso` all show DI
wording initially; typing a 15-char value and blurring switches all three to DUIMP wording
(`"DUIMP"`/`"Imp Peso e Tax DUIMP"`/`"Atualizar Peso"`); typing a 10-char value back and blurring
reverts all three to DI wording — confirms the toggle runs on every edit, not just once.

## Round 10: `procSelectedLineToolbar` (foreign-supplier filter field) restored

Reverses part of the "Header fields dropped, and why" decision above — the user asked specifically
to port this field back, same shape as the B1 original: `lSelCardCode` (shows the selected line's
supplier name, falling back to the `procSelCardCode` i18n label when nothing is selected) +
`tSelCardCode` (a `Select` over `detailView>/foreignSuppliers`, bound to `detailView>/
filterCardCode`).

`_loadForeignSuppliers` (called once from `onInit`, same as the B1 original) loads the list from
`/BusinessPartners` — this project's placeholder lookup entity (`CardCode`/`CardName` only, per
`cbo-design.md`), not a real S/4 API. The B1 original filters this list to foreign suppliers only
(`CardType eq SAPB1.BoCardTypes'cSupplier' and Country ne 'BR'`); that filter isn't reproducible
here since the entity has no `CardType`/`Country` fields, so this loads the full list instead —
same simplification already accepted for this same entity in `_pickSupplierForPO2DI`.

`onItemsRowSelectionChange` (new, wired to `itemsTable`'s `rowSelectionChange`) ports only the
supplier-autofill slice of the B1 original's handler of the same name: selecting an Itens row
copies its `CardCode`/`CardName` into `filterCardCode`/`selectedCardName`; clearing the selection
clears both. The rest of the original handler (updating linked-document button state) stays
dropped, same reasoning as the linked-documents toolbar itself (no linked-doc CBOs designed yet).
`_onRouteMatched` resets both properties on navigation, same as `newMode`/`isDirty`.

Not touched: `onAnexoPO2DI`'s `_pickSupplierForPO2DI` dialog (added in the earlier PO2DI/DUIMP
port, see the comment on `onAnexoPO2DI` above) still shows its own one-off `SelectDialog` instead
of reading `filterCardCode` — out of scope for this round, which only restores the field itself.

**Verified via Playwright**: opening the existing fixture Processo shows the label with its
fallback i18n text (`"Fornecedor da Linha:"`) and the Select populated with the fixture's 2
`BusinessPartners` rows (`F00001`/`F00002`) plus the leading empty entry. Could not verify the
row-selection autofill live — `itemsTable` renders 0 rows against the mock, the same
fixture-correlation gap already documented above (Itens never loads from the mock regardless of
what this app does), so there's no row to click; the handler mirrors the original's logic exactly
and reads from the same `CardCode`/`CardName` columns already confirmed present on `PCH1Type`.
