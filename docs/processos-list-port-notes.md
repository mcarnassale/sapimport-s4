# ProcessosList screen — port notes

Ported from `../sapimport/webapp/view/ProcessosList.view.xml` + `ProcessosList.controller.js`
against the `IMPPCH` CBO designed in [`cbo-design.md`](cbo-design.md). Scope for this pass was
explicitly just the list screen (search, open, delete) — the detail screen (`ProcessosDetail`,
`IMPPCH` header + 6 child nodes `PCH1`-`PCH6`) is not ported yet; see
[`cbo-design.md`](cbo-design.md)'s "IMPPCH — o objeto grande" section for why that one is flagged
as the biggest risk in the whole CBO design (134 root fields + an 84-field child node).

## Fields bind without a `U_` prefix

Same pattern already established by the Configs port: `U_ProcNum`/`U_DINum`/`U_AgentCode`/
`U_Layout`/`U_StatusProc` in the B1 original become `ProcNum`/`DINum`/`AgentCode`/`Layout`/
`StatusProc` here — CBO fields aren't B1 UDFs, no B1 naming convention to inherit. Verified these
5 property names exist in the generated `IMPPCHType` entity type in `metadata.xml`.

## Dropped this pass: the delete-blocking checks (`NotExisteDoc`)

The B1 controller's `DELETE_BLOCK_CHECKS` array ran 7 raw SQL queries (via `serviceLayer.
runSqlQuery`/the `SQLQueries` Service Layer endpoint) against B1-only tables — `PCH1`/`RPC1`
(Invoice/Nota Fiscal/Recebimento), `OJDT` (Acerto Contábil), `PDN1`/`RPD1` (Recebimento de
Mercadoria), `INV1`/`RIN1` (Nota Fiscal de Transferência), `DLN1`/`RDN1` (Entrega de
Transferência), `POR1` (Pedido de Previsão) — to block deleting a Processo that still has a
linked document. None of this ports as-is:

- S/4 CBOs have no raw-SQL-query capability at all (no `SQLQueries` endpoint equivalent).
- Even redesigned as OData reads, half of the linked-document types don't have a confirmed real
  S/4 target yet — `cbo-design.md`'s Custom Fields table marks the Supplier Invoice mapping
  "média" confidence and several others ("OUSG"/Nota Fiscal usage, the Acerto Contábil/Journal
  Entry correlation) haven't been designed at the field level, only the table-to-API mapping.

So `onDeleteProcesso` here is a plain confirm + delete, with **no linked-document check** — a real
regression from the B1 behavior, not a wash. **Needs revisiting** once the linked-document CBOs/
Custom Fields this depends on are actually designed; until then, deleting a Processo that already
has downstream documents in S/4 is not prevented by this screen.

## Delete mechanism: `Context#delete`, not a raw fetch

The B1 controller issued a manual `DELETE /IMPPCH(docEntry)` via `serviceLayer.slFetch` (this
project has no `serviceLayer.js` — CBOs are addressed as plain OData, no B1 Service-Layer-specific
helper needed). Here `onDeleteProcesso` calls the row's own V4 `Context#delete("$direct")`
instead, which both issues the request and removes the row from `procList`'s bindings on success —
no manual `oBinding.refresh()` needed afterward (unlike `_onRouteMatched`, which still refreshes on
route entry, same as the original, in case the list was filtered/stale from a previous visit).
`"$direct"` forces an immediate request outside the model's `deferred` update group (set in
`manifest.json`), matching the original's immediate-DELETE semantics rather than requiring a
separate `submitBatch` call.

## Add/Open are placeholders — `ProcessosDetail` isn't ported yet

`onAdd`/`onOpen` show a `MessageToast` (`procListDetailNotPorted`) instead of navigating to
`RouteProcessosDetail` — that route doesn't exist in `manifest.json` yet, and wiring `navTo` to a
route the router doesn't know about would throw at runtime. Wire these once `ProcessosDetail` is
designed; expect that port to need the same `SAP_UUID`-first binding pattern as
`Configs.controller.js`'s `_onRouteMatched` (see the "chaves não sobrevivem 1:1" rule in
`cbo-design.md`), plus a real answer to the 6-nested-table architecture question the B1 project's
own [[feedback-odatav4-bindelement]] memory had to solve the hard way (structural
`Collection(...)` properties reject any query option — `PCH1Collection`-style local-array +
manual-PATCH rearchitecture, not live V4 list bindings against `Itens`/`Moeda`/`Despacho`/
`Demurrage`/`Previsao`/`LoteSerie`). Whether that same constraint applies here depends on how the
CBO's child nodes are actually exposed once a real tenant is available — `metadata.xml` currently
models them as real `NavigationProperty` associations (`Itens`→`PCH1`, etc.), not structural
properties like the B1 metadata did, so this may turn out easier here — unconfirmed without a
tenant.

## Nav shell (resolved)

**Update**: `Inicio` now exists — see `docs/inicio-port-notes.md`. `ProcessosList`'s nav-back
button now points at `RouteInicio`, and it's reached from `Inicio`'s "Processos" tile, not from a
button on `Configs`. The rest of this note is kept for history: at the time this screen was first
ported, `sapimport-s4` had no `Inicio` menu screen, so `Configs` got a temporary header `Button`
navigating to `RouteProcessosList` and this screen's nav-back button pointed at `RouteConfigs`
instead — an explicitly flagged stopgap, not a real navigation shell.

## Verified against the mock

`IMPPCH.json`'s single fixture row (`ProcNum: "IMP-0001"`) renders in the list; search/filter and
the Configs↔ProcessosList nav round-trip were exercised. Delete was **not** exercised end-to-end
against the mock in this pass — worth a Playwright pass before trusting `Context#delete("$direct")`
actually works against `sap-fe-mockserver`'s DELETE handling for this entity set.
