# CURRENT STATE — Helmut

**Stand: 2026-08-24 (verdichtet im Sprint „Fundament 25 Mandate").** Versuch 5 ist formal
vollständig abgeschlossen; der Warteschlangenmotor läuft in Production und bleibt an (Vollbeleg
[`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) §30.7).
**PR #265 und #266 sind gemergt; offen ist nur PR #268 (dieser Doku-Sprint).** `main` =
**`bf7aee29181cb80a4d7eb33d20858614212b6c80`** (Merge PR #266); Auslieferung in Production
laut Betreiberangabe 24.08. **Der WhatsApp-Gesundheitsbot ist damit an den neuen Motor
angepasst** (liest `process_runs`/`betriebsstatus`/CAS, vier Zustände) — die Fehlwarnung aus
toten Blob-Altquittungen ist behoben.

Diese Datei enthält nur den aktuellen, entscheidungsrelevanten Zustand (Grenze 30.000 Zeichen /
350 Zeilen, testgesichert durch `scripts/current-state-groesse-test.js`). Die Fassung vor dieser
Verdichtung liegt verlustfrei in
[`archive/project_state/2026_08_24_CURRENT_STATE_pre_25_full.md`](archive/project_state/2026_08_24_CURRENT_STATE_pre_25_full.md).
Ablageregeln: [`archive/README.md`](archive/README.md), `CLAUDE.md` §9.

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Offen sind die vier P0-Verkaufsblocker (OP-01…OP-04);
Feature-Stopp zugunsten von Betriebs-, Rechts- und Sicherheitsreife. OP-Liste:
[`datenmotor-restliste.md`](datenmotor-restliste.md). Parallel: **Vorbereitung 25 Mandate**
(§8) — ohne Aktivierungsfreigabe.

## 2 · `main` und Production

- `main` = **`bf7aee29`** (Merge **PR #266**, Gesundheitsbot am Motor); davor **`e898cce`**
  (Merge **PR #265**, V4-Vorprüfung + §30.7-Beleg). Merge nach `main` deployt automatisch;
  Auslieferung von #266 laut Betreiberangabe 24.08.
- Motor-Aktivierung 23.08. auf damaligem Stand `a7559186` (`dpl_CJAWWr3UZygjjWCYxZz35CcJ3Ssk`,
  READY 16:47:38 UTC); Details §7. Ältere Merge-Historie (#256–#262, #216/#225/#261,
  Schließungen #218/#224/#231/#255): Archivfassung + Belegdateien (§14).

## 3 · Production-Zustand

- **Datenbank:** Supabase **Free-Plan** — kein PITR (→ OP-01). Vollsicherung (40/40) und
  isolierter Restore seit 28.07. geübt; RPO ≤ 24 h.
- **Mandate — eine Wahrheit (K2 erledigt 2026-08-06,
  [`betrieb/production_beweisprotokoll.md`](betrieb/production_beweisprotokoll.md) §9):** aktiv
  sind **5 Mandate**, identisch in relationaler DB, Laufzeitprojektion, Nachweiswerkzeug und
  Blob-Vergleichssicht, Signatur **`m5-9aee228dbf2c9f13`**; K2-Gate ohne Widerspruch.
  Insgesamt **9** Profile — deaktiviert: `angela-merkel`, `james-brown`, `max-mustermann`,
  `helmut-abnahme-berlin` (OP-04-Rest); **0 Testmandate**.
- **Crawl-Aufbewahrung** (K3): `HELMUT_CRAWL_RUN_RETENTION=36`; Mindestbedarf n=5: 30.
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen (155 `needs_review` / 4 `broken` /
  4 `healthy`, 04.08.); 18 Landesmodul-Wege (BE/BB) gesperrt. Seeds `20260713`/`20260717`
  **nicht eingespielt** (BLOCKIERT, nur noch Betreiberfreigabe, §14). B1 besteht fort (OP-15).
- **Crons:** unverändert (crawl 04:00/20:00 · pipeline 16:00 · morning 05:00 · understanding
  05:30/21:30 · lage 05:45 · health 06:00 · lage-check 10:00 UTC · 2 inerte Nachlaufslots).
  Dazu GitHub-Actions-Watchdog (`briefing-watchdog.yml`, 05:30 UTC, oft 2–3 h verzögert;
  im Aufbewahrungsvertrag nicht modelliert → K3/K7).
- **Migrationen:** die fünf OP-30-Dateien (`20260813*`/`20260814*`) seit 15.08. angewendet
  (Runbook §24.10); `20260823043633` seit 23.08. Buchführung 33 Einträge; zwei inhaltsgleiche
  Einträge derselben Migration (ein End-Newline-Byte Differenz, §30.6) — Funktion genau einmal,
  keine Datenwirkung, kein Eingriff. **Offen ist nur `20260720`** (OP-03).
- **Kosten:** LLM ~0,14 USD/Betriebstag (Untergrenze, Preisbasis unbelegt,
  [`betrieb/kostenmessung.md`](betrieb/kostenmessung.md)); Budget-Deckel 100 Calls/Tag +
  Reserve 30, fail-closed; Messwerte Abnahme: 23.08. 66/100, 24.08. 29/100.
- **Zugangsgrenze jeder Claude-Sitzung** (gemessen 12.08., bestätigt 15.08.): Supabase und
  Vercel-Deployments nur lesend; **Vercel-Env weder lesbar noch setzbar**, `CRON_SECRET` nicht
  verfügbar ⇒ `/api/ops/jobqueue` fail closed. Flags nur **wirkungsbasiert** prüfbar; jede
  Flag-Änderung ist Betreiberaktion ([`betrieb/env-inventar.md`](betrieb/env-inventar.md) §8).

## 4 · Aktivierte Funktionen (Production)

| Flag/Funktion | Zustand |
|---|---|
| `HELMUT_SOURCE_MODE=on` | relationale DB ist Quellenwahrheit (seit 2026-07-15) |
| `HELMUT_CRON_FAIRNESS` | aktiv (Default an); Production-belegt ([`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) §14.4/§14.5) |
| `HELMUT_MATCHING_AUDIT=on` | seit 2026-07-28, Auditpersistenz + Idempotenz belegt |
| `HELMUT_PROCESS_RUNS_RELATIONAL=on` | seit 2026-07-27, Dual-Write belegt |
| `HELMUT_ATOMIC_LOCK` | an — atomare, fail-closed Sperren |
| LLM-Tagesbudget 100 + Reserve 30 | fail-closed, live |
| `HELMUT_VERSTEHEN_CAS=on` | seit 17.08. Parallelität nicht gesetzt ⇒ **wirkt als 1**; >1 = eigene Freigabe (Runbook §23.1) |
| **`HELMUT_SCALABLE_PIPELINE=on`** | seit 23.08. 16:47 UTC mit **`HELMUT_JOB_DISPATCH_MODE=shadow`**, Worker 4/25/25. Versuch 5 abgeschlossen (§7); kein Rückbau nötig, Rückweg dokumentiert |

## 5 · Deaktivierte Funktionen (bleiben aus, Aktivierung = Freigabe)

| Funktion | Zustand |
|---|---|
| `HELMUT_CRON_GLOBALABRUF` | `on` seit 2026-08-06 (Betreiber); ob es `on` bleibt, ist Betreiberentscheidung |
| Berlin (Landesmodul) | inaktiv; `HELMUT_LANDESMODULE=berlin` gesetzt, aber wirkungslos (0 berechtigte Mandate); Flag-Wirkung **unbewiesen** |
| Brandenburg | inaktiv (`brandenburg-basis` `prepared`, 8/8 Wege gesperrt). PR #132 am 31.07. **ungemergt geschlossen** (24.08. gegengeprüft) — Gate-je-Land-Arbeit neu aufzusetzen |
| M8-Relevanz-Gate · `HELMUT_CRON_GLOBALPHASE` · Scoring (OP-22) | aus |
| `HELMUT_UNDERSTANDING_GATE` / `HELMUT_PARDOK_DISPATCH` | `shadow` |
| Mailversand Resend | gebaut, nicht aktiviert (AVV/DNS/Betreiberschritte offen) |
| Retention (`HELMUT_RETENTION_EXECUTE`) | nicht scharf (OP-12, braucht OP-02-Fristen) |
| `HELMUT_TENANT_LLM_CAP` | aus (OP-03) |
| `HELMUT_PROFILE_DB_MODE` | **Wirkung AN** (laufzeitbelegt); Wert/Setzzeitpunkt nicht Betreiber-bestätigt (Klärpunkt) |
| Queue-Betrieb (`queue`, `HELMUT_KLASSEN_GRENZEN`, `HELMUT_LLM_FAIRNESS`, AWS) | aus — Stufe 2 nicht begonnen (§8) |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |

## 6 · Offene Blocker

1. **OP-01:** Supabase Pro + PITR — Kostenentscheidung; kostenfreier Backup-/Restore-Teil erledigt.
2. **OP-02:** Pilotvertrag, AVV, DSFA extern ungeprüft; blockiert OP-12 und echten Mailbetrieb.
3. **OP-03:** Freigabepaket erster zahlender Zweitmandant; Migration `20260720`, `HELMUT_TENANT_LLM_CAP`, DB-Durchsetzungsentscheidung.
4. **OP-04-Rest:** Lösch-/Behalte-Entscheidung je deaktiviertem Demo-Mandat.
5. **Vercel-Schreibzugriff:** Flag-Aktivierung, Rückbau, Redeploy bleiben Betreiberaktionen.
6. **OP-11:** Branch Protection auf GitHub nicht aktiv; Pflicht-CI blockiert Merges nicht technisch.
7. **OP-15:** Google-Drosselung/Personenquellen bleiben Produktionsrisiken; laut Zielarchitektur
   §23 **Blocker ab ~10 Mandaten** (Direkt-RSS-Minderung nicht begonnen).
8. **Lage-Rotation:** der Lage-Cron schafft **2 Mandate je Tageslauf** — bei 25 Mandaten
   ≈ 13 Tage je Rotation. Vor Skalierung Kapazitätsentscheidung nötig; der Bot meldet den
   Rückstand seit #266 als Produkthinweis, nicht als Störung.
9. **Stufe-2-Queue-Nachweis fehlt:** Dispatch steht auf `shadow`; echter Queue-Betrieb
   (7-Tage-Nachweis) fand nie statt und braucht den AWS-Transport (§8).

K2/K3 abgeschlossen (5 aktive Mandate, `m5-9aee228dbf2c9f13`, Retention 36). OP-25: drittes
Fenster bestanden; laut Betreiberfeststellung 24.08. abgeschlossen und bewiesen. **Nach jeder
weiteren OP-30-Aktivierungsstufe muss OP-25 vollständig neu laufen.**

## 7 · OP-30 — Stand nach Versuch 5 (kompakt)

- **Versuch 5 (Stufe 1: 5 Mandate, Dispatch `shadow`) formal vollständig abgeschlossen**
  (Betreiber-Aktivierung 23.08. 16:47:38 UTC, `dpl_CJAWWr3U…` auf `a7559186`): erster
  Wirkungsslot **117 echte Abschlüsse** (`success`, 259 s, 0 endgültige Fehler, 0 `unbekannt`,
  0 Lease-Probleme), Nacht+Morgen **+259** ⇒ **376 belegte Abschlüsse**; briefing-morning
  **5/5**, briefing-lage effektiv **5/5**; keine Doppelarbeit, kein Verlust, 0 Fencing-
  Konflikte, 0 HV001/HV002. **Alle elf §28.6-Kontrollen erfüllt** (Runbook §30.7).
- **R4/GitHub-Actions-Watchdog grün:** Lauf **#59** auf `a7559186`, `conclusion: success`;
  0 doppelte Idempotenzschlüssel, 0 Doppel-Pushs, 0 Neuplanungen. Budget ohne Doppelzählungs-
  muster (26/29 Aufrufe quittungsgenau; 3 Briefing-Kleinpfade mit begrenzter Messauflösung).
- **Wichtig: Versuch 5 ist KEIN Queue-Nachweis** — der Dispatch stand durchgehend auf `shadow`
  (nichts verließ den Prozess; Antrieb war der Cron). Der Stufenplan bleibt verbindlich.
- Historie (Versuche 1–4, Neutralisierungen 524/383, CAS, §30-Lücke, V4): Runbook §19–§30.6.

## 8 · Skalierungspfad und Vorbereitung 25 Mandate

**Verbindlicher Stufenplan** ([`betrieb/op30-zielarchitektur-2026-08-13.md`](betrieb/op30-zielarchitektur-2026-08-13.md)
§14, geschärft durch Runbook §21/§22 — kein späterer Beleg ersetzt ihn):

- **Stufe 1 (5 Mandate, `shadow`): erfüllt** durch Versuch 5 (§7).
- **Stufe 2 (5 Mandate, `queue`): offen.** `HELMUT_KLASSEN_GRENZEN=on` +
  `HELMUT_JOB_DISPATCH_MODE=queue`; Nachweis **über 7 volle Tage**: Abfluss ≥ Ankunft,
  0 Verlust/Doppelarbeit, ältester offener Auftrag dauerhaft < 24 h. **Standardtransport
  `sqs`** (Runbook §21); Selbstweck ohne `HELMUT_SELBSTWECK_ERLAUBT=on` gesperrt (Notfallweg).
  Die AWS-Ressourcen (Queue, DLQ, KMS, IAM-Sender, Lambda; Vorlage
  `infra/aws/helmut-auftrags-queue.yaml`, eu-central-1) **existieren nicht** — Anlegen =
  **kostenpflichtige Gründerentscheidung**; Betreiberanleitung Runbook §22 („Nichts davon ist getan").
- **Stufe 3 (25 Mandate): erst nach Stufe 2.** Zusätzlich nötig: `HELMUT_LLM_FAIRNESS=on`,
  Drain 2, **OP-25 vollständig neu**, 20 echte Profile. Der KI-Deckel 100+30 **reicht ab
  25 Mandaten nicht** (§23: 88–265 Aufrufe/Tag) → KI-Budgetentscheidung; OP-15 ist ab
  ~10 Mandaten Blocker (§23) — vor dem Sprung auf 25 zu entscheiden, obwohl §14 ihn formal
  erst bei Stufe 4 führt.
- **Vorbereitung 25 Mandate läuft** (Sprint 24.08., Vollbeleg
  [`betrieb/fundament-25-mandate-2026-08-24.md`](betrieb/fundament-25-mandate-2026-08-24.md)):
  20 Brandenburg-Kandidaten recherchiert, lokales Importpaket nach dem Profilvertrag
  in `data/mandatsprofile/` — **alle `aktiv:false`**, aber **nicht final direkt verifiziert**
  (Egress-Sperre; Verifikationslauf vorbereitet, nicht ausgeführt, freigabepflichtig).
  Stufung: **zuerst 5 Mandate im Queue-Betrieb (Stufe 2), danach kontrollierte Erweiterung.**
  **Keine Aktivierungsfreigabe für 25.** Kein Import, keine Production-Änderung. PR #268 offen.

## 9 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt |
|---|---|
| Profilreife (OP-29/OP-04-Teil) | 29B (lesender Fehlerzustands-Nachweis); relationale Profilzeilen veraltete Schnappschüsse (F-P6) |
| Google-News-Härtung (OP-15) | Production-Beweislauf unter echter Drosselung |
| Monitoring-Zweitkanal (OP-07) | Webhook stellt täglich zu (belegt 24.08.); Ziel-URL + doppelter WhatsApp-Eingang ungeklärt (Betreiber) |
| `source_id`-Dubletten (OP-19) | Live-Nachweis „Telemetriezeilen = distinct `source_id`" |
| Punkt 16 Störungs-Erkennung · Punkt 17 Kostenmessung | 7/14 Klassen nur testbelegt · ~16 % Logverlust, Preisbasis unbelegt |
| Punkt 23 Matching · Punkt 29 Fehlervertrag | 23B-2 (Briefing-Historisierung) · 29B offen |
| Punkt 26/27 (E2E Berlin/Brandenburg) | 26B blockiert durch Punkt 14, 27B durch Punkt 15; 27A-2-Abnahmemessung offen |
| Mail (#204/#205) · Kalender (#209) | Mailpit-Lauf Betreiber-Mac, Aktivierung freigabepflichtig · zuerst Rechtsfrage ([`kalender-machbarkeit-1.md`](kalender-machbarkeit-1.md) §8) |
| Berlin-Aktivierungsreife (Punkt 14) | Betreiber-Flagzugang + stabile Pipeline; Aktivierungsset 4 Wege |
| OP-06 terminales Aussortieren (34 Fälle) | Freigabe und Fachfrage |
| Pre-Seed-Sicherung/Seed-Restore | Restore lief nie gegen Production (bewusst) |
| Gesundheitsbot-Folgepunkt (K7) | Watchdog-Vorprüfung findet keine Blob-Altquittungen mehr — Vertrag nachziehen |

## 10 · Ausstehende Production-Nachweise

- **OP-25:** drittes Fenster BESTANDEN ([`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md)
  §7.7.9); Geltung nur aktuelle Architektur mit 5 Mandaten. **Nach jeder OP-30-Aktivierungsstufe
  vollständige Wiederholung.** OP-14 bleibt offen.
- **OP-31:** BESTANDEN (Morgenlauf 2026-08-11, [`betrieb/briefing-frischevertrag-2026-08-10.md`](betrieb/briefing-frischevertrag-2026-08-10.md)).
- **F-E2E** (nichtdeterministische E2E-Rangfolge im CI): Ursache offen; PR #224 war Draft, geschlossen.
- **29B** wartet auf natürliche Fehlerzustände · **27A-2** Wiederholungsmessung nach Deployment ·
  **OP-09/OP-10** brauchen ein echtes Störereignis · **Berlin:** Flag-Wirkung unbewiesen.

## 11 · Gescheiterte Ansätze — nicht wiederholen

Vollständige Begründungen: Archivfassungen (§14).

- **F-1** Tenant-JWT-Selbstsignierung → RLS scharfschalten: dauerhaft stillgelegt; Nachfolge in OP-03.
- **F-2** Generation B „Quellenplattform": nicht mergen, nicht als Basis
  ([`architecture/retired-quellenplattform-branches.md`](architecture/retired-quellenplattform-branches.md)).
- **F-3** Anker-Understanding-Recovery: in Production gescheitert;
  `understanding-recovery.yml` **nie ausführen** (`CLAUDE.md` §5).
- **F-4** „Quellenbasis zu dünn": Fehlbefund. · **F-5** Referenzzahl „145": verworfen —
  gültig ist `Telemetriezeilen = distinct source_id`.
- **OP-25 Anlauf 1 + Fenster 1/2:** gescheitert an Werkzeug-/Vertragsfehlern und E3, nicht an Kapazität.
- **Methodisch:** grüne Offline-Tests bewiesen hier nichts — Fixtures kodierten falsche
  `runId`-Konvention, nur eine Profilwahrheit, feste `vercel.json`-Slots.

## 12 · Nächster empfohlener Schritt

1. **Gründerentscheidung Stufe 2:** AWS-Kosten + Stack-Anlage nach Runbook §22; danach Flags
   `queue`/`HELMUT_KLASSEN_GRENZEN` (Betreiber) und **7-Tage-Queue-Nachweis** starten.
2. **Beobachtung der Regelzyklen** über die Quittungen (`warteschlange-*`, Briefings 5/5);
   bei Verletzung einer §28.6-Grenze gilt der Rückweg (Flag löschen + Redeploy, Betreiber).
3. **P0-Verkaufsblocker OP-01…OP-04** (§1/§6) — parallel zum Queue-Nachweis.
4. **Betreiberprüfung Doppelkanal:** Ziel von `HELMUT_MONITORING_WEBHOOK_URL`; erst danach
   ein Kanalschritt.
5. **25-Mandate-Vorbereitung fortführen** (§8): Verifikationslauf des Profilpakets nur nach
   ausdrücklicher Freigabe; kein Import, keine Aktivierung.

## 13 · Verbindliche Betriebsgrenzen

Vollständig: `CLAUDE.md` §5. Insbesondere unverändert:

- Kein Merge nach `main` (= Deployment), kein Deployment, keine Production-Datenänderung,
  keine Secret-/Env-/Flag-/Cron-Änderung ohne ausdrückliche Freigabe.
- Migrationen: offen ist nur `20260720`; jede Anwendung bleibt freigabepflichtig.
- Berlin, Brandenburg, M8 bleiben deaktiviert; keine Testmandat-Aktivierung. **Keine
  Aktivierung und kein Import weiterer Mandatsprofile ohne ausdrückliche Freigabe.**
- Keine kostenverursachenden Läufe; `understanding-recovery.yml` nie ausführen (F-3);
  Retention nicht scharfschalten.
- Mandantentrennung ist App-seitig (`assertTenant` + `user_id`-Filter); kein Mandant wird
  hartkodiert; gemeinsamer Zustand nur bedingt schreiben (CAS, `CLAUDE.md` §4.10).

## 14 · Detailnachweise und Archiv

| Thema | Kanonische Quelle |
|---|---|
| Offene Punkte OP-01…OP-31 (verbindlich) | [`datenmotor-restliste.md`](datenmotor-restliste.md) |
| OP-30: Aktivierungs-Runbook (Versuche 1–5, §30.7-Abschluss) | [`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) |
| OP-30: Zielarchitektur, Stufenplan §14, Kapazitätsmodell §23, AWS §21/§22/§26 | [`betrieb/op30-zielarchitektur-2026-08-13.md`](betrieb/op30-zielarchitektur-2026-08-13.md) |
| OP-30: CAS-Verstehensvertrag | [`betrieb/op30-verstehen-cas-2026-08-14.md`](betrieb/op30-verstehen-cas-2026-08-14.md) |
| Profil-Importvertrag (Grundlage 25/200 Profile) | [`betrieb/op30-profilvertrag-200-mandate.md`](betrieb/op30-profilvertrag-200-mandate.md) |
| OP-25: Nachweisvertrag, Korrekturen, Fenster | [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.5–§7.7.9 |
| OP-31: Frischevertrag | [`betrieb/briefing-frischevertrag-2026-08-10.md`](betrieb/briefing-frischevertrag-2026-08-10.md) |
| Cron-Fairness, F-CAS, Watchdog-Verzug | [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) |
| Berlin-Aktivierung/-Rollback | [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) |
| Seed-Einspielung (blockiert) | [`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md) |
| Backup/Restore | [`betrieb/backup-restore-runbook.md`](betrieb/backup-restore-runbook.md) · [`betrieb/restore-uebung-2026-07-28.md`](betrieb/restore-uebung-2026-07-28.md) |
| Env-/Secret-Inventar, Cloud-Zugangsgrenzen | [`betrieb/env-inventar.md`](betrieb/env-inventar.md) |
| Vorbereitung 25 Mandate (Teil B/C/D) | [`betrieb/fundament-25-mandate-2026-08-24.md`](betrieb/fundament-25-mandate-2026-08-24.md) |
| Vollstatus vor Verdichtung 24.08. | [`archive/project_state/2026_08_24_CURRENT_STATE_pre_25_full.md`](archive/project_state/2026_08_24_CURRENT_STATE_pre_25_full.md) |

**Letzte Sprints:** 24.08. Gesundheitsbot (PR #266) · 23./24.08. Aktivierung + Abschluss
Versuch 5 (PR #265) · 23.08. GitHub-Bereinigung, §30.5-Vollzug (PR #262), Live-V4 ·
19.–22.08. §28–§30-Sprints (PR #256–#260). Vollberichte: Runbook §27–§30.7 + Archiv 24.08.
