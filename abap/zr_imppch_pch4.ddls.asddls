@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Demurrage'
define view entity ZR_IMPPCH_PCH4
  as select from zimppch_pch4
  association to parent ZR_IMPPCH as _Parent on $projection.SAP_ParentUUID = _Parent.SAP_UUID
{
  key sap_uuid   as SAP_UUID,
  sap_parentuuid as SAP_ParentUUID,
  lineid as LineId,
  agnavega as AgNavega,
  bloqsel as BloqSel,
  contnum as ContNum,
  daydemur as DayDemur,
  despacode as DespaCode,
  dtcontdev as DtContDev,
  dtpgdemur as DtPgDemur,
  freetime as FreeTime,
  navio as Navio,
  totdemur as TotDemur,
  vlrdemur as VlrDemur,
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
