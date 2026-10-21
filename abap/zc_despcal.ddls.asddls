@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Despesa de calculo'
define root view entity ZC_DESPCAL
  provider contract transactional_query
  as projection on ZR_DESPCAL
{
  key SAP_UUID,
  Code,
  Currency,
  Name,
  Valor,
  CreatedByUser,
  LastChangedByUser,
  LastChangeDateTime,
  LocalLastChanged
}
