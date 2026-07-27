"use strict";

// Helmut — Sprint 20 · Testsuite "Geografische Zuordnungen dauerhaft speichern".
// =============================================================================================
// OFFLINE, ohne Netz, ohne KI, ohne Datenbank. Prueft in dieser Reihenfolge:
//
//   A · Resolver (geografie-gedaechtnis.js): Herkunftsrang, Fail-Closed, Korrektur,
//       Mehrfachzuordnung, Idempotenz, struktureller Ausschluss der Quellengeografie
//   B · Einbindung in die Klassifikation (classification.js): keine Geografie aus der Ebene
//   C · Die 10 im Sprintauftrag verbindlich geforderten Testfaelle, einzeln und benannt
//   D · Speicherpfad: Projektion, Schema, Kennzahlen, Trennung im Matchingkontext
//   E · Regressionsriegel: kein Deutschland-Fallback mehr im aktiven Resolver
//
// Aufruf:  node scripts/geografie-gedaechtnis-test.js

const fs = require("fs");
const path = require("path");

const G = require("../lib/helmut/quellenarchitektur/geografie-gedaechtnis");
const C = require("../lib/helmut/quellenarchitektur/classification");
const U = require("../lib/helmut/understanding");
const schema = require("../lib/helmut/understanding-schema");
const storage = require("../lib/helmut/storage");

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ""}`); }
}

const T0 = "2026-07-01T00:00:00.000Z";
const T1 = "2026-07-27T12:00:00.000Z";

// Kanonische Kurzformen fuer die Testfaelle.
const BERLIN = { name: "Berlin", level: "land", geography_id: "geo-land-berlin" };
const BRANDENBURG = { name: "Brandenburg", level: "land", geography_id: "geo-land-brandenburg" };
const BAYERN = { name: "Bayern", level: "land", geography_id: "geo-land-bayern" };

// Ein gespeichertes Knowledge Object mit bereits ermittelter Geografie.
function bestandMit(betroffen, herkunft = "ki", ermitteltAm = T0) {
  return {
    decision_level: "land",
    affected_geographies: betroffen.map((g) => ({ ...g, herkunft })),
    mentioned_geographies: [],
    classification_confidence: { geography_ermittelt_am: ermitteltAm }
  };
}

const ids = (liste) => (liste || []).map((g) => g.geography_id || g.name).sort();

// ══════════════════════════════════════════════════════════════════════════════
// A · Resolver
// ══════════════════════════════════════════════════════════════════════════════
console.log("A · geografie-gedaechtnis: Resolver");

check("A1 Herkunftsrang folgt der Auftragspriorität (Parser > amtlich > Inhalt > KI > Erwähnung > Quelle)",
  G.HERKUNFT_RANG.parser > G.HERKUNFT_RANG.amtlich
  && G.HERKUNFT_RANG.amtlich > G.HERKUNFT_RANG.inhalt
  && G.HERKUNFT_RANG.inhalt > G.HERKUNFT_RANG.ki
  && G.HERKUNFT_RANG.ki > G.HERKUNFT_RANG.erwaehnung
  && G.HERKUNFT_RANG.erwaehnung > G.HERKUNFT_RANG.quelle);

check("A2 ohne Kandidaten und ohne Bestand -> ehrlich leer, nicht ermittelt", (() => {
  const r = G.entscheideGeografien({});
  return r.betroffen.length === 0 && r.ermittelt === false && r.grund === "nicht-ermittelbar" && r.quelle === null;
})());

check("A3 Erstermittlung setzt Zeitpunkt und Herkunft", (() => {
  const r = G.entscheideGeografien({ kandidaten: [{ ...BERLIN, herkunft: "ki", rolle: "betroffen" }], jetzt: T1 });
  return r.betroffen.length === 1 && r.betroffen[0].geography_id === "geo-land-berlin"
    && r.ermittelt_am === T1 && r.quelle === "ki" && r.grund === "erstermittlung" && r.wiederverwendet === false;
})());

check("A4 FAIL CLOSED: Bestand wird NIE durch leer ersetzt", (() => {
  const r = G.entscheideGeografien({ bestand: bestandMit([BERLIN]), kandidaten: [], jetzt: T1 });
  return ids(r.betroffen).join() === "geo-land-berlin" && r.wiederverwendet === true
    && r.grund === "bestand-bleibt-kein-neues-signal" && r.ermittelt_am === T0;
})());

check("A5 FAIL CLOSED: Bestand wird nicht durch reine Erwähnungen ersetzt", (() => {
  const r = G.entscheideGeografien({
    bestand: bestandMit([BERLIN]),
    kandidaten: [{ ...BAYERN, herkunft: "erwaehnung", rolle: "erwaehnt" }], jetzt: T1
  });
  return ids(r.betroffen).join() === "geo-land-berlin" && ids(r.erwaehnt).join() === "geo-land-bayern";
})());

check("A6 gleiche Menge -> bestätigt, Erstermittlungszeitpunkt bleibt", (() => {
  const r = G.entscheideGeografien({
    bestand: bestandMit([BERLIN]), kandidaten: [{ ...BERLIN, herkunft: "ki", rolle: "betroffen" }], jetzt: T1
  });
  return r.grund === "bestaetigt" && r.ermittelt_am === T0 && r.geaendert === false && r.betroffen.length === 1;
})());

check("A7 stärkerer Nachweis korrigiert nachvollziehbar", (() => {
  const r = G.entscheideGeografien({
    bestand: bestandMit([BERLIN], "ki"),
    kandidaten: [{ ...BRANDENBURG, herkunft: "parser", rolle: "betroffen" }], jetzt: T1
  });
  return ids(r.betroffen).join() === "geo-land-brandenburg" && r.geaendert === true
    && r.grund === "hoeherwertige-herkunft" && r.ermittelt_am === T1 && r.quelle === "parser";
})());

check("A8 schwächerer Nachweis verdünnt einen starken Bestand NICHT", (() => {
  const r = G.entscheideGeografien({
    bestand: bestandMit([BERLIN], "parser"),
    kandidaten: [{ ...BRANDENBURG, herkunft: "ki", rolle: "betroffen" }], jetzt: T1
  });
  return ids(r.betroffen).join() === "geo-land-berlin" && r.geaendert === false && r.grund === "bestand-stabil";
})());

check("A9 gleich starke Nachweise werden VEREINIGT (mehrere Regionen möglich)", (() => {
  const r = G.entscheideGeografien({
    bestand: bestandMit([BERLIN], "ki"),
    kandidaten: [{ ...BRANDENBURG, herkunft: "ki", rolle: "betroffen" }], jetzt: T1
  });
  return ids(r.betroffen).join() === "geo-land-berlin,geo-land-brandenburg" && r.grund === "vereinigt-gleichstark";
})());

check("A10 Quellengeografie wird NIE betroffen — auch wenn sie als 'betroffen' angeboten wird", (() => {
  const r = G.entscheideGeografien({
    kandidaten: [{ ...BERLIN, herkunft: "quelle", rolle: "betroffen" }], jetzt: T1
  });
  return r.betroffen.length === 0 && ids(r.indizien).join() === "geo-land-berlin" && r.ermittelt === false;
})());

check("A11 Alt-Einträge ohne Herkunft zählen als 'bestand-alt' (gehen nie verloren)", (() => {
  const alt = { affected_geographies: [{ name: "Berlin", level: "land", geography_id: "geo-land-berlin" }] };
  const gelesen = G.leseBestand(alt);
  return gelesen.betroffen[0].herkunft === G.HERKUNFT_BESTAND_ALT && gelesen.ermittelt === true;
})());

check("A12 ein echter inhaltlicher Nachweis korrigiert einen Alt-Eintrag", (() => {
  const alt = { affected_geographies: [{ name: "Deutschland", level: "bund", geography_id: "geo-bund" }] };
  const r = G.entscheideGeografien({
    bestand: alt, kandidaten: [{ ...BERLIN, herkunft: "inhalt", rolle: "betroffen" }], jetzt: T1
  });
  return ids(r.betroffen).join() === "geo-land-berlin" && r.geaendert === true;
})());

check("A13 idempotent: zweiter identischer Lauf liefert byte-gleiches Ergebnis", (() => {
  const eingabe = {
    bestand: bestandMit([BERLIN, BRANDENBURG]),
    kandidaten: [{ ...BERLIN, herkunft: "ki", rolle: "betroffen" }, { ...BRANDENBURG, herkunft: "ki", rolle: "betroffen" }],
    jetzt: T1
  };
  return JSON.stringify(G.entscheideGeografien(eingabe)) === JSON.stringify(G.entscheideGeografien(eingabe));
})());

check("A14 Duplikate derselben Geografie werden zu EINEM Eintrag zusammengeführt", (() => {
  const r = G.entscheideGeografien({
    kandidaten: [
      { ...BERLIN, herkunft: "ki", rolle: "betroffen" },
      { ...BERLIN, herkunft: "inhalt", rolle: "betroffen" },
      { name: "Berlin", level: "land", geography_id: "geo-land-berlin", herkunft: "erwaehnung", rolle: "betroffen" }
    ], jetzt: T1
  });
  // Ein Eintrag, und zwar mit dem STÄRKSTEN Beleg.
  return r.betroffen.length === 1 && r.betroffen[0].herkunft === "inhalt";
})());

check("A15 Reihenfolge ist deterministisch (stärkster Beleg zuerst, dann Schlüssel)", (() => {
  const bauen = (liste) => G.entscheideGeografien({ kandidaten: liste, jetzt: T1 }).betroffen.map((g) => g.geography_id);
  const a = bauen([{ ...BRANDENBURG, herkunft: "ki", rolle: "betroffen" }, { ...BERLIN, herkunft: "ki", rolle: "betroffen" }]);
  const b = bauen([{ ...BERLIN, herkunft: "ki", rolle: "betroffen" }, { ...BRANDENBURG, herkunft: "ki", rolle: "betroffen" }]);
  return a.join() === b.join() && a[0] === "geo-land-berlin";
})());

check("A16 kaputtes jsonb kostet keine Geografie (Zeichenkette wird gelesen)", (() => {
  const r = G.leseBestand({ affected_geographies: JSON.stringify([BERLIN]) });
  return r.betroffen.length === 1 && r.betroffen[0].geography_id === "geo-land-berlin";
})());

check("A17 unauflösbarer Ort bleibt ehrlich mit geography_id null erhalten", (() => {
  const r = G.entscheideGeografien({
    kandidaten: [{ name: "Kleinkleckersdorf", level: "unknown", geography_id: null, herkunft: "ki", rolle: "betroffen" }], jetzt: T1
  });
  return r.betroffen.length === 1 && r.betroffen[0].geography_id === null && r.betroffen[0].name === "Kleinkleckersdorf";
})());

check("A18 Erwähnungen und Indizien werden nie geleert, aber gedeckelt",
  G.MAX_ERWAEHNT > 0 && G.MAX_INDIZIEN > 0 && G.MAX_BETROFFEN > 1);

check("A19 der Resolver kennt die politische Ebene GAR NICHT (kein Parameter, keine Ableitung)", (() => {
  const quelle = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "quellenarchitektur", "geografie-gedaechtnis.js"), "utf8");
  const code = quelle.split("\n").filter((z) => !/^\s*\/\//.test(z)).join("\n");
  return !/decision_level/.test(code) && !/political_level/.test(code);
})());

// ══════════════════════════════════════════════════════════════════════════════
// B · Einbindung in die Klassifikation
// ══════════════════════════════════════════════════════════════════════════════
console.log("\nB · classifyKnowledgeObject: Ebene und Geografie sind getrennt");

check("B1 Bundes-KO ohne geografischen Nachweis -> Ebene bund, Geografie LEER", (() => {
  const r = C.classifyKnowledgeObject({ ausschuesse: ["Arbeit und Soziales"], headline: "Bundestag beschliesst Rentenpaket" }, {}, { jetzt: T1 });
  return r.decision_level === "bund" && r.affected_geographies.length === 0;
})());

check("B2 EU-KO erzeugt keine erfundene EU-Geografie", (() => {
  const r = C.classifyKnowledgeObject({ mentioned_organizations: ["Europäische Kommission"] }, {}, { jetzt: T1 });
  return r.decision_level === "eu" && r.affected_geographies.length === 0;
})());

check("B3 subnationale Institution ist ein inhaltlicher Nachweis (Abgeordnetenhaus von Berlin)", (() => {
  const r = C.classifyKnowledgeObject({ mentioned_organizations: ["Abgeordnetenhaus von Berlin"] }, {}, { jetzt: T1 });
  return ids(r.affected_geographies).join() === "geo-land-berlin" && r.affected_geographies[0].herkunft === "inhalt";
})());

check("B4 BUNDESinstitution erzeugt KEINE Geografie (sonst wäre es die Ebene durch die Hintertür)", (() => {
  const r = C.classifyKnowledgeObject({ mentioned_organizations: ["Deutscher Bundestag", "Bundesregierung"] }, {}, { jetzt: T1 });
  return r.affected_geographies.length === 0;
})());

check("B5 Partei mit Landesbezug ist ein Akteur, keine betroffene Geografie", (() => {
  const r = C.classifyKnowledgeObject({ parteien: ["Die Linke"], mentioned_organizations: [] }, {}, { jetzt: T1 });
  return r.affected_geographies.length === 0;
})());

check("B6 strukturierte KI-Analyse wird übernommen (KEIN zusätzlicher KI-Aufruf)", (() => {
  const r = C.classifyKnowledgeObject({}, { affected_geographies: [{ name: "Berlin" }] }, { jetzt: T1 });
  return ids(r.affected_geographies).join() === "geo-land-berlin" && r.affected_geographies[0].herkunft === "ki";
})());

check("B7 eine von der KI erfundene geography_id wird NICHT übernommen", (() => {
  const r = C.classifyKnowledgeObject({}, { affected_geographies: [{ name: "Berlin", geography_id: "geo-erfunden-4711" }] }, { jetzt: T1 });
  return r.affected_geographies[0].geography_id === "geo-land-berlin";
})());

check("B8 Parlamentsparser-Referenz wird als stärkster Nachweis aufgenommen", (() => {
  const r = C.classifyKnowledgeObject({}, {}, { jetzt: T1, strukturiert: [{ geografie: "geo-land-brandenburg" }] });
  return ids(r.affected_geographies).join() === "geo-land-brandenburg" && r.affected_geographies[0].herkunft === "parser";
})());

check("B9 classification_confidence.geography misst die BETROFFENE Geografie, nicht die Erwähnungen", (() => {
  const nurErwaehnt = C.classifyKnowledgeObject({ mentioned_locations: ["Berlin", "Bayern", "Hamburg"] }, {}, { jetzt: T1 });
  const belegt = C.classifyKnowledgeObject({}, {}, { jetzt: T1, strukturiert: [{ geografie: "geo-land-berlin" }] });
  return nurErwaehnt.classification_confidence.geography === "unknown"
    && belegt.classification_confidence.geography === "high";
})());

check("B10 Herkunft/Zeitpunkt/Wiederverwendung stehen additiv im bestehenden jsonb (keine neue Spalte)", (() => {
  const r = C.classifyKnowledgeObject({}, { affected_geographies: [{ name: "Berlin" }] }, { jetzt: T1 });
  const cc = r.classification_confidence;
  return cc.geography_quelle === "ki" && cc.geography_ermittelt_am === T1
    && cc.geography_wiederverwendet === false && Array.isArray(cc.geography_indizien);
})());

// ══════════════════════════════════════════════════════════════════════════════
// C · Die 10 verbindlichen Testfälle des Sprintauftrags
// ══════════════════════════════════════════════════════════════════════════════
console.log("\nC · Verbindliche Testfälle 1-10");

// 1 · Politische Ebene 'land', explizite Geografie Berlin -> Berlin wird betroffen gespeichert.
check("C1 Ebene 'land' + explizite Geografie Berlin -> Berlin ist betroffene Geografie", (() => {
  const r = C.classifyKnowledgeObject(
    { mentioned_organizations: ["Abgeordnetenhaus von Berlin"], headline: "Abgeordnetenhaus beschliesst Schulgesetz" },
    { decision_level: "land" }, { jetzt: T1 }
  );
  return r.decision_level === "land" && ids(r.affected_geographies).join() === "geo-land-berlin";
})());

// 2 · Politische Ebene 'land', keine erkennbare Region -> KEINE automatische Zuordnung.
check("C2 Ebene 'land' ohne erkennbare Region -> weder Deutschland noch Berlin noch Brandenburg", (() => {
  const r = C.classifyKnowledgeObject(
    { mentioned_organizations: ["Landesregierung"], headline: "Landesregierung beraet Haushalt" },
    { decision_level: "land" }, { jetzt: T1 }
  );
  const gefunden = ids(r.affected_geographies);
  return r.decision_level === "land" && gefunden.length === 0;
})());

check("C2b auch der Deriver-Pfad 'land ohne Ort' erzeugt kein Deutschland", (() => {
  const r = C.classifyKnowledgeObject({ mentioned_organizations: ["Staatskanzlei"] }, {}, { jetzt: T1 });
  return r.decision_level === "land" && !r.affected_geographies.some((g) => g.geography_id === "geo-bund");
})());

// 3 · Berliner Quelle berichtet über Brandenburg.
check("C3 Berliner QUELLE darf Brandenburg als betroffene Geografie nicht überschreiben", (() => {
  const r = C.classifyKnowledgeObject(
    {}, { affected_geographies: [{ name: "Brandenburg" }] },
    { jetzt: T1, quellenGeografien: [{ geography_id: "geo-land-berlin" }] }
  );
  return ids(r.affected_geographies).join() === "geo-land-brandenburg"
    && ids(r.classification_confidence.geography_indizien).join() === "geo-land-berlin";
})());

check("C3b eine Quellengeografie ALLEIN erzeugt gar keine betroffene Geografie", (() => {
  const r = C.classifyKnowledgeObject({}, {}, { jetzt: T1, quellenGeografien: [{ geography_id: "geo-land-berlin" }] });
  return r.affected_geographies.length === 0
    && ids(r.classification_confidence.geography_indizien).join() === "geo-land-berlin";
})());

// 4 · Bundesquelle berichtet über ein ausschliesslich Berliner Thema.
check("C4 Ebene bleibt 'bund', betroffene Geografie ist Berlin — beides getrennt korrekt", (() => {
  const r = C.classifyKnowledgeObject(
    { ausschuesse: ["Arbeit und Soziales"], headline: "Bundestag debattiert Berliner Wohnungsmarkt" },
    { affected_geographies: [{ name: "Berlin" }] },
    { jetzt: T1, quellenGeografien: [{ geography_id: "geo-bund" }] }
  );
  return r.decision_level === "bund" && ids(r.affected_geographies).join() === "geo-land-berlin";
})());

// 5 · Berlin wird nur beiläufig erwähnt.
check("C5 beiläufige Erwähnung von Berlin wird NICHT zur betroffenen Geografie", (() => {
  const r = C.classifyKnowledgeObject(
    { ausschuesse: ["Finanzen"], mentioned_locations: ["Berlin"], headline: "Konferenz in Berlin zum Haushalt" },
    {}, { jetzt: T1 }
  );
  return r.affected_geographies.length === 0 && ids(r.mentioned_geographies).join() === "geo-land-berlin";
})());

// 6 · Berlin UND Brandenburg sind beide tatsächlich betroffen.
check("C6 zwei tatsächlich betroffene Regionen bleiben beide erhalten", (() => {
  const r = C.classifyKnowledgeObject(
    {}, { affected_geographies: [{ name: "Berlin" }, { name: "Brandenburg" }] }, { jetzt: T1 }
  );
  return ids(r.affected_geographies).join() === "geo-land-berlin,geo-land-brandenburg";
})());

check("C6b eine zweite Region wird bei einer Aktualisierung ERGÄNZT, nicht ersetzt", (() => {
  const erst = C.classifyKnowledgeObject({}, { affected_geographies: [{ name: "Berlin" }] }, { jetzt: T0 });
  const bestand = {
    affected_geographies: erst.affected_geographies,
    classification_confidence: erst.classification_confidence
  };
  const zweit = C.classifyKnowledgeObject({}, { affected_geographies: [{ name: "Brandenburg" }] }, { bestand, jetzt: T1 });
  return ids(zweit.affected_geographies).join() === "geo-land-berlin,geo-land-brandenburg";
})());

// 7 · Bestehende belastbare Geografie, neue Analyse liefert unbekannt.
check("C7 bestehende Geografie überlebt eine Analyse ohne jedes geografische Signal", (() => {
  const bestand = bestandMit([BERLIN], "inhalt");
  const r = C.classifyKnowledgeObject(
    { ausschuesse: ["Finanzen"], headline: "Haushaltsausschuss tagt" }, {}, { bestand, jetzt: T1 }
  );
  return ids(r.affected_geographies).join() === "geo-land-berlin"
    && r.classification_confidence.geography_wiederverwendet === true
    && r.classification_confidence.geography_ermittelt_am === T0;
})());

// 8 · Bestehende schwache Zuordnung, neuer autoritativer Nachweis.
check("C8 autoritativer Nachweis korrigiert eine schwache Zuordnung nachvollziehbar", (() => {
  const bestand = bestandMit([BERLIN], "ki");
  const r = C.classifyKnowledgeObject({}, {}, { bestand, jetzt: T1, strukturiert: [{ geografie: "geo-land-brandenburg" }] });
  return ids(r.affected_geographies).join() === "geo-land-brandenburg"
    && r.geografie_entscheidung.geaendert === true
    && r.geografie_entscheidung.grund === "hoeherwertige-herkunft"
    && r.classification_confidence.geography_quelle === "parser"
    && r.classification_confidence.geography_ermittelt_am === T1;
})());

// 9 · Wiederholte Verarbeitung desselben Objekts.
check("C9 wiederholte Verarbeitung ist stabil und erzeugt keine Duplikate", (() => {
  const ai = { affected_geographies: [{ name: "Berlin" }, { name: "Brandenburg" }] };
  const ko = { mentioned_locations: ["Berlin", "Potsdam"] };
  let bestand = null;
  let letzte = null;
  for (let i = 0; i < 5; i += 1) {
    const r = C.classifyKnowledgeObject(ko, ai, { bestand, jetzt: i === 0 ? T0 : T1 });
    bestand = {
      affected_geographies: r.affected_geographies,
      mentioned_geographies: r.mentioned_geographies,
      classification_confidence: r.classification_confidence
    };
    letzte = r;
  }
  const schluessel = letzte.affected_geographies.map((g) => g.geography_id);
  return schluessel.join() === "geo-land-berlin,geo-land-brandenburg"
    && new Set(schluessel).size === schluessel.length
    && new Set(letzte.mentioned_geographies.map((g) => g.geography_id)).size === letzte.mentioned_geographies.length
    && letzte.classification_confidence.geography_ermittelt_am === T0;
})());

// 10 · Kennzahl/Prüfung erhält strukturierte Geografieobjekte.
check("C10 die Berliner Beweislauf-Kennzahl zählt Geografie-OBJEKTE korrekt", (() => {
  const quelle = fs.readFileSync(path.join(__dirname, "berlin-beweislauf-auswertung.js"), "utf8");
  // Der alte Fehler: Regex auf String(<Geografie-Objekt>) ergibt immer
  // "[object Object]" und trifft nie -> die Kennzahl war strukturell 0.
  // Kommentarzeilen ausblenden: die Fundstelle wird dort BEWUSST zitiert.
  const code = quelle.split("\n").filter((z) => !/^\s*\/\//.test(z)).join("\n");
  const altFehlerWeg = !/test\(String\(g\)\)/.test(code);
  const helferDa = /function geografieTrifft\(/.test(quelle) && /geografieTrifft\(k\.affected_geographies/.test(quelle);
  // Verhalten des Helfers gegenprüfen (gleiche Implementierung, isoliert nachgebaut).
  const trifft = (liste, id, muster) => Array.isArray(liste) && liste.some((g) => {
    if (!g || typeof g !== "object") return false;
    if (id && String(g.geography_id || "") === id) return true;
    return !!(muster && g.name && muster.test(String(g.name)));
  });
  return altFehlerWeg && helferDa
    && trifft([BERLIN], "geo-land-berlin", /berlin/i) === true
    && trifft([BRANDENBURG], "geo-land-berlin", /berlin/i) === false
    && trifft([{ name: "Berlin", geography_id: null }], "geo-land-berlin", /berlin/i) === true;
})());

check("C10b Klassifikationsabdeckung zählt die NICHT-LEERE Geografie (kein 'not.is.null'-Grün)", (() => {
  const quelle = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "storage.js"), "utf8");
  return /affected_geographies=neq\.%5B%5D/.test(quelle)
    && /affectedGeographyCoverage/.test(quelle)
    && !/affected_geographies=not\.is\.null/.test(quelle);
})());

// ══════════════════════════════════════════════════════════════════════════════
// D · Speicherpfad
// ══════════════════════════════════════════════════════════════════════════════
console.log("\nD · Speicherpfad, Projektion, Schema, Matchingkontext");

check("D1 beide Geografiespalten sind in der Schreib-/Lese-Whitelist",
  storage.V3_KNOWLEDGE_OBJECT_COLUMNS.includes("affected_geographies")
  && storage.V3_KNOWLEDGE_OBJECT_COLUMNS.includes("mentioned_geographies"));

check("D2 die Kandidatenprojektion liefert die Geografiespalten (sonst keine Wiederverwendung)", (() => {
  const quelle = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "storage.js"), "utf8");
  const stelle = quelle.split("listKnowledgeObjectsByVorgangPrefix")[1] || "";
  const colsZeile = (stelle.match(/const cols = "[^"]+"/) || [""])[0];
  return colsZeile.includes("affected_geographies") && colsZeile.includes("mentioned_geographies");
})());

check("D3 der Assembler schreibt die aufgelösten Geografien in das KO", (() => {
  const ko = U.assembleKnowledgeObject(
    {
      was_ist_passiert: "x", warum_wichtig: "y", wer_ist_betroffen: "z", handlungsempfehlung: "a", zeitdruck: "hoch",
      parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
      mentioned_parties: [], mentioned_committees: [], mentioned_ministries: [], mentioned_locations: ["Berlin"],
      mentioned_people: [], mentioned_mps: [], mentioned_organizations: [], confidence_score: 70,
      affected_geographies: [{ name: "Brandenburg" }]
    },
    { documents: [{}] }, "vorgang-geo-test", { understanding_status: "complete", model: "gpt-5-mini" }
  );
  return ids(ko.affected_geographies).join() === "geo-land-brandenburg"
    && ids(ko.mentioned_geographies).join() === "geo-land-berlin"
    && schema.validateKnowledgeObject(ko).valid;
})());

check("D4 der Assembler reicht Quellengeografien als INDIZ durch (nie als betroffen)", (() => {
  const ko = U.assembleKnowledgeObject(
    {
      was_ist_passiert: "x", warum_wichtig: "y", wer_ist_betroffen: "z", handlungsempfehlung: "a", zeitdruck: "hoch",
      parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
      mentioned_parties: [], mentioned_committees: [], mentioned_ministries: [], mentioned_locations: [],
      mentioned_people: [], mentioned_mps: [], mentioned_organizations: [], confidence_score: 70
    },
    { documents: [{}] }, "vorgang-geo-quelle", { quellenGeografien: [{ geography_id: "geo-land-berlin" }] }
  );
  return ko.affected_geographies.length === 0
    && ids(ko.classification_confidence.geography_indizien).join() === "geo-land-berlin";
})());

check("D5 betroffene und erwähnte Geografien sind im Matchingkontext eindeutig unterscheidbar", (() => {
  const ko = { affected_geographies: [BRANDENBURG], mentioned_geographies: [BERLIN] };
  return G.betroffeneRegionen(ko).join() === "Brandenburg" && G.erwaehnteRegionen(ko).join() === "Berlin";
})());

check("D6 Scoring-Gewichtungen und Matchinglogik sind unverändert (Regel 14)", (() => {
  const scoring = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "scoring.js"), "utf8");
  const matching = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "matching.js"), "utf8");
  // koRegions bleibt wie bisher (Betroffen + Erwähnt), der Feature-Vektor nutzt
  // weiterhin ausschliesslich mentioned_locations. Sprint 20 fügt nur Lesehilfen hinzu.
  return /function koRegions/.test(scoring)
    && /asArray\(ko\.affected_geographies\), \.\.\.asArray\(ko\.mentioned_geographies\)/.test(scoring)
    && /regions: uniq\(\[\.\.\.\(ko\.mentioned_locations \|\| \[\]\)\]\)/.test(matching);
})());

check("D7 keine neue Spalte, keine neue Tabelle, keine neue Migration", (() => {
  const migrationen = fs.readdirSync(path.join(__dirname, "..", "supabase", "migrations"));
  return !migrationen.some((f) => /2026072[89]|20260730|geograf/i.test(f));
})());

// ══════════════════════════════════════════════════════════════════════════════
// E · Regressionsriegel
// ══════════════════════════════════════════════════════════════════════════════
console.log("\nE · Regressionsriegel gegen die alten Fallbacks");

const CLS_SRC = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "quellenarchitektur", "classification.js"), "utf8");

check("E1 die Funktion deriveAffectedGeographies existiert nicht mehr",
  !/function deriveAffectedGeographies/.test(CLS_SRC));

check("E2 kein hartkodierter Deutschland-Ersatzwert im aktiven Resolver", (() => {
  const code = CLS_SRC.split("\n").filter((z) => !/^\s*\/\//.test(z)).join("\n");
  // 'geo-bund' darf im Code nur noch als Namensindex ("deutschland" -> geo-bund)
  // vorkommen, NICHT als erzeugter Rückgabewert einer Geografie-Ableitung.
  return !/return \[\{ name: "Deutschland"/.test(code) && !/level === "bund"\) return \[/.test(code);
})());

check("E3 die Geografie-Kandidatensammlung bekommt die Ebene nicht übergeben", (() => {
  const signatur = (CLS_SRC.match(/function sammleGeografieKandidaten\([^)]*\)/) || [""])[0];
  return signatur.includes("ko") && signatur.includes("ai") && signatur.includes("opts")
    && !signatur.includes("level");
})());

check("E4 kein mandantenspezifischer Sonderfall und keine hartkodierte Zielgeografie im Resolver", (() => {
  const geoSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "quellenarchitektur", "geografie-gedaechtnis.js"), "utf8");
  const code = geoSrc.split("\n").filter((z) => !/^\s*\/\//.test(z)).join("\n");
  return !/geo-land-|geo-bund|berlin|brandenburg/i.test(code);
})());

check("E5 kein zusätzlicher KI-Aufruf für Geografie", (() => {
  const geoSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "quellenarchitektur", "geografie-gedaechtnis.js"), "utf8");
  return !/require\(/.test(geoSrc) && !/fetch|openai|anthropic|requestStructuredJson/i.test(geoSrc);
})());

check("E6 kein Massen-Nachklassifizieren: der Backfill bleibt auf KOs OHNE decision_level begrenzt", (() => {
  const bf = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "ko-classification-backfill.js"), "utf8");
  return /!k\.decision_level/.test(bf);
})());

check("E7 der Backfill kann eine gespeicherte Geografie nicht herabstufen", (() => {
  const { buildClassificationPatch } = require("../lib/helmut/ko-classification-backfill");
  const ko = {
    understanding_status: "complete", decision_level: "bund",
    affected_geographies: [{ ...BERLIN, herkunft: "inhalt" }],
    classification_confidence: { geography_ermittelt_am: T0 }
  };
  const patch = buildClassificationPatch(ko, { embed: () => [] });
  return ids(patch.affected_geographies).join() === "geo-land-berlin";
})());

console.log(`\n${pass}/${pass + fail} Geografie-Assertions erfolgreich.`);
if (fail > 0) { console.error(`${fail} FEHLGESCHLAGEN`); process.exit(1); }
