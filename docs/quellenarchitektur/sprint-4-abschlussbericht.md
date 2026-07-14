# Sprint 4 — Abschlussbericht (Paketaktivierung · Profil→Paket · Referenzzählung)

**Stand:** 2026-07-13 · **Branch:** `claude/helmut-source-architecture-ruhyvb` ·
**Modus:** ausschließlich sichere, reversible Arbeiten — **keine** Production-Migration, keine
Production-Datenänderung, keine RLS-Änderung, kein Deployment, keine Quellenaktivierung.

## 1. Architektur

Ein neues reines Logik-Modul `lib/helmut/quellenarchitektur/profile-packages.js` (KEINE KI, kein
Netz, kein Storage), das auf `mandate_profiles` und dem Sprint-1-Fundament aufsetzt:

- **`resolveProfilePackages(profile)`** — leitet aus `mandate_profiles` automatisch die Pakete ab:
  Pflicht-Basispaket **Bund Basis** (jedes Profil), zusätzlich das **Landespaket** bei Landtag
  (Berlin/Brandenburg), ergänzend Partei/Fraktion/Ausschuss/Fachthema/Region. Liest `politische_ebene`
  direkt (robuste Ebenen-Auflösung, da `config.parliamentTypeOf` dieses Feld nicht auswertet).
- **`profileSupplyStatus(profile)`** — Pflichtpaket-Garantie: „vollständig aktiviert" nur, wenn alle
  Pflicht-Basispakete `active` sind **und** Abrufwege tragen. Berliner/Brandenburger Landtagsprofile
  sind daher **nicht** vollständig aktiviert (Landespaket `prepared`) → im Admin/Validierung sichtbar.
- **`computeGlobalActivation(...)`** — Referenzzählung: aktive Profile → Pakete → Abrufwege. Nutzt die
  Sprint-1-Funktionen `computePathRefcounts`/`isPathActive`. Hundert Profile mit demselben Paket →
  genau eine technische Aktivierung.
- **Wiederverwendung statt Doppelmodell:** `parliamentTypeOf`, `validateProfile` (Aktivierungs-
  berechtigung = die 5 bestehenden Zustände), `normalizeParty`/`normalizeCommittee`.

**Klarstellung Daueraktivierung (Nachschärfung K1):** Daueraktivierung lebt **ausschließlich auf der
Abrufweg-Ebene** (`activation_mode = always_on`) — nur die **5 neutralen Bund-Basis-Kernquellen**
(Bundestag/Bundesregierung/Tagesschau/Deutschlandfunk/DIP). Ein Paket-Feld `always_on` gibt es
**nicht mehr** (es hätte fälschlich das ganze Bund-Basis-Paket ohne Profil aktiviert). Ohne aktives
Profil laufen daher **genau 5** Abrufwege; Bund Basis läuft **voll (54)**, sobald ein Profil aktiv
ist. `is_critical` (nicht still archivieren) ist orthogonal und breiter (auch BMAS/Die Linke), diese
laufen aber nur über Referenzzählung.

## 2. Verbindliche Testfälle — alle grün
| # | Fall | Ergebnis |
|---|---|---|
| 1 | Bundestagsprofil erhält Bund Basis | ✅ vollständig aktiviert |
| 2 | Landtagsprofil → Bund Basis + Landespaket | ✅ Berlin/Brandenburg; **nicht** vollständig (Landespaket prepared) |
| 3 | Partei/Fraktion/Ausschuss/Thema/Region ergänzen Pakete | ✅ Die-Linke, Arbeit&Soziales, Regional |
| 4 | 100 Profile, ein Paket → eine Aktivierung | ✅ 144 aktive Abrufwege bei 1 **und** 100 Profilen |
| 5 | pausiertes/gelöschtes Profil reduziert Refcount | ✅ Refcount → 0, Paket nicht mehr aktiv |
| 6 | kein aktives Profil → kein unnötiger Crawl | ✅ nur **5** Kern-Abrufwege (`activation_mode=always_on`); kein Paket aktiv |
| 7 | fehlerhafte/unvollständige Profile → keine falsche Aktivierung | ✅ kein falsches Paket, leere Profile inaktiv |

**`test:profile-packages` 57 PASS / 0 FAIL.** Keine Regression: source-architecture 88/88,
dedup-findings 30/30, ko-classification 67/67, profile-validation 36/36, profile-completeness 46/46,
profile-db 44/44, supply-matrix 20/20, drei-profile 93/93, p1 **322/322**.

### Nachgezogene Verify-Korrekturen (adversarialer Verify-Workflow)
Nach Sprint 4 fand der adversariale Verify-Workflow vier echte, kleine Befunde — alle behoben und
getestet:
1. **Totes Paket `profil-cem-ince`** (mittel): wurde von `resolveProfilePackages` nie erzeugt →
   unerreichbar. Jetzt **an die Pilot-Profil-ID gebunden** (`PERSONAL_PACKAGE_BY_PROFILE`), damit die
   Referenzzählung es aktivieren kann. Cems reales Profil (`cem-ince`) hat damit **5 Pakete / 145
   Abrufwege**; ein gleichnamiges Profil mit anderer ID bekommt es **nicht**.
2. **`profileCompleteness` (config)** prüfte nur `state`, `validateProfile` aber `state` **oder**
   `bundesland` → Landtagsprofile aus `mandate_profiles` (Feld `bundesland`) wurden fälschlich als
   „state fehlt" gemeldet. Jetzt konsistent `state` **oder** `bundesland`.
3. **`parliamentTypeOf`**: die überbreite `startsWith("land")`/`startsWith("bund")`-Kurzform wurde für
   das Enum-Feld `politische_ebene` durch **wortgenaue** Erkennung ersetzt (Kurzform bleibt nur dem
   Legacy-Freitextfeld `politicalLevel` vorbehalten).
4. **Sozialthema-Erkennung**: von Teilstring auf **Wortanfang** umgestellt — `Denkmalpflege` löst kein
   Sozialpaket mehr aus, `Pflege`/`Pflegeversicherung`/`Tarifbindung` weiterhin schon.

## 3. Branch & Commit
- **Branch:** `claude/helmut-source-architecture-ruhyvb`
- **Commit:** wird beim Push gesetzt (siehe Chat-Bericht).

## 4. Sicherheit, Kosten, Performance
- **Sicherheit/Mandanten:** rein globale/mandantenlose Logik über öffentliche Paket-/Quellendefinitionen;
  Profil-Lesung nutzt die bestehende Validierung; keine DB-/RLS-Änderung.
- **Kosten:** keine — reine Logik/Tests, kein Crawl, keine KI. Die Referenzzählung **spart** Kosten
  (verhindert doppelte Crawls bei vielen Profilen).
- **Performance:** O(Profile × Pakete) für die Aktivierung + O(package_paths) Refcount; für Admin/
  Scheduler-Vorberechnung unkritisch, nicht im App-Start-Pfad.

## 5. Offene Risiken
- **Nicht in den Live-Scheduler verdrahtet.** Der produktive Crawl ist heute profilgebunden
  (`runSourceCrawl(politicianId)`); die Umstellung auf **global-once mit Referenzzählung** ändert
  Cron-/Job-Architektur → **freigabepflichtig** (Sprint 6/7, Shadow zuerst).
- **Fachthemenpakete** außer Arbeit&Soziales fehlen noch (Sprint 9) → Nicht-Sozial-Profile bekommen
  Fachtiefe erst mit weiteren Paketen; der Resolver ist darauf vorbereitet (belegt-basiert, kein Raten).
- **Landespakete Berlin/Brandenburg** sind `prepared` (0 Quellen) → Landtagsprofile bewusst „nicht
  vollständig aktiviert", bis die Quellenrecherche (Sprint 9) + Freigabe erfolgt.

## 6. Noch nicht ausgeführte Production-Schritte (gesammelt, nichts ausgeführt)
Migrationen `20260713`/`20260714`/`20260715` + Seeds anwenden · KO-Klassifikations-Backfill · Crawl
von profilgebunden auf global-once (Referenzzählung) umstellen · Landespakete aktivieren (nach
Quellenprüfung) · echtes Supabase-Auth (langfristig). **Alles vorbereitet, nichts ausgeführt.**

## 7. Nächster Sprint
**Sprint 5** (globale Wichtigkeit vs. persönliche Relevanz vs. Handlungsfähigkeit + 3 Leerzustände) —
nutzt die Sprint-2-Klassifikation; **oder** Sprint 8 (Admin-Oberfläche), die den in Sprint 4 gebauten
`profileSupplyStatus`/`computeGlobalActivation` sichtbar macht.
