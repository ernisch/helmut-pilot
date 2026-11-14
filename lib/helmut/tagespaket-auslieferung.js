"use strict";

// Der normale App-Leser liest das bestaetigte Tagesergebnis. Er kennt weder
// Ranking, Quellenabruf noch Modelle. Historische Belege bleiben unveraendert.
const B = require("./briefing-speicher");
const F = require("./briefing-frische");
const L = require("./briefing-lauf");
const P = require("./publication-eligibility");
const E = require("./lage-quellenbeleg");

function sicherheitsHash(env = process.env) {
  const domains = key => [...new Set(String(env[key] || "").split(",")
    .map(v => v.trim().toLowerCase()).filter(Boolean))].sort();
  return B.hash({ blocklist: domains("HELMUT_SOURCE_BLOCKLIST"), allowlist: domains("HELMUT_SOURCE_ALLOWLIST") });
}
function vorgangIds(value, out = new Set()) {
  if (!value || typeof value !== "object") return out;
  for (const [key, v] of Object.entries(value)) {
    if (key === "tagespaketGrundlage" || key === "vorherigerStand") continue;
    if (["vorgangId", "vorgang_id", "primaryVorgangId"].includes(key) && typeof v === "string") out.add(v);
    else if (["relatedVorgangIds", "vorgangIds", "vorgang_ids"].includes(key) && Array.isArray(v)) {
      for (const id of v) if (typeof id === "string") out.add(id);
    }
    else if (v && typeof v === "object") vorgangIds(v, out);
  }
  return out;
}
function grundlage(briefing, kos) {
  const ids = vorgangIds(briefing);
  return (kos || []).filter(k => k && ids.has(k.vorgang_id))
    .map(k => ({ id: k.id, vorgang_id: k.vorgang_id })).sort((a,b) => a.id.localeCompare(b.id));
}
function quellenStand(payload, sicherheit = sicherheitsHash()) {
  const abhaengigkeiten = new Map();
  for (const dep of [...(payload.briefing?.tagespaketGrundlage || []),
    ...(payload.lageAnsicht?.tagespaketGrundlage || [])]) {
    if (abhaengigkeiten.has(dep.id) && abhaengigkeiten.get(dep.id).vorgang_id !== dep.vorgang_id)
      throw new Error("tagespaket-publikationsbindung-abweichend");
    abhaengigkeiten.set(dep.id, dep);
  }
  return { version: 1, briefingHash: B.hash(payload.briefing),
    lageQuellenHash: payload.lage?.quellenHash || null,
    lageAnsichtHash: B.hash(payload.lageAnsicht ?? null),
    vorgaenge: [...vorgangIds({ briefing: payload.briefing, lage: payload.lage, ansicht: payload.lageAnsicht })].sort(),
    abhaengigkeiten: [...abhaengigkeiten.values()].sort((a,b) => a.id.localeCompare(b.id)),
    sicherheitsHash: sicherheit, publicationPolicy: payload.briefing?.publicationEligibilityPolicy || null };
}
function leer(profile, reason, now) {
  const briefing = require("./briefingContract").toBriefingContractV3({ profile, decisions: [],
    kosById: {}, sourcesByVorgang: {}, reason: "store-error", now });
  return { ...briefing, reason, generatedAt: null,
    paketStatus: { zustand: "fehlt", grund: reason, tag: F.berlinTagKey(now), vollstaendig: false },
    lageBriefing: { available: false, reason, paragraphs: [], vorgaenge: [], generatedAt: null } };
}
function datenstand(payload) {
  let latest = null;
  function walk(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, v] of Object.entries(value)) {
      if (key === "vorherigerStand") continue;
      if (["publishedAt", "published_at", "veroeffentlichtAm"].includes(key)
        && typeof v === "string" && Number.isFinite(Date.parse(v)) && (!latest || Date.parse(v) > Date.parse(latest))) latest = v;
      else if (v && typeof v === "object") walk(v);
    }
  }
  walk({ briefing: payload.briefing, quellen: payload.lage?.quellen, ansicht: payload.lageAnsicht });
  return latest;
}
async function pruefeSperren(payload, storage, policy) {
  P.assertRecorded(payload.briefing?.publicationEligibilityPolicy, policy);
  if (payload.quellenStand ? payload.quellenStand.sicherheitsHash !== sicherheitsHash()
    : !P.sourceSafetyStandard({ hash: null })) throw new Error("tagespaket-quellenschutz-geaendert");
  if (!policy.hash) return;
  const stand = payload.quellenStand, deps = stand?.abhaengigkeiten;
  // Eine aktive Publikationssperre bleibt auch nach neuen Quellenverknuepfungen
  // verbindlich. Nur die gebundenen IDs nachlesen, niemals den Korpus auswerten.
  if (!Array.isArray(deps) || deps.length > 500 || stand.vorgaenge.some(v => !deps.some(d => d.vorgang_id === v)))
    throw new Error("tagespaket-publikationsbindung-fehlt");
  const docs = await storage.getPublicationSourceIdentities(deps);
  P.assertSame(policy);
  for (const d of deps) {
    if (!Array.isArray(docs[d.id]) || P.held(d, docs[d.id], policy))
      throw new Error("tagespaket-publikation-zurueckgehalten");
  }
}
// Nur ein oeffentlicher Lesehinweis auf bereits gepruefte Paketabsaetze. Kein
// neuer fachlicher State, keine Prioritaet und insbesondere kein Fensterabschluss.
function vorlaeufigerBriefingstand(briefing, lage, { day, row, receipt, bound, textGueltig, vollstaendig, now }) {
  const state = briefing.currentHelmutState, lauf = receipt.lauf;
  if (!textGueltig || vollstaendig || !bound || receipt.fehler || lauf?.status !== L.STATUS_ERFOLG
    || lauf.tenantId !== row.user_id || lauf.berlinTag !== day || !Number.isFinite(Date.parse(lauf.erzeugtAm))
    || F.berlinTagKey(lauf.erzeugtAm) !== day || Date.parse(lauf.erzeugtAm) > new Date(now).getTime()
    || briefing.available !== true || state?.status !== "empty" || state.emptyState?.kind !== "gap"
    || state.profileId !== row.user_id || (state.tenantId != null && state.tenantId !== row.user_id)
    || state.errorState || state.staleState
    || state.primaryItem || state.primaryVorgangId || state.tagesAnlass
    || !Array.isArray(state.items) || state.items.length || state.versorgung?.version !== 1 || state.versorgung.zustand !== "offen"
    || lage?.available !== true || lage.fromCache !== true || lage.pendingNarrative || lage.demo || lage.teilstand
    || !Array.isArray(lage.paragraphs) || !lage.paragraphs.length) return null;
  const absaetze = [];
  for (const [index, p] of lage.paragraphs.entries()) {
    if (typeof p.text !== "string" || !p.text.trim() || !Array.isArray(p.vorgangIds) || p.vorgangIds.length !== 1
      || !Array.isArray(p.sources) || !p.sources.length || p.sources.some(q => !q?.quelleId || !E.artikelUrl(q.url)
        || !Number.isFinite(Date.parse(q.publishedAt)) || Date.parse(q.publishedAt) > new Date(now).getTime())) return null;
    absaetze.push({ index, vorgangIds: [...p.vorgangIds], quellenIds: p.sources.map(q => q.quelleId) });
  }
  return { version: 1, zustand: "vorlaeufig", tag: day, paketErzeugtAm: row.generated_at,
    quellenversorgung: "offen", tagesprioritaet: "offen", absaetze };
}
function bindeRadarAnzeige(briefing, now) {
  const raw = briefing.currentRadarState, before = raw?.anzeige;
  if (!before) return;
  const sourceMap = new Map();
  for (const item of Array.isArray(briefing.items) ? briefing.items : []) {
    const id = item?.vorgangId || item?.vorgang_id;
    if (!id || (item.vorgangId && item.vorgang_id && item.vorgangId !== item.vorgang_id)) continue;
    sourceMap.set(id, [...(sourceMap.get(id) || []), ...(Array.isArray(item.sources) ? item.sources : []),
      ...(item.primarySource ? [item.primarySource] : [])]);
  }
  const view = structuredClone(before), bind = list => (Array.isArray(list) ? list : [])
    .map(i => require("./briefing-bereichsvertrag").radarArtikelbindung(i, sourceMap.get(i?.vorgangId), now)).filter(Boolean);
  view.dynamics = bind(before.dynamics);
  view.environment = Object.fromEntries(["party", "constituency", "committees"]
    .map(key => [key, bind(before.environment?.[key])]));
  const hidden = view.dynamics.length !== (before.dynamics?.length || 0)
    || Object.keys(view.environment).some(key => view.environment[key].length !== (before.environment?.[key]?.length || 0));
  if (hidden) {
    const mentions = view.mentions || [], all = [...mentions, ...view.dynamics, ...Object.values(view.environment).flat(), ...(view.articles || [])];
    view.summary = require("./radarState").buildSummary(mentions, view.environment, view.dynamics, now, { nurAnzeige: true });
    const times = all.flatMap(i => [i?.publishedAt, i?.lastUpdatedAt]).filter(t => Number.isFinite(Date.parse(t)) && Date.parse(t) <= new Date(now).getTime());
    view.lastUpdated = times.sort((a,b) => Date.parse(b) - Date.parse(a))[0] || null;
    view.status = !all.length ? "empty" : F.berlinTagKey(view.lastUpdated) === F.berlinTagKey(now) ? "fresh" : "stale";
  }
  // Nur die sichtbare Kopie korrigieren. Rohzuordnungen, Paket-/Quellenhash,
  // Lage, Prioritaeten, Journal und Quittung behalten ihren gespeicherten Stand.
  briefing.currentRadarState = { ...raw, anzeige: view };
}
async function lese({ userId, profile, storage = require("./storage"), now = new Date() }) {
  storage.assertTenant(userId, "tagespaketAusliefern");
  if (!profile || profile.id !== userId) throw new Error("tagespaket-profil-abweichend");
  const day = F.berlinTagKey(now);
  let row;
  try { row = await B.lese({ userId, profile, day, storage }); }
  catch { return { briefing: leer(profile, "tagespaket-nicht-bestaetigt", now), frischeKontext: null }; }
  if (!row) return { briefing: leer(profile, "tagespaket-fehlt", now), frischeKontext: null };
  try {
    if (!Number.isFinite(Date.parse(row.generated_at)) || !Number.isFinite(Date.parse(row.payload.erzeugtAm))
      || F.berlinTagKey(row.generated_at) !== day || F.berlinTagKey(row.payload.erzeugtAm) !== day
      || Date.parse(row.generated_at) > new Date(now).getTime()) throw new Error("tagespaket-zeit-abweichend");
    await pruefeSperren(row.payload, storage, P.current());
  } catch { return { briefing: leer(profile, "tagespaket-quellenstand-nicht-bestaetigt", now), frischeKontext: null }; }
  const p = row.payload, check = B.pruefeInhalt(p.briefing, p.lage, p.lageAnsicht);
  const teilstandMarkiert = Boolean(p.lage && Object.hasOwn(p.lage, "provenienz"))
    || Boolean(p.lage?.qualitaet?.teilstand || p.lageAnsicht?.teilstand);
  const textGueltig = !teilstandMarkiert && E.gespeicherterTextGueltig(p.lage);
  const kontext = { userId, tag: day, profile, now };
  const teilstand = require("./lage-teilstand").gueltig(p.lage, kontext);
  const vollstaendig = check.strukturellVollstaendig && textGueltig && !teilstand;
  const lage = structuredClone(p.lageAnsicht || B.lageAusgabe(p.lage, kontext));
  if (lage && !teilstand) delete lage.teilstand;
  // Unbestaetigte Narrativtexte werden nicht durch die Speicherung verifiziert.
  // Die vorher bereits geprueften Vorgangskarten bleiben bei Teilausfaellen da.
  if (lage && !textGueltig && !teilstand) {
    lage.paragraphs = []; lage.pendingNarrative = true;
    if (teilstandMarkiert) {
      // Diese Karten koennen denselben abgeleiteten Text enthalten. Ohne den
      // Teilbeleg ist auch der sichtbare Detailtext nicht bestaetigt; das gilt
      // ebenso bei entferntem Rohbeleg mit verbliebenem Teilstandhinweis.
      lage.vorgaenge = []; lage.available = false; delete lage.qualitaet;
    }
  } else if (lage) {
    lage.paragraphs = B.lageAusgabe(p.lage, kontext).paragraphs;
    if (teilstand) {
      lage.teilstand = require("./lage-teilstand").publicInfo(p.lage);
      lage.qualitaet = { version: require("./lage-textqualitaet").VERSION, teilstand: true,
        freigegeben: 1, zurueckgehalten: 1, vollstaendigeFaktenpruefung: false };
    }
  }
  const receipt = await L.ladeTageslauf(storage, userId, day);
  const bound = receipt.lauf && require("./briefing-ausgabebeleg").passt(receipt.lauf.ausgabeBeleg, row);
  const stand = datenstand(p);
  const briefing = { ...structuredClone(p.briefing), lageBriefing: lage,
    vorlaeufigerBriefingstand: vorlaeufigerBriefingstand(p.briefing, lage,
      { day, row, receipt, bound, textGueltig, vollstaendig, now }),
    paketStatus: { zustand: vollstaendig ? "gespeichert" : "teilweise",
      tag: day, vollstaendig, fehler: textGueltig || teilstand ? check.fehler : [...check.fehler, "lage-quellenbindung-fehlt"],
      quittungGebunden: Boolean(bound), quellenStand: p.quellenStand || quellenStand(p),
      fachlicheVollabnahme: false },
    gespeicherterNachweis: { id: row.id, erzeugtAm: row.generated_at, inhaltHash: p.inhaltHash,
      profilHash: p.profilHash, profilbindung: B.profilBindungsstand(row), auswahl: "aktuell", pruefung: p.pruefung } };
  bindeRadarAnzeige(briefing, now);
  return { briefing, frischeKontext: { jetzt: now, berlinTag: day, lauf: bound ? receipt.lauf : null,
    datenstand: stand, fenster: F.frischeFenster({ jetzt: now, letzterErfolgAt: receipt.lauf?.fensterStart }),
    speicherFehler: receipt.fehler || (!bound ? "tagespaket-quittung-fehlt" : null) } };
}
module.exports = { sicherheitsHash, vorgangIds, grundlage, quellenStand, datenstand, lese };
