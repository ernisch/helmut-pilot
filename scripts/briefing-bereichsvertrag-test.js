"use strict";
const assert = require("node:assert/strict");
const B = require("../lib/helmut/briefing-bereichsvertrag");
const R = require("../lib/helmut/radarState");
const C = require("../lib/helmut/briefingContract");
const L = require("../lib/helmut/lage");
const F = require("../lib/helmut/briefing-fachurteil");
const now = new Date("2026-09-24T10:00:00Z");
const profile = { id: "abgrenzung-synthetisch", fullName: "Alex Beispiel", party: "Testpartei", committees: [], topics: ["Verkehr"] };
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
test("Lage behält Sachstand; Briefing kopiert auch umformulierte Einordnung nicht", () => {
  const k = ko(), ds = [doc("a", "2026-09-24")];
  const card = L.koToVorgangCard(k, ds, now);
  const b = C.toBriefingContractV3(input([k], { "vg-a": ds }));
  assert.equal(card.displaySummary, k.display_summary);
  assert.equal(b.currentHelmutState.primaryVorgangId, "vg-a");
  assert.equal(b.currentHelmutState.recommendation, k.recommendation);
  assert.notEqual(b.currentHelmutState.whyItMatters, k.why_relevant);
  assert.match(b.currentHelmutState.whyItMatters, /heutigen Arbeitstag/);
  assert.deepEqual(b.currentHelmutState.tagesAnlass.documentIds, ["a"]);
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
test("Verschiedene Tage und Artikel tragen begrenzte Beobachtung, keine Prognose", () => {
  const s = B.beobachtung([doc("alt", "2026-09-22"), doc("neu", "2026-09-24")], now);
  assert.equal(s.sourceCount, 2);
  assert.match(s.text, /1 weitere Artikel zu 1 zuvor/);
  assert.match(s.text, /noch kein politischer Trend/);
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
  k.deadline = "2026-09-24"; ds[0].summary = "Die Einreichungsfrist endet am 24.09.2026.";
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
  const k = ko(), ds = [doc("a", "2026-09-24")], args = input([k], { "vg-a":ds });
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
  const args = input([a,b], { "vg-a":[doc("frist", "2026-09-20", { summary:"Die Abgabefrist endet am 24.09.2026." })],
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
      assert.equal(state.primaryVorgangId, "vg-a");
      assert.equal(state.primaryItem.meldungAt, null);
      assert.equal(state.primaryItem.lastUpdated, null);
      assert.equal(state.primaryItem.zeitLabel, null);
      assert.notEqual(state.status, "fresh");
      assert.equal(state.datenstandTag, null);
      assert.equal(state.datenstandVonHeute, false);
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
  assert.equal(C.toBriefingContractV3(args).currentHelmutState.primaryItem.meldungAt, normal.published_at);
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
    assert.equal(state.primaryVorgangId, "vg-a");
    assert.ok(!state.tagesAnlass.documentIds.includes(kaputt.id));
    assert.equal(state.primaryItem.meldungAt, null);
    assert.equal(state.primaryItem.lastUpdated, null);
    assert.notEqual(state.status, "fresh");
    assert.equal(JSON.stringify(args), before);
  }
});
console.log(`${count}/${count} Bereichsvertragsfälle bestanden; offline, ohne Modellaufruf.`);
