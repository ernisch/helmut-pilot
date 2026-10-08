# Blocker 2: Timeoutdiagnose vorbereiten

Stand 08.10.2026. Eigener Branch auf main411e89673470226ae5b2d1cb501b36036da810cf.
**Nur Code-/Offline-Vorbereitung. Kein Merge, Production-Deployment oder neuer Eingabeabruf.
Fachliche Abnahme weiterhin0/500.**

Eine Draft-PR kann den regulären Vercel-Preview auslösen; dieser ist kein
Production-Rollout oder tatsächlicher Production-Eingabenachweis.

## Belegter Fehler und Grenze

Die neue Aufnahme37826938407 auf dem damals gebundenen READY-Commit802428e9
stoppte bei Position12: HTTP500, briefing-aufbauen / speicher-timeout. Getrennte
Bilanz11erfasst/1technischerFehler/488nicht erfasst; fachlich0angenommen,
2Ereignisduplikate,9fehlenderVollnachweis. Das Lauf-GO ist verbraucht.

Im festen Fenster08.10.,18:47–18:49UTC (21:47–21:49Türkei) wurden erst50,
danach vollständig324/324 gespeicherte Logereignisse geprüft:302Edge,
16Postgres,6PostgREST. Alle302Edge-Antworten HTTP200; darunter ein exakt
gefilterter Profil-GET für Position12. Passender Vercel-Fehlereintrag83ms vor
der beobachteten Fehlerantwort. Keine direkte Request-Verbindung, kein genauer
fehlgeschlagener Speicher-Endpunkt. Einzelne Edge-Zeitstempel und PostgREST-
Fehlertexte fehlen in den zurückgegebenen Attributen.

Provider-HTTP200 beweist nicht den rechtzeitigen Abschluss des Client-
Antwortinhalts: performSupabaseFetch begrenzt fetch und response.text() gemeinsam.
Dies erklärt die Vereinbarkeit der Befunde, beweist aber keinen Body-Hänger im
historischen Vorfall. Dessen konkrete Frist, Versuche und Ursache bleiben UNKNOWN.

## Diagnoseentwurf

Nur der vorhandene geschützte B2-Nurleseeinstieg öffnet einen isolierten
AsyncLocalStorage-Kontext. Der gemeinsame Transport beobachtet darin GETs.
Außerhalb des Kontexts werden keine Antwortattribute gelesen oder Daten gebunden.
Bei einem echten Transport-Timeout kann ein eingefrorenes Zusatzobjekt speicher
die folgenden eng begrenzten Werte enthalten:

- geschlossene Ressourcen-/Abfrageklassen statt Querywerten oder vollständigen URLs;
- vor-antwort-headern oder antwort-inhalt, tatsächliche Frist und monotone Dauer;
- tatsächlich gestartete build()- und vorherige Profil-Leseversuche;
- schon empfangenen HTTP-Status und optional SHA256 einer streng geprüften
  sb-request-id-UUID. Keine rohe Provider-ID oder freie Headerwerte gespeichert.

Opaque Beobachtungstoken und Fehlerbindung per WeakMap; fremde Fehlerfelder
erzeugen keine Diagnose. Ein wiederverwendeter Fehler aus einem anderen
Aufnahmekontext liefert keine alten Transportwerte. Die Versuchszähler zählen
build()/Profilaufrufe, nicht Datenbank-HTTP-Requests; auch ein erneut geworfener
Fehler erhält die aktuellen Aufrufzahlen. Der Providerhash erlaubt eine Zuordnung nur
bei tatsächlicher Übereinstimmung. Fehlende Metadaten bleiben unbekannt.
Keine zusätzlichen Requests, Header, Wiederholungen, Schreiber, Modelle oder Logs.
Fristen, Guards, Wiederaufnahmebudget, Fehlertexte und Erfolgs-DTO unverändert.
Der alte Vorfall erhält dadurch nachträglich keine neuen Belege.

## Offline-Prüfung

Alle Tests über scripts/lokal.js mit entfernten Production-Zugangsdaten:

| Prüfung | Ergebnis |
| --- | --- |
| Neue reale lokale HTTP-Gegenproben | 13/13: Header-,200-Body-,Fehler-Body-Timeout; ungültige Provider-ID; vorhandene Wiederaufnahmegrenzen; Parallelität; fremde und echte kontextfremde Token/Schreibmethoden; wiederverwendete Fehler innerhalb/außerhalb ihrer Aufnahme; feindlicher Getter; echte HTTP-Antwort/Logs ohne private Werte |
| Bestehende Supabase-Antwortfristen | 10/10:200ms und80ms, Verbindungsabbruch, nächste Antwort, HTTP-Redaktion, leere Antwort, ungültiges JSON |
| Bestehende B2-Aufnahme | 9/9Altgruppen und500/500inaktive synthetische Profile samt Kontrast-/Schutz-/Wiederaufnahmeproben |
| Bestehende B2-Lesediagnose | Bestanden: Fehleridentität, Klassen, Phasen, Getter, Profilsperren und sichere HTTP-Ausgabe |
| Neuer Modulsyntax- und Diffcheck | Bestanden |

Zwei begrenzte unabhängige lesende Reviews: DeepSeek V4 Pro High über den
vorgeschriebenen Router, jeweils status ok,0Änderungen, keine Reviewer-Tests.
Der Nachreview betrifft die korrigierte Kontextbindung und Versuchszähler.
Die empfohlene echte kontextfremde Tokenprobe ist anschließend ergänzt;
der geprüfte Laufzeitcode ist unverändert. Vollständiges
Diagnosemodul, Aufnahme, neue Testdatei und exakter geänderter Transportauszug
geprüft; nicht die ganze530KBStorage-Datei. Ihr übriger Inhalt ist unverändert.
Die Routerzusammenfassungen wurden verdichtet. Hinweise auf bestehende interne
Rohfehlermeldungen und begrenzte Redaktion sind keine neue allgemeine
Sicherheitsabnahme. Neue Suite im Standardlauf registriert. Der kanonische
CI-Plan verlangt konservative Standard-/Datenbankprüfung; Pflicht-CI vor Merge
am tatsächlichen Kopf prüfen. Lokale Gegenproben ersetzen diese nicht.

## Fachliche Nachweislücken

Bei allen11aktuellen Eingaben sind Originalvertrag, Profil und Paket gebunden;
vollständig positiv fehlen weiterhin:

1. vollständig notwendige Quellenauswahl;
2. sämtliche KO-Tatsachen mit tragenden vollständigen Quellenversionen;
3. alle Zuständigkeits-, Ebenen- und Resolverentscheidungen;
4. jede tatsächliche Briefingaussage und ihre individuelle Profilrelevanz.

875verschiedene Quellenversionen bzw.942Katalogeinträge pro Eingabe beweisen
keine notwendige individuelle Auswahl. Die42A-Zielprofile wurden im neuen Lauf
nicht erreicht. Alte Faktenurteile nur bei exakt gleicher KO-/Quellenversion
nutzen; niemals alte Eingaben oder ganze Profilurteile als aktuelle ersetzen.
Die2Duplikatfälle bleiben offen. C-Löschung bleibt wegen der Reservierungsbindung
gesperrt; beide KO-/Quellenidentitäten erhalten.

## Nächster Freigabepunkt

Ausschließlich der geprüfte Diagnose-PR: Merge und reguläres Deployment mit
rein lesender Identitäts-/52-Tabellen-Nachkontrolle, ohne App-Eingabeabruf.
Noch nicht freigegeben. Ein später erforderlicher kleiner Diagnoseabruf für
Position12 braucht einen eigenen genau vorbereiteten Umfang. Der vorhandene
Einzelreader ist fest auf122gebunden; nicht als12er Reader ausgeben oder still
umschalten. Keine weitere500er Aufnahme aus diesem Entwurf.

## Private Belege

Originale außerhalb von Git, serverseitige Verzeichnisse:
blocker2-post-pr872-37826938407,
blocker2-timeout-log-diagnostic-37826938407-20261008,
blocker2-timeout-complete-window-37826938407-20261008,
blocker2-timeout-diagnostic-package-20261008.
Original-Toolantwort der vollständigen Logabfrage SHA256:
6f63d2f769fa2e5875a38c7c36038033c3f479250dde7914b3063220b774307e.
Keine privaten Logs, Schlüssel, Profil-/Quellenvolltexte oder Drive-IDs im PR.
Keine Sicherungs-/Retentionänderung.
