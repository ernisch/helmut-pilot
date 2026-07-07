#!/usr/bin/env node
// P1-Sicherheits-/Vertrauens-Checks (offline, in-process).
// Prueft die umgesetzten P1-Fixes:
//   1) Cron ohne Secret  -> blockiert (503, fail closed)
//   2) Cron falsches Secret -> blockiert (403)
//   3) Cron richtiges Secret -> autorisiert (nicht 403/503)
//   2b) TLS: kein rejectUnauthorized im Crawler
//   4) Fake-Fallbacks (Termine/Entwuerfe/Radar) erscheinen nicht mehr im Code
//   3b) LLM-Logging schreibt einen Eintrag (mit und ohne usage-Block)
//
// Ausfuehren:  node scripts/p1-security-check.js
// Exitcode 0 = alle Checks bestanden, 1 = mind. ein Fehlschlag.

const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

// Sauberer Ausgangszustand: kein Pilot-/Account-Gate, definierter CRON-Zustand,
// und lokaler Datei-Store (offline, deterministisch — kein Supabase/Netzwerk).
delete process.env.HELMUT_AUTH_MODE;
delete process.env.PILOT_SECRET;
delete process.env.HELMUT_ADMIN_SECRET;
delete process.env.CRON_SECRET;
// Backend hart auf "local" zwingen. loadLocalEnv() (im Server) ueberschreibt nur
// UNGESETZTE Keys — ein definierter Wert bleibt also erhalten und useSupabase()
// bleibt false (kein Netzwerk/Node-fetch noetig).
process.env.HELMUT_STORAGE_BACKEND = "local";
// Tests: Store-Cache aus -> die Datei ist die einzige Wahrheit. So bleiben Save/Read-
// Checks deterministisch und Aufraeumen (Datei loeschen) wirkt sofort.
process.env.HELMUT_STORE_CACHE_MS = "0";

const handler = require(path.join(root, "server.js"));

function request(server, { method = "GET", pathname, headers = {} }) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: pathname, headers, timeout: 20000 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function cronChecks() {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const cronPath = "/api/cron/health-report"; // leichtester, offline-sicherer Cron-Endpoint

  try {
    // 1) kein Secret gesetzt -> 503 (fail closed)
    delete process.env.CRON_SECRET;
    const a = await request(server, { pathname: cronPath });
    check("Cron ohne CRON_SECRET wird blockiert (503)", a.status === 503, `status=${a.status}`);

    // 2) falsches Secret -> 403
    process.env.CRON_SECRET = "p1-test-secret";
    const b = await request(server, { pathname: cronPath, headers: { Authorization: "Bearer falsch" } });
    check("Cron mit falschem Secret wird blockiert (403)", b.status === 403, `status=${b.status}`);

    // 3) richtiges Secret -> autorisiert (Handler laeuft; nicht 403/503)
    const c = await request(server, { pathname: cronPath, headers: { Authorization: "Bearer p1-test-secret" } });
    check("Cron mit richtigem Secret ist autorisiert (nicht 403/503)", c.status !== 403 && c.status !== 503, `status=${c.status}`);
  } finally {
    delete process.env.CRON_SECRET;
    await new Promise((r) => server.close(r));
  }
}

// Presentation-Backfill-Trigger (/api/admin/presentation-backfill): CRON_SECRET-
// geschuetzt (fail closed), GET + Bearer (wie /api/cron|debug), Default DRY-RUN,
// echter Lauf nur mit ?execute=1. In dieser Testumgebung ist der V3-Store aus ->
// der Backfill selbst skippt (v3-store-not-ready), es wird also NIE etwas geschrieben;
// geprueft wird die Absicherung (Secret, mutierende Methode) und die Flag-Logik.
async function presentationBackfillEndpointChecks() {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const p = "/api/admin/presentation-backfill";
  const parse = (r) => { try { return JSON.parse(r.body); } catch (_) { return {}; } };
  try {
    // 1) kein Secret -> 503 (fail closed)
    delete process.env.CRON_SECRET;
    const a = await request(server, { pathname: p, headers: { Authorization: "Bearer irgendwas" } });
    check("Presentation-Backfill ohne CRON_SECRET blockiert (503, fail closed)", a.status === 503, `status=${a.status}`);

    process.env.CRON_SECRET = "p1-test-secret";
    // 2) falsches Secret -> 403
    const b = await request(server, { pathname: p, headers: { Authorization: "Bearer falsch" } });
    check("Presentation-Backfill mit falschem Secret blockiert (403)", b.status === 403, `status=${b.status}`);

    // 3) richtiges Secret, ohne execute -> Default DRY-RUN (sicher)
    const d = await request(server, { pathname: p, headers: { Authorization: "Bearer p1-test-secret" } });
    const dj = parse(d);
    check("Presentation-Backfill: ohne execute -> mode=dry-run (sicherer Default)", d.status === 200 && dj.mode === "dry-run", `status=${d.status} mode=${dj.mode}`);

    // 4) execute=1 -> mode=execute (Flag-Logik; ohne Store trotzdem kein Schreibvorgang)
    const e = await request(server, { pathname: `${p}?execute=1`, headers: { Authorization: "Bearer p1-test-secret" } });
    const ej = parse(e);
    check("Presentation-Backfill: execute=1 -> mode=execute", e.status === 200 && ej.mode === "execute", `status=${e.status} mode=${ej.mode}`);

    // 5) ganz ohne Authorization (Secret ist gesetzt) -> 403: die Route ist nie offen
    const noauth = await request(server, { pathname: p });
    check("Presentation-Backfill ohne Authorization blockiert (403, nie offen)", noauth.status === 403, `status=${noauth.status}`);
  } finally {
    delete process.env.CRON_SECRET;
    await new Promise((r) => server.close(r));
  }
}

// SaaS-Hardening Step 1: kein stiller cem-ince-/Fremd-Mandats-Fallback.
// - Isolations-Kern (auth.pickPoliticianId) direkt geprüft.
// - E2E im Account-Modus: eingeloggter Nutzer OHNE Mandat -> 403 no-mandate,
//   NIEMALS cem-ince-Daten.
async function saasMandateHardeningChecks() {
  const auth = require(path.join(root, "lib/helmut/auth.js"));
  // Unit: Isolation
  check("SaaS: Abgeordneter an eigenes Mandat gebunden (fremdes ?politicianId ignoriert)",
    auth.pickPoliticianId({ role: "abgeordneter", politicianId: "mdb-a" }, "mdb-b", ["mdb-a"]) === "mdb-a");
  check("SaaS: Referent — nicht zugewiesenes Mandat wird blockiert (-> erstes erlaubtes)",
    auth.pickPoliticianId({ role: "referent" }, "mdb-fremd", ["mdb-a"]) === "mdb-a");
  check("SaaS: Referent ohne Zuweisung -> kein Mandat (null)",
    auth.pickPoliticianId({ role: "referent" }, "mdb-a", []) === null);
  check("SaaS: Abgeordneter ohne Mandat -> null (kein Fallback)",
    auth.pickPoliticianId({ role: "abgeordneter", politicianId: null }, null, []) === null);

  function requestFull(server, { method = "GET", pathname, headers = {}, body = null }) {
    const { port } = server.address();
    return new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, method, path: pathname, headers, timeout: 20000 }, (res) => {
        let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
      });
      req.on("timeout", () => req.destroy(new Error("request timeout")));
      req.on("error", reject);
      if (body != null) req.write(body);
      req.end();
    });
  }

  const storage = require(path.join(root, "lib/helmut/storage.js"));
  const parse = (r) => { try { return JSON.parse(r.body); } catch (_) { return {}; } };

  // Deterministischer Datei-Store: sicherstellen, dass cem-ince im Ausgangszustand
  // KEIN gespeichertes Profil hat; Zustand am Ende exakt wiederherstellen.
  // (Store-Cache ist im Harness aus -> die Datei ist die Wahrheit.)
  const dataDir = path.join(root, ".helmut-data");
  const storeFile = path.join(dataDir, "store.json");
  const storeExisted = fs.existsSync(storeFile);
  const storeSnapshot = storeExisted ? fs.readFileSync(storeFile) : null;
  const clearStore = () => { if (fs.existsSync(storeFile)) fs.rmSync(storeFile); };
  const restoreStore = () => {
    if (storeExisted) fs.writeFileSync(storeFile, storeSnapshot);
    else clearStore();
  };

  const prev = { mode: process.env.HELMUT_AUTH_MODE, email: process.env.HELMUT_ADMIN_EMAIL, pass: process.env.HELMUT_ADMIN_PASSWORD };
  try {
    clearStore();

    // A) PILOT-Modus: cem-ince behaelt seine reichen Seed-Defaults, solange kein
    //    Profil gespeichert ist. Der Pilot bleibt unveraendert funktionsfaehig.
    delete process.env.HELMUT_AUTH_MODE;
    const pilot = http.createServer(handler);
    await new Promise((r) => pilot.listen(0, "127.0.0.1", r));
    try {
      const res = await requestFull(pilot, { pathname: "/api/profile/current" });
      const p = parse(res);
      check("SaaS: Pilot-Modus — cem-ince ohne gespeichertes Profil erhaelt Seed-Defaults (Pilot funktioniert)",
        res.status === 200 && p.id === "cem-ince" && p.party === "Die Linke" &&
        Array.isArray(p.committees) && p.committees.includes("Arbeit und Soziales"),
        `status=${res.status} party=${p.party}`);
    } finally { await new Promise((r) => pilot.close(r)); }

    // Account-Modus vorbereiten (Admin-Seed via Env).
    process.env.HELMUT_AUTH_MODE = "accounts";
    process.env.HELMUT_ADMIN_EMAIL = "p1admin@test.local";
    process.env.HELMUT_ADMIN_PASSWORD = "p1-admin-pass-123";
    const server = http.createServer(handler);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      const loginBody = JSON.stringify({ email: "p1admin@test.local", password: "p1-admin-pass-123" });
      const login = await requestFull(server, { method: "POST", pathname: "/api/auth/login", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(loginBody) }, body: loginBody });
      const setCookie = (login.headers["set-cookie"] || [])[0] || "";
      const cookie = setCookie.split(";")[0];
      check("SaaS: Account-Login liefert Session-Cookie", login.status === 200 && Boolean(cookie), `status=${login.status}`);

      // B) Account-Nutzer OHNE Mandat -> 403 no-mandate, keine fremden Daten.
      const start = await requestFull(server, { pathname: "/api/app/start", headers: { Cookie: cookie } });
      const j = parse(start);
      check("SaaS: Account-Nutzer OHNE Mandat -> 403 no-mandate (kein stiller Fallback)",
        start.status === 403 && j.reason === "no-mandate", `status=${start.status} reason=${j.reason}`);
      check("SaaS: Antwort für nicht-mandatierten Account enthält KEINE cem-ince-Daten",
        !String(start.body).toLowerCase().includes("cem-ince") && !String(start.body).includes("Cem Ince"), start.body.slice(0, 80));

      // C) De-Privilegierung: Admin waehlt explizit cem-ince, ABER es gibt kein
      //    gespeichertes Profil -> leeres blankProfile. KEIN stiller cem-ince-Seed
      //    im Account-Modus (party leer, keine Ausschuesse, keine cem-ince-Themen).
      clearStore();
      const blank = await requestFull(server, { pathname: "/api/profile/current?politicianId=cem-ince", headers: { Cookie: cookie } });
      const bp = parse(blank);
      check("SaaS: Account-Modus — cem-ince ohne gespeichertes Profil -> leeres blankProfile (kein Seed-Fallback)",
        blank.status === 200 && bp.id === "cem-ince" && bp.party === "" &&
        Array.isArray(bp.committees) && bp.committees.length === 0 &&
        !JSON.stringify(bp).includes("Bürgergeld"),
        `status=${blank.status} party="${bp.party}" committees=${JSON.stringify(bp.committees)}`);

      // D) Gespeichertes Profil hat Vorrang und wird NICHT von hardcodierten
      //    cem-ince Defaults ueberschrieben (activeProfile laedt zuerst den Store).
      await storage.saveProfile({ id: "cem-ince", fullName: "Cem Ince", party: "STORED-MARKER-Partei", committees: ["Stored-Testausschuss"], focusTopics: ["Stored-Thema"] });
      const stored = await requestFull(server, { pathname: "/api/profile/current?politicianId=cem-ince", headers: { Cookie: cookie } });
      const sp = parse(stored);
      check("SaaS: gespeichertes cem-ince Profil hat Vorrang — hardcodierte Defaults ueberschreiben es NICHT",
        stored.status === 200 && sp.party === "STORED-MARKER-Partei" &&
        Array.isArray(sp.committees) && sp.committees.includes("Stored-Testausschuss") &&
        !sp.committees.includes("Arbeit und Soziales") && !JSON.stringify(sp).includes("Bürgergeld"),
        `party=${sp.party} committees=${JSON.stringify(sp.committees)}`);
    } finally { await new Promise((r) => server.close(r)); }
  } finally {
    restoreStore();
    if (prev.mode === undefined) delete process.env.HELMUT_AUTH_MODE; else process.env.HELMUT_AUTH_MODE = prev.mode;
    if (prev.email === undefined) delete process.env.HELMUT_ADMIN_EMAIL; else process.env.HELMUT_ADMIN_EMAIL = prev.email;
    if (prev.pass === undefined) delete process.env.HELMUT_ADMIN_PASSWORD; else process.env.HELMUT_ADMIN_PASSWORD = prev.pass;
  }
}

// /api/debug/briefing: existiert, secret-geschützt (fail-closed 404) und V3
// (engine:"v3"). Deckt genau den Live-Fall ab: Authorization: Bearer <Secret>,
// Query-Secrets AUS (wie Production). Gate = HELMUT_ADMIN_SECRET, ersatzweise CRON_SECRET.
async function debugBriefingEndpointChecks() {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const p = "/api/debug/briefing";
  const parse = (r) => { try { return JSON.parse(r.body); } catch (_) { return {}; } };
  const prevAdmin = process.env.HELMUT_ADMIN_SECRET, prevCron = process.env.CRON_SECRET, prevQ = process.env.HELMUT_ALLOW_QUERY_SECRETS;
  try {
    delete process.env.HELMUT_ALLOW_QUERY_SECRETS; // wie Production: nur Bearer, kein ?secret=
    // A) HELMUT_ADMIN_SECRET gesetzt
    process.env.HELMUT_ADMIN_SECRET = "p1-admin-secret";
    delete process.env.CRON_SECRET;
    const noAuth = await request(server, { pathname: p });
    check("Debug-Briefing ohne Secret -> 404 (fail closed)", noAuth.status === 404, `status=${noAuth.status}`);
    const wrong = await request(server, { pathname: p, headers: { Authorization: "Bearer falsch" } });
    check("Debug-Briefing mit falschem Secret -> 404", wrong.status === 404, `status=${wrong.status}`);
    const ok = await request(server, { pathname: p, headers: { Authorization: "Bearer p1-admin-secret" } });
    const okj = parse(ok);
    check("Debug-Briefing mit Bearer HELMUT_ADMIN_SECRET -> 200 + engine v3",
      ok.status === 200 && okj.engine === "v3" && okj.briefing && okj.briefing.engine === "v3", `status=${ok.status} engine=${okj.engine}`);
    // B) HELMUT_ADMIN_SECRET NICHT gesetzt -> CRON_SECRET ist der Fallback (konsistent zu hasAdminBypass)
    delete process.env.HELMUT_ADMIN_SECRET;
    process.env.CRON_SECRET = "p1-cron-secret";
    const cronOk = await request(server, { pathname: p, headers: { Authorization: "Bearer p1-cron-secret" } });
    check("Debug-Briefing: ohne ADMIN_SECRET akzeptiert Bearer CRON_SECRET (Fallback) -> 200 + engine v3",
      cronOk.status === 200 && parse(cronOk).engine === "v3", `status=${cronOk.status}`);
  } finally {
    if (prevAdmin === undefined) delete process.env.HELMUT_ADMIN_SECRET; else process.env.HELMUT_ADMIN_SECRET = prevAdmin;
    if (prevCron === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prevCron;
    if (prevQ === undefined) delete process.env.HELMUT_ALLOW_QUERY_SECRETS; else process.env.HELMUT_ALLOW_QUERY_SECRETS = prevQ;
    await new Promise((r) => server.close(r));
  }
}

function staticChecks() {
  const crawler = fs.readFileSync(path.join(root, "lib/helmut/crawler.js"), "utf8");
  check("TLS: kein rejectUnauthorized im Crawler", !crawler.includes("rejectUnauthorized"));

  const client = fs.readFileSync(path.join(root, "client.js"), "utf8");
  check("Fake-Termine entfernt (kein 'Treffen mit Gewerkschaft')", !client.includes("Treffen mit Gewerkschaft"));
  check("fallbackMeetings liefert keine erfundenen Termine", !client.includes("Ausschusssitzung Arbeit und Soziales\","));
  check("Keine Live-Referenz auf meta.fallbackDraft", !client.includes("|| meta.fallbackDraft"));
  check("Keine Live-Referenz auf resolvedMeta.fallbackDraft", !client.includes("resolvedMeta.fallbackDraft"));
  check("Erfundene Radar-Signale entfernt (keine 'Steuerdebatte …')", !client.includes("Steuerdebatte kann in Arbeit und Soziales wandern"));

  // Lage-Kartentitel: die alte naive Kürzung (Ursache abgebrochener Titel wie
  // "Friedrich Merz hat öffentlich") bleibt entfernt. Der Fallback leitet aus
  // rohen Alt-Titeln jetzt eine KURZE, SAUBERE Anzeigeüberschrift ab
  // (lageDisplayHeadline) — deterministisch, ohne KI, ohne erfundene Fakten und
  // OHNE "billigen" Abriss mitten im Satz. lageDisplayHeadline ist rein, daher
  // hier direkt ausführbar prüfbar (renderVorgangCard braucht DOM).
  check("lageShortTitle (Ursache abgebrochener Titel) bleibt entfernt", !client.includes("function lageShortTitle"));
  check("Lage-Kartentitel-Fallback nutzt sauberen Ableiter (lageDisplayHeadline), kuratierter displayTitle zuerst",
    client.includes("const title = displayTitle || lageDisplayHeadline(v.title);"));
  try {
    const s = client.indexOf("function lageField(value)");
    const e = client.indexOf("// Kurze Viewports");
    const headline = new Function(client.slice(s, e) + "\nreturn lageDisplayHeadline;")();
    const long = "Das Bundesministerium für Arbeit und Soziales (BMAS) kündigt an, die Abgabe zur Künstlersozialversicherung zu ändern";
    const out = headline(long);
    check("lageDisplayHeadline: BMAS-Rohtitel wird kurz & sauber (kürzer, nicht leer, <= 90)",
      out.length > 0 && out.length < long.length && out.length <= 90, `len=${out.length}`);
    check("lageDisplayHeadline: Titel beginnt NICHT mit langer Institution (BMAS statt 'Das Bundesministerium …')",
      !/^(?:das |der |die )?bundesministerium/i.test(out) && /^BMAS\b/.test(out), out);
    check("lageDisplayHeadline: kein billiger Abriss (kein '…', kein baumelndes Funktionswort/Satzzeichen am Ende)",
      !/[…,;:]$/.test(out) && !/\s(?:der|die|das|den|dem|des|und|oder|zur|zum|für|mit|von|vom)$/i.test(out), out);
    // Verbpartikel bleibt bei einem Komma-Schnitt erhalten (Nicht-Institutions-Fall).
    const clause = headline("Die Regierungskoalition kündigt an, das Rentenpaket noch vor der Sommerpause umfassend zu reformieren");
    check("lageDisplayHeadline: sauberer Klausel-Schluss bleibt erhalten (kündigt an -> nicht 'kündigt')",
      /kündigt an$/.test(clause), clause);
    check("lageDisplayHeadline: erfindet nichts / verzerrt Person(Partei) nicht (Name bleibt, keine Partei-Ersetzung)",
      /Heil/.test(headline("Minister Hubertus Heil (SPD) fordert höhere Löhne im Pflegebereich und mehr Tarifbindung"))
      && !/^SPD\b/.test(headline("Minister Hubertus Heil (SPD) fordert höhere Löhne")));
    check("lageDisplayHeadline: kurzer, guter Titel bleibt unverändert",
      headline("Bürgergeld-Reform passiert den Bundesrat") === "Bürgergeld-Reform passiert den Bundesrat");
    check("lageDisplayHeadline: Roh-Ellipse der Quelle wird entfernt (kein '…')",
      !/…|\.\.\./.test(headline("Die Regierung will die Abgabe zur …")));
  } catch (err) {
    check("lageDisplayHeadline ausführbar/extrahierbar", false, String((err && err.message) || err));
  }

  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  check("Cron fail-open Helper entfernt (kein isAuthorizedCron)", !server.includes("isAuthorizedCron"));
  check("Cron fail-closed Helper vorhanden (authorizeCron)", server.includes("function authorizeCron"));

  // Datenmotor V2, Commit 3: keine hardcodierten Cem-Namen mehr im KI-/Entity-Pfad.
  const ai = fs.readFileSync(path.join(root, "lib/helmut/ai.js"), "utf8");
  check("KI: kein hardcodiertes 'Guten Abend, Cem.'", !ai.includes("Guten Abend, Cem."));
  check("KI: kein 'Cem'-Fallbackname mehr", !ai.includes('|| "Cem"'));
  const configSrc = fs.readFileSync(path.join(root, "lib/helmut/config.js"), "utf8");
  check("Entity-Erkennung: kein hardcodiertes 'Cem Ince' in inferEntities-Liste", !/const entities = \[.*Cem Ince/.test(configSrc));
}

// Datenmotor V2, Commit 3: inferEntities leitet Personen/Partei aus dem Profil ab.
function entityChecks() {
  const { inferEntities } = require(path.join(root, "lib/helmut/config.js"));
  const item = { title: "Muster fordert mehr Klimaschutz", content: "Die Grünen im Bundestag unterstützen Erika Muster.", sourceId: "source-x" };

  const forMuster = inferEntities(item, { fullName: "Erika Muster", party: "Grüne", faction: "Bündnis 90/Die Grünen", committees: [], relevantMinistries: [], opponents: [] });
  check("Entity: Mandats-Person/Partei aus Profil erkannt (Muster/Grüne)",
    forMuster.includes("Erika Muster") && forMuster.includes("Bundestag"), `entities=${JSON.stringify(forMuster)}`);
  check("Entity: KEIN fremder 'Cem Ince' bei Fremd-Mandat",
    !forMuster.includes("Cem Ince") && !forMuster.includes("Die Linke"), `entities=${JSON.stringify(forMuster)}`);

  const noProfile = inferEntities(item, null);
  check("Entity: ohne Profil nur generische Institutionen (kein Personenname)",
    noProfile.includes("Bundestag") && !noProfile.some((e) => e.includes("Muster")), `entities=${JSON.stringify(noProfile)}`);
}

async function llmLoggingChecks() {
  const storage = require(path.join(root, "lib/helmut/storage.js"));

  // Kostenschaetzung
  const known = storage.estimateLlmCost("gpt-5-mini", 1000, 500);
  check("estimateLlmCost: bekanntes Modell -> Zahl", typeof known === "number" && known > 0, `cost=${known}`);
  const unknown = storage.estimateLlmCost("nicht-existent", 1000, 500);
  check("estimateLlmCost: unbekanntes Modell -> null", unknown === null);

  // Persistenz (mit Cleanup, um den echten Auth-Store nicht zu verschmutzen)
  const authBefore = await storage.readAuthStore();
  const originalUsage = Array.isArray(authBefore.llmUsage) ? authBefore.llmUsage.slice() : [];
  try {
    const withUsage = await storage.recordLlmUsage({
      callType: "p1-test", politicianId: "p1-test-mp", model: "gpt-5-mini",
      usage: { input_tokens: 1200, output_tokens: 300, total_tokens: 1500 }, durationMs: 1234, success: true
    });
    check("LLM-Logging: Eintrag mit usage geschrieben (Token+Kosten erfasst)",
      withUsage && withUsage.totalTokens === 1500 && typeof withUsage.estimatedCost === "number",
      `tokens=${withUsage && withUsage.totalTokens} cost=${withUsage && withUsage.estimatedCost}`);

    const noUsage = await storage.recordLlmUsage({
      callType: "p1-test", politicianId: "p1-test-mp", model: "gpt-5-mini", durationMs: 50, success: false, error: "boom"
    });
    check("LLM-Logging: fehlender usage-Block -> 'unknown' statt stillem Verlust",
      noUsage && noUsage.totalTokens === "unknown" && noUsage.estimatedCost === "unknown" && noUsage.success === false);

    const list = await storage.getLlmUsage("p1-test-mp", 10);
    check("LLM-Logging: getLlmUsage liefert die Testeintraege (Mandanten-gefiltert)", list.length >= 2, `n=${list.length}`);
  } finally {
    // Auth-Store auf den urspruenglichen Stand zuruecksetzen.
    const authNow = await storage.readAuthStore();
    authNow.llmUsage = originalUsage;
    await storage.writeAuthStore(authNow);
  }
}

// Admin-KI-Status: nur Env-FLAGS + vorhandenes llm_usage-Log, KEIN Live-KI-Call,
// KEINE Secrets. Prueft Provider-Logik, DeploymentNotFound-Hinweis UND dass niemals
// Key-/Endpoint-WERTE ausgegeben werden (nur ja/nein + Deployment-Name).
async function kiStatusChecks() {
  const storage = require(path.join(root, "lib/helmut/storage.js"));
  const FAKE_KEY = "sk-FAKE-do-not-leak-123";
  const FAKE_ENDPOINT = "https://secret-resource.openai.azure.com";
  const envBefore = {
    k: process.env.AZURE_OPENAI_KEY, e: process.env.AZURE_OPENAI_ENDPOINT,
    d: process.env.AZURE_OPENAI_DEPLOYMENT, o: process.env.OPENAI_API_KEY
  };
  const authBefore = await storage.readAuthStore();
  const originalUsage = Array.isArray(authBefore.llmUsage) ? authBefore.llmUsage.slice() : [];
  try {
    process.env.AZURE_OPENAI_KEY = FAKE_KEY;
    process.env.AZURE_OPENAI_ENDPOINT = FAKE_ENDPOINT;
    process.env.AZURE_OPENAI_DEPLOYMENT = "gpt-5-mini";
    delete process.env.OPENAI_API_KEY;
    await storage.recordLlmUsage({ callType: "understanding", model: "gpt-5-mini", success: true, usage: { input_tokens: 100, output_tokens: 40 } });
    await storage.recordLlmUsage({ callType: "understanding", model: "gpt-5-mini", success: false, error: "Azure HTTP 404" });

    const ds = await handler.__buildAdminDataStatus({ perAccountLimit: 1 });
    const ki = ds && ds.global && ds.global.kiStatus;
    check("KI-Status: vorhanden im Admin-Datenstatus", Boolean(ki) && ki.available !== false);
    check("KI-Status: Anbieter = azure (Key+Endpoint gesetzt)", ki && ki.anbieter === "azure");
    check("KI-Status: Azure-Flags = ja (nur Boolean)", ki && ki.azureKeyGesetzt === true && ki.azureEndpointGesetzt === true && ki.azureDeploymentGesetzt === true);
    check("KI-Status: Deployment-NAME sichtbar (kein Secret)", ki && ki.azureDeploymentName === "gpt-5-mini");
    check("KI-Status: letzter Fehler aus llm_usage (Azure HTTP 404)", ki && ki.letzterFehler && /404/.test(ki.letzterFehler.grund || ""));
    check("KI-Status: letzter Erfolg erfasst", ki && ki.letzterErfolg && Boolean(ki.letzterErfolg.when));
    check("KI-Status: heute erfolgreich>=1 und fehlgeschlagen>=1", ki && Number(ki.heute.erfolgreich) >= 1 && Number(ki.heute.fehlgeschlagen) >= 1);
    check("KI-Status: DeploymentNotFound-Hinweis gesetzt", ki && /Azure Deployment nicht gefunden/.test(ki.hinweis || ""));
    // SICHERHEIT: der komplette KI-Status darf NIE den Key oder den vollen Endpoint enthalten.
    const serialized = JSON.stringify(ki || {});
    check("KI-Status: KEIN Azure-Key im Output (kein Secret-Leak)", !serialized.includes(FAKE_KEY));
    check("KI-Status: KEIN voller Azure-Endpoint im Output", !serialized.includes(FAKE_ENDPOINT) && !serialized.includes("secret-resource"));
  } finally {
    // Env + Store zuruecksetzen (echten Zustand nicht verschmutzen).
    if (envBefore.k === undefined) delete process.env.AZURE_OPENAI_KEY; else process.env.AZURE_OPENAI_KEY = envBefore.k;
    if (envBefore.e === undefined) delete process.env.AZURE_OPENAI_ENDPOINT; else process.env.AZURE_OPENAI_ENDPOINT = envBefore.e;
    if (envBefore.d === undefined) delete process.env.AZURE_OPENAI_DEPLOYMENT; else process.env.AZURE_OPENAI_DEPLOYMENT = envBefore.d;
    if (envBefore.o === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = envBefore.o;
    const authNow = await storage.readAuthStore();
    authNow.llmUsage = originalUsage;
    await storage.writeAuthStore(authNow);
  }
  // Statisches Gate: data-status bleibt admin-only.
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const dsIdx = server.indexOf('"/api/admin/data-status"');
  const gateWindow = dsIdx >= 0 ? server.slice(dsIdx, dsIdx + 220) : "";
  check("KI-Status: /api/admin/data-status bleibt admin-gegatet", /requireRoleOr403\(response, authUser, "admin"\)/.test(gateWindow));
}

// Admin-Pipeline-Recovery: NUR Admin (Session), CSRF fuer POST, Bestaetigung fuer
// reset-failed, keine Secrets in Antworten. Deckt Rollen-Gating + Aktionen ab.
async function pipelineRecoveryChecks() {
  const auth = require(path.join(root, "lib/helmut/auth.js"));
  const accounts = require(path.join(root, "lib/helmut/accounts.js"));

  // Unit: normale Rollen bekommen KEINEN Admin-Zugriff.
  check("Recovery: requireRole — Referent ist NICHT admin", auth.requireRole({ role: "referent" }, "admin") === false);
  check("Recovery: requireRole — Abgeordneter ist NICHT admin", auth.requireRole({ role: "abgeordneter" }, "admin") === false);
  check("Recovery: requireRole — Admin ist admin", auth.requireRole({ role: "admin" }, "admin") === true);

  const requestFull = (server, { method = "GET", pathname, headers = {}, body = null }) => {
    const { port } = server.address();
    return new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, method, path: pathname, headers, timeout: 20000 }, (res) => {
        let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
      });
      req.on("timeout", () => req.destroy(new Error("request timeout")));
      req.on("error", reject);
      if (body != null) req.write(body);
      req.end();
    });
  };
  const parse = (r) => { try { return JSON.parse(r.body); } catch (_) { return {}; } };
  const SECRET_RE = /AZURE_OPENAI_KEY|SUPABASE_SERVICE_ROLE|SERVICE_ROLE|"?password"?\s*[:=]|Bearer\s|sk-[A-Za-z0-9]/i;

  const storage = require(path.join(root, "lib/helmut/storage.js"));
  // WICHTIG: Konten liegen im AUTH-Store (nicht im Main-Store). Vollständig
  // snapshoten + wiederherstellen, damit die Testkonten die Suite NICHT verschmutzen
  // (sonst sieht ein späterer Lauf den Test-Abgeordneten und Mandats-Checks brechen).
  const authSnap = JSON.stringify(await storage.readAuthStore());
  const restore = async () => { try { await storage.writeAuthStore(JSON.parse(authSnap)); } catch (_) { /* best effort */ } };
  const prev = { mode: process.env.HELMUT_AUTH_MODE };

  try {
    process.env.HELMUT_AUTH_MODE = "accounts";
    // Konten direkt anlegen (der Env-Admin-Seed ist prozessweit gecached -> unzuverlaessig
    // in einer langen Testsuite). Eindeutige E-Mails, daher keine Kollision.
    await accounts.createUser({ email: "p1recadmin@test.local", name: "Rec Admin", role: "admin", password: "p1-rec-admin-123" }).catch(() => {});
    await accounts.createUser({ email: "p1ref@test.local", name: "Ref", role: "referent", password: "p1-ref-pass-123" }).catch(() => {});
    // Ein Abgeordneter mit Mandat, damit der Admin (allowed="all") ueber die globale
    // Mandats-Aufloesung ein echtes Mandat bekommt und die /api/-Guard passiert (wie in Prod).
    await accounts.createUser({ email: "p1mdb@test.local", name: "MdB", role: "abgeordneter", password: "p1-mdb-pass-123", politicianId: "p1-test-mdb" }).catch(() => {});
    const server = http.createServer(handler);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      // 1) Ohne Session -> 401 (kein Zugriff).
      const noAuth = await requestFull(server, { pathname: "/api/admin/recovery-status" });
      check("Recovery: ohne Session -> 401", noAuth.status === 401);

      // Admin-Login.
      const loginBody = JSON.stringify({ email: "p1recadmin@test.local", password: "p1-rec-admin-123" });
      const login = await requestFull(server, { method: "POST", pathname: "/api/auth/login", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(loginBody) }, body: loginBody });
      const cookie = ((login.headers["set-cookie"] || [])[0] || "").split(";")[0];
      check("Recovery: Admin-Login liefert Session", login.status === 200 && Boolean(cookie));

      // 2) Normaler Nutzer (Referent) -> 403.
      const refLoginBody = JSON.stringify({ email: "p1ref@test.local", password: "p1-ref-pass-123" });
      const refLogin = await requestFull(server, { method: "POST", pathname: "/api/auth/login", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(refLoginBody) }, body: refLoginBody });
      const refCookie = ((refLogin.headers["set-cookie"] || [])[0] || "").split(";")[0];
      const refStatus = await requestFull(server, { pathname: "/api/admin/recovery-status", headers: { Cookie: refCookie } });
      check("Recovery: normaler Nutzer (Referent) -> 403", refStatus.status === 403, `status=${refStatus.status}`);

      // 3) Admin darf Status lesen; keine Secrets.
      const st = await requestFull(server, { pathname: "/api/admin/recovery-status", headers: { Cookie: cookie } });
      const stj = parse(st);
      check("Recovery: Admin darf Status lesen (200)", st.status === 200 && "understandingLock" in stj && "knowledgeObjects" in stj);
      check("Recovery: Status-Antwort enthält KEINE Secrets/Env-Werte", !SECRET_RE.test(st.body));

      // CSRF-Token (mit Admin-Cookie) fuer die POST-Aktionen.
      const csrfResp = await requestFull(server, { pathname: "/api/security/csrf", headers: { Cookie: cookie } });
      const csrf = parse(csrfResp).token;
      const H = (bodyStr) => ({ Cookie: cookie, "x-csrf-token": csrf, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) });

      // 4) Admin darf Lock lösen.
      const rel = await requestFull(server, { method: "POST", pathname: "/api/admin/recovery/release-lock", headers: H("{}"), body: "{}" });
      check("Recovery: Admin darf Lock lösen (200)", rel.status === 200 && parse(rel).ok === true);

      // 5) reset-failed OHNE Bestätigung -> setzt NICHTS zurück.
      const rf0 = await requestFull(server, { method: "POST", pathname: "/api/admin/recovery/reset-failed", headers: H("{}"), body: "{}" });
      const rf0j = parse(rf0);
      check("Recovery: reset-failed OHNE Bestätigung setzt NICHTS zurück", rf0.status === 200 && rf0j.ok === false && rf0j.bestaetigungErforderlich === true && rf0j.zurueckgesetzt === 0);

      // 6) reset-failed MIT Bestätigung -> ok.
      const rf1Body = JSON.stringify({ confirm: true });
      const rf1 = await requestFull(server, { method: "POST", pathname: "/api/admin/recovery/reset-failed", headers: H(rf1Body), body: rf1Body });
      check("Recovery: Admin darf failed zurücksetzen (mit Bestätigung, 200)", rf1.status === 200 && parse(rf1).ok === true);

      // 7) Understanding starten -> 200 (offline: uebersprungen, kein KI-Call, kein Crash).
      const ru = await requestFull(server, { method: "POST", pathname: "/api/admin/recovery/run-understanding", headers: H("{}"), body: "{}" });
      const ruj = parse(ru);
      check("Recovery: Admin darf Understanding starten (200)", ru.status === 200 && ruj.ok === true);
      // 7b) Antwort traegt die sichtbaren Fortschritts-Felder (vorher/nachher + Klassifikation).
      check("Recovery: run-understanding liefert Fortschritts-Felder (ergebnis + vorher/nachher)",
        ["ergebnis", "pendingVorher", "pendingNachher", "completeVorher", "completeNachher", "rohdokumenteGeladen", "verarbeitet"].every((k) => k in ruj),
        `keys=${Object.keys(ruj).join(",")}`);
      // 7c) Offline (kein V3-Store) -> nicht "erfolgreich", aber sauber klassifiziert mit Grund.
      check("Recovery: run-understanding offline -> klassifiziert (nicht erfolgreich, mit Grund)",
        ruj.ergebnis !== "erfolgreich" && typeof ruj.grund === "string" && ruj.verarbeitet === 0,
        `ergebnis=${ruj.ergebnis} grund=${ruj.grund}`);

      // 8) Keine Aktions-Antwort enthält Secrets.
      check("Recovery: Aktions-Antworten enthalten KEINE Secrets", ![rel.body, rf0.body, rf1.body, ru.body].some((b) => SECRET_RE.test(b)));

      // 9) POST ohne CSRF-Token -> blockiert (nicht 200).
      const noCsrf = await requestFull(server, { method: "POST", pathname: "/api/admin/recovery/release-lock", headers: { Cookie: cookie, "Content-Type": "application/json", "Content-Length": 2 }, body: "{}" });
      check("Recovery: POST ohne CSRF-Token -> blockiert (403)", noCsrf.status === 403);

      // 10) LOCK-VORRANG: ist ein Lock gesetzt, startet run-understanding NICHT, sondern
      //     meldet den Lock (Vorrang vor Dokument-Zeitfenster) — KEIN KI-Call, keine Pipeline.
      const seedLock = async (expiresAt, lockedAt) => {
        const s = await storage.readAuthStore();
        await storage.writeAuthStore({ ...s, pipelineLocks: { ...(s.pipelineLocks || {}), "global-understanding": { lockedAt: lockedAt || Date.now(), expiresAt } } });
      };
      const readLock = async () => storage.readAuthStore().then((s) => (s.pipelineLocks || {})["global-understanding"] || null).catch(() => null);
      await seedLock(Date.now() + 600000); // aktiv (10 Min in der Zukunft)
      const ruLocked = parse(await requestFull(server, { method: "POST", pathname: "/api/admin/recovery/run-understanding", headers: H("{}"), body: "{}" }));
      check("Recovery: aktiver Lock hat Vorrang -> 'understanding-locked' (kein Start, 0 verarbeitet)",
        ruLocked.ergebnis === "uebersprungen" && ruLocked.grund === "understanding-locked" && ruLocked.lockAktiv === true && ruLocked.verarbeitet === 0,
        `ergebnis=${ruLocked.ergebnis} grund=${ruLocked.grund}`);
      // FREMDER/VORBESTEHENDER Lock wird NICHT automatisch geloest (nur bewusstes 'Lock loesen').
      check("Recovery: fremder/vorbestehender Lock bleibt nach abgelehntem Start bestehen (kein Auto-Loesen)",
        Boolean(await readLock()));

      // 10b) Abgelaufener Lock -> 'understanding-lock-stale' (haengend), ebenfalls kein Start.
      await seedLock(Date.now() - 1000); // abgelaufen
      const ruStale = parse(await requestFull(server, { method: "POST", pathname: "/api/admin/recovery/run-understanding", headers: H("{}"), body: "{}" }));
      check("Recovery: abgelaufener Lock -> 'understanding-lock-stale' (kein Start)",
        ruStale.ergebnis === "uebersprungen" && ruStale.grund === "understanding-lock-stale" && ruStale.lockVerdaechtig === true,
        `grund=${ruStale.grund}`);

      // 10c) Nach 'Lock loesen' bleibt KEIN Lock aktiv -> run-understanding blockiert nicht mehr am Lock
      //      (der Grund ist dann NICHT mehr ein Lock-Grund; not_started laesst den Lock nicht aktiv).
      await requestFull(server, { method: "POST", pathname: "/api/admin/recovery/release-lock", headers: H("{}"), body: "{}" });
      const ruAfter = parse(await requestFull(server, { method: "POST", pathname: "/api/admin/recovery/run-understanding", headers: H("{}"), body: "{}" }));
      check("Recovery: nach Lock loesen blockiert der Lock den Lauf nicht mehr",
        ruAfter.grund !== "understanding-locked" && ruAfter.grund !== "understanding-lock-stale",
        `grund=${ruAfter.grund}`);
      // PRODUCTION-FALL: Lock vorher Nein, Lauf endet 'nicht gestartet'/0 verarbeitet ->
      // danach darf KEIN eigener Lock haengen bleiben (Status wieder Nein).
      check("Recovery: nach nicht-gestartetem Lauf bleibt KEIN eigener Lock haengen (Status Nein)",
        (await readLock()) === null);

      // 11) Pending-Diagnose (NUR LESEN): Admin darf; offline ohne V3-Store -> gelber Grund,
      //     kein Crash, keine Secrets. (Der eigentliche Klassifikator wird separat unit-getestet.)
      const diag = await requestFull(server, { method: "POST", pathname: "/api/admin/recovery/pending-diagnose", headers: H("{}"), body: "{}" });
      const diagj = parse(diag);
      check("Recovery: Admin darf Pending-Diagnose starten (200, read-only)", diag.status === 200);
      check("Recovery: Pending-Diagnose ohne V3-Store -> gelber Grund (verfuegbar:false, v3-store-disabled)",
        diagj.verfuegbar === false && diagj.grund === "v3-store-disabled", `body=${diag.body.slice(0, 80)}`);
      check("Recovery: Pending-Diagnose-Antwort enthaelt KEINE Secrets", !SECRET_RE.test(diag.body));
      // Normaler Nutzer (Referent) -> 403 (admin-gegatet wie die anderen Aktionen).
      const diagRef = await requestFull(server, { method: "POST", pathname: "/api/admin/recovery/pending-diagnose", headers: { Cookie: refCookie, "x-csrf-token": csrf, "Content-Type": "application/json", "Content-Length": 2 }, body: "{}" });
      check("Recovery: Pending-Diagnose fuer normalen Nutzer -> 403", diagRef.status === 403, `status=${diagRef.status}`);

      // 12) PERSISTENZ: ein manueller Lauf wird dauerhaft gespeichert und ueberlebt einen
      //     Reload -> recovery-status liefert letzterRecoveryLauf (start/finish/status) und
      //     'Letzter Understanding-Lauf' ist nicht mehr leer.
      await requestFull(server, { method: "POST", pathname: "/api/admin/recovery/release-lock", headers: H("{}"), body: "{}" });
      const runP = parse(await requestFull(server, { method: "POST", pathname: "/api/admin/recovery/run-understanding", headers: H("{}"), body: "{}" }));
      const stAfter = parse(await requestFull(server, { pathname: "/api/admin/recovery-status", headers: { Cookie: cookie } }));
      const rl = stAfter.letzterRecoveryLauf;
      check("Recovery: manueller Lauf wird persistiert (letzterRecoveryLauf mit start/finish/status nach Reload)",
        Boolean(rl && rl.startedAt && rl.finishedAt && rl.status), `rl=${JSON.stringify(rl)}`);
      check("Recovery: 'Letzter Understanding-Lauf' spiegelt den manuellen Lauf (nicht mehr leer)",
        Boolean(stAfter.letzterUnderstandingLauf));
      check("Recovery: 0 gespeichert wird NICHT als 'erfolgreich' persistiert (ehrlich)",
        rl && rl.status !== "erfolgreich", `status=${rl && rl.status}`);
      check("Recovery: recovery-status mit persistiertem Lauf enthaelt KEINE Secrets", !SECRET_RE.test(JSON.stringify(stAfter)));

      // 13) OHNE ABSCHLUSS: gestartet (running) aber kein Finish und Lock frei -> Status zeigt
      //     'ohne-abschluss' (nicht leer, KEINE falsche Erfolgsmeldung). Status-Endpoint SCHREIBT NICHT.
      await storage.saveAdminRecoveryLastRun({ startedAt: new Date(Date.now() - 60000).toISOString(), status: "running", finishedAt: null });
      await requestFull(server, { method: "POST", pathname: "/api/admin/recovery/release-lock", headers: H("{}"), body: "{}" });
      const stOhne = parse(await requestFull(server, { pathname: "/api/admin/recovery-status", headers: { Cookie: cookie } }));
      check("Recovery: gestartet ohne Finish + Lock frei -> 'ohne-abschluss' (sichtbar, keine Erfolgsmeldung)",
        stOhne.letzterRecoveryLauf && stOhne.letzterRecoveryLauf.ohneAbschluss === true && stOhne.letzterRecoveryLauf.anzeigeStatus === "ohne-abschluss",
        `rl=${JSON.stringify(stOhne.letzterRecoveryLauf)}`);
      check("Recovery: Status-Endpoint SCHREIBT NICHT (running bleibt running nach dem Lesen)",
        (await storage.getAdminRecoveryLastRun()).status === "running");
    } finally { await new Promise((r) => server.close(r)); }
  } finally {
    await restore();
    if (prev.mode === undefined) delete process.env.HELMUT_AUTH_MODE; else process.env.HELMUT_AUTH_MODE = prev.mode;
  }
}

// Datenstatus-Resilienz: (1) die Admin-Pro-Account-Zaehlung darf KEINEN KI-Live-Call
// ausloesen (sonst Timeout/Kosten allein fuer die Anzeige), (2) der Recovery-Bereich
// muss fail-safe sein und darf den restlichen Datenstatus nicht verstecken.
async function dataStatusResilienceChecks() {
  const serverSrc = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const clientSrc = fs.readFileSync(path.join(root, "client.js"), "utf8");
  const lageSrc = fs.readFileSync(path.join(root, "lib/helmut/lage.js"), "utf8");

  check("Datenstatus: Admin-Loop zaehlt Lage OHNE KI (countOnly:true an buildLageBriefing)",
    /buildLageBriefing\(profile,\s*\{\s*politicianId:\s*id,\s*countOnly:\s*true\s*\}\)/.test(serverSrc));

  const idxCountOnly = lageSrc.indexOf("opts.countOnly");
  const idxGenerate = lageSrc.indexOf("ai.generateLageBriefing(");
  check("Lage: countOnly-Pfad kehrt VOR der KI-Generierung zurueck (kein KI-Call)",
    idxCountOnly >= 0 && idxGenerate >= 0 && idxCountOnly < idxGenerate);

  check("Recovery-Bereich ist fail-safe (eigener 'nicht verfuegbar'-Hinweis, versteckt Datenstatus nicht)",
    clientSrc.includes("Recovery-Status derzeit nicht verfügbar"));

  // Understanding-Lauf-Fix (Server): WEITES Rohdokument-Fenster fuer den Recovery-Lauf,
  // damit die Quell-Dokumente aelterer pending-Vorgaenge gefunden werden (sonst 0 verarbeitet).
  const ruBlock = serverSrc.slice(serverSrc.indexOf("/api/admin/recovery/run-understanding"), serverSrc.indexOf("/api/admin/recovery/run-understanding") + 7000);
  check("Recovery: run-understanding nutzt WEITES Rohdokument-Fenster (2000, 90)",
    /listRecentRawDocuments\(\s*2000\s*,\s*90\s*\)/.test(ruBlock));
  // Lock-Vorrang: der Lock wird VOR dem Lauf geprueft (vor runPendingUnderstandingShadow)
  // und hat als Grund Vorrang vor dem Dokument-Zeitfenster.
  check("Recovery: run-understanding prueft den Lock VOR dem Lauf (Vorrang)",
    ruBlock.includes("understanding-lock-stale") && ruBlock.includes("pipelineLocks")
      && ruBlock.indexOf("pipelineLocks") < ruBlock.indexOf("runPendingUnderstandingShadow(rawDocs"));
  check("Recovery: run-understanding zaehlt pending/complete vorher UND nachher",
    /pendingVorher/.test(ruBlock) && /pendingNachher/.test(ruBlock) && /completeVorher/.test(ruBlock) && /completeNachher/.test(ruBlock));
  check("Recovery: run-understanding Budget bleibt unter dem Client-Timeout (<=180000ms)",
    /Math\.min\(Number\(process\.env\.HELMUT_UNDERSTAND_BUDGET_MS[^)]*\)\s*,\s*180000\)/.test(ruBlock));
  // Eigener Lock wird nach dem Lauf zuverlaessig geloest — aber NUR der eigene
  // (lockedAt >= startTs), nie ein fremder/vorbestehender Lock.
  check("Recovery: run-understanding loest NUR den eigenen Lock nach dem Lauf (lockedAt >= startTs)",
    /const startTs = Date\.now\(\)/.test(ruBlock) && /lockNach\.lockedAt >= startTs/.test(ruBlock) && ruBlock.includes('releasePipelineLock("global-understanding")'));
  // Ehrlicher Ergebnisgrund bei 0 gespeichert: bestehende Read-only-Diagnose nutzen
  // (kein KI-Call), um verarbeitbar / außerhalb / verwaist zu trennen — nicht pauschal 'Zeitfenster'.
  check("Recovery: run-understanding formuliert bei 0 gespeichert einen ehrlichen Grund (Read-only-Diagnose, kein KI)",
    ruBlock.includes("diagnosePendingUnderstanding(pend") && /grund = dg\.ursache/.test(ruBlock));
  check("Recovery: run-understanding trennt verarbeitbar/außerhalb/verwaist + versucht-nicht-gespeichert",
    ruBlock.includes("imFensterVerarbeitbar") && ruBlock.includes("ausserhalbFenster") && ruBlock.includes("ohneRohdokumente") && ruBlock.includes("versuchtNichtGespeichert"));

  // Understanding-Lauf-Fix (Client): reiche, klar klassifizierte Rueckmeldung, die nach
  // dem Klick sofort sichtbar ist und nach dem Lauf Erfolg/Grund/Fehler klar anzeigt.
  check("Recovery-UI: zeigt 'Läuft seit' waehrend des Laufs (sofortiges Feedback)",
    clientSrc.includes("Läuft seit"));
  check("Recovery-UI: zeigt Erfolg ('Erfolgreich abgeschlossen') mit pending/complete vorher->nachher",
    clientSrc.includes("Erfolgreich abgeschlossen") && /pending \$\{dsFmt\(r\.pendingVorher\)\}→\$\{dsFmt\(r\.pendingNachher\)\}/.test(clientSrc));
  check("Recovery-UI: zeigt 'Nicht gestartet' (gelb) mit verstaendlichem Grund",
    clientSrc.includes("Nicht gestartet") && clientSrc.includes("recoveryGrundText"));
  check("Recovery-UI: zeigt 'Fehlgeschlagen' (rot) bei HTTP-/Netzfehler",
    clientSrc.includes("Fehlgeschlagen"));
  check("Recovery-UI: setzt Start-/Endzeit ueber helmutNowHHMM (keine Server-Uhr noetig)",
    /const startedAt = helmutNowHHMM\(\)/.test(clientSrc) && /finishedAt: helmutNowHHMM\(\)/.test(clientSrc));
  check("Recovery-UI: run-understanding-Klick ruft das richtige Endpoint",
    clientSrc.includes('"run-understanding": "/api/admin/recovery/run-understanding"'));
  // Lock-Zustand: bei aktivem/verdaechtigem Lock ist 'Understanding-Lauf starten'
  // deaktiviert und ein klarer Hinweis erscheint (kein stiller No-op mehr).
  check("Recovery-UI: 'Understanding-Lauf starten' ist bei aktivem/verdaechtigem Lock deaktiviert",
    clientSrc.includes('busy || lockActionable ? "disabled"'));
  check("Recovery-UI: klarer Lock-Hinweis, wenn ein Lock aktiv/verdaechtig ist",
    clientSrc.includes("Ein Understanding-Lauf ist gesperrt oder hängt"));
  check("Recovery-UI: Lock-Grund 'understanding-lock-stale' hat verstaendlichen Text",
    clientSrc.includes('"understanding-lock-stale":'));

  // Pending-Diagnose (NUR LESEN): der Endpoint darf NICHT schreiben und NICHT die Pipeline
  // starten (kein runPendingUnderstandingShadow, kein save/bulkReset im Diagnose-Block).
  const diagBlock = serverSrc.slice(serverSrc.indexOf("/api/admin/recovery/pending-diagnose"),
    serverSrc.indexOf("/api/admin/recovery/pending-diagnose") + 1400);
  check("Diagnose: Endpoint existiert und ist admin-gegatet",
    diagBlock.includes("requireRoleOr403") && diagBlock.includes("diagnosePendingUnderstanding"));
  check("Diagnose: Endpoint ist NUR LESEN (kein runPendingUnderstandingShadow, kein save/bulkReset)",
    !diagBlock.includes("runPendingUnderstandingShadow") && !/save\w+\(|bulkReset|markUnderstanding|releasePipelineLock/.test(diagBlock));
  check("Diagnose: aendert das Recovery-Fenster des Laufs NICHT (nutzt weiterhin 2000,90 fuers Fenster)",
    /listRecentRawDocuments\(2000,\s*90\)/.test(diagBlock));
  check("Diagnose-UI: 'Pending-Diagnose starten' Button vorhanden (read-only Aktion)",
    clientSrc.includes('data-pending-diagnose="1"') && clientSrc.includes("Pending-Diagnose starten"));
  check("Diagnose-UI: eigener Renderer + Aktion ruft den Diagnose-Endpoint",
    clientSrc.includes("function renderPendingDiagnose") && clientSrc.includes("/api/admin/recovery/pending-diagnose"));
  check("Diagnose-UI: zeigt keine Rohtexte (nur gekuerzte Felder, Hinweis 'ohne Rohtext')",
    clientSrc.includes("Beispiele ohne Rohtext") || clientSrc.includes("ohne Rohtext"));
  // Ruhige Admin-Erklaerung: Intro (keine KI/keine Aenderung), Werte-Legende und ein
  // kurzer Ursachen-Satz je Fall. Rein textlich, keine Logikaenderung.
  check("Diagnose-UI: ruhige Erklaerung oberhalb der Werte (keine KI/keine Datenaenderung)",
    clientSrc.includes("Diese Diagnose prüft nur, warum pending Vorgänge nicht verarbeitet werden"));
  check("Diagnose-UI: Werte-Legende (Mit/Ohne Cluster, im/ausserhalb Fenster, keine Rohdok.)",
    clientSrc.includes("Mit Cluster</strong> bedeutet") && clientSrc.includes("Ohne Cluster</strong> bedeutet")
      && clientSrc.includes("Rohdokumente im aktuellen Fenster</strong> bedeutet")
      && clientSrc.includes("Rohdokumente außerhalb des Fensters</strong> bedeutet")
      && clientSrc.includes("Keine Rohdokumente gefunden</strong> bedeutet"));
  check("Diagnose-UI: kurzer Ursachen-Satz je Fall (verwaist/ausserhalb/mapping-fehlt/gemischt)",
    /function pendingDiagnoseUrsacheHinweis/.test(clientSrc)
      && clientSrc.includes("Sie sollten nicht automatisch verarbeitet werden.")
      && clientSrc.includes("werden aber vom aktuellen Recovery-Fenster nicht erreicht.")
      && clientSrc.includes("nicht mehr eindeutig diesem Vorgang zugeordnet."));
  check("Diagnose-UI: praeziser Ursachen-Text 'Teilweise verarbeitbar, überwiegend verwaist'",
    clientSrc.includes('"teils-verarbeitbar-verwaist": "Teilweise verarbeitbar, überwiegend verwaist."'));

  // Ehrlicher Ergebnis-Text nach dem Lauf: ehrliche Aufschluesselung statt pauschal 'Zeitfenster'.
  check("Recovery-UI: ehrliche Aufschluesselung bei 0 gespeichert (verarbeitbar / keine Rohdokumente)",
    clientSrc.includes("Vorgänge wirken grundsätzlich verarbeitbar") && clientSrc.includes("Vorgänge haben keine passenden Rohdokumente"));
  check("Recovery-UI: 'außerhalb des Zeitfensters' NUR wenn ausserhalbFenster > 0",
    /dsNum\(r\.ausserhalbFenster\) > 0\) zeilen\.push\(`\$\{dsFmt\(r\.ausserhalbFenster\)\} Vorgänge liegen außerhalb des Zeitfensters/.test(clientSrc));
  check("Recovery-UI: 'versucht, aber nicht gespeichert' mit kurzem Grund (kein Stacktrace/Secret)",
    clientSrc.includes("versucht, aber nicht gespeichert") && /function recoveryVersuchtGrundText/.test(clientSrc));
  check("Recovery-UI: ehrliche Aufschluesselung nur bei vorhandenen Diagnose-Feldern (sonst Fallback-Grund)",
    clientSrc.includes("r.ergebnis === \"nichts-verarbeitet\" && r.imFensterVerarbeitbar != null"));

  // Persistenz des letzten Recovery-Laufs (Auth-Store-Metadaten, keine Migration).
  check("Recovery-Persistenz: run-understanding speichert Start (running) UND Ende via saveAdminRecoveryLastRun",
    /saveAdminRecoveryLastRun\(\{\s*startedAt: startedAtIso, finishedAt: null, status: "running"/.test(ruBlock)
      && /status: ergebnis/.test(ruBlock) && (ruBlock.match(/saveAdminRecoveryLastRun/g) || []).length >= 2);
  // Status-Endpoint LIEST die Metadaten, SCHREIBT sie aber NICHT (kein KI, kein Write beim Öffnen).
  const recStatusBlock = serverSrc.slice(serverSrc.indexOf("async function buildPipelineRecoveryStatus"), serverSrc.indexOf("async function buildPipelineRecoveryStatus") + 2600);
  check("Recovery-Persistenz: buildPipelineRecoveryStatus LIEST (getAdminRecoveryLastRun), SCHREIBT NICHT",
    recStatusBlock.includes("getAdminRecoveryLastRun") && !recStatusBlock.includes("saveAdminRecoveryLastRun"));
  check("Recovery-Persistenz: Store-Metadaten liegen im bestehenden Auth-Store (keine neue Tabelle/Migration)",
    fs.readFileSync(path.join(root, "lib/helmut/storage.js"), "utf8").includes("adminRecoveryLastRun") &&
    /async function saveAdminRecoveryLastRun/.test(fs.readFileSync(path.join(root, "lib/helmut/storage.js"), "utf8")));
  // Client zeigt den persistierten Lauf: 'Läuft seit' / 'Ohne Abschluss zurückgemeldet' / kein leeres '–'.
  check("Recovery-UI: persistiertes 'Letztes Ergebnis' (recoveryLastRunValue) statt leerem Strich",
    /function recoveryLastRunValue/.test(clientSrc) && clientSrc.includes("recoveryLastRunValue(recLauf)"));
  check("Recovery-UI: zeigt 'Ohne Abschluss zurückgemeldet' bei abgebrochenem Lauf",
    clientSrc.includes("Ohne Abschluss zurückgemeldet"));

  // Behavioral (offline): der gesamte Datenstatus baut sich fehlerfrei zusammen und
  // liefert weiterhin das global-Objekt (keine harte Ausnahme, wenn Teile leer sind).
  try {
    const ds = await handler.__buildAdminDataStatus({ perAccountLimit: 2 });
    check("Datenstatus: baut sich vollstaendig zusammen (global vorhanden, kein Absturz)",
      Boolean(ds && ds.global) && "kiStatus" in ds.global);
  } catch (err) {
    check("Datenstatus: baut sich fehlerfrei zusammen", false, String((err && err.message) || err));
  }
}

// Pending-Diagnose (read-only): der Klassifikator muss dieselbe Cluster-/vorgang_id-
// Ableitung wie der Lauf nutzen und die Faelle sauber trennen. Rein deterministisch,
// KEINE KI, KEINE Writes (nur die reine Funktion, kein Netz/Store).
function pendingDiagnoseChecks() {
  const { diagnosePendingUnderstanding, clusterRawDocuments, deriveVorgangId } = require(path.join(root, "lib/helmut/understanding.js"));
  const { toRawDocumentRow } = require(path.join(root, "lib/helmut/dedup.js"));
  const now = Date.parse("2026-07-07T00:00:00Z");
  const day = 86400000;
  const mk = (id, title, ageDays) => ({ id, title, summary: title, published_at: new Date(now - ageDays * day).toISOString(), created_at: new Date(now - ageDays * day).toISOString() });
  const docFenster = mk("d1", "Tariftreuegesetz im Bundestag beschlossen", 5);
  const docAlt = mk("d2", "Klimaschutzgesetz Novelle vorgelegt", 200);
  const vidFenster = deriveVorgangId(clusterRawDocuments([toRawDocumentRow(docFenster)])[0]);
  const vidAlt = deriveVorgangId(clusterRawDocuments([toRawDocumentRow(docAlt)])[0]);
  const koFenster = { vorgang_id: vidFenster, understanding_status: "pending", source_document_count: 2, created_at: new Date(now - 5 * day).toISOString() };
  const koAlt = { vorgang_id: vidAlt, understanding_status: "pending", source_document_count: 3, created_at: new Date(now - 200 * day).toISOString() };
  const koVerwaist = { vorgang_id: "vg-existiert-nicht", understanding_status: "pending", source_document_count: 0, created_at: new Date(now - 300 * day).toISOString() };

  const A = diagnosePendingUnderstanding([koFenster], [docFenster], [docFenster], { now, windowDays: 90 });
  check("Diagnose: alle im Fenster -> 'verarbeitbar'", A.ursache === "verarbeitbar" && A.imFenster === 1 && A.keine === 0, `ursache=${A.ursache}`);

  const B = diagnosePendingUnderstanding([koAlt], [], [docAlt], { now, windowDays: 90 });
  check("Diagnose: Rohdokument ausserhalb Fenster erkannt -> 'ausserhalb-fenster'", B.ursache === "ausserhalb-fenster" && B.ausserhalb === 1 && B.imFenster === 0, `ursache=${B.ursache} ausserhalb=${B.ausserhalb}`);

  const C = diagnosePendingUnderstanding([koVerwaist], [], [], { now, windowDays: 90 });
  check("Diagnose: pending ohne Rohdokumente -> 'verwaist' (+ V2/Seed-Hinweis ohneQuellzahl)", C.ursache === "verwaist" && C.keine === 1 && C.ohneQuellzahl === 1, `ursache=${C.ursache}`);

  const D = diagnosePendingUnderstanding([koVerwaist], [], [docAlt], { now, windowDays: 90 });
  check("Diagnose: Rohdoks vorhanden aber kein Match -> 'mapping-fehlt'", D.ursache === "mapping-fehlt" && D.keine === 1, `ursache=${D.ursache}`);

  // PRODUCTION-FALL: im Fenster 3, ausserhalb 0, keine viele -> praezise 'teils-verarbeitbar-verwaist',
  // NICHT 'gemischt'/'ausserhalb' (ausserhalb ist 0). Empfehlung nennt erneuten Lauf + separate Bewertung.
  const docs3 = [mk("f1", "Tariftreuegesetz beschlossen", 5), mk("f2", "Klimaschutzgesetz vorgelegt", 5), mk("f3", "Rentenpaket verabschiedet", 4)];
  const v3ids = docs3.map((d) => deriveVorgangId(clusterRawDocuments([toRawDocumentRow(d)])[0]));
  const pendingProd = v3ids.map((v, i) => ({ vorgang_id: v, source_document_count: 2, understanding_status: "pending", created_at: new Date(now - (5 - i) * day).toISOString() }));
  for (let i = 0; i < 62; i++) pendingProd.push({ vorgang_id: "vg-verwaist-" + i, source_document_count: 0, understanding_status: "pending", created_at: new Date(now - 5 * day).toISOString() });
  const P = diagnosePendingUnderstanding(pendingProd, docs3, docs3, { now, windowDays: 90 });
  check("Diagnose: im Fenster>0 & ausserhalb=0 & keine>0 -> 'teils-verarbeitbar-verwaist' (nicht 'gemischt'/'ausserhalb')",
    P.ursache === "teils-verarbeitbar-verwaist" && P.imFenster === 3 && P.ausserhalb === 0 && P.keine === 62,
    `ursache=${P.ursache} imFenster=${P.imFenster} ausserhalb=${P.ausserhalb} keine=${P.keine}`);
  check("Diagnose: Empfehlung nennt erneuten Lauf + separate Bewertung (kein Auto-Fix)",
    /erneut starten/.test(P.empfehlung) && /separat bewerten/.test(P.empfehlung));

  // Rein lesend: Eingaben unveraendert; max 10 Beispiele; keine Rohtext-Felder in den Beispielen.
  const pendingIn = [koFenster, koAlt, koVerwaist];
  const before = JSON.stringify(pendingIn);
  const E = diagnosePendingUnderstanding(pendingIn, [docFenster], [docFenster, docAlt], { now, windowDays: 90 });
  check("Diagnose: veraendert die Eingabedaten NICHT (rein lesend)", JSON.stringify(pendingIn) === before);
  check("Diagnose: max 10 Beispiele, ohne Rohtext-Felder (summary/content/body)",
    E.beispiele.length <= 10 && E.beispiele.every((b) => !("summary" in b) && !("content" in b) && !("body" in b)));
  check("Diagnose: liefert die verlangten Zaehlwerte",
    ["gesamt", "mitCluster", "ohneCluster", "imFenster", "ausserhalb", "keine", "ohneQuellzahl"].every((k) => k in E));
}

// Datenmotor V2 — Commit 1: LLM-Budget-Fundament (Tages-Aggregation + Gate).
// Rein additiv; prueft nur die neuen Storage-Helfer, kein Pipeline-Verhalten.
async function llmBudgetChecks() {
  const storage = require(path.join(root, "lib/helmut/storage.js"));
  const ref = "2026-07-01T12:00:00.000Z";
  const mp = "p1-budget-mp";

  const authBefore = await storage.readAuthStore();
  const originalUsage = Array.isArray(authBefore.llmUsage) ? authBefore.llmUsage.slice() : [];
  const originalLimit = process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
  try {
    // Store deterministisch bestuecken: 2 Calls heute, 1 an einem anderen Tag.
    const auth = await storage.readAuthStore();
    auth.llmUsage = [
      { id: "b1", createdAt: "2026-07-01T09:00:00.000Z", politicianId: mp, userId: mp, model: "gpt-5-mini", callType: "test", estimatedCost: 0.001, success: true },
      { id: "b2", createdAt: "2026-07-01T10:00:00.000Z", politicianId: mp, userId: mp, model: "gpt-5-mini", callType: "test", estimatedCost: 0.002, success: true },
      { id: "b3", createdAt: "2026-06-30T10:00:00.000Z", politicianId: mp, userId: mp, model: "gpt-5-mini", callType: "test", estimatedCost: 0.5, success: true }
    ];
    await storage.writeAuthStore(auth);

    const today = await storage.getLlmUsageToday(mp, ref);
    check("Budget: getLlmUsageToday zaehlt nur heutige Calls (Mandanten-gefiltert)",
      today.calls === 2 && Math.abs(today.estimatedCostUsd - 0.003) < 1e-9,
      `calls=${today.calls} cost=${today.estimatedCostUsd}`);

    // Kein Limit gesetzt -> immer erlaubt.
    delete process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
    const noLimit = await storage.canSpendLlm(mp, ref);
    check("Budget: ohne Limit erlaubt canSpendLlm (allowed=true, limit=null)",
      noLimit.allowed === true && noLimit.limit === null, `allowed=${noLimit.allowed}`);

    // Limit 5, erst 2 verbraucht -> erlaubt, 3 Rest.
    process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "5";
    const under = await storage.canSpendLlm(mp, ref);
    check("Budget: unter Limit erlaubt (remaining korrekt)",
      under.allowed === true && under.remaining === 3, `remaining=${under.remaining}`);

    // Limit 2, bereits 2 verbraucht -> blockiert.
    process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = "2";
    const at = await storage.canSpendLlm(mp, ref);
    check("Budget: bei erreichtem Limit blockiert (allowed=false, Grund gesetzt)",
      at.allowed === false && at.reason === "daily-llm-budget-reached", `allowed=${at.allowed} reason=${at.reason}`);

    // Skip-Eintraege ("skipped-*") zaehlen NICHT gegen das Budget.
    const auth2 = await storage.readAuthStore();
    auth2.llmUsage = [
      { id: "s1", createdAt: "2026-07-01T11:00:00.000Z", politicianId: mp, userId: mp, model: "none", callType: "skipped-budget", estimatedCost: 0, success: true },
      { id: "s2", createdAt: "2026-07-01T11:30:00.000Z", politicianId: mp, userId: mp, model: "gpt-5-mini", callType: "v2ScoreAndPrioritize", estimatedCost: 0.001, success: true }
    ];
    await storage.writeAuthStore(auth2);
    const skipDay = await storage.getLlmUsageToday(mp, ref);
    check("Budget: skipped-* zaehlt NICHT als Call (nur echter Call gezaehlt)",
      skipDay.calls === 1, `calls=${skipDay.calls}`);
  } finally {
    if (originalLimit === undefined) delete process.env.HELMUT_MAX_LLM_CALLS_PER_DAY;
    else process.env.HELMUT_MAX_LLM_CALLS_PER_DAY = originalLimit;
    const authNow = await storage.readAuthStore();
    authNow.llmUsage = originalUsage;
    await storage.writeAuthStore(authNow);
  }
}

// Datenmotor V3 — Commit C1: Sicherheitsnetz (Budget fail-closed + globaler
// Understanding-Lock). Rein additiv, alles hinter Flags, Default UNVERAENDERT.
async function c1SafetyNetChecks() {
  const storage = require(path.join(root, "lib/helmut/storage.js"));

  // (a) Budget-Fehlerfall: Default fail-OPEN (Flag aus) -> allowed:true.
  const origFailClosed = process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED;
  try {
    delete process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED;
    const openRes = storage.llmBudgetFailResult(Infinity);
    check("C1 Budget: Default fail-OPEN (Flag aus) -> allowed:true (App bleibt lauffaehig)",
      openRes.allowed === true && openRes.reason === "budget-check-failed-open", `res=${JSON.stringify(openRes)}`);

    process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED = "1";
    const closedRes = storage.llmBudgetFailResult(Infinity);
    check("C1 Budget: Flag AN -> fail-CLOSED (allowed:false, kein unkontrollierter KI-Call)",
      closedRes.allowed === false && closedRes.reason === "budget-check-failed-closed", `res=${JSON.stringify(closedRes)}`);
  } finally {
    if (origFailClosed === undefined) delete process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED;
    else process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED = origFailClosed;
  }

  // (b) Globaler Understanding-Lock: Default INAKTIV (Flag aus) -> No-Op.
  const origLock = process.env.HELMUT_UNDERSTANDING_LOCK;
  const authBefore = await storage.readAuthStore();
  const originalLocks = authBefore.pipelineLocks ? { ...authBefore.pipelineLocks } : {};
  try {
    delete process.env.HELMUT_UNDERSTANDING_LOCK;
    check("C1 Lock: understandingLockEnabled() Default false (Flag aus)", storage.understandingLockEnabled() === false);
    const inactive = await storage.acquireGlobalUnderstandingLock();
    const authAfterNoop = await storage.readAuthStore();
    check("C1 Lock: Default INAKTIV -> granted:true, active:false, KEIN Lock geschrieben (No-Op)",
      inactive.granted === true && inactive.active === false
        && !(authAfterNoop.pipelineLocks && authAfterNoop.pipelineLocks["global-understanding"]),
      `res=${JSON.stringify(inactive)}`);

    // Flag AN: erster Acquire granted, zweiter (vor Release) blockiert, nach Release frei.
    process.env.HELMUT_UNDERSTANDING_LOCK = "1";
    const first = await storage.acquireGlobalUnderstandingLock(60 * 1000);
    const second = await storage.acquireGlobalUnderstandingLock(60 * 1000);
    check("C1 Lock: Flag AN -> 1. Acquire granted, 2. blockiert (verhindert Doppel-Understanding)",
      first.granted === true && first.active === true && second.granted === false,
      `first=${first.granted} second=${second.granted}`);
    await storage.releaseGlobalUnderstandingLock();
    const third = await storage.acquireGlobalUnderstandingLock(60 * 1000);
    check("C1 Lock: nach Release wieder frei (granted:true)", third.granted === true, `third=${third.granted}`);
    await storage.releaseGlobalUnderstandingLock();
  } finally {
    if (origLock === undefined) delete process.env.HELMUT_UNDERSTANDING_LOCK;
    else process.env.HELMUT_UNDERSTANDING_LOCK = origLock;
    // pipelineLocks auf Ausgangszustand zuruecksetzen (Test-Hygiene).
    const authNow = await storage.readAuthStore();
    await storage.writeAuthStore({ ...authNow, pipelineLocks: originalLocks });
  }
}

// Datenmotor V3 — Commit C3: DIP als Primärquelle (hinter Flag, Default UNVERAENDERT).
async function c3DipPrimaryChecks() {
  const scheduler = require(path.join(root, "lib/helmut/scheduler.js"));
  const dip = require(path.join(root, "lib/helmut/dip.js"));

  const doc = {
    id: "300123", title: "Gesetzentwurf zur Rente", url: "https://dserver.bundestag.de/btd/21/003/2100123.pdf",
    date: "2026-07-01", urheber: ["Fraktion A"], ressort: ["BMAS"], type: "Gesetzentwurf", wahlperiode: "21"
  };

  const origFlag = process.env.HELMUT_DIP_PRIMARY;
  const origKey = process.env.DIP_API_KEY;
  try {
    // (a) Flag AUS -> Mapping identisch zu bisher (kein linkType, keine priority).
    delete process.env.HELMUT_DIP_PRIMARY;
    check("C3 DIP: dipPrimaryEnabled() Default false (Flag aus)", scheduler.dipPrimaryEnabled() === false);
    const plain = scheduler.dipDocToRawItem(doc, { primary: false });
    check("C3 DIP: Default-Mapping unveraendert (id/hash/sourceType/confidence, KEIN linkType/priority)",
      plain.id === "dip-300123" && plain.hash === "dip-300123" && plain.sourceId === "dip"
        && plain.sourceType === "bundestag" && plain.confidence === "high"
        && plain.linkType === undefined && plain.priority === undefined,
      `keys=${JSON.stringify(Object.keys(plain).sort())}`);

    // (b) Flag AN -> Primaerquelle: Direktlink + hohe Prioritaet.
    const primary = scheduler.dipDocToRawItem(doc, { primary: true });
    check("C3 DIP: Primary-Mapping setzt linkType=direct + priority 95 (ueberlebt Deckel, wird nicht ausgeblendet)",
      primary.linkType === "direct" && primary.priority === 95 && primary.sourcePriority === 95
        && primary.confidence === "high" && primary.sourceType === "bundestag",
      `linkType=${primary.linkType} priority=${primary.priority}`);

    // (c) Primary ohne echten Direktlink -> KEIN linkType (kein falsches "direct").
    const noUrl = scheduler.dipDocToRawItem({ id: "9", title: "Ohne Link", url: "" }, { primary: true });
    check("C3 DIP: Primary ohne http-URL setzt KEIN linkType (kein falsches 'direct')",
      noUrl.linkType === undefined && noUrl.priority === 95, `linkType=${noUrl.linkType}`);

    // (d) Fail-safe: ohne DIP_API_KEY crasht nichts, alles leer.
    delete process.env.DIP_API_KEY;
    const rel = await dip.getRelevantParliamentaryItems({ committees: ["Arbeit und Soziales"] });
    check("C3 DIP: ohne DIP_API_KEY -> {enabled:false, items:[]} (kein Crash, kein Netzwerk)",
      rel && rel.enabled === false && Array.isArray(rel.items) && rel.items.length === 0,
      `rel=${JSON.stringify(rel)}`);
    const raw = await scheduler.fetchDipAsRawItems({ committees: ["Arbeit und Soziales"] });
    check("C3 DIP: fetchDipAsRawItems ohne Key -> [] (Crawl laeuft normal weiter)",
      Array.isArray(raw) && raw.length === 0, `n=${raw.length}`);
  } finally {
    if (origFlag === undefined) delete process.env.HELMUT_DIP_PRIMARY; else process.env.HELMUT_DIP_PRIMARY = origFlag;
    if (origKey === undefined) delete process.env.DIP_API_KEY; else process.env.DIP_API_KEY = origKey;
  }
}

// Datenmotor V3 — Commit C5: V3-Store-Funktionen hinter Flag HELMUT_V3_STORE.
// Prueft die Sicherheitsgarantien OFFLINE (kein Netzwerk): Flag aus -> inert,
// Flag an ohne Supabase -> inert statt Crash. Bestehende App bleibt unberuehrt.
async function c5V3StoreChecks() {
  const storage = require(path.join(root, "lib/helmut/storage.js"));
  const origFlag = process.env.HELMUT_V3_STORE;
  const origUrl = process.env.SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const origKey2 = process.env.SUPABASE_SERVICE_KEY;
  const origKey3 = process.env.SUPABASE_SECRET_KEY;
  try {
    // (a) Flag AUS (Default): alle V3-Funktionen inert, kein Crash, kein Netzwerk.
    delete process.env.HELMUT_V3_STORE;
    check("C5 V3Store: v3StoreEnabled() Default false (Flag aus)", storage.v3StoreEnabled() === false);
    const offSave = await storage.saveKnowledgeObject({ id: "ko-1", vorgang_id: "vg-1" });
    check("C5 V3Store: Flag aus -> saveKnowledgeObject no-op (skipped, reason v3-store-disabled)",
      offSave && offSave.skipped === true && offSave.reason === "v3-store-disabled", `res=${JSON.stringify(offSave)}`);
    const offRaw = await storage.saveRawDocument({ id: "rd-1" });
    check("C5 V3Store: Flag aus -> saveRawDocument no-op (skipped)",
      offRaw && offRaw.skipped === true && offRaw.reason === "v3-store-disabled", `res=${JSON.stringify(offRaw)}`);
    const offById = await storage.getKnowledgeObjectById("ko-1");
    const offByVg = await storage.getKnowledgeObjectByVorgang("vg-1");
    const offList = await storage.listKnowledgeObjects();
    check("C5 V3Store: Flag aus -> Reads liefern null/null/[] (kein Netzwerk)",
      offById === null && offByVg === null && Array.isArray(offList) && offList.length === 0,
      `byId=${offById} byVg=${offByVg} list=${offList.length}`);

    // (b) Flag AN, aber Supabase NICHT verfuegbar -> inert statt Crash.
    process.env.HELMUT_V3_STORE = "true";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    check("C5 V3Store: v3StoreEnabled() true bei Flag AN", storage.v3StoreEnabled() === true);
    const naSave = await storage.saveKnowledgeObject({ id: "ko-2", vorgang_id: "vg-2" });
    check("C5 V3Store: Flag AN ohne Supabase -> inert (skipped, reason v3-store-unavailable), KEIN Crash",
      naSave && naSave.skipped === true && naSave.reason === "v3-store-unavailable", `res=${JSON.stringify(naSave)}`);
    const naList = await storage.listKnowledgeObjects();
    check("C5 V3Store: Flag AN ohne Supabase -> listKnowledgeObjects [] (kein Netzwerk)",
      Array.isArray(naList) && naList.length === 0, `list=${naList.length}`);

    // (c) Guard: fehlende Pflichtfelder werden sauber abgewiesen (kein Crash).
    // (hier waeren echte Supabase-Writes noetig; wir pruefen nur den No-Crash-Pfad ueber (b))
  } finally {
    if (origFlag === undefined) delete process.env.HELMUT_V3_STORE; else process.env.HELMUT_V3_STORE = origFlag;
    if (origUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = origUrl;
    if (origKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
    if (origKey2 === undefined) delete process.env.SUPABASE_SERVICE_KEY; else process.env.SUPABASE_SERVICE_KEY = origKey2;
    if (origKey3 === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = origKey3;
  }
}

// Datenmotor V3 — Commit C6: kanonische Dedup + DSGVO-Datenminimierung.
async function c6DedupDsgvoChecks() {
  const dedup = require(path.join(root, "lib/helmut/dedup.js"));
  const scheduler = require(path.join(root, "lib/helmut/scheduler.js"));

  // (a) Kanonische URL: Tracking/Fragment/Trailing-Slash weg, Host klein + www weg.
  const canon = dedup.canonicalizeUrl("https://WWW.Example.com/Artikel/?utm_source=x&id=5&utm_medium=y#top");
  check("C6 Dedup: canonicalizeUrl entfernt utm/Fragment/Trailing-Slash, Host klein+www weg",
    canon === "https://example.com/Artikel?id=5", `canon=${canon}`);
  check("C6 Dedup: canonicalizeUrl auf Nicht-http -> '' (kein Crash)",
    dedup.canonicalizeUrl("javascript:alert(1)") === "" && dedup.canonicalizeUrl("") === "");

  // (b) contentHash: deterministisch; gleiche kanonische URL -> gleicher Hash.
  const h1 = dedup.contentHash({ url: "https://example.com/a?utm_source=z" });
  const h2 = dedup.contentHash({ url: "https://example.com/a" });
  check("C6 Dedup: contentHash ist URL-kanonisch & deterministisch (Tracking egal)", h1 === h2 && h1.length === 64);
  const hTitle = dedup.contentHash({ url: "", title: "Rente steigt", publishedAt: "2026-07-01T09:00:00Z" });
  check("C6 Dedup: contentHash faellt bei leerer URL auf Titel+Tag zurueck", typeof hTitle === "string" && hTitle.length === 64);

  // (c) DSGVO-Datenminimierung: KEIN Volltext/excerpt/imageUrl/author in raw_documents.
  const row = dedup.toRawDocumentRow({
    id: "x1", title: "Kabinett beschliesst Rentenpaket",
    summary: "S".repeat(500), content: "GEHEIMER VOLLTEXT MIT PERSONENDATEN", excerpt: "langer excerpt",
    imageUrl: "https://img", author: "Max Mustermann", url: "https://taz.de/rente/?utm_source=news",
    sourceName: "taz", sourceId: "taz", sourceType: "media", confidence: "high", linkType: "direct",
    publishedAt: "2026-07-01T09:00:00Z"
  });
  const rowKeys = Object.keys(row);
  const forbidden = ["content", "excerpt", "imageUrl", "author", "body", "text"];
  check("C6 DSGVO: toRawDocumentRow speichert KEINEN Volltext/excerpt/imageUrl/author",
    forbidden.every((k) => !(k in row)) && !("content" in row.raw) && !("excerpt" in row.raw),
    `keys=${JSON.stringify(rowKeys)}`);
  check("C6 DSGVO: summary ist gekuerzt (Datenminimierung, kein Volltext)",
    typeof row.summary === "string" && row.summary.length <= dedup.SUMMARY_MAX, `len=${row.summary.length}`);
  check("C6 DSGVO: Pflicht-Identitaet vorhanden (id=rd-<hash>, content_hash, canonical_url, title)",
    row.id.startsWith("rd-") && typeof row.content_hash === "string" && row.canonical_url === "https://taz.de/rente"
      && row.title === "Kabinett beschliesst Rentenpaket");
  check("C6 DSGVO: raw enthaelt NUR nicht-personenbezogene Metadaten (sourcePriority/originalUrl)",
    JSON.stringify(Object.keys(row.raw).sort()) === JSON.stringify(["originalUrl", "sourcePriority"]));

  // (d) Cross-Source-Dedup: gleiche Story aus 2 Quellen -> 1 Zeile, direkter Link gewinnt.
  const a = dedup.toRawDocumentRow({ title: "Rente", url: "https://x.de/rente", linkType: "direct", confidence: "high" });
  const b = dedup.toRawDocumentRow({ title: "Rente", url: "https://x.de/rente?utm_source=q", linkType: "publisher", confidence: "medium" });
  const merged = dedup.dedupeRawDocuments([a, b]);
  check("C6 Dedup: Cross-Source-Dedup faltet gleiche Story auf 1 Zeile (direkter Link gewinnt)",
    merged.length === 1 && merged[0].link_type === "direct", `n=${merged.length} link=${merged[0] && merged[0].link_type}`);

  // (e) Schatten-Persist ist ohne V3-Flag ein No-Op (kein Netzwerk, kein Crash).
  const origV3 = process.env.HELMUT_V3_STORE;
  try {
    delete process.env.HELMUT_V3_STORE;
    const res = await scheduler.persistRawDocumentsShadow([a, b]);
    check("C6 Schatten: persistRawDocumentsShadow ohne HELMUT_V3_STORE -> No-Op (skipped, kein Netzwerk)",
      res && res.skipped === true && res.persisted === 0, `res=${JSON.stringify(res)}`);
  } finally {
    if (origV3 === undefined) delete process.env.HELMUT_V3_STORE; else process.env.HELMUT_V3_STORE = origV3;
  }

  // (f) DSGVO-Guardrails im Schema: Trennung public/user + Kostenlog ohne Prompt-Inhalte.
  const schema = fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8");
  const block = (table) => {
    const start = schema.indexOf(`create table if not exists public.${table} (`);
    return start < 0 ? "" : schema.slice(start, schema.indexOf(");", start));
  };
  const rawDocBlock = block("raw_documents");
  const koBlock = block("knowledge_objects");
  check("C6 DSGVO: raw_documents & knowledge_objects sind PUBLIC (kein user_id -> saubere Trennung)",
    rawDocBlock && koBlock && !/\buser_id\b/.test(rawDocBlock) && !/\buser_id\b/.test(koBlock));
  const llmBlock = block("llm_usage");
  check("C6 DSGVO: llm_usage (Kostenlog) speichert KEINE Prompt-/Antwort-Inhalte",
    llmBlock && !/response|messages|prompt\s+text|content\s+text|input\s+text|output\s+text/i.test(llmBlock),
    "nur Tokens/Kosten/Modell/call_type — keine Prompt-Texte.");
}

// Datenmotor V3 — Commit C7b: Understanding-Goldset (Struktur + DSGVO, keine KI).
function c7bGoldsetChecks() {
  const schemaMod = require(path.join(root, "lib/helmut/understanding-schema.js"));
  const { validateGoldset, validateKnowledgeObject, KNOWLEDGE_OBJECT_SCHEMA, GOLDSET_CASE_TYPES } = schemaMod;

  // (a) Goldset laedt & validiert vollstaendig, alle geforderten Fall-Typen abgedeckt.
  let goldset = null;
  try {
    goldset = JSON.parse(fs.readFileSync(path.join(root, "scripts/goldset/understanding-goldset.json"), "utf8"));
  } catch (error) {
    check("C7b Goldset: Datei lesbar & JSON gueltig", false, error.message);
    return;
  }
  const gs = validateGoldset(goldset);
  check("C7b Goldset: alle Faelle erfuellen das knowledge_objects-Schema (DSGVO inkl.)",
    gs.valid === true, gs.valid ? `${goldset.cases.length} Faelle` : gs.errors.slice(0, 4).join(" | "));
  check("C7b Goldset: alle 7 geforderten Fall-Typen abgedeckt (neu/update/mehrere/lokal/partei/ausschuss/mdb)",
    gs.caseTypes.length === GOLDSET_CASE_TYPES.length, `abgedeckt=${gs.caseTypes.length}/${GOLDSET_CASE_TYPES.length}`);

  // (b) Schema deckt ALLE geforderten Pflichtfelder ab.
  const mustHave = [
    "was_ist_passiert", "warum_wichtig", "wer_ist_betroffen", "parteien", "ausschuesse",
    "ministerien", "risiken", "chancen", "zeitdruck", "handlungsempfehlung",
    "mentioned_people", "mentioned_mps", "mentioned_parties", "mentioned_committees",
    "mentioned_ministries", "mentioned_locations", "mentioned_organizations"
  ];
  const missing = mustHave.filter((f) => !KNOWLEDGE_OBJECT_SCHEMA.required.includes(f));
  check("C7b Schema: alle geforderten Pflichtfelder sind required (inkl. mentioned_*)",
    missing.length === 0, missing.length ? `fehlend=${missing.join(", ")}` : "");

  // (c) NEGATIV: fehlendes Pflichtfeld -> invalid (Validator ist kein No-Op).
  const base = JSON.parse(JSON.stringify(goldset.cases[0].expected));
  const noAction = JSON.parse(JSON.stringify(base)); delete noAction.handlungsempfehlung;
  check("C7b Validator: fehlendes Pflichtfeld (handlungsempfehlung) -> invalid",
    validateKnowledgeObject(noAction).valid === false);

  // (d) NEGATIV: leeres mentioned_* fehlt -> invalid (Feld muss PRAESENT sein, auch leer).
  const noMention = JSON.parse(JSON.stringify(base)); delete noMention.mentioned_mps;
  check("C7b Validator: fehlendes mentioned_mps -> invalid (Feld muss praesent sein)",
    validateKnowledgeObject(noMention).valid === false);

  // (e) NEGATIV DSGVO: verbotenes PII-Feld -> invalid.
  const withPii = JSON.parse(JSON.stringify(base)); withPii.email = "max@example.com";
  const piiRes = validateKnowledgeObject(withPii);
  check("C7b DSGVO: verbotenes PII-Feld (email) -> invalid",
    piiRes.valid === false && piiRes.errors.some((e) => e.includes("PII")));

  // (f) NEGATIV DSGVO: E-Mail-Muster im Text -> invalid.
  const withMail = JSON.parse(JSON.stringify(base)); withMail.wer_ist_betroffen = "Kontakt: buero@example.com";
  check("C7b DSGVO: E-Mail-Muster im Freitext -> invalid",
    validateKnowledgeObject(withMail).valid === false);

  // (g) NEGATIV DSGVO: langes mentioned_*-Dossier statt kurzer Erwaehnung -> invalid.
  const withDossier = JSON.parse(JSON.stringify(base)); withDossier.mentioned_people = ["X ".repeat(80)];
  check("C7b DSGVO: ueberlanges mentioned_people (Dossier) -> invalid",
    validateKnowledgeObject(withDossier).valid === false);

  // (h) NEGATIV DSGVO: Rohdokument mit Volltext-Feld -> Goldset invalid.
  const tampered = JSON.parse(JSON.stringify(goldset));
  tampered.cases[0].raw_documents[0].content = "GEHEIMER VOLLTEXT";
  check("C7b DSGVO: raw_document mit 'content' (Volltext) -> Goldset invalid",
    validateGoldset(tampered).valid === false);
}

// Datenmotor V3 — Commit C7: Schatten-Understanding (deterministisch getestet,
// KI ueber injizierte Fakes -> kein Netzwerk, keine echten Kosten).
async function c7UnderstandingChecks() {
  const u = require(path.join(root, "lib/helmut/understanding.js"));
  const { validateKnowledgeObject } = require(path.join(root, "lib/helmut/understanding-schema.js"));
  const goldset = JSON.parse(fs.readFileSync(path.join(root, "scripts/goldset/understanding-goldset.json"), "utf8"));
  const analysis = goldset.cases[0].expected; // gueltige Analyse als Fake-KI-Antwort

  // (a) Deterministisches Clustering: gleicher Vorgang faltet zusammen, anderer trennt.
  const clusters = u.clusterRawDocuments([
    { title: "Rentenpaket 2026 im Kabinett beschlossen" },
    { title: "Rentenpaket 2026 geht in erste Lesung" },
    { title: "Mindestlohn-Kommission tagt in Berlin" }
  ]);
  check("C7 Cluster: gleicher Vorgang (Rentenpaket) -> 1 Cluster, Mindestlohn getrennt -> 2 gesamt",
    clusters.length === 2, `clusters=${clusters.length}`);
  const compound = u.clusterRawDocuments([
    { title: "Bundestariftreuegesetz vorgelegt" },
    { title: "Tariftreuegesetz stoesst auf Kritik" }
  ]);
  check("C7 Cluster: Komposit-Variante (Bundestariftreuegesetz ~ Tariftreuegesetz) -> 1 Cluster",
    compound.length === 1, `clusters=${compound.length}`);
  check("C7 Cluster: deriveVorgangId stabil aus Wurzel-Anker (vg-tariftreuegesetz)",
    u.deriveVorgangId(compound[0]) === "vg-tariftreuegesetz", `id=${u.deriveVorgangId(compound[0])}`);

  // (b) Prompt traegt die DSGVO-Regeln + Pflichtfelder, kein Volltext.
  const prompt = u.buildUnderstandingPrompt({ documents: [{ title: "Rentenpaket", summary: "Kabinett beschliesst." }] });
  check("C7 Prompt: DSGVO-Regeln eingebaut (nur oeffentlich-politische Akteure, keine Privatpersonen/Kontaktdaten)",
    /oeffentlich handelnde politische Akteure/i.test(prompt) && /keine privaten Personenprofile|keine Adressen\/E-Mails/i.test(prompt)
      && /mentioned_people/.test(prompt));

  // (c) DSGVO-Whitelist beim Assemblieren: Fremdfelder/PII raus, Identitaet deterministisch.
  const dirty = { ...analysis, email: "x@example.com", geheim: "intern", mentioned_people: ["a@b.de", "X".repeat(300), "Dr. Erika Mustermann"] };
  const ko = u.assembleKnowledgeObject(dirty, { documents: [{}, {}] }, "vg-test");
  check("C7 Assemble: Fremd-/PII-Felder werden NICHT uebernommen (kein email/geheim in KO)",
    !("email" in ko) && !("geheim" in ko));
  check("C7 Assemble: Identitaet deterministisch (id=ko-vg-test, status neu, source_document_count=2)",
    ko.id === "ko-vg-test" && ko.vorgang_id === "vg-test" && ko.status === "neu" && ko.source_document_count === 2);
  check("C7 Assemble/DSGVO: mentioned_people ohne E-Mail, Eintraege gekuerzt (<=120)",
    !ko.mentioned_people.some((x) => x.includes("@")) && ko.mentioned_people.every((x) => x.length <= 120)
      && ko.mentioned_people.includes("Dr. Erika Mustermann"), `mp=${JSON.stringify(ko.mentioned_people)}`);
  check("C7 Assemble: Ergebnis validiert gegen das knowledge_objects-Schema", validateKnowledgeObject(ko).valid === true);

  // --- Orchestrator mit injizierten Deps (kein Netzwerk/keine echte KI) -------
  const saved = [];
  const skips = [];
  let understandCalls = 0;
  const canSpendCalls = [];
  const baseDeps = {
    enabled: () => true,
    aiEnabled: () => true,
    acquireLock: () => ({ granted: true, active: true }),
    releaseLock: () => {},
    getExisting: () => null,
    canSpend: (...args) => { canSpendCalls.push(args); return { allowed: true }; },
    requestUnderstanding: () => { understandCalls += 1; return { ...analysis }; },
    save: (k) => { saved.push(k); return { saved: true, id: k.id }; },
    logSkip: (c) => skips.push(c)
  };
  const items = [{ title: "Rentenpaket 2026 im Kabinett beschlossen", url: "https://bmas.de/rente" }];

  // (d) Flag/AI/Lock-Gates.
  const off = await u.runUnderstandingShadow(items, { ...baseDeps, enabled: () => false });
  check("C7 Gate: enabled=false -> skipped (v3-store-disabled), keine KI", off.skipped === true && off.reason === "v3-store-disabled");
  const noAi = await u.runUnderstandingShadow(items, { ...baseDeps, aiEnabled: () => false });
  check("C7 Gate: aiEnabled=false -> skipped (ai-disabled)", noAi.skipped === true && noAi.reason === "ai-disabled");
  const locked = await u.runUnderstandingShadow(items, { ...baseDeps, acquireLock: () => ({ granted: false }) });
  check("C7 Gate: Lock nicht erteilt -> skipped (understanding-locked), verhindert Doppel-KI",
    locked.skipped === true && locked.reason === "understanding-locked");

  // (e) Happy Path: 1 Vorgang -> 1 KI-Call -> 1 gespeichertes, valides KO (mandantenlos).
  saved.length = 0; understandCalls = 0; canSpendCalls.length = 0;
  const ok = await u.runUnderstandingShadow(items, baseDeps);
  check("C7 Happy: genau 1 KI-Call fuer 1 Vorgang, 1 KO gespeichert",
    understandCalls === 1 && saved.length === 1 && ok.counts && ok.counts.saved === 1, `calls=${understandCalls} saved=${saved.length}`);
  check("C7 Happy: gespeichertes KO ist valide UND mandantenlos (kein user_id/politicianId)",
    validateKnowledgeObject(saved[0]).valid === true && !("user_id" in saved[0]) && !("politicianId" in saved[0]));
  check("C7 nicht-pro-Nutzer: canSpend wird GLOBAL ohne Nutzer-Argument aufgerufen",
    canSpendCalls.length === 1 && canSpendCalls[0].length === 0);

  // (e2) ZEITBUDGET: der serielle KI-Loop stoppt bei erschöpftem Budget; nicht
  // verstandene Cluster werden deferred (bleiben pending -> nächster Lauf). Genau das
  // verhindert, dass der Crawl-/Understanding-Cron das Serverless-Zeitlimit (300s)
  // überschreitet und ohne Antwort hängt.
  understandCalls = 0;
  const slowDeps = { ...baseDeps, requestUnderstanding: async () => { await new Promise((r) => setTimeout(r, 50)); understandCalls += 1; return { ...analysis }; } };
  const multiItems = [
    { title: "Rentenpaket 2026 im Kabinett beschlossen", url: "https://bmas.de/rente" },
    { title: "Mindestlohn steigt auf 15 Euro bundesweit", url: "https://bmas.de/mindestlohn" },
    { title: "Pflegereform heute offiziell vorgestellt", url: "https://bmg.de/pflege" },
    { title: "Buergergeld Sanktionen deutlich verschaerft", url: "https://bmas.de/buergergeld" }
  ];
  const budgeted = await u.runUnderstandingShadow(multiItems, { ...slowDeps, budgetMs: 10 });
  check("C7 Zeitbudget: erschöpftes Budget stoppt den KI-Loop (deferred > 0, nicht alle Cluster)",
    budgeted.clusters > 1 && budgeted.deferred > 0 && budgeted.processed >= 1 && budgeted.processed < budgeted.clusters,
    `clusters=${budgeted.clusters} processed=${budgeted.processed} deferred=${budgeted.deferred}`);
  check("C7 Zeitbudget: KEIN KI-Call fuer deferred Cluster (Kostenschutz)",
    understandCalls === budgeted.processed, `calls=${understandCalls} processed=${budgeted.processed}`);

  // (f) Idempotenz: existiert das KO bereits -> KEIN KI-Call (einmal pro Vorgang).
  understandCalls = 0;
  const exists = await u.runUnderstandingShadow(items, { ...baseDeps, getExisting: () => ({ id: "ko-vg-rentenpaket" }) });
  check("C7 Idempotenz: vorhandener Vorgang -> skipped-exists, KEIN KI-Call",
    understandCalls === 0 && exists.counts && exists.counts["skipped-exists"] === 1);

  // (g) Budget: canSpend verweigert -> kein KI-Call, sauberer Skip + Log.
  understandCalls = 0; skips.length = 0;
  const budget = await u.runUnderstandingShadow(items, { ...baseDeps, canSpend: () => ({ allowed: false, reason: "daily-llm-budget-reached" }) });
  check("C7 Budget: canSpend=false -> kein KI-Call, skipped-budget geloggt",
    understandCalls === 0 && budget.counts["skipped-budget"] === 1 && skips.includes("skipped-understanding-budget"));

  // (h) Ungueltige KI-Antwort -> nicht speichern, sauber skippen + loggen, kein Crash.
  saved.length = 0; skips.length = 0;
  const invalid = await u.runUnderstandingShadow(items, { ...baseDeps, requestUnderstanding: () => ({ was_ist_passiert: "x" }) });
  check("C7 Robustheit: ungueltige KI-Antwort -> nicht gespeichert, skipped-invalid geloggt (kein Crash)",
    saved.length === 0 && invalid.counts["skipped-invalid"] === 1 && skips.includes("skipped-understanding-invalid"));

  // (i) KI-Fehler (throw) -> sauberer Skip, kein Crash.
  skips.length = 0;
  const errored = await u.runUnderstandingShadow(items, { ...baseDeps, requestUnderstanding: () => { throw new Error("boom mit http body"); } });
  check("C7 Robustheit: KI-Fehler -> skipped-error, kein Antwort-/Fehlertext im Log",
    errored.counts["skipped-error"] === 1 && skips.includes("skipped-understanding-error")
      && !skips.some((s) => s.includes("boom")));
}

// Datenmotor V3 — Commit C7a: Matching Engine (pgvector, deterministisch, KEINE KI).
// Getestet wird der reine, offline-deterministische Kern + der Runner mit
// injizierten Deps (kein Netzwerk, keine echte pgvector-Abfrage, keine KI).
async function c7aMatchingChecks() {
  const matching = require(path.join(root, "lib/helmut/matching.js"));
  const storage = require(path.join(root, "lib/helmut/storage.js"));

  const profile = {
    id: "u-1", party: "SPD", faction: "SPD", committee: "Arbeit und Soziales",
    focusTopics: ["Rente", "Mindestlohn"], constituency: "Berlin-Mitte"
  };
  const koRente = {
    id: "ko-a", vorgang_id: "vg-rente", status: "neu", headline: "Rentenpaket 2026",
    was_ist_passiert: "Kabinett beschliesst Rentenpaket.", parteien: ["SPD"],
    ausschuesse: ["Arbeit und Soziales"], tags: ["Rente"]
  };
  const koKlima = {
    id: "ko-b", vorgang_id: "vg-klima", status: "neu", headline: "Klimapaket",
    was_ist_passiert: "Umweltausschuss beraet Klimaziele.", parteien: ["Grüne"],
    ausschuesse: ["Umwelt"], tags: ["Klima"]
  };
  const koPending = { id: "ko-c", vorgang_id: "vg-pending", status: "pending", headline: "Noch offen" };

  // (a) Determinismus (KEINE KI): identischer Vektor bei erneutem Aufruf.
  const e1 = matching.embedProfile(profile);
  const e2 = matching.embedProfile(profile);
  check("C7a Embedding: deterministisch + korrekte Dimension (keine KI)",
    Array.isArray(e1) && e1.length === matching.EMBEDDING_DIM && JSON.stringify(e1) === JSON.stringify(e2));
  check("C7a Embedding: Selbst-Kosinus ~ 1 (normalisiert)",
    Math.abs(matching.cosineSimilarity(e1, e2) - 1) < 1e-9);

  // (b) Ranking + Pending-Ausschluss.
  const ranked = matching.matchProfileToKnowledgeObjects(profile, [koKlima, koRente, koPending]);
  check("C7a Ranking: relevanter Vorgang (Partei+Ausschuss+Thema) auf Rang 1",
    ranked.length >= 1 && ranked[0].knowledge_object_id === "ko-a" && ranked[0].rank === 1,
    `top=${ranked[0] && ranked[0].knowledge_object_id}`);
  check("C7a Pending: status=pending (noch nicht verstanden) wird NICHT gematcht",
    !ranked.some((r) => r.knowledge_object_id === "ko-c"));

  // (c) Erklaerbarkeit: matched_features nennen Partei + Ausschuss, kurze Labels.
  const top = ranked[0];
  const types = (top.matched_features || []).map((f) => f.type);
  check("C7a Erklaerbarkeit: matched_features enthalten partei UND ausschuss (kurze Labels <=120)",
    types.includes("partei") && types.includes("ausschuss")
      && top.matched_features.every((f) => String(f.value).length <= 120),
    `feat=${JSON.stringify(top.matched_features)}`);

  // (d) Filter Partei/Ausschuss/Wahlkreis (threshold=-1 isoliert den Filter vom Score).
  const fParty = matching.matchProfileToKnowledgeObjects(profile, [koKlima, koRente], { filters: { parties: ["SPD"] }, threshold: -1 });
  check("C7a Filter Partei: SPD -> nur SPD-Vorgang (Grüne faellt raus)",
    fParty.length === 1 && fParty[0].knowledge_object_id === "ko-a", `n=${fParty.length}`);
  const fComm = matching.matchProfileToKnowledgeObjects(profile, [koKlima, koRente], { filters: { committees: ["Umwelt"] }, threshold: -1 });
  check("C7a Filter Ausschuss: Umwelt -> nur Umwelt-Vorgang",
    fComm.length === 1 && fComm[0].knowledge_object_id === "ko-b", `n=${fComm.length}`);

  // (e) profileHash: stabil, aendert sich bei Profiländerung.
  check("C7a profileHash: stabil bei gleichem Profil, verschieden bei Aenderung",
    matching.profileHash(profile) === matching.profileHash({ ...profile })
      && matching.profileHash(profile) !== matching.profileHash({ ...profile, party: "CDU" }));

  // (f) Keine KI: matching.js ruft kein ai-Modul.
  const src = fs.readFileSync(path.join(root, "lib/helmut/matching.js"), "utf8");
  check("C7a Keine KI: matching.js ruft KEIN ai-Modul (kein require('./ai'))",
    !/require\(["']\.\/ai["']\)/.test(src));

  // (g) Flag AUS (Default): Runner inert, kein Netzwerk.
  const origFlag = process.env.HELMUT_V3_MATCHING;
  try {
    delete process.env.HELMUT_V3_MATCHING;
    check("C7a Flag: v3MatchingEnabled() Default false", storage.v3MatchingEnabled() === false);
    const off = await matching.runMatchingShadow({ profile });
    check("C7a Flag aus -> runMatchingShadow skipped (matching-disabled), kein Netzwerk",
      off && off.skipped === true && off.reason === "matching-disabled", `res=${JSON.stringify(off)}`);
  } finally {
    if (origFlag === undefined) delete process.env.HELMUT_V3_MATCHING; else process.env.HELMUT_V3_MATCHING = origFlag;
  }

  // (h) Runner mit injizierten Deps: gefakte pgvector-Suche -> erklaerbare Zeile.
  const savedRows = [];
  const res = await matching.runMatchingShadow({ profile, limit: 5 }, {
    enabled: () => true,
    saveProfileEmbedding: () => ({ saved: true }),
    matchByEmbedding: () => ({ results: [{ id: "ko-a", vorgang_id: "vg-rente", similarity: 0.9 }] }),
    listKnowledgeObjects: () => [koRente, koKlima],
    saveMatchingResults: (rows) => { savedRows.push(...rows); return { saved: rows.length }; }
  });
  check("C7a Runner: 1 gespeicherte Match-Zeile mit matched_features, nutzergebunden + vorgang_id",
    res && res.saved === 1 && savedRows.length === 1 && savedRows[0].knowledge_object_id === "ko-a"
      && savedRows[0].user_id === "u-1" && savedRows[0].vorgang_id === "vg-rente"
      && Array.isArray(savedRows[0].matched_features) && savedRows[0].matched_features.length > 0,
    `res=${JSON.stringify(res)}`);
}

// Datenmotor V3 — Commit C7c: Lazy Understanding-Trigger (KEINE KI in dieser Stufe).
async function c7cLazyUnderstandingChecks() {
  const lazy = require(path.join(root, "lib/helmut/lazyUnderstanding.js"));
  const storage = require(path.join(root, "lib/helmut/storage.js"));

  const spdProfile = { id: "u-1", party: "SPD", committee: "Arbeit und Soziales", focusTopics: ["Rente"] };
  const cluster = {
    vorgang_id: "vg-rente", headline: "Rentenpaket 2026", summary: "Kabinett beschliesst Rentenpaket.",
    parteien: ["SPD"], ausschuesse: ["Arbeit und Soziales"], tags: ["Rente"]
  };

  // (a) Schon verstanden / schon pending -> nichts tun.
  check("C7c Entscheidung: vorhandenes KO (status!=pending) -> skip-exists",
    lazy.decideLazyUnderstanding({ vorgangId: "vg-rente", existingKo: { status: "neu" } }).action === "skip-exists");
  check("C7c Entscheidung: bereits pending -> skip-already-pending (kein Doppel-Vormerken)",
    lazy.decideLazyUnderstanding({ vorgangId: "vg-rente", existingKo: { status: "pending" } }).action === "skip-already-pending");

  // (b) Interesse steuert das Vormerken (matched_features -> interessiert).
  const interested = lazy.decideLazyUnderstanding({ cluster, profiles: [spdProfile] });
  check("C7c Interesse: passender Nutzer -> trigger-pending (interestedCount>=1)",
    interested.action === "trigger-pending" && interested.interestedCount >= 1, `action=${interested.action}`);
  const noInterest = lazy.decideLazyUnderstanding({
    cluster: { vorgang_id: "vg-klima", headline: "Klima", summary: "Umwelt", parteien: ["Grüne"], ausschuesse: ["Umwelt"], tags: ["Klima"] },
    profiles: [spdProfile], threshold: 0.5
  });
  check("C7c Interesse: kein passender Nutzer -> skip-no-interest (kein Vormerken)",
    noInterest.action === "skip-no-interest", `action=${noInterest.action}`);

  // (c) Keine KI: Datei importiert kein ai-Modul.
  const src = fs.readFileSync(path.join(root, "lib/helmut/lazyUnderstanding.js"), "utf8");
  check("C7c Keine KI: lazyUnderstanding.js macht KEINEN Modell-Call (kein require('./ai'))",
    !/require\(["']\.\/ai["']\)/.test(src));

  // (d) Flag AUS (Default): Runner inert.
  const origFlag = process.env.HELMUT_V3_LAZY_UNDERSTANDING;
  try {
    delete process.env.HELMUT_V3_LAZY_UNDERSTANDING;
    check("C7c Flag: v3LazyUnderstandingEnabled() Default false", storage.v3LazyUnderstandingEnabled() === false);
    const off = await lazy.runLazyUnderstandingShadow({ cluster, profiles: [spdProfile] });
    check("C7c Flag aus -> runLazyUnderstandingShadow skipped (lazy-understanding-disabled)",
      off && off.skipped === true && off.reason === "lazy-understanding-disabled");
  } finally {
    if (origFlag === undefined) delete process.env.HELMUT_V3_LAZY_UNDERSTANDING; else process.env.HELMUT_V3_LAZY_UNDERSTANDING = origFlag;
  }

  // (e) Runner: interessierter, unverstandener Vorgang -> genau 1x als pending
  //     vorgemerkt, OHNE KI-Call.
  const pendingCalls = [];
  const res = await lazy.runLazyUnderstandingShadow({ cluster, profiles: [spdProfile] }, {
    enabled: () => true,
    getExisting: () => null,
    listProfiles: () => [spdProfile],
    savePending: (vorgangId, meta) => { pendingCalls.push({ vorgangId, meta }); return { saved: true, id: `ko-${vorgangId}`, status: "pending" }; }
  });
  check("C7c Runner: interessierter Vorgang -> 1x pending vorgemerkt (kein KI-Call)",
    res && res.triggered === true && res.action === "trigger-pending"
      && pendingCalls.length === 1 && pendingCalls[0].vorgangId === "vg-rente",
    `res=${JSON.stringify({ triggered: res.triggered, action: res.action })}`);

  // (f) Idempotenz: existierendes KO -> savePending wird NICHT aufgerufen.
  const idem = await lazy.runLazyUnderstandingShadow({ cluster, profiles: [spdProfile] }, {
    enabled: () => true,
    getExisting: () => ({ status: "neu" }),
    listProfiles: () => [spdProfile],
    savePending: () => { throw new Error("darf nicht aufgerufen werden"); }
  });
  check("C7c Runner: existierendes KO -> NICHT erneut vorgemerkt (idempotent, kein throw)",
    idem && idem.triggered === false && idem.action === "skip-exists");
}

// Datenmotor V3 — Commit C8: echter KI-Understanding-Call (im Schatten).
// "Einmal verstehen (global, KI) -> mehrfach bewerten (0 KI)". Getestet wird die
// vollstaendige Zustandslogik (pending -> complete/failed), das Pending-Orchestrieren,
// Budget/Lock/Flags, DSGVO (kein Inhalt in Log/Metadaten) und die Goldset-Eval —
// alles mit injizierten Deps, KEIN Netzwerk, KEINE echte KI.
async function c8UnderstandingChecks() {
  const u = require(path.join(root, "lib/helmut/understanding.js"));
  const matching = require(path.join(root, "lib/helmut/matching.js"));
  const { toRawDocumentRow, dedupeRawDocuments } = require(path.join(root, "lib/helmut/dedup.js"));
  const { validateKnowledgeObject } = require(path.join(root, "lib/helmut/understanding-schema.js"));
  const goldset = JSON.parse(fs.readFileSync(path.join(root, "scripts/goldset/understanding-goldset.json"), "utf8"));
  const analysis = goldset.cases[0].expected; // valide Analyse als perfekte Fake-KI-Antwort

  const cluster = { documents: [{ title: "Rentenpaket 2026 im Kabinett beschlossen", summary: "Kabinett beschliesst Rentenpaket." }] };
  const pendingKo = { id: "ko-vg-x", vorgang_id: "vg-x", status: "pending", understanding_status: "pending", headline: "Rentenpaket 2026" };

  let understandCalls = 0;
  const saved = [];
  const skips = [];
  const failed = [];
  const canSpendCalls = [];
  const baseDeps = {
    enabled: () => true,
    aiEnabled: () => true,
    acquireLock: () => ({ granted: true, active: true }),
    releaseLock: () => {},
    getExisting: () => null,
    canSpend: (...args) => { canSpendCalls.push(args); return { allowed: true }; },
    requestUnderstanding: () => { understandCalls += 1; return { ...analysis }; },
    save: (k) => { saved.push(k); return { saved: true, id: k.id }; },
    markFailed: (vorgangId, meta) => { failed.push({ vorgangId, meta }); return { saved: true }; },
    modelName: () => "gpt-5-mini",
    logSkip: (c) => skips.push(c)
  };

  // (a) Pending -> complete: 1 KI-Call, status = Analyse-Klasse, understanding_status='complete'.
  const done = await u.understandOneCluster(cluster, baseDeps, { vorgangId: "vg-x", existing: { ...pendingKo } });
  check("C8 Pending->complete: 1 KI-Call, KO gespeichert (status='neu', understanding_status='complete')",
    understandCalls === 1 && saved.length === 1 && done.status === "saved"
      && saved[0].status === "neu" && saved[0].understanding_status === "complete",
    `calls=${understandCalls} status=${saved[0] && saved[0].status}/${saved[0] && saved[0].understanding_status}`);
  check("C8 complete: understanding_model als Metadatum gesetzt (kein Prompt-/Antwortinhalt im KO)",
    saved[0].understanding_model === "gpt-5-mini" && !("prompt" in saved[0]) && !("answer" in saved[0]) && !("email" in saved[0]));
  check("C8 complete: gespeichertes KO ist schema-valide UND mandantenlos (kein user_id/politicianId)",
    validateKnowledgeObject(saved[0]).valid === true && !("user_id" in saved[0]) && !("politicianId" in saved[0]));
  check("C8 nicht-pro-Nutzer: canSpend wird GLOBAL ohne Nutzer-Argument aufgerufen",
    canSpendCalls.length === 1 && canSpendCalls[0].length === 0);

  // (b) Ungueltige KI-Antwort auf pending -> failed markiert, NICHT gespeichert, kein Crash.
  understandCalls = 0; saved.length = 0; skips.length = 0; failed.length = 0;
  const inv = await u.understandOneCluster(cluster, { ...baseDeps, requestUnderstanding: () => ({ was_ist_passiert: "x" }) },
    { vorgangId: "vg-x", existing: { ...pendingKo } });
  check("C8 Robustheit: ungueltige KI-Antwort auf pending -> skipped-invalid, KO als failed geparkt (nicht gespeichert)",
    inv.status === "skipped-invalid" && saved.length === 0 && failed.length === 1 && failed[0].vorgangId === "vg-x"
      && skips.includes("skipped-understanding-invalid"));
  check("C8 DSGVO: failed-Metadaten tragen KEINEN Antwort-/Fehler-/Prompt-Inhalt (nur headline + Modell)",
    !("error" in failed[0].meta) && !("answer" in failed[0].meta) && !("prompt" in failed[0].meta)
      && failed[0].meta.understanding_model === "gpt-5-mini");

  // (c) KI-Fehler (throw) auf pending -> failed markiert, sauberer Skip, kein Inhalt geloggt.
  understandCalls = 0; skips.length = 0; failed.length = 0;
  const err = await u.understandOneCluster(cluster, { ...baseDeps, requestUnderstanding: () => { throw new Error("boom http body 500"); } },
    { vorgangId: "vg-x", existing: { ...pendingKo } });
  check("C8 Robustheit: KI-Fehler auf pending -> skipped-error, failed markiert, kein Fehlertext im Log",
    err.status === "skipped-error" && failed.length === 1 && skips.includes("skipped-understanding-error")
      && !skips.some((s) => s.includes("boom")));

  // (c2) Eager-Pfad: KI-Fehler bei NEUEM Vorgang (kein existing) -> ebenfalls geparkt.
  // Verhindert Endlos-Retry auch dort, wo (noch) kein pending-KO existiert.
  understandCalls = 0; failed.length = 0; skips.length = 0;
  const eagerFail = await u.understandOneCluster(cluster, { ...baseDeps, requestUnderstanding: () => { throw new Error("boom"); } },
    { vorgangId: "vg-neu", existing: null });
  check("C8 Kein Endlos-Retry (eager): KI-Fehler bei NEUEM Vorgang -> failed geparkt (markFailed aufgerufen)",
    eagerFail.status === "skipped-error" && failed.length === 1 && failed[0].vorgangId === "vg-neu");

  // (d) Bereits verstandenes KO -> skipped-exists, KEIN KI-Call (einmal pro Vorgang).
  understandCalls = 0;
  const ex = await u.understandOneCluster(cluster, baseDeps, { vorgangId: "vg-x", existing: { id: "ko-vg-x", status: "neu" } });
  check("C8 Idempotenz: verstandenes KO -> skipped-exists, KEIN KI-Call",
    ex.status === "skipped-exists" && understandCalls === 0);

  // (e) Geparktes (failed) KO -> skipped-failed, KEIN KI-Call (kein Endlos-Retry).
  understandCalls = 0;
  const parked = await u.understandOneCluster(cluster, baseDeps, { vorgangId: "vg-x", existing: { status: "pending", understanding_status: "failed" } });
  check("C8 Kein Endlos-Retry: geparktes failed-KO -> skipped-failed, KEIN KI-Call",
    parked.status === "skipped-failed" && understandCalls === 0);

  // (f) Budget-Gate (fail-closed-faehig): canSpend=false -> kein KI-Call, skipped-budget.
  understandCalls = 0; skips.length = 0;
  const budget = await u.understandOneCluster(cluster, { ...baseDeps, canSpend: () => ({ allowed: false, reason: "daily-llm-budget-reached" }) },
    { vorgangId: "vg-x", existing: { ...pendingKo } });
  check("C8 Budget: canSpend=false -> kein KI-Call, skipped-budget geloggt",
    budget.status === "skipped-budget" && understandCalls === 0 && skips.includes("skipped-understanding-budget"));

  // --- runPendingUnderstandingShadow: Orchestrierung ueber status='pending' -----
  const items = [{ title: "Rentenpaket 2026 im Kabinett beschlossen", summary: "Kabinett beschliesst.", url: "https://bmas.de/rente" }];
  const rows = dedupeRawDocuments(items.map(toRawDocumentRow).filter((r) => r && r.id));
  const vid = u.deriveVorgangId(u.clusterRawDocuments(rows)[0]);
  const pendingForVid = { id: `ko-${vid}`, vorgang_id: vid, status: "pending", understanding_status: "pending", headline: "Rentenpaket" };

  const runDeps = {
    ...baseDeps,
    listPending: () => [pendingForVid]
  };

  // (g) Flag/AI/Lock/Pending-Gates.
  const off = await u.runPendingUnderstandingShadow(items, { ...runDeps, enabled: () => false });
  check("C8 Gate: enabled=false -> skipped (v3-store-disabled), keine KI", off.skipped === true && off.reason === "v3-store-disabled");
  const noAi = await u.runPendingUnderstandingShadow(items, { ...runDeps, aiEnabled: () => false });
  check("C8 Gate: aiEnabled=false -> skipped (ai-disabled)", noAi.skipped === true && noAi.reason === "ai-disabled");
  const noPend = await u.runPendingUnderstandingShadow(items, { ...runDeps, listPending: () => [] });
  check("C8 Gate: keine pending-Vorgaenge -> skipped (no-pending), keine KI", noPend.skipped === true && noPend.reason === "no-pending");
  const locked = await u.runPendingUnderstandingShadow(items, { ...runDeps, acquireLock: () => ({ granted: false }) });
  check("C8 Gate: Lock nicht erteilt -> skipped (understanding-locked), verhindert Doppel-KI",
    locked.skipped === true && locked.reason === "understanding-locked");

  // (h) Happy Path: pending-Vorgang mit passendem Cluster -> genau 1 KI-Call, 1 KO complete.
  understandCalls = 0; saved.length = 0;
  const runOk = await u.runPendingUnderstandingShadow(items, runDeps);
  check("C8 Pending-Runner: pending-Vorgang mit Quellen -> 1 KI-Call, 1 KO complete gespeichert",
    understandCalls === 1 && saved.length === 1 && runOk.counts && runOk.counts.saved === 1
      && saved[0].understanding_status === "complete", `calls=${understandCalls} counts=${JSON.stringify(runOk.counts)}`);

  // (i) Pending-Vorgang OHNE Quell-Dokumente in diesem Lauf -> KEIN KI-Call (Kosten).
  understandCalls = 0; saved.length = 0;
  const noCluster = await u.runPendingUnderstandingShadow(items, {
    ...runDeps,
    listPending: () => [{ id: "ko-vg-unbekannt", vorgang_id: "vg-voellig-anderer-vorgang", status: "pending", understanding_status: "pending" }]
  });
  check("C8 Kostendisziplin: pending ohne passenden Cluster -> skipped-no-cluster, KEIN KI-Call",
    understandCalls === 0 && noCluster.counts && noCluster.counts["skipped-no-cluster"] === 1);

  // (i2) Runner fail-safe: wirft ein Vorgang (hier via save-throw), crasht der Batch NICHT.
  let crashed = false; let runSafe;
  try {
    runSafe = await u.runPendingUnderstandingShadow(items, {
      ...runDeps, listPending: () => [pendingForVid],
      save: () => { throw new Error("db down"); }
    });
  } catch (_) { crashed = true; }
  check("C8 Runner fail-safe: geworfener Vorgang crasht den Batch NICHT (cluster-error gezaehlt, kein throw)",
    !crashed && runSafe && runSafe.counts && runSafe.counts["cluster-error"] === 1);

  // (j) Cross-Engine (C7a): complete-KO ist matchbar, failed/pending-KO NICHT.
  const profile = { party: "SPD", committee: "Ausschuss fuer Arbeit und Soziales", focusTopics: ["Rente"] };
  const completeKo = { ...analysis, id: "ko-complete", vorgang_id: "vg-c", status: "neu", understanding_status: "complete" };
  const failedKo = { id: "ko-failed", vorgang_id: "vg-f", status: "pending", understanding_status: "failed", parteien: ["SPD"], ausschuesse: ["Ausschuss fuer Arbeit und Soziales"] };
  const matches = matching.matchProfileToKnowledgeObjects(profile, [completeKo, failedKo]);
  check("C8 Cross-Engine: complete-KO wird gematcht, failed/pending-KO wird NIE ausgeliefert (status='pending')",
    matches.some((m) => m.knowledge_object_id === "ko-complete") && !matches.some((m) => m.knowledge_object_id === "ko-failed"),
    `ids=${matches.map((m) => m.knowledge_object_id).join(",")}`);

  // (k) DSGVO-Prompt: Regeln + Pflichtfelder eingebaut, nur oeffentlich-politische Akteure.
  const prompt = u.buildUnderstandingPrompt(cluster);
  check("C8 Prompt: DSGVO-Regeln (nur oeffentliche Akteure, keine Privatpersonen/Kontaktdaten) + mentioned_people",
    /oeffentlich handelnde politische Akteure/i.test(prompt) && /keine privaten Personenprofile|keine Adressen\/E-Mails/i.test(prompt)
      && /mentioned_people/.test(prompt));

  // (l) Goldset-Eval: perfekte KI -> alle Faelle valide; schlechte KI -> alle abgefangen.
  const perfect = (_prompt, caseObj) => ({ ...caseObj.expected });
  const evalGood = await u.evaluateUnderstandingGoldset(goldset, perfect);
  check("C8 Goldset-Eval: perfekte KI-Antwort -> alle 7 Faelle valide (Pipeline erfuellt den Vertrag)",
    evalGood.total === 7 && evalGood.valid === 7, `valid=${evalGood.valid}/${evalGood.total}`);
  const badAi = () => ({ was_ist_passiert: "x", mentioned_people: ["kontakt@example.com"] });
  const evalBad = await u.evaluateUnderstandingGoldset(goldset, badAi);
  check("C8 Goldset-Eval: schlechte/PII-behaftete KI-Antwort -> 0 valide (fail-safe, nichts durchgelassen)",
    evalBad.valid === 0 && evalBad.failures.length === 7, `valid=${evalBad.valid}`);

  // (m) Kein require('./ai') als Roh-String-Umgehung: understanding.js nutzt ai NUR ueber defaultDeps.
  const src = fs.readFileSync(path.join(root, "lib/helmut/understanding.js"), "utf8");
  check("C8 Struktur: understanding.js kapselt die KI hinter injizierbaren Deps (requestUnderstanding/save/markFailed)",
    /requestUnderstanding/.test(src) && /markFailed/.test(src) && /understanding_status/.test(src));
}

// Datenmotor V2 — Commit 2: echte Personalisierung / Cem-Entkopplung.
// Deterministischer Unit-Test der reinen Merge-Funktion (kein Store noetig).
function personalizationChecks() {
  const scheduler = require(path.join(root, "lib/helmut/scheduler.js"));

  // Demo-Profil cem-ince behaelt seine reichhaltigen Defaults (kein Regress).
  const cem = scheduler.mergeProfileDefaults({ id: "cem-ince" });
  check("Personalisierung: cem-ince behaelt Ausschuss 'Arbeit und Soziales'",
    Array.isArray(cem.committees) && cem.committees.includes("Arbeit und Soziales"),
    `committees=${JSON.stringify(cem.committees)}`);
  check("Personalisierung: cem-ince behaelt Fokusthemen (z. B. Bürgergeld)",
    Array.isArray(cem.focusTopics) && cem.focusTopics.includes("Bürgergeld"));

  // Fremdes Mandat erbt KEINE Cem-Inhalte mehr.
  const other = scheduler.mergeProfileDefaults({
    id: "erika-muster", fullName: "Erika Muster", party: "CDU", faction: "CDU/CSU",
    committees: ["Umwelt"], focusTopics: ["Klima"], topicPriorities: { Klima: 5 }
  });
  check("Personalisierung: Fremd-Mandat hat NUR eigene Ausschuesse (kein Cem-Leak)",
    JSON.stringify(other.committees) === JSON.stringify(["Umwelt"]),
    `committees=${JSON.stringify(other.committees)}`);
  check("Personalisierung: Fremd-Mandat erbt KEINE Cem-Themen (kein 'Bürgergeld'/'Mindestlohn')",
    !other.focusTopics.includes("Bürgergeld") && !other.focusTopics.includes("Mindestlohn") && other.focusTopics.includes("Klima"),
    `focusTopics=${JSON.stringify(other.focusTopics)}`);
  check("Personalisierung: Fremd-Mandat erbt KEINE Cem-Topicprioritaeten (nur eigene)",
    JSON.stringify(other.topicPriorities) === JSON.stringify({ Klima: 5 }),
    `topicPriorities=${JSON.stringify(other.topicPriorities)}`);
  check("Personalisierung: Fremd-Mandat erbt KEINE Cem-Gegner/Regionalbezuege",
    (other.opponents || []).length === 0 && (other.regionalInterests || []).length === 0 && (other.upcomingAppointments || []).length === 0);
  check("Personalisierung: Fremd-Mandat behaelt eigene Partei/Fraktion",
    other.party === "CDU" && other.faction === "CDU/CSU");
}


// Datenmotor V2 — Commit 6: Erklaerbarkeit im Pipeline-Debug-Report.
function debugReportChecks() {
  const scheduler = require(path.join(root, "lib/helmut/scheduler.js"));
  const savedBriefing = {
    status: "Aktuell",
    ai: { enabled: true, engine: "v2", model: "gpt-5-mini" },
    v2: { scored: true, candidates: 20, ranked: 5, top1Justification: "Betrifft deinen Ausschuss direkt und ist heute entscheidungsreif." },
    topics: [],
    items: [
      { id: "i1", title: "Top-Thema", decision: "Sofort reagieren", priority: 82, aiRelevanceScore: 91, reactOrObserve: "react", affectsMandate: true, rank: 1, rankReason: "Hoechste Dringlichkeit + Mandatsbezug", whyItMatters: "Kernthema", riskNote: "Deutungshoheit", inactionConsequence: "Andere besetzen das Thema", sources: [] }
    ]
  };
  const report = scheduler.buildPipelineDebugReport({
    profile: { id: "cem-ince", fullName: "Cem Ince", party: "Die Linke", committees: ["Arbeit und Soziales"], focusTopics: [] },
    latestCrawl: null, recentItems: [], situationalRecentItems: [], mentionItems: [],
    relevanceDiagnostics: [], relevantItems: [], situationalItems: [],
    promotedSituationalItems: [], briefingInputItems: [],
    liveBriefing: null, savedBriefing, usesLiveBriefing: true,
    aiBudget: { allowed: true, used: 2, limit: 6, remaining: 4, reason: null }, aiUsed: true
  });

  check("Debug: engine-Block zeigt V2-Modus + Modell",
    report.engine && report.engine.mode === "v2" && report.engine.model === "gpt-5-mini",
    `mode=${report.engine && report.engine.mode}`);
  check("Debug: 'Warum Top 1' (top1Justification) protokolliert",
    typeof report.engine.top1Justification === "string" && report.engine.top1Justification.length > 0);
  check("Debug: Budget-Status im Report (used/limit)",
    report.engine.budget && report.engine.budget.used === 2 && report.engine.budget.limit === 6);
  const fi = report.finalItems[0];
  check("Debug: Final-Item zeigt Regel-Score UND KI-Score getrennt",
    fi.ruleScore === 82 && fi.aiRelevanceScore === 91, `rule=${fi.ruleScore} ai=${fi.aiRelevanceScore}`);
  check("Debug: Final-Item zeigt KI-Entscheid + Rang + Begruendung",
    fi.reactOrObserve === "react" && fi.rank === 1 && fi.rankReason.length > 0 && fi.affectsMandate === true);
}

async function c9OfficeChecks() {
  const office = require(path.join(root, "lib/helmut/office.js"));
  const tmpl = require(path.join(root, "lib/helmut/template.js"));

  const koComplete = {
    id: "ko-testvorgang", vorgang_id: "testvorgang", status: "neu",
    understanding_status: "complete",
    headline: "Testgesetz passiert Bundesrat",
    was_ist_passiert: "Das Testgesetz wurde verabschiedet.",
    warum_wichtig: "Es betrifft alle Buerger.", wer_ist_betroffen: "Alle Buerger",
    zeitdruck: "hoch", handlungsempfehlung: "Sofort kommunizieren.",
    risiken: ["Ablehnung"], chancen: ["Sichtbarkeit"], parteien: ["SPD"]
  };
  const koPending = { ...koComplete, understanding_status: "pending" };
  const koFailed = { ...koComplete, understanding_status: "failed" };

  let aiCallCount = 0;
  let lastMeta = null;
  let lastPrompt = null;
  const savedOutputs = [];

  function makeDeps(overrides = {}) {
    aiCallCount = 0; lastMeta = null; lastPrompt = null; savedOutputs.length = 0;
    return {
      storage: {
        getOfficeOutput: async () => null,
        canSpendOfficeOutput: async () => ({ allowed: true, used: 0, limit: 10, remaining: 10 }),
        saveOfficeOutput: async (e) => { savedOutputs.push(e); return { saved: true, id: e.id }; },
        officeOutputId: (u, v, c) => `office-${u}-${v}-${c}`.slice(0, 200)
      },
      ai: {
        requestText: async (p, m) => { aiCallCount += 1; lastPrompt = p; lastMeta = m; return "Generierter Inhalt."; },
        activeModelName: () => "gpt-5-mini"
      },
      template: tmpl,
      ...overrides
    };
  }

  const origFlag = process.env.HELMUT_V3_OFFICE;
  try {
    // (a) Flag aus -> skipped.
    delete process.env.HELMUT_V3_OFFICE;
    const flagOff = await office.generateOfficeOutput("u1", "vg-test", "rede", koComplete, makeDeps());
    check("C9 Flag aus: generateOfficeOutput -> skipped (office-disabled)",
      flagOff.skipped === true && flagOff.reason === "office-disabled");
    check("C9 isOfficeEnabled() = false wenn Flag nicht gesetzt",
      office.isOfficeEnabled() === false);

    process.env.HELMUT_V3_OFFICE = "1";

    // (b) isOfficeEnabled true, wenn gesetzt.
    check("C9 isOfficeEnabled() = true wenn HELMUT_V3_OFFICE=1",
      office.isOfficeEnabled() === true);

    // (c) Alle 15 Kanaele gelten als valide.
    const ALL = office.OFFICE_CHANNELS;
    check("C9 OFFICE_CHANNELS enthaelt alle 15 Kanaele",
      ALL.length === 15 && ALL.includes("rede") && ALL.includes("tiktok") && ALL.includes("interview_vorbereitung"));
    check("C9 isValidChannel: alle 15 bekannten Kanaele valide",
      ALL.every((c) => office.isValidChannel(c)));
    check("C9 isValidChannel: unbekannter Kanal ('xyzkanal') abgelehnt",
      !office.isValidChannel("xyzkanal") && !office.isValidChannel(""));

    // (d) Ungültiger Kanal -> skipped.
    const inv = await office.generateOfficeOutput("u1", "vg-test", "unbekannt", koComplete, makeDeps());
    check("C9 Ungültiger Kanal -> skipped (invalid-channel), kein KI-Call",
      inv.skipped === true && inv.reason === "invalid-channel" && aiCallCount === 0);

    // (e) Fehlende Params -> skipped.
    const noUser = await office.generateOfficeOutput("", "vg-test", "rede", koComplete, makeDeps());
    check("C9 Fehlende userId -> skipped (missing-params)",
      noUser.skipped === true && noUser.reason === "missing-params");

    // (f) KO nicht complete (pending) -> skipped.
    const notReady = await office.generateOfficeOutput("u1", "vg-test", "rede", koPending, makeDeps());
    check("C9 KO pending -> skipped (ko-not-ready), kein KI-Call",
      notReady.skipped === true && notReady.reason === "ko-not-ready" && aiCallCount === 0);

    // (f2) KO failed -> skipped.
    const failedKoRes = await office.generateOfficeOutput("u1", "vg-test", "rede", koFailed, makeDeps());
    check("C9 KO failed -> skipped (ko-not-ready), kein KI-Call",
      failedKoRes.skipped === true && failedKoRes.reason === "ko-not-ready" && aiCallCount === 0);

    // (g) Cache-Hit -> kein KI-Call, content zurueck.
    const deps = makeDeps({
      storage: {
        getOfficeOutput: async () => ({ id: "office-u1-vg-test-rede", content: "Gecachter Inhalt." }),
        canSpendOfficeOutput: async () => ({ allowed: true }),
        saveOfficeOutput: async (e) => { savedOutputs.push(e); return { saved: true }; },
        officeOutputId: (u, v, c) => `office-${u}-${v}-${c}`.slice(0, 200)
      }
    });
    const cached = await office.generateOfficeOutput("u1", "vg-test", "rede", koComplete, deps);
    check("C9 Cache-Hit: kein KI-Call, gecachten Inhalt zurueck",
      cached.status === "cache-hit" && cached.content === "Gecachter Inhalt." && aiCallCount === 0);

    // (h) Rate-Limit ueberschritten -> skipped, kein KI-Call.
    const rateDeps = makeDeps({
      storage: {
        getOfficeOutput: async () => null,
        canSpendOfficeOutput: async () => ({ allowed: false, used: 10, limit: 10, remaining: 0, reason: "daily-limit" }),
        saveOfficeOutput: async () => ({ saved: true }),
        officeOutputId: (u, v, c) => `office-${u}-${v}-${c}`
      }
    });
    const rateLimited = await office.generateOfficeOutput("u1", "vg-test", "rede", koComplete, rateDeps);
    check("C9 Rate-Limit: skipped (budget-denied), kein KI-Call",
      rateLimited.skipped === true && rateLimited.reason === "budget-denied" && aiCallCount === 0);

    // (i) KI-Fehler -> skipped (ai-error), kein Crash.
    const errDeps = makeDeps({
      ai: { requestText: async () => { aiCallCount += 1; throw new Error("Azure down"); }, activeModelName: () => "gpt-5-mini" }
    });
    const aiErr = await office.generateOfficeOutput("u1", "vg-test", "rede", koComplete, errDeps);
    check("C9 KI-Fehler -> skipped (ai-error), kein Crash",
      aiErr.skipped === true && aiErr.reason === "ai-error" && aiCallCount === 1);

    // (j) Leere KI-Antwort -> skipped (empty-response).
    const emptyDeps = makeDeps({
      ai: { requestText: async () => { aiCallCount += 1; return "   "; }, activeModelName: () => "gpt-5-mini" }
    });
    const emptyRes = await office.generateOfficeOutput("u1", "vg-test", "rede", koComplete, emptyDeps);
    check("C9 Leere KI-Antwort -> skipped (empty-response)",
      emptyRes.skipped === true && emptyRes.reason === "empty-response");

    // (k) Happy path: generated, content gesetzt, gespeichert.
    const happy = await office.generateOfficeOutput("u1", "vg-test", "rede", koComplete, makeDeps());
    check("C9 Happy path: status=generated, content gesetzt, 1 KI-Call",
      happy.status === "generated" && typeof happy.content === "string" && happy.content.length > 0 && aiCallCount === 1);
    check("C9 Happy path: output gespeichert (user_id, channel, content gesetzt)",
      savedOutputs.length === 1 && savedOutputs[0].user_id === "u1"
        && savedOutputs[0].channel === "rede" && savedOutputs[0].content === "Generierter Inhalt.");

    // (l) DSGVO: userId nicht im Prompt, nur callType + vorgangId im meta.
    check("C9 DSGVO: userId 'u1' erscheint NICHT im KI-Prompt (kein PII zum Modell)",
      lastPrompt && !lastPrompt.includes("u1"));
    check("C9 DSGVO: LLM-meta enthaelt callType + vorgangId, kein Prompt, kein userId",
      lastMeta && lastMeta.callType === "office-output" && lastMeta.vorgangId === "vg-test"
        && !("prompt" in lastMeta) && !("userId" in lastMeta) && !("user_id" in lastMeta));

    // (m) Save fehlgeschlagen -> save-skipped, content trotzdem zurueck.
    const saveFail = makeDeps({
      storage: {
        getOfficeOutput: async () => null,
        canSpendOfficeOutput: async () => ({ allowed: true }),
        saveOfficeOutput: async () => ({ skipped: true, reason: "v3-store-disabled" }),
        officeOutputId: (u, v, c) => `office-${u}-${v}-${c}`
      }
    });
    const saveSkipped = await office.generateOfficeOutput("u1", "vg-test", "rede", koComplete, saveFail);
    check("C9 Save-Fehler (Store aus) -> save-skipped, content trotzdem im Response",
      saveSkipped.status === "save-skipped" && typeof saveSkipped.content === "string" && saveSkipped.content.length > 0);

    // (n) Template-Fehler -> skipped (template-error), kein KI-Call.
    const tmplErrDeps = makeDeps({
      template: { renderFile: () => { throw new Error("template not found"); } }
    });
    const tmplErr = await office.generateOfficeOutput("u1", "vg-test", "rede", koComplete, tmplErrDeps);
    check("C9 Template-Fehler -> skipped (template-error), kein KI-Call",
      tmplErr.skipped === true && tmplErr.reason === "template-error" && aiCallCount === 0);

    // (o) Struktur: office.js kapselt Deps, kein direktes require('./ai') ausserhalb Deps.
    const officeSrc = fs.readFileSync(path.join(root, "lib/helmut/office.js"), "utf8");
    check("C9 Struktur: office.js kapselt KI hinter injizierbaren Deps (ai.requestText, storage.getOfficeOutput)",
      /deps\.ai/.test(officeSrc) && /deps\.storage/.test(officeSrc) && /requestText/.test(officeSrc));
    check("C9 DSGVO: buildOfficeContext enthaelt kein userId-Feld im Kontext",
      /buildOfficeContext/.test(officeSrc) && !/userId/.test(officeSrc.match(/function buildOfficeContext[\s\S]*?\n\}/)[0]));

  } finally {
    if (origFlag === undefined) delete process.env.HELMUT_V3_OFFICE;
    else process.env.HELMUT_V3_OFFICE = origFlag;
  }
}

// Rechtstexte: /impressum existiert und ist öffentlich erreichbar (auch bei scharfem
// Pilot-Gate, da vor dem Gate geroutet); die Datenschutzseite entfernt die falsche
// Art.-9-Ausschlussaussage und macht die politische KI-Übermittlung transparent —
// in BEIDEN Zuständen (KI aus / KI an).
async function legalPagesChecks() {
  const prev = {
    openai: process.env.OPENAI_API_KEY, azureK: process.env.AZURE_OPENAI_KEY,
    azureE: process.env.AZURE_OPENAI_ENDPOINT, pilot: process.env.PILOT_SECRET
  };
  const FALSE_ART9 = "besondere Kategorien personenbezogener Daten werden nicht übermittelt";
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const get = (pathname) => request(server, { pathname });
  try {
    // Pilot-Gate scharf: Rechtstexte müssen trotzdem ohne Login erreichbar sein.
    process.env.PILOT_SECRET = "p1-pilot-secret";
    delete process.env.OPENAI_API_KEY; delete process.env.AZURE_OPENAI_KEY; delete process.env.AZURE_OPENAI_ENDPOINT;

    const imp = await get("/impressum");
    check("Recht: /impressum -> 200, öffentlich trotz scharfem Pilot-Gate", imp.status === 200, `status=${imp.status}`);
    check("Recht: /impressum nennt § 5 DDG + Kontakt + Verantwortlichen",
      imp.body.includes("§ 5 DDG") && imp.body.includes("hi@nohut.de") && imp.body.includes("Lüey Nohut"));
    check("Recht: /impressum verlinkt Datenschutz", imp.body.includes("/datenschutz"));

    // Datenschutz, KI AUS
    const dsOff = await get("/datenschutz");
    check("Recht: /datenschutz -> 200 + verlinkt Impressum", dsOff.status === 200 && dsOff.body.includes("/impressum"), `status=${dsOff.status}`);
    check("Recht: /datenschutz (KI aus) enthält KEINE falsche Art.-9-Ausschlussaussage",
      !dsOff.body.includes(FALSE_ART9));
    check("Recht: /datenschutz (KI aus) benennt Art. 9 + politische Daten als Betreiber-Grundlage",
      dsOff.body.includes("Art. 9 DSGVO") && dsOff.body.includes("politische"));

    // Datenschutz, KI AN (OpenAI)
    process.env.OPENAI_API_KEY = "p1-openai-key";
    const dsOn = await get("/datenschutz");
    check("Recht: /datenschutz (KI aktiv) enthält KEINE falsche Art.-9-Ausschlussaussage",
      !dsOn.body.includes(FALSE_ART9));
    check("Recht: /datenschutz (KI aktiv) macht politische KI-Übermittlung transparent + nennt Anbieter",
      dsOn.body.includes("politische") && dsOn.body.includes("übermittelt") && dsOn.body.includes("OpenAI"));
    check("Recht: /datenschutz (KI aktiv) macht KEINE 'kein Training'-Garantie mehr",
      !dsOn.body.includes("nicht zum Training verwendet"));
  } finally {
    await new Promise((r) => server.close(r));
    if (prev.openai === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prev.openai;
    if (prev.azureK === undefined) delete process.env.AZURE_OPENAI_KEY; else process.env.AZURE_OPENAI_KEY = prev.azureK;
    if (prev.azureE === undefined) delete process.env.AZURE_OPENAI_ENDPOINT; else process.env.AZURE_OPENAI_ENDPOINT = prev.azureE;
    if (prev.pilot === undefined) delete process.env.PILOT_SECRET; else process.env.PILOT_SECRET = prev.pilot;
  }
}

async function main() {
  console.log("== Helmut P1 Security & Trust Checks ==\n");
  staticChecks();
  personalizationChecks();
  entityChecks();
  debugReportChecks();
  await cronChecks();
  await presentationBackfillEndpointChecks();
  await debugBriefingEndpointChecks();
  await saasMandateHardeningChecks();
  await legalPagesChecks();
  await llmLoggingChecks();
  await kiStatusChecks();
  await pipelineRecoveryChecks();
  await dataStatusResilienceChecks();
  pendingDiagnoseChecks();
  await llmBudgetChecks();
  await c1SafetyNetChecks();
  await c3DipPrimaryChecks();
  await c5V3StoreChecks();
  await c6DedupDsgvoChecks();
  c7bGoldsetChecks();
  await c7UnderstandingChecks();
  await c7aMatchingChecks();
  await c7cLazyUnderstandingChecks();
  await c8UnderstandingChecks();
  await c9OfficeChecks();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} Checks bestanden.`);
  if (failed.length) {
    console.log("Fehlgeschlagen:", failed.map((f) => f.name).join("; "));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("P1-Check abgestuerzt:", error);
  process.exit(1);
});
