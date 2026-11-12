"use strict";

// Ausschliesslich eingespeiste Transporte und ein TLS-SMTP-Server auf Loopback.
// Keine Postfach-Zugangsdaten, kein externer Versand. Das Zertifikat entsteht temporaer.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const tls = require("node:tls");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const transport = require("../lib/helmut/mail-transport");
const invite = require("../lib/helmut/invite-mail");
const nodemailer = require("nodemailer");

const PASSWORT = "PLATZHALTER-kein-echtes-Postfachpasswort";
const ENV = Object.freeze({ HELMUT_MAIL_TRANSPORT: "smtp", HELMUT_SMTP_USER: "hallo@helmut.test",
  HELMUT_SMTP_PASSWORD: PASSWORT, HELMUT_MAIL_FROM: "Helmut <hallo@helmut.test>",
  HELMUT_MAIL_REPLY_TO: "hallo@helmut.test" });
const MAIL = Object.freeze({ from: ENV.HELMUT_MAIL_FROM, to: "eva@example.org", subject: "Ihre Einladung zu Helmut",
  text: "Text mit VORSCHAU-KEIN-ECHTER-TOKEN", html: "<p>Text mit VORSCHAU-KEIN-ECHTER-TOKEN</p>" });
let checks = 0;
function check(name, ok) { assert.ok(ok, name); checks++; console.log("PASS " + name); }
function fake(antwort = { accepted: [MAIL.to], rejected: [] }) {
  const seen = { starts: 0, sends: 0, closes: 0 };
  const createSmtpTransport = options => {
    seen.starts++; seen.options = options;
    return {
      async sendMail(mail) { seen.sends++; seen.mail = mail; return typeof antwort === "function" ? antwort(mail) : antwort; },
      close() { seen.closes++; }
    };
  };
  return { seen, createSmtpTransport };
}

function request(port, method, route, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? "" : JSON.stringify(body);
    const req = http.request({ host: "127.0.0.1", port, method, path: route,
      headers: { ...headers, "content-type": "application/json", "content-length": Buffer.byteLength(data) }, timeout: 20000 }, res => {
      let text = ""; res.on("data", chunk => { text += chunk; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(text), headers: res.headers }); }
        catch (error) { reject(error); }
      });
    });
    req.on("error", reject); req.on("timeout", () => req.destroy(new Error("Local HTTP timeout")));
    req.end(data);
  });
}

async function httpFlow(factory, messages) {
  const dir = path.resolve(__dirname, "../.helmut-data");
  const snapshots = new Map(fs.existsSync(dir) ? fs.readdirSync(dir).map(name => [name, fs.readFileSync(path.join(dir, name))]) : []);
  const env = { ...ENV, HELMUT_AUTH_MODE: "accounts", HELMUT_STORAGE_BACKEND: "local", HELMUT_STORE_CACHE_MS: "0" };
  const vorher = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  const originalFactory = nodemailer.createTransport;
  let server;
  try {
    Object.assign(process.env, env);
    nodemailer.createTransport = factory;
    require("../lib/helmut/reset-timing").bereiteLaufzeitVor({ VERCEL: "1" });
    const handler = require("../server"), accounts = require("../lib/helmut/accounts");
    server = http.createServer(handler); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port, start = messages.length;
    await accounts.createUser({ email: "smtp-flow-admin@example.org", name: "SMTP Admin", role: "admin", password: "lokales-Adminpasswort-123" });
    const admin = await request(port, "POST", "/api/auth/login", { email: "smtp-flow-admin@example.org", password: "lokales-Adminpasswort-123" });
    assert.equal(admin.status, 200);
    const cookie = admin.headers["set-cookie"][0].split(";")[0];
    const csrf = await request(port, "GET", "/api/security/csrf", undefined, { Cookie: cookie });
    const email = "smtp-flow-" + Date.now() + "@example.org";
    const created = await request(port, "POST", "/api/admin/users", { name: "Eva SMTP", email, role: "abgeordneter", party: "SPD" },
      { Cookie: cookie, "x-csrf-token": csrf.body.token });
    check("HTTP-Kontoanlage schickt genau eine Einladung ueber lokales TLS/SMTP", created.body.mail?.sent === true
      && created.body.mail.transport === "smtp" && messages.length === start + 1);
    const token = new URL(created.body.inviteUrl).searchParams.get("token");
    const password = "lokales-Kundenpasswort-123";
    const set = await request(port, "POST", "/api/auth/set-password", { token, password });
    check("Einladung fuehrt zum gespeicherten Passwort und einer Sitzung", set.status === 200 && !!set.headers["set-cookie"]);
    const login = await request(port, "POST", "/api/auth/login", { email, password });
    check("Spaetere Anmeldung mit E-Mail und Passwort funktioniert", login.status === 200 && !!login.headers["set-cookie"]);
    const customerCookie = login.headers["set-cookie"][0].split(";")[0];
    const reset = await request(port, "POST", "/api/auth/request-reset", { email }, { Cookie: customerCookie });
    check("HTTP-Passwort-Hilfe nutzt denselben SMTP-Weg", reset.status === 200 && messages.length === start + 2);
    const again = await request(port, "POST", "/api/auth/set-password", { token, password });
    check("Einmaliger Einladungslink bleibt nach Gebrauch ungueltig", again.status === 410);
    process.env.HELMUT_SMTP_PASSWORD = "falsches-Testpasswort";
    const anonymous = await request(port, "POST", "/api/auth/request-reset", { email });
    const customer = await accounts.getUserByEmailRaw(email);
    let receipt;
    for (let attempt = 0; attempt < 100; attempt++) {
      receipt = (await accounts.listAuditEvents()).find(e => e.action === "password.reset-requested" && e.userId === customer.id);
      if (receipt) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    check("Anonyme Hilfe bleibt generisch; internes Fehleraudit nennt nur den festen SMTP-Grund", anonymous.status === 200
      && receipt?.detail.endsWith("versand=nein · grund=smtp-anmeldung-abgelehnt")
      && !JSON.stringify(anonymous.body).includes("smtp-") && messages.length === start + 2);
    const slot = Symbol.for("@vercel/request-context");
    const vorherigerKontext = Object.getOwnPropertyDescriptor(globalThis, slot);
    const originalToken = accounts.createPasswordToken;
    const gehalten = [];
    let freigeben;
    const blockiert = new Promise(resolve => { freigeben = resolve; });
    try {
      process.env.HELMUT_SMTP_PASSWORD = PASSWORT;
      Object.defineProperty(globalThis, slot, { configurable: true, value: {
        get: () => ({ waitUntil: promise => gehalten.push(promise) })
      } });
      accounts.createPasswordToken = async (...args) => { await blockiert; return originalToken(...args); };
      const frueheAntwort = await request(port, "POST", "/api/auth/request-reset", { email });
      let abgeschlossen = false;
      gehalten[0]?.then(() => { abgeschlossen = true; });
      await Promise.resolve();
      check("Vercel haelt die echte Versandzusage ueber die fruehe generische HTTP-Antwort hinaus",
        frueheAntwort.status === 200 && frueheAntwort.body.ok === true
        && gehalten.length === 1 && typeof gehalten[0]?.then === "function"
        && !abgeschlossen && messages.length === start + 2);
      freigeben();
      await gehalten[0];
      const belegt = (await accounts.listAuditEvents()).find(e => e.action === "password.reset-requested" && e.userId === customer.id);
      check("Gehaltene Anfrage beendet Token, tatsaechliches lokales SMTP und Versandquittung",
        abgeschlossen && messages.length === start + 3 && belegt?.detail.endsWith("versand=ja"));
    } finally {
      freigeben();
      await require("../lib/helmut/reset-timing").offeneArbeit();
      accounts.createPasswordToken = originalToken;
      if (vorherigerKontext) Object.defineProperty(globalThis, slot, vorherigerKontext);
      else delete globalThis[slot];
    }
  } finally {
    nodemailer.createTransport = originalFactory;
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    for (const [key, value] of Object.entries(vorher)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (fs.existsSync(dir)) {
      for (const name of fs.readdirSync(dir)) if (!snapshots.has(name)) fs.unlinkSync(path.join(dir, name));
      for (const [name, value] of snapshots) fs.writeFileSync(path.join(dir, name), value);
    }
  }
}

async function smtpLoopback() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-smtp-tls-test-"));
  let server;
  const sockets = new Set(), messages = [], envelopes = [];
  let annahmeOffen = false;
  try {
    const certPath = path.join(dir, "cert.pem"), keyPath = path.join(dir, "key.pem");
    const certResult = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
      "-subj", "/CN=" + transport.SMTP_HOST, "-addext", "subjectAltName=DNS:" + transport.SMTP_HOST,
      "-keyout", keyPath, "-out", certPath], { stdio: "ignore", timeout: 10000 });
    assert.equal(certResult.status, 0, "Lokales TLS-Testzertifikat erzeugt");
    const cert = fs.readFileSync(certPath);
    server = tls.createServer({ cert, key: fs.readFileSync(keyPath), minVersion: "TLSv1.2" }, socket => {
      sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => {});
      let buffer = "", data = null, auth = false;
      socket.write("220 localhost SMTP test\r\n");
      socket.on("data", chunk => {
        buffer += chunk.toString("utf8");
        let end;
        while ((end = buffer.indexOf("\r\n")) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          if (data) {
            if (line === ".") { messages.push(data.join("\r\n")); data = null; if (!annahmeOffen) socket.write("250 queued\r\n"); }
            else data.push(line.startsWith("..") ? line.slice(1) : line);
            continue;
          }
          if (/^EHLO /i.test(line)) socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
          else if (/^AUTH PLAIN /i.test(line)) {
            const decoded = Buffer.from(line.slice(11), "base64").toString("utf8");
            auth = decoded === "\0" + ENV.HELMUT_SMTP_USER + "\0" + PASSWORT;
            socket.write(auth ? "235 authenticated\r\n" : "535 denied\r\n");
          } else if (/^(MAIL FROM|RCPT TO):/i.test(line)) {
            if (auth) { envelopes.push(line); socket.write("250 ok\r\n"); }
            else socket.write("530 authenticate first\r\n");
          } else if (line === "DATA" && auth) { data = []; socket.write("354 send data\r\n"); }
          else if (line === "QUIT") socket.end("221 bye\r\n");
          else if (/^(RSET|NOOP)/.test(line)) socket.write("250 ok\r\n");
          else socket.write("500 unsupported\r\n");
        }
      });
    });
    server.on("tlsClientError", () => {});
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const nativeFactory = nodemailer.createTransport.bind(nodemailer);
    const factory = options => nativeFactory({
      ...options,
      // Nur der Test ersetzt den Socket durch Loopback. TLS-Zertifikats- und Namenspruefung
      // bleiben aktiv. Die Produktionsoptionen werden vorher unabhaengig geprueft.
      getSocket(_options, done) {
        const socket = tls.connect({ host: "127.0.0.1", port: server.address().port,
          servername: transport.SMTP_HOST, ca: cert, rejectUnauthorized: true });
        let finished = false;
        const finish = error => { if (finished) return; finished = true;
          done(error, error ? undefined : { connection: socket, secured: true }); };
        socket.once("secureConnect", () => finish(null)); socket.once("error", finish);
      }
    });
    const vorher = process.env.HELMUT_MAIL_FROM;
    process.env.HELMUT_MAIL_FROM = ENV.HELMUT_MAIL_FROM;
    try {
      for (const [purpose, build] of [["invite", invite.buildInviteMail], ["reset", invite.buildResetMail]]) {
        const url = "https://app.example.invalid/passwort-setzen?token=VORSCHAU-" + purpose;
        const mail = build({ name: "Eva Beispiel", inviteUrl: url, resetUrl: url });
        const status = await invite.sendAccessMail({ ...mail, to: MAIL.to }, { env: ENV, createSmtpTransport: factory });
        check("Lokales TLS/SMTP: " + purpose + " durch bestehenden Zugangsmail-Aufruf angenommen", status.sent === true);
        const raw = messages.at(-1);
        check("Lokales TLS/SMTP: " + purpose + " enthaelt HTML UND Text", /multipart\/alternative/.test(raw)
          && /Content-Type: text\/plain/.test(raw) && /Content-Type: text\/html/.test(raw));
        check("Lokales TLS/SMTP: " + purpose + " hat genau den vorbereiteten Zugang", raw.includes("VORSCHAU-" + purpose));
      }
      check("Lokales TLS/SMTP: genau zwei Nachrichten, kein weiterer Empfaenger", messages.length === 2
        && envelopes.filter(x => /^RCPT TO:/i.test(x)).length === 2
        && envelopes.filter(x => /^RCPT TO:/i.test(x)).every(x => x.includes(MAIL.to)));
      const denied = await transport.sendeMail(MAIL, { env: { ...ENV, HELMUT_SMTP_PASSWORD: "falsches-Testpasswort" }, createSmtpTransport: factory });
      check("Lokales TLS/SMTP: falsches Passwort sendet keine weitere Nachricht", denied.reason === transport.GRUND.SMTP_ANMELDUNG && messages.length === 2);
      await httpFlow(factory, messages);
      annahmeOffen = true;
      const offen = await transport.sendeMail(MAIL, { env: ENV, createSmtpTransport: factory, timeoutMs: 150 });
      await new Promise(resolve => setTimeout(resolve, 20));
      check("Echter TLS-Zeitabbruch schliesst die Verbindung ohne falsche Annahme", !offen.sent
        && offen.reason === transport.GRUND.SMTP_ZEITABBRUCH && sockets.size === 0);
    } finally {
      if (vorher === undefined) delete process.env.HELMUT_MAIL_FROM;
      else process.env.HELMUT_MAIL_FROM = vorher;
    }
  } finally {
    for (const socket of sockets) socket.destroy();
    if (server && server.listening) await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

(async () => {
  const ohneSdk = [
    'const assert = require("node:assert/strict");',
    'const Module = require("node:module"), original = Module._load; let versuche = 0;',
    'Module._load = function(name, ...args) { if (name === "@vercel/functions") { versuche++; throw Object.assign(new Error("Plattformpaket fehlt im isolierten Node-Server"), {code:"MODULE_NOT_FOUND"}); } return original.call(this, name, ...args); };',
    '(async () => { const t = require("./lib/helmut/reset-timing"); await t.starteHintergrundarbeit(() => Promise.resolve()); await t.offeneArbeit(); assert.equal(versuche, 0); console.log("standalone-without-sdk-ok"); })().catch(() => { process.exitCode = 1; });'
  ].join("\n");
  const lokal = spawnSync(process.execPath, [path.join(__dirname, "lokal.js"), "--", process.execPath, "-e", ohneSdk],
    { cwd: path.resolve(__dirname, ".."), env: { ...process.env, VERCEL: "" }, encoding: "utf8", timeout: 10000 });
  check("Normaler isolierter Node-Server startet und beendet Hintergrundarbeit ohne Vercel-Paket",
    lokal.status === 0 && lokal.stdout.includes("standalone-without-sdk-ok"));
  const cfg = transport.transportKonfiguration(ENV);
  check("SMTP nur nach ausdruecklicher Auswahl und mit vollstaendigen Zugangsdaten", cfg.aktiv && cfg.transport === "smtp");
  check("Konfigurationsstatus enthaelt kein Passwort", !JSON.stringify(cfg).includes(PASSWORT));
  for (const change of [
    { HELMUT_MAIL_TRANSPORT: "" }, { HELMUT_MAIL_TRANSPORT: "smtpx" }, { HELMUT_SMTP_USER: "" },
    { HELMUT_SMTP_USER: "a\r\nb@example.org" }, { HELMUT_SMTP_PASSWORD: "" }, { HELMUT_SMTP_PASSWORD: "x\ny" },
    { HELMUT_MAIL_FROM: "anderes@example.org" }, { HELMUT_MAIL_REPLY_TO: "x\r\ny@example.org" }
  ]) {
    const f = fake(), status = await transport.sendeMail(MAIL, { env: { ...ENV, ...change }, createSmtpTransport: f.createSmtpTransport });
    check("Unvollstaendige oder ungueltige Konfiguration oeffnet keine Verbindung: " + Object.keys(change)[0], !status.sent && f.seen.starts === 0);
  }
  for (const send of [transport.sendeMail, transport.sendeSmtp]) {
    for (const context of [{ env: { ...ENV, HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt" } }, { env: ENV, kennung: "test-mdb-smtp" }]) {
      const f = fake(), status = await send(MAIL, { ...context, createSmtpTransport: f.createSmtpTransport });
      check("Kommunikationsriegel gilt auch am direkten SMTP-Netzzugang", status.gesperrt && f.seen.starts === 0);
    }
  }
  {
    const env = { ...ENV, HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", HELMUT_ZUGANGSMAILS_FREIGEGEBEN: "1" };
    const f = fake();
    const status = await invite.sendAccessMail(MAIL, { env, createSmtpTransport: f.createSmtpTransport });
    check("Explizite Freigabe erlaubt Zugangsmails fuer echte Empfaenger", status.sent && f.seen.sends === 1);
    for (const kanal of ["mail", "push", "whatsapp", "monitoring-webhook", "job-transport"]) {
      const r = transport.kommunikationsriegel.pruefe({ kanal, empfaenger: MAIL.to, ziel: "https://ops.example.org" }, env);
      check("Zugangsfreigabe laesst andere Kanaele gesperrt: " + kanal, !r.erlaubt);
    }
    const f2 = fake(), blocked = await invite.sendAccessMail(MAIL, { env, kennung: "test-mdb-smtp", createSmtpTransport: f2.createSmtpTransport });
    check("Auch freigegebene Zugangsmails sperren synthetische Kennungen", blocked.gesperrt && f2.seen.starts === 0);
    check("Globale Kommunikationsstellung wird nicht veraendert", env.HELMUT_TESTLAUF_KOMMUNIKATION === "gesperrt");
    const kaputt = { ...env };
    Object.defineProperty(kaputt, "HELMUT_ZUGANGSMAILS_FREIGEGEBEN", { get() { throw new Error("ungueltiger Kontext"); } });
    check("Fehler beim Lesen der Teilfreigabe bleiben geschlossen", !transport.kommunikationsriegel.pruefe({ kanal: "einladung", empfaenger: MAIL.to }, kaputt).erlaubt);
    for (const value of ["0", "true", "1 "]) {
      const x = fake(), denied = await invite.sendAccessMail(MAIL, { env: { ...env, HELMUT_ZUGANGSMAILS_FREIGEGEBEN: value }, createSmtpTransport: x.createSmtpTransport });
      check("Zugangsmail-Freigabe verlangt exakt1: " + JSON.stringify(value), denied.gesperrt && x.seen.starts === 0);
    }
  }
  {
    const f = fake(), status = await transport.sendeSmtp(MAIL, { env: { ...ENV, HELMUT_MAIL_TRANSPORT: "" },
      konfiguration: { aktiv: true, transport: "smtp" }, createSmtpTransport: f.createSmtpTransport });
    check("Vorgetaeuschter Status umgeht die echte Transportauswahl nicht", !status.sent && f.seen.starts === 0);
  }
  for (const bad of [{ to: "a@example.org,b@example.org" }, { to: "x\r\ny@example.org" },
    { from: "Fremd <fremd@example.org>" }, { subject: "Einladung\r\nBcc: fremd@example.org" }]) {
    const f = fake(), status = await transport.sendeMail({ ...MAIL, ...bad }, { env: ENV, createSmtpTransport: f.createSmtpTransport });
    check("Ungueltige Kopfzeile/Adresse oeffnet keine Verbindung", !status.sent && f.seen.starts === 0);
  }
  {
    const f = fake(), status = await transport.sendeMail({ ...MAIL, bcc: "fremd@example.org", attachments: [{ path: "/etc/passwd" }] },
      { env: ENV, konfiguration: { aktiv: true, transport: "smtp", host: "evil.example", port: 25, secure: false }, createSmtpTransport: f.createSmtpTransport });
    const o = f.seen.options, m = f.seen.mail;
    check("Erfolg erst nach expliziter SMTP-Annahme des richtigen Empfaengers", status.sent && f.seen.sends === 1 && f.seen.closes === 1);
    check("Ziel, Port und TLS sind fest gebunden", o.host === "server44.configcenter.info" && o.port === 465 && o.secure === true
      && o.tls.servername === o.host && o.tls.rejectUnauthorized === true && o.tls.minVersion === "TLSv1.2");
    check("Passwort wird unveraendert nur dem SMTP-Client uebergeben", o.auth.pass === PASSWORT && o.auth.user === ENV.HELMUT_SMTP_USER);
    check("Keine Protokollierung, keine Dateipfade oder URL-Anhaenge", o.logger === false && o.debug === false && o.disableFileAccess && o.disableUrlAccess);
    check("HTML, Text, Absender und Antwortadresse werden uebernommen", m.html === MAIL.html && m.text === MAIL.text && m.from === MAIL.from && m.replyTo === ENV.HELMUT_MAIL_REPLY_TO);
    check("Ein Empfaenger im SMTP-Umschlag, keine fremden Mailoptionen", m.envelope.to.length === 1 && m.envelope.to[0] === MAIL.to && !m.bcc && !m.attachments);
    check("Rückgabe enthaelt keine Adresse, Zugangsdaten oder Tokens", !JSON.stringify(status).includes(MAIL.to) && !JSON.stringify(status).includes(PASSWORT) && !JSON.stringify(status).includes("VORSCHAU"));
  }
  for (const answer of [null, {}, { accepted: [], rejected: [MAIL.to] }, { accepted: ["fremd@example.org"], rejected: [] }]) {
    const f = fake(answer), status = await transport.sendeMail(MAIL, { env: ENV, createSmtpTransport: f.createSmtpTransport });
    check("Fehlende oder falsche Annahme wird nicht als Erfolg gemeldet", !status.sent && f.seen.closes === 1);
  }
  for (const code of ["EAUTH", "ETIMEDOUT", "EENVELOPE", "ECONNREFUSED", "CERT_HAS_EXPIRED"]) {
    const f = fake(() => { throw Object.assign(new Error(PASSWORT + MAIL.to + MAIL.text), { code }); });
    const status = await transport.sendeMail(MAIL, { env: ENV, createSmtpTransport: f.createSmtpTransport });
    check("Bereinigter Fehler ohne Wiederholung oder Nutzdaten: " + code, !status.sent && f.seen.sends === 1 && f.seen.closes === 1
      && !JSON.stringify(status).includes(PASSWORT) && !JSON.stringify(status).includes(MAIL.to) && !JSON.stringify(status).includes("VORSCHAU"));
  }
  {
    const f = fake(() => new Promise(() => {}));
    const status = await transport.sendeMail(MAIL, { env: ENV, createSmtpTransport: f.createSmtpTransport, timeoutMs: 15 });
    check("Gesamtfrist bricht den Client ab und schliesst ihn", status.reason === transport.GRUND.SMTP_ZEITABBRUCH && f.seen.mail.signal.aborted && f.seen.closes === 1);
  }
  await smtpLoopback();
  console.log(`\nALLE GRÜN — ${checks}/${checks} SMTP-Pruefungen`);
})().catch(error => { console.error(error); process.exitCode = 1; });
