"use strict";
// Verwaltung zeigt je Profil Briefing · Zustellung · Lage; Radar nur im Profildetail;
// Brauchbar/Unbrauchbar ohne Fachurteil ausgeblendet; „Doppelt“ heißt Wiederholung zwischen Ansichten.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const { originalAdministrationPackage } = require("./original-verwaltung-paket");
const root = path.join(__dirname, "..");
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }

(async () => {
  const [{ originalHelpers }, { attachOriginalBackend }] = await Promise.all([
    import(pathToFileURL(path.join(root, "verwaltung/original-adapter.mjs"))),
    import(pathToFileURL(path.join(root, "verwaltung/original-controller.mjs")))]);
  const html = fs.readFileSync(path.join(root, "verwaltung/claude-original/Helmut Verwaltung v3.dc.html"), "utf8");
  const source = html.match(/<script\b[^>]*type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/i)[1];
  function component(data, hash = "#/uebersicht") {
    const host = { innerWidth: 1440, HV3: originalHelpers, scrollTo() {}, addEventListener() {}, removeEventListener() {} };
    class DCLogic { constructor(props) { this.props = props || {}; } setState(u) { Object.assign(this.state, typeof u === "function" ? u(this.state) : u); } }
    const Original = vm.runInNewContext(`${source}; Component`, { DCLogic, window: host, location: { hash }, setTimeout, clearTimeout });
    const reader = { read: async (key, id) => { if (key === "ergebnisse" && id) throw Object.assign(new Error("x"), { status: 500 }); return structuredClone(data[key]); }, clear() {}, dispose() {} };
    return new (attachOriginalBackend(Original, { readerFactory: () => reader, host }))({});
  }
  const pos = (stufe, ursache = null, code = null) => ({ stufe, ursache, code });
  const data = {
    overview: { generatedAt: "2026-11-06T08:00:00Z", mandates: [
      { id: "synthetic-a", fullName: "Fiktiv Alpha", profileActive: true }, { id: "synthetic-b", fullName: "Fiktiv Beta", profileActive: true }] },
    customers: { kunden: [] }, sources: {}, runs: { processRuns: [] }, budget: {},
    ergebnisse: { tag: "2026-11-06", verfuegbar: true, aktiv: 2, seite: 1, seiten: 1,
      bilanz: { briefing: { fehlt: 0, leer: 0, wiederholung: 1, unvollstaendig: 0, fehler: 0, nichtZugestellt: 0, nichtBeurteilt: 1, brauchbar: 0, unbrauchbar: 0 },
        zustellung: { fehlt: 1, leer: 0, wiederholung: 0, unvollstaendig: 0, fehler: 0, nichtZugestellt: 0, nichtBeurteilt: 1, brauchbar: 0, unbrauchbar: 0 },
        lage: { fehlt: 0, leer: 0, wiederholung: 0, unvollstaendig: 0, fehler: 0, nichtZugestellt: 0, nichtBeurteilt: 2, brauchbar: 0, unbrauchbar: 0 } },
      profile: [
        { id: "synthetic-a", positionen: { briefing: pos(3), zustellung: pos(3), lage: pos(3) }, letzterErfolg: "2026-11-06T05:02:00Z",
          radar: { vorhanden: true, abschnitte: [{ label: "Über dich", anzahl: 0 }, { label: "Umfeld", anzahl: 2 }, { label: "Dynamiken", anzahl: 1 }, { label: "Artikel", anzahl: 3 }], wiederholung: false, ohneQuelle: 1 } },
        { id: "synthetic-b", positionen: { briefing: pos(2, "wiederholung", "wiederholung-zwischen-ansichten"), zustellung: pos(0, "fehlt", "ergebnis-fehlt"), lage: pos(3) },
          letzterErfolg: null, radar: { vorhanden: false, abschnitte: [], wiederholung: null, ohneQuelle: null } }] }
  };
  const pkg = originalAdministrationPackage().html;

  await check("Profilliste: Spalten Briefing · Zustellung · Lage, keine Radar-Spalte", async () => {
    assert.match(pkg, /columnheader">Briefing<\/span><span role="columnheader">Zustellung<\/span><span role="columnheader">Lage<\/span>/);
    assert.doesNotMatch(pkg, /columnheader">Radar</); assert.doesNotMatch(pkg, /Radar \{\{ r\.rd\.low \}\}/);
    const c = component(data); await c.refresh(); c.setState({ route: { page: "profile" } });
    const rows = c.renderVals().rows, a = rows.find(r => r.href === "#/profil/synthetic-a"), b = rows.find(r => r.href === "#/profil/synthetic-b");
    assert.deepEqual([a.b.label, a.l.label, a.rd.label], ["Vollständig", "Vollständig", "Vollständig"]);
    assert.deepEqual([b.b.label, b.l.label, b.rd.label], ["Wiederholung", "Fehlt", "Vollständig"]);
    assert.equal(b.b.hint, "Wiederholung zwischen Ansichten"); assert.equal(a.st.label, "Nicht beurteilt"); assert.equal(b.st.label, "Problem");
    for (const r of [a, b]) for (const z of [r.b, r.l, r.rd]) assert.notEqual(z.dot, "var(--chance)", "nie grün ohne Fachurteil");
  });
  await check("Betrieb › Bilanz: drei Positionen, sechs Spalten ohne Brauchbar/Unbrauchbar", async () => {
    const c = component(data); await c.refresh(); c.setState({ route: { page: "betrieb", tab: "bilanz" } });
    const v = c.renderVals();
    assert.deepEqual(v.bilanzRows.map(r => r.label), ["Briefing", "Zustellung", "Lage"]);
    assert.deepEqual(v.bucketHeads.map(h => h.label), ["Fehlt", "Leer", "Wiederholung", "Unvollständig", "Nicht zugestellt", "Nicht beurteilt"]);
    assert.deepEqual(v.bilanzRows[1].cells.map(c => c.v), ["1", "–", "–", "–", "0", "1"]);
    assert.match(v.bilanzRows[0].cells[2].aria, /Wiederholung zwischen Ansichten: 1/);
    assert.equal(v.bilanzHead, "1 von 2 aktiven Profilen vollständig · nicht beurteilt.");
  });
  await check("Profildetail: Radar als Unterpunkt des Briefings, Zustellung ohne Stufe 2 und 4", async () => {
    const c = component(data, "#/profil/synthetic-a"); await c.refresh(); c.setState({ route: { page: "profil", id: "synthetic-a" } });
    const pd = c.renderVals().pd;
    assert.deepEqual(pd.areas.map(a => a.label), ["Briefing", "Zustellung", "Lage"]);
    assert.equal(pd.answers.find(a => a.k === "Radar im Briefing").v, "Über dich leer · Umfeld 2 · Dynamiken 1 · Artikel 3 · keine Wiederholung · 1 ohne Quell-URL");
    assert.deepEqual(pd.areas[1].segs.map(s => s.t), ["Lauf erfolgt", "Inhalt vorhanden · –", "Inhalt vollständig", "Inhalt brauchbar · –"]);
    assert.equal(pd.areas[0].segs[3].bg, "var(--line-2)", "Stufe 4 bleibt ohne Fachurteil offen");
    const c2 = component(data); await c2.refresh(); c2.setState({ route: { page: "profil", id: "synthetic-b" } });
    const pd2 = c2.renderVals().pd; assert.equal(pd2.answers.find(a => a.k === "Radar im Briefing").v, "Nicht im Paket"); assert.equal(pd2.st.label, "Problem");
  });
  await check("Übersicht: Kennzahlen und Ursachengruppen aus dem Ergebnisstand", async () => {
    const c = component(data); await c.refresh();
    const v = c.renderVals();
    assert.deepEqual([v.bigNums[2].value, v.bigNums[3].value], ["1", "1"]);
    assert.deepEqual(v.groups.map(g => `${g.areaLabel} · ${g.title}`), ["Zustellung · Ergebnis fehlt", "Briefing · Wiederholung zwischen Ansichten"]);
    assert.equal(v.health.label, "Störung");
  });
  await check("Ohne Ergebnisroute bleibt alles ehrlich „Nicht geprüft“", async () => {
    const c = component({ ...data, ergebnisse: { tag: "2026-11-06", verfuegbar: false } }); await c.refresh(); c.setState({ route: { page: "profile" } });
    const v = c.renderVals(); const a = v.rows.find(r => r.href === "#/profil/synthetic-a");
    assert.deepEqual([a.b.label, a.l.label, a.rd.label], ["Nicht geprüft", "Nicht geprüft", "Nicht geprüft"]);
    c.setState({ route: { page: "uebersicht" } }); assert.equal(c.renderVals().bigNums[2].value, "—");
    const ungeprueft = component({ ...data, overview: { ...data.overview, system: { deploy: { environment: "production" } } } }); await ungeprueft.refresh();
    assert.equal(ungeprueft.renderVals().bigNums[2].value, "—", "unbestätigter Profilbestand: keine Ergebniszahlen");
  });
  console.log(`${passed}/5 Verwaltungsprüfungen bestanden.`);
})().catch(error => { console.error(error); process.exit(1); });
