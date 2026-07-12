# Einheitliches Profilmodell — Helmut Mehrmandantenfähigkeit (Phase 2)

**Stand:** 2026-07-12 · **Branch:** `claude/helmut-multi-tenant-is7j32`
**Grundlage:** `docs/multitenancy-profildatenkarte.md` (Phase 1).
**Getestet:** Migration lokal in isolierter Postgres-16-Testdatenbank (kein Supabase-Branching
verfügbar — Projekt läuft auf Free/NANO-Plan, `create_branch` lehnt mit „Pro plan or above" ab).
Getestet: sauberer Forward-Run, Idempotenz (zweiter Lauf = No-op), alle 5 CHECK-Constraints
korrekt ablehnend, Rollback entfernt exakt die neuen Spalten ohne Datenverlust auf den
bestehenden, Re-Apply nach Rollback sauber. **Noch NICHT auf Production angewendet.**

---

## 1. Grundentscheidung: bestehende `mandate_profiles`-Tabelle erweitern, keine neue Tabelle

Die SQL-Tabelle `public.mandate_profiles` existiert bereits seit einem früheren Sprint
(`supabase/schema.sql:57`) mit fast allen inhaltlichen Feldern aus dem Pflichtenheft — sie hat
nur 0 Zeilen, weil `storage.js` sie nie beschreibt (`toMandateProfile()` erzeugt exakt dieses
Format, schreibt es aber nur in den JSON-Blob, nicht in die SQL-Tabelle). Eine neue Tabelle zu
bauen wäre Doppelarbeit und ein zusätzliches Migrationsrisiko. Stattdessen: **10 fehlende Spalten
ergänzen** (additiv, siehe Migration unten) und **die Schreib-/Lesepfade auf diese Tabelle
umstellen** (Phase 3).

## 2. Vollständiges Zielschema (`mandate_profiles`, nach Migration)

| Spalte | Typ | Herkunft | Neu in Phase 2? |
|---|---|---|---|
| `user_id` | text, PK, FK→`profiles.id` | bestehend | nein |
| `partei` | text | bestehend | nein |
| `fraktion` | text | bestehend | nein |
| `rolle` | text | bestehend | nein |
| `politische_ebene` | text, CHECK `bundestag`\|`landtag`\|NULL | bestehend, **CHECK neu** | Härtung |
| `wahlkreis` | text | bestehend | nein |
| `bundesland` | text | bestehend | nein |
| `ausschuesse` | text[] | bestehend | nein |
| `berichterstatter_themen` | text[] | bestehend | nein |
| `fachpolitische_schwerpunkte` | text[] | bestehend | nein |
| `aktuelle_kampagnen` | text[] | bestehend | nein |
| `oeffentliche_positionen` | text[] | bestehend | nein |
| `wichtige_zielgruppen` | text[] | bestehend | nein |
| `kommunikationsstil` | text | bestehend | nein |
| `risiko_themen` | text[] | bestehend | nein |
| `chancen_themen` | text[] | bestehend | nein |
| `no_go_themen` | text[] | bestehend | nein |
| `bevorzugte_kanaele` | text[] | bestehend | nein |
| `naechste_termine` | jsonb | bestehend | nein |
| `namensvarianten` | text[] default `{}` | **neu** | Radar-Personentreffer bei Kurzformen |
| `stellvertretende_ausschuesse` | text[] default `{}` | **neu** | vollständige Ausschussabbildung |
| `regionale_themen` | text[] default `{}` | **neu** | getrennt von Fachthemen, für Entity-Erkennung |
| `regierungsrolle` | text, CHECK `regierung`\|`opposition`\|`unbekannt`\|NULL | **neu** | Anzeige, DSGVO-neutral (kein Matching-Gewicht) |
| `aktiv` | boolean not null default `true` | **neu** | steuert Job-/Cron-Teilnahme (Phase 8) |
| `onboarding_status` | text not null default `'neu'`, CHECK `neu`\|`in_bearbeitung`\|`abgeschlossen` | **neu** | Admin-UX (Phase 4) |
| `ki_budget_taeglich_cent` | integer, CHECK `>0` or NULL | **neu** | Kostenschutz pro Mandant (Phase 10) |
| `ki_budget_monatlich_cent` | integer, CHECK `>0` or NULL | **neu** | Kostenschutz pro Mandant (Phase 10) |
| `datenschutz_bestaetigt_at` | timestamptz | **neu** | DSGVO-Nachweis |
| `geloescht_at` | timestamptz | **neu** | Soft-Delete vor Hard-Delete |
| `created_at`/`updated_at` | timestamptz | bestehend | nein |

**Bewusst NICHT gespeichert:** Profil-Vollständigkeit (bleibt zur Laufzeit berechnet, siehe
Phase 5 — ein gespeichertes Feld würde bei jeder Regeländerung sofort veralten). Kostenstatus
(wird aus `llm_usage` berechnet, nicht dupliziert). Quellenpakete (kein Zielort heute — Landtage
haben noch keine Quellen, siehe Profildatenkarte §7).

`profiles`-Tabelle bleibt schlank (Identität: `id`, `email`, `name`) — die dort bereits
vorhandenen, aber nie genutzten Spalten `party`/`committee`/`focustopics`/`embedding` werden mit
diesem Sprint **nicht** befüllt; sie sind durch `mandate_profiles` funktional abgelöst und bleiben
vorerst als totes Altfeld liegen (Aufräumen ist ein eigener, risikoloser Folgeschritt außerhalb
dieses Sprints — Spalten löschen ist eine Schema-Änderung, die hier nicht nötig ist).

## 3. Migration

- `supabase/migrations/20260712_mandate_profile_fields.sql` — additiv, idempotent
  (`add column if not exists`), 5 CHECK-Constraints als `do $$ ... if not exists $$`-Block
  (verträgt Mehrfachausführung).
- `supabase/migrations/20260712_mandate_profile_fields_rollback.sql` — entfernt exakt die
  10 neuen Spalten + 5 Constraints, rührt keine andere Tabelle an.
- **Risikobewertung:** minimal. Die Zieltabelle hat 0 Zeilen und wird von keinem Production-Pfad
  gelesen (siehe Phase 1 §1) — die Migration kann nichts Laufendes brechen, weil nichts heute
  darauf zugreift. Das eigentliche Risiko entsteht erst in Phase 3, wenn `storage.js` beginnt,
  diese Tabelle zu lesen/schreiben — deshalb bleibt die Migration hier **isoliert von jeder
  Verhaltensänderung** und wartet trotzdem auf die reguläre Production-Freigabe (siehe Auftrag:
  jede Production-Migration braucht ausdrückliche Freigabe, unabhängig vom gemessenen Risiko).

## 4. Warum jedes neue Feld gebraucht wird

| Feld | Warum gebraucht? | Welche Funktion nutzt es? | Was passiert, wenn es fehlt? |
|---|---|---|---|
| `namensvarianten` | Abgeordnete werden in Quellen oft nur mit Nachnamen oder Titel genannt | Radar-Personentreffer (`inferEntities`, heute nur `fullName`-Nachname) | Erwähnungen mit Kurzform werden nicht erkannt — technisch falscher Leerzustand im Radar |
| `stellvertretende_ausschuesse` | Ein Mandat hat oft volle + stellvertretende Ausschusssitze mit unterschiedlicher Relevanz | zukünftige Matching-Erweiterung (kleinerer Bonus als volle Mitgliedschaft) | Stellvertretende Zuständigkeit bleibt unsichtbar — kein Datenverlust, nur fehlende Feinheit |
| `regionale_themen` | Regionale Begriffe (Betriebe, Orte) sind keine Fachthemen, sollen aber Radar/Entity-Erkennung treffen | `inferEntities`/Radar | Ohne das Feld landen regionale Begriffe fälschlich in `fachpolitische_schwerpunkte` (Vermischung von Matching-Gewichten) |
| `regierungsrolle` | Admin/Nutzer sollen auf einen Blick sehen, ob ein Mandat Regierung oder Opposition ist | reine Anzeige (Admin-Übersicht, Phase 4) | Keine funktionale Auswirkung — nur Anzeige fehlt |
| `aktiv` | Ein deaktiviertes Profil darf nicht mehr in Cron-Jobs (Crawl-Matching, Briefing) laufen — unabhängig vom Account-Login-Status | Scheduler/Cron-Filter (Phase 8) | Ohne das Feld gibt es keinen sauberen Weg, ein Profil aus der Jobverarbeitung zu nehmen, ohne den Account zu löschen |
| `onboarding_status` | Admin muss erkennen, welche neu angelegten Profile noch unfertig sind | Admin-Profilliste (Phase 4) | Admin kann „neu, noch nicht konfiguriert" nicht von „fertig, aber bewusst schlank" unterscheiden |
| `ki_budget_taeglich_cent` / `_monatlich_cent` | Ohne Deckel kann ein Mandant das gesamte KI-Budget verbrauchen (bestätigtes P1-Risiko aus dem Voraudit) | KI-Budget-Check vor jedem LLM-Call (Phase 10) | Fail-open-Risiko bleibt bestehen — genau das Kern-SaaS-Risiko aus `audit/saas-risk-matrix.md` #4 |
| `datenschutz_bestaetigt_at` | Politische Mandatsdaten sind Art.-9-nahe besondere Kategorie (siehe `docs/dsgvo-checklist.md`) | Compliance-Nachweis, keine Laufzeitfunktion | Kein technischer Schaden, aber fehlender Rechtsgrundlagen-Nachweis |
| `geloescht_at` | „Löschstatus" aus dem Pflichtenheft — Soft-Delete vor Hard-Delete verhindert versehentlichen Datenverlust | `/api/privacy/delete`-Flow (Phase 5/Erweiterung) | Heute löscht `/api/privacy/delete` sofort hart — kein Korrekturfenster bei Fehlbedienung |

## 5. Was bewusst NICHT gebaut wurde

- Kein neues SQL-`ENUM`-Typ (CHECK-Constraints sind leichter erweiterbar und rückrollbar).
- Keine Quellenpakete-Zuordnung (Landtage haben noch keine Quellen — das wäre eine
  Quellenausbau-, keine Profilmodell-Frage, siehe `audit/source-coverage.md`).
- Kein gespeichertes Vollständigkeits-/Kostenstatus-Feld (bleibt berechnet, um Stale-Daten zu
  vermeiden).
- Keine Änderung an der `profiles`-Tabelle (bleibt schlank; ungenutzte Altspalten dort werden
  nicht angefasst).

---

*Nächster Schritt: Phase 3 — `storage.getProfile`/`saveProfile` auf diese Tabelle umstellen,
mit Code-Fallback (`cemInceProfile`) bis alle Tests grün sind. Production-Migration erst nach
Freigabe.*
