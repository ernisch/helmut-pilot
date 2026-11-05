# Kontosicherheit: Abgleich mit aktuellem Main und Motor-PR

Stand: 04.11.2026, abschließende GitHub-Lesung 12:29:18 UTC.

**Ergebnis: D1/D2 bleiben ohne Rebase anwendbar. Kein neuer Kontopatch-Konflikt.**
Es wurden ausschließlich GitHub-GETs, Dateivergleiche und `git apply --check`
ausgeführt. Kein Patch wurde angewandt, kein Funktionstest wiederholt und keine
gemeinsame Quelldatei geändert. Das ist eine Quell-/Kompatibilitätsprüfung,
keine aktuelle Runtime-, Datenbank- oder Production-Abnahme.

## Frisch gelesene GitHub-Stände

| Stand | Exakter Kopf | Status |
| --- | --- | --- |
| `main` | `773f7aa545bfeac9429ef368c49e302e68772cc6` | Commit vom 31.10.2026, Legal-Kontaktadresse aus PR1005 |
| [Motor-PR1038](https://github.com/ernisch/helmut-pilot/pull/1038) | `aa3c4eaf4100bd2c7cbb87a4930294ed85c35dfb` | offen, Draft; Base ist PR1037, keine Main-Integration |
| [PR1037](https://github.com/ernisch/helmut-pilot/pull/1037) | `8bd3fd8c2db29f928e90d510b1dd6b108a56f4ee` | offen, Draft |
| [PR1036](https://github.com/ernisch/helmut-pilot/pull/1036) | `e1ef1273dad2255985964fe984eebf556cb4fe83` | offen, Draft |
| [UI-PR771](https://github.com/ernisch/helmut-pilot/pull/771) | `eaf0d5d517d104beaeac53ebeecc6957d3dcadc1` | weiterhin offen, Draft; letzte Metadatenänderung 02.10.2026 |

Die vollständige REST-Seite enthält 91 offene PRs, also weniger als die
angeforderten 100. Darunter liegt kein PR mit Headbranch
`feat/claude-backend-isolated`. Das schließt anders benannte Backendarbeit nicht aus.
Die abschließende Lesung bestätigt dieselben Main-/Motor-SHAs und PR1038 als
neuesten offenen PR.

[CI41825688225](https://github.com/ernisch/helmut-pilot/actions/runs/41825688225)
läuft weiterhin auf genau dem Motorhead. Bei der gezielten Joblesung war
`Browser-/Mobile-Smoke (Chromium)` erfolgreich und `Syntax + Offline-Suiten`
noch in Arbeit. Abschließend: ein Run `in_progress`, null `queued`, null
`waiting`. Es wurde kein Run gestartet, abgebrochen oder wiederholt.

## Gezielter Quellvergleich

Ausgangscommit des eigenen Klons:
`ae18658e5caac2b39403c0e41e3a8af5c2b3d7be`.
Die Remote-Gitbäume wurden für beide exakten SHAs vollständig und ohne
Abschneidung bis `lib/helmut` gelesen. Bereits identische lokale Bytes wurden
erst nach Übereinstimmung mit dem jeweiligen Remote-Gitblob als Snapshot
übernommen. Nur abweichende Dateien und der kleine Atomic-Usage-Adapter wurden
über den GitHub-Connector heruntergeladen.

| Datei | Aktuelles Main | Motorhead |
| --- | --- | --- |
| `lib/helmut/accounts.js` | bytegleich zur geprüften Baseline | ebenfalls bytegleich |
| `lib/helmut/auth.js` | bytegleich | ebenfalls bytegleich |
| `lib/helmut/auth-store-cas.js` | bytegleich | ebenfalls bytegleich |
| `lib/helmut/storage.js` | bytegleich | abweichend; relevante Deltas gelesen |
| `server.js` | bytegleich | nur drei ältere Legal-Kontaktadressen abweichend |

`accounts.js` hat auf allen drei Ständen SHA256
`08cfa25c4753721277b39fb7ff60ad0023d6381533fd039c337755bad84fe82e`.
Alle zehn Einzelvergleiche mit Bytezahl, Gitblob und SHA256 stehen im
[maschinenlesbaren Beleg](kontosicherheit-abgleich-20261104.json).

Die vollständigen Abschnitte `mutateAuthStore`, `handleAuthLogin` und der
Admin-Kontorouten sind auch am Motorhead bytegleich. Der zusätzliche
Storagepfad ist ausdrücklich lokal aktivierbar; sein kleiner Adapter erhält
die Snapshotbindung und meldet bestätigte Konkurrenz als
`AUTH_STORE_CONFLICT`, wodurch die vorhandene Mutation neu gelesen und
wiederholt wird. Die D2-Prüfung bleibt damit innerhalb derselben wiederholbaren
Mutation. Der normale CAS-Pfad ist unverändert. Dies wurde gelesen, nicht
erneut gegen einen laufenden Datenbankserver ausgeführt.

Die drei älteren Mailtexte des Motorheads dürfen bei späterer Integration
nicht als Ersatz für den aktuelleren Main-Server übernommen werden. Für D1/D2
ist ausschließlich `accounts.js` betroffen.

## Patchprüfung und übernommene Belege

**8/8 Anwendbarkeitsprüfungen erfolgreich:** auf beiden Snapshots jeweils D1
einzeln, D2 einzeln und beide Patches gemeinsam in beiden Reihenfolgen mit
`git apply --check`. Es gibt keine Textkonflikte. Keine Kandidatdatei wurde
geschrieben; Accountsbytes im Klon und in den Snapshots bleiben Baseline.

Die beiden Patches, beide bisherigen Testworker und der
[Kombinationsbeleg](sprint-d-kombination-20261104.json) sind hashgleich erhalten.
Die bereits belegten **8 Fälle, 30 Prüfungen und 56 HTTP-Requests PASS** werden
für die unveränderte Kontologik übernommen, nicht als neuer Lauf ausgegeben.
Kein neuer vollständiger Testlauf, Motorimport oder 500er-Nachweis.

Die D1-/D2-Abnahmegrenzen bleiben bestehen: keine Reparatur widersprüchlicher
Altkonten, keine Wiederherstellung bereits verlorener Adminrollen, kein neuer
Mehrprozess-/Datenbanknachweis. Eine weitere Integration bleibt getrennt;
diese Prüfung hat keinerlei Merge-, Deployment- oder Laufwirkung.

## Arbeitsbereich und neue Dateien

Eigener Klon: `/workspace/helmut-backend-sicherheit-20261104`.
Nur neu hinzugefügt:

- `scripts/kontosicherheit-abgleich-20261104.py`: netzloser Dateivergleich und Patch-Check.
- `docs/backend-isolated/kontosicherheit-abgleich-20261104.json`: Hashes und Einzelresultate.
- dieser Bericht.

Alle zehn beobachteten gemeinsamen Quelldateien haben vor/nach dem Vergleich
identische SHA256. Bereits aus dem Root kopierte Änderungen und Originalbelege
bleiben erhalten. Kein Commit, Push oder Eingriff in fremde Referenzen/Worktrees.

Remote-Metadaten und reine Quellsnapshots liegen außerhalb Git unter
`/workspace/helmut-claude-backend-evidence/parallel-20261104/latest-code`.
`remote-metadata.json` enthält die kompakten Metadaten aller 91 offenen PRs,
die anfänglichen Runs/Jobs und Remote-Gitblobbindungen;
`remote-final-metadata.json` enthält die abschließende Head-/Runlesung.
Es sind keine PR-Bodies, Tokens, Secrets oder Productiondaten gespeichert.
