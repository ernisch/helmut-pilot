"use strict";

// Sprint 23C — Tests fuer die sichtbare Relevanzerklaerung.
//
// Deckt vier Schichten ab:
//   A  Erklaerungsmodul (lib/helmut/matching-erklaerung.js)
//   B  Vorbedingung im Lesepfad (storage.listMatchingResults)
//   C  Serverpfad (lage.loadRankedVorgaenge + koToVorgangCard)
//   D  Oberflaeche (client.js vsheetRelevanzHtml, echter Renderer im vm)
//
// Zu B: Der Aktualitaetsfilter selbst wurde in Sprint 23C gefunden, aber als
// eigener Hotfix (PR #172, `scripts/matching-aktualitaet-test.js`) ausgeliefert,
// weil er mit der Aktivierung von HELMUT_MATCHING_AUDIT zum aktiven Pilotblocker
// wurde. Dieser Sprint aendert den Lesepfad NICHT mehr. Die fuenf Pruefungen hier
// sichern ihn als VORBEDINGUNG der Erklaerung ab: faellt der Filter, zeigt die
// Erklaerung Gruende zu einem Vorgang, der gar nicht mehr aktuell ist.
//
// Vollstaendig offline: 0 Netz, 0 Datenbank, 0 KI.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

const erkl = require(path.join(root, "lib/helmut/matching-erklaerung.js"));
const lage = require(path.join(root, "lib/helmut/lage.js"));

// ── A · Erklaerungsmodul ─────────────────────────────────────────────────────
console.log("== A · Erklaerungsmodul ==");

// Fall 1: begruendung UND signale vorhanden.
const vollstaendig = erkl.erklaerungAusErgebnis({
  run_id: "run-1", aktuell: true,
  signale: { ausschuss: ["Arbeit und Soziales"], thema: ["Rente"], legacy_vektor: 0.4213 },
  begruendung: "Betrifft deinen Ausschuss Arbeit und Soziales und deinen Schwerpunkt Rente."
});
check("A1 Fall 1: gespeicherte Begruendung wird 1:1 uebernommen",
  vollstaendig && vollstaendig.satz === "Betrifft deinen Ausschuss Arbeit und Soziales und deinen Schwerpunkt Rente.");
check("A2 Fall 1: Belege aus signale, in Prioritaetsreihenfolge",
  vollstaendig && vollstaendig.belege.length === 2
  && vollstaendig.belege[0].text === "Dein Ausschuss: Arbeit und Soziales"
  && vollstaendig.belege[1].text === "Dein Schwerpunkt: Rente");

// Fall 2: NUR signale — der Satz wird deterministisch abgeleitet.
const nurSignale = erkl.erklaerungAusErgebnis({
  run_id: "run-1", aktuell: true, begruendung: null,
  signale: { wahlkreis: ["Berlin-Mitte"] }
});
check("A3 Fall 2: nur signale -> Satz abgeleitet",
  nurSignale && nurSignale.satz === "Betrifft deinen Wahlkreis Berlin-Mitte."
  && nurSignale.belege[0].text === "Dein Wahlkreis: Berlin-Mitte");
check("A4 Fall 2: Ableitung ist deterministisch (zweimal identisch)",
  JSON.stringify(nurSignale) === JSON.stringify(erkl.erklaerungAusErgebnis({
    run_id: "run-1", aktuell: true, begruendung: null, signale: { wahlkreis: ["Berlin-Mitte"] }
  })));

// Fall 3: NUR begruendung, kein Beleg -> nichts anzeigen (Belegpflicht).
check("A5 Fall 3: Satz ohne Beleg wird NICHT angezeigt",
  erkl.erklaerungAusErgebnis({ run_id: "run-1", aktuell: true, begruendung: "Betrifft dich.", signale: {} }) === null);

// Fall 4: Legacy-Zeile, run_id = NULL, keine Auditfelder — matched_features tragen.
const legacy = erkl.erklaerungAusErgebnis({
  run_id: null, aktuell: true, signale: null, begruendung: null,
  matched_features: [{ type: "ausschuss", value: "Verkehr" }, { type: "partei", value: "SPD" }]
});
check("A6 Fall 4: Legacy (run_id=NULL) erklaert aus matched_features",
  legacy && legacy.satz === "Betrifft deinen Ausschuss Verkehr und deine Partei SPD."
  && legacy.belege.length === 2);

// Fall 5: nichts Belegbares -> null, KEIN Ersatztext.
check("A7 Fall 5: Legacy ohne jeden Beleg -> null (kein Ersatztext)",
  erkl.erklaerungAusErgebnis({ run_id: null, aktuell: true, signale: null, begruendung: null, matched_features: [] }) === null);
check("A8 Fall 5: leeres/rein numerisches signale -> null",
  erkl.erklaerungAusErgebnis({ aktuell: true, signale: { legacy_vektor: -0.0735 } }) === null);

// Fall 6: abgeloeste Zeile.
check("A9 Fall 6: aktuell=false wird nie erklaert",
  erkl.erklaerungAusErgebnis({
    aktuell: false, abgeloest_am: "2026-07-29T08:00:00Z",
    signale: { ausschuss: ["Verkehr"] }, begruendung: "Betrifft deinen Ausschuss Verkehr."
  }) === null);

// Fall 7: defekte/unvollstaendige Daten.
check("A10 Fall 7: null/Array/String/Zahl -> null statt Fehler",
  erkl.erklaerungAusErgebnis(null) === null
  && erkl.erklaerungAusErgebnis([]) === null
  && erkl.erklaerungAusErgebnis("x") === null
  && erkl.erklaerungAusErgebnis(7) === null);
check("A11 Fall 7: kaputtes signale-JSON faellt still auf matched_features zurueck",
  (() => {
    const r = erkl.erklaerungAusErgebnis({ aktuell: true, signale: "{nicht:json", matched_features: [{ type: "thema", value: "Rente" }] });
    return r && r.belege.length === 1 && r.belege[0].text === "Dein Schwerpunkt: Rente";
  })());
check("A12 Fall 7: signale als JSON-STRING wird akzeptiert",
  (() => {
    const r = erkl.erklaerungAusErgebnis({ aktuell: true, signale: JSON.stringify({ partei: ["SPD"] }) });
    return r && r.belege[0].text === "Deine Partei: SPD";
  })());

// Ungueltige / ueberlange / feindliche Signalwerte.
const lang = "A".repeat(500);
const ueberlang = erkl.erklaerungAusErgebnis({
  aktuell: true,
  signale: { ausschuss: [lang], thema: [123, null, { x: 1 }, ["y"], "  Rente\n\tund\r\nArbeit  ", ""] },
  begruendung: "B".repeat(900)
});
check("A13 ueberlanger Signalwert wird auf 80 Zeichen begrenzt",
  ueberlang && ueberlang.belege[0].text.length <= "Dein Ausschuss: ".length + 80);
check("A14 ueberlanger Satz wird auf MAX_SATZ begrenzt",
  ueberlang && ueberlang.satz.length <= erkl.MAX_SATZ);
check("A15 Nicht-Zeichenketten in signale werden verworfen",
  ueberlang && !JSON.stringify(ueberlang).includes("123") && !JSON.stringify(ueberlang).includes('"y"'));
check("A16 Zeilenumbrueche/Steuerzeichen werden normalisiert",
  ueberlang && ueberlang.belege.some((b) => b.text === "Dein Schwerpunkt: Rente und Arbeit"));
check("A17 nie mehr als MAX_BELEGE Belege",
  (() => {
    const r = erkl.erklaerungAusErgebnis({
      aktuell: true,
      signale: { ausschuss: ["A1", "A2", "A3"], thema: ["T1", "T2"], wahlkreis: ["W1"], partei: ["P1"] }
    });
    return r && r.belege.length === erkl.MAX_BELEGE;
  })());
check("A18 Breite vor Tiefe: je Signalart zuerst EIN Beleg",
  (() => {
    const r = erkl.erklaerungAusErgebnis({
      aktuell: true, signale: { ausschuss: ["A1", "A2", "A3"], thema: ["T1"], wahlkreis: ["W1"], partei: ["P1"] }
    });
    return r && r.belege.map((b) => b.art).join(",") === "ausschuss,thema,wahlkreis,partei";
  })());
check("A19 doppelte Werte erscheinen nur einmal",
  (() => {
    const r = erkl.erklaerungAusErgebnis({ aktuell: true, signale: { thema: ["Rente", "Rente", " Rente "] } });
    return r && r.belege.length === 1;
  })());

// Keine technischen Auditfelder in der Ausgabe.
const technisch = erkl.erklaerungAusErgebnis({
  id: "mr-mdb-a-ko-1", user_id: "mdb-a", run_id: "run-7ac3", knowledge_object_id: "ko-1",
  similarity: 0.8123, rank: 3, aktuell: true,
  eingabe_fingerabdruck: "be4670c61235c908559853a6f6fc6c8c", ko_eingabe_hash: "deadbeef",
  engine_version: "legacy-1", rezept_version: "legacy_relevance_v1", vektor_version: "v-384",
  berechnet_am: "2026-07-29T06:00:00Z", filters: {},
  signale: { ausschuss: ["Verkehr"], legacy_vektor: 0.8123 },
  begruendung: "Betrifft deinen Ausschuss Verkehr."
});
const technischJson = JSON.stringify(technisch);
const VERBOTEN = [
  "run-7ac3", "mr-mdb-a-ko-1", "mdb-a", "ko-1", "0.8123", "be4670c6", "deadbeef",
  "legacy-1", "legacy_relevance_v1", "v-384", "similarity", "rank", "fingerabdruck",
  "engine_version", "rezept_version", "vektor_version", "embedding", "vektor", "Score", "matching"
];
check("A20 kein einziges technisches Auditfeld in der Ausgabe",
  VERBOTEN.every((v) => technischJson.toLowerCase().indexOf(v.toLowerCase()) < 0));
check("A21 Ausgabe enthaelt ausschliesslich satz + belege",
  Object.keys(technisch).sort().join(",") === "belege,satz"
  && technisch.belege.every((b) => Object.keys(b).sort().join(",") === "art,text"));
check("A22 keine Ziffer in der sichtbaren Ausgabe",
  !/\d/.test(technisch.satz + technisch.belege.map((b) => b.text).join("")));

// Keine erfundene Erklaerung.
check("A23 leere Zeile erzeugt keine Erklaerung",
  erkl.erklaerungAusErgebnis({}) === null && erkl.erklaerungAusErgebnis({ aktuell: true }) === null);
check("A24 Belegtexte enthalten nur Werte, die auch in den Signalen stehen",
  (() => {
    const r = erkl.erklaerungAusErgebnis({ aktuell: true, signale: { thema: ["Rente"] } });
    return r && r.belege.length === 1 && r.belege[0].text.includes("Rente");
  })());

// ── B · Vorbedingung im Lesepfad (Fix aus PR #172, hier nur abgesichert) ─────
console.log("\n== B · Vorbedingung im Lesepfad (listMatchingResults) ==");

process.env.HELMUT_TENANT_JWT_MODE = process.env.HELMUT_TENANT_JWT_MODE || "";
const storage = require(path.join(root, "lib/helmut/storage.js"));

const gesehene = [];
const fakeRequest = (endpoint) => { gesehene.push(endpoint); return Promise.resolve([]); };
const deps = { ready: () => true, request: fakeRequest };

(async () => {
  await storage.listMatchingResults({ userId: "mdb-a", limit: 12 }, deps);
  check("B1 Vorbedingung: Default filtert auf aktuell=true (Fix aus PR #172)",
    gesehene[0].includes("aktuell=is.true"));
  check("B2 Mandantenfilter bleibt Pflicht",
    gesehene[0].includes("user_id=eq.mdb-a"));
  // NACHGEZOGEN (Befund 1, Korrektursprint 2026-09-01): die aktuelle Projektion
  // sortiert rank-primaer — created_at friert beim Erstauftritt ein und traegt
  // keine Relevanzordnung (Herleitung + Regression: matching-reihenfolge-test.js).
  check("B3 aktuelle Projektion sortiert rank-primaer (rank.asc.nullslast,id.asc)",
    gesehene[0].includes("order=rank.asc.nullslast,id.asc"));

  await storage.listMatchingResults({ userId: "mdb-a", limit: 12, includeAbgeloest: true }, deps);
  check("B4 Historienzugang bleibt erhalten (includeAbgeloest=true ohne Filter)",
    !gesehene[1].includes("aktuell=is.true") && gesehene[1].includes("user_id=eq.mdb-a"));

  let tenantFehler = null;
  try { await storage.listMatchingResults({}, deps); } catch (e) { tenantFehler = e; }
  check("B5 ohne Mandant -> harter Fehler (kein stiller Alle-Mandanten-Lesezugriff)",
    !!tenantFehler);

  // ── C · Serverpfad ────────────────────────────────────────────────────────
  console.log("\n== C · Serverpfad (lage.js) ==");

  const kos = [
    { id: "ko-1", vorgang_id: "v-1", status: "neu", understanding_status: "complete", was_ist_passiert: "A", warum_wichtig: "W", headline: "H1" },
    { id: "ko-2", vorgang_id: "v-2", status: "neu", understanding_status: "complete", was_ist_passiert: "B", warum_wichtig: "W", headline: "H2" },
    { id: "ko-3", vorgang_id: "v-3", status: "neu", understanding_status: "complete", was_ist_passiert: "C", warum_wichtig: "W", headline: "H3" }
  ];
  // NACHTRAG 2026-08-08 (Korrektursprint): die Zusagen dieses Abschnitts wurden fuer die
  // Relevanzordnung geschrieben (C8/C8b/C8c/C9/C11/C11b pruefen ihre Determiniertheit ueber
  // den stabilen Schluessel). Seit diesem Sprint ist `HELMUT_RELEVANZORDNUNG` **default AUS**.
  // Die Ordnung wird deshalb hier ausdruecklich eingeschaltet — die Abhaengigkeit steht damit
  // im Test statt in einem Standard, der sich aendern kann. Am Ende des Abschnitts wird der
  // vorherige Zustand wiederhergestellt.
  const relVorher = process.env.HELMUT_RELEVANZORDNUNG;
  process.env.HELMUT_RELEVANZORDNUNG = "on";

  const mkStorage = (rows) => ({
    listKnowledgeObjects: async () => kos,
    listMatchingResults: async (args) => {
      // Der produktive Aufrufer darf NIE abgeloeste Zeilen anfordern.
      if (args && args.includeAbgeloest) throw new Error("Nutzerpfad darf keine abgeloesten Zeilen anfordern");
      return rows.filter((r) => r.aktuell !== false);
    }
  });

  const rowsGemischt = [
    { knowledge_object_id: "ko-1", aktuell: true, run_id: "r1", signale: { ausschuss: ["Verkehr"] }, begruendung: "Betrifft deinen Ausschuss Verkehr." },
    { knowledge_object_id: "ko-2", aktuell: false, abgeloest_am: "2026-07-29T08:00:00Z", run_id: "r0", signale: { thema: ["Alt"] }, begruendung: "Betrifft deinen Schwerpunkt Alt." },
    { knowledge_object_id: "ko-3", aktuell: true, run_id: null, matched_features: [] }
  ];
  const ranked = await lage.loadRankedVorgaenge(mkStorage(rowsGemischt), null, {}, "mdb-a");
  check("C1 abgeloester Vorgang erscheint NICHT im Nutzerpfad",
    ranked.length === 2 && !ranked.some((k) => k.id === "ko-2"));
  check("C2 aktueller Vorgang traegt die Erklaerung",
    ranked[0].id === "ko-1" && ranked[0].relevanz_erklaerung
    && ranked[0].relevanz_erklaerung.satz === "Betrifft deinen Ausschuss Verkehr.");
  check("C3 unbelegter Vorgang bleibt unveraendert (keine erfundene Erklaerung)",
    ranked[1].id === "ko-3" && !("relevanz_erklaerung" in ranked[1]));
  check("C4 Reihenfolge entspricht exakt der gespeicherten Reihenfolge",
    ranked.map((k) => k.id).join(",") === "ko-1,ko-3");

  const karte = lage.koToVorgangCard(ranked[0], []);
  check("C5 koToVorgangCard reicht relevanz als { satz, belege } durch",
    karte.relevanz && karte.relevanz.satz && Array.isArray(karte.relevanz.belege));
  check("C6 Karte enthaelt keine technischen Auditfelder",
    ["run_id", "similarity", "rank", "fingerabdruck", "eingabe_hash"].every(
      (v) => JSON.stringify(karte).toLowerCase().indexOf(v) < 0));
  const karteOhne = lage.koToVorgangCard(ranked[1], []);
  check("C7 Karte ohne Erklaerung liefert relevanz=null (Alt-Pfad unveraendert)",
    karteOhne.relevanz === null);

  // Bestandspfad ohne jede Auditdaten (heutiger Production-Stand).
  const rowsLegacy = [
    { knowledge_object_id: "ko-2", matched_features: [{ type: "partei", value: "SPD" }] },
    { knowledge_object_id: "ko-1", matched_features: [] }
  ];
  const rankedLegacy = await lage.loadRankedVorgaenge(mkStorage(rowsLegacy), null, {}, "mdb-a");
  // GEAENDERTE ERWARTUNG (2026-08-08, mit Begruendung — keine Abschwaechung).
  // Bis hierher pruefte C8 die ZEILENREIHENFOLGE der Ablage ("ko-2,ko-1"). Genau die ist
  // seit der Gruendervorgabe "Relevanz vor Aktualitaet" nicht mehr massgeblich — und sie war
  // vorher auch nicht verlaesslich: `listMatchingResults` ordnet nach `created_at desc`, und
  // weil `now()` in einer Postgres-Transaktion konstant ist, tragen alle Zeilen eines Laufs
  // denselben Zeitstempel. Die Reihenfolge war damit UNDEFINIERT (nachgewiesen: J8-Wackler
  // in berlin-e2e-vertrag-test.js, 1 von 25 Laeufen unter Last).
  // Neu geprueft wird deshalb, was jetzt zugesichert ist und STAERKER ist als vorher:
  //   (a) beide Vorgaenge sind weiterhin da — der Bestandspfad funktioniert unveraendert,
  //   (b) die Reihenfolge ist DETERMINISTISCH (hier: leeres Profil -> kein Relevanzsignal
  //       -> stabiler technischer Schluessel entscheidet),
  //   (c) die Erklaerung reist weiterhin am Vorgang mit, egal an welcher Position er steht.
  check("C8 Bestand ohne Auditspalten funktioniert unveraendert weiter (beide Vorgaenge vorhanden)",
    rankedLegacy.length === 2 && new Set(rankedLegacy.map((k) => k.id)).size === 2
    && rankedLegacy.every((k) => ["ko-1", "ko-2"].includes(k.id)),
    rankedLegacy.map((k) => k.id).join(","));
  check("C8b Die Reihenfolge ist deterministisch (stabiler Schluessel bei Gleichstand)",
    rankedLegacy.map((k) => k.id).join(",") === "ko-1,ko-2",
    rankedLegacy.map((k) => k.id).join(","));
  check("C8c Zwei Laeufe liefern dieselbe Reihenfolge",
    (await lage.loadRankedVorgaenge(mkStorage(rowsLegacy), null, {}, "mdb-a")).map((k) => k.id).join(",")
    === rankedLegacy.map((k) => k.id).join(","));
  const legacyMitErklaerung = rankedLegacy.find((k) => k.id === "ko-2");
  check("C9 Legacy-Zeile mit Merkmalstreffer bekommt eine Erklaerung (unabhaengig von der Position)",
    legacyMitErklaerung && legacyMitErklaerung.relevanz_erklaerung
    && legacyMitErklaerung.relevanz_erklaerung.satz === "Betrifft deine Partei SPD.");

  // Fallbackpfade ohne gespeichertes Matching.
  const leerStorage = { listKnowledgeObjects: async () => kos, listMatchingResults: async () => [] };
  const rankedFallback = await lage.loadRankedVorgaenge(leerStorage, null, {}, "mdb-a");
  check("C10 Recency-Fallback liefert Vorgaenge OHNE Erklaerung",
    rankedFallback.length === 3 && rankedFallback.every((k) => !("relevanz_erklaerung" in k)));
  const rankedOffline = await lage.loadRankedVorgaenge(
    leerStorage,
    () => [{ knowledge_object_id: "ko-3" }, { knowledge_object_id: "ko-1" }],
    {}, "mdb-a"
  );
  // Gleiche Begruendung wie bei C8: geprueft wird die MENGE und die Determiniertheit,
  // nicht mehr die Reihenfolge, in der der Offline-Matcher die Zeilen zurueckgibt.
  check("C11 Offline-Matching-Fallback liefert dieselbe MENGE und keine Erklaerung",
    rankedOffline.length === 2
    && new Set(rankedOffline.map((k) => k.id)).size === 2
    && rankedOffline.every((k) => ["ko-1", "ko-3"].includes(k.id))
    && rankedOffline.every((k) => !("relevanz_erklaerung" in k)),
    rankedOffline.map((k) => k.id).join(","));
  check("C11b Auch dieser Pfad ist deterministisch geordnet",
    rankedOffline.map((k) => k.id).join(",") === "ko-1,ko-3",
    rankedOffline.map((k) => k.id).join(","));

  // Ordnung wieder auf den Ausgangszustand — kein Test darf die Umgebung veraendert
  // zuruecklassen (die Mandantentrennung unten haengt nicht an der Reihenfolge).
  if (relVorher == null) delete process.env.HELMUT_RELEVANZORDNUNG;
  else process.env.HELMUT_RELEVANZORDNUNG = relVorher;

  // Mandantentrennung: Erklaerung entsteht ausschliesslich aus den Zeilen, die
  // der mandantengefilterte Lesepfad geliefert hat.
  const tenantStorage = {
    listKnowledgeObjects: async () => kos,
    // Bewusst zwei klar unterscheidbare Werte ohne gemeinsames Teilwort.
    listMatchingResults: async ({ userId }) => (userId === "mdb-a"
      ? [{ knowledge_object_id: "ko-1", aktuell: true, signale: { ausschuss: ["Verkehr"] }, begruendung: "Betrifft deinen Ausschuss Verkehr." }]
      : [{ knowledge_object_id: "ko-2", aktuell: true, signale: { ausschuss: ["Gesundheit"] }, begruendung: "Betrifft deinen Ausschuss Gesundheit." }])
  };
  const jsonA = JSON.stringify(await lage.loadRankedVorgaenge(tenantStorage, null, {}, "mdb-a"));
  const jsonB = JSON.stringify(await lage.loadRankedVorgaenge(tenantStorage, null, {}, "mdb-b"));
  check("C12 Mandant A sieht ausschliesslich die eigene Erklaerung",
    jsonA.includes("Verkehr") && !jsonA.includes("Gesundheit"));
  check("C13 Mandant B sieht ausschliesslich die eigene Erklaerung",
    jsonB.includes("Gesundheit") && !jsonB.includes("Verkehr"));

  // ── D · Oberflaeche ───────────────────────────────────────────────────────
  console.log("\n== D · Oberflaeche (client.js) ==");
  const ui = loadClient();

  const html = ui.relevanz({
    relevanz: {
      satz: "Betrifft deinen Ausschuss Arbeit und Soziales und deinen Schwerpunkt Rente.",
      belege: [{ art: "ausschuss", text: "Dein Ausschuss: Arbeit und Soziales" }, { art: "thema", text: "Dein Schwerpunkt: Rente" }]
    }
  });
  check("D1 Abschnitt traegt die Ueberschrift 'Warum für dich relevant?'",
    html.includes("Warum für dich relevant?"));
  check("D2 Hauptsatz ist sichtbar (Ebene 1)",
    html.includes("Betrifft deinen Ausschuss Arbeit und Soziales"));
  check("D3 Belege liegen in einer aufklappbaren zweiten Ebene",
    /<details class="vsheet-belege">/.test(html) && html.includes("<summary>Belege ansehen</summary>")
    && !/<details[^>]*\sopen/.test(html));
  check("D4 beide Belege werden als Listeneintraege gerendert",
    (html.match(/<li>/g) || []).length === 2 && html.includes("Dein Schwerpunkt: Rente"));

  check("D5 ohne Erklaerung entfaellt der Abschnitt ERSATZLOS",
    ui.relevanz({ relevanz: null }) === "" && ui.relevanz({}) === ""
    && ui.relevanz({ relevanz: { satz: "", belege: [] } }) === ""
    && ui.relevanz({ relevanz: "kaputt" }) === "");
  check("D6 Satz ohne Belege rendert den Satz, aber kein leeres Aufklappen",
    (() => {
      const h = ui.relevanz({ relevanz: { satz: "Betrifft deinen Wahlkreis Berlin-Mitte.", belege: [] } });
      return h.includes("Berlin-Mitte") && !h.includes("<details");
    })());
  check("D7 defekte Belege werden verworfen statt gerendert",
    (() => {
      const h = ui.relevanz({ relevanz: { satz: "S.", belege: [null, { art: "x" }, "roh", { text: "Dein Wahlkreis: Mitte" }] } });
      return (h.match(/<li>/g) || []).length === 1 && h.includes("Dein Wahlkreis: Mitte");
    })());
  check("D8 Client begrenzt zusaetzlich auf vier Belege",
    (() => {
      const h = ui.relevanz({ relevanz: { satz: "S.", belege: Array.from({ length: 9 }, (_, i) => ({ text: `Beleg ${i}` })) } });
      return (h.match(/<li>/g) || []).length === 4;
    })());
  check("D9 HTML aus den Daten wird escaped (kein Markup-Durchgriff)",
    (() => {
      const h = ui.relevanz({ relevanz: { satz: '<img src=x onerror=alert(1)>', belege: [{ text: "<script>a</script>" }] } });
      return !h.includes("<img") && !h.includes("<script>") && h.includes("&lt;");
    })());

  // Der Renderer bekommt eine vollstaendige Ergebniszeile untergeschoben: selbst
  // dann darf kein technisches Feld sichtbar werden.
  const hTech = ui.relevanz({
    relevanz: { satz: "Betrifft deinen Ausschuss Verkehr.", belege: [{ text: "Dein Ausschuss: Verkehr" }] },
    run_id: "run-7ac3", similarity: 0.8123, rank: 3, eingabe_fingerabdruck: "be4670c6"
  });
  check("D10 technische Auditfelder erscheinen nicht im gerenderten HTML",
    ["run-7ac3", "0.8123", "be4670c6", "similarity", "rank"].every((v) => hTech.indexOf(v) < 0));

  // Vollstaendiges Sheet: Reihenfolge und Nichtvorhandensein im Alt-Fall.
  const sheetMit = ui.sheet({
    vorgangId: "v-1", title: "T", summary: { wasIstPassiert: "Kurz.", warumWichtig: "Allgemein wichtig." },
    relevanz: { satz: "Betrifft deinen Ausschuss Verkehr.", belege: [{ text: "Dein Ausschuss: Verkehr" }] }
  });
  check("D11 persoenliche Relevanz steht VOR 'Warum wichtig?'",
    sheetMit.indexOf("Warum für dich relevant?") > 0
    && sheetMit.indexOf("Warum für dich relevant?") < sheetMit.indexOf("Warum wichtig?"));
  const sheetOhne = ui.sheet({
    vorgangId: "v-1", title: "T", summary: { wasIstPassiert: "Kurz.", warumWichtig: "Allgemein wichtig." }, relevanz: null
  });
  check("D12 Alt-Vorgang ohne Erklaerung: Sheet unveraendert, kein leerer Abschnitt",
    !sheetOhne.includes("Warum für dich relevant?") && sheetOhne.includes("Warum wichtig?")
    && !sheetOhne.includes("vsheet-relevanz"));

  // Mobil: die zweite Ebene ist zugeklappt und per <summary> mit einem Daumen
  // bedienbar; der Hauptsatz ist ohne Interaktion lesbar.
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  check("D13 mobil: Belege sind zugeklappt, Hauptsatz ohne Interaktion sichtbar",
    !/<details[^>]*\sopen/.test(html) && html.indexOf("vsheet-relevanz") < html.indexOf("vsheet-belege"));
  check("D14 mobil: Aufklapper hat eine daumengerechte Trefferflaeche",
    /\.vsheet-belege > summary \{[^}]*min-height:\s*32px/.test(css));
  check("D15 Stile nutzen bestehende Design-Tokens (keine neue Farbwelt)",
    /\.vsheet-relevanz \{[^}]*var\(--text\)/.test(css) && /\.vsheet-belege li \{[^}]*var\(--muted\)/.test(css));
  check("D16 Tastaturbedienung sichtbar fokussierbar",
    /\.vsheet-belege > summary:focus-visible/.test(css));

  // ── E · Nichtregression ───────────────────────────────────────────────────
  console.log("\n== E · Nichtregression ==");
  const modul = fs.readFileSync(path.join(root, "lib/helmut/matching-erklaerung.js"), "utf8");
  check("E1 Erklaerungsmodul enthaelt keinen KI-/Netz-/DB-Aufruf",
    !/require\(["'](?:\.\/ai|\.\/storage|https?|node-fetch)/.test(modul)
    && !/\bfetch\s*\(/.test(modul) && !/generate[A-Z]/.test(modul));
  check("E2 Erklaerungsmodul ist frei von Zufall und Zeit",
    !/Math\.random|Date\.now|new Date\(/.test(modul));
  check("E3 keine Embedding-Nutzung im neuen Pfad",
    !/embedding/i.test(modul));
  const lageSrc = fs.readFileSync(path.join(root, "lib/helmut/lage.js"), "utf8");
  check("E4 lage.js ruft im Rankingpfad keine zusaetzliche KI/DB auf",
    (lageSrc.match(/matchingErklaerung\.erklaerungAusErgebnis/g) || []).length === 1);
  check("E5 Scores/Raenge/matched_features bleiben unberuehrt",
    !/similarity\s*=|rank\s*=|matched_features\s*=/.test(modul));
  const migrations = fs.readdirSync(path.join(root, "supabase/migrations"));
  check("E6 keine neue Migration in diesem Sprint",
    !migrations.some((f) => f.startsWith("20260729")));

  console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });

// ── Client-Loader (echte Renderer aus client.js im vm-Kontext) ───────────────
function loadClient() {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__erklaerungUi = {
    relevanz: (v) => vsheetRelevanzHtml(v),
    sheet: (v) => vsheetContentHtml(v)
  };`;
  const noop = () => {};
  const fakeNode = () => ({
    classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
    style: {}, dataset: {}, addEventListener: noop, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [], appendChild: noop,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    focus: noop, blur: noop, click: noop, closest: () => null, contains: () => false,
    insertAdjacentHTML: noop, scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0 }),
    set innerHTML(_v) {}, get innerHTML() { return ""; }, textContent: "", value: "", offsetParent: null
  });
  const store = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  const doc = {
    querySelector: () => fakeNode(), querySelectorAll: () => [], getElementById: () => fakeNode(),
    createElement: () => fakeNode(), createDocumentFragment: () => fakeNode(),
    body: fakeNode(), documentElement: fakeNode(), addEventListener: noop, removeEventListener: noop,
    cookie: "", visibilityState: "visible", hidden: false
  };
  const sandbox = {
    console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, URL, URLSearchParams,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop, queueMicrotask: (f) => Promise.resolve().then(f),
    document: doc,
    navigator: { userAgent: "node-test", serviceWorker: undefined, language: "de-DE", onLine: true, sendBeacon: noop },
    localStorage: store, sessionStorage: store,
    location: { search: "", href: "http://localhost/", pathname: "/", hash: "", origin: "http://localhost" },
    // Mobiler Viewport: kurzer Bildschirm, damit die Karten-/Sheet-Pfade die
    // mobilen Zeichenbudgets verwenden.
    innerWidth: 390, innerHeight: 640,
    matchMedia: () => ({ matches: true, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
    fetch: () => Promise.reject(new Error("no-net-in-test")),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    performance: { now: () => 0 },
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64")
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  sandbox.window.addEventListener = noop; sandbox.window.removeEventListener = noop; sandbox.window.scrollTo = noop;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "client.js" });
  if (!sandbox.__erklaerungUi) throw new Error("Test-Hook nicht gesetzt — client.js Boot fehlgeschlagen");
  return sandbox.__erklaerungUi;
}
