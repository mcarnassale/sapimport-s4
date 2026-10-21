CLASS lhc_imppch DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR imppch RESULT result.
    METHODS set_doc_entry FOR DETERMINE ON MODIFY
      IMPORTING keys FOR IMPPCH~SetDocEntry.
    METHODS check_doc_entry FOR VALIDATE ON SAVE
      IMPORTING keys FOR IMPPCH~CheckDocEntry.
ENDCLASS.

CLASS lhc_imppch IMPLEMENTATION.
  METHOD set_doc_entry.
    " Equivalente ao DocEntry auto-numerado do UDO no B1. Número tirado do NROB na criação
    " (interaction phase, como o early numbering dos exemplos /DMO/ da SAP). Com buffer em
    " memória o número sai ao criar, não ao gravar: um Processo descartado deixa lacuna.
    READ ENTITIES OF zr_imppch IN LOCAL MODE
      ENTITY IMPPCH FIELDS ( DocEntry ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_proc).
    DELETE lt_proc WHERE DocEntry IS NOT INITIAL.
    CHECK lt_proc IS NOT INITIAL.

    DATA lt_update TYPE TABLE FOR UPDATE zr_imppch.
    LOOP AT lt_proc INTO DATA(ls_proc).
      TRY.
          cl_numberrange_runtime=>number_get(
            EXPORTING nr_range_nr = '01'
                      object      = 'ZIMPPCH'
            IMPORTING number      = DATA(lv_number) ).
        CATCH cx_number_ranges INTO DATA(lx_nr).
          " Intervalo inexistente = ImpSetup v2 não rodou (o app roda RunSetup no startup)
          APPEND VALUE #( %tky = ls_proc-%tky
                          %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                        text     = lx_nr->get_text( ) ) ) TO reported-imppch.
          CONTINUE.
      ENDTRY.
      APPEND VALUE #( %tky = ls_proc-%tky DocEntry = CONV i( lv_number ) %control-DocEntry = if_abap_behv=>mk-on ) TO lt_update.
    ENDLOOP.

    MODIFY ENTITIES OF zr_imppch IN LOCAL MODE
      ENTITY IMPPCH UPDATE FROM lt_update.
  ENDMETHOD.

  METHOD check_doc_entry.
    " Rede de segurança do set_doc_entry: sem número (ex.: intervalo não criado), não grava.
    READ ENTITIES OF zr_imppch IN LOCAL MODE
      ENTITY IMPPCH FIELDS ( DocEntry ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_proc).
    LOOP AT lt_proc INTO DATA(ls_proc) WHERE DocEntry IS INITIAL.
      APPEND VALUE #( %tky = ls_proc-%tky ) TO failed-imppch.
      APPEND VALUE #( %tky = ls_proc-%tky
                      %msg = new_message_with_text( severity = if_abap_behv_message=>severity-error
                                                    " new_message_with_text corta em 50 caracteres
                                                    text     = 'Sem numeração p/ o Processo: rode o setup' ) ) TO reported-imppch.
    ENDLOOP.
  ENDMETHOD.

  METHOD get_global_authorizations.
    " TODO: trocar por AUTHORITY-CHECK num objeto de autorização próprio (IAM app/catálogo)
    " quando o produto tiver o modelo de autorização definido. Por ora, tudo liberado.
    result = VALUE #( %create = if_abap_behv=>auth-allowed
                      %update = if_abap_behv=>auth-allowed
                      %delete = if_abap_behv=>auth-allowed ).
  ENDMETHOD.
ENDCLASS.
