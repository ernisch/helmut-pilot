# Import-Preimage v2 — Ablauf (lokale Vorbereitung, inaktiv)

**Stand: 30.09.2026.** Dieses Runbook beschreibt nur den v2-Vertrag des rein
lokalen, offline 500er-Ersatz-Wegs. Es ist **keine** Import-, Provisionierungs-,
Aktivierungs- oder Testfreigabe: in diesem Schritt wird **kein** Import, **keine**
Aktivierung, **kein** 500er Test und **keine** Flagänderung ausgeführt.

Kanonische Code-Quellen: [Generator](../../scripts/import-preflight-500-sql-generator.js),
[Snapshot-Assembler](../../scripts/import-preimage-500-snapshot.js).

## Vertrag

- **Snapshot-Vertrag `helmut-500-preimage/2`.** v1 wird weder erzeugt noch als v2
  akzeptiert (kein stiller Fallback). Der Snapshot ist ein **Verzeichnis**:
  `manifest.json`, je Snapshot-Tabelle genau eine `<tabelle>.jsonl` und
  `fremd_profiles.jsonl` (profiles ohne Mandat).
- **Frisches vollständiges Preimage.** Der vollständige Snapshot wird separat rein
  lesend aus der Production-Datenbank erzeugt, geprüft und sicher aufbewahrt. Der
  Generator liest selbst keine DB und erzeugt den Snapshot nicht.
- **Manifest-/Paket-/Hash-Bindung.** Das Manifest bindet `operationId`, Paket-Hash,
  Mengen, ID-Sets, Spaltenlisten, Zeilenzahlen und die SHA-256 jeder Datei in einem
  eigenen kanonischen Hash. Fehlende, zusätzliche oder manipulierte Dateien,
  Spalten, Zeilen oder IDs sowie ein falsches `aktiv`- oder AfD-Merkmal brechen
  fail-closed ab.
- **0600-Artefakte, atomar.** Snapshot- und SQL-Ausgaben werden atomar (Temp +
  Rename) mit mode 0600 geschrieben; der Assembler schreibt ausschließlich
  außerhalb des Repository-Roots. Der Generator gibt **kein** SQL auf stdout aus.
- **Atomarer Vorwärts-/Rückweg.** Je Weg genau eine Transaktion (`begin`/`commit`
  exakt einmal). Vorwärts löscht **ausschließlich** die Preimage-Profil-IDs
  (Kinddaten über `ON DELETE CASCADE`) und stellt genau die 500 Zielprofile her;
  der Rückweg löscht **nur** die neue Kohorte und stellt die vollständigen
  Snapshotdaten wieder her.
- **FK-sichere Rückweg-Reihenfolge.** `matching_runs` **vor** `matching_results`,
  weil `matching_results.run_id` auf `matching_runs.id` zeigt (Trigger
  `matching_results_run_complete`). Umgekehrte Reihenfolge verletzt den FK.
- **Erwarteter Endzustand.** Genau 500 Mandatsprofile, 501 `profiles` gesamt,
  0 aktiv, AfD = 0 und das Fremdprofil (profiles ohne Mandat) erhalten.
- **Frischer 0-aktiv-Lesebeleg.** Vor dem Import liegt ein frischer, rein lesender
  0-aktiv-Beleg vor; der Vorwärtsweg weist danach 500/501/0 aktiv aus.

## Unverändert verbindlich

- Exakt **500** Zielprofile, alle gleich behandelt; **500/501** und der Erhalt des
  Fremdprofils bleiben unverändert.
- AfD-Ausschluss über **Partei UND Fraktion**; Fraktionslosigkeit hebt eine
  bestehende AfD-Parteimitgliedschaft nicht auf, ungeklärte Fälle werden nicht
  importiert.
- **Stop vor jeder Aktivierung, vor dem 500er Test und vor jeder Flagänderung.**

## Lokale Aufrufkette (nur Vorbereitung, ohne Ausführung)

1. Snapshot bauen (lokal, offline):
   `node scripts/import-preimage-500-snapshot.js --input-dir <dir> --out <snapshot-dir> --operation-id <id> --operator <name> [--paket <datei>]`
2. SQL-Paar erzeugen (fail-closed, ohne Ausführung):
   `node scripts/import-preflight-500-sql-generator.js --snapshot <snapshot-dir> --out <dir> [--paket <datei>]`

Beide Aufrufe bleiben rein lokal/offline. Schritt 2 erzeugt nur SQL-Text als
0600-Dateien; ausgeführt wird er erst durch den Betreiber innerhalb einer
gesonderten Freigabe.
