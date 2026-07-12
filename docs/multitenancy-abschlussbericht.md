# Mehrmandantenfähigkeit — Abschlussbericht (Stand 2026-07-12)

Kurz und einfach aus Gründerperspektive. Diese Produktphase hat Helmut vom
Einzelpiloten in Richtung „mehrere Kunden" gebracht — sicher, reversibel, getestet.

## 1. Was wurde gebaut?

Sechs klar getrennte, einzeln getestete und gemergte Pakete:

| PR | Inhalt |
|---|---|
| #58 | Profildatenmodell: SQL-Tabelle `mandate_profiles` um 10 Felder ergänzt (Migration, nicht auf Prod angewendet); `getProfile`/`saveProfile` können aus der DB lesen/schreiben (Flag-gesteuert, Default aus) |
| #59 | Zentrale Profilvalidierung: 5 klare Zustände (Vollständig/Teilweise/Nicht bereit/Fehlerhaft/Deaktiviert) mit Funktionsauswirkung |
| #60 | Admin-Profilverwaltung: Profile sehen/bearbeiten/deaktivieren, Vollständigkeit, fehlende Pflichtfelder, KI-Budget pro Profil, Testbriefing |
| #61 | Versorgungsmatrix (13 Testprofile beweisen: unterschiedliche Profile → unterschiedliche Ergebnisse) + deaktivierte Profile aus der Job-Verarbeitung ausgenommen |
| #62 | KI-Budget pro Kunde (Tag/Monat, Warnschwelle, harter Stopp, fail-closed) + Cache-Trennung verifiziert |
| (dieser) | Abschlussbericht |

Zusätzlich: der **JWT-Modus** wurde in Production scharf geschaltet (Secret-Fix durch
den Betreiber), sodass die Datenbank die Mandantentrennung jetzt selbst erzwingt.

## 2. Was ist jetzt besser?

- Die **Datenbank selbst** trennt die Kunden (RLS scharf) — nicht mehr nur der App-Code.
- Es gibt ein **sauberes Profilmodell** in der DB statt Profildaten nur im Code.
- Der Admin sieht auf einen Blick, ob ein Profil **vollständig, dünn versorgt oder leer** ist.
- Jeder Kunde hat ein **eigenes KI-Budget** — einer kann nicht das ganze Budget verbrauchen.
- **Bewiesen getestet:** unterschiedliche Profile bekommen unterschiedliche Ergebnisse.

## 3. Kann ein zweiter Kunde angelegt werden?

**Technisch ja.** Ein Admin kann über die Profilverwaltung ein neues Profil anlegen und
mit den Fachangaben (Partei, Ausschuss, Wahlkreis, Themen) füllen — **ohne Codeänderung**.
Voraussetzung für den *scharfen* DB-Pfad ist einmalig die Aktivierung von
`HELMUT_PROFILE_DB_MODE` (Freigabepunkt, s. u.); bis dahin läuft alles über den bewährten
Blob-Pfad weiter.

## 4. Sind Kundendaten sicher getrennt?

**Ja.** In der Production-Datenbank verifiziert: ohne Nutzerkontext = 0 Zeilen; als Kunde A
= nur A's Zeilen; als fremder Kunde = **0** Zeilen von Cem in allen Tenant-Tabellen. Interne
Systemjobs (Crawl/Understanding) laufen über den Service-Schlüssel unverändert weiter.

## 5. Bekommt jedes Profil eigene Inhalte?

**Ja, bewiesen** (`profile-supply-matrix-test`, 20/20): 13 repräsentative Profile treffen
jeweils ihr Fachfeld; sechs Bundestagsprofile bekommen sechs verschiedene Top-Treffer; keine
Cross-Contamination; leere/unvollständige Profile bekommen nichts Erfundenes.

## 6. Wie wird ein neues Profil angelegt?

Admin-Bereich → Profile → „Nutzer anlegen" (Rolle Abgeordnete:r, Schnellstartfelder) bzw.
pro Profil „Bearbeiten" für die vollen Angaben + KI-Budget. Onboarding-Status und
Aktiv/Inaktiv steuerbar. „Testbriefing" zeigt sofort, ob das Profil Inhalte bekäme.

## 7. Was passiert bei fehlenden Daten?

Das Profil wird **klar als unvollständig angezeigt** (Zustand „Teilweise vollständig" oder
„Nicht bereit", fehlende Pflichtfelder im Klartext). Es wird **nicht** mit geratenen Daten
versorgt — fehlt eine Dimension, feuert sie nicht, statt einen falschen Treffer zu erfinden.

## 8. Wie sind KI-Kosten begrenzt?

Pro Profil ein Tages- und Monatsbudget (in Euro). Ab 80 % Warnung, bei Erreichen harter
Stopp, bei unbekanntem Status fail-closed (lieber stoppen). Der teure geteilte
Understanding-Call bleibt mandantenlos (globaler Deckel) und wird keinem Kunden berechnet.
Backfill hat seinen eigenen 5-€-Deckel.

## 9. Welche Pull Requests wurden gemergt?

#58, #59, #60, #61, #62 (+ dieser Bericht). Alle vollständig getestet, mit Rollback, klar
begrenzt, ohne Production-Gefährdung. Production nach jedem Merge geprüft (keine Runtime-Fehler).

## 10. Welche sichtbaren Änderungen gibt es?

Nur im **Admin-Bereich**: die Profilkarten zeigen jetzt Zustands-Badge, Versorgungssatz,
fehlende Pflichtfelder, KI-Budget und Aktionen (Testbriefing/Bearbeiten/Deaktivieren).
Desktop- und Mobile-Screenshots geliefert. Der Abgeordneten-Bereich ist **unverändert**.

## 11. Welche Tests liefen?

Neu: `profile-db` (44), `profile-validation` (32), `admin-profile-fields` (15),
`profile-supply-matrix` (20), `llm-budget` (22), `cache-isolation` (10). Plus die volle
bestehende Suite (36 Suiten grün). Einziger Rest: 1 vorbestehender splash-boot-Punkt
(Asset-Versions-Tag, unabhängig von dieser Arbeit).

## 12. Wie ist der Production-Status?

Gesund. JWT-Modus scharf, keine Runtime-Fehler, Cem unverändert (19 Entscheidungen, Radar
20/10, Datenmotor 100 %). Der `ready:false`-Status kommt von zwei vorbestehenden
strukturellen Punkten (Lage-Frische, Live-Flow — dünne Quellenlage), **nicht** von dieser Arbeit.

## 13. Was wurde NICHT verändert?

- Keine Production-Profil-Migration (mandate_profiles bleibt leer bis Freigabe).
- Keine Cron-Schedule-Änderung, keine Secret-/Env-Änderung, kein Backfill.
- Kein automatisch angelegtes echtes Nutzerkonto.
- Der Abgeordneten-Bereich (Cems sichtbare App) — inhaltlich unverändert.

## 14. Welcher echte Freigabepunkt ist als Nächstes nötig?

**Production-Datenübernahme für Cem + Aktivierung des DB-Profilpfads** (Phase 15,
`docs/multitenancy-cem-cutover-plan.md`): (a) Migration `20260712_mandate_profile_fields.sql`
auf Production anwenden, (b) Cems Profil einmalig in `mandate_profiles` schreiben,
(c) `HELMUT_PROFILE_DB_MODE=1` setzen. Alles reversibel (Blob bleibt Backup), aber es sind
Production-Writes → **ausdrückliche Freigabe erforderlich**. Optional davor/parallel:
morning-briefing/lage-check auf Multi-Profil-Loop (Cron-Kosten-Entscheidung).

## 15. Ist Helmut bereit für mehrere zahlende Kunden?

**Der Sicherheits- und Modell-Grundstein steht vollständig.** Für einen zweiten,
kontrollierten Kunden fehlt nur noch die Production-Datenübernahme (Freigabepunkt 14) und —
für belastbare Versorgung jenseits von Arbeit & Soziales — mehr Quellentiefe (Landtage,
weitere Politikfelder; separater Ausbau). Für **offenen** SaaS-Verkauf fehlt zusätzlich
Self-Service-Onboarding. Realistischer nächster Meilenstein: **ein zweiter kontrollierter
Kunde** nach der Datenübernahme — nicht sofort offener Verkauf.

---

*Technische Details in: `multitenancy-profildatenkarte.md`, `-profilmodell.md`,
`-profilvalidierung.md`, `-jobs-und-versorgung.md`, `-cache-und-budget.md`,
`-cem-cutover-plan.md`.*
