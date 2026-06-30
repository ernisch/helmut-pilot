"use strict";

// HTTP-/Policy-Schicht der Helmut-Authentifizierung.
//
// Kernregel der Mandantentrennung:
// Die Identitaet eines Requests stammt AUSSCHLIESSLICH aus dem serverseitig
// aufgeloesten Session-Cookie. Ein in der URL uebergebenes `politicianId` ist nur
// eine AUSWAHL innerhalb der fuer den Nutzer freigegebenen Mandate, niemals eine
// Berechtigung. Ein manipuliertes URL-Param kann daher keine fremden Daten oeffnen.

const accounts = require("./accounts");

const SESSION_COOKIE = "helmut_session";

function authMode() {
  return String(process.env.HELMUT_AUTH_MODE || "").trim().toLowerCase() === "accounts";
}

function readCookie(request, name) {
  const cookies = String(request.headers.cookie || "").split(";").map((entry) => entry.trim());
  const prefix = `${name}=`;
  const match = cookies.find((entry) => entry.startsWith(prefix));
  if (!match) return "";
  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch {
    return match.slice(prefix.length);
  }
}

function sessionCookieHeader(token, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token || "")}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.max(0, maxAgeSeconds)}${secure}`;
}

function clearSessionCookieHeader() {
  return sessionCookieHeader("", 0);
}

function clientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket?.remoteAddress || "";
}

// Loest den aktuellen Nutzer aus dem Session-Cookie auf. Gibt null zurueck,
// wenn keine gueltige Session existiert oder der Nutzer deaktiviert ist.
async function getAuthContext(request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const resolved = await accounts.resolveSession(token);
  if (!resolved) return null;
  return { user: resolved.user, session: resolved.session, token };
}

function requireRole(user, roles) {
  if (!user) return false;
  const allowed = Array.isArray(roles) ? roles : [roles];
  return allowed.includes(user.role);
}

// Liefert die fuer einen Nutzer freigegebenen Mandate.
// Admin -> Sentinel "all" (jedes existierende Mandat). Abgeordneter -> nur das eigene.
// Referent -> nur explizit zugewiesene Mandate.
async function getAllowedPoliticianIds(user) {
  if (!user) return [];
  if (user.role === "admin") return "all";
  if (user.role === "abgeordneter") return user.politicianId ? [user.politicianId] : [];
  if (user.role === "referent" || user.role === "demo") {
    const assignments = await accounts.assignmentsForUser(user.id);
    return assignments.map((entry) => entry.politicianId);
  }
  return [];
}

function isAllowedPolitician(allowed, politicianId) {
  if (allowed === "all") return true;
  return Array.isArray(allowed) && politicianId && allowed.includes(politicianId);
}

// Bestimmt das fuer diesen Request autorisierte Mandat.
// requestedId (aus der URL) wird nur akzeptiert, wenn es in `allowed` enthalten ist;
// andernfalls faellt die Auswahl auf das erste erlaubte Mandat zurueck.
function pickPoliticianId(user, requestedId, allowed) {
  const requested = sanitizePoliticianId(requestedId);
  if (user.role === "abgeordneter") {
    // Ein Abgeordneter ist hart an sein eigenes Mandat gebunden.
    return user.politicianId || null;
  }
  if (allowed === "all") {
    // Admin darf jedes Mandat waehlen; ohne Auswahl bleibt es offen (null).
    return requested || null;
  }
  if (Array.isArray(allowed) && allowed.length) {
    if (requested && allowed.includes(requested)) return requested;
    return allowed[0];
  }
  return null;
}

function sanitizePoliticianId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
}

module.exports = {
  SESSION_COOKIE,
  authMode,
  readCookie,
  sessionCookieHeader,
  clearSessionCookieHeader,
  clientIp,
  getAuthContext,
  requireRole,
  getAllowedPoliticianIds,
  isAllowedPolitician,
  pickPoliticianId,
  sanitizePoliticianId
};
