"use strict";

// Helmut — Gezielte Pruefung des HARTEN 0,80-USD-Laufdeckels des einmaligen 169er
// Verstehenslaufs. Offline, keine Datenbank, kein Netz, kein Modellaufruf.
// =============================================================================================
// Der Blocker: `(aufrufe+1) x 0,00526125 USD` war ein DURCHSCHNITTSPREIS und damit keine harte
// Kostenobergrenze. Der Fix nutzt die BESTEHENDE atomare Kostenwahrheit (testkosten-budget.js):
// vor jedem Aufruf wird die volle Reservierung gebucht, nach der Anbieterantwort werden die
// ECHTEN Tokenkosten abgerechnet, und jede Buchung traegt die Laufkennung (`bezug.runId`).
// Der Runner prueft vor jedem Cluster: echte Laufkosten + volle Reservierung <= 0,80 USD.
// Diese Suite prueft die Kostenwahrheit selbst und die unveraenderten Vertragswerte.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const B = require("../lib/helmut/testkosten-budget");
const V = require("../lib/helmut/verstehen-einmalig");
const quelle = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const DAY = "2026-09-23";
const ENV_AKTIV = { VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt" };
const RUN = "verstehen169-35793838856";

let bestanden = 0;
function pruefe(name, fn) {
  fn(); bestanden += 1; console.log("  PASS  " + name);
}
function pruefeWirft(name, fn, grund) {
  assert.throws(fn, (e) => e && e.reason === grund, name);
  bestanden += 1; console.log("  PASS  " + name);
}
async function pruefeAsync(name, fn) {
  await fn(); bestanden += 1; console.log("  PASS  " + name);
}

function ticket({ status, cost = null, runId = RUN, reserved = 212000, maxOutputTokens = 3000, manual = true }) {
  return { status, reserved, maxOutputTokens, manual, createdAt: DAY + "T08:00:00.000Z",
    ...(status === "abgerechnet" || cost != null ? { cost } : {}),
    ...(manual ? { bezug: { version: 1, runId } } : {}) };
}
function tag(calls, day = DAY) {
  const liste = Object.values(calls);
  const spent = liste.reduce((n, c) => n + (c.cost || 0), 0);
  return { version: B.VERSION, day, tarif: B.konfiguration(ENV_AKTIV).tarif,
    limit: B.LIMIT_MICRO_USD, spent, baseline: 0, baselineCalls: 0,
    manualCalls: liste.filter((c) => c.manual).length, manualUntil: null,
    calls, frozen: null };
}
function depsMit(auth) {
  return { env: ENV_AKTIV, storage: { readAuthStore: async () => auth } };
}

// ── 1 · Die Kostenwahrheit selbst ──────────────────────────────────────────────────────────
console.log("== testkosten-budget: Reservierungshoehe und Laufkennung ==");
pruefe("volle Reservierung je Aufruf = 0,212 USD (Understanding-Ausgabegrenze 3000)",
  () => assert.equal(B.reservierungHoeheUsd(), 0.212));
pruefe("8000er Ausgabegrenze = 0,232 USD (unveraendert)",
  () => assert.equal(B.reservierungHoeheUsd(8000), 0.232));
pruefeWirft("ungueltige Ausgabegrenze abgelehnt",
  () => B.reservierungHoeheUsd(0), "test-usd-ausgabegrenze-ungueltig");
pruefe("Laufkennung verstehen169-… akzeptiert",
  () => assert(B.MANUELLE_RUN_ID.test("verstehen169-35793838856")));
pruefe("bestehende Laufkennung nachlauf500-… bleibt akzeptiert",
  () => assert(B.MANUELLE_RUN_ID.test("nachlauf500-123456789")));
pruefe("fremde Laufkennung abgelehnt",
  () => assert.equal(B.MANUELLE_RUN_ID.test("fremd-123456789"), false));
pruefe("zu kurze oder nichtnumerische Laufkennung abgelehnt",
  () => { assert.equal(B.MANUELLE_RUN_ID.test("verstehen169-12"), false);
    assert.equal(B.MANUELLE_RUN_ID.test("verstehen169-abcdefgh"), false); });

// ── 2 · Echte Laufkosten: unterschiedliche Einzelkosten, fremde Laeufe zaehlen nicht ──────
console.log("\n== testkosten-budget: laufGebundenUsd (rein lesend) ==");
(async () => {
  await pruefeAsync("verschiedene echte Einzelkosten + offene Reservierung werden korrekt summiert", async () => {
    const calls = {
      "a": ticket({ status: "abgerechnet", cost: 5000 }),
      "b": ticket({ status: "abgerechnet", cost: 13000 }),
      "c": ticket({ status: "reserviert" }),
      "fremd": ticket({ status: "abgerechnet", cost: 13000, runId: "verstehen169-999999999" }),
      "fremd-offen": ticket({ status: "ungeklaert", runId: "verstehen169-999999999" })
    };
    const gebunden = await B.laufGebundenUsd(RUN, depsMit({ [B.KEY]: { [DAY]: tag(calls) } }));
    assert.equal(gebunden, (5000 + 13000 + 212000) / 1e6, "0,23 USD — Fremdkosten zaehlen nicht");
  });
  await pruefeAsync("offene Reservierungen zaehlen konservativ mit (ungeklaert bleibt gebunden)", async () => {
    const calls = { "u": ticket({ status: "ungeklaert", runId: "verstehen169-999999999" }),
      "r": ticket({ status: "reserviert" }) };
    const gebunden = await B.laufGebundenUsd(RUN, depsMit({ [B.KEY]: { [DAY]: tag(calls) } }));
    assert.equal(gebunden, 212000 / 1e6);
  });
  await pruefeAsync("Buchungen ueber mehrere Tage werden gefunden", async () => {
    const t1 = tag({ "a": ticket({ status: "abgerechnet", cost: 1000 }) });
    const t2 = tag({ "b": ticket({ status: "abgerechnet", cost: 2000 }) }, "2026-09-22");
    const gebunden = await B.laufGebundenUsd(RUN, depsMit({ [B.KEY]: { [DAY]: t1, "2026-09-22": t2 } }));
    assert.equal(gebunden, 3000 / 1e6);
  });
  await pruefeAsync("keine Buchungen des Laufs = ehrlich 0 USD", async () => {
    const gebunden = await B.laufGebundenUsd(RUN, depsMit({ [B.KEY]: { [DAY]: tag({}) } }));
    assert.equal(gebunden, 0);
  });
  await pruefeAsync("fremde Laufkennung wird fail closed abgelehnt", async () => {
    await assert.rejects(B.laufGebundenUsd("fremd-123456789", depsMit({ [B.KEY]: {} })),
      (e) => e.reason === "test-usd-laufkennung-ungueltig");
  });
  await pruefeAsync("ohne aktive Reservierung wird fail closed abgelehnt", async () => {
    await assert.rejects(B.laufGebundenUsd(RUN, { env: { VERCEL_ENV: "production" }, storage: { readAuthStore: async () => ({ [B.KEY]: {} }) } }),
      (e) => e.reason === "test-usd-reservierung-aus");
  });
  await pruefeAsync("unlesbare Kostenablage wirft statt 0 USD", async () => {
    const kaputt = tag({ "a": ticket({ status: "abgerechnet", cost: 5000 }) });
    kaputt.spent += 1; // Invariante verletzt
    await assert.rejects(B.laufGebundenUsd(RUN, depsMit({ [B.KEY]: { [DAY]: kaputt } })),
      (e) => e.reason === "test-usd-buch-unlesbar");
  });
})().then(() => {

  // ── 3 · Unveraenderte Vertragswerte ──────────────────────────────────────────────────────
  console.log("\n== Unveraenderte Vertragswerte ==");
  pruefe("globaler Tagesriegel gemaess Freigabe6USD (LIMIT_MICRO_USD = 6000000)",
    () => assert.equal(B.LIMIT_MICRO_USD, 6000000));
  pruefe("tokenKosten-Formel unveraendert (100 ein, 20 aus = 130)",
    () => assert.equal(B.tokenKosten(100, 20), 130));
  pruefe("113 unveraendert (PINNED)", () => assert.equal(V.PINNED.maxModellaufrufe, 113));
  pruefe("0,80 USD unveraendert (PINNED)", () => assert.equal(V.PINNED.maxUsd, 0.8));
  pruefe("35 Minuten unveraendert (PINNED)", () => assert.equal(V.PINNED.maxMs, 35 * 60 * 1000));
  pruefe("Quittungsschluessel unveraendert", () => assert.equal(V.QUITTUNG, "verstehen169-20260922-a"));

  // ── 4 · Durchschnittspreis ist aus dem Deckel entfernt ──────────────────────────────────
  console.log("\n== Durchschnittspreis ist keine harte Obergrenze mehr ==");
  const kern = quelle("lib/helmut/verstehen-einmalig.js");
  const bedienweg = quelle("scripts/verstehen-einmalig-169.js");
  pruefe("Runner kennt keinen preisJeAufrufUsd mehr", () => assert(!kern.includes("preisJeAufrufUsd")));
  pruefe("Runner kennt keinen verstehen-preis-fehlt mehr", () => assert(!kern.includes("verstehen-preis-fehlt")));
  pruefe("Runner verlangt die Kostenwahrheit (reservierungHoeheUsd + laufKostenUsd)",
    () => { assert(kern.includes("verstehen-kostenwahrheit-fehlt"));
      assert(kern.includes("verstehen-kostenleser-fehler"));
      assert(kern.includes("verstehen-kostendeckel-erreicht")); });
  pruefe("Bedienweg liest kein HELMUT_VERSTEHEN_169_PREIS_USD mehr",
    () => assert(!bedienweg.includes("HELMUT_VERSTEHEN_169_PREIS_USD")));
  pruefe("Bedienweg bildet die manuelle Laufkennung verstehen169-…",
    () => assert(bedienweg.includes('"verstehen169-" + (env.GITHUB_RUN_ID || Date.now())')));
  pruefe("Bedienweg verdrahtet die bestehende Kostenwahrheit",
    () => { assert(bedienweg.includes("testkosten.reservierungHoeheUsd"));
      assert(bedienweg.includes("testkosten.laufGebundenUsd")); });

  // ── 5 · Fail-closed Resolver-Schutzlogik unveraendert ───────────────────────────────────
  console.log("\n== Fail-closed Resolver-Schutzlogik unveraendert ==");
  const understanding = quelle("lib/helmut/understanding.js");
  const storage = quelle("lib/helmut/storage.js");
  pruefe("exakter Leser getExistingStreng bleibt verdrahtet",
    () => assert(understanding.includes("getExistingStreng")));
  pruefe("Bestandslesefehler bleiben typisiert (ko_document_links)",
    () => assert(storage.includes('StorageReadError("ko_document_links"') || storage.includes("StorageReadError(\"ko_document_links\"")));
  pruefe("Bestandslesefehler bleiben typisiert (knowledge_objects)",
    () => assert(storage.includes('StorageReadError("knowledge_objects"') || storage.includes("StorageReadError(\"knowledge_objects\"")));

  console.log(`\nverstehen-169-kosten-deckel-test: ${bestanden} von ${bestanden} Pruefungen gruen.`);
});
