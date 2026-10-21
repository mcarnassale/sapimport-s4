#!/usr/bin/env node
/**
 * One-off extraction: reads the ORIGINAL sapimport (SAP B1) project's
 * webapp/model/schemaMigrations.js and produces a structured JSON model of
 * every UDT/UDF/UDO currently in use, as the source of truth for designing
 * the S/4HANA Custom Business Objects in ../docs/cbo-design.md.
 *
 * Source project is only ever READ here — never modified.
 *
 * Usage: node scripts/extract-schema.js
 * Output: scripts/schema-model.json
 */
"use strict";

const fs = require("fs");
const path = require("path");

const SOURCE_FILE = path.resolve(__dirname, "../../sapimport/webapp/model/schemaMigrations.js");
const OUTPUT_FILE = path.resolve(__dirname, "schema-model.json");

function fail(msg) {
    console.error("EXTRACTION FAILED: " + msg);
    process.exit(1);
}

if (!fs.existsSync(SOURCE_FILE)) {
    fail(`source file not found at ${SOURCE_FILE}`);
}

const src = fs.readFileSync(SOURCE_FILE, "utf8");

// ---------------------------------------------------------------------------
// 1) Literal ctx.ensureField("TABLE", { Name: "...", Description: "...",
//    Type: "...", SubType: "...", Size: N, DefaultValue: "..." }) calls,
//    across the WHOLE file (freshInstall.run() + the version ladder).
// ---------------------------------------------------------------------------

// Matches ctx.ensureField("TABLE", { ...single-line object literal... });
// schemaMigrations.js writes every ensureField call as one line, so a
// non-greedy match up to the closing "});" on the same statement is safe —
// verified against the file's own formatting convention before relying on it.
const ENSURE_FIELD_RE = /ctx\.ensureField\(\s*"([A-Z0-9_]+)"\s*,\s*(\{[^;]*?\})\s*\)/g;

function parseObjectLiteral(sLiteral) {
    // These object literals are plain JS (string/number literals only, no
    // function calls) except for the occasional `/* comment */ "value"`
    // default-value annotations seen in the source — strip block comments
    // before eval'ing so they don't break parsing.
    const sCleaned = sLiteral.replace(/\/\*[\s\S]*?\*\//g, "");
    // eslint-disable-next-line no-eval
    return eval("(" + sCleaned + ")");
}

const tables = {}; // { TABLE: { fieldName: fieldDef } } -- last write wins per name

let m;
while ((m = ENSURE_FIELD_RE.exec(src))) {
    const [, sTable, sLiteral] = m;
    let oField;
    try {
        oField = parseObjectLiteral(sLiteral);
    } catch (e) {
        fail(`could not parse ensureField("${sTable}", ...) literal near offset ${m.index}: ${e.message}\n  literal: ${sLiteral}`);
    }
    if (!oField || !oField.Name) {
        fail(`ensureField("${sTable}", ...) literal near offset ${m.index} has no Name`);
    }
    tables[sTable] = tables[sTable] || {};
    tables[sTable][oField.Name] = oField;
}

// ---------------------------------------------------------------------------
// 2) The one indirection: ICFG's fields come from a separate ICFG_FIELDS
//    array, applied via `for (const oField of ICFG_FIELDS) { await
//    ctx.ensureField("ICFG", oField); }` rather than literal calls.
// ---------------------------------------------------------------------------

const ICFG_START_MARKER = "const ICFG_FIELDS = [";
const iIcfgStart = src.indexOf(ICFG_START_MARKER);
if (iIcfgStart === -1) {
    fail("could not find 'const ICFG_FIELDS = [' — extraction assumptions about the source file are stale");
}
const iIcfgEnd = src.indexOf("\n    ];", iIcfgStart);
if (iIcfgEnd === -1) {
    fail("could not find the closing '];' for ICFG_FIELDS");
}
const sIcfgArrayLiteral = src.slice(iIcfgStart + "const ICFG_FIELDS = ".length, iIcfgEnd + "\n    ]".length);
let aIcfgFields;
try {
    // eslint-disable-next-line no-eval
    aIcfgFields = eval("(" + sIcfgArrayLiteral.replace(/\/\*[\s\S]*?\*\//g, "") + ")");
} catch (e) {
    fail(`could not parse ICFG_FIELDS array: ${e.message}`);
}
tables.ICFG = tables.ICFG || {};
for (const oField of aIcfgFields) {
    if (!oField || !oField.Name) {
        fail("an ICFG_FIELDS entry has no Name");
    }
    tables.ICFG[oField.Name] = oField;
}

// ---------------------------------------------------------------------------
// 3) UDO_* constants — parent/child structure (ChildTables) + key columns
//    (FindColumns). These are clean object literals already; extract each
//    named const individually rather than one big regex sweep, since a
//    couple contain a comment line between declarations.
// ---------------------------------------------------------------------------

const UDO_CONST_NAMES = [
    "UDO_CONFIG", "UDO_COMEX", "UDO_NF_CFL", "UDO_PEDIDO_CFL",
    "UDO_CHAVES_DUIMP_CFL", "UDO_DESP_CFL", "UDO_LAYOUT", "UDO_IPRV",
    "UDO_PROCESSO_CFL", "UDO_DPRV"
];

const udos = {};
for (const sConstName of UDO_CONST_NAMES) {
    const sMarker = `const ${sConstName} = {`;
    const iStart = src.indexOf(sMarker);
    if (iStart === -1) {
        fail(`could not find '${sMarker}' — extraction assumptions about the source file are stale`);
    }
    // Find the matching closing brace by simple depth counting (these
    // literals are shallow — no nested objects except the ChildTables/
    // FindColumns arrays, which don't contain braces).
    let depth = 0;
    let i = iStart + sMarker.length - 1; // at the opening '{'
    let iEnd = -1;
    for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") {
            depth--;
            if (depth === 0) { iEnd = i; break; }
        }
    }
    if (iEnd === -1) {
        fail(`could not find closing brace for ${sConstName}`);
    }
    const sLiteral = src.slice(iStart + sMarker.length - 1, iEnd + 1);
    try {
        udos[sConstName] = parseObjectLiteral(sLiteral);
    } catch (e) {
        fail(`could not parse ${sConstName}: ${e.message}`);
    }
}

// ---------------------------------------------------------------------------
// 4) Assemble + report
// ---------------------------------------------------------------------------

const oOutput = {
    _generatedBy: "sapimport-s4/scripts/extract-schema.js",
    _sourceFile: path.relative(path.resolve(__dirname, "../.."), SOURCE_FILE).replace(/\\/g, "/"),
    _generatedAt: new Date().toISOString(),
    tables: {},
    udos
};

const aTableNames = Object.keys(tables).sort();
console.log("Per-table field counts:");
for (const sTable of aTableNames) {
    const aFields = Object.values(tables[sTable]).sort((a, b) => a.Name.localeCompare(b.Name));
    oOutput.tables[sTable] = aFields;
    console.log(`  ${sTable.padEnd(16)} ${aFields.length}`);
}
const nTotal = aTableNames.reduce((n, sTable) => n + oOutput.tables[sTable].length, 0);
console.log(`TOTAL: ${aTableNames.length} tables, ${nTotal} field definitions`);

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(oOutput, null, 2) + "\n", "utf8");
console.log(`\nWrote ${OUTPUT_FILE}`);
