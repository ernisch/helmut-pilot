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

Integration, Pflicht-CI, regulaeres Deployment und abschliessende Nachkontrolle
werden nach Abschluss hier belegt. Ein fehlendes Playwright-Headless-Shell-Binary
im lokalen Standard-Smoke wird als Umgebungsfehler erhalten; der vorhandene
System-Chromium dient fuer den lokalen Smoke.

Risiko: falsch eingeschaetzte dynamische Klassenverwendung. Dagegen stehen
konservative Verweissuche, Strukturvergleich und echte Browserpruefungen.
Rueckweg: gezielter Revert dieses Bereinigungs-PRs. Keine Migration,
Profil-/Datenmutation, Aenderung an Zugang, Verarbeitung, Cron, Budget oder
Deploymentkonfiguration.
