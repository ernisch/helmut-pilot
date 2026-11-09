"use strict";

// Kurzer Originalkontext fuer bereits gespeicherte, eindeutig gebundene Artikel.
// Kein Modell, kein Volltextspeicher und keine Ersatzquelle aus einer KO-Analyse.
const D = require("./dedup");
const MAX = 240;
function plain(value) {
  const entities = { amp: "&", quot: '"', apos: "'", nbsp: " ", auml: "ä", ouml: "ö", uuml: "ü",
    Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", ndash: "–", mdash: "—", bdquo: "„", ldquo: "“", rdquo: "”" };
  return String(value || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, key) => {
      if (!key.startsWith("#")) return entities[key] ?? whole;
      const n = key[1].toLowerCase() === "x" ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
    }).replace(/\s+/g, " ").trim();
}
function words(value) { return plain(value).toLocaleLowerCase("de").match(/[\p{L}\p{N}]{3,}/gu) || []; }
function institutionellerMetatext(value) {
  const s = plain(value).toLocaleLowerCase("de");
  if (!s) return false;
  return /\b(?:willkommen auf|auf dieser seite finden sie|hier finden sie informationen|wir informieren (?:sie )?über)\b/u.test(s)
    || /\b(?:das|die) (?:bundesministerium|ministerium|behörde|verwaltung|bundesamt)\b.{0,100}\b(?:ist zuständig|informiert über seine aufgaben|stellt sich vor|arbeitet für|engagiert sich für)\b/u.test(s);
}
// Cookie-/JavaScript-/Zugriffs-/Login-Hinweise sind Bedienmetatext, kein
// Artikelauszug. Derselbe Praedikat-Helfer gilt im excerpt() UND im
// Lage-Kartenpfad, damit solche Störtexte keine freie KO-Prosa freischalten.
function stoertext(value) {
  // Beide Aufrufer liefern bereits normalisierten Text. Nicht erneut HTML
  // dekodieren: excerpt() behaelt damit exakt seinen bisherigen Vertrag.
  return /cookie|javascript|zugriff verweigert|access denied|enable cookies|abonnieren sie|jetzt anmelden|datenschutzeinstellungen/iu.test(String(value || ""));
}
function titleMatches(actual, expected) {
  const a = new Set(words(actual)), e = new Set(words(expected));
  if (a.size < 3 || e.size < 3) return false;
  const same = [...a].filter(w => e.has(w)).length;
  return same >= 3 && same / Math.min(a.size, e.size) >= 0.75;
}
function satzpraefix(text, max = MAX) {
  // Auch kurze Publisher Metadaten koennen mitten im Wort enden. Eine
  // vorhandene Ellipse oder ein Titel wie Dr. ist keine Satzgrenze.
  let ende = 0;
  for (const m of text.matchAll(/[.!?][”"“'’»)]*(?=\s|$)/gu)) {
    const bis = m.index + m[0].length;
    if (bis > max) break;
    if (m[0][0] === ".") {
      if (text[m.index - 1] === ".") continue;
      const wort = /([\p{L}\p{N}]+)\.$/u.exec(text.slice(0, m.index + 1))?.[1] || "";
      if (/^(?:\p{L}|\d+|Dr|Prof|Dipl|Ing|bzw|ca|Nr|Abs|Art|Mio|Mrd|Str|usw|etc)$/iu.test(wort)) continue;
      if (/^[\p{Ll}]/u.test(text.slice(bis).trimStart())) continue;
    }
    ende = bis;
  }
  return text.slice(0, ende);
}
function excerpt(value, title) {
  let text = plain(value);
  if (institutionellerMetatext(text)) return null;
  text = satzpraefix(text);
  if (text.length < 60 || text.length > MAX) return null;
  const extra = words(text).filter(w => !new Set(words(title)).has(w));
  if (new Set(extra).size < 5) return null;
  if (stoertext(text)) return null;
  return text;
}
function geleseneQuelle(document) {
  if (!document || !Object.hasOwn(document, "quellenauszug_beleg")) return document;
  // Ein validierter Artikelstand (Bundestag, Berlin ODER Brandenburg) traegt seinen vollstaendigen
  // gebundenen Absatz exakt hashgebunden als summary. Die generische 240-Zeichen-Reparatur
  // darf ihn niemals still verkuerzen; der Stand wird dabei selbst strikt validiert.
  const stand = require("./artikelstand").leseStand(document);
  // Nur der kleine Herkunftsbeleg wird projiziert, keine fremden Rohmetadaten.
  // Gespeicherte Originale bleiben unveraendert. Fuer alle Verbraucher gilt
  // derselbe Vertrag wie bei einer neuen Uebernahme aus diesem Quellenpfad.
  const { quellenauszug_beleg: beleg, ...quelle } = document;
  if (stand) return quelle;
  if (beleg?.status === "ergaenzt") quelle.summary = excerpt(quelle.summary, quelle.title);
  // An der bekannten alten Speichergrenze koennen auch RSS Auszuege vom
  // Motor abgeschnitten worden sein. Kurze freie RSS Kontexte sind kein
  // Beweis eines Abbruchs und werden nicht pauschal verworfen.
  else if (typeof quelle.summary === "string" && quelle.summary.length === MAX)
    quelle.summary = satzpraefix(quelle.summary) || null;
  return quelle;
}
function inhaltsauftragAusEnv(env = process.env) {
  if (env.HELMUT_ARTIKELKONTEXT !== "on") return null;
  const hosts = String(env.HELMUT_SUCHWEGAUSZUEGE_HOSTS || "").split(",").map(h => h.trim().toLowerCase()).filter(Boolean);
  const gueltig = hosts.every(host => {
    try { return require("./artikelkontext-abrufschutz").artikelHost(`https://${host}/artikel`) === host; }
    catch { return false; }
  });
  // Ohne gueltige exakte Freigabe ausschliesslich vorhandene Belege lesen.
  // Ein gesetztes Artikelkontextflag ist keine pauschale Hostfreigabe.
  return { vorbereitet: true, hosts: gueltig ? [...new Set(hosts)] : [] };
}
function hatOriginalinhalt(doc) {
  const text = plain(geleseneQuelle(doc)?.summary);
  if (!text || institutionellerMetatext(text) || stoertext(text)) return false;
  const ganz = satzpraefix(text, text.length);
  const woerter = s => String(s || "").toLocaleLowerCase("de").match(/[\p{L}\p{N}]{3,}/gu) || [];
  const titel = new Set(woerter(require("./herausgeber").titelRumpf(doc)));
  // Das Anzeigeauszuglimit240 ist kein Qualitaetslimit fuer vorhandenes RSS.
  return ganz.length >= 60 && new Set(woerter(ganz).filter(w => !titel.has(w))).size >= 5;
}
function brauchtInhalt(doc) {
  return !require("./artikelstand").leseStand(doc)
    && !require("./parlamentsdaten-herkunft").istParlamentsdatenDokument(doc)
    && !require("./dip-quellfelder").lese(doc)
    && !hatOriginalinhalt(doc);
}
// Nur eine Leseprojektion fuer die bestehenden Lage-/Briefingpruefer. Der
// Quellenhash wird VOR der Projektion gegen dieselbe gelesene Quelle wie beim Understanding geprueft.
// Bereits brauchbarer RSS-Text bleibt erhalten. Kein Abruf beim App-Oeffnen.
async function mitGespeichertemArtikelkontext(documents, deps = {}) {
  const auftrag = inhaltsauftragAusEnv(deps.env || process.env);
  const normal = documents.map(geleseneQuelle);
  if (!auftrag?.hosts.length) return normal;
  const ergebnisse = new Map();
  const kandidaten = [];
  for (let i = 0; i < documents.length; i++) {
    const d = normal[i];
    if (d?.artikelkontext || d?.link_type !== "direct" || !brauchtInhalt(d)) continue;
    let key;
    try {
      if (!auftrag.hosts.includes(new URL(d.url).hostname)) continue;
      key = JSON.stringify(d);
    } catch { continue; }
    if (!ergebnisse.has(key)) { ergebnisse.set(key, null); kandidaten.push({ key, document: d }); }
  }
  // Dieselbe begrenzte Parallelitaet wie beim vorhandenen Quellenleser.
  // Identische Belege innerhalb dieses Aufrufs nur einmal lesen; kein neuer Cache.
  for (let start = 0; start < kandidaten.length; start += 8) {
    await Promise.all(kandidaten.slice(start, start + 8).map(async ({ key, document }) => {
      const result = await require("./artikelkontext-belegspeicher").leseArtikelkontext(document, deps);
      if (result.ok) ergebnisse.set(key, result.beleg);
    }));
  }
  return normal.map((d, i) => {
    const original = normal[i];
    let beleg;
    try { beleg = ergebnisse.get(JSON.stringify(original)); }
    catch { return d; }
    return beleg ? { ...d, summary: beleg.text,
      artikelkontext: { beleg, auszugVorher: original.summary ?? null } } : d;
  });
}
function gepruefterArtikelkontext(document) {
  if (!document?.artikelkontext) return null;
  const { beleg, auszugVorher } = document.artikelkontext;
  const checked = require("./artikelkontext").pruefeArtikelkontext([{ ...document, summary: auszugVorher }], beleg);
  if (!checked) return null;
  if (document.summary !== checked.text || beleg.textHash !== checked.textHash)
    throw new Error("artikelkontext-leseprojektion-abweichend");
  return checked;
}
function artikelkontextHerkunft(document) {
  const checked = gepruefterArtikelkontext(document);
  if (!checked) return null;
  return { dokumentId: checked.dokumentId, quellenHash: checked.quellenHash, textHash: checked.textHash,
    verfahren: checked.gewinnung.verfahren, antwortHash: checked.gewinnung.antwortHash,
    gelesenAm: checked.gelesenAm };
}
function istAbschnittsquelle(document) {
  return document?.artikelkontext?.beleg?.gewinnung?.verfahren === "artikelabschnitte-v4"
    || !document?.artikelkontext && typeof document?.summary === "string"
      && (document.summary.length > 1400 || Buffer.byteLength(document.summary, "utf8") > 12000);
}
// Textverfuegbarkeit kommt ausschliesslich aus dem streng geprueften Vollbeleg.
// Die KO-Quittung bestaetigt nur, WELCHE dieser Abschnitte verstanden wurden;
// sie erzeugt weder Text noch eine fingierte Original-/Modelllektüre.
function geleseneArtikelabschnitte(document, ko) {
  if (!istAbschnittsquelle(document)) return [];
  const checked = gepruefterArtikelkontext(document);
  if (document?.artikelkontext && !checked) return [];
  const L = require("./quellen-lektuerebeleg");
  const gelesen = L.leseQuellenLektuere(ko).find(q => q.dokumentId === document.id);
  const bundle = checked?.gewinnung?.abschnitte || require("./artikel-abschnitte").segmentiere(document.summary);
  if (!gelesen?.abschnitt || gelesen.abschnitt.bundleHash !== bundle.bundleHash
      || gelesen.abschnitt.count !== bundle.count || ko?.understanding_status !== "complete") return [];
  const original = checked ? { ...document, summary: document.artikelkontext.auszugVorher } : document;
  const teile = [];
  for (let index = 0; index < gelesen.geleseneAbschnitte.length; index++) {
    const { abschnitte, ...meta } = bundle;
    const quelle = L.quelleMitAbschnitt(original, 0, checked, { ...meta, ...abschnitte[index] });
    const beleg = L.quellenLektuereBeleg(quelle, gelesen.hashVersion);
    if (beleg.quellenHash !== gelesen.quellenHash || beleg.textstandHash !== gelesen.geleseneAbschnitte[index]
        || index === gelesen.abschnitt.index && beleg.textstandHash !== gelesen.textstandHash) return [];
    const { text, ...piece } = quelle.quellenabschnitt;
    // Merkle-Mitgliedschaft ist gegen den vollstaendigen, zuvor validierten
    // Originalstand geprueft. In den kleinen Verbraucher-Kontext gehen nur die
    // noetigen Bindungswerte, nicht alle bis zu256 Abschnittshashes.
    teile.push({ text, abschnitt: { index: piece.index, count: piece.count, start: piece.start, end: piece.end,
      textHash: piece.textHash, originalHash: piece.originalHash, bundleHash: piece.bundleHash } });
  }
  return teile;
}
function waehleGelesenenArtikelabschnitt(document, ko) {
  const teile = geleseneArtikelabschnitte(document, ko);
  if (!teile.length) return null;
  const normal = s => plain(s).toLocaleLowerCase("de");
  const aussage = normal(ko?.was_ist_passiert);
  const stop = new Set(["diese", "dieser", "diesem", "dieses", "einen", "einer", "einem", "eines", "haben", "werden", "wurde", "wird", "sowie", "durch", "unter", "einer", "wurde", "bereits"]);
  const anker = new Set(words([ko?.headline, ko?.was_ist_passiert, ko?.wer_ist_betroffen].filter(Boolean).join(" "))
    .filter(w => w.length >= 5 && !stop.has(w)));
  const ranked = teile.map(p => {
    const woerter = new Set(words(p.text));
    const gemeinsam = [...anker].filter(w => woerter.has(w)).length;
    return { ...p, score: gemeinsam + (aussage.length >= 24 && normal(p.text).includes(aussage) ? 1000 : 0) };
  }).filter(p => p.score >= 2).sort((a, b) => b.score - a.score || a.abschnitt.index - b.abschnitt.index);
  if (!ranked.length) return null;
  const { score, ...auswahl } = ranked[0];
  const herkunft = artikelkontextHerkunft(document);
  return { ...auswahl, ...(herkunft ? { artikelkontext: { ...herkunft,
    abschnitt: auswahl.abschnitt, auswahl: "ko-wortuebereinstimmung-kein-fachurteil" } }
    : { quellenabschnitt: { ...auswahl.abschnitt, auswahl: "ko-wortuebereinstimmung-kein-fachurteil" } }) };
}
function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu)]
    .map(m => [m[1].toLowerCase(), plain(m[2] ?? m[3] ?? m[4])]));
}
function fromHtml(document, response) {
  if (require("./parlamentsdaten-herkunft").istParlamentsdatenDokument(document)) return { ok: false, reason: "quelle-nur-metadaten" };
  const expected = new Set([document.canonical_url, document.url].filter(Boolean).map(D.canonicalizeUrl));
  const final = D.canonicalizeUrl(response?.finalUrl);
  if (!final || !expected.has(final)) return { ok: false, reason: "artikelziel-abweichend" };
  const html = String(response.body || "");
  if (!html || html.length > 10 * 1024 * 1024) return { ok: false, reason: "artikelantwort-ungueltig" };
  const metas = [...html.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)].map(m => attrs(m[0]));
  const links = [...html.matchAll(/<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)].map(m => attrs(m[0]));
  const canonical = links.find(l => l.rel?.toLowerCase() === "canonical")?.href;
  if (canonical) {
    let resolved;
    try { resolved = D.canonicalizeUrl(new URL(canonical, response.finalUrl).href); } catch { return { ok: false, reason: "artikelziel-abweichend" }; }
    if (!expected.has(resolved)) return { ok: false, reason: "artikelziel-abweichend" };
  }
  const meta = key => metas.find(m => (m.property || m.name || "").toLowerCase() === key)?.content;
  const title = meta("og:title") || plain(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]);
  if (!titleMatches(title, document.title)) return { ok: false, reason: "artikeltitel-abweichend" };
  for (const key of ["og:description", "description", "twitter:description"]) {
    const summary = excerpt(meta(key), document.title);
    if (summary) return { ok: true, summary, origin: "artikel-metadaten", method: key, finalUrl: response.finalUrl };
  }
  return { ok: false, reason: "kein-belastbarer-artikelauszug" };
}
function fromMirror(document, items) {
  if (require("./parlamentsdaten-herkunft").istParlamentsdatenDokument(document)) return { ok: false, reason: "quelle-nur-metadaten" };
  for (const item of items || []) {
    const row = D.toRawDocumentRow(item);
    if (!row || row.id !== document.id || !titleMatches(row.title, document.title)
      || Date.parse(row.published_at) !== Date.parse(document.published_at)) continue;
    for (const value of [item.summary, item.content, item.excerpt]) {
      const summary = excerpt(value, document.title);
      if (summary) return { ok: true, summary, origin: "gespeicherter-rohspiegel", method: "identische-quellkennung", finalUrl: row.canonical_url };
    }
  }
  return { ok: false, reason: "kein-belastbarer-rohauszug" };
}
// Bereits als NEU geplante Suchweg-Dokumente: genau ein begrenzter
// Originalmetadatenabruf vor der atomaren Neuanlage. Keine Altzeilenkorrektur,
// kein Volltext, kein Modell. Eigener Schalter; der Understanding-Anschluss
// HELMUT_ARTIKELKONTEXT bleibt davon unabhaengig und standardmaessig aus.
async function ergaenzeNeueSuchwegAuszuege(documents, deps = {}) {
  let readRequests = 0;
  const out = (reason, attempted = 0, prepared = 0, rows = documents) => ({
    documents: rows, metadatenAuszug: { attempted, prepared, readRequests, reason }
  });
  const env = deps.env || process.env;
  if (env.HELMUT_SUCHWEGAUSZUEGE !== "on") return out("ausgeschaltet");
  // Qualitaetsvertrauen ist keine Abruf-/Nutzungsfreigabe. Nur ausdruecklich
  // benannte exakte Hosts, keine Wildcards oder pauschale Medienfreigabe.
  const hosts = String(env.HELMUT_SUCHWEGAUSZUEGE_HOSTS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!hosts.length || hosts.some(host => {
    try { return require("./artikelkontext-abrufschutz").artikelHost(`https://${host}/artikel`) !== host; }
    catch { return true; }
  })) return out("herausgeber-nicht-freigegeben");
  if (!Array.isArray(documents) || typeof deps.leseVorhandene !== "function"
    || typeof deps.fetchUrl !== "function") return out("anschluss-unvollstaendig");
  if (deps.abbruchSignal?.aborted) return out("abgebrochen");
  const safety = require("./sourceSafety");
  const candidates = documents.filter(doc => {
    if (!doc || !doc.id || doc.summary || doc.raw?.helmutQuellenkontext || doc.link_type !== "direct" || !doc.url
      || !doc.canonical_url || D.canonicalizeUrl(doc.url) !== D.canonicalizeUrl(doc.canonical_url)
      || require("./parlamentsdaten-herkunft").istParlamentsdatenDokument(doc)) return false;
    try { if (!hosts.includes(new URL(doc.url).hostname.toLowerCase())) return false; }
    catch { return false; }
    // Die aufgeloeste Herausgeberdomain entscheidet, NICHT der ministry/media
    // Typ des Google Suchkanals. Unbekannte oder gesperrte Herausgeber auslassen.
    if (safety.categorizeSource({ url: doc.url }) !== "medien"
      || !["hoch", "mittel"].includes(safety.trustForSource({ url: doc.url }))) return false;
    // Dokumentziel und Google-Fundstelle bleiben getrennt. Fuer die Abrufauswahl
    // nur die zuvor gebundenen Eingabe IDs verwenden, keine Herkunft erraten.
    return Array.isArray(deps.suchwegDokumentIds) && deps.suchwegDokumentIds.includes(doc.id);
  }).slice(0, 100);
  if (!candidates.length) return out("keine-neuen-suchwegluecken");
  let existing;
  try { readRequests++; existing = await deps.leseVorhandene(candidates.map(d => d.id)); }
  catch { return out("bestand-nicht-lesbar"); }
  // Der Dedup Bestand deckt nur14 Tage ab. Exakte IDs erneut lesen, bevor ein
  // aelteres Dokument versehentlich einen weiteren Artikelabruf ausloest.
  if (!Array.isArray(existing) || existing.some(d => !d || !candidates.some(c => c.id === d.id)))
    return out("bestand-nicht-bestaetigt");
  if (deps.abbruchSignal?.aborted) return out("abgebrochen");
  const doc = candidates.find(d => !existing.some(e => e.id === d.id));
  if (!doc) return out("nur-bestandsdokumente");
  let result;
  try {
    const host = new URL(doc.url).hostname.replace(/^www\./, "");
    // Der vorhandene Fetch erzwingt DNS/SSRF, HTTPS, TLS, Status200,
    // Herausgeberbindung,1MiB,20s und die bestehende Anbietersteuerung.
    const response = await deps.fetchUrl(doc.url, 0,
      { env, artikelkontext: true, allowedHost: host, abbruchSignal: deps.abbruchSignal });
    // Respektiere explizite Metadatenbeschraenkungen des Originaldokuments.
    const restricted = [...String(response.body || "").matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)]
      .map(m => attrs(m[0])).some(m => /^(?:robots|helmutbot)$/i.test(m.name || "")
        && /(?:^|[\s,])(?:nosnippet|noai|noindex|max-snippet\s*:\s*0)(?:$|[\s,])/i.test(m.content || ""));
    if (restricted) return out("original-metadaten-gesperrt", 1);
    result = fromHtml(doc, response);
  } catch { return out("originalabruf-nicht-bestaetigt", 1); }
  if (!result.ok) return out(result.reason, 1);
  const rows = documents.map(d => d === doc ? { ...d, summary: result.summary,
    raw: { ...(d.raw || {}), helmutQuellenkontext: {
      version: 1, status: "ergaenzt", methode: result.method, herkunft: result.origin,
      auszugHash: require("node:crypto").createHash("sha256").update(result.summary).digest("hex")
    } }
  } : d);
  // Nur vorbereitet: erst der bestehende Insert mit Rueckantwort belegt Speicherung.
  return out("originalauszug-vorbereitet", 1, 1, rows);
}
module.exports = { MAX, plain, excerpt, satzpraefix, geleseneQuelle, mitGespeichertemArtikelkontext,
  artikelkontextHerkunft, inhaltsauftragAusEnv, hatOriginalinhalt, brauchtInhalt,
  istAbschnittsquelle, geleseneArtikelabschnitte, waehleGelesenenArtikelabschnitt,
  institutionellerMetatext, stoertext, titleMatches, fromHtml, fromMirror, ergaenzeNeueSuchwegAuszuege };
