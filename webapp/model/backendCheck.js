sap.ui.define([
	"sap/ui/core/Messaging"
], (Messaging) => {
	"use strict";

	/**
	 * Versão de dados do backend (ZCL_IMPSETUP_MIGRATIONS=>target_version no ABAP) que esta versão
	 * do app exige. Subir junto quando o app passar a depender de uma migração nova do backend.
	 * 2 = intervalo de numeração do DocEntry do Processo (sem ele, criar Processo falha).
	 * 3 = linha de configuração IMPICFG Code='001' (tela Configs e o Processo leem dela).
	 */
	const REQUIRED_BACKEND_VERSION = 3;

	// "$direct": o modelo usa updateGroupId "deferred" (submit manual), que seguraria a ação.
	async function invoke(oModel, sPath) {
		const oBinding = oModel.bindContext(sPath);
		await oBinding.invoke("$direct");
		return oBinding.getBoundContext().requestObject();
	}

	/**
	 * Equivalente S/4 da checagem de instalação do Inicio.cs (B1): a ESTRUTURA do backend chega pelo
	 * add-on e não pode ser criada pelo app; aqui só se confere se ela existe/está na versão certa e
	 * se aplicam as migrações de DADOS pendentes (ação RunSetup do BO ImpSetup).
	 *
	 * Resolve sempre (nunca rejeita) com { state, status?, error?, retryable? }:
	 *  - "ok"           backend pronto (RunSetup já rodou se havia passos pendentes)
	 *  - "notInstalled" serviço/BO ImpSetup inexistente — add-on não instalado
	 *  - "outdated"     backend instalado é mais antigo do que este app exige
	 *  - "unreachable"  não foi possível falar com o backend (rede, autenticação, 5xx...)
	 *  - "setupFailed"  a ação RunSetup falhou
	 * retryable: dá para rodar de novo sem recarregar a página. Falha no $metadata não é: o
	 * ODataModel guarda a promise rejeitada, então só um reload/reabertura do app resolve.
	 */
	async function run(oModel) {
		let sNamespace;
		try {
			const sType = await oModel.getMetaModel().requestObject("/ImpSetup/$Type");
			if (!sType) {
				return { state: "notInstalled" };
			}
			sNamespace = sType.slice(0, sType.lastIndexOf("."));
		} catch (oError) {
			// $metadata 404 = serviço não publicado (add-on ausente); o resto é falha de acesso
			return { state: oError.status === 404 ? "notInstalled" : "unreachable", error: oError.message };
		}

		let oStatus;
		try {
			oStatus = await invoke(oModel, `/ImpSetup/${sNamespace}.GetStatus(...)`);
		} catch (oError) {
			return { state: "unreachable", error: oError.message, retryable: true };
		}
		if (oStatus.TargetVersion < REQUIRED_BACKEND_VERSION) {
			return { state: "outdated", status: oStatus };
		}
		if (oStatus.CurrentVersion < oStatus.TargetVersion) {
			try {
				await invoke(oModel, `/ImpSetup/${sNamespace}.RunSetup(...)`);
				// O resultado do RunSetup é otimista: passos de configuração (ex.: intervalo de
				// numeração) rodam na fase SAVE, depois da resposta montada. GetStatus de novo confere
				// o que ficou de fato aplicado (o backend verifica esses passos, não só a versão gravada).
				oStatus = await invoke(oModel, `/ImpSetup/${sNamespace}.GetStatus(...)`);
			} catch (oError) {
				return { state: "setupFailed", status: oStatus, error: oError.message, retryable: true };
			}
			// Um passo com erro na parte MODIFY não falha a ação: ela para ali e o erro vem como
			// mensagem (sap-messages), que o V4 joga no Messaging central. Erro na parte SAVE não tem
			// mensagem — só aparece como versão pendente aqui.
			if (oStatus.CurrentVersion < oStatus.TargetVersion) {
				const oLastError = Messaging.getMessageModel().getData().filter((oMsg) => oMsg.getType() === "Error").pop();
				return { state: "setupFailed", status: oStatus, error: oLastError ? oLastError.getMessage() : "", retryable: true };
			}
		}
		return { state: "ok", status: oStatus };
	}

	return { REQUIRED_BACKEND_VERSION, run };
});
