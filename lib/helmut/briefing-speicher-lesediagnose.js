"use strict";

// Nur der bestehende B2-Nurleseeinstieg oeffnet einen Kontext. Keine zusaetzlichen
// Requests, Header, Logs oder Wiederholungen; ausserhalb dieses Kontexts inert.
const { AsyncLocalStorage } = require("node:async_hooks");
const { performance } = require("node:perf_hooks");
const { createHash } = require("node:crypto");
const kontexte = new AsyncLocalStorage();
const beobachtungen = new WeakMap();
const fehler = new WeakMap();
const VERSION = "blocker2-speicher-lesediagnose/1";

function mitKontext(aktion) {
  return kontexte.run({ buildVersuche: 0, profilVorherVersuche: 0 }, aktion);
}

function markiereVersuch(art) {
  const kontext = kontexte.getStore();
  if (!kontext) return;
  if (art === "build" && kontext.buildVersuche < 2) kontext.buildVersuche++;
  if (art === "profil-vorher" && kontext.profilVorherVersuche < 2) kontext.profilVorherVersuche++;
}

function beginne(endpoint, methode, fristMs) {
  const kontext = kontexte.getStore();
  if (!kontext || (methode !== undefined && methode !== "GET")
    || typeof endpoint !== "string" || !Number.isFinite(fristMs)
    || fristMs <= 0 || fristMs > 20000) return null;
  const pfad = endpoint.split("?", 1)[0];
  const ressource = pfad === "/rest/v1/profiles" ? "profiles"
    : pfad === "/rest/v1/knowledge_objects" ? "knowledge_objects" : "andere";
  const abfrage = /^\/rest\/v1\/(?:profiles|knowledge_objects)\?id=in\.\(/.test(endpoint) ? "id-in"
    : /^\/rest\/v1\/(?:profiles|knowledge_objects)\?id=eq\./.test(endpoint) ? "id-eq" : "andere";
  const token = Object.freeze({});
  beobachtungen.set(token, { kontext, ressource, abfrage, fristMs,
    start: performance.now(), schritt: "vor-antwort-headern",
    buildVersuche: kontext.buildVersuche, profilVorherVersuche: kontext.profilVorherVersuche });
  return token;
}

function antwort(token, response) {
  const daten = token && beobachtungen.get(token);
  if (!daten || daten.kontext !== kontexte.getStore()) return;
  daten.schritt = "antwort-inhalt";
  // Diagnosefehler duerfen das Lesen oder die urspruengliche Ausnahme nie aendern.
  try {
    if (Number.isInteger(response.status) && response.status >= 100 && response.status <= 599)
      daten.httpStatus = response.status;
  } catch {}
  try {
    const id = response.headers.get("sb-request-id");
    // Ausschliesslich eine Provider-UUID, niemals freie Header-/Querywerte.
    if (typeof id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))
      daten.anbieterRequestHash = createHash("sha256").update(id).digest("hex");
  } catch {}
}

function bindeTimeout(error, token) {
  const daten = token && beobachtungen.get(token);
  if (!daten || daten.kontext !== kontexte.getStore()
    || !error || (typeof error !== "object" && typeof error !== "function")) return;
  const verstrichenMs = Math.round(performance.now() - daten.start);
  if (!Number.isSafeInteger(verstrichenMs) || verstrichenMs < 0) return;
  const dto = { version: VERSION, ressource: daten.ressource, abfrage: daten.abfrage,
    schritt: daten.schritt, fristMs: daten.fristMs, verstrichenMs,
    buildVersuche: daten.buildVersuche, profilVorherVersuche: daten.profilVorherVersuche,
    ...(daten.httpStatus !== undefined ? { httpStatus: daten.httpStatus } : {}),
    ...(daten.anbieterRequestHash ? { anbieterRequestHash: daten.anbieterRequestHash } : {}) };
  fehler.set(error, Object.freeze(dto));
  beobachtungen.delete(token);
}

function lese(error) {
  if (!error || (typeof error !== "object" && typeof error !== "function")) return null;
  return fehler.get(error) || null;
}

module.exports = { mitKontext, markiereVersuch, beginne, antwort, bindeTimeout, lese };
