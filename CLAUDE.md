# CLAUDE.md — dauerhafte technische Repository-Regeln

Stand: 11.11.2026. Arbeitsweise, Leseumfang, Agentenzusammenarbeit und Freigaben
stehen ausschliesslich in [AGENTS.md](AGENTS.md); bei Ueberschneidung gilt `AGENTS.md`.
Produktprinzipien: [START_HERE.md](docs/START_HERE.md). Aktueller Betrieb und Belege:
[CURRENT_STATE.md](docs/CURRENT_STATE.md). Historie ist kein aktueller Auftrag.

## 3 · Aufgabenabhängige Zusatzlektüre

Nur passende Abschnitte lesen; keine pauschale Volllektüre oder Repository-Inventur.

| Aufgabe | Relevante Quellen |
| --- | --- |
| Architektur/Backend | `docs/ARCHITECTURE.md`, betroffene Route/Module; bei Datenzugriff die betroffenen Migrationen und `lib/helmut/storage.js` |
| Quellen | `docs/quellenarchitektur/02-zielarchitektur.md`, `00-master-status.md`, `07-paketaktivierung-profil-resolver.md`; betroffene Seeds/Mapper und Tests |
| UI | betroffene `render…View()`, CSS-Tokens/Light-Overrides und Tests; `docs/admin-neuaufbau-2026-07.md` |
| Production/Security | verbindlich `docs/quellenarchitektur/05-sicherheitsmodell-rls.md` und `docs/sprint1-sicherheit/01-zugriffsmatrix.md`; passende Abschnitte in `docs/betrieb/deploy-rollback.md`, `branch-protection.md`, `env-inventar.md`, `secret-rotation.md` |
| OP-Punkte | `docs/datenmotor-restliste.md` ist die verbindliche OP-Liste; alte Audits/Restlisten sind historisch |

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
8. **Jede Migration braucht Rollback-SQL** im selben Verzeichnis. Vorwärtsmigrationen
   tragen einen **eindeutigen 14-stelligen Zeitstempel** (`JJJJMMTThhmmss_name.sql`),
   Rollback-Dateien heißen **`rollback_<vorwärtsname>.sql`** — ein normaler
   Supabase-CLI-Lauf darf sie nie als Vorwärtsmigration ausführen (empirisch belegt
   2026-08-14, `op30-zielarchitektur-2026-08-13.md` §17.4; testgesichert durch
   `scripts/migrations-organisation-test.js`). Altbestand mit 8-stelligen Stempeln ist
   angewendete Historie und wird nicht umbenannt.
9. **Produktionsrelevante Skripte, die Secrets benötigen, müssen sowohl lokal als auch in
   einer Codex-Cloud-Sitzung lauffähig sein.** Sie lesen Secrets ausschließlich aus
   `process.env` — kein eigenes Parsen einer `.env.local` im Code. In Cloud-Sitzungen
   erreichen Secrets den Prozess **ausschließlich über die Codex-Cloud-Environment-
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

- Merge nach `main` und regulaeres Production-Deployment ausserhalb der
  Dauerfreigabe vom 11.11.2026 in [`AGENTS.md`](AGENTS.md) sowie sonstige
  Deployments ohne passende ausdrueckliche Freigabe
- Anwenden einer Migration auf Production. **Welche Migrationen offen sind, führt
  ausschließlich [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md)**; die Liste wird hier
  bewusst nicht dupliziert, damit sie nicht auseinanderläuft. Jede Anwendung bleibt
  freigabepflichtig. (Historisch in Production gegengeprüft: `20260721` war entgegen
  einer früheren Angabe bereits seit 2026-07-16 angewendet, `20260727` seit 2026-07-27.)
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

Eigener Branch und PR, nie direkt auf `main`. Vollautomatischer Push/Merge und
Nachkontrolle richten sich ausschliesslich nach der Dauerfreigabe in `AGENTS.md`.
PR-Text nennt Problem/Aenderung, echte Pruefergebnisse, Risiko, Rueckweg und Umfang.
Nur auftragsrelevante Tests; keine pauschalen lokalen Doppelpruefungen der Pflicht-CI.
Gezielte lokale Befehle jeweils mit dem folgenden Schutzstarter verwenden:
`node scripts/lokal.js -- node scripts/run-offline-tests.js` (Standard),
`--bereich <name>`/`--aendert` (Bereich) oder
`node scripts/lokal.js -- node scripts/browser-smoke-test.js` (UI).

- **Jeder Testlauf geht über `scripts/lokal.js`, auch der einzelne.** Liegen
  Production-Kennungen in der Umgebung (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `VERCEL_TOKEN` — in Cloud-Sitzungen der Normalfall), kann ein **Handlauf einer einzelnen
  Suite** echte Zeilen in Production schreiben: Suiten, die bewusst den nicht injizierbaren
  Produktionspfad prüfen, reden dann mit der echten Datenbank. Zweimal belegt (2026-08-08 und
  2026-08-24, [`docs/betrieb/op30-aktivierung-5-mandate.md`](docs/betrieb/op30-aktivierung-5-mandate.md) §31.6).
  `scripts/lokal.js` entfernt die Kennungen aus der Kindprozess-Umgebung — Dateien und
  Sitzungsvariablen bleiben unangetastet.
- **CI-Gate:** `.github/workflows/ci.yml` — Pflicht-Checks bleiben ausschließlich
  `Syntax + Offline-Suiten` und `Browser-/Mobile-Smoke (Chromium)`. Der kanonische
  Prüfplan `scripts/ci-pruefplan.js` entscheidet fail closed anhand der tatsächlich
  geänderten Dateien, welche Schritte innerhalb dieser beiden Checks nötig sind. Reine
  Dokumentation darf schnell grün werden; normale Fachänderungen erhalten einen kleinen
  universellen Kernschutz plus Bereichstests; Browser läuft nur für UI oder direkt
  browserrelevante Änderungen; die große Standard-
  Offline-Suite und isolierte Datenbanknachweise laufen nur bei Kern-, Sicherheits-,
  Datenbank-, 500er-, CI-/Abhängigkeitsänderungen oder unklarer Zuordnung. Änderungen
  am Prüfplan selbst erzwingen die konservative Vollprüfung. Pfadgefilterte Workflows
  und Vercel-Checks nie als Required Check setzen.
- **Vercel Build-Auswahl:** `vercel.json` nutzt `scripts/vercel-ignore-build.js`.
  Nur eindeutig reine Dokumentation, Agentenregeln und reine Testdateien dürfen einen
  Build überspringen. Runtime, Konfiguration, Dependencies, GitHub-Workflows und jede
  unbekannte Datei erzwingen fail closed einen normalen Build. Fehlt
  `VERCEL_GIT_PREVIOUS_SHA` oder kann der Diff nicht sicher gelesen werden, wird gebaut.
- **CI auf `main`:** Der Push-Lauf bleibt als zusätzliche Absicherung bestehen, solange
  die klassische Branch-Protection mit dem verfügbaren GitHub-Zugang nicht lesend belegt
  werden kann. Durch den risikobasierten Prüfplan wiederholt er aber keine pauschale
  Vollsuite mehr bei eindeutig kleinen Änderungen.
- **Vier Testebenen:**
  - **Schnellkern (automatisch bei normalem Code):** kleine universelle Menge
    `FAST_CORE` in `scripts/run-offline-tests.js`; zentrale Mandanten-, Sicherheits-
    und Schnittstellenverträge ohne die lange 500er Vollmenge.
  - **Standard (nur konservativ):** die große explizite Kernmenge `STANDARD` läuft bei
    Datenbank-, 500er-, zentralen, CI-/Deployment- oder unklaren relevanten Änderungen.
  - **Bereich (automatisch):** Je nach tatsächlich geänderten Dateien laufen die
    Fach-Regressionstests der betroffenen Bereiche. Kanonische Zuordnung:
    `scripts/bereichsauswahl.js` (ausgewertet im CI-Schritt „Bereichs-Regression“ und über
    `--aendert`/`--bereich`). Eine fachlich relevante, nicht zuordenbare Datei wird
    **nicht** still übersprungen, sondern erzwingt die konservative Sammelmenge.
  - **Extended (bewusst):** die vollständige Regression über `--extended` bzw.
    `npm run test:offline:extended`.
  Eine neue Testdatei wird weder automatisch Schnellkern noch Standard. Wer sie dort braucht,
  trägt sie bewusst in `FAST_CORE` bzw. `STANDARD` ein. Bereiche gezielt:
  `--bereich <name>` oder `--extended --only <substring>`; Übersicht: `--bereiche`.

## 7 · Kontext und Dokumentation

Gezielte Suche vor Dateilektuere, grosse Dateien nur abschnittsweise. Bestehende
Zusammenfassungen/Belege nutzen und nur bei Luecken oder Widerspruch tiefer lesen.
Historie verlinken statt nacherzaehlen, keine zweite kanonische Zusammenfassung.
Veraltetes klar kennzeichnen; nur geaenderte Statuszeilen pflegen. Verifizierte
Ursachen und gescheiterte Wege fuer die Fortsetzung erhalten. Agenteneinsatz und
Kommunikation richten sich nach `AGENTS.md`.

## 8 · Sprintzustände (verbindlich)

| Zustand | Voraussetzung |
| --- | --- |
| Erfolgreich abgeschlossen | Kriterien erfuellt, erforderliche Pruefungen gruen, keine kritischen offenen Befunde, Status belegt |
| Teilweise abgeschlossen | Teil fertig, Abnahme/Review/Integration oder Wirkungsnachweis offen |
| Blockiert | Erforderliche Freigabe, Zugang, Entscheidung oder Abhaengigkeit fehlt |
| Gescheitert oder abgebrochen | Technisch erfolglos, verworfen oder nicht sicher abschliessbar |

Kein falscher Abschluss; blockierte/gescheiterte Arbeit bleibt dokumentiert mit
Versuch, Ergebnis/Luecken, Ursache, Pruefungen, Branch/Commit/PR, Wiederverwendbarkeit
und naechster erforderlicher Entscheidung.

## 9 · Definition of Done

Status, echte Pruefergebnisse, offene Blocker, naechsten Schritt und Branch-/Commit-/
PR-Stand dokumentieren. `docs/CURRENT_STATE.md` nur um den geaenderten relevanten Stand
nachziehen, auch bei Analyse/Blockade; keine Aktivitaetsberichte oder Vollhistorie.
Maximal **30.000 Zeichen / 350 Zeilen**, Datum je Aktualisierung; grosse Protokolle
in vorhandene Beleg-/Archivbereiche. Historische Primaerbelege nicht ersetzen.

Nach fachlich wirksamem Merge/Deployment Wirkung rein lesend pruefen und den belegten
Endstand nachtragen, spaetestens vor der naechsten fachlichen Phase und am Kettenende.
Ein alter Vor-Merge-Status reicht nicht. Ist die Korrektur blockiert, Status teilweise
oder blockiert nennen. Ein abschliessender reiner Dokumentations-PR ohne Code-,
Konfigurations- oder Datenaenderung erzeugt **keinen rekursiven Folge-PR**; sein Merge
und Deployment/Skip werden aus der Git-/Deployment-Historie belegt.

Architektur nur bei Architektur-, `START_HERE.md` nur bei Produkt-/Prinzipaenderung,
`CLAUDE.md` nur bei dauerhaften Regeln, OP-Liste nur bei belegter OP-Aenderung pflegen.
Fruehere Fassung mit allen historischen Verweisen bleibt
[im Git-Stand 8293a307](https://github.com/ernisch/helmut-pilot/blob/8293a307334d5eec5ccbbea5c07d5be5c68d9da7/CLAUDE.md)
erhalten; keine alten Nachweise oder Dokumente loeschen.
