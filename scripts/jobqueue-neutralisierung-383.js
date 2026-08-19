#!/usr/bin/env node
"use strict";

// Helmut — Betreiber-CLI: SQL fuer die Neutralisierung der 383 inerten Auftraege des ERSTEN
// Stufe-1-Aktivierungslaufs (OP-30, GEMISCHTE Zielmenge: 301 wartend + 82 laeuft mit
// abgelaufener Lease).
// =============================================================================================
// DIESES WERKZEUG VERBINDET SICH NIRGENDWOHIN. Es druckt ausschliesslich das SQL, das
// `lib/helmut/jobqueue-neutralisierung.js` erzeugt — dieselbe Quelle, die die Nachweissuite
// `scripts/jobqueue-neutralisierung-gemischt-datenbank-test.js` an echter PostgreSQL beweist.
//
// WARUM NICHT scripts/jobqueue-neutralisierung-524.js: dessen Verfahren (§26) unterstuetzt
// die gemischte Zielmenge nachweislich nicht (R2 bricht bei jeder laeuft-Zeile ab, R9
// verlangt 0 laeuft im Nachzustand). Dieses Verfahren (§28) traegt die Anker vom
// 2026-08-19 und zusaetzlich den Outbox-Riegel R12 (Kaskade bewiesen, nicht angenommen).
//
// DATENSCHUTZ unveraendert: kein Exportmodus, keine sensible Spalte, kein Vollzeilenkonstrukt;
// jedes gedruckte SQL besteht die Datensparsamkeits-Selbstpruefung des Moduls. Rueckweg ist
// die DETERMINISTISCHE NEUERZEUGUNG durch den Planer (Runbook §26.2/§28).
//
// AUSFUEHRUNG IST BETREIBERAKTION (CLAUDE.md §5, ausdrueckliche Freigabe noetig):
//   Betreiberablauf, Vorbedingungen und Rueckweg: Runbook
//   docs/betrieb/op30-aktivierung-5-mandate.md §28. Standard ist der TROCKENLAUF —
//   er durchlaeuft alle Riegel und endet bauartbedingt im Rollback.
//
// AUFRUFE:
//   node scripts/jobqueue-neutralisierung-383.js                 Schritt 2, TROCKENLAUF (Standard)
//   node scripts/jobqueue-neutralisierung-383.js --vorpruefung   Schritt 0 (rein lesend)
//   node scripts/jobqueue-neutralisierung-383.js --scharf        Schritt 2, LOESCHT bei Erfolg

const N = require("../lib/helmut/jobqueue-neutralisierung.js");

const arg = process.argv[2] || "";
const bekannt = ["", "--vorpruefung", "--scharf", "--trockenlauf"];
if (!bekannt.includes(arg)) {
  const hinweis = ["--export", "--rueckweg", "--rueckweg-exakt"].includes(arg)
    ? " Einen Exportmodus gibt es aus Datenschutzgruenden NICHT (Runbook §26.2: Rueckweg = deterministische Neuerzeugung)."
    : "";
  console.error(`Unbekanntes Argument '${arg}'. Erlaubt: --vorpruefung --scharf --trockenlauf (ohne Argument: Trockenlauf).${hinweis}`);
  process.exit(2);
}

switch (arg) {
  case "--vorpruefung":
    console.log(N.vorpruefungGemischtSql());
    break;
  case "--scharf":
    // Die einzige scharfe Fassung — und auch sie loescht nur, wenn ALLE Riegel halten.
    console.log(N.neutralisierungGemischtSql(N.PRODUCTION_VERTRAG_GEMISCHT, { modus: "scharf" }));
    break;
  default:
    console.log(N.neutralisierungGemischtSql());
}
