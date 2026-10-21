# Recalcular FOB — notas de port (S/4)

> **2026-10-20:** os pedidos agora vêm da API real do S/4 (`api_purchaseorder_2`, modelo `po`). As entidades placeholder `PurchaseOrders`/`PurchaseOrderLines` citadas abaixo foram removidas. Ver `docs/s4-purchase-order-api.md`.

Botão **Calcular FOB** (aba Taxas do Processo, `onRecalcularFob` em
`webapp/controller/ProcessosDetail.controller.js`). Porta o `onRecalcularFob` do port B1
(`../sapimport`), que por sua vez porta `Button12_ClickAfter`/`Recalcula_FOB` do
`Processos.b1f.cs`.

## O que faz

Para cada linha de Itens que veio de um pedido de compra:

- **Peso** (`PesoTo`) = peso unitário × quantidade. Peso unitário do cadastro do item
  (`Items.PurchaseUnitWeight1`, unidade 2 = gramas → ÷1000) ou, com `IMPICFG.PesoPed = Y`, do
  próprio pedido (`ItemNetWeight`/`ItemWeightUnit` da `A_PurchaseOrderItem`, ≙ `Weight1`/`Wght1Unit`
  da POR1).
- **Valor unitário** (`PriceCurr`) = total da linha do pedido ÷ quantidade do pedido, na moeda do
  pedido.
- **Total na moeda do pedido** (`TotalCurr`) = unitário × quantidade da linha.
- **Total em reais** (`Price`) = `TotalCurr` × taxa da moeda (aba **Moeda**, PCH2).
- `NCMCode` do cadastro do item; `Invoice` = `InvoiceReference` do pedido, se houver.
- Com `PedPai = Y` a quantidade vem do pedido (`OrderQuantity`/`OpenQuantity`), não da linha.

Cabeçalho: `ToFob` = Σ`Price`, `ToCif` = Σ`PriceTotal`, `PesoLiq` = Σ`PesoTo`, `ToFobCurr`/`ToCifCurr`
= ÷ taxa da moeda do pedido de maior número. Grava na hora (como o original, que fazia PATCH).

## Mapeamento B1 → S/4

| B1 (port B1) | S/4 |
|---|---|
| POR1/OPOR via `/SQLQueries` | `PurchaseOrderLines` (`A_PurchaseOrderItem`), filtro por `PurchaseOrder` |
| linha ↔ pedido: `U_DocEntry`/`U_LineNum` = `DocEntry`/`LineNum` da POR1 | `DocEntry` = `PurchaseOrder` (String 10), `LineNum` = `Number(PurchaseOrderItem)` |
| `TotalFrgn` (moeda estrangeira) / `LineTotal` (local) | `NetAmount` (moeda do pedido) / `NetAmountInCoCodeCrcy` (moeda da empresa) |
| `Quantity` / `OpenQty` | `OrderQuantity` / `OpenQuantity` |
| `/pch2` (array local) | navegação `Moeda` (PCH2: `CurrCode`/`Rate`) |
| `CompanyService_GetAdminInfo` | `_getLocalCurrency()` fixo em BRL |

## Não portado (falta modelo de fatura de fornecedor)

O original lê faturas de entrada (OPCH/PCH1/RPC1); no S/4 seria `A_SupplierInvoice`, que este
projeto ainda não modela. Por isso:

- **Bloqueio "NFN já emitida"** — não existe; o FOB sempre roda.
- **Despesas debitadas** (Frete/Seguro/Outros lançados em faturas ligadas ao Processo, rateadas por
  peso ou por FOB) — entram como **0**. Quando houver faturas: somar por `IMPICFG.ItemFrete`/
  `ItemSeguro`/`ItemDebit` e ratear como em `_recalcularFobLines` do port B1.
- **Aviso de desconto no pedido** — o mock da `A_PurchaseOrderItem` não tem campo de desconto.

## Proteções

- Processo novo (não salvo) → erro.
- Alteração pendente → erro ("salve ou cancele antes"): o cálculo parte do que está gravado.
- Linha cujo pedido/item não existe mais → erro, lista as linhas.
- Moeda do pedido sem taxa na aba Moeda → erro, **nada é alterado** (tudo é calculado antes de
  escrever).
- Avisos (não bloqueiam): mesma linha de pedido duas vezes; pedido em moeda local.

## Testado (2026-10-08)

RAP real e mock, pela UI: novo Processo → taxa USD = 5 → Inserir Pedido 4500000001 → Calcular FOB.
Valores conferidos à mão (ITEM-001: 100 × 25,5 USD = 2.550 → R$ 12.750, 250 kg; ITEM-002: 50 × 199,9
= 9.995 → R$ 49.975, 750 kg; ToFob 62.725, ToFobCurr 12.545, PesoLiq 1.000) e gravados no backend.
Proteções de alteração pendente e de taxa ausente também testadas.
