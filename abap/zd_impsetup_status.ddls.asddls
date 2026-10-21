@EndUserText.label: 'sapimport - status do setup'
define abstract entity ZD_IMPSETUP_STATUS
{
  CurrentVersion : abap.int4;
  TargetVersion  : abap.int4;
  AppliedSteps   : abap.int4;
}
