"use strict";

// Der normale App-Leser liest das bestaetigte Tagesergebnis. Er kennt weder
// Ranking, Quellenabruf noch Modelle. Historische Belege bleiben unveraendert.
const B = require("./briefing-speicher");
const A = require("./briefing-ausgabebeleg");
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
    if (["tagespaketGrundlage", "vorherigerStand", "dipBeratungsstaende", "parlamentsBelege",
      "parlamentsOriginalbelege", "parlamentsKontext"].includes(key)) continue;
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
    lageBriefing: { available: false, demo: false, reason, paragraphs: [], vorgaenge: [],
      generatedAt: null, latestUpdatedAt: null } };
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
// Liefert die bereits quittierte Fassung aus der begrenzten CAS-Kette des Tages.
function quittierteFassung(row, lauf, { day, profile, now, historisch = false }) {
  let gefunden = A.quittiert(lauf, row) ? row : false;
  const exakt = lauf.ausgabeBeleg?.version === 2;
  if (exakt && gefunden) return gefunden;
  const gesehen = new Set([row]);
  let kandidat = row.payload?.vorherigerStand, spaeter = Date.parse(row.generated_at);
  // Auch mehrere regulaere Teilaktualisierungen duerfen keinen unbegrenzten
  // History-Leser erzeugen. Nur die vorhandene CAS-Kette dieses Tages lesen.
  for (let tiefe = 0; kandidat && tiefe < B.MAX_VORGAENGER; tiefe++) {
    if (gesehen.has(kandidat)) return false;
    gesehen.add(kandidat);
    try {
      B.pruefeZeile(kandidat, { userId: row.user_id, day, profile, id: row.id, historisch });
      const zeit = Date.parse(kandidat.generated_at);
      if (!Number.isFinite(zeit) || zeit >= spaeter || zeit > new Date(now).getTime()
        || F.berlinTagKey(kandidat.generated_at) !== day
        || Date.parse(kandidat.payload.erzeugtAm) !== zeit) return false;
      P.assertRecorded(kandidat.payload.briefing?.publicationEligibilityPolicy);
      if (kandidat.payload.quellenStand ? kandidat.payload.quellenStand.sicherheitsHash !== sicherheitsHash()
        : !P.sourceSafetyStandard({ hash: null })) return false;
      if (A.quittiert(lauf, kandidat)) {
        if (exakt) return kandidat;
        // Historische Belege mit reinem Briefinghash sind nur bei genau einer
        // passenden Fassung bis zur damaligen Quittungszeit eindeutig.
        if (gefunden) return false;
        gefunden = kandidat;
      }
      spaeter = zeit; kandidat = kandidat.payload.vorherigerStand;
    } catch { return false; }
  }
  return kandidat ? false : gefunden;
}
function vorlaeufigerBriefingstand(briefing, lage, { day, row, bound, textGueltig, vollstaendig, now }) {
  const state = briefing.currentHelmutState;
  if (!textGueltig || vollstaendig || !bound
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
function paketQuellen(briefing) {
  const nachVorgang = new Map();
  for (const item of Array.isArray(briefing.items) ? briefing.items : []) {
    const id = item?.vorgangId || item?.vorgang_id;
    if (!id || (item.vorgangId && item.vorgang_id && item.vorgangId !== item.vorgang_id)) continue;
    nachVorgang.set(id, [...(nachVorgang.get(id) || []), ...(Array.isArray(item.sources) ? item.sources : []),
      ...(item.primarySource ? [item.primarySource] : [])]);
  }
  return nachVorgang;
}

function bindeBriefingFristen(stand, sourceMap, now) {
  if (!stand?.primaryItem) return stand;
  const V = require("./briefing-bereichsvertrag");
  function istNochOffen(item, anlass) {
    if (!["heutige-frist", "kommende-frist"].includes(anlass?.art) || !anlass.beleg || anlass.beleg.terminOriginal) return true;
    const b = anlass.beleg;
    const weitere = (sourceMap.get(item.id) || []).filter(d => !d?.publishedAtConflict && typeof d?.summary === "string" && d.summary.trim())
      .map(d => ({ ...d, published_at: d.published_at || d.publishedAt }));
    if (!weitere.length) return true;
    // Ältere Pakete konnten einen Datumssatz wählen, obwohl ein anderes
    // bereits gebundenes Original desselben Vorgangs eine Schlusszeit trägt.
    const gewaehlte = { id: b.documentId, url: b.url, summary: b.text, published_at: b.publishedAt };
    const frist = V.fristDaten({ deadline: anlass.termin }, [gewaehlte, ...weitere], now);
    return frist && (frist.ms === null || frist.ms > new Date(now).getTime());
  }
  return { ...stand, tagesAnlass: istNochOffen(stand.primaryItem, stand.tagesAnlass) ? stand.tagesAnlass : null,
    items: (stand.items || []).map(item => istNochOffen(item, item.tagesAnlass) ? item : { ...item, tagesAnlass: null }) };
}

async function pruefeArbeitsauftraege(stand, { profile, now, storage }) {
  const terminIds = new Set([
    stand?.tagesAnlass?.beleg?.terminOriginal && stand.primaryItem?.id,
    ...(stand?.items || []).map(i => i.tagesAnlass?.beleg?.terminOriginal && i.id)
  ].filter(id => typeof id === "string" && /^[\p{L}\p{N}_-]{1,200}$/u.test(id)));
  let terminQuellen = {};
  try {
    if (terminIds.size) terminQuellen = await storage.getPruefSourcesByVorgaenge([...terminIds]
      .map(id => ({ id: `ko-${id}`, vorgang_id: id })));
  } catch { /* Ohne bestaetigten Terminstand entfaellt die Prioritaet. */ }
  return require("./briefingContract").pruefeGespeichertenHelmutStand(stand, profile, now, terminQuellen);
}

function bindeRadarAnzeige(briefing, now, profile, sourceMap) {
  const raw = briefing.currentRadarState, before = raw?.anzeige || raw;
  if (!raw || (!raw.anzeige && !raw.environment && !raw.dynamics && !raw.mentions && !raw.articles)) return;
  const V = require("./briefing-bereichsvertrag");
  const istMehrbericht = item => item?.beobachtungsBeleg?.art === "weitere-berichte"
    || (!item?.beobachtungsBeleg && ["rising", "broadening", "officialAttention"].includes(item?.signalType));
  const roheListe = [raw.mentions, raw.dynamics, raw.articles, raw.environment?.party,
    raw.environment?.constituency, raw.environment?.committees];
  const hasRawParty = Boolean(raw.environment?.party?.length)
    || [raw.mentions, raw.dynamics, raw.articles, raw.environment?.constituency, raw.environment?.committees]
      .some(list => Array.isArray(list) && list.some(i => i && V.radarHatParteibezug(i)));
  const hasRawMehrbericht = roheListe.some(list => Array.isArray(list) && list.some(istMehrbericht));
  if (!raw.anzeige && !hasRawParty && !hasRawMehrbericht) return;
  function pruefeMehrbericht(item) {
    if (!istMehrbericht(item)) return item;
    const docs = (sourceMap.get(item.vorgangId) || []).filter(Boolean).map(d => ({
      ...d, id: d.id || d.documentId, published_at: d.published_at || d.publishedAt
    }));
    const signal = V.beobachtung(docs, now, item);
    if (!signal) return null;
    return { ...item, evidence: signal.text,
      beobachtungsBeleg: { ...signal, documentIds: item.beobachtungsBeleg?.documentIds || signal.documentIds },
      ...(item.signalType ? { signalType: "rising", signalLabel: "Belegte Aktualisierung", sourceCount: signal.sourceCount } : {}) };
  }
  const view = structuredClone(before), bind = (list, party = false) => (Array.isArray(list) ? list : [])
    .map(i => V.radarArtikelbindung(i, sourceMap.get(i?.vorgangId), now))
    .map(i => V.radarParteiZuordnung(i, profile, party)).map(pruefeMehrbericht).filter(Boolean);
  view.dynamics = bind(before.dynamics);
  view.environment = Object.fromEntries(["party", "constituency", "committees"]
    .map(key => [key, bind(before.environment?.[key], key === "party")]));
  const bindParty = list => (Array.isArray(list) ? list : []).map(i => i && (V.radarHatParteibezug(i) || istMehrbericht(i))
    ? V.radarParteiZuordnung(V.radarArtikelbindung(i, sourceMap.get(i?.vorgangId), now), profile) : i)
    .map(pruefeMehrbericht).filter(Boolean);
  for (const key of ["mentions", "articles"]) view[key] = bindParty(view[key]);
  const hidden = view.dynamics.length !== (before.dynamics?.length || 0)
    || Object.keys(view.environment).some(key => view.environment[key].length !== (before.environment?.[key]?.length || 0))
    || ["mentions", "articles"].some(key => view[key].length !== (before[key]?.length || 0));
  if (hidden) {
    const mentions = view.mentions || [], all = [...mentions, ...view.dynamics, ...Object.values(view.environment).flat(), ...(view.articles || [])];
    view.summary = require("./radarState").buildSummary(mentions, view.environment, view.dynamics, now, { nurAnzeige: true });
    const times = all.flatMap(i => [i?.publishedAt, i?.lastUpdatedAt]).filter(t => Number.isFinite(Date.parse(t)) && Date.parse(t) <= new Date(now).getTime());
    view.lastUpdated = times.sort((a,b) => Date.parse(b) - Date.parse(a))[0] || null;
    view.status = !all.length ? "empty" : F.berlinTagKey(view.lastUpdated) === F.berlinTagKey(now) ? "fresh" : "stale";
  }
  // Nur die sichtbare Kopie korrigieren. Rohzuordnungen, Paket-/Quellenhash,
  // Lage, Prioritaeten, Journal und Quittung behalten ihren gespeicherten Stand.
  // Auch alte Clients duerfen keine ungeprueften Parteirelationen aus dem
  // Roh-DTO lesen. Ausschliesslich die geladene Kopie wird eingeschraenkt.
  let legacy = raw;
  if (hasRawParty || hasRawMehrbericht) {
    legacy = { ...raw, environment: { ...raw.environment,
      party: bind(raw.environment?.party, true),
      constituency: bindParty(raw.environment?.constituency),
      committees: bindParty(raw.environment?.committees) } };
    for (const key of ["mentions", "dynamics", "articles"]) if (Array.isArray(raw[key])) legacy[key] = bindParty(raw[key]);
    legacy.summary = require("./radarState").buildSummary(legacy.mentions || [], legacy.environment, legacy.dynamics || [], now, { nurAnzeige: true });
  }
  briefing.currentRadarState = { ...legacy, anzeige: view };
}
// Die bestaetigten Texte bleiben unveraendert. Nur die geladene Ausgabekopie
// erhaelt einen aktuellen, beidseitig belegten Bezug zum eigenen Mandat.
function bindeLageMandatsbezug(lage, original, profile, textGueltig) {
  if (!lage) return;
  const fach = require("./lage-profilbezug");
  const quellen = textGueltig ? (original?.quellen || []) : [];
  const bewertung = (title, text) => fach.bewerte({ headline: title || "", was_ist_passiert: text || "" }, profile);
  const gemeinsame = (belege, sachbelege) => fach.ausBelegen(belege.filter(b =>
    sachbelege.some(s => s.art === b.art && s.wert === b.wert)), profile);
  const quellePasst = (source, q) => source && E.artikelUrl(q.url) && E.artikelUrl(source.url) === E.artikelUrl(q.url)
    && (!source.quelleId || source.quelleId === q.quelle_id);
  const normal = value => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  lage.paragraphs = (lage.paragraphs || []).map((absatz, index) => {
    const { relevanz: _alt, ...out } = absatz, raw = original?.paragraphs?.[index];
    if (!textGueltig || !raw || raw.text !== absatz.text || raw.vorgang_ids?.length !== 1
      || raw.quellen_ids?.length !== 1 || absatz.vorgangIds?.length !== 1
      || absatz.vorgangIds[0] !== raw.vorgang_ids[0]) return out;
    const docs = quellen.filter(v => v.vorgang_id === raw.vorgang_ids[0])
      .flatMap(v => v.quellenbelege).filter(q => q.quelle_id === raw.quellen_ids[0]);
    if (docs.length !== 1 || absatz.sources?.length !== 1 || !quellePasst(absatz.sources[0], docs[0])) return out;
    const q = docs[0], quelle = bewertung(q.titel, q.auszug);
    const bezug = gemeinsame(quelle.belege, bewertung("", absatz.text).belege);
    if (!bezug.passt) return out;
    return { ...out, relevanz: bezug.erklaerung };
  });
  lage.vorgaenge = (lage.vorgaenge || []).map((karte, index) => {
    const { relevanz: _alt, ...out } = karte;
    const id = karte.vorgangId || karte.vorgang_id;
    const title = karte.displayTitle || karte.title, text = karte.displaySummary || karte.summary?.wasIstPassiert;
    const sachbelege = bewertung(title, text).belege;
    const docs = quellen.filter(v => v.vorgang_id === id).flatMap(v => v.quellenbelege)
      .filter(q => (karte.sources || []).some(source => quellePasst(source, q)));
    const belegte = docs.flatMap(q => bewertung(q.titel, q.auszug).belege);
    const bezug = gemeinsame(belegte, sachbelege);
    const textGebunden = docs.some(q => (normal(title) && normal(title) === normal(q.titel))
      || (normal(text) && (normal(text) === normal(q.auszug) || (original.paragraphs || []).some(p =>
        p.vorgang_ids?.length === 1 && p.vorgang_ids[0] === id && p.quellen_ids?.length === 1
        && p.quellen_ids[0] === q.quelle_id && normal(p.text) === normal(text)))));
    // Ein alter persoenlicher Cachegrund ist kein aktueller Beleg. Den
    // identischen Duplikatsatz auch im allgemeinen Einordnungsfeld entfernen.
    if (karte.relevanz && out.whyRelevant === karte.relevanz.satz) delete out.whyRelevant;
    // Ein fehlender neuer Fachanker ist kein Widerruf alter erfolgreicher
    // Texte. Ohne konkrete Quellen-/Textbindung bleibt die Altkarte erhalten.
    if (!bezug.passt) return textGebunden ? null : { karte: out, gewicht: 0, index };
    return { karte: bezug.passt ? { ...out, relevanz: bezug.erklaerung } : out,
      gewicht: bezug.gewicht, index };
  }).filter(Boolean).sort((a, b) => b.gewicht - a.gewicht || a.index - b.index).map(r => r.karte);
}
async function lese({ userId, profile, storage = require("./storage"), now = new Date() }) {
  storage.assertTenant(userId, "tagespaketAusliefern");
  if (!profile || profile.id !== userId) throw new Error("tagespaket-profil-abweichend");
  const day = F.berlinTagKey(now);
  // Erst den Publikationszeiger, dann die Paketkette lesen. Ein neuerer
  // Schreibvorgang an der Kette behaelt die bereits quittierte Fassung bei.
  const receipt = await L.ladeTageslauf(storage, userId, day, { strict: true });
  const lauf = receipt.lauf;
  const mitBindung = receipt.quelle === "erfolg" && Boolean(lauf?.ausgabeBeleg);
  let row;
  try { row = await B.lese({ userId, profile, day, storage }); }
  catch { return { briefing: leer(profile, "tagespaket-nicht-bestaetigt", now), frischeKontext: null }; }
  if (!row) return { briefing: leer(profile, "tagespaket-fehlt", now), frischeKontext: null };
  if (receipt.fehler || (mitBindung && (lauf.status !== L.STATUS_ERFOLG || lauf.vertragVersion !== F.VERTRAG_VERSION
    || lauf.tenantId !== userId || lauf.berlinTag !== day || F.berlinTagKey(lauf.erzeugtAm) !== day
    || !(Date.parse(lauf.erzeugtAm) <= new Date(now).getTime()))))
    return { briefing: leer(profile, "tagespaket-quittung-nicht-bestaetigt", now), frischeKontext: null };
  if (mitBindung) {
    row = quittierteFassung(row, lauf, { day, profile, now });
    if (!row) return { briefing: leer(profile, "tagespaket-quittung-nicht-bestaetigt", now), frischeKontext: null };
  }
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
  bindeLageMandatsbezug(lage, p.lage, profile, textGueltig || teilstand);
  const bound = mitBindung;
  const stand = datenstand(p);
  const ausgabe = structuredClone(p.briefing);
  const sourceMap = paketQuellen(ausgabe);
  const gebundenerStand = bindeBriefingFristen(ausgabe.currentHelmutState, sourceMap, now);
  const fachstand = await pruefeArbeitsauftraege(gebundenerStand, { profile, now, storage });
  ausgabe.currentHelmutState = fachstand.stand;
  const briefing = { ...ausgabe, lageBriefing: lage,
    vorlaeufigerBriefingstand: vorlaeufigerBriefingstand(ausgabe, lage,
      { day, row, bound, textGueltig, vollstaendig, now }),
    paketStatus: { zustand: vollstaendig && !fachstand.abgewiesen ? "gespeichert" : "teilweise",
      tag: day, vollstaendig: vollstaendig && !fachstand.abgewiesen,
      fehler: [...(textGueltig || teilstand ? check.fehler : [...check.fehler, "lage-quellenbindung-fehlt"]),
        ...(fachstand.abgewiesen ? ["briefing-handlungsbeleg-fehlt"] : [])],
      quittungGebunden: Boolean(bound), quellenStand: p.quellenStand || quellenStand(p),
      fachlicheVollabnahme: false },
    gespeicherterNachweis: { id: row.id, erzeugtAm: row.generated_at, inhaltHash: p.inhaltHash,
      profilHash: p.profilHash, profilbindung: B.profilBindungsstand(row), auswahl: "aktuell", pruefung: p.pruefung } };
  bindeRadarAnzeige(briefing, now, profile, sourceMap);
  return { briefing, frischeKontext: { jetzt: now, berlinTag: day, lauf: bound ? receipt.lauf : null,
    datenstand: stand, fenster: F.frischeFenster({ jetzt: now, letzterErfolgAt: receipt.lauf?.fensterStart }),
    speicherFehler: receipt.fehler || (!bound ? "tagespaket-quittung-fehlt" : null) } };
}
function aktualisiereTagesansichten(briefing, aktuell, lage, { now, profile }) {
  const ausgabe = { ...briefing };
  if (aktuell?.currentRadarState && !["store-error", "v3-store-disabled"].includes(aktuell.reason)) {
    ausgabe.currentRadarState = structuredClone(aktuell.currentRadarState);
    bindeRadarAnzeige(ausgabe, now, profile, paketQuellen(aktuell));
  }
  if (lage?.available && lage.vorgaenge?.length) {
    const { tagespaketGrundlage, ...ansicht } = lage;
    ausgabe.lageBriefing = briefing.paketStatus?.quittungGebunden && briefing.lageBriefing
      ? { ...briefing.lageBriefing, vorgaenge: ansicht.vorgaenge } : ansicht;
  }
  return ausgabe;
}

module.exports = { sicherheitsHash, vorgangIds, grundlage, quellenStand, datenstand, lese, pruefeArbeitsauftraege,
  aktualisiereTagesansichten,
  quittierteFassung };
