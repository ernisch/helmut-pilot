"use strict";

// Prüft Originalkomponente + neue Adapter in VM und am echten isolierten Server.
// Keine Original-React-/Browserabnahme. Keine externe Laufzeit herunterladen.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const http = require("node:http");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { originalAdministrationPackage, addVerifiedRuntimeAssets } = require("./original-verwaltung-paket");
const root = path.join(__dirname, "..");
assert.ok(process.env.NODE_OPTIONS?.includes("lokaler-netzschutz"));
assert.equal(process.env.HELMUT_STORAGE_BACKEND, "local");
assert.equal(process.env.HELMUT_SOURCE_MODE, "off");
for (const key of Object.keys(process.env)) assert.ok(!/^(SUPABASE|VERCEL|OPENAI|AZURE|DEEPSEEK|CRON_SECRET|PILOT_SECRET|HELMUT_ADMIN_SECRET)/.test(key), key);
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const checks = [], observations = [];
async function check(name, fn) { await fn(); checks.push({ name, passed: true }); console.log(`PASS ${name}`); }

async function main() {
  const [{ originalSnapshot, originalHelpers }, { attachOriginalBackend }, { createAdminActions, AdminMutationError }, { createAdminReader }] = await Promise.all([
    import(pathToFileURL(path.join(root, "verwaltung/original-adapter.mjs"))),
    import(pathToFileURL(path.join(root, "verwaltung/original-controller.mjs"))),
    import(pathToFileURL(path.join(root, "verwaltung/original-actions.mjs"))),
    import(pathToFileURL(path.join(root, "verwaltung/api.mjs")))
  ]);
  const html = fs.readFileSync(path.join(root, "verwaltung/claude-original/Helmut Verwaltung v3.dc.html"), "utf8");
  const source = html.match(/<script\b[^>]*type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/i)[1];
  function component(reader, actions = null, hash = "#/uebersicht") {
    const host = { innerWidth: 1440, HV3: originalHelpers, scrollTo() {}, addEventListener() {}, removeEventListener() {} };
    const location = { hash };
    class DCLogic {
      constructor(props) { this.props = props || {}; }
      setState(update) { Object.assign(this.state, typeof update === "function" ? update(this.state) : update); }
    }
    const Original = vm.runInNewContext(`${source}; Component`, { DCLogic, window: host, location, setTimeout, clearTimeout });
    const Connected = attachOriginalBackend(Original, { readerFactory: () => reader, actionsFactory: actions ? () => actions : null, host });
    return { instance: new Connected({}), host, location };
  }
  const sample = {
    overview: { generatedAt: "2026-11-04T08:00:00Z", mandates: [{ id: "synthetic-a", fullName: "Fiktives Büro Alpha", profileActive: true, validierung: { bereit: true }, state: "Berlin" }], system: { ai: { enabled: false } } },
    budget: { day: "2026-11-04", limit: 50, calls: 3, estimatedCostUsd: 999, kostenwahrheit: { gesamt: { kostenUsd: 0.7, kostenUnbekannt: 1 } } },
    customers: { kunden: [{ userId: "synthetic-account", name: "Fiktives Konto", email: "synthetic@invalid.invalid", active: true, status: "pausiert", politicianId: "synthetic-a", customer: { pricePerMonth: null, paymentStatus: "none" } }] },
    sources: { statusCounts: { healthy: 20 }, stoerungen: { verfuegbar: false, gestoerte: [] } },
    runs: { processRuns: [{ id: "synthetic-run", process: "briefing", status: "completed", startedAt: "2026-11-04T07:00:00Z" }] },
    profile: { profile: { id: "synthetic-a", fullName: "Fiktives Büro Alpha" }, validierung: { bereit: true } }
  };
  const reader = data => ({ read: async key => structuredClone(data[key]), clear() {}, dispose() {} });
  await check("Originalpaket: 25 bytegleiche Assets, gleiches Template/CSS, kein Beispielgenerator", () => {
    const pkg = originalAdministrationPackage();
    assert.equal(pkg.assets.has("v3_logik.js"), false);
    assert.doesNotMatch(pkg.html, /src="v3_logik\.js"/);
    assert.match(pkg.html, /attachOriginalBackend\(Component/);
    const inline = pkg.html.match(/<script>([\s\S]*?)<\/script>/)[1];
    new vm.Script(inline);
    assert.equal(pkg.assets.has("support.js"), true);
    assert.throws(() => addVerifiedRuntimeAssets(pkg, path.join(os.tmpdir(), "helmut-runtime-absent-do-not-create")), /ENOENT/);
  });
  await check("Keine erfundene Qualität, Kosten-/USD-Budgetgrenze oder Landesebene", () => {
    const d = originalSnapshot(sample);
    assert.equal(d.counts.total, 1); assert.equal(d.counts.aktiv, 1); assert.equal(d.counts.ok, null);
    assert.equal(d.costs.today, null); assert.equal(d.costs.dayLimit, null); assert.equal(d.profiles[0].parl, "unbekannt");
    assert.equal(d.profiles[0].a.briefing.k, "unbekannt"); assert.equal(d.invoices.length, 0);
    assert.equal(d.byId.constructor, undefined);
    assert.equal(originalSnapshot().counts.total, null);
  });
  await check("Alle Originalansichten lassen sich mit echten Vertragsformen ableiten", async () => {
    const { instance: c } = component(reader(sample)); await c.refresh();
    for (const route of [{ page: "uebersicht" }, { page: "profile" }, { page: "profil", id: "synthetic-a" },
      { page: "betrieb", tab: "bilanz" }, { page: "betrieb", tab: "quellen" }, { page: "betrieb", tab: "kosten" },
      { page: "kunden", tab: "kunden" }, { page: "kunden", tab: "abrechnung" }, { page: "kunde", id: "synthetic-account" },
      { page: "kunde-neu" }, { page: "einstellungen", tab: "allgemein" }, { page: "einstellungen", tab: "integrationen" }]) {
      c.setState({ route }); const v = c.renderVals(); assert.ok(v.navItems.length === 5, JSON.stringify(route));
      assert.doesNotMatch(JSON.stringify(v), /Helmut läuft gesund|BEISPIEL100|Verbunden|Alle drei Ergebnisse brauchbar|Samstag, 3\. Oktober/);
      if (route.page === "betrieb" && route.tab === "kosten") assert.equal(v.costNums[0].value, "Offen");
      if (route.page === "profil") assert.equal(v.pd.areas[0].st.label, "Nicht geprüft");
    }
    c.componentWillUnmount();
  });
  await check("Originalsuche, Seitenwechsel, Theme und Detailauswahl bleiben nutzbar", async () => {
    const many = structuredClone(sample);
    many.overview.mandates = Array.from({ length: 71 }, (_, i) => ({ ...many.overview.mandates[0], id: `synthetic-${i}`, fullName: `Fiktives Profil ${i}` }));
    const { instance: c } = component(reader(many)); await c.refresh(); c.setState({ route: { page: "profile" } });
    let v = c.renderVals(); assert.equal(v.rows.length, 50); assert.equal(v.pageCount, 2);
    v.nextPage(); v = c.renderVals(); assert.equal(v.rows.length, 21);
    v.setQ({ target: { value: "Profil 70" } }); assert.equal(c.renderVals().rows.length, 1);
    c.setState({ route: { page: "einstellungen", tab: "allgemein" } }); c.renderVals().themeOpts[1].onClick();
    assert.equal(c.renderVals().theme, "hell"); c.componentWillUnmount();
  });
  await check("401/403 löschen auch bereits gelesene private Teilantworten", async () => {
    for (const status of [401, 403]) {
      const r = reader(sample); r.read = async key => { if (key === "budget") throw { status }; return sample[key]; };
      const { instance: c } = component(r); await c.refresh();
      assert.equal(c.data().profiles.length, 0); assert.equal(c.renderVals().health.label, "Zugriff gesperrt");
      assert.doesNotMatch(JSON.stringify(c.renderVals()), /Fiktives Büro|synthetic@/); c.componentWillUnmount();
    }
  });
  await check("Verspätete alte Antworten überschreiben keinen neueren Zugriffsentzug", async () => {
    let release, generation = 0;
    const slow = new Promise(resolve => { release = resolve; });
    const r = { clear() { generation++; }, dispose() {}, read: async key => { if (generation === 1) { await slow; return sample[key]; } throw { status: 403 }; } };
    const { instance: c } = component(r); const first = c.refresh(); await c.refresh(); release(); await first;
    assert.equal(c.data().profiles.length, 0); assert.equal(c._phase, "forbidden"); c.componentWillUnmount();
  });
  await check("Leerer HTTP200-Profilersatz wird nicht als erfolgreicher Detailabruf behandelt", async () => {
    const data = structuredClone(sample); data.profile = { profile: { id: "synthetic-a" }, validierung: { bereit: false } };
    const { instance: c } = component(reader(data), null, "#/profil/synthetic-a"); await c.refresh();
    assert.equal(c._detail, null); assert.equal(c._detailError, true);
    assert.match(c.renderVals().pd.answers[0].v, /nicht bestätigt/); c.componentWillUnmount();
  });
  await check("Ungültiger Hash und Prototype-Namen verursachen keine fremden Profildetails", async () => {
    const { instance: c } = component(reader(sample), null, "#/profil/%E0%A4%A"); await c.refresh();
    assert.equal(c.state.route.page, "uebersicht"); c.setState({ route: { page: "profil", id: "constructor" } });
    assert.equal(c.renderVals().pdMissing, true); c.componentWillUnmount();
  });
  await check("Kundenentwurf, Motoraktionen und falsche Erfolgsbestätigungen sind ausgeschlossen", async () => {
    const { instance: c } = component(reader(sample)); await c.refresh();
    c.setState({ route: { page: "kunde-neu" }, form: { name: "Fiktiv", person: "Fiktiv", mail: "fiktiv@invalid.invalid", tarif: "Basis", profil: "" } });
    c.renderVals().formSubmit({ preventDefault() {} }); assert.equal(c.state.extraCust.length, 0); assert.match(c.state.toast, /Nicht gespeichert/);
    c.setState({ route: { page: "profil", id: "synthetic-a" } }); assert.equal(c.renderVals().pd.danger.length, 1);
    c.componentWillUnmount();
  });
  await check("Kontoclient weist freie Pfade, Rollen, Passwörter und negative Preise vor IO ab", async () => {
    let requests = 0; const actions = createAdminActions({ fetcher: async () => { requests++; throw new Error("IO nicht erlaubt"); } });
    for (const [id, value] of [["../motor", false], ["x?secret=y", false], ["synthetic", "true"], ["synthetic", true]]) await assert.rejects(actions.setAccess(id, value), AdminMutationError);
    for (const value of [{ role: "admin" }, { password: "none" }, { pricePerMonth: -1 }, { pricePerMonth: "50" }, { paymentStatus: "paid", active: true }]) await assert.rejects(actions.updateCustomer("synthetic", value), AdminMutationError);
    assert.equal(requests, 0); actions.dispose();
  });
  await check("Unklarer Schreibausgang wird nicht wiederholt oder als Erfolg ausgegeben", async () => {
    let patches = 0;
    const actions = createAdminActions({ fetcher: async (_, options) => options.method === "GET" ? { ok: true, json: async () => ({ token: "synthetic-csrf-token-long-enough" }) } : (patches++, Promise.reject(new Error("Antwort verloren"))) });
    await assert.rejects(actions.setAccess("synthetic", false), error => error.outcomeUnknown === true);
    assert.equal(patches, 1); actions.dispose();
  });
  await check("Abgebaute Komponenten beginnen keine neue Anfrage", async () => {
    let requests = 0; const r = reader(sample); r.read = async key => { requests++; return sample[key]; };
    const { instance: c } = component(r); c.componentWillUnmount(); await c.refresh(); assert.equal(requests, 0);
  });
  await check("Detail401/403 nach Navigation entzieht global Daten und leert Lesercache", async () => {
    for (const status of [401, 403]) {
      let rejectDetail, cleared = 0;
      const r = reader(sample); r.clear = () => { cleared++; };
      r.read = key => key === "profile" ? new Promise((_, reject) => { rejectDetail = reject; }) : Promise.resolve(sample[key]);
      const { instance: c } = component(r); await c.refresh();
      c.setState({ route: { page: "profil", id: "synthetic-a" } }); const detail = c.loadDetail();
      c.setState({ route: { page: "kunden", tab: "kunden" } }); rejectDetail({ status }); await detail;
      assert.equal(c.data().profiles.length, 0); assert.equal(c.data().customers.length, 0);
      assert.equal(cleared, 2); assert.equal(c.state.route.page, "uebersicht"); assert.equal(c.renderVals().health.label, "Zugriff gesperrt");
      c.componentWillUnmount();
    }
  });
  await check("Ungeprüfte Ergebnisfilter haben keine falschen Nullzähler", async () => {
    const { instance: c } = component(reader(sample)); await c.refresh(); c.setState({ route: { page: "profile" } });
    const v = c.renderVals(); assert.equal(v.zeigenOpts[0].count, "1");
    for (const option of v.zeigenOpts.slice(1)) { assert.equal(option.count, "Nicht geprüft"); option.onClick(); assert.equal(c.state.zeigen, "alle"); }
    c.componentWillUnmount();
  });
  await check("Fehlende Profilübersicht entfernt keine bekannte Kundenzuordnung", async () => {
    const r = reader(sample); r.read = async key => { if (key === "overview") throw { status: 500 }; return sample[key]; };
    const { instance: c } = component(r); await c.refresh(); c.setState({ route: { page: "kunden", tab: "kunden" } });
    assert.match(c.renderVals().custRows[0].profiles, /synthetic-a.*Details nicht verfügbar/);
    c.setState({ route: { page: "kunde", id: "synthetic-account" } }); const detail = c.renderVals();
    assert.equal(detail.kd.noProfiles, false); assert.equal(detail.kd.profiles[0].name, "synthetic-a"); c.componentWillUnmount();
  });
  await check("Ausgegebenes Template behauptet weder Rechnungsanbindung noch Simulation oder Tageslauf", () => {
    const markup = originalAdministrationPackage().html.match(/<x-dc\b[^>]*>([\s\S]*?)<\/x-dc>/i)[1];
    assert.doesNotMatch(markup, /Lexware Office verbunden|Simulierte Aktion|Kein Profil fällt auf\.|Läufe heute|Rechnungsnummern und Zahlungen kommen aus Lexware/);
    assert.match(markup, /Letzte Läufe/); assert.match(markup, /Kontozugang ändern/); assert.match(markup, /background:\{\{ invoiceDot \}\}/);
  });
  await check("Vorhandene serverseitige Pflichtfeldnamen werden im Originaldetail angezeigt", async () => {
    const data = structuredClone(sample); data.profile.validierung = { bereit: false, fehlendePflichtfelder: ["Ausschuss"] };
    const { instance: c } = component(reader(data), null, "#/profil/synthetic-a"); await c.refresh();
    assert.match(c.renderVals().pd.answers[0].v, /Ausschuss/); c.componentWillUnmount();
  });

  // Physischer Anschluss: echte HTTP-Anwendung in einem eigenen, neuen Git-Klon.
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-original-integration-"));
  const clone = path.join(sandbox, "backend");
  let localServer;
  try {
    execFileSync("git", ["clone", "--quiet", "--shared", "--no-hardlinks", "--single-branch", "--branch", "feat/claude-backend-isolated", root, clone]);
    for (const p of [".env", ".env.local", "env.local", ".helmut-data"]) assert.equal(fs.existsSync(path.join(clone, p)), false);
    const head = execFileSync("git", ["-C", clone, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    process.env.HELMUT_AUTH_MODE = "accounts"; process.env.HELMUT_STORE_CACHE_MS = "0";
    const accounts = require(path.join(clone, "lib/helmut/accounts"));
    const storage = require(path.join(clone, "lib/helmut/storage"));
    const ai = require(path.join(clone, "lib/helmut/ai"));
    let providerCalls = 0;
    ai.requestText = async () => { providerCalls++; throw new Error("Provider gesperrt"); };
    const handler = require(path.join(clone, "server.js"));
    localServer = http.createServer(handler); await new Promise(resolve => localServer.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${localServer.address().port}`;
    const admin = await accounts.createUser({ email: "admin@original.invalid", name: "Fiktiver Admin", role: "admin", password: "synthetic-integration-only-123" });
    const user = await accounts.createUser({ email: "customer@original.invalid", name: "Fiktiver Kunde", role: "abgeordneter", politicianId: "original-synthetic-alpha", password: "synthetic-integration-only-123" });
    const fixture = require(path.join(clone, "scripts/fixtures/test-profiles")).testPoliticianOne;
    await storage.saveProfile({ ...fixture, id: "original-synthetic-alpha", fullName: "Fiktives Mandat Original", profileActive: false });
    const login = async email => {
      const r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "synthetic-integration-only-123" }) });
      assert.equal(r.status, 200); return r.headers.get("set-cookie").split(";")[0];
    };
    const cookie = await login(admin.email), userCookie = await login(user.email);
    const requests = [];
    const fetcher = async (url, options) => { assert.ok(url.startsWith("/api/admin/") || url === "/api/security/csrf"); requests.push({ url, method: options.method }); return fetch(`${base}${url}`, { ...options, headers: { ...options.headers, Cookie: cookie } }); };
    const r = createAdminReader({ fetcher }); const actions = createAdminActions({ fetcher });
    const { instance: c } = component(r, actions); await c.refresh();
    await check("Echter Server → vorhandener Leser → Originalkomponente: Bestand und Kosten", () => {
      const v = c.renderVals(); assert.equal(v.bigNums[0].value, "1"); assert.equal(v.bigNums[1].value, "0");
      assert.equal(c.data().profiles[0].name, "Fiktives Mandat Original"); assert.equal(v.bigNums[2].value, "—");
    });
    await check("Echter Server: Original-Profildetail verwendet sechste vorhandene Leseroute", async () => {
      c.setState({ route: { page: "profil", id: "original-synthetic-alpha" } }); await c.loadDetail();
      assert.equal(c._detail.id, "original-synthetic-alpha"); assert.equal(c.renderVals().pd.name, "Fiktives Mandat Original");
    });
    await check("Echter CSRF/Konto-PATCH: Preis und Zahlungsstatus ohne Profiländerung", async () => {
      const result = await actions.updateCustomer(user.id, { pricePerMonth: 49, paymentStatus: "open" });
      assert.equal(result.customer.pricePerMonth, 49); assert.equal(result.customer.paymentStatus, "open");
      await c.refresh(); assert.equal(c.data().customers[0].preis, 49);
    });
    await check("Original-Kontozugang sperrt vorhandene Sitzung; keine Motoraktion", async () => {
      await c.changeAccess(user.id, false);
      const denied = await fetch(`${base}/api/admin/customers`, { headers: { Cookie: userCookie } }); assert.equal(denied.status, 401);
      assert.equal(c.data().customers[0].zugang, "gesperrt");
      assert.equal((await storage.getProfile("original-synthetic-alpha")).profileActive, false);
      assert.equal(providerCalls, 0);
      assert.ok(requests.filter(request => request.method !== "GET").every(request => request.url === `/api/admin/users/${user.id}`));
    });
    c.componentWillUnmount();
    observations.push({ actualServer: true, testedCommit: head, localStore: true, providerCalls, requests });
  } finally {
    if (localServer?.listening) await new Promise(resolve => localServer.close(resolve));
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
  const output = process.env.HELMUT_ORIGINAL_EVIDENCE;
  if (output) {
    fs.mkdirSync(output, { recursive: true });
    const files = ["verwaltung/original-adapter.mjs", "verwaltung/original-controller.mjs", "verwaltung/original-actions.mjs", "scripts/original-verwaltung-paket.js", "scripts/original-verwaltung-test.js"];
    fs.writeFileSync(path.join(output, "original-verwaltung-ergebnis.json"), JSON.stringify({ schema: 1, checks, observations, sourceHashes: files.map(file => ({ file, sha256: sha(fs.readFileSync(path.join(root, file))) })), limits: ["Keine Original-React-/Browserabnahme", "Lokaler Dateispeicher, keine SQL/RLS-Abnahme", "Keine neuen geteilten Serverrouten eingebunden", "Keine Motor-/500er-Abnahme"] }, null, 2) + "\n");
  }
  console.log(`\n${checks.length}/${checks.length} Originalverwaltungs-Prüfgruppen bestanden.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
