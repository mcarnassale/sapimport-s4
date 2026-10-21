@EndUserText.label : 'sapimport - versao de dados do backend'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zimpsetup {
  key client          : abap.clnt not null;
  key setup_id        : abap.char(20) not null;
  schema_version      : abap.int4;
  createdbyuser       : abp_creation_user;
  lastchangedbyuser   : abp_lastchange_user;
  lastchangedatetime  : abp_lastchange_tstmpl;
  locallastchanged    : abp_locinst_lastchange_tstmpl;
}
