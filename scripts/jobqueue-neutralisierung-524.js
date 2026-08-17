#!/usr/bin/env node
"use strict";

// Helmut — Betreiber-CLI: SQL fuer die Neutralisierung der 524 inerten Altauftraege (OP-30).
// =============================================================================================
// DIESES WERKZEUG VERBINDET SICH NIRGENDWOHIN. Es druckt ausschliesslich das SQL, das
// `lib/helmut/jobqueue-neutralisierung.js` erzeugt — dieselbe Quelle, die die Nachweissuite
// `scripts/jobqueue-neutralisierung-datenbank-test.js` an echter PostgreSQL beweist.
//
// DATENSCHUTZ (Korrektur 2026-08-17/2): es gibt KEINEN Exportmodus mehr. Eine fruehere
// Fassung bot einen Vollzeilenexport als Rueckweg an — der haette payload, tenant_id,
// idempotency_key und last_error aus Production in eine Datei geschrieben. Der Rueckweg ist
// die DETERMINISTISCHE NEUERZEUGUNG durch den Planer (kein byte-identischer Restore;
// Begruendung im Modulkopf und in Runbook §26.2). Jedes gedruckte SQL besteht die
// Datensparsamkeits-Selbstpruefung des Moduls (keine sensible Spalte, kein Vollzeilenkonstrukt).
//
// AUSFUEHRUNG IST BETREIBERAKTION (CLAUDE.md §5, ausdrueckliche Freigabe noetig):
//   Betreiberablauf, Vorbedingungen und Rueckweg: Runbook
//   docs/betrieb/op30-aktivierung-5-mandate.md §26. Standard ist der TROCKENLAUF —
//   er durchlaeuft alle Riegel und endet bauartbedingt im Rollback.
//
// AUFRUFE:
//   node scripts/jobqueue-neutralisierung-524.js                 Schritt 2, TROCKENLAUF (Standard)
//   node scripts/jobqueue-neutralisierung-524.js --vorpruefung   Schritt 0 (rein lesend)
//   node scripts/jobqueue-neutralisierung-524.js --scharf        Schritt 2, LOESCHT bei Erfolg

const N = require("../lib/helmut/jobqueue-neutralisierung.js");

const arg = process.argv[2] || "";
const bekannt = ["", "--vorpruefung", "--scharf", "--trockenlauf"];
if (!bekannt.includes(arg)) {
  const hinweis = ["--export", "--rueckweg", "--rueckweg-exakt"].includes(arg)
    ? " Der Exportmodus wurde aus Datenschutzgruenden ENTFERNT (Runbook §26.2: Rueckweg = deterministische Neuerzeugung)."
    : "";
  console.error(`Unbekanntes Argument '${arg}'. Erlaubt: --vorpruefung --scharf --trockenlauf (ohne Argument: Trockenlauf).${hinweis}`);
  process.exit(2);
}

switch (arg) {
  case "--vorpruefung":
    console.log(N.vorpruefungSql());
    break;
  case "--scharf":
    // Die einzige scharfe Fassung — und auch sie loescht nur, wenn ALLE Riegel R1–R9 halten.
    console.log(N.neutralisierungSql(N.PRODUCTION_VERTRAG, { modus: "scharf" }));
    break;
  default:
    console.log(N.neutralisierungSql());
}
