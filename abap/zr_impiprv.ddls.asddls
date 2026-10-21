@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Pre-calculo de despesas'
define root view entity ZR_IMPIPRV
  as select from zimpiprv
  composition [0..*] of ZR_IMPIPRV_PRV1 as Itens
{
  key sap_uuid as SAP_UUID,
  code as Code,
  name as Name,
  metorate as MetoRate,
  viatransp as ViaTransp,
  @Semantics.user.createdBy: true
  createdbyuser      as CreatedByUser,
  @Semantics.user.lastChangedBy: true
  lastchangedbyuser  as LastChangedByUser,
  @Semantics.systemDateTime.lastChangedAt: true
  lastchangedatetime as LastChangeDateTime,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true
  locallastchanged   as LocalLastChanged,
  Itens
}
