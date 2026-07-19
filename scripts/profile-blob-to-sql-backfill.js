"use strict";

// Profil-Backfill: Blob (helmut_store → profiles[id]) → SQL (public.mandate_profiles).
// Teil der Aktivierung des SQL-Schreibpfads (Onboarding-Aufgabe „SQL-Schreibpfad
// mandate_profiles aktivieren: Migration → Backfill → HELMUT_PROFILE_DB_MODE=1").
//
// Nutzt den BEREITS vorhandenen, fail-safen Mapper/Writer aus storage.js
// (saveProfileToDb → toMandateProfileRow) — es wird KEIN SQL von Hand gebaut und
// keine Spalte direkt geschrieben. Idempotent: saveProfileToDb macht ein Upsert
// (on conflict user_id), Mehrfachlauf ist unschädlich.
//
// Voraussetzungen für den LIVE-Lauf (sonst nur Dry-Run möglich):
//   1) Migration eingespielt (supabase/migrations/20260712_mandate_profile_fields.sql
//      u. Basis-Schema für public.mandate_profiles).
//   2) HELMUT_V3_STORE=1, SUPABASE_URL + Service-Role-Key gesetzt.
//   3) HELMUT_PROFILE_DB_MODE=1.
//
// Aufruf:
//   node scripts/profile-blob-to-sql-backfill.js --dry-run   # nichts schreiben, nur Plan
//   node scripts/profile-blob-to-sql-backfill.js             # LIVE (Upsert je Profil)
//
// Exit 0 = ok (oder Dry-Run), 1 = mind. ein Fehler beim Schreiben.

async function runBackfill(opts = {}, deps = {}) {
  const storage = deps.storage || require("../lib/helmut/storage");
  const log = deps.log || ((...a) => console.log(...a));
  const dryRun = Boolean(opts.dryRun);

  const store = await storage.readStore();
  const profiles = Object.values((store && store.profiles) || {}).filter((p) => p && p.id);
  const result = { total: profiles.length, written: 0, skipped: 0, verified: 0, errors: 0, dryRun, items: [] };

  const dbReady = typeof storage.profileDbModeEnabled === "function" ? storage.profileDbModeEnabled() : false;
  log(`Gefundene Blob-Profile: ${result.total}`);
  log(`profileDbModeEnabled(): ${dbReady} (HELMUT_PROFILE_DB_MODE + HELMUT_V3_STORE + Supabase)`);

  if (!dryRun && !dbReady) {
    log("");
    log("ABBRUCH: DB-Modus ist AUS — ein Live-Backfill würde nur den Blob berühren.");
    log("Setze zuerst HELMUT_V3_STORE=1, SUPABASE_URL + Service-Role-Key und HELMUT_PROFILE_DB_MODE=1,");
    log("oder nutze --dry-run für einen reinen Plan (keine Schreibvorgänge).");
    result.aborted = "db-mode-off";
    return result;
  }

  for (const profile of profiles) {
    const id = profile.id;
    if (dryRun) {
      result.items.push({ id, action: "would-upsert" });
      continue;
    }
    try {
      const res = await storage.saveProfileToDb(profile);
      if (res && res.skipped) {
        result.skipped += 1;
        result.items.push({ id, action: "skipped", reason: res.reason || "skipped" });
      } else {
        result.written += 1;
        // Verifizieren: Round-Trip aus SQL zurücklesen (fail-safe; null = Blob-Fallback).
        const back = await storage.getProfileFromDb(id).catch(() => null);
        if (back && back.id === id) result.verified += 1;
        result.items.push({ id, action: "upserted", verified: Boolean(back && back.id === id) });
      }
    } catch (error) {
      result.errors += 1;
      result.items.push({ id, action: "error", error: error && error.message });
    }
  }

  log("");
  log(dryRun
    ? `Dry-Run: ${result.total} Profil(e) würden per Upsert nach mandate_profiles geschrieben.`
    : `Fertig: ${result.written} geschrieben (${result.verified} verifiziert), ${result.skipped} übersprungen, ${result.errors} Fehler.`);
  return result;
}

module.exports = { runBackfill };

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run") || process.argv.includes("-n");
  runBackfill({ dryRun })
    .then((r) => process.exit(r.errors > 0 ? 1 : 0))
    .catch((e) => { console.error("Backfill-Fehler:", e && e.message); process.exit(1); });
}
