"use strict";
// Erfundenes Einzelmandat, Map Speicher und echte lokale Verbraucher. Kein Fachlauf.
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const B = require("../lib/helmut/briefing-speicher");
const K = require("../lib/helmut/briefing-profilkontext");
const Q = require("../lib/helmut/lage-quellenbeleg");
const S = require("../lib/helmut/storage");
const clone = structuredClone;
const { fixture, profile, day, now, briefing } = require("./fixtures/profilhash-integration");
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Normalpfad verweigert betroffenen Altstand ohne explizite Fachbasis", async () => {
    const f = fixture(); await assert.rejects(f.write({ profilkontextUebergang: null }), /abweichend/);
    assert.equal(f.writes, 0); assert.equal(f.builds, 0);
  });
  await test("Getrennte Neuanlage, voller Ruecklesebeleg und unveraendertes Original", async () => {
    const f = fixture(), before = JSON.stringify(f.rows.get(f.alt.id));
    const result = await f.write(); assert(result.ok && result.vollstaendig && !result.qualitaetBestanden);
    assert.equal(result.id, f.key); assert.equal(f.writes, 1); assert.equal(f.builds, 0);
    assert.equal(JSON.stringify(f.rows.get(f.alt.id)), before);
    assert.equal((await f.read()).id, f.key);
    assert.deepEqual(await f.read({ historisch: true }), f.alt);
    assert.equal((await f.read()).payload.profilHashVersion, 2);
  });
  await test("Identische Wiederholung mit neuer Uhrzeit schreibt nicht nochmals", async () => {
    const f = fixture(); await f.write(); const before = clone(f.rows.get(f.key));
    assert((await f.write({ now: new Date(day + "T12:01:00Z") })).bereitsVorhanden);
    assert.equal(f.writes, 1); assert.deepEqual(f.rows.get(f.key), before);
    assert((await f.write({ profilkontextUebergang: null })).bereitsVorhanden);
  });
  await test("Fehlende, negative oder veraltete aktuelle Urteile sperren vor Schreiben", async () => {
    for (const change of [f => { f.args.profilkontextUebergang = {}; },
      f => { f.fachbasis.urteil.aussagen[0].mandatsbezugGetragen = false; },
      f => { f.fachbasis.eingabe.tag = "2026-09-12"; },
      f => { f.fachbasis.urteil.gesamtpruefung.kriterien[Object.keys(f.fachbasis.urteil.gesamtpruefung.kriterien)[0]].bestanden = false; },
      f => { f.args.briefing = { ...briefing, available: false }; }]) {
      const f = fixture(); change(f); await assert.rejects(f.write(), /abweichend/); assert.equal(f.writes, 0);
    }
  });
  await test("Lage muss Quellen, Profilpruefung und Aussagehash exakt binden", async () => {
    for (const change of [f => f.rows.delete(f.text.id),
      f => { f.rows.get(f.text.id).payload.briefingEingabeHash = "a".repeat(64); },
      f => { f.rows.get(f.text.id).payload.koSetHash = "a".repeat(32); },
      f => { const p = f.rows.get(f.text.id).payload; p.quellen[0].quellenbelege[0].url = "https://example.invalid/fremd"; p.quellenHash = Q.hashEingabe(p.quellen); },
      f => { f.rows.get(f.text.id).payload.paragraphs[0].text = "vg-technische-kennung"; }]) {
      const f = fixture(); change(f); await assert.rejects(f.write(), /abweichend/); assert.equal(f.writes, 0);
    }
  });
  await test("Beschaedigter oder vollstaendiger Altbeleg eroeffnet keinen Uebergang", async () => {
    for (const change of [p => { p.pruefung.strukturellVollstaendig = true; },
      p => { p.inhaltHash = "a".repeat(64); }, p => { p.profilHashVersion = 3; }]) {
      const f = fixture(); change(f.rows.get(f.alt.id).payload);
      await assert.rejects(f.write(), /abweichend/); assert.equal(f.writes, 0);
    }
  });
  await test("Aenderung des Originals vor Schreiben sperrt ohne Neuanlage", async () => {
    const f = fixture(); let olds = 0;
    f.beforeRead = id => { if (id === f.alt.id && ++olds === 2) f.rows.get(id).payload.fremd = true; };
    await assert.rejects(f.write(), /abweichend/); assert.equal(f.writes, 0);
  });
  await test("Aenderung beim Schreiben oder spaeter entwertet den neuen Beleg", async () => {
    const f = fixture(); f.onInsert = row => { f.rows.set(row.id, clone(row));
      f.rows.get(f.alt.id).payload.fremd = true; return { saved: true }; };
    await assert.rejects(f.write(), /abweichend/); assert.equal(f.writes, 1);
    await assert.rejects(f.read(), /abweichend/);
    const g = fixture(); await g.write(); g.rows.get(g.alt.id).generated_at = day + "T04:02:00Z";
    await assert.rejects(g.read(), /abweichend/);
    assert.equal((await g.read({ historisch: true })).id, g.alt.id);
  });
  await test("Identische Einfuegekollision erlaubt, abweichende Kollision sperrt", async () => {
    const f = fixture(); f.onInsert = row => { f.rows.set(row.id, clone(row)); return { saved: false, reason: "existing-result" }; };
    assert((await f.write()).bereitsVorhanden); assert.equal(f.writes, 1);
    const g = fixture(); g.onInsert = row => { const x = clone(row); x.payload.profilkontextUebergang.fachbasis.urteil.aussagen[0].begruendung += " Anders.";
      x.payload.profilkontextUebergang.fachbasisHash = B.hash(x.payload.profilkontextUebergang.fachbasis);
      g.rows.set(x.id, x); return { saved: false, reason: "existing-result" }; };
    await assert.rejects(g.write(), /abweichend/); assert.equal(g.writes, 1);
  });
  await test("Bereits vorhandener gueltiger Nachfolger wird bei anderem Urteil nicht ersetzt", async () => {
    const f = fixture(); await f.write(); const before = clone(f.rows.get(f.key));
    f.fachbasis.urteil.aussagen[0].begruendung += " Anderes gueltiges Testurteil.";
    await assert.rejects(f.write(), /abweichend/);
    assert.equal(f.writes, 1); assert.deepEqual(f.rows.get(f.key), before);
  });
  await test("Unbekannter Schreibausgang und fehlender Rueckbeleg sind kein Erfolg", async () => {
    for (const mode of ["throw", "missing", "tamper"]) {
      const f = fixture(); f.onInsert = row => {
        if (mode !== "missing") f.rows.set(row.id, clone(row));
        if (mode === "throw") throw Error("unbekannter-schreibausgang");
        if (mode === "tamper") f.rows.get(row.id).payload.erzeugtAm = day + "T12:01:00Z";
        return { saved: true };
      };
      await assert.rejects(f.write()); assert.equal(f.writes, 1);
      assert.deepEqual(f.rows.get(f.alt.id), f.alt);
    }
  });
  await test("DB Verwaltungsdatum aendert die gebundene Nutzdatenprojektion nicht", async () => {
    const f = fixture(); await f.write(); f.rows.get(f.alt.id).created_at = day + "T04:01:01Z";
    assert.equal((await f.read()).id, f.key);
    assert.equal(K.standHash(f.rows.get(f.alt.id)), K.standHash(f.alt));
  });
  await test("Geaendertes Profil und falsche Mandatskennung sperren", async () => {
    const f = fixture(); await f.write();
    await assert.rejects(f.read({ profile: { ...profile, deputyCommittees: ["Finanzausschuss"] } }), /abweichend/);
    f.rows.get(f.key).user_id = "fremdes-mandat"; await assert.rejects(f.read(), /abweichend/);
    assert.throws(() => K.kennung(profile.id, day, "kurz"), /abweichend/);
  });
  await test("Echter App Zweig trennt aktuelle Auswahl und historischen Abruf", async () => {
    const f = fixture(); await f.write();
    const src = fs.readFileSync(require.resolve("../server.js"), "utf8");
    const start = src.indexOf("async function latestBriefingPayload("), end = src.indexOf("\n// opts.slot", start);
    assert(start > 0 && end > start);
    const latest = vm.runInNewContext(src.slice(start, end) + "\nlatestBriefingPayload", {
      require: name => { assert.equal(name, "./lib/helmut/briefing-speicher"); return B; }, prepareBriefingResponse: value => value });
    const original = S.getRenderedBriefingV3; S.getRenderedBriefingV3 = f.storage.getRenderedBriefingV3;
    try {
      const args = { politicianId: profile.id, profile };
      const current = await latest({ ...args, url: new URL("https://example.invalid/?aktuellGespeichert=" + day) });
      const historical = await latest({ ...args, url: new URL("https://example.invalid/?gespeichert=" + day) });
      assert.equal(current.gespeicherterNachweis.id, f.key); assert.equal(historical.gespeicherterNachweis.id, f.alt.id);
      assert(K.nachweisKennungGueltig(current.gespeicherterNachweis, profile.id, day));
      assert(!K.nachweisKennungGueltig({ ...current.gespeicherterNachweis, auswahl: "historisch" }, profile.id, day));
      assert.equal(current.gespeicherterNachweis.pruefung.bestanden, false);
      await assert.rejects(latest({ ...args, url: new URL(`https://example.invalid/?gespeichert=${day}&aktuellGespeichert=${day}`) }));
    } finally { S.getRenderedBriefingV3 = original; }
  });
  await test("Privater Export prueft Belegstruktur ohne Identitaetsprofil, aktueller Leser bleibt streng", async () => {
    const f = fixture(); await f.write();
    const pruefe = require("./github-privater-inhaltsnachweis-500").pruefeBelegzeilen;
    const rows = [clone(f.alt), clone(f.rows.get(f.key))];
    const { fullName, ...ohneIdentitaet } = profile;
    pruefe(rows, ohneIdentitaet, day);
    assert.throws(() => K.pruefeNachfolger(rows[1], rows[0],
      { userId: profile.id, day, profile: ohneIdentitaet }), /lagebindung-abweichend/);
    assert.throws(() => pruefe([rows[1]], profile, day));
    rows[1].payload.profilkontextUebergang.vorgaengerHash = "a".repeat(64);
    assert.throws(() => pruefe(rows, profile, day), /abweichend/);
  });
  await test("Echter Speicherleser adressiert neuen Schluessel mit Mandantenfilter", async () => {
    const f = fixture(); await f.write(); let query;
    const src = fs.readFileSync(require.resolve("../lib/helmut/storage"), "utf8");
    const start = src.indexOf("async function getRenderedBriefingV3("), end = src.indexOf("\n// GEBUENDELTER", start);
    assert(start > 0 && end > start);
    const getter = vm.runInNewContext(src.slice(start, end) + "\ngetRenderedBriefingV3", {
      v3StoreReady: () => true, assertTenant: S.assertTenant, assertTenantRows: (rows, op, uid) => assert(rows.every(r => r.user_id === uid)),
      tenantRequest: async (url, uid) => { query = url; assert.equal(uid, profile.id); return [clone(f.rows.get(f.key))]; },
      require: name => { assert.equal(name, "./briefing-profilkontext"); return K; }
    });
    assert.equal((await getter(profile.id, B.SLOT, day, { strict: true, profilHash: B.profilHash(profile) })).id, f.key);
    const url = new URL(query, "https://example.invalid");
    assert.equal(url.searchParams.get("id"), "eq." + f.key);
    assert.equal(url.searchParams.get("user_id"), "eq." + profile.id);
    await assert.rejects(getter(profile.id, "lage", day, { strict: true, profilHash: B.profilHash(profile) }));
  });
  await test("Nachtraegliche Aenderung des gespeicherten Fachurteils entwertet den Nachfolger", async () => {
    const f = fixture(); await f.write();
    f.rows.get(f.key).payload.profilkontextUebergang.fachbasis.urteil.aussagen[0].begruendung += " Veraendert.";
    await assert.rejects(f.read(), /abweichend/);
  });
  await test("Echter Insertwriter bewahrt das Original und erzwingt ignore duplicates", async () => {
    const f = fixture();
    // Echte Rohobjekte koennen undefined Felder enthalten, JSONB nicht.
    f.args.briefing.items[0].optional = undefined;
    f.fachbasis.briefing.items[0].optional = undefined;
    f.fachbasis.korrekturBasis.kos[0].optional = undefined;
    f.storage.insertRenderedBriefingV3 = row => S.insertRenderedBriefingV3(row, { bereit: true,
      request: async (url, opts) => {
        const parsed = new URL(url, "https://example.invalid");
        assert.equal(parsed.searchParams.get("user_id"), "eq." + profile.id);
        assert.equal(opts.method, "POST"); assert.match(opts.headers.Prefer, /ignore-duplicates/);
        const entry = JSON.parse(opts.body); assert.equal(entry.id, f.key);
        if (f.rows.has(entry.id)) return [];
        f.writes++; f.rows.set(entry.id, entry); return [clone(entry)];
      } });
    assert((await f.write()).ok); assert.equal(f.writes, 1); assert.deepEqual(f.rows.get(f.alt.id), f.alt);
  });
  console.log(`${count}/${count} synthetische Integrationsgruppen erfolgreich. Keine reale Fachabnahme oder Datenbankpruefung.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
