"use strict";

const A = require("node:assert/strict");
const Q = require("../lib/helmut/briefing-aussagenbindung");
const S = require("../lib/helmut/storage");
const decisions = require("../lib/helmut/decisions");
const profile = { id: "aussagen-test", fullName: "Alex Beispiel", committees: ["Gesundheitsausschuss"] };
const now = new Date("2026-09-11T09:00:00Z");
const doc = { id: "rd-a", title: "Ministerin erlaeutert den Gesundheitsetat",
  summary: "In der Etatdebatte erlaeutert die Ministerin die Finanzierung der Gesundheitsversorgung.",
  url: "https://www.bundestag.de/dokumente/gesundheitsetat-123456", published_at: now.toISOString() };
const briefing = { available: true, items: [{ vorgangId: "vg-a", title: doc.title,
  summary: doc.summary, recommendedAction: "Lass das Buero die Folgen fuer die Gesundheitsversorgung pruefen.",
  whyItMatters: "Der Gesundheitsetat betrifft deinen Gesundheitsausschuss." }] };
const input = (b = briefing, p = profile, docs = [doc]) => Q.baueEingabe({ briefing: b,
  profile: p, userId: p.id, day: "2026-09-11", sourcesByVorgang: { "vg-a": docs } });
// Fiktives Fachurteil zum Vertragstest, kein vorgetaeuschter Modellaufruf.
const urteil = e => ({ version: Q.VERSION, eingabeHash: e.eingabeHash, ursprungHash: e.eingabeHash,
  ausgelasseneVorgaenge: [], aussagen: e.aussagen.map(a => ({ ...a, sachlichGetragen: true,
    kontextGetragen: true, mandatsbezugGetragen: true,
    begruendung: "Etatdebatte als Anlass, ausdruecklicher Pruefauftrag fuer den belegten Gesundheitsausschuss.",
    belege: [{ vorgangId: "vg-a", documentId: doc.id, feld: "auszug", text: doc.summary }] })) });
let passed = 0;
async function test(name, fn) { await fn(); console.log("PASS " + name); passed++; }

(async () => {
  await test("Fehlendes Urteil stoppt, gueltige Bindung behauptet keine volle Faktenabnahme", () => {
    const e = input(); A.equal(Q.pruefe(e).bereit, false);
    const r = Q.pruefe(e, urteil(e)); A.equal(r.bereit, true); A.equal(r.vollstaendigeFaktenpruefung, false);
  });
  for (const [name, text] of [
    ["Finanzumfang", "Die Ministerin konsolidiert die gesamten Staatsfinanzen."],
    ["Rollenbindung", "Der Abgeordnete Beispiel leitet das Gesundheitsministerium."],
    ["Ereignisvermischung", "Der Angriff und das Busunglueck sind derselbe Vorgang."],
    ["Zeitstatus", "Der Bundestag hat den erst angekuendigten Etat beschlossen."],
    ["Unbelegte Frist", "Die Beitragssenkung muss bis heute 18 Uhr verabschiedet werden."]
  ]) await test(name + ": negatives Sachurteil bleibt trotz echter Belegstelle abgelehnt", () => {
    const e = input({ ...briefing, items: [{ ...briefing.items[0], summary: text }] });
    const r = urteil(e); r.aussagen.find(a => a.pfad.endsWith("/summary")).sachlichGetragen = false;
    A.equal(Q.pruefe(e, r).bereit, false); A(Q.pruefe(e, r).fehler.includes("aussage-unbelegt"));
  });
  await test("Alle Empfehlungsaliase und neu hinzugefuegte Textfelder werden erfasst", () => {
    const e = input({ ...briefing, personalizedRecommendations: [{ recommended_action: "Unbelegter Auftrag",
      personal_relevance_explanation: "Unbelegte Zustaendigkeit", consequence_if_ignored: "Unbelegte Folge" }],
    zusaetzlicheAnsicht: { neuerFachtext: "Ungepruefte Ergaenzung" } });
    A.equal(e.aussagen.length, 8);
    const r = urteil(e); r.aussagen.pop(); A.equal(Q.pruefe(e, r).bereit, false);
  });
  await test("Kontext und Mandatsbezug sind getrennte zwingende Urteile", () => {
    for (const field of ["kontextGetragen", "mandatsbezugGetragen"]) {
      const e = input(), r = urteil(e); r.aussagen[0][field] = false;
      A.equal(Q.pruefe(e, r).bereit, false);
    }
  });
  await test("Titel ohne Auszug: erfundener Auszug heilt keinen fehlenden Beleg", () => {
    const e = input(briefing, profile, [{ ...doc, summary: "" }]), r = urteil(e);
    A.equal(Q.pruefe(e, r).bereit, false);
    r.aussagen.forEach(a => { a.belege[0].feld = "titel"; a.belege[0].text = doc.title; a.sachlichGetragen = false; });
    A.equal(Q.pruefe(e, r).bereit, false);
  });
  await test("Aenderung von Text, Originalauszug, URL oder Profil macht ein Urteil ungueltig", () => {
    const e = input(), r = urteil(e);
    for (const changed of [input({ ...briefing, extra: "Neue Behauptung" }),
      input(briefing, { ...profile, committees: ["Innenausschuss"] }),
      input(briefing, profile, [{ ...doc, summary: doc.summary + " Nachtrag." }]),
      input(briefing, profile, [{ ...doc, url: "https://www.bundestag.de/dokumente/anderer-artikel-123457" }])])
      A.equal(Q.pruefe(changed, r).bereit, false);
    const forged = structuredClone(e); forged.aussagen[0].text = "Manipuliert";
    A.equal(Q.pruefe(forged, r).bereit, false);
  });
  await test("Doppelte Urteile und fremde Belegzuordnung werden abgelehnt", () => {
    const e = input(), r = urteil(e); r.aussagen[1] = r.aussagen[0]; A.equal(Q.pruefe(e, r).bereit, false);
    const wrong = urteil(e); wrong.aussagen[0].belege[0].vorgangId = "vg-fremd";
    A.equal(Q.pruefe(e, wrong).bereit, false);
  });
  await test("Auslassungen brauchen den unveraenderten Ursprung und bekannte Vorgangskennungen", () => {
    const e = input(), r = urteil(e); r.ausgelasseneVorgaenge = ["vg-a"];
    A.deepEqual(Q.auslassungen(e, r), ["vg-a"]);
    A.throws(() => Q.auslassungen(e, { ...r, ursprungHash: "alt" }));
    A.throws(() => Q.auslassungen(e, { ...r, ausgelasseneVorgaenge: ["vg-fremd"] }));
  });
  await test("Gespeichertes Urteil bleibt mandantengebunden und der Leser schreibt nichts", async () => {
    const e = input(); let reads = 0, builds = 0;
    const u = urteil(e);
    u.gesamtpruefung = require("./fixtures/briefing-fachurteil")({ briefing, eingabe: e }, u);
    const storage = { assertTenant: S.assertTenant, getRenderedBriefingV3: async (id, slot, day, opts) => {
      reads++; A.equal(id, profile.id); A.equal(slot, Q.SLOT); A.equal(opts.strict, true);
      return { id: `bf-${id}-${slot}-${day}`, user_id: id, slot, payload: u };
    } };
    const r = await Q.leseFuerNachlauf({ profile, userId: profile.id, now, storage,
      build: async () => { builds++; return { briefing, eingabe: e }; } });
    A.equal(r.bereit, true); A.equal(reads, 1); A.equal(builds, 1);
    await A.rejects(Q.leseFuerNachlauf({ profile, userId: "fremd", now, storage }));
    storage.getRenderedBriefingV3 = async () => null;
    A.equal((await Q.leseFuerNachlauf({ profile, userId: profile.id, now, storage })).bereit, false);
  });

  const ko = { id: "ko-a", vorgang_id: "vg-a", understanding_status: "complete", status: "ready",
    display_title: doc.title, display_summary: doc.summary, was_ist_passiert: doc.summary,
    recommendation: briefing.items[0].recommendedAction, why_relevant: briefing.items[0].whyItMatters,
    created_at: now.toISOString(), updated_at: now.toISOString() };
  const bad = { ...ko, id: "ko-b", vorgang_id: "vg-b", display_title: "Unbelegte Finanzreform",
    display_summary: "Die Staatsfinanzen werden konsolidiert.", recommendation: "Unbelegten Haushaltsauftrag starten." };
  const before = JSON.stringify({ ko, bad, doc });
  S.v3StoreReady = () => true;
  S.listKnowledgeObjects = async () => [bad, ko];
  S.getSourcesForVorgang = async id => [{ ...doc, id: id === "vg-b" ? "rd-b" : doc.id }];
  decisions.decideForUser = (_p, kos) => kos.map((k, i) => ({ knowledge_object_id: k.id,
    vorgang_id: k.vorgang_id, score: 90-i, decision: "Sofort reagieren", priority_type: "chance", matched_features: [] }));
  const server = require("../server");
  await test("Echter Aufbau entfernt verworfenen Vorgang samt Handlungen und allen Ansichten", async () => {
    const original = await server.__buildV3Briefing(profile, profile.id, { now, aussagenEingabe: true });
    A.equal(original.briefing.items.length, 2);
    A.equal(Q.pruefe(original.eingabe).bereit, false);
    const clean = await server.__buildV3Briefing(profile, profile.id,
      { now, aussagenEingabe: true, aussagenAuslassungen: ["vg-b"] });
    A.equal(clean.briefing.items.length, 1); A.equal(clean.briefing.items[0].vorgangId, "vg-a");
    A(!JSON.stringify(clean.briefing).includes("Unbelegt")); A(!JSON.stringify(clean.briefing).includes("Staatsfinanzen"));
    A.equal(clean.briefing.currentHelmutState.primaryVorgangId, "vg-a");
    A.equal(JSON.stringify({ ko, bad, doc }), before);
    A.equal(Q.pruefe(clean.eingabe, urteil(original.eingabe)).bereit, false);
  });
  console.log(`${passed}/${passed} Aussagenbindungsgruppen bestanden`);
})().catch(e => { console.error(e); process.exitCode = 1; });
