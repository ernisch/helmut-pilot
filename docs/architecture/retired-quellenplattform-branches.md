# Stillgelegte „Quellenplattform"-Branches (Generation B) — NICHT mergen

**Recovery Sprint R2 · Stand 2026-07-22 · `main` @ `d6d9063`**
Grundlage: Recovery-Audit R1 (rein lesend, verifiziert an Code/Commits/Dateien).

---

## 1. `main` ist die einzige Architekturwahrheit

Es gibt **genau eine** laufende, kohärente Architektur: **`main`**. Der relationale
Quellen-Read ist **live** (`HELMUT_SOURCE_MODE=on`, `helmut-flags.json`), die
Mandantentrennung ist App-seitig aktiv, alle angewandten Migrationen tragen Rollback-SQL.
Für Sicherheit/RLS/JWT gilt `docs/quellenarchitektur/05-sicherheitsmodell-rls.md`,
für den Gesamtstatus `docs/quellenarchitektur/00-master-status.md`, für offene Punkte
`docs/datenmotor-restliste.md`.

## 2. Generation B darf nicht gemergt oder als Basis verwendet werden

Die „Quellenplattform"-Branches (Generation B) sind ein **vollständiger, dormanter
Nachbau** von Konzepten, die auf `main` bereits live laufen. Aus Sicht des laufenden
Servers sind sie **additiver toter Code** (`server.js` ist zwischen `origin/main` und den
Branch-Spitzen bit-identisch; kein Live-Import). Sie **dürfen nicht** nach `main` gemergt
und **nicht** als Basis für neue Arbeit verwendet werden.

Vollständige Generation-B-Liste (Stand R1, keine dieser Branches ist gemergt):

```
architecture/quellenplattform-secure-read-path      (Kette Sprint 1–7)
architecture/quellenplattform-production-validation  (Sprint 6)
architecture/quellenplattform-catalog-enrichment     (Sprint 5)
architecture/quellenplattform-shadow-sprint4         (Sprint 4 „Shadow")
architecture/quellenplattform-konsolidierung
integration/quellenplattform-konsolidierung
integration/quellenplattform-sprints-1-3
claude/universelles-mandatsregister-sprint1          (Sprint 1)
claude/session-ckedi8                                (Sprint 2)
claude/session-pyryop                                (Sprint 3)
claude/session-fprapc                                (Sprint 9)
claude/dark-launch-quellenplattform-s8ge3a           (Sprint 4 „Dark Launch")
claude/read-activation-prep-sprint10-q2ue60          (Sprint 10)
claude/preview-infrastructure-validation-7wmc0e      (Sprint 11)
claude/secure-read-path-security-review-rm21uv       (Sprint 8, Audit)
```

## 3. Besonders gefährliche / irreführende Branches

| Branch | Warum gefährlich / überholt |
|---|---|
| **`claude/session-pyryop`** | Legt `supabase/migrations/20260722_master_source_catalog.sql` in den **LIVE-Migrationspfad** (nicht `prepared/`). Ein Merge würde einen **zweiten, konkurrierenden Quellenkatalog in Produktion** anlegen, neben dem bereits live laufenden `publishers`/`retrieval_paths`/`source_packages`. Identischer Datei-Inhalt liegt auf den Konsolidierungs-Branches bewusst in `prepared/` (dormant). |
| **`architecture/quellenplattform-secure-read-path`** | Längste Kette (Sprint 1–7); trägt die **gesamte dormante Duplikatarchitektur** (`lib/helmut/quellenbibliothek/*`, `.../master/*`, `mandate-register.js`, `shadow*.js`, `secure-read-path.js`) plus `prepared/`-Migrationen (`mandate_register`, 12× `catalog_*`). Dupliziert Live-Konzepte von `main`. |
| **`claude/preview-infrastructure-validation`** | Enthält eine **echte, nicht-`prepared/` Migration** `20260722_readonly_role.sql` (Rolle `helmut_readonly`) im aktiven Pfad — nur für eine Wegwerf-Preview gedacht, aber bei einem Merge nach `main` **würde sie laufen**. |
| **`claude/sprint3-jwt-auth-rework`** (Gen. C, gemergt/überholt) | Baut den **alten Selbst-Signier-JWT-Pfad** aus, der inzwischen **dauerhaft stillgelegt** ist (`tenantJwtModeEnabled()`→`false`, Supabase asymmetrische Keys → PGRST301). Reaktivierung ist eine Sackgasse; siehe `05-sicherheitsmodell-rls.md`. |

## 4. Inhalte, die NIEMALS übernommen werden dürfen

- **Zweite Katalog-Migration** (`20260722_master_source_catalog.sql` im Live-Pfad,
  `catalog_*`/`tenant_source_*`-Tabellen) — dupliziert das live laufende relationale
  Quellenmodell auf `main`.
- **Dormante Duplikatarchitektur** (`lib/helmut/quellenbibliothek/*`,
  `lib/helmut/quellenarchitektur/master/*`, `mandate-register.js`, `shadow*.js`,
  `dark-launch.js`) — un-verdrahteter Nachbau bereits existierender Live-Module.
- **Alter JWT-Pfad** / jede Reaktivierung von `tenantJwtModeEnabled()` oder
  `HELMUT_TENANT_JWT_MODE` als Wirk-Schalter. DB-seitige Durchsetzung nur über echtes
  GoTrue-Auth und nur unter Freigabe **OP-03**.
- **Konkurrierende Secure-Read-Implementierungen** (`quellenarchitektur/secure-read-path.js`,
  `lib/helmut/secure-read-path.js`, `lib/helmut/secure-read.js`) — drei parallele,
  inerte Entwürfe; keiner ersetzt den aktuellen App-seitig gescopten Read-Pfad.
- **Zweites Mandatsmodell** (`mandate_register`/`mandate_external_ids`) — Projektion neben
  dem kanonischen `mandate_profiles`; nicht anwenden.

## 5. Zukünftige Arbeit

Nur über **kurzlebige Branches direkt von aktuellem `origin/main`**. Kein `architecture/*`-
oder `integration/*`-Branch wird jemals Basis. Falls ein einzelner Baustein aus Generation B
inhaltlich gewünscht ist, wird er **neu auf dem Live-Modell von `main` implementiert**, nicht
durch Merge eines Generation-B-Branches übernommen.

> **Hinweis:** Dieses Dokument löscht keine Branches und ändert keine Tags/Remotes. Das
> endgültige Löschen/Archivieren der Branches ist ein separater, ausdrücklich freizugebender
> Schritt.
