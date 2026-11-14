"use strict";

// Ausschliesslich neue Ergaenzungsinteraktionen. Echter Lage-/KI-/Phasenpfad,
// synthetische oeffentliche Quellen, lokaler HTTPS-Transport und kleine Ablage.
// Keine alten Testgruppen, Modelle, echte Datenbank oder Netzverbindungen.
const A = require("node:assert/strict"), { EventEmitter } = require("node:events"), https = require("node:https");
const S = require("../lib/helmut/storage"), AI = require("../lib/helmut/ai"), L = require("../lib/helmut/lage"),
  R = require("../lib/helmut/lage-ergaenzung"), T = require("../lib/helmut/lage-teilstand"),
  C = require("../lib/helmut/lage-verarbeitungsbeleg"), B = require("../lib/helmut/briefing-speicher"),
  E = require("../lib/helmut/lage-quellenbeleg"), Q = require("../lib/helmut/lage-textqualitaet");
const base = require("./fixtures/profilhash-integration"), env = { ...process.env }, NativeDate = Date;
const args = process.argv.slice(2), kostenvertragOnly = args.length === 1 && args[0] === "--kostenvertrag-only";
A(args.length === 0 || kostenvertragOnly, "Unbekannte Auswahl darf keine Pruefgruppen auslassen");
const K = require("../lib/helmut/betriebskosten-budget"), nativeReserve = K.reserviere;
const originalStorage = { ...S }, generate = AI.generateLageBriefing, request = https.request;
const providerControl = require("../lib/helmut/anbieter-steuerung"), steuerung = providerControl.steuerungAktiv;
const now = base.now, day = base.day, clone = structuredClone;
global.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now.getTime()])); } static now() { return now.getTime(); } };
function urteil(raw) {
  return { pruefungen: raw.paragraphs.map((p, absatz) => ({ absatz, quelle_id: p.quelle_id,
    belegfeld: "auszug", pruefbegruendung: "Die synthetische Quelle belegt genau diese Handlung.",
    vollstaendig_belegt: true, themenrein: true, profilbezug: true, textart: "konkreter_sachverhalt",
    mandatsbegruendung: p.mandatsbezug.wert + ": Der benannte Entwurf betrifft diesen Aufgabenbereich." })),
    vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
      pruefbegruendung: "Verschiedene konkret benannte synthetische Vorhaben." }] };
}
async function welt({ anzahl = 3 } = {}) {
  Object.assign(S, originalStorage); AI.generateLageBriefing = generate;
  https.request = () => A.fail("Kein Netzwerk ohne ausdruecklichen lokalen Transport");
  process.env.HELMUT_SCALABLE_PIPELINE = "on"; process.env.OPENAI_ENABLED = "true";
  process.env.HELMUT_KLASSEN_GRENZEN = "on";
  process.env.VERCEL_ENV = "test";
  process.env.OPENAI_API_KEY = "NUR_LOKALE_TRANSPORTATTRAPPE";
  for (const k of ["HELMUT_LAGE_DEMO", "HELMUT_PUBLICATION_ELIGIBILITY_JSON", "HELMUT_SOURCE_BLOCKLIST",
    "HELMUT_BETRIEBSKOSTENVERTRAG_JSON", "HELMUT_BETRIEBSZULASSUNG_JSON", "AZURE_OPENAI_KEY", "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_ENDPOINT", "HELMUT_KI_LOOPBACK_ERLAUBT"])
    delete process.env[k];
  providerControl.steuerungAktiv = () => false;
  const f = { rows: new Map(), requests: [], reservations: 0, saves: 0, locks: 0, phaseWrites: [] };
  const saetze = ["Der Ausschuss beriet einen Entwurf zur Pflegeversicherung.",
    "Der Ausschuss beriet einen Vorschlag zur Pflegeausbildung.", "Die Regierung legte einen Entwurf zu Zuschuesse fuer Pflegeeinrichtungen vor."];
  f.kos = saetze.slice(0, anzahl).map((text, i) => ({ id: `ko-ergaenzung-${i}`, vorgang_id: `vg-ergaenzung-${i}`,
    ko_version: 1, status: "update", understanding_status: "complete", was_ist_passiert: text,
    headline: "Pflege: " + text, display_summary: text, why_relevant: "Pflege", recommendation: "Zur Kenntnis.",
    updated_at: now.toISOString() }));
  const docs = Object.fromEntries(f.kos.map((k, i) => [k.vorgang_id, [{ id: `rd-ergaenzung-${i}`,
    title: k.headline, summary: saetze[i], source_name: "Synthetische amtliche Quelle",
    url: `https://example.invalid/ergaenzung/${i}`, published_at: day + "T05:00:00Z" }]]));
  f.profile = clone(base.profile);
  S.v3StoreReady = () => true;
  S.listKnowledgeObjects = async () => clone(f.kos);
  S.listMatchingResults = async () => [];
  S.getSourcesForVorgang = async id => clone(docs[id] || []);
  S.listAktuelleLageQuellen = require("./fixtures/lage-quellenmetadaten")(f.kos, S.getSourcesForVorgang);
  S.acquirePipelineLock = async () => { f.locks++; return true; };
  S.releasePipelineLock = async () => {};
  S.canSpendLlmForTenant = async () => ({ allowed: true });
  S.reserveLlmCall = async () => { f.reservations++; return { allowed: true }; };
  S.klasseBelege = async () => ({ verfuegbar: true, erlaubt: true, slot: "synthetischer-modellslot" });
  S.klasseGebeFrei = async () => {};
  S.recordLlmUsage = async () => ({ _ablage: { blob: true } });
  S.readAuthStore = async () => ({});
  S.getLageVerarbeitungsbeleg = async (user, id) => { A.equal(user, f.profile.id); return clone(f.rows.get(id) || null); };
  S.insertLageVerarbeitungsbeleg = async row => {
    A.equal(row.user_id, f.profile.id); f.phaseWrites.push(row.payload.phase);
    if (f.rows.has(row.id)) return { saved: false };
    f.rows.set(row.id, clone(row)); return { saved: true };
  };
  S.loeseLageVerarbeitungsstart = async () => A.fail("Kein gefaelschter Nichtversandbeleg darf loesen");
  S.getLageTeilstand = async (user, tag, hash) => clone(f.rows.get(T.kennung(user, tag, hash)) || null);
  S.insertLageTeilstand = async row => { if (!f.rows.has(row.id)) f.rows.set(row.id, clone(row)); return { saved: true }; };
  S.getRenderedBriefingV3 = async user => { A.equal(user, f.profile.id); return clone(f.rows.get(f.cacheId) || null); };
  S.saveRenderedBriefingV3 = async (row, { expectedLage }) => {
    A.deepEqual(f.rows.get(row.id) || null, expectedLage); f.saves++; f.rows.set(row.id, clone(row)); return { saved: true };
  };
  f.cacheId = `bf-${f.profile.id}-lage-${day}`;
  // Ein neuer Ausgangsfall: die echten strikten Funktionen bestaetigen nur den
  // ersten Absatz. Keine alte Suite wird aufgerufen und kein Provider benoetigt.
  AI.generateLageBriefing = async (quellen, profile, meta) => {
    A.equal(meta.lageErgaenzung, undefined); f.quellen = clone(quellen);
    f.draft = { paragraphs: quellen.slice(0, 2).map((v, i) => ({ vorgang_ids: [v.vorgang_id],
      quelle_id: v.quellenbelege[0].quelle_id, text: v.quellenbelege[0].auszug,
      mandatsbezug: { feld: i ? "ausschuss" : "schwerpunkt", wert: i ? "Petitionsausschuss" : "Pflege" },
      auswahlbegruendung: i ? "Petitionsausschuss: synthetische behauptete Passung." : "Pflege: synthetischer Pflegeentwurf." })) };
    f.review = urteil(f.draft); f.review.pruefungen[1].profilbezug = false;
    return generate(quellen, profile, { ...meta, gespeicherterEntwurf: f.draft, gespeichertePruefung: f.review });
  };
  const before = await L.buildLageBriefing(f.profile);
  A.equal(before.paragraphs.length, 1); A.equal(before.teilstand.vollstaendig, false);
  AI.generateLageBriefing = generate;
  f.part = [...f.rows.values()].find(row => row.slot === T.SLOT);
  f.args = { userId: f.profile.id, tag: day, profile: f.profile, eingabe: f.part.payload.eingabe,
    quellen: f.quellen, now };
  f.originals = JSON.stringify([...f.rows]); f.phaseWrites = [];
  f.ctx = () => R.vorbereiten(f.part.payload, f.args);
  f.data = () => R.lese(f.ctx(), f.quellen, f.profile, f.profile.id);
  f.raw = () => {
    const data = f.data(), v = data.alternativen[0], q = v.quellenbelege[0];
    return R.verbinde(f.ctx(), { ersatz: { vorgang_ids: [v.vorgang_id], quelle_id: q.quelle_id,
      text: q.auszug, mandatsbezug: { feld: "schwerpunkt", wert: "Pflege" },
      auswahlbegruendung: "Pflege: dieser weitere Entwurf betrifft den Schwerpunkt." } }, f.quellen, f.profile, f.profile.id);
  };
  f.full = () => ({ id: f.cacheId, user_id: f.profile.id, slot: "lage", generated_at: now.toISOString(), payload: {
    paragraphs: Q.pruefe(AI.assembleLageParagraphs(f.raw(), f.quellen, f.profile), f.quellen, urteil(f.raw()), f.profile).paragraphs,
    quellenVersion: E.VERSION, quellen: f.quellen, koSetHash: f.part.payload.koSetHash,
    quellenHash: f.part.payload.quellenHash, qualitaet: { version: Q.VERSION }, model: "bestaetigter-vollcache", generatedAt: now.toISOString() } });
  f.run = opts => L.buildLageBriefing(f.profile, opts);
  f.transport = ({ negativ = false, paar = false, unknown = null, onReview = null, draft = null } = {}) => {
    https.request = (_url, _options, callback) => {
      const req = new EventEmitter(); let body;
      req.write = value => { body = JSON.parse(value); };
      req.destroy = () => {};
      req.end = () => setImmediate(() => {
        const phase = body.text.format.schema.properties.ersatz ? "entwurf" : "pruefung";
        f.requests.push({ phase, body });
        if (phase === unknown) { req.emit("error", Object.assign(Error("Unbekannter Anbieterabschluss"), { kiNichtGesendet: true })); return; }
        const raw = f.raw(), result = phase === "entwurf" ? (draft || { ersatz: raw.paragraphs[1] }) : urteil(raw);
        if (phase === "pruefung") {
          A(f.phaseWrites.includes("entwurf"), "Entwurf muss vor Review bestaetigt sein");
          if (negativ) result.pruefungen[1].profilbezug = false;
          if (paar) result.vergleiche[0].eigenstaendige_sachverhalte = false;
          if (onReview) onReview();
        }
        const res = new EventEmitter(); res.statusCode = 200; res.setEncoding = () => {}; callback(res);
        res.emit("data", JSON.stringify({ status: "completed", usage: { input_tokens: 20, output_tokens: 10 },
          output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }] })); res.emit("end");
      });
      return req;
    };
  };
  f.phase = async () => C.begin({ userId: f.profile.id, tag: day, eingabe: f.data().eingabe, now }, S);
  return f;
}
function kostenwelt(f) {
  const contract = { version: 1, profileId: f.profile.id, startsAt: day + "T00:00:00.000Z",
    dailyLimitUsd: 1, totalLimitUsd: 30,
    route: { provider: "azure", responsesUrl: "https://offline.openai.azure.com/openai/v1/responses", model: "gpt-5-mini" } };
  Object.assign(process.env, { [K.ENV]: JSON.stringify(contract), AZURE_OPENAI_KEY: "NUR_LOKALE_AZURE_ATTRAPPE",
    AZURE_OPENAI_ENDPOINT: "https://offline.openai.azure.com", AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini" });
  let auth = { llmUsage: [] }, mutations = 0;
  S.listFullProfiles = async () => [{ ...f.profile, active: true }];
  S.readAuthStore = async () => clone(auth);
  S.mutateAuthStore = async change => { const next = clone(auth), result = await change(next); auth = next; mutations++; return result; };
  S.recordLlmUsage = async info => {
    const row = S.buildLlmUsageRecord(info); await S.mutateAuthStore(a => { a.llmUsage.push(row); });
    return { ...row, _ablage: { blob: true } };
  };
  const metas = [], tickets = [], transport = https.request;
  // Durchsichtige Beobachtung, keine Attrappe: die unveraenderte native
  // Reservierung samt privater pruefeAnfrage und echtem Kostenbuch entscheidet.
  K.reserviere = (input, deps) => { metas.push(clone(input.meta)); return nativeReserve(input, deps); };
  https.request = (...input) => {
    const pending = Object.values(auth[K.KEY]?.calls || {}).filter(call => call.status === "reserviert");
    A.equal(pending.length, 1, "Genau eine native Vollreserve muss vor dem Sender bestaetigt sein");
    tickets.push(pending[0].id); return transport(...input);
  };
  return { contract, metas, tickets, buch: () => clone(auth), mutations: () => mutations,
    restore: () => { K.reserviere = nativeReserve; } };
}
async function main() {
  let count = 0;
  const test = async (name, fn) => {
    if (kostenvertragOnly !== name.startsWith("Kostenvertrag:")) return;
    await fn(); count++; console.log("PASS " + name);
  };
  await test("Ergaenzungsvertrag bindet Originalnegativbeleg Tenant Profil Tag und feste Regel ohne erneute Teilfreigabe", async () => {
    const f = await welt(), data = f.data();
    A.deepEqual(f.data().eingabe, data.eingabe); A.equal(data.eingabe.originalBelegHash, f.part.payload.inhaltHash);
    A.deepEqual(data.positiv, f.draft.paragraphs[0]);
    A.throws(() => R.lese({}, f.quellen, f.profile, f.profile.id), /bindung/);
    A.throws(() => R.lese(f.ctx(), f.quellen, { ...f.profile, focusTopics: ["Fremd"] }, f.profile.id), /bindung/);
    for (const aendern of [p => { p.provenienz.originale.pruefung.payload.antwort.pruefungen[1].themenrein = false; },
      p => { delete p.provenienz.originale.pruefung; }, p => { p.tag = "2026-09-14"; }]) {
      const p = clone(f.part.payload); aendern(p); A.throws(() => R.vorbereiten(p, f.args), /bindung/);
    }
  });
  await test("Ohne weiteren Quellenartikel entstehen null Korrekturphasen und null Provideraufrufe", async () => {
    const f = await welt({ anzahl: 2 }); A.equal(f.ctx(), null);
    f.transport(); A.equal((await f.run()).paragraphs.length, 1);
    A.equal(f.requests.length, 0); A.deepEqual(f.phaseWrites, []); A.equal(f.saves, 0);
  });
  await test("Ein Ersatz wird mit wortgleichem Positivabsatz vollstaendig geprueft und privat gebunden gespeichert", async () => {
    const f = await welt(); f.transport(); const result = await f.run();
    A.equal(result.paragraphs.length, 2); A.equal(result.paragraphs[0].text, f.draft.paragraphs[0].text);
    A.deepEqual(f.requests.map(r => r.phase), ["entwurf", "pruefung"]); A.equal(f.reservations, 2);
    A.deepEqual(f.phaseWrites, ["start", "entwurf", "pruefstart", "pruefung"]);
    const p = f.rows.get(f.cacheId).payload;
    A(E.gespeicherterTextGueltig(p)); A.equal(p.koSetHash, f.part.payload.koSetHash);
    A.equal(p.quellenHash, f.part.payload.quellenHash); A.equal(p.ergaenzungsBeleg.originalBelegHash, f.part.payload.inhaltHash);
    A(!JSON.stringify(result).includes("ergaenzungsBeleg")); A(!JSON.stringify(result).includes("pruefbegruendung"));
    A(!JSON.stringify(result).includes("auswahlbegruendung")); A.equal(result.teilstand, undefined);
    A.equal(JSON.stringify([...f.rows].filter(([,r]) => r.slot === T.SLOT || r.payload.eingabeHash === B.hash(f.part.payload.eingabe))), f.originals);
    A.equal((await f.run()).paragraphs.length, 2); A.equal(f.requests.length, 2);
  });
  await test("Bekannt negatives Gesamturteil bleibt terminal und bewahrt den bestaetigten Teilstand", async () => {
    for (const art of ["profil", "paar"]) {
      const f = await welt(); f.transport({ negativ: art === "profil", paar: art === "paar" });
      A.equal((await f.run()).paragraphs.length, 1); A.equal((await f.run()).paragraphs.length, 1);
      A.equal(f.requests.length, 2); A.equal(f.saves, 0); A.deepEqual(f.rows.get(f.part.id), f.part);
    }
  });
  await test("Unbekannter Entwurfs oder Reviewausgang oeffnet keinen zweiten bezahlten Start auch mit Fehlerboolean", async () => {
    for (const unknown of ["entwurf", "pruefung"]) {
      const f = await welt(); f.transport({ unknown });
      A.equal((await f.run()).paragraphs.length, 1); const sent = f.requests.length;
      A.equal((await f.run()).paragraphs.length, 1); A.equal(f.requests.length, sent);
      A.equal(sent, unknown === "entwurf" ? 1 : 2); A.equal(f.saves, 0);
    }
  });
  await test("Gesicherter Zweierentwurf setzt nur noch nicht gestarteten Review fort und veraenderter Positivabsatz sperrt ihn", async () => {
    const f = await welt(), phase = await f.phase(); await phase.onDraft(f.raw()); f.transport();
    A.equal((await f.run()).paragraphs.length, 2); A.deepEqual(f.requests.map(r => r.phase), ["pruefung"]);
    const bad = await welt(), bp = await bad.phase(), raw = bad.raw(); raw.paragraphs[0].text += " Fremde Ergaenzung.";
    await bp.onDraft(raw); bad.transport(); A.equal((await bad.run()).paragraphs.length, 1); A.equal(bad.requests.length, 0);
  });
  await test("Ausgeschlossene Artikelidentitaet bleibt unter fremder q Kennung Tracking und URL Alias gesperrt", async () => {
    const f = await welt(), raw = f.raw();
    raw.paragraphs[1].quelle_id = f.draft.paragraphs[1].quelle_id;
    raw.paragraphs[1].vorgang_ids = f.draft.paragraphs[1].vorgang_ids;
    A.throws(() => R.pruefeEntwurf(f.ctx(), raw, f.quellen, f.profile, f.profile.id), /bindung/);
    const part = clone(f.part.payload), alt = clone(part.quellen[2]);
    const ausgeschlossen = part.quellen.find(v => v.quellenbelege.some(q => q.quelle_id === f.draft.paragraphs[1].quelle_id)).quellenbelege[0];
    alt.quellenbelege[0].url = ausgeschlossen.url.replace("https://", "https://www.") + "?utm_source=synthetik#abschnitt";
    alt.quellenbelege[0].quelle_id = "q-andere-identitaet"; part.quellen[2] = alt;
    part.quellenHash = E.hashEingabe(part.quellen); part.eingabe.quellenHash = part.quellenHash;
    // Neue, in sich gebundene synthetische Originalphasen fuer die neue Quellenbasis.
    for (const art of ["entwurf", "pruefung"]) {
      const old = part.provenienz.originale[art]; part.provenienz.originale[art] = C.eintrag({ userId: f.profile.id,
        tag: day, eingabeHash: B.hash(part.eingabe), phase: art, antwort: old.payload.antwort, owner: old.payload.owner, now });
    }
    const { inhaltHash, ...data } = part; part.inhaltHash = B.hash(data);
    A(T.gueltig(part, { ...f.args, eingabe: part.eingabe }));
    A.equal(R.vorbereiten(part, { ...f.args, eingabe: part.eingabe, quellen: part.quellen }), null);
  });
  await test("CacheOnly Legacy und ausdruecklicher missingOnly Pfad starten keine Ergaenzung", async () => {
    const f = await welt(); f.transport(); const locks = f.locks;
    A.equal((await f.run({ cacheOnly: true })).paragraphs.length, 1); A.equal(f.requests.length, 0); A.equal(f.locks, locks);
    let calls = 0; AI.generateLageBriefing = async (_q, _p, meta) => { calls++; A.equal(meta.lageErgaenzung, undefined); return null; };
    process.env.HELMUT_SCALABLE_PIPELINE = "off"; await f.run(); A.equal(calls, 1);
    process.env.HELMUT_SCALABLE_PIPELINE = "on"; await f.run({ missingOnly: true, beforeGenerate: async () => {} }); A.equal(calls, 2);
    A.equal(f.requests.length, 0);
    const off = await welt(), key = off.data().eingabeHash; off.transport(); delete process.env.OPENAI_API_KEY;
    A.equal((await off.run()).paragraphs.length, 1); A.equal(off.requests.length, 0); A.deepEqual(off.phaseWrites, []);
    A.equal(off.data().eingabeHash, key);
    process.env.OPENAI_API_KEY = "NUR_LOKALE_TRANSPORTATTRAPPE";
    A.equal((await off.run()).paragraphs.length, 2); A.equal(off.requests.length, 2); A.equal(off.data().eingabeHash, key);
    const replay = await welt(), rp = await replay.phase(); await rp.onDraft(replay.raw());
    await rp.beforeReview(); await rp.onReview(urteil(replay.raw())); replay.phaseWrites = []; replay.transport();
    delete process.env.OPENAI_API_KEY;
    S.canSpendLlmForTenant = async () => A.fail("Bestaetigte Phasen benoetigen keine neue Kostenfreigabe");
    A.equal((await replay.run()).paragraphs.length, 2); A.equal(replay.requests.length, 0); A.deepEqual(replay.phaseWrites, []);
  });
  await test("Vollcache gewinnt vor und waehrend der Ergaenzung und verlorener Schreibausgang wird lesend geklaert", async () => {
    const f = await welt(); f.rows.set(f.cacheId, f.full()); f.transport();
    A.equal((await f.run()).model, "bestaetigter-vollcache"); A.equal(f.requests.length, 0);
    const race = await welt(); race.transport({ onReview: () => race.rows.set(race.cacheId, race.full()) });
    A.equal((await race.run()).model, "bestaetigter-vollcache"); A.equal(race.saves, 0);
    const lost = await welt(); lost.transport(); const save = S.saveRenderedBriefingV3;
    S.saveRenderedBriefingV3 = async (...args) => { await save(...args); throw Error("Verlorene Schreibantwort"); };
    A.equal((await lost.run()).paragraphs.length, 2); A.equal(lost.saves, 1);
  });
  await test("Lock Budget und unbestaetigte Ablage lassen den unveraenderten gueltigen Teilstand verfuegbar", async () => {
    for (const art of ["lock", "budget", "store", "spaeterer-lesefehler", "bestaetigt-fehlend", "quelle-gesperrt", "erste-lesung-unbekannt"]) {
      const f = await welt(); f.transport({ onReview: () => {
        if (["spaeterer-lesefehler", "bestaetigt-fehlend", "quelle-gesperrt"].includes(art)) {
          S.getRenderedBriefingV3 = async () => { throw Error("Dauerhafter Lesefehler"); };
          S.getLageTeilstand = async () => { if (art === "bestaetigt-fehlend") return null; throw Error("Dauerhafter Lesefehler"); };
          if (art === "quelle-gesperrt") process.env.HELMUT_SOURCE_BLOCKLIST = "example.invalid";
        }
      } });
      if (art === "lock") S.acquirePipelineLock = async () => false;
      if (art === "budget") S.canSpendLlmForTenant = async () => ({ allowed: false });
      if (art === "store") S.saveRenderedBriefingV3 = async () => { throw Error("Unbekannter Speicherstand"); };
      if (art === "erste-lesung-unbekannt") S.getLageTeilstand = async () => { throw Error("Erstlesung unbestaetigt"); };
      const result = await f.run(), gesperrt = ["bestaetigt-fehlend", "quelle-gesperrt", "erste-lesung-unbekannt"].includes(art);
      A.equal(result.paragraphs.length, gesperrt ? 0 : 1);
      if (gesperrt) A.equal(result.available, false); else A.equal(result.teilstand.vollstaendig, false);
      A.deepEqual(f.rows.get(f.part.id), f.part);
      A.equal(f.requests.length, ["store", "spaeterer-lesefehler", "bestaetigt-fehlend", "quelle-gesperrt"].includes(art) ? 2 : 0);
    }
  });
  await test("Kostenvertrag: nativer Azurevertrag reserviert sendet und rechnet beide Ergaenzungsphasen mit leerem Testfeld ab", async () => {
    const f = await welt(); f.transport(); const k = kostenwelt(f), inputHash = f.data().eingabeHash;
    try {
      A.equal((await f.run()).paragraphs.length, 2);
      A.deepEqual(f.requests.map(r => r.phase), ["entwurf", "pruefung"]); A.equal(f.reservations, 2);
      A.equal(k.metas.length, 2); A(k.metas.every(m => m.costInputVersionHash === null && m.costAdmission === null));
      A.equal(new Set(k.tickets).size, 2);
      const auth = k.buch(), book = auth[K.KEY], calls = Object.values(book.calls);
      A.equal(calls.length, 2); A(calls.every(c => c.status === "abgerechnet" && c.model === k.contract.route.model));
      A.equal(book.bound, 2 * K.kosten(20, 10)); A.equal(auth.llmUsage.length, 2);
      K.pruefeBuch(book, K.vertrag(process.env));
      A.equal(f.rows.get(f.cacheId).payload.ergaenzungsBeleg.ergaenzungsEingabeHash, inputHash);
      A([...f.rows.values()].filter(r => r.payload.eingabeHash === inputHash).length === 4);
    } finally { k.restore(); }
  });
  await test("Kostenvertrag: unzulaessiges Testfeld wird vor Buchreserve und Sender gesperrt und historischer Start bleibt UNKNOWN", async () => {
    const f = await welt(); f.transport(); const k = kostenwelt(f), phase = await f.phase();
    try {
      const before = JSON.stringify([...f.rows]);
      await A.rejects(generate(f.quellen, f.profile, { politicianId: f.profile.id, lageErgaenzung: f.ctx(),
        costInputVersionHash: f.data().eingabeHash, onDraft: phase.onDraft,
        onReview: phase.onReview, beforeReview: phase.beforeReview }), { reason: "betriebskosten-testauftrag-gesperrt" });
      A.equal(k.metas[0].costInputVersionHash, f.data().eingabeHash);
      A.equal(k.mutations(), 0); A.equal(f.reservations, 0); A.equal(f.requests.length, 0);
      A.equal(k.buch()[K.KEY], undefined); A.equal((await f.run()).paragraphs.length, 1);
      A.equal(JSON.stringify([...f.rows]), before); A.equal(f.requests.length, 0);
    } finally { k.restore(); }
  });
  A.equal(count, kostenvertragOnly ? 2 : 10);
  console.log(`${count}/${count} ${kostenvertragOnly ? "neue native Kostenvertragsgegenfaelle" : "Lage-Ergaenzungsgruppen"} bestanden; keine echten Modelle Datenbank oder alten Testwiederholungen.`);
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(() => {
  Object.assign(S, originalStorage); AI.generateLageBriefing = generate; https.request = request;
  providerControl.steuerungAktiv = steuerung; global.Date = NativeDate;
  K.reserviere = nativeReserve;
  for (const key of Object.keys(process.env)) if (!Object.hasOwn(env, key)) delete process.env[key];
  Object.assign(process.env, env);
});
