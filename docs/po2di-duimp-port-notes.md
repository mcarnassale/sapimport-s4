# "PO por DI" (ProcessosDetail → Anexos) — port notes, ramo DUIMP

> **2026-10-20:** os pedidos agora vêm da API real do S/4 (`api_purchaseorder_2`, modelo `po`). As entidades placeholder `PurchaseOrders`/`PurchaseOrderLines` citadas abaixo foram removidas. Ver `docs/s4-purchase-order-api.md`.

Ported `onAnexoPO2DI` — só o ramo **DUIMP** (`DINum.length > 14`) — from
`../sapimport/webapp/controller/ProcessosDetail.controller.js`'s `onAnexoPO2DI`/
`_generatePedidoFromDuimp`/`_getPuCredentials`/`_buildPedidoListFromDuimpItens`/
`_updateItemsFromPedidoList`/`_createPedidoDraftFromPedidoList` (`Button14_ClickAfter`,
`Processos.b1f.cs:15444-15473`; `ReadDuimp.GeraPedido`/`CreatePedidoList`/`UpdateItems`/
`CreatePedido`, `ReadDuimp.cs:1294-1573`). Previously wired to `onNotImplemented`; it's now real.

## Scope: ramo DI clássica (upload de XML) explicitamente FORA desta rodada

The B1 original's own code comment above `onAnexoPO2DI` claims the classic-DI branch (file XML
upload) was left unported — **that comment is stale**: `_generatePedidoFromClassicDiXml` (B1
original, line 2187) is real, complete logic (`_pickFile`/`DOMParser` XML parsing, a currency
lookup via `/SQLQueries` against `OCRN`, mass Item create/update, draft creation) — comparable in
size to the DUIMP branch just ported. The user's explicit choice, once this was discovered, was to
scope this round to DUIMP only and treat classic-DI as a separate round of similar size later —
`iDINum.length <= 14` still routes to `onNotImplemented` here.

## First write to Purchase Orders — until now this app only ever read them

`docs/insert-pedidos-port-notes.md` ("Inserir Pedidos") deliberately modeled `PurchaseOrders`/
`PurchaseOrderLines` as **read-only** flat placeholder entities shaped after the real
`API_PURCHASEORDER_PROCESS_SRV` (`A_PurchaseOrder`/`A_PurchaseOrderItem`) fields — this feature is
the first to `create()` rows in them. No architecture change was needed: since these are two flat,
independently-created entities (not a CBO header+`NavigationProperty` pair), a plain
`oModel.bindList("/PurchaseOrders").create({...})` + N `oModel.bindList("/PurchaseOrderLines")
.create({...})` calls in one `submitBatch("deferred")` works the same way every other create in
this app already does.

**No "Series" concept** (B1's `_getSeriesCode`, document-numbering series per branch/doc-type —
no S/4 equivalent): the new `PurchaseOrder` number is self-generated instead, reusing
`_getProximaSeq` (the same numeric-increment helper `_getNextProcNum` already uses) against the
highest existing `PurchaseOrder` in the mock (`"4500000004"` → `"4500000005"`, matches the
fixture's numbering from `docs/insert-pedidos-port-notes.md`).

**No `_openDraftInWebClient`** (B1-web-client deep link, same class of gap already dropped
elsewhere in this project, e.g. the Itens tab's `ItemCode`/`DocEntry` links) — a `MessageToast`
with the new PO number is the only feedback, reusing the existing `procPO2DIDraftCreated` message.

## Credentials: `_getPuCredentials` ported branch-only, no user-level fallback

The B1 original resolves Portal Único `ClientId`/`ClientSecret` in two tiers: branch
(`OBPL`/`BusinessPlaces`) first, then the *current user*'s (`OUSR`, AES-encrypted, entered via
Configs' `onSavePUCredentials`). This project already deliberately dropped the user-level tier
when porting Configs (`docs/configs-port-notes.md` "Dropped this pass: Portal Único credentials")
— **not revisited here**, same decision stands: `_getPuCredentials` only checks
`BusinessPlaces` (`BplId`/`TaxIdNumber`/`ClientId`/`ClientSecret`, the entity + the real Sidel
fixture row added earlier this session, see `docs/cbo-design.md`), returns `null` (shows
`procDIChaveDuimpNoCredentials`) if the branch has no credentials — no second attempt anywhere
else.

## Supplier selection: a dedicated dialog, not the dropped toolbar

The B1 original reads `sCardCode` from `detailView>/filterCardCode`, fed by a "Fornecedor"
`Select` that lived in `procSelectedLineToolbar` — a toolbar this project's ProcessosDetail port
already dropped entirely (`docs/processos-detail-port-notes.md`, header "dropped" list). Rather
than resurrect that whole toolbar for one field, `onAnexoPO2DI` now opens a small dedicated
`SelectDialog` (`_pickSupplierForPO2DI`, `/BusinessPartners`, same `CardCode`/`CardName`
`StandardListItem` shape already used by the generic `onValueHelp`) and resolves a Promise with
the chosen `CardCode` — same as the original, this choice is never persisted anywhere on the
Processo itself.

## Correction: `/pucomex-server` now hits the REAL Portal Único, not a fixture

After seeing the fake DUIMP items come back, the user chose to swap the fixture-based
`packages/ui5-middleware-pucomex-mock` for a **real** middleware, `packages/ui5-middleware-pucomex`
— adapted from `../sapimport` (B1)'s own version (same auth flow: `getAccessToken`/`puGet`
against `*.portalunico.siscomex.gov.br`, same x-csrf-token dance run from Node to dodge a browser
CORS/auth rejection confirmed live in that project). Only the `/duimp` and `/produtos` routes were
ported — the B1 original's third route, `/chaves-acesso`, backs `onDIChaveDuimp`, a feature not
in this project. `ui5-mock.yaml` now registers `pucomex-middleware` instead of
`pucomex-mock-middleware` (both packages still exist on disk — the mock one is just unregistered,
not deleted, in case a future pure-offline repro is needed again).

**Sanity-checked in this sandbox, not fully verified**: the middleware routes correctly and the
real fetch attempt fires (confirmed via `curl` against a running mock dev-server: the response is
a clean `{"message":"fetch failed"}` — a Node-level network error, not a code error) — but this
sandbox has no outbound internet access to actually reach `*.portalunico.siscomex.gov.br`, so the
full real round-trip (auth → DUIMP fetch → produto fetch, using the real Sidel `ClientId`/
`ClientSecret` from `BusinessPlaces`) could not be exercised here. Needs verification on a machine
with real network access.

## Correction: `IMPICFG.AmbientePU` defaulted to Validação, but the Sidel credentials are Produção-only

Real Portal Único returned `422 "Par de chaves inválido ou inexistente"` when testing "PO por DI"
against the real gov API — traced (via the browser Network tab, not guesswork) to
`ambiente=https://val.portalunico.siscomex.gov.br` (Validação) in the actual outgoing request,
even though the user had switched `AmbientePU` to Produção in Configs. Root cause: restarting the
mock dev server (suggested earlier to clear the middleware's in-memory token cache) reloads
`IMPICFG.json` from disk, wiping any in-memory Configs edit back to the file's default — same
"mock keeps data in memory, resets on restart" behavior already documented elsewhere in this
project, this time biting the *screen that configures the very credentials PO por DI needs*.
Fixed at the source: `scripts/generate-mock.js`'s `IMPICFG` fixture now defaults `AmbientePU` to
`https://portalunico.siscomex.gov.br` (Produção) instead of Validação, matching the real
Produção-only Sidel credentials already seeded in `BusinessPlaces` — regenerated via
`npm run generate-mock`. Confirmed via `Invoke-WebRequest` directly against the real Portal Único
(bypassing the app entirely) that these exact credentials + `Role-Type: IMPEXP` authenticate
successfully against Produção (`200 OK`, JWT payload carries `"ambiente":"PRO"`).

## Correction: wrong CNPJ sent to `/produtos` — a real porting mistake, not a Portal Único quirk

Real testing against the real Portal Único surfaced a genuine bug: `/catp/api/ext/produto`
rejected every lookup with `"O usuário logado não é representante legal do CPF/CNPJ Raiz"`
(user is not the legal representative of that root CPF/CNPJ). `_buildPedidoListFromDuimpItens`
was sending `oCreds.sCnpj` (the 14-digit CNPJ from the Filial's `BusinessPlaces` row, used to
*authenticate*) as the `cnpj` query param — but the B1 original actually sends a completely
different value there: `oDuimp.identificacao.importador.ni`, the DUIMP's own **importer's**
CNPJ, truncated to its 8-digit root (`.substring(0, 8)`) — the catalog API's `cpfCnpjRaiz` param
identifies *whose product catalog* to query, which is the DUIMP's importer, not whichever
Filial's credentials happened to authenticate the call. This was a straight porting mistake (a
missed line, not a deliberate simplification) — fixed by reading `sNi` from `oDuimp` the same way
the B1 original does, before building the query.

## Mocked pieces (this round's "tudo mockado" scope, per explicit user choice)

Several B1-specific/external dependencies had no S/4 equivalent to port faithfully — each was
mocked rather than dropped, since the user chose the full flow over a validations-only skeleton:

- **`/pucomex-server/duimp` and `/produtos`** — **no longer mocked**, see the correction above:
  `packages/ui5-middleware-pucomex/pucomex-middleware.js` makes real calls to
  `*.portalunico.siscomex.gov.br`, adapted from the B1 original's own real middleware. The
  fixture-based version (`packages/ui5-middleware-pucomex-mock`, still on disk but unregistered)
  returned one canned DUIMP with 3 items: 2 `ATIVO` + 1 `CANCELADO` (`produto.codigo` 1001 →
  existing `ITEM-001`, 1002 → new `ITEM-999-NOVO`) — kept below for reference in case pure-offline
  testing is needed again later. `_fetchPucomexServer` (the browser-side wrapper) is a verbatim
  port of the B1 original either way — it doesn't know or care whether the server behind it is
  real or mocked.
- **Currency rate** (B1's `SBOBobService_GetCurrencyRate`, a native SAP B1 Service Layer OData
  function import, no S/4 equivalent confirmed): `Currencies` (the existing placeholder lookup
  entity from the Taxas tab) gained a `Rate` field (`USD` 5.0, `EUR` 5.4 — same USD→BRL rate
  `docs/insert-pedidos-port-notes.md` already established), read via a plain filtered list query
  (`_getCurrencyRateToday`) instead of a function-import call.
- **NCM** (B1's `_getNcmAbsEntry`/`NCMCodesSetup`, an `AbsEntry`-keyed master-data indirection):
  **dropped entirely**, not mocked — this project's `Items.NCMCode` is already a plain string
  field (not an `AbsEntry` FK, see `docs/insert-pedidos-port-notes.md`), so the DUIMP product's
  `ncm` string is written there directly.
- **Item Master create/update**: via `Items` (the existing placeholder lookup, real S/4 target
  `API_PRODUCT_SRV`, "alta confiança" per `docs/cbo-design.md`) — plain OData V4
  `create()`/`context.setProperty()` + `submitBatch("deferred")`, no new mock entity needed.

## Simplification not carried over: `PesoPed`/line weight

The B1 original's `IMPICFG.U_PesoPed` flag decides whether to write the DUIMP item's weight onto
the new Pedido line's `Weight1` field. `PurchaseOrderLines` in this project's mock has no
weight-equivalent field (the real `A_PurchaseOrderItem` doesn't carry one either — see the
[Purchase Order Schema](../docs/purchase-order-schema.html) reference published earlier this
session, `itemNetWeight` exists but wasn't carried into this project's placeholder shape). `Peso`
is still read out of the DUIMP payload into each `aPedidoList` entry (in case a future round adds
a weight field) but never written anywhere — a documented gap, not a silently dropped
`Weight1`.

## Correction: the mock echoes back the real DINum instead of a hardcoded fixture number

`onAnexoPO2DI` always correctly read `DINum` from the header context (`iDINum`'s own bound field)
and sent it as-is to `/pucomex-server/duimp?...&numero=...` — that part was never wrong. What was
wrong: `pucomex-mock-middleware.js`'s canned `DUIMP_FIXTURE` hardcoded `duimp.numero:
"26BR00000000001"` in the **response body**, regardless of what `numero` was actually requested —
so the DUIMP data shown back to the user always claimed to be for that fixed number, confusingly
mismatched against whatever real-looking value they'd typed into `iDINum`. Fixed: `handleDuimp`
now overrides `duimp.numero` with the real `numero` query param before responding — the item/
produto data is still entirely fake (that's the nature of a mock), but at least the DUIMP number
it claims to describe matches what was actually asked for.

## Correction: `_getIcfgConfig`'s cache never expired across visits to the screen

`_getIcfgConfig` caches on `this._oIcfgConfig`, checked only once (`if (!this._oIcfgConfig)`) —
same pattern as the B1 original. The gap: UI5's router **reuses the same `ProcessosDetail`
controller instance** across visits to the route (confirmed via Playwright: the DOM id of
`btnAnexoPO2DI` is identical, not duplicated, after leaving and re-entering the screen), so once
`_getIcfgConfig` ran once, it stayed cached for the controller's entire lifetime — a change made
in Configs (e.g. `AmbientePU` from Validação to Produção) between two visits to a Processo was
silently ignored on the second visit, still using whatever was cached on the first. Fixed:
`_onRouteMatched` now sets `this._oIcfgConfig = null` unconditionally at its very start, so every
fresh entry into the screen forces a re-fetch (still cached *within* that one visit, so tab-cycling
doesn't refetch repeatedly — only crossing back in from elsewhere does).

## Verified end-to-end against the (freshly restarted) mock

Playwright: opened the existing fixture Processo, set `BPLId` to `1` (matches the `BusinessPlaces`
Sidel fixture) and `DINum` to a 15-char DUIMP-style value, saved. Switched to the Anexos tab,
clicked "PO por DI" → the supplier-picker dialog opened (title "Selecionar Parceiro de Negócio",
listed both `BusinessPartners` fixture rows); selecting `F00001` (single-select `SelectDialog`
confirms immediately on tap, no separate OK button) proceeded straight to the DUIMP flow. The
"Deseja criar/atualizar os itens?" confirm → Yes created/updated both items. Final toast:
"Rascunho do Pedido de Compra 4500000005 gerado com sucesso." (correctly incremented from the
existing `4500000001`-`4500000004` fixture rows).

Confirmed via direct OData queries against the still-running mock afterward:
- `PurchaseOrders` gained exactly one new row: `PurchaseOrder: "4500000005"`, `Supplier: "F00001"`,
  `CompanyCode: "1"`, `DocumentCurrency: "USD"`.
- `PurchaseOrderLines` gained exactly 2 new rows (the 3rd, `CANCELADO`, item correctly excluded):
  `PurchaseOrderItem` `"00010"`/`"00020"`, `Material` `ITEM-001`/`ITEM-999-NOVO`, `OrderQuantity`
  `100`/`50`, `NetPriceAmount` `25.5`/`199.9`, `NetAmount` `2550`/`9995` (price × quantity),
  `NetAmountInCoCodeCrcy` `12750`/`49975` (`NetAmount × 5.0`, the mocked USD rate).
- `Items`: `ITEM-001` updated (`ItemName` now "Componente Eletrônico", from the DUIMP produto's
  `denominacao`); `ITEM-999-NOVO` created (`ItemName` "Peça Industrial Nova", `NCMCode`
  `84713012`).

ESLint clean (2 pre-existing warnings unrelated to this change: `max-params` on the file's
top-level `sap.ui.define` callback, `no-undef: Promise` — see
[[feedback-sapimport-testing]]-adjacent lesson already documented in
`docs/insert-pedidos-port-notes.md`, not re-litigated here). One new warning, also non-blocking:
`complexity` (22 vs. max 20) on `_buildPedidoListFromDuimpItens` — a near-verbatim port of the B1
original's `CreatePedidoList`, not restructured to dodge the warning (same "don't let a lint
warning override correctness" lesson).

## How to apply

Before extending this feature (porting the classic-DI branch, wiring a real PUCOMEX proxy for
production, adding line weight), read this document in full — especially the "mocked pieces"
section, since more than half of this feature's external dependencies are fixture-backed, not
real integrations.
