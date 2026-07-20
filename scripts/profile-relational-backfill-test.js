"use strict";

// Test fuer den Profil-Backfill Blob -> relational (Stufe C).
// Deterministisch/offline: buildBackfillPlan ist rein; runBackfill nutzt einen
// injizierten Upsert (kein Netz). Prueft Verlustfreiheit, Idempotenz und dass der
// Dry-Run NICHTS schreibt (Preview-Beweislauf ohne Schreibrisiko).

process.env.HELMUT_STORE_CACHE_MS = "0";

const { buildBackfillPlan, runBackfill } = require("./profile-relational-backfill");
const storage = require("../lib/helmut/storage");
const { testPoliticianOne, testPoliticianTwo } = require("./fixtures/test-profiles");

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

(async () => {
  console.log("== 1) buildBackfillPlan: verlustfreie Abbildung ==");
  const plan = buildBackfillPlan([testPoliticianOne, testPoliticianTwo]);
  check("Plan zaehlt beide Profile", plan.total === 2 && plan.ok === 2 && plan.skipped === 0);
  const rowOne = plan.rows.find((r) => r.id === testPoliticianOne.id);
  check("Row: partei gemappt", rowOne.mandateRow.partei === "Testpartei Alpha");
  check("Row: ausschuesse gemappt", Array.isArray(rowOne.mandateRow.ausschuesse) && rowOne.mandateRow.ausschuesse.includes("Arbeit und Soziales"));
  check("Row: politische_ebene Enum (bundestag)", rowOne.mandateRow.politische_ebene === "bundestag");
  check("Roundtrip: Partei erhalten", rowOne.roundtrip.party === "Testpartei Alpha");
  check("Roundtrip: Wahlkreis erhalten", rowOne.roundtrip.constituency === "Testkreis Nord");
  check("Roundtrip: alle focusTopics erhalten", rowOne.roundtrip.focusTopicsCount === testPoliticianOne.focusTopics.length);

  console.log("== 2) profil_extras faengt nicht-spaltige Felder verlustfrei ==");
  // localMedia/mainQuestion/outputNeeds/monitoringTargets haben keine eigene Spalte
  // bzw. wandern in profil_extras. Beweist: kein Feld geht beim Umzug verloren.
  check("extras enthaelt localMedia", rowOne.extrasKeys.includes("localMedia"));
  check("extras enthaelt mainQuestion", rowOne.extrasKeys.includes("mainQuestion"));
  check("extras enthaelt outputNeeds", rowOne.extrasKeys.includes("outputNeeds"));
  check("profil_extras.localMedia inhaltlich erhalten",
    JSON.stringify(rowOne.mandateRow.profil_extras.localMedia) === JSON.stringify(testPoliticianOne.localMedia));

  console.log("== 3) fehlende id -> uebersprungen (kein Abbruch) ==");
  const planBad = buildBackfillPlan([{ fullName: "Ohne ID" }, testPoliticianOne]);
  check("Ein Profil ohne id uebersprungen, eines ok", planBad.total === 2 && planBad.ok === 1 && planBad.skipped === 1);

  console.log("== 4) Dry-Run schreibt NICHTS ==");
  let upsertCalls = 0;
  const countingUpsert = async () => { upsertCalls += 1; return [{}]; };
  // Ohne execute -> reiner Plan, kein Schreibvorgang.
  const dry = await runBackfill([testPoliticianOne, testPoliticianTwo], { deps: { upsert: countingUpsert } });
  check("Dry-Run markiert dryRun", dry.dryRun === true);
  check("Dry-Run ruft KEINEN Upsert auf", upsertCalls === 0);

  console.log("== 5) Execute ist idempotent (Upsert, keine Duplikate) ==");
  // Simuliert profileDbModeEnabled(), damit saveProfileToDb den Schreibpfad nimmt.
  process.env.HELMUT_V3_STORE = "1";
  process.env.HELMUT_PROFILE_DB_MODE = "1";
  process.env.SUPABASE_URL = "https://example.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  check("profileDbModeEnabled() true fuer Execute", storage.profileDbModeEnabled() === true);
  const rows = new Map();
  // Upsert-Ziel validieren: falsches on_conflict -> Fehler (wie echtes PostgREST).
  // So ist die Idempotenz eine Eigenschaft des Codes (korrektes Upsert-Ziel), nicht
  // nur des Map-Schluessels (Review-Fix Test-Rigor).
  const upsert = async (table, row, onConflict) => {
    const expected = table === "mandate_profiles" ? "user_id" : "id";
    if (onConflict !== expected) throw new Error(`falsches on_conflict fuer ${table}: ${onConflict} (erwartet ${expected})`);
    const key = `${table}:${row.id || row.user_id}`;
    rows.set(key, (rows.get(key) || 0) + 1);
    return [row];
  };
  const run1 = await runBackfill([testPoliticianOne, testPoliticianTwo], { execute: true, deps: { upsert } });
  const run2 = await runBackfill([testPoliticianOne, testPoliticianTwo], { execute: true, deps: { upsert } });
  check("Execute-Lauf schreibt beide Profile", run1.written === 2 && run1.errors.length === 0);
  check("Zweiter Lauf schreibt erneut (idempotent, keine Fehler)", run2.written === 2 && run2.errors.length === 0);
  const distinctKeys = [...rows.keys()].sort();
  check("Nur 4 distinkte Zeilen-Keys (2 profiles + 2 mandate), keine Duplikat-Keys",
    distinctKeys.length === 4);
  check("Jeder Key wurde genau 2x geschrieben (Upsert, kein Wachstum)",
    [...rows.values()].every((n) => n === 2));

  console.log("== 6) saveProfileToDb nutzt korrektes on_conflict-Ziel je Tabelle ==");
  const seen = [];
  const recordingUpsert = async (table, row, onConflict) => { seen.push({ table, onConflict }); return [row]; };
  await storage.saveProfileToDb({ id: testPoliticianOne.id, fullName: "x" }, { strict: true, upsert: recordingUpsert });
  check("profiles -> on_conflict=id", seen.some((s) => s.table === "profiles" && s.onConflict === "id"));
  check("mandate_profiles -> on_conflict=user_id", seen.some((s) => s.table === "mandate_profiles" && s.onConflict === "user_id"));

  process.env.HELMUT_STORAGE_BACKEND = "";
  delete process.env.HELMUT_PROFILE_DB_MODE;
  delete process.env.HELMUT_V3_STORE;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log("");
  const total = pass + fail;
  if (fail === 0) { console.log(`${pass}/${total} Backfill-Assertions erfolgreich.`); process.exit(0); }
  console.log(`${pass}/${total} erfolgreich, ${fail} fehlgeschlagen.`);
  process.exit(1);
})();
