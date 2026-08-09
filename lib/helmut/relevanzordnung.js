"use strict";

// Helmut — ZENTRALE RELEVANZORDNUNG (OP-30, finaler Abnahmesprint).
// =============================================================================================
// DIE PRODUKTREGEL, die dieses Modul umsetzt (Gründervorgabe, Sprintauftrag §8):
//
//   RELEVANZ VOR AKTUALITÄT.
//   Entscheidend sind Mandatsbezug, Ausschussbezug, Region, Dringlichkeit und
//   Handlungsbedarf. Danach folgen Qualität, Aktualität und ein stabiler technischer
//   Schlüssel.
//
// WAS VORHER WAR — und warum das hier existiert.
// Die Lage ordnete gespeicherte Matchingergebnisse nach `created_at desc`, also nach der
// SCHREIBZEIT. Weil `now()` in Postgres innerhalb einer Transaktion konstant ist, tragen alle
// Zeilen eines Matchinglaufs denselben Zeitstempel — die Reihenfolge war damit UNDEFINIERT
// (Heap-Reihenfolge) und nur zufällig richtig. Nachgewiesen am 2026-08-08: unter CPU-Knappheit
// kippte die Rangfolge in `berlin-e2e-vertrag-test.js` (J8) in 1 von 25 Läufen.
// Ein neuer, völlig irrelevanter Vorgang konnte damit einen älteren, direkt relevanten
// verdrängen. Genau das verhindert dieses Modul — strukturell, nicht durch Feinabstimmung.
//
// DAS ENTSCHEIDENDE ENTWURFSPRINZIP: KLASSEN VOR PUNKTEN.
// Ein reiner Punktwert löst das Problem NICHT. Bei jeder Gewichtung gibt es einen
// Aktualitätsbonus, der groß genug ist, um einen relevanten Vorgang zu überholen — man muss
// nur lange genug warten oder genug Punkte anderswo sammeln. Deshalb wird zuerst eine
// KLASSE vergeben, und die Klasse dominiert alles Weitere. Aktualität wirkt ausschließlich
// INNERHALB einer Klasse. Ein Vorgang der Klasse 5 kann einen der Klasse 1 nie überholen,
// egal wie neu er ist.
//
// KEINE ERFUNDENE POLITISCHE GEWICHTUNG. Es werden ausschließlich Signale benutzt, die
// `lib/helmut/scoring.js` bereits berechnet (Nähe, Handlungsfähigkeit, globale Wichtigkeit)
// und Felder, die am Wissensobjekt bereits existieren. Dieses Modul erfindet keine neue
// Bedeutung — es legt nur die REIHENFOLGE der vorhandenen Bedeutung fest.
//
// KEIN ZUSÄTZLICHER KI-AUFRUF. Rein deterministisch, rein rechnend.

const scoring = require("./scoring");

// ── Flaggrenze: DEFAULT AUS, fail closed ────────────────────────────────────────────────
// GEÄNDERT AM 2026-08-08 (OP-30-Korrektursprint). Diese Ordnung war zuerst **default AN**,
// mit der Begründung: eine Produktregel des Betreibers solle nicht davon abhängen, dass
// jemand ein Flag setzt. Das Argument ist inhaltlich richtig und trotzdem der falsche
// Mechanismus — aus einem Grund, der schwerer wiegt:
//
//   Ein default-AN-Flag ändert das Verhalten in dem Moment, in dem der Code gemergt wird.
//   Nicht dann, wenn jemand es entscheidet. Ein Merge ist ein Deployment (CLAUDE.md §5);
//   die Reihenfolge jeder Nutzeransicht hätte sich damit ohne eigene Freigabe verschoben.
//   Genau das ist die Sorte stiller Verhaltensänderung, die im Betrieb niemand zuordnen kann.
//
// Deshalb gilt jetzt die Hausregel für alle Flags (START_HERE §6): **Default AUS.** Die
// Produktregel „Relevanz vor Aktualität" bleibt unverändert gültig und vollständig gebaut —
// sie wartet nur auf eine ausdrückliche Freigabe statt sich selbst zu aktivieren.
//
// FAIL CLOSED, mit einer Unterscheidung, die im Störfall zählt:
//   * genau EIN Wert schaltet ein: `on`
//   * die bekannten Nein-Schreibweisen (leer, off, aus, 0, false, no, nein) sind AUS — still,
//     denn sie sind eine bewusste Angabe
//   * jeder ANDERE Wert ist ebenfalls AUS, erzeugt aber **einmalig eine Diagnose**. Ein
//     Tippfehler (`onn`, `ON!`, `true`) darf nicht stillschweigend so aussehen wie eine
//     bewusste Entscheidung — sonst sucht man den Fehler später an der falschen Stelle.
const RO_EIN = "on";
const RO_AUS_BEKANNT = new Set(["", "off", "aus", "0", "false", "no", "nein"]);
let roDiagnoseGemeldet = false;

function relevanzordnungAktiv(env = process.env) {
  const roh = String((env && env.HELMUT_RELEVANZORDNUNG) == null ? "" : (env && env.HELMUT_RELEVANZORDNUNG)).trim().toLowerCase();
  if (roh === RO_EIN) return true;
  if (!RO_AUS_BEKANNT.has(roh) && !roDiagnoseGemeldet) {
    roDiagnoseGemeldet = true;
    console.warn(`[relevanzordnung] HELMUT_RELEVANZORDNUNG="${roh.slice(0, 20)}" ist kein gültiger Wert — `
      + `die Relevanzordnung bleibt AUS (fail closed). Einschalten mit exakt "on"; `
      + `ausschalten mit "off"/"aus"/"0"/"false" oder indem die Variable ungesetzt bleibt.`);
  }
  return false;
}

// Nur für Tests: die einmalige Diagnose zurücksetzen.
function _roDiagnoseZuruecksetzen() { roDiagnoseGemeldet = false; }

// ── 1 · BELEGPFLICHT: was überhaupt zugelassen ist ──────────────────────────────────────
// CLAUDE.md §4.3 und START_HERE §5.2: kein Vorgang ohne nachvollziehbare Quelle.
// Ein Vorgang ohne öffnende Quelle darf nicht in eine Nutzeransicht — er ist kein
// „schwacher Treffer", er ist unbelegt.
function quellenBeleg(ko = {}) {
  const kandidaten = [];
  if (ko.best_source_url) kandidaten.push(String(ko.best_source_url));
  for (const s of Array.isArray(ko.sources) ? ko.sources : []) {
    if (s && (s.url || s.link)) kandidaten.push(String(s.url || s.link));
  }
  if (ko.source_url) kandidaten.push(String(ko.source_url));
  const gueltig = kandidaten.filter((u) => /^https?:\/\/\S+$/i.test(u.trim()));
  const dokumente = Number(ko.source_document_count) || (Array.isArray(ko.sources) ? ko.sources.length : 0);
  return {
    hatQuelle: gueltig.length > 0,
    url: gueltig[0] || null,
    anzahlUrls: gueltig.length,
    dokumente
  };
}

// WO DIE BELEGPFLICHT GREIFT — und wo ausdrücklich nicht.
//
// BELEGTER FEHLER (2026-08-08, von matching-aktualitaet-test.js, matching-erklaerung-test.js
// und scoring-integration-test.js gefunden): eine erste Fassung hat Vorgänge ohne
// `best_source_url` schon beim ORDNEN verworfen. Das ist falsch, und zwar aus einem
// konkreten Grund: an dieser Stelle der Kette sind die Quellen noch gar nicht geladen.
// `lage.js` holt sie erst später über `getSourcesForVorgang` und prüft die Belegpflicht
// dort bereits selbst (`lageHasRealSource`, lage.js:455 — "In BEIDEN Stufen sind
// ausschließlich Vorgänge mit echter Quelle erlaubt"). Ein Filter hier hätte also
// vollständig belegte Vorgänge weggeworfen, weil ihr Beleg an dieser Stelle nur noch
// nicht sichtbar war — und die Lage im Zweifel geleert.
//
// Deshalb: die Belegpflicht ist Teil dieses Moduls, aber sie wird nur dort ANGEWENDET, wo
// der Aufrufer die Quellen wirklich kennt (`opts.belegPflicht: true`, optional mit
// `opts.quelleBekannt(ko)` als Auskunft). Ohne diese Zusage wird NICHT gefiltert, sondern
// gezählt und ausgewiesen. Fehlende Sichtbarkeit darf nie zu stillem Wegwerfen führen.
function istAusgabefaehig(ko = {}) {
  if (!ko || !(ko.id || ko.vorgang_id)) return { ok: false, grund: "keine-kennung" };
  if (ko.status === "pending") return { ok: false, grund: "nicht-verstanden" };
  if (ko.understanding_status && ko.understanding_status !== "complete") {
    return { ok: false, grund: "verstehen-unvollstaendig" };
  }
  if (!(ko.was_ist_passiert || ko.warum_wichtig)) return { ok: false, grund: "kein-inhalt" };
  return { ok: true, grund: null, beleg: quellenBeleg(ko) };
}

// Die harte Belegprüfung — für Aufrufer, die die Quellen kennen.
function hatNachweisbareQuelle(ko = {}, quelleBekannt = null) {
  if (typeof quelleBekannt === "function") {
    try { if (quelleBekannt(ko) === true) return true; } catch (_) { /* Auskunft kaputt -> Feld pruefen */ }
  }
  return quellenBeleg(ko).hatQuelle;
}

// ── 2 · DRINGLICHKEIT UND HANDLUNGSBEDARF ───────────────────────────────────────────────
// Auch hier nichts Neues erfunden: `scoring.actionability` bewertet bereits, wie konkret
// handelbar ein Vorgang ist (nächste Schritte, Frist, Kanal, Hebel). Zusätzlich zählen
// die harten Felder Frist und Risikostufe.
const DRINGLICH_SCHWELLE = 0.55;      // actionability, ab der ein Vorgang als handlungsbedürftig gilt

function dringlichkeit(ko = {}, profile = {}) {
  let a = 0;
  try { a = Number(scoring.actionability(ko, profile).score) || 0; } catch (_) { a = 0; }
  const hatFrist = Boolean(String(ko.deadline || "").trim());
  const hoheStufe = ["high", "hoch", "critical", "kritisch"].includes(String(ko.risk_level || "").toLowerCase());
  const wert = a / 100;
  return {
    wert,
    hatFrist,
    hoheStufe,
    // Dringend ist, was entweder handelbar genug ist ODER eine Frist bzw. hohe Risikostufe trägt.
    dringend: wert >= DRINGLICH_SCHWELLE || hatFrist || hoheStufe
  };
}

// ── 3 · DIE KLASSEN ─────────────────────────────────────────────────────────────────────
// Kleinere Zahl = weiter vorn. Die Reihenfolge ist exakt die Gründervorgabe.
const KLASSEN = Object.freeze({
  MANDAT_DRINGEND: 1,   // direkter Mandatsbezug MIT Dringlichkeit/Handlungsbedarf
  MANDAT: 2,            // direkter Mandatsbezug (Person)
  AUSSCHUSS_REGION: 3,  // Ausschuss- oder Regionsbezug
  EBENE_DRINGEND: 4,    // dringende Bundes-/Landespolitik ohne persönlichen Bezug
  ALLGEMEIN: 5,         // allgemeine Relevanz
  RAND: 6               // belegt und verstanden, aber ohne erkennbaren Bezug
});
const KLASSENNAME = Object.freeze({
  1: "mandat-dringend", 2: "mandat", 3: "ausschuss-region",
  4: "ebene-dringend", 5: "allgemein", 6: "rand"
});

function profilBegriffe(profile = {}) {
  const arr = (v) => (Array.isArray(v) ? v : (v == null || v === "" ? [] : [v]));
  const norm = (v) => String(v == null ? "" : v).trim().toLowerCase();
  return {
    name: String(profile.fullName || profile.name || "").trim(),
    ausschuesse: new Set([...arr(profile.committees), profile.committee, ...arr(profile.ausschuesse)]
      .filter(Boolean).map(norm)),
    regionen: new Set([profile.constituency, profile.wahlkreis, profile.state, profile.bundesland,
      ...arr(profile.regionalInterests), ...arr(profile.regionale_interessen)].filter(Boolean).map(norm)),
    ebene: norm(profile.level || profile.ebene || "")
  };
}

function schneidet(mengeA, listeB) {
  const norm = (v) => String(v == null ? "" : v).trim().toLowerCase();
  for (const b of Array.isArray(listeB) ? listeB : []) {
    if (!b) continue;
    const n = norm(b && b.name ? b.name : b);
    if (n && mengeA.has(n)) return true;
  }
  return false;
}

// Die Klassenzuordnung. Sie liefert IMMER eine Begründung mit — ohne Begründung wäre eine
// Rangfolge nicht nachvollziehbar, und Nachvollziehbarkeit ist bei Helmut Produktversprechen.
function relevanzklasse(ko = {}, profile = {}, opts = {}) {
  const zulassung = istAusgabefaehig(ko);
  if (!zulassung.ok) {
    return { klasse: null, name: "ausgeschlossen", grund: zulassung.grund, ausgeschlossen: true, beleg: zulassung.beleg || null };
  }
  const t = profilBegriffe(profile);
  const d = dringlichkeit(ko, profile);

  // Persönlicher Bezug: die belegbasierte Nähe aus scoring.js, aufgeschlüsselt.
  let person = false;
  try {
    // scoring.proximityScore mischt alle Nähearten. Für die Klassenbildung wird der
    // PERSONENBEZUG getrennt gebraucht — deshalb hier derselbe Test wie dort, aber einzeln.
    const felder = [...(ko.mentioned_people || []), ...(ko.mentioned_mps || [])].map((x) => String(x || "").toLowerCase());
    const prosa = `${ko.headline || ""} ${ko.display_title || ""} ${ko.was_ist_passiert || ""} ${ko.warum_wichtig || ""}`.toLowerCase();
    const n = t.name.toLowerCase();
    person = Boolean(n && n.split(/\s+/).length >= 2
      && (felder.some((f) => f.includes(n)) || prosa.includes(n)));
  } catch (_) { person = false; }

  const ausschuss = schneidet(t.ausschuesse, [...(ko.ausschuesse || []), ...(ko.mentioned_committees || [])]);
  const region = schneidet(t.regionen, [...(ko.mentioned_locations || []),
    ...(ko.affected_geographies || []), ...(ko.mentioned_geographies || [])]);

  let naehe = 0;
  try { naehe = Number(scoring.proximityScore(ko, profile)) || 0; } catch (_) { naehe = 0; }

  if (person && d.dringend) {
    return { klasse: KLASSEN.MANDAT_DRINGEND, name: KLASSENNAME[1],
      grund: d.hatFrist ? "mandatsbezug-mit-frist" : (d.hoheStufe ? "mandatsbezug-hohes-risiko" : "mandatsbezug-handlungsbedarf"),
      signale: { person, ausschuss, region, dringend: true, naehe }, beleg: zulassung.beleg };
  }
  if (person) {
    return { klasse: KLASSEN.MANDAT, name: KLASSENNAME[2], grund: "mandatsbezug",
      signale: { person, ausschuss, region, dringend: false, naehe }, beleg: zulassung.beleg };
  }
  if (ausschuss || region) {
    return { klasse: KLASSEN.AUSSCHUSS_REGION, name: KLASSENNAME[3],
      grund: ausschuss && region ? "ausschuss-und-region" : (ausschuss ? "ausschussbezug" : "regionsbezug"),
      signale: { person, ausschuss, region, dringend: d.dringend, naehe }, beleg: zulassung.beleg };
  }
  if (d.dringend) {
    return { klasse: KLASSEN.EBENE_DRINGEND, name: KLASSENNAME[4], grund: "dringende-politik-ohne-eigenbezug",
      signale: { person, ausschuss, region, dringend: true, naehe }, beleg: zulassung.beleg };
  }
  if (naehe > 0) {
    return { klasse: KLASSEN.ALLGEMEIN, name: KLASSENNAME[5], grund: "allgemeine-relevanz",
      signale: { person, ausschuss, region, dringend: false, naehe }, beleg: zulassung.beleg };
  }
  return { klasse: KLASSEN.RAND, name: KLASSENNAME[6], grund: "kein-erkennbarer-bezug",
    signale: { person, ausschuss, region, dringend: false, naehe }, beleg: zulassung.beleg };
}

// ── 4 · QUALITÄT ────────────────────────────────────────────────────────────────────────
// Nach Relevanz kommt Qualität — mehr unabhängige Belege und eine amtliche Quelle sind
// besser als ein Einzeltreffer. Auch das nutzt nur vorhandene Felder.
function qualitaet(ko = {}) {
  const beleg = quellenBeleg(ko);
  let q = 0;
  if (beleg.dokumente >= 3) q += 0.4; else if (beleg.dokumente === 2) q += 0.25; else if (beleg.dokumente === 1) q += 0.1;
  if (String(ko.source_type || "").toLowerCase() === "amtlich" || ko.amtlich === true) q += 0.3;
  if (String(ko.link_type || "").toLowerCase() === "direct") q += 0.15;
  if (String(ko.confidence || "").toLowerCase() === "high") q += 0.15;
  return Math.min(1, q);
}

// ── 5 · DIE ORDNUNG ─────────────────────────────────────────────────────────────────────
// Vergleichsreihenfolge, streng von oben nach unten:
//   1. Klasse            (Relevanz — dominiert alles)
//   2. Nähe              (innerhalb der Klasse: wie stark ist der Bezug)
//   3. Dringlichkeit
//   4. Qualität
//   5. Aktualität        (erst hier!)
//   6. stabiler Schlüssel (Gleichstand wird deterministisch gebrochen, nie zufällig)
function stabilerSchluessel(ko = {}) {
  return String(ko.vorgang_id || ko.id || "");
}

function ordne(kos = [], profile = {}, opts = {}) {
  const jetzt = opts.now || Date.now();
  const bewertet = [];
  const ausgeschlossen = [];

  const belegPflicht = opts.belegPflicht === true;
  const ohneSichtbarenBeleg = [];

  for (const ko of Array.isArray(kos) ? kos : []) {
    const k = relevanzklasse(ko, profile, opts);
    if (k.ausgeschlossen) { ausgeschlossen.push({ ko, grund: k.grund }); continue; }
    if (!hatNachweisbareQuelle(ko, opts.quelleBekannt)) {
      if (belegPflicht) { ausgeschlossen.push({ ko, grund: "keine-quelle" }); continue; }
      // Ohne Belegzusage NICHT verwerfen — nur zaehlen. Der Beleg wird an dieser Stelle
      // der Kette oft erst spaeter geladen; das Verwerfen erledigt der Aufrufer, der ihn kennt.
      ohneSichtbarenBeleg.push(ko);
    }
    let aktualitaet = 0;
    try {
      const ts = scoring.resolveTimestampMs(ko);
      aktualitaet = ts == null ? 0 : ts;
    } catch (_) { aktualitaet = 0; }
    bewertet.push({
      ko,
      klasse: k.klasse,
      klassenname: k.name,
      grund: k.grund,
      signale: k.signale,
      beleg: k.beleg,
      naehe: Number(k.signale.naehe) || 0,
      dringlichkeit: dringlichkeit(ko, profile).wert,
      qualitaet: qualitaet(ko),
      aktualitaet,
      schluessel: stabilerSchluessel(ko)
    });
  }

  bewertet.sort((a, b) =>
    (a.klasse - b.klasse)                              // 1. Relevanzklasse
    || (b.naehe - a.naehe)                             // 2. Stärke des Bezugs
    || (b.dringlichkeit - a.dringlichkeit)             // 3. Dringlichkeit
    || (b.qualitaet - a.qualitaet)                     // 4. Qualität
    || (b.aktualitaet - a.aktualitaet)                 // 5. Aktualität — erst hier
    || a.schluessel.localeCompare(b.schluessel)        // 6. stabiler Schlüssel
  );

  const grenze = opts.limit != null ? Math.max(0, opts.limit) : bewertet.length;
  return {
    reihenfolge: bewertet.slice(0, grenze),
    ausgeschlossen,
    // EHRLICHKEIT: was nicht in die Ansicht kam, wird gezählt und begründet — nicht weggelassen.
    zusammenfassung: {
      eingang: Array.isArray(kos) ? kos.length : 0,
      zugelassen: bewertet.length,
      ausgeschlossen: ausgeschlossen.length,
      ausgeschlossenNachGrund: ausgeschlossen.reduce((m, x) => { m[x.grund] = (m[x.grund] || 0) + 1; return m; }, {}),
      // EHRLICHKEIT: wie viele Vorgaenge trugen an DIESER Stelle keinen sichtbaren Beleg?
      // Bei `belegPflicht:true` sind sie ausgeschlossen, sonst nur gezaehlt.
      ohneSichtbarenBeleg: ohneSichtbarenBeleg.length,
      belegPflichtAngewendet: belegPflicht,
      jeKlasse: bewertet.reduce((m, x) => { m[x.klassenname] = (m[x.klassenname] || 0) + 1; return m; }, {})
    }
  };
}

// Bequemer Aufruf für Stellen, die nur die sortierten Wissensobjekte brauchen.
function ordneKos(kos = [], profile = {}, opts = {}) {
  return ordne(kos, profile, opts).reihenfolge.map((x) => x.ko);
}

module.exports = {
  relevanzordnungAktiv,
  _roDiagnoseZuruecksetzen,
  quellenBeleg,
  istAusgabefaehig,
  hatNachweisbareQuelle,
  dringlichkeit,
  relevanzklasse,
  qualitaet,
  ordne,
  ordneKos,
  stabilerSchluessel,
  KLASSEN,
  KLASSENNAME,
  DRINGLICH_SCHWELLE
};
