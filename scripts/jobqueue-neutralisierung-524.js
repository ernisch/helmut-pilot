#!/usr/bin/env node
"use strict";

// Helmut — Betreiber-CLI: SQL fuer die Neutralisierung der 524 inerten Altauftraege (OP-30).
// =============================================================================================
// DIESES WERKZEUG VERBINDET SICH NIRGENDWOHIN. Es druckt ausschliesslich das SQL, das
// `lib/helmut/jobqueue-neutralisierung.js` erzeugt — dieselbe Quelle, die die Nachweissuite
// `scripts/jobqueue-neutralisierung-datenbank-test.js` an echter PostgreSQL beweist.
//
// AUSFUEHRUNG IST BETREIBERAKTION (CLAUDE.md §5, ausdrueckliche Freigabe noetig):
//   Betreiberablauf, Vorbedingungen und Rueckweg: Runbook
//   docs/betrieb/op30-aktivierung-5-mandate.md §26. Standard ist der TROCKENLAUF —
//   er durchlaeuft alle Riegel und endet bauartbedingt im Rollback.
//
// AUFRUFE:
//   node scripts/jobqueue-neutralisierung-524.js                 Schritt 2, TROCKENLAUF (Standard)
//   node scripts/jobqueue-neutralisierung-524.js --vorpruefung   Schritt 0 (rein lesend)
//   node scripts/jobqueue-neutralisierung-524.js --export        Schritt 1 (rein lesend, = Rueckweg)
//   node scripts/jobqueue-neutralisierung-524.js --scharf        Schritt 2, LOESCHT bei Erfolg
//   node scripts/jobqueue-neutralisierung-524.js --rueckweg      Schritt R (braucht :'export')
//   node scripts/jobqueue-neutralisierung-524.js --rueckweg-exakt  Schritt R, Variante B (byte-gleich)

const N = require("../lib/helmut/jobqueue-neutralisierung.js");

const arg = process.argv[2] || "";
const bekannt = ["", "--vorpruefung", "--export", "--scharf", "--rueckweg", "--rueckweg-exakt", "--trockenlauf"];
if (!bekannt.includes(arg)) {
  console.error(`Unbekanntes Argument '${arg}'. Erlaubt: ${bekannt.filter(Boolean).join(" ")} (ohne Argument: Trockenlauf).`);
  process.exit(2);
}

switch (arg) {
  case "--vorpruefung":
    console.log(N.vorpruefungSql());
    break;
  case "--export":
    console.log(N.exportSql());
    break;
  case "--scharf":
    // Die einzige scharfe Fassung — und auch sie loescht nur, wenn ALLE Riegel R1–R9 halten.
    console.log(N.neutralisierungSql(N.PRODUCTION_VERTRAG, { modus: "scharf" }));
    break;
  case "--rueckweg":
    console.log(N.wiederherstellungSql());
    break;
  case "--rueckweg-exakt":
    console.log(N.wiederherstellungSql(N.PRODUCTION_VERTRAG, { exakt: true }));
    break;
  default:
    console.log(N.neutralisierungSql());
}
