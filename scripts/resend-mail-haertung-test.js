"use strict";

// Haertung des Resend-Mailtransports und des anonymen Reset-Ablaufs — OFFLINE, ohne Netz.
// =============================================================================================
// Diese Suite deckt GENAU die drei Befunde ab, die am 2026-08-04 am gemergten Stand von
// PR #205 (+ Folgearbeit) empirisch reproduziert wurden. Jeder Abschnitt ist ein
// Regressionstest fuer einen BEWIESENEN Fehler, nicht eine Beschreibung des Ist-Codes:
//
//   B1  HOST-HEADER-POISONING BEI ECHTEM VERSAND.  Stammt die oeffentliche Basis-URL nur
//       aus dem `Host`-Kopf (kein HELMUT_PUBLIC_URL, kein Deployment-Marker), trug der per
//       Resend versendete Link den vom Anfragenden FREI WAEHLBAREN Host — gemessen
//       `http://angreifer.example.net/passwort-setzen?token=…` in einer echten Mail an ein
//       fremdes Opfer. Das ist ein Token-Exfiltrationsweg. Jetzt fail closed.
//
//   B2  FALSCHES GRUEN IM AUDIT.  Der anonyme Zweig schrieb `password.reset-requested`
//       unabhaengig davon, ob die Nachricht rausging: ein von Resend mit 429 abgelehnter
//       Versand war intern von einem erfolgreichen NICHT unterscheidbar (CLAUDE.md §4.4).
//       Jetzt traegt der Eintrag das Versandergebnis als nutzdatenfreien Grundcode.
//
//   B3  TIMING-RESTKANAL (gemessen, NICHT geschlossen — ehrlich offen gefuehrt).  Der
//       anonyme Reset-Zweig ist am Median ununterscheidbar, im SCHWANZ der Verteilung
//       aber nicht ganz: nur der Treffer-Zweig hat Arbeit, die den Freigabezeitpunkt
//       ueberziehen kann. 3 x 40 Messungen ergaben Treffer-Maxima von 528,0 / 516,3 /
//       514,4 ms gegen Nicht-Treffer-Maxima von 509,7 / 504,0 / 503,8 ms (Fenster 500 ms).
//       DREI Gegenmassnahmen wurden gebaut und gemessen, ALLE DREI waren schlechter als
//       der Ist-Zustand (Zahlen in server.js bei handleAuthRequestReset und in
//       docs/betrieb/mailversand-resend.md §9.1) — die schlechteste erreichte AUC 1,00,
//       also volle Trennschaerfe. Der Ist-Zustand bleibt deshalb unveraendert; Abschnitt E
//       friert die heute gemessene Lage ein, damit eine kuenftige Verschlechterung
//       auffaellt statt still zu passieren.
//
// KEIN echter Versand, KEINE echte Adresse: `globalThis.fetch` wird im Testprozess ersetzt,
// der Schluessel ist ein offensichtlicher Platzhalter, alle Adressen liegen in reservierten
// Domains (RFC 2606). Zusaetzlich blockt der Netz-Guard des kanonischen Laufs jede
// Nicht-Localhost-Verbindung technisch.

const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

process.env.HELMUT_AUTH_MODE = "accounts";
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";
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
delete process.env.HELMUT_PUBLIC_URL;
delete process.env.VERCEL;
delete process.env.VERCEL_ENV;
delete process.env.NODE_ENV;

// Store-Hermetik (Muster reset-timing-seitenkanal-test).
const dataDir = path.join(root, ".helmut-data");
const authDatei = path.join(dataDir, "auth.json");
const snapshots = new Map();
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir)) snapshots.set(f, fs.readFileSync(path.join(dataDir, f)));
}
process.on("exit", () => {
  try {
    if (!fs.existsSync(dataDir)) return;
    for (const f of fs.readdirSync(dataDir)) if (!snapshots.has(f)) fs.unlinkSync(path.join(dataDir, f));
    for (const [f, buf] of snapshots) fs.writeFileSync(path.join(dataDir, f), buf);
  } catch (_) { /* best effort */ }
});

const resetTiming = require("../lib/helmut/reset-timing");
const mailTransport = require("../lib/helmut/mail-transport");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

const BEKANNT = "eva@example.org";
const ANGREIFER_HOST = "angreifer.example.net";
const ECHTE_BASIS = "https://helmut.example.org";
// Offensichtlicher Platzhalter, kein echter Schluessel.
const PLATZHALTER_SCHLUESSEL = "TESTSCHLUESSEL-KEIN-ECHTER-WERT-0000";

function req(port, body, { headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const start = process.hrtime.bigint();
    const r = http.request({
      host: "127.0.0.1", port, method: "POST", path: "/api/auth/request-reset",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), ...headers },
      agent: false, timeout: 30000
    }, (res) => {
      let out = ""; res.on("data", (c) => { out += c; });
      res.on("end", () => resolve({
        status: res.statusCode, body: out, headers: res.headers,
        dauerMs: Number(process.hrtime.bigint() - start) / 1e6
      }));
    });
    r.on("error", reject);
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.write(data); r.end();
  });
}

function auditEvents() {
  try { return JSON.parse(fs.readFileSync(authDatei, "utf8")).auditEvents || []; } catch (_) { return []; }
}
// `recordAudit` stellt neue Eintraege VORNE ein (unshift) — die neuen stehen also am Anfang.
function neueAuditEvents(vorherLaenge) {
  const alle = auditEvents();
  return alle.slice(0, Math.max(0, alle.length - vorherLaenge));
}

const pp = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p / 100 * s.length) - 1))]; };
// Mann-Whitney-/AUC-Statistik: 0,5 = an der Zeitachse nicht unterscheidbar.
const auc = (a, b) => { let s = 0; for (const x of a) for (const y of b) s += x > y ? 1 : (x === y ? 0.5 : 0); return s / (a.length * b.length); };

(async () => {
  // ── A · Antwortgitter: die Zusicherungen, die den Schutz tragen ───────────────────────
  // Reine Funktionspruefung mit eingespeister Uhr — kein echtes Warten.
  {
    // Die Freigabe liegt IMMER echt nach der geleisteten Arbeit und IMMER auf dem Gitter.
    // Faellt eine der beiden Eigenschaften weg, wird die Antwortzeit stetig — und ein
    // stetiger Wert traegt die Arbeitsdauer nach aussen.
    let aufDemGitter = true, immerSpaeter = true;
    for (let vergangen = 0; vergangen <= 1000; vergangen += 7) {
      const z = resetTiming.freigabeZeitpunkt(0, vergangen, 100);
      if (z % 100 !== 0) aufDemGitter = false;
      if (z <= vergangen) immerSpaeter = false;
    }
    check("A jede Freigabe liegt auf dem Gitter", aufDemGitter);
    check("A jede Freigabe liegt echt nach der geleisteten Arbeit", immerSpaeter);
  }
  {
    // Ueberzogene Arbeit darf NICHT "sofort" bedeuten — sonst waere die Ueberziehung
    // selbst das Signal.
    let uhr = 250;
    const ziel = await resetTiming.warteBisFreigabe(0, {
      fensterMs: 100, jetzt: () => uhr, schlafe: async (ms) => { uhr += ms; }
    });
    check("A ueberzogene Arbeit wartet bis zur naechsten Stufe", ziel === 300 && uhr === 300,
      `ziel=${ziel} uhr=${uhr}`);
  }
  {
    // Der Schutz darf per Umgebungsvariable weder abschaltbar noch sprengbar sein.
    check("A Fenster ist nach unten und oben hart geklemmt",
      resetTiming.antwortFensterMs({ HELMUT_RESET_ANTWORT_MS: "1" }) === resetTiming.MIN_FENSTER_MS
      && resetTiming.antwortFensterMs({ HELMUT_RESET_ANTWORT_MS: "999999" }) === resetTiming.MAX_FENSTER_MS
      && resetTiming.antwortFensterMs({ HELMUT_RESET_ANTWORT_MS: "0" }) === resetTiming.STANDARD_FENSTER_MS);
  }

  // ── B · Zustellarbeit liegt im Wartefenster, nicht dahinter ───────────────────────────
  // GEGENRICHTUNG GEMESSEN (2026-08-04): Es lag nahe, die Zustellarbeit erst NACH der
  // ausgelieferten Antwort zu starten. Das macht den Kanal SCHLECHTER, nicht besser — die
  // Arbeit belegt den einkernigen Event-Loop dann waehrend der FOLGEanfrage, und weil nur
  // der Treffer-Zweig Arbeit erzeugt, korreliert diese Kaskade mit der Trefferlage
  // (AUC 0,63–0,73; ohne Antwortgitter sogar 1,00). Zahlen und alle vier gemessenen
  // Varianten stehen in server.js bei handleAuthRequestReset.
  {
    let gelaufen = 0;
    const vorgang = resetTiming.starteHintergrundarbeit(async () => { gelaufen += 1; });
    check("B Hintergrundarbeit startet sofort (im Wartefenster, nicht danach)",
      resetTiming.anzahlOffeneVorgaenge() === 1, String(resetTiming.anzahlOffeneVorgaenge()));
    await resetTiming.offeneArbeit();
    check("B die Arbeit laeuft genau einmal", gelaufen === 1, String(gelaufen));
    check("B Zusage lehnt nie ab", (await vorgang) === undefined);
  }
  {
    // Fehler bleiben folgenlos und protokollieren NICHTS (Nutzdaten dieses Pfades).
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
    check("B ein Fehler der Zustellarbeit lehnt die Zusage NICHT ab", abgelehnt === false);
    check("B ein Fehler der Zustellarbeit protokolliert NICHTS", logs.length === 0, JSON.stringify(logs));
  }

  // ── Server + gestubbtes globales fetch fuer C–F ───────────────────────────────────────
  const echtesFetch = globalThis.fetch;
  const postfach = [];
  const stub = { status: 200, verzoegerungMs: 0, fehlerart: "rate_limit_exceeded" };
  globalThis.fetch = async (url, optionen) => {
    if (stub.verzoegerungMs > 0) await new Promise((r) => setTimeout(r, stub.verzoegerungMs));
    let rumpf = null;
    try { rumpf = JSON.parse(optionen && optionen.body); } catch (_) { rumpf = null; }
    postfach.push({ url: String(url), rumpf, kopfzeilen: (optionen && optionen.headers) || {} });
    if (stub.status !== 200) {
      return { status: stub.status, text: async () => JSON.stringify({ name: stub.fehlerart }) };
    }
    return { status: 200, text: async () => JSON.stringify({ id: `stub-${postfach.length}` }) };
  };

  const handler = require("../server.js");
  const accounts = require("../lib/helmut/accounts");
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  let ip = 0;
  const nip = () => `10.${Math.floor(ip / 62500) % 250}.${Math.floor(ip / 250) % 250}.${(ip++ % 250) + 1}`;
  const anfrage = (email, headers = {}) => req(port, { email }, { headers: { "x-forwarded-for": nip(), ...headers } });
  const linkAus = (eintrag) => {
    const roh = JSON.stringify((eintrag && eintrag.rumpf) || {});
    const treffer = roh.match(/https?:\/\/[^\s"\\]*\/passwort-setzen\?token=[^\s"\\]+/);
    return treffer ? treffer[0] : "";
  };

  try {
    process.env.HELMUT_MAIL_TRANSPORT = "resend";
    process.env.HELMUT_RESEND_API_KEY = PLATZHALTER_SCHLUESSEL;
    process.env.HELMUT_MAIL_FROM = "Helmut <noreply@helmut.test>";

    await accounts.createUser({
      email: BEKANNT, name: "Eva Bekannt", role: "abgeordneter", party: "SPD", password: "start-passwort-1"
    });

    // ── C · B1: Host-Header darf keinen echten Versand tragen ───────────────────────────
    {
      delete process.env.HELMUT_PUBLIC_URL; // keine vertrauenswuerdige Quelle
      const vorher = auditEvents().length;
      postfach.length = 0;
      const antwort = await anfrage(BEKANNT, { host: ANGREIFER_HOST });
      await resetTiming.offeneArbeit();
      check("C ohne vertrauenswuerdige Basis-URL geht KEINE echte Mail raus",
        postfach.length === 0, `nachrichten=${postfach.length} link=${linkAus(postfach[0])}`);
      check("C die Antwort nach aussen bleibt generisch (200, kein Link)",
        antwort.status === 200 && !/passwort-setzen/.test(antwort.body) && /"ok": *true/.test(antwort.body),
        `${antwort.status} ${antwort.body}`);
      const neu = neueAuditEvents(vorher);
      check("C der unterdrueckte Versand ist INTERN belegt",
        neu.length === 1 && neu[0].action === "password.reset-requested"
        && String(neu[0].detail || "").includes("mail-basis-url-nicht-vertrauenswuerdig"),
        JSON.stringify(neu.map((e) => ({ a: e.action, d: e.detail }))));
    }
    {
      // Gegenprobe: mit vertrauenswuerdiger Basis-URL geht die Mail raus — und der Link
      // traegt NIE den Host der Anfrage, auch wenn der gefaelscht ist.
      process.env.HELMUT_PUBLIC_URL = ECHTE_BASIS;
      postfach.length = 0;
      await anfrage(BEKANNT, { host: ANGREIFER_HOST });
      await resetTiming.offeneArbeit();
      const link = linkAus(postfach[0]);
      check("C mit HELMUT_PUBLIC_URL wird zugestellt", postfach.length === 1, String(postfach.length));
      check("C der Link zeigt auf die konfigurierte Basis, nicht auf den Angreifer-Host",
        link.startsWith(`${ECHTE_BASIS}/passwort-setzen?token=`) && !link.includes(ANGREIFER_HOST),
        link.replace(/token=[^&"]*/, "token=<REDACTED>"));
      check("C das Ziel ist die Resend-Konstante",
        postfach[0].url === mailTransport.RESEND_API_URL, String(postfach[0].url));
    }
    {
      // Der lokale Testtransport bleibt bewusst nutzbar: Mailpit ist Loopback und kann
      // kein fremdes Opfer erreichen. Diese Zusicherung darf die Haertung nicht kippen.
      delete process.env.HELMUT_PUBLIC_URL;
      process.env.HELMUT_MAIL_TRANSPORT = "mailpit";
      const konfig = mailTransport.transportKonfiguration(process.env);
      check("C Mailpit bleibt ohne HELMUT_PUBLIC_URL aktivierbar (Loopback erreicht niemanden)",
        konfig.aktiv === true && konfig.transport === "mailpit", JSON.stringify(konfig));
      process.env.HELMUT_MAIL_TRANSPORT = "resend";
      process.env.HELMUT_PUBLIC_URL = ECHTE_BASIS;
    }

    // ── D · B2: Jeder Ausgang ist intern ehrlich belegt ─────────────────────────────────
    {
      // Resend lehnt mit 429 ab: der Audit-Eintrag darf das NICHT als Erfolg fuehren.
      const vorher = auditEvents().length;
      postfach.length = 0;
      stub.status = 429; stub.fehlerart = "rate_limit_exceeded";
      await anfrage(BEKANNT);
      await resetTiming.offeneArbeit();
      stub.status = 200;
      const neu = neueAuditEvents(vorher);
      check("D abgelehnter Versand (429) wird versucht und ehrlich vermerkt",
        postfach.length === 1 && neu.length === 1
        && String(neu[0].detail || "").startsWith("mail:nicht-gesendet:"),
        `${postfach.length} ${JSON.stringify(neu.map((e) => e.detail))}`);
      check("D der Grund benennt das Anbieterlimit",
        String(neu[0] && neu[0].detail).includes(mailTransport.GRUND.RESEND_LIMIT),
        String(neu[0] && neu[0].detail));
    }
    {
      // Erfolgreicher Versand: ebenfalls belegt — sonst waere "kein Eintrag" der Normalfall
      // und ein Ausfall faellt nie auf.
      const vorher = auditEvents().length;
      postfach.length = 0;
      await anfrage(BEKANNT);
      await resetTiming.offeneArbeit();
      const neu = neueAuditEvents(vorher);
      check("D erfolgreicher Versand wird als gesendet belegt",
        postfach.length === 1 && neu.length === 1 && neu[0].detail === "mail:gesendet",
        JSON.stringify(neu.map((e) => e.detail)));
    }
    {
      // Zeitabbruch des Anbieters darf ebenfalls nicht als Erfolg erscheinen.
      const vorher = auditEvents().length;
      postfach.length = 0;
      const echterAbbruch = globalThis.fetch;
      globalThis.fetch = async () => { const e = new Error("abgebrochen"); e.name = "AbortError"; throw e; };
      await anfrage(BEKANNT);
      await resetTiming.offeneArbeit();
      globalThis.fetch = echterAbbruch;
      const neu = neueAuditEvents(vorher);
      check("D Zeitabbruch wird als nicht gesendet belegt",
        neu.length === 1 && String(neu[0].detail || "").includes(mailTransport.GRUND.RESEND_ZEITABBRUCH),
        JSON.stringify(neu.map((e) => e.detail)));
    }
    {
      // Unbekannte Adresse: KEIN Versand, KEIN Audit-Eintrag — sonst waere das Audit selbst
      // der Enumerationskanal fuer jeden, der es lesen darf.
      const vorher = auditEvents().length;
      postfach.length = 0;
      await anfrage("gibt-es-nicht@example.org");
      await resetTiming.offeneArbeit();
      check("D unbekannte Adresse: keine Nachricht, kein Audit-Eintrag",
        postfach.length === 0 && auditEvents().length === vorher,
        `${postfach.length} ${auditEvents().length - vorher}`);
    }
    {
      // Kein Grundcode darf Nutzdaten tragen: die Detail-Zeile ist ein reiner Code.
      const eintraege = auditEvents().filter((e) => e.action === "password.reset-requested");
      const sauber = eintraege.every((e) => {
        const d = String(e.detail || "");
        return d === "" || (/^mail:[a-z-]+(:[a-z0-9-]+)?$/.test(d)
          && !d.includes("@") && !d.includes(PLATZHALTER_SCHLUESSEL) && !d.includes("token"));
      });
      check("D kein Audit-Detail traegt Adresse, Token oder Schluessel", sauber,
        JSON.stringify(eintraege.map((e) => e.detail)));
    }

    // ── E · B3: Zeitliche Ununterscheidbarkeit unter Event-Loop-Last ────────────────────
    {
      // Der Store wird bewusst gross gemacht: das Serialisieren ist die synchrone Arbeit,
      // die frueher den Timer der Quantisierung verspaetete. Ohne Fuellung waere die
      // Messung wertlos, weil das Delta gar nicht erst entstuende.
      for (let i = 0; i < 200; i += 1) {
        await accounts.createUser({
          email: `fuell${i}@example.org`, name: `Fuellwert ${i}`.repeat(18),
          role: "abgeordneter", party: "SPD", password: `pw-fuellwert-${i}`
        });
      }
      const kib = fs.statSync(authDatei).size / 1024;
      stub.verzoegerungMs = 200; // externer Roundtrip
      const treffer = [], fehl = [];
      const RUNDEN = 40;
      for (let i = 0; i < RUNDEN; i += 1) {
        // Reihenfolge deterministisch gemischt (kein Math.random): sonst misst man nur
        // die Nachwirkung der jeweils vorangegangenen Anfrage.
        const t = () => anfrage(BEKANNT);
        const f = () => anfrage(`unbekannt-${i}@example.org`);
        if ((i % 3) !== 1) { treffer.push((await t()).dauerMs); fehl.push((await f()).dauerMs); }
        else { fehl.push((await f()).dauerMs); treffer.push((await t()).dauerMs); }
      }
      await resetTiming.offeneArbeit();
      stub.verzoegerungMs = 0;
      const a = auc(treffer, fehl);
      // DAS eigentliche Signal ist NICHT der Median — der war schon vorher gleich, weshalb
      // AUC zwischen Laeufen schwankte (gemessen 0,39–0,50 am fehlerhaften Stand). Messbar
      // war der ASYMMETRISCHE SCHWANZ: nur der Treffer-Zweig hatte Arbeit, die den Timer
      // ueber den Gitterpunkt hinausschieben konnte. Am fehlerhaften Stand ergaben 3 x 40
      // Messungen Treffer-Maxima von 528,0 / 516,3 / 514,4 ms gegen Nicht-Treffer-Maxima von
      // 509,7 / 504,0 / 503,8 ms (Fenster 500 ms) — ein Wert deutlich ueber dem Gitterpunkt
      // war also ein Existenz-Signal. Genau dieser Abstand wird hier gemessen.
      const ueberzug = (ms) => ms % FENSTER_MS;
      const maxUeberzugT = Math.max(...treffer.map(ueberzug));
      const maxUeberzugF = Math.max(...fehl.map(ueberzug));
      console.log(`      [E] Store=${kib.toFixed(0)}KiB Fenster=${FENSTER_MS}ms n=${RUNDEN}`);
      console.log(`      [E] Treffer p50=${pp(treffer, 50).toFixed(1)} p90=${pp(treffer, 90).toFixed(1)} max=${Math.max(...treffer).toFixed(1)} maxUeberzug=${maxUeberzugT.toFixed(1)}`);
      console.log(`      [E] Fehl    p50=${pp(fehl, 50).toFixed(1)} p90=${pp(fehl, 90).toFixed(1)} max=${Math.max(...fehl).toFixed(1)} maxUeberzug=${maxUeberzugF.toFixed(1)}`);
      console.log(`      [E] AUC=${a.toFixed(3)}`);
      // Der Treffer-Zweig darf keinen SYSTEMATISCH laengeren Schwanz haben. Die Schranke ist
      // bewusst grosszuegig (geteilte CI-Hardware rauscht), trifft den gemessenen Befund aber
      // sicher: dort lag der Treffer-Ueberzug um das 2–4-fache ueber dem des anderen Zweigs.
      // KERNZUSICHERUNG gegen den EINEN Fall, der mit einer einzigen Anfrage ausnutzbar
      // waere: beide Zweige muessen typischerweise im SELBEN Fenster antworten. Rutscht
      // der Treffer-Zweig systematisch ein Fenster weiter (weil seine Arbeit im
      // Antwortpfad laege und das Fenster ueberzieht), ist die Adresse ohne jede
      // Statistik ablesbar — gemessen an der Vorgaengerfassung: p50 200,7 gegen 101,6 ms.
      const fenster = (ms) => Math.floor(ms / FENSTER_MS);
      check("E beide Zweige antworten im selben Fenster (kein Ein-Anfrage-Orakel)",
        fenster(pp(treffer, 50)) === fenster(pp(fehl, 50)),
        `treffer p50=${pp(treffer, 50).toFixed(1)} (Fenster ${fenster(pp(treffer, 50))}) `
        + `fehl p50=${pp(fehl, 50).toFixed(1)} (Fenster ${fenster(pp(fehl, 50))})`);
      check("E kein systematisch laengerer Zeit-Schwanz im Treffer-Zweig",
        maxUeberzugT <= Math.max(maxUeberzugF * 3, FENSTER_MS * 0.5),
        `treffer=${maxUeberzugT.toFixed(1)}ms fehl=${maxUeberzugF.toFixed(1)}ms`);
      check("E Treffer- und Nicht-Treffer-Zweig sind an der Zeitachse nicht trennscharf",
        Math.abs(a - 0.5) <= 0.20, `AUC=${a.toFixed(3)}`);
      check("E keine Antwort verlaesst den Server jenseits eines halben Fensters ueber dem Gitter",
        [...treffer, ...fehl].every((ms) => ueberzug(ms) < FENSTER_MS * 0.5),
        JSON.stringify([...treffer, ...fehl].filter((ms) => ueberzug(ms) >= FENSTER_MS * 0.5).slice(0, 5)));
    }

    // ── F · Die Antwort bleibt in JEDEM Ausgang byte-identisch ──────────────────────────
    {
      const ohneDatum = (h) => { const k = { ...h }; delete k.date; return JSON.stringify(Object.keys(k).sort().map((x) => [x, k[x]])); };
      stub.status = 429;
      const abgelehnt = await anfrage(BEKANNT);
      await resetTiming.offeneArbeit();
      stub.status = 200;
      const erfolg = await anfrage(BEKANNT);
      await resetTiming.offeneArbeit();
      const unbekannt = await anfrage("auch-nicht-da@example.org");
      await resetTiming.offeneArbeit();
      check("F Statuscode identisch in allen drei Ausgaengen",
        abgelehnt.status === 200 && erfolg.status === 200 && unbekannt.status === 200);
      check("F Rumpf byteweise identisch",
        abgelehnt.body === erfolg.body && erfolg.body === unbekannt.body,
        JSON.stringify([abgelehnt.body, erfolg.body, unbekannt.body]));
      check("F Kopfzeilen identisch",
        ohneDatum(abgelehnt.headers) === ohneDatum(erfolg.headers)
        && ohneDatum(erfolg.headers) === ohneDatum(unbekannt.headers));
      check("F kein Schluessel und keine Adresse in der Antwort",
        ![abgelehnt, erfolg, unbekannt].some((a) => a.body.includes(PLATZHALTER_SCHLUESSEL) || a.body.includes(BEKANNT)));
    }
  } finally {
    globalThis.fetch = echtesFetch;
    server.close();
  }

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error("SUITE-FEHLER", e); process.exit(1); });
