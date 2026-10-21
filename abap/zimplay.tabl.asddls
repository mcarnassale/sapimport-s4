@EndUserText.label : 'Layout de importacao'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zimplay {
  key client          : abap.clnt not null;
  key sap_uuid        : sysuuid_x16 not null;
  code                : abap.char(50);
  name                : abap.char(100);
  batchexplode        : abap.char(1);
  batchnum            : abap.int4;
  container           : abap.int4;
  isdefault           : abap.char(1);
  docentry            : abap.int4;
  docnum              : abap.int4;
  expdate             : abap.int4;
  filepath            : abap.char(200);
  filetype            : abap.int4;
  firstline           : abap.char(1);
  frete               : abap.int4;
  invoice             : abap.int4;
  itemcode            : abap.int4;
  layouttype          : abap.char(50);
  linenum             : abap.int4;
  linetotal           : abap.int4;
  linevisi            : abap.int4;
  model               : abap.int4;
  ordernum            : abap.int4;
  orderitem           : abap.int4;
  partnumber          : abap.int4;
  prddate             : abap.int4;
  price               : abap.int4;
  quantity            : abap.int4;
  seguro              : abap.int4;
  serie               : abap.int4;
  setpeso             : abap.char(1);
  setprice            : abap.char(1);
  wheight             : abap.int4;
  wheightu            : abap.int4;
  createdbyuser       : abp_creation_user;
  lastchangedbyuser   : abp_lastchange_user;
  lastchangedatetime  : abp_lastchange_tstmpl;
  locallastchanged    : abp_locinst_lastchange_tstmpl;
}
