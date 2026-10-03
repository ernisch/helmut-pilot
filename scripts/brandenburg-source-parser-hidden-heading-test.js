"use strict";

// Root-Folgenachweis: genau der bei V1 fehlgeschlagene hidden-h6-Fall und die vier
// damals noch nicht erreichten Negativen. Der ganze BB-Originalbody wird einmal
// fuer die anschliessende RSS-Bindung gelesen; keine Berliner/anderen 19 Originale.
// NO_NETWORK_TESTS=1 node --require ./scripts/run-offline-tests.js \
//   scripts/brandenburg-source-parser-hidden-heading-test.js
const A = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const BB = require("../lib/helmut/brandenburg-landtag-presseartikel");
const RSS = require("../lib/helmut/brandenburg-landtag-presse-rss");
const URL = "https://www.landtag.brandenburg.de/de/meldungen/termine_des_landtages_brandenburg_in_der_zeit_vom_2._bis_9._oktober_2026/50253";
const WEICHE = "https://www.landtag.brandenburg.de/sixcms/detail.php?id=brandenburg_01.c.50253.de";
const TITEL = "Termine des Landtages Brandenburg in der Zeit vom 2. bis 9. Oktober 2026";
const HEADING = "Freitag, 2. Oktober, und Samstag, 3. Oktober 2026";
const raw = fs.readFileSync(path.join(__dirname, "fixtures", "brandenburg-landtag-termine-50253-20261002.html"));
A.equal(raw.length, 92070);
A.equal(crypto.createHash("sha256").update(raw).digest("hex"),
  "d7f599680e256e61dceaec974a3bb08ea033867e3976d4c72bf941f09d2122e3");
const html = raw.toString("utf8");
A.ok(Buffer.from(html, "utf8").equals(raw));
const vorher = "<h6>" + HEADING + "</h6>";
A.equal(html.split(vorher).length - 1, 1);
const input = body => ({url: URL, finalUrl: URL, http: 200, html: body});
A.throws(() => BB.pruefePresseartikel(input(html.replace(vorher, "<h6 hidden>" + HEADING + "</h6>"))),
  /brandenburg-landtag-presseartikel-termin-tagesueberschrift-markup-ungueltig/);
A.throws(() => BB.pruefePresseartikel(input(html.replace(vorher,
  vorher + "<aside><p>Fremde Kontaktmeldung</p></aside>"))), /brandenburg-landtag-presseartikel-/);

// Fuer diese drei RSS-Bindungsvarianten wird kein neuer Stand/Normalizer/Crawl gestartet.
const artikel = BB.pruefePresseartikel(input(html));
const item = {nummer: "50253", titel: TITEL, link: WEICHE, guid: WEICHE,
  author: "brandenburg_01.c.50253.de (50253)", pubDate: "Fri, 02 Oct 2026 12:57:00 +0200",
  publikationstag: "2026-10-02"};
for (const changed of [
  {...item, titel: TITEL + " – Fremdtext"},
  {...item, publikationstag: "2026-10-03", pubDate: "Sat, 03 Oct 2026 12:57:00 +0200"},
  {...item, nummer: "50179"}
]) A.throws(() => RSS.bindeRssItemAnArtikel(changed, artikel), /brandenburg-landtag-presse-rss-/);
console.log("PASS hidden-h6 und vier zuvor nicht erreichte Negative; ein ganzer BB-Originalbody als RSS-Setup");
