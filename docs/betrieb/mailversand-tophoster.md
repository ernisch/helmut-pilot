# Systemmails über das vorhandene Tophoster-Postfach

Stand: 12.11.2026. **Veröffentlichung und eigener Zugangstest freigegeben.**
Aktueller Bereitstellungs- und Mailteststand: [PR1155](https://github.com/ernisch/helmut-pilot/pull/1155).
Die folgenden Einrichtungsbelege beschreiben den geprüften Code vor dem Rollout.
Kein neues Dienstkonto oder Postfach angelegt, keine DNS-Änderung.
Production-Konfiguration und eigenes Testkonto sind vorbereitet; der echte Versand folgt nach dem Rollout.

## Bestätigte Verbindungsdaten

Der Betreiber hat die Verbindungsdetails des Postfachs als Screenshot bereitgestellt:

| Angabe | Wert |
|---|---|
| Absender | `Helmut <hallo@mithelmut.de>` |
| Benutzername | `hallo@mithelmut.de` |
| Postausgang | `server44.configcenter.info` |
| Protokoll / Port | SMTP / 465 |
| Verbindung | Implizites SSL/TLS, Zertifikatsprüfung aktiv, mindestens TLS 1.2 |

SMTP ist bei dogado ausdrücklich für Anwendungsversand über das bestehende Postfach
[dokumentiert](https://help.dogado.de/hc/de/articles/26405588776465).
[Vercel](https://vercel.com/kb/guide/sending-emails-from-an-application-on-vercel) unterstützt
SMTP in Node.js auf Port465/587; der Versand muss vor Ende der Anfrage abgeschlossen werden.
Der konkrete Tarif, seine Versandgrenzen und eine echte Zustellung sind noch nicht geprüft.
Eine neue Resend-Registrierung ist für diesen Weg nicht erforderlich.

## Eine vorbereitete Konfiguration

| Umgebungsvariable | Vorgesehener Wert |
|---|---|
| `HELMUT_MAIL_TRANSPORT` | `smtp` — erst bei bewusster Versandaktivierung |
| `HELMUT_MAIL_FROM` | `Helmut <hallo@mithelmut.de>` |
| `HELMUT_MAIL_REPLY_TO` | `hallo@mithelmut.de` |
| `HELMUT_SMTP_USER` | `hallo@mithelmut.de` |
| `HELMUT_SMTP_PASSWORD` | Postfachpasswort, ausschließlich in geschützten Einstellungen |
| `HELMUT_ZUGANGSMAILS_FREIGEGEBEN` | `1` — nur Einladungen und Passwortmails an echte Konten |
| `HELMUT_PUBLIC_URL` | Bestätigte öffentliche App-Adresse für die Zugangslinks |

Kein Passwort im Chat, Repository oder Beispiel. Der lokale Schutzstarter entfernt
`HELMUT_SMTP_PASSWORD` aus Testkindprozessen. Der Server und Port465 sind absichtlich fest
im Code gebunden; selbst ein eingespeister Konfigurationsstatus kann sie nicht umleiten.
Eine Änderung des Postfachservers benötigt deshalb eine geprüfte Codeänderung.

## Verhalten und Grenzen

Einladung und Reset laufen über dieselbe bestehende Transportschicht und die vorhandenen
Helmut-Vorlagen. SMTP benötigt Nodemailer10.5.0 (fest gepinnt, keine weiteren Abhängigkeiten).
Die Standardstellung bleibt Versand aus. Erst die ausdrückliche SMTP-Auswahl mit gültigem
Absender, passendem Benutzer und vorhandenem Passwort erlaubt einen Versuch.

Der Kommunikationsriegel wirkt sowohl zentral als auch unmittelbar vor dem SMTP-Client.
Es gibt genau einen Empfänger, keine übernommenen Bcc-, Anhangs-, URL- oder Dateioptionen.
Protokollierung und Debugausgaben des Clients sind aus. Fehler enthalten nur feste Grundcodes.
Ein einzelner Versuch hat höchstens10Sekunden; AbortSignal schließt eine laufende Verbindung.
Es gibt keine automatische Wiederholung und keinen Wechsel zu Resend.

`sent:true` bedeutet ausschließlich die bestätigte Annahme für den richtigen Empfänger durch
den SMTP-Server. Es belegt keinen Posteingang. Bei einem Zeitabbruch kann die Annahme bereits
erfolgt sein; vor einer erneuten Einladung prüfen. Der bestehende kopierbare Zugangslink bleibt
bei fehlender Versandbestätigung verfügbar. HTML- und Textfassung sowie die Sie-Ansprache gelten
für beide echten Versandwege identisch.

## Nachweise und nächster Schritt

| Prüfung | Ergebnis |
|---|---|
| SMTP einschließlich lokaler TLS/HTTP-Flows, enger Kanalfreigabe und Zeitabbruch | 63/63 |
| Bestehende Mailvorlagen / Mutationsprobe | 152/152 und26/26 |
| Bestehendes Mailpit / Resend | 119/119 und201/201 |
| Variableninventar / lokaler Netzschutz | 38/38 und92/92 |
| `npm audit --omit=dev` | 0 bekannte Schwachstellen zum Prüfzeitpunkt |

`node scripts/lokal.js scripts/invite-smtp-transport-test.js` prüft Auswahl, Sperren,
Kopfzeilen, feste TLS-Optionen, Fehlerbereinigung, Zeitabbruch und Einzelempfänger.
Ein echter lokaler TLS-SMTP-Server mit temporärem Zertifikat prüft zusätzlich Nodemailer,
Anmeldung, HTML/Text, beide Zugangsmailarten und ein falsches Passwort. Nur Loopback;
keine fremde Nachricht, keine echten Zugangsdaten.

Der lokale HTTP-Nachweis führt Adminlogin, Kontoanlage, SMTP-Einladung, Passwortsetzen,
spätere Anmeldung und Reset tatsächlich aus. Der verwendete lokale Kontenspeicher wird
anschließend wiederhergestellt. Die neue Suite wird über den vorhandenen Auth-Bereich
von der CI-Auswahl erfasst. Ein Resend-Testfall verwendet nun `smtpx` als unbekannten Namen,
weil `smtp` ein bekannter, weiterhin ausdrücklich zu konfigurierender Transport ist.

Vor Livebetrieb: erforderliche Checks am endgültigen Kopf abschließen und regulär veröffentlichen.
Danach den eigenen Testempfänger bis zur SMTP-Annahme prüfen. Posteingang, zweimalige
Passworteingabe und spätere Anmeldung bestätigt der Betreiber selbst.
Die tägliche Briefingversorgung ist ein eigenständiger Nachweis.


## Freigabe und gespeichertes Passwort

Am12.11. hat der Betreiber das Postfachpasswort in Vercel Production hinterlegt und danach
die Veröffentlichung samt eigenem Test ausdrücklich freigegeben. Metadaten bestätigen
`HELMUT_SMTP_PASSWORD`, Typ Secret/sensitive, nur Production; der Wert wurde nicht ausgelesen.
Die bestehende globale Kommunikationsstellung ist `gesperrt`. Die zusätzliche, explizite
Zugangsfreigabe erlaubt deshalb ausschließlich den serverseitigen Kanal `einladung` für
als real eingeordnete Konten. Synthetische Kennungen/Adressen bleiben vor dieser Ausnahme
gesperrt; allgemeine Mail, Push, WhatsApp, Monitoring und Jobtransporte werden nicht freigegeben.
Rollback dieser Teilfreigabe: `HELMUT_ZUGANGSMAILS_FREIGEGEBEN` leeren/auf0 setzen.
Die App-Verknüpfung „Verwaltung öffnen“ führt jetzt zur einfachen Verwaltung; die Originalansicht
bleibt für vorhandene Spezialwerkzeuge unter `/verwaltung/` erreichbar.

Die nicht geheimen Production-Variablen wurden mit den obigen Werten angelegt; die öffentliche
App-Adresse ist `https://helmut-pilot.vercel.app`. Die globale Kommunikationsstellung blieb erhalten.
Ein eigenes Konto `hallo@mithelmut.de` wurde einmalig als eingeladener Demo-Zugang ohne Mandat
und ohne Passwort angelegt. Andere Konten, Kostenbestand und Budgets blieben im Vor-/Nachvergleich gleich.
Bei anonym angeforderter Passworthilfe nennt das interne Audit neben `versand=nein` nur einen
bekannten festen Fehlercode; die öffentliche Antwort bleibt generisch, ohne SMTP-Fehlerdetails.

Lokale Freigabeprüfungen nach Hauptbranchintegration: Verwaltung58/58 Browser-/HTTP-Gruppen,
Kommunikationsriegel48/48, Passwortablauf39/39 und SMTP63/63; die übrigen vorherigen Nachweise bleiben erhalten.

Freigabeprüfung: CI43247458216 Versuch1 brach vor dem ersten Auth-Feldpatchfall mit
`fetch failed` ab; derselbe unveränderte Test bestand auf dem vorigen Kopf44/44.
Versuch2 wurde schon von der bestehenden Einmalbindung des synthetischen Vorflugs abgewiesen.
Beide Erstbefunde bleiben erhalten; kein weiterer Wiederholungslauf. Der Testharness öffnet
nach den langen synchronen SQL-Proben ein frisches lokales HTTP-Tor und nennt bei Netzwerkfehlern
nur Methode/Pfad/Fehlerklasse. Die Datenbank, Testassertionen und Einmalbindung werden nicht geändert.
Eine neue reguläre Pflicht-CI prüft den korrigierten Kopf; aktuelles Ergebnis siehe PR1155.

Der folgende Lauf43249919213 bestand den erneuerten Kontoschreibschutz, brach später
aber beim Start des unveränderten pg_cron-Testcontainers ab. Lokal reproduziert:
`undefined symbol: heap_datum_check`. Der Build hatte neue PostgreSQL17.12-Header mit
der fest gebundenen17.6-Laufzeit kombiniert. Der reine Testcontainer bindet nun auch
sein17.6-Headerpaket per Version und SHA256 (amd64/arm64); pg_cron1.6.4, Laufzeitimage,
Prüfungen und Production bleiben unverändert. Der korrigierte lokale Build ist erfolgreich;
der vorhandene Offline-Belegtest besteht17/17 und der echte lokale PG17.6-/pg_cron-Test12/12. Neue Pflicht-CI: siehe PR1155.


## Liveprobe und Bindung an die Vercel-Anfrage

Verwaltung mit PR1155 auf `dc20e194` veröffentlicht: Production `dpl_3Pw2iEAbonJVigdPkY81jaG5E7ar`
READY, Hauptadresse bestätigt. Pflicht-CI43252865079 erfolgreich. Der isolierte
[Liveprüfer43259302941](https://github.com/ernisch/helmut-pilot/actions/runs/43259302941)
belegt ausgelieferten Client bytegleich, geschützte Verwaltung/Assets/API anonym401,
Passwortseite in Sie-Ansprache und genau einen anonymen Aufruf für das eigene Konto16:30:08UTC.
HTTP200 ist kein Versandbeleg: keine Token-/Auditmutation gespeichert. Native Supabase-Spur
zeigt nur zwei erfolgreiche Konten-GETs (Benutzerprojektion und vollständiger CAS-Lesestand),
keinen anschließenden Schreibaufruf. Eigene Kontodaten und Kostenfingerabdrücke unverändert.
Kein weiterer Mailaufruf während der Untersuchung und kein Passwortzugriff.

Konkreter Codebefund: Die Hintergrundzusage wurde nach der HTTP-Antwort nur weiter abgewartet.
Das sichert auf Vercel ihre Laufzeit nicht. `reset-timing.js` bindet nun dieselbe echte Promise
vor der Antwort mit dem offiziellen `@vercel/functions`-`waitUntil` an die Anfrage.
Generische Antwort, Zeitraster, ein Versandversuch, Rechte und Kommunikationsriegel bleiben erhalten.
Ein zusätzlicher HTTP-/TLS-Test blockiert das Tokenschreiben über die frühe Antwort hinaus,
prüft die vom tatsächlichen SDK registrierte Promise und danach SMTP plus Audit.

Wegen nicht verfügbarer Arbeitsumgebung auf dem vorhandenen isolierten GitHub-Prüfrechner
vorbereitet: [43264352918](https://github.com/ernisch/helmut-pilot/actions/runs/43264352918),
SMTP65/65, bestehende Reset-Regression1/1, npm audit0. Der erste Vorbereitungslauf43263914199
verwarf SDK3.10.4 wegen vier hohen transitiven Befunden; kein Runtimecode damit veröffentlicht.
Npm bindet stattdessen exakt SDK3.11.2 samt Lockdatei, übrige direkte Abhängigkeiten unverändert.
Das temporäre Vorbereitungsworkflow ist nicht Teil des Produktdiffs. Vor Veröffentlichung
bleibt die Pflicht-CI am neuen Codekopf erforderlich; erneuter eigener Livebeleg danach offen.
Aktueller Abschlussbeleg und Folge-PR werden in PR1155 geführt.


## Plattformabgrenzung und aktuelle Hauptbranchintegration

Pflichtlauf43265827684 auf `f61a83f3` brach im unveränderten nativen Drei-Profil-Vorflug
mit `MODULE_NOT_FOUND` in der Arbeitsphase ab. Der isolierte normale Node-Server enthält
keine Vercel-Pakete. Deshalb wird das SDK erst für die Passworthilfe auf Vercel geladen;
der Import wird für jede anonyme Anfrage vor dem Lesen ihrer Adresse vorbereitet.
Die Bindung an waitUntil bleibt aktiv. Keine Original-, Ressourcen- oder Prüfregel geändert.

Eine neue Gegenprobe verbietet das Laden des SDK im normalen Node-Kindprozess und prüft
seinen vollständigen Abschluss. Die echte HTTP-/SDK-/SMTP-Gegenprobe bleibt erhalten.
[Vorbereitung43268596889](https://github.com/ernisch/helmut-pilot/actions/runs/43268596889):
SMTP66/66, Reset-Regression1/1 und npm audit0. Geprüfte Dateien aus `572bd4e3` wurden
bytegleich übernommen. Main `012b6111` samt paralleler Quellenkorrektur und ihren
Datenbankprüfungen ist vollständig erhalten. Neues Pflicht-CI-Ergebnis und Liveabschluss
weiter in PR1169 bzw. PR1155, kein blinder Versand-Retry.
