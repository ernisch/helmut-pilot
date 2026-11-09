"use strict";

// Auswahl aus vorhandenem Inhalt, kein Abruf und keine neue Understanding-Analyse.
// Eine Ankündigung belegt einen Prüfauftrag, niemals ihre fortdauernde Offenheit.
const P = require("./lage-profilbezug");
const Q = require("./quellen-auszug");
const { berlinTagKey } = require("./briefing-frische");
const TAGE = 7;
const schritt = /\b(Nachbesserungen|Änderungsantrag|Gesetzentwurf|Anhörung|Beratung|Stellungnahme)\b/iu;
const geschlossen = /\b(?:abgesagt|abgeschlossen|zurückgezogen|verworfen|erledigt|verschoben|nicht\s+(?:mehr\s+)?(?:geplant|vorgesehen)|keine\s+(?:weiteren\s+)?Nachbesserungen)\b|\b(?:Nachbesserungen|Änderungsantrag|Gesetzentwurf|Stellungnahme)\b.{0,80}\b(?:beschlossen|vorgelegt|umgesetzt)\b/iu;
const ankuendigung = /\b(?:angekündigt|kündigt\b.{0,160}\ban|wird\b.{0,160}\b(?:vorlegen|beraten|stattfinden)|findet\b.{0,160}\bstatt)\b/iu;
function vorwahl(kos, profile) {
  return (kos || []).filter(k => k?.understanding_status === "complete" && k.status !== "pending"
    && P.bewerte(k, profile).passt && (k.deadline || schritt.test([k.headline, k.was_ist_passiert].join(" "))));
}
function datum(text) {
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(text);
  const de = /\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/.exec(text);
  const m = iso ? [iso[1],iso[2],iso[3]] : de ? [de[3],de[2].padStart(2,"0"),de[1].padStart(2,"0")] : null;
  if (!m) return null;
  const day = m.join("-"), ms = Date.parse(day + "T12:00:00Z");
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0,10) === day ? day : null;
}
function belege(ko, docs, now, profile) {
  if (!P.bewerte(ko, profile).passt || ko.status === "pending" || ko.understanding_status !== "complete") return null;
  const jetzt = new Date(now), heute = berlinTagKey(jetzt);
  if (!Number.isFinite(jetzt.getTime())) return null;
  // Wiederverwendung des Identitaets-/Zeitvertrags; kein updated_at als Frische.
  const vollquellen = require("./briefing-bereichsvertrag").quellen(
    require("./briefing-kandidatenzeit").konfliktfreieQuellen(docs, jetzt), jetzt).map(Q.geleseneQuelle);
  // Nur bereits bestaetigte Abschnitte sind hier Quelleninhalt. Alle geladenen
  // bestaetigten Teile bleiben fuer Gegenbelege erhalten; keine blosse Praefixwahl.
  const sources = vollquellen.flatMap(d => Q.istAbschnittsquelle(d)
    ? Q.geleseneArtikelabschnitte(d, ko).map(p => ({ ...d, summary: p.text })) : [d]);
  // Auch spätere Gegenbelege verhindern, dass die ältere Ankündigung fortlebt.
  if (sources.some(d => geschlossen.test([d.title, d.summary].join(" ")))) return null;
  for (const d of [...sources].reverse()) {
    const alter = jetzt.getTime() - Date.parse(d.published_at);
    if (alter < 0 || alter > TAGE * 864e5 || !d.id || !Q.hatOriginalinhalt(d)) continue;
    const auszug = Q.plain(d.summary);
    // Ein abgeschnittenes Satzende koennte Absage/Verneinung verlieren.
    if (Q.satzpraefix(auszug, 12000) !== auszug) continue;
    for (const text of auszug.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/u)) {
      // Nicht der Titel oder ein anderer Absatz, sondern derselbe Handlungssatz
      // muss den persoenlichen Fachbezug tragen.
      const bezug = P.mitQuellenbezug([ko], profile, { [ko.vorgang_id]: [{ ...d, title: "", summary: text }] })[0]?.relevanz_erklaerung;
      if (!bezug) continue;
      const frist = require("./briefing-bereichsvertrag").fristTag(ko, [{ ...d, title: "", summary: text }], jetzt);
      if (frist && frist > heute && Date.parse(frist) - Date.parse(heute) <= TAGE * 864e5) return {
        art: "kommende-frist", documentIds: [d.id], termin: frist,
        text: `${bezug.satz} Die quellenbelegte Frist am ${frist} lässt Zeit für die Vorbereitung; sie ist nicht heute fällig.`,
        recommendation: `Prüfen Sie, ob für Ihr Mandat bis zum ${frist} eine Einreichung sinnvoll ist, und bereiten Sie gegebenenfalls die Unterlagen vor.`,
        beleg: { documentId: d.id, text, url: d.url || d.canonical_url, publishedAt: d.published_at }, profilbezug: bezug
      };
      const ziel = /\bNachbesserungen\b/iu.test(text) ? "Nachbesserungen" : [...text.matchAll(new RegExp(schritt.source, "giu"))].at(-1)?.[1];
      if (!ziel || !ankuendigung.test(text) || /\b(?:nicht|kein\w*|könnte|würde|vielleicht|möglicherweise)\b/iu.test(text)) continue;
      // Kein gemischter Termin-/Ankündigungsabsatz als automatischer Zeitbeleg.
      if ([...text.matchAll(/\b(?:20\d{2}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.20\d{2})\b/g)].length > 1) continue;
      const tag = datum(text);
      if (!tag && /\b(?:20\d{2}|\d{1,2}\.\d{1,2}\.|morgen|gestern|nächste\w*|kommende\w*)\b/iu.test(text)) continue;
      if (tag && (tag < heute || Date.parse(tag) - Date.parse(heute) > TAGE * 864e5)) continue;
      // Uhrzeiten ohne eindeutige Zone sind kein automatischer Tagesauftrag.
      if (/\b\d{1,2}(?:[.:]\d{2})?\s*Uhr\b/iu.test(text)) continue;
      const quelleTag = berlinTagKey(new Date(d.published_at));
      const terminiert = Boolean(tag);
      return {
        art: terminiert ? "bevorstehender-schritt" : "angekuendigter-schritt",
        documentIds: [d.id],
        text: `${bezug.satz} ${terminiert
          ? `Vorbereitung für den quellenbelegten Verfahrensschritt am ${tag}.`
          : `Die Ankündigung vom ${quelleTag} gibt Anlass, den weiteren Verfahrensstand zu prüfen. Ein Termin und die inzwischen erfolgte Umsetzung sind im gespeicherten Beleg nicht bestätigt.`}`,
        recommendation: terminiert
          ? `Prüfen Sie die Unterlagen zum angekündigten Verfahrensschritt am ${tag} und halten Sie die für Ihr Mandat offenen Fragen fest.`
          : ziel.toLowerCase() === "nachbesserungen"
            ? "Prüfen Sie, ob die angekündigten Nachbesserungen inzwischen vorliegen, und halten Sie die offenen Punkte für die weitere Beratung fest."
            : "Prüfen Sie den Stand des angekündigten Verfahrensschritts und halten Sie die offenen Punkte für die weitere Beratung fest.",
        beleg: { documentId: d.id, text, url: d.url || d.canonical_url, publishedAt: d.published_at },
        ...(tag ? { termin: tag } : {}),
        profilbezug: bezug
      };
    }
  }
  return null;
}
module.exports = { vorwahl, belege };
