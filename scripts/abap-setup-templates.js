/**
 * Fontes ABAP do BO de setup/versão do backend (ImpSetup) — o equivalente RAP da escada de
 * versões do Inicio.cs (B1). Só DADOS: a estrutura chega pelo add-on; este BO registra qual
 * versão de dados foi aplicada e roda os passos pendentes via ação RunSetup.
 *
 * Escritos à mão (não derivam do metadata.xml); usados por generate-abap.js com o mesmo prefixo.
 * Para adicionar uma migração: novo WHEN em apply_modify (dados via EML) e/ou apply_save (APIs
 * classificadas como SAVE, ex.: intervalos de numeração — aí também em is_applied, com uma
 * verificação real) + incrementar target_version.
 */
// Fonte ABAP: no máximo 255 caracteres por linha — listas longas vão em blocos
function chunk(aItems, iSize) {
	const aOut = [];
	for (let i = 0; i < aItems.length; i += iSize) {
		aOut.push(aItems.slice(i, i + iSize));
	}
	return aOut;
}

module.exports = function setupSources(P, oNumbering) {
	const p = P.toLowerCase();
	const T = `${p}impsetup`;
	const R = `${P}R_IMPSETUP`;
	const C = `${P}C_IMPSETUP`;
	const D = `${P}D_IMPSETUP_STATUS`;
	const POOL = `${p}bp_r_impsetup`;
	const MIG = `${p}cl_impsetup_migrations`;

	const table = `@EndUserText.label : 'sapimport - versao de dados do backend'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table ${T} {
  key client          : abap.clnt not null;
  key setup_id        : abap.char(20) not null;
  schema_version      : abap.int4;
  createdbyuser       : abp_creation_user;
  lastchangedbyuser   : abp_lastchange_user;
  lastchangedatetime  : abp_lastchange_tstmpl;
  locallastchanged    : abp_locinst_lastchange_tstmpl;
}
`;

	const rView = `@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'sapimport - versao de dados do backend'
define root view entity ${R}
  as select from ${T}
{
  key setup_id       as SetupId,
  schema_version     as SchemaVersion,
  @Semantics.user.createdBy: true
  createdbyuser      as CreatedByUser,
  @Semantics.user.lastChangedBy: true
  lastchangedbyuser  as LastChangedByUser,
  @Semantics.systemDateTime.lastChangedAt: true
  lastchangedatetime as LastChangeDateTime,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true
  locallastchanged   as LocalLastChanged
}
`;

	const cView = `@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'sapimport - versao de dados do backend'
define root view entity ${C}
  provider contract transactional_query
  as projection on ${R}
{
  key SetupId,
  SchemaVersion,
  CreatedByUser,
  LastChangedByUser,
  LastChangeDateTime,
  LocalLastChanged
}
`;

	const status = `@EndUserText.label: 'sapimport - status do setup'
define abstract entity ${D}
{
  CurrentVersion : abap.int4;
  TargetVersion  : abap.int4;
  AppliedSteps   : abap.int4;
}
`;

	// Sem create/update externos: só o próprio RunSetup grava (internal + IN LOCAL MODE).
	const bdefR = `managed implementation in class ${POOL} unique;
strict ( 2 );

define behavior for ${R} alias ImpSetup
persistent table ${T}
// Passos de configuração (ex.: intervalo de numeração) gravam documento de modificação, rotina
// classificada como SAVE: só podem rodar no save_modified, não na ação (fase MODIFY).
with additional save
lock master
authorization master ( global )
etag master LocalLastChanged
{
  internal create;
  internal update;
  field ( readonly : update ) SetupId;
  field ( readonly ) CreatedByUser, LastChangedByUser, LastChangeDateTime, LocalLastChanged;
  // GetStatus só lê a versão: precisa funcionar para qualquer usuário que abra o app
  static function ( authorization : none ) GetStatus result [1] ${D};
  static action RunSetup result [1] ${D};
  mapping for ${T} corresponding
  {
    SetupId = setup_id;
    SchemaVersion = schema_version;
  }
}
`;

	const bdefC = `projection;
strict ( 2 );

define behavior for ${C} alias ImpSetup
{
  use function GetStatus;
  use action RunSetup;
}
`;

	const poolMain = `CLASS ${POOL} DEFINITION PUBLIC ABSTRACT FINAL FOR BEHAVIOR OF ${R.toLowerCase()}.
ENDCLASS.

CLASS ${POOL} IMPLEMENTATION.
ENDCLASS.
`;

	const poolLocals = `"! Passos cuja parte de SAVE ainda precisa rodar no save_modified desta transação
CLASS lcl_buffer DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-DATA mt_save_steps TYPE STANDARD TABLE OF i WITH EMPTY KEY.
ENDCLASS.

CLASS lcl_buffer IMPLEMENTATION.
ENDCLASS.

CLASS lhc_impsetup DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    CONSTANTS gc_setup_id TYPE c LENGTH 20 VALUE 'SAPIMPORT'.

    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR ImpSetup RESULT result.
    METHODS GetStatus FOR READ
      IMPORTING keys FOR FUNCTION ImpSetup~GetStatus RESULT result.
    METHODS RunSetup FOR MODIFY
      IMPORTING keys FOR ACTION ImpSetup~RunSetup RESULT result.
    METHODS read_version
      EXPORTING ev_exists  TYPE abap_bool
                ev_version TYPE i.
ENDCLASS.

CLASS lhc_impsetup IMPLEMENTATION.
  METHOD get_global_authorizations.
    " TODO: RunSetup deveria exigir um papel de administrador (objeto de autorização próprio).
    " Por ora liberado: o app chama no startup com o usuário que abriu a tela.
    result = VALUE #( %action-RunSetup = if_abap_behv=>auth-allowed ).
  ENDMETHOD.

  METHOD read_version.
    " Versão EFETIVA: a gravada, rebaixada até o primeiro passo cuja verificação falhe. A parte de
    " SAVE de um passo (save_modified) não tem como reportar erro nem desfazer a versão já gravada;
    " assim, se ela falhou, o passo volta a constar como pendente e o próximo RunSetup o refaz.
    READ ENTITIES OF ${R.toLowerCase()} IN LOCAL MODE
      ENTITY ImpSetup ALL FIELDS WITH VALUE #( ( SetupId = gc_setup_id ) )
      RESULT DATA(lt_setup).
    ev_exists  = xsdbool( lt_setup IS NOT INITIAL ).
    DATA(lv_stored) = VALUE i( lt_setup[ 1 ]-SchemaVersion OPTIONAL ).
    ev_version = 0.
    WHILE ev_version < lv_stored AND ${MIG}=>is_applied( ev_version + 1 ) = abap_true.
      ev_version += 1.
    ENDWHILE.
  ENDMETHOD.

  METHOD GetStatus.
    read_version( IMPORTING ev_version = DATA(lv_current) ).
    DATA(lv_target) = ${MIG}=>target_version( ).
    LOOP AT keys INTO DATA(ls_key).
      APPEND VALUE #( %cid   = ls_key-%cid
                      %param = VALUE #( CurrentVersion = lv_current
                                        TargetVersion  = lv_target
                                        AppliedSteps   = 0 ) ) TO result.
    ENDLOOP.
  ENDMETHOD.

  METHOD RunSetup.
    read_version( IMPORTING ev_exists  = DATA(lv_exists)
                            ev_version = DATA(lv_current) ).
    DATA(lv_target) = ${MIG}=>target_version( ).
    DATA(lv_applied) = 0.

    " Escada: aplica cada versão pendente em ordem (mesma ideia do Inicio.cs). Parte MODIFY de cada
    " passo roda aqui (erro interrompe e volta pro app); a parte SAVE fica no buffer para o
    " save_modified. O resultado é otimista quanto ao SAVE — o app confirma com GetStatus depois.
    CLEAR lcl_buffer=>mt_save_steps.
    WHILE lv_current < lv_target.
      DATA(lv_error) = ${MIG}=>apply_modify( lv_current + 1 ).
      IF lv_error IS NOT INITIAL.
        APPEND VALUE #( %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                      text     = |Setup v{ lv_current + 1 }: { lv_error }| ) )
          TO reported-impsetup.
        EXIT.
      ENDIF.
      lv_current += 1.
      lv_applied += 1.
      APPEND lv_current TO lcl_buffer=>mt_save_steps.
    ENDWHILE.

    " Grava a versão mesmo quando ela não muda: garante a linha no buffer transacional (e, com
    " isso, o save sequence deste BO — onde roda o save_modified com os passos de SAVE).
    IF lv_applied > 0 OR lv_exists = abap_true.
      IF lv_exists = abap_true.
        MODIFY ENTITIES OF ${R.toLowerCase()} IN LOCAL MODE
          ENTITY ImpSetup UPDATE FIELDS ( SchemaVersion )
          WITH VALUE #( ( SetupId = gc_setup_id SchemaVersion = lv_current ) )
          FAILED DATA(ls_failed) REPORTED DATA(ls_reported).
      ELSE.
        MODIFY ENTITIES OF ${R.toLowerCase()} IN LOCAL MODE
          ENTITY ImpSetup CREATE FIELDS ( SetupId SchemaVersion )
          WITH VALUE #( ( %cid = 'SETUP' SetupId = gc_setup_id SchemaVersion = lv_current ) )
          FAILED ls_failed REPORTED ls_reported.
      ENDIF.
      failed   = CORRESPONDING #( DEEP ls_failed ).
      reported = CORRESPONDING #( DEEP ls_reported ).
    ENDIF.

    LOOP AT keys INTO DATA(ls_key).
      APPEND VALUE #( %cid   = ls_key-%cid
                      %param = VALUE #( CurrentVersion = lv_current
                                        TargetVersion  = lv_target
                                        AppliedSteps   = lv_applied ) ) TO result.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.

CLASS lsc_impsetup DEFINITION INHERITING FROM cl_abap_behavior_saver.
  PROTECTED SECTION.
    METHODS save_modified REDEFINITION.
    METHODS cleanup_finalize REDEFINITION.
ENDCLASS.

CLASS lsc_impsetup IMPLEMENTATION.
  METHOD save_modified.
    " Fase SAVE: aqui sim pode gravar configuração com documento de modificação. Sem como reportar
    " erro nesta fase: um passo que falhe só para a escada; read_version detecta e o deixa pendente.
    LOOP AT lcl_buffer=>mt_save_steps INTO DATA(lv_step).
      IF ${MIG}=>apply_save( lv_step ) IS NOT INITIAL.
        EXIT.
      ENDIF.
    ENDLOOP.
    CLEAR lcl_buffer=>mt_save_steps.
  ENDMETHOD.

  METHOD cleanup_finalize.
    CLEAR lcl_buffer=>mt_save_steps.
  ENDMETHOD.
ENDCLASS.
`;

	const migrations = `"! <p class="shorttext synchronized">sapimport - escada de migracoes de dados</p>
"! Equivalente RAP da escada de versões do Inicio.cs / schemaMigrations.js, só para DADOS
"! (a estrutura chega pelo add-on). Executada pela ação RunSetup do BO ImpSetup.
CLASS ${MIG} DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    "! Versão de dados que este backend sabe atingir. Ao criar um WHEN novo em APPLY, incremente.
    CLASS-METHODS target_version RETURNING VALUE(rv_version) TYPE i.
    "! Parte MODIFY de um passo: roda na ação RunSetup (interaction phase). Dados de outros BOs só
    "! via EML (MODIFY ENTITIES), nunca UPDATE/INSERT direto. Erro (texto) para a escada e volta pro app.
    CLASS-METHODS apply_modify IMPORTING iv_version      TYPE i
                               RETURNING VALUE(rv_error) TYPE string.
    "! Parte SAVE de um passo: roda no save_modified (fase SAVE). Para configuração cujas APIs são
    "! classificadas como SAVE (ex.: intervalos de numeração gravam documento de modificação).
    "! Sem EML aqui. Erro não chega ao app: IS_APPLIED precisa conseguir detectar o passo incompleto.
    CLASS-METHODS apply_save IMPORTING iv_version      TYPE i
                             RETURNING VALUE(rv_error) TYPE string.
    "! O passo está de fato aplicado? Só leitura. Passos com parte SAVE precisam de uma verificação
    "! real; os demais podem confiar na versão gravada (abap_true), mas verificar é sempre melhor:
    "! dado apagado à mão volta a ser recriado pelo próximo RunSetup.
    CLASS-METHODS is_applied IMPORTING iv_version        TYPE i
                             RETURNING VALUE(rv_applied) TYPE abap_bool.
  PRIVATE SECTION.
    CLASS-METHODS icfg_row_exists RETURNING VALUE(rv_exists) TYPE abap_bool.
    CLASS-METHODS create_icfg_row RETURNING VALUE(rv_error) TYPE string.
    CLASS-METHODS docentry_interval_exists RETURNING VALUE(rv_exists) TYPE abap_bool.
    CLASS-METHODS create_docentry_interval RETURNING VALUE(rv_error) TYPE string.
ENDCLASS.

CLASS ${MIG} IMPLEMENTATION.
  METHOD target_version.
    rv_version = 3.
  ENDMETHOD.

  METHOD apply_modify.
    CASE iv_version.
      WHEN 1.
        " Baseline da instalação: nada a migrar.
      WHEN 2.
        " Só parte SAVE (intervalo de numeração)
      WHEN 3.
        rv_error = create_icfg_row( ).
    ENDCASE.
  ENDMETHOD.

  METHOD icfg_row_exists.
    SELECT SINGLE @abap_true FROM ${oNumbering.icfg.rView.toLowerCase()}
      WHERE Code = '001'
      INTO @rv_exists.
  ENDMETHOD.

  METHOD create_icfg_row.
    " Linha única de configuração (Code='001'), equivalente ao Functions.SetVersion do B1 + os
    " DefaultValue dos UDFs do [@ICFG] + os SetConfig da escada do Inicio.cs (gerado a partir do
    " schema-model.json por generate-abap.js). Idempotente: se já existe, não mexe.
    IF icfg_row_exists( ) = abap_true.
      RETURN.
    ENDIF.
    MODIFY ENTITIES OF ${oNumbering.icfg.rView.toLowerCase()}
      ENTITY ${oNumbering.icfg.alias}
      CREATE FIELDS (
${chunk(oNumbering.icfg.values.map((v) => v.name), 8).map((a) => `        ${a.join(" ")}`).join("\n")} )
      WITH VALUE #( ( %cid = 'ICFG001'
${oNumbering.icfg.values.map((v) => `                      ${v.name} = ${v.abap}`).join("\n")} ) )
      FAILED DATA(ls_failed)
      REPORTED DATA(ls_reported).
    IF ls_failed IS NOT INITIAL.
      rv_error = 'Falha ao criar a configuração inicial (IMPICFG 001).'.
      LOOP AT ls_reported-${oNumbering.icfg.alias.toLowerCase()} INTO DATA(ls_msg) WHERE %msg IS BOUND.
        rv_error = ls_msg-%msg->if_message~get_text( ).
        EXIT.
      ENDLOOP.
    ENDIF.
  ENDMETHOD.

  METHOD apply_save.
    CASE iv_version.
      WHEN 2.
        rv_error = create_docentry_interval( ).
    ENDCASE.
  ENDMETHOD.

  METHOD is_applied.
    CASE iv_version.
      WHEN 2.
        rv_applied = docentry_interval_exists( ).
      WHEN 3.
        rv_applied = icfg_row_exists( ).
      WHEN OTHERS.
        rv_applied = abap_true.
    ENDCASE.
  ENDMETHOD.

  METHOD docentry_interval_exists.
    TRY.
        cl_numberrange_intervals=>read( EXPORTING nr_range_nr1 = '${oNumbering.nrInterval}'
                                                  object       = '${oNumbering.nrObject}'
                                        IMPORTING interval     = DATA(lt_existing) ).
        rv_exists = xsdbool( lt_existing IS NOT INITIAL ).
      CATCH cx_number_ranges.
        " READ sinaliza intervalo (ou objeto) inexistente com exceção
        rv_exists = abap_false.
    ENDTRY.
  ENDMETHOD.

  METHOD create_docentry_interval.
    " Intervalo do NROB ${oNumbering.nrObject} (DocEntry do IMPPCH, ver determination SetDocEntry).
    " Intervalo é dado de configuração, não vem no add-on. Até 2147483647: o DocEntry é Int32.
    " Idempotente: se já existe (ex.: criado à mão), não mexe.
    IF docentry_interval_exists( ) = abap_true.
      RETURN.
    ENDIF.

    TRY.
        cl_numberrange_intervals=>create(
          EXPORTING interval = VALUE #( ( nrrangenr  = '${oNumbering.nrInterval}'
                                          fromnumber = '0000000001'
                                          tonumber   = '2147483647'
                                          procind    = 'I' ) )
                    object   = '${oNumbering.nrObject}'
          IMPORTING error    = DATA(lv_error) ).
        IF lv_error = abap_true.
          rv_error = |Falha ao criar o intervalo ${oNumbering.nrInterval} do objeto de numeração ${oNumbering.nrObject}.|.
        ENDIF.
      CATCH cx_number_ranges INTO DATA(lx_nr).
        rv_error = lx_nr->get_text( ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
`;

	return {
		files: {
			[`${T}.tabl.asddls`]: table,
			[`${R.toLowerCase()}.ddls.asddls`]: rView,
			[`${C.toLowerCase()}.ddls.asddls`]: cView,
			[`${D.toLowerCase()}.ddls.asddls`]: status,
			[`${R.toLowerCase()}.bdef.asbdef`]: bdefR,
			[`${C.toLowerCase()}.bdef.asbdef`]: bdefC,
			[`${POOL}.clas.abap`]: poolMain,
			[`${POOL}.clas.locals_imp.abap`]: poolLocals,
			[`${MIG}.clas.abap`]: migrations
		},
		expose: `  expose ${C} as ImpSetup;`
	};
};
