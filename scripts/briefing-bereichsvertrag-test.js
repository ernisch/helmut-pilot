"use strict";
const assert = require("node:assert/strict");
const B = require("../lib/helmut/briefing-bereichsvertrag");
const R = require("../lib/helmut/radarState");
const C = require("../lib/helmut/briefingContract");
const L = require("../lib/helmut/lage");
const F = require("../lib/helmut/briefing-fachurteil");
const now = new Date("2026-09-24T10:00:00Z");
const profile = { id: "abgrenzung-synthetisch", fullName: "Alex Beispiel", party: "Testpartei", committees: [], topics: ["Verkehr"], focusTopics: ["Verkehr"] };
const doc = (id, day, extra = {}) => ({ id, url: `https://example.org/bericht/${id}`, title: "Alex Beispiel spricht über Verkehr",
  summary: "Alex Beispiel spricht über den Vorschlag zum Verkehr.", published_at: `${day}T08:00:00Z`, source_type: "media", ...extra });
const ko = (id = "a") => ({ id: `ko-${id}`, vorgang_id: `vg-${id}`, status: "neu", understanding_status: "complete",
  display_title: "Vorschlag zum Verkehr", display_summary: "Ein neuer Vorschlag zum Verkehr liegt vor.",
  was_ist_passiert: "Ein neuer Vorschlag zum Verkehr liegt vor.", why_relevant: "Der Vorschlag betrifft den Verkehr im Wahlkreis.",
  warum_wichtig: "Für den Wahlkreis relevant.", recommendation: "Die Auswirkungen für den Wahlkreis prüfen.",
  handlungsempfehlung: "Die Auswirkungen für den Wahlkreis prüfen.", mentioned_people: [profile.fullName],
  created_at: "2026-09-20T08:00:00Z", updated_at: now.toISOString(), source_document_count: 200, confidence_score: 90 });
const decision = k => ({ knowledge_object_id: k.id, vorgang_id: k.vorgang_id, score: 70, decision: "Sofort reagieren", matched_features: [] });
const input = (ks, sources) => ({ profile, now, decisions: ks.map(decision), kosById: Object.fromEntries(ks.map(k => [k.id, k])),
  knowledgeObjects: ks, sourcesByVorgang: sources });
let count = 0;
const test = (name, fn) => { fn(); count++; console.log(`PASS ${name}`); };
test("Lage behält Sachstand; neue Quelle und globale Empfehlung sind noch kein persönlicher Auftrag", () => {
  const k = ko(), ds = [doc("a", "2026-09-24")];
  const card = L.koToVorgangCard(k, ds, now);
  const b = C.toBriefingContractV3(input([k], { "vg-a": ds }));
  assert.equal(card.displaySummary, k.display_summary);
  assert.equal(b.currentHelmutState.primaryVorgangId, null);
  assert.equal(b.currentHelmutState.recommendation, "");
  assert.equal(b.currentHelmutState.whyItMatters, "");
  assert.equal(b.items[0].recommendedAction, k.recommendation);
  assert.deepEqual(B.tagesAnlass(ds, now).documentIds, ["a"]);
});
test("Reprocessing und hoher Score machen alte Quellen nicht zur Tagespriorität", () => {
  const b = C.toBriefingContractV3(input([ko()], { "vg-a": [doc("alt", "2026-09-01")] }));
  assert.equal(b.currentHelmutState.status, "empty");
  assert.equal(b.currentHelmutState.primaryVorgangId, null);
});
test("Vorabend ist im heutigen Standardfenster zulässig", () => {
  assert.ok(B.tagesAnlass([doc("abend", "2026-09-23", { published_at: "2026-09-23T20:00:00Z" })], now));
});
test("Undatierte und zukünftige Quellen sind kein Tagesbeleg", () => {
  assert.equal(B.tagesAnlass([doc("zukunft", "2026-09-25"), doc("ohne", "2026-09-24", { published_at: null })], now), null);
});
test("Identischer Vorgang und identischer Artikel erscheinen im Briefing nur einmal", () => {
  const a = ko(), b = ko("b"), c = { ...ko("c"), vorgang_id: "vg-a" };
  const ds = [doc("geteilt", "2026-09-24")];
  const state = C.toBriefingContractV3(input([a,b,c], { "vg-a": ds, "vg-b": ds })).currentHelmutState;
  assert.equal(state.items.length, 0);
});
test("Radar braucht zeitlichen Beleg; bloße Zähler und Umfelddimensionen reichen nicht", () => {
  const k = { ...ko(), mentioned_people: [] };
  const r = R.buildCurrentRadarState(input([k], { "vg-a": [doc("a", "2026-09-24", {
    title: "Ein Vorschlag zum Verkehr", summary: "Ein neuer Verkehrsvorschlag liegt vor."
  })] }));
  assert.equal(r.anzeige.status, "empty");
  assert.equal(r.anzeige.articles.length, 0);
});
test("Persönliche Resonanz berührt denselben Vorgang mit anderer Funktion", () => {
  const k = ko(), args = input([k], { "vg-a": [doc("a", "2026-09-24")] });
  const before = JSON.stringify(args);
  const r = R.buildCurrentRadarState(args);
  assert.equal(r.anzeige.mentions.length, 1);
  assert.match(r.anzeige.mentions[0].evidence, /nennt deinen Namen/);
  assert.equal(r.anzeige.mentions[0].summary, "");
  assert.ok(!JSON.stringify(r.anzeige).includes(k.display_summary));
  assert.ok(!JSON.stringify(r.anzeige).includes(k.why_relevant));
  assert.equal(JSON.stringify(args), before);
});
test("Titel einer eigenen Rede belegt Name und Datum, weder Ton noch Resonanz", () => {
  const ds = [doc("rede", "2026-09-23", { title: "Rede von Alex Beispiel", summary: "" })];
  const r = R.buildCurrentRadarState(input([ko()], { "vg-a": ds }));
  const m = r.anzeige.mentions[0];
  assert.equal(m.title, ds[0].title);
  assert.equal(m.mentionTone, "unknown");
  assert.equal(m.confidence, "unknown");
  assert.match(m.evidence, /2026-09-23/);
  assert.match(m.evidence, /Bewertung.*liegt nicht vor/);
  assert.match(r.anzeige.summary.line1, /Quellenstand: 2026-09-23/);
  assert.doesNotMatch(r.anzeige.summary.line1, /Aktuell|Heute|Resonanz/);
  assert.equal(r.anzeige.status, "stale");
  assert.equal(B.tagesAnlass(ds, now), null);
});
test("Vorabendquelle bleibt zulaessig und traegt sichtbar ihren wirklichen Tag", () => {
  const ds = [doc("abend", "2026-09-23", { published_at: "2026-09-23T20:00:00Z" })];
  const a = B.tagesAnlass(ds, now);
  assert.equal(a.art, "neue-quelle");
  assert.match(a.text, /Quellenstand: 2026-09-23/);
  assert.equal(ds[0].published_at, "2026-09-23T20:00:00Z");
});
test("Neue Ausschussentscheidung traegt begrenzte Beobachtung, keine Prognose", () => {
  const alt = doc("alt", "2026-09-22", {
    summary: "Der Ausschuss für Verkehr berät den Gesetzentwurf zur Finanzierung des öffentlichen Nahverkehrs." });
  const neu = doc("neu", "2026-09-24", {
    summary: "Der Ausschuss für Verkehr hat den Gesetzentwurf zur Finanzierung des öffentlichen Nahverkehrs beschlossen." });
  const s = B.beobachtung([alt, neu], now);
  assert.equal(s.sourceCount, 2);
  assert.equal(s.publishedAt, neu.published_at);
  assert.match(s.text, /noch kein politischer Trend/);
});
test("Mehr Artikel mit demselben Sachstand erzeugen keine neue Radarentwicklung", () => {
  const summary = "Der Ausschuss für Verkehr berät den Gesetzentwurf zur Finanzierung des öffentlichen Nahverkehrs.";
  const alt = doc("alt", "2026-09-22", { summary });
  for (const text of [summary, summary.toUpperCase(), summary + " Lesen Sie hier den vollständigen Bericht."]) {
    assert.equal(B.beobachtung([alt, doc("neu", "2026-09-24", { title: "Die Beratung im Überblick", summary: text })], now), null);
  }
  const beschlossen = doc("beschlossen", "2026-09-23", {
    summary: "Der Ausschuss für Verkehr hat den Gesetzentwurf zur Finanzierung des öffentlichen Nahverkehrs angenommen." });
  const paraphrase = doc("paraphrase", "2026-09-24", {
    summary: "Die Mitglieder des Verkehrsausschusses haben den Vorschlag über die Finanzierung des öffentlichen Nahverkehrs gebilligt." });
  assert.equal(B.beobachtung([alt, beschlossen, paraphrase], now), null);
  const geplant = doc("geplant", "2026-09-24", {
    summary: "Der Gesetzentwurf zur Finanzierung des öffentlichen Nahverkehrs soll im zuständigen Ausschuss beschlossen werden." });
  assert.equal(B.beobachtung([alt, geplant], now), null);
  const unklar = doc("unklar", "2026-09-24", {
    summary: "Es ist weiterhin unklar, ob der Ausschuss den Entwurf zur Finanzierung des öffentlichen Nahverkehrs beschlossen hat." });
  assert.equal(B.beobachtung([alt, unklar], now), null);
});
test("Geaenderte Zahlen sind beobachtbar, andere Datums- und Zahlenformate allein nicht", () => {
  const alt = doc("zahl-alt", "2026-09-22", {
    summary: "Der Ausschuss für Verkehr beziffert am 22.09.2026 den Anteil der Bundesmittel am öffentlichen Nahverkehr auf 10 Prozent." });
  const text = "Der Ausschuss für Verkehr nennt für den öffentlichen Nahverkehr am 2026-09-22 einen Bundesanteil von ";
  const quelle = wert => doc("zahl-neu", "2026-09-24", { summary: text + wert + "." });
  assert.equal(B.beobachtung([alt, quelle("10 %")], now), null);
  assert.equal(B.beobachtung([alt, quelle("12 %")], now).publishedAt, "2026-09-24T08:00:00Z");
  const geld = (wert, tag) => doc("geld-" + tag, tag, {
    summary: "Das Land stellt für die Förderung des öffentlichen Nahverkehrs " + wert + " Euro bereit." });
  for (const wert of ["1000", "1 000", "1.000,00"]) {
    assert.equal(B.beobachtung([geld("1.000", "2026-09-22"), geld(wert, "2026-09-24")], now), null);
  }
  assert.ok(B.beobachtung([geld("1.000", "2026-09-22"), geld("1.050,00", "2026-09-24")], now));
});
test("Zeitgleiche Bestandsquellen sind keine neue Dynamik", () => {
  assert.equal(B.beobachtung([doc("a", "2026-09-24"), doc("b", "2026-09-24")], now), null);
});
test("URL Varianten und gleiche Dokumentkennungen erzeugen kein Wachstum", () => {
  const a = doc("a", "2026-09-22");
  assert.equal(B.beobachtung([a, doc("b", "2026-09-24", { url: a.url + "?utm_source=test" })], now), null);
  assert.equal(B.beobachtung([a, doc("a", "2026-09-24", { url: "https://example.org/anderer-slug" })], now), null);
});
test("Alte oder zukünftige Resonanz bleibt aus dem Radar", () => {
  assert.equal(B.beobachtung([doc("a", "2026-09-01"), doc("b", "2026-09-02")], now), null);
  assert.equal(B.beobachtung([doc("a", "2026-09-24"), doc("b", "2026-09-25")], now), null);
  const r = R.buildCurrentRadarState(input([ko()], { "vg-a": [doc("a", "2026-09-01")] }));
  assert.equal(r.anzeige.mentions.length, 0);
});
test("Fremde Mandate erhalten kein persönliches Signal", () => {
  const args = input([ko()], { "vg-a": [doc("a", "2026-09-24")] });
  args.profile = { id: "anderes-mandat", fullName: "Robin Muster" };
  assert.equal(R.buildCurrentRadarState(args).anzeige.mentions.length, 0);
});
test("Semantische Bereichstrennung ist verpflichtendes Fachkriterium", () => {
  assert.ok(F.KRITERIEN.includes("bereichstrennung"));
});
test("Widersprüchliche Datumsvarianten sperren unabhängig von der Reihenfolge", () => {
  const a = doc("a", "2026-09-22"), b = doc("b", "2026-09-24", { url: a.url + "?utm_source=x" });
  for (const ds of [[a,b], [b,a], [b,{ ...a, published_at:null }]]) {
    assert.equal(B.tagesAnlass(ds, now), null);
    assert.equal(B.beobachtung(ds, now), null);
  }
});
test("Zukünftige Frist ist Radar; heutige Frist trägt Briefing auch mit älterer Quelle", () => {
  const k = { ...ko(), deadline:"2026-09-25" };
  const ds = [doc("frist", "2026-09-20", { summary:"Die Einreichungsfrist endet am 25.09.2026." })];
  assert.equal(B.tagesAnlass(ds, now, null, k), null);
  const r = R.buildCurrentRadarState(input([k], { "vg-a":ds }));
  assert.equal(r.anzeige.mentions[0].beobachtungsBeleg.art, "kommende-frist");
  k.deadline = "2026-09-24"; ds[0].summary = "Die Einreichungsfrist für Stellungnahmen zum Verkehr endet am 24.09.2026; die Unterlagen können beim Ausschuss eingereicht werden.";
  const b = C.toBriefingContractV3(input([k], { "vg-a":ds }));
  assert.equal(b.currentHelmutState.tagesAnlass.art, "heutige-frist");
});
test("Erfundene, abgesagte und bloße Datumsangaben sind kein Fristbeleg", () => {
  const k = { ...ko(), deadline:"2026-09-24" };
  for (const summary of ["Am 24.09.2026 wurde ein Bericht veröffentlicht.",
    "Die Frist am 24.09.2026 wurde aufgehoben.", "Die Frist endet nicht am 24.09.2026.",
    "Heute findet eine Beratung statt.", "Die Frist endet am 25.09.2026."]) {
    assert.equal(B.tagesAnlass([doc("frist", "2026-09-20", { summary })], now, null, k), null, summary);
  }
});
test("Verschieden formulierte Lage-Einordnungen werden nie zum Briefinggrund oder Radartext", () => {
  for (const why of ["Kommunen müssen mehr Geld für den Verkehr aufbringen.",
    "Für Städte erhöhen sich die Ausgaben im Verkehrsbereich."]) {
    const k = { ...ko(), why_relevant:why, warum_wichtig:why };
    const b = C.toBriefingContractV3(input([k], { "vg-a":[doc("neu", "2026-09-24")] }));
    assert.ok(!b.currentHelmutState.whyItMatters.includes(why));
    assert.ok(!JSON.stringify(b.currentRadarState.anzeige).includes(why));
  }
});
test("Rollenhinweise brauchen gebundene Ausgabeurteile, Handlung bleibt Quellen-Fachaussage", () => {
  const Q = require("../lib/helmut/briefing-aussagenbindung");
  const k = ko(), ds = [doc("a", "2026-09-24", { summary: "Die öffentliche Beratung zum Verkehr findet am 24.09.2026 mit den beteiligten Verbänden im Parlament statt." })], args = input([k], { "vg-a":ds });
  const briefing = C.toBriefingContractV3(args);
  const e = Q.baueEingabe({ briefing, sourcesByVorgang:args.sourcesByVorgang, profile,
    userId:profile.id, day:"2026-09-24", kos:[k] });
  assert.equal(e.aussagen.find(a => a.pfad === "/currentHelmutState/whyItMatters").art, "ausgabe");
  assert.equal(e.aussagen.find(a => a.pfad === "/currentHelmutState/recommendation").art, "fachaussage");
  assert.equal(e.aussagen.find(a => a.pfad.endsWith("mentions/0/evidence")).art, "ausgabe");
  assert.equal(Q.pruefe(e, null).bereit, false);
});
test("Hoch priorisierte heutige Frist wird nicht von bloßer Artikelfrische verdrängt", () => {
  const a = { ...ko(), deadline:"2026-09-24" }, b = ko("b");
  const args = input([a,b], { "vg-a":[doc("frist", "2026-09-20", { summary:"Die Abgabefrist für Stellungnahmen zum Verkehr endet am 24.09.2026; die Unterlagen können beim Ausschuss eingereicht werden." })],
    "vg-b":[doc("aktuell", "2026-09-24")] });
  args.decisions[0].score = 95;
  const state = C.toBriefingContractV3(args).currentHelmutState;
  assert.equal(state.primaryVorgangId, "vg-a");
  assert.equal(state.tagesAnlass.art, "heutige-frist");
  const debug = C.buildPrimarySelectionDebug({ ...args, decisionsAfter:args.decisions, state });
  assert.equal(debug.selectedPrimary.vorgang_id, state.primaryVorgangId);
});
test("Production-Zeitstempel und Berliner Tagesgrenze tragen denselben Fristvertrag", () => {
  const ds = [doc("frist", "2026-09-20", { summary:"Die Einreichungsfrist endet am 24.09.2026." })];
  for (const deadline of ["2026-09-24T00:00:00+00:00", "2026-09-23T22:30:00Z"]) {
    assert.equal(B.tagesAnlass(ds, now, null, { deadline }).art, "heutige-frist");
  }
  for (const deadline of ["2026-09-24T00:00:00", "2026-02-30", "2026-09-24T99:00:00Z"]) {
    assert.equal(B.tagesAnlass(ds, now, null, { deadline }), null);
  }
});
// Synthetische, hashgebundene amtliche Artikelstände. Eine fehlende Uhrzeit
// bleibt fehlend; nur der vorhandene Vertrag für einen ganzen Berliner Tag gilt.
const tageJetzt = new Date("2026-11-10T09:00:00Z");
const tageFenster = { start: "2026-11-08T00:00:00Z" };
const standArten = ["bundestag", "berlin", "brandenburg"];
function tagQuelle(art, tag = "2026-11-09", nummer = "10001") {
  const sha = s => require("node:crypto").createHash("sha256").update(s).digest("hex");
  const config = {
    bundestag: ["bundestag-artikelstand", `https://bundestag.de/dokumente/textarchiv/2026/kw46-de-synthetisch-${nummer}`, "helmutBundestagArtikelstand", "bundestag_artikelstand"],
    berlin: ["berlin-artikelstand", `https://berlin.de/sen/uvk/presse/pressemitteilungen/2026/pressemitteilung.${nummer}.php`, "helmutBerlinArtikelstand", "berlin_artikelstand"],
    brandenburg: ["brandenburg-landtag-presseartikelstand", `https://landtag.brandenburg.de/de/meldungen/synthetisch/${nummer}`, "helmutBrandenburgLandtagPresseArtikelstand", "brandenburg_artikelstand"]
  }[art];
  const [modul, url, rawFeld, alias] = config;
  const S = require("../lib/helmut/" + modul);
  const summary = "Der synthetische amtliche Artikel beschreibt einen neuen Vorschlag zum Verkehr und enthält ausschließlich erfundene Sachverhalte für die lokale Prüfung des bestehenden Quellenvertrags.";
  const stand = { version: S.VERSION, herkunft: art === "berlin" ? S.HERKUNFT_SONDER : S.HERKUNFT,
    url, titel: "Synthetische amtliche Verkehrsmeldung", publikationstag: tag, absatzHash: sha(summary),
    ...(art !== "bundestag" ? { volltextHash: sha(summary + "\n") } : {}),
    ...(art === "brandenburg" ? { publikationszeitpunktUtc: tag + "T12:00:00.000Z" } : {}) };
  stand.standHash = S.standHashFuer(stand);
  const d = { id: "rd-" + stand.standHash, content_hash: stand.standHash, url, canonical_url: url,
    title: stand.titel, summary, published_at: null, raw: { [rawFeld]: stand } };
  return { d, stand, alias };
}
for (const art of standArten) {
  test(`${art}: ganzer gebundener Artikelstandtag erreicht Tagesanlass und Briefing`, () => {
    const { d, stand, alias } = tagQuelle(art);
    // Derselbe geschlossene Stand kommt aus raw oder dem bestehenden REST-Alias.
    for (const quelle of [d, { ...d, raw: undefined, [alias]: stand }]) {
      const before = JSON.stringify(quelle), k = { ...ko(),
        created_at: tageJetzt.toISOString(), updated_at: tageJetzt.toISOString() };
      const args = { ...input([k], { "vg-a": [quelle] }), now: tageJetzt, frischeFenster: tageFenster };
      const anlass = B.tagesAnlass([quelle], tageJetzt, tageFenster);
      assert.ok(anlass); assert.deepEqual(anlass.documentIds, [d.id]);
      assert.match(anlass.text, /Quellenstand: 2026-11-09/);
      const state = C.toBriefingContractV3(args).currentHelmutState;
      assert.equal(state.primaryVorgangId, null);
      assert.equal(state.primaryItem, null);
      assert.equal(state.status, "empty");
      assert.equal(C.toBriefingContractV3(args).items[0].primarySource.publishedAt, null);
      assert.equal(require("../lib/helmut/lage-quellenbeleg").baueEingabe([k], args.sourcesByVorgang, tageJetzt).length, 1);
      assert.equal(JSON.stringify(quelle), before); assert.equal(quelle.published_at, null);
    }
  });
  test(`${art}: ungültiger Stand, Textdrift und erfundene Uhrzeit werden nicht gerettet`, () => {
    for (const change of [q => { Object.values(q.raw)[0].standHash = "a".repeat(64); },
      q => { q.summary += " Ungebunden."; }, q => { delete q.summary; },
      q => { q.published_at = "2026-11-09T12:00:00Z"; }, q => { q.publishedAt = "2026-11-09T12:00:00Z"; }]) {
      const { d } = tagQuelle(art); change(d);
      assert.equal(B.tagesAnlass([d], tageJetzt, tageFenster), null);
    }
  });
  test(`${art}: Alias ohne Stand oder mit anderer Fassung sperrt reihenfolgeunabhängig`, () => {
    const { d } = tagQuelle(art), ohne = { ...d, raw: {} };
    const andereFassung = tagQuelle(art, "2026-11-08").d;
    for (const alias of [ohne, { ...ohne, published_at: "2026-11-09T12:00:00Z" }, andereFassung])
      for (const rows of [[d, alias], [alias, d]]) assert.equal(B.tagesAnlass(rows, tageJetzt, tageFenster), null);
  });
  test(`${art}: laufender, zukünftiger und angeschnittener Tag bleiben ausgeschlossen`, () => {
    const { d } = tagQuelle(art);
    for (const tag of ["2026-11-10", "2026-11-11"])
      assert.equal(B.tagesAnlass([tagQuelle(art, tag).d], tageJetzt, tageFenster), null);
    assert.equal(B.tagesAnlass([d], tageJetzt, { start: "2026-11-09T05:15:00Z" }), null);
    const start = "2026-11-08T23:00:00.000Z", ende = new Date("2026-11-09T23:00:00.000Z");
    assert.ok(B.tagesAnlass([d], ende, { start }));
    assert.equal(B.tagesAnlass([d], ende, { start: "2026-11-08T23:00:00.001Z" }), null);
    assert.equal(B.tagesAnlass([d], new Date(ende.getTime() - 1), { start }), null);
  });
  test(`${art}: Tagesanlass erweitert weder Radar noch Personen- oder Fristbelege`, () => {
    const { d } = tagQuelle(art);
    assert.deepEqual(B.quellen([d], tageJetzt), []);
    assert.equal(B.beobachtung([d], tageJetzt), null);
    assert.deepEqual(B.personenQuellen([d], tageJetzt, profile), []);
    assert.equal(B.fristTag({ deadline: "2026-11-11" }, [d], tageJetzt), null);
  });
}
test("Tagesanlass: transitive Aliasdrift, ungültiges Fenster und gewöhnlich undatiert bleiben gesperrt", () => {
  const { d } = tagQuelle("berlin"), alias = tagQuelle("berlin", "2026-11-09", "10002").d;
  const bruecke = { ...d, url: alias.url, canonical_url: alias.url, raw: {} };
  for (const rows of [[d, bruecke, alias], [alias, bruecke, d]])
    assert.equal(B.tagesAnlass(rows, tageJetzt, tageFenster), null);
  for (const start of ["ungültig", "2026-11-11T00:00:00Z"])
    assert.equal(B.tagesAnlass([d], tageJetzt, { start }), null);
  assert.equal(B.tagesAnlass([{ ...doc("undatiert", "2026-11-09"), published_at: null }], tageJetzt, tageFenster), null);
});
test("Tagesanlass: gültige Duplikate zählen einmal, Zeitstempel behalten ihre Regeln", () => {
  const { d } = tagQuelle("berlin");
  const normal = doc("mit-zeit", "2026-11-09");
  const anlass = B.tagesAnlass([d, structuredClone(d), normal], tageJetzt, tageFenster);
  assert.deepEqual(anlass.documentIds, [normal.id, d.id]);
  assert.match(anlass.text, /Quellenstand: 2026-11-09/);
  assert.ok(B.tagesAnlass([normal], tageJetzt, { start: "2026-11-09T08:00:00Z" }));
  assert.equal(B.tagesAnlass([normal], tageJetzt, { start: "2026-11-09T08:00:00.001Z" }), null);
  // Ein zusätzlich geladener echter Zeitstempel bleibt ein Zeitstempelbeleg;
  // nur die interne KO-Zeit darf keinen solchen Beleg ersetzen.
  const k = { ...ko(), created_at: tageJetzt.toISOString(), updated_at: tageJetzt.toISOString() };
  const args = { ...input([k], { "vg-a": [d, normal] }), now: tageJetzt, frischeFenster: tageFenster };
  const ausgabe = C.toBriefingContractV3(args);
  assert.equal(ausgabe.currentHelmutState.primaryItem, null);
  assert.ok(ausgabe.items[0].sources.some(s => s.publishedAt === normal.published_at));
});
test("Ganze Artikelstandtage folgen unverändert den bestehenden Berliner Sommer-/Winterzeitgrenzen", () => {
  for (const [tag, start, ende] of [["2026-03-29", "2026-03-28T23:00:00Z", "2026-03-29T22:00:00Z"],
    ["2026-10-25", "2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z"]]) {
    const { d } = tagQuelle("berlin", tag);
    assert.ok(B.tagesAnlass([d], new Date(ende), { start }));
    assert.equal(B.tagesAnlass([d], new Date(Date.parse(ende) - 1), { start }), null);
  }
});
test("Kaputter optionaler Stand wirft nicht den ganzen Briefingvertrag und erlaubt keinen Zeitfallback", () => {
  const normal = doc("zeitbeleg", "2026-11-09");
  const kaputt = { ...doc("kaputter-stand", "2026-11-09"), raw: { helmutBundestagArtikelstand: { version: "ungültig" } } };
  const { d } = tagQuelle("berlin");
  const k = { ...ko(), created_at: tageJetzt.toISOString(), updated_at: tageJetzt.toISOString() };
  for (const quellen of [[kaputt, normal], [normal, kaputt], [d, kaputt, normal], [normal, d, kaputt]]) {
    const args = { ...input([k], { "vg-a": quellen }), now: tageJetzt, frischeFenster: tageFenster };
    const before = JSON.stringify(args), state = C.toBriefingContractV3(args).currentHelmutState;
    assert.equal(state.primaryVorgangId, null);
    assert.ok(!B.tagesAnlass(quellen, tageJetzt, tageFenster).documentIds.includes(kaputt.id));
    assert.equal(state.primaryItem, null);
    assert.notEqual(state.status, "fresh");
    assert.equal(JSON.stringify(args), before);
  }
});
test("BT und LT: gleiche Originalfrist braucht denselben belegten Fachbezug", () => {
  const k = { ...ko(), deadline: "2026-09-24" }, docs = [doc("frist-bezug", "2026-09-20", {
    summary: "Die Einreichungsfrist für Stellungnahmen zum Verkehr endet am 24.09.2026; die Unterlagen können beim Ausschuss eingereicht werden." })];
  for (const parliamentType of ["Bundestag", "Landtag"]) {
    const p = { ...profile, id: "belegtes-testmandat-" + parliamentType, parliamentType };
    const a = B.tagesAnlass(docs, now, null, k, p);
    assert.equal(B.istTagesauftrag(a), true); assert.equal(a.art, "heutige-frist");
    assert.equal(a.beleg.text, docs[0].summary); assert.ok(a.profilbezug.belege.length);
    assert.equal(B.istTagesauftrag(B.tagesAnlass(docs, now, null, k, { ...p, focusTopics: ["Gesundheit"], topics: [] })), false);
  }
});
test("BT und LT: belegte Schlusszeiten gelten bis zum exakten Zeitpunkt", () => {
  for (const [day, zeit, cutoff] of [
    ["2026-09-24", "24.09.2026 um 12:10 Uhr", "2026-09-24T10:10:00Z"],
    ["2026-01-24", "24.01.2026 um 12:10 Uhr", "2026-01-24T11:10:00Z"],
    ["2026-09-24", "24.09.2026 um 10:10 Uhr UTC", "2026-09-24T10:10:00Z"],
    ["2026-01-24", "2026-01-24T12:10:00+01:00", "2026-01-24T11:10:00Z"],
    ["2026-09-24", "23.09.2026 um 23:30 Uhr UTC", "2026-09-23T23:30:00Z"]
  ]) {
    const k = { ...ko(), deadline: day };
    const ds = [doc("schlusszeit", day, {
      published_at: new Date(Date.parse(cutoff) - 3600000).toISOString(),
      summary: "Die Einreichungsfrist für Stellungnahmen zum Verkehr endet am " + zeit + " beim Parlament." })];
    for (const parliamentType of ["Bundestag", "Landtag"]) {
      const p = { ...profile, parliamentType };
      assert.equal(B.istTagesauftrag(B.tagesAnlass(ds, new Date(Date.parse(cutoff) - 1), null, k, p)), true, zeit);
      assert.equal(B.istTagesauftrag(B.tagesAnlass(ds, new Date(cutoff), null, k, p)), false, zeit);
    }
  }
});
test("Widerspruechliche und bei der Zeitumstellung uneindeutige Schlusszeiten sperren Handlungsauftrag", () => {
  const quelle = (id, time) => doc(id, "2026-10-24", {
    summary: "Die Einreichungsfrist für Stellungnahmen zum Verkehr endet am 25.10.2026 um " + time + " beim Parlament." });
  const k = { ...ko(), deadline: "2026-10-25" }, jetzt = new Date("2026-10-25T00:20:00Z");
  for (const docs of [[quelle("ohne-zone", "02:30 Uhr")], [quelle("unbekannt", "02:30 Uhr PST")],
    [quelle("eins", "02:30 Uhr MESZ"), quelle("zwei", "02:30 Uhr MEZ")]]) {
    assert.equal(B.istTagesauftrag(B.tagesAnlass(docs, jetzt, null, k, profile)), false);
  }
  assert.equal(B.istTagesauftrag(B.tagesAnlass([quelle("explizit", "02:30 Uhr MESZ")], jetzt, null, k, profile)), true);
  const iso = s => doc("iso", "2026-10-24", {
    summary: "Die Einreichungsfrist für Stellungnahmen zum Verkehr endet am " + s + " beim Parlament." });
  assert.equal(B.istTagesauftrag(B.tagesAnlass([iso("2026-10-25T12:00:00Z oder um 16:00 Uhr Berliner Zeit")],
    jetzt, null, k, profile)), false);
  assert.equal(B.istTagesauftrag(B.tagesAnlass([iso("25.10.2026 um 13:00 Uhr +01:00")], jetzt, null, k, profile)), true);
  for (const zone of ["PST", "pst", "PsT", "IST", "ist", "IsT"]) {
    const normal = doc("fremde-zone", "2026-09-23", { summary:
      "Die Einreichungsfrist für Stellungnahmen zum Verkehr endet am 24.09.2026 um 15:00 Uhr " + zone + " beim Parlament." });
    assert.equal(B.istTagesauftrag(B.tagesAnlass([normal], now, null, { ...ko(), deadline: "2026-09-24" }, profile)), false);
  }
  const berlin = doc("berliner-ortszeit", "2026-09-23", { summary:
    "Die Einreichungsfrist für Stellungnahmen zum Verkehr endet am 24.09.2026 um 15:00 Uhr Berliner Zeit beim Parlament." });
  assert.equal(B.istTagesauftrag(B.tagesAnlass([berlin], now, null, { ...ko(), deadline: "2026-09-24" }, profile)), true);
  const sprung = doc("sommerzeit", "2026-03-28", {
    summary: "Die Einreichungsfrist für Stellungnahmen zum Verkehr endet am 29.03.2026 um 02:30 Uhr beim Parlament." });
  assert.equal(B.istTagesauftrag(B.tagesAnlass([sprung], new Date("2026-03-29T00:40:00Z"), null,
    { ...ko(), deadline: "2026-03-29" }, profile)), false);
});
test("Niedriger bewertete heutige Frist steht vor neuer belegter Vorbereitung mit hohem Score", () => {
  const a = { ...ko(), deadline: "2026-09-24" }, b = ko("b");
  const args = input([b, a], { "vg-a": [doc("frist-heute", "2026-09-20", {
    summary: "Die Einreichungsfrist für Stellungnahmen zum Verkehr endet am 24.09.2026; die Unterlagen können beim Ausschuss eingereicht werden." })],
    "vg-b": [doc("neue-vorbereitung", "2026-09-24", {
      summary: "Für das neue Verkehrsgesetz wurden Nachbesserungen zur weiteren parlamentarischen Beratung angekündigt." })] });
  args.decisions[0].score = 99; args.decisions[1].score = 41;
  const scoring = process.env.HELMUT_SCORING_MODE;
  try {
    for (const mode of ["off", "on"]) {
      process.env.HELMUT_SCORING_MODE = mode;
      const state = C.toBriefingContractV3(args).currentHelmutState;
      assert.equal(state.primaryVorgangId, "vg-a"); assert.equal(state.tagesAnlass.art, "heutige-frist");
      assert.equal(state.items[0].id, "vg-b");
      assert.equal(C.buildPrimarySelectionDebug({ ...args, decisionsAfter: args.decisions, state }).selectedPrimary.vorgang_id, "vg-a");
    }
  } finally { if (scoring === undefined) delete process.env.HELMUT_SCORING_MODE; else process.env.HELMUT_SCORING_MODE = scoring; }
});
test("Persönliche Originalnennung mit Frist braucht keinen erfundenen Fachtreffer", () => {
  const p = { ...profile, focusTopics: [], topics: [], committees: [] }, k = { ...ko(), deadline: "2026-09-24" };
  const ds = [doc("persoenliche-frist", "2026-09-23", { title: "Persönliche Stellungnahme",
    summary: "Alex Beispiel kann die Unterlagen einreichen; die Einreichungsfrist für diese Stellungnahme endet am 24.09.2026 beim Parlament." })];
  const anlass = B.tagesAnlass(ds, now, null, k, p);
  assert.equal(B.istTagesauftrag(anlass), true); assert.equal(anlass.profilbezug.belege[0].art, "persoenlich");
  assert.equal(B.istTagesauftrag(B.tagesAnlass(ds, now, null, k, { ...p, fullName: "Robin Muster" })), false);
  const ohneBezug = [{ ...ds[0], summary: "Alex Beispiel nahm an der Sitzung teil. Die Einreichungsfrist für diese Stellungnahme endet am 24.09.2026 beim Parlament." }];
  assert.equal(B.istTagesauftrag(B.tagesAnlass(ohneBezug, now, null, k, p)), false);
});
test("Frische Parteimeldung und Kommunikationsfloskel erzeugen keinen persönlichen Auftrag", () => {
  const k = { ...ko(), headline: "Ein Ausschlussantrag liegt vor", was_ist_passiert: "Die Fraktion berät einen Ausschlussantrag.",
    recommendation: "Die Fraktion sollte bei Entscheidungsfindung transparente Verfahrenskommunikation sicherstellen.", parteien: [profile.party] };
  const ds = [doc("parteimeldung", "2026-09-24", { title: k.headline,
    summary: "In der Fraktion liegt ein Ausschlussantrag vor. Eine Entscheidung oder eine Frist sind bisher nicht bestätigt." })];
  const b = C.toBriefingContractV3(input([k], { "vg-a": ds }));
  assert.equal(b.currentHelmutState.primaryItem, null); assert.equal(b.currentHelmutState.recommendation, "");
  assert.equal(b.items[0].recommendedAction, k.recommendation); // Datenerhalt, kein persoenlicher Auftrag.
});
test("Höchstens drei belegte Tagesprioritäten, keine Auffüllung und keine Eingabemutation", () => {
  const ks = ["eins", "zwei", "drei", "vier"].map(ko), sources = Object.fromEntries(ks.map((k, i) => [k.vorgang_id,
    [doc("vorbereitung-" + i, "2026-09-24", { summary: "Für das Verkehrsgesetz wurden Nachbesserungen zur weiteren parlamentarischen Beratung angekündigt." })]]));
  const args = input(ks, sources), before = JSON.stringify(args), b = C.toBriefingContractV3(args);
  assert.ok(b.currentHelmutState.primaryItem); assert.equal(b.currentHelmutState.items.length, 2);
  assert.equal(b.items.length, 4); assert.equal(JSON.stringify(args), before);
});
test("Frist, Profilrelevanz und Originalstelle gelten in Tagesauswahl, Paketleser und Anzeige", () => {
  const cases = [
    { id: "zuerst", zeit: "10:15 Uhr UTC", score: 40, tag: "2026-09-24" },
    { id: "danach", zeit: "13:00 Uhr Berliner Zeit", score: 30, tag: "2026-09-22" },
    { id: "zuletzt", zeit: "16:00 Uhr Berliner Zeit", score: 90, tag: "2026-09-24" }
  ];
  const ks = cases.map(({ id }) => ({ ...ko(id), display_title: `Verkehr: ${id}`, deadline: "2026-09-24" }));
  const sources = Object.fromEntries(cases.map(({ id, zeit, tag }, i) => [ks[i].vorgang_id, [doc(id, tag, {
    summary: `Die Einreichungsfrist für Stellungnahmen zum Verkehr endet am 24.09.2026 um ${zeit}.`
  })]]));
  const args = { ...input(ks, sources), decisions: ks.map((k, i) => ({ ...decision(k), score: cases[i].score })),
    frischeFenster: require("../lib/helmut/briefing-frische").frischeFenster({ jetzt: now }) };
  const render = require("./lib/briefing-ansichten");
  for (const p of [{ ...profile, parliamentType: "Bundestag" }, { ...profile, parliamentType: "Landtag", state: "Berlin" }]) {
    const stand = C.buildCurrentHelmutState({ ...args, profile: p });
    assert.deepEqual([stand.primaryItem.id, ...stand.items.map(i => i.id)], ks.map(k => k.vorgang_id));
    const [a, b] = stand.items;
    const alt = { ...stand, primaryItem: { ...b, tagesAnlass: undefined }, tagesAnlass: b.tagesAnlass,
      items: [a, { ...stand.primaryItem, tagesAnlass: stand.tagesAnlass }] };
    const before = JSON.stringify(alt);
    const copy = C.pruefeGespeichertenHelmutStand(alt, p, now).stand;
    assert.deepEqual([copy.primaryItem.id, ...copy.items.map(i => i.id)], ks.map(k => k.vorgang_id));
    assert.equal(copy.status, "fresh"); assert.equal(copy.datenstandVonHeute, true);
    assert.equal(JSON.stringify(alt), before);
    const html = render({ currentHelmutState: copy }, now.toISOString()).html.briefing;
    assert.deepEqual([...html.matchAll(/data-topic-title="([^"]+)"/gu)].map(m => m[1]), ks.map(k => k.display_title));
    for (const k of ks) assert.ok(html.includes(sources[k.vorgang_id][0].summary));
  }
});
test("Eine Frist im anderen Parlament begründet keine persönliche Ausschusszuständigkeit", () => {
  for (const [institution, passend, fremd] of [
    ["des Bundestags", { parliamentType: "Bundestag" }, { parliamentType: "Landtag", state: "Berlin" }],
    ["des Landtags Brandenburg", { parliamentType: "Landtag", state: "Brandenburg" }, { parliamentType: "Bundestag" }],
    ["des Abgeordnetenhauses von Berlin", { parliamentType: "Landtag", state: "Berlin" }, { parliamentType: "Landtag", state: "Brandenburg" }]
  ]) {
    const text = `Die Einreichungsfrist für Stellungnahmen zur Pflegereform im Gesundheitsausschuss ${institution} endet am 24.09.2026.`;
    const k = { ...ko(), deadline: "2026-09-24", headline: "Einreichungsfrist zur Pflegereform", was_ist_passiert: text };
    const sources = { [k.vorgang_id]: [doc("pflege-ausschuss", "2026-09-23", { summary: text })] };
    const profil = merkmale => ({ id: profile.id, ...merkmale, committees: ["Gesundheit"] });
    const eigen = profil(passend), thema = { ...profil(fremd), focusTopics: ["Pflege"] };
    const native = C.buildCurrentHelmutState({ ...input([k], sources), profile: eigen });
    assert.equal(native.tagesAnlass.profilbezug.belege[0].art, "haupt");
    const lesestand = C.pruefeGespeichertenHelmutStand(native, eigen, now).stand;
    assert.equal(lesestand.tagesAnlass.profilbezug.belege[0].art, "haupt");
    assert.equal(C.buildCurrentHelmutState({ ...input([k], sources), profile: profil(fremd) }).primaryItem, null);
    const fachstand = C.buildCurrentHelmutState({ ...input([k], sources), profile: thema });
    assert.equal(fachstand.tagesAnlass.profilbezug.belege[0].art, "thema");
    assert.equal(C.pruefeGespeichertenHelmutStand(fachstand, thema, now).stand.tagesAnlass.profilbezug.belege[0].art, "thema");
  }
});
test("Bei gleicher Schlusszeit geht eine belegte Zuständigkeit vor einem reinen Fachschwerpunkt", () => {
  const direkt = { ...ko("direkt"), deadline: "2026-09-24", was_ist_passiert: "Der Gesundheitsausschuss des Bundestags berät die Pflegereform." };
  const thema = { ...ko("thema"), deadline: direkt.deadline };
  const wortlaut = fach => `Die Einreichungsfrist für Stellungnahmen ${fach} endet am 24.09.2026 um 15:00 Uhr Berliner Zeit.`;
  const args = input([thema, direkt], {
    [direkt.vorgang_id]: [doc("direkt", "2026-09-23", { summary: wortlaut("zur Pflegereform im Gesundheitsausschuss des Bundestags") })],
    [thema.vorgang_id]: [doc("thema", "2026-09-24", { summary: wortlaut("zum Verkehr") })]
  });
  const p = { ...profile, parliamentType: "Bundestag", committees: ["Gesundheit"] };
  const stand = C.buildCurrentHelmutState({ ...args, profile: p,
    decisions: [{ ...decision(thema), score: 99 }, { ...decision(direkt), score: 10 }] });
  assert.equal(stand.primaryItem?.id, direkt.vorgang_id);
  assert.equal(stand.items[0]?.id, thema.vorgang_id);
});
test("Ein passendes Fachwort macht den anderen Ausschuss desselben Parlaments nicht zum eigenen", () => {
  const summary = "Die Einreichungsfrist für Stellungnahmen zur Zufahrt zum Krankenhaus endet im Ausschuss für Verkehr des Bundestags am 24.09.2026 um 16:00 Uhr Berliner Zeit.";
  const k = { ...ko(), headline: "Zufahrt zum Krankenhaus", was_ist_passiert: summary, deadline: "2026-09-24" };
  const args = input([k], { [k.vorgang_id]: [doc("krankenhauszufahrt", "2026-09-23", { summary })] });
  const p = { id: profile.id, parliamentType: "Bundestag", committees: ["Gesundheit"] };
  assert.equal(C.buildCurrentHelmutState({ ...args, profile: p }).primaryItem, null);
  const focus = C.buildCurrentHelmutState({ ...args, profile: { ...p, focusTopics: ["Krankenhaus"] } });
  assert.equal(focus.tagesAnlass.profilbezug.belege[0].art, "thema");
  const verkehr = { ...p, committees: [], deputyCommittees: ["Verkehr"] };
  const s = C.buildCurrentHelmutState({ ...args, profile: verkehr });
  assert.equal(s.tagesAnlass.profilbezug.belege[0].art, "stellvertretung");
  assert.equal(C.pruefeGespeichertenHelmutStand(s, verkehr, now).stand.tagesAnlass.profilbezug.belege[0].art, "stellvertretung");
});
test("Kommende Frist geht vor einer erst später angesetzten Beratung", () => {
  const frist = { ...ko("frist"), deadline: "2026-09-25" };
  const beratung = ko("beratung");
  const args = input([beratung, frist], {
    [frist.vorgang_id]: [doc("frist", "2026-09-23", { summary: "Die Einreichungsfrist für Stellungnahmen zum Verkehr endet am 25.09.2026." })],
    [beratung.vorgang_id]: [doc("beratung", "2026-09-24", { summary: "Die öffentliche Beratung zum Verkehr findet am 27.09.2026 im zuständigen Ausschuss statt." })]
  });
  const stand = C.buildCurrentHelmutState(args);
  assert.equal(stand.primaryItem?.id, frist.vorgang_id);
  assert.equal(stand.items[0]?.id, beratung.vorgang_id);
});
console.log(`${count}/${count} Bereichsvertragsfälle bestanden; offline, ohne Modellaufruf.`);
