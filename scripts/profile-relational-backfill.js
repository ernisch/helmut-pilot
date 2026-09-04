"use strict";

// Profil-Backfill Blob -> relational (Stufe C des Entkopplungs-Stufenplans,
// docs/profil-storage-entkopplung-architekturbericht.md).
//
// Kopiert bestehende Mandatsprofile aus dem helmut_store-Blob (store.profiles)
// verlustfrei in die relationalen Tabellen profiles + mandate_profiles, damit der
// Exklusivmodus (HELMUT_PROFILE_DB_EXCLUSIVE) OHNE Blob-Fallback lesen kann.
//
// Sicherheitsprinzipien:
//  - DRY-RUN ist Default. Erst `--execute` schreibt. So ist der Preview-Beweislauf
//    (Stufe C) ohne jedes Schreibrisiko fahrbar.
//  - IDEMPOTENT: jeder Schreibvorgang ist ein Upsert auf dem PK (profiles.id /
//    mandate_profiles.user_id). Mehrfachlaeufe erzeugen KEINE Duplikate.
//  - FAIL-SAFE pro Profil: ein Fehler bei einem Mandat bricht den Batch nicht ab;
//    Fehler werden gesammelt und am Ende ehrlich ausgewiesen.
//  - MANDANTENNEUTRAL: keine hartkodierten Namen/IDs; es wird ausschliesslich
//    ueber die vorhandenen Blob-Profile iteriert.
//  - Verlustfrei: nicht-spaltige Felder wandern ueber toMandateProfileRow in
//    profil_extras (jsonb) — kein Feld geht verloren.
//
// KEIN Production-Schreibvorgang durch bloßes Requiren dieser Datei: main() laeuft
// nur, wenn das Skript direkt gestartet wird.

const storage = require("../lib/helmut/storage");
// SR §37.5 (3): reine Logik, keine Netz-/DB-Abhaengigkeit.
const VORFLUG = require("../lib/helmut/speicherpfad-vorflug");

// Reine Planungsfunktion (kein I/O): baut aus einer Liste interner Profil-Objekte
// den Backfill-Plan inkl. Feldabdeckung und Verlustkontrolle. Offline testbar.
function buildBackfillPlan(profiles = []) {
  const rows = [];
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (!profile || !profile.id) {
      rows.push({ id: profile && profile.id, ok: false, reason: "missing-id" });
      continue;
    }
    const mandateRow = storage.toMandateProfileRow(profile);
    // Verlustkontrolle: Roundtrip zurueck -> die vier Scoring-Dimensionen muessen
    // erhalten bleiben (Partei/Ausschuesse/Wahlkreis/Themen).
    const back = storage.fromMandateProfileRow({ id: profile.id, name: profile.fullName }, mandateRow);
    const extrasKeys = mandateRow.profil_extras && typeof mandateRow.profil_extras === "object"
      ? Object.keys(mandateRow.profil_extras) : [];
    rows.push({
      id: profile.id,
      ok: true,
      profilesRow: { id: profile.id, name: profile.fullName || profile.id, email: profile.email || null },
      mandateRow,
      extrasKeys,
      roundtrip: {
        party: back.party,
        committees: back.committees || [],
        constituency: back.constituency,
        focusTopicsCount: Array.isArray(back.focusTopics) ? back.focusTopics.length : 0
      }
    });
  }
  return {
    total: rows.length,
    ok: rows.filter((r) => r.ok).length,
    skipped: rows.filter((r) => !r.ok).length,
    rows
  };
}

// Schreibt den Plan (idempotente Upserts). deps.upsert ist injizierbar (Tests).
// Ohne execute=true: reiner Dry-Run, KEIN Schreibvorgang.
async function runBackfill(profiles = [], opts = {}) {
  const plan = buildBackfillPlan(profiles);
  const execute = opts.execute === true;
  const result = { execute, total: plan.total, ok: plan.ok, skipped: plan.skipped, written: 0, errors: [] };
  if (!execute) return { ...result, dryRun: true, plan };
  for (const row of plan.rows) {
    if (!row.ok) continue;
    try {
      // Verlustfreier, idempotenter Schreibpfad ueber die produktive Funktion.
      const res = await storage.saveProfileToDb(
        { id: row.id, fullName: row.profilesRow.name, email: row.profilesRow.email, ...profileFor(profiles, row.id) },
        { strict: true, ...(opts.deps || {}) }
      );
      if (res && res.saved) result.written += 1;
      else result.errors.push({ id: row.id, reason: (res && res.reason) || "unknown" });
    } catch (error) {
      result.errors.push({ id: row.id, reason: String((error && error.message) || "write-failed").slice(0, 200) });
    }
  }
  return result;
}

function profileFor(profiles, id) {
  return (Array.isArray(profiles) ? profiles : []).find((p) => p && p.id === id) || {};
}

// REVERSE-Backfill (relational -> Blob). Schliesst die Rollback-Luecke E -> DB-Modus
// aus: waehrend des Exklusivmodus (Stufe E) wird der Blob nicht mitgeschrieben, also
// werden E-Aera-Profile (neu ODER geaendert) unsichtbar, sobald HELMUT_PROFILE_DB_MODE
// ganz aus geht. Dieser Lauf synchronisiert den aktuellen SQL-Stand in den Blob
// zurueck, sodass ein vollstaendiger Rollback verlustfrei bleibt. Idempotent
// (saveProfile im Blob-Pfad ueberschreibt je id). deps.request injizierbar (Tests).
async function runReverseBackfill(opts = {}) {
  const execute = opts.execute === true;
  // SQL-Profile lesen (erfordert aktiven DB-Modus).
  const sqlProfiles = await storage.listFullProfilesFromDb(opts.deps || {});
  if (!Array.isArray(sqlProfiles)) return { execute, direction: "reverse", error: "sql-read-failed", written: 0 };
  const result = { execute, direction: "reverse", total: sqlProfiles.length, written: 0, errors: [] };
  if (!execute) return { ...result, dryRun: true, ids: sqlProfiles.map((p) => p.id) };
  // Blob-Write erzwingen: DB-/Exklusiv-Flags fuer die Dauer neutralisieren, damit
  // saveProfile den reinen Blob-Pfad nimmt (kein SQL-Write, keine Rekursion).
  const prevMode = process.env.HELMUT_PROFILE_DB_MODE;
  const prevExcl = process.env.HELMUT_PROFILE_DB_EXCLUSIVE;
  delete process.env.HELMUT_PROFILE_DB_MODE;
  delete process.env.HELMUT_PROFILE_DB_EXCLUSIVE;
  try {
    for (const p of sqlProfiles) {
      try { await storage.saveProfile(p); result.written += 1; }
      catch (error) { result.errors.push({ id: p.id, reason: String((error && error.message) || "write-failed").slice(0, 200) }); }
    }
  } finally {
    if (prevMode !== undefined) process.env.HELMUT_PROFILE_DB_MODE = prevMode;
    if (prevExcl !== undefined) process.env.HELMUT_PROFILE_DB_EXCLUSIVE = prevExcl;
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const reverse = args.includes("--reverse");
  if (reverse) {
    console.log(`== Profil-REVERSE-Backfill relational -> Blob (${execute ? "EXECUTE" : "DRY-RUN"}) ==`);
    if (!storage.profileDbModeEnabled()) {
      console.error("ABBRUCH: --reverse erfordert HELMUT_PROFILE_DB_MODE=1 + Supabase (Lesen aus SQL).");
      return 2;
    }
    // ── SCHREIBZIEL AUSWEISEN (SR §37.5 (4), Vorfall 04.09.) ──────────────
    // Der Rueckwaertslauf ist der haerteste Fall im Repo: er neutralisiert die
    // Profil-Flags ABSICHTLICH, damit `saveProfile` garantiert den Blob-Pfad
    // nimmt — also ein voller Schreibvorgang auf die geteilte Zeile `main` JE
    // SQL-Profil, jeder davon durch `compactStore`. Seit dem 04.09. verkleinert
    // `compactStore` `crawlRuns` in keiner Konfiguration mehr; hier steht
    // deshalb der Bericht, nicht der harte Abbruch (SR §38.2).
    //
    if (execute) {
      console.log(`\n${VORFLUG.pruefeSpeicherpfad({
        env: process.env,
        zweck: "Profil-REVERSE-Backfill (relational -> Blob)",
        // Dieser Lauf SCHALTET den relationalen Schreibmodus bewusst ab; ihn hier
        // zu verlangen waere widerspruechlich. Die Lesevoraussetzung ist eine
        // Zeile darueber bereits geprueft.
        verlangeProfilSchreibpfad: false
      }).meldung}\n`);
    }
    const res = await runReverseBackfill({ execute });
    if (res.error) { console.error(`Fehler: ${res.error}`); return 2; }
    console.log(execute ? `In Blob geschrieben: ${res.written}/${res.total}. Fehler: ${res.errors.length}` : `Gefundene SQL-Profile: ${res.total} (Dry-Run, mit --execute schreiben)`);
    return (res.errors && res.errors.length) ? 1 : 0;
  }
  // Blob-Profile lesen (nur der Blob, unabhaengig vom DB-Modus).
  const blob = await requireBlobProfiles();
  const profiles = Object.values(blob || {});
  console.log(`== Profil-Backfill Blob -> relational (${execute ? "EXECUTE" : "DRY-RUN"}) ==`);
  console.log(`Gefundene Blob-Profile: ${profiles.length}`);
  if (!execute) {
    const plan = buildBackfillPlan(profiles);
    for (const row of plan.rows) {
      if (!row.ok) { console.log(`  - ${row.id || "(ohne id)"}: UEBERSPRUNGEN (${row.reason})`); continue; }
      console.log(`  - ${row.id}: partei=${row.mandateRow.partei || "-"} ausschuesse=${(row.mandateRow.ausschuesse || []).length} extras=[${row.extrasKeys.join(",")}]`);
    }
    console.log(`\nPlan: ${plan.ok} schreibbar, ${plan.skipped} uebersprungen. KEIN Schreibvorgang (Dry-Run). Mit --execute ausfuehren.`);
    if (!storage.profileDbModeEnabled()) {
      console.log("Hinweis: HELMUT_PROFILE_DB_MODE/v3StoreReady ist AUS — --execute wuerde nichts schreiben (fail-safe).");
    }
    return 0;
  }
  if (!storage.profileDbModeEnabled()) {
    console.error("ABBRUCH: --execute erfordert HELMUT_PROFILE_DB_MODE=1 + HELMUT_V3_STORE + Supabase (v3StoreReady).");
    return 2;
  }
  const res = await runBackfill(profiles, { execute: true });
  console.log(`Geschrieben: ${res.written}/${res.ok}. Fehler: ${res.errors.length}`);
  res.errors.forEach((e) => console.log(`  ! ${e.id}: ${e.reason}`));
  return res.errors.length ? 1 : 0;
}

// Liest die Blob-Profile ohne Annahme ueber den aktiven Backend-Modus.
async function requireBlobProfiles() {
  // storage.js exportiert readStore nicht; wir nutzen den oeffentlichen Weg ueber
  // listFullProfiles im BLOB-Modus. Um garantiert den Blob (nicht SQL) zu lesen,
  // wird der DB-Modus fuer die Dauer des Lesens neutralisiert.
  const prevMode = process.env.HELMUT_PROFILE_DB_MODE;
  const prevExcl = process.env.HELMUT_PROFILE_DB_EXCLUSIVE;
  delete process.env.HELMUT_PROFILE_DB_MODE;
  delete process.env.HELMUT_PROFILE_DB_EXCLUSIVE;
  try {
    const list = await storage.listFullProfiles();
    const map = {};
    for (const p of list) if (p && p.id) map[p.id] = p;
    return map;
  } finally {
    if (prevMode !== undefined) process.env.HELMUT_PROFILE_DB_MODE = prevMode;
    if (prevExcl !== undefined) process.env.HELMUT_PROFILE_DB_EXCLUSIVE = prevExcl;
  }
}

module.exports = { buildBackfillPlan, runBackfill, runReverseBackfill };

if (require.main === module) {
  main().then((code) => process.exit(code || 0)).catch((error) => {
    console.error("Backfill fehlgeschlagen:", error && error.message);
    process.exit(1);
  });
}
