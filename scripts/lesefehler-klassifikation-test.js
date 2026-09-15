"use strict";
const A = require("node:assert/strict"), S = require("../lib/helmut/storage");
const pruefe = (error, erwartet) => A.equal(S.klassifiziereLesefehler(error), erwartet, String(error.message));
for (const status of [401, 403]) {
  pruefe(new Error(`Supabase storage timed out after 800ms: /rest/v1/raw_documents?created_at=gte.2026-09-15T12%3A29%3A18.${status}Z`), "timeout");
  pruefe(Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(`connect ECONNREFUSED 127.0.0.1:${status}23`), { code: "ECONNREFUSED" }) }), "connection");
  pruefe(Object.assign(new Error(`getaddrinfo ENOTFOUND db${status}.supabase.co`), { code: "ENOTFOUND" }), "dns");
  pruefe(new Error(`Supabase storage failed (${status}): denied`), "auth");
  pruefe(new Error(`HTTP ${status}: denied`), "auth");
  pruefe(Object.assign(new Error("request failed"), { status }), "auth");
  pruefe(Object.assign(new Error("request failed"), { cause: { statusCode: String(status) } }), "auth");
}
pruefe(new Error("Supabase storage failed (500): internal error"), "db");
pruefe(new Error("permission denied for table raw_documents"), "auth");
// Mutationsprobe: die fruehere rohe Statuszahl-Heuristik muss am belegten
// Zeitstempel erneut falsch liegen. Die aktuelle Regression erkennt sie.
const original = S.klassifiziereLesefehler.toString();
const mutant = original.replace("if (authStatus || httpAuth ||", 'if (m.includes("401") || m.includes("403") ||');
A.notEqual(mutant, original);
const classifyMutant = require("node:vm").runInNewContext("(" + mutant + ")",
  { lesefehlerKette: e => e.message }, { timeout: 1000 });
const zeitfehler = new Error("Supabase storage timed out after 800ms: /rest/v1/raw_documents?created_at=gte.2026-09-15T12%3A29%3A18.401Z");
A.equal(classifyMutant(zeitfehler), "auth");
pruefe(zeitfehler, "timeout");
console.log("17/17 Lesefehlerklassen: Zeitstempel/Ports/DNS sind keine HTTP-Statuswerte; echte 401/403 bleiben auth.");
