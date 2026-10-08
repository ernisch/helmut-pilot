"use strict";
// Relative Aussagen bleiben an den Berliner Veroeffentlichungstag gebunden.
// Rein lesend: keine Umdeutung einer alten Meldung in ein neues Ereignis.
const HEUTE = /\bheute\b|\bheutig(?:e|en|er|es|em)\b/iu;
const tagFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"
});
function tag(ms) {
  return tagFormat.format(new Date(ms));
}
function quellzeit(source) {
  const value = source && (source.publishedAt || source.published_at);
  if (source && source.publishedAt && source.published_at && Date.parse(source.publishedAt) !== Date.parse(source.published_at)) return NaN;
  // Ein Kalendertag allein belegt keinen Zeitpunkt vor dem aktuellen Abruf.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return NaN;
  const ms = Date.parse(value);
  // Date.parse normalisiert ungueltige Monatstage; diese sind keine Belege.
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return NaN;
  return ms;
}
function zeitgebundenerText(text, sources, now) {
  if (typeof text !== "string" || !HEUTE.test(text)) return text;
  const nowMs = now instanceof Date ? now.getTime() : (typeof now === "string" ? Date.parse(now) : NaN);
  if (!Number.isFinite(nowMs) || !Array.isArray(sources) || !sources.length) return "";
  const nowTag = tag(nowMs);
  for (const source of sources) {
    if (!source || source.publishedAtConflict) return "";
    const evidence = [source, ...(Array.isArray(source.variants) ? source.variants : [])];
    const primaryMs = quellzeit(source);
    for (const variant of evidence) {
      if (!variant || variant.publishedAtConflict) return "";
      const ms = quellzeit(variant);
      if (!Number.isFinite(ms) || ms > nowMs || tag(ms) !== nowTag || ms !== primaryMs) return "";
    }
  }
  return text;
}
module.exports = { zeitgebundenerText };
