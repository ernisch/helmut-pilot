#!/usr/bin/env node
"use strict";

// Helmut — LAMBDA-PAKET UND SICHERER STARTWEG (Korrekturlauf 2026-08-14/3, Luecken 2 und 3).
// =============================================================================================
// WAS HIER BEWIESEN WIRD:
//   A) Das Paket ist REPRODUZIERBAR baubar, enthaelt genau das Noetige, KEINE Secrets, keine
//      Tests, keine Dokumente, keine Migrationen — und es LAEUFT: beide Handler werden aus dem
//      entpackten Artefakt geladen und ausgefuehrt.
//   B) Der Startweg holt Supabase-Zugangsdaten ueber AWS Systems Manager MIT Entschluesselung,
//      haelt sie ausschliesslich im Prozessspeicher, protokolliert sie nie, faellt NIE still
//      auf den lokalen Speicher zurueck und stoppt bei jedem Fehler geschlossen.
//
// OFFLINE: kein Netz, kein AWS. Die SSM-Grenze wird durch eine vertragstreue lokale Attrappe
// ersetzt (dieselbe Schnittstelle, die `lambda-konfiguration.js` benutzt).

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

// Vertragstreue lokale SSM-Grenze: exakt die Form, die lambda-konfiguration.js erwartet.
function lokalesSsm(werte, { fehler = null } = {}) {
  return {
    aufrufe: 0,
    namen: [],
    getParameter(name) {
      this.aufrufe += 1;
      this.namen.push(name);
      if (fehler) return Promise.reject(new Error(fehler));
      if (!(name in werte)) return Promise.reject(new Error(`ParameterNotFound: ${name} (arn:aws:ssm:eu-central-1:123456789012:parameter${name})`));
      return Promise.resolve({ Parameter: { Name: name, Value: werte[name], Type: "SecureString" } });
    }
  };
}

async function main() {
  console.log("Helmut — Lambda-Paket und sicherer Startweg (offline)\n");

  const bauer = require(path.join(ROOT, "scripts", "lambda-paket-bauen"));
  const konfiguration = require(path.join(ROOT, "lib", "helmut", "lambda-konfiguration"));

  // ── 1 · DAS PAKET WIRD GEBAUT ──────────────────────────────────────────────────────────────
  abschnitt("1 · Reproduzierbarer Bau");
  const ziel1 = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-paket-a-"));
  const ziel2 = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-paket-b-"));
  const a = bauer.baue({ ziel: ziel1 });
  const b = bauer.baue({ ziel: ziel2 });

  check("1.1 Der Bau erzeugt ein Archiv", Boolean(a.zipPfad) && fs.existsSync(a.zipPfad));
  check("1.2 Der Bau erzeugt ein Manifest mit Pruefsumme",
    typeof a.manifest === "object" && /^[0-9a-f]{64}$/.test(String(a.manifest.zipSha256)));
  // REPRODUZIERBAR: zwei Laeufe derselben Quelle ergeben BYTEGLEICHE Archive. Ohne feste
  // Zeitstempel und feste Reihenfolge waere das nicht so — und eine Pruefsumme im Runbook
  // waere wertlos.
  check("1.3 Zwei Laeufe erzeugen bytegleiche Archive (feste Zeitstempel, feste Reihenfolge)",
    a.manifest.zipSha256 === b.manifest.zipSha256, `${a.manifest.zipSha256} vs ${b.manifest.zipSha256}`);
  check("1.4 Die Groesse ist berichtet und liegt weit unter der Lambda-Grenze (50 MiB gezippt)",
    Number(a.manifest.zipBytes) > 0 && Number(a.manifest.zipBytes) < 50 * 1024 * 1024,
    `${a.manifest.zipBytes} Bytes`);

  // ── 2 · INHALT: genau das Noetige, NICHTS Gefaehrliches ────────────────────────────────────
  abschnitt("2 · Paketinhalt");
  const entpackt = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-entpackt-"));
  const dateien = bauer.entpackeZip(fs.readFileSync(a.zipPfad), entpackt);
  check("2.1 Das Archiv laesst sich vollstaendig entpacken",
    dateien.length === a.manifest.dateien, `${dateien.length} vs ${a.manifest.dateien}`);

  for (const einstieg of bauer.EINSTIEGSPUNKTE) {
    check(`2.2 Einstiegspunkt im Paket: ${einstieg}`, fs.existsSync(path.join(entpackt, einstieg)));
  }
  // DER HANDLERPFAD DER INFRASTRUKTUR MUSS AUF EINE DATEI IM PAKET ZEIGEN. Ein falscher
  // Handlerpfad ist der haeufigste stille Deployment-Fehler ueberhaupt.
  const yaml = fs.readFileSync(path.join(ROOT, "infra", "aws", "helmut-auftrags-queue.yaml"), "utf8");
  const handlerPfade = [...yaml.matchAll(/Handler:\s*([^\s#]+)/g)].map((m) => m[1]);
  check("2.3 Die Infrastruktur nennt mindestens zwei Handler (Verbraucher + Relay)",
    handlerPfade.length >= 2, handlerPfade.join(", "));
  for (const h of handlerPfade) {
    const datei = `${h.split(".").slice(0, -1).join(".")}.js`;
    const exportName = h.split(".").pop();
    const vorhanden = fs.existsSync(path.join(entpackt, datei));
    let exportiert = false;
    if (vorhanden) {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      exportiert = typeof require(path.join(entpackt, datei))[exportName] === "function";
    }
    check(`2.4 Handlerpfad ${h} zeigt auf eine Datei im Paket, die ihn exportiert`,
      vorhanden && exportiert, `datei=${vorhanden} export=${exportiert}`);
  }

  const verboten = dateien.filter((d) => bauer.istVerboten(d));
  check("2.5 KEINE verbotene Datei im Paket (Secrets, Tests, Doku, Migrationen, Karten)",
    verboten.length === 0, verboten.slice(0, 5).join(", "));
  check("2.6 Konkret: keine .env, kein .git, keine *-test.js, keine *.md, keine supabase/",
    !dateien.some((d) => /(^|\/)\.env|(^|\/)\.git\/|-test\.js$|\.md$|(^|\/)supabase\//.test(d)));
  // Ein zweiter, UNABHAENGIGER Blick: kein Inhalt des Pakets sieht aus wie ein Schluessel.
  let verdaechtig = [];
  for (const d of dateien) {
    if (!/\.(js|json)$/.test(d)) continue;
    const inhalt = fs.readFileSync(path.join(entpackt, d), "utf8");
    // Supabase-Service-Schluessel sind JWTs; ein echtes OpenAI-Token beginnt mit sk-.
    if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(inhalt) || /\bsk-[A-Za-z0-9]{32,}\b/.test(inhalt)) {
      verdaechtig.push(d);
    }
  }
  check("2.7 Kein Dateiinhalt sieht aus wie ein Zugangsschluessel (JWT/sk-)",
    verdaechtig.length === 0, verdaechtig.slice(0, 3).join(", "));

  // DER GESAMTE ABHAENGIGKEITSBAUM IST NAMENTLICH FESTGESCHRIEBEN. Nicht als Schikane: das
  // Paket laeuft in AWS mit dem Supabase-Service-Schluessel im Prozessspeicher. Jede neue
  // transitive Abhaengigkeit ist eine neue Partei mit Zugriff darauf — sie soll auffallen,
  // nicht durchrutschen. Ein SDK-Versionswechsel bricht diesen Test absichtlich.
  const ERWARTETE_ABHAENGIGKEITEN = [
    "@aws-sdk/client-lambda", "@aws-sdk/client-sqs", "@aws-sdk/client-ssm", "@aws-sdk/core",
    "@aws-sdk/credential-provider-env", "@aws-sdk/credential-provider-http",
    "@aws-sdk/credential-provider-ini", "@aws-sdk/credential-provider-login",
    "@aws-sdk/credential-provider-node", "@aws-sdk/credential-provider-process",
    "@aws-sdk/credential-provider-sso", "@aws-sdk/credential-provider-web-identity",
    "@aws-sdk/middleware-sdk-sqs", "@aws-sdk/nested-clients",
    "@aws-sdk/signature-v4-multi-region", "@aws-sdk/token-providers", "@aws-sdk/types",
    "@aws-sdk/xml-builder", "@aws/lambda-invoke-store", "@smithy/core",
    "@smithy/credential-provider-imds", "@smithy/fetch-http-handler",
    "@smithy/node-http-handler", "@smithy/signature-v4", "@smithy/types", "bowser", "tslib"
  ];
  const abhaengigkeiten = [...new Set(dateien
    .map((d) => (d.match(/^node_modules\/(@[^/]+\/[^/]+|[^/]+)\//) || [])[1])
    .filter(Boolean))].sort();
  const unerwartet = abhaengigkeiten.filter((n) => !ERWARTETE_ABHAENGIGKEITEN.includes(n));
  const fehlend = ERWARTETE_ABHAENGIGKEITEN.filter((n) => !abhaengigkeiten.includes(n));
  check("2.8 Der Abhaengigkeitsbaum im Paket ist EXAKT der festgeschriebene",
    unerwartet.length === 0 && fehlend.length === 0,
    `neu=${unerwartet.join(",") || "-"} fehlend=${fehlend.join(",") || "-"}`);
  // Der SSM-Client MUSS mit ausgeliefert sein — sonst schlaegt der Startweg in AWS mit
  // "ssm-sdk-nicht-verfuegbar" fehl und die Funktion arbeitet nie.
  check("2.9 Der SSM-Client ist mitverpackt (sonst kein Startweg in AWS)",
    fs.existsSync(path.join(entpackt, "node_modules/@aws-sdk/client-ssm/package.json")));
  check("2.10 Der SQS-Client ist mitverpackt (Relay-Versand)",
    fs.existsSync(path.join(entpackt, "node_modules/@aws-sdk/client-sqs/package.json")));

  // ── 3 · DAS GEBAUTE ARTEFAKT LAEUFT WIRKLICH ───────────────────────────────────────────────
  abschnitt("3 · Das gebaute Artefakt wird geladen und ausgefuehrt");
  const paketVerbraucher = require(path.join(entpackt, "lambda/index.js"));
  const paketRelay = require(path.join(entpackt, "lambda/relay.js"));
  check("3.1 lambda/index.js exportiert handler", typeof paketVerbraucher.handler === "function");
  check("3.2 lambda/relay.js exportiert handler", typeof paketRelay.handler === "function");

  // Der Verbraucher-Handler laeuft mit einer LEEREN Nachrichtenliste — das beweist, dass alle
  // `require`-Ketten im Paket aufloesbar sind (der haeufigste Paketfehler ueberhaupt).
  const leer = await paketVerbraucher.handler({ Records: [] }, {}, { log: () => {}, env: {} });
  check("3.3 Der Verbraucher-Handler laeuft (alle require-Ketten im Paket aufloesbar)",
    leer && Array.isArray(leer.batchItemFailures), JSON.stringify(leer));

  // Der Relay-Handler laeuft ohne Antrieb — er darf NICHTS tun und NICHT werfen.
  const relayOhneAntrieb = await paketRelay.handler({ ausloeser: "zeitgeber" }, {}, {
    log: () => {}, env: {}, konfiguration: false,
    relayDeps: { abgleichAktiv: false, klassen: null }
  });
  check("3.4 Der Relay-Handler laeuft und tut ohne Ereignis-Antrieb NICHTS",
    relayOhneAntrieb && (relayOhneAntrieb.versendet || 0) === 0, JSON.stringify(relayOhneAntrieb));

  // ── 4 · STARTWEG: die Werte kommen aus SSM, entschluesselt ─────────────────────────────────
  abschnitt("4 · Sicherer Startweg (AWS Systems Manager)");
  const URL_NAME = "/helmut/prod/supabase-url";
  const KEY_NAME = "/helmut/prod/supabase-service-role-key";
  const GEHEIM = `eyJhbGciOiJIUzI1NiJ9.${crypto.randomBytes(24).toString("base64url")}.unterschrift`;

  konfiguration._cacheZuruecksetzen();
  let env = { HELMUT_SUPABASE_URL_PARAMETER: URL_NAME, HELMUT_SUPABASE_KEY_PARAMETER: KEY_NAME };
  let ssm = lokalesSsm({ [URL_NAME]: "https://abcdef.supabase.co", [KEY_NAME]: GEHEIM });
  let r = await konfiguration.stelleKonfigurationSicher({ env, deps: { ssm } });
  check("4.1 Der Startweg meldet Erfolg", r && r.geladen === true);
  check("4.2 SUPABASE_URL ist gesetzt", env.SUPABASE_URL === "https://abcdef.supabase.co");
  check("4.3 Der Service-Schluessel ist gesetzt", env.SUPABASE_SERVICE_ROLE_KEY === GEHEIM);
  check("4.4 HELMUT_STORAGE_BACKEND=supabase ist gesetzt (kein stiller Lokalspeicher)",
    env.HELMUT_STORAGE_BACKEND === "supabase");
  check("4.5 supabaseBereit() bestaetigt die Verbindung", konfiguration.supabaseBereit(env) === true);
  check("4.6 Genau zwei Parameter wurden gelesen", ssm.aufrufe === 2, String(ssm.aufrufe));
  check("4.7 Es wurden GENAU die konfigurierten Namen gelesen (keine Streuung)",
    ssm.namen.join(",") === `${URL_NAME},${KEY_NAME}`, ssm.namen.join(","));

  // WARMER AUFRUF: der Prozesscache verhindert einen zweiten SSM-Zugriff je Nachricht.
  const vorher = ssm.aufrufe;
  const r2 = await konfiguration.stelleKonfigurationSicher({ env, deps: { ssm } });
  check("4.8 Ein warmer Aufruf liest NICHT erneut aus SSM (Prozesscache)",
    ssm.aufrufe === vorher && r2.ausCache === true, `${ssm.aufrufe} vs ${vorher}`);

  // GLEICHZEITIGE Aufrufe teilen sich EINEN Ladevorgang (nicht einer je Nachricht im Stapel).
  konfiguration._cacheZuruecksetzen();
  const env2 = { HELMUT_SUPABASE_URL_PARAMETER: URL_NAME, HELMUT_SUPABASE_KEY_PARAMETER: KEY_NAME };
  const ssm2 = lokalesSsm({ [URL_NAME]: "https://abcdef.supabase.co", [KEY_NAME]: GEHEIM });
  await Promise.all([1, 2, 3, 4, 5].map(() => konfiguration.stelleKonfigurationSicher({ env: env2, deps: { ssm: ssm2 } })));
  check("4.9 Fuenf gleichzeitige Aufrufe erzeugen GENAU zwei SSM-Zugriffe",
    ssm2.aufrufe === 2, String(ssm2.aufrufe));

  // ── 5 · FEHLERFAELLE: alle stoppen GESCHLOSSEN ─────────────────────────────────────────────
  abschnitt("5 · Fehlerfaelle (fail closed, nie stiller Lokalbetrieb)");
  const faelle = [
    {
      name: "5.1 Fehlende Parameternamen",
      env: {},
      ssm: lokalesSsm({}),
      ursache: konfiguration.URSACHEN.NAMEN_FEHLEN
    },
    {
      name: "5.2 Unbekannter Parameter (nicht lesbar)",
      env: { HELMUT_SUPABASE_URL_PARAMETER: URL_NAME, HELMUT_SUPABASE_KEY_PARAMETER: KEY_NAME },
      ssm: lokalesSsm({}),
      ursache: konfiguration.URSACHEN.NICHT_LESBAR
    },
    {
      name: "5.3 Kein Leserecht (AccessDenied)",
      env: { HELMUT_SUPABASE_URL_PARAMETER: URL_NAME, HELMUT_SUPABASE_KEY_PARAMETER: KEY_NAME },
      ssm: lokalesSsm({}, { fehler: "AccessDeniedException: User is not authorized to perform ssm:GetParameter" }),
      ursache: konfiguration.URSACHEN.NICHT_LESBAR
    },
    {
      name: "5.4 Leerer Parameterwert",
      env: { HELMUT_SUPABASE_URL_PARAMETER: URL_NAME, HELMUT_SUPABASE_KEY_PARAMETER: KEY_NAME },
      ssm: lokalesSsm({ [URL_NAME]: "   ", [KEY_NAME]: GEHEIM }),
      ursache: konfiguration.URSACHEN.LEER
    },
    {
      name: "5.5 Leerer Schluessel (zweiter Parameter)",
      env: { HELMUT_SUPABASE_URL_PARAMETER: URL_NAME, HELMUT_SUPABASE_KEY_PARAMETER: KEY_NAME },
      ssm: lokalesSsm({ [URL_NAME]: "https://abcdef.supabase.co", [KEY_NAME]: "" }),
      ursache: konfiguration.URSACHEN.LEER
    },
    {
      name: "5.6 Offensichtlich falsche URL (kein https)",
      env: { HELMUT_SUPABASE_URL_PARAMETER: URL_NAME, HELMUT_SUPABASE_KEY_PARAMETER: KEY_NAME },
      ssm: lokalesSsm({ [URL_NAME]: "http://abcdef.supabase.co", [KEY_NAME]: GEHEIM }),
      ursache: konfiguration.URSACHEN.URL_UNGUELTIG
    }
  ];

  for (const f of faelle) {
    konfiguration._cacheZuruecksetzen();
    const e = { ...f.env };
    let gefangen = null;
    try {
      await konfiguration.stelleKonfigurationSicher({ env: e, deps: { ssm: f.ssm } });
    } catch (fehler) { gefangen = fehler; }
    const ursacheOk = gefangen && gefangen.helmutUrsache === f.ursache;
    const keinRueckfall = !konfiguration.supabaseBereit(e)
      && String(e.HELMUT_STORAGE_BACKEND || "") !== "supabase";
    check(f.name, Boolean(ursacheOk) && keinRueckfall,
      `ursache=${gefangen && gefangen.helmutUrsache} rueckfall=${!keinRueckfall}`);
  }

  // ── 6 · KEIN WERT GELANGT IN EINEN FEHLERTEXT ──────────────────────────────────────────────
  abschnitt("6 · Kein Geheimnis in Fehlertexten oder Protokollen");
  konfiguration._cacheZuruecksetzen();
  const envG = { HELMUT_SUPABASE_URL_PARAMETER: URL_NAME, HELMUT_SUPABASE_KEY_PARAMETER: KEY_NAME };
  const ssmG = lokalesSsm({ [URL_NAME]: "https://abcdef.supabase.co" });  // Schluessel fehlt
  let text = "";
  try {
    await konfiguration.stelleKonfigurationSicher({ env: envG, deps: { ssm: ssmG } });
  } catch (fehler) { text = `${fehler.message} ${fehler.stack || ""}`; }
  check("6.1 Der Fehlertext traegt weder Parameternamen noch ARN",
    !text.includes(KEY_NAME) && !text.includes("arn:aws"), text.slice(0, 120));
  check("6.2 Der Fehlertext ist genau eine der festen Ursachen",
    Object.values(konfiguration.URSACHEN).includes(String(text.split(" ")[0]).trim()),
    text.split(" ")[0]);

  // Ein FEHLGESCHLAGENER Start darf nicht zwischengespeichert werden — sonst bliebe ein
  // warmer Container nach einem voruebergehenden SSM-Fehler dauerhaft kaputt.
  const ssmSpaeter = lokalesSsm({ [URL_NAME]: "https://abcdef.supabase.co", [KEY_NAME]: GEHEIM });
  const heilung = await konfiguration.stelleKonfigurationSicher({ env: envG, deps: { ssm: ssmSpaeter } })
    .then(() => true).catch(() => false);
  check("6.3 Nach einem Fehlschlag gelingt der naechste Versuch (kein vergifteter Cache)",
    heilung === true && konfiguration.supabaseBereit(envG) === true);

  // ── 7 · QUELLTEXTPFLICHTEN ────────────────────────────────────────────────────────────────
  abschnitt("7 · Quelltextpflichten des Startwegs");
  const quelle = fs.readFileSync(path.join(ROOT, "lib", "helmut", "lambda-konfiguration.js"), "utf8");
  const ohneKommentare = quelle.split("\n").filter((z) => !/^\s*\/\//.test(z)).join("\n");
  check("7.1 GetParameter wird MIT Entschluesselung aufgerufen",
    /WithDecryption:\s*true/.test(ohneKommentare));
  check("7.2 Kein console/log-Aufruf im Startweg (Werte koennten sonst austreten)",
    !/console\.|\blog\(/.test(ohneKommentare));
  check("7.3 Kein Schreiben in eine Datei",
    !/writeFile|appendFile|createWriteStream/.test(ohneKommentare));
  check("7.4 Die Werte werden NICHT an den Aufrufer zurueckgegeben",
    !/return\s*\{[^}]*(url|schluessel)\s*[,:}]/.test(ohneKommentare));
  check("7.5 Der SSM-Client ist exakt gepinnt (package.json)",
    JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"))
      .dependencies["@aws-sdk/client-ssm"] === "3.1110.0");

  fs.rmSync(ziel1, { recursive: true, force: true });
  fs.rmSync(ziel2, { recursive: true, force: true });
  fs.rmSync(entpackt, { recursive: true, force: true });

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  console.log(`Paket: ${a.manifest.dateien} Dateien, ${(a.manifest.zipBytes / 1048576).toFixed(2)} MiB, sha256=${a.manifest.zipSha256}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((fehler) => {
  console.error("FATAL:", fehler);
  process.exit(1);
});
