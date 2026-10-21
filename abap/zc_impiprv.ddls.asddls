@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Pre-calculo de despesas'
define root view entity ZC_IMPIPRV
  provider contract transactional_query
  as projection on ZR_IMPIPRV
{
  key SAP_UUID,
  Code,
  Name,
  MetoRate,
  ViaTransp,
  CreatedByUser,
  LastChangedByUser,
  LastChangeDateTime,
  LocalLastChanged,
  Itens : redirected to composition child ZC_IMPIPRV_PRV1
}
