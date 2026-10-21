@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Layout de importacao'
define root view entity ZC_IMPLAY
  provider contract transactional_query
  as projection on ZR_IMPLAY
{
  key SAP_UUID,
  Code,
  Name,
  BatchExplode,
  BatchNum,
  Container,
  IsDefault,
  DocEntry,
  DocNum,
  ExpDate,
  FilePath,
  FileType,
  FirstLine,
  Frete,
  Invoice,
  ItemCode,
  LayoutType,
  LineNum,
  LineTotal,
  LineVisi,
  Model,
  OrderNum,
  OrderItem,
  PartNumber,
  PrdDate,
  Price,
  Quantity,
  Seguro,
  Serie,
  SetPeso,
  SetPrice,
  Wheight,
  WheightU,
  CreatedByUser,
  LastChangedByUser,
  LastChangeDateTime,
  LocalLastChanged
}
