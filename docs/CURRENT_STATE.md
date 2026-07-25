# CURRENT STATE — Helmut

**Letzte Aktualisierung:** 2026-07-25 · **`main`-HEAD:** `c6a3d40` (Merge #119)

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
| Kontext-Einstiegsschicht (`CLAUDE.md`, `START_HERE`, `CURRENT_STATE`, `ARCHITECTURE`) | PR #119, gemergt 2026-07-25 |

## 3 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt | → OP |
|---|---|---|
| Google-News-Härtung (Gate/Retry/Breaker/Cooldown, Default AN) | Production-Beweislauf unter echter Drosselung | OP-15 |
| Monitoring-Zweitkanal + Meta-Heartbeat (Sender gehärtet) | `HELMUT_MONITORING_WEBHOOK_URL` unset → No-Op, kein `webhook.sent`-Beleg | OP-07 |
| `source_id`-Dubletten-Fix | Live-Nachweis „Telemetriezeilen = distinct `source_id`" | OP-19 |
| Zweitmandanten-Provisionierung + Per-Mandant-Kostendeckel | Migration `20260721` nicht angewandt, `HELMUT_TENANT_LLM_CAP` AUS, DB-seitige Durchsetzung unentschieden | OP-03 |
| Retention/Löschung | nur Trockenlauf; braucht verbindliche Fristen aus OP-02 | OP-12 |
| Understanding-Gate, Cheap-Triage, Scoring, Berlin/Brandenburg | in `shadow`/`off`, Scharfschaltung ist Freigabe | OP-18, OP-21, OP-22 |
| **Stilllegung des gescheiterten Recovery-Pfads (F-3)** — Code fertig, Review abgeschlossen, Tests grün, PR mergefähig | **Merge + Deployment.** Bis dahin ist die Stilllegung in Production **nicht aktiv**: `understanding-recovery.yml` und die gefüllte `RECOVERY_ALLOWLIST` liegen unverändert auf `main` | OP-05, PR #105 |
| OP-06 Terminales Aussortieren des Alt-Rückstands (34 Fälle, Default AUS) | Ausführung ist freigabepflichtig — **und** eine offene Fachfrage: 16 der 34 Allowlist-Einträge sind mit „außerhalb Mandat" begründet, also relativ zum Pilotmandat, geschrieben wird aber in das mandantenneutrale `knowledge_objects` (kein `tenant_id`). Ein künftiger Zweitmandant mit regionalem/EU-Schwerpunkt bekäme diese Vorgänge dauerhaft nie verstanden | OP-06 |

## 4 · Blockiert

| Punkt | Ursache | Nächster Schritt |
|---|---|---|
| **OP-01** Supabase Pro + PITR | Kostenentscheidung des Betreibers (~25 $/Monat); Free-Plan = **keine Backups** | Betreiber schaltet Pro + PITR frei, dann Restore-Übung nach `betrieb/backup-restore-runbook.md` |
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
- **Stand auf `main`:** Der Pfad ist auf `main` **weiterhin scharf** —
  `.github/workflows/understanding-recovery.yml` existiert, `RECOVERY_ALLOWLIST` ist
  gefüllt. Die technische Stilllegung liegt in **PR #105** und wird erst **mit dessen
  Merge und Deployment** in Production wirksam.
- **Wie PR #105 stilllegt (drei unabhängig wirksame Sperren):** Workflow-Datei
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
| **#105** | Datenmotor-Sprint Pending/Understanding/KO; enthält die **technische Stilllegung** des gescheiterten Recovery-Pfads (F-3), die `failed-final`-Korrektur und den namensunabhängigen Regressionsriegel | **offen.** Basiert auf `main` `c6a3d40`, Offline-Suite grün, CI grün, `mergeable_state: clean` — **Merge empfohlen**; bis zum Merge bleibt F-3 auf `main` scharf |
| **#118** | Quellenarchitektur-Gesamtaudit + Remediation (Seed-Reproduzierbarkeit, Neutralisierung der Landes-Basispakete, 6 verifizierte Bundesweg-Reparaturen), 141/141 grün | review-fähig — Review empfohlen |
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

Parallel möglich, ohne Freigabe:
1. **PR #105 mergen** — er ist auf aktuellem `main` (`c6a3d40`), Tests und CI grün.
   Solange er offen ist, liegt der in Production gescheiterte Recovery-Pfad (F-3)
   unverändert scharf auf `main`. Das ist der Schritt mit dem größten
   Sicherheitsgewinn pro Aufwand.
2. **Review und Merge-Entscheidung zu PR #118** (Quellenarchitektur-Remediation).
3. **OP-11 Branch Protection** verifizieren (2 Minuten, reversibel,
   `betrieb/branch-protection.md`).

**Erst nach dem Merge von #105 und einer Fachentscheidung:** OP-06-Ausführung — die
mandatsrelative Begründung von 16 der 34 Allowlist-Einträge (§3) muss vorher bewertet
werden.

## 12 · Letzter Sprintausgang

| Sprint | Datum | Zustand |
|---|---|---|
| Recovery-Pfad-Review + Zusammenführung PR #105 auf die kanonische Kontextstruktur | 2026-07-25 | **Erfolgreich abgeschlossen** — Review, Fix und Integration fertig; Merge und Deployment stehen aus (Betreiberentscheidung). Details unten. |
| Kontextstruktur für Claude Code (`CLAUDE.md` + Einstiegsschicht) | 2026-07-25 | **Erfolgreich abgeschlossen** — reine Dokumentation, gemergt als PR #119 (`c6a3d40`). |

**Sprint „Recovery-Pfad-Review + PR #105" — Nachweis**

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
  angelegte `CURRENT_STATE.md` ist in **diese** kanonische Datei überführt.
- **Was nicht erledigt wurde:** kein Merge, kein Deployment, keine Ausführung von
  OP-06 — alles freigabepflichtig. Die mandatsrelative OP-06-Allowlist wurde bewusst
  **nicht** fachlich neu bewertet (§3).
- **Tests:** Offline-Suite **141/141 grün** · `understanding-recovery` 57/57 (davon 2
  neu) · `pending-terminal` 63/63 · `tenant-neutrality` 39/39 · `ko-recovery` 12/12 ·
  YAML-Validierung aller Workflows · Negativkontrolle umbenannter Workflow.
- **Branch:** `claude/datenmotor-pending-understanding-ko-77bog4` · **PR:** #105
  (offen, mergefähig, CI grün).
- **Weiterverwendbar:** ja — der PR ist der einzige Ort, an dem die Stilllegung
  existiert.
