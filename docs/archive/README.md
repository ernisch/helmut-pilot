# Archiv — historische Projektstände und Nachweise

**Stand:** 2026-08-24

## Warum dieses Archiv existiert

`docs/CURRENT_STATE.md` war bis zum 2026-08-05 auf **5.983 Zeilen / ~686.000 Zeichen**
angewachsen, weil jeder Sprint seinen vollständigen Bericht dort anhängte. Als
Statusdokument war die Datei damit praktisch unlesbar und für jeden neuen Thread
unverhältnismäßig teuer. Der vollständige historische Inhalt wurde deshalb
**verlustfrei** hierher verschoben; `docs/CURRENT_STATE.md` wurde als kompakter,
ausschließlich aktueller Projektstatus neu aufgesetzt.

## Was wo liegt

| Datei | Inhalt |
|---|---|
| [`project_state/2026_08_05_CURRENT_STATE_full.md`](project_state/2026_08_05_CURRENT_STATE_full.md) | Der vollständige `CURRENT_STATE.md`-Stand bis einschließlich 2026-08-05 (11. OP-25-Durchgang): alle Sprintberichte, Durchgänge, Nachweise und historischen Tabellen. **Byte-identisch archiviert** (per `git mv`, SHA256 `bbc7cdd08824f49e596e3fc488973e49d5b4582961cd3948bb66e70c5732771d`); die Git-Historie der Datei ist über `git log --follow` erhalten. |
| [`project_state/2026_08_17_CURRENT_STATE_full.md`](project_state/2026_08_17_CURRENT_STATE_full.md) | Der vollständige `CURRENT_STATE.md`-Stand vor der Verdichtung vom 2026-08-17. |
| [`project_state/2026_08_24_CURRENT_STATE_full.md`](project_state/2026_08_24_CURRENT_STATE_full.md) | Der vollständige `CURRENT_STATE.md`-Stand vor der Verdichtung vom 2026-08-24 (Sprint „Vorbereitung 25 Mandate"). **Byte-identisch archiviert** (SHA256 `1e9a9356ab61da7858a7c4f46f73cca4d43fc81f0e64a21a9306443dcbd1b0d9`). Enthält u. a. die vollständigen Kopfabsätze zur Motor-Aktivierung 23./24.08., die PR-Bereinigungshistorie und die Sprintliste bis 24.08. |
| [`project_state/2026_09_01_CURRENT_STATE_full.md`](project_state/2026_09_01_CURRENT_STATE_full.md) | Der vollständige `CURRENT_STATE.md`-Stand vor der **ersten** Verdichtung vom 2026-09-01 (Reife-/Korrektursprint und PR-Bereinigung). **Byte-identisch archiviert** (SHA256 `8eae6083c670f054aa04b69364018cca50612aaa5b323df0de1e7ea71a199d97`). Beim Anlegen am 01.09. nicht in dieser Liste eingetragen — nachgetragen am 01.09. |
| [`project_state/2026_09_01b_CURRENT_STATE_full.md`](project_state/2026_09_01b_CURRENT_STATE_full.md) | Der vollständige `CURRENT_STATE.md`-Stand vor der **zweiten** Verdichtung vom 2026-09-01 (Sicherheitsrahmen des 500er-Funktionstests). **Byte-identisch archiviert** (SHA256 `83147ee8567d3f551c8ec067a9722edd91f6ccd58f13f876a993b5c2faaf1075`). Enthält u. a. die ungekürzten Sprintabschnitte §14–§22 (24.08.–01.09.). |
| [`project_state/2026_09_01c_CURRENT_STATE_full.md`](project_state/2026_09_01c_CURRENT_STATE_full.md) | Der vollständige `CURRENT_STATE.md`-Stand vor der **dritten** Verdichtung vom 2026-09-01 (Doku-Abschluss der Z3b-Messläufe zu PR #294). **Byte-identisch archiviert** (SHA256 `78f95e49dec79b45e44cfddce41993a8fe58868f947e9a822aceefc85e0a75af`). Enthält die ungekürzten Abschnitte §14–§23 in der Fassung vor der Aufnahme der Azure-Messwerte. |

## Verbindliche Regeln

1. **`docs/CURRENT_STATE.md` enthält nur den aktuellen, entscheidungsrelevanten
   Zustand** (harte Grenze 30.000 Zeichen / 350 Zeilen, testgesichert durch
   `scripts/current-state-groesse-test.js`). Historie wird dort nicht mehr angehängt.
2. **Archivdateien sind keine Pflichtlektüre.** Sie werden nur **aufgabenbezogen**
   gelesen: wenn ein Detailnachweis, ein alter Sprintverlauf oder ein Widerspruch
   zwischen Dokumenten geklärt werden muss. Für den aktuellen Stand gilt
   ausschließlich `docs/CURRENT_STATE.md`.
3. **Archivdateien werden nicht als aktueller Stand zitiert.** Sie sind Beleg,
   nicht Status.
4. Das Archiv selbst unterliegt **keiner** Größenbegrenzung.

## Ablage künftiger Sprintnachweise

- Vollständige Sprintberichte, Prüfprotokolle und Production-Nachweise gehören wie
  bisher in die **themenbezogenen kanonischen Belegdateien** (z. B. `docs/betrieb/*`,
  `docs/quellenarchitektur/*`, `docs/befund-*.md`, `belege/*`).
- Passt kein kanonisches Belegdokument, wird der Nachweis hier abgelegt:
  `docs/archive/project_state/JJJJ_MM_TT_<thema>.md`.
- `docs/CURRENT_STATE.md` erhält nur die **kompakte** Statuszeile mit Verweis auf
  den Beleg (siehe `CLAUDE.md` §9).
