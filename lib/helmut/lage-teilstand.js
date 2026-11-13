"use strict";

// Enger Ausgabevertrag fuer genau einen positiv geprueften Absatz eines
// vollstaendig gebundenen Zweiabsatzurteils. Kein Modell und kein Vollstatus.
const { isDeepStrictEqual: gleich } = require("node:util");
const B = require("./briefing-speicher"), E = require("./lage-quellenbeleg"), Q = require("./lage-textqualitaet");
const F = require("./briefing-frische"), P = require("./publication-eligibility");
const SLOT = "lage-teilstand", VERSION = 1, MAX_BYTES = 128 * 1024;
const HINWEIS = "Teilstand: Ein geprüfter Absatz ist verfügbar; ein weiterer wurde wegen fehlenden Profilbezugs zurückgehalten.";
const hash = B.hash, hex = (v, n = 64) => typeof v === "string" && new RegExp(`^[a-f0-9]{${n}}$`).test(v);
const exakt = (v, keys) => v && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const need = (ok, why) => { if (!ok) throw Error("lage-teilstand-" + why); };
const satz = value => typeof value === "string" && value.trim() && value.length <= 800;
function kennung(userId, tag, eingabeHash) {
  require("./storage").assertTenant(userId, "lageTeilstandKennung");
  need(/^\d{4}-\d{2}-\d{2}$/.test(tag || "") && hex(eingabeHash), "kennung");
  return `bf-${userId}-${SLOT}-${tag}-${eingabeHash}`;
}
function phase(row, { userId, tag, eingabeHash, art, now }) {
  const p = row?.payload;
  need(row?.user_id === userId && row.slot === "lage-verarbeitung" && p?.phase === art
    && p.tag === tag && p.eingabeHash === eingabeHash && p.auslieferbar === false
    && F.berlinTagKey(row.generated_at) === tag && Date.parse(row.generated_at) <= new Date(now).getTime(), "originalbindung");
  const expected = require("./lage-verarbeitungsbeleg").eintrag({ userId, tag, eingabeHash,
    phase: art, owner: p.owner, antwort: p.antwort, now: row.generated_at });
  need(row.id === expected.id && gleich(p, expected.payload), "originalhash");
  return { id: row.id, user_id: userId, slot: row.slot,
    generated_at: new Date(row.generated_at).toISOString(), payload: structuredClone(p) };
}
function auswahl(originale, quellen, profile, args) {
  need(exakt(originale, ["entwurf", "pruefung"]), "originale");
  const entwurf = phase(originale.entwurf, { ...args, art: "entwurf" });
  const pruefung = phase(originale.pruefung, { ...args, art: "pruefung" });
  need(entwurf.payload.owner === pruefung.payload.owner, "originalowner");
  const raw = entwurf.payload.antwort, urteil = pruefung.payload.antwort;
  need(exakt(raw, ["paragraphs"]) && Array.isArray(raw.paragraphs) && raw.paragraphs.length === 2
    && raw.paragraphs.every(p => exakt(p, ["vorgang_ids", "quelle_id", "auswahlbegruendung", "mandatsbezug", "text"])
      && exakt(p.mandatsbezug, ["feld", "wert"]))
    && exakt(urteil, ["pruefungen", "vergleiche"]) && Array.isArray(urteil.pruefungen)
    && urteil.pruefungen.length === 2 && Array.isArray(urteil.vergleiche) && urteil.vergleiche.length === 1, "urteilsumfang");
  const paragraphs = require("./ai").assembleLageParagraphs(raw, quellen, profile);
  need(paragraphs.length === 2 && raw.paragraphs.every(p => Q.mandatsbegruendungGebunden(p.auswahlbegruendung, p.mandatsbezug)), "entwurfsbindung");
  const genaueQuellen = Q.pruefQuellen(paragraphs, quellen);
  need(Q.sachdetailsGebunden(paragraphs.map(p => ({ ...p, quellen_ids: [p.quelle_id] })), genaueQuellen, args.now), "originalsachdetails");
  const keys = ["absatz", "quelle_id", "belegfeld", "pruefbegruendung", "vollstaendig_belegt",
    "themenrein", "mandatsbegruendung", "profilbezug", "textart"];
  need(new Set(urteil.pruefungen.map(r => r?.absatz)).size === 2, "urteilsindizes");
  for (const r of urteil.pruefungen) {
    need(exakt(r, keys) && [0, 1].includes(r.absatz) && typeof r.profilbezug === "boolean"
      && r.vollstaendig_belegt === true && r.themenrein === true && r.textart === "konkreter_sachverhalt"
      && satz(r.pruefbegruendung) && Q.mandatsbegruendungGebunden(r.mandatsbegruendung, paragraphs[r.absatz].mandatsbezug)
      && r.quelle_id === paragraphs[r.absatz].quelle_id && ["titel", "auszug"].includes(r.belegfeld), "einzelurteil");
    const quelle = quellen.flatMap(v => v.quellenbelege).find(q => q.quelle_id === r.quelle_id);
    need(typeof quelle?.[r.belegfeld] === "string" && quelle[r.belegfeld].trim().length >= 12, "originalbelegstelle");
  }
  const pair = urteil.vergleiche[0];
  need(exakt(pair, ["erster_absatz", "zweiter_absatz", "eigenstaendige_sachverhalte", "pruefbegruendung"])
    && pair.erster_absatz === 0 && pair.zweiter_absatz === 1 && pair.eigenstaendige_sachverhalte === true
    && satz(pair.pruefbegruendung), "paarurteil");
  const negative = urteil.pruefungen.filter(r => r.profilbezug === false);
  const positive = urteil.pruefungen.filter(r => r.profilbezug === true);
  need(negative.length === 1 && positive.length === 1, "profilausschluss");
  const original = Q.pruefe(paragraphs, quellen, urteil, profile);
  need(original.ok === false && original.grund === "ai-text-source-support"
    && gleich(original.diagnose, { absatz: negative[0].absatz, fehler: ["profilbezug-fehlt"] }), "originalablehnung");
  const index = positive[0].absatz;
  // Ausschliesslich der Index der POSITIVEN Kopie wechselt. Das negative
  // Originalurteil wird weder veraendert noch in eine Zustimmung umgedeutet.
  const checked = Q.pruefe([paragraphs[index]], quellen,
    { pruefungen: [{ ...positive[0], absatz: 0 }], vergleiche: [] }, profile);
  need(checked.ok === true && checked.paragraphs.length === 1
    && checked.paragraphs[0].text === paragraphs[index].text
    && Q.sachdetailsGebunden(checked.paragraphs, quellen, args.now), "subsetpruefung");
  return { originale: { entwurf, pruefung }, index, ausgeschlossen: negative[0].absatz,
    paragraphs: checked.paragraphs, qualitaet: { ...checked.qualitaet, teilstand: true,
      originalAbsaetze: 2, freigegeben: 1, zurueckgehalten: 1, vollstaendigeFaktenpruefung: false } };
}
function ohneHash(payload) { const { inhaltHash, ...data } = payload; return data; }
function pruefeZeile(row, { userId, tag, profile, eingabe = null, now = new Date() }) {
  require("./storage").assertTenant(userId, "lageTeilstandPruefen");
  const p = row?.payload;
  need(profile?.id === userId && F.berlinTagKey(now) === tag && p?.version === VERSION
    && p.mandat === userId && p.tag === tag && p.profilHash === B.profilHash(profile)
    && exakt(p.eingabe, ["koSetHash", "quellenHash", "profilHash"]) && hex(p.eingabe.koSetHash, 32)
    && hex(p.eingabe.quellenHash) && p.eingabe.profilHash === p.profilHash
    && p.koSetHash === p.eingabe.koSetHash && p.quellenHash === p.eingabe.quellenHash
    && (!eingabe || gleich(p.eingabe, eingabe)), "kontextbindung");
  need(row.id === kennung(userId, tag, hash(p.eingabe)) && row.user_id === userId && row.slot === SLOT
    && p.generatedAt === new Date(row.generated_at).toISOString()
    && F.berlinTagKey(p.generatedAt) === tag && Date.parse(p.generatedAt) <= new Date(now).getTime()
    && Buffer.byteLength(JSON.stringify(row)) <= MAX_BYTES && p.inhaltHash === hash(ohneHash(p)), "ausgabebindung");
  need(p.quellenVersion === E.VERSION && Array.isArray(p.quellen) && p.quellen.length > 0
    && p.quellen.length <= 500 && E.hashEingabe(p.quellen) === p.quellenHash, "quellenbindung");
  P.assertRecorded(p.publicationEligibilityPolicy);
  need(p.quellenschutzHash === require("./tagespaket-auslieferung").sicherheitsHash(), "quellenschutz");
  for (const v of p.quellen) {
    need(!P.held(v, v.quellenbelege.map(q => ({ url: q.url }))), "publikation");
    for (const q of v.quellenbelege) {
      const link = require("./sourceSafety").assessLink(q.url);
      need(E.artikelUrl(q.url) === q.url && !link.suspicious && !link.aggregator, "quelle-gesperrt");
    }
  }
  const checked = auswahl(p.provenienz?.originale, p.quellen, profile,
    { userId, tag, eingabeHash: hash(p.eingabe), now });
  need(exakt(p.provenienz, ["version", "originale", "originalIndex", "ausgeschlossen", "ausgabeHash"])
    && p.provenienz.version === VERSION && p.provenienz.originalIndex === checked.index
    && p.provenienz.ausgeschlossen === checked.ausgeschlossen
    && p.provenienz.ausgabeHash === hash(checked.paragraphs)
    && gleich(p.paragraphs, checked.paragraphs) && gleich(p.qualitaet, checked.qualitaet), "provenienz");
  return row;
}
function gueltig(payload, args = {}) {
  try { pruefeZeile({ id: kennung(payload.mandat, payload.tag, hash(payload.eingabe)), user_id: payload.mandat,
    slot: SLOT, generated_at: payload.generatedAt, payload }, args); return true; } catch { return false; }
}
function publicInfo(payload) {
  return { version: VERSION, eingabeHash: hash(payload.eingabe), belegHash: payload.inhaltHash,
    freigegeben: 1, zurueckgehalten: 1, vollstaendig: false, hinweis: HINWEIS };
}
async function lese({ userId, tag, profile, eingabe, now = new Date(), storage = require("./storage") }) {
  const row = await storage.getLageTeilstand(userId, tag, hash(eingabe));
  return row ? pruefeZeile(row, { userId, tag, profile, eingabe, now }) : null;
}
async function materialisiere({ userId, tag, profile, eingabe, quellen, now = new Date(), storage = require("./storage") }) {
  const args = { userId, tag, profile, eingabe, now };
  const existing = await lese({ ...args, storage }); if (existing) return existing;
  const eingabeHash = hash(eingabe), originals = await Promise.all(["entwurf", "pruefung"].map(art =>
    storage.getLageVerarbeitungsbeleg(userId, `bf-${userId}-lage-verarbeitung-${tag}-${eingabeHash}-${art}`)));
  const checked = auswahl({ entwurf: originals[0], pruefung: originals[1] }, quellen, profile,
    { userId, tag, eingabeHash, now });
  const payload = { version: VERSION, mandat: userId, tag, profilHash: B.profilHash(profile), eingabe,
    koSetHash: eingabe.koSetHash, quellenHash: eingabe.quellenHash, quellenVersion: E.VERSION, quellen,
    paragraphs: checked.paragraphs, qualitaet: checked.qualitaet, generatedAt: new Date(now).toISOString(),
    publicationEligibilityPolicy: P.publicInfo(), quellenschutzHash: require("./tagespaket-auslieferung").sicherheitsHash(),
    provenienz: { version: VERSION, originale: checked.originale, originalIndex: checked.index,
      ausgeschlossen: checked.ausgeschlossen, ausgabeHash: hash(checked.paragraphs) } };
  payload.inhaltHash = hash(payload);
  const entry = { id: kennung(userId, tag, eingabeHash), user_id: userId, slot: SLOT,
    generated_at: payload.generatedAt, payload };
  pruefeZeile(entry, args);
  try { await storage.insertLageTeilstand(entry, { profile, now }); } catch { /* Schreibausgang nur durch Readback klaeren. */ }
  const row = await lese({ ...args, storage });
  const inhalt = p => { const { generatedAt, inhaltHash, ...data } = p; return data; };
  need(row && gleich(inhalt(row.payload), inhalt(payload)), "speicherung-nicht-bestaetigt");
  return row;
}
module.exports = { SLOT, VERSION, MAX_BYTES, HINWEIS, kennung, pruefeZeile, gueltig, publicInfo, lese, materialisiere };
