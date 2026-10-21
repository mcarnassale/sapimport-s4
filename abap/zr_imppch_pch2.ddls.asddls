@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Moeda'
define view entity ZR_IMPPCH_PCH2
  as select from zimppch_pch2
  association to parent ZR_IMPPCH as _Parent on $projection.SAP_ParentUUID = _Parent.SAP_UUID
{
  key sap_uuid   as SAP_UUID,
  sap_parentuuid as SAP_ParentUUID,
  lineid as LineId,
  currcode as CurrCode,
  currname as CurrName,
  rate as Rate,
  @Semantics.user.createdBy: true
  createdbyuser      as CreatedByUser,
  @Semantics.user.lastChangedBy: true
  lastchangedbyuser  as LastChangedByUser,
  @Semantics.systemDateTime.lastChangedAt: true
  lastchangedatetime as LastChangeDateTime,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true
  locallastchanged   as LocalLastChanged,
  _Parent
}
