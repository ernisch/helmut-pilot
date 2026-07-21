# Sprint 4 — Shadow-Betrieb der konsolidierten Quellenplattform · Abschlussbericht

**Branch:** `architecture/quellenplattform-shadow-sprint4`
**Basis:** `architecture/quellenplattform-konsolidierung` @ `d6c7ff1`
**Stand:** 2026-07-21
**Charakter:** rein additiver, dormanter **Shadow-Betrieb** — Legacy bleibt allein sichtbar und
entscheidend; die konsolidierte Plattform berechnet parallel ein rein internes Vergleichsergebnis.
Keine automatische Aktivierung, kein Deployment, keine Migration, kein Merge nach `main`, kein PR.

---

## 0. Preflight (verbindlich, bestanden)

1. **Richtige Basis:** `git merge-base --is-ancestor architecture/quellenplattform-konsolidierung HEAD` = **true**;
   HEAD `d6c7ff1` == Konsolidierungs-HEAD. ✓
2. **Alle 154 Suiten vorhanden:** `run-offline-tests.js --list` = **154**. ✓
3. **Alle 154 grün vor Beginn:** `run-offline-tests.js` = **154/154 grün**. ✓

---

## 1. Methodenehrlichkeit & Sicherheitsrahmen (entscheidend)

Diese Arbeitsumgebung hat **keinen Netz-/Produktions-DB-Zugriff** (Egress-Block). Die Sicherheitsregel
lautet: produktive Daten dürfen **nur** über einen bereits vorhandenen, sicheren, mandantengetrennten
Lesepfad gelesen werden; wären dafür neue Zugriffe/Secrets/Freigaben nötig, ist zu stoppen und zu fragen.

Konsequenz, sauber eingehalten:
- **Realer Katalog:** der globale Master-Quellenkatalog liegt als **in-repo Seed** vor (Sprint 3,
  deterministisch, keine Produktions-DB) → er wird real gelesen.
- **Reale Mandatsprofile, reale Gesundheits-/Qualitätstelemetrie, realer Tenant-Bestand** liegen in
  Produktionstabellen (`mandate_profiles`, `source_crawl_telemetry`, …), erreichbar nur über einen
  DB-Lesepfad, der hier **nicht existiert**. Deshalb wird **kein** Produktions-Read versucht. Die
  Adapter sind so gebaut, dass sie einen solchen Lesepfad **konsumieren** würden; fehlt er, bleibt die
  Datenlage **ehrlich `unbekannt`** (keine erfundenen Fallbackwerte).
- Der Shadow-Betrieb wird deshalb gegen **(A) den realen in-repo Katalog-Seed** und **(B) einen
  repräsentativen, gut getaggten Fixture-Katalog + injizierte Gesundheitstelemetrie** ausgeführt.

> **Offene Freigabe-Frage (bewusst nicht überschritten):** Das Anschließen an **reale Mandatsprofile
> und reale Betriebstelemetrie** benötigt einen ausdrücklich freigegebenen, mandantengetrennten
> Produktions-Lesepfad (Zugriff/Secrets). Der ist hier nicht vorhanden — dieser Schritt wartet auf eine
> Entscheidung. Alles Übrige (die vollständige Maschinerie + Tests + interner Bericht) ist erbracht.

**Eingehaltene Sicherheitsregeln:** kein Deployment · keine Migration · keine Produktionsdaten verändert ·
keine Crawls/Crons/Locks/Auth/RLS verändert · kein sichtbares Verhalten verändert · kein automatischer
Wechsel · kein Merge nach `main` · kein PR. Alle Live-Dateien byte-identisch zum Konsolidierungsstand.

---

## 2. Aufgabe 1 — übernommene Dark-Launch-Muster (nur Muster, kein Cherry-Pick)

Aus `claude/dark-launch-quellenplattform-s8ge3a` wurden **ausschließlich Muster** neu implementiert —
auf den **konsolidierten** Modellen, **nicht** dessen parallele Gesundheits-/Qualitäts-/Quellenmodelle:

| Übernommenes Muster | Umsetzung (neu, auf konsolidierter Basis) |
|---|---|
| Shadow-Vergleich (Legacy ∥ Neu, nur Legacy sichtbar) | `shadow-run.js` / `shadow-compare.js` |
| Abbruchregeln (`autoActivateNewAllowed` strukturell false) | `shadow-compare.js:evaluateAbortRules` (11 Bedingungen) |
| PII-freie Telemetrie (Allowlist + Selbstprüfung) | `shadow-telemetry.js` |
| Interne Admin-Darstellung (Read-Model, keine UI) | `shadow-report.js` |
| Deterministische Tests | 8 neue Offline-Suiten |

**Nicht übernommen (verboten):** die Dark-Launch-eigene 13-Dimensionen-Health/Quality/Coverage-Logik
und der Bezug auf das Legacy-`profile-packages`-Modell als „neuer Plan". Strukturell abgesichert:
`shadow-sicherheit-test.js` prüft, dass die Shadow-Schicht die **konsolidierten** Modelle nutzt und den
Dark-Launch **nicht** importiert.

---

## 3. Die Shadow-Maschinerie (additiv, dormant)

| Datei | Aufgabe |
|---|---|
| `shadow-adapter.js` | Aufgabe 2 — Read-Only-Adapter (Mandat, Katalog, Legacy-Pakete, Gesundheit, Qualität, Tenant); Lücken bleiben sichtbar, keine Fallbacks. |
| `shadow-run.js` | Aufgabe 3 — parallele Berechnung: Legacy-Versorgung (sichtbar) + neuer Laufzeitplan mit allen **11** Pflichtfeldern. |
| `shadow-compare.js` | Aufgabe 5 + 6 — **18**-Dimensionen-Vergleich (jede Differenz mit Ursache) + **11** Abbruchregeln. |
| `shadow-telemetry.js` | Aufgabe 7 — PII-freie Telemetrie (Allowlist, anonymisierte Referenzen, Zurückweisung verbotener Felder). |
| `shadow-report.js` | Aufgabe 8 — interner, reproduzierbarer Bericht (14 Punkte + Invarianten). |
| `shadow.js` | Fassade: Kontext, Batch, Determinismus- + Tenant-Verdrahtung. |

Alle top-level unter `quellenarchitektur/` (CI-Syntax-Glob abgedeckt), nirgends im Live-Pfad verdrahtet,
ohne Netz/KI/Storage-Write.

---

## 4. Interner Bericht (reproduzierbar)

Erzeugt über die 14 repräsentativen Mandate (Aufgabe 4). **Zwei Läufe** machen den Unterschied zwischen
Maschinerie-Reife und Katalog-Befüllung sichtbar:

### (A) Gegen den realen in-repo Master-Katalog-Seed (heute, ungetaggt)
- besser **0** · gleichwertig **0** · schlechter **0** · **blockiert 14**
- Ø Suchanbieter-Abhängigkeit **0,857** · Mandate mit Suchanbieter-Alleinversorgung **12**
- größte Lücken: `parties:spd` (9), `factions:spd` (5), `regions:berlin` (4), diverse Regionen/Parteien
- rechtlich ungeprüfte Quellen: **0** · technische Defekte: **0** (mangels Health-Daten ehrlich offen)
- **Befund:** der reale Katalog ist für Partei-/Regionaldimensionen **noch nicht getaggt** → jeder
  Pflichtbedarf fällt auf Suchanbieter/Neutralbasis zurück → **alle 14 blockiert**. Das ist genau das
  Befüllungs-Signal für den nächsten Sprint.

### (B) Gegen einen repräsentativen, getaggten Fixture-Katalog + injizierte Gesundheit
- besser **11** · gleichwertig **1** · schlechter **0** · blockiert **2**
- Ø Suchanbieter-Abhängigkeit **0,024** · Mandate mit Suchanbieter-Alleinversorgung **1** (AfD, korrekt geblockt)
- unterversorgt: Partei `neue-zukunftspartei` (kein Paket — generisch, ohne Sonderlogik), Region `berlin`
- **Befund:** ist der Katalog getaggt, liefert die konsolidierte Plattform je Mandat einen vollständigen,
  nachvollziehbaren Versorgungsplan; die verbleibenden Blocker sind **echte** Abdeckungslücken, ehrlich benannt.

**Empfehlung (Aufgabe 8, Punkt 14):**
1. Herausgeber-Wege gegen Suchanbieter-Alleinversorgung der Pflichtbedarfe befüllen (Abbruchregel 3 auflösen).
2. Fach-/Partei-/Regionalquellen für die größten Lücken befüllen (Partei-/Regional-Tagging).
3. Reale Gesundheits-/Qualitätsdaten über einen sicheren, mandantengetrennten Lesepfad anschließen.
4. Aktivierung bleibt separat + freigabepflichtig — **kein** automatischer Wechsel.

---

## 5. Verifikation

- **Neue Offline-Suiten (8):** `shadow-adapter` (10), `shadow-run` (11), `shadow-compare` (8),
  `shadow-abort` (15), `shadow-telemetry` (12), `shadow-report` (10), `shadow-testbestand` (14),
  `shadow-sicherheit` (10) — **alle grün**.
- **Gesamte Offline-Suite:** **162/162 grün** (154 Bestand + 8 neu). Fällt **nicht** unter 154.
- **Syntax-Check:** `node --check` über alle neuen `.js`-Dateien bestanden (alle im CI-Glob).
- **`[NETZ-GUARD]`** zu `pardok-shadow-test.js`: Bestand aus `main`, kein Regress.

---

## 6. Abschluss — die zehn Fragen

1. **Richtige konsolidierte Architektur verwendet?** **Ja.** Der Shadow-Betrieb baut auf `konsolidierung-*`
   (EIN Health-/EIN Quality-Modell, S1-Mandat, S3-Katalog, S2-Auswahl, Paket=Laufzeitplan) und importiert
   den Dark-Launch **nicht** (strukturell getestet).
2. **Welche Dark-Launch-Muster übernommen?** Shadow-Vergleich, Abbruchregeln, PII-freie Telemetrie,
   interne Read-Model-Darstellung, deterministische Tests — **neu implementiert**, keine parallelen Modelle.
3. **Wie viele Mandate verglichen?** **14** repräsentative Mandate, je in **zwei** Katalog-Läufen (A/B).
4. **Wo ist Neu besser?** Bei getaggtem Katalog (B): Ausschussabdeckung, Reduktion der Google-News-Abhängigkeit
   (0,024 statt 0,857), nachvollziehbare Auswahl je Quelle — **11/14 besser**.
5. **Wo ist Neu schlechter?** In **keinem** verglichenen Fall „schlechter" im engeren Sinn (0); wohl aber
   **blockiert**, wo der reale Katalog ungetaggt ist (A: 14/14) bzw. echte Lücken bestehen (B: 2/14).
   Personenbezug (Legacy hat ein personengebundenes Paket) ist eine benannte Übergangslücke.
6. **Welche Parteien/Ausschüsse/Regionen unterversorgt?** Real-Seed: Parteien `spd/gruene/afd/linke/neue-*`,
   Regionen `berlin/bayern/niedersachsen/sachsen/…`; Ausschüsse im Seed abgedeckt. Fixtures: `neue-zukunftspartei`,
   Region `berlin`. Alles ehrlich aus dem Bericht, ohne Sonderlogik.
7. **Tenant-Trennung & DSGVO-Schutz funktionieren?** **Ja.** Globale Quellen per Referenz (nie kopiert,
   100 Mandate → jede Quelle einmal), private Quellen strikt nach Tenant getrennt (A sieht nie B),
   Telemetrie PII-frei (Allowlist + Zurückweisung von Namen/E-Mail/Profilen/Secrets/fremden Tenant-IDs).
8. **Bleibt Legacy bei jedem Fehler allein entscheidend?** **Ja.** `legacyIntact` in jedem Lauf true;
   ein Fehler im neuen Pfad setzt nur `neuError` und lässt Legacy unverändert sichtbar.
9. **Welche Blocker verhindern eine spätere Aktivierung?** Strukturell: `autoActivateNewAllowed` ist
   **immer** false. Fachlich heute: (a) Katalog nicht party-/regional-getaggt → kritische Lücken +
   Suchanbieter-Alleinversorgung; (b) keine reale Gesundheits-/Qualitätsdaten (Produktions-Lesepfad fehlt);
   (c) Personenbezug-Übergangslücke. Jeder ist eine der 11 Abbruchbedingungen.
10. **Bereit für den nächsten Befüllungssprint?** **Ja — die Maschinerie ist bereit und sicher.** Der
    Shadow-Betrieb liefert das Sicherheitsnetz (Vergleich + Abbruch je Mandat). Was fehlt, ist reine
    **Daten**-Arbeit: Katalog-Tagging/-Befüllung und ein freigegebener Produktions-Lesepfad für reale
    Mandats-/Betriebsdaten. Die Aktivierung bleibt eine separate, freigabepflichtige Entscheidung.
