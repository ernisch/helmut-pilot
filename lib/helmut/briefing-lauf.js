"use strict";

// Helmut — LAUF-QUITTUNG des morgendlichen Briefings (Beleg des Frischevertrags).
// =============================================================================
// Der Frischevertrag (`briefing-frische.js`) beantwortet die Frage „gilt der
// gezeigte Stand als heutiges Briefing?" — beantworten kann er sie nur, wenn ein
// BELEG existiert, dass fuer diesen Mandanten an diesem Berliner Kalendertag ein
// Briefing erzeugt wurde. Dieses Modul ist dieser Beleg.
//
// ABLAGE: die bereits bestehende V3-Tabelle `briefings` (mandantengefiltert ueber
// storage.getRenderedBriefingV3/saveRenderedBriefingV3, id = bf-<mandat>-<slot>-<tag>).
// KEINE neue Tabelle, KEINE Migration, kein neuer Speicherweg.
//
// SCHREIBREGEL (CLAUDE.md §4.10 — gemeinsam genutzter Zustand):
//   * ERFOLG und FEHLER liegen in ZWEI VERSCHIEDENEN Zeilen. Damit gibt es kein
//     Lesen→Ändern→Schreiben und keinen Fall, in dem ein spaeterer fehlgeschlagener
//     Lauf einen bereits belegten Erfolg desselben Tages ueberschreibt.
//   * Jeder Schreibvorgang ist EIN atomarer Upsert eines vollstaendigen Objekts,
//     das ausschliesslich aus dem EIGENEN Lauf entsteht — nie aus einer Verschmelzung
//     mit gelesenem Fremdzustand.
//   * Verlieren zwei gleichzeitige ERFOLGS-Laeufe desselben Tages ein Update
//     gegeneinander, bleibt der Erfolgsbeleg bestehen; hoechstens der Fensteranfang
//     ist dann AELTER als noetig. Der Fehler wirkt also nur in die sichere Richtung
//     (mehr „neu" statt faelschlich „nichts Neues") — nie in Richtung falsches Gruen.
//   * Wer einen Erfolg MELDET, liest ihn zurueck (`verifiziert`) oder meldet den
//     Persistenzfehler ausdruecklich (`fehler`). Kein stilles „gespeichert".

const crypto = require("crypto");
const frische = require("./briefing-frische");

const SLOT_ERFOLG = "morgenlage";
const SLOT_FEHLER = "morgenlage-fehler";
const STATUS_ERFOLG = "erfolg";
const STATUS_FEHLER = "fehler";

// Ausloeser eines Laufs — rein beschreibend, veraendert das Urteil NICHT.
const AUSLOESER_MORGENLAUF = "morgenlauf";   // planmaessiger Cron
const AUSLOESER_NACHLAUF = "nachlauf";       // spaeterer/verspaeteter Lauf (Watchdog)
const AUSLOESER_LESEPFAD = "lesepfad";       // beim Öffnen der App erzeugt

function laufId(tenantId, tagKey, slot = SLOT_ERFOLG) {
  if (!tenantId || !tagKey) return null;
  return `bf-${tenantId}-${slot}-${tagKey}`;
}

// Inhaltssignatur eines erzeugten Briefings: stabil, ohne Texte, ohne PII.
// Sie beantwortet genau eine Frage — „hat sich gegenueber dem bereits belegten
// Lauf dieses Tages etwas geaendert?" — und ist damit die Grundlage dafuer,
// Wiederholungslaeufe ohne doppelte Arbeit und ohne doppelten Push zu beenden.
function inhaltsSignatur(briefing = {}) {
  const state = (briefing && briefing.currentHelmutState) || {};
  const teile = [];
  teile.push(String(briefing.available === true));
  teile.push(String(state.status || ""));
  teile.push(String(state.primaryVorgangId || ""));
  teile.push(String((state.primaryItem && state.primaryItem.lastUpdated) || ""));
  const items = Array.isArray(state.items) ? state.items : [];
  for (const item of items) {
    if (!item) continue;
    teile.push(`${item.id || ""}@${item.lastUpdated || ""}`);
  }
  teile.sort();
  return crypto.createHash("sha256").update(teile.join("|")).digest("hex").slice(0, 32);
}

// Die Quittung selbst — bewusst klein: Kennzahlen und Zeitpunkte, KEINE
// Briefingtexte, keine Quellen-URLs, keine personenbezogenen Inhalte.
function quittung({
  tenantId,
  berlinTag,
  status,
  ausloeser = AUSLOESER_MORGENLAUF,
  erzeugtAm = new Date(),
  fensterStart = null,
  vorherErfolgAt = null,
  signatur = null,
  kennzahlen = null,
  quellen = null,
  datenstand = null,
  grund = null
} = {}) {
  const at = erzeugtAm instanceof Date ? erzeugtAm : new Date(erzeugtAm || Date.now());
  return {
    vertragVersion: frische.VERTRAG_VERSION,
    tenantId: tenantId || null,
    berlinTag: berlinTag || frische.berlinTagKey(at),
    status: status === STATUS_ERFOLG ? STATUS_ERFOLG : STATUS_FEHLER,
    ausloeser,
    erzeugtAm: Number.isNaN(at.getTime()) ? null : at.toISOString(),
    fensterStart: fensterStart || null,
    vorherErfolgAt: vorherErfolgAt || null,
    signatur: signatur || null,
    kennzahlen: kennzahlen && typeof kennzahlen === "object" ? kennzahlen : null,
    quellen: quellen && typeof quellen === "object" ? quellen : null,
    datenstand: datenstand || null,
    grund: grund || null
  };
}

function ausZeile(row) {
  if (!row || typeof row !== "object") return null;
  const payload = row.payload && typeof row.payload === "object" ? row.payload : null;
  if (!payload) return null;
  return {
    ...payload,
    erzeugtAm: payload.erzeugtAm || row.generated_at || null,
    berlinTag: payload.berlinTag || frische.berlinTagKey(row.generated_at || null)
  };
}

// --- Lesen ------------------------------------------------------------------
// Fail-safe: jeder Speicherfehler ergibt `null` + `fehler` — NIE eine erfundene
// Quittung. Ohne Beleg gilt der Vertrag als nicht erfuellt (ehrlich „noch nicht
// aktuell"), nicht als erfuellt.
async function ladeErfolg(storage, tenantId, tagKey) {
  if (!storage || typeof storage.getRenderedBriefingV3 !== "function") return { lauf: null, fehler: "kein-speicher" };
  if (!tenantId || !tagKey) return { lauf: null, fehler: "kein-mandat-oder-tag" };
  try {
    const row = await storage.getRenderedBriefingV3(tenantId, SLOT_ERFOLG, tagKey);
    return { lauf: ausZeile(row), fehler: null };
  } catch (error) {
    return { lauf: null, fehler: (error && error.message) || "lesefehler" };
  }
}

async function ladeFehler(storage, tenantId, tagKey) {
  if (!storage || typeof storage.getRenderedBriefingV3 !== "function") return { lauf: null, fehler: "kein-speicher" };
  if (!tenantId || !tagKey) return { lauf: null, fehler: "kein-mandat-oder-tag" };
  try {
    const row = await storage.getRenderedBriefingV3(tenantId, SLOT_FEHLER, tagKey);
    return { lauf: ausZeile(row), fehler: null };
  } catch (error) {
    return { lauf: null, fehler: (error && error.message) || "lesefehler" };
  }
}

// Der Lauf-Beleg des heutigen Tages, wie ihn der Vertrag braucht: ein Erfolg
// schlaegt einen Fehlversuch desselben Tages (das Briefing IST entstanden), ein
// Fehlversuch ohne Erfolg wird ehrlich als fehlgeschlagen gemeldet.
async function ladeTageslauf(storage, tenantId, tagKey) {
  const erfolg = await ladeErfolg(storage, tenantId, tagKey);
  if (erfolg.lauf) return { lauf: erfolg.lauf, quelle: "erfolg", fehler: null };
  const fehler = await ladeFehler(storage, tenantId, tagKey);
  if (fehler.lauf) return { lauf: fehler.lauf, quelle: "fehler", fehler: null };
  return { lauf: null, quelle: null, fehler: erfolg.fehler || fehler.fehler || null };
}

// Letzter erfolgreicher Lauf VOR dem heutigen Tag — Anfang des Briefingfensters
// („neu seit dem letzten erfolgreichen Morgenbriefing"). Es werden hoechstens
// `maxTage` Tage rueckwaerts geprueft; danach greift der Vorabend-Standard.
async function ladeLetztenErfolg(storage, tenantId, tagKey, { maxTage = 7, inklusiveHeute = true } = {}) {
  if (!tagKey) return { erzeugtAm: null, tag: null, geprueft: 0 };
  let geprueft = 0;
  for (let i = inklusiveHeute ? 0 : 1; i <= maxTage; i += 1) {
    const tag = frische.berlinTagVerschieben(tagKey, -i);
    if (!tag) break;
    geprueft += 1;
    const { lauf } = await ladeErfolg(storage, tenantId, tag);
    if (lauf && lauf.status === STATUS_ERFOLG && lauf.erzeugtAm) {
      return { erzeugtAm: lauf.erzeugtAm, tag, geprueft };
    }
  }
  return { erzeugtAm: null, tag: null, geprueft };
}

// --- Schreiben --------------------------------------------------------------
// EIN atomarer Upsert, danach Rueckgabe des tatsaechlich persistierten Standes.
// `verifiziert` ist NUR true, wenn der zurueckgelesene Beleg denselben Tag,
// denselben Status und dieselbe Signatur traegt.
async function schreibeQuittung(storage, q) {
  const slot = q && q.status === STATUS_ERFOLG ? SLOT_ERFOLG : SLOT_FEHLER;
  const id = laufId(q && q.tenantId, q && q.berlinTag, slot);
  if (!id) return { gespeichert: false, verifiziert: false, fehler: "kein-mandat-oder-tag" };
  if (!storage || typeof storage.saveRenderedBriefingV3 !== "function") {
    return { gespeichert: false, verifiziert: false, fehler: "kein-speicher" };
  }
  let ergebnis;
  try {
    ergebnis = await storage.saveRenderedBriefingV3({
      id,
      user_id: q.tenantId,
      slot,
      generated_at: q.erzeugtAm || new Date().toISOString(),
      payload: q
    });
  } catch (error) {
    return { gespeichert: false, verifiziert: false, fehler: (error && error.message) || "schreibfehler" };
  }
  if (!ergebnis || ergebnis.saved !== true) {
    return { gespeichert: false, verifiziert: false, fehler: (ergebnis && (ergebnis.reason || ergebnis.error)) || "nicht-gespeichert" };
  }
  // Gegenlesen: eine Erfolgsmeldung ohne persistierten Stand waere genau das
  // „falsche Gruen", das der Vertrag verhindern soll.
  const zurueck = slot === SLOT_ERFOLG
    ? await ladeErfolg(storage, q.tenantId, q.berlinTag)
    : await ladeFehler(storage, q.tenantId, q.berlinTag);
  const gelesen = zurueck.lauf;
  const verifiziert = Boolean(
    gelesen && gelesen.berlinTag === q.berlinTag && gelesen.status === q.status
    && (!q.signatur || gelesen.signatur === q.signatur)
  );
  return {
    gespeichert: true,
    verifiziert,
    id,
    fehler: verifiziert ? null : (zurueck.fehler || "nicht-verifizierbar"),
    persistiert: gelesen || null
  };
}

// --- Wiederholungserkennung (Punkt 9) ---------------------------------------
// Ein zweiter Lauf am selben Tag mit unveraendertem Inhalt ist eine Wiederholung:
// kein zweites Briefing, kein zweiter Push, KEIN weiterer Schreibvorgang und —
// da der Frischevertrag bereits erfuellt ist — auch kein Anlass fuer weitere
// Modellaufrufe im Nachgang (das Narrativ liegt fuer diesen Tag im Cache).
function istWiederholung(vorher, signatur) {
  if (!vorher || vorher.status !== STATUS_ERFOLG) return false;
  if (!signatur || !vorher.signatur) return false;
  return vorher.signatur === signatur;
}

module.exports = {
  SLOT_ERFOLG,
  SLOT_FEHLER,
  STATUS_ERFOLG,
  STATUS_FEHLER,
  AUSLOESER_MORGENLAUF,
  AUSLOESER_NACHLAUF,
  AUSLOESER_LESEPFAD,
  laufId,
  inhaltsSignatur,
  quittung,
  ausZeile,
  ladeErfolg,
  ladeFehler,
  ladeTageslauf,
  ladeLetztenErfolg,
  schreibeQuittung,
  istWiederholung
};
