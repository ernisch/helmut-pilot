"use strict";

// Reine Artikel-/Publikationsbindung fuer Speicher und Leser. Keine Abhaengigkeit
// vom schreibenden Inhaltsanschluss, Scheduler, Crawler oder Quellenparser.
// Belegte Namen und Titelsuffixe derselben Verlagsautoritaet. Keine allgemeine
// Suffixkuerzung: beide Seiten muessen dieselbe direkte Artikeladresse tragen.
const VERLAGSMETADATEN = new Map([
  ["www.wiwo.de", [["WirtschaftsWoche", " - WirtschaftsWoche"], ["WiWo", " - WiWo"]]],
  ["www.golem.de", [["Golem.de", " - Golem.de"], ["Golem", " - Golem"]]],
  ["www.deutschlandfunk.de", [["Deutschlandfunk Politik", ""], ["Deutschlandfunk", " - Deutschlandfunk"]]]
]);
function gleicheBelegteVerlagsMetadaten(a, b) {
  if (a.link_type !== "direct" || b?.link_type !== "direct" || a.id !== b.id
    || a.url !== b.url || a.canonical_url !== b.canonical_url) return false;
  let url, kanonisch;
  try { url = new URL(a.url); kanonisch = new URL(a.canonical_url); } catch { return false; }
  if ([url, kanonisch].some(u => u.protocol !== "https:" || u.username || u.password || u.port)
    || kanonisch.hostname !== url.hostname.replace(/^www\./, "")) return false;
  const namen = VERLAGSMETADATEN.get(url.hostname);
  if (!namen) return false;
  for (const [links, rechts] of [[a, b], [b, a]]) {
    const [[name, suffix], [alias, aliasSuffix]] = namen;
    if (links.source_name !== name || rechts.source_name !== alias
      || typeof links.title !== "string" || typeof rechts.title !== "string"
      || !links.title.endsWith(suffix) || !rechts.title.endsWith(aliasSuffix)) continue;
    const rumpf = suffix ? links.title.slice(0, -suffix.length) : links.title;
    const aliasRumpf = aliasSuffix ? rechts.title.slice(0, -aliasSuffix.length) : rechts.title;
    if (rumpf.trim() && rumpf === aliasRumpf) return true;
  }
  return false;
}
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
  if (gleicheBelegteVerlagsMetadaten(a, b) && Number.isFinite(Date.parse(a.published_at))
    && Date.parse(a.published_at) === Date.parse(b.published_at)) return true;
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
const HIB_SUCHWEGE = new Map([["general-hib", "rp-general-hib"],
  ["process-hib-arbeit-soziales", "rp-process-hib-arbeit-soziales"]]);
// Nur das deutsche, vollstaendige Anfuehrungszeichenpaar dieses amtlichen
// Titelvergleichs. Worte, Suffix, Leerzeichen und andere Zeichen bleiben exakt.
const hibTitel = value => typeof value === "string" ? value.replace(/„([^„“"]+)“/g, '"$1"') : value;
function amtlicherHibFeedstand(amtlich, fundstelle) {
  if (amtlich.source_id !== "bundestag" || amtlich.source_name !== "Bundestag"
    || amtlich.raw?.retrievalPathId !== "rp-bundestag" || amtlich.source_type !== "bundestag"
    || !HIB_SUCHWEGE.has(fundstelle?.source_id) || fundstelle.source_name !== "Deutscher Bundestag"
    || fundstelle.quellenabrufpfad !== HIB_SUCHWEGE.get(fundstelle.source_id) || fundstelle.source_type !== "bundestag"
    || amtlich.link_type !== "direct" || fundstelle.link_type !== "direct"
    || amtlich.id !== fundstelle.id || amtlich.url !== fundstelle.url
    || amtlich.canonical_url !== fundstelle.canonical_url
    || !/^https:\/\/www\.bundestag\.de\/presse\/hib\/kurzmeldungen-\d+$/.test(amtlich.url || "")
    || amtlich.canonical_url !== amtlich.url.replace("www.", "")
    || typeof amtlich.title !== "string" || !amtlich.title.trim()
    || hibTitel(fundstelle.title) !== `${hibTitel(amtlich.title)} - Deutscher Bundestag`) return false;
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
  gleicheHerausgeberMetadaten, gleicheBelegteVerlagsMetadaten, amtlicherHibFeedstand, hibFundBestaetigtOriginal };
