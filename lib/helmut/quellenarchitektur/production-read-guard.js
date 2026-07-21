"use strict";

// Helmut — Quellenplattform · Sprint 6 (Produktionsvalidierung) · Read-Only-Schutzguard.
// =============================================================================================
// STRUKTURELLE Schutzpruefung (Auftrag Phase 3): erzwingt, dass ein Produktions-Lesepfad
// AUSSCHLIESSLICH liest. Kein Upsert, kein versteckter Write, keine zustandsabhaengige Funktion,
// die je nach `method` lesen ODER schreiben kann. Reine Logik, KEIN Netz, KEIN Storage, KEINE
// Credentials — dieses Modul aktiviert KEINEN Produktionszugriff; es ist das Sicherheitsnetz DAVOR.
//
// Hintergrund (Access-Audit): die Bestands-Requests `storage.supabaseRequest` und
// `storage.tenantRequest` sind METHODEN-PARAMETRISIERT (GET/POST/PATCH/DELETE) — also genau die
// verbotene „liest oder schreibt je nach Zustand"-Form. Sie duerfen fuer die Validierung NICHT
// direkt verwendet werden; erlaubt ist nur ein Aufruf durch `readOnlyRequest`, der Methode + Ziel
// hart auf Lesen einschraenkt.

class ReadOnlyViolation extends Error {
  constructor(message) { super(message); this.name = "ReadOnlyViolation"; }
}

const READ_ONLY_HTTP = new Set(["GET", "HEAD"]);
// Endpoint-Muster, die schreiben (RPC/Upsert/Konflikt-Handling) — hart blockiert.
const WRITE_ENDPOINT_RE = /(\/rpc\/)|(on_conflict=)|(\bupsert\b)|(\binsert\b)|(\bdelete\b)|(\bupdate\b)/i;

// Prueft eine EINZELNE Anfrage strukturell auf Read-Only. Wirft bei jeder Nicht-Lese-Absicht.
function assertReadOnlyRequest({ method = "GET", endpoint = "", body } = {}) {
  const m = String(method || "GET").toUpperCase();
  if (!READ_ONLY_HTTP.has(m)) throw new ReadOnlyViolation(`Nicht-lesende HTTP-Methode blockiert: ${m}`);
  if (body != null) throw new ReadOnlyViolation("Request mit Body blockiert (nur reine Lese-GETs erlaubt)");
  if (WRITE_ENDPOINT_RE.test(String(endpoint))) throw new ReadOnlyViolation(`Schreibfaehiges Endpoint-Muster blockiert: ${endpoint}`);
  return true;
}

// Verpackt eine rohe Request-Funktion so, dass NUR GET die Leitung erreicht: Methode wird hart auf
// GET gesetzt, Body verworfen, Ziel geprueft. Ein `method`-Override im Aufruf kann NICHT schreiben.
function readOnlyRequest(rawRequest) {
  if (typeof rawRequest !== "function") throw new ReadOnlyViolation("readOnlyRequest: keine Request-Funktion");
  return async function guardedRead(endpoint, options = {}) {
    assertReadOnlyRequest({ method: options.method, endpoint, body: options.body });
    const safe = { ...options, method: "GET" };
    delete safe.body; // strukturell kein Schreibinhalt
    return rawRequest(endpoint, safe);
  };
}

// Verpackt ein Repository/Quell-Objekt: NUR die ausdruecklich freigegebenen Lese-Methoden sind
// aufrufbar; jeder andere Zugriff (insb. potentielle Writer) wirft. Zusaetzliche Verteidigungslinie
// zum Endpoint-Guard.
function readOnlyRepository(repo = {}, readMethods = []) {
  const allow = new Set(readMethods);
  return new Proxy(Object.create(null), {
    get(_t, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "__readOnly") return true;
      if (!allow.has(prop)) {
        return () => { throw new ReadOnlyViolation(`Methode nicht als read-only freigegeben: ${String(prop)}`); };
      }
      const fn = repo[prop];
      if (typeof fn !== "function") throw new ReadOnlyViolation(`Freigegebene Methode fehlt/kein Callable: ${String(prop)}`);
      return (...args) => fn.apply(repo, args);
    },
    set() { throw new ReadOnlyViolation("Read-Only-Repository ist unveraenderlich"); }
  });
}

// Strukturelle Quelltext-Analyse: findet in einem Modul-Quelltext zustandsabhaengige Requests
// (Schreib-HTTP-Methoden / RPC). Fuer den Audit-Test: belegt, dass ein Pfad schreibfaehig ist und
// deshalb nicht direkt genutzt werden darf.
function scanWriteCapability(moduleSource = "") {
  const src = String(moduleSource);
  const findings = [];
  const patterns = [
    { key: "http-write", re: /method:\s*["'](POST|PATCH|PUT|DELETE)["']/g },
    { key: "rpc-call", re: /\/rest\/v1\/rpc\//g },
    { key: "on-conflict-upsert", re: /on_conflict=/g }
  ];
  for (const p of patterns) {
    const count = (src.match(p.re) || []).length;
    if (count > 0) findings.push({ kind: p.key, count });
  }
  return { writeCapable: findings.length > 0, findings };
}

module.exports = {
  ReadOnlyViolation, READ_ONLY_HTTP,
  assertReadOnlyRequest, readOnlyRequest, readOnlyRepository, scanWriteCapability
};
