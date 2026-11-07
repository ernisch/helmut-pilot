"use strict";

// Persönliche Aufnahmeprüfung, keine neue globale Artikelanalyse. Die begrenzte
// Fachwortliste beschreibt Zuständigkeitsräume, niemals einzelne Mandate.
// Unbekannte Fachbegriffe brauchen eine spezifische Phrase im Sachverhalt.
const { committeeMatchKey } = require("./matching");
const { hash } = require("./briefing-speicher");
const VERSION = 2;
const list = value => (Array.isArray(value) ? value : [value]).filter(v => typeof v === "string" && v.trim());
const norm = value => String(value || "").toLowerCase().normalize("NFKC")
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/[^a-z0-9]+/g, " ").trim();
const GENERISCH = new Set(("ausschuss fuer zur zum der die das und von im in des den dem ein eine mit auf an "
  + "arbeit soziales politik politisch politische bedeutung entwicklung wirtschaftlich wirtschaftliche "
  + "zusammenarbeit bundestag landtag bundesregierung vorhaben bereich allgemein staat deutschland").split(" "));
// Ausdrückliche Fachanker statt beliebiger gemeinsamer Wörter. Beispielsweise
// private Haushalte sind kein öffentlicher Haushalt, Entwicklung kein EZ-Bezug.
const FAECHER = {
  "arbeit-und-soziales": /\b(?:mindestlohn\w*|buergergeld\w*|renten\w*|rente|tarif(?:bindung|vertrag|vertraeg|lohn|loehn|treue|verhandlung|autonomie|abschluss|runde)\w*|arbeitsmarkt\w*|arbeitszeit\w*|arbeitsplatz\w*|arbeitsplaetz\w*|beschaeftigte(?:n|r)?|beschaeftigung(?:s\w*)?|arbeitslos\w*|arbeitsrecht\w*|arbeitsschutz\w*|kurzarbeit\w*|entlassung\w*|loehne|lohnpolitik\w*|gewerkschaft\w*|betriebsra\w*|sozialstaat\w*|sozialleist\w*|armut\w*|grundsicherung\w*)\b/,
  gesundheit: /\b(?:gesundheit\w*|pflege\w*|kranken\w*|arzt\w*|aerzt\w*|medizin\w*|kliniken|klinik|patient\w*)\b/,
  wirtschaft: /\b(?:industrie\w*|stahl(?:industrie|werk|erzeugung|produktion)\w*|wirtschaftspolitik\w*|konjunktur\w*|mittelstand\w*|energiepreis\w*|strompreis\w*|gaspreis\w*|netzentgelt\w*|energiewende\w*|energieversorgung\w*|unternehmensfoerder\w*)\b/,
  digitales: /\b(?:digital\w*|staatsmodernisierung\w*|datenschutz\w*|breitband\w*|glasfaser\w*|kuenstliche intelligenz|verwaltungsmodernisierung\w*)\b/,
  haushalt: /\b(?:bundeshaushalt\w*|landeshaushalt\w*|nachtragshaushalt\w*|haushaltsausschuss\w*|haushaltsentwurf\w*|schuldenbremse\w*|haushaltsgesetz\w*)\b|\b(?:bundestag|landtag|senat|bund|landesregierung)\b.{0,80}\bhaushalt\b/,
  finanzen: /\b(?:(?:einkommen|umsatz|erbschaft|vermoegen|grund|gewerbe|koerperschaft)steuer\w*|steuer(?:recht|reform|politik|einnahm|satz|saetz|senkung|erhoehung|freibetrag|betrug|hinterziehung|entlastung|gesetz)\w*|finanzmarkt\w*|banken\w*|bankenaufsicht\w*|finanzaufsicht\w*)\b|\b(?:hoehere|niedrigere|neue|sinkende|steigende)\s+steuern?\b|\b(?:erhoeht|senkt|erhebt)\s+(?:die\s+)?steuern\b/,
  wohnen: /\b(?:miet\w*|wohnung\w*|wohnungs\w*|wohnraum\w*|wohnungsbau\w*|staedtebau\w*)\b/,
  ernaehrung: /\b(?:landwirtschaft\w*|agrar\w*|landwirt\w*|ernaehrung\w*|acker\w*|tierhaltung\w*|lebensmittel\w*)\b/,
  verkehr: /\b(?:verkehr\w*|bahn\w*|schienen\w*|oepnv|autobahn\w*|bundesstrasse\w*)\b/,
  umwelt: /\b(?:klimaschutz\w*|naturschutz\w*|umweltschutz\w*|emission\w*|artenschutz\w*|hochwasser\w*)\b/,
  familie: /\b(?:familien\w*|kinder\w*|kita\w*|jugend\w*|schule\w*|schulen|bildung\w*)\b/,
  forschung: /\b(?:forschung\w*|raumfahrt\w*|wissenschaft\w*|technologie\w*)\b/,
  inneres: /\b(?:polizei\w*|asyl\w*|migration\w*|verfassungsschutz\w*|katastrophenschutz\w*|innere sicherheit)\b/,
  recht: /\b(?:strafrecht\w*|zivilrecht\w*|justiz\w*|mietrecht\w*|verbraucherschutz\w*)\b/,
  verteidigung: /\b(?:bundeswehr\w*|ruestung\w*|militaer\w*|verteidigung(?:spolitik|sministerium|sausgaben|shaushalt|setat|sbudget|sausschuss|sfaehigkeit|sbuendnis|sfall)\w*|wehrdienst\w*)\b|\b(?:bundesregierung|bundestag|nato)\b.{0,80}\bverteidigung\b/,
  auswaertiges: /\b(?:aussenpolitik\w*|diplomatie\w*|friedensverhandlung\w*)\b/,
  entwicklung: /\b(?:entwicklungszusammenarbeit\w*|entwicklungshilfe\w*|humanitaere hilfe)\b/,
  menschenrechte: /\b(?:menschenrecht\w*|humanitaere hilfe|folter\w*)\b/,
  petitionen: /\bpetition\w*\b/,
  kultur: /\b(?:kultur\w*|medienpolitik\w*|pressefreiheit\w*|rundfunk\w*|filmfoerder\w*)\b/,
  europa: /\b(?:eu recht|eu verordnung\w*|eu richtlinie\w*|europaeische integration)\b/,
  sport: /\b(?:sportfoerder\w*|sportverein\w*|olympia\w*)\b/,
  tourismus: /\b(?:tourismus\w*|reisebranche\w*)\b/
};
const FACHTHEMEN = {
  rente: /\brenten?\w*\b/, pflege: /\bpflege\w*\b/,
  industriearbeitsplaetze: /\bindustriearbeitsplaetz\w*\b/
};
function kontext(p = {}) {
  return {
    haupt: list(p.committees || p.ausschuesse || p.committee),
    stellvertretung: list(p.deputyCommittees || p.stellvertretende_ausschuesse),
    aufgabe: list(p.reportingTopics || p.berichterstatter_themen),
    thema: list(p.focusTopics || p.fachpolitische_schwerpunkte || p.topics),
    wahlkreis: list(p.constituency || p.wahlkreis),
    region: list(p.state || p.bundesland),
    regionaleThemen: list(p.regionalTopics || p.regionale_themen),
    interessen: list(p.regionalInterests || p.regionale_interessen),
    ebene: p.parliamentType || p.politische_ebene || p.politicalLevel || null,
    prioritaeten: p.topicPriorities || {}
  };
}
function hashProfil(p) { return hash({ version: VERSION, kontext: kontext(p) }); }
function spezifisch(wert, text) {
  const phrase = norm(wert);
  const tokens = phrase.split(" ").filter(w => w.length >= 2 && !GENERISCH.has(w));
  if (!tokens.length) return null;
  // Kein künstlicher Bezug über ein einziges gemeinsames Wort einer langen
  // Profilbeschreibung. Zusammengesetzte Wahlkreisnamen dürfen einzeln treffen.
  const stamm = w => w.length >= 7 ? w.replace(/(?:ern|en|er|es|e|s)$/, "") : w;
  const woerter = text.split(/\W+/).map(stamm);
  if (tokens.every(w => woerter.includes(stamm(w)))) return phrase;
  return null;
}
function direkterAusschuss(wert, felder) {
  // Die gespeicherte Bezeichnung muss als zusammenhaengender Ausschussname
  // im Sachtext stehen. Einzelne Fachwoerter wie Haushalt reichen hier nicht.
  const name = norm(wert);
  if (!name) return null;
  const muster = /ausschuss/.test(name)
    ? name.replace(/ausschuss\b/g, "ausschuss(?:es)?")
    : "ausschuss(?:es)? fuer " + name;
  return felder.map(t => new RegExp("\\b" + muster + "\\b").exec(t)?.[0]).find(Boolean) || null;
}
function bewerte(ko = {}, profile = {}) {
  const p = kontext(profile);
  // Keine Empfehlungen, allgemeine Wichtigkeit, Partei oder Quellennamen.
  const originalfelder = [ko.headline, ko.was_ist_passiert, ko.wer_ist_betroffen].filter(Boolean).map(norm);
  const sachfelder = originalfelder
    // Mehrdeutige Wörter allein sind keine Fachaufgabe. Dies betrifft auch
    // wörtlich passende Quellen, nicht nur zufällige technische Vektortreffer.
    .map(t => t.replace(/\bpflege\s+(?:(?:der|von|des|einer|eines|den)\s+){0,2}(?:park\w*|garten\w*|gruenanlag\w*|software\w*|daten\w*|landschaft\w*)\b/g, " "))
    .map(t => t.replace(/\bverteidigung\s+(?:(?:der|von|des|einer|eines|den)\s+){0,2}(?:dissertation\w*|doktorarbeit\w*|abschlussarbeit\w*|masterarbeit\w*|thesis)\b/g, " "));
  // Explizite mehrteilige Fachaufgaben behalten ihren vollständigen Kontext:
  // etwa eine wissenschaftliche Aufgabe zu Dissertationen statt Militärpolitik.
  const direkt = wert => (norm(wert).split(" ").filter(w => w.length >= 2 && !GENERISCH.has(w)).length > 1
    ? originalfelder : sachfelder).map(t => spezifisch(wert, t)).find(Boolean);
  const sachtext = sachfelder.join(" . ");
  const analysen = [...list(ko.policy_field), ...list(ko.tags)].map(norm);
  const belege = [];
  const add = (art, wert, gewicht, anknuepfung) => belege.push({ art, wert, gewicht, anknuepfung });
  const pruefe = (art, werte, gewicht, ausschuss = false) => {
    for (const wert of werte) {
      const key = committeeMatchKey(wert);
      let anker = null;
      if (ausschuss) {
        // Fachanker und ausdruecklicher Ausschussname sind additive Nachweise.
        // Dieselbe Pruefung muss anschliessend auch der Originalquelle gelingen.
        anker = FAECHER[key]?.exec(sachtext)?.[0] || null;
        if (!anker) anker = direkterAusschuss(wert, originalfelder);
        if (!anker && !FAECHER[key]) anker = direkt(wert);
      } else {
        anker = direkt(wert);
        if (!anker) anker = FACHTHEMEN[norm(wert)]?.exec(sachtext)?.[0] || null;
        if (!anker && FAECHER[key] && norm(wert).split(" ").length <= 4)
          anker = FAECHER[key].exec(sachtext)?.[0] || null;
      }
      // Vorhandene strukturierte Fachanalyse darf eine passende Sachhandlung
      // erschließen, aber keine generische Einordnung allein veröffentlichen.
      if (!anker && sachtext && analysen.some(t => t === norm(wert))
        && !GENERISCH.has(norm(wert))) anker = norm(wert);
      if (anker) add(art, wert, gewicht, anker);
    }
  };
  pruefe("aufgabe", p.aufgabe, 100);
  pruefe("haupt", p.haupt, 80, true);
  pruefe("thema", [...p.thema, ...p.regionaleThemen], 75);
  // Konkrete regionale Fachinteressen bleiben von der Hauptzuständigkeit
  // getrennt. Parteien und allgemeine Orts-/Quellenmetadaten stehen hier nie.
  for (const wert of p.interessen) {
    const anker = direkt(wert);
    if (anker) add("interesse", wert, 45, anker);
  }
  pruefe("stellvertretung", p.stellvertretung, 50, true);
  // Region nur aus Sachverhalt/Betroffenen, niemals Verlag oder Sitz der Quelle.
  for (const [art, werte, gewicht] of [["wahlkreis", p.wahlkreis, 70], ["region", p.region, 30]]) {
    for (const wert of werte) {
      const teile = wert.split(/[-–]/).map(v => v.trim()).filter(v => norm(v).length >= 5);
      const anker = sachfelder.flatMap(t => teile.map(v => spezifisch(v, t))).find(Boolean);
      if (anker) add(art, wert, gewicht, anker);
    }
  }
  // Indirekte Wirkung braucht BEIDE Enden im selben Sachfeld: Energiekosten
  // UND konkrete industrielle Betroffenheit. Keine freie Assoziationskette.
  const industrie = [...p.thema, ...p.aufgabe, ...p.interessen].find(v => /industriearbeitsplaetz|stahlindustrie|industrie.*beschaeftig/.test(norm(v)));
  if (industrie && sachfelder.some(t => /\b(?:energiepreis\w*|strompreis\w*|gaspreis\w*|energiekosten\w*|netzentgelt\w*)\b/.test(t)
    && /\b(?:industrie\w*|stahlwerk\w*|produktionsbetrieb\w*|produzierende\w*)\b/.test(t)))
    add("indirekt", industrie, 60, "Energiekosten für Industriebetriebe");
  return ergebnis(belege);
}
function ergebnis(belege) {
  belege.sort((a,b) => b.gewicht - a.gewicht);
  const erster = belege[0];
  const labels = { haupt: "Deine Hauptzuständigkeit", stellvertretung: "Deine Stellvertretung", aufgabe: "Deine konkrete Fachaufgabe",
    thema: "Dein Fachthema", interesse: "Dein regionales Fachinteresse", wahlkreis: "Dein Wahlkreis", region: "Dein Bundesland", indirekt: "Indirekter Bezug zu deinem Schwerpunkt" };
  return { passt: Boolean(erster), gewicht: erster?.gewicht || 0, belege,
    erklaerung: erster ? { satz: `${labels[erster.art]} „${erster.wert}“: ${erster.anknuepfung}.`,
      belege: belege.slice(0, 4).map(b => ({ art: b.art, text: `${labels[b.art]}: ${b.wert} (${b.anknuepfung})` })) } : null };
}
function auswahl(kos, profile) {
  return kos.map((ko, index) => ({ ko, index, bezug: bewerte(ko, profile) })).filter(r => r.bezug.passt)
    .sort((a,b) => b.bezug.gewicht - a.bezug.gewicht || a.index - b.index)
    .map(r => ({ ...r.ko, relevanz_erklaerung: r.bezug.erklaerung }));
}
function mitQuellenbezug(kos, profile, sources) {
  return kos.flatMap(ko => {
    const kriterien = bewerte(ko, profile).belege;
    const quellenBelege = (sources[ko.vorgang_id] || []).map(raw => require("./quellen-auszug").geleseneQuelle(raw))
      .flatMap(d => bewerte({ headline: d.title,
        was_ist_passiert: require("./quellen-auszug").institutionellerMetatext(d.summary) ? "" : d.summary }, profile).belege)
      .filter(b => kriterien.some(k => k.art === b.art && k.wert === b.wert));
    const bezug = ergebnis(quellenBelege);
    return bezug.passt ? [{ ...ko, relevanz_erklaerung: bezug.erklaerung }] : [];
  });
}
module.exports = { VERSION, bewerte, auswahl, hashProfil, mitQuellenbezug };
