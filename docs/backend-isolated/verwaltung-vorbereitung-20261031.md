# Verwaltung vereinfacht und isoliert vorbereitet

Stand: 31.10.2026, Europe/Istanbul. **Code lokal umgesetzt und gezielt geprüft;
Einbindung in das laufende Helmut weiterhin offen.**

Der Betreiber hat nach dem lesenden Abgleich die Anpassung der Verwaltung
beauftragt: einfach, selbsterklärend, ruhig und an Apple orientiert. Die
ursprünglichen Grenzen für Motor, 500er-Arbeit, Kunden-UI und Production gelten
weiter. Der Verwaltungsentwurf genügt als Referenz; ein zweites Backend ist
nicht erforderlich.

## Ergebnis

Neue, eigenständige Ansicht unter `verwaltung/`, vollständig ohne neue Pakete:

- Vier Bereiche: Überblick, Profile, Betrieb und Kunden.
- Überblick mit wenigen Kennzahlen, konkreten Hinweisen und nächsten Schritten.
- Suche, Aktiv-/Problemfilter und Profilseiten mit höchstens 20 Einträgen;
  Detailansichten verwenden die vorhandenen Datenverträge.
- Betrieb trennt Abläufe, Quellen und Kosten. Ein Prozessabschluss wird nicht
  als fachlicher Qualitätsnachweis dargestellt.
- Kundenansicht verwendet Kontoangaben statt erfundener Büroorganisationen
  oder Rechnungsbelege. „Pausiert“ ist keine behauptete Zugangssperre.
- Helle Gestaltung, Systemschrift, klare Hierarchie, großzügige Abstände,
  mobile Karten statt breiter Tabellen, Tastatur- und Fehlerzustände.
- Ergebnisqualität bleibt „Nicht geprüft“, solange eine tatsächlich gebundene
  Tages-/Fachprüfung fehlt. Kein falsches Grün.
- Neue Tageskostenanzeige verwendet `kostenwahrheit.gesamt`; fehlende Preise
  erscheinen als „Offen“. Die alte Summe allein begründet keine Nullkosten.

Der neue Browserclient `api.mjs` kann ausschließlich sechs bestehende
Admin-Lesewege ansprechen. Keine Secrets, frei wählbare URL, neue Authentifizierung,
Schreibmethode, automatisches Polling oder Datenstatus-/Motoraufrufe.
Die Profile werden im Browser seitenweise dargestellt; die vorhandene
Overview-Route selbst wird dadurch nicht zu einer neuen Server-Paging-API.

Vorschau und Anschluss sind getrennt: `index.html` lädt nur klar deklarierte
Beispieldaten. `app.mjs` lässt sich später explizit mit `createAdminReader()`
auf einer eigenen Admin-Seite einbinden. Kein Queryparameter aktiviert einen
Livebetrieb. Kein Beispielwert ersetzt fehlgeschlagene echte Antworten.

## Nachweise

`node scripts/lokal.js scripts/verwaltung-isoliert-test.js`:
**30/30 Prüfgruppen bestanden**. Ein vorhandener Chromium, eigener temporärer
Browser, eigener Loopback-Server, synthetische Antworten. Desktop sowie
390/360/320 Pixel geprüft. Navigation, Suche, Filter, Detaildaten, Paging,
Tastatur-Sprunglink, 401/403/500, Teilfehler, XSS und unbekannte Kosten geprüft.
Browser → neuer tatsächlicher API-Client → lokale Antwortverträge → Anzeige
physisch belegt. Keine echte Datenbank oder Production-Verbindung.

Nach der zusätzlichen Härtung gegen geerbte Objekt-Schlüssel in der API-Allowlist
wurden die **14/14 Anzeige-/API-Vertragsgruppen** auf dem Endstand erneut
gezielt bestanden (`--contracts-only`). Diese 14 sind Teilmengen, keine weiteren
14 unabhängigen End-to-End-Nachweise. Die UI-Dateien blieben dabei identisch
zum bestandenen Browserlauf. Der unveränderte Export wird als einzelne HTML-Datei
ohne Modul-/Netzwerkbedarf geprüft.

Der erste Browserlauf endete im Testtreiber nach den positiven 401/403-Fällen:
Eine Navigation nur zum neuen Hash behielt absichtlich den gesperrten
Anwendungszustand und erfüllte die nächste XSS-Testvorbedingung nicht. Für diesen
unabhängigen Fall wird jetzt eine neue Dokumentnavigation verwendet. Kein
Produkt-/Berechtigungsfehler und keine Schutzumgehung. Erstfehlerlog erhalten;
kein gescheiterter Lauf als bestanden gezählt.

Belege außerhalb des Repositorys unter
`/workspace/helmut-claude-backend-evidence/verwaltung/`: Desktop-/Mobil-/Detailbild,
`verwaltung-offline.html`, vollständige Testlogs. Quell-/Log-/Artefakthashes und
Schutzprüfung im [JSON-Beleg](verwaltung-pruefbeleg-20261031.json).

## Isolation, Git und offene Integration

Branch `feat/claude-backend-isolated`, eigener Checkout
`/workspace/helmut-claude-backend-isolated`; ursprünglicher sauberer Main-Ausgang
`773f7aa545bfeac9429ef368c49e302e68772cc6`, vorheriger Analysecommit
`9a4fae428979895996e118070eadb98a8720b31a`. Abschlusscommit aus Git-Historie lesen.
Nur neue Verwaltungs-, Test-, Vorschau- und Dossierdateien. Keine bestehenden
Runtime-, Sicherheits-, Konfigurations-, Test- oder gemeinsamen Statusdateien
bearbeitet. Hashkontrolle für die 15 zuvor festgehaltenen geschützten Dateien in
beiden Checkouts. Ursprungsbranch, lokale Änderungen und Referenzen erhalten.

Keine Installation, Production-Abfrage, Daten-/Profil-/Cron-/Budgetänderung,
Modellanfrage, CI-Auslösung, Push, PR, Merge oder Deployment. Nur eigene
kurzlebige Browser-/Vorschauprozesse für den Test gestartet und geschlossen.
Aktuelle Motorarbeit wurde weder ausgeführt noch erneut getestet oder abgenommen.

Offen: Der bestehende Server liefert die neuen Assets noch nicht aus. Die
Kunden-SPA verwendet weiterhin ihre eigenen Dateien. Eine echte Anbindung,
Schreibaktionen und eine verlässliche Tagesbilanz erfordern einen späteren
gezielten Integrationsschritt; weder eine neue KI noch eine Datenmigration sind
damit automatisch notwendig oder freigegeben. Kein Production-Funktionsnachweis.

Nächster sinnvoller Schritt: die Offline-Vorschau im selben Chat gestalterisch
abnehmen, danach die kleinste geschützte Admin-Einbindung gesondert vorbereiten.
Für den vorliegenden lokalen Stand ist keine zusätzliche Freigabe erforderlich.
Empfehlung **Sol Hoch** für die nächste gezielte Sichtprüfung.
