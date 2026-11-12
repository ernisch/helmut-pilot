# Kundenverwaltung: einfache Bedienung mit vorhandenen App-Routen

Stand: 12.11.2026. **App-Kandidat lokal geprüft, private Vorschau bereitgestellt;
PR1155 bleibt auf Betreiberwunsch Draft ohne Merge. Kein Liveumbau von Helmut.**

[Private Vorschau öffnen](https://helmut-verwaltung-vorschau-20261111.lueynohut.chatgpt.site)
· [Offlinevorschau](vorschau.html)
· [Kundenanlage auf dem Handy](vorschau-v2-anlegen-mobil.png)

## Was sich für den Betreiber ändert

- **Kunde anlegen:** Name, E-Mail und alle Mandatsangaben in einem Formular.
  Ein Klick speichert Konto und Mandat und löst danach die Einladung aus. Kein
  zweiter Ansprechpartner, Tarifwunsch oder vom Betreiber gesetztes Passwort.
- **Eine Kundenseite:** Mandat bearbeiten, Versorgung ausdrücklich aktivieren,
  heutigen Briefingstand prüfen und bei Bedarf einen Zugangslink erstellen.
- **Politische Schwerpunkte (optional):** bei Anlage und Bearbeitung mit dem Hinweis
  „Damit wählt Helmut passende Nachrichten für dein Briefing aus. Kann später im Profil ergänzt werden.“
  Leerlassen verhindert weder Kundenanlage noch Einladung; der Kunde ergänzt seine
  Auswahl nach der Anmeldung selbst unter Profil → Schwerpunkte.
- **Mandat auswählen:** Partei, Fraktion und Wahlkreis als Dropdowns mit denselben
  Listen wie im Profil. Wahlkreise passen zu Parlament und Bundesland; ein Wechsel
  setzt die Wahlkreisauswahl zurück. Landesliste und bestehende Sonderwerte bleiben
  auswählbar. [Ansicht auf dem Handy](vorschau-mandat-dropdown-mobil.png).
- **Drei Einstiege:** Übersicht, Kunden, Einstellungen. Die Übersicht zeigt
  Kunden mit Handlungsbedarf. Fehlende Nachweise bleiben offen.
- **Quellen & Versorgung:** direkt von der Übersicht oder unter Einstellungen.
  Vorhandenen Quellenlauf starten, Status prüfen und heutige Kundenbriefings
  sehen. Ein Laufabschluss erzeugt keinen erfolgreichen Briefingstatus.
- **Helmut-Gestaltung:** originales Zeichen, Hanken Grotesk und Spectral aus
  der App; ruhige dunkle Farben, kurze Beschriftungen und native Formularfelder.
- **Weitere Funktionen:** Kosten, Quellen und letzte Abläufe verwenden vorhandene
  Leserouten. Profilbestand, Zuweisungen, Datenschutz und Diagnose bleiben in
  den bisherigen Werkzeugen erreichbar. Keine bestehenden Funktionen oder Daten
  wurden gelöscht; die Originalverwaltung bleibt unverändert erreichbar.

Der Kandidat liegt bewusst unter **`/verwaltung/einfach/`**. `/verwaltung/` und
`/?admin-tools=1` werden noch nicht ersetzt. Die Übernahme als Haupteinstieg folgt
erst nach der gewünschten Durchsicht und vollständigen Pflicht-CI.

## Zwei unterschiedliche Nachweise

| Fassung | Verbindung / Aussage |
| --- | --- |
| Private Site und Offline-HTML | Dieselbe UI-Komponente mit ausdrücklich fiktivem Beispieladapter. Keine App-Verbindung, kein Speichern echter Kunden, keine echten Einladungen. Änderungen verschwinden beim Neuladen. |
| App-Kandidat auf diesem Branch | Verwendet die bestehenden Helmut-Konten-, Profil-, Ergebnis- und Statistikrouten im selben Ursprung mit vorhandener Anmeldung, Adminprüfung und CSRF. Lokal mit echten HTTP-Antworten und isoliertem Dateispeicher geprüft. |
| Laufende Helmut-App | Keine Umstellung durch diesen Auftrag. Keine echten Kunden angelegt, Profile aktiviert oder Nachrichten versendet; keine bezahlten Modellaufrufe. |

Die private Vorschau enthält nicht bloß eine zweite unabhängig gezeichnete UI:
`scripts/verwaltung-einfach-export.js` exportiert die tatsächliche
`verwaltung/einfach/app.mjs` mit dem getrennten Beispieladapter. Die
Backendmodule und Zugangsdaten sind nicht Teil dieser Offlineausführung.
Die Kopie unter Sites erhält ihren bestehenden privaten Zugriff.

## Welche Funktion tatsächlich angeschlossen ist

| Funktion im App-Kandidaten | Vorhandener Anschluss / Ergebnis |
| --- | --- |
| Kundenbestand und Profilzuordnung | `GET /api/admin/customers`, `GET /api/admin/overview`; bestätigte IDs statt Namensraten; neue Personen erhalten eine neue Zuordnung, auch bei gleichnamigem Bestandsprofil. Unklare Profilquellen oder Mehrfachzuordnungen erlauben keinen erfolgreichen Versorgungsstatus. |
| Kunde anlegen | Alle Angaben vorab prüfen; vorhandene `createAdminActions` legt zuerst ein gesperrtes Konto mit neuer Profilreferenz an. Danach Profil speichern und zurücklesen, Zugang bedingt freigeben und bestehende Einladungsroute aufrufen. Bei einem Teilabbruch keine zweite Anlage oder automatische Wiederholung. Unterschiedliche Namen/Tarife bleiben für das alte Formular weiter unterstützt. |
| Mandat laden und speichern | `GET/PATCH /api/admin/profile/:id`; vorhandene Mandatsprüfung und Zulassung bleiben serverseitig wirksam. Neue Profile bleiben ausdrücklich inaktiv. Bestehende Zusatzfelder werden erhalten; gespeicherte Werte werden wieder gelesen. |
| Versorgung aktivieren | Bewusste Einzelaktion mit Bestätigung; vorherige Profilprüfung, ausschließlich PATCH `{profileActive:true}`, anschließende Leseprüfung. Aktivierung erzeugt keinen Briefing-Erfolgsnachweis und startet keinen zusätzlichen Crawl oder Modellaufruf. |
| Briefing heute | Vorhandene `GET /api/admin/ergebnisse` mit Seitennachladen. Prüft aktuellen Berliner Tag und zusammenpassende Antwortseiten; fehlende/abweichende Antworten erzeugen keinen Erfolg. Briefing, Lage und Bereitstellungsquittung bleiben einzelne Aussagen. |
| Einladung und Passwort | Nach bestätigter Anlage automatisch vorhandene Zugangsfreigabe und `POST /api/admin/users/:id/invite`, auch mit leerer Schwerpunktliste. Einmalbindung, Gültigkeit und echter `mail.sent`-Status bleiben erhalten. Die bestehende Appseite `/passwort-setzen` verlangt zwei gleiche Passwörter, setzt die Sitzung und leitet zur App weiter. Kein Passwort durch den Betreiber. Link nur in der aktuellen Ansicht; beim Erneuern wird der alte Link sofort ausgeblendet. |
| Kosten, Quellen, Abläufe | Bestehende Budget-/Quellen-/Prozessrouten. Unbekannte Beträge und fehlende Quelldaten werden erklärt; der vollständige Quellenbericht bleibt verlinkt. |
| Manueller Quellenstart | Bestehendes `createQuellenlauf` und `POST/GET /api/admin/quellenlauf`. Admin/CSRF, Auftragskennung, Kontingente, Status und Reload bleiben erhalten. Bei unbekanntem Ausgang kein weiterer Start. Ein bestätigtes HTTP401/403 des Startversuchs entfernt den sicher abgewiesenen Auftrag; fehlende Folgeabfragen bleiben sichtbar. |
| Seltene Funktionen | Tatsächliche Verweise zur bestehenden Profilansicht und zu den erweiterten Werkzeugen. In der privaten Vorschau werden diese Verweise als noch in der bisherigen Verwaltung liegend erklärt. |

Ein vollständiger technischer Nachweis heißt **„Heute bereit“**, mit gesondertem
Hinweis auf die offene inhaltliche Beurteilung. Eine Bereitstellungsquittung belegt
keine gelesene Nachricht oder zugestellte E-Mail. Die Oberfläche kann fehlenden
Nachschub sichtbar machen; dieser Auftrag repariert nicht den zugrunde liegenden
Quellen-/Briefingmotor und behauptet keinen Nachweis der täglichen Liveversorgung.

## Einfachheit und Fehlerfälle

Die Gestaltung folgt Apples Empfehlungen für [wenige notwendige Eingaben](https://developer.apple.com/design/human-interface-guidelines/entering-data)
und [klare, kurze Beschriftungen](https://developer.apple.com/design/human-interface-guidelines/writing):
eine Hauptaufgabe je Seite, vertraute Wörter, klar benannte Aktionen und Details
erst bei Bedarf. Technische Prüfkennungen stehen nicht im normalen Bedienablauf.

Eine erfolgreiche Anlage öffnet den Kunden mit bestätigtem Mandat und
Einladungsbefund. Nur `mail.sent === true` wird als versendet gemeldet. Ohne
Versand bleibt der Link verfügbar; die private Site nennt dies ausdrücklich
eine simulierte Einladung. Die Briefingversorgung bleibt bis zur bewussten
Aktivierung pausiert, unabhängig vom freigegebenen Kontozugang.

Fehlt ausschließlich die fachliche Schwerpunkt-/Ausschussangabe, ist das für
Konto und Einladung erlaubt. Die Kundenseite zeigt „Schwerpunkte offen“ und
verweist auf den späteren Profilnachtrag. Für die spätere Briefingaktivierung
bleibt die vorhandene Vollständigkeitsprüfung erhalten; der Profilnachtrag
aktiviert die Verarbeitung nicht automatisch.

Lade-, Leer- und Fehlerzustände bieten einen nächsten Schritt. Eine fehlende
Profilquelle ist kein leeres Kundeninventar. Ein inaktives neues Profil gilt nicht
als versorgt. Unklare Schreibausgänge sperren weiteres Speichern und verweisen auf
Lesekontrolle; keine automatische Wiederholung oder Löschung. Ein bekannter
Teilabbruch erhält die Formularwerte, sperrt eine zweite Anlage und bietet
„Angelegten Kunden prüfen“ an. HTTP401/403 entfernt
Kundendaten und Formularwerte aus der Oberfläche. In direkten Vercel-Prüfvorschauen
sperrt die neue Oberfläche ihre Schreibaktionen gegen echte Kunden. Der reguläre Servereinstieg importiert
niemals den fiktiven Beispieladapter.

## Tatsächliche Prüfung

- **57 Gruppen mit Browser und echtem isoliertem Backend:**
  [Prüfbeleg](app-pruefung.json), [Desktop](app-uebersicht.png),
  [Kundenseite Mobil](app-kunde-mobil.png). Von der UI ausgelöste Kontoanlage,
  Profil-PATCH, explizite Aktivierung und Einmallink sind im lokalen Speicher
  nachgewiesen, einschließlich vollständiger Einformularanlage, Dropdownwerten,
  Teilabbrüchen, Anlage ohne Schwerpunkte, E-Mail-Übergabe an den gesperrten Mailweg und anschließender
  Passwortseite: Abweichung abgewiesen, zwei gleiche Passwörter, echte Sitzung,
  richtiges Mandat und HTTP410 bei erneuter Tokenverwendung. Ein zunächst leeres
  Profil wurde anschließend vom angemeldeten Kunden im tatsächlichen Profil-Editor
  ergänzt und serverseitig zurückgelesen. Die positive
  Versandanzeige ist mit einer ausdrücklich synthetischen Antwort geprüft;
  eine echte E-Mail wurde nicht versendet. Ergebnisstatus gegen synthetische bestehende
  Antwortverträge geprüft; die lokale Umgebung besitzt keinen produktiven V3-Speicher.
- **30 Gruppen für den Offlineexport:** [Prüfbeleg](vorschau-v2-pruefung.json),
  1440/390/360/320 Pixel, vollständige Anlage, erhaltenes Mandat, simulierte
  Einladung, optionale/leer speicherbare Schwerpunkte, Dropdowns, Beispielzustände, keine JavaScriptfehler
  und keine App-/Netzwerkverbindung.
- **17/17 bestehende Quellenstartgruppen einschließlich Originalbrowser:**
  lokale Queue-/Storage-Injektion; keine externe Quellen- oder Modellarbeit.
  Der neue Client erreicht die echte Route im ausgeschalteten Arbeitsfenster;
  erfolgreiche und unklare Laufantworten sind zusätzlich synthetisch geprüft.
  Doppelklick, Reload ohne Neustart, Folgeabruf und Sitzungsverlust sind abgedeckt.
- Vorhandener Nachweis vom 11.11. für die bestehende Adminansicht:
  **104/104 Renderprüfungen** und **5/5 Verwaltungs-Ergebnisprüfungen** grün.
  Diese unveränderten Bereiche wurden am 12.11. nicht erneut geprüft.
- Erwartete HTTP400-/401-Negativfälle werden von unerwarteten Browserfehlern
  unterschieden. Die Entfernung privater Daten bei Sitzungsverlust ist geprüft.
- Prüfkorrekturen am 12.11.: Der Node-HTTP-Test benötigt die wirkliche lokale
  Herkunft für HTTP-Einladungslinks. Nach erstmaligem Passwortsetzen erzeugt
  ein erneuter Link einen Reset statt einer weiteren offenen Einladung.
  Der alte Link wird beim Erneuern sofort entfernt; die Prüfung wartet auf den neuen.

[Vollständiges Formular auf dem Handy](vorschau-kunde-komplett-mobil.png)
· [Anlage ohne Schwerpunkte](vorschau-ohne-schwerpunkte-mobil.png)
· [Bestehende Passwortseite](app-passwort-setzen-mobil.png).

[Quellen & Versorgung auf dem Handy](vorschau-quellen-mobil.png)
· [Desktop](vorschau-quellen-desktop.png)
· [Einordnung, Altbestand und Live-Momentaufnahme](versorgung-20261112.md).

Reproduzierbar, jeweils ohne Productionkennungen:

```sh
node scripts/lokal.js scripts/admin-einfach-test.js
node scripts/lokal.js scripts/verwaltung-einfach-browser.js
node scripts/lokal.js scripts/verwaltung-einfach-export.js /tmp/helmut-verwaltung.html
node scripts/lokal.js scripts/verwaltung-einfach-vorschau-browser.js
```

Die Browserprüfung verwendet einen wegwerfbaren lokalen Klon mit synthetischen
Daten, keine gemeinsame Testdatenablage und keine echten Nachrichten.
Native App-Routen bleiben serverseitig auf Administratoren beschränkt; jede neue
Assetdatei hat denselben Zugriffsschutz und eine feste Allowlist.

`scripts/profil-auswahl-paket.js` liest die vorhandenen Profillisten aus
`client.js` und `assets/profil-wahlkreise.json`, ohne den Client auszuführen.
App-Asset und Offlineexport entstehen daraus; `verwaltung/einfach/profil-auswahl.mjs`
ist die daraus erzeugte Dateifassung. Es gibt keine zweite gepflegte Wahlliste.

## Stand, Grenze und nächster Schritt

Branch `codex/verwaltung-kundenablauf-20261111`, [Draft-PR1155](https://github.com/ernisch/helmut-pilot/pull/1155).
Keine Freigabe zum Merge aus der Vorschau ableiten. Pflicht-CI auf dem jeweiligen
Codekopf bleibt vor einem späteren Merge erforderlich; sie wird durch lokale
Prüfungen oder den privaten Sites-Upload nicht ersetzt. Keine echte Konto- oder
Profiländerung ist Teil dieses Entwicklungsnachweises.

Nächster Schritt: Betreiber prüft den vereinfachten Ablauf unter der privaten
Vorschauadresse. Vor späterem Livegang bleiben aktuelle Profilanbindung,
Nachschub und wirklich gespeicherte Tagesbriefings separat nachzuweisen.
Rückweg: Kandidatenzugang nicht zum Haupteinstieg machen bzw. die zugehörigen
Änderungen zurücknehmen; vorhandene Oberflächen und Daten bleiben erhalten.

Historie: [erste Klickskizze](vorschau-v1.html), [49 damalige Entwurfsprüfungen](pruefung.json)
und [damaliger CI-Wartebefund](ci-wartebefund.json) bleiben erhalten. Diese 49
Prüfungen sind kein Beleg für die jetzige APIintegration.
