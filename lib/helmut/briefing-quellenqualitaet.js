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
  "bundeskanzler", "ministerprasident", "bundesprasident", "staatssekretar",
  "bundestagsprasident", "landtagsprasident", "parlamentsprasident"];
function quellengebunden(ko = {}, docs = []) {
  // Dieselbe URL-Praeferenz wie im ausliefernden Briefingvertrag. Eine
  // gespeicherte Analyse oder best_source_url ersetzt kein Quelldokument.
  const { artikelUrl } = require("./lage-quellenbeleg");
  if (!Array.isArray(docs) || !docs.some(d => d && String(d.title || "").trim()
    && artikelUrl(d.url || d.canonical_url))) return false;
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
// Handlungsanlass. Zusaetzlich zum Relevanzfenster muss jede erkannte relative
// Frist im gespeicherten Quellentext mit passendem Zeitanker belegt sein.
function handlungstexte(ko) {
  const aktionen = Array.isArray(ko.action_items_struct) ? ko.action_items_struct : [];
  return [ko.recommendation, ko.handlungsempfehlung, ko.recommended_communication,
    ko.recommended_communication_struct?.communicationLine,
    ...(Array.isArray(ko.action_items) ? ko.action_items : []),
    ...aktionen.flatMap(a => [a?.title, a?.description, a?.dueHint])];
}
function relativeFristZeitlichZulaessig(ko = {}, docs = [], now = new Date()) {
  const texte = handlungstexte(ko);
  const text = norm(texte.filter(t => typeof t === "string").join(" "));
  const relativ = /\b(?:heute|morgen|ubermorgen|sofort|umgehend|diese[rmns]?\s+(?:woche|monat)|bis\s+(?:ende|mitte)\s+(?:(?:der|dieser|nachster|kommender)\s+)?woche|bis\s+(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)|bis\s+\d{1,2}(?:[:.]\d{2})?\s*uhr|binnen\s+[\p{L}\d]+\s+tagen?)\b/u;
  const weitereSpannen = /\b(?:bis\s+(?:zum\s+)?(?:monats|wochen|jahres)ende|bis\s+(?:ende|mitte)\s+(?:(?:des|dieses|kommenden|nachsten)\s+)?(?:monats?|jahres?)|(?:in|innerhalb(?:\s+von)?|binnen)\s+[\p{L}\d]+\s+(?:tagen?|wochen?|monaten?))\b/u;
  if (!relativ.test(text) && !weitereSpannen.test(text)) return true;
  const jetzt = new Date(now);
  const daten = docs.map(d => Date.parse(d?.published_at || "")).filter(Number.isFinite);
  if (!Number.isFinite(jetzt.getTime()) || !daten.length) return false;
  // Ein belegter heutiger Artikel macht eine bereits verstrichene heutige
  // Uhrzeit nicht wieder erreichbar. Explizit morgige Fristen bleiben offen.
  const parts = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(jetzt);
  const minute = Number(parts.find(p => p.type === "hour").value) * 60
    + Number(parts.find(p => p.type === "minute").value);
  // dueHint enthaelt auch "heute 16 Uhr" ohne "bis". Dieselbe explizite
  // heutige Frist darf dadurch nicht an der Ablaufpruefung vorbeigehen.
  for (const m of text.matchAll(/\b(?:bis\s+(?:heute\s+)?|heute\s+)(?:(\d{1,2})(?:[:.](\d{2}))?\s*uhr|mittag)\b/gu)) {
    // Ein "morgen" am Ende des Nachbarfelds verschiebt kein explizites "heute".
    if (!/\bheute\b/u.test(m[0]) && /\b(?:morgen|ubermorgen)\s*$/u.test(text.slice(0, m.index))) continue;
    const h = m[1] == null ? 12 : Number(m[1]), min = Number(m[2] || 0);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59 && h * 60 + min <= minute) return false;
  }
  const juengsteQuelle = Math.max(...daten);
  if (juengsteQuelle > jetzt.getTime()) return false;
  const F = require("./briefing-frische");
  return F.klassifiziereMeldung(new Date(juengsteQuelle), F.frischeFenster({ jetzt }), jetzt)
    !== F.KLASSE_HINTERGRUND;
}
function relativeFristZulaessig(ko = {}, docs = [], now = new Date()) {
  if (!relativeFristZeitlichZulaessig(ko,docs,now)) return false;
  return require("./briefing-fristbeleg").belegt(handlungstexte(ko),docs,new Date(now));
}
function mitBelegtenHandlungsfristen(ko = {}, docs = [], now = new Date()) {
  const copy = { ...ko };
  const behalten = text => typeof text !== "string" || relativeFristZulaessig({recommendation:text},docs,now);
  for (const key of ["recommendation","handlungsempfehlung","recommended_communication"])
    if (!behalten(copy[key])) copy[key] = "";
  if (copy.recommended_communication_struct && typeof copy.recommended_communication_struct === "object") {
    copy.recommended_communication_struct = { ...copy.recommended_communication_struct };
    if (!behalten(copy.recommended_communication_struct.communicationLine)) copy.recommended_communication_struct.communicationLine = "";
  }
  if (Array.isArray(copy.action_items)) copy.action_items = copy.action_items.filter(behalten);
  if (Array.isArray(copy.action_items_struct)) copy.action_items_struct = copy.action_items_struct
    .filter(a => a && behalten(a.title) && behalten(a.description))
    .map(a => behalten(a.dueHint) ? { ...a } : { ...a, dueHint:"" });
  return copy;
}
module.exports = { themenrein, quellengebunden, relativeFristZulaessig, relativeFristZeitlichZulaessig, mitBelegtenHandlungsfristen };
