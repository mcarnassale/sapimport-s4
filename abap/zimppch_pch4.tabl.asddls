@EndUserText.label : 'Demurrage'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zimppch_pch4 {
  key client          : abap.clnt not null;
  key sap_uuid        : sysuuid_x16 not null;
  sap_parentuuid      : sysuuid_x16;
  lineid              : abap.int4;
  agnavega            : abap.char(50);
  bloqsel             : abap.char(1);
  contnum             : abap.char(30);
  daydemur            : abap.int4;
  despacode           : abap.char(2);
  dtcontdev           : abap.dats;
  dtpgdemur           : abap.dats;
  freetime            : abap.int4;
  navio               : abap.char(50);
  totdemur            : abap.dec(19,4);
  vlrdemur            : abap.dec(19,4);
  createdbyuser       : abp_creation_user;
  lastchangedbyuser   : abp_lastchange_user;
  lastchangedatetime  : abp_lastchange_tstmpl;
  locallastchanged    : abp_locinst_lastchange_tstmpl;
}
