# OP-30 — Endgültige Bewertung der fünf lokal fehlgeschlagenen Tests

**Stand:** 2026-08-08 · Prüf-, Commit- und PR-Sprint
**Basisstand für den Vergleich:** `a07954d` (Merge von PR #232 auf `main`)
**Vergleichsmethode:** separater `git worktree` auf `a07954d`, gleicher Node `v22.22.2`,
gleiche Umgebung (`HELMUT_SOURCE_MODE=off`, keine Zugangsdaten), **ohne** den bestehenden
Arbeitsbaum zu verändern.

---

> ## ⚠ URSACHENKORREKTUR (2026-08-25, Skalierungssprint)
>
> **Die Klassifizierung dieses Dokuments bleibt richtig:** alle vier sind Baseline-Fehler,
> keine Regression, und in der CI grün (bestätigt an PR #269: **277/277 Suiten grün in 384 s**,
> mit `PASS provision-tenant-test.js` und `PASS tenant-neutrality-test.js` im Lauf-Log).
>
> **Die unten genannten URSACHEN sind in drei von vier Fällen sachlich falsch — und zwar
> genau umgekehrt.** Die Suiten scheitern nicht, weil eine Ablage *fehlt*, sondern weil in
> einer Cloud-Sitzung zwei Umgebungsschalter *gesetzt* sind, die die CI nie setzt:
>
> | Suite | tatsächliche Ursache |
> |---|---|
> | `privacy-vollstaendigkeit` | `HELMUT_V3_STORE=1` in der Sitzungsumgebung |
> | `provision-tenant` | `HELMUT_V3_STORE=1` |
> | `tenant-neutrality` | `HELMUT_V3_STORE=1` |
> | `profile-db` | `HELMUT_STORAGE_BACKEND=supabase` |
>
> **Wie das belegt wurde:** Bisektion über alle 139 Umgebungsvariablen der Sitzung, jeweils
> beidseitig geprüft — Variable gesetzt ⇒ rot, Variable entfernt ⇒ grün. Die lokale
> Dateiablage funktioniert einwandfrei; ein erreichbarer Supabase-Endpunkt wird an keiner
> Stelle gebraucht.
>
> **Warum das zählt:** beide Schalter entscheiden laut
> [`production-schreibgate.js`](../../lib/helmut/production-schreibgate.js) darüber, **wohin
> geschrieben wird** — sie sind der Kern des Vorfalls vom 2026-07-27.
>
> **Behoben am 2026-08-25:** `scripts/lokal.js` stellt die Speicherwahl im Kindprozess
> deterministisch auf lokal (`HELMUT_STORAGE_BACKEND=local`, `HELMUT_V3_STORE` entfernt) —
> genauso, wie es `HELMUT_SOURCE_MODE=off` schon vorher tat. Die Sitzungsvariablen selbst
> bleiben unangetastet. **Keine Testzusicherung wurde abgeschwächt**, keine Suite geändert;
> testgesichert durch `scripts/netzschutz-test.js` §15. Seither laufen alle vier Suiten auch
> in der vollen Cloud-Sitzung grün (20 / 44 / 41 / 39 PASS, 0 FAIL).
>
> Belege: [`skalierung-25-50-100.md`](skalierung-25-50-100.md).

## 1 · Das Ergebnis in einem Satz

**Keiner der fünf Fehler ist eine Regression durch OP-30.** Alle fünf treten am
**unveränderten Basisstand identisch** auf, mit identischer Fehlerzahl und identischer
Meldung. **Keiner** von ihnen blockiert CI — sie sind in CI grün.

## 2 · Die fünf im Einzelnen

| # | Suite | Befund | Klassifizierung |
|---|---|---|---|
| 1 | `kalender-ics-test.js` | `Cannot find module 'ical.js'` | **Fehlende lokale Voraussetzung** |
| 2 | `privacy-vollstaendigkeit-test.js` | 18 PASS / 2 FAIL — V3-Store/Blob-Löschpfad | **Baseline-Fehler** |
| 3 | `profile-db-test.js` | 3 FAIL — DB-Fehlerrückfall | **Baseline-Fehler** |
| 4 | `provision-tenant-test.js` | 40 PASS / 1 FAIL — Teardown | **Baseline-Fehler** |
| 5 | `tenant-neutrality-test.js` | 38 PASS / 1 FAIL — Teardown | **Baseline-Fehler** |

### 1 · `kalender-ics-test.js`

- **Befehl:** `node scripts/lokal.js scripts/kalender-ics-test.js`
- **Erwartet:** Suite läuft, ICS-Einladungen werden geparst
- **Tatsächlich:** `Error: Cannot find module 'ical.js'`, Exit 1, 46–149 ms
- **Ursache:** `node_modules/` ist in dieser Umgebung **leer** (0 Pakete). `package.json`
  deklariert genau eine Laufzeitabhängigkeit: `ical.js@2.2.1`; `lib/helmut/kalender/ics-einladung.js:26`
  lädt sie. Sie wurde lokal nie installiert.
- **Am Basisstand vorhanden:** **ja**, identisch.
- **Durch fehlende lokale Infrastruktur:** **ja** — genau das ist die Ursache.
- **Durch OP-30 verursacht:** nein. OP-30 fasst weder `package.json` noch das Kalendermodul an.
- **Regression:** nein.
- **Blockiert CI/Merge:** **nein.** Die CI installiert die Abhängigkeit selbst
  (`npm ci`, Schritt „Abhängigkeiten installieren"). Im CI-Lauf zu `a07954d` ist diese Suite grün.
- **Korrektur in diesem Sprint nötig:** **nein.** Eine Netzinstallation wäre für einen
  Testlauf, der in CI ohnehin korrekt läuft, unverhältnismäßig — und der lokale
  Production-Schutz lässt sie bewusst nicht zu.

### 2 · `privacy-vollstaendigkeit-test.js`

- **Erwartet:** „Ohne V3-Store: `skipped=true, ok=true`" und „Gesamtlöschung läuft durch und ist `ok`"
- **Tatsächlich:** beide FAIL, `{"ok":false}`; 18 PASS / 2 FAIL, 381–416 ms
- **Ursache:** Der Löschpfad braucht einen erreichbaren V3-Store bzw. eine Blob-Ablage. Ohne
  lokale Ablage meldet er `ok:false` statt des erwarteten sauberen Übersprungs.
- **Am Basisstand vorhanden:** **ja**, wortgleich.
- **Durch OP-30 verursacht:** nein — OP-30 fasst weder Löschpfad noch Privacy-Kette an.
- **Regression:** nein. **Blockiert CI:** nein (in CI grün).
- **Korrektur hier:** **nein** — gehört zum Lösch-/Retentionsbereich (OP-Bereich Aufbewahrung),
  nicht zu OP-30.

### 3 · `profile-db-test.js`

- **Erwartet:** „DB-Fehler wirft NICHT, fällt sicher zurück"; `saveProfile()` wirft nicht
- **Tatsächlich:** 3 FAIL, 129–1720 ms
- **Ursache:** Die Suite braucht einen erreichbaren (auch fehlerhaften) Supabase-Endpunkt, um
  den Rückfallpfad auszulösen. Ohne Zugangsdaten entsteht ein anderer Fehlertyp als der geprüfte.
  Die Suite steht zusätzlich auf der NETZ-GUARD-Liste — sie **versucht** eine Nicht-Localhost-Verbindung.
- **Am Basisstand vorhanden:** **ja**, identische drei Fehler.
- **Durch OP-30 verursacht:** nein.
- **Regression:** nein. **Blockiert CI:** nein.
- **Korrektur hier:** **nein** — gehört zum Profil-/Relationalbereich (OP-29/F-P6).

### 4 · `provision-tenant-test.js` · 5 · `tenant-neutrality-test.js`

- **Erwartet:** „Teardown des selbst provisionierten Mandanten erlaubt / funktioniert und
  lässt fremde unberührt"
- **Tatsächlich:** je 1 FAIL (40 PASS / 1 FAIL bzw. 38 PASS / 1 FAIL), 489–713 ms
- **Ursache:** Der Teardown-Pfad schreibt gegen eine Mandantenablage. Ohne lokale Ablage
  scheitert der Abbau — **nicht** die Trennung selbst: alle Trennungszusagen sind grün.
- **Am Basisstand vorhanden:** **ja**, beide identisch.
- **Durch OP-30 verursacht:** nein.
- **Regression:** nein. **Blockiert CI:** nein.
- **Korrektur hier:** **nein** — Testinfrastruktur für Mandantenprovisionierung, eigener Bereich.

## 3 · Der wichtigere Befund: CI ist auf `main` bereits rot

Der CI-Lauf zum Basisstand `a07954d` (Run `31215315331`, 2026-08-07) endet mit
**`Syntax + Offline-Suiten: failure`** — **206/208**, fehlgeschlagen sind dort
**`berlin-e2e-vertrag-test.js`** und **`werkzeug-lesefehler-test.js`**.
`Browser-/Mobile-Smoke (Chromium)` ist grün.

Das sind **andere** Suiten als die fünf oben. Beide laufen **lokal grün**, sowohl am
Basisstand als auch im Sprintbaum (`werkzeug-lesefehler-test`: 43 PASS / 0 FAIL).
Es sind damit **CI-umgebungsspezifische** Fehlschläge, kein Codefehler, der lokal
reproduzierbar wäre.

**Für den Merge heißt das:** das Pflicht-Gate ist **schon vor diesem Pull Request rot** —
nicht wegen OP-30. Ob der Pull Request das Gate grün bekommt, entscheidet sich erst am
CI-Lauf des Branches. Der Sprint „Berliner Wackler" hat das untreue Testgerüst in
`scripts/e2e-vertrag-geruest.js` bereits repariert; ob das den CI-Fehlschlag von
`berlin-e2e-vertrag-test.js` behebt, ist **offen** und wird am PR-Lauf sichtbar.

## 4 · Eine echte Regression — von mir verursacht und behoben

**Der lokale Production-Schutz hätte das gesamte CI-Gate abgebrochen.**
`scripts/run-offline-tests.js` lädt seit dem Korrektursprint `scripts/lokaler-netzschutz.js`.
Dessen Bedingung 5 verlangt `HELMUT_SOURCE_MODE` **exakt** `off` — im CI-Workflow war die
Variable **gar nicht gesetzt**. Nachgestellt: Exit 3, Abbruch vor dem ersten Test.

**Behoben** in `.github/workflows/ci.yml`: beide Jobs erklären jetzt ausdrücklich
`HELMUT_SOURCE_MODE: "off"`. Das schwächt nichts ab — es sagt aus, was dort ohnehin gilt.

## 5 · Zusammenfassung der Klassifizierung

| Klasse | Anzahl | Suiten |
|---|---|---|
| Baseline-Fehler | 4 | `privacy-vollstaendigkeit`, `profile-db`, `provision-tenant`, `tenant-neutrality` |
| Fehlende lokale Voraussetzung | 1 | `kalender-ics` |
| Erwarteter ehrlicher Kapazitätsbefund | 0 | — |
| **Neue Regression durch OP-30** | **1 (behoben)** | CI-Abbruch durch den Production-Schutz |
| Fehlerhafte/veraltete Testannahme | 0 | — |

**Kein Test wurde abgeschwächt.** Keine Erwartung wurde geändert, um ein grünes Ergebnis zu
erzeugen. Die vier Baseline-Fehler und der Infrastrukturfehler bleiben unverändert rot und
werden hier ausdrücklich als offen ausgewiesen.

## 6 · Wer sie später bearbeitet

| Suite | Zuständiger Bereich | Entscheidung vor Merge nötig? |
|---|---|---|
| `kalender-ics` | Entwicklungsumgebung (`npm ci` lokal) | nein |
| `privacy-vollstaendigkeit` | Aufbewahrung/Löschung | nein |
| `profile-db` | OP-29 / relationale Profile (F-P6) | nein |
| `provision-tenant`, `tenant-neutrality` | Mandantenprovisionierung (OP-03-Umfeld) | nein |
| `berlin-e2e-vertrag`, `werkzeug-lesefehler` (CI) | **offen — CI-Umgebung** | **ja**, siehe §3 |
