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
- **Paket technisch aktiv**, wenn (≥1 aktives Profil braucht es **oder** `always_on`) **und**
  Status `active`. `prepared`/`draft`-Pakete werden **nie** technisch aktiviert; angefordert-aber-
  unversorgt erscheint als `requested_unsupplied`.
- **Abrufweg aktiv** per Referenzzählung (≥1 aktives Paket via `package_paths`) **oder**
  `activation_mode = always_on`. `dev_only` löst **nie** einen Crawl aus.

### `always_on` vs. `is_critical` (Sprint-4-Klarstellung)
Getrennt: **`always_on`** = läuft dauerhaft, auch ohne Profil — bewusst **nur** die **neutralen
Bund-Basis-Kernquellen** (Bundestag, Bundesregierung, Tagesschau, Deutschlandfunk, DIP).
**`is_critical`** = darf nicht still archiviert werden — gilt breiter (auch BMAS, Die Linke,
Linksfraktion). Themen-/parteispezifische Quellen laufen daher **nur über Referenzzählung** (nur wenn
ein passendes Profil ihr Paket braucht), nicht dauerhaft.

## Verifiziertes Verhalten (Tests, echter Katalog)

| Fall | Ergebnis |
|---|---|
| Bundestagsprofil | → Bund Basis, vollständig aktiviert |
| Berliner/Brandenburger Landtag | → Bund Basis + Landespaket; **nicht** vollständig (Landespaket prepared) |
| Cem (Linke/Sozial/NDS) | → Bund Basis + Die-Linke + Arbeit&Soziales + Regional NDS = 144 Abrufwege |
| 1 vs. 100 identische Profile | **144 aktive Abrufwege** in beiden Fällen (Refcount 1 vs. 100) |
| kein aktives Profil | **54 aktive Abrufwege** (nur Bund Basis, `always_on`) |
| pausiert/gelöscht | Refcount → 0, Paket nicht mehr aktiv |
| leeres/unvollständiges Profil | keine falsche Aktivierung |

**Nicht in den Live-Scheduler verdrahtet** (wie Sprint 1–3 additive Kompatibilitätsschicht); die
Umstellung des profilgebundenen Crawls auf global-once ist ein **freigabepflichtiger** Folgeschritt.
