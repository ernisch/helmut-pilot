# 500 Mandate — theoretische Bereitschaft (Beleg, 2026-09-01)

**Sprint:** 500-Mandate-Reifesprint (Nachtauftrag 31.08./01.09.) · Branch
`claude/helmut-500-mandate-readiness-6hxden` (lokal, ungepusht auftragsgemäß).
**Production wurde ausschließlich rein lesend geprüft** — kein Merge, kein Deployment,
keine Migration, keine Daten-/Env-/Flag-/Cron-Änderung, kein Modellaufruf, keine
Provisionierung, kein Lasttest. Das Gate bleibt `shadow`.

Dieser Beleg trennt **drei Nachweise strikt** — sie dürfen nie vermischt werden.

---

## 1 · Aufnahmefähigkeit der Warteschlange — **ERBRACHT** (nicht wiederholt)

Bereits am 28.08. erbracht (isoliertes Supabase-Testprojekt, GitHub-Actions-Lauf
`33158170030`, Beleg `z3b-supabase-testplan-2026-08-27.md`): **500 synthetische
Aufträge eingereiht, 500 reserviert, 500 abgeschlossen**; **1.040 von 1.040
HTTP-Anfragen** mit Status 200; Latenz p50/p95/p99/max 127/382/440/1.266 ms;
Gleichzeitigkeitsspitze 32; **0** Zeitüberschreitungen, Netzwerkfehler,
Drosselungen, Lease-Verluste; Dauer **7.818 ms**; jedes der 500 synthetischen
Mandate genau einmal vertreten. **Dieser Lasttest wurde auftragsgemäß NICHT
wiederholt.** Er beweist den Plattform-/Warteschlangenweg — nicht den Fachweg
und nicht den Betrieb.

## 2 · Rechnerische und architektonische Tragfähigkeit — **BEREIT** (lokal, theoretisch)

Urteil nach den 20 Abschlusskriterien des Auftrags: **BEREIT** — alle lokal
prüfbaren Kriterien sind erfüllt (Detailtabelle §10; Testnachweise §9;
Diffumfang §11). „Bereit" heißt hier ausschließlich: Code, Konfiguration,
Kapazitätsmodell, Sicherheitsmechanismen, Tests und Dokumentation passen
zusammen. Es heißt NICHT, dass der Betrieb bewiesen wäre (§3).

## 3 · Echter operativer Betrieb mit 500 Mandaten — **NICHT BEWIESEN**

Ein mehrtägiger realer Betriebsnachweis liegt **nicht** vor und kann durch
Offline-Tests oder Berechnungen **nicht ersetzt** werden. Es fehlen weiterhin:
der Siebentagenachweis der jeweiligen Vorstufe (Stufentore 5→10→…→500,
`z3b-aktivierungsplan-2026-08-27.md`), echte Azure-Messwerte (3er-Vorprobe +
21er-Stichprobe), der echte Google-Sonderweg unter Drosselung (OP-15),
Import-/Aktivierungsfreigaben je Stufe, der gesetzte Zieldeckel, Speicher-/
Tarif-/Aufbewahrungsentscheidungen (OP-01, R5) und neue 200er-/500er-
Fachwegmessungen. Production läuft heute mit **5 aktiven Mandaten**.

---

## 4 · Natürlicher Lauf 31.08. (rein lesend geprüft)

Zeiten: **01.09. 00:30 türkischer Zeit · 31.08. 23:30 Berlin · 31.08. 21:30 UTC.**

| Prüfpunkt | Befund |
|---|---|
| Status/Laufzeit | `success` · 216,5 s · Commit `72d9ec5` (= aktueller `main`) |
| Zähler (ehrlich, PR #283 live) | cluster 50 · verarbeitet 6 · vertagt 44 (davon 23× `skipped-budget`) · 0 fehlgeschlagen · Identität 6+0+0+44 = 50 ✓ |
| Aufrufe | 6 echte Modellaufrufe; letzte Budget-Buchung 21:30:59 — Tagesdeckel **100/100 erreicht** |
| Neue `unbekannt` | **0** (Bestand unverändert 3: 30.08. 20:02 · 30.08. 21:30 · 31.08. 04:03) |
| Leases | 0 aktive, 0 abgelaufene (CAS und helmut_jobs) |
| Gate | `shadow` (Flags + Wirkung: 0 `gate-geparkt`-Zeilen, 0 Parkungs-Belegmarken) |
| Rückstand | 9.211 pending (9.062 > 24 h) nach dem Lauf; Tagesbilanz 31.08.: 193 neue Vorgänge gegen 87 Abschlüsse ⇒ **weiter wachsend** |
| Bekannte Messfehler | betreffen den Gesundheitsbericht (Blocker 3+4, in diesem Sprint korrigiert, ungemergt), nicht die Laufquittung |

**Dieser Lauf ist keine Freigabegrundlage für einen Gate-Wechsel** — die
Messfehler-Korrekturen (Blocker 1–5) sind lokal, ungemergt und in Production
unbewiesen.

## 5 · Die fünf bestätigten Blocker — korrigiert (Commit `0381065`)

1. **Verknüpfungsfehler beim Parken:** `gate-geparkt` wird nur noch gesetzt,
   wenn ALLE Dokumentverknüpfungen belegt persistiert sind
   (`verknuepfeFailClosed`: saveSources-Fehler/Teilpersistenz/fehlende
   Kennungen ⇒ keine Parkung, normale Verarbeitung — auch im idempotenten
   bereits-geparkt-Pfad). Positiv- und Negativverträge: `gate-parken-persistenz-test.js` §5–§9.
2. **Falsches `ok:true`:** `markUnderstandingGateGeparkt` verlangt
   `return=representation`; Erfolg nur bei **genau einer** Zeile mit erwarteter
   Kennung im Zielzustand. 0 Zeilen (`kein-treffer-vorzustand-veraendert`) und
   >1 Zeilen (`mehrfachtreffer:n`) sind Fehlschläge. Getestet 0/1/mehrere (§1–§4).
3. **Ehrliche Drain-Bilanz:** gate-würdige Ankunft wird nur noch mit dem
   **echten gate-würdigen Abfluss** verglichen (Abschlüsse → `ko_document_links`
   → persistierte Gate-Entscheidungen; `unbewertet` getrennt ausgewiesen, nie
   als würdig behauptet — Production-Probe 31.08.: 62 von 87 Abschlüssen
   belegbar würdig). Rückstandstrend mit **Anfangswert/Endwert/Trend** über
   CAS-gesicherte Tages-Schnappschüsse (F-CAS-Muster, eigene
   `helmut_store`-Zeile, erster Tageswert gewinnt, selbstverankernd: ohne
   Vortagswert ehrlich `unvollständig`). **Kein ✓ bei wachsendem Rückstand
   oder Messlücke** — getestet wachsend/gleichbleibend/sinkend
   (`verstehen-drain-bilanz-test.js` §1–§2, 41 PASS).
4. **PostgREST-Grenze:** Ereignis- und Abschluss-Lesen laufen begrenzt und
   deterministisch paginiert (Totalordnung `created_at`/`updated_at` + `id`);
   die alte `limit=10000`-Abfrage (still bei 1.000 gekappt) ist ersetzt.
   Gerissener Deckel ⇒ **null** (nicht messbar, laut gemeldet), nie eine zu
   kleine Zahl. Getestet mit 2.400 Ereignissen über 3 Seiten (§4).
5. **Dedup-Pagination:** `created_at.desc,id.desc` (Totalordnung). Adversarialer
   PostgREST-Ersatz (rotierende Gleichstandsreihenfolge) beweist: die alte
   Ordnung verlor/doppelte Zeilen, die neue liest eine 1.500er-
   Gleichstandsgruppe über Seitengrenzen exakt einmal
   (`dedup-bestandsfenster-test.js` §7, 24 PASS).

## 6 · Landes-E2E-Determinismus (F-E2E geschlossen; Commit `3950226`)

Ursache belegt (nicht gelockert, sondern behoben): der **Audit-Publish-Pfad**
des Testgerüsts stempelte `created_at` je Zeile (der 2026-08-08-Fix traf nur
den Non-Audit-Pfad), und `listMatchingResults` hatte bei Stapel-Gleichstand
**keine definierte Reihenfolge** — rein lesend belegt: **24 Gleichstandsgruppen
in den aktuellen Production-Zeilen**, der Fehler konnte also echte Ergebnisse
beeinflussen. Korrektur: Totalordnung `created_at.desc,rank.asc.nullslast,id.asc`
— die Zweitsortierung ist der **vom Matcher berechnete Rang** (nachvollziehbar,
mandatsneutral, fachlich richtig; der 2026-08-08 verworfene willkürliche
`id.desc`-Versuch bleibt verworfen) — plus Stapelzeitstempel im Gerüst
(Postgres-Treue). **Nachweis: `berlin-e2e` 20/20 und `brandenburg-e2e` 20/20
grün unter 4-facher CPU-Fremdlast** (zuvor 1 Fehlschlag je 25 Läufe).

## 7 · Minimal-Cron-Architektur — lokal fertig vorbereitet (Commit `e11b0ee`)

Zielarchitektur unverändert verbindlich: vorhandener Motor · kein SQS ·
Parallelität 1 · minimale Komplexität · **`18,48 * * * *` = 48 tägliche Slots**
der bestehenden Rückstandsroute (ersetzt bei Aktivierung die zwei heutigen
Slots 11:30/17:30 ⇒ netto **+46 Invocations/Tag**, Vollast ≤ 3,2
Funktionsstunden) · **keine Cron-Änderung in Production** (Rekonstruktion aus
Doku; `672886c` existiert nicht).

- `lib/helmut/minimal-cron.js`: strenger Rhythmus-Parser (exakt 48 Slots),
  Kollisionsfreiheit (kleinster Abstand 3 min zum 05:45-Slot), Kapazität
  48 × min(20; 19) = **912 Aufrufe/Tag**, Laufzeitvertrag, sechs fail-closed
  dokumentierte Aktivierungsschritte (inkl. Nachführung von SLOT_PLAN und den
  acht pinnenden Cron-Vertragssuiten **im selben Commit** wie die
  vercel.json-Änderung). Kein Flag, keine Env-Weiche, kein Aktivierungspfad.
- **Vorab-Bodenprüfung** (`verstehen-rueckstand.js` + Route): ein budgetloser
  Lauf endet vor jeder Lesearbeit mit ehrlicher `blocked`-Quittung statt
  ~225 s zu verbrennen (belegt am Naturlauf 31.08. 17:30) — Voraussetzung des
  48er-Takts. Fail closed, `Number(null)`-Falle behandelt.
- **Cron-Vertragsbeleg:** `vercel.json` byte-unverändert (13 Einträge),
  SLOT_PLAN unverändert; alle acht pinnenden Vertragssuiten grün (§9).

## 8 · Tageskapazität für 500 Mandate (Commit `12357e6`; ausführbar: `lib/helmut/kapazitaet-500.js`)

**Nachrechnung der dokumentierten ~455:** Die Zahl entsteht im Modell als
**Erwartungswert des Verstehens-Bedarfs (456)** — bestätigt, aber als
Planungsgrundlage unvollständig: Sie unterstellte quellenkonstante Last. Rein
lesend gemessen erzeugen die **profilgetriebenen Quellen schon bei 5 Mandaten
~51 Vorgänge/Tag** (1.716 Rohdokumente/30 T aus `<slug>-news*`), und die
Personensuche ist heute krank (0,03/Mandat/Tag — OP-15-Versorgungsausfall),
nicht klein. Eingaben, ausdrücklich berücksichtigt: geteilter Katalog
(konstant — ein Vorgang wird genau einmal verstanden), Personensuchen,
echter gate-würdiger Eingang (0,68 der bewerteten Vorgänge), Rückstandsabbau,
Wiederholungs-/Fehlerreserve (1,09 × 1,10), Budgetreserve, **„zurückstellen"
kostet einen vollen Aufruf — nur echtes Parken spart**.

| Szenario (500 Mandate, Aufrufe/Tag) | Verstehen | mandatsgebunden | Abbau | gesamt | erforderl. Deckel |
|---|---:|---:|---:|---:|---:|
| Erwartung | 456 | 600 | 53 | **1.119** | 1.492 |
| **Konservativ (Dimensionierung)** | 702 | 1.000 | 100 | **1.812** | **2.416** |
| Stress (Warnschwellen, nicht Deckel) | 989 | 1.500 | 133 | **2.632** | (3.510) |

- **Zieldeckel (kleinster belegbar ausreichender): 2.416** = konservativer
  Bedarf ÷ 0,75 (25 % Reserve) ≥ Fairness-Untergrenze 2n−1 = 999.
  **Erforderliche Verstehens-Reserve: 702** (im Deckel, nie addiert).
- **48-Slot-Kapazität: 984 Verstehens-Aufrufe/Tag** (912 Rückstands-Takt + 38
  Frisch + 29 Queue + 5 Lage). Konservative Slotlast 802 ≤ 984 ✓; Erwartung
  509 (Puffer > 30 %) ✓; **Stress 1.122 > 984 — ehrlich nicht slot-gedeckt**
  (Stresstage bauen über Folgetage ab; dafür existiert die Rückstandsschleife).
- **Erwartete Laufzeit je Slot:** voll ~223 s (gemessen), Deadline 280 s;
  budgetlos mit Vorab-Bodenprüfung Sekunden statt ~225 s.
- **Warnschwellen W1–W5** (Deckelnähe 85 %/2 T · Drain-⚠ 3 T · Slotgrenze
  Ø ≥ 17/Slot · Fehlversuchsquote ≥ 20 % · Wartezeit > 24 h wachsend 3 T) —
  quellengebunden (Budgetzähler, Drain-Zeile, Quittungen, Trend).
- **Rechenprobe:** heutiger gate-treuer Bedarf (5 Mandate, inkl.
  zurückstellen) ≈ 251/Tag > Abfluss 68–87 — konsistent mit dem belegten
  Verhungern. **Der Production-Deckel (100/30) wurde nicht verändert.**

## 9 · Testkohorte 495 (Commit `8e6f0a3`) und Testnachweise

**Kohorte:** 5 reale + 495 synthetische = 500; Gruppen **20/75/400**
(Stufen A/B/C). Rekonstruiert (`be5bd15` existiert nicht) aus
`provisioning.validateSpec` + Determinismus-Vorbild des 1000er-Fixtures.
Eigene Kennungsfamilie `test-kohorte-<gruppe>-<nnn>` (kollisionsfrei zu realen
Slugs, `test-mdb-*`, `synth-mandat-*`, `stapel-*`), neutrale Namen/Parteien/
Themen, `.invalid`-E-Mails, **Passwörter nur zur Laufzeit** (crypto, nie im
deterministischen Bestand), **kein Aktivierungswunschfeld**, kein Anlagepfad im
Modul. **Alle 495 offline gültig (validateSpec: 0 Fehler), byte-identisch
wiederholbar, alle 495 Profile inaktiv; Größe gemessen: 196.275 Bytes gesamt,
größtes Profil 412 Bytes.** Nichts provisioniert, nichts aktiviert.

**Gezielte Suiten (alle über `scripts/lokal.js`):** gate-parken-persistenz
**30/0** (neu) · verstehen-drain-bilanz **47/0** (neu gefasst, inkl. Review-Fixes) ·
dedup-bestandsfenster **24/0** · minimal-cron **29/0** (neu) · kapazitaet-500
**26/0** (neu) · test-kohorte-500 **27/0** (neu) · verstehen-rueckstand 61/0 ·
understanding-gate-arm grün · understanding-gate-integration grün · lauf-bilanz
149/0 · motor-health 65/0 · health-report-route 49/0 · vorgangs-lebenszyklus
81/81 · understanding-konkurrenz 14/0 · lage 138 · op25-e3 55/0 · pilot-e2e
96/0 · matching-audit 178/0 · matching-aktualitaet 29/0 · matching-erklaerung
67/0 · relevanzordnung 47/0 · scoring 73/0 · env-inventar 38/0 ·
provision-stapel 117/0 · profil-inventar-200 grün · **berlin-e2e 20/20 und
brandenburg-e2e 20/20 unter 4-facher CPU-Fremdlast** · alle acht pinnenden
Cron-Vertragssuiten exit 0. **Offline-Gesamtlauf: siehe §12.**

## 10 · Die 17 technischen Voraussetzungen (Kurzbeleg)

| # | Voraussetzung | Beleg |
|---|---|---|
| 1 | Profil-Blob-Größe | Kohorte 196 KB/495 (§9); `HELMUT_PROFILE_DB_MODE` wirkt laufzeitbelegt (CURRENT_STATE §5) — kein Doppelwachstum im Monolithen; Größenprüfung testgesichert |
| 2 | Speicherwachstum | 2,70 MB/Tag gegen 500-MB-Free-Grenze dokumentiert; R5/OP-01 bleiben Betreiberentscheidungen (§3) |
| 3 | Pagination | Blocker 4+5 (§5); alle neuen Lesen begrenzt + total geordnet |
| 4 | Fairness zwischen Mandaten | K1-Untergrenze 2n−1 = 999 im Zieldeckel (§8); Cron-Fairness-Suiten grün |
| 5 | Budgetfairness | nicht priorisierte Buchung am atomaren Choke-Point (Rückstands-CallType); `HELMUT_TENANT_LLM_CAP` bleibt aus (OP-03, Betreiberhebel — ehrlich offen) |
| 6 | Rückstandsalter | älteste-zuerst-Auswahl + Drain-Trend + W5 (§5, §8) |
| 7 | Lease-Sicherheit | Production 31.08.: 0 aktive/abgelaufene Leases; Suiten grün |
| 8 | Fencing | CAS-/Fencing-Suiten grün (verstehen-vertrag, konkurrenz 14/0) |
| 9 | Idempotenz | Parken idempotent ohne Doppel-Writes (§5.1); Anlage-Stapel idempotent (117/0) |
| 10 | Wiederaufnahme nach Fehlern | verstehen-wiederaufnahme/aufgeben-Suiten grün; Parkfehler ⇒ normale Verarbeitung, nie Verlust |
| 11 | Gesundheitsbericht | Drain-Zeile ehrlich (§5 Blocker 3); motor-health/health-report grün |
| 12 | Warnschwellen | W1–W5 vertraglich (§8) |
| 13 | Mandantentrennung | assertTenant/user_id-Filter unangetastet (matching-audit 178/0); neue Messgrößen sind ausdrücklich global/mandantenneutral |
| 14 | Keine hartkodierten Mandate | Diff-Prüfung: reale Kennungen nur als Negativliste im Kohorten-Test (Kollisionsausschluss) |
| 15 | Keine stillen Erfolge | Blocker 1+2 (§5); Vorab-Boden quittiert `blocked`; Schnappschuss-Fehler laut |
| 16 | Keine ungebundenen Abfragen | jede neue Abfrage trägt limit + Totalordnung; Deckel ⇒ null |
| 17 | Kein Satz ohne Rechenbeleg | Kapazitätsmodell ausführbar + testgesichert (26/0); Messwerte mit Herkunft |

Zusätzlich lief ein **adversarialer Review-Workflow** über den gesamten Diff
(6 Dimensionen, je Befund zwei unabhängige Gegenprüfer); Ergebnis: §12.

## 11 · Production unberührt — Beleg

Rein lesend bestätigt (31.08./01.09.): `main` = `72d9ec5` (unverändert; der
21:30-Naturlauf trägt exakt diesen Commit) · 5 aktive / 4 inaktive Mandate ·
0 `gate-geparkt` · Gate `shadow` · Crons unverändert (13 Einträge, kein
`18,48`-Eintrag) · Deckel-Zähler unangetastet (nur SELECT-Aggregate) · keine
Migration im Diff (`supabase/migrations/` unberührt) · kein Push, kein PR,
kein Merge, kein Deploy, keine Provisionierung, kein Modellaufruf, kein
Lasttest. Der Supabase-Zugriff dieser Sitzung war ausschließlich `SELECT`.

## 12 · Abschlussprüfungen dieses Sprints

- **Adversariales Diff-Review (18 Agenten: 6 Dimensionen, je Befund 2 unabhängige
  Gegenprüfer, ~2,1 M Token):** 6 Befunde, **4 von beiden Gegenprüfern bestätigt
  und alle 4 behoben** (Commit `5d34a86`): (1) Abfluss zählte updated_at-
  Berührungen statt Erstabschlüsse → `ko_version=eq.1`-Filter (Production-Probe:
  76 Erstabschlüsse vs. 11 Update-Berührungen/24 h; Restverzerrungen zeigen
  dokumentiert nach Rot, nie nach Grün); (2) `vorabBoden`-Telemetrie wurde von
  der Quittungs-Whitelist still verworfen → Whitelist-Eintrag + Kettentest;
  (3) legitim volle `in.()`-Blöcke galten als Kappung → block-innere
  deterministische Pagination (bewiesen mit 1.500- und 10.500-Zeilen-Blöcken);
  (4) zwei Negativ-Guards der Rückstandsroute waren durch den Einschub vakant →
  Blockgrenzen-Extraktion. 2 Befunde von beiden Gegenprüfern widerlegt
  (Wiedervorlage-Skip an budgetlosen Tagen; angeblich gestrichene null-Wache —
  die alte Regex hätte die Regression nie gefangen). Dimensionen
  Mandantentrennung/DSGVO und CAS/Nebenläufigkeit: **0 Befunde.**
- **Kanonischer Offline-Gesamtlauf (`scripts/lokal.js` → `run-offline-tests.js`)
  auf dem Code-Endstand: 294/294 Suiten grün in 472 s** (nach dem Lauf änderten
  sich nur noch wenige Doku-Zeilen; die einzige doku-sensitive Suite,
  `current-state-groesse-test.js`, wurde auf dem finalen Doku-Stand separat
  erneut ausgeführt: 4/4 grün) — erstmals VOLLSTÄNDIG
  grün, weil die zwei historisch roten npm-Fehlstände (`ical.js`,
  `@aws-sdk/client-sqs`) für diesen Lauf lokal nachinstalliert wurden
  (`npm install --no-save`, package.json/Lockfile unverändert). Ein früherer
  Laufansatz wurde abgebrochen, weil er `docs/CURRENT_STATE.md` mitten in der
  Archiv-Verdichtung erwischt hatte (33.095 Zeichen Zwischenstand > 30.000-
  Grenze) — bekannte, behobene Ursache, keine blinde Wiederholung; der hier
  gezählte Lauf ist der eine vollständige auf dem Endstand.
- **`git diff --check`:** sauber (keine Whitespace-/Konfliktmarker).
- **Keine Migration im Diff** (`supabase/migrations/` unberührt); 21 Dateien,
  +2.409/−163 Zeilen (vor dem Doku-Abschluss).

## 13 · Nächster sicherer Schritt

1. Betreiber: diesen Branch prüfen; bei Zustimmung Push + PR freigeben
   (auftragsgemäß wurde nichts gepusht — der Stand liegt nur in dieser
   Arbeitsumgebung und in `docs/`-Belegen).
2. Danach (je eigene Freigabe): Merge der Blockerkorrekturen → natürliche
   Läufe rein lesend prüfen → erst dann Gate-Flip-Entscheidung; Zieldeckel-
   und Minimal-Cron-Aktivierung nur entlang der sechs dokumentierten Schritte
   (§7) und des Stufenplans (§3).
