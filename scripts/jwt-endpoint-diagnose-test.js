"use strict";

// Test fuer storage.diagnoseTenantJwt() — die Admin-Endpoint-Diagnose fuer
// PGRST301. Prueft: korrekter secretMatchesLegacy true/false, null bei
// fehlenden Werten, jwtAlgorithm=HS256, und — sicherheitskritisch — dass NIE
// ein Secret-Wert im Rueckgabeobjekt auftaucht.

const crypto = require("crypto");
const storage = require("../lib/helmut/storage");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Baut einen anon-Key so, wie Supabase ihn signiert: HS256 mit dem Legacy Secret.
function forgeAnonKey(legacySecret) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({ iss: "supabase", ref: "ddckuvvpcytqbyfmbvie", role: "anon", iat: 1781912419, exp: 2097488419 });
  const sig = crypto.createHmac("sha256", legacySecret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${sig}`;
}

const LEGACY = "the-active-legacy-jwt-secret";
const OLD = "ein-alter-oder-falscher-signing-key";
const anonKey = forgeAnonKey(LEGACY);

function withEnv(env, fn) {
  const keys = ["SUPABASE_JWT_SECRET", "SUPABASE_ANON_KEY"];
  const prev = {};
  for (const k of keys) prev[k] = process.env[k];
  for (const k of keys) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  try { return fn(); }
  finally { for (const k of keys) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } }
}

console.log("== 1) Secret == aktives Legacy Secret -> secretMatchesLegacy true ==");
withEnv({ SUPABASE_JWT_SECRET: LEGACY, SUPABASE_ANON_KEY: anonKey }, () => {
  const d = storage.diagnoseTenantJwt();
  check("secretMatchesLegacy === true", d.secretMatchesLegacy === true);
  check("jwtAlgorithm === 'HS256'", d.jwtAlgorithm === "HS256");
});

console.log("== 2) Secret != aktives Legacy Secret -> secretMatchesLegacy false ==");
withEnv({ SUPABASE_JWT_SECRET: OLD, SUPABASE_ANON_KEY: anonKey }, () => {
  const d = storage.diagnoseTenantJwt();
  check("secretMatchesLegacy === false", d.secretMatchesLegacy === false);
  check("jwtAlgorithm === 'HS256' (wir senden weiterhin HS256)", d.jwtAlgorithm === "HS256");
});

console.log("== 3) Kein Secret -> null (nicht bestimmbar), kein Crash ==");
withEnv({ SUPABASE_JWT_SECRET: undefined, SUPABASE_ANON_KEY: anonKey }, () => {
  const d = storage.diagnoseTenantJwt();
  check("secretMatchesLegacy === null ohne Secret", d.secretMatchesLegacy === null);
  check("jwtAlgorithm === null ohne Secret (signTenantJWT -> null)", d.jwtAlgorithm === null);
});

console.log("== 4) Moderner publishable Key (sb_...) -> null (kein HS256-Referenztoken) ==");
withEnv({ SUPABASE_JWT_SECRET: LEGACY, SUPABASE_ANON_KEY: "sb_publishable_xyz" }, () => {
  const d = storage.diagnoseTenantJwt();
  check("secretMatchesLegacy === null bei sb_-Key", d.secretMatchesLegacy === null);
});

console.log("== 5) SICHERHEIT: Rueckgabe enthaelt NIE einen Secret-Wert ==");
withEnv({ SUPABASE_JWT_SECRET: LEGACY, SUPABASE_ANON_KEY: anonKey }, () => {
  const d = storage.diagnoseTenantJwt();
  const serialized = JSON.stringify(d);
  check("Serialisierung enthaelt das Legacy-Secret NICHT", !serialized.includes(LEGACY), serialized);
  check("Rueckgabe hat exakt 2 Felder (secretMatchesLegacy, jwtAlgorithm)",
    Object.keys(d).sort().join(",") === "jwtAlgorithm,secretMatchesLegacy", Object.keys(d).join(","));
});

console.log("");
const total = pass + fail;
if (fail === 0) { console.log(`${pass}/${total} JWT-Endpoint-Diagnose-Assertions erfolgreich.`); process.exit(0); }
console.log(`${pass}/${total} erfolgreich, ${fail} fehlgeschlagen.`);
process.exit(1);
