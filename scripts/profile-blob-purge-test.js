"use strict";

// Beweis-Suite (Folge-Fix): purgeBlobProfiles entfernt eingefrorene Profilkopien
// aus dem main-Blob — ABER NUR, wenn das Profil relational nachweislich existiert
// (fail-safe, kein Datenverlust). Dry-Run schreibt nichts; Guard bei DB-Modus aus.

process.env.HELMUT_STORE_CACHE_MS = "0";
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
process.env.HELMUT_V3_STORE = "1";
process.env.HELMUT_PROFILE_DB_MODE = "1";
process.env.HELMUT_PROFILE_DB_EXCLUSIVE = "1";

const storage = require("../lib/helmut/storage");

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name}`); } }

const profilesTable = new Map(), mandateTable = new Map(), blobRows = new Map();
let calls = [];
function res(s, p) { const b = p == null ? "" : JSON.stringify(p); return { ok: s >= 200 && s < 300, status: s, statusText: "OK", text: async () => b }; }

globalThis.fetch = async (url, opt = {}) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, "");
  const method = (opt.method || "GET").toUpperCase();
  const body = opt.body ? JSON.parse(opt.body) : null;
  const prefer = String((opt.headers && (opt.headers.Prefer || opt.headers.prefer)) || "");
  calls.push({ method, path });
  if (path.startsWith("/rest/v1/helmut_store")) {
    if (method === "GET") { const m = /id=eq\.([^&]+)/.exec(path); const sid = m ? decodeURIComponent(m[1]) : null; return res(200, sid && blobRows.has(sid) ? [{ data: blobRows.get(sid) }] : []); }
    if (method === "POST") { if (body && body.id) blobRows.set(body.id, body.data); return prefer.includes("return=minimal") ? res(204, null) : res(200, [body]); }
  }
  if (path.startsWith("/rest/v1/profiles")) {
    if (method === "GET") {
      const im = /id=eq\.([^&]+)/.exec(path);
      if (im) { const pid = decodeURIComponent(im[1]); const p = profilesTable.get(pid); return res(200, p ? [{ ...p, mandate_profiles: mandateTable.has(pid) ? [mandateTable.get(pid)] : [] }] : []); }
      return res(200, [...profilesTable.values()].map((p) => ({ ...p, mandate_profiles: mandateTable.has(p.id) ? [mandateTable.get(p.id)] : [] })));
    }
  }
  return res(200, []);
};

function mainStorePosts() { return calls.filter((c) => c.method === "POST" && c.path.startsWith("/rest/v1/helmut_store")).length; }

(async () => {
  const A = "tenant-mit-sql", B = "tenant-nur-blob";
  // Relational vorhanden: NUR A (mit Mandatszeile, sonst wuerde getProfileFromDb null liefern).
  profilesTable.set(A, { id: A, name: "A" });
  mandateTable.set(A, { user_id: A, partei: "Testpartei Alpha" });
  // Blob 'main' traegt eingefrorene Kopien BEIDER Mandate.
  blobRows.set("main", {
    profiles: { [A]: { id: A, fullName: "A (Blob)" }, [B]: { id: B, fullName: "B (Blob)" } },
    mandateProfiles: { [A]: { user_id: A }, [B]: { user_id: B } },
    rawItems: []
  });

  console.log("== 1) Dry-Run: nur Analyse, kein Schreibvorgang ==");
  calls = [];
  const dry = await storage.purgeBlobProfiles({ execute: false });
  check("Dry-Run: 2 Kandidaten", dry.candidates === 2);
  check("Dry-Run: 1 entfernbar (A relational vorhanden)", dry.purgeable === 1);
  check("Dry-Run: B ohne SQL -> skippedNoSql", dry.skippedNoSql.length === 1 && dry.skippedNoSql[0] === B);
  check("Dry-Run: nichts geschrieben", dry.written === false && mainStorePosts() === 0);
  check("Dry-Run: Blob unveraendert (A+B noch da)", blobRows.get("main").profiles[A] && blobRows.get("main").profiles[B]);

  console.log("== 2) Execute: entfernt NUR die relational belegte Kopie (A), B bleibt ==");
  calls = [];
  const exec = await storage.purgeBlobProfiles({ execute: true });
  check("Execute: 1 entfernt", exec.purged === 1);
  check("Execute: main-Blob geschrieben", exec.written === true && mainStorePosts() >= 1);
  check("Execute: A-Kopie entfernt", !blobRows.get("main").profiles[A] && !blobRows.get("main").mandateProfiles[A]);
  check("Execute: B-Kopie BLEIBT (kein Datenverlust, fehlt relational)", Boolean(blobRows.get("main").profiles[B]));

  console.log("== 3) Idempotenz: zweiter Lauf entfernt nichts mehr ==");
  calls = [];
  const exec2 = await storage.purgeBlobProfiles({ execute: true });
  check("Zweiter Execute: 0 entfernt (A schon weg)", exec2.purged === 0);
  check("Zweiter Execute: kein Schreibvorgang", exec2.written === false && mainStorePosts() === 0);

  console.log("== 4) Guard: DB-Modus aus -> Fehler, kein Schreibvorgang ==");
  delete process.env.HELMUT_PROFILE_DB_MODE;
  calls = [];
  const guarded = await storage.purgeBlobProfiles({ execute: true });
  check("DB-Modus aus -> error 'profile-db-mode-off'", guarded.error === "profile-db-mode-off");
  check("DB-Modus aus -> kein Schreibvorgang", guarded.written === false && mainStorePosts() === 0);
  process.env.HELMUT_PROFILE_DB_MODE = "1";

  console.log("");
  const total = pass + fail;
  if (fail === 0) { console.log(`${pass}/${total} Blob-Purge-Assertions erfolgreich.`); process.exit(0); }
  console.log(`${pass}/${total} erfolgreich, ${fail} fehlgeschlagen.`);
  process.exit(1);
})();
