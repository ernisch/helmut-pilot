"use strict";

// Neue enge Regression fuer den Liefervertrag eines ruhigen Tages.
// Bestehende synthetische Quellen; echter Materialisierer und Paketleser,
// ausschliesslich mandatsgebundener Speicher im Prozess, kein Modell/HTTP/DB.
const A = require("node:assert/strict");
const B = require("../lib/helmut/briefing-speicher");
const D = require("../lib/helmut/tagespaket-auslieferung");
const L = require("../lib/helmut/briefing-lauf");
const S = require("../lib/helmut/storage");
const fixture = require("./fixtures/profilhash-integration");
const { profile, day, now } = fixture;

async function ausliefern({ kind = "quiet", status = "empty", versorgung, lage = true } = {}) {
  const original = fixture.fixture(), rows = new Map();
  if (lage) rows.set(original.text.id, structuredClone(original.text));
  const briefing = structuredClone(fixture.briefing);
  briefing.currentHelmutState = { status, emptyState: { kind,
    headline: "Kein belegter Tagesanlass fuer ein Briefing" }, ...(versorgung ? { versorgung } : {}) };
  briefing.currentRadarState = { status: "fresh", anzeige: { status: "fresh", dynamics: [{
    title: "Gespeicherte synthetische Beobachtung", sourceUrl: "https://example.invalid/dokument/1" }] } };
  const lageAnsicht = lage ? { ...B.lageAusgabe(original.text.payload), vorgaenge: [{
    vorgangId: "vg-synth-1", displayTitle: "Gespeicherte synthetische Lagekarte",
    sources: [{ url: "https://example.invalid/dokument/1" }] }] } : null;
  const storage = { assertTenant: S.assertTenant,
    getRenderedBriefingV3: async (userId, slot, tag) => {
      A.equal(userId, profile.id); A.equal(tag, day);
      return structuredClone(rows.get(`bf-${userId}-${slot}-${tag}`) || null);
    },
    insertRenderedBriefingV3: async row => {
      A.equal(row.user_id, profile.id); A.equal(rows.has(row.id), false);
      rows.set(row.id, structuredClone(row)); return { saved: true };
    }
  };
  const gespeichert = await B.materialisiere({ userId: profile.id, profile, now, storage, briefing, lageAnsicht });
  const row = rows.get(`bf-${profile.id}-${B.SLOT}-${day}`);
  const receipt = L.quittung({ tenantId: profile.id, berlinTag: day, erzeugtAm: now,
    status: L.STATUS_ERFOLG, ausgabeBeleg: require("../lib/helmut/briefing-ausgabebeleg").ausPaket(row),
    fensterStart: day + "T00:00:00Z" });
  rows.set(L.laufId(profile.id, day), { id: L.laufId(profile.id, day), user_id: profile.id,
    slot: L.SLOT_ERFOLG, generated_at: now.toISOString(), payload: receipt });
  const before = JSON.stringify([...rows]);
  const result = await D.lese({ userId: profile.id, profile, storage, now });
  A.equal(JSON.stringify([...rows]), before, "Auslieferung veraendert den gespeicherten Stand nicht");
  A.equal(result.briefing.paketStatus.quittungGebunden, true);
  A.deepEqual(result.briefing.currentRadarState, briefing.currentRadarState);
  return { gespeichert, result, row, lageAnsicht,
    adminStand: () => require("../lib/helmut/admin-ergebnisstand").bewerte({
      userId: profile.id, tag: day, rows: [...rows.values()] }) };
}

(async () => {
  // Separater neuer Admin-Nachweis, ohne die sieben Lieferfaelle zu wiederholen.
  if (process.argv.includes("--admin-only")) {
    const ruhig = await ausliefern();
    A.deepEqual(ruhig.adminStand().positionen.briefing, {
      stufe: 3, ursache: null, code: null, hinweis: "ruhiger-tag"
    });
    console.log("PASS Verwaltung behaelt den Ruhelagehinweis beim vollstaendigen Paket");
    for (const [name, args, code] of [
      ["Gap", { kind: "gap" }, "briefing-ohne-tagesanlass"],
      ["offene Quellenversorgung", { versorgung: { version: 1, zustand: "offen" } }, "quellenversorgung-unvollstaendig"]
    ]) {
      const f = await ausliefern(args);
      A.deepEqual(f.adminStand().positionen.briefing, { stufe: 2, ursache: "unvollstaendig", code });
      console.log(`PASS Verwaltung meldet ${name} ohne Ruhelagehinweis als unvollstaendig`);
    }
    console.log("3 neue Admin-Ruhelagefaelle bestanden; sieben Lieferfaelle nicht ausgefuehrt.");
    return;
  }
  let n = 0;
  const ruhig = await ausliefern();
  A.equal(ruhig.gespeichert.vollstaendig, true);
  A.equal(ruhig.row.payload.pruefung.strukturellVollstaendig, true);
  A.deepEqual(ruhig.row.payload.pruefung.fehler, []);
  A.equal(ruhig.result.briefing.paketStatus.zustand, "gespeichert");
  A.equal(ruhig.result.briefing.paketStatus.vollstaendig, true);
  A.equal(ruhig.result.briefing.paketStatus.fachlicheVollabnahme, false);
  A.deepEqual(ruhig.result.briefing.lageBriefing.vorgaenge, ruhig.lageAnsicht.vorgaenge);
  A(ruhig.result.briefing.lageBriefing.paragraphs.length > 0);
  console.log("PASS Explizite Ruhelage liefert ein vollstaendiges gebundenes Tagespaket mit Lage und Radar"); n++;

  for (const zustand of ["offen", "unbekannt"]) {
    const f = await ausliefern({ versorgung: { version: 1, zustand } });
    A.equal(f.gespeichert.vollstaendig, false);
    A.equal(f.result.briefing.paketStatus.zustand, "teilweise");
    A(f.result.briefing.paketStatus.fehler.includes("quellenversorgung-unvollstaendig"));
    console.log(`PASS Ruhelage bei ${zustand}er Quellenversorgung bleibt unvollstaendig`); n++;
  }
  for (const args of [{ kind: "gap" }, { kind: "stale" }, { status: "fresh" }]) {
    const f = await ausliefern(args);
    A.equal(f.gespeichert.vollstaendig, false);
    A.equal(f.result.briefing.paketStatus.zustand, "teilweise");
    A(f.result.briefing.paketStatus.fehler.includes("briefing-ohne-tagesanlass"));
    console.log(`PASS ${JSON.stringify(args)} wird ohne Tagesanlass nicht zur Ruhelage umgedeutet`); n++;
  }
  const ohneLage = await ausliefern({ lage: false });
  A.equal(ohneLage.gespeichert.vollstaendig, false);
  A.equal(ohneLage.result.briefing.paketStatus.zustand, "teilweise");
  A(ohneLage.result.briefing.paketStatus.fehler.includes("lage-text-fehlt"));
  A.deepEqual(ohneLage.result.briefing.lageBriefing?.paragraphs || [], []);
  console.log("PASS Ruhelage ohne gepruefte Lage bleibt unvollstaendig"); n++;
  console.log(`${n} neue Ruhelage-Lieferfaelle bestanden.`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
