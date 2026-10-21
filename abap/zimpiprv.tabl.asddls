@EndUserText.label : 'Pre-calculo de despesas'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zimpiprv {
  key client          : abap.clnt not null;
  key sap_uuid        : sysuuid_x16 not null;
  code                : abap.char(50);
  name                : abap.char(100);
  metorate            : abap.char(20);
  viatransp           : abap.char(2);
  createdbyuser       : abp_creation_user;
  lastchangedbyuser   : abp_lastchange_user;
  lastchangedatetime  : abp_lastchange_tstmpl;
  locallastchanged    : abp_locinst_lastchange_tstmpl;
}
