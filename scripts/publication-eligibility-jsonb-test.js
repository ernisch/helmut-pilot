"use strict";

// Neuer Gegenfall des echten JSONB-Roundtrips: identische Sperrwerte mit
// anderer Objektschluesselreihenfolge. Keine Datenbank, Modelle oder Altlaeufe.
const A = require("node:assert/strict");
const P = require("../lib/helmut/publication-eligibility");
const policy = P.parse(JSON.stringify({ version: 1, holds: [{
  publicationUrl: "https://example.invalid/held-publication", reason: "unresolved-event-relation",
  review: { id: "synthetic-jsonb-order", receiptSHA256: "a".repeat(64),
    koSHA256: "b".repeat(64), sourceSHA256: "c".repeat(64) }
}] }));
const info = P.publicInfo(policy);
const fromJsonb = { hash: info.hash, version: info.version, heldPublications: info.heldPublications };

A.notEqual(JSON.stringify(fromJsonb), JSON.stringify(info), "Der Gegenfall muss die echte Reihenfolgeaenderung abbilden");
A.doesNotThrow(() => P.assertRecorded(fromJsonb, policy));
console.log("PASS Identische Publikationssperre bleibt nach JSONB-Schluesselumsortierung gueltig");

for (const [name, change] of [
  ["Hash", p => { p.hash = "f".repeat(64); }],
  ["Version", p => { p.version = 2; }],
  ["Anzahl", p => { p.heldPublications = 0; }],
  ["Datentyp", p => { p.heldPublications = "1"; }],
  ["fehlendes Feld", p => { delete p.version; }],
  ["zusaetzliches Feld", p => { p.extra = null; }]
]) {
  const changed = structuredClone(fromJsonb); change(changed);
  A.throws(() => P.assertRecorded(changed, policy), {
    code: "PUBLICATION_ELIGIBILITY_UNAVAILABLE", message: "publication-eligibility-stored-policy-stale"
  });
  console.log(`PASS JSONB-Reihenfolge erlaubt keinen abweichenden Sperrwert: ${name}`);
}
console.log("7 neue JSONB-Publikationssperrfaelle bestanden; keine externen Aufrufe.");
