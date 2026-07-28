"use strict";

// Sprint 23B-1 — algorithmusunabhaengige Audit-Schnittstelle fuer Matching-Laeufe.
//
// ZWECK: Ein Matching-Lauf wird nachvollziehbar protokolliert, ohne dass diese
// Schicht weiss, WIE gerechnet wurde. Sie nimmt eine fachliche Laufbeschreibung
// entgegen (Mandant, Profilkennung, Profilhash, Engine-/Rezept-/Vektorversion,
// Schwellenwerte, Kandidatenfingerabdruck, berechnete Rangliste) und kuemmert
// sich um Sperre, Idempotenz, Laufzeile, Veroeffentlichung und Ablaufzustand.
//
// ABGRENZUNG — was diese Schicht NICHT kennt und NIE kennen darf:
//   * kein Merkmalsvektor, keine Kosinusrechnung, kein Ranking-Verfahren
//   * KEIN Bezug zu knowledge_object_embeddings, zu semantischer Aehnlichkeit
//     oder zu Duplikaterkennung. Semantische Naehe beantwortet „ist das
//     derselbe Vorgang?", das Matching „betrifft das dieses Mandat?" — beides
//     wird hier nicht vermischt und nicht gemeinsam gespeichert.
//   * keine KI, kein Netz ausser dem Storage-Pfad, keine Kosten.
// Eine kuenftige Matching-Engine benutzt exakt dieselbe Schnittstelle mit
// eigenen Versionswerten.
//
// ROLLOUT-GRENZE: Standardmaessig AUS. Ohne HELMUT_MATCHING_AUDIT findet kein
// einziger Aufruf statt — kein Lesezugriff, kein Schreibzugriff, keine neue
// Fehlerquelle. Aktivierung ist eine Freigabeentscheidung (CLAUDE.md §5).
//
// FEHLERPOLITIK (bewusst, „Datenintegritaet vor falschem Gruen"):
//   * Fehler VOR der Veroeffentlichung -> der Lauf wird ABGEBROCHEN. Es wird
//     nichts veroeffentlicht; der letzte vollstaendige Stand bleibt unberuehrt.
//     Ein stiller Weiterlauf haette eine unbelegbare Generation erzeugt.
//   * Fehler NACH der Veroeffentlichung -> die Ergebnisse stehen (wie bisher),
//     der Lauf wird als 'fehlgeschlagen' markiert und gilt damit NIE als
//     aktueller, reproduzierbarer Stand.
//   * Ein Auditfehler veraendert NIE einen Aehnlichkeitswert, einen Rang, ein
//     matched_feature oder die Kandidatenauswahl.

const contract = require("./matching-contract");

const LOCK_PREFIX = "matching-";

// Sperrdauer je Lauf. Ein Matching-Lauf dauert Sekunden; 5 Minuten sind
// grosszuegig genug fuer einen langsamen Lauf und kurz genug, dass ein Absturz
// den naechsten Cron nicht blockiert (der Lock laeuft von selbst ab).
const LOCK_TTL_MS = 5 * 60 * 1000;

class AuditTenantError extends Error {
  constructor(fn, detail) {
    super(`[matching-audit] ${fn}: mandantenuebergreifender Schreibversuch blockiert${detail ? " (" + detail + ")" : ""}`);
    this.name = "AuditTenantError";
    this.code = "CROSS_TENANT_WRITE";
  }
}

function defaultDeps() {
  const storage = require("./storage");
  return {
    enabled: () => storage.matchingAuditEnabled(),
    acquireLock: (name, ttl) => storage.acquirePipelineLock(name, ttl),
    releaseLock: (name) => storage.releasePipelineLock(name),
    findCompletedRun: (p) => storage.getCompletedMatchingRun(p),
    insertRun: (row) => storage.saveMatchingRun(row),
    patchRun: (id, patch, userId) => storage.updateMatchingRun(id, patch, userId),
    // EIN Aufruf, EINE Transaktion: Laufabschluss + Projektion + Abloesung.
    publishRun: (p) => storage.publishMatchingRun(p),
    // Ersetzbarer Haken statt fester Annahme: heute traegt ein Mandant genau
    // EIN Profil, dessen Kennung mit der Mandantenkennung identisch ist
    // (mandate_profiles.PK = user_id, Sprint 23A §6a). Sobald Profile eigene
    // Kennungen bekommen, wird hier ein Resolver eingehaengt — die
    // Auditstruktur selbst muss dafuer nicht geaendert werden.
    profileBelongsToTenant: (profileId, tenantId) => String(profileId) === String(tenantId),
    now: () => new Date(),
    randomSuffix: () => require("crypto").randomBytes(4).toString("hex")
  };
}

function enabled(overrides = {}) {
  const deps = overrides.enabled ? overrides : defaultDeps();
  try {
    return deps.enabled() === true;
  } catch (_) {
    return false;
  }
}

// Sperrname je Mandant/Profil. Enthaelt ausschliesslich die uebergebene
// Kennung — keine feste Bindung an irgendeinen konkreten Mandanten.
function lockName(tenantId) {
  return `${LOCK_PREFIX}${String(tenantId == null ? "" : tenantId)}`;
}

// Laufkennung. Der Zufallsanteil macht sie eindeutig; er geht NICHT in den
// Eingabefingerabdruck ein und kann die Idempotenz deshalb nicht stoeren.
function newRunId(tenantId, startedAt, suffix) {
  const iso = (startedAt instanceof Date ? startedAt : new Date(startedAt || Date.now()))
    .toISOString().replace(/[-:T.]/g, "").slice(0, 14);
  return `mrun-${String(tenantId)}-${iso}-${suffix}`;
}

async function acquireRunLock(tenantId, overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  return deps.acquireLock(lockName(tenantId), LOCK_TTL_MS);
}

async function releaseRunLock(tenantId, overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  return deps.releaseLock(lockName(tenantId));
}

// Harte Mandanten-/Profilpruefung. Wird VOR jedem Schreibvorgang aufgerufen und
// lehnt fremde Kennungen ab, statt sie stillschweigend zu schreiben.
function assertOwnRun(descriptor, deps) {
  if (!descriptor || !descriptor.tenantId) {
    throw new AuditTenantError("auditRun", "kein Mandant");
  }
  if (!deps.profileBelongsToTenant(descriptor.mandateProfileId, descriptor.tenantId)) {
    throw new AuditTenantError(
      "auditRun",
      `Profil ${descriptor.mandateProfileId} gehoert nicht zu Mandant ${descriptor.tenantId}`
    );
  }
}

function runRowFrom(descriptor, runId, startedAt) {
  return {
    id: runId,
    user_id: descriptor.tenantId,
    mandate_profile_id: descriptor.mandateProfileId,
    pipeline_run_id: descriptor.pipelineRunId || null,
    ausloeser: descriptor.ausloeser,
    engine_version: descriptor.engineVersion,
    rezept_version: descriptor.recipeVersion,
    vektor_version: descriptor.vectorVersion,
    profil_hash: descriptor.profileHash,
    kandidaten_hash: descriptor.kandidatenHash,
    schwellenwerte: descriptor.thresholds,
    eingabe_fingerabdruck: descriptor.fingerprint,
    gestartet_am: startedAt.toISOString(),
    beendet_am: null,
    status: contract.RUN_STATUS.LAUFEND,
    fehler: null,
    kandidaten: descriptor.kandidaten,
    berechnet: descriptor.berechnet,
    veroeffentlicht: 0,
    abgeloest: 0,
    ergebnis: descriptor.ranking,
    wiederholungen: 0,
    letzter_lauf_at: startedAt.toISOString(),
    wiederaufnahme_am: null
  };
}

// ── Der vollstaendige Auditlebenszyklus eines Laufs ──────────────────────────
//
// `input` = fachliche Laufbeschreibung (siehe matching-contract.describeRun)
//           plus `buildRows`: eine REINE Funktion ({runId, descriptor}) => Zeilen,
//           die die operative Projektion baut. Sie darf nichts schreiben und
//           nichts lesen — die Audit-Schicht ruft sie erst auf, wenn die
//           Laufkennung feststeht, und uebergibt das Ergebnis unveraendert an
//           die atomare Veroeffentlichung. Die Audit-Schicht interpretiert die
//           Zeilen NICHT fachlich; sie prueft ausschliesslich Mandant und
//           Laufbezug.
//
// ABLAUF:
//   1. Idempotenzpruefung   (nur gegen VOLLSTAENDIGE Laeufe)
//   2. Laufzeile anlegen    (status='laufend' — veroeffentlicht NICHTS)
//   3. Zeilen bauen         (rein, ohne Datenbank)
//   4. VEROEFFENTLICHEN     EIN Aufruf = EINE Transaktion:
//                           Laufabschluss + Projektion + Abloesung
//
// WARUM SCHRITT 4 EINE ECHTE TRANSAKTION SEIN MUSS: matching_results wird in
// place ueberschrieben. Waeren Projektion und Laufabschluss zwei unabhaengige
// Schreibvorgaenge, haette ein Abbruch dazwischen den letzten vollstaendigen
// Stand bereits zerstoert — in JEDER Reihenfolge. Eine blosse Abfolge ist
// deshalb NICHT atomar und genuegt hier nicht.
//
// GARANTIEN nach Schritt 4:
//   * Entweder ist der Lauf 'vollstaendig' UND die Projektion veroeffentlicht
//     UND die Abloesung markiert — oder nichts davon.
//   * Eine matching_results-Zeile kann NIE auf einen laufenden oder
//     fehlgeschlagenen Lauf verweisen (Riegel matching_results_run_complete).
//   * Bricht irgendetwas ab, bleibt die vorherige vollstaendige Generation
//     unveraendert die aktuelle.
//
// Die Funktion ist SECURITY INVOKER: sie zieht nur eine Transaktionsgrenze und
// verleiht keine Rechte. service_role umgeht RLS ohnehin — durchsetzend sind
// die Pruefungen in der Funktion UND die App-Guards davor.
async function auditRun(input, overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  const startedAt = input && input.startedAt ? new Date(input.startedAt) : deps.now();
  const descriptor = contract.describeRun(input);
  assertOwnRun(descriptor, deps);

  // ── Idempotenz ────────────────────────────────────────────────────────────
  // Gesucht wird ausschliesslich ein VOLLSTAENDIGER Lauf mit demselben
  // Fingerabdruck. Ein 'laufend' oder 'fehlgeschlagen' stehengebliebener Lauf
  // zaehlt bewusst NICHT als Treffer — sonst wuerde ein abgebrochener Lauf
  // einen unvollstaendigen Stand als aktuell zementieren.
  const vorhanden = await deps.findCompletedRun({
    userId: descriptor.tenantId,
    fingerprint: descriptor.fingerprint
  });

  if (vorhanden && vorhanden.id) {
    // Identischer Eingang: KEINE neue Generation, KEIN Schreibvorgang auf
    // matching_results, kein neues berechnet_am, kein neues updated_at.
    // Fortgeschrieben werden ausschliesslich die technischen Wiederholungs-
    // metadaten — das ist der einzige Schreibvorgang des gesamten Laufs.
    await deps.patchRun(vorhanden.id, {
      wiederholungen: Number(vorhanden.wiederholungen || 0) + 1,
      letzter_lauf_at: startedAt.toISOString()
    }, descriptor.tenantId);
    return {
      idempotent: true,
      runId: vorhanden.id,
      status: contract.RUN_STATUS.VOLLSTAENDIG,
      fingerprint: descriptor.fingerprint,
      veroeffentlicht: 0,
      abgeloest: 0,
      wiederholungen: Number(vorhanden.wiederholungen || 0) + 1
    };
  }

  // ── 2 · Laufzeile anlegen ─────────────────────────────────────────────────
  // Sie veroeffentlicht NICHTS: solange ihr Status 'laufend' ist, darf keine
  // einzige Ergebniszeile auf sie verweisen (datenbankseitig erzwungen).
  // Schlaegt das Anlegen fehl, ist nichts geschehen.
  const runId = newRunId(descriptor.tenantId, startedAt, deps.randomSuffix());
  const run = runRowFrom(descriptor, runId, startedAt);
  await deps.insertRun(run);

  try {
    // ── 3 · Projektionszeilen bauen (rein, ohne Datenbank) ──────────────────
    const rows = typeof input.buildRows === "function"
      ? (input.buildRows({ runId, run, descriptor }) || [])
      : [];
    // Mandantenpruefung VOR der Veroeffentlichung. Die Datenbankfunktion
    // wiederholt sie — hier faellt der Fehler nur frueher und deutlicher auf.
    for (const r of rows) {
      if (!r || String(r.user_id || "") !== String(descriptor.tenantId)) {
        throw new AuditTenantError("auditRun(rows)", `erwartet ${descriptor.tenantId}`);
      }
      if (String(r.run_id || "") !== runId) {
        throw new AuditTenantError("auditRun(rows)", `Zeile verweist nicht auf Lauf ${runId}`);
      }
    }

    // ── 4 · ATOMAR veroeffentlichen ─────────────────────────────────────────
    // Ein Aufruf, eine Transaktion: Laufabschluss + Projektion + Abloesung.
    const ergebnis = await deps.publishRun({
      runId,
      userId: descriptor.tenantId,
      rows,
      abgeloestAm: deps.now().toISOString()
    });

    return {
      idempotent: false,
      runId,
      status: contract.RUN_STATUS.VOLLSTAENDIG,
      fingerprint: descriptor.fingerprint,
      veroeffentlicht: Number(ergebnis && ergebnis.veroeffentlicht) || 0,
      abgeloest: Number(ergebnis && ergebnis.abgeloest) || 0,
      wiederholungen: 0
    };
  } catch (error) {
    // Hierher fuehrt JEDER Fehlerweg — und in JEDEM davon ist die
    // Veroeffentlichung entweder gar nicht gestartet oder von der Datenbank
    // vollstaendig zurueckgerollt worden. Die vorherige vollstaendige
    // Generation bleibt damit unveraendert die aktuelle.
    try {
      await deps.patchRun(runId, {
        status: contract.RUN_STATUS.FEHLGESCHLAGEN,
        beendet_am: deps.now().toISOString(),
        fehler: String((error && error.message) || error).slice(0, 500)
      }, descriptor.tenantId);
    } catch (markError) {
      // Auch das Markieren kann scheitern — dann bleibt die Zeile auf
      // 'laufend'. Ebenfalls „nicht veroeffentlicht", also sicher.
      console.error("[matching-audit] Fehlerzustand nicht schreibbar:", markError && markError.message);
    }
    // Nur beschriften, wenn es wirklich ein Fehlerobjekt ist — ein geworfener
    // String wuerde im strict mode sonst an der Zuweisung scheitern und die
    // eigentliche Ursache verdecken.
    if (error && typeof error === "object") {
      error.auditRunId = runId;
      error.auditStatus = contract.RUN_STATUS.FEHLGESCHLAGEN;
      throw error;
    }
    const gehuellt = new Error(`[matching-audit] Lauf ${runId} fehlgeschlagen: ${String(error)}`);
    gehuellt.auditRunId = runId;
    gehuellt.auditStatus = contract.RUN_STATUS.FEHLGESCHLAGEN;
    throw gehuellt;
  }
}

// Wiederaufnahme eines steckengebliebenen Laufs: nur ein Zeitstempel, damit
// sichtbar bleibt, dass jemand ihn erneut angefasst hat. Ein 'laufend'
// gebliebener Lauf wird bewusst NICHT automatisch fortgesetzt — er wird beim
// naechsten regulaeren Lauf schlicht ueberholt, weil er nie als idempotenter
// Treffer zaehlt. Das ist der sichere Weg: neu rechnen ist billig (0 KI),
// einen Teilzustand zu raten waere es nicht.
async function markResumed(runId, userId, overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  return deps.patchRun(runId, { wiederaufnahme_am: deps.now().toISOString() }, userId);
}

module.exports = {
  LOCK_PREFIX,
  LOCK_TTL_MS,
  AuditTenantError,
  defaultDeps,
  enabled,
  lockName,
  newRunId,
  acquireRunLock,
  releaseRunLock,
  auditRun,
  markResumed
};
