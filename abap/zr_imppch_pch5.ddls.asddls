@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Previsao'
define view entity ZR_IMPPCH_PCH5
  as select from zimppch_pch5
  association to parent ZR_IMPPCH as _Parent on $projection.SAP_ParentUUID = _Parent.SAP_UUID
{
  key sap_uuid   as SAP_UUID,
  sap_parentuuid as SAP_ParentUUID,
  lineid as LineId,
  cardcode as CardCode,
  cardname as CardName,
  createnf as CreateNF,
  currency as Currency,
  desbase as DesBase,
  despcode as DespCode,
  despname as DespName,
  itemcode as ItemCode,
  itemname as ItemName,
  perdesp as PerDesp,
  qdedias as QdeDias,
  tpcalc as TpCalc,
  vrdesp as VrDesp,
  vrmax as VrMax,
  vrmim as VrMim,
  vrprevisa as VrPrevisa,
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
