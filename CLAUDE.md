# CLAUDE.md — Arbeitsanweisung für Claude Code

Diese Datei ist die **Einstiegsschicht**, kein Handbuch. Sie gibt Orientierung in unter
zwei Minuten und verweist danach auf die kanonischen Dokumente. Sie wird **nur**
geändert, wenn eine neue dauerhaft verbindliche Projektregel entsteht.

**Stand:** 2026-08-05 (§9 geschärft: `CURRENT_STATE.md` nur noch kompakt, Historie ins Archiv)

---

## 1 · Was Helmut ist

Helmut ist ein **politischer KI-Stabschef** für Mandatsträger — kein
Medienmonitoring-Tool, kein News-Reader, kein Dashboard. Helmut reduziert die
politische Morgenlage auf **Entscheidungen, Kommunikation und Aufgaben**.

**Aktuelles Produktziel:** Verkaufsbereitschaft für den ersten zahlenden
Zweitmandanten. Die Blocker sind Betriebs-, Rechts- und Sicherheitsreife
(P0: OP-01…OP-04), nicht Funktionsumfang.

## 2 · Pflichtlektüre bei jedem neuen Thread

Genau diese drei Dateien, in dieser Reihenfolge — sonst nichts:

1. `CLAUDE.md` (diese Datei)
2. [`docs/START_HERE.md`](docs/START_HERE.md) — Produkt, Zielgruppe, Prinzipien
3. [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) — aktueller Stand, Blocker, offene PRs

Daraus ergibt sich der nächste Schritt. **Erst danach** aufgabenabhängig weiterlesen.

## 3 · Aufgabenabhängige Zusatzlektüre

Nur den Block lesen, der zur Aufgabe gehört.

**Architektur / Backend**
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- betroffene Datenmodelle: `supabase/migrations/` (nur relevante Dateien) + `lib/helmut/storage.js` (nur der konkrete Zugriff)
- nur die betroffenen Backend-Dateien in `lib/helmut/` und die betroffene Route in `server.js`

**Quellen**
- [`docs/quellenarchitektur/02-zielarchitektur.md`](docs/quellenarchitektur/02-zielarchitektur.md) (kanonisches Quellenmodell)
- [`docs/quellenarchitektur/00-master-status.md`](docs/quellenarchitektur/00-master-status.md) (Quellenstatus)
- [`docs/quellenarchitektur/07-paketaktivierung-profil-resolver.md`](docs/quellenarchitektur/07-paketaktivierung-profil-resolver.md) (Paketlogik)
- nur betroffene `lib/helmut/quellenarchitektur/seeds/*.js`, Mapper und `scripts/source-architecture-test.js`

**UI**
- Designregeln: Token-Block `:root` und Light-Mode-Overrides `:root[data-theme="light"]` in `styles.css`; Admin-Designentscheidungen in [`docs/admin-neuaufbau-2026-07.md`](docs/admin-neuaufbau-2026-07.md)
- nur die betroffene `render…View()`-Funktion in `client.js`
- nur die betroffenen Style-Abschnitte
- `scripts/*-ui-test.js` und `scripts/browser-smoke-test.js`

**Production / Security**
- [`docs/quellenarchitektur/05-sicherheitsmodell-rls.md`](docs/quellenarchitektur/05-sicherheitsmodell-rls.md) — **verbindlich** für Mandantentrennung, RLS, JWT
- [`docs/betrieb/deploy-rollback.md`](docs/betrieb/deploy-rollback.md), [`docs/betrieb/branch-protection.md`](docs/betrieb/branch-protection.md), [`docs/betrieb/env-inventar.md`](docs/betrieb/env-inventar.md), [`docs/betrieb/secret-rotation.md`](docs/betrieb/secret-rotation.md)
- [`docs/sprint1-sicherheit/01-zugriffsmatrix.md`](docs/sprint1-sicherheit/01-zugriffsmatrix.md)

**Offene Punkte, egal welche Aufgabe:** [`docs/datenmotor-restliste.md`](docs/datenmotor-restliste.md)
ist die **einzige verbindliche Liste** (OP-01…OP-23). Ältere Restlisten
(`freigabepunkte.md`, `readiness-verdict-2026-07.md`, `AUDIT_DATENMOTOR_2026-07.md`,
`audit/*`) sind historisch und dürfen nicht als aktueller Stand zitiert werden.

**Andere große Dokumentbereiche nicht lesen**, solange kein konkreter Bedarf
festgestellt wurde.

## 4 · Verbindliche Sicherheits- und Produktregeln

1. **Mandantentrennung ist App-seitig.** `service_role` umgeht RLS; RLS ist inert.
   Jede mandantenbezogene Query braucht `assertTenant` **und** einen expliziten
   `user_id=eq.<tenant>`-Filter. Kein stiller Fallback auf „alle Mandanten".
2. **Kein Mandant wird hartkodiert.** Insbesondere **darf der Pilot-Testnutzer („Cem")
   nicht fest in aktive Mandantenlogik eingebaut werden** — nicht als Default, nicht
   als Fallback, nicht als Sonderpfad, nicht im geteilten Quellenkatalog.
   Personenquellen entstehen zur Laufzeit aus dem Profil
   (`scheduler.personNewsSource`). Vorkommen in Testfixtures und Altkommentaren sind
   Alt-Bestand und dürfen nicht ausgeweitet werden.
3. **Belegpflicht.** Keine erfundenen Inhalte, keine erfundenen Quellen-URLs.
   Lieber ein ehrlicher Leerzustand als eine erfundene Lage.
4. **Kein falsches Grün.** Störungen, Rückstände und leere Zustände werden benannt.
5. **Einfachheit vor Funktionsumfang.** Konkreter politischer Nutzen und
   Verkaufsbereitschaft haben Vorrang vor zusätzlichen Funktionen.
6. **`main` ist die einzige Architekturwahrheit.** Die „Quellenplattform"-Branches
   (Generation B) werden **nicht** gemergt und **nicht** als Basis verwendet:
   [`docs/architecture/retired-quellenplattform-branches.md`](docs/architecture/retired-quellenplattform-branches.md).
7. **Keine Secrets ins Repo** — auch nicht in Doku, Beispielen oder Tests.
8. **Jede Migration braucht Rollback-SQL** im selben Verzeichnis.
9. **Produktionsrelevante Skripte, die Secrets benötigen, müssen sowohl lokal als auch in
   einer Claude-Code-Cloud-Sitzung lauffähig sein.** Sie lesen Secrets ausschließlich aus
   `process.env` — kein eigenes Parsen einer `.env.local` im Code. In Cloud-Sitzungen
   erreichen Secrets den Prozess **ausschließlich über die Claude-Code-Environment-
   Einstellungen** (Environment → Environment Variables), **niemals über den Chat und
   niemals über Commits**. Details/Referenz: [`docs/betrieb/env-inventar.md`](docs/betrieb/env-inventar.md) §8.
10. **Gemeinsam genutzter Zustand wird bedingt geschrieben, und eine Meldung behauptet nur, was
    die Ablage trägt.** Schreiben mehrere Läufe dieselbe Zeile/denselben Blob, ist Lesen →
    Ändern → Schreiben **ohne Bedingung** verboten (Compare-and-Set oder ein atomarer
    Schreibvorgang). Eine monotone Verschmelzung genügt **nicht** — sie ist monoton gegenüber
    dem *gelesenen* Stand, nicht gegenüber einem Schreibvorgang, den der Prozess nie gesehen
    hat. Wer einen Erfolg **meldet**, prüft ihn gegen den persistierten Stand oder meldet den
    Persistenzfehler ausdrücklich. Belegter Anlass: F-CAS, 2026-08-02
    ([`docs/betrieb/cron-fairness.md`](docs/betrieb/cron-fairness.md) §13).

## 5 · Ohne ausdrückliche Freigabe verboten

- Merge nach `main` (Merge = **Production-Deployment**) und jedes Deployment
- Anwenden einer Migration auf Production (aktuell offen: nur noch `20260720`;
  `20260727` ist am 2026-07-27 freigegeben und angewendet, `20260721` war
  bereits seit 2026-07-16 angewendet — die frühere Angabe war falsch, in
  Production gegengeprüft)
- Jede Änderung an Production-Daten (auch Löschen von Demo-Mandaten)
- Setzen, Ändern oder Rotieren von Secrets und Vercel-Env-Variablen
- Scharfschalten von Feature-Flags (`helmut-flags.json` oder Vercel-Env)
- Cron-Zeiten oder -Reihenfolge ändern
- Ausführen kostenverursachender Läufe (Backfills, Recovery, Massen-Crawls)
- Ausführen von `.github/workflows/understanding-recovery.yml` — dieser Pfad ist in
  Production bereits **gescheitert** (siehe `CURRENT_STATE.md` §10, F-3)
- Retention/Löschung scharfschalten (`HELMUT_RETENTION_EXECUTE`)
- Umschreiben der Git-Historie / Force-Push auf `main`
- Löschen von Dokumenten oder Ändern grundlegender Architekturentscheidungen

Bei allem darüber hinaus gilt: **autonom arbeiten**, solange die Änderung sicher,
reversibel und eindeutig sinnvoll ist.

## 6 · Branches, Tests, Pull Requests, Review

- **Vor jedem größeren Sprint erst auf bestehende Arbeit zum selben Thema prüfen:**
  offene Branches und Pull Requests sowie `docs/CURRENT_STATE.md` (teilweise
  abgeschlossene/blockierte Punkte) gezielt durchsehen, bevor eine neue
  Implementierung beginnt. Passende, sichere, aktuelle Arbeit fortsetzen statt
  unbegründet parallel neu bauen; bei konkurrierenden Lösungen erst die
  Unterschiede bewerten. Nur bei einer kritischen Produkt-/Architektur-/
  Sicherheitsentscheidung unterbrechen. Veraltete/ungeeignete Arbeit darf
  verworfen werden, dann aber kurz in `docs/CURRENT_STATE.md` dokumentieren.
- **Nie direkt auf `main`.** Feature-Branch, dann PR. `main` deployt automatisch.
- **Tests vor jedem PR:** `node scripts/run-offline-tests.js` (kanonischer Lauf,
  sammelt alle `scripts/*-test.js` ein, erzwingt Offline technisch). Bei UI-Änderungen
  zusätzlich `node scripts/browser-smoke-test.js`.
- **CI-Gate:** `.github/workflows/ci.yml` — Pflicht-Checks sind ausschließlich
  `Syntax + Offline-Suiten` und `Browser-/Mobile-Smoke (Chromium)`. Pfadgefilterte
  Workflows und Vercel-Checks nie als Required Check setzen.
- **PR-Beschreibung:** was geändert wurde, echte Testergebnisse (Zahlen, keine
  Behauptungen), Risiko, Rollback, und was bewusst **nicht** enthalten ist.
- **Nicht selbst mergen, nicht selbst deployen.** Merge-Empfehlung aussprechen,
  Entscheidung liegt beim Betreiber.
- Neue Tests gehören als `scripts/<name>-test.js` ins Repo — der Runner findet sie
  automatisch.

## 7 · Token- und Kostenregeln

1. Keine vollständige Repository-Inventur zu Sprintbeginn, keine rekursive Analyse
   aller Dateien.
2. Erst Dateinamen und gezielte Suchtreffer prüfen (`Glob`/`Grep`), dann einzelne
   Dateien öffnen.
3. Große Dateien (`server.js`, `client.js`, `styles.css`, `storage.js`) **nur
   abschnittsweise** lesen.
4. Bestehende Zusammenfassungen vor Rohdateien lesen.
5. Nur bei Widerspruch oder fehlendem Kontext tiefer suchen.
6. Bereits dokumentierte Projektgeschichte nicht erneut zusammenfassen; bestehende
   Doku nicht vollständig in Antworten kopieren — verlinken statt zitieren.
7. Keine zweite Zusammenfassung derselben Information an einer zweiten Stelle.
   Neue Doku nur an **einer** kanonischen Stelle pflegen.
8. Testdateien nicht vollständig lesen, wenn ein Suchtreffer oder ein einzelner Test
   reicht.
9. Keine langen internen Analyseprotokolle ausgeben.
10. Keine Subagenten für einfache Aufgaben.
11. Veraltete Informationen deutlich kennzeichnen statt still stehen lassen.
12. Nach einem Sprint nur die **tatsächlich veränderten** Statuszeilen aktualisieren.
13. Erkenntnisse, verifizierte Ursachen und getestete Sackgassen werden dokumentiert —
    ein gescheiterter Sprint darf im nächsten Thread keine vollständige Neuanalyse
    auslösen.

## 8 · Sprintzustände (verbindlich)

Jeder Sprint endet in **genau einem** Zustand:

| Zustand | Wann |
|---|---|
| **Erfolgreich abgeschlossen** | Abnahmekriterien erfüllt · relevante Tests grün · keine bekannten kritischen Fehler offen · Status belegt |
| **Teilweise abgeschlossen** | relevante Arbeit fertig, aber Abnahme unvollständig — Production-Beweis, Review, Merge oder Entscheidung stehen aus |
| **Blockiert** | Freigabe fehlt · externer Dienst/Zugriff fehlt · Produktentscheidung nötig · anderer PR/Migration muss zuerst |
| **Gescheitert oder abgebrochen** | Lösung funktioniert technisch nicht · Änderung muss verworfen werden · sicherer Abschluss nicht möglich · Abbruch wegen erheblicher Risiken |

Ein Punkt gilt **nur dann** als erfolgreich abgeschlossen, wenn die Abnahme
tatsächlich erfüllt ist. Ein blockierter oder gescheiterter Sprint verschwindet
**nie** aus der Dokumentation.

Bei nicht erfolgreichem Ausgang zusätzlich dokumentieren: was versucht wurde · was
erledigt wurde · was nicht · warum kein Abschluss möglich war · welche Tests liefen ·
welche Änderungen auf welchem Branch liegen · ob ein PR existiert · ob die Änderungen
sicher weiterverwendbar sind · welche Entscheidung als Nächstes nötig ist.

## 9 · Definition of Done

Ein Sprint ist erst beendet, wenn:

1. der Sprintzustand festgelegt ist,
2. Tests und Ergebnisse dokumentiert sind,
3. [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) aktualisiert ist,
4. offene Blocker dokumentiert sind,
5. der nächste sinnvolle Schritt dokumentiert ist,
6. Branch-, Commit- und PR-Status dokumentiert sind,
7. keine unerledigte Arbeit als erledigt markiert ist.

Das gilt **auch**, wenn kein Code geändert wurde, kein PR entstand, der Sprint
blockiert oder gescheitert ist, eine Nutzerentscheidung aussteht oder nur eine
Analyse stattfand.

**Was wann aktualisiert wird:**

| Datei | Wann |
|---|---|
| [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) | nach jedem größeren Sprint, **nur kompakt**: ausschließlich der aktuelle, entscheidungsrelevante Zustand (Grenze 30.000 Zeichen / 350 Zeilen, testgesichert durch `scripts/current-state-groesse-test.js`) · vollständige Sprintberichte, große Prüfprotokolle und historische Nachweise gehören in Beleg- bzw. Archivdateien ([`docs/archive/README.md`](docs/archive/README.md)) und werden **nie** kumulativ an den Status angehängt · historische Dateien werden nur aufgabenbezogen gelesen · jede Aktualisierung trägt ein Datum · der aktuelle Stand hat Vorrang vor älteren Statusdokumenten |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | nur bei tatsächlicher Architekturänderung |
| [`docs/START_HERE.md`](docs/START_HERE.md) | nur bei Änderung von Produktziel, Zielgruppe oder Prinzipien |
| `CLAUDE.md` | nur bei einer neuen dauerhaft verbindlichen Projektregel |
| [`docs/datenmotor-restliste.md`](docs/datenmotor-restliste.md) | wenn ein OP-Punkt belegt geschlossen, ergänzt oder geschärft wird |
