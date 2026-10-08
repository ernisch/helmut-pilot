# Blocker 2: vollständige aktuelle Nurleseaufnahme

**Stand 08.10.2026: 500/500 aktuell erfasst, fachlich 0/500 angenommen.** Die technische Reparatur und der Sicherungsweg funktionieren. Die vollständige fachliche Eingabeabnahme ist nicht erreicht. Dieser Nachweis stammt ausschließlich aus dem neuen Lauf; historische Teilaufnahmen wurden nicht hinzugemischt.

## Tatsächlicher Einmallauf

- Lauf [37775654108](https://github.com/ernisch/helmut-pilot/actions/runs/37775654108), Job `113305695777`; manuell genau einmal nach neuem konkreten GO gestartet. Dieses GO ist verbraucht, keine automatische Wiederholung.
- Workflow/main `7343313439f08f55ef666530e462c955bd0ccc96`, Production `d6147232add23e83b39e15235a290552d96703cb`, READY `dpl_ANy3XLCkDq4vvm5bmpKqanC4RB9Z`. Der reine Doku-Merge #868 war erwartungsgemäß build-unwirksam; beide Stände enthalten #867.
- GitHub created 12:15:59 UTC, endgültig `success` 12:39:35 UTC, **1416 Sekunden /23min36s**, unter 55min. Berliner Tag durchgehend 2026-10-08. Exakt **500 Eingabe-GETs und zwei Identitätsprüfungen**, 500 inaktive vollständig synthetische Profile: 330 Bundestag,120 Berlin,50 Brandenburg.
- Die beiden tatsächlichen Identitätsbelege nennen denselben Production-Commit und dieselbe Deployment-ID. Alle500 Originalprofile, Paketentscheidungen, Bodyhashes, tatsächlichen Eingabeverträge und Zeit-/Ebenenbindungen technisch vollständig geprüft und unabhängig neu berechnet. Das ist noch keine positive fachliche Relevanzprüfung.
- 28 native ZIP-Artefakte vollständig gespeichert und mit GitHub-Digest, Größe, CRC, geschlossenem Dateinamen und Kontext geprüft: **528 Einträge, 500 einmalige Profil-Cipher und28 Manifest-Cipher**. Alle500 ausgewählten Originalantworten und das tatsächlich hochgeladene Schlussmanifest durch Root AEAD-authentifiziert; unabhängiger Prüfer bestätigt die Kette, las aber keinen privaten Schlüssel und führte die AEAD-Entschlüsselung nicht selbst aus.
- Tatsächlich hochgeladenes Schlussmanifest: Checkpoint0027, Artefakt `11550702126`, Phase `final`, `collectionCompleted=true`,500 erfasst/500 versucht. Der native Joblog bestätigt `cipherFinalSaved=true`; dieses Feld wird nicht fälschlich als Bestandteil des lokalen entschlüsselten Manifests behauptet.
- Initialer nativer Upload-ACK12:16:15.2812277 UTC vor erster beobachteter Eingabe12:16:16.564. ACK vor Startidentität folgt der unabhängig geprüften Collector-Reihenfolge; kein nicht vorhandener Identitäts-Serverzeitstempel erfunden. Letzte Eingabe12:39:29.423, finaler ACK12:39:32.8138135.
- Aktuelle feste erfolgreiche Quellen-/Build-Wiederaufnahmequittungen an Positionen **1,147,361**: `briefing-aufbauen`, `speicher-timeout`, Integer `versuche=2`. Kein weiterer Input-GET dadurch. **Keine** Quittung des ersten Profil-Lesezweigs: dieser blieb im erfolgreichen Lauf unbeobachtet. Keine tiefer liegende DB-/Netzursache erfunden.
- Die erste lokale Decoder-Ausführung begann vor fertiger Auswahl und endete vor Output-Erstellung mit ENOENT. Danach Auswahl abgeschlossen und genau einmal geordnet vollständig dekodiert. Kein erneuter Production-Lauf und keine vermischten Originale.

## Vollständiger Schutzvergleich

Alle **52 geschützten Tabellen** jeweils vollständig mit Zeilenanzahl und Vollzeilen+xmin-Digest geprüft: vorher12:15:33.137427 UTC, unmittelbar nach Laufende12:39:58.881952 UTC, exakt gleich. Nachkontrolle23.881952s nach nativem `updatedAt`; ehrlicher Vor-/Nachsnapshot, kein lückenloser Driftmonitor.

Alle Profile, Rohquellen, KOs/Kanten einschließlich der vier A-INSERTs, Reservierungen, Nutzung und Budgettabellen unverändert. Die tatsächlichen Antworten/Identitäten melden0 Schreibaufrufe/0 Modellaufrufe. Keine Profilaktivierung, keine Konfigurationsänderung, kein kostenpflichtiger Helmut-Production-Modellaufruf, kein500er Funktionstest.

## Alle500 tatsächlichen Eingaben einzeln

Technische Erfassung: **500 vollständig /0 leer /0 unbrauchbar /0 technisch fehlerhaft /0 widersprüchlicher Transport /0 nach Stop nicht erfasst**.

Die fachliche Primärbilanz ist exklusiv; ein Profil mit Widerspruch und Duplikat wird zuerst als Widerspruch gezählt. Deshalb sind37 Duplikatpositionen zusätzliche Fälle, während das Duplikatpaar insgesamt91 aktuelle Eingaben betrifft.

| Kategorie | Bundestag | Berlin | Brandenburg | Gesamt |
| --- | ---: | ---: | ---: | ---: |
| Vollständig fachlich angenommen | 0 | 0 | 0 | **0** |
| Zeit, Quellen oder Ebenenwiderspruch | 175 | 114 | 4 | **293** |
| Ereignisduplikat als vorrangiger Restbefund | 27 | 0 | 10 | **37** |
| Fehlender vollständiger fachlicher Nachweis | 128 | 6 | 36 | **170** |
| Leer | 0 | 0 | 0 | 0 |
| Unbrauchbar | 0 | 0 | 0 | 0 |
| Technisch fehlerhaft | 0 | 0 | 0 | 0 |
| Nicht erfasst | 0 | 0 | 0 | 0 |
| Alle Positionen | **330** | **120** | **50** | **500** |

**20917 sichtbare aktuelle Profil/KO/Quelle/Vorgang/Resolver-Bindungen** vollständig abgeglichen;0 strukturelle Bindungsfehler.20052 exakt unveränderte KO- und vollständige Quellenversion-Faktbindungen aus bereits belegter Quellenarbeit wiederverwendet. Die ältere401er Faktprüfung bleibt unvollständig: exakte Versionen oder vorhandene Wort-/Thementreffer begründen keine automatische notwendige Auswahl oder Annahme. Jeder aktuelle vollständige Profilbody stammt aus diesem neuen Lauf.

Die293 sichtbaren Widerspruchspositionen betreffen überlappend269 Eingaben mit kommunal gespeichertem Landes-KO,168 mit fremder Parteiquelle und16 mit BIP- statt E-Auto-Primärquelle. Die konservative Zwischenbilanz ist keine Behauptung, alle sichtbaren Kandidaten seien für jedes Profil notwendig. Die vollständige notwendige Auswahl, Faktunterstützung und Zeit-/Ebenen-/Profilrelevanz bleiben als einzelne Nachweisachsen offen.500 KO-/877 Source-Versionen der globalen Korrekturbasis werden nicht pauschal als500 notwendige Profilquellen ausgegeben.59 tatsächlich aktuelle DOSB-Ausgaben bestehen den relativen-heute-Titel-/Summary-Guard; ein altes Zeiturteil wurde nicht rückwirkend übernommen.

## Maßnahme A: tatsächliche Ankunft in allen42 Zielprofilen

Beide neuen KOs und Quellenkanten sind in **30/30 Berliner Bildungsprofilen und12/12 Brandenburger Verkehrsprofilen** tatsächlich sichtbar angekommen. Für jede der42 Positionen geprüft: kanonische KO-/Vorgangskennung, exakte aktuelle KO-Projektion gegen native A-Zeile, genau die erwartete einzelne Quelle unter diesem Vorgang, passende Primärquellen-URL, tatsächlicher Profil-/Paket-/Landeskontext und richtige Landes-KO-Ebene.

Zusätzlicher aktueller Quellenstand-Nachweis: alle42 gebundenen Artikelstand-Metadaten bestehen den kanonischen aktuellen Leser und stimmen exakt mit dem nativen A-Quellenoriginal überein. **Berlin: Veröffentlichungstag02.10.2026, ausschließlich Berliner Kalendertag; Brandenburg:02.10.2026,10:57UTC.** Keine Berliner Uhrzeit erfunden. `published_at` und das tatsächliche Q-Vertragsfeld `veroeffentlichtAm` bleiben in allen42 FällenNULL. Die amtliche Publikation ist damit nicht pauschal unbekannt; das Feld ist nicht befüllt und der vollständige Ereignisfenster-/Notwendigkeits-/Relevanznachweis weiterhin offen. Keine automatische A- oder Profilabnahme.

## Nächster kleinster notwendiger Schritt

[Maßnahme B exakt neu vorbereiten und separat freigeben](blocker2-massnahme-b-freigabe-aktuell-20261008.md): drei bestehende KO-Zeilen berichtigen, zwei fremde Quellenkanten entfernen. Neue Nach-A-Baseline, exakt gebundene native Vorher-/Nachherwerte und Guard-/Rückwegplan; **B nicht freigegeben/nicht angewendet**. C-Duplikatlöschung bleibt gesperrt; historische abgeschlossene Reservierungen nicht umgehen und B1-Motor nicht verändern. Das beseitigt nicht automatisch alle fehlenden Fachnachweise.

Keine neue Datenaktion und kein neuer Production-Eingabeabruf aus diesem Dokument ableiten. Jede spätere notwendige Datenänderung und jeder nächste vollständige Nurleselauf benötigt eine eigene konkrete Freigabe. Kein bezahlter Production-Modellaufruf und kein Funktionstest.

## Private Originalbelege

Private Originale, Cipher, entschlüsselte Bodies und Schlüssel bleiben außerhalb von Git; kein neues Archiv oder Threadwechsel. Der neueste Lauf gehört nicht zum davor erstellten historischen Übergabearchiv.

- `full500-after-pr867-20261008-root-runtime-proof.json` — SHA256 `b77e486c2a6f12d4aab017745778d8365f2e03d5519b3751ee32c8c6996fb9dd`.
- `after-pr867-independent-runtime-and-evidence-review.json` — SHA256 `d0241ea8cc6cbe0869e80735ba1c2ee467c7b32ee81e4ccbca25caab50b031b4`.
- `full500-after-pr867-20261008-all500-individual-available-input-assessment.json` — SHA256 `7bb75766b8e3d698bce376fca1e1a76b6540e9d9ede5e90e2dc53f4845f9b5f7`.
- `full500-after-pr867-20261008-all500-individual-summary.json` — SHA256 `5e77ba90b1947bf2cf31ca30d0a416cf54f78a0078c6dc6390f22ad214fa888e`.
- `full500-after-pr867-20261008-all500-individual-balance.csv` — SHA256 `8a56fe6e52b51da7c07e95f6286ed33b70d00622e5c3e59c7a2f23bc18ef761c`.
- `full500-after-pr867-20261008-A42-current-bound-source-publication-supplement.json` — SHA256 `d8bb3d8a694467e5d07319f530a949e3decdf52d425ccfd1706dbb1f76ff3349`.
- `durable-run-37775654108/authenticated-final-manifest-selection.json` — SHA256 `fec7f1f700c964324a1dcdf6e060b6f9b0ea36152b7c9ad3b772283576f75ab1`.

Der unabhängige kritische Review bestätigt getrennt Runtime/Custody, Offline-Methodik und ehrliche500er Ergebnisbilanz: PASS. **Fachliche Vollabnahme ausdrücklich nicht belegt:0/500.**
