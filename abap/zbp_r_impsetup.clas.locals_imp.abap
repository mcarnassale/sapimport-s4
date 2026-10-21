"! Passos cuja parte de SAVE ainda precisa rodar no save_modified desta transação
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
    READ ENTITIES OF zr_impsetup IN LOCAL MODE
      ENTITY ImpSetup ALL FIELDS WITH VALUE #( ( SetupId = gc_setup_id ) )
      RESULT DATA(lt_setup).
    ev_exists  = xsdbool( lt_setup IS NOT INITIAL ).
    DATA(lv_stored) = VALUE i( lt_setup[ 1 ]-SchemaVersion OPTIONAL ).
    ev_version = 0.
    WHILE ev_version < lv_stored AND zcl_impsetup_migrations=>is_applied( ev_version + 1 ) = abap_true.
      ev_version += 1.
    ENDWHILE.
  ENDMETHOD.

  METHOD GetStatus.
    read_version( IMPORTING ev_version = DATA(lv_current) ).
    DATA(lv_target) = zcl_impsetup_migrations=>target_version( ).
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
    DATA(lv_target) = zcl_impsetup_migrations=>target_version( ).
    DATA(lv_applied) = 0.

    " Escada: aplica cada versão pendente em ordem (mesma ideia do Inicio.cs). Parte MODIFY de cada
    " passo roda aqui (erro interrompe e volta pro app); a parte SAVE fica no buffer para o
    " save_modified. O resultado é otimista quanto ao SAVE — o app confirma com GetStatus depois.
    CLEAR lcl_buffer=>mt_save_steps.
    WHILE lv_current < lv_target.
      DATA(lv_error) = zcl_impsetup_migrations=>apply_modify( lv_current + 1 ).
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
        MODIFY ENTITIES OF zr_impsetup IN LOCAL MODE
          ENTITY ImpSetup UPDATE FIELDS ( SchemaVersion )
          WITH VALUE #( ( SetupId = gc_setup_id SchemaVersion = lv_current ) )
          FAILED DATA(ls_failed) REPORTED DATA(ls_reported).
      ELSE.
        MODIFY ENTITIES OF zr_impsetup IN LOCAL MODE
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
      IF zcl_impsetup_migrations=>apply_save( lv_step ) IS NOT INITIAL.
        EXIT.
      ENDIF.
    ENDLOOP.
    CLEAR lcl_buffer=>mt_save_steps.
  ENDMETHOD.

  METHOD cleanup_finalize.
    CLEAR lcl_buffer=>mt_save_steps.
  ENDMETHOD.
ENDCLASS.
