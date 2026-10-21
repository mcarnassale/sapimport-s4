@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Despesas do pre-calculo'
define view entity ZC_IMPIPRV_PRV1
  as projection on ZR_IMPIPRV_PRV1
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
  CreatedByUser,
  LastChangedByUser,
  LastChangeDateTime,
  LocalLastChanged,
  _Parent : redirected to parent ZC_IMPIPRV
}
