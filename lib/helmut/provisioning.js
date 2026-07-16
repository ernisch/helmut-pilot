"use strict";

// Zweitmandanten-Provisionierung (Sprint 1) — sicherer, idempotenter Admin-Prozess.
//
// KEIN öffentlicher Self-Service, KEIN Referentenzugang. Ein Admin legt mit EINEM
// Aufruf einen vollständigen Abgeordneten-Mandanten an bzw. aktualisiert ihn:
//   Auth-Nutzer · Mandatsprofil · Partei · Ebene · Geografie · Ausschüsse/Themen ·
//   Quellenpaket-Zuordnung (deterministisch aus dem Profil) · Budgetkonfiguration ·
//   Grundeinstellungen · Matching-/Briefing-Bereitschaft (validiert).
//
// Garantien:
//   * WIEDERHOLBAR ohne Dubletten: Nutzer wird per E-Mail, Profil per id ge-upsertet.
//   * PFLICHTFELDER validiert BEVOR geschrieben wird (validate-first).
//   * SAUBERER ABBRUCH: bei Fehler nach dem Auth-Write wird ein in DIESEM Lauf neu
//     angelegter Nutzer wieder entfernt -> kein halber Account.
//   * ERGEBNISPROTOKOLL (log[] + formatProtocol()).
//   * DEAKTIVIERUNG ohne Fremddaten zu berühren (strikt auf die id gescoped).
//   * SCHUTZ echter Mandanten: cem-ince / james-brown / angela-merkel sind
//     hart gesperrt (kein Anlegen/Deaktivieren/Löschen über dieses Werkzeug).
//
// Alle Abhängigkeiten sind injizierbar (deps) — die Tests laufen offline im
// lokalen Dateimodus mit synthetischen Mandanten.

// Echte Production-Profile, die dieses Werkzeug NIEMALS anfassen darf.
const PROTECTED_TENANT_IDS = new Set(["cem-ince", "james-brown", "angela-merkel"]);

function slugify(value) {
  return String(value || "")
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isProtected(id) {
  return PROTECTED_TENANT_IDS.has(slugify(id));
}

function hasStr(v) { return String(v || "").trim().length > 0; }
function hasList(v) { return Array.isArray(v) && v.some((x) => hasStr(x)); }

function levelOf(spec) {
  const raw = String(spec.parliamentType || spec.politicalLevel || "").trim().toLowerCase();
  if (raw.includes("landtag") || raw === "land" || raw.startsWith("landes")) return "Landtag";
  if (raw.includes("bundestag") || raw === "bund" || raw.startsWith("bundes")) return "Bundestag";
  return "";
}

// Pflichtfeld-Prüfung VOR jedem Schreibvorgang. Gibt eine Liste klarer Fehler zurück.
function validateSpec(spec = {}) {
  const errors = [];
  if (!hasStr(spec.id)) errors.push("id fehlt (Mandant-/Profil-Kennung)");
  else if (slugify(spec.id) !== String(spec.id)) errors.push(`id "${spec.id}" ist kein sauberer Slug (nur a-z, 0-9, Bindestrich)`);
  if (!hasStr(spec.email)) errors.push("email fehlt (Auth-Nutzer)");
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(spec.email).trim())) errors.push(`email "${spec.email}" ist ungültig`);
  if (!hasStr(spec.name)) errors.push("name fehlt");
  if (!hasStr(spec.password) || String(spec.password).length < 8) errors.push("password fehlt oder < 8 Zeichen");
  if (!hasStr(spec.party) && !hasStr(spec.faction)) errors.push("party (oder faction) fehlt");
  const level = levelOf(spec);
  if (!level) errors.push("parliamentType fehlt (Bundestag|Landtag)");
  if (level === "Landtag" && !hasStr(spec.state) && !hasStr(spec.bundesland)) errors.push("bundesland/state fehlt (Landtag)");
  if (!hasStr(spec.constituency) && !hasStr(spec.wahlkreis) && !hasStr(spec.state) && !hasStr(spec.bundesland) && !hasStr(spec.region)) {
    errors.push("region fehlt (constituency/wahlkreis/state/region)");
  }
  if (!hasList(spec.committees) && !hasStr(spec.committee) && !hasList(spec.focusTopics)) {
    errors.push("mind. ein Ausschuss (committees) oder Thema (focusTopics) fehlt");
  }
  for (const [k, label] of [["aiBudgetDailyCents", "KI-Tagesbudget"], ["aiBudgetMonthlyCents", "KI-Monatsbudget"]]) {
    if (spec[k] === undefined || spec[k] === null || spec[k] === "") continue;
    const n = Number(spec[k]);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) errors.push(`${label} (${k}) muss eine positive Ganzzahl sein`);
  }
  if (spec.tenantDailyCallLimit !== undefined && spec.tenantDailyCallLimit !== null && spec.tenantDailyCallLimit !== "") {
    const n = Number(spec.tenantDailyCallLimit);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) errors.push("tenantDailyCallLimit muss eine positive Ganzzahl sein");
  }
  return errors;
}

// Baut aus der Spec ein Profil-Objekt, wie es validateProfile/saveProfile/
// resolveProfilePackages erwarten (camelCase). Setzt Grundeinstellungen.
function buildProfile(spec = {}) {
  const level = levelOf(spec);
  const profile = {
    id: String(spec.id),
    fullName: String(spec.name || "").trim(),
    party: hasStr(spec.party) ? String(spec.party).trim() : "",
    faction: hasStr(spec.faction) ? String(spec.faction).trim() : (hasStr(spec.party) ? String(spec.party).trim() : ""),
    parliamentType: level,
    politicalLevel: level === "Landtag" ? "Land" : "Bund", // Legacy-/Blob-Kompat
    state: hasStr(spec.state) ? String(spec.state).trim() : (hasStr(spec.bundesland) ? String(spec.bundesland).trim() : ""),
    constituency: hasStr(spec.constituency) ? String(spec.constituency).trim() : (hasStr(spec.wahlkreis) ? String(spec.wahlkreis).trim() : (hasStr(spec.region) ? String(spec.region).trim() : "")),
    committees: hasList(spec.committees) ? spec.committees.map((c) => String(c).trim()).filter(Boolean) : (hasStr(spec.committee) ? [String(spec.committee).trim()] : []),
    focusTopics: hasList(spec.focusTopics) ? spec.focusTopics.map((t) => String(t).trim()).filter(Boolean) : [],
    profileActive: true,
    onboardingStatus: "abgeschlossen"
  };
  if (spec.aiBudgetDailyCents !== undefined && spec.aiBudgetDailyCents !== null && spec.aiBudgetDailyCents !== "") profile.aiBudgetDailyCents = Number(spec.aiBudgetDailyCents);
  if (spec.aiBudgetMonthlyCents !== undefined && spec.aiBudgetMonthlyCents !== null && spec.aiBudgetMonthlyCents !== "") profile.aiBudgetMonthlyCents = Number(spec.aiBudgetMonthlyCents);
  return profile;
}

function log(entries, step, status, detail) {
  entries.push({ step, status, detail: detail || null });
  return entries;
}

// Der Kern-Ablauf. deps: { accounts, storage, validation, packages }.
async function provisionTenant(spec = {}, deps = {}) {
  const accounts = deps.accounts || require("./accounts");
  const storage = deps.storage || require("./storage");
  const { validateProfile } = deps.validation || require("./profile-validation");
  const { resolveProfilePackages, profileSupplyStatus } = deps.packages || require("./quellenarchitektur/profile-packages");
  const entries = [];

  // 0) Schutz echter Mandanten.
  if (isProtected(spec.id)) {
    log(entries, "schutz", "abbruch", `${spec.id} ist ein geschützter Production-Mandant — Provisionierung verweigert.`);
    return { ok: false, aborted: true, reason: "protected-tenant", tenantId: spec.id, log: entries };
  }

  // 1) Pflichtfelder VOR jedem Schreibvorgang prüfen.
  const specErrors = validateSpec(spec);
  if (specErrors.length) {
    log(entries, "spec-validierung", "abbruch", `${specErrors.length} Pflichtfeld-Fehler`);
    return { ok: false, aborted: true, reason: "spec-invalid", errors: specErrors, tenantId: spec.id, log: entries };
  }
  log(entries, "spec-validierung", "ok", "Pflichtfelder vollständig");

  // 2) Profil bauen + fachlich validieren (nicht_bereit/fehlerhaft => Abbruch VOR Write).
  const profile = buildProfile(spec);
  const validation = validateProfile(profile);
  if (validation.state === "fehlerhaft" || validation.state === "nicht_bereit" || validation.state === "deaktiviert") {
    log(entries, "profil-validierung", "abbruch", `Zustand ${validation.state}: ${validation.reason}`);
    return { ok: false, aborted: true, reason: "profile-not-ready", validation, tenantId: spec.id, log: entries };
  }
  log(entries, "profil-validierung", "ok", `Zustand ${validation.state} (${validation.missingRequired.length} fehlende Felder)`);

  // 3) Konflikt-Vorprüfung: gehört die id/E-Mail schon jemand ANDEREM?
  const users = await accounts.listUsers();
  const emailNorm = accounts.normalizeEmail(spec.email);
  const byEmail = users.find((u) => accounts.normalizeEmail(u.email) === emailNorm) || null;
  const byPolitician = users.find((u) => u.politicianId === spec.id) || null;
  if (byEmail && byEmail.politicianId && byEmail.politicianId !== spec.id) {
    log(entries, "konflikt", "abbruch", `E-Mail ${spec.email} gehört bereits Mandant ${byEmail.politicianId}`);
    return { ok: false, aborted: true, reason: "email-belongs-to-other-tenant", tenantId: spec.id, log: entries };
  }
  if (byPolitician && byEmail && byPolitician.id !== byEmail.id) {
    log(entries, "konflikt", "abbruch", `Mandant-id ${spec.id} und E-Mail gehören verschiedenen Konten`);
    return { ok: false, aborted: true, reason: "id-email-mismatch", tenantId: spec.id, log: entries };
  }
  if (byPolitician && !byEmail) {
    // id ist an eine andere E-Mail gebunden -> nicht überschreiben (Idempotenz nur bei gleicher E-Mail).
    log(entries, "konflikt", "abbruch", `Mandant-id ${spec.id} ist bereits an eine andere E-Mail gebunden`);
    return { ok: false, aborted: true, reason: "id-belongs-to-other-email", tenantId: spec.id, log: entries };
  }

  // 4) Auth-Nutzer idempotent anlegen/aktualisieren.
  let user = null;
  let createdUserThisRun = false;
  try {
    if (byEmail) {
      user = await accounts.updateUser(byEmail.id, { name: spec.name, role: "abgeordneter", politicianId: spec.id, status: "aktiv" });
      log(entries, "auth-nutzer", "aktualisiert", `bestehendes Konto ${user.id} (${spec.email})`);
    } else {
      user = await accounts.createUser({ email: spec.email, name: spec.name, role: "abgeordneter", password: spec.password, politicianId: spec.id });
      createdUserThisRun = true;
      // createUser leitet die politicianId ggf. eindeutig ab — bei Kollision != spec.id.
      if (user.politicianId !== spec.id) {
        await accounts.deleteAuthDataForPolitician(user.politicianId).catch(() => {});
        log(entries, "auth-nutzer", "abbruch", `politicianId-Kollision: erwartet ${spec.id}, erhalten ${user.politicianId} — zurückgerollt`);
        return { ok: false, aborted: true, reason: "politician-id-collision", tenantId: spec.id, log: entries };
      }
      log(entries, "auth-nutzer", "angelegt", `neues Konto ${user.id} (${spec.email})`);
    }
  } catch (err) {
    log(entries, "auth-nutzer", "fehler", String(err && err.message || err).slice(0, 200));
    return { ok: false, aborted: true, reason: "auth-write-failed", tenantId: spec.id, log: entries };
  }

  // 5) Profil schreiben. Bei Fehler: neu angelegten Nutzer zurückrollen (kein halber Account).
  try {
    await storage.saveProfile(profile);
    log(entries, "profil", "gespeichert", `store.profiles[${spec.id}] + mandateProfiles`);
  } catch (err) {
    log(entries, "profil", "fehler", String(err && err.message || err).slice(0, 200));
    if (createdUserThisRun) {
      await accounts.deleteAuthDataForPolitician(spec.id).catch(() => {});
      log(entries, "rollback", "ok", `neu angelegter Nutzer ${spec.id} entfernt (kein halber Account)`);
    }
    return { ok: false, aborted: true, reason: "profile-write-failed", tenantId: spec.id, log: entries };
  }

  // 6) Quellenpaket-Zuordnung (deterministisch aus dem Profil) — Versorgungsnachweis.
  let packages = null;
  let supply = null;
  try {
    packages = resolveProfilePackages(profile);
    supply = profileSupplyStatus(profile);
    log(entries, "quellenpakete", "abgeleitet", `pflicht: ${packages.required.join(", ")} · optional: ${packages.optional.join(", ") || "—"}`);
  } catch (err) {
    log(entries, "quellenpakete", "warnung", `Paketableitung fehlgeschlagen (nicht fatal): ${String(err && err.message).slice(0, 120)}`);
  }

  // 7) Budget-/Kostendeckel-Konfiguration (Hinweis — env-Änderung ist freigabepflichtig).
  const budget = {
    aiBudgetDailyCents: profile.aiBudgetDailyCents ?? null,
    aiBudgetMonthlyCents: profile.aiBudgetMonthlyCents ?? null,
    tenantDailyCallLimit: spec.tenantDailyCallLimit != null && spec.tenantDailyCallLimit !== "" ? Number(spec.tenantDailyCallLimit) : null
  };
  log(entries, "budget", "konfiguriert", `EUR-Deckel Tag=${budget.aiBudgetDailyCents ?? "Systemdefault"} · per-Mandant-Callcap=${budget.tenantDailyCallLimit ?? "uniformer Default"}`);

  return {
    ok: true,
    created: createdUserThisRun,
    updated: !createdUserThisRun,
    tenantId: spec.id,
    userId: user.id,
    email: user.email,
    validation,
    packages,
    supply,
    budget,
    readiness: {
      kannBriefingErhalten: Boolean(validation.impact && validation.impact.kannBriefingErhalten),
      kannMatching: Boolean(validation.usable),
      quellenVersorgt: Boolean(supply && supply.fullyActivated)
    },
    log: entries
  };
}

// Reversible Deaktivierung eines Mandanten — berührt KEINE Fremddaten.
async function deactivateTenant(id, deps = {}) {
  const accounts = deps.accounts || require("./accounts");
  const storage = deps.storage || require("./storage");
  const entries = [];
  if (isProtected(id)) {
    log(entries, "schutz", "abbruch", `${id} ist ein geschützter Production-Mandant — Deaktivierung verweigert.`);
    return { ok: false, aborted: true, reason: "protected-tenant", tenantId: id, log: entries };
  }
  const users = await accounts.listUsers();
  const user = users.find((u) => u.politicianId === id) || null;
  if (user) {
    await accounts.updateUser(user.id, { status: "deaktiviert" });
    log(entries, "auth-nutzer", "deaktiviert", `Konto ${user.id} gesperrt (Login blockiert)`);
  } else {
    log(entries, "auth-nutzer", "übersprungen", "kein Konto zu dieser id");
  }
  const profile = await storage.getProfile(id);
  if (profile) {
    await storage.saveProfile({ ...profile, profileActive: false, deletedAt: null });
    log(entries, "profil", "deaktiviert", "profileActive=false (Job-/Cron-Teilnahme aus)");
  } else {
    log(entries, "profil", "übersprungen", "kein Profil zu dieser id");
  }
  return { ok: true, deactivated: true, tenantId: id, reversible: true, log: entries };
}

// Vollständige Entfernung (für Tests / Rollback einer Provisionierung). Strikt auf
// die id gescoped (storage.deleteProfileData: Profil + Content-Store + V3 + Auth).
async function teardownTenant(id, deps = {}) {
  const storage = deps.storage || require("./storage");
  const entries = [];
  if (isProtected(id)) {
    log(entries, "schutz", "abbruch", `${id} ist ein geschützter Production-Mandant — Löschung verweigert.`);
    return { ok: false, aborted: true, reason: "protected-tenant", tenantId: id, log: entries };
  }
  const result = await storage.deleteProfileData(id);
  log(entries, "loeschung", result.ok ? "ok" : "teilweise", `entfernt: ${JSON.stringify(result.before || {})}`);
  return { ok: Boolean(result.ok), tenantId: id, detail: result, log: entries };
}

// Menschlich lesbares Ergebnisprotokoll.
function formatProtocol(result) {
  const lines = [];
  lines.push(`Mandant: ${result.tenantId}`);
  lines.push(`Ergebnis: ${result.ok ? "ERFOLG" : "ABBRUCH"}${result.reason ? ` (${result.reason})` : ""}`);
  if (result.created) lines.push("Aktion: NEU angelegt");
  if (result.updated) lines.push("Aktion: aktualisiert (idempotent, keine Dublette)");
  if (result.errors && result.errors.length) {
    lines.push("Fehler:");
    for (const e of result.errors) lines.push(`  - ${e}`);
  }
  if (result.readiness) {
    lines.push(`Bereitschaft: Briefing=${result.readiness.kannBriefingErhalten} · Matching=${result.readiness.kannMatching} · Quellen=${result.readiness.quellenVersorgt}`);
  }
  if (result.log && result.log.length) {
    lines.push("Protokoll:");
    for (const s of result.log) lines.push(`  [${s.status}] ${s.step}${s.detail ? " — " + s.detail : ""}`);
  }
  return lines.join("\n");
}

module.exports = {
  PROTECTED_TENANT_IDS,
  isProtected,
  validateSpec,
  buildProfile,
  provisionTenant,
  deactivateTenant,
  teardownTenant,
  formatProtocol
};
