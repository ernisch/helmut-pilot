"use strict";
// Begrenzte, konservative Bindung relativer Handlungsfristen. Ein Quelldatum
// allein ist kein Fristbeleg. Keine neuen Termine aus KO Schreibzeiten ableiten.
const norm = s => String(s || "").toLocaleLowerCase("de").normalize("NFD")
  .replace(/\p{M}/gu, "").replace(/ß/g, "ss").replace(/\s+/g, " ");
const UHR = "(?:\\d{1,2}(?:[:.]\\d{2})?\\s*uhr|mittag)";
const RELATIV = new RegExp("\\b(?:" +
  "(?:heute|morgen|ubermorgen)(?:\\s+(?:bis\\s+)?(?:" + UHR + "|nachmittag|abend|vormittag|fruh))?" +
  "|bis\\s+(?:heute\\s+)?" + UHR +
  "|sofort|umgehend|diese[rmns]?\\s+(?:woche|monat)" +
  "|bis\\s+(?:ende|mitte)\\s+(?:(?:der|dieser|nachster|kommender)\\s+)?woche" +
  "|bis\\s+(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)" +
  "|bis\\s+(?:zum\\s+)?(?:monats|wochen|jahres)ende" +
  "|bis\\s+(?:ende|mitte)\\s+(?:(?:des|dieses|kommenden|nachsten)\\s+)?(?:monats?|jahres?)" +
  "|bis\\s+ende\\s+(?:(?:des|dieses)\\s+)?(?:arbeits)?tages?" +
  "|(?:nachste|kommende)\\s+woche(?:\\s+mitte)?" +
  "|(?:bis\\s+)?(?:\\d+|ein(?:e[nmr]?)?|zwei|drei|vier|funf|sechs|sieben|acht|neun|zehn)\\s+(?:stunden?|werktage[n]?|tage[n]?|wochen?)" +
  "|(?:in|innerhalb(?:\\s+von)?|binnen)\\s+[\\p{L}\\d]+\\s+(?:tagen?|wochen?|monaten?)" +
  ")\\b", "gu");
function tag(date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone:"Europe/Berlin", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(date);
  return ["year","month","day"].map(k => parts.find(p => p.type === k).value).join("-");
}
function verschiebe(day, offset) { return new Date(Date.parse(day + "T12:00:00Z") + offset * 86400000).toISOString().slice(0,10); }
function minute(text) {
  if (/\bmittag\b/u.test(text)) return 720;
  const m = text.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*uhr\b/u);
  if (!m) return null;
  return Number(m[1]) <= 23 && Number(m[2] || 0) <= 59 ? Number(m[1]) * 60 + Number(m[2] || 0) : -1;
}
function relativ(text, anchor, source = false) {
  return [...text.matchAll(RELATIV)].filter(m => !(source && /^bis\s+(?:\d|mittag)/u.test(m[0])
    && /\b(?:\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})\b/u.test(text))).map(m => {
    const value = m[0], day = value.match(/\b(heute|morgen|ubermorgen)\b/u);
    if (day || /^bis\s+(?:\d|mittag)/u.test(value)) {
      const offset = day?.[1] === "ubermorgen" ? 2 : day?.[1] === "morgen" ? 1 : 0;
      return { day:verschiebe(anchor,offset), minute:minute(value), part:value.match(/\b(nachmittag|abend|vormittag|fruh)\b/u)?.[1] || null };
    }
    // Nicht sicher aufloesbare Wochen-/Monatsphrasen nur wortgleich mit
    // demselben Quelltag erhalten. Keine angenommene Wochenend- oder Tagesfrist.
    return { literal:value, anchor };
  });
}
function absolut(text, zeitbeleg = false) {
  const result = [];
  for (const m of text.matchAll(/\b(?:(\d{1,2})\.(\d{1,2})\.(\d{4})|(\d{4})-(\d{2})-(\d{2}))(?=\b|t\d)/giu)) {
    const day = m[4] ? `${m[4]}-${m[5]}-${m[6]}` : `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
    const parsed = Date.parse(day + "T12:00:00Z");
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0,10) !== day) continue;
    const around = text.slice(Math.max(0,m.index - 90),m.index + m[0].length + 90);
    if (!(zeitbeleg ? /\b(?:frist|abgabefrist|einreichungsfrist|antragsfrist|abgabe|einzureichen|einreichen|abgeben|endet|fallig)\b/u
      : /\b(?:frist|abgabefrist|einreichungsfrist|antragsfrist|abgabe|einzureichen|einreichen|abgeben|endet|fallig|bis)\b/u).test(norm(around))) continue;
    const following = text.slice(m.index + m[0].length);
    const clock = following.match(new RegExp("^\\s*(?:(?:um|bis)\\s+)?(" + UHR + ")\\b", "u"));
    result.push({ day, minute:clock ? minute(clock[0]) : null, part:null, ...(zeitbeleg ? { following } : {}) });
  }
  return result;
}
function belegt(texte, docs, now) {
  if (!texte.some(t => typeof t === "string" && [...norm(t).matchAll(RELATIV)].length)) return true;
  const anchor = tag(now);
  // Feldgrenzen erhalten: ein morgen in einem Nachbarfeld verschiebt keine Uhrzeit.
  const claims = texte.filter(t => typeof t === "string").flatMap(t => relativ(norm(t),anchor));
  if (!claims.length) return true; // Keine relative Frist in diesem Feld.
  const evidence = docs.filter(d => Number.isFinite(Date.parse(d?.published_at || "")) && Date.parse(d.published_at) <= now.getTime())
    .filter(d => !/\b(?:nicht|kein(?:e[nmrs]?)?|abgesagt|entfallt|aufgehoben|verschoben|utc|gmt|mez|mesz|cet|cest)\b/u.test(norm([d.title,d.summary].filter(Boolean).join(" "))))
    .flatMap(d => [d.title,d.summary].filter(t => typeof t === "string").flatMap(t => {
      const text = norm(t);
      // Keine positive Frist aus einer Verneinung, Absage oder einer hier nicht
      // umgerechneten fremden Zeitzone ableiten. Unsichere Formate bleiben gesperrt.
      return [...relativ(text,tag(new Date(d.published_at)),true),...absolut(text)];
    }));
  return claims.every(c => evidence.some(e => c.literal
    ? e.literal === c.literal && e.anchor === c.anchor
    : e.day === c.day && (c.minute === null || (c.minute >= 0 && e.minute === c.minute)) && (c.part === null || e.part === c.part)));
}

const BERLIN_OFFSET = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", timeZoneName: "longOffset" });
const ZONEN = { UTC: "Z", GMT: "Z", MEZ: "+01:00", CET: "+01:00", MESZ: "+02:00", CEST: "+02:00" };
function berlinOffset(ms) {
  return BERLIN_OFFSET.formatToParts(ms).find(p => p.type === "timeZoneName").value.slice(3);
}
function zeitpunkt(day, wall, zone) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/u.test(wall)) return NaN;
  const local = day + "T" + wall;
  if (zone) return Date.parse(local + zone);
  const base = Date.parse(local + "Z");
  const offsets = new Set([-864e5, 0, 864e5].map(delta => berlinOffset(base + delta)));
  // Nur eindeutige und tatsächlich existierende Berliner Ortszeiten belegen.
  const kandidaten = [];
  for (const offset of offsets) {
    const ms = Date.parse(local + offset);
    if (berlinOffset(ms) === offset) kandidaten.push(ms);
  }
  return kandidaten.length === 1 ? kandidaten[0] : NaN;
}
function ablauf(fund, text) {
  const rest = fund.following;
  const zeitangabe = /(?:\b(?:Uhr|Mittag|Mitternacht)\b|\d{1,2}:\d{2}|\bum\s+\d)/iu;
  const weitereZeitangabe = danach => zeitangabe.test(text.slice(0, text.length - rest.length) + danach);
  // Übliche deutsche Satzanschlüsse sind keine Zonenangaben. Eine unbekannte
  // Zonenabkürzung bleibt auch in Kleinschreibung unbekannt.
  const unbekannteZone = /^\s*\(?\s*(?!(?:am|an|auf|aus|bei|beim|das|dem|den|der|des|die|durch|endet|für|im|in|kann|mit|muss|nach|oder|sind|statt|sowie|und|vom|von|vor|wird|zu|zum|zur)(?!\p{L}))(?:[a-z]{2,6}(?!\p{L})|[\p{L}_]+\/[\p{L}_]+|[+-]\d|[ap]\.?m\.?\b)/iu;
  const alleinstehenderBezeichner = /^\s*\(?\s*[a-z]{2,6}\s*(?:[),.;!?]|$)/iu;
  const mehrdeutig = danach => unbekannteZone.test(danach)
    || alleinstehenderBezeichner.test(danach) || weitereZeitangabe(danach);
  const iso = /^T(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)(Z|[+-]\d{2}:\d{2})(?![\p{L}\d:])/iu.exec(rest);
  if (iso) return mehrdeutig(rest.slice(iso[0].length))
    ? NaN : zeitpunkt(fund.day, iso[1], iso[2].toUpperCase());
  const uhr = /^[\s,]*(?:(?:um|bis)\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*Uhr\b/iu.exec(rest);
  const hhmm = /^[\s,]*(?:um\s+)?(\d{1,2}):(\d{2})\b/u.exec(rest);
  const stunde = /^[\s,]*um\s+(\d{1,2})(?=[\s,.;]|$)/iu.exec(rest);
  const mittag = /^[\s,]*(?:(?:um|bis)\s+)?Mittag\b/iu.exec(rest);
  const clock = uhr || hhmm || stunde || mittag;
  if (!clock) return zeitangabe.test(text) || /\b(?:UTC|MEZ|MESZ|CET|CEST)\b/iu.test(text)
    || /^T\d/iu.test(rest) ? NaN : null;
  const suffix = rest.slice(clock[0].length);
  const zone = /^\s*\(?\s*(UTC|GMT|MEZ|MESZ|CET|CEST|[+-]\d{2}:\d{2})(?![\p{L}\d])/iu.exec(suffix);
  const berlin = /^\s*\(?\s*(?:Berliner|deutscher) (?:Orts)?Zeit\b/iu.exec(suffix);
  const bezeichner = zone || berlin;
  const danach = bezeichner ? suffix.slice(bezeichner[0].length).replace(/^\s*\)/u, "") : suffix;
  if (mehrdeutig(danach)) return NaN;
  const wall = mittag ? "12:00" : clock[1].padStart(2, "0") + ":" + (clock[2] || "00");
  return zeitpunkt(fund.day, wall, zone && (ZONEN[zone[1].toUpperCase()] || zone[1]));
}
function schlussfrist(docs, now, erwarteterTag) {
  const moeglich = new Map();
  for (const doc of docs) {
    if (!Number.isFinite(Date.parse(doc.published_at)) || Date.parse(doc.published_at) > now.getTime()) continue;
    for (const text of [doc.title, doc.summary].filter(t => typeof t === "string" && t)) {
      if (/\b(?:nicht|kein(?:e[nmrs]?)?|abgesagt|entfallt|aufgehoben|verschoben)\b/u.test(norm(text))) continue;
      for (const fund of absolut(text, true)) {
        const ms = ablauf(fund, text);
        const tagBerlin = Number.isFinite(ms) ? tag(new Date(ms)) : fund.day;
        if (fund.day !== erwarteterTag && tagBerlin !== erwarteterTag) continue;
        if (Number.isNaN(ms)) return null;
        moeglich.set(ms, { tag: tagBerlin, ms });
      }
    }
  }
  // Ein belegter Zeitpunkt präzisiert eine Datumsangabe. Zwei nicht
  // übereinstimmende Schlusszeiten belegen keine noch nutzbare Frist.
  if (moeglich.size > 1) moeglich.delete(null);
  return moeglich.size === 1 ? moeglich.values().next().value : null;
}
function fristAnzeige(frist) {
  if (frist.ms === null) return frist.tag;
  const uhr = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin",
    hourCycle: "h23", hour: "2-digit", minute: "2-digit",
    ...(frist.ms % 60000 ? { second: "2-digit" } : {}) }).format(frist.ms);
  return `${frist.tag} um ${uhr} Uhr (Berliner Zeit)`;
}
module.exports = { belegt, schlussfrist, fristAnzeige };
