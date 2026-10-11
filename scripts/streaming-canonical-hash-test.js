"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const P = require("../lib/helmut/synthetik-500-profile");
const old = value => crypto.createHash("sha256").update(P.kanonisch(value)).digest("hex");
const values = [null, true, 0, -0, 1.1, "Straße 🎉 \ud800", [], {},
  { z: 1, a: [null, { "10": "x", "2": "y", a: undefined }], missing: undefined },
  [undefined, , "x"], new Date("2026-10-11"), { "__proto__": null, b: "x" }];
for (const v of values) assert.equal(P.hash(v), old(v));
const common = { z: "original UTF8 🎉 ".repeat(5000), a: [{ b: 4, a: true }] };
const dag = Array.from({ length: 100 }, () => common);
assert.equal(P.hash(dag), old(dag));
// An expanded value exceeding V8's string cap, independently hashed without
// producing that string. This verifies the real failure mode with a small DAG.
const text = "unveränderte Originalquelle 🎉".repeat(10000), unit = JSON.stringify({ text });
const large = Array(1800).fill({ text }), digest = crypto.createHash("sha256");
digest.update("["); for (let i = 0; i < large.length; i++) { if (i) digest.update(","); digest.update(unit); } digest.update("]");
assert(Buffer.byteLength(unit) * large.length > require("node:buffer").constants.MAX_STRING_LENGTH);
assert.equal(P.hash(large), digest.digest("hex"));
const getter = () => { let reads = 0; return { get a() { return "x".repeat(70000) + (++reads); }, get b() { return reads; } }; };
assert.equal(P.hash(getter()), old(getter()));
const cycle = {}; cycle.self = cycle; assert.throws(() => P.hash(cycle), RangeError);
console.log("PASS canonical compatibility, Unicode, shared DAG, cycle rejection and >V8-limit streaming preimage");
