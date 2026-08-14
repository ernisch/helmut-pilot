"use strict";

// Helmut — MUTATIONSPROBE DES KORREKTURLAUFS (2026-08-14/3).
// =============================================================================================
// WAS EINE MUTATIONSPROBE IST: sie entfernt gezielt EINE der fuenf geschlossenen Luecken und
// prueft, ob die Tests das MERKEN. Ein gruener Test ueber einer stillgelegten Bedingung ist
// wertlos. ROT = erkannt (gut). GRUEN = LOCH im Testnetz (schlecht).
//
// GEPRUEFT WERDEN GENAU DIE ZEHN MUTATIONEN, DIE DER AUFTRAG NENNT:
//   M1  Der Relay fehlt           — der Verbraucher stoesst nach dem Abschluss nichts mehr an
//   M2  Manuelle Testpumpe        — der Ende-zu-Ende-Test ruft den Dispatcher wieder selbst
//   M3  Platzhalter-Lambda        — die Infrastruktur laedt keinen echten Code mehr
//   M4  Falscher Handlerpfad      — der Handler zeigt auf eine Datei, die es nicht gibt
//   M5  Fehlender SSM-Startweg    — der Verbraucher laedt die Konfiguration nicht mehr
//   M6  Rueckfall auf Lokalspeicher — ohne Supabase wird trotzdem gearbeitet
//   M7  Fehlendes kms:Decrypt     — der Produzent kann nicht mehr senden
//   M8  Anbietersteuerung abgehaengt — der echte Abruf reserviert nicht mehr
//   M9  Verlorene Folgeauftraege  — die Wiedervorlage nach Wiederholung entfaellt
//   M10 Cron-Abhaengigkeit        — der Zeitgeber traegt das Sicherheitsnetz nicht mehr
//
// VERKABELUNGSLAUF 2026-08-14/4 — vier weitere Mutationen an der ECHTEN AWS-Vorlage:
//   M11 HELMUT_RELAY_FUNKTION fehlt in der CloudFormation-Vorlage
//   M12 Das Aufrufrecht lambda:InvokeFunction fehlt
//   M13 Alias-ARN kehrt in eine KMS-Berechtigung zurueck
//   M14 Falsche Schluessel-ARN (Queue- statt Parameter-Schluessel)
//   M15 Der alte unwirksame KeyPolicy-Riegel (AWS::NoValue) kehrt zurueck
//   M16 Noch nicht vorhandene Rollen-Principals in der Schluesselrichtlinie
//
// WIE MUTIERT WIRD: die Datei wird KURZ veraendert, der zustaendige Test als eigener Prozess
// ausgefuehrt, und die Datei danach IMMER zurueckgeschrieben — auch bei Absturz oder Abbruch
// (process-Handler unten). Das ist noetig, weil die Tests die Dateien vom Datentraeger lesen
// (Quelltextpruefungen, gebautes Paket, YAML-Vorlage); eine reine Speichermutation wuerde
// genau diese Pruefungen gar nicht erreichen.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
let erkannt = 0;
let loecher = 0;

// Sicherungsnetz: alles, was gerade veraendert ist, wird bei JEDEM Ende zurueckgeschrieben.
const offen = new Map();
function stelleAllesWiederHer() {
  for (const [datei, inhalt] of offen) {
    try { fs.writeFileSync(datei, inhalt); } catch (_) { /* nichts weiter moeglich */ }
  }
  offen.clear();
}
process.on("exit", stelleAllesWiederHer);
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { stelleAllesWiederHer(); process.exit(130); });
}
process.on("uncaughtException", (f) => { stelleAllesWiederHer(); console.error("FATAL:", f); process.exit(1); });

function ergebnis(name, mutationErkannt, detail = "") {
  if (mutationErkannt) { erkannt += 1; console.log(`  ROT (erkannt)  ${name}`); }
  else { loecher += 1; console.log(`  GRUEN (LOCH)   ${name}${detail ? ` — ${detail}` : ""}`); }
}

function fuehreTestAus(testDatei) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", testDatei)], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 300000,
    env: {
      ...process.env,
      HELMUT_OFFLINE_TEST: "1",
      HELMUT_SOURCE_MODE: "off",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      HELMUT_TEST_PG_HOST: process.env.HELMUT_TEST_PG_HOST || "/tmp/helmut-pgverify/sock",
      HELMUT_TEST_PG_PORT: process.env.HELMUT_TEST_PG_PORT || "5433"
    }
  });
  return { code: r.status, ausgabe: `${r.stdout || ""}${r.stderr || ""}` };
}

// Fuehrt EINE Mutation aus und meldet, ob der zustaendige Test sie erkennt.
function probe({ name, datei, ersetzungen, test }) {
  const voll = path.join(ROOT, datei);
  const original = fs.readFileSync(voll, "utf8");
  let mutiert = original;
  for (const [alt, neu] of ersetzungen) {
    if (!mutiert.includes(alt)) {
      ergebnis(name, false, `Mutationsanker nicht gefunden: ${String(alt).slice(0, 60)}`);
      return;
    }
    mutiert = mutiert.replace(alt, neu);
  }
  if (mutiert === original) { ergebnis(name, false, "Mutation hat nichts veraendert"); return; }

  offen.set(voll, original);
  try {
    fs.writeFileSync(voll, mutiert);
    const { code, ausgabe } = fuehreTestAus(test);
    // ERKANNT heisst: der Test schlaegt fehl (Exitcode != 0). Ein Test, der die Mutation
    // ueberlebt, traegt die Bedingung nicht.
    const fehlgeschlagen = code !== 0;
    ergebnis(`${name}  [${test}]`, fehlgeschlagen,
      fehlgeschlagen ? "" : `Test blieb gruen (exit ${code}) — ${(ausgabe.match(/PASS \d+\s+FAIL \d+/) || [""])[0]}`);
  } finally {
    fs.writeFileSync(voll, original);
    offen.delete(voll);
  }
}

console.log("Helmut — Mutationsprobe des Korrekturlaufs 2026-08-14/3");
console.log("ROT = Mutation erkannt (gut) · GRUEN = Loch im Testnetz (schlecht)\n");

// ── M1 · DER RELAY FEHLT ────────────────────────────────────────────────────────────────────
// Ohne den unmittelbaren Anstoss bleibt der Folgeauftrag einer Kette liegen, bis der
// Zeitgeber ihn findet. Die Kette traegt sich dann NICHT mehr selbst.
probe({
  name: "M1  Der Relay fehlt (kein Anstoss nach dem Abschluss)",
  datei: "lib/helmut/queue-verbraucher.js",
  ersetzungen: [[
    "      : await (deps.relay || outboxRelay).stosseRelayAn({ env, deps: deps.relayDeps || deps });",
    "      : { angestossen: false, grund: \"MUTATION\" };"
  ]],
  test: "queue-ende-zu-ende-test.js"
});

// ── M2 · MANUELLE TESTPUMPE ─────────────────────────────────────────────────────────────────
// Der alte Fehler: der Test pumpt den Versand selbst und beweist damit den Transport, aber
// NICHT den Antrieb. Wird der echte Relay-Einstiegspunkt durch einen direkten Dispatcheraufruf
// ersetzt, muss der Relay-Test das merken.
probe({
  name: "M2  Manuelle Testpumpe statt echtem Relay-Einstiegspunkt",
  datei: "lib/helmut/lambda-relay.js",
  ersetzungen: [[
    "const outboxRelay = require(\"./outbox-relay\");",
    "const outboxRelay = { relayLauf: async () => ({ gelaufen: false, versendet: 0 }),\n"
      + "  relaySchleife: async () => ({ laeufe: 0, versendet: 0 }),\n"
      + "  zeitgeberLauf: async () => ({ laeufe: 0, versendet: 0, abgleich: { gelaufen: false } }) };"
  ]],
  test: "queue-ende-zu-ende-test.js"
});

// ── M3 · PLATZHALTER-LAMBDA ─────────────────────────────────────────────────────────────────
// Der urspruengliche Zustand: die Vorlage trug einen Code-Block, der beim Ausrollen absichtlich
// scheiterte. Kehrt er zurueck, ist die Funktion nicht bereitstellbar.
probe({
  name: "M3  Platzhalter statt echtem Paket (Lambda nicht bereitstellbar)",
  datei: "infra/aws/helmut-auftrags-queue.yaml",
  ersetzungen: [[
    "      Code:\n        S3Bucket: !Ref PaketBucket\n        S3Key: !Ref PaketSchluessel",
    "      Code:\n        ZipFile: |\n          exports.handler = async () => { throw new Error('Platzhalter'); };"
  ]],
  test: "infrastruktur-definition-test.js"
});

// ── M4 · FALSCHER HANDLERPFAD ───────────────────────────────────────────────────────────────
// Der haeufigste stille Deployment-Fehler: der Handler zeigt auf eine Datei, die im Paket
// nicht existiert. Die Funktion startet dann nie — und niemand merkt es beim Bauen.
probe({
  name: "M4  Falscher Handlerpfad (zeigt auf nichts im Paket)",
  datei: "infra/aws/helmut-auftrags-queue.yaml",
  ersetzungen: [["Handler: lambda/relay.handler", "Handler: src/relay.handler"]],
  test: "lambda-paket-test.js"
});

// ── M5 · FEHLENDER SSM-STARTWEG ─────────────────────────────────────────────────────────────
// Ohne den Startweg bekommt die Lambda-Funktion in AWS nie eine Supabase-Verbindung.
probe({
  name: "M5  Der SSM-Startweg entfaellt (keine Supabase-Zugangsdaten)",
  datei: "lib/helmut/queue-verbraucher.js",
  ersetzungen: [[
    "        await konfig.stelleKonfigurationSicher({ env, deps: deps.konfigurationDeps || {} });",
    "        /* MUTATION: Konfiguration wird nicht geladen */"
  ]],
  test: "sqs-lambda-vertrag-test.js"
});

// ── M6 · RUECKFALL AUF DEN LOKALSPEICHER ────────────────────────────────────────────────────
// Der schlimmste denkbare Ausgang: der Verbraucher "erledigt" Auftraege im lokalen Speicher,
// die in Supabase nie ankommen.
probe({
  name: "M6  Stiller Rueckfall auf den lokalen Speicher (Arbeit verschwindet)",
  datei: "lib/helmut/lambda-konfiguration.js",
  ersetzungen: [[
    "    env.HELMUT_STORAGE_BACKEND = \"supabase\";",
    "    /* MUTATION: Backend bleibt lokal */"
  ]],
  test: "lambda-paket-test.js"
});

// ── M7 · FEHLENDES kms:Decrypt ──────────────────────────────────────────────────────────────
// Ein Produzent einer mit kundeneigenem KMS-Schluessel verschluesselten Queue braucht
// kms:GenerateDataKey UND kms:Decrypt. Fehlt Decrypt, schlaegt jedes SendMessage fehl.
probe({
  name: "M7  Dem Relay fehlt kms:Decrypt (kein Versand moeglich)",
  datei: "infra/aws/helmut-auftrags-queue.yaml",
  ersetzungen: [[
    "                  - 'kms:GenerateDataKey'\n                  - 'kms:Decrypt'\n                Resource: !GetAtt AuftragsQueueSchluessel.Arn\n              - Effect: Allow\n                Action:\n                  - 'ssm:GetParameter'",
    "                  - 'kms:GenerateDataKey'\n                Resource: !GetAtt AuftragsQueueSchluessel.Arn\n              - Effect: Allow\n                Action:\n                  - 'ssm:GetParameter'"
  ]],
  test: "infrastruktur-definition-test.js"
});

// ── M8 · ANBIETERSTEUERUNG ABGEHAENGT ───────────────────────────────────────────────────────
// Der Ausgangsbefund: die Steuerung existierte, hing aber an keinem echten Aufruf.
probe({
  name: "M8  Die Anbietersteuerung haengt an keinem echten Abruf mehr",
  datei: "lib/helmut/crawler.js",
  ersetzungen: [[
    "  if (redirectDepth > 0) return fetchUrlRoh(url, redirectDepth, deps);\n  return anbieterUmschlossen({ url, deps }, (signal) =>\n    fetchUrlRoh(url, redirectDepth, signal ? { ...deps, abbruchSignal: signal } : deps));",
    "  return fetchUrlRoh(url, redirectDepth, deps);"
  ]],
  test: "anbietersteuerung-fachpfad-test.js"
});

// ── M9 · VERLORENE FOLGE- UND WIEDERHOLUNGSAUFTRAEGE ────────────────────────────────────────
// Ohne die Wiedervorlage bleibt die Absicht eines wiederholten Auftrags `bestaetigt` — er
// wartet dann bis zum Mindestalter des Sicherheitsnetzes statt bis zu seinem Backoff.
probe({
  name: "M9  Die Wiedervorlage nach einer Wiederholung entfaellt",
  datei: "lib/helmut/queue-verbraucher.js",
  ersetzungen: [[
    "      : await (deps.erneutVorlegen || ((o) => storage.jobOutboxErneutVorlegen(o)))({\n        jobId: claim.id\n      }).catch((fehler) => ({ uebernommen: false, grund: pipeline.bereinigeFehler(fehler, 120) }));",
    "      : { uebernommen: false, grund: \"MUTATION\" };"
  ]],
  test: "queue-ende-zu-ende-test.js"
});

// ── M10 · CRON-ABHAENGIGKEIT KEHRT ZURUECK ──────────────────────────────────────────────────
// Traegt der Zeitgeber das Sicherheitsnetz nicht mehr, braucht die automatische Reparatur
// eines verlorenen Anstosses wieder den Vercel-Cron.
probe({
  name: "M10 Der Zeitgeber traegt das Sicherheitsnetz nicht mehr (Cron wird wieder noetig)",
  datei: "lib/helmut/outbox-relay.js",
  ersetzungen: [[
    "  let abgleich = { gelaufen: false, grund: \"abgeschaltet\" };\n  if (deps.abgleichAktiv !== false) {",
    "  let abgleich = { gelaufen: false, grund: \"abgeschaltet\" };\n  if (false) {"
  ]],
  test: "queue-ende-zu-ende-test.js"
});

// ── M11 · DIE UMGEBUNGSVARIABLE FEHLT IN DER VORLAGE ───────────────────────────────────────
// GENAU DIESER FEHLER lag vor: der Code war richtig, die Vorlage setzte die Variable nicht,
// und der Test setzte den Ausloeser ein — also fiel es niemandem auf.
probe({
  name: "M11 HELMUT_RELAY_FUNKTION fehlt in der CloudFormation-Vorlage",
  datei: "infra/aws/helmut-auftrags-queue.yaml",
  ersetzungen: [["          HELMUT_RELAY_FUNKTION: !Ref RelayFunktion\n", ""]],
  test: "queue-ende-zu-ende-test.js"
});

// ── M12 · DAS AUFRUFRECHT FEHLT ────────────────────────────────────────────────────────────
// Die Variable steht da, aber die Rolle darf nicht aufrufen: in AWS ein AccessDenied, das
// der Verbraucher schweigend schlucken wuerde.
probe({
  name: "M12 Der Verbraucherrolle fehlt lambda:InvokeFunction",
  datei: "infra/aws/helmut-auftrags-queue.yaml",
  ersetzungen: [[
    "            Action: 'lambda:InvokeFunction'\n            Resource: !GetAtt RelayFunktion.Arn",
    "            Action: 'lambda:GetFunction'\n            Resource: !GetAtt RelayFunktion.Arn"
  ]],
  test: "queue-ende-zu-ende-test.js"
});

// ── M13 · DIE ALIAS-ARN KEHRT ZURUECK ──────────────────────────────────────────────────────
// Eine Alias-ARN im Resource-Feld gewaehrt NICHTS. Sie sieht aber praezise aus — deshalb
// braucht es einen Riegel gegen die FEHLKLASSE, nicht nur gegen den Einzelfall.
probe({
  name: "M13 Alias-ARN statt Schluessel-ARN in einer KMS-Berechtigung",
  datei: "infra/aws/helmut-auftrags-queue.yaml",
  ersetzungen: [[
    "                Resource: !GetAtt ParameterSchluessel.Arn",
    "                Resource: !Sub 'arn:aws:kms:${AWS::Region}:${AWS::AccountId}:alias/aws/ssm'"
  ]],
  test: "infrastruktur-definition-test.js"
});

// ── M14 · FALSCHE SCHLUESSEL-ARN ───────────────────────────────────────────────────────────
// Der Queue-Schluessel statt des Parameter-Schluessels: formal eine Schluessel-ARN, aber die
// falsche — die Entschluesselung der Zugangsdaten scheitert.
probe({
  name: "M14 Falsche Schluessel-ARN (Queue- statt Parameter-Schluessel)",
  datei: "infra/aws/helmut-auftrags-queue.yaml",
  ersetzungen: [[
    "                Resource: !GetAtt ParameterSchluessel.Arn",
    "                Resource: !GetAtt AuftragsQueueSchluessel.Arn"
  ]],
  test: "infrastruktur-definition-test.js"
});

// ── M15 · DER ALTE UNWIRKSAME REGIONSRIEGEL KEHRT ZURUECK ──────────────────────────────────
// GENAU DIESER FEHLER lag vor: `KeyPolicy: !If [IstFrankfurt, ..., !Ref 'AWS::NoValue']`.
// `KeyPolicy` ist bei AWS::KMS::Key OPTIONAL (aws-resource-kms-key.md: "Required: No"); fehlt
// sie, haengt AWS eine Standardrichtlinie an — der Schluessel entsteht trotzdem. Der Riegel
// hielt also NICHTS. Wer ihn wieder einbaut, muss rot werden.
probe({
  name: "M15 Der alte unwirksame KeyPolicy-Riegel (AWS::NoValue) kehrt zurueck",
  datei: "infra/aws/helmut-auftrags-queue.yaml",
  ersetzungen: [[
    "      KeyPolicy:\n        Version: '2012-10-17'\n        Statement:\n"
    + "          - Sid: KontoVerwaltungUndIamAktivierung\n            Effect: Allow\n"
    + "            Principal:\n              AWS: !Sub 'arn:aws:iam::${AWS::AccountId}:root'\n"
    + "            Action: 'kms:*'\n            Resource: '*'\n\n"
    + "  # BEDIENALIAS",
    "      KeyPolicy: !If\n        - IstFrankfurt\n        - Version: '2012-10-17'\n          Statement:\n"
    + "            - Sid: KontoVerwaltungUndIamAktivierung\n              Effect: Allow\n"
    + "              Principal:\n                AWS: !Sub 'arn:aws:iam::${AWS::AccountId}:root'\n"
    + "              Action: 'kms:*'\n              Resource: '*'\n        - !Ref 'AWS::NoValue'\n\n"
    + "  # BEDIENALIAS"
  ]],
  test: "infrastruktur-definition-test.js"
});

// ── M16 · NOCH NICHT VORHANDENE ROLLEN-PRINCIPALS KEHREN ZURUECK ───────────────────────────
// Eine Schluesselrichtlinie, die die beiden Lambda-Rollen als Principal nennt, ist beim
// ERSTEN Anlegen in einem leeren Konto nicht aufloesbar: KMS loest einen Principal beim
// Setzen der Richtlinie auf und weist eine Richtlinie mit unbekanntem Principal zurueck —
// waehrend die Rollen ihrerseits die ARN dieses Schluessels brauchen. Das ist der Zyklus,
// der die Erstbereitstellung unmoeglich macht.
probe({
  name: "M16 Noch nicht vorhandene Rollen-Principals in der Schluesselrichtlinie",
  datei: "infra/aws/helmut-auftrags-queue.yaml",
  ersetzungen: [[
    "            Action: 'kms:*'\n            Resource: '*'\n\n  # BEDIENALIAS",
    "            Action: 'kms:*'\n            Resource: '*'\n"
    + "          - Sid: NurDieBeidenLambdaRollenEntschluesseln\n            Effect: Allow\n"
    + "            Principal:\n              AWS:\n"
    + "                - !GetAtt VerbraucherRolle.Arn\n                - !GetAtt RelayRolle.Arn\n"
    + "            Action: 'kms:Decrypt'\n            Resource: '*'\n\n  # BEDIENALIAS"
  ]],
  test: "infrastruktur-definition-test.js"
});

console.log(`\n== ERGEBNIS ==\nROT (erkannt) ${erkannt}  GRUEN (Loch) ${loecher}  (gesamt ${erkannt + loecher})`);
if (loecher > 0) {
  console.log("MINDESTENS EINE Bedingung wird von keinem Test getragen — das ist ein Testloch.");
}
process.exit(loecher > 0 ? 1 : 0);
