# Custom Business Object design — sapimport → S/4HANA Cloud

Fonte de verdade: [`scripts/schema-model.json`](../scripts/schema-model.json), gerado por
[`scripts/extract-schema.js`](../scripts/extract-schema.js) a partir de
`../sapimport/webapp/model/schemaMigrations.js` (projeto B1 original, não modificado). Esse
script varre **todo** o arquivo — o `freshInstall.run()` e os 163 passos da escada de versão —
porque a escada adiciona campos além da instalação nova (ex. `ICFG.U_IntS4Hana` só existe a
partir de uma versão posterior). Contagens conferidas: **31 tabelas, 490 definições de campo**,
todos os 10 `UDO_*` (estrutura pai/filho + colunas de chave) parseados sem erro.

Este documento é a camada de design/racional em cima do JSON — não repete os ~490 campos aqui,
só agrupa, classifica e sinaliza risco. Para o campo exato, consultar o JSON.

## Como este documento vai ser usado

É o rascunho que alguém digita no app "Custom Business Objects" do S/4HANA Cloud quando houver
um tenant real. **Nada aqui foi validado contra um tenant de verdade** — mesma ressalva já
registrada no levantamento de viabilidade anterior ([[project-sapimport-s4hana-feasibility]]).

## Mapeamento de tipo B1 → CBO

| Tipo B1 (`schemaMigrations.js`) | Campo CBO | Observação |
|---|---|---|
| `db_Alpha`, `Size: 1`, sem `DefaultValue` claramente Y/N | Boolean (ou Text(1), a confirmar) | ~26 desses só em `IPCH` (ver `[[feedback-...]] `padrão Y/N` do resto do app) — checar se o CBO tools trata `Y`/`N` texto ou aceita boolean real |
| `db_Alpha`, `Size: N` (N>1) | Text, comprimento N | |
| `db_Numeric` | Integer | |
| `db_Float` (`SubType: st_Price/st_Rate/st_Quantity/st_Measurement`) | Decimal | `SubType` vira só metadado de exibição (casas decimais), sem campo CBO equivalente direto |
| `db_Date` | Date | |
| `db_Memo` (só `PCH1.SerialNum`) | Long Text | único caso no schema inteiro |
| `DefaultValue` | Default value do campo CBO | |

**Chaves não sobrevivem 1:1.** B1's `DocEntry`/`LineNum` (autogerados pelo DI-API) viram campos
de referência comuns, não a chave real — todo CBO tem sua própria `SAP_UUID` gerada pela
plataforma. Onde o B1 tinha uma chave de negócio (`IPCH.U_ProcNum`, `ICFG.Code='001'`), mantemos
esse campo como chave alternativa/de negócio, marcada como obrigatória+única, não como chave
técnica.

## Classificação das 31 tabelas

### Vira Custom Business Object (8 objetos reais)

| CBO proposto | Tabela(s) B1 | Nós | Campos (raiz) | Risco |
|---|---|---|---|---|
| `IMPICFG` (nome técnico real: prefixo auto-atribuído, provavelmente `YY1_...` — **a confirmar**) | ICFG | único nó, registro singleton (`Code='001'`) | 88 (79 texto, 7 inteiro, 1 decimal, 1 data) | — |
| `IMPPCH` | IPCH + PCH1-6 | raiz + 6 nós filho (1:n) | 134 na raiz | **Alto** — ver seção própria abaixo |
| `IMPLAY` | ILAY | único nó | 30 (23 inteiro, 7 texto) | — |
| `IMPIPRV` | IPRV + PRV1 | raiz + 1 nó filho | raiz: 2, filho `PRV1`: 15 | — |
| `CFLNFS` | CNFS | único nó (lista "choose-from-list" de Notas Fiscais) | 5 | — |
| `CFLPOR` | CPOR | único nó (CFL de Pedidos) | 5 | — |
| `CFLDUIMP` | CDUIMP | único nó (CFL de chaves DUIMP) | 3 | — |
| `CFLDESP` | CDES | único nó (CFL de Despesas) | **0 campos extras encontrados** — ver observação |

**`CFLDESP`/`CDES`**: a extração não achou nenhum `ensureField("CDES", ...)` no arquivo inteiro —
o comentário do próprio `schemaMigrations.js` linha 269 confirma isso é proposital ("CDES fica de
fora de propósito — o original também não chama `SetCampos("CDES",...)` na instalação nova"), ou
seja o UDO usa só as colunas padrão (`Code`/`Name`) do B1. Checar contra `Inicio.cs` antes de
assumir que o CBO real também só precisa de `Code`/`Name` — pode haver campos adicionados fora do
fluxo de instalação automática que esta extração não cobre.

**Revisão (2026-10-08, migração para o backend RAP): os 4 `CFL*` NÃO vão para o backend.** No C#
original são tabelas de rascunho, não dado de negócio: ex. `Processos.b1f.cs` `Set_CFL_Pedidos`
apaga todas as linhas de `[@CPOR]`, regrava com o resultado de uma consulta a OPOR e só então abre
o ChooseFromList do B1 — que só sabe listar objetos UDO, daí a tabela. Idem `[@CNFS]` (Pedido de
compra - dividido.cs), `[@CDUIMP]` (Processos.b1f.cs) e `[@CDES]` (DespCalc.b1f.cs). No Fiori o
diálogo de seleção lista direto de um JSONModel em memória — padrão já usado pelo port do próprio
`Set_CFL_Pedidos` ("Inserir Pedidos", `docs/insert-pedidos-port-notes.md`). Ao portar as funções
que usam os outros três, seguir o mesmo padrão, sem tabela. Continuam no metadata do mock só por
histórico do gerador; nenhuma tela os consome.

**`DESPCAL`** (4 campos: Code/Name/Currency/Valor) não tem `UDO_*` próprio — é uma tabela solta
(`bott_NoObject` no B1, sem objeto de negócio formal), usada pela tela DespCalc. Ainda assim vira
CBO simples (mesma estrutura: um nó, 4 campos) já que é dado real consumido por uma tela ativa —
só não tem as regras de CRUD/log de um UDO completo no B1.

### `IMPPCH` — o objeto grande, risco concentrado aqui

134 campos na raiz (79 texto, 31 decimal, 20 data, 4 inteiro) + 6 nós filho:

| Nó filho | Tabela B1 | Campos | Conteúdo |
|---|---|---|---|
| Itens | PCH1 | 84 (57 decimal — impostos/valores, 18 texto, 6 inteiro, 2 data, 1 memo) | linha de item por Adição/NCM, com toda a árvore de impostos (II/PIS/COFINS/IPI/ICMS/IS/IBS-UF/IBS-MUN/CBS — inclui os campos da Reforma Tributária `Al_CBS`/`Ba_CBS`/`Al_IS`/`Al_IBSMUN`/`Al_IBSUF`, já presentes no schema atual) |
| Moeda | PCH2 | 3 | taxas de câmbio por linha |
| Despacho | PCH3 | 3 | dados de despacho aduaneiro |
| Demurrage | PCH4 | 11 | controle de demurrage/armazenagem |
| Previsão | PCH5 | 16 | linhas de previsão de custo |
| Lote/Série | PCH6 | 7 | rastreamento de lote/série |

**Isso é o item de maior risco do levantamento de viabilidade anterior, agora com número exato:**
134 campos na raiz mais um nó filho de 84 campos é uma estrutura bem maior do que o typical
"poucos campos + uma lista" que a documentação da SAP costuma exemplificar para Custom Business
Objects via key-user tooling. **Precisa validar contra um tenant real** se a ferramenta aguenta
esse volume por nó antes de assumir que o desenho cabe como está — se não couber, a alternativa é
quebrar `IMPPCH` em mais de um CBO relacionado (ex. separar os totais calculados/flags de
bloqueio da raiz em um CBO de "resultado calculado" à parte), decisão a tomar só com o tenant em
mãos, não adivinhada aqui.

### Vira Custom Field, não CBO (11 tabelas — UDFs em tabela padrão do B1)

Estas não são tabelas customizadas — são campos `U_*` pendurados em tabelas **padrão** do B1 via
`UserFieldsMD`. O equivalente direto no S/4 é o app **Custom Fields** (extensibilidade in-app,
sem código), aplicado na entidade padrão correspondente — não precisam de CBO nenhum:

| Tabela B1 (padrão) | Campos U_* | Entidade alvo provável no S/4 | Confiança |
|---|---|---|---|
| `OITM` | 14 | Product (`API_PRODUCT_SRV`) | alta |
| `OBPL` | 5 | `J_1BBRANCH` ("Business Place"/Filial, localização Brasil — fica entre Empresa e Centro, carrega o CNPJ em `STCD1`) | média — mapeamento estrutural confirmado por pesquisa (não por tenant real); **não confirmado se `J_1BBRANCH` está entre os CDS views/APIs "released" que o app Custom Fields do S/4 Cloud Public Edition consegue estender** — Custom Fields só se aplica a contextos de negócio liberados, e essa é uma tabela clássica de localização, não um objeto de API padrão como `Product`/`Purchase Order` |
| `OJDT` + `JDT1` | 3 + 2 | Journal Entry (header/linha) | alta |
| `OINV` + `INV1` + `INV4` | 5 + 17 + 2 | Supplier Invoice / Purchase Invoice | média — modelo de fatura do S/4 é bem diferente do B1 |
| `OCRN` | 1 | Currency | alta |
| `OUSG` | 3 | "Utilização"/uso de NF — sem equivalente óbvio, específico da localização BR do B1 | baixa |
| `OUSR` | 2 | Business User (`U_ClientId`/`U_ClientSecret` do PU — ver `Configs.controller.js` original) | alta (mas repensar onde guardar segredo — ver observação abaixo) |
| `OALC` | 1 | Landed Cost Code | alta |
| `IPF2` | 4 | específico do addon, sem tabela padrão B1 clara na extração — investigar antes de mapear | baixa |

**Observação sobre `OUSR.U_ClientId`/`U_ClientSecret`** (credenciais do Portal Único, ver
`Configs.controller.js#onSavePUCredentials` no projeto original): Custom Fields do S/4 não é
cofre de segredo — guardar client secret criptografado num campo customizado de usuário é
questionável mesmo no B1 original. Ao portar essa tela (fora de escopo desta fase), vale avaliar
um Destination/credential store do BTP em vez de replicar o padrão atual.

**Decisão sobre `OBPL.U_ClientId`/`U_ClientSecret`** (mesmo par de credenciais do Portal Único,
mas por Filial em vez de por usuário — prioridade mais alta que `OUSR` na cadeia de fallback do
original, ver `ProcessosDetail.controller.js` do B1, linhas 5193-5266): ao contrário de `OUSR`
(dropado deliberadamente na porta de `Configs`, ver `docs/configs-port-notes.md` "Dropped this
pass"), a decisão aqui foi **modelar como Custom Field em `J_1BBRANCH` mesmo assim** — mesmo
padrão do B1 original, aceitando a mesma fragilidade de guardar segredo criptografado em campo
customizado em vez de um Destination/credential store do BTP. Ainda não portado (nenhuma tela
usa isso ainda) — quando for, os outros 3 campos de `OBPL` (`WhsCode`/`WhsTCode`/`SeqName`) são
Custom Fields simples sem essa ressalva.

**Implementado no mock**: `scripts/generate-mock.js` já tem a entidade placeholder
`BusinessPlaces` (`BplId`/`Name`/`TaxIdNumber`/`WhsCode`/`WhsTCode`/`SeqName`/`ClientId`/
`ClientSecret`) com **1 fixture real** — os dados de produção da Filial "Sidel", colados pelo
usuário a partir da `OBPL` do sapimport (B1): CNPJ `61.438.206/0001-92`, `ClientId`
`3f2huq6JeZH6GYFkyHlEEWClTeF3TU1r`, `ClientSecret` `UwBrIgoKI76FUh-yyeS_KfArYU1nHhEh` (gravado em
texto puro por decisão explícita do usuário — é mock local, não produção; `WhsCode`/`WhsTCode`/
`SeqName` ficaram em branco, não fornecidos). Nenhuma tela consome essa entidade ainda — `BPLId`
em `ProcessosDetail` continua um `Input` Int32 solto (per `docs/processos-detail-port-notes.md`).

### Não vira nada agora — histórico ou lookup estático (12 tabelas)

- **Histórico, já removido em versões antigas do B1, irrelevante para qualquer cliente real hoje**
  (confirmado em [[project-sapimport-schema-migration]]): `CPCH` (`UDO_PROCESSO_CFL`/`CFLPCH`,
  1 campo) e `DPRV` (`UDO_DPRV`/`IMPDPRV`, 14 campos) — criados e removidos dentro da própria
  escada do B1. Não desenhar CBO para eles.
- **Listas de apoio estáticas** (Code/Name simples, sem `ensureField` além do padrão, não
  aparecem no `schema-model.json` por não terem campo customizado): `IINC` (Incoterms), `ICLT`
  (Tipo de Atividade), `STATUSPROCESSO`, `SELNUMERARIOS` (1 campo, aparece no JSON),
  `CFGLOTESERIE`, `DUMP` (Dumping, 5 campos). Quando a tela que consome cada uma for portada,
  decidir ali se vira um CBO minúsculo ou uma lista de valor fixo (domain fixed values) do S/4 —
  não vale desenhar CBO formal para 5 tabelas de 1-5 campos sem uma tela real na frente ainda.

## Próximos passos (fora desta fase)

1. Validar este desenho contra um tenant S/4HANA Cloud real assim que houver acesso — em
   especial o tamanho de `IMPPCH`/`PCH1` e o nome técnico real gerado pela ferramenta.
2. Confirmar `OBPL`/`OUSG`/`IPF2` (mapeamento "baixa confiança" acima) antes de portar qualquer
   tela que dependa deles.
3. Só depois disso, portar a primeira tela real (Configs foi a sugestão original, mas a decisão
   de qual tela primeiro ainda está em aberto).
