@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'sapimport - versao de dados do backend'
define root view entity ZC_IMPSETUP
  provider contract transactional_query
  as projection on ZR_IMPSETUP
{
  key SetupId,
  SchemaVersion,
  CreatedByUser,
  LastChangedByUser,
  LastChangeDateTime,
  LocalLastChanged
}
