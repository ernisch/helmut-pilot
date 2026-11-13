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
const PROFIL_HASH_VERSION = 2;
function inhaltHash(payload) {
  return hash({ briefing: payload.briefing, lage: payload.lage,
    ...(Object.hasOwn(payload, "lageAnsicht") ? { lageAnsicht: payload.lageAnsicht } : {}),
    ...(Object.hasOwn(payload, "quellenStand") ? { quellenStand: payload.quellenStand } : {}) });
}
function profilHash(profile, version = PROFIL_HASH_VERSION) {
  if (version !== 1 && version !== PROFIL_HASH_VERSION) throw new Error("briefing-nachweis-abweichend");
  const kontext = { ...require("./lage-textqualitaet").profilKontext(profile) };
  // Version 1 ist der exakt bisherige Kontext, kein geratenes Ersatzprofil.
  // Ausschliesslich beim ausdruecklichen historischen Lesen alter Belege nutzen.
  if (version === 1) delete kontext.stellvertretende_ausschuesse;
  return hash(kontext);
}
function profilBindungsstand(row) {
  const p = row?.payload || {};
  const version = Object.hasOwn(p, "profilHashVersion") ? p.profilHashVersion : 1;
  if (version !== 1 && version !== PROFIL_HASH_VERSION) throw new Error("briefing-nachweis-abweichend");
  return { version, stellvertretungenImProfilhash: version === PROFIL_HASH_VERSION };
}

function lageAusgabe(payload) {
  if (!payload) return null;
  const sources = Object.fromEntries((payload.quellen || []).map(v => [v.vorgang_id,
    v.quellenbelege.map(q => ({ quelleId: q.quelle_id, name: q.quelle, title: q.titel, url: q.url, publishedAt: q.veroeffentlichtAm }))]));
  const ausgabe = require("./lage").finalize(payload, [], sources, { fromCache: true });
  // Die App zeigt Vorgangskarten und deren Detailtexte, nicht das separate
  // paragraphs-Feld. Nur gueltige gespeicherte Quellenabsaetze uebertragen;
  // keine aktuellen KO-Texte, neue Einordnung oder unbelegten Quellen beimischen.
  if (require("./lage-quellenbeleg").gespeicherterTextGueltig(payload)) {
    const gruppen = new Map();
    for (const absatz of ausgabe.paragraphs) {
      const id = absatz.vorgangIds[0];
      if (!gruppen.has(id)) gruppen.set(id, { vorgangId: id, displayTitle: absatz.sources[0].title,
        displaySummary: "", sources: [] });
      const karte = gruppen.get(id);
      karte.displaySummary += (karte.displaySummary ? "\n\n" : "") + absatz.text;
      for (const quelle of absatz.sources) {
        if (!karte.sources.some(q => q.quelleId === quelle.quelleId)) karte.sources.push(quelle);
      }
    }
    ausgabe.vorgaenge = [...gruppen.values()];
    ausgabe.vorgaenge = require("./briefing-ereignisteilmitglieder")
      .gespeicherteLageKarten(ausgabe.vorgaenge, payload);
  }
  return ausgabe;
}

function lageAnsichtGebunden(lage, ansicht) {
  if (!lage || !ansicht || ansicht.available !== true || ansicht.fromCache !== true
    || ansicht.pendingNarrative || !require("./lage-quellenbeleg").gespeicherterTextGueltig(lage)
    || !isDeepStrictEqual(ansicht.quellenBindung, { koSetHash: lage.koSetHash, quellenHash: lage.quellenHash })) return false;
  const absaetze = value => (value || []).map(p => ({ text: p.text, vorgangIds: p.vorgangIds,
    quellen: (p.sources || []).map(q => ({ id: q.quelleId, url: q.url })) }));
  return isDeepStrictEqual(absaetze(ansicht.paragraphs), absaetze(lageAusgabe(lage).paragraphs));
}

function pruefeInhalt(briefing, lage, lageAnsicht) {
  const fehler = [];
  if (!briefing || typeof briefing.available !== "boolean" || !Array.isArray(briefing.items))
    fehler.push("briefing-vertrag-fehlt");
  if (!briefing?.available || !briefing?.items?.length) fehler.push("briefing-ohne-fachinhalt");
  if (!briefing?.currentHelmutState || !briefing?.currentRadarState) fehler.push("app-ansichten-unvollstaendig");
  const versorgung = briefing?.currentHelmutState?.versorgung;
  // Positive Fachinhalte bleiben sichtbar. Ein neu erzeugter technischer
  // Teilstand muss aber ueber den bestehenden Partial-CAS ergaenzbar bleiben.
  if (versorgung?.version === 1 && ["offen", "unbekannt"].includes(versorgung.zustand))
    fehler.push("quellenversorgung-unvollstaendig");
  if (briefing?.currentHelmutState && !briefing.currentHelmutState.tagesAnlass)
    fehler.push("briefing-ohne-tagesanlass");
  if (!lage?.paragraphs?.length) fehler.push("lage-text-fehlt");
  if (!lage?.qualitaet || lage.qualitaet.version !== require("./lage-textqualitaet").VERSION)
    fehler.push("lage-quellenpruefung-fehlt");
  if (lageAnsicht !== undefined && (!lageAnsicht || !Array.isArray(lageAnsicht.vorgaenge)))
    fehler.push("lage-ansicht-fehlt");
  const visible = [];
  function walk(value, path = "briefing") {
    if (!value || typeof value !== "object") return;
    for (const [key, v] of Object.entries(value)) {
      if (key === "ereignisUrspruenge") continue; // Hashgebundene Originale, kein zweiter sichtbarer Fliesstext.
      if (typeof v === "string" && /^(text|summary|displaySummary|assessment|action|recommendation|recommendedAction|recommended_action|whyRelevant|whyItMatters|personal_relevance_explanation|riskNote|opportunityNote|consequence_if_ignored|possible_upside|title)$/.test(key)) {
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

function pruefeZeile(row, { userId, day, profile, historisch = false, id = `bf-${userId}-${SLOT}-${day}` }) {
  const p = row.payload;
  const bindung = profilBindungsstand(row);
  // Nur die explizite historische Anzeige verwendet den damaligen Vertrag.
  // Materialisierung und neue Fachabnahme bleiben am aktuellen Kontext gebunden.
  const hashVersion = historisch === true ? bindung.version : PROFIL_HASH_VERSION;
  if (row.user_id !== userId || row.id !== id || row.slot !== SLOT
    || !p || p.version !== VERSION || p.mandat !== userId || p.tag !== day
    || p.inhaltHash !== inhaltHash(p)
    || (profile && p.profilHash !== profilHash(profile, hashVersion))) throw new Error("briefing-nachweis-abweichend");
  if (p.quellenStand && !isDeepStrictEqual(p.quellenStand,
    require("./tagespaket-auslieferung").quellenStand(p, p.quellenStand.sicherheitsHash)))
    throw new Error("briefing-quellenstand-abweichend");
  return row;
}

async function lese({ userId, day, profile, historisch = false, storage = require("./storage") }) {
  storage.assertTenant(userId, "briefingNachweisLesen");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) throw new Error("briefing-tag-ungueltig");
  const row = await storage.getRenderedBriefingV3(userId, SLOT, day, { strict: true });
  if (!row) return null;
  if (historisch !== true && profile && profilBindungsstand(row).version === 1
    && row.payload?.profilHash !== profilHash(profile)) {
    // Nur ein gueltiger historischer Vorgaenger erlaubt eine getrennte Auswahl.
    pruefeZeile(row, { userId, day, profile, historisch: true });
    const neu = await storage.getRenderedBriefingV3(userId, SLOT, day,
      { strict: true, profilHash: profilHash(profile) });
    if (!neu) throw new Error("briefing-nachweis-abweichend");
    return require("./briefing-profilkontext").pruefeNachfolger(neu, row, { userId, day, profile });
  }
  return pruefeZeile(row, { userId, day, profile, historisch });
}

async function materialisiere({ profile, userId, build, briefing, aussagenEingabeHash = null,
  storage = require("./storage"), now = new Date(), profilkontextUebergang = null, lageAnsicht }) {
  storage.assertTenant(userId, "briefingMaterialisieren");
  if (briefing?.prosaVorschau === true || briefing?.prosaEinordnung) throw new Error("briefing-vorschau-nicht-speicherbar");
  if (!profile || profile.id !== userId) throw new Error("briefing-profil-abweichend");
  if (profilkontextUebergang !== null) return require("./briefing-profilkontext").materialisiere({
    profile, userId, build, briefing, aussagenEingabeHash, storage, now, fachbasis: profilkontextUebergang });
  const day = berlinTagKey(now);
  const vorhanden = await lese({ userId, day, profile, storage });
  if (aussagenEingabeHash !== null && (!/^[a-f0-9]{64}$/.test(aussagenEingabeHash)
    || (vorhanden?.payload.pruefung.strukturellVollstaendig
      && vorhanden.payload.lage?.briefingEingabeHash !== aussagenEingabeHash)))
    throw new Error("briefing-lagebindung-abweichend");
  const bestehendesErgebnis = () => ({ ok: true, gespeichert: true, bereitsVorhanden: true, id: vorhanden.id,
    vollstaendig: vorhanden.payload.pruefung.strukturellVollstaendig, qualitaetBestanden: vorhanden.payload.pruefung.bestanden });
  const versorgung = briefing?.currentHelmutState?.versorgung;
  const rueckstand = versorgung?.version === 1 && ["offen", "unbekannt"].includes(versorgung.zustand);
  const versorgungGeaendert = rueckstand
    && !isDeepStrictEqual(versorgung, vorhanden?.payload.briefing?.currentHelmutState?.versorgung);
  if (vorhanden?.payload.pruefung.strukturellVollstaendig) {
    // Kein breiteres Schreibrecht fuer historische Komplettpakete. Ein altes
    // Quiet ist bei neu bekanntem Rueckstand aber keine aktuelle Bestaetigung.
    if (rueckstand && (!vorhanden.payload.briefing?.items?.length
      || vorhanden.payload.briefing?.currentHelmutState?.emptyState?.kind === "quiet"))
      throw new Error("briefing-versorgung-stand-unbestaetigt");
    return bestehendesErgebnis();
  }
  const text = await storage.getRenderedBriefingV3(userId, "lage", day, { strict: true });
  let lage = text?.payload || null;
  if (aussagenEingabeHash !== null && (text?.user_id !== userId || text?.slot !== "lage"
    || text.id !== `bf-${userId}-lage-${day}` || lage?.briefingEingabeHash !== aussagenEingabeHash))
    throw new Error("briefing-lagebindung-abweichend");
  // Ein roher Tagescache ist kein aktueller Kontextbeleg. Der cacheOnly-Leser
  // hat Profil, KO-/Quellenstand und Qualitaet bereits geprueft; nur exakt der
  // dabei akzeptierte Text darf in das neue Paket gelangen. Karten bleiben da.
  if (lageAnsicht !== undefined && !lageAnsichtGebunden(lage, lageAnsicht)) lage = null;
  if (vorhanden && !versorgungGeaendert && isDeepStrictEqual(lage, vorhanden.payload.lage)
    && vorhanden.payload.briefing.available === true
    && vorhanden.payload.pruefung.fehler.every(f => ["lage-text-fehlt", "lage-quellenpruefung-fehlt"].includes(f)))
    return bestehendesErgebnis();
  let b = briefing || await build(profile, userId);
  // Eine interne Entwicklungsvorschau darf keinen Tagesnachweis ersetzen.
  if (b?.prosaVorschau === true || b?.prosaEinordnung) throw new Error("briefing-vorschau-nicht-speicherbar");
  if (!b || ["store-error", "v3-store-disabled"].includes(b.reason)) throw new Error("briefing-speicherquelle-gestoert");
  if (vorhanden && rueckstand && aussagenEingabeHash === null) {
    const D = require("./tagespaket-auslieferung"), P = require("./publication-eligibility");
    let schutzGleich = false;
    try {
      P.assertRecorded(vorhanden.payload.briefing?.publicationEligibilityPolicy);
      schutzGleich = vorhanden.payload.quellenStand
        ? vorhanden.payload.quellenStand.sicherheitsHash === D.sicherheitsHash()
        : P.sourceSafetyStandard({ hash: null });
    } catch { /* Neuer Quellenschutz erlaubt keinen ungeprueften Altinhalt. */ }
    if (schutzGleich) {
      const E = require("./lage-quellenbeleg");
      if (lageAnsicht === undefined && !E.gespeicherterTextGueltig(lage)
        && E.gespeicherterTextGueltig(vorhanden.payload.lage))
        lage = vorhanden.payload.lage;
      if ((!lageAnsicht || !lageAnsicht.vorgaenge?.length) && vorhanden.payload.lageAnsicht?.vorgaenge?.length)
        lageAnsicht = vorhanden.payload.lageAnsicht;
      if (!b.available && vorhanden.payload.briefing.available)
        b = { ...vorhanden.payload.briefing,
          currentHelmutState: { ...vorhanden.payload.briefing.currentHelmutState, versorgung } };
    }
  }
  const generatedAt = new Date(now).toISOString();
  const payload = { version: VERSION, mandat: userId, tag: day, profilHash: profilHash(profile),
    profilHashVersion: PROFIL_HASH_VERSION,
    briefing: b, lage, ...(lageAnsicht === undefined ? {} : { lageAnsicht }),
    pruefung: pruefeInhalt(b, lage, lageAnsicht), erzeugtAm: generatedAt };
  payload.quellenStand = require("./tagespaket-auslieferung").quellenStand(payload);
  payload.inhaltHash = inhaltHash(payload);
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

module.exports = { SLOT, VERSION, hash, inhaltHash, profilHash, profilBindungsstand, pruefeInhalt, pruefeZeile, lageAusgabe, lageAnsichtGebunden, lese, materialisiere };
