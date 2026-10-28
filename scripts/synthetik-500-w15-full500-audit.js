"use strict";

// Post-run read-only SQL and unchanged persisted-content validators. Nothing
// dispatches, activates, retries, repairs data or claims real model quality.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const crypto = require("node:crypto"), { spawnSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, ".."), STATE = "/tmp/w15-full500-20261028c/state";
const DB = "helmut_w15_full500_20261028b", EXPECTED = 500, CHECKS = 34;
const literal = x => "'" + String(x).replaceAll("'", "''") + "'";
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
const P = require("../lib/helmut/synthetik-500-profile");
const B = require("../lib/helmut/briefing-speicher"), L = require("../lib/helmut/briefing-lauf");
function input(name) {
  const filename = path.join(STATE, name), stat = fs.lstatSync(filename);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid() && (stat.mode & 511) === 384);
  assert(stat.size > 0 && stat.size <= 32 * 1024 ** 2, "audit-input-cap");
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}
function query(sql) {
  const r = spawnSync("psql", ["-X", "-w", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DB, "-f", "-"], {
    input: "begin transaction isolation level repeatable read read only;set local statement_timeout='15s';set local lock_timeout='3s';"
      + sql + "rollback;", encoding: "utf8", timeout: 20000, maxBuffer: 24 * 1024 ** 2,
    env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" }
  });
  assert.equal(r.status, 0, "audit-readonly-sql"); return JSON.parse(r.stdout.trim());
}
const report = { schema: "helmut-w15-full500-independent-results/1", status: "UNKNOWN", database: DB,
  checkedAtUTC: new Date().toISOString(), unitChecksRequired: EXPECTED * CHECKS, checksPerUnit: CHECKS,
  unitChecksCompleted: 0, passedChecks: 0, failedChecks: 0, units: [], positions: [],
  categories: { missing: 0, empty: 0, duplicate: 0, technicallyInvalid: 0, unusable: 0 },
  classification: "Position flags may overlap; every flag is counted separately. No missing/invalid position is omitted.",
  actualStoredRows: 0, storedPrivateDraftReviewRows: 0, databaseWrites: 0, profileActivations: 0,
  unitExecutions: 0, providerCalls: 0, actualModelOutput: false, realModelQualityAccepted: false,
  professionalStatus: "pending", professionalOrProductionAcceptance: false, overallPerformanceAcceptance: false,
  scope: "All500 post-run SQL readback and pure stored-content checks only; local synthetic mock outputs" };

function main() {
  const guard = require.resolve("./lokaler-netzschutz");
  assert(require.cache[guard] && require(guard).pruefe(process.env).length === 0, "audit-network-guard");
  assert(!process.env.HELMUT_SYNTHETIK500_CONTENT_PRIVATE_KEY, "audit-no-signing-key");
  const m = input("processing-materials.PRIVATE.json"), config = input("configuration.PRIVATE.json");
  const inputs = input("audit-inputs.PRIVATE.json"), fixtures = input("mock-fixtures.PRIVATE.json");
  assert.equal(config.database, DB); assert.equal(m.database, DB);
  assert.match(m.selector.operationId, /^synthetik500-w15-full500-[0-9]+$/);
  assert.match(m.selector.commandHash, /^[a-f0-9]{64}$/);
  assert.equal(inputs.length, EXPECTED); assert.equal(fixtures.length, EXPECTED);
  assert.equal(new Set(inputs.map(x => x.owner)).size, EXPECTED);
  assert(inputs.every((x, i) => x.index === i && x.owner === x.profile?.id && x.profile.synthetisch === true
    && fixtures[i].index === i && fixtures[i].owner === x.owner && /^[a-f0-9]{64}$/.test(x.briefingEingabeHash)));
  const day = require("../lib/helmut/briefing-frische").berlinTagKey(new Date(m.startsAtUTC));
  const opID = m.selector.operationId, opExpr = "data->'synthetik500DispatchJournal'->'operations'->" + literal(opID);
  const snapshot = () => query("select jsonb_build_object('database',current_database(),"
    + "'active',(select count(*)from mandate_profiles where aktiv),'authHash',encode(sha256(convert_to(data::text,'UTF8')),'hex'),"
    + "'journal',jsonb_build_object('operationId'," + opExpr + "->>'operationId','commandHash'," + opExpr
    + "->>'commandHash','state'," + opExpr + "->>'state','index'," + opExpr + "->'index','inFlight'," + opExpr
    + "->'inFlight','outputs',(select count(*)from jsonb_object_keys(" + opExpr + "->'outputs'))),'slot',data->'synthetik500KostenAdmission')"
    + "from helmut_store where id='main-auth';");
  const before = snapshot();
  assert(before.database === DB && before.active === 0, "audit-requires-safe-zero");
  let runtime;
  try {
    runtime = input("FULL500_RUNTIME_RESULT.SAFE.json");
    report.runtimeObservation = { status: "PASS", source: "FULL500_RUNTIME_RESULT.SAFE.json" };
  } catch {
    try {
      runtime = input("FULL500_RUNTIME_FAILURE.SAFE.json");
      report.runtimeObservation = { status: "PASS", source: "FULL500_RUNTIME_FAILURE.SAFE.json",
        successfulRuntimeClaimed: false };
    } catch {
      // An OOM may prevent the runtime from writing either receipt. Continue
      // after safe native shutdown: no observation is invented, and every
      // expected position still receives independent readback/classification.
      runtime = { unitReports: [], selector: m.selector };
      report.runtimeObservation = { status: "FAIL", source: null, reason: "missing-or-unreadable-runtime-observation" };
    }
  }
  const slotValid = before.slot?.planHash === m.planHash && P.hash(before.slot.plan) === m.planHash
    && before.slot.plan.operationId === opID;
  // One current native ended-state observation; later Auth equality detects any
  // mutation during the bounded per-unit readback. No old signature is reused.
  const native = query("set local role service_role;select public.helmut_synthetik500_lesung("
    + [opID, m.runtimeManifestHash, m.productionCommit].map(literal).join(",") + ");");
  const nativeValid = native.operationId === opID && native.manifestHash === m.runtimeManifestHash
    && native.zustand === "beendet" && native.aktiv === 0 && native.gesamt === EXPECTED && native.identitaeten === 501
    && native.fachfelderUnveraendert === true && native.quittungBindungBestaetigt === true;
  Object.assign(report, { selector: m.selector, runId: m.runId, planHash: m.planHash, berlinDay: day,
    activeProfiles: before.active, nativeEndState: native.zustand, authHashBefore: before.authHash });

  for (const row of inputs) {
    const index = row.index, owner = row.owner, fixture = fixtures[index];
    const unit = { index, owner, checks: [], results: [] };
    const flags = Object.fromEntries(P.BEREICHE.map(area => [area, new Set()]));
    const check = (name, test, category = "technicallyInvalid", areas = P.BEREICHE) => {
      let ok = false; try { ok = test() === true; } catch { /* A pure validator rejection remains a failed check. */ }
      unit.checks.push({ name, status: ok ? "PASS" : "FAIL" });
      if (!ok) for (const area of areas) flags[area].add(category);
      return ok;
    };
    try {
      const evidenceID = "synthetik500-evidence-" + opID + "-" + index;
      const ids = P.BEREICHE.map(a => "bf-" + owner + "-" + (a === "morgenbriefing" ? L.SLOT_ERFOLG : a) + "-" + day);
      const data = query("with a as(select data," + opExpr + " op from helmut_store where id='main-auth')"
        + "select jsonb_build_object('database',current_database(),'active',(select count(*)from mandate_profiles where aktiv),"
        + "'unit',op->'units'->" + index + ",'output',op->'outputs'->" + literal(String(index)) + ","
        + "'attempts',(select coalesce(jsonb_agg(value),'[]'::jsonb)from jsonb_each(op->'attempts')"
        + "where key in(select jsonb_array_elements_text(op->'units'->" + index + "->'intentIds'))),"
        + "'evidence',(select data from helmut_store where id=" + literal(evidenceID) + "),"
        + "'briefings',(select coalesce(jsonb_agg(to_jsonb(b)order by id),'[]'::jsonb)from briefings b where user_id=" + literal(owner)
        + "and(id in(" + ids.map(literal).join(",") + ")or(slot in('mandatsbriefing','morgenlage','lage')and generated_at>="
        + literal(m.startsAtUTC) + "::timestamptz and generated_at<" + literal(m.endsAtUTC) + "::timestamptz)"
        + "or(slot='lage-pruefentwurf'and payload->>'runId'=" + literal(m.runId) + "))))from a;");
      const e = data.evidence, output = data.output, actual = {};
      const positions = Array.isArray(e?.positions) ? e.positions : [];
      check("zero active profiles in exact database", () => data.database === DB && data.active === 0);
      check("journal and plan bind observed command", () => slotValid && before.journal.operationId === opID
        && before.journal.commandHash === m.selector.commandHash);
      check("unit finished with exactly two accounted attempts", () => data.unit?.entered === true && data.unit.subject === owner
        && data.attempts.length === 2 && data.attempts.every(a => a.status === "accounted") && !!output);
      check("full retained evidence matches journal canonical hash", () => e?.operationId === opID
        && e.commandHash === m.selector.commandHash && e.index === index && P.hash(e) === output.resultHash);
      check("three retained positions await professional acceptance", () => positions.length === 3
        && new Set(positions.map(p => p.bereich)).size === 3 && P.BEREICHE.every(a => positions.some(p => p.bereich === a))
        && positions.every(p => p.mandatsId === owner && p.status === "stored-unreviewed" && p.fachstatus === "ausstehend"));
      for (const area of P.BEREICHE) {
        const slotName = area === "morgenbriefing" ? L.SLOT_ERFOLG : area, id = "bf-" + owner + "-" + slotName + "-" + day;
        const found = data.briefings.filter(r => r.slot === slotName), position = positions.find(p => p.bereich === area), r = found[0];
        if (!found.length) flags[area].add("missing");
        if (found.length > 1 || positions.filter(p => p.bereich === area).length > 1) flags[area].add("duplicate");
        if (r && (!r.payload || !Object.keys(r.payload).length)) flags[area].add("empty");
        actual[area] = r;
        check(area + ": exactly one native row", () => found.length === 1, "technicallyInvalid", [area]);
        check(area + ": identity and real creation window", () => r?.id === id && r.user_id === owner && r.slot === slotName
          && Date.parse(r.generated_at) >= Date.parse(m.startsAtUTC) && Date.parse(r.generated_at) < Date.parse(m.endsAtUTC), "technicallyInvalid", [area]);
        check(area + ": complete native row equals retained row", () => !!position && P.hash(r) === P.hash(position.row), "technicallyInvalid", [area]);
        check(area + ": canonical native row equals position hash", () => !!r && P.hash(r) === position.ergebnisHash, "technicallyInvalid", [area]);
        check(area + ": journal position binds same result", () => output.positions.some(p => p.bereich === area
          && p.ergebnisHash === position.ergebnisHash && p.mandatsId === owner), "technicallyInvalid", [area]);
        if (r) { report.actualStoredRows += found.length; unit.results.push({ area, id, canonicalHash: P.hash(r), professionalStatus: "pending" }); }
      }
      check("mandate profile and structural validator", () => {
        B.pruefeZeile(actual.mandatsbriefing, { userId: owner, day, profile: row.profile });
        return actual.mandatsbriefing.payload.pruefung.strukturellVollstaendig === true;
      }, "unusable", ["mandatsbriefing"]);
      check("morning receipt binds successful complete mandate output", () => {
        const morning = L.ausZeile(actual.morgenbriefing, { tenantId: owner, tagKey: day });
        return morning?.status === L.STATUS_ERFOLG && morning.fensterStart === m.startsAtUTC
          && require("../lib/helmut/briefing-ausgabebeleg").passt(morning.ausgabeBeleg, actual.mandatsbriefing);
      }, "unusable", ["morgenbriefing"]);
      const lage = actual.lage?.payload;
      check("Lage input hash and mandate payload agree", () => lage?.briefingEingabeHash === row.briefingEingabeHash
        && P.hash(lage) === P.hash(actual.mandatsbriefing.payload.lage), "technicallyInvalid", ["lage", "mandatsbriefing"]);
      check("stored Lage source and paragraph validator", () => require("../lib/helmut/lage-quellenbeleg").gespeicherterTextGueltig(lage) === true, "unusable", ["lage"]);
      for (const [phase, key] of [["entwurf", "draft"], ["pruefung", "review"]]) {
        const id = "bf-" + owner + "-lage-pruefentwurf-" + day + "-" + m.runId + "-" + phase;
        const found = data.briefings.filter(r => r.id === id);
        report.storedPrivateDraftReviewRows += found.length;
        check(phase + ": exactly one private receipt", () => found.length === 1);
        check(phase + ": retained artifact and canonical receipt agree", () => {
          const r = found[0], p = r.payload, { inhaltHash, ...content } = p;
          return P.hash(r) === P.hash(e.artifacts[key]) && B.hash(content) === inhaltHash
            && r.user_id === owner && p.runId === m.runId && p.phase === phase && p.auslieferbar === false && p.qualitaetBestanden === false;
        });
      }
      check("unchanged D review reproduces stored Lage", () => {
        const d = e.artifacts.draft.payload, r = e.artifacts.review.payload;
        const derived = require("../lib/helmut/ai").prepareLageReviewInput(d.antwort, d.quellen, row.profile);
        const verdict = require("../lib/helmut/lage-textqualitaet").pruefe(derived.paragraphs, d.quellen, r.antwort, row.profile);
        return verdict.ok === true && P.hash(verdict.paragraphs) === P.hash(lage.paragraphs);
      }, "unusable");
      check("native RPC independently confirms ended zero", () => nativeValid);
      check("sixteen original fresh controls belong to this unit", () => {
        const controls = runtime.unitReports?.filter(x => x.index === index);
        if (runtime.selector?.operationId !== opID || runtime.selector.commandHash !== m.selector.commandHash || controls?.length !== 1) return false;
        const u = controls[0], points = u.checkpoints;
        return u.owner === owner && u.original16FreshControls === true && Array.isArray(points) && points.length === 16
          && points.filter(p => p.kind === "load").length === 10 && points.filter(p => p.kind === "admission").length === 6
          && points.every(p => Number.isSafeInteger(p.observedAt) && p.observedAt > 0)
          && points.every((p, i) => i === 0 || p.observedAt >= points[i - 1].observedAt);
      });
      check("all three persisted payloads are nonempty", () => P.BEREICHE.every(a => actual[a]?.payload && Object.keys(actual[a].payload).length > 0));
      check("D and R artifacts equal exact bound mock outputs", () => P.hash(e.artifacts.draft.payload.antwort) === P.hash(fixture.draftOutput)
        && P.hash(e.artifacts.review.payload.antwort) === P.hash(fixture.reviewOutput));
      check("all500 journal closed without in-flight work", () => before.journal.state === "closed" && before.journal.index === EXPECTED
        && before.journal.inFlight === null && before.journal.outputs === EXPECTED);
    } catch {
      unit.queryOrReadbackFailure = true;
      for (const area of P.BEREICHE) flags[area].add("technicallyInvalid");
    }
    // A malformed unit does not suppress remaining units or their categories.
    while (unit.checks.length < CHECKS) unit.checks.push({ name: "unavailable-check-" + unit.checks.length, status: "UNKNOWN" });
    assert.equal(unit.checks.length, CHECKS, "audit-check-cardinality");
    const failed = unit.checks.filter(c => c.status !== "PASS");
    report.unitChecksCompleted += unit.checks.length; report.failedChecks += failed.length;
    report.passedChecks += unit.checks.length - failed.length;
    for (const area of P.BEREICHE) {
      const categories = [...flags[area]];
      for (const category of categories) report.categories[category]++;
      report.positions.push({ index, owner, area, categories, status: categories.length ? "failed" : "stored-unreviewed", professionalStatus: "pending" });
    }
    report.units.push({ index, owner, checks: unit.checks.length, failedChecks: failed,
      passedChecks: unit.checks.length - failed.length, results: unit.results, queryOrReadbackFailure: Boolean(unit.queryOrReadbackFailure) });
  }
  const after = snapshot();
  report.authHashAfter = after.authHash; report.authUnchangedDuringAudit = before.authHash === after.authHash && after.active === 0;
  report.positionCount = report.positions.length;
  report.storedResultsAccepted = report.failedChecks === 0 && report.unitChecksCompleted === EXPECTED * CHECKS
    && report.positionCount === 1500 && report.actualStoredRows === 1500 && report.storedPrivateDraftReviewRows === 1000
    && report.authUnchangedDuringAudit && report.runtimeObservation.status === "PASS";
  report.status = report.storedResultsAccepted ? "PASS_ALL500_STORED_MOCK_RESULTS_ONLY" : "FAIL_OR_UNKNOWN_ALL500_READBACK";
  report.full500Proof = false; // This independent result audit does not replace performance/control acceptance.
}

if (require.main === module) {
  try { main(); } catch (error) { report.status = "FAIL_OR_UNKNOWN_AUDIT_PREREQUISITE"; report.failureType = error.name; }
  report.completedAtUTC = new Date().toISOString();
  const bytes = JSON.stringify(report, null, 2) + "\n";
  fs.writeFileSync(path.join(STATE, "RESULTS_INDEPENDENT.SAFE.json"), bytes, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ status: report.status, checks: report.unitChecksCompleted, categories: report.categories, reportSHA256: sha(bytes) }));
  if (!report.storedResultsAccepted) process.exitCode = 1;
}
module.exports = { main };
