# CURRENT STATE — Helmut

**Letzte Aktualisierung:** 2026-07-25 · **`main`-HEAD:** `035898b` (Merge #114)

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

## 3 · Teilweise abgeschlossen (Code da, Abnahme fehlt)

| Punkt | Was fehlt | → OP |
|---|---|---|
| Google-News-Härtung (Gate/Retry/Breaker/Cooldown, Default AN) | Production-Beweislauf unter echter Drosselung | OP-15 |
| Monitoring-Zweitkanal + Meta-Heartbeat (Sender gehärtet) | `HELMUT_MONITORING_WEBHOOK_URL` unset → No-Op, kein `webhook.sent`-Beleg | OP-07 |
| `source_id`-Dubletten-Fix | Live-Nachweis „Telemetriezeilen = distinct `source_id`" | OP-19 |
| Zweitmandanten-Provisionierung + Per-Mandant-Kostendeckel | Migration `20260721` nicht angewandt, `HELMUT_TENANT_LLM_CAP` AUS, DB-seitige Durchsetzung unentschieden | OP-03 |
| Retention/Löschung | nur Trockenlauf; braucht verbindliche Fristen aus OP-02 | OP-12 |
| Understanding-Gate, Cheap-Triage, Scoring, Berlin/Brandenburg | in `shadow`/`off`, Scharfschaltung ist Freigabe | OP-18, OP-21, OP-22 |

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
- **Stand auf `main` (wichtig):** Der Pfad ist auf `main` **noch vorhanden** —
  `.github/workflows/understanding-recovery.yml` existiert, `RECOVERY_ALLOWLIST` in
  `lib/helmut/understanding-recovery.js` ist gefüllt. Die harte Stilllegung liegt
  **ausschließlich im ungemergten PR #105**.
- **Konsequenz:** Diesen Workflow **nicht** ausführen. Der tragfähige Ersatzweg ist
  die **Einzeldokument-Recovery** (1 von 6 Fällen so bereits erfolgreich recovert,
  `singledoc-29583280106`); 1 Fall ist live als Duplikat verifiziert (→ OP-06).

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
| **#119** | Kontext-Einstiegsschicht für Claude Code (`CLAUDE.md`, `START_HERE`, `CURRENT_STATE`, `ARCHITECTURE`) | Doku-only, 140/140 grün, mergefähig |
| **#118** | Quellenarchitektur-Gesamtaudit + Remediation (Seed-Reproduzierbarkeit, Neutralisierung der Landes-Basispakete, 6 verifizierte Bundesweg-Reparaturen), 141/141 grün | **jüngster, review-fähiger PR** — Review empfohlen |
| #117 | WBSB-Pilotpaket + Workflow-Härtung vereinigt | **Draft, ausdrücklich nicht mergen** (öffnet nur die CI-Prüfung) |
| #115 | Bestandsabgleich `bund-basis` + Pflichtquellen-Verifikationstest | **Draft, ausdrücklich nicht mergen** (nur um den Workflow auf einem Runner mit Egress laufen zu lassen) |
| #112 | Geführter Erstlogin-/Onboarding-Flow (14 Screens) | manuelle Abnahme im Preview ausstehend |
| #111 | Sichtbarkeits-Toggle auf `/passwort-setzen` | technisch mergefähig, wartet auf Freigabe |
| #105 | Datenmotor-Sprint Pending/Understanding/KO; enthält die **harte Stilllegung** des gescheiterten Recovery-Pfads (F-3) | rebased, Tests grün; **inhaltlich wichtig** — solange ungemergt bleibt der gescheiterte Pfad auf `main` scharf |
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
1. **Review und Merge-Entscheidung zu PR #118** (Quellenarchitektur-Remediation).
2. **Merge-Entscheidung zu PR #105** — solange dieser PR offen ist, liegt der in
   Production gescheiterte Recovery-Pfad (F-3) unverändert scharf auf `main`.
3. **OP-11 Branch Protection** verifizieren (2 Minuten, reversibel,
   `betrieb/branch-protection.md`).

## 12 · Letzter Sprintausgang

| Sprint | Datum | Zustand |
|---|---|---|
| Kontextstruktur für Claude Code (`CLAUDE.md` + Einstiegsschicht) | 2026-07-25 | **Erfolgreich abgeschlossen** — reine Dokumentation, kein Runtime-, Migrations- oder Production-Eingriff. Abnahme: Einstiegsdateien existieren, alle Verweise aufgelöst, Offline-Suite unverändert grün. Details unten. |

**Sprint „Kontextstruktur" — Nachweis**

- **Was versucht wurde:** eine schlanke, dauerhaft wartbare Einstiegsschicht anlegen,
  damit neue Threads nicht das gesamte Repository scannen.
- **Was erledigt wurde:** `CLAUDE.md`, `docs/START_HERE.md`, `docs/CURRENT_STATE.md`,
  `docs/ARCHITECTURE.md` erstellt; Lesereihenfolge, Token-Regeln, Sprintzustände und
  Definition of Done verankert.
- **Was nicht erledigt wurde:** keine Bereinigung oder Löschung von Altdokumenten —
  bewusst, da die Historisch-Banner aus Recovery Sprint R2 diese Aufgabe bereits
  erfüllen und Löschungen freigabepflichtig sind.
- **Tests:** `node scripts/run-offline-tests.js` → **140/140 Suiten grün** (35 s,
  unverändert gegenüber `main` — reine Doku-Änderung); Link- und Existenzprüfung
  aller in den vier Einstiegsdateien referenzierten Pfade → 0 tote Verweise;
  Kernaussagen zu Architektur, Auth, Cache-Schlüsseln und Cron-Zahl gegen den Code
  gegengeprüft.
- **Branch:** `claude/helmut-claude-context-setup-2em4mt` · **PR:** #119 (offen, nicht gemergt).
- **Weiterverwendbar:** ja, reine Dokumentation, jederzeit revertierbar.
