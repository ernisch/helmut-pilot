"use strict";

// Accounts-/Auth-Datenschicht fuer Helmut.
//
// Bewusste MVP-Entscheidung: Nutzer, Sessions und Assignments liegen in denselben
// JSON-Store-Collections wie der Rest der App (lokal ODER Supabase, ohne manuelle
// Migration). Diese Datei ist der EINZIGE Ort, der diese Collections liest/schreibt,
// damit ein spaeterer relationaler Umzug ein Drop-in-Swap bleibt.
//
// Sicherheit:
// - Passwoerter werden nur als scrypt-Hash + Salt gespeichert (kein Klartext).
// - Session-Cookies enthalten ein Zufallstoken; gespeichert wird nur dessen SHA-256-Hash.
// - Identitaet/Rollen werden ausschliesslich serverseitig aus diesen Daten abgeleitet.

const crypto = require("crypto");
// Auth-Daten liegen im separaten, kleinen Auth-Store (siehe storage.js) — nicht im
// grossen Content-Blob. Innerhalb dieses Moduls heissen die Helfer bewusst weiterhin
// readStore/writeStore, damit die Logik unveraendert bleibt.
const { readAuthStore: readStore, writeAuthStore: writeStore, getStorageStatus } = require("./storage");

const ROLES = Object.freeze(["admin", "abgeordneter", "referent"]);
// Lange Sitzungsdauer, damit man nach App-Schliessen angemeldet bleibt. In
// Kombination mit der rollenden Verlaengerung bei jedem App-Start (extendSession)
// bleibt man praktisch angemeldet, bis man sich aktiv abmeldet.
const SESSION_TTL_MS = Number(process.env.HELMUT_SESSION_TTL_MS || 30 * 24 * 60 * 60 * 1000);
const MAX_DAILY_INPUTS_PER_DAY = Number(process.env.HELMUT_MAX_DAILY_INPUTS || 3);

function isValidRole(role) {
  return ROLES.includes(String(role || "").trim().toLowerCase());
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function generateId(prefix) {
  return `${prefix}-${crypto.randomBytes(9).toString("hex")}`;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Passwort-Hashing (Node-eigenes scrypt, keine externen Pakete)
// ---------------------------------------------------------------------------

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { passwordHash: hash, passwordSalt: salt };
}

function verifyPassword(password, user) {
  if (!user || !user.passwordHash || !user.passwordSalt) return false;
  let derived;
  try {
    derived = crypto.scryptSync(String(password), user.passwordSalt, 64);
  } catch {
    return false;
  }
  const expected = Buffer.from(user.passwordHash, "hex");
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

function isStrongEnough(password) {
  return typeof password === "string" && password.length >= 8;
}

// ---------------------------------------------------------------------------
// Nutzer
// ---------------------------------------------------------------------------

// Entfernt Geheimnisse, bevor ein Nutzer das Backend verlaesst.
function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...safe } = user;
  return safe;
}

async function listUsers() {
  const store = await readStore();
  return (store.users || []).map(sanitizeUser);
}

async function getUserByIdRaw(id) {
  if (!id) return null;
  const store = await readStore();
  return (store.users || []).find((user) => user.id === id) || null;
}

async function getUserByEmailRaw(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const store = await readStore();
  return (store.users || []).find((user) => normalizeEmail(user.email) === normalized) || null;
}

async function createUser({ email, name, role, password, politicianId, active = true } = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw httpError(400, "E-Mail ist erforderlich.");
  if (!isValidRole(role)) throw httpError(400, "Ungueltige Rolle.");
  if (!isStrongEnough(password)) throw httpError(400, "Passwort muss mindestens 8 Zeichen haben.");

  const store = await readStore();
  store.users = store.users || [];
  if (store.users.some((user) => normalizeEmail(user.email) === normalizedEmail)) {
    throw httpError(409, "Diese E-Mail wird bereits verwendet.");
  }

  const roleValue = String(role).trim().toLowerCase();
  // Ein Abgeordneter ist fest an genau ein Mandatsprofil gebunden. Fehlt eine
  // explizite politicianId, leiten wir sie aus dem Namen ab und stellen Eindeutigkeit her.
  let resolvedPoliticianId = null;
  if (roleValue === "abgeordneter") {
    resolvedPoliticianId = slugify(politicianId) || slugify(name) || slugify(normalizedEmail.split("@")[0]);
    resolvedPoliticianId = uniquePoliticianId(store, resolvedPoliticianId);
  }

  const now = new Date().toISOString();
  const { passwordHash, passwordSalt } = hashPassword(password);
  const user = {
    id: generateId("user"),
    email: normalizedEmail,
    name: String(name || "").trim() || normalizedEmail,
    role: roleValue,
    politicianId: resolvedPoliticianId,
    active: active !== false,
    passwordHash,
    passwordSalt,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  };
  store.users.push(user);
  await writeStore(store);
  return sanitizeUser(user);
}

function uniquePoliticianId(store, base) {
  const candidateBase = base || generateId("mandat");
  const taken = new Set((store.users || []).map((user) => user.politicianId).filter(Boolean));
  if (!taken.has(candidateBase)) return candidateBase;
  let counter = 2;
  while (taken.has(`${candidateBase}-${counter}`)) counter += 1;
  return `${candidateBase}-${counter}`;
}

async function updateUser(id, patch = {}) {
  const store = await readStore();
  const user = (store.users || []).find((entry) => entry.id === id);
  if (!user) throw httpError(404, "Nutzer nicht gefunden.");

  if (patch.email !== undefined) {
    const normalizedEmail = normalizeEmail(patch.email);
    if (!normalizedEmail) throw httpError(400, "E-Mail ist erforderlich.");
    if (store.users.some((entry) => entry.id !== id && normalizeEmail(entry.email) === normalizedEmail)) {
      throw httpError(409, "Diese E-Mail wird bereits verwendet.");
    }
    user.email = normalizedEmail;
  }
  if (patch.name !== undefined) user.name = String(patch.name || "").trim() || user.name;
  if (patch.role !== undefined) {
    if (!isValidRole(patch.role)) throw httpError(400, "Ungueltige Rolle.");
    user.role = String(patch.role).trim().toLowerCase();
    if (user.role !== "abgeordneter") user.politicianId = null;
  }
  if (patch.active !== undefined) user.active = patch.active !== false;
  if (patch.politicianId !== undefined && user.role === "abgeordneter") {
    const slug = slugify(patch.politicianId);
    if (slug) user.politicianId = slug;
  }
  if (patch.password !== undefined && patch.password !== "") {
    if (!isStrongEnough(patch.password)) throw httpError(400, "Passwort muss mindestens 8 Zeichen haben.");
    const { passwordHash, passwordSalt } = hashPassword(patch.password);
    user.passwordHash = passwordHash;
    user.passwordSalt = passwordSalt;
  }
  user.updatedAt = new Date().toISOString();
  await writeStore(store);
  return sanitizeUser(user);
}

// ---------------------------------------------------------------------------
// Sessions (Cookie traegt Rohtoken, Store nur dessen Hash)
// ---------------------------------------------------------------------------

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

async function createSession(userId, meta = {}) {
  const store = await readStore();
  store.sessions = pruneSessionList(store.sessions || []);
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  store.sessions.push({
    id: generateId("session"),
    tokenHash: hashToken(token),
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    ip: String(meta.ip || ""),
    userAgent: String(meta.userAgent || "").slice(0, 200)
  });
  await writeStore(store);
  return { token, ttlSeconds: Math.floor(SESSION_TTL_MS / 1000) };
}

// Loest ein Rohtoken serverseitig zu (Session, Nutzer) auf. Gibt nur fuer
// aktive Nutzer mit gueltiger, nicht abgelaufener Session ein Ergebnis zurueck.
async function resolveSession(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const store = await readStore();
  const session = (store.sessions || []).find((entry) => entry.tokenHash === tokenHash);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
  const user = (store.users || []).find((entry) => entry.id === session.userId);
  if (!user || user.active === false) return null;
  return { session, user };
}

// Rollende Verlaengerung: setzt die Ablaufzeit auf jetzt+TTL. Wird beim App-Start
// aufgerufen, damit aktive Nutzer angemeldet bleiben. Schreibt nur, wenn sich der
// Ablauf um mehr als eine Stunde verschiebt (vermeidet Schreiblast pro Aufruf).
async function extendSession(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const store = await readStore();
  const session = (store.sessions || []).find((entry) => entry.tokenHash === tokenHash);
  if (!session) return null;
  const newExpiry = Date.now() + SESSION_TTL_MS;
  if (newExpiry - new Date(session.expiresAt).getTime() > 60 * 60 * 1000) {
    session.expiresAt = new Date(newExpiry).toISOString();
    await writeStore(store);
  }
  return Math.floor(SESSION_TTL_MS / 1000);
}

async function destroySession(token) {
  if (!token) return;
  const tokenHash = hashToken(token);
  const store = await readStore();
  const next = (store.sessions || []).filter((entry) => entry.tokenHash !== tokenHash);
  if (next.length !== (store.sessions || []).length) {
    store.sessions = next;
    await writeStore(store);
  }
}

async function destroyUserSessions(userId) {
  const store = await readStore();
  const next = (store.sessions || []).filter((entry) => entry.userId !== userId);
  if (next.length !== (store.sessions || []).length) {
    store.sessions = next;
    await writeStore(store);
  }
}

function pruneSessionList(sessions) {
  const now = Date.now();
  return sessions.filter((entry) => new Date(entry.expiresAt).getTime() > now);
}

async function markLogin(userId) {
  const store = await readStore();
  const user = (store.users || []).find((entry) => entry.id === userId);
  if (!user) return;
  user.lastLoginAt = new Date().toISOString();
  await writeStore(store);
}

// ---------------------------------------------------------------------------
// Assignments (Referent/Admin -> Mandatsprofil)
// ---------------------------------------------------------------------------

async function listAssignments() {
  const store = await readStore();
  return store.assignments || [];
}

async function assignmentsForUser(userId) {
  const store = await readStore();
  return (store.assignments || []).filter((entry) => entry.userId === userId);
}

async function addAssignment(userId, politicianId) {
  const slug = slugify(politicianId);
  if (!userId || !slug) throw httpError(400, "userId und politicianId sind erforderlich.");
  const store = await readStore();
  if (!(store.users || []).some((user) => user.id === userId)) {
    throw httpError(404, "Nutzer nicht gefunden.");
  }
  store.assignments = store.assignments || [];
  if (store.assignments.some((entry) => entry.userId === userId && entry.politicianId === slug)) {
    return store.assignments;
  }
  store.assignments.push({
    id: generateId("assignment"),
    userId,
    politicianId: slug,
    createdAt: new Date().toISOString()
  });
  await writeStore(store);
  return store.assignments;
}

async function removeAssignment(userId, politicianId) {
  const slug = slugify(politicianId);
  const store = await readStore();
  const next = (store.assignments || []).filter((entry) => !(entry.userId === userId && entry.politicianId === slug));
  store.assignments = next;
  await writeStore(store);
  return next;
}

// ---------------------------------------------------------------------------
// Audit-Log & interne Fehlerprotokolle (intern loggbar, oeffentlich generisch)
// ---------------------------------------------------------------------------

async function recordAudit(event = {}) {
  const store = await readStore();
  store.auditEvents = store.auditEvents || [];
  store.auditEvents.unshift({
    id: generateId("audit"),
    createdAt: new Date().toISOString(),
    action: String(event.action || "unknown"),
    userId: event.userId || null,
    actorEmail: event.actorEmail || null,
    politicianId: event.politicianId || null,
    detail: event.detail || null,
    ip: event.ip || null
  });
  await writeStore(store);
}

async function recordSystemError(error = {}) {
  const store = await readStore();
  store.systemErrors = store.systemErrors || [];
  store.systemErrors.unshift({
    id: generateId("err"),
    createdAt: new Date().toISOString(),
    scope: String(error.scope || "server"),
    message: String(error.message || "Unbekannter Fehler").slice(0, 500),
    path: error.path || null,
    userId: error.userId || null
  });
  await writeStore(store);
}

async function listAuditEvents(limit = 100) {
  const store = await readStore();
  return (store.auditEvents || []).slice(0, limit);
}

async function listSystemErrors(limit = 100) {
  const store = await readStore();
  return (store.systemErrors || []).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Tagesinput des Referenten (max. N Termine/Themen pro Mandat pro Tag)
// ---------------------------------------------------------------------------

function dayKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

async function listDailyInputs(politicianId, { day } = {}) {
  const store = await readStore();
  return (store.dailyInputs || []).filter((entry) => {
    if (politicianId && entry.politicianId !== politicianId) return false;
    if (day && entry.day !== day) return false;
    return true;
  });
}

async function addDailyInput(input = {}) {
  const politicianId = slugify(input.politicianId);
  if (!politicianId) throw httpError(400, "politicianId ist erforderlich.");
  const title = String(input.title || "").trim();
  if (!title) throw httpError(400, "Titel ist erforderlich.");
  const day = input.day || dayKey();

  const store = await readStore();
  store.dailyInputs = store.dailyInputs || [];
  const todays = store.dailyInputs.filter((entry) => entry.politicianId === politicianId && entry.day === day);
  if (todays.length >= MAX_DAILY_INPUTS_PER_DAY) {
    throw httpError(409, `Maximal ${MAX_DAILY_INPUTS_PER_DAY} Termine/Themen pro Tag.`);
  }
  const now = new Date().toISOString();
  const entry = {
    id: generateId("input"),
    politicianId,
    day,
    title,
    datetime: String(input.datetime || "").trim(),
    context: String(input.context || "").trim(),
    goal: String(input.goal || "").trim(),
    desiredPrep: String(input.desiredPrep || "").trim(),
    createdBy: input.createdBy || null,
    createdAt: now,
    updatedAt: now
  };
  store.dailyInputs.unshift(entry);
  await writeStore(store);
  return entry;
}

async function removeDailyInput(id, politicianId) {
  const store = await readStore();
  const before = (store.dailyInputs || []).length;
  store.dailyInputs = (store.dailyInputs || []).filter(
    (entry) => !(entry.id === id && (!politicianId || entry.politicianId === politicianId))
  );
  if (store.dailyInputs.length !== before) await writeStore(store);
  return store.dailyInputs;
}

// ---------------------------------------------------------------------------
// Bootstrap: ersten Admin aus Env seeden (idempotent)
// ---------------------------------------------------------------------------

let seedPromise = null;
let lastSeedResult = { seeded: false, reason: "not-run" };

async function ensureAdminSeed() {
  // Nur einmal pro Prozess; verhindert doppelte Seeds bei parallelen Requests.
  if (!seedPromise) seedPromise = seedAdminOnce();
  return seedPromise;
}

async function adminExists() {
  const store = await readStore();
  return (store.users || []).some((user) => user.role === "admin");
}

// Setup-Diagnose. DSGVO: oeffentlich nur unkritische Statusbits (keine E-Mails).
// Personenbezogene/sensible Felder (E-Mail, Passwort-Flags) NUR mit includeSensitive
// (im Server nur fuer eingeloggte Admins gesetzt).
async function getSetupStatus({ includeSensitive = false } = {}) {
  const store = await readStore();
  const admins = (store.users || []).filter((user) => user.role === "admin");
  const rawPassword = process.env.HELMUT_ADMIN_PASSWORD || "";
  const base = {
    accountMode: true,
    adminExists: admins.length > 0,
    storageBackend: getStorageStatus().backend,
    envAdminConfigured: Boolean(normalizeEmail(process.env.HELMUT_ADMIN_EMAIL) && rawPassword),
    seed: lastSeedResult,
    resetRequested: isResetRequested()
  };
  if (!includeSensitive) return base;
  return {
    ...base,
    userCount: store.users?.length || 0,
    envAdminEmail: normalizeEmail(process.env.HELMUT_ADMIN_EMAIL),
    storedAdminEmails: admins.map((user) => user.email),
    envEmailMatchesAdmin: admins.some((user) => normalizeEmail(user.email) === normalizeEmail(process.env.HELMUT_ADMIN_EMAIL)),
    envPasswordLength: rawPassword.length,
    envPasswordHasQuotes: /^['"]|['"]$/.test(rawPassword),
    envPasswordHasWhitespace: rawPassword !== rawPassword.trim()
  };
}

function isResetRequested() {
  return ["1", "true", "yes"].includes(String(process.env.HELMUT_ADMIN_RESET || "").trim().toLowerCase());
}

async function seedAdminOnce() {
  const result = await runAdminSeed();
  lastSeedResult = result;
  return result;
}

async function runAdminSeed() {
  const email = normalizeEmail(process.env.HELMUT_ADMIN_EMAIL);
  const password = process.env.HELMUT_ADMIN_PASSWORD || "";
  if (!email || !password) return { seeded: false, reason: "env-missing" };

  const store = await readStore();
  const existingAdmin = (store.users || []).find((user) => user.role === "admin");

  // HELMUT_ADMIN_RESET=1: setzt E-Mail + Passwort des bestehenden Admins zwangsweise
  // auf die Env-Werte (gegen Tippfehler/geaenderte Variablen). Nach erfolgreichem
  // Login wieder entfernen.
  if (existingAdmin) {
    if (!isResetRequested()) return { seeded: false, reason: "admin-exists" };
    if (!isStrongEnough(password)) return { seeded: false, reason: "Passwort muss mindestens 8 Zeichen haben." };
    try {
      const { passwordHash, passwordSalt } = hashPassword(password);
      existingAdmin.email = email;
      existingAdmin.passwordHash = passwordHash;
      existingAdmin.passwordSalt = passwordSalt;
      existingAdmin.active = true;
      existingAdmin.updatedAt = new Date().toISOString();
      await writeStore(store);
      await recordAudit({ action: "admin.reset", actorEmail: email });
      return { seeded: true, reason: "reset" };
    } catch (error) {
      await recordSystemError({ scope: "bootstrap", message: error.message });
      return { seeded: false, reason: error.message };
    }
  }

  try {
    await createUser({
      email,
      name: process.env.HELMUT_ADMIN_NAME || "Administrator",
      role: "admin",
      password
    });
    await recordAudit({ action: "admin.seeded", actorEmail: email });
    return { seeded: true, reason: "seeded" };
  } catch (error) {
    await recordSystemError({ scope: "bootstrap", message: error.message });
    return { seeded: false, reason: error.message };
  }
}

function httpError(status, message) {
  const error = new Error(message);
  error.statusCode = status;
  error.publicMessage = message;
  return error;
}

module.exports = {
  ROLES,
  isValidRole,
  normalizeEmail,
  slugify,
  hashPassword,
  verifyPassword,
  sanitizeUser,
  listUsers,
  getUserByIdRaw,
  getUserByEmailRaw,
  createUser,
  updateUser,
  createSession,
  resolveSession,
  extendSession,
  destroySession,
  destroyUserSessions,
  markLogin,
  listAssignments,
  assignmentsForUser,
  addAssignment,
  removeAssignment,
  recordAudit,
  recordSystemError,
  listAuditEvents,
  listSystemErrors,
  listDailyInputs,
  addDailyInput,
  removeDailyInput,
  ensureAdminSeed,
  adminExists,
  getSetupStatus,
  httpError,
  MAX_DAILY_INPUTS_PER_DAY,
  SESSION_TTL_MS
};
