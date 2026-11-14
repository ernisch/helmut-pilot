"use strict";

// Browser-/Mobile-Smoke (Audit-Fix 2026-07, Sprint 5): Die 564-KB-SPA wurde von
// keinem Test je in einem echten Browser geladen — Boot-Fehler auf dem Handy des
// Nutzers blieben bis zur Nutzerbeschwerde unentdeckt (Splash-Hänger-Klasse).
// Dieser Smoke bootet den ECHTEN server.js-Handler lokal (Pilot-Modus, lokaler
// Datei-Store, kein Supabase, kein LLM, kein externes Netz) und lädt die App in
// Chromium — Desktop (1280x800) und Mobil (390x844, iPhone-artig, Touch).
//
// Geprüft: App bootet (kein Splash-Hänger), keine fatalen JS-Fehler, die vier
// Bereiche Lage/Radar/Briefing/Büro sind erreichbar, mobile Navigation existiert.
//
// Voraussetzung: Playwright (in CI: npx playwright install chromium). Ohne
// Playwright wird der Test LOKAL mit klarer Meldung ÜBERSPRUNGEN (Exit 0) — die
// Offline-Suite bleibt dependency-frei lauffähig.
//
// FAIL-CLOSED in CI (Audit-Folgebranch 2026-07): Der SKIP-Pfad war fail-open —
// ein kaputt installiertes Playwright hätte das Merge-Gate grün gemacht, ohne
// irgendetwas zu testen. Deshalb bricht der Test mit Exit 1 ab, wenn Playwright
// fehlt UND CI=true (GitHub Actions setzt CI=true automatisch in ALLEN Jobs)
// oder HELMUT_REQUIRE_BROWSER=1 gesetzt ist (der browser-smoke-Job in
// .github/workflows/ci.yml installiert Playwright+Chromium selbst und setzt das
// Flag zusätzlich explizit). EINZIGE Ausnahme: unter run-offline-tests.js
// (HELMUT_OFFLINE_TEST=1) bleibt SKIP auch in CI erlaubt, denn der
// offline-suite-Job ist bewusst dependency-frei — die Browser-Pflicht liegt
// beim dedizierten browser-smoke-Job. HELMUT_REQUIRE_BROWSER=1 überstimmt
// diese Ausnahme.

const http = require("http");
const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, "..");
const tagespaketJsonb = process.argv.includes("--tagespaket-jsonb");
const tagespaketTeilstand = process.argv.includes("--tagespaket-teilstand");
const radarFrischeklarheit = process.argv.includes("--radar-frischeklarheit");
const kundenansichten = process.argv.includes("--kundenansichten");
const briefingTeilstand = process.argv.includes("--briefing-teilstand");
const radarArtikelbindung = process.argv.includes("--radar-artikelbindung");
if (radarArtikelbindung && process.argv.slice(2).some(arg => arg !== "--radar-artikelbindung")) throw Error("Radar-Artikelbindung ist ein eigener gezielter Tagespaketfall");
if (briefingTeilstand && process.argv.slice(2).some(arg => arg !== "--briefing-teilstand")) throw Error("Briefing-Teilstand ist ein eigener gezielter Tagespaketfall");
if (kundenansichten && process.argv.slice(2).some(arg => arg !== "--kundenansichten")) throw Error("Kundenansichten sind ein eigener gezielter Tagespaketfall");
const tagespaketRuhelageOnly = process.argv.includes("--nur-ruhelage");
if (tagespaketRuhelageOnly && !tagespaketJsonb) throw Error("--nur-ruhelage braucht --tagespaket-jsonb");
if (tagespaketTeilstand && (tagespaketJsonb || tagespaketRuhelageOnly)) throw Error("Teilstand ist ein eigener gezielter Tagespaketfall");
if (radarFrischeklarheit && (process.argv.includes("--tagespaket") || tagespaketJsonb || tagespaketTeilstand || tagespaketRuhelageOnly)) throw Error("Radar-Frischeklarheit ist ein eigener gezielter Tagespaketfall");
const tagespaketOnly = process.argv.includes("--tagespaket") || tagespaketJsonb || tagespaketTeilstand || radarFrischeklarheit || kundenansichten || briefingTeilstand || radarArtikelbindung;

function loadPlaywright() {
  const candidates = [
    "playwright",
    // global installiertes Playwright (z. B. /opt/node22/lib/node_modules)
    path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "playwright")
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch (_) { /* nächster Kandidat */ }
  }
  return null;
}

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Begrenzter Liefernachweis fuer den Verarbeitungskern: echte SPA und HTTP-/
// Auth-/Mandantenschicht, vorhandene erfundene Quellen, gespeicherter Paketstand.
// Kein Ersatz fuer historische Fach-, Last-, PWA- oder Verwaltungsnachweise.
async function tagespaketSmoke(playwright, { jsonb = false, ruhelageOnly = false, teilstand = false, radarFrische = false, kunden = false, teilbriefing = false, radarArtikel = false } = {}) {
  const assert = require("node:assert/strict");
  process.env.HELMUT_AUTH_MODE = "accounts";
  process.env.HELMUT_STORAGE_BACKEND = "local";
  process.env.HELMUT_SOURCE_MODE = "off";
  const B = require("../lib/helmut/briefing-speicher");
  const D = require("../lib/helmut/tagespaket-auslieferung");
  const L = require("../lib/helmut/briefing-lauf");
  const S = require("../lib/helmut/storage");
  const accounts = require("../lib/helmut/accounts");
  const ai = require("../lib/helmut/ai");
  const P = require("../lib/helmut/publication-eligibility");
  const previousPolicy = process.env[P.ENV];
  const originals = [S, accounts, ai, D].map(module => [module, { ...module }]);
  const forbidden = [];
  const fail = name => () => { forbidden.push(name); throw Error("Im Tagespaket-Smoke verboten: " + name); };
  // Vor dem Laden weiterer Fachmodule sperren, damit auch destrukturierte
  // Speicher-/Modellimporte nur die gesperrten Funktionen erhalten koennen.
  for (const [name, value] of Object.entries(S)) {
    if (typeof value === "function" && !["assertTenant", "v3StoreReady"].includes(name)) S[name] = fail("storage." + name);
  }
  for (const name of Object.keys(ai)) {
    if (/^(generate|request|enrich|assess|extractKnowledgeObjectTags|readSynthetik500.*Completion)/.test(name)
      && typeof ai[name] === "function") ai[name] = fail("ai." + name);
  }
  const fixture = require("./fixtures/profilhash-integration");
  const { day, now } = fixture;
  const profile = { ...fixture.profile, onboardedAt: now.toISOString() };
  const text = fixture.fixture().text;
  let rows = new Map([[text.id, structuredClone(text)]]);
  let briefing = structuredClone(fixture.briefing);
  let lageAnsicht = B.lageAusgabe(text.payload);
  assert.equal(lageAnsicht.fromCache, true);
  assert.equal(lageAnsicht.pendingNarrative, false);
  assert.deepEqual(lageAnsicht.quellenBindung, {
    koSetHash: text.payload.koSetHash, quellenHash: text.payload.quellenHash });
  briefing.items = briefing.items.map((item, i) => ({ ...item,
    title: lageAnsicht.vorgaenge[i].displayTitle, sources: lageAnsicht.vorgaenge[i].sources }));
  briefing.currentHelmutState.status = "fresh";
  briefing.currentRadarState = { status: "fresh", articles: [{ vorgangId: "vg-synth-1",
    title: "Gespeicherter synthetischer Radarhinweis" }] };
  briefing.tagespaketGrundlage = [1, 2].map(i => ({ id: `ko-synth-${i}`, vorgang_id: `vg-synth-${i}` }));
  if (radarFrische) {
    // Vorhandene erfundene Quelle: ein neuerer Rohstand ist kein Beleg fuer
    // einen neueren sichtbaren Radarhinweis. Keine neue Fachselektion im Test.
    const sichtbarAm = "2026-09-08T05:00:00Z";
    briefing.currentRadarState = { status: "fresh", generatedAt: now.toISOString(),
      lastUpdated: day + "T05:00:00Z", quality: { sourcesLoaded: true },
      anzeige: { status: "stale", lastUpdated: sichtbarAm, dynamics: [{
        vorgangId: "vg-synth-1", title: "Gespeicherte synthetische Dynamik",
        sourceUrl: "https://example.invalid/dokument/1", lastUpdatedAt: sichtbarAm
      }] } };
  }
  if (jsonb || teilstand || kunden || teilbriefing || radarArtikel) {
    process.env[P.ENV] = JSON.stringify({ version: 1, holds: [{
      publicationUrl: "https://example.invalid/held-publication", reason: "unresolved-event-relation",
      review: { id: "synthetic-browser-jsonb", receiptSHA256: "a".repeat(64),
        koSHA256: "b".repeat(64), sourceSHA256: "c".repeat(64) }
    }] });
    briefing.currentHelmutState = { status: "empty", emptyState: { kind: "quiet",
      headline: "Kein belegter Tagesanlass fuer ein Briefing",
      detail: "Die belegten Themen bleiben in der Lage. Daraus folgt keine Entwarnung." } };
    briefing.currentRadarState = { status: "fresh", anzeige: { status: "fresh", dynamics: [{
      vorgangId: "vg-synth-1", title: "Gespeicherte synthetische Dynamik",
      sourceUrl: "https://example.invalid/dokument/1", lastUpdatedAt: day + "T05:00:00Z"
    }] } };
    briefing.publicationEligibilityPolicy = P.publicInfo();
  }
  let langerTitel;
  let artikelStory;
  if (radarArtikel) {
    artikelStory = { oldTitle: "Synthetische Altpartei stimmt ueber den Koalitionsvertrag ab",
      newTitle: "Synthetische Koalitionspartner stimmen ueber denselben Vertrag ab",
      sourceUrl: "https://example.invalid/dokument/1", publishedAt: day + "T05:00:00Z" };
    const current = { title: artikelStory.newTitle, url: "https://www.example.invalid/dokument/1",
      publishedAt: artikelStory.publishedAt, name: "Synthetische Quelle" };
    briefing.items[0] = { ...briefing.items[0], title: artikelStory.oldTitle, primarySource: { ...current }, sources: [
      { title: artikelStory.oldTitle, url: "https://example.invalid/dokument/1-alt", publishedAt: "2026-09-12T05:00:00Z" }, current] };
    const env = { vorgangId: "vg-synth-1", documentId: "rd-synth-1", title: artikelStory.oldTitle,
      sourceUrl: artikelStory.sourceUrl, publishedAt: artikelStory.publishedAt, sourceName: "Synthetische Quelle",
      relationLabel: "Betrifft die Partei", ursprungsBeleg: { url: artikelStory.sourceUrl, documentId: "rd-synth-1" } };
    const dynamic = { vorgangId: "vg-synth-2", title: "Alter aggregierter Dynamiktitel",
      sourceUrl: "https://example.invalid/dokument/2", lastUpdatedAt: lageAnsicht.paragraphs[1].sources[0].publishedAt };
    const view = { status: "fresh", lastUpdated: artikelStory.publishedAt, mentions: [], articles: [],
      environment: { party: [env], constituency: [], committees: [] }, dynamics: [dynamic],
      summary: { line1: "Keine direkte Erwaehnung in dieser Ansicht.", line2: "Eine Entwicklung wird beobachtet." } };
    briefing.currentRadarState = { status: "fresh", profileId: profile.id, quality: { sourcesLoaded: true },
      environment: structuredClone(view.environment), dynamics: structuredClone(view.dynamics), anzeige: view };
  }
  if (teilbriefing) {
    briefing.currentHelmutState = { status: "empty", qualityStatus: "empty", tenantId: null, profileId: profile.id,
      primaryItem: null, primaryVorgangId: null, items: [], versorgung: { version: 1, zustand: "offen" },
      emptyState: { kind: "gap", headline: "Quellenversorgung noch unvollstaendig",
        detail: "Eine Tagesprioritaet ist noch nicht belegt." } };
  }
  if (kunden) {
    langerTitel = ("Synthetischer vollstaendiger Titel zur Beratung eines Haushaltsentwurfs und den zugehoerigen Ausschussunterlagen ").repeat(5).trim();
    lageAnsicht.vorgaenge[0].displayTitle = langerTitel;
    briefing.currentHelmutState = { status: "empty", tenantId: profile.id, profileId: profile.id,
      versorgung: { version: 1, zustand: "offen" }, emptyState: { kind: "gap",
        headline: "Quellenlage noch nicht ausreichend ausgewertet",
        detail: "Die Quellenverarbeitung ist noch nicht abgeschlossen. Ein ruhiger Nachrichtentag ist damit nicht belegt." } };
    briefing.currentRadarState = { status: "fresh", quality: { sourcesLoaded: true }, anzeige: {
      status: "fresh", summary: { line1: "In dieser Radaransicht werden derzeit keine direkten Erwähnungen angezeigt.",
        line2: "In deinem politischen Umfeld gibt es 3 neue Signale." }, dynamics: [
        { vorgangId: "vg-synth-1", title: "Erste gespeicherte Entwicklung", sourceUrl: "https://example.invalid/dokument/1", lastUpdatedAt: day + "T05:00:00Z" },
        { vorgangId: "vg-synth-2", title: "Zweite gespeicherte Entwicklung", sourceUrl: "https://example.invalid/dokument/2", lastUpdatedAt: day + "T05:00:00Z" },
        { vorgangId: "vg-synth-2", title: "Nicht oeffnender Hinweis", sourceUrl: "https://example.invalid/" }
      ] } };
  }
  let packageReads = 0;
  let identityReads = 0;
  let storage = { assertTenant: S.assertTenant,
    getRenderedBriefingV3: async (id, slot, tag) => {
      assert.equal(id, profile.id); assert.equal(tag, day); packageReads++;
      return structuredClone(rows.get(`bf-${id}-${slot}-${tag}`) || null);
    },
    insertRenderedBriefingV3: async row => {
      assert(!rows.has(row.id)); rows.set(row.id, structuredClone(row)); return { saved: true };
    }
  };
  if (jsonb || teilstand || kunden || teilbriefing || radarArtikel) {
    // Echter schmaler Identitaetsleser und echte Sperrpruefung, nur dessen
    // Datenquelle besteht aus zwei vorhandenen synthetischen Artikelidentitaeten.
    const identities = [1, 2].map(i => ({ knowledge_object_id: `ko-synth-${i}`,
      raw_document_id: `rd-synth-${i}`, raw_documents: { id: `rd-synth-${i}`,
        url: `https://example.invalid/dokument/${i}`, canonical_url: null } }));
    if (radarArtikel) identities.push({ knowledge_object_id: "ko-synth-1", raw_document_id: "rd-synth-1-alt",
      raw_documents: { id: "rd-synth-1-alt", url: "https://example.invalid/dokument/1-alt", canonical_url: null } });
    storage.getPublicationSourceIdentities = deps => originals[0][1].getPublicationSourceIdentities(deps, {
      request: async requestPath => {
        const url = new URL(requestPath, "https://local.invalid");
        assert.equal(url.pathname, "/rest/v1/ko_document_links");
        assert.equal(url.searchParams.get("select"), "knowledge_object_id,raw_document_id,raw_documents(id,url,canonical_url)");
        const filter = url.searchParams.get("knowledge_object_id");
        const ids = JSON.parse("[" + filter.slice(4, -1) + "]");
        assert.deepEqual(ids, ["ko-synth-1", "ko-synth-2"]);
        const offset = Number(url.searchParams.get("offset"));
        assert([0, 2].includes(offset)); identityReads++;
        return structuredClone(identities.slice(offset, offset + Number(url.searchParams.get("limit"))));
      }
    });
  }
  let teilFixture;
  if (teilstand) {
    // Derselbe Paket-/HTTP-/SPA-Harness, nur die neue positive Teilauswahl.
    // Auch die Insert-only-Vorstufe nutzt ausschliesslich lokalen Transport.
    teilFixture = await require("./lage-teilstand-test").fixture({
      storageApi: originals[0][1], fullText: text, packageNow: false });
    rows = teilFixture.rows; briefing = teilFixture.briefing; lageAnsicht = teilFixture.view;
    const identities = storage.getPublicationSourceIdentities;
    const readPackage = teilFixture.storage.getRenderedBriefingV3;
    storage = { ...teilFixture.storage, getPublicationSourceIdentities: identities,
      getRenderedBriefingV3: (...args) => { packageReads++; return readPackage(...args); } };
  }
  await B.materialisiere({ profile, userId: profile.id, now, briefing, lageAnsicht, storage });
  const row = rows.get(`bf-${profile.id}-${B.SLOT}-${day}`);
  assert(row, "Synthetisches Tagespaket muss vor dem Browserstart gespeichert sein");
  if (teilstand) {
    assert(require("../lib/helmut/lage-teilstand").gueltig(row.payload.lage, { userId: profile.id, tag: day, profile, now }));
    assert.equal(require("../lib/helmut/lage-quellenbeleg").gespeicherterTextGueltig(row.payload.lage), false);
    assert.deepEqual(row.payload.lage, teilFixture.part.payload);
  } else {
    assert(require("../lib/helmut/lage-quellenbeleg").gespeicherterTextGueltig(row.payload.lage),
      "Karten allein ersetzen keinen gespeicherten geprueften Narrativtext");
    assert.deepEqual(row.payload.lage, text.payload);
  }
  if (jsonb) {
    const info = row.payload.briefing.publicationEligibilityPolicy;
    const fromJsonb = { hash: info.hash, version: info.version, heldPublications: info.heldPublications };
    assert.notEqual(JSON.stringify(fromJsonb), JSON.stringify(info), "JSONB-Gegenfall braucht geaenderte Schluesselreihenfolge");
    row.payload.briefing.publicationEligibilityPolicy = structuredClone(fromJsonb);
    row.payload.quellenStand.publicationPolicy = structuredClone(fromJsonb);
    assert.equal(B.inhaltHash(row.payload), row.payload.inhaltHash, "Objektreihenfolge aendert keine Inhaltsbindung");
  }
  // Der bestehende Quellenzeitpunkt kann ohne neuen Tagesanlass einen ehrlichen
  // Teilstand ergeben. Fehlender Lage-/Quellenbeleg ist hier niemals zulaessig.
  const expectedErrors = kunden || teilbriefing ? ["quellenversorgung-unvollstaendig", "briefing-ohne-tagesanlass"] : teilstand ? ["lage-teilstand"]
    : jsonb || radarArtikel || briefing.currentHelmutState.tagesAnlass ? [] : ["briefing-ohne-tagesanlass"];
  assert.deepEqual(row.payload.pruefung.fehler, expectedErrors);
  const receipt = L.quittung({ tenantId: profile.id, berlinTag: day, erzeugtAm: now,
    status: L.STATUS_ERFOLG, ausgabeBeleg: require("../lib/helmut/briefing-ausgabebeleg").ausPaket(row),
    fensterStart: day + "T00:00:00Z" });
  rows.set(L.laufId(profile.id, day), { id: L.laufId(profile.id, day), user_id: profile.id,
    slot: L.SLOT_ERFOLG, generated_at: now.toISOString(), payload: receipt });
  const before = JSON.stringify([...rows]);
  // Nur die expliziten schmalen Leser duerfen die gespeicherte Testfixture lesen.
  // Jede andere Speicheroperation und jeder Modellaufruf scheitert sichtbar.
  S.getProfile = async id => { assert.equal(id, profile.id); return structuredClone(profile); };
  S.getTasks = S.getUserNotes = async id => { assert.equal(id, profile.id); return []; };
  S.getRenderedBriefingV3 = storage.getRenderedBriefingV3;
  if (jsonb || teilstand || kunden || teilbriefing || radarArtikel) S.getPublicationSourceIdentities = storage.getPublicationSourceIdentities;
  // Synthetischer Sitzungsanbieter; die HTTP-Autorisierung selbst bleibt echt.
  accounts.resolveSession = async token => token === "synthetic" ? { user: {
    id: "synthetic-browser-user", role: "abgeordneter", politicianId: profile.id } } : null;
  accounts.extendSession = async () => null;
  accounts.recordUserActivity = async () => {};
  const read = D.lese;
  D.lese = args => read({ ...args, now }); // Vorhandene Fixture-Uhr, kein Umstempeln.
  async function pruefeRuhelage(page, label, nav) {
    await page.locator(`${nav} [data-view="helmut"]`).click();
    const quiet = page.locator('.hstand-state-card[data-empty-kind="quiet"]');
    const started = Date.now(), introBefore = await page.locator(".helmut-refresh--intro").count();
    let visible = true;
    // Der bestehende Client zeigt beim ersten Oeffnen 1400ms Intro. Auf das
    // fachliche Ergebnis warten, ohne Timer oder Laufzeitverhalten zu veraendern.
    try { await quiet.waitFor({ state: "visible" }); }
    catch { visible = false; }
    const dom = await page.evaluate(() => ({
      frame: document.querySelector(".app-frame")?.className || null,
      intro: Boolean(document.querySelector(".helmut-refresh--intro")),
      status: briefing.currentHelmutState?.status,
      emptyKind: briefing.currentHelmutState?.emptyState?.kind,
      frischeAktuell: briefing.currentHelmutState?.frischeVertrag?.aktuell,
      cards: [...document.querySelectorAll(".hstand-state-card")].map(card => ({
        kind: card.dataset.emptyKind, title: card.querySelector(".hstand-state-title")?.innerText || null,
        sub: card.querySelector(".hstand-state-sub")?.innerText || null,
        lage: card.querySelector(".hstand-state-lage")?.innerText || null
      }))
    }));
    const detail = JSON.stringify({ introBefore, waitedMs: Date.now() - started, ...dom });
    console.log(`DIAG  ${label}: Ruhelage-DOM ${detail}`);
    check(`${label}: Briefing zeigt ehrliche gespeicherte Ruhelage mit weiterlaufenden Lagekarten`,
      visible && dom.cards.length === 1 && dom.cards[0].kind === "quiet"
      && dom.cards[0].sub === "Das ist keine Entwarnung."
      && String(dom.cards[0].lage).includes("2 Themen weiter"), detail);
  }
  let server, browser;
  try {
    const handler = require(path.join(root, "server.js"));
    server = http.createServer(handler);
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    browser = await playwright.chromium.launch({
      executablePath: process.env.HELMUT_BROWSER_EXECUTABLE_PATH || undefined,
      headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
    });
    if (ruhelageOnly) console.log("WIEDERVERWENDET, NICHT ERNEUT AUSGEFUEHRT: 13 erfolgreiche JSONB-Browserchecks aus CI43511072972. Hier nur die zwei fehlgeschlagenen Ruhelageanzeigen.");
    for (const [label, viewport, isMobile] of [
      ["Desktop", { width: 1280, height: 800 }, false], ["Mobil", { width: 390, height: 844 }, true]
    ]) {
      const context = await browser.newContext({ viewport, isMobile, hasTouch: isMobile,
        serviceWorkers: "block", bypassCSP: true });
      context.setDefaultTimeout(10000);
      try {
        await context.addCookies([{ name: "helmut_session", value: "synthetic", url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
        await context.addInitScript(() => sessionStorage.setItem("helmut:install-dismissed", "1"));
        const unexpected = [], pageErrors = [], apiErrors = [], methods = [];
        await context.route("**/*", async route => {
          const request = route.request(), url = new URL(request.url());
          if (url.origin !== baseUrl) { unexpected.push(request.url()); return route.abort(); }
          if (url.pathname.startsWith("/api/")) methods.push(request.method());
          if (request.method() !== "GET") { unexpected.push(request.method() + " " + url.pathname); return route.abort(); }
          // Unbeteiligter Parlamentsfeed gehoert nicht zum Tagespaket-Liefervertrag.
          if (url.pathname === "/api/parliament") return route.fulfill({ contentType: "application/json", body: '{"items":[]}' });
          if (url.pathname.startsWith("/api/")
            && !["/api/auth/session", "/api/security/csrf", "/api/app/start"].includes(url.pathname)) {
            unexpected.push(url.pathname); return route.abort();
          }
          return route.continue();
        });
        const page = await context.newPage();
        // Nur die neue synthetische Variante: Date folgt derselben Fixturezeit
        // wie D.lese; echte Timer/Intro laufen weiter. Keine Server-/Systemuhr.
        if (teilbriefing || radarArtikel) await page.clock.setFixedTime(now);
        page.on("pageerror", error => pageErrors.push(error.message));
        page.on("response", response => {
          if (new URL(response.url()).pathname.startsWith("/api/") && response.status() >= 400) apiErrors.push(response.status() + " " + response.url());
        });
        const readsBefore = packageReads;
        const identityReadsBefore = identityReads;
        const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === "/api/app/start");
        await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
        const response = await responsePromise, start = await response.json();
        if (radarArtikel) {
          assert.equal(response.status(), 200); assert.equal(start.profile?.id, profile.id);
          const b = start.briefing;
          assert.equal(b.gespeicherterNachweis.inhaltHash, row.payload.inhaltHash);
          assert.equal(b.paketStatus.quittungGebunden, true);
          assert.equal(b.currentRadarState.anzeige.environment.party[0].title, artikelStory.newTitle);
          assert.equal(b.currentRadarState.environment.party[0].title, artikelStory.oldTitle);
          await page.waitForFunction(() => window.__helmutClientLoaded === true && !document.body.classList.contains("is-loading"));
          await page.locator(`${isMobile ? ".mobile-dock" : ".nav-list"} [data-view="radar"]`).click();
          const root = page.locator("#radar2-root"); await root.waitFor({ state: "visible" });
          const env = root.locator(`.radar2-row[href="${artikelStory.sourceUrl}"]`);
          const sourceDate = await page.evaluate(at => radarTime(at), artikelStory.publishedAt);
          check(`${label}: Partei-Radarkarte zeigt Titel Link und Datum desselben neuen Artikels statt altem Akteurtitel`,
            await env.locator(".radar2-row-title").innerText() === artikelStory.newTitle
            && (await env.innerText()).includes(sourceDate)
            && !(await root.innerText()).includes(artikelStory.oldTitle));
          const dynamics = root.locator('.radar2-card--dynamic[href="https://example.invalid/dokument/2"]');
          check(`${label}: auch die sichtbare Dynamik verwendet ausschliesslich die eigene gespeicherte Artikelueberschrift`,
            await dynamics.locator(".radar2-card-title").innerText() === lageAnsicht.paragraphs[1].sources[0].title
            && !(await root.innerText()).includes("Alter aggregierter Dynamiktitel")
            && b.currentRadarState.anzeige.dynamics.length === 1);
          assert.equal(packageReads - readsBefore, 2); assert.equal(identityReads - identityReadsBefore, 2);
          assert.deepEqual(pageErrors, []); assert.deepEqual(apiErrors, []); assert.deepEqual(unexpected, []);
          assert(methods.every(method => method === "GET"));
          continue; // Nur die neuen Artikelkarten, keine alten Browserfaelle.
        }
        if (teilbriefing) {
          assert.equal(response.status(), 200); assert.equal(start.profile?.id, profile.id);
          const b = start.briefing;
          assert.equal(b.gespeicherterNachweis.inhaltHash, row.payload.inhaltHash);
          assert.equal(b.vorlaeufigerBriefingstand.tag, day); assert.equal(b.paketStatus.quittungGebunden, true);
          assert.equal(b.paketStatus.vollstaendig, false); assert.deepEqual(b.paketStatus.fehler, expectedErrors);
          await page.waitForFunction(() => window.__helmutClientLoaded === true && !document.body.classList.contains("is-loading"));
          await page.locator(`${isMobile ? ".mobile-dock" : ".nav-list"} [data-view="helmut"]`).click();
          const card = page.locator("[data-ui-briefing-teilstand]"); await card.waitFor({ state: "visible" });
          assert.deepEqual(await card.locator("[data-ui-briefing-absatz]").allTextContents(), text.payload.paragraphs.map(p => p.text));
          for (const [i, paragraph] of lageAnsicht.paragraphs.entries()) {
            const article = card.locator("article").nth(i), q = paragraph.sources[0];
            assert.equal(await article.locator(`a[href="${q.url}"]`).count(), 1);
            const date = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long", year: "numeric" }).format(new Date(q.publishedAt));
            assert((await article.innerText()).includes(date));
          }
          check(`${label}: vorlaeufiges Briefing zeigt wortgleiche gepruefte Absaetze mit eigenen Quelldaten und offenem Tagesurteil`,
            (await card.innerText()).includes("Eine Tagespriorität und Handlungsempfehlung sind noch nicht belegt.")
            && await page.locator(".ui-briefing-status .hstand-status").innerText() === "Vorläufiger Stand"
            && (await page.locator(".ui-briefing-status .hstand-meta-line").innerText()).includes("Tagespaket vorbereitet:")
            && await page.locator('.hstand-state-card[data-empty-kind="gap"]').count() === 1
            && await page.locator(".ui-briefing-hero").count() === 0);
          const limits = await page.evaluate(() => {
            const state = briefing.currentHelmutState, saved = structuredClone(briefing), own = profile;
            const absent = change => { briefing = structuredClone(saved); change(); return renderBriefingTeilstand(briefing.currentHelmutState) === ""; };
            try {
              const results = [
                absent(() => { briefing.vorlaeufigerBriefingstand = null; }),
                absent(() => { briefing.paketStatus.quittungGebunden = false; }),
                absent(() => { briefing.vorlaeufigerBriefingstand.tag = "2026-09-12"; }),
                absent(() => { briefing.vorlaeufigerBriefingstand.tag = briefing.paketStatus.tag = "2026-09-12";
                  briefing.vorlaeufigerBriefingstand.paketErzeugtAm = briefing.gespeicherterNachweis.erzeugtAm = "2026-09-12T12:00:00Z"; }),
                absent(() => { briefing.vorlaeufigerBriefingstand.absaetze[0].quellenIds = ["fremde-quelle"]; }),
                absent(() => { briefing.vorlaeufigerBriefingstand.absaetze[0] = null; }),
                absent(() => { briefing.lageBriefing.paragraphs[0].sources = []; }),
                absent(() => { briefing.currentHelmutState.errorState = true; }),
                absent(() => { briefing.currentHelmutState.emptyState.kind = "quiet"; }),
                absent(() => { briefing.currentHelmutState.tenantId = "fremd"; })
              ];
              briefing = structuredClone(saved); profile = { ...own, id: "fremdes-profil" };
              results.push(renderBriefingTeilstand(state) === ""); profile = own;
              briefing = structuredClone(saved);
              const raw = '<img data-unerlaubt src="x" onerror="window.unerlaubt=true">';
              briefing.lageBriefing.paragraphs[0].text = raw;
              const el = document.createElement("div"); el.innerHTML = renderBriefingTeilstand(state);
              results.push(!el.querySelector("img") && el.querySelector("[data-ui-briefing-absatz]")?.textContent === raw);
              briefing = structuredClone(saved);
              briefing.currentHelmutState = { ...state, status: "fresh", primaryVorgangId: "vg-synth-1",
                primaryItem: { id: "vg-synth-1", title: "Echter vollstaendiger Briefingvorgang", sourceUrl: "https://example.invalid/dokument/1" } };
              const full = renderHelmutStandView(); results.push(full.includes("ui-briefing-hero") && !full.includes("data-ui-briefing-teilstand"));
              return results;
            } finally { briefing = saved; profile = own; }
          });
          assert(limits.every(Boolean));
          assert.equal(packageReads - readsBefore, 2); assert.equal(identityReads - identityReadsBefore, 2);
          assert.deepEqual(pageErrors, []); assert.deepEqual(apiErrors, []); assert.deepEqual(unexpected, []);
          assert(methods.every(method => method === "GET"));
          check(`${label}: Teilbriefing verbirgt fremde ungebundene leere Fehler- und Ruhelageinhalte und voller Stand behaelt Vorrang`, limits.every(Boolean));
          continue; // Nur neue Teilbriefingfaelle; keine historischen Browsergruppen.
        }
        if (kunden) {
          assert.equal(response.status(), 200); assert.equal(start.profile?.id, profile.id);
          assert.equal(start.briefing?.gespeicherterNachweis?.inhaltHash, row.payload.inhaltHash);
          assert.deepEqual(start.briefing.paketStatus.fehler, expectedErrors);
          assert.deepEqual(start.briefing.lageBriefing.paragraphs, lageAnsicht.paragraphs);
          await page.waitForFunction(() => window.__helmutClientLoaded === true && !document.body.classList.contains("is-loading"));
          const nav = isMobile ? ".mobile-dock" : ".nav-list";
          await page.locator(`${nav} [data-view="briefing"]`).click();
          const einordnung = page.locator("[data-ui-lage-einordnung]");
          await einordnung.waitFor({ state: "visible" });
          const texte = await einordnung.locator("[data-ui-lage-absatz]").allTextContents();
          assert.deepEqual(texte, text.payload.paragraphs.map(p => p.text));
          for (const [i, paragraph] of lageAnsicht.paragraphs.entries()) {
            assert.equal(await einordnung.locator("article").nth(i).locator(`a[href="${paragraph.sources[0].url}"]`).count(), 1);
          }
          const vorKarten = await einordnung.evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector(".ui-lage-workspace")) & Node.DOCUMENT_POSITION_FOLLOWING));
          const titel = page.locator("[data-ui-lage-select] .ui-row-title").first();
          const titelStil = await titel.evaluate(el => ({ text: el.textContent, clamp: getComputedStyle(el).webkitLineClamp,
            overflow: getComputedStyle(el).overflow, height: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight) }));
          assert.equal(titelStil.text, langerTitel);
          if (isMobile) assert(titelStil.clamp === "3" && titelStil.overflow === "hidden" && titelStil.height <= titelStil.line * 3 + 1);
          await page.locator("[data-ui-lage-select]").first().click();
          assert.equal(await page.locator(".ui-lage-detail .vsheet-title").innerText(), langerTitel);
          const grenzen = await page.evaluate(() => {
            const data = lageData(), previous = profile;
            const ohneQuellen = renderLageEinordnung({ ...data, paragraphs: data.paragraphs.map(p => ({ ...p, sources: [] })) }) === "";
            const nichtVerfuegbar = renderLageEinordnung({ ...data, available: false }) === "";
            profile = { ...profile, id: "synthetisches-fremdmandat" };
            const fremd = renderLageEinordnung(data) === ""; profile = previous;
            const text = '<img data-unerlaubtes-bild src="x" onerror="window.unerlaubt=true">';
            const container = document.createElement("div");
            container.innerHTML = renderLageEinordnung({ ...data, paragraphs: [{ ...data.paragraphs[0], text }] });
            return { ohneQuellen, nichtVerfuegbar, fremd, escaped: !container.querySelector("img")
              && container.querySelector("[data-ui-lage-absatz]")?.textContent === text };
          });
          assert(Object.values(grenzen).every(Boolean));
          await page.locator(`${nav} [data-view="helmut"]`).click();
          const gap = page.locator('.hstand-state-card[data-empty-kind="gap"]'); await gap.waitFor({ state: "visible" });
          check(`${label}: gepruefte Lage ist direkt lesbar mit eigenen Quellen, kompaktem Titel und ehrlichem Briefinggap`,
            vorKarten && texte.length === 2 && (await gap.innerText()).includes("Quellenlage noch nicht ausreichend ausgewertet")
            && await page.locator("[data-ui-lage-einordnung]").count() === 0
            && await page.locator(".ui-briefing-hero").count() === 0);
          await page.locator(`${nav} [data-view="radar"]`).click();
          const summary = page.locator(".radar2-summary"), lines = summary.locator(".radar2-summary-line");
          const originalLine1 = briefing.currentRadarState.anzeige.summary.line1;
          const plural = await lines.nth(1).innerText();
          assert.equal(await lines.first().innerText(), originalLine1);
          assert.equal(await page.locator(".radar2-card--dynamic").count(), 2);
          await page.evaluate(() => { briefing.currentRadarState.anzeige.dynamics = briefing.currentRadarState.anzeige.dynamics.slice(0, 1); rerenderRadar(); });
          const singular = await lines.nth(1).innerText();
          await page.evaluate(() => {
            briefing.currentRadarState.anzeige.dynamics = [{ title: "Kein oeffnender Dynamikbeleg", sourceUrl: "https://example.invalid/" }];
            briefing.currentRadarState.anzeige.environment = { party: [{ vorgangId: "vg-synth-1", title: "Gespeicherter Umfeldhinweis",
              sourceName: "Synthetische Quelle", sourceUrl: "https://example.invalid/dokument/1" }], constituency: [], committees: [] };
            rerenderRadar();
          });
          const ohneDynamik = await lines.nth(1).innerText();
          check(`${label}: Radar beschreibt nur oeffnende beobachtete Entwicklungen ohne alte Neuigkeitsbehauptung`,
            plural.endsWith("werden 2 Entwicklungen beobachtet.") && singular.endsWith("wird eine Entwicklung beobachtet.")
            && ohneDynamik.startsWith("Eine Entwicklung aus ") && ohneDynamik.endsWith("politischen Umfeld ist relevant.")
            && await page.locator(".radar2-card--dynamic").count() === 0
            && await lines.first().innerText() === originalLine1 && !/neue Signale|neues Signal/.test(await summary.innerText()));
          assert.equal(packageReads - readsBefore, 2); assert.equal(identityReads - identityReadsBefore, 2);
          assert.deepEqual(pageErrors, []); assert.deepEqual(apiErrors, []); assert.deepEqual(unexpected, []);
          assert(methods.every(method => method === "GET"));
          continue; // Nur die zwei neuen Kundenansichtenfaelle, keine Altgruppen.
        }
        if (radarFrische) {
          assert.equal(response.status(), 200);
          assert.equal(start.profile?.id, profile.id);
          assert.equal(start.briefing?.gespeicherterNachweis?.inhaltHash, row.payload.inhaltHash);
          await page.waitForFunction(() => window.__helmutClientLoaded === true && !document.body.classList.contains("is-loading"));
          await page.locator(`${isMobile ? ".mobile-dock" : ".nav-list"} [data-view="radar"]`).click();
          const root = page.locator("#radar2-root");
          await root.waitFor({ state: "visible" });
          const radarText = await root.innerText();
          const statusText = await root.locator(".radar2-status").innerText();
          const sourceDate = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin",
            day: "numeric", month: "short", year: "numeric" }).format(new Date("2026-09-08T05:00:00Z"));
          check(`${label}: Radar unterscheidet sichtbaren Quellenstand von neuerem Rohstand und Quellenpruefung`,
            statusText === "Letzter angezeigter Quellenstand: " + sourceDate
            && radarText.includes("In diesem gespeicherten Radar liegt kein neuerer belegter Hinweis vor.")
            && radarText.includes("Prüfzeitraum und Quellenabdeckung sind nicht ausgewiesen.")
            && radarText.includes("Beobachtete Entwicklungen")
            && !radarText.includes("Veralteter Radarstand") && !radarText.includes("Neue Dynamiken")
            && !radarText.includes("Eine aktuelle Quellenprüfung ist nicht bestätigt.")
            && await root.locator('.radar2-card--dynamic[href="https://example.invalid/dokument/1"]').count() === 1,
            radarText);
          // Nur neue Darstellungsgrenzen in der echten geladenen SPA: kein
          // Ersatzpaket, keine API-/Quellen-/Modellarbeit und kein Altfalllauf.
          await page.evaluate(() => {
            briefing.currentRadarState = { status: "stale", quality: { sourcesLoaded: true },
              emptyState: { kind: "stale" } };
            rerenderRadar();
          });
          const emptyText = await root.innerText();
          check(`${label}: leerer aelterer Radarstand behauptet weder Trefferlosigkeit noch fehlgeschlagene Quellenpruefung`,
            emptyText.includes("Keine belegten Hinweise in diesem älteren Stand")
            && emptyText.includes("Die leere Ansicht belegt keine Trefferlosigkeit.")
            && !emptyText.includes("Eine aktuelle Quellenprüfung ist nicht bestätigt.")
            && await root.locator('[data-empty-kind="stale"]').count() === 1,
            emptyText);
          await page.evaluate(() => {
            briefing.currentRadarState = { status: "stale", available: true,
              quality: { reason: "keine-vorgaenge", sourcesLoaded: false } };
            rerenderRadar();
          });
          const gapText = await root.innerText();
          check(`${label}: echte Datengrundlagenluecke bleibt vor blossem Quellenalter sichtbar`,
            gapText.includes("Noch keine Datengrundlage")
            && gapText.includes("Die Datenbasis liefert keine ausgewerteten Vorgänge.")
            && !gapText.includes("Keine belegten Hinweise in diesem älteren Stand")
            && await root.locator('[data-empty-kind="datenluecke"]').count() === 1,
            gapText);
          assert.equal(packageReads - readsBefore, 2);
          assert.deepEqual(pageErrors, []); assert.deepEqual(apiErrors, []); assert.deepEqual(unexpected, []);
          assert(methods.every(method => method === "GET"));
          continue; // Ausschliesslich die neuen Radar-Klarheitsgrenzen.
        }
        if (teilstand) {
          const b = start.briefing, positive = teilFixture.draft.paragraphs[1].text;
          const negative = teilFixture.draft.paragraphs[0].text;
          check(`${label}: gepruefter Teilstand wird ueber echte Sitzung und gespeichertes Tagespaket ausgeliefert`,
            response.status() === 200 && start.profile?.id === profile.id && b?.available === true
            && b.paketStatus?.zustand === "teilweise" && b.paketStatus.vollstaendig === false
            && b.paketStatus.quittungGebunden === true && b.paketStatus.tag === day
            && b.gespeicherterNachweis?.inhaltHash === row.payload.inhaltHash
            && b.gespeicherterNachweis?.profilHash === row.payload.profilHash);
          assert.deepEqual(b.paketStatus.fehler, ["lage-teilstand"]);
          assert.deepEqual(b.publicationEligibilityPolicy, P.publicInfo());
          assert.deepEqual(b.paketStatus.quellenStand, row.payload.quellenStand);
          assert.deepEqual(b.lageBriefing.paragraphs, lageAnsicht.paragraphs);
          assert.equal(b.lageBriefing.paragraphs.length, 1);
          assert.equal(b.lageBriefing.paragraphs[0].text, positive);
          assert.equal(b.lageBriefing.teilstand.vollstaendig, false);
          assert(!JSON.stringify(b).includes("provenienz"));
          assert(!JSON.stringify(b).includes("mandatsbegruendung"));
          assert(!JSON.stringify(b.lageBriefing).includes(negative));
          await page.waitForFunction(() => window.__helmutClientLoaded === true && !document.body.classList.contains("is-loading"));
          const nav = isMobile ? ".mobile-dock" : ".nav-list";
          await page.locator(`${nav} [data-view="briefing"]`).click();
          const hint = page.locator("[data-ui-lage-teilstand]");
          await hint.waitFor({ state: "visible" });
          const cards = page.locator("[data-ui-lage-select]");
          await page.locator('[data-ui-lage-select="vg-synth-2"]').click();
          check(`${label}: positiver Absatz und ehrlicher Teilhinweis sind sichtbar, negatives Urteil bleibt verborgen`,
            (await hint.innerText()).includes("Lage als geprüfter Teilstand")
            && (await hint.innerText()).includes("wegen fehlenden Profilbezugs zurückgehalten")
            && await cards.count() === 2
            && (await page.locator(".ui-lage-detail .vsheet-lede").innerText()).includes(positive)
            && await page.locator('.ui-lage-detail .ui-source-access a[href="https://example.invalid/dokument/2"]').count() === 1
            && !(await page.locator(".app-frame").innerText()).includes(negative)
            && !(await page.locator(".app-frame").innerText()).includes("mandatsbegruendung"));
          check(`${label}: Teilstand liest unter aktiver Publikationssperre nur Paket Quittung und gebundene Identitaeten`,
            packageReads - readsBefore === 2 && identityReads - identityReadsBefore === 2
            && pageErrors.length === 0 && apiErrors.length === 0 && unexpected.length === 0
            && methods.every(method => method === "GET"), [...pageErrors, ...apiErrors, ...unexpected].slice(0, 3).join(" | "));
          continue; // Keine historischen Tagespaket-, JSONB- oder Ruhelagefaelle.
        }
        if (jsonb) {
          const b = start.briefing;
          if (ruhelageOnly) {
            await page.waitForFunction(() => window.__helmutClientLoaded === true && !document.body.classList.contains("is-loading"));
            await pruefeRuhelage(page, label, isMobile ? ".mobile-dock" : ".nav-list");
            continue;
          }
          check(`${label}: JSONB-Paket mit aktiver Sperre kommt durch echte Sitzungs-/HTTP-Autorisierung`,
            response.status() === 200 && start.profile?.id === profile.id && b?.available === true
            && b.paketStatus?.zustand === "gespeichert" && b.paketStatus.vollstaendig === true
            && b.paketStatus.quittungGebunden === true && b.paketStatus.tag === day
            && b.gespeicherterNachweis?.inhaltHash === row.payload.inhaltHash
            && b.gespeicherterNachweis?.profilHash === row.payload.profilHash);
          assert.deepEqual(b.publicationEligibilityPolicy, P.publicInfo());
          assert.deepEqual(b.paketStatus.quellenStand, row.payload.quellenStand);
          assert.deepEqual(b.paketStatus.fehler, []);
          assert.deepEqual(b.lageBriefing.paragraphs, lageAnsicht.paragraphs);
          await page.waitForFunction(() => window.__helmutClientLoaded === true && !document.body.classList.contains("is-loading"));
          check(`${label}: SPA nimmt gespeicherte Ruhelage mit identischer Profil- und Quellenbindung an`,
            await page.evaluate(expected => profile.id === expected.tenant
              && briefing.gespeicherterNachweis.inhaltHash === expected.hash
              && briefing.currentHelmutState.status === "empty"
              && briefing.currentHelmutState.emptyState.kind === "quiet"
              && !briefing.currentHelmutState.tagesAnlass,
            { tenant: profile.id, hash: row.payload.inhaltHash }));
          const nav = isMobile ? ".mobile-dock" : ".nav-list";
          await pruefeRuhelage(page, label, nav);
          await page.locator(`${nav} [data-view="radar"]`).click();
          const radar = page.locator('.radar2-card--dynamic[href="https://example.invalid/dokument/1"]');
          check(`${label}: gespeicherte Radar-Dynamik mit oeffnender Originalquelle bleibt sichtbar`,
            await radar.count() === 1 && (await radar.innerText()).includes("Gespeicherte synthetische Dynamik"));
          await page.locator(`${nav} [data-view="briefing"]`).click();
          const cards = page.locator("[data-ui-lage-select]");
          assert.equal(await cards.count(), 2);
          await cards.first().click();
          check(`${label}: gespeicherte gepruefte Lage bleibt nach JSONB-Auslieferung vollstaendig erreichbar`,
            (await page.locator(".ui-lage-detail .vsheet-lede").innerText()).includes(text.payload.paragraphs[0].text)
            && await page.locator('.ui-lage-detail .ui-source-access a[href="https://example.invalid/dokument/1"]').count() === 1);
          check(`${label}: aktive Sperre liest nur Paket, Quittung und zwei gebundene Artikelidentitaeten`,
            packageReads - readsBefore === 2 && identityReads - identityReadsBefore === 2);
          check(`${label}: JSONB-Auslieferung braucht keine Modelle, Korpusabrufe oder Schreibauftraege`,
            pageErrors.length === 0 && apiErrors.length === 0 && unexpected.length === 0
            && methods.every(method => method === "GET"), [...pageErrors, ...apiErrors, ...unexpected].slice(0, 3).join(" | "));
          continue; // Die historischen Tagespaketfaelle gehoeren nicht zu diesem neuen Gegenfall.
        }
        check(`${label}: echter autorisierter Appstart liefert gespeichertes Tagespaket`, response.status() === 200
          && start.profile.id === profile.id && start.briefing.gespeicherterNachweis.inhaltHash === row.payload.inhaltHash
          && start.briefing.gespeicherterNachweis.profilHash === row.payload.profilHash
          && start.briefing.paketStatus.tag === day && start.briefing.paketStatus.quittungGebunden === true
          && JSON.stringify(start.briefing.paketStatus.quellenStand) === JSON.stringify(row.payload.quellenStand));
        assert.deepEqual(start.briefing.lageBriefing.paragraphs, lageAnsicht.paragraphs);
        check(`${label}: gepruefter Narrativtext mit ehrlichem Paketstatus ausgeliefert`,
          start.briefing.lageBriefing.pendingNarrative === false
          && JSON.stringify(start.briefing.paketStatus.fehler) === JSON.stringify(expectedErrors)
          && start.briefing.paketStatus.zustand === (expectedErrors.length ? "teilweise" : "gespeichert"));
        await page.waitForFunction(() => window.__helmutClientLoaded === true && !document.body.classList.contains("is-loading"));
        check(`${label}: Client hat exakt diesen Paketstand angenommen`, await page.evaluate(expected =>
          profile.id === expected.tenant && briefing.gespeicherterNachweis.inhaltHash === expected.hash,
        { tenant: profile.id, hash: row.payload.inhaltHash }));
        const nav = isMobile ? ".mobile-dock" : ".nav-list";
        // Historische View-IDs: briefing = Lage, helmut = Briefing.
        for (const view of ["radar", "helmut", "office", "briefing"]) {
          await page.locator(`${nav} [data-view="${view}"]`).click();
          await page.locator(`.app-frame.view-${view}`).waitFor({ state: "visible" });
          check(`${label}: ${view} aus gespeichertem Paket erreichbar`, await page.locator(`${nav} [data-view="${view}"].active`).count() === 1);
        }
        const cards = page.locator("[data-ui-lage-select]");
        check(`${label}: beide gespeicherten Lagekarten bleiben sichtbar`, await cards.count() === 2
          && (await cards.allTextContents()).every((title, i) => title.includes(lageAnsicht.vorgaenge[i].displayTitle)));
        await cards.first().click();
        check(`${label}: gespeicherter belegter Text erscheint im Lage-Detail`,
          (await page.locator(".ui-lage-detail .vsheet-lede").innerText()).includes(text.payload.paragraphs[0].text));
        check(`${label}: Originalquelle der gespeicherten Karte bleibt erhalten`, await page.locator(
          '.ui-lage-detail .ui-source-access a[href="https://example.invalid/dokument/1"]').count() === 1);
        check(`${label}: Start und Navigation brauchen nur Paket und Quittung`, packageReads - readsBefore === 2);
        check(`${label}: keine JS-/API-Fehler, externen Abrufe oder Schreibauftraege`, pageErrors.length === 0
          && apiErrors.length === 0 && unexpected.length === 0 && methods.every(method => method === "GET"),
        [...pageErrors, ...apiErrors, ...unexpected].slice(0, 3).join(" | "));
        const csrf = await (await context.request.get(baseUrl + "/api/security/csrf")).json();
        const foreign = await context.request.get(baseUrl + "/api/app/start?politicianId=foreign",
          { headers: { "x-csrf-token": csrf.token } });
        check(`${label}: manipulierte Mandatsauswahl bleibt an eigene Sitzung gebunden`, foreign.status() === 200
          && (await foreign.json()).profile.id === profile.id);
        const anonymous = await browser.newContext();
        try { check(`${label}: ohne Sitzung kein Tagespaket`, (await anonymous.request.get(baseUrl + "/api/app/start")).status() === 401); }
        finally { await anonymous.close(); }
      } finally { await context.close(); }
    }
    if (ruhelageOnly) {
      // Schutzwachen bleiben aktiv; daraus wird kein wiederholter 13. PASS.
      assert.deepEqual(forbidden, []); assert.equal(JSON.stringify([...rows]), before);
    } else {
      check(radarArtikel ? "Radar-Artikelbindung ohne Korpus Modell oder Speicherveraenderung" : teilbriefing ? "Vorlaeufiges Briefing ohne Korpus Modell oder Speicherveraenderung" : kunden ? "Kundenansichten ohne Korpus Modell oder Speicherveraenderung" : radarFrische ? "Radar-Frischeklarheit ohne Korpus Modell oder Speicherveraenderung"
        : teilstand ? "Teilstand-Auslieferung ohne Korpus Modell oder Speicherveraenderung"
        : jsonb ? "JSONB-Gegenfall ohne Korpus, Modell oder Speicherveraenderung" : "Tagespaket-Lieferung ohne Korpus, Modell oder Speicherveraenderung", forbidden.length === 0
        && JSON.stringify([...rows]) === before, forbidden.join(", "));
    }
  } finally {
    if (browser) await browser.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    for (const [module, original] of originals) Object.assign(module, original);
    if (jsonb || teilstand || kunden || teilbriefing || radarArtikel) {
      if (previousPolicy === undefined) delete process.env[P.ENV];
      else process.env[P.ENV] = previousPolicy;
    }
  }
}

(async () => {
  const playwright = loadPlaywright();
  if (!playwright) {
    // Fail-closed-Regel siehe Kopfkommentar: in CI (bzw. mit
    // HELMUT_REQUIRE_BROWSER=1) darf fehlendes Playwright NICHT still grün sein.
    const requireBrowser = tagespaketOnly || process.env.HELMUT_REQUIRE_BROWSER === "1"
      || (process.env.CI === "true" && process.env.HELMUT_OFFLINE_TEST !== "1");
    if (requireBrowser) {
      console.error("FAIL  Playwright/Chromium fehlt, aber der Browser-Smoke ist hier verpflichtend");
      console.error("      (CI=true, HELMUT_REQUIRE_BROWSER=1 oder --tagespaket). Ein SKIP wäre fail-open:");
      console.error("      das Merge-Gate würde grün, ohne dass die App je in einem Browser lief.");
      console.error("      Fix: npm i --no-save playwright && npx playwright install --with-deps chromium");
      process.exit(1);
    }
    console.log("SKIP  Playwright nicht installiert — Browser-Smoke übersprungen (nur lokal/offline-suite zulässig).");
    console.log("      In CI: npx playwright install chromium && node scripts/browser-smoke-test.js");
    process.exit(0);
  }

  if (tagespaketOnly) {
    await tagespaketSmoke(playwright, { jsonb: tagespaketJsonb, ruhelageOnly: tagespaketRuhelageOnly, teilstand: tagespaketTeilstand, radarFrische: radarFrischeklarheit, kunden: kundenansichten, teilbriefing: briefingTeilstand, radarArtikel: radarArtikelbindung });
    console.log(`\n${passed} PASS, ${failed} FAIL (${radarArtikelbindung ? "nur neue Radar-Artikelbindung" : briefingTeilstand ? "nur neuer vorlaeufiger Briefingstand" : kundenansichten ? "nur neue Kundenansichten" : radarFrischeklarheit ? "nur neue Radar-Frischeklarheit" : tagespaketTeilstand ? "nur neuer gepruefter Teilstand" : tagespaketRuhelageOnly ? "nur zwei Ruhelageanzeigen" : tagespaketJsonb ? "nur neuer JSONB-Gegenfall" : "nur Tagespaket"}, Desktop/Mobil)`);
    process.exit(failed ? 1 : 0);
  }

  // Lokaler Pilot-Modus ohne externe Dienste; Store-Dateien werden gesichert.
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.HELMUT_AUTH_MODE;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AZURE_OPENAI_KEY;
  // Mandantenneutral: Es gibt KEIN bevorzugtes/konfiguriertes Mandat. Der Legacy-
  // Zugang loest das EINZIGE aktive Datenbankmandat auf — der Test macht das
  // Test-Mandat zum einzigen aktiven (kein Env noetig).
  process.env.HELMUT_STORAGE_BACKEND = "local";
  process.env.HELMUT_STORE_CACHE_MS = "0";
  const dataDir = path.join(root, ".helmut-data");
  const guarded = ["auth.json", "store.json", "p-test-politician-one.json"].map((name) => {
    const file = path.join(dataDir, name);
    return { file, content: fs.existsSync(file) ? fs.readFileSync(file) : null };
  });
  const restore = () => {
    for (const { file, content } of guarded) {
      try {
        if (content === null) { if (fs.existsSync(file)) fs.rmSync(file); }
        else fs.writeFileSync(file, content);
      } catch (_) { /* Hygiene */ }
    }
  };
  process.on("exit", restore);

  const handler = require(path.join(root, "server.js"));
  // Test-Mandat als EINZIGES aktives Datenbankmandat bereitstellen (Store leeren,
  // dann speichern) -> der Bare-Boot loest es ohne Env/Auswahl auf.
  const { testPoliticianOne } = require(path.join(root, "scripts", "fixtures", "test-profiles"));
  const smokeStorage = require(path.join(root, "lib", "helmut", "storage"));
  const clean = await smokeStorage.readStore("main");
  clean.profiles = {}; clean.mandateProfiles = {};
  await smokeStorage.writeStore(clean, "main");
  await smokeStorage.saveProfile({ ...testPoliticianOne });
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  // Container-taugliche Flags: ohne --no-sandbox/--disable-dev-shm-usage stürzt
  // Chromium in CI-/Sandbox-Umgebungen ab ("Target crashed").
  const browser = await playwright.chromium.launch({
    executablePath: process.env.HELMUT_BROWSER_EXECUTABLE_PATH || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });
  try {
    await require("./pwa-icon-start-test").verifyInBrowser(browser);
    for (const [label, viewport, isMobile] of [
      ["Desktop 1280x800", { width: 1280, height: 800 }, false],
      ["Mobil 390x844", { width: 390, height: 844 }, true]
    ]) {
      const context = await browser.newContext({
        viewport,
        isMobile,
        hasTouch: isMobile,
        // Service Worker BLOCKIEREN: in Sandbox-/Container-Chromium crasht die
        // SW-Registrierung den Renderer ("Target crashed") — reproduziert auch am
        // unveraenderten Basisstand, keine App-Regression. Der Smoke prueft den
        // App-Boot deterministisch OHNE SW; das SW-Verhalten selbst (sw.js) ist
        // damit bewusst NICHT abgedeckt (bekannte Luecke, nur am echten Geraet
        // pruefbar).
        serviceWorkers: "block",
        // CSP der App erlaubt kein 'unsafe-eval' — Playwrights String-Evaluate
        // wuerde sonst als Pageerror auftauchen und die Fehlerpruefung verfaelschen.
        bypassCSP: true,
        userAgent: isMobile
          ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
          : undefined
      });
      // Inhalts-/Startpruefung mit bereits geschlossenem Installationshinweis:
      // dessen zeitversetztes Safari-Banner kann sonst die mobile Dock verdecken.
      await context.addInitScript(() => sessionStorage.setItem("helmut:install-dismissed", "1"));
      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];
      page.on("pageerror", (err) => pageErrors.push(String(err && err.message || err)));
      page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

      // Betreibervertrag: Startlogo bis zum vollstaendigen Briefing behalten.
      // Echte Startantwort gezielt anhalten statt eine feste Netzwerkzeit raten.
      let releaseStart;
      const startGate = new Promise(resolve => { releaseStart = resolve; });
      await context.route("**/api/app/start?*", async route => {
        await startGate;
        await route.continue();
      });
      const startRequested = page.waitForRequest(request => new URL(request.url()).pathname === "/api/app/start");
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
      await startRequested;
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      check(`${label}: Startlogo bleibt waehrend ausstehender Briefingdaten sichtbar`, await page.locator("#appSplash").isVisible());
      check(`${label}: keine vorzeitig geoeffnete App mit nachladendem Briefing`, await page.locator("#app [data-view]").count() === 0);
      releaseStart();
      // Client geladen + Splash weg (der 8s-Watchdog in index.html würde sonst
      // die Neu-laden-Karte zeigen — genau der Fehlerfall, den wir abfangen).
      await page.waitForFunction("window.__helmutClientLoaded === true", null, { timeout: 15000 })
        .catch(() => {});
      const clientLoaded = await page.evaluate("window.__helmutClientLoaded === true").catch(() => false);
      check(`${label}: client.js bootet (__helmutClientLoaded)`, clientLoaded);

      await page.waitForFunction("!document.body.classList.contains('is-loading')", null, { timeout: 20000 }).catch(() => {});
      const splashGone = await page.evaluate("!document.body.classList.contains('is-loading')").catch(() => false);
      check(`${label}: Splash verschwindet (kein Boot-Hänger)`, splashGone);

      check(`${label}: keine unbehandelten JS-Fehler beim Boot`, pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

      const html = await page.content();
      check(`${label}: App-Shell gerendert (app-frame vorhanden)`, html.includes("app-frame") || html.includes("pilot"),
        html.slice(0, 120));

      // Die vier Bereiche: im Pilot-Modus ohne Code ist ggf. das Pilot-Gate zu sehen —
      // lokal (nicht production-like) ist die App offen. Navigation prüfen, wenn da.
      // Historische View-IDs (siehe Briefing-Reiter-Umbenennung): "briefing" =
      // Lage-Reiter, "helmut" = Briefing-Reiter, "office" = Buero.
      const navCount = await page.evaluate(`
        ["briefing", "radar", "helmut", "office"].filter((v) =>
          document.querySelector('[data-view="' + v + '"]')
        ).length
      `).catch(() => 0);
      check(`${label}: Navigation zu den vier Bereichen vorhanden`, navCount === 4, `gefunden=${navCount}/4`);

      if (navCount === 4) {
        // NICHT-tautologisch (Review-Fix): Die frueheren Marker-Regexe (radar,
        // hstand|helmut, ...) liefen gegen das KOMPLETTE page.content() — die
        // Begriffe stehen aber immer in der Navigation selbst, die Assertion
        // konnte also nie fehlschlagen. Jetzt wird der ECHTE View-Wechsel
        // geprueft: render() markiert nach dem Klick genau den Nav-Button des
        // aktiven Views mit der Klasse "active" (client.js isMobileNavActive).
        for (const view of ["radar", "helmut", "office", "briefing"]) {
          await page.evaluate(`document.querySelector('[data-view="${view}"]').click()`);
          await page.waitForTimeout(250);
          const activeIsView = await page.evaluate(`Boolean(document.querySelector('[data-view="${view}"].active'))`).catch(() => false);
          const othersActive = await page.evaluate(`
            ["radar", "helmut", "office", "briefing"].filter((v) => v !== "${view}" && document.querySelector('[data-view="' + v + '"].active')).length
          `).catch(() => -1);
          check(`${label}: Bereich '${view}' rendert (Nav aktiv, andere inaktiv)`, activeIsView && othersActive === 0, `active=${activeIsView} andere=${othersActive}`);
        }
        check(`${label}: keine neuen JS-Fehler bei Tab-Wechseln`, pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

        // Vorhandene lokale Fachfixture durch den echten Vertragsadapter und die
        // wirklichen Klickhandler fuehren. Kein Appstart in Production, kein Modell.
        const contract = require("../lib/helmut/briefingContract");
        const review = require("../lib/helmut/reviewFixture");
        const at = new Date("2026-07-15T10:00:00Z"), fixture = review.buildReviewFixture(at);
        // Derselbe belegte Vorgang darf in mehreren Bereichen vorkommen,
        // aber jeweils mit einem anderen Zweck. Radar muss den persoenlichen
        // Bezug zeigen, ohne die Handlungsanweisung als zweiten Feed zu kopieren.
        fixture.kosById["ko-review-1"].mentioned_people = [fixture.profile.fullName];
        // Eine KO-Markierung allein belegt keine persoenliche Artikelnennung.
        // Auch der tatsaechlich verlinkte Fixture-Artikel traegt den vollen Namen.
        fixture.sourcesByVorgang["vg-review-1"][0].summary =
          `${fixture.profile.fullName} erlaeutert den vorgelegten Arbeitszeitentwurf.`;
        const data = contract.toBriefingContractV3({ ...fixture, now: at });
        const state = data.currentHelmutState;
        data.lageBriefing = { available: true, latestUpdatedAt: new Date().toISOString(), vorgaenge: [{
          id: state.primaryItem.id, vorgangId: state.primaryItem.id,
          title: state.primaryItem.title, displayTitle: state.primaryItem.displayTitle,
          displaySummary: "Die belegten Fakten gehoeren in die Lage.",
          whyRelevant: "Der Entwurf betrifft das Arbeitsgebiet des Mandats.", recommendation: state.recommendation,
          sources: [{ name: "Testquelle", url: state.primaryItem.sourceUrl, publishedAt: "2025-06-22T07:00:00Z" }]
        }] };
        await page.evaluate((fixtureData) => {
          briefing = fixtureData; currentView = "helmut"; render();
        }, data);
        // Die normale Eintrittsanzeige endet per Timer; erst danach ist die
        // Fachansicht sichtbar. Dieselbe Bedingung gilt fuer echte Nutzer.
        await page.waitForSelector(".ui-briefing-hero", { timeout: 5000 });
        // Abrufzeit, gespeicherte Briefingerstellung und Quellenstand getrennt.
        await page.evaluate(() => {
          briefing.currentHelmutState.briefingType = 'evening';
          briefing.currentHelmutState.generatedAt = '2026-11-06T20:00:00Z';
          briefing.currentHelmutState.primaryItem.meldungAt = '2026-09-25T10:00:00Z';
          briefing.currentHelmutState.primaryItem.zeitLabel = '';
          briefing.currentHelmutState.frischeVertrag = { aktuell: true, lauf: { erzeugtAm: '2026-11-05T05:15:00Z' } };
          render();
        });
        const timeMeta = page.locator('.hstand-meta-line');
        check(`${label}: fachliche Zeitangaben sind sichtbar und klar getrennt`,
          await timeMeta.isVisible() && (await timeMeta.innerText()).includes('Quellenstand:')
            && (await timeMeta.innerText()).includes('25. Sept. 2026')
            && (await timeMeta.innerText()).includes('Briefing erstellt: 05. Nov. 2026')
            && !(await timeMeta.innerText()).includes('Abendlage'));
        await page.evaluate(() => {
          delete briefing.currentHelmutState.frischeVertrag;
          briefing.currentHelmutState.primaryItem.meldungAt = null;
          briefing.currentHelmutState.primaryItem.zeitLabel = '';
          render();
        });
        check(`${label}: Abrufzeit ersetzt keine fehlende fachliche Zeit`,
          (await timeMeta.innerText()).includes('Quellenstand nicht belegt')
            && (await timeMeta.innerText()).includes('Erstellungszeit des Briefings nicht belegt')
            && !(await timeMeta.innerText()).includes('06. Nov. 2026'));
        await page.evaluate(fixtureData => { briefing = fixtureData; render(); }, data);
        const displayed = await page.evaluate(() => ({
          proposals: document.querySelectorAll(".ui-briefing-hero").length,
          why: document.querySelectorAll(".ui-recommendation-why").length
        }));
        check(`${label}: Briefing zeigt Empfehlung und eigenen Tagesanlass`,
          displayed.proposals === 1 && displayed.why === 1
            && await page.locator(".ui-recommendation-why").isVisible(), JSON.stringify(displayed));
        await page.locator(".hstand [data-vorgang]").first().click();
        await page.waitForSelector(".vsheet-title", { timeout: 5000 });
        const sheetText = await page.locator(".vsheet-lede").innerText();
        check(`${label}: Briefing Link oeffnet genau den vorhandenen Lage Text mit Quelle`,
          sheetText === "Die belegten Fakten gehoeren in die Lage."
            && await page.locator(".vsheet-src[href]").first().getAttribute("href") === state.primaryItem.sourceUrl);
        check(`${label}: Lage Detail kopiert keine Empfehlung`, await page.locator(".vsheet-reco").count() === 0);
        await page.getByRole("button", { name: "Empfehlung im Briefing öffnen", exact: true }).click();
        // Die Begruendung steht sichtbar bei der Empfehlung. Zusaetzlicher
        // Kontext bleibt hinter „Ausfuehrlich lesen“ erreichbar.
        await page.evaluate(() => { document.querySelectorAll(".ui-hero-details").forEach((d) => { d.open = true; }); });
        check(`${label}: Rueckverweis schliesst Lage Detail und zeigt Briefing`,
          await page.locator(".vsheet-title").count() === 0 && await page.locator(".ui-briefing-hero").count() === 1);
        check(`${label}: Briefing begründet die Tagespriorität statt den Sachstand zu kopieren`,
          (await page.locator(".ui-recommendation-why").innerText()).includes("heutigen Arbeitstag")
            && !(await page.locator(".ui-recommendation-why").innerText()).includes("Arbeitsgebiet des Mandats"));
        const primaryTitle = state.primaryItem.displayTitle || state.primaryItem.title;
        check(`${label}: Briefing wiederholt den Hauptvorgang nicht in weiteren Vorgaengen`,
          !(await page.locator(".hstand-rel-title").allTextContents()).includes(primaryTitle));

        // Der optionale Installationshinweis liegt auf Mobil ueber der Dock.
        // Wie ein Nutzer schliessen, nicht den echten Klickschutz umgehen.
        const installClose = page.locator("#helmutInstallClose");
        if (await installClose.isVisible()) await installClose.click();
        await page.locator((isMobile ? ".mobile-dock" : ".nav-list") + ' [data-view="briefing"]').click();
        const lageText = await page.locator(".ui-vorgang-row").first().innerText();
        check(`${label}: Lage Karte zeigt Fakten und keine Briefing Handlungsanweisung`,
          lageText.includes("Die belegten Fakten") && !lageText.includes("Heute nicht öffentlich zuspitzen"));
        check(`${label}: Lage trennt aktuelle Analyse und aeltere Quellenfrische sichtbar`,
          await page.locator("[data-lage-stand]").isVisible()
            && (await page.locator("[data-lage-stand]").innerText()).includes("Neueste Auswertung: heute")
            && await page.locator("[data-lage-source-recency]").isVisible()
            && await page.locator("[data-lage-source-recency]").innerText() === "Neueste Quelle vom 22. Juni."
            && await page.evaluate(() => {
              const checked = document.querySelector("[data-lage-stand]").getBoundingClientRect();
              const source = document.querySelector("[data-lage-source-recency]").getBoundingClientRect();
              return source.top >= checked.bottom && document.documentElement.scrollWidth <= innerWidth;
            }));
        await page.evaluate(() => { delete briefing.lageBriefing.latestUpdatedAt; render(); });
        check(`${label}: Ohne Analysezeit bleibt nur die belegte Quellenfrische sichtbar`,
          await page.locator("[data-lage-stand]").isVisible()
            && await page.locator("[data-lage-stand]").innerText() === "Neueste Quelle vom 22. Juni."
            && await page.locator("[data-lage-source-recency]").count() === 0);
        await page.locator((isMobile ? ".mobile-dock" : ".nav-list") + ' [data-view="radar"]').click();
        await page.locator('[data-radar-segment="committees"]').click();
        const radarText = await page.locator("#radar2-root").innerText();
        const radarLinks = await page.locator('#radar2-root a[href]').evaluateAll(nodes => nodes.map(n => n.href));
        check(`${label}: Radar zeigt belegte Erwaehnung mit Quelle genau einmal trotz Ausschussbezug`,
          await page.locator(".radar2-card--mention").count() === 1
            && radarLinks.filter(url => url === state.primaryItem.sourceUrl).length === 1, JSON.stringify(radarLinks));
        check(`${label}: Radar kopiert weder Vorschlag noch Lage Langtext`,
          !radarText.includes("Heute nicht öffentlich zuspitzen")
            && !radarText.includes("Die belegten Fakten gehoeren in die Lage."));
        check(`${label}: Radar hat einen Beobachtungsgrund und keine zweite Artikelliste`,
          radarText.includes("nennt Ihren Namen")
            && radarText.includes("Eine Bewertung des Tons oder der Resonanz liegt nicht vor.")
            && !radarText.includes("Alle relevanten Artikel"));

        const radarLage = page.locator('#radar2-root [data-lage-verweis]');
        check(`${label}: Radar verweist auf den vorhandenen Lagevorgang`, await radarLage.count() === 1);
        await radarLage.click();
        check(`${label}: Radar-Verweis oeffnet den richtigen Sachstand`,
          await page.locator('.ui-lage-detail').innerText().then(text => text.includes("Die belegten Fakten gehoeren in die Lage.")));

        // Unterschiedliche Quellenhinweise desselben urspruenglichen KOs
        // muessen separat waehlbar bleiben; keine alte Sammelprosa/Officeaktion.
        const split = require('../lib/helmut/lage-quellenteilung').teile([
          { vorgangId: 'vg-sammel-test', displayTitle: 'Sammelprosa nicht erneut anzeigen',
            displaySummary: 'Doppelte Sachverhalte nicht erneut anzeigen',
            sources: [{ name: 'Testquelle', title: 'Bereits einzeln erklaert', url: 'https://example.org/geteilt' },
              { name: 'Testquelle', title: 'Eigene Meldung A', url: 'https://example.org/eigen-a' },
              { name: 'Testquelle', title: 'Eigene Meldung B', url: 'https://example.org/eigen-b' }] },
          { vorgangId: 'vg-fokus-test', displayTitle: 'Bereits einzeln erklaert',
            sources: [{ name: 'Testquelle', title: 'Bereits einzeln erklaert', url: 'https://example.org/geteilt' }] }
        ]);
        await page.evaluate((cards) => {
          briefing.lageBriefing.vorgaenge = cards; uiLageDetailOpen = false; uiLageSelectedId = ''; currentView = 'briefing'; render();
        }, split);
        check(`${label}: Drei getrennte Karten ohne doppelte Sammelprosa`,
          await page.locator('[data-ui-lage-select]').count() === 3
          && !(await page.locator('#uiPage').innerText()).includes('Sammelprosa nicht erneut anzeigen'));
        await page.locator('[data-ui-lage-select]').nth(1).click();
        check(`${label}: Zweiter Quellenhinweis oeffnet seinen eigenen Artikel`,
          (await page.locator('.ui-lage-detail').innerText()).includes('Eigene Meldung B')
            && await page.locator('.ui-lage-detail [data-lage-office]').count() === 0
            && await page.locator('.ui-lage-detail .ui-source-access a[href="https://example.org/eigen-b"]').count() === 1);
        // Folgende bestehende Pruefungen verwenden wieder dieselbe Fachfixture.
        await page.evaluate((fixtureData) => { clearLageHistory(); briefing = fixtureData; }, data);

        // Der Verweis darf keine fachliche Luecke verstecken: abweichende
        // Begruendung bleibt sichtbar; ohne passenden Lagevorgang kein Blindlink.
        await page.evaluate(() => {
          briefing.currentHelmutState.whyItMatters = "Zusaetzlicher Entscheidungsgrund nur im Briefing.";
          currentView = "helmut"; render();
          document.querySelectorAll(".ui-hero-details").forEach((d) => { d.open = true; });
        });
        check(`${label}: Eigenstaendige Entscheidungsbegruendung bleibt im Briefing erhalten`,
          (await page.locator(".ui-recommendation-why").innerText()).includes("Zusaetzlicher Entscheidungsgrund"));
        await page.evaluate(() => {
          briefing.lageBriefing.vorgaenge = []; render();
          document.querySelectorAll(".ui-hero-details").forEach((d) => { d.open = true; });
        });
        check(`${label}: Ohne passenden Lagevorgang kein leerer Querverweis und kein Verlust der Begruendung`,
          await page.locator("[data-lage-verweis]").count() === 0 && await page.locator(".ui-recommendation-why").count() === 1);
        check(`${label}: keine JS Fehler beim Wechsel zwischen allen drei Fachbereichen`, pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));
      }

      // Neue UI-Teilrollen: synthetische Darstellung, kein Quellen-/Profil-PASS.
      // Dieselben echten Renderer und antippbaren Karten auf Desktop UND Mobil.
      const memberFixture = (() => {
        const src = (id, title) => ({ name: "Testoriginal", sourceName: "Testoriginal", title,
          url: `https://publisher.test/articles/${id}`, publishedAt: "2026-09-10T12:00:00Z" });
        const draft = src("draft", "Referenten-Vorentwurf"), bt = src("bt", "Bundestagsstand"),
          br = src("br", "Bundesrat billigt Reform"), remagen = src("remagen", "Personalwechsel Remagen"),
          contextA = src("context-a", "Pluraler Kontext A"), contextB = src("context-b", "Pluraler Kontext B");
        return [
          { id: "vg-browser-remagen", vorgangId: "vg-browser-remagen", displayTitle: "Ein gemeinsames Personalmitglied",
            displaySummary: "Ein genau einmal dargestellter Personalwechsel.", sources: [remagen, contextA, contextB],
            ereignisKontexte: [
              { title: "Unveraenderter pluraler Kontext A", summary: "Mehrere Fraktionen nennen Personalwechsel und Positionen.", sources: [contextA] },
              { title: "Unveraenderter pluraler Kontext B", summary: "Interne Wechsel und mehrere politische Themen bleiben Kontext.", sources: [contextB] }
            ] },
          { id: "vg-browser-br-rest", vorgangId: "vg-browser-br-rest", displayTitle: "Vorentwurf und Bundestagsstand",
            displaySummary: "Der Vorentwurf liegt vor; der Bundestagsstand bleibt separat belegt.", sources: [draft, bt],
            ereignisTeilrollen: [
              { title: "Referenten-Vorentwurf", summary: "Der nicht-offizielle Vorentwurf liegt vor.", sources: [draft] },
              { title: "Bundestagsstand", summary: "Der Bundestag hat bereits Beschluesse gefasst.", sources: [bt] }
            ] },
          { id: "vg-browser-br-member", vorgangId: "vg-browser-br-member", displayTitle: "Bundesrat billigt Reform",
            displaySummary: "Die Bundesratszustimmung bleibt ein eigenstaendiger Punkt.", sources: [br] }
        ];
      })();
      await page.evaluate((vorgaenge) => {
        briefing.lageBriefing = { available: true, vorgaenge };
        currentView = "briefing"; render();
      }, memberFixture);
      check(`${label}: Teilmitgliedskarten erhalten einen Remagen- und zwei BR-Stufenpunkte`,
        await page.locator(".ui-vorgang-row").count() === 3);
      // Lage verwendet die bestehende Master-/Detailansicht; der Briefing-
      // Querverweis oben oeffnet weiterhin den separat geprueften Dialog.
      await page.locator('[data-ui-lage-select="vg-browser-remagen"]').click();
      await page.waitForSelector(".ui-lage-detail", { timeout: 5000 });
      const greenRoles = page.locator(".ui-lage-detail .source-basis article");
      const greenTexts = await greenRoles.allTextContents();
      const greenLinks = await greenRoles.locator("a[href]").evaluateAll(nodes => nodes.map(n => n.href));
      check(`${label}: Remagen Detail zeigt beide unveraenderten Kontexte mit eigenen Quellen`,
        greenTexts.length === 2 && greenTexts[0].includes(memberFixture[0].ereignisKontexte[0].summary)
          && greenTexts[1].includes(memberFixture[0].ereignisKontexte[1].summary)
          && greenLinks.includes("https://publisher.test/articles/context-a")
          && greenLinks.includes("https://publisher.test/articles/context-b"));
      if (isMobile) {
        await page.locator("[data-ui-lage-back]").click();
        await page.waitForFunction(() => !uiLageDetailOpen);
      }
      await page.locator('[data-ui-lage-select="vg-browser-br-rest"]').click();
      await page.waitForSelector(".ui-lage-detail", { timeout: 5000 });
      const brRoles = page.locator(".ui-lage-detail .source-basis article");
      const brLinks = await brRoles.locator("a[href]").evaluateAll(nodes => nodes.map(n => n.href));
      check(`${label}: BR Restdetail bindet Vorentwurf und Bundestagsstand an getrennte Originale`,
        await brRoles.count() === 2 && brLinks.length === 2
          && brLinks[0] === "https://publisher.test/articles/draft"
          && brLinks[1] === "https://publisher.test/articles/bt"
          && !(await page.locator(".ui-lage-detail").innerText()).includes("Bundesrat billigt Reform"));
      if (isMobile) {
        await page.locator("[data-ui-lage-back]").click();
        await page.waitForFunction(() => !uiLageDetailOpen);
      }
      check(`${label}: keine JS Fehler bei Teilrollen und Quellenwechsel`, pageErrors.length === 0);

      // Desktop-Detail bei tief gescrollter Liste: echte Klicks und Wheel,
      // bestehende synthetische Fixture; keine weiteren Backendaufrufe.
      await page.evaluate((base) => {
        briefing.lageBriefing = { available: true, vorgaenge: Array.from({ length: 12 }, (_, i) => ({
          ...base, id: 'desktop-scroll-' + i, vorgangId: 'desktop-scroll-' + i,
          displayTitle: 'Synthetischer Vorgang ' + (i + 1),
          displaySummary: 'Vollstaendiger synthetischer Sachstand fuer die Scrollpruefung. '.repeat(25)
        })) };
        uiLageDetailOpen = false; currentView = 'briefing'; render();
        document.querySelector('.ui-page').scrollTo({ top: 0, behavior: 'instant' });
      }, memberFixture[0]);
      const detail = page.locator('.ui-lage-detail');
      if (!isMobile) {
        const panelInside = () => page.evaluate(() => {
          const p = document.querySelector('.ui-page').getBoundingClientRect();
          const d = document.querySelector('.ui-lage-detail').getBoundingClientRect();
          return d.top >= 72 && d.bottom <= p.bottom && d.height > 0;
        });
        check(`${label}: Detail passt vor dem Scrollen zwischen Kopf und Fuss`, await panelInside());
        const ninth = page.locator('[data-ui-lage-select="desktop-scroll-8"]');
        await ninth.evaluate(el => {
          const page = document.querySelector('.ui-page');
          page.scrollTo({ top: page.scrollTop + el.getBoundingClientRect().top - page.getBoundingClientRect().top - 100, behavior: 'instant' });
        });
        const before = await page.locator('.ui-page').evaluate(el => el.scrollTop);
        await ninth.click({ position: { x: 20, y: 24 } });
        check(`${label}: Auswahl weit unten erhaelt die Listenposition`,
          before > 500 && Math.abs(await page.locator('.ui-page').evaluate(el => el.scrollTop) - before) < 2);
        check(`${label}: ausgewahltes Desktopdetail bleibt sichtbar`, await panelInside()
          && (await detail.locator('.vsheet-title').innerText()) === 'Synthetischer Vorgang 9');
        await detail.hover();
        await page.mouse.wheel(0, 400);
        await page.waitForFunction(() => document.querySelector('.ui-lage-detail').scrollTop > 0);
        check(`${label}: Detail laesst sich unabhaengig von der Liste scrollen`,
          Math.abs(await page.locator('.ui-page').evaluate(el => el.scrollTop) - before) < 2);
        await detail.locator('.vsheet-src[href]').first().scrollIntoViewIfNeeded();
        check(`${label}: Originalquelle im gescrollten Panel erreichbar`,
          await detail.locator('.vsheet-src[href]').first().isVisible());
        const tenth = page.locator('[data-ui-lage-select="desktop-scroll-9"]');
        await tenth.evaluate(el => {
          const page = document.querySelector('.ui-page');
          page.scrollTo({ top: page.scrollTop + el.getBoundingClientRect().top - page.getBoundingClientRect().top - 100, behavior: 'instant' });
        });
        const nextBefore = await page.locator('.ui-page').evaluate(el => el.scrollTop);
        await tenth.click({ position: { x: 20, y: 24 } });
        check(`${label}: neues Thema beginnt oben und erhaelt Listenposition`,
          await detail.evaluate(el => el.scrollTop) === 0
            && Math.abs(await page.locator('.ui-page').evaluate(el => el.scrollTop) - nextBefore) < 2
            && (await detail.locator('.vsheet-title').innerText()) === 'Synthetischer Vorgang 10');
        await detail.focus();
        await page.keyboard.press('PageDown');
        await page.waitForFunction(() => document.querySelector('.ui-lage-detail').scrollTop > 0);
        check(`${label}: Detail per Tastatur scrollbar`, await detail.evaluate(el => el.scrollTop) > 0);
        await page.setViewportSize({ width: 900, height: 600 });
        await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
        await page.locator('.ui-page').evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
        check(`${label}: kleines Desktopfenster und helles Theme am Listenende`,
          await panelInside() && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      } else {
        await page.locator('[data-ui-lage-select="desktop-scroll-8"]').click();
        check(`${label}: mobiles Detail bleibt normaler Seiteninhalt`,
          await detail.isVisible() && await detail.evaluate(el => getComputedStyle(el).position !== 'sticky'
            && getComputedStyle(el).maxHeight === 'none'));
        await page.locator('[data-ui-lage-back]').click();
        await page.waitForFunction(() => !uiLageDetailOpen);
        check(`${label}: eigener mobiler Rueckweg zur Liste bleibt erhalten`,
          await page.locator('[data-ui-lage-select="desktop-scroll-8"]').isVisible());
      }
      check(`${label}: keine JS Fehler nach Desktopdetailpruefung`, pageErrors.length === 0);
      if (isMobile) {
        const dock = await page.evaluate(`Boolean(document.querySelector(".mobile-dock"))`).catch(() => false);
        check(`${label}: mobile Dock-Navigation vorhanden`, dock);
      }
      if (isMobile) {
        // Browsernavigation im selben Dokument, keine Backendanfrage/Generierung.
        const entryUrl = page.url();
        const row = page.locator('[data-ui-lage-select="desktop-scroll-8"]');
        await row.scrollIntoViewIfNeeded();
        const listScroll = await page.locator('.ui-page').evaluate(el => el.scrollTop);
        await row.click();
        const detailState = await page.evaluate(() => history.state);
        check(`${label}: mobiles Detail hat eigenen lokalen Historyeintrag`,
          await page.evaluate(() => history.state.helmutLage.kind === 'detail') && page.url() === entryUrl);
        await page.goBack();
        await page.waitForFunction(() => !uiLageDetailOpen && currentView === 'briefing');
        check(`${label}: Browser Zurueck bleibt in Lage und erhaelt Listenposition`,
          page.url() === entryUrl && Math.abs(await page.locator('.ui-page').evaluate(el => el.scrollTop) - listScroll) < 2);
        await page.goForward();
        await page.waitForFunction(() => uiLageDetailOpen);
        check(`${label}: Browser Vorwaerts oeffnet dasselbe Thema von oben`,
          (await detail.locator('.vsheet-title').innerText()) === 'Synthetischer Vorgang 9'
            && await page.locator('.ui-page').evaluate(el => el.scrollTop) === 0);
        const historyLength = await page.evaluate(() => history.length);
        for (let repeat = 0; repeat < 2; repeat++) {
          await page.locator('[data-ui-lage-back]').click();
          await page.waitForFunction(() => !uiLageDetailOpen);
          await row.click();
        }
        check(`${label}: eigener Rueckweg erzeugt keine zusaetzlichen Historyeintraege`,
          await page.evaluate(() => history.length) === historyLength);
        await page.evaluate(() => setMandateSwitchPending(true));
        await page.goBack();
        await page.waitForFunction(() => uiLageHistoryPending);
        check(`${label}: History aendert keinen unbestaetigten Mandatswechsel`,
          await page.evaluate(() => uiLageDetailOpen && mandateSwitchPending));
        await page.evaluate(() => setMandateSwitchPending(false));
        await page.waitForFunction(() => !uiLageDetailOpen);
        check(`${label}: History nach ausgebliebenem Mandatswechsel synchronisiert`,
          await page.evaluate(() => currentView === 'briefing' && !uiLageHistoryPending));
        await page.goForward();
        await page.waitForFunction(() => uiLageDetailOpen);
        await page.locator('.mobile-dock [data-view="radar"]').click();
        await page.goBack();
        await page.waitForFunction(() => currentView === 'briefing' && !uiLageDetailOpen);
        await page.goForward();
        await page.waitForFunction(() => currentView === 'radar');
        check(`${label}: Tabwechsel nach Detail bleibt bei Zurueck und Vorwaerts konsistent`,
          await page.evaluate(() => !uiLageDetailOpen));
        await page.evaluate(() => {
          briefing.currentHelmutState.primaryItem.id = 'desktop-scroll-8';
          currentView = 'helmut'; uiLageDetailOpen = false;
          writeLageHistory({ kind: 'view', view: 'helmut', scrollTop: 0 }); render();
        });
        await page.waitForSelector('.ui-briefing-hero');
        const crossLink = page.locator('[data-lage-verweis][data-vorgang="desktop-scroll-8"]').first();
        await crossLink.scrollIntoViewIfNeeded();
        const briefingScroll = await page.locator('.ui-page').evaluate(el => el.scrollTop);
        await crossLink.click();
        check(`${label}: Querverweis zeigt einen passenden allgemeinen Rueckknopf`,
          (await page.locator('[data-ui-lage-back]').innerText()).trim() === 'Zurück');
        await page.goBack();
        await page.waitForFunction(() => currentView === 'helmut');
        check(`${label}: Browser Zurueck aus Querverweis erhaelt Ursprungsbriefing und Position`,
          !await detail.isVisible() && Math.abs(await page.locator('.ui-page').evaluate(el => el.scrollTop) - briefingScroll) < 2);
        await page.goForward();
        await page.waitForFunction(() => currentView === 'briefing' && uiLageDetailOpen);
        await page.locator('[data-ui-lage-back]').click();
        await page.waitForFunction(() => currentView === 'helmut');
        check(`${label}: eigener Rueckknopf aus Querverweis entspricht Browser Zurueck`,
          !await detail.isVisible());
        check(`${label}: fremdes Mandat aus History wird verworfen`,
          await page.evaluate((saved) => {
            const oldView = currentView;
            const foreign = { ...saved, helmutLage: { ...saved.helmutLage, mandateId: 'nicht-freigegeben' } };
            return restoreLageHistory(foreign) === false && currentView === oldView;
          }, detailState));
        check(`${label}: entfernter Vorgang oeffnet keinen anderen Detailtext`,
          await page.evaluate((saved) => {
            const unknown = { ...saved, helmutLage: { ...saved.helmutLage, id: 'entfernter-vorgang' } };
            return restoreLageHistory(unknown) && currentView === 'briefing' && !uiLageDetailOpen;
          }, detailState));
        check(`${label}: alter Privatkontext wird auch beim gleichen Mandat nicht reaktiviert`,
          await page.evaluate((saved) => {
            clearLageHistory();
            return restoreLageHistory(saved) === false && !uiLageDetailOpen;
          }, detailState));
        check(`${label}: abgemeldeter Zugriff kann per History nicht wiederkehren`,
          await page.evaluate((saved) => {
            invalidatePrivateAccess();
            return restoreLageHistory(saved) === false && !privateAccess && !document.querySelector('.ui-lage-detail');
          }, detailState));
      }

      check(`${label}: keine JS Fehler nach lokaler Browsernavigation`, pageErrors.length === 0);
      await context.close();
    }

    // Datenbankausfall beim Start: echte Oberflaeche, nur die lokale Sessionantwort
    // gestoert. Kein falscher Pilotlogin und keine Fachabrufe nach unbekannter Identitaet.
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
        isMobile: mobile, hasTouch: mobile, serviceWorkers: "block", bypassCSP: true });
      let unavailable = true, startCalls = 0;
      await context.route("**/api/**", route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === "/api/auth/session" && unavailable) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ reason: "auth-unavailable" }) });
        if (pathname === "/api/app/start") startCalls++;
        return route.continue();
      });
      const page = await context.newPage();
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction("document.querySelector('#app')?.innerText.includes('Helmut ist gerade nicht erreichbar.')", null, { timeout: 5000 }).catch(() => {});
      await page.waitForFunction("!document.body.classList.contains('is-loading')", null, { timeout: 5000 }).catch(() => {});
      const text = await page.locator("#app").innerText();
      const label = mobile ? "Mobil Ausfall" : "Desktop Ausfall";
      check(`${label}: klare Stoerung mit erneutem Ladeversuch`, text.includes("Helmut ist gerade nicht erreichbar.") && text.includes("Neu laden"));
      check(`${label}: Splash endet und kein falscher Login erscheint`, await page.evaluate("!document.body.classList.contains('is-loading') && !document.querySelector('#loginForm')") && !text.includes("Zugangscode"));
      check(`${label}: keine Fachabfrage mit unbekannter Identitaet`, startCalls === 0);
      unavailable = false;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-view="radar"]', { timeout: 20000 }).catch(() => {});
      check(`${label}: nach Erholung wieder normaler Start`, await page.locator('[data-view="radar"]').count() > 0);
      await context.close();
    }

    await require("./profil-kompakt-browser").verify({ browser, baseUrl, storage: smokeStorage, fixture: testPoliticianOne, check });

    // ── Querformat-Sperre (Smartphone-only) ─────────────────────────────────
    // Reale Viewport-/Touch-Emulation statt Annahmen: prueft, dass die Sperre
    // NUR bei Smartphone+Querformat sichtbar UND blockierend ist, waehrend
    // Hochformat, Tablet (beide Ausrichtungen) und Desktop (auch schmal/kurz)
    // unberuehrt bleiben — genau die im Auftrag geforderten vier Faelle plus
    // ein Desktop-Stresstest.
    for (const device of [
      { label: "Smartphone Hochformat 390x844", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, expectLocked: false },
      { label: "Smartphone Querformat 844x390", viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, expectLocked: true },
      { label: "Tablet Hochformat 768x1024", viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true, expectLocked: false },
      { label: "Tablet Querformat 1024x768", viewport: { width: 1024, height: 768 }, isMobile: false, hasTouch: true, expectLocked: false },
      { label: "Desktop schmal/kurz 400x480 (Maus)", viewport: { width: 400, height: 480 }, isMobile: false, hasTouch: false, expectLocked: false }
    ]) {
      const context = await browser.newContext({
        viewport: device.viewport,
        isMobile: device.isMobile,
        hasTouch: device.hasTouch,
        serviceWorkers: "block",
        bypassCSP: true,
        userAgent: device.isMobile
          ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
          : (device.hasTouch
              ? "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
              : undefined)
      });
      const page = await context.newPage();
      await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction("window.__helmutClientLoaded === true", null, { timeout: 15000 }).catch(() => {});
      await page.waitForFunction("!document.body.classList.contains('is-loading')", null, { timeout: 20000 }).catch(() => {});

      const display = await page.evaluate(`getComputedStyle(document.getElementById("orientationLock")).display`).catch(() => "FEHLER");
      const isLocked = display !== "none";
      check(`${device.label}: Sperr-Overlay ${device.expectLocked ? "sichtbar" : "verborgen"} (display=${display})`,
        isLocked === device.expectLocked, `erwartet expectLocked=${device.expectLocked}`);

      // Hit-Test in der Bildschirmmitte: beweist, dass die Sperre bei Sichtbarkeit
      // die App wirklich BLOCKIERT (nicht nur optisch ueberdeckt, sondern auch das
      // dahinterliegende #app fuer Zeigereingaben unerreichbar macht) bzw. dass die
      // App in allen anderen Faellen normal bedienbar bleibt.
      const w = device.viewport.width, h = device.viewport.height;
      const hitsLock = await page.evaluate(
        `Boolean(document.elementFromPoint(${Math.floor(w / 2)}, ${Math.floor(h / 2)})?.closest(".orientation-lock"))`
      ).catch(() => false);
      check(`${device.label}: Bildschirmmitte ${device.expectLocked ? "von der Sperre eingenommen (App nicht bedienbar)" : "erreicht die App (nicht blockiert)"}`,
        hitsLock === device.expectLocked);

      if (device.expectLocked) {
        const text = await page.evaluate(`document.getElementById("orientationLock").textContent`).catch(() => "");
        check(`${device.label}: Sperrtext enthaelt die geforderte Aufforderung`,
          text.includes("Bitte drehe dein Gerät ins Hochformat."));
      }

      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }

  // Kleiner isolierter Adminnachweis: Originalverwaltung -> CSRF/POST -> Queuegate,
  // inklusive verlorener Antwort und Reload. Keine echte Quelle/DB/KI.
  require("node:child_process").execFileSync(process.execPath,
    [path.join(__dirname, "quellen-adminstart-test.js"), "--browser"], { stdio: "inherit", env: process.env });

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });

