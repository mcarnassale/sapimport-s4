# DespCalc screen — port notes

Ported from `../sapimport/webapp/view/DespCalc.view.xml` + `DespCalc.controller.js` — a small,
already-designed CBO: `DESPCAL` (`Code`/`Name`/`Currency`/`Valor`, 4 fields, per
[`cbo-design.md`](cbo-design.md) — "não tem UDO_* próprio... ainda assim vira CBO simples").
Straightforward `sap.m.Table` CRUD screen, no tabs, no child nodes.

## `Code`/`U_Code` split dropped — no longer needed

The B1 original binds two different fields for what the user sees as one "Código" column: a
hidden-from-the-user real key field `Code` (a B1 UDT's business key, which Service Layer requires
set exactly once at creation and doesn't expose as a directly bindable+editable Input in the
normal CRUD flow) and a separate custom mirror field `U_Code` that the user actually types into,
with `onCodeChange` copying the first typed value into `Code`. This entire dance is a B1-specific
workaround — this CBO keys on `SAP_UUID`, not `Code` (same "chaves não sobrevivem 1:1" principle
as every other screen in this project), so `Code` here is just a plain business field like `Name`/
`Currency`/`Valor` — binds directly, no mirror field, no `onCodeChange`.

## `onRecalculate` → `onNotImplemented`

Already just a placeholder in the B1 original itself (`// Placeholder: depends on how the
Processos.cs business logic will be exposed to Fiori`, button `enabled="false"`) — ported as
`onNotImplemented` (shows the new shared `notImplemented` i18n toast, same pattern
[[project-sapimport-s4-processos-detail-screen]]'s round 8 established) instead of a silent no-op,
for when the button eventually gets enabled.

## Currency value-help

Reuses the `Currencies` lookup entity already added for `ProcessosDetail`'s Taxas tab — no new
generator/mock work needed. Simplified from the B1 original's `setValue()` +
`fireChange({value})` combo to a plain `setValue()` — the two-way `{Currency}` binding updates
from `setValue()` alone (a control's bound property updates via its own property-change path, not
only via emitted UI events), and nothing in this screen listens for a "change" event on that
field, so the manual `fireChange()` (needed in the B1 original for the now-dropped
`onCodeChange`-adjacent logic on a *different* field) has no equivalent purpose here.

## Wired into Inicio

Added as `Inicio`'s 3rd tile (`tileDespCalc`, `sap-icon://money-bills`) — see
`docs/inicio-port-notes.md`. `RouteDespCalc` (`"despcalc"`), `onNavBack` → `RouteInicio` (matches
the B1 original, which already went to `RouteInicio` directly, no stopgap needed this time since
`Inicio` already existed when this screen was ported).

## Verified against the mock

`DESPCAL` has no hand-written fixture (falls back to `sap-fe-mockserver`'s `generateMockData`,
150 auto-generated rows) — fine for exercising CRUD, not meant to look realistic. Playwright:
`Inicio` → `DespCalc` tile navigation; the table renders (growing, 20-row initial page); Add Row
creates a transient row inserted at the top (`ODataListBinding#create`'s default `bAtEnd: false`
— a real DOM-selector gotcha this session: templated `sap.m.Table` row clones get IDs like
`despCalcInputCode-__clone3-inner`, not `despCalcInputCode-inner`, so a plain `id$="...-inner"`
suffix match misses them — need `[id*="controlId"][id$="-inner"]` instead); typing into
Code/Name/Valor and picking a Currency via the value-help dialog all work; `onSave`'s
`submitBatch("deferred")` completes with a success toast and no error; nav back to `Inicio` works.
