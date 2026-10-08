# Blocker 2: Timeoutdiagnose vorbereiten

Stand 09.10.2026 (Rollout-Ergebnis ergänzt); Vorbereitungsstand 08.10.2026 auf
eigenem Branch main411e89673470226ae5b2d1cb501b36036da810cf.
**Historischer Vorbereitungsumfang (08.10.): Nur Code-/Offline-Vorbereitung,
damals kein Merge, Production-Deployment oder neuer Eingabeabruf. Fachliche
Abnahme weiterhin0/500.** Der tatsächliche Rollout vom 09.10.2026 ist im
Abschnitt „Rollout-Ergebnis (09.10.2026)“ belegt und ändert diese fachliche
Grenze nicht.

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

## Rollout-Ergebnis (09.10.2026)

Der hier vorbereitete Diagnose-PR ist als **PR #874** gemergt und regulär
ausgerollt. Verifizierter Laufzeitstand:

- PR-Kopf `8d8c15b4b56802a704b56a866c2af235e8501442`, Laufzeit-Commit
  `efc678c692d58879ec0d86c4292457087c2a93fa`;
- Merge 08.10.2026 23:18:29UTC / 09.10.2026 02:18:29 Türkei;
- Deployment `dpl_DDnDBe3fpPszYpcp8vXeyH5wQf4X` **READY**, Alias
  `helmut-pilot.vercel.app`, Ready beobachtet 08.10.2026 23:19:40UTC /
  09.10.2026 02:19:40 Türkei;
- beide Pflichtchecks grün auf exaktem `8d8c15b4`, Browserschritt kanonisch
  SKIP; zwei unabhängige nur lesende Laufzeit-Reviews (Pro High) und ein
  unabhängiger nur lesender SQL-Review (Flash High), verdichtete
  Zusammenfassungen, keine Reviewer-eigenen Tests.

### Zwei getrennte 52er-Vollzeilenversuche

1. **Früherer genehmigter Abruf:** exakt genehmigte Abfrage endete mit `57014`
   nach15s; vor dem Merge gestoppt, kein Merge und kein automatischer Retry.
2. **Neues separates Einzel-GO:** genau ein Vorher- und ein Nachher-Lauf mit
   ausschließlich `SET LOCAL jit=off`; dieselbe vollständige52er-SELECT-Abfrage
   byte-identisch, RR-nurlesend,15s Statement-Frist und2s Sperrfrist. Keine
   dauerhafte Konfigurationsänderung.

Beobachtungszeiten: Vorher 08.10.2026 23:16:46UTC / 09.10.2026 02:16:46 Türkei;
Nachher 08.10.2026 23:20:05UTC / 09.10.2026 02:20:05 Türkei. Beide tatsächlichen
Rohantworten belegen für alle52Tabellen dieselben Zeilenzahlen und
Vollzeilen+xmin-Fingerabdrücke vor/nach und gegen die Nach-B-Baseline.
Die Rohantworten selbst enthalten unterschiedliche Beobachtungszeiten.

| Tatsächliches Artefakt | SHA256 |
| --- | --- |
| Vorher-Rohantwort | `1c3ec3b297fdf6c8e355845dd97f3b08f9e6d42c467cbccbde689eb9a81216fe` |
| Nachher-Rohantwort | `a1c93ebe2728fe793834a7c662ac095bd85008da972132f171dc98aa617da9f2` |
| Neue SQL | `cfd0986829e79848b53be2509b1bade5de5f34f767a4466a1da42c8e948c4c90` |
| Genehmigter Umfang | `3aacaaa239f319177a1e3eaa66ef75a93d70d506a99b9417e6d05d6bb4afc2a2` |
| Nach-B-Baseline | `82e066e3f371c8a7e59ca7565e8bb5726d95c7d3c45487ae1d08c86c2c676b11` |

Private Belege außerhalb von Git:
`/workspace/blocker2-timeout-diagnostic-rollout-pr874-20261009/authorized-jit-off-attempt-20261009`.
Hier und im PR stehen keine privaten Werte.

### Grenzen des Rollout-Nachweises

- **0** neue App-/Identity-GETs, **0** neue Aufnahmen, **0** bezahlte
  Production-Modellaufrufe, **0** Production-Datenänderungen, **0** Profil-/
  Reservierungs-/Konfigurations-/Budgetänderungen, **0** Aktivierungs-/
  Funktionstest-/Rollback- und **0** Sicherungs-/Retentionänderungen.
- Der Vergleich ist ein Vorher-/Nachher-Snapshot, keine kontinuierliche
  Überwachung; der Fixture belegt **keine** Production-Ursache und **keine**
  Beschleunigung. Die historische Timeoutursache bleibt UNKNOWN. Die
  synthetische Gleichheitsprobe in PostgreSQL17.6 und der unabhängige
  SQL-Review sind begleitende Hinweise ohne Production-Ursachennachweis.

### Bilanzstände unverändert

Der letzte tatsächliche500er-Aufnahmestand (Lauf37826938407) bleibt vom alten
vollständigen500er-Lauf getrennt: **0angenommen / 2Ereignisduplikate /
9fehlenderVollnachweis / 1technischerFehler / 488nicht erfasst** gegenüber
**0angenommen / 91Ereignisduplikate / 409fehlenderVollnachweis**. Die fachliche
Gesamtabnahme bleibt **0/500**; A4/B5 sind abgeschlossen und nicht zu
wiederholen, C-Löschung ist gesperrt.

## Nächster Freigabepunkt

**Historischer Plan (08.10.):** Merge und reguläres Deployment des geprüften
Diagnose-PR mit rein lesender Identitäts-/52-Tabellen-Nachkontrolle, ohne
App-Eingabeabruf; damals noch nicht freigegeben. **Tatsächlicher Stand (09.10.):**
Dieser Schritt ist abgeschlossen (PR #874, READY`efc678c6`, Alias
`helmut-pilot.vercel.app`, kein App-Eingabeabruf).

Nächster begrenzter Schritt: einen eigenen Einzelreader ausschließlich für
Position12 vorbereiten und binden. Der vorhandene Einzelreader ist fest auf122
gebunden; er wird nicht als12er Reader ausgegeben oder still umgeschaltet. Damit
ist **kein** Eingabeabruf und **kein** künftiger Modellaufruf freigegeben; keine
weitere500er Aufnahme aus diesem Entwurf.

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
