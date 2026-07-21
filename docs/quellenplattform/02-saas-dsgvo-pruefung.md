# SaaS- und Datenschutz-Prüfung (Aufgabe 7)

Prüfung der 12 SaaS-/DSGVO-Punkte gegen die konsolidierte Quellenplattform. Beleg = Test bzw. Modul.

| # | Anforderung | Erfüllt durch | Beleg |
|---|---|---|---|
| 1 | Globale Quellen werden nur einmal gespeichert | Master-Katalog `catalog_sources` (unique `canonical_key`); Laufzeitobjekt referenziert per ID, nie kopiert | `quellenmodell-test` §12 (gleiche IDs für beide Mandanten; kein Duplikat) |
| 2 | Globale Gesundheit gilt für alle Mandanten | `health-model` ist tenant-unabhängig (kein tenant-Parameter); global aus Telemetrie | `gesundheit-qualitaet-test` (gleiche Quelle → gleiche Gesundheit) |
| 3 | Relevanz wird pro Mandat berechnet | `supply-plan`/`assignment` berechnen Relevanz je Mandat zur Laufzeit; Relevanz ist **nicht** Teil der globalen Quelle | `zuweisung-versorgung-test` §3/§4 |
| 4 | Private Quellen strikt nach tenant_id getrennt | `tenant-scope.resolveTenantSources` nimmt private Quellen nur mit eigener `tenant_id` auf; `runtime-source`-Invariante: privat ⇒ tenant_id | `tenant-dsgvo-test` §13 |
| 5 | Private Quellen erscheinen nie bei anderen Mandanten | Kandidatenfilter im Plan + `assertPrivateIsolation` (zweite Verteidigungslinie) | `tenant-dsgvo-test` §13 (A sieht nie B; `isolated: true`) |
| 6 | Keine unnötigen personenbezogenen Daten | `source-record` erzwingt Datenminimierung; `responsible` = Regel/Rolle, nie Privatperson | `tenant-dsgvo-test` §19 |
| 7 | Keine privaten Kontaktdaten | `scanForPrivatePii` erkennt private E-Mails/Telefon/verbotene Felder; Rollen-Postfächer erlaubt | `tenant-dsgvo-test` §19 |
| 8 | Logs ohne unnötige Namen/E-Mails/Rohprofile | Versorgungsplan enthält keinen Klarnamen/kein Rohprofil (nur IDs/Kriterien) | `tenant-dsgvo-test` §19 (Plan-JSON ohne Klarnamen) |
| 9 | Manuelle Korrekturen nachvollziehbar | `tenant-scope` Overrides (pin/mute/boost/demote/replace) + `catalog_source_audit` (append-only) | S3 `tenant-scope`/Migration |
| 10 | Löschung/Archivierung vorbereitet | Importzustände `superseded`/`archived`; Gesundheit `disabled`/`quarantined`; Rollback-Migration | S3 `model` INTAKE_STATES; prepared Rollback |
| 11 | Externe Anbieter austauschbar | Suchanbieter ist eigener technischer Typ (Discovery/Rückfall), nie alleinige Versorgung; Abrufweg getrennt vom Inhalt | `zuweisung-versorgung-test` §16 |
| 12 | Kein Pilot-Sonderfall | Zuweisung ist datengetrieben; Quellcode-Scan der konsolidierten Module ohne Pilot-/Partei-Literale | `tenant-dsgvo-test` §18 |

## Trennung globale vs. mandantenspezifische Belange (verbindlich)

| Belang | Ort | Sichtbarkeit |
|---|---|---|
| Quellendefinition (Herausgeber/Abrufweg/Klassifikation/Herkunft/Prüfstatus) | `catalog_*` | global, mandantenneutral, **keine** tenant_id |
| Technische Gesundheit | `catalog_source_health` / `health-model` | global |
| Mandatsrelevanz | Laufzeit (`supply-plan`) | pro Mandat berechnet, nicht gespeichert |
| Mandantenspezifische Relevanz/Korrektur | `tenant_source_relevance` / `tenant_source_overrides` | tenant, RLS |
| Private Quelle | `tenant_private_sources` | tenant, RLS, nie fremd sichtbar |

**Wichtig:** Mandantenspezifische Relevanz gehört **nicht** in den Gesundheitsstatus (Aufgabe 5) —
Gesundheit ist rein global-technisch. RLS-Regeln (`helmut_current_tenant()`) und die prepared Migration
bleiben **unverändert und nicht ausgeführt**.
