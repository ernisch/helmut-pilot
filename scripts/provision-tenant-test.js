"use strict";

// Sprint 1 (Teil 4/6) — Zweitmandanten-Provisionierung: idempotent, sauberer
// Abbruch, kein halber Account, Deaktivierung ohne Fremddaten, Schutz echter
// Mandanten. Zwei SYNTHETISCHE Testmandanten. KEIN Netz, KEINE echte DB.

const fs = require("fs");
const path = require("path");

process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const storage = require("../lib/helmut/storage");
const accounts = require("../lib/helmut/accounts");
const provisioning = require("../lib/helmut/provisioning");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const A = "prov-a-synthetic";
const B = "prov-b-synthetic";
const specA = {
  id: A, email: "a@synthetic.test", name: "Test Abgeordnete A", password: "test-pass-123",
  party: "SPD", parliamentType: "Bundestag", state: "Berlin", constituency: "Mitte",
  committees: ["Arbeit und Soziales"], focusTopics: ["Rente"], aiBudgetDailyCents: 500, tenantDailyCallLimit: 30
};
const specB = {
  id: B, email: "b@synthetic.test", name: "Test Abgeordneter B", password: "test-pass-456",
  party: "Die Linke", parliamentType: "Bundestag", state: "Sachsen", constituency: "Leipzig",
  committees: ["Haushalt"], focusTopics: ["Finanzen"]
};

const dataDir = path.join(__dirname, "..", ".helmut-data");
const guarded = ["store.json", "auth.json", `p-${A}.json`, `p-${B}.json`].map((f) => path.join(dataDir, f));
const backups = guarded.map((f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null));

async function countUsers(politicianId) {
  return (await accounts.listUsers()).filter((u) => u.politicianId === politicianId).length;
}
async function countProfiles(id) {
  const profs = await storage.listProfiles();
  return profs.filter((p) => p.id === id).length;
}

(async () => {
  try {
    // ── 1) Provisionierung A: vollständig, bereit, Pakete abgeleitet ───────────
    const r1 = await provisioning.provisionTenant(specA);
    check("A provisioniert (ok, created)", r1.ok === true && r1.created === true, JSON.stringify(r1.reason || r1.errors));
    check("A: Auth-Nutzer + Profil vorhanden", (await countUsers(A)) === 1 && (await countProfiles(A)) === 1);
    check("A: matching-/briefingbereit", r1.readiness.kannBriefingErhalten === true && r1.readiness.kannMatching === true);
    check("A: Pflichtpaket bund-basis + Fachpaket arbeit-und-soziales abgeleitet",
      r1.packages && r1.packages.required.includes("bund-basis") && r1.packages.optional.includes("arbeit-und-soziales"), JSON.stringify(r1.packages));
    check("A: Budgetkonfiguration übernommen", r1.budget.aiBudgetDailyCents === 500 && r1.budget.tenantDailyCallLimit === 30);

    // ── 2) IDEMPOTENZ: erneut A -> aktualisiert, KEINE Dublette ────────────────
    const r2 = await provisioning.provisionTenant(specA);
    check("A erneut: ok + updated (nicht created)", r2.ok === true && r2.updated === true && r2.created === false);
    check("A erneut: weiterhin genau 1 Nutzer + 1 Profil (keine Dublette)", (await countUsers(A)) === 1 && (await countProfiles(A)) === 1);

    // ── 3) Zweiter Mandant B: getrennt, keine Cross-Contamination ──────────────
    const rB = await provisioning.provisionTenant(specB);
    check("B provisioniert getrennt", rB.ok === true && (await countUsers(B)) === 1 && (await countProfiles(B)) === 1);
    const profA = await storage.getProfile(A);
    const profB = await storage.getProfile(B);
    check("A- und B-Profile getrennt (Partei/Wahlkreis unterschiedlich)",
      profA.party === "SPD" && profB.party === "Die Linke" && profA.constituency !== profB.constituency);
    check("B: Die-Linke-Paket abgeleitet, A NICHT", rB.packages.optional.includes("die-linke-bund") && !r1.packages.optional.includes("die-linke-bund"));

    // ── 4) Pflichtfeld-Abbruch: OHNE Schreibvorgang ───────────────────────────
    const badSpec = { id: "prov-c-synthetic", email: "c@synthetic.test", name: "C", password: "test-pass-789", parliamentType: "Bundestag" }; // party+region+committee fehlen
    const rBad = await provisioning.provisionTenant(badSpec);
    check("unvollständige Spec -> Abbruch (spec-invalid)", rBad.ok === false && rBad.reason === "spec-invalid" && rBad.errors.length > 0);
    check("Abbruch hinterlässt KEINEN Account/Profil", (await countUsers("prov-c-synthetic")) === 0 && (await countProfiles("prov-c-synthetic")) === 0);

    // ── 5) HALBER-ACCOUNT-ROLLBACK: Profil-Write scheitert -> Auth zurückgerollt ─
    const failId = "prov-d-synthetic";
    const failSpec = { ...specA, id: failId, email: "d@synthetic.test" };
    const throwingStorage = Object.assign(Object.create(storage), storage, { saveProfile: async () => { throw new Error("simulierter Store-Fehler"); } });
    const rFail = await provisioning.provisionTenant(failSpec, { storage: throwingStorage });
    check("Profil-Write-Fehler -> Abbruch (profile-write-failed)", rFail.ok === false && rFail.reason === "profile-write-failed");
    check("KEIN halber Account: neu angelegter Auth-Nutzer wurde zurückgerollt", (await countUsers(failId)) === 0, `users=${await countUsers(failId)}`);
    check("Rollback-Schritt im Protokoll dokumentiert", rFail.log.some((s) => s.step === "rollback" && s.status === "ok"));

    // ── 6) SCHUTZ echter Mandanten (cem-ince/james-brown/angela-merkel) ────────
    for (const prot of ["cem-ince", "james-brown", "angela-merkel"]) {
      const rp = await provisioning.provisionTenant({ ...specA, id: prot, email: `${prot}@x.test` });
      check(`Provisionierung von ${prot} verweigert (protected-tenant)`, rp.ok === false && rp.reason === "protected-tenant");
      const rd = await provisioning.deactivateTenant(prot);
      check(`Deaktivierung von ${prot} verweigert`, rd.ok === false && rd.reason === "protected-tenant");
      const rt = await provisioning.teardownTenant(prot);
      check(`Löschung von ${prot} verweigert`, rt.ok === false && rt.reason === "protected-tenant");
    }
    check("isProtected erkennt geschützte, nicht synthetische", provisioning.isProtected("james-brown") && !provisioning.isProtected(A));

    // ── 7) DEAKTIVIERUNG isoliert: A deaktiviert, B unberührt ──────────────────
    const rDeact = await provisioning.deactivateTenant(A);
    check("A deaktiviert (reversibel)", rDeact.ok === true && rDeact.deactivated === true && rDeact.reversible === true);
    const aUser = (await accounts.listUsers()).find((u) => u.politicianId === A);
    const aProf = await storage.getProfile(A);
    check("A: Login gesperrt (status deaktiviert) + Profil inaktiv", aUser.status === "deaktiviert" && aProf.profileActive === false);
    const bUser = (await accounts.listUsers()).find((u) => u.politicianId === B);
    const bProf = await storage.getProfile(B);
    check("B von A-Deaktivierung UNBERÜHRT", bUser.status !== "deaktiviert" && bProf.profileActive !== false);

    // ── 8) TEARDOWN isoliert: A entfernt, B bleibt ─────────────────────────────
    await provisioning.teardownTenant(A);
    check("A vollständig entfernt (0 Nutzer, 0 Profil)", (await countUsers(A)) === 0 && (await countProfiles(A)) === 0);
    check("B nach A-Teardown weiterhin vorhanden", (await countUsers(B)) === 1 && (await countProfiles(B)) === 1);
  } finally {
    guarded.forEach((f, i) => {
      if (backups[i] != null) fs.writeFileSync(f, backups[i]);
      else if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  }

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
