"! <p class="shorttext synchronized">sapimport - escada de migracoes de dados</p>
"! Equivalente RAP da escada de versões do Inicio.cs / schemaMigrations.js, só para DADOS
"! (a estrutura chega pelo add-on). Executada pela ação RunSetup do BO ImpSetup.
CLASS zcl_impsetup_migrations DEFINITION PUBLIC FINAL CREATE PUBLIC.
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

CLASS zcl_impsetup_migrations IMPLEMENTATION.
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
    SELECT SINGLE @abap_true FROM zr_impicfg
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
    MODIFY ENTITIES OF zr_impicfg
      ENTITY IMPICFG
      CREATE FIELDS (
        Code Name AlterQde ByPrice CardVar Consolid CustoCOFM Debug
        DespaCNPJ DespPrev DfCtainer DIItem DispOrderComb EverKg Expenses Fast
        FreteSeg IntS4Hana INVNFRF InvNoRm IsUsage LcrPrsmd LoteFreeTextNFN MaxItemNF
        Meprev MetodoBuscaItem MetodoNac NewDocs NFDebit NFDebt NFFilha OverPC
        PesoPed Precisao ProgBar RecolheAC RMClosePO RmvDraft TaxOnly TravaRM
        UsarWhsPedido VlrsDin )
      WITH VALUE #( ( %cid = 'ICFG001'
                      Code = '001'
                      Name = 'sapimport'
                      AlterQde = 'Y'
                      ByPrice = 'N'
                      CardVar = 'N'
                      Consolid = 'N'
                      CustoCOFM = 'N'
                      Debug = 'N'
                      DespaCNPJ = 'N'
                      DespPrev = 'N'
                      DfCtainer = 'N'
                      DIItem = 'N'
                      DispOrderComb = '1'
                      EverKg = 'N'
                      Expenses = 'N'
                      Fast = 'N'
                      FreteSeg = 'N'
                      IntS4Hana = 'N'
                      INVNFRF = 'N'
                      InvNoRm = 'N'
                      IsUsage = 'N'
                      LcrPrsmd = 'N'
                      LoteFreeTextNFN = 'N'
                      MaxItemNF = '200'
                      Meprev = 'N'
                      MetodoBuscaItem = '1'
                      MetodoNac = '1'
                      NewDocs = 'N'
                      NFDebit = 'N'
                      NFDebt = 'N'
                      NFFilha = 'N'
                      OverPC = 'Y'
                      PesoPed = 'N'
                      Precisao = '0.01'
                      ProgBar = 'Y'
                      RecolheAC = 'N'
                      RMClosePO = 'N'
                      RmvDraft = 'N'
                      TaxOnly = 'N'
                      TravaRM = 'N'
                      UsarWhsPedido = 'N'
                      VlrsDin = 'N' ) )
      FAILED DATA(ls_failed)
      REPORTED DATA(ls_reported).
    IF ls_failed IS NOT INITIAL.
      rv_error = 'Falha ao criar a configuração inicial (IMPICFG 001).'.
      LOOP AT ls_reported-impicfg INTO DATA(ls_msg) WHERE %msg IS BOUND.
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
        cl_numberrange_intervals=>read( EXPORTING nr_range_nr1 = '01'
                                                  object       = 'ZIMPPCH'
                                        IMPORTING interval     = DATA(lt_existing) ).
        rv_exists = xsdbool( lt_existing IS NOT INITIAL ).
      CATCH cx_number_ranges.
        " READ sinaliza intervalo (ou objeto) inexistente com exceção
        rv_exists = abap_false.
    ENDTRY.
  ENDMETHOD.

  METHOD create_docentry_interval.
    " Intervalo do NROB ZIMPPCH (DocEntry do IMPPCH, ver determination SetDocEntry).
    " Intervalo é dado de configuração, não vem no add-on. Até 2147483647: o DocEntry é Int32.
    " Idempotente: se já existe (ex.: criado à mão), não mexe.
    IF docentry_interval_exists( ) = abap_true.
      RETURN.
    ENDIF.

    TRY.
        cl_numberrange_intervals=>create(
          EXPORTING interval = VALUE #( ( nrrangenr  = '01'
                                          fromnumber = '0000000001'
                                          tonumber   = '2147483647'
                                          procind    = 'I' ) )
                    object   = 'ZIMPPCH'
          IMPORTING error    = DATA(lv_error) ).
        IF lv_error = abap_true.
          rv_error = |Falha ao criar o intervalo 01 do objeto de numeração ZIMPPCH.|.
        ENDIF.
      CATCH cx_number_ranges INTO DATA(lx_nr).
        rv_error = lx_nr->get_text( ).
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
