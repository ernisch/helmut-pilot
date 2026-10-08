# Blocker 2: Quellen-Timeout, vollständige Teilbilanz und Reparatur

Dieses Dossier wird aus dem getrennten Lauf 37760486609 und seinen authentifizierten Originalen fortgeschrieben. Keine fachliche Abnahme oder neue Production-Freigabe. Alle Angaben gelten nur zum genannten Prüfzeitpunkt; Originalinhalte bleiben privat und ausserhalb von Git.

## 1 · Lauf und Freigabe

- Genau ein neues freigegebenes GO, direkt nach dem Einzeldiagnose-Vorschlag erteilt; jetzt verbraucht. Keine Wiederholung genehmigt, kein Auto-Repeat, kein weiterer Dispatch.
- Run: https://github.com/ernisch/helmut-pilot/actions/runs/37760486609
- Workflow: `blocker2-readonly500.yml`@`32289d99c8e0de2656a9798fe398b4cfbde80639`
- Productioncommit: `3f5fbc731f32d1b73488bc0e0df49240a3993b92`; READY `dpl_7q4VfZfH15PYrPEDwTDatd2afPEa`; Berliner Tag 2026-10-08.
- Start 09:59:46 UTC, finaler Fehlschlag 10:02:49 UTC (native `updatedAt`), Gesamtspanne 183 s.
- 46 tatsächliche Eingabe-GETs (≤500), 1 Startidentität (≤2), keine Abschlussidentität wegen Stop.
- Kein Write, kein Modellaufruf, keine Profilaktivierung, keine Reservierungs-, Funktions-, Konfigurations- oder Budgetänderung.

## 2 · Transport und Cipher

- Status: 45 tatsächliche HTTP200, 1 technischer HTTP500 auf Position 46 `test-kohorte-synthetik-bt-046`; 454 Positionen nicht angefragt. Keine vollständige aktuelle 500-Aufnahme, **Abnahme 0/500**.
- Fünf native Artefakt-ZIPs vollständig authentifiziert: ID 11542300981 (1 Eintrag), 11542305905 (2), 11542376016 (20), 11542505789 (21), 11542366138 (461) = 505 Einträge (500 Cipher-Profilpositionen + 5 Manifeste); alle CRC, nativen SHA und Bytes geprüft.
- Finaler Checkpoint 0004 tatsächlich hochgeladen und kanonisch ausgewählt; kein erfundenes Post-ACK-Manifest.
- 454 versiegelte, nie angefragte Datensätze sind keine tatsächlichen Eingaben.
- Erster ACK 10:00:08.595 UTC vor erstem Serverstart 10:00:09.272 UTC; Close-ACK gespeichert, `cipherFinalSaved` true, Originale dauerhaft privat gesichert.
- Nicht mit diesem Lauf vermischen: historische 121 Bodies, 435, alter 500-Stand und Einzel122 bleiben getrennte frühere Befunde. Kandidaten: 500 KO-Versionen / 877 Quellversionen; **keine** 500 Profil-Eingabe-Bodies.

## 3 · Native 52-Vorher/Nachher

- Native RR/RO-Volltabelle 52 Relationen, volle Zeilen + xmin + Counts vor 09:59:15.62784 UTC und nach 10:04:42.495277 UTC exakt gleich, einschliesslich Profile, A4, Rohquellen, Modellnutzung, Budget/Reserven.
- Nachabgleich 113,495 s nach native `final updatedAt`: ehrlicher expliziter Snapshotvergleich, **kein** lückenloser Driftmonitor und **kein** Instantaneous-Claim.
- Production-Alias und READY vor/nach gleich. Jeder akzeptierte Body wurde am tatsächlichen Productioncommit `3f5fbc73` erfasst.
- Mechanischer Guard: alle 500 inaktiv / vollständig synthetisch 330BT/120BE/50BB weiter erhalten.

## 4 · Fachliche Exklusivbilanz aller 500

| Kategorie | BT 330 | BE 120 | BB 50 | Gesamt 500 |
|---|---|---|---|---|
| vollständig angenommen | 0 | 0 | 0 | 0 |
| Zeit-/Quellen-/Ebenenwiderspruch | 25 | 0 | 0 | 25 |
| Ereignisduplikat | 5 | 0 | 0 | 5 |
| fehlender Fachnachweis | 15 | 0 | 0 | 15 |
| leer | 0 | 0 | 0 | 0 |
| unbrauchbar | 0 | 0 | 0 | 0 |
| technisch fehlerhaft | 1 | 0 | 0 | 1 |
| nicht erfasst | 284 | 120 | 50 | 454 |

Alle BE-/BB-Positionen sind als nicht erfasst bilanziert; ihre fachliche Einzelbewertung bleibt offen. BT-Summe 330 und Gesamtsumme 500 stimmen.

- Alle 45 tatsächlichen Profile einzeln geprüft, insgesamt **1908 sichtbare Bindungen** über 45 neu aufgebaute Eingabeverträge.
- 1829 Facts wiederverwendet **nur** bei exaktem KO-Hash UND allen Source-Hashes aus dem 401-Faktenreview; keine alten Profilverdicts, Counts oder Bodies.
- DOSB69: 7 aktuelle Title-/Summary-Guards neu geprüft; der alte heutige Fehlschlag wurde **nicht** übernommen.
- 79 native sichtbare BT-Bindungen, 39 Berliner KO, 40 BB-KO, samt A4-Zeile/Quellenkante exakt.
- Das beweist **keine** notwendige BT-Relevanz. Die 30 BE-/Bildungs- und 12 BB-/Verkehrsprofile wurden nicht angefragt; die tatsächliche Wirkung von A auf diese 42 notwendigen Zielprofile bleibt offen.
- Kandidatenquellenlücken aus den 989 alten Belegen sind **nicht** notwendigen aktuellen Lücken oder Widersprüchen gleichzusetzen. B5-Korrekturen bleiben unapproved, C-Dup-Delete blockiert; 0 Datenänderungen, keine KO-Aufnahme allein aus A.

## 5 · Aktuelle HTTP500-Lesediagnose

- Diagnoseversion `blocker2-briefing-read-diagnostic/1`, Phase `briefing-aufbauen`, `art=speicher-timeout`.
- Auch die native Vercel-Logabfrage enthält das gesicherte Phasenlabel/den Typ; private Garbage-Parameter werden nie ausgegeben.
- Exakter interner SELECT-, Netz- und DB-Untergrund **unbekannt**.
- Der alte HTTP500 aus Lauf 37748818380 wird **niemals** rückwirkend als ursächlich bewiesen behauptet.
- Transport funktioniert; der fehlgeschlagene Eingang ist ein anderes Lesefehlerbild als die frühere Cipher-Paketierung.

## 6 · Reparatur PR #865 (gemergt und regulär deployed)

- PR https://github.com/ernisch/helmut-pilot/pull/865, Kopf `2ea66b34c45c51bb6de9fbe4346838c941b5efdb`.
- Beide Pflichtchecks auf diesem Kopf grün (CI-Lauf `37763043238`); kritischer unabhängiger Exact-Head-PASS. Ein gefundener Getter-Widerspruch ist behoben: Retry-Zulassung liest `name`, `code` und `message` einmal strikt und weist jeden Getterfehler ab. Die best-effort Diagnose bleibt getrennt.
- Private Endprüfung `blocker2-pr865-independent-critical-end-review.json`, SHA256 `4048f0c7aaa3167158f3fa4f608ce62ea570d1236157c98250198d052399be11`. Der unabhängige Prüfer hat zusätzlich den echten Speicheradapter mit vollständig abgefangenen Abrufen und lokaler Deadline geprüft; kein Netz/Production.
- Nur `briefing-pruefaufnahme.js` und seine Offline-Suite; 4 gezielte Offline-Suiten wurden vom Orchestrator als bestanden geführt (Aufnahme, Lesediagnose, githubreadonly500, Diagnose).
- B1-Server/Storage-Motor, B3/geteilte Deadlines, Workflow, Env und Config unverändert.
- Nach striktem Profilguard: nur geschlossene Synthetik, verifizierbar gebündeltes Quellen-Timeout-Präfix `Supabase...`, positive Ms ≤20000, `/rest/v1/knowledge_objects?id=in.(` ⇒ maximal ein zweiter vollständiger Frischbau im selben Eingabe-HTTP-GET mit identischen `opts`, `now:start`, `quellenGebundelt` true. Frischer Berliner Tag vor dem zweiten Versuch; alle Vertrags-, Profil- und Tagesguards bleiben Pflicht.
- Zusätzliche frische Supabase-GETs gibt es ausschließlich bei diesem zweiten Aufbau. Es entstehen kein zusätzlicher API-Eingabe-GET und keine Workflow-Wiederholung. Die 20s-Grenze gilt pro Speicheranfrage, nicht für den Gesamtaufbau; der bestehende äußere 60s-Eingabeabruf kann weiterhin abbrechen.
- Stop bei HTTP-/Assert-/Auth-/Profilbindungsfehlern, anderem Präfix, Bare-AbortError sowie bei nicht-synthetischen Profilen; zweiter Timeout fatal als Originalexception; keine Caches, keine Partialausgabe, keine Timeout-Erhöhung.
- Erstes Erfolgs-DTO unverändert; optionale feste, geheimnisfreie Recoveryquittung `leseWiederaufnahme` erscheint nur ausserhalb des Vertrags nach vollständigem zweitem Erfolg; alle 500-Abnahmen bleiben false.
- Kein Versprechen vollständiger Ursachenbeseitigung, kein neuer Runtime-Test.

## 7 · Unabhängige Prüfung und private Belege

- Independent Runtime/Evidence Astra High: PASS, Datei `full500-after-diagnostic-20261008-independent-runtime-and-evidence-review.json`, SHA256 `3eef5e9f32811af29f5c41c30a724a8a47b7b3ac48518b15aebb0abcd38c3087`.
- Root-Proof: `...-root-runtime-proof-after-independent.json`, SHA256 `02ff0f88c9df5ca0d28f6edf56a6812aedec5fddd416ae3adeebf82281000353`.
- Private Belege ausschliesslich in `/workspace/private/blocker2-20261007`: `durable-run-37760486609/`, `durable-37760486609-final-native-run-receipt.json`, `...all500-actual-input-structural-evaluation.json`, `...all-visible-profile-KO-source-resolver-bindings.json`, `full500-after-diagnostic-20261008-all500-individual-summary.json`, `...available-input-assessment.json`, `...balance.csv`, `...beforefull52`, `...afterfull52`, `...job-logs-private.json`. Im Dossier stehen nur Namen, nicht Originalinhalte. Keine privaten Originale, Secrets oder Keys in Git.

## 8 · Deploymentquittung

- PR #865 um 10:26:05 UTC gemergt: `70a25504088b85123ff2ecfd326fdb444267d772`; erwartete Eltern und vollständige Baumgleichheit zum unabhängig geprüften Kopf bestätigt.
- Regulär ausgelöstes Production-Deployment `dpl_AndYq616Q522NERzhLUPiYeGns72` READY; aktiver Alias `helmut-pilot.vercel.app` auf genau diesem Commit.
- Alle 52 geschützten Vollzeilen-/xmin-Bilanzen vor 10:25:36.965392 UTC und nach READY um 10:27:43.50789 UTC exakt gleich. Keine neuen Daten-/Profil-/Reservierungsänderungen oder kostenpflichtigen Helmut-Production-Modellaufrufe.
- Kein neuer Eingabeabruf, kein zusätzlicher Workflowdispatch. Der neue Wiederaufnahmezweig wurde in Production noch nicht ausgeführt; technische Vollaufnahme und dauerhafte Ursachenbehebung bleiben unbewiesen.
- Privater Nachweis `pr865-merge-ready-and-full52-proof.json`, SHA256 `68fe24e15b2579fe978e1d7f41b08bffd31366d0a34b13b589f8a5abafe7d90b`.

## 9 · Nächster kleinster Schritt

Genau einen neuen vollständigen Blocker-2-Nurleselauf auf dem tatsächlichen READY-Commit `70a25504088b85123ff2ecfd326fdb444267d772` gesondert freigeben. **Vorbereitet, nicht freigegeben und nicht gestartet.** Das letzte GO ist durch Lauf 37760486609 verbraucht. Das nächste GO enthält keine Datenfreigabe; B bleibt unfreigegeben und C gesperrt.

Umfang: exakt 500 inaktive synthetische Profile (330 BT/120 BE/50 BB), höchstens 500 API-Eingabe-GETs, höchstens 2 Identitätsprüfungen, maximal 55 Minuten Erfassung, derselbe Berliner Tag und Commit. Im bereits ausgelieferten Leser darf nur ein streng erkannter Quellen-Timeout innerhalb desselben API-Abrufs einen zweiten frischen Aufbau mit zusätzlichen internen Speicher-GETs auslösen. Feste Verschlüsselung und laufende Checkpoints, vollständiger rein lesender 52-Tabellen-Vergleich unmittelbar vor/nach. Stop bei Nicht-200, Commit-/Tages-/Auth-/Profilwiderspruch, Schreib-/Modellhinweis oder anderem Schutzverstoß. Keine automatische Wiederholung, Daten-/Profil-/Reservierungsänderung, Aktivierung, Modellaufrufe, Budget-/Konfigurationsänderung oder 500er Funktionstest.

Zweck: eine getrennte aktuelle 500er Grundlage sichern und alle 500 einzeln nach notwendiger Quelle, KO, Zuständigkeit, Resolver, Briefingeingabe, Profil, Zeit und Ebene prüfen; die A-Wirkung für 30 BE-/Bildungs- und 12 BB-/Verkehrsprofile ausdrücklich belegen. Auch nach einem technisch vollständigen Lauf folgt keine automatische fachliche Abnahme. Ein erneuter Timeout kann trotz der begrenzten Wiederaufnahme weiterhin zum Stop führen.
