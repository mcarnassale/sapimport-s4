@EndUserText.label : 'Moeda'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zimppch_pch2 {
  key client          : abap.clnt not null;
  key sap_uuid        : sysuuid_x16 not null;
  sap_parentuuid      : sysuuid_x16;
  lineid              : abap.int4;
  currcode            : abap.char(3);
  currname            : abap.char(20);
  rate                : abap.dec(19,4);
  createdbyuser       : abp_creation_user;
  lastchangedbyuser   : abp_lastchange_user;
  lastchangedatetime  : abp_lastchange_tstmpl;
  locallastchanged    : abp_locinst_lastchange_tstmpl;
}
