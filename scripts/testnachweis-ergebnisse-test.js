"use strict";
const assert = require("node:assert/strict");
const R = require("../lib/helmut/testnachweis-ergebnisse");
const A = require("../lib/helmut/briefing-ausgabebeleg");
const B = require("../lib/helmut/briefing-speicher");
const L = require("../lib/helmut/briefing-lauf");
const E = require("../lib/helmut/lage-quellenbeleg");
const Q = require("../lib/helmut/lage-textqualitaet");
const N = require("./fixtures/nachweis-null500");
const G = require("./github-briefingnachweis-500");
const { PROJECT_URL } = require("./github-fachzyklus-a");
const tag = "2026-09-19", zeit = "2026-09-19T12:02:00.000Z";
const jetzt = new Date("2026-09-19T12:11:00.000Z"), fenster = N.zeile("beendet").data;
const clone = value => structuredClone(value);
function fixture(userId = "local-versorgung") {
  const profile = { id: userId, committees: ["Bildung"] };
  const quellen = [{ vorgang_id: "vg-test", quellenbelege: [
    { quelle_id: "q-test", titel: "Das Kabinett beraet ueber Kita Standards.", auszug: "", url: "https://example.org/kita" },
    { quelle_id: "q-other", titel: "Ein Verband legt einen Vorschlag zur Lehrerausbildung vor.", auszug: "", url: "https://example.org/lehrer" }
  ] }];
  const paragraphs = quellen[0].quellenbelege.map(q => ({ text: q.titel, vorgang_ids: ["vg-test"] }));
  const checked = Q.pruefe(paragraphs, quellen, {
    vergleiche: [{ erster_absatz: 0, zweiter_absatz: 1, eigenstaendige_sachverhalte: true,
      pruefbegruendung: "Kita Standards und Lehrerausbildung sind verschiedene Sachverhalte." }],
    pruefungen: paragraphs.map((_, absatz) => ({ absatz, quelle_id: quellen[0].quellenbelege[absatz].quelle_id,
      belegfeld: "titel", vollstaendig_belegt: true, themenrein: true, profilbezug: true,
      textart: "konkreter_sachverhalt", pruefbegruendung: "Konkrete Beratung mit Bezug zum Bildungsausschuss." }))
  });
  assert.equal(checked.ok, true);
  const lage = { ...checked, quellen, quellenVersion: E.VERSION, quellenHash: E.hashEingabe(quellen),
    koSetHash: "a".repeat(32), generatedAt: zeit };
  const briefing = { available: true, items: [{ title: "PRIVATER_BRIEFINGTEXT" }],
    currentHelmutState: {}, currentRadarState: {} };
  const payload = { version: B.VERSION, mandat: userId, tag, profilHash: B.profilHash(profile),
    profilHashVersion: 2, briefing, lage, inhaltHash: B.hash({ briefing, lage }),
    pruefung: B.pruefeInhalt(briefing, lage), erzeugtAm: zeit };
  const paket = { id: `bf-${userId}-mandatsbriefing-${tag}`, user_id: userId, slot: B.SLOT, generated_at: zeit, payload };
  const q = L.quittung({ tenantId: userId, berlinTag: tag, status: L.STATUS_ERFOLG, erzeugtAm: zeit,
    signatur: L.inhaltsSignatur(briefing), ausgabeBeleg: A.ausPaket(paket) });
  const rows = [paket, { id: `bf-${userId}-lage-${tag}`, user_id: userId, slot: "lage", generated_at: zeit, payload: lage },
    { id: L.laufId(userId, tag), user_id: userId, slot: L.SLOT_ERFOLG, generated_at: zeit, payload: q }].map(clone);
  const app = { ...briefing, lageBriefing: { paragraphs }, gespeicherterNachweis: {
    id: paket.id, erzeugtAm: zeit, inhaltHash: payload.inhaltHash, profilHash: payload.profilHash, pruefung: payload.pruefung } };
  return { userId, tag, fenster, app, rows, jetzt };
}
const alle = (r, value) => R.ARTEN.forEach(art => assert.equal(r[art].vollstaendig, value, art + ": " + r[art].grund));
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
(async () => {
  await test("Drei gebundene Ergebnisse im Fenster, ohne fachliches Gesamturteil", () => {
    const f = fixture(), r = R.pruefe(f); alle(r, true);
    assert.equal(r.morgenbriefing.inhaltHash, B.hash(f.rows[0].payload.briefing));
  });
  await test("Andere Texte bei gleichen Kennungen und Zeiten sind keine gleiche Morgenversorgung", () => {
    const f = fixture(), p = f.rows[0].payload, signatur = L.inhaltsSignatur(p.briefing);
    p.briefing.items[0].title = "Ein anderer vollstaendiger Briefinginhalt";
    p.inhaltHash = B.hash({ briefing: p.briefing, lage: p.lage });
    f.app.gespeicherterNachweis.inhaltHash = p.inhaltHash;
    assert.equal(L.inhaltsSignatur(p.briefing), signatur, "Belegte Luecke der alten Signatur");
    assert.equal(R.pruefe(f).morgenbriefing.grund, "morgen-inhaltsbindung-fehlt");
    assert.equal(L.istWiederholung(f.rows[2].payload, signatur, A.ausPaket(f.rows[0])), false);
  });
  await test("Identischer Inhalt bleibt wiederholbar, fehlender oder fremder Hash nie", () => {
    const f = fixture(), q = f.rows[2].payload;
    assert.equal(L.istWiederholung(q, q.signatur, A.ausPaket(f.rows[0])), true);
    delete q.ausgabeBeleg;
    assert.equal(L.istWiederholung(q, q.signatur, A.ausPaket(f.rows[0])), false);
    assert.equal(R.pruefe(f).morgenbriefing.vollstaendig, false);
    q.ausgabeBeleg = A.ausPaket(f.rows[0]); q.ausgabeBeleg.mandat = "fremd";
    assert.equal(R.pruefe(f).morgenbriefing.vollstaendig, false);
  });
  await test("Ruecklesung muss den vollstaendigen neuen Ausgabebeleg enthalten", async () => {
    const f = fixture(), q = f.rows[2].payload;
    let row;
    const storage = { saveRenderedBriefingV3: async r => { row = clone(r); return { saved: true }; },
      getRenderedBriefingV3: async () => { const r = clone(row); r.payload.ausgabeBeleg.briefingHash = "b".repeat(64); return r; } };
    const r = await L.schreibeQuittung(storage, q);
    assert.equal(r.gespeichert, true); assert.equal(r.verifiziert, false);
  });
  await test("Alte, spaete, zukuenftige und fremde Tagesergebnisse werden nicht gezaehlt", () => {
    for (const t of ["2026-09-19T12:00:00Z", "2026-09-19T12:10:01Z", "2026-09-20T12:00:00Z"]) {
      const f = fixture(); for (const row of f.rows) row.generated_at = t;
      alle(R.pruefe(f), false);
    }
    const f = fixture(); f.jetzt = new Date("2026-09-19T12:01:00Z"); alle(R.pruefe(f), false);
    alle(R.pruefe({ ...fixture(), tag: "2026-09-18" }), false);
    const aktiv = fixture(); aktiv.fenster = N.zeile().data;
    aktiv.rows[2].generated_at = "2026-09-19T12:10:01Z";
    assert.equal(R.pruefe(aktiv).morgenbriefing.vollstaendig, false, "Manifestende gilt auch ohne Endquittung");
  });
  await test("Jede fehlende, doppelte oder fremde Zeile bleibt ein Nichtabschluss", () => {
    for (const [index, art] of [[0, "mandatsbriefing"], [1, "lage"], [2, "morgenbriefing"]]) {
      const f = fixture(); f.rows.splice(index, 1); assert.equal(R.pruefe(f)[art].vollstaendig, false);
    }
    const f = fixture(); f.rows.push(clone(f.rows[0])); alle(R.pruefe(f), false);
    const foreign = fixture(); foreign.rows[1].user_id = "fremd"; alle(R.pruefe(foreign), false);
  });
  await test("Leere Texte, abweichende Lage und bloss gespeichertes Gruen genuegen nicht", () => {
    const f = fixture(), p = f.rows[0].payload;
    p.briefing.items[0].title = " "; p.inhaltHash = B.hash({ briefing: p.briefing, lage: p.lage });
    f.app.gespeicherterNachweis.inhaltHash = p.inhaltHash;
    assert.equal(R.pruefe(f).mandatsbriefing.grund, "ergebnis-strukturell-unvollstaendig");
    const l = fixture(); delete l.rows[1].payload.generatedAt;
    l.rows[0].payload.lage = clone(l.rows[1].payload);
    l.rows[0].payload.inhaltHash = B.hash({ briefing: l.rows[0].payload.briefing, lage: l.rows[0].payload.lage });
    l.app.gespeicherterNachweis.inhaltHash = l.rows[0].payload.inhaltHash;
    assert.equal(R.pruefe(l).lage.grund, "ergebnis-ausserhalb-testfenster", "Keine erfundene Erzeugungszeit aus finalize");
    const old = fixture(); old.rows[1].payload.quellenVersion = 0;
    old.rows[0].payload.lage = clone(old.rows[1].payload);
    old.rows[0].payload.inhaltHash = B.hash({ briefing: old.rows[0].payload.briefing, lage: old.rows[0].payload.lage });
    old.app.gespeicherterNachweis.inhaltHash = old.rows[0].payload.inhaltHash;
    assert.equal(R.pruefe(old).lage.grund, "ergebnis-strukturell-unvollstaendig");
    const changed = fixture(); changed.app.gespeicherterNachweis.inhaltHash = "b".repeat(64);
    alle(R.pruefe(changed), false, "App und gespeicherte Ausgabe muessen inhaltsgleich sein");
  });
  await test("Zwei streng mandatsgefilterte GETs, eine Aenderung ist kein stabiler Beleg", async () => {
    const f = fixture(); let calls = 0;
    const fetchFn = async (url, init) => { calls++; const u = new URL(url);
      assert.equal(init.method, "GET"); assert.equal(init.redirect, "error");
      assert.equal(u.searchParams.get("user_id"), "eq." + f.userId);
      assert.equal(u.searchParams.get("limit"), "4");
      return { status: 200, headers: { get: () => "0-2/3" }, json: async () => clone(f.rows) }; };
    alle(await R.lese({ ...f, projectUrl: PROJECT_URL, key: "fixture", fetchFn }), true); assert.equal(calls, 2);
    calls = 0;
    const changed = async (...args) => { const r = await fetchFn(...args);
      if (calls === 2) r.json = async () => { const rows = clone(f.rows); rows[2].payload.grund = "geaendert"; return rows; }; return r; };
    alle(await R.lese({ ...f, projectUrl: PROJECT_URL, key: "fixture", fetchFn: changed }), false);
  });
  await test("Alle 500 nach Testende: 1500 Belege, voller Nenner, keine Textprobe als Faktenfreigabe", async () => {
    const gesehen = new Set(), sha = N.manifest.productionCommit;
    const profiles = [...N.manifest.ids, ...N.manifest.ausserhalb].map(user_id => ({ user_id, aktiv: false }));
    const env = { GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_SHA: sha, HELMUT_PRODUCTION_COMMIT: sha, HELMUT_NACHWEIS_TAG: tag, SUPABASE_URL: PROJECT_URL,
      HELMUT_NACHWEIS_TESTFENSTER: N.manifest.laufId, SUPABASE_SERVICE_ROLE_KEY: "fixture", HELMUT_CRON_SECRET: "fixture" };
    const response = (json, range) => ({ status: 200, headers: { get: () => range }, json: async () => json });
    const fetchFn = async (url, init) => {
      assert.equal(init.method, "GET"); const u = new URL(url);
      if (u.pathname === "/api/cron/testnachweis-status") return response({ ok: true, schemaVersion: 1,
        reinLesend: true, production: true, commit: sha, storageSupabase: true, v3Bereit: true,
        profileRelational: true, profileExclusive: true, retentionGueltig: true, kommunikationGesperrt: true,
        kohortenQuellenGesperrt: true, retention: 36, tagesdeckel: 2416, understandingReserve: 702, vorrangreserveReal: 200 });
      if (u.pathname === "/rest/v1/mandate_profiles") return response(profiles, "0-503/504");
      if (u.pathname === "/rest/v1/helmut_store") return response([N.zeile("beendet")], "0-0/1");
      if (u.pathname === "/api/cron/briefing-nachweis") {
        const id = u.searchParams.get("mandat"); gesehen.add(id); return response(fixture(id).app);
      }
      assert.equal(u.pathname, "/rest/v1/briefings");
      const id = u.searchParams.get("user_id").slice(3); assert(N.manifest.ids.includes(id));
      return response(fixture(id).rows, "0-2/3");
    };
    const r = await G.ausfuehren({ env, fetchFn, now: () => jetzt });
    assert.equal(r.ok, true); assert.equal(r.gelesen, 500); assert.deepEqual([...gesehen].sort(), N.manifest.ids);
    for (const art of R.ARTEN) assert.deepEqual(r.ergebnisArten[art], { ziel: 500, geprueft: 500, vollstaendig: 500,
      nichtBestaetigt: 0, gruende: { "struktur-und-fenster-bestaetigt": 500 } });
    assert.equal(r.funktionsnachweis500, false); assert.equal(r.vollstaendigeFaktenpruefung, false);
    const pub = JSON.stringify(G.oeffentlicherBericht(r));
    assert(!pub.includes("PRIVATER") && !pub.includes(N.manifest.ids[0]));
    r.results[0].ergebnisArten.lage = { vollstaendig: false, grund: "ergebnis-fehlt" };
    const bilanz = R.bilanziere(r.results); assert.equal(bilanz.lage.ziel, 500);
    assert.equal(bilanz.lage.vollstaendig, 499); assert.equal(bilanz.lage.nichtBestaetigt, 1);
    assert.equal(R.bilanziere([]).morgenbriefing.nichtBestaetigt, 500);
    assert.equal(R.bilanziere([{ ergebnisArten: R.offen("ergebnis-unlesbar") }]).lage.geprueft, 0,
      "Eine versuchte Lesung ist keine erfolgte Inhaltspruefung");
    r.results[0].ergebnisArten.lage.grund = "PRIVATER_GRUND";
    r.ergebnisArten.privat = "PRIVATER_TEXT";
    assert(!JSON.stringify(G.oeffentlicherBericht(r)).includes("PRIVAT"));
  });
  console.log(`${passed}/${passed} Testgruppen: Inhaltsbindung, drei Ergebnisarten, Testfenster und fester500er Nenner.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
