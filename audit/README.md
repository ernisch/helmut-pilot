# Helmut — SaaS-Readiness-Audit · Abschlussbericht

**Datum:** 2026-07-12 · **Branch:** `claude/helmut-saas-readiness-audit-5btd4a` · **Basis-Commit (main):** `edcebaed864beebc6c7ee74d4025cab82b40d585`
**Production:** https://helmut-pilot.vercel.app · **Modus:** Reine Analyse. Kein Fix, keine Migration, kein Merge, kein Deploy, keine Production-Schreibzugriffe.

Dieser Bericht ist bewusst auch für Nicht-Entwickler verständlich. Die technischen Belege stehen in den Einzeldokumenten (Links unten).

---

## 1. Was wurde geprüft?

Der komplette „Datenmotor" von Helmut — von den Nachrichtenquellen über das KI-Verständnis bis zu dem, was der Abgeordnete am Ende in **Lage, Radar, Helmut und Büro** sieht. Konkret: Quellen & Crawl, Verständnis (Knowledge Objects), Matching, Entscheidungen, Lage- und Radar-Aufbereitung, der Watchdog, der App-Start, sowie die SaaS-/Sicherheits-/Mandantentrennung. Grundlage: vollständige Code-Lektüre der Kernmodule, **nicht-destruktive Datenbankabfragen gegen die Produktions-Supabase**, und die vorhandene Test-Suite. Neun Teilbereiche wurden parallel untersucht und anschließend zentral geprüft und zusammengeführt.

## 2. Was funktioniert bereits gut?

- **Der V3-Datenmotor läuft produktiv und ist tagesfrisch.** Der Crawl sammelt aktuell (jüngstes Dokument von heute 10:01 Uhr), das KI-Verständnis erzeugt echte Vorgänge (217 Knowledge Objects, 162 verstanden). Keine Fake-Inhalte im Read-Pfad.
- **Die Quellen sind technisch sauber:** 98,6 % direkte Links, keine exakten Dubletten, TLS-Prüfung aktiv.
- **Die Zugangssicherung ist solide:** Ein Abgeordneter ist hart an sein eigenes Mandat gebunden — über die Web-Adresse lassen sich **keine** Fremddaten öffnen. Die Cron-Jobs sind gegen fremde Auslösung geschützt (fail-closed). Kein Datenbank-Schlüssel im Browser-Code.
- **Mehrere alte Risiken sind bereits behoben** (TLS, offene Cron-Auth, Modellname-Leak).
- **Der Rechenkern für Matching/Ranking ist fair** — keine hartkodierten Pilot-Sonderregeln mehr.
- **Robuste Fail-safe-Logik:** Jeder Cron antwortet immer (Timeouts), bei Ausfall Leerzustand statt Fake.

## 3. Was sind die wichtigsten echten Probleme?

1. **Profile bekommen kaum Priorisierung.** Kein einziger Vorgang erreicht „Sofort handeln" (max. Bewertung 47 von 100; 51 von 52 Entscheidungen sind „Ignorieren"). **Ursache:** den verstandenen Vorgängen fehlen die Themen-Merkmale (`tags`/`policy_field` sind bei allen 217 leer), und Ausschuss-/Partei-Bezeichnungen werden nicht normalisiert. → *Die Information ist da, aber das Matching findet sie nicht.* (Belegt.)
2. **Der Radar verliert belegte Erwähnungen.** Das im App sichtbare Radar durchsucht nur die 200 zuletzt verarbeiteten Vorgänge; 6 personenbezogene Vorgänge (2 mit Beleg-Link) fallen heraus — und das größere „Archiv" wird vom Browser gar nicht abgerufen. → *Der Abgeordnete sieht eine echte Erwähnung nicht.*
3. **Der Watchdog schlägt Fehlalarm.** Er meldet „Pipeline seit 139 Stunden aus", obwohl der Crawl nachweislich läuft — weil er einen Zeitstempel liest, den niemand mehr aktualisiert. Zugleich gilt das Briefing **immer** als „frisch" (ein echter Stillstand bliebe unentdeckt).
4. **Der App-Start blockiert.** Der Ladebildschirm bleibt, bis **alle** Daten geladen sind; ein 12-Sekunden-Zeitlimit kann die komplette Lage-Ansicht leeren. Es gibt kein schrittweises Laden.
5. **Für echten SaaS-Vertrieb fehlt das Sicherheitsnetz auf Datenbankebene.** Die Mandantentrennung funktioniert heute nur durch sorgfältigen App-Code — die Datenbank selbst hat keine Schutzregeln (RLS aktiviert, aber ohne Policies; Zugriff über den alles umgehenden Service-Schlüssel).

## 4. Welche Vermutungen haben sich NICHT bestätigt?

- **„KI-Kosten komplett unüberwacht"** (Altaudit): teilweise widerlegt — ein Nutzungs-Log existiert, nur in der falschen Ebene (Blob statt Tabelle), ohne Aggregat/Alarm.
- **„TLS-Verifikation aus" / „Cron weltweit auslösbar" / „Modellname-Leak"** (Altaudit-P1): alle **behoben**, nicht mehr aktuell.
- **„Max. Score strukturell bei 47 gedeckelt"** (Agent-Erstbefund): korrigiert — der Deckel ist **empirisch** (dünner Korpus), nicht durch die Formel bedingt.
- **„Fake-Termine/-Statements im Produktivbild"** (Altaudit): im V3-Read-Pfad laut Plan bereits zurückgebaut — vor Umsetzung nur zu verifizieren.
- **Aktiver Cross-Tenant-Exploit:** **nicht** bestätigt — das IDOR ist *latent* (Code-Default), über HTTP heute nicht ausnutzbar (Auth bindet das Mandat).

## 5. Kann Helmut heute einen Einzelpiloten sicher versorgen?

**JA — sicher betreibbar.** Bei einem Mandanten ist das fehlende DB-Sicherheitsnetz praktisch irrelevant; die Zugangssicherung greift. Einschränkung: Der Pilot wird **inhaltlich dünn** versorgt (kaum Priorisierung, siehe Problem 1) und einzelne Ansichten können durch Timeout/Fenstergrenzen leer wirken. Empfohlene Vorab-Hygiene: Demo-Profile entfernen, ein KI-Tageslimit setzen.

## 6. Kann Helmut heute mehrere Mandanten sicher versorgen?

**Bedingt / riskant.** Die Trennung funktioniert im Normalbetrieb, ruht aber **allein auf App-Code-Disziplin**: Der Service-Schlüssel umgeht die Datenbank-Schutzregeln, es gibt keinen zentralen Mandantenfilter, und einzelne Abfragen liefern bei einem vergessenen Parameter **alle** Mandanten. Ein einziger Filter-Fehler = Datenleck zwischen Abgeordneten. **Nicht empfehlenswert für mehrere zahlende Mandate ohne die P0-Fixes.**

## 7. Was blockiert einen vollständigen SaaS-Vertrieb?

- **P0:** Fehlendes Datenbank-Sicherheitsnetz (RLS-Policies) + latentes Mandanten-Leck (optionale Filter).
- **P1:** Racige Sperren (Doppelläufe/Datenverlust bei Last), keine erzwungene KI-Kostengrenze, Profil-Unterversorgung, Watchdog-Fehlmeldungen, blockierender App-Start.
- **Produktlücken:** kein Self-Service-Onboarding; Quellen-Tiefe nur für Arbeit & Soziales (Landtage/Landesebene fehlen ganz).

## 8. Welcher Umsetzungssprint muss als Nächstes folgen?

**Sprint 1 — Sicherheit & Mandantentrennung** (laut Master-Plan mit Vorrang): (1) `userId` verpflichtend + zentraler Mandantenfilter (reine App-Änderung, sofort), (2) RLS-Policies als zweite Verteidigungslinie (**DB-Migration → nur mit Betreiber-Freigabe**), (3) KI-Budget fail-closed.
Danach: **Sprint 2 Watchdog-Zustandsmodell** (reine App-Logik, stellt Betreiber-Vertrauen sofort her), **Sprint 3 App-Start**, **Sprint 4 Profilversorgung + gezielte Quellenpakete**. Details in [`fix-plan.md`](./fix-plan.md).

---

## Pflichtangaben

| Angabe | Wert |
|---|---|
| **Branch** | `claude/helmut-saas-readiness-audit-5btd4a` |
| **Basis-Commit (main)** | `edcebaed864beebc6c7ee74d4025cab82b40d585` |
| **Audit-Commits** | `6de6e0f`, `bf474ad`, `3fcfb9d`, `f672767` (+ Block-5-Commit dieses Berichts) |
| **PR-Link** | **kein PR erstellt** (nicht beauftragt — Merge/PR nur auf ausdrücklichen Wunsch) |
| **Preview-Link** | **keine Preview erstellt** (keine sichtbaren App-Änderungen) |
| **Deployment-Link** | **kein Deployment** (kein Production-Release) |
| **Production-Link** | https://helmut-pilot.vercel.app |
| **Geänderte Code-Dateien** | **keine** (rein additive Audit-Dokumente unter `audit/`) |
| **Erstellte Audit-Dateien** | `data-engine-map.md`, `source-coverage.md`, `profile-coverage.md`, `radar.md`, `lage.md`, `watchdog.md`, `app-start-performance.md`, `saas-readiness.md`, `saas-risk-matrix.md`, `qa-strategy.md`, `fix-plan.md`, `README.md` (dieser Bericht) |
| **Tests** | 22 Offline-Suites, ~1382 Assertions, **alle grün** (p1 322, lage 138, radar-state 102, admin 104, staff-backfill 92, helmut-state 79, pwa 70, saas 70, helmut-fields 65, helmut-ui 50, slot-aware 49, decisions 38, radar 38, contract-adapter 31, splash 29, briefing-language 28, radar-ui 18, contract-snapshot 17, qa-stab 15, watchdog-eval 14, goldset 7, presale 6). Live-Tests (`smoke`/`understanding-*`) nicht ausführbar (kein Deployment/KI-Key). |
| **Build-Ergebnis** | Kein Build-Step (dependency-freies Vanilla-Node). `node --check` **62/62 grün**. |
| **Lint-Ergebnis** | Kein Lint-/TS-Setup vorhanden. Äquivalent: `node --check` 62/62. |
| **Performance-Messwerte** | Asset-Größen lokal gemessen: client.js 534 KB (141 KB gz), styles.css 308 KB (59 KB gz), sw.js 7,6 KB, index.html 6 KB. Live-Timing **egress-blockiert** (403) → Betreiber-Kommandos in `app-start-performance.md` §6. |
| **Datenbankabfragen** | Ausschließlich **SELECT** gegen `ddckuvvpcytqbyfmbvie` (Zählungen, Frische, Verteilungen, matched_features, Radar-Fenster, Watchdog-Marker, RLS/pg_policies). Keine Writes. |
| **Sicherheitsrisiken** | P0: RLS ohne Policies + Service-Role-Bypass; latentes IDOR (optionale `userId`-Filter). P1: racige Blob-Locks; keine erzwungene KI-Kostengrenze. P2/P3: SECURITY-DEFINER-RPC, search_path, vector-Extension, Demo-Daten in Prod. Details: `saas-risk-matrix.md`. |
| **Rollback** | Alle Änderungen sind **rein additive Markdown-Dateien** unter `audit/`. Rollback = Löschen des `audit/`-Ordners bzw. `git revert` der Audit-Commits. Kein Code, keine DB berührt. |
| **Merge-Bestätigung** | **Nichts wurde gemergt.** Alle Commits liegen ausschließlich auf `claude/helmut-saas-readiness-audit-5btd4a`. |
| **Production-Bestätigung** | **Production wurde nicht verändert.** Keine Writes, keine Migration, keine Secret-/Cron-/Policy-Änderung, kein Deploy. Nur lesende DB-Abfragen. |

*Keine sichtbaren App-Änderungen und keine diagnostische Preview → Screenshots laut Auftrag nicht erforderlich.*

---

## Dokumentindex

| Phase | Dokument | Inhalt |
|---|---|---|
| 1 | [`data-engine-map.md`](./data-engine-map.md) | Datenmotor-Karte, Cron-Fahrplan, Locks, Zeitstempel |
| 2 | [`source-coverage.md`](./source-coverage.md) | Quelleninventar, Health, Abdeckungsmatrix, Empfehlung B |
| 3 | [`profile-coverage.md`](./profile-coverage.md) | Profilversorgungsmatrix, Testprofile, Matching-Trichter |
| 4 | [`radar.md`](./radar.md) | Radar-Kette, 200-Fenster, Evidenz, Sichtbarkeitsregeln |
| 5 | [`lage.md`](./lage.md) | Lage-Trichter, 12s-Timeout, Legacy/Modern, Presentation |
| 6 | [`watchdog.md`](./watchdog.md) | Watchdog-Inventar, Fehlalarm-Beleg, Zustandslogik |
| 7 | [`app-start-performance.md`](./app-start-performance.md) | App-Start-Pfad, Request-Timeline, Progressive-Rendering |
| 8 | [`saas-readiness.md`](./saas-readiness.md) · [`saas-risk-matrix.md`](./saas-risk-matrix.md) | Mandantentrennung, RLS, Kosten, Risikomatrix |
| 9 | [`qa-strategy.md`](./qa-strategy.md) | Test-Inventar, Abdeckungslücken, Teststrategie |
| — | [`fix-plan.md`](./fix-plan.md) | Priorisierter Fix-Plan (P0-P3) + erster Sprint |
