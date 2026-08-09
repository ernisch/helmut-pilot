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
| **Stand / Prüfdatum** | **2026-07-29** (Basisstand 2026-07-17, re-verankert 2026-07-22, siehe Banner; OP-05/06/08/13/14 nachgezogen durch den Pending/Understanding/KO-Sprint — Belege: `docs/betrieb/datenmotor_sprint_pending_understanding_ko.md`; §4 und §6 nachgezogen durch Sprint 23B-1 — neue Befunde **B5**/**B6** und neue Punkte **OP-25**/**OP-26**; §4 zusaetzlich nachgezogen durch Sprint 23C-2A — neue Befunde **B7**/**B8**; **B7 nachgemessen und entschieden in Sprint M-8 → neuer Punkt OP-27**, B8 bleibt bei OP-04; §6 ergänzt **2026-08-04** durch Sprint „Profilreife" → neuer Punkt **OP-29** (OP-28 bleibt für PR #216 reserviert); **§6 ergänzt 2026-08-08** durch die V3-Skalierungsprüfung → neuer Punkt **OP-30** (mandatseigene Abrufwege, P1; Beleg `betrieb/v3-skalierungspruefung-2026-08-08.md`); **OP-04/OP-25/OP-29 nachgeführt 2026-08-04** durch den Production-Profilreparatursprint (Reparaturpaket angewendet, `max-mustermann` deaktiviert, 5 aktive reale Mandate); **OP-25 erneut nachgeführt 2026-08-04/2** durch den E3-Sprint (verbindliche E3-Entscheidung, ausführbarer Nachweisvertrag `betrieb/vorgangskontext.md` §7.7, rein lesendes Werkzeug `scripts/op25-production-nachweis.js`, Dry-Run ehrlich `noch_nicht_auswertbar`). *Die übrigen Abschnitte tragen weiterhin den Stand 2026-07-18 und wurden in diesem Sprint nicht nachgemessen.*) |
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
| **B5** — Crawl läuft reproduzierbar in sein **280-Sekunden-Zeitlimit** und erreicht je Lauf nur einen Teil der Mandanten (Sprint 23B-1, 2026-07-29) | **Belegt und quantifiziert.** Protokollzeile `[cron/crawl] 280001ms tenants=undefined bounded=true` am **28.07. 04:00**, **28.07. 20:00** und **29.07. 04:00** — die ersten beiden liegen **vor** der Aktivierung von `HELMUT_MATCHING_AUDIT`, das Zeitlimit ist also **kein** Effekt der Auditpersistenz, sondern Bestandsverhalten. Empirisch: der 29.07.-Lauf verarbeitete `annika-klose` vollständig, begann `cem-ince` und erreichte dessen Matching-Stufe nicht mehr (belegt über `profile_embeddings`, das im Matching **zuerst** geschrieben wird). Folgen: die Auditabdeckung, die mandatsindividuelle Personenversorgung und jede gezielte Nachholung hängen an diesem Deckel. Verwandt mit den 2 × `504` vom 26.07. (OP-21) und mit dem Google-News-Klumpenrisiko (OP-15) — die Erklärung „Breaker" ist damit **nicht vollständig**. **Erneut bestätigt am 29.07.2026, 16:00 UTC** (Sprint 23C-2A, rein lesend): der `pipeline`-Cron erreichte die Matching-Stufe bei **genau einem** von sieben Mandanten; für `cem-ince` stand die Crawl-Sperre noch, ein Matchinglauf entstand nicht. Praktische Folge: die Erklärungsabdeckung nach der M-7-Behebung steigt über mehrere Tage statt auf einen Schlag. **Nachtrag 2026-07-31 (R-6-Sprint):** B5 selbst ist **unverändert offen** — das 280-s-Limit besteht fort und die Kapazität wurde nicht erhöht. Behoben ist ausschließlich seine **Beobachtbarkeitsfolge**: ein am Zeitlimit endender Lauf hinterlässt jetzt einen vollständigen, persistenten Laufdatensatz statt nur `tenants=undefined bounded=true` ([`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) §11). B5 ist damit erstmals **zuverlässig messbar**, nicht gelöst | **OP-25**, OP-15, OP-21 |
| **B6** — kein produktiv verwendeter Einstieg für Matching **eines einzelnen Mandanten** (Sprint 23B-1, 2026-07-29) | **Belegt.** `runMatchingShadow` hat genau zwei produktive Aufrufer: `scheduler.js:412` (in `runSourceCrawl`) und `scheduler.js:588` (in `runLageCheck`, das ab `scheduler.js:629` selbst crawlt). Keine HTTP-Route in `server.js`, kein npm-Skript, kein Workflow; die einzigen weiteren Aufrufer sind zwei Testskripte mit hartkodierten Kunstmandanten und gestubbter Datenbank. Folge: Matching ist nur als Anhängsel eines Vollcrawls auslösbar — ein Mandant, der wegen B5 zurückfällt, hat keinen Weg nach vorn außer dem nächsten Vollcrawl; gezielte Nachprüfung, Nachholung und Reparatur je Mandant sind nicht möglich. Praktische Auswirkung bereits eingetreten: der Idempotenznachweis für Sprint 23B-1 musste an einem regulären Lauf **beobachtet** statt gezielt erzeugt werden | **OP-26** |
| **B7** — die Vektorsuche liefert die Top-N **ohne Schwellenwert**; ein Teil der Ergebniszeilen ist reine Auffüllung (Sprint 23C-2A, 2026-07-29; dort **M-8**) | **Belegt und quantifiziert, rein lesend.** `match_knowledge_objects` gibt unbedingt `match_count` Zeilen zurück (kein `where similarity > x`). Gemessen über alle **271** aktuellen `matching_results`: **40** Zeilen tragen eine gespeicherte Ähnlichkeit **≤ 0** (Minimum **−0,0735**), verteilt über die Ränge **1–20** — eine unbelegte, anlasslose Zeile kann heute an erster Stelle der Lage stehen. Das ist **kein** Erklärbarkeitsproblem (die Erklärung ist korrekt leer), sondern ein Problem der **Kandidatenqualität**. Eine Behebung verändert Kandidatenmenge und Ränge und ist deshalb eine **Produktentscheidung**, keine Fehlerbehebung. Nachweis: `scripts/matching-erklaerungsluecke-analyse.js`. **Nachgemessen und entschieden in Sprint M-8 (2026-07-29):** die Zahl **40** war eine Stichprobe (40 von 80 betrachteten unbelegten Treffern) — über den gesamten aktuellen Bestand sind es **63 von 271 (23,2 %)**, und alle 63 stammen aus dem jeweils **ersten** Lauf eines Mandanten; **im sichtbaren 12er-Fenster eines gepflegten Mandanten steht heute keine einzige Zeile mit Ähnlichkeit ≤ 0** (niedrigster sichtbarer Wert 0,2094). Ein Schwellenwert ist damit **das falsche Werkzeug**: bis 0,20 wirkungslos (das heutige Top-20 aller gepflegten Mandanten liegt in [0,2211 … 0,4319]), ab 0,22 schädlich, und in keinem Bereich trennscharf (unbelegbare Treffer liegen über dem Median der belegbaren). Entschiedene Regel: **Belegpflicht statt Zahl** — veröffentlicht wird nur, was ein `matched_feature` trägt; keine Auffüllung, keine Mindestmenge. Offline umgesetzt hinter `HELMUT_MATCHING_RELEVANZ_GATE` (**Default AUS**), Aktivierung freigabepflichtig. Kanonisch: [`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) Teil E §42–§49 | **OP-27** (neu) — Aktivierungsentscheidung; verwandt mit 22C2 (semantisches Matching) |
| **B8** — ein Mandatsprofil ohne Partei, Ausschuss und Schwerpunkt kann konstruktionsbedingt **nie** eine belegte Relevanz erzeugen (Sprint 23C-2A, 2026-07-29; dort **M-9**) | **Belegt.** Ein Mandant trägt außer einem Platzhalter (`Noch offen` als Region) keine Profilmerkmale; alle **20** seiner aktuellen Ergebniszeilen sind unbelegt und bleiben es auch nach der Behebung von M-7 — es gibt nichts, womit sich ein Wissensobjekt überschneiden könnte. Wirksamster Hebel ist die **Profilpflege** bzw. die Klärung, ob es sich um ein Demo-Mandat handelt; das Matching kann hier nichts verbessern | **OP-04** (Demo-Mandate) |

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
- **Status:** **teilweise abgeschlossen (2026-07-28): Sicherung und isolierter Restore bewiesen, Tarifentscheidung für PITR ausstehend.**
  Der kostenfreie Teil ist vollständig: aktuelle Production-Vollsicherung (40/40 Tabellen, 74 844
  Datensätze, Prüfsumme `c63f1d95…`, gitignored, gebunden an `main` `0f8d33a`) **und** ein praktisch
  durchgeführter, feld- und mengenmäßig bewiesener Restore in eine isolierte lokale PostgreSQL —
  18/18 Prüfungen inkl. funktionaler Mandantentrennung (RLS-Probe), Policies/Trigger/Funktionen
  gegen die Production-Strukturreferenz und pgvector-Matching; RTO gemessen (Export 50 s, Restore+
  Beweis 20 s). Dabei geschlossen: Backup-Deckungslücke (38→40 Tabellen — `source_crawl_telemetry`,
  `process_runs` fehlten). Beleg: [`betrieb/restore-uebung-2026-07-28.md`](betrieb/restore-uebung-2026-07-28.md),
  Werkzeuge `scripts/restore-verify-local.js` (+ Test), Runbook §0/3c/3d aktualisiert (RPO/RTO/Datenklassen).
  Free-Plan-Grenze bleibt: **RPO bis 24 h**, kein echter Snapshot, kein PITR.
- **Fehlender Schritt:** Betreiberentscheidung Supabase-Dashboard → Billing → Pro (~25 $/Monat) →
  PITR aktivieren; danach eine PITR-Restore-Übung dokumentieren (Runbook §3). Zusätzlich offen
  (klein, kein Blocker): belegten Schema-Drift Repo↔Production bereinigen
  (`scripts/produktions-strukturreferenz.json` → `schemaDrift`; Migration oder schema.sql-Angleich).
- **Abhängigkeiten:** keine.
- **Risiko bei Nichtstun:** mittel (vorher hoch) — der Rückweg existiert und ist geübt, aber bis zu
  24 h Datenverlust bleiben möglich; für zahlende Mandanten nicht ausreichend.
- **Parallelisierbarkeit:** vollständig parallel zu allem.
- **Freigabe:** **JA** (Kosten, Betreiber-Dashboard) — genau diese eine Entscheidung steht aus.

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
- **Status (2026-08-04, Profilreparatursprint): teilerledigt — die AKTIVE Demo-Vermischung ist
  aufgelöst, die Lösch-/Behalte-Entscheidung bleibt offen.** `max-mustermann` wurde mit
  ausdrücklicher Betreiberfreigabe **deaktiviert, nicht gelöscht** (alle übrigen Profilfelder
  byte-identisch belassen, kein Benutzerkonto/keine Zuordnung/keine Einladung vorhanden —
  vor der Änderung geprüft). Damit erzeugt kein aktives Mandat mehr die doppelte Personensuche
  neben `ottilie-paola-klein-2` (die zentrale Bestandsprüfung stuft das Namensduplikat jetzt
  als Warnung statt als Problem ein, solange nur eines der beiden Mandate aktiv ist).
  Production hält weiterhin **8 Mandatsprofile, jetzt 5 aktiv** — alle 5 aktiven sind reale
  Mandate; die drei Demo-Profile (`angela-merkel`, `james-brown`, `max-mustermann`) sind
  deaktiviert, aber vorhanden. **Weiterhin offen:** je Demo-Profil die Entscheidung
  behalten/löschen (rechtlicher Nebenaspekt OP-02: Klarname einer realen Abgeordneten im
  deaktivierten Demo-Mandat bleibt gespeichert) und die Entfernung der Mandatsauswahl am
  Bare-Root-Aufruf.
- **Ursprünglicher Status:** offen; **Umfang am 2026-07-25 read-only nachgemessen und größer als bisher geführt.** Production hält **8 Mandatsprofile, davon 6 aktiv** — nicht „zwei Demo-Mandate neben dem realen Mandanten". Fünf der Profile wurden am 20.07. angelegt und tragen Klarnamen realer Bundestagsabgeordneter; jedes aktive Profil erzeugt Crawl-Last und eigene profilgenerierte Personensuchen (belegt in `docs/quellenarchitektur/30-paket-inventur-production.md` §5, Abweichung A-1). Nach Entfernung entfällt zudem die Mandatsauswahl am Bare-Root-Aufruf.
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
- **Status:** offen. **Statuszeile am 2026-08-08 entschärft (OP-30-Abnahmesprint):** belegt ist der **Dauerbetrieb** des Shadow-Modus über rund zwei Wochen (37 792 Zeilen am 2026-07-28 gegen 1 000 am 2026-07-15) und ein Ersparnispotenzial von ~54 % der Dokumente. **Nicht belegt ist die Fehlerfreiheit dieses Zeitraums:** ausgewertet wurden nur zwei Läufe vom 14./15.07., und `gate_shadow_events` wurde bis dahin von **keiner** Stelle im Repository gelesen. Zwischen „es ist nichts aufgefallen" und „es ist nichts passiert" lag genau diese fehlende Auswertung. **Neu (additiv, rein lesend, fail closed):** `scripts/gate-shadow-auswertung.js` liefert die Messbasis — Verteilung, Gründe, Herkunft und die entscheidende Frage, ob je ein amtliches Dokument blockiert worden wäre. Es läuft nur mit ausdrücklichem `HELMUT_GATE_AUSWERTUNG_ZUGRIFF=ja` und ändert nichts.
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
- **Nachtrag 2026-07-29 (Roadmap-Punkt 24, offline, keine Aktivierung):** der **Parservertrag** für beide Länder ist jetzt belegt statt behauptet. Neu: normalisierte Dokumentklassen mit **getrennten Typtabellen je Land**, fail closed auf `unbekannt`, Abbildung auf den bestehenden `raw_documents`-Vertrag (keine Migration), Trennung von Dokument und Vorgang. Drei Befunde daraus, die **vor** einem Live-Ingest zählen: *24-1* das Understanding-Gate kannte „Schriftliche Anfrage" nicht (behoben, rein additiv); *24-2* die globale Dedup identifiziert über die URL — für PARDOK ist das falsch (ein Plenarprotokoll-PDF trägt viele Einträge), verbindlich ist `content_hash`; *24-3* **Brandenburg führt 11 Dokumentarten, Berlin nur 4** (gemessen über je 800 Records am 29.07.2026) — die erste Tabellenfassung hätte 35,5 % der Brandenburger Dokumente fälschlich als `unbekannt` geführt, und die Annahme „Brandenburg liefert keine Tagesordnung" war falsch (Dokumentart `Einladung`). **Nachtrag 2. Durchgang (29.07.2026):** der Berliner Vorgangsbezug ist **belegt** (Sondenlauf `30483735900`, `PP_RECORD_TAG=Vorgang`: 41 854 `<Vorgang>`, `VNr`/`VID` je 100 %, `V-351039` trägt Drucksache **und** Plenarprotokoll), Befund *24-2* ist **behoben** (Regel 0: Identität aus Herausgeber + externer Kennung + Dokumenttyp, Adresse nur noch Rückfall, ohne Migration), und die Gate-Ergänzung ist auf Landesdokumente **begrenzt** (*24-4*: die aktive DIP-Bundestagsquelle setzt `document_type` aus der API — global wäre das eine unkontrollierte KI-Kostenquelle gewesen). Damit ist der Teilschritt „PARDOK-Live-Ingest" fachlich vorbereitet; unverändert offen bleibt alles Übrige dieses Punktes (Aktivierung, Ebenen-Default, Landes-Kataloge, Seed-/Status-Flip). Details: [`quellenarchitektur/17-pardok-parser.md`](quellenarchitektur/17-pardok-parser.md) Teil B. **Nachtrag 3. Durchgang (29.07.2026, Abschluss):** der Vorgangsbezug ist jetzt **gemessen**, nicht mehr an einem Beispiel belegt (Läufe `30493097161` / `30493614179`, beide Länder, nur lesend). **Die Beziehung ist 1:n, nicht n:m** — keine `DBID` unter mehr als einer `VNr` (0 von 47 415 Berliner Dokumenten); `VNr` in Berlin flächendeckend, formstabil, ohne Mehrfachvergabe, `VNr` == `VID` in allen 41 853 Fällen. **Zwei Dinge, die vor einem Live-Ingest zählen:** (a) **Brandenburg hat keine Dokumentkennung** (`<DBID>` fehlt in 8 133 von 8 133 Dokumenten) und **411 von 4 751** vollständigen Vorgängen tragen keinen verwertbaren `VNr`-Wert — der Bezug bleibt dort in 8,7 % der Fälle ehrlich leer, und die n:m-Frage ist ohne Dokumentkennung nicht über eine Kennung prüfbar; (b) **Wechselwirkung mit der globalen Dublettenerkennung:** die Adressregel **würde** zwei Dokumente eines Vorgangs mit derselben Protokoll-PDF zu **einem** zusammenführen (Ursachennachweis als Test `M10c`) — Regel 0 fängt es ab, **Vorbedingung für den Cutover ist deshalb, dass jeder Weg die externe Kennung durchreicht**; `shadow-ingest.js` tut das nicht. Die globale Dublettenerkennung wurde bewusst **nicht** umgebaut. Details: [`quellenarchitektur/17-pardok-parser.md`](quellenarchitektur/17-pardok-parser.md) **Teil C**.
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
- **Status:** offen (Sammelposten): Briefing→Decision relational verlinken, toten V2-KI-Pfad entfernen, Einmal-Module nach `scripts/one-off/`, Dead-Code-Scan in CI, Erwähnungs-Engines konsolidieren, `decisions`/`matching_results` bereinigen/nutzen (E6), Cron-DST-Entscheid, Boot-Zeit-Env-Selbstcheck, `document_type`-Befüllung (für den PARDOK-Pfad seit Roadmap-Punkt 24 gelöst, für die RSS-/Bundeswege weiterhin offen), **Pflichtklassenanzeige im Admin an das vereinigte Paketmodell hängen** (zeigt heute `present: 0`, weil `buildSourceAdminReport` auf `buildFullModel()` arbeitet, das die Berlin-/Brandenburg-Wege nicht kennt; die echte Abdeckung ist 12/12 bzw. 12/12 — Befund V-6 in `quellenarchitektur/31-paketvollstaendigkeit.md`. Vorsicht: derselbe `catalog`-Eingang speist Aktivierung und Qualitätsbericht).
- **Fehlender Schritt:** je Einzelpunkt kleiner PR; DST-Entscheid ist eine Zeitplan-Freigabe.
- **Abhängigkeiten:** keine harten.
- **Risiko:** niedrig (Hygiene), außer DST (Zeitplan).
- **Parallelisierbarkeit:** sehr gut (unabhängige Einzel-PRs).
- **Freigabe:** überwiegend **NEIN** (Code-Hygiene via normalem PR-Prozess); **JA** nur für DST/Cron und Datenbereinigungen.

#### OP-24 · Geografie des Altbestands nachklassifizieren (neu, Sprint 20)
- **Status:** **inhaltlich erledigt — vollständiger Production-Schreiblauf (Umfang B) am
  2026-07-28, 09:03:49–09:07:09 UTC ausgeführt und bewiesen.** Nach dem Stufe-1-Probelauf
  (12 Objekte, 08:25 UTC) hat der freigegebene Hauptlauf die verbleibenden **728** Objekte in
  **30 Batches** korrigiert: **0 Fehler, 0 Kollisionen, Readback 728/728 exakt wie die
  Vorschau, 0 belegte Geografien verloren, Fingerabdruck der 521 übrigen Objekte identisch,
  Idempotenzvorschau 0 Restschreibvorgänge, 0 KI-Aufrufe / 0,00 USD.** Damit sind alle
  erfundenen Ebenen-Ableitungen entfernt und alle Geografie-Konfidenzen ehrlich
  (regional zugeordnete Vorgänge 573 → 11, verbleibend nur belegte/geschützte).
  Der Prozess ist gebaut, getestet (101/101 · 21/21 Mutationen rot) und bleibt für künftige
  Bestandsfehler wiederholbar (Vorschau als Standard). Offen bleibt **nur** das bekannte
  Altrisiko OP-01: der Rückweg ist nie gegen Production gelaufen (er wurde nicht gebraucht).
  Kanonisch: [`nachklassifikation-altbestand.md`](nachklassifikation-altbestand.md) §14
  (Hauptlauf) und §13 (Probelauf).
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
- **Fehlender Schritt:** **erledigt am 2026-07-28** — der vollständige Schreiblauf (Umfang B)
  ist gelaufen und hat auch das Verhalten **unter Menge** belegt (30 Batches, 728 Objekte,
  3 min 20 s, 0 Fehler). Nicht belegt bleibt allein der Rückweg (nie gegen Production
  gelaufen, OP-01 — er wurde nicht gebraucht). Formal abgeschlossen ist der Punkt mit dem
  Merge des Dokumentations-PR.
- **Abhängigkeiten:** Sprint 20 ist gemergt (#155) und deployt. Sprint 21 muss gemergt sein.
- **Risiko:** mittel — es ist ein **Production-Schreiblauf** über den Bestand. Ohne KI-Kosten
  (der Deriver ist rein). Vorher/Nachher-Messung und Rückweg liegen vor
  ([`nachklassifikation-altbestand.md`](nachklassifikation-altbestand.md) §11/§12).
  Dämpfend: `affected_geographies` und `political_level` haben heute **keinen**
  Laufzeitkonsumenten — `matching.js` liest beide nicht.
- **Freigabe:** war erforderlich und **wurde erteilt** (Umfang B, 2026-07-28) — der Hauptlauf
  ist damit ausgeführt (§14 des kanonischen Dokuments). Keine weitere Freigabe offen.

#### OP-25 · Crawl-Zeitdeckelung: je Lauf wird nur ein Teil der Mandanten erreicht (neu, Sprint 23B-1; Prioritätsklasse P1)
- **Nachtrag 2026-08-04/2 (Sprint „E3-Entscheidung + neuer Production-Nachweis", TEILWEISE
  ABGESCHLOSSEN — Vorbereitung vollständig, der Nachweis selbst beginnt erst nach der
  freigabepflichtigen Wiederaktivierung):** **E3 ist verbindlich entschieden** — Kapazitätsvertrag
  und Verstehensrückstand sind getrennt; `datenstand.status` wird **nicht** kosmetisch umgedeutet;
  ein ehrliches `teilweise` besteht den Nachweis **nur**, wenn strukturierte Laufdaten beweisen,
  dass die einzige Ursache regulär zurückgestellte, **vollständig gezählte und dauerhaft als
  pending-Wissensobjekte (mit Dokumentverknüpfung) vorgemerkte** Verstehensarbeit ist; jede
  andere Ursache (Quellen/Persistenz/Kontext/DB/Sperre/unbekannt) fällt durch. **E1 bleibt
  Option A, E2 bleibt unverändert.** Kanonischer, ausführbarer Vertrag mit vier Ausgängen
  (`bestanden`/`nicht_bestanden`/`blockiert`/`noch_nicht_auswertbar`, Exit 0–3):
  [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) **§7.7**; Werkzeug (rein lesend,
  GET-Literal + Allowlist): `scripts/op25-production-nachweis.js`; Bewertungskern
  `lib/helmut/op25-nachweis.js`. **Dauerhaftigkeit am echten Code bewiesen**
  (`op25-e3-dauerhaftigkeit-test.js` 44/44): zurückgestellte Eager-Cluster werden verbindlich
  vorgemerkt + verknüpft, ein erschöpftes Vormerkbudget wird als `nichtVorgemerkt` gezählt,
  Wiederauffindung läuft über die Verknüpfung (B4), idempotent ohne Duplikate. **Additive
  Telemetrie** (keine Migration, keine neue Tabelle, keine Budgetänderung): `datenstandDetail`
  + `quellenVereinigung` im globalen Laufdatensatz, Mandats-Vermerke in der Compact-Allowlist,
  eine dauerhafte `process_runs`-Zeile `globalphase` je Lauf; **Fix „kein falsches Grün":** ein
  Persistenzfehler der Rohdokumente versiegelt jetzt ehrlich `teilweise` (vorher stilles
  `abgeschlossen`). **Production-Dry-Run 2026-08-04 (rein lesend): ehrlich
  `noch_nicht_auswertbar` (Exit 3)** — globaler Abruf deaktiviert, kein Aktivierungszeitpunkt,
  kein 24-h-Fenster; **Baseline erhoben:** 5 aktive reale Mandate (dynamisch) · 3 deaktivierte
  Demos · 0 Testmandate · Kadenz crawl 04:00/20:00 + pipeline 16:00 UTC · LLM-Kosten 24 h
  0,20 USD (Rahmen 2 USD dokumentiert) · Fairness: crawl/pipeline-Altpfadläufe vom 2026-08-04
  mit Abbruchvermerk (bekanntes B5-Verhalten des Altpfads) · jüngster `mode:"global"`-Lauf
  bleibt der gescheiterte vom 2026-08-03 (fließt per harter Untergrenze 2026-08-04T00:00Z nie in
  einen neuen Nachweis ein). Tests: `op25-nachweis-vertrag-test.js` **71/71** (inkl. der 24
  geforderten Fallfamilien) · Mutationsprobe **14 von 14 rot**. **Nächster Betreiberhandgriff (ÜBERHOLT durch /7 —
  verbindlich ist [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.5: erst
  Flag setzen, dann NEUES Deployment, Aktivierung = READY-Zeitpunkt, Startbaseline innerhalb
  15 min mit vollem `--erwarteter-commit`):** ~~READY-Deployment dieses Stands, dann
  `HELMUT_CRON_GLOBALABRUF=on` (nur Production), dann frühestens nach 24 h
  `node scripts/op25-production-nachweis.js --aktivierung <ISO>`.~~
  Der Verstehensrückstand (~1 242 Cluster) bleibt offen und gehört zu **OP-14**.
  **Nachtrag 2026-08-04/3 (Review zu PR #222 vollständig eingearbeitet):** drei Wege, auf denen
  der Vertrag fälschlich grün hätte werden können, sind geschlossen — **(1) Kostenvertrag:**
  `NaN`/`±Infinity`/negative/nicht-numerische Werte fallen durch (`NaN > rahmen` war *immer*
  `false`), die **Vollständigkeit** der Kostendaten ist eine ausdrückliche Zusage (fehlendes
  `llmUsage`, nicht lesbarer Auth-Store, verdrängtes Kostenfenster → `blockiert`), nicht
  bepreisbare Einträge werden gezählt und blockieren; gemeinsame Wurzel `Number(null) === 0`
  überall durch strikte Zahlenlesung ersetzt. **(2) Mandatsmenge:** identitätsgenau am
  Fensterstart eingefroren über eine rein lesend erhobene **Startbaseline** (Aktivierungszeit,
  exakte Menge, stabiler Hash) — geprüft gegen **jeden Lauf** (neues persistiertes Feld
  `quellenVereinigung.mandateIds`) **und** den Endzustand; ein Austausch bei gleicher Anzahl,
  eine Änderung zwischen zwei Läufen und eine spätere Rückkehr zur Ursprungsmenge fallen jetzt
  auf; ohne Startbaseline `blockiert` statt Ersatz aus dem aktuellen Bestand. **(3) Dauerhafte
  Belegquelle:** die `process_runs`-Zeilen `globalphase` gehen wirklich in die Bewertung ein und
  trennen „verdrängt" (`blockiert`) von „nie gelaufen" (`nicht_bestanden`); dazu ein
  reproduzierbarer **Aufbewahrungsvertrag** (Bedarf = Läufe × (1 + n Mandate); Retention zu klein
  → `blockiert`, knapp → Warnung; 24-h-Fenster braucht heute **18** von **20** Datensätzen) und
  die Budgetprüfung an der **versiegelten** Laufzeit (`datenstand.dauerMs`/`budgetMs`, neu im
  Vermerk) statt am vor dem Versiegeln gebildeten `durationMs`. Kanonisch:
  [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) **§7.7.1**. Tests: Vertrag
  **108/108**, Dauerhaftigkeit **52/52**, Mutationsprobe **31 von 31 rot**; Production-Dry-Run
  erneut ehrlich **`noch_nicht_auswertbar`**. Der Nachweis selbst bleibt unverändert offen.
  **Nachtrag 2026-08-04/4 (zweiter Reviewdurchgang):** zwei Stellen, an denen das Werkzeug noch
  weicher war als seine eigene Doku, sind geschlossen — **(a) der ECHTE Kostenleser** lag im CLI
  und deutete mit `typeof roh === "number" ? roh : Number(roh)` genau die Werte um, die der
  Vertrag als unbrauchbar führt (`"1.20"` → 1,20 USD, `true` → 1, `false`/`null` → 0); Einträge
  ohne lesbaren Zeitstempel wurden still übersprungen. Er liegt jetzt als `kostenAusNutzung` im
  **reinen Kern** (eine Umsetzung, direkt testbar), akzeptiert nur **roh** endliche, nicht
  negative `number`-Werte und macht zeitlich nicht zuordenbare Einträge zur Beleglücke
  ⇒ `blockiert`. **(b) Die Startbaseline** verlangte `signatur`, `aktivierungAtMs` und
  `erhobenAtMs` nur, *wenn* sie vorhanden waren; das CLI schrieb sie auch ohne gültige
  `--aktivierung` (mit `null`) und las sie mit `Number(null)` zurück. Jetzt prüft
  `pruefeStartbaseline` **alle** Pflichtfelder strikt (Mandate ohne Duplikate, Anzahl
  widerspruchsfrei, Signatur passend, Aktivierungs- und Erhebungszeitpunkt vorhanden und
  stimmig) — jeder Verstoß ⇒ `blockiert`; das CLI verweigert das Schreiben ohne gültigen
  Aktivierungszeitpunkt (Exit 2, keine Datei) und liest die Belegdatei roh. **Nebenbefund
  behoben:** `deploymentCommit` trug eine Laufkennung statt einer Commit-Kennung und stammt jetzt
  aus `process_runs.commit_ref` (Production-Probe: `89427c5b…`) oder ist ehrlich `null`.
  Kanonisch: [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) **§7.7.2**. Tests:
  Vertrag **158/158** (+50), Dauerhaftigkeit **52/52**, Mutationsprobe **41 von 41 rot** (+10);
  Dry-Run unverändert `noch_nicht_auswertbar`.
  **Nachtrag 2026-08-04/5 (dritter Reviewdurchgang):** **(a) Das Erhebungsfenster der
  Startbaseline** war am Fensterstart verankert — damit wäre eine Baseline zulässig gewesen, die
  *vor* der Aktivierung (also aus der Zeit des alten Bestands) oder Stunden danach erhoben wurde.
  Bezugspunkt ist jetzt die **Aktivierung**: `aktivierung ≤ erhoben ≤ aktivierung + 15 min`
  (beide Grenzen inklusiv), und `aktivierung ≤ jetzt`. Alle drei Verstöße sind fail closed —
  `startbaseline-vor-aktivierung`, `aktivierung-in-zukunft` (in der Gesamtbewertung **vor** allen
  Fensterprüfungen) und `startbaseline-zu-spaet-erhoben`. Die Schreibseite setzt dieselben
  Grenzen und erzeugt gar keine Datei (Exit 2). **(b) Kein möglicherweise veralteter Commit als
  Deployment-Stand:** `process_runs.commit_ref` ist der Commit des *jüngsten gespeicherten Laufs*
  und nach einem frischen Deployment veraltet. Das Feld heißt jetzt
  `zuletztBeobachteterProzessCommit` (kein Deployment-Beleg; ein Feld `deploymentCommit` gibt es
  nicht mehr, auch nicht im `--baseline`-Querschnitt); wer den Stand belegen will, übergibt
  `--erwarteter-commit <sha>` — strikt geprüft (Voll-/Kurzform als echtes Präfix), Abweichung ⇒
  Exit 2 ohne Datei, ohne Übergabe bleibt `deploymentCommitBestaetigt: false`. Kanonisch:
  [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) **§7.7.3**. Tests: Vertrag
  **178/178** (+20), Dauerhaftigkeit **52/52**, Mutationsprobe **46 von 46 rot** (+5);
  Production-Proben rein lesend: zukünftige Aktivierung, 2 h zurückliegende Aktivierung und
  falscher erwarteter Commit je **Exit 2 ohne Datei**; korrekter Kurzform-Commit ⇒ bestätigt.
  Dry-Run unverändert `noch_nicht_auswertbar`.

  **Nachtrag 2026-08-04/6 (vierter Reviewdurchgang — die Commitprüfung selbst):** Die in /5
  eingeführte strikte Prüfung war **nicht strikt**. Sie bestand nur aus Längenvergleich und
  `startsWith` und lag im CLI statt im Bewertungskern. Empirisch reproduziert: beobachtet
  `89427c5…1085d`, erwartet dieselbe SHA **plus** `-VOELLIGER-UNSINN` ⇒
  `deploymentCommitBestaetigt: true`; ebenso mit hexadezimalem Anhang und mit verdoppelter SHA.
  Zusätzlich bestanden die §34-Prüfpunkte überwiegend aus **Textsuchen im Quelltext**, und die
  Mutationen M42–M46 betrafen nur die Zeitlogik — eine Lockerung der Commitprüfung wäre nicht
  rot geworden. **Korrektur:** die Prüfung liegt jetzt als `pruefeCommitBeleg` im reinen
  Bewertungskern (`lib/helmut/op25-nachweis.js`), das CLI ruft genau diese Funktion auf. Gültig
  ist nach `trim` + Kleinschreibung nur `/^[0-9a-f]+$/` mit **7–40** Zeichen; Übereinstimmung
  nur bei Gleichheit oder **echtem** Präfix (kürzer *und* Anfang von) — auf **beiden** Seiten.
  Fehlende, zu kurze, zu lange und nicht hexadezimale Werte bleiben fail closed; Großbuchstaben
  und Randleerzeichen sind nach Normalisierung zulässig; ein übergebener, nicht bestätigter
  Commit bleibt Exit 2 ohne Datei. Kanonisch:
  [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) **§7.7.4**. Tests: Vertrag
  **202/202** (+24, davon 24 **echte Verhaltensprüfungen** in §34.1–34.24; Textsuche nur noch
  ergänzend in 34.25–34.30), Dauerhaftigkeit **52/52**, Mutationsprobe **54 von 54 rot** (+8,
  M47–M54, darunter die vier geforderten Lockerungen). Production-Proben rein lesend: identische
  volle SHA, gültige Kurzform und Großschreibung mit Randleerzeichen ⇒ bestätigt; angehängter
  Unsinn, hexadezimaler Anhang, abweichende SHA, 6 Zeichen, Nicht-Hex und 41 Zeichen ⇒ je
  **Exit 2 ohne Datei**. Dry-Run unverändert `noch_nicht_auswertbar` (Exit 3).

  **Nachtrag 2026-08-04/7 (Nachtragskorrektur nach Merge von PR #222 — deploymentgebundene
  Startbaseline + verbindlicher Commitnachweis):** **Statuskorrektur zuerst: PR #222 IST
  GEMERGT** (`origin/main` = Merge-Commit `3fa8830`). **Der OP-25-Production-Nachweis wurde
  NICHT gestartet, es existiert KEINE gültige Startbaseline.** Der aktuelle Zustand von
  `HELMUT_CRON_GLOBALABRUF` in Production ist aus einer Sitzung nicht lesbar und wird nicht
  behauptet — **offene Betreiberprüfung** (frühere Einträge enthalten sowohl „gesetzt seit
  2026-08-03" als auch „bleibt deaktiviert"; keiner der Sätze ist lesend belegt). **Vier am
  alten Stand empirisch reproduzierte Lücken geschlossen:** (1) eine Startbaseline konnte
  **ohne** `--erwarteter-commit` geschrieben werden; (2) `pruefeStartbaseline` prüfte
  `erwarteterDeploymentCommit`/`deploymentCommitBestaetigt` gar nicht (Baseline mit
  `"voelliger-unsinn"` + Vorab-Bestätigung ⇒ akzeptiert); (3) die Gesamtauswertung prüfte die
  `commit_ref`-Werte der `globalphase`-Fensterläufe nie (alle Zeilen mit **fremdem** Commit ⇒
  `bestanden`; alle **ohne** Commit ⇒ `bestanden`); (4) die Schreibzeit-Prüfung verglich den
  erwarteten Commit mit dem **jüngsten alten** Prozesslauf und verwechselte damit den
  Zeitpunkt der Env-Änderung mit ihrer Wirksamkeit — **eine Vercel-Env gilt erst in einem
  neuen Deployment**. **Jetzt gilt:** Aktivierungszeitpunkt = **READY** des neuen
  Production-Deployments, das das Flag enthält · `--startbaseline-schreiben` verlangt
  zwingend den **vollen** erwarteten Merge-Commit (40 Hexziffern), speichert ihn verbindlich
  und prüft beim Schreiben **nicht** gegen alte Läufe · die Auswertung verlangt für **alle**
  Fensterläufe einen gültigen `commit_ref` **exakt** zum gespeicherten Commit — fehlend ⇒
  `blockiert` (`commit-beleg-fehlt`, auch bei fehlender dauerhafter Zeile), abweichend ⇒
  `nicht_bestanden` (`fremder-deployment-commit`; deckt auch ein **weiteres Deployment im
  24-h-Fenster** auf, das deshalb verboten ist) · alte Läufe vor der Aktivierung blockieren
  nicht und bestätigen nichts · Baseline ohne/mit ungültigem/verkürztem Commit oder mit
  Vorab-Bestätigung ⇒ fail closed `blockiert` · Mandatsmenge, Signatur, Aktivierungszeitpunkt
  und Erhebungsfenster (15 min) unverändert streng. **Reviewbefund zum Kopfstand `86df95e`
  eingearbeitet:** die dauerhafte Zeile eines vorhandenen globalen Laufs wird jetzt
  ausschließlich über die **exakt identische runId** zugeordnet (zuvor genügte Slot-Nähe —
  eine andere Zeile desselben Termins hätte den fehlenden exakten Commitbeleg ersetzen
  können; Täuschungstest zuerst am fehlerhaften Stand rot, danach grün); Slot-Zuordnung
  bleibt nur als Rückfallebene für die Verdrängt-Klassifikation ohne Blob-Lauf. **Adversariale
  Nachprobe eingearbeitet (5 weitere Befunde, alle fail closed):** unplatzierbare
  `globalphase`-Zeilen ⇒ `blockiert` statt Warnung · Lesefehler der relationalen
  `process_runs` ⇒ `blockiert` statt Konsolentext · CLI-Pflicht-Gates vor jedem
  Production-Lesezugriff und ohne Netz verhaltensgetestet (Mutationsprobe mutiert erstmals
  auch das CLI) · beide Zugehörigkeitswege des Fenster-Sweeps einzeln festgenagelt ·
  widersprüchliche Flag-Gegenwartsbehauptungen im Kopf von `vorgangskontext.md` als offene
  Betreiberprüfung markiert. **Tests:**
  Vertrag **222/222** (§34 neu: alle acht geforderten Fallfamilien als Verhaltensprüfungen;
  §32 führt den Commit als Pflichtfeld; §35 exakte runId-Bindung; §36 CLI-Gates; §37
  Sweep-Zuordenbarkeit/Belegquelle) · Dauerhaftigkeit
  **52/52** · Mutationsprobe **69 von 69 rot** (M50/51/53/54 umgezogen, **M55–M69** neu). **Production-Proben rein lesend (KEINE Baseline erzeugt):**
  Dry-Run `noch_nicht_auswertbar` (Exit 3) · Schreiben ohne Commit / Kurzform / Anhang /
  2 h alte Aktivierung ⇒ je **Exit 2, keine Datei** · Auswertung mit Baseline ohne Commit ⇒
  `blockiert` (Exit 2). Branch `claude/op25-startbaseline-commitnachweis-mqjixo`, **PR #223**
  (offen, kein Merge). Kanonisch (inkl. verbindlichem Betreiberablauf):
  [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) **§7.7.5**.
- **Nachtrag 2026-08-05 (Erster regulärer Production-Nachweis nach §7.7.5 — ausgeführt und
  NICHT BESTANDEN; der Nachweis beginnt von vorn):** Aktivierung durch den Betreiber
  (`HELMUT_CRON_GLOBALABRUF=on`, nur Production, + Redeploy des unveränderten Merge-Commits
  `2e4e00e9…`/PR #223); Aktivierungszeitpunkt = READY `dpl_4gCKkwSFfagHnCxs2jj4RCWLfviW`
  **2026-08-04 18:23:57.472 UTC**. **Startbaseline gültig** (65 s nach READY, 5 aktive reale
  Mandate `m5-9aee228dbf2c9f13`, voller erwarteter Commit gespeichert; am Fensterende
  byte-identisch) — der Ablauf aus §7.7.5 hat damit erstmals real funktioniert, ebenso der
  **Commitnachweis: alle vier `globalphase`-Fensterzeilen tragen exakt `2e4e00e9…`**, die
  Vor-Fenster-Zeile (`3fa8830`) wurde nicht gewertet, kein Production-Deployment im Fenster
  (Vercel-belegt). **Auswertung 2026-08-05 18:30 UTC: `nicht_bestanden` (Exit 1), 7 Befunde:**
  `laufbeleg-verdraengt` ×2 (crawl 20:00/04:00 dauerhaft belegt, reiche Datensätze von der
  Blob-Retention 20 verdrängt — Ursache: außerplanmäßiger globaler **Watchdog-Lauf 08:03 UTC**
  (D-2) + Sechs-Mandate-Planung des 16:00-Laufs) · `fenster-ungueltig-mandatsmenge-veraendert`
  (der 16:00-Lauf plante **sechs** Mandate inkl. `max-mustermann` — das deaktivierte
  Demo-Mandat war im Fenster zwischenzeitlich reaktiviert, am Fensterende wieder fünf ⇒
  **offene Betreiberklärung**) · `mandatslauf-fehlt` (alle fünf realen Mandate ohne
  abgeschlossenen `mode:"mandat"`-Datensatz zum 16:00-Lauf) · `globalphase-budget-ueberzogen`
  (221 981 ms > 221 668 ms) · `rueckstand-nicht-dauerhaft` (lazy 372/1213 ohne
  pending-Vormerkung, eager 479 nicht vorgemerkt — **E3-Zusage in Production nicht erfüllt**,
  eigener Analysesprint) · `auffaellige-kontextzahl-ohne-erklaerung` (15 > 11). Kosten im
  Fenster 0,1892 USD (Rahmen 2 USD, vollständig); Auswertung rein lesend, 0 KI-Aufrufe.
  Flag steht weiterhin `on` — Belassen/Rückbau ist Betreiberentscheidung. Belege:
  `belege/op25-startbaseline.json` + `belege/op25-auswertung-2026-08-05.log`; Protokoll:
  `CURRENT_STATE.md` 2026-08-05 (11. Durchgang). Branch
  `claude/op-25-production-nachweis-tg44mz`, **PR #226** (kein Merge). **OP-25 bleibt
  TEILWEISE ABGESCHLOSSEN**; vor einem neuen Nachweis: Betreiberklärung Mandats-Toggle ·
  D-2-Entscheidung (Retention/Watchdog) · Analysesprint Vormerkung/Budget/Kontextzahl.
- **Nachtrag 2026-08-05/2 (Ursachenanalyse des gescheiterten Nachweises — ERFOLGREICH
  ABGESCHLOSSEN, rein lesend):** Der echte Production-Kontrollfluss wurde aus den dauerhaften
  Belegen rekonstruiert; **mehrere Kernaussagen des Abschlussberichts sind widerlegt:**
  **(1)** `mandatslauf-fehlt` ist ein **Falschbefund** — alle 6 Mandatsprojektionen des
  16:00-Laufs liefen (16:03:50–16:04:06, 6/6 `erfolgreich`, Fairnesszeile + 6
  `mode:"mandat"`-Datensätze); der Bewertungskern sucht mit dem falschen Schlüssel
  (`runId` statt `globalLaufId`), die Testfixtures kodieren dieselbe falsche Konvention.
  **Der Kapazitätsblocker war im Fenster real gelöst** (crawl UND pipeline je 6/6).
  **(2)** `max-mustermann` wurde **nie im Fenster reaktiviert**: die Laufzeit liest relational
  (`mandate_profiles.aktiv=true`, unverändert seit 20.07.), die Deaktivierung vom 04.08.
  landete nur im `main`-Blob (10:26 UTC), den nur das Nachweis-CLI liest — zwei divergierende
  Mandatswahrheiten, kein Toggle. **(3)** Die Blob-Verdrängung war vorhersagbar: realer Bedarf
  4 Läufe × 7 Datensätze = 28 > Retention 20; der Vertrag rechnete 18 (ohne Watchdog-Slot,
  mit eingefrorenem n=5) und warnte nur. **(4)** Budget +313 ms = Abschlussschreiben nach der
  Vormerk-Deadline (Budget − 5 s), Randartefakt, kein Kapazitätsproblem. **(5)** Echt und
  systemisch ist allein `rueckstand-nicht-dauerhaft` (nv=479–812 in allen 5 globalen Läufen):
  es gibt keine reservierte Vormerkzeit, 2 serielle Round-Trips je Cluster, Lazy-Rest ganz
  ohne Vormerkpfad — der E3-Vertrag verlangt mehr, als der Code je zugesagt hat (Test 3b
  schreibt das schwächere Verhalten als Soll fest). **(6)** Kontextzahl 15 ist erklärt
  (statischer Plan: 7; Rest dokumentgetrieben durch Mehrfachherkunft/DIP; Schwelle `2n+1`
  strukturell blind, wäre wohl auch mit 5 Mandaten gerissen worden). Korrekturen **K1–K8**
  (Werkzeug-Join, eine Mandatswahrheit, Retention/Vertrag, E3-Entscheidung, Kontextvertrag,
  stiller `saveCrawlRun`-Catch, Watchdog-Entscheidung, Abschlussreserve) samt Reihenfolge und
  neuen Abnahmekriterien: kanonisch
  [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) **§7.7.6**. Production
  unverändert (nur GET/SELECT, 0 KI); Flag laut Betreiber inzwischen `off` + Redeploy.
- **Nachtrag 2026-08-08 (dritter regulärer Nachweis 2026-08-07/08 — `BESTANDEN`, Exit 0,
  null Befunde):** Fenster 2026-08-07T20:19:06.409Z → 2026-08-08T20:19:06.409Z;
  Aktivierung `dpl_AdZ4JJJZUAT27X72SWzVeFyJu49a` (Merge **PR #232**, Commit `a07954df…`
  mit dem Kostenlücken-Fix), Baseline +160 s
  (`belege/op25-startbaseline-2026-08-07-fixfenster.json`, SHA256 `8414fab3…`);
  Schutzfenster gehalten (kein Merge/Production-Deployment/Mandatswechsel/manueller
  Lauf; einzig ein PR-#233-Branch-Preview, target null). Auswertung 21 min nach
  Fensterende (`belege/op25-auswertung-2026-08-08.log`, SHA256 `17ed0f83…`): alle
  Vertragskriterien grün — 3/3 Läufe vollständig + im Budget versiegelt, Commitnachweis,
  m5 konstant, K1-Bindung, **E3 `nv=0`**, Kontextzahl 12 erklärt, kein
  Watchdog-Ersatzlauf, Retention 36, **Kosten 0,2106 USD / unbepreist 0** (der Fix aus
  PR #232 wirkte in Production). Kanonisch: **§7.7.9**. **Geltung: ausschließlich die
  aktuelle Architektur mit 5 aktiven Mandaten — beweist weder OP-30 noch 200 Mandate;
  nach Aktivierung der OP-30-Architektur muss OP-25 vollständig wiederholt werden.**
  Der Kern-Production-Nachweis von OP-25 ist damit erbracht; offen bleiben die
  Teilpunkte Abdeckungsmessung, Abdeckungsalarm, R-1, R-3 (und OP-14 separat).
- **Nachtrag 2026-08-07 (zweiter regulärer Nachweis 2026-08-06/07 — `blockiert`, Exit 2,
  genau 1 Befund; alle Betriebskriterien erstmals grün):** Beide Betreiberschritte wurden am
  2026-08-06 ausgeführt (relationale Deaktivierung `max-mustermann` 08:01:31 UTC, 1 Zeile,
  kein Delete; Retention **36** + Redeploy — Beweisprotokoll §9). Fenster: Aktivierung READY
  `dpl_DJCLHxHjKkM3sgCbLB99Vqf6C92c` (Commit `d8bf68fa…`) 2026-08-06T16:24:42.320Z → +24 h;
  Baseline 44 s nach READY (`belege/op25-startbaseline-2026-08-06-neustart.json`, SHA256
  `3b781764…`, m5-9aee228dbf2c9f13); Schutzfenster gehalten (kein Merge/Deployment/
  Mandatswechsel/manueller Lauf). Auswertung unmittelbar nach Fensterende
  (2026-08-07T16:35 UTC, `belege/op25-auswertung-2026-08-07.log`): **`blockiert` (Exit 2)**
  mit genau **einem** Befund `kosten-nicht-bepreisbar` — 1 von 72 Nutzungseinträgen
  (2026-08-07T12:37:40.812Z, interaktive Nutzung, `politicianId=angela-merkel`,
  `model/estimatedCost="unknown"`) trägt keinen brauchbaren Kostenwert; die 71 bepreisten
  summieren 0,1908 USD (Rahmen 2 USD). **Erstmals grün:** 3/3 Läufe vollständig + im Budget
  versiegelt · Commitnachweis (alle Läufe `d8bf68fa…`) · Mandatsmenge konstant m5 auf allen
  Ebenen · K1-Bindung · **E3 `nv=0` in allen drei Läufen** · Kontextzahl 13 erklärt · kein
  Watchdog-Ersatzlauf (K7) · Retention 36 wirksam (36 Blob-Zeilen, Bedarf 30). Einordnung:
  **`nicht_pruefbar`** — kein Kriterium nachweislich verletzt, Kostenvollständigkeit nicht
  belegt. Kanonisch: §7.7.8. **Befundsprint 2026-08-07/2 (Ursache behoben, lokal):** der
  Blocker war ein **Budget-Skip-Marker ohne KI-Aufruf** (`skipped-lage-narrativ`,
  `budget-check-failed-closed`; interaktive Nutzung des Kontos von `angela-merkel` —
  dokumentierte Trennung Konto ↔ Mandat, keine Zugriffslücke). Fix zentral in
  `buildLlmUsageRecord`: explizit gekennzeichnete Nicht-Aufrufe (`keinAufruf: true`, ohne
  Token-Angabe) speichern estimatedCost **0** (Zahl) + Modell-Marker; unbekannte Modelle /
  echte Aufrufe ohne usage bleiben ehrlich blockierend, Kostenvertrag unverändert,
  historischer Eintrag unangetastet. Tests: neue Suite `llm-nutzungsprotokoll-test.js`
  27/27 · Vertrag 271/271 · Kostenmessung 128/128 · Offline 193/208 (baseline-identisch).
  Veröffentlicht als **PR #232** (Commit `0716a4e` + Review-Härtung, CI grün, Suite
  38/38); nach Merge (= Deployment) neues Fenster von vorn (§7.7.5); das alte Fenster
  bleibt `nicht_pruefbar`. **OP-25 bleibt TEILWEISE ABGESCHLOSSEN.**
- **Nachtrag 2026-08-05/3 (Korrektursprint K1–K8 — Repo-Umsetzung vollständig, Production-
  Schritte offen):** Alle acht Korrekturen aus §7.7.6 sind umgesetzt und grün geprüft —
  **K1** Bindung über `globalLaufId` (+ Fixture-Härtung, echtes Scheduler-Laufpaar in
  `scripts/op25-laufpaar-test.js`; Folgefund behoben: Kompaktierung strippte
  `matching`/`decisions`), **K2** CLI liest die kanonische relationale Mandatswahrheit über
  dieselbe Laufzeitfunktion (kein Blob-Rückfall; Signatur-Widerspruch blockiert den Start),
  **K3** Aufbewahrungsbedarf = (Regel+Watchdog)×(1+n)+Puffer mit harter Blockade und
  Start-Gate, **K4** E3 eingelöst (Bulk-Vormerkung nach F-RT, reservierte Vormerk-/
  Abschlusszeit, Vormerkpfad für Lazy-Rest und übersprungene Stapel, aufgehende Laufbilanz,
  Test 3b verschärft, 1 250-Cluster-Test), **K5** persistierte Kontext-Zusammensetzung
  (unbelegt = Diagnosebedarf statt Fehlurteil), **K6** Persistenzfehler der Projektion
  ⇒ `failed:true` (nie stilles Grün), **K7** Watchdog nur noch bedingt (Lesefehler fail
  closed, Zeitplan unverändert), **K8** Abschlussreserve 10 s + Versiegelungstoleranz 1 s
  (+313 ms korrekt als Messartefakt). Tests: Vertrag **271/271** · Dauerhaftigkeit
  **55/55** · Laufpaar **29/29** · Watchdog **26/26** · Mutationsprobe **87 von 87 rot**
  (M70–M87 neu). Kein Production-Write, 0 KI, keine Migration. **Offene Betreiberschritte
  vor dem neuen Nachweis:** `max-mustermann` relational deaktivieren (nie löschen) und
  `HELMUT_CRAWL_RUN_RETENTION=36` setzen — Ablauf, empfohlene Werte und kleinste sichere
  Betreiberaktion: [`betrieb/op25-korrektursprint-2026-08-05.md`](betrieb/op25-korrektursprint-2026-08-05.md)
  §5–§7. **OP-25 bleibt TEILWEISE ABGESCHLOSSEN** (Production-Nachweis beginnt danach von
  vorn nach §7.7.5).
- **Nachtrag 2026-08-04 (Profilreparatursprint):** Künftige OP-25-Production-Nachweise arbeiten
  mit **fünf aktiven realen Mandaten** statt sechs — das Demo-Mandat `max-mustermann` ist seit
  2026-08-04 deaktiviert (nicht gelöscht, OP-04-Teilschritt), sofern bis zum Nachweis keine
  separat freigegebenen Mandate hinzukommen. Ältere Statuseinträge mit „sechs Mandaten" sind
  entsprechend zu lesen. Der Production-Nachweis selbst bleibt **offen** und beginnt
  vollständig neu; dieser Sprint hat ihn ausdrücklich **nicht** erbracht (kein Crawl, kein
  Pipeline-Lauf ausgelöst).
- **Status (2026-07-30, Abschlussdurchgang):** **Repository-Umsetzung vollständig und CI-belegt,
  Production-Nachweis offen.** **Jeder Commit des Branches hat das CI-Gate grün passiert** —
  beide Pflicht-Checks, jeweils Offline **183/183** und Browser **32/32** (`eeaa363` Lauf
  `30499103799` · `2dc4154` Lauf `30516881711` · `ee1bce4` Lauf `30517066137` · `a251d91` Lauf
  `30517190157`). Drei Nachprüfungen ergänzt: **(1)** die Garantie
  `ceil(n/k)` gilt **nur** für `k ≥ 1` — ein Lauf ohne Kapazität wird jetzt als solcher
  ausgewiesen (`kapazitaet`, `fortschrittsgarantie`, `ohneFortschritt`, `obergrenzeLaeufe: null`,
  wörtlicher `systemError`), schreibt **nichts** und verschiebt die Warteschlange nicht.
  **(2)** Der Überlappungsschutz ist bewiesen: `crawl-<mandat>` wird als erste Anweisung in
  `runSourceCrawl` erworben (TTL 15 min), ist **atomar und fail-closed** und in Production
  **nachweislich aktiv** — rein lesend geprüft, die Lock-Zeilen des regulären 04:00-Crawls vom
  2026-07-30 tragen einen Token, den nur die atomare RPC schreibt. Ein atomarer Mandatsclaim in
  der Fairnessschicht ist damit **nicht erforderlich**. **Dabei korrigiert:**
  [`betrieb/env-inventar.md`](betrieb/env-inventar.md) behauptete, Migration `20260719` sei „NICHT
  auf Prod angewendet" und der Modus sei fail-open — **falsch**; FT2-2 dieser Liste und
  `CLAUDE.md` §5 hatten recht. **(3)** Die Persistenz ist gehärtet: Lesefehler → kein
  Schreibvorgang, neuere Schemaversion → kein Schreibvorgang, Versuchsvermerk wird gegengelesen
  und begrenzt wiederholt, korrupte Einträge blockieren niemanden. Tests **176/176**,
  Mutationsprobe **9 von 9 rot**. **Frischer Beleg, dass der Fehler bis zuletzt auftrat:** der
  Lauf vom 2026-07-30, 04:05:04 UTC gab seine Sperre nie frei — Prozessende am Zeitlimit beim
  **zweiten** Mandat der alphabetischen Reihenfolge, gleiches Muster wie am 29.07.
- **Nachtrag 2026-07-30 (Vorprüfung Mergefreigabe): ein echter Fehler gefunden und behoben.**
  Der Fairnessvermerk entsteht **vor** der Verarbeitung, die Sperre `crawl-<mandat>` erst **in**
  `runSourceCrawl` — und die **wirft** bei verweigerter Sperre nicht, sondern liefert
  `{ skipped: true, reason: "already running" }`. Die Schleife wertete das als Erfolg und schrieb
  einen **erfundenen Erfolg**, zählte das Mandat in die Kapazität `k` und machte die gemeldete
  Obergrenze `ceil(n/k)` **zu optimistisch**. `fremderHalter` deckt diesen Pfad **nicht** ab (der
  eigene, jüngere Vermerk führt die Verschmelzung). Jetzt: kein `begonnen`, nicht in `k`, **kein**
  Abschluss-Schreibvorgang, eigener sichtbarer Ausgang (`lockVerweigert` / `sperreVerweigert=…`).
  Der Versuchsvermerk bleibt `laufend`, sperrt weitere überlappende Läufe und läuft nach 30 min ab.
  Tests **201/201**, Mutationsprobe **10 von 10 rot**. Details:
  [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) §3a.1.
- **Aktivierung:** `HELMUT_CRON_FAIRNESS` ist **ohne gesetzte Variable aktiv** (nur `off`/`false`/`0`
  schalten ab) und **nicht** über `helmut-flags.json` steuerbar — der Merge verändert damit
  unmittelbar das Production-Verhalten, der Rückweg läuft ausschließlich über die Vercel-Env.
- **Verbindliche Folgeregel:** **weitere reale Testmandate erst nach Merge UND erbrachtem
  regulärem Production-Nachweis.** Die Rotation verteilt den Rückstand gleichmäßig, sie
  vergrößert das Zeitbudget nicht: bei `n` Mandaten und `k` begonnenen je Lauf steigt der Abstand
  zwischen zwei Versuchen desselben Mandats auf `ceil(n/k)` Läufe. `k` ist in Production noch
  **unvermessen** — ein Lauf am 2026-07-30 endete bereits beim zweiten Mandat am Zeitlimit.
  Begründung und Rechenweg: [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) §9.
- **Status (2026-07-29, Sprint OP-25-Fairness, 1. Durchgang):** **Teilstück (b) umgesetzt,
  Production-Nachweis offen.** Der Kernbefund wurde gegen `main` nach PR #178 (`51732e2`) **bestätigt**:
  `listActiveTenantIds` endete auf `ids.sort()` (alphabetisch), `runCronForTenants` lief seriell
  gegen `Date.now() > deadline`, und es gab **keinen** persistenten Fortschritt je Mandat — die
  Verdrängung traf also strukturell immer dieselben Mandate. Präzisierung zum Auftrag: „4 von 6"
  ist der Messwert vom **2026-07-24**; am **2026-07-29** waren es **6 von 7**.
  **Jetzt:** faire Rotation nach dem ältesten letzten **Versuch**
  ([`lib/helmut/cron-fairness.js`](../lib/helmut/cron-fairness.js)), Versuch **vor** der
  Verarbeitung persistiert (eigene `helmut_store`-Zeile — **keine Migration**, keine RLS-Änderung,
  kein Freigabegate), nachrechenbare Obergrenze **ceil(n/k)** reguläre Läufe, Beobachtbarkeit je
  Mandat (`[cron/*/fairness]` + `fairness` im Antwortkörper), `systemError` mit **Kennungen** der
  nicht verarbeiteten Mandate. Rückweg: `HELMUT_CRON_FAIRNESS=off`. Tests: neue Suite **176/176**,
  Offline-Suite **169/183** (Baseline `main` 168/182 — dieselben 14 umgebungsbedingten
  Fehlschläge), Browser-Smoke **32/32**, Mutationsprobe **9 von 9 rot**. **0 KI, 0,00 USD, keine
  Migration, keine Cron-/Budgetänderung, kein Production-Zugriff.** Kanonisch:
  [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md). **Offen bleiben:** (a) die Messung, wie
  viele Mandate je Lauf real die Matching-Stufe erreichen, (c) ein Abdeckungsalarm über mehrere
  Läufe hinweg (der Einzellauf meldet jetzt, die Serie noch nicht) — und der **reguläre
  Production-Nachweis** nach Merge.
- **Status (2026-07-31, 2. Durchgang — regulärer Production-Nachweis, rein lesend): TEILWEISE
  BESTANDEN. OP-25 bleibt teilweise abgeschlossen.** Beobachtungsfenster 30.07. 06:27:19 UTC
  (Deployment `READY`, Commit `30c86cf`) → 31.07. 08:00 UTC; **5 reguläre fairness-relevante
  Läufe** gewertet, 1 Lauf (30.07. 07:52 `pipeline`) als **nicht regulär** ausgeschlossen (kein
  Cron-Termin). **Die Fairnesslogik arbeitet korrekt:** Reihenfolge nachweislich **nicht
  alphabetisch** und je Lauf verschieden; nicht begonnene Mandate rückten im Folgelauf vor
  (`crawl` 20:00 → M-1/M-6, `crawl` 04:00 → M-4/M-2); **kein erfundener Erfolg** (das jeweils
  zweite begonnene Mandat trägt `versuche=1, erfolge=0` ohne `letzterErfolgAt`, obwohl der Lauf
  global HTTP 200 meldete); `ceil(n/k)` stimmt mit den gemeldeten Werten überein (`k=1` →
  `obergrenzeLaeufe=6`; `k=6` → `1`); persistenter Zustand über **drei Commits** und 22 Stunden
  erhalten; **kein `k=0`** (min. `k=1`); **keine** neuen Runtime-/DB-/Lock-/Fairnessfehler
  (`zustand=ok` überall); der Zeitbudget-Abschnitt wird **gemeldet** statt still grün zu bleiben.
  **Nicht bestanden:** ein **vollständiger Fairnesszyklus** gelang nur beim leichtesten Cron
  (`morning-briefing`, `k=6`, 6/6 in einem Lauf, 13 596 ms). Im schweren Pfad: `crawl` 4/6,
  `pipeline` 4/6, `lage-check` 1/6. **Wichtige Korrektur einer bisherigen Erwartung:** der
  Fairnesszustand ist **je Cron getrennt** (`data.crons[<cronName>]`) — „über vier Läufe
  verschiedener Crons sind alle Mandate begonnen" war fachlich falsch. **Gemessene Kapazität bei
  n = 6:** min `k` = **1** (`lage-check`), typisch **2 begonnen / 1 erfolgreich** (`crawl`,
  `pipeline`), max **6** (`morning-briefing`). Daraus real: ein Mandat wird im `crawl` alle
  **1,5 Tage begonnen** und alle **3 Tage erfolgreich** verarbeitet, im `lage-check` alle
  **6 Tage**. **Hochrechnung (keine Messung) bei n = 11:** `crawl` 3 bzw. 5,5 Tage, `pipeline`
  6 bzw. 11 Tage, `lage-check` 11 Tage. **Neuer Befund R-6 (Beobachtbarkeitslücke):** endet
  `crawl`/`pipeline` im äußeren `withTimeout(…, 280000)` (innere Deadline 270 000 ms), kehrt
  `runCronForTenants` nie zurück — die `[cron/*/fairness]`-Zeile wird **nie geschrieben**
  (`tenants=undefined bounded=true`). Betroffen **3 von 5** gewerteten Läufen; `k` musste dort
  aus dem persistenten Zustand rekonstruiert werden. Die Buchführung bleibt korrekt, nur die
  Telemetrie fehlt — behebbar ohne Fairnessänderung, **eigener Sprint**. **ENTSCHEIDUNG zu den
  fünf weiteren realen Testmandaten: NICHT aktivieren** (auch nicht einzeln). Vorbereiten ist
  erlaubt. Begründung: nicht die Fairness, sondern die **Kapazität** ist der Blocker — schon bei
  sechs Mandaten ist die Datengrundlage je Mandat 1–3 Tage alt; das täglich erzeugte
  `morning-briefing` baut auf genau diesen Daten auf. Voraussetzung für eine spätere Aktivierung
  ist ein höheres `k` im schweren Pfad (mehr Cron-Slots, Parallelisierung, kürzere
  Google-News-Timeouts → OP-15, oder eine Stufe außerhalb des 300-s-Fensters). Rein lesend
  erhoben, **0 KI, 0,00 USD**, keine Production-Schreibzugriffe, kein manueller Lauf, Mandate nur
  pseudonymisiert. Kanonisch: [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) **§10**.
- **Status R-6 (2026-07-31, Sprint „Zuverlässige Cron-Telemetrie bei Zeitüberschreitung"):
  IM CODE BEHOBEN, Production-Nachweis offen.** **Ursache dreiteilig belegt:** `withTimeout` ist
  ein `Promise.race` und beendet die ursprüngliche Promise nicht · die innere Deadline ist ein
  **START**-Gatter, kein STOPP-Gatter (ein begonnenes Mandat überzieht sie beliebig weit —
  offline gemessen > 400 s), deshalb kann **kein** konstanter Aufschlag die Lücke schließen ·
  ein `finally` allein trägt bei einem Vercel-Prozessabbruch nicht. **Behebung, additiv und ohne
  Migration:** dieselbe `helmut_store`-Zeile `<storeId>-cron-fairness` trägt zusätzlich einen
  **Laufdatensatz je Cron** (`laeufe[<cron>]`), der bei **jedem Mandatsübergang** fortgeschrieben
  wird — huckepack auf die ohnehin fälligen Schreibvorgänge (Zusatzkosten: 2 kleine
  Schreibvorgänge je Lauf, ~0,04 % des Zeitbudgets). Der äußere Catch der Routen `crawl`,
  `pipeline` und `lage-check` vermerkt **nur die Tatsache** des Zeitlimits, nie einen Abschluss;
  ein später eintreffender echter Abschluss gewinnt. `cron-fairness.rekonstruiereLauf` rechnet
  die vollständige Telemetriezeile inklusive `kapazitaet` und `ceil(n/k)` aus den
  Zwischenständen nach. **Nicht begonnen, begonnen-ohne-Abschluss, erfolgreich, fehlgeschlagen,
  verweigerte Sperre und Zeitbudget bleiben eindeutig getrennt**; ein Prozessabbruch kann keinen
  erfundenen Erfolg erzeugen (ein veraltetes `laufend` **ist** die Abbruchmeldung). **Reihenfolge,
  `k`, `ceil(n/k)`, Zeitbudgets, Cron-Zeiten und Kosten unverändert** (vertragsgetestet).
  Tests: cron-fairness **285/285** (vorher 201/201), Mutationsprobe **15/15 rot** (5 neu),
  Offline-Suite **177/191** ohne Delta zur Basislinie `main` `bd7c889`, Smoke **32/32**.
  **0 KI, 0,00 USD.** Kanonisch inkl. Nachweisverfahren:
  [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) **§11** (§11.8 = späterer Nachweis).
  **Der Kapazitätsblocker bleibt unverändert offen** — er war ausdrücklich nicht Gegenstand.
- **Status R-6 (2026-08-02): PRODUCTION-NACHWEIS §11.8 GESCHEITERT, R-6 damit WIEDER OFFEN —
  Ursache liegt aber NICHT in R-6.** Der reguläre Lauf
  `cron-morning-briefing-20260802050021-opjp0` meldete `erfolgreich=6 … zustand=ok`, während
  die Zeile `main-cron-fairness` für denselben Lauf nur **fünf** Abschlüsse trug; ein Mandat
  stand dort mit der Kennung genau dieses Laufs auf `begonnen`/`laufend` und mit einem letzten
  Erfolg vom Vortag. **Belegte Ursache (neuer Befund F-CAS):**
  `storage.saveCronFairnessState` war ein Lesen–Verschmelzen–Schreiben **ohne Bedingung**; der
  nach seinem äußeren Zeitlimit intern weiterlaufende `crawl`-Lauf
  `cron-crawl-20260802040020-5rsy9` schrieb ~05:00:33 UTC auf einem Lesestand von **vor** dem
  Abschluss zurück und löschte ihn. Die monotone Verschmelzung schützt dagegen prinzipiell
  nicht — sie ist monoton gegenüber dem *gelesenen* Stand. Dass der Lauf `zustand=ok` meldete,
  **beweist** den verlorenen (nicht den fehlgeschlagenen) Schreibvorgang. **Behoben
  (2026-08-02):** bedingtes Schreiben (Compare-and-Set über `data.rev`, kein unbedingter
  Schreiber mehr auf dieser Zeile), keine Rückstufung eines persistierten Abschlusses durch
  einen verspäteten Versuchsvermerk, und eine Gegenprobe am Laufende, die gemeldete gegen
  gespeicherte Wahrheit prüft und jede Abweichung als eigenen `systemError` meldet.
  **Fachliche Verarbeitung war nicht betroffen** (alle sechs Mandate wurden verarbeitet); die
  Rotation war im beobachteten Lauf unverändert, ist durch denselben Defekt aber **nicht
  garantiert**. Keine Migration, `FAIRNESS_VERSION` bleibt 2, Reihenfolge/Budgets/Cron-Zeiten
  unverändert. Tests: neue Suite `cron-fairness-persistenz-test.js` **54/54** ·
  Mutationsprobe **11/11 rot** · `cron-fairness` **285/285** unverändert. Kanonisch:
  [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) **§13** (§13.6 = neuer Nachweis).
  **§11.8 muss nach dem Merge vollständig neu laufen.**
- **Status R-6 + F-CAS (2026-08-03, regulärer Production-Nachweis, 2. Durchgang, rein lesend):
  BESTANDEN. R-6 und F-CAS sind damit geschlossen — OP-25 insgesamt bleibt TEILWEISE
  ABGESCHLOSSEN.** Beobachtungsfenster **2026-08-02 09:42:33 UTC** (Deployment `READY`,
  Commit `26dc9b1` = Merge PR #208) → **2026-08-03 10:04:36 UTC** = **24 h 22 min**;
  **sieben** reguläre fairness-relevante Läufe gewertet, **vier** davon mit äußerem Zeitlimit.
  Der Fairness-/Speicherpfad ist über die drei Deployments des Fensters (#208, #209, #210)
  **byte-identisch** — `git diff 26dc9b1 9ad7bcf` über `cron-fairness.js`, `storage.js`,
  `server.js`, `vercel.json`, `helmut-flags.json` ist leer. **§11.8: 6 von 7 Prüfpunkten voll
  erfüllt**, Prüfpunkt 7 der Sache nach erfüllt (kein Wachstumsmechanismus), aber die
  Zahlenangabe „~4–8 KB" ist durch die Production-Messung **9,2 KB** überholt und wurde als
  überholt ausgewiesen statt gelockert. **§13.6: alle 6 Prüfpunkte erfüllt.** **Kernbeleg
  gegen F-CAS:** das `morning-briefing` vom 03.08. meldete `erfolgreich=6` **und** die Zeile
  trägt sechs Abschlüsse — am 02.08. waren es bei derselben Meldung fünf. Zusätzlich trägt die
  Zeile `rev = 46`, exakt die aus der Buchführung der sieben Läufe unabhängig nachgerechnete
  Zahl fälliger Schreibvorgänge (8+5+5+5+14+5+4): kein Schreibvorgang fehlt, keiner ist
  doppelt. Alle drei geschriebenen Telemetriezeilen tragen `abweichung=- zustand=ok`; im
  Fenster existieren genau **zwei** `systemError` (beide „Zeitbudget erschoepft" mit
  Kennungen), **kein** Persistenz-Eintrag; `pipeline_locks` unauffällig (3 Zeilen, alle mit
  regulärer TTL abgelaufen); keine neuen DB-, Sperr- oder Fairnessfehler. **Zwei
  Einschränkungen, ausdrücklich:** (1) der **Compare-and-Set-Konfliktpfad wurde in Production
  nicht ausgeübt** — kein am Zeitlimit gestorbener Lauf hat während eines anderen Crons noch
  geschrieben; er bleibt offline belegt, ein Erzwingen wäre ein verbotener manueller Lauf.
  (2) **Verweigerte Sperre trat erneut nicht auf** (`sperreVerweigert=-` überall) — die
  Zusicherungen aus §3a.1 bleiben wie schon 2026-07-31 nur offline belegt. **NEUER BEFUND
  F-POS:** in `crawl`/`pipeline` (`k=2`) ist die Position im Lauf über die Zyklen **stabil**,
  weil `letzterVersuchAt` der Rotationsanker ist und das erste Mandat einen ~4 min älteren
  Versuchszeitpunkt behält. Folge: die Zweitplatzierten schließen fast nie ab — Erfolgszähler
  `crawl` 2/3/3 (erst) gegen 1/1/**0** (zweit), `pipeline` 3/3/3 gegen 0/0/1; ein Mandat trägt
  im `crawl` `versuche=3, erfolge=0` **ohne jedes** `letzterErfolgAt`. **Kein Fairnessfehler**
  (die Garantie aus §4 ist über *begonnen* definiert und hielt lückenlos: jedes Mandat wurde in
  `ceil(6/2)=3` Läufen begonnen), sondern die Fortsetzung des Kapazitätsblockers — mit der
  schärferen Aussage, dass der Rückstand **strukturell dieselben** Mandate trifft. **Damit ist
  die Spalte „Läufe bis erfolgreich" in `cron-fairness.md` §10.5 zu optimistisch**; für die
  Zweitplatzierten lautet die richtige Antwort „nicht garantiert". **Zwei
  Dokumentationskorrekturen:** (D-1) `zeitbudget[]` ist kein Feld des Laufdatensatzes, der
  Ausgang steht in `ausgaenge` — Verhalten korrekt, Feldname unpräzise; (D-2) der in §10.2 als
  „nicht regulär" ausgeschlossene `pipeline`-Lauf vom 30.07. 07:52 war **planmäßig** (GitHub-
  Actions-Watchdog `briefing-watchdog.yml`, `event=schedule`) — `vercel.json` ist nicht die
  einzige Zeitplanquelle. **Betriebsbeobachtung:** der Watchdog schlägt seit 27.07. **täglich**
  fehl, weil die von ihm ausgelöste `pipeline` im 280-s-Limit endet (**B5**) — der
  Backstop-Alarm steht dauerhaft rot und ist als Signal wertlos. **Offen bleibt unverändert:**
  der Kapazitätsblocker (§10.5/§10.7), Teilstück **(a)** Abdeckungsmessung, Teilstück **(c)**
  Abdeckungsalarm über mehrere Läufe, und die Aktivierung von **K1** (Default AUS).
  **Testmandat-Sperre unverändert: weitere reale Testmandate bleiben deaktiviert.**
  Rein lesend erhoben, **0 KI-Aufrufe, 0,00 USD**, kein Production-Schreibzugriff, kein
  manueller Lauf, kein Trigger, keine Env-/Flag-/Cron-/Budget-/Quellenänderung, Mandate nur
  pseudonymisiert. Kanonisch: [`betrieb/cron-fairness.md`](betrieb/cron-fairness.md) **§14**.
- **Status K1 (2026-07-31, Sprint „Globale Erfassung und mandatsbezogene Projektion trennen"):
  IM REPOSITORY UMGESETZT als SCHATTENPFAD, in Production NICHT aktiviert.** **Bestandsprüfung
  gegen `main`:** von den zwölf Schritten in `runSourceCrawl` sind **fünf global** (Abruf,
  Rohitems, Rohdokumente, Lazy-/Eager-Understanding) und werden je Mandat **wiederholt**; nur
  Matching, Entscheidungen und die Mandatstelemetrie sind echte Projektionen. Der Rohkorpus
  (`raw_documents`) und die Wissensobjekte tragen **keinen** Mandantenbezug — die
  Ausgangsthese ist damit bestätigt, aber zu grob: das prozessweite Gedächtnis geteilter
  Abrufwege entdoppelt schon heute einen Teil, teuer bleibt die Wiederholung von Quellenplan,
  eigenen Abrufwegen, Dedup, Clustering und einem **eigenen 90-s-Verstehensbudget je Mandat**.
  **Umsetzung:** neues Modul `lib/helmut/cron-globalphase.js` (Vereinigungsmenge,
  Budgetaufteilung, Datenstandsvertrag, Kapazitätsmodell — rein, IO-frei) plus
  `scheduler.runGlobaleErfassung` / `scheduler.runMandatsProjektion`. **`runSourceCrawl` bleibt
  unangetastet.** **Flaggrenze:** `HELMUT_CRON_GLOBALPHASE`, **Default AUS**, fail closed
  (nur `on`/`true`/`1`/`an` schalten ein), **nicht** über `helmut-flags.json` setzbar — die
  Aktivierung ist ausschließlich eine Vercel-Env-Entscheidung. **Ohne Flag ist der Aufruf
  byte-identisch zum bisherigen** (Quelltextvertrag + Mutationsprobe M8). **Vereinigungsmenge
  bewiesen** gegen das **echte** relationale Seed-Modell (Modus `on` wie Production) mit acht
  Profilen, darunter je ein Berliner und ein Brandenburger Landtagsprofil: Vollständigkeit,
  jede Kennung genau einmal, alle acht Personenquellen erhalten, **0 Berliner und 0
  Brandenburger Landeswege**, keine manuellen, keine deaktivierten Wege, kein DIP-Weg im
  Quellencrawl. Gemessen: **1 162 Einzelplan-Wege → 196 in der Vereinigung** (966 geplante
  Abrufe weniger je Lauf). **Kapazität (deterministische Laufzeitsimulation, beide Pfade am
  echten Produktionscode):** production-kalibriert erreicht der **alte** Pfad bei sechs
  Mandaten **2 von 6** im 270-s-Fenster und überzieht es um 37,6 s, der **neue** **6 von 6**
  ohne Überziehung; bei elf Mandaten **2 von 11** gegen **11 von 11**. Grenzkosten je
  zusätzlichem Mandat **32 920 ms → 6 620 ms**. **Modellrechnung** mit den Production-Werten
  (globale Arbeit 240 s, Projektion 1,65 s): n=6 **1/6 → 6/6**, n=11 **1/11 → 10/11** — bei elf
  Mandaten bleibt je Lauf **eines** übrig (`ceil(11/10) = 2` Läufe). **Drei Unterschiede
  benannt und bewertet, keiner weggeredet:** **K1-1** die Vorgangskennung hängt an der
  Bündelung (global 1 Cluster statt 2 mit anderen Kennungen; der Resolver hält beide für
  denselben Vorgang, kein Dokument geht verloren) · **K1-3** das 90-s-Verstehensbudget gilt
  künftig je **Lauf** statt je **Mandat** (der Rest bleibt zurückgestellt und wird vom
  dedizierten Understanding-Cron geholt) · **K1-4** im alten Pfad matcht ein früh
  verarbeitetes Mandat gegen einen **unvollständigen** Korpus; im neuen sehen alle denselben.
  Nach zwei Läufen sind beide Pfade **feldgleich** (Rohdokumente, Wissensobjekte, Matching,
  Scores, Entscheidungen, Mandantentrennung, KI-Aufrufe). **Zwei Bestandsbefunde nebenbei
  belegt:** `crawlAllSources` kennt **keine** Deadline (im neuen Pfad durch stufenweisen Abruf
  begrenzt, `crawler.js` unverändert) und `budgetMs = 0` bedeutet in `runUnderstandingShadow`
  „**kein** Limit" statt „keine Zeit" (im neuen Pfad ehrlich übersprungen; `runSourceCrawl`
  bewusst nicht angefasst). **Tests:** neue Suite **169/169**, Mutationsprobe **17/17 rot**,
  Offline-Suite **178/192** gegen Basislinie `origin/main` `61a0947` **177/191** mit
  **identischer** Fehlschlagliste (Delta genau +1 = die neue Suite), Browser-/Mobile-Smoke
  **32/32**, `cron-fairness` **285/285**, `punkt29-fehlervertrag` **80/80**,
  `pipeline-zeitbudget` **21/21**, `source-architecture` **99/99**. **0 KI-Aufrufe, 0,00 USD,
  keine Migration, kein Production-Zugriff, keine Cron-/Budget-/Quellen-/Flagänderung, Berlin/
  Brandenburg/M8/Testmandate unverändert AUS.** **Der Kapazitätsblocker ist damit NICHT
  geschlossen** — er ist gelöst *gebaut*, aber nicht *aktiviert*. Kanonisch:
  [`betrieb/cron-globalphase.md`](betrieb/cron-globalphase.md).
- **Status K2 (2026-07-31, Sprint „Fachliche Absicherung der globalen Bündelung"):
  BEFUND K1-1 VOLLSTÄNDIG BEWERTET — er bleibt bestehen und ist BREITER als in K1 beschrieben.
  Keine Aktivierung, kein Flag gesetzt, keine Production-Änderung.** Geprüft wurde nicht der
  Kapazitätsgewinn (der gilt unverändert), sondern die Frage, ob die globale Bündelung
  **dieselben politischen Vorgänge korrekt zusammenführt**. **Verfahren:** dreizehn konstruierte
  Fallfamilien (identische und leicht abweichende Dokumente, gleiche und verschiedene
  Vorgangsnummer, verschiedene Schreibweisen, mehrere Dokumente eines Vorgangs, ähnliche Titel,
  Personen-, Partei- und Ausschussquellen zweier Mandate) laufen durch **beide** Pfade gegen den
  **echten** Produktionscode (`clusterRawDocuments`, `deriveVorgangId`, `candidatePrefixes`,
  `sameVorgang`, `resolveVorgang`, `understandOneCluster`, Schemaprüfung); nur der KI-Aufruf ist
  ein Testdouble. **Ursache, mechanisch belegt:** Helmut entscheidet „gehört zusammen" in **zwei
  Regimen** — *lose* innerhalb eines Batches (**eine** paarweise Kante, transitiv wirksam) und
  *streng* zwischen Batches (gemeinsames Themenwurzel-**Präfix** UND `sameVorgang` Kern gegen
  Kern). Die globale Bündelung verschiebt alle Dokumente **mandatseigener** Quellen (nach der
  K1-Messung **58 von 196** Wegen bei acht Profilen) vom strengen ins lose Regime. Dokumente
  **geteilter** Quellen sind nicht betroffen (sie liegen schon heute im Batch des ersten
  Mandats — im Test belegt). **Drei Teilbefunde, jeder einzeln belegt und mutationsgesichert:**
  **K1-1a** fachlich **verschiedene** Vorgänge verschmelzen global (Ursache: Formularvokabular
  wie „Antrag", „Drucksache", „Fraktion", „beantragt", „Abgeordnete", „besucht", „Anhörung",
  „Tagesordnung" trägt heute volles Beweisgewicht) · **K1-1b** die Kernanker-Nachprüfung ist
  **nicht monoton**, die globale Bündelung **trennt** deshalb auch, was mandatsweise ein Vorgang
  war · **K1-1c** Ketten (`x~y`, `y~z`, `x!~z`) wirken global über die Mandatsgrenze hinweg.
  **Bilanz über 13 Familien:** 6 abweichend — 1 fachlich besser, 4 schlechter, 1 nur anders.
  **Ehrliche Gegenprobe:** eine der Fehlverschmelzungen tritt in **beiden** Pfaden auf — der
  Fehler ist **Bestand**, K1 macht ihn nur breiter wirksam. **Korrektur einer K1-Aussage:** die
  §8-Bewertung („alle Kennungen teilen dasselbe Suchpräfix, `sameVorgang` hält sie für denselben
  Vorgang") gilt für den dort gemessenen Fall, **nicht allgemein**; in den heute getrennten
  Fällen fehlt das gemeinsame Präfix, und `sameVorgang` würde sie sogar **zusammenführen** — der
  heutige Schutz ist die **Enge der Präfixsuche**, nicht der Belegvergleich. Der Satz „die
  globale Bündelung ist die kanonisch richtige" ist damit **nicht belegt**. **Bewiesene
  Garantien (unverändert gültig):** kein Dokument geht verloren (Partition, auch bei feindlichen
  Eingaben) · jedes Dokument bekommt genau eine Verknüpfung · kein Dokument an zwei Vorgängen ·
  keine doppelten Vorgänge · kein Wissensobjekt verschwindet · **keine** Mehrkosten (gemessen
  24 → 14 KI-Aufrufe) · Mandantentrennung unverändert (Wissensobjekte tragen keinen
  Mandantenbezug) · Kennungsformat und Resolver-Anschluss bleiben · reihenfolgeunabhängig (120
  Dokumentpermutationen, Quellen- und Mandatsreihenfolge) · Sicherheitsventil greift.
  **Nebenbefund zugunsten von K1:** der **alte** Pfad ist von der Mandatsreihenfolge abhängig,
  der neue nicht. **Fachliche Bewertung:** technisch verlustfrei, aber ein Verlust an
  **Entscheidungsschärfe** — ein verschmolzener Vorgang ist **ein** Wissensobjekt mit **einer**
  Überschrift und **einer** Empfehlung, der zweite politische Vorgang hat danach keine eigene
  Entscheidung mehr (Fehlerklasse „Digest-Cluster", vgl. Rollbackfall F-3). **Kein Datenschutz-
  oder Mandantentrennungsproblem.** **Gemessene Option (nicht umgesetzt):** eine rein
  **aufgezählte** Formularwortliste in `GENERISCHE_ANKER` (32 Wörter, Stil der Hotfixes
  B4-3/B4-4) hebt die korrekte Trennung von **7/12 auf 11/12**, **ohne** einen fachlich
  zusammengehörigen Fall auseinanderzureißen — sie wirkt auch im alten Pfad und ist damit ein
  eigener, freigabepflichtiger Sprint (sie ändert die **aktive** Vorgangsbildung sofort und ohne
  Flag). **Tests:** neue Suite `globalphase-buendelung-test.js` **56/56**, Mutationsprobe
  `globalphase-buendelung-mutationsprobe.js` **15/15 rot**, Offline-Suite **179/193** gegen im
  selben Arbeitsbaum gemessene Basislinie **178/192** mit **identischer** Fehlschlagliste (Delta
  genau +1 = die neue Suite), Browser-/Mobile-Smoke **32/32**, `cron-globalphase` **169/169**,
  `cron-fairness` **285/285**, `vorgangsidentitaet` **67/67**, `vorgangs-resolver` **54/54**,
  `vorgangs-beweisfamilien` **103/103**, `vorgangs-uebernahme-analyse` **35/35**,
  `vorgangs-lebenszyklus` **81/81**, `herausgeber-identitaet` **109/109**,
  `vorgangsbildung-verlust` grün. **0 KI-Aufrufe, 0,00 USD, keine Produktionsdatei geändert,
  keine Migration, kein Production-Zugriff, kein Flag gesetzt, Berlin/Brandenburg/M8/
  Testmandate unverändert AUS.** **Empfehlung: `HELMUT_CRON_GLOBALPHASE` bleibt AUS**, bis über
  die Optionen in [`betrieb/cron-globalphase.md`](betrieb/cron-globalphase.md) §8a.5 entschieden
  ist. Kanonisch: dieselbe Datei, **§8a**.
- **Status K2.1 (2026-07-31, Sprint „Globaler Abruf, kontextgebundene Vorgangsbildung"):
  BEFUND K1-1 IST IM NEUEN PFAD AUSGESCHLOSSEN. Schattenpfad gebaut, offline bewiesen,
  mutationsgesichert, NICHT aktiviert.** **Ursache, aus K2 übernommen und nicht neu
  analysiert:** das *lose* Clusterregime (`clusterRawDocuments`, eine paarweise Kante genügt,
  transitiv wirksam) entscheidet über die Vorgangsidentität, und K1 hatte es global gemacht.
  **Lösung:** das lose Regime wird an einen **Bündelungskontext** gebunden, das *strenge*
  Regime (`resolveVorgang`) bleibt global und unverändert. **Der Kontext ist die
  SICHTBARKEITSMENGE** — die Menge der Mandate, deren Quellenplan ein Dokument liefert.
  Bewusst **nicht** die Mandats-ID: Quellen, die alle Mandate erhalten, bilden dadurch
  **einen** Kontext statt je Mandat dupliziert zu werden; mandatseigene Quellen
  (`<mandats-id>-news`, Partei-, Ausschusssuchen) bilden automatisch je einen. Daraus folgt
  strukturell: zwei Dokumente werden nur dann lose gebündelt, wenn **dieselben** Mandate beide
  sehen — eine fremde Mandatsquelle kann die Vorgangsidentität also nicht verändern.
  **Gemessenes Kernergebnis:** in **allen sechzehn** Fallfamilien (die dreizehn aus K2 plus
  drei neue Grenzfälle) liefert der K2.1-Pfad **exakt dieselbe Vorgangsgruppierung wie der
  heutige Altpfad** — auch in den **acht** Familien, in denen der K1-Pfad eine andere liefert
  (F4, F7, F9, F11, F12, F13, Z1, Z3). **Ehrlich dazu:** K2.1 **verbessert** die
  Vorgangsbildung nicht, es erhält den heutigen Stand einschließlich seiner Schwächen (F10 und
  Z2 verschmelzen in **beiden** Pfaden falsch — Bestandsbefund, Formularvokabular, K2 §8a.2),
  und es verzichtet auf die eine Verbesserung, die K1 gebracht hätte (F7). **Kapazität,
  gemessen** (alle drei Pfade, derselbe Produktionscode, dieselben Annahmen, gezählt wird was
  wirklich im 270-s-Fenster fertig wurde): n=1 **alt 1/1 · K2.1 1/1** (K2.1 ist dort **150 ms
  langsamer** — ohne Entdoppelung kein Gewinn) · n=2 **2/2 gegen 2/2**, aber 215 320 ms gegen
  **180 470 ms** · n=6 **alt 2/6 mit 37 585 ms Überziehung → K2.1 6/6 ohne Überziehung** ·
  n=11 **alt 2/11 → K2.1 11/11**. Grenzkosten je zusätzlichem Mandat **66 670 ms → 7 110 ms**
  (identisch zu K1). **Abrufwege unverändert 1 162 → 196.** **Preis, benannt:** je Kontext ein
  zusätzlicher Sperr-Roundtrip — 15 Kontexte bei elf Mandaten, rund 3 s = **3,3 %** des
  90-s-Verstehensbudgets; das Budget wird **geteilt, nicht erhöht**. **Flaggrenze:** neues Flag
  `HELMUT_CRON_GLOBALABRUF`, **Default AUS**, fail closed, **nicht** über `helmut-flags.json`
  setzbar; sind **beide** Flaggen gesetzt, läuft der **Altpfad**. `HELMUT_CRON_GLOBALPHASE`
  wurde bewusst **nicht** weiterverwendet — seine Bedeutung schließt die als unsicher belegte
  globale Bündelung ein. **Tests:** neue Suite `vorgangskontext-test.js` **102/102**,
  Mutationsprobe `vorgangskontext-mutationsprobe.js` **18/18 rot**, `cron-globalphase`
  **176/176** (um die Drei-Pfade-Kapazitätsmessung erweitert), `cron-globalphase-mutationsprobe`
  **17/17 rot**, `globalphase-buendelung` **56/56** + **15/15 rot**, Offline-Suite **180/194**
  gegen im eigenen Arbeitsbaum gemessene Basislinie `main` `3b72a88` **178/192** mit
  **identischer** Fehlschlagliste (14 umgebungsbedingte Suiten, Delta genau **+2** = die zwei
  neuen Suiten), Browser-/Mobile-Smoke **32/32**, `cron-fairness` **285/285**,
  `punkt29-fehlervertrag` **80/80**, `pipeline-zeitbudget` **21/21**, `vorgangsidentitaet`
  **67/67**, `vorgangs-resolver` **54/54**, `vorgangs-beweisfamilien` **103/103**,
  `vorgangs-lebenszyklus` **81/81**, `herausgeber-identitaet` **109/109**,
  `cross-tenant-security` **43/43**, `source-architecture` **99/99**, `env-inventar` **38/38**.
  **0 KI-Aufrufe, 0,00 USD, keine Migration, kein Production-Zugriff, kein Flag gesetzt, keine
  Cron-/Budget-/Quellenänderung, Berlin/Brandenburg/M8/Testmandate unverändert AUS.**
  **CI-Gate gruen: beide Pflicht-Checks** (Lauf `30638964148`, `Syntax + Offline-Suiten`
  **194/194 Suiten**, `Browser-/Mobile-Smoke (Chromium)` gruen), **PR #201**, nicht gemergt.
  **Empfehlung: mergefähig als Schattenpfad; Aktivierung bleibt Betreiberentscheidung.**
  Kanonisch: [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md).
  **ÜBERHOLT — alle Aussagen dieses Statusblocks beschreiben den Zustand VOR dem
  2026-08-03, 13:15:11 UTC.** Das gilt insbesondere für „Default AUS" (das ist der
  **Code**-Default und bleibt gültig) und für „nicht aktiviert": PR #201 ist gemergt
  (`255df01`) und deployt, und **seit dem 2026-08-03, 13:15:11 UTC ist
  `HELMUT_CRON_GLOBALABRUF` in der Production-Umgebung auf `on`** — siehe den
  Aktivierungsstatus unmittelbar unten.
- **Status K2.1 (2026-08-04, Reparatursprint Kapazitätsfehler): URSACHE BEWIESEN UND REPARIERT,
  PRODUCTION-NACHWEIS MUSS VOLLSTÄNDIG NEU BEGINNEN. OP-25 bleibt TEILWEISE ABGESCHLOSSEN.**
  Der erste reguläre Wirkungslauf (`cron-pipeline-20260803160002-xm71n`, 16:00 UTC) ist am
  Kapazitätsnachweis **gescheitert**: globale Phase **267,12 s** bei Budget **221,674 s**,
  Restzeit **2,552 s**, **0 von 6** Mandaten. **Bewiesene Ursache (Messwerte, keine Vermutung):**
  **124,74 s = 46,7 %** des Laufs waren **sequenzielle Einzelzeilen-Round-Trips** —
  616 Einzel-Upserts auf `raw_documents` (89,89 s) plus ~108 × (GET + PATCH) für `finding_count`
  (34,85 s), zusammen **834 Requests à ~149,6 ms** (Befund **F-RT**); dazu **15,94 s** reine
  Doppelarbeit, weil die Stapelschleife 1 242 Cluster bildete und **erst danach** das bereits
  erschöpfte Budget prüfte (Befund **F-CL**). **Nicht** ursächlich: der Abruf (alle 181 Quellen
  vollständig abgerufen, 112,11 s realer Netzaufwand) und keine Mehrfachverarbeitung
  (`gesamt=181 gemeinsam=140 mandatseigen=41` ist vertragsgemäß). **Repariert:** Bulk-Upsert der
  Rohdokumente (nach Spaltensignatur gruppiert, Einzelfallback je Block), **bedingtes**
  gebündeltes `finding_count`-Update (Compare-and-Set statt unbedingtem Lesen→Ändern→Schreiben,
  CLAUDE.md §4.10), Budgetriegel **vor** der Clusterbildung, Phasenmessung
  (`[globalphase/phasen]`). **Gemessen (Offline-Kapazitätstest in Production-Größenordnung):**
  Round-Trips **834 → 10**, Persistenz **130,51 s → 1,56 s**, globale Phase **263,79 s → 197,19 s**
  bei Budget 222 s, Restzeit **6,21 s → 72,80 s**, Mandate **0 von 6 → 6 von 6**, Gesamtlauf
  **207,10 s** unter dem 270-s-Limit. Alle 181 Quellen und 2 179 Dokumente bleiben enthalten,
  Sichtbarkeitsvertrag, Sperren, Fairness und Mandatstrennung unverändert. **Nebenbefund F-REQ,
  nachgemessen 2026-08-04:** `CRAWLER_TIMEOUT_MS` ist ein Socket-Timeout **je einzelner Anfrage**
  und begrenzt weder `crawlSource` noch eine Quelle noch eine Abrufstufe — eine Google-Quelle löst
  offline gemessen **37** (Suchquelle) bzw. **98** (Personenquelle, zwei Feeds und sequenzielle
  Bildanreicherung) Anfragen aus, Production zeigt einzelne Quellen mit **41 892 / 41 340 /
  40 851 / 35 005 ms** bei 7 000 ms Limit und `retry_count = 0`. Damit ist die Formel
  `ceil(stufenGroesse / concurrency) × CRAWLER_TIMEOUT_MS` widerlegt, und eine **Verkleinerung**
  der Abrufstufe hilft nicht, sondern schadet: die Summe der Stufenmaxima ist eine Untergrenze
  der Abrufdauer und steigt monoton (20 → 71,3 s, 10 → 90,2 s, 5 → 153,0 s), und die
  **direkten/amtlichen** Quellen starten später (9,85 s → 31,53 s), weil `plan.quellen`
  unabhängig vom Quellentyp geschnitten wird. Quellenmix gemessen: **176 Google-Wege / 5 direkte
  = 97,2 %**. Belege: `scripts/quellen-mehrfachabruf-test.js` (18/18). Die entsprechende
  Codeänderung aus PR #218 (Default 20 → 5) ist dort zurückgenommen; eine Entscheidungsvorlage
  für ein **echtes** Stopp-Gatter steht in
  [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.6.1. **Drei Befunde bleiben
  bewusst offen und brauchen eine Entscheidung:** **E-1** Stufenbarriere im Abruf (≈ 34 s
  Einsparpotenzial, verlangt einen Eingriff in `crawler.js`), **E-2** `HELMUT_CRAWL_MAX_CANDIDATES`
  wirkt je Stufe statt je Lauf (der globale Pfad verarbeitet **2 140** statt ~**945** Kandidaten —
  eine stille **Ausweitung**; ihre Rücknahme wäre eine Produktentscheidung), **E-3**
  `datenstand.status = abgeschlossen` ist mit dem heutigen Verstehensrückstand praktisch
  unerreichbar und berührt damit **Abnahmekriterium 5** aus
  [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.5. **Keine Production-Änderung in
  diesem Sprint:** kein Flag gesetzt, kein Deployment, kein Cron ausgelöst, kein
  Production-Schreibzugriff, keine Migration, 0 KI-Aufrufe, 0,00 USD.
  Kanonisch: [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) **§7.6**.
- **Status K2.1 (2026-08-03, 13:15:11 UTC, Betreiberaktion): IN PRODUCTION AKTIVIERT —
  Deployment READY und unmittelbarer Smoke-Check bestanden, REGULÄRER
  PRODUCTION-KAPAZITÄTSNACHWEIS NOCH OFFEN. OP-25 bleibt TEILWEISE ABGESCHLOSSEN.**
  **`HELMUT_CRON_GLOBALABRUF = on`, ausschließlich in der Production-Umgebung** (Preview und
  Development unverändert; `Sensitive` bewusst aus, der Wert ist kein Geheimnis);
  **`HELMUT_CRON_GLOBALPHASE` unverändert nicht gesetzt** — die Widerspruchsregel greift also
  nicht, es läuft `kontext` und nicht der Altpfad. Deployment
  **`dpl_J4g3k4QPUEaKAad3pB83ByGcvUkn`** (`target: production`, `readyState: READY`,
  `action: redeploy`, Region `fra1`) auf Commit
  **`ded0e240e24ca081b5ff68e150a95f7006b08ad7`**, **READY 2026-08-03 13:15:11 UTC =
  15:15:11 Berlin**. **Abweichung zum freigegebenen Stand geprüft statt übergangen:** `ded0e24`
  ist der Merge von PR #213 (reine Doku); `git diff c6f3f9f ded0e24` über `server.js`,
  `client.js`, `styles.css`, `lib/`, `scripts/`, `supabase/`, `vercel.json`, `helmut-flags.json`,
  `.github/`, `api/`, `package*.json` ist **leer** — der deployte Anwendungscode ist identisch mit
  dem geprüften Stand. **Smoke-Check (rein lesend, 13:21–13:23 UTC) bestanden:** `GET /` **200**
  (Region `fra1`), **Asset-Rotation korrekt** (`styles.css?v=ded0e240`, `client.js?v=ded0e240` =
  deployter Commit, [`betrieb/deploy-rollback.md`](betrieb/deploy-rollback.md) §3), alle
  Sicherheits-/Routing-Header, `site.webmanifest` 200, `/api/health` **401** (korrektes Auth-Gate),
  Build ohne Fehlerzeile, **0** Runtime-Fehler, **0** Log-Einträge der Stufen
  `error`/`warning`/`fatal`, **keine** `[cron/*/pfadwahl]`-Widerspruchszeile, Datenbank unverändert
  (0 aktive Sperren, Fairnesszeile `rev = 46` / 9 467 Bytes, `process_runs` unverändert, **0** neue
  `systemError`). **Ein Rückbau war nicht erforderlich.** **Noch NICHT belegt, ausdrücklich:** der
  Flagwert ist aus einer Sitzung unlesbar, und `waehleCronPfad()` wird **nur zur Cron-Zeit**
  ausgewertet — **der erste Wirkungsbeleg ist der nächste reguläre schwere Lauf
  (`/api/cron/pipeline`, 16:00 UTC / 18:00 Berlin)**, weisungsgemäß weder ausgelöst noch
  abgewartet; aus demselben Grund ist auch das Fehlen der `pfadwahl`-Zeile heute nur schwach
  aussagekräftig. **Offen bleibt der volle Nachweis über ≥ 24 h** (`mode: "global"`-Laufdatensatz je
  Lauf, `datenstand.status = abgeschlossen`, für **alle sechs** Mandate ein vollständig
  abgeschlossener `mode: "mandat"`-Datensatz, keine neue Fehlerklasse, LLM-Kosten unverändert)
  gegen die vorher aufgenommene Baseline (`crawl` und `pipeline` je 2 begonnen / 1 erfolgreich,
  `lage-check` 1/6, `morning-briefing` 6/6). **Das Bestehenskriterium zu den Kontexten prüft
  Verträge, keine Zahlengrenze:** jedes Dokument liegt **genau einmal** in **genau einem** Kontext
  (Partition) · alle Dokumente eines **bekannten** Kontexts tragen **dieselbe** Sichtbarkeitsmenge,
  und in einem unbekannten Kontext liegt kein Dokument mit bestimmbarer Sichtbarkeit · **unbekannte
  Kontexte werden vollständig ausgewiesen und untersucht** · **keine** `kontextvertrag`-Fehler ·
  die **gemessene Kontextzahl wird berichtet** und bei auffälliger Höhe **erklärt**, aber **nicht**
  allein aufgrund einer Zahl als falsch bewertet. **Zur Kontextzahl, am Code gemessen statt
  geschätzt:** `kontexte` ist die **Anzahl verschiedener Sichtbarkeitsmengen** unter den
  Rohdokumenten eines Laufs — 1 für die Quellen, die **alle** Mandate erhalten, je 1 für jede
  Quellengruppe mit einer **echten Teilmenge** (Partei, Region, Ausschuss), je 1 je Mandat für
  dessen **eigene** Quellen; bei **unbestimmbarer** Sichtbarkeit **je 1 Kontext pro Quelle**, und
  **nur** Dokumente **ohne bestimmbare Quelle** werden einzeln isoliert. Es gilt
  `kontexte = geteilt + mandatseigen + unbekannt` — zu `geteilt + mandatseigen` vereinfacht es sich
  **nur bei `unbekannt = 0`**, weil ein unbekannter Kontext keine Mandate trägt. Die Zahl ist
  **datenabhängig, keine Funktion von `n` allein** und im allgemeinen Fall **exponentiell möglich**
  (bei sechs Mandaten theoretisch **bis zu 63** bekannte, nicht leere Sichtbarkeitsmengen, plus
  unbekannte Kontexte). **Die Schranke `1 ≤ kontexte ≤ 2n + 1` aus Prüfpunkt 8.13f gilt
  ausschließlich für die vier konstruierten Simulationsprofile — Beobachtung dieser Profilwelt,
  KEIN allgemeiner Vertrag und KEIN Production-Bestehenskriterium.** Offline gemessen
  **1 · 3 · 10 · 15** bei n = 1 · 2 · 6 · 11 — die **10** ist **1 + 3 + 6** und bleibt ein
  **Messwert der Simulationsprofilwelt**, **keine** Production-Sollzahl. Die früheren
  Formulierungen „≈ 1 + Zahl der Mandate", „erwartet 10" und „Abnahmeschranke" sind ersetzt;
  kanonisch [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) **§7.5**.
  **Betriebsgrenzen unverändert und weiter gültig:** der **Rückbau bleibt Betreiberaktion** (Vercel-
  Egress gesperrt), **weitere reale Testmandate bleiben deaktiviert**, Berlin/Brandenburg/M8 AUS
  (0 aktive Landeswege), Cron-Zeiten, Budgets und Quellen unberührt. Diese Sitzung hat **nichts
  geschrieben** — keine Env, kein Deployment, kein Cron, kein Trigger, kein
  Production-Schreibzugriff, keine Migration, kein Anwendungscode, **0 KI-Aufrufe, 0,00 USD**.
  Kanonisch: [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) **§7.4**.
- **Status K2.1-Aktivierungsprüfung (2026-08-03, Vorsprint, rein lesend): BLOCKIERT — damals NICHT
  aktiviert, nichts verändert. Am selben Tag durch die Betreiberaktion oben aufgelöst.** Vollständige Vorprüfung mit ausdrücklicher Freigabe: **11 von 13
  Aktivierungsgates erfüllt.** **Die beiden offenen Gates haben dieselbe Ursache:** der
  Vercel-Schreibweg existiert in einer Agenten-Sitzung nicht, und damit ist auch der Rückbau
  (Stufe 1: Flag auf `off` + Redeploy) nicht ausführbar. `VERCEL_TOKEN` **ist** gesetzt, aber
  `api.vercel.com`, `vercel.com` und `mcp.vercel.com` sind per Egress-Richtlinie gesperrt
  (`CONNECT → HTTP 403`, je einzeln vom Sitzungsproxy protokolliert); die Vercel CLI **58.4.4**
  scheitert damit schon beim rein lesenden `project ls`, und der Vercel-MCP-Server hat **kein**
  Environment- und **kein** Redeploy-Werkzeug. **Ohne ausführbaren Rückweg wird nicht aktiviert**
  (`CLAUDE.md` §4.4). Die Bedingung ist seit 2026-07-26 dokumentiert und unverändert:
  „`VERCEL_TOKEN` **und** geöffneter Egress — eines allein genügt nicht"
  ([`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md) §20.3). **Erfüllt und belegt:**
  `HEAD = origin/main = c6f3f9f`, PR #201/#211/#212 enthalten, **0 offene PRs**;
  Production-Deployment `dpl_APNCTVthBNBKptpCSGfPejtZCz8y` **READY** auf genau diesem Commit
  (11:52:36 UTC); Team `nohut` / Projekt `helmut-pilot` zweifelsfrei; **beide Flaggen an der
  Wirkung als AUS belegt** (keine `[cron/*/globalphase]`- und keine `[cron/*/pfadwahl]`-Zeile in
  24 h, Stapelspuren durch `runSourceCrawl`/`perTenant` = Altpfad); **nur `crawl` und `pipeline`
  wechseln** (genau zwei Aufrufstellen von `cronSchwererPfad`, `server.js:829`/`:903`); **0 aktive
  Sperren**, kein laufender schwerer Cron, kein konkurrierendes Deployment; Offline-Suite
  **186/200** = exakte Basislinie mit identischer 14er-Fehlschlagliste, Browser **32/32**,
  `vorgangskontext` 102/102 + 18/18 rot, `cron-globalphase` 176/176 + 17/17 rot,
  `globalphase-buendelung` 56/56, `cron-fairness` 285/285, `cron-fairness-persistenz` 54/54,
  `cross-tenant-security` 43/43, `env-inventar` 38/38; CI von `main` grün im **ersten** Anlauf
  (`30811251231`); **0** aktive Berliner/Brandenburger Abrufwege (alle 17 `needs_review`/`manual`),
  6 aktive Mandate, Cron-Zeiten/Budgets/Quellen unverändert. **Sicheres Aktivierungsfenster
  bestimmt und ungenutzt geblieben:** täglich verlässlich **09:15–15:30 UTC = 11:15–17:30 Berlin**
  (nach dem GitHub-Actions-Watchdog, der real zwischen 07:30 und 08:55 UTC startet, und 30 min vor
  dem 16:00-UTC-`pipeline`). **Baseline der schweren Läufe aufgenommen** (Vergleichsmaßstab für den
  späteren Kapazitätsnachweis): `crawl` 04:00:37 UTC und `pipeline` 08:46:05 UTC je **2 begonnen /
  1 erfolgreich** mit äußerem Zeitlimit, `lage-check` **1 von 6**, `morning-briefing` **6 von 6**;
  Fairnesszeile `rev = 46`, 9 467 Bytes; **3** `systemError` in 36 h, alle „Zeitbudget erschoepft"
  (B5), kein Persistenz-/DB-/Sperr-/Fairnessfehler. **F-POS unverändert bestätigt** (ein Mandat im
  `crawl` mit `versuche=3, erfolge=0` ohne jedes `letzterErfolgAt`, zwei weitere im `pipeline`).
  **Kleinste Betreiberaktion:** Vercel-Oberfläche → `helmut-pilot` → Settings → Environment
  Variables → **Production** `HELMUT_CRON_GLOBALABRUF` = `on` + Redeploy (Rücknahme: `off` oder
  löschen + Redeploy; `HELMUT_CRON_GLOBALPHASE` dabei **nicht** setzen) — **oder** den Egress zu
  `api.vercel.com` für die Agenten-Sitzung öffnen. **Der reguläre Production-Kapazitätsnachweis
  bleibt vollständig offen; weitere reale Testmandate bleiben deaktiviert.** Rein lesend erhoben,
  **0 KI-Aufrufe, 0,00 USD**, kein Production-Schreibzugriff, kein manueller Lauf, kein Trigger,
  keine Env-/Flag-/Cron-/Budget-/Quellenänderung, Mandate nur pseudonymisiert. Kanonisch:
  [`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) **§7.1/§7.3**.
- **Ausgangsbefund (2026-07-29, vor diesem Sprint):** **Ursache belegt, Umfang noch nicht vermessen** (Befund B5).
  Der Crawl-Cron endet reproduzierbar nach ~280 s mit `bounded=true`
  (`[cron/crawl] 280001ms tenants=undefined bounded=true`, gemessen 28.07. 04:00, 28.07. 20:00
  und 29.07. 04:00). Er verarbeitet die Mandanten nacheinander und bricht am Zeitlimit ab —
  die zuletzt begonnenen Mandanten laufen ins Leere. Belegt am 29.07.: `annika-klose`
  vollständig verarbeitet, `cem-ince` begonnen, Matching-Stufe nicht mehr erreicht
  (`profile_embeddings` für `cem-ince` steht weiter auf dem 28.07.).
- **Wichtig zur Einordnung:** **kein** Effekt der Matching-Auditpersistenz — zwei der drei
  Messungen liegen **vor** der Aktivierung von `HELMUT_MATCHING_AUDIT`. Das Verhalten ist alt
  und war bisher nur unsichtbar, weil Matching vor Sprint 23B-1 keine Spur hinterließ.
- **Fehlender Schritt:** (a) messen, wie viele der aktiven Mandanten je Lauf tatsächlich
  bis zur Matching-Stufe kommen (die 4 Cron-Läufe/Tag über eine Woche auswerten, jetzt
  erstmals über `matching_runs` möglich) — **offen**; (b) ~~entscheiden, ob das Zeitbudget besser
  verteilt wird (Rotation der Mandantenreihenfolge statt fester Reihenfolge)~~ — **erledigt
  2026-07-29: Rotation umgesetzt** (Reihenfolge nach ältestem Versuch, persistent, ohne Migration;
  Zeitbudget, Cron-Zeiten und Google-Wartezeiten **unverändert** — die Berührung mit OP-15 wurde
  bewusst nicht angefasst); (c) Abdeckungsalarm über eine **Serie** von Läufen, damit ein dauerhaft
  übersprungener Mandant auffällt statt still zu bleiben — **offen** (der Einzellauf meldet seit
  diesem Sprint Kennungen, die Serienauswertung fehlt).
- **Abhängigkeiten:** OP-15 (Google-News-Klumpenrisiko/Härtung — die Timeouts fressen das
  Budget), OP-21 (die 2 × `504` vom 26.07. sind Ausdruck desselben Limits), OP-07 (Alarmweg).
- **Risiko:** **hoch für den Zweitmandanten.** Mit einem zahlenden Zweitmandanten teilen sich
  mehr Mandate dasselbe 280-s-Budget; heute fällt der Ausfall niemandem auf, weil er keine
  Fehlermeldung erzeugt. Ein Mandant kann tagelang ohne frische Lage bleiben, ohne dass
  irgendwo Rot leuchtet — genau das „falsche Grün", das CLAUDE.md §4.4 verbietet.
- **Parallelisierbarkeit:** (a) sofort und rein lesend; (b)/(c) danach.
- **Freigabe:** **NEIN** für die Messung (a) — rein lesend. **JA** für jede Änderung an
  Zeitbudget, Cron-Zeiten oder Cron-Reihenfolge (CLAUDE.md §5).

#### OP-26 · Matching ist nicht für einen einzelnen Mandanten auslösbar (neu, Sprint 23B-1; Prioritätsklasse P2)
- **Status:** offen, **belegt** (2026-07-29, Befund B6). `runMatchingShadow` hat genau zwei
  produktive Aufrufer — `scheduler.js:412` (in `runSourceCrawl`) und `scheduler.js:588`
  (in `runLageCheck`, das ab `scheduler.js:629` selbst crawlt). Keine HTTP-Route, kein
  npm-Skript, kein Workflow. Matching ist damit ausschließlich als Anhängsel eines
  Vollcrawls auslösbar.
- **Fehlender Schritt:** einen schmalen, mandantenscharfen Einstieg schaffen, der **nur**
  matcht — ohne Crawl, ohne Understanding, ohne KI, ohne Briefing. Naheliegend als
  Admin-Route mit Mandantenparameter oder als Betriebsskript; in beiden Fällen mit
  Sperre (`matching-<mandant>`, existiert bereits) und Auditprotokoll (`matching_runs`,
  existiert bereits) — die Bausteine sind seit Sprint 23B-1 da, es fehlt nur der Aufruf.
- **Abhängigkeiten:** keine harten. Praktisch sinnvoll **zusammen mit OP-25**, weil ein
  einzeln nachziehbarer Mandant genau die Reparatur für die Deckelung wäre.
- **Risiko:** mittel. Ohne diesen Einstieg gibt es keine gezielte Nachprüfung, keine
  Nachholung für einen zurückgefallenen Mandanten und keinen kontrollierten Beweislauf.
  Bereits eingetreten: der Idempotenznachweis für Sprint 23B-1 musste an einem regulären
  Lauf **beobachtet** werden, statt gezielt erzeugt zu werden
  ([`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) §25.3/§25.5).
- **Parallelisierbarkeit:** unabhängig, kleiner Umfang.
- **Freigabe:** **NEIN** für Bau und Test über den normalen PR-Weg. **JA**, sobald der
  Einstieg gegen Production ausgeführt wird — er schreibt `profile_embeddings` und
  `matching_results` und ist damit eine Änderung an Production-Daten (CLAUDE.md §5).

#### OP-27 · Relevanzriegel im Matching aktivieren (neu, Sprint M-8; Prioritätsklasse P2)
- **Status:** offen, **Analyse abgeschlossen, Code offline fertig und bewiesen, Aktivierung
  steht aus.** Aus Befund **B7**/**M-8**. Gemessen am 2026-07-29 (rein lesend, 271 aktuelle
  Ergebniszeilen über 7 Mandanten plus die RPC selbst): ein Ähnlichkeitsschwellenwert ist
  **nachweislich das falsche Werkzeug** — bis 0,20 wirkungslos, ab 0,22 schädlich, und in
  keinem Bereich trennscharf. Entschieden und gebaut wurde stattdessen die **Belegpflicht**:
  veröffentlicht wird nur, was ein `matched_feature` trägt; keine Auffüllung, keine
  Mindestmenge, keine Neuberechnung von Ähnlichkeit, Rang oder Reihenfolge.
- **Fehlender Schritt:** `HELMUT_MATCHING_RELEVANZ_GATE` in Production aktivieren und den
  nächsten **regulären** Lauf gegenmessen (veröffentlichte Zeilen, Belegquote, sichtbares
  12er-Fenster, abgelöste Zeilen, 0 KI-Aufrufe). Erwartung: 18–20 von 20 veröffentlicht,
  Belegquote 100 %.
- **Abhängigkeiten:** keine harten. Praktisch abhängig von **OP-25**/**OP-26**, weil das Flag
  pro Deployment und nicht pro Mandant wirkt und ein gezielter Einzellauf heute fehlt.
- **Risiko:** mittel und benannt. (1) Der Riegel räumt den Alt-Bestand **nicht** auf: bei
  0 veröffentlichten Zeilen löst `helmut_publish_matching_run` nichts ab, beim
  Platzhalterprofil bleibt die Rausch-Lage also stehen (löst nur **OP-04**/Profilpflege).
  (2) Die erste Aktivierung ist nicht idempotenz-neutral — der erste Lauf danach schreibt neu.
  (3) `matched_features` kennt heute weder namentliche Erwähnung noch betroffene Geografie;
  gemessen kostet das derzeit 0 Treffer, der Riegel macht die Lücke aber wirksam.
  (4) Für die **Landtagsebene** existiert kein Production-Beleg.
- **Rückweg:** Flag leeren/`off` + Redeploy — der nächste Lauf schreibt wieder die vollen
  Top-20. Keine Migration, kein Schema, kein Datenverlust (es wird nie gelöscht, nur abgelöst).
- **Parallelisierbarkeit:** unabhängig, kleiner Umfang.
- **Freigabe:** **JA** — die Aktivierung verändert die sichtbare Lage und mittelbar die
  Briefings (CLAUDE.md §5, Feature-Flag scharfschalten). Bau und Test lagen über den
  normalen PR-Weg. Kanonisch:
  [`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) Teil E §42–§49.

#### OP-29 · Profilprüfung, Vollständigkeitsregel und kontrollierte Testmandate (neu, Sprint „Profilreife" 2026-08-04; Prioritätsklasse P1)

> Nummernhinweis: **OP-28 wird hier bewusst nicht vergeben** — die Nummer ist durch den
> unabhängigen, noch offenen Stabilisierungsvorgang des flackernden
> `werkzeug-lesefehler-test.js` (PR #216) beansprucht; dieser Sprint verändert PR #216 nicht.

- **Befund (2026-08-04, rein lesend):** Von den sechs aktiven Bundestagsmandaten sind
  **2 nicht bereit** (`annika-klose`: Rollenfloskeln als Berichterstatter-„Themen";
  `ottilie-paola-klein-2`: Ausschuss der 20. Wahlperiode) und **3 tragen inhaltlich
  falsche Ausschüsse** gegenüber den amtlichen WP-21-Mitgliedschaften (zusätzlich
  `helmut-kleebank`). Das **Demo-Mandat `max-mustermann` trägt den Klarnamen einer realen
  Abgeordneten** und erzeugt eine zweite identische Personensuche neben
  `ottilie-paola-klein-2` (Vermischungsrisiko; verwandt mit OP-04). Latent (F-P6): die
  relationale `profiles.name`-Zeile des Pilotmandats trägt den Slug statt des Klarnamens —
  wirksam erst bei einem `HELMUT_PROFILE_DB_MODE`-Cutover. **Ausdrücklich geprüft: kein
  Profilfehler war Ursache des 267-s-Laufs** (Mandatsphase begann dort gar nicht erst).
- **Erledigt (Repo-Sprint 2026-08-04, Branch `claude/helmut-profile-readiness-test-awgjch`):**
  Bundestags-Bereitschaftsvertrag aus dem Code abgeleitet und implementiert
  (`lib/helmut/profile-readiness.js`, deterministisch, lesend, ohne Konto-Pflicht);
  **harte Sperre des neuen Aktivierungsübergangs** in `provisioning.provisionTenant`
  (unvollständiges neues Bundestagsprofil wird vor jedem Write mit konkreter Fehlerliste
  abgewiesen; bestehende aktive Mandate bleiben unberührt — Verarbeitung liest weiterhin
  nur `validateProfile`); rein lesendes Prüfwerkzeug `scripts/profil-bereitschaft.js`
  (Text/JSON, Exit-Codes, fixture- und productionfähig); **belegtes Reparaturpaket** für
  die sechs Profile (`scripts/fixtures/profil-reparatur-2026-08-04.js`, nicht angewendet);
  **fünf reale, deaktivierte Offline-Testmandate** mit Belegen und Auswahlmatrix
  (`seeds/bundestag-testmandate.js` — alle 5 Fraktionen, 5 Länder, Direkt-/Listenmandate,
  ohne Benutzerkonten); Elf-Profile-Gesamttest + 21 Regressionsfälle
  (`scripts/profil-bereitschaft-test.js`, 49/49). Kanonisch:
  [`multitenancy-profilbereitschaft-bundestag.md`](multitenancy-profilbereitschaft-bundestag.md).
- **Offen (getrennte Betreiberschritte, nichts davon im Sprint ausgeführt):**
  (a) Reparatur der sechs Bestandsprofile über die Admin-Profilverwaltung (Paket §5),
  (b) OP-04-Entscheidung zum Demo-Mandat mit realem Klarnamen,
  (c) `profiles.name`-Korrektur vor einem Profil-DB-Cutover,
  (d) Anlage/Aktivierung der fünf Testmandate (je eigene Freigabe),
  (e) OP-25-Production-Nachweis — der Offlinetest ersetzt ihn **nicht**.
- **Freigabe:** Repo-Merge über normalen PR-Weg (keine Migration, kein Flag, keine
  Cron-/Quellenänderung). Alle Schritte (a)–(e) sind **einzeln freigabepflichtig**.
- **Nachtrag 2026-08-04/2 (Korrekturprüfung, extern angestoßen):** Die Erstfassung des
  Reparaturpakets enthielt **drei Sachfehler** gegen die amtlichen WP-21-Biografien —
  Klose (Petitionsausschuss war nur 20. WP; stv. Finanzausschuss + Obfrau-Funktion fehlten),
  Klein (unvollständig: ordentlich auch Arbeit und Soziales, stv. EU + Finanzen),
  Stüwe (ordentlich/stellvertretend vermischt; Haushalt ist stellvertretend, Schriftführer
  ist eine Funktion). Alle korrigiert (kanonische Ausschussnamen, strikte Trennung
  `committees`/`deputyCommittees`/`function`); die Bereitschaftsprüfung validiert jetzt auch
  `deputyCommittees` gegen die Sollmenge; **begrenzte Modelllücke dokumentiert:** Gremien
  außerhalb der 24 ständigen Ausschüsse (Rechnungsprüfungsausschuss, Wahlprüfungsausschuss,
  Gemeinsamer Ausschuss) sind im Profilmodell bewusst nicht abbildbar — Datenmodell
  unverändert. Alle elf Profile erneut verifiziert; Tests 60/60. Kanonisch:
  [`multitenancy-profilbereitschaft-bundestag.md`](multitenancy-profilbereitschaft-bundestag.md)
  (Korrekturvermerk).
- **Nachtrag 2026-08-04/4 (Production-Anwendung, mit ausdrücklicher Betreiberfreigabe):**
  Die offenen Schritte **(a)–(c) sind ausgeführt und rein lesend nachgeprüft**; (d) und (e)
  bleiben offen. **(a)** Alle Felder des Reparaturpakets mit Status `belegt` wurden auf die
  Bestandsprofile angewendet — profilweise über den bestehenden Storage-/Admin-Schreibpfad
  (`storage.saveProfile`, wirksame Blob-Sicht; identischer Pfad wie
  `/api/admin/profile/<id>`), je Profil mit exaktem Ist-Vergleich gegen den dokumentierten
  Ausgangswert direkt vor dem Schreiben, sofortigem Rücklesen und sofortiger
  Bereitschaftsprüfung: `annika-klose` (committees, deputyCommittees, function/role,
  reportingTopics geleert), `cem-ince` (deputyCommittees), `helmut-kleebank` (committees),
  `ottilie-paola-klein-2` (committees, deputyCommittees, constituency), `ruppert-st-we`
  (committees, deputyCommittees, function/role). **Nicht angewendet (bewusst, Status
  `entscheidung`/Hinweis/Modelllücke):** Stüwes Rechnungsprüfungsausschuss (Modelllücke,
  kein Ausschussfeld), Kloses Mandatsart-Hinweis, die Umbenennung des Demo-Mandats
  (durch Deaktivierung gelöst, siehe OP-04). **(b)** `max-mustermann` deaktiviert, nicht
  gelöscht (OP-04-Teilschritt). **(c)** Relationale `profiles.name`-Zeile des Pilotmandats
  per **bedingtem PATCH** (Compare-and-Set auf den dokumentierten Ausgangswert, CLAUDE.md
  §4.10) auf den Klarnamen korrigiert — genau 1 Zeile, F-P6 damit für die Namenszeile
  behoben. **Ergebnis der Nachprüfung:** alle **fünf aktiven realen Profile BEREIT** (zentrale
  Prüfung `profil-bereitschaft.js --production`, nur zulässige Qualitätswarnungen); Mandate
  **8 → 8**, aktiv **6 → 5**; keine Testmandate angelegt/aktiviert; Nutzer/Zuordnungen/
  Einladungen, Quellen, Flags, Crons und Budgets unverändert; kein Crawl/Pipeline-Lauf
  ausgelöst; globaler Abruf weiterhin deaktiviert. **Ehrliche Grenzen:** die relationalen
  `mandate_profiles`-Zeilen bleiben veraltete Backfill-Schnappschüsse (der wirksame
  Blob-Lesepfad pflegt sie bei `HELMUT_PROFILE_DB_MODE`-aus nicht mit; vor einem DB-Cutover
  ist ein Backfill nötig — dokumentierte F-P6-Familie); das Prüfwerkzeug endet weiterhin mit
  Exit 2 wegen der zwei **Alt**-Demo-Mandate `angela-merkel`/`james-brown` (deaktiviert,
  inhaltlich unvollständig — Vorbestand, OP-04, in diesem Sprint nicht freigegeben).
  Details/Beweise: `docs/CURRENT_STATE.md` (Kopfeintrag 4. Durchgang 2026-08-04).
- **Nachtrag 2026-08-04/3 (letzte fachliche Korrektur, extern gegen die amtlichen Profile
  geprüft):** Drei weitere Sachfehler in den fünf **Testmandaten** bestätigt und korrigiert —
  Stegner (stv. amtlich EU-Ausschuss + Innenausschuss; die frühere Nicht-Übernahme des
  EU-Ausschusses war falsch), Verlinden (stv. amtlich Wirtschaft und Energie +
  Verkehrsausschuss; der zuvor behauptete 1. Ausschuss entfernt), Pellmann (stv. Arbeit und
  Soziales ergänzt; Obmann-Funktion amtlich bestätigt, mit Co-Fraktionsvorsitz im
  Freitextfeld kombiniert). Sonstige Gremien (OSZE, Ältestenrat, Gemeinsamer Ausschuss,
  Wahlprüfungsausschuss) einheitlich nur als `herkunft.sonstigeGremien`/Modelllücke geführt.
  Neue unabhängige Soll-Tests (18f, hart kodiert, nicht aus dem Seed abgeleitet); Tests
  91/91. Reparaturpaket der sechs Bestandsprofile unverändert (kein neuer belegter Fehler).
  Ehrliche Grenze dokumentiert: Offline-Tests sichern interne Konsistenz, die amtliche
  Wahrheit braucht weiterhin menschliche Quellenprüfung.

#### OP-30 · Mandatseigene Abrufwege vervielfachen den Quellenabruf linear (neu, Sprint „V3-Skalierungsprüfung" 2026-08-08; Prioritätsklasse P1)

- **Stand 2026-08-08/2 (Korrektur- und Abnahmesprint):** Belege
  [`betrieb/skalierung-200-mandate.md`](betrieb/skalierung-200-mandate.md) und
  [`betrieb/lokaler-production-schutz.md`](betrieb/lokaler-production-schutz.md).
  **Drei kritische Luecken geschlossen:**
  (1) **200 Mandate innerhalb von 24 h bewiesen** (`lokal simuliert`, letzte Pflichtarbeit
  **21:38:00**). Ursache der frueheren 25 h: das Briefingfenster reichte bis 98 % des Tages
  und liess keinen Platz fuer die Arbeit — jetzt 90 %; dazu ein Abtastfehler der Simulation.
  **Kein** Kapazitaets-, Budget-, Parallelitaets- oder Wiederholungsbefund.
  (2) **`HELMUT_RELEVANZORDNUNG` ist default AUS**, fail closed; Merge-Neutralitaet in vier
  unabhaengigen Beweisen belegt (`scripts/relevanzordnung-mergeneutralitaet-test.js`, 24 PASS).
  (3) **Lokaler Production-Schutz an der Ursache behoben** — der alte Guard griff nur im
  Preload-Pfad des Test-Runners, jeder Direktaufruf war ungeschuetzt (90 Nicht-Test-Skripte,
  ~25 netzfaehig). Neu: zwei Schichten + Starter, 76 PASS ueber alle zwoelf geforderten Faelle.
  **Neuer Befund:** `HELMUT_LLM_GLOBAL_ANTEIL` (0,5) passt nicht zum gemessenen Bedarf
  (80–98 % global) ⇒ der Deckel muss 1,6–2,0x groesser sein als noetig; passend waeren 0,87.
  Nicht gesetzt. **Tests:** Offline 220/225 + Browser 32/32, **keine neue Regression**
  (Baseline `a07954d`: 203/208, dieselben 5 roten Suiten).
- **Stand 2026-08-08 (finaler lokaler Abnahmesprint):** Beleg
  [`betrieb/op30-abnahme-2026-08-08.md`](betrieb/op30-abnahme-2026-08-08.md).
  **Lokal bewiesen:** zentrale Rechengrundlage fuer 5/200/1000 (`scripts/skalierungsmodell.js`),
  Relevanzordnung (Gruendervorgabe „Relevanz vor Aktualitaet", Default AN), Workerdurchsatz
  (1 Worker 1 064,6 Auftraege/s, 8 Worker 4 093,1), Bereinigung von 66 000 Zeilen in 814 ms ohne
  Verlust bei gleichzeitigem Worker, alle vier Migrationspaare anwendbar/rollbar/wiederholbar,
  Flagmatrix (6 Kombinationen). **Drei echte Produktfehler behoben** (unbegrenztes Warten aufs
  Briefing, eine Frist die nie ablaufen konnte, Leerlauf bei erschoepftem Budget).
  **Korrigiert:** die Deckelangabe „100" war unbelegt — der Code faellt fail-closed auf **50**
  zurueck; die Admin-Anzeige behauptete faelschlich „unbegrenzt (Infinity)".
  **Weiterhin offen:** echte Google-/KI-Laufzeit · Rueckstand ≤ 24 h unter echten Bedingungen ·
  wirksamer Production-Deckel · **190 fehlende echte Profile** (es gibt 10, nicht 200) ·
  Migration/Aktivierung/Production-Nachweis. **Vercel traegt keinen langlaufenden Worker**
  (`maxDuration 300`) — mehr Durchsatz ist eine Betreiberentscheidung.
- **Unabhaengiger adversarialer Abschlussreview von PR #233 (2026-08-08, `6d54dbb`).**
  Verhaltensneutralitaet eigenstaendig belegt (Flagmatrix ueber 26 Werte 23/23, keine
  Modul-Ladeeffekte, `planeArbeit`/`arbeite` bei Flag AUS mit 0 Beruehrungen, keine
  automatische Migration). **12 Befunde behoben, davon 1 kritisch und 6 hoch** — saemtlich
  im ausgeschalteten OP-30-Pfad: der Verstehensauftrag trug die Blob-Kennung `raw-…` statt
  der Ablagekennung `rd-…` (**der Pfad haette nie ein Dokument verstanden und das als Erfolg
  gemeldet**) · der Rueckstandsalarm war durch Zurueckstellen loeschbar (an echter DB
  gemessen: 72 h Rueckstand ⇒ 0 h nach einer Zurueckstellung; behoben ueber die neue Spalte
  `first_due_at`) · `buildV3Briefing` war nicht aufloesbar (Briefingstufe tot) · deaktivierte
  und soft-geloeschte Mandate waeren geplant worden (`p.disabled` existiert an Profilen nicht)
  · reservierte, nie bearbeitete Auftraege verbrannten Versuche · **drei der „vier
  Merge-Neutralitaetsbeweise" waren Tautologien** (sie prueften `selectLageVorgaenge`, das mit
  der Ordnung nichts zu tun hat). Migration → wiederholen → Rollback → wiederholen → erneut
  anwenden: **21 Schritte fehlerfrei** an PostgreSQL 16.13; Mutationsproben zu jeder Korrektur
  rot. **24 weitere Befunde benannt, aber bewusst nicht geaendert** — darunter: **Mandantenanteil
  und faire Rotation sind gebaut, aber im Produktionspfad nicht verdrahtet** (`scopeMax` ist
  immer `null`), und **`lib/helmut/worker-betrieb.js` ist im Betrieb tot**. Beides ist **vor
  der ersten Aktivierung** zu entscheiden. Kanonischer Beleg:
  [`betrieb/op30-abschlussreview-2026-08-08.md`](betrieb/op30-abschlussreview-2026-08-08.md).
- **Kanonischer Beleg (Ursache):** [`betrieb/v3-skalierungspruefung-2026-08-08.md`](betrieb/v3-skalierungspruefung-2026-08-08.md).
  **Abgrenzung zu OP-25:** OP-25 beschreibt das *Symptom* (je Lauf wird nur ein Teil der
  Mandanten erreicht) und wird über Fairness/Zeitdeckelung geführt. OP-30 ist die belegte
  *Ursache* auf der Eingangsseite und hat eigene Lösung, eigene Freigabe und eigenen Nachweis.
  **Namenskollision beachten:** „Punkt 30" in [`roadmap/phase_1_checkliste.md`](roadmap/phase_1_checkliste.md)
  ist die Phase-1-Abnahme und hat mit OP-30 nichts zu tun.
- **Befund (Code, 2026-08-08).** `scheduler.getSourcesForProfile` (`lib/helmut/scheduler.js:848`
  und `:876`) stellt jedem Profil zusätzlich zum geteilten relationalen Plan
  `[personNewsSource(profile), ...mandateNewsSources(profile)]` voran. Offline aus dem
  Produktionscode gemessen: **7 eigene Quellen / 8 Feed-URLs je Bundestagsmandat**, **8 / 9 je
  Landtagsmandat** (`lib/helmut/scheduler.js:977` und `:1011`). Diese Wege gehören
  **ausdrücklich zu keinem Paket** und unterliegen damit nicht der Ein-Mal-Crawl-
  Referenzzählung (`lib/helmut/quellenarchitektur/paket-inventur.js:605–609`, Abschnitt „3.8
  Laufzeitquellen"). Sie sind **keine V3-Komponente**: `docs/V3_MIGRATION_PLAN.md` erwähnt
  weder `personNewsSource` noch `mandateNewsSources`.
- **Kapazitätsfolge (rechnerisch plausibel, nicht gemessen).** Basis ist der gemessene
  Production-Lauf **181 Quellen in 112,11 s** = 0,619 s/Quelle amortisiert
  ([`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.6; Google-Gate Parallelität 5,
  Mindestabstand 200 ms). Mit 140 geteilten Wegen ergibt sich der Kipppunkt bei
  **n ≈ 14–15 Bundestagsmandaten** — dort überschreitet allein der Quellenabruf das Budget der
  globalen Phase. Zweite, unabhängige Schranke: `budgetAufteilung`
  (`lib/helmut/cron-globalphase.js:239`, `DEFAULT_PROJEKTION_MS = 8000`,
  `MIN_GLOBAL_ANTEIL = 0.5`) begrenzt die Projektionszeit auf **135 s**, also **max. ~16–17
  Mandate je schwerem Lauf**, unabhängig von der Gesamtzahl. Bei 200 Mandaten: 1 540 Quellen
  ≈ **953 s** Abruf gegen 135 s Budget.
- **Kein Absturz, aber kein Produkt.** Erschöpftes Abrufbudget wird ehrlich gezählt
  („Abrufbudget erschoepft", `lib/helmut/scheduler.js:2201`), der Datenstand versiegelt
  `teilweise` und bleibt projizierbar (`datenstandVerwendbar`,
  `lib/helmut/cron-globalphase.js:316`). Die Mandate erhalten unvollständige Lage.
- **Zweite Grenze derselben Klasse (KI, nicht Abruf).** Das Lagenarrativ ist per Entwurf ein
  **Pro-Mandant-Aufruf** (`lib/helmut/lage.js:539–544`, `:571`) gegen einen **globalen**
  Tagesdeckel `HELMUT_MAX_LLM_CALLS_PER_DAY = 100` (`lib/helmut/storage.js:1116`, `:1208`) mit
  Understanding-Reserve 30 (`:1589`). Rechnerisch ist damit bei **~70 Mandaten** Schluss, fail
  closed (ehrlicher Leerzustand, `lage.js:556` `skipped-lage-narrativ`). **Das Verstehen selbst
  ist davon nicht betroffen** — es ist nachweislich global und einmal je Vorgang
  (`lib/helmut/understanding.js:560`, `:765–859`).
- **Kleinste Lösung (Reihenfolge nach Wirkung/Risiko).**
  1. **M1** — die fünf merkmalsbasierten Suchen (Regierungsvorhaben, Fraktion/Partei,
     Ministerien, Ausschuss, Themenmedien) in **geteilte Merkmalspakete** überführen. Das
     Muster ist gebaut und aktiv („hundert Profile mit demselben Paket → ein Crawl",
     [`quellenarchitektur/07-paketaktivierung-profil-resolver.md`](quellenarchitektur/07-paketaktivierung-profil-resolver.md));
     es fehlt die Kanonisierung der heute profileigenen Top-5-Themen. Wirkung: eigene Wege je
     Bundestagsmandat **7 → 2**, Kipppunkt **n ≈ 15 → n ≈ 45–50**. Nebenbedingung: der
     K2.1-Kontextvertrag (`vorgangskontext.pruefeAlleKontextgrenzen`) muss grün bleiben —
     ein geteilter Weg darf nie mandatsspezifische Inhalte in fremde Sichtbarkeit heben.
  2. **M2** — Personensuche seltener (nur erster schwerer Lauf des Tages; Archivfeed `when:3m`
     wöchentlich). Sie ist die teuerste Quellenklasse: **~98 Anfragen je Personenquelle**
     gegen 37 je Suchquelle (§7.6, `scripts/quellen-mehrfachabruf-test.js`).
  3. **M3** — `HELMUT_TENANT_LLM_CAP` aktivieren (`lib/helmut/storage.js:1428`), damit ein
     Mandant nicht den globalen Deckel aller verbraucht. Gehört zu **OP-03**.
  4. **M4** — `HELMUT_UNDERSTANDING_GATE` `shadow → on` (**OP-18**), senkt KI-Aufrufe.
  5. **Neu zu bauen** (nicht vorhanden): dauerhafte Auftragswarteschlange mit Worker
     (löst das 300-s-Cronfenster, **nicht** die Google-Drosselung); kanonische
     Merkmalspakete als Datenbestand; ein Kapazitätswerkzeug, das über n variiert.
- **Werkzeuglücke.** `scripts/globalabruf-kapazitaet-test.js` ist auf **n = 6** festgelegt,
  läuft mit `HELMUT_GOOGLE_HARDENING = "off"` und benennt im Kopfkommentar selbst, dass es
  Regressionen der Abruf-Nebenläufigkeit (`HELMUT_GOOGLE_CONCURRENCY`,
  `HELMUT_GOOGLE_MIN_SPACING_MS`, `CRAWLER_TIMEOUT_MS`, `HELMUT_GLOBALPHASE_ABRUF_STUFE`)
  **nicht** bemerkt — genau diese Parameter sind die Skalierungsgrenze. Ein
  Skalierungswerkzeug für 200 Mandate existiert im Repository **nicht**.
- **Abnahmekriterium.** (a) Eigene Abrufwege je Bundestagsmandat ≤ 2, offline am echten
  `getSourcesForProfile` gemessen; (b) ein Kapazitätswerkzeug über n mit dokumentierter,
  belegter Obergrenze; (c) ein vollständiges OP-25-Fenster **nach** der Änderung bestanden;
  (d) K2.1-Kontextvertrag und Mandantentrennung unverändert grün.
- **Berührt OP-25 zwingend.** M1–M4 verändern jeweils `quellenVereinigung`, die
  K2.1-Sichtbarkeitsmengen, den Kostenvertrag oder E3. Der OP-25-Nachweis ist
  deploymentgebunden ([`betrieb/vorgangskontext.md`](betrieb/vorgangskontext.md) §7.7.5) und
  muss **nach jeder** dieser Maßnahmen **vollständig von vorn** laufen. Ein laufendes Fenster
  darf keine davon enthalten.
- **UMSETZUNGSSTAND 2026-08-08 (Sprint „Skalierungsgrundlage 1000", lokal, kein Commit):**
  M1/M2 sind **gebaut und lokal getestet** — nicht als Umbau der Bestandssuchen, sondern als
  eigener, standardmäßig ausgeschalteter Pfad. Kanonisch:
  [`betrieb/skalierungsgrundlage-1000.md`](betrieb/skalierungsgrundlage-1000.md).
  - **Neu:** `public.helmut_jobs` (Migration `20260808_scalable_job_queue.sql` + Rollback),
    `lib/helmut/source-demand.js` (Compiler), `lib/helmut/scalable-pipeline.js`
    (Scheduler/Worker/Handler), RPC-Hüllen in `storage.js`, Anbindung und rein lesender
    Betriebsstatus `/api/ops/jobqueue` in `server.js`. Flag **`HELMUT_SCALABLE_PIPELINE`**,
    Default AUS, nicht in der Datei-Allowlist.
  - **Wirkung, an 1000 synthetischen Profilen gemessen:** 7 125 profileigene Quellen →
    **3 190 Aufträge**; **4 713** externe Abrufe/Tag gegen **21 795** im Bestandspfad
    (**4,6× weniger**). Mandatsabhängige KI-Aufrufe aus diesem Pfad: **0**.
  - **Tests (Stand nach dem Nachweissprint 2026-08-08):** Datenbanknachweis gegen echten
    PostgreSQL 16.13 **52/52** · Vertrag **100/100** · Compiler **59/59** · 1000-Profile
    **69 PASS / 0 FAIL / 2 offen** · Sicherheit **69/69** mit Server (ohne Server 58/58 +
    1 ausdrücklich offen) · Aktivierungsschutz **50/50** · **Belastungstest 19/19** ·
    **Mutationsprobe 10 rot / 0 grün** · Gesamtlauf **199/214, baseline-identisch**
    (gegen frischen `git archive HEAD`-Baum gegengeprüft) · Browser-Smoke **32/32**.
  - **Kapazität lokal gemessen** (echte Prozesse, echter Server, Attrappen für Netz/KI):
    5 190 Aufträge; 1 Worker ≈ 950/s, 8 Worker ≈ 2 750/s; harter `SIGKILL` mitten im Lauf
    verliert **keinen** Auftrag (genau die reservierten Aufträge werden wieder vergeben).
    Rechnerisch **1 Worker** für den Tagesbedarf von 1 000 Mandaten (Auslastung ≈ 0,02 %)
    ⇒ **die Warteschlange ist nicht der Engpass**.
  - **Neuer Befund, behoben:** Briefingmaterialisierung lag bei **37 von 1 000** Mandaten
    zeitlich **vor** den eigenen Abrufen (unnötiger Leerzustand). Projektion und Briefing
    liegen jetzt in **Phasenfenstern** (ab 50 % / 75 % des Fensters), Streuung weiterhin
    deterministisch. Danach **1 000 von 1 000 belegte Briefingstände**.
  - **Erste echte Wand bei 1 000 Mandaten ist der globale KI-Deckel**
    (`HELMUT_MAX_LLM_CALLS_PER_DAY` = 100/Tag, global über alle Mandanten), nicht die
    Warteschlange und nicht der Motor. **In diesem Sprint nichts daran geändert** — das
    gehört zu **OP-03** (`HELMUT_TENANT_LLM_CAP`). Bewertung: Sprintdoku §12.
  - **Google-Abhängigkeit gemessen statt geschätzt:** **100 %** der 3 190 profileigenen
    Abrufwege laufen über `news.google.com` (Sprintdoku §13). Keine neue externe Technik
    gebaut; die Absicherung ist benannt, nicht umgesetzt.
  - **Nicht bewiesen (ausdrücklich):** Rückstand in ≤ 24 h abarbeitbar; Kapazitätsreserve
    Faktor zwei unter **echter** Google-Drosselung; jede reale Google- oder KI-Laufzeit.
    Die lokalen Stubs beweisen die Warteschlange, nicht die Außenwelt.
  - **Abnahmekriterium (a) ist damit NICHT erfüllt**, sondern umgangen: die eigenen Wege je
    Mandat bleiben im **Bestandspfad** unverändert bei 7. Der neue Pfad reduziert sie auf
    effektiv ~3,2 Aufträge je Mandat — aber nur, wenn er aktiviert wird. (b), (c) und (d)
    bleiben vollständig offen.
  - **Verbleibende Stellschraube:** die Regionalsuche ist strukturell fast eindeutig und
    trägt 1 000 der 1 190 geteilten Aufträge. Ein eigenes, längeres Fenster ist über
    `HELMUT_DEMAND_*` bereits konfigurierbar — aber eine **Produktentscheidung**.
- **NACHTRAG 2026-08-08/2 (Sprint „V3-Anbindung und skalierbares KI-Budget", lokal):**
  - **Die Kette ist geschlossen.** Bis dahin reihte **niemand** `document_understanding` ein —
    der Warteschlangenpfad endete faktisch beim Rohdokument. Jetzt reiht jeder erfolgreiche
    Abruf einen Verstehensauftrag ein; der Schlüssel ist der **Inhaltsfingerabdruck** der
    Dokumentmenge, nicht die Zeit. Damit ist Punkt 4 der Restliste dieses OP-Eintrags
    („`document_understanding` wird noch von niemandem eingereiht") **geschlossen**.
  - **Reihenfolge geprüft statt angenommen:** `helmut_jobs_offen` zählt offene Vorbedingungen;
    Projektion und Briefing werden **ehrlich zurückgestellt** (`helmut_defer_job`, nimmt den
    Versuch zurück — Warten ist kein Fehlversuch). Ein **endgültig** gescheiterter Abruf
    blockiert das Briefing nicht.
  - **Skalierbares KI-Budget** (`HELMUT_LLM_FAIRNESS`, **Default AUS**, zweites Flag getrennt
    vom Warteschlangenflag): Reservierung je **beabsichtigtem Ergebnis** (Wiederholung kostet
    nichts), Mandantenanteil **und** globales Notfalllimit in **einem** atomaren Schritt,
    faire deterministische Rotation ohne Verhungern. **Kein Production-Deckel geändert**;
    `helmut_reserve_llm_call`/`llm_budget_counters` aus 20260717 bleiben unangetastet.
  - **KI-Modellzahlen für 1000 Profile** (`scripts/ki-modellzahlen-test.js`, rechnerisch mit
    offengelegter Formel): realistisch **≈ 12 000 Aufrufe/Tag**, davon **91 % global**
    (Verstehen) und **9 %** mandatsbezogen. Der **globale Sockel allein** ist **109×** so groß
    wie der heutige Deckel 100. **Damit widerlegt:** die Erwartung, der mandatsbezogene Anteil
    sei der teure Posten. Der wirksamste Kostenhebel ist das **Understanding-Gate (OP-18)**,
    nicht ein höherer Deckel; die faire Verteilung löst eine andere Frage (Reihenfolge­schutz).
  - **Anbieterrisiko:** jeder Auftrag trägt jetzt eine **Anbieterkennzeichnung** (additiv, aus
    dem Host abgeleitet). Zwei Attrappen geprüft (`scripts/anbieterausfall-test.js`): bei einem
    vollständigen Google-Ausfall scheitern die Abrufe **sichtbar**, es entsteht **kein**
    Verstehensauftrag aus einem gescheiterten Abruf, das Briefing meldet einen **ehrlichen
    Leerzustand**, und die Katalogquellen laufen unverändert weiter. **Kein neuer Anbieter
    integriert** — Empfehlung mit Aufwand/Nutzen/Risiko in der Sprintdoku §15.
  - **Neue lokale Migrationen** (nicht angewendet, je mit vollständigem Rollback):
    `20260808_jobqueue_abhaengigkeiten.sql` (Vorbedingungszählung + `helmut_defer_job`) und
    `20260808_llm_budget_fairness.sql` (`llm_reservations` + ergebnisbezogene Reservierung).
  - **Tests:** V3-Anbindung **55 PASS / 2 offen** · KI-Budget **59/59** mit Server
    (27 + 1 offen ohne) · Modellzahlen **9/9** · Anbieterausfall **17/17**. Gesamtlauf
    **203/218** — **identischer Fehlschlagsatz wie die frisch erzeugte Baseline**, keine
    Regression. Der zuvor einmal beobachtete Wackler in `berlin-e2e-vertrag-test.js` ist
    **reproduziert, erklärt und behoben** (untreues Testgerüst); **offen bleibt** der dabei
    entdeckte Production-Befund: die Reihenfolge der Matchingergebnisse ist bei gleichem
    Zeitstempel **undefiniert** — eine Gründerentscheidung, siehe Sprintdoku §15.
- **Zustand:** offen. Code liegt lokal auf `claude/helmut_scaling_foundation_1000`
  (Arbeitsbaum `/home/user/helmut-scaling`), **kein Commit, kein PR**. Für den Einzelpiloten
  (5–6 Mandate) **kein** Blocker; Blocker ab etwa zehn Mandaten und damit vor mehreren
  zahlenden Kunden.

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
