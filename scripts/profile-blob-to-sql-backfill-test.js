"use strict";

// Offline-Test des Profil-Backfills (Blob → SQL). KEIN Netz, KEINE echte DB:
// lokaler Datei-Store mit Snapshot/Restore. Prüft (a) den Dry-Run-Plan über echte
// Blob-Profile und (b) die Sicherheits-Verweigerung eines Live-Laufs, solange der
// DB-Modus aus ist (kein versehentliches „Backfill", das nur den Blob berührt).

const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_PROFILE_DB_MODE;
delete process.env.HELMUT_V3_STORE;
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";

// Store-Hermetik.
const dataDir = path.join(root, ".helmut-data");
const GUARDED = ["store.json"];
const snapshots = new Map();
for (const name of GUARDED) {
  const file = path.join(dataDir, name);
  snapshots.set(name, fs.existsSync(file) ? fs.readFileSync(file) : null);
}
process.on("exit", () => {
  for (const [name, content] of snapshots.entries()) {
    const file = path.join(dataDir, name);
    try {
      if (content === null) { if (fs.existsSync(file)) fs.rmSync(file); }
      else fs.writeFileSync(file, content);
    } catch (_) { /* Hygiene */ }
  }
});

const storage = require("../lib/helmut/storage");
const { runBackfill } = require("./profile-blob-to-sql-backfill");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

(async () => {
  await storage.saveProfile({ id: "bf-tenant-a", fullName: "A Test", party: "SPD", parliamentType: "Bundestag", constituency: "K1", committees: ["Gesundheit"] });
  await storage.saveProfile({ id: "bf-tenant-b", fullName: "B Test", party: "CDU/CSU", parliamentType: "Landtag", state: "Bayern", constituency: "M1", focusTopics: ["Bildung"] });

  const silent = () => {};

  const dry = await runBackfill({ dryRun: true }, { storage, log: silent });
  check("Dry-Run erfasst beide Blob-Profile", dry.total >= 2, `total=${dry.total}`);
  check("Dry-Run schreibt nichts (0 written/skipped/errors)", dry.written === 0 && dry.skipped === 0 && dry.errors === 0);
  check("Dry-Run plant Upserts", dry.items.every((i) => i.action === "would-upsert") && dry.items.length === dry.total);
  check("Dry-Run wird nicht abgebrochen", !dry.aborted);

  const live = await runBackfill({ dryRun: false }, { storage, log: silent });
  check("Live-Lauf bei DB-Modus AUS wird sicher verweigert", live.aborted === "db-mode-off");
  check("Live-Lauf verweigert -> keine Schreibvorgänge", live.written === 0 && live.errors === 0);

  console.log(`\n${fail === 0 ? "ALLE GRÜN" : fail + " FEHLGESCHLAGEN"} — ${pass}/${pass + fail} Backfill-Assertions`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
