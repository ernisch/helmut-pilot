"use strict";

// Helmut — Test der INFRASTRUKTURDEFINITION (infra/aws/helmut-auftrags-queue.yaml).
// =============================================================================================
// WARUM DIESER TEST: die Vorlage ist in diesem Sprint NICHT ausgerollt — es gibt keine AWS-
// Ressource, gegen die man messen koennte. Damit ihre Zusagen trotzdem verbindlich sind
// (und eine spaetere stille Aenderung auffaellt), werden sie hier gegen den Text geprueft:
//   §1 Region und Datenresidenz
//   §2 Quarantaene (Dead-Letter-Queue) mit begrenzten Zustellversuchen
//   §3 Sichtbarkeitszeit > maximale Bearbeitungsdauer > Lambda-Timeout
//   §4 Serverseitige Verschluesselung
//   §5 Kontrollierte Parallelitaet (doppelt: reservierte Nebenlaeufigkeit + Skalierungsdeckel)
//   §6 Partielle Fehlerantwort
//   §7 Minimale IAM-Rechte (Sender darf NUR senden, Verbraucher darf NICHT senden)
//   §8 Keine Secrets in der Vorlage
//   §9 Der Handlerpfad zeigt auf die echte Datei im Repository
//
// Ein reiner YAML-Texttest ist bewusst gewaehlt: das Repo traegt keinen YAML-Parser als
// Abhaengigkeit, und die geprueften Zusagen sind einzeilige, eindeutige Schluesselwerte.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const VORLAGE = path.join(ROOT, "infra", "aws", "helmut-auftrags-queue.yaml");

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

console.log("Helmut — Infrastrukturdefinition SQS + Lambda (nicht ausgerollt, aber verbindlich)");

check("0.1 Die Vorlage existiert", fs.existsSync(VORLAGE));
const y = fs.readFileSync(VORLAGE, "utf8");
// Zahlenwerte robust auslesen (YAML-Schluessel: Wert).
const zahl = (schluessel) => {
  const treffer = y.match(new RegExp(`^\\s*${schluessel}:\\s*(\\d+)\\s*(?:#.*)?$`, "m"));
  return treffer ? Number(treffer[1]) : null;
};

abschnitt("1 · Region und Datenresidenz");
check("1.1 Die Vorlage nennt keine Nicht-EU-Region",
  !/us-east-1|us-west|ap-southeast|sa-east/.test(y));
check("1.2 Der Code erlaubt ausschliesslich eu-central-1",
  require(path.join(ROOT, "lib/helmut/job-dispatch")).SQS_ERLAUBTE_REGIONEN.length === 1);

abschnitt("2 · Quarantaene mit begrenzten Zustellversuchen");
check("2.1 Es gibt eine Dead-Letter-Queue", /AuftragsQuarantaene:\s*\n\s*Type:\s*AWS::SQS::Queue/.test(y));
check("2.2 Die Hauptqueue verweist per RedrivePolicy darauf",
  /RedrivePolicy:/.test(y) && /deadLetterTargetArn:\s*!GetAtt AuftragsQuarantaene\.Arn/.test(y));
const maxReceive = zahl("maxReceiveCount");
check("2.3 Die Zustellversuche sind BEGRENZT (1..10)", maxReceive !== null && maxReceive >= 1 && maxReceive <= 10,
  String(maxReceive));
check("2.4 Die Quarantaene bewahrt lange genug auf (>= 7 Tage)",
  zahl("MessageRetentionPeriod") !== null && y.includes("1209600"));

abschnitt("3 · Sichtbarkeitszeit > Bearbeitungsdauer > Auftragsbudget");
const sichtbarkeit = zahl("VisibilityTimeout");
const timeout = zahl("Timeout");
const verbraucher = require(path.join(ROOT, "lib/helmut/queue-verbraucher"));
const auftragsBudgetS = verbraucher.VERBRAUCHER_BUDGET_MS / 1000;
check("3.1 Sichtbarkeitszeit ist gesetzt", sichtbarkeit !== null, String(sichtbarkeit));
check("3.2 Sichtbarkeitszeit > Lambda-Timeout (eine laufende Verarbeitung wird nie doppelt zugestellt)",
  sichtbarkeit > timeout, `${sichtbarkeit} vs ${timeout}`);
check("3.3 Lambda-Timeout > Auftragsbudget des Verbrauchers",
  timeout > auftragsBudgetS, `${timeout} vs ${auftragsBudgetS}`);
check("3.4 Sichtbarkeitszeit ist mindestens doppelt so gross wie das Lambda-Timeout",
  sichtbarkeit >= 2 * timeout, `${sichtbarkeit} vs 2x${timeout}`);

abschnitt("4 · Serverseitige Verschluesselung");
check("4.1 Ein eigener KMS-Schluessel wird angelegt", /AWS::KMS::Key/.test(y));
check("4.2 Schluesselrotation ist aktiv", /EnableKeyRotation:\s*true/.test(y));
check("4.3 BEIDE Queues sind verschluesselt",
  (y.match(/KmsMasterKeyId:\s*!Ref AuftragsQueueSchluessel/g) || []).length === 2);

abschnitt("5 · Kontrollierte Parallelitaet");
check("5.1 Die Lambda-Funktion hat eine reservierte Nebenlaeufigkeit",
  /ReservedConcurrentExecutions:\s*!Ref MaxParallelitaet/.test(y));
check("5.2 Auch die Ereignisquelle ist gedeckelt",
  /ScalingConfig:/.test(y) && /MaximumConcurrency:\s*!Ref MaxParallelitaet/.test(y));
check("5.3 Der Standardwert ist klein und begruendet (<= 20)",
  (y.match(/MaxParallelitaet:[\s\S]{0,200}?Default:\s*(\d+)/) || [])[1] <= 20);

abschnitt("6 · Partielle Fehlerantwort");
check("6.1 Die Ereignisquelle meldet einzelne Fehler",
  /FunctionResponseTypes:\s*\n\s*-\s*ReportBatchItemFailures/.test(y));
check("6.2 Der Handler liefert batchItemFailures",
  fs.readFileSync(path.join(ROOT, "lib/helmut/lambda-verbraucher.js"), "utf8").includes("batchItemFailures"));

abschnitt("7 · Minimale IAM-Rechte");
// Kommentare entfernen: die Vorlage BEGRUENDET ausdruecklich, welche Rechte sie NICHT
// vergibt ("KEIN sqs:SendMessage") — ein reiner Textvergleich wuerde genau diese
// Begruendung als Verstoss werten.
const ohneKommentar = (t) => t.split("\n").map((z) => z.replace(/(^|\s)#.*$/, "$1")).join("\n");
const senderBlock = ohneKommentar(y.slice(y.indexOf("SenderBenutzer:"), y.indexOf("VerbraucherRolle:")));
const verbraucherBlock = ohneKommentar(y.slice(y.indexOf("VerbraucherRolle:"), y.indexOf("VerbraucherLogGruppe:")));
check("7.1 Der Sender darf NUR senden (kein Empfangen, kein Loeschen, kein Purge)",
  senderBlock.includes("sqs:SendMessage")
  && !/sqs:ReceiveMessage|sqs:DeleteMessage|sqs:PurgeQueue|sqs:\*/.test(senderBlock));
check("7.2 Der Verbraucher darf NICHT senden (Folgeauftraege entstehen in der Outbox)",
  !/sqs:SendMessage/.test(verbraucherBlock));
check("7.3 Der Verbraucher darf empfangen und loeschen",
  verbraucherBlock.includes("sqs:ReceiveMessage") && verbraucherBlock.includes("sqs:DeleteMessage"));
// Die KMS-SCHLUESSELRICHTLINIE enthaelt bewusst `kms:*` fuer den Konto-Root: ohne diese
// Anweisung ist ein KMS-Schluessel dauerhaft unverwaltbar (AWS-Standard). Geprueft werden
// deshalb die beiden IAM-Richtlinien, ueber die Helmut selbst zugreift.
check("7.4 Keine Wildcard-Rechte in den Helmut-IAM-Richtlinien",
  !/(sqs|kms):\*/.test(senderBlock) && !/(sqs|kms):\*/.test(verbraucherBlock));
check("7.6 Die KMS-Wildcard steht ausschliesslich in der Schluesselrichtlinie des Konto-Roots",
  (y.match(/kms:\*/g) || []).length === 1
  && /Principal:\s*\n\s*AWS:\s*!Sub 'arn:aws:iam::\$\{AWS::AccountId\}:root'\s*\n\s*Action:\s*'kms:\*'/.test(y));
check("7.5 Die Rechte zeigen auf GENAU diese Queue (kein Ressourcen-Sternchen)",
  !/Resource:\s*'\*'[\s\S]{0,80}sqs/.test(y));

abschnitt("8 · Keine Secrets in der Vorlage");
check("8.1 Kein Schluessel-, Token- oder Passwortwert im Klartext",
  !/(service_role_key|SUPABASE_SERVICE_ROLE_KEY:\s*\S|password:|secret:\s*\S)/i.test(y));
check("8.2 Secrets kommen zur Laufzeit aus SSM", /ssm:GetParameter/.test(y));
check("8.3 Die Umgebungsvariablen tragen nur PARAMETERNAMEN, keine Werte",
  /HELMUT_SUPABASE_KEY_PARAMETER:\s*!Ref/.test(y));

abschnitt("9 · Der Handlerpfad zeigt auf echten Code");
check("9.1 Handler ist lambda/index.handler", /Handler:\s*lambda\/index\.handler/.test(y));
check("9.2 Die Datei existiert im Repository", fs.existsSync(path.join(ROOT, "lambda", "index.js")));
check("9.3 Sie exportiert einen handler",
  typeof require(path.join(ROOT, "lambda", "index.js")).handler === "function");
check("9.4 Die Vorlage benennt ausdruecklich, dass sie NICHT ausgerollt ist",
  /NICHT ausgerollt|nicht ausgerollt/.test(y));

console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
process.exit(fail > 0 ? 1 : 0);
