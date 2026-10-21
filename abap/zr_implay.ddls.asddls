@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Layout de importacao'
define root view entity ZR_IMPLAY
  as select from zimplay
{
  key sap_uuid as SAP_UUID,
  code as Code,
  name as Name,
  batchexplode as BatchExplode,
  batchnum as BatchNum,
  container as Container,
  isdefault as IsDefault,
  docentry as DocEntry,
  docnum as DocNum,
  expdate as ExpDate,
  filepath as FilePath,
  filetype as FileType,
  firstline as FirstLine,
  frete as Frete,
  invoice as Invoice,
  itemcode as ItemCode,
  layouttype as LayoutType,
  linenum as LineNum,
  linetotal as LineTotal,
  linevisi as LineVisi,
  model as Model,
  ordernum as OrderNum,
  orderitem as OrderItem,
  partnumber as PartNumber,
  prddate as PrdDate,
  price as Price,
  quantity as Quantity,
  seguro as Seguro,
  serie as Serie,
  setpeso as SetPeso,
  setprice as SetPrice,
  wheight as Wheight,
  wheightu as WheightU,
  @Semantics.user.createdBy: true
  createdbyuser      as CreatedByUser,
  @Semantics.user.lastChangedBy: true
  lastchangedbyuser  as LastChangedByUser,
  @Semantics.systemDateTime.lastChangedAt: true
  lastchangedatetime as LastChangeDateTime,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true
  locallastchanged   as LocalLastChanged
}
