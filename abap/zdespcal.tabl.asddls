@EndUserText.label : 'Despesa de calculo'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zdespcal {
  key client          : abap.clnt not null;
  key sap_uuid        : sysuuid_x16 not null;
  code                : abap.char(50);
  currency            : abap.char(10);
  name                : abap.char(30);
  valor               : abap.dec(19,4);
  createdbyuser       : abp_creation_user;
  lastchangedbyuser   : abp_lastchange_user;
  lastchangedatetime  : abp_lastchange_tstmpl;
  locallastchanged    : abp_locinst_lastchange_tstmpl;
}
