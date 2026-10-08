"use strict";
// Synthetische Audit-/Quellenregression bis in den echten App-/Eingabebuilder.
// Keine Production-Originale, externen Reads, Writer oder Modelle.
const A = require("node:assert/strict"), crypto = require("node:crypto");
const K = require("../lib/helmut/briefing-kandidatenzeit");
const now = new Date("2026-10-08T14:00:00Z");
const old = { id: "ko-audit", vorgang_id: "vg-audit", created_at: "2026-09-22T10:00:00Z", updated_at: "2026-10-08T13:10:00Z" };
const decision = { knowledge_object_id: old.id, vorgang_id: old.vorgang_id };
const source = { id: "rd-audit", url: "https://example.org/politik/audit", title: "Synthetischer Quellenbeleg", summary: "Ein belegter alter Sachstand.", published_at: "2026-09-22T10:00:00Z" };
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
function apply(ko = old, docs = [source], options = {}) {
  return K.begrenzeErgaenzungen({ vorher: [], vorlaeufig: [decision], kosById: { [old.id]: ko },
    sourcesByVorgang: { [old.vorgang_id]: docs }, now, ...options });
}
function berlinQuelle(day = "2026-10-08") {
  const B = require("../lib/helmut/berlin-artikelstand"), hash = text => crypto.createHash("sha256").update(text).digest("hex");
  const summary = "Eine vollstaendig synthetische Senatsmitteilung zum Beispielprogramm; kein amtlicher Originalbeleg.";
  const stand = { version: 1, herkunft: B.HERKUNFT,
    url: B.kanonischeArtikelUrl("https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1999999.php"),
    titel: "Synthetischer Berliner Zeitbeleg", publikationstag: day, absatzHash: hash(summary), volltextHash: hash(summary) };
  stand.standHash = B.standHashFuer(stand);
  return { id: B.kennungFuerStand(stand), title: stand.titel, summary, url: stand.url, content_hash: stand.standHash,
    published_at: null, raw: { helmutBerlinArtikelstand: stand } };
}
function brandenburgQuelle(time = "2026-10-08T10:57:00.000Z") {
  const B = require("../lib/helmut/brandenburg-landtag-presseartikelstand"), hash = text => crypto.createHash("sha256").update(text).digest("hex");
  const summary = "Ein vollstaendig synthetischer Landtagszeitbeleg, kein amtliches Original.";
  const stand = { version: 1, herkunft: B.HERKUNFT,
    url: B.kanonischeArtikelUrl("https://www.landtag.brandenburg.de/de/meldungen/synthetische_testmeldung/59999"),
    titel: "Synthetischer Brandenburger Zeitbeleg", publikationstag: "2026-10-08", publikationszeitpunktUtc: time,
    absatzHash: hash(summary), volltextHash: hash(summary) };
  stand.standHash = B.standHashFuer(stand);
  return { id: B.kennungFuerStand(stand), title: stand.titel, summary, url: stand.url, content_hash: stand.standHash,
    published_at: null, raw: { [B.ROHFELD]: stand } };
}
(async () => {
  await test("Audit heute allein reicht alten Vorgang nicht nach", () => A.deepEqual(apply(), []));
  await test("Fehlender Quellenstand macht Audit nicht frisch", () => A.deepEqual(apply(old, []), []));
  await test("Fehlende Erstaufnahme ist keine heutige Erstaufnahme", () => A.deepEqual(apply({ ...old, created_at: null }), []));
  await test("Heute erstmals angelegte A-artige Bindung bleibt mit aelterer Quelle erreichbar", () => A.equal(apply({ ...old, created_at: "2026-10-08T07:18:00Z" }).length, 1));
  await test("Zukuenftige Erstaufnahme ist nicht heute erfasst", () => A.deepEqual(apply({ ...old, created_at: "2026-10-08T18:00:00Z" }), []));
  await test("Neue echte heutige Quelle eines alten aktualisierten KO bleibt erreichbar", () => A.equal(apply(old, [{ ...source, published_at: "2026-10-08T10:00:00Z" }]).length, 1));
  await test("Zukuenftige Quellenzeit wird nicht als heutiger Beleg benutzt", () => A.deepEqual(apply(old, [{ ...source, published_at: "2026-10-08T18:00:00Z" }]), []));
  await test("Berliner Kalendertag gilt auch nach UTC-Mitternachtsgrenze", () => A.equal(apply(old, [{ ...source, published_at: "2026-10-07T22:15:00Z" }]).length, 1));
  await test("Ungueltige Quellenzeit wird nicht durch Audit ersetzt", () => A.deepEqual(apply(old, [{ ...source, published_at: "ungueltig" }]), []));
  await test("Widerspruechliche Datumsaliase sperren Quellenbeleg", () => A.deepEqual(apply(old, [{ ...source, published_at: "2026-10-08T10:00:00Z", publishedAt: "2026-10-08T11:00:00Z" }]), []));
  await test("Abweichend datierte Varianten desselben Artikels sperren diesen Beleg", () => A.deepEqual(apply(old, [source, { ...source, id: "rd-variante", published_at: "2026-10-08T10:00:00Z" }]), []));
  await test("Gleiche Dokumentkennung mit verschiedenen URLs verbindet Zeitkonflikte", () => A.deepEqual(apply(old, [source, { ...source, url: "https://example.org/politik/andere-url", published_at: "2026-10-08T10:00:00Z" }]), []));
  await test("Identitaetsbruecken verbinden auch transitive Varianten in beliebiger Reihenfolge", () => {
    const a = { ...source, id: "rd-a", url: "https://example.org/politik/eins", published_at: "2026-10-08T10:00:00Z" };
    const b = { ...a, id: "rd-b", url: "https://example.org/politik/zwei" };
    const bridge = { ...source, id: "rd-a", url: b.url };
    for (const docs of [[a, b, bridge], [bridge, b, a], [b, bridge, a]]) A.deepEqual(apply(old, docs), []);
  });
  await test("Kanonische URL verbindet unterschiedliche Trackingvarianten", () => A.deepEqual(apply(old, [source, { ...source, id: "rd-variante", url: source.url + "?utm_source=test", published_at: "2026-10-08T10:00:00Z" }]), []));
  await test("Variante ohne brauchbare URL sperrt denselben Dokumentbeleg", () => A.deepEqual(apply(old, [{ ...source, published_at: "2026-10-08T10:00:00Z" }, { ...source, url: null }]), []));
  await test("Undatierte Variante verhindert positiven Quellenzeitbeleg", () => A.deepEqual(apply(old, [{ ...source, published_at: null }, { ...source, id: "rd-variante", published_at: "2026-10-08T10:00:00Z" }]), []));
  await test("Unabhaengige heutige Quelle bleibt neben konfliktbehaftetem Artikel nutzbar", () => A.equal(apply(old, [source, { ...source, id: "rd-variante", published_at: "2026-10-08T10:00:00Z" }, { ...source, id: "rd-anderer", url: "https://example.org/politik/anderer", published_at: "2026-10-08T11:00:00Z" }]).length, 1));
  await test("Validierter Berliner Artikelstand bindet Tagespraezision ohne erfundene Uhrzeit", () => { const d = berlinQuelle(); const snapshot = JSON.stringify(d); A.equal(apply(old, [d]).length, 1); A.equal(JSON.stringify(d), snapshot); A.equal(d.published_at, null); });
  await test("Alter Berliner Artikelstand wird durch Audit nicht heute", () => A.deepEqual(apply(old, [berlinQuelle("2026-10-02")]), []));
  await test("Ungueltiger Artikelstand ist kein Zeitbeleg", () => { const d = berlinQuelle(); d.raw.helmutBerlinArtikelstand.standHash = "0".repeat(64); A.deepEqual(apply(old, [d]), []); });
  await test("Rawdatum widerspricht typed Publikationstag", () => A.deepEqual(apply(old, [{ ...berlinQuelle("2026-10-02"), published_at: "2026-10-08T10:00:00Z" }]), []));
  await test("Brandenburger Uhrzeit bleibt gebunden trotz leerem flachen Publikationsfeld", () => A.equal(apply(old, [brandenburgQuelle()]).length, 1));
  await test("Zukuenftige Brandenburger Uhrzeit ist noch kein heutiger Quellenbeleg", () => A.deepEqual(apply(old, [brandenburgQuelle("2026-10-08T18:57:00.000Z")]), []));
  await test("Zwei unterschiedliche typed Uhrzeiten desselben Artikels sperren den Beleg", () => A.deepEqual(apply(old, [brandenburgQuelle(), brandenburgQuelle("2026-10-08T11:57:00.000Z")]), []));
  await test("Quellenbelegte heutige Frist bleibt mit alter Publikation erreichbar", () => A.equal(apply({ ...old, deadline: "2026-10-08" }, [{ ...source, title: "Abgabefrist am 2026-10-08", summary: "Die Abgabefrist endet am 2026-10-08." }]).length, 1));
  await test("Fristzweig umgeht keinen Konflikt der Datumsaliase", () => A.deepEqual(apply({ ...old, deadline: "2026-10-08" }, [{ ...source, title: "Abgabefrist am 2026-10-08", summary: "Die Abgabefrist endet am 2026-10-08.", publishedAt: "2026-10-09T10:00:00Z" }]), []));
  await test("Fristzweig umgeht keinen Konflikt identischer Dokumente mit unterschiedlichen URLs", () => {
    const d = { ...source, title: "Abgabefrist am 2026-10-08", summary: "Die Abgabefrist endet am 2026-10-08." };
    A.deepEqual(apply({ ...old, deadline: "2026-10-08" }, [d, { ...d, url: "https://example.org/frist", published_at: "2026-10-07T10:00:00Z" }]), []);
  });
  await test("Empfehlung allein erfindet keine heutige Frist", () => A.deepEqual(apply({ ...old, recommendation: "Heute handeln", deadline: "2026-10-08" }), []));
  await test("Basis-Top-N bleibt ohne Frischebeleg unveraendert", () => { const before = [decision]; A.equal(apply(old, [], { vorher: before }), before); });
  await test("Zusaetzliche Entscheidung wird nicht doppelt nachgereicht", () => A.equal(apply(old, [{ ...source, published_at: now.toISOString() }], { vorlaeufig: [decision, decision] }).length, 1));
  await test("Fremde Vorgangsbindung wird abgewiesen", () => A.deepEqual(apply(old, [{ ...source, published_at: now.toISOString() }], { vorlaeufig: [{ ...decision, vorgang_id: "vg-fremd" }] }), []));
  await test("Fremde KO-Projektion wird abgewiesen", () => A.deepEqual(apply({ ...old, id: "ko-fremd", created_at: now.toISOString() }), []));
  await test("Ungueltige Beobachtungszeit laesst Basis unveraendert", () => { const before = [decision]; A.equal(apply(old, [], { vorher: before, now: new Date("ungueltig") }), before); });
  await test("Keine Eingabeprojektion wird mutiert", () => { const ko = structuredClone(old), docs = [structuredClone(source)], ds = [structuredClone(decision)]; const before = JSON.stringify({ ko, docs, ds }); apply(ko, docs, { vorlaeufig: ds }); A.equal(JSON.stringify({ ko, docs, ds }), before); });

  // Echter Serverbuilder, seine regulaeren Loader und App-/Eingabevertraege.
  const S = require("../lib/helmut/storage"), E = require("../lib/helmut/decisions");
  delete process.env.HELMUT_REVIEW_FIXTURE;
  const model = { status: "ready", understanding_status: "complete", was_ist_passiert: source.summary,
    display_title: source.title, display_summary: source.summary, why_relevant: "Synthetischer Themenbezug.", recommendation: "Beobachten." };
  const kos = [{ ...model, ...old, id: "ko-base", vorgang_id: "vg-base" }, { ...model, ...old },
    { ...model, ...old, id: "ko-ersterfassung", vorgang_id: "vg-ersterfassung", created_at: "2026-10-08T07:18:00Z" }];
  let reads = 0; const loaded = [];
  const groups = Object.fromEntries(kos.map(k => [k.vorgang_id, [{ ...source, id: "rd-" + k.id, url: "https://example.org/politik/" + k.id }]]));
  const snapshot = JSON.stringify({ kos, groups });
  S.v3StoreReady = () => true;
  S.listKnowledgeObjects = async () => { reads++; return kos; };
  S.getSourcesForVorgang = async id => { reads++; loaded.push(id); return groups[id]; };
  E.decideForUser = (_p, rows, opts) => (opts.limit === 50 ? rows.filter(k => k.id === "ko-base") : rows)
    .map(k => ({ knowledge_object_id: k.id, vorgang_id: k.vorgang_id, score: 40, decision: "Beobachten", matched_features: [] }));
  const build = require("../server").__buildV3Briefing, profile = { id: "synthetik-audit-test", focusTopics: ["Bildung"] };
  await test("Echter Appbuilder behaelt Basis/A-artige Erstaufnahme und entfernt reine Audit-Ergaenzung", async () => {
    const out = await build(profile, profile.id, { now });
    A.deepEqual(out.items.map(i => i.knowledgeObjectId).sort(), ["ko-base", "ko-ersterfassung"]);
    A.equal(reads, 4); A.deepEqual(loaded.sort(), ["vg-audit", "vg-base", "vg-ersterfassung"]);
  });
  await test("Echter Eingabebuilder behaelt alle geladenen KO-/Quellenoriginale im Nachweis", async () => {
    reads = 0; loaded.length = 0;
    const out = await build(profile, profile.id, { now, aussagenEingabe: true });
    A.equal(reads, 4); A.equal(out.korrekturBasis.kos.length, 3);
    A.deepEqual(Object.keys(out.korrekturBasis.sourcesByVorgang).sort(), ["vg-audit", "vg-base", "vg-ersterfassung"]);
    A(!out.briefing.items.some(i => i.knowledgeObjectId === old.id));
    A.equal(JSON.stringify({ kos, groups }), snapshot);
  });
  console.log(`${passed} Kandidatenzeit-Pruefungen bestanden; keine Production-/Modell-/Schreibaktionen.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
