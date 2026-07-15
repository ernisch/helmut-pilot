"use strict";

// DSGVO-Vollstaendigkeit von Export/Loeschung (Audit-Fix 2026-07, Sprint 4).
// KEIN Netz, KEINE echte DB — der V3-Pfad laeuft gegen eine injizierte
// Fake-REST-Schicht, der Auth-Pfad gegen einen lokalen Datei-Store (tmp).
// FRÜHERER FEHLER: /api/privacy/export und /api/privacy/delete erfassten NUR den
// Blob-Store. V3-Tabellen (briefings, decisions, mandate_profiles, ...) und der
// Auth-Store (Konto, Sessions, Zuweisungen, KI-Log) blieben bei "Loeschen"
// vollstaendig erhalten — mit Erfolgsmeldung.

const path = require("path");
const fs = require("fs");

// Ohne Supabase-Env faellt der Store auf die lokale .helmut-data/ zurueck
// (gitignored). HERMETIK: alle beruehrten Store-Dateien werden vor dem Test
// gesichert und in JEDEM Fall (auch bei Fehlschlag) wiederhergestellt — andere
// Suiten (p1-security-check) sind zustandsabhaengig.
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const dataDir = path.join(__dirname, "..", ".helmut-data");
const GUARDED_FILES = ["auth.json", "store.json", "p-mdb-x.json", "p-mdb-y.json", "p-mdb-red.json"];
const snapshots = new Map();
for (const name of GUARDED_FILES) {
  const file = path.join(dataDir, name);
  snapshots.set(name, fs.existsSync(file) ? fs.readFileSync(file) : null);
}
function restoreStores() {
  for (const [name, content] of snapshots.entries()) {
    const file = path.join(dataDir, name);
    try {
      if (content === null) { if (fs.existsSync(file)) fs.rmSync(file); }
      else fs.writeFileSync(file, content);
    } catch (_) { /* Test-Hygiene, nie kritisch */ }
  }
}
process.on("exit", restoreStores);

const storage = require("../lib/helmut/storage");
const accounts = require("../lib/helmut/accounts");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Die Nutzertabellen, die eine Loeschung/ein Export MINDESTENS erfassen muss
// (Auftrag Prioritaet 6 + dsgvo-checklist.md "Pro Nutzer (loeschbar)").
const PFLICHT_TABELLEN = [
  "mandate_profiles", "briefings", "decisions", "matching_results",
  "profile_embeddings", "office_outputs", "topic_memory", "interactions",
  "user_notes", "daily_tasks", "communication_drafts", "political_items",
  "personalized_recommendations", "priority_changes", "matching_weights",
  "llm_usage", "profiles"
];

(async () => {
  // ── 1) V3-Export/Loeschung gegen Fake-REST ──────────────────────────────────
  const calls = [];
  const fakeDb = {
    briefings: [{ id: "bf-1", user_id: "mdb-x" }],
    decisions: [{ id: "d-1", user_id: "mdb-x" }, { id: "d-2", user_id: "mdb-x" }],
    llm_usage: [{ id: "l-1", politician_id: "mdb-x" }],
    profiles: [{ id: "mdb-x" }]
  };
  const fakeRequest = async (endpoint, options = {}) => {
    calls.push({ endpoint, method: (options.method || "GET").toUpperCase() });
    const table = endpoint.replace("/rest/v1/", "").split("?")[0];
    const rows = fakeDb[table] || [];
    if ((options.method || "GET").toUpperCase() === "DELETE") {
      fakeDb[table] = [];
      return rows; // Prefer: return=representation
    }
    return rows;
  };

  const exp = await storage.exportProfileDataV3("mdb-x", { ready: true, request: fakeRequest });
  check("V3-Export liest ALLE Pflichttabellen",
    PFLICHT_TABELLEN.every((t) => exp.tabellen && exp.tabellen[t] !== undefined),
    "fehlend: " + PFLICHT_TABELLEN.filter((t) => !exp.tabellen || exp.tabellen[t] === undefined).join(","));
  check("V3-Export liefert echte Zeilen", Array.isArray(exp.tabellen.decisions) && exp.tabellen.decisions.length === 2);
  check("V3-Export: llm_usage wird ueber alle drei Zuordnungsspalten gesucht",
    calls.some((c) => c.endpoint.includes("llm_usage") && c.endpoint.includes("politician_id.eq.mdb-x") && c.endpoint.includes("user_id.eq.mdb-x") && c.endpoint.includes("profile_id.eq.mdb-x")));

  calls.length = 0;
  const del = await storage.deleteProfileDataV3("mdb-x", { ready: true, request: fakeRequest });
  check("V3-Loeschung loescht ALLE Pflichttabellen",
    PFLICHT_TABELLEN.every((t) => calls.some((c) => c.method === "DELETE" && c.endpoint.startsWith(`/rest/v1/${t}?`))),
    "fehlend: " + PFLICHT_TABELLEN.filter((t) => !calls.some((c) => c.method === "DELETE" && c.endpoint.startsWith(`/rest/v1/${t}?`))).join(","));
  check("V3-Loeschung: profiles kommt ZULETZT (Kinder zuerst, Kaskade nur Sicherheitsnetz)",
    calls.filter((c) => c.method === "DELETE").slice(-1)[0].endpoint.startsWith("/rest/v1/profiles?"));
  check("V3-Loeschung zaehlt geloeschte Zeilen", del.ok === true && del.geloescht.decisions === 2 && del.geloescht.briefings === 1);

  // Export-Pagination (Review-Fix M3): >2000 Zeilen dürfen nicht still
  // abgeschnitten werden. Fake respektiert offset und liefert 2500 briefings.
  const many = Array.from({ length: 2500 }, (_, i) => ({ id: "bf-" + i, user_id: "mdb-x" }));
  const pagedRequest = async (endpoint, options = {}) => {
    if ((options.method || "GET").toUpperCase() !== "GET") return [];
    const table = endpoint.replace("/rest/v1/", "").split("?")[0];
    if (table !== "briefings") return [];
    const off = Number((endpoint.match(/offset=(\d+)/) || [])[1] || 0);
    const lim = Number((endpoint.match(/limit=(\d+)/) || [])[1] || 1000);
    return many.slice(off, off + lim);
  };
  const expPaged = await storage.exportProfileDataV3("mdb-x", { ready: true, request: pagedRequest });
  check("V3-Export paginiert vollständig (>2000 Zeilen, keine stille Truncation)",
    Array.isArray(expPaged.tabellen.briefings) && expPaged.tabellen.briefings.length === 2500 && expPaged.vollstaendig === true,
    `briefings=${expPaged.tabellen.briefings && expPaged.tabellen.briefings.length}`);

  // Auth-Export-Redaktion (Review-Fix N3): Fremd-Identifikatoren (Dritte) werden
  // pseudonymisiert. Direkt gegen accounts (lokaler Store).
  const accounts = require("../lib/helmut/accounts");
  await accounts.deleteAuthDataForPolitician("mdb-red").catch(() => {});
  await accounts.createUser({ email: "mdb-red@test.local", name: "MdB Red", role: "abgeordneter", password: "p".repeat(10), politicianId: "mdb-red" });
  const mdbRed = await accounts.getUserByEmailRaw("mdb-red@test.local");
  const adminRed = await accounts.createUser({ email: "admin-red@test.local", name: "Admin Red", role: "admin", password: "p".repeat(10) }).catch(async () => accounts.getUserByEmailRaw("admin-red@test.local"));
  await accounts.recordAudit({ action: "profile.update", userId: mdbRed.id, politicianId: "mdb-red", ip: "1.2.3.4" });        // eigene Aktion
  await accounts.recordAudit({ action: "admin.change", userId: (await accounts.getUserByEmailRaw("admin-red@test.local")).id, actorEmail: "admin-red@test.local", politicianId: "mdb-red", ip: "9.9.9.9" }); // Dritt-Aktion
  const authExpRed = await accounts.exportAuthDataForPolitician("mdb-red");
  const dritte = authExpRed.auditEreignisse.find((e) => e.action === "admin.change");
  const eigene = authExpRed.auditEreignisse.find((e) => e.action === "profile.update");
  check("Auth-Export: Dritt-Aktion pseudonymisiert (keine Fremd-Email/IP/userId)",
    dritte && dritte.akteur === "[dritte Person – redigiert]" && !JSON.stringify(dritte).includes("9.9.9.9") && !JSON.stringify(dritte).includes("admin-red@test.local"));
  check("Auth-Export: eigene Aktion des Mandatsträgers bleibt vollständig",
    eigene && eigene.ip === "1.2.3.4" && eigene.userId === mdbRed.id);
  await accounts.deleteAuthDataForPolitician("mdb-red").catch(() => {});
  try { const s = await storage.readAuthStore(); s.users = (s.users || []).filter((u) => u.email !== "admin-red@test.local"); await storage.writeAuthStore(s); } catch (_) {}

  // Teilfehler => ok:false (keine falsche Erfolgsmeldung mehr).
  const failingRequest = async (endpoint, options = {}) => {
    if ((options.method || "GET").toUpperCase() === "DELETE" && endpoint.includes("briefings")) throw new Error("kaputt");
    return [];
  };
  const delFail = await storage.deleteProfileDataV3("mdb-x", { ready: true, request: failingRequest });
  check("V3-Teilfehler wird ehrlich gemeldet (ok=false + Fehlerliste)",
    delFail.ok === false && delFail.fehler.length === 1 && delFail.fehler[0].tabelle === "briefings");

  // V3 nicht konfiguriert -> sauber uebersprungen, blockiert die Loeschung nicht.
  const delSkipped = await storage.deleteProfileDataV3("mdb-x", { ready: false });
  check("Ohne V3-Store: skipped=true, ok=true (Blob-only-Betrieb bleibt funktionsfaehig)",
    delSkipped.skipped === true && delSkipped.ok === true);

  // ── 2) Auth-Store: Export + Loeschung ───────────────────────────────────────
  // Fixtures idempotent anlegen (Reste frueherer Laeufe zuerst entfernen).
  await accounts.deleteAuthDataForPolitician("mdb-x").catch(() => {});
  await accounts.deleteAuthDataForPolitician("mdb-y").catch(() => {});
  await accounts.createUser({ email: "mdb-x@test.local", name: "MdB X", role: "abgeordneter", password: "test-pass-123", politicianId: "mdb-x" });
  await accounts.createUser({ email: "andere@test.local", name: "MdB Y", role: "abgeordneter", password: "test-pass-456", politicianId: "mdb-y" });
  await accounts.createUser({ email: "admin@test.local", name: "Admin", role: "admin", password: "admin-pass-123" })
    .catch(() => {}); // Admin darf aus einem frueheren Lauf existieren
  const mdbX = await accounts.getUserByEmailRaw("mdb-x@test.local");
  await accounts.createSession(mdbX.id, {});
  await accounts.recordAudit({ action: "auth.login", userId: mdbX.id, politicianId: "mdb-x" });
  await storage.recordLlmUsage({ callType: "communicationDraft", politicianId: "mdb-x", model: "test", promptTokens: 1, completionTokens: 1 });
  await storage.recordLlmUsage({ callType: "communicationDraft", politicianId: "mdb-y", model: "test", promptTokens: 1, completionTokens: 1 });

  const authExp = await accounts.exportAuthDataForPolitician("mdb-x");
  check("Auth-Export enthaelt Konto, Sitzungs-Metadaten, Audit und KI-Log",
    authExp.konten.length === 1 && authExp.sitzungen.length === 1
    && authExp.auditEreignisse.length >= 1 && authExp.kiNutzung.length === 1);
  check("Auth-Export enthaelt NIE Passwort-Hashes oder Session-Tokens",
    !JSON.stringify(authExp).includes("passwordHash") && !JSON.stringify(authExp).includes("tokenHash"));

  const authDel = await accounts.deleteAuthDataForPolitician("mdb-x");
  check("Auth-Loeschung meldet Umfang", authDel.ok === true && authDel.before.konten === 1 && authDel.before.sitzungen === 1);
  const afterUsers = await accounts.listUsers();
  check("Konto des Mandats ist geloescht, fremde Konten bleiben",
    !afterUsers.some((u) => u.politicianId === "mdb-x")
    && afterUsers.some((u) => u.politicianId === "mdb-y")
    && afterUsers.some((u) => u.role === "admin"));
  const usageAfter = await storage.getLlmUsageToday("mdb-y");
  const usageXAfter = await storage.getLlmUsageToday("mdb-x");
  check("KI-Log: nur die Eintraege des geloeschten Mandats entfernt",
    usageXAfter.calls === 0 && usageAfter.calls === 1,
    JSON.stringify({ x: usageXAfter.calls, y: usageAfter.calls }));

  // ── 3) Orchestrierung: Gesamtloeschung meldet Teilfehler ehrlich ─────────────
  const delAll = await storage.deleteProfileData("mdb-y");
  check("Gesamtloeschung laeuft durch (Blob+V3(skipped)+Auth) und ist ok",
    delAll.ok === true && delAll.v3Tabellen && delAll.authDaten && delAll.authDaten.ok === true, JSON.stringify({ ok: delAll.ok }));
  const exportAll = await storage.exportProfileData("mdb-y");
  check("Gesamtexport traegt v3Tabellen + authDaten + Vollstaendigkeits-Flag",
    exportAll.v3Tabellen !== undefined && exportAll.authDaten !== undefined && exportAll.vollstaendig !== undefined);

  // ── 4) Endpunkte protokollieren Export/Loeschung im Audit-Log ───────────────
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  check("privacy/export schreibt Audit-Eintrag (privacy.export)",
    /privacy\.export/.test(serverSource) && /privacy\/export[\s\S]{0,1400}recordAudit/.test(serverSource));
  check("privacy/delete schreibt Audit-Eintrag inkl. Teilfehler-Hinweis",
    /privacy\.delete/.test(serverSource) && /TEILWEISE FEHLGESCHLAGEN/.test(serverSource));

  // Wiederherstellung der Store-Snapshots uebernimmt der exit-Handler (restoreStores).
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
