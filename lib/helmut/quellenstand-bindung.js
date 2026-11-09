"use strict";

// Reine Artikel-/Publikationsbindung fuer Speicher und Leser. Keine Abhaengigkeit
// vom schreibenden Inhaltsanschluss, Scheduler, Crawler oder Quellenparser.
function gleicheHerausgeberMetadaten(a, b) {
  if (a.title === b.title && a.source_name === b.source_name) return true;
  for (const [kurz, lang] of [[a, b], [b, a]]) {
    const name = kurz.source_name;
    if (!/^[A-Z0-9]{2,8}$/.test(name || "") || typeof lang.source_name !== "string") continue;
    let host;
    try { const u = new URL(kurz.url); if (u.protocol !== "https:" || u.username || u.password || u.port) continue;
      host = u.hostname.replace(/^www\./, "").split("."); } catch { continue; }
    if (host.length !== 2 || host[0] !== name.toLowerCase()) continue;
    const ende = " | " + name;
    if (!lang.source_name.endsWith(ende)) continue;
    const voll = lang.source_name.slice(0, -ende.length);
    if (voll.length < 5 || voll.includes("|") || voll === name) continue;
    const kurzSuffix = " - " + name + " - " + voll, langSuffix = " - " + voll + ende;
    if (typeof kurz.title !== "string" || typeof lang.title !== "string"
      || !kurz.title.endsWith(kurzSuffix) || !lang.title.endsWith(langSuffix)) continue;
    const rumpf = kurz.title.slice(0, -kurzSuffix.length);
    if (rumpf.trim() && rumpf === lang.title.slice(0, -langSuffix.length)) return true;
  }
  return false;
}
function gleicherStand(input, row) {
  const zeit = (a, b) => (!a && !b) || (Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b));
  return row && row.id === input.id && row.url === input.url
    && row.canonical_url === input.canonical_url && gleicheHerausgeberMetadaten(input, row)
    && zeit(row.published_at, input.published_at);
}
module.exports = { gleicherStand };
