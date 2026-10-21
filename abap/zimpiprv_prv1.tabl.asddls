@EndUserText.label : 'Despesas do pre-calculo'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zimpiprv_prv1 {
  key client          : abap.clnt not null;
  key sap_uuid        : sysuuid_x16 not null;
  sap_parentuuid      : sysuuid_x16;
  lineid              : abap.int4;
  cardcode            : abap.char(15);
  cardname            : abap.char(100);
  createnf            : abap.char(1);
  currency            : abap.char(6);
  desbase             : abap.char(254);
  despcode            : abap.char(50);
  despname            : abap.char(50);
  itemcode            : abap.char(50);
  itemname            : abap.char(100);
  perdesp             : abap.dec(19,4);
  qdedias             : abap.int4;
  tpcalc              : abap.char(2);
  vrdesp              : abap.dec(19,4);
  vrmax               : abap.dec(19,4);
  vrmim               : abap.dec(19,4);
  createdbyuser       : abp_creation_user;
  lastchangedbyuser   : abp_lastchange_user;
  lastchangedatetime  : abp_lastchange_tstmpl;
  locallastchanged    : abp_locinst_lastchange_tstmpl;
}
