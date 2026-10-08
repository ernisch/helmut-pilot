"use strict";

// Zweite, rein lesende Schranke fuer die vorhandene Fresh-Augmentierung.
// Top-N-Entscheidungen bleiben erhalten. Eine spaetere KO-Metadatenkorrektur
// ist kein neuer Quellenanlass. Bereits geladene Quellen und unveraenderte
// Erstaufnahmezeiten genuegen; keine weiteren Reads, Modelle oder Writes.
const { berlinTagKey } = require("./briefing-frische");
const { canonicalizeUrl, briefingArticleIdentity } = require("./dedup");
const Stand = require("./artikelstand");

function quelltag(doc, jetzt) {
  let stand;
  try { stand = Stand.leseStand(doc)?.stand || null; } catch { return null; }
  const raw = doc.published_at || doc.publishedAt || null;
  const ms = raw ? Date.parse(raw) : null;
  if (raw && (!Number.isFinite(ms) || ms > jetzt.getTime())) return null;
  if (doc.published_at && doc.publishedAt && Date.parse(doc.published_at) !== Date.parse(doc.publishedAt)) return null;
  const tag = raw ? berlinTagKey(new Date(ms)) : stand?.publikationstag || null;
  if (!tag) return null;
  if (stand && tag !== stand.publikationstag) return null;
  const genau = stand?.publikationszeitpunktUtc ? Date.parse(stand.publikationszeitpunktUtc) : ms;
  if (genau !== null && (!Number.isFinite(genau) || genau > jetzt.getTime())) return null;
  if (raw && stand?.publikationszeitpunktUtc && genau !== ms) return null;
  // Ein Kalendertag wird nie in einen erfundenen Mitternachtszeitpunkt umgewandelt.
  return { tag, ms: genau };
}

function konfliktfreieQuellen(docs, jetzt) {
  const gruppen = [];
  for (const doc of Array.isArray(docs) ? docs : []) {
    const url = require("./lage-quellenbeleg").artikelUrl(doc?.url || doc?.canonical_url);
    const keys = [url && "url:" + canonicalizeUrl(url), url && briefingArticleIdentity(url), doc?.id && "id:" + doc.id].filter(Boolean);
    if (!keys.length) continue;
    const matches = gruppen.filter(g => keys.some(k => g.keys.has(k)));
    const gruppe = { keys: new Set(keys), docs: [doc] };
    for (const match of matches) {
      match.keys.forEach(k => gruppe.keys.add(k)); gruppe.docs.push(...match.docs);
      gruppen.splice(gruppen.indexOf(match), 1);
    }
    gruppen.push(gruppe);
  }
  return gruppen.filter(g => {
    if (!g.docs.every(d => require("./lage-quellenbeleg").artikelUrl(d?.url || d?.canonical_url))) return false;
    const zeiten = g.docs.map(d => quelltag(d, jetzt));
    // Dokumentkennung, kanonische URL und Artikelidentitaet verbinden auch
    // transitive Varianten. Eine unklare/abweichende Zeit sperrt die Gruppe.
    return zeiten.every(Boolean) && new Set(zeiten.map(z => z.tag)).size === 1
      && new Set(zeiten.filter(z => z.ms !== null).map(z => z.ms)).size <= 1;
  }).flatMap(g => g.docs);
}

function begrenzeErgaenzungen({ vorher = [], vorlaeufig = [], kosById = {}, sourcesByVorgang = {}, now = new Date() } = {}) {
  const base = Array.isArray(vorher) ? vorher : [];
  const jetzt = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(jetzt.getTime()) || !Array.isArray(vorlaeufig)) return base;
  const tag = berlinTagKey(jetzt);
  const gesehen = new Set(base.map(d => d?.knowledge_object_id).filter(Boolean));
  const extra = [];
  for (const d of vorlaeufig) {
    const id = d?.knowledge_object_id;
    if (!id || gesehen.has(id)) continue;
    const ko = kosById instanceof Map ? kosById.get(id) : kosById[id];
    if (ko?.id !== id || !ko.vorgang_id || (d.vorgang_id && d.vorgang_id !== ko.vorgang_id)) continue;
    const erst = Date.parse(ko.created_at || "");
    const heuteErstmals = Number.isFinite(erst) && erst <= jetzt.getTime() && berlinTagKey(new Date(erst)) === tag;
    // Derselbe gepruefte Originalbestand traegt beide Anlasszweige. Alte,
    // konfliktfreie Publikationen bleiben fuer eine heutige Frist nutzbar.
    const docs = konfliktfreieQuellen(sourcesByVorgang[ko.vorgang_id] || [], jetzt);
    const heuteBelegt = docs.some(doc => quelltag(doc, jetzt).tag === tag)
      || require("./briefing-bereichsvertrag").tagesAnlass(docs, jetzt, null, ko)?.art === "heutige-frist";
    if (!heuteErstmals && !heuteBelegt) continue;
    gesehen.add(id); extra.push(d);
  }
  return extra.length ? base.concat(extra) : base;
}

module.exports = { begrenzeErgaenzungen };
