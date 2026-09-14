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
function absolut(text) {
  const result = [];
  for (const m of text.matchAll(/\b(?:(\d{1,2})\.(\d{1,2})\.(\d{4})|(\d{4})-(\d{2})-(\d{2}))\b/gu)) {
    const day = m[4] ? `${m[4]}-${m[5]}-${m[6]}` : `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
    const parsed = Date.parse(day + "T12:00:00Z");
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0,10) !== day) continue;
    const around = text.slice(Math.max(0,m.index - 90),m.index + m[0].length + 90);
    if (!/\b(?:frist|abgabefrist|einreichungsfrist|antragsfrist|abgabe|einzureichen|einreichen|abgeben|endet|fallig|bis)\b/u.test(around)) continue;
    const following = text.slice(m.index + m[0].length);
    const clock = following.match(new RegExp("^\\s*(?:(?:um|bis)\\s+)?(" + UHR + ")\\b", "u"));
    result.push({ day, minute:clock ? minute(clock[0]) : null, part:null });
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
module.exports = { belegt };
