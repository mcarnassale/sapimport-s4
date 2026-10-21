@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Demurrage'
define view entity ZC_IMPPCH_PCH4
  as projection on ZR_IMPPCH_PCH4
{
  key SAP_UUID,
  SAP_ParentUUID,
  LineId,
  AgNavega,
  BloqSel,
  ContNum,
  DayDemur,
  DespaCode,
  DtContDev,
  DtPgDemur,
  FreeTime,
  Navio,
  TotDemur,
  VlrDemur,
  CreatedByUser,
  LastChangedByUser,
  LastChangeDateTime,
  LocalLastChanged,
  _Parent : redirected to parent ZC_IMPPCH
}
