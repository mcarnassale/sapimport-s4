@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Lote/Serie'
define view entity ZR_IMPPCH_PCH6
  as select from zimppch_pch6
  association to parent ZR_IMPPCH as _Parent on $projection.SAP_ParentUUID = _Parent.SAP_UUID
{
  key sap_uuid   as SAP_UUID,
  sap_parentuuid as SAP_ParentUUID,
  lineid as LineId,
  basenum as BaseNum,
  batchnum as BatchNum,
  expdate as ExpDate,
  itemcode as ItemCode,
  prddate as PrdDate,
  quantity as Quantity,
  sl as SL,
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
