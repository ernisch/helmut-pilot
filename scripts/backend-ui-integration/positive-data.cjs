// Wiederverwendete Integrationsfixture vom 2026-11-04; nur Runtime-Pfadbindung angepasst.
"use strict";

// Ausschliesslich synthetische LESENAHT fuer Root-isolierte HTTP-/Browserpruefung.
// Kein HTTP-Antwortmock, kein Import/Start von server.js und keine Testausfuehrung.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");

const INSTALLED = Symbol.for("helmut373c.positive-data-installed");
const copy = value => structuredClone(value);
const safeId = value => typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,119}$/.test(value);

function install(cloneRoot, options = {}) {
  assert.equal(options.isolated, true, "positive-data requires explicit isolated:true");
  const root = fs.realpathSync(cloneRoot);
  assert.ok(process.env.HELMUT_JOINT_RUNTIME, "Expliziter Wegwerfbereich erforderlich");
  assert.equal(root, fs.realpathSync(process.env.HELMUT_JOINT_RUNTIME), "Nur der gebundene isolierte Laufzeitbereich");
  assert.ok(!root.includes("/archive/"), "Das Originalarchiv bleibt unangetastet");
  assert.equal(process.env.HELMUT_STORAGE_BACKEND, "local", "Nur lokaler Speicher");
  assert.equal(process.env.HELMUT_SOURCE_MODE, "off", "Quellenmodus muss aus sein");
  assert.ok(!process.env.VERCEL && process.env.NODE_ENV !== "production", "Keine Deployment-Umgebung");
  assert.ok(!process.env.HELMUT_V3_STORE, "Kein echter V3-Speicherweg");
  for (const key of Object.keys(process.env)) {
    assert.ok(!/^(?:SUPABASE|AZURE|OPENAI|ANTHROPIC|DEEPSEEK|SERPAPI|VERCEL)_/.test(key), "Keine Anbieter-/Deploymentvariable: " + key);
  }
  assert.ok(!/^(1|true|on|yes)$/i.test(process.env.HELMUT_REVIEW_FIXTURE || ""), "Kein fertiger Review-Antwortzweig");
  assert.ok(!/^(1|true|on|yes)$/i.test(process.env.HELMUT_LAGE_DEMO || ""), "Keine Demo-Lage");
  const serverPath = path.join(root, "server.js");
  assert.ok(!require.cache[require.resolve(serverPath)], "install muss VOR server.js-Import erfolgen");

  const now = new Date(options.now || Date.now());
  assert.ok(Number.isFinite(now.getTime()), "Gueltiger Fixture-Zeitpunkt erforderlich");
  const mandateA = options.mandateA || "test-positive-a";
  const mandateB = options.mandateB || "test-positive-b";
  assert.ok(options.localUserStore === undefined || typeof options.localUserStore === "boolean", "localUserStore muss boolesch sein");
  const localUserStore = options.localUserStore === true;
  assert.ok(safeId(mandateA) && safeId(mandateB) && mandateA !== mandateB, "Zwei verschiedene sichere Mandats-IDs erforderlich");
  const profileFixture = require(path.join(root, "scripts/fixtures/test-profiles.js"));
  const lageSourcesFixture = require(path.join(root, "scripts/fixtures/lage-quellenmetadaten.js"));
  const profiles = {
    A: { ...copy(profileFixture.testPoliticianOne), id: mandateA, profileActive: true, firstName: "Test", positiveFixture: true },
    B: { ...copy(profileFixture.testPoliticianTwo), id: mandateB, profileActive: true, firstName: "Test", positiveFixture: true }
  };
  const byProfile = Object.assign(Object.create(null), Object.fromEntries(Object.values(profiles).map(profile => [profile.id, profile])));
  const iso = minutesAgo => new Date(now.getTime() - minutesAgo * 60000).toISOString();
  const knowledgeObjects = [], sourcesByVorgang = Object.create(null), matchingRows = Object.assign(Object.create(null), { [mandateA]: [], [mandateB]: [] });

  for (const [label, profile] of Object.entries(profiles)) {
    const topic = profile.committee;
    const region = profile.constituency;
    const person = profile.fullName;
    for (const [index, kind] of ["mention", "party"].entries()) {
      const suffix = label.toLowerCase() + "-" + kind;
      const id = "ko-positive-" + suffix, vorgangId = "vg-positive-" + suffix;
      const title = kind === "mention"
        ? `${person} stellt die Tagesordnung zu ${topic} im ${region} vor`
        : `${profile.party} bespricht ${topic} im ${region}`;
      const summary = `${title}. Die synthetische Mitteilung nennt die Beratung und die beteiligten Ausschussmitglieder.`;
      const url = `https://quellen-${label.toLowerCase()}.example.invalid/artikel/${suffix}`;
      const at = iso(2 + index);
      const ko = {
        id, vorgang_id: vorgangId, status: "neu", understanding_status: "complete",
        headline: title, display_title: title, display_summary: summary,
        was_ist_passiert: summary, warum_wichtig: `Die Beratung betrifft ${topic} und ${region}.`,
        why_relevant: `Der Vorgang betrifft den Ausschuss ${topic} und den Wahlkreis ${region}.`,
        recommendation: "Die belegte Tagesordnung im Team besprechen.", handlungsempfehlung: "Die Tagesordnung im Team besprechen.",
        display_category: "Ausschussberatung", policy_field: [topic], tags: [...profile.focusTopics],
        parteien: [profile.party], mentioned_parties: [profile.party],
        ausschuesse: [...profile.committees], mentioned_committees: [...profile.committees],
        mentioned_locations: [region], mentioned_mps: kind === "mention" ? [person] : [],
        mentioned_people: kind === "mention" ? [person] : [], mentioned_organizations: [], ministerien: [],
        risiken: [], chancen: [], zeitdruck: "keiner", deadline: null,
        source_document_count: 1, confidence_score: 95,
        best_source_url: url, best_link_type: "direct",
        created_at: at, updated_at: at, published_at: at, understood_at: at
      };
      const doc = {
        id: "rd-positive-" + suffix, url, canonical_url: url, title, summary,
        source_id: "source-positive-" + label.toLowerCase(), source_name: "Synthetische Testquelle " + label,
        source_type: "news", source_category: "medien", source_trust: "mittel", link_type: "direct",
        published_at: at, created_at: at, retrieved_at: at, fetched_at: at
      };
      knowledgeObjects.push(ko); sourcesByVorgang[vorgangId] = [doc];
      // Bestehende gespeicherte Treffer als Dateneingabe fuer die Lage. Der
      // Briefing-/Radar-Read entscheidet mit der ECHTEN Matching-/Decisionlogik.
      matchingRows[profile.id].push({ id: "matching-positive-" + suffix,
        user_id: profile.id, knowledge_object_id: id, vorgang_id: vorgangId,
        score: 80, similarity: 0.8, created_at: at,
        matched_features: [{ type: "partei", value: profile.party }, { type: "ausschuss", value: topic }, { type: "wahlkreis", value: region }] });
    }
  }
  const byKo = Object.assign(Object.create(null), Object.fromEntries(knowledgeObjects.map(ko => [ko.id, ko])));
  const latestAt = knowledgeObjects.map(ko => ko.updated_at).sort().at(-1);
  const storage = require(path.join(root, "lib/helmut/storage.js"));
  assert.ok(!storage[INSTALLED], "Vorherige positive-data-Installation zuerst abbauen");
  const ai = require(path.join(root, "lib/helmut/ai.js"));
  assert.equal(ai.isAiEnabled(), false, "Nur echter Kommunikations-Regelfallback ohne Anbieterzugang");
  const requireLocalUserStore = () => {
    assert.equal(process.env.HELMUT_STORAGE_BACKEND, "local", "Lokale Nutzerschreibvorgaenge nur im Dateispeicher");
    assert.equal(storage.getStorageStatus().backend, "local");
    assert.ok(!process.env.HELMUT_V3_STORE, "Keine V3-Speicherwahl");
    for (const flag of ["HELMUT_PROFILE_DB_MODE", "HELMUT_PROFILE_DB_EXCLUSIVE"]) assert.ok(!/^(1|true|on|yes)$/i.test(process.env[flag] || ""), flag + " muss aus sein");
    assert.equal(storage.profileDbModeEnabled(), false); assert.equal(storage.profileDbExclusiveEnabled(), false);
  };
  if (localUserStore) requireLocalUserStore();
  const originals = [], counters = { reads: {}, writes: {}, allowedLocalWrites: {}, providerCalls: {}, budgetAttempts: 0, profileIdsRead: [], localUserReadsInstrumented: !localUserStore, authWritesInstrumented: false };
  const bump = (kind, name) => { counters[kind][name] = (counters[kind][name] || 0) + 1; };
  const patch = (object, name, replacement) => {
    if (typeof object[name] !== "function") return;
    originals.push([object, name, object[name]]); object[name] = replacement;
  };
  const read = (name, fn) => patch(storage, name, async (...args) => { bump("reads", name); return copy(await fn(...args)); });
  patch(storage, "v3StoreReady", () => { bump("reads", "v3StoreReady"); return true; });
  if (!localUserStore) {
    read("getProfile", id => { counters.profileIdsRead.push(id); return byProfile[id] || null; });
    read("listFullProfiles", () => Object.values(profiles));
    read("listProfiles", () => Object.values(profiles));
  }
  read("listKnowledgeObjects", ({ limit = 500, offset = 0 } = {}) => knowledgeObjects.slice(offset, offset + limit));
  read("listKnowledgeObjectsByIds", ids => (ids || []).map(id => byKo[id]).filter(Boolean));
  read("getKnowledgeObjectByVorgang", id => knowledgeObjects.find(ko => ko.vorgang_id === id) || null);
  read("listMatchingResults", ({ userId } = {}) => matchingRows[userId] || []);
  read("getSourcesForVorgang", id => sourcesByVorgang[id] || []);
  const lageSources = lageSourcesFixture(knowledgeObjects, id => sourcesByVorgang[id] || []);
  read("listAktuelleLageQuellen", ids => lageSources(ids));
  read("getPublicationSourceIdentities", kos => Object.fromEntries((kos || []).map(ko => [ko.id, sourcesByVorgang[ko.vorgang_id] || []])));
  read("getSources", () => Object.values(profiles).map((profile, i) => ({ id: "source-positive-" + (i ? "b" : "a"), name: "Synthetische Testquelle " + (i ? "B" : "A"), type: "news", category: "medien", trust: "mittel", url: `https://quellen-${i ? "b" : "a"}.example.invalid/quelle`, active: true })));
  read("getLatestCompleteKnowledgeObjectAt", () => latestAt);
  if (!localUserStore) {
    read("getTasks", () => []);
    read("getUserNotes", () => []);
  }
  // Keine erfundene Erfolgsquittung, kein nicht gebundener Narrativtext.
  // Die echte Lage liefert Karten + pendingNarrative im cacheOnly-Read.
  read("getRenderedBriefingV3", () => null);

  const allowedLocalWriteNames = localUserStore ? ["saveProfile", "saveTask", "saveUserNote"] : [];
  for (const name of allowedLocalWriteNames) {
    const original = storage[name];
    patch(storage, name, async (...args) => { requireLocalUserStore(); bump("allowedLocalWrites", name); return original(...args); });
  }
  const writeNames = Object.keys(storage).filter(name => /^(?:save|delete|remove|update|reset|mark|recordLlm|acquirePipelineLock|releasePipelineLock|writeStore)/.test(name) && !allowedLocalWriteNames.includes(name));
  for (const name of writeNames) patch(storage, name, async () => { bump("writes", name); throw new Error("positive-data-forbidden-content-write:" + name); });
  for (const name of Object.keys(storage).filter(name => /^canSpendLlm/.test(name))) {
    patch(storage, name, async () => { counters.budgetAttempts++; return { allowed: false, reason: "positive-data-no-model" }; });
  }
  // Der Originalgenerator besitzt vor jeder Budget-/Providerarbeit einen echten
  // isAiEnabled()==false-Regelpfad. Diesen benoetigt die vorhandene Buero-UI.
  // Alle anderen Generierungen und exportierten Provideranfragen bleiben gesperrt.
  for (const name of Object.keys(ai).filter(name => name !== "generateCommunicationDraft" && /^(?:generate|request|enrichBriefingWithAI|extractKnowledgeObjectTags|assessParliamentaryItem|readSynthetik500)/.test(name))) {
    patch(ai, name, async () => { bump("providerCalls", name); throw new Error("positive-data-forbidden-provider:" + name); });
  }
  storage[INSTALLED] = true;
  let restored = false;
  return {
    profiles: copy(profiles), mandateA, mandateB, now: now.toISOString(), localUserStore, counters,
    fixture: () => copy({ profiles, knowledgeObjects, sourcesByVorgang, matchingRows }),
    summary: () => copy({ mandateA, mandateB, now: now.toISOString(), localUserStore, knowledgeObjects: knowledgeObjects.length,
      rawDocuments: Object.values(sourcesByVorgang).flat().length, sourceHosts: [...new Set(Object.values(sourcesByVorgang).flat().map(doc => new URL(doc.url).hostname))],
      datasetSha256: crypto.createHash("sha256").update(JSON.stringify({ profiles, knowledgeObjects, sourcesByVorgang })).digest("hex"),
      noHttpResponsesMocked: true, realAdaptersUntouched: true, pendingNarrativeExpected: true, noRunReceipt: true,
      contentWriteGuards: writeNames, allowedLocalWriteNames, communicationDraftUsesOriginalRuleFallback: true, counters }),
    assertNoWrites() {
      assert.equal(Object.values(counters.writes).reduce((sum, count) => sum + count, 0), 0, "Unerwarteter Content-Schreibversuch");
      assert.equal(Object.values(counters.providerCalls).reduce((sum, count) => sum + count, 0), 0, "Unerwarteter Provideraufruf");
      assert.equal(counters.budgetAttempts, 0, "Unerwarteter Modell-Budgetversuch");
    },
    restore() {
      if (restored) return; restored = true;
      for (const [object, name, original] of originals.reverse()) object[name] = original;
      delete storage[INSTALLED];
    }
  };
}

module.exports = { install };
