# Pedidos de compra: API real do S/4HANA Cloud

Desde 2026-10-20 o app lê pedidos de compra da **API real** do tenant S/4HANA Cloud Public Edition,
não mais das entidades placeholder `PurchaseOrders`/`PurchaseOrderLines` do `mainService` (removidas
do `generate-mock.js`). Isso substitui as partes sobre o placeholder em
`insert-pedidos-port-notes.md`, `fob-port-notes.md` e `po2di-duimp-port-notes.md`.

## Serviço e acesso

| | |
|---|---|
| API | `api_purchaseorder_2` (OData V4) — `/sap/opu/odata4/sap/api_purchaseorder_2/srvd_a2x/sap/purchaseorder/0001/` |
| Tenant | `https://my404561-api.s4hana.cloud.sap` (XGJ/100, Partner Demo Customizing — **compartilhado** com outros parceiros) |
| Communication Arrangement | `ACRUX_PED_COMPRA` (cenário `SAP_COM_0053`, Purchase Order Integration) |
| Credenciais | usuário de comunicação em `S4_API_USER`/`S4_API_PASSWORD` (variáveis de ambiente do Windows, nunca no repo) |
| Modelo no app | `po` (data source `purchaseOrderService`), só leitura |

A versão V2 do mesmo acordo (`API_PURCHASEORDER_PROCESS_SRV`) está **obsoleta desde a 2408** e não é
usada.

## Modos de execução

| Comando | Pedidos | Processos (RAP) | Lookups |
|---|---|---|---|
| `npm run start-mock` | mock com o `$metadata` real | mock | mock |
| `npm run start-s4` | **S/4 real** | mock | mock |
| `npm run start-rap` | **S/4 real** | RAP no ABAP Trial | mock |

O acesso real passa pelo middleware local `packages/ui5-middleware-s4-api-proxy`, que injeta o
usuário de comunicação. O `fiori-tools-proxy` não serve porque só aceita um usuário para todos os
backends, e esse já é o do RAP no Trial. O V4 lê por `POST $batch`, então o proxy repassa os cookies
da sessão para o token CSRF funcionar. Um 403 com `x-csrf-token: Required` no primeiro `$batch` é o
handshake normal: o UI5 busca o token e repete.

`npm run fetch-po-metadata` regrava `webapp/localService/purchaseOrderService/metadata.xml` com o
`$metadata` do tenant (rodar quando a SAP atualizar a API). As fixtures do mock ficam em
`generate-mock.js` (`PO_FIXTURES`), no formato que a API real devolve.

## Mapeamento (`webapp/model/purchaseOrders.js`)

O módulo achata a estrutura real no formato que o controller já consumia:

| Usado pelo app | Origem na API real |
|---|---|
| Nome / país do fornecedor | `PurchaseOrder/_SupplierAddress/OrganizationName1`, `/Country` |
| Filtro "só fornecedor estrangeiro" | `$filter=_SupplierAddress/Country ne 'BR'` (no servidor) |
| Pedido não excluído | `PurchaseOrderDeletionCode eq ''` (cabeçalho), `PurchasingDocumentDeletionCode eq ''` (item) |
| Preço unitário | `NetPriceAmount / NetPriceQuantity` (o preço é por unidade de preço) |
| Total da linha (moeda do pedido) | `PurchaseOrderItem/NetAmount` |
| Quantidade em aberto | soma de `_PurchaseOrderScheduleLineTP/OpenPurchaseOrderQuantity` |
| Peso | `ItemNetWeight` (**por unidade**, ver abaixo) + `ItemWeightUnit` |
| NCM | `BR_NCM` do item (quando o cadastro de itens não tem) |
| Total / nº de itens abertos na busca | calculados dos itens não excluídos |

Diferenças que o tenant mostrou:

- **`ItemNetWeight` é por unidade.** O mesmo material (TG11) tem 16,2 KG com quantidade 1, 10, 11
  ou 30. No B1, o `Weight1` da POR1 era o total da linha.
- **O item vem sem zeros à esquerda** (`"10"`, não `"00010"`). O app já converte com `Number()`.
- Não dá para filtrar por `ItemNetWeight` sem a unidade junto (erro `/IWBEP/CM_V4S_RUN/031`).
- **Decimais chegam como string** (`IEEE754Compatible=true`) e são convertidos para número no
  módulo.

Peso e NCM: o cadastro de itens (`Items`) ainda é placeholder e não tem os materiais reais. Quando o
material não está lá, o app usa o peso e o NCM do próprio item do pedido.

## Lacunas

- **Quantidade faturada:** sempre 0. A API de pedido não traz histórico de fatura (precisaria da API
  de fatura de fornecedor, fora deste acordo). A regra "linha já faturada" do "Inserir Pedidos"
  não dispara.
- **Utilização (texto Siscomex), Container, Frete, Seguro, Model:** eram campos da linha do pedido no
  B1 (padrão + UDFs do addon) e não existem na API do S/4. Ficam vazios ou 0. O caminho seria criar
  Custom Fields no item do pedido; o tenant já tem um (`YY1_RESERVA_ORIGEM_PDI`, de outro
  parceiro). Os helpers `_getIsUsageEnabled`/`_getSiscomexUsage` foram removidos.
- **PO por DI não cria mais o pedido.** O POST real exige organização de compras, grupo de compras e
  centro, que o Processo não tem, e materiais do cadastro real de produtos. O fluxo atualiza os
  itens e avisa (`procPO2DICreatePoNotPorted`). O antigo `_createPedidoDraftFromPedidoList` só
  gravava pedidos fake no placeholder.
- **Empresa:** a busca não filtra por empresa (o Processo não tem `CompanyCode`). No tenant, os
  pedidos de fornecedor estrangeiro são todos da empresa **1710 (EUA)**; a empresa brasileira
  **1410** só tem fornecedores BR.

## Verificado (2026-10-20)

- **S/4 real:** a busca trouxe 100 pedidos estrangeiros (com nome e país do fornecedor). Inserido o
  pedido 4500000605: TG11, quantidade 10, preço 15,48, total 154,80, peso 162 kg. Os valores batem
  com a leitura direta da API. "Calcular FOB" com USD = 5: FOB 774 BRL, 154,80 USD, peso 162.
- **Mock:** a busca traz 2 pedidos (exclui o nacional e o excluído); a inserção e o FOB têm os
  mesmos valores de antes da mudança (25,5 / 2550 / 12750 / 250 kg).
