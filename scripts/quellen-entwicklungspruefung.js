"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const path = require("node:path");

const auswahl = Object.freeze({
  "bundestag-kalender": __filename,
  "bundestag-pdf": "quellen-bundestag-termine-pdf-test.js",
  "destatis-rss": "quellen-destatis-rss-stand-test.js",
  "dip-quellfelder": "dip-quellfelder-test.js",
  produktionsnah: "quellen-pruefstand.js"
});

// Das Dokument enthält frei erfundene, für den Parser passende Kalenderdaten.
// Der reale Aufnahmevertrag benutzt nur die injizierten Antworten und Ablage.
async function kalender(mandat) {
  const B = require("../lib/helmut/quellen-bundestag-termine");
  const q = B.QUELLEN.find(quelle => quelle.id === "bt-termine-sitzungswochen");
  const kalenderUrl = "https://www.bundestag.de/resource/blob/1/entwicklungsprobe.ics";
  const fixture = Buffer.from([
    "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:fixture.test",
    "DTSTART;VALUE=DATE:20261123", "DTEND;VALUE=DATE:20261128",
    "SUMMARY:Sitzungswoche Deutscher Bundestag", "END:VEVENT", "END:VCALENDAR", ""
  ].join("\r\n"));
  const antworten = new Map([
    ["https://www.bundestag.de/robots.txt", Buffer.from("User-agent: *\nDisallow: /xml/\n")],
    [q.url, Buffer.from(`<a href="${kalenderUrl}">Synthetischer Kalender</a>`)],
    [kalenderUrl, fixture]
  ]);
  const katalog = {
    retrievalPaths: [{ id: q.retrievalPathId, legacy_source_id: q.id, publisher_id: "publisher-bundestag.de",
      method: q.crawlMethod, url: q.url, status: "needs_review", activation_mode: "auto" }],
    packages: [{ id: q.packageId, status: "active" }],
    packagePaths: [{ package_id: q.packageId, retrieval_path_id: q.retrievalPathId }]
  };
  const now = () => Date.parse("2026-11-19T06:00:00Z");
  let reservierungen = 0, stand;
  const r = await B.aufnahme(q, {
    katalog, now, deadlineMs: now() + 10000,
    fetchUrl: async url => {
      const bytes = antworten.get(url);
      assert(antworten.delete(url), "Unbekannter oder wiederholter Fixture-Abruf");
      return { status: 200, finalUrl: url, bytes };
    },
    reserveOriginal: async () => {
      assert.equal(++reservierungen, 1, "Nur eine simulierte Originalreservierung");
      return { erlaubt: true, geprueft: true };
    },
    save: async daten => {
      assert.equal(stand, undefined);
      stand = B.leseStand(daten);
      return { ok: true, standHash: stand.standHash, belegHash: stand.belegHash };
    }
  });
  assert.equal(r.ok, true);
  assert.equal(antworten.size, 0);
  assert.equal(reservierungen, 1);
  assert.equal(stand.documents.length, 1);
  assert.equal(stand.documents[0].byteHash, B.hash(fixture));
  assert.equal(stand.documents[0].publishedDay, null);
  assert.equal(stand.documents[0].events[0].startDay, "2026-11-23");
  if (mandat !== "ohne") {
    const storeId = "entwicklungsprobe";
    let lesungen = 0;
    const ausgabe = await require("../lib/helmut/parlamentsbelege-produkt").leseKontext({
      parliamentType: mandat === "bundestag" ? "Bundestag" : "Landtag"
    }, { katalog: async () => katalog, storeId, now, request: async route => {
      assert.equal(++lesungen, 1);
      assert.equal(new URL(route, "http://localhost").searchParams.get("data->>sourceId"), "eq." + q.id);
      return [{ id: storeId + "-bt-terminstand-" + stand.belegHash, data: stand }];
    } });
    if (mandat === "landtag") {
      assert.equal(ausgabe, null);
      assert.equal(lesungen, 0);
    } else {
      const beleg = ausgabe.belege.find(b => b.sourceId === q.id);
      assert.equal(lesungen, 1);
      assert.equal(beleg.standHash, stand.standHash);
      assert.equal(beleg.rolle, "Bundestagsmandat");
      assert.equal(beleg.termine.length, 1);
    }
  }
  console.log(JSON.stringify({ quelle: q.id, fixtureAbrufe: 3, fixtureReservierungen: reservierungen, standHash: stand.standHash }));
}

function start(args) {
  const [quelle, mandat = "ohne"] = args;
  if (args.length > 2 || !Object.hasOwn(auswahl, quelle)
    || !["ohne", "bundestag", "landtag"].includes(mandat)
    || (quelle !== "bundestag-kalender" && mandat !== "ohne")) {
    console.error("quellen-entwicklungspruefung: auswahl-ungueltig");
    return 2;
  }
  const schutz = require("./lokaler-netzschutz");
  if (process.env.HELMUT_LOKALER_SCHUTZ !== "aktiv" || schutz.simulierteUmgebung() || schutz.pruefe().length) {
    console.error("quellen-entwicklungspruefung: lokaler-schutz-fehlt");
    return 3;
  }
  if (quelle === "produktionsnah") {
    const result = spawnSync(process.execPath, [path.join(__dirname, auswahl[quelle])], {
      // Reale Runnerzeit für PostgreSQL und beide synthetischen Tage. Die
      // Uhr, Cron-Zeitfenster und Abnahmefristen im Szenario sind separat.
      stdio: "inherit", timeout: 300000, killSignal: "SIGKILL"
    });
    return result.status === 0 ? 0 : 1;
  }
  const { GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, GITHUB_SHA } = process.env;
  const meta = {
    modus: "entwicklung-offline", quelle, mandat, lauf: /^\d+$/.test(GITHUB_RUN_ID || "") ? GITHUB_RUN_ID : randomUUID(),
    versuch: /^\d+$/.test(GITHUB_RUN_ATTEMPT || "") ? GITHUB_RUN_ATTEMPT : null,
    commit: /^[a-f0-9]{40}$/.test(GITHUB_SHA || "") ? GITHUB_SHA : null,
    grenzen: { adapter: 1, mandatsprofile: mandat === "ohne" ? 0 : 1, sekunden: 45, externeAbrufe: 0, modelle: 0 }
  };
  console.log(JSON.stringify({ ...meta, zustand: "start" }));
  const argv = quelle === "bundestag-kalender"
    ? [__filename, "--kalender-fixture", mandat] : [path.join(__dirname, auswahl[quelle])];
  const result = spawnSync(process.execPath, argv, {
    stdio: "inherit", timeout: 45000, killSignal: "SIGKILL",
    env: { PATH: process.env.PATH, NODE_OPTIONS: `--require ${JSON.stringify(require.resolve("./lokaler-netzschutz"))}`,
      HELMUT_SOURCE_MODE: "off", HELMUT_STORAGE_BACKEND: "local" }
  });
  const zustand = result.error?.code === "ETIMEDOUT" ? "zeitlimit"
    : result.status === 0 ? "bestanden" : "fehlgeschlagen";
  console.log(JSON.stringify({ ...meta, zustand, exitCode: result.status, signal: result.signal }));
  return result.status === 0 ? 0 : 1;
}

const args = process.argv.slice(2);
if (args[0] === "--kalender-fixture") {
  // Auch der Kindmodus installiert den Schutz, wenn er direkt aufgerufen wird.
  require("./lokaler-netzschutz");
  kalender(args[1]).catch(error => { console.error(error.message); process.exitCode = 1; });
} else {
  process.exitCode = start(args);
}
