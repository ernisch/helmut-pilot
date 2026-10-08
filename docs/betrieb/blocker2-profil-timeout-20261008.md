# Blocker 2: Profil-Timeout und aktuelle Einzelauswertung (08.10.2026)

Stand 08.10.2026. Nur der eine verbrauchte Lauf 37765387727 und PR #867. Keine Vermischung mit historischen Eingaben, Bodies, Profilurteilen oder Zaehlstaenden. Private Originale bleiben ausserhalb von Git; oeffentlich sind nur Dateinamen, Pins und gepruefte Aggregatfakten.

## Lauf und Identitaeten

- Ein ausdrueckliches Nutzer-GO fuer den exakt beschriebenen vollstaendigen 500er Nurleselauf; durch diesen Lauf verbraucht, keine Wiederholung genehmigt.
- Lauf https://github.com/ernisch/helmut-pilot/actions/runs/37765387727
- Workflow 0905b0e02d9166ccbba27b738dc64ecca4adb938, Production 70a25504088b85123ff2ecfd326fdb444267d772, READY dpl_AndYq616Q522NERzhLUPiYeGns72.
- Erstellt 10:43:50 UTC, finaler Fehler 11:00:18 UTC, 988 s (< 55 min).
- 394 Eingabe-GETs, 1 Startidentitaet, keine Abschlussidentitaet.
- Erster ACK 10:44:05.951 vor erstem akzeptierten Serverstart 10:44:07.132, finaler ACK 11:00:16.085 UTC, cipherFinalSaved=true.

## Transport, Abdeckung, semantische Bilanz

- Transport: 393 erfasst, 1 technisch fehlerhaft, 0 leer, 0 unbrauchbar, 0 widerspruechlich.
- Alle 500 Positionen einzeln indexiert: BT330 erfasst, BE63 erfasst/1 technisch/56 nicht erfasst, BB50 nicht erfasst.
- 106 versiegelte Positionen sind NICHT als tatsaechliche Antworten gewertet.
- Exklusiv semantisch: 0 angenommen / 235 Zeit-/Quellen-/Ebenenwiderspruch / 27 Ereignisduplikat / 131 fehlender Fachnachweis / 1 technisch / 106 nicht erfasst.
- BT 175/27/128, BE 60/0/3 plus 1/56, BB 50 nicht erfasst.
- Alle 393 tatsaechlichen Vertraege unabhaengig neu aufgebaut: 16419 sichtbare Item-/KO-/Quellen-/Resolver-/Profilbindungen; 15743 Faktenwiederverwendungen nur bei exaktem KO plus allen Quellen-Hashes; 47 aktuelle DOSB69-Guards frisch.
- 500 KO-Versionen / 877 Quellenversionen sind Kandidatenbasis, NICHT 500 tatsaechliche Eingaben.
- Bekannte Ueberschneidung 217 Land, 129 Partei-Quelle, 13 GDP-EV; Union 235, keine Behauptung, dass B alle 500 Positionen fixt.

## Maßnahme A und offene Bindungen

- Notwendig: 30 BE/Bildung, 12 BB/Verkehr.
- 16 tatsaechliche BE-Zielitems beobachtet mit KO/Vorgang, nativer A-Projektion, einzelner erwarteter Quellenkante/Primaer-URL und belegter Profilebene.
- 14 BE-Ziele und 12 BB-Ziele nicht erreicht.
- Tatsaechliches published_at und Vertragsveroeffentlichung NULL/UNBEKANNT; keine erfundenen Zeitstempel, keine semantische Annahme aus blosser Praesenz.
- B5 unfreigegeben (alter voller 52-Pre-A-Guard obsolet), C-Loeschung gesperrt.

## Artefakte, Snapshot, Schutz

- Alle 22 nativen ZIPs erhalten: 522 Eintraege = 500 Profilciphers + 22 Manifeste; final tatsaechlich hochgeladener Checkpoint 0021, Artefakt 11545585910.
- Exakt 52 RR/RO-Vollzeilen plus xmin und Zaehler vor 10:43:29.349946 und nach 11:00:43.201693 identisch; der Nachher-Wert liegt 25.201693 s nach dem finalen nativen updatedAt und wurde VOR dem letzten grossen Cipher-Download gelesen.
- Ehrlicher Snapshotvergleich, KEIN kontinuierlicher oder instantaner Driftmonitor.
- Keine Production-Daten-, Profil- oder Reservierungsaenderung, keine Aktivierung, keine bezahlten Helmut-Production-Modellaufrufe, kein 500er Funktionstest, kein Auto-Repeat, kein Rollback.

## Aktueller Fehler und PR #867

- Position 394 test-kohorte-synthetik-be-064: HTTP500, sichere Diagnose blocker2-briefing-read-diagnostic/1, Phase profil-vorher-lesen, art=speicher-timeout; das native Vercel-Log belegt den exakt gejointen Profil-GET mit 10000 ms; Netz-/DB-Ursache UNBEKANNT.
- Der Quellen-/Build-Retry aus PR #865 wurde NICHT ausgefuehrt (0 Wiederherstellungsquittungen bei den aktuellen 393); andere Phase als die vorige 45er-Aufnahme, keine Behauptung vollstaendiger Heilung.
- PR https://github.com/ernisch/helmut-pilot/pull/867 head f52e07416daffd47dcec6f1e93b2a86db95bcfd0, gemergt und regulaer deployed; 4 gezielte Offline-PASS, CI 37768394566 beide Pflichtchecks gruen, Bereichsregression ausgefuehrt; Browserausfuehrung planmaessig uebersprungen.
- Kritische unabhängige Exact-Head-Endprüfung PASS: vier eigene Suiten und neun zusätzliche vollständig offline gestubbte echte Storage-Adapterproben. Beleg pr867-independent-critical-end-review-20261008.json, SHA256 f108f09b2a2dd5a34f2620ef7e1958eeb05bf78f6ebc1a5fc27d77ed7aa4e1f4.
- Merge d6147232add23e83b39e15235a290552d96703cb, Eltern 0905b0e0 und f52e0741; kompletter Baum identisch zum geprüften Kopf. Production READY dpl_ANy3XLCkDq4vvm5bmpKqanC4RB9Z, aktiver Alias auf genau diesem Merge.
- Native52 vor Merge 2026-10-08T11:19:14.901238+00:00 und nach READY 2026-10-08T11:23:16.776191+00:00 vollständig unverändert, einschließlich Profile und xmin. Merge-/Deploymentbeleg pr867-merge-ready-and-full52-proof-20261008.json, SHA256 e70918cfc389c0cac6e31110be38d078f4db9137788a3276db18cb9287f81e96.
- Fix nur fuer den ersten Profil-GET: geschlossene Request-Map, exakter Dieser-Nutzer-Endpunkt, volle Frist 1..10000, maximal EIN frischer Lesevorgang im SELBEN API-GET; voller tatsaechlicher Inaktiv- und Generatorguard bleibt Pflicht.
- Erster Profil- und Quellen-Retry teilen sich EIN zusaetzliches Operationsbudget; abschliessender Profil-Read bleibt fatal; keine Speicher-, Server-, Workflow-, Engine-, Config-, Timeout-, Budget- oder Modellaenderung.
- DTO-Erfolg wie bisher; feste geheimnisfreie optionale Initialquittung erst nach allen Endguards; Production-retryRuntime unbewiesen.

## Unabhaengige Pruefungen und Zugriff

- Methode PASS, 16 Gegentests, Code 9608c25fed5a75602040f3839d069d7ec510b13de9d00ec4d2c317deab0afc51, Beleg review full500-after-pr865-20261008-independent-method-review.json SHA 4125669b8bd1886d7db172d5b4ea3382f37e2382110631a00b96285c2690edac.
- Runtime-/Belegpruefung Astra High PASS, Beleg review full500-after-pr865-20261008-independent-runtime-and-evidence-review.json SHA c70255ec4186c74651ae2afe7e0fc81bdd15ca7e061a3bef966df851bbdc9fe8; 500 Positionen, 393 Vertraege, 16419 Bindungen, 522 Eintraege unabhaengig geprueft.
- AEAD-Pruefgrenze: gepinnter authentifizierter Selektor-/Decoderbeleg, NICHT eigener PrivateKeyRead oder Re-Entschluesselung; Root strikt AEAD-authentifiziert fuer alle 501.
- Lokale GH-CLI-Abfrage 11:13 CI HTTP401 NACH gesichertem Lauf/Artefakt; keine Aussage zu Ablauf- oder Widerrufsursache. Managed Network unrestricted enforced, keine GH-Runtime-Bindung; Connector ernisch, git ls-remote und CI funktionieren.
- Kein Secret-Ausdruck, -Ersetzen oder -Login, keine Credential-Budget- oder Config-Aenderung, kein Capture-Auth-Fehler.

## Private Originale (nur Pfade, keine Inhalte)

- Wurzel /workspace/private/blocker2-20261007/durable-run-37765387727/
- durable-37765387727-all500-actual-input-structural-evaluation.json
- full500-after-pr865-20261008-all500-individual-available-input-assessment.json
- full500-after-pr865-20261008-all500-individual-summary.json, full500-after-pr865-20261008-all500-individual-balance.csv
- full500-after-pr865-20261008-immediate-before-full52.json, full500-after-pr865-20261008-immediate-after-full52.json, full500-after-pr865-20261008-root-runtime-proof.json
- Oeffentliche Docs pinnen nur Namen und Hashes, nicht Inhalte.

## Abgrenzung

- Der Lauf liefert KEINE fachliche Abnahme und keine Aktivierung; Gesamtstand 0/500.
- Kein neuer Eingabeabruf oder Workflowdispatch nach PR-#867-Merge; der neue Profil-Wiederaufnahmezweig ist in Production noch unbewiesen.

## Naechster kleinster Schritt

- Genau EINEN neuen vollständigen 500er Nurleselauf auf dem bestätigten READY-Commit d6147232add23e83b39e15235a290552d96703cb konkret freigeben: max500 Eingabe-GETs, max2 Identitäten, max55min, gleicher Berliner Tag/Commit, verschlüsselte Checkpoints, voller52 Vorher/Nachher, Stop bei Schutzabweichung. Keine Daten-/Profil-/Reservierungsänderung, Modelle, Funktionstests oder automatische Wiederholung. Neues ausdrueckliches GO ERFORDERLICH, weil das aktuelle exakte GO eine Wiederholung verbietet; kein neuer Lauf unter dem verbrauchten GO.
- B1/B3 unveraendert. Fachliche Abnahme 0/500 bis zum vollstaendigen positiven Beleg.
