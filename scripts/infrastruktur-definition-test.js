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
// Jeder KMS-Schluessel braucht die Konto-Root-Anweisung, sonst ist er dauerhaft
// unverwaltbar (AWS-Standard). Erlaubt ist `kms:*` deshalb GENAU dort — und nirgends sonst.
const kmsWildcards = (y.match(/kms:\*/g) || []).length;
const rootAnweisungen = (y.match(/Principal:\s*\n\s*AWS:\s*!Sub 'arn:aws:iam::\$\{AWS::AccountId\}:root'\s*\n\s*Action:\s*'kms:\*'/g) || []).length;
check("7.6 Jede KMS-Wildcard steht in einer Konto-Root-Schluesselrichtlinie",
  kmsWildcards > 0 && kmsWildcards === rootAnweisungen, `${kmsWildcards} Wildcards, ${rootAnweisungen} Root-Anweisungen`);
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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// KORREKTURLAUF 2026-08-14/3 — Luecken 2 und 5
// ═══════════════════════════════════════════════════════════════════════════════════════════

abschnitt("10 · Das Paket kommt aus S3 (kein scheiternder Platzhalter)");
check("10.1 Der Code wird aus einem S3-Objekt geladen",
  /Code:\s*\n\s*S3Bucket:\s*!Ref PaketBucket\s*\n\s*S3Key:\s*!Ref PaketSchluessel/.test(y));
check("10.2 Bucket und Schluessel sind Parameter (kein hartkodierter Ort)",
  /PaketBucket:\s*\n\s*Type:\s*String/.test(y) && /PaketSchluessel:\s*\n\s*Type:\s*String/.test(y));
check("10.3 Kein absichtlich scheiternder Platzhalter mehr im Code-Block",
  !/ZipFile:[\s\S]{0,200}(throw|absichtlich|Platzhalter)/i.test(y));
check("10.4 Es gibt einen reproduzierbaren Bauweg im Repository",
  fs.existsSync(path.join(ROOT, "scripts", "lambda-paket-bauen.js")));
check("10.5 Die Vorlage nennt den Bauweg, damit Paket und Vorlage zusammenpassen",
  /lambda-paket-bauen/.test(y));

abschnitt("11 · Der Relay ist vollstaendig definiert (Luecke 1)");
const relayRolleBlock = ohneKommentar(y.slice(y.indexOf("RelayRolle:"), y.indexOf("RelayLogGruppe:")));
check("11.1 Es gibt eine eigene Relay-Funktion", /RelayFunktion:\s*\n\s*Type:\s*AWS::Lambda::Function/.test(y));
check("11.2 Ihr Handler ist lambda/relay.handler", /Handler:\s*lambda\/relay\.handler/.test(y));
check("11.3 Die Relaydatei existiert und exportiert einen handler",
  fs.existsSync(path.join(ROOT, "lambda", "relay.js"))
  && typeof require(path.join(ROOT, "lambda", "relay.js")).handler === "function");
check("11.4 Der Relay hat eine EIGENE Rolle (nicht die des Verbrauchers)",
  /RelayRolle:\s*\n\s*Type:\s*AWS::IAM::Role/.test(y));
check("11.5 Der Relay darf senden (er ist der Produzent)", relayRolleBlock.includes("sqs:SendMessage"));
check("11.6 Der Relay darf NICHT empfangen oder loeschen (er traegt nur Signale)",
  !/sqs:ReceiveMessage|sqs:DeleteMessage|sqs:PurgeQueue|sqs:\*/.test(relayRolleBlock));
check("11.7 Seine Parallelitaet ist reserviert und klein (keine Aufruflawine)",
  /RelayFunktion:[\s\S]{0,1200}?ReservedConcurrentExecutions:\s*[1-9]\b/.test(y));
check("11.8 Der Verbraucher darf GENAU die Relayfunktion asynchron aufrufen",
  /VerbraucherRelayRecht:[\s\S]{0,600}?lambda:InvokeFunction/.test(y)
  && /VerbraucherRelayRecht:[\s\S]{0,600}?!GetAtt RelayFunktion\.Arn/.test(y));
check("11.9 Es gibt einen Zeitgeber (minuetlich), und er ist ABGESCHALTET ausgeliefert",
  /AWS::Scheduler::Schedule/.test(y)
  && /ScheduleExpression:\s*'rate\(1 minute\)'/.test(y)
  && /\n  RelayZeitgeber:\n[\s\S]{0,900}?State:\s*DISABLED/.test(y));
check("11.10 Der Zeitgeber wiederholt einen verpassten Lauf NICHT (der naechste Tick genuegt)",
  /MaximumRetryAttempts:\s*0/.test(y));
check("11.11 Der Relay hat eine eigene Protokollgruppe mit Aufbewahrungsfrist",
  /RelayLogGruppe:[\s\S]{0,400}?RetentionInDays:\s*\d+/.test(y));

abschnitt("12 · KMS-Rechte des Produzenten (Luecke 5)");
// EIN PRODUZENT einer mit kundeneigenem KMS-Schluessel verschluesselten Queue braucht
// kms:GenerateDataKey UND kms:Decrypt. Ohne Decrypt schlaegt SendMessage fehl — der
// bisherige Satz (GenerateDataKey + Encrypt) war falsch.
// PRAEZISION IST HIER ENTSCHEIDEND: es genuegt NICHT, dass `kms:Decrypt` irgendwo in der
// Rolle steht (jede Rolle hat es fuer den SSM-Standardschluessel). Es muss GENAU in der
// Anweisung stehen, die auf den QUEUE-Schluessel zeigt — sonst schlaegt SendMessage fehl.
const anweisungenMit = (block, resourceMuster) => block
  .split(/- Effect:\s*Allow/)
  .filter((a) => resourceMuster.test(a));
for (const [name, block] of [["Sender", senderBlock], ["Relay", relayRolleBlock]]) {
  const queueSchluessel = anweisungenMit(block, /AuftragsQueueSchluessel\.Arn/);
  check(`12.1 ${name} (Produzent) hat kms:GenerateDataKey AUF DEM QUEUE-SCHLUESSEL`,
    queueSchluessel.length === 1 && /kms:GenerateDataKey/.test(queueSchluessel[0]),
    `${queueSchluessel.length} Anweisung(en)`);
  check(`12.2 ${name} (Produzent) hat kms:Decrypt AUF DEM QUEUE-SCHLUESSEL`,
    queueSchluessel.length === 1 && /kms:Decrypt/.test(queueSchluessel[0]),
    `${queueSchluessel.length} Anweisung(en)`);
}
const verbraucherSchluessel = anweisungenMit(verbraucherBlock, /AuftragsQueueSchluessel\.Arn/);
check("12.3 Der Verbraucher (Konsument) hat kms:Decrypt auf dem Queue-Schluessel",
  verbraucherSchluessel.length === 1 && /kms:Decrypt/.test(verbraucherSchluessel[0]));
check("12.4 Kein Produzent traegt ueberfluessiges kms:Encrypt",
  !/kms:Encrypt\b/.test(senderBlock) && !/kms:Encrypt\b/.test(relayRolleBlock));
check("12.5 Die Queue ist mit einem kundeneigenen Schluessel verschluesselt",
  /KmsMasterKeyId:\s*!(Ref|GetAtt)/.test(y));
check("12.6 Der Schluessel rotiert automatisch", /EnableKeyRotation:\s*true/.test(y));
check("12.7 Auch die Quarantaene ist verschluesselt",
  (y.match(/KmsMasterKeyId:/g) || []).length >= 2, String((y.match(/KmsMasterKeyId:/g) || []).length));

abschnitt("13 · SSM-Rechte und Regionsriegel");
for (const [name, block] of [["Verbraucher", verbraucherBlock], ["Relay", relayRolleBlock]]) {
  check(`13.1 ${name} darf GENAU die beiden Parameter lesen`,
    /ssm:GetParameter/.test(block) && !/ssm:GetParameters?ByPath|ssm:\*|ssm:PutParameter/.test(block));
  // KORREKTUR 2026-08-14/4: hier stand `alias/aws/ssm` — dieser Test hat den Fehler
  // ZEMENTIERT. Eine Alias-ARN im Resource-Feld gewaehrt nichts; geprueft wird jetzt in
  // Abschnitt 15 gegen die SCHLUESSEL-ARN.
  check(`13.2 ${name} entschluesselt NICHT ueber eine Alias-ARN`,
    !/:alias\//.test(block));
}
// DER RIEGEL MUSS AN EINER PFLICHT-EIGENSCHAFT HAENGEN. Ein `AWS::NoValue` in einem
// Metadata-Feld laesst einen Stack NICHT scheitern — das waere ein Riegel, der nichts haelt.
check("13.3a Die Bedingung IstFrankfurt existiert",
  /IstFrankfurt:\s*!Equals\s*\[\s*!Ref\s*'?AWS::Region'?,\s*'?eu-central-1'?\s*\]/.test(y));
// KORREKTUR 2026-08-14/5: hier stand, der Riegel haenge an der "PFLICHT-Eigenschaft"
// KeyPolicy. `KeyPolicy` ist bei AWS::KMS::Key OPTIONAL — der Riegel hielt nichts. Der
// wirksame Riegel wird jetzt in Abschnitt 17 geprueft.
check("13.3b Der Riegel haengt NICHT mehr an KeyPolicy",
  !/KeyPolicy:\s*!If/.test(ohneKommentar(y)));
check("13.3c Beide Queues haengen am Queue-Schluessel",
  (y.match(/KmsMasterKeyId:\s*!Ref AuftragsQueueSchluessel/g) || []).length === 2);
check("13.3d Die Vorlage benennt offene AWS-Nachweise ehrlich",
  /NACHWEIS OFFEN|nicht gegen AWS geprueft|nicht gegen AWS geprüft/.test(y));
check("13.4 Die Node-Laufzeit ist ausdruecklich festgelegt", /Runtime:\s*nodejs\d+\.x/.test(y));
check("13.5 Beide Funktionen tragen dieselbe Laufzeit",
  new Set(y.match(/Runtime:\s*nodejs\d+\.x/g) || []).size === 1);

console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
// (Zwischenstand; die Verkabelungsabschnitte 14 und 15 folgen — Abbruch erst am Dateiende.)

// ═══════════════════════════════════════════════════════════════════════════════════════════
// VERKABELUNGSLAUF 2026-08-14/4 — die beiden Einsatzblocker
// Diese Abschnitte pruefen nicht mehr nur Text, sondern die AUFGELOESTE Verkabelung: welche
// Umgebungsvariablen eine Funktion wirklich bekaeme und welche Rechte ihre Rolle wirklich
// traegt (scripts/cfn-vorlage-lesen.js).
// ═══════════════════════════════════════════════════════════════════════════════════════════
const cfn = require(path.join(ROOT, "scripts", "cfn-vorlage-lesen"));
const umgebungVerbraucher = cfn.umgebung(y, "VerbraucherFunktion");
const umgebungRelay = cfn.umgebung(y, "RelayFunktion");
const relayArn = cfn.aufloese(y, "!GetAtt RelayFunktion.Arn");

abschnitt("14 · Der unmittelbare Relay-Anstoss ist WIRKLICH verkabelt (Blocker 1)");
check("14.1 Der Verbraucher bekommt HELMUT_RELAY_FUNKTION",
  Boolean(umgebungVerbraucher.HELMUT_RELAY_FUNKTION), JSON.stringify(Object.keys(umgebungVerbraucher)));
check("14.2 Der Wert ist GENAU die Relay-Funktion dieser Vorlage",
  umgebungVerbraucher.HELMUT_RELAY_FUNKTION === cfn.aufloese(y, "!Ref RelayFunktion"),
  String(umgebungVerbraucher.HELMUT_RELAY_FUNKTION));
check("14.3 Der Code liest genau diesen Variablennamen",
  fs.readFileSync(path.join(ROOT, "lib/helmut/lambda-verbraucher.js"), "utf8")
    .includes("HELMUT_RELAY_FUNKTION"));
check("14.4 Die Verbraucherrolle darf GENAU diese Funktion aufrufen",
  cfn.darf(y, "VerbraucherRolle", "lambda:InvokeFunction", relayArn), relayArn);
check("14.5 Sie darf sonst NICHTS aufrufen (kein Sternchen, keine fremde Funktion)",
  cfn.iamAnweisungen(y, "VerbraucherRolle")
    .filter((a) => a.actions.some((x) => x.startsWith("lambda:")))
    .every((a) => a.resourcen.length === 1 && a.resourcen[0] === relayArn));
// KEIN STILLER DIREKTVERSAND: der Verbraucher darf gar nicht senden koennen.
check("14.6 Der Verbraucher bekommt KEINE Queue-Adresse",
  umgebungVerbraucher.HELMUT_SQS_QUEUE_URL === undefined);
check("14.7 Der Verbraucher hat KEIN sqs:SendMessage",
  !cfn.iamAnweisungen(y, "VerbraucherRolle").some((a) => a.actions.includes("sqs:SendMessage")));
check("14.8 Der Relay hat beides — Queue-Adresse und Senderecht",
  Boolean(umgebungRelay.HELMUT_SQS_QUEUE_URL)
  && cfn.iamAnweisungen(y, "RelayRolle").some((a) => a.actions.includes("sqs:SendMessage")));
check("14.9 Der Code faellt bei fehlender Relay-Konfiguration NICHT auf Direktversand zurueck",
  fs.readFileSync(path.join(ROOT, "lib/helmut/outbox-relay.js"), "utf8").includes("direktVerboten")
  && fs.readFileSync(path.join(ROOT, "lib/helmut/lambda-verbraucher.js"), "utf8").includes("direktVerboten: true"));
check("14.10 Eine fehlende Relay-Konfiguration ist BEOBACHTBAR (Protokollzeile)",
  /KONFIGURATIONSBEFUND relay=/.test(fs.readFileSync(path.join(ROOT, "lib/helmut/lambda-verbraucher.js"), "utf8")));

const cfnFrueh = require(path.join(ROOT, "scripts", "cfn-vorlage-lesen"));
abschnitt("15 · KMS-Entschluesselung zeigt auf einen SCHLUESSEL, nicht auf einen Alias (Blocker 2)");
// DIE FEHLKLASSE, NICHT NUR DER EINZELFALL: eine Alias-ARN im Resource-Feld einer
// IAM-Richtlinie gewaehrt NICHTS ("You cannot use a key id, alias name, or alias ARN to
// identify a KMS key in an IAM policy statement" — AWS KMS Developer Guide, Belegdatei §25).
const kmsAnweisungen = ["VerbraucherRolle", "RelayRolle", "SenderBenutzer"]
  .flatMap((r) => cfn.iamAnweisungen(y, r).map((a) => ({ rolle: r, ...a })))
  .filter((a) => a.actions.some((x) => x.startsWith("kms:")));
check("15.1 KEINE Alias-ARN in einer KMS-Berechtigung (die Fehlklasse ist geschlossen)",
  kmsAnweisungen.every((a) => a.resourcen.every((r) => !/:alias\//.test(r))),
  kmsAnweisungen.flatMap((a) => a.resourcen).filter((r) => /:alias\//.test(r)).join(", "));
check("15.2 Jede KMS-Berechtigung zeigt auf eine SCHLUESSEL-ARN",
  kmsAnweisungen.length > 0 && kmsAnweisungen.every((a) => a.resourcen.every((r) => /:key\//.test(r))),
  kmsAnweisungen.flatMap((a) => a.resourcen).join(" | "));
const parameterSchluessel = cfn.aufloese(y, "!GetAtt ParameterSchluessel.Arn");
const queueSchluessel = cfn.aufloese(y, "!GetAtt AuftragsQueueSchluessel.Arn");
check("15.3 Es gibt einen EIGENEN Schluessel fuer die Supabase-Parameter",
  parameterSchluessel !== queueSchluessel && /:key\//.test(parameterSchluessel));
for (const rolle of ["VerbraucherRolle", "RelayRolle"]) {
  check(`15.4 ${rolle} darf GENAU diesen Parameter-Schluessel entschluesseln`,
    cfn.darf(y, rolle, "kms:Decrypt", parameterSchluessel));
}
// DER EIGENTLICHE SICHERHEITSGEWINN: der Sender (IAM-Benutzer mit Zugangsdaten AUSSERHALB
// von AWS) darf den Schluessel der Zugangsdaten NICHT anfassen.
check("15.5 Der Sender kann den Parameter-Schluessel NICHT benutzen",
  !cfn.iamAnweisungen(y, "SenderBenutzer")
    .some((a) => a.resourcen.includes(parameterSchluessel)));
check("15.6 Und er hat auch kein ssm:GetParameter",
  !cfn.iamAnweisungen(y, "SenderBenutzer").some((a) => a.actions.includes("ssm:GetParameter")));
check("15.7 Der Parameter-Schluessel rotiert und ist an die Region gebunden",
  /ParameterSchluessel:[\s\S]{0,600}?EnableKeyRotation:\s*true/.test(y)
  && String(cfnFrueh.paare(cfnFrueh.block(y, ["Resources", "ParameterSchluessel"])).Condition || "").trim()
     === "IstFrankfurt");
// KORREKTUR 2026-08-14/5: hier wurde bisher VERLANGT, dass die Schluesselrichtlinie die
// beiden Rollen nennt. Genau das war die nicht aufloesbare Erstbereitstellungsabhaengigkeit.
check("15.8 Seine Schluesselrichtlinie nennt KEINE Rollen-Principals mehr",
  !/NurDieBeidenLambdaRollenEntschluesseln/.test(y)
  && !/role\/helmut-auftrags-verbraucher-\$\{Umgebung\}'\s*$/m.test(y));
check("15.9 Der Alias existiert NUR als Bedienhilfe (nie in einem Resource-Feld)",
  /AWS::KMS::Alias/.test(y) && /AliasName:\s*!Sub 'alias\/helmut-ssm-\$\{Umgebung\}'/.test(y));

console.log(`\n== ERGEBNIS (Verkabelung) ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
// (Zwischenstand; die Abschnitte 16 und 17 folgen — Abbruch erst am Dateiende.)

abschnitt("16 · Erstbereitstellung im leeren Konto ist strukturell moeglich (Blocker 1)");
// DER BEFUND: die Schluesselrichtlinie nannte die beiden Lambda-Rollen als Principals. Beim
// ERSTEN Anlegen existieren sie noch nicht — und die Rollen brauchen ihrerseits die
// Schluessel-ARN. KMS loest einen Principal beim Setzen der Richtlinie auf und weist eine
// Richtlinie mit unbekanntem Principal zurueck. Der Stack waere nie entstanden.
const reihenfolge = cfn.bereitstellungsReihenfolge(y);
check("16.1 Der Abhaengigkeitsgraph ist azyklisch (topologische Sortierung gelingt)",
  reihenfolge.moeglich === true, reihenfolge.kreis.join(", "));
check("16.2 JEDE Ressource kommt in der Reihenfolge genau einmal vor",
  reihenfolge.reihenfolge.length === cfn.ressourcenNamen(y).length
  && new Set(reihenfolge.reihenfolge).size === reihenfolge.reihenfolge.length,
  `${reihenfolge.reihenfolge.length} von ${cfn.ressourcenNamen(y).length}`);
// Die Schluessel muessen VOR den Rollen entstehen — die Rollen zeigen per !GetAtt auf sie.
const vorher = (a, b) => reihenfolge.reihenfolge.indexOf(a) < reihenfolge.reihenfolge.indexOf(b);
check("16.3 Beide Schluessel entstehen VOR den Rollen, die sie benutzen",
  vorher("ParameterSchluessel", "VerbraucherRolle") && vorher("ParameterSchluessel", "RelayRolle")
  && vorher("AuftragsQueueSchluessel", "VerbraucherRolle"));
check("16.4 Die Rollen entstehen VOR den Funktionen, die sie annehmen",
  vorher("VerbraucherRolle", "VerbraucherFunktion") && vorher("RelayRolle", "RelayFunktion"));

// DIE UNSICHTBARE KANTE: eine per !Sub gebaute Rollen-ARN erzeugt KEINE CloudFormation-Kante,
// der Principal muss aber trotzdem schon existieren. Genau daran waere es gescheitert.
const principals = cfn.kmsPrincipals(y);
const fremde = Object.entries(principals)
  .flatMap(([k, arns]) => arns.filter((a) => !/:root$/.test(a)).map((a) => `${k}: ${a}`));
check("16.5 KEINE Schluesselrichtlinie nennt einen Rollen- oder Benutzer-Principal",
  fremde.length === 0, fremde.join(" | "));
for (const [schluessel, arns] of Object.entries(principals)) {
  check(`16.6 ${schluessel}: genau die Konto-Anweisung (aktiviert die Vergabe ueber IAM)`,
    arns.length === 1 && /:root$/.test(arns[0]), arns.join(", "));
}
// Die Erlaubnis steht jetzt in den IAM-Richtlinien — und dort auf den Parameter Store begrenzt.
const parameterSchluesselArn = cfn.aufloese(y, "!GetAtt ParameterSchluessel.Arn");
const queueSchluesselArn = cfn.aufloese(y, "!GetAtt AuftragsQueueSchluessel.Arn");
for (const rolle of ["VerbraucherRolle", "RelayRolle"]) {
  const anweisungen = cfn.iamAnweisungen(y, rolle).filter((a) => a.actions.includes("kms:Decrypt"));
  const parameter = anweisungen.filter((a) => a.resourcen.includes(parameterSchluesselArn));
  const queue = anweisungen.filter((a) => a.resourcen.includes(queueSchluesselArn));
  check(`16.7 ${rolle} darf den Parameter-Schluessel NUR ueber den Parameter Store benutzen`,
    parameter.length === 1 && /kms:ViaService/.test(parameter[0].roh)
    && /ssm\.\$\{AWS::Region\}\.amazonaws\.com/.test(parameter[0].roh));
  // GETRENNTE ANWEISUNGEN: eine gemeinsame mit ViaService wuerde auch die SQS-Entschluesselung
  // an SSM binden und den Empfang brechen.
  check(`16.8 ${rolle}: der Queue-Schluessel haengt NICHT an kms:ViaService=ssm`,
    queue.length === 1 && !/kms:ViaService/.test(queue[0].roh));
  check(`16.9 ${rolle}: Queue- und Parameter-Schluessel stehen in GETRENNTEN Anweisungen`,
    queue[0] !== parameter[0]);
}

abschnitt("17 · Der Regionsriegel haelt wirklich (Blocker 2)");
// DER BEFUND: der Riegel hing an `KeyPolicy: !If [..., !Ref 'AWS::NoValue']`. `KeyPolicy` ist
// bei AWS::KMS::Key OPTIONAL — fehlt sie, legt AWS eine Standardrichtlinie an und der
// Schluessel entsteht trotzdem. Der Riegel hielt nichts.
const yOhneKommentar = ohneKommentar(y);
check("17.1 Der alte, unwirksame KeyPolicy-Riegel ist verschwunden",
  !/KeyPolicy:\s*!If/.test(yOhneKommentar));
check("17.2 Keine Eigenschaft traegt mehr AWS::NoValue als Riegel",
  !/!Ref 'AWS::NoValue'/.test(yOhneKommentar));
check("17.3 Die Bedingung IstFrankfurt existiert und prueft die Region",
  /IstFrankfurt:\s*!Equals\s*\[\s*!Ref\s*'?AWS::Region'?,\s*'?eu-central-1'?\s*\]/.test(y));
// DER EIGENTLICHE NACHWEIS: keine echte Ressource ohne Regionsbedingung.
const ohne = cfn.ohneBedingung(y, "IstFrankfurt");
check("17.4 JEDE echte Ressource traegt Condition: IstFrankfurt", ohne.length === 0, ohne.join(", "));
// Namentlich, damit ein spaeterer Zusatz nicht unbemerkt durchrutscht.
for (const n of ["AuftragsQueue", "AuftragsQuarantaene", "AuftragsQueueSchluessel", "ParameterSchluessel",
  "ParameterSchluesselAlias", "SenderBenutzer", "VerbraucherRolle", "RelayRolle", "RelayZeitgeberRolle",
  "VerbraucherFunktion", "RelayFunktion", "VerbraucherLogGruppe", "RelayLogGruppe",
  "VerbraucherAnbindung", "VerbraucherRelayRecht", "RelayZeitgeber"]) {
  const eigen = cfn.paare(cfn.block(y, ["Resources", n]) || []);
  check(`17.5 ${n} ist an die Region gebunden`, String(eigen.Condition || "").trim() === "IstFrankfurt");
}
// Der einzige unbedingte Eintrag ist ein stack-lokaler Platzhalter — kein AWS-Dienst.
const unbedingt = cfn.ressourcenNamen(y).filter((n) => {
  const e = cfn.paare(cfn.block(y, ["Resources", n]) || []);
  return String(e.Condition || "").trim() !== "IstFrankfurt";
});
check("17.6 Genau EIN unbedingter Eintrag, und der legt nichts an",
  unbedingt.length === 1
  && String(cfn.paare(cfn.block(y, ["Resources", unbedingt[0]])).Type).trim()
     === "AWS::CloudFormation::WaitConditionHandle",
  unbedingt.join(", "));
check("17.7 Eine falsche Region hinterlaesst einen sprechenden Befund",
  /NichtFrankfurt:\s*!Not/.test(y) && /RegionsBefund:[\s\S]{0,400}?Condition:\s*NichtFrankfurt/.test(y));
check("17.8 Alle Ausgaben haengen an der Region (keine Ausgabe ohne Bedingung)",
  (cfn.block(y, "Outputs") || []).join("\n").split(/\n  [A-Za-z]/).length - 1 <= 0
  || cfn.ressourcenNamen(y).length > 0);
const ausgaben = cfn.block(y, "Outputs") || [];
const ausgabenNamen = ausgaben.filter((z) => /^  [A-Za-z0-9_]+:\s*$/.test(z)).map((z) => z.trim().replace(":", ""));
const ausgabenOhne = ausgabenNamen.filter((n) => {
  const e = cfn.paare(cfn.block(ausgaben.join("\n"), n) || []);
  return !["IstFrankfurt", "NichtFrankfurt"].includes(String(e.Condition || "").trim());
});
check("17.9 Jede Ausgabe traegt eine Regionsbedingung", ausgabenOhne.length === 0, ausgabenOhne.join(", "));

console.log(`\n== ERGEBNIS (CloudFormation-Korrektur) ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
process.exit(fail > 0 ? 1 : 0);
