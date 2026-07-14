# Sprint 8 — Abschlussbericht (Admin-Oberfläche der Quellenarchitektur)

**Stand:** 2026-07-13 · **Branch:** `claude/helmut-source-architecture-ruhyvb` ·
**Modus:** ausschließlich sichere, reversible, additive, **read-only** Arbeiten — **keine**
Production-Migration, keine Production-Datenänderung, kein Deployment, keine Quellenaktivierung.

## 1. Architektur
- **`lib/helmut/quellenarchitektur/admin-report.js`** (rein, keine KI/Netz/Storage/Rendering): formt
  Sprint 4 (Aktivierung/Versorgung) + Sprint 7 (Qualität/Kosten/Watchdog) in die **sechs** Ansichten:
  1. Länder und Pakete · 2. Quellen und Abrufwege · 3. Profile und Paketversorgung · 4. Prüfbedarf ·
  5. Quellendetail · 6. Kosten und Produktnutzen.
- **Client** (`client.js`): `renderAdminQuellenarchitektur` + 6 Teil-Renderer über die **bestehenden**
  Helmut-Muster (`adminSection`/`dsRow`/`ds-unavail`/`op-tile`/`ac-item`/Chips) + wenige ruhige `.sa-*`-
  Pills (`styles.css`). Eingehängt in die Admin-Seite vor „System und Sicherheit".
- **Server** (`server.js`): `buildAdminOverview` hängt `sourceArchitecture` an — **read-only, defensiv**
  (`buildFullModel` + `computeGlobalActivation` + `buildQualityReport` aus `listRawDocuments`/`getLlmUsage`
  → `buildSourceAdminReport`); Fehler → `null` → Client rendert nichts (Alt-Admin unverändert).

## 2. Zeigt klar (Auftrag)
- **Länder aktiv/vorbereitet:** Niedersachsen aktiv; Berlin/Brandenburg vorbereitet; 13 ohne Modul.
- **Fehlende Pflichtklassen:** Berlin/Brandenburg „0/15 — 15 fehlen" (ehrlich, keine Quellen).
- **Profile versorgt/unversorgt:** Cem versorgt; Berlin-MdA unversorgt (Landespaket `prepared`).
- **Abrufwege gesund/defekt/unbekannt:** 6 defekt (Pflichtquellen sichtbar), Rest „unbekannt" ohne
  Metriken (nie „gesund" geraten).
- **Nicht verfügbare Messwerte:** eigener Block (Dokumente/KO/Duplikate/Telemetrie/Kosten je Quelle).
- **Kosten ohne Nutzen:** aus Produktnutzen (nur_duplikate/ohne_ko) — bei fehlenden Daten ehrlich leer.
- **Konkrete Handlung:** ranked `recommendedAction` je Punkt (Prüfbedarf, Quellendetail).

## 3. Ehrlichkeit + ruhiger Leerzustand
- Migrations-Banner: „Neue Quellentabellen noch nicht migriert — Struktur aus dem Code-Modell (Vorschau),
  Kennzahlen aus Bestandsdaten."
- Fehlende Grundlagen → `ds-unavail` „nicht verfügbar", **nie** eine erfundene 0/Demozahl.
- Prüfbedarf **entrauscht**: nur strukturell reale Probleme (8 statt 163 Rausch-Hinweise), keine
  komplizierten Diagramme.

## 4. Tests — alle grün
- **`test:admin-source-report` 37/37** · **`test:admin-source-ui` 23/23** (echte Render-Funktionen im vm).
- **Keine Regression:** admin-overview 104, helmut-ui 50, radar-ui 18, quality-watchdog 65,
  profile-packages 57, scoring 73, source-architecture 88, p1 322.

## 5. Screenshots + Vorschau
- Generator (Scratchpad) rendert die echten Ansichten mit echtem `styles.css` und screenshotet via
  Chromium: Übersicht, Länder/Pakete, Quellen, Profile, Prüfbedarf, Kosten (Desktop + Mobil).
- **Preview-Link:** ein produktiver Preview-**Deployment**-Workflow ist freigabepflichtig (kein
  Deployment ohne Freigabe); als sichere, nicht-produktive Vorschau wird die gerenderte Seite als
  hostbare Artefakt-Seite bereitgestellt (statisch, keine echten Nutzerdaten).

## 6. Offene Risiken / freigabepflichtig (nichts ausgeführt)
Migrationen anwenden (dann füllt sich der Report aus echten Tabellen) · `koSourceLinks`/Dedup-Ingest
verdrahten (KO-/Duplikat-Kennzahlen) · `sourceId` in `llm_usage` (Kosten je Quelle) · Deployment/Preview.
Die Oberfläche ist **read-only** und ändert nichts.

## 7. Nächster Sprint
**Sprint 6** (Migration bestehender Quellen + Shadow-Betrieb, Cem-Schutz) — füllt die heute „nicht
verfügbaren" Kennzahlen mit echten Daten und macht die neue Struktur produktiv. **Oder** Sprint 9
(Berlin/Brandenburg-Quellenrecherche), das die vorbereiteten Landesmodule mit Quellen füllt. Beide
freigabepflichtig.
