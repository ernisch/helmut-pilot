# Helmut — Readiness-Urteil (Stand 2026-07-12, nach Umsetzungssprint)

Kurz & einfach aus Gründerperspektive. „Bereit" heißt: sicher betreibbar **und**
liefert echten Nutzen, ohne dass etwas Wichtiges kaputt oder unsicher ist.

Begriffe in einem Satz:
- **RLS (Row Level Security):** die Datenbank selbst verhindert, dass Kunde A die
  Daten von Kunde B sieht — unabhängig von App-Fehlern.
- **service_role / JWT-Modus:** heute spricht die App die DB mit einem
  „Generalschlüssel" (service_role) an, der RLS umgeht. Erst wenn der JWT-Modus
  an ist, greift RLS pro Mandant. Er ist bewusst noch **aus**.
- **KO-Anreicherung / Backfill:** vorhandene Vorgänge nachträglich mit
  Themen-Stichworten anreichern — kostet KI und schreibt in Production.

---

## 1. Einzelpilot (cem-ince) — ✅ **BEREIT**

- **Sicherheit:** App-seitiger Mandanten-Guard aktiv (P0-1); zusätzlich seit heute
  **RLS als zweite Verteidigungslinie in Production** (P0-2, 23 Policies) — als
  No-Op eingespielt, greift scharf, sobald der JWT-Modus aktiviert wird. Für einen
  einzelnen Piloten besteht **kein Cross-Tenant-Risiko**.
- **Nutzen/Personalisierung:** deutlich verbessert. Die sichtbaren Entscheidungen
  des Piloten stiegen live von **1 auf 16**, die belegten Direktlinks von **59 auf
  103** — durch Label-Normalisierung (Ausschuss/Partei) und das erweiterte
  Scan-Fenster. Kein erfundener Inhalt, alles belegt.
- **Verlässlichkeit:** Watchdog meldet jetzt den **echten** Zustand (kein
  Fehlalarm „Pipeline aus" mehr, kein falsches Grün); die Lage-Karten verschwinden
  nicht mehr durch ein KI-Timeout beim App-Start.
- **Rest (kein Blocker für den Piloten):** die Themen-Dimension ist erst voll
  wirksam nach KO-Anreicherung (Backfill, Freigabepunkt); die Quellenbasis ist
  noch dünn (strukturell, P2-5).

**Fazit:** Der Pilot kann sicher und mit spürbar besserem Ergebnis weiterlaufen.

## 2. Mehrere Mandanten (2+) — 🟡 **TECHNISCH MÖGLICH, ABER ERST NACH 2 SCHRITTEN**

Was bereits da ist: die komplette Mandantentrennung ist **gebaut und getestet**
(App-Guard + RLS-Policies + JWT-Signierung), und im isolierten Test konnte Kunde A
Kunde B in **keinem** Fall sehen.

Was noch fehlt, bevor ein zweiter echter Mandant sicher dazu kommt:
1. **JWT-Modus aktivieren** (`HELMUT_TENANT_JWT_MODE=1`) — erst dann erzwingt die
   DB die Trennung wirklich (heute schützt nur die App-Schicht). Eigener
   Freigabepunkt; der Schalter gilt global (kein Per-Mandant-Rollout gebaut).
2. **Profildaten in die DB** (P2-9): reiche Profildaten liegen heute nur im Code
   für cem-ince; jeder andere Mandant bekommt leere Default-Merkmale und wäre ab
   Tag 1 unterversorgt. Ohne KO-Anreicherung (P1-1) matchen auch gute Profile ins
   Leere.

**Fazit:** Der Sicherheits-Grundstein steht. Für echten Mehrmandantenbetrieb
zuerst JWT-Modus aktivieren **und** Profilversorgung/KO-Anreicherung lösen.

## 3. Bezahlte SaaS-Kunden — ❌ **NOCH NICHT**

Der größte Blocker (fehlende DB-seitige Mandantentrennung) ist **beseitigt** — das
war P0. Für zahlende Kunden fehlt aber noch Produktreife:
- **Self-Service-Onboarding/Provisioning** (P3-7) — es gibt keinen Weg, dass sich
  ein Kunde selbst anlegt und konfiguriert.
- **KI-Kosten fail-closed + pro-Mandant-Deckel** (P2-2) — sonst offenes
  Kostenrisiko bei mehreren Kunden.
- **Profilversorgung in der DB** (P2-9) + **KO-Anreicherung/Backfill** (P1-1/P1-3)
  — für belastbare Personalisierung über den Piloten hinaus.
- **Quellenabdeckung** (P2-5: Landtage, mehr Politikfelder) — heute stark auf
  Bundestag/Arbeit&Soziales konzentriert.
- **Demo-Profile aus Prod entfernen** (P2-10), **Cron-Reihenfolge** (P1-9).

**Fazit:** Sicherheitsfundament steht, Produktreife für zahlende Mandanten fehlt
noch. Realistisch ist der nächste sinnvolle Meilenstein ein **zweiter,
kontrollierter Pilot-Mandant** (nach JWT-Aktivierung + Profilversorgung), nicht
sofort offener SaaS-Verkauf.

---

## Nächster echter Freigabepunkt

**`HELMUT_TENANT_JWT_MODE=1`** (Umstellung des DB-Zugriffs auf die
`authenticated`-Rolle, damit RLS pro Mandant wirklich greift). Erst danach ist ein
zweiter Mandant sicher. Alles bis hierher (RLS-Migration, Watchdog, App-Start,
Matching, Radar) ist **reversibel** und ohne Verhaltensrisiko für den laufenden
Piloten ausgerollt.

Weitere Freigabepunkte (unabhängig, je eigener Umfang/Kosten-Bericht davor):
KO-Anreicherung-Backfill (P1-1, KI-Kosten), Presentation-Backfill (P1-3),
Cron-Reihenfolge (P1-9), KI-Budget-Deckel (P2-2).
