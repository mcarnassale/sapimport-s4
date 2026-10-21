@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Despesas do pre-calculo'
define view entity ZR_IMPIPRV_PRV1
  as select from zimpiprv_prv1
  association to parent ZR_IMPIPRV as _Parent on $projection.SAP_ParentUUID = _Parent.SAP_UUID
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
