# PreCalcList/PreCalcDetail screens — port notes

Ported from `../sapimport/webapp/view/PreCalcList.view.xml`/`PreCalcDetail.view.xml` + their
controllers, against `IMPIPRV` + its child node `PRV1` (`cbo-design.md`: root 2 custom fields
`MetoRate`/`ViaTransp` — neither used by this screen, same as the B1 original — plus `Code`/`Name`;
child `PRV1` 15 fields, already designed, no gaps).

## The actual point of this screen: `IMPIPRV.Itens`→`PRV1` is a real NavigationProperty here too

The B1 original's `PRV1Collection` is a structural property there (same class as
`ProcessosDetail`'s `PCHnCollection`, see [[feedback-odatav4-bindelement]]), forcing the B1
Fiori port into a local-`JSONModel`-array + manual-`PATCH`-on-save workaround (`_oLinesModel`,
`serviceLayer.slFetch` for the save). In this project's CBO design, `IMPIPRV`'s `Itens` nav
property to `PRV1` is modeled as a **real `NavigationProperty`** (confirmed in `metadata.xml`,
same as all 5 of `IMPPCH`'s child nodes) — so `linesTable` binds `rows="{Itens}"` **directly**,
uses plain `oBinding.create()`/`oContext.delete()`, and `onSave` is a single `submitBatch` with
**no manual PATCH and no `serviceLayer.js` dependency at all** — this port is meaningfully
*simpler* than the B1 original, not just a field-name translation.

**Confirmed via the actual batch request body** (not just inferred): saving a new PreCalc table
with one line produces `POST IMPIPRV` with `{"Code":"...", "Name":"", "Itens":[{...the line...}]}`
— the v4 model's deep-create bundles the header and the nested nav-property child creates into
**one POST**, exactly the same architecture already proven for `ProcessosDetail`. A subsequent
`GET .../Itens` (the framework's own post-create refresh) comes back empty against the mock — this
is the same already-documented `sap-fe-mockserver` gap noted for `ProcessosDetail`/`PCH1`, not a
new problem: reading back nav-property children right after creating them isn't reliable in this
mock, but the create itself demonstrably includes them.

## Field/value-help substitutions

- Fields bind without a `U_` prefix (CBO fields, not B1 UDFs).
- `onDespCodeValueHelp` targets **`AdditionalExpenses`** (`ExpensCode`/`Name`), not a separate
  `LandedCostsCodes` entity like the B1 original literally used — same substitution already made
  for `ProcessosDetail`'s Pré Cálculo tab (`docs/processos-detail-port-notes.md`, round 5): one
  canonical placeholder lookup for this concept project-wide, not two parallel ones.
- `onCardCodeValueHelp` **drops** the B1 original's `CardType eq 'cSupplier'` filter (limiting the
  picker to suppliers only) — this project's `BusinessPartners` placeholder lookup entity only has
  `CardCode`/`CardName`, no `CardType` field to filter on. The value-help now lists all
  `BusinessPartners` rows, not just suppliers — a real (if minor) scope narrowing versus the
  original, worth fixing once `BusinessPartners` gets a real S/4 shape (`API_BUSINESS_PARTNER`
  does have a partner-role/category concept to filter on).
- `CreateNF` binds two-way via `acx.sapimport.s4.model.YesNoType`, dropping the original's
  formatter + `select`-event + manual `setProperty` (`onCreateNFSelect`) — same simplification
  already applied to `LayoutDetail`'s checkboxes.

## `onDuplicate` and `onAllExpenses` — ported as real features, not stubbed

Both are small, self-contained (no B1-SQL-blocked-endpoint dependency, no undesigned-CBO
dependency), so they were ported as working logic rather than `onNotImplemented` stubs:
- `onDuplicate` reads all current line contexts via `getAllCurrentContexts()` (not
  `getCurrentContexts()`, which only returns the currently-visible/loaded window — duplication
  needs every line regardless of paging), builds plain-object copies, stashes them alongside a
  `{Code: "", Name: <original name>}` header seed, and navigates to `uuid: "new"`;
  `_onRouteMatched`'s new-mode branch picks up the stash and replays it as
  `oLinesBinding.create(oLine)` calls once the new transient header context (and its own `Itens`
  binding) exists.
- `onAllExpenses` reads existing lines' `DespCode`s the same way, fetches all `AdditionalExpenses`
  rows, and `create()`s a new line for every code not already present.

## Key strategy: `SAP_UUID`, not `Code`

Same pattern as every other list→detail pair in this project (`ProcessosList`/`LayoutList`):
`PreCalcList.onOpen` passes the row's `SAP_UUID`, `PreCalcDetail._onRouteMatched` binds
`/IMPIPRV(<uuid>)` directly — no `encodeURIComponent(Code)` indirection.

## Verified against the mock

Playwright: `Inicio` → `PreCalcList` tile nav; creating a new table (`Code`/`Name`), adding a line
manually, then clicking "Todas Desp" correctly adds exactly the `AdditionalExpenses` fixture's 2
remaining codes (not re-adding the one already present); the `DespCode` value-help dialog opens
(titled "Despesa", lists the fixture); saving completes with a success toast, no error, and
returns to the list. Confirmed via a direct `GET` that the new `IMPIPRV` header row persisted, and
via the raw `$batch` request body (see above) that the line was included in the deep-create POST.
`onDuplicate` was not exercised end-to-end in this pass (the mechanism mirrors
`_onRouteMatched`'s already-tested new-mode line-replay path, just fed by `getAllCurrentContexts()`
instead of a fixed initial array — low incremental risk, but genuinely untested here).
