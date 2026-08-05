# Archiv — historische Projektstände und Nachweise

**Stand:** 2026-08-05

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
