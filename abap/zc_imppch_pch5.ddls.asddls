@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Previsao'
define view entity ZC_IMPPCH_PCH5
  as projection on ZR_IMPPCH_PCH5
{
  key SAP_UUID,
  SAP_ParentUUID,
  LineId,
  CardCode,
  CardName,
  CreateNF,
  Currency,
  DesBase,
  DespCode,
  DespName,
  ItemCode,
  ItemName,
  PerDesp,
  QdeDias,
  TpCalc,
  VrDesp,
  VrMax,
  VrMim,
  VrPrevisa,
  CreatedByUser,
  LastChangedByUser,
  LastChangeDateTime,
  LocalLastChanged,
  _Parent : redirected to parent ZC_IMPPCH
}
