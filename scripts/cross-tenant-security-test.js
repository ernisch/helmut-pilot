"use strict";

// Sprint 1 (Sicherheit & Mehrmandantenfaehigkeit) — NEGATIVER Sicherheitstest.
// Versucht gezielt, Daten zwischen zwei SYNTHETISCHEN Testmandanten auszulesen
// oder mandantenuebergreifend zu schreiben, und beweist, dass die App-Schicht
// (assertTenant/assertTenantRows) das hart blockiert. Da RLS produktiv inert ist
// (service_role), ist diese Schicht die reale Verteidigungslinie.
//
// Deckt die vom Audit gefundenen Testluecken ab:
//   (c) Mandant A kann NICHT fuer Mandant B schreiben
//   (e) fehlender Mandantenkontext blockiert (auch die 2026-07 + Sprint-1
//       gehaerteten Blob-Leser)
//   + systematischer Cross-Tenant-Lesetest ueber alle per-Mandant-Leser
// KEIN Netz, KEINE echte DB. Nur Mandanten mit Suffix "-synthetic".

const fs = require("fs");
const path = require("path");

process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const storage = require("../lib/helmut/storage");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const A = "tenant-a-synthetic";
const B = "tenant-b-synthetic";

const dataDir = path.join(__dirname, "..", ".helmut-data");
const files = ["store.json", "auth.json", `p-${A}.json`, `p-${B}.json`].map((f) => path.join(dataDir, f));
const backups = files.map((f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null));

async function throwsTenant(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}

(async () => {
  try {
    // ── Seed: beide Mandanten mit Daten in allen per-Mandant-Blob-Stores ───────
    await storage.saveLageCheck({ politicianId: A, mode: "lage-check", status: "changed", message: "A-LAGE" });
    await storage.saveLageCheck({ politicianId: B, mode: "lage-check", status: "changed", message: "B-LAGE" });
    await storage.saveBriefing({ id: "bf-a", politicianId: A, homeSections: {}, marker: "A-BRIEF" });
    await storage.saveBriefing({ id: "bf-b", politicianId: B, homeSections: {}, marker: "B-BRIEF" });
    await storage.saveTask({ id: "task-a", title: "A", politicianId: A, status: "open" });
    await storage.saveTask({ id: "task-b", title: "B", politicianId: B, status: "open" });
    await storage.saveUserNote({ id: "note-a", text: "A-NOTE", user_id: A });
    await storage.saveUserNote({ id: "note-b", text: "B-NOTE", user_id: B });
    await storage.saveInteraction({ id: "int-a", type: "x", politicianId: A });
    await storage.saveInteraction({ id: "int-b", type: "x", politicianId: B });
    await storage.savePushSubscription(A, { endpoint: "https://push/a", keys: { p256dh: "ka", auth: "aa" } });
    await storage.savePushSubscription(B, { endpoint: "https://push/b", keys: { p256dh: "kb", auth: "ab" } });

    // ── 1) POSITIV: A liest seine eigenen Daten ────────────────────────────────
    const aTasks = await storage.getTasks(A);
    const aNotes = await storage.getUserNotes(A);
    const aBrief = await storage.getLatestBriefing(A);
    const aLage = await storage.getLatestLageCheck(A);
    const aPush = await storage.getPushSubscriptions(A);
    check("A liest eigene Tasks", aTasks.some((t) => t.id === "task-a"));
    check("A liest eigene Notes", aNotes.some((n) => n.id === "note-a"));
    check("A liest eigenes Briefing", aBrief && aBrief.marker === "A-BRIEF");
    check("A liest eigenen LageCheck", aLage && aLage.message === "A-LAGE");
    check("A liest eigenes Push-Abo", aPush.some((p) => p.endpoint === "https://push/a"));

    // ── 2) NEGATIV (Lese-Sweep): A darf NICHTS von B sehen ─────────────────────
    const leakChecks = [
      ["getTasks", aTasks], ["getUserNotes", aNotes], ["getLatestBriefing", aBrief],
      ["getLatestLageCheck", aLage], ["getPushSubscriptions", aPush]
    ];
    for (const [label, data] of leakChecks) {
      const blob = JSON.stringify(data || {});
      check(`Kein B-Leak in A-Sicht (${label})`, blob.indexOf("B-") === -1 && blob.indexOf(B) === -1, blob.slice(0, 120));
    }
    const bTasksAsExpected = await storage.getTasks(B);
    check("B sieht nur B (Gegenprobe: task-b, nicht task-a)",
      bTasksAsExpected.some((t) => t.id === "task-b") && !bTasksAsExpected.some((t) => t.id === "task-a"));

    // ── 3) NEGATIV (Kontext-Guard): fehlender Mandant -> harter Fehler ─────────
    const guardedReaders = [
      "getTasks", "getUserNotes", "getInteractions", "getLageChecks",       // 2026-07 gehaertet
      "getLatestBriefing", "getLatestLageCheck", "getTopicMemory",           // Sprint-1 gehaertet
      "getLatestPipelineDebugReport", "getPushSubscriptions", "listPushEvents"
    ];
    for (const fn of guardedReaders) {
      const eNull = await throwsTenant(() => storage[fn](null));
      const eEmpty = await throwsTenant(() => storage[fn](""));
      check(`${fn}(null) wirft TenantContextError`, eNull && eNull.code === "TENANT_CONTEXT_REQUIRED", String(eNull));
      check(`${fn}("") wirft ebenfalls`, Boolean(eEmpty));
    }
    const eDedupe = await throwsTenant(() => storage.getPushEventByDedupeKey(null, "k"));
    check("getPushEventByDedupeKey(null) wirft TenantContextError", eDedupe && eDedupe.code === "TENANT_CONTEXT_REQUIRED");

    // ── 4) NEGATIV (Schreib-Guard, Testluecke c): A kann nicht fuer B schreiben ─
    // 4a) Gemischte Mandanten in EINER Bulk-Write -> CrossTenantWriteError.
    const mixed = await throwsTenant(() => storage.saveDecisions([
      { id: "d1", user_id: A, score: 1 }, { id: "d2", user_id: B, score: 1 }
    ]));
    check("saveDecisions mit gemischten Mandanten -> CROSS_TENANT_WRITE",
      mixed && mixed.code === "CROSS_TENANT_WRITE", String(mixed));
    const mixedM = await throwsTenant(() => storage.saveMatchingResults([
      { id: "m1", user_id: A }, { id: "m2", user_id: B }
    ]));
    check("saveMatchingResults mit gemischten Mandanten -> CROSS_TENANT_WRITE",
      mixedM && mixedM.code === "CROSS_TENANT_WRITE");

    // 4b) Aufrufer erwartet A, Zeile gehoert B -> CrossTenantWriteError.
    const wrongOwner = await throwsTenant(() => storage.saveDecisions([{ id: "d3", user_id: B, score: 1 }], A));
    check("saveDecisions([B-Zeile], expected=A) -> CROSS_TENANT_WRITE",
      wrongOwner && wrongOwner.code === "CROSS_TENANT_WRITE", String(wrongOwner));

    // 4c) Erwarteter Mandant stimmt -> KEIN Guard-Fehler (Positiv-Gegenprobe).
    // (v3StoreReady ist im lokalen Modus false -> die Zeile wird nicht wirklich
    //  geschrieben; entscheidend ist, dass der Guard NICHT wirft.)
    const okOwner = await throwsTenant(() => storage.saveDecisions([{ id: "d4", user_id: A, score: 1 }], A));
    check("saveDecisions([A-Zeile], expected=A) -> KEIN Guard-Fehler", okOwner === null, String(okOwner));

    // 4d) Datentragende Zeile ohne user_id -> TenantContextError (Praesenz-Guard).
    const noOwner = await throwsTenant(() => storage.saveDecisions([{ id: "d5", score: 1 }]));
    check("saveDecisions mit Zeile ohne user_id -> TenantContextError",
      noOwner && noOwner.code === "TENANT_CONTEXT_REQUIRED", String(noOwner));

    // ── 5) Datenintegritaet nach den Angriffsversuchen: B unveraendert ─────────
    const bTasksAfter = await storage.getTasks(B);
    check("B-Daten nach allen Angriffsversuchen unveraendert (task-b vorhanden)",
      bTasksAfter.some((t) => t.id === "task-b"));

    // ── 6) LIVE-Grenze (Testluecke d): manipulierte politicianId wird gegen die
    //      Session validiert, NICHT uebernommen (server.js:285 nutzt pickPoliticianId).
    const auth = require("../lib/helmut/auth");
    check("Abgeordneter A fordert B an -> bekommt A (hart gebunden, requested ignoriert)",
      auth.pickPoliticianId({ role: "abgeordneter", politicianId: A }, B, [A]) === A);
    check("Referent mit Zuweisung nur A fordert B an -> Fallback A (nie die Fremd-ID)",
      auth.pickPoliticianId({ role: "referent" }, B, [A]) === A);
    check("Referent ohne Zuweisung -> null (kein Mandat)",
      auth.pickPoliticianId({ role: "referent" }, B, []) === null);
    check("getAllowedPoliticianIds: Abgeordneter nur eigenes Mandat",
      JSON.stringify(await auth.getAllowedPoliticianIds({ role: "abgeordneter", politicianId: A, id: "u-a" })) === JSON.stringify([A]));
    check("getAllowedPoliticianIds: unbekannte Rolle -> [] (kein Mandat)",
      JSON.stringify(await auth.getAllowedPoliticianIds({ role: "unbekannt", id: "u-x" })) === "[]");
  } finally {
    files.forEach((f, i) => {
      if (backups[i] != null) fs.writeFileSync(f, backups[i]);
      else if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  }

  console.log(`\n${passed}/${passed + failed} Cross-Tenant-Sicherheits-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
