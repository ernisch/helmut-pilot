"use strict";

// V4 bindet das gesamte originale Absatz-Zwischenintervall, nicht nur den h6-Block.
// Sechs neue Negative direkt vor/nach h6; danach die neun nie gelaufenen V3/V2-Negativen.
// Ausschliesslich BB50253-Original, keine BE/anderen neunzehn Artikel oder Live-Wirkung.
// NO_NETWORK_TESTS=1 node --require ./scripts/run-offline-tests.js \
//   scripts/brandenburg-source-parser-heading-surroundings-test.js
const A = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const BB = require("../lib/helmut/brandenburg-landtag-presseartikel");
const URL = "https://www.landtag.brandenburg.de/de/meldungen/termine_des_landtages_brandenburg_in_der_zeit_vom_2._bis_9._oktober_2026/50253";
const HEADING = "<h6>Freitag, 2. Oktober, und Samstag, 3. Oktober 2026</h6>";
const raw = fs.readFileSync(path.join(__dirname, "fixtures", "brandenburg-landtag-termine-50253-20261002.html"));
A.equal(raw.length, 92070);
A.equal(crypto.createHash("sha256").update(raw).digest("hex"),
  "d7f599680e256e61dceaec974a3bb08ea033867e3976d4c72bf941f09d2122e3");
const html = raw.toString("utf8");
A.ok(Buffer.from(html, "utf8").equals(raw));
A.equal(html.split(HEADING).length - 1, 1);
for (const inert of ["<script>x</script>", "<template>x</template>", "<!--x-->"]) {
  for (const changed of [inert + HEADING, HEADING + inert]) {
    A.throws(() => BB.pruefePresseartikel({url: URL, finalUrl: URL, http: 200,
      html: html.replace(HEADING, changed)}),
      /brandenburg-landtag-presseartikel-termin-tagesueberschrift-markup-ungueltig/);
  }
}
console.log("PASS sechs neue V4-Negative: Script/Template/Kommentar jeweils vor und nach h6");
require("./brandenburg-source-parser-original-heading-test.js");
