# Blocker 2: Data13 und neue vollständige Aufnahme

> Historische408er-Basis vom10.10.2026. Die spätere [tatsächliche415er-Fortschreibung nach eigenem ZEIT-Originalminimum](blocker2-zeit-originalminimum-und-415er-fachabnahme-20261010.md) ist der aktuelle Fachstand; alle folgenden408er-Zahlen und Basisbelege bleiben als damalige Bilanz erhalten.

**Stand: 10.10.2026.** Aktuelle vollständige Fachentscheidung zur neuen tatsächlichen Aufnahme. **408/500 vollständig fachlich angenommen; Blocker 2 bleibt offen.**

## Geltungsbereich

Dieser Bericht betrifft ausschließlich den Blocker-2-Eingang und die
Quellenqualifikation von 500 inaktiven, vollständig fiktiven Profilen. Er ist
kein Beleg für den späteren aktivierten 1500er-Funktionstest (500
Mandatsbriefings, 500 Morgenbriefings, 500 Lage-Ergebnisse); dieser bleibt
gesondert freizugeben. Die vollständige Abnahme aller 500 Profile bleibt offen.
Eine 500er-Freigabe wird mit diesem Bericht nicht erteilt, und es gibt keine
Freigabe für eine weitere Teststufe.

Im Berichtszeitraum wurden keine Profile aktiviert (0), keine bezahlten
Helmut-Production-Modellaufrufe ausgelöst (0), keine externen Nachrichten
versendet (0) und keine Capture-Wiederholungen gefahren (0).

## Neue Aufnahme

Die neue Aufnahme ist tatsächlich erfolgt; Data13 ist jetzt committet. Die
frühere Zahl 139 und ältere Projektionen sind historisch und kein aktueller
Belegstand.

- 500 technisch erfasste Eingaben, 500 Eingabe-GETs, 2 Identitätsprüfungen.
- 28 verschlüsselte native Artefakte mit zusammen 471.032.843 Bytes.
- Alle 28 wurden serverseitig vollständig byteweise zurückgelesen und sind
eigentümerbeschränkt; kryptografische Authentifizierung und die erwarteten
inaktiven Identitäten sind bestätigt.
- Nativer Lauf: [GitHub Actions Run 38072794334](https://github.com/ernisch/helmut-pilot/actions/runs/38072794334), Attempt 1, Workflow-Commit
e921879ad4520502a3576dcf5af295f5b2acb462, Production-Commit
47063bebd0f2f1e4a93d7bf5c79710b61e291b7c, Tag 2026-10-10.
- Die Aufnahme ist an genau diesen Workflow, diese Runtime und den Berliner
Kalendertag gebunden; spätere Dokumentationscommits ändern diese Bindung nicht.

## Datenlage der Aufnahme

- 180.439 tatsächliche Claims gegenüber 179.089 der alten Aufnahme.
- 3.530 neu oder geändert und ausdrücklich geprüft; 0 ungeprüfte Claims.
- Historisch Ereignisduplikate in 114 Profilen, aktuell 0 Ereignisduplikate.
- Quellenoffen: 9 ZEIT-Profile mit 18 Summary-Verweisen, 84
STERN-Profile mit 336 Titel-/Summary-Verweisen, Union 91 Profile.
- Ereignis-Kriterium 499 positiv, Brake 1 offen; Position 69 offen.
- Zeit-, Ebenen- und Notwendigkeitskriterien für 500 positiv.
- Alle 500 Profile haben acht ausdrückliche Einzelurteile. **408 sind vollständig
angenommen**, 91 tragen die Kategorie „fehlender Beleg“, Brake 69 trägt
„fachlich noch unentschieden“. Alle übrigen Kategorien einschließlich
„fachlich noch nicht vollständig beurteilt“ sind null. Die unabhängige
Endabnahme ist an die tatsächlichen Wrapper-, Body-, Eingabe-, Darstellungs-
und Profilhashes gebunden. Kein technisches Grün ersetzt ein Originalminimum.

Die neue Bilanz ersetzt die historische 139er-Annahme aus Run38036221630.
408 ist jetzt das Ergebnis der tatsächlichen neuen Aufnahme und ihrer
Einzelprüfung; die ältere Projektion wurde nicht als Annahme verwendet.

## Data13

- 13 Zielzeilen: 10 Summary-Felder, 3 Titelfelder, 61 native Felder je Ziel,
60 weitere Felder unverändert.
- Genau ein Schreibvorgang mit HTTP 201, Aufrufdauer 10,651304 s; COMMIT bestätigt
(xmin-Sichtbarkeit 553068).
- Geschützter Bestand: 372.053 native Zeilen und Xmins unverändert. Die 52
benannten geschützten Relationen bestehen aus 51 öffentlichen Relationen plus
explizit einbezogenem Migrationsjournal mit 59 Journalzeilen.
- Getrennte frische Native-52-Nachkontrolle mit HTTP 201; keine
Schema-Migration; Budgetgrenzen unverändert; der an die tatsächlichen Postimages gebundene Rückweg wurde
nicht ausgeführt.
- Alte Verträge waren blockiert und wurden nicht ausgeführt. Ein unbekannter
Schreibausgang bleibt Stop mit lesender Klärung und ohne Retry.

## Schutzversion und Grenzen

Die technische Schutzversion ist 52 = 51 public + Migrationsjournal. Die
bestehenden Statement-, DB-, Lock- und Betreibergrenzen bleiben unverändert und
werden nicht abgesenkt: Statement 15 s, DB 17 s, Betreiberfrist 20 s für
HTTP-Anfragen samt Body, Lockwarten 2 s. Die zweite, frische
Nachkontrolle nutzte denselben geschützten Bestand.

## Hashdefinition

Der Offline-Auswerter verwendete zunächst den Hash des vollständigen Profil-DTO
anstelle des kanonischen Runtime-Profilhashs. Der Binder ist korrigiert; der
native DTO-Hash bleibt zusätzlich erhalten. Dieselben authentifizierten
Rohantworten wurden offline neu ausgewertet, ohne zusätzlichen Abruf. Alle 500
kanonischen Profilhashes stimmen mit den ursprünglichen Szenarien überein.

## Offene Minima

- ZEIT: eigene kurze Originalpassage zur konkreten gesellschaftlichen
Angst/Stigmatisierung; der Originaltitel genügt dafür nicht.
- STERN: passende eigene Originalüberschrift oder eigener Originalteaser zum
Arbeitsgerichtsbericht; das falsche Redirectziel und die Eingabemetadaten
tragen das nicht.
- Brake: eigene Kreiszeitungs-Passage, die den konkreten Brief- und
Ereignisvergleich trägt. Gleiche Fotografie, gleicher Ort, gleiche Partei und
gleicher Tag genügen nicht.

Ein fehlender Originalbeleg ist kein Beweis für eine Falschbehauptung. Die
betroffenen Punkte bleiben als offene Minima geführt und werden weder als
belegt noch als widerlegt ausgegeben.

## Status

Blocker 2 bleibt offen. Voller Erfolg verlangt 500 positive
vollständige Profilentscheidungen und alle negativen Kategorien bei null. Die
abschließende unabhängige Kontrolle bestätigt alle 500 Einzelurteile und
180.439 eindeutig gebundene Claimstellen: 0 Fehler, 0 unbeurteilte
Claims/Kriterien. Zusätzlich passen alle 2.484 eindeutig referenzierten
lokalen Belegdateien byte-/hashgenau. Es gibt
keine Aktivierung und keine Freigabe für den eigentlichen 500er-Funktionstest.

## Gebundene Kernbelege

| Beleg | SHA256 |
| --- | --- |
| Aktuelle vollständige Fachmatrix, 235.403.309 Bytes | `a57f03eb49e0ca557eb483175ffbd9370114fa18d4b651f4c326a5b65f06a188` |
| Individuelles finales Delta, 20.204.820 Bytes | `dcdb249247b27b9bf7158d9cc6e31a670d49831d6109fd49f2548be6cfbb5ea8` |
| Authentifizierte 500er-Aufnahme | `9b6613f2de8204fcb2bc8043ae6533b0721ea652fac9ddbf5e28e6e948f48865` |
| Tatsächlicher Data13-COMMIT und frische vollständige Nachkontrolle | `1cab1c056cb4d3556d8b09d82dd1bba0d3fba10ef6929b36e4d7db152ef8ecd4` |
| Unveränderlicher Matrix-Codeindex | `4bb3987634ce5f1854260e3c7b630f616d368f2d516cc7b5166bce0c24fd84ea` |

Private Rohantworten, Originalbelege, SQL-Bodies und Einzelurteile bleiben
außerhalb von Git. Die verschlüsselte Beweissicherung verwendet den bereits
vorhandenen Empfängerschlüssel; der private Schlüssel bleibt getrennt.

Abschließende unabhängige Integritätsquittung: SHA256
`d5e628db40c9d5854ff77316112d45cde70a0c95b6fec182805d276fd436b10e`,
5.172 Bytes, 3.287.767 Einzelkontrollen ohne Fehler.
Belegreferenzquittung: SHA256
`9e04fd0923e5d58ab4448c4c9adfb031564c89cc0fd55c15d1effaef0ac0e98b`.

## Tatsächliche serverseitige Beweissicherung

Das finale Paket liegt verschlüsselt in 17 Teilen im bestehenden privaten
Serverordner. Alle 282.165.365 Bytes wurden vollständig zurückgelesen; jeder
Teil und der Gesamthash stimmen. Ausschließlich diese zurückgelesenen Bytes
wurden mit dem getrennt gehaltenen bestehenden Empfängerschlüssel authentisiert
entschlüsselt: **1.151 Dateien, 3.031.097.636 Bytes, sämtliche Dateihashes PASS**.
Die wiederhergestellte Fachmatrix, das finale Delta, die Endbilanz, die
unabhängige Integritätsquittung, der Codeindex und die Belegabdeckung passen zu
den versiegelten Einträgen. Alle Teile und der zurückgelesene Index haben nur
Eigentümerzugriff; der private Schlüssel wurde nicht hochgeladen.

[Privater finaler Serverindex](https://drive.google.com/file/d/1q3RiQY24LnbXlqO0L1M2r_2m6AORU8NA/view),
33.789 Bytes, SHA256
`4360f44aa677f637373eb979aa3864a89540127d66963da47128a12d1aac4f74`.
Cipher-Gesamthash:
`d957c2533b2f5fe4378a360656dda26f65b3e7bac1e51b3dfcd2ec72ee05925b`.
Die tatsächliche Wiederherstellungsquittung hat SHA256
`28888e02bffc2abd807684ee77ca1278532572e3120adb3dbfd3619a39877461`.

Die 2.484 eindeutigen Belegreferenzen sind vollständig abgedeckt: 536 durch
explizite Mitglieder dieses Pakets, 1.346 durch das bereits authentisiert
wiederhergestellte Cycle2-Archiv und 602 durch das Elternarchiv. Die 500
Rohantworten sind aus den separat gesicherten 28 Aufnahme-Artefakten mit dem
gebundenen Decoder rekonstruierbar. Diese älteren Archive, die 28 Artefakte und
der separate Schlüssel bleiben notwendige Abhängigkeiten; das neue Paket wird
nicht als davon unabhängig dargestellt. Die unveränderlichen lokalen
Vorbereitungsmanifeste enthalten ihren damaligen Vorbereitungsstatus; der neue
Serverindex dokumentiert die danach tatsächlich abgeschlossene Sicherung.
