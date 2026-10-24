# Einzelunit: private geprüfte Graphknoten weiterverwenden

Stand 24.10.2026. **Teilweise abgeschlossen:** Code und gezielte synthetische
Prüfungen vorhanden; neue native Qualifikation, unabhängige Endannahme und echter
Zeit-/RAM-Nachweis offen. Basis `2fc821fd7bbdef1cf9846001e041a847a9f58f8f`,
Branch `codex/unit60-js-state-work-20261024`. Kein Merge oder Productioneingriff.

## Ursache und Änderung

Untersuchter Aufrufpfad: Scope → Store → OriginalWriter → Atomic → Parts.
Der Store liest den eigenen Zustand frisch, OriginalWriter vergleicht ihn mit
der frischen Originalprojektion, Atomic öffnet den privaten Einmalzeugen.
`Parts.captureOwnMutation` baut anschließend den neuen Graphen auf.

Dabei wurden unveränderte private Teilbäume nochmals gehasht und als neue
Knotenobjekte aufgebaut. Die komplette Knotenliste wurde danach materialisiert,
obwohl Atomic daraus sofort alle bereits vorhandenen Knoten herausfilterte.

`auth-state-parts.js` verwendet im eigenen Einmalpfad jetzt die privaten
Knotenmetadaten weiter, bilanziert aber unverändert die gesamte erreichbare
Knotenmenge. Nur neue Knoten erhalten Transportobjekte. `llm-usage-atomic.js`
übernimmt dieses exakte Delta; der zusätzliche vollständige Hashsatz und dessen
nachgelagerter Filter entfallen. Allgemeine Vollschreiber, Textindex samt
Konsistenzprüfung und der kalte Normalformnachweis bleiben erhalten.

Das ist belegte vermeidbare JavaScript-Arbeit, **kein Nachweis eines dominierenden
Timeoutengpasses**. Von 65,839926211 Sekunden und neun Kontrollen lässt sich kein
vollständiger Lauf unter 60 Sekunden ableiten. Die sechs späteren Originalreads
wurden nicht entfernt; ihre Entbehrlichkeit ist weiterhin unbelegt.

## Sicherheitsbegründung

- Die frische Prüfung tatsächlicher Payloadbytes, SHA256, Struktur, Reihenfolge,
  Erreichbarkeit und Grenzen bleibt bytegleich zum gebundenen Originalleser.
  Zusätzliche Wiederverwendungsmetadaten entstehen erst nach dessen Annahme.
- Wiederverwendung ist nur über den privaten, zeitbegrenzten und vor Auswertung
  verbrauchten Einmalzeugen erreichbar. Keine Callerflags, Fremdobjekte,
  historischen Freigaben oder neuen Autoritätscaches.
- Alle alten Knoten zählen weiterhin gegen Knoten-, Payload-, Arbeits- und
  Tiefengrenzen. Das Transportdelta wird erst nach dieser Bilanz ausgegeben.
- CAS behält dieselben acht Felder einschließlich frischer Revision,
  vollständigem erwarteten State-/Historybeweis und Originalhash. Der private
  Zeuge hält seinen ursprünglichen Graphen auch dann, wenn spätere Leser den
  globalen Inhaltscache ersetzen. Bestätigungen, vollständige Historie und
  OriginalWriter-Rücklesungen bleiben erhalten. Unbekannt bleibt ohne Retry.
- Keine Änderungen an Zeitankern, Autorisierungszeit, 60-/30-Sekunden-Grenzen,
  beiden 19.900-ms-Wartezeiten, Kostenbindung, 16 Kontrollen oder drei Positionen.
  Harte RAM-Grenze 2.048.000.000 B und Ziel 1.548.000.000 B unverändert.
  Python, TransactionGuard und Router-/DeepSeek-Konfiguration unverändert.

## Tatsächlich ausgeführte synthetische Prüfungen

Alle Befehle über `node scripts/lokal.js -- node scripts/<Datei>`; keine echten
HTTP-, Datenbank-, Ressourcen- oder Anbieterläufe.

| Datei | Ergebnis |
| --- | --- |
| `local-unit-diagnostic-atomic-small-mutation-test.js` | 22 Gruppen PASS |
| `auth-state-parts-codec-test.js` | 14 Gruppen PASS |
| `auth-state-parts-graph-test.js` | 10 Gruppen PASS |
| `auth-state-parts-write-reuse-test.js` | 11 Gruppen PASS |
| `auth-control-view-test.js` | 19 Gruppen, 42 Negativfälle PASS |
| `local-unit-diagnostic-original-writer-test.js` | 43 Gruppen PASS |
| `local-unit-diagnostic-own-write-timing-test.js` | 3 Gruppen PASS |
| `local-unit-diagnostic-budget-routing-test.js` | 33 Checks PASS |
| `control-cache-source-integration-test.js` | FAIL: historische Quellbindung |

Der neue kleine Strukturfall prüft beim frischen Lesen alle 31 Payloads. Beim
eigenen Schreiben werden noch 15 vorherige Payloads erneut gehasht, insbesondere
neu aufgebaute virtuelle Buckets; 23.936 von zuvor 140.425 Payloadbytes. Nur zwei
Transportknoten statt einer vollständigen Liste von 31 werden erzeugt.
Root, vollständige erreichbare Hashmenge und gesendetes Delta stimmen exakt mit
einem kalten Vollaufbau überein. Keine Zeit-/RAM-Hochrechnung daraus.

Zusätzliche Negative prüfen unbekannte alternative Graphlayouts in kalten und
warmen Projektionen sowie CAS-Konflikte nach zwischenzeitlichem Cacheersatz.
Bestehende Negative decken unter anderem verlorene ACKs, veränderte Originale,
History-/Noncefehler, abgelaufene Zeugen und sämtliche globalen Grenzen ab.

Zwei Zwischenbefunde wurden korrigiert: Die erste neue SHA-Erwartung hatte
auch neu aufgebaute virtuelle Buckets als wiederverwendet gezählt; sie berichtet
jetzt die tatsächlich beobachtete Restarbeit. Ergänzte Metadaten innerhalb des
bytegebundenen Validators verletzten zunächst dessen Quellpin; sie liegen nun
außerhalb dieses unveränderten Validators. Beide betroffenen Suiten danach PASS.

## Offene Qualifikation und genau eine benötigte Messung

Die veröffentlichte native Qualifikation in
`scripts/helmut-resource-meter/control-cache-integration.js` bindet U/Parts
auf die vorherigen exakten Quellbytes. Der entsprechende Integrationstest lehnt
die geänderten Bytes korrekt ab (`32034 != 32050` beim U-Längenpin).
Historische Originale, Sourcepins, Annahmen und Prüftore wurden nicht umgeschrieben.
Der Entwurf ist damit **noch nicht als neue Laufzeitvariante qualifiziert**;
eine grüne Gesamt-CI wird nicht behauptet. Er benötigt eine eigene gültige
Qualifikationskette im Quellthread, keine Übertragung alter Akzeptanz.

Anschließend benötigt wird **ein vollständiger lokaler Einzelunitlauf** auf dem
bereits vorhandenen authentischen späten Zustand und dem gemeinsam integrierten,
frisch gebundenen Code. Derselbe ursprüngliche Zeitanker muss Autorisierung,
beide 19.900-ms-Wartezeiten, alle 16 Kontrollen, drei Ergebnispositionen und den
echten atomar bestätigten Abschluss einschließen. Vorhandene Scope-/Own-Timings
mitführen: vollständige Controlfolge und `readOwnAwait`/`writeOwnAwait` je Write;
verschachtelte Zeiten nicht addieren. Gemeinsamen Kernel-Speicherpeak bis zum
letzten eigenen Prozessende erfassen. Fehlende Kontrollen, fehlender Abschluss,
unbekannte Writes oder Fristverletzung bleiben FAIL, kein automatischer Retry.

Diese eine Messung entscheidet über Einzelunitzeit und lokalen Speicherabstand.
Sie ersetzt weder Voll500 noch dessen Plateau-/Gesamtreserveabnahme. Originale,
private Schlüssel und bestehende Cloud bleiben im Quellthread.

Rückweg: die beiden Laufzeitdateien gemeinsam auf den Basisstand zurücknehmen;
keine Datenmigration oder Wiederherstellungsoperation notwendig. Nächster Schritt
im Quellthread, Denkstufe **Sehr hoch**, wegen Qualifikations- und Abschlussbindung.
