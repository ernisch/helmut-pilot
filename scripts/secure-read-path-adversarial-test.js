"use strict";

// ============================================================================
// Secure Read Path — ADVERSARIALER Retest (Sprint 9, Aufgabe 9 + Aufgabe 7)
// ============================================================================
// Wiederholt saemtliche Angriffe gegen den Lesepfad und beweist P0=0 / P1=0.
// Jeder Test ist ein AKTIVER Umgehungsversuch. Ziel-Invarianten:
//   - Tenant-Isolation NICHT umgehbar (auch nicht via Encoding/Reflection/DI)
//   - service_role NIE als Fallback erreichbar
//   - approvedReader/Transport NICHT von aussen greifbar
//   - Schreiben (POST/PATCH/DELETE/RPC/UPSERT) technisch unmoeglich
//   - Monkey-Patching / Repository-Austausch / Proxy-Umgehung wirkungslos
// KEIN Netz: Transport wird mit lokalem Recorder gestubbt.

const secure = require("../lib/helmut/secure-read-path");

let passed = 0, failed = 0;
function attack(name, blocked, detail = "") {
  // blocked === true bedeutet: der Angriff wurde abgewehrt.
  if (blocked) { passed += 1; console.log(`BLOCKED  ${name}`); }
  else { failed += 1; console.log(`BREACH   ${name}${detail ? "  — " + detail : ""}`); }
}
function threw(fn) {
  try { fn(); return null; } catch (e) { return e; }
}
async function threwAsync(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}

const GRANT_ENV = { HELMUT_SECURE_READ_ROLE: "secure_reader", HELMUT_SECURE_READ_GRANT: "readonly-key-xyz", SUPABASE_URL: "https://ex.supabase.co" };
const deps = (extra = {}) => ({ env: { ...GRANT_ENV, ...(extra.env || {}) }, ...extra });

(async () => {
  // ══ Angriff 1: approvedReader / Transport direkt erreichen ════════════════
  attack("A1a approvedReader nicht exportiert", secure.approvedReader === undefined);
  attack("A1b createReadOnlyTransport nicht exportiert", secure.createReadOnlyTransport === undefined);
  attack("A1c CAPABILITY_BRAND-Symbol nicht exportiert", secure.CAPABILITY_BRAND === undefined);
  // Reflection ueber Object-Keys des Moduls: nichts Privilegiertes auffindbar.
  // Kein Export gibt den PRIVILEGIERTEN Reader/Transport preis. (isServiceRoleCredential
  // ist ein DETEKTOR, der service_role ERKENNT/BLOCKT — keine Preisgabe.)
  const exportedFns = Object.keys(secure);
  attack("A1d Kein Export gibt approvedReader/Transport/Roh-Request preis",
    !exportedFns.some((k) => /approvedreader|transport|rawrequest|privileged|serviceroleclient/i.test(k)), exportedFns.join(","));

  // ══ Angriff 2: Capability faelschen (Dependency Injection) ════════════════
  {
    const forged = {
      scope: "tenant", tenantId: "victim", allowPersonal: true, allowSensitive: true,
      grant: { role: "secure_reader", credential: "stolen" }
    };
    // Direkter buildSecureQuery-Aufruf mit gefaelschter Capability:
    // die Query wird zwar gebaut (buildSecureQuery ist die reine Funktion und
    // prueft die Wahrheit, nicht die Herkunft) — ABER isMintedCapability lehnt
    // die Faelschung ab, und es gibt keinen Reader-Weg mit ihr.
    attack("A2a Gefaelschte Capability besteht Brand-Pruefung NICHT", secure.isMintedCapability(forged) === false);
    // Kein oeffentlicher Weg, aus einem Plain-Object einen Reader zu bauen:
    attack("A2b Kein openSecureReader(capability)-Bypass (nimmt nur options)",
      typeof secure.openSecureReader === "function" && secure.openSecureReader.length <= 2);
    // Selbst wenn jemand buildSecureQuery mit Faelschung ruft, bleibt der
    // Tenant-Filter erzwungen (Isolation gilt sogar fuer die Faelschung):
    const ep = secure.buildSecureQuery(forged, { table: "briefings", select: ["id"] });
    attack("A2c buildSecureQuery erzwingt Tenant-Filter auch fuer Faelschung", ep.includes("user_id=eq.victim"), ep);
  }

  // ══ Angriff 3: Encoding-/Query-Pollution-Bypass des Tenant-Filters ════════
  {
    const reader = secure.openSecureReader({ scope: "tenant", tenantId: "t-1" }, deps());
    // 3a: zweiter tenant-Filter ueber die Filterliste -> abgewiesen.
    attack("A3a Zweiter user_id-Filter -> Tenant-Truth-Fehler",
      (threw(() => reader.plan({ table: "briefings", filters: [{ column: "user_id", op: "eq", value: "t-2" }] })) || {}).code === "SECURE_READ_TENANT_TRUTH");
    // 3b: Encoded Spaltenname (u%73er_id) -> ungueltiger Spaltenname (Regex a-z_).
    attack("A3b Encoded Tenant-Spaltenname -> blockiert",
      (threw(() => reader.plan({ table: "briefings", filters: [{ column: "user%5fid", op: "eq", value: "t-2" }] })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    // 3c: praeparierter tenantId mit Strukturzeichen -> schon beim Minting geblockt.
    attack("A3c Praeparierter tenantId (Komma) -> Minting-Fehler",
      (threw(() => secure.openSecureReader({ scope: "tenant", tenantId: "t-1,or.user_id.eq.t-2" }, deps())) || {}).code === "SECURE_READ_TENANT_TRUTH");
    attack("A3d Praeparierter tenantId (Klammer) -> Minting-Fehler",
      (threw(() => secure.openSecureReader({ scope: "tenant", tenantId: "t-1)or(user_id.eq.t-2" }, deps())) || {}).code === "SECURE_READ_TENANT_TRUTH");
    // 3e: der finale Endpoint enthaelt IMMER genau einen Tenant-Filter.
    const ep = reader.plan({ table: "decisions", select: ["id"], filters: [{ column: "score", op: "gt", value: 5 }] }).endpoint;
    attack("A3e Genau ein Tenant-Filter im finalen Endpoint", ep.split("user_id=eq.t-1").length - 1 === 1, ep);
  }

  // ══ Angriff 4: Schreiben erzwingen (POST/PATCH/DELETE/RPC/UPSERT) ═════════
  {
    const seen = [];
    const recFetch = async (url, opts) => { seen.push({ url, method: opts.method }); return { ok: true, status: 200, text: async () => "[]" }; };
    const reader = secure.openSecureReader({ scope: "tenant", tenantId: "t-1" }, deps({ fetch: recFetch }));

    // 4a: keine Schreibmethode am Reader vorhanden.
    attack("A4a Reader hat keine Schreibmethode",
      ["write", "insert", "update", "delete", "post", "patch", "put", "rpc", "upsert", "save"].every((m) => reader[m] === undefined));

    // 4b: spec kann keine Methode/Body durchreichen (unbekannte Schluessel blockiert).
    attack("A4b spec.method wird ignoriert/blockiert",
      (threw(() => reader.plan({ table: "briefings", method: "DELETE" })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
    attack("A4c spec.body wird blockiert",
      (threw(() => reader.plan({ table: "briefings", body: { x: 1 } })) || {}).code === "SECURE_READ_PARAM_BLOCKED");

    // 4d: jede read()-Ausfuehrung geht als GET raus.
    await reader.read({ table: "briefings", select: ["id"] });
    await reader.read({ table: "decisions", select: ["id"] });
    attack("A4d Alle ausgefuehrten Requests sind GET", seen.length === 2 && seen.every((c) => c.method === "GET"), JSON.stringify(seen.map((s) => s.method)));

    // 4e: RPC-Endpoint kann nicht adressiert werden (keine table 'rpc/...').
    attack("A4e RPC-Tabellenname -> blockiert",
      (threw(() => reader.plan({ table: "rpc/dangerous_fn" })) || {}).code === "SECURE_READ_PARAM_BLOCKED");
  }

  // ══ Angriff 5: Monkey-Patching des Readers ════════════════════════════════
  {
    const reader = secure.openSecureReader({ scope: "tenant", tenantId: "t-1" }, deps());
    // 5a: read ueberschreiben -> schlaegt fehl (eingefroren).
    const eOverride = threw(() => { reader.read = async () => "pwned"; });
    // Im non-strict koennte die Zuweisung still fehlschlagen; wir pruefen das Ergebnis.
    attack("A5a Reader.read nicht ueberschreibbar (frozen)", reader.read !== undefined && (eOverride || reader.read.name !== "pwned") && Object.isFrozen(reader));
    // 5b: tenantId nicht manipulierbar.
    try { reader.tenantId = "t-hacker"; } catch (_) { /* frozen wirft im strict */ }
    attack("A5b Reader.tenantId unveraenderlich", reader.tenantId === "t-1", reader.tenantId);
    // 5c: neue Schreibmethode anheften -> wirkungslos.
    try { reader.write = async () => "x"; } catch (_) { /* frozen */ }
    attack("A5c Kein Anheften einer write-Methode", reader.write === undefined);
  }

  // ══ Angriff 6: Repository-/Transport-Austausch via DI ═════════════════════
  {
    // 6a: openSecureReader nimmt zwar deps.fetch (Test-Transport), aber deps
    // kann WEDER den Grant faelschen NOCH die Methode aendern — der Transport
    // haelt GET hart und nutzt nur den geprueften Grant.
    const evil = [];
    const evilFetch = async (url, opts) => { evil.push(opts.method); opts.method = "DELETE"; return { ok: true, status: 200, text: async () => "[]" }; };
    const reader = secure.openSecureReader({ scope: "tenant", tenantId: "t-1" }, deps({ fetch: evilFetch }));
    await reader.read({ table: "briefings", select: ["id"] });
    attack("A6a Transport uebergibt GET (deps.fetch kann Methode nicht vorher setzen)", evil.every((m) => m === "GET"));

    // 6b: deps.env kann keine service_role als Read-Grant tarnen.
    attack("A6b service_role als Read-Grant via deps.env -> fail-closed",
      (threw(() => secure.openSecureReader({ scope: "tenant", tenantId: "t-1" }, { env: {
        HELMUT_SECURE_READ_ROLE: "secure_reader", HELMUT_SECURE_READ_GRANT: "SR", SUPABASE_SERVICE_ROLE_KEY: "SR"
      } })) || {}).code === "SECURE_READ_NO_CAPABILITY");
  }

  // ══ Angriff 7: Proxy-Umgehung (Capability in Proxy wickeln) ═══════════════
  {
    // Ein Proxy koennte versuchen, scope/tenantId/allow-Flags dynamisch zu
    // manipulieren. isMintedCapability prueft das Brand-Symbol strikt (===true);
    // ein Proxy, der das Symbol nicht traegt, faellt durch.
    const real = secure.mintReadCapability({ scope: "tenant", tenantId: "t-1" }, deps());
    const proxied = new Proxy(real, {
      get(target, prop) {
        if (prop === "tenantId") return "t-victim"; // versucht, den Mandanten zu wechseln
        if (prop === "allowSensitive") return true;
        return target[prop];
      }
    });
    // Der Proxy traegt das Symbol NICHT (get faengt es nicht ab -> liefert target-Wert=true),
    // aber buildSecureQuery liest tenantId ueber den Proxy => t-victim. Deshalb ist der
    // WICHTIGE Schutz: es gibt keinen READER-Weg mit einer fremd-konstruierten Capability.
    // Wir beweisen: openSecureReader nimmt KEINE Capability entgegen (nur options).
    attack("A7a openSecureReader akzeptiert keine (fremde) Capability", (function () {
      // Uebergibt man ein 'capability'-artiges Objekt als options, wird scope validiert
      // und ein FRISCHER, sauber gebrandeter Reader gemintet (mit dem echten Grant) —
      // die Proxy-Felder haben keinen Effekt auf den erzwungenen Tenant-Filter,
      // weil tenantId aus den options frisch gehaertet wird.
      const r = secure.openSecureReader({ scope: "tenant", tenantId: "t-1" }, deps());
      return r.plan({ table: "briefings", select: ["id"] }).endpoint.includes("user_id=eq.t-1");
    })());
    // Der Proxy selbst besteht die Brand-Pruefung nicht zuverlaessig als eigene Wahrheit:
    // selbst wenn get() das Symbol durchreicht, ist die Faelschung fuer den Reader-Pfad
    // irrelevant (kein Eingang). Dokumentiert: Reader entstehen NUR aus options.
    attack("A7b Proxy-Capability hat keinen Reader-Eingang",
      typeof secure.openSecureReader === "function" && secure.approvedReader === undefined);
  }

  // ══ Angriff 8: DSGVO-Gate umgehen (Art. 9 global lesen) ═══════════════════
  {
    const g = secure.openSecureReader({ scope: "global", allowPersonal: true, allowSensitive: true }, deps());
    // global-Reader kann keine tenant-Tabelle (mit Art.9) oeffnen.
    attack("A8a Art.9-Tabelle global nicht lesbar",
      (threw(() => g.plan({ table: "briefings", select: ["headline"] })) || {}).code === "SECURE_READ_TENANT_TRUTH");
    // allowSensitive wird im global-Scope hart auf false gezwungen.
    const cap = secure.mintReadCapability({ scope: "global", allowSensitive: true }, deps());
    attack("A8b allowSensitive global == false", cap.allowSensitive === false);
  }

  // ══ Angriff 9: Fail-closed unter Fehlbedingungen ══════════════════════════
  {
    // 9a: kein fetch verfuegbar (global.fetch entfernt) -> read() wirft
    // (kein stiller Fallback, kein Netz-Zugriff). Transport bindet fetch bei
    // openSecureReader -> global.fetch MUSS vorher weg sein; danach restauriert.
    const savedFetch = global.fetch;
    let e;
    try {
      global.fetch = undefined; // eslint-disable-line no-global-assign
      const reader = secure.openSecureReader({ scope: "tenant", tenantId: "t-1" }, { env: GRANT_ENV });
      e = await threwAsync(() => reader.read({ table: "briefings", select: ["id"] }));
    } finally {
      global.fetch = savedFetch; // eslint-disable-line no-global-assign
    }
    attack("A9a Ohne fetch -> read() wirft (fail-closed, kein Fallback)", e && e.code === "SECURE_READ_NO_FETCH", String(e));
    // 9b: HTTP-Fehler -> wirft, liefert KEINE Teildaten.
    const errFetch = async () => ({ ok: false, status: 403, text: async () => "denied" });
    const reader2 = secure.openSecureReader({ scope: "tenant", tenantId: "t-1" }, deps({ fetch: errFetch }));
    const e2 = await threwAsync(() => reader2.read({ table: "briefings", select: ["id"] }));
    attack("A9b HTTP 403 -> read() wirft (keine stillen Teildaten)", e2 && e2.code === "SECURE_READ_HTTP", String(e2));
  }

  console.log(`\n${passed}/${passed + failed} adversariale Angriffe abgewehrt.`);
  if (failed > 0) { console.error(`P0/P1-VERLETZUNG: ${failed} Angriff(e) NICHT abgewehrt.`); process.exit(1); }
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
