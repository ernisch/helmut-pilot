"use strict";
const A = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const P = require("../lib/helmut/prosa-einordnung");
const V = require("../lib/helmut/prosa-vorschau");
const F = require("./fixtures/prosa-einordnung");
const S = require("../lib/helmut/storage");
const B = require("../lib/helmut/briefing-speicher");
const server = require("../server");
const lage = require("../lib/helmut/lage");
const now = new Date("2026-09-21T09:00:00Z");
const source = fs.readFileSync(path.join(__dirname, "../client.js"), "utf8");
function fn(name) {
  const start = source.indexOf(`function ${name}(`);
  A(start >= 0); const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}
const escapeHtml = x => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
let passed = 0;
async function test(name, f) { await f(); passed++; console.log("PASS " + name); }
(async () => {
  const b = F.basis(), e = F.entwurf();
  const ausgaben = {};
  for (const bereich of ["briefing", "lage"]) {
    const p = P.binde({ ...b, bereich }), u = F.urteil(p.vorbereite(e));
    const handle = V.erzeuge({ ...b, bereich, entwurf: e, urteil: u });
    const build = bereich === "briefing"
      ? (profile, opts) => server.__buildV3Briefing(profile, profile.id, opts)
      : (profile, opts) => lage.buildLageBriefing(profile, opts);
    await test(`${bereich}: echter interner Einstieg bleibt ohne Speicher oder KI rein lesend`, async () => {
      const old = { list: S.listKnowledgeObjects, read: S.getRenderedBriefingV3, ready: S.v3StoreReady };
      S.listKnowledgeObjects = S.getRenderedBriefingV3 = S.v3StoreReady = () => { throw new Error("Unerwarteter Speicherzugriff"); };
      try {
        ausgaben[bereich] = await build(b.basis.profile, { prosaVorschau: handle, now });
        A.equal(ausgaben[bereich].prosaVorschau, true);
        A.deepEqual(ausgaben[bereich].prosaEinordnung, p.formuliere(e, u));
      } finally { S.listKnowledgeObjects = old.list; S.getRenderedBriefingV3 = old.read; S.v3StoreReady = old.ready; }
    });
    await test(`${bereich}: Request JSON, anderes Profil, Bereich oder Tag oeffnen keine Vorschau`, async () => {
      for (const opts of [{ prosaVorschau: JSON.parse(JSON.stringify(handle)), now },
        { prosaVorschau: handle, now: new Date("2026-09-22T09:00:00Z") }])
        await A.rejects(build(b.basis.profile, opts), /kontext-abweichend/);
      await A.rejects(build({ ...b.basis.profile, deputyCommittees: [] }, { prosaVorschau: handle, now }), /kontext-abweichend/);
      A.throws(() => V.lese(handle, { profile: b.basis.profile, userId: "fremd", tag: b.basis.tag, bereich }), /kontext-abweichend/);
      A.throws(() => V.lese(handle, { profile: b.basis.profile, userId: b.basis.profile.id,
        tag: b.basis.tag, bereich: bereich === "briefing" ? "lage" : "briefing" }), /kontext-abweichend/);
    });
  }
  await test("Vorschau kann weder direkt noch ueber Build einen Tagesnachweis speichern", async () => {
    const storage = { assertTenant: S.assertTenant, getRenderedBriefingV3: async () => null,
      insertRenderedBriefingV3: async () => { throw new Error("Unzulaessiger Schreibzugriff"); } };
    await A.rejects(B.materialisiere({ profile: b.basis.profile, userId: b.basis.profile.id,
      briefing: ausgaben.briefing, storage, now }), /vorschau-nicht-speicherbar/);
    await A.rejects(B.materialisiere({ profile: b.basis.profile, userId: b.basis.profile.id,
      build: async () => ausgaben.briefing, storage, now }), /vorschau-nicht-speicherbar/);
    A.equal(B.pruefeInhalt(ausgaben.briefing, ausgaben.lage).strukturellVollstaendig, false);
  });
  const context = vm.createContext({ URL, escapeHtml, briefing: null });
  vm.runInContext([fn("renderProsaEinordnung"), fn("renderLageView"), fn("renderHelmutView"),
    'function lageData() { return briefing.lageBriefing; }'].join("\n"), context);
  const html = {};
  await test("Beide echten View Funktionen rendern nur getrennte Bloecke und Quellen", () => {
    context.briefing = { ...ausgaben.briefing, lageBriefing: ausgaben.lage,
      currentHelmutState: { text: "Ungepruefter Altalias" } };
    html.briefing = vm.runInContext("renderHelmutView()", context);
    html.lage = vm.runInContext("renderLageView()", context);
    for (const h of Object.values(html)) {
      A(!h.includes("Ungepruefter Altalias"));
      A.equal(h.split('aria-label="KI Einordnung"').length - 1, 2);
      A.equal(h.split("Zusätzlich geprüft, kann Fehler enthalten.").length - 1, 2);
      A(h.includes(F.faelle[0].tatsache)); A(h.includes("Quelle öffnen"));
    }
  });
  await test("Quelltexte und Einordnung koennen weder HTML noch Javascript Links ausfuehren", () => {
    const bad = structuredClone(ausgaben.briefing.prosaEinordnung);
    bad.bloecke[0].tatsachen.saetze[0].text = '<img src=x onerror="alert(1)">';
    bad.bloecke[0].einordnung.felder[0].text = '<script>alert(1)</script>';
    bad.bloecke[0].quelle.url = "javascript:alert(1)";
    context.bad = bad;
    const h = vm.runInContext("renderProsaEinordnung(bad)", context);
    A(!h.includes("<img")); A(!h.includes("<script>")); A(!h.includes('href="javascript:'));
    A(h.includes("&lt;script&gt;"));
  });
  let pw;
  for (const candidate of ["playwright", path.join(path.dirname(process.execPath), "../lib/node_modules/playwright")]) {
    try { pw = require(candidate); break; } catch (_) {}
  }
  A(pw, "Playwright fehlt; keine gruene Browserpruefung");
  const browser = await pw.chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
    for (const bereich of ["briefing", "lage"]) for (const width of [320, 390, 1280]) for (const theme of ["dark", "light"]) {
      await test(`${bereich}: Chromium ${width}px ${theme}, Trennung und Inhalt sichtbar`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.setContent(`<html data-theme="${theme}"><head><meta charset="utf-8"><style>${css}</style></head><body>${html[bereich]}</body></html>`);
        A.equal(await page.locator(".prosa-block").count(), 2);
        A.equal(await page.locator(".prosa-einordnung h2").first().innerText(), "KI Einordnung");
        A(await page.locator(".prosa-einordnung").first().isVisible());
        A.equal(await page.locator('a[target="_blank"]').count(), 2);
        A.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        A.equal(await page.locator("script").count(), 0);
      });
    }
    A.deepEqual(errors, []);
  } finally { await browser.close(); }
  console.log(`${passed}/${passed} Vorschaugruppen bestanden; interner Produktpfad, kein Production Nachweis.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
