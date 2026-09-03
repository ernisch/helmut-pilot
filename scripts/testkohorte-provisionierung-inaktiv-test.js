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
//      SCHARF, und mit UNVERÄNDERTER Reifeprüfung. Dabei werden Netz
//      (fetch/http/https/net/tls/dns), Kindprozesse, der Kommunikationsriegel und
//      jede Funktion des KI-Moduls mitgezählt. Erwartung: 0 · 0 · 0 · 0.
//   2. Jedes angelegte Profil ist `profileActive:false`, jedes Konto gesperrt,
//      und das Prädikat des Arbeitsplaners (`isDisabled`) hält sie für
//      deaktiviert.
//   3. Der echte Planer (`scalable-pipeline.planeArbeit`) plant für die 20
//      inaktiven Profile 0 Aufträge und ruft `enqueue` nie — und derselbe
//      Planer plant sehr wohl, sobald ein Profil aktiv ist (Gegenprobe, damit
//      die 0 keine Attrappen-0 ist).
//   4. Die stufenbewusste Isolationsprüfung bestätigt den Zustand rein lesend.
//
// GESCHICHTE DIESER SUITE, ehrlich (nicht rückwirkend umgeschrieben):
// Am 03.09. wies der ECHTE Pfad hier erstmals gemessen 18 von 20 Profilen der
// Stufe A mit `bundestagsprofil-nicht-bereit` ab — die Kohorte trug synthetische
// Ausschüsse („Testausschuss N"), die Bundestagsreife-Sperre verlangt aber
// Ausschüsse der WP-21-Sollmenge. Alle früheren Suiten prüften den scharfen Pfad
// mit einer Attrappe für `legeAn`; der Befund blieb dadurch unsichtbar. Abschnitt
// A0 hielt diesen Zustand zunächst als dokumentierten BLOCKER fest.
//
// SEIT §34.7 VARIANTE A ist der Blocker geschlossen: die Kohorte richtet sich nach
// der Regel (amtliche Ausschüsse für Bundestagsprofile), nicht die Regel nach der
// Kohorte. A0 ist deshalb jetzt ein POSITIVBELEG des echten, unveränderten Pfads
// (20 von 20, ohne Attrappe und ohne ausgesetzte Reifeprüfung), A0a die Gegenprobe,
// dass die Sperre unverändert scharf ist. Die Lasteigenschaft (Abschnitte A–E)
// wird an demselben, echt angelegten Bestand gemessen.
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

const reife = require("../lib/helmut/profile-readiness");
const { VERALTETE_AUSSCHUSSNAMEN } = require("../lib/helmut/quellenarchitektur/seeds/bundestag-ausschuesse");
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

  // ── A0 · POSITIVBELEG: der ECHTE, UNVERÄNDERTE Provisionierungspfad ──────
  //
  // Bis 03.09. stand hier ein BLOCKER-Pin: der echte Pfad wies 18 von 20
  // Bundestagsprofilen mit `bundestagsprofil-nicht-bereit` ab, weil die Kohorte
  // „Testausschuss N" trug. Der Blocker ist mit §34.7 Variante A geschlossen —
  // die Kohorte trägt jetzt amtliche Ausschüsse der 21. Wahlperiode. Der Pin ist
  // deshalb durch diesen POSITIVBELEG ersetzt: KEINE Attrappe für `legeAn`,
  // KEINE ausgesetzte Reifeprüfung, KEIN Sonderfall für die synthetische
  // Kennungsfamilie — genau der Pfad, den ein reales Mandat ginge.
  console.log("A0 · Der echte, unveränderte Pfad legt Stufe A vollständig an");
  const sp = baueSpeicher();
  // Schnappschuss VOR dem scharfen Lauf. B8 prüft die DIFFERENZ, nicht den absoluten
  // Bestand: was die Suite selbst am Dateikopf lädt (und was daran haengt), ist keine
  // Aussage über die Provisionierung. Ehrlich gesagt: `ai.js` liegt zu diesem
  // Zeitpunkt bereits im Cache, weil `testkohorte-betrieb` es transitiv zieht — es
  // wird aber vom Anlagelauf weder geladen noch aufgerufen (B7 zählt 0 Aufrufe).
  const moduleVorLauf = new Set(Object.keys(require.cache));
  const ergebnis = await laufStufeA(sp);
  const abgewiesen = ergebnis.ergebnisse.filter((e) => e.zustand !== "angelegt-inaktiv");
  // A0.1 ist eine QUELLTEXTPRÜFUNG und damit die schwächste Zusicherung dieses
  // Abschnitts (Reviewbefund 03.09.): sie erkennt eine wörtlich übergebene
  // Attrappe, nicht eine über eine Variable eingeschleuste. Der eigentliche,
  // VERHALTENSBASIERTE Beleg, dass die echte Sperre im selben Lauf wirklich
  // greift, ist A0a.1/A0a.2 — dort wird ein Profil mit unbekanntem Ausschuss
  // über genau denselben Pfad abgewiesen. Eine Attrappe, die A0.2 grün machte,
  // müsste A0a rot machen. Beide zusammen tragen die Aussage; A0.1 allein nicht.
  check("A0.1 Die Reifeprüfung ist NICHT ausgesetzt — der Lauf übergibt keine readiness-Attrappe",
    (() => {
      const quelle = require("fs").readFileSync(__filename, "utf8");
      // Kein `readiness` in irgendeinem Aufruf des scharfen Anlagelaufs. Erlaubt
      // bleibt es ausschließlich als ausdrücklicher Negativfall in Abschnitt A0a.
      return !/laufStufeA\([\s\S]{0,300}?readiness/.test(quelle);
    })());
  check("A0.2 Der echte Provisionierer legt 20 von 20 an: 0 fehlgeschlagen, ok",
    ergebnis.modus === V.MODUS_SCHARF && ergebnis.angelegt === 20
      && ergebnis.fehlgeschlagen === 0 && ergebnis.ok === true,
    `modus=${ergebnis.modus} angelegt=${ergebnis.angelegt} fehlgeschlagen=${ergebnis.fehlgeschlagen}`
      + (abgewiesen.length ? ` · ${abgewiesen.slice(0, 2).map((e) => `${e.id}:${e.zustand}:${e.schreibfehler}`).join(" ")}` : ""));
  check("A0.3 KEINE Abweisung mit bundestagsprofil-nicht-bereit (der Blocker aus §34.7 ist geschlossen)",
    abgewiesen.length === 0
      && !ergebnis.ergebnisse.some((e) => e.schreibfehler === "bundestagsprofil-nicht-bereit"));
  check("A0.4 Die Reife trägt für BEIDE Ebenen: 18 Bundestags- und 2 Landtagsprofile der Stufe A",
    (() => {
      const specs = require("../lib/helmut/test-kohorte-500").baueKohorte();
      const ids = new Set(S.kennungenDerStufe("a"));
      const stufeA = specs.filter((x) => ids.has(x.id));
      const bt = stufeA.filter((x) => x.parliamentType === "Bundestag");
      const lt = stufeA.filter((x) => x.parliamentType === "Landtag");
      const reifBt = bt.every((x) => {
        const profil = provisioning.buildProfile({ ...x, password: "laufzeit-passwort-nur-im-test-1234" }, { aktiv: false });
        const r = reife.pruefeNeuaktivierung({ ...profil, profileActive: true });
        return r.zutreffend === true && r.zulaessig === true;
      });
      const ltNichtZustaendig = lt.every((x) => {
        const profil = provisioning.buildProfile({ ...x, password: "laufzeit-passwort-nur-im-test-1234" }, { aktiv: false });
        return reife.pruefeNeuaktivierung({ ...profil, profileActive: true }).zutreffend === false;
      });
      return bt.length === 18 && lt.length === 2 && reifBt && ltNichtZustaendig;
    })());

  // ── A0a · Die Sperre ist NICHT gelockert — Gegenprobe ────────────────────
  // Der Positivbeleg oben wäre wertlos, wenn die Sperre inzwischen alles
  // durchließe. Diese Gegenprobe zeigt: sie feuert weiterhin, sobald ein
  // Bundestagsprofil einen unbekannten oder veralteten Ausschuss trägt — und
  // sie feuert VOR jedem Schreibvorgang.
  console.log("\nA0a · Gegenprobe: die Bundestagsreife-Sperre ist unverändert scharf");
  {
    const kohorte500 = require("../lib/helmut/test-kohorte-500");
    const spec = kohorte500.baueKohorte().find((x) => x.parliamentType === "Bundestag");
    const kaputt = baueSpeicher();
    const r = await V.fuehreProvisionierungAus({
      stufe: "a",
      kennungen: [spec.id],
      modus: V.MODUS_SCHARF,
      env: FREIGABE_A,
      startfensterBefund: FENSTER,
      jetztUtc: JETZT_DRIN,
      deps: {
        // Dasselbe Profil, nur mit einem Ausschuss, den die Sollmenge nicht kennt.
        legeAn: (sp2) => provisioning.provisionTenant(
          { ...sp2, committees: ["Testausschuss 1"] },
          { storage: kaputt.storage, accounts: kaputt.accounts }, { neuAktiv: false }
        ),
        leseZustand: async (id) => {
          const p2 = kaputt.profile.get(id);
          return { vorhanden: Boolean(p2), aktiv: Boolean(p2 && p2.profileActive === true) };
        },
        zufall: () => "laufzeit-passwort-nur-im-test-1234"
      }
    });
    check("A0a.1 Ein unbekannter Ausschuss wird weiterhin abgewiesen (bundestagsprofil-nicht-bereit)",
      r.ok === false && r.angelegt === 0 && r.fehlgeschlagen === 1
        && r.ergebnisse[0].schreibfehler === "bundestagsprofil-nicht-bereit",
      `${r.ergebnisse[0] && r.ergebnisse[0].schreibfehler}`);
    check("A0a.2 Und zwar VOR jedem Schreibvorgang: 0 Profile, 0 Konten, 0 Schreibvorgänge",
      kaputt.profile.size === 0 && kaputt.nutzer.length === 0 && kaputt.schreibvorgaenge() === 0);
    check("A0a.3 Auch eine VERALTETE Bezeichnung einer früheren Wahlperiode wird abgewiesen",
      VERALTETE_AUSSCHUSSNAMEN.every((v) => {
        const profil = provisioning.buildProfile({ ...spec, password: "laufzeit-passwort-nur-im-test-1234" }, { aktiv: false });
        return reife.pruefeNeuaktivierung({ ...profil, profileActive: true, committees: [v.name] }).zulaessig === false;
      }),
      `geprüft: ${VERALTETE_AUSSCHUSSNAMEN.length} Bezeichnungen aus WP 19/20`);
    // ERWEITERT 03.09. (Reviewbefund): die erste Fassung las nur provisioning.js.
    // Ein Sonderpfad könnte aber genauso gut in der Reifeprüfung selbst oder im
    // Vorwärtsausführer stehen. Geprüft werden deshalb alle drei Dateien — und
    // zusätzlich, dass in der Reifeprüfung überhaupt keine Kennungsfamilie
    // vorkommt. Das bleibt eine Quelltextprüfung; der VERHALTENSBELEG steht
    // daneben: A0a.5 fährt eine synthetische Kennung mit schlechtem Ausschuss
    // durch denselben Pfad und erwartet dieselbe Abweisung wie ein reales Mandat.
    check("A0a.4 Die synthetische Kennungsfamilie hat KEINEN Sonderweg — dieselbe Sperre wie ein reales Mandat",
      (() => {
        const fs = require("fs"), path = require("path");
        const dateien = ["lib/helmut/provisioning.js", "lib/helmut/profile-readiness.js",
          "lib/helmut/testkohorte-vorwaerts.js"];
        for (const rel of dateien) {
          const quelle = fs.readFileSync(path.join(ROOT, rel), "utf8");
          if (/synthetischErlaubt[^\n]*readiness/i.test(quelle)) return false;
          if (/istSynthetischeKennung[\s\S]{0,200}readiness/i.test(quelle)) return false;
          if (/readiness[\s\S]{0,200}istSynthetischeKennung/i.test(quelle)) return false;
        }
        // In der Reifeprüfung darf die Kennungsfamilie gar nicht vorkommen.
        const reifeQuelle = fs.readFileSync(path.join(ROOT, "lib/helmut/profile-readiness.js"), "utf8");
        return !/test-kohorte/i.test(reifeQuelle);
      })());
    check("A0a.5 VERHALTENSBELEG: eine synthetische Kennung mit schlechtem Ausschuss wird genauso abgewiesen wie ein reales Mandat",
      (() => {
        const roh = require("../lib/helmut/test-kohorte-500").baueSpezifikation(0);
        const profil = provisioning.buildProfile(
          { ...roh, password: "laufzeit-passwort-nur-im-test-1234" }, { aktiv: false });
        const synthetisch = reife.pruefeNeuaktivierung({
          ...profil, profileActive: true, committees: ["Ausschuss für Digitales"]
        });
        const real = reife.pruefeNeuaktivierung({
          ...profil, id: "erika-mustermann", fullName: "Erika Mustermann",
          profileActive: true, committees: ["Ausschuss für Digitales"]
        });
        return synthetisch.zulaessig === false && real.zulaessig === false
          && synthetisch.grund === real.grund;
      })());
  }

  // ── A0b · Ein inaktiver Lauf aktiviert NICHTS — auch nicht auf Wunsch ────
  // ERGAENZT 03.09. (Reviewbefund): der STAPELpfad wies `spec.reaktivieren` seit
  // jeher ab, der EINZELpfad `provisionTenant` — den die Kohorte benutzt — nicht.
  // Ein Lauf mit `neuAktiv:false` haette ein deaktiviertes Bestandsprofil trotzdem
  // reaktiviert und `ok:true` gemeldet. Die Kohortenspezifikation traegt das Feld
  // nicht, der Fall war also nicht erreichbar — aber die Zusage „die Anlage bleibt
  // ausschliesslich inaktiv" darf nicht daran haengen, dass niemand das Feld setzt.
  console.log("\nA0b · Ein ausdruecklich inaktiver Lauf aktiviert nichts");
  {
    const roh = require("../lib/helmut/test-kohorte-500").baueSpezifikation(0);
    const spec = { ...roh, password: "laufzeit-passwort-nur-im-test-1234" };
    const deps = (speicher) => ({ storage: speicher.storage, accounts: speicher.accounts });
    const bau = async (bestand) => {
      const speicher = baueSpeicher();
      speicher.profile.set(spec.id, bestand);
      return { speicher, ergebnis: await provisioning.provisionTenant(
        { ...spec, reaktivieren: true }, deps(speicher), { neuAktiv: false }) };
    };
    // Die Bestandszeile muss die provisionedBy-Marke tragen — ohne sie greift der
    // aeltere Schutz `isProtectedTenant` schon vorher, und der Fall waere gar nicht
    // erreichbar. Genau der interessante Fall ist eine Zeile, die dieses Werkzeug
    // selbst angelegt und die jemand deaktiviert hat.
    const deaktiviert = provisioning.buildProfile(
      { ...spec, password: "laufzeit-passwort-nur-im-test-1234" }, { aktiv: false });
    const { speicher: sp1, ergebnis: e1 } = await bau(deaktiviert);
    check("A0b.1 `reaktivieren:true` in einem inaktiven Lauf bricht ab statt zu aktivieren",
      e1.ok === false && e1.aborted === true && e1.reason === "reaktivierung-in-inaktivem-lauf",
      `ok=${e1.ok} reason=${e1.reason}`);
    check("A0b.2 Und zwar VOR dem Schreibvorgang: das Bestandsprofil bleibt deaktiviert",
      sp1.profile.get(spec.id).profileActive === false && sp1.schreibvorgaenge() === 0,
      `profileActive=${sp1.profile.get(spec.id).profileActive} schreibvorgaenge=${sp1.schreibvorgaenge()}`);
    check("A0b.3 Der Abbruch haengt am Lauf, nicht am Wert: ohne `reaktivieren` laeuft derselbe Fall durch",
      (await (async () => {
        const speicher = baueSpeicher();
        speicher.profile.set(spec.id, deaktiviert);
        const e = await provisioning.provisionTenant(spec, deps(speicher), { neuAktiv: false });
        return e.reason !== "reaktivierung-in-inaktivem-lauf"
          && speicher.profile.get(spec.id).profileActive === false;
      })()));
  }

  // ── A · Eigenschaften der angelegten Stufe A ─────────────────────────────
  console.log("\nA · Was der echte Lauf hinterlassen hat");
  check("A2 Genau die 20 Kennungen der Stufe A liegen im Store — keine andere",
    sp.profile.size === 20 && [...sp.profile.keys()].every((id) => S.stufeVonKennung(id) === "a"));
  check("A3 Jedes Profil ist INAKTIV (profileActive === false)",
    [...sp.profile.values()].every((p) => p.profileActive === false));
  check("A4 Jedes Konto ist GESPERRT (active === false) — kein Login, keine Einladungs-/Reset-Mail möglich",
    sp.nutzer.length === 20 && sp.nutzer.every((u) => u.active === false && u.politicianId && S.stufeVonKennung(u.politicianId) === "a"));
  check("A5 Der Arbeitsplaner hält jedes dieser Profile für DEAKTIVIERT (dasselbe Prädikat wie planeArbeit)",
    [...sp.profile.values()].every((p) => isDisabled(p) === true));
  check("A6 Gegen den Arbeitsspeicher-Store: genau 20 Profil-Schreibvorgänge — einer je Kennung",
    sp.schreibvorgaenge() === 20,
    "Produktiv schreibt provisionTenant je Kennung zusätzlich den Auth-Blob main-auth als Ganzes (Konto, Last-Write-Wins) — "
      + "Schreibvorgänge sind nicht Last; Last entsteht erst durch Aufträge, Verstehen, Modellaufrufe");

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
  // ERWEITERT 03.09. (Reviewbefund): die erste Fassung prüfte eine feste Fünferliste
  // reiner Außenkanäle. Die KI- und Embedding-Module standen nicht darin — gerade sie
  // sind aber die teuren. Dazu Crawler und DIP, die Netzarbeit auslösen würden.
  const VERBOTENE_MODULE = ["mail-transport.js", "job-dispatch.js", "lambda-verbraucher.js",
    "monitoring-webhook.js", "push-notifications.js", "ai.js", "embedding-backfill.js",
    "embedding-shadow-pipeline.js", "crawler.js", "dip.js"];
  const neuGeladen = Object.keys(require.cache).filter((k) => !moduleVorLauf.has(k));
  const geladen = VERBOTENE_MODULE.filter((m) => neuGeladen
    .some((k) => k.endsWith(`${path.sep}lib${path.sep}helmut${path.sep}${m}`)));
  check(`B8 Die Provisionierung hat kein Außenkanal-, KI- oder Crawl-Modul NACHGELADEN (${VERBOTENE_MODULE.length} geprüft)`,
    geladen.length === 0, geladen.join(", ") || "keines nachgeladen");
  check("B8a Der Lauf hat überhaupt nur Fachmodule nachgeladen (Beleg, dass B8 nicht ins Leere prüft)",
    neuGeladen.length > 0,
    `${neuGeladen.length} Module: ${neuGeladen.filter((k) => k.includes(`${path.sep}lib${path.sep}helmut${path.sep}`))
      .map((k) => path.basename(k)).sort().join(", ")}`);

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

  // ── C2 · Der zweite Konsument aller Profile: die Verstehens-Interessenprüfung ─
  // REVIEWBEFUND 03.09.: `scheduler.js` reicht `listFullProfiles()` (inkl.
  // inaktiver) an `lazyUnderstanding.interestedProfiles`; ein inaktives
  // Kohortenprofil zählte dort als „interessiert" und hätte Verstehensarbeit
  // vorgemerkt (später Modellaufrufe). Seit 03.09. filtert die Interessenprüfung
  // mit demselben Prädikat wie der Arbeitsplaner (`isDisabled`).
  console.log("\nC2 · Die Verstehens-Interessenprüfung übergeht inaktive Profile");
  {
    const LU = require("../lib/helmut/lazyUnderstanding");
    const spec = require("../lib/helmut/test-kohorte-500").baueKohorte()[0];
    const inaktivesProfil = [...sp.profile.values()].find((p) => p.id === spec.id);
    const cluster = {
      vorgang_id: "v-test-interesse-1",
      title: `${spec.committees[0]} berät ${spec.focusTopics[0]}`,
      summary: `${spec.focusTopics[0]} ${spec.committees[0]}`,
      policy_field: spec.focusTopics, parteien: [spec.party], ausschuesse: spec.committees
    };
    const aktivKopie = { ...inaktivesProfil, profileActive: true };
    const interesseAktiv = LU.interestedProfiles(cluster, [aktivKopie]);
    check("C2.1 GEGENPROBE: dasselbe Profil AKTIV ist an einem passenden Vorgang interessiert",
      interesseAktiv.length === 1 && interesseAktiv[0].userId === spec.id,
      interesseAktiv.length ? `Ähnlichkeit ${interesseAktiv[0].similarity}` : "nicht interessiert");
    check("C2.2 INAKTIV zählt es nicht als interessiert — kein Vormerken von Verstehensarbeit",
      LU.interestedProfiles(cluster, [inaktivesProfil]).length === 0
        && LU.interestedProfiles(cluster, [...sp.profile.values()]).length === 0);
    check("C2.3 Auch ein soft-gelöschtes Profil zählt nicht (dasselbe Prädikat wie der Planer)",
      LU.interestedProfiles(cluster, [{ ...aktivKopie, deletedAt: "2026-09-01T00:00:00Z" }]).length === 0);
    check("C2.4 decideLazyUnderstanding über die 20 inaktiven Profile: skip-no-interest",
      LU.decideLazyUnderstanding({ vorgangId: cluster.vorgang_id, cluster, profiles: [...sp.profile.values()] }).action === "skip-no-interest");
    let vorgemerkt = 0;
    const lauf = await LU.runLazyUnderstandingShadow({ cluster, profiles: [...sp.profile.values()], existingKo: null }, {
      enabled: () => true,
      getExisting: async () => null,
      listProfiles: async () => [...sp.profile.values()],
      savePending: async () => { vorgemerkt += 1; return { ok: true }; }
    });
    check("C2.5 Der Shadow-Runner (Flag an) merkt für 20 inaktive Profile NICHTS vor",
      lauf.triggered === false && lauf.action === "skip-no-interest" && vorgemerkt === 0);
    check("C2.6 Und weiterhin 0 Netz, 0 KI, 0 Riegel",
      zaehler.fetch === 0 && zaehler.http === 0 && zaehler.https === 0 && zaehler.ki === 0 && zaehler.riegel === 0);
  }

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

  // ── D2 · Auch der Rückbau-Beleg ist stufenbewusst (Reviewbefund 03.09.) ───
  // Ohne `stufe` verlangte er 495 gelesene Zeilen — nach Stufe A (20 Zeilen)
  // wäre der Rückweg damit NIE bestätigbar gewesen: ein falsches Rot.
  console.log("\nD2 · Der Rückbau-Beleg ist stufenbewusst");
  {
    const bestandNachRueckbau = (zeilen) => bestandAus(zeilen, { erhobenUtc: "2026-09-11T02:00:00.000Z" });
    const ohneStufe = K.pruefeRueckbau({ grundlinie, bestand: bestandNachRueckbau(zeilenA) });
    check("D2.1 OHNE Stufe: 20 gelesene Zeilen sind nicht 495 → nicht bestätigt (Bestandsverhalten)",
      ohneStufe.zurueckgebaut === false && ohneStufe.offen.includes("Vollständige Kohorte gelesen") && ohneStufe.stufe === null);
    const mitStufe = K.pruefeRueckbau({ grundlinie, bestand: bestandNachRueckbau(zeilenA), stufe: "a" });
    check("D2.2 MIT Stufe A: 20 inaktive Zeilen → Rückbau bestätigt",
      mitStufe.zurueckgebaut === true && mitStufe.stufe === "a", mitStufe.offen.join("; ") || "alle Prüfungen bestanden");
    check("D2.3 Eine noch aktive Zeile bricht den Beleg auch mit Stufe",
      K.pruefeRueckbau({ grundlinie, bestand: bestandNachRueckbau(zeilenA.map((z, i) => (i === 0 ? { ...z, aktiv: true } : z))), stufe: "a" }).zurueckgebaut === false);
    check("D2.4 Eine fehlende oder vorzeitige Zeile bricht den Beleg mit Stufe",
      K.pruefeRueckbau({ grundlinie, bestand: bestandNachRueckbau(zeilenA.slice(1)), stufe: "a" }).zurueckgebaut === false
        && K.pruefeRueckbau({ grundlinie, bestand: bestandNachRueckbau([...zeilenA, { id: "test-kohorte-b-001", aktiv: false, email: "test-kohorte-b-001@test-kohorte.invalid" }]), stufe: "a" }).zurueckgebaut === false);
    check("D2.5 Eine unbekannte Stufe wirft (grund: stufe)",
      (() => { try { K.pruefeRueckbau({ grundlinie, bestand: bestandNachRueckbau(zeilenA), stufe: "z" }); return false; } catch (e) { return e && e.grund === "stufe"; } })());
  }

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
