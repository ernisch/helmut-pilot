"use strict";

// Gemeinsame, rein lesende Rollengrenzen. Keine Bedeutungspruefung durch
// Aehnlichkeitszahlen: Lage besitzt den Sachstand, Radar beobachtet Belege,
// Briefing braucht einen heutigen Anlass. Fachliche Paraphrasenpruefung bleibt
// ein gesondertes, exakt gebundenes Urteil (briefing-fachurteil).
const { berlinTagKey, frischeFenster } = require("./briefing-frische");
const { canonicalizeUrl, briefingArticleIdentity } = require("./dedup");

function quellen(docs, now) {
  const groups = [];
  for (const d of Array.isArray(docs) ? docs : []) {
    const url = require("./lage-quellenbeleg").artikelUrl(d?.url || d?.canonical_url);
    if (!url) continue;
    const keys = ["url:" + canonicalizeUrl(url), briefingArticleIdentity(url), d.id && "id:" + d.id].filter(Boolean);
    const matches = groups.filter(g => keys.some(k => g.keys.has(k)));
    const group = { keys: new Set(keys), docs: [d] };
    for (const match of matches) {
      match.keys.forEach(k => group.keys.add(k)); group.docs.push(...match.docs);
      groups.splice(groups.indexOf(match), 1);
    }
    groups.push(group);
  }
  return groups.filter(g => {
    const times = g.docs.map(d => Date.parse(d.published_at || ""));
    // Auch eine undatierte/abweichend datierte Variante sperrt den Zeitbeleg.
    // Die zufaellige Reihenfolge darf keine frische Fassung erfinden.
    return times.every(t => Number.isFinite(t) && t <= new Date(now).getTime())
      && new Set(times).size === 1;
  }).map(g => [...g.docs].sort((a,b) => String(a.id).localeCompare(String(b.id)))[0])
    .sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at));
}

function fristTag(ko, docs, now) {
  const day = typeof ko?.deadline === "string" && ko.deadline.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || "")) return null;
  const date = new Date(day + "T12:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return null;
  // Vorhandener strenger Fristparser: Datum braucht einen Fristkontext;
  // Verneinung/Absage/unklare Zeitzone sperren. Nur bereits veröffentlichte
  // Dokumente; keine Prognose aus stage, Empfehlung oder KO-Schreibzeit.
  const [year, month, dateNumber] = day.split("-").map(Number);
  const absolute = new RegExp(`(?:${day}|${dateNumber}\\.${month}\\.${year}|${String(dateNumber).padStart(2, "0")}\\.${String(month).padStart(2, "0")}\\.${year})`);
  const eligible = quellen(docs, now).filter(d => [d.title, d.summary].some(t => {
    if (typeof t !== "string") return false;
    const m = absolute.exec(t);
    if (!m) return false;
    const around = t.slice(Math.max(0, m.index - 90), m.index + m[0].length + 90);
    return /\b(?:Frist|Abgabefrist|Einreichungsfrist|Antragsfrist|Abgabe|einzureichen|einreichen|abgeben|endet|fällig)\b/iu.test(around);
  }));
  return require("./briefing-fristbeleg").belegt(["heute"], eligible, date) ? day : null;
}

function tagesAnlass(docs, now, fenster = null, ko = {}) {
  const frist = fristTag(ko, docs, now);
  if (frist === berlinTagKey(now)) return { art: "heutige-frist", documentIds: quellen(docs, now).map(d => d.id).filter(Boolean),
    text: `Für den heutigen Arbeitstag priorisiert: quellenbelegte Frist am ${frist}. Sachstand und Einordnung gehören in die Lage.` };
  const start = Date.parse((fenster || frischeFenster({ jetzt: now })).start);
  const neu = quellen(docs, now).filter(d => Date.parse(d.published_at) >= start);
  if (!neu.length) return null;
  return { art: "neue-quelle", documentIds: neu.map(d => d.id).filter(Boolean),
    text: "Für den heutigen Arbeitstag priorisiert: neue Quellen im aktuellen Briefingfenster. Sachstand und Einordnung gehören in die Lage." };
}

// Eine Bestandszahl beweist kein Wachstum. Nur verschiedene Artikel mit
// verschiedenen belegten Publikationstagen tragen eine neue Beobachtung.
// Keine Prognose, keine Behauptung unabhängiger Herausgeber oder eines Trends.
function beobachtung(docs, now) {
  const list = quellen(docs, now);
  const neu = list.at(-1);
  if (!neu || new Date(now).getTime() - Date.parse(neu.published_at) > 7 * 864e5) return null;
  const tag = berlinTagKey(new Date(neu.published_at));
  const zuvor = list.filter(d => berlinTagKey(new Date(d.published_at)) < tag);
  if (!zuvor.length) return null;
  const hinzu = list.filter(d => berlinTagKey(new Date(d.published_at)) === tag);
  return { art: "weitere-berichte", documentIds: list.map(d => d.id).filter(Boolean),
    sourceCount: list.length, publishedAt: neu.published_at,
    text: `Am ${tag} kamen ${hinzu.length} weitere Artikel zu ${zuvor.length} zuvor veröffentlichten Artikeln hinzu. Weiteren Verlauf beobachten; daraus folgt noch kein politischer Trend.` };
}

function radarAnzeige(roh, sourcesByVorgang, now, kos = []) {
  const out = { mentions: [], environment: { party: [], constituency: [], committees: [] }, dynamics: [], articles: [] };
  const gesehen = new Set();
  const uebernehme = (i, target, persoenlich = false) => {
    if (!i?.vorgangId || gesehen.has(i.vorgangId)) return;
    const docs = sourcesByVorgang[i.vorgangId] || [];
    const frist = fristTag(kos.find(k => k.vorgang_id === i.vorgangId), docs, now);
    const signal = frist && frist > berlinTagKey(now)
      ? { art: "kommende-frist", documentIds: quellen(docs, now).map(d => d.id).filter(Boolean),
        text: `Quellenbelegte Frist am ${frist}. Den Vorgang bis dahin im Blick behalten; die Tagespriorisierung steht im Briefing.` }
      : beobachtung(docs, now);
    // Eine frische Eigenerwaehnung hat eine eigene Beobachtungsfunktion. Die
    // schon gepruefte Relation wird benannt, ihr politischer Inhalt nicht kopiert.
    const frisch = persoenlich && quellen(docs, now).some(d =>
      (d.id === i.documentId || canonicalizeUrl(d.url || d.canonical_url) === canonicalizeUrl(i.sourceUrl))
      && new Date(now).getTime() - Date.parse(d.published_at) <= 7 * 864e5);
    if (!signal && !frisch) return;
    gesehen.add(i.vorgangId);
    const copy = { ...i, summary: "", shortSummary: "", zusatzSignale: [],
      evidence: signal?.text || "Neue Quelle mit persönlicher Erwähnung. Weitere Resonanz beobachten.",
      beobachtungsBeleg: signal || { art: "eigenerwaehnung", documentIds: [i.documentId].filter(Boolean) } };
    // Ton/Initiative aus KO-Prosa sind keine belegte Entwicklung.
    if (persoenlich) Object.assign(copy, { mentionType: "directName", mentionLabel: "Namentlich erwähnt", mentionTone: "neutral" });
    if (copy.signalType && signal) Object.assign(copy, { signalType: signal.art === "kommende-frist" ? "deadline" : "rising",
      signalLabel: signal.art === "kommende-frist" ? "Kommende Frist" : "Weitere Berichte", sourceCount: signal.sourceCount || quellen(docs, now).length });
    target.push(copy);
  };
  for (const i of roh.mentions || []) uebernehme(i, out.mentions, true);
  for (const key of Object.keys(out.environment))
    for (const i of roh.environment?.[key] || []) uebernehme(i, out.environment[key]);
  for (const i of roh.dynamics || []) uebernehme(i, out.dynamics);
  // Keine zweite Artikelliste: ohne Beobachtungsfunktion bleibt der Sachstand
  // ausschliesslich in Lage. Rohzuordnungen bleiben fuer Diagnose erhalten.
  return out;
}

module.exports = { quellen, fristTag, tagesAnlass, beobachtung, radarAnzeige };
