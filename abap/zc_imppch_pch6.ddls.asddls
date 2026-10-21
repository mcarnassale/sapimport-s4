@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Lote/Serie'
define view entity ZC_IMPPCH_PCH6
  as projection on ZR_IMPPCH_PCH6
{
  key SAP_UUID,
  SAP_ParentUUID,
  LineId,
  BaseNum,
  BatchNum,
  ExpDate,
  ItemCode,
  PrdDate,
  Quantity,
  SL,
  CreatedByUser,
  LastChangedByUser,
  LastChangeDateTime,
  LocalLastChanged,
  _Parent : redirected to parent ZC_IMPPCH
}
