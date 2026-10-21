# "Inserir Pedidos" (ProcessosDetail → Itens) — port notes

> **2026-10-20:** os pedidos agora vêm da API real do S/4 (`api_purchaseorder_2`, modelo `po`). As entidades placeholder `PurchaseOrders`/`PurchaseOrderLines` citadas abaixo foram removidas. Ver `docs/s4-purchase-order-api.md`.

Ported `onInsertPedidos`/`_onSearchPedidos`/`_onConfirmInsertPedido`/`_insertPedidoLines` from
`../sapimport/webapp/controller/ProcessosDetail.controller.js` — the user's explicit choice was
the **full faithful flow** (search dialog, cross-Processo quantity dedup, item weight/NCM lookup,
currency handling), not a simplified version. This was previously wired to `onNotImplemented`;
it's now real. `docs/processos-detail-port-notes.md` should be read first for the screen's overall
scope — this note covers only this one feature.

## Correction: Purchase Order mock fields were redone to match the real S/4 API

The first pass modeled `PurchaseOrders`/`PurchaseOrderLines` mirroring the B1 Service Layer shape
(`DocEntry`/`DocNum`/`CardCode`/`CardName`/`Status`/`ItemCode`/`Price`/`LineTotal`/etc.), the same
pattern used for this project's other placeholder lookups (`BusinessPartners`, `Items`,
`Currencies`). **The user explicitly rejected this**: "não era isso que queria, eu quero pedidos
na estrutura s/4hana" — Purchase Orders are a real, well-documented standard S/4 API
(`API_PURCHASEORDER_PROCESS_SRV`), unlike those other lookups (which have no fixed standard
shape this project could target), so there was no reason to default to the B1-mirrored
placeholder pattern here. **Lesson: for a concept that maps to a real, well-known standard S/4
API, model the mock after that API's actual field names — don't default to the B1-mirrored
placeholder shape just because that's the established pattern for lookups without a real
standard equivalent.**

## Purchase Orders are a real S/4 API, not a CBO — but still mock-only placeholder entities

Real S/4HANA Cloud exposes Purchase Orders via `API_PURCHASEORDER_PROCESS_SRV`
(`A_PurchaseOrder`/`A_PurchaseOrderItem`), not a CBO — no tenant exists to confirm every last
field, but the shape below follows that API's actual, documented field names.
`scripts/generate-mock.js` still adds two flat placeholder lookup entities (this app only ever
**reads** Purchase Orders, never creates/edits them, so there's no need for the CBO
header+`NavigationProperty` deep-create pattern — see below):

- **`PurchaseOrders`** (header, key `PurchaseOrder` Edm.String): `Supplier`, `CompanyCode`,
  `PurchaseOrderDate`, `DocumentCurrency`, `PurchasingDocumentDeletionCode` — all genuine
  `A_PurchaseOrder` fields — plus `SupplierName`/`SupplierCountry` (mock convenience: the real API
  needs `$expand=to_Supplier` to get these, flattened here since this isn't a real nav-property
  entity), and `NetAmount`/`OpenItemCount` (mock-only aggregates; no single clean real field for
  "how many lines are still open" without summing `A_PurchaseOrderItem` separately).
- **`PurchaseOrderLines`** (own `SAP_UUID` key, correlated by a plain `PurchaseOrder` field — not
  a nav property): `PurchaseOrder`, `PurchaseOrderItem` (Edm.String, e.g. `"00010"`), `Material`,
  `PurchaseOrderItemText`, `Plant`, `OrderQuantity`, `PurchaseOrderQuantityUnit`,
  `NetPriceAmount`, `DocumentCurrency`, `PurchasingDocumentDeletionCode`, `SupplierMaterialNumber`
  (turned out to be a real standard field, not a custom one) — all genuine `A_PurchaseOrderItem`
  fields — plus `NetAmount`/`NetAmountInCoCodeCrcy` (**correction, see below**: mock-only
  aggregates, not real fields — a real line's net amount lives in pricing-condition entities),
  `OpenQuantity`/
  `InvoicedQuantity` (mock convenience: the real "open"/"already invoiced" quantities live in
  separate GR/IR history entities not modeled here) and `Container`/`FreightAmount`/
  `InsuranceAmount`/`UsageCode`/`InvoiceReference` (addon-specific fields — map conceptually to
  **Custom Fields** on the real `A_PurchaseOrderItem`, same UDF→Custom-Field classification
  pattern as `docs/cbo-design.md`; renamed from the B1 UDFs `Frete`/`Seguro`/`Usage`/`Invoice` for
  clarity). The B1 original's `Model` UDF has no field here at all — it had no clear real-API
  counterpart, so this pass just leaves the target field blank (see below).

## No draft support on the real Purchase Order APIs (V2 or V4) — investigated, not assumed

Came up when the user asked whether S/4 could create a Purchase Order as a draft. Checked the SAP
API Business Hub directly (with a real API key, since `api.sap.com`'s page itself is a
client-rendered SPA that returns no content to a plain fetch — same limitation noted below for the
VDM `.d.ts` files):

- `API_PURCHASEORDER_PROCESS_SRV` (OData V2, used above) — described by SAP as a "synchronous
  service"; no draft.
- `API_PURCHASEORDER_2` (OData V4, Service Group Name confirmed via the Business Hub Attributes
  tab; Business Object `sap-vdm-sot-PurchaseOrder-v1`; comm scenario `SAP_COM_0053`) — the V4
  successor, same "synchronous service" wording. Downloaded its OData EDMX from the Business Hub
  and searched the whole file for `IsActiveEntity` (the marker RAP draft-enabled services expose
  on every draft entity's key): **zero matches**. Confirmed not draft-enabled. Also has no
  sandbox on the Business Hub, so this couldn't be verified by a live test call — the EDMX
  inspection is the authoritative check here.

Conclusion: **no real S/4 Purchase Order integration API (V2 or V4) supports draft.** Draft
(`IsActiveEntity`/`draftAdministrativeData`) is a Fiori Elements UX feature for interactive apps
like "Create Purchase Order - Advanced" (F1002) — those aren't exposed as public integration APIs,
so this project (which only ever reads Purchase Orders via the API-suite service, never creates
them — see above) has no path to draft PO creation even if it later needed to create rather than
just read POs. Not a gap in this project's mock; a real constraint of the target APIs.

## Mock fields re-verified against the actual V4 EDMX and corrected (field names/types, not scope)

While downloading `API_PURCHASEORDER_2`'s EDMX to check for draft (above), the user also had the
full spec (`PurchaseOrder_Type`/`PurchaseOrderItem_Type`, ~70/~190 real properties each) — used it
to re-verify every field this mock already carries, on the same "only fields already in scope, flat
access pattern kept" basis as the rest of this doc (importing the full property set or the real
`NavigationProperty`-based structure was deliberately rejected — would reintroduce the
nav-property-readback mock gap and add ~250 fields this app has no use for). Corrections applied to
`scripts/generate-mock.js` (and regenerated into `metadata.xml`/fixture data via
`node scripts/generate-mock.js` — **never hand-edit `metadata.xml` directly**, per
[[feedback-stale-extraction-script-output]]):

- **`PurchaseOrders` (header) had the wrong field name for its own deletion-code field.** The real
  header field is `PurchaseOrderDeletionCode` (`MaxLength` 1) — this mock had used the *item-level*
  field's name, `PurchasingDocumentDeletionCode`, on the header by mistake. Renamed on the header
  entity only (`generate-mock.js`'s `buildLookupEntity("PurchaseOrders", ...)`, the `PurchaseOrders`
  fixture rows, and both header-scoped uses in `ProcessosDetail.controller.js` — the create payload
  around [ProcessosDetail.controller.js:511](../webapp/controller/ProcessosDetail.controller.js#L511)
  and the `_onSearchPedidos` filter around
  [ProcessosDetail.controller.js:819](../webapp/controller/ProcessosDetail.controller.js#L819)).
  `PurchaseOrderLines`' own `PurchasingDocumentDeletionCode` (item-level, `MaxLength` 1, was
  previously modeled as `MaxLength` 2) was already correctly named — only its `MaxLength` needed
  fixing.
- **`DocumentCurrency`** (header and line): `MaxLength` corrected from 5 to the real 3 (ISO currency
  codes are always 3 chars).
- **`Material`** (line): `MaxLength` corrected from 40 to the real 18.
- **`OrderQuantity`** (line): `Edm.Decimal` precision/scale corrected from 19/4 to the real 13/3.
- **`NetPriceAmount`** (line): precision corrected from 19 to the real 11; the real field's scale is
  `"variable"` (no fixed decimal count), approximated here as a concrete scale of 4 since the mock's
  EDMX needs one.
- **Correction to the `NetAmount` finding below**: `NetAmount` **is** a genuine field on the real V4
  `PurchaseOrderItem_Type` (precision 13, scale `"variable"`, same approximation as above) — the
  "doesn't exist, mock-only" conclusion two sections below was checked only against the **V2**
  VDM (`A_PurchaseOrderItem`/`A_PurOrdPricingElement`) and is still correct for V2; V4 added a flat
  `NetAmount`. `NetAmountInCoCodeCrcy` was re-checked against the full V4 EDMX too and remains
  confirmed absent from both versions — still genuinely mock-only.

**Re-verified against a freshly restarted mock after these changes** (Playwright, same flow as the
original end-to-end verification below): search still returns exactly orders `4500000001`/
`4500000002` (`PurchaseOrderDeletionCode`-based filtering unaffected by the rename), selecting and
confirming `4500000001` still inserts both lines correctly ("2 linha(s) inserida(s)", correct
`ItemCode`/`Doc`/`Pedido`/weight/quantity values), no OData or console errors.

**Correction: `NetAmount`/`NetAmountInCoCodeCrcy` on `PurchaseOrderLines` were wrongly labeled "the
real API's actual naming convention".** Re-verified against the actual
`API_PURCHASEORDER_PROCESS_SRV` VDM (`@sap/cloud-sdk-vdm-purchase-order-service`'s
`PurchaseOrderItem.d.ts`/`PurOrdPricingElement.d.ts`, fetched from unpkg — the api.sap.com API
Business Hub page itself is a client-rendered SPA and returns no content to a plain fetch, so this
package's generated `.d.ts` files are the reliable static source for real field names): neither
field exists on `A_PurchaseOrderItem` or `A_PurOrdPricingElement`. A real line's net amount lives
in pricing-condition entities (`A_PurOrdPricingElement`'s `conditionAmount` etc.), not a flat
field — there's no single clean equivalent without modeling the full pricing-procedure structure.
Reclassified as mock-only aggregates (same class as the header's `NetAmount`/`OpenItemCount`),
computed once here for `_getTotalCurr`-style currency math ([ProcessosDetail.controller.js:582-584
](../webapp/controller/ProcessosDetail.controller.js#L582)) without needing a second query per
line — comment updated in `scripts/generate-mock.js` accordingly. **Everything else in this
section was independently re-verified against the same source and is correct as documented.**

**Deliberately *not* modeled like the CBOs' header+`NavigationProperty` pattern** (`IMPPCH.Itens`,
`IMPIPRV.Itens`, etc.) — same reasoning as before, unaffected by the field-naming correction: this
app only ever reads Purchase Orders, so the deep-create machinery doesn't apply, and two flat,
independently filterable entities sidesteps the nav-property-readback mock gap entirely.

`PurchasingDocumentDeletionCode` (empty string = active, `"L"` = marked for deletion/closed) is
the real S/4 field used as this mock's "open vs. closed" signal — not a fictional `Status`
string, and not the B1 original's enum-literal `DocumentStatus eq SAPB1.BoStatus'bost_Open'`
(this mock's `$filter` parser can't parse `Type'Member'`-style literals anyway, see
[[feedback-sapimport-testing]] item 8).

**Extended two existing placeholder entities**, both intentionally, to support this feature's
calculations (unaffected by this correction):
- `Items` gained `PurchaseUnitWeight1`/`PurchaseWeightUnit1`/`NCMCode` (the B1 original reads
  these via `$expand=NCMCodeSetup($select=NCMCode)`, flattened here into a plain field since this
  is a placeholder, not a real nav-property-shaped entity) — plus 2 new fixture rows
  (`ITEM-001`/`ITEM-002`) that are actual goods, not the pre-existing 2 service-type items
  (`SERV-ADU`/`SERV-DESP`, which correctly compute zero weight).
- `NotaFiscalUsage` gained `Siscomex` (the B1 original's `U_Siscomex`), used by
  `_getSiscomexUsage`.

## PCH1's own DocEntry/DocNum/LineNum stay Edm.Int32 — parsed from the S/4 string keys

`ProcessosDetail`'s own CBO child node `PCH1` ("Itens" tab) has its own `DocEntry`/`DocNum`/
`LineNum` fields, typed `Edm.Int32` because they were derived straight from the B1 original's
schema (`db_Numeric`, see `scripts/schema-model.json`). Since the real S/4 `PurchaseOrder`/
`PurchaseOrderItem` keys are now **strings** (`"4500000001"`, `"00010"`), `_createOnePedidoLine`
parses them via `Number(...)` when populating PCH1's own fields — safe because real S/4 PO/item
numbers are always numeric-only strings. This project's own CBO schema wasn't touched (it mirrors
the B1 original per [[feedback-dpo1-udf-naming]]'s "source of truth is the C# original" rule);
only the parsing at the boundary between the (now string-keyed) Purchase Order mock and the
(still int-keyed) PCH1 changed. S/4 also has no DocEntry-vs-DocNum distinction (only one PO
number) — PCH1's `DocNum` and `DocEntry` both get the same parsed value.

## Fixture data: 4 orders, deliberately including 2 that must be excluded

`PurchaseOrders`/`PurchaseOrderLines` fixtures use PO numbers `4500000001`-`4500000004` (real S/4
format). Orders 1/2 are open, foreign-supplier (the normal case the search should surface); order 3
is open but `SupplierCountry: "BR"` (must be excluded — only foreign-supplier orders are
importable, same rule as the B1 original); order 4 has `PurchasingDocumentDeletionCode: "L"` (must
be excluded). Verified via Playwright against a freshly-started mock: the search returns exactly
orders 1 and 2.

## Simplifications from the B1 original (all deliberate, documented individually)

- **Local currency is hardcoded `"BRL"`** (`_getLocalCurrency`) instead of calling B1's
  `/CompanyService_GetAdminInfo` — that endpoint has no S/4 equivalent and was already deliberately
  not carried into this project (see [[project-sapimport-s4-cbo-design]] on `adminInfo.js`).
  Reasonable given this whole app is Brazil-specific import/customs.
- **No `BPLId`/`CompanyCode` filter in the search.** The B1 original filtered candidate orders by
  the current Processo's branch (`BPLId`). `IMPPCH` has no `CompanyCode` field of its own and no
  established mapping from B1's branch concept to S/4's company code exists yet in this project —
  rather than invent one, this filter was simply dropped (not a B1-vs-S/4 field-naming issue, a
  genuine scope gap, called out here so it isn't mistaken for an oversight later).
- **Cross-Processo quantity dedup** (`_createPedidoLines`'s `$expand=Itens($select=DocEntry,
  LineNum,Quantity)` over `/IMPPCH`) is architecturally sound — `Itens` is a real
  `NavigationProperty` here — but **untested against real data**: this mock has the same
  fixture/freshly-created-entity nav-collection-readback gap already documented in
  `docs/processos-detail-port-notes.md`, so this query likely always returns empty `Itens` arrays
  in practice, making the "already used elsewhere" quantity always compute as `0`. This is a
  **safe fallback** (never blocks an import, at worst permits re-importing a line already used in
  another Processo) but is unverified — needs a real tenant to confirm the `$expand` actually
  works once there's real cross-Processo data to find.

## Two real bugs found and fixed while building/testing this feature

1. **`_insertPedidoLines` was briefly de-asynced to dodge an ESLint `no-undef: Promise` warning**
   (the project's shared `@sap-ux/eslint-plugin-fiori-tools` config doesn't declare `Promise` as a
   known global — a lint-config gap, not a real issue, `Promise` is a completely standard runtime
   global). That "fix" broke the actual control flow: `_onConfirmInsertPedido`'s
   `await this._insertPedidoLines(...)` stopped genuinely waiting for the insert to finish before
   closing the dialog. Reverted — `_insertPedidoLines` is `async` again, uses `new Promise` to
   await the duplicate-order confirmation, and the one resulting `no-undef` warning is accepted
   rather than distorting the code to silence it. **Lesson: don't let a lint warning override
   correctness — verify the warning is even a real problem before restructuring control flow to
   avoid it.**
2. **`_onConfirmInsertPedido` mixed two busy-state mechanisms on the same Dialog** — a declarative
   `busy: "{insertPedidos>/busy}"` binding (used by `_onSearchPedidos`) *and* imperative
   `Dialog#setBusy()` calls (from the B1 original, ported as-is at first). Unified on the
   declarative binding only.

## A suspected "stuck block layer" bug that turned out to be a test artifact, not a real bug

While testing "insert the same Purchase Order twice" (to exercise the duplicate-confirm dialog),
an early test run showed the app apparently frozen behind an orphaned modal block-layer after the
first insert closed. The real cause: **the mock dev server keeps its data in-memory across
requests**, and several earlier test scripts had already run against the *same long-running
server process* without restarting it — so the Purchase Order was already present in the test
Processo's `Itens` from a *previous* script's insert, making the very first insert in a later test
script trigger the legitimate duplicate-confirmation `MessageBox` immediately, which that test
script (written assuming fresh state) hadn't yet reached the point of handling. **Re-verified
against a freshly restarted mock server**: both inserts, the duplicate-confirm text (now showing
the real PO number, e.g. "O pedido 4500000001 já existe no processo..."), and the on-screen
quantity dedup (correctly preventing re-insertion) all work with no actual stuck state.

**Lesson, same family as the `LayoutDetail`/`checkDefault` false alarm** (see
[[project-sapimport-s4-layout-screens]]): when a Playwright test shows unexpected/stuck behavior,
check whether the *test's own assumptions* (fresh state, exact element matched, dialog fully
handled) hold before concluding the app is broken.

## Verified end-to-end against the (freshly restarted) mock, after the field-naming correction

Playwright: opening "Inserir → Inserir Pedidos" on an existing Processo opens the dialog; searching
with empty filters returns exactly the 2 orders that should qualify (`4500000001`, `4500000002` —
not `4500000003`/`4500000004`); selecting order `4500000001` and confirming inserts **both** its
lines with correct field mapping — verified the exact values of both inserted lines end to end:
`ItemCode: "ITEM-002"`/`"ITEM-001"`, `DocEntry`/`DocNum: 4500000001`, `LineNum: 20`/`10` (parsed
from `PurchaseOrderItem` `"00020"`/`"00010"`), `Quantity: 50`/`100`, `PesoTo: 750`/`250` (weight
calc from `Items.PurchaseUnitWeight1`/`PurchaseWeightUnit1`), `TotalCurr: 49975`/`12750` (correctly
picked `NetAmountInCoCodeCrcy` since `DocumentCurrency` `"USD"` ≠ local `"BRL"`), `CardCode`/
`CardName`/`NCMCode`/`SuppCatNum` all correct; saving afterward (`submitBatch`) completes with no
error. Re-inserting the *same* order a second time correctly shows the duplicate-confirmation
dialog with the real PO number in the message; confirming it does **not** duplicate the lines (the
item-row count stays at 2, not 4).

## Correções (2026-10-08, ao ligar o Processo ao backend RAP e portar o "Calcular FOB")

Dois bugs que o mock escondia — a verificação acima conferiu os valores contra a lógica errada:

1. **Número do pedido não cabia no `PCH1.DocEntry`/`DocNum`.** Eram `Edm.Int32` (herdados do B1,
   onde guardavam o DocEntry numérico do OPOR); o número de pedido S/4 tem 10 dígitos
   (`"4500000001"` > 2.147.483.647). O mock aceitava; o RAP recusa ("Conversion error for property
   'DocEntry'") — ou seja, "Inserir Pedidos" não funcionava contra o backend real. Agora os dois
   campos são **String(10)**, o mesmo tipo do `PurchaseOrder` real, e o código compara strings em
   vez de `Number(...)` (override em `scripts/generate-mock.js`, bloco do IMPPCH).
2. **`TotalCurr` invertido.** `TotalCurr` é o total **na moeda do pedido** (no B1: `RowTotalFC` se a
   moeda é estrangeira, `LineTotal` se é local). O port usava `NetAmountInCoCodeCrcy` (moeda da
   empresa) para pedido em moeda estrangeira — um pedido de 2.550 USD gravava 12.750 como se fosse
   USD. Correto: moeda estrangeira → `NetAmount`; local → `NetAmountInCoCodeCrcy`.

Testado de novo contra o RAP e o mock (ver `docs/fob-port-notes.md`): `DocEntry "4500000001"`,
`TotalCurr 2550`/`9995`. No mock a deduplicação entre Processos também passou a ser exercitada: a
fixture IMP-0001 já usa a linha 10 do pedido 4500000001, e só a linha 20 é importada.
