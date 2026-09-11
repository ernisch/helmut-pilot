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

// Relative Fristen sind keine zeitlose Hintergrundinformation. Ein heutiger
// interner Schreibzeitpunkt macht aus einer alten Quelle keinen aktuellen
// Handlungsanlass. Das bestehende Relevanzfenster bleibt die einzige Grenze;
// diese begrenzte Pruefung bestaetigt keine Frist innerhalb dieses Fensters.
function relativeFristZulaessig(ko = {}, docs = [], now = new Date()) {
  const aktionen = Array.isArray(ko.action_items_struct) ? ko.action_items_struct : [];
  const texte = [ko.recommendation, ko.handlungsempfehlung, ko.recommended_communication,
    ko.recommended_communication_struct?.communicationLine,
    ...(Array.isArray(ko.action_items) ? ko.action_items : []),
    ...aktionen.flatMap(a => [a?.title, a?.description, a?.dueHint])];
  const text = norm(texte.filter(t => typeof t === "string").join(" "));
  const relativ = /\b(?:heute|morgen|ubermorgen|sofort|umgehend|diese[rmns]?\s+(?:woche|monat)|bis\s+(?:ende|mitte)\s+(?:(?:der|dieser)\s+)?woche|bis\s+(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)|bis\s+\d{1,2}(?:[:.]\d{2})?\s*uhr|binnen\s+[\p{L}\d]+\s+tagen?)\b/u;
  if (!relativ.test(text)) return true;
  const jetzt = new Date(now);
  const daten = docs.map(d => Date.parse(d?.published_at || "")).filter(Number.isFinite);
  if (!Number.isFinite(jetzt.getTime()) || !daten.length) return false;
  const juengsteQuelle = Math.max(...daten);
  if (juengsteQuelle > jetzt.getTime()) return false;
  const F = require("./briefing-frische");
  return F.klassifiziereMeldung(new Date(juengsteQuelle), F.frischeFenster({ jetzt }), jetzt)
    !== F.KLASSE_HINTERGRUND;
}
module.exports = { themenrein, quellengebunden, relativeFristZulaessig };
