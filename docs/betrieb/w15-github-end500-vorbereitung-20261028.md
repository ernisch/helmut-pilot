# W15: GitHub-End500 vorbereiten

**Folgeprüfung:** Die zuvor offenen fünf Fixturepins sind aus dem aufgezeichneten
Leseauszug des bisherigen Chats wiedergefunden. Neun Nutzdateien ergeben exakt
242.548.460 Bytes; der alte Bestand ist in dieser angebundenen Umgebung weiter
nicht erreichbar. Neuer Auftrag erlaubt Push/Draft-PR, keine Datenübertragung
und keine500er-Tests. Maßgeblich ist jetzt die
[exakte Exportliste mit rein lesendem Inventurbefehl](w15-end500-quellbestand-export-20261028.md).
Die früheren UNKNOWN- und Nichtveröffentlichungsangaben unten sind datierte
Vorbeobachtungen und bleiben zur Nachvollziehbarkeit erhalten.

Auftrag vom 28.10.2026, Betreiberzeit Europe/Istanbul. **Teilweise vorbereitet;
Start BLOCKED. Kein neuer End500-/Mock500-Lauf und kein Production-Nachweis.**
Ausgang: [PR974](https://github.com/ernisch/helmut-pilot/pull/974),
`186ebfa62fbd55b0143d9c65a424386ba55dabe9`;
[PR968](https://github.com/ernisch/helmut-pilot/pull/968) ist gemergt.

## Entscheidung und konkret fehlende Voraussetzung

Frischer GitHub-Standardrunner, ausschließlich manuelle, getrennte Stufen.
Vollständig auf dem Runner erzeugte Synthetik erfüllt den **unveränderten**
W15-Vertrag derzeit nicht nachweislich: Der vorhandene Generator erhält exakt
5.139 ursprüngliche Usage-Einträge (5.000 Historie und 139 Testeinträge),
Kostenbücher, Reservierungen, Journal- und Quellenbeziehungen. Er ergänzt auf
6.000 Usage und verwendet den echten 500er-Command, qualifizierte Eingaben und
einen nativen 69-Unit-Export. Gleich große Zufallsdaten ersetzen diese Bindungen
nicht. [Generator](../../scripts/fixtures/w15-end500-memory-fixture.js).

**Es fehlt ein erreichbarer quellseitiger Export des späteren End500-Satzes:**
das unveränderte Bound-Manifest, seine fünf vollständigen Fixture-JSONs,
der gepinnte Seed, der echte Command und die erforderlichen Provenienzbelege,
ergänzt um Dump und Rollen aus dem vorhandenen Eingangssatz. Keine neuen
Infrastrukturarbeiten, Gesamtarchive oder Exporte alter privater Schlüssel.
Der kleinste erste Abruf wäre das Bound-Manifest mit 4.985 Bytes: erst seine
fünf Pins schließen den exakten Daten- und Plattenplan.

Der angegebene [Drive-Ordner](https://drive.google.com/drive/folders/1gvYcdBSGYscOmTxYeJSJ3TpbacyJWBFd)
wurde tatsächlich gelesen: 587 direkte Einträge, alle 14 am 28.10. geänderten
Dateien berücksichtigt, sieben kleine aktuelle Kontrollberichte gelesen.
Keine Originalnutzdaten, Archive, Schlüssel oder Passphrasen heruntergeladen.
Der [W15-Transport](https://drive.google.com/file/d/175ANFmW32gcoisJf2YJmntxNaywhYJme/view)
ist vorhanden (12.491.342 Bytes); seine dokumentierte Inhaltsliste umfasst elf
Originale mit 96.530.256 Bytes, einschließlich Dump/Rollen. Die späteren acht
Dateien Bound/fünf Fixtures/Seed/Command sind nicht Bestandteil dieser Liste.
Dump/Rollen sind dort nicht separat erreichbar. Der Hash des Cipherpakets ist
ein übernommener Empfangsbeleg, keine erneute Messung der Archivbytes.

Auch die aktuellen Berichte belegen keinen späteren erfolgreichen Export:
[V2.3](https://drive.google.com/file/d/1QD1enw8xuSM5j0NGtrBveweKgDbImzWy/view)
meldet `actual_Hetzner_run_performed=false`;
[Abbruch/V2](https://drive.google.com/file/d/1CGj5MffVN96ZkOtmxlYlRQEkEhZrbr15/view)
meldet `upload_stage_reached=false` und `accepted_as_complete_backup=false`.
Das ist kein globaler Nichtexistenzbeweis außerhalb des geprüften Bestands.

## Minimaler unmittelbarer End500-Eingang

Neun private Nutzdateien, getrennt von den Kontrollmetadaten:

| Schlüssel | Bytes | SHA256 |
| --- | ---: | --- |
| frozenSourceDump | 4.981.565 | `06c6f37c7189dd166641d867809d42424f5c44618ab5cf6974939057ad61025c` |
| localRoles | 658 | `d9a99d567346768110a91f10033fd32cfa6e2a88dedd52ee59bfe62136ba0e02` |
| seed | 118.800.333 | `a91d74064c3a717777cd25a743de27aaba4cb3dd0529b85270d24c503e5717d4` |
| currentCommand | 1.169.844 | `ee866daff1c7c2b2e13f8b28938a4d14344f11c815e074f78d9acb9713413ee9` |
| auth, evidenceRows, privateDraftStoreRows, resultRows, privateDraftReviewRows | offen | aus dem privaten Bound |

Die vier bekannten Dateien umfassen 124.952.400 Bytes. Die Gesamtgröße ist offen,
nicht mit dieser Teilsumme gleichzusetzen. Bound: 4.985 Bytes,
SHA256 `5d61bb67ff0def43d4cc24ad11db59bb388e0a0b630393b173a9178b5bd2bf2c`.
Zusätzlich Empfangsmanifest (SHA256 `2cee6eb467342cabbe28db958ac00cc6cd9699622c3a772796d68d2d6adb97f1`),
unabhängiger Fixture-Review (4.438 Bytes,
SHA256 `dae2ff8b04ba57ae021cd9c129556edc7e06af0b717eea123ba056f890b5b499`)
und die tatsächlich referenzierten Reviews. Versionierte Belege aus Git verwenden.
Der Byteprüfer kontrolliert die neun Nutzdateien und Bound; er erteilt keine
Provenienz-, Quellen-, Ressourcen- oder Startabnahme.

Seed aus Fixtures zu erzeugen könnte den Transfer verkleinern. Ein gepinnter
Erzeuger, dessen Ausgabe exakt dem bisherigen Seedhash entspricht, fehlt jedoch.
Ein neuer sinngleicher SQL-Generator wäre noch kein gleichwertiger Ersatz.

## Getrennte Stufen und unveränderte Grenzen

| Stufe | Tatsächlicher Prüfauftrag |
| --- | --- |
| End500 | Vollständiger inerter Endbestand, 500 echte Auth-CAS, 6.000 Usage, 3.501 vollständige native Postimages; 0 aktiv, 0 Units, 0 Provider. Kein funktionaler 500er-Nachweis. |
| Mock500, später mit eigenem GO | 500 gleichzeitig aktive synthetische Profile, 500 Units, 1.000 Providerphasen, 1.500 unabhängig bilanzierte Ergebnisse, 8.000 echte Kontrollen, gebundene Rückführung auf 0. |

Gemeinsames hartes RAM-Limit **2.048.000.000 Bytes**, mindestens **20 % Reserve**,
Lebenszeitpeak höchstens **1.638.400.000 Bytes**, **Swap0**. PostgreSQL,
PostgREST, Node, SQL-Kinder und Dateicache gehören in dieselbe cgroup. Restore,
Seed, Arbeit und Abschluss zählen mit; kein Neustart, Peakreset oder Messwertabzug.
Volles Auth30 bleibt erhalten. Unit60 und Provider20 gelten für ihre spätere
Stufe und werden durch End500 nicht als geprüft ausgegeben.

## Was jetzt ausführbar vorbereitet ist

`scripts/w15-github/prepare.py --plan` liefert den öffentlichen gebundenen Plan
ohne Datenzugriff, Kindprozesse, Netzwerk, Docker oder Teststart. Im bestehenden
`ci.yml` ist dafür der manuelle Modus `end500-plan` vorbereitet. Exakter Commit
ist Pflicht; der Planmodus startet die normalen großen CI-Jobs nicht. PR/Push
und der manuelle Modus `standard` behalten die bisherigen Prüfungen. W15-Plan
hat eine eigene Concurrency-Gruppe und beendet keinen anderen W15-Plan.
Der neue Job ist **kein ausführbarer End500-Lauf** und sein Erfolg kein Start-PASS.

```sh
python3 -B scripts/w15-github/prepare.py --plan
python3 -B scripts/w15-github/prepare.py --verify-inputs \
  --input-root /privater/eingang --manifest manifest.json --bound bound.json \
  --expected-commit GEPRUEFTER_40_STELLIGER_COMMIT
```

Das private Eingangsmanifest ist ein JSON-Objekt mit genau den neun obigen
Schlüsseln, jeweils auf einen eindeutigen relativen Dateipfad abgebildet. Wurzel
und Unterordner 0700, Dateien 0600, jeweils dem ausführenden Benutzer gehörend.
Nur diese neun Dateien, Manifest und Bound samt nötigen Eltern sind zulässig.
Historische absolute Bound-Pfade werden nicht verfolgt. Bytezahl und SHA werden
im Datenstrom geprüft; Symlinks, Hardlinks, zusätzliche Dateien und Traversal
werden abgewiesen. Bestes Ergebnis: `PASS_INPUT_BYTES_ONLY_START_BLOCKED`.

`seal.py` ergänzt eine lokale verschlüsselte Sicherung im Datenstrom über GPG,
mit öffentlichem Empfängerschlüssel und extern vorgegebenem vollständigem
Fingerprint. Kein unverschlüsseltes Zwischenarchiv, kein alter privater Schlüssel,
kein Upload. Das private Sicherungsmanifest bindet Commit, Run-ID, Versuch1,
Eingangsmanifest, Empfänger und jede explizit genannte Datei mit Bytes/SHA.
Namen und Pfade bleiben im Ciphertext. Vollständigkeit der Dateiliste und
eine echte entfernte Rücklesequittung bleiben separat zu prüfen; lokale
Verschlüsselung allein ist kein vollständiger Rücksicherungsnachweis.

```sh
python3 -B scripts/w15-github/seal.py \
  --root /privater/abschluss --manifest manifest.PRIVATE.json \
  --manifest-sha256 MANIFEST_SHA256 --public-key /privat/empfaenger-public.asc \
  --recipient-fingerprint VOLLSTAENDIGER_EXTERN_GEPRUEFTER_FINGERPRINT \
  --commit GEPRUEFTER_40_STELLIGER_COMMIT --run-id GITHUB_RUN_ID \
  --input-manifest-sha256 EINGANGSMANIFEST_SHA256 \
  --output /privater/cipher/abschluss.gpg
```

Das Sicherungsmanifest enthält exakt `version:1`, `exactCommit`, `runId`
(Zeichenkette), `runAttempt:1`, `inputManifestSHA`, `recipientFingerprint` und
`files:[{path,bytes,sha256}]`. Alle Parameter müssen exakt dazu passen.
Wurzel/Unterordner sowie der getrennte Ausgabeordner 0700, private Dateien0600,
eigenes UID und keine Links. Der Empfänger hält den privaten Schlüssel außerhalb
GitHub. Cipherdatei wird ausschließlich neu angelegt; bei Fehler bleibt eine
private Teilcipherdatei erhalten, kein Überschreiben oder automatischer Retry.

## Anschlüsse bis zum tatsächlichen Start

Nach Erreichbarkeit des ausgewählten Eingangs bleibt die konkrete Portierung
des vorhandenen Controllers erforderlich, keine neue Testimplementierung:

1. Node24.19.0, SHA-geprüftes PostgREST12.2.3 und gepinntes PostgreSQL17.6
   aus bestehenden CI-Bausteinen aufbauen. Lokale Image-ID neu messen und
   binden; `567d…` ist keine pullbare Registryadresse.
2. Hostpfade/UID/GID explizit abbilden, sämtliche Python-/Auditorbindungen
   zusammen führen. Geprüfte JS-/SQL-Logik unverändert behalten. Historische
   Reports und verbrauchte D-Freigaben niemals in neue Ausführungsrechte umdeuten.
3. Frischen Startreview an Commit, Workflow, Run-ID, `run_attempt=1`, Eingang,
   einmalige Freigabe und Empfänger binden. Das bestehende Environment
   `helmut-ci-originals` hat nach frischem GET keine Branch-/Reviewschutzregeln;
   der Name allein ist keine Zugriffssperre. Secrets-Metadaten weiterhin403.
4. Tatsächliches freies Runner-`df`, vollständigen Daten-/Restore-/WAL-/Log-/
   Cipherbedarf und Setupzeit begrenzen. Kein alter Codex-Plattenplan als
   Runnernachweis. Vor dem ersten Auth-Aufruf echte gemeinsame cgroup-Readbacks
   und Swap0 kontrollieren. Während Lauf und Abschluss weiter überwachen.
5. Private Eingaben, alle Diagnose-/Abschlussdaten und ein konsistentes finales
   Datenbankbild in die vollständige verschlüsselte Rücksicherung aufnehmen.
   Nur Cipherdateien und geschlossene skalare Berichte dürfen den Runner
   verlassen; keine privaten Logs, Klartextartefakte, Caches oder SAFE-Globs.
   Entfernte Byte-/Hash-/Empfängerbindung und Rücklesung nachweisen.
6. Erst danach konkrete Startvorlage für **genau einen End500** erstellen.
   Bei FAIL/UNKNOWN kein Retry/Resume. Unabhängige Abnahme danach, Mock500 nur
   mit separatem neuen GO. Heute keine Startfreigabe anfragen.

Diese Anschlüsse sind offengelegt, **nicht als fertig implementiert behauptet**.
Die nicht erreichbaren Daten verhindern ihre belastbare vollständige Integration.

## Ressourcen, Dauer und Kosten

Offizielle [GitHub-Runnerdaten](https://docs.github.com/en/actions/reference/runners/github-hosted-runners):
öffentlicher Ubuntu-x64-Standardrunner 4 CPU, 16 GB RAM, 14 GB SSD, frische VM;
[Jobmaximum](https://docs.github.com/en/actions/reference/limits) sechs Stunden.
Die [Standardrechenzeit](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
ist in diesem öffentlichen Repository kostenlos. Größere Runner werden nicht
gewählt. Artefaktspeicher/-quoten und ein privater Rückspeicher sind nicht pauschal
als verfügbar oder kostenlos bestätigt. Der Planjob lädt keine Artefakte hoch.

Bestehende [Komponenten-CI40758148874](https://github.com/ernisch/helmut-pilot/actions/runs/40758148874/job/123062515489)
auf `186ebfa6`: Checkout8s, Node5s, Tools/Image16s, Komponentenlauf8s,
gesamter Job43s. Diese einmal beobachteten Werte sind keine Prognose für
End500-Transfer, vollständigen Restore, Seed oder Abschluss. Keine neue Messung
oder Komponentenwiederholung dieser Sitzung.

## Arbeitskopie und Freigabestand

Die neue Cloud startete auf PR968. `/workspace/helmut-pilot` und dessen
`supabase/.temp/` blieben erhalten; keine alten Testcontainer liefen. Eigener
Worktree `/workspace/helmut-w15-github`. Die alte W15-Arbeitskopie und ihre vier
unpublizierten Berichte sind hier nicht vorhanden; weder überschrieben noch als
verloren erklärt. Die abgeschlossene26-Dateien-Bereinigung ist Betreiberübergabe,
keine frische Messung dieser Umgebung. Keine weitere Bereinigung.

Gezielte Prüfungen und Dateibindungen stehen im
[Vorbereitungsbeleg](belege/w15-github-end500-preparation-20261028.SAFE.json).
Kein Push: CI-Änderungen würden laut Prüfplan große Offline-/DB-/Browserprüfungen
auslösen, für die dieser Auftrag ausdrücklich ein gesondertes GO verlangt.
Kein Workflow-Dispatch, Merge, Deployment, Profil- oder Production-Eingriff.
