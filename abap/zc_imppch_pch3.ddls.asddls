@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Despacho'
define view entity ZC_IMPPCH_PCH3
  as projection on ZR_IMPPCH_PCH3
{
  key SAP_UUID,
  SAP_ParentUUID,
  LineId,
  DespaCode,
  DespaName,
  DespaNum,
  CreatedByUser,
  LastChangedByUser,
  LastChangeDateTime,
  LocalLastChanged,
  _Parent : redirected to parent ZC_IMPPCH
}
