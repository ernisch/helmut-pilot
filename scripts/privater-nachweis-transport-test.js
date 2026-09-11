"use strict";
const A = require("node:assert/strict"), C = require("node:crypto");
const T = require("./privater-nachweis-transport");
const pair = C.generateKeyPairSync("rsa", { modulusLength: 3072 });
const pub = pair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
const pem = pair.privateKey.export({ type: "pkcs8", format: "pem" });
const ctx = { runId: "123456789012", commit: "a".repeat(40), tag: "2026-09-11", abPosition: 48, anzahl: 5 };
const payload = { mandate: [{ userId: "PRIVATER_MANDANT", text: "PRIVATER_INHALT" }], unicode: "äöü – Beleg" };
const e = T.verschluesseln(payload, pub, ctx);
A.deepEqual(T.entschluesseln(e, pem, ctx), payload);
const reordered = structuredClone(e);
reordered.meta = Object.fromEntries(Object.entries(reordered.meta).reverse());
A.deepEqual(T.entschluesseln(reordered, pem, ctx), payload);
A.notEqual(JSON.stringify(reordered.meta), JSON.stringify(e.meta));
A(!JSON.stringify(e).includes("PRIVATER"));
A(e.daten.every(s => s.length <= 4096));
const e2 = T.verschluesseln(payload, pub, ctx);
A.notDeepEqual(e2, e); // Frischer Schluessel/Nonce, keine deterministische Chiffre.
for (const field of ["schluessel", "nonce", "authentisierung"]) {
  const bad = structuredClone(e), b = Buffer.from(bad[field], "base64"); b[0] ^= 1; bad[field] = b.toString("base64");
  A.throws(() => T.entschluesseln(bad, pem, ctx));
}
const bad = structuredClone(e), b = Buffer.from(bad.daten.join(""), "base64"); b[0] ^= 1;
bad.daten = [b.toString("base64")]; A.throws(() => T.entschluesseln(bad, pem, ctx));
for (const change of [{ runId: "123456789013" }, { commit: "b".repeat(40) }, { tag: "2026-09-10" },
  { abPosition: 49 }, { anzahl: 4 }]) A.throws(() => T.entschluesseln(e, pem, { ...ctx, ...change }));
const wrong = C.generateKeyPairSync("rsa", { modulusLength: 3072 });
A.throws(() => T.entschluesseln(e, wrong.privateKey.export({ type: "pkcs8", format: "pem" }), ctx));
const weak = C.generateKeyPairSync("rsa", { modulusLength: 2048 });
A.throws(() => T.publicKey(weak.publicKey.export({ type: "spki", format: "der" }).toString("base64")));
for (const change of [{ tag: "2026-02-30" }, { anzahl: 26 }, { abPosition: 499, anzahl: 5 }, { abPosition: 0 }])
  A.throws(() => T.verschluesseln(payload, pub, { ...ctx, ...change }));
A.throws(() => T.verschluesseln({ text: "x".repeat(T.MAX_BYTES) }, pub, ctx));
console.log("6/6 Transportgruppen: echte Entschluesselung, kein Klartext, frische Nonces, Manipulation, Empfaenger/Runbindung und Groessen-/Bereichsgrenzen.");
