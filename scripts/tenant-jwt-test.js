"use strict";

// Tenant-JWT-Tests (P0-2-Folgearbeit "Sprint 3", audit/fix-plan.md).
// Unit + Integration + Cross-Tenant, vollstaendig offline (fetch gemockt,
// keine echte Netzwerkverbindung, keine echten Secrets — nur Test-Fixtures).
//
// Deckt ab: JWT-Signierung/-Verifikation (HS256, Node-crypto, kein Package),
// die tenantJwtModeEnabled()-Gate-Logik, die tenantRequest()-Transportwahl
// (service_role vs. authenticated+JWT) und Cross-Tenant-Isolation auf
// Transport-Ebene (zwei Mandanten erhalten nie denselben/den falschen Claim).

const TEST_SECRET = "test-only-secret-not-a-real-supabase-jwt-secret";
const TEST_ANON_KEY = "test-only-anon-key";
const TEST_SERVICE_ROLE_KEY = "test-only-service-role-key";

// Env VOR dem ersten require() von storage.js setzen ist nicht noetig, da alle
// betroffenen Funktionen die ENV-Variablen bei jedem Aufruf frisch lesen
// (kein Modul-Level-Caching der Secrets) — verifiziert per Code-Lesung.
process.env.SUPABASE_URL = "https://test.supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = TEST_SERVICE_ROLE_KEY;

const storage = require("../lib/helmut/storage");

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

function decodePayload(jwt) {
  const parts = String(jwt).split(".");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

// ── Fetch-Mock: faengt genau die Request-Header ab, ohne Netzwerk ───────────
let capturedRequests = [];
const realFetch = global.fetch;
function installFetchMock() {
  capturedRequests = [];
  global.fetch = async (url, opts) => {
    capturedRequests.push({ url, headers: opts && opts.headers });
    return { ok: true, status: 200, text: async () => "[]" };
  };
}
function restoreFetch() {
  global.fetch = realFetch;
}

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
}

(async () => {
  console.log("== 1) tenantJwtModeEnabled() — Gate-Logik ==");
  await withEnv({ HELMUT_TENANT_JWT_MODE: undefined }, () => {
    check("Flag unset -> false (Produktions-/Test-Default)", storage.tenantJwtModeEnabled() === false);
  });
  await withEnv({ HELMUT_TENANT_JWT_MODE: "1", SUPABASE_JWT_SECRET: undefined, SUPABASE_ANON_KEY: TEST_ANON_KEY }, () => {
    check("Flag=1, JWT_SECRET fehlt -> false", storage.tenantJwtModeEnabled() === false);
  });
  await withEnv({ HELMUT_TENANT_JWT_MODE: "1", SUPABASE_JWT_SECRET: TEST_SECRET, SUPABASE_ANON_KEY: undefined }, () => {
    check("Flag=1, ANON_KEY fehlt -> false", storage.tenantJwtModeEnabled() === false);
  });
  await withEnv({ HELMUT_TENANT_JWT_MODE: "1", SUPABASE_JWT_SECRET: TEST_SECRET, SUPABASE_ANON_KEY: TEST_ANON_KEY }, () => {
    check("Flag=1 + beide Secrets -> true", storage.tenantJwtModeEnabled() === true);
  });
  await withEnv({ HELMUT_TENANT_JWT_MODE: "0", SUPABASE_JWT_SECRET: TEST_SECRET, SUPABASE_ANON_KEY: TEST_ANON_KEY }, () => {
    check("Flag=0 trotz Secrets -> false", storage.tenantJwtModeEnabled() === false);
  });

  console.log("== 2) signTenantJWT — Unit ==");
  await withEnv({ SUPABASE_JWT_SECRET: undefined }, () => {
    check("ohne Secret -> null", storage.signTenantJWT("mdb-a") === null);
  });
  await withEnv({ SUPABASE_JWT_SECRET: TEST_SECRET }, () => {
    check("ohne tenantId -> null", storage.signTenantJWT(null) === null);
    check("ohne tenantId (undefined) -> null", storage.signTenantJWT(undefined) === null);
    const jwt = storage.signTenantJWT("mdb-a");
    check("liefert 3-Teile-Token", typeof jwt === "string" && jwt.split(".").length === 3);
    const payload = decodePayload(jwt);
    check("payload.role === 'authenticated'", payload.role === "authenticated");
    check("payload.user_id === 'mdb-a'", payload.user_id === "mdb-a");
    check("payload.iss === 'helmut-app'", payload.iss === "helmut-app");
    check("payload.exp - payload.iat === 60 (Default-TTL)", payload.exp - payload.iat === 60);
    const jwtCustomTtl = storage.signTenantJWT("mdb-a", { ttlSeconds: 5 });
    const payloadCustomTtl = decodePayload(jwtCustomTtl);
    check("custom ttlSeconds wird uebernommen", payloadCustomTtl.exp - payloadCustomTtl.iat === 5);
  });

  console.log("== 3) Cross-Tenant: unterschiedliche Mandanten -> unterschiedliche Claims + Signaturen ==");
  await withEnv({ SUPABASE_JWT_SECRET: TEST_SECRET }, () => {
    const jwtA = storage.signTenantJWT("mdb-a");
    const jwtB = storage.signTenantJWT("mdb-b");
    check("A und B erhalten unterschiedliche Tokens", jwtA !== jwtB);
    check("A-Claim user_id === 'mdb-a'", decodePayload(jwtA).user_id === "mdb-a");
    check("B-Claim user_id === 'mdb-b'", decodePayload(jwtB).user_id === "mdb-b");
    const sigA = jwtA.split(".")[2];
    const sigB = jwtB.split(".")[2];
    check("A und B haben unterschiedliche Signaturen", sigA !== sigB);
  });

  console.log("== 4) verifyTenantJWT — Rundreise + Manipulationserkennung ==");
  await withEnv({ SUPABASE_JWT_SECRET: TEST_SECRET }, () => {
    const jwt = storage.signTenantJWT("mdb-a");
    const verified = storage.verifyTenantJWT(jwt);
    check("gueltiges Token -> valid:true", verified.valid === true);
    check("verifiziertes payload.user_id === 'mdb-a'", verified.payload && verified.payload.user_id === "mdb-a");

    const wrongSecret = storage.verifyTenantJWT(jwt, "ein-komplett-anderes-secret");
    check("falsches Secret -> valid:false, bad-signature", wrongSecret.valid === false && wrongSecret.reason === "bad-signature");

    const parts = jwt.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ ...decodePayload(jwt), user_id: "mdb-b" })).toString("base64url");
    const tampered = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    const tamperedResult = storage.verifyTenantJWT(tampered);
    check("manipulierter Payload (user_id getauscht) -> valid:false", tamperedResult.valid === false && tamperedResult.reason === "bad-signature");

    const malformed = storage.verifyTenantJWT("nicht.genug-teile");
    check("malformed Token -> valid:false, malformed", malformed.valid === false && malformed.reason === "malformed");

    const expired = storage.signTenantJWT("mdb-a", { ttlSeconds: -10 });
    const expiredResult = storage.verifyTenantJWT(expired);
    check("abgelaufenes Token -> valid:false, expired", expiredResult.valid === false && expiredResult.reason === "expired");
  });
  await withEnv({ SUPABASE_JWT_SECRET: undefined }, () => {
    const noSecretResult = storage.verifyTenantJWT("irgendein.token.hier", "");
    check("verifyTenantJWT ohne jegliches Secret (env+override leer) -> valid:false, missing-secret", noSecretResult.valid === false && noSecretResult.reason === "missing-secret");
  });

  console.log("== 5) tenantRequest — Transportwahl (Integration, fetch gemockt) ==");
  installFetchMock();
  await withEnv({ HELMUT_TENANT_JWT_MODE: undefined }, async () => {
    await storage.tenantRequest("/rest/v1/decisions?select=*", "mdb-a");
    const req = capturedRequests[capturedRequests.length - 1];
    check("Modus AUS -> service_role-Header (kein JWT)", req.headers.Authorization === `Bearer ${TEST_SERVICE_ROLE_KEY}`);
    check("Modus AUS -> apikey === service_role_key", req.headers.apikey === TEST_SERVICE_ROLE_KEY);
  });

  await withEnv({ HELMUT_TENANT_JWT_MODE: "1", SUPABASE_JWT_SECRET: TEST_SECRET, SUPABASE_ANON_KEY: TEST_ANON_KEY }, async () => {
    await storage.tenantRequest("/rest/v1/decisions?select=*", "mdb-a");
    const req = capturedRequests[capturedRequests.length - 1];
    check("Modus AN + tenantId -> Authorization ist ein JWT (3 Teile)", /^Bearer [^.]+\.[^.]+\.[^.]+$/.test(req.headers.Authorization));
    check("Modus AN + tenantId -> apikey === ANON_KEY (NICHT service_role)", req.headers.apikey === TEST_ANON_KEY);
    const token = req.headers.Authorization.replace("Bearer ", "");
    const decoded = decodePayload(token);
    check("Modus AN -> Claim user_id stimmt mit angefragtem Tenant ueberein", decoded.user_id === "mdb-a");
    check("Modus AN -> Claim role === 'authenticated'", decoded.role === "authenticated");
  });

  await withEnv({ HELMUT_TENANT_JWT_MODE: "1", SUPABASE_JWT_SECRET: TEST_SECRET, SUPABASE_ANON_KEY: TEST_ANON_KEY }, async () => {
    await storage.tenantRequest("/rest/v1/decisions?select=*", undefined);
    const req = capturedRequests[capturedRequests.length - 1];
    check("Modus AN, aber KEIN tenantId -> Fallback auf service_role", req.headers.Authorization === `Bearer ${TEST_SERVICE_ROLE_KEY}`);
  });

  await withEnv({ HELMUT_TENANT_JWT_MODE: "1", SUPABASE_JWT_SECRET: undefined, SUPABASE_ANON_KEY: TEST_ANON_KEY }, async () => {
    await storage.tenantRequest("/rest/v1/decisions?select=*", "mdb-a");
    const req = capturedRequests[capturedRequests.length - 1];
    check("Modus AN, aber Secret fehlt -> Fallback auf service_role (fail-safe)", req.headers.Authorization === `Bearer ${TEST_SERVICE_ROLE_KEY}`);
  });

  console.log("== 6) Cross-Tenant auf Transport-Ebene: kein State-Leck zwischen aufeinanderfolgenden Requests ==");
  await withEnv({ HELMUT_TENANT_JWT_MODE: "1", SUPABASE_JWT_SECRET: TEST_SECRET, SUPABASE_ANON_KEY: TEST_ANON_KEY }, async () => {
    capturedRequests = [];
    await storage.tenantRequest("/rest/v1/decisions?select=*", "mdb-a");
    await storage.tenantRequest("/rest/v1/decisions?select=*", "mdb-b");
    await storage.tenantRequest("/rest/v1/decisions?select=*", "mdb-a");
    const [reqA1, reqB, reqA2] = capturedRequests;
    const claimA1 = decodePayload(reqA1.headers.Authorization.replace("Bearer ", ""));
    const claimB = decodePayload(reqB.headers.Authorization.replace("Bearer ", ""));
    const claimA2 = decodePayload(reqA2.headers.Authorization.replace("Bearer ", ""));
    check("1. Call (A) -> Claim mdb-a", claimA1.user_id === "mdb-a");
    check("2. Call (B) -> Claim mdb-b (kein Rest von A)", claimB.user_id === "mdb-b");
    check("3. Call (A) -> wieder Claim mdb-a (kein Rest von B)", claimA2.user_id === "mdb-a");
  });
  restoreFetch();

  console.log("== 7) supabaseAuthenticatedRequest — faellt fail-loud, nicht fail-silent ==");
  await withEnv({ SUPABASE_JWT_SECRET: undefined }, async () => {
    let threw = false;
    try { await storage.supabaseAuthenticatedRequest("/rest/v1/decisions", "mdb-a"); }
    catch (e) { threw = /JWT konnte nicht signiert werden/.test(e.message); }
    check("ohne Secret wirft supabaseAuthenticatedRequest (statt stillem Fallback)", threw);
  });

  console.log("");
  const total = pass + fail;
  if (fail === 0) {
    console.log(`${pass}/${total} Tenant-JWT-Assertionen erfolgreich.`);
    process.exit(0);
  } else {
    console.log(`${fail} von ${total} Tenant-JWT-Assertionen FEHLGESCHLAGEN.`);
    process.exit(1);
  }
})();
