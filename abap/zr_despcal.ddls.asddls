@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Despesa de calculo'
define root view entity ZR_DESPCAL
  as select from zdespcal
{
  key sap_uuid as SAP_UUID,
  code as Code,
  currency as Currency,
  name as Name,
  valor as Valor,
  @Semantics.user.createdBy: true
  createdbyuser      as CreatedByUser,
  @Semantics.user.lastChangedBy: true
  lastchangedbyuser  as LastChangedByUser,
  @Semantics.systemDateTime.lastChangedAt: true
  lastchangedatetime as LastChangeDateTime,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true
  locallastchanged   as LocalLastChanged
}
