"use strict";

// Helmut — VERTRAG DER SCHEMA-/DSGVO-DIAGNOSE (BLOCKER 1, 2026-09-24).
// =============================================================================================
// WOZU. Der vierte lokale Fehler des scharfen 169er Laufs (`vg-verzögerung-20230613-95c80f`)
// endete als `skipped-invalid` mit `reason = validierung-fehlgeschlagen` und
// `validierungsfehler = []`. Die leere Liste ist deterministisch erklaerbar: dann gab
// AUSSCHLIESSLICH eine Schema-/DSGVO-Meldung den Ausschlag. Der konkrete Feldweg ist aus den
// vorhandenen Belegen NICHT rekonstruierbar (die rohe Modellantwort wird bewusst nicht
// gespeichert) und wird hier NICHT erfunden.
//
// Deshalb prueft diese Suite stattdessen den ganzen generischen Fehlerbereich VOLLSTAENDIG:
//   1. Welche Schema-/DSGVO-Fehler koennen nach der heutigen Sanitisierung ueberhaupt entstehen?
//   2. Welche davon waeren deterministisch korrigierbar, ohne eine Aussage zu erfinden oder zu
//      verkuerzen?
//   3. Welche MUESSEN fail closed bleiben? (Grundlage: docs/betrieb/prosa-textgrenzen-2026-09-19.md,
//      abgenommen in PR453/PR454 — ein ueberlanger Kerntext wird sichtbar abgewiesen und niemals
//      in eine kuerzere Tatsachenbehauptung umgewandelt.)
//   4. Liefert die wertfreie Diagnose brauchbare, ROHWERTFREIE Codes?
//
// REINE OFFLINE-LOGIK, kein Netz, keine KI, keine DB. Nur gezielte Faelle.
// Aufruf:  node scripts/lokal.js -- node scripts/understanding-schema-diagnose-test.js

const assert = require("node:assert/strict");
const U = require("../lib/helmut/understanding");
const S = require("../lib/helmut/understanding-schema");

let pass = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log("  PASS  " + name); }
  else { console.log("  FAIL  " + name + (detail ? " — " + detail : "")); process.exitCode = 1; }
}
function abschnitt(t) { console.log("\n== " + t + " =="); }

const VORGANG = "vg-schema-diagnose";
const CLUSTER = { documents: [] };
// Schema-gueltige Grundantwort: alle Pflichtprosa nicht leer, alles optionale fehlt.
const BASIS = {
  was_ist_passiert: "Ein Vorgang wird beschrieben.",
  warum_wichtig: "Politische Bedeutung des Vorgangs.",
  wer_ist_betroffen: "Beteiligte Akteure.",
  handlungsempfehlung: "Keine Handlung aus den gelieferten Quellen ableitbar.",
  zeitdruck: "mittel", confidence_score: 70
};
function ko(aiResult) { return U.assembleKnowledgeObject({ ...BASIS, ...aiResult }, CLUSTER, VORGANG, {}); }

// ── Die BEKANNTEN Klassen. Jede andere Meldung ist ein Befund, kein Rauschen. ────────────────
const BEKANNTE_KLASSEN = [
  /^[A-Za-z_][A-Za-z0-9_]*(\[\d+\])?(\.[A-Za-z_][A-Za-z0-9_]*(\[\d+\])?)*: leer\/zu kurz$/,
  /^DSGVO: E-Mail-Muster in /,
  /^DSGVO: verbotenes PII-Feld /,
  /^DSGVO: [A-Za-z_][A-Za-z0-9_]*-Eintrag zu lang /
];
function nurBekannteKlassen(errors) {
  return (errors || []).every((e) => BEKANNTE_KLASSEN.some((r) => r.test(String(e))));
}

async function main() {
  console.log("Helmut — Vertrag der Schema-/DSGVO-Diagnose (offline)");

  abschnitt("0 · Falsche Texttypen werden keine scheinbar gueltigen Inhalte");
  {
    const k = ko({ mentioned_locations: [{ name: "Europa" }, 42, true, ["Berlin"], null, "EU"],
      display_summary: { text: "Nicht als Text geliefert" }, why_relevant: 123,
      recommended_communication: ["Unbestaetigte Kommunikation"] });
    check("0.1 Ortsliste enthaelt nur den gelieferten Text EU",
      JSON.stringify(k.mentioned_locations) === JSON.stringify(["EU"]));
    check("0.2 keine erfundene Objektgeografie in der Klassifikation",
      k.mentioned_geographies.length === 1 && k.mentioned_geographies[0].name === "EU");
    check("0.3 ungueltige optionale Texte bleiben leer",
      k.display_summary === "" && k.why_relevant === "" && k.recommended_communication === "");
    for (const value of [{ text: "Kein Text" }, ["Ein Satz"], 12345, true]) {
      check("0.4 Pflichtprosa mit falschem Typ wird abgelehnt",
        S.validateKnowledgeObject(ko({ was_ist_passiert: value })).valid === false);
    }
    const a = ko({ action_items_struct: [
      { title: "Nicht freigeben", description: { bedingung: "nur nach Beschluss" } },
      { title: "Nicht freigeben", dueHint: ["erst morgen"] },
      { title: "Quellen lesen", description: "Vor einer Entscheidung die Quelle lesen.", dueHint: "" }
    ] });
    check("0.5 Handlung mit unlesbarer Voraussetzung wird vollstaendig verworfen",
      a.action_items_struct.length === 1 && a.action_items_struct[0].title === "Quellen lesen"
      && a.action_items_struct[0].description === "Vor einer Entscheidung die Quelle lesen.");
    check("0.6 gueltige Texte einschliesslich Verneinung bleiben vollstaendig erhalten",
      ko({ was_ist_passiert: "Der Rat hat den Antrag nicht beschlossen." }).was_ist_passiert
        === "Der Rat hat den Antrag nicht beschlossen.");
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  abschnitt("1 · Die Sanitisierung macht jeden ANGREIFBAREN Wert schema-gueltig");
  // Werte, die das Modell plausibel falsch liefern kann: falsche Typen, falsche Enums, zu lange
  // optionale Texte, kaputte Listen/Strukturen. Nach `assembleKnowledgeObject` darf KEIN
  // Schema-Fehler entstehen — sonst waere der Sanitizer selbst die Luecke.
  {
    const faelle = [
      ["optionale Prosa als Zahl/Objekt/Array/null", { display_summary: 5, why_relevant: {}, recommendation: [], risk_of_no_action: null }],
      ["optionale Prosa ueber der Grenze", { display_summary: "x".repeat(400), why_relevant: "y".repeat(300), recommendation: "z".repeat(300) }],
      ["display_title als Fragment/zu lang", { display_title: "Es geht um " + "w".repeat(200) }],
      ["display_category zu lang", { display_category: "Ein sehr langer Kategoriename fuer die Anzeige" }],
      ["Enums ungueltig", { zeitdruck: "quatsch", risk_level: "riesig", opportunity_level: 7,
        recommended_communication_struct: { recommendedChannel: "brief", recommendedFormat: "pdf" },
        action_items_struct: [{ title: "Schritt", description: "", dueHint: "", priority: "sofort", actionType: "telefonieren" }] }],
      ["Listen als Nicht-Array", { parteien: "kein-array", ausschuesse: 3, ministerien: null, mentioned_people: {}, mentioned_parties: "x" }],
      ["Listeneintraege mit falschem Typ / E-Mail / Leerraum", {
        mentioned_people: [42, true, null, {}, "  ", "a@b.de", "Gueltiger Name"],
        mentioned_organizations: ["a@b.de"] }],
      ["Erwaehnungseintrag ueber der Erwaehnungsgrenze", { mentioned_committees: ["q".repeat(200)] }],
      ["action_items als Nicht-Array", { action_items: "kein-array" }],
      ["leere optionale Felder", { headline: "", display_title: "", display_summary: "" }]
    ];
    for (const [name, ai] of faelle) {
      const res = S.validateKnowledgeObject(ko(ai));
      check(`1.x ${name} => schema-gueltig`, res.valid === true, JSON.stringify(res.errors));
    }
    // Gegenprobe der Grenze: ein Erwaehnungseintrag wird NIE laenger als erlaubt gespeichert.
    const langerEintrag = ko({ mentioned_committees: ["q".repeat(200)] });
    check("1.y Erwaehnungseintrag wird auf die Erwaehnungsgrenze begrenzt oder verworfen",
      langerEintrag.mentioned_committees.every((e) => String(e).length <= S.MENTION_MAX_LEN),
      JSON.stringify(langerEintrag.mentioned_committees));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  abschnitt("2 · Welche Fehler koennen nach der Sanitisierung REAL noch entstehen?");
  // Erwartung (und Ergebnis dieses Nachweises): genau zweie — (a) eine Pflichtprosa bleibt leer
  // (fehlend ODER ueber 800 Zeichen und deshalb bewusst NICHT gekuerzt), (b) ein DSGVO-Treffer
  // (E-Mail-Muster). Beides wird gegen die reale Assemblierung gemessen, nicht behauptet.
  const beobachtet = [];
  {
    const faelle = [
      ["Pflichtprosa fehlt: was_ist_passiert", { was_ist_passiert: "" }],
      ["Pflichtprosa fehlt: warum_wichtig", { warum_wichtig: undefined }],
      ["Pflichtprosa fehlt: wer_ist_betroffen", { wer_ist_betroffen: "   " }],
      ["Pflichtprosa fehlt: handlungsempfehlung", { handlungsempfehlung: null }],
      ["Pflichtprosa ueberlang (801 Zeichen)", { warum_wichtig: "s".repeat(801) }],
      ["DSGVO E-Mail-Muster in der Pflichtprosa", { was_ist_passiert: "Kontakt: pressestelle@example.org bittet um Rueckmeldung." }],
      ["DSGVO E-Mail-Muster in optionaler Prosa", { why_relevant: "Rueckfragen an buero@example.org sind moeglich." }]
    ];
    for (const [name, ai] of faelle) {
      const res = S.validateKnowledgeObject(ko(ai));
      beobachtet.push({ name, errors: res.errors, valid: res.valid });
      check(`2.x ${name} => abgelehnt`, res.valid === false, JSON.stringify(res.errors));
    }
    const alleFehler = beobachtet.flatMap((b) => b.errors);
    check("2.y ALLE real entstehenden Meldungen gehoeren zu den bekannten Klassen",
      nurBekannteKlassen(alleFehler), JSON.stringify(alleFehler));
    const klassen = new Set(alleFehler.map((e) => (/^DSGVO/.test(e) ? "dsgvo" : "pflichtprosa-leer")));
    check("2.z genau zwei reale Fehlerklassen (Pflichtprosa leer, DSGVO)",
      [...klassen].sort().join(",") === "dsgvo,pflichtprosa-leer", [...klassen].join(","));
    // Gegenprobe der Asymmetrie: in ERWAEHNUNGSLISTEN wird ein Eintrag mit Kontaktdaten vom
    // bestehenden Sanitizer ENTFERNT (kein Fehler). In PROSA bleibt die DSGVO-Pruefung laut und
    // weist ab — sie ist ein SICHERHEITSRiegel, kein stiller Filter.
    const listenFall = ko({ mentioned_organizations: ["buero@example.org"] });
    check("2.6 E-Mail in einer Liste wird entfernt und erzeugt keinen Fehler",
      S.validateKnowledgeObject(listenFall).valid === true
      && !JSON.stringify(listenFall).includes("buero@example.org"));
    check("2.7 E-Mail in der Prosa wird dagegen laut abgewiesen (Sicherheitsriegel bleibt scharf)",
      S.validateKnowledgeObject(ko({ why_relevant: "a@b.de" })).errors.some((e) => /^DSGVO: E-Mail-Muster/.test(e)));
  }
  // Nicht erreichbar (deshalb KEINE Verhaltensaenderung, sondern Diagnose-Codes):
  {
    const k = ko({});
    const verboteneSchluessel = Object.keys(k).filter((key) => {
      const low = key.toLowerCase();
      return S.FORBIDDEN_PII_KEYS.some((f) => low.includes(f));
    });
    check("2.4 Kein verbotenes PII-Feld entsteht (die Schluessel kommen aus unserem Assembler)",
      verboteneSchluessel.length === 0, verboteneSchluessel.join(","));
    const mitLangerErwaehnung = ko({ mentioned_people: ["q".repeat(300)] });
    check("2.5 Der Zweig 'Erwaehnungseintrag zu lang' ist strukturell unerreichbar",
      S.validateKnowledgeObject(mitLangerErwaehnung).valid === true
      && mitLangerErwaehnung.mentioned_people.every((e) => String(e).length <= S.MENTION_MAX_LEN));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  abschnitt("3 · Fail closed ist die einzige sichere Loesung — belegt, nicht behauptet");
  {
    // (a) Es wird NICHTS erfunden: eine fehlende Pflichtprosa bleibt leer.
    check("3.1 Fehlende Pflichtprosa wird NICHT mit einem Ersatztext gefuellt",
      ko({ was_ist_passiert: "" }).was_ist_passiert === "");
    check("3.2 Fehlende Pflichtprosa wird auch nicht aus anderen Feldern abgeleitet",
      ko({ was_ist_passiert: "", headline: "Schlagzeile", display_summary: "Zusammenfassung" }).was_ist_passiert === "");
    // (b) Es wird NICHTS verkuerzt: der ueberlange Kerntext erscheint NICHT als kuerzere
    //     Tatsachenbehauptung (Vertrag aus docs/betrieb/prosa-textgrenzen-2026-09-19.md).
    const lang = "Der Rat beschliesst die Satzung. ".repeat(40) + "Der Beschluss wird zurueckgenommen.";
    const kLang = ko({ warum_wichtig: lang });
    check("3.3 Ueberlange Pflichtprosa wird NICHT gekuerzt (kein Praefix als Tatsache)",
      kLang.warum_wichtig === "" && !kLang.warum_wichtig.includes("beschliesst"), String(kLang.warum_wichtig).slice(0, 40));
    check("3.4 Grenzwert exakt 800 bleibt unveraendert erhalten", ko({ warum_wichtig: "a".repeat(800) }).warum_wichtig.length === 800);
    check("3.5 Grenzwert 801 wird abgewiesen", S.validateKnowledgeObject(ko({ warum_wichtig: "a".repeat(801) })).valid === false);
    // (c) Die Ablehnung ist SICHTBAR und wertfrei benannt (siehe Abschnitt 4).
    // (d) Ein stilles Entfernen waere nur fuer die DSGVO-Klasse denkbar — es wuerde aber den
    //     Sicherheitsalarm abschalten und die Modellaussage veraendern. Sie bleibt deshalb laut
    //     und fail closed (Abschnitt 2.6/2.7 belegt die Asymmetrie).
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  abschnitt("4 · Die wertfreie Diagnose liefert brauchbare Codes — ohne jeden Rohwert");
  {
    const ROH = "GEHEIMWERT-XY";
    const faelle = [
      ["was_ist_passiert: leer/zu kurz", "schema-leer:was_ist_passiert"],
      ["zeitdruck: '" + ROH + "' nicht in {hoch, mittel}", "schema-enum:zeitdruck"],
      ["display_summary: zu lang (400 > 320)", "schema-zu-lang:display_summary"],
      ["geography_id: null nicht erlaubt (nicht als nullable deklariert)", "schema-null:geography_id"],
      ["action_items_struct[0].priority: erwartet string, ist number", "schema-typ:action_items_struct.priority"],
      ["Pflichtfeld fehlt: status", "schema-pflichtfeld:status"],
      ["knowledge_object ist kein Objekt", "schema-objekt"],
      ["DSGVO: E-Mail-Muster in ko.was_ist_passiert", "dsgvo-emailmuster:ko.was_ist_passiert"],
      ["DSGVO: verbotenes PII-Feld 'kontakt'", "dsgvo-pii-feld"],
      // Reviewpunkt: der Feldname kommt aus UNSERER festen Erwaehnungsliste — kein 'unbekannt'.
      ["DSGVO: mentioned_people-Eintrag zu lang (140) — Erwaehnung, kein Dossier", "dsgvo-eintrag-zu-lang:mentioned_people"],
      ["etwas ganz anderes", "schema-fehler:etwas"]
    ];
    for (const [meldung, erwartet] of faelle) {
      const codes = S.sichereSchemaFehler([meldung]);
      check(`4.x ${JSON.stringify(meldung).slice(0, 52)} => ${erwartet}`,
        codes.length === 1 && codes[0] === erwartet, JSON.stringify(codes));
    }
    const alle = S.sichereSchemaFehler(faelle.map((f) => f[0]));
    check("4.y kein Rohwert in irgendeinem Code", !alle.some((c) => c.includes(ROH)), JSON.stringify(alle));
    check("4.z Reihenfolge stabil und Duplikate entfernt",
      JSON.stringify(S.sichereSchemaFehler(["a: leer/zu kurz", "a: leer/zu kurz", "b: leer/zu kurz"]))
      === JSON.stringify(["schema-leer:a", "schema-leer:b"]));
    // Die reale Kette: derselbe Fehler erscheint wertfrei am Validierungsergebnis und wird vom
    // Bedienweg akzeptiert (sichere Liste).
    const E = require("../lib/helmut/verstehen-einzelvorgang");
    for (const code of ["schema-leer:was_ist_passiert", "dsgvo-emailmuster:ko.was_ist_passiert",
      "dsgvo-pii-feld", "dsgvo-eintrag-zu-lang:mentioned_people"]) {
      check(`4.w ${code} wird als sicherer Code akzeptiert`, E.SICHERE_VALIDIERUNGSFEHLER.test(code));
    }
    check("4.v rohe Schema-Meldung wird NICHT als sicherer Code akzeptiert",
      !E.SICHERE_VALIDIERUNGSFEHLER.test("zeitdruck: '" + ROH + "' nicht in {hoch}"));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  abschnitt("5 · Die reale Kette: der Bericht traegt genau den wertfreien Code");
  {
    const res = await U.evaluateUnderstandingCase({ name: "schema-kette", raw_documents: [{
      id: "rd-schema", title: "Ein Vorgang wird beschrieben", summary: "Ein Vorgang wird beschrieben.",
      url: "https://example.org/schema", published_at: "2026-09-01T00:00:00Z" }] },
    async () => ({ ...BASIS, was_ist_passiert: "", parteien: [], ausschuesse: [], ministerien: [],
      risiken: [], chancen: [], mentioned_people: [], mentioned_mps: [], mentioned_parties: [],
      mentioned_committees: [], mentioned_ministries: [], mentioned_locations: [], mentioned_organizations: [] }));
    check("5.1 der Auswerter weist die unvollstaendige Antwort ab", res.valid === false, JSON.stringify(res.errors));
    check("5.2 die Abweisung ist eine Pflichtprosa-Klasse",
      Array.isArray(res.errors) && res.errors.some((e) => /leer\/zu kurz$/.test(String(e))), JSON.stringify(res.errors));
    const codes = S.sichereSchemaFehler(res.errors);
    check("5.3 der wertfreie Code benennt den Feldpfad", codes.includes("schema-leer:was_ist_passiert"), JSON.stringify(codes));
    check("5.4 kein Rohtext der Meldung im Code", !codes.some((c) => c.includes("leer/zu kurz")));
  }

  console.log(`\n${pass} Pruefungen erfolgreich.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
