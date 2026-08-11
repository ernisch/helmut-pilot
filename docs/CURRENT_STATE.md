# CURRENT STATE — Helmut

**Stand: 2026-08-11/3** (Straenge: **(a) OP-25-Production-Nachweis BESTANDEN** (§7.7.9; gilt nur fuer die heutige Architektur mit 5 Mandaten). **(b) OP-30**, §7a — PR #233/#235/#236/#237/#240 gemergt; **die sechs Vorwaertsmigrationen sind am 2026-08-11 auf Production angewendet und abgenommen**, alle OP-30-Flags weiter **aus**, nichts aktiviert; Runbook [`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) §12. **(c) OP-31 Frischevertrag BESTANDEN** — PR #238/#239 gemergt, Morgenlauf 2026-08-11: `belegt=5/5`, ein Push je Mandat. **(d)** Befund `mdb-a`/`dec-y` geklaert, kein Blocker, Bereinigungsplan im Runbook §9). Diese Datei enthaelt
**ausschließlich den aktuellen, entscheidungsrelevanten Zustand** (Grenze 30.000 Zeichen /
350 Zeilen, testgesichert durch `scripts/current-state-groesse-test.js`). Die vollständige
Historie liegt **verlustfrei** in
[`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md)
(byte-identisch mit `main`-Commit `4594fea`; der danach ergänzte 12. Durchgang steht kanonisch
in [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.6).
Ablageregeln: [`archive/README.md`](archive/README.md), `CLAUDE.md` §9.

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Der Einzelpilot läuft stabil in Production; offen sind
die vier P0-Verkaufsblocker (OP-01…OP-04). Feature-Stopp zugunsten von Betriebs-,
Rechts- und Sicherheitsreife. Verbindliche OP-Liste:
[`datenmotor-restliste.md`](datenmotor-restliste.md).

## 2 · Stand auf `main`

- **HEAD `9663fc8`** = Merge von **PR #240** (OP-30-Aktivierungsvorbereitung: portierter
  Überspring-Fix + Runbook; Production-Deployment `dpl_HsbK5VJ…` READY 2026-08-11,
  Commit gegengeprüft). Davor `dcd6da5` = **PR #239**, `6030cbb7` = **PR #238**
  (OP-31; erster Morgenlauf **bestanden**, §7a/§9).
- Davor `ec2e208` = **PR #237**, `0f047b1` = **PR #236**, `40e7708` = **PR #235**,
  `559a3d9` = **PR #233**, `1f10d66` = **PR #234**, `a07954df` = **PR #232**,
  `f4f4500b` = **PR #229** (K1–K8, kanonisch
  [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.7). Ältere PRs: Archiv.
- Merge nach `main` = automatisches Production-Deployment (Vercel `fra1`,
  Projekt `helmut-pilot`). Rollback: [`betrieb/deploy-rollback.md`](betrieb/deploy-rollback.md).

## 3 · Production-Zustand

- **Datenbank:** Supabase **Free-Plan** — keine nativen Backups, kein PITR (→ OP-01).
  Vollsicherung (40/40 Tabellen) und isolierter Restore seit 2026-07-28 geübt
  ([`betrieb/restore-uebung-2026-07-28.md`](betrieb/restore-uebung-2026-07-28.md));
  Restrisiko RPO bis 24 h.
- **Mandate — eine Wahrheit (K2-Betreiberschritt erledigt 2026-08-06):** `max-mustermann`
  wurde am 2026-08-06T08:01:31Z **relational deaktiviert** — konditionales Update, exakt
  1 Zeile, **kein Löschen** ([`betrieb/production_beweisprotokoll.md`](betrieb/production_beweisprotokoll.md) §9).
  Aktiv sind **5 Mandate**, identisch in relationaler DB, Laufzeitprojektion,
  Nachweiswerkzeug und Blob-Vergleichssicht, Signatur **`m5-9aee228dbf2c9f13`**;
  das K2-Gate meldet keinen Widerspruch mehr. **Berichtigt 2026-08-09/3:** insgesamt **9**
  Profile (nicht 8) — deaktiviert sind `angela-merkel`, `james-brown`, `max-mustermann` **und
  `helmut-abnahme-berlin`** (angelegt 2026-07-26, in der bisherigen Zählung übersehen);
  OP-04-Rest; **0 Testmandate, 0 Landtagsprofile**.
- **Aufbewahrung Crawl-Läufe (K3-Betreiberschritt erledigt 2026-08-06):**
  `HELMUT_CRAWL_RUN_RETENTION=36` (Betreiber-Sichtprüfung in Vercel, nur Production;
  zuvor Default 20), wirksam mit Redeploy **`dpl_3y5nBCiQtHnUnVuqh1SFr2X2ranu`**
  (READY 07:50:22 UTC, Commit `f4f4500b`). Mindestbedarf bei n=5: 30; ab 36 keine
  Knapp-Warnung.
- **Kapazität im Fenster real gelöst** (belegt, §7.7.6): crawl 04:00, Watchdog-pipeline
  08:03 und pipeline 16:00 haben je **6 von 6** Mandatsprojektionen abgeschlossen; der
  16:00-Lauf endete regulär nach ~4 min, weit vor dem 270/280-s-Limit.
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen (Stand 2026-08-04:
  155 `needs_review` / 4 `broken` / 4 `healthy`); 18 Landesmodul-Wege (BE/BB) gesperrt.
  Quellen-Seeds `20260713`/`20260717` **nicht eingespielt**
  ([`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md): BLOCKIERT,
  nur noch Betreiberfreigabe). Befund B1 (Google-Klumpenrisiko) besteht fort.
- **Crons (Production):** 9 Vercel-Einträge unverändert (crawl 04:00/20:00 · pipeline 16:00 ·
  morning-briefing 05:00 · understanding 05:30/21:30 · lage-briefing 05:45 · health 06:00 ·
  lage-check 10:00 UTC, `vercel.json`). **Dazu ein vierter, planmäßiger Regel-Slot:** der
  GitHub-Actions-Watchdog (`briefing-watchdog.yml`) feuert täglich 05:30 UTC
  **bedingungslos** die volle Pipeline; GitHub verzögert regelmäßig um 2–3 h. Er ist
  **kein Störfall**, aber im Aufbewahrungsvertrag nicht modelliert (→ K3/K7).
- **Migrationen:** die **sechs OP-30-Paare am 2026-08-11 angewendet und abgenommen**
  (Runbook §12, §7a); offen ist **nur noch `20260720`** (OP-03). `20260721`, `20260727`
  und beide `20260728`: angewendet und verifiziert.
- **Kosten:** LLM im Mittel ~0,14 USD/Betriebstag (Untergrenze, Preisbasis unbelegt,
  [`betrieb/kostenmessung.md`](betrieb/kostenmessung.md)); Nachweisfenster 0,1892 USD
  bei Rahmen 2 USD.
- **Zugangsgrenze jeder Claude-Sitzung:** Supabase lesend erreichbar; **Vercel-Env weder
  lesbar noch setzbar** (Egress `CONNECT → 403`, Vercel-MCP ohne Env-/Redeploy-Werkzeug).
  Jede Flag-Aktivierung **und jeder Rückbau** ist Betreiberaktion
  ([`betrieb/env-inventar.md`](betrieb/env-inventar.md) §8).

## 4 · Aktivierte Funktionen (Production)

| Flag/Funktion | Zustand |
|---|---|
| `HELMUT_SOURCE_MODE=on` | relationale DB ist Quellenwahrheit (seit 2026-07-15) |
| `HELMUT_CRON_FAIRNESS` | aktiv (Default an); Rotation Production-belegt 2026-08-03 ([`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) §14.4/§14.5) |
| `HELMUT_MATCHING_AUDIT=on` | seit 2026-07-28, Auditpersistenz + Idempotenz belegt |
| `HELMUT_PROCESS_RUNS_RELATIONAL=on` | seit 2026-07-27, Dual-Write belegt (W-2 geschlossen) |
| `HELMUT_ATOMIC_LOCK` | an — atomare, fail-closed Sperren (Token-belegt) |
| LLM-Tagesbudget 100 + Reserve 30 | fail-closed, live |

## 5 · Deaktivierte Funktionen (bleiben aus, Aktivierung = Freigabe)

| Funktion | Zustand |
|---|---|
| **`HELMUT_CRON_GLOBALABRUF`** | **`on`** seit 2026-08-06 ~08:15 UTC (Betreiber-Sichtprüfung, für das Nachweisfenster) ⇒ **Kontextpfad aktiv** — laufzeitbelegt: die drei Fensterläufe 06./07.08. liefen global auf `d8bf68fa…` mit E3 `nv=0`. Ob das Flag nach dem ausgewerteten Fenster `on` bleibt, ist Betreiberentscheidung (das nächste Fenster braucht ohnehin ein neues Deployment). Dritter Zyklus; zweiter war `on` 2026-08-04 18:23 → Rückbau 2026-08-05 |
| **Berlin (Landesmodul)** | inaktiv. `HELMUT_LANDESMODULE=berlin` seit 2026-07-26 gesetzt, aber **wirkungslos**: 0 berechtigte Berliner Mandate seit dem Rollback ([`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) §22). Ob das Flag wirkt, ist **unbewiesen** |
| **Brandenburg** | inaktiv (`brandenburg-basis` `prepared`, 8/8 Wege gesperrt); PR #132 vor Merge Gate-Name vereinheitlichen |
| **M8 / `HELMUT_MATCHING_RELEVANZ_GATE`** | aus (Default aus, nie aktiviert) |
| `HELMUT_CRON_GLOBALPHASE` | nicht gesetzt (aus) — K2-Prüfung ergab keine Aktivierungsempfehlung |
| `HELMUT_UNDERSTANDING_GATE` / `HELMUT_PARDOK_DISPATCH` | `shadow` |
| Scoring (`HELMUT_SCORING_MODE`) | aus (OP-22) |
| Mailversand Resend | gebaut, **nicht aktiviert** (AVV/DNS/Betreiberschritte offen) |
| Retention/Löschung (`HELMUT_RETENTION_EXECUTE`) | nicht scharf (OP-12, braucht OP-02-Fristen) |
| `HELMUT_TENANT_LLM_CAP` | aus (OP-03) |
| `HELMUT_PROFILE_DB_MODE` | **Wirkung AN** — die frühere Angabe „nicht gesetzt" ist durch Laufzeitbelege widerlegt (alle Läufe bis 05.08. planten die relationale 6er-Menge, die nur der Stufe-D-Merge liefert; Code-Default wäre AUS). Direkte Env-Einsicht aus Sitzungen nicht möglich; Wert/Setzzeitpunkt nicht Betreiber-bestätigt (offener Klärpunkt). Der Blob ist **nicht** die wirksame Sicht |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |

## 6 · Offene Pull Requests (gegen GitHub geprüft 2026-08-11)

| PR | Inhalt | Einschätzung |
|---|---|---|
| **dieser Sprint** | Doku: OP-30-Vorwärtsmigrationen auf Production angewendet (Migrationsbeleg Runbook §12, O5-Präzisierung) | reine Doku, **mergefähig nach Review** |
| **#231** (Draft) | OP-03 Konten-Vorbedingung, 1 Konto je Mandat | in §6 bisher nicht geführt (Korrektur 2026-08-11/2); Betreiberentscheidung |
| **#224** (Draft) | F-E2E: Lage-Rangfolge aus berechnetem Rang statt Ablage | behauptet die Behebung des CI-Nichtdeterminismus F-E2E; **nicht reviewt, nicht abgenommen** |
| **#225** (Draft) | „Produktroadmap für LINIE" | nicht aus dem Helmut-Arbeitsstrang; Einordnung beim Betreiber |
| **#218** | OP-25-Kapazität, konkurrierende Analyse | Ursache/Fix kamen über #219. **Empfehlung: schließen** |
| **#216** | flackernden `werkzeug-lesefehler-test.js` stabilisieren (F-PORT) | offen, reserviert als OP-28 |

Alle übrigen früher geführten PRs sind gemergt oder geschlossen (zuletzt **#240, #239, #238,
#237, #236, #235 und #233**). Historie: Archiv.

## 7 · Offene Blocker

1. **OP-01** Supabase Pro + PITR — reine Kostenentscheidung (~25 $/Monat); kostenfreier
   Teil erledigt.
2. **OP-02** Recht — Pilotvertrag/AVV/DSFA extern ungeprüft; `knowledge_objects` enthalten
   Art.-9-Daten. Blockiert OP-12 und echten Mailbetrieb.
3. **OP-03** Zweitmandanten-Freigabepaket — Grundsatzentscheidung „DB-seitige Durchsetzung
   vs. dokumentierte App-Guard-Akzeptanz"
   ([`mandantentrennung-architektur.md`](mandantentrennung-architektur.md)).
4. **OP-04-Rest** — Entscheidung über die deaktivierten Demo-Mandate; hängt mit K2 zusammen.
5. **Kein Vercel-Schreibweg aus Sitzungen** (§3) — blockiert jede Flag-Aktivierung/-Rücknahme
   und jede Landesmodul-Aktivierung.
6. **OP-11** Branch Protection — Aktivierungsstand unbestätigt; ohne sie blockiert das
   CI-Gate nicht ([`betrieb/branch-protection.md`](betrieb/branch-protection.md)).
Die früheren Blocker 7/8 (K2-/K3-Betreiberschritte) sind seit 2026-08-06 **erledigt**
(Beweisprotokoll §9): `max-mustermann` relational deaktiviert (eine 5er-Mandatswahrheit,
`m5-9aee228dbf2c9f13`), Retention 36 gesetzt + Redeploy. Der nächste OP-25-Nachweis ist
damit nur noch durch die **separate Startfreigabe** blockiert (§9/§11).

## 7a · Kapazitätsgrenze und OP-30 (Stand 2026-08-09)

Fünf Sprints an einem Tag. Die Einzelheiten stehen in den Belegdateien; hier steht nur, was
für eine Entscheidung zählt.

| Beleg | Inhalt |
|---|---|
| [`betrieb/v3-skalierungspruefung-2026-08-08.md`](betrieb/v3-skalierungspruefung-2026-08-08.md) | Ursache: mandatseigene Abrufwege, Kipppunkt n ≈ 14–15 |
| [`betrieb/skalierungsgrundlage-1000.md`](betrieb/skalierungsgrundlage-1000.md) | Warteschlange, Worker, Flag, erste Messung |
| [`betrieb/op30-abnahme-2026-08-08.md`](betrieb/op30-abnahme-2026-08-08.md) | Rechengrundlage 5/200/1000, Relevanzordnung, Bereinigung, Profilinventar |
| [`betrieb/skalierung-200-mandate.md`](betrieb/skalierung-200-mandate.md) | 200 Mandate im Tag, Deckel, Kosten |
| [`betrieb/lokaler-production-schutz.md`](betrieb/lokaler-production-schutz.md) | Vorfall, Ursache, zweischichtiger Schutz |
| [`betrieb/op30-testbefunde-2026-08-08.md`](betrieb/op30-testbefunde-2026-08-08.md) | Endgültige Bewertung der fünf roten Suiten |
| [`betrieb/workerbetrieb.md`](betrieb/workerbetrieb.md) | Worker, Bereinigung, Vercel-Entscheidung |
| **[`betrieb/op30-abschlussreview-2026-08-08.md`](betrieb/op30-abschlussreview-2026-08-08.md)** | **unabhängiger adversarialer Abschlussreview von PR #233: 12 behobene Befunde, 16 benannte, Migrations-/Rollbackdurchlauf an echter PostgreSQL, Mutationsproben** |

**Befund (unverändert gültig).** Der V3-Motorkern skaliert; die Grenze liegt **davor**: jedem
Profil werden 7–8 eigene Google-Wege vorangestellt (Kipppunkt **n ≈ 14–15**). **Zurückgezogen**
bleiben „V3 ist für 1000 Mandate konzipiert" und „Skalierungsnachweis für 200 Mandate liegt
vor". Warteschlange, Worker, KI-Budget und Relevanzordnung sind lokal vollständig gebaut und
getestet, **alle Flags aus**; die sechs Migrationspaare sind **seit 2026-08-11 angewendet**. Die
Warteschlange ist nicht der Engpass (8 Worker: 4 093 Aufträge/s) — der Engpass ist die
Slot-Zuteilung, und genau die löst der Sprint 2026-08-09/3 unten. Details: Belegdateien oben.

**PR #233/#235/#236 sind gemergt, Deployments READY, erste reguläre Läufe sauber — keine
Regression.** #235 („Aktivierungsreife 200"): O1–O5 gelöst, Stufennachweis 5–200 (+1 000),
Importvertrag. #236 (E1): Lage-Narrativ als fünfter Auftragstyp, Flag
**`HELMUT_NARRATIV_QUEUE`** default AUS; Review behob R1–R3, benannte R4/R6. Belege
[`op30-aktivierungsreife-2026-08-09.md`](betrieb/op30-aktivierungsreife-2026-08-09.md) ·
[`lage-narrativ-warteschlange-2026-08-09.md`](betrieb/lage-narrativ-warteschlange-2026-08-09.md) ·
[`op30-e1-abschlussreview-2026-08-09.md`](betrieb/op30-e1-abschlussreview-2026-08-09.md).

**Sprint „Kapazitaet der Morgenlage" (2026-08-09/3, PR #237 gemergt).** Kanonisch:
[`op30-kapazitaet-morgenslots-2026-08-09.md`](betrieb/op30-kapazitaet-morgenslots-2026-08-09.md).
**R4** (doppelte Budgetzaehlung) und **R4b** (still verworfener Bereichsdeckel) an echter
PostgreSQL 16.13 reproduziert und behoben — ein Buch, ein Schreiber; beides in der
Migration `20260808_llm_budget_fairness.sql` (seit 2026-08-11 angewendet).
Kapazitaet slotgenau gemessen: heutige Verdrahtung traegt **39 von 200**; kleinste sichere
Loesung (Parallelitaet 8 ueber `HELMUT_NARRATIV_PARALLEL` · Slotbudget 270 s · zwei
Morgenslots 06:10/06:22 UTC auf geriegelter Route · Narrativgrenze 45 s · Leerlaufwarten)
⇒ **200/200 im Morgenfenster (06:30 UTC), 59,6 % Reserve**, 14 Stoerfaelle ohne Verlust
und ohne Doppelverarbeitung; 1 000 Mandate: 586 (ehrlich als Rueckstand gemeldet).
**R6** im Testgeruest entschaerft. Narrativkosten 0,2614 USD/Morgen bei 200.
**Offen:** echte Google-/KI-Laufzeit · wirksamer Production-Deckel · **190 fehlende echte
Profile** (es gibt 10) · Aktivierung + Production-Nachweis (Migrationen 2026-08-11
angewendet) · Vercel-Verhalten bei Parallelitaet 8.

**Sprint „Frischevertrag des Morgenbriefings" (2026-08-10, PR #238) — OP-31 Production-Nachweis
BESTANDEN (2026-08-11).** Kanonisch (inkl. Reviewbefunde, Laufdetails, Belegzeilen):
[`briefing-frischevertrag-2026-08-10.md`](betrieb/briefing-frischevertrag-2026-08-10.md) §10/§11.
Erster regulaerer Morgenlauf 2026-08-11 05:00:26 UTC: `frischevertrag.belegt=5/5`,
`erfolgreich=5 fehlgeschlagen=0`, ein Push je Mandat, 5 relational gegengepruefte
Erfolgsbelege, kein zweiter Routenaufruf, keine Fehlerzeile. Restrisiko unveraendert:
ohne `HELMUT_CRON_FAIRNESS` koennen exakt ueberlappende Laeufe doppelt pushen (kein
falsches Gruen); `briefings` waechst taeglich (OP-12); Alarmweg weiterhin OP-07.

**Sprint „OP-30-Aktivierungsvorbereitung 5 Mandate" (2026-08-11/2).** Kanonisch:
[`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) (Inventar,
Migrationsbeweise, Aktivierungs-/Rücknahmeplan, Messwerte/Abbruchgrenzen, `mdb-a`-Plan).
**Kernbefund:** der Produktfehler „übersprungener V3-Lauf gilt als erledigt" war nur auf dem
nie gemergten Branch `claude/helmut_scaling_foundation_1000` behoben — auf `main` fehlte er
(„B14 behoben" in PR #235 meinte einen gleichnamigen Testinfrastruktur-Befund). Portiert +
gehärtet, 7 neue Vertragstests; der alte Branch ist vollständig ausgewertet. `mdb-a`:
Testfixture-Write mit Production-Env vor dem lokalen Schutz; **kein aktiver Datenweg,
kein Blocker** (Runbook §9).

**Sprint „OP-30-Vorwärtsmigrationen Production" (2026-08-11/3, ausdrückliche Freigabe).**
Alle sechs Paare 10:47–10:52 UTC über MCP `apply_migration` (Projekt `ddckuvvpcytqbyfmbvie`)
angewendet; lesende Abnahme vollständig grün: Historie exakt in Reihenfolge, RLS aktiviert +
erzwungen, keine Policy, 0 Fremdrechte, 0 SECURITY DEFINER, Bestandsdaten/Mandate/`mdb-a`/
`global.used` unverändert, `helmut_jobs`/`llm_reservations` leer, Security-Advisor ohne
neuen WARN/ERROR. **Alle OP-30-Flags aus, nichts aktiviert.** Beleg: Runbook §12.

**Folge für OP-25:** eine spätere Aktivierung verändert `quellenVereinigung`, die
K2.1-Sichtbarkeitsmengen und die Laufzeitbilanz ⇒ **OP-25 muss danach von vorn**.


## 8 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt |
|---|---|
| **OP-25** Fairness/Zeitdeckelung — Rotation, K1, K2.1, Nachweisvertrag §7.7.5 + Werkzeug; **Korrekturen K1–K8 gemergt (PR #229, 2026-08-06)**; beide Betreiberschritte K2/K3 erledigt (Beweisprotokoll §9) | Nachweis 2026-08-04/05 `nicht_bestanden`; Ursachenanalyse §7.7.6 (2 Befunde unzutreffend, 1 vorhersagbar, 1 Randartefakt, 1 erklärt, 1 echt: `rueckstand-nicht-dauerhaft` → K4). Alle acht Korrekturen grün (§7.7.7; Vertrag 271/271 · E3 55/55 · Laufpaar 29/29 · Watchdog 26/26 · Mutationsprobe 87/87 rot). **Es fehlt nur noch der neue Nachweis von vorn (separate Startfreigabe, §11).** Offen bleiben zudem Abdeckungsmessung, Abdeckungsalarm, R-1, R-3 |
| Profilreife (OP-29/OP-04-Teil) — 5 Profile am 2026-08-04 repariert | 29B (lesender Fehlerzustands-Nachweis); relationale Profilzeilen bleiben veraltete Schnappschüsse (F-P6); K2 |
| Google-News-Härtung (OP-15) | Production-Beweislauf unter echter Drosselung |
| Monitoring-Zweitkanal (OP-07) | `HELMUT_MONITORING_WEBHOOK_URL` unset → No-Op |
| `source_id`-Dubletten (OP-19) | Live-Nachweis „Telemetriezeilen = distinct `source_id`" |
| Punkt 16 Quellenstörungs-Erkennung | 7 von 14 Klassen nur testbelegt |
| Punkt 17 Kostenmessung | ~16 % Logverlust, Preisbasis unbelegt, Nicht-LLM ungemessen |
| Punkt 23 Matching-Nachvollziehbarkeit | 23B-2 (Briefing-Historisierung); Abdeckung wächst nur mit Läufen |
| Punkt 26/27 (E2E Berlin/Brandenburg) | 26B blockiert durch Punkt 14, 27B durch Punkt 15; 27A-2-Abnahmemessung offen |
| Punkt 29 Fehlervertrag | 29B offen; P29-Fixes gemergt |
| Mail (#204/#205) | Mailpit-Bestätigungslauf auf dem Betreiber-Mac; Production-Aktivierung freigabepflichtig |
| Kalender-Machbarkeit 1 (#209) | reine Machbarkeit; vor Ausbau zuerst die **Rechtsfrage** ([`kalender-machbarkeit-1.md`](kalender-machbarkeit-1.md) §8) |
| Berlin-Aktivierungsreife (Punkt 14) | Betreiber-Flagzugang + stabile Pipeline; Aktivierungsset 4 Wege |
| Quellen-Seed-Einspielung | nur noch Betreiberfreigabe (Export + Reaktivierung der 6 Bundeswege) |
| OP-06 terminales Aussortieren (34 Fälle) | Freigabe **und** Fachfrage (16 Begründungen pilotmandats-relativ, Tabelle mandantenneutral) |
| Pre-Seed-Sicherung/Seed-Restore | Restore lief nie gegen Production (bewusst) |

## 9 · Ausstehende Production-Nachweise

- **OP-25-Nachweis nach §7.7.5: BESTANDEN — drittes Fenster 2026-08-07/08 (Exit 0,
  null Befunde), kanonisch §7.7.9.** Aktivierung `dpl_AdZ4JJJZUAT27X72SWzVeFyJu49a`
  (Merge PR #232, Commit `a07954df…` mit dem Kostenlücken-Fix), READY 20:19:06.409Z,
  Baseline +160 s (`belege/op25-startbaseline-2026-08-07-fixfenster.json`, SHA256
  `8414fab3…`). Alle Kriterien grün: 3/3 Läufe vollständig + versiegelt, Commitnachweis,
  m5 konstant, K1-Bindung, E3 `nv=0`, Kontextzahl erklärt, kein Watchdog-Ersatzlauf,
  Retention 36, **Kosten 0,2106 USD / unbepreist 0** (Fix wirkte). Beleg
  `belege/op25-auswertung-2026-08-08.log` (SHA256 `17ed0f83…`). Historie: Fenster 1
  (04./05.08.) `nicht_bestanden`, Fenster 2 (06./07.08.) `nicht_pruefbar` — beide bleiben
  unverändert dokumentiert. **Geltung: nur die aktuelle Architektur mit 5 Mandaten —
  beweist weder OP-30 noch 200 Mandate; nach OP-30-Aktivierung vollständige Wiederholung
  erforderlich.** OP-14 (Verstehensrückstand) bleibt ausdrücklich offen.
- **OP-31-Nachweis: BESTANDEN — Morgenlauf 2026-08-11 05:00 UTC** (§7a). Kopfstatus/UI-Rendering
  live nicht per Session abgerufen (kein Zugangsgeheimnis in dieser Sitzung) — Aussage stützt
  sich auf den relational geprüften Beleg plus testgesicherten Code (F1–F6 des Reviews).
- **F-E2E** (nichtdeterministische E2E-Rangfolge im CI, belegt 2026-08-04) — Ursache offen;
  PR #224 (Draft) liegt vor, nicht abgenommen.
- **29B** — wartet auf natürlich auftretende Fehlerzustände (künstliche Fehler verboten).
- **27A-2-Abnahme** — Wiederholungsmessung nach Deployment.
- **OP-09/OP-10** (Lock-Deny/Fehlerpfad) — brauchen ein echtes Störereignis.
- **Berlin:** ob `HELMUT_LANDESMODULE` in Production wirkt, ist unbewiesen.

## 10 · Gescheiterte Ansätze — nicht wiederholen

Vollständige Begründungen: Archiv (§5 der Altfassung).

- **F-1** Tenant-JWT-Selbstsignierung → RLS scharfschalten: **dauerhaft stillgelegt**;
  RLS inert, Trennung App-seitig, Nachfolge gehört zu OP-03. `HELMUT_TENANT_JWT_MODE`
  ist wirkungslos.
- **F-2** Generation B „Quellenplattform": **nicht mergen, nicht als Basis nutzen**
  ([`architecture/retired-quellenplattform-branches.md`](architecture/retired-quellenplattform-branches.md)).
- **F-3** Anker-basierter Understanding-Recovery-Pfad: **in Production gescheitert**,
  dreifach stillgelegt + CI-Riegel; Workflow `understanding-recovery.yml` **nie ausführen**
  (`CLAUDE.md` §5). Ersatz: Einzeldokument-Recovery je exakter `raw_document_id`.
- **F-4** „Quellenbasis zu dünn": **Fehlbefund** — nicht neu aufsetzen.
- **F-5** Feste Referenzzahl „145 Quellen": **verworfen** — gültig ist
  `Telemetriezeilen = distinct source_id` (B3).
- **OP-25-Nachweis, 1. Anlauf (2026-08-03, Kapazität) und 1. reguläres Fenster
  (2026-08-04/05)**: gescheitert. **Wichtig für den nächsten Anlauf:** das Fenster ist
  nicht am Kapazitätsblocker gescheitert (der war real gelöst, §3), sondern an
  Werkzeug-/Vertragsfehlern und an E3. Fenster-Untergrenze 2026-08-04T00:00Z bleibt
  verbindlich.
- **Methodisch:** grüne Offline-Tests haben hier nichts bewiesen — Fixtures kodierten die
  falsche `runId`-Konvention, modellierten nur **eine** Profilwahrheit, kannten nur
  `vercel.json`-Slots mit festem n, und die Kapazitätsmessung erreichte die Stopplinie nie.

## 11 · Nächster empfohlener Schritt

**Runbook §6 Schritt 1 ist erledigt: die sechs Migrationen sind seit 2026-08-11 auf
Production angewendet und abgenommen** (Beleg Runbook §12). Nächste Betreiberschritte:

1. Doku-PR dieses Sprints reviewen/mergen; **einen Regellauf bei Flags aus kontrollieren**
   (z. B. 16:00-pipeline: Verhalten unverändert, 0 Zeilen in `helmut_jobs`), dann
   [`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md)
   §6 Schritt 3–5 (`HELMUT_SCALABLE_PIPELINE=on` + Redeploy → K0–K3).
   Ausweitung auf 25+ erst nach bestandener K3 **und neu bestandenem OP-25**
   (Stufenplan [`betrieb/op30-kapazitaet-morgenslots-2026-08-09.md`](betrieb/op30-kapazitaet-morgenslots-2026-08-09.md) §10);
   vor Stufe 5: **190 fehlende echte Profile** (es gibt 10).

Parallel und unabhängig: **OP-01** (Pro + PITR); **OP-11** verifizieren; **#218** schließen.

## 12 · Verbindliche Betriebsgrenzen

Vollständig: `CLAUDE.md` §5. Insbesondere gilt unverändert:

- Kein Merge nach `main` (= Deployment), kein Deployment, keine Production-Datenänderung,
  keine Secret-/Env-/Flag-/Cron-Änderung ohne ausdrückliche Freigabe.
- Migration auf Production: offen ist nur `20260720` — Anwendung freigabepflichtig.
- **Berlin, Brandenburg und M8 bleiben deaktiviert**; keine Testmandat-Aktivierung; die
  5 Offline-Testmandate bleiben deaktivierte Repo-Daten.
- Keine kostenverursachenden Läufe (Backfills, Recovery, Massen-Crawls);
  `understanding-recovery.yml` nie ausführen (F-3); Retention nicht scharfschalten.
- Mandantentrennung ist App-seitig (`assertTenant` + `user_id`-Filter); kein Mandant wird
  hartkodiert; gemeinsamer Zustand nur bedingt schreiben (CAS, `CLAUDE.md` §4.10).

## 13 · Detailnachweise und Archiv

| Thema | Kanonische Quelle |
|---|---|
| Offene Punkte OP-01…OP-29 (verbindlich) | [`datenmotor-restliste.md`](datenmotor-restliste.md) |
| **OP-25: Ursachenanalyse, Korrekturen K1–K8, neue Abnahmekriterien** | [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) **§7.7.6/§7.7.7** |
| OP-25: Korrektursprint-Beleg (Umsetzung, Testzahlen, Betreiberaktionen) | [`betrieb/op25-korrektursprint-2026-08-05.md`](betrieb/op25-korrektursprint-2026-08-05.md) |
| OP-25-Nachweisvertrag + Betreiberablauf | [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.5 |
| Cron-Fairness inkl. Production-Nachweise, F-CAS, F-POS, Watchdog-Verzug | [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) |
| Globalphase/Globalabruf (K1/K2/K2.1) | [`betrieb/cron-globalphase.md`](betrieb/cron-globalphase.md) |
| Berlin-Aktivierung/-Rollback, Runbook | [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) |
| Seed-Einspielung (blockiert) | [`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md) |
| Backup/Restore | [`betrieb/backup-restore-runbook.md`](betrieb/backup-restore-runbook.md) · [`betrieb/restore-uebung-2026-07-28.md`](betrieb/restore-uebung-2026-07-28.md) |
| Env-/Secret-Inventar, Cloud-Zugangsgrenzen | [`betrieb/env-inventar.md`](betrieb/env-inventar.md) |
| Matching (Audit, Erklärung, M-Befunde) | [`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) |
| Vorgangsbildung B4-Kette (CSD) | [`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md) |
| Profilreife/Reparatur 2026-08-04 | [`multitenancy-profilbereitschaft-bundestag.md`](multitenancy-profilbereitschaft-bundestag.md) |
| PARDOK-Parser (Punkt 24) | [`quellenarchitektur/17-pardok-parser.md`](quellenarchitektur/17-pardok-parser.md) |
| Paket-Inventur (wiederholbar) | [`quellenarchitektur/30-paket-inventur-production.md`](quellenarchitektur/30-paket-inventur-production.md) |
| **OP-30: Kapazität der Morgenlage, R4/R4b, Stufenplan** | [`betrieb/op30-kapazitaet-morgenslots-2026-08-09.md`](betrieb/op30-kapazitaet-morgenslots-2026-08-09.md) |
| **OP-30: Aktivierungs-Runbook 5 Mandate (Pläne, Grenzen, `mdb-a`)** | [`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) |
| **OP-31: Frischevertrag + adversarialer Review (§10)** | [`betrieb/briefing-frischevertrag-2026-08-10.md`](betrieb/briefing-frischevertrag-2026-08-10.md) |
| Roadmap Phase 1 | [`roadmap/phase_1_checkliste.md`](roadmap/phase_1_checkliste.md) |
| Mail | [`betrieb/mailversand-resend.md`](betrieb/mailversand-resend.md) · [`betrieb/lokale-mailtests-mailpit.md`](betrieb/lokale-mailtests-mailpit.md) |
| **Vollständige Historie bis `4594fea`** | [`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md) |

## 14 · Letzte relevante Sprints (Kurzüberblick, neueste zuerst)

| Datum | Sprint | Ausgang |
|---|---|---|
| 2026-08-11/3 | **OP-30-Vorwärtsmigrationen Production** (§7a): alle sechs Paare angewendet (10:47–10:52 UTC), lesende Abnahme grün, Advisor ohne neuen WARN/ERROR, Flags aus, nichts aktiviert · Beleg Runbook §12 | **erfolgreich abgeschlossen** (Doku-PR offen; Aktivierung = separater Sprint) |
| 2026-08-11/2 | **OP-30-Aktivierungsvorbereitung 5 Mandate** (§7a): Überspring-Produktfehler portiert (`jobqueue-vertrag` 120/120), Migrationskette 31/31, `mdb-a` geklärt, Runbook · Beleg [`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) | **abgeschlossen** (PR #240 gemergt 2026-08-11) |
| 2026-08-11 | **OP-31 Production-Nachweis** (§7a): erster Morgenlauf auf `6030cbb7` (PR #238), 05:00:26 UTC automatischer Vercel-Cron, `frischevertrag.belegt=5/5`, 5 relational geprüfte Erfolgsbelege, kein Doppel-Push, keine Fehlermeldung · Beleg [`betrieb/briefing-frischevertrag-2026-08-10.md`](betrieb/briefing-frischevertrag-2026-08-10.md) §11 | **abgeschlossen** |
| 2026-08-10 | **OP-31 Frischevertrag des Morgenbriefings** (§7a): mandatsscharfe Lauf-Quittung ohne Migration, adversarialer Review sechs echte Befunde behoben (Tagesbeleg ohne Mandats-/Tagesprüfung, Abdeckungszahl zählte FEHLER als „belegt"). Tests 69/69 · 68/68 · 34/34 · Gesamt 238/242 · Smoke 32/32 | **teilweise abgeschlossen** (Merge und Nachweis folgten 2026-08-11, Zeile oben) |
| 2026-08-09/3 | **OP-30 Kapazität der Morgenlage + R4/R4b** — doppelte Budgetzählung an echter PostgreSQL reproduziert und behoben, Kapazität slotgenau gemessen, kleinste sichere Lösung ⇒ 200/200 im Morgenfenster mit 59,6 % Reserve; R6 im Testgerüst entschärft · Beleg [`betrieb/op30-kapazitaet-morgenslots-2026-08-09.md`](betrieb/op30-kapazitaet-morgenslots-2026-08-09.md) | **teilweise abgeschlossen**, PR #237 gemergt (Migration, Aktivierung und Production-Nachweis offen) |
| 2026-08-09/2 | **E1 `tenant_narrative` + unabhängiger Abschlussreview**: Lage-Narrativ als fünfter Auftragstyp über die Warteschlange (Flag default AUS, Migration nicht angewendet); Review behob R1–R3, benannte R4/R6 · Belege [`lage-narrativ-warteschlange-2026-08-09.md`](betrieb/lage-narrativ-warteschlange-2026-08-09.md) · [`op30-e1-abschlussreview-2026-08-09.md`](betrieb/op30-e1-abschlussreview-2026-08-09.md) | **abgeschlossen**, PR #236 gemergt |

Die OP-30-Sprints vom 2026-08-08 stehen vollständig in den Belegdateien aus §7a ([`betrieb/op30-testbefunde-2026-08-08.md`](betrieb/op30-testbefunde-2026-08-08.md) trägt den CI-Basisrot-Befund). Die OP-25-Sprints vom 2026-08-01 bis 2026-08-08 stehen kanonisch in [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.5–§7.7.9; Sprints bis einschließlich 2026-07-31 und ältere Beweisketten: **Archiv** ([`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md)).
