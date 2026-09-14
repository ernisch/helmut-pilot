"use strict";
const A = require("node:assert/strict");
const Q = require("../lib/helmut/briefing-aussagenbindung");
const K = require("../lib/helmut/briefing-korrektur");
const S = require("../lib/helmut/storage");
const { hash } = require("../lib/helmut/briefing-speicher");
const profile = { id: "korrektur-test", firstName: "Alex", committees: ["Haushaltsausschuss"] };
const now = new Date("2026-09-11T09:00:00Z");
const doc = { id: "rd-a", title: "Bundestag beraet den Haushalt", summary: "Der Bundestag beraet den Haushalt in erster Lesung.",
  url: "https://www.bundestag.de/dokumente/haushalt-123456", published_at: now.toISOString() };
const base = { understanding_status: "complete", status: "ready", display_title: doc.title,
  display_summary: doc.summary, was_ist_passiert: doc.summary, updated_at: now.toISOString(), created_at: now.toISOString(),
  recommendation: "ALT Unbelegten Auftrag beginnen", risk_of_no_action: "ALT Unbelegtes Risiko", confidence_score: 99 };
let kos = ["a", "b", "c"].map(id => ({ ...base, id: "ko-" + id, vorgang_id: "vg-" + id }));
kos[2].updated_at = kos[2].created_at = "2026-09-08T09:00:00Z";
let sources = Object.fromEntries(kos.map(k => [k.vorgang_id, [{ ...doc, id: "rd-" + k.id.slice(-1) }]]));
const initial = structuredClone({ kos, sources, profile });
let reads = 0;
S.v3StoreReady = () => true;
S.listKnowledgeObjects = async () => { reads++; return kos; };
S.getSourcesForVorgang = async id => sources[id];
require("../lib/helmut/decisions").decideForUser = (_p, rows) => rows.slice(0, 2).map(k => ({
  knowledge_object_id: k.id, vorgang_id: k.vorgang_id, score: 50, decision: "Beobachten", matched_features: [] }));
const server = require("../server");
const build = opts => server.__buildV3Briefing(profile, profile.id, { now, aussagenEingabe: true, ...opts });
const inhalt = { titel: doc.title, zusammenfassung: doc.summary, mandatsbezug: "Anlass fuer den Haushaltsausschuss.",
  handlung: "Vorschlag: Unterlagen zur ersten Lesung pruefen.", kommunikation: "Vorschlag: Offene Fragen intern sammeln.",
  ausschuesse: ["Haushaltsausschuss"], ebene: "bund" };
let n = 0;
async function test(name, fn) { await fn(); console.log("PASS " + name); n++; }
(async () => {
  const original = await build();
  A.equal(original.briefing.items.length, 2);
  const korrektur = { version: K.VERSION, ursprungHash: original.eingabe.eingabeHash,
    entwuerfe: [{ vorgangId: "vg-a", begruendung: "Unbelegte Altanalyse vollstaendig ersetzen.", quellenIds: [doc.id], inhalt }],
    auslassungen: [{ vorgangId: "vg-b", begruendung: "Fachliche Klaerung offen." }] };
  const apply = k => K.wendeAn({ eingabe: original.eingabe, profile, ...original.korrekturBasis, korrektur: k });
  let clean;
  await test("Echter Adapter ersetzt alle Aliase, verhindert Nachruecken und schreibt nichts", async () => {
    const count = reads;
    clean = await build({ aussagenKorrektur: korrektur });
    A.equal(reads, count + 1); A.deepEqual(clean.briefing.items.map(i => i.vorgangId), ["vg-a"]);
    A(!JSON.stringify(clean.briefing).includes("ALT")); A(!JSON.stringify(clean.briefing).includes("vg-c"));
    A.equal(clean.korrekturBasis.kos[0].confidence_score, null);
    A.equal(clean.korrekturBasis.kos[0].risk_of_no_action, "");
    A.deepEqual({ kos, sources, profile }, initial);
    A.equal(clean.briefing.pruefumfang.zurueckgehalten, 1);
    A.equal(clean.briefing.pruefumfang.ausserhalbDerAuswahl, 1);
    for (const t of [clean.briefing.helmutAssessment.assessment, clean.briefing.executiveSummary]) {
      A(t.includes("keine Gesamtbewertung des Handlungsbedarfs"));
      A(!t.includes("0 Vorgang/Vorgänge mit akutem Handlungsbedarf"));
      A(clean.eingabe.aussagen.some(a => a.text === t && a.art === "ausgabe"));
    }
    const radar = clean.briefing.currentRadarState;
    A((radar.anzeige || radar).summary.text.includes("fachliche Abnahme steht aus"));
    A.equal(Q.pruefe(clean.eingabe).bereit, false);
  });
  await test("Umfang zaehlt die tatsaechliche Ausgabe nach Quellenpruefung", async () => {
    const k = structuredClone(korrektur);
    k.auslassungen = [];
    k.entwuerfe.push({ vorgangId: "vg-b", begruendung: "Synthetischer Gegenfall zur Quellenpruefung.",
      quellenIds: ["rd-b"], inhalt: { ...inhalt, titel: "Bundesminister stellt den Haushalt vor" } });
    const filtered = await build({ aussagenKorrektur: k });
    A.deepEqual(filtered.briefing.items.map(i => i.vorgangId), ["vg-a"]);
    const scope = filtered.briefing.pruefumfang;
    A.equal(scope.entwuerfe, 2); A.equal(scope.zurueckgehalten, 0);
    A.equal(scope.tatsaechlichSichtbar, 1); A.equal(scope.nichtAngezeigt, 1);
    A(scope.hinweis.includes("1 von 2 zuvor angezeigten Vorgängen"));
    A(scope.hinweis.includes("Nicht angezeigte Entwürfe nach Anzeigeprüfung: 1"));
    A(!JSON.stringify(filtered.briefing).includes("2 von 2 zuvor angezeigten"));
    A(filtered.eingabe.aussagen.some(a => a.text === scope.hinweis));
    A.deepEqual({ kos, sources, profile }, initial);
    // Auch eine vollständig zurückgewiesene Ausgabe darf keine Vollständigkeit behaupten.
    k.entwuerfe[0].inhalt.titel = k.entwuerfe[1].inhalt.titel;
    const empty = await build({ aussagenKorrektur: k });
    A.equal(empty.briefing.items.length, 0);
    A.equal(empty.briefing.pruefumfang.tatsaechlichSichtbar, 0);
    A.equal(empty.briefing.pruefumfang.nichtAngezeigt, 2);
    A(empty.briefing.executiveSummary.includes("0 von 2 zuvor angezeigten Vorgängen"));
  });
  await test("Veraltete Quelle, Altanalyse und Profil werden vor Ersatz abgelehnt", async () => {
    for (const change of [() => { sources["vg-a"][0].summary += " Nachtrag"; },
      () => { kos[2].risk_of_no_action = "Neue, nicht angezeigte Altanalyse"; },
      () => { profile.firstName = "Andere Person"; }]) {
      change(); await A.rejects(build({ aussagenKorrektur: korrektur }), /korrektur-abweichend/);
      kos = structuredClone(initial.kos); sources = structuredClone(initial.sources); Object.assign(profile, initial.profile);
    }
  });
  await test("Unvollstaendige Auswahl, fremde Quellen und unerwartete Ersatzfelder scheitern", () => {
    for (const change of [k => { k.auslassungen = []; }, k => { k.auslassungen.push(k.auslassungen[0]); },
      k => { k.entwuerfe[0].vorgangId = "vg-c"; }, k => { k.entwuerfe[0].quellenIds = ["rd-b"]; },
      k => { k.entwuerfe[0].inhalt.confidence_score = 100; }, k => { k.entwuerfe[0].quellenIds.push("rd-a"); }]) {
      const k = structuredClone(korrektur); change(k); A.throws(() => apply(k), /korrektur-abweichend/);
    }
  });
  await test("Gleicher Artikel unter zwei Kennungen erhaelt keinen Quellenbonus", () => {
    const groups = structuredClone(sources); groups["vg-a"].push({ ...doc, id: "rd-z", url: doc.url + "-zweite-url" });
    const e = Q.baueEingabe({ briefing: original.briefing, profile, userId: profile.id, day: "2026-09-11", kos, sourcesByVorgang: groups });
    const k = structuredClone(korrektur); k.ursprungHash = e.eingabeHash; k.entwuerfe[0].quellenIds.push("rd-z");
    A.throws(() => K.wendeAn({ eingabe: e, profile, kos, sourcesByVorgang: groups, korrektur: k }));
  });
  await test("Explizite Korrektur eines zurueckgehaltenen Kandidaten durchlaeuft den echten Lesepfad", async () => {
    kos[1].display_title = "Bundesminister stellt den Haushalt vor";
    const b = await build();
    A.deepEqual(b.briefing.items.map(i => i.vorgangId), ["vg-a"]);
    const k = { version: K.VERSION, ursprungHash: b.eingabe.eingabeHash,
      ergaenzungen: ["vg-b"], auslassungen: [], entwuerfe: ["a", "b"].map(id => ({
        vorgangId: "vg-" + id, begruendung: "Unbelegte Amtszuordnung durch quellengetreue Fassung ersetzt.",
        quellenIds: ["rd-" + id], inhalt: structuredClone(inhalt) })) };
    const fixed = await build({ aussagenKorrektur: k });
    A.deepEqual(fixed.briefing.items.map(i => i.vorgangId).sort(), ["vg-a", "vg-b"]);
    A.equal(fixed.briefing.pruefumfang.vorherSichtbar, 1);
    A.deepEqual(fixed.briefing.pruefumfang.ergaenzteVorgaenge, ["vg-b"]);
    A.equal(fixed.briefing.pruefumfang.ausserhalbDerAuswahl, 1);
    A(fixed.briefing.pruefumfang.hinweis.includes("1 zuvor angezeigten und 1 ausdrücklich ergänzten"));
    A.equal(Q.pruefe(fixed.eingabe).bereit, false);
    A(!JSON.stringify(fixed.briefing).includes("ALT"));
    const rejected = structuredClone(k);
    rejected.entwuerfe[1].inhalt.titel = kos[1].display_title;
    const filtered = await build({ aussagenKorrektur: rejected });
    A.deepEqual(filtered.briefing.items.map(i => i.vorgangId), ["vg-a"]);
    A.equal(filtered.briefing.pruefumfang.nichtAngezeigt, 1);
    for (const change of [x => { delete x.ergaenzungen; }, x => { x.ergaenzungen = ["vg-a"]; },
      x => { x.ergaenzungen = ["vg-b", "vg-b"]; }, x => { x.ergaenzungen = ["vg-fremd"]; },
      x => { x.entwuerfe.pop(); }, x => { x.entwuerfe[1].quellenIds = ["rd-a"]; }]) {
      const wrong = structuredClone(k); change(wrong);
      await A.rejects(build({ aussagenKorrektur: wrong }), /korrektur-abweichend/);
    }
    kos = structuredClone(initial.kos);
    A.deepEqual({ kos, sources, profile }, initial);
  });
  await test("Ergaenzungen brauchen gelesene Quellen und verarbeitetes Wissen im gebundenen Ursprung", () => {
    const k = structuredClone(korrektur);
    k.ergaenzungen = ["vg-c"];
    k.entwuerfe.push({ vorgangId: "vg-c", begruendung: "Synthetischer Kandidat ausserhalb der sichtbaren Menge.",
      quellenIds: ["rd-c"], inhalt });
    // Der unveraenderte Ursprung enthaelt keine fuer vg-c geladene Quellenzeile.
    A.throws(() => apply(k), /korrektur-abweichend/);
    const pending = structuredClone(kos); pending[2].status = pending[2].understanding_status = "pending";
    const e = Q.baueEingabe({ briefing: original.briefing, profile, userId: profile.id,
      day: "2026-09-11", kos: pending, sourcesByVorgang: sources });
    k.ursprungHash = e.eingabeHash;
    A.throws(() => K.wendeAn({ eingabe: e, profile, kos: pending, sourcesByVorgang: sources, korrektur: k }));
  });
  await test("Korrektur braucht internen Pruefmodus und unverfaelschten Ursprung", async () => {
    await A.rejects(build({ aussagenEingabe: false, aussagenKorrektur: korrektur }));
    const e = structuredClone(original.eingabe); e.korrekturKontext.wissensDatenHash = hash([]);
    A.throws(() => K.wendeAn({ eingabe: e, profile, ...original.korrekturBasis, korrektur }));
    A.throws(() => K.wendeAn({ eingabe: original.eingabe, profile: { ...profile, id: "anderer-mandant" },
      ...original.korrekturBasis, korrektur }));
  });
  await test("Technische Metadaten bleiben hashgebunden, neue Fachtexte bleiben pruefpflichtig", () => {
    const b = { items: [{ vorgangId: "vg-a", title: doc.title, sourceIds: ["rd-a"], lastUpdated: now.toISOString(),
      riskLevel: "unknown", neuerFachtext: "Zusatzbehauptung" }] };
    const e = Q.baueEingabe({ briefing: b, profile, userId: profile.id, day: "2026-09-11" });
    A.equal(e.aussagen.length, 2);
    A.deepEqual(Object.fromEntries(e.aussagen.map(a => [a.pfad, a.text])), {
      "/items/0/title": doc.title, "/items/0/neuerFachtext": "Zusatzbehauptung"
    });
    b.items[0].sourceIds[0] = "rd-neu";
    const changed = Q.baueEingabe({ briefing: b, profile, userId: profile.id, day: "2026-09-11" });
    A.notEqual(e.eingabeHash, changed.eingabeHash);
    b.items[0].riskLevel = "Nicht definierte politische Behauptung";
    A(Q.texte(b).some(a => a.text === b.items[0].riskLevel));
  });
  await test("Primaerauswahl vererbt keine fremde Vorgangskennung an benachbarte Karten", () => {
    const b = { items: [{ vorgangId: "vg-a" }], helmutAssessment: { recommendation: "Pruefauftrag" },
      currentHelmutState: { primaryVorgangId: "vg-b", headline: "Primaer", items: [{ id: "vg-a", title: "Nachbar" }] } };
    const a = Q.texte(b, { kos });
    A.equal(a.find(r => r.text === "Nachbar").vorgangId, "vg-a");
    A.equal(a.find(r => r.text === "Primaer").vorgangId, "vg-b");
    A.equal(a.find(r => r.text === "Pruefauftrag").vorgangId, "vg-a");
  });
  await test("Leerer Schwerpunkt bindet Zustandswerte ohne erfundene Artikelbelege", () => {
    const b = { currentHelmutState: { qualityStatus: "empty", sourcesSummary: { qualityStatus: "empty" },
      recommendedCommunication: { recommendedChannel: "unknown", recommendedFormat: "unknown" } } };
    const e = Q.baueEingabe({ briefing: b, profile, userId: profile.id, day: "2026-09-11" });
    A.equal(e.aussagen.length, 0);
    b.currentHelmutState.qualityStatus = "partial";
    const changed = Q.baueEingabe({ briefing: b, profile, userId: profile.id, day: "2026-09-11" });
    A.notEqual(e.darstellungsHash, changed.darstellungsHash);
    for (const [object, key] of [[b.currentHelmutState, "qualityStatus"],
      [b.currentHelmutState.recommendedCommunication, "recommendedChannel"],
      [b.currentHelmutState.recommendedCommunication, "recommendedFormat"]]) {
      object[key] = "Unbelegte Zusatzbehauptung";
      A(Q.texte(b).some(a => a.text === object[key] && a.pfad.endsWith("/" + key)));
    }
  });
  await test("Ausgabeurteil braucht Vertragsbezug, Artikelzitat allein genuegt nicht", () => {
    const e = clean.eingabe;
    const u = { version: Q.VERSION, eingabeHash: e.eingabeHash, aussagen: e.aussagen.map(a => ({ ...a,
      sachlichGetragen: true, kontextGetragen: true, mandatsbezugGetragen: true, begruendung: "Fiktives Urteil zum Vertragstest.",
      belege: [{ vorgangId: "vg-a", documentId: "rd-a", feld: "auszug", text: doc.summary }] })) };
    A(Q.pruefe(e, u).fehler.includes("ausgabebezug-fehlt"));
    u.aussagen.filter(a => a.art === "ausgabe").forEach(a => { a.ausgabeBeleg = e.darstellungsHash; a.belege = []; });
    A.equal(Q.pruefe(e, u).bereit, true); A.equal(Q.pruefe(e, u).vollstaendigeFaktenpruefung, false);
    const changed = structuredClone(korrektur); changed.entwuerfe[0].begruendung += " Zweitstand";
    A.notEqual(apply(changed).korrekturHash, clean.eingabe.korrekturHash);
  });
  console.log(`${n}/${n} Korrekturgruppen bestanden`);
})().catch(e => { console.error(e); process.exitCode = 1; });
