@EndUserText.label : 'Lote/Serie'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zimppch_pch6 {
  key client          : abap.clnt not null;
  key sap_uuid        : sysuuid_x16 not null;
  sap_parentuuid      : sysuuid_x16;
  lineid              : abap.int4;
  basenum             : abap.int4;
  batchnum            : abap.char(36);
  expdate             : abap.dats;
  itemcode            : abap.char(40);
  prddate             : abap.dats;
  quantity            : abap.dec(19,4);
  sl                  : abap.char(1);
  createdbyuser       : abp_creation_user;
  lastchangedbyuser   : abp_lastchange_user;
  lastchangedatetime  : abp_lastchange_tstmpl;
  locallastchanged    : abp_locinst_lastchange_tstmpl;
}
