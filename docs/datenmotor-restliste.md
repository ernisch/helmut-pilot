# Helmut Datenmotor — VERBINDLICHE KONSOLIDIERTE RESTLISTE

| | |
|---|---|
| **Stand / Prüfdatum** | **2026-07-17** |
| **Geprüfter Stand** | `main`-HEAD `7346653` (Merge PR #100) = Production-Codebasis |
| **Grundlagen** | PR #95–#100, `docs/betrieb/production_beweisprotokoll.md`, `docs/helmut_datenmotor_thread2_handoff.md` §0a, `docs/quellenarchitektur/00-master-status.md` (Nachtrag 2026-07-17), Audit-Serie |

> **Dies ist die EINZIGE verbindliche Liste aller offenen Punkte des Datenmotors.**
> Sie konsolidiert: offene Production-Beweise, Betriebsbefunde, Freigabepunkte und
> deaktivierte Funktionen. Ältere Freigabe-/Restlisten (`docs/freigabepunkte.md`,
> Thread-2-Freigabeübersicht, Readiness-Verdicts, Sprint-Abschlussberichte) sind
> **historisch** und dürfen nicht mehr als aktueller Stand zitiert werden.
> Jeder offene Punkt trägt genau eine eindeutige **OP-Nummer**; OP-Nummern werden
> nie wiederverwendet.

---

## 1 · Nummernschema — Auflösung der F-/P-Kollisionen (Umbenennung, verbindlich)

Bisher existierten **zwei kollidierende F-Schemata** und **drei kollidierende
P-Schemata**. Ab sofort gilt genau EIN Schema:

- **OP-xx** — offener Punkt dieser Restliste (einzige gültige Kennung für offene Arbeit).
- **P0–P3** — nur noch als **Prioritätsklasse** dieser Restliste
  (P0 Verkaufsblocker · P1 Betriebsreife · P2 Produktqualität · P3 spätere Erweiterungen).
- **A-P0-x…A-P3-x** — die *Aufgaben-IDs des Datenmotor-Umsetzungsplans*
  (`docs/helmut_datenmotor_umsetzungsplan.md`) werden bei künftiger Referenz mit
  Präfix „A-" zitiert (z. B. **A-P1-7**), um sie von den Prioritätsklassen zu trennen.
  In den historischen Dokumenten selbst bleiben sie unverändert (P0-1…P3-10).
- **FA-x** — die *Alt-Freigabepunkte* der Sprint-Serie (`docs/freigabepunkte.md`,
  früher „F1–F13") heißen jetzt **FA-1…FA-13**.
- **FT2-x** — die *Thread-2-Freigaben* (Freigabe-Übersicht
  `docs/visual/helmut_datenmotor_thread2_freigabe.*`, früher ebenfalls „F1–F8")
  heißen jetzt **FT2-1…FT2-8**.

### Umbenennungstabelle FA (Alt-Freigabepunkte, Sprint-Serie 2026-07-15)

| Neu | Früher | Inhalt | Stand |
|---|---|---|---|
| FA-1 | F1 | PILOT_SECRET rotieren | ✅ ausgeführt 2026-07-15 |
| FA-2 | F2 | Git-Historie bereinigen | offen → **OP-20** |
| FA-3 | F3 | Cron-Reihenfolge Morgenablauf | offen → **OP-16** |
| FA-4 | F4 | Morgen-Push alle Profile | ✅ gegenstandslos (Mandantenneutralisierung) |
| FA-5 | F5 | LLM-Tageslimit (100 + Reserve 30 + Lock) | ✅ vollständig live |
| FA-6 | F6 | Budget fail-closed | ✅ live |
| FA-7 | F7 | Supabase Pro + PITR | offen → **OP-01** |
| FA-8 | F8 | Weitere Secret-Rotation nur bei Verdacht | ✅ keine Aktion nötig |
| FA-9 | F9 | Rechtliche Festlegungen (Anwalt/DSB) | offen → **OP-02** |
| FA-10 | F10 | Merge Readiness-Branch | ✅ historisch erledigt |
| FA-11 | F11 | Branch Protection aktivieren | unbestätigt → **OP-11** |
| FA-12 | F12 | Migration atomare LLM-Budget-Reservierung | ✅ ausgeführt 2026-07-15 |
| FA-13 | F13 | Mandantenneutraler Stand (keine Mandanten-Env) | ✅ erledigt (PR #97); Daten-Hygiene → **OP-04** |

### Umbenennungstabelle FT2 (Thread-2-Freigaben 2026-07-16)

| Neu | Früher | Inhalt | Stand |
|---|---|---|---|
| FT2-1 | F1 | Deploy Feature-Branch (P0/P1-Härtung) nach `main` | ✅ live (PR #95) |
| FT2-2 | F2 | Migration `20260719` + `HELMUT_ATOMIC_LOCK` + `HELMUT_UNDERSTANDING_LOCK` | ✅ live seit 2026-07-16 18:06 UTC, production-bewiesen |
| FT2-3 | F3 | Migration `20260718` + `HELMUT_SOURCE_TELEMETRY` | ✅ live, production-bewiesen (145 Zeilen/Crawl) |
| FT2-4 | F4 | KO-Klassifikations-Backfill ausführen | offen → **OP-08** |
| FT2-5 | F5 | `HELMUT_MONITORING_WEBHOOK_URL` + `health-watch.yml`-Schedule | offen → **OP-07** |
| FT2-6 | F6 | `HELMUT_FAILED_KO_RECOVERY=on` | offen → **OP-13** |
| FT2-7 | F7 | `HELMUT_UNDERSTANDING_PRIORITY=on` | offen → **OP-14** |
| FT2-8 | F8 | Crawl-Läufe relational (Migration `20260720`) + Retention | offen → **OP-17** / **OP-12** |

### Kollidierende P-Schemata (historisch, nicht mehr verwenden)

| Historisches Schema | Fundort | Status |
|---|---|---|
| Datenmotor-Aufgaben P0-1…P3-10 | Audit/Umsetzungsplan/Handoff (2026-07-16) | gültig als **A-P0-x…A-P3-x**; P0/P1 vollständig umgesetzt (Handoff §0a) |
| Multitenancy-Sprint P0-1/P0-2/P2-5 … | `docs/readiness-verdict-2026-07.md` u. a. | **historisch**, nicht mehr referenzieren |
| Quellenarchitektur-Projektschritte P6–P14 | `docs/quellenarchitektur/00-master-status.md` (ältere Abschnitte) | **historisch**, nicht mehr referenzieren |

---

## 2 · Ist-Stand kompakt (was heute nachweislich läuft)

- **Live & bewiesen (Production-Messwerte):** echte Laufzeitmessung (A-P0-1),
  Diagnosefeld-Persistenz (A-P0-2), atomare fail-closed Locks inkl.
  Understanding-Lock (A-P0-4, FT2-2), Pro-Quellen-Telemetrie (FT2-3, je Crawl 145
  Zeilen inkl. Fehlerklassifikation), ehrlicher Durchsatz (A-P1-5), ausgebauter
  Health-Report (A-P1-6), Radar-Störungswahrheit (A-P1-8), Ebenen-Kanon (A-P1-2),
  Blob-Retry/Backoff (A-P0-5 Stufe 1), Budget 100/Reserve 30/fail-closed (FA-5/6/12).
- **Live seit PR #96/#97:** vollständige Tenant-Guards + Cross-Tenant-Write-Guard,
  idempotente Zweitmandanten-Provisionierung, Mandantenneutralisierung (kein
  Pilot-/Default-/Fallback-Mandant, Crons über alle aktiven DB-Mandate, isoliert).
- **Gebaut, bewusst AUS (je eigene Freigabe):** siehe §5 (deaktivierte Funktionen).
- **Betrieb:** Quellen **on** · Gate **shadow** · PARDOK **shadow** · Scoring **off** ·
  BE/BB **inaktiv** · 0 neue `systemErrors` im gesamten Beweiszeitraum.

---

## 3 · Offene Production-Beweise (Übersicht)

| Beweis | Warum offen | → OP |
|---|---|---|
| Lock-**Deny-Pfad** unter echter Konkurrenz (2. Lauf wird abgewiesen) | kein konkurrierender Zweitlauf im Beweiszeitraum; bewusster Doppelstart verboten | OP-09 |
| **Fehlerfall** → `systemErrors`-Eintrag + Alarm | keine echte technische Störung im Beweiszeitraum; künstliche Injektion verboten | OP-10 |
| **Zweitkanal-Zustelltest** (Webhook real zugestellt) | braucht FT2-5-Aktivierung | OP-07 |
| **Backfill-Idempotenz auf Prod** (Zweitlauf = 0 Änderungen) | braucht FT2-4-Ausführung | OP-08 |
| **Quellen-Dubletten-Freiheit** nach Mandantenneutralisierung (Telemetrie: Zeilen = distinct `source_id`) | Nachweis am nächsten regulären Crawl nach PR #97-Deploy dokumentieren | OP-19 |
| **Recovery-Wirkung** (6 Alt-Fälle `complete`, mit Rollback-Kennung) | braucht OP-05-Freigabe | OP-05 |

## 4 · Betriebsbefunde (Übersicht)

| Befund | Stand | → OP |
|---|---|---|
| **B1** — Google-News-Rate-Limiting degradierte den 20:00-Crawl (129/145) | transient, per Gegenprobe erholt (volumeninduziert); **latentes Klumpenrisiko bleibt**; Zusatzbefund: täglicher, jüngster-Crawl-basierter Watchdog übersieht selbst-erholte Degradationen zwischen zwei Reports | OP-15 (Minderung), OP-07 (Alarm-Lücke) |
| **B2** — Understanding-Rückstand (50 `pending` + 2 `failed`, eingefroren 02./03.07.) | forensisch aufgelöst (PR #98): kein laufender Verlust, aber ~8 kernmandatsrelevante Fälle + 2 `failed` blockiert; Verlust aktuell reversibel, wird bei Retention-Löschung permanent | OP-05, OP-06, OP-12 |
| Katalog-Dublette der Personen-News-Quelle (2 Abrufe/Crawl) | strukturell behoben durch Mandantenneutralisierung (Code-Seed ohne Personenquellen); Live-Nachweis offen | OP-19 |

## 5 · Deaktivierte Funktionen / nicht angewandte Migrationen (vollständig)

| Funktion / Migration | Default | → OP |
|---|---|---|
| `HELMUT_MONITORING_WEBHOOK_URL` (Zweitkanal) + `health-watch.yml`-Schedule | nicht gesetzt / kein `schedule:` | OP-07 |
| KO-Klassifikations-Backfill-Lauf (`workflow_dispatch`, Token `BACKFILL_KO_CLASSIFICATION`) | nie automatisch | OP-08 |
| `HELMUT_RECOVERY_EXECUTE` + Token `RECOVER_6_CONFIRMED` (Understanding-Recovery, 6er-Allowlist) | AUS | OP-05 |
| `HELMUT_FAILED_KO_RECOVERY` (+ `HELMUT_FAILED_KO_MAX_RETRIES`) | AUS | OP-13 |
| `HELMUT_UNDERSTANDING_PRIORITY` | AUS | OP-14 |
| `HELMUT_CRAWL_RUNS_RELATIONAL` + Migration `20260720` (nicht angewandt) | AUS | OP-17 |
| `HELMUT_RETENTION_EXECUTE` (echte Löschung) | AUS (nur Trockenlauf) | OP-12 |
| Migration `20260721` (DB-Härtung, Advisor-Fixes) | vorbereitet, nicht angewandt | OP-03 |
| `HELMUT_TENANT_LLM_CAP` (+ Limit-Envs) — Per-Mandant-Kostendeckel | AUS (verhaltensneutral) | OP-03 |
| `HELMUT_V3_LAZY_UNDERSTANDING` (Lazy-Pfad; Feldbug inzwischen gefixt) | AUS | — (nur bei Reaktivierung relevant) |
| Gate **on** / Cheap-Triage | shadow / aus | OP-18 |
| `HELMUT_SCORING_MODE=on` | off | OP-22 |
| Berlin/Brandenburg-Aktivierung + PARDOK-Live | inaktiv / shadow | OP-21 |
| Tenant-JWT-Modus (`HELMUT_TENANT_JWT_MODE`) | stillgelegt (wirkungslos) | OP-03 (Konzeptklärung) |

---

## 6 · Priorisierte Restliste

> Attribute je Punkt: **Status** · **Fehlender Beweis / Umsetzungsschritt** ·
> **Abhängigkeiten** · **Risiko** · **Parallelisierbarkeit** · **Freigabe erforderlich**.

### P0 — Verkaufsblocker

#### OP-01 · Supabase Pro + Point-in-Time-Recovery (früher FA-7) — DRINGEND
- **Status:** offen; Free-Plan = keine Backups; zentraler Blob ist Last-Write-Wins (irreversibler Totalverlust möglich). Übergangs-Runbook (manueller Export) existiert.
- **Fehlender Schritt:** Supabase-Dashboard → Billing → Pro (~25 $/Monat) → PITR aktivieren; danach eine Restore-Übung nach `docs/betrieb/backup-restore-runbook.md` dokumentieren.
- **Abhängigkeiten:** keine.
- **Risiko bei Nichtstun:** hoch — ein einziger fehlerhafter Blob-Write vernichtet den Betriebszustand unwiederbringlich; verkaufs-/pilotkritisch.
- **Parallelisierbarkeit:** vollständig parallel zu allem.
- **Freigabe:** **JA** (Kosten, Betreiber-Dashboard).

#### OP-02 · Rechtliche Festlegungen (früher FA-9): Pilotvereinbarung, AVV, DSFA, Art.-9-Grundlage, Retention-Fristen
- **Status:** offen; vollständige Entwürfe liegen unter `docs/recht/` (+ DSFA-Vorprüfung, Datenklassen-Matrix mit `knowledge_objects` als Art.-9-Daten).
- **Fehlender Schritt:** Anwalt/DSB-Prüfung und Unterzeichnung/Festlegung (inkl. verbindlicher Aufbewahrungsfristen als Voraussetzung für OP-12).
- **Abhängigkeiten:** keine technischen; blockiert OP-12.
- **Risiko bei Nichtstun:** hoch — kein rechtssicherer Verkauf/Pilotvertrag; DSGVO-Risiko bei Art.-9-Daten.
- **Parallelisierbarkeit:** vollständig parallel (externe Beteiligte).
- **Freigabe:** **JA** (Gründer + Anwalt/DSB).

#### OP-03 · Zweitmandanten-Freigabepaket (Sicherheits-Scharfschaltung vor dem ersten zahlenden Zweitmandanten)
- **Status:** offen; Provisionierung, Guards und Per-Mandant-Deckel sind gebaut und getestet (PR #96), aber: Migration `20260721` (DB-Härtung) **nicht angewandt**, `HELMUT_TENANT_LLM_CAP` **AUS**, DB-seitige Durchsetzung (RLS-Backstop vs. stillgelegter JWT-Modus, `main-auth`-Blob-Restlücke) nur als App-Schicht wirksam.
- **Fehlender Schritt:** (a) Migration `20260721` einspielen (Rollback + Runbook vorhanden), (b) `HELMUT_TENANT_LLM_CAP=1` + Limits setzen, (c) dokumentierte Entscheidung zur DB-seitigen Durchsetzung (Nachfolgekonzept für den stillgelegten JWT-Modus bzw. bewusste App-Guard-Akzeptanz) inkl. Schließung der `main-auth`-Blob-Restlücke, (d) Provisionierungs-Probelauf für einen Testmandanten dokumentieren.
- **Abhängigkeiten:** OP-01 empfohlen vorher (Backups vor Migrationen); OP-04 (saubere Mandantenbasis).
- **Risiko:** mittel — Migration additiv mit Rollback; zu niedrige Limits könnten Mandanten drosseln (bewusst freigabepflichtig).
- **Parallelisierbarkeit:** (a)–(d) untereinander sequenziell sinnvoll; als Paket parallel zu OP-05…OP-10.
- **Freigabe:** **JA** (Migration + Env + Grundsatzentscheidung).

#### OP-04 · Demo-Mandate deaktivieren/entfernen (Daten-Hygiene, Audit: „vor Vertrieb löschen")
- **Status:** offen; zwei Demo-Mandate existieren neben dem realen Mandanten; nach Entfernung entfällt zudem die Mandatsauswahl am Bare-Root-Aufruf.
- **Fehlender Schritt:** über das Provisionierungs-/Admin-Werkzeug deaktivieren/entfernen (reine Daten-Aktion, kein Deploy, kein Schema).
- **Abhängigkeiten:** keine; Teardown-Isolation ist getestet (PR #96).
- **Risiko:** niedrig — Werkzeug strikt gescoped; echter Mandant datengetrieben geschützt.
- **Parallelisierbarkeit:** vollständig parallel.
- **Freigabe:** **JA** (Production-Datenänderung).

### P1 — Betriebsreife

#### OP-05 · Understanding-Recovery der 6 bestätigten Alt-Fälle ausführen
- **Status:** vorbereitet (PR #98–#100): Pfad verdrahtet, doppelt gesperrt (Flag + Token), 6er-Allowlist, ≤ ~6 KI-Calls, additiv, Rollback-Kennung, `workflow_dispatch` registriert; Live-Recheck bestätigt alle 6 als netto-neu und rekonstruierbar.
- **Fehlender Schritt:** GitHub-Action `understanding-recovery.yml` mit Token `RECOVER_6_CONFIRMED` ausführen; Ergebnis (6 neue `complete`-KOs + Links, Idempotenz-Zweitlauf) im Beweisprotokoll dokumentieren.
- **Abhängigkeiten:** keine technischen; **muss vor jeder Retention-Löschung (OP-12) geschehen**, sonst permanent verlorene mandatsrelevante Fälle.
- **Risiko:** niedrig — eng begrenzt, additiv, Rollback = gezieltes Delete der gekennzeichneten Zeilen.
- **Parallelisierbarkeit:** parallel zu allem außer OP-12.
- **Freigabe:** **JA** (KI-Calls + Prod-Write).

#### OP-06 · Terminales Aussortieren der Rückstands-Reste (27 Rauschen + 5 Duplikate + Mehrdeutige)
- **Status:** offen; Klassifikation liegt vollständig vor (Forensik + Trockenlauf); ohne Aussortieren prüft der Cron die Fälle ewig neu.
- **Fehlender Schritt:** kontrolliertes Setzen auf `failed-final`/verworfen (idempotent, referenzintegritätssicher, gemäß Testliste der Analyse §8); 3 mehrdeutige Fälle manuell entscheiden.
- **Abhängigkeiten:** nach OP-05 (erst retten, dann aussortieren).
- **Risiko:** niedrig–mittel — Prod-Write; Fehlklassifikation würde einen relevanten Fall endgültig verwerfen (darum manuelle Liste).
- **Parallelisierbarkeit:** direkt nach OP-05 im selben Freigabefenster möglich.
- **Freigabe:** **JA** (Prod-Write).

#### OP-07 · Monitoring-Zweitkanal + Meta-Heartbeat aktivieren (früher FT2-5)
- **Status:** vorbereitet; Code live (fail-safe, Allowlist + Redaction), `health-watch.yml` bewusst ohne `schedule:`; Anleitung: `docs/betrieb/zweitkanal-alarm-vorbereitung.md`. Motivation verschärft durch B1-Zusatzbefund (Alarm-Lücke zwischen Tagesreports).
- **Fehlender Schritt:** geprüfte Webhook-URL bereitstellen → `HELMUT_MONITORING_WEBHOOK_URL` in Vercel setzen → Redeploy → `dryRun=1`-Verifikation → echten Zustellbeleg dokumentieren → `schedule:`-Cron in `health-watch.yml` ergänzen.
- **Abhängigkeiten:** keine.
- **Risiko:** gering — Payload datenschutzgehärtet; Kanalfehler kippen den Cron nicht.
- **Parallelisierbarkeit:** vollständig parallel.
- **Freigabe:** **JA** (Env + neuer Alarmkanal/Cron).

#### OP-08 · KO-Klassifikations-Backfill ausführen (früher FT2-4)
- **Status:** vorbereitet; Trockenlauf belegt, 0 KI-Calls, idempotent, dispatchbare Action mit harter Bestätigung.
- **Fehlender Schritt:** Action mit `BACKFILL_KO_CLASSIFICATION` ausführen; Beweis: alle Alt-KOs tragen Ebene + Feature-Vektor, Idempotenz-Zweitlauf = 0 Änderungen.
- **Abhängigkeiten:** keine (Ebenen-Kanon A-P1-2 ist live); sinnvoll **vor** OP-14.
- **Risiko:** sehr gering — deterministisch, kostenneutral.
- **Parallelisierbarkeit:** vollständig parallel.
- **Freigabe:** **JA** (Prod-Write).

#### OP-09 · Production-Beweis: Lock-Deny-Pfad unter echter Konkurrenz
- **Status:** offen; fail-closed + Atomik sind auf Code- und DB-Ebene belegt, der Live-Deny (`acquired=false` beim echten Überlappungsfall) wurde noch nicht beobachtet.
- **Fehlender Schritt:** natürliche Cron-Überschneidung abwarten und den Deny-Log/`pipeline_locks`-Zustand im Beweisprotokoll dokumentieren (kein bewusster Doppelstart — verboten).
- **Abhängigkeiten:** keine.
- **Risiko:** keines (reine Beobachtung).
- **Parallelisierbarkeit:** passiv, parallel zu allem.
- **Freigabe:** **NEIN**.

#### OP-10 · Production-Beweis: Fehlerfall → `systemErrors` + Alarmpfad
- **Status:** offen; `recordPipelineError`-Pfad blieb im Beweiszeitraum unausgelöst (keine echte Störung; Injektion verboten).
- **Fehlender Schritt:** beim nächsten realen Quellen-/KI-/DB-Fehler den `systemErrors`-Eintrag (nur Metadaten) + Health-Report-Reaktion dokumentieren.
- **Abhängigkeiten:** OP-07 erhöht die Beweiskraft (Zweitkanal-Alarm sichtbar).
- **Risiko:** keines (reine Beobachtung).
- **Parallelisierbarkeit:** passiv, parallel zu allem.
- **Freigabe:** **NEIN**.

#### OP-11 · Branch Protection für `main` bestätigen bzw. aktivieren (früher FA-11)
- **Status:** unbestätigt — CI-Gate läuft je PR; ob die GitHub-Regel („Require status checks") aktiv ist, ist aus dem Repo nicht ablesbar.
- **Fehlender Schritt:** GitHub → Settings → Branches prüfen; falls fehlend, Regel nach `docs/betrieb/branch-protection.md` anlegen; Ergebnis hier vermerken.
- **Abhängigkeiten:** keine.
- **Risiko:** niedrig; ohne Regel kann ein roter PR gemergt werden.
- **Parallelisierbarkeit:** vollständig parallel.
- **Freigabe:** **JA** (Repo-Einstellung, Betreiber; 2 Minuten).

#### OP-12 · Retention/Löschung scharfschalten (Teil von früher FT2-8; DSGVO-Betriebsreife)
- **Status:** vorbereitet; Datenklassen-Matrix, Trockenlauf und Integritätsprüfung existieren; `HELMUT_RETENTION_EXECUTE` AUS; unbegrenztes Wachstum ist real gemessen.
- **Fehlender Schritt:** Fristen aus OP-02 übernehmen → Trockenlauf-Protokoll → `HELMUT_RETENTION_EXECUTE` aktivieren → ersten echten Löschlauf dokumentieren.
- **Abhängigkeiten:** **OP-02** (Fristen) und **OP-05/OP-06** (Alt-Fälle erst retten/aussortieren — sonst permanenter Verlust).
- **Risiko:** mittel — echte Löschung; durch Trockenlauf + Fristen-Freigabe kontrolliert.
- **Parallelisierbarkeit:** erst nach den Abhängigkeiten.
- **Freigabe:** **JA** (Gründer + Rechtsgrundlage).

### P2 — Produktqualität

#### OP-13 · `failed`-KO-Recovery aktivieren (früher FT2-6, A-P1-4)
- **Status:** Code live, Flag AUS; laut Forensik bewusst NICHT auf `pending`-Waisen ausweiten. Achtung: einer der 2 aktuellen `failed`-Fälle ist ein Duplikat-Risiko (würde doppeln — vorher OP-06).
- **Fehlender Schritt:** nach einem sauberen Beweistag `HELMUT_FAILED_KO_RECOVERY=1` setzen + Redeploy; Wirkung (bounded Retry → `complete`/`failed-final`) dokumentieren.
- **Abhängigkeiten:** empfohlen nach OP-05/OP-06.
- **Risiko:** gering — bounded, terminal, No-Op ohne Kandidaten.
- **Parallelisierbarkeit:** parallel zu OP-14…OP-20.
- **Freigabe:** **JA** (Env, Prod-KO-Writes).

#### OP-14 · Understanding-Priorisierung aktivieren (früher FT2-7, A-P1-3)
- **Status:** Code live, Flag AUS; KI-freie Umsortierung (amtlich > Relevanz > Frist > …), wirkt nur im Eager-Pfad.
- **Fehlender Schritt:** `HELMUT_UNDERSTANDING_PRIORITY=1` + Redeploy; an einem Budgetdeckel-Tag belegen, dass höchstpriorisierte Vorgänge zuerst verstanden werden.
- **Abhängigkeiten:** sinnvoll nach OP-08 (vollständiger KO-Bestand).
- **Risiko:** gering — reine Reihenfolgeänderung.
- **Parallelisierbarkeit:** parallel.
- **Freigabe:** **JA** (Verhaltensänderung).

#### OP-15 · Google-News-Klumpenrisiko mindern (Betriebsbefund B1)
- **Status:** offen; B1 war transient/volumeninduziert, das strukturelle Klumpenrisiko (viele Quellen über einen Google-News-Weg) bleibt latent.
- **Fehlender Schritt:** Kernquellen schrittweise auf Direkt-RSS umstellen (Audit-Minderung), beginnend mit den amtlichen/kuratierten Wegen; per Telemetrie nachweisen.
- **Abhängigkeiten:** keine; Telemetrie (live) liefert die Messbasis.
- **Risiko:** niedrig — additive Quellenpflege; jeweils per Crawl-Vergleich absichern.
- **Parallelisierbarkeit:** gut parallelisierbar (quellenweise).
- **Freigabe:** **JA** (Quellenkatalog-/Deploy-Änderung).

#### OP-16 · Cron-Reihenfolge Morgenablauf (früher FA-3)
- **Status:** offen; Morgen-Push (05:00 UTC) läuft weiterhin vor dem 05:30-Understanding — er verpasst systematisch die Tagesanalysen; exakte Diff-Vorbereitung liegt in `docs/freigabepunkte.md` (FA-3).
- **Fehlender Schritt:** eine Zeile `vercel.json` (z. B. `50 5 * * *`) per PR + Deploy; Push-Zeitpunkt mit dem Mandanten abstimmen.
- **Abhängigkeiten:** keine.
- **Risiko:** niedrig — reine Zeitverschiebung; Rückweg trivial.
- **Parallelisierbarkeit:** parallel.
- **Freigabe:** **JA** (Cron-Änderung).

#### OP-17 · Crawl-Läufe relational / Blob entlasten (früher FT2-8 Teil 1, A-P0-5 Stufe 2)
- **Status:** vorbereitet; Dual-Write-Code gemergt, Migration `20260720` nicht angewandt, `HELMUT_CRAWL_RUNS_RELATIONAL` AUS. Akutrisiko durch Stufe 1 (Retry/Backoff, non-lossy Retention) gemindert.
- **Fehlender Schritt:** Migration einspielen → Flag an → Dual-Write beobachten → Blob-Größen-Delta dokumentieren.
- **Abhängigkeiten:** OP-01 empfohlen vorher (Backups vor Migrationen).
- **Risiko:** mittel — berührt den zentralen Speicherpfad; darum Dual-Write-Übergang.
- **Parallelisierbarkeit:** eigenes Freigabefenster empfohlen.
- **Freigabe:** **JA** (Migration + Env).

#### OP-18 · Understanding-Gate scharfschalten (shadow → on) + Cheap-Triage
- **Status:** offen; Shadow-Betrieb seit Wochen fehlerfrei (0 amtliche fehlbehandelt, Ersparnispotenzial ~54 % der Dokumente belegt).
- **Fehlender Schritt:** Gate-Flag auf `on` (Datei-Flag oder Env) + definiertes Beobachtungsfenster (Understanding-Zahl darf nicht unplausibel sinken); Cheap-Triage separat entscheiden.
- **Abhängigkeiten:** keine technischen; Telemetrie/Beweisprotokoll als Messbasis.
- **Risiko:** mittel — erstmals blockierende Wirkung auf KI-Verarbeitung; Rollback per Flag.
- **Parallelisierbarkeit:** eigenes Beobachtungsfenster.
- **Freigabe:** **JA** (Verhaltensänderung mit Kosten-/Inhaltswirkung).

#### OP-19 · Production-Beweis: Quellen-Dubletten-Freiheit nach Neutralisierung
- **Status:** offen; die Katalog-Dublette der Personen-News-Quelle (doppelter Abruf je Crawl) ist durch PR #97 strukturell behoben; Live-Nachweis fehlt noch.
- **Fehlender Schritt:** am nächsten regulären Crawl per `source_crawl_telemetry` belegen: Zeilenzahl = distinct `source_id` (keine Doppel-Einreihung); im Beweisprotokoll nachtragen.
- **Abhängigkeiten:** keine.
- **Risiko:** keines (Beobachtung).
- **Parallelisierbarkeit:** passiv.
- **Freigabe:** **NEIN**.

#### OP-20 · Git-Historie bereinigen (früher FA-2)
- **Status:** offen/optional; der alte Pilot-Code ist seit FA-1-Rotation wertlos, bleibt aber in der Historie lesbar. **Zwingend vor Repo-Weitergabe an Dritte (Due Diligence/Dienstleister).**
- **Fehlender Schritt:** `git filter-repo`-Rewrite + koordinierter Force-Push (Backup-Klon vorher).
- **Abhängigkeiten:** keine offenen Branches im Flug (koordinieren).
- **Risiko:** mittel — Force-Push bricht offene Checkouts; mit Backup beherrschbar.
- **Parallelisierbarkeit:** eigenes Wartungsfenster.
- **Freigabe:** **JA** (Historie-Rewrite).

### P3 — Spätere Erweiterungen

#### OP-21 · Landtagsmodule Berlin/Brandenburg aktivieren (Serie A-P2-1…A-P2-6)
- **Status:** strukturell vorbereitet und nachweislich inert (Seeds `prepared`, 0 Abrufe live); PARDOK-Parser + Shadow-Modus getestet.
- **Fehlender Schritt:** nach dem Bundestagspiloten: Gate parametrisieren, PARDOK-Live-Ingest, Ebenen-Default entkoppeln, Landes-Kataloge, Seed-/Status-Flip.
- **Abhängigkeiten:** stabiler Bundestagsbetrieb; OP-18 sinnvoll vorher.
- **Risiko:** mittel (neuer Ingest-Pfad) — darum eigene Freigabe-Serie.
- **Parallelisierbarkeit:** Vorbereitungsarbeiten parallel; Aktivierung sequenziell.
- **Freigabe:** **JA** (E4).

#### OP-22 · Scoring scharfschalten (`HELMUT_SCORING_MODE`, E5)
- **Status:** off; Alt-Ranking byte-identisch aktiv.
- **Fehlender Schritt:** Kalibrierung + kontrollierte Aktivierung mit Vergleichsfenster.
- **Abhängigkeiten:** OP-08 (vollständige KO-Merkmale) sinnvoll vorher.
- **Risiko:** mittel — sichtbare Ranking-Änderung für Nutzer.
- **Parallelisierbarkeit:** eigenes Beobachtungsfenster.
- **Freigabe:** **JA** (E5).

#### OP-23 · Hygiene-Paket (Serie A-P3-1…A-P3-10, soweit offen)
- **Status:** offen (Sammelposten): Briefing→Decision relational verlinken, toten V2-KI-Pfad entfernen, Einmal-Module nach `scripts/one-off/`, Dead-Code-Scan in CI, Erwähnungs-Engines konsolidieren, `decisions`/`matching_results` bereinigen/nutzen (E6), Cron-DST-Entscheid, Boot-Zeit-Env-Selbstcheck, `document_type`-Befüllung.
- **Fehlender Schritt:** je Einzelpunkt kleiner PR; DST-Entscheid ist eine Zeitplan-Freigabe.
- **Abhängigkeiten:** keine harten.
- **Risiko:** niedrig (Hygiene), außer DST (Zeitplan).
- **Parallelisierbarkeit:** sehr gut (unabhängige Einzel-PRs).
- **Freigabe:** überwiegend **NEIN** (Code-Hygiene via normalem PR-Prozess); **JA** nur für DST/Cron und Datenbereinigungen.

---

## 7 · Historisch markierte Dokumente

Folgende Dokumente sind als **historisch** gekennzeichnet und verweisen auf diese
Restliste (sie bleiben als Belege erhalten, sind aber kein aktueller Stand mehr):

- `docs/AUDIT_DATENMOTOR_2026-07.md` (war bereits als überholt markiert)
- `docs/freigabepunkte.md` (Alt-Freigabepunkte → FA-Schema)
- `docs/readiness-verdict-2026-07.md` (altes P-Schema, Stand vor Sprint 1/Neutralisierung)
- `docs/helmut_datenmotor_thread2_handoff.md` §1–§10 (Arbeitsgrundlage Thread 2, abgearbeitet)
- `docs/visual/helmut_datenmotor_thread2_freigabe.html/.pdf` (Entscheidungsvorlage FT2, entschieden bzw. hier fortgeschrieben)
- ältere Nachträge in `docs/quellenarchitektur/00-master-status.md` sowie Doku 20–27 der Quellenarchitektur-Serie

_Erstellt 2026-07-17 auf Basis von Code (`main` `7346653`), gemergten PRs #95–#100,
Production-Beweisprotokoll und Audit-Serie. Reine Dokumentation — kein Code, keine
Datenbank, keine Workflows, keine Production-Konfiguration verändert._
