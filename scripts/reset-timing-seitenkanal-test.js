"use strict";

// Timing-Seitenkanal beim anonymen Passwort-Reset — OFFLINE, ohne echtes Netz.
// =============================================================================================
// Prueft, dass sich bekannte und unbekannte E-Mail-Adressen an POST /api/auth/request-reset
// weder SEMANTISCH (Status, Rumpf, Kopfzeilen) noch ZEITLICH unterscheiden lassen, und dass
// der bestehende Reset-Ablauf dabei vollstaendig funktionsfaehig bleibt.
//
// Abschnitte:
//   A  Antwortgitter — reine Funktionen (Klemmung, Stufen, nie frueher als die Arbeit)
//   B  warteBisFreigabe mit eingespeister Uhr (deterministisch, ohne echtes Warten)
//   C  Hintergrundarbeit — Fehler verschluckt, abwartbar, protokolliert nichts
//   D  Identische HTTP-Antwort: Status, Rumpf byteweise, Kopfzeilen
//   E  Zustellung: bekannte Adresse genau EINE Nachricht, unbekannte KEINE, kein Token
//   F  Funktionaler Reset: Link gueltig, Token einmalig, abgelaufen -> 410, Sitzung beendet
//   G  Transportfehler verraet keine Nutzerexistenz
//   H  Timing-Messung ueber viele Durchlaeufe (Verteilung, Median, hohe Perzentile, AUC)
//   I  Resend-Pfad ebenso entkoppelt — gegen ein GESTUBBTES globales fetch
//   J  Besitzer-Pfad ("Passwort aendern", eingeloggt) unveraendert
//   K  Kein Empfaenger, Token oder Link in irgendeiner Protokollzeile
//
// KEIN echter Versand: Abschnitte D–H/J/K sprechen mit einem lokalen Stub-Mailpit auf
// Loopback, Abschnitt I ersetzt globalThis.fetch im Testprozess. Die echte Resend-API wird
// NIE aufgerufen — zusaetzlich blockt der Netz-Guard des kanonischen Laufs jede
// Nicht-Localhost-Verbindung technisch.
// KEINE echten Adressen: ausschliesslich reservierte Domains (example.org / .test, RFC 2606).

const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

process.env.HELMUT_AUTH_MODE = "accounts";
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";
// Kurze Reset-Token-Laufzeit, damit Abschnitt F den Ablauf ECHT abwarten kann (statt ihn zu
// behaupten). Wird beim Laden von accounts.js gelesen — deshalb VOR jedem require.
process.env.HELMUT_RESET_TOKEN_TTL_MS = "1500";
// Kleines Antwortgitter: der Schutz ist derselbe, die Messung dauert nur nicht Minuten.
const FENSTER_MS = 100;
process.env.HELMUT_RESET_ANTWORT_MS = String(FENSTER_MS);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_V3_STORE;
delete process.env.HELMUT_MAIL_TRANSPORT;
delete process.env.HELMUT_MAILPIT_URL;
delete process.env.HELMUT_MAIL_FROM;
delete process.env.HELMUT_RESEND_API_KEY;
delete process.env.HELMUT_MAIL_REPLY_TO;

// Store-Hermetik: lokale Daten sichern und am Ende wiederherstellen (Muster invite-flow-test).
const dataDir = path.join(root, ".helmut-data");
const authDatei = path.join(dataDir, "auth.json");
const snapshots = new Map();
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir)) snapshots.set(f, fs.readFileSync(path.join(dataDir, f)));
}
function restoreStore() {
  try {
    if (!fs.existsSync(dataDir)) return;
    for (const f of fs.readdirSync(dataDir)) {
      if (!snapshots.has(f)) fs.unlinkSync(path.join(dataDir, f));
    }
    for (const [f, buf] of snapshots) fs.writeFileSync(path.join(dataDir, f), buf);
  } catch (_) { /* best effort */ }
}
process.on("exit", restoreStore);

const resetTiming = require("../lib/helmut/reset-timing");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

const TEST_ABSENDER = "Helmut <noreply@helmut.test>";
const BEKANNT = "eva@example.org";
const UNBEKANNT = "niemand-gibt-es-nicht@example.org";
// Offensichtlicher Platzhalter, kein echter Schluessel (Abschnitt I stubbt fetch ohnehin).
const PLATZHALTER_SCHLUESSEL = "TESTSCHLUESSEL-KEIN-ECHTER-WERT-0000";

function req(port, method, reqPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : (typeof body === "string" ? body : JSON.stringify(body));
    const start = process.hrtime.bigint();
    const r = http.request({ host: "127.0.0.1", port, method, path: reqPath, headers: {
      ...(data != null ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}),
      ...headers
    }, timeout: 30000 }, (res) => {
      let out = "";
      res.on("data", (c) => { out += c; });
      res.on("end", () => resolve({
        status: res.statusCode,
        body: out,
        headers: res.headers,
        dauerMs: Number(process.hrtime.bigint() - start) / 1e6
      }));
    });
    r.on("error", reject);
    r.on("timeout", () => { r.destroy(new Error("timeout")); });
    if (data != null) r.write(data);
    r.end();
  });
}

function parse(body) {
  try { return JSON.parse(body); } catch (_) { return {}; }
}

function tokenFromText(text) {
  const treffer = String(text || "").match(/\/passwort-setzen\?token=([^\s]+)/);
  return treffer ? decodeURIComponent(treffer[1]) : "";
}

// Kopfzeilen ohne die vom Server pro Antwort gesetzte Uhrzeit — alles andere ist
// anwendungsseitig kontrollierbar und muss identisch sein.
function kopfzeilenOhneDatum(headers) {
  const kopie = { ...headers };
  delete kopie.date;
  return JSON.stringify(Object.keys(kopie).sort().map((k) => [k, kopie[k]]));
}

function authStore() {
  try { return JSON.parse(fs.readFileSync(authDatei, "utf8")); } catch (_) { return {}; }
}

function anzahlTokens() {
  return (authStore().passwordTokens || []).length;
}

// Kernzusicherung "Tokens nur fuer tatsaechlich vorhandene Konten": JEDES gespeicherte
// Token muss auf einen existierenden Nutzer zeigen.
function alleTokensGehoerenEinemKonto() {
  const store = authStore();
  const ids = new Set((store.users || []).map((u) => u.id));
  return (store.passwordTokens || []).every((t) => ids.has(t.userId));
}

const schlafe = (ms) => new Promise((f) => setTimeout(f, ms));

// --- Statistik ------------------------------------------------------------------------------
function perzentil(werte, p) {
  const s = [...werte].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[i];
}
function median(werte) { return perzentil(werte, 50); }
// Mann-Whitney-/AUC-Statistik: Wahrscheinlichkeit, dass ein zufaellig gezogener Messwert des
// einen Zweigs groesser ist als einer des anderen. 0,5 = die beiden Verteilungen sind an der
// Zeitachse nicht unterscheidbar; 1,0 = jede einzelne Messung verraet den Zweig.
function auc(a, b) {
  let summe = 0;
  for (const x of a) for (const y of b) summe += x > y ? 1 : (x === y ? 0.5 : 0);
  return summe / (a.length * b.length);
}
function verteilung(name, werte) {
  return `${name}: n=${werte.length} min=${Math.min(...werte).toFixed(1)} p50=${median(werte).toFixed(1)} `
    + `p90=${perzentil(werte, 90).toFixed(1)} p95=${perzentil(werte, 95).toFixed(1)} `
    + `p99=${perzentil(werte, 99).toFixed(1)} max=${Math.max(...werte).toFixed(1)} (ms)`;
}

(async () => {
  // ── A · Antwortgitter, reine Funktionen ────────────────────────────────────────────────
  check("A Standardfenster ist 500 ms", resetTiming.antwortFensterMs({}) === 500,
    String(resetTiming.antwortFensterMs({})));
  check("A ungueltiger Wert faellt auf den Standard zurueck",
    resetTiming.antwortFensterMs({ HELMUT_RESET_ANTWORT_MS: "abc" }) === 500
    && resetTiming.antwortFensterMs({ HELMUT_RESET_ANTWORT_MS: "0" }) === 500
    && resetTiming.antwortFensterMs({ HELMUT_RESET_ANTWORT_MS: "-5" }) === 500);
  check("A Untergrenze geklemmt (Schutz nicht abschaltbar)",
    resetTiming.antwortFensterMs({ HELMUT_RESET_ANTWORT_MS: "1" }) === resetTiming.MIN_FENSTER_MS,
    String(resetTiming.antwortFensterMs({ HELMUT_RESET_ANTWORT_MS: "1" })));
  check("A Obergrenze geklemmt (Endpunkt bleibt benutzbar)",
    resetTiming.antwortFensterMs({ HELMUT_RESET_ANTWORT_MS: "999999" }) === resetTiming.MAX_FENSTER_MS,
    String(resetTiming.antwortFensterMs({ HELMUT_RESET_ANTWORT_MS: "999999" })));
  check("A gueltiger Wert wird uebernommen",
    resetTiming.antwortFensterMs({ HELMUT_RESET_ANTWORT_MS: "250" }) === 250);

  check("A sofort fertige Arbeit -> erste Stufe", resetTiming.freigabeZeitpunkt(1000, 1000, 100) === 1100,
    String(resetTiming.freigabeZeitpunkt(1000, 1000, 100)));
  check("A Arbeit innerhalb der ersten Stufe -> erste Stufe",
    resetTiming.freigabeZeitpunkt(1000, 1099, 100) === 1100);
  check("A Arbeit ueberzieht -> naechste Stufe, nicht 'sofort'",
    resetTiming.freigabeZeitpunkt(1000, 1101, 100) === 1200,
    String(resetTiming.freigabeZeitpunkt(1000, 1101, 100)));
  check("A exakt auf der Stufengrenze -> naechste Stufe (nie frueher als die Arbeit)",
    resetTiming.freigabeZeitpunkt(1000, 1100, 100) === 1200);
  check("A Freigabe liegt IMMER echt nach der geleisteten Arbeit", (() => {
    for (let vergangen = 0; vergangen <= 1000; vergangen += 7) {
      if (resetTiming.freigabeZeitpunkt(0, vergangen, 100) <= vergangen) return false;
    }
    return true;
  })());
  check("A Ergebnis liegt immer auf dem Gitter", (() => {
    for (let vergangen = 0; vergangen <= 1000; vergangen += 3) {
      if (resetTiming.freigabeZeitpunkt(500, 500 + vergangen, 100) % 100 !== 0) return false;
    }
    return true;
  })());

  // ── B · warteBisFreigabe mit eingespeister Uhr ─────────────────────────────────────────
  {
    let uhr = 5000;
    const geschlafen = [];
    const ziel = await resetTiming.warteBisFreigabe(5000, {
      fensterMs: 100,
      jetzt: () => uhr,
      schlafe: async (ms) => { geschlafen.push(ms); uhr += ms; }
    });
    check("B wartet bis zur ersten Stufe", ziel === 5100 && uhr === 5100, `ziel=${ziel} uhr=${uhr}`);
    check("B genau ein Schlafvorgang, wenn die Uhr sauber laeuft",
      geschlafen.length === 1 && geschlafen[0] === 100, JSON.stringify(geschlafen));
  }
  {
    // Zu frueh geweckt (setTimeout kann vorzeitig zurueckkehren): es wird nachgeschlafen.
    let uhr = 0;
    let runden = 0;
    const ziel = await resetTiming.warteBisFreigabe(0, {
      fensterMs: 100,
      jetzt: () => uhr,
      schlafe: async (ms) => { runden += 1; uhr += Math.max(1, Math.floor(ms * 0.6)); }
    });
    check("B zu frueh geweckt -> es wird nachgeschlafen", ziel === 100 && uhr >= 100 && runden > 1,
      `ziel=${ziel} uhr=${uhr} runden=${runden}`);
  }
  {
    // Arbeit hat das Fenster ueberzogen: Freigabe auf der naechsten Stufe, nicht sofort.
    let uhr = 250;
    const ziel = await resetTiming.warteBisFreigabe(0, {
      fensterMs: 100,
      jetzt: () => uhr,
      schlafe: async (ms) => { uhr += ms; }
    });
    check("B ueberzogene Arbeit -> naechste Stufe", ziel === 300 && uhr === 300, `ziel=${ziel} uhr=${uhr}`);
  }

  // ── C · Hintergrundarbeit ──────────────────────────────────────────────────────────────
  {
    check("C Ausgangszustand ohne offene Vorgaenge", resetTiming.anzahlOffeneVorgaenge() === 0,
      String(resetTiming.anzahlOffeneVorgaenge()));
    let gelaufen = 0;
    const p = resetTiming.starteHintergrundarbeit(async () => { await schlafe(20); gelaufen += 1; });
    check("C Vorgang wird waehrend der Laufzeit gezaehlt", resetTiming.anzahlOffeneVorgaenge() === 1);
    await resetTiming.offeneArbeit();
    check("C offeneArbeit() wartet den Vorgang ab", gelaufen === 1 && resetTiming.anzahlOffeneVorgaenge() === 0,
      `gelaufen=${gelaufen} offen=${resetTiming.anzahlOffeneVorgaenge()}`);
    check("C Zusage ist erfuellbar", (await p) === undefined);

    const logs = [];
    const echt = { log: console.log, error: console.error, warn: console.warn, info: console.info };
    console.log = (...a) => logs.push(a.join(" "));
    console.error = (...a) => logs.push(a.join(" "));
    console.warn = (...a) => logs.push(a.join(" "));
    console.info = (...a) => logs.push(a.join(" "));
    let abgelehnt = false;
    try {
      await resetTiming.starteHintergrundarbeit(async () => { throw new Error(`geheim ${BEKANNT}`); });
    } catch (_) { abgelehnt = true; }
    await resetTiming.offeneArbeit();
    Object.assign(console, echt);
    check("C Fehler in der Hintergrundarbeit lehnt die Zusage NICHT ab", abgelehnt === false);
    check("C Fehler in der Hintergrundarbeit protokolliert NICHTS", logs.length === 0, JSON.stringify(logs));
    check("C nach dem Fehler keine haengenden Vorgaenge", resetTiming.anzahlOffeneVorgaenge() === 0);
    let synchronerWurf = false;
    try {
      await resetTiming.starteHintergrundarbeit(() => { throw new Error("sofort"); });
    } catch (_) { synchronerWurf = true; }
    check("C auch ein SOFORT geworfener Fehler bleibt folgenlos", synchronerWurf === false);
  }

  // ── Server + Stub-Mailpit fuer D–K ─────────────────────────────────────────────────────
  const postfach = [];
  const stubZustand = { verzoegerungMs: 0, status: 200 };
  const stub = http.createServer((request, response) => {
    let roh = "";
    request.on("data", (c) => { roh += c; });
    request.on("end", () => {
      const antworten = () => {
        if (request.method === "POST" && request.url === "/api/v1/send") {
          if (stubZustand.status !== 200) {
            response.writeHead(stubZustand.status, { "Content-Type": "application/json" });
            response.end("{}");
            return;
          }
          let daten = null;
          try { daten = JSON.parse(roh); } catch (_) { daten = null; }
          if (!daten) { response.writeHead(400, { "Content-Type": "application/json" }); response.end("{}"); return; }
          postfach.push(daten);
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ ID: `stub-${postfach.length}` }));
          return;
        }
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end("{}");
      };
      if (stubZustand.verzoegerungMs > 0) setTimeout(antworten, stubZustand.verzoegerungMs);
      else antworten();
    });
  });
  await new Promise((r) => stub.listen(0, "127.0.0.1", r));
  const stubPort = stub.address().port;

  const handler = require("../server.js");
  const accounts = require("../lib/helmut/accounts");
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  let ip = 0;
  const naechsteIp = () => `10.9.${Math.floor(ip / 250) % 250}.${(ip++ % 250) + 1}`;
  const resetAnfrage = (email) => req(port, "POST", "/api/auth/request-reset", {
    headers: { "x-forwarded-for": naechsteIp() }, body: { email }
  });

  try {
    process.env.HELMUT_MAIL_TRANSPORT = "mailpit";
    process.env.HELMUT_MAILPIT_URL = `http://127.0.0.1:${stubPort}`;
    process.env.HELMUT_MAIL_FROM = TEST_ABSENDER;

    await accounts.createUser({
      email: BEKANNT, name: "Eva Bekannt", role: "abgeordneter", party: "SPD", password: "start-passwort-1"
    });

    // ── D · Identische HTTP-Antwort ──────────────────────────────────────────────────────
    postfach.length = 0;
    const aBekannt = await resetAnfrage(BEKANNT);
    await resetTiming.offeneArbeit();
    const aUnbekannt = await resetAnfrage(UNBEKANNT);
    await resetTiming.offeneArbeit();
    check("D bekannte Adresse -> 200", aBekannt.status === 200, String(aBekannt.status));
    check("D gleicher Statuscode", aBekannt.status === aUnbekannt.status,
      `${aBekannt.status} vs ${aUnbekannt.status}`);
    check("D byteweise gleicher Rumpf", aBekannt.body === aUnbekannt.body,
      `${aBekannt.body.slice(0, 120)} vs ${aUnbekannt.body.slice(0, 120)}`);
    check("D gleiche Kopfzeilen (ohne Date)",
      kopfzeilenOhneDatum(aBekannt.headers) === kopfzeilenOhneDatum(aUnbekannt.headers),
      `${kopfzeilenOhneDatum(aBekannt.headers)} vs ${kopfzeilenOhneDatum(aUnbekannt.headers)}`);
    check("D Rumpf traegt weder Link noch Ablaufzeit noch Mailstatus",
      !/resetUrl|expiresAt|"mail"|passwort-setzen/.test(aBekannt.body), aBekannt.body.slice(0, 160));
    check("D Rumpf ist die generische Zusage",
      parse(aBekannt.body).ok === true && typeof parse(aBekannt.body).hinweis === "string"
      && Object.keys(parse(aBekannt.body)).length === 2, aBekannt.body.slice(0, 160));
    const aLeer = await resetAnfrage("");
    const aUnsinn = await resetAnfrage("kein-@-adresse");
    check("D leere Adresse -> identische Antwort", aLeer.status === 200 && aLeer.body === aBekannt.body);
    check("D syntaktischer Unsinn -> identische Antwort", aUnsinn.status === 200 && aUnsinn.body === aBekannt.body);
    const aGross = await resetAnfrage(BEKANNT.toUpperCase());
    await resetTiming.offeneArbeit();
    check("D Adresse in Grossschreibung -> identische Antwort",
      aGross.status === 200 && aGross.body === aBekannt.body, aGross.body.slice(0, 120));

    // ── E · Zustellung ───────────────────────────────────────────────────────────────────
    postfach.length = 0;
    const tokensVorher = anzahlTokens();
    const eUnbekannt = await resetAnfrage(UNBEKANNT);
    await resetTiming.offeneArbeit();
    check("E unbekannte Adresse erzeugt KEINE Nachricht", postfach.length === 0, `n=${postfach.length}`);
    check("E unbekannte Adresse erzeugt KEIN Token", anzahlTokens() === tokensVorher,
      `${tokensVorher} -> ${anzahlTokens()}`);
    check("E unbekannte Adresse -> 200 generisch", eUnbekannt.status === 200 && eUnbekannt.body === aBekannt.body);

    postfach.length = 0;
    await resetAnfrage(BEKANNT);
    await resetTiming.offeneArbeit();
    check("E bekannte Adresse erzeugt GENAU EINE Nachricht", postfach.length === 1, `n=${postfach.length}`);
    check("E Nachricht geht an genau diese Adresse",
      postfach[0]?.To?.[0]?.Email === BEKANNT, JSON.stringify(postfach[0]?.To));
    check("E Betreff ist der Reset-Betreff", postfach[0]?.Subject === "Neues Passwort für Helmut festlegen",
      String(postfach[0]?.Subject));
    check("E jedes gespeicherte Token gehoert einem existierenden Konto", alleTokensGehoerenEinemKonto(),
      JSON.stringify((authStore().passwordTokens || []).map((t) => t.userId)));
    check("E der Treffer-Zweig hat ein gueltiges Reset-Token hinterlassen",
      (authStore().passwordTokens || []).some((t) => t.purpose === "reset" && !t.usedAt),
      JSON.stringify((authStore().passwordTokens || []).map((t) => t.purpose)));
    check("E Audit-Eintrag geschrieben",
      (await accounts.listAuditEvents(20)).some((e) => e.action === "password.reset-requested"));

    // ── F · Funktionaler Reset ───────────────────────────────────────────────────────────
    const evaLogin = await req(port, "POST", "/api/auth/login", {
      body: { email: BEKANNT, password: "start-passwort-1" }
    });
    check("F Anmeldung mit dem alten Passwort moeglich", evaLogin.status === 200,
      String(evaLogin.status));
    const evaCookie = String((evaLogin.headers["set-cookie"] || [""])[0]).split(";")[0];
    check("F bestehende Sitzung ist zunaechst gueltig",
      parse((await req(port, "GET", "/api/auth/session", { headers: { Cookie: evaCookie } })).body).authenticated === true);

    const resetToken = tokenFromText(postfach[0]?.Text);
    check("F Nachricht traegt einen Reset-Link", resetToken.length > 20, `len=${resetToken.length}`);
    check("F Token ist vor der Nutzung gueltig",
      parse((await req(port, "GET", `/api/auth/password-token?token=${encodeURIComponent(resetToken)}`)).body).valid === true);
    const gesetzt = await req(port, "POST", "/api/auth/set-password", {
      body: { token: resetToken, password: "eva-neu-passwort-1" }
    });
    check("F gueltiger Reset setzt das Passwort -> 200 + neue Sitzung",
      gesetzt.status === 200 && Boolean(gesetzt.headers["set-cookie"]), String(gesetzt.status));
    check("F Token ist einmalig -> zweite Nutzung 410",
      (await req(port, "POST", "/api/auth/set-password", {
        body: { token: resetToken, password: "zweiter-versuch-1" }
      })).status === 410);
    check("F bestehende Sitzung nach dem Reset beendet",
      parse((await req(port, "GET", "/api/auth/session", { headers: { Cookie: evaCookie } })).body).authenticated === false);
    check("F Anmeldung mit dem NEUEN Passwort moeglich",
      (await req(port, "POST", "/api/auth/login", { body: { email: BEKANNT, password: "eva-neu-passwort-1" } })).status === 200);

    postfach.length = 0;
    await resetAnfrage(BEKANNT);
    await resetTiming.offeneArbeit();
    const ablaufToken = tokenFromText(postfach[0]?.Text);
    check("F neuer Reset-Link erzeugt", ablaufToken.length > 20);
    await schlafe(1700); // HELMUT_RESET_TOKEN_TTL_MS = 1500
    check("F abgelaufener Token wird als ungueltig gemeldet",
      parse((await req(port, "GET", `/api/auth/password-token?token=${encodeURIComponent(ablaufToken)}`)).body).valid === false);
    check("F abgelaufener Token wird abgelehnt -> 410",
      (await req(port, "POST", "/api/auth/set-password", {
        body: { token: ablaufToken, password: "zu-spaet-passwort-1" }
      })).status === 410);

    // ── G · Transportfehler ──────────────────────────────────────────────────────────────
    postfach.length = 0;
    stubZustand.status = 500;
    const gBekannt = await resetAnfrage(BEKANNT);
    await resetTiming.offeneArbeit();
    const gUnbekannt = await resetAnfrage(UNBEKANNT);
    await resetTiming.offeneArbeit();
    stubZustand.status = 200;
    check("G Transportfehler -> Antwort unveraendert generisch",
      gBekannt.status === 200 && gBekannt.body === aBekannt.body, `${gBekannt.status} ${gBekannt.body.slice(0, 120)}`);
    check("G Transportfehler -> identisch zur unbekannten Adresse",
      gBekannt.status === gUnbekannt.status && gBekannt.body === gUnbekannt.body
      && kopfzeilenOhneDatum(gBekannt.headers) === kopfzeilenOhneDatum(gUnbekannt.headers));
    check("G Transportfehler -> keine Nachricht im Postfach", postfach.length === 0, `n=${postfach.length}`);
    check("G Transportfehler -> beide Antworten auf dem Zeitgitter",
      gBekannt.dauerMs >= FENSTER_MS - 10 && gUnbekannt.dauerMs >= FENSTER_MS - 10,
      `${gBekannt.dauerMs.toFixed(1)} / ${gUnbekannt.dauerMs.toFixed(1)}`);

    // ── H · Timing-Messung ───────────────────────────────────────────────────────────────
    // Der Transport bekommt bewusst eine spuerbare Verzoegerung: der Treffer-Zweig leistet
    // also messbar MEHR Arbeit als der Not-Found-Zweig — genau der Zustand, der frueher die
    // Antwortzeit verriet.
    const N = 48;
    const VERZOEGERUNG_MS = 150;
    stubZustand.verzoegerungMs = VERZOEGERUNG_MS;

    // Referenzwert 1: was ein Versand ueber die zentrale Versandlogik tatsaechlich kostet.
    const inviteMail = require("../lib/helmut/invite-mail");
    const vorVersand = Date.now();
    await inviteMail.sendAccessMail({
      to: BEKANNT, from: TEST_ABSENDER, subject: "Messung", text: "Messung"
    });
    const versandKostenMs = Date.now() - vorVersand;

    // Referenzwert 2: GESAMTdauer beider Zweige inkl. Hintergrundarbeit. Genau dieser
    // Unterschied war frueher an der Antwortzeit ablesbar.
    //
    // WARUM MEHRFACH GEMESSEN (Flackerfix 2026-08-03, Ursache belegt): das war
    // frueher EINE Messung je Zweig, verglichen gegen eine absolute 30-ms-Schwelle.
    // Die Not-Found-Messung ist nach unten hart am Zeitgitter (100 ms) festgenagelt,
    // nach oben aber durch Prozess-Scheduling offen — unter CPU-Last wurden bis zu
    // +45 ms gemessen. Diese Streuung ging 1:1 in die Differenz und unterschritt die
    // Schwelle in 1 von 60 Runden, OHNE dass am Schutz etwas fehlte; im CI-Lauf
    // 30806535691 war genau eine der 80 Pruefungen rot. Die Schwelle bleibt
    // unveraendert bei 30 ms — ersetzt wurde nur der Ein-Stichproben-Schaetzer durch
    // den Median mehrerer verschraenkter Runden. Ein echter Rueckfall (der Treffer-
    // Zweig leistet nicht mehr Arbeit) verschiebt den Median und bleibt rot.
    const REFERENZ_RUNDEN = 7;
    const gesamtBekanntWerte = [];
    const gesamtUnbekanntWerte = [];
    for (let i = 0; i < REFERENZ_RUNDEN; i += 1) {
      const vorGesamtB = Date.now();
      await resetAnfrage(BEKANNT);
      await resetTiming.offeneArbeit();
      gesamtBekanntWerte.push(Date.now() - vorGesamtB);
      const vorGesamtU = Date.now();
      await resetAnfrage(UNBEKANNT);
      await resetTiming.offeneArbeit();
      gesamtUnbekanntWerte.push(Date.now() - vorGesamtU);
    }
    const gesamtBekannt = median(gesamtBekanntWerte);
    const gesamtUnbekannt = median(gesamtUnbekanntWerte);

    postfach.length = 0;
    const zeitenBekannt = [];
    const zeitenUnbekannt = [];
    for (let i = 0; i < N; i += 1) {
      // Verschraenkt messen: eine Drift der Maschine trifft beide Zweige gleich.
      const b = await resetAnfrage(BEKANNT);
      const u = await resetAnfrage(UNBEKANNT);
      await resetTiming.offeneArbeit();
      zeitenBekannt.push(b.dauerMs);
      zeitenUnbekannt.push(u.dauerMs);
      if (b.status !== 200 || u.status !== 200 || b.body !== u.body) {
        check("H Antworten bleiben ueber alle Durchlaeufe identisch", false, `i=${i}`);
        break;
      }
    }
    stubZustand.verzoegerungMs = 0;
    console.log(`      ${verteilung("bekannt  ", zeitenBekannt)}`);
    console.log(`      ${verteilung("unbekannt", zeitenUnbekannt)}`);
    const dMedian = Math.abs(median(zeitenBekannt) - median(zeitenUnbekannt));
    // VORZEICHENBEHAFTET: um wie viel ist der TREFFER-Zweig langsamer als der
    // Not-Found-Zweig? Nur diese Richtung ist "die Mehrarbeit wird an der Antwort-
    // zeit sichtbar" — ein echter Seitenkanal macht den Treffer-Zweig LANGSAMER.
    const mehrzeitBekannt = median(zeitenBekannt) - median(zeitenUnbekannt);
    const dP95 = Math.abs(perzentil(zeitenBekannt, 95) - perzentil(zeitenUnbekannt, 95));
    const dP99 = Math.abs(perzentil(zeitenBekannt, 99) - perzentil(zeitenUnbekannt, 99));
    const flaeche = auc(zeitenBekannt, zeitenUnbekannt);
    console.log(`      Delta p50=${dMedian.toFixed(1)} ms · p95=${dP95.toFixed(1)} ms · p99=${dP99.toFixed(1)} ms · AUC=${flaeche.toFixed(3)}`);
    console.log(`      Referenz: ein Versand kostet ${versandKostenMs} ms · Gesamtdauer inkl. Hintergrund `
      + `bekannt ${gesamtBekannt} ms vs unbekannt ${gesamtUnbekannt} ms (Delta ${gesamtBekannt - gesamtUnbekannt} ms; `
      + `Median aus ${REFERENZ_RUNDEN} Runden, Einzelwerte bekannt [${gesamtBekanntWerte.join(" ")}] `
      + `unbekannt [${gesamtUnbekanntWerte.join(" ")}])`);

    check("H alle Durchlaeufe gemessen", zeitenBekannt.length === N && zeitenUnbekannt.length === N,
      `${zeitenBekannt.length}/${zeitenUnbekannt.length}`);
    check("H genau N Nachrichten (nur der Treffer-Zweig sendet)", postfach.length === N, `n=${postfach.length}`);
    check("H der Versand kostet echte Zeit (die Messung ist nicht trivial gruen)",
      versandKostenMs >= VERZOEGERUNG_MS * 0.8, `${versandKostenMs} ms`);
    check("H der Treffer-Zweig leistet nachweislich MEHR Arbeit als der Not-Found-Zweig",
      gesamtBekannt - gesamtUnbekannt >= 30,
      `Median aus ${REFERENZ_RUNDEN} Runden: gesamt bekannt ${gesamtBekannt} ms vs unbekannt ${gesamtUnbekannt} ms`);
    // Diese Pruefung ist GERICHTET (Flackerfix 2026-08-03, Ursache gemessen):
    // die verschraenkte Messung ist nicht artefaktfrei. Der Mailversand des
    // Treffer-Zweigs (150 ms) laeuft in DERSELBEN Ereignisschleife noch waehrend
    // der darauffolgenden unbekannt-Messung und verlangsamt sie systematisch —
    // belegt dadurch, dass AUC unter Last reproduzierbar UNTER 0,5 liegt, der
    // NOT-FOUND-Zweig also der langsamere ist. Unter 24-facher CPU-Ueberbuchung
    // wuchs dieses Artefakt auf bis zu 7 ms und liess die frueher BETRAGSMAESSIGE
    // Form (dMedian * 10 < Arbeits-Delta, also < ~5 ms) in 3 von 10 Laeufen
    // scheitern, ohne dass am Schutz etwas fehlte.
    // Ein echter Seitenkanal wirkt genau ANDERSHERUM: er macht den Treffer-Zweig
    // langsamer. Deshalb wird jetzt die vorzeichenbehaftete Mehrzeit geprueft —
    // das Artefakt ist negativ und kann die Pruefung nicht mehr rot faerben, ein
    // Leck ist positiv und faerbt sie weiterhin rot (Mutationsprobe: +99,7 ms).
    // Der Faktor 10 und die Gegenrichtung bleiben unveraendert: die umgekehrte
    // Richtung deckt weiterhin BETRAGSMAESSIG "Median < 25 ms", "Median <
    // Transportzeit/3", die AUC-Schranke und die Ueberlappungspruefung ab.
    // VERWORFEN, weil gemessen schlechter: die Hintergrundarbeit VOR der
    // unbekannt-Messung auslaufen zu lassen. Das verstaerkt das Artefakt
    // (AUC 0,237…0,409 statt 0,342…0,497, 7 von 10 Laeufen rot), weil der
    // Versand dann unmittelbar vor der Messung liegt statt sie zu ueberlappen.
    check("H genau diese Mehrarbeit ist an der ANTWORTZEIT nicht mehr ablesbar",
      mehrzeitBekannt * 10 < (gesamtBekannt - gesamtUnbekannt),
      `Antwort-Mehrzeit ${mehrzeitBekannt.toFixed(1)} ms vs Arbeits-Delta ${gesamtBekannt - gesamtUnbekannt} ms`);
    check("H keine Antwort verlaesst den Server vor dem Zeitgitter",
      Math.min(...zeitenBekannt) >= FENSTER_MS - 10 && Math.min(...zeitenUnbekannt) >= FENSTER_MS - 10,
      `min ${Math.min(...zeitenBekannt).toFixed(1)} / ${Math.min(...zeitenUnbekannt).toFixed(1)}`);
    check("H Median beider Zweige praktisch gleich (< 25 ms)", dMedian < 25, `${dMedian.toFixed(1)} ms`);
    check("H hohes Perzentil beider Zweige praktisch gleich (p95 < 60 ms)", dP95 < 60, `${dP95.toFixed(1)} ms`);
    check("H Median-Delta ist klein gegen die zusaetzliche Arbeit des Treffer-Zweigs",
      dMedian < VERZOEGERUNG_MS / 3, `${dMedian.toFixed(1)} ms vs ${VERZOEGERUNG_MS} ms Transportzeit`);
    check("H Verteilungen ueberlappen (kein trennender Schwellwert)",
      Math.min(...zeitenBekannt) <= Math.max(...zeitenUnbekannt)
      && Math.min(...zeitenUnbekannt) <= Math.max(...zeitenBekannt));
    // Das Waechterband ist bewusst WEIT: seine Aufgabe ist es, einen wieder eingebauten
    // Seitenkanal zu fangen (der liefert AUC nahe 1,0), nicht Gleichheit auf die
    // Mikrosekunde zu behaupten. Der quantitative Befund sind die Perzentil-Deltas oben.
    check("H keine praktisch nutzbare Unterscheidbarkeit (AUC 0,20…0,80)",
      flaeche >= 0.20 && flaeche <= 0.80, `AUC=${flaeche.toFixed(3)}`);

    // ── I · Resend-Pfad ist ebenso entkoppelt (gestubbtes globales fetch) ────────────────
    {
      const echtesFetch = globalThis.fetch;
      const aufrufe = [];
      globalThis.fetch = async (url, optionen) => {
        aufrufe.push(String(url));
        await schlafe(VERZOEGERUNG_MS);
        return { status: 200, text: async () => JSON.stringify({ id: "stub-resend" }) };
      };
      process.env.HELMUT_MAIL_TRANSPORT = "resend";
      process.env.HELMUT_RESEND_API_KEY = PLATZHALTER_SCHLUESSEL;
      try {
        const iBekannt = await resetAnfrage(BEKANNT);
        const iUnbekannt = await resetAnfrage(UNBEKANNT);
        check("I Resend: identische Antwort",
          iBekannt.status === iUnbekannt.status && iBekannt.body === iUnbekannt.body
          && kopfzeilenOhneDatum(iBekannt.headers) === kopfzeilenOhneDatum(iUnbekannt.headers));
        check("I Resend: Antwort kommt VOR dem Versand zurueck (entkoppelt)",
          iBekannt.dauerMs < VERZOEGERUNG_MS, `${iBekannt.dauerMs.toFixed(1)} ms < ${VERZOEGERUNG_MS} ms`);
        check("I Resend: beide Antworten auf dem Zeitgitter",
          iBekannt.dauerMs >= FENSTER_MS - 10 && iUnbekannt.dauerMs >= FENSTER_MS - 10,
          `${iBekannt.dauerMs.toFixed(1)} / ${iUnbekannt.dauerMs.toFixed(1)}`);
        await resetTiming.offeneArbeit();
        check("I Resend: genau EIN Versandaufruf, nur fuer die bekannte Adresse",
          aufrufe.length === 1, `n=${aufrufe.length}`);
        check("I Resend: Ziel ist die Code-Konstante",
          aufrufe[0] === "https://api.resend.com/emails", String(aufrufe[0]));
      } finally {
        globalThis.fetch = echtesFetch;
        process.env.HELMUT_MAIL_TRANSPORT = "mailpit";
        delete process.env.HELMUT_RESEND_API_KEY;
      }
    }

    // ── J · Besitzer-Pfad unveraendert ───────────────────────────────────────────────────
    {
      const login = await req(port, "POST", "/api/auth/login", {
        body: { email: BEKANNT, password: "eva-neu-passwort-1" }
      });
      const cookie = String((login.headers["set-cookie"] || [""])[0]).split(";")[0];
      postfach.length = 0;
      const besitzer = await req(port, "POST", "/api/auth/request-reset", {
        headers: { "x-forwarded-for": naechsteIp(), Cookie: cookie }, body: { email: BEKANNT }
      });
      const daten = parse(besitzer.body);
      check("J Besitzer bekommt den ehrlichen Zustellstatus",
        besitzer.status === 200 && daten.mail && daten.mail.sent === true, besitzer.body.slice(0, 160));
      check("J Besitzer-Pfad sendet genau eine Nachricht", postfach.length === 1, `n=${postfach.length}`);
      check("J Besitzer-Pfad antwortet ohne Gitterverzoegerung",
        besitzer.dauerMs < FENSTER_MS, `${besitzer.dauerMs.toFixed(1)} ms`);
      // Ohne Transport bekommt der Besitzer weiterhin den Kopierlink direkt.
      delete process.env.HELMUT_MAIL_TRANSPORT;
      const ohneTransport = await req(port, "POST", "/api/auth/request-reset", {
        headers: { "x-forwarded-for": naechsteIp(), Cookie: cookie }, body: { email: BEKANNT }
      });
      process.env.HELMUT_MAIL_TRANSPORT = "mailpit";
      const ohneDaten = parse(ohneTransport.body);
      check("J ohne Transport: Besitzer bekommt den Link direkt (Kopierweg unveraendert)",
        String(ohneDaten.resetUrl || "").includes("/passwort-setzen?token=")
        && ohneDaten.mail && ohneDaten.mail.sent === false, ohneTransport.body.slice(0, 200));
      // Ein FREMDER darf denselben Weg nicht bekommen.
      const fremd = await req(port, "POST", "/api/auth/request-reset", {
        headers: { "x-forwarded-for": naechsteIp(), Cookie: cookie }, body: { email: UNBEKANNT }
      });
      check("J eingeloggt, aber fremde Adresse -> generische Antwort ohne Link",
        fremd.status === 200 && !/resetUrl/.test(fremd.body), fremd.body.slice(0, 160));
    }

    // ── K · Keine Protokollzeile mit Empfaenger, Token oder Link ─────────────────────────
    {
      const logs = [];
      const echt = { log: console.log, error: console.error, warn: console.warn, info: console.info };
      console.log = (...a) => logs.push(a.map(String).join(" "));
      console.error = (...a) => logs.push(a.map(String).join(" "));
      console.warn = (...a) => logs.push(a.map(String).join(" "));
      console.info = (...a) => logs.push(a.map(String).join(" "));
      await resetAnfrage(BEKANNT);
      await resetTiming.offeneArbeit();
      stubZustand.status = 500;
      await resetAnfrage(BEKANNT);
      await resetTiming.offeneArbeit();
      stubZustand.status = 200;
      await resetAnfrage(UNBEKANNT);
      await resetTiming.offeneArbeit();
      Object.assign(console, echt);
      const text = logs.join("\n");
      check("K keine Protokollzeile nennt den Empfaenger", !text.includes(BEKANNT), text.slice(0, 200));
      check("K keine Protokollzeile nennt einen Link oder Token",
        !/passwort-setzen|token/i.test(text), text.slice(0, 200));
      check("K auch der Transportfehler wird nicht protokolliert", logs.length === 0, JSON.stringify(logs).slice(0, 200));
    }
  } finally {
    await new Promise((r) => server.close(r));
    try { stub.close(); } catch (_) { /* bereits geschlossen */ }
    delete process.env.HELMUT_MAIL_TRANSPORT;
    delete process.env.HELMUT_MAILPIT_URL;
    delete process.env.HELMUT_MAIL_FROM;
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  restoreStore();
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error("Testlauf abgebrochen:", error && error.message);
  restoreStore();
  process.exit(1);
});
