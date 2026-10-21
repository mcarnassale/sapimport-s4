sap.ui.define([
    "sap/ui/model/SimpleType"
], (SimpleType) => {
    "use strict";

    // Carried over from the B1 sapimport project as-is: generic Y/N-string <-> Boolean UI5 type,
    // no B1-specific dependency. Whether S/4HANA CBO boolean-shaped fields actually round-trip as
    // "Y"/"N" text (mirroring B1's db_Alpha convention) or as a real Edm.Boolean is unconfirmed —
    // see the type-mapping table in ../../docs/cbo-design.md. Keep using this type only where a
    // field is confirmed to still be Y/N text; drop it in favor of a plain Boolean binding
    // wherever the CBO field turns out to be Edm.Boolean.
    return SimpleType.extend("acx.sapimport.s4.model.YesNoType", {
        formatValue(sValue) {
            return sValue === "Y";
        },
        parseValue(bValue) {
            return bValue ? "Y" : "N";
        },
        validateValue() {
        }
    });
});
