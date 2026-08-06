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

const ROLES = Object.freeze(["admin", "abgeordneter", "referent", "demo"]);
// Mehrstufiger Kundenstatus. Fuehrend fuer die Verwaltung; steuert zusaetzlich den
// Login (siehe activeFromStatus): gekuendigt/deaktiviert sperren, alle anderen erlauben.
// "eingeladen": admin-seitig ohne Passwort angelegt — der Login ist implizit gesperrt,
// weil verifyPassword ohne passwordHash immer false liefert, bis die Person ihr
// Passwort ueber den Invite-Link selbst gesetzt hat (dann -> "aktiv").
const USER_STATUSES = Object.freeze(["aktiv", "eingeladen", "testphase", "pausiert", "gekuendigt", "deaktiviert"]);
const PAYMENT_STATUSES = Object.freeze(["none", "open", "paid", "overdue"]);

function isValidStatus(status) {
  return USER_STATUSES.includes(String(status || "").trim().toLowerCase());
}

function isValidPaymentStatus(status) {
  return PAYMENT_STATUSES.includes(String(status || "").trim().toLowerCase());
}

// Login-Gate aus dem Status ableiten: nur gekuendigt/deaktiviert sperren.
function activeFromStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  return value !== "gekuendigt" && value !== "deaktiviert";
}

function defaultCustomer() {
  return {
    pricePerMonth: null,
    startDate: null,
    trialUntil: null,
    nextInvoice: null,
    paymentStatus: "none",
    internalNote: ""
  };
}

function normalizeDateOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value).slice(0, 10);
}
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

// Fester Dummy-Salt NUR fuer den "kein Nutzer/kein Hash"-Fall unten — niemals fuer
// echte Nutzer verwendet. Zweck: siehe Kommentar in verifyPassword.
const DUMMY_PASSWORD_SALT = "0".repeat(32);

function verifyPassword(password, user) {
  // SICHERHEIT: scrypt IMMER ausfuehren, auch wenn kein Nutzer/Hash existiert — sonst
  // ist "kein Nutzer" messbar schneller als "Nutzer existiert, Passwort falsch" (Timing-
  // Seitenkanal), obwohl die HTTP-Antwort bewusst identisch gehalten wird (kein
  // User-Enumeration ueber den Response-Inhalt). Das Ergebnis der Dummy-Berechnung wird
  // nie verwendet, nur ihre Laufzeit gleicht sich der echten Pruefung an.
  const hasRealUser = Boolean(user && user.passwordHash && user.passwordSalt);
  const salt = hasRealUser ? user.passwordSalt : DUMMY_PASSWORD_SALT;
  let derived;
  try {
    derived = crypto.scryptSync(String(password), salt, 64);
  } catch {
    derived = null;
  }
  if (!hasRealUser || !derived) return false;
  const expected = Buffer.from(user.passwordHash, "hex");
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

function isStrongEnough(password) {
  return typeof password === "string" && password.length >= 8;
}

// ---------------------------------------------------------------------------
// Nutzer
// ---------------------------------------------------------------------------

// Entfernt Geheimnisse, bevor ein Nutzer das Backend verlaesst. Backfillt zugleich
// neue Felder (status, customer) fuer Altbestand, ohne den Store zu mutieren.
function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...safe } = user;
  if (!safe.status) safe.status = safe.active === false ? "deaktiviert" : "aktiv";
  safe.customer = { ...defaultCustomer(), ...(safe.customer || {}) };
  safe.loginCount = Number(safe.loginCount) || 0;
  safe.openCount = Number(safe.openCount) || 0;
  if (safe.lastSeenAt === undefined) safe.lastSeenAt = safe.lastLoginAt || null;
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
  // Passwort ist optional: ohne Passwort entsteht ein eingeladener Nutzer
  // (passwordHash=null, Status "eingeladen"), der es per Invite-Link selbst setzt.
  // Der Admin fasst nie ein Passwort an; der Admin-Seed (mit Passwort) bleibt unveraendert.
  const hasPassword = password !== undefined && password !== null && password !== "";
  if (hasPassword && !isStrongEnough(password)) throw httpError(400, "Passwort muss mindestens 8 Zeichen haben.");

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
  const { passwordHash, passwordSalt } = hasPassword
    ? hashPassword(password)
    : { passwordHash: null, passwordSalt: null };
  const user = {
    id: generateId("user"),
    email: normalizedEmail,
    name: String(name || "").trim() || normalizedEmail,
    role: roleValue,
    politicianId: resolvedPoliticianId,
    active: active !== false,
    status: hasPassword ? "aktiv" : "eingeladen",
    paidUntil: null,
    customer: defaultCustomer(),
    notificationSettings: defaultNotificationSettings(),
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

function defaultNotificationSettings() {
  return {
    briefing: true,
    lage: true,
    radar: true,
    crisis: true,
    opportunity: true,
    statement: true
  };
}

function getNotificationSettingsForPolitician(store, politicianId) {
  const user = (store.users || []).find((u) => u.role === "abgeordneter" && u.politicianId === politicianId);
  if (!user) return defaultNotificationSettings();
  return { ...defaultNotificationSettings(), ...(user.notificationSettings || {}) };
}

async function getNotificationSettings(politicianId) {
  const store = await readStore();
  return getNotificationSettingsForPolitician(store, politicianId);
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
  if (patch.status !== undefined) {
    const statusValue = String(patch.status).trim().toLowerCase();
    if (!isValidStatus(statusValue)) throw httpError(400, "Ungueltiger Status.");
    // "eingeladen" verwaltet ausschliesslich der Invite-Flow (createUser ohne
    // Passwort -> setPasswordWithToken setzt "aktiv"). Manuell gesetzt wuerde er
    // die Invariante "eingeladen = kein Passwort" brechen (Anzeige-Luege im Admin).
    if (statusValue === "eingeladen" && user.status !== "eingeladen") {
      throw httpError(400, "Status 'eingeladen' wird vom Einladungs-Flow verwaltet.");
    }
    user.status = statusValue;
    // Status ist fuehrend fuer den Login: gekuendigt/deaktiviert sperren automatisch.
    user.active = activeFromStatus(statusValue);
  }
  if (patch.active !== undefined) user.active = patch.active !== false;
  if (patch.paidUntil !== undefined) user.paidUntil = patch.paidUntil ? String(patch.paidUntil).slice(0, 10) : null;
  if (patch.customer !== undefined && typeof patch.customer === "object") {
    const current = { ...defaultCustomer(), ...(user.customer || {}) };
    const c = patch.customer;
    if (c.pricePerMonth !== undefined) {
      const num = Number(c.pricePerMonth);
      current.pricePerMonth = c.pricePerMonth === null || c.pricePerMonth === "" || Number.isNaN(num) ? null : num;
    }
    if (c.startDate !== undefined) current.startDate = normalizeDateOrNull(c.startDate);
    if (c.trialUntil !== undefined) current.trialUntil = normalizeDateOrNull(c.trialUntil);
    if (c.nextInvoice !== undefined) current.nextInvoice = normalizeDateOrNull(c.nextInvoice);
    if (c.paymentStatus !== undefined) {
      const ps = String(c.paymentStatus).trim().toLowerCase();
      if (!isValidPaymentStatus(ps)) throw httpError(400, "Ungueltiger Zahlungsstatus.");
      current.paymentStatus = ps;
    }
    if (c.internalNote !== undefined) current.internalNote = String(c.internalNote || "").slice(0, 2000);
    user.customer = current;
  }
  if (patch.politicianId !== undefined && user.role === "abgeordneter") {
    const slug = slugify(patch.politicianId);
    if (slug) {
      // OP-03: genau EIN Abgeordneten-Konto je Mandat. createUser stellt das
      // per uniquePoliticianId sicher — hier waere sonst eine stille Dublette
      // moeglich (zwei Konten, die dasselbe Mandat lesen/schreiben).
      const conflict = (store.users || []).some((entry) => entry.id !== id && entry.politicianId === slug);
      if (conflict) throw httpError(409, "Dieses Mandat ist bereits einem anderen Konto zugeordnet.");
      user.politicianId = slug;
    }
  }
  if (patch.notificationSettings !== undefined && typeof patch.notificationSettings === "object") {
    const defaults = defaultNotificationSettings();
    const merged = { ...(user.notificationSettings || defaults) };
    for (const key of Object.keys(defaults)) {
      if (patch.notificationSettings[key] !== undefined) merged[key] = !!patch.notificationSettings[key];
    }
    user.notificationSettings = merged;
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
// Ein einzelnes Konto loeschen (Admin-Aktion) — NICHT zu verwechseln mit
// deleteAuthDataForPolitician (loescht ein ganzes MANDAT samt Inhalten). Hier
// wird ausschliesslich das eine Konto entfernt: der Nutzereintrag selbst sowie
// seine eigenen Auth-Nebendaten (Sessions, Passwort-Tokens, Zuweisungen).
// Mandatsinhalte (Profile, Tagesinputs, KI-Nutzung) und Audit-Log bleiben
// unangetastet, ebenso Konten/Daten anderer Nutzer desselben Mandats.
// ---------------------------------------------------------------------------

function userSideRows(store, userId) {
  return {
    sessions: (store.sessions || []).filter((entry) => entry.userId === userId),
    passwordTokens: (store.passwordTokens || []).filter((entry) => entry.userId === userId),
    assignments: (store.assignments || []).filter((entry) => entry.userId === userId)
  };
}

function stripUserAndSideRows(store, userId) {
  store.users = (store.users || []).filter((entry) => entry.id !== userId);
  store.sessions = (store.sessions || []).filter((entry) => entry.userId !== userId);
  store.passwordTokens = (store.passwordTokens || []).filter((entry) => entry.userId !== userId);
  store.assignments = (store.assignments || []).filter((entry) => entry.userId !== userId);
  return store;
}

// Prueft die Schutzregeln (Selbstloeschung, Administrator) gegen einen KONKRETEN
// Store-Stand und gibt den Zieleintrag zurueck (oder null, wenn er dort nicht mehr
// existiert — kein Fehler, das ist der normale "bereits geloescht"-Fall). Wird an
// MEHREREN Stellen aufgerufen (siehe deleteUser), damit ein zwischenzeitlich
// resultierender anderer Stand (z. B. eine parallele Rollen-Befoerderung) die
// Regeln nicht umgehen kann.
function assertUserDeletable(store, userId, actingUserId) {
  const target = (store.users || []).find((entry) => entry.id === userId);
  if (!target) return null;
  if (actingUserId && target.id === actingUserId) {
    throw httpError(400, "Der eigene Account kann nicht über diese Funktion gelöscht werden.");
  }
  if (target.role === "admin") {
    const adminCount = (store.users || []).filter((entry) => entry.role === "admin").length;
    if (adminCount <= 1) {
      throw httpError(403, "Der letzte verbleibende Administrator kann nicht gelöscht werden.");
    }
    throw httpError(403, "Administratoren können derzeit nicht über diese Funktion gelöscht werden.");
  }
  return target;
}

// Der Auth-Store ist ein Voll-Upsert-JSON-Blob (kein DB-Transaktionsschutz, siehe
// Kommentar bei deleteAuthDataForPolitician) — ein paralleler Schreiber (Session-
// Verlaengerung, Aktivitaets-Tracking, aber auch eine Rollen-Aenderung durch einen
// ANDEREN Admin) kann zwischen unserem Read und Write einen aelteren Stand
// zurueckschreiben und die Loeschung scheinbar rueckgaengig machen. Deshalb
// dasselbe Verifikations-/Wiederholungsmuster: nach dem Schreiben erneut lesen,
// Reste pruefen, bei Bedarf einmal wiederholen. Nur ein VERIFIZIERT vollstaendiges
// Ergebnis gilt als Erfolg — sonst Fehler statt stiller Teil-Loeschung. WICHTIG
// (Review-Fix): die Schutzregeln werden bei JEDEM Schreibversuch erneut gegen den
// dann aktuellen Stand geprueft, nicht nur einmal am Anfang — sonst koennte eine
// zwischenzeitliche Befoerderung zum Administrator (paralleler Schreiber) die
// "Administratoren nicht loeschbar"-Schranke umgehen, wenn die Wiederherstellung
// erst in der Verifikationsschleife sichtbar wird.
async function deleteUser(userId, actingUserId) {
  if (!userId) throw httpError(400, "Nutzer-ID ist erforderlich.");
  const store = await readStore();
  const target = assertUserDeletable(store, userId, actingUserId);
  if (!target) throw httpError(404, "Nutzer nicht gefunden.");

  const before = userSideRows(store, userId);
  stripUserAndSideRows(store, userId);
  await writeStore(store);

  for (let attempt = 0; attempt < 2; attempt++) {
    const check = await readStore();
    const rest = userSideRows(check, userId);
    const stillThere = (check.users || []).some((entry) => entry.id === userId);
    const remaining = (stillThere ? 1 : 0) + rest.sessions.length + rest.passwordTokens.length + rest.assignments.length;
    if (remaining === 0) {
      return {
        ok: true,
        deletedUserId: userId,
        deletedEmail: target.email,
        removed: { sessions: before.sessions.length, passwordTokens: before.passwordTokens.length, assignments: before.assignments.length }
      };
    }
    // Wiederherstellungs-Race erkannt: die Schutzregeln gelten hier ERNEUT, gegen
    // den GERADE gelesenen Stand — nicht das urspruengliche `target` von oben
    // wiederverwenden. Wurde der Nutzer zwischenzeitlich zum Administrator
    // befoerdert, bricht dies mit einem Fehler ab statt ihn stillschweigend doch
    // zu loeschen.
    assertUserDeletable(check, userId, actingUserId);
    stripUserAndSideRows(check, userId);
    await writeStore(check);
  }
  const finalCheck = await readStore();
  const finalRest = userSideRows(finalCheck, userId);
  const finalStillThere = (finalCheck.users || []).some((entry) => entry.id === userId);
  const finalRemaining = (finalStillThere ? 1 : 0) + finalRest.sessions.length + finalRest.passwordTokens.length + finalRest.assignments.length;
  if (finalRemaining > 0) {
    throw httpError(409, "Löschung konnte nicht eindeutig bestätigt werden (paralleler Schreibvorgang) — bitte erneut versuchen.");
  }
  return {
    ok: true,
    deletedUserId: userId,
    deletedEmail: target.email,
    removed: { sessions: before.sessions.length, passwordTokens: before.passwordTokens.length, assignments: before.assignments.length }
  };
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

// Aktive (nicht abgelaufene) Sessions zaehlen — AUSSCHLIESSLICH Zaehler.
// Es verlassen weder Session-Objekte noch tokenHash/ip/userAgent diese Funktion;
// der Admin zeigt Sessions nur als reine Anzahl (Datensparsamkeit wie beim
// Art.-15-Export, der Sessions ebenfalls nur als Metadaten kennt).
async function countActiveSessions() {
  const store = await readStore();
  const active = pruneSessionList(store.sessions || []);
  const byUserId = {};
  for (const entry of active) {
    const key = String(entry.userId || "unbekannt");
    byUserId[key] = (byUserId[key] || 0) + 1;
  }
  return { total: active.length, byUserId };
}

// ---------------------------------------------------------------------------
// Passwort-Tokens (Invite / Reset) — Link traegt Rohtoken, Store nur SHA-256-Hash
// ---------------------------------------------------------------------------

const TOKEN_PURPOSES = Object.freeze(["invite", "reset"]);
// Ablaufzeiten laut Umsetzungsnotiz §6: Einladung 7 Tage, Reset 1 Stunde.
const INVITE_TOKEN_TTL_MS = Number(process.env.HELMUT_INVITE_TOKEN_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const RESET_TOKEN_TTL_MS = Number(process.env.HELMUT_RESET_TOKEN_TTL_MS || 60 * 60 * 1000);

function passwordTokenTtl(purpose) {
  return purpose === "reset" ? RESET_TOKEN_TTL_MS : INVITE_TOKEN_TTL_MS;
}

function prunePasswordTokenList(tokens) {
  const now = Date.now();
  // Abgelaufene Tokens raus; benutzte bleiben bis zum Ablauf stehen, damit ein
  // zweiter Klick auf denselben Link deterministisch als "abgelaufen" endet.
  return (tokens || []).filter((entry) => new Date(entry.expiresAt).getTime() > now);
}

async function createPasswordToken(userId, purpose = "invite") {
  if (!TOKEN_PURPOSES.includes(purpose)) throw httpError(400, "Ungueltiger Token-Zweck.");
  const store = await readStore();
  const user = (store.users || []).find((entry) => entry.id === userId);
  if (!user) throw httpError(404, "Nutzer nicht gefunden.");
  if (user.active === false || !activeFromStatus(user.status)) throw httpError(409, "Nutzer ist gesperrt.");
  store.passwordTokens = prunePasswordTokenList(store.passwordTokens);
  // Einmaligkeit pro Zweck: ein neuer Link invalidiert alle offenen alten desselben Nutzers.
  store.passwordTokens = store.passwordTokens.filter(
    (entry) => !(entry.userId === userId && entry.purpose === purpose && !entry.usedAt)
  );
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = new Date(now + passwordTokenTtl(purpose)).toISOString();
  store.passwordTokens.push({
    id: generateId("ptoken"),
    userId,
    tokenHash: hashToken(token),
    purpose,
    createdAt: new Date(now).toISOString(),
    expiresAt,
    usedAt: null
  });
  await writeStore(store);
  return { token, purpose, expiresAt, user: sanitizeUser(user) };
}

// Prueft ein Rohtoken, ohne es zu verbrauchen (fuer die /passwort-setzen-Seite).
// Bewusst kein Fehler-Throw: die Seite unterscheidet nur gueltig/abgelaufen.
async function inspectPasswordToken(token) {
  if (!token) return { valid: false, reason: "fehlt" };
  const tokenHash = hashToken(token);
  const store = await readStore();
  const entry = (store.passwordTokens || []).find((item) => item.tokenHash === tokenHash);
  if (!entry) return { valid: false, reason: "unbekannt" };
  if (entry.usedAt) return { valid: false, reason: "verwendet" };
  if (new Date(entry.expiresAt).getTime() <= Date.now()) return { valid: false, reason: "abgelaufen" };
  const user = (store.users || []).find((item) => item.id === entry.userId);
  if (!user || user.active === false || !activeFromStatus(user.status)) return { valid: false, reason: "gesperrt" };
  return { valid: true, purpose: entry.purpose, user: sanitizeUser(user) };
}

// Verbraucht ein gueltiges Token und setzt das Passwort (Invite und Reset identisch).
async function setPasswordWithToken(token, password) {
  if (!isStrongEnough(password)) throw httpError(400, "Passwort muss mindestens 8 Zeichen haben.");
  const tokenHash = hashToken(String(token || ""));
  const store = await readStore();
  const entry = (store.passwordTokens || []).find((item) => item.tokenHash === tokenHash);
  const unusable = !entry || Boolean(entry.usedAt) || new Date(entry.expiresAt).getTime() <= Date.now();
  // Ein gesperrter Nutzer bekommt dieselbe generische Antwort wie ein totes Token —
  // die oeffentliche Seite darf Kontostatus nicht verraten.
  if (unusable) throw httpError(410, "Der Link ist abgelaufen oder wurde bereits verwendet.");
  const user = (store.users || []).find((item) => item.id === entry.userId);
  if (!user || user.active === false || !activeFromStatus(user.status)) {
    throw httpError(410, "Der Link ist abgelaufen oder wurde bereits verwendet.");
  }
  const { passwordHash, passwordSalt } = hashPassword(password);
  user.passwordHash = passwordHash;
  user.passwordSalt = passwordSalt;
  if (user.status === "eingeladen") user.status = "aktiv";
  user.active = activeFromStatus(user.status);
  user.updatedAt = new Date().toISOString();
  entry.usedAt = new Date().toISOString();
  await writeStore(store);
  return sanitizeUser(user);
}

// Offene Einladungen je Nutzer-ID — fuer die Admin-Ansicht ("Einladung ausstehend",
// laeuft ab am …). Es verlassen nur Metadaten die Funktion, nie Token-Hashes.
async function listPendingInvites() {
  const store = await readStore();
  const now = Date.now();
  const invites = {};
  for (const entry of store.passwordTokens || []) {
    if (entry.purpose !== "invite" || entry.usedAt) continue;
    if (new Date(entry.expiresAt).getTime() <= now) continue;
    invites[entry.userId] = { createdAt: entry.createdAt, expiresAt: entry.expiresAt };
  }
  return invites;
}

async function markLogin(userId) {
  const store = await readStore();
  const user = (store.users || []).find((entry) => entry.id === userId);
  if (!user) return;
  const now = new Date().toISOString();
  user.lastLoginAt = now;
  user.lastSeenAt = now;
  user.loginCount = (Number(user.loginCount) || 0) + 1;
  // Ein Login ist zugleich eine App-Oeffnung.
  user.openCount = (Number(user.openCount) || 0) + 1;
  await writeStore(store);
}

// Nutzungs-Tracking: erfasst App-Aktivitaet (Zuletzt-aktiv + Oeffnungen). Gedrosselt,
// damit haeufige Refreshes keine Schreib-Last erzeugen. Als distinkte "Oeffnung"
// zaehlt ein Abstand von mind. 20 Minuten zur letzten Aktivitaet.
async function recordUserActivity(userId) {
  if (!userId) return;
  const store = await readStore();
  const user = (store.users || []).find((entry) => entry.id === userId);
  if (!user) return;
  const now = Date.now();
  const last = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0;
  const elapsed = now - last;
  // Innerhalb von 5 Minuten nichts schreiben (kein Nutzen, nur Last).
  if (user.lastSeenAt && elapsed < 5 * 60 * 1000) return;
  if (!user.lastSeenAt || elapsed > 20 * 60 * 1000) {
    user.openCount = (Number(user.openCount) || 0) + 1;
  }
  user.lastSeenAt = new Date(now).toISOString();
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

// ── DSGVO-Vollstaendigkeit (Audit-Fix 2026-07) ───────────────────────────────
// Der Auth-Store war bewusst NICHT Teil der /api/privacy-Kaskade — Konto,
// Sessions, Zuweisungen, Tagesinputs, Audit-Eintraege und KI-Nutzungslog eines
// Mandats blieben bei "Daten loeschen" vollstaendig erhalten. Diese beiden
// Funktionen schliessen die Luecke; Orchestrierung in storage.export/
// deleteProfileData. Konten anderer Rollen (Admin, Referenten) bleiben
// unberuehrt — nur ihre ZUWEISUNGEN auf das geloeschte Mandat entfallen.

function authRowsForPolitician(store, politicianId) {
  const users = (store.users || []).filter((u) => u.politicianId === politicianId);
  const userIds = new Set(users.map((u) => u.id));
  const belongsToUser = (value) => Boolean(value && userIds.has(value));
  return {
    users,
    userIds,
    sessions: (store.sessions || []).filter((s) => belongsToUser(s.userId)),
    assignments: (store.assignments || []).filter((a) => belongsToUser(a.userId) || a.politicianId === politicianId),
    dailyInputs: (store.dailyInputs || []).filter((d) => d.politicianId === politicianId),
    auditEvents: (store.auditEvents || []).filter((e) => belongsToUser(e.userId) || e.politicianId === politicianId),
    llmUsage: (store.llmUsage || []).filter((e) => e.politicianId === politicianId || e.userId === politicianId),
    passwordTokens: (store.passwordTokens || []).filter((t) => belongsToUser(t.userId))
  };
}

async function exportAuthDataForPolitician(politicianId) {
  const store = await readStore();
  const rows = authRowsForPolitician(store, politicianId);
  // DSGVO-Sauberkeit (Review-Fix): Der Art.-15-Export gehört dem Mandatsträger.
  // Audit-/Zuweisungszeilen können Aktionen DRITTER (Admin/Referent) auf dem
  // Mandat enthalten — deren Fremd-Identifikatoren (actorEmail, IP, fremde userId)
  // dürfen im Auskunftsexport des Mandatsträgers nicht mitgeliefert werden. Sie
  // werden pseudonymisiert; Ereignistyp und Zeitpunkt (die den Betroffenen
  // legitim betreffen) bleiben erhalten.
  const own = rows.userIds;
  const redactAudit = (e) => {
    const fremd = e.userId ? !own.has(e.userId) : true;
    return fremd
      ? { action: e.action, createdAt: e.createdAt, politicianId: e.politicianId, akteur: "[dritte Person – redigiert]" }
      : e;
  };
  const redactAssignment = (a) => (own.has(a.userId)
    ? a
    : { politicianId: a.politicianId, role: a.role || null, userId: "[dritte Person – redigiert]" });
  return {
    vollstaendig: true,
    // Konten OHNE Passwort-Hash/-Salt (sanitizeUser).
    konten: rows.users.map(sanitizeUser),
    // Sitzungen nur als Metadaten — NIE Token-Hashes exportieren.
    sitzungen: rows.sessions.map((s) => ({ createdAt: s.createdAt || null, expiresAt: s.expiresAt || null, lastSeenAt: s.lastSeenAt || null })),
    // Invite-/Reset-Links ebenfalls nur als Metadaten (Zweck + Zeiten), nie Hashes.
    passwortLinks: rows.passwordTokens.map((t) => ({ purpose: t.purpose, createdAt: t.createdAt || null, expiresAt: t.expiresAt || null, usedAt: t.usedAt || null })),
    zuweisungen: rows.assignments.map(redactAssignment),
    tagesinputs: rows.dailyInputs,
    auditEreignisse: rows.auditEvents.map(redactAudit),
    kiNutzung: rows.llmUsage
  };
}

async function deleteAuthDataForPolitician(politicianId) {
  const store = await readStore();
  const rows = authRowsForPolitician(store, politicianId);
  const before = {
    konten: rows.users.length,
    sitzungen: rows.sessions.length,
    zuweisungen: rows.assignments.length,
    tagesinputs: rows.dailyInputs.length,
    auditEreignisse: rows.auditEvents.length,
    kiNutzung: rows.llmUsage.length,
    passwortLinks: rows.passwordTokens.length
  };
  const userIds = rows.userIds;
  const belongsToUser = (value) => Boolean(value && userIds.has(value));
  store.users = (store.users || []).filter((u) => u.politicianId !== politicianId);
  store.sessions = (store.sessions || []).filter((s) => !belongsToUser(s.userId));
  store.assignments = (store.assignments || []).filter((a) => !belongsToUser(a.userId) && a.politicianId !== politicianId);
  store.dailyInputs = (store.dailyInputs || []).filter((d) => d.politicianId !== politicianId);
  store.auditEvents = (store.auditEvents || []).filter((e) => !belongsToUser(e.userId) && e.politicianId !== politicianId);
  store.llmUsage = (store.llmUsage || []).filter((e) => !(e.politicianId === politicianId || e.userId === politicianId));
  store.passwordTokens = (store.passwordTokens || []).filter((t) => !belongsToUser(t.userId));
  await writeStore(store);
  // VERIFIKATIONS-PASS (Review-Fix): Der Auth-Store ist ein Voll-Upsert-Dokument
  // (last-write-wins) — ein PARALLELER Schreiber (recordLlmUsage, Session-Update,
  // Cron) kann zwischen unserem Read und Write seinen aelteren Stand zurueck-
  // schreiben und die gerade bestaetigte Loeschung rueckgaengig machen. Deshalb:
  // erneut lesen, Reste zaehlen, bei Bedarf EINMAL wiederholen; das Ergebnis
  // traegt den ehrlichen Reststand (verbleibend > 0 -> ok:false, Art. 17).
  let verified = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const check = await readStore();
    const rest = authRowsForPolitician(check, politicianId);
    verified = {
      konten: rest.users.length,
      sitzungen: rest.sessions.length,
      zuweisungen: rest.assignments.length,
      tagesinputs: rest.dailyInputs.length,
      auditEreignisse: rest.auditEvents.length,
      kiNutzung: rest.llmUsage.length,
      passwortLinks: rest.passwordTokens.length
    };
    const remaining = Object.values(verified).reduce((s, n) => s + n, 0);
    if (remaining === 0) return { ok: true, before, verifiziert: verified };
    // Wiederherstellungs-Race erkannt: Loeschung auf dem FRISCHEN Stand wiederholen.
    check.users = (check.users || []).filter((u) => u.politicianId !== politicianId);
    check.sessions = (check.sessions || []).filter((s) => !belongsToUser(s.userId));
    check.assignments = (check.assignments || []).filter((a) => !belongsToUser(a.userId) && a.politicianId !== politicianId);
    check.dailyInputs = (check.dailyInputs || []).filter((d) => d.politicianId !== politicianId);
    check.auditEvents = (check.auditEvents || []).filter((e) => !belongsToUser(e.userId) && e.politicianId !== politicianId);
    check.llmUsage = (check.llmUsage || []).filter((e) => !(e.politicianId === politicianId || e.userId === politicianId));
    check.passwordTokens = (check.passwordTokens || []).filter((t) => !belongsToUser(t.userId));
    await writeStore(check);
  }
  const finalCheck = await readStore();
  const finalRest = authRowsForPolitician(finalCheck, politicianId);
  const finalRemaining = finalRest.users.length + finalRest.sessions.length + finalRest.assignments.length
    + finalRest.dailyInputs.length + finalRest.auditEvents.length + finalRest.llmUsage.length
    + finalRest.passwordTokens.length;
  return {
    ok: finalRemaining === 0,
    before,
    verifiziert: verified,
    ...(finalRemaining > 0 ? { fehler: `Nach 2 Loeschversuchen verbleiben ${finalRemaining} Konto-Datenzeilen (paralleler Schreiber) — Loeschung wiederholen.` } : {})
  };
}

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
  // DSGVO/Secret-Hygiene (P0-3, Abnahmekriterien #2/#9): der freie message-Text
  // koennte Secrets/Tokens/E-Mail/Telefon oder Fehler-Fragmente mit personen-
  // bezogenen Inhalten enthalten. Zentral redigieren + kappen, BEVOR er persistiert
  // wird — gilt fuer ALLE systemErrors-Schreiber (nicht nur Pipeline).
  const { redactSensitive } = require("./redact");
  store.systemErrors.unshift({
    id: generateId("err"),
    createdAt: new Date().toISOString(),
    scope: String(error.scope || "server"),
    message: redactSensitive(String(error.message || "Unbekannter Fehler")).slice(0, 300),
    path: error.path ? redactSensitive(String(error.path)).slice(0, 200) : null,
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
  // SICHERHEIT: nur die Eintraege des aufrufenden Mandats zurueckgeben — sonst leakt
  // die Antwort die Termine/Themen ALLER Mandate (Mandantenbruch).
  return politicianId ? store.dailyInputs.filter((entry) => entry.politicianId === politicianId) : store.dailyInputs;
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
  USER_STATUSES,
  PAYMENT_STATUSES,
  isValidRole,
  isValidStatus,
  isValidPaymentStatus,
  defaultCustomer,
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
  deleteUser,
  createSession,
  resolveSession,
  extendSession,
  destroySession,
  destroyUserSessions,
  countActiveSessions,
  createPasswordToken,
  inspectPasswordToken,
  setPasswordWithToken,
  listPendingInvites,
  markLogin,
  recordUserActivity,
  listAssignments,
  assignmentsForUser,
  addAssignment,
  removeAssignment,
  recordAudit,
  recordSystemError,
  exportAuthDataForPolitician,
  deleteAuthDataForPolitician,
  listAuditEvents,
  listSystemErrors,
  listDailyInputs,
  addDailyInput,
  removeDailyInput,
  ensureAdminSeed,
  adminExists,
  getSetupStatus,
  httpError,
  defaultNotificationSettings,
  getNotificationSettings,
  MAX_DAILY_INPUTS_PER_DAY,
  SESSION_TTL_MS
};
