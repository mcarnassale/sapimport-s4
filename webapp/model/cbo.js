sap.ui.define([], () => {
	"use strict";

	/**
	 * Acesso aos Custom Business Objects do S/4 (serviços YY1_ACX_*_CDS, OData V2 — o CBO não gera
	 * V4). Tudo que é específico de V2 fica aqui, para as telas não dependerem do protocolo: se o
	 * backend voltar a ser RAP V4 (add-on), a troca se concentra neste módulo.
	 *
	 * Os modelos usam o grupo deferido padrão do V2 ("changes"): edições, createEntry/create e
	 * delete ficam pendentes até submit().
	 */

	/**
	 * CBOs já migrados: nome lógico (o entity set que o app usava no RAP) -> modelo do Component +
	 * entity set no serviço YY1_ACX_*_CDS.
	 */
	const ENTITIES = {
		DESPCAL: { model: "despcal", set: "YY1_ACX_DESPCAL" },
		IMPLAY: { model: "implay", set: "YY1_ACX_IMPLAY" },
		IMPICFG: { model: "impicfg", set: "YY1_ACX_IMPICFG" },
		IMPIPRV: { model: "impiprv", set: "YY1_ACX_IMPIPRV" },
		IMPPCH: { model: "imppch", set: "YY1_ACX_IMPPCH" }
	};

	/** { model, path } do entity set de um CBO migrado, ou undefined */
	function source(oComponent, sEntity) {
		const oEntity = ENTITIES[sEntity];
		return oEntity && { model: oComponent.getModel(oEntity.model), path: "/" + oEntity.set };
	}

	/** Caminho de uma instância pela chave técnica (SAP_UUID, Edm.Guid) */
	function keyPath(sEntity, sUuid) {
		return `/${ENTITIES[sEntity].set}(guid'${sUuid}')`;
	}

	/**
	 * Valor para Edm.Decimal: o V2 serializa Decimal como STRING. Arredonda na escala dos CBOs
	 * (19,4), senão uma conta como 0.1*3 vira 0.30000000000000004 e estoura a escala.
	 */
	function toDecimal(vValue) {
		return (Number(vValue) || 0).toFixed(4);
	}

	/**
	 * Valor para campo inteiro: o CBO não tem tipo inteiro — os Int32 do contrato viraram
	 * Edm.Decimal(10,0), também serializado como string.
	 */
	function toInteger(vValue) {
		return String(Math.round(Number(vValue) || 0));
	}

	/**
	 * Entity type (metamodelo V2) de um caminho de instância — "/SET(guid'..')" ou com navegação,
	 * "/SET(guid'..')/to_Itens(guid'..')". O getMetaContext do V2 não resolve chave guid.
	 */
	function entityTypeOf(oMetaModel, sPath) {
		const aSegments = sPath.split("/").filter(Boolean).map((s) => s.replace(/\(.*\)$/, ""));
		let oEntityType = oMetaModel.getODataEntityType(oMetaModel.getODataEntitySet(aSegments[0]).entityType);
		for (const sNav of aSegments.slice(1)) {
			oEntityType = oMetaModel.getODataEntityType(oMetaModel.getODataAssociationEnd(oEntityType, sNav).type);
		}
		return oEntityType;
	}

	/**
	 * Converte vValue para o tipo Edm de sProperty no contexto (lido do metamodelo). Ex.: o título
	 * de um SelectDialog é sempre texto, e um campo Edm.Decimal precisa ir como string na escala
	 * dele ("2" num Decimal(10,0), "2.0000" num 19,4).
	 */
	function toEdmValue(oContext, sProperty, vValue) {
		const oMetaModel = oContext.getModel().getMetaModel();
		const oProperty = oMetaModel.getODataProperty(entityTypeOf(oMetaModel, oContext.getPath()), sProperty);
		if (oProperty && oProperty.type === "Edm.Decimal") {
			return (Number(vValue) || 0).toFixed(Number(oProperty.scale) || 0);
		}
		return vValue;
	}

	// Erro de request isolado traz o corpo em responseText; resposta dentro do $batch, em body
	function errorText(oError) {
		try {
			const oBody = JSON.parse(oError.responseText || oError.body);
			return oBody.error.message.value;
		} catch {
			return oError.message || oError.statusText || String(oError);
		}
	}

	/** model.read em forma de Promise; resolve com o array de resultados (ou o objeto lido) */
	function read(oModel, sPath, mParameters) {
		return new Promise((resolve, reject) => {
			oModel.read(sPath, Object.assign({}, mParameters, {
				success: (oData) => resolve(oData && oData.results ? oData.results : oData),
				error: (oError) => reject(new Error(errorText(oError)))
			}));
		});
	}

	/**
	 * submitChanges que rejeita quando o backend recusa algo. No V2 o success do submitChanges é
	 * chamado mesmo com um request recusado dentro do $batch — o erro vem em __batchResponses.
	 * Rejeita com Error(texto do backend).
	 */
	function submit(oModel) {
		return new Promise((resolve, reject) => {
			if (!oModel.hasPendingChanges(true)) {
				resolve();
				return;
			}
			oModel.submitChanges({
				success(oData) {
					const aFailed = (oData && oData.__batchResponses || []).flatMap((oResponse) =>
						oResponse.__changeResponses ? [] : [oResponse]).filter((oResponse) => oResponse.response && +oResponse.response.statusCode >= 400);
					if (aFailed.length) {
						reject(new Error(errorText(aFailed[0].response)));
						return;
					}
					resolve();
				},
				error(oError) {
					reject(new Error(errorText(oError)));
				}
			});
		});
	}

	/** DELETE imediato (fora do grupo deferido) de uma instância; rejeita com o erro do backend */
	function remove(oModel, sPath) {
		return new Promise((resolve, reject) => {
			oModel.remove(sPath, {
				success: () => resolve(),
				error: (oError) => reject(new Error(errorText(oError)))
			});
		});
	}

	/** Descarta edições, criações e exclusões pendentes */
	function reset(oModel) {
		return oModel.resetChanges(undefined, true, true);
	}

	// --- Documentos com nós filho (cabeçalho + linhas) -------------------------------------------
	// Telas com tabela de linhas editam o documento num JSONModel local e gravam a diferença no
	// Salvar. No V2 uma exclusão pendente não sai da lista até o submit (e a sap.ui.table não tem
	// como esconder uma linha), e o local também deixa Duplicar/"Todas Desp" triviais.
	// Formato do documento: { SAP_UUID?, __path?, ...campos, <nav>: [{ SAP_UUID?, __path?, ...campos }] }
	// (__path = caminho da instância no modelo V2; sem SAP_UUID = ainda não gravado).

	// Só os campos de negócio graváveis: fora a chave, administrativos (SAP_*), navegações
	// (to_*), textos derivados (*_Text) e controle (__*)
	function payload(oObject) {
		const oResult = {};
		for (const [sKey, vValue] of Object.entries(oObject)) {
			if (!/^(SAP_|__|to_)/.test(sKey) && !/_Text$/.test(sKey) && !Array.isArray(vValue)) {
				oResult[sKey] = vValue;
			}
		}
		return oResult;
	}

	function changedFields(oCurrent, oOriginal) {
		const oResult = {};
		for (const [sKey, vValue] of Object.entries(payload(oCurrent))) {
			if (String(vValue ?? "") !== String(oOriginal[sKey] ?? "")) {
				oResult[sKey] = vValue;
			}
		}
		return oResult;
	}

	// Datas no documento local: "yyyy-MM-dd" (formato de modelo do sap.ui.model.odata.type.Date,
	// que as views já usam). No V2 o CBO tem Edm.DateTime, que o modelo entrega/espera como Date.
	function toYMD(oDate) {
		return oDate.toISOString().slice(0, 10);
	}

	function fromYMD(sDate) {
		const [iYear, iMonth, iDay] = sDate.split("-").map(Number);
		return new Date(Date.UTC(iYear, iMonth - 1, iDay));
	}

	function propertyOf(oEntityType, sProperty) {
		return (oEntityType.property || []).find((oProperty) => oProperty.name === sProperty);
	}

	function toDocObject(oModel, oData, oEntityType) {
		const oDoc = { SAP_UUID: oData.SAP_UUID, __path: "/" + oModel.getKey(oData) };
		for (const [sKey, vValue] of Object.entries(payload(oData))) {
			const oProperty = propertyOf(oEntityType, sKey);
			oDoc[sKey] = oProperty && oProperty.type === "Edm.DateTime" && vValue instanceof Date ? toYMD(vValue) : vValue;
		}
		return oDoc;
	}

	// Valores para gravação, pelo tipo do CBO: data "yyyy-MM-dd" -> Date (vazio = null); decimal
	// vazio -> 0 na escala (no RAP só datas aceitavam null; mantido); texto null -> "".
	function toWrite(oObject, oEntityType) {
		const oResult = {};
		for (const [sKey, vValue] of Object.entries(payload(oObject))) {
			const oProperty = propertyOf(oEntityType, sKey);
			const bEmpty = vValue === null || vValue === undefined || vValue === "";
			if (!oProperty) {
				oResult[sKey] = vValue;
			} else if (oProperty.type === "Edm.DateTime") {
				oResult[sKey] = bEmpty ? null : fromYMD(String(vValue));
			} else if (oProperty.type === "Edm.Decimal") {
				oResult[sKey] = (Number(bEmpty ? 0 : vValue) || 0).toFixed(Number(oProperty.scale) || 0);
			} else {
				oResult[sKey] = bEmpty ? "" : vValue;
			}
		}
		return oResult;
	}

	/** Lê um documento com os nós filho aNavs (ex.: ["to_Itens"]) — resolve com cópias soltas */
	async function readDocument(oModel, sKeyPath, aNavs) {
		const oMetaModel = oModel.getMetaModel();
		const oData = await read(oModel, sKeyPath, { urlParameters: { $expand: aNavs.join(",") } });
		const oDoc = toDocObject(oModel, oData, entityTypeOf(oMetaModel, sKeyPath));
		for (const sNav of aNavs) {
			const oLineType = entityTypeOf(oMetaModel, sKeyPath + "/" + sNav);
			// O CBO devolve os filhos em ordem arbitrária; LineId (quando o nó tem) guarda a ordem
			// da tela — saveDocument numera
			oDoc[sNav] = ((oData[sNav] && oData[sNav].results) || []).map((oLine) => toDocObject(oModel, oLine, oLineType))
				.sort((a, b) => Number(a.LineId || 0) - Number(b.LineId || 0));
		}
		return oDoc;
	}

	/**
	 * Grava oDoc comparando com oOriginal (o que readDocument devolveu; undefined = documento
	 * novo). Novo: um POST só, com as linhas inline (deep insert). Existente: MERGE do cabeçalho e
	 * das linhas alteradas (só os campos que mudaram), POST das linhas novas pela navegação, DELETE
	 * das removidas — tudo num $batch. Nós com LineId são numerados na ordem da tela. Rejeita com
	 * o erro do backend.
	 */
	function saveDocument(oModel, sSetPath, oDoc, oOriginal, aNavs) {
		const oMetaModel = oModel.getMetaModel();
		const oHeaderType = entityTypeOf(oMetaModel, sSetPath);
		const oLineTypes = {};
		aNavs.forEach((sNav) => {
			oLineTypes[sNav] = entityTypeOf(oMetaModel, sSetPath + "/" + sNav);
			if (propertyOf(oLineTypes[sNav], "LineId")) {
				oDoc[sNav].forEach((oLine, iIndex) => { oLine.LineId = toInteger(iIndex + 1); });
			}
		});

		const mGroup = { groupId: "changes" };
		if (!oOriginal) {
			const oCreate = toWrite(oDoc, oHeaderType);
			aNavs.forEach((sNav) => { oCreate[sNav] = oDoc[sNav].map((oLine) => toWrite(oLine, oLineTypes[sNav])); });
			oModel.create(sSetPath, oCreate, mGroup);
			return submit(oModel);
		}
		const oHeaderChanges = changedFields(oDoc, oOriginal);
		if (Object.keys(oHeaderChanges).length) {
			oModel.update(oOriginal.__path, toWrite(oHeaderChanges, oHeaderType), mGroup);
		}
		for (const sNav of aNavs) {
			const mOriginalLines = new Map(oOriginal[sNav].map((oLine) => [oLine.SAP_UUID, oLine]));
			for (const oLine of oDoc[sNav]) {
				const oOriginalLine = oLine.SAP_UUID && mOriginalLines.get(oLine.SAP_UUID);
				if (!oOriginalLine) {
					oModel.create(oOriginal.__path + "/" + sNav, toWrite(oLine, oLineTypes[sNav]), mGroup);
					continue;
				}
				mOriginalLines.delete(oLine.SAP_UUID);
				const oLineChanges = changedFields(oLine, oOriginalLine);
				if (Object.keys(oLineChanges).length) {
					oModel.update(oOriginalLine.__path, toWrite(oLineChanges, oLineTypes[sNav]), mGroup);
				}
			}
			mOriginalLines.forEach((oRemoved) => oModel.remove(oRemoved.__path, mGroup));
		}
		return submit(oModel);
	}

	/**
	 * Converte vValue para o tipo do CBO de sProperty num documento local: sEntityPath é o entity
	 * set do documento ("/YY1_ACX_IMPPCH") ou o de um nó filho ("/YY1_ACX_IMPPCH/to_Itens").
	 * Decimal vira string na escala do campo; o resto passa igual.
	 */
	function toDocValue(oModel, sEntityPath, sProperty, vValue) {
		const oProperty = propertyOf(entityTypeOf(oModel.getMetaModel(), sEntityPath), sProperty);
		if (oProperty && oProperty.type === "Edm.Decimal") {
			return (Number(vValue) || 0).toFixed(Number(oProperty.scale) || 0);
		}
		return vValue;
	}

	/** Cópia profunda de um documento (para guardar o "original" de readDocument) */
	function cloneDocument(oDoc) {
		return JSON.parse(JSON.stringify(oDoc));
	}

	return {
		ENTITIES, source, keyPath, read, toDecimal, toInteger, toEdmValue, submit, remove, reset,
		readDocument, saveDocument, cloneDocument, toDocValue, payload
	};
});
