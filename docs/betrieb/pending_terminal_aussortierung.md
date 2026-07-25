# OP-06 — Terminales Aussortieren des Alt-Rückstands (Freigabevorlage)

**Stand:** 2026-07-18 · **Status:** vorbereitet + offline getestet, **NICHT ausgeführt** —
wartet auf ausdrückliche Freigabe. Kein Production-Write, kein KI-Call, kein Deploy erfolgt.

Grundlagen: `docs/betrieb/understanding_rueckstand_analyse.md` (Klassifikation §3),
`docs/betrieb/understanding_recovery_trockenlauf.md` (§12), Live-Verifikation aller
Duplikat-Behauptungen per read-only SQL gegen Production am 2026-07-17/18 (siehe
Sprintbericht `docs/betrieb/datenmotor_sprint_pending_understanding_ko.md` §3).

---

## 1 · Exakte Aktion

GitHub-Action **`pending-terminal-aussortieren.yml`** (nur `workflow_dispatch`) mit
`confirm_text = AUSSORTIEREN_34_BESTAETIGT` ausführen. Die Action setzt für **genau die
34 Allowlist-Fälle** (hart verdrahtet in `lib/helmut/pending-terminal.js`)
`understanding_status` per **konditionalem PATCH** von `pending` bzw. `failed` auf
**`failed-final`** und schreibt die Rollback-Kennung
`… | aussortiert:aus-<run_id>:<vorstatus>` in `understanding_model`.

- Schritt A läuft IMMER zuerst read-only (Plan + Pre-Snapshot der Zielfälle).
- Schritt B nur bei exaktem Token; doppelt gesperrt (Flag `HELMUT_PENDING_TERMINAL_EXECUTE`
  wird nur transient im Action-Schritt gesetzt, nie in Vercel-Prod).
- **0 KI-Aufrufe, kein Delete, keine weiteren Spalten.** Idempotent (Zweitlauf: alle
  Fälle `bereits-terminal-idempotent`, 0 Writes).

## 2 · Betroffene Datensätze und Tabellen

**Nur Tabelle `public.knowledge_objects`, nur die Spalten `understanding_status` und
`understanding_model`, nur diese 34 Zeilen** (exakte `vorgang_id`s, live erhoben 2026-07-17):

**Rauschen (27)** — nicht-politisch/Kommentar (11): `vg-achtelfinale`, `vg-seniorenresidenz`,
`vg-pflegefachkraft`, `vg-volkspartei`, `vg-0fb6ee1e45ecdc3163012b9e`, `vg-problemfall`,
`vg-autosuggestion`, `vg-eingespart`, `vg-rassistische`, `vg-attackiert`, `vg-bürokratischen`;
regional/lokal (8): `vg-wochenvorschau`, `vg-dringend`, `vg-demonstranten`,
`vg-mobilitätsknoten`, `vg-parkplätzen`, `vg-kundgebung`, `vg-minderheitenpartei`,
`vg-agrarreform`; Ausland/EU (8): `vg-dauerkrise`, `vg-gerettet`, `vg-zwangsadoptionen`,
`vg-produzieren`, `vg-aargauer`, `vg-ausnahmezustand`, `vg-verbrenner`,
`vg-b2e2e8f9490af875f9f4c4aa`.

**Belegte Themen-Duplikate (7)** — je Fall existiert ein `complete`-KO zum selben Thema
(einzeln per SQL live verifiziert): `vg-einkommensteuer`, `vg-kinderfreibetrag`,
`vg-bundesagentur`, `vg-riesenfehler`, `vg-gesetzentwurf` (einziger `failed`-Fall der Liste;
ein F6-Retry würde hier duplizieren), `vg-forschung` (strukturell ≡ `vg-wissenschafts`),
`vg-psychotherapie` (`complete`-KO `vg-psychotherapeuten` seit 05.07.).

**Bewusst NICHT enthalten:** die 4 Einzel-Doc-Recovery-Kandidaten (`vg-arbeitsverträge`,
`vg-medikamenten`, `vg-steuerstrafrecht`, `vg-umstellungen`), die manuellen Fälle
(`vg-krankschreibung`, `vg-privatsieren`), die 10 offenen Ermessensfälle der Kategorie 2
(u. a. `vg-wissenschafts`, `vg-versicherten`, `vg-mietregulierung`) und die 2 frischen
`failed` vom 17.07. (`vg-45975d00f663a2ec163778de`, `vg-unterhaltsvorschuss` — OP-13).

## 3 · Erwartete Auswirkungen

- Der Pending-Cron prüft die 34 Fälle nicht mehr bei jedem Lauf (Rest-`pending` sinkt
  von 49 auf 16, `failed` von 4 auf 3).
- Kein KO wird ausgeliefert/gematcht, das es nicht vorher schon wurde (die 34 Fälle wurden
  nie ausgeliefert — `status` bleibt unberührt).
- Die zugehörigen `raw_documents` bleiben unangetastet (kein Delete; Retention-Frage bleibt
  eigenständig OP-12).
- Voraussetzung für gefahrlose OP-13-Aktivierung (der Duplikat-`failed`-Fall
  `vg-gesetzentwurf` ist danach terminal und kann nicht mehr doppeln).

## 4 · Risiken

- **Fehlklassifikation** (ein relevanter Fall würde terminal aussortiert): durch dreifache
  Belegkette gemindert — Forensik-Klassifikation, Trockenlauf-§12, Live-SQL-Verifikation
  jeder Duplikat-Behauptung; die mehrdeutigen/relevanten Fälle sind ausdrücklich NICHT in
  der Allowlist. Restrisiko: gering; zudem vollständig reversibel (§5).
- **Race mit laufendem Cron:** konditionales PATCH auf den Vorstatus — hat sich ein Fall
  zwischen Plan und Write geändert (z. B. inzwischen `complete`), trifft der Filter 0 Zeilen
  und es wird nichts geschrieben (im Bericht als `status-veraendert-seit-planung` sichtbar).
- **Kein Kosten-/KI-Risiko:** 0 KI-Aufrufe; reine Metadaten-PATCHes.

## 5 · Rollback

Jede geschriebene Zeile trägt die eindeutige Kennung `aussortiert:aus-<run_id>:<vorstatus>`
in `understanding_model`. Rollback = gezieltes Zurücksetzen genau dieser Zeilen:

```sql
-- Vorstatus pending zurücksetzen:
update knowledge_objects
   set understanding_status = 'pending',
       understanding_model = regexp_replace(understanding_model, ' \| aussortiert:aus-<run_id>:pending$', '')
 where understanding_model like '%aussortiert:aus-<run_id>:pending';
-- Vorstatus failed zurücksetzen:
update knowledge_objects
   set understanding_status = 'failed',
       understanding_model = regexp_replace(understanding_model, ' \| aussortiert:aus-<run_id>:failed$', '')
 where understanding_model like '%aussortiert:aus-<run_id>:failed';
```

Kein Datenverlust möglich: es wird nichts gelöscht, keine anderen Felder verändert; der
Pre-Snapshot aus Schritt A dokumentiert den Vorzustand jedes Falls zusätzlich im Action-Log.

## 6 · Exakter Freigabesatz

> **„Ich gebe das terminale Aussortieren der 34 bestätigten Alt-Rückstands-Fälle frei:
> GitHub-Action `pending-terminal-aussortieren.yml` mit confirm_text
> `AUSSORTIEREN_34_BESTAETIGT` ausführen (34 konditionale PATCHes auf `failed-final`,
> 0 KI-Calls, kein Delete, Rollback-Kennung `aussortiert:aus-<run_id>:<vorstatus>`)."**

Voraussetzung: dieser PR ist nach `main` gemerged (die Action + der Terminal-Schutz-Fix
müssen auf dem `main`-Stand liegen, von dem die Action ausgecheckt wird). Empfohlen NACH
der Einzel-Doc-Recovery der 4 verbleibenden OP-05-Fälle (erst retten, dann aussortieren —
die Allowlisten sind disjunkt, die Reihenfolge ist also nur Vorsichtsprinzip, kein
technischer Zwang).

---

## 7 · Nachweise nach Ausführung (im Beweisprotokoll zu dokumentieren)

1. Action-Log Schritt B: `geschriebene: 34` (bzw. weniger mit benannten Skip-Gründen).
2. Read-only-SQL: 34 Zeilen `understanding_status='failed-final'` mit Kennung
   `aussortiert:aus-<run_id>%`; `pending`-Rest = 16, `failed`-Rest = 3 (Stand 2026-07-18).
3. Idempotenz-Zweitlauf der Action (read-only bzw. mit Token): 0 Writes, alle 34
   `bereits-terminal-idempotent`.
4. Nächster Understanding-Cron-Lauf: keine `skipped-no-cluster`-Einträge mehr für die 34.

_Tests: `scripts/pending-terminal-test.js` (63 Assertions) — Allowlist-Integrität, doppelte
Sperre, Nie-wieder-Garantie (`failed-final` in Pending-Filter + `understandOneCluster`),
Idempotenz, Rollback-Kennung, Datenschutz der Berichte. Offline-Suite grün._
