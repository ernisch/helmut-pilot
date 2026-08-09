# CURRENT STATE — Helmut

**Stand: 2026-08-08** (zwei getrennte Stränge: **(a) OP-25-Production-Nachweis BESTANDEN** — drittes Fenster 2026-08-07/08, Exit 0, null Befunde, kanonisch §7.7.9; er gilt **ausschließlich für die heutige Architektur mit 5 Mandaten** und beweist weder OP-30 noch 200 Mandate. **(b) V3-Skalierungsprüfung + lokaler Umsetzungssprint OP-30**, §7a — alle Flags **aus**, keine Migration angewendet, nichts aktiviert). Diese Datei enthält
**ausschließlich den aktuellen, entscheidungsrelevanten Zustand** (Grenze 30.000 Zeichen /
350 Zeilen, testgesichert durch `scripts/current-state-groesse-test.js`). Die vollständige
Historie liegt **verlustfrei** in
[`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md)
— byte-identisch mit `docs/CURRENT_STATE.md` auf `main`-Commit `4594fea` (per `git mv`
verschoben, SHA256 `bbc7cdd08824f49e596e3fc488973e49d5b4582961cd3948bb66e70c5732771d`,
Historie über `git log --follow`). Der **danach** über PR #227 ergänzte 12. Durchgang steht
hier verdichtet; kanonisch und vollständig ist er in
[`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.6.
Ablageregeln: [`archive/README.md`](archive/README.md), `CLAUDE.md` §9.

## 1 · Aktive Produktphase

**Verkaufsreife herstellen.** Der Einzelpilot läuft stabil in Production; offen sind
die vier P0-Verkaufsblocker (OP-01…OP-04). Feature-Stopp zugunsten von Betriebs-,
Rechts- und Sicherheitsreife. Verbindliche OP-Liste:
[`datenmotor-restliste.md`](datenmotor-restliste.md).

## 2 · Stand auf `main`

- **HEAD `f4f4500b`** = Merge von **PR #229** (2026-08-06): **Korrektursprint K1–K8**
  (eine Mandatswahrheit, harter Aufbewahrungsvertrag inkl. Watchdog, E3-Einlösung,
  bedingter Watchdog, Abschlussreserve) — Beleg
  [`betrieb/op25-korrektursprint-2026-08-05.md`](betrieb/op25-korrektursprint-2026-08-05.md),
  kanonisch [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.7.
- Davor `dbb86b4` = **PR #228** (CURRENT_STATE kompaktiert) und `6cce829` = **PR #227**
  (**Ursachenanalyse §7.7.6**, rein lesend; widerlegt mehrere Befunde des
  Abschlussberichts).
- Davor `4594fea` = **PR #226** (Durchführung und Auswertung des Nachweisfensters
  2026-08-04/05, Ergebnis `nicht_bestanden`; Belege `belege/op25-startbaseline.json`,
  `belege/op25-auswertung-2026-08-05.log`).
- Weiter enthalten: #223 (Commitnachweis-Härtung), #222 (Nachweisvertrag + Werkzeug,
  4 Reviewdurchgänge), #219 (Kapazitätsfix globaler Abrufpfad), #220/#221 (Profilreife),
  #211–#214 (Fairness/K2.1/Timing), #199–#201 (R-6/K1/K2.1), #204–#209 (Mail/F-CAS/Kalender).
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
  das K2-Gate meldet keinen Widerspruch mehr. Insgesamt 8 Profile;
  `angela-merkel`/`james-brown`/`max-mustermann` deaktiviert (OP-04-Rest);
  **0 Testmandate, 0 Landtagsprofile**.
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
- **Crons:** 9 Vercel-Einträge unverändert (crawl 04:00/20:00 · pipeline 16:00 ·
  morning-briefing 05:00 · understanding 05:30/21:30 · lage-briefing 05:45 · health 06:00 ·
  lage-check 10:00 UTC, `vercel.json`). **Dazu ein vierter, planmäßiger Regel-Slot:** der
  GitHub-Actions-Watchdog (`briefing-watchdog.yml`) feuert täglich 05:30 UTC
  **bedingungslos** die volle Pipeline; GitHub verzögert regelmäßig um 2–3 h. Er ist
  **kein Störfall**, aber im Aufbewahrungsvertrag nicht modelliert (→ K3/K7).
- **Migrationen:** offen ist **nur noch `20260720`** (gehört zu OP-03). `20260721` seit
  2026-07-16 angewendet, `20260727` und beide `20260728` angewendet und verifiziert.
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

## 6 · Offene Pull Requests (gegen GitHub geprüft 2026-08-05)

| PR | Inhalt | Einschätzung |
|---|---|---|
| **#224** (Draft) | F-E2E: Lage-Rangfolge aus berechnetem Rang statt Ablage | behauptet die Behebung des CI-Nichtdeterminismus F-E2E; **nicht reviewt, nicht abgenommen** |
| **#225** (Draft) | „Produktroadmap für LINIE" | nicht aus dem Helmut-Arbeitsstrang; Einordnung beim Betreiber |
| **#218** | OP-25-Kapazität, konkurrierende Analyse | Codeänderung auf dem Branch zurückgenommen; Ursache/Fix kamen über #219. **Empfehlung: schließen** |
| **#216** | flackernden `werkzeug-lesefehler-test.js` stabilisieren (F-PORT) | offen, reserviert als OP-28 |

Alle übrigen früher geführten PRs sind gemergt oder geschlossen (zuletzt **#229 gemergt
2026-08-06** — Production-Deployment der K1–K8-Korrekturen; davor #228 und #227
gemergt 2026-08-05; #203 geschlossen 2026-08-03). Historie: Archiv.

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

## 7a · Kapazitätsgrenze und OP-30 (Stand 2026-08-08)

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

**Befund.** Der V3-Motorkern skaliert (ein Dokument wird global **einmal** verstanden;
Matching, Entscheidungen und Briefing sind KI-frei). Die Grenze liegt **davor**: jedem Profil
werden 7–8 eigene Google-Wege vorangestellt; Kipppunkt **n ≈ 14–15**, zweite Schranke
**~16–17 Mandate je Lauf**. **Zurückgezogen:** „V3 ist für 1000 Mandate konzipiert" und
„Skalierungsnachweis für 200 Mandate liegt vor". **Folge:** empfohlene Obergrenze bis zur
Umsetzung **10 Mandate**.

**Was lokal gebaut und bewiesen ist** (Arbeitsbaum `/home/user/helmut-scaling`, Basis `a07954d`):

- **Warteschlange, Worker, KI-Budget, Relevanzordnung** — vollständig, getestet, **alle Flags
  aus**, vier Migrationspaare **nicht angewendet**. `main` ist unverändert.
- **200 Mandate im simulierten Tag** (`lokal simuliert`): letzte Pflichtarbeit **21:38:00**.
  Bedarf **1 645** KI-Aufrufe/Tag · Empfehlung mit 30 % Reserve **16 300** · **0,61 USD je
  Mandat/Monat** (Preisbasis **unbelegt**). **Mit Deckel 100 reicht es nicht** — 100 von 200
  bedient, der Rest bleibt sichtbar liegen.
- **1 000 synthetische Mandate** (`lokal simuliert`): 1 000 Briefings, alle belegt,
  Pflichtarbeit im Tag beendet, max. Warteschlange 7 839 Zeilen.
- **Durchsatz** (`lokal bewiesen`): 1 Worker 1 064,6 Aufträge/s, 8 Worker 4 093,1; harter
  Absturz ohne Verlust und ohne Doppelabschluss ⇒ **die Warteschlange ist nicht der Engpass**.
- **Vercel trägt keinen langlaufenden Worker** (`maxDuration 300`) ⇒ nur begrenzte Durchläufe
  je Cron-Fenster. Mehr Durchsatz ist eine **Betreiberentscheidung**.
- **Lokaler Production-Schutz** (`lokal bewiesen`, 76 PASS): zwei Schichten, an alle
  Unterprozesse vererbt. Anlass war ein **unbeabsichtigter lesender Production-Zugriff**, den
  ich offengelegt habe. **Production lädt den Schutz nie.**
- **`HELMUT_RELEVANZORDNUNG` ist default AUS**, fail closed; **Merge-Neutralität belegt**
  (26 PASS) — ein Merge verändert das Verhalten nicht.

**Abschlussreview (2026-08-08, unabhängig und adversarial, `6d54dbb`).** Verhaltensneutralität
bestätigt (eigene Flagmatrix 23/23; Module ohne Ladeeffekte; `planeArbeit`/`arbeite` bei Flag
AUS mit 0 Berührungen; keine automatische Migration). **12 Befunde behoben**, davon **einer
kritisch und sechs hoch** — alle ausschließlich im ausgeschalteten OP-30-Pfad:
Dokumentkennung `raw-…` statt `rd-…` (der Pfad hätte **nie** ein Dokument verstanden und das
als Erfolg gemeldet) · Rückstandsalarm durch Zurückstellen löschbar (falsches Grün, an echter
DB gemessen: 72 h ⇒ 0 h) · `buildV3Briefing` nicht auflösbar (Briefingstufe tot) · deaktivierte
Mandate wären geplant worden · reservierte, nie bearbeitete Aufträge verbrannten Versuche ·
**drei der „vier Merge-Neutralitätsbeweise" waren Tautologien** (falsche Funktion geprüft).
Migration → wiederholen → Rollback → wiederholen → erneut anwenden: **21 Schritte fehlerfrei**;
Reihenfolgefehler brechen vollständig ab. Mutationsproben zu jeder Korrektur **rot**.
**24 weitere Befunde sind benannt, aber bewusst nicht geändert** (O1–O24, §2.2 des Belegs) —
darunter: **Mandantenanteil und faire Rotation sind gebaut, aber im Produktionspfad nicht
verdrahtet**, und **`worker-betrieb.js` ist im Betrieb tot**. Beides ist vor der ersten
Aktivierung zu entscheiden.

**Offen.** Echte Google-/KI-Laufzeit · wirksamer Production-Deckel (offline nicht lesbar) ·
**190 fehlende echte Profile** (es gibt 10) · Migration, Aktivierung, Production-Nachweis ·
O1–O5 vor der Aktivierung. **CI der PR ist grün** (Lauf `31280498362`: `225/225`); die früher
notierte Rotstellung am Basisstand besteht dort nicht mehr.

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

**Der OP-25-Production-Nachweis ist bestanden** (drittes Fenster, §7.7.9). Nächste
Entscheidungen liegen beim Betreiber:

1. **Über den Merge von PR #233 (OP-30-Skalierungsgrundlage) entscheiden.** Der
   unabhängige Abschlussreview ist durch (§7a): kein offener kritischer oder hoher Befund,
   keine neue Regression, beide Pflichtchecks grün, konfliktfrei. Verhaltensneutral (alle
   Flags aus, keine Migration angewendet) — der Merge bleibt trotzdem ein
   Production-Deployment. **Aktivierung ist ein davon getrennter, späterer Schritt**; vorher
   sind O1–O5 aus dem Reviewbeleg zu entscheiden.
2. Entscheidung, ob `HELMUT_CRON_GLOBALABRUF` dauerhaft `on` bleibt (Betreiberbestätigung
   2026-08-08: steht in Production auf `on`; der Kontextpfad ist Production-belegt) — jede
   Änderung ist freigabepflichtig.
3. OP-25-Restpunkte (Abdeckungsmessung, Abdeckungsalarm, R-1, R-3) und OP-14 weiter
   in der Restliste; **nach OP-30-Aktivierung: OP-25 vollständig wiederholen**.

Parallel und unabhängig: **OP-01-Entscheidung** (Pro + PITR); **OP-11** Branch Protection
verifizieren (2 Minuten); Empfehlung zu **#218** umsetzen (schließen).

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
| Roadmap Phase 1 | [`roadmap/phase_1_checkliste.md`](roadmap/phase_1_checkliste.md) |
| Mail | [`betrieb/mailversand-resend.md`](betrieb/mailversand-resend.md) · [`betrieb/lokale-mailtests-mailpit.md`](betrieb/lokale-mailtests-mailpit.md) |
| **Vollständige Historie bis `4594fea`** | [`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md) |

## 14 · Letzte relevante Sprints (Kurzüberblick, neueste zuerst)

| Datum | Sprint | Ausgang |
|---|---|---|
| 2026-08-08 | **Unabhängiger adversarialer Abschlussreview von PR #233** (`6d54dbb`): Verhaltensneutralität eigenständig belegt (Flagmatrix 23/23, keine Ladeeffekte, keine automatische Migration); **12 Befunde behoben** (1 kritisch, 6 hoch) — u. a. Dokumentkennung `raw-…` statt `rd-…`, durch Zurückstellen löschbarer Rückstandsalarm, nicht auflösbares `buildV3Briefing`, mitgeplante deaktivierte Mandate, drei tautologische Merge-Neutralitätsbeweise; **16 Befunde benannt, nicht geändert**; Migration/Rollback **21 Schritte** an echter PostgreSQL 16.13; Mutationsproben rot; `HELMUT_CRON_GLOBALABRUF` im Env-Inventar auf **`on`** korrigiert (Betreiberbestätigung) · Beleg [`betrieb/op30-abschlussreview-2026-08-08.md`](betrieb/op30-abschlussreview-2026-08-08.md) | **teilweise abgeschlossen** (Merge-Empfehlung ausgesprochen; Merge, Aktivierung und Production-Nachweis bleiben Betreiberentscheidung) |
| 2026-08-08 | **OP-25 drittes Nachweisfenster + finale Auswertung**: Aktivierung `dpl_AdZ4JJ…` (`a07954df`, Merge PR #232 mit Kostenlücken-Fix) READY 07.08. 20:19:06Z, Baseline +160 s, Schutzfenster gehalten (nur PR-#233-Preview, kein Production-Deployment), Auswertung 21 min nach Fensterende → **BESTANDEN (Exit 0, null Befunde)**; Kosten 0,2106 USD, unbepreist 0 | **erfolgreich** — Nachweis gilt nur für die 5-Mandate-Architektur; nach OP-30-Aktivierung Wiederholung nötig; Doku über PR #234 in `main` |
| 2026-08-08 | **OP-30 Prüf-, Commit- und PR-Sprint**: die fünf lokal roten Suiten endgültig bewertet (4 Baseline-Fehler + 1 fehlende lokale Voraussetzung, **keine Regression, keiner blockiert CI**); **eigene Regression behoben** — der Production-Schutz hätte das CI-Gate abgebrochen, `ci.yml` erklärt jetzt `HELMUT_SOURCE_MODE=off`; Befund: **CI ist am Basisstand auf `main` bereits rot** (andere Suiten, lokal grün, nicht durch OP-30); Offline 220/225 + Browser 32/32; Commits und PR erstellt · Beleg [`betrieb/op30-testbefunde-2026-08-08.md`](betrieb/op30-testbefunde-2026-08-08.md) | **teilweise abgeschlossen** (reviewbereit; Merge, Production-Nachweis und CI-Klärung offen) |
| 2026-08-08 | **OP-30, drei lokale Sprints an einem Tag** (isolierte Arbeitsbäume, kein Commit): Umsetzung (Warteschlange, Migrationen, Source-Demand, Worker, Flag default aus) · Abnahme (Rechengrundlage 5/200/1000, Relevanzordnung, Bereinigung, Profilinventar; drei Produktfehler behoben; **ein unbeabsichtigter lesender Production-Zugriff offengelegt**) · Korrektur (**200 Mandate im Tag**, letzte Pflichtarbeit 21:38:00; Relevanzordnung auf default AUS; zweischichtiger Production-Schutz). Vollständige Berichte: die Belegdateien in §7a | **teilweise abgeschlossen** (lokal bewiesen; Migration, Aktivierung, Production-Nachweis und 190 echte Profile offen) |
| 2026-08-08 | **V3-Skalierungsprüfung** (rein lesend): Productionpfad nachgezeichnet, Kapazität aus echtem Code hochgerechnet ⇒ neuer Punkt **OP-30**; zwei frühere Behauptungen zurückgezogen; Beleg [`betrieb/v3-skalierungspruefung-2026-08-08.md`](betrieb/v3-skalierungspruefung-2026-08-08.md) | **erfolgreich** (Umsetzung ist Gründerentscheidung) |

Die OP-25-Sprints vom 2026-08-01 bis 2026-08-08 (Fenster 1–3, Korrektursprint K1–K8, Ursachenanalyse, Betreiberschritte K2/K3, Befundsprint Kostenlücke) stehen vollständig und kanonisch in [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.5–§7.7.9; Sprints bis einschließlich 2026-07-31 sowie ältere Berichte, Testzahlen und Beweisketten: **Archiv**
([`archive/project_state/2026_08_05_CURRENT_STATE_full.md`](archive/project_state/2026_08_05_CURRENT_STATE_full.md)).
