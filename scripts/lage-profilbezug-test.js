"use strict";

// Fachliche Sollfälle vor dem Lauf; echter Lagepfad, nur die Speichergrenze
// ersetzt. Kein Netz, kein Modell, keine Profilanlage und keine Schreibrechte.
const A = require("node:assert/strict");
const P = require("../lib/helmut/lage-profilbezug");
const L = require("../lib/helmut/lage");
const M = require("../lib/helmut/matching");
const storage = require("../lib/helmut/storage");
const ai = require("../lib/helmut/ai");
const F = (() => {

// Ausschliesslich lokale Szenarien, keine Bestandsprofile oder echten Artikel.
const profile = {
  id: "lokal-industrie", fullName: "Lokale Fachperson", party: "Testpartei Alpha",
  parliamentType: "Bundestag", politicalLevel: "Bund",
  committees: ["Ausschuss für Arbeit und Soziales"],
  deputyCommittees: ["Ausschuss für Digitales und Staatsmodernisierung"],
  focusTopics: ["Industriearbeitsplätze"], reportingTopics: ["Betriebsratswahlen"],
  constituency: "Testkreis Nord", state: "Niedersachsen"
};
function ko(id, headline, extra = {}) {
  return { id: "ko-" + id, vorgang_id: "vg-" + id, status: "neu",
    understanding_status: "complete", decision_level: "bund", headline,
    was_ist_passiert: headline, best_source_url: "https://example.org/" + id,
    updated_at: "2026-11-07T08:00:00Z", ...extra };
}
const positive = [
  ko("arbeit", "Bundestag berät das Tariftreuegesetz zur Stärkung der Tarifbindung"),
  ko("industrie", "Industriebetrieb kündigt Abbau von Arbeitsplätzen an"),
  ko("indirekt", "Hohe Energiepreise belasten Industriebetriebe und gefährden Arbeitsplätze"),
  ko("digital", "Digitale Verwaltung: Gesetzentwurf zur Staatsmodernisierung vorgestellt"),
  ko("region", "Im Testkreis Nord wird eine Bahnverbindung eingestellt"),
  ko("aufgabe", "Neue Regeln zu Betriebsratswahlen vorgeschlagen")
];
const negative = [
  ko("partei", "Testpartei Alpha wählt eine neue Parteispitze", { parteien: ["Testpartei Alpha"] }),
  ko("allgemein", "Regierung kündigt politisch wichtiges Reformpaket an"),
  ko("wort", "Wissenschaftler veröffentlichen ihre Arbeit über die Entstehung von Galaxien"),
  ko("oel", "Ölpreis erhöht private Heizkosten"),
  ko("kunst", "Museum präsentiert neue Ausstellung zur Barockmalerei"),
  ko("falschergrund", "Sternwarte eröffnet Ausstellung über Jupiter und Saturn", {
    warum_wichtig: "Wichtig für Industriearbeitsplätze und den Ausschuss für Arbeit und Soziales.",
    why_relevant: "Betrifft die Betriebsratswahlen im Testkreis Nord.",
    handlungsempfehlung: "Tarifbindung und Arbeitsplätze vorbereiten." })
];
const profiles = [
  { id: "lokal-pflege", parliamentType: "Bundestag", politicalLevel: "Bund",
    committees: ["Ausschuss für Gesundheit"], focusTopics: ["Pflegeversicherung"] },
  { id: "lokal-wohnen", parliamentType: "Abgeordnetenhaus", politicalLevel: "Land", state: "Berlin",
    committees: ["Ausschuss für Stadtentwicklung, Bauen und Wohnen"], focusTopics: ["Mietrecht"] },
  { id: "lokal-landwirtschaft", parliamentType: "Landtag", politicalLevel: "Land", state: "Brandenburg",
    committees: ["Ausschuss für Landwirtschaft"], focusTopics: ["Landwirtschaft"] }
];
const different = [
  ko("pflege", "Pflegeversicherung: Beratung zur Finanzierung der Pflegeversicherung"),
  ko("wohnen", "Neue Regeln zum Mietrecht bei der Wohnungsvermietung vorgestellt", { decision_level: "land" }),
  ko("landwirtschaft", "Landwirtschaft: Agrarbetriebe beraten die Förderung der Landwirtschaft", { decision_level: "land" })
];
return { profile, ko, positive, negative, profiles, different };
})();
const metadata = require("./fixtures/lage-quellenmetadaten");
const wind = require("./fixtures/lage-windenergie-original-20261107.json");
const original = JSON.stringify(F);
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
const id = k => k.id;

const names = ["v3StoreReady", "listKnowledgeObjects", "listKnowledgeObjectsByIds", "listMatchingResults",
  "listAktuelleLageQuellen", "getSourcesForVorgang", "getRenderedBriefingV3", "acquirePipelineLock",
  "releasePipelineLock", "canSpendLlmForTenant", "saveRenderedBriefingV3", "insertRenderedBriefingV3"];
const saved = Object.fromEntries(names.map(n => [n, storage[n]]));
const originalAi = ai.generateLageBriefing;
let forbidden = 0;
const deny = () => { forbidden++; throw new Error("Modell oder Schreiben unzulaessig"); };
const fresh = new Date(Date.now() - 3600000).toISOString();
function doc(ko, suffix = "", title = ko.headline) {
  return { id: "d-" + ko.id + suffix, title,
    summary: title + ". Der benannte Vorschlag wird beraten.",
    url: ko.best_source_url + suffix, published_at: fresh, source_name: "Lokale Testquelle" };
}
function setup(profile, pool, { matches = null, docs = null } = {}) {
  forbidden = 0;
  const sourceMap = docs || Object.fromEntries(pool.map(k => [k.vorgang_id, [doc(k)]]));
  storage.v3StoreReady = () => true;
  storage.listKnowledgeObjects = async () => pool;
  storage.listKnowledgeObjectsByIds = async ids => pool.filter(k => ids.includes(k.id));
  storage.listMatchingResults = async args => {
    A.equal(args.userId, profile.id, "Lesung bleibt an angefragtes Profil gebunden");
    return matches || pool.slice(0, 12).map(k => ({ knowledge_object_id: k.id }));
  };
  storage.getSourcesForVorgang = async vg => sourceMap[vg] || [];
  storage.listAktuelleLageQuellen = metadata(pool, vg => sourceMap[vg] || []);
  storage.getRenderedBriefingV3 = async userId => { A.equal(userId, profile.id); return null; };
  for (const name of names.slice(7)) storage[name] = deny;
  ai.generateLageBriefing = deny;
  return sourceMap;
}

(async () => {
  try {
    await test("Originale Windenergieanhoerung behaelt den quellenbelegten Stellvertretungsbezug", async () => {
      const profile = { ...wind.profile, id: "lokal-original-wind", parliamentType: "Bundestag" };
      const ko = wind.knowledgeObject;
      A.equal(P.bewerte(ko, profile).passt, true);
      const linked = { [ko.vorgang_id]: wind.sources };
      const confirmed = P.mitQuellenbezug([ko], profile, linked);
      A.equal(confirmed.length, 1);
      A.deepEqual(confirmed[0].relevanz_erklaerung.belege.map(b => b.art), ["stellvertretung"]);
      // Nur die fehlende Quellenzeit wird fuer die isolierte Aktualitaetspruefung
      // lokal gesetzt. Sachverhalt, Originalauszug und Quellenkante bleiben original.
      const docs = { [ko.vorgang_id]: wind.sources.map(d => ({ ...d, published_at: fresh })) };
      setup(profile, [ko], { docs });
      const out = await L.buildLageBriefing(profile, { cacheOnly: true });
      A.deepEqual(out.vorgaenge.map(k => k.vorgangId), [ko.vorgang_id]);
      A.equal(forbidden, 0);
    });
    await test("Direkter Ausschussbezug traegt weitere Energiethemen und andere gespeicherte Ausschuesse", async () => {
      const name = wind.expected.profilGrundWert;
      const profile = { id: "lokal-energie", deputyCommittees: [name], parliamentType: "Bundestag" };
      const pool = ["Windenergie auf See", "Photovoltaik auf Daechern", "Batteriespeicher"]
        .map((thema, i) => F.ko("energie-ausschuss-" + i, "Anhörung im Ausschuss für Wirtschaft und Energie zu " + thema));
      // Keine dieser Sachhandlungen braucht eine Erweiterung der Fachwortliste.
      for (const ko of pool) {
        const deputy = P.bewerte(ko, profile), primary = P.bewerte(ko, { committees: [name] });
        A.equal(deputy.gewicht, 50); A.equal(primary.gewicht, 80);
      }
      setup(profile, pool);
      A.deepEqual(new Set((await L.buildLageBriefing(profile, { cacheOnly: true })).vorgaenge.map(c => c.vorgangId)),
        new Set(pool.map(k => k.vorgang_id)));
      for (const [committee, text] of [
        ["Wirtschaft und Energie", "Anhörung des Ausschusses für Wirtschaft und Energie zu Windkraft"],
        ["Finanzausschuss", "Der Finanzausschuss berät den Jahresbericht"],
        ["Ausschuss für Gesundheit", "Der Ausschuss für Gesundheit berät den Jahresbericht"],
        ["Ausschuss für Meeresfragen", "Der Ausschuss für Meeresfragen berät den Jahresbericht"]
      ]) A.equal(P.bewerte(F.ko("ausschuss-allgemein", text), { committees: [committee] }).passt, true, committee);
      A.equal(forbidden, 0);
    });
    await test("Ausschussnachweis bleibt sachlich und quellengebunden; gemeinsame Woerter genuegen nicht", async () => {
      const profile = { id: "lokal-energie-negativ", ...wind.profile, parliamentType: "Bundestag" };
      for (const text of ["Ein Verein diskutiert über Wirtschaft und Energie", "Im Ausschuss für Kultur geht es um Windenergie",
        "Ausschuss für Wirtschaft und Energiekunde berät den Jahresbericht", "Beim Sportfest weht Wind auf der Tribüne"]) {
        A.equal(P.bewerte(F.ko("ohne-ausschuss", text), profile).passt, false, text);
      }
      for (const committee of ["Haushalt", "Haushaltsausschuss", "Ausschuss für Haushalt"]) {
        A.equal(P.bewerte(F.ko("privathaushalt", "Private Haushalte kaufen neue Möbel"), { committees: [committee] }).passt, false);
      }
      const ko = wind.knowledgeObject;
      const wrong = { [ko.vorgang_id]: [doc(ko, "", "Ein Verein diskutiert über Wirtschaft und Energie")] };
      A.deepEqual(P.mitQuellenbezug([ko], profile, wrong), []);
      setup(profile, [ko], { docs: wrong });
      A.deepEqual((await L.buildLageBriefing(profile, { cacheOnly: true })).vorgaenge, []);
      const proseOnly = F.ko("ausschuss-nur-prosa", "Anhörung zur Windenergie auf See", {
        warum_wichtig: ko.was_ist_passiert, why_relevant: ko.was_ist_passiert, policy_field: ["Wirtschaft"] });
      A.equal(P.bewerte(proseOnly, profile).passt, false);
      A.equal(P.bewerte(ko, { committees: ["Verteidigungsausschuss"] }).passt, false,
        "Historischer Verteidigungsteil wird nicht unter dem korrigierten Windenergieauszug wiederbelebt");
      A.equal(forbidden, 0);
    });
    await test("Hauptfach, konkrete Aufgabe, Stellvertretung, Region und indirekte Industriewirkung bleiben erhalten", () => {
      for (const ko of F.positive) {
        const result = P.bewerte(ko, F.profile);
        A.equal(result.passt, true, ko.headline);
        A(result.gewicht > 0 && result.belege.length > 0, ko.id);
        A(result.erklaerung.satz.trim().length > 0, "Aufnahme hat nachvollziehbaren Grund");
      }
    });
    await test("Partei, allgemeine Wichtigkeit, zufaellige Woerter und alte Relevanzprosa tragen keine Aufnahme", () => {
      for (const ko of F.negative) A.equal(P.bewerte(ko, F.profile).passt, false, ko.headline);
      A.equal(P.bewerte(F.positive[0], {}).passt, false);
    });
    await test("Hauptzustaendigkeit zaehlt mehr als dieselbe Stellvertretung und bleibt getrennt erklaert", () => {
      const ko = F.positive.find(k => k.id === "ko-digital");
      const primary = { committees: F.profile.deputyCommittees };
      const deputy = { deputyCommittees: F.profile.deputyCommittees };
      const a = P.bewerte(ko, primary), b = P.bewerte(ko, deputy);
      A(a.passt && b.passt); A(a.gewicht > b.gewicht);
      A.notDeepEqual(a.belege, b.belege, "Stellvertretung ist keine ordentliche Mitgliedschaft");
    });
    await test("Konkrete Aufgabe ist staerker als allgemeines Fachthema, enger Wahlkreis staerker als Bundesland", () => {
      const topic = F.positive.find(k => k.id === "ko-aufgabe");
      A(P.bewerte(topic, { reportingTopics: ["Betriebsratswahlen"] }).gewicht
        > P.bewerte(topic, { focusTopics: ["Betriebsratswahlen"] }).gewicht);
      const regional = F.ko("regional", "Eine Bahnverbindung in Niedersachsen entfällt");
      A(P.bewerte(F.positive.find(k => k.id === "ko-region"), { constituency: "Testkreis Nord" }).gewicht
        > P.bewerte(regional, { state: "Niedersachsen" }).gewicht);
    });
    await test("Industrieenergie wird als indirekter Bezug erhalten, private Heizkosten bleiben ohne Fachbezug", () => {
      const p = { focusTopics: ["Industriearbeitsplätze"] };
      const indirect = P.bewerte(F.positive.find(k => k.id === "ko-indirekt"), p);
      A.equal(indirect.passt, true); A.equal(indirect.gewicht, 60);
      A.equal(P.bewerte(F.negative.find(k => k.id === "ko-oel"), p).passt, false);
    });
    await test("Drei verschiedene lokale Profile erhalten jeweils ihren fachlichen Solltreffer", () => {
      F.profiles.forEach((profile, i) => {
        const rows = P.auswahl(F.different, profile);
        A(rows.some(k => k.id === F.different[i].id), profile.id);
        A(!rows.some(k => k.id === F.different[(i + 1) % 3].id), "kein fremdes Fachfeld: " + profile.id);
      });
    });
    await test("Fachthemen ohne Hauptausschuss erhalten Singular, Rentenpaket und regionale Brancheninteressen", () => {
      for (const [profil, titel] of [
        [{ focusTopics: ["Rente"] }, "Bundestag beschließt Rentenpaket"],
        [{ focusTopics: ["Gewerkschaften"] }, "Gewerkschaft fordert höhere Löhne"],
        [{ regionalInterests: ["VW-Beschäftigte"] }, "VW Beschäftigte fordern eine Standortgarantie"]
      ]) A.equal(P.bewerte(F.ko("fachthema", titel), profil).passt, true, titel);
    });
    await test("Beschaeftigt sich, Handytarife und Pflege von Gruenflaechen sind keine Fachzustaendigkeit", async () => {
      const profile = { ...F.profile, committees: ["Arbeit und Soziales", "Gesundheit"], focusTopics: ["Pflege"] };
      const pool = ["Bundestag beschäftigt sich mit einem Astronomieprojekt", "Neue Tarife für Handytarife",
        "Pflege der Parkanlagen wird künftig neu organisiert", "Die Pflege von Software wird verbessert"]
        .map((titel, i) => F.ko("mehrdeutig-" + i, titel));
      for (const ko of pool) A.equal(P.bewerte(ko, profile).passt, false, ko.headline);
      setup(profile, pool);
      A.deepEqual((await L.buildLageBriefing(profile, { cacheOnly: true })).vorgaenge, []);
      A.equal(forbidden, 0);
    });
    await test("Finanz- und Verteidigungsprofile unterscheiden Fachaufgaben von technischen und akademischen Worttreffern", async () => {
      for (const [profile, fremd, passend] of [
        [{ id: "lokal-finanzen", committees: ["Finanzausschuss"] },
          "Ein Institut entwickelt die Steuerung einer Fertigungsanlage", "Bundestag berät eine Einkommensteuerreform und höhere Steuern"],
        [{ id: "lokal-verteidigung", committees: ["Verteidigungsausschuss"], focusTopics: ["Verteidigung"] },
          "Eine Universität regelt die Verteidigung einer Dissertation", "Bundeswehr: Neue Regeln zum Wehrdienst vorgelegt"]
      ]) {
        const pool = [F.ko("wortfremd", fremd), F.ko("fachlich", passend)]; setup(profile, pool);
        A.equal(P.bewerte(pool[0], profile).passt, false, fremd);
        const weiteres = profile.id === "lokal-finanzen" ? "Bundesregierung erhöht die Steuern"
          : "Die Bundesregierung stärkt die Verteidigung";
        A.equal(P.bewerte(F.ko("weiterer-solltreffer", weiteres), profile).passt, true, weiteres);
        const out = await L.buildLageBriefing(profile, { cacheOnly: true });
        A.deepEqual(out.vorgaenge.map(k => k.vorgangId), [pool[1].vorgang_id]);
        A.equal(forbidden, 0);
      }
      for (const [thema, titel] of [["Verteidigung von Dissertationen", "Eine Universität regelt die Verteidigung einer Dissertation"],
        ["Pflege von Parkanlagen", "Pflege der Parkanlagen wird künftig neu organisiert"]]) {
        const profile = { id: "lokal-konkrete-fachaufgabe", reportingTopics: [thema] }, ko = F.ko("konkrete-aufgabe", titel);
        setup(profile, [ko]);
        A.equal((await L.buildLageBriefing(profile, { cacheOnly: true })).vorgaenge.length, 1, thema);
      }
    });
    await test("Profilhash bindet Hauptfach, Stellvertretung, Fachthema, Aufgabe und Region", () => {
      const hash = P.hashProfil(F.profile);
      for (const key of ["committees", "deputyCommittees", "focusTopics", "reportingTopics", "constituency", "state"]) {
        const changed = structuredClone(F.profile); changed[key] = Array.isArray(changed[key]) ? ["Anderer Fachwert"] : "Andere Region";
        A.notEqual(P.hashProfil(changed), hash, key);
      }
      const ko = F.positive[0];
      A.notEqual(L.hashKoSet([{ ...ko, ko_version: 1 }]), L.hashKoSet([{ ...ko, ko_version: 2 }]));
    });
    await test("Auswahl erstellt neue Profilzuordnungen ohne globale Wissensobjekte zu veraendern", () => {
      const pool = [...F.negative, ...F.positive]; const before = JSON.stringify(pool);
      const rows = P.auswahl(pool, F.profile);
      A.deepEqual(new Set(rows.map(id)), new Set(F.positive.map(id)));
      A(rows.every(k => !pool.includes(k) && k.relevanz_erklaerung?.satz));
      A.equal(JSON.stringify(pool), before); A.equal(JSON.stringify(F), original);
    });
    await test("Passender Kandidat nach zwoelf Fehlkandidaten erreicht die reale Auswahl vor dem Limit", async () => {
      const wrong = Array.from({ length: 12 }, (_, n) => F.ko("fremd-" + n, "Museum eröffnet Ausstellung zur Barockmalerei"));
      const wanted = F.positive[0], pool = [...wrong, wanted]; setup(F.profile, pool);
      const rows = await L.loadRankedVorgaenge(storage, M.matchProfileToKnowledgeObjects, F.profile, F.profile.id);
      A.deepEqual(rows.map(id), [wanted.id]);
      A.equal(forbidden, 0);
    });
    await test("Teilweise Vektortreffer duerfen fachlich zugelassene indirekte Treffer nicht entfernen", async () => {
      const pool = [F.positive[0], F.positive[2]]; setup(F.profile, pool);
      const rows = await L.loadRankedVorgaenge(storage, () => [{ knowledge_object_id: pool[0].id }], F.profile, F.profile.id);
      A.deepEqual(new Set(rows.map(id)), new Set(pool.map(id)));
    });
    await test("Veraltete gespeicherte Profilerklaerung erfindet keinen aktuellen Bezug", async () => {
      const wrong = { ...F.negative.find(k => k.id === "ko-falschergrund"), ko_version: 2 };
      setup(F.profile, [wrong], { matches: [{ knowledge_object_id: wrong.id, user_id: F.profile.id,
        profil_hash: "veralteter-profilhash", ko_version: 1,
        matched_features: ["ausschuss:Arbeit und Soziales"], signale: { ausschuss: ["Arbeit und Soziales"] },
        begruendung: "Alter Ausschussbezug",
        relevanz_erklaerung: { satz: "Angeblich aktueller Schwerpunkt", belege: [{ art: "ausschuss", text: "Arbeit und Soziales" }] } }] });
      A.deepEqual(await L.loadRankedVorgaenge(storage, M.matchProfileToKnowledgeObjects, F.profile, F.profile.id), []);
    });
    await test("Fremde gespeicherte Matchzeile liefert weder Karte noch fremde Erklaerung", async () => {
      const wrong = F.negative[0];
      setup(F.profile, [wrong], { matches: [{ user_id: "anderes-lokales-profil", knowledge_object_id: wrong.id,
        relevanz_erklaerung: { satz: "FREMDER INHALT", belege: [] } }] });
      const out = await L.buildLageBriefing(F.profile, { cacheOnly: true });
      A.deepEqual(out.vorgaenge, []); A(!JSON.stringify(out).includes("FREMDER INHALT")); A.equal(forbidden, 0);
    });
    await test("Echte cacheOnly- und countOnly-Ausgabe behalten wichtige Treffer ohne fachfremde Auffuellung", async () => {
      const pool = [...F.negative, ...F.positive], before = JSON.stringify(pool);
      for (const opts of [{ cacheOnly: true }, { countOnly: true }]) {
        setup(F.profile, pool);
        const out = await L.buildLageBriefing(F.profile, opts);
        A.equal(out.available, true);
        A.deepEqual(new Set(out.vorgaenge.map(c => c.vorgangId)), new Set(F.positive.map(k => k.vorgang_id)));
        A.equal(out.vorgaenge.length, F.positive.length);
        A(out.vorgaenge.every(c => c.sources.length > 0)); A.equal(forbidden, 0);
      }
      A.equal(JSON.stringify(pool), before);
      console.log("Wichtige vorab definierte Solltreffer: " + F.positive.length + "; erhalten: " + F.positive.length + "; verloren: 0.");
    });
    await test("Fehlender Profilbezug ergibt im realen Ausgabepfad einen ehrlichen Leerzustand", async () => {
      const profile = { id: "lokal-ohne-fachkontext" }; setup(profile, [...F.positive, ...F.negative]);
      const out = await L.buildLageBriefing(profile, { cacheOnly: true });
      A.equal(out.available, false); A.deepEqual(out.vorgaenge, []); A.equal(forbidden, 0);
    });
    await test("Einzelne fachfremde Quelle und bloße Metadaten bestaetigen keine persoenliche Behauptung", async () => {
      const ko = F.positive[0];
      setup(F.profile, [ko], { docs: { [ko.vorgang_id]: [doc(ko, "/museum", "Museum eröffnet eine Ausstellung zur Barockmalerei")] } });
      const out = await L.buildLageBriefing(F.profile, { cacheOnly: true });
      A.deepEqual(out.vorgaenge, []); A.equal(forbidden, 0);
      const metadataOnly = { ...F.negative[4], policy_field: ["Pflegeversicherung"] };
      const pflege = F.profiles[0]; setup(pflege, [metadataOnly]);
      A.deepEqual((await L.buildLageBriefing(pflege, { cacheOnly: true })).vorgaenge, []);
    });
    await test("Nur quellenbestaetigte Gruende erscheinen, auch wenn das KO einen staerkeren Grund behauptet", () => {
      const ko = F.ko("doppelbezug", "Tariftreuegesetz und digitale Verwaltung");
      const rows = P.mitQuellenbezug([ko], F.profile, { [ko.vorgang_id]: [doc(ko, "", "Digitale Verwaltung modernisieren")] });
      A.equal(rows.length, 1);
      A(rows[0].relevanz_erklaerung.satz.includes("Stellvertretung"));
      A(!rows[0].relevanz_erklaerung.satz.includes("Hauptzuständigkeit"));
    });
    await test("Gleiche Vorgangsmenge verwendet Cache nur beim selben fachlichen Profilstand", async () => {
      const pool = [F.positive[0]], docs = setup(F.profile, pool);
      const Q = require("../lib/helmut/lage-quellenbeleg"), B = require("../lib/helmut/briefing-speicher");
      const input = Q.baueEingabe(pool, docs);
      const payload = { koSetHash: B.hash({ kos: L.hashKoSet(pool), profil: P.hashProfil(F.profile) }).slice(0, 32),
        quellenHash: Q.hashEingabe(input), quellenVersion: Q.VERSION,
        qualitaet: { version: require("../lib/helmut/lage-textqualitaet").VERSION },
        paragraphs: [{ text: pool[0].headline, vorgang_ids: [pool[0].vorgang_id],
          quellen_ids: [input[0].quellenbelege[0].quelle_id] }] };
      storage.getRenderedBriefingV3 = async () => ({ payload });
      A.equal((await L.buildLageBriefing(F.profile, { cacheOnly: true })).fromCache, true);
      const changed = { ...F.profile, reportingTopics: ["Arbeitszeit"] };
      const out = await L.buildLageBriefing(changed, { cacheOnly: true });
      A.equal(out.vorgaenge.length, 1); A.equal(out.fromCache, false); A.deepEqual(out.paragraphs, []);
      A.equal(forbidden, 0);
    });
    await test("Fachlich passender KO mit vermischten Quellen bleibt vor Karten und Text gesperrt", async () => {
      const profile = F.profiles[0], good = F.different[0], mixed = { ...good, id: "ko-mix", vorgang_id: "vg-mix" };
      const clean = [doc(good)], bad = [doc(good), doc(mixed, "/astronomie", "Sternwarte eröffnet Ausstellung über Jupiter und Saturn")];
      setup(profile, [mixed, good], { docs: { [good.vorgang_id]: clean, [mixed.vorgang_id]: bad } });
      const out = await L.buildLageBriefing(profile, { cacheOnly: true });
      A.deepEqual(out.vorgaenge.map(c => c.vorgangId), [good.vorgang_id]); A.equal(forbidden, 0);
    });
    A.equal(JSON.stringify(F), original);
    console.log(passed + "/" + passed + " Gruppen bestanden. Reale Modelle/Schreibversuche: " + forbidden + ".");
  } finally { Object.assign(storage, saved); ai.generateLageBriefing = originalAi; }
})().catch(error => { console.error(error); process.exitCode = 1; });
