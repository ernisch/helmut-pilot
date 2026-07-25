# CURRENT STATE — Helmut

**Letzte Aktualisierung:** 2026-07-25 · **`main`-HEAD:** `61767a9` (Merge #118)

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

## 3 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt | → OP |
|---|---|---|
| Google-News-Härtung (Gate/Retry/Breaker/Cooldown, Default AN) | Production-Beweislauf unter echter Drosselung | OP-15 |
| Monitoring-Zweitkanal + Meta-Heartbeat (Sender gehärtet) | `HELMUT_MONITORING_WEBHOOK_URL` unset → No-Op, kein `webhook.sent`-Beleg | OP-07 |
| `source_id`-Dubletten-Fix | Live-Nachweis „Telemetriezeilen = distinct `source_id`" | OP-19 |
| Zweitmandanten-Provisionierung + Per-Mandant-Kostendeckel | Migration `20260721` nicht angewandt, `HELMUT_TENANT_LLM_CAP` AUS, DB-seitige Durchsetzung unentschieden | OP-03 |
| Retention/Löschung | nur Trockenlauf; braucht verbindliche Fristen aus OP-02 | OP-12 |
| Understanding-Gate, Cheap-Triage, Scoring, Berlin/Brandenburg | in `shadow`/`off`, Scharfschaltung ist Freigabe | OP-18, OP-21, OP-22 |
| OP-06 Terminales Aussortieren des Alt-Rückstands (34 Fälle, Default AUS) | Ausführung ist freigabepflichtig — **und** eine offene Fachfrage: 16 der 34 Allowlist-Einträge sind mit „außerhalb Mandat" begründet, also relativ zum Pilotmandat, geschrieben wird aber in das mandantenneutrale `knowledge_objects` (kein `tenant_id`). Ein künftiger Zweitmandant mit regionalem/EU-Schwerpunkt bekäme diese Vorgänge dauerhaft nie verstanden | OP-06 |

## 4 · Blockiert

| Punkt | Ursache | Nächster Schritt |
|---|---|---|
| **OP-01** Supabase Pro + PITR | Kostenentscheidung des Betreibers (~25 $/Monat); Free-Plan = **keine Backups** | Betreiber schaltet Pro + PITR frei, dann Restore-Übung nach `betrieb/backup-restore-runbook.md` |
| **Quellen-Seed-Einspielung** (macht P0-2 und die 6 Bundesweg-Reparaturen in der DB wirksam) | **fehlende Sicherung** — kein Backup, kein PITR (Folge von OP-01). Code ist fertig und deployt, die Vorschau steht | Vorlage `betrieb/quellen-seed-einspielung.md` §7 — entweder manuelles Backup vor dem Lauf oder OP-01 freigeben |
| **OP-02** Recht (Pilotvertrag, AVV, DSFA, Art.-9-Grundlage, Fristen) | externe Prüfung durch Anwalt/DSB steht aus | Entwürfe aus `recht/` prüfen lassen und zeichnen; blockiert OP-12 |
| **OP-03** Zweitmandanten-Freigabepaket | Grundsatzentscheidung „DB-seitige Durchsetzung vs. dokumentierte App-Guard-Akzeptanz" fehlt (`mandantentrennung-architektur.md` bewertet die Wege) | Betreiber entscheidet einen Weg; danach Migration + Env + Probelauf |
| **OP-04** Demo-Mandate entfernen | Production-Datenänderung, freigabepflichtig | Freigabe einholen, dann über Provisionierungswerkzeug deaktivieren |
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
   zerstören. Höchstes Einzelrisiko (OP-01).
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
| **#123** | Freigabevorlage Quellen-Seed-Einspielung + Statusnachzug | Doku-only; die Vorlage klassifiziert die Seed-Ausführung als **blockiert** (siehe §4) |
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
- **Zustand:** 0 neue `systemErrors` im dokumentierten Beweiszeitraum; Betriebsbefunde
  B1 (Google-News-Klumpenrisiko, 146 von 163 Wegen über Google) und B2
  (Understanding-Rückstand) bleiben offen.
- **Nicht angewandte Migration:** `20260721` (DB-Härtung) — gehört zu OP-03.

## 10 · Letzte wichtige Entscheidungen

| Datum | Entscheidung |
|---|---|
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

OP-01 ist zugleich der Blocker für den nächsten konkret vorbereiteten Schritt: die
**Quellen-Seed-Einspielung** (Seeds `20260713` + `20260717`) macht die P0-2-Neutralisierung und die
6 Bundesweg-Reparaturen in der Datenbank wirksam. Sie ist vollständig entscheidungsreif vorbereitet
— Soll-Zahlen, Idempotenznachweis, Rollback-Bewertung und Go-/Stop-Kriterien stehen in
[`betrieb/quellen-seed-einspielung.md`](betrieb/quellen-seed-einspielung.md) — aber **blockiert**,
weil kein Backup und kein PITR existieren. Kleinster Weg ohne Kostenentscheidung: vor dem Lauf
`node scripts/backup-export.js` (read-only) sichern.

Parallel möglich, ohne Freigabe:
1. **OP-11 Branch Protection** verifizieren (2 Minuten, reversibel,
   `betrieb/branch-protection.md`).
2. **Review offener PRs** (#112, #111).

**Vor einer OP-06-Ausführung ist eine Fachentscheidung nötig:** die mandatsrelative
Begründung von 16 der 34 Allowlist-Einträge (§3) muss bewertet werden — terminale
Markierung in einer mandantenneutralen Tabelle wirkt für alle künftigen Mandanten.

## 12 · Letzter Sprintausgang

| Sprint | Datum | Zustand |
|---|---|---|
| Merge PR #118 + Vorbereitung des Quellen-Seed-Sprints | 2026-07-25 | **Teilweise abgeschlossen** — #118 gemergt (`61767a9`), CI grün, Deployment `READY`. Die Seed-Einspielung ist vollständig entscheidungsreif vorbereitet, aber **blockiert** (fehlende Sicherung). Details unten. |
| Merge #122 + adversarialer Review von PR #118 (Quellenarchitektur-Remediation) | 2026-07-25 | **Erfolgreich abgeschlossen** — #122 gemergt (`54fe370`); #118 reviewt, 3 belegte Defekte behoben. |
| Merge von PR #105 — Anker-Recovery-Pfad in Production stillgelegt | 2026-07-25 | **Erfolgreich abgeschlossen** — gemergt als `43e9e35`; Stilllegung auf `main` verifiziert. |
| Recovery-Pfad-Review + Zusammenführung von PR #105 auf die kanonische Kontextstruktur | 2026-07-25 | **Erfolgreich abgeschlossen** |
| Kontextstruktur für Claude Code (`CLAUDE.md` + Einstiegsschicht) | 2026-07-25 | **Erfolgreich abgeschlossen** — reine Dokumentation, gemergt als PR #119 (`c6a3d40`). |

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
