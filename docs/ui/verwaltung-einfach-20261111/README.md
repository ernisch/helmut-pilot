# Eine einfache Verwaltung: Kundenablauf und Zuordnung

Stand: 11.11.2026. Beauftragter **Entwurf**, keine Umstellung der laufenden Verwaltung.
Codegrundlage: `main` d6914b62. Alle Daten und Zeitangaben der
[klickbaren Vorschau](vorschau.html) sind fiktiv. Die Datei funktioniert offline;
sie hat keine API-Verbindung, keine dauerhafte Ablage und keine echten Aktionen.
Die unveränderte Originalverwaltung unter `verwaltung/claude-original/` bleibt die
bisherige Produktvorlage. Dieser Entwurf ist ein Vorschlag für ihre Vereinfachung.

## Entscheidung

Eine gemeinsame Verwaltung mit drei Einstiegen: **Übersicht, Kunden, Einstellungen**.
Jeder Kunde erhält eine gemeinsame Seite für Kontakt, Mandat, Zugang und Versorgung.
Die benötigten vorhandenen Funktionen werden schrittweise dort eingeordnet.
Der Übergang über „Erweiterte Werkzeuge“ bleibt bis zur geprüften Übernahme erhalten.
Keine zweite Kontodatenbank, kein neues Backend und keine pauschale Datenfusion.

Das setzt [OP-33](../../datenmotor-restliste.md#op-33--admin-funktionen-schrittweise-in-verwaltung-einordnen-06112026-p2)
konkret fort. Die dortige Zuordnung bleibt die kanonische Funktionsrestliste;
dieses Dokument beschreibt den vorgeschlagenen Bedienablauf, keinen neuen Betriebsstand.

## Was bereits vorhanden ist

Der gemeinsame Einstieg existiert bereits: `/verwaltung/` führt über „Erweiterte
Werkzeuge“ nach `/?admin-tools=1`, mit Rücklink. Es gibt zwei Oberflächen auf
vorhandenen Backendrouten. Die lokale Ausgangsvorlage vom 27.10. war älter;
diese Analyse verwendet den am 11.11. frisch geladenen Hauptstand.

| Aufgabe | Beleg im aktuellen Code | Konsequenz für den Entwurf |
| --- | --- | --- |
| Kundenkonto anlegen | `verwaltung/original-customer-form.mjs`, `original-actions.mjs`: gesperrtes Konto, Kundenname/Ansprechpartner/Tarifwunsch in interner Notiz; kein neues Profil, keine Einladung | Kontakt anlegen ist nur der erste Schritt. Erfolg der Kontoanlage darf keine funktionierende Versorgung behaupten. |
| Konto und Mandat verbinden | `original-adapter.mjs`: `userId`/`politicianId`, Kundendetail verlinkt Profil; Profilreferenz kann ohne tatsächliches Profil existieren | Gemeinsame Kundenseite verbindet bestehende IDs. Fehlende, abweichende oder mehrfach belegte Zuordnung offen zeigen; niemals per Namensähnlichkeit verbinden. |
| Profil prüfen | `GET /api/admin/profile/:id`, `lib/helmut/profile-validation.js` | Fehlende Pflichtangaben und ihre Auswirkung direkt beim Kunden erklären. Aktivierung ist eine eigene Entscheidung. |
| Aktuelle Ergebnisse prüfen | `GET /api/admin/ergebnisse`, `lib/helmut/admin-ergebnisstand.js`, `verwaltung/original-ergebnisse.mjs` | Vorhandene Bilanz für Briefing, Bereitstellungsquittung und Lage wiederverwenden. Radar bleibt Teil des Briefings. |
| Ergebnisumfang erkennen | `verwaltung/api.mjs`, `original-ergebnisse.mjs`: Seiten und Vollständigkeit; Ergebnisbilanz bezieht sich auf aktive Profile | Ein nicht erfasstes oder inaktives Profil ist „Nicht geprüft“ bzw. „Pausiert“, kein Versorgungserfolg. Profilbestand muss bestätigt sein. |
| Kontozugang ändern | `verwaltung/original-actions.mjs`: eigene servergeprüfte Zugangsaktionen; Kontostatus und `active` getrennt | „Zugang freigegeben“ und „Profil wird versorgt“ bleiben verschiedene Aussagen. |
| Einladung | Alte Adminansicht in `client.js`, vorhandene Kontorouten | Erst im bewussten Schritt „Zugang bereitstellen“ anschließen. Bestehende Einmal-/Zeitbindungen und Zustellwahrheit erhalten. |
| Technische Diagnose | Alte sieben Adminbereiche, neue Quellen-/Kosten-/Laufansichten | Aus dem konkreten Kundenproblem in passende Details führen. Die gesamte Werkzeugansicht bleibt vorerst erreichbar. |

Die älteren Integrationshinweise in `verwaltung/README.md` und den Dokumenten vom
04.11. sind keine aktuellen Productionbelege. Maßgeblich für den datierten
Rolloutstand ist [CURRENT_STATE](../../CURRENT_STATE.md#navigation-und-verwaltung-live-06112026).
Dieser Auftrag hat keine frische Production-Kundensitzung geprüft.

## Der tägliche Ablauf

1. **Übersicht öffnen:** zuerst konkreter Handlungsbedarf mit betroffenem Kunden
   und einem nächsten Schritt. Wenige Zahlen zum bestätigten Bestand, keine
   Übersicht sämtlicher Technikwerte. Testprofile und inaktive Profile zählen
   nicht still als zahlende oder versorgte Kunden.
2. **Kunden öffnen:** eine Liste mit Suche, einem verständlichen Hauptzustand
   und „Kunde anlegen“. Mandatsprofile sind dort über ihren Kunden erreichbar;
   Profile ohne zugeordnetes Kundenkonto bleiben über einen Inventarzugang unter
   Einstellungen sichtbar und werden nicht verborgen oder automatisch umgewandelt.
3. **Kundenseite lesen:** Hauptzustand, Grund, letzter belegter Stand und genau
   eine passende Hauptaktion. Darunter Versorgung sowie Einrichtung/Kontakt.
   Fachliche Beurteilung bleibt eigenständig sichtbar. Technische Details lassen
   sich aufklappen. Kein Wechsel zwischen getrennten Kunden- und Profillisten nötig.

## Einen Kunden einrichten

| Schritt | Oberfläche | Gesicherte Aussage / Grenze |
| --- | --- | --- |
| 1. Kontakt | Kundenname, Ansprechpartner, E-Mail; „Konto anlegen“ | Bestehenden gesperrten Kontopfad nutzen. Tarif/Preis optional später; die heutige Pflicht zum Tarifwunsch im Formular ist für die spätere Umsetzung gesondert anzupassen. Kein automatischer Versand. |
| 2. Mandat | Bestehendes freies Profil auswählen oder dessen vollständige Einrichtung gezielt fortsetzen | Bundestag/Landtag, bei Landtag Bundesland, Region/Wahlkreis, Partei **und** Fraktion, Themen/Ausschüsse und Zulassung anhand bestehender Regeln prüfen. Keine Identität, Zugehörigkeit oder vollständige Profilanlage erfinden. Die Vorschau verkürzt diesen Schritt und kennzeichnet die offenen Prüfungen. |
| 3. Versorgung | Vorhandene aktuelle Nachweise für das zugeordnete Mandat lesen | Kein Modellaufruf und kein Recovery durch das Öffnen. Inaktive neue Profile haben noch keinen Live-Versorgungsnachweis. Vorbereitung, gesonderte zulässige Aktivierung und anschließender wirklicher Nachweis bleiben getrennt. |
| 4. Zugang | Ergebnis zusammenfassen, Zugang bewusst bereitstellen | Konto-/Profilstatus und heutige Versorgung getrennt zeigen. Einladungslink erstellen/versenden ausschließlich durch ausdrückliche Aktion, nie nebenbei durch Speichern oder Prüfen. |

Die drei Vorschauseiten **Kontakt → Mandat → Prüfen** illustrieren die Eingabe
und Zusammenfassung. Die betrieblichen Schritte 3 und 4 werden dort ausschließlich
als „Nicht geprüft“ und „Gesperrt“ gezeigt. Keine simulierte Aktivierung oder
vorgebliche erfolgreich abgeschlossene Versorgung.

## Zustände, die man ohne Fachwissen versteht

| Hauptzustand | Wann er zulässig ist | Nächster Schritt |
| --- | --- | --- |
| Einrichtung offen | Kontakt vorhanden, aber Zuordnung, Pflichtangaben oder notwendige Prüfung fehlen | Einrichtung an der konkret offenen Stelle fortsetzen |
| Pausiert | Gespeicherter Profilstatus bestätigt, Versorgung bewusst inaktiv | Grund und letzten bekannten Stand ansehen; keine automatische Aktivierung |
| Geplant / In Bearbeitung | Der erwartete Bereitstellungszeitpunkt liegt noch bevor bzw. ein aktueller laufender Prozess ist tatsächlich belegt | Zeitpunkt oder belegten Fortschritt anzeigen; vor der vereinbarten Frist keinen fehlenden Tagesstand als Ausfall melden |
| Noch nicht geprüft | Daten nicht gelesen, Quelle unbestätigt, Zuordnung unklar, Ergebnisumfang unvollständig oder aktueller Nachweis fehlt | Vorhandene Nachweise lesen; Lesefehler ausdrücklich anzeigen |
| Briefing fehlt / Stand veraltet | Für den geprüften Berliner Tag und tatsächlich erwartete Versorgung fehlt ein Paket oder der Nachweis ist zu alt | Versorgung und letzte bestätigte Verarbeitung ansehen; Ursache nur nennen, wenn belegt |
| Technisch aktuell | Bestätigter Profilbestand, eindeutige Zuordnung, aktuelle vollständige Ergebnisnachweise und passende Bereitstellungsquittung | Vorhandene Ausgabe ansehen; fachliches Urteil separat offen halten |

Einrichtung und bewusste Pause werden vor Versorgungsfehlern bewertet. Ein frisch
angelegter, noch inaktiver Kunde ist nicht als Produktionsausfall zu zählen.
Fehler in einem Teilbereich bleiben sichtbar, auch wenn ein anderer Teilbereich
aktuell ist. Nachweise nennen Datenstand, geprüften Tag und Abfragezeitpunkt.
Die exakte Statusableitung ist vor der Liveumsetzung als kleiner gemeinsamer
Vertrag zu prüfen, statt verschiedene Ansichten unabhängig rechnen zu lassen.

Ein ruhiger Tag mit ausdrücklichem gültigem Nachweis ist zulässig; daraus folgt
keine Störung. Umgekehrt beweisen gefundene Karten oder ein erfolgreicher Prozess
keine vollständige aktuelle Versorgung. Die heutige Ergebnisroute unterscheidet
strukturelle Vollständigkeit und Fachurteil bereits. „In App bereitgestellt“
benennt hier die technische Ausgabequittung; tatsächlicher Empfang, Login oder
E-Mail-Zustellung wird daraus nicht abgeleitet. Keine pauschale Aussage „Alles läuft“.

## Was wohin wandert

| Heute vorhanden | Vorgeschlagener Zugang | Reihenfolge |
| --- | --- | --- |
| Übersicht und Ergebnisbilanz | Übersicht mit Handlungsbedarf; Kundenseite mit Versorgung | Zuerst lesend verbinden |
| Nutzer & Kunden, Profile, Einladungs-/Zugangsaktionen | Gemeinsame Kundenseite und geführte Einrichtung | Nach bestätigter Zuordnung einzeln anschließen |
| Kundenpreise, Zahlungsstand, Notizen | Beim jeweiligen Kunden unter Vereinbarung | Bestehende Felder nutzen; keine Rechnungsanbindung behaupten |
| Quellen, Pipeline, KI-Kosten, Laufzeiten | Einstellungen → Quellen und Abläufe / Kosten; direkte problembezogene Verweise | Vorhandene Detailansichten zunächst verlinken |
| System & Sicherheit, Audit, Recovery, Backfills, Testbriefing | Einstellungen → Erweiterte Werkzeuge | Vorhandene Schutzabfragen erhalten |
| Unzugeordnete und synthetische Mandatsprofile, Zuweisungen | Einstellungen → Profilbestand; zugeordnete Profile zusätzlich beim Kunden | Bestand und Zuweisungen vollständig erhalten |
| Datenschutzexport und Löschung | Bewusste Einzelaktionen im Kundenkontext | Berechtigungen, Rückfragen und vorhandene Löschverträge erhalten |

## Umsetzung in kleinen Schritten

1. **Dieser Auftrag:** Bestand abgleichen, Entwurf und Vorschau erstellen und
   gezielt prüfen. Keine ausgelieferte Oberfläche oder laufende Versorgung ändern.
2. **Erste Liveetappe:** Kundendetail ausschließlich lesend aus bestehenden Konto-,
   Profil- und Ergebnisrouten zusammenführen. Kein neues Schema. Ergebnisdaten nur
   für den bestätigten Tag/Umfang verwenden; Fehlzuordnungen und Ladefehler sichtbar.
   Wenn der vorhandene Ergebnisvertrag einen nötigen Nachweis nicht liefert, bleibt
   der Teilzustand offen; eng begrenzte Ergänzung erst mit fachlichem Bedarf.
3. **Versorgung zuerst nachweisen:** Aktuellen dokumentierten Nachschubfehler separat
   behandeln und den nächsten regulären Lauf lesend prüfen. Kein Reset, zusätzlicher
   Lauf oder neues Budget aus diesem Entwurf ableiten. Datierte Diagnose:
   [Radar-Ausschluss und Nachschub](../../betrieb/radar-ausschlussdiagnose-20261111.md).
4. **Einrichtung schrittweise anschließen:** Bestehende gesperrte Kontoanlage,
   Zuordnung/Profilpflege und bewusste Einladung einzeln übernehmen. Eingaben bei
   Fehlern erhalten; unbekannten Schreibausgang zuerst lesend auflösen, keinen
   automatischen zweiten POST oder automatische Löschung zum Aufräumen.
5. **Navigation reduzieren:** Erst nach geprüftem Ersatz der jeweiligen Zugänge
   die drei Hauptbereiche ausliefern. Die Originaldateien und historischen Belege
   bleiben erhalten. Die Übergangsansicht erst nach vollständiger Funktionszuordnung
   und nachgewiesenem Rückweg ablösen.

Nächste Umsetzungsaufgabe ist ausschließlich Schritt 2: **eine gemeinsame lesende
Kundenseite**. Der vollständige Verwaltungsumbau wird nicht zusammen mit der
Briefingreparatur in einen einzigen Sprint gepackt.

## Abnahme des Entwurfs

- Drei Hauptbereiche, Kundenliste mit Suche und gemeinsame Kundenseite.
- Fiktive Fälle für fehlendes Briefing, technisch aktuellen Stand mit offenem
  Fachurteil, offene Einrichtung und unbekannte Prüfdaten.
- Geführte Erfassung mit Pflichtfeldern, Rückweg und erhaltenen Eingaben.
- Kein API-Aufruf, keine dauerhafte Speicherung, keine echten Änderungen oder
  Nachrichten. CSP sperrt Netzwerkverbindungen und Formularversand zusätzlich.
- Desktop, schmale Mobilansicht, Tastatur/Fokus, Sonderzeichen und Fehlerzustände
  gezielt in Chromium prüfen; keine Wiederholung fachfremder Motor-/Lasttests.

## Tatsächliche Prüfung

Die gezielte lokale Chromiumabnahme ist in [pruefung.cjs](pruefung.cjs)
reproduzierbar. Sie benötigt vorhandenes Playwright und `/usr/bin/chromium`:

```sh
node scripts/lokal.js docs/ui/verwaltung-einfach-20261111/pruefung.cjs
```

Der lokale Schutzstarter entfernt Productionkennungen. Chromium läuft ohne
Netzzugang; die eigenständige HTML-Datei wird direkt in einen frischen Kontext
geladen. Der erste Versuch über eine `file:`-Navigation wurde von der vorhandenen
Chromiumrichtlinie mit `ERR_BLOCKED_BY_ADMINISTRATOR` abgewiesen. Die erfolgreiche
Prüfung lädt deshalb ausschließlich den HTML-Inhalt in den netzlosen Kontext;
kein zusätzlicher Server oder Productionzugriff.

Der maschinenlesbare [Prüfbeleg](pruefung.json) enthält den tatsächlichen Endlauf.
**Lokale Abnahme erfolgreich: 49 Prüfungen**, Chromium 151.0.7922.173,
1440/390/360/320 Pixel, keine JavaScriptfehler und keine externen Anfragen.
Der kanonische CI-Prüfplan klassifiziert den Diff als reine Dokumentation;
Motor-, Datenbank- und Produkt-Browsersuiten sind dafür bewusst nicht erforderlich.
Bildbelege: [Übersicht Desktop](uebersicht-desktop.png),
[Kundenseite Desktop](kunde-desktop.png), [Kundenseite Mobil](kunde-mobil.png),
[Kundenanlage Mobil](anlegen-mobil.png). Das sind Entwurfsbelege, kein Nachweis
der Livefunktion oder behobener Briefingversorgung.
