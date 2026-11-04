# Sprints A/B: isolierte Prüfung und Originalvergleich

Stand: 04.11.2026. Prüfziel war der vorhandene Backend-Branch
`feat/claude-backend-isolated`, Commit
`ae18658e5caac2b39403c0e41e3a8af5c2b3d7be`.
**Die gezielten Prüfungen sind abgeschlossen. Designübereinstimmung,
Datenbank-/RLS-Abnahme und 500er-Abnahme sind damit nicht belegt.**

## Unveränderter Start und getrennte Arbeit

Der Arbeitsstand war vor Beginn sauber. Die bereits vollständig gelesenen
Pflichtdateien `AGENTS.md`, `CLAUDE.md`, `docs/START_HERE.md` und
`docs/CURRENT_STATE.md` waren unverändert; die Prüfung hat keine zusätzlichen
geltenden `AGENTS.md` gefunden. Die konkreten Grenzen dieses Auftrags haben
Vorrang vor älteren allgemeinen Merge-/Deploymentfreigaben im Repository.

Sprint A lief im frischen lokalen Klon
`/workspace/helmut-backend-sprint-a-20261104`; Sprint B parallel im unabhängigen
Klon `/workspace/helmut-backend-sprint-b-20261104`, jeweils auf demselben Commit
und bestehenden Branchnamen. Keine fremden Branches wurden ausgecheckt oder
verändert. Die Klone lesen vorhandene Git-Objekte, haben aber eigene
Git-Metadaten. Es gab keinen Fetch und keinen externen Dienstzugriff.

Es wurden ausschließlich neue Prüfskripte und Beleg-/Dokumentationsdateien
hinzugefügt. Bestehende Produkt-, UI-, Motor-, CI- und Konfigurationsdateien
bleiben unverändert. Der abschließende [Integritätsbeleg](sprints-ab-integritaet-20261104.json)
enthält Hashvergleiche und lokale Branch-/Statusbelege. Remote-Branchstände und
offene PRs wurden wegen des Verbots externer Zugriffe nicht erneut abgefragt.

## Sprint A: echter lokaler Server, sechs GET-Leserouten

**56/56 Prüfgruppen bestanden, Exitcode 0.** Es wurde die echte exportierte
HTTP-Anwendung aus dem isolierten Klon gestartet, nur auf `127.0.0.1` und einem
zufälligen freien Port. Der Test verwendete echte lokale Konten, Login,
Sitzungscookies und den vorhandenen lokalen Speicher. Die ausschließlich
synthetischen Profile blieben inaktiv. Keine bestehende Datenablage wurde
eingelesen. Der neue Testspeicher wurde anschließend entfernt.

| Bestehende Leseroute | Nachgewiesene Berechtigungen |
| --- | --- |
| `GET /api/admin/overview` | anonym/ungültige Sitzung 401, Abgeordneter und unzugeordneter Referent 403, Admin ohne Mandat 200 |
| `GET /api/admin/stats/budget-today` | dieselben fünf Fälle |
| `GET /api/admin/customers` | dieselben fünf Fälle |
| `GET /api/admin/sources-status` | dieselben fünf Fälle |
| `GET /api/admin/stats/process-runs?limit=20` | dieselben fünf Fälle |
| `GET /api/admin/profile/:id` | dieselben fünf Fälle |

Zusätzlich belegt: leere Kunden-/Lauflisten, bestehende Antwortformen,
USD-Kostenvertrag, keine Passwort-/Sitzungsgeheimnisse in Antworten,
gesperrter Fremdmandatszugriff, ungültige Profilkennung, unvollständiges Profil
und Zugriffsentzug bei einem bereits angemeldeten deaktivierten Admin.
Der vorhandene `verwaltung/api.mjs`-Leser konnte alle sechs Routen dieses echten
Servers lesen. Die Oberfläche wurde dabei weder eingebunden noch verändert.

Lesefehler wurden gezielt durch ausschließlich prozesslokale Funktionsersatzwerte
an `accounts`/`storage` ausgelöst, vor Import des unveränderten Servers.
Übersicht, Kunden, Budget und Prozessläufe antworteten mit generischem HTTP 500,
ohne den synthetischen privaten Fehlermarker im Antworttext. Bei Übersicht und
Kunden greift der injizierte `listUsers`-Fehler bereits in der gemeinsamen
Mandatsauflösung. Das ist kein Beleg für einen realen Datenbankausfall.
Quellenfehler blieben ausdrücklich unbekannt statt als gesunde Nullwerte zu erscheinen.

**Offener Befund:** Die Profilroute fängt einen Lesefehler ab und liefert wie bei
einem fehlenden Profil ein neutrales Profilobjekt mit unvollständiger Validierung
und HTTP 200 (`server.js:2584` ff.). Die UI kann deshalb den Ausfall und einen
fehlenden Datensatz nicht zuverlässig unterscheiden. Das bestand bereits vorher;
der gemeinsame Handler wurde nicht geändert. Der grüne Test belegt dieses
Verhalten, keine fachliche Freigabe der Fehlerbehandlung.

Der [Einzelbeleg](sprint-a-pruefbeleg-20261104.json) enthält alle Prüfgruppen,
HTTP-Statuscodes, den geprüften Commit, Skripthash und Grenzen. Vollständiges
lokales Protokoll:
`/workspace/helmut-claude-backend-evidence/sprints-20261104/sprint-a-lauf-1.log`.

## Sprint B: bestehende Produktverträge

**10/10 neue Vertragsgruppen und 182 bestehende Assertions bestanden**, alle
fünf Befehle mit Exitcode 0. Das sind isolierte VM-/Adapterprüfungen, keine
192 HTTP-End-to-End-Prüfungen. Details und Pfadbelege stehen im
[Schnittstellenbericht](sprint-b-schnittstellen-20261104.md), die unveränderten
Ausgaben und Hashes im [Sprint-B-Beleg](sprint-b-pruefbeleg-20261104.json).

- Lage, Radar und Briefing verwenden den vorhandenen gemeinsamen Appstart-
  und Briefingvertrag; für ihre lesende Anbindung ist kein zweiter Generator nötig.
- Büro verwendet im bestehenden Client `POST /api/communication/generate`.
  `POST /api/office/generate` ist ein anderer vorhandener Weg. Beide bleiben getrennt.
- `GET /api/app/start` erfasst Kontoaktivität. Der bestehende Büroclient kann
  Entwürfe im Hintergrund erzeugen. Eine vollständige Kunden-UI live zu öffnen
  ist deshalb keine garantiert folgenlose Leseprüfung. Hier wurde sie nicht gestartet.

## Sichtbarer Vergleich mit der verbindlichen Claude-Vorlage

Originalquelle ist das unveränderte ZIP `Helmut Backened.zip`, SHA256
`402c025b2b58b581312e290f70e3503af8e4b396867be78ae3415ad448938384`.
Es wurde ausschließlich in einen neuen Belegordner entpackt.
Der Originalprototyp benötigt React/ReactDOM/Babel von einem externen CDN.
Diese Laufzeit war lokal nicht vorhanden und wurde nicht heruntergeladen.

Deshalb wurde eine **statische DOM-Projektion** aus Originaltemplate,
`renderVals()`, Original-Beispieldaten, CSS und mitgelieferten Schriften erstellt.
Sie führt keine Originalinteraktionen und keine React-/DC-Laufzeit aus und ist
kein Nachweis vollständiger Pixelidentität oder Bedienbarkeit. Die Projektion
ist ausschließlich ein Prüfmittel, keine Ersatzoberfläche. Die Originaldateien
und sämtliche bestehenden UI-Dateien blieben unverändert.

Im vorhandenen lokalen Chromium entstanden sechs Bilder: Original dunkel,
Original hell und zuvor vorbereitete Ansicht, jeweils bei 1440 und 390 Pixeln.
Die ursprüngliche Einblendanimation wurde vor der Aufnahme abgewartet.
Es gab keine API-Anfragen und keine beobachteten externen Browseranfragen.

**Nachgewiesene Abweichung:** Original mit Spectral/Hanken Grotesk und
212-Pixel-Seitenleiste; vorbereitete Ansicht aus `ae18658e` mit Systemschrift
und 228-Pixel-Seitenleiste. Navigation, Karten-/Zeilenstruktur und Gestaltung
weichen sichtbar ab. Die vorbereitete helle Ansicht erhält keine visuelle
Freigabe und wird nicht zur verbindlichen Vorlage erklärt.

Der [Bildvergleichsbeleg](sprints-ab-designvergleich-20261104.json) enthält
Messwerte und Bildhashes. Lokale Bilder:

- [Original dunkel, 1440 Pixel](../../../helmut-claude-backend-evidence/sprints-20261104/original-dunkel-1440.png)
- [Original hell, 1440 Pixel](../../../helmut-claude-backend-evidence/sprints-20261104/original-hell-1440.png)
- [Vorbereitete Ansicht, 1440 Pixel](../../../helmut-claude-backend-evidence/sprints-20261104/vorbereitet-1440.png)
- [Original dunkel, 390 Pixel](../../../helmut-claude-backend-evidence/sprints-20261104/original-dunkel-390.png)
- [Original hell, 390 Pixel](../../../helmut-claude-backend-evidence/sprints-20261104/original-hell-390.png)
- [Vorbereitete Ansicht, 390 Pixel](../../../helmut-claude-backend-evidence/sprints-20261104/vorbereitet-390.png)

Die ersten zwei Versuche der eigenen Projektionshilfe scheiterten an einem
Interpolationsfehler. Die Ursache wurde gezielt behoben, Erstfehlerprotokolle
blieben erhalten. Der erfolgreiche Lauf und die abschließende Wiederholung
nach Korrektur des Aufnahmezeitpunkts betreffen ausschließlich das Prüfmittel.
Sie sind im Belegordner als `designvergleich-*.log` erhalten.

## Durchführung und Grenzen

Alle eigentlichen Prüfungen liefen über `scripts/lokal.js` mit einer kleinen
expliziten Umgebungs-Allowlist und Netzschutz. Vorhandene Pakete unter
`/workspace/helmut-pilot/node_modules` wurden nur gelesen; keine Installation.
Beispielaufrufe nach entsprechender Bereinigung der Umgebung:

```text
node scripts/lokal.js scripts/sprint-a-admin-leserouten-test.js --root /workspace/helmut-backend-sprint-a-20261104 --evidence /workspace/helmut-claude-backend-evidence/sprints-20261104
node scripts/lokal.js scripts/sprint-b-schnittstellen-test.js
node scripts/lokal.js scripts/sprint-ab-designvergleich.js --original "/workspace/helmut-claude-backend-evidence/sprints-20261104/original-unveraendert/design_handoff_verwaltung_v3/prototyp" --evidence /workspace/helmut-claude-backend-evidence/sprints-20261104
```

Der B-Befehl wurde im B-Klon ausgeführt. Der A-Test verweigert einen Lauf im
Entwicklungscheckout oder Originalcheckout und verlangt einen frischen eigenen
Klon ohne `.env` und Datenablage. Alle eigenen Server/Browser wurden beendet.
Keine laufenden fremden Prozesse wurden beeinflusst.

Nicht geprüft: Supabase/Postgres/RLS, reale Quellen, tatsächliche UI-Rundreise
der vier Produktbereiche, Original-React-Interaktionen, Last oder 500 Profile.
Kein externer Zugriff, kein kostenpflichtiger Modellaufruf, kein Push, Merge,
Deployment und keine Production-Aktion. Diese Ergebnisse ersetzen weder
Mock500 noch Production500 und behaupten keine neue Production-Freigabe.

## Nächster sicherer Schritt

Ein kleiner Sprint **„Originalverwaltung lesend anbinden“** in einem eigenen
Arbeitsbereich: vorhandene Darstellung und Komponenten der Claude-Vorlage
beibehalten, die sechs geprüften Leserouten über die vorhandenen Verträge
anbinden und Berechtigungs-/Leer-/Fehlerzustände eindeutig zeigen. Keine
Motoränderung und kein zweites Backend. Vorhandene UI-Arbeit zuerst gegen
diese Originalvorlage abstimmen.

Abnahme: gleiche Navigation, Typografie und Struktur wie das Original;
sichtbarer Vergleich in beiden Themen und Bildschirmgrößen; Daten ausschließlich
aus bestehenden Leserverträgen; gesperrte Zugriffe und unbekannte Werte korrekt;
keine Aktivierung, Erzeugung oder automatische Hintergrundaktion.
Der Profil-Lesefehler braucht zuvor einen abgestimmten kleinen Fehlervertrag
mit dem Eigentümer von `server.js`; diese gemeinsame Datei bleibt bis dahin
unangetastet. Mock500-/Production500-Dateien und bestehende Sperren bleiben erhalten.

Hier im selben Thread weiterarbeiten. Für diesen nächsten begrenzten Schritt:
**Hoch**, da es um vorhandene UI-Anbindung und gezielte Zustandsprüfungen geht.
