# Helmut Datenmotor — VERBINDLICHE KONSOLIDIERTE RESTLISTE

> # 🧭 RE-ANKER (Recovery Sprint R2, 2026-07-22)
>
> - **`main`-HEAD beim Re-Anker: `d6d9063`** (Merge #113). Die Pins `ca7e404`/#102 und
>   `7346653`/#100 unten sind **historische Stände**; der tatsächlich aktuelle `main`-HEAD
>   steht in der Tabelle unten unter „Geprüfter Stand" (fortlaufend nachgezogen).
> - **Quellenmodus `on` (Cutover ausgeführt 2026-07-15)** — kein offenes Quellen-Cutover-Gate.
> - **JWT-Selbstsignierung stillgelegt**, RLS **inert**, Mandantentrennung **App-seitig** —
>   verbindlich: `quellenarchitektur/05-sicherheitsmodell-rls.md`.
> - **OP-03** blockiert den Einzelpiloten nicht, ist aber **zwingend vor dem ersten echten
>   zahlenden Zweitmandanten**. **OP-04** (Demo-Mandate) bleibt offen.
> - **Scope:** dieses Dokument = offene Punkte; Sicherheit → `05-…`; Status → `00-master-status.md`.

| | |
|---|---|
| **Stand / Prüfdatum** | **2026-07-18** (Basisstand 2026-07-17, re-verankert 2026-07-22, siehe Banner; OP-05/06/08/13/14 nachgezogen durch den Pending/Understanding/KO-Sprint — Belege: `docs/betrieb/datenmotor_sprint_pending_understanding_ko.md`) |
| **Geprüfter Stand** | historisch `main`-HEAD `ca7e404` (Merge PR #102); Re-Anker (siehe Banner) `d6d9063` (#113); seither weiter nachgezogen (Pending/Understanding/KO-Sprint + Recovery-Stilllegung PR #105, Kontextstruktur PR #119, Doku-Nachzug PR #121) — **aktuell `045393c` (#121)** |
| **Grundlagen** | PR #95–#102, `docs/betrieb/production_beweisprotokoll.md` (inkl. §7 Google-News-Härtung), `docs/betrieb/google_news_haertung.md`, `docs/betrieb/health_report_rollierend.md`, `docs/betrieb/f5_freigabe.md`, `docs/helmut_datenmotor_thread2_handoff.md` §0a, `docs/quellenarchitektur/00-master-status.md` (Nachtrag 2026-07-17), Audit-Serie |

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
| FT2-4 | F4 | KO-Klassifikations-Backfill ausführen | ✅ ausgeführt 2026-07-16 + Idempotenz belegt → **OP-08 geschlossen** |
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
- **Auf `main` seit PR #102 (Code gemergt, offline getestet — NICHT production-bewiesen):**
  Google-News-Härtung (Provider-Gate/Retry/Backoff/Circuit-Breaker/Cooldown,
  Kill-Switch `HELMUT_GOOGLE_HARDENING`, **Default AN im Code**), ehrliche
  7-Zustands-Lauf-Klassifikation, rollierender Health-Report (schließt die
  B1-Alarm-Lücke im Code), `source_id`-Dubletten-Fix, gehärteter Monitoring-Webhook
  (Ereigniskennung/Dedupe/Retry/Zustellstatus/Heartbeat). **Offen:** Production-Beweisläufe
  + Aktivierungen (OP-07/OP-15/OP-19) — Merge ≠ Deploy-Beweis.
- **Gebaut, bewusst AUS (je eigene Freigabe):** siehe §5 (deaktivierte Funktionen).
- **Betrieb:** Quellen **on** · Gate **shadow** · PARDOK **shadow** · Scoring **off** ·
  BE/BB **inaktiv** · 0 neue `systemErrors` im gesamten Beweiszeitraum.

---

## 3 · Offene Production-Beweise (Übersicht)

| Beweis | Warum offen | → OP |
|---|---|---|
| Lock-**Deny-Pfad** unter echter Konkurrenz (2. Lauf wird abgewiesen) | kein konkurrierender Zweitlauf im Beweiszeitraum; bewusster Doppelstart verboten | OP-09 |
| **Fehlerfall** → `systemErrors`-Eintrag + Alarm | keine echte technische Störung im Beweiszeitraum; künstliche Injektion verboten | OP-10 |
| **Zweitkanal-Zustelltest** (Webhook real zugestellt) | Sender durch PR #102 gehärtet + offline getestet, aber `HELMUT_MONITORING_WEBHOOK_URL` unset (No-Op), kein `webhook.sent`-Beleg | OP-07 |
| **Backfill-Idempotenz auf Prod** (Zweitlauf = 0 Änderungen) | ✅ erbracht: echter Lauf 195/195 (Run 29511858469, 2026-07-16) + Zweitlauf `candidates: 0` (Run 29621926765, 2026-07-17) + SQL-Gegenprobe 0 Lücken | OP-08 ✅ |
| **Google-News-Härtung unter echter Drosselung** (Breaker/Gate/Cooldown greifen live) | #102-Härtung nur offline bewiesen; kein Production-Beweislauf unter realem Throttle | OP-15 |
| **Quellen-Dubletten-Freiheit** (Telemetrie: Zeilen = distinct `source_id`) | #102-Dedup-Fix nur offline bewiesen; Live-Nachweis am nächsten regulären Crawl noch offen (Invariante ersetzt „= 145", s. B3) | OP-19 |
| **Recovery-Wirkung** (Alt-Fälle `complete`, mit Rollback-Kennung) | teilerbracht: 1/6 recovert (`vg-sozialwohnungen`, `recovery:singledoc-29583280106`, 1 KI/1 KO/1 Link); Rest: 4 Fälle per Einzel-Doc-Pfad (Freigabe nötig), 1 Fall als Duplikat → OP-06 | OP-05 |

## 4 · Betriebsbefunde (Übersicht)

| Befund | Stand | → OP |
|---|---|---|
| **B1** — Google-News-Rate-Limiting degradierte den 20:00-Crawl (129/145) | transient, erholt (volumeninduziert); Provider-Ursache durch PR #102 **read-only bewiesen** (alle 129 Ausfälle Google, 3/3 direkte Quellen ok); **operative Härtung umgesetzt + offline getestet** (Gate/Retry/Breaker/Cooldown, Default AN), **aber nicht production-bewiesen**; die Alarm-Lücke (jüngster-Crawl-Blindheit) ist per rollierendem Health-Report **im Code geschlossen**, operativ erst nach OP-07-Aktivierung; **strukturelles Klumpenrisiko bleibt** (146/163 Wege Google) | OP-15 (Härtung + Struktur), OP-07 (Alarm-Aktivierung) |
| **B2** — Understanding-Rückstand (Live-Stand 2026-07-17: 49 `pending` + 4 `failed`) | forensisch aufgelöst (PR #98); Sprint-Nachtrag: `vg-sozialwohnungen` recovert (`recovery:singledoc-29583280106`); 2 **neue** `failed` vom 17.07. (netto-neu, OP-13-Kandidaten); vollständige Klassifikation aller 53 Fälle mit terminalem Behandlungspfad im Sprintbericht §2; Verlustrisiko der 4 Recovery-Restfälle bleibt bis Recovery, wird bei Retention-Löschung permanent | OP-05, OP-06, OP-12 |
| **B3** — Quellenzahl mandats-/profilabhängig (Demo-/Testmandat-Lauf: 139 statt 145 Quellen) | neu aus PR-#102-Analyse; feste Referenz „145" gilt nicht mehr — harte Invariante künftig `Zeilenzahl = distinct source_id` | OP-19 |
| Katalog-Dublette der Personen-News-Quelle (2 Abrufe/Crawl) | Ursache präzisiert (id-Kollision, nicht statischer Katalog); `source_id`-Dedup durch PR #102 umgesetzt + offline getestet; Live-Nachweis offen | OP-19 |
| **B4** — Vorgangsbildung verwirft Ereignisse lautlos bei `vorgang_id`-Kollision (Diagnose-Sprint 2026-07-26, CSD-2026-Fall) | **Ursache bewiesen, Reparatur umgesetzt, Production-Nachweis offen.** Diagnose: `deriveVorgangId()` reduzierte einen Cluster auf **ein einzelnes Wort**; traf dieses Wort ein bestehendes, thematisch fremdes KO, verwarf `understandOneCluster` den Cluster über `skipped-exists` — kein KI-Aufruf, kein `ko_document_links`-Eintrag, kein Fehler, kein Protokolleintrag. **Reparatursprint 2026-07-26:** fachliche Identität und technische Eindeutigkeit sind getrennt (Kennung = Vorschlag, Zugehörigkeit = Belegvergleich gegen echte Kandidaten), `skipped-exists` ist ersatzlos entfallen, jeder Ausgang ist klassifiziert, jeder verarbeitete Cluster schreibt `ko_document_links` (Endzustand ohne neue Tabelle ableitbar), zurückgestellte Cluster werden vorgemerkt **und** verknüpft, der Nachhollauf bildet Cluster aus den Verknüpfungen statt aus einer Neuclusterung. **Verlustumfang read-only verifiziert (7 Tage, 1 970 Rohdokumente): 47,3 % durch Kennungskollision — die 47 % sind bestätigt; der Gesamtverlust ist mit 76,3 % ohne nachvollziehbaren Endzustand deutlich höher.** Neues Verfahren: 0 Kollisionen, 252 Cluster schreiben einen Bestand fort. Kosten: Obergrenze 115 → 159 KI-Aufrufe/Tag bei Budget 100 — der Engpass bestand vorher, wird jetzt sichtbar und nachholbar. Details, Nachweisplan und Freigabeanfrage: [`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md) §9–§13 | **OP-14 wird durch den Kostenbefund dringlich** (Reihenfolge entscheidet jetzt über Qualität). Offen: Merge/Deployment + 24-h-Nachweis; **getrennt** freizugeben das Nachholen des Altbestands (1 504 Dokumente, Kostenentscheidung) |

## 5 · Deaktivierte Funktionen / nicht angewandte Migrationen (vollständig)

| Funktion / Migration | Default | → OP |
|---|---|---|
| `HELMUT_MONITORING_WEBHOOK_URL` (Zweitkanal, durch PR #102 gehärtet: Ereigniskennung/Dedupe/Retry/Zustellstatus/Heartbeat) + `health-watch.yml`-Schedule | nicht gesetzt / kein `schedule:` (Sender ist No-Op ohne URL) | OP-07 |
| KO-Klassifikations-Backfill-Lauf (`workflow_dispatch`, Token `BACKFILL_KO_CLASSIFICATION`) | ✅ ausgeführt 2026-07-16 (bleibt für künftige Bestände dispatchbar; Zweitlauf = No-Op belegt) | OP-08 ✅ |
| OP-06-Aussortier-Lauf (`workflow_dispatch`, Token `AUSSORTIEREN_34_BESTAETIGT`, Flag `HELMUT_PENDING_TERMINAL_EXECUTE`) | AUS / nie automatisch (vorbereitet durch Pending-Sprint) | OP-06 |
| `HELMUT_RECOVERY_EXECUTE` + Token `RECOVER_6_CONFIRMED` (anker-basierte Understanding-Recovery) | **STILLGELEGT und auf `main` durchgesetzt** (PR #105, gemergt 2026-07-25, `43e9e35`): Action `understanding-recovery.yml` entfernt, Execute-Skript = reiner Stilllegungs-Hinweis, `RECOVERY_ALLOWLIST` leer — Flag+Token sind wirkungslos; ein namensunabhängiger CI-Riegel blockiert die Wiederbelebung auch über einen umbenannten Workflow. Grund: Anker-Pfad erzeugte Multi-Themen-Digest (Lauf `rec-29569461715`, zurückgerollt). Ersatz: Einzel-Doc-Pfad, siehe OP-05 | OP-05 |
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
- **Status:** offen; **Umfang am 2026-07-25 read-only nachgemessen und größer als bisher geführt.** Production hält **8 Mandatsprofile, davon 6 aktiv** — nicht „zwei Demo-Mandate neben dem realen Mandanten". Fünf der Profile wurden am 20.07. angelegt und tragen Klarnamen realer Bundestagsabgeordneter; jedes aktive Profil erzeugt Crawl-Last und eigene profilgenerierte Personensuchen (belegt in `docs/quellenarchitektur/30-paket-inventur-production.md` §5, Abweichung A-1). Nach Entfernung entfällt zudem die Mandatsauswahl am Bare-Root-Aufruf.
- **Fehlender Schritt:** je Profil entscheiden (behalten / deaktivieren / löschen) und über das Provisionierungs-/Admin-Werkzeug umsetzen (reine Daten-Aktion, kein Deploy, kein Schema). **Rechtlicher Nebenaspekt:** personenbezogene Daten realer Abgeordneter ohne Mandatsverhältnis berühren OP-02.
- **Abhängigkeiten:** keine; Teardown-Isolation ist getestet (PR #96).
- **Risiko:** niedrig — Werkzeug strikt gescoped; echter Mandant datengetrieben geschützt.
- **Parallelisierbarkeit:** vollständig parallel.
- **Freigabe:** **JA** (Production-Datenänderung).

### P1 — Betriebsreife

#### OP-05 · Understanding-Recovery der bestätigten Alt-Fälle ausführen (Stand korrigiert 2026-07-18)
- **Status:** **teilerledigt, Pfad gewechselt.** 1/6 recovert und bewiesen (`vg-sozialwohnungen` per Einzel-Dokument-Recovery `singledoc-29583280106`: 1 KI/1 KO/1 Link, Rollback-Kennung). Der frühere **anker-basierte** 6er-Lauf `rec-29569461715` erzeugte einen 3-Themen-Digest und wurde sauber **zurückgerollt** — der Anker-Pfad ist für Multi-Doc-Fälle ungeeignet und ist seit PR #105 (gemergt 2026-07-25, `43e9e35`) auf `main` **hart stillgelegt** (Action entfernt, Execute-Skript = Stilllegungs-Hinweis, Allowlist leer; Ersatz: Einzel-Doc-Pfad des Branches `claude/helmut-datenmotor-impl-2-kd1jl9`, ungemergt). `vg-psychotherapie` ist als **echtes Duplikat** live verifiziert → nach OP-06 verschoben.
- **Fehlender Schritt:** Einzel-Doc-Recovery der **4 Restfälle** (`vg-arbeitsverträge`, `vg-medikamenten`, `vg-steuerstrafrecht`, `vg-umstellungen`) — je exakte `raw_document_id` (read-only identifiziert: Sprintbericht §4); je 1 KI-Call, additiv, Rollback-Kennung; danach Beweisprotokoll-Eintrag.
- **Abhängigkeiten:** Merge/Erweiterung des Einzel-Doc-Pfads (impl-2-Branch); **muss vor jeder Retention-Löschung (OP-12) geschehen**, sonst permanent verlorene mandatsrelevante Fälle.
- **Risiko:** niedrig — eng begrenzt, additiv, Rollback = gezieltes Zurücksetzen der gekennzeichneten Zeilen (Verfahren belegt durch den durchgeführten Rollback von `rec-29569461715`).
- **Parallelisierbarkeit:** parallel zu allem außer OP-12.
- **Freigabe:** **JA** (KI-Calls + Prod-Write; je Fall exakte `raw_document_id`).

#### OP-06 · Terminales Aussortieren der Rückstands-Reste (Stand 2026-07-18: 27 Rauschen + 7 belegte Duplikate)
- **Status:** **vorbereitet + offline getestet (Pending-Sprint), NICHT ausgeführt.** Werkzeug fertig: `lib/helmut/pending-terminal.js` (34er-Allowlist, jede Duplikat-Behauptung per SQL live verifiziert), doppelt gesperrtes Skript + Action `pending-terminal-aussortieren.yml` (Default read-only), konditionale PATCHes mit Rollback-Kennung `aussortiert:<runId>:<vorstatus>`, 0 KI, kein Delete; 63 Offline-Assertions. Zusätzlich geschlossen: die `failed-final`-Lücke (Pending-Filter + `understandOneCluster` griffen Terminal-Fälle wieder auf — jetzt „nie wieder" garantiert). Freigabevorlage: `docs/betrieb/pending_terminal_aussortierung.md`.
- **Fehlender Schritt:** nach Merge des Sprint-PRs die Action mit Token `AUSSORTIEREN_34_BESTAETIGT` ausführen; Nachweise (34 Writes, SQL-Gegenprobe, Idempotenz-Zweitlauf) dokumentieren. Getrennt: Betreiber-Entscheid über die 10 Ermessensfälle (Kat. 2) + 2 manuelle Fälle (`vg-krankschreibung`, `vg-privatsieren`) — zweite Tranche oder Einzel-Doc-Recovery.
- **Abhängigkeiten:** empfohlen nach OP-05-Rest (erst retten, dann aussortieren); Allowlisten sind disjunkt — kein technischer Zwang.
- **Risiko:** niedrig — Prod-Write, aber konditional, idempotent, vollständig reversibel; relevante/mehrdeutige Fälle ausdrücklich nicht in der Allowlist.
- **Parallelisierbarkeit:** direkt nach OP-05 im selben Freigabefenster möglich.
- **Freigabe:** **JA** (Prod-Write; exakter Freigabesatz in der Freigabevorlage §6).

#### OP-07 · Monitoring-Zweitkanal + Meta-Heartbeat aktivieren (früher FT2-5)
- **Status:** **vorbereitet (durch PR #102 deutlich ausgebaut/gehärtet), NICHT aktiviert, NICHT bewiesen.**
  - *Umgesetzt + offline getestet auf `main` (PR #102):* gehärteter Webhook-Sender `lib/helmut/monitoring-webhook.js` — stabile Ereigniskennung (`hb-<Tag>` / `al-<Tag>-<hash>`), Dedupe (letzte 20 Kennungen), begrenzter Retry (Default 2, 8-s-Timeout, 4xx nie), Zustellstatus-Persistenz (`monitoringWebhookDelivery`), Meta-Heartbeat (auch grüner Report wird zugestellt); rollierender Health-Report `lib/helmut/rolling-health.js` (24-h-Fenster, 5 Zustände) + `rollingCrawl` in der Alarm-Payload-Allowlist. Der rollierende Report **schließt die B1-Alarm-Lücke (jüngster-Lauf-Blindheit) im Code**. Verdrahtet in `server.js` (Health-Report-Pfad, `dryRun=1` meldet `kanaele.webhook.konfiguriert`). Tests: `monitoring-webhook-test.js` (20), `alarm-payload-test.js`, `rolling-health-test.js` (18). Doku: `docs/betrieb/f5_freigabe.md`, `docs/betrieb/health_report_rollierend.md`.
  - *NICHT aktiviert / NICHT bewiesen:* `HELMUT_MONITORING_WEBHOOK_URL` ist **nirgends gesetzt** → der Sendepfad ist ein No-Op; **kein** echter Zustellbeleg (`webhook.sent`/`monitoringWebhookDelivery`) im Beweisprotokoll; `.github/workflows/health-watch.yml` hat weiterhin **kein `schedule:`** (nur `workflow_dispatch`). Der B1-Alarm-Lücken-Schluss wirkt operativ erst nach Aktivierung + laufendem Schedule.
- **Fehlender Schritt:** geprüfte Webhook-URL bereitstellen → `HELMUT_MONITORING_WEBHOOK_URL` in Vercel setzen → Redeploy → `dryRun=1`-Verifikation (`konfiguriert=true`) → echten Zustellbeleg dokumentieren (nächster 06:00-UTC-Report: `webhook.sent=true` + `monitoringWebhookDelivery` `hb-<Tag>`, genau eine Nachricht) → `schedule:`-Cron in `health-watch.yml` ergänzen.
- **Abhängigkeiten:** keine.
- **Risiko:** gering — Payload datenschutzgehärtet (Allowlist + Redaction); Kanalfehler kippen den Cron nicht.
- **Parallelisierbarkeit:** vollständig parallel.
- **Freigabe:** **JA** (Env-Wert = F5-Gründerfreigabe + neuer Alarmkanal/Cron).

#### OP-08 · KO-Klassifikations-Backfill ausführen (früher FT2-4) — ✅ GESCHLOSSEN 2026-07-18
- **Status:** **✅ ausgeführt und vollständig belegt.** Echter Lauf 2026-07-16 15:36 UTC (Action-Run **29511858469**, Token korrekt): `candidates: 195, processed: 195, failed: 0`, levelHist `{bund:118, eu:2, unknown:68, land:7}`. **Idempotenz-Zweitlauf** 2026-07-17 23:56 UTC (Run **29621926765**, read-only): `totalKos: 375, candidates: 0`. SQL-Gegenprobe: **0** von 322 complete-KOs ohne `decision_level`/`political_level`/`embedding`/`event_type`. Belege: Sprintbericht §5.
- **Folge:** OP-14-Abhängigkeit („nach OP-08") und OP-22-Vorbedingung (vollständige KO-Merkmale) sind erfüllt. Die Action bleibt für künftige Alt-Bestände dispatchbar (Zweitlauf = No-Op belegt).

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
- **Status:** Code live, Flag AUS; laut Forensik bewusst NICHT auf `pending`-Waisen ausweiten. Live-Stand 2026-07-17: **4** `failed`-Fälle — 1 Duplikat-Risiko (`vg-gesetzentwurf`, würde doppeln — vorher OP-06), 1 Alt-Fall (`vg-bürokratie`, Docs ≈15.07.), 2 **neue netto-neue** vom 17.07. (`vg-45975d00f663a2ec163778de`, `vg-unterhaltsvorschuss`; SQL-geprüft kein Duplikat). Die `failed-final`-Terminal-Garantie ist durch den Sprint-Fix jetzt vollständig durchgesetzt (Pending-Filter + `understandOneCluster`).
- **Adversarial-Befund Fensterfalle (Sprint 2026-07-18):** Der Retry setzt `failed→pending` zurück; verstanden wird aber nur, was im Rohdok-Lesefenster des Cron liegt (500 Zeilen ≈ 1,3 Tage). Ein `failed`-Fall, dessen Quelldokumente älter sind, wird durch den Reset zur **ewigen `pending`-Waise** (schlechter als `failed`, da er aus dem bounded Retry herausfällt). Die Aktivierung schützt daher primär **künftige** Fehlschläge (Retry am Folgetag); für die 3 heutigen Nicht-Duplikat-Fälle ist die Fenster-Erreichbarkeit zum Aktivierungszeitpunkt **vorab read-only zu prüfen** — nicht mehr erreichbare Fälle stattdessen per Einzel-Doc-Pfad retten oder bewusst terminalisieren.
- **Akzeptanzkriterien über die Aktivierung hinaus (Production-Beweise):** (a) Wirkungsnachweis: mindestens ein Fall durchläuft `failed → pending → complete` ODER erreicht nach `MAX_RETRIES` `failed-final` (Cron-Log `recovery: {retried, terminal}` + KO-Status); (b) **Zähler-Persistenz** über ≥2 Läufe (`understandingRetries` im Auth-Store inkrementiert — strukturell offline verifiziert: Shallow-Spread ohne Kompaktierungs-Stripping, das PR-#88-Bugmuster liegt nicht vor; Prod-Beleg steht aus); (c) kein Wiederaufgriff nach `failed-final` (Folgelauf-Logs); (d) Budget-Verhalten: Retries laufen durch `canSpend`/Reserve, ein Budget-Stopp verbrennt keinen Retry-Zähler (Fall bleibt `pending`, kein Doppel-Inkrement — Code-analytisch belegt).
- **Fehlender Schritt:** nach OP-06-Ausführung + Fenster-Check `HELMUT_FAILED_KO_RECOVERY=1` setzen + Redeploy; Akzeptanzkriterien (a)–(c) im Beweisprotokoll dokumentieren.
- **Abhängigkeiten:** OP-06 vorher (Duplikat-Fall terminalisieren); empfohlen nach OP-05-Rest.
- **Risiko:** gering — bounded, terminal, No-Op ohne Kandidaten; Fensterfalle durch Vorab-Check kontrolliert.
- **Parallelisierbarkeit:** parallel zu OP-14…OP-20.
- **Freigabe:** **JA** (Env, Prod-KO-Writes).

#### OP-14 · Understanding-Priorisierung aktivieren (früher FT2-7, A-P1-3)
- **Status:** Code live, Flag AUS; KI-freie Umsortierung (amtlich > Relevanz > Frist > …), wirkt nur im Eager-Pfad. Sprint-Analyse 2026-07-18: auf den Alt-Rückstand wirkungslos (dokumentlose Waisen), auf den Pending-Cron-Pfad ohne Wirkung; 2 Testsuiten grün; **nicht aktiviert** (Freigabe steht aus).
- **Geschärft 2026-07-26 (Betriebsbefund B4):** die Aktivierung dieses Flags allein löst den in `befund-csd-2026-vorgangsverlust.md` bewiesenen stillen Ereignisverlust **nicht**. Ursache dort ist die `vorgang_id`-Ableitung selbst (Ein-Wort-Kennung, Teilstring-Ankerabgleich), nicht nur die Verarbeitungsreihenfolge. OP-14 bleibt sinnvoll (Sofortmaßnahme 3 im Befund), ersetzt aber die dort beschriebene Reparatur der Vorgangsbildung nicht.
- **Dringlichkeit erhöht 2026-07-26 (Reparatursprint B4):** die Reparatur der Vorgangsbildung ist umgesetzt — damit ist der Verlust nicht mehr still, aber die **Reihenfolge entscheidet jetzt über Qualität**. Gemessene Obergrenze der KI-Aufrufe: **115 → 159 je Tag bei Tagesbudget 100** (`befund-csd-2026-vorgangsverlust.md` §11). Was nicht in den Tag passt, endet als `skipped-budget` — protokolliert und nachholbar, aber am selben Tag nicht verstanden. Als Zwischenlösung werden **Großereignisse flagunabhängig vorgezogen** (Sicherheits-/Opferbezug oder offizielle Reaktion plus mehrere unabhängige Quellen oder zeitliche Verdichtung); die vollständige Relevanzsortierung bleibt diese Freigabe.
- **Akzeptanzkriterien über die Aktivierung hinaus (Production-Beweis, adversarial geschärft 2026-07-18):** Der Nachweis ist **nur an einem Budgetdeckel-Tag** erbringbar — an Tagen ohne Deckelung ist die Aktivierung mengen-neutral (reine Reihenfolge, kein messbarer Effekt). Er muss aus einem **Crawl-Lauf (Eager-Pfad)** stammen, nicht aus dem Pending-Cron. Kriterien: (a) höchstpriorisierte/amtliche Vorgänge werden zuerst verstanden (Verarbeitungsreihenfolge + Tier aus den Cron-/Prozess-Logs); (b) **kein amtlicher Vorgang verdrängt** (Kennzahl `amtlichVerdraengt = 0`); (c) Nicht-Regression: die Understanding-Gesamtzahl des Tages sinkt nicht unplausibel; (d) Rollback trivial (Flag aus, byte-identisches Altverhalten — testbelegt). Ohne definierten Messweg (Log-Auswertung eines Deckel-Tages) gilt die Aktivierung als **nicht bewiesen**.
- **Fehlender Schritt:** `HELMUT_UNDERSTANDING_PRIORITY=1` + Redeploy; Akzeptanzkriterien (a)–(c) am nächsten Budgetdeckel-Tag im Beweisprotokoll dokumentieren.
- **Abhängigkeiten:** ~~sinnvoll nach OP-08~~ — **erfüllt** (OP-08 geschlossen 2026-07-18).
- **Risiko:** gering — reine Reihenfolgeänderung.
- **Parallelisierbarkeit:** parallel.
- **Freigabe:** **JA** (Verhaltensänderung).

#### OP-15 · Google-News-Klumpenrisiko mindern (Betriebsbefund B1)
- **Status:** **offen — zwei getrennt zu haltende Ebenen (nicht vermengen):**
  - *(a) Operative Härtung — durch PR #102 umgesetzt + offline getestet, aber NICHT production-bewiesen.* `lib/helmut/google-news-hardening.js`: Provider-Trennung/Gate (Parallelität 5, Abstand 200 ms), Retry+Backoff+Jitter mit Retry-After-Deckel + Retry-Budget/Lauf, Circuit Breaker je Lauf (10 Beob./0,6) + Prozess-Gedächtnis, Cooldown nach Degradation, Vollcrawl-Abstands-Schutz, kein HTML-Fallback-Zweitrequest, Kill-Switch `HELMUT_GOOGLE_HARDENING` (**Default AN im Code**). 7-Zustands-Lauf-Klassifikation (`crawl-run-state.js`). Tests: `google-news-hardening-test.js` (58), `crawler-hardening-test.js` (19). Doku: `docs/betrieb/google_news_haertung.md`. **Provider-Ursache von B1 read-only bewiesen** (alle 129 Ausfälle waren Google, 3/3 direkte Quellen ok; `docs/betrieb/google_news_drosselung_analyse.md`). **Es fehlt** der Production-Beweislauf unter echter Drosselung (Breaker öffnet, `circuit-open`, direkte Quellen unberührt) — die Härtungs-Werte sind laut `google_news_haertung.md` bewusst „Empfehlungen, erst durch echte Beweisläufe bestätigt".
  - *(b) Strukturelle Dauer-Minderung — NICHT begonnen (die eigentliche OP-15-Akzeptanz).* Direkt-RSS-Umstellung geeigneter Kernwege (amtlich/kuratiert), per Telemetrie belegt. Der Katalog ist weiterhin **146 von 163 Wegen Google-News**; `google_news_haertung.md` benennt die Direkt-RSS-Migration ausdrücklich als „nicht Teil dieses Sprints". Das Klumpenrisiko bleibt genau deshalb latent.
- **Neu belegt (Paket-Inventur 2026-07-27, read-only):** das Klumpenrisiko trifft **zuerst die mandatsindividuelle Versorgung**, und zwar unbemerkt. Von 42 Laufzeit-Personensuchen haben **29 im Betriebszeitraum nie geliefert**; dominante Klasse ist `gedrosselt` (`circuit-open`), also die zentrale Drosselung, kein Quellendefekt. Der letzte Volllauf enthielt **7 von 42** Laufzeitquellen — **alle von einem einzigen Mandat**; damit erhält **eines von sechs** aktivierungsberechtigten Mandaten seine personenbezogene Beobachtung. Zusätzlich sind **11 von 82** eingeplanten Wegen in `arbeit-und-soziales` `instabil`, ausnahmslos `bundle-ausschuss-*`-Bündelsuchen. Beleg und Reproduktion: [`quellenarchitektur/30-paket-inventur-production.md`](quellenarchitektur/30-paket-inventur-production.md) §6 (B-3/B-4).
- **Fehlender Schritt:** (a) Production-Beweislauf der #102-Härtung dokumentieren (kann mit OP-10-Fehlerpfad einhergehen); (b) Kernquellen schrittweise auf Direkt-RSS umstellen und die gesunkene Google-Quote per `source_crawl_telemetry` nachweisen; **(c) neu:** klären, warum die Personensuchen der übrigen Mandate dauerhaft im Breaker hängen — das ist Versorgungsausfall, nicht nur Klumpenrisiko.
- **Abhängigkeiten:** (a) braucht einen echten Google-Drosselungs-Fall im Betrieb (nicht erzwingbar); (b) keine — Telemetrie (live) liefert die Messbasis.
- **Risiko:** niedrig — Härtung additiv + Kill-Switch; Direkt-RSS-Umstellung quellenweise per Crawl-Vergleich absicherbar.
- **Parallelisierbarkeit:** (b) gut parallelisierbar (quellenweise); (a) passiv/beobachtend.
- **Freigabe:** **JA** für (b) (Quellenkatalog-/Deploy-Änderung); (a) ist Beobachtung (keine Freigabe), setzt aber den bereits gemergten #102-Code in Production voraus.

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

#### OP-19 · Production-Beweis: Quellen-Dubletten-Freiheit (Umsetzung + fehlender Nachweis getrennt)
- **Status:** **offen — Umsetzung erfolgt, Live-Nachweis fehlt.**
  - *Umsetzung (PR #102, offline getestet):* Der statische Katalog-Eintrag war schon vor #102 entfernt (Commit `40e130f`); die verbliebene, live gemessene Dublette (145 Zeilen / 144 distinct in il02g/v268f/mb1k6) entstand aus einer **id-Kollision** zwischen dynamischer Personenquelle und relationalem Pfad (unterschiedliche URLs → URL-Dedup griff nicht). #102 ergänzt eine **`source_id`-Dedup im Quellenplan** (`dedupeSourcesById` in `mergeProfileAndPlanSources` + Fallback-Pfad, first-wins/kuratierte Namensquelle bevorzugt). Erwartete Quellenzahl 145 → 144. Test: `scripts/source-dedupe-test.js`. Doku: Beweisprotokoll §7.
  - *Live-Nachweis (fehlt):* Am nächsten regulären Crawl per `source_crawl_telemetry` belegen, dass **Zeilenzahl = distinct `source_id`** (keine Doppel-Einreihung), und im Beweisprotokoll nachtragen. Bisher gibt es dafür **keinen** dokumentierten Production-Lauf mit aktivem Fix.
  - *Neuer Betriebsbefund B3 (aus PR-#102-Analyse, offen):* Die Quellenzahl ist **mandats-/profilabhängig** (ein manueller Crawl mit einem Demo-/Testmandat lief mit 139 Quellen, die profil-dynamischen Suchen fehlten). Die feste Referenz „145" gilt nicht mehr absolut; die **harte Invariante lautet künftig `Zeilenzahl = distinct source_id`** (nicht „= 145").
  - *Neu (Paket-Inventur 2026-07-27):* Die B3-Invariante ist jetzt **je Lauf automatisch ablesbar** — `letzterLauf.dublettenfrei` vergleicht Zeilenzahl gegen distinct `source_id` (`node scripts/paket-inventur.js`). Im letzten Volllauf `crawl-20260726200015-z3qaf`: **147 Zeilen / 147 Quellen — erfüllt.** Damit fällt eine Dublette künftig ohne Handarbeit auf. Zugleich ein **neuer, verwandter Befund (B-2):** die DB-Katalogzeile `profil-<mandats-id>` und die Laufzeit-Personensuche teilen sich dieselbe `source_id` — sie werden zwar korrekt nur **einmal** gecrawlt, ihre Telemetrie ist aber **nicht trennbar**, sodass der Ertrag der Katalogzeile nicht bestimmbar ist. Beleg: [`quellenarchitektur/30-paket-inventur-production.md`](quellenarchitektur/30-paket-inventur-production.md) §6.
- **Fehlender Schritt:** einen regulären Crawl nach Deploy des #102-Fixes per Telemetrie auswerten (Zeilen = distinct `source_id`) und dokumentieren; die B3-Invariante als Prüfregel übernehmen (**Werkzeug vorhanden**, s. o.).
- **Abhängigkeiten:** setzt den gemergten #102-Dedup-Code in Production voraus (der Merge selbst ist erfolgt).
- **Risiko:** keines (Beobachtung).
- **Parallelisierbarkeit:** passiv.
- **Freigabe:** **NEIN** (reiner Beobachtungs-/Nachweisschritt).

#### OP-20 · Git-Historie bereinigen (früher FA-2)
- **Status:** offen/optional; der alte Pilot-Code ist seit FA-1-Rotation wertlos, bleibt aber in der Historie lesbar. **Zwingend vor Repo-Weitergabe an Dritte (Due Diligence/Dienstleister).**
- **Fehlender Schritt:** `git filter-repo`-Rewrite + koordinierter Force-Push (Backup-Klon vorher).
- **Abhängigkeiten:** keine offenen Branches im Flug (koordinieren).
- **Risiko:** mittel — Force-Push bricht offene Checkouts; mit Backup beherrschbar.
- **Parallelisierbarkeit:** eigenes Wartungsfenster.
- **Freigabe:** **JA** (Historie-Rewrite).

### P3 — Spätere Erweiterungen

#### OP-21 · Landtagsmodule Berlin/Brandenburg aktivieren (Serie A-P2-1…A-P2-6)
- **Status (aktualisiert 2026-07-26):** **Berlin wurde erstmals real aktiviert und am selben Abend zurückgerollt.** Ausgeführt 21:01–21:03 UTC (Block A · Abnahmeprofil · Paketstatus · Stufe 1 = 2 RSS-Direktfeeds), zurückgerollt 22:43 UTC (Ebene 0b + Ebene 2), nachdem ein manueller `/api/pipeline/run` um 22:09:52 UTC mit **HTTP 504** endete (Abbruchkriterium 16). **Heute wieder inert: 0 berechtigte Berliner Mandate, 0 aktive Berliner Wege, 0 Abrufe jemals.** Zwei Änderungen bleiben bewusst stehen, weil sie keinen Abruf erzeugen: `berlin-basis` ist `active` (statt `prepared`) und **neutral** — Befund **A-3** ist damit geschlossen. **Brandenburg unverändert `prepared` und vollständig `manual`.** Vollständige Beweiskette: [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) §21/§22. PARDOK-Parser + Shadow-Modus getestet.
- **Belegt durch den Anlauf:** die Aktivierungsreihenfolge greift in Production (jede Vor-/Nachbedingung real ausgelöst), die Mandatsbindung (V-2) wirkt an echten Daten (alle 8 Bestandsmandate unverändert bei 140 Quellen), und **beide datenbankseitigen Not-Aus-Wege haben Berlin in 17 Sekunden stillgelegt** — ohne Vercel-Env, ohne Betreiberzugriff.
- **Weiterhin unbewiesen:** ob `HELMUT_LANDESMODULE=berlin` in Production tatsächlich wirkt. Der einzige Lauf mit aktivem Berlin brach ab, **bevor** Telemetrie geschrieben wurde; 0 Berliner Rohdokumente, 0 Knowledge Objects, 0 Vorgänge, keine Lage, kein Briefing. Stufe 2 wurde nie aktiviert.
- **Fehlender Schritt:** Berlin erneut aktivieren und den Betriebsnachweis erbringen (Reihenfolge `berlin-aktivierung.md` §9 steht, alle Werkzeuge sind real erprobt). Für Brandenburg zusätzlich unverändert: PARDOK-Live-Ingest, Ebenen-Default entkoppeln, Landes-Kataloge, Seed-/Status-Flip.
- **Abhängigkeiten:** stabiler Bundestagsbetrieb; OP-18 sinnvoll vorher. **Neu und blockierend (2026-07-26):** (1) der frisch deployte Vorgangsbildungs-Umbau (**PR #143**, `746eaf9`) muss stabil sein — sein erster Lauf lief ins Zeitlimit und hinterließ 176 zusätzliche `pending`; (2) das 300-s-Funktionslimit muss geklärt sein (2 × `504` am 26.07., einer davon **vor** jeder Berliner Aktivierung → OP-15/B1). Neue Startbedingung für den nächsten Anlauf: **kein frisch deploytes Pipeline-Update und kein manueller Vollpipeline-Lauf im Beobachtungsfenster.**
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
- **Status:** offen (Sammelposten): Briefing→Decision relational verlinken, toten V2-KI-Pfad entfernen, Einmal-Module nach `scripts/one-off/`, Dead-Code-Scan in CI, Erwähnungs-Engines konsolidieren, `decisions`/`matching_results` bereinigen/nutzen (E6), Cron-DST-Entscheid, Boot-Zeit-Env-Selbstcheck, `document_type`-Befüllung, **Pflichtklassenanzeige im Admin an das vereinigte Paketmodell hängen** (zeigt heute `present: 0`, weil `buildSourceAdminReport` auf `buildFullModel()` arbeitet, das die Berlin-/Brandenburg-Wege nicht kennt; die echte Abdeckung ist 12/12 bzw. 12/12 — Befund V-6 in `quellenarchitektur/31-paketvollstaendigkeit.md`. Vorsicht: derselbe `catalog`-Eingang speist Aktivierung und Qualitätsbericht).
- **Fehlender Schritt:** je Einzelpunkt kleiner PR; DST-Entscheid ist eine Zeitplan-Freigabe.
- **Abhängigkeiten:** keine harten.
- **Risiko:** niedrig (Hygiene), außer DST (Zeitplan).
- **Parallelisierbarkeit:** sehr gut (unabhängige Einzel-PRs).
- **Freigabe:** überwiegend **NEIN** (Code-Hygiene via normalem PR-Prozess); **JA** nur für DST/Cron und Datenbereinigungen.

#### OP-24 · Geografie des Altbestands nachklassifizieren (neu, Sprint 20)
- **Status:** **Stufe 1 (Probelauf) erfolgreich, vollständiger Schreiblauf ausstehend**
  (Sprint 21, 2026-07-28). Der Prozess ist gebaut, getestet (101/101 · 21/21 Mutationen rot),
  read-only gegen Production vermessen **und am 2026-07-28, 08:25:13–08:25:21 UTC erstmals
  im Schreibmodus gegen Production gelaufen — begrenzt auf 12 namentlich genannte Objekte**.
  Kanonisch: [`nachklassifikation-altbestand.md`](nachklassifikation-altbestand.md) §13.
  Sprint 20 hat den **Schreibpfad** korrigiert: eine betroffene Geografie
  entsteht nur noch aus Nachweisen, nie aus `decision_level`. Der **Altbestand ist bewusst
  unangetastet geblieben** (Sprintregel 12).
- **Belegter Ist-Zustand** (read-only gemessen am 2026-07-27, 1 193 Knowledge Objects,
  vollständiger Seitenlauf): **552** Vorgänge tragen eine gespeicherte „betroffene Geografie".
  Davon **481 = Deutschland** (`geo-bund`), darunter **451 von 451** Bundesvorgängen
  (ausnahmslos) und **30 von 60** Landesvorgängen (dort war Deutschland der verbotene
  Ersatzwert für eine unbekannte Landesgeografie). **37** Einträge lauten „Europäische Union"
  **ohne kanonische ID**. **0 von 1 193** Vorgängen haben mehr als eine betroffene Region.
  Damit sind **518 von 552 (93,8 %)** reine Ebenen-Ableitungen, die restlichen **34** stammen
  aus bloßen Ortsnennungen — **kein einziger** Wert beruht auf einem geografischen Nachweis.
- **Erledigt in Sprint 21:** der kostenneutrale, rein deterministische Nachlauf existiert
  (`lib/helmut/quellenarchitektur/nachklassifikation.js` + `scripts/nachklassifikation.js`).
  Vorschau ist Standard; Schreiben verlangt `--ausfuehren` **und**
  `HELMUT_NACHKLASSIFIKATION_BESTAETIGT=ja` **und** das Production-Schreibgate.
  Begrenzbar nach IDs, Zeitraum, Mandant, **Fehlerklasse** und Menge. Idempotenz an allen
  **740** verstandenen Production-Objekten bewiesen (Lauf 2 und 3 schreiben **0**).
- **Read-only Production-Vorschau (2026-07-28):** 1 230 Objekte gelesen, **490 unverstandene
  hart ausgeschlossen**, **740** geplant. Sicher automatisch korrigierbar: **570 Geografien
  entfernen** (471 Bundes-Ableitung · 30 Ersatzwert `land` · 37 nicht-kanonische EU · 32
  Ortsnennung) und **2** Belege stärken. **0** manuelle Prüffälle, **0** KI-Aufrufe,
  **0,00 USD**. Die Zahlen reproduzieren die Sprint-19/20-Messung exakt (78 · 30 · 37 · 34).
- **Stufe 1 ausgeführt (2026-07-28, Probelauf über 12 Objekte):** Startprüfung 9/9 (der Lauf
  wurde **verzögert**, weil um 07:58 UTC ein realer Crawl + `understanding-eager` lief;
  geschrieben wurde erst nach drei ruhigen Messungen). Frische Gesamtvorschau: 1 249 gelesen,
  482 unverstandene ausgeschlossen, 767 geplant, 740 Schreibvorgänge — **alle sechs sicheren
  Fehlerklassen zahlengleich** zum Sprintbericht (471 · 30 · 37 · 32 · 2 · 738), die
  Abweichungen sind ausschließlich 27 neue, vom reparierten Sprint-20-Pfad bereits korrekt
  geschriebene Objekte. Stichprobe: **12 Objekte, 2 je Klasse, alle 6 Klassen**, 0 manuelle
  Fälle. Ergebnis: **12 geplant, 12 geschrieben, 0 Fehler, 0 Kollisionen**, 8 s.
  Readback vollständig: **0 Abweichungen von der Vorschau**, **0** belegte Geografien
  verloren, **0** ungeplant ergänzt, **0** Ebenen/Fachgebiete/Entitäten verändert, nur
  3 Spalten berührt, Fingerabdruck der **1 237 übrigen** Objekte **identisch**,
  `llm_usage` **0** Zeilen und Budgetzähler unverändert → **0 KI-Aufrufe, 0,00 USD**.
  Idempotenz: zweiter Vorschaulauf meldet **0** Schreibvorgänge. Matching (8 echte Profile),
  Briefings und Betrieb stabil. **Befund N-1:** der Lauf schreibt `updated_at` **nicht** fort
  (Verhalten von `saveKnowledgeObjectEnrichment`, kein Defekt) — der Nachweis steht in
  `classification_confidence.nachklassifikation_am`; wer den Hauptlauf gegenmessen will,
  darf **nicht** `updated_at` benutzen.
- **Fehlender Schritt:** **nur noch der freigegebene vollständige Production-Schreiblauf**
  (Umfang B, 740 Objekte, 30 Batches — oder Umfang A, 572). Stufe 1 hat die Korrektheit des
  Schreibpfads belegt, **nicht** das Verhalten unter Menge (30 Batches statt 1) und nicht den
  Rückweg (nie gegen Production gelaufen, OP-01). Alt-Einträge
  tragen keine Herkunft und gelten als `bestand-alt` — sie sind von jedem echten Nachweis
  (Rang ≥ `ki`) korrigierbar, gehen aber ohne Nachweis nicht verloren (fail closed).
- **Abhängigkeiten:** Sprint 20 ist gemergt (#155) und deployt. Sprint 21 muss gemergt sein.
- **Risiko:** mittel — es ist ein **Production-Schreiblauf** über den Bestand. Ohne KI-Kosten
  (der Deriver ist rein). Vorher/Nachher-Messung und Rückweg liegen vor
  ([`nachklassifikation-altbestand.md`](nachklassifikation-altbestand.md) §11/§12).
  Dämpfend: `affected_geographies` und `political_level` haben heute **keinen**
  Laufzeitkonsumenten — `matching.js` liest beide nicht.
- **Freigabe:** **JA** (Production-Datenänderung) — Freigabeschritte in §12 des kanonischen
  Dokuments. Schritt 3 (Probelauf) ist **erledigt**; offen ist genau eine Entscheidung:
  **Umfang A oder B** für den Hauptlauf (§13.12).

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

_Erstellt 2026-07-17 auf Basis von Code (`main` `7346653`); re-verankert 2026-07-22 auf `main` `d6d9063` (#113). Gemergte PRs #95–#100,
Production-Beweisprotokoll und Audit-Serie. Reine Dokumentation — kein Code, keine
Datenbank, keine Workflows, keine Production-Konfiguration verändert._
