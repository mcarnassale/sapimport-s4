# Configs screen — port notes

Ported from `../sapimport/webapp/view/Configs.view.xml` + `Configs.controller.js` against the
`IMPICFG` CBO designed in [`cbo-design.md`](cbo-design.md). Binds to `/IMPICFG('001')`, same
single-record pattern as the original. This was the first screen ported to `sapimport-s4` — see
[[project-sapimport-s4-cbo-design]] for what existed before it (CBO design + empty scaffold only).

## Value-help entities are placeholders, not real S/4 API shapes

All 6 value-help inputs keep the exact same entity/field names as the B1 Service Layer original
(`AdditionalExpenses`/`ExpensCode`/`Name`, `NotaFiscalUsage`/`ID`/`Usage`,
`BusinessPartners`/`CardCode`/`CardName`, `SalesTaxCodes`/`Code`/`Name`,
`ChartOfAccounts`/`Code`/`Name`, `Items`/`ItemCode`/`ItemName`,
`Warehouses`/`WarehouseCode`/`WarehouseName`) — mocked as flat lookup entities in
`scripts/generate-mock.js` (`LOOKUP_ENTITIES`), not the real S/4 equivalents. The `onValueHelp`
mechanism itself is unchanged from the B1 controller — everything about which entity/fields to
use comes from the view's `customData`, so remapping later only touches the view, not the
controller.

Real S/4 API targets to confirm once a tenant exists:

| Placeholder (this mock) | Likely real S/4 API | Known wrinkle |
|---|---|---|
| `BusinessPartners` (`CardCode`/`CardName`) | `API_BUSINESS_PARTNER` (`A_BusinessPartner`) | key is `BusinessPartner`, display name is `BusinessPartnerFullName`, different shape |
| `Items` (`ItemCode`/`ItemName`) | `API_PRODUCT_SRV` (`A_Product`) | key is `Product`; description lives on a separate language-dependent `to_Description` navigation, not a flat property |
| `ChartOfAccounts` (`Code`/`Name`) | `API_GLACCOUNTINCHARTOFACCOUNTS_SRV` | similar text/description-on-nav-property wrinkle as Product |
| `Warehouses` (`WarehouseCode`/`WarehouseName`) | no direct standard equivalent found | S/4 models this as Storage Location within a Plant, a different concept than a flat B1 Warehouse list |
| `AdditionalExpenses`, `NotaFiscalUsage`, `SalesTaxCodes` | unconfirmed | Brazil-localization/B1-specific concepts (landed-cost codes, CFOP usage, NFe tax codes) — no API identified yet, same uncertainty already flagged in [[project-sapimport-s4hana-feasibility]] for the tax-determination area generally |

## Dropped this pass: Portal Único credentials

`onSavePUCredentials`, the `ClientId`/`Secret` `Input`s, the "Salvar Credenciais" button, and
`webapp/model/crypto.js` were not ported. The original AES-encrypts these onto the logged-in B1
user's own UDFs (`Users` entity) — `docs/cbo-design.md`'s Custom Fields table already flagged this
as needing a real credential-store design (a BTP Destination/credential store) rather than a blind
port, since "encrypted secret in a custom field" is a questionable pattern even in the original.
The other 3 Portal Único fields (`AmbientePU`/`MetodoBuscaItem`/`PerfilPU`, plain `ICFG`-bound
`Select`s with no credential handling) were kept.

## Dropped this pass: `CreateDate`/`UpdateDate`

The original General tab shows `CreateDate`/`UpdateDate` (B1's standard UDT audit timestamps).
This project's CBO mock only carries `LastChangeDateTime` (see `ADMIN_FIELDS` in
`scripts/generate-mock.js`) — no creation-timestamp field was added in the Phase 1 CBO design, a
gap in that design itself (real CBOs typically carry both). Not fixed here (would mean revisiting
the shared `ADMIN_FIELDS` generator, out of scope for a single-screen port) — the General tab just
shows `Code`/`Name`/`Versao` for now.

## `U_Precisao`'s number formatting

The original binds this field with `acx.sapimport.model.SapNumberType` (B1-admin-info-driven
decimal/thousands formatting). That type wasn't carried into `sapimport-s4` (see
[[project-sapimport-s4-cbo-design]] — it turned out to depend on a B1-only endpoint, not actually
generic). Binds as a plain `sap.ui.model.odata.type.Decimal` here instead — loses the custom
formatting, not yet replaced with anything S/4-specific since no such config source is decided.

## Menu screen (resolved)

**Update**: `Inicio` now exists — see `docs/inicio-port-notes.md`. `RouteConfigs` moved off the
app's default pattern (now `"configs"`, `RouteInicio` owns `":?query:"`) and `Configs` got its
`showNavButton`/`onNavBack` back, pointed at `RouteInicio`. The rest of this note is kept for
history: at the time Configs was first ported, `sapimport-s4` had no `Inicio`/menu screen at all,
so `RouteConfigs` was temporarily given the default pattern and the nav-back button was dropped
entirely (nowhere to navigate back to).
