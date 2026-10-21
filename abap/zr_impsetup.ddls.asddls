@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'sapimport - versao de dados do backend'
define root view entity ZR_IMPSETUP
  as select from zimpsetup
{
  key setup_id       as SetupId,
  schema_version     as SchemaVersion,
  @Semantics.user.createdBy: true
  createdbyuser      as CreatedByUser,
  @Semantics.user.lastChangedBy: true
  lastchangedbyuser  as LastChangedByUser,
  @Semantics.systemDateTime.lastChangedAt: true
  lastchangedatetime as LastChangeDateTime,
  @Semantics.systemDateTime.localInstanceLastChangedAt: true
  locallastchanged   as LocalLastChanged
}
