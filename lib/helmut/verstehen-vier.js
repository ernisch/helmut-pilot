"use strict";

// Einmalige Nacharbeit. Kein allgemeiner Pending-/169er-Lauf und keine Fachlogik.
const crypto = require("node:crypto");
const { understandOneCluster } = require("./understanding");
const { SICHERE_VALIDIERUNGSFEHLER } = require("./verstehen-einzelvorgang");
const QUITTUNG = "verstehen4-20260924-a";
const IDS = Object.freeze([
  "vg-gemeinsame-20260921-dcd0f5",
  "vg-arbeitsplätze-20260715-6cc672",
  "vg-linkenpolitiker-20260921-37cdeb",
  "vg-verzögerung-20230613-95c80f"
]);
const MAX_USD = 0.30, MAX_MS = 20 * 60 * 1000;
function fordere(ok, grund) { if (!ok) throw new Error(grund); }
function stabil(x) {
  if (Array.isArray(x)) return x.map(stabil);
  if (x && typeof x === "object") return Object.fromEntries(Object.keys(x).sort().map(k => [k, stabil(x[k])]));
  return x;
}
const hash = x => crypto.createHash("sha256").update(JSON.stringify(stabil(x))).digest("hex");
function auswahl(ids) {
  fordere(Array.isArray(ids) && ids.length > 0 && ids.length <= 4
    && new Set(ids).size === ids.length && ids.every(id => IDS.includes(id)), "vier-auswahl-ungueltig");
  return IDS.filter(id => ids.includes(id));
}
function pruefeFall(f, id) {
  fordere(f?.cas?.vorgang_id === id && f.ko?.vorgang_id === id && f.ko?.id === "ko-" + id,
    "vier-bestand-fehlt");
  fordere(f.cas.zustand === "unbekannt" && f.cas.besitzer === null && f.cas.lease_bis === null,
    "vier-cas-abweichend");
  fordere(Number.isSafeInteger(f.cas.fencing) && f.cas.fencing > 0
    && Number.isSafeInteger(f.cas.ki_aufrufe) && Number.isSafeInteger(f.cas.versuche),
    "vier-cas-unlesbar");
  fordere(f.ko.verstehen_fencing === null || f.ko.verstehen_fencing < f.cas.fencing,
    "vier-ergebnis-schon-vorhanden");
  fordere(Array.isArray(f.docs) && f.docs.length > 0 && f.docs.length <= 40
    && f.docs.every(d => typeof d.id === "string") && new Set(f.docs.map(d => d.id)).size === f.docs.length,
    "vier-dokumente-unlesbar");
}
async function plane({ ids, deps }) {
  ids = auswahl(ids);
  const profile = await deps.profile();
  fordere(profile.anzahl === 504 && profile.aktiv === 0 && /^[a-f0-9]{64}$/.test(profile.hash),
    "vier-profile-abweichend");
  const faelle = [];
  for (const id of ids) {
    const f = await deps.leseFall(id);
    pruefeFall(f, id);
    faelle.push(f);
  }
  const bindung = { ids, profile, faelle };
  return { ids, profile, faelle, planHash: hash(bindung) };
}
function sichereAntwort(r) {
  return {
    status: /^(saved|updated|skipped-[a-z-]+)$/.test(r?.status || "") ? r.status : "unbekannt",
    validierungsfehler: (Array.isArray(r?.errors) ? r.errors : [])
      .filter(x => typeof x === "string" && SICHERE_VALIDIERUNGSFEHLER.test(x)).slice(0, 5)
  };
}
function uebersicht(p) {
  return { ok: true, reinLesend: true, quittung: QUITTUNG, planHash: p.planHash,
    profile: p.profile.anzahl, aktiv: p.profile.aktiv, maxUsd: MAX_USD, maxMinuten: MAX_MS / 60000,
    faelle: p.faelle.map(f => ({ id: f.cas.vorgang_id, fencing: f.cas.fencing,
      kiAufrufe: f.cas.ki_aufrufe, dokumente: f.docs.length, understandingStatus: f.ko.understanding_status })),
    nichtAusgewaehlt: IDS.filter(id => !p.ids.includes(id)) };
}
async function ausfuehren({ ids, planHash, runtimeCommit, runId, deps, now = Date.now, motor = understandOneCluster }) {
  fordere(/^[a-f0-9]{40}$/.test(runtimeCommit || ""), "vier-runtime-ungueltig");
  fordere(/^verstehen4-[0-9]{5,20}$/.test(runId || ""), "vier-run-id-ungueltig");
  fordere(/^[a-f0-9]{64}$/.test(planHash || ""), "vier-planhash-fehlt");
  const start = now(), deadlineMs = start + MAX_MS;
  const p = await plane({ ids, deps });
  fordere(p.planHash === planHash, "vier-plan-abweichend");
  await deps.voraussetzungen();
  const reserve = await deps.reserveUsd();
  fordere(Number.isFinite(reserve) && reserve > 0 && reserve <= MAX_USD, "vier-reserve-unlesbar");
  const kosten = async () => {
    const n = await deps.kosten(runId);
    fordere(Number.isFinite(n) && n >= 0 && n <= MAX_USD, "vier-kosten-unlesbar-oder-ueber-deckel");
    return n;
  };
  const zeit = () => fordere(now() + 60000 < deadlineMs, "vier-zeitdeckel");
  const grenze = async () => { zeit(); fordere((await kosten()) + reserve <= MAX_USD, "vier-kostendeckel"); };
  await grenze();
  const nonce = crypto.randomUUID();
  let gehalten = false, beansprucht = false, rev = 0;
  const bericht = { version: 1, quittung: QUITTUNG, runId, nonce, runtimeCommit, planHash,
    freigaben: p.faelle.map(f => ({ id: f.cas.vorgang_id, fencing: f.cas.fencing, kiAufrufe: f.cas.ki_aufrufe, versuche: f.cas.versuche, eingabeHash: f.cas.eingabe_hash })),
    ids: p.ids, status: "laeuft", gestartetAm: new Date(start).toISOString(), deadlineMs,
    modellaufrufe: 0, laufkostenUsd: 0, profilwrites: 0, quellenabrufe: 0, kommunikation: 0,
    automatischeWiederholung: false, faelle: [], nichtAusgewaehlt: IDS.filter(id => !p.ids.includes(id)) };
  try {
    const lock = await deps.acquireLock(MAX_MS + 120000);
    fordere(lock?.granted === true && lock.active === true, "vier-sperre-fehlt");
    gehalten = true;
    // Unter dem Lock noch einmal lesen. Freigabe bezieht sich auf genau diesen Stand.
    fordere((await plane({ ids: p.ids, deps })).planHash === planHash, "vier-plan-abweichend");
    await deps.claim({ ...bericht, rev });
    beansprucht = true;
    for (const f of p.faelle) {
      await grenze();
      const id = f.cas.vorgang_id;
      fordere(hash(await deps.leseFall(id)) === hash(f), "vier-fall-abweichend");
      let calls = 0;
      const fallbericht = { id, status: "begonnen", modellaufrufe: 0 };
      bericht.faelle.push(fallbericht);
      const d = deps.motorDeps(f, { runId, nonce, planHash, deadlineMs });
      const original = d.requestUnderstanding;
      fordere(typeof original === "function" && d.verstehenVertrag, "vier-motor-unvollstaendig");
      d.deadlineMs = deadlineMs; // auch der Update-/Vormerkungspfad behaelt die Deadline
      d.requestUnderstanding = async prompt => {
        fordere(calls === 0 && bericht.modellaufrufe < p.ids.length, "vier-aufrufdeckel");
        await grenze();
        calls++; bericht.modellaufrufe++; fallbericht.modellaufrufe = calls;
        return original(prompt);
      };
      const r = await motor({ documents: f.docs, anchors: [] }, d, {
        vorgangId: id, existing: f.ko, wiederaufnahmeFreigabe: true, deadlineMs
      });
      const nach = await deps.leseFall(id);
      const profilNach = await deps.profile();
      bericht.laufkostenUsd = await kosten();
      const result = { id, ...sichereAntwort(r), modellaufrufe: calls, cas: nach.cas.zustand,
        fencing: nach.cas.fencing, kiAufrufe: nach.cas.ki_aufrufe, koFencing: nach.ko.verstehen_fencing,
        understandingStatus: nach.ko.understanding_status, leaseFrei: nach.cas.lease_bis === null
          && nach.cas.besitzer === null, laufkostenUsd: bericht.laufkostenUsd };
      Object.assign(fallbericht, result);
      fordere(hash(nach.docs) === hash(f.docs), "vier-dokumente-veraendert");
      fordere(profilNach.hash === p.profile.hash && profilNach.aktiv === 0, "vier-profilveraenderung");
      fordere(["saved", "updated"].includes(r?.status) && calls === 1
        && nach.cas.zustand === "fertig" && result.leaseFrei
        && nach.cas.fencing === f.cas.fencing + 1 && nach.cas.ergebnis_fencing === nach.cas.fencing
        && nach.cas.ki_aufrufe === f.cas.ki_aufrufe + 1
        && nach.ko.verstehen_fencing === nach.cas.fencing && nach.ko.understanding_status === "complete",
      "vier-ergebnis-nicht-bestaetigt");
      await deps.finish({ ...bericht, rev: rev + 1 }, rev);
      rev++;
    }
    bericht.status = "fertig";
  } catch (e) {
    bericht.status = "gestoppt";
    bericht.grund = /^vier-[a-z-]+$/.test(e?.message || "") ? e.message : "vier-technischer-fehler";
  } finally {
    if (gehalten) {
      try { await deps.releaseLock(); }
      catch (_) { bericht.status = "gestoppt"; bericht.grund = "vier-sperrfreigabe-nicht-bestaetigt"; }
    }
    for (const id of p.ids) if (!bericht.faelle.some(f => f.id === id)) {
      bericht.faelle.push({ id, status: "nicht-begonnen", modellaufrufe: 0 });
    }
    if (beansprucht) {
      try {
        bericht.laufkostenUsd = await kosten();
        fordere((await deps.profile()).hash === p.profile.hash, "vier-profilveraenderung");
      } catch (_) {
        bericht.status = "gestoppt"; bericht.grund = "vier-abschluss-nicht-pruefbar";
        bericht.laufkostenUsd = null;
      }
      bericht.beendetAm = new Date(now()).toISOString();
      try { await deps.finish({ ...bericht, rev: rev + 1 }, rev); }
      catch (_) { bericht.status = "gestoppt"; bericht.grund = "vier-quittung-nicht-bestaetigt"; }
    }
  }
  return { ...bericht, ok: bericht.status === "fertig", reinLesend: false, beansprucht };
}
module.exports = { IDS, QUITTUNG, MAX_USD, MAX_MS, hash, auswahl, plane, uebersicht, ausfuehren };
