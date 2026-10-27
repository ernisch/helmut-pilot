"use strict";

// Local, derived integration-fixture metadata only. Original assertions,
// sources and review texts remain historical; this is no current fachliches
// Urteil, Production acceptance, admission or execution permission.
const A = require("../../lib/helmut/briefing-aussagenbindung");
const F = require("../../lib/helmut/briefing-fachurteil");
const B = require("../../lib/helmut/briefing-lagebindung");
const { berlinTagKey } = require("../../lib/helmut/briefing-frische");
const { hash } = require("../../lib/helmut/briefing-speicher");
const SCOPE = "LOCAL_DERIVED_CURRENT_CALENDAR_TEST_FIXTURE";
const ALLOWED_PATHS = new Set([
  "/briefingDatum",
  "/briefingEingabe/eingabe/tag",
  "/briefingEingabe/eingabe/eingabeHash",
  "/briefingEingabe/urteil/eingabeHash",
  "/briefingEingabe/urteil/gesamtpruefung/umfang/eingabeHash"
]);
const demand = (ok, code) => { if (!ok) throw Error("w15-local-calendar-" + code); };
const pointerPart = key => String(key).replaceAll("~", "~0").replaceAll("/", "~1");

function describeChangedPaths(before, after) {
  const paths = [];
  function walk(a, b, at) {
    if (Object.is(a, b)) return;
    if (!a || !b || typeof a !== "object" || typeof b !== "object"
      || Array.isArray(a) !== Array.isArray(b)) { paths.push(at); return; }
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) {
      const next = at + "/" + pointerPart(key);
      if (!Object.hasOwn(a, key) || !Object.hasOwn(b, key)) paths.push(next);
      else walk(a[key], b[key], next);
    }
  }
  walk(before, after, ""); return paths;
}

function rebindOrdinaryRow(row, executionISO) {
  demand(typeof executionISO === "string", "execution-time-required");
  const execution = new Date(executionISO);
  demand(Number.isFinite(execution.getTime()) && execution.toISOString() === executionISO,
    "canonical-execution-time-required");
  demand(row?.briefingEingabe?.version === 1 && row.profile?.id, "ordinary-v1-required");
  const basis = row.briefingEingabe, originalDay = basis.eingabe?.tag;
  demand(typeof originalDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(originalDay), "original-day-required");
  const originalDate = new Date(originalDay + "T12:00:00.000Z");
  demand(Number.isFinite(originalDate.getTime()) && berlinTagKey(originalDate) === originalDay,
    "valid-original-day-required");
  const executionDay = berlinTagKey(execution);
  demand(executionDay >= originalDay, "backdating-forbidden");
  const originalRowHash = hash(row);

  // B invokes the actual A/F checks, including recorded publication policy,
  // source passages, profile binding and all separate review criteria.
  const originalChecked = B.pruefe(basis, row.profile, row.profile.id, originalDate);
  demand(originalChecked.eingabeHash === basis.eingabe.eingabeHash, "original-binding-mismatch");

  const derived = structuredClone(row), next = derived.briefingEingabe;
  const rebuilt = A.baueEingabe({ briefing: next.briefing,
    sourcesByVorgang: next.korrekturBasis.sourcesByVorgang, profile: derived.profile,
    userId: derived.profile.id, day: executionDay, kos: next.korrekturBasis.kos,
    korrekturHash: next.eingabe.korrekturHash });
  // Rebuilding must differ only in the calendar tag and its derived hash.
  demand(describeChangedPaths(next.eingabe, rebuilt).every(p => p === "/tag" || p === "/eingabeHash"),
    "unexpected-rebuilt-input-change");
  next.eingabe = rebuilt;
  next.urteil.eingabeHash = rebuilt.eingabeHash;
  next.urteil.gesamtpruefung.umfang.eingabeHash = rebuilt.eingabeHash;
  derived.briefingDatum = executionISO;

  demand(A.pruefe(next.eingabe, next.urteil).bereit === true, "derived-statement-binding-rejected");
  demand(F.pruefe(next, next.urteil).bereit === true, "derived-review-binding-rejected");
  const checked = B.pruefe(next, derived.profile, derived.profile.id, execution);
  demand(checked.eingabeHash === rebuilt.eingabeHash, "derived-lage-binding-rejected");
  const changedPaths = describeChangedPaths(row, derived);
  demand(changedPaths.every(p => ALLOWED_PATHS.has(p)), "noncalendar-change-forbidden");
  demand(hash(row) === originalRowHash, "original-mutation-forbidden");
  return { row: derived, report: {
    scope: SCOPE, originalRowHash, derivedRowHash: hash(derived), originalDay, executionDay,
    originalInputHash: basis.eingabe.eingabeHash, derivedInputHash: rebuilt.eingabeHash,
    originalWholeReviewHash: hash(basis.urteil.gesamtpruefung),
    derivedWholeReviewHash: hash(next.urteil.gesamtpruefung), changedPaths,
    originalObjectsUnchanged: true, originalGeneratedAtPreserved: true,
    sourceProfileAndReviewTextsPreserved: true, originAndDisplayHashesPreserved: true,
    additionalHashBindingsChanged: [], currentProfessionalReviewClaimed: false,
    productionAcceptanceClaimed: false, executionRightsIssued: false
  } };
}

module.exports = { rebindOrdinaryRow, describeChangedPaths };
