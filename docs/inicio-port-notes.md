# Inicio (menu) screen — port notes

Ported from `../sapimport/webapp/view/Inicio.view.xml` + `Inicio.controller.js`. This is the
proper navigation shell that both `docs/configs-port-notes.md` ("No menu screen yet") and
`docs/processos-list-port-notes.md` ("Minimal nav shell added (not a real menu)") flagged as a
stopgap to revisit once more screens existed — now that Configs, ProcessosList, and
ProcessosDetail all exist, this replaces those stopgaps.

## Tiles: all 5 of the original now exist

The B1 original has 5 tiles: Processos, DespCalc, Layout, PreCalc, Configs — all present in
`sapimport-s4` now: **Processos**/**Configs** (original pass), **DespCalc**
(`docs/despcalc-port-notes.md`), **Layout** (`docs/layout-port-notes.md`), and **PreCalc**
(`docs/precalc-port-notes.md`). Don't confuse `menuPreCalc`/`tilePreCalc` (the standalone master
list of `IMPIPRV`/`PRV1` templates this tile opens) with the "Pré Cálculo" *tab* inside
`ProcessosDetail` (already ported — see [[project-sapimport-s4-processos-detail-screen]]) — same
underlying CBO, two different screens, same terminology trap already flagged once before for
"Previsões" vs. `Previsao`/PCH5.

## Routing changed: `RouteInicio` now owns the default pattern

`RouteConfigs` used to own the app's default route (`":?query:"`) since it was the only screen —
that's now `RouteInicio`'s, and `RouteConfigs` moved to a plain `"configs"` pattern. Both
`Configs` and `ProcessosList` got their nav-back button re-pointed at `RouteInicio` (previously:
`Configs` had no back button at all — "nowhere to navigate back to"; `ProcessosList` went to
`RouteConfigs` as a deliberate temporary stand-in, documented as such). The `configsProcessosButton`
header button added to `Configs` as *its* stopgap (a plain "Processos" button, since there was no
menu to reach `ProcessosList` from otherwise) is now removed — reaching `ProcessosList` goes
through `Inicio` instead, matching the B1 original's actual navigation structure.

## Verified against the mock

Playwright: `Inicio` loads at `/index.html` (default route), all tiles render, `Inicio` →
`ProcessosList` → back → `Inicio` and `Inicio` → `Configs` → back → `Inicio` round-trip (verified
when there were 2 tiles); `Inicio` → `DespCalc` → back → `Inicio` round-trips too (verified when
`DespCalc` was added). No console errors in either pass.
