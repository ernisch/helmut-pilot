"use strict";

// Befristeter Nurleser fuer den tatsaechlich gestarteten Test. Keine Freigabe
// fuer Textmodelle, Urteilsimporte, Profilwrites oder einen alten Einzelauftrag.
const A = require("node:assert/strict");
const { hash, ALLE_KENNUNGEN } = require("./testkohorte-direkt500");
const { berlinTagKey } = require("./briefing-frische");
const Z = require("./testnachweis-ziel500");
const BEGINN = "2026-09-15T11:16:15.844Z";
const ENDE = "2026-09-16T11:00:00.000Z";
// Hash der unabhaengig gelesenen 495 synthetischen und fuenf bestehenden IDs.
const ZIELHASH = "dda70a02c9918d73a7ae45b7ab4febd6bae5a1df0a4d3fc65b9a260c62bcdfc6";

function pruefeBestand(profile) {
  A(Array.isArray(profile) && profile.length === 504);
  A(profile.every(p => typeof p?.id === "string" && typeof p.profileActive === "boolean"));
  A.equal(new Set(profile.map(p => p.id)).size, 504);
  const ziel = profile.filter(p => p.profileActive).map(p => p.id).sort();
  A.equal(ziel.length, 500); A.equal(hash(ziel), ZIELHASH);
  A(ALLE_KENNUNGEN.every(id => ziel.includes(id)));
  return ziel;
}

// Neue Fenster werden ausschliesslich aus einer gespeicherten, bereits aktivierten
// Quittung gelesen. Kein neues Datum schaltet den alten Einzelauftrag wieder frei.
function aktiveFensterGrenzen(quittung, { laufId, commit, tag, now }) {
  const q = Z.pruefeQuittung([{ id: Z.schluessel(laufId), data: quittung }], laufId);
  A.equal(q.zustand, "aktiv"); A.equal(q.manifest.productionCommit, commit);
  A(now.getTime() >= Date.parse(q.aktiviertAm) && now.getTime() < Date.parse(q.manifest.endeAm));
  A.equal(tag, berlinTagKey(now)); A.equal(tag, berlinTagKey(new Date(q.aktiviertAm)));
  return { zielHash: q.manifest.zielHash, testende: q.manifest.endeAm, testfenster: laufId };
}

async function erfasse({ userId, tag, expectedCommit, commit, production, config,
  storage, build, testfensterId, env = process.env, fetchFn = global.fetch, get,
  now = () => new Date(), pruefeZielbestand = pruefeBestand }) {
  A.equal(production, true); A.match(commit || "", /^[a-f0-9]{40}$/);
  A.equal(expectedCommit, commit);
  storage.assertTenant(userId, "briefingPruefaufnahme500");
  const start = now();
  const lesen = get || require("./testkohorte-textnachlauf").getReader(env, fetchFn);
  let fenster = null;
  const leseFenster = async () => {
    if (testfensterId === undefined) return;
    const id = Z.schluessel(testfensterId);
    const q = Z.pruefeQuittung(await lesen("helmut_store?select=id,data&id=eq." + id + "&limit=2"), testfensterId);
    if (fenster) Z.gleich(fenster, q);
    fenster = q;
  };
  await leseFenster();
  const pruefeZeit = () => {
    if (fenster) return aktiveFensterGrenzen(fenster, { laufId: testfensterId, commit, tag, now: now() });
    const t = now();
    A(t.getTime() >= Date.parse(BEGINN) && t.getTime() < Date.parse(ENDE));
    A.equal(tag, berlinTagKey(t));
  };
  pruefeZeit();
  const pruefeConfig = () => {
    const c = config();
    A.equal(c.production, true); A.equal(c.commit, commit);
    for (const k of ["storageSupabase", "v3Bereit", "profileRelational", "profileExclusive",
      "kommunikationGesperrt", "kohortenQuellenGesperrt", "atomicLock"]) A.equal(c[k], true);
    if (fenster) A.equal(c.test500PruefaufnahmeFensterVersion, 1);
    A.equal(c.testKosten?.version, 2); A.equal(c.testKosten.aktiv, true);
    A.equal(c.testKosten.limitUsd, 4); A.equal(c.testKosten.unbekanntBleibtReserviert, true);
  };
  pruefeConfig();
  const ruhe = async () => {
    await leseFenster();
    pruefeZeit(); pruefeConfig();
    const iso = encodeURIComponent(now().toISOString());
    const rows = await Promise.all([
      lesen("pipeline_locks?select=job_name&expires_at=gt." + iso + "&limit=1"),
      lesen("helmut_jobs?select=id&lease_expires_at=gt." + iso + "&limit=1"),
      lesen("helmut_jobs?select=id&status=eq.laeuft&or=(lease_expires_at.is.null,lease_expires_at.lt." + iso + ")&limit=1"),
      lesen("process_runs?select=run_id&status=eq.running&started_at=gte."
        + encodeURIComponent(new Date(now().getTime() - 10 * 60000).toISOString()) + "&limit=1")
    ]);
    A(rows.every(r => Array.isArray(r) && r.length === 0));
  };
  await ruhe();
  const alle = await storage.listFullProfiles();
  const pruefeBestandFuerFenster = rows => {
    if (!fenster) return pruefeZielbestand(rows);
    const ziel = Z.auswahl(rows.map(p => ({ user_id: p.id, aktiv: p.profileActive })), fenster);
    A.equal(hash(rows.filter(p => p.profileActive).map(p => p.id).sort()), hash(ziel));
    return ziel;
  };
  const ziel = pruefeBestandFuerFenster(alle);
  A(ziel.includes(userId));
  const profile = await storage.getProfile(userId);
  A.equal(profile?.id, userId); A.equal(profile.profileActive, true);
  A.equal(hash(profile), hash(alle.find(p => p.id === userId)));
  const result = await build(profile, userId, { aussagenEingabe: true, now: start });
  A.equal(result?.eingabe?.mandat, userId); A.equal(result.eingabe.tag, tag);
  A.match(result.eingabe.eingabeHash || "", /^[a-f0-9]{64}$/);
  A(result.korrekturBasis && Array.isArray(result.korrekturBasis.kos));
  await ruhe();
  // Zwei gleiche Eingaben sind ein konkreter Lesebeleg, kein DB-Snapshot.
  const nochmal = await build(profile, userId, { aussagenEingabe: true, now: start });
  A.equal(hash(nochmal), hash(result));
  A.equal(hash(await storage.getProfile(userId)), hash(profile));
  const nachher = await storage.listFullProfiles();
  pruefeBestandFuerFenster(nachher); A.equal(hash(nachher), hash(alle));
  await ruhe();
  return { version: 1, art: "production-briefing-eingabe-500", productionCommit: commit,
    erfasstAm: start.toISOString(), reinLesend: true, modellaufrufe: 0, schreibaufrufe: 0,
    ziel: 500, ...(fenster ? pruefeZeit() : { zielHash: ZIELHASH, testende: ENDE }), transaktionalerSnapshot: false,
    fachlicheFreigabe: false, funktionsnachweis500: false, profile, result };
}

module.exports = { BEGINN, ENDE, ZIELHASH, pruefeBestand, aktiveFensterGrenzen, erfasse };
