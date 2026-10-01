"use strict";

// Neue, rein lokale Gegenproben fuer die amtliche RBMSKZL-Meldung vom 01.10.2026.
// Fixture: Artikelgrenze, Metadaten und Text unveraendert aus dem am selben Tag
// gesicherten Original (SHA-256 unten); Navigation/Randinhalt fuer die Fixture entfernt.
// Optional: --source-snapshot <bereits gesicherte JSON-Datei> prueft das komplette
// Original erneut durch den Parser/Adapter/Standvertrag, ausschliesslich mit Fetch-Stub.
// Kein Netzwerk, Modell, DB-Write, Crawl oder Productionzugriff.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const parser = require("../lib/helmut/berlin-presse-sondervorlagen");
const { ladeSondervorlage } = require("../lib/helmut/berlin-presse-sondervorlagen-abruf");
const { erzeugeSondervorlagenstand } = require("../lib/helmut/berlin-artikelstand");
const URL = "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1720353.php";
const TITLE = "Wegner bei den Feierlichkeiten zum Tag der Deutschen Einheit in Bremen";
const DAY = "2026-10-01";
const HEADING = "Abwechslungsreiches Programm auf der Ländermeile";
const ORIGINAL_SHA = "9e953fb1f11326a90802f555e07107abaf04d6833cf3014670106c117c3435c2";
const FIXTURE_SHA = "66aac33360d9b4da240a79afbb7575b25f0c9631a5e4fb41fed13c6e5eef3efe";
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const html = fs.readFileSync(path.join(__dirname, "fixtures/berlin-rbmskzl-current-20261001.html"), "utf8");
const heading = /<h4>[\s\S]*?<\/h4>/.exec(html)[0];
const textile = /<div class="textile">([\s\S]*?)<\/div>/.exec(html)[1];
const paragraphs = [...textile.matchAll(/<p>[\s\S]*?<\/p>/g)].map(m => m[0]);
let passed = 0;
function check(name, fn) { fn(); passed++; console.log("PASS " + name); }
function input(value, url = URL) { return { url, finalUrl: url, http: 200, html: value }; }
function rejects(name, value, reason = "rbmskzl-zwischenueberschrift-struktur") {
  check(name, () => assert.throws(() => parser.pruefeSondervorlage(input(value)),
    error => error.message === "berlin-presse-sondervorlagen-" + reason));
}

async function positiveOriginal(value, expectedSha, name) {
  assert.equal(hash(value), expectedSha);
  const parsed = parser.pruefeSondervorlage(input(value));
  assert.equal(parsed.titel, TITLE);
  assert.equal(parsed.publikationstag, DAY);
  const blocks = parsed.volltext.trimEnd().split("\n\n");
  assert.equal(blocks.length, 8);
  assert.equal(blocks[0], parser.ABSENDER_RB);
  assert.equal(blocks[5], HEADING);
  assert.equal(parsed.auszug, blocks[1]);
  assert.equal(parsed.volltextHash, hash(parsed.volltext));
  assert.equal(parsed.htmlHash, expectedSha);
  assert.ok(!parsed.volltext.includes("Social Media"));
  assert.ok(!parsed.volltext.includes("Kontaktinformationen"));
  let fetches = 0;
  const doc = { url: URL, title: TITLE, published_at: DAY };
  const loaded = await ladeSondervorlage(doc, {
    fetchUrl: async (url, depth, options) => {
      assert.equal(url, URL); assert.equal(depth, 0);
      assert.equal(options.allowedHost, "berlin.de"); assert.equal(options.meldeStatus, true);
      fetches++;
      return { status: 200, finalUrl: URL, body: value };
    }
  });
  assert.equal(fetches, 1);
  assert.equal(loaded.ok, true);
  const stand = erzeugeSondervorlagenstand(doc, loaded.vorlage);
  assert.equal(stand.ok, true);
  assert.equal(stand.row.summary, parsed.auszug);
  assert.equal(stand.row.published_at, null);
  assert.equal(stand.row.id, "rd-" + stand.stand.standHash);
  assert.ok(!Object.hasOwn(stand.row, "volltext"));
  assert.ok(!Object.hasOwn(stand.row, "html"));
  passed++; console.log("PASS " + name);
}

async function main() {
  await positiveOriginal(html, FIXTURE_SHA, "amtliche Minimalfixture: Volltext, Auszug und Adapter/Stand");
  rejects("zweite Zwischenueberschrift gesperrt", html.replace(heading, heading + heading));
  rejects("H4 vor Absender/Sachabsatz gesperrt", html.replace(heading, "").replace('<div class="textile">', '<div class="textile">' + heading));
  rejects("H4 am Artikelende gesperrt", html.replace(heading, "").replace(textile.replace(heading, ""), textile.replace(heading, "") + heading));
  rejects("fremde Huelle um H4 gesperrt", html.replace(heading, "<section>" + heading + "</section>"));
  rejects("verschachtelter Block in H4 gesperrt", html.replace(heading, "<h4><p>Fremdabsatz</p></h4>"));
  rejects("Inlineinhalt in H4 gesperrt", html.replace(heading, "<h4><strong>Fremdformat</strong></h4>"));
  rejects("versteckte H4 gesperrt", html.replace("<h4>", '<h4 hidden>'), "versteckter-inhalt-im-textile");
  rejects("H4 mit aria-hidden gesperrt", html.replace("<h4>", '<h4 aria-hidden="true">'), "versteckter-inhalt-im-textile");
  rejects("leere H4 gesperrt", html.replace(heading, "<h4> </h4>"));
  rejects("ueberlange H4 gesperrt", html.replace(heading, "<h4>" + "A".repeat(121) + "</h4>"));
  rejects("nackter Fremdtext gesperrt", html.replace(heading, heading + "Fremdtext"));
  rejects("zusatzlicher Fremdblock gesperrt", html.replace(heading, heading + "<div>Fremdblock</div>"));
  rejects("unbelegte Inlineform im Sachabsatz gesperrt", html.replace(paragraphs[2], paragraphs[2].replace("<p>", "<p><strong>Fremdformat</strong>")));
  rejects("versteckter Sachabsatz gesperrt", html.replace(paragraphs[2], paragraphs[2].replace("<p>", '<p hidden>')), "versteckter-inhalt-im-textile");
  rejects("Kontaktmodul bleibt gesperrt", html.replace("<h4>", '<h4 class="modul-contact">'), "kontaktblock-im-artikel");
  rejects("Downloadmodul bleibt gesperrt", html.replace("<h4>", '<h4 class="modul-download">'), "downloadmodul-im-artikel");
  rejects("Kontaktlink bleibt gesperrt", html.replace(heading, heading + '<p><a href="mailto:kontakt@example.org">Kontakt</a></p>'), "kontaktblock-im-artikel");
  rejects("Skript bleibt gesperrt", html.replace(heading, heading + "<script>evil()</script>"), "skript-oder-kommentar-im-artikel");
  rejects("Kommentar bleibt gesperrt", html.replace(heading, heading + "<!-- Fremdinhalt -->"), "skript-oder-kommentar-im-artikel");
  rejects("Absenderformel bleibt gebunden", html.replace(parser.ABSENDER_RB, "Fremder Absender:"), "absenderformel-abweichend");
  rejects("Canonicalsperre bleibt erhalten", html.replace('rel="canonical" href="' + URL, 'rel="canonical" href="https://example.org/'), "canonical-ungueltig");
  check("andere Pfadfamilie erlaubt weiterhin keine H4", () => {
    const url = URL.replace("rbmskzl/aktuelles", "sen/web/presse");
    assert.throws(() => parser.pruefeSondervorlage(input(html.replaceAll(URL, url), url)),
      /berlin-presse-sondervorlagen-textile-fremdinhalt/);
  });
  check("H4 ausserhalb Artikel wird nicht in Volltext aufgenommen", () => {
    const shifted = html.replace(heading, "").replace('<div id="layout-grid__area--marginal">',
      '<div id="layout-grid__area--marginal">' + heading);
    assert.ok(!parser.pruefeSondervorlage(input(shifted)).volltext.includes(HEADING));
  });
  const args = process.argv.slice(2);
  if (args.length) {
    assert.equal(args.length, 2); assert.equal(args[0], "--source-snapshot");
    const source = JSON.parse(fs.readFileSync(args[1], "utf8")).sources.berlin.article;
    assert.equal(source.requests[0].url, URL); assert.equal(source.requests[0].http, 200);
    assert.equal(source.requests[0].sha256, ORIGINAL_SHA);
    await positiveOriginal(source.failureInputHtml, ORIGINAL_SHA, "gesichertes komplettes aktuelles Original: Parser/Adapter/Stand");
  }
  console.log(JSON.stringify({ suite: "berlin-rbmskzl-current", passed, failed: 0, networkCalls: 0 }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
