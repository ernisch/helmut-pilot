"use strict";
// Bestehende vermischte KOs werden nicht geloescht oder umgeschrieben. Der
// Lesepfad laesst daraus aber keine gemeinsame Tatsachenbehauptung entstehen.
const { clusterRawDocuments } = require("./vorgang-identity");
const { hash } = require("./briefing-speicher");
const cache = new Map();
function themenrein(docs = []) {
  if (docs.length < 2) return true;
  const input = docs.map(d => ({ id: d.id, title: d.title, summary: d.summary,
    source_name: d.source_name, published_at: d.published_at }));
  const key = hash(input);
  if (cache.has(key)) return cache.get(key);
  const ok = clusterRawDocuments(input).length === 1;
  if (cache.size >= 512) cache.clear();
  cache.set(key, ok);
  return ok;
}
const norm = s => String(s || "").toLocaleLowerCase("de").normalize("NFD")
  .replace(/\p{M}/gu, "").replace(/ß/g, "ss");
const AEMTER = ["aussenminister", "innenminister", "finanzminister", "gesundheitsminister",
  "verteidigungsminister", "wirtschaftsminister", "bildungsminister", "justizminister",
  "verkehrsminister", "umweltminister", "familienminister", "arbeitsminister", "bundesminister",
  "bundeskanzler", "ministerprasident", "bundesprasident", "staatssekretar"];
function quellengebunden(ko = {}, docs = []) {
  if (!themenrein(docs)) return false;
  // Belegter Altfehler: eine vertrauenswuerdige Quelle bestaetigt nicht jedes
  // vom Modell hinzugefuegte Amt. Das gilt auch fuer alte Briefing-/Radarkarten.
  // Diese begrenzte Detailpruefung ersetzt keine semantische Faktenpruefung.
  const fakten = norm([ko.display_title, ko.headline, ko.display_summary, ko.was_ist_passiert].filter(Boolean).join(" "));
  const belege = norm(docs.map(d => [d.title, d.summary].filter(Boolean).join(" ")).join(" "));
  if (AEMTER.some(amt => fakten.includes(amt) && !belege.includes(amt))) return false;
  const entscheidung = fakten.replace(/\b(?:noch\s+)?(?:nicht|nie)\s+(?:beschlossen|verabschiedet|bewilligt|in kraft getreten)\b/gu, "");
  const verneint = /\b(?:kein(?:e[nmrs]?)?\s+(?:beschluss|entscheidung)|(?:noch\s+)?nicht\s+(?:beschlossen|verabschiedet|bewilligt)|beschluss\s+liegt\s+(?:noch\s+)?nicht\s+vor)\b/u;
  if (/\b(?:beschlossen|verabschiedet|bewilligt|in kraft getreten)\b/u.test(entscheidung)
    && (!/\b(?:beschlossen|beschluss|verabschiedet|bewilligt|in kraft)\b/u.test(belege)
      || verneint.test(belege))) return false;
  return true;
}
module.exports = { themenrein, quellengebunden };
