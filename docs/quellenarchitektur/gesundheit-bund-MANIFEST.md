# Manifest — Quellenpaket `gesundheit-bund` (kompakter Einstieg)

> Zweck: Ein neuer Thread liest **nur diese Datei** (+ bei Bedarf die 3 verlinkten), nicht das
> ganze Repo. Stand 2026-07-24. Paket ist **prepared / technisch INAKTIV**.

## Was ist das?
Fachthemenpaket Gesundheitspolitik Bund. **16 Kernquellen** fachlich, davon **14 neue Abrufwege**
(BMG, Bundesrat, G-BA, RKI, Destatis, GKV-SV, KBV, DKG, SVR, BfArM, PEI, IQWiG, BÄK, Pflegerat);
der parlamentarische Prozess (Bundestag/Ausschuss Gesundheit) läuft über den **Bestand**
(DIP-API + `committee-bt-gesundheit`), Destatis-Reihen über **einen** Weg.

## Die 5 Dateien, die zählen
| Datei | Rolle |
|---|---|
| `lib/helmut/quellenarchitektur/seeds/gesundheit-bund-quellen.js` | **Single Source**: Kandidaten + `buildGesundheitBundSeed()` (Publisher/Entitäten/Wege/Zuordnungen) |
| `lib/helmut/quellenarchitektur/seeds/gesundheit-bund-verifikation.js` | Verifikations-Record (Ebene 1 Recherche belegt / Ebene 2 Byte OFFEN) |
| `scripts/generate-gesundheit-bund-seed.js` | SQL-Generator → `supabase/seeds/20260724_gesundheit_bund_seed(.rollback).sql` |
| `scripts/gesundheit-bund-seed-test.js` | Offline-Tests (Inaktivität, Dedup, Klassifizierung, Nicht-Aktivierung) |
| `docs/quellenarchitektur/29-quellenpaket-gesundheit-bund.md` | Vollständige fachliche+technische Doku (10 Abschnitte) |

Ergänzt in `seeds/packages.js`: Paketdefinition `pkg-gesundheit-bund` (`prepared`, `is_base:false`).

## Harte Invarianten (dürfen nicht brechen)
- Alle Wege `status=needs_review`, `activation_mode=manual` → **0 aktive Wege**.
- **Kein Profil-Mapping** mappt auf `gesundheit-bund` → `computeGlobalActivation` aktiviert es nie.
- Standalone-Seed **nicht** in `buildFullModel`/`catalog.js` verdrahtet (wie Landesmodule).
- Wiederverwendet (nie neu anlegen): Herausgeber BMG/Bundesrat/Destatis + Entitäten
  `ministry-bmg`/`parliament-bundesrat`/`statoffice-destatis`.

## Befehle
```
node scripts/gesundheit-bund-seed-test.js          # Offline-Tests (muss grün sein)
node scripts/generate-gesundheit-bund-seed.js      # Seed-SQL deterministisch regenerieren
node scripts/run-offline-tests.js                  # gesamte Offline-Suite
```

## Nächster Schritt (freigabepflichtig, NICHT Teil dieses Sprints)
1. Byte-Verifikation über offenen Egress-Runner (Muster `.github/workflows/sprint9b-verify.yml`);
   Ergebnisse in `gesundheit-bund-verifikation.js` (Byte-Ebene) eintragen.
2. RSS/API-Deep-Links fixieren (G-BA/Destatis bereits konkret; RKI-Feed-URL migriert).
3. Erst danach: Aktivierung (Status/activation_mode) + optionales Profil-Mapping — separat.
