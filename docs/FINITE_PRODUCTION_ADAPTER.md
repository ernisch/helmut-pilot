# Endlicher Produktionsadapter: inaktive Quellenverbindung

`synthetik-500-executor.productionStart` delegiert an einen geschlossenen
Serveradapter. Keine HTTP-Route, CLI-Startoption, Aktivierung, Deployment oder
Umgebungsvariable schaltet ihn ein. Die vorhandene CLI bleibt reine Vorbereitung.
Der Aufrufer kann nur `{operationId, commandHash}` eines bereits installierten
Commands angeben. Funktionen, Provider, Auswahlregeln und neue Arbeitsmengen sind
keine Aufrufparameter.

## Konkreter Ablauf

Root installiert einen tatsächlich abgenommenen Command aus privaten Dateien.
Die Dateien müssen mit Pfad, originaler Bytegröße und SHA256 gebunden sein;
reguläre private Dateien und unveränderte Dateiidentität werden überprüft.
`install` prüft echte aktuelle Kostenbücher und einen Auth-CAS-Vorstand. Der
Command wird separat INSERT-only im bestehenden `helmut_store` abgelegt, nicht
als großer Clusterinhalt im kleinen Auth-Store. Ein unbekannter INSERT wird
weder wiederholt noch durch Upsert ersetzt.

Der kleine Auth-CAS enthält `synthetik500DispatchJournal`: dauerhaften Claim,
exakte nächste Arbeitseinheit, Tickets, Sendebuchung, terminale Zustände und
Ausgabereferenzen. Kostenreserve, zentrale Intent-Verbrauchsbuchung und permanentes
Versuchsjournal entstehen im selben CAS. Vor HTTPS wird nach aktuellen Eingabe- und
Profilprüfungen eine einmalige Sendebuchung geschrieben; danach prüft der bestehende
Sender nochmals Body, Route und Zeitfenster. Prozessverlust, Fristablauf und
unklare Buchungen geben keinen Versuch wieder frei. Auth-CAS-Retries wiederholen
ausschließlich reine Zustandsänderungen, keinen externen Aufruf.

U nutzt ausschließlich `understandOneCluster` mit `defaultDeps`. Nur die echten
Resolverleser werden gegen die vorher tatsächlich erfassten endlichen Antworten
geprüft; `getExisting` nutzt dabei den strengen Bestandsleser. Der Provider und die
fenced Schreiber bleiben die Defaults. Alle SOURCE23- und KO60-Werte werden vor
dem Aufruf erneut über begrenzte IDs verglichen. U benötigt den eingeschalteten
nativen CAS; anschließend werden KO60 und die eigenen Links rein lesend bestätigt.

Ein D/R-Command enthält genau 500 Einheiten. Jede Einheit ruft Lage genau einmal
mit `missingOnly` auf. Lage erzeugt D, sichert den vorhandenen Herkunftsbeleg,
wartet auf Kostenabschluss, bindet den nativen Immutable-D-Speicher und leitet
daraus den tatsächlichen REIN-Body ab. Der Adapter sendet REIN niemals separat.
Die vorgebundene Profilversion, Briefingeingabe und Briefingzeit werden über ein
nicht durch JSON fälschbares internes Token an Lage übergeben. Ohne Token behält
Lage seine bisherige Auswahl und Uhrzeit. Ein neuer Berliner Tag stoppt den
endlichen Kontext vor einem weiteren Aufruf.

Die vorhandene Briefing-Materialisierung erhält ausschließlich das schon
gebundene Briefing, keinen Builder. Eine fehlende Morgenquittung wird INSERT-only
im tatsächlichen Slot `morgenlage` an das gespeicherte Paket gebunden. Alle drei
Ergebnispositionen werden zurückgelesen und privat aufbewahrt. Fehlende oder alte
Ausgaben bleiben ausdrücklich unbestätigt. Technische Speicherung erteilt kein
Fachurteil. Auch bei Abbruch zeigt `status` alle 1500 Sollpositionen, einschließlich
der noch nicht erreichten Positionen.

## U-Abhängigkeit und Einmaligkeit

Der volle D/R-Command enthält keine noch ausstehenden U-Intents. Nötiges U gehört
in einen ausdrücklich getrennten `U-prestage` mit ausschließlich endlichen U-Paaren.
Er ist kein 500er-Start und aktiviert keine Profile. Erst nach seinem vollständigen
Kostenabschluss und echten Readbacks können neue D-Kontexte und ein neuer D/R-Plan
abgeleitet werden. Gebundene U-Vorgänger müssen im dauerhaften Journal geschlossen
vorliegen. Bereits betretene U-Paare bleiben über neue Plan-/Run-Hashes hinweg
gesperrt. Ein Command kann nicht bezahlt fortgesetzt werden.

Ein erfolgreicher Abschluss archiviert den kompletten verbrauchten Planslot.
Kostenbücher, Completion- und REIN-Bindungen werden nicht gelöscht. Der aktive
Slot bleibt sperrend bestehen; nur eine spätere neue geprüfte Installation kann
den geschlossenen Zustand exakt ersetzen. Ein unklarer/inflight Zustand kann
nicht geschlossen, erstattet oder durch einen neuen Command ersetzt werden.
Profildeaktivierung und ein Native-D-Backout gehören zu ihren getrennten,
tatsächlich abgenommenen Root-Verträgen.

## Tatsächliche spätere Eingaben, heute offen

Der Sourcevertrag ist `helmut-synthetik500-production-command/1`. Die Root-Admission
`helmut-synthetik500-production-root-admission/1` bindet Command-/Plan-/Commit-Hash,
echte Admissionzeit, Ende, Bücher- und Kontrollvorstand. Bei Installation darf
ihre echte Uhrzeit höchstens 60 Sekunden alt sein. Das bestehende maximal vier
Stunden lange Fenster und derselbe UTC-Tag bleiben unverändert.

Für jeden Zweck braucht sie einen separat gepinnten Root-Datensatz
`helmut-synthetik500-production-actual-gate/1`, der denselben Command/Plan/Run/Commit
bindet, den tatsächlichen Scope ausdrücklich abnimmt und mindestens einen
erreichbaren privaten Primärbeleg bindet. Gates sind:

- nativer Source17-Vollscope einschließlich erlaubter U/D/R/Usage/Ausgabedeltas;
- tatsächliches endliches W, originale Sourceversionen und Eligibility;
- tatsächliche native/JS-Codec- und sichere Zahlenbindung;
- frische vollständige Bücher und Finanzierung des endlichen Plans;
- echte operative Ruhe und Ausschluss fremder Aufrufer im angenommenen Fenster;
- tatsächlich installierter Native-D-Vertrag samt aktuellem Source-/Bodyseal;
- tatsächlicher Endschutz und Rückweg;
- tatsächliche Fenster-/Startbefugnis;
- vollständiger Ausgabe-/Aufbewahrungsvertrag für 1500 Positionen.

U-prestage braucht die letzten drei ausgabespezifischen/native-D-Gates nicht.
Keine dieser tatsächlichen Admissiondateien wird durch den Adapter erzeugt.
Eine Boolesche Behauptung allein ersetzt keinen Scope-Datensatz oder Primärbeleg.
Diese neuen Root-Wrapper sind ein **künftiger Eingabevertrag**, keine Behauptung,
dass heutige historische Source-Reviews dessen Actual-Abnahme bereits erfüllen.
Root verantwortet die tatsächliche Aussage der gebundenen unabhängigen Belege;
Dateihashes beweisen ihre Identität, keine Callback-Wirkungssemantik.

Die drei Storage-Verbindungen verwenden exakt die bekannten öffentlichen
Native-D-Funktionen `helmut_immutable_d_contract_v1`,
`helmut_store_immutable_d_v1` und `helmut_read_immutable_d_v1`. Namen und Argumente
sind mit `NATIVE_ABI`/`ABI_HASH` festgelegt. Der Store sendet neun Textargumente,
prüft den echten D-Kostenabschluss, Usage-Datensatz, Original-Save, Eigentümer,
Context/Profile/Sources und ganze Version. Native Readback muss dieselbe Version
zurückgeben. Keine lokale/mutable History ersetzt sie. Der bekannte ältere
Phase4-Slot2-Body ist **kein** Nachweis für die benötigte tatsächlich installierte
Slot3/Plan4-Kompatibilität; deren neue Bodies, Seals und Wirkungsabnahme bleiben offen.

Die bestehenden 6 USD pro UTC-Tag und 7 USD insgesamt werden strikt geprüft und
nicht verändert. Ganze Reserven bleiben U/D3000=212000 Mikro-USD und REIN3000=212000
bzw. REIN6000=224000. Sequenzielle Ausführung senkt gleichzeitige offene Reserven,
nicht die Gesamtobergrenze aller Versuche. Der 500er-Worstcase ohne U beträgt
212000000 bzw. 218000000 Mikro-USD; die heutigen Grenzen sind keine Garantie,
500 Paare fertigzustellen. Tatsächliche Finanzierung darf daraus nicht erfunden
werden. Unbekannte Kosten bleiben voll gebunden.

## Verifikation

`node scripts/synthetik-500-production-adapter-test.js` verwendet nur lokale Fakes.
Es prüft neue Missing-Gates, endliche Eingaben, CAS/Claim/Sendebuchung, Kosten-Unknown,
REIN-Reihenfolge, Erhalt/kein Replay, Native-ABI/Provenienz sowie 500 einmalige
D/R-Einheiten und 1500 Ergebnispositionen. Die Ablauf-Fakes ersetzen explizit die
noch nicht existierende Root-Actual-Admission; sie erteilen keine Native-, W-,
Finanzierungs-, Aktivierungs-, Leistungs- oder Production-Abnahme.
