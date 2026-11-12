# Helmut: Einladung und Passwort-Hilfe

Stand: 12.11.2026. Vorlagen und Zugangstexte vorbereitet, lokal geprüft.
**PR1155 bleibt Draft ohne Merge. Kein echter Versand, keine Production-Konfiguration geändert.**

[Private E-Mail-Vorschau öffnen](https://helmut-verwaltung-vorschau-20261111.lueynohut.chatgpt.site/emails/)
· [Lokale Vorschau](index.html)
· [Einladung auf dem Handy](einladung-390.png)
· [Passwort-Hilfe auf dem Handy](passwort-vergessen-390.png)

## Kundenablauf

1. Betreiber legt den Kunden einschließlich Mandatsangaben in einem Formular an.
2. Die vorhandene Einladungsroute erstellt den persönlichen, einmaligen Zugangslink.
3. Kunde erhält „Ihre Einladung zu Helmut“ und wählt **Passwort setzen**.
4. `/passwort-setzen` prüft den Link. Zwei gleiche Passwörter (mindestens acht Zeichen)
   speichern das Passwort über den bestehenden Kontendienst.
5. Die Antwort setzt die Sitzung; nach erfolgreichem Speichern öffnet sich die App automatisch.
   Für spätere Anmeldungen gelten E-Mail-Adresse und eigenes Passwort.

Das ist der bestehende Authentifizierungsweg. Konto-, Token-, Passwort- und Sitzungsschutz
wurden nicht geändert. Die Einladung aktiviert keine tägliche Briefingversorgung und beweist
keine Zustellung eines Briefings.

## Gestaltung und Ansprache

Beide tatsächlichen Versandvorlagen verwenden die dunklen Helmut-Farben, eine Serifenschrift
für Wortmarke und Überschrift, lesbaren Text und eine klar benannte Schaltfläche. Spectral
und Hanken Grotesk werden bei lokaler Verfügbarkeit verwendet, sonst Georgia bzw. Systemschrift.
Keine extern geladenen Bilder, Fonts oder Trackingabrufe. Tabellen und direkte Stile bleiben
auch für eingeschränkte Mailprogramme erhalten. Textfassung und HTML entstehen aus derselben
Inhaltsbeschreibung; unsichere Links werden nicht verlinkt.

**Durchgängig „Sie“** in Einladung, Passwort-Hilfe, Anmeldung und Passwortformular einschließlich
Erfolg, Fehler und Erneuerung. Persönliche Anrede „Guten Tag Eva,“ aus dem vorhandenen sicheren
Vornamensfilter; ohne verwendbaren Namen „Guten Tag,“. Die übrige App und die Betreiberverwaltung
sind keine vollständige sprachliche Überarbeitung dieses Auftrags.

Vorgesehener Absender nach Betreiberentscheidung: **Helmut <no-reply@mithelmut.de>**.
Vorgesehene Antwortadresse: **hallo@mithelmut.de**. Ein eigenes `no-reply`-Postfach ist für
den Versand über die verifizierte Domain nicht erforderlich. Das vorhandene `hallo`-Postfach
empfängt Antworten über `Reply-To`.

## Nachweise

Alle Läufe über `scripts/lokal.js`, nur lokale oder simulierte Dienste:

| Prüfung | Ergebnis |
|---|---|
| `mail-vorlagen-test.js` | 152/152; beide Fassungen, Sie-Ansprache, Linkschutz, Kontraste |
| `mail-vorlagen-mutationsprobe.js` | 26/26 echte Fehler erkannt |
| `mailpit-transport-test.js` | 119/119, simuliertes Mailpit |
| `resend-transport-test.js` | 201/201, simulierte API, kein Anbieteraufruf |
| `invite-flow-test.js` | 39/39; echter lokaler HTTP-/Konten-/Tokenablauf |
| `passwort-setzen-login-fix-test.js` | 39/39; lokaler HTTP- und Browserablauf, System-Chromium |
| Mailvorschau im Chromium | 25/25; 320/390/600/1024 px, beide Mails, kein Überlauf, auch ohne Style-Block |

Der ursprüngliche Browserstart des Passworttests fand dessen Playwright-Browser nicht.
Der erfolgreiche Lauf verwendete über einen temporären Wrapper `/usr/bin/chromium`;
Testlogik und Authentifizierung blieben gleich. Die Mailvorschau hatte keine Browserfehler
oder externen Abrufe. Screenshots zeigen die tatsächlichen HTML-Vorlagen.

Reproduzierbarer Export ohne Transport oder erzeugte Konten/Tokens:

```sh
node scripts/lokal.js scripts/systemmails-vorschau.js docs/ui/systemmails-20261112
```

Die private Vorschau zeigt geplanten Absender und feste Beispieldaten. Zugangslinks verwenden
die reservierte Domain `.invalid`. Im Vorschaurahmen erklären Klicks die spätere Aktion,
ohne eine Anmeldung oder einen Versand auszulösen. Der Export setzt keine Umgebung dauerhaft.
Prüfung in echten Apple-Mail-, Gmail- und Outlook-Postfächern steht noch aus.

## Nächster Schritt zur Veröffentlichung

1. Gestaltung prüfen. PR1155 bis zur Aufhebung des bisherigen Merge-Halts als Draft lassen;
   danach beide Pflichtchecks am aktuellen Kopf abwarten. Eine Übernahme unter `/verwaltung/`
   als Haupteinstieg ist noch separat vorzubereiten: momentan ist `/verwaltung/einfach/` der Kandidat.
2. `mithelmut.de` beim vorhandenen Versandweg Resend verifizieren. Die dort tatsächlich
   angeforderten DNS-Einträge setzen; vorhandenen Empfang für `hallo@mithelmut.de` erhalten.
   Zugangsdaten ausschließlich über die vorgesehenen geschützten Einstellungen eintragen.
3. Folgende Production-Konfiguration vorbereiten und gezielt aktivieren:

   | Schlüssel | Vorgesehener Wert |
   |---|---|
   | `HELMUT_MAIL_TRANSPORT` | `resend` |
   | `HELMUT_MAIL_FROM` | `Helmut <no-reply@mithelmut.de>` |
   | `HELMUT_MAIL_REPLY_TO` | `hallo@mithelmut.de` |
   | `HELMUT_RESEND_API_KEY` | Neuer, auf Versand begrenzter Schlüssel; nie im Repo/Chat |
   | `HELMUT_PUBLIC_URL` | Bestätigte öffentliche App-Adresse, keine private Gestaltungsvorschau |

   Vor Versand außerdem den bestehenden Kommunikationsriegel prüfen: ein aktives gesperrtes
   Testfenster darf nicht pauschal für alle Kanäle aufgehoben werden.
4. Einen ausdrücklich freigegebenen Testempfänger vom Posteingang über den Link und zweimalige
   Passworteingabe bis zur späteren normalen Anmeldung prüfen; Reset und verbrauchten Link mitprüfen.
   API-Annahme einer Nachricht ist noch kein Posteingangsnachweis.
5. Vor Kundenbetrieb die weiterhin blockierte [Briefingversorgung](../../betrieb/briefing-versorgung-reparatur-20261112.md)
   eigenständig klären und ein tatsächliches Kundenbriefing in der App nachweisen.

Lesende Vercel-Prüfung am 12.11.: keine `HELMUT_MAIL_*`, `HELMUT_RESEND_*` oder `HELMUT_PUBLIC_URL`
als Projekt-Umgebungsvariablen gefunden; als Production-Domain nur `helmut-pilot.vercel.app`.
Kein Live-Konto, Testbriefing, Quellenlauf, DNS-Eingriff oder Versand durch diesen Auftrag.

Kanonische Mailpflege: [Systemmails](../../betrieb/systemmails.md),
Versandkonfiguration: [Resend](../../betrieb/mailversand-resend.md).
