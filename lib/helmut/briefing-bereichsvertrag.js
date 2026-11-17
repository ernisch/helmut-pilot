"use strict";

// Gemeinsame, rein lesende Rollengrenzen. Keine Bedeutungspruefung durch
// Aehnlichkeitszahlen: Lage besitzt den Sachstand, Radar beobachtet Belege,
// Briefing braucht einen heutigen Anlass. Fachliche Paraphrasenpruefung bleibt
// ein gesondertes, exakt gebundenes Urteil (briefing-fachurteil).
const { berlinTagKey, frischeFenster } = require("./briefing-frische");
const { canonicalizeUrl, briefingArticleIdentity } = require("./dedup");

function quellenGruppen(docs) {
  const groups = [];
  for (const d of Array.isArray(docs) ? docs : []) {
    const url = require("./lage-quellenbeleg").artikelUrl(d?.url || d?.canonical_url);
    if (!url) continue;
    const keys = ["url:" + canonicalizeUrl(url), briefingArticleIdentity(url), d.id && "id:" + d.id].filter(Boolean);
    const matches = groups.filter(g => keys.some(k => g.keys.has(k)));
    const group = { keys: new Set(keys), docs: [d] };
    for (const match of matches) {
      match.keys.forEach(k => group.keys.add(k)); group.docs.push(...match.docs);
      groups.splice(groups.indexOf(match), 1);
    }
    groups.push(group);
  }
  return groups;
}

function quellen(docs, now) {
  return quellenGruppen(docs).filter(g => {
    const times = g.docs.map(d => Date.parse(d.published_at || ""));
    // Auch eine undatierte/abweichend datierte Variante sperrt den Zeitbeleg.
    // Die zufaellige Reihenfolge darf keine frische Fassung erfinden.
    return times.every(t => Number.isFinite(t) && t <= new Date(now).getTime())
      && new Set(times).size === 1;
  }).map(g => [...g.docs].sort((a,b) => String(a.id).localeCompare(String(b.id)))[0])
    .sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at));
}

// Nur der Tagesanlass nutzt den vorhandenen Artikelstand-Tagesvertrag. Radar,
// Personen- und Fristbelege behalten ihre bisherigen Zeitstempelregeln.
function neueTagesQuellen(docs, now, start) {
  const ende = new Date(now).getTime(), einfache = new Set(), tage = [];
  if (!Number.isFinite(start) || !Number.isFinite(ende) || start > ende) return [];
  for (const gruppe of quellenGruppen(docs)) {
    let staende;
    try { staende = gruppe.docs.map(d => require("./artikelstand").leseStand(d)); }
    catch { continue; } // Ungültiger Stand erlaubt keinen Zeitstempel-Fallback.
    if (!staende.some(Boolean)) { gruppe.docs.forEach(d => einfache.add(d)); continue; }
    const erster = staende[0];
    // Ein Alias ohne denselben geprüften Stand sperrt die gesamte Artikelgruppe.
    if (!erster || !staende.every(s => s && s.name === erster.name
      && s.stand.standHash === erster.stand.standHash)) continue;
    let ganzeAbsaetze;
    try { ganzeAbsaetze = gruppe.docs.every((d, i) => Boolean(staende[i].standModul
      .standZusammenfassung(d.summary, staende[i].stand))); }
    catch { continue; }
    if (!ganzeAbsaetze || !require("./briefing-frische").berlinTagVollImFenster(
      erster.stand.publikationstag, start, ende)) continue;
    const doc = [...gruppe.docs].sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
    tage.push({ doc, tag: erster.stand.publikationstag });
  }
  const normale = quellen(docs, now).filter(d => einfache.has(d) && Date.parse(d.published_at) >= start)
    .map(doc => ({ doc, tag: berlinTagKey(new Date(doc.published_at)) }));
  return normale.concat(tage.sort((a, b) => a.tag.localeCompare(b.tag)
    || String(a.doc.id).localeCompare(String(b.doc.id))));
}

function fristDaten(ko, docs, now) {
  const raw = typeof ko?.deadline === "string" ? ko.deadline.trim() : "";
  // Production speichert timestamptz; Offline-/Korrektureingaben kennen auch
  // reine Kalendertage. Kein lokales Datum ohne eindeutige Zeitzone annehmen.
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(raw)) return null;
  const calendar = new Date(raw.slice(0, 10) + "T12:00:00Z");
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== raw.slice(0, 10)) return null;
  const instant = raw.length === 10 ? calendar : new Date(raw);
  if (!Number.isFinite(instant.getTime())) return null;
  const day = raw.length === 10 ? raw : berlinTagKey(instant);
  return require("./briefing-fristbeleg").schlussfrist(quellen(docs, now), new Date(now), day);
}

const fristTag = (ko, docs, now) => fristDaten(ko, docs, now)?.tag ?? null;

function tagesAnlass(docs, now, fenster = null, ko = {}, profile = {}) {
  const frist = fristDaten(ko, docs, now);
  if (frist?.tag === berlinTagKey(now)) {
    if (frist.ms !== null && frist.ms <= new Date(now).getTime()) return null;
    const Q = require("./quellen-auszug"), P = require("./lage-profilbezug");
    const schluss = require("./briefing-fristbeleg").fristAnzeige(frist);
    for (const d of quellen(docs, now).map(Q.geleseneQuelle)) {
      const auszug = Q.plain(d.summary);
      if (!d.id || !Q.hatOriginalinhalt(d) || Q.satzpraefix(auszug, 12000) !== auszug) continue;
      for (const text of auszug.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/u)) {
        const quelle = { ...d, title: "", summary: text };
        const bezug = P.mitQuellenbezug([ko], profile, { [ko.vorgang_id]: [quelle] })[0]?.relevanz_erklaerung
          || (personenQuellen([quelle], now, profile).length ? {
            satz: "Die Quelle nennt Sie persönlich im Zusammenhang mit der belegten Frist.",
            belege: [{ art: "persoenlich", text: "Persönliche Nennung im selben Originalsatz wie die Frist." }]
          } : null);
        const ausSatz = bezug && fristDaten(ko, [quelle], now);
        if (!ausSatz || ausSatz.tag !== frist.tag || ausSatz.ms !== frist.ms) continue;
        return { art: "heutige-frist", documentIds: [d.id], termin: frist.tag,
          text: `${bezug.satz} Die quellenbelegte Frist endet heute am ${schluss}.`,
          recommendation: `Prüfen Sie, ob eine Einreichung für Ihr Mandat bis zum ${schluss} sinnvoll ist, und bereiten Sie gegebenenfalls die Unterlagen vor.`,
          beleg: { documentId: d.id, text, url: d.url || d.canonical_url, publishedAt: d.published_at }, profilbezug: bezug };
      }
    }
    // Der bereits bestehende reine Zeitnachweis bleibt fuer andere Leser
    // erhalten. Ohne Originalsatz und Profilbezug ist er kein Tagesauftrag.
    return { art: "heutige-frist", documentIds: quellen(docs, now).map(d => d.id).filter(Boolean),
      text: `Quellenbelegte Frist am ${schluss}; ein persönlicher Handlungsauftrag ist damit noch nicht bestätigt.` };
  }
  const orientierung = require("./briefing-orientierung").belege(ko, docs, now, profile);
  if (orientierung) return orientierung;
  const start = Date.parse((fenster || frischeFenster({ jetzt: now })).start);
  const neu = neueTagesQuellen(docs, now, start);
  if (!neu.length) return null;
  const letzterTag = neu.map(q => q.tag).sort().at(-1);
  return { art: "neue-quelle", documentIds: neu.map(q => q.doc.id).filter(Boolean),
    text: `Quellenstand: ${letzterTag}. Eine neue Veröffentlichung allein bestätigt keinen persönlichen Handlungsauftrag.` };
}

// Frische ist eine Zeitangabe, kein persoenlicher Auftrag. Die bestehenden
// Optionen (auch ohne Frist) brauchen denselben Original- und Mandatsbeleg.
function istTagesauftrag(anlass) {
  return Boolean(anlass && ["heutige-frist", "kommende-frist", "angekuendigter-schritt", "bevorstehender-schritt"].includes(anlass.art)
    && typeof anlass.recommendation === "string" && anlass.recommendation.trim()
    && typeof anlass.profilbezug?.satz === "string" && anlass.profilbezug.satz.trim()
    && anlass.profilbezug.belege?.length && anlass.beleg?.documentId
    && anlass.documentIds?.includes(anlass.beleg.documentId));
}

// Nur die bereits gespeicherte Quellenstelle des eigenen Items erneut pruefen.
// Keine fremden Quellen, kein Korpuslesen und kein Persistenz-/Hashwechsel.
function gespeicherterTagesauftrag(item, anlass, profile, now) {
  if (!item || !istTagesauftrag(anlass) || !Array.isArray(item.sourceIds)
    || !item.sourceIds.includes(anlass.beleg.documentId)) return null;
  const b = anlass.beleg, url = require("./lage-quellenbeleg").artikelUrl;
  if (!url(b.url) || !url(item.sourceUrl) || canonicalizeUrl(url(b.url)) !== canonicalizeUrl(url(item.sourceUrl))
    || typeof b.text !== "string" || !b.text.trim() || !Number.isFinite(Date.parse(b.publishedAt))
    || Date.parse(b.publishedAt) > new Date(now).getTime()
    || (item.meldungAt && Date.parse(item.meldungAt) !== Date.parse(b.publishedAt))) return null;
  const doc = { id: b.documentId, title: "", summary: b.text, url: b.url, published_at: b.publishedAt };
  const ko = { vorgang_id: item.id, headline: item.title || item.displayTitle || "", was_ist_passiert: b.text,
    status: "neu", understanding_status: "complete",
    ...(["heutige-frist", "kommende-frist"].includes(anlass.art) && anlass.termin ? { deadline: anlass.termin } : {}) };
  const aktuell = tagesAnlass([doc], now, null, ko, profile);
  return istTagesauftrag(aktuell) && aktuell.art === anlass.art
    && aktuell.beleg.documentId === b.documentId && aktuell.beleg.text === b.text ? aktuell : null;
}

const VERFAHRENSSTAND = [
  /\b(?:beschluss|beschlossen(?:e[nmrs]?)?|verabschiedet|gebilligt|angenommen|genehmigt|stimmte\b.{0,80}\bzu)\b/u,
  /\b(?:ablehnung|abgelehnt|verworfen)\b/u,
  /\b(?:überweisung|überwiesen|zugewiesen)\b/u,
  /\b(?:eingebracht|eingereicht|vorgelegt)\b/u,
  /\b(?:abgesetzt|abgesagt)\b/u,
  /\b(?:verlegt|verschoben)\b/u,
  /\b(?:aufgehoben|zurückgezogen)\b/u,
  /\b(?:tritt\b.{0,80}\bin kraft|in kraft getreten)\b/u,
  /\b(?:ernannt|gewählt)\b/u,
  /\b(?:zurückgetreten|rücktritt)\b/u
];
function radarWerte(satz) {
  const werte = [];
  for (const m of satz.matchAll(/\b(?:(\d{1,2})\.(\d{1,2})\.(\d{4})|(\d{4})-(\d{2})-(\d{2}))\b/gu)) {
    werte.push({ art: "datum", wert: m[4] ? m[0] : `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` });
  }
  for (const m of satz.matchAll(/\b(\d{1,2})(?:[:.](\d{2}))?\s*uhr\b/gu)) {
    werte.push({ art: "uhr", wert: `${m[1].padStart(2, "0")}:${m[2] || "00"}` });
  }
  for (const m of satz.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(prozent|%|euro|millionen|milliarden)(?!\p{L})/gu)) {
    werte.push({ art: m[2] === "%" ? "prozent" : m[2], wert: Number(m[1].replace(",", ".")) });
  }
  return werte;
}
function radarFakten(doc) {
  const Q = require("./quellen-auszug");
  if (!Q.hatOriginalinhalt(doc)) return [];
  const text = Q.plain(Q.geleseneQuelle(doc).summary);
  const ganz = Q.satzpraefix(text, text.length);
  return ganz.normalize("NFKC").toLocaleLowerCase("de")
    .split(/(?<=[.!?])\s+/u).flatMap(satz => {
      if (/\b(?:nicht|kein\p{L}*|womöglich|möglicherweise|könnte|würde|soll(?:e|en)?|voraussichtlich|geplant)\b/u.test(satz)) return [];
      const stand = VERFAHRENSSTAND.flatMap((muster, i) => muster.test(satz) ? [i] : []);
      const werte = radarWerte(satz);
      const inhalt = (satz.match(/[\p{L}\p{N}]+/gu) || []).join(" ");
      return stand.length || werte.length ? [{ inhalt, stand, werte }] : [];
    });
}

// Verschiedene URLs, Herausgeber oder Publikationstage belegen noch keine
// Entwicklung. Der verlinkte Originalabschnitt muss eine konkret vergleichbare
// Änderung tragen. Unklare Paraphrasen bleiben bei der Lage.
function beobachtung(docs, now, item = null) {
  const list = quellen(docs, now).filter(d => !d.publishedAtConflict);
  const neu = item
    ? list.find(d => Date.parse(d.published_at) === Date.parse(item.publishedAt || item.lastUpdatedAt)
      && (canonicalizeUrl(d.url || d.canonical_url) === canonicalizeUrl(item.sourceUrl)
        || (briefingArticleIdentity(item.sourceUrl) && briefingArticleIdentity(d.url || d.canonical_url) === briefingArticleIdentity(item.sourceUrl))))
    : list.at(-1);
  if (!neu || new Date(now).getTime() - Date.parse(neu.published_at) > 7 * 864e5) return null;
  const zuvor = list.filter(d => Date.parse(d.published_at) < Date.parse(neu.published_at)
    && require("./quellen-auszug").hatOriginalinhalt(d));
  if (!zuvor.length) return null;
  const bestand = zuvor.flatMap(radarFakten);
  const alteWerte = bestand.flatMap(fakt => fakt.werte);
  if (!radarFakten(neu).some(fakt => !bestand.some(alt => alt.inhalt === fakt.inhalt)
    && (fakt.stand.some(stand => !bestand.some(alt => alt.stand.includes(stand)))
      || fakt.werte.some(neu => alteWerte.some(alt => alt.art === neu.art)
        && !alteWerte.some(alt => alt.art === neu.art && alt.wert === neu.wert))))) return null;
  const tag = berlinTagKey(new Date(neu.published_at));
  return { art: "weitere-berichte", documentIds: [...zuvor, neu].map(d => d.id).filter(Boolean),
    sourceCount: zuvor.length + 1, publishedAt: neu.published_at,
    text: `Die Originalquelle vom ${tag} belegt einen neuen Sachstand. Daraus folgt noch kein politischer Trend.` };
}

function personenQuellen(docs, now, profile) {
  const R = require("./radarState"), terms = R.profileTerms(profile);
  return quellen(docs, now).filter(d => d.id
    && new Date(now).getTime() - Date.parse(d.published_at) <= 7 * 864e5
    && [require("./herausgeber").titelRumpf(d), d.summary].some(t =>
      typeof t === "string" && R.detectPersonMention({ display_title: t }, terms)));
}

// Eine Vorgangsueberschrift ist kein Artikeltitel. Nur die eindeutig an Link
// UND exakten Publikationszeitpunkt gebundene Quelle darf die Anzeige benennen.
// Unterstuetzt rohe Producerquellen und bereits oeffentliche Paketquellen;
// fehlende Dokumentkennungen werden dabei niemals erfunden.
function radarArtikelbindung(item, docs, now) {
  const artikelUrl = require("./lage-quellenbeleg").artikelUrl;
  const url = artikelUrl(item?.sourceUrl), time = Date.parse(item?.publishedAt || item?.lastUpdatedAt || ""),
    nowMs = new Date(now).getTime();
  if (!item?.vorgangId || !url || !Number.isFinite(time) || !Number.isFinite(nowMs) || time > nowMs) return null;
  if (item.publishedAt && item.lastUpdatedAt && Date.parse(item.publishedAt) !== Date.parse(item.lastUpdatedAt)) return null;
  const gleich = value => {
    const target = artikelUrl(value);
    return target && (canonicalizeUrl(target) === canonicalizeUrl(url)
      || (briefingArticleIdentity(url) && briefingArticleIdentity(url) === briefingArticleIdentity(target)));
  };
  if (item.ursprungsBeleg?.url && !gleich(item.ursprungsBeleg.url)) return null;
  const ids = [item.documentId, item.ursprungsBeleg?.documentId].filter(Boolean);
  if (new Set(ids).size > 1) return null;
  const matches = (Array.isArray(docs) ? docs : []).filter(d => gleich(d?.canonical_url || d?.url));
  if (!matches.length) return null;
  const titles = new Set();
  for (const d of matches) {
    const title = typeof d.title === "string" ? d.title.trim() : "", date = d.published_at || d.publishedAt,
      id = d.id || d.documentId;
    if (!title || Date.parse(date || "") !== time
      || (d.published_at && d.publishedAt && Date.parse(d.published_at) !== Date.parse(d.publishedAt))
      || (ids.length && id && id !== ids[0])
      || ((d.vorgangId || d.vorgang_id) && (d.vorgangId || d.vorgang_id) !== item.vorgangId)) return null;
    titles.add(title);
  }
  return titles.size === 1 ? { ...item, title: [...titles][0] } : null;
}

// Dieselbe Artikelpruefung fuer neue und gespeicherte Radarprojektionen.
// Unbelegte Parteichips verschwinden auch an einer sonst gueltigen Dynamik;
// deren fachlicher Beobachtungsgrund wird dadurch nicht entfernt.
const radarParteiLabel = value => /^(?:Betrifft (?:deine|Ihre|die) Partei|Partei:|Fraktion:)/i.test(String(value || ""));
function radarHatParteibezug(item = {}) {
  return ["party", "faction"].includes(item.relationType)
    || (Array.isArray(item.relationTypes) && item.relationTypes.some(t => ["party", "faction"].includes(t)))
    || radarParteiLabel(item.relationLabel)
    || (Array.isArray(item.zusatzSignale) && item.zusatzSignale.some(radarParteiLabel));
}
function radarParteiZuordnung(item, profile = {}, parteiSegment = false) {
  if (!item) return null;
  const parteiTyp = value => value === "party" || value === "faction";
  const label = radarParteiLabel;
  const types = Array.isArray(item.relationTypes) ? item.relationTypes : [];
  const signale = Array.isArray(item.zusatzSignale) ? item.zusatzSignale : [];
  const hatPartei = parteiSegment || radarHatParteibezug(item);
  if (!hatPartei && !signale.some(label)) return item;
  const R = require("./radarState"), terms = R.radarProfileTerms(profile),
    doc = { title: item.title, url: item.sourceUrl, source_name: item.sourceName },
    belegt = R.radarParteiArtikelbeleg(doc, terms.parties);
  if (parteiSegment && !belegt) return null;
  const out = { ...item };
  if (Object.hasOwn(item, "relationTypes")) out.relationTypes = types.filter(t => !parteiTyp(t) || belegt);
  if (!belegt) {
    if (parteiTyp(item.relationType) || label(item.relationLabel)) {
      if (parteiTyp(item.relationType)) delete out.relationType;
      delete out.relationLabel; delete out.relevanceEvidence;
    }
    if (!item.relationType && types.length && types.every(parteiTyp)) delete out.relevanceEvidence;
    if (parteiTyp(item.ursprungsBeleg?.relationType)) {
      const { relationType, publisherName, publisherId, ...bindung } = item.ursprungsBeleg;
      out.ursprungsBeleg = bindung;
    }
    if (Object.hasOwn(item, "zusatzSignale")) out.zusatzSignale = signale.filter(s => !label(s));
  } else if (parteiSegment || parteiTyp(item.relationType) || label(item.relationLabel)) {
    const ursprung = R.radarParteiQuellenursprung(doc, terms.parties);
    out.relationType = ursprung?.relationType || "party";
    out.relationLabel = ursprung ? `${ursprung.relationType === "faction" ? "Fraktion" : "Partei"}: ${ursprung.publisherName}` : R.RELATION_LABELS.party;
  }
  return out;
}

function radarAnzeige(roh, sourcesByVorgang, now, kos = [], profile = {}) {
  const out = { mentions: [], environment: { party: [], constituency: [], committees: [] }, dynamics: [], articles: [] };
  const gesehen = new Set();
  const artikelGesehen = new Set();
  const uebernehme = (i, target, persoenlich = false, parteiSegment = false) => {
    if (!i?.vorgangId || gesehen.has(i.vorgangId)) return;
    const docs = sourcesByVorgang[i.vorgangId] || [];
    if (persoenlich) {
      // Die KO-weite Erwaehnung ist nur ein Kandidat. Der verlinkte Artikel
      // selbst muss den vollen Profilnamen tragen; ein neuer anderer Artikel
      // desselben Clusters darf die Erwaehnung nicht uebernehmen.
      const R = require("./radarState");
      const src = R.pickPrimarySource({}, personenQuellen(docs, now, profile));
      if (!src?.documentId) return;
      // Titel, Adresse, Medium und Datum stammen aus EINEM belegten Artikel.
      // Kein KO-Titel und kein best_source_url-Fallback fuer "Ueber dich".
      i = { ...i, documentId: src.documentId, title: src.title,
        sourceUrl: src.url, sourceName: src.sourceName, publishedAt: src.publishedAt,
        sourceCategoryType: src.sourceType, sourceCategory: R.sourceCategoryLabel(src.sourceType), linkType: src.linkType,
        dipBeratungsstaende: src.dipBeratungsstaende, dipDokumentUrl: src.dipDokumentUrl,
        parlamentsBelege: src.parlamentsBelege, parlamentsDokumentUrl: src.parlamentsDokumentUrl };
    } else {
      i = radarArtikelbindung(i, docs, now);
      if (!i) return;
    }
    i = radarParteiZuordnung(i, profile, parteiSegment);
    if (!i) return;
    const frist = fristTag(kos.find(k => k.vorgang_id === i.vorgangId), docs, now);
    const signal = frist && frist > berlinTagKey(now)
      ? { art: "kommende-frist", documentIds: quellen(docs, now).map(d => d.id).filter(Boolean),
        text: `Quellenbelegte Frist am ${frist}. Den Vorgang bis dahin im Blick behalten; die Tagespriorisierung steht im Briefing.` }
      : beobachtung(docs, now, i);
    // Eine frische Eigenerwaehnung hat eine eigene Beobachtungsfunktion. Die
    // schon gepruefte Relation wird benannt, ihr politischer Inhalt nicht kopiert.
    const frisch = persoenlich && quellen(docs, now).some(d =>
      (d.id === i.documentId || canonicalizeUrl(d.url || d.canonical_url) === canonicalizeUrl(i.sourceUrl))
      && new Date(now).getTime() - Date.parse(d.published_at) <= 7 * 864e5);
    if (!signal && !frisch) return;
    // Die Personenquelle kann gegenueber der Rohzuordnung gewechselt haben.
    // Deshalb Artikelidentitaet auf der tatsaechlichen Anzeige erneut pruefen.
    const artikelKeys = [i.documentId && "id:" + i.documentId,
      i.sourceUrl && "url:" + canonicalizeUrl(i.sourceUrl), briefingArticleIdentity(i.sourceUrl)].filter(Boolean);
    if (artikelKeys.some(k => artikelGesehen.has(k))) return;
    artikelKeys.forEach(k => artikelGesehen.add(k));
    gesehen.add(i.vorgangId);
    const copy = { ...i, summary: "", shortSummary: "", zusatzSignale: [],
      evidence: signal?.text || `Die Quelle vom ${berlinTagKey(new Date(i.publishedAt))} nennt deinen Namen. Eine Bewertung des Tons oder der Resonanz liegt nicht vor.`,
      beobachtungsBeleg: signal || { art: "eigenerwaehnung", documentIds: [i.documentId].filter(Boolean) } };
    // Ton/Initiative aus KO-Prosa sind keine belegte Entwicklung.
    if (persoenlich) Object.assign(copy, { mentionType: "directName", mentionLabel: "Name in der Quelle", mentionTone: "unknown", confidence: "unknown" });
    if (copy.signalType && signal) Object.assign(copy, { signalType: signal.art === "kommende-frist" ? "deadline" : "rising",
      signalLabel: signal.art === "kommende-frist" ? "Kommende Frist" : "Belegte Aktualisierung", sourceCount: signal.sourceCount || quellen(docs, now).length });
    target.push(copy);
  };
  for (const i of roh.mentions || []) uebernehme(i, out.mentions, true);
  for (const key of Object.keys(out.environment))
    for (const i of roh.environment?.[key] || []) uebernehme(i, out.environment[key], false, key === "party");
  for (const i of roh.dynamics || []) uebernehme(i, out.dynamics);
  // Keine zweite Artikelliste: ohne Beobachtungsfunktion bleibt der Sachstand
  // ausschliesslich in Lage. Rohzuordnungen bleiben fuer Diagnose erhalten.
  return out;
}

module.exports = { quellen, fristTag, fristDaten, tagesAnlass, istTagesauftrag, gespeicherterTagesauftrag,
  beobachtung, personenQuellen, radarArtikelbindung, radarHatParteibezug, radarParteiZuordnung, radarAnzeige };
