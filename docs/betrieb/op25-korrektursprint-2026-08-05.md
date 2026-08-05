# OP-25 Korrektursprint K1–K8 (2026-08-05) — Belegdatei

**Sprint:** Umsetzung der in [`vorgangskontext.md`](vorgangskontext.md) §7.7.6 (kanonisch)
definierten Korrekturen K1–K8 nach dem gescheiterten Production-Nachweis 2026-08-04/05.
**Sprintzustand:** siehe §9 (Zusammenfassung). **Kein Production-Write, kein KI-Aufruf,
kein Deployment, kein Merge, kein neuer Production-Nachweis** — reine Repo-Arbeit.

Dieser Bericht ist die Belegdatei; der kompakte Zustand steht in
[`../CURRENT_STATE.md`](../CURRENT_STATE.md), die kanonische Ursachenanalyse in §7.7.6.

---

## 1 · Änderungsmatrix (Phase 1, verifiziert am Code vor der Umsetzung)

Alle acht Ursachenannahmen aus §7.7.6 wurden am aktuellen `main` (nach Merge PR #228,
`dbb86b4`) verifiziert; **keine** Zuordnung war durch spätere Änderungen überholt.

| K | Korrektur | Dateien | Risiko | Abnahmetest |
|---|---|---|---|---|
| K1 | Join `m.runId===laufkennung` → `m.globalLaufId===globalerLauf.runId`; Mehrdeutigkeit + fehlende Bindung fail closed | `lib/helmut/op25-nachweis.js`, Fixtures | gering | `op25-laufpaar-test.js` (echtes Scheduler-Paar) + Vertrag §38 + M70–M72 |
| K2 | CLI liest aktive Mandate relational über dieselbe Laufzeitfunktion; Widerspruch blockiert Start | `tenant-context.js`, `storage.js`, CLI, Kern | mittel | Vertrag §39 (relational 6 vs. Blob 5) + M73/M74 |
| K3 | Bedarf = (Regel+Watchdog)×(1+n)+Puffer, reale n, harte Blockade, benennende Meldung | Kern, CLI | gering | Vertrag §40 (Grenztests) + M24/M75/M76 |
| K4 | Bulk-Vormerkung (F-RT), reservierte Vormerk-/Abschlusszeit, Vormerkpfad für Lazy-Rest + übersprungene Stapel, Laufbilanz | `storage.js`, `understanding.js`, `scheduler.js`, Kern | größter Eingriff | E3-Suite 3b/3b2, Laufpaar §4/§5, Vertrag §43, M78–M82 |
| K5 | Kontext-Zusammensetzung persistiert; `2n+1` nur Aufgreifschwelle; unbelegt = Diagnosebedarf | `scheduler.js`, Kern, `storage.js` (Allowlist) | gering | Vertrag §18/19 + §41, M83/M84 |
| K6 | `.catch(() => null)` am Mandats-`saveCrawlRun` ersetzt; `failed:true` statt stillem Erfolg | `scheduler.js` | gering | Laufpaar §3, M85 |
| K7 | Watchdog prüft rein lesend, ob der regulär abzusichernde Erfolg existiert; Lesefehler fail closed ohne Trigger | `scripts/watchdog-pipeline-check.js` | gering | Watchdog-Suite Szenarien 5–13, M86/M87 |
| K8 | Abschlussreserve 10 s (statt 5 s) getrennt von der Verarbeitung; Versiegelungstoleranz 1 s im Vertrag | `scheduler.js`, Kern | gering | Vertrag §42 (+313 ms), Laufpaar 4.6/4.11, M77/M78 |

## 2 · Umsetzung je Korrektur

### K1 — Bindung der Mandatsläufe über `globalLaufId`
- Bewertungskern bindet Mandatsprojektionen **ausschließlich** über das persistierte
  `globalLaufId` (Produktion: `runId: "projektion-<ts>-<rand>"`, `globalLaufId` =
  Laufkennung des globalen Laufs). Keine unscharfe zeitliche Zuordnung.
- Fail closed: Mandatszeile im Fenster **ohne** `globalLaufId` ⇒ `mandatslauf-ohne-bindung`
  (blockiert); zwei Zeilen desselben Mandats am selben Lauf ⇒ `mandatslauf-mehrdeutig`.
- Fixtures des Vertragstests auf die echte Konvention umgestellt; **neue Suite
  `scripts/op25-laufpaar-test.js`** erzeugt das Laufpaar mit dem echten Scheduler
  (`runGlobaleErfassung` + `runMandatsProjektion`), persistiert es durch die echte
  Kompaktierung und bewertet es mit dem echten Kern.
- **Folgefund durch das echte Paar:** `compactCrawlRunForStore` strippte
  `matching`/`decisions` der Mandatszeilen — der Kern-Check `mandatslauf-unvollstaendig`
  wäre auch auf korrekt gebundenen echten Zeilen gefeuert. Behoben (strikte
  Zähler-Allowlist `compactShadowSummary`). Genau diese Fehlerklasse (Fixture ≠ echte
  Ablageform) hatte den ursprünglichen Falschbefund getragen.

### K2 — Eine Mandatswahrheit
- Gemeinsamer purer Baustein `tenant-context.relationalesProfilLebenszyklus` +
  `aktiveMandateAusRelationalenZeilen`; `storage.listFullProfilesFromDb` nutzt ihn für
  die Skip-Entscheidung, das CLI liest `profiles`+`mandate_profiles` per GET und filtert
  über **dieselbe Laufzeitfunktion** `tenantContext.listActiveTenantIds` (injizierter
  Leser — `storage.js` bleibt aus dem CLI-Prozess ausgeschlossen, Schreibschutz intakt).
- **Kein Blob-Rückfall:** relationaler Lesefehler ⇒ Nachweis blockiert verständlich.
- Startprüfung (`pruefeMandatsWahrheit`, Kern): Widerspruch Blob↔relational oder
  Laufzeitplanung (jüngster globaler Lauf, `quellenVereinigung.mandateIds`) ↔ relational
  ⇒ **Start blockiert** (`--startbaseline-schreiben` Exit 2, keine Datei); in der
  Auswertung als blockierender Befund. Der Blob kann die Menge nie mehr verkleinern —
  getestet mit dem realen Widerspruch (relational 6 / Blob 5, Vertrag §39.5).
- Verwaltungsweg für die spätere Deaktivierung: §6.

### K3 — Aufbewahrungsvertrag
- `aufbewahrungsBedarf`: **(Regel-Slots + Watchdog-Slots) × (1 global + n Mandate) +
  Puffer (1+n)**; n ist immer die reale Mandatszahl der Startbaseline. Watchdog-Kadenz
  wird aus `briefing-watchdog.yml` geparst (CLI); nicht ermittelbar ⇒ blockiert.
- Harte Blockade statt Warnung; Meldung nennt Istwert, Mindestwert, Mandatszahl,
  berücksichtigte Laufslots und die Betreiberaktion. Zusätzlich **Start-Gate**: das CLI
  verweigert das Schreiben der Startbaseline, wenn die Retention das kommende
  24-h-Fenster rechnerisch nicht trägt.
- Grenztests: exakt ausreichend (30), einer zu wenig (29), +Mandat (35), +Watchdog-Slot
  (36), Kadenz/Retention nicht belegt (Vertrag §40).

### K4 — E3 eingelöst: dauerhafte Vormerkung des gesamten Rückstands
- **Bulk-Pfad** `storage.savePendingKnowledgeObjectsBulk` (F-RT-Muster): KOs als
  Chunk-POST mit `resolution=ignore-duplicates` (idempotent, nie ein Downgrade eines
  fertigen Objekts — der P29-4-Schutz gilt ohne Vorab-Read), Dokumentverknüpfung
  gebündelt; ohne Verknüpfung zählt eine Vormerkung als **fehlgeschlagen** (B4).
- `understanding.runUnderstandingShadow`: Bulk-Vormerkung der zurückgestellten Cluster
  (serieller Pfad nur noch Rückfallebene); Speicherfehler werden **gezählt**
  (`vormerkFehlgeschlagen`), auch im seriellen Pfad (vorher stumm verloren).
- **Scheduler**: der Lazy-Rest wird eingesammelt (gebaute, nicht verarbeitete Cluster)
  und die Dokumente übersprungener Lazy-/Eager-Stapel werden in einer neuen
  **Vormerk-Abschlussphase** (Schritt 7b) geclustert und gebündelt vorgemerkt — beides
  hatte vorher **gar keinen** Vormerkpfad. Zeitvertrag: fachliche Schleifen enden bei
  `Budget − VORMERK_RESERVE (30 s) − ABSCHLUSS_RESERVE (10 s)`; die Reserven sind der
  fachlichen Arbeit entzogen.
- **Laufbilanz** (`datenstandDetail.vormerkung`): kandidaten = vorgemerkt +
  bereitsVorhanden + fehlgeschlagen + nichtVorgemerkt; Widerspruchskontrollen gegen die
  Lazy-/Stapel-Zählung im Vertrag (Vertrag §43). Ein regulär beendeter Lauf meldet bei
  verbleibendem Rückstand `nichtVorgemerkt = 0`; ein Speicherfehler ist nie Erfolg.
- `op25-e3-dauerhaftigkeit-test` Teil 3b **verschärft**: die verstrichene Deadline ist
  kein Sollverhalten mehr — der Vertrag wertet sie als `rueckstand-nicht-dauerhaft`;
  neuer Teil 3b2 (Regelfall: ein Bulk-Aufruf, null serielle Writes, Speicherfehler
  gezählt). Realistischer Test mit **1 250 echten Clustern** und knappem Budget
  (Laufpaar §4): Rückstand ≥ 1 213 vollständig vorgemerkt, ein Bulk-Aufruf,
  Versiegelung im Budget, Mandatsphase erreichbar.

### K5 — Erklärbare Kontextzahl
- Der Lauf persistiert die **Zusammensetzung** (`kontext.zusammensetzung`): statisch
  (Signatur = Sichtbarkeitsmenge einer geplanten Quelle), dokumentgetrieben
  (Mehrfachherkunft/DIP), unbekannt, statischMoeglich, dipDokumente, mehrfachHerkunft,
  Größen-Histogramm. Damit ist der reale Wert 15 (statisch 7 + dokumentgetrieben 8)
  aus dem Lauf selbst erklärbar (Vertrag §41.1).
- Vertrag: Zusammensetzung muss aufgehen und plausibel sein (sonst `nicht_bestanden`);
  geht sie auf, besteht die Zahl unabhängig von `2n+1`. **Ohne** belegbare
  Zusammensetzung und ohne dokumentierte Erklärung ist eine Zahl über der
  Aufgreifschwelle **Diagnosebedarf** (`kontextzahl-diagnosebedarf`, blockiert) — kein
  fachliches Fehlurteil mehr (Produktentscheidung 9). Kein Migrationsbedarf (Blob-Feld,
  Compact-Allowlist erweitert).

### K6 — Ehrliche Persistenzfehler der Mandatsprojektion
- `scheduler.js` (`runMandatsProjektion`): der stille `.catch(() => null)` ist ersetzt.
  Ein nicht gespeicherter Mandatslauf liefert `{ failed: true, persistenz:
  "fehlgeschlagen", grund: "mandatslauf-nicht-gespeichert" }` — die Fairnessschicht
  zählt ihn als fehlgeschlagen (`ergebnisFehlgeschlagen`), nie als Erfolg. Kein Throw,
  keine Wiederholung im selben Lauf (keine doppelte Produktwirkung); Pipeline-Fehler
  wird protokolliert; ins Ergebnis geht nur der stabile Grund (kein Fehlertext, keine
  Geheimnisse — getestet, Laufpaar §3).

### K7 — Bedingter Watchdog
- Zweck/Aufrufkette geprüft: `briefing-watchdog.yml` (GitHub Actions, täglich 05:30 UTC,
  regelmäßig 2–3 h verzögert) → `scripts/watchdog-pipeline-check.js` → POST
  `/api/cron/pipeline`. Bisher **bedingungslos** — der vierte schwere Regel-Slot.
- Neu: **Vorprüfung** rein lesend über `/api/cron/pipeline-status` gegen den jüngsten
  Regel-Slot aus `vercel.json` (Slots identisch gerechnet wie im Nachweisvertrag):
  gültiger Erfolg vorhanden ⇒ Exit 0 **ohne** Ersatzlauf; fehlt/veraltet/unbrauchbar ⇒
  Ersatzlauf (bisheriges Verhalten); **Lesefehler ⇒ fail closed, kein blinder schwerer
  Lauf**, Exit 1 mit ehrlicher Meldung. Entscheidung wird protokolliert.
  `WATCHDOG_FORCE_RUN=1` (manueller `workflow_dispatch`) überspringt die Vorprüfung.
- Der äußere Zeitplan ist **unverändert** (kein Eingriff in die YAML-Kadenz).

### K8 — Abschlussreserve und Versiegelungstoleranz
- Scheduler: `ABSCHLUSS_RESERVE_MS = 10 000` (vorher 5 000, implizit) — Vormerk-Deadline
  und fachliche Grenze liegen davor; die Abschlussschreiben (~5,3 s beobachtet) passen in
  die Reserve.
- Vertrag: `VERSIEGELUNGS_TOLERANZ_MS = 1 000` — versiegelte Dauer bis Budget + 1 s ist
  ein **benanntes Messartefakt** (Warnung), darüber bewiesene Verletzung. Der bekannte
  Wert **+313 ms** wird damit korrekt eingeordnet (Vertrag §42.1); der strukturelle
  Fall +267 s bleibt rot (§42.5). Begründung der Höhe: dreifache beobachtete
  Restvarianz eines Abschlussschreibens, Größenordnungen unter jedem echten Überzug.

## 2a · Adversariale Review-Runde (Sprint-intern, vor dem PR)

Der Diff wurde vor dem PR mit vier unabhängigen Blickwinkeln adversarial geprüft
(Kern-Vertrag, Scheduler-Laufzeit, Storage/CLI-Schreibschutz, Test-Ehrlichkeit) und die
Befunde verifiziert. Eingearbeitet:

1. **Dedup-Semantik der Vormerkbilanz:** die erste Fassung forderte `kandidaten ≥
   lazyRestCluster` und verglich deduplizierte mit rohen Dokumentzählungen — ehrliche
   Läufe mit vorgangId-/Dokument-Deduplizierung wären blockiert worden. Jetzt: gemessene
   Abdeckung `lazyRestKandidaten` und die **rohe** Gleichung `uebersprungeneDokumenteRoh
   = lazy + eager` (Gleiches mit Gleichem); Dedup ist ausdrücklich kein Vertragsbruch
   (Vertrag 43.7b/43.8b).
2. **Deadline vor der Rechenarbeit:** die Abschlussphase clustert übersprungene
   Dokumente erst NACH dem Deadline-Check (vorher bis ~16 s CPU in bereits überzogenen
   Läufen, Ergebnis verworfen); zusätzlich gilt die Deadline **zwischen den Bulk-Chunks**
   (degradierte DB kann die Reserve nicht mehr überziehen; Rest = `nichtVersucht`,
   ehrlich gezählt).
3. **K7-Lücke:** ein frischer Lauf mit **fatalem Fehlerschritt** (keine Mandatsprojektion)
   täuschte der Vorprüfung einen brauchbaren Erfolg vor — `pipeline-status` liefert jetzt
   additiv `fatalerFehlerschritt`, der Watchdog wertet ihn als `unbrauchbar`
   (Ersatzlauf startet); ältere Deployments ohne das Feld behalten das bisherige Verhalten.
4. **Plausibilitätsriegel K5:** `kontexte > dokumente` ist als Partition unmöglich ⇒
   `nicht_bestanden`; die Selbstauskunft der Zusammensetzung bleibt darüber hinaus eine
   dokumentierte Grenze des Vertrags (Kosten je Kontext deckelt weiterhin das LLM-Budget).
5. **Ehrliche Zähler:** `process_runs.vorgemerkt` zählt nur noch NEUE dauerhafte
   Vormerkungen (keine Doppelzählung über `bereitsVorhanden`); unmögliche Zählungen
   (übersprungene Stapel ohne Dokumente) blockieren.

## 3 · Testergebnisse (echte Zahlen, offline)

| Suite | Ergebnis |
|---|---|
| `op25-nachweis-vertrag-test.js` | **268/268** (vorher 222; §18/19 neu, §38–§43 inkl. Review-Gegenproben) |
| `op25-e3-dauerhaftigkeit-test.js` | **55/55** (3b verschärft, 3b2 neu) |
| `op25-laufpaar-test.js` (neu) | **29/29** (echtes Scheduler-Paar, 1 250 echte Cluster) |
| `watchdog-pipeline-check-test.js` | **25/25** (Szenarien 5–13 + fataler Fehlerschritt) |
| `op25-nachweis-mutationsprobe.js` | **87 von 87 rot** (M70–M87 neu; M24 nachgeführt) |
| Kanonische Offline-Suite (`run-offline-tests.js`) | siehe CURRENT_STATE/PR (Lauf am Sprintende) |

Vorbestehend (Baseline-belegt, **nicht** durch diesen Sprint): `tenant-neutrality-test.js`
FAIL „Teardown des eigenen Test-Mandanten" — identischer FAIL auf unverändertem
`main`-Stand (per `git stash`-Gegenprobe am 2026-08-05 verifiziert).

## 4 · Verhaltensänderungen der Verträge (bewusst, keine stille Lockerung)

1. `auffaellige-kontextzahl-ohne-erklaerung` (nicht_bestanden) → `kontextzahl-diagnosebedarf`
   (**blockiert**): eine unerklärte Zahl ist Diagnosebedarf, kein bewiesener fachlicher
   Fehler (Produktentscheidung 9). Mit dokumentierter Erklärung unverändert Warnung.
2. Aufbewahrung: Warnzone ersetzt durch harte Blockade unterhalb des Mindestbedarfs
   (der jetzt Watchdog-Slots + Puffer enthält) — **Verschärfung**.
3. Budgetprüfung: Toleranz +1 s für Messartefakte — die einzige Weichstellung, klein,
   dokumentiert, testgesichert gegen stilles Aufblähen (M77); +313 ms wird Warnung.
4. E3: Läufe mit `datenstandDetail.vormerkung` werden über die Gesamtbilanz bewertet
   (Lazy-Rest kann jetzt bestehen); Alt-Läufe ohne Bilanz fallen wie bisher durch.
5. `process_runs.reason` (`globalphase`): `nv=` zählt jetzt die **gesamte** Vormerklücke
   (Verstehens- + Abschlussphase inkl. Speicherfehler), neu `vk=` (Kandidaten).

## 5 · Empfohlener Production-Wert Aufbewahrung (Abschlussbericht Punkt 12)

Bei den derzeit geplanten **fünf aktiven Mandaten**: Mindestbedarf =
(3 Regel-Slots + 1 Watchdog-Slot) × (1+5) + Puffer 6 = **30**. Empfehlung:
**`HELMUT_CRAWL_RUN_RETENTION=36`** (erst ab 36 entfällt auch die Knapp-Warnung; ein
sechstes Mandat bräuchte 35). Speicherbedarf: `main`-Blob heute ~1,3 MB bei Retention 20;
grobe Schätzung bei 36 ≈ **2 MB** (linear über den Laufdatensatz-Anteil, Schätzwert wie
§7.7.6). Setzen der Variable ist eine **freigabepflichtige Betreiberaktion** (Vercel-Env
+ Redeploy) und war ausdrücklich nicht Teil dieses Sprints.

## 6 · Relationale Deaktivierung von `max-mustermann` (Abschlussbericht Punkt 13)

**Nicht ausgeführt** (verbindliche Grenze). `max-mustermann` wurde **nicht gelöscht**
und wird niemals gelöscht (Produktentscheidung 5).

Geprüfter vorhandener Verwaltungsweg: `node scripts/provision-tenant.js --deactivate
max-mustermann` → `provisioning.deactivateTenant` → `storage.saveProfile(profileActive:
false)`. **Befund:** dieser Weg **verweigert** für `max-mustermann` (Bestandsschutz
`isProtectedTenant`: nicht durch das Werkzeug provisioniert ⇒ geschützt), und
`saveProfile` schreibt relational nur bei aktivem `HELMUT_PROFILE_DB_MODE` — exakt die
Lücke, durch die die Deaktivierung vom 04.08. nur im Blob landete. Ein sicherer,
auditierter **vorhandener** Weg für den relationalen Toggle existiert damit nicht; es
wird **kein verdeckter Bypass** gebaut. Kleinste sichere Betreiberaktion (freigabepflichtige
Production-Datenänderung):

1. **Vorprüfung** (lesend): `select id, aktiv, updated_at from mandate_profiles where id
   = 'max-mustermann';` — erwartet `aktiv = true` (Stand seit 20.07.).
2. **Write** (genau eine Zeile, kein Delete):
   `update mandate_profiles set aktiv = false, updated_at = now() where id = 'max-mustermann';`
3. **Auditnachweis:** Ausführung mit Zeitstempel/Ausführendem in
   `docs/betrieb/production_beweisprotokoll.md` protokollieren (die auditierte
   Admin-Route schreibt diesen Pfad heute nicht; der manuelle Protokolleintrag ist der
   Auditersatz — genau deshalb dokumentiert statt still).
4. **Nachprüfung** (lesend): Vorprüfungs-Select erneut (`aktiv = false`); danach
   `node scripts/op25-production-nachweis.js --baseline` — `mandate.aktiv` muss die
   5er-Menge mit Signatur `m5-…` zeigen; der nächste reguläre Lauf muss
   `quellenVereinigung.mandateIds` ohne `max-mustermann` tragen.
5. **Rückweg** (trivial): dasselbe Update mit `aktiv = true`.

## 7 · Betreiberaktionen nach einem späteren Merge (Punkt 18) und nächster Nachweis (Punkt 19)

Reihenfolge (alle freigabepflichtig, keine davon durch diesen Sprint ausgeführt):

1. `max-mustermann` relational deaktivieren (§6) — sonst blockiert die
   K2-Startprüfung den Nachweis (relational 6 ≠ Blob 5).
2. `HELMUT_CRAWL_RUN_RETENTION=36` setzen (§5) — sonst blockiert das K3-Start-Gate
   (Ist 20 < Mindest 30).
3. Regulären Ablauf nach §7.7.5 starten: Flag `HELMUT_CRON_GLOBALABRUF=on` + **neues**
   Deployment, Aktivierung = READY, Startbaseline binnen 15 min mit vollem
   `--erwarteter-commit`, 24 h ohne weiteres Deployment, Auswertung unmittelbar danach.

**Frühester sicherer Zeitpunkt:** nach Merge + Schritte 1–2 + READY-Deployment; das
Fenster braucht 24 vollständig vergangene Stunden ohne Deployment und ohne
Mandatsänderung. **Kriterien:** die neuen Abnahmekriterien aus §7.7.6 (Signatur-
Assertion, harter Aufbewahrungsvertrag inkl. Watchdog, echtes Laufpaar im Vertragstest,
E3 `nichtVorgemerkt = 0`, Versiegelungstoleranz vorab festgelegt) sind jetzt Code.

## 8 · Nicht verändert (verbindliche Grenzen, bestätigt)

Kein Production-Write, keine Production-Variable, keine Migration (keine erforderlich —
alle neuen Felder sind Blob-/Bestandstabellen-additiv), kein Deployment, kein Merge,
kein Production-Lauf, kein neuer Nachweis, `HELMUT_CRON_GLOBALABRUF` unberührt (`off`
laut Betreiber), Bundestagsquellen unberührt, Budgets/äußere Cron-Zeitpläne unverändert
(Watchdog-YAML-Kadenz unangetastet), Berlin/Brandenburg/M8 deaktiviert, kein Mandat
aktiviert/gelöscht, keine neue externe Abhängigkeit, PRs #224/#225/#218/#216 unberührt.
0 KI-Aufrufe in allen Läufen dieses Sprints.

## 9 · Zustand je Korrektur und Risiken

| K | Zustand | Rückweg |
|---|---|---|
| K1 | umgesetzt, grün (Kern + Fixtures + echtes Paar + M70–M72) | Revert des Kern-/Test-Commits |
| K2 | Code umgesetzt, grün; **Production-Teil offen** (Deaktivierung §6 = Betreiber) | CLI-seitig Revert; kein Laufzeitpfad verändert außer geteilter Projektion (verhaltensgleich, testbelegt) |
| K3 | umgesetzt, grün; **Production-Wert offen** (§5 = Betreiber) | Revert; alte Formel wäre wieder blind (nicht empfohlen) |
| K4 | umgesetzt, grün (größter Eingriff; Bulk idempotent, Bilanz testgesichert) | `HELMUT_CRAWL_VORMERK_RESERVE_MS`/`HELMUT_CRAWL_ABSCHLUSS_RESERVE_MS` justierbar ohne Deployment-Rückbau; voller Revert des Scheduler-Commits |
| K5 | umgesetzt, grün | Revert; Alt-Läufe ohne Zusammensetzung bleiben bewertbar (Diagnosebedarf) |
| K6 | umgesetzt, grün | Revert (eine Stelle) |
| K7 | umgesetzt, grün; Backstop bleibt (bedingt), `WATCHDOG_FORCE_RUN=1` als Betreiber-Übersteuerung | Revert des Skripts; YAML unverändert |
| K8 | umgesetzt, grün | Reserve per Env justierbar; Toleranz nur per Code (bewusst, M77) |

Offene technische Risiken: (a) die Bulk-Vormerkung ist in Production noch nicht
gelaufen — erster echter Lauf nach Merge beobachten (`[globalphase] vormerk-abschluss`-
Zeile, `vk=`/`nv=` in `process_runs.reason`); (b) die Watchdog-Vorprüfung hängt am
Statuspfad des deployten Stands — bei 404 fail closed (E-Mail an Betreiber statt
Ersatzlauf), bewusste Entscheidung; (c) der dokumentierte Widerspruch „Laufzeit liest
relational, `HELMUT_PROFILE_DB_MODE` laut Env-Inventar nicht gesetzt" bleibt eine
offene Betreiberprüfung (CURRENT_STATE §5) — für K2 ist er ohne Belang, weil die
kanonische Quelle relational feststeht und das CLI sie direkt liest.
