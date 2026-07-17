# Paketaktivierung, Profil→Paket-Ableitung & Referenzzählung (Sprint 4)

Erklärt, wie ein Profil automatisch seine Pakete bekommt und wie viele Profile trotzdem nur **einen**
Crawl auslösen — verständlich aus Gründerperspektive.

## Zwei getrennte Aktivierungen (Auftrag §10)

1. **Profilzuordnung:** Jedes aktive Profil bekommt **automatisch** seine Pakete abgeleitet — keine
   kopierte Quellenliste.
2. **Technische Paketaktivierung:** Braucht **mindestens ein** aktives Profil ein Paket, werden dessen
   Abrufwege **global einmal** aktiviert. Hundert Profile mit „Berlin Basis" → trotzdem **ein** Crawl.

## Welche Pakete bekommt ein Profil? (`resolveProfilePackages`)

Verbindlich aus `mandate_profiles` (die `politische_ebene` wird direkt gelesen — anders als
`config.parliamentTypeOf`, das nur `parliamentType` kennt; der Resolver liest beide).

| Profil | Pflicht-Basispakete | Ergänzend (optional) |
|---|---|---|
| **Bundestag** | Bund Basis | Partei (Die Linke), Fachthema (Arbeit&Soziales), Region |
| **Landtag** | Bund Basis **+** Landespaket (Berlin/Brandenburg) | dito |

Ergänzende Pakete entstehen aus **belegten** Feldern: Partei/Fraktion → Partei-Paket; Ausschuss/
Fachthema sozialpolitisch → `arbeit-und-soziales`; Region Niedersachsen → `regional-niedersachsen`.
Andere Politikfelder haben noch **kein** eigenes Paket → keine Zuordnung (ehrlich, kein Raten).

**Sozialthema-Erkennung (wortgenau, Nachschärfung):** sozialpolitische Begriffe werden am
**Wortanfang** erkannt, nicht als beliebiger Teilstring. `pflege` trifft „Pflege"/„Pflegeversicherung"
(Sozial-Stamm als Kompositum-Kopf), aber **nicht** „Denkmalpflege"/„Landschaftspflege" (dort ist der
Stamm nur ein Suffix, das Thema ist Denkmal/Landschaft) — so verschwindet ein früherer Fehltreffer,
ohne den Recall für echte Sozial-Komposita (`Tarifbindung`, `Rentenreform`) zu verlieren.

**Personenbezogenes Paket (`profil-<pilot-mandats-id>`):** an die **konkrete Profil-ID** gebunden (Pilot
`<pilot-mandats-id>`), **nicht** aus Sachfeldern ableitbar (personenbezogene Nachrichtensuche nur für dieses
Profil). Ohne diese explizite Bindung wäre das Paket samt seinem `demoOnly`-Abrufweg unerreichbar
(nie referenziert → nie aktiviert). Ein anderes gleichnamiges Profil (andere ID) bekommt es **nicht**.

## Pflichtpaket-Garantie & unvollständige Aktivierung (`profileSupplyStatus`)

Ein Profil ist nur **vollständig aktiviert**, wenn **alle** Pflicht-Basispakete existieren, Status
`active` haben **und** Abrufwege tragen. Konsequenzen:
- **Bundestagsprofil:** Bund Basis ist `active` + versorgt → vollständig aktiviert.
- **Berliner/Brandenburger Landtagsprofil:** braucht `berlin-basis`/`brandenburg-basis` — die sind
  aktuell `prepared` (0 Quellen, Sprint 9 folgt) → **nicht vollständig aktiviert**,
  `missingBasePackages` nennt das fehlende Landespaket, `reason = "pflichtpaket-unversorgt"`. Der
  Admin (Sprint 8) macht das sichtbar.
- **Landtagsprofil ohne Bundesland:** kein falsches Landespaket; `requiredMissing` meldet
  `landespaket:unbekannt`.

## Referenzzählung & Aktivierung (`computeGlobalActivation`)

- **Aktivierungsberechtigt** ist nur ein Profil, das nicht deaktiviert/gelöscht **und** brauchbar ist
  (`validateProfile().usable`). Fehlerhafte/leere Profile tragen **nicht** zur Aktivierung bei →
  keine falsche Aktivierung.
- **Paket technisch aktiv** **nur**, wenn ≥1 aktives Profil es braucht **und** Status `active`. Es
  gibt **keine** Paket-Ebene-Daueraktivierung: ohne aktives Profil ist **kein** Paket aktiv.
  `prepared`/`draft`-Pakete werden **nie** technisch aktiviert; angefordert-aber-unversorgt erscheint
  als `requested_unsupplied`.
- **Abrufweg aktiv** per Referenzzählung (≥1 aktives Paket via `package_paths`) **oder** wenn er
  selbst `activation_mode = always_on` trägt. `dev_only` löst **nie** einen Crawl aus.

### `always_on` (Abrufweg-Ebene) vs. `is_critical` — Nachschärfung K1
Daueraktivierung lebt **ausschließlich auf der Abrufweg-Ebene** (`activation_mode = always_on`) —
bewusst **nur** die **5 neutralen Bund-Basis-Kernquellen** (Bundestag, Bundesregierung, Tagesschau,
Deutschlandfunk, DIP). Ein Paket-Feld `always_on` existiert **nicht mehr** (es hätte fälschlich das
ganze Bund-Basis-Paket ohne Profil aktiviert). **Ohne aktives Profil laufen daher genau diese 5
Abrufwege** — Bund Basis läuft **voll (54)**, sobald **ein** Profil aktiv ist (jedes Profil braucht
Bund Basis). **`is_critical`** (nicht still archivieren) ist orthogonal und gilt breiter (auch BMAS,
Die Linke, Linksfraktion) — diese laufen aber **nur über Referenzzählung**, nicht dauerhaft.

## Verifiziertes Verhalten (Tests, echter Katalog)

| Fall | Ergebnis |
|---|---|
| Bundestagsprofil | → Bund Basis, vollständig aktiviert |
| Berliner/Brandenburger Landtag | → Bund Basis + Landespaket; **nicht** vollständig (Landespaket prepared) |
| **reines** Bundestagsprofil (SPD, Gesundheit) | → **nur** Bund Basis = **54 Abrufwege** (nicht 144) |
| **Pilot**-Profil (`<pilot-mandats-id>`: Linke/Sozial/NDS + persönliches Paket) | → Bund Basis + Die-Linke + Arbeit&Soziales + Regional NDS + `profil-<pilot-mandats-id>` = **145 Abrufwege** |
| 1 vs. 100 identische Profile (ohne Pilot-ID) | **144 aktive Abrufwege** in beiden Fällen (Refcount 1 vs. 100) |
| Berliner/Brandenburger Landtag | Bund Basis aktiv (54); Landespaket `requested_unsupplied` (prepared) |
| **kein** aktives Profil | **5 aktive Abrufwege** (nur die neutralen Kern-Systemquellen; **kein** Paket aktiv) |
| pausiert/gelöscht | Refcount → 0, Paket nicht mehr aktiv |
| leeres/unvollständiges Profil | keine falsche Aktivierung |

**Nicht in den Live-Scheduler verdrahtet** (wie Sprint 1–3 additive Kompatibilitätsschicht); die
Umstellung des profilgebundenen Crawls auf global-once ist ein **freigabepflichtiger** Folgeschritt.
