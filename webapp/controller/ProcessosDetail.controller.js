sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/DatePicker",
    "sap/m/Input",
    "sap/m/Label",
    "sap/m/Table",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/m/Text",
    "sap/ui/layout/HorizontalLayout",
    "acx/sapimport/s4/model/purchaseOrders",
    "acx/sapimport/s4/model/cbo",
    "acx/sapimport/s4/model/lookups"
], /**
 * @param {typeof import("sap/ui/core/mvc/Controller").default} Controller
 * @param {typeof import("sap/ui/model/json/JSONModel").default} JSONModel
 * @param {typeof import("sap/ui/model/Filter").default} Filter
 * @param {typeof import("sap/ui/model/FilterOperator").default} FilterOperator
 * @param {typeof import("sap/ui/model/Sorter").default} Sorter
 * @param {typeof import("sap/m/SelectDialog").default} SelectDialog
 * @param {typeof import("sap/m/StandardListItem").default} StandardListItem
 * @param {typeof import("sap/m/MessageToast").default} MessageToast
 * @param {typeof import("sap/m/MessageBox").default} MessageBox
 * @param {typeof import("sap/m/Dialog").default} Dialog
 * @param {typeof import("sap/m/Button").default} Button
 * @param {typeof import("sap/m/DatePicker").default} DatePicker
 * @param {typeof import("sap/m/Input").default} Input
 * @param {typeof import("sap/m/Label").default} Label
 * @param {typeof import("sap/m/Table").default} Table
 * @param {typeof import("sap/m/Column").default} Column
 * @param {typeof import("sap/m/ColumnListItem").default} ColumnListItem
 * @param {typeof import("sap/m/Text").default} Text
 * @param {typeof import("sap/ui/layout/HorizontalLayout").default} HorizontalLayout
 * @param {object} purchaseOrders
 * @param {object} cbo
 * @param {object} lookups
 */ (
    Controller, JSONModel, Filter, FilterOperator, Sorter, SelectDialog, StandardListItem, MessageToast, MessageBox,
    Dialog, Button, DatePicker, Input, Label, Table, Column, ColumnListItem, Text, HorizontalLayout,
    purchaseOrders, cbo, lookups
) => {
    "use strict";

    // Ported from ../sapimport/webapp/controller/ProcessosDetail.controller.js — "esqueleto
    // mínimo" pass (see docs/processos-detail-port-notes.md for the full round-by-round decision
    // log). Every button/menu the original has but this pass doesn't implement yet (Inserir
    // Processos/Invoices/Arquivo — only Inserir Pedidos is real, see
    // docs/insert-pedidos-port-notes.md — Layout import/export, documentos vinculados, Recalcular
    // FOB/CIF, Previsões' determination buttons, TabPreCal's template-load value-help,
    // Numerários' Acerto/Adiantamento/Razão, Anexos' Anexar/Baixar/Excluir + CCPO/PO2DI, DI/DUIMP)
    // is wired to the single `onNotImplemented` handler below instead — same UI shape as the
    // original, real logic still to come one feature at a time.
    //
    // O Processo vem do CBO YY1_ACX_IMPPCH do S/4 (OData V2) com 6 nós filho, navegações
    // to_Itens/to_Moeda/to_Despacho/to_Demurrage/to_Previsao/to_LoteSerie. O documento inteiro é
    // editado num JSONModel local — default desta view, contexto "/" — e gravado por diferença no
    // Salvar (cbo.readDocument/saveDocument), mesmo padrão do PreCalcDetail: no V2 uma linha
    // excluída só sai da lista depois do submit, e a sap.ui.table não tem como escondê-la. Os
    // campos decimais da view declaram o tipo com a precisão/escala do CBO (no V4 vinha sozinho do
    // metadata). Contextos do documento são de JSONModel: escrita via _setDocProperty.

    // Decimal do CBO vai como string na escala (19,4)
    const { toDecimal } = cbo;

    // Nós filho do Processo, na ordem do CBO; LoteSerie não tem tabela na tela, mas é lido e
    // regravado junto (sem mudança, saveDocument não manda nada dele)
    const NAVS = ["to_Itens", "to_Moeda", "to_Despacho", "to_Demurrage", "to_Previsao", "to_LoteSerie"];

    const VALUE_HELP_TITLES = {
        BusinessPartners: "Parceiros de Negócio",
        IMPLAY: "Layouts de Importação",
        Currencies: "Moedas",
        NotaFiscalUsage: "Utilização",
        AdditionalExpenses: "Despesas Adicionais",
        Items: "Itens"
    };

    return Controller.extend("acx.sapimport.s4.controller.ProcessosDetail", {
        onInit() {
            // previsaoRows: array local só de exibição (aba "Previsões", casca sem dados — ver
            // docs/processos-detail-port-notes.md). Ao contrário das tabelas Itens/Despacho/
            // Demurrage, essa tabela nunca teve nó de CBO nem NavigationProperty própria mesmo
            // no original: só é populada pelos botões de determinação de imposto (não portados
            // nesta rodada) e nunca é persistida em onSave — fica sempre vazia aqui. Mesmo
            // raciocínio pra numerarios/numerariosTotalDebit/numerariosTotalCredit (aba
            // "Numerários"): populados só por BindNumerarios no original (consulta de lançamentos
            // contábeis tipo Journal Entry, não portada), tabela somente leitura mesmo lá.
            this.getView().setModel(new JSONModel({
                newMode: false, isDirty: false, previsaoRows: [],
                numerarios: [], numerariosTotalDebit: null, numerariosTotalCredit: null,
                anexos: [], selectedCardName: "", filterCardCode: "", foreignSuppliers: []
            }), "detailView");
            // Modelos nesta tela: o Processo em edição é o JSONModel local (default da view — os
            // bindings do XML ficam sem prefixo), lido/gravado no CBO YY1_ACX_IMPPCH
            // (_getProcModel, V2); a configuração (IMPICFG) e o value help de Layout, dos outros
            // CBOs (model/cbo); pedidos de compra, da API real do S/4 (modelo "po", só leitura,
            // via model/purchaseOrders); e o resto (lookups) do mainService (default do Component,
            // _getLookupModel). Diálogos com binding absoluto em lookup precisam de
            // setModel(_getLookupModel()) explícito, senão herdam o documento local da view.
            const oDocModel = new JSONModel(this._emptyDocument());
            this.getView().setModel(oDocModel);
            this.getView().setBindingContext(oDocModel.createBindingContext("/"));
            this.getOwnerComponent().getRouter().getRoute("RouteProcessosDetail").attachPatternMatched(this._onRouteMatched, this);
            this._loadForeignSuppliers();

            // Único listener de "change" nativo no root da view (em vez de instrumentar cada
            // campo) — cobre tanto os campos do cabeçalho quanto as células editáveis da tabela
            // de Itens, já que o evento borbulha pelo DOM. Mesmo padrão do controller original.
            this.getView().attachBrowserEvent("change", this._markDirty, this);
        },

        // Modelo V2 do CBO YY1_ACX_IMPPCH (leitura/gravação do documento; a tela edita a cópia local)
        _getProcModel() {
            return this._getProcSource().model;
        },

        _getProcSource() {
            return cbo.source(this.getOwnerComponent(), "IMPPCH");
        },

        _emptyDocument() {
            const oDoc = {};
            NAVS.forEach((sNav) => { oDoc[sNav] = []; });
            return oDoc;
        },

        _getDocModel() {
            return this.getView().getModel();
        },

        _setDocument(oDoc, oOriginal) {
            this._oOriginal = oOriginal;
            this._getDocModel().setData(oDoc);
            ["itemsTable", "currTable", "despaTable", "demurTable", "preCalcTable"].forEach((sId) => {
                const oTable = this.byId(sId);
                if (oTable) {
                    oTable.clearSelection();
                }
            });
        },

        _getLines(sNav) {
            return this._getDocModel().getProperty("/" + sNav) || [];
        },

        _setLines(sNav, aLines) {
            this._getDocModel().setProperty("/" + sNav, aLines);
        },

        // Escrita num contexto do documento local (cabeçalho "/" ou linha "/to_Itens/3")
        _setDocProperty(oContext, sProperty, vValue) {
            oContext.getModel().setProperty(sProperty, vValue, oContext);
        },

        // Converte vValue pelo tipo do CBO do campo — o contexto diz se é cabeçalho ou de qual
        // nó filho (ex.: título de value help, sempre texto, num Edm.Decimal)
        _toDocValue(oContext, sProperty, vValue) {
            const sNav = oContext.getPath().split("/")[1];
            const sEntityPath = this._getProcSource().path + (sNav ? "/" + sNav : "");
            return cbo.toDocValue(this._getProcModel(), sEntityPath, sProperty, vValue);
        },

        async _loadDocument(sUuid) {
            const oDoc = await cbo.readDocument(this._getProcModel(), cbo.keyPath("IMPPCH", sUuid), NAVS);
            this._setDocument(oDoc, cbo.cloneDocument(oDoc));
        },

        _getLookupModel() {
            return this.getOwnerComponent().getModel();
        },

        _getPoModel() {
            return this.getOwnerComponent().getModel("po");
        },

        // { model, path, titleField?, descField?, filters? } da lista de um value help: CBO do S/4
        // (ex.: IMPLAY -> YY1_ACX_IMPLAY, model/cbo), cadastro de API padrão do S/4 (fornecedores,
        // produtos — model/lookups, que também troca os nomes de campo) ou, o resto, mainService.
        _getValueHelpSource(sEntitySet) {
            const oComponent = this.getOwnerComponent();
            return cbo.source(oComponent, sEntitySet) || lookups.source(oComponent, sEntitySet)
                || { model: this._getLookupModel(), path: "/" + sEntitySet };
        },

        _markDirty() {
            this.getView().getModel("detailView").setProperty("/isDirty", true);
        },

        async _onRouteMatched(oEvent) {
            // Invalida o cache de _getIcfgConfig a cada entrada na tela — sem isso, uma mudança
            // feita em Configs (ex.: AmbientePU de Validação pra Produção) entre duas visitas a
            // essa tela não era respeitada, porque o controller (e o cache na instância) sobrevive
            // à navegação de ida e volta. Ainda cacheado DENTRO de uma mesma visita, só não mais
            // pra sempre.
            this._oIcfgConfig = null;

            const sUuid = oEvent.getParameter("arguments").uuid;
            const bNewMode = sUuid === "new";
            this.getView().getModel("detailView").setProperty("/newMode", bNewMode);
            this.getView().getModel("detailView").setProperty("/isDirty", false);
            this.getView().getModel("detailView").setProperty("/selectedCardName", "");
            this.getView().getModel("detailView").setProperty("/filterCardCode", "");

            // Documento vazio já na entrada: nada do Processo anterior fica visível (nem é
            // regravado) enquanto o novo carrega
            this._setDocument(this._emptyDocument(), undefined);

            if (bNewMode) {
                const sNextProcNum = await this._getNextProcNum().catch(() => "");
                this._setDocument(Object.assign(this._emptyDocument(), {
                    ProcNum: sNextProcNum,
                    DINum: "",
                    AgentCode: "",
                    AgentName: "",
                    Layout: "",
                    BPLId: cbo.toInteger(0),
                    StatusProc: "",
                    PesoBto: toDecimal(0)
                }), undefined);
                this._updateDIDuimpLabels();
                return;
            }

            // sUuid vem direto da ProcessosList (SAP_UUID real da linha clicada)
            this.getView().setBusy(true);
            try {
                await this._loadDocument(sUuid);
                this._updateDIDuimpLabels();
            } catch (oError) {
                MessageBox.error(oError.message || String(oError));
            } finally {
                this.getView().setBusy(false);
            }
        },

        // Convertido de EditText13_ValidateAfter/ChangeDItoDUIMP (Processos.b1f.cs:18530-18632).
        // DINum.length > 14 caracteres = DUIMP, mesmo corte usado no resto do original — decide se
        // o rótulo/menus mostram texto de DI ou de DUIMP. Chamado tanto ao editar o campo quanto ao
        // abrir/criar um Processo (Form_DataLoadAfter no original), ambos em _onRouteMatched.
        onDINumChange() {
            this._updateDIDuimpLabels();
        },

        _updateDIDuimpLabels() {
            const oHeaderContext = this.getView().getBindingContext();
            const sDINum = (oHeaderContext && oHeaderContext.getProperty("DINum")) || "";
            const bDuimp = sDINum.length > 14;
            const oBundle = this.getView().getModel("i18n").getResourceBundle();

            this.byId("lDINum").setText(oBundle.getText(bDuimp ? "procDINumDuimp" : "procDINum"));
            this.byId("miDIImportar").setText(oBundle.getText(bDuimp ? "procDIImportarDuimp" : "procDIImportar"));
            this.byId("miDIComparar").setText(oBundle.getText(bDuimp ? "procDICompararDuimp" : "procDIComparar"));
            this.byId("miDILoteSerie").setText(oBundle.getText(bDuimp ? "procDILoteSerieDuimp" : "procDILoteSerie"));
            this.byId("btnRatearPeso").setText(oBundle.getText(bDuimp ? "procBtnAtualizarPeso" : "procBtnRatearPeso"));

            const sImpPTaxText = oBundle.getText(bDuimp ? "procImpPTaxDuimp" : "procImpPTax");
            this.byId("btcImpPTax").setText(sImpPTaxText);
            this.byId("miImpPTax").setText(sImpPTaxText);
            this.byId("miAtuaValor").setText(oBundle.getText(bDuimp ? "procAtuaValorDuimp" : "procAtuaValor"));
        },

        // Converted from Button14_ClickAfter (Processos.b1f.cs:15444-15473) — SÓ o ramo DUIMP
        // (DINum.length > 14): ReadDuimp.GeraPedido/CreatePedidoList/UpdateItems/CreatePedido
        // (ReadDuimp.cs:1294-1573). O ramo DI clássica (upload+parse de XML, ~150 linhas
        // adicionais bem diferentes — sem Portal Único) fica pra uma rodada separada, mesmo
        // tamanho desta; mostra "não implementado" por enquanto (ver docs/po2di-duimp-port-notes.md).
        //
        // Gera um Pedido de Compra a partir dos itens ATIVOS da DUIMP no Portal Único — documento
        // NOVO, independente do Processo atual. zCardCode (ComboBox "Fornecedor" no original) não
        // existe mais nesse app (procSelectedLineToolbar foi deliberadamente dropado ao portar o
        // esqueleto da tela, ver docs/processos-detail-port-notes.md) — substituído aqui por um
        // diálogo de seleção dedicado (_pickSupplierForPO2DI), só pra esse botão.
        async onAnexoPO2DI() {
            const oHeaderContext = this.getView().getBindingContext();
            const bNewMode = this.getView().getModel("detailView").getProperty("/newMode");
            if (!oHeaderContext || bNewMode) {
                MessageBox.error(this._t("procSaveFirst"));
                return;
            }

            const sDINumRaw = oHeaderContext.getProperty("DINum") || "";
            if (sDINumRaw.length <= 14) {
                this.onNotImplemented();
                return;
            }

            const sCardCode = await this._pickSupplierForPO2DI();
            if (!sCardCode) {
                return;
            }

            await this._generatePedidoFromDuimp(oHeaderContext, sCardCode, sDINumRaw);
        },

        // Substitui a Select "Fornecedor" (zCardCode, procSelectedLineToolbar) que esse app não
        // tem mais — mesmo mecanismo de SelectDialog já usado por onValueHelp, só que resolvendo
        // uma Promise em vez de escrever num campo bindado, já que essa escolha não fica salva em
        // lugar nenhum (o original também não grava zCardCode no Processo).
        _pickSupplierForPO2DI() {
            const oSource = this._getValueHelpSource("BusinessPartners");
            return new Promise((resolve) => {
                const oDialog = new SelectDialog({
                    title: this._t("procPO2DISelectSupplierTitle"),
                    items: {
                        path: oSource.path,
                        template: new StandardListItem({ title: `{${oSource.titleField}}`, description: `{${oSource.descField}}` })
                    },
                    search: (oEvent) => {
                        const sValue = oEvent.getParameter("value");
                        oEvent.getSource().getBinding("items").filter(new Filter(oSource.descField, FilterOperator.Contains, sValue));
                    },
                    confirm: (oEvent) => {
                        const oSelectedItem = oEvent.getParameter("selectedItem");
                        resolve(oSelectedItem ? oSelectedItem.getTitle() : null);
                    },
                    cancel: () => resolve(null),
                    afterClose: () => oDialog.destroy()
                });
                oDialog.setModel(oSource.model);
                this.getView().addDependent(oDialog);
                oDialog.open();
            });
        },

        async _generatePedidoFromDuimp(oHeaderContext, sCardCode, sDINumRaw) {
            this.getView().setBusy(true);
            try {
                const oCreds = await this._getPuCredentials(oHeaderContext);
                if (!oCreds) {
                    MessageBox.error(this._t("procDIChaveDuimpNoCredentials"));
                    return;
                }
                const { sClientId, sClientSecret } = oCreds;
                const oIcfgConfig = await this._getIcfgConfig();

                const sDuimpQuery = new URLSearchParams({
                    ambiente: oIcfgConfig.AmbientePU || "", perfil: oIcfgConfig.PerfilPU || "",
                    clientId: sClientId, clientSecret: sClientSecret, numero: sDINumRaw.replace(/-/g, "")
                }).toString();
                const { duimp: oDuimp, itens: aDuimpItensRaw } = await this._fetchPucomexServer(`/pucomex-server/duimp?${sDuimpQuery}`);
                if (!oDuimp) {
                    MessageToast.show(this._t("procDINoDuimpFound"));
                    return;
                }
                const aDuimpItens = (aDuimpItensRaw || []).filter((oItem) => oItem.status === "ATIVO");
                if (aDuimpItens.length === 0) {
                    MessageToast.show(this._t("procPO2DINoActiveItems"));
                    return;
                }

                const sMoeda = (aDuimpItens[0].mercadoria && aDuimpItens[0].mercadoria.moedaNegociada
                    && aDuimpItens[0].mercadoria.moedaNegociada.codigo) || "";
                const dRate = await this._getCurrencyRateToday(sMoeda);
                if (!dRate) {
                    MessageBox.error(this._t("procPO2DINoRate", [sMoeda]));
                    return;
                }

                const aPedidoList = await this._buildPedidoListFromDuimpItens(oDuimp, aDuimpItens, oCreds, oIcfgConfig);
                if (aPedidoList.length === 0) {
                    MessageToast.show(this._t("procPO2DINoItemsResolved"));
                    return;
                }

                const bUpdateItems = await new Promise((resolve) => {
                    MessageBox.confirm(this._t("procPO2DIConfirmUpdateItems"), {
                        actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                        emphasizedAction: MessageBox.Action.YES,
                        onClose: (sAction) => resolve(sAction === MessageBox.Action.YES)
                    });
                });
                if (bUpdateItems) {
                    await this._updateItemsFromPedidoList(aPedidoList);
                }

                // CreatePedido do original (gerar o pedido de compra a partir da DUIMP) ainda não
                // portado para o S/4 real: o POST em api_purchaseorder_2 exige dados de
                // organização que o Processo não tem (PurchasingOrganization, PurchasingGroup,
                // centro) e materiais do cadastro real de produtos (aqui ainda vêm do placeholder
                // Items). Até lá, o fluxo para depois de atualizar os itens.
                MessageBox.information(this._t("procPO2DICreatePoNotPorted", [sCardCode, sMoeda, dRate]));
            } catch (oError) {
                MessageBox.error(oError.message || String(oError));
            } finally {
                this.getView().setBusy(false);
            }
        },

        // Porta PUFunctions.newAccessToken (PUFunctions.cs:92-134), só a prioridade "Filial":
        // CNPJ e credenciais do Portal Único da filial do Processo, no CBO YY1_ACX_FILIAL
        // (model/lookups) — o fallback por usuário (OUSR.U_ClientId/U_ClientSecret) NÃO foi
        // portado, mesma decisão já tomada ao portar Configs (ver docs/configs-port-notes.md).
        async _getPuCredentials(oHeaderContext) {
            const iBplId = Number(oHeaderContext.getProperty("BPLId")) || 0;
            if (!iBplId) {
                return null;
            }
            const oBranch = await lookups.getBusinessPlace(this.getOwnerComponent(), iBplId).catch(() => null);
            const sCnpj = ((oBranch && oBranch.TaxIdNumber) || "").replace(/\D/g, "");
            const sClientId = oBranch && oBranch.ClientId;
            const sClientSecret = oBranch && oBranch.ClientSecret;
            if (!sCnpj || !sClientId || !sClientSecret) {
                return null;
            }
            return { sCnpj, sClientId, sClientSecret };
        },

        // A linha inteira de configuração (uma linha só, ~90 campos — barato). Antes restringia o
        // $select aos campos de quem chamou primeiro, e cada recurso novo que precisava de outro
        // campo o recebia undefined em silêncio (o CIF lia OverPC assim e calculava PIS/COFINS
        // pela base errada). Cacheado na instância do controller, como no original. Vem do CBO
        // YY1_ACX_IMPICFG do S/4 (a tela Configs grava lá) — os campos inteiros chegam como string
        // (Edm.Decimal(10,0)), os usados aqui são todos texto Y/N.
        async _getIcfgConfig() {
            if (!this._oIcfgConfig) {
                const { model: oModel, path: sPath } = cbo.source(this.getOwnerComponent(), "IMPICFG");
                const aRows = await cbo.read(oModel, sPath, {
                    filters: [new Filter("Code", FilterOperator.EQ, "001")]
                }).catch(() => []);
                this._oIcfgConfig = aRows[0] || {};
            }
            return this._oIcfgConfig;
        },

        // Substitui a função OData nativa do B1 Service Layer SBOBobService_GetCurrencyRate: taxa
        // do dia (tipo M) cadastrada no S/4, nos dois sentidos de cotação (model/lookups).
        async _getCurrencyRateToday(sCurrency) {
            return lookups.getRateToday(this.getOwnerComponent(), sCurrency).catch(() => 0);
        },

        // Idêntico ao original — wrapper de fetch simples contra o middleware local (ver
        // packages/ui5-middleware-pucomex-mock nesse projeto; o original fala com o real via
        // packages/ui5-middleware-pucomex em ../sapimport).
        async _fetchPucomexServer(sPath) {
            let oResponse;
            try {
                oResponse = await fetch(sPath);
            } catch (oError) {
                throw new Error(`Não foi possível falar com o pucomex-mock-middleware local (verifique se o dev server está rodando). Erro: ${oError.message}`);
            }
            const sBody = await oResponse.text().catch(() => "");
            let vBody;
            try { vBody = JSON.parse(sBody); } catch { vBody = null; }
            if (!oResponse.ok) {
                const sMessage = (vBody && vBody.message) || sBody || oResponse.statusText;
                throw new Error(`Portal Único: ${oResponse.status} ${oResponse.statusText}${sMessage ? " - " + sMessage : ""}`);
            }
            return vBody || {};
        },

        // Porta CreatePedidoList (ReadDuimp.cs:1294-1324) — SEM a indireção de NCM AbsEntry
        // (_getNcmAbsEntry/NCMCodesSetup do original): Items.NCMCode já é um campo texto plano
        // nesse projeto (não uma FK pra um mestre de NCM separado, ver
        // docs/insert-pedidos-port-notes.md), então o NCM da DUIMP vira direto o valor do campo.
        async _buildPedidoListFromDuimpItens(oDuimp, aDuimpItens, oCreds, oIcfgConfig) {
            const aCodigosUnicos = [...new Set(
                aDuimpItens.map((oItem) => oItem.produto && oItem.produto.codigo).filter((v) => v !== null && v !== undefined)
            )];
            if (aCodigosUnicos.length === 0) {
                return [];
            }
            // CNPJ raiz (8 dígitos) do IMPORTADOR da própria DUIMP — não o CNPJ da Filial usado
            // pra autenticar (oCreds.sCnpj). São conceitos diferentes: a API de catálogo
            // (/catp/api/ext/produto) exige o CNPJ raiz de quem é dono do catálogo de produtos
            // (o importador da DUIMP), e rejeita com "usuário não é representante legal do
            // CPF/CNPJ Raiz" se receber outro CNPJ, mesmo que as credenciais sejam válidas.
            const sNi = ((oDuimp.identificacao && oDuimp.identificacao.importador && oDuimp.identificacao.importador.ni) || "").substring(0, 8);
            const sProdutosQuery = new URLSearchParams({
                ambiente: oIcfgConfig.AmbientePU || "", perfil: oIcfgConfig.PerfilPU || "",
                clientId: oCreds.sClientId, clientSecret: oCreds.sClientSecret, cnpj: sNi, codigos: aCodigosUnicos.join(",")
            }).toString();
            const oProdutosResponse = await this._fetchPucomexServer(`/pucomex-server/produtos?${sProdutosQuery}`);
            const aProdutos = oProdutosResponse.produtos || [];

            const aTodosCandidatos = [...new Set(aProdutos.flatMap((oProduto) => oProduto.codigosInterno || []))];
            const oExistingItemCodes = await this._getExistingItemCodes(aTodosCandidatos);

            const aPedidoList = [];
            for (const oItem of aDuimpItens) {
                const oProduto = aProdutos.find((p) => Number(p.codigo) === Number(oItem.produto && oItem.produto.codigo));
                if (!oProduto) {
                    continue;
                }
                const sItemCodeSAP = (oProduto.codigosInterno || []).find((sCandidate) => oExistingItemCodes.has(sCandidate)) || "";

                aPedidoList.push({
                    ItemCodePU: oItem.produto.codigo,
                    CodigosInternosPU: oProduto.codigosInterno || [],
                    ItemCodeSAP: sItemCodeSAP,
                    Peso: (oItem.mercadoria && oItem.mercadoria.pesoLiquido) || 0,
                    Quantidade: (oItem.mercadoria && oItem.mercadoria.quantidadeComercial) || 0,
                    Preco: (oItem.mercadoria && oItem.mercadoria.valorUnitarioMoedaNegociada) || 0,
                    Moeda: (oItem.mercadoria && oItem.mercadoria.moedaNegociada && oItem.mercadoria.moedaNegociada.codigo) || "",
                    NCM: oProduto.ncm || "",
                    Descricao: oProduto.descricao || "",
                    Denominacao: oProduto.denominacao || ""
                });
            }
            return aPedidoList;
        },

        // Porta CodigoInternoExists (ReadDuimp.cs:1574-1595) — uma única consulta aos produtos do
        // S/4 com todos os candidatos de uma vez (filtro OR), em vez de uma query por produto.
        async _getExistingItemCodes(aCandidates) {
            return lookups.existingProducts(this.getOwnerComponent(), aCandidates).catch(() => new Set());
        },

        // Porta UpdateItems (ReadDuimp.cs:1325-1391), que criava/atualizava o Item Master (nome e
        // NCM) por linha do Pedido. No S/4 o cadastro de produto é o real (API_PRODUCT_SRV), e
        // criar/alterar produto pela API exige dados de organização (tipo, centro, unidades...) que
        // o fluxo não tem — não portado. Aqui só se resolve o código: produto que já existe vira
        // ItemCodeSAP; os demais são listados para o cadastro ser feito no S/4.
        async _updateItemsFromPedidoList(aPedidoList) {
            const aCandidatos = aPedidoList.map((oPedido) => oPedido.ItemCodeSAP || (oPedido.CodigosInternosPU || [])[0]).filter(Boolean);
            const oExisting = await this._getExistingItemCodes(aCandidatos);
            const aMissing = [];
            aPedidoList.forEach((oPedido) => {
                const sCodigo = oPedido.ItemCodeSAP || (oPedido.CodigosInternosPU || [])[0] || "";
                if (oExisting.has(sCodigo)) {
                    oPedido.ItemCodeSAP = sCodigo;
                } else if (sCodigo) {
                    aMissing.push(sCodigo);
                }
            });
            if (aMissing.length) {
                MessageBox.warning(this._t("procPO2DIProductsMissing", [aMissing.join(", ")]));
            }
        },

        // Porta Functions.GetProximaSeq (Functions.cs:4150) + a sugestão de próximo número em
        // Menu.cs:360-369: busca o ProcNum do último Processo (maior DocEntry) e incrementa a
        // parte numérica final, preservando prefixo/sufixo (ex.: "PROC-000123-A" ->
        // "PROC-000124-A"). Sem dígito nenhum (inclusive string vazia), retorna "1".
        async _getNextProcNum() {
            const [oLast] = await this._readLastProcesso();
            return this._getProximaSeq((oLast && oLast.ProcNum) || "");
        },

        _readLastProcesso() {
            const { model: oModel, path: sPath } = this._getProcSource();
            return cbo.read(oModel, sPath, {
                sorters: [new Sorter("DocEntry", true)],
                urlParameters: { $top: 1, $select: "DocEntry,ProcNum" }
            });
        },

        // DocEntry do Processo novo: no B1 o UDO numerava, no RAP um NROB. O CBO não tem
        // numeração própria (e campo numérico não pode ser chave dele), então é o maior + 1, lido
        // na hora de gravar — e conferido depois de gravar por _ensureUniqueDocEntry, porque dois
        // Processos gravados no mesmo instante podem pegar o mesmo número.
        async _getNextDocEntry() {
            const [oLast] = await this._readLastProcesso();
            return cbo.toInteger((Number(oLast && oLast.DocEntry) || 0) + 1);
        },

        /**
         * Conferência pós-gravação do DocEntry de um Processo novo (identificado pelo ProcNum, que
         * é único): se outro Processo ficou com o mesmo número, o criado primeiro (SAP_CreatedDateTime,
         * depois SAP_UUID) fica com ele e o outro passa para o próximo livre. Cada sessão confere o
         * próprio Processo depois de gravar, então as duas chegam ao mesmo resultado sem combinar
         * nada; repete se a renumeração colidir de novo. Devolve o DocEntry final.
         */
        async _ensureUniqueDocEntry(sProcNum, sDocEntry) {
            const { model: oModel, path: sPath } = this._getProcSource();
            let sCurrent = sDocEntry;
            for (let iTry = 0; iTry < 5; iTry++) {
                // Os números em disputa são sempre os mais altos: basta o topo da lista (sem $filter
                // em Edm.Decimal, que o mockserver não aceita)
                const aTop = await cbo.read(oModel, sPath, {
                    sorters: [new Sorter("DocEntry", true)],
                    urlParameters: { $top: 50, $select: "SAP_UUID,DocEntry,ProcNum,SAP_CreatedDateTime" }
                });
                const aSame = aTop.filter((o) => Number(o.DocEntry) === Number(sCurrent))
                    .sort((a, b) => (new Date(a.SAP_CreatedDateTime) - new Date(b.SAP_CreatedDateTime)) || a.SAP_UUID.localeCompare(b.SAP_UUID));
                const oMine = aSame.find((o) => o.ProcNum === sProcNum);
                if (!oMine || aSame.length <= 1 || aSame[0] === oMine) {
                    return sCurrent;
                }
                sCurrent = cbo.toInteger(Math.max(...aTop.map((o) => Number(o.DocEntry) || 0)) + 1);
                oModel.update(cbo.keyPath("IMPPCH", oMine.SAP_UUID), { DocEntry: sCurrent }, { groupId: "changes" });
                await cbo.submit(oModel);
            }
            return sCurrent;
        },

        _getProximaSeq(sField) {
            let sNumPart = "";
            let sSuffix = "";
            let sPrefix = "";
            let bFirstTime = true;
            for (let i = sField.length - 1; i >= 0; i--) {
                const c = sField.charAt(i);
                if (c >= "0" && c <= "9") {
                    sNumPart = c + sNumPart;
                    bFirstTime = false;
                } else if (bFirstTime) {
                    sSuffix = c + sSuffix;
                } else {
                    sPrefix = sField.substring(0, i + 1);
                    break;
                }
            }
            if (bFirstTime) {
                return "1";
            }
            const sIncremented = String(Number(sNumPart) + 1).padStart(sNumPart.length, "0");
            return sPrefix + sIncremented + sSuffix;
        },

        onNavBack() {
            this.getOwnerComponent().getRouter().navTo("RouteProcessosList");
        },

        // Handler único pra todos os botões/menus que o original tem mas essa rodada ainda não
        // implementou (Inserir, Layout, Documentos Vinculados, Recalcular FOB/CIF, Previsões,
        // Numerários, Anexos, DI/DUIMP) — mesmo padrão do próprio B1 original pra alguns desses
        // mesmos botões (_showNumerarioNotImplemented). Evita precisar de um handler dedicado por
        // botão só pra mostrar o mesmo aviso; troca por uma implementação de verdade quando cada
        // recurso for trabalhado.
        onNotImplemented() {
            MessageToast.show(this._t("procNotImplemented"));
        },

        onValueHelp(oEvent) {
            const oInput = oEvent.getSource();
            const sEntity = oInput.data("vhEntity");
            const sProperty = oInput.data("vhProperty");
            const sDescProperty = oInput.data("vhDescProperty");

            this._oValueHelpDialogs = this._oValueHelpDialogs || {};
            let oDialog = this._oValueHelpDialogs[sEntity];
            if (!oDialog) {
                const oSource = this._getValueHelpSource(sEntity);
                // Campos da origem real (ex.: Supplier/SupplierName) quando ela os define
                const sTitleField = oSource.titleField || oInput.data("vhTitleField");
                const sDescField = oSource.descField || oInput.data("vhDescField");
                const aFixedFilters = oSource.filters || [];
                oDialog = new SelectDialog({
                    title: VALUE_HELP_TITLES[sEntity] || sEntity,
                    items: {
                        path: oSource.path,
                        filters: aFixedFilters,
                        template: new StandardListItem({
                            title: "{" + sTitleField + "}",
                            description: "{" + sDescField + "}"
                        })
                    },
                    // Código ou descrição (fornecedor/produto se procura pelo nome); os filtros
                    // fixos da origem (ex.: idioma) ficam, são de aplicação
                    search: (oSearchEvent) => {
                        const sValue = oSearchEvent.getParameter("value");
                        oSearchEvent.getSource().getBinding("items").filter(sValue ? new Filter({
                            filters: [sTitleField, sDescField].map((sField) => new Filter(sField, FilterOperator.Contains, sValue)),
                            and: false
                        }) : []);
                    },
                    confirm: (oConfirmEvent) => {
                        const oSelectedItem = oConfirmEvent.getParameter("selectedItem");
                        if (oSelectedItem && this._oCurrentValueHelp) {
                            const oContext = this._oCurrentValueHelp.context || this.getView().getBindingContext();
                            // O diálogo é reaproveitado: valem os campos do value help aberto agora
                            const { property: sTarget, descProperty: sDescTarget } = this._oCurrentValueHelp;
                            this._setDocProperty(oContext, sTarget, this._toDocValue(oContext, sTarget, oSelectedItem.getTitle()));
                            if (sDescTarget) {
                                this._setDocProperty(oContext, sDescTarget,
                                    this._toDocValue(oContext, sDescTarget, oSelectedItem.getDescription()));
                            }
                            this.getView().getModel("detailView").setProperty("/isDirty", true);
                        }
                    }
                });
                oDialog.setModel(oSource.model);
                this.getView().addDependent(oDialog);
                this._oValueHelpDialogs[sEntity] = oDialog;
            }

            this._oCurrentValueHelp = { property: sProperty, descProperty: sDescProperty, context: oInput.getBindingContext() };
            oDialog.open();
        },

        // Compartilhado pelas tabelas de nó filho: rows de cada uma = array do nó no documento
        // local (ex.: "to_Itens"), lido do próprio binding da tabela
        _tableNav(sTableId) {
            return this.byId(sTableId).getBindingInfo("rows").path;
        },

        _addChildLine(sTableId, oDefaults) {
            const sNav = this._tableNav(sTableId);
            this._setLines(sNav, this._getLines(sNav).concat(Object.assign({}, oDefaults)));
            this._markDirty();
        },

        _deleteChildLine(sTableId) {
            const oTable = this.byId(sTableId);
            const sNav = this._tableNav(sTableId);
            const oSelected = new Set(oTable.getSelectedIndices());
            this._setLines(sNav, this._getLines(sNav).filter((oLine, iIndex) => !oSelected.has(iIndex)));
            oTable.clearSelection();
            this._markDirty();
        },

        // Convertido de _loadForeignSuppliers (Processos.b1f.cs) — no original filtra
        // BusinessPartners por CardType=cSupplier e Country<>'BR'; aqui: fornecedores do S/4
        // (API_BUSINESS_PARTNER) com endereço fora do Brasil (model/lookups).
        async _loadForeignSuppliers() {
            const aForeign = await lookups.getSuppliers(this.getOwnerComponent(), true).catch(() => []);
            this.getView().getModel("detailView").setProperty("/foreignSuppliers", [{ CardCode: "", CardName: "" }, ...aForeign]);
        },

        // Convertido da parte de fornecedor-da-linha de onItemsRowSelectionChange (o original
        // também atualiza os botões/estado de documentos vinculados a partir daqui — não portado,
        // ver docs/processos-detail-port-notes.md, "foreign-supplier filter toolbar" dropado junto).
        onItemsRowSelectionChange(oEvent) {
            const oTable = oEvent.getSource();
            const oDetailModel = this.getView().getModel("detailView");
            const aIndices = oTable.getSelectedIndices();

            if (aIndices.length === 0) {
                oDetailModel.setProperty("/selectedCardName", "");
                oDetailModel.setProperty("/filterCardCode", "");
                return;
            }

            const oLineContext = oTable.getContextByIndex(aIndices[0]);
            oDetailModel.setProperty("/selectedCardName", oLineContext.getProperty("CardName") || "");
            oDetailModel.setProperty("/filterCardCode", oLineContext.getProperty("CardCode") || "");
        },

        onAddLine() {
            this._addChildLine("itemsTable", { Sel: "N", ItemCode: "", ItemName: "" });
        },

        onDeleteLine() {
            this._deleteChildLine("itemsTable");
        },

        // Porta onInsertPedidos/_onSearchPedidos/_onConfirmInsertPedido/_insertPedidoLines do
        // original — ver docs/insert-pedidos-port-notes.md pro racional completo de cada
        // adaptação (pedidos lidos da API real api_purchaseorder_2 via model/purchaseOrders;
        // BRL fixo como moeda local, sem
        // CompanyService_GetAdminInfo; dedup entre Processos via $expand=Itens, sujeito à mesma
        // limitação de mock já documentada pra ProcessosDetail/PreCalcDetail).
        onInsertPedidos() {
            const oDialog = this._getInsertPedidosDialog();
            const oContext = this.getView().getBindingContext();
            const oModel = oDialog.getModel("insertPedidos");
            oModel.setProperty("/cardCode", "");
            oModel.setProperty("/dateFrom", this._formatDateYMD(oContext.getProperty("ShipDate")));
            oModel.setProperty("/dateTo", this._formatDateYMD(oContext.getProperty("fShipDate")));
            oModel.setProperty("/results", []);
            oDialog.open();
        },

        _formatDateYMD(vDate) {
            if (!vDate) {
                return null;
            }
            const oDate = vDate instanceof Date ? vDate : new Date(vDate);
            const sYear = String(oDate.getFullYear()).padStart(4, "0");
            const sMonth = String(oDate.getMonth() + 1).padStart(2, "0");
            const sDay = String(oDate.getDate()).padStart(2, "0");
            return `${sYear}-${sMonth}-${sDay}`;
        },

        _getInsertPedidosDialog() {
            if (this._oInsertPedidosDialog) {
                return this._oInsertPedidosDialog;
            }

            const oModel = new JSONModel({ dateFrom: null, dateTo: null, cardCode: "", busy: false, results: [] });

            const oTable = new Table(this.createId("insertPedidosTable"), {
                mode: "SingleSelectMaster",
                noDataText: "Nenhum pedido encontrado",
                columns: [
                    new Column({ header: new Label({ text: "Pedido" }) }),
                    new Column({ header: new Label({ text: "Fornecedor" }) }),
                    new Column({ header: new Label({ text: "Data" }) }),
                    new Column({ header: new Label({ text: "Total" }) }),
                    new Column({ header: new Label({ text: "Itens" }) })
                ],
                items: {
                    path: "insertPedidos>/results",
                    template: new ColumnListItem({
                        cells: [
                            new Text({ text: "{insertPedidos>PurchaseOrder}" }),
                            new Text({ text: "{insertPedidos>SupplierName}" }),
                            new Text({ text: { path: "insertPedidos>PurchaseOrderDate", type: "sap.ui.model.odata.type.Date", formatOptions: { style: "short" } } }),
                            new Text({ text: { path: "insertPedidos>NetAmount", type: "sap.ui.model.odata.type.Decimal" } }),
                            new Text({ text: "{insertPedidos>OpenItemCount}" })
                        ]
                    })
                }
            });

            const oDialog = new Dialog(this.createId("insertPedidosDialog"), {
                title: "Inserir Pedidos",
                contentWidth: "40rem",
                busy: "{insertPedidos>/busy}",
                content: [
                    new HorizontalLayout({
                        content: [
                            new Label({ text: "De", labelFor: this.createId("insertPedidosDateFrom") }),
                            new DatePicker(this.createId("insertPedidosDateFrom"), { value: "{insertPedidos>/dateFrom}", valueFormat: "yyyy-MM-dd", displayFormat: "short" }),
                            new Label({ text: "Até", labelFor: this.createId("insertPedidosDateTo") }),
                            new DatePicker(this.createId("insertPedidosDateTo"), { value: "{insertPedidos>/dateTo}", valueFormat: "yyyy-MM-dd", displayFormat: "short" }),
                            new Label({ text: "Fornecedor", labelFor: this.createId("insertPedidosCardCode") }),
                            new Input(this.createId("insertPedidosCardCode"), { value: "{insertPedidos>/cardCode}", width: "12rem" }),
                            new Button({ text: "Buscar", press: this._onSearchPedidos.bind(this) })
                        ]
                    }),
                    oTable
                ],
                beginButton: new Button({
                    text: "Inserir",
                    type: "Emphasized",
                    press: this._onConfirmInsertPedido.bind(this)
                }),
                endButton: new Button({
                    text: "Cancelar",
                    press: () => oDialog.close()
                })
            });

            oDialog.setModel(oModel, "insertPedidos");
            this.getView().addDependent(oDialog);
            this._oInsertPedidosDialog = oDialog;
            return oDialog;
        },

        async _onSearchPedidos() {
            const oDialog = this._oInsertPedidosDialog;
            const oModel = oDialog.getModel("insertPedidos");
            oModel.setProperty("/busy", true);
            oModel.setProperty("/results", []);

            try {
                // Sem BPLId aqui: BPLId é o conceito de filial do B1, IMPPCH não tem nenhum campo
                // "CompanyCode" próprio hoje pra correlacionar com o CompanyCode real do Pedido —
                // não existe esse mapeamento ainda neste projeto, então o filtro correspondente do
                // original foi deixado de fora (não um descuido; ver
                // docs/insert-pedidos-port-notes.md). Não excluídos + fornecedor estrangeiro: ver
                // purchaseOrders.searchOpenForeignOrders.
                const aResults = await purchaseOrders.searchOpenForeignOrders(this._getPoModel(), {
                    dateFrom: oModel.getProperty("/dateFrom"),
                    dateTo: oModel.getProperty("/dateTo"),
                    supplier: (oModel.getProperty("/cardCode") || "").trim()
                });
                oModel.setProperty("/results", aResults);
            } catch (oError) {
                MessageBox.error(oError.message || String(oError));
            } finally {
                oModel.setProperty("/busy", false);
            }
        },

        async _onConfirmInsertPedido() {
            const oDialog = this._oInsertPedidosDialog;
            const oInsertPedidosModel = oDialog.getModel("insertPedidos");
            const oTable = this.byId("insertPedidosTable");
            const oSelectedItem = oTable.getSelectedItem();
            if (!oSelectedItem) {
                MessageToast.show("Selecione um pedido");
                return;
            }
            const oPedido = oSelectedItem.getBindingContext("insertPedidos").getObject();

            // Um único mecanismo de busy (o binding declarativo "busy" do Dialog, já usado por
            // _onSearchPedidos) — misturar isso com Dialog#setBusy() imperativo (como o original
            // faz) deixa o controle com dois donos do mesmo estado, e testado aqui causou uma
            // duplicação real de elemento no DOM ao reabrir o diálogo depois de fechado (mesmo
            // id, dois nós), travando uma camada de bloqueio "órfã" por cima da tela.
            oInsertPedidosModel.setProperty("/busy", true);
            try {
                await this._insertPedidoLines(oPedido.PurchaseOrder);
                oDialog.close();
            } catch (oError) {
                MessageBox.error(oError.message || String(oError));
            } finally {
                oInsertPedidosModel.setProperty("/busy", false);
            }
        },

        // _onConfirmInsertPedido só fecha o diálogo depois que isto resolve de verdade — por
        // isso precisa continuar `async`/aguardar a confirmação via `new Promise` (não um
        // callback solto): fechar cedo demais deixava o diálogo num estado inconsistente ao
        // reabrir (camada de bloqueio "grudada"), confirmado ao testar inserir o mesmo Pedido
        // duas vezes seguidas. `Promise` é global padrão do JS — o aviso "no-undef" do lint aqui
        // é só uma lacuna na config compartilhada do projeto (@sap-ux/eslint-plugin-fiori-tools),
        // não um problema real; não vale a pena mexer numa config compartilhada só por isso.
        async _insertPedidoLines(sPurchaseOrder) {
            const aExistingLines = this._getLines("to_Itens");
            // PCH1.DocEntry guarda o PurchaseOrder real como String(10) ("4500000001")
            const bAlreadyInForm = aExistingLines.some((oLine) => oLine.DocEntry === sPurchaseOrder);

            if (bAlreadyInForm) {
                const bContinue = await new Promise((resolve) => {
                    // confirm sem "actions" mostra OK/Cancelar — comparar com YES nunca seguia
                    MessageBox.confirm(`O pedido ${sPurchaseOrder} já existe no processo. Deseja incluir itens novos desse pedido?`, {
                        onClose: (sAction) => resolve(sAction === MessageBox.Action.OK)
                    });
                });
                if (!bContinue) {
                    return;
                }
            }

            await this._doInsertPedidoLines(sPurchaseOrder, aExistingLines);
        },

        async _doInsertPedidoLines(sPurchaseOrder, aExistingLines) {
            const oPoModel = this._getPoModel();
            try {
                const oOrder = await purchaseOrders.getOrder(oPoModel, sPurchaseOrder);
                if (!oOrder) {
                    MessageBox.error(`Pedido ${sPurchaseOrder} não encontrado`);
                    return;
                }
                const aOpenLines = await purchaseOrders.getLines(oPoModel, [sPurchaseOrder], true);
                if (aOpenLines.length === 0) {
                    MessageToast.show("Nenhuma linha aberta encontrada nesse pedido");
                    return;
                }

                await this._createPedidoLines(sPurchaseOrder, oOrder, aOpenLines, aExistingLines);
            } catch (oError) {
                MessageBox.error(oError.message || String(oError));
            }
        },

        // Dados de produto (peso, NCM, descrição — model/lookups) das linhas de pedido, chaveados
        // "centro|material": o NCM do S/4 é por centro, e o centro é o do item do pedido
        async _getItemInfoForPoLines(aPoLines) {
            const oByPlant = {};
            aPoLines.forEach((oLine) => { (oByPlant[oLine.Plant || ""] = oByPlant[oLine.Plant || ""] || []).push(oLine.Material); });
            const oResult = {};
            await Promise.all(Object.entries(oByPlant).map(async ([sPlant, aMaterials]) => {
                const oInfo = await lookups.getItemsInfo(this.getOwnerComponent(), aMaterials, sPlant);
                Object.entries(oInfo).forEach(([sMaterial, oItem]) => { oResult[`${sPlant}|${sMaterial}`] = oItem; });
            }));
            return oResult;
        },

        async _createPedidoLines(sPurchaseOrder, oOrder, aOpenLines, aExistingLines) {
            const oItemInfoByKey = await this._getItemInfoForPoLines(aOpenLines);

            // Soma quantidade já usada desse mesmo Pedido em TODOS os Processos gravados (não só
            // o atual) — evita importar a mesma linha duas vezes em Processos diferentes.
            const { model: oProcModel, path: sProcPath } = this._getProcSource();
            const aProcessos = await cbo.read(oProcModel, sProcPath, {
                urlParameters: { $select: "DocEntry,PedPai,to_Itens/DocEntry,to_Itens/LineNum,to_Itens/Quantity", $expand: "to_Itens" }
            }).catch(() => []);
            const oUsedQtyByLine = {};
            aProcessos.forEach((oProcesso) => {
                if (oProcesso.PedPai === "Y") {
                    return;
                }
                ((oProcesso.to_Itens && oProcesso.to_Itens.results) || []).forEach((oPchLine) => {
                    if (oPchLine.DocEntry === sPurchaseOrder) {
                        const iLineNum = Number(oPchLine.LineNum);
                        oUsedQtyByLine[iLineNum] = (oUsedQtyByLine[iLineNum] || 0) + (Number(oPchLine.Quantity) || 0);
                    }
                });
            });

            const oOnScreenQtyByLine = {};
            aExistingLines.forEach((oExisting) => {
                if (oExisting.DocEntry === sPurchaseOrder) {
                    const iLineNum = Number(oExisting.LineNum);
                    oOnScreenQtyByLine[iLineNum] = (oOnScreenQtyByLine[iLineNum] || 0) + (Number(oExisting.Quantity) || 0);
                }
            });

            const aNewLines = [];
            for (const oLine of aOpenLines) {
                // PurchaseOrderItem real é string ("10", "20"...) — vira o LineNum numérico
                // interno do PCH1 via Number(), único requisito é ser uma chave estável pra ligar
                // de volta a essa linha do Pedido.
                const iLineNum = Number(oLine.PurchaseOrderItem);
                const oNewLine = this._createOnePedidoLine(oLine, {
                    sPurchaseOrder, iLineNum, oOrder,
                    fUsedQty: oUsedQtyByLine[iLineNum] || 0,
                    fOnScreenQty: oOnScreenQtyByLine[iLineNum] || 0,
                    oItemInfo: oItemInfoByKey[`${oLine.Plant || ""}|${oLine.Material}`] || {}
                });
                if (oNewLine) {
                    aNewLines.push(oNewLine);
                }
            }
            this._setLines("to_Itens", this._getLines("to_Itens").concat(aNewLines));

            this._markDirty();
            MessageToast.show(`${aNewLines.length} linha(s) inserida(s)`);
        },

        // Linha nova do Processo para uma linha aberta do pedido (ou null, se já não há saldo)
        _createOnePedidoLine(oLine, oCtx) {
            const { sPurchaseOrder, iLineNum, oOrder, fUsedQty, fOnScreenQty, oItemInfo } = oCtx;
            const fQtyInv = Number(oLine.InvoicedQuantity) || 0;
            const fQtyFinal = oLine.OrderQuantity - fUsedQty - fOnScreenQty;
            if (!(fQtyFinal > 0 || fQtyInv > 0)) {
                return null;
            }

            // Peso unitário do cadastro do produto (kg, model/lookups); produto sem peso cadastrado
            // (ou fora do cadastro) cai no peso líquido do próprio item do pedido.
            const fUnitWeight = this._productUnitWeightKg(oItemInfo) || this._poUnitWeightKg(oLine);
            const fPeso = fUnitWeight * (oLine.OpenQuantity || 0);

            return {
                Sel: "N",
                ItemCode: oLine.Material,
                ItemName: oLine.PurchaseOrderItemText,
                // S/4 não distingue DocEntry (chave interna) de DocNum (número exibido) como o
                // B1 original fazia — A_PurchaseOrder só tem um número de documento (PurchaseOrder).
                // Os dois campos do PCH1 recebem o mesmo PurchaseOrder, como String(10) (10
                // dígitos não cabem no Int32 herdado do B1 — ver generate-mock.js).
                DocNum: sPurchaseOrder,
                DocEntry: sPurchaseOrder,
                LineNum: cbo.toInteger(iLineNum),
                PesoTo: toDecimal(fPeso),
                Quantity: toDecimal(fQtyInv > 0 ? (oLine.OrderQuantity - fUsedQty) : fQtyFinal),
                PriceCurr: toDecimal(oLine.UnitPrice),
                // TotalCurr = total na moeda do PEDIDO (≙ RowTotalFC/LineTotal do B1): NetAmount
                // do item já é na moeda do documento.
                TotalCurr: toDecimal(oLine.NetAmount),
                CardCode: oOrder.Supplier,
                CardName: oOrder.SupplierName,
                // Utilização (POR1.Usage → texto Siscomex), Container, Frete, Seguro e Model eram
                // campos da linha do pedido no B1 (padrão + UDFs do addon) sem equivalente na API
                // de pedido do S/4 — ficam vazios. Viriam de Custom Fields no item do pedido.
                Invoice: "",
                Container: "",
                Frete: toDecimal(0),
                Seguro: toDecimal(0),
                Model: "",
                NCMCode: oItemInfo.NCMCode || oLine.BR_NCM || "",
                SuppCatNum: oLine.SupplierMaterialNumber || ""
            };
        },

        // Peso líquido por unidade (kg) a partir do item do pedido. No S/4 ItemNetWeight já é POR
        // UNIDADE do pedido (no tenant, o mesmo material tem o mesmo peso com quantidade 1, 10 ou
        // 30) — diferente do Weight1 da POR1 no B1, que era o total da linha.
        _poUnitWeightKg(oPoLine) {
            const fPerUnit = Number(oPoLine.ItemNetWeight) || 0;
            return oPoLine.ItemWeightUnit === "G" ? fPerUnit / 1000 : fPerUnit;
        },

        // --- Recalcular FOB ------------------------------------------------------------------
        // Porta onRecalcularFob do port B1 (../sapimport — Button12_ClickAfter/Recalcula_FOB do
        // Processos.b1f.cs). Ver docs/fob-port-notes.md. Adaptações ao S/4:
        //  - pedidos: itens da API real (PurchaseOrderItem, via model/purchaseOrders) no lugar de
        //    POR1/OPOR via SQL; linha do Processo liga por DocEntry = PurchaseOrder, LineNum =
        //    PurchaseOrderItem.
        //  - taxas: navegação Moeda (PCH2) no lugar do array local /pch2.
        //  - NÃO portados por falta de modelo de fatura de fornecedor (OPCH/PCH1/RPC1 no B1,
        //    A_SupplierInvoice no S/4): o bloqueio "NFN já emitida" e as despesas debitadas
        //    (Frete/Seguro/Outros) rateadas nas linhas — entram como 0. Idem o aviso de desconto
        //    no pedido (A_PurchaseOrderItem não está modelado com desconto no mock).
        //  - grava direto (submit), como o original, que fazia PATCH na hora.
        async onRecalcularFob() {
            const oHeaderContext = this.getView().getBindingContext();
            const bNewMode = this.getView().getModel("detailView").getProperty("/newMode");
            if (!oHeaderContext || bNewMode) {
                MessageBox.error(this._t("procFobSaveFirst"));
                return;
            }
            // O cálculo parte do que está gravado; com edição pendente o resultado misturaria os
            // dois e a gravação levaria as edições junto sem o usuário ter pedido.
            if (this._isDirty()) {
                MessageBox.error(this._t("procFobPendingChanges"));
                return;
            }

            this.getView().setBusy(true);
            try {
                const aLineContexts = this._lineContexts("to_Itens");
                if (aLineContexts.length === 0) {
                    MessageToast.show(this._t("procFobNoItems"));
                    return;
                }
                const aRateRows = this._getLines("to_Moeda");
                const oPoLineByKey = await this._fetchPoLinesForRows(aLineContexts);

                if (!this._fobVerificaItensPedido(aLineContexts, oPoLineByKey)) {
                    return;
                }
                this._fobCheckLinhaDuplicada(aLineContexts);
                this._fobCheckPedidoEmReal(oPoLineByKey);

                // Calcula tudo antes de escrever qualquer coisa: um erro no meio (ex.: taxa da
                // moeda não cadastrada) não deixa metade das linhas alteradas.
                const aLineResults = await this._fobCalcularLinhas(oHeaderContext, aLineContexts, oPoLineByKey, aRateRows);
                const oHeaderResult = this._fobCalcularTotais(aLineContexts, aLineResults, oPoLineByKey, aRateRows);

                aLineResults.forEach(({ oCtx, oValues }) => {
                    Object.entries(oValues).forEach(([sProp, vValue]) => this._setDocProperty(oCtx, sProp, vValue));
                });
                Object.entries(oHeaderResult).forEach(([sProp, vValue]) => this._setDocProperty(oHeaderContext, sProp, vValue));

                await this._saveExisting();
                MessageToast.show(this._t("procFobSuccess"));
            } catch (oError) {
                await this._reloadAfterFailure();
                MessageBox.error(oError.message || String(oError));
            } finally {
                this.getView().setBusy(false);
            }
        },

        _isDirty() {
            return this.getView().getModel("detailView").getProperty("/isDirty");
        },

        // Contextos (do documento local) de todas as linhas de um nó filho
        _lineContexts(sNav) {
            const oDocModel = this._getDocModel();
            return this._getLines(sNav).map((oLine, iIndex) => oDocModel.createBindingContext(`/${sNav}/${iIndex}`));
        },

        // Grava a diferença do documento aberto e relê do backend (novas linhas ganham SAP_UUID;
        // sem reler, o próximo Salvar as criaria de novo)
        async _saveExisting() {
            const { model: oModel, path: sPath } = this._getProcSource();
            const oDoc = this._getDocModel().getData();
            await cbo.saveDocument(oModel, sPath, oDoc, this._oOriginal, NAVS);
            await this._loadDocument(oDoc.SAP_UUID);
            this.getView().getModel("detailView").setProperty("/isDirty", false);
        },

        // Depois de um cálculo que falhou ao gravar: descarta o pendente no modelo V2 e volta ao
        // que está no backend (o documento local já tinha os valores calculados aplicados)
        async _reloadAfterFailure() {
            cbo.reset(this._getProcModel());
            const sUuid = this._oOriginal && this._oOriginal.SAP_UUID;
            if (sUuid) {
                await this._loadDocument(sUuid).catch(() => {});
                this.getView().getModel("detailView").setProperty("/isDirty", false);
            }
        },

        // Linhas de pedido referenciadas pelo Processo, chaveadas "PurchaseOrder|LineNum"
        async _fetchPoLinesForRows(aLineContexts) {
            const aOrders = [...new Set(aLineContexts.map((oCtx) => oCtx.getProperty("DocEntry")).filter(Boolean))];
            if (aOrders.length === 0) {
                return {};
            }
            const aPoLines = await purchaseOrders.getLines(this._getPoModel(), aOrders, false);
            const oByKey = {};
            aPoLines.forEach((oPo) => {
                oByKey[`${oPo.PurchaseOrder}|${Number(oPo.PurchaseOrderItem)}`] = oPo;
            });
            return oByKey;
        },

        _fobKey(oCtx) {
            return `${oCtx.getProperty("DocEntry")}|${oCtx.getProperty("LineNum")}`;
        },

        // Equivalente a VerificaItensPedido: toda linha com pedido tem que ainda existir nele
        _fobVerificaItensPedido(aLineContexts, oPoLineByKey) {
            const aMissing = aLineContexts
                .filter((oCtx) => oCtx.getProperty("DocEntry") && !oPoLineByKey[this._fobKey(oCtx)])
                .map((oCtx) => `${oCtx.getProperty("DocEntry")}/${oCtx.getProperty("LineNum")}`);
            if (aMissing.length > 0) {
                MessageBox.error(this._t("procFobLinhasNaoExistem", [aMissing.join(", ")]));
                return false;
            }
            return true;
        },

        // Equivalente a CheckPedidoLinhaDuplicada — aviso, não bloqueia
        _fobCheckLinhaDuplicada(aLineContexts) {
            const oSeen = new Set();
            const bDuplicada = aLineContexts.some((oCtx) => {
                const sKey = this._fobKey(oCtx);
                const bDup = oSeen.has(sKey);
                oSeen.add(sKey);
                return bDup;
            });
            if (bDuplicada) {
                MessageToast.show(this._t("procFobLinhaDuplicada"));
            }
        },

        // Equivalente a CheckPedidoEmReal — aviso, não bloqueia
        _fobCheckPedidoEmReal(oPoLineByKey) {
            const sLocal = this._getLocalCurrency();
            const aOrders = [...new Set(Object.values(oPoLineByKey)
                .filter((oPo) => oPo.DocumentCurrency === sLocal).map((oPo) => oPo.PurchaseOrder))];
            if (aOrders.length > 0) {
                MessageToast.show(this._t("procFobMoedaReal", [aOrders.join(", ")]));
            }
        },

        _fobRate(aRateRows, sCurrency) {
            return Number((aRateRows.find((oRow) => oRow.CurrCode === sCurrency) || {}).Rate) || 0;
        },

        // Núcleo de Recalcula_FOB: peso e valor FOB de cada linha a partir do pedido. Retorna
        // [{ oCtx, oValues }] sem escrever nada (onRecalcularFob aplica depois).
        async _fobCalcularLinhas(oHeaderContext, aLineContexts, oPoLineByKey, aRateRows) {
            const sLocalCurrency = this._getLocalCurrency();
            const oIcfg = await this._getIcfgConfig();
            const bPesoPed = oIcfg.PesoPed === "Y";
            const bPedPai = oHeaderContext.getProperty("PedPai") === "Y";

            const oItemByKey = await this._getItemInfoForPoLines(Object.values(oPoLineByKey).filter((oPo) => oPo.Material));

            const aResults = [];
            aLineContexts.forEach((oCtx) => {
                const oPo = oPoLineByKey[this._fobKey(oCtx)];
                if (!oPo) {
                    return; // linha sem pedido (digitada à mão): o FOB não mexe nela, como no original
                }
                const oItem = oItemByKey[`${oPo.Plant || ""}|${oPo.Material}`] || {};
                const fLineQty = Number(oCtx.getProperty("Quantity")) || 0;
                const fPeso = this._fobPesoLinha(oPo, oItem, bPesoPed, bPedPai ? Number(oPo.OrderQuantity) || 0 : fLineQty);
                const { fValorUnitario, fRate } = this._fobValorUnitario(oPo, sLocalCurrency, aRateRows);
                const fQde = bPedPai ? (Number(oPo.OpenQuantity) || 0) : fLineQty;

                const oValues = {
                    PesoTo: toDecimal(fPeso),
                    PriceCurr: toDecimal(fValorUnitario),
                    TotalCurr: toDecimal(fValorUnitario * fQde),
                    Price: toDecimal(fRate * fValorUnitario * fQde),
                    NCMCode: oItem.NCMCode || oPo.BR_NCM || oCtx.getProperty("NCMCode") || ""
                };
                aResults.push({ oCtx, oValues });
            });
            return aResults;
        },

        // Peso da linha: do pedido (ICFG PesoPed) ou do cadastro do produto. S/4: ItemNetWeight/
        // ItemWeightUnit do item do pedido (≙ Weight1/Wght1Unit da POR1) — também usado quando o
        // produto não tem peso cadastrado.
        _fobPesoLinha(oPo, oItem, bPesoPed, fQty) {
            const fProductKg = this._productUnitWeightKg(oItem);
            return (bPesoPed || !fProductKg ? this._poUnitWeightKg(oPo) : fProductKg) * fQty;
        },

        // Peso por unidade em kg do cadastro de produto (formato de model/lookups.getItemsInfo,
        // herdado do B1: PurchaseWeightUnit1 2 = g, 3 = kg); 0 = sem peso cadastrado
        _productUnitWeightKg(oItem) {
            const fWeight = Number(oItem && oItem.PurchaseUnitWeight1) || 0;
            if (oItem && oItem.PurchaseWeightUnit1 === 2) {
                return fWeight / 1000;
            }
            return oItem && oItem.PurchaseWeightUnit1 === 3 ? fWeight : 0;
        },

        // Valor unitário na moeda do pedido + taxa p/ moeda local. NetAmount do item é na moeda
        // do pedido (≙ TotalFrgn, ou LineTotal quando o pedido já é em moeda local). Sem taxa
        // cadastrada na aba Moeda = erro (como no original).
        _fobValorUnitario(oPo, sLocalCurrency, aRateRows) {
            const bLocal = oPo.DocumentCurrency === sLocalCurrency;
            const fTotal = Number(oPo.NetAmount) || 0;
            const fRate = bLocal ? 1 : this._fobRate(aRateRows, oPo.DocumentCurrency);
            if (fRate === 0) {
                throw new Error(this._t("procFobTaxaNaoEncontrada", [oPo.DocumentCurrency]));
            }
            return { fValorUnitario: fTotal / (Number(oPo.OrderQuantity) || 1), fRate };
        },

        // Equivalente a GetTotal: totais do cabeçalho a partir das linhas já recalculadas
        // (linhas sem pedido entram com o valor que já tinham)
        _fobCalcularTotais(aLineContexts, aLineResults, oPoLineByKey, aRateRows) {
            const oNewByCtx = new Map(aLineResults.map(({ oCtx, oValues }) => [oCtx, oValues]));
            const fValue = (oCtx, sProp) => Number((oNewByCtx.get(oCtx) || {})[sProp] ?? oCtx.getProperty(sProp)) || 0;
            const fToFob = aLineContexts.reduce((fSum, oCtx) => fSum + fValue(oCtx, "Price"), 0);
            const fToCif = aLineContexts.reduce((fSum, oCtx) => fSum + fValue(oCtx, "PriceTotal"), 0);
            const fPesoLiq = aLineContexts.reduce((fSum, oCtx) => fSum + fValue(oCtx, "PesoTo"), 0);

            // Taxa do cabeçalho = moeda do pedido de maior número (mesma regra do original)
            let fRate = 1;
            const aWithPo = aLineContexts.filter((oCtx) => oPoLineByKey[this._fobKey(oCtx)]);
            if (aWithPo.length > 0) {
                const sMaxOrder = aWithPo.map((oCtx) => oCtx.getProperty("DocEntry")).sort().pop();
                const oPo = Object.values(oPoLineByKey).find((o) => o.PurchaseOrder === sMaxOrder);
                fRate = (oPo && this._fobRate(aRateRows, oPo.DocumentCurrency)) || 1;
            }
            return {
                ToFob: toDecimal(fToFob),
                ToCif: toDecimal(fToCif),
                ToFobCurr: toDecimal(fToFob / fRate),
                ToCifCurr: toDecimal(fToCif / fRate),
                PesoLiq: toDecimal(fPesoLiq)
            };
        },

        // --- Recalcular CIF ------------------------------------------------------------------
        // Porta onRecalcularCif do port B1 (Button13_ClickAfter/Recalcula_CIF do Processos.b1f.cs).
        // Ver docs/cif-port-notes.md. O rateio (Capatazia/Collect/Seguro/Aduaneiro/Outros/Siscomex
        // por Adição/Peso/Valor) e as fórmulas de II/PIS/COFINS/IPI/ICMS/reforma são as mesmas. O
        // que muda é a ORIGEM das alíquotas: o B1 determinava o TaxCode de cada item (árvore
        // OTCD/TCD1-5) e lia as alíquotas das autoridades fiscais (OSTA) — motor de imposto do B1
        // sem equivalente modelado no S/4. Aqui as alíquotas/reduções são as que já estão na
        // linha (Al_*, Re_ICMS, Re_Ba_ICMS, Reducao1/2 — exatamente os campos que o B1 gravava
        // depois de determinar), base = 100%. Antidumping (UDT [@DUMP], não modelada): mantém o
        // Vr_Adp que a linha já tiver. Também não porta o bloqueio "NFN já emitida" (sem fatura).
        async onRecalcularCif() {
            const oHeaderContext = this.getView().getBindingContext();
            const bNewMode = this.getView().getModel("detailView").getProperty("/newMode");
            if (!oHeaderContext || bNewMode) {
                MessageBox.error(this._t("procCifSaveFirst"));
                return;
            }
            if (this._isDirty()) {
                MessageBox.error(this._t("procCifPendingChanges"));
                return;
            }
            if ((Number(oHeaderContext.getProperty("ToFob")) || 0) === 0) {
                MessageBox.error(this._t("procCifNoFob"));
                return;
            }
            if ((Number(oHeaderContext.getProperty("PesoLiq")) || 0) === 0) {
                MessageBox.error(this._t("procCifNoPeso"));
                return;
            }

            this.getView().setBusy(true);
            try {
                const aLineContexts = this._lineContexts("to_Itens");
                if (aLineContexts.length === 0) {
                    MessageToast.show(this._t("procCifNoPeso"));
                    return;
                }
                const aRateRows = this._getLines("to_Moeda");
                const oCalc = await this._cifContexto(oHeaderContext, aLineContexts, aRateRows);

                // Calcula tudo, depois escreve (mesma regra do FOB)
                const oTotais = {};
                const aResults = aLineContexts.map((oCtx) => {
                    const oR = this._cifCalcularLinha(oCtx, oCalc);
                    Object.entries(oR.oTotais).forEach(([k, v]) => { oTotais[k] = (oTotais[k] || 0) + v; });
                    return { oCtx, oValues: oR.oValues };
                });
                aResults.forEach(({ oCtx, oValues }) => {
                    Object.entries(oValues).forEach(([sProp, vValue]) => this._setDocProperty(oCtx, sProp, vValue));
                });
                Object.entries(this._cifTotaisCabecalho(oTotais)).forEach(([sProp, vValue]) => this._setDocProperty(oHeaderContext, sProp, vValue));

                await this._saveExisting();
                MessageToast.show(this._t("procCifSuccess"));
            } catch (oError) {
                await this._reloadAfterFailure();
                MessageBox.error(oError.message || String(oError));
            } finally {
                this.getView().setBusy(false);
            }
        },

        // Valores do cabeçalho usados no rateio, já convertidos para moeda local
        async _cifContexto(oHeaderContext, aLineContexts, aRateRows) {
            const sLocal = this._getLocalCurrency();
            const fRateOf = (sCurr) => (!sCurr || sCurr === sLocal ? 1 : this._fobRate(aRateRows, sCurr));
            const fNum = (sProp) => Number(oHeaderContext.getProperty(sProp)) || 0;
            const sStr = (sProp) => oHeaderContext.getProperty(sProp) || "";
            const oIcfg = await this._getIcfgConfig();

            const oAdicaoCounts = {};
            aLineContexts.forEach((oCtx) => {
                const sKey = oCtx.getProperty("Adicao") || "";
                oAdicaoCounts[sKey] = (oAdicaoCounts[sKey] || 0) + 1;
            });

            const oC = {
                fToFob: fNum("ToFob"),
                fPesoTo: fNum("PesoLiq"),
                fCapatazia: fNum("Capatazia"), sMetoCap: sStr("MetoCap"),
                fCollect: fNum("Collect") * fRateOf(sStr("CurrCol")), sMetoCol: sStr("MetoCol"),
                fSeguro: fNum("Seguro") * fRateOf(sStr("CurrSeg")), sMetoSeg: sStr("MetoSeg"),
                fAduaneiro: fNum("Aduaneiro") * fRateOf(sStr("CurrAdu")), sMetoAdu: sStr("MetoAdu"),
                fOutros: fNum("Outros") * fRateOf(sStr("CurrOut")), sMetoOut: sStr("MetoOut"),
                fSisComex: fNum("SisComex"), sMetoSis: sStr("MetoSis"),
                bNPisCofins: oIcfg.OverPC === "Y",
                oAdicaoCounts,
                iAdiTo: Object.keys(oAdicaoCounts).length || 1,
                oWarnings: { peso: false, adicao: false }
            };
            oC.fAcrescimo = oC.fCapatazia + oC.fCollect + oC.fSeguro + oC.fOutros;
            return oC;
        },

        // Fração de uma despesa que cabe à linha: por Adição (igual entre as linhas da adição e
        // entre adições), por Peso ou por Valor (default, como no original)
        _cifFator(oC, sMeto, fLinhaValor, fLinhaPeso, fTotalValor, iQdeAdicao) {
            if (sMeto === "Adição") {
                return 1 / (iQdeAdicao * oC.iAdiTo);
            }
            if (sMeto === "Peso") {
                return oC.fPesoTo === 0 ? 0 : fLinhaPeso / oC.fPesoTo;
            }
            return fTotalValor === 0 ? 0 : fLinhaValor / fTotalValor;
        },

        // Alíquotas da linha (frações: 0,18 = 18%, como o B1 grava) com base 100%
        _cifAliquotasDaLinha(oCtx) {
            const fN = (sProp) => Number(oCtx.getProperty(sProp)) || 0;
            const oG = { redICMS: fN("Re_ICMS"), redBaICMS: fN("Re_Ba_ICMS"), reducao1: fN("Reducao1"), reducao2: fN("Reducao2") };
            ["II", "PIS", "PISM", "COF", "COFM", "IPI", "ICMS", "IS", "IBSMUN", "IBSUF", "CBS"].forEach((sTax) => {
                oG["al" + sTax] = fN("Al_" + sTax);
                oG["ba" + sTax] = 1;
            });
            return oG;
        },

        _cifRateioLinha(oCtx, oC) {
            const fVrFob = Number(oCtx.getProperty("Price")) || 0;
            const fPeso = Number(oCtx.getProperty("PesoTo")) || 0;
            if (fPeso === 0 && !oC.oWarnings.peso) {
                MessageToast.show(this._t("procCifPesoZero", [oCtx.getProperty("ItemCode")]));
                oC.oWarnings.peso = true;
            }
            const sAdicao = oCtx.getProperty("Adicao") || "";
            if (!sAdicao && !oC.oWarnings.adicao) {
                MessageToast.show(this._t("procCifAdicaoBlank"));
                oC.oWarnings.adicao = true;
            }
            const iQde = oC.oAdicaoCounts[sAdicao] || 1;
            const fF = (sMeto, fValor, fTotal) => this._cifFator(oC, sMeto, fValor, fPeso, fTotal, iQde);

            const fPCapatazia = oC.fCapatazia * fF(oC.sMetoCap, fVrFob, oC.fToFob);
            const fPCollect = oC.fCollect * fF(oC.sMetoCol, fVrFob + fPCapatazia, oC.fToFob + oC.fCapatazia);
            const fPSeguro = oC.fSeguro * fF(oC.sMetoSeg, fVrFob + fPCapatazia, oC.fToFob + oC.fCapatazia);
            const fPAduaneiro = oC.fAduaneiro * fF(oC.sMetoAdu, fVrFob, oC.fToFob);
            const fPOutros = oC.fOutros * fF(oC.sMetoOut, fVrFob, oC.fToFob);
            const fVrAcrescimo = fPCapatazia + fPCollect + fPSeguro + fPOutros;
            const fVrCif = fVrFob + fVrAcrescimo;
            const fPSiscomex = oC.fSisComex * fF(oC.sMetoSis, fVrCif, oC.fToFob + oC.fAcrescimo);
            return { fPCollect, fPSeguro, fPAduaneiro, fPOutros, fVrAcrescimo, fVrCif, fPSiscomex };
        },

        // Uma linha: rateio + impostos. Fórmulas idênticas a _computeCifLineValues do port B1.
        _cifCalcularLinha(oCtx, oC) {
            const r = this._cifRateioLinha(oCtx, oC);
            const oG = this._cifAliquotasDaLinha(oCtx);
            const fVrAdp = Number(oCtx.getProperty("Vr_Adp")) || 0;

            const fBaII = r.fVrCif;
            const fVrII = fBaII * oG.baII * oG.alII;

            // PIS/COFINS: base própria (não cumulativa) salvo ICFG.OverPC = Y
            let fBaPisCof = r.fVrCif;
            if (!oC.bNPisCofins) {
                const fDen = (1 - oG.alPIS - oG.alPISM - oG.alCOF - oG.alCOFM) * (1 - oG.alICMS * oG.baICMS);
                const fNum = r.fVrCif * (1 + oG.alICMS * oG.baICMS * (oG.alII + oG.alIPI * (1 + oG.alII)));
                fBaPisCof = fDen === 0 ? 0 : fNum / fDen;
            }
            const fVrPIS = fBaPisCof * oG.baPIS * oG.alPIS;
            const fVrPISM = fBaPisCof * oG.baPISM * oG.alPISM;
            const fVrCOF = fBaPisCof * oG.baCOF * oG.alCOF;
            const fVrCOFM = fBaPisCof * oG.baCOFM * oG.alCOFM;

            const fBaIPI = r.fVrCif + (fBaII * oG.alII); // Drawback: II entra na base mesmo suspenso (original)
            const fVrIPI = fBaIPI * oG.baIPI * oG.alIPI;

            const fMulta = Number(oCtx.getProperty("Multa")) || 0;
            const fDenICMS = 1 - oG.alICMS * (1 - oG.reducao1);
            const fBaICMS = fDenICMS === 0 ? 0 : (
                (r.fVrCif + r.fPSiscomex + r.fPAduaneiro + fVrAdp + fVrII + fVrIPI + fVrPIS + fVrPISM + fVrCOF + fVrCOFM + fMulta)
                * oG.baICMS / fDenICMS);
            let fVrICMS = fBaICMS * (oG.alICMS - oG.redICMS) * (1 - oG.reducao2);
            if (oG.baICMS + oG.redBaICMS > 1) {
                fVrICMS *= (1 - oG.redBaICMS); // ICMS desonerado
            }
            // Reforma tributária: base = CIF puro (sem reduções), como no original
            const oReforma = {};
            ["IS", "IBSMUN", "IBSUF", "CBS"].forEach((sTax) => { oReforma[sTax] = r.fVrCif * oG["ba" + sTax] * oG["al" + sTax]; });

            // Chaves entre aspas: nomes de campo do contrato (com "_"), não identificadores JS
            const oValues = {
                "Vr_Add": r.fVrAcrescimo, "Vr_TxUtil": r.fPSiscomex, "Vr_TxAdu": r.fPAduaneiro, "Vr_TxOut": r.fPOutros,
                "PriceTotal": r.fVrCif, "Frete": r.fPCollect, "Seguro": r.fPSeguro,
                "Ba_II": fBaII, "Vr_II": fVrII,
                "Ba_PIS": fBaPisCof, "Vr_PIS": fVrPIS, "Ba_PISM": fBaPisCof, "Vr_PISM": fVrPISM,
                "Ba_COF": fBaPisCof, "Vr_COF": fVrCOF, "Ba_COFM": fBaPisCof, "Vr_COFM": fVrCOFM,
                "Ba_IPI": fBaIPI, "Vr_IPI": fVrIPI, "Ba_ICMS": fBaICMS, "Vr_ICMS": fVrICMS
            };
            Object.entries(oReforma).forEach(([sTax, fVr]) => {
                oValues["Ba_" + sTax] = oG["ba" + sTax];
                oValues["Vr_" + sTax] = fVr;
            });
            Object.keys(oValues).forEach((k) => { oValues[k] = toDecimal(oValues[k]); });

            return {
                oValues,
                oTotais: {
                    Add: r.fVrAcrescimo, Cif: r.fVrCif, Adp: fVrAdp, II: fVrII, PIS: fVrPIS, PISM: fVrPISM,
                    COF: fVrCOF, COFM: fVrCOFM, IPI: fVrIPI, ICMS: fVrICMS, ...oReforma
                }
            };
        },

        _cifTotaisCabecalho(t) {
            const n = (k) => t[k] || 0;
            const oH = {
                AntiDump: n("Adp"), ToAdd: n("Add"), ToII: n("II"),
                ToPIS: n("PIS"), ToPISM: n("PISM"), TToPIS: n("PIS") + n("PISM"),
                ToCOF: n("COF"), ToCOFM: n("COFM"), TToCOF: n("COF") + n("COFM"),
                ToIPI: n("IPI"), ToICMS: n("ICMS"), ToCif: n("Cif"),
                ToIS: n("IS"), ToIBSMUN: n("IBSMUN"), ToIBSUF: n("IBSUF"), ToCBS: n("CBS")
            };
            Object.keys(oH).forEach((k) => { oH[k] = toDecimal(oH[k]); });
            return oH;
        },

        // Sem CompanyService_GetAdminInfo (não portado — ver docs/despcalc-port-notes.md e a
        // memória do projeto sobre adminInfo.js) pra ler a moeda local de verdade; fixo em "BRL",
        // coerente com o app inteiro ser voltado a importação/desembaraço no Brasil.
        _getLocalCurrency() {
            return "BRL";
        },

        onAddCurrency() {
            this._addChildLine("currTable", {});
        },

        onDeleteCurrency() {
            this._deleteChildLine("currTable");
        },

        onAddDespaLine() {
            this._addChildLine("despaTable", {});
        },

        onDeleteDespaLine() {
            this._deleteChildLine("despaTable");
        },

        onAddDemurLine() {
            this._addChildLine("demurTable", {});
        },

        onDeleteDemurLine() {
            this._deleteChildLine("demurTable");
        },

        // numerariosTable nunca tem linhas nesta rodada (ver onInit) — mantido fiel ao original
        // (que recalcula os totais ao marcar/desmarcar "Sel") só por completude, sem efeito
        // prático até BindNumerarios existir.
        onNumSelChange() {
            const oModel = this.getView().getModel("detailView");
            const aRows = oModel.getProperty("/numerarios") || [];
            let fDebit = 0;
            let fCredit = 0;
            aRows.forEach((oRow) => {
                if (oRow.Sel === "Y") {
                    fDebit += Number(oRow.Debit) || 0;
                    fCredit += Number(oRow.Credit) || 0;
                }
            });
            oModel.setProperty("/numerariosTotalDebit", fDebit);
            oModel.setProperty("/numerariosTotalCredit", fCredit);
        },

        onAddPreCalcLine() {
            this._addChildLine("preCalcTable", { CreateNF: "N" });
        },

        onDeletePreCalcLine() {
            this._deleteChildLine("preCalcTable");
        },

        // Porta a checagem de zProcNum obrigatório+único do Button6_ClickBefore original
        // (Processos.b1f.cs:15884, fm_ADD_MODE) — a busca por SQL bruto (Functions.mDlookup em
        // [@IPCH], bloqueada em /SQLQueries) vira uma query OData simples contra /IMPPCH.
        async _validateNewProcNum(oContext) {
            const sProcNum = (oContext.getProperty("ProcNum") || "").trim();
            if (!sProcNum) {
                MessageBox.error(this._t("procProcNumRequired"));
                return false;
            }
            const { model: oModel, path: sPath } = this._getProcSource();
            const aSame = await cbo.read(oModel, sPath, {
                filters: [new Filter("ProcNum", FilterOperator.EQ, sProcNum)],
                urlParameters: { $top: 1, $select: "SAP_UUID" }
            }).catch(() => []);
            if (aSame.length > 0) {
                MessageBox.error(this._t("procProcNumDuplicate", [sProcNum]));
                return false;
            }
            return true;
        },

        _t(sKey, aArgs) {
            return this.getView().getModel("i18n").getResourceBundle().getText(sKey, aArgs);
        },

        async onSave() {
            const oContext = this.getView().getBindingContext();
            const bNewMode = this.getView().getModel("detailView").getProperty("/newMode");

            if (bNewMode && !(await this._validateNewProcNum(oContext))) {
                return;
            }

            this.getView().setBusy(true);
            try {
                if (bNewMode) {
                    // Cabeçalho + as 6 tabelas num POST só (deep insert)
                    this._setDocProperty(oContext, "DocEntry", await this._getNextDocEntry());
                    const { model: oModel, path: sPath } = this._getProcSource();
                    const oDoc = this._getDocModel().getData();
                    await cbo.saveDocument(oModel, sPath, oDoc, undefined, NAVS);
                    await this._ensureUniqueDocEntry(oDoc.ProcNum, oDoc.DocEntry);
                    this.getView().getModel("detailView").setProperty("/isDirty", false);
                    MessageToast.show(this._t("procSaveSuccess"));
                    this.onNavBack();
                    return;
                }
                await this._saveExisting();
                MessageToast.show(this._t("procSaveSuccess"));
            } catch (oError) {
                cbo.reset(this._getProcModel());
                MessageBox.error(this._t("procSaveError", [oError.message || String(oError)]));
            } finally {
                this.getView().setBusy(false);
            }
        },

        onCancel() {
            // Nada a desfazer no backend: a edição só existe no documento local
            this.onNavBack();
        }
    });
});
