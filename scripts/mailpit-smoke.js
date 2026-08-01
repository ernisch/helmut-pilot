"use strict";

// ECHTER Mailpit-Smoke-Test — braucht ein LAUFENDES lokales Mailpit.
// =============================================================================================
// Aufruf (ein Befehl, nachdem `mailpit` in einem zweiten Terminal laeuft):
//
//     npm run test:mailpit-smoke
//
// Anleitung: docs/betrieb/lokale-mailtests-mailpit.md
//
// WAS GEPRUEFT WIRD — die bestehenden HTTP-Ablaeufe, so vollstaendig wie moeglich:
//   1. Ist Mailpit ueberhaupt erreichbar?           (sonst FEHLSCHLAG, nie stilles Gruen)
//   2. Eigenes, eindeutig isoliertes Testpostfach   (reservierte Adresse + Laufkennung)
//   3. Nur die EIGENEN Nachrichten werden geloescht (Mailpit-Suchloeschung nach Empfaenger)
//   4. Admin legt ein Testkonto an                  (echter Admin-Ablauf, echte HTTP-Route)
//   5. Genau EINE Einladung im Postfach
//   6. Absender, Empfaenger, Betreff, Text
//   7. Gueltiger LOKALER Einladungslink in der Nachricht
//   8. Neue Einladung entwertet das alte Token
//   9. Anonymer Passwort-Reset fuer die bekannte Testadresse
//  10. Genau EINE Reset-Nachricht
//  11. Derselbe Ablauf fuer eine UNBEKANNTE reservierte Adresse
//  12. Identische HTTP-Antwort, aber KEINE Nachricht
//  13. Reset-Token funktioniert genau einmal
//  14. Bestehende Sitzungen sind nach dem Reset beendet
//  15. Mailpit-Ausfall -> ehrlicher Versandstatus (sent:false)
//
// GRENZEN, DIE DIESER TEST EINHAELT:
//   - Es verlaesst KEINE Nachricht den lokalen Rechner (Loopback-Zwang im Transport).
//   - Es werden ausschliesslich reservierte Adressen benutzt (example.org, RFC 2606).
//   - Es werden NUR die eigenen Nachrichten dieses Laufs geloescht, nie fremde Daten.
//   - Der lokale Datenspeicher (.helmut-data) wird vorher gesichert und danach
//     wiederhergestellt.
//
// WARUM DIESE DATEI NICHT AUF "-test.js" ENDET: `scripts/run-offline-tests.js` sammelt jede
// `*-test.js` automatisch in die CI-Offline-Suite ein. Dieser Test braucht ein laufendes
// Mailpit und wuerde dort zwangslaeufig rot — er bleibt deshalb bewusst ausserhalb des
// Offline-Gates. Beim Umbenennen muesste er in die DENYLIST des Runners aufgenommen werden.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const root = path.join(__dirname, "..");

const MAILPIT_URL = String(process.env.HELMUT_MAILPIT_URL || "http://127.0.0.1:8025").replace(/\/+$/, "");
const ABSENDER = process.env.HELMUT_MAIL_FROM || "Helmut <noreply@helmut.test>";
const LAUF = `${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
const ADRESSE_BEKANNT = `helmut-smoke-${LAUF}@example.org`;
const ADRESSE_UNBEKANNT = `helmut-smoke-unbekannt-${LAUF}@example.org`;

process.env.HELMUT_AUTH_MODE = "accounts";
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";
process.env.HELMUT_MAIL_TRANSPORT = "mailpit";
process.env.HELMUT_MAILPIT_URL = MAILPIT_URL;
process.env.HELMUT_MAIL_FROM = ABSENDER;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_V3_STORE;

// Store-Hermetik: lokale Daten sichern und am Ende wiederherstellen.
const dataDir = path.join(root, ".helmut-data");
const snapshots = new Map();
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir)) snapshots.set(f, fs.readFileSync(path.join(dataDir, f)));
}
process.on("exit", () => {
  try {
    if (!fs.existsSync(dataDir)) return;
    for (const f of fs.readdirSync(dataDir)) {
      if (!snapshots.has(f)) fs.unlinkSync(path.join(dataDir, f));
    }
    for (const [f, buf] of snapshots) fs.writeFileSync(path.join(dataDir, f), buf);
  } catch (_) { /* best effort */ }
});

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

// --- Helmut-HTTP ---------------------------------------------------------------------------

function req(port, method, reqPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : (typeof body === "string" ? body : JSON.stringify(body));
    const r = http.request({ host: "127.0.0.1", port, method, path: reqPath, headers: {
      ...(data != null ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}),
      ...headers
    }, timeout: 20000 }, (res) => {
      let out = "";
      res.on("data", (c) => { out += c; });
      res.on("end", () => resolve({ status: res.statusCode, body: out, headers: res.headers }));
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

function tokenAusText(text) {
  const treffer = String(text || "").match(/\/passwort-setzen\?token=([^\s]+)/);
  return treffer ? decodeURIComponent(treffer[1]) : "";
}

// --- Mailpit-HTTP --------------------------------------------------------------------------

async function mailpit(method, pfad) {
  const antwort = await fetch(`${MAILPIT_URL}${pfad}`, { method, signal: AbortSignal.timeout(5000) });
  const roh = await antwort.text();
  let daten = null;
  try { daten = JSON.parse(roh); } catch (_) { daten = null; }
  return { status: antwort.status, daten, roh };
}

function suche(adresse) {
  return mailpit("GET", `/api/v1/search?query=${encodeURIComponent(`to:${adresse}`)}&limit=50`);
}

// Loescht ausschliesslich Nachrichten AN unsere eigene Laufadresse — nie fremde Daten.
function loescheEigene(adresse) {
  return mailpit("DELETE", `/api/v1/search?query=${encodeURIComponent(`to:${adresse}`)}`);
}

// Mailpit speichert die Nachricht innerhalb der Sendeanfrage; der kurze Abgleich hier
// schuetzt nur gegen Indexverzoegerung und macht den Test nicht zeitabhaengig gruen:
// die Zusicherung prueft anschliessend die EXAKTE Anzahl.
async function wartePostfach(adresse, erwartet, timeoutMs = 4000) {
  const ende = Date.now() + timeoutMs;
  let letzte = { daten: { messages: [], messages_count: 0 } };
  for (;;) {
    letzte = await suche(adresse);
    const n = (letzte.daten && letzte.daten.messages || []).length;
    if (n >= erwartet || Date.now() > ende) return letzte;
    await new Promise((r) => setTimeout(r, 120));
  }
}

async function nachricht(id) {
  const res = await mailpit("GET", `/api/v1/message/${encodeURIComponent(id)}`);
  return res.daten || {};
}

// --- Lauf ----------------------------------------------------------------------------------

(async () => {
  // 1) Ist Mailpit erreichbar? Ohne Mailpit gibt es KEIN stilles Gruen.
  let info = null;
  try {
    info = await mailpit("GET", "/api/v1/info");
  } catch (error) {
    console.error(`\nFEHLSCHLAG: Mailpit ist unter ${MAILPIT_URL} nicht erreichbar (${error && error.message}).`);
    console.error("Starte Mailpit in einem zweiten Terminal mit:  mailpit");
    console.error("Oberflaeche danach:                            http://localhost:8025");
    console.error("Anleitung:                                     docs/betrieb/lokale-mailtests-mailpit.md");
    process.exit(1);
  }
  if (!info || info.status !== 200 || !info.daten) {
    console.error(`\nFEHLSCHLAG: ${MAILPIT_URL}/api/v1/info antwortet nicht wie Mailpit (HTTP ${info && info.status}).`);
    process.exit(1);
  }
  console.log(`Mailpit erreichbar: ${MAILPIT_URL} (Version ${info.daten.Version || "unbekannt"})`);
  console.log(`Laufkennung: ${LAUF} · Testpostfach: ${ADRESSE_BEKANNT}\n`);
  check("1 Mailpit erreichbar und antwortet als Mailpit", Boolean(info.daten.Version), JSON.stringify(info.daten).slice(0, 120));

  // 2/3) Eigenes Postfach vorbereiten — nur die eigenen Adressen leeren.
  await loescheEigene(ADRESSE_BEKANNT);
  await loescheEigene(ADRESSE_UNBEKANNT);
  const vorher = await suche(ADRESSE_BEKANNT);
  check("2/3 eigenes Testpostfach ist leer (nur eigene Adressen geleert)",
    (vorher.daten.messages || []).length === 0, `n=${(vorher.daten.messages || []).length}`);

  const handler = require("../server.js");
  const accounts = require("../lib/helmut/accounts");
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  try {
    // 4) Testkonto ueber den bestehenden Admin-Ablauf anlegen.
    const adminMail = `helmut-smoke-admin-${LAUF}@example.org`;
    await accounts.createUser({ email: adminMail, name: "Smoke Admin", role: "admin", password: "sicher-genug-1" });
    const loginRes = await req(port, "POST", "/api/auth/login", { body: { email: adminMail, password: "sicher-genug-1" } });
    check("4 Admin-Login ueber die echte Route", loginRes.status === 200, `status=${loginRes.status}`);
    const adminCookie = String((loginRes.headers["set-cookie"] || [""])[0]).split(";")[0];
    const csrf = parse((await req(port, "GET", "/api/security/csrf", { headers: { Cookie: adminCookie } })).body).token;
    const adminWrite = { Cookie: adminCookie, "x-csrf-token": csrf };

    const anlage = await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Eva Smoke", email: ADRESSE_BEKANNT, role: "abgeordneter", party: "SPD"
    } });
    const konto = parse(anlage.body);
    check("4 Kontoanlage ueber /api/admin/users -> 200", anlage.status === 200, `status=${anlage.status}`);
    check("4 Mail-Status ehrlich sent:true", konto.mail && konto.mail.sent === true, JSON.stringify(konto.mail));

    // 5) Genau EINE Einladung.
    const nachAnlage = await wartePostfach(ADRESSE_BEKANNT, 1);
    const eingang = nachAnlage.daten.messages || [];
    check("5 genau EINE Einladung empfangen", eingang.length === 1, `n=${eingang.length}`);

    // 6) Absender, Empfaenger, Betreff, Text.
    const einladung = eingang.length ? await nachricht(eingang[0].ID) : {};
    check("6 Absender korrekt", einladung.From && einladung.From.Address === "noreply@helmut.test", JSON.stringify(einladung.From));
    check("6 Empfaenger korrekt", (einladung.To || []).length === 1 && einladung.To[0].Address === ADRESSE_BEKANNT, JSON.stringify(einladung.To));
    check("6 Betreff ist der Einladungsbetreff", einladung.Subject === "Dein Zugang zu Helmut steht bereit", einladung.Subject);
    check("6 Text traegt die Einladungsformulierung",
      /Zugang eingerichtet/.test(String(einladung.Text)) && /7 Tage gültig/.test(String(einladung.Text)));
    check("6 kein HTML-Teil", !String(einladung.HTML || "").trim());

    // 7) Gueltiger LOKALER Einladungslink.
    const tokenAusMail = tokenAusText(einladung.Text);
    check("7 Nachricht enthaelt einen lokalen Einladungslink",
      String(einladung.Text).includes(`http://127.0.0.1:${port}/passwort-setzen?token=`), String(einladung.Text).slice(-160));
    check("7 Token aus der Mail ist gueltig",
      parse((await req(port, "GET", `/api/auth/password-token?token=${encodeURIComponent(tokenAusMail)}`)).body).valid === true);
    check("7 Token aus der Mail == Token im Admin-Kopierlink",
      tokenAusMail === new URL(konto.inviteUrl).searchParams.get("token"));

    // 8) Neue Einladung entwertet das alte Token.
    const erneut = await req(port, "POST", `/api/admin/users/${encodeURIComponent(konto.id)}/invite`, { headers: adminWrite, body: {} });
    const erneutJson = parse(erneut.body);
    check("8 erneute Einladung -> 200, purpose invite", erneut.status === 200 && erneutJson.purpose === "invite", erneut.body.slice(0, 120));
    const nachErneut = await wartePostfach(ADRESSE_BEKANNT, 2);
    check("8 genau ZWEI Nachrichten insgesamt", (nachErneut.daten.messages || []).length === 2, `n=${(nachErneut.daten.messages || []).length}`);
    check("8 altes Token ist jetzt ungueltig",
      parse((await req(port, "GET", `/api/auth/password-token?token=${encodeURIComponent(tokenAusMail)}`)).body).valid === false);
    // Neueste Nachricht zuerst — daraus das gueltige Token ziehen und das Passwort setzen.
    const zweite = await nachricht((nachErneut.daten.messages || [])[0].ID);
    const neuesToken = tokenAusText(zweite.Text);
    const setzen = await req(port, "POST", "/api/auth/set-password", { body: { token: neuesToken, password: "eva-passwort-1" } });
    check("8 neues Token setzt das Passwort -> 200", setzen.status === 200, `status=${setzen.status}`);
    const evaCookie = String((setzen.headers["set-cookie"] || [""])[0]).split(";")[0];
    check("8 Sitzung nach dem Setzen aktiv",
      parse((await req(port, "GET", "/api/auth/session", { headers: { Cookie: evaCookie } })).body).authenticated === true);

    // 9/10) Anonymer Passwort-Reset fuer die bekannte Adresse -> genau EINE Reset-Nachricht.
    const bekannt = await req(port, "POST", "/api/auth/request-reset", {
      headers: { "x-forwarded-for": `10.0.0.1` }, body: { email: ADRESSE_BEKANNT } });
    check("9 anonymer Reset -> 200 generisch (keine Nutzererkennung)",
      bekannt.status === 200 && !/resetUrl/.test(bekannt.body), bekannt.body.slice(0, 140));
    const nachReset = await wartePostfach(ADRESSE_BEKANNT, 3);
    const alle = nachReset.daten.messages || [];
    check("10 genau EINE zusaetzliche (Reset-)Nachricht", alle.length === 3, `n=${alle.length}`);
    const resetNachricht = alle.length ? await nachricht(alle[0].ID) : {};
    check("10 Reset-Betreff ist klar unterscheidbar", resetNachricht.Subject === "Passwort zurücksetzen", resetNachricht.Subject);
    check("10 Reset-Text nennt die 1-Stunde-Gueltigkeit", /1 Stunde gültig/.test(String(resetNachricht.Text)));
    const resetToken = tokenAusText(resetNachricht.Text);

    // 11/12) Unbekannte reservierte Adresse: identische Antwort, KEINE Nachricht.
    const unbekannt = await req(port, "POST", "/api/auth/request-reset", {
      headers: { "x-forwarded-for": `10.0.0.2` }, body: { email: ADRESSE_UNBEKANNT } });
    check("11/12 identische HTTP-Antwort wie bei bekannter Adresse",
      unbekannt.status === bekannt.status && unbekannt.body === bekannt.body, `${unbekannt.status} ${unbekannt.body.slice(0, 140)}`);
    const postfachUnbekannt = await suche(ADRESSE_UNBEKANNT);
    check("11/12 unbekannte Adresse erzeugt KEINE Nachricht",
      (postfachUnbekannt.daten.messages || []).length === 0, `n=${(postfachUnbekannt.daten.messages || []).length}`);
    const nochmal = await suche(ADRESSE_BEKANNT);
    check("11/12 Postfach der bekannten Adresse unveraendert (3)",
      (nochmal.daten.messages || []).length === 3, `n=${(nochmal.daten.messages || []).length}`);

    // 13/14) Reset-Token einmalig + Sitzungsentzug.
    const resetSetzen = await req(port, "POST", "/api/auth/set-password", { body: { token: resetToken, password: "eva-neu-passwort-1" } });
    check("13 Reset-Token setzt das Passwort -> 200", resetSetzen.status === 200, `status=${resetSetzen.status}`);
    check("13 Reset-Token funktioniert nur EINMAL -> 410",
      (await req(port, "POST", "/api/auth/set-password", { body: { token: resetToken, password: "dritter-versuch-1" } })).status === 410);
    check("14 bestehende Sitzung ist nach dem Reset beendet",
      parse((await req(port, "GET", "/api/auth/session", { headers: { Cookie: evaCookie } })).body).authenticated === false);
    const altPw = await req(port, "POST", "/api/auth/login", { body: { email: ADRESSE_BEKANNT, password: "eva-passwort-1" } });
    const neuPw = await req(port, "POST", "/api/auth/login", { body: { email: ADRESSE_BEKANNT, password: "eva-neu-passwort-1" } });
    check("14 altes Passwort verworfen, neues gilt", altPw.status === 401 && neuPw.status === 200, `alt=${altPw.status} neu=${neuPw.status}`);

    // 15) Mailpit-Ausfall -> ehrlicher Versandstatus.
    process.env.HELMUT_MAILPIT_URL = "http://127.0.0.1:9";
    const ausfallAdresse = `helmut-smoke-ausfall-${LAUF}@example.org`;
    const beiAusfall = parse((await req(port, "POST", "/api/admin/users", { headers: adminWrite, body: {
      name: "Otto Ausfall", email: ausfallAdresse, role: "demo"
    } })).body);
    check("15 Mailpit-Ausfall -> ehrliches sent:false", beiAusfall.mail && beiAusfall.mail.sent === false, JSON.stringify(beiAusfall.mail));
    check("15 Mailpit-Ausfall -> Grund benannt, kein falsches Gruen",
      beiAusfall.mail && /^mailpit-/.test(String(beiAusfall.mail.reason)), JSON.stringify(beiAusfall.mail));
    check("15 Mailpit-Ausfall -> Kopierlink bleibt der Zustellweg",
      String(beiAusfall.inviteUrl || "").includes("/passwort-setzen?token="));
    process.env.HELMUT_MAILPIT_URL = MAILPIT_URL;
    const nachAusfall = await suche(ausfallAdresse);
    check("15 bei Ausfall wurde KEINE Nachricht zugestellt",
      (nachAusfall.daten.messages || []).length === 0, `n=${(nachAusfall.daten.messages || []).length}`);
  } finally {
    await new Promise((r) => server.close(r));
    // Aufraeumen: ausschliesslich die eigenen Laufadressen.
    try {
      await loescheEigene(ADRESSE_BEKANNT);
      await loescheEigene(ADRESSE_UNBEKANNT);
      await loescheEigene(`helmut-smoke-ausfall-${LAUF}@example.org`);
    } catch (_) { /* Mailpit ggf. beendet */ }
  }

  console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Mailpit-Smoke-Assertions`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });
