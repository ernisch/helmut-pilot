# Systemmails über das vorhandene Tophoster-Postfach

Stand: 12.11.2026. **Im Draft vorbereitet und lokal geprüft, nicht live aktiviert.**
Kein neues Dienstkonto oder Postfach angelegt, keine DNS- oder Production-Änderung,
keine Verbindung zum echten SMTP-Postfach und keine echte E-Mail versendet.

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
| SMTP einschließlich lokalem TLS/HTTP-Kontenablauf und echtem TLS-Zeitabbruch | 50/50 |
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

Vor Livebetrieb: Draft freigeben und erforderliche Checks abschließen, Postfachpasswort sicher
hinterlegen, Kommunikationsriegel und Tarifgrenzen prüfen. Danach einen ausdrücklich benannten
Testempfänger bis zum Posteingang, zweimaliger Passworteingabe und späterer Anmeldung prüfen.
Die tägliche Briefingversorgung ist ein eigenständiger Nachweis.
