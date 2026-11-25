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

const VERLAGSNAMEN = new Map([
  ["www.n-tv.de", { quelle: "news-ntv", name: "ntv", alias: "n-tv.de" }],
  ["www.zeit.de", { quelle: "news-zeit", name: "ZEIT Online", alias: "DIE ZEIT" }]
]);

// Eine Suchfundstelle kann denselben Verlag anders nennen als der Katalog.
// Nur beim Lesen gilt der Alias, und nur für denselben direkt belegten Artikel.
function gleicherStandMitVerlagsalias(a, b) {
  if (a.link_type !== "direct" || b?.link_type !== "direct") return false;
  let url;
  try { url = new URL(a.url); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const namen = VERLAGSNAMEN.get(url.hostname);
  if (!namen) return false;
  const katalogeintrag = row => row.source_id === namen.quelle
    && row.source_type === "media" && row.source_name === namen.name;
  const [katalog, fundstelle] = katalogeintrag(a) ? [a, b] : [b, a];
  return katalogeintrag(katalog) && fundstelle.source_name === namen.alias
    && gleicherStand({ ...katalog, source_name: namen.alias }, fundstelle);
}

// Der bestaetigte hib-Feed ist fuer dieselbe Meldung massgeblich, wenn der
// Suchindex zuerst gespeichert wurde. Die Uhrzeit des Suchindex ersetzt nie
// die Originalzeit. Diese Richtung gilt nur beim Lesen eines Archivstands.
function amtlicherHibFeedstand(amtlich, fundstelle) {
  if (amtlich.source_id !== "bundestag" || amtlich.source_name !== "Bundestag"
    || amtlich.raw?.retrievalPathId !== "rp-bundestag" || amtlich.source_type !== "bundestag"
    || fundstelle?.source_id !== "general-hib" || fundstelle.source_name !== "Deutscher Bundestag"
    || fundstelle.quellenabrufpfad !== "rp-general-hib" || fundstelle.source_type !== "bundestag"
    || amtlich.link_type !== "direct" || fundstelle.link_type !== "direct"
    || amtlich.id !== fundstelle.id || amtlich.url !== fundstelle.url
    || amtlich.canonical_url !== fundstelle.canonical_url
    || !/^https:\/\/www\.bundestag\.de\/presse\/hib\/kurzmeldungen-\d+$/.test(amtlich.url || "")
    || amtlich.canonical_url !== amtlich.url.replace("www.", "")
    || typeof amtlich.title !== "string" || !amtlich.title.trim()
    || fundstelle.title !== `${amtlich.title} - Deutscher Bundestag`) return false;
  const originalzeit = Date.parse(amtlich.published_at), indexzeit = Date.parse(fundstelle.published_at);
  const abstand = indexzeit - originalzeit;
  return abstand >= 0 && abstand <= 15 * 60000;
}

// Ein textloser Indexfund kann den bereits gespeicherten amtlichen Artikel
// erneut belegen. Der Suchstand bleibt getrennt und liefert keinen Modelltext.
function hibFundBestaetigtOriginal(amtlich, fund) {
  return fund?.summary === null && amtlich?.source_id === "bundestag"
    && amtlicherHibFeedstand(amtlich, { ...fund, quellenabrufpfad: fund.raw?.retrievalPathId })
    && require("./quellen-auszug").hatOriginalinhalt(amtlich);
}

module.exports = { gleicherStand, gleicherStandMitVerlagsalias,
  gleicheHerausgeberMetadaten, amtlicherHibFeedstand, hibFundBestaetigtOriginal };
