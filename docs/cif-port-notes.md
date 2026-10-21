# Recalcular CIF — notas de port (S/4)

Botão **Calcular CIF** (aba Taxas do Processo, `onRecalcularCif` em
`webapp/controller/ProcessosDetail.controller.js`). Porta o `onRecalcularCif` do port B1
(`../sapimport`), que porta `Button13_ClickAfter`/`Recalcula_CIF` do `Processos.b1f.cs`. Parte do
resultado do **Calcular FOB** (ver `fob-port-notes.md`).

## O que faz (igual ao original)

1. **Rateio das despesas do cabeçalho** em cada linha — Capatazia, Collect, Seguro, Aduaneiro,
   Outros e Siscomex — pelo método escolhido em cada uma (`Meto*`):
   - **Adição**: 1 ÷ (linhas da mesma adição × nº de adições);
   - **Peso**: peso da linha ÷ peso total (`PesoLiq`);
   - **Valor** (padrão): valor da linha ÷ total. Collect e Seguro usam FOB+capatazia como base.
   Valores em moeda estrangeira (`Curr*`) convertidos pela taxa da aba Moeda.
2. **CIF da linha** (`PriceTotal`) = FOB (`Price`) + capatazia + collect + seguro + outros.
3. **Impostos** por linha (base `Ba_*` e valor `Vr_*`): II sobre o CIF; PIS/COFINS sobre o CIF
   (`IMPICFG.OverPC = Y`) ou pela base "não cumulativa" do original; IPI sobre CIF + II; ICMS "por
   dentro" incluindo Siscomex, aduaneiro, antidumping, impostos e multa, com reduções; reforma
   tributária (IS/IBS/CBS) sobre o CIF.
4. **Totais no cabeçalho**: `ToCif`, `ToAdd`, `ToII`, `ToPIS`/`ToPISM`/`TToPIS`, `ToCOF`/`ToCOFM`/
   `TToCOF`, `ToIPI`, `ToICMS`, `ToIS`/`ToIBSMUN`/`ToIBSUF`/`ToCBS`, `AntiDump`.

Grava na hora; calcula tudo antes de escrever.

## Diferença principal: de onde vêm as alíquotas

O original **determinava** o código de imposto de cada item (árvore OTCD/TCD1–5 por parceiro, item,
NCM, estado, utilização…) e lia as alíquotas das autoridades fiscais (OSTA via STC1). É o motor de
impostos do B1 — sem equivalente modelado no S/4 (lá a determinação é por condições, outra
estrutura, e exige tenant real).

Aqui as **alíquotas e reduções vêm da própria linha**: `Al_II`, `Al_PIS`, `Al_PISM`, `Al_COF`,
`Al_COFM`, `Al_IPI`, `Al_ICMS`, `Al_IS`/`Al_IBSMUN`/`Al_IBSUF`/`Al_CBS`, `Re_ICMS`, `Re_Ba_ICMS`,
`Reducao1`, `Reducao2` — exatamente os campos que o original gravava depois de determinar. Em
**fração** (0,18 = 18%), como o B1 grava. Base percentual = 100% (o `U_Base` da autoridade fiscal
não tem campo na linha). Quando a determinação for portada (botão "Determinação" ou equivalente
S/4), ela preenche esses campos e o CIF não muda.

## Não portado

- **Antidumping** (UDT `[@DUMP]`, não modelada como CBO): o CIF **mantém** o `Vr_Adp` que a linha
  já tiver (não zera) e o soma em `AntiDump`.
- **Bloqueio "NFN já emitida"**: depende de fatura de fornecedor (não modelada).
- `TaxCode`/`ExTaxCode`/`TradeTaxCode` da linha não são alterados (vinham da determinação).

## Proteções

Processo não salvo; alterações pendentes; sem FOB (`ToFob = 0`); sem peso (`PesoLiq = 0`); sem itens.
Avisos: item com peso zero; itens sem adição.

## Bug achado no caminho

`_getIcfgConfig` lia só 3 campos da configuração (os do primeiro recurso que a usou); o CIF lia
`OverPC` como `undefined` e calculava PIS/COFINS pela base errada. Agora lê a linha inteira. E a
fixture do mock passou a usar os mesmos padrões do setup v3 do RAP (as flags vinham todas "N").

## Testado (2026-10-08)

RAP real e mock, pela UI, contra um cálculo de referência escrito à parte (não o código do app):
pedido 4500000001 com FOB (ITEM-001 R$ 12.750 / 250 kg, ITEM-002 R$ 49.975 / 750 kg), Capatazia
1.000 por Peso, Collect 200 USD (taxa 5) por Valor, Siscomex 500 por Adição (2 linhas na adição
001), II 16 %, IPI 10 %, PIS 2,1 %, COFINS 9,65 %, ICMS 18 %. 22 valores conferidos (linhas e
cabeçalho), 0 diferenças; ex.: ToCif 64.725, ToII 10.356, ToICMS 19.908,5021. O ramo PIS/COFINS
não cumulativo (`OverPC = N`) foi conferido à mão (PIS 1.583,2232, COFINS 7.275,2876). Proteção
"sem FOB" testada.
