"use strict";
// Vollstaendiger, byteidentischer Vorgaenger aus Commit
// e7501a4b7cc010d2661cb0d7f34a6b259d07bb75. Ausschliesslich Offline-Testfixture.
// Produktionspins, alte Auftraege und reale Belege werden NICHT aktualisiert.
const A = require("node:assert/strict"), F = require("node:fs"), Z = require("node:zlib");
const C = require("node:crypto"), P = require("node:path");
module.exports = function historischerStorageText() {
  const bytes = Z.gunzipSync(F.readFileSync(P.join(__dirname, "b055-storage-e7501a4b.js.gz")),
    { maxOutputLength: 1024 * 1024 });
  A.equal(C.createHash("sha256").update(bytes).digest("hex"),
    "d34f24f396c7939443b023e1ca9098d86bdd6111ecef675e54daab37de9be888");
  return bytes.toString("utf8");
};
