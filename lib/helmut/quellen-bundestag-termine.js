"use strict";

// Amtliche parlamentarische Quellen; keine persoenlichen Kalender/Einladungen.
// Reine Parser + begrenzter Aufnahmeadapter im bestehenden Quellenauftrag.
// Ohne aktuellen, expliziten Katalog-/Rechtebeleg KEIN Netz und KEIN Schreiben.
const crypto = require("node:crypto"), { isDeepStrictEqual: same } = require("node:util");
const PREFIX = "https://www.bundestag.de";
const QUELLEN = Object.freeze([
  { id: "bt-termine-arbeit-soziales", key: "arbeit-soziales", art: "ausschuss",
    url: PREFIX + "/ausschuesse/a11_arbeit_soziales/tagesordnungen" },
  { id: "bt-termine-wirtschaft-energie", key: "wirtschaft-energie", art: "ausschuss",
    url: PREFIX + "/ausschuesse/a09_wirtschaft/wp21_a09_Tagesordnung" },
  { id: "bt-termine-digitales", key: "digitales-staatsmodernisierung", art: "ausschuss",
    url: PREFIX + "/ausschuesse/a23_digitales_staatsmodernisierung/tagesordnungen" },
  { id: "bt-termine-plenum", key: "plenum", art: "plenum", url: PREFIX + "/parlament/plenum/tagesordnungen" },
  { id: "bt-termine-sitzungswochen", key: "sitzungswochen", art: "kalender", url: PREFIX + "/parlament/plenum/sitzungskalender" }
].map(q => Object.freeze({ ...q, crawlMethod: "structured_download", retrievalPathId: "rp-" + q.id })));
const MONATE = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];
const MAX_DOCS = 8, MAX_BYTES = 2 * 1024 * 1024;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const hash = value => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : JSON.stringify(canonical(value))).digest("hex");
const fail = reason => { throw Error("bundestag-termine-" + reason); };
function plain(s) {
  return String(s || "").replace(/<svg\b[\s\S]*?<\/svg>/gi, "").replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim();
}
function datum(s) {
  const m = /^(\d{1,2})\s*\.\s*(?:(\d{1,2})\s*\.|([A-Za-zäÄ]+))\s*(\d{4})$/.exec(String(s).trim());
  if (!m) return null;
  const month = m[2] ? +m[2] : MONATE.indexOf(m[3].toLowerCase()) + 1;
  const iso = `${m[4]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return day(iso);
}
function day(iso) {
  if (!/^\d{4}-\d\d-\d\d$/.test(iso)) return null;
  const d = new Date(iso + "T00:00:00Z");
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === iso ? iso : null;
}
const datePattern = "\\d{1,2}\\s*\\.\\s*(?:[A-Za-zäÄ]+|\\d{1,2}\\s*\\.)\\s*\\d{4}";
function amtlich(url) {
  try { const u = new URL(url); return u.protocol === "https:" && u.hostname === "www.bundestag.de"
    && !u.username && !u.password && !u.port && !u.search && !u.hash ? u.href : null; } catch { return null; }
}
function quelle(q) {
  const s = QUELLEN.find(s => s.id === q?.id);
  if (!s || s.url !== q.url || s.crawlMethod !== q.crawlMethod || s.retrievalPathId !== q.retrievalPathId) return null;
  if (q.rssUrl || q.rssUrls?.length) return null;
  return s;
}
function endpoint(q, html) {
  if (!QUELLEN.includes(q) || q.art !== "ausschuss") fail("quelle");
  const text = String(html).replace(/&quot;/g, '"');
  const values = [...text.matchAll(/"endpoint"\s*:\s*"([^"]+)"/g)].map(m => new URL(m[1], PREFIX).href)
    .filter(url => amtlich(url) && new URL(url).pathname.startsWith("/ajax/filterlist/de/" + new URL(q.url).pathname.slice(1) + "/"));
  if (new Set(values).size !== 1) fail("listen-endpoint");
  return values[0];
}
function dokumentLinks(q, html) {
  if (!QUELLEN.includes(q)) fail("quelle");
  const rows = q.art === "ausschuss" ? [...String(html).matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(m => m[0]) : [String(html)];
  const docs = [];
  for (const row of rows) for (const m of row.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = new URL(m[1].replace(/&amp;/g, "&"), PREFIX).href;
    if (!amtlich(url) || !/^\/resource\/blob\/\d+\/[^/]+\.(?:pdf|ics)$/i.test(new URL(url).pathname)) continue;
    if (q.art === "kalender" && !url.endsWith(".ics") || q.art !== "kalender" && !url.endsWith(".pdf")) continue;
    if (q.art === "plenum" && !url.endsWith("/Tagesordnung-komplett.pdf")) continue;
    const label = plain(m[2]);
    const date = plain(row.match(/<td\b[^>]*>([\s\S]*?)<\/td>/i)?.[1]);
    const number = /\b(\d+)\.\s*Sitzung/.exec(label)?.[1] || null;
    const revision = /\b(\d+)\.\s*(?:Ergänzungs|Änderungs)/.exec(label)?.[1];
    const meetingDay = datum(new RegExp(`(?:dem|den)\\s+(${datePattern})`).exec(label)?.[1] || "");
    docs.push({ url, label, listedDay: datum(date), listedMeeting: number, meetingDay,
      revision: revision ? +revision : 0,
      visibility: /nicht[\s-]*öffentlich/i.test(label) ? "nichtoeffentlich"
        : /teilweise\s*öffentlich/i.test(label) ? "unbekannt" : /öffentlich/i.test(label) ? "oeffentlich" : "unbekannt" });
  }
  const unique = [...new Map(docs.map(d => [d.url, d])).values()];
  if (!unique.length) fail("dokumentliste-leer");
  return unique;
}
function zeit(date, h, m = "0") {
  if (!day(date) || +h > 23 || +m > 59) return null;
  const [jahr, monat, tag] = date.split("-").map(Number);
  const z = require("./kalender/zeitzonen").wanduhrZuUtc({ jahr, monat, tag, stunde: +h, minute: +m, sekunde: 0 }, "Europe/Berlin");
  if (z.hinweis) return null;
  return new Date(z.utcMs).toISOString();
}
function sitzungen(text, art) {
  const pattern = art === "plenum" ? /(\d+)\.\s*Sitzung des Deutschen Bundestages/g : /(?:der|Die)\s+(\d+)\.\s*Sitzung/g;
  const matches = [...text.matchAll(pattern)].filter(m => art !== "plenum" || /^\s+am\s/.test(text.slice(m.index + m[0].length)));
  return matches.map((m, i) => {
    const block = text.slice(m.index, Math.min(matches[i + 1]?.index ?? text.length, m.index + 1400));
    const d = new RegExp(`(?:dem|den)\\s+(${datePattern})\\s*,\\s*(\\d{1,2})(?:[.:](\\d{2}))?\\s*Uhr`).exec(block);
    return { number: m[1], day: d ? datum(d[1]) : null,
      startsAt: d ? zeit(datum(d[1]), d[2], d[3]) : null, timezone: "Europe/Berlin" };
  });
}
function tagesordnung(q, link, bytes, pages) {
  if (!QUELLEN.includes(q) || !amtlich(link?.url) || !Array.isArray(pages) || !pages.length
    || pages.some(p => typeof p !== "string") || pages.join("\n").length > 160000 || !Buffer.isBuffer(bytes)) fail("pdf-eingabe");
  const text = pages.join("\n\f\n"), header = text.slice(0, 2400);
  const publishedDay = datum(new RegExp(`(?:Berlin,\\s*den|Stand:)\\s*(${datePattern})`).exec(header)?.[1] || "");
  const meetings = sitzungen(header, q.art), conflicts = [];
  if (!publishedDay) conflicts.push("publikationstag-unbekannt");
  if (!meetings.length || meetings.some(m => !m.day || !m.startsAt)) conflicts.push("sitzung-nicht-eindeutig-gelesen");
  if (q.art === "ausschuss" && link.listedMeeting && meetings[0]?.number !== link.listedMeeting) conflicts.push("sitzungsnummer-widerspruch");
  if (link.listedDay && publishedDay && link.listedDay !== publishedDay) conflicts.push("publikationstag-widerspruch");
  if (link.meetingDay && meetings[0]?.day !== link.meetingDay) conflicts.push("sitzungstag-widerspruch");
  const revision = /\b(\d+)\.\s*(?:Ergänzungs|Änderungs)mitteilung/.exec(header);
  const revisionNumber = revision ? +revision[1] : 0;
  if (revisionNumber !== link.revision) conflicts.push("fassungsnummer-widerspruch");
  const markers = [...text.matchAll(/(?:Tagesordnungspunkt\s+(\d+[a-z]?)|Einziger Tagesordnungspunkt)/g)];
  const tops = markers.map((m, i) => {
    const block = text.slice(m.index + m[0].length, markers[i + 1]?.index ?? text.length);
    const references = [...new Set([...block.matchAll(/\b(\d{1,2}\/\d{1,7})\b/g)].map(x => x[1]))];
    // Nur ausdruecklich bezeichnete Fristen; Tagesdatum bleibt ein Tag ohne Uhrzeit.
    const deadlines = [...block.matchAll(new RegExp(`(Voten angefordert für den:|Votenfrist:|Frist für die Abgabe der Voten:|Stellungnahmen bis:)\\s*(${datePattern})(?:\\s*,\\s*(\\d{1,2})[.:](\\d{2})\\s*Uhr)?`, "g"))]
      .map(d => ({ kind: d[1], day: datum(d[2]), at: d[3] ? zeit(datum(d[2]), d[3], d[4]) : null,
        timezone: d[3] ? "Europe/Berlin" : null })).filter(d => d.day);
    return { number: m[1] || "einzig", references, deadlines, textHash: hash(block),
      // Keine Volltextablage und keine persoenlichen Kontaktdaten.
      subject: betreff(block), subjectStatus: "originalfragment" };
  });
  const references = [...new Set([...text.matchAll(/\b(\d{1,2}\/\d{1,7})\b/g)].map(x => x[1]))];
  // Römische Plenar-TOPs/Unterpunkte werden als Originalzeilen erhalten; keine
  // automatische Zuordnung einer gemeinsamen Beratung zu einem einzelnen Tag.
  const plenumTops = q.art === "plenum" ? [...text.matchAll(/(?:^|\n)[^\n]*?\b([IVX]+\.(?:\d+)?(?:\s*[a-z]\))?)[ \t]+([^\n]+)/g)]
    .map(m => ({ number: m[1].trim(), subject: m[2].trim().slice(0, 600) })) : [];
  return { url: link.url, byteHash: hash(bytes), textHash: hash(text), publishedDay,
    listedMeeting: link.listedMeeting, revision: revisionNumber,
    changeKind: /wird wie folgt neu gefasst\s*:/.test(header) ? "neufassung"
      : revision ? (/wird\s+um\s+folgende[nr]?\s+Tagesordnungspunkt(?:e)?\s+ergänzt/.test(header)
        && !/abgesetzt|entfällt|ersetzt|gestrichen/.test(header) ? "ergaenzung" : "aenderung") : "grundfassung",
    visibility: link.visibility, meetings, tops, plenumTops, references, conflicts,
    parser: "pdfjs-dist-6.5.438/bundestag-termine-v1", fullTextStored: false };
}
function kalender(q, link, bytes) {
  if (!QUELLEN.includes(q) || q.art !== "kalender" || !Buffer.isBuffer(bytes) || bytes.length > MAX_BYTES) fail("ics-eingabe");
  const ICAL = require("ical.js"), root = new ICAL.Component(ICAL.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  if (root.name !== "vcalendar") fail("ics-format");
  const components = root.getAllSubcomponents("vevent");
  if (!components.length || components.length > 100) fail("ics-anzahl");
  const events = components.map(c => {
    // Oeffentliche Sitzungswochen sind keine individuellen Einladungen.
    if (["attendee", "organizer", "rrule", "rdate", "recurrence-id", "attach", "url"].some(p => c.hasProperty(p)) || c.getAllSubcomponents().length) fail("ics-fremdstruktur");
    for (const key of ["uid", "dtstart", "dtend", "summary"]) if (c.getAllProperties(key).length !== 1) fail("ics-pflichtfeld");
    const start = c.getFirstPropertyValue("dtstart"), end = c.getFirstPropertyValue("dtend");
    if (!start?.isDate || !end?.isDate || !day(start.toString()) || !day(end.toString()) || start.toString() >= end.toString()) fail("ics-zeit");
    if (c.getFirstPropertyValue("summary") !== "Sitzungswoche Deutscher Bundestag") fail("ics-thema");
    return { uid: String(c.getFirstPropertyValue("uid")), startDay: start.toString(), endDayExclusive: end.toString(),
      allDay: true, kind: "sitzungswoche", status: c.getFirstPropertyValue("status") === "CANCELLED" ? "abgesagt" : "geplant" };
  });
  if (new Set(events.map(e => e.uid)).size !== events.length) fail("ics-uid-mehrdeutig");
  return { url: link.url, byteHash: hash(bytes), publishedDay: null, events, fullTextStored: false };
}
function fasseZusammen(documents) {
  const groups = new Map();
  for (const doc of documents) {
    // Eine Plenartagesordnung kann mehrere getrennte Sitzungen belegen.
    // Deren Beginn bleibt an genau die jeweilige Sitzung gebunden.
    for (const meeting of doc.meetings?.length ? doc.meetings : [null]) {
      const key = meeting?.day ? `${doc.listedMeeting || meeting.number}|${meeting.day}` : doc.url;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ doc, meeting });
    }
  }
  return [...groups.entries()].map(([key, entries]) => {
    const rows = entries.slice().sort((a, b) => a.doc.revision - b.doc.revision || String(a.doc.publishedDay).localeCompare(String(b.doc.publishedDay)));
    const ordered = rows.map(r => r.doc);
    const conflicts = [...new Set(ordered.flatMap(d => d.conflicts))];
    const revisions = ordered.map(d => d.revision), max = Math.max(...revisions);
    if (new Set(revisions).size !== revisions.length) conflicts.push("mehrere-fassungen-gleichen-ranges");
    if (!revisions.includes(0) || Array.from({ length: max + 1 }, (_, i) => i).some(n => !revisions.includes(n))) conflicts.push("fassungskette-unvollstaendig");
    const dates = ordered.map(d => d.publishedDay).filter(Boolean);
    if (dates.some((d, i) => i && d < dates[i - 1])) conflicts.push("fassungsdatum-rangkonflikt");
    const last = ordered.at(-1), resolved = !conflicts.length;
    const reset = ordered.findLastIndex(d => ["grundfassung","neufassung"].includes(d.changeKind));
    const current = ordered.slice(Math.max(0,reset));
    const needsReview = current.some(d => d.changeKind === "aenderung");
    // Gemeinsame TOPs eines Mehrsitzungsdokuments bleiben am Original;
    // ohne eigene Zuordnung darf daraus kein TOP je Sitzung entstehen.
    const versions = ordered.flatMap((d,i) => (d.meetings.length <= 1 ? d.tops : []).map(t => ({ ...t, sourceUrl: d.url,
      byteHash: d.byteHash, revision: d.revision, superseded: i < reset })));
    return { key, documents: ordered.map(d => ({ url: d.url, byteHash: d.byteHash, revision: d.revision })),
      conflicts, startsAt: resolved ? rows.at(-1).meeting?.startsAt || null : null,
      // Nur ein ausdrueckliches "neu gefasst" ersetzt die alte Tagesordnung.
      // Ergänzungen erhalten frühere TOPs. Unklare Änderungen/Nummernkonflikte
      // haben ausschliesslich historische Belege, keine aktuelle TOP-Liste.
      tops: resolved && !needsReview ? versions.filter(t => !t.superseded) : [], topVersions: versions,
      state: resolved ? (needsReview ? "aenderung-pruefen" : "geplant") : "ungeklaert",
      visibility: new Set(ordered.map(d => d.visibility)).size === 1 ? last.visibility : "unbekannt" };
  });
}
function baueStand(q, documents, retrievedAt, listHash) {
  if (!QUELLEN.includes(q) || !Array.isArray(documents) || !documents.length || documents.length > MAX_DOCS
    || !Number.isFinite(Date.parse(retrievedAt)) || !/^[a-f0-9]{64}$/.test(listHash)) fail("stand");
  documents.forEach(d => pruefeDokument(q, d));
  const base = { version: 1, sourceId: q.id, sourceUrl: q.url, key: q.key, art: q.art,
    publisher: "Deutscher Bundestag", listHash, documents,
    meetings: q.art === "kalender" ? [] : fasseZusammen(documents),
    // Keine Vollstaendigkeitsbehauptung aus einem begrenzten Listenfenster.
    coverage: "partial", plannedIsDecision: false, personalAttendanceRequired: false };
  const standHash = hash(base), time = new Date(retrievedAt).toISOString();
  return { ...base, standHash, retrievedAt: time, belegHash: hash([standHash, time]) };
}
function pruefeDokument(q, d) {
  const keys = q.art === "kalender" ? ["url", "byteHash", "publishedDay", "events", "fullTextStored"]
    : ["url", "byteHash", "textHash", "publishedDay", "listedMeeting", "revision", "changeKind", "visibility",
      "meetings", "tops", "plenumTops", "references", "conflicts", "parser", "fullTextStored"];
  const exact = (value, names) => value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join() === names.slice().sort().join();
  const sha = s => /^[a-f0-9]{64}$/.test(s || ""), str = (s,n) => typeof s === "string" && s.length <= n;
  if (!exact(d, keys) || !amtlich(d.url) || !/^\/resource\/blob\/\d+\/[^/]+\.(pdf|ics)$/.test(new URL(d.url).pathname)
    || !sha(d.byteHash) || d.fullTextStored !== false || d.publishedDay !== null && !day(d.publishedDay)) fail("dokument-bindung");
  if (q.art === "kalender") {
    if (!d.url.endsWith(".ics") || d.publishedDay !== null || !Array.isArray(d.events) || d.events.length > 100) fail("dokument-bindung");
    for (const e of d.events) if (!exact(e, ["uid","startDay","endDayExclusive","allDay","kind","status"])
      || !str(e.uid,300) || !e.uid || !day(e.startDay) || !day(e.endDayExclusive) || e.startDay >= e.endDayExclusive
      || e.allDay !== true || e.kind !== "sitzungswoche" || !["geplant","abgesagt"].includes(e.status)) fail("dokument-bindung");
    return;
  }
  if (!d.url.endsWith(".pdf") || !sha(d.textHash) || !Number.isInteger(d.revision) || d.revision < 0 || d.revision > 30
    || !["grundfassung","ergaenzung","aenderung","neufassung"].includes(d.changeKind) || !["oeffentlich","nichtoeffentlich","unbekannt"].includes(d.visibility)
    || !Array.isArray(d.meetings) || d.meetings.length > 12 || !Array.isArray(d.tops) || d.tops.length > 100
    || !Array.isArray(d.plenumTops) || d.plenumTops.length > 200 || !Array.isArray(d.references) || d.references.length > 300
    || d.references.some(r => !/^\d{1,2}\/\d{1,7}$/.test(r)) || !Array.isArray(d.conflicts) || d.conflicts.length > 20
    || d.conflicts.some(c => !/^[a-z-]{1,80}$/.test(c)) || d.parser !== "pdfjs-dist-6.5.438/bundestag-termine-v1") fail("dokument-bindung");
  for (const m of d.meetings) if (!exact(m,["number","day","startsAt","timezone"]) || !/^\d{1,4}$/.test(m.number)
    || m.day !== null && !day(m.day) || m.startsAt !== null && !Number.isFinite(Date.parse(m.startsAt)) || m.timezone !== "Europe/Berlin") fail("dokument-bindung");
  for (const t of d.tops) {
    if (!exact(t,["number","references","deadlines","textHash","subject","subjectStatus"]) || !/^(?:\d+[a-z]?|einzig)$/.test(t.number)
      || !sha(t.textHash) || t.subject !== null && !str(t.subject,600) || t.subjectStatus !== "originalfragment"
      || !Array.isArray(t.references) || t.references.length > 100 || t.references.some(r => !/^\d{1,2}\/\d{1,7}$/.test(r))
      || !Array.isArray(t.deadlines) || t.deadlines.length > 30) fail("dokument-bindung");
    for (const f of t.deadlines) if (!exact(f,["kind","day","at","timezone"]) || !["Voten angefordert für den:","Votenfrist:","Frist für die Abgabe der Voten:","Stellungnahmen bis:"].includes(f.kind)
      || !day(f.day) || f.at !== null && !Number.isFinite(Date.parse(f.at)) || f.timezone !== (f.at ? "Europe/Berlin" : null)) fail("dokument-bindung");
  }
  for (const t of d.plenumTops) if (!exact(t,["number","subject"]) || !str(t.number,40) || !str(t.subject,600)) fail("dokument-bindung");
}
function leseStand(stand) {
  const q = QUELLEN.find(q => q.id === stand?.sourceId);
  if (!q || !same(stand, baueStand(q, stand.documents, stand.retrievedAt, stand.listHash))) fail("stand-bindung");
  return stand;
}
function speicher({ request, storeId, now = Date.now, deadlineMs = Infinity, signal }) {
  if (typeof request !== "function" || !/^[a-zA-Z0-9_-]{1,100}$/.test(storeId || "") || storeId.includes("-p-")) fail("speicher-konfiguration");
  const check = () => { signal?.throwIfAborted(); if (now() >= deadlineMs) fail("zeitbudget"); };
  const id = h => { if (!/^[a-f0-9]{64}$/.test(h || "")) fail("belegkennung"); return storeId + "-bt-terminstand-" + h; };
  async function lesen(belegHash) {
    check();
    const rows = await request(`/rest/v1/helmut_store?id=eq.${id(belegHash)}&select=id,data`);
    check();
    if (!Array.isArray(rows) || rows.length > 1) fail("speicher-leseantwort");
    if (!rows.length) return null;
    const s = leseStand(rows[0].data);
    if (rows[0].id !== id(belegHash) || s.belegHash !== belegHash) fail("speicher-bindung");
    return s;
  }
  return { lesen, async sichern(stand) {
    leseStand(stand);
    if (Buffer.byteLength(JSON.stringify(stand)) > 512 * 1024) fail("standlimit");
    const before = await lesen(stand.belegHash);
    if (before && !same(before, stand)) fail("speicher-konflikt");
    if (!before) {
      check();
      try { await request("/rest/v1/helmut_store?select=id", { method: "POST",
        headers: { Prefer: "return=representation" }, body: JSON.stringify({ id: id(stand.belegHash), data: stand }) }); }
      catch { /* Verlorene Schreibantwort nur durch exakten Readback aufloesen. */ }
    }
    const after = await lesen(stand.belegHash);
    if (!after || !same(after, stand)) fail("persistenz-unbestaetigt");
    return { ok: true, standHash: stand.standHash, belegHash: stand.belegHash };
  } };
}
function codeNutzungsbeleg(sourceId) {
  // Derselbe bestehende Code-Seed-Weg wie Destatis/iRights. Diese fuenf neuen
  // Quellen stehen dort derzeit NICHT als rechtlich freigegeben: Default AUS.
  const sources = require("./quellenarchitektur/seeds/fach-parteiquellen").ZUSAETZLICHE_QUELLEN;
  const matches = sources.filter(s => s.id === sourceId);
  return matches.length === 1 ? matches[0] : null;
}
function freigabe(q, katalog, source = codeNutzungsbeleg(q?.id)) {
  const s = quelle(q), paths = katalog?.retrievalPaths;
  if (!s || !Array.isArray(paths)) return false;
  const matches = paths.filter(p => p.id === s.retrievalPathId);
  if (matches.length !== 1) return false;
  const p = matches[0], policy = source?.usagePolicy;
  return p.url === s.url && p.method === s.crawlMethod && p.status === "healthy"
    && p.legacy_source_id === s.id && p.publisher_id === "publisher-bundestag.de"
    && p.activation_mode === "always_on" && source?.id === s.id && source.url === s.url
    && source.preparedOnly !== true && source.rightsReviewRequired === false
    && policy?.commercialUseApproved === true && policy.scope === "structured_parliamentary_facts"
    && policy.fullTextAllowed === false && policy.imagesAllowed === false && policy.aiTrainingAllowed === false
    && Array.isArray(policy.evidenceUrls) && policy.evidenceUrls.length > 0
    && policy.evidenceUrls.every(url => typeof url === "string" && /^https:\/\//.test(url));
}
async function aufnahme(qInput, { katalog, fetchUrl, pdfText = require("./quellen-bundestag-termine-pdf").lesen,
  save, reserveOriginal, rightsForSource = codeNutzungsbeleg, now = Date.now, deadlineMs, signal } = {}) {
  const q = quelle(qInput);
  if (!q) fail("quelle");
  if (!freigabe(qInput, katalog, rightsForSource(qInput.id))) return { ok: false, uebersprungen: true, grund: "bundestag-termine-rechte-oder-aktivierung-offen" };
  if (typeof save !== "function" || typeof fetchUrl !== "function" || typeof reserveOriginal !== "function") fail("adapter-fehlt");
  const check = () => { signal?.throwIfAborted(); if (!Number.isFinite(deadlineMs) || now() >= deadlineMs) fail("zeitbudget"); };
  const get = async (url) => {
    check(); if (!amtlich(url)) fail("url");
    const result = await fetchUrl(url, 0, { allowedHost: "bundestag.de", abbruchSignal: signal,
      deadlineMs, now, meldeStatus: true, binary: true, maxBytes: MAX_BYTES });
    check();
    if (result?.status !== 200 || result.finalUrl !== url) fail("antwort");
    const bytes = result.bytes;
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BYTES) fail("antwortlimit");
    return bytes;
  };
  const landing = await get(q.url);
  const list = q.art === "ausschuss" ? await get(endpoint(q, landing.toString("utf8"))) : landing;
  const links = dokumentLinks(q, list.toString("utf8"));
  // Neueste Sitzung samt allen im Fenster sichtbaren Ergänzungen/Änderungen.
  // Niemals acht beliebige Einzeldateien als vollstaendige Kette ausgeben.
  const latest = links.slice().sort((a,b) => String(b.meetingDay || "").localeCompare(String(a.meetingDay || ""))
    || Number(b.listedMeeting || 0) - Number(a.listedMeeting || 0))[0];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date(now()));
  const upcoming = links.filter(l => l.meetingDay && l.meetingDay >= today);
  const selected = q.art === "ausschuss" ? (upcoming.length ? upcoming : links.filter(l => l.listedMeeting === latest.listedMeeting)) : links;
  if (selected.length > MAX_DOCS) fail("dokumentlimit");
  const documents = [];
  for (const link of selected) {
    check();
    const quota = await reserveOriginal();
    check();
    if (quota?.erlaubt !== true || quota.geprueft !== true) return { ok: false, zurueckgestellt: true,
      grund: "bundestag-termine-originalquote-nicht-freigegeben", geleseneDokumente: documents.length };
    const bytes = await get(link.url);
    documents.push(q.art === "kalender" ? kalender(q, link, bytes)
      : tagesordnung(q, link, bytes, await pdfText(bytes, { signal })));
  }
  check();
  const stand = baueStand(q, documents, new Date(now()).toISOString(), hash(list));
  const result = await save(stand, { now, deadlineMs, signal });
  check();
  if (result?.ok !== true || result.standHash !== stand.standHash || result.belegHash !== stand.belegHash) fail("persistenz-unbestaetigt");
  return { ok: true, standHash: stand.standHash, belegHash: stand.belegHash, documents: documents.length, coverage: "partial",
    conflicts: stand.meetings.flatMap(m => m.conflicts) };
}
function betreff(block) {
  // Ein Fragment bleibt ausdrücklich Fragment, niemals ein vollständig gelesener
  // Betreff. Spalten mit Federführung/Mitberatung gehören nicht in den Betreff.
  let lines = block.split(/\n\s*b\)/)[0].split("\n").filter(l => !l.startsWith("\t")).map(l => l.split("\t")[0].trim());
  const end = lines.findIndex(l => /^(?:BT-Drucksache|Hierzu|Voten|Selbstbefassung|Frist für|\d+\. Wahlperiode)/.test(l));
  if (end >= 0) lines = lines.slice(0,end);
  const faction = lines.findIndex(l => /Fraktion/.test(l));
  if (faction >= 0) lines = lines.slice(faction+1);
  else { const type = lines.findIndex(l => /^(?:[a-z]\)\s*)?(?:Gesetzentwurf der|Unterrichtung durch)/.test(l));
    if (type >= 0) lines = lines.slice(type+1); }
  const paragraphs = lines.join("\n").trim().split(/\n\s*\n/).map(p => p.replace(/\s+/g," ").trim()).filter(Boolean);
  const result = paragraphs.find(p => !/^(?:In Anwesenheit|.*Vorsitzender|.*MdB)/.test(p)) || null;
  return result && result.length <= 600 ? result : null;
}
module.exports = { QUELLEN, MAX_DOCS, MAX_BYTES, hash, quelle, datum, endpoint, dokumentLinks, tagesordnung,
  kalender, fasseZusammen, baueStand, leseStand, speicher, codeNutzungsbeleg, freigabe, aufnahme };
