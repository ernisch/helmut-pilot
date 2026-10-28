# Lokale atomare Abtrennung der KI-Nutzungshistorie

Stand: 28.10.2026. Eigener Branch `codex/w15-auth-usage-split-20261028`,
gestapelt auf PR #972 / `c36bd427dab7cc57c857ed179dc58dc1a6bb1424`.
**Lokaler Komponentenbeleg, keine Production- oder 500er-Abnahme.**

## Befund und kleinster sinnvoller Eingriff

`storage.readAuthStore` liest bei jeder Mutation die vollständige Auth-Zeile;
`writeAuthStore` normalisiert sie und `auth-store-cas.writeConditional`
serialisiert und PATCHt die gesamte Zeile unter Revisionsvergleich.
Damit werden auch unveränderte Nutzer/Sitzungen, Zuordnungen, Tagesdaten,
Audit-/Fehler-/Prozesshistorie, Locks, Retryzähler, Einstellungen, Kostenbücher,
Admission und Dispatch-Journal sowie sämtliche alten KI-Verbrauchseinträge
wiederholt übertragen und geschrieben.

Die öffentliche [RAM-Diagnose aus PR #972](https://github.com/ernisch/helmut-pilot/blob/c36bd427/docs/betrieb/belege/w15-processing-20261027/RAM_DIAGNOSIS_20261028_SUMMARY.SAFE.json)
belegt im Teilzustand 5.458.615 JSON-Textbytes: 2.799.052 Usage,
695.063 Admission, 208.035 Journal und 690.772 Kosten-Tagesbücher.
Der dokumentierte konservative Abschlusszustand hat 13.616.853 minifizierte
Bytes, 6.000 Usage-Einträge und unter anderem die vollständige `closedSlot`-
Kopie im Journal. Diese Nachweiskopie darf nicht als Cache gelöscht werden.
Die Größen des Teilzustands sind keine Prozentbasis für den Abschlusszustand.

Der bestehende `HELMUT_LLM_USAGE_RELATIONAL`-Weg schreibt lediglich zusätzlich
in `llm_usage`. Leser/Kostenprüfungen verwenden weiterhin `auth.llmUsage`;
der bisherige Spaltenmapper enthält nicht alle EU-Vertragsfelder. Ein bloßes
Einschalten reduziert deshalb keine Blobarbeit und wäre kein verlustfreier
Lesepfadwechsel.

Die kleinste vorhandene Lösung ist der Usage-Protokollteil aus PR #920,
mit den späteren privaten Revisions-/Transport-/Quittungssicherungen aus
PR #921. Die umfangreiche Merkle-Zerlegung aus #921 wird nicht übernommen.
Der neue Kandidat erhält vollständige `usage_record`-Objekte samt technischen
Spaltenprojektionen in der vorhandenen Tabelle. Nur neue Einträge, Rest-Auth
und neue Revision werden in einer gemeinsamen Transaktion geschrieben.
Alle bisherigen Leser bekommen den vollständigen logischen Auth-Zustand aus
einem frischen, STABLE PostgreSQL-Snapshot einschließlich nativer Kettenprüfung.
Es gibt keinen History-Cache und keine verkürzte Kostenlesung.

Weitere mögliche Trennungen sind immutable Admission-Pläne und abgeschlossene
Journal-/Kostenhistorie. Sie müssten neben den aktuellen Reservierungen und
Einmalbindungen atomar und vollständig rekonstruierbar bleiben. Für sie wird
hier kein RAM-Vorteil behauptet; sie sind nicht Teil dieses kleinen Eingriffs.

## Schutz und Integration

Der Schalter `HELMUT_LLM_USAGE_STORAGE` bleibt standardmäßig aus (`blob`).
`relational-atomic-v1` verlangt Loopback-HTTP und verweigert Vercel. Der SQL-
Vorschlag unter `supabase/proposals/` ist keine nummerierte Migration;
alle Funktionen verlangen zusätzlich `helmut.local_usage_experiment=on`.
Nur neue, isolierte, gestoppte Testkopien nach vollständigem Originalhash dürfen
konvertiert werden. Bestehende IDs/Generationen werden nicht still übernommen.
Es erfolgt keine Production-Anwendung und keine Änderung von Geldgrenzen.

Auftragsversion 5 und exakt gebundene erneuerte Version 6 bleiben zulässig.
Vollständige unbekannte Zusatzfelder, historische Verträge, Kostenbücher und
Belege bleiben erhalten. Kein Rückfall auf den 5.000er-Ring im gültigen EU-Auftrag.
Private Snapshots binden die gelesene Revision; eine erfolgreiche Quittung
bestätigt ausschließlich die vor dem HTTP-Aufruf gesendeten Inhalte.
Nur bestätigte CAS-Konflikte dürfen die bestehende Mutationsfunktion erneut
auf frischem Zustand versuchen. Netzwerk-/ACK-Unklarheit erzeugt weder Replay
noch Quittung; unbekannte Kosten bleiben reserviert.

ALWAYS-Trigger verweigern alte Vollblob-Schreiber, direkte Historyänderungen
und Truncate. Erzeugte Hashspalten und die frische Kettenlesung erkennen
auch beschädigte Datensätze/SQL NULL. Funktionen bleiben SECURITY INVOKER mit
festem Suchpfad; PUBLIC/anon/authenticated erhalten keine Ausführungsrechte.
Die bisherigen Mandanten- und Berechtigungsprüfungen bleiben vorgeschaltet.

Rückweg: `helmut_auth_usage_restore_v1` rekonstruiert unter frischer Revision
den vollständigen Blob und erhält alle relationalen Archivzeilen. Erst nach
bestätigtem Restore den lokalen Schalter auf `blob` zurückstellen.
Kein DROP und kein Löschen alter Belege als Rücknahme. Erneute Versuche
verwenden eine neue isolierte Kopie; verbrauchte Laufrechte bleiben unberührt.

Der Betreiber hat `storage.js`, `ai.js`, `testkosten-budget.js` und den kurzen
Inventarabschnitt für diesen Sprint freigehalten. Bestehende W15-RAM-Tests,
Fixtures, Controller, `CURRENT_STATE.md`, Testauswahl und Quellpins wurden
nicht geändert. Der PR richtet sich gegen den Kopf von #972. Vor dessen
späterer Integration müssen Main, PR-Kopf, Parallelität und die vollständige
Worker-/Quellbindung neu abgeglichen werden. Die alten CPU-Quellpins binden
weiterhin den alten Budgetquelltext; sie erteilen diesem Kandidaten keine
500er-Freigabe. Den tatsächlichen Slot-/EU-DraftCompletion-/500er-Endweg
qualifiziert anschließend der bestehende Teststrang mit gültigen Bindungen.

## Gezielte Prüfung

- Reine Modulprüfung: 9/9 PASS; unabhängiger Testautor.
- Echte PostgreSQL17.6/PostgREST12.2.3-Prüfung: 13/13 PASS, darunter paralleles
  CAS, doppelte ID mit vollständigem Rollback, real committeter verlorener ACK
  ohne automatische Wiederholung, während des Requests geänderte Callerdaten,
  verbotene Altwriter, echte Datensatz-/NULL-Korruption, ACL/RLS und Restore.
- Tatsächlicher Speicher-/Kosten-/KI-Anschluss: 5/5 PASS. 5.000 alte Einträge
  bleiben vollständig, private relationale Quittung wird akzeptiert, kopierte
  Quittung abgewiesen, unklare Kosten bleiben reserviert; zwei in-process
  Anbietermockantworten, null bezahlte Aufrufe. Dieser Fall prüft den bestehenden
  Legacy-Kostenabschluss ohne installierten EU500-Admission-/DraftCompletion-Slot.
- Env-Inventar: 38/38 PASS. Syntax und `git diff --check` bestanden.

Zwei erste Hüllenfehler bleiben vollständig getrennt erhalten: zunächst
PGRST202 wegen noch fehlendem Funktionscache trotz sichtbarer Tabelle; danach
Node-Kindstart EACCES durch COPY-Dateimodus 0700. Nach Ursachenprüfung verlangen
Readiness die tatsächlichen RPC-Pfade und COPY explizit 0755. Ein getrennter
Kindstart bestand vor `native-03`. In den beiden Fehlversuchen wurde keine
Produktprüfgruppe erreicht. Sie werden nicht nachträglich als PASS umgedeutet.

[Native Ergebnisse](belege/auth-usage-split-20261028/native-03/RESULT.SAFE.json),
[erhaltene Startfehler](belege/auth-usage-split-20261028/START_FAILURES.SAFE.json),
[unabhängige Quellenprüfung](belege/auth-usage-split-20261028/SOURCE_REVIEW.SAFE.json).

## Identischer begrenzter ALT–NEU–NEU–ALT-Vergleich

Jeder Fall startet eine frische Datenbank im selben unveränderlichen Image,
Node24.19.0/PG17.6/PostgREST12.2.3, 2 CPUs, 2.048.000.000 Bytes Limit,
`work_mem=4MB`, unveränderte WAL-/fsync-/GC-Einstellungen, kein externes Netz.
PostgreSQL, PostgREST, Node und SQL-Kinder befinden sich in derselben Cgroup.
Der echte `memory.peak` enthält Setup, Bootstrap und Container-Dateicache;
kein Grundlastabzug, kein Cachelöschen, kein erzwungenes GC. Host-Dockerdaemon,
Host-Python-Launcher und Imagebau sind nicht in dieser Cgroup.

Die synthetische Fixture hat exakt 13.616.853 Startbytes: 6.000 vollständige
Komponenten-Usage-Einträge mit 4.020.001 Bytes (29,52 %) und 9.596.852 Bytes
Rest. Der Rest besteht überwiegend aus offengelegtem deterministischem
Pseudozufallspolster. Das entspricht der belegten Gesamtgröße, rekonstruiert
aber weder private W15-Datenformen noch echte Ausführungsautorität.
Alle vier Fälle führen dieselben 24 Änderungen mit vier neuen Einträgen und
72 HTTP-Anfragen aus, jeweils mit vollständiger Endzustandsprüfung.

| Fall | Gemeinsamer Peak Bytes | WAL Bytes | TEMP Bytes | Zeit ms |
|---|---:|---:|---:|---:|
| ALT 1 | 1.912.393.728 | 375.165.392 | 341.529.888 | 35.038,871 |
| NEU 1 | 1.531.035.648 | 253.028.800 | 0 | 34.659,739 |
| NEU 2 | 1.535.172.608 | 253.028.800 | 0 | 40.090,884 |
| ALT 2 | 1.944.104.960 | 375.165.448 | 341.529.888 | 43.805,902 |

Mittlerer Peak **1.928.249.344 → 1.533.104.128 Bytes**:
**395.145.216 Bytes / 20,49 % weniger RAM**. Die beiden Paare verbessern sich
um 19,94 % und 21,03 %. WAL sinkt im Mittel um 32,56 %, die gesendeten
Schreibkörper von 326.831.851 auf 230.336.697 Bytes um 29,52 %; TEMP
341.529.888 → 0. Die Lesemenge bleibt mit rund 667,8 MB praktisch gleich
(NEU +18.504 Bytes). Durchschnittliche Zeit 39,42 → 37,38 s und CPU
42,53 → 41,20 s bei deutlicher Streuung; kein allgemeiner Geschwindigkeitsbeleg.

Alle Startzustände und alle vollständigen Endzustände sind zwischen den
Varianten hashgleich. Jeder Fall erhält alle 6.000 alten und alle vier neuen
Einträge samt übrigen Feldern. Dies belegt den technischen Nutzen des kleinen
Eingriffs. Es belegt kein Plateau, Unit60, Auth30, volle EU500-Integration,
500-MB-Reserve oder vollständige 500/1.500-Ergebnisabnahme. Die Ersparnis darf
nicht vom historischen Peak aus #972 abgezogen oder mit anderen PR-Ersparnissen
addiert werden. Kein weiterer vollständiger 500er-Lauf wurde gestartet.

[Zusammenfassung, Quellenpins und alle vier Rohbelege](belege/auth-usage-split-20261028/COMPARISON.SAFE.json),
[unabhängige Zahlen-/Quellenabnahme](belege/auth-usage-split-20261028/INDEPENDENT_RESULTS_REVIEW.SAFE.json)
und [vollständiges SHA256-Manifest](belege/auth-usage-split-20261028/MANIFEST.SAFE.json).
Die unabhängige Prüfung hat Rohwerte, LSN-WAL-Differenzen, alle 14 Quellpins,
Paare/Mittelwerte und Abschlusszustände akzeptiert. Die Ersparnis gehört zum
kombinierten Abtrennungs-/skalaren RPC-Pfad; sie wird nicht der Abtrennung
allein zugerechnet. Der unveränderte Sammelbericht trägt noch seinen damaligen
Status vor der Abnahme; die gesonderte Abnahme bindet exakt dessen SHA256.

## Wiederholbarkeit und CI

Der Imagebau verwendet `scripts/auth-usage-split.Dockerfile` mit dem bereits
im Repository gepinnten PG17.6-Digest, dem tatsächlich vorhandenen Node24.19.0
und dem vorhandenen CI-Pin/Archivhash für PostgREST12.2.3. Buildkontext enthält
nur die beiden Binaries und Dockerfile, keine Zugangsdaten. Beispiel:

```sh
docker build -t helmut-auth-usage-component:20261028 /pfad/zum/binary-buildkontext
node scripts/lokal.js -- node scripts/auth-usage-split/module-test.js
python3 -B scripts/auth-usage-split-container.py --case native --output /tmp/eigener-neuer-native-beleg
```

Der zusätzliche getrennte Workflow `auth-usage-split.yml` automatisiert die
kleine Modul-/native Anschlussprüfung ohne Originale, Motor oder Benchmarks.
Die bestehenden Pflichtchecks und ihre Auswahl bleiben unverändert. Ihr
tatsächlicher Kopfstatus ist im PR zu prüfen; lokale Komponentenbelege ersetzen
keine Pflicht-CI oder 500er-Quellbindung. Kein Merge, Production-Deployment,
Production-Migration oder neue kostenpflichtige Ressource ist freigegeben.
