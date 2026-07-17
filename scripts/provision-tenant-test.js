"use strict";

// Sprint 1 (Teil 4/6) — Mandanten-Provisionierung: idempotent, sauberer
// Abbruch, kein halber Account, Deaktivierung ohne Fremddaten, DATENGETRIEBENER
// Bestandsschutz (kein Namensregister im Code). Ausschliesslich SYNTHETISCHE
// Testmandanten. KEIN Netz, KEINE echte DB.

const fs = require("fs");
const path = require("path");

process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const storage = require("../lib/helmut/storage");
const accounts = require("../lib/helmut/accounts");
const provisioning = require("../lib/helmut/provisioning");
const { testPoliticianOne, testPoliticianTwo, TENANT_ALPHA, TENANT_BETA } = require("./fixtures/test-profiles");

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
const guarded = ["store.json", "auth.json", `p-${A}.json`, `p-${B}.json`, `p-${TENANT_ALPHA}.json`, `p-${TENANT_BETA}.json`, "p-tenant-bestand.json", "p-raw-test-synthetic.json", "p-prot-mail-synthetic.json"].map((f) => path.join(dataDir, f));
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

    // ── 6) DATENGETRIEBENER Bestandsschutz (keine Namensliste im Code) ─────────
    // (a) Vorbestehendes Profil OHNE provisionedBy-Marker (z. B. manuell/extern
    //     angelegt) ist geschützt: kein Anlegen/Deaktivieren/Löschen hierüber.
    const BESTAND = "tenant-bestand";
    await storage.saveProfile({ id: BESTAND, fullName: "Bestand Mandant", party: "Testpartei Alpha", parliamentType: "Bundestag", state: "Berlin", constituency: "Mitte", committees: ["Haushalt"] });
    check("(a) Profil OHNE Marker -> isProtectedTenant true", (await provisioning.isProtectedTenant(BESTAND)) === true);
    const rpBestand = await provisioning.provisionTenant({ ...specA, id: BESTAND, email: "bestand@synthetic.test" });
    check("(a) Provisionierung über Bestandsprofil verweigert (protected-tenant)", rpBestand.ok === false && rpBestand.reason === "protected-tenant");
    const rdBestand = await provisioning.deactivateTenant(BESTAND);
    check("(a) Deaktivierung des Bestandsmandanten verweigert", rdBestand.ok === false && rdBestand.reason === "protected-tenant");
    const rtBestand = await provisioning.teardownTenant(BESTAND);
    check("(a) Löschung des Bestandsmandanten verweigert", rtBestand.ok === false && rtBestand.reason === "protected-tenant");
    const bestandAfter = await storage.getProfile(BESTAND);
    check("(a) Bestandsprofil nach allen Verweigerungen unverändert vorhanden (kein Account angelegt)",
      Boolean(bestandAfter) && bestandAfter.provisionedBy === undefined && (await countUsers(BESTAND)) === 0);
    // Auch ein Auth-Konto OHNE Profil ist Bestand -> geschützt.
    await accounts.createUser({ email: "nur-auth@synthetic.test", name: "Nur Auth", role: "abgeordneter", password: "test-pass-000", politicianId: "tenant-nur-auth" });
    check("(a) Auth-Konto ohne Profil -> geschützt", (await provisioning.isProtectedTenant("tenant-nur-auth")) === true);

    // (b) Selbst provisionierter Mandant (mit Marker) ist NICHT geschützt:
    //     idempotentes Update und Teardown sind erlaubt.
    const specAlpha = {
      id: TENANT_ALPHA, email: "alpha@synthetic.test", name: testPoliticianOne.fullName,
      password: "test-pass-alpha", party: testPoliticianOne.party, parliamentType: testPoliticianOne.parliamentType,
      state: testPoliticianOne.state, constituency: testPoliticianOne.constituency,
      committees: testPoliticianOne.committees, focusTopics: testPoliticianOne.focusTopics
    };
    const rAlpha1 = await provisioning.provisionTenant(specAlpha);
    check("(b) tenant-alpha provisioniert, Profil trägt PROVISIONING_MARKER",
      rAlpha1.ok === true && (await storage.getProfile(TENANT_ALPHA)).provisionedBy === provisioning.PROVISIONING_MARKER);
    check("(b) selbst provisionierter Mandant ist NICHT geschützt", (await provisioning.isProtectedTenant(TENANT_ALPHA)) === false);
    const rAlpha2 = await provisioning.provisionTenant(specAlpha);
    check("(b) idempotentes Update erlaubt (updated, keine Dublette)",
      rAlpha2.ok === true && rAlpha2.updated === true && (await countUsers(TENANT_ALPHA)) === 1 && (await countProfiles(TENANT_ALPHA)) === 1);

    // (c) Betreiber-Sperrliste per Env (HELMUT_PROTECTED_TENANT_IDS) schützt auch frische ids.
    process.env.HELMUT_PROTECTED_TENANT_IDS = "tenant-gesperrt";
    check("(c) Env-gelistete id ist geschützt", (await provisioning.isProtectedTenant("tenant-gesperrt")) === true);
    const rGesperrt = await provisioning.provisionTenant({ ...specA, id: "tenant-gesperrt", email: "gesperrt@synthetic.test" });
    check("(c) Provisionierung der Env-gesperrten id verweigert (protected-tenant)", rGesperrt.ok === false && rGesperrt.reason === "protected-tenant");
    delete process.env.HELMUT_PROTECTED_TENANT_IDS;
    check("(c) ohne Env-Eintrag ist dieselbe (frische) id wieder erlaubt", (await provisioning.isProtectedTenant("tenant-gesperrt")) === false);

    // (d) Teardown ist strikt mandantsgescoped: tenant-alpha entfernen berührt
    //     das vorbestehende tenant-beta-Profil NICHT.
    await storage.saveProfile({ ...testPoliticianTwo, id: TENANT_BETA });
    const rtAlpha = await provisioning.teardownTenant(TENANT_ALPHA);
    check("(d) Teardown des selbst provisionierten tenant-alpha erlaubt (0 Nutzer, 0 Profil)",
      rtAlpha.ok === true && (await countUsers(TENANT_ALPHA)) === 0 && (await countProfiles(TENANT_ALPHA)) === 0);
    const betaAfter = await storage.getProfile(TENANT_BETA);
    check("(d) tenant-beta-Profil bleibt nach Alpha-Teardown vollständig erhalten",
      Boolean(betaAfter) && betaAfter.fullName === testPoliticianTwo.fullName && betaAfter.party === testPoliticianTwo.party);

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

    // ── 9) KEINE Kontoübernahme: fremde E-Mail (Admin) wird NICHT degradiert ────
    await accounts.createUser({ email: "admin-collide@synthetic.test", name: "Admin", role: "admin", password: "test-pass-999" });
    const rHijack = await provisioning.provisionTenant({ ...specB, id: "hijack-target-synthetic", email: "admin-collide@synthetic.test" });
    check("Provisionierung mit fremder (Admin-)E-Mail -> Abbruch (email-belongs-to-other-account)",
      rHijack.ok === false && rHijack.reason === "email-belongs-to-other-account");
    const adminAfter = (await accounts.listUsers()).find((u) => u.email === "admin-collide@synthetic.test");
    check("Admin-Konto NICHT zum Abgeordneten degradiert/umgebunden",
      adminAfter && adminAfter.role === "admin" && (adminAfter.politicianId == null));
    check("Kein Konto für hijack-target-synthetic angelegt", (await countUsers("hijack-target-synthetic")) === 0);

    // ── 10) TEARDOWN löscht KEINE geteilten Personen-/News-Rohdaten Fremder ─────
    const mainSeed = await storage.readStore("main");
    mainSeed.rawItems = [
      { id: "raw-person-foreign", sourceType: "person", politicianId: "anderer-mandant-synthetic", title: "Fremd-Person" },
      { id: "raw-own", sourceType: "news", politicianId: "raw-test-synthetic", title: "Eigenes" }
    ];
    await storage.writeStore(mainSeed, "main");
    await provisioning.provisionTenant({ ...specA, id: "raw-test-synthetic", email: "rawtest@synthetic.test" });
    await provisioning.teardownTenant("raw-test-synthetic");
    const mainAfter = await storage.readStore("main");
    const rawIds = (mainAfter.rawItems || []).map((r) => r.id);
    check("Teardown erhält FREMDES Personen-Rohitem (kein Kollateralschaden an anderen Mandanten)",
      rawIds.includes("raw-person-foreign"), JSON.stringify(rawIds));
    check("Teardown entfernt das EIGENE Rohitem des Mandanten", !rawIds.includes("raw-own"));

    // ── 11) DSGVO: Ergebnisprotokoll enthält KEINE Klartext-E-Mail (nur maskiert) ─
    check("maskEmail maskiert lokalen Teil, behält Domain",
      provisioning.maskEmail("admin-collide@synthetic.test") === "a************@synthetic.test");
    const rProtokoll = await provisioning.provisionTenant({ ...specA, id: "prot-mail-synthetic", email: "geheim.person@synthetic.test" });
    const protokollText = provisioning.formatProtocol(rProtokoll) + JSON.stringify(rProtokoll.log);
    check("Provisionierungs-Protokoll enthält KEINE volle E-Mail (nur maskiert)",
      !protokollText.includes("geheim.person@synthetic.test") && protokollText.includes("@synthetic.test"));
    await provisioning.teardownTenant("prot-mail-synthetic");
  } finally {
    guarded.forEach((f, i) => {
      if (backups[i] != null) fs.writeFileSync(f, backups[i]);
      else if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  }

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
