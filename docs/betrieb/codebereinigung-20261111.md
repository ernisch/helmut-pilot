# Codebereinigung: erste Bestandsaufnahme und sichere Entfernung

Stand: 11.11.2026. Auftrag: gewachsenen Helmut-Code lesbarer machen und
nachweislich ungenutzte Oberflaechenreste entfernen. Keine Produktneugestaltung.

## Ausgangspunkt und Umfang

Die erste Sichtung erfolgte auf einer aelteren Arbeitskopie. Vor Aenderungen wurde
der aktuelle Hauptstand `4996e9a3229e26064606142419dc6b54b698b355` geladen.
Die schon in PR1058 entfernten 108 Funktionen und 768 CSS-Regeln werden hier
nicht erneut als neue Bereinigung gezaehlt. Aktuelle Profil- und Bueroarbeiten
werden bei der Integration erhalten.

Geprueft wurden Client-Funktionen und die App-Gestaltung gegen ihre moeglichen
Aufrufer bzw. Klassenverwendungen in Client, HTML, Server, Service Worker,
Bibliotheken und Vorlagen. Eine fehlende Verwendung in einem einzelnen
Browserdurchlauf genuegt nicht als Loeschnachweis.

## Entfernt: nachweislich ungenutzt

| Funktion in `client.js` | Frueherer Zweck | Nachweis |
|---|---|---|
| `renderHstandWhy` | frueherer eigener Warum-Abschnitt | nur Definition, kein Aufruf |
| `fallbackMeetings` | leerer Terminrueckfall | nur Definition; echte Termine bleiben im vorhandenen Pfad |
| `renderDecisionBlock` | fruehere Briefingkarte | kein Produktaufruf; bisher nur Textgrenze eines Tests |
| `publisherDomain` | fruehere Ableitung einer Verlagsdomain aus Namen | nur Definition; andere gleichnamige Modul-Funktionen bleiben erhalten |
| `radioValueGroup` | frueherer Auswahlgruppen-Helfer | nur Definition, kein Aufruf |
| `sourceExcerpt` | frueherer Client-Auszug | nur Definition; gleichnamige serverseitige Fachfunktion bleibt erhalten |

CSS: 154 vollstaendige Regeln entfernt und elf weitere Selektorlisten gekuerzt,
insgesamt 184 unbenutzte Selektoren. Betroffen sind alte Lage-Klappbereiche,
Wochenvorschau, Lernanzeige, Helmut-Statuskarten, alte Assessment-/Tippanzeigen
und deren mobile/helle Varianten. Bei gemischten Listen bleiben die verwendeten
Selektoren und alle Eigenschaften erhalten. Dynamisch zusammengesetzte
Klassenpraefixe sowie Bedingungen in `:not()` werden konservativ erhalten;
`:is()`/`:where()`/`:has()` duerfen nur bei durchgaengig unerreichbaren
positiven Alternativen entfallen.

Im Vergleich zum Ausgangsstand entfallen 541 Oberflaechen-Codezeilen und
23.041 Bytes aus Client/CSS. Keine neuen Projektabhaengigkeiten.
Der Quellenrollentest verwendet jetzt die vorhandene `renderDetailView` als
Textgrenze und prueft die gueltigen Grenzen ausdruecklich. Der Terminschutztest
behaelt seine Assertion und beschreibt keine entfernte Funktion mehr.

## Behalten: weiterhin gebraucht oder getrennt zu pruefen

| Bereich | Einordnung und naechste Bedingung |
|---|---|
| Heutige Ansichten, gemeinsame CSS-Tokens, responsive und helle/dunkle Varianten | weiter verwendet; Eigenschaften und Reihenfolge erhalten |
| Pilot-/Account-Zugang und alte/neue Verarbeitungswege | im Code bedingt erreichbar; keine produktive Nutzungspruefung in diesem Auftrag, daher keine Entfernung |
| Alte gespeicherte Datenformate und Rueckfaelle | benoetigen einen eigenen Nachweis zum Datenbestand, bevor sie entfallen koennen |
| Historische Migrationen, Nachweise, Sicherheits-, Budget- und Mandantenschutz | keine Loeschkandidaten dieses Auftrags |
| Pausierter DeepSeek-Router | laut aktueller Betreiberentscheidung ausdruecklich zu erhalten |

Weitere Client-Funktionen ohne Produktaufruf werden noch direkt von Tests benutzt,
darunter `renderVorgangCard`, `radarUpdatedLabel`, `learningSummary`,
`draftSourceCount`, `draftStatus`, `officeDraftText` und `officeDraftProvenance`.
Vor einer spaeteren Entfernung deren Zusicherungen auf die heute erreichbaren
Ansichten uebertragen. Buero-Helfer zusaetzlich mit der laufenden Bueroarbeit
abgleichen. Das ist eine konkrete Restliste, keine Freigabe zur Testabschwaechung.
Diese Bestandsaufnahme ist keine vollstaendige Unbenutztheitspruefung saemtlicher
Servermodule, Assets oder produktiver Konfigurationen.

## Pruefstand und Rueckweg

Vor Integration: JavaScript-Syntaxbaum entspricht bis auf die sechs entfernten
Definitionen dem Original. Verbleibende CSS-Selektoren, Deklarationen und
Medienbedingungen entsprechen strukturell dem Original; keine leeren
CSS-Regelgruppen. Die Analysewerkzeuge liegen nur unter `/tmp`.

Gezielte lokale Pruefungen ueber `scripts/lokal.js`: Quellenrollen 9/9,
Helmut-UI 126/126, Radar-UI 48/48, Lage-Frische/Live-Flow 26/26,
Schnellkern 14/14 Suiten. Isoliertes Chromium: Ausgangsstand 271 Pruefungen,
bereinigter Stand 562 Pruefungen, jeweils keine Browserfehler oder erfuellten
externen Anfragen. Unterschiedlicher Umfang durch den vorhandenen Baseline-Modus;
kein behaupteter pixelgleicher Bildvergleich.

Integration mit `bf4a43427fb8cf6acf04b988e97a635aac103b46` konfliktfrei;
der Strukturvergleich gegen diesen neuen Hauptstand besteht ebenfalls.
Schnellkern 14/14, lokaler Standard-Smoke im vorhandenen System-Chromium
114 PASS/0 FAIL, Quellenrollen 9/9 und Statusgroesse 4/4 bestanden.
Das fehlende Playwright-Headless-Shell-Binary beim ersten lokalen Start bleibt
als Umgebungsfehler erhalten; keine Aenderung an Produkt oder Testassertionen
war fuer den System-Chromium-Start erforderlich.

Der zusaetzliche isolierte Bildpruefer erwartete die Buero-Fehleranzeige noch
in der Uebersicht. Derselbe Fehler ist auf unveraendertem `bf4a4342` reproduziert:
PR1135 zeigt einen fehlgeschlagenen Entwurf erst beim gewaehlten Format.
Der bestehende Prueffall waehlt deshalb die Formatdetailansicht, akzeptiert
deren expliziten Fehlertext und prueft zusaetzlich, dass kein Teilenknopf erscheint.
Keine Produktanpassung und keine abgeschwaechte Fehler-/Quellenpruefung.
Abschliessender integrierter Bildprueflauf: 568 Pruefungen, keine Browserfehler,
keine erfuellten externen Anfragen; drei absichtliche Netz-Negativkontrollen
blockiert. Chromium `151.0.7922.173`. Gepruefte Dateien (SHA256):
Client `67d321fd9731e345743ca44999294f96bd7abfd1671190610b4fa9d837164916`,
CSS `944ebad002b7a75bcc00529894a1868905d20b0a6ffb2c3d0bcee27b4bc353fe`.
**Status: lokal fertig und geprueft; Veroeffentlichung offen.** Der erste Push
samt PR-Erstellung wurde vor Ausfuehrung durch die automatische Freigabepruefung
abgelehnt: Der neue Code wuerde ohne eine dafuer ausdruecklich bestaetigte
Freigabe auf GitHub veroeffentlicht. Eine anschliessende rein lesende Pruefung
bestaetigt `ernisch/helmut-pilot` als oeffentliches Repository. Die allgemeine
Projekt-Dauerfreigabe wurde vom Reviewer dafuer nicht als ausreichend anerkannt.
Die konkrete Betreiberbestaetigung fuer Push, PR und spaeteren Merge wurde
angefragt. Kein Push, kein PR, keine PR-CI, kein Merge und kein Deployment dieses
Bereinigungsstands. Nach Bestaetigung: Push/PR, gruene Pflicht-CI am tatsaechlichen
Kopf, aktueller Main-/Parallelitaetsabgleich, gebundener Merge und rein lesende
Deployment-/Dateikontrolle. Kein unbekannter Zustand wird als PASS ausgegeben.

Risiko: falsch eingeschaetzte dynamische Klassenverwendung. Dagegen stehen
konservative Verweissuche, Strukturvergleich und echte Browserpruefungen.
Rueckweg: gezielter Revert dieses Bereinigungs-PRs. Keine Migration,
Profil-/Datenmutation, Aenderung an Zugang, Verarbeitung, Cron, Budget oder
Deploymentkonfiguration.
