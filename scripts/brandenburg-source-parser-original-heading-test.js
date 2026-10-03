"use strict";

// Neue V3-Negative fuer das tatsaechliche Originalintervall der neuen ", und"-Form.
// Danach die V2-Folgeprobe mit ihren fuenf bisher noch nie gelaufenen Negativen.
// Keine BE-Originale, keine anderen neunzehn Artikel, kein Netzwerk/DB/Provider.
// NO_NETWORK_TESTS=1 node --require ./scripts/run-offline-tests.js \
//   scripts/brandenburg-source-parser-original-heading-test.js
const A = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const BB = require("../lib/helmut/brandenburg-landtag-presseartikel");
const URL = "https://www.landtag.brandenburg.de/de/meldungen/termine_des_landtages_brandenburg_in_der_zeit_vom_2._bis_9._oktober_2026/50253";
const HEADING = "Freitag, 2. Oktober, und Samstag, 3. Oktober 2026";
const raw = fs.readFileSync(path.join(__dirname, "fixtures", "brandenburg-landtag-termine-50253-20261002.html"));
A.equal(raw.length, 92070);
A.equal(crypto.createHash("sha256").update(raw).digest("hex"),
  "d7f599680e256e61dceaec974a3bb08ea033867e3976d4c72bf941f09d2122e3");
const html = raw.toString("utf8");
A.ok(Buffer.from(html, "utf8").equals(raw));
const vorher = "<h6>" + HEADING + "</h6>";
A.equal(html.split(vorher).length - 1, 1);
for (const nachher of [
  "<h6>" + HEADING + "<script>x</script></h6>",
  "<h6>" + HEADING + "<template>x</template></h6>",
  "<h6>" + HEADING + "<!--x--></h6>",
  '<h6 __proto__="x">' + HEADING + "</h6>"
]) A.throws(() => BB.pruefePresseartikel({url: URL, finalUrl: URL, http: 200,
  html: html.replace(vorher, nachher)}),
  /brandenburg-landtag-presseartikel-termin-tagesueberschrift-markup-ungueltig/);
console.log("PASS vier neue V3-Negative: Script/Template/Kommentar/Proto-Attribut im Original-h6");
require("./brandenburg-source-parser-hidden-heading-test.js");
