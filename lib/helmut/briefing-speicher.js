"use strict";

// Persistierter Ausgabevertrag, getrennt von der reinen Morgenlaufquittung.
// Kein eigener Generator: gespeichert wird der regulaere V3-App-Vertrag.
const { isDeepStrictEqual } = require("node:util");
const { berlinTagKey } = require("./briefing-frische");
const crypto = require("node:crypto");
const SLOT = "mandatsbriefing";
const VERSION = 1;
function stabil(value) {
  if (Array.isArray(value)) return value.map(stabil);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, stabil(value[k])]));
  return value;
}
const hash = value => crypto.createHash("sha256").update(JSON.stringify(stabil(value))).digest("hex");
const profilHash = profile => hash(require("./lage-textqualitaet").profilKontext(profile));

function lageAusgabe(payload) {
  if (!payload) return null;
  const sources = Object.fromEntries((payload.quellen || []).map(v => [v.vorgang_id,
    v.quellenbelege.map(q => ({ quelleId: q.quelle_id, name: q.quelle, title: q.titel, url: q.url, publishedAt: q.veroeffentlichtAm }))]));
  return require("./lage").finalize(payload, [], sources, { fromCache: true });
}

function pruefeInhalt(briefing, lage) {
  const fehler = [];
  if (!briefing || typeof briefing.available !== "boolean" || !Array.isArray(briefing.items))
    fehler.push("briefing-vertrag-fehlt");
  if (!briefing?.available || !briefing?.items?.length) fehler.push("briefing-ohne-fachinhalt");
  if (!briefing?.currentHelmutState || !briefing?.currentRadarState) fehler.push("app-ansichten-unvollstaendig");
  if (!lage?.paragraphs?.length) fehler.push("lage-text-fehlt");
  if (!lage?.qualitaet || lage.qualitaet.version !== require("./lage-textqualitaet").VERSION)
    fehler.push("lage-quellenpruefung-fehlt");
  const visible = [];
  function walk(value, path = "briefing") {
    if (!value || typeof value !== "object") return;
    for (const [key, v] of Object.entries(value)) {
      if (typeof v === "string" && /^(text|summary|displaySummary|assessment|action|recommendation|whyRelevant|title)$/.test(key)) {
        visible.push({ path: path + "." + key, text: v, key,
          vorgangId: value.vorgangId || (/^vg-/.test(value.id || "") ? value.id : null),
          documentId: value.documentId || null, sourceIds: value.sourceIds || [] });
        if (/\bvorgang_ids\b|\b(?:vg|rd)-[\p{L}0-9][\p{L}0-9-]+|\bq-[a-f0-9]{20}\b/iu.test(v)) fehler.push("sichtbare-technische-kennung");
      } else if (typeof v === "object") walk(v, path + "." + key);
    }
  }
  // Wie renderRadarInner: bei vorhandener Anzeige werden nur deren Inhalte
  // gerendert. Rohzuordnungen bleiben als Beleg erhalten und sind kein UI Text.
  walk({ ...briefing, currentRadarState: briefing?.currentRadarState?.anzeige || briefing?.currentRadarState });
  // Die vertraglichen Aliase (items/homeSections etc.) sind dieselben Daten.
  // Nur wortgleiche lange Texte zwischen den drei sichtbaren Rollen markieren.
  const lageTexte = new Set((lage?.paragraphs || []).map(p => String(p.text || "").trim().toLocaleLowerCase("de")));
  const helmutTexte = new Set(visible.filter(v => /currentHelmutState/.test(v.path))
    .map(v => v.text.trim().toLocaleLowerCase("de")));
  // Derselbe Artikel darf in beiden Rollen mit seinem Originaltitel benannt
  // werden. Nur belegte Aliase aus identischem Vorgang UND Quelldokument sind
  // ausgenommen; gleiche Fliesstexte und fremde Quellen bleiben Fehler.
  const titelAlias = v => v.key === "title" && v.vorgangId && v.documentId
    && visible.some(h => /currentHelmutState/.test(h.path) && h.key === "title"
      && h.vorgangId === v.vorgangId && Array.isArray(h.sourceIds) && h.sourceIds.includes(v.documentId)
      && h.text.trim().toLocaleLowerCase("de") === v.text.trim().toLocaleLowerCase("de"));
  const wiederholungen = visible.filter(v => /current(?:Helmut|Radar)State/.test(v.path)
    && v.text.length > 80 && (lageTexte.has(v.text.trim().toLocaleLowerCase("de"))
      || (/currentRadarState/.test(v.path) && helmutTexte.has(v.text.trim().toLocaleLowerCase("de"))
        && !titelAlias(v)))).map(v => v.path);
  if (wiederholungen.length) fehler.push("wiederholung-zwischen-ansichten");
  return { version: VERSION, strukturellVollstaendig: fehler.length === 0,
    fehler: [...new Set(fehler)], wiederholungen,
    quellenUndProfilbezugBriefing: "vertiefte-pruefung-offen",
    vollstaendigeFaktenpruefung: false, bestanden: false };
}

async function lese({ userId, day, profile, storage = require("./storage") }) {
  storage.assertTenant(userId, "briefingNachweisLesen");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) throw new Error("briefing-tag-ungueltig");
  const row = await storage.getRenderedBriefingV3(userId, SLOT, day, { strict: true });
  if (!row) return null;
  const p = row.payload;
  if (row.user_id !== userId || row.id !== `bf-${userId}-${SLOT}-${day}` || row.slot !== SLOT
    || !p || p.version !== VERSION || p.mandat !== userId || p.tag !== day
    || p.inhaltHash !== hash({ briefing: p.briefing, lage: p.lage })
    || (profile && p.profilHash !== profilHash(profile))) throw new Error("briefing-nachweis-abweichend");
  return row;
}

async function materialisiere({ profile, userId, build, briefing, storage = require("./storage"), now = new Date() }) {
  storage.assertTenant(userId, "briefingMaterialisieren");
  if (!profile || profile.id !== userId) throw new Error("briefing-profil-abweichend");
  const day = berlinTagKey(now);
  const vorhanden = await lese({ userId, day, profile, storage });
  const bestehendesErgebnis = () => ({ ok: true, gespeichert: true, bereitsVorhanden: true, id: vorhanden.id,
    vollstaendig: vorhanden.payload.pruefung.strukturellVollstaendig, qualitaetBestanden: vorhanden.payload.pruefung.bestanden });
  if (vorhanden?.payload.pruefung.strukturellVollstaendig) return bestehendesErgebnis();
  const text = await storage.getRenderedBriefingV3(userId, "lage", day, { strict: true });
  const lage = text?.payload || null;
  if (vorhanden && isDeepStrictEqual(lage, vorhanden.payload.lage)
    && vorhanden.payload.briefing.available === true
    && vorhanden.payload.pruefung.fehler.every(f => ["lage-text-fehlt", "lage-quellenpruefung-fehlt"].includes(f)))
    return bestehendesErgebnis();
  const b = briefing || await build(profile, userId);
  if (!b || ["store-error", "v3-store-disabled"].includes(b.reason)) throw new Error("briefing-speicherquelle-gestoert");
  const generatedAt = new Date(now).toISOString();
  const payload = { version: VERSION, mandat: userId, tag: day, profilHash: profilHash(profile),
    briefing: b, lage, inhaltHash: hash({ briefing: b, lage }), pruefung: pruefeInhalt(b, lage), erzeugtAm: generatedAt };
  if (vorhanden && payload.inhaltHash === vorhanden.payload.inhaltHash) return bestehendesErgebnis();
  if (vorhanden) payload.vorherigerStand = vorhanden;
  const entry = { id: `bf-${userId}-${SLOT}-${day}`, user_id: userId, slot: SLOT, generated_at: generatedAt, payload };
  const saved = vorhanden ? await storage.ergaenzeUnvollstaendigesBriefing(vorhanden, entry)
    : await storage.insertRenderedBriefingV3(entry);
  if (saved.saved !== true && saved.reason !== "existing-result") throw new Error("briefing-speicherung-fehlgeschlagen");
  const readback = await lese({ userId, day, profile, storage });
  if (!readback || (saved.saved === true && !isDeepStrictEqual(readback.payload, payload)))
    throw new Error("briefing-speicherung-nicht-bestaetigt");
  return { ok: true, gespeichert: true, bereitsVorhanden: saved.saved !== true, id: entry.id,
    vollstaendig: readback.payload.pruefung.strukturellVollstaendig, qualitaetBestanden: readback.payload.pruefung.bestanden };
}

module.exports = { SLOT, VERSION, hash, profilHash, pruefeInhalt, lageAusgabe, lese, materialisiere };
