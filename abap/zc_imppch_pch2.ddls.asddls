@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Moeda'
define view entity ZC_IMPPCH_PCH2
  as projection on ZR_IMPPCH_PCH2
{
  key SAP_UUID,
  SAP_ParentUUID,
  LineId,
  CurrCode,
  CurrName,
  Rate,
  CreatedByUser,
  LastChangedByUser,
  LastChangeDateTime,
  LocalLastChanged,
  _Parent : redirected to parent ZC_IMPPCH
}
