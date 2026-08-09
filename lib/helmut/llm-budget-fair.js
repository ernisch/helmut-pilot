"use strict";

// Helmut — FAIRE, DETERMINISTISCHE VERTEILUNG DES KI-TAGESBUDGETS (OP-30).
// =============================================================================================
// WAS DIESES MODUL IST: die Politik. Es entscheidet, WER an einem Tag wie viele KI-Aufrufe
// bekommen darf. Die Durchsetzung (atomar, ueber mehrere Worker hinweg) liegt in SQL
// (`helmut_reserve_llm_result`, Migration 20260808_llm_budget_fairness.sql). Politik und
// Durchsetzung sind absichtlich getrennt: die Politik muss offline pruefbar sein, die
// Durchsetzung muss atomar sein — das sind zwei verschiedene Anforderungen.
//
// WAS DIESES MODUL NICHT IST: es aendert KEINEN bestehenden Deckel. `HELMUT_MAX_LLM_CALLS_PER_DAY`
// bleibt, was es ist — das globale Notfalllimit. Solange der Aufrufer dieses Modul nicht
// benutzt (Flag `HELMUT_SCALABLE_PIPELINE` aus), ist es vollstaendig wirkungslos.
//
// DAS PROBLEM, DAS ES LOEST.
// Der heutige Zaehler ist ein "wer zuerst kommt"-Topf. Bei 1 000 Mandaten in Listenreihenfolge
// heisst das: die ersten paar Mandate verbrauchen den Tag, die letzten sehen nie einen Aufruf —
// und zwar JEDEN Tag dieselben, weil die Reihenfolge stabil ist. Das ist kein Engpass mehr,
// das ist ein Produktfehler.
//
// DIE DREI REGELN.
//   1. NOTWENDIG VOR OPTIONAL. Erst bekommt JEDES faellige Mandat seine notwendige Arbeit,
//      danach erst bekommt IRGENDEIN Mandat optionale Arbeit. Nicht mandatsweise abarbeiten.
//   2. GLEICHER ANTEIL. Das Budget wird durch die Zahl der faelligen Mandate geteilt, nicht
//      nach Ankunft vergeben.
//   3. ROTATION STATT VERHUNGERN. Reicht das Budget nicht fuer alle, entscheidet ein
//      deterministischer, mit dem Tag wandernder Versatz, wer heute drankommt. Ueber
//      aufeinanderfolgende Tage kommt damit jedes Mandat an die Reihe — nachweisbar, nicht
//      hoffentlich.
//
// Kein `Math.random`, kein `Date.now()` im Kern: dieselbe Eingabe ergibt dieselbe Verteilung.
// Ohne das waere der Plan nicht wiederholbar und die Warteschlange nicht idempotent.

const crypto = require("crypto");

// Anteil des Tagesbudgets, der der GLOBALEN Arbeit (Understanding) vorbehalten bleibt.
// Warum ueberhaupt: Understanding ist der geteilte Pfad — ein Aufruf nuetzt allen Mandaten
// zugleich. Er darf nicht von mandatsbezogener Arbeit verdraengt werden. Das ist dieselbe
// Ueberlegung wie die bestehende Understanding-Reserve in storage.js, nur als Anteil statt
// als feste Zahl, damit sie mit dem Deckel mitwaechst.
const GLOBAL_ANTEIL_STANDARD = 0.5;
const MIN_PRO_MANDAT = 1;

function anteilAusEnv(env = process.env) {
  const roh = String(env.HELMUT_LLM_GLOBAL_ANTEIL ?? "").trim();
  const wert = Number(roh);
  if (roh !== "" && Number.isFinite(wert) && wert > 0 && wert < 1) return wert;
  return GLOBAL_ANTEIL_STANDARD;
}

// UTC-Kalendertag — exakt dasselbe Fenster wie `dayKey()` in storage.js. Eine andere
// Tagesgrenze hier waere ein stiller Zaehlfehler gegenueber dem bestehenden Gate.
function tagesSchluessel(msOderIso) {
  const d = msOderIso == null ? new Date() : new Date(msOderIso);
  return d.toISOString().slice(0, 10);
}

// Stabiler Schluessel je BEABSICHTIGTEM Ergebnis. Er ist die gesamte Idempotenz: derselbe
// Schluessel bedeutet dieselbe Absicht, und dieselbe Absicht wird nie zweimal bezahlt.
//
// GLOBALE Arbeit traegt KEINE Mandatskennung (CLAUDE.md §4.2: geteilte Arbeit gehoert keinem
// Mandanten). Mandatsbezogene Arbeit traegt sie zwingend, sonst wuerden sich zwei Mandate
// denselben Schluessel teilen und einer bekaeme das Ergebnis des anderen.
function ergebnisSchluessel({ art, gegenstand, fenster = null, mandatsId = null } = {}) {
  const a = String(art || "").trim();
  const g = String(gegenstand || "").trim();
  if (!a) throw new Error("ergebnisSchluessel: art fehlt");
  if (!g) throw new Error("ergebnisSchluessel: gegenstand fehlt");
  if (GLOBALE_ARTEN.has(a)) {
    if (mandatsId) throw new Error(`ergebnisSchluessel: ${a} ist global und darf keine Mandatskennung tragen`);
    return fenster ? `${a}|${g}|${fenster}` : `${a}|${g}`;
  }
  if (!mandatsId) throw new Error(`ergebnisSchluessel: ${a} ist mandatsbezogen und braucht eine Mandatskennung`);
  return fenster ? `${a}|${mandatsId}|${g}|${fenster}` : `${a}|${mandatsId}|${g}`;
}

// Welche Arten sind geteilte, globale KI-Arbeit? Bewusst eine kleine, ausdrueckliche Liste —
// dieselbe Abgrenzung wie `TENANT_EXEMPT_CALLTYPES` in storage.js.
const GLOBALE_ARTEN = new Set(["understanding", "koTagsBackfill"]);

function istGlobaleArt(art) {
  const a = String(art || "");
  return GLOBALE_ARTEN.has(a) || a.startsWith("understanding-");
}

function scopeFuer({ art, mandatsId = null } = {}) {
  if (istGlobaleArt(art)) return "global";
  if (!mandatsId) throw new Error("scopeFuer: mandatsbezogene Art ohne Mandatskennung");
  return `tenant:${mandatsId}`;
}

// Deterministischer Streuwert — derselbe Ansatz wie im Quellenbedarf (kein Math.random).
function streuwert(schluessel) {
  return crypto.createHash("sha256").update(String(schluessel), "utf8").digest().readUInt32BE(0);
}

// Tagesnummer seit Epoche: der Motor der Rotation.
function tagesNummer(tag) {
  const ms = Date.parse(`${tag}T00:00:00.000Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 86400000) : 0;
}

// Die Reihenfolge, in der Mandate bedient werden. Zwei Teile:
//   (a) eine STABILE Grundordnung (Streuwert der Mandatskennung) — nicht die Listenreihenfolge,
//       damit nicht ausgerechnet die alphabetisch ersten Mandate strukturell bevorzugt sind;
//   (b) ein mit dem Tag WANDERNDER Versatz — damit bei knappem Budget nicht jeden Tag
//       dieselben vorn stehen.
// `schritt` = wie viele Mandate an einem Tag ueberhaupt bedient werden koennen. Der Versatz
// wandert um GENAU diese Zahl weiter, nicht um eins.
//
// BELEGTER FEHLER (2026-08-08, beim Bau dieses Moduls gemessen): mit Schrittweite 1 und
// 1 000 Mandaten bei 50 Plaetzen waren nach 30 Tagen **921 Mandate nie bedient** worden,
// waehrend die vordersten 30-mal drankamen. Das ist genau das Verhungern, das die Rotation
// verhindern soll — eine Rotation, die langsamer wandert als sie verbraucht, ist keine.
// Mit Schrittweite = Zahl der Plaetze ist nach ceil(n / plaetze) Tagen jedes Mandat einmal
// dran gewesen. Nachgewiesen in `bedienteMandateUeberTage`.
function rotationsReihenfolge(mandatsIds = [], tag = null, schritt = 1) {
  const liste = [...new Set((mandatsIds || []).map((m) => String(m || "").trim()).filter(Boolean))];
  liste.sort((a, b) => {
    const sa = streuwert(a);
    const sb = streuwert(b);
    return sa === sb ? (a < b ? -1 : 1) : sa - sb;
  });
  if (!liste.length) return [];
  const s = Math.max(1, Math.floor(Number(schritt) || 1));
  const versatz = tag ? ((tagesNummer(tag) * s) % liste.length + liste.length) % liste.length : 0;
  return [...liste.slice(versatz), ...liste.slice(0, versatz)];
}

// Der Tagesplan. Eingang: die faelligen Mandate und der Tagesdeckel. Ausgang: wer wie viel
// bekommt, in welcher Reihenfolge, und was ausdruecklich NICHT bedient wird.
//
// `bedarf` ist optional und beschreibt je Mandat, wie viele Aufrufe notwendig bzw. optional
// waeren. Ohne Angabe gilt: 1 notwendiger Aufruf je Mandat, 0 optionale.
function tagesplan({
  mandate = [],
  deckel = 0,
  tag = null,
  bedarf = null,
  env = process.env
} = {}) {
  const tagKey = tag || tagesSchluessel();
  const gesamt = Math.max(0, Math.floor(Number(deckel) || 0));
  const globalAnteil = anteilAusEnv(env);
  // Die Schrittweite der Rotation MUSS aus dem Budget kommen (siehe rotationsReihenfolge).
  // Deshalb wird der Mandatstopf hier vor der Reihenfolge berechnet.
  const eindeutige = [...new Set((mandate || []).map((m) => String(m || "").trim()).filter(Boolean))];
  const topfVorschau = Math.max(0, gesamt - Math.floor(gesamt * globalAnteil));
  const plaetze = Math.max(1, Math.min(eindeutige.length || 1, topfVorschau));
  const reihenfolge = rotationsReihenfolge(mandate, tagKey, plaetze);
  const n = reihenfolge.length;
  // Der globale Topf ist eine RESERVE, keine Zuteilung: was das Understanding nicht braucht,
  // bleibt liegen und wird nicht heimlich an Mandate verteilt. Anders herum darf die
  // mandatsbezogene Arbeit den globalen Topf nie anfassen.
  const globalTopf = Math.floor(gesamt * globalAnteil);
  const mandatsTopf = Math.max(0, gesamt - globalTopf);

  const notwendigJe = (m) => Math.max(0, Math.floor(Number((bedarf && bedarf[m] && bedarf[m].notwendig) ?? 1)));
  const optionalJe = (m) => Math.max(0, Math.floor(Number((bedarf && bedarf[m] && bedarf[m].optional) ?? 0)));

  const zuteilung = new Map(reihenfolge.map((m) => [m, { notwendig: 0, optional: 0 }]));
  let rest = mandatsTopf;

  // RUNDE 1 — NOTWENDIGE ARBEIT, EIN AUFRUF JE MANDAT, IN ROTATIONSREIHENFOLGE.
  // Genau hier entscheidet sich Regel 3: reicht `rest` nicht fuer alle, bekommen die
  // VORDEREN der heutigen Rotation ihren Aufruf — und das sind morgen andere.
  for (const m of reihenfolge) {
    if (rest <= 0) break;
    if (notwendigJe(m) <= 0) continue;
    zuteilung.get(m).notwendig += 1;
    rest -= 1;
  }

  // RUNDE 2 — WEITERE NOTWENDIGE ARBEIT (Mandate mit mehr als einem notwendigen Aufruf),
  // wieder reihum, damit ein Mandat mit hohem Bedarf nicht alles vor den anderen abraeumt.
  let weiter = true;
  while (weiter && rest > 0) {
    weiter = false;
    for (const m of reihenfolge) {
      if (rest <= 0) break;
      const z = zuteilung.get(m);
      if (z.notwendig >= notwendigJe(m)) continue;
      z.notwendig += 1;
      rest -= 1;
      weiter = true;
    }
  }

  // RUNDE 3 — OPTIONALE ARBEIT, erst jetzt. Solange oben noch notwendige Arbeit offen war,
  // ist `rest` hier bereits 0 — kein Mandat bekommt Kuer, solange ein anderes noch auf
  // Pflicht wartet (Sprintauftrag Phase 5 §12).
  weiter = true;
  while (weiter && rest > 0) {
    weiter = false;
    for (const m of reihenfolge) {
      if (rest <= 0) break;
      const z = zuteilung.get(m);
      if (z.optional >= optionalJe(m)) continue;
      z.optional += 1;
      rest -= 1;
      weiter = true;
    }
  }

  const zugeteilt = [...zuteilung.values()].reduce((s, z) => s + z.notwendig + z.optional, 0);
  const notwendigOffen = reihenfolge.reduce((s, m) => s + Math.max(0, notwendigJe(m) - zuteilung.get(m).notwendig), 0);
  const optionalOffen = reihenfolge.reduce((s, m) => s + Math.max(0, optionalJe(m) - zuteilung.get(m).optional), 0);

  return {
    tag: tagKey,
    mandate: n,
    deckel: gesamt,
    globalTopf,
    mandatsTopf,
    restImMandatstopf: rest,
    reihenfolge,
    zuteilung: Object.fromEntries([...zuteilung].map(([m, z]) => [m, { ...z }])),
    zugeteilt,
    // EHRLICHKEIT: was nicht bedient wurde, wird benannt — nicht weggelassen.
    notwendigOffen,
    optionalOffen,
    reichtFuerAlleNotwendigen: notwendigOffen === 0,
    proMandat: n > 0 ? mandatsTopf / n : 0
  };
}

// Der wirksame Deckel je Reservierung: was darf DIESES Mandat heute insgesamt verbrauchen?
// Genau dieser Wert wandert als `p_scope_max` in die SQL-Funktion. Er ist die Zahl aus dem
// Tagesplan — nicht der globale Deckel, und nicht "so viel wie noch da ist".
function mandantenDeckel(plan, mandatsId) {
  const z = plan && plan.zuteilung && plan.zuteilung[mandatsId];
  if (!z) return 0;
  return z.notwendig + z.optional;
}

// Der wirksame Deckel der GLOBALEN Arbeit (Understanding). Er wandert als `p_scope_max` in
// die Reservierung des Verstehens.
//
// WARUM NICHT `plan.globalTopf`. `globalTopf` ist ein FESTER Anteil (`HELMUT_LLM_GLOBAL_ANTEIL`,
// Standard 0,5). Im gebauten Warteschlangenpfad ist das aus zwei Gruenden falsch:
//   1. ES VERSCHENKT. Mandatsbezogene Warteschlangenarbeit (Projektion, Briefing) ist KI-FREI
//      (V3-Vertrag §13.3/§13.4). Ein fester 50-%-Mandatstopf bliebe also weitgehend
//      ungenutzt liegen, waehrend das Verstehen — der einzige KI-Verbraucher der
//      Warteschlange — bei der Haelfte des Deckels stehenbliebe. Der Abschlussreview hat
//      genau diese Schieflage gemessen (Befund: 80-98 % des Bedarfs sind global, der Anteil
//      steht auf 50 %).
//   2. ES SCHUETZT DAS FALSCHE. Mandatsbezogene KI gibt es sehr wohl — nur AUSSERHALB der
//      Warteschlange: das Lage-Narrativ (`lage.generateLageBriefing`, Cron `lage-briefing`,
//      1 Aufruf je aktivem Mandat und Berliner Tag, `llm-pfad-karte.md` Pfad 6). Es zaehlt
//      gegen DENSELBEN globalen Tageszaehler. Ohne Reserve kann das Verstehen es verdraengen —
//      und ausgerechnet der sichtbare Teil des Produkts fiele aus.
//
// Deshalb BEDARFSGETRIEBEN: reserviert wird genau so viel, wie die mandatsbezogene Arbeit an
// diesem Tag tatsaechlich braucht (ein Narrativ je aktivem Mandat), gedeckelt durch den
// konfigurierten Mandatsanteil. Was sie nicht braucht, darf das Verstehen benutzen.
// `HELMUT_LLM_GLOBAL_ANTEIL` ist damit eine OBERGRENZE der Mandatsreserve, kein starrer Schnitt.
function globalerTopf({ deckel = 0, mandatsBedarf = 0, env = process.env } = {}) {
  const gesamt = Math.max(0, Math.floor(Number(deckel) || 0));
  const bedarf = Math.max(0, Math.floor(Number(mandatsBedarf) || 0));
  const hoechsteReserve = Math.floor(gesamt * (1 - anteilAusEnv(env)));
  const reserve = Math.min(bedarf, hoechsteReserve);
  return {
    deckel: gesamt,
    mandatsBedarf: bedarf,
    mandatsReserve: reserve,
    // EHRLICH: reicht die zulaessige Reserve nicht fuer den Bedarf, wird das benannt statt
    // stillschweigend gekappt. Genau dann ist `HELMUT_LLM_GLOBAL_ANTEIL` zu gross gesetzt.
    reserveGedeckelt: bedarf > hoechsteReserve,
    globalTopf: Math.max(0, gesamt - reserve)
  };
}

// Nachweis der Nicht-Verhungerung: ueber `tage` aufeinanderfolgende Tage muss JEDES Mandat
// mindestens einmal in der bedienten Menge liegen. Reine Rechnung, keine Attrappe — genau
// deshalb ist die Zusage pruefbar statt behauptet.
function bedienteMandateUeberTage({ mandate = [], deckel = 0, tage = 30, startTag = "2026-08-08", env = process.env } = {}) {
  const gesehen = new Map(mandate.map((m) => [m, 0]));
  const start = tagesNummer(startTag);
  for (let i = 0; i < tage; i += 1) {
    const tag = new Date((start + i) * 86400000).toISOString().slice(0, 10);
    const plan = tagesplan({ mandate, deckel, tag, env });
    for (const [m, z] of Object.entries(plan.zuteilung)) {
      if (z.notwendig + z.optional > 0) gesehen.set(m, (gesehen.get(m) || 0) + 1);
    }
  }
  const nie = [...gesehen].filter(([, n]) => n === 0).map(([m]) => m);
  return {
    tage,
    jeMandat: Object.fromEntries(gesehen),
    nieBedient: nie,
    alleMindestensEinmal: nie.length === 0,
    minimum: Math.min(...gesehen.values()),
    maximum: Math.max(...gesehen.values())
  };
}

module.exports = {
  tagesSchluessel,
  ergebnisSchluessel,
  istGlobaleArt,
  scopeFuer,
  rotationsReihenfolge,
  tagesplan,
  mandantenDeckel,
  globalerTopf,
  bedienteMandateUeberTage,
  // exportiert fuer Vertragstests:
  streuwert,
  tagesNummer,
  anteilAusEnv,
  GLOBALE_ARTEN,
  GLOBAL_ANTEIL_STANDARD,
  MIN_PRO_MANDAT
};
