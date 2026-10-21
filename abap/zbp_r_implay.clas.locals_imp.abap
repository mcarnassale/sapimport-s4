CLASS lhc_implay DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_global_authorizations FOR GLOBAL AUTHORIZATION
      IMPORTING REQUEST requested_authorizations FOR implay RESULT result.
ENDCLASS.

CLASS lhc_implay IMPLEMENTATION.
  METHOD get_global_authorizations.
    " TODO: trocar por AUTHORITY-CHECK num objeto de autorização próprio (IAM app/catálogo)
    " quando o produto tiver o modelo de autorização definido. Por ora, tudo liberado.
    result = VALUE #( %create = if_abap_behv=>auth-allowed
                      %update = if_abap_behv=>auth-allowed
                      %delete = if_abap_behv=>auth-allowed ).
  ENDMETHOD.
ENDCLASS.
