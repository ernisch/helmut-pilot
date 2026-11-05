"use strict";

// Nur eigene Originalformular-Ergaenzung und gezielte bestehende Kontovertraege.
// Aufruf: explizite Environment-Allowlist + node scripts/lokal.js scripts/kundenformular-test.js
const fs = require("fs"), path = require("path"), os = require("os"), vm = require("vm"), crypto = require("crypto"), http = require("http");
const assert = require("assert/strict");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const root = fs.realpathSync(path.resolve(__dirname, ".."));
const BASE = "ae18658e5caac2b39403c0e41e3a8af5c2b3d7be";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const core = ["server.js", "lib/helmut/accounts.js", "lib/helmut/auth.js", "lib/helmut/storage.js", "client.js", "index.html", "styles.css"];
const hashCore = () => Object.fromEntries(core.map(file => [file, sha(fs.readFileSync(path.join(root, file)))]));
const env = () => ({ PATH: "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin:/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TZ: "UTC", TMPDIR: "/tmp", NODE_PATH: "/workspace/helmut-pilot/node_modules", HELMUT_AUTH_MODE: "accounts", HELMUT_STORE_CACHE_MS: "0", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt" });
function git(args, cwd = root) { const res = spawnSync("git", args, { cwd, env: env(), encoding: "utf8", timeout: 30000 }); assert.equal(res.status, 0, "Lokaler Git-Schritt " + args[0]); return res.stdout.trim(); }
const evidence = { baseline: BASE, checks: [], observations: [], httpRequests: [] };
async function check(name, test) { await test(); evidence.checks.push({ name, status: "PASS" }); console.log("PASS " + name); }

async function main() {
  assert.equal(root, "/workspace/helmut-backend-kunden-20261104", "Nur eigener Kunden-Arbeitsbereich");
  assert.ok(String(process.env.NODE_OPTIONS || "").includes("lokaler-netzschutz.js"));
  assert.equal(process.env.HELMUT_SOURCE_MODE, "off"); assert.equal(process.env.HELMUT_STORAGE_BACKEND, "local");
  assert.equal(process.env.HELMUT_AUTH_MODE, "accounts"); assert.equal(process.env.HELMUT_TESTLAUF_KOMMUNIKATION, "gesperrt");
  for (const key of Object.keys(process.env)) assert.ok(!/(?:KEY|SECRET|TOKEN|CREDENTIAL|DATABASE_URL|SUPABASE|AZURE|VERCEL|SMTP|MAIL_PASSWORD)/i.test(key), key);
  assert.equal(git(["rev-parse", "HEAD"]), BASE); assert.equal(git(["branch", "--show-current"]), "feat/claude-backend-isolated");
  evidence.sourceBefore = hashCore();
  for (const file of core) assert.equal(git(["diff", "--", file]), "", "Geschuetzte Datei veraendert: " + file);
  const [{ createAdminActions, AdminMutationError }, { attachCustomerForm, validateCustomerForm }, { attachOriginalBackend }, { originalHelpers }] = await Promise.all([
    import(pathToFileURL(path.join(root, "verwaltung/original-actions.mjs"))),
    import(pathToFileURL(path.join(root, "verwaltung/original-customer-form.mjs"))),
    import(pathToFileURL(path.join(root, "verwaltung/original-controller.mjs"))),
    import(pathToFileURL(path.join(root, "verwaltung/original-adapter.mjs")))
  ]);
  const originalPath = path.join(root, "verwaltung/claude-original/Helmut Verwaltung v3.dc.html");
  const html = fs.readFileSync(originalPath, "utf8"), source = html.match(/<script\b[^>]*type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/i)[1];
  const form = { name: "Fiktives Buero Kundenformular", person: "Synthetische Person Alpha", mail: " ALPHA@example.invalid ", tarif: "Büro", profil: "" };
  const dto = validateCustomerForm(form).dto;
  const sample = () => ({ overview: { generatedAt: "2026-11-04T12:00:00Z", mandates: [{ id: "test-mdb-kundenformular-profil", fullName: "Synthetisches Profil", profileActive: true }] }, budget: {}, customers: { kunden: [] }, sources: {}, runs: {} });
  function component(actions, data = sample()) {
    const host = { HV3: originalHelpers, innerWidth: 1440, scrollTo() {}, addEventListener() {}, removeEventListener() {} }, location = { hash: "#/kunde-neu" };
    class DCLogic { constructor(props) { this.props = props || {}; } setState(update) { Object.assign(this.state, typeof update === "function" ? update(this.state) : update); } }
    const Original = vm.runInNewContext(source + "; Component", { DCLogic, window: host, location, setTimeout, clearTimeout });
    const Connected = attachCustomerForm(attachOriginalBackend(Original, { readerFactory: () => ({ clear() {}, dispose() {}, read: async key => structuredClone(data[key]) }), actionsFactory: () => actions, host }));
    return { instance: new Connected({}), data, location };
  }
  const response = (status, data) => ({ status, ok: status >= 200 && status < 300, json: async () => data });
  function fakeActions(override = () => null) {
    const calls = [];
    const user = { id: "user-synthetic-alpha", email: dto.email, name: dto.person, role: "abgeordneter", active: false, status: "eingeladen", politicianId: "synthetische-person-alpha" };
    const actions = createAdminActions({ fetcher: async (url, options) => {
      calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
      const custom = await override(url, options, calls); if (custom) return custom;
      if (url === "/api/admin/users" && options.method === "GET") return response(200, []);
      if (url === "/api/security/csrf") return response(200, { token: "synthetic-csrf-token-long-enough" });
      if (options.method === "POST") return response(200, user);
      if (options.method === "PATCH") return response(200, { ...user, ...JSON.parse(options.body) });
      throw new Error("Unerwartete Anfrage");
    } });
    return { actions, calls, user };
  }
  await check("Alle Originaldateien einschliesslich Template/CSS bleiben bytegleich", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "verwaltung/claude-original-manifest.json")));
    for (const file of manifest.files) assert.equal(sha(fs.readFileSync(path.join(root, "verwaltung/claude-original", file.path))), file.sha256, file.path);
    evidence.originalFiles = manifest.files.length;
  });
  await check("Validierung markiert Name, Person, E-Mail und Tarif-/Profilfehler ohne IO", () => {
    const bad = validateCustomerForm({ name: "", person: "x\ny", mail: "falsch", tarif: "frei", profil: "nicht-frei" }, []);
    assert.equal(bad.valid, false); assert.deepEqual(Object.keys(bad.errors).sort(), ["mail", "name", "person", "profil", "tarif"]);
    const valid = validateCustomerForm(form); assert.equal(valid.valid, true); assert.equal(valid.dto.email, "alpha@example.invalid"); assert.equal(valid.dto.customerName, form.name);
  });
  await check("Original hasFormErr/formFields zeigen Feldfehler; kein Simulationsentwurf", async () => {
    let writes = 0; const { instance: c } = component({ createCustomerAccount: async () => { writes++; }, dispose() {} }); await c.refresh();
    await c.renderVals().formSubmit({ preventDefault() {} }); const v = c.renderVals();
    assert.equal(v.hasFormErr, true); assert.equal(v.formFields.filter(field => field.invalid === "true").length, 3);
    assert.equal(c.state.extraCust.length, 0); assert.equal(writes, 0); c.componentWillUnmount();
  });
  await check("DTO erlaubt keine Rollen, Passwoerter, echten Preise oder freien Routen", async () => {
    let io = 0; const a = createAdminActions({ fetcher: async () => { io++; throw new Error("IO verboten"); } });
    for (const patch of [{ role: "admin" }, { password: "x" }, { pricePerMonth: 490 }, { politicianId: "../motor" }, { person: "x\ny" }, { tariffIntent: "Custom" }]) await assert.rejects(a.createCustomerAccount({ ...dto, ...patch }), AdminMutationError);
    assert.equal(io, 0); a.dispose();
  });
  await check("Fester gesperrter POST und bestehende Notiz statt Simulationspreis/CRM", async () => {
    const { actions, calls } = fakeActions(); const result = await actions.createCustomerAccount(dto);
    assert.equal(result.user.customer.pricePerMonth, null); assert.equal(result.invitationSent, false);
    assert.deepEqual(calls.map(call => call.method), ["GET", "GET", "POST", "PATCH"]);
    assert.deepEqual(Object.keys(calls[2].body).sort(), ["active", "email", "name", "role"]);
    assert.equal(calls[2].body.active, false); assert.equal(calls[2].body.name, dto.person);
    assert.match(calls[3].body.customer.internalNote, /Kundenname: Fiktives/); assert.match(calls[3].body.customer.internalNote, /Tarifwunsch: Büro \(Preis offen\)/);
    assert.equal(calls[3].body.customer.paymentStatus, "none"); assert.ok(!/290|490|1200/.test(JSON.stringify(calls))); actions.dispose();
  });
  await check("Frischer admin-geschuetzter Rollenbeleg verweigert 401/403 vor POST", async () => {
    for (const code of [401, 403]) { const { actions, calls } = fakeActions(() => response(code, {})); await assert.rejects(actions.createCustomerAccount(dto), error => error.status === code && !error.outcomeUnknown); assert.equal(calls.length, 1); actions.dispose(); }
  });
  await check("Bestehende E-Mail/Profilbindung verhindert Anlage vor Schreibaufruf", async () => {
    for (const [input, users, field] of [[dto, [{ email: dto.email }], "mail"], [{ ...dto, politicianId: "test-mdb-bound" }, [{ politicianId: "test-mdb-bound" }], "profil"]]) {
      const { actions, calls } = fakeActions(() => response(200, users)); await assert.rejects(actions.createCustomerAccount(input), error => error.status === 409 && Boolean(error.fieldErrors[field])); assert.equal(calls.length, 1); actions.dispose();
    }
  });
  await check("Busy/Doppelsubmit laesst genau eine Anlage zu und behaelt Eingaben", async () => {
    let release, writes = 0; const pending = new Promise(resolve => { release = resolve; }); const data = sample();
    const { instance: c } = component({ createCustomerAccount: async () => { writes++; return pending; }, dispose() {} }, data); await c.refresh(); c.setState({ form: { ...form } });
    const first = c.renderVals().formSubmit({ preventDefault() {} }); assert.equal(c.renderVals().customerFormBusy, true);
    await c.renderVals().formSubmit({ preventDefault() {} }); c.renderVals().formFields[0].onChange({ target: { value: "veraendert" } });
    assert.equal(writes, 1); assert.equal(c.state.form.name, form.name);
    data.customers.kunden.push({ userId: "user-new", email: dto.email, name: dto.person, active: false, status: "eingeladen", customer: {} });
    release({ user: { id: "user-new", politicianId: "automatisch-vergebene-kennung" } }); await first; assert.equal(c.state.route.id, "user-new"); assert.equal(c.state.extraCust.length, 0); assert.match(c.state.toast, /Gesperrtes Konto gespeichert/); assert.match(c.state.toast, /Profilkennung automatisch-vergebene-kennung bitte prüfen/); c.componentWillUnmount();
  });
  await check("HTTP400/409 nach POST werden ohne falschen Erfolg behandelt", async () => {
    for (const code of [400, 409]) { const { actions, calls } = fakeActions((url, options) => options.method === "POST" ? response(code, {}) : null); await assert.rejects(actions.createCustomerAccount(dto), error => error.status === code && !error.outcomeUnknown && !error.partialAccount); assert.equal(calls.filter(call => call.method === "POST").length, 1); assert.ok(!calls.some(call => call.method === "PATCH")); actions.dispose(); }
  });
  await check("PATCH-Fehler nennt bestaetigtes Teilkonto; keine Wiederholung/Loeschung", async () => {
    for (const code of [400, 409, 500]) { const { actions, calls } = fakeActions((url, options) => options.method === "PATCH" ? response(code, {}) : null); await assert.rejects(actions.createCustomerAccount(dto), error => error.partialAccount?.id === "user-synthetic-alpha" && error.stage === "customer" && error.outcomeUnknown === (code >= 500)); assert.equal(calls.length, 4); assert.ok(!calls.some(call => call.method === "DELETE")); actions.dispose(); }
  });
  await check("Verlorene POST-/PATCH-Antwort und falsche 2xx-Antwort bleiben unklar", async () => {
    for (const stage of ["POST", "PATCH", "malformed"]) { const { actions, calls } = fakeActions((url, options) => { if (options.method === stage) throw new Error("Antwort verloren"); if (stage === "malformed" && options.method === "POST") return response(200, {}); }); await assert.rejects(actions.createCustomerAccount(dto), error => error.outcomeUnknown && (stage !== "PATCH" || error.partialAccount?.id === "user-synthetic-alpha")); assert.equal(calls.filter(call => call.method === "POST").length, 1); actions.dispose(); }
  });
  await check("Serverseitig suffixierte Profilreferenz wird als Teilanlage offengelegt", async () => {
    const { actions, calls, user } = fakeActions((url, options) => options.method === "POST" ? response(200, { ...user, politicianId: "test-mdb-frei-2" }) : null);
    await assert.rejects(actions.createCustomerAccount({ ...dto, politicianId: "test-mdb-frei" }), error => error.partialAccount?.id && error.fieldErrors.profil && error.stage === "profile-mismatch");
    assert.equal(calls.length, 3); actions.dispose();
  });
  await check("Unklares/teilweise angelegtes Formular bleibt gesperrt statt erneutem POST", async () => {
    for (const partial of [null, { id: "user-partial" }]) {
      let calls = 0; const { instance: c } = component({ createCustomerAccount: async () => { calls++; throw new AdminMutationError(0, true, { partialAccount: partial }); }, dispose() {} }); await c.refresh(); c.setState({ form: { ...form } });
      await c.renderVals().formSubmit({ preventDefault() {} }); await c.renderVals().formSubmit({ preventDefault() {} });
      assert.equal(calls, 1); assert.equal(c.renderVals().customerSubmitDisabled, true); assert.match(c.renderVals().formErr, partial ? /user-partial.*bei der Anlage bestätigt/ : /Ausgang.*unklar/); assert.doesNotMatch(c.renderVals().formErr, /angelegt und gesperrt/); assert.equal(c.state.form.name, form.name); assert.equal(c.state.extraCust.length, 0); c.componentWillUnmount();
    }
  });
  await check("Schreib-401/403 loescht Eingaben und private Bestandsdaten", async () => {
    for (const code of [401, 403]) { const { instance: c } = component({ createCustomerAccount: async () => { throw new AdminMutationError(code); }, dispose() {} }); await c.refresh(); c.setState({ form: { ...form } }); await c.renderVals().formSubmit({ preventDefault() {} }); assert.equal(c.state.form.mail, ""); assert.equal(c.data().customers.length, 0); assert.equal(c.state.route.page, "uebersicht"); c.componentWillUnmount(); }
  });
  await check("Nachreview: falsche POST2xx mit aktivem/fremdem/bekanntem Konto bestaetigen kein Teilkonto", async () => {
    const base = { id: "user-wrong-response", email: dto.email, name: dto.person, active: false, status: "eingeladen", role: "abgeordneter", politicianId: "synthetische-person-alpha" };
    for (const [patch, existing] of [[{ active: true }, []], [{ email: "fremd@example.invalid" }, []], [{ id: "user-existing" }, [{ id: "user-existing", email: "fremd@example.invalid" }]]]) {
      const { actions, calls } = fakeActions((url, options) => options.method === "POST" ? response(200, { ...base, ...patch }) : url === "/api/admin/users" && options.method === "GET" ? response(200, existing) : null);
      await assert.rejects(actions.createCustomerAccount(dto), error => error.outcomeUnknown === true && error.partialAccount === null && error.stage === "create");
      assert.equal(calls.filter(call => call.method === "POST").length, 1); assert.ok(!calls.some(call => call.method === "PATCH")); actions.dispose();
    }
  });
  await check("Nachreview: falsche POST2xx nennt im Originalformular keine beliebige ID oder Sperrbehauptung", async () => {
    const { actions } = fakeActions((url, options) => options.method === "POST" ? response(200, { id: "user-foreign-response", email: "foreign@example.invalid", active: true }) : null);
    const { instance: c } = component(actions); await c.refresh(); c.setState({ form: { ...form } }); await c.renderVals().formSubmit({ preventDefault() {} });
    assert.equal(c.renderVals().customerFormLocked, true); assert.match(c.renderVals().formErr, /Ausgang.*unklar/); assert.doesNotMatch(c.renderVals().formErr, /user-foreign-response|angelegt und gesperrt|Gesperrtes Konto gespeichert/); c.componentWillUnmount();
  });
  await check("Nachreview: falsche PATCH2xx nennt frueher bestaetigte ID mit neutralem aktuellem Zustand", async () => {
    const { actions, calls, user } = fakeActions((url, options) => options.method === "PATCH" ? response(200, { ...user, ...JSON.parse(options.body), active: true }) : null);
    const { instance: c } = component(actions); await c.refresh(); c.setState({ form: { ...form } }); await c.renderVals().formSubmit({ preventDefault() {} });
    const text = c.renderVals().formErr; assert.match(text, /user-synthetic-alpha.*bei der Anlage bestätigt/); assert.match(text, /aktuelle Konto- und Notizstand ist unklar/); assert.doesNotMatch(text, /angelegt und gesperrt|Gesperrtes Konto gespeichert/);
    assert.equal(c.renderVals().customerFormLocked, true); await c.renderVals().formSubmit({ preventDefault() {} }); assert.equal(calls.filter(call => call.method === "POST").length, 1); c.componentWillUnmount();
  });
  await check("Nachreview: frische Kundenantwort active:true/fehlend verhindert gesperrten Erfolgstoast", async () => {
    for (const active of [true, undefined]) {
      const data = sample(); const user = { id: "user-refreshed-active", politicianId: "automatische-kennung" };
      const { instance: c } = component({ createCustomerAccount: async () => { data.customers.kunden.push({ userId: user.id, email: dto.email, name: dto.person, active, status: "eingeladen", customer: {} }); return { user }; }, dispose() {} }, data);
      await c.refresh(); c.setState({ form: { ...form } }); await c.renderVals().formSubmit({ preventDefault() {} });
      assert.equal(c.renderVals().customerFormLocked, true); assert.match(c.renderVals().formErr, /aktuelle Zugangsstatus ist nicht bestätigt/); assert.match(c.renderVals().formErr, /Profilkennung automatische-kennung prüfen/); assert.equal(c.state.route.page, "kunde-neu"); assert.ok(!c.state.toast); c.componentWillUnmount();
    }
  });

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-kundenformular-http-")), runtime = path.join(temp, "repo");
  let server;
  try {
    git(["clone", "--quiet", "--shared", "--no-hardlinks", "--branch", "feat/claude-backend-isolated", root, runtime], temp);
    assert.ok(/^\/tmp\/helmut-kundenformular-http-[^/]+\/repo$/.test(runtime)); assert.ok(fs.statSync(path.join(runtime, ".git")).isDirectory());
    for (const file of [".env", ".env.local", "env.local", "env.local.html", ".helmut-data"]) assert.ok(!fs.existsSync(path.join(runtime, file)));
    const storage = require(path.join(runtime, "lib/helmut/storage.js")), accounts = require(path.join(runtime, "lib/helmut/accounts.js"));
    let profileWrites = 0, mailAttempts = 0, fetchAttempts = 0;
    storage.saveProfile = async () => { profileWrites++; throw new Error("Profil-Schreiben verboten"); };
    const mail = require(path.join(runtime, "lib/helmut/invite-mail.js"));
    mail.sendAccessMail = async () => { mailAttempts++; throw new Error("Einladung verboten"); };
    global.fetch = async () => { fetchAttempts++; throw new Error("fetch verboten"); };
    const password = "Kundenformular-synthetisch-2026!";
    const admin = await accounts.createUser({ email: "admin-kundenformular@example.invalid", name: "Synthetischer Admin", role: "admin", password });
    const nonadmin = await accounts.createUser({ email: "referent-kundenformular@example.invalid", name: "Synthetischer Referent", role: "referent", password });
    const handler = require(path.join(runtime, "server.js")); server = http.createServer(handler); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const request = (url, options = {}, cookie = null) => new Promise((resolve, reject) => {
      assert.ok(/^\/api\/(?:auth\/login|security\/csrf|admin\/(?:users(?:\/[a-z0-9-]+)?|customers))$/.test(url));
      const headers = { ...options.headers }; if (cookie) headers.Cookie = cookie;
      const req = http.request({ hostname: "127.0.0.1", port, path: url, method: options.method || "GET", headers, agent: false, signal: options.signal }, res => {
        let text = ""; res.setEncoding("utf8"); res.on("data", chunk => text += chunk); res.on("end", () => {
          evidence.httpRequests.push({ path: url, method: options.method || "GET", status: res.statusCode });
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: async () => JSON.parse(text), cookie: (res.headers["set-cookie"] || [])[0]?.split(";")[0] });
        });
      }); req.setTimeout(10000, () => req.destroy(new Error("HTTP-Zeitlimit"))); req.on("error", reject); if (options.body) req.write(options.body); req.end();
    });
    const login = async user => { const res = await request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password }) }); assert.equal(res.status, 200); return res.cookie; };
    const cookie = await login(admin), deniedCookie = await login(nonadmin);
    const actions = createAdminActions({ fetcher: (url, options) => request(url, options, cookie) });
    let created;
    await check("Echter HTTP-POST+PATCH persistiert gesperrtes Konto und beide Namen/Tarifwunsch", async () => {
      const result = await actions.createCustomerAccount(dto); created = result.user;
      assert.equal(created.active, false); assert.equal(created.customer.pricePerMonth, null); assert.equal(created.customer.paymentStatus, "none");
      const res = await request("/api/admin/customers", {}, cookie), data = await res.json(); assert.equal(res.status, 200);
      const found = data.kunden.find(user => user.userId === created.id); assert.ok(found); assert.equal(found.customer.internalNote, created.customer.internalNote); assert.equal(found.name, dto.person);
      const raw = await accounts.getUserByIdRaw(created.id); assert.equal(raw.passwordHash, null); assert.equal(raw.passwordSalt, null); assert.equal(raw.active, false);
    });
    await check("Echter Server: aktive:false ohne Passwort erzeugt weder Einladung noch Passworttoken", async () => {
      const store = await storage.readAuthStore(); assert.equal((store.passwordTokens || []).length, 0); assert.equal(mailAttempts, 0); assert.equal(profileWrites, 0);
      assert.equal(Object.keys((await storage.readStore()).profiles || {}).length, 0);
    });
    await check("Echter Server verweigert Anonym/Nicht-Admin vor Kundenanlage", async () => {
      for (const [session, expected] of [[null, 401], [deniedCookie, 403]]) {
        const denied = createAdminActions({ fetcher: (url, options) => request(url, options, session) }); const before = evidence.httpRequests.length;
        await assert.rejects(denied.createCustomerAccount({ ...dto, email: "denied@example.invalid" }), error => error.status === expected);
        assert.equal(evidence.httpRequests.length - before, 1); denied.dispose();
      }
    });
    await check("Echte CSRF- und Duplikatsperren erzeugen kein zweites Konto", async () => {
      const before = (await accounts.listUsers()).length;
      const res = await request("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Synthetisch", email: "csrf@example.invalid", role: "abgeordneter", active: false }) }, cookie); assert.equal(res.status, 403);
      await assert.rejects(actions.createCustomerAccount(dto), error => error.status === 409 && Boolean(error.fieldErrors.mail)); assert.equal((await accounts.listUsers()).length, before);
    });
    await check("Echter Profil-ID-Wettlauf wird als bekannte Teilanlage statt falscher Zuordnung erkannt", async () => {
      let inserted = false;
      const racing = createAdminActions({ fetcher: async (url, options) => {
        if (options.method === "POST" && !inserted) { inserted = true; await accounts.createUser({ name: "Synthetische Bindungsfixture", email: "binding@example.invalid", role: "abgeordneter", active: false, politicianId: "test-mdb-kundenformular-race" }); }
        return request(url, options, cookie);
      } });
      await assert.rejects(racing.createCustomerAccount({ ...dto, email: "race@example.invalid", politicianId: "test-mdb-kundenformular-race" }), error => error.partialAccount?.politicianId === "test-mdb-kundenformular-race-2" && Boolean(error.fieldErrors.profil));
      const user = await accounts.getUserByEmailRaw("race@example.invalid"); assert.equal(user.active, false); assert.equal(user.customer.internalNote, ""); racing.dispose();
    });
    await check("Echte verlorene POST-Antwort bleibt unklar; vorhandenes Konto bleibt gesperrt", async () => {
      let posts = 0;
      const uncertain = createAdminActions({ fetcher: async (url, options) => { const res = await request(url, options, cookie); if (options.method === "POST") { posts++; throw new Error("Synthetisch verlorene Antwort"); } return res; } });
      await assert.rejects(uncertain.createCustomerAccount({ ...dto, email: "post-unknown@example.invalid" }), error => error.outcomeUnknown && !error.partialAccount);
      assert.equal(posts, 1); const user = await accounts.getUserByEmailRaw("post-unknown@example.invalid"); assert.equal(user.active, false); assert.equal(user.customer.internalNote, ""); uncertain.dispose();
    });
    await check("Echte verlorene PATCH-Antwort nennt bekannte ID und behauptet keinen Gesamterfolg", async () => {
      const uncertain = createAdminActions({ fetcher: async (url, options) => { const res = await request(url, options, cookie); if (options.method === "PATCH") throw new Error("Synthetisch verlorene Antwort"); return res; } });
      await assert.rejects(uncertain.createCustomerAccount({ ...dto, email: "patch-unknown@example.invalid" }), error => error.outcomeUnknown && Boolean(error.partialAccount?.id) && error.stage === "customer");
      const user = await accounts.getUserByEmailRaw("patch-unknown@example.invalid"); assert.equal(user.active, false); assert.match(user.customer.internalNote, /Kundenname:/); uncertain.dispose();
    });
    actions.dispose();
    evidence.isolation = { backend: storage.getStorageStatus().backend, profileWrites, persistedProfiles: Object.keys((await storage.readStore()).profiles || {}).length, mailAttempts, passwordTokens: (await storage.readAuthStore()).passwordTokens?.length || 0, fetchAttempts, syntheticEmailsOnly: (await accounts.listUsers()).every(user => user.email.endsWith("@example.invalid")), bindAddress: "127.0.0.1", runtimeCloneRemoved: true };
    assert.equal(profileWrites, 0); assert.equal(mailAttempts, 0); assert.equal(fetchAttempts, 0);
    assert.equal(git(["diff", "--stat", "HEAD"], runtime), "");
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    assert.ok(temp.startsWith("/tmp/helmut-kundenformular-http-")); fs.rmSync(temp, { recursive: true, force: true });
  }
  evidence.sourceAfter = hashCore(); assert.deepEqual(evidence.sourceAfter, evidence.sourceBefore);
  evidence.testSha256 = sha(fs.readFileSync(__filename));
  evidence.modules = Object.fromEntries(["verwaltung/original-actions.mjs", "verwaltung/original-customer-form.mjs"].map(file => [file, sha(fs.readFileSync(path.join(root, file)))]));
  evidence.status = "PASS"; evidence.summary = { passedGroups: evidence.checks.length, httpRequests: evidence.httpRequests.length };
}

main().catch(error => { evidence.status = "FAIL"; evidence.error = { name: error.name, message: error.message, stack: String(error.stack).split("\n").slice(0, 4) }; console.error(error.message); process.exitCode = 1; }).finally(() => {
  evidence.timestamp = new Date().toISOString();
  if (root === "/workspace/helmut-backend-kunden-20261104") fs.writeFileSync(path.join(root, "docs/backend-isolated/kundenformular-nachreview-pruefbeleg-20261104.json"), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify({ status: evidence.status, ...evidence.summary }));
});
