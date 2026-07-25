# CURRENT STATE — Helmut

**Letzte Aktualisierung:** 2026-07-25 · **`main`-HEAD:** `0d6d867` (Merge #125)

> **Diese Datei ist der aktuelle Stand.** Bei Widerspruch zu älteren Statusdokumenten
> gilt diese Datei. Sie enthält **keine Chronik** — Details je offenem Punkt stehen in
> [`datenmotor-restliste.md`](datenmotor-restliste.md) (OP-Nummern, verbindlich),
> der Systemstatus in [`quellenarchitektur/00-master-status.md`](quellenarchitektur/00-master-status.md),
> die Sicherheitswahrheit in [`quellenarchitektur/05-sicherheitsmodell-rls.md`](quellenarchitektur/05-sicherheitsmodell-rls.md).
>
> **Pflege:** nach jedem größeren Sprint aktualisieren — nur die tatsächlich
> veränderten Zeilen. Regeln dafür: [`../CLAUDE.md`](../CLAUDE.md) §8/§9.

---

## 1 · Aktive Phase

**Verkaufsreife herstellen.** Der Einzelpilot läuft stabil in Production; offen sind
die vier P0-Verkaufsblocker (OP-01…OP-04). Produktseitig gilt Feature-Stopp zugunsten
von Betriebs-, Rechts- und Sicherheitsreife.

## 2 · Erfolgreich abgeschlossen (Abnahme erfüllt, Production-belegt)

| Punkt | Beleg |
|---|---|
| Quellen-Cutover: relationale DB ist aktive Quellenwahrheit (`HELMUT_SOURCE_MODE=on`) | `helmut-flags.json`, Freigabe 2026-07-15 |
| App-seitige Mandantentrennung inkl. Cross-Tenant-Write-Guard | PR #96, `quellenarchitektur/05-sicherheitsmodell-rls.md` |
| Mandantenneutralisierung: kein Pilot-/Default-/Fallback-Mandant im Code | PR #97 |
| Atomare fail-closed Locks (Crawl + Understanding), Quellen-Telemetrie | PR #95, `betrieb/production_beweisprotokoll.md` |
| LLM-Tagesbudget 100 + Reserve 30, fail-closed | live (FA-5/FA-6/FA-12) |
| Ehrlicher Health-Report, Radar-Störungswahrheit, echte Laufzeitmessung | PR #95, Beweisprotokoll |
| PILOT_SECRET rotiert (alter Klartext-Code wertlos) | FA-1, 2026-07-15, `HTTP 200` verifiziert |
| KO-Klassifikations-Backfill inkl. Idempotenz-Nachweis (OP-08) | Runs 29511858469 / 29621926765, SQL-Gegenprobe 0 Lücken |
| Blockierendes CI-Gate (Offline-Suite + Chromium-Smoke) existiert | `.github/workflows/ci.yml` |
| Profil-Storage relational entkoppelt (Exklusivmodus) | PR #113 |
| Doku-Konsolidierung: `main` als einzige Architekturwahrheit | PR #114 (Recovery Sprint R2) |
| Quellenarchitektur-Remediation: Seed-Reproduzierbarkeit (P0-1) inkl. Drift-CI-Gate, Neutralisierung der Pflicht-Landespakete (P0-2), 6 Bundesweg-Reparaturen im Katalog (P1-5) | PR #118, gemergt 2026-07-25 (`61767a9`), CI grün, Deployment `READY` |
| Kontext-Einstiegsschicht (`CLAUDE.md`, `START_HERE`, `CURRENT_STATE`, `ARCHITECTURE`) | PR #119, gemergt 2026-07-25 |
| **Anker-Recovery-Pfad (F-3) technisch stillgelegt** — Workflow entfernt, Execute-Skript ohne DB-/KI-/Write-Pfad, `RECOVERY_ALLOWLIST` leer, namensunabhängiger CI-Riegel | PR #105, gemergt 2026-07-25 (`43e9e35`); auf `main` verifiziert: Workflow weg, Allowlist `[]`, 0 `require` im Execute-Skript |
| `failed-final` wird im Pending-Filter und in `understandOneCluster` terminal behandelt („nie wieder") | PR #105 |
| Freigabevorlage Quellen-Seed-Einspielung (Soll-Zahlen, Idempotenznachweis, Go-/Stop-Kriterien) | PR #123, gemergt 2026-07-25 (`bed7f53`), CI grün |
| **Production-Inventur aller Quellenpakete** (7 Pakete in der DB, 8 im Code-Seed seit #118; 163 Abrufwege; Ertrag/letzte Lieferung/Fehler je Paket) | `quellenarchitektur/30-paket-inventur-production.md`; PR #124, gemergt 2026-07-25 (`118e90c`), CI grün, Deployment `READY` |
| **Automatische Profil→Paket-Zuweisung belegt** — Bund/Berlin/Brandenburg gegen den echten Production-Katalog, ohne Codeänderung; keine Mandanten-Hardcodes, Bestandsmandanten unverändert | `scripts/paketzuweisung-nachweis-test.js` 147/147, Inventur §6; PR #124, gemergt 2026-07-25 (`118e90c`) |

## 3 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt | → OP |
|---|---|---|
| Google-News-Härtung (Gate/Retry/Breaker/Cooldown, Default AN) | Production-Beweislauf unter echter Drosselung | OP-15 |
| Monitoring-Zweitkanal + Meta-Heartbeat (Sender gehärtet) | `HELMUT_MONITORING_WEBHOOK_URL` unset → No-Op, kein `webhook.sent`-Beleg | OP-07 |
| `source_id`-Dubletten-Fix | Live-Nachweis „Telemetriezeilen = distinct `source_id`" | OP-19 |
| Zweitmandanten-Provisionierung + Per-Mandant-Kostendeckel | Migration `20260721` nicht angewandt, `HELMUT_TENANT_LLM_CAP` AUS, DB-seitige Durchsetzung unentschieden | OP-03 |
| Retention/Löschung | nur Trockenlauf; braucht verbindliche Fristen aus OP-02 | OP-12 |
| Understanding-Gate, Cheap-Triage, Scoring, Berlin/Brandenburg | in `shadow`/`off`, Scharfschaltung ist Freigabe | OP-18, OP-21, OP-22 |
| Pre-Seed-Sicherung + gezielter Seed-Restore (kein `drop table cascade`) — gebaut, adversarial reviewt, isoliert getestet (43/43 lokal, 41/41 in CI; `backup-export-test` 38/38; Suite 147/147) | **nie gegen Production gelaufen**; deckt nur 8 Tabellen ab und ersetzt OP-01 nicht | OP-01 |
| OP-06 Terminales Aussortieren des Alt-Rückstands (34 Fälle, Default AUS) | Ausführung ist freigabepflichtig — **und** eine offene Fachfrage: 16 der 34 Allowlist-Einträge sind mit „außerhalb Mandat" begründet, also relativ zum Pilotmandat, geschrieben wird aber in das mandantenneutrale `knowledge_objects` (kein `tenant_id`). Ein künftiger Zweitmandant mit regionalem/EU-Schwerpunkt bekäme diese Vorgänge dauerhaft nie verstanden | OP-06 |

## 4 · Blockiert

| Punkt | Ursache | Nächster Schritt |
|---|---|---|
| **OP-01** Supabase Pro + PITR | Kostenentscheidung des Betreibers (~25 $/Monat); Free-Plan = **keine Backups** | Betreiber schaltet Pro + PITR frei, dann Restore-Übung nach `betrieb/backup-restore-runbook.md` |
| **Quellen-Seed-Einspielung** (macht P0-2 und die 6 Bundesweg-Reparaturen in der DB wirksam) | noch zwei offene Go-Kriterien: **2** die Pre-Seed-Sicherung ist **noch nicht gelaufen** · **8** die Einspielung ist nicht freigegeben. Kriterium **11** ist **entschieden**: gestaffelte Reaktivierung (§6d). **Versucht 2026-07-25:** `node scripts/backup-export.js --scope=seed` in der Agenten-Sitzung ausgeführt — Abbruch vor jedem Netzwerkzugriff (Exit 2), da `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` in dieser Umgebung nicht gesetzt sind und keine `.env.local` existiert. **Kein** Production-Zugriff erfolgt. Betreiber führt den Export selbst mit echter `.env.local` aus | Betreiber führt `node scripts/backup-export.js --scope=seed` lokal aus und teilt das Manifest (`art`, `vollstaendig`, Zeilenzahlen je Tabelle, `pruefsummeGesamt`, `mainCommit`) mit; danach Runbook `betrieb/quellen-seed-einspielung.md` §6c Schritt 6 ff. |
| **OP-02** Recht (Pilotvertrag, AVV, DSFA, Art.-9-Grundlage, Fristen) | externe Prüfung durch Anwalt/DSB steht aus | Entwürfe aus `recht/` prüfen lassen und zeichnen; blockiert OP-12 |
| **OP-03** Zweitmandanten-Freigabepaket | Grundsatzentscheidung „DB-seitige Durchsetzung vs. dokumentierte App-Guard-Akzeptanz" fehlt (`mandantentrennung-architektur.md` bewertet die Wege) | Betreiber entscheidet einen Weg; danach Migration + Env + Probelauf |
| **OP-04** Demo-Mandate entfernen — **Umfang korrigiert 2026-07-25:** Production führt **8 Profile, davon 6 aktiv** (nicht 1 Pilot + 2 Demo-Mandate); fünf davon tragen Klarnamen realer Abgeordneter | Production-Datenänderung, freigabepflichtig; berührt zusätzlich OP-02 (personenbezogene Daten) | je Profil entscheiden, dann über Provisionierungswerkzeug deaktivieren (`quellenarchitektur/30-paket-inventur-production.md` §5, A-1) |
| **OP-09/OP-10** Production-Beweise Lock-Deny und Fehlerpfad | brauchen ein echtes Störereignis; künstliche Injektion und Doppelstart sind verboten | beim nächsten echten Vorfall dokumentieren |

## 5 · Fehlgeschlagene oder abgebrochene Ansätze — **nicht wiederholen**

> Diese Einträge existieren, damit kein neuer Thread dieselbe Sackgasse erneut baut.

### F-1 · Tenant-JWT-Selbstsignierung → RLS scharfschalten — **gescheitert, dauerhaft stillgelegt**
- **Versucht:** Mandantentrennung DB-seitig über selbstsignierte Tenant-JWTs und die
  23 RLS-Policies durchsetzen.
- **Warum gescheitert:** Supabase stellte auf asymmetrische JWT-Signing-Keys um; der
  Selbstsignatur-Pfad ist tot (PGRST301-Logs 12./13.07.). Stillgelegt am 2026-07-13
  (Commit `f952b69`, PR #68); `tenantJwtModeEnabled()` gibt hart `false`.
- **Folge:** RLS ist **inert**, Trennung ist App-seitig. Ein Nachfolgekonzept ist Teil
  von **OP-03**. `HELMUT_TENANT_JWT_MODE` zu setzen ist wirkungslos.

### F-2 · Generation B „Quellenplattform" — **abgebrochen, nicht mergen**
- **Versucht:** paralleler Nachbau der Quellenarchitektur auf eigenen Branches.
- **Warum abgebrochen:** dupliziert, was auf `main` bereits live läuft; aus Sicht des
  Servers additiver toter Code. Merge würde die laufende Architektur gefährden.
- **Verbindlich:** [`architecture/retired-quellenplattform-branches.md`](architecture/retired-quellenplattform-branches.md)
  (vollständige Branch-Liste).

### F-3 · Anker-basierter Understanding-Recovery-Pfad — **in Production fehlgeschlagen**
- **Versucht:** 6 eingefrorene Alt-Fälle über einen anker-basierten Recovery-Pfad
  rekonstruieren (OP-05).
- **Was passierte:** der Lauf `rec-29569461715` erzeugte in Production einen
  **Multi-Themen-Digest** statt sauber getrennter Vorgänge; er wurde zurückgerollt.
- **Ursache (verifiziert):** `matchDocuments`/`anchorsMatch` in
  `lib/helmut/understanding-recovery.js` vergleicht über **Teilstring-Anker**
  (`a.includes(b) || b.includes(a)`) ab 8 Zeichen. Bei Multi-Doc-Fällen zieht das
  fremde Themen in dasselbe Cluster. Der Fehler liegt im Matcher, nicht in der
  Orchestrierung — er ist also **reproduzierbar**, solange Matcher und Allowlist stehen.
- **Blast-Radius:** Der Workflow lief nur manuell (`workflow_dispatch`, kein
  `schedule`/`push`), griff aber mit dem **Service-Role-Key** auf die Production-DB zu
  (umgeht RLS) und schrieb bis zu 6 neue complete-KOs. `knowledge_objects` trägt
  **kein** `tenant_id` — ein falsches KO ist für **alle** Mandanten sichtbar, inklusive
  Pilot-Briefing.
- **Stand auf `main`: stillgelegt** (PR #105, gemergt 2026-07-25, `43e9e35`). Auf
  `main` verifiziert: `.github/workflows/understanding-recovery.yml` existiert nicht
  mehr, `RECOVERY_ALLOWLIST` ist `[]`, das Execute-Skript enthält 0 `require`.
- **Die drei unabhängig wirksamen Sperren:** Workflow-Datei
  entfernt · `scripts/understanding-recovery-execute.js` auf einen Hinweis reduziert
  (kein `require` von `storage`/`ai`/`understanding`, wirkungslos auch mit Flag +
  korrektem Token) · `RECOVERY_ALLOWLIST` geleert. Zusätzlich ein
  **namensunabhängiger Regressionsriegel**: die Offline-Suite schlägt fehl, sobald
  *irgendein* Workflow — auch unter anderem Dateinamen — das Execute-Skript aufruft
  oder `HELMUT_RECOVERY_EXECUTE`/`-CONFIRM` setzt. Da CI die Offline-Suite fährt,
  blockiert das eine spätere Wiederbelebung.
- **Nicht wiederbeleben:** Der Branch `claude/helmut-datenmotor-impl-2-kd1jl9` trägt
  unter demselben Pfad eine **lauffähige** Fassung. Bei einem späteren Merge gilt für
  alle vier Recovery-Dateien die stillgelegte Fassung aus #105; eine
  Einzeldokument-Recovery gehört unter einen **eigenen** Dateinamen.
- **Konsequenz:** Diesen Workflow **nicht** ausführen. Der tragfähige Ersatzweg ist
  die **Einzeldokument-Recovery** je exakter `raw_document_id` (1 von 6 Fällen so
  bereits erfolgreich recovert, `singledoc-29583280106`); 1 Fall ist live als Duplikat
  verifiziert (→ OP-06).
- **Nicht betroffen:** `lib/helmut/ko-recovery.js` (P1-4, Default AUS) sowie
  `POST /api/admin/recovery/reset-failed` und `GET /api/debug/reset-failed-kos` nutzen
  den **normalen** Understanding-Pfad, nicht den Anker-Matcher.

### F-4 · Befund „Quellenbasis zu dünn" (altes Schema P2-5) — **Fehlbefund**
- Die Warnung entstand aus nie erfüllbaren Schwellen (495/450/405) gegen einen
  gesunden Crawl (~145 Quellen) und einer Zählung über den toten `store.sources`-Blob.
  Schwellen und Zählung sind korrigiert. **Es fehlen keine Quellen für den Piloten** —
  diese Analyse nicht erneut aufsetzen.

### F-5 · Feste Referenzzahl „145 Quellen" — **verworfen**
- Die Quellenzahl ist mandats-/profilabhängig (Demo-Mandat: 139). Die gültige
  Invariante ist `Telemetriezeilen = distinct source_id`, nicht eine feste Zahl (B3).

## 6 · Offene Punkte (Übersicht)

Vollständig und verbindlich in [`datenmotor-restliste.md`](datenmotor-restliste.md) §6.

- **P0 (Verkaufsblocker):** OP-01 Backups · OP-02 Recht · OP-03 Zweitmandanten-Paket · OP-04 Demo-Mandate
- **P1 (Betriebsreife):** OP-05 … OP-12
- **P2 (Produktqualität):** OP-13 … OP-20
- **P3 (später):** OP-21 Berlin/Brandenburg · OP-22 Scoring · OP-23 Hygiene

## 7 · Aktuelle Blocker (zusammengefasst)

1. **Kein Backup in Production.** Supabase Free-Plan, zentraler Blob ist
   Last-Write-Wins → ein fehlerhafter Write kann den Betriebszustand unwiederbringlich
   zerstören. Höchstes Einzelrisiko (OP-01). Für den **Seed-Sonderfall** existiert seit
   2026-07-25 ein geprüftes Werkzeugpaar (Pre-Seed-Export + gezielter Restore, §12) —
   das ersetzt OP-01 **nicht** und deckt nur die 8 Quellentabellen ab.
2. **Keine rechtliche Grundlage für Verkauf.** Kein geprüfter Pilotvertrag/AVV/DSFA,
   `knowledge_objects` enthalten Art.-9-Daten (OP-02).
3. **Sicherheits-Grundsatzentscheidung offen.** Ohne Entscheidung zu OP-03 darf kein
   zahlender Zweitmandant aufgeschaltet werden.
4. **Branch Protection unbestätigt.** Das CI-Gate blockiert erst mit aktivierter
   Branch Protection; Aktivierungsstand ist nicht verifiziert (OP-11,
   `betrieb/branch-protection.md`).

## 8 · Offene Pull Requests (Stand 2026-07-25)

| PR | Inhalt | Einschätzung |
|---|---|---|
| #117 | WBSB-Pilotpaket + Workflow-Härtung vereinigt | **Draft, ausdrücklich nicht mergen** (öffnet nur die CI-Prüfung) |
| #115 | Bestandsabgleich `bund-basis` + Pflichtquellen-Verifikationstest | **Draft, ausdrücklich nicht mergen** (nur um den Workflow auf einem Runner mit Egress laufen zu lassen) |
| #112 | Geführter Erstlogin-/Onboarding-Flow (14 Screens) | manuelle Abnahme im Preview ausstehend |
| #111 | Sichtbarkeits-Toggle auf `/passwort-setzen` | technisch mergefähig, wartet auf Freigabe |
| #88, #70, #8 | ältere Stände (teils auf verwaisten Basis-Branches) | **veraltet** — vor Verwendung auf Aktualität prüfen oder schließen |

## 9 · Aktuelle Production-Situation

- **Deployment:** Vercel, Region `fra1`, Projekt `helmut-pilot`; Deploy erfolgt
  automatisch beim Merge nach `main`. Rollback: `betrieb/deploy-rollback.md`.
- **Datenbank:** Supabase **Free-Plan** — keine Backups, kein PITR (OP-01).
- **Flags:** `HELMUT_SOURCE_MODE=on` · `HELMUT_UNDERSTANDING_GATE=shadow` ·
  `HELMUT_PARDOK_DISPATCH=shadow` · Scoring `off` · Berlin/Brandenburg inaktiv.
- **Crons:** 9 Vercel-Cron-Einträge (Crawl 04:00/20:00, Understanding 05:30/21:30,
  Morgenbriefing 05:00, Lage-Briefing 05:45, Health-Report 06:00, Lage-Check 10:00,
  Pipeline 16:00 UTC) — siehe `vercel.json`.
- **Quellen (read-only gemessen 2026-07-25):** 7 Pakete in der DB (die zwei Landes-Partei-Pakete
  aus #118 existieren bisher nur im Code-Seed) · 163 Abrufwege · 145 modell-aktiv ·
  138 real gecrawlt (6 defekte Wege ohne Abruf, DIP eigener Pfad) · 19 Berlin-/Brandenburg-Wege
  hart gesperrt · 8 Mandatsprofile, davon 6 aktiv, alle Bundestagsebene.
  Details: `quellenarchitektur/30-paket-inventur-production.md`.
- **Zustand:** 0 neue `systemErrors` im dokumentierten Beweiszeitraum; Betriebsbefunde
  B1 (Google-News-Klumpenrisiko, 146 von 163 Wegen über Google) und B2
  (Understanding-Rückstand) bleiben offen. Neu belegt: jeder Cron-Lauf erscheint doppelt —
  ein vollständiger Lauf und ~3 min später eine Wiederholung mit `circuit-open` auf fast
  allen Wegen (3 988 Telemetriezeilen gesamt) → gehört zu OP-15.
- **Nicht angewandte Migration:** `20260721` (DB-Härtung) — gehört zu OP-03.

## 10 · Letzte wichtige Entscheidungen

| Datum | Entscheidung |
|---|---|
| 2026-07-25 | **Die 6 reparierten Bundeswege werden gestaffelt reaktiviert** — erst die 2 Direktfeeds, nach einem vollen Crawl-Zyklus die 4 Google-Wege (`betrieb/quellen-seed-einspielung.md` §6d). Umsetzung als gezieltes `update` nach dem Seed, **nicht** durch Bearbeiten der Seed-Datei: der Bund-Seed ist per Drift-Gate byte-genau an seinen Generator gebunden |
| 2026-07-25 | Empfehlung, `rp-ausschuss-arbeit-soziales` wegzulassen, **geprüft und abgelehnt** — die Begründung („kein belegter Eigenertrag") ist zirkulär: der Weg hat keine Telemetrie, weil er `broken` ist. Sein einziger echter Abruf (Sprint 9B) ergab HTTP 200, 20 Items, jüngstes 0 Tage alt |
| 2026-07-25 | PR #125 (Sicherung + gezielter Restore) gemergt (`0d6d867`); CI auf `main` grün, Vercel-Production `READY` |
| 2026-07-25 | **Prüfungen im Seed-Runbook arbeiten mit gemessenen Deltas und benannten Zeilen**, nicht mit absoluten Zahlen aus einer Doku — absolute Zahlen driften bei jeder Provisionierung und hätten eine korrekte Datenbank fälschlich gestoppt |
| 2026-07-25 | Der Seed-Rückweg ist ein **gezielter, zeilenscharfer Restore** — `drop table … cascade` ist als Rollback **verworfen** (würde wegen `ON DELETE CASCADE` fremde Daten mitreißen und ist für Rückbau unbrauchbar) |
| 2026-07-25 | Ein Backup mit Fehlern gilt **nicht** als Backup: `backup-export.js` prüft die Zeilenzahl serverseitig gegen und markiert das Manifest `vollstaendig: false` + Exit 1 |
| 2026-07-25 | PR #124 (Paket-Inventur + Zuweisungsnachweis) auf Betreiberfreigabe gemergt (`118e90c`); CI auf `main` grün, Vercel-Production `READY` |
| 2026-07-25 | Anker-Recovery-Pfad **stillgelegt und auf `main` durchgesetzt** (PR #105, `43e9e35`); Wiederbelebung wird durch einen namensunabhängigen CI-Riegel blockiert |
| 2026-07-25 | Kontext-Einstiegsschicht ist verbindlich; `CLAUDE.md` → `START_HERE` → `CURRENT_STATE` ist die Pflichtlektüre jedes Threads (PR #119) |
| 2026-07-25 | Der anker-basierte Recovery-Pfad wird **nicht repariert, sondern stillgelegt**; echte Recovery läuft ausschließlich über den Einzeldokument-Pfad je exakter `raw_document_id` (PR #105) |
| 2026-07-22 | `main` ist die einzige Architekturwahrheit; Generation B wird nicht integriert (PR #114) |
| 2026-07-22 | Kanonische Doku-Hierarchie festgelegt: Sicherheit → `05-…`, Status → `00-master-status`, offene Punkte → `datenmotor-restliste` |
| 2026-07-17 | Einheitliches Nummernschema: OP-xx für offene Punkte; FA-x/FT2-x/A-Px nur noch historisch |
| 2026-07-15 | Quellen-Cutover ausgeführt (`HELMUT_SOURCE_MODE=on`) |
| 2026-07-15 | PILOT_SECRET rotiert |
| 2026-07-13 | Tenant-JWT-Pfad dauerhaft stillgelegt; Trennung bleibt App-seitig |

## 11 · Nächster sinnvoller Sprint

**Empfehlung: OP-01 (Supabase Pro + PITR) als Betreiber-Freigabe einholen und
ausführen** — er ist unabhängig von allem anderen, beseitigt das größte
Einzelrisiko und ist Voraussetzung dafür, dass die Migration aus OP-03 gefahrlos
eingespielt werden kann.

Der **konkret vorbereitete** nächste Schritt ist die **Quellen-Seed-Einspielung** (Seeds
`20260713` + `20260717`); sie macht die P0-2-Neutralisierung und die 6 Bundesweg-Reparaturen in
der Datenbank wirksam. Sie ist jetzt **vollständig entscheidungsreif**: Soll-Zahlen,
Idempotenznachweis, Rückweg, Kontrollkarten je Abrufweg und ein 17-Schritte-Runbook stehen in
[`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md).

Sie bleibt **blockiert**, aber nur noch an zwei Betreiberhandlungen:
1. `node scripts/backup-export.js --scope=seed` gegen Production ausführen (read-only, braucht
   `SUPABASE_SERVICE_ROLE_KEY`) und im Manifest `vollstaendig: true` bestätigen.
2. Die **absichtliche Reaktivierung der 6 Bundeswege** ausdrücklich mitfreigeben (§12).

Der gezielte Restore für den Fehlerfall ist gebaut und isoliert getestet — er ersetzt OP-01
**nicht**, deckt aber genau den Seed-Sonderfall ab.

Die Paket-Inventur belegt den Handlungsbedarf mit Production-Zahlen: die Landes-Basispakete tragen
in der Datenbank weiterhin Partei-, Fraktions- und Personenquellen (A-3), und 2 der 5
`always_on`-Kernwege stehen weiterhin auf `broken` (A-4). Ohne die Seed-Einspielung können die
Phase-1-Punkte 6, 7, 14 und 15 nicht grün werden
([`quellenarchitektur/30-paket-inventur-production.md`](quellenarchitektur/30-paket-inventur-production.md) §7).

Parallel möglich, ohne Freigabe:
1. **OP-11 Branch Protection** verifizieren (2 Minuten, reversibel,
   `betrieb/branch-protection.md`).
2. **Review offener PRs** (#112, #111).
3. **Phase-1-Checkliste** fortführen: [`roadmap/phase_1_checkliste.md`](roadmap/phase_1_checkliste.md)
   ist die operative Wahrheit; nächster nicht-freigabepflichtiger Block sind die Punkte 19–23
   (Ebenen-/Geografie-/Embedding-Vollständigkeit, Matching-Nachvollziehbarkeit).

**Vor einer OP-06-Ausführung ist eine Fachentscheidung nötig:** die mandatsrelative
Begründung von 16 der 34 Allowlist-Einträge (§3) muss bewertet werden — terminale
Markierung in einer mandantenneutralen Tabelle wirkt für alle künftigen Mandanten.

## 12 · Letzter Sprintausgang

| Sprint | Datum | Zustand |
|---|---|---|
| Go-Kriterium 2 kontrolliert versuchen: Pre-Seed-Backup-Export | 2026-07-25 | **Blockiert** — `node scripts/backup-export.js --scope=seed` exakt wie angefordert ausgeführt; Abbruch vor jedem Netzwerkzugriff (Exit 2), da diese Agenten-Sitzung keine `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` und keine `.env.local` besitzt. **Kein** Production-Zugriff erfolgt. Betreiberentscheidung: Export läuft auf der Betreibermaschine mit echter `.env.local`, Manifest wird zurückgemeldet. Details unten. |
| Review + Merge von PR #125, danach Production-Ablauf bis vor den ersten Zugriff vorbereiten | 2026-07-25 | **Teilweise abgeschlossen** — PR #125 adversarial reviewt (3 Reviewer, 20 belegte Befunde, alle behoben) und als `0d6d867` gemergt (CI auf `main` grün, Vercel-Production `READY`). Der Production-Ablauf ist vollständig vorbereitet; **kein Production-Zugriff erfolgt, keine Seeds ausgeführt**. Wartet auf die Betreiberfreigabe für den Pre-Seed-Export. Details unten. |
| Merge #123 + Sicherung, gezielter Restore und Entscheidungsreife für die Seed-Einspielung | 2026-07-25 | **Teilweise abgeschlossen** — #123 gemergt (`bed7f53`); Backup- und Restore-Werkzeug gebaut und isoliert getestet (33/33 lokal, 31/31 in CI, Suite 145/145). Die Seed-Ausführung bleibt **blockiert**: die Sicherung ist noch nicht gelaufen und die Reaktivierung der 6 Bundeswege ist nicht freigegeben. Details unten. |
| Phase-1-Block: Quellenpakete inventarisieren + automatische Paketzuweisung beweisen | 2026-07-25 | **Erfolgreich abgeschlossen** — beide Abnahmekriterien erfüllt und belegt; 145/145 Offline-Suiten grün; als PR #124 gemergt (`118e90c`), CI auf `main` grün, Vercel-Production `READY`. Details unten. |
| Merge PR #118 + Vorbereitung des Quellen-Seed-Sprints | 2026-07-25 | **Teilweise abgeschlossen** — #118 gemergt (`61767a9`), CI grün, Deployment `READY`. Die Seed-Einspielung ist vollständig entscheidungsreif vorbereitet, aber **blockiert** (fehlende Sicherung). Details unten. |
| Merge #122 + adversarialer Review von PR #118 (Quellenarchitektur-Remediation) | 2026-07-25 | **Erfolgreich abgeschlossen** — #122 gemergt (`54fe370`); #118 reviewt, 3 belegte Defekte behoben. |
| Merge von PR #105 — Anker-Recovery-Pfad in Production stillgelegt | 2026-07-25 | **Erfolgreich abgeschlossen** — gemergt als `43e9e35`; Stilllegung auf `main` verifiziert. |
| Recovery-Pfad-Review + Zusammenführung von PR #105 auf die kanonische Kontextstruktur | 2026-07-25 | **Erfolgreich abgeschlossen** |
| Kontextstruktur für Claude Code (`CLAUDE.md` + Einstiegsschicht) | 2026-07-25 | **Erfolgreich abgeschlossen** — reine Dokumentation, gemergt als PR #119 (`c6a3d40`). |

**Sprint „Go-Kriterium 2 kontrolliert versuchen" — Nachweis**

- **Auftrag:** ausschließlich `node scripts/backup-export.js --scope=seed` gegen Production
  ausführen, danach Manifest vollständig prüfen, dann zwingend vor Seed 1 stoppen.
- **Ausgeführt:** genau dieser eine Befehl, ohne Abweichung. Ergebnis: sofortiger Abbruch mit
  Exit-Code 2, Meldung „SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY muessen gesetzt sein
  (.env.local)". Das Skript prüft die Zugangsdaten **vor** jedem `fetch`-Aufruf — es wurde
  **keine einzige Anfrage** gegen Production gestellt, kein Verzeichnis unter `./backups/`
  angelegt, kein Manifest erzeugt.
- **Ursache verifiziert:** diese Agenten-Sitzung führt weder `SUPABASE_URL` noch
  `SUPABASE_SERVICE_ROLE_KEY` als Umgebungsvariable, und es existiert keine `.env.local` im
  Projektverzeichnis (nur `.env.example`). Das ist keine neue Erkenntnis — bereits im vorigen
  Sprint dokumentiert (s. u., „Die Production-Secrets sind in dieser Umgebung nicht gesetzt").
- **Keine Ersatzmaßnahme ergriffen:** kein Rückgriff auf den Supabase-MCP-Connector oder einen
  anderen Zugangsweg, da der Auftrag ausdrücklich genau dieses Skript vorschrieb.
- **Betreiberentscheidung:** der Export läuft auf der Betreibermaschine mit echter `.env.local`;
  das Manifest (`art`, `vollstaendig`, Zeilenzahlen je Tabelle, `pruefsummeGesamt`, `mainCommit`)
  wird zurückgemeldet und gegen die erwarteten Werte (163 Abrufwege, 7 Pakete, 165 Zuordnungen,
  siehe Inventur) geprüft, bevor Runbook-Schritt 6 fortgeführt wird.
- **Nicht getan (bewusst):** kein Production-Zugriff, weder lesend noch schreibend · keine
  Migration · kein Seed · kein Restore · keine Cron-/Flag-/Secret-Änderung · keine
  Quellenaktivierung · keine Datenänderung.

**Sprint „Review + Merge PR #125, Production-Ablauf vorbereiten" — Nachweis**

- **Review von PR #125:** drei spezialisierte Reviewer gegen den tatsächlichen Code, **20 belegte
  Befunde**, jeder einzeln nachgerechnet und behoben. Die vier schwersten:
  1. **Ein leerer Export galt als vollständiges Backup.** Auf allen 8 Quellentabellen ist RLS
     aktiv, aber es existiert **keine Policy** — ein anon-Key oder ein falsches Projekt liefert
     deshalb `HTTP 200` mit `[]` statt eines Fehlers. Das Ergebnis war ein grünes Manifest über
     leeren Dateien, und genau dieses Manifest ist das Go-/Stop-Gate des Runbooks. Der
     wahrscheinlichste Bedienfehler hätte das Sicherheitsnetz passiert.
  2. **Der Restore-`delete` war nicht eingegrenzt** und hätte eine nach dem Backup entstandene
     Mandantenzeile still gelöscht. Die Nachprüfung konnte das **strukturell nicht** bemerken:
     nach `delete … not in` + `insert` ist der Inhalt per Konstruktion die Backup-Menge, die
     Zählprüfung war damit **immer** erfüllt.
  3. **Ein zu spät gezogenes Backup wurde nicht erkannt** — der Restore wäre ein No-Op gewesen
     und hätte Erfolg gemeldet.
  4. **Die Soll-Zahlen des Runbooks widersprachen der gemessenen Production.** Die Vorlage
     rechnete mit 6 Paketen / 162 Wegen / 163 Zuordnungen, die Inventur aus #124 misst **7 / 163 /
     165**. Runbook-Schritt 6 hätte eine **korrekte** Datenbank gestoppt.
- **Konsequenz aus Befund 4:** Alle Prüfungen im Runbook arbeiten jetzt mit **gemessenen Deltas
  und benannten Zeilen** statt mit absoluten Zahlen aus einer Doku — absolute Zahlen driften bei
  jeder Provisionierung. Jede Differenz ist zugeordnet: zwei DB-only-Zeilen aus der
  Provisionierung, eine bereits vorhandene Zuordnung. **Seed 1 fügt in Production 0 statt 1
  Zuordnung ein.**
- **Weitere behobene Sachfehler:** Runbook-Schritt 13 prüfte auf `status='healthy'`, den kein
  Landesmodul-Weg je hat (wirkungslose Sicherheitsprüfung) · Schritt 16 konnte die
  Stopentscheidung aus Schritt 15 stillschweigend rückgängig machen · die Gate-Beschreibung
  behauptete, Paketschlüssel spielten keine Rolle, obwohl sie für `rp-rbb24-politik` die einzige
  Barriere sind · „2× `html` → `rss`" war in Anzahl und Richtung falsch (4×, alle nach
  `googlenews_search`) · die Kostenrechnung unterschlug die nicht deduplizierten Direktfeeds
  (≈16 statt 4 Abrufe) · `--scope seed` mit Leerzeichen fiel still auf den Voll-Export zurück.
- **Testlage.** `backup-export.js` hatte vorher **keinen einzigen Test**; der neue
  `scripts/backup-export-test.js` fährt es als echten Kindprozess gegen einen lokalen
  PostgREST-Nachbau und belegt **am HTTP-Verkehr**, dass ausschließlich `GET` rausgeht.
  Im `seed-restore-test.js` wurden die `do $$`-Prüfblöcke bisher nur **gezählt**, nie ausgeführt —
  sie werden jetzt ausgewertet.

  | Lauf | Ergebnis |
  |---|---|
  | `seed-restore-test.js` (lokal) | **43 PASS, 0 FAIL** |
  | `seed-restore-test.js` (`--depth 1`-Klon wie CI) | **41 PASS, 0 FAIL** |
  | `backup-export-test.js` | **38 PASS, 0 FAIL** |
  | `run-offline-tests.js` | **147/147 grün** |

  Mutationsprobe: Nimmt man die Eingrenzung des Restore-`delete` zurück, fängt Test 16 das
  reproduzierbar als FAIL.
- **Production-Ablauf vorbereitet, nicht ausgeführt.** Offline prüfbar und geprüft: `main`-Stand,
  Seeds unverändert seit #118, Drift-Gate grün, Cron-Fenster, Ablageort und Dateinamen des
  Backups, erwartete Manifest-Werte, Soll-Zahlen vor/nach Seed 1 und Seed 2, Stop-Kriterien,
  Restore-Entscheidungspunkte, Überwachung der 6 Wege. **Nicht** geprüft, weil es Production-Lesezugriff
  erfordert: laufende Locks, Health, offene Vorfälle — die stehen als Runbook-Schritte 2 und 3.
- **Die Production-Secrets sind in dieser Umgebung nicht gesetzt.** Der Export kann hier also
  ohnehin nicht laufen; er gehört auf die Betreibermaschine mit `.env.local`.
- **Merge:** PR #125 als Merge-Commit `0d6d867`. Vorab verifiziert: `mergeable_state: clean`,
  beide Pflichtchecks grün auf `6baaa0b`, keine offenen Reviews, Basis = aktueller `main`.
  Nach dem Merge auf `main` gegengeprüft: CI-Lauf #134 `success`, Vercel-Production-Deployment
  `dpl_4NFEyoJgQnbjTP4G8u1pJrjDrxuB` **READY** mit `githubCommitSha=0d6d867`; die drei
  Kernkorrekturen (Leer-Backup-Plausibilisierung, Vor-Seed-Prüfung, eingegrenzter `delete`)
  liegen auf `main`, das Runbook trägt weiterhin `Status: BLOCKIERT`.
- **Paralleler Arbeitsstand, ungemergt:** Branch `claude/helmut-seed-review-6nocps` enthält eine
  read-only Fachprüfung jeder einzelnen Seed-Änderung gegen Production. Sie **bestätigt die hier
  korrigierten Ist-Zahlen unabhängig** (7 Pakete / 163 Abrufwege / 165 Zuordnungen) und empfiehlt
  zusätzlich, `rp-ausschuss-arbeit-soziales` **nicht** mitzuaktivieren (einziger Google-Weg ohne
  belegten Eigenertrag). **Bewertet und entschieden:** die Empfehlung wurde abgelehnt (zirkuläre
  Begründung, siehe §6d.1 des Runbooks), stattdessen wird **gestaffelt** reaktiviert (§6d).
  Zwei weitere Punkte des Branches sind als offene Fachfragen übernommen (§6d.2), ohne
  `required_classes` zu ändern.
- **Nicht getan (bewusst):** kein Production-Zugriff, weder lesend noch schreibend · kein Backup
  ausgeführt · keine Seeds eingespielt · kein Restore gefahren · keine Secrets gelesen, gesetzt
  oder rotiert · keine Cron-Änderung · keine Quelle aktiviert oder deaktiviert · keine Änderung
  an der Paketfachlogik oder an `required_classes` · kein weiterer PR gemergt.

**Sprint „Merge #123 + Sicherung und Restore für die Seed-Einspielung" — Nachweis**

- **PR #123 gemergt** als Merge-Commit `bed7f53` (Doku-only). Vorher geprüft: `mergeable: clean`,
  CI-Pflichtchecks grün, keine offenen Reviews, kein Code-Pfad berührt. Auf `main` gegengeprüft:
  `betrieb/quellen-seed-einspielung.md` trägt weiterhin `Status: BLOCKIERT`.
- **Backup-Umfang.** `scripts/backup-export.js` bekommt einen `--scope=seed`-Modus: genau die
  **8 Tabellen**, die die beiden Seeds berühren oder per Fremdschlüssel daran hängen
  (`geographies`, `political_entities`, `publishers`, `retrieval_paths`, `source_packages`,
  `package_paths`, `path_expected_levels`, `path_expected_geographies`), in FK-sicherer
  Restore-Reihenfolge. Neu **für beide Modi**: serverseitige Zeilenzahl-Gegenprobe per
  `Prefer: count=exact`, SHA-256 je Tabelle plus Gesamtprüfsumme, der gesicherte `main`-Commit
  im Manifest, und ein `vollstaendig`-Flag mit Exit-Code 1 — ein still gekapptes Teil-Backup
  kann damit nicht mehr wie ein vollständiges aussehen. Das Skript bleibt **ausschließlich
  lesend** (nur `GET`).
- **Restore-Status: gebaut und getestet, nicht ausgeführt.** `scripts/seed-restore-sql.js` ist ein
  reiner **SQL-Generator** — kein DB-Client, kein Netzwerk, kein Schreibpfad. Er erzeugt aus einem
  Pre-Seed-Backup ein zeilenscharfes Rückbau-Skript: eine Transaktion mit Vorprüfung
  (`raise exception` bei Abweichung), gezielten `update`s auf die 6 Abrufwege, `delete … not in`
  plus Wiedereinfügen der gesicherten Paketzuordnungen, bedingtem Entfernen der 2 neuen Pakete
  und einer Nachprüfung. **Kein `drop table … cascade`** — das war der bisherige Rollback und ist
  wegen `ON DELETE CASCADE` auf `retrieval_paths.publisher_id` und beiden `package_paths`-FKs für
  gezielten Rückbau unbrauchbar. Ehrliche Grenze: `updated_at` ist wegen des `set_updated_at`-
  Triggers **nicht** wiederherstellbar.
- **Testergebnisse (echte Zahlen).** `scripts/seed-restore-test.js`: **33 PASS, 0 FAIL** lokal,
  **31 PASS, 0 FAIL** in CI (zwei Herkunftsprüfungen der Fixture brauchen die volle Git-Historie
  und melden im flachen CI-Klon ausdrücklich „nicht prüfbar" statt still durchzulaufen) — 14
  Gruppen, darunter Byte-Gleichheit der zurückgeschriebenen Spalten, Idempotenz des Restores,
  Schutz der Eltern-Zeilen, Abbruch bei verändertem Ausgangszustand und „kein Restdiff nach
  vollständigem Zyklus". Kanonische Offline-Suite: **145/145 Suiten grün**. Der Test
  arbeitet auf **synthetischen Fixtures** aus den committeten Seeds — **keine
  Production-Daten**. Eine formprüfende Mutation im Generator erzeugt reproduzierbar **2 FAIL**
  (Erkennung belegt); zwei formverändernde Mutationen brachten den Mini-Executor stattdessen zum
  Abbruch — als Grenze in `betrieb/quellen-seed-einspielung.md` §5b offen dokumentiert.
- **Die 6 betroffenen Retrieval Paths** (heute `broken`, Seed 1 setzt sie auf `needs_review` und
  macht sie damit **absichtlich wieder ausführbar**):

  | # | Pfad-ID | Betreiber | Abruf | Aktivierung |
  |---|---|---|---|---|
  | 1 | `rp-bundestag` | bundestag.de | Direktfeed (RSS) | `always_on` — **läuft sofort** |
  | 2 | `rp-bundesregierung` | bundesregierung.de | Google News | `always_on` — **läuft sofort** |
  | 3 | `rp-die-linke` | die-linke.de | Google News | `auto` — nur bei aktivem Paket |
  | 4 | `rp-linksfraktion` | dielinkebt.de | Direktfeed (RSS) | `auto` |
  | 5 | `rp-ausschuss-arbeit-soziales` | bundestag.de | Google News | `auto` |
  | 6 | `rp-dgb` | dgb.de | Google News | `auto` |

  Kontrollkarten je Weg (URL, Parser, Item-Deckel, Ausfallmuster, Dedup-Verhalten):
  `betrieb/quellen-seed-einspielung.md` §6b.
- **Entscheidung: weiterhin Option B — Ausführung blockiert.** Werkzeug und Rückweg stehen
  bereit und sind getestet; es fehlen genau zwei Betreiberhandlungen (§4, §11): die Sicherung
  muss **tatsächlich gelaufen** sein (`vollstaendig: true`), und die Reaktivierung der 6
  Bundeswege muss ausdrücklich mitfreigegeben werden.
- **Fehlende Betreiberfreigaben:** (1) Production-Lesezugriff für den Pre-Seed-Export ausführen ·
  (2) Reaktivierung der 6 Bundeswege · (3) Seed-Ausführung selbst · (4) OP-01 (Supabase Pro/PITR)
  als dauerhafte Lösung.
- **Nicht getan (bewusst):** kein Production-Backup ausgeführt, kein Seed eingespielt, kein
  Restore gefahren, kein Production-Schreibzugriff, keine Secrets, keine Cron-Änderung, kein
  Flag, kein weiterer PR gemergt.
**Sprint „Quellenpakete inventarisieren + Paketzuweisung beweisen" — Nachweis**

- **Auftrag:** die beiden nächsten zusammenhängenden Phase-1-Punkte schließen — Punkt 18
  (Production-Inventur aller Quellenpakete) und Punkt 12 (automatische Paketzuweisung
  beweisen).
- **Was erledigt wurde:** vollständige, rein lesende Production-Inventur aller Pakete
  (Wege, Aktivierung, Ertrag, letzte Lieferung, Fehler, Pflichtklassen, zugeordnete
  Profile) in `quellenarchitektur/30-paket-inventur-production.md`; Nachweis der
  automatischen Paketzuweisung für Bundestag/Berlin/Brandenburg **gegen den echten
  Production-Katalog** und zusätzlich als Offline-Suite
  `scripts/paketzuweisung-nachweis-test.js`; neue operative Checkliste
  `docs/roadmap/phase_1_checkliste.md` (11 ✅ / 7 ⏳ / 12 ☐).
- **Ergebnis der Zuweisungsprüfung:** Bund→`bund-basis`, Berlin→`berlin-basis`,
  Brandenburg→`brandenburg-basis`; Fachpakete entstehen aus Profildaten; keine fremden
  Regionalpakete; kein Mandant im Code hartkodiert (Sachzuordnung ist unter beliebiger
  Profil-ID identisch); drei zusätzliche Profile ändern an den Bestandsmandanten nichts
  (145 → 145 aktive Abrufwege); Berlin/Brandenburg bleiben ehrlich `requested_unsupplied`.
- **Modell ↔ Realität abgeglichen:** 145 modell-aktive Wege gegen 145 real gecrawlte
  Quellen vollständig aufgelöst (138 Katalogwege + 7 profilgenerierte Personensuchen;
  6 defekte Wege und DIP laufen bewusst nicht mit); 0 Berlin-/Brandenburg-Wege im Lauf.
- **Gefundene Abweichungen (A-1…A-8):** in der Inventur §7 dokumentiert. Doku-Fehler in
  `quellenarchitektur/07-…` korrigiert (Landespakete sind nicht leer; der Resolver ist
  seit dem Cutover live verdrahtet). **A-1** hat OP-04 in der Restliste verschärft.
  **A-3** (Landes-Basispakete nicht mandantenneutral) und **A-4** (2 von 5
  `always_on`-Kernwegen defekt) sind seit dem Merge von #118 **auf `main` behoben**, in der
  **Production-Datenbank aber weiterhin wirksam** — dafür fehlt das freigabepflichtige
  Einspielen der Seeds (§11).
- **Was bewusst nicht erledigt wurde:** keine Production-Datenänderung, kein Seed-Einspielen,
  keine Migration, keine Aktivierung von Berlin/Brandenburg, kein Deaktivieren bestehender
  Quellen, keine Flag-/Cron-/Secret-Änderung, kein Anlegen echter Profile. Keine Änderung an
  `profile-packages.js` oder `seeds/packages.js` — die Zuweisungslogik war fehlerfrei.
- **Tests:** Offline-Suite **145/145 grün** (`node scripts/run-offline-tests.js`, 38 s); neue
  Suite `paketzuweisung-nachweis-test` **147/147** nach dem Rebase auf `61767a9` (die zwei
  neuen Landes-Parteipakete aus #118 sind mit abgedeckt), dreimal wiederholt byte-identisch.
  Kein Browser-Smoke nötig (keine UI-Änderung).
- **Merge:** PR #124 auf ausdrückliche Betreiberfreigabe gemergt (`118e90c`, 2026-07-25).
  Vorab verifiziert: `mergeable_state: clean`, beide Pflicht-Checks grün (Offline-Suite,
  Chromium-Smoke), Vercel-Preview `Ready`, keine offenen Reviews/Change-Requests, kein
  Rebase nötig (Basis = aktueller `main`-Stand). Nach dem Merge gegengeprüft: CI auf dem
  Merge-Commit grün, Vercel-Production-Deployment `dpl_47sPA8z5T11rWjYT4J6R83XdxPd8`
  `READY` mit `githubCommitSha=118e90c`.
- **Nächster Schritt:** Freigabe für das Einspielen der beiden Seeds — vorbereitet und
  bewertet in [`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md),
  derzeit blockiert durch die fehlende Sicherung (§11).

**Sprint „Merge PR #118 + Seed-Vorbereitung" — Nachweis**

- **PR #118 gemergt** als Merge-Commit `61767a9`. Vorab alle zwölf Bedingungen verifiziert
  (`clean`, CI 5/5, 0 fehlende `main`-Commits, keine Reviews, Trockenlauf konfliktfrei, alle vier
  Korrekturen im Branch, keine festen Personen-IDs). CI auf `main` **grün**, Vercel-Production
  `READY`. Auf `main` gegengeprüft: Aufräum-DELETE vorhanden, Editionspinning gesetzt, 0
  `broken`-Annotationen in `catalog.js`.
- **Der Merge hat die Datenbank nicht verändert** — verifiziert: kein Workflow, kein Cron und kein
  Server-Pfad spielt Seeds ein; die Dateien werden ausschließlich von Test-/Preflight-Skripten
  gelesen.
- **Seed-Sprint vorbereitet, nicht ausgeführt.** Vollständige Vorlage inklusive Soll-Zahlen,
  Reihenfolge, Idempotenznachweis, Rollback-Bewertung, Go-/Stop-Kriterien und Betreiberentscheidung:
  [`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md).
- **Vorschau (lokal simuliert, kein Production-Zugriff):** Seed 1 → +2 Pakete, +1 Paketzuordnung,
  6 Abrufwege aktualisiert; Seed 2 → 4 alte Paketzuordnungen entfernt, 4 neue eingefügt.
  Betroffen: **0** Publisher · **6** Retrieval Paths · **4** Source Packages · **4** entfernte und
  **5** neu eingefügte Paketzuordnungen. Zweiter Lauf beider Seeds: **0 Änderungen** (idempotent).
- **Wichtigster operativer Punkt:** die 6 reparierten Bundeswege stehen in Production auf
  `broken` und laufen deshalb heute **nicht**. Seed 1 setzt sie auf `needs_review` und macht sie
  damit **absichtlich wieder ausführbar** — am Crawl-Plan verifiziert: +2 garantiert und sofort
  (die beiden `always_on`-Wege), bis zu +4 weitere abhängig vom Live-Profilbestand. Das muss
  ausdrücklich mitfreigegeben werden. Keine Amplifikation (Shared-Path-Dedup aus #120), keine
  zusätzlichen KI-Kosten.
- **Berlin/Brandenburg bleiben gesperrt** — verifiziert: alle 18 BE/BB-Wege `landesmodul-gesperrt`,
  0 im aktiven Plan; das Gate greift über Pfad-IDs, nicht über Paketschlüssel.
- **Backup/Rollback:** **kein Backup, kein PITR** (Supabase Free-Plan, Folge von OP-01). Feiner
  Rollback existiert nur für Seed 2; der Bund-Rollback ist ein `drop table … cascade` und für
  gezielten Rückbau unbrauchbar. Ein Rollback stellt die alten Zuordnungen **nicht** wieder her.
- **Entscheidung: Option B — Ausführung blockiert.** Es fehlt genau eine belastbare Sicherung.
  Kleinster Weg ohne Kostenentscheidung: `node scripts/backup-export.js` vor dem Lauf. Dauerhaft:
  OP-01 freigeben. **Die Kostenentscheidung liegt beim Betreiber.**

**Sprint „Merge #122 + Review PR #118" — Nachweis**

- **PR #122 gemergt** (`54fe370`, Merge-Commit). Vorab verifiziert: `clean`, CI 3/3 grün, keine
  neuen `main`-Commits, keine Reviews, Trockenlauf konfliktfrei, Diff = nur die angekündigte
  Doku-Korrektur. Danach auf `main` gegengeprüft: Banner und Tabelle nennen beide `d6d9063`/#113
  als Re-Anker, der Altwert `035898b`/#114 kommt im Dokument nicht mehr vor.
- **PR #118 adversarial reviewt** (5 spezialisierte Prüfer, jeder Befund gegen den echten Code
  verifiziert). **Weiterhin nötig:** P0-1 ist auf `main` nachweislich offen — die committeten
  Seeds reproduzieren dort nicht aus dem Code (empirisch: realer Diff). Nicht überholt.
- **Verifizierte Risiken — entwarnt:**
  - *Kein* BE/BB-Aktivierungsleck: das harte Gate greift über die Pfad-IDs (`rp-be-`/`rp-bb-`),
    nicht über Paketschlüssel. Ausführung von `buildRelationalCrawlPlan` mit einem Berlin-/
    Linke-Landtagsprofil: alle 18 BE/BB-Wege `landesmodul-gesperrt`, `plan.aktiv = []`.
    Zweite Barriere: beide neuen Pakete sind `prepared` → nie `active`.
  - *Keine* neue Crawl-Amplifikation: die 4 neuen Google-News-Wege sind mandantenunabhängig und
    werden von der Shared-Path-Dedup aus PR #120 abgedeckt (Mandant 2+ → `skipped-shared`).
  - *Kein* Konflikt mit #105/#120/#121/#122; Merge konfliktfrei; Provenienz (`site:`-Filter hält
    die Herausgeber-Domain) intakt; keine festen Personen-IDs; Paketzuweisung datengetrieben.
  - `sources.js` ist trotz `SOURCE_MODE=on` produktionswirksam (`toCrawlerSource` gibt das
    Legacy-Objekt zurück). Die 6 reparierten Wege tragen in der DB aber weiterhin `status='broken'`
    und bleiben damit ausgeschlossen — die Reparatur wird erst mit dem **freigabepflichtigen**
    Seed-Einspielen wirksam. Der Merge allein ändert das Crawl-Verhalten nicht.
- **Behobene Defekte (in #118 nachgebessert):** (1) P0-2 war in der **Datenbank** wirkungslos —
  der Seed verschob die Partei-/Personenwege per `insert … on conflict do nothing` ohne Delete,
  die alten Zuordnungen am Pflicht-Basispaket wären geblieben (Seed 20260717 ist laut
  `quellenarchitektur/18-production-freigabeanfrage.md` in Production angewendet); (2) die einzige
  Google-News-URL ohne Editions-/Sprachpinning; (3) zwei Testlücken, beide per Mutationstest
  belegt (Sortierung nach Schwere nirgends mehr abgedeckt; zwei nie fehlschlagende Zusicherungen).
- **Tests:** Offline-Suite **144/144 grün** · source-architecture 97/0 · admin-source-report 56/0 ·
  profile-packages 69/0 · landesmodule-kandidaten 77/0 · quality-watchdog 66/0 ·
  tenant-neutrality 39/0 · seed-drift grün (adversarial: Manipulation auf Code- **und** Seed-Seite
  wird gefangen) · Generatoren byte-identisch · Mutationsproben rot wie erwartet.
- **Offene Entscheidungen (bewusst nicht geändert):** `required_classes` von
  `die-linke-brandenburg` (3 Pflichtklassen, nur `partei_pilot` belegt) ist eine **fachliche**
  Paketfrage; Rollback lässt zwei leere `prepared`-Pakete stehen (kosmetisch); die
  **Google-News-Konzentration** steigt von 134 auf 138 von 143 Wegen — bei offenem Circuit Breaker
  liefern nur noch 5 statt 9 Direktfeeds. Das ist kein Defekt dieses PRs, aber der wichtigste
  verbleibende Architekturpunkt (SPOF, im Audit als eigener P1 geführt).
- **Merge-Empfehlung:** **ja** (Option B abgeschlossen). Merge und Deployment bleiben beim Betreiber.

**Sprint „Recovery-Pfad: Review, Stilllegung, Merge" — Nachweis**

- **Was versucht wurde:** prüfen, ob der Understanding-Recovery-Pfad auf `main`
  tatsächlich noch scharf ist, das Production-Risiko bewerten, PR #105 vollständig
  gegen `main` reviewen und ihn mergefähig machen.
- **Was erledigt wurde:** Der Verdacht wurde **bestätigt** (F-3). Die Stilllegung in
  PR #105 wurde gegen den Code geprüft und ist **technisch wirksam**, nicht nur
  dokumentarisch — belegt durch einen Subprozess-Aufruf mit Flag *und* korrektem
  Token, der `{executed:false, stillgelegt:true}` liefert. Ein verifizierter Defekt
  wurde behoben: die Regression prüfte nur **einen festen Dateinamen** und hätte eine
  umbenannte Action nicht gefangen — ersetzt durch einen namensunabhängigen Riegel
  über alle Workflows (Negativkontrolle: eine umbenannt wiederhergestellte Kopie
  lässt den Test korrekt fehlschlagen). Die frühere PR-Empfehlung, beim späteren
  `impl-2`-Merge dessen Fassung zu übernehmen, war gefährlich und wurde
  zurückgezogen. PR #105 wurde auf `main` `c6a3d40` gezogen; seine eigene, vor #119
  angelegte `CURRENT_STATE.md` ist in **diese** kanonische Datei überführt. Danach
  gemergt (siehe unten).
- **Merge:** PR #105 auf ausdrückliche Betreiberfreigabe als Merge-Commit gemergt
  (`43e9e35`, 2026-07-25). Vorab verifiziert: `mergeable_state: clean`, CI 3/3 grün,
  keine neuen `main`-Commits, keine Reviews/Change-Requests, Trockenlauf konfliktfrei.
  Nach dem Merge auf `main` gegengeprüft: Workflow entfernt, `RECOVERY_ALLOWLIST` `[]`,
  0 `require` im Execute-Skript.
- **Was nicht erledigt wurde:** keine Ausführung von OP-06 und keine Recovery — beides
  freigabepflichtig. Die mandatsrelative OP-06-Allowlist wurde bewusst **nicht**
  fachlich neu bewertet (§3). Keine Migration, keine Flag-Aktivierung, keine
  Production-Datenänderung.
- **Tests:** Offline-Suite **141/141 grün** · `understanding-recovery` 57/57 (davon 2
  neu) · `pending-terminal` 63/63 · `tenant-neutrality` 39/39 · `tenant-guard` 37/37 ·
  `ko-recovery` 12/12 · YAML-Validierung aller Workflows · 55 Doku-Verweise (0 tot) ·
  Negativkontrolle umbenannter Workflow.
- **Offener Folgepunkt:** die OP-06-Fachfrage (§3) — nicht blockierend, da OP-06
  Default AUS ist und ein eigenes Token braucht.
