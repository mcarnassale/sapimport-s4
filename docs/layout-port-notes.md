# LayoutList/LayoutDetail screens — port notes

Ported from `../sapimport/webapp/view/LayoutList.view.xml`/`LayoutDetail.view.xml` +
their controllers, against the `IMPLAY` CBO (`cbo-design.md`: 30 fields, already designed, no
gaps). Same list+detail shape as Configs/ProcessosList/ProcessosDetail, much smaller.

## Key strategy: navigate by `SAP_UUID`, no business-key indirection

`LayoutList.onOpenLayout` passes the row's `SAP_UUID` as the route parameter (not `Code`), and
`LayoutDetail._onRouteMatched` binds directly by `/IMPLAY(<uuid>)` — same pattern established for
`ProcessosList`→`ProcessosDetail`. The B1 original navigated with `encodeURIComponent(Code)`
since `Code` was the real Service Layer key there; here `SAP_UUID` is the real key and it's
already at hand from the list row, so no encoding/business-key dance is needed.

## Y/N checkboxes: two-way `YesNoType` binding, not manual formatter+event

The B1 original binds each of the 5 checkboxes (`Default`/`FirstLine`/`SetPeso`/`SetPrice`/
`BatchExplode`) one-way with `formatter: '.formatYesNo'` and a dedicated `select` handler per
checkbox (`onDefaultSelect`, `onFirstLineSelect`, etc., all funneling into a shared `_setYesNo`)
that manually writes `"Y"`/`"N"` back onto the context. Replaced with the two-way
`acx.sapimport.s4.model.YesNoType` binding already used elsewhere in this project (Configs,
ProcessosDetail) — `selected="{path: 'Default', type: 'acx.sapimport.s4.model.YesNoType'}"` reads
and writes both directions on its own, no per-field JS handler needed.

## `CreateDate`/`UpdateDate` dropped

Same standard-B1-UDO-admin-field gap already flagged for `IMPICFG`/`IMPPCH` — `ensureField` never
captures these (they're automatic B1 UDT columns, not custom fields), so they don't exist on
`IMPLAYType` at all. The B1 original's `visible="{= !${detailView>/newMode} }"` toggle for these 2
fields (and the fields themselves) simply isn't there.

## The "one Default Layout at a time" cross-record logic — kept

`onSave` still ports the B1 original's rule: if this Layout is being saved with `Default = "Y"`,
find every *other* `IMPLAY` row that was also `Default = "Y"` and unset them, before submitting.
Small, self-contained, no B1-specific SQL/blocked-endpoint issue — ported close to verbatim, just
with `Code`/`Default` field names (no `U_` prefix) instead of `Code`/`U_Default`.

## A defensive fix added to `onSave`, and an important correction about *why*

`onSave` now explicitly reads all 5 checkboxes' real `getSelected()` state and writes it onto the
context via `Context#setProperty` (the same synchronous local-cache write used everywhere else in
this project for value-help confirmations) *before* reading `Default`/deciding anything — instead
of trusting the two-way binding to have already committed the checkbox's value onto the context.

**This was added chasing what first looked like a real, confirmed data-loss bug**: an early test
— check the `Default` checkbox on a new Layout, wait 300ms, click Save — produced a console error
(`"Must not change a property before it has been read"`, from `ODataPropertyBinding`) and, when
verified via a direct `GET`, the saved record's `Default` came back `"N"` even though the checkbox
had been checked. That looked exactly like a checkbox-toggle-lost-in-a-navigate-away-race.

**It wasn't.** The test's Playwright selector, `[id*="--checkDefault"]`, is a substring match that
also matches `sap.m.CheckBox`'s own internal child elements (`checkDefault-CbBg`, the wrapper div;
`checkDefault-CB`, the hidden native `<input>`) — **4 elements total** for one checkbox. Playwright
silently clicked one of the non-interactive ones instead of the control's actual root element
(`role="checkbox"`), so `getSelected()` stayed `false` the whole time — nothing was ever really
toggled, and the console error was a side effect of clicking a stray inner element, unrelated to
any real save/navigation timing. Re-tested with the exact root-element id
(`page.locator('[id="containerId---LayoutDetail--checkDefault"]').click()`): the checkbox toggles
correctly, no console error, and the value **persists correctly** (`"Default":"Y"` confirmed via
`GET`) even saving within 300ms — **there was no race condition in the original code.**

The `setProperty`-before-save change is kept anyway — it's harmless, makes `onSave` not depend on
implicit two-way-binding timing, and is a reasonable defensive habit — but **do not carry forward
the "confirmed race condition" framing** if this pattern gets reused elsewhere; verify with a
precise (not substring) element selector before concluding a UI5 control interaction didn't work.

## Verified against the mock

`IMPLAY` has no hand-written fixture (150 auto-generated `generateMockData` rows, same as
`DESPCAL`). Playwright: `Inicio` → `LayoutList` tile nav, list renders; opening an existing row
binds by `SAP_UUID` correctly; editing `Name` and saving returns to the list with a success toast,
no error; creating a new Layout (`Code`/`Name` + checking "Default") saves correctly (verified via
`GET`) and returns to the list.
