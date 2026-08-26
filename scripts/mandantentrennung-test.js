"use strict";

// Datenschutz #9 — Mandantentrennung: Nutzer A erhält NIEMALS Daten, Briefings,
// Fehlerdetails oder Profile von Nutzer B.
//
// Belegt gegen den echten Storage-Layer (lokaler Dateispeicher, Snapshot/Restore):
//  * DATEN/LAGE: getLageChecks(A) liefert nur A; ohne Mandantenkontext -> harter
//    TenantContextError (kein Cross-Tenant-Leak).
//  * BRIEFINGS: getLatestBriefing(A) liefert nur A's Briefing, nie B's.
//  * FEHLERDETAILS: der neue Pipeline-Fehler-Sammler (P0-3) speichert nur eine
//    PSEUDONYME Nutzerkennung + technische Metadaten — KEINE Inhalte des anderen
//    Mandanten; die Einträge sind global (Admin-only), nicht per-Nutzer abrufbar.
//  * PROFILE: getProfile(A) liefert nur A's Profil, nie B's.
//
// Nur SYNTHETISCHE Mandanten (…-synthetic). KEIN Netz/DB.

const fs = require("fs");
const path = require("path");

process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.SUPABASE_URL;

const storage = require("../lib/helmut/storage");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const A = "tenant-a-synthetic";
const B = "tenant-b-synthetic";

const dataDir = path.join(__dirname, "..", ".helmut-data");
// Alle betroffenen Dateien sichern und am Ende wiederherstellen.
const files = ["store.json", "auth.json", `p-${A}.json`, `p-${B}.json`].map((f) => path.join(dataDir, f));
const backups = files.map((f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null));

(async () => {
  try {
    // ── LAGE/DATEN ──────────────────────────────────────────────────────────
    await storage.saveLageCheck({ politicianId: A, mode: "lage-check", status: "changed", message: "A-only" });
    await storage.saveLageCheck({ politicianId: B, mode: "lage-check", status: "changed", message: "B-only" });
    const aChecks = await storage.getLageChecks(A, 12);
    const bChecks = await storage.getLageChecks(B, 12);
    check("Lage: A erhält nur A-Daten", aChecks.length > 0 && aChecks.every((c) => c.politicianId === A));
    check("Lage: B erhält nur B-Daten", bChecks.length > 0 && bChecks.every((c) => c.politicianId === B));
    check("Lage: A-Daten enthalten NICHTS von B", JSON.stringify(aChecks).indexOf("B-only") === -1);
    let threw = false;
    try { await storage.getLageChecks(null, 12); } catch (e) { threw = e && e.name === "TenantContextError"; }
    check("Lage: ohne Mandantenkontext -> harter TenantContextError", threw === true);

    // ── BRIEFINGS ─────────────────────────────────────────────────────────────
    await storage.saveBriefing({ id: "bf-a", politicianId: A, homeSections: {}, marker: "BRIEF-A" });
    await storage.saveBriefing({ id: "bf-b", politicianId: B, homeSections: {}, marker: "BRIEF-B" });
    const aBrief = await storage.getLatestBriefing(A);
    const bBrief = await storage.getLatestBriefing(B);
    check("Briefing: A erhält nur A's Briefing", aBrief && aBrief.politicianId === A && aBrief.marker === "BRIEF-A");
    check("Briefing: B erhält nur B's Briefing", bBrief && bBrief.politicianId === B && bBrief.marker === "BRIEF-B");
    check("Briefing: A's Briefing enthält NICHTS von B", JSON.stringify(aBrief).indexOf("BRIEF-B") === -1);

    // ── FEHLERDETAILS (P0-3 Pipeline-Fehler-Sammler) ──────────────────────────
    await storage.recordPipelineError({ process: "understanding-eager", userId: A, sourceId: "src-a", error: new Error("timeout") });
    await storage.recordPipelineError({ process: "matching-shadow", userId: B, sourceId: "src-b", error: new Error("db conflict 409") });
    const errors = await storage.readAuthStore().then((s) => s.systemErrors || []);
    const aErr = errors.find((e) => e.userId === A);
    const bErr = errors.find((e) => e.userId === B);
    check("Fehler: A-Eintrag existiert mit pseudonymer Kennung", Boolean(aErr) && aErr.userId === A);
    check("Fehler: A-Eintrag enthält NICHTS von B (keine cross-tenant Inhalte)",
      aErr && JSON.stringify(aErr).indexOf(B) === -1 && !("message" in aErr));
    check("Fehler: nur technische Metadaten (klassifizierter Fehlertyp, kein Rohtext)",
      aErr && aErr.errorType && !("message" in aErr) && typeof aErr.process === "string");
    check("Fehler: B-Eintrag getrennt", Boolean(bErr) && bErr.userId === B && JSON.stringify(bErr).indexOf(A) === -1);

    // ── PROFILE ───────────────────────────────────────────────────────────────
    await storage.saveProfile({ id: A, name: "Profil A", partei: "Partei A" });
    await storage.saveProfile({ id: B, name: "Profil B", partei: "Partei B" });
    const aProfile = await storage.getProfile(A);
    const bProfile = await storage.getProfile(B);
    check("Profil: A erhält nur A's Profil", aProfile && aProfile.id === A);
    check("Profil: B erhält nur B's Profil", bProfile && bProfile.id === B);
    check("Profil: A's Profil enthält NICHTS von B", JSON.stringify(aProfile || {}).indexOf("Profil B") === -1 && JSON.stringify(aProfile || {}).indexOf("Partei B") === -1);

    // ── GEBUENDELTE ANTWORTEN (Skalierungsstufe 26.08.) ───────────────────────
    // Der Gesundheitsbericht liest die Mandantenspeicher jetzt STAPELWEISE
    // (`leseMandantenSpeicherGebuendelt`). Eine gebuendelte Antwort kann Zeilen
    // mehrerer Mandate enthalten — die Auswerter muessen deshalb GENAU dieselbe
    // Mandantenpruefung tragen wie der Einzelpfad. Ein verschmutzter Speicher
    // (fremde Zeilen im selben Objekt) ist hier der Ernstfall.
    const verschmutzt = {
      lageChecks: [
        { politicianId: B, checkedAt: "2026-08-26T03:00:00Z", note: "Lage B" },
        { politicianId: A, checkedAt: "2026-08-26T02:00:00Z", note: "Lage A" }
      ],
      pushEvents: [
        { politicianId: B, dedupeKey: "briefing-push:" + B + ":2026-08-26:x:y", delivered: 99, failed: 7 },
        { politicianId: A, dedupeKey: "briefing-push:" + A + ":2026-08-26:x:y", delivered: 1, failed: 0 }
      ],
      pushSubscriptions: [
        { politicianId: B, endpoint: "https://push.example/b", active: true },
        { politicianId: A, endpoint: "https://push.example/a", active: true },
        { politicianId: A, endpoint: "https://push.example/a-alt", active: false }
      ]
    };
    const lageA = storage.lageCheckAusSpeicher(verschmutzt, A);
    check("Stapel: Lage-Auswerter liefert NUR die Zeile des angefragten Mandats",
      Boolean(lageA) && lageA.politicianId === A && lageA.note === "Lage A",
      JSON.stringify(lageA));
    const pushA = storage.pushUebersichtAusSpeicher(verschmutzt, A);
    check("Stapel: Push-Auswerter verwirft fremde Ereignisse und Abos",
      pushA.events.length === 1 && pushA.events[0].politicianId === A
        && pushA.subscriptions.length === 1 && pushA.subscriptions[0].politicianId === A,
      JSON.stringify(pushA));
    check("Stapel: keine fremde Kennung und kein fremder Zaehler im Ergebnis",
      JSON.stringify({ lageA, pushA }).indexOf(B) === -1
        && JSON.stringify(pushA).indexOf("99") === -1,
      JSON.stringify({ lageA, pushA }));
    check("Stapel: inaktives Abo des EIGENEN Mandats zaehlt nicht mit",
      pushA.subscriptions.every((x) => x.active !== false));
    let ohneKontext = null;
    try { storage.pushUebersichtAusSpeicher(verschmutzt, ""); }
    catch (error) { ohneKontext = error; }
    check("Stapel: fehlender Mandantenkontext ist ein harter Fehler, kein Leerergebnis",
      Boolean(ohneKontext), String(ohneKontext && ohneKontext.message));
    // Der Altbestand-Rueckfall des Lage-Checks bleibt mandatsscharf.
    const lageB = storage.lageCheckAusSpeicher({ lageChecks: [] }, A, verschmutzt);
    check("Stapel: Hauptspeicher-Rueckfall liefert ebenfalls nur das eigene Mandat",
      Boolean(lageB) && lageB.politicianId === A, JSON.stringify(lageB));
  } finally {
    // Wiederherstellen (byte-genau) bzw. Testdateien entfernen.
    files.forEach((f, i) => {
      if (backups[i] != null) fs.writeFileSync(f, backups[i]);
      else if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  }

  console.log(`\n${passed}/${passed + failed} Mandantentrennungs-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})();
