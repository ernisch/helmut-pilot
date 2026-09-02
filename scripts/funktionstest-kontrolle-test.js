"use strict";

// Helmut — Vertragstest der STUFENKONTROLLE des 500er-Funktionstests.
// =============================================================================
// Diese Suite entstand am 02.09. aus einem adversarialen Diff-Review, das SECHS
// bestaetigte Befunde in genau diesem Modul fand. Alle sechs hatten dieselbe
// Form: eine Abbruchregel meldete eine gemessene 0, obwohl gar nichts gemessen
// worden war. Das ist die gefaehrlichste Klasse Fehler in einem Sicherheitsnetz
// — ein falsches Gruen (CLAUDE.md §4.4) an genau der Stelle, die einen
// missglueckten Lauf stoppen soll.
//
// Gepinnt wird deshalb durchgehend die UNTERSCHEIDUNG zwischen
//   "gemessen und in Ordnung"  und  "gar nicht bewertbar".
//
// Ohne Netz, ohne Datenbank, ohne Uhr.

const funktionstest = require("../lib/helmut/funktionstest-500");
const K = require("../lib/helmut/funktionstest-kontrolle");
const N = require("../lib/helmut/funktionstest-nachweise");

const T0 = Date.UTC(2026, 8, 10, 12, 0, 0);

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

const SEIT = "2026-09-10T11:36:00.000Z";

// ── A · Das Erhebungs-SQL ───────────────────────────────────────────────────
console.log("\n== A · Erhebungs-SQL: rein lesend und ohne Tautologie ==");
{
  const sql = K.erhebungsSql({ seitIso: SEIT });
  check("A1 Ausschliesslich lesende Anweisungen",
    !/\b(insert|update|delete|drop|alter|truncate|grant|revoke)\b/i.test(sql));

  // BEFUND: `group by idempotency_key having count(*) > 1` auf einer Spalte mit
  // UNIQUE-Index kann strukturell nie eine Zeile liefern. A13 war damit eine
  // Abbruchregel, die niemals ausloest.
  check("A2 Die Dublettenabfrage gruppiert NICHT mehr ueber den Idempotenzschluessel",
    !/group by idempotency_key/i.test(sql));
  check("A3 Sie gruppiert stattdessen ueber die fachliche Arbeit",
    /group by job_type, tenant_id, freshness_window having count\(\*\) > 1/i.test(sql));
  check("A4 Und zaehlt nur ABGESCHLOSSENE Arbeit mit Mandantenbezug",
    /status = 'erledigt' and tenant_id is not null/i.test(sql));

  // BEFUND: Block 3 liest public.llm_usage — in diesem Sprint garantiert leer.
  check("A5 Der Nutzungsblock warnt ausdruecklich vor der leeren Tabelle",
    /LEER, solange/i.test(sql) && /relationalAktiv/.test(sql));
  check("A6 Die Kosten kommen weiterhin aus dem atomaren Zaehler, nicht aus dem Blob-Ring",
    /from llm_budget_counters/i.test(sql));
  check("A7 Das Zeitfenster wird durchgereicht", sql.includes(SEIT));
}

// ── B · A01/A06: leere Quelle ist kein gruener Befund ───────────────────────
console.log("\n== B · Modellaufrufe: leere Quelle bleibt unbewertbar ==");
{
  const ohneQuelle = K.baueBeobachtungen({ modellaufrufe: { unbekannteModellaufrufe: 0, drosselungen: 0 } });
  check("B1 Ohne erklaerte Quelle entsteht KEINE Zahl",
    !("unbekannteModellaufrufe" in ohneQuelle) && !("drosselungen" in ohneQuelle));
  const mitRelational = K.baueBeobachtungen({
    modellaufrufe: { relationalAktiv: true, unbekannteModellaufrufe: 0, drosselungen: 2 }
  });
  check("B2 Mit relationaler Ablage entsteht die Zahl",
    mitRelational.unbekannteModellaufrufe === 0 && mitRelational.drosselungen === 2);
  // VERSCHAERFT 02.09. (zweiter Reviewbefund): `blobAusgezaehlt: true` war eine
  // menschliche ZUSAGE. Verlangt wird jetzt das Ergebnis des reproduzierbaren
  // Auswerters `funktionstest-nachweise.werteNutzungslogAus`.
  const mitAuswerter = K.baueBeobachtungen({
    modellaufrufe: N.werteNutzungslogAus({
      eintraege: [{ createdAt: new Date(T0).toISOString(), callType: "keine-bekannte-art" }],
      vonMs: T0 - 3600000, bisMs: T0 + 3600000
    })
  });
  check("B3 Das Ergebnis des Blob-Auswerters traegt",
    mitAuswerter.unbekannteModellaufrufe === 1 && mitAuswerter.drosselungen === 0);
  check("B3a Eine von Hand gesetzte Zusage traegt NICHT mehr",
    !("unbekannteModellaufrufe" in K.baueBeobachtungen({
      modellaufrufe: { blobAusgezaehlt: true, unbekannteModellaufrufe: 1, drosselungen: 0 }
    })));
  check("B4 Die fehlende Messung taucht als FEHLEND auf, nicht als bestanden",
    K.kontrolliere({ stufe: "a", quellen: {}, grenzen: {} })
      .fehlendeMesswerte.includes("unbekannteModellaufrufe"));
}

// ── C · A10: der Riegel zaehlt nichts, also misst A10 nichts ────────────────
console.log("\n== C · Kommunikationsversuche: ohne Zaehler keine Zahl ==");
{
  check("C1 Ohne Auswerterergebnis entsteht KEINE Zahl",
    !("kommunikationsversuche" in K.baueBeobachtungen({ riegel: { gezaehlt: true, durchgelassen: 0 } })));
  const spuren = (auditEvents) => N.werteKommunikationsspurenAus({
    auditEvents, pushEreignisse: [], jobOutbox: [],
    vonMs: T0 - 3600000, bisMs: T0 + 3600000
  });
  check("C2 Mit dem Ergebnis des Spurenauswerters entsteht sie",
    K.baueBeobachtungen({ riegel: spuren([]) }).kommunikationsversuche === 0);
  check("C3 Ein TATSAECHLICH versendeter Vorgang wird uebernommen",
    K.baueBeobachtungen({
      riegel: spuren([{
        createdAt: new Date(T0).toISOString(), action: "admin.user.invite",
        politicianId: "test-kohorte-a-001", detail: "a@test-kohorte.invalid · versand=ja"
      }])
    }).kommunikationsversuche === 1);
  check("C3a Ein NICHT versendeter Vorgang zaehlt nicht (Routenprotokoll ist kein Versand)",
    K.baueBeobachtungen({
      riegel: spuren([{
        createdAt: new Date(T0).toISOString(), action: "admin.user.invite",
        politicianId: "test-kohorte-a-001", detail: "a@test-kohorte.invalid · versand=nein"
      }])
    }).kommunikationsversuche === 0);
}

// ── D · A12: ein nicht bewertbares Fenster ist keine gemessene 0 ────────────
console.log("\n== D · Startfenster: unbewertbar ist nicht frei ==");
{
  const unvollstaendig = funktionstest.pruefeStartfenster({ startUtc: null, dauerMinuten: null });
  check("D1 Ein unvollstaendiger Befund erzeugt KEINE Konfliktzahl",
    !("fensterKonflikte" in K.baueBeobachtungen({ startfenster: unvollstaendig })),
    `gepruefteCrons=${unvollstaendig.gepruefteCrons}`);
  const ohneCrons = funktionstest.pruefeStartfenster({
    startUtc: "2026-09-10T12:00:00Z", dauerMinuten: 60, crons: []
  });
  check("D2 Ein Befund gegen eine LEERE Cronliste erzeugt ebenfalls keine Zahl",
    ohneCrons.gepruefteCrons === 0
      && !("fensterKonflikte" in K.baueBeobachtungen({ startfenster: ohneCrons })),
    "gepruefteCrons=0 ⇒ ungeprueft, unabhaengig von startErlaubt");
  const frei = { startErlaubt: true, konflikte: [], gepruefteCrons: 13 };
  check("D3 Ein geprueftes freies Fenster meldet 0 Konflikte",
    K.baueBeobachtungen({ startfenster: frei }).fensterKonflikte === 0);
  const gesperrtOhneListe = { startErlaubt: false, konflikte: [], gepruefteCrons: 13 };
  check("D4 Ein GESPERRTES Fenster ohne benannten Konflikt zaehlt dennoch als Konflikt",
    K.baueBeobachtungen({ startfenster: gesperrtOhneListe }).fensterKonflikte === 1);
  const gesperrtMitListe = { startErlaubt: false, konflikte: [{ art: "x" }, { art: "y" }], gepruefteCrons: 13 };
  check("D5 Benannte Konflikte werden exakt gezaehlt",
    K.baueBeobachtungen({ startfenster: gesperrtMitListe }).fensterKonflikte === 2);
}

// ── E · A14: totale Verdraengung ist nicht "alles in Ordnung" ───────────────
console.log("\n== E · Verdraengung: fehlende reale Mandate zaehlen als verdraengt ==");
{
  const bedient = {
    klassen: { real: 2, synthetisch: 1, realeVollstaendigBedient: true },
    zuteilung: { "r-eins": { notwendig: 1 }, "r-zwei": { notwendig: 1 }, "test-kohorte-a-001": { notwendig: 1 } }
  };
  check("E1 Alle realen Mandate bedient ⇒ 0",
    K.baueBeobachtungen({ tagesplan: bedient }).realeMandateOhneZuteilung === 0);
  const eineOhne = {
    klassen: { real: 2, synthetisch: 0, realeVollstaendigBedient: false },
    zuteilung: { "r-eins": { notwendig: 1 }, "r-zwei": { notwendig: 0 } }
  };
  check("E2 Ein reales Mandat ohne notwendige Zuteilung ⇒ 1",
    K.baueBeobachtungen({ tagesplan: eineOhne }).realeMandateOhneZuteilung === 1);
  // DER BEFUND: fehlen die realen Mandate VOLLSTAENDIG aus der Zuteilung — der
  // Fall der totalen Verdraengung —, war die alte Rechnung 0 und damit
  // ununterscheidbar von "alles in Ordnung".
  const totalVerdraengt = {
    klassen: { real: 5, synthetisch: 495, realeVollstaendigBedient: false },
    zuteilung: { "test-kohorte-a-001": { notwendig: 1 }, "test-kohorte-a-002": { notwendig: 1 } }
  };
  check("E3 TOTALE Verdraengung: kein reales Mandat in der Zuteilung ⇒ alle 5 gelten als verdraengt",
    K.baueBeobachtungen({ tagesplan: totalVerdraengt }).realeMandateOhneZuteilung === 5);
  const teilweiseFehlend = {
    klassen: { real: 5, synthetisch: 0, realeVollstaendigBedient: false },
    zuteilung: { "r-eins": { notwendig: 1 }, "r-zwei": { notwendig: 0 } }
  };
  check("E4 Teilweise fehlend: 1 ohne Zuteilung + 3 gar nicht gelistet ⇒ 4",
    K.baueBeobachtungen({ tagesplan: teilweiseFehlend }).realeMandateOhneZuteilung === 4);
}

// ── F · Keine Koerzierung, kein stiller Erfolg ──────────────────────────────
console.log("\n== F · Keine Koerzierung ==");
{
  check("F1 Ohne Preis entsteht keine Kostenzahl",
    !("kostenBisherUsd" in K.baueBeobachtungen({ kosten: { aufrufeHeute: 100 } })));
  check("F2 Mit Preis entsteht sie",
    K.baueBeobachtungen({ kosten: { aufrufeHeute: 100, preisJeAufrufUsd: 0.002941 } }).kostenBisherUsd === 0.2941);
  check("F3 Eine voellig leere Erhebung ist NICHT bestanden",
    K.kontrolliere({ stufe: "a", quellen: {}, grenzen: {} }).fehlendeMesswerte.length > 0);
  check("F4 Das Modul erhebt nichts selbst (kein Netz, keine Datenbank, keine Uhr)",
    (() => {
      const quelle = require("fs").readFileSync(
        require("path").join(__dirname, "..", "lib/helmut/funktionstest-kontrolle.js"), "utf8");
      const code = quelle.replace(/\/\/.*$/gm, "");
      return !/require\(["']\.\/storage["']\)/.test(code)
        && !/\bfetch\(/.test(code)
        && !/Date\.now\(\)/.test(code);
    })());
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
