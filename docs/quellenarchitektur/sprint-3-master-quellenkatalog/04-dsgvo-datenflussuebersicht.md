# Sprint 3 — DSGVO-Datenflussübersicht und Datenminimierung (Phase 8)

Datenschutz ist von Beginn an eingebaut (privacy by design). Der Master Quellenkatalog beschreibt
**Quellen** (öffentliche Organisationen, Feeds, amtliche Verzeichnisse) — **keine** Privatpersonen.

## 1. Datenflussübersicht (Master Quellenkatalog)

```
 ENTDECKUNG                     KATALOG (global)                 MANDANT (tenant)
 ----------                     ----------------                 ----------------
 amtliche Verzeichnisse ┐
 strukturierte Daten    ├─►  catalog_sources (kanonisch) ──►  catalog_package_assignments
 Alt-Katalog (v1)       │       · nur öffentliche             (Referenz, keine Kopie)
 manuelle Kuratierung   │         Quellen-Metadaten                     │
 Suchanbieter (Discov.) ┘       · Herkunft + Prüfstatus                 ▼
                                · KEINE PII                    tenant_source_relevance  (tenant_id, RLS)
                                       │                       tenant_source_overrides  (tenant_id, RLS)
 source_crawl_telemetry ──►  catalog_source_health            tenant_private_sources   (tenant_id, RLS)
 (nur techn. Zähler,           (nur Zähler/Status)                     │
  kein Volltext/PII)                   │                                ▼
                                       └──────────────►  Quellenpaket je Mandat (nur Referenzen)
```

**Personenbezug im Katalog:** ausschließlich **öffentliche berufliche/politische Mandatsdaten**
(z. B. „Deutscher Bundestag", „Ausschuss für Gesundheit", eine Partei-Website). Der einzige
potenziell personennahe Quellentyp ist `abgeordnete` (öffentliche Mandatsfunktion) — er speichert
nur die **öffentliche** Nachrichtenspur, keine privaten Kontaktdaten.

## 2. Die vierzehn verbindlichen Regeln — Umsetzung

| # | Regel | Umsetzung im Master-Katalog |
|---|-------|------------------------------|
| 1 | Nur öffentlich relevante berufliche/politische Mandatsdaten | Taxonomie beschreibt Institutionen/Organisationen; `privacy_status` je Quelle |
| 2 | Keine privaten Adressen/Telefon/E-Mail | `FORBIDDEN_PII_KEYS` + `scanForPrivatePii()` weisen solche Felder/Werte **ab** (Test §21) |
| 3 | Keine sensiblen persönlichen Eigenschaften ableiten | Katalog leitet nichts über Personen ab; nur Quellen-Metadaten |
| 4 | Politische Zuordnung nur aus öffentlicher Mandatsfunktion | `party_id`/`group_id`/`committee_ids` verweisen auf **Institutionen**, nicht auf Personen |
| 5 | Keine privaten Social-Media-Profile | keine Social-Kategorie; `abgeordnete` nur öffentliche Nachrichtenspur |
| 6 | Rohdaten nur wenn erforderlich | Katalog speichert Metadaten + `evidence_url`, keinen Volltext |
| 7 | Herkunft + Zweck jeder personenbezogenen Info dokumentieren | `discovery_origin` + `evidence_url` + `responsible` (Regel/Rolle) je Quelle |
| 8 | Aufbewahrungsfristen/Löschregeln vorbereiten | siehe §3 (Aufbewahrungsmatrix) |
| 9 | Veraltete Mandate/frühere Funktionen zeitlich kennzeichnen | Importzustände `superseded`/`archived` + `discovered_at`/`last_checked_at` |
| 10 | Manuelle Korrekturen/Löschanforderungen nachvollziehbar | `catalog_source_audit` (append-only) + `tenant_source_overrides` |
| 11 | Logs ohne unnötige PII | Telemetrie speichert nur techn. Zähler; Katalog-Logs enthalten IDs/Enums |
| 12 | E-Mail/Kennungen in Protokollen maskieren | `responsible` erlaubt nur Regel/Rolle; Rollen-Mailboxen (`presse@`) erlaubt, private abgewiesen |
| 13 | Mandanten sehen keine Daten anderer Mandanten | `tenant_id` + RLS `tenant_isolation`; `resolveTenantSources` isoliert hart (Test §11) |
| 14 | Externe API vor Aktivierung prüfen (Vertrag/Datenstandort/Unterauftrag/AVV) | siehe §4; keine kostenpflichtige/externe API in Sprint 3 aktiviert |

## 3. Aufbewahrungs- und Löschmatrix (vorbereitet)

| Datenklasse | Tabelle | Aufbewahrung | Löschregel |
|-------------|---------|--------------|-----------|
| Globale Quellendefinition | `catalog_sources` | dauerhaft (öffentliche Referenz) | Zustand `archived` statt Löschung (Historie/Nachvollzieh.) |
| Technische Gesundheit | `catalog_source_health` | Snapshot; Quelle: 90 Tage Telemetrie | mit Telemetrie-Retention (bestehend) |
| Audit/Herkunft | `catalog_source_audit` | dauerhaft (append-only) | keine (Nachvollziehbarkeit) |
| Mandanten-Relevanz/Korrektur | `tenant_source_relevance/overrides` | Laufzeit des Mandats | Kaskade bei Mandats-Löschung (`tenant_id`) |
| Private Kundenquellen | `tenant_private_sources` | Laufzeit des Mandats | Kaskade bei Mandats-Löschung; auf Anforderung sofort |

Die bestehenden DSGVO-Endpunkte (`/api/privacy/export`, `/api/privacy/delete`) werden um die drei
`tenant_*`-Tabellen erweitert, sobald die Migration freigegeben ist — jede über `tenant_id`
eindeutig einem Mandanten zuordenbar (Export/Löschung vollständig).

## 4. Externe APIs / Auftragsverarbeitung

- Sprint 3 aktiviert **keine** externe, kostenpflichtige oder neue Auftragsverarbeiter-API. Der
  Suchanbieter (Google News) ist bereits im Bestand und bleibt reine Discovery-/Rückfallebene.
- Vor Aktivierung einer neuen externen API ist verbindlich zu prüfen: Vertrag, Datenstandort,
  Unterauftragnehmer, AVV/DPA. Referenz für den Bestand: `docs/recht/datenfluss-dienstleister-avv.md`,
  `docs/dsgvo-checklist.md`. Der Master-Katalog fügt diesem Prüfpunkt nichts Neues hinzu, dokumentiert
  ihn aber je Quelle über `license_status`/`privacy_status` (Freigabe erst nach `legally_checked`).

## 5. Datenminimierung — technische Absicherung

- `validateSourceRecord()` erzwingt: verbotene PII-Felder → Fehler; private E-Mail/Telefon in
  Freitextfeldern → Fehler; Rollen-Mailboxen (`presse@`, `info@`, `redaktion@` …) erlaubt.
- Alle 107 Seed-Quellen sind PII-frei (Test „kein Seed-Record enthält personenbezogene Kontaktdaten").
- `responsible` trägt ausschließlich **Regel-IDs oder Rollen** (`regel:master-seed-sprint3`,
  `regel:kritische-pflichtquelle`) — nie eine Privatperson.
