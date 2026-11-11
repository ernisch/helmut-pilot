# Büro: kompakte Übersicht, Entwürfe nur auf ausdrücklichen Auftrag

Stand: 11.11.2026. Entwicklungszweig `codex/buero-formatwahl-20261111`,
Basis `3a012b0b`, Implementierung `d4ec99fd` in
[PR1135](https://github.com/ernisch/helmut-pilot/pull/1135).
Lokal umgesetzt und geprüft; Pflicht-CI am aktuellen PR-Kopf siehe PR1135.
Merge und Production noch offen.

Beim Öffnen von Büro wurde bisher das empfohlene Format des ersten Themas
ausgewählt und gegebenenfalls kostenpflichtig erstellt. Auch ein Themenwechsel
oder der Briefing-Verweis konnte die Erstellung auslösen. Der Betreiber hat
stattdessen ausdrücklich eine kompakte Übersicht mit verpflichtender Formatwahl
beauftragt: Ohne Erstellaktion kein neuer Text.

## Verhalten

- Die Übersicht zeigt die tatsächlich verfügbaren Themen und gültigen Entwürfe.
  Zwei Themen ohne gespeicherten Text ergeben `2 Themen · 0 Entwürfe`.
- Ganze Themenzeilen sind antippbar; Originaltitel werden auf zwei sichtbare
  Zeilen begrenzt, bleiben vollständig für assistive Technik und in der Auswahl
  beziehungsweise Detailansicht erhalten. Keine KI erzeugt Kurzüberschriften.
- Ein neues Thema öffnet eine native modale Formatwahl ohne vorausgewähltes
  Format. Erst `Statement erstellen`, `X-Post erstellen` oder eine andere
  ausdrückliche Erstellaktion startet einen Auftrag.
- LinkedIn, Instagram, Bürgerbrief und bei belegter Zuständigkeit Ausschussfragen
  bleiben unter `Weitere Formate` erreichbar. Formatliste, Abbrechen, Escape,
  Navigation, Neuladen und Briefing-Verweis erstellen keinen Text.
- Vorhandene gültige Texte bleiben im bisherigen profil-, anlass-, format- und
  tagesgebundenen Cache. Öffnen erzeugt keinen weiteren Auftrag. Ungültige oder
  abgelaufene Texte werden weder als bereit gezählt noch automatisch erneuert.
- Während einer Erstellung startet kein zweiter Auftrag. Nach einer Antwort
  wird keine zwischenzeitlich gewählte Variante automatisch eingereiht.
- Vorschau bleibt schreibgeschützt und als Vorschau sichtbar. Bestehende
  Quellen-, Mandats-, Sitzungs-, Kosten- und Antwortzeitschutzregeln bleiben.

## Schutz vor älteren geöffneten Clients

Die Büro-Route verlangt zusätzlich `office: true` und ausdrücklich
`userInitiated: true`. Ohne letzteres antwortet sie mit
`entwurf-nicht-beauftragt`, leerem Text und `aiEnabled: false`, bevor der
Routenrumpf Profil/Briefing liest oder Kosten/Modell aufruft. Der neue Client
übermittelt diese Kennzeichnung nur aus dem ausdrücklich aufgerufenen Generator.
Die Kennzeichnung ersetzt keine Authentifizierung, Mandantenprüfung oder
Kostenfreigabe. Ein noch geöffneter alter Client muss neu geladen werden.

`generateCommunicationDraft` hat im regulären Backend weiterhin ausschließlich
die bestehende Kommunikationsroute als Aufrufer. Es wurde kein neuer
Hintergrundauftrag, Zeitplan oder Generator eingeführt.

## Prüfung

- Syntax von Client/Server und `git diff --check`: bestanden.
- Schnellkern: 14/14 Suiten; lokaler Erstlauf durch gesperrte Loopback-Ports
  blockiert, freigegebener isolierter lokaler Wiederholungslauf bestanden.
- `office-antwortzeit-ui-test.js`: 13/13 Gruppen mit virtueller Zeit,
  einschließlich implizitem Aufruf, Doppelklickschutz, Cache und Auswahlwechsel.
- `buero-ehrlichkeit-test.js`: 68/68 Prüfungen. Die tatsächliche Serverroute
  weist fehlende/falsche Beauftragung vor dem aufgezeichneten Leser/Generator ab;
  ausdrücklich beauftragte Anfragen behalten kanonische Quellen und Zuständigkeit.
- Vollständiger unveränderter Browser-Bootstrap mit echten Client-/CSS-Bytes,
  simulierten Auth-/Start-/CSRF-/KI-Antworten und technisch isoliertem Netzwerk:
  Desktop 1440, Mobil 390/360, dunkel/hell, echte Seitenneuladung, Zählung,
  Formatwahl, Abbrechen/Escape, Cache, Quellen, Teilen, ungültige Anlässe,
  Fehler und Vorschau. Zusammenfassung: [verification.json](verification.json).
- Screenshots zeigen ausschließlich synthetische Testdaten:
  [Übersicht](mobile-overview.png), [Formatwahl](mobile-format-choice.png).

Der erste Browserlauf stoppte nach den neuen Navigationsprüfungen an einem
überholten Testzustand: Der Test hatte den Briefing-Verweis zuvor verlassen,
prüfte aber noch dessen Bindung. Vor der betreffenden Prüfung wird nun der echte
Briefing-Verweis erneut geöffnet. Kein Produktfehler wurde verdeckt.

Der erste Pflicht-CI-Lauf43026336007 stoppte ausschließlich in
`kosten-limits-test.js`: Die historische Quelltextauslesung suchte noch die
parameterlose Generatorsignatur und fand deshalb keinen Funktionsrumpf. Die
Auslesung akzeptiert nun Parameter und scheitert weiterhin bei fehlender
Funktion. Die Schutzbehauptungen wurden beibehalten; lokal20/20 bestanden.

Die zwei bestehenden Büro-HTTP-Fälle im historischen Integrationsrunner wurden
ebenfalls auf sichtbare Format-/Erstellaktionen umgestellt. Formatliste ohne
Request, HTTP429 ohne Alternative und Budgetfehler ohne Fertigtext bestehen.
Der vollständige historische Lauf stoppt danach nach115 bestandenen Prüfungen
an `quiet-desktop: quiet Briefing shows no Lage texts, only count and way to
Lage`. Das ist keine grüne Gesamtsuite. Der betroffene Ruhelage-Renderer ist
bytegleich zur Basis`origin/main`; diese Büro-Änderung korrigiert den alten
Ruhelage-Test nicht. Kein Baseline-Lauf behauptet. [Teilnachweis](integration-check.json).

Keine bezahlten Helmut-Modellaufrufe, Production-Datenänderungen,
Budgeterhöhungen oder Änderungen an bestehenden Reservierungen.
Pflicht-CI und anschließende Production-Abnahme sind getrennte Nachweise.

## Veröffentlichung und Rückweg

Client und Server müssen gemeinsam ausgerollt werden. Ein reiner Clienttausch
würde den Schutz vor automatischen Anfragen alter Clients nicht durchsetzen.
Die Auslieferung verwendet weiterhin die bestehende Commit-Assetversion.

Bei Darstellungsproblemen kann die CSS-Änderung gezielt zurückgenommen werden.
Die ausdrückliche Erstellpflicht im Client und die Abweisung am Server müssen
erhalten bleiben; ein pauschaler Rückweg darf keine ungefragte Erstellung
wieder aktivieren. Keine Migration oder Datenbereinigung erforderlich.
