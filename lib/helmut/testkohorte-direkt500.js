"use strict";

// Expliziter Betreiberweg 25 -> 500 (SR §60). Die alten A/B/C Vertraege
// bleiben unveraendert. Keine fingierte B Abnahme und kein Sammelfreigabewort.
const crypto = require("crypto");
const { baueKohorte, mitLaufzeitPasswort } = require("./test-kohorte-500");
const { GRUPPEN_KENNUNGEN, EXECUTE_FLAG, CONFIRM_VARIABLE } = require("./testkohorte-betrieb");
const { kontrolliere } = require("./funktionstest-kontrolle");

const ZIEL = 500;
const KENNUNGEN = Object.freeze([...GRUPPEN_KENNUNGEN.b, ...GRUPPEN_KENNUNGEN.c]);
const ZIELMENGE = new Set(KENNUNGEN);
const A_MENGE = new Set(GRUPPEN_KENNUNGEN.a);
const SPECS = new Map(baueKohorte().map((s) => [s.id, s]));
const WORTE = Object.freeze({
  provisionierung: "TESTKOHORTE_ZIEL_500_475_INAKTIV_ANLEGEN_BESTAETIGT",
  aktivierung: "TESTKOHORTE_ZIEL_500_475_AKTIVIEREN_BESTAETIGT",
  fachzyklus: "TESTKOHORTE_ZIEL_500_EINE_PIPELINE_RUNDE_BESTAETIGT",
  textnachlauf: "TESTKOHORTE_500_FEHLENDE_TEXTE_EINMAL_BESTAETIGT"
});
const KLASSEN = Object.freeze(["source_fetch", "mandate_projection", "briefing_materialization"]);

class DirektAbbruch extends Error {
  constructor(grund) { super(grund); this.name = "DirektAbbruch"; this.grund = grund; }
}
function fordere(wert, grund) { if (!wert) throw new DirektAbbruch(grund); }
function stabil(wert) {
  if (Array.isArray(wert)) return wert.map(stabil);
  if (wert && typeof wert === "object") {
    return Object.fromEntries(Object.keys(wert).sort().map((k) => [k, stabil(wert[k])]));
  }
  return wert;
}
function hash(wert) { return crypto.createHash("sha256").update(JSON.stringify(stabil(wert))).digest("hex"); }
function sortiert(rows, key) { return [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key]))); }
function eindeutig(rows, key, grund) {
  fordere(Array.isArray(rows) && rows.every((r) => r && typeof r[key] === "string" && r[key]), grund);
  fordere(new Set(rows.map((r) => r[key])).size === rows.length, grund + "-doppelt");
  return new Map(rows.map((r) => [r[key], r]));
}
function plan(vorgang) {
  fordere(Object.hasOwn(WORTE, vorgang), "unbekannter-direktvorgang");
  if (vorgang === "textnachlauf") return { ziel: ZIEL, vorgang, cronAufrufe: 1,
    maxArbeitszeitMs: 240000, profileSchreiben: false, vorhandeneTexteSchuetzen: true,
    bestaetigung: WORTE[vorgang], automatischeWiederholung: false, funktionsnachweis500: false };
  if (vorgang === "fachzyklus") return { ziel: ZIEL, vorgang, pipelineRunden: 1,
    profileSchreiben: false, bestaetigung: WORTE[vorgang], aAbnahmeErforderlich: false,
    zwischenabnahme100Erforderlich: false, automatischeWiederholung: false };
  return { ziel: ZIEL, vorgang, zusaetzlicheProfile: KENNUNGEN.length,
    vorhandeneAktive: 25, gesamtNachAnlage: 504, aktivNachAnlage: 25,
    aktivNachAktivierung: ZIEL, sonstigeInaktive: 4,
    bestaetigung: WORTE[vorgang], aAbnahmeErforderlich: false,
    zwischenabnahme100Erforderlich: false, kontenAktivieren: false };
}

// Ein blosses {bestanden:true} ist kein Beleg. Die bestehende Kontrolle wird
// aus ihren Messquellen neu gerechnet, die 60 A Auftraege einzeln abgeglichen.
// Fachliche/Quellenqualitaet bleibt eine dokumentierte unabhaengige Abnahme;
// ihre Links und Urteile werden hier nicht als automatisch verifiziert ausgegeben.
function pruefeAbnahmeA(beleg, zeit) {
  fordere(beleg && beleg.schemaVersion === 1 && beleg.stufe === "a", "a-abnahme-fehlt");
  const ende = Date.parse(beleg.abgenommenAm);
  fordere(Number.isFinite(ende) && ende <= zeit.getTime()
    && zeit.getTime() - ende < 48 * 3600000, "a-abnahme-veraltet");
  fordere(/^[a-f0-9]{40}$/.test(beleg.productionCommit || ""), "a-abnahme-commit-fehlt");
  const grenzen = { maxFehlerquote: 0.05, kostenbudgetUsd: 9, maxLaufzeitMinuten: 1440,
    maxRueckstandWachstum: 200, erwarteterCommit: beleg.productionCommit,
    mindestVerarbeiteteVorgaenge: 1 };
  const befund = kontrolliere({ stufe: "a", quellen: beleg.quellen, grenzen });
  fordere(befund.bestanden === true, "a-sicherheitsabnahme-unvollstaendig");
  fordere(Number.isSafeInteger(beleg.reservierungen) && beleg.reservierungen > 100,
    "a-budgetwirkung-ueber-100-fehlt");
  fordere(/^\d{4}-\d{2}-\d{2}$/.test(beleg.budgetTag || "")
    && beleg.budgetTag === new Date(ende).toISOString().slice(0, 10), "a-budgettag-fehlt");
  fordere(Array.isArray(beleg.auftraege) && beleg.auftraege.length === 60, "a-auftraege-unvollstaendig");
  const schluessel = new Set();
  fordere(/^\d{4}-\d{2}-\d{2}T00Z$/.test(beleg.frischefenster || ""), "a-frischefenster-fehlt");
  for (const r of beleg.auftraege) {
    fordere(r && A_MENGE.has(r.tenant_id) && KLASSEN.includes(r.job_type)
      && r.status === "erledigt" && r.freshness_window === beleg.frischefenster
      && typeof r.id === "string" && r.id.length > 0
      && Number.isFinite(Date.parse(r.finished_at)) && Date.parse(r.finished_at) <= ende,
    "a-auftrag-nicht-abgenommen");
    schluessel.add(`${r.tenant_id}/${r.job_type}`);
  }
  fordere(schluessel.size === 60 && new Set(beleg.auftraege.map((r) => r.id)).size === 60,
    "a-auftraege-doppelt");
  fordere(Array.isArray(beleg.qualitaet) && beleg.qualitaet.length === 25,
    "a-qualitaetsabnahme-unvollstaendig");
  const ids = new Set();
  for (const q of beleg.qualitaet) {
    fordere(q && typeof q.tenant_id === "string" && !ZIELMENGE.has(q.tenant_id)
      && q.urteil === "bestanden" && typeof q.begruendung === "string" && q.begruendung.trim().length > 10
      && typeof q.beleg === "string" && q.beleg.startsWith("belege/")
      && !q.beleg.includes(".."), "a-qualitaetsbeleg-fehlt");
    ids.add(q.tenant_id);
  }
  fordere(ids.size === 25 && [...A_MENGE].every((id) => ids.has(id)), "a-qualitaetszielmenge-abweichend");
  fordere(typeof beleg.geschuetzterBestandHash === "string"
    && /^[a-f0-9]{64}$/.test(beleg.geschuetzterBestandHash), "a-bestandsbindung-fehlt");
  return { befund, aktiveKennungen: ids };
}

function pruefeSnapshot(s, vorgang) {
  const mandate = eindeutig(s && s.mandate, "user_id", "mandatsbestand-ungueltig");
  const identitaeten = eindeutig(s.identitaeten, "id", "identitaetsbestand-ungueltig");
  const users = s.auth && s.auth.users;
  eindeutig(users, "id", "kontenbestand-ungueltig");
  fordere(s.main && Array.isArray(s.main.crawlRuns), "main-laufring-nicht-lesbar");
  fordere(s.mandate.every((m) => typeof m.aktiv === "boolean" && m.geloescht_at === null),
    "mandatszustand-ungueltig");
  for (const id of [...mandate.keys(), ...identitaeten.keys(), ...users.map((u) => u.politicianId || "")]) {
    fordere(!id.startsWith("test-kohorte-") || A_MENGE.has(id) || ZIELMENGE.has(id), "unbekannte-kohortenkennung");
  }
  const geschuetzt = s.mandate.filter((m) => !ZIELMENGE.has(m.user_id));
  fordere(geschuetzt.length === 29 && geschuetzt.filter((m) => m.aktiv).length === 25
    && [...A_MENGE].every((id) => mandate.get(id)?.aktiv === true), "geschuetzter-profilbestand-abweichend");
  const geschuetzteIdentitaeten = s.identitaeten.filter((r) => !ZIELMENGE.has(r.id));
  const geschuetzteKonten = users.filter((u) => !ZIELMENGE.has(u.politicianId));
  fordere(geschuetzteIdentitaeten.length === 30 && geschuetzteKonten.length === 25
    && geschuetzteKonten.filter((u) => u.active === true).length === 3,
    "geschuetzte-identitaeten-oder-konten-abweichend");
  const vorhandene = [];
  const aktive = [];
  for (const id of KENNUNGEN) {
    const m = mandate.get(id);
    const p = identitaeten.get(id);
    const konten = users.filter((u) => u.politicianId === id);
    if (!m && !p && konten.length === 0) continue;
    const spec = SPECS.get(id);
    fordere(m && p && konten.length === 1, "unvollstaendiger-kohortenteilbestand");
    const u = konten[0];
    fordere(u.active === false && u.role === "abgeordneter" && u.email === spec.email
      && (p.email === null || p.email === spec.email) && p.name === spec.name
      && m.profil_extras?.provisionedBy === "helmut-provisioning"
      && m.partei === spec.party && hash(m.ausschuesse) === hash(spec.committees)
      && hash(m.fachpolitische_schwerpunkte) === hash(spec.focusTopics)
      && m.politische_ebene === (spec.parliamentType === "Landtag" ? "landtag" : "bundestag")
      && m.ki_budget_taeglich_cent === 10 && m.ki_budget_monatlich_cent === 100,
    "kohorteninhalt-oder-konto-abweichend");
    if (vorgang === "provisionierung") fordere(m.aktiv === false, "anlage-trifft-aktives-profil");
    vorhandene.push(id);
    if (m.aktiv) aktive.push(id);
  }
  if (vorgang === "aktivierung") fordere(vorhandene.length === 475, "erst-475-vollstaendig-inaktiv-anlegen");
  return { vorhandene, aktive,
    aktiveKennungen: new Set(geschuetzt.filter((m) => m.aktiv).map((m) => m.user_id)),
    geschuetzterBestandHash: hash({ mandate: sortiert(geschuetzt, "user_id"),
      identitaeten: sortiert(geschuetzteIdentitaeten, "id"), konten: sortiert(geschuetzteKonten, "id") }),
    crawlRunsHash: hash(s.main.crawlRuns),
    kontenHash: hash(sortiert(users, "id")),
    identitaetenHash: hash(sortiert(s.identitaeten, "id")),
    profileInhaltHash: hash(sortiert(s.mandate.map(({ aktiv, updated_at, ...rest }) => rest), "user_id")),
    gesamt: s.mandate.length, aktiv: s.mandate.filter((m) => m.aktiv).length };
}

function pruefeZeit(zeit) {
  fordere(zeit instanceof Date && Number.isFinite(zeit.getTime()), "ungueltige-systemuhr");
  // Betreiberanweisung 08.09.: keine Uhrzeit oder vorgelagerte Stufenabnahme.
  // Echte Konkurrenz und der UTC Kostentag werden weiterhin separat geprueft.
}

async function fuehreAus({ vorgang, env = process.env, grundlinieHash, deps = {} } = {}) {
  const p = plan(vorgang);
  let schreibversuche = 0;
  let bestaetigt = 0;
  let vorher = null;
  let nachher = null;
  let letzterIndex = null;
  try {
    fordere(["provisionierung", "aktivierung"].includes(vorgang), "fachzyklus-braucht-eigenen-ausfuehrer");
    fordere(["1", "true", "on", "yes"].includes(String(env[EXECUTE_FLAG] || "").toLowerCase())
      && env[CONFIRM_VARIABLE] === WORTE[vorgang], "direktfreigabe-fehlt");
    for (const name of ["leseSnapshot", "pruefeBetrieb", "schreibe", "leseZiel", "jetzt"]) {
      fordere(typeof deps[name] === "function", "geschuetzter-ausfuehrungskontext-fehlt");
    }
    const start = deps.jetzt();
    pruefeZeit(start);
    await deps.pruefeBetrieb();
    vorher = pruefeSnapshot(await deps.leseSnapshot(), vorgang);
    if (grundlinieHash !== undefined) fordere(vorher.geschuetzterBestandHash === grundlinieHash,
      "grundlinie-passt-nicht-zum-bestand");
    const bereits = new Set(vorgang === "provisionierung" ? vorher.vorhandene : vorher.aktive);
    async function kontrolliereBestand() {
      nachher = pruefeSnapshot(await deps.leseSnapshot(), vorgang);
      fordere(nachher.geschuetzterBestandHash === vorher.geschuetzterBestandHash
        && nachher.crawlRunsHash === vorher.crawlRunsHash, "geschuetzter-bestand-veraendert");
      if (vorgang === "aktivierung") {
        fordere(nachher.kontenHash === vorher.kontenHash && nachher.identitaetenHash === vorher.identitaetenHash
          && nachher.profileInhaltHash === vorher.profileInhaltHash, "aktivierung-hat-fremde-felder-veraendert");
      }
      const anzahl = vorgang === "provisionierung" ? nachher.vorhandene.length : nachher.aktive.length;
      fordere(anzahl === bereits.size + bestaetigt, "persistierter-fortschritt-abweichend");
      await deps.pruefeBetrieb();
    }
    for (const [index, id] of KENNUNGEN.entries()) {
      if (bereits.has(id)) continue;
      letzterIndex = index + 1;
      pruefeZeit(deps.jetzt());
      fordere(deps.jetzt().getTime() - start.getTime() < 20 * 60000, "direktausbau-zeitbudget-erreicht");
      // Ein unbekannter Schreibausgang stoppt die Serie. Keine Wiederholung,
      // keine automatische Loeschung, keine Aktivierung im Anlagevorgang.
      schreibversuche += 1;
      const result = await deps.schreibe({ id, vorgang,
        spec: vorgang === "provisionierung" ? mitLaufzeitPasswort(SPECS.get(id)) : null });
      fordere(result && result.ok === true, "schreibvorgang-nicht-bestaetigt");
      const row = await deps.leseZiel(id);
      fordere(row && row.user_id === id && row.geloescht_at === null
        && row.aktiv === (vorgang === "aktivierung"), "zielzustand-nicht-persistiert");
      bestaetigt += 1;
      if (bestaetigt % 10 === 0) {
        await kontrolliereBestand();
        if (deps.fortschritt) deps.fortschritt({ ziel: 500, vorgang, bestaetigt,
          bereitsVorhanden: bereits.size, offen: 475 - bereits.size - bestaetigt });
      }
    }
    await kontrolliereBestand();
    fordere(nachher.gesamt === 504 && nachher.aktiv === (vorgang === "aktivierung" ? 500 : 25),
      "endbestand-nicht-erreicht");
    return { ...p, ok: true, schreibversuche, bestaetigt, bereitsVorhanden: bereits.size,
      gesamt: nachher.gesamt, aktiv: nachher.aktiv, funktionsnachweis500: false };
  } catch (error) {
    return { ...p, ok: false, schreibversuche, bestaetigt, letzterIndex,
      grund: error instanceof DirektAbbruch ? error.grund : "netz-speicher-oder-antwortfehler",
      teilbestandMoeglich: schreibversuche > 0, automatischeWiederholung: false,
      automatischerRueckbau: false, funktionsnachweis500: false };
  }
}

module.exports = { ZIEL, KENNUNGEN, WORTE, KLASSEN, DirektAbbruch, fordere, hash,
  plan, pruefeAbnahmeA, pruefeSnapshot, pruefeZeit, fuehreAus };
