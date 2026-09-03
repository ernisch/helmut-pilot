"use strict";

// Helmut — VERHALTENSTEST: die INAKTIVE Provisionierung einer Stufe erzeugt
// keine Last, keinen Modellaufruf und keine externe Kommunikation.
// =============================================================================
// WARUM DIESE SUITE. Der stufenweise Ablaufplan sagt: die acht Betreiberwerte
// und HELMUT_TESTLAUF_VORRANG_REAL müssen NICHT vor der inaktiven
// Provisionierung gesetzt sein — erst vor der ersten Aktivierung. Dieser Satz
// stützt sich bisher auf Kommentare („inaktive Profile erzeugen keine Last").
// Ein Kommentar ist kein Beleg. Hier wird die Aussage am VERHALTEN geprüft:
//
//   1. Der echte Provisionierer (`provisioning.provisionTenant`, neuAktiv:false)
//      läuft über den echten Vorwärtsausführer für die 20 Kennungen der Stufe A
//      gegen einen Arbeitsspeicher-Store — mit allen Riegeln erfüllt, also
//      SCHARF. Dabei werden Netz (fetch/http/https/net/tls/dns), Kindprozesse,
//      der Kommunikationsriegel und jede Funktion des KI-Moduls mitgezählt.
//      Erwartung: 0 · 0 · 0 · 0.
//   2. Jedes angelegte Profil ist `profileActive:false`, jedes Konto gesperrt,
//      und das Prädikat des Arbeitsplaners (`isDisabled`) hält sie für
//      deaktiviert.
//   3. Der echte Planer (`scalable-pipeline.planeArbeit`) plant für die 20
//      inaktiven Profile 0 Aufträge und ruft `enqueue` nie — und derselbe
//      Planer plant sehr wohl, sobald ein Profil aktiv ist (Gegenprobe, damit
//      die 0 keine Attrappen-0 ist).
//   4. Die stufenbewusste Isolationsprüfung bestätigt den Zustand rein lesend.
//
// BEFUND DIESER SUITE (03.09., erstmals am ECHTEN Pfad gemessen): Die
// Bundestagsreife-Sperre (`profile-readiness.pruefeNeuaktivierung`, Schritt 2b in
// `provisionTenant`) weist JEDES Bundestagsprofil der Kohorte ab, weil die
// Spezifikation bewusst synthetische Ausschüsse („Testausschuss N") trägt, die
// Sperre aber Ausschüsse der WP-21-Sollmenge verlangt. In Stufe A sind das 18
// von 20 (die zwei Landtagsprofile passieren). Alle bisherigen Suiten prüften den
// scharfen Pfad mit einer Attrappe für `legeAn` — der Befund blieb unsichtbar.
// Abschnitt A0 PINNT diesen Zustand als dokumentierten Blocker (Sicherheitsrahmen
// §34); wird die Kohorte oder die Regel geändert, kippt A0 und die Doku muss
// mitziehen. Die Lasteigenschaft (Abschnitte A–E) wird mit einer NUR IM TEST
// ausgesetzten Reifesperre für alle 20 belegt — die Eigenschaft „inaktiv = keine
// Last" hängt nicht an der Reifesperre, und die 18 abgewiesenen Profile haben
// ohnehin keinen einzigen Schreibvorgang ausgelöst.
//
// Kein Netz, keine Datenbank, keine Datei, kein Modellaufruf.

const path = require("path");
const http = require("http");
const https = require("https");
const net = require("net");
const tls = require("tls");
const dns = require("dns");
const kindprozess = require("child_process");

const ROOT = path.join(__dirname, "..");
let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

// ── 0 · Zähler VOR dem Laden der Fachmodule installieren ────────────────────
const zaehler = { fetch: 0, http: 0, https: 0, net: 0, tls: 0, dns: 0, kindprozess: 0, riegel: 0, ki: 0 };
function sperre(name) {
  return function gesperrt() {
    zaehler[name] += 1;
    throw new Error(`[INAKTIV-TEST] ${name} wurde aufgerufen — die inaktive Provisionierung darf das nicht`);
  };
}
globalThis.fetch = sperre("fetch");
http.request = sperre("http"); http.get = sperre("http");
https.request = sperre("https"); https.get = sperre("https");
net.connect = sperre("net"); net.createConnection = sperre("net");
net.Socket.prototype.connect = sperre("net");
tls.connect = sperre("tls");
dns.lookup = sperre("dns"); dns.resolve = sperre("dns"); dns.resolve4 = sperre("dns");
if (dns.promises) { dns.promises.lookup = sperre("dns"); dns.promises.resolve = sperre("dns"); }
for (const fn of ["spawn", "exec", "execFile", "spawnSync", "execSync", "execFileSync", "fork"]) {
  kindprozess[fn] = sperre("kindprozess");
}

const riegel = require("../lib/helmut/kommunikationsriegel");
const riegelOriginal = riegel.pruefe;
riegel.pruefe = function gezaehlt(...args) { zaehler.riegel += 1; return riegelOriginal.apply(this, args); };

const ki = require("../lib/helmut/ai");
for (const name of Object.keys(ki)) {
  if (typeof ki[name] === "function") ki[name] = sperre("ki");
}

const V = require("../lib/helmut/testkohorte-vorwaerts");
const K = require("../lib/helmut/testkohorte-betrieb");
const S = require("../lib/helmut/testkohorte-stufen");
const provisioning = require("../lib/helmut/provisioning");
const { isDisabled } = require("../lib/helmut/profile-validation");
const SP = require("../lib/helmut/scalable-pipeline");

// ── Arbeitsspeicher-Store und -Konten (kein Dateizugriff) ───────────────────
function baueSpeicher() {
  const profile = new Map();
  const nutzer = [];
  let profilSchreibvorgaenge = 0;
  const normalize = (e) => String(e || "").trim().toLowerCase();
  const slug = (v) => String(v || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const storage = {
    getProfile: async (id) => (profile.has(id) ? { ...profile.get(id) } : null),
    saveProfile: async (p) => { profilSchreibvorgaenge += 1; profile.set(p.id, { ...p }); return { ...p }; }
  };
  const accounts = {
    normalizeEmail: normalize,
    listUsers: async () => nutzer.map((u) => ({ ...u })),
    createUser: async ({ email, name, role, password, politicianId, active = true }) => {
      const u = {
        id: `user-${nutzer.length + 1}`, email: normalize(email), name, role,
        politicianId: slug(politicianId), active: active !== false,
        status: password ? "aktiv" : "eingeladen"
      };
      nutzer.push(u);
      return { ...u };
    },
    updateUser: async (id, patch) => { const u = nutzer.find((x) => x.id === id); Object.assign(u, patch); return { ...u }; },
    deleteUser: async (id) => { const i = nutzer.findIndex((x) => x.id === id); if (i >= 0) nutzer.splice(i, 1); }
  };
  return { profile, nutzer, storage, accounts, schreibvorgaenge: () => profilSchreibvorgaenge };
}

const FENSTER = Object.freeze({
  startErlaubt: true, konflikte: [], gepruefteCrons: 13,
  startMinuteUtc: 21 * 60 + 36, endeMinuteUtc: 24 * 60 + 3 * 60 + 59
});
const JETZT_DRIN = "2026-09-10T23:00:00Z";

async function main() {
  console.log("Helmut — Verhaltenstest: inaktive Provisionierung erzeugt keine Last, keinen Modellaufruf, keine Außenkommunikation\n");

  const FREIGABE_A = { [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: S.STUFEN_FREIGABEWORTE.a.provisionierung };
  const laufStufeA = (sp, extraDeps = {}) => V.fuehreProvisionierungAus({
    stufe: "a",
    modus: V.MODUS_SCHARF,
    env: FREIGABE_A,
    startfensterBefund: FENSTER,
    jetztUtc: JETZT_DRIN,
    deps: {
      legeAn: (spec) => provisioning.provisionTenant(
        spec, { storage: sp.storage, accounts: sp.accounts, ...extraDeps }, { neuAktiv: false }
      ),
      leseZustand: async (id) => {
        const p = sp.profile.get(id);
        return { vorhanden: Boolean(p), aktiv: Boolean(p && p.profileActive === true) };
      },
      zufall: () => "laufzeit-passwort-nur-im-test-1234"
    }
  });

  // ── A0 · Der ECHTE Pfad, unverändert: die Bundestagsreife-Sperre greift ───
  console.log("A0 · BEFUND — der echte Provisionierer weist die Bundestagsprofile der Kohorte ab");
  const echt = baueSpeicher();
  const echtErgebnis = await laufStufeA(echt);
  const abgewiesen = echtErgebnis.ergebnisse.filter((e) => e.zustand !== "angelegt-inaktiv");
  check("A0.1 BLOCKER (dokumentiert, §34): 18 von 20 werden mit bundestagsprofil-nicht-bereit abgewiesen, nur die 2 Landtagsprofile entstehen",
    echtErgebnis.modus === V.MODUS_SCHARF && echtErgebnis.angelegt === 2 && echtErgebnis.fehlgeschlagen === 18
      && echtErgebnis.ok === false
      && abgewiesen.length === 18
      && abgewiesen.every((e) => e.schreibfehler === "bundestagsprofil-nicht-bereit"),
    `angelegt=${echtErgebnis.angelegt} fehlgeschlagen=${echtErgebnis.fehlgeschlagen} `
      + `gründe=${[...new Set(abgewiesen.map((e) => e.schreibfehler))].join(",")}`);
  check("A0.2 Die Abweisung geschieht VOR jedem Schreibvorgang: genau 2 Profile, 2 Konten, 2 Schreibvorgänge",
    echt.profile.size === 2 && echt.nutzer.length === 2 && echt.schreibvorgaenge() === 2);
  check("A0.3 Der Grund ist die Ausschussregel der WP-21-Sollmenge, nicht ein Netz- oder Speicherfehler",
    (() => {
      const spec = require("../lib/helmut/test-kohorte-500").baueKohorte()[0];
      const reife = require("../lib/helmut/profile-readiness");
      const profil = provisioning.buildProfile({ ...spec, password: "laufzeit-passwort-nur-im-test-1234" }, { aktiv: false });
      const r = reife.pruefeNeuaktivierung({ ...profil, profileActive: true });
      return r.zutreffend === true && r.zulaessig === false
        && r.fehler.every((f) => /Testausschuss/.test(f) && /Sollmenge/.test(f));
    })());
  check("A0.4 Auch der abgewiesene Lauf hat kein Netz, keinen Riegel und kein KI-Modul berührt",
    zaehler.fetch === 0 && zaehler.http === 0 && zaehler.https === 0 && zaehler.riegel === 0 && zaehler.ki === 0);

  // ── A · Scharfer Lauf der Stufe A mit dem ECHTEN Provisionierer ───────────
  // Die Reifesperre wird HIER — und nur hier — ausgesetzt. Geprüft wird die
  // Lasteigenschaft der inaktiven Anlage für alle 20, nicht die Sperre.
  console.log("\nA · Stufe A (20) scharf gegen den Arbeitsspeicher — echter provisionTenant, Reifesperre im Test ausgesetzt");
  const sp = baueSpeicher();
  const ergebnis = await laufStufeA(sp, {
    readiness: { pruefeNeuaktivierung: () => ({ zutreffend: false, zulaessig: true, fehler: [] }) }
  });
  check("A1 Der Lauf war SCHARF und vollständig: 20 angelegt, 0 fehlgeschlagen, ok",
    ergebnis.modus === V.MODUS_SCHARF && ergebnis.angelegt === 20 && ergebnis.fehlgeschlagen === 0 && ergebnis.ok === true,
    `modus=${ergebnis.modus} angelegt=${ergebnis.angelegt} fehlgeschlagen=${ergebnis.fehlgeschlagen}`
      + (ergebnis.fehlgeschlagen ? ` · ${ergebnis.ergebnisse.filter((e) => e.zustand !== "angelegt-inaktiv").slice(0, 2).map((e) => `${e.id}:${e.zustand}:${e.schreibfehler}`).join(" ")}` : ""));
  check("A2 Genau die 20 Kennungen der Stufe A liegen im Store — keine andere",
    sp.profile.size === 20 && [...sp.profile.keys()].every((id) => S.stufeVonKennung(id) === "a"));
  check("A3 Jedes Profil ist INAKTIV (profileActive === false)",
    [...sp.profile.values()].every((p) => p.profileActive === false));
  check("A4 Jedes Konto ist GESPERRT (active === false) — kein Login, keine Einladungs-/Reset-Mail möglich",
    sp.nutzer.length === 20 && sp.nutzer.every((u) => u.active === false && u.politicianId && S.stufeVonKennung(u.politicianId) === "a"));
  check("A5 Der Arbeitsplaner hält jedes dieser Profile für DEAKTIVIERT (dasselbe Prädikat wie planeArbeit)",
    [...sp.profile.values()].every((p) => isDisabled(p) === true));
  check("A6 Es gab genau 20 Profil-Schreibvorgänge — einer je Kennung, sonst nichts",
    sp.schreibvorgaenge() === 20);

  // ── B · Was NICHT passiert ist ────────────────────────────────────────────
  console.log("\nB · Kein Netz, kein Kindprozess, kein Außenkanal, kein Modellaufruf");
  check("B1 0 fetch-Aufrufe", zaehler.fetch === 0, String(zaehler.fetch));
  check("B2 0 http/https-Anfragen", zaehler.http === 0 && zaehler.https === 0, `${zaehler.http}/${zaehler.https}`);
  check("B3 0 rohe Socket-/TLS-Verbindungen", zaehler.net === 0 && zaehler.tls === 0, `${zaehler.net}/${zaehler.tls}`);
  check("B4 0 DNS-Auflösungen", zaehler.dns === 0, String(zaehler.dns));
  check("B5 0 Kindprozesse", zaehler.kindprozess === 0, String(zaehler.kindprozess));
  check("B6 Der Kommunikationsriegel wurde 0-mal gefragt — kein Außenkanal hat auch nur angeklopft",
    zaehler.riegel === 0, String(zaehler.riegel));
  check("B7 Keine Funktion des KI-Moduls wurde aufgerufen (0 Modellaufrufe)", zaehler.ki === 0, String(zaehler.ki));
  check("B8 Die Außenkanalmodule wurden nicht einmal GELADEN",
    ["mail-transport.js", "job-dispatch.js", "lambda-verbraucher.js", "monitoring-webhook.js", "push-notifications.js"]
      .every((m) => !Object.keys(require.cache).some((k) => k.endsWith(`${path.sep}lib${path.sep}helmut${path.sep}${m}`))),
    Object.keys(require.cache).filter((k) => /mail-transport|job-dispatch|lambda-verbraucher|monitoring-webhook/.test(k)).map((k) => path.basename(k)).join(",") || "keines geladen");

  // ── C · Der echte Planer plant für inaktive Profile NICHTS ────────────────
  console.log("\nC · Der Arbeitsplaner erzeugt für die 20 inaktiven Profile keinen einzigen Auftrag");
  const eingereiht = [];
  const planerDeps = {
    listFullProfiles: async () => [...sp.profile.values()].map((p) => ({ ...p })),
    enqueue: async (auftrag) => { eingereiht.push(auftrag); return { neu: true }; },
    quellenFuerProfil: () => []
  };
  const env = { HELMUT_SCALABLE_PIPELINE: "on" };
  const plan = await SP.planeArbeit({ deps: planerDeps, env, jetztMs: Date.parse(JETZT_DRIN) });
  check("C1 planeArbeit sieht 0 aktive Profile und plant 0 Aufträge",
    plan.uebersprungen === false && plan.profile === 0 && plan.geplant === 0,
    `profile=${plan.profile} geplant=${plan.geplant}`);
  check("C2 enqueue wurde nie aufgerufen — keine Zeile in der Warteschlange", eingereiht.length === 0);
  check("C3 Auch danach: 0 Netz, 0 Modellaufrufe, 0 Riegelanfragen",
    zaehler.fetch === 0 && zaehler.http === 0 && zaehler.https === 0 && zaehler.ki === 0 && zaehler.riegel === 0);
  // GEGENPROBE: dieselben Profile, eines aktiv — jetzt MUSS geplant werden.
  // Sonst wäre die 0 oben keine Aussage über Inaktivität, sondern über die Attrappe.
  const aktivKopie = [...sp.profile.values()].map((p, i) => (i === 0 ? { ...p, profileActive: true } : { ...p }));
  const eingereihtAktiv = [];
  const planAktiv = await SP.planeArbeit({
    deps: { ...planerDeps, listFullProfiles: async () => aktivKopie, enqueue: async (a) => { eingereihtAktiv.push(a); return { neu: true }; } },
    env, jetztMs: Date.parse(JETZT_DRIN)
  });
  check("C4 GEGENPROBE: ein einziges AKTIVES Profil erzeugt sofort Aufträge (die 0 oben ist echt)",
    planAktiv.profile === 1 && planAktiv.geplant > 0 && eingereihtAktiv.length > 0,
    `profile=${planAktiv.profile} geplant=${planAktiv.geplant}`);
  check("C5 Auch die Gegenprobe braucht kein Netz und keinen Modellaufruf (Planen ist modellfrei)",
    zaehler.fetch === 0 && zaehler.http === 0 && zaehler.https === 0 && zaehler.ki === 0);

  // ── D · Die stufenbewusste Isolationsprüfung bestätigt den Zustand ────────
  console.log("\nD · Die rein lesende Isolationsprüfung ist stufenbewusst");
  const grundlinie = Object.freeze({
    erhobenUtc: "2026-09-10T20:00:00.000Z",
    mandateGesamt: 9, mandateAktiv: 5, mandateInaktiv: 4, mandateGeloescht: 0,
    identitaetsprofile: 10, kohortenProfile: 0, kohortenProfileAktiv: 0, kohortenProfileGeloescht: 0
  });
  const bestandAus = (zeilen, extra = {}) => ({
    erhobenUtc: "2026-09-10T23:30:00.000Z",
    identitaetenGesamt: 10 + zeilen.length, kohortenIdentitaeten: zeilen.length, kohortenKontenAktiv: 0,
    fremdeGesamt: 9, fremdeAktiv: 5, fremdeGeloescht: 0,
    kohorte: zeilen,
    ...extra
  });
  const zeilenA = [...sp.profile.values()].map((p) => ({ id: p.id, aktiv: p.profileActive === true, email: sp.nutzer.find((u) => u.politicianId === p.id).email }));
  const isoA = K.pruefeIsolation({ grundlinie, bestand: bestandAus(zeilenA), stufe: "a" });
  check("D1 Stufe A: 20 gelesene, inaktive Zeilen → isoliert", isoA.isoliert === true && isoA.stufe === "a"
    && isoA.stufenBefund.gelesenDieserStufe === 20 && isoA.stufenBefund.aktivDieserStufe === 0,
  isoA.offen.join("; ") || "alle Prüfungen bestanden");
  check("D2 OHNE Stufe verlangt der Beleg weiterhin alle 495 (Bestandsverhalten unverändert)",
    (() => { const r = K.pruefeIsolation({ grundlinie, bestand: bestandAus(zeilenA) }); return r.isoliert === false && r.offen.includes("Vollständige Kohorte gelesen") && r.stufe === null; })());
  check("D3 Eine AKTIVE Zeile in der frischen Stufe bricht den Beleg",
    (() => {
      const r = K.pruefeIsolation({ grundlinie, bestand: bestandAus(zeilenA.map((z, i) => (i === 3 ? { ...z, aktiv: true } : z))), stufe: "a" });
      return r.isoliert === false && r.offen.some((n) => /INAKTIV angelegt/.test(n));
    })());
  check("D4 Ein aktives Kohortenkonto bricht den Beleg",
    K.pruefeIsolation({ grundlinie, bestand: bestandAus(zeilenA, { kohortenKontenAktiv: 1 }), stufe: "a" }).offen.includes("Kein Kohortenkonto aktiv"));
  check("D5 Eine vorzeitig angelegte Zeile der Stufe B bricht den Beleg der Stufe A",
    (() => {
      const r = K.pruefeIsolation({ grundlinie, bestand: bestandAus([...zeilenA, { id: "test-kohorte-b-001", aktiv: false, email: "test-kohorte-b-001@test-kohorte.invalid" }]), stufe: "a" });
      return r.isoliert === false && r.offen.some((n) => /bis Stufe A vollständig gelesen/.test(n));
    })());
  check("D6 Eine fehlende Zeile der Stufe A bricht den Beleg",
    K.pruefeIsolation({ grundlinie, bestand: bestandAus(zeilenA.slice(1)), stufe: "a" }).isoliert === false);
  check("D7 Stufe B: A darf schon aktiv sein, B muss vollständig und inaktiv sein",
    (() => {
      const zeilenB = S.kennungenDerStufe("b").map((id) => ({ id, aktiv: false, email: `${id}@test-kohorte.invalid` }));
      const aAktiv = zeilenA.map((z) => ({ ...z, aktiv: true }));
      const gut = K.pruefeIsolation({ grundlinie, bestand: bestandAus([...aAktiv, ...zeilenB]), stufe: "b" });
      const ohneA = K.pruefeIsolation({ grundlinie, bestand: bestandAus(zeilenB), stufe: "b" });
      return gut.isoliert === true && ohneA.isoliert === false;
    })());
  check("D8 Eine unbekannte Stufe wirft (grund: stufe)",
    (() => { try { K.pruefeIsolation({ grundlinie, bestand: bestandAus(zeilenA), stufe: "z" }); return false; } catch (e) { return e && e.grund === "stufe"; } })());

  // ── E · Was diese Suite NICHT behauptet ───────────────────────────────────
  console.log("\nE · Grenze dieser Suite, ehrlich");
  check("E1 Die Aktivierung ist hier NICHT gelaufen — sie ist der Schritt, ab dem Last entsteht",
    [...sp.profile.values()].every((p) => p.profileActive === false) && eingereiht.length === 0);
  check("E2 Kein realer Mandats-Slug in dieser Suite",
    !/m5-[0-9a-f]{8}/.test(require("fs").readFileSync(path.join(ROOT, "scripts/testkohorte-provisionierung-inaktiv-test.js"), "utf8")));

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((fehler) => {
  console.error(`Unerwarteter Fehler: ${(fehler && fehler.stack) || fehler}`);
  process.exit(1);
});
