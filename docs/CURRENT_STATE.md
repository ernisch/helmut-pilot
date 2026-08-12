# CURRENT STATE — Helmut

**Stand: 2026-08-12/4** (Straenge: **(a) OP-25-Production-Nachweis BESTANDEN** (§7.7.9; gilt nur fuer die heutige Architektur mit 5 Mandaten). **(b) OP-30 ist ZURUECKGENOMMEN und wirkungsbasiert aus** — zuletzt belegt am pipeline-Lauf 16:00 UTC des 12.08. auf dem Merge-Stand von PR #244 (§7a/§7b); **K2/K3 nie begonnen, der Fuenferlauf ist NICHT bestanden**. **(c) Altersgrenze berichtigt UND Betreiberablauf ausgefuehrt** (§7b, Runbook §17.10): PR #244 **gemergt** (`1fd9c98b`), die 180 offenen Auftraege **exportiert und kontrolliert geloescht** (55 erledigte byte-identisch erhalten), Migration `20260812` **angewendet** — der neue Altersvertrag ist in Production nachweisbar. **(d) OP-31 Frischevertrag BESTANDEN**; **(e)** Befund `mdb-a`/`dec-y` geklaert (Runbook §9). Diese Datei enthaelt
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

- **HEAD `104f4e1`** = Merge **PR #243** (OP-30-Rücknahme-/Wirkungsbeleg, reine Doku).
  In Production läuft weiterhin **`eb13652`** (#242) über den Rücknahme-Redeploy
  `dpl_7kcdpTbh…` (READY 2026-08-12T00:54:14Z, §7a/§5) — der Doku-Merge hat den laufenden
  Stand nicht verändert. Davor `6ed4f65` (#241), `9663fc8` (#240), `dcd6da5` (#239), `6030cbb7` (#238),
  `ec2e208` (#237), `0f047b1` (#236), `40e7708` (#235), `559a3d9` (#233), `1f10d66` (#234),
  `a07954df` (#232), `f4f4500b` (#229, K1–K8, kanonisch
  [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.7). Ältere: Archiv.
- Merge nach `main` = automatisches Production-Deployment (Vercel `fra1`,
  Projekt `helmut-pilot`). Rollback: [`betrieb/deploy-rollback.md`](betrieb/deploy-rollback.md).

## 3 · Production-Zustand

- **Datenbank:** Supabase **Free-Plan** — keine nativen Backups, kein PITR (→ OP-01).
  Vollsicherung (40/40) und isolierter Restore seit 2026-07-28 geübt
  ([`betrieb/restore-uebung-2026-07-28.md`](betrieb/restore-uebung-2026-07-28.md)); RPO ≤ 24 h.
- **Mandate — eine Wahrheit (K2-Betreiberschritt erledigt 2026-08-06):** `max-mustermann` wurde am
  2026-08-06T08:01:31Z **relational deaktiviert** (konditionales Update, exakt 1 Zeile, **kein
  Löschen**, [`betrieb/production_beweisprotokoll.md`](betrieb/production_beweisprotokoll.md) §9).
  Aktiv sind **5 Mandate**, identisch in relationaler DB, Laufzeitprojektion, Nachweiswerkzeug und
  Blob-Vergleichssicht, Signatur **`m5-9aee228dbf2c9f13`**; das K2-Gate meldet keinen Widerspruch.
  **Berichtigt 2026-08-09/3:** insgesamt **9** Profile — deaktiviert sind `angela-merkel`,
  `james-brown`, `max-mustermann` **und `helmut-abnahme-berlin`**; OP-04-Rest; **0 Testmandate**.
- **Aufbewahrung Crawl-Läufe** (K3 erledigt 2026-08-06): `HELMUT_CRAWL_RUN_RETENTION=36` (zuvor
  Default 20), wirksam mit Redeploy `dpl_3y5nBCiQ…`. Mindestbedarf bei n=5: 30.
- **Kapazität im Fenster real gelöst** (§7.7.6): crawl 04:00, Watchdog 08:03 und pipeline 16:00 je
  **6 von 6** Projektionen; der 16:00-Lauf endete nach ~4 min (Limit 270/280 s).
- **Quellen:** 9 Pakete · 163 Abrufwege · 165 Zuordnungen (2026-08-04: 155 `needs_review` / 4
  `broken` / 4 `healthy`); 18 Landesmodul-Wege (BE/BB) gesperrt. Seeds `20260713`/`20260717` **nicht
  eingespielt** ([`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md):
  BLOCKIERT). Befund B1 (Google-Klumpenrisiko) besteht fort.
- **Crons (Production):** unverändert (crawl 04:00/20:00 · pipeline 16:00 · morning-briefing
  05:00 · understanding 05:30/21:30 · lage-briefing 05:45 · health 06:00 · lage-check 10:00
  UTC · 2 Narrativ-Nachlaufslots 06:10/06:22, inert). **Dazu** der GitHub-Actions-Watchdog
  (`briefing-watchdog.yml`, täglich 05:30 UTC bedingungslos, oft 2–3 h verzögert): kein
  Störfall, aber im Aufbewahrungsvertrag nicht modelliert (→ K3/K7).
- **Migrationen:** die sechs OP-30-Paare am 2026-08-11 angewendet (Runbook §12); **`20260812`
  (Altersmessung) am 2026-08-12 17:23 UTC angewendet und abgenommen** (Runbook §17.10). Offen
  ist **nur noch `20260720`** (OP-03).
- **Kosten:** LLM ~0,14 USD/Betriebstag (Untergrenze, Preisbasis unbelegt,
  [`betrieb/kostenmessung.md`](betrieb/kostenmessung.md)); Nachweisfenster 0,1892 USD.
- **Zugangsgrenze jeder Claude-Sitzung (gemessen 2026-08-12):** Supabase lesend erreichbar;
  **Vercel-Env weder lesbar noch setzbar** (`curl`: `CONNECT → 403`; Vercel-MCP ohne Env-/
  Redeploy-Werkzeug; `CRON_SECRET` nicht gesetzt ⇒ `/api/ops/jobqueue` fail closed). Die
  Anwendung ist lesend über das Vercel-MCP-Werkzeug erreichbar (HTTP 200). Jede Flag-Aktivierung
  **und jeder Rückbau** ist Betreiberaktion ([`betrieb/env-inventar.md`](betrieb/env-inventar.md) §8).

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
| **`HELMUT_CRON_GLOBALABRUF`** | **`on`** seit 2026-08-06 ~08:15 UTC (Betreiber, für das Nachweisfenster) ⇒ **Kontextpfad aktiv**, laufzeitbelegt (drei Fensterläufe 06./07.08. global auf `d8bf68fa…`, E3 `nv=0`). Ob es `on` bleibt, ist Betreiberentscheidung. Dritter Zyklus |
| **Berlin (Landesmodul)** | inaktiv. `HELMUT_LANDESMODULE=berlin` seit 2026-07-26 gesetzt, aber **wirkungslos**: 0 berechtigte Berliner Mandate seit dem Rollback ([`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) §22). Ob das Flag wirkt, ist **unbewiesen** |
| **Brandenburg** | inaktiv (`brandenburg-basis` `prepared`, 8/8 Wege gesperrt); PR #132 vor Merge Gate-Name vereinheitlichen |
| **`HELMUT_SCALABLE_PIPELINE` (OP-30)** | **`off`, wirkungsbasiert belegt** (Rücknahme 2026-08-12 00:54Z; crawl 04:00 **und** pipeline 16:00 liefen über den Altpfad, auch nach dem Merge von PR #244). **Die Warteschlange ist neutralisiert:** die 180 offenen Aufträge am 2026-08-12 17:22 UTC exportiert und kontrolliert gelöscht, 55 erledigte byte-identisch erhalten (Runbook §17.10). Ein neuer Versuch beginnt bei §6 Schritt 3 mit K0–K3 |
| **M8 / `HELMUT_MATCHING_RELEVANZ_GATE`** | aus (Default aus, nie aktiviert) |
| `HELMUT_CRON_GLOBALPHASE` | nicht gesetzt (aus) — K2-Prüfung ergab keine Aktivierungsempfehlung |
| `HELMUT_UNDERSTANDING_GATE` / `HELMUT_PARDOK_DISPATCH` | `shadow` |
| Scoring (`HELMUT_SCORING_MODE`) | aus (OP-22) |
| Mailversand Resend | gebaut, **nicht aktiviert** (AVV/DNS/Betreiberschritte offen) |
| Retention/Löschung (`HELMUT_RETENTION_EXECUTE`) | nicht scharf (OP-12, braucht OP-02-Fristen) |
| `HELMUT_TENANT_LLM_CAP` | aus (OP-03) |
| `HELMUT_PROFILE_DB_MODE` | **Wirkung AN** — die frühere Angabe „nicht gesetzt" ist durch Laufzeitbelege widerlegt (alle Läufe bis 05.08. planten die relationale 6er-Menge; Code-Default wäre AUS). Wert/Setzzeitpunkt nicht Betreiber-bestätigt (offener Klärpunkt); der Blob ist **nicht** die wirksame Sicht |
| 5 Offline-Testmandate (`test-mdb-*`) | deaktivierte Repo-Daten, **nicht aktivieren** |

## 6 · Offene Pull Requests (gegen GitHub geprüft 2026-08-11)

| PR | Inhalt | Einschätzung |
|---|---|---|
| **#244** (dieser Sprint), Branch `claude/queue-age-measurement-ka8gbz` | **Berichtigte Altersmessung** (§7b): Migration `20260812` + Rollback, `betriebsstatus` auf Wartezeit, 2 neue Suiten, Runbook §17/§18 | **offen, nicht gemergt**; beide Pflicht-Checks **grün** (zuletzt `201335f`). Merge allein ändert Production **nicht** (Flag aus, Migration nicht angewendet) |
| **#231** (Draft) | OP-03 Konten-Vorbedingung, 1 Konto je Mandat | in §6 bisher nicht geführt (Korrektur 2026-08-11/2); Betreiberentscheidung |
| **#224** (Draft) | F-E2E: Lage-Rangfolge aus berechnetem Rang statt Ablage | behauptet die Behebung des CI-Nichtdeterminismus F-E2E; **nicht reviewt, nicht abgenommen** |
| **#225** (Draft) | „Produktroadmap für LINIE" | nicht aus dem Helmut-Arbeitsstrang; Einordnung beim Betreiber |
| **#218** | OP-25-Kapazität, konkurrierende Analyse | Ursache/Fix kamen über #219. **Empfehlung: schließen** |
| **#216** | flackernden `werkzeug-lesefehler-test.js` stabilisieren (F-PORT) | offen, reserviert als OP-28 |

Alle übrigen früher geführten PRs sind gemergt oder geschlossen (zuletzt **#243**, davor #240,
#239, #238, #237, #236, #235, #233). Historie: Archiv.

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

**Kanonische Belege** (Einzelheiten dort, nicht hier): Runbook
[`betrieb/op30-aktivierung-5-mandate.md`](betrieb/op30-aktivierung-5-mandate.md) —
`mdb-a` §9 · Migrationsbeleg §12 · Neutralität §13 · blockierter Versuch §14 · Aktivierung +
erster Lauf §15 · **Rücknahme §16** · **berichtigte Altersmessung §17**; die vollständige
Belegliste der Vorgeschichte steht dort in **§18**.

**Befund (unverändert gültig).** Der V3-Motorkern skaliert; die Grenze liegt **davor**: jedem Profil
werden 7–8 eigene Google-Wege vorangestellt (Kipppunkt **n ≈ 14–15**). **Zurückgezogen** bleiben „V3 ist
für 1000 Mandate konzipiert" und „Skalierungsnachweis für 200 Mandate liegt vor". Engpass ist nicht die
Warteschlange (8 Worker: 4 093 Aufträge/s), sondern die Slot-Zuteilung: mit Parallelität 8 + zwei
Morgenslots **200/200 bei 59,6 % Reserve** (PR #237; R4/R4b behoben). **Offen:** echte Google-/KI-Laufzeit ·
wirksamer Production-Deckel · **190 fehlende echte Profile** (es gibt 10) · Vercel bei Parallelität 8.

**Vorlauf 2026-08-08…/11/5, alles gemergt (PR #233–#242).** Warteschlange, Worker, KI-Budget,
Relevanzordnung und Lage-Narrativ (`HELMUT_NARRATIV_QUEUE`, default AUS) gebaut und getestet; der
Produktfehler „übersprungener V3-Lauf gilt als erledigt" ist portiert + gehärtet; sechs Migrationspaare
am 2026-08-11 angewendet. **OP-31 Frischevertrag BESTANDEN** (Restrisiko: ohne `HELMUT_CRON_FAIRNESS`
können exakt überlappende Läufe doppelt pushen; `briefings` wächst täglich, OP-12; Alarmweg OP-07).
**Sprint /5 BLOCKIERT** — kein Schreibweg zur Vercel-Env; der Zugangsblocker besteht fort.

**Aktivierungskontrollen (2026-08-11/6, Runbook §15 — dort alle Zahlen).** Betreiber setzte das Flag
`on` (Redeploy 18:52:47Z, unveränderter Commit `eb13652`); rein lesend kontrolliert. **K0 bestanden**
(9/10; offen `/api/ops/jobqueue` mangels `CRON_SECRET`). **Erster Lauf `crawl` 20:00 UTC** (Einsprung in
`cronSchwererPfad`, gilt für crawl **und** pipeline): 235 Aufträge, nur die fünf Mandate, 55 erledigt,
**0 endgültige Fehler**, 0 verloren/Dubletten/Pushs, Slot 266,6 s, KI-Abweichung 0; der Überspring-Fix
ist **erstmals in Production belegt**. **Aber:** `zustand=kritisch`, ältester offener Auftrag **5,84
Tage** ⇒ Grenze §8.2 **eingetreten**, K2/K3 nicht begonnen — **zu Unrecht, berichtigt in §7b.**

## 7b · Altersgrenze berichtigt und Betreiberablauf ausgeführt (2026-08-12/3 und /4)

**Ursache, präzisiert und an echter PostgreSQL 16.13 reproduziert** (Runbook §17.2): nicht (nur) der
OP-15-Rückstand, sondern die **7-Tage-Fensterbreite des Archivabrufs**: ein Auftrag in einem **laufenden**
Fenster ist bei seiner Entstehung bis zu 6,3 Tage „überfällig" (in Production genau die 5
`person-archiv`-Aufträge im Fenster `2026-08-06T00Z`; alle 230 übrigen unter 24 h). Die Grenze wäre bei
**jedem** ersten Lauf in einem laufenden Archivfenster eingetreten.

**Fix:** Die Grenze misst jetzt die **Wartezeit** = `max(now − max(created_at, first_due_at), 0)`. Der
**Fälligkeitsrückstand** bleibt gemeldet, ist aber **kein** Abbruchgrund (OP-15 bleibt sichtbar); `due_at`
und `first_claimed_at` scheiden aus (Runbook §17.3). Ohne Migration gilt der alte, zu strenge Vertrag
(`altersvertrag="faelligkeit-alt"`) — Fehlalarm statt falschem Grün. Migration `20260812` (+ Rollback)
ersetzt **nur** die lesende Funktion `helmut_job_metrics` (drei neue Spalten, keine Tabelle/Policy/Backfill).

**Die 235 Aufträge des ersten Laufs** waren nicht sicher weiterverwendbar (drei belegte Fallen —
kanonisch Runbook §17.7). Der Betreiberablauf §17.8 (Export → geschützte Löschung → Migration, mit
bewiesenem Rückweg) wurde am 2026-08-12 ausgeführt — siehe unten.

**Nachweise, Grenzen, Stand.** Tests: `jobqueue-alter-test.js` **59 PASS** ·
`jobqueue-alter-datenbank-test.js` (echte PostgreSQL 16.13) **26 PASS** ·
`jobqueue-ruecknahme-datenbank-test.js` (Export/Löschung/Wiederherstellung, §17.8) **31 PASS** ·
Vertragstest **125 PASS** · Mutationsprobe **10/10 rot**. **PR #244 ist gemergt** (`1fd9c98b`,
2026-08-12 13:51 UTC, beide Pflicht-Checks grün); der Merge-Lauf pipeline 16:00 UTC lief
**vollständig über den Altpfad** (Wirkungsnachweis, keine `warteschlange`-Zeile, 0 Berührung).

**Betreiberablauf §17.8 AUSGEFÜHRT (2026-08-12 17:17–17:24 UTC, freigegeben; Beleg Runbook
§17.10):** Export der 180 offenen Aufträge (180 Elemente, 20 Spalten, SHA256 `d74e7618…cda9`,
ID-Menge = Löschauswahl per md5 `df57f03b…7402` bewiesen; Datei dem Betreiber übergeben, nicht
committet) → kontrollierte Löschung in **einer** Transaktion (exakt 180; `pg_stat` 235/202/**180**;
**55 erledigte byte-identisch erhalten**, md5 `0ad846c7…fe2c` vorher = nachher; 0 FKs, 0
DELETE-Trigger) → Migration **`20260812` angewendet** (`20260812172327`, 17 Spalten,
Wartezeitformel in der Definition, 0 Fremdrechte, Advisor unverändert). Kennzahlen jetzt:
offene Warteschlange **leer**, alle Alterswerte **0**, Zustand wäre **grün** —
`altersvertrag="wartezeit"` ist in Production erfüllbar. **Flag blieb aus**, kein Deployment,
kein Cronlauf, kein neuer Auftrag. **OP-15 bleibt separat offen** (Personenquellen; am
16:00-Lauf erneut Timeouts/503 sichtbar) — bewusst nicht repariert, nur nicht mehr
abbruchauslösend. **Der Fünferlauf bleibt NICHT bestanden** und ist vollständig zu wiederholen —
ein neuer Aktivierungsversuch wurde **nicht** gestartet (§6 Schritt 3, K0–K3; K0 zusätzlich:
`altersvertrag = "wartezeit"`).

**Rücknahme + Wirkungsnachweis (2026-08-12/1 und /2, Runbook §16/§16.12): BESTANDEN.** Betreiber setzte das
Flag `off` (nur Production) + Redeploy **`dpl_7kcdpTbh…` READY 2026-08-12T00:54:14Z**, Commit `eb136522…`
gegengeprüft, `source=redeploy`. **Der crawl 04:00 UTC** lief **vollständig über den Altpfad**
(`[cron/crawl/globalphase] quellen=174 rohdokumente=1978`, `erfolgreich=5 zustand=ok`, **keine** Logzeile
`warteschlange`), und `helmut_jobs` sah **keinen Schreibvorgang** (`n_tup_ins/upd/del` unverändert
**235/202/0**, 0 Leases); `llm_reservations` nie beschrieben; KI `used=4` = exakt `verstanden=4` des
Altpfads ⇒ **0 Kosten durch OP-30**; 0 Runtimefehler. Zwingend, weil **alle 235 Aufträge fällig waren**.
**§7 Schritt 5 erfüllt, Rücknahmeplan vollständig abgenommen**; Einzelwerte in Runbook §16.12.

**Folge für OP-25:** eine Aktivierung verändert `quellenVereinigung`, die K2.1-Sichtbarkeitsmengen und die
Laufzeitbilanz ⇒ **OP-25 muss danach von vorn**.

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

- **OP-25-Nachweis nach §7.7.5: BESTANDEN — drittes Fenster 2026-08-07/08 (Exit 0, null
  Befunde), kanonisch §7.7.9** (Aktivierung `dpl_AdZ4JJJ…`, PR #232 / `a07954df…`; alle
  Kriterien grün, Kosten 0,2106 USD, Belege `belege/op25-*`). Fenster 1 `nicht_bestanden`,
  Fenster 2 `nicht_pruefbar` — bleiben dokumentiert. **Geltung: nur die aktuelle Architektur
  mit 5 Mandaten — beweist weder OP-30 noch 200 Mandate; nach einer OP-30-Aktivierung
  vollständige Wiederholung.** OP-14 (Verstehensrückstand) bleibt offen.
- **OP-31-Nachweis: BESTANDEN — Morgenlauf 2026-08-11 05:00 UTC** (§7a). Kopfstatus/UI-Rendering
  live nicht abgerufen (kein Zugangsgeheimnis) — die Aussage stützt sich auf den relational
  geprüften Beleg plus testgesicherten Code (F1–F6 des Reviews).
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

**Runbook §6 Schritt 1–4 sind erledigt, Schritt 5 wurde nach K1 abgebrochen, und die
Rücknahme (§7 Schritt 1) ist ausgeführt** (§12/§13/§15/§16). Reihenfolge jetzt:

1. **Erledigt 2026-08-12:** die Abnahme der Rücknahme am crawl 04:00 UTC ist **bestanden**
   (Runbook §16.12) — OP-30 ist nachweislich aus, Production im Normalbetrieb.
2. **Erledigt 2026-08-12/4:** PR #244 gemergt, Wirkungsnachweis am 16:00-Lauf bestanden,
   die 180 offenen Aufträge exportiert und kontrolliert gelöscht, Migration `20260812`
   angewendet (§7b, Runbook §17.10). **Nächster Schritt: den neuen kontrollierten
   OP-30-Fünferlauf vorbereiten** — Beginn bei Runbook §6 Schritt 3, K0–K3 von vorn
   (K0 zusätzlich: `altersvertrag = "wartezeit"`); die Flag-Aktivierung ist eine separate
   Betreiberfreigabe.
3. Unabhängig davon: **OP-15** (Personenquellen seit 2026-08-06 nicht erfolgreich abgerufen)
   ist beziffert und gehört behoben; `CRON_SECRET`/Egress für eine Folgesitzung freigeben.
4. **Der Fünferlauf ist nicht bestanden** (K2/K3 nie begonnen) — eine Wiederholung beginnt
   bei §6 Schritt 3 und braucht wieder K0–K3.

Ausweitung auf 25+ erst nach K3 **und neu bestandenem OP-25**
([`betrieb/op30-kapazitaet-morgenslots-2026-08-09.md`](betrieb/op30-kapazitaet-morgenslots-2026-08-09.md) §10);
vor Stufe 5: **190 fehlende echte Profile** (es gibt 10).

Parallel: **OP-01**; **OP-11** verifizieren; **#218** schließen.

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
| 2026-08-12/4 | **Betreiber-Sprint Neutralisierung + Migration** (§7b, Runbook §17.10): 180 offene Aufträge exportiert (SHA256 `d74e7618…cda9`, ID-Beweis per md5) und in einer geschützten Transaktion exakt gelöscht; 55 erledigte byte-identisch erhalten; Migration `20260812` angewendet und abgenommen (17 Spalten, Wartezeitformel, Alterswerte 0, Zustand grün); Flag blieb aus, kein Deployment, kein Cronlauf | **erfolgreich abgeschlossen** (Doku-PR offen) |
| 2026-08-12/3 | **Altersgrenze berichtigt** (§7b, Runbook §17): Fehlbefund reproduziert und behoben (Wartezeit statt Fälligkeit); 3 neue Suiten (59+26+31 PASS); PR #244 → **gemergt 13:51 UTC**, Wirkungsnachweis am 16:00-Lauf bestanden | **erfolgreich abgeschlossen** |
| 2026-08-12/2 | **OP-30-Wirkungsnachweis der Abschaltung** (§7a): crawl 04:00 UTC lief über den Altpfad (`[cron/crawl/globalphase]`, 5/5 Mandate, `zustand=ok`), `helmut_jobs` ohne jeden Schreibvorgang (235/202/0), `llm_reservations` 0/0/0, KI `used=4` vollständig aus dem Altpfad erklärt, 0 Fehler ⇒ **OP-30 nachweislich aus, Rücknahmeplan abgenommen** · Runbook §16.12 | **erfolgreich abgeschlossen** (Doku-PR #243 gemergt) |

Die Sprints 2026-08-12/1 (Rücknahmebeleg, Runbook §16), 2026-08-11/6 (K0 bestanden, bei K1 gestoppt, §15), 2026-08-11/5 (**blockiert**, kein Schreibweg zur Vercel-Env, §14), 2026-08-11/4 (Neutralitätsnachweis, §13) und 2026-08-11/3 (Vorwärtsmigrationen, §12) stehen kanonisch im Runbook. Der Sprint 2026-08-09/2 (E1 `tenant_narrative`, PR #236 gemergt) und die OP-30-Sprints vom 2026-08-08 stehen vollständig in den Belegdateien aus §7a ([`betrieb/op30-testbefunde-2026-08-08.md`](betrieb/op30-testbefunde-2026-08-08.md) trägt den CI-Basisrot-Befund). Die OP-25-Sprints vom 2026-08-01 bis 2026-08-08 stehen kanonisch in [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.5–§7.7.9; Sprints bis einschließlich 2026-07-31 und ältere Beweisketten: **Archiv** ([`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md)).
