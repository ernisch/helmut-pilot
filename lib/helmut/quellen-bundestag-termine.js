"use strict";

// Amtliche parlamentarische Quellen; keine persoenlichen Kalender/Einladungen.
// Reine Parser + begrenzter Aufnahmeadapter im bestehenden Quellenauftrag.
// Ohne aktuellen, expliziten Katalog-/Rechtebeleg KEIN Netz und KEIN Schreiben.
const crypto = require("node:crypto"), { isDeepStrictEqual: same } = require("node:util");
const PREFIX = "https://www.bundestag.de";
const QUELLEN = Object.freeze([
  { id: "bt-termine-arbeit-soziales", key: "arbeit-soziales", art: "ausschuss",
    packageId: "pkg-arbeit-und-soziales",
    url: PREFIX + "/ausschuesse/a11_arbeit_soziales/tagesordnungen" },
  { id: "bt-termine-wirtschaft-energie", key: "wirtschaft-energie", art: "ausschuss",
    packageId: "pkg-fach-wirtschaft-energie",
    url: PREFIX + "/ausschuesse/a09_wirtschaft/wp21_a09_Tagesordnung" },
  { id: "bt-termine-digitales", key: "digitales-staatsmodernisierung", art: "ausschuss",
    packageId: "pkg-fach-digitales-staatsmodernisierung",
    url: PREFIX + "/ausschuesse/a23_digitales_staatsmodernisierung/tagesordnungen" },
  { id: "bt-termine-plenum", key: "plenum", art: "plenum",
    packageId: "pkg-bund-basis", url: PREFIX + "/parlament/plenum/tagesordnungen" },
  { id: "bt-termine-sitzungswochen", key: "sitzungswochen", art: "kalender",
    packageId: "pkg-bund-basis", url: PREFIX + "/parlament/plenum/sitzungskalender" }
].map(q => Object.freeze({ ...q, crawlMethod: "structured_download", retrievalPathId: "rp-" + q.id })));
const MONATE = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];
const MAX_DOCS = 8, MAX_BYTES = 2 * 1024 * 1024;
const STAND_VERSION = 2, PDF_PARSER = "pdfjs-dist-6.5.438/bundestag-termine-v2";
const PLENUM_TOP = /^(?:[IVX]+\.(?:\d+)?(?: [a-z]\))?)$/;
const DRUCKSACHENNUMMER = /\b([1-9]\d?)[ \t]*\/[ \t]*(\d{1,7})(?![\d/])/g;
const DRUCKSACHENPOSITION = `(?:${DRUCKSACHENNUMMER.source}|[1-9]\\d?[ \\t]*/[ \\t]*(?:…|\\.\\.\\.))`;
const DRUCKSACHENZEILE = new RegExp(
  `(?:^|[\\n(])[ \\t]*(?:BT[ -]?)?Drucksachen?[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?(${DRUCKSACHENPOSITION}`
  + `(?:[ \\t]*(?:,|und|;)[ \\t]*(?:\\n[ \\t]*)?${DRUCKSACHENPOSITION})*)`, "gi");
function drucksachen(text) {
  const refs = [...text.matchAll(DRUCKSACHENZEILE)].flatMap(([, line]) =>
    [...line.matchAll(DRUCKSACHENNUMMER)].map(([, periode, nr]) => `${periode}/${Number(nr)}`));
  return [...new Set(refs)].filter(r => !r.endsWith("/0"));
}
const PDF_CONFLICTS = ["publikationstag-unbekannt", "fassungsdatum-unbekannt", "sitzung-nicht-eindeutig-gelesen", "sitzungsnummer-widerspruch",
  "publikationstag-widerspruch", "sitzungstag-widerspruch", "fassungsnummer-widerspruch"];
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
  if (typeof iso !== "string" || !/^\d{4}-\d\d-\d\d$/.test(iso)) return null;
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
    .filter(url => {
      const base = PREFIX + "/ajax/filterlist/de" + new URL(q.url).pathname + "/";
      return amtlich(url) && url.startsWith(base) && /^\d+-\d+$/.test(url.slice(base.length));
    });
  if (new Set(values).size !== 1) fail("listen-endpoint");
  return values[0];
}
function robots(bytes) {
  const groups = [];
  let group = null;
  for (const line of bytes.toString("utf8").split(/\r?\n/)) {
    const entry = /^\s*([a-z-]+)\s*:\s*(.*?)\s*$/i.exec(line.split("#", 1)[0]);
    if (!entry) continue;
    const [, key, value] = entry;
    switch (key.toLowerCase()) {
      case "user-agent":
        if (!group || group.rules.length) {
          group = { agents: [], rules: [] };
          groups.push(group);
        }
        group.agents.push(value.toLowerCase());
        break;
      case "allow":
      case "disallow":
        if (!group || value && !value.startsWith("/")) fail("robots-format");
        group.rules.push({ allow: key.toLowerCase() === "allow", path: value });
        break;
      case "tdm-reservation":
        if (value !== "0") fail("nutzungsvorbehalt");
        break;
    }
  }
  if (!groups.length) fail("robots-format");
  const specific = groups.filter(g => g.agents.includes("helmutbot"));
  const rules = (specific.length ? specific : groups.filter(g => g.agents.includes("*"))).flatMap(g => g.rules);
  return url => {
    const path = new URL(url).pathname;
    const matching = rules.filter(r => {
      if (!r.path) return false;
      const exact = r.path.endsWith("$"), pattern = exact ? r.path.slice(0, -1) : r.path;
      const literal = pattern.split("*").map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
      return new RegExp("^" + literal + (exact ? "$" : "")).test(path);
    }).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
    if (matching[0]?.allow === false) fail("robots-gesperrt");
  };
}
function htmlOhneVorbehalt(html) {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = new Map([...tag.matchAll(/\b(name|content)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
      .map(([, k, a, b, c]) => [k.toLowerCase(), (a ?? b ?? c).trim().toLowerCase()]));
    const name = attrs.get("name"), content = attrs.get("content") || "";
    if (name === "tdm-reservation" && content !== "0"
      || ["robots", "helmutbot"].includes(name) && /\b(?:noai|notdm)\b/.test(content)) fail("nutzungsvorbehalt");
  }
  return html;
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
    docs.push({ url, listedDay: datum(date), listedMeeting: number, meetingDay,
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
  const versionDay = datum(new RegExp(`(?:Berlin,\\s*den|Stand:)\\s*(${datePattern})`).exec(header)?.[1] || "");
  const publishedDay = q.art === "ausschuss" ? link.listedDay || null : null;
  const meetings = sitzungen(header, q.art), conflicts = [];
  if (q.art === "ausschuss" && !publishedDay) conflicts.push("publikationstag-unbekannt");
  if (!versionDay) conflicts.push("fassungsdatum-unbekannt");
  if (!meetings.length || meetings.some(m => !m.day || !m.startsAt)) conflicts.push("sitzung-nicht-eindeutig-gelesen");
  if (q.art === "ausschuss" && link.listedMeeting && meetings[0]?.number !== link.listedMeeting) conflicts.push("sitzungsnummer-widerspruch");
  if (publishedDay && versionDay && publishedDay < versionDay) conflicts.push("publikationstag-widerspruch");
  if (link.meetingDay && meetings[0]?.day !== link.meetingDay) conflicts.push("sitzungstag-widerspruch");
  const revision = /\b(\d+)\.\s*(?:Ergänzungs|Änderungs)mitteilung/.exec(header);
  const revisionNumber = revision ? +revision[1] : 0;
  if (revisionNumber !== link.revision) conflicts.push("fassungsnummer-widerspruch");
  const markers = [...text.matchAll(/(?:Tagesordnungspunkt\s+(\d+[a-z]?)|Einziger Tagesordnungspunkt)/g)];
  const tops = markers.map((m, i) => {
    const block = text.slice(m.index + m[0].length, markers[i + 1]?.index ?? text.length);
    const references = drucksachen(block);
    // Nur ausdruecklich bezeichnete Fristen; Tagesdatum bleibt ein Tag ohne Uhrzeit.
    const deadlines = [...block.matchAll(new RegExp(`(Voten angefordert für den:|Votenfrist:|Frist für die Abgabe der Voten:|Stellungnahmen bis:)\\s*(${datePattern})(?:\\s*,\\s*(\\d{1,2})[.:](\\d{2})\\s*Uhr)?`, "g"))]
      .map(d => ({ kind: d[1], day: datum(d[2]), at: d[3] ? zeit(datum(d[2]), d[3], d[4]) : null,
        timezone: d[3] ? "Europe/Berlin" : null })).filter(d => d.day);
    return { number: m[1] || "einzig", references, deadlines, textHash: hash(block) };
  });
  const references = drucksachen(text);
  // Römische Plenar-TOPs/Unterpunkte werden nur als Kennungen erfasst; keine
  // automatische Zuordnung einer gemeinsamen Beratung zu einem einzelnen Tag.
  const plenumTops = q.art === "plenum" ? [...text.matchAll(/(?:^|\n)[^\n]*?\b([IVX]+\.(?:\d+)?(?:[ \t]*[a-z]\))?)[ \t]+(?=\S)/g)]
    .map(m => ({ number: m[1].replace(/[ \t]*([a-z]\))$/, " $1") })) : [];
  return { url: link.url, byteHash: hash(bytes), textHash: hash(text), publishedDay, versionDay,
    listedMeeting: link.listedMeeting, revision: revisionNumber,
    changeKind: /wird wie folgt neu gefasst\s*:/.test(header) ? "neufassung"
      : revision ? (/wird\s+um\s+folgende[nr]?\s+Tagesordnungspunkt(?:e)?\s+ergänzt/.test(header)
        && !/abgesetzt|entfällt|ersetzt|gestrichen/.test(header) ? "ergaenzung" : "aenderung") : "grundfassung",
    visibility: link.visibility, meetings, tops, plenumTops, references, conflicts,
    parser: PDF_PARSER, fullTextStored: false };
}
function kalender(q, link, bytes) {
  if (!QUELLEN.includes(q) || q.art !== "kalender" || !Buffer.isBuffer(bytes) || bytes.length > MAX_BYTES) fail("ics-eingabe");
  const ICAL = require("ical.js");
  let root;
  try { root = new ICAL.Component(ICAL.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))); }
  catch { fail("ics-format"); }
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
    const uid = c.getFirstPropertyValue("uid");
    if (typeof uid !== "string" || !uid.trim() || uid.length > 300) fail("ics-uid");
    return { uidHash: hash(uid), startDay: start.toString(), endDayExclusive: end.toString(),
      allDay: true, kind: "sitzungswoche", status: c.getFirstPropertyValue("status") === "CANCELLED" ? "abgesagt" : "geplant" };
  });
  if (new Set(events.map(e => e.uidHash)).size !== events.length) fail("ics-uid-mehrdeutig");
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
    if (["publishedDay", "versionDay"].some(key => {
      const dates = ordered.map(d => d[key]).filter(Boolean);
      return dates.some((d, i) => i && d < dates[i - 1]);
    })) conflicts.push("fassungsdatum-rangkonflikt");
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
  const base = { version: STAND_VERSION, sourceId: q.id, sourceUrl: q.url, key: q.key, art: q.art,
    publisher: "Deutscher Bundestag", listHash, documents,
    meetings: q.art === "kalender" ? [] : fasseZusammen(documents),
    // Keine Vollstaendigkeitsbehauptung aus einem begrenzten Listenfenster.
    coverage: "partial", plannedIsDecision: false, personalAttendanceRequired: false };
  const standHash = hash(base), time = new Date(retrievedAt).toISOString();
  return { ...base, standHash, retrievedAt: time, belegHash: hash([standHash, time]) };
}
function pruefeDokument(q, d) {
  const keys = q.art === "kalender" ? ["url", "byteHash", "publishedDay", "events", "fullTextStored"]
    : ["url", "byteHash", "textHash", "publishedDay", "versionDay", "listedMeeting", "revision", "changeKind", "visibility",
      "meetings", "tops", "plenumTops", "references", "conflicts", "parser", "fullTextStored"];
  const exact = (value, names) => value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join() === names.slice().sort().join();
  const sha = s => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
  const nummer = n => typeof n === "string" && /^\d{1,4}$/.test(n);
  const zeitstempel = s => typeof s === "string" && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
  if (!exact(d, keys) || !amtlich(d.url) || !/^\/resource\/blob\/\d+\/[^/]+\.(pdf|ics)$/.test(new URL(d.url).pathname)
    || !sha(d.byteHash) || d.fullTextStored !== false || d.publishedDay !== null && !day(d.publishedDay)) fail("dokument-bindung");
  if (q.art === "kalender") {
    if (!d.url.endsWith(".ics") || d.publishedDay !== null || !Array.isArray(d.events) || d.events.length > 100) fail("dokument-bindung");
    for (const e of d.events) if (!exact(e, ["uidHash","startDay","endDayExclusive","allDay","kind","status"])
      || !sha(e.uidHash) || !day(e.startDay) || !day(e.endDayExclusive) || e.startDay >= e.endDayExclusive
      || e.allDay !== true || e.kind !== "sitzungswoche" || !["geplant","abgesagt"].includes(e.status)) fail("dokument-bindung");
    return;
  }
  if (!d.url.endsWith(".pdf") || !sha(d.textHash) || d.versionDay !== null && !day(d.versionDay)
    || d.listedMeeting !== null && !nummer(d.listedMeeting)
    || !Number.isInteger(d.revision) || d.revision < 0 || d.revision > 30
    || !["grundfassung","ergaenzung","aenderung","neufassung"].includes(d.changeKind) || !["oeffentlich","nichtoeffentlich","unbekannt"].includes(d.visibility)
    || !Array.isArray(d.meetings) || d.meetings.length > 12 || !Array.isArray(d.tops) || d.tops.length > 100
    || !Array.isArray(d.plenumTops) || d.plenumTops.length > 200 || !Array.isArray(d.references) || d.references.length > 300
    || d.references.some(r => !/^\d{1,2}\/\d{1,7}$/.test(r)) || !Array.isArray(d.conflicts) || d.conflicts.length > 20
    || d.conflicts.some(c => !PDF_CONFLICTS.includes(c)) || d.parser !== PDF_PARSER) fail("dokument-bindung");
  for (const m of d.meetings) if (!exact(m,["number","day","startsAt","timezone"]) || !nummer(m.number)
    || m.day !== null && !day(m.day) || m.startsAt !== null && !zeitstempel(m.startsAt) || m.timezone !== "Europe/Berlin") fail("dokument-bindung");
  for (const t of d.tops) {
    if (!exact(t,["number","references","deadlines","textHash"]) || typeof t.number !== "string" || !/^(?:\d{1,4}[a-z]?|einzig)$/.test(t.number)
      || !sha(t.textHash)
      || !Array.isArray(t.references) || t.references.length > 100 || t.references.some(r => !/^\d{1,2}\/\d{1,7}$/.test(r))
      || !Array.isArray(t.deadlines) || t.deadlines.length > 30) fail("dokument-bindung");
    for (const f of t.deadlines) if (!exact(f,["kind","day","at","timezone"]) || !["Voten angefordert für den:","Votenfrist:","Frist für die Abgabe der Voten:","Stellungnahmen bis:"].includes(f.kind)
      || !day(f.day) || f.at !== null && !zeitstempel(f.at) || f.timezone !== (f.at ? "Europe/Berlin" : null)) fail("dokument-bindung");
  }
  for (const t of d.plenumTops) if (!exact(t,["number"]) || typeof t.number !== "string"
    || t.number.length > 40 || !PLENUM_TOP.test(t.number)) fail("dokument-bindung");
}
function leseStand(stand) {
  const q = QUELLEN.find(q => q.id === stand?.sourceId);
  if (!q || stand.version !== STAND_VERSION || !same(stand, baueStand(q, stand.documents, stand.retrievedAt, stand.listHash))) fail("stand-bindung");
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
  // Der Rechtsbeleg erzeugt keine Legacy-Quelle und keine Katalogaktivierung.
  const sources = require("./quellenarchitektur/seeds/fach-parteiquellen").BUNDESTAG_TERMINE_NUTZUNGSBELEGE;
  const matches = sources.filter(s => s.id === sourceId);
  return matches.length === 1 ? matches[0] : null;
}
function nutzungsfreigabe(q, source = codeNutzungsbeleg(q.id)) {
  const policy = source?.usagePolicy;
  return source?.id === q.id && source.url === q.url
    && source.preparedOnly !== true && source.rightsReviewRequired === false
    && policy?.commercialUseApproved === true && policy.scope === "structured_parliamentary_facts"
    && policy.fullTextAllowed === false && policy.imagesAllowed === false && policy.aiTrainingAllowed === false
    && Array.isArray(policy.evidenceUrls) && policy.evidenceUrls.length > 0
    && policy.evidenceUrls.every(url => typeof url === "string" && /^https:\/\//.test(url));
}
function freigabe(q, katalog, source = codeNutzungsbeleg(q?.id)) {
  const s = quelle(q), paths = katalog?.retrievalPaths;
  if (!s || !Array.isArray(paths) || !Array.isArray(katalog.packages) || !Array.isArray(katalog.packagePaths)) return false;
  const matches = paths.filter(p => p.id === s.retrievalPathId);
  if (matches.length !== 1) return false;
  const p = matches[0];
  return p.url === s.url && p.method === s.crawlMethod && ["needs_review", "healthy", "degraded"].includes(p.status)
    && p.legacy_source_id === s.id && p.publisher_id === "publisher-bundestag.de"
    && p.activation_mode === "auto"
    && katalog.packages.some(pkg => pkg.id === s.packageId && pkg.status === "active")
    && katalog.packagePaths.some(link => link.package_id === s.packageId && link.retrieval_path_id === p.id)
    && nutzungsfreigabe(s, source);
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
      deadlineMs, now, meldeStatus: true, binary: true, maxBytes: MAX_BYTES, bundestagFakten: true });
    check();
    if (result?.status !== 200 || result.finalUrl !== url) fail("antwort");
    const bytes = result.bytes;
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BYTES) fail("antwortlimit");
    return bytes;
  };
  const erlaubt = robots(await get(PREFIX + "/robots.txt"));
  erlaubt(q.url);
  const landing = await get(q.url);
  const landingHtml = htmlOhneVorbehalt(landing.toString("utf8"));
  let list = landing, listHtml = landingHtml;
  if (q.art === "ausschuss") {
    const listUrl = endpoint(q, landingHtml);
    erlaubt(listUrl);
    list = await get(listUrl);
    listHtml = htmlOhneVorbehalt(list.toString("utf8"));
  }
  const links = dokumentLinks(q, listHtml);
  // Neueste Sitzung samt allen im Fenster sichtbaren Ergänzungen/Änderungen.
  // Niemals acht beliebige Einzeldateien als vollstaendige Kette ausgeben.
  const latest = links.slice().sort((a,b) => String(b.meetingDay || "").localeCompare(String(a.meetingDay || ""))
    || Number(b.listedMeeting || 0) - Number(a.listedMeeting || 0))[0];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date(now()));
  const upcoming = links.filter(l => l.meetingDay && l.meetingDay >= today);
  const upcomingNumbers = new Set(upcoming.map(l => l.listedMeeting).filter(Boolean));
  const selected = q.art === "ausschuss" ? (upcoming.length
    ? links.filter(l => upcoming.includes(l) || upcomingNumbers.has(l.listedMeeting))
    : links.filter(l => l.listedMeeting === latest.listedMeeting)) : links;
  if (selected.length > MAX_DOCS) fail("dokumentlimit");
  const documents = [];
  for (const link of selected) {
    check();
    erlaubt(link.url);
    const quota = await reserveOriginal();
    check();
    if (quota?.erlaubt !== true || quota.geprueft !== true) {
      const tagesgrenze = quota?.geprueft === true && quota.grund === "arbeitslimit-tagesgrenze"
        && Number.isSafeInteger(quota.wartenMs) && quota.wartenMs >= 1000 && quota.wartenMs <= 86400000;
      return { ok: false, zurueckgestellt: true,
        grund: "bundestag-termine-originalquote-nicht-freigegeben", geleseneDokumente: documents.length,
        ...(tagesgrenze ? { langeWarten: true, bundestagAbrufpauseMs: quota.wartenMs } : {}) };
    }
    const bytes = await get(link.url);
    if (q.art === "kalender") {
      documents.push(kalender(q, link, bytes));
    } else {
      let pages;
      try { pages = await pdfText(bytes, { signal }); }
      catch { check(); fail("pdf-lesefehler"); }
      documents.push(tagesordnung(q, link, bytes, pages));
    }
  }
  check();
  const stand = baueStand(q, documents, new Date(now()).toISOString(), hash(list));
  const result = await save(stand, { now, deadlineMs, signal });
  check();
  if (result?.ok !== true || result.standHash !== stand.standHash || result.belegHash !== stand.belegHash) fail("persistenz-unbestaetigt");
  return { ok: true, standHash: stand.standHash, belegHash: stand.belegHash, documents: documents.length, coverage: "partial",
    conflicts: stand.meetings.flatMap(m => m.conflicts) };
}
module.exports = { QUELLEN, MAX_DOCS, MAX_BYTES, hash, quelle, datum, endpoint, dokumentLinks, tagesordnung,
  kalender, fasseZusammen, baueStand, leseStand, speicher, codeNutzungsbeleg, nutzungsfreigabe, freigabe, aufnahme };
