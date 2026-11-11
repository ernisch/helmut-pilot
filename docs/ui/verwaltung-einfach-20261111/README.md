# Kundenverwaltung: einfache Bedienung mit vorhandenen App-Routen

Stand: 11.11.2026. **App-Kandidat lokal geprüft, private Vorschau bereitgestellt;
PR1155 bleibt auf Betreiberwunsch Draft ohne Merge. Kein Liveumbau von Helmut.**

[Private Vorschau öffnen](https://helmut-verwaltung-vorschau-20261111.lueynohut.chatgpt.site)
· [Offlinevorschau](vorschau.html)
· [Kundenanlage auf dem Handy](vorschau-v2-anlegen-mobil.png)

## Was sich für den Betreiber ändert

- **Kunde anlegen:** nur Name und E-Mail. Kein zweiter Ansprechpartner, kein
  Tarifwunsch und kein Passwort. Der Kunde ist die Person des Mandats.
- **Eine Kundenseite:** Mandat ergänzen, Versorgung ausdrücklich aktivieren,
  heutigen Briefingstand prüfen und bei Bedarf einen Zugangslink erstellen.
- **Drei Einstiege:** Übersicht, Kunden, Einstellungen. Die Übersicht zeigt
  Kunden mit Handlungsbedarf. Fehlende Nachweise bleiben offen.
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
| Kunde anlegen | Vorhandene `createAdminActions` um eine persönliche Zweifeldanlage ergänzt: frischer Kontobestand, CSRF, gesperrter POST auf `/api/admin/users`, bestehende Kundenfelder per PATCH. Kein neuer CRM-Speicher und keine automatische Einladung. Unterschiedliche Namen/Tarife bleiben für das alte Formular weiter unterstützt. |
| Mandat laden und speichern | `GET/PATCH /api/admin/profile/:id`; vorhandene Mandatsprüfung und Zulassung bleiben serverseitig wirksam. Neue Profile bleiben ausdrücklich inaktiv. Bestehende Zusatzfelder werden erhalten; gespeicherte Werte werden wieder gelesen. |
| Versorgung aktivieren | Bewusste Einzelaktion mit Bestätigung; vorherige Profilprüfung, ausschließlich PATCH `{profileActive:true}`, anschließende Leseprüfung. Aktivierung erzeugt keinen Briefing-Erfolgsnachweis und startet keinen zusätzlichen Crawl oder Modellaufruf. |
| Briefing heute | Vorhandene `GET /api/admin/ergebnisse` mit Seitennachladen. Prüft aktuellen Berliner Tag und zusammenpassende Antwortseiten; fehlende/abweichende Antworten erzeugen keinen Erfolg. Briefing, Lage und Bereitstellungsquittung bleiben einzelne Aussagen. |
| Zugangslink | Vorhandene servergeprüfte Zugangsfreigabe und `POST /api/admin/users/:id/invite`. Einmalbindung, Gültigkeit und echter `mail.sent`-Status bleiben erhalten. Keine Passworteingabe durch den Betreiber. Der Link lebt nur in der aktuellen Ansicht und lässt sich ausblenden. |
| Kosten, Quellen, Abläufe | Bestehende Budget-/Quellen-/Prozessrouten. Unbekannte Beträge und fehlende Quelldaten werden erklärt; der vollständige Quellenbericht bleibt verlinkt. |
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

Lade-, Leer- und Fehlerzustände bieten einen nächsten Schritt. Eine fehlende
Profilquelle ist kein leeres Kundeninventar. Ein inaktives neues Profil gilt nicht
als versorgt. Unklare Schreibausgänge sperren weiteres Speichern und verweisen auf
Lesekontrolle; keine automatische Wiederholung oder Löschung. HTTP401/403 entfernt
Kundendaten und Formularwerte aus der Oberfläche. In direkten Vercel-Prüfvorschauen
sperrt die neue Oberfläche ihre Schreibaktionen gegen echte Kunden. Der reguläre Servereinstieg importiert
niemals den fiktiven Beispieladapter.

## Tatsächliche Prüfung

- **25 Gruppen mit Browser und echtem isoliertem Backend:**
  [Prüfbeleg](app-pruefung.json), [Desktop](app-uebersicht.png),
  [Kundenseite Mobil](app-kunde-mobil.png). Von der UI ausgelöste Kontoanlage,
  Profil-PATCH, explizite Aktivierung und Einmallink sind im lokalen Speicher
  nachgewiesen. Ergebnisstatus zusätzlich gegen synthetische bestehende
  Antwortverträge geprüft; die lokale Umgebung besitzt keinen produktiven V3-Speicher.
- **12 Gruppen für den Offlineexport:** [Prüfbeleg](vorschau-v2-pruefung.json),
  1440/390/360/320 Pixel, Zweifeldanlage, Beispielzustände, keine JavaScriptfehler
  und keine App-/Netzwerkverbindung.
- Bestehende Adminansicht: **104/104 Renderprüfungen** und **5/5 bestehende
  Verwaltungs-Ergebnisprüfungen** grün. Kein fachfremder Last- oder Modelltest.
- Ein zusätzlicher Negativfall erzeugte erwartungsgemäß eine HTTP401-Konsolenmeldung.
  Die erste Testfassung wertete auch diese erwartete Meldung als Fehler; die
  Korrektur unterscheidet ausschließlich den bewusst erzwungenen 401 von unerwarteten
  Browserfehlern. Die Entfernung der privaten Daten blieb ausdrücklich geprüft.

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
