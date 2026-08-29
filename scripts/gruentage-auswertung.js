"use strict";

// =====================================================================================
// GRUENTAGE-AUSWERTUNG — rein lesender Sammler + reproduzierbare Bewertung
// -------------------------------------------------------------------------------------
// Zweck: Der Zehn-Mandate-Uebergang verlangt SIEBEN vollstaendige gruene UTC-Tage mit
// fuenf Mandaten (Aktivierungsplan, docs/betrieb/z3b-aktivierungsplan-2026-08-27.md,
// "Gruenes Beobachtungsfenster"). Bisher gab es kein Werkzeug, das die zehn Kriterien
// eines Tages reproduzierbar aus Production-Quittungen ableitet — die Slotzeiten vom
// 29.08. (Crawl 230 s, Pipeline bis 261 s) wurden nur von Hand gesehen.
//
// Dieses Werkzeug hat zwei strikt getrennte Teile:
//   1. SAMMELN  (--sammeln):  liest AUSSCHLIESSLICH aggregierte Zaehler und technische
//      Laufquittungen aus Production (GET-only, Tabellen-Allowlist, Schreibschutz wie
//      scripts/op25-production-nachweis.js) und legt eine Tagesquittung als JSON ab.
//   2. BEWERTEN (--bewerten): reine, netzfreie Funktion ueber vorhandene Quittungen.
//      Sie ist deterministisch, UTC-stabil und testgesichert
//      (scripts/gruentage-auswertung-test.js).
//
// FAIL CLOSED: Ein Tag ohne Quittung, mit Luecke in den Quellen oder mit auch nur einem
// verletzten Kriterium ist NIE gruen. Momentaufnahme-Kriterien (unbekannte Vorgaenge,
// Leases, Dubletten) gelten nur fuer Tage, fuer die eine am selben oder folgenden
// UTC-Tag erhobene Quittung vorliegt — rueckwirkend wird nichts behauptet
// (CLAUDE.md §4.3/§4.4: Belegpflicht, kein falsches Gruen).
//
// DSGVO/Mandantenschutz: Es werden keine Mandatskennungen, Namen oder Inhalte gelesen,
// gespeichert oder ausgegeben — nur Zaehler, Status und Dauern.
//
// WICHTIG (CLAUDE.md §6-Abgrenzung): --sammeln ist KEIN Testlauf, sondern ein rein
// lesendes Betriebswerkzeug wie op25-production-nachweis.js. Es liest die Kennungen aus
// process.env (CLAUDE.md §4.9). Der Test dieses Werkzeugs beruehrt dagegen NIE das Netz.
// =====================================================================================

const fs = require("fs");
const path = require("path");
const https = require("https");

const SCHEMA = "gruentage-quittung/v1";

// Kriterien-Grenzen — identisch zum Beobachtungsfenster des Aktivierungsplans und zum
// strengen Beobachtungsvertrag (PR #277, scripts/fixtures/z3b-production-beobachtung.js).
const SLOT_BUDGET_MS = 290000;
const SLOT_P95_GRENZE_MS = 217500;   // 25 % Reserve im 290-s-Budget
const SLOT_STOP_MS = 280000;         // betriebliche Stopgrenze fuer Einzelwerte
const KI_DECKEL_DOKUMENTIERT = 100;  // dokumentiert, NICHT live bestaetigt (CURRENT_STATE §4)

// Nur diese Prozesse zaehlen als Verarbeitungsslots fuer p95/Einzelwert. Watchdog- und
// Gesundheitslaeufe sind keine Verarbeitungsslots.
const SLOT_PROZESSE = Object.freeze([
  "warteschlange-crawl", "warteschlange-pipeline",
  "understanding-cron", "understanding-lage",
  "briefing-morning", "briefing-lage"
]);
const BRIEFING_PROZESSE = Object.freeze(["briefing-morning", "briefing-lage"]);

// --- Rein lesender Zugriff (Muster: op25-production-nachweis.js) ---------------------

const HTTP_METHODE = "GET";
const ERLAUBTE_TABELLEN = Object.freeze([
  "helmut_jobs", "helmut_verstehen_reservierungen", "process_runs",
  "llm_budget_counters", "mandate_profiles"
]);

function pfadErlaubt(pfad) {
  if (typeof pfad !== "string" || !pfad.startsWith("/rest/v1/")) return false;
  if (pfad.includes("..") || pfad.includes("//", 1)) return false;
  return ERLAUBTE_TABELLEN.includes(pfad.slice("/rest/v1/".length).split("?")[0]);
}

function holen(pfad) {
  if (!pfadErlaubt(pfad)) {
    return Promise.reject(new Error(`[SCHREIBSCHUTZ] Pfad nicht erlaubt: ${pfad}`));
  }
  const basis = process.env.SUPABASE_URL;
  const schluessel = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!basis || !schluessel) {
    return Promise.reject(new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (nur aus process.env, CLAUDE.md §4.9)"));
  }
  return new Promise((erfuellen, ablehnen) => {
    const anfrage = https.request(new URL(basis + pfad), {
      method: HTTP_METHODE,
      headers: { apikey: schluessel, Authorization: `Bearer ${schluessel}`, Accept: "application/json" }
    }, (antwort) => {
      let text = "";
      antwort.on("data", (teil) => { text += teil; });
      antwort.on("end", () => {
        if (antwort.statusCode >= 400) return ablehnen(new Error(`HTTP ${antwort.statusCode}: ${text.slice(0, 200)}`));
        try { erfuellen(JSON.parse(text)); } catch (fehler) { ablehnen(fehler); }
      });
    });
    anfrage.on("error", ablehnen);
    anfrage.end();
  });
}

// Paginiert lesen, hart gedeckelt — ein Sammellauf darf nie unbegrenzt ziehen.
async function alleZeilen(basisPfad, { seitengroesse = 1000, maxZeilen = 20000 } = {}) {
  const zeilen = [];
  for (let offset = 0; offset < maxZeilen; offset += seitengroesse) {
    const seite = await holen(`${basisPfad}&limit=${seitengroesse}&offset=${offset}`);
    if (!Array.isArray(seite)) throw new Error("unerwartete Antwortform (kein Array)");
    zeilen.push(...seite);
    if (seite.length < seitengroesse) return { zeilen, vollstaendig: true };
  }
  // Deckel erreicht: NICHT stillschweigend abschneiden (CLAUDE.md §4.4).
  return { zeilen, vollstaendig: false };
}

// --- UTC-Hilfen ----------------------------------------------------------------------

function utcTag(isoText) {
  return String(isoText || "").slice(0, 10);
}

function tagGueltig(tag) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(tag || ""))) return false;
  const t = Date.parse(`${tag}T00:00:00.000Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === tag;
}

function tagEndeMs(tag) {
  return Date.parse(`${tag}T00:00:00.000Z`) + 24 * 60 * 60 * 1000;
}

function p95NaechsterRang(werte) {
  if (!Array.isArray(werte) || werte.length === 0) return null;
  const sortiert = [...werte].sort((a, b) => a - b);
  return sortiert[Math.max(0, Math.ceil(sortiert.length * 0.95) - 1)];
}

// --- SAMMELN: eine Tagesquittung aus aggregierten Production-Werten ------------------

async function sammleQuittung({ jetztMs = Date.now(), rueckblickTage = 3 } = {}) {
  const erhoben = new Date(jetztMs).toISOString();
  const heutigerTag = utcTag(erhoben);
  const fensterStartMs = Date.parse(`${heutigerTag}T00:00:00.000Z`) - rueckblickTage * 24 * 60 * 60 * 1000;
  const fensterStartIso = new Date(fensterStartMs).toISOString();

  // 1) Warteschlange: nur technische Spalten, KEINE payload, KEINE tenant_id.
  const jobsNeu = await alleZeilen(
    `/rest/v1/helmut_jobs?select=status,created_at,due_at,finished_at,lease_expires_at`
    + `&created_at=gte.${encodeURIComponent(fensterStartIso)}&order=created_at.asc`);
  const jobsOffenAlt = await alleZeilen(
    `/rest/v1/helmut_jobs?select=status,created_at,due_at,finished_at,lease_expires_at`
    + `&created_at=lt.${encodeURIComponent(fensterStartIso)}&status=in.(wartend,laeuft)&order=created_at.asc`);
  const jobsAbgeschlossenImFenster = await alleZeilen(
    `/rest/v1/helmut_jobs?select=status,created_at,due_at,finished_at`
    + `&created_at=lt.${encodeURIComponent(fensterStartIso)}&finished_at=gte.${encodeURIComponent(fensterStartIso)}&order=finished_at.asc`);

  // 2) Dubletten global (Aggregat ueber Schluessel, ohne die Schluessel auszugeben).
  const schluesselLauf = await alleZeilen(`/rest/v1/helmut_jobs?select=idempotency_key&order=idempotency_key.asc`);
  let dubletten = 0;
  for (let i = 1; i < schluesselLauf.zeilen.length; i += 1) {
    if (schluesselLauf.zeilen[i].idempotency_key === schluesselLauf.zeilen[i - 1].idempotency_key) dubletten += 1;
  }

  // 3) CAS-Zustaende, nur Zaehler.
  const cas = await alleZeilen(`/rest/v1/helmut_verstehen_reservierungen?select=zustand,lease_bis&order=vorgang_id.asc`);
  const casZaehler = { fertig: 0, unbekannt: 0, aufgegeben: 0, offen: 0, reserviert: 0, "modell-laeuft": 0 };
  let casAktiveLeases = 0;
  for (const zeile of cas.zeilen) {
    if (Object.prototype.hasOwnProperty.call(casZaehler, zeile.zustand)) casZaehler[zeile.zustand] += 1;
    if (zeile.lease_bis && Date.parse(zeile.lease_bis) > jetztMs) casAktiveLeases += 1;
  }

  // 4) Laufquittungen des Fensters (Slots + Briefings).
  const laeufe = await alleZeilen(
    `/rest/v1/process_runs?select=process,status,started_at,duration_ms,processed_count,target_count,reason`
    + `&started_at=gte.${encodeURIComponent(fensterStartIso)}&order=started_at.asc`);

  // 5) KI-Tageszaehler (nur global-Scope).
  const budget = await alleZeilen(
    `/rest/v1/llm_budget_counters?select=day,scope,used&scope=eq.global&day=gte.${utcTag(fensterStartIso)}&order=day.asc`);

  // 6) Mandatsbestand (nur Zaehler).
  const mandate = await alleZeilen(`/rest/v1/mandate_profiles?select=aktiv,geloescht_at&order=id.asc`);
  const mandateAktiv = mandate.zeilen.filter((m) => m.aktiv === true).length;

  const vollstaendig = jobsNeu.vollstaendig && jobsOffenAlt.vollstaendig && jobsAbgeschlossenImFenster.vollstaendig
    && schluesselLauf.vollstaendig && cas.vollstaendig && laeufe.vollstaendig && budget.vollstaendig && mandate.vollstaendig;

  return {
    schema: SCHEMA,
    erhobenUtc: erhoben,
    tagUtc: heutigerTag,
    rueckblickTage,
    lesungVollstaendig: vollstaendig,
    mandate: { aktiv: mandateAktiv, gesamt: mandate.zeilen.length },
    momentaufnahme: {
      wartend: jobsNeu.zeilen.concat(jobsOffenAlt.zeilen).filter((j) => j.status === "wartend").length,
      laeuft: jobsNeu.zeilen.concat(jobsOffenAlt.zeilen).filter((j) => j.status === "laeuft").length,
      haengendeLeases: jobsNeu.zeilen.concat(jobsOffenAlt.zeilen)
        .filter((j) => j.status === "laeuft" && j.lease_expires_at && Date.parse(j.lease_expires_at) <= jetztMs).length,
      dubletten,
      cas: casZaehler,
      casAktiveLeases
    },
    rohdaten: {
      jobs: jobsNeu.zeilen.concat(jobsOffenAlt.zeilen, jobsAbgeschlossenImFenster.zeilen)
        .map((j) => ({ status: j.status, created_at: j.created_at, due_at: j.due_at, finished_at: j.finished_at || null })),
      laeufe: laeufe.zeilen,
      budget: budget.zeilen
    }
  };
}

// --- BEWERTEN: reine Funktionen, netzfrei --------------------------------------------

// Bewertet EINEN vollstaendigen UTC-Tag aus einer oder mehreren Quittungen.
// `quittungen` sind Sammel-Ergebnisse (siehe oben); die Momentaufnahme-Kriterien gelten
// nur, wenn eine Quittung am Tag selbst oder am Folgetag erhoben wurde.
function bewerteTag(tag, quittungen, {
  kiDeckel = KI_DECKEL_DOKUMENTIERT,
  slotP95GrenzeMs = SLOT_P95_GRENZE_MS,
  slotStopMs = SLOT_STOP_MS
} = {}) {
  if (!tagGueltig(tag)) throw new Error(`Kein gueltiger UTC-Tag: ${tag}`);
  const ende = tagEndeMs(tag);
  const kriterien = {};
  const werte = {};

  const passende = (Array.isArray(quittungen) ? quittungen : [])
    .filter((q) => q && q.schema === SCHEMA && Array.isArray((q.rohdaten || {}).jobs));
  // Fuer die Rekonstruktion brauchen wir eine Quittung, deren Fenster den Tag abdeckt
  // und die NACH dem Tagesende erhoben wurde (sonst ist der Tag nicht vollstaendig).
  const deckend = passende.filter((q) => {
    const fensterStart = Date.parse(`${q.tagUtc}T00:00:00.000Z`) - (q.rueckblickTage || 0) * 86400000;
    return Date.parse(q.erhobenUtc) >= ende && fensterStart <= Date.parse(`${tag}T00:00:00.000Z`);
  });

  if (deckend.length === 0) {
    return {
      tag,
      gruen: false,
      belegbar: false,
      grund: "keine deckende Quittung nach Tagesende — Tag nicht belegbar, damit NICHT gruen",
      kriterien: {},
      werte: {}
    };
  }
  // Juengste deckende Quittung ist massgeblich.
  const q = deckend.sort((a, b) => Date.parse(b.erhobenUtc) - Date.parse(a.erhobenUtc))[0];
  const unvollstaendig = q.lesungVollstaendig === false;

  const jobs = q.rohdaten.jobs;
  const laeufe = q.rohdaten.laeufe || [];
  const budget = q.rohdaten.budget || [];

  // K1 Abfluss >= Ankunft
  const ankunft = jobs.filter((j) => utcTag(j.created_at) === tag).length;
  const abfluss = jobs.filter((j) => j.finished_at && utcTag(j.finished_at) === tag && j.status === "erledigt").length;
  werte.ankunft = ankunft; werte.abfluss = abfluss;
  kriterien.abflussDecktAnkunft = abfluss >= ankunft;

  // K2 keine offene Arbeit >= 24 h am Tagesende (faellig vor Tagesende-24h, nicht fertig bis Tagesende)
  const offenAlt = jobs.filter((j) => {
    const faellig = Date.parse(j.due_at || j.created_at);
    const fertig = j.finished_at ? Date.parse(j.finished_at) : null;
    const nochOffen = fertig === null || fertig >= ende;
    return nochOffen && Number.isFinite(faellig) && faellig <= ende - 86400000 && Date.parse(j.created_at) < ende;
  }).length;
  werte.offeneArbeitAelter24h = offenAlt;
  kriterien.keineOffeneArbeitAelter24h = offenAlt === 0;

  // K3 keine unbekannten Vorgaenge · K4 keine Dubletten · K5 keine haengenden Leases
  // — Momentaufnahmen der massgeblichen Quittung (erhoben nach Tagesende, siehe oben).
  const momentaufnahmeFrisch = Date.parse(q.erhobenUtc) - ende <= 86400000;
  werte.momentaufnahmeFrisch = momentaufnahmeFrisch;
  const m = q.momentaufnahme || {};
  werte.unbekannteVorgaenge = (m.cas || {}).unbekannt;
  werte.dubletten = m.dubletten;
  werte.haengendeLeases = m.haengendeLeases;
  kriterien.keineUnbekanntenVorgaenge = momentaufnahmeFrisch && Number((m.cas || {}).unbekannt) === 0;
  kriterien.keineDubletten = momentaufnahmeFrisch && Number(m.dubletten) === 0;
  kriterien.keineHaengendenLeases = momentaufnahmeFrisch && Number(m.haengendeLeases) === 0
    && Number(m.casAktiveLeases) === 0;

  // K6 keine unerwarteten endgueltigen Fehler (am Tag abgeschlossen mit Status fehlgeschlagen)
  const endgueltig = jobs.filter((j) => j.finished_at && utcTag(j.finished_at) === tag && j.status === "fehlgeschlagen").length;
  werte.endgueltigeFehler = endgueltig;
  kriterien.keineEndgueltigenFehler = endgueltig === 0;

  // K7 kein fehlendes Briefing: beide Briefing-Prozesse mit success-Quittung,
  // processed_count >= aktive Mandate (wo target_count vorliegt, zusaetzlich >= target).
  const aktiveMandate = Number((q.mandate || {}).aktiv);
  const briefingsHeute = laeufe.filter((l) => BRIEFING_PROZESSE.includes(l.process) && utcTag(l.started_at) === tag);
  const briefingBefunde = BRIEFING_PROZESSE.map((prozess) => {
    const lauf = briefingsHeute.filter((l) => l.process === prozess)
      .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0];
    if (!lauf) return { prozess, ok: false, grund: "keine Quittung" };
    if (lauf.status !== "success") return { prozess, ok: false, grund: `status ${lauf.status}` };
    const verarbeitet = Number(lauf.processed_count);
    if (!Number.isFinite(verarbeitet)) return { prozess, ok: false, grund: "processed_count fehlt" };
    if (Number.isFinite(aktiveMandate) && aktiveMandate > 0 && verarbeitet < aktiveMandate) {
      return { prozess, ok: false, grund: `${verarbeitet} von ${aktiveMandate}` };
    }
    if (Number.isFinite(Number(lauf.target_count)) && verarbeitet < Number(lauf.target_count)) {
      return { prozess, ok: false, grund: `${verarbeitet} von Ziel ${lauf.target_count}` };
    }
    return { prozess, ok: true };
  });
  werte.briefings = briefingBefunde;
  kriterien.keinFehlendesBriefing = briefingBefunde.every((b) => b.ok);

  // K8 KI-Deckel nicht erreicht (Deckelwert ist dokumentiert, nicht live bestaetigt)
  const tagesbudget = budget.find((b) => b.day === tag && b.scope === "global");
  const verbraucht = tagesbudget ? Number(tagesbudget.used) : 0;
  werte.kiVerbrauch = verbraucht;
  werte.kiDeckelDokumentiert = kiDeckel;
  kriterien.kiDeckelNichtErreicht = Number.isFinite(verbraucht) && verbraucht < kiDeckel;

  // K9 Slot p95 <= Grenze · K10 kein Einzelwert ueber Stopgrenze
  const slotDauern = laeufe
    .filter((l) => SLOT_PROZESSE.includes(l.process) && utcTag(l.started_at) === tag && Number.isFinite(Number(l.duration_ms)))
    .map((l) => Number(l.duration_ms));
  const p95 = p95NaechsterRang(slotDauern);
  werte.slots = slotDauern.length;
  werte.slotP95Ms = p95;
  werte.slotMaxMs = slotDauern.length ? Math.max(...slotDauern) : null;
  kriterien.slotP95InGrenze = slotDauern.length > 0 && p95 <= slotP95GrenzeMs;
  kriterien.keinEinzelwertUeberStop = slotDauern.length > 0 && Math.max(...slotDauern) <= slotStopMs;

  const alleGruen = Object.values(kriterien).every((wert) => wert === true);
  return {
    tag,
    gruen: !unvollstaendig && alleGruen,
    belegbar: true,
    ...(unvollstaendig ? { grund: "Lesung der Quittung war unvollstaendig (Zeilendeckel) — Tag NICHT gruen" } : {}),
    kriterien,
    werte
  };
}

// Bewertet ein Fenster aus N Tagen (Standard 7). Gruen nur, wenn JEDER Tag gruen ist.
function bewerteFenster(tage, quittungen, optionen = {}) {
  const ergebnisse = tage.map((tag) => bewerteTag(tag, quittungen, optionen));
  return {
    tage: ergebnisse,
    grueneTage: ergebnisse.filter((t) => t.gruen).length,
    fensterGruen: ergebnisse.length > 0 && ergebnisse.every((t) => t.gruen)
  };
}

// --- CLI -----------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) { args._.push(a); continue; }
    const name = a.slice(2);
    const naechstes = argv[i + 1];
    if (naechstes !== undefined && !naechstes.startsWith("--")) { args[name] = naechstes; i += 1; }
    else args[name] = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const archiv = String(args.archiv || "");

  if (args.sammeln) {
    if (!archiv) throw new Error("--archiv <verzeichnis> ist Pflicht fuer --sammeln");
    fs.mkdirSync(archiv, { recursive: true });
    const quittung = await sammleQuittung({ rueckblickTage: Number(args.rueckblick || 3) });
    const datei = path.join(archiv, `gruentage-${quittung.erhobenUtc.replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(datei, JSON.stringify(quittung, null, 2));
    console.log(`Quittung geschrieben: ${datei}`);
    console.log(`  erhoben ${quittung.erhobenUtc} · Lesung vollstaendig: ${quittung.lesungVollstaendig}`);
    console.log(`  aktive Mandate ${quittung.mandate.aktiv} · wartend ${quittung.momentaufnahme.wartend}`
      + ` · unbekannt ${quittung.momentaufnahme.cas.unbekannt} · Dubletten ${quittung.momentaufnahme.dubletten}`);
  }

  if (args.bewerten) {
    if (!archiv) throw new Error("--archiv <verzeichnis> ist Pflicht fuer --bewerten");
    const dateien = fs.readdirSync(archiv).filter((f) => f.startsWith("gruentage-") && f.endsWith(".json"));
    const quittungen = dateien.map((f) => JSON.parse(fs.readFileSync(path.join(archiv, f), "utf8")));
    const anzahlTage = Number(args.tage || 7);
    const heutigerTag = utcTag(new Date().toISOString());
    const tage = [];
    for (let i = anzahlTage; i >= 1; i -= 1) {
      tage.push(utcTag(new Date(Date.parse(`${heutigerTag}T00:00:00.000Z`) - i * 86400000).toISOString()));
    }
    const fenster = bewerteFenster(tage, quittungen, {
      kiDeckel: Number(args.deckel || KI_DECKEL_DOKUMENTIERT)
    });
    console.log(`\n== GRUENTAGE-BEWERTUNG (${anzahlTage} volle UTC-Tage bis gestern, ${quittungen.length} Quittungen) ==`);
    for (const t of fenster.tage) {
      if (!t.belegbar) { console.log(`  ${t.tag}  NICHT BELEGBAR — ${t.grund}`); continue; }
      const rot = Object.entries(t.kriterien).filter(([, wert]) => wert !== true).map(([name]) => name);
      console.log(`  ${t.tag}  ${t.gruen ? "GRUEN" : `ROT (${rot.join(", ") || t.grund})`}`
        + `  ankunft=${t.werte.ankunft} abfluss=${t.werte.abfluss}`
        + ` p95=${t.werte.slotP95Ms == null ? "n/v" : Math.round(t.werte.slotP95Ms / 100) / 10 + "s"}`
        + ` max=${t.werte.slotMaxMs == null ? "n/v" : Math.round(t.werte.slotMaxMs / 100) / 10 + "s"}`
        + ` ki=${t.werte.kiVerbrauch}`);
    }
    console.log(`\n  Gruene Tage: ${fenster.grueneTage} von ${anzahlTage} · Fenster gruen: ${fenster.fensterGruen ? "JA" : "NEIN"}`);
    console.log("  Hinweis: KI-Deckel-Vergleichswert ist der dokumentierte Wert; der live gesetzte");
    console.log("  Production-Deckel ist aus dieser Umgebung nicht lesbar (CURRENT_STATE §4).");
    if (args.bericht) {
      fs.writeFileSync(String(args.bericht), JSON.stringify(fenster, null, 2));
      console.log(`  Bericht geschrieben: ${args.bericht}`);
    }
  }

  if (!args.sammeln && !args.bewerten) {
    console.log("Aufruf: node scripts/gruentage-auswertung.js --sammeln --archiv <dir> [--rueckblick 3]");
    console.log("        node scripts/gruentage-auswertung.js --bewerten --archiv <dir> [--tage 7] [--deckel 100] [--bericht out.json]");
    console.log("Beide Modi sind rein lesend; --sammeln braucht SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY aus process.env.");
  }
}

module.exports = {
  SCHEMA,
  SLOT_BUDGET_MS,
  SLOT_P95_GRENZE_MS,
  SLOT_STOP_MS,
  KI_DECKEL_DOKUMENTIERT,
  SLOT_PROZESSE,
  BRIEFING_PROZESSE,
  p95NaechsterRang,
  utcTag,
  tagGueltig,
  bewerteTag,
  bewerteFenster
};

if (require.main === module) {
  main().catch((fehler) => {
    console.error(`FEHLER: ${fehler && fehler.message}`);
    process.exit(1);
  });
}
