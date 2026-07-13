# Sprint 9 — Abschlussbericht (Quellenrecherche Berlin & Brandenburg)

**Stand:** 2026-07-13 · **Branch:** `claude/helmut-source-architecture-ruhyvb` ·
**Modus:** ausschließlich sichere, reversible, additive Arbeiten — **reine Seed-Daten**,
**keine** Production-Migration, keine Production-Datenänderung, **keine Quellenaktivierung**,
**kein Cron**, **kein Deployment**.

> Enthält die beiden verbindlichen Nachkorrekturen: **(1)** SPD-Ausweich in Brandenburg
> entfernt, **(2)** Reifegrad-Modell (Kandidat ≠ einsatzbereit) in Seed/Admin.

## 1. Korrektur 1 — kein Ersatz-Pilot in Brandenburg
- `fraktion_pilot` und `person_pilot` sind **unbesetzt** (`readiness: "unbesetzt"`, kein
  Publisher/URL). Ein fehlender echter Pilot wird **nicht** durch eine andere Partei/Person ersetzt.
- **Bleibt bestehen:** `partei_pilot` = Die Linke Brandenburg (Partei darf beobachtet werden);
  `landesfraktionen` nennt die realen Landtagsfraktionen **SPD/AfD/BSW/CDU** (allgemeines Paket).
- Der frühere SPD-Ausweich (SPD-Fraktion / Björn Lüttmann) steht jetzt in der **Ablehnungsliste**.

## 2. Korrektur 2 — Reifegrad-Modell (Kandidat ≠ einsatzbereit)
Geordnete Skala je Klasse: `unbesetzt < kandidat < verifiziert < bereit < aktiv`.
- Heutiger Bestand: **28 Kandidat**, **0 verifiziert**, **0 bereit**, **0 aktiv**, **2 unbesetzt**.
- Berlin/Brandenburg sind **Kandidaten-abgedeckt, aber nicht einsatzbereit** (Egress-Block
  verhindert byte-genaue Verifikation).
- Sichtbar gemacht in Seed (`readinessByGeography`), Admin-Report (`views.laenderPakete[].readiness`
  + `counts.kandidatKlassen/einsatzbereiteKlassen/unbesetzteKlassen`) und Client (Reifegrad-Badges
  „X Kandidat · 0 einsatzbereit", Hinweis „noch nicht technisch verifiziert").

## 3. Geprüfte Quellenklassen
Beide Module enthalten **alle 15 Pflichtklassen**. **Kandidatenabdeckung: Berlin 15/15,
Brandenburg 13/15** (2 Pilotklassen bewusst unbesetzt). Klassen: landesparlament, plenum,
ausschuesse, drucksachen, schriftliche_anfragen, gesetzgebung, landesregierung, staatskanzlei,
ministerien, landesfraktionen, regionale_leitmedien, oer_landesberichterstattung, partei_pilot,
fraktion_pilot, person_pilot.

## 4. Empfohlene Kandidaten
- **Berlin: 13 empfohlen** + 2 mit_einschränkung. Rückgrat: Abgeordnetenhaus-RSS +
  PARDOK-Open-Data-XML, Landespressedienst, rbb24, Die-Linke-Pilotlinie (Partei/Linksfraktion/
  Tobias Schulze).
- **Brandenburg: 11 empfohlen** + 2 mit_einschränkung. Rückgrat: Landtag-RSS + parldok
  `exportWP1.xml`, bbo_rss-Aggregat, rbb24, Die Linke (nur Partei-Pilot).
- Methoden überwiegend **RSS + Open-Data-XML** (nicht scrape-lastig).

## 5. Abgelehnte Kandidaten (mit Grund)
1. **MAZ als Direkt-RSS** — kein Feed + Paywall → googlenews.
2. **SPD-Fraktion als BB-Pilot-Ersatz** — kein Partei-Ersatz → fraktion_pilot unbesetzt.
3. **Björn Lüttmann (SPD) als BB-Pilot-Person** — kein Personen-Ersatz → person_pilot unbesetzt.
4. **Linksfraktion Brandenburg als aktive Fraktion** — Die Linke nicht im Landtag (8. WP).
5. **`gesetze.berlin.de`/GVBl als eigener Feed** — kein RSS → Open-Data-Vorgangstyp.
6. **BRAVORS als eigener Feed** — kein RSS → parldok-Vorgangstyp.
7. **Schriftliche Anfragen als zweite Rohquelle** — Doppelzählung → als Filter.

## 6. Ehrlichkeit / Recherche-Vorbehalt
- URLs **per WebSearch belegt**, nicht byte-genau abrufbar (Egress-Block, 403). Jeder
  besetzte Kandidat: `verifyBeforeActivation: true`. Unbesetzte: `verifyBeforeActivation: false`.
- **Keine erfundenen Kennzahlen:** `cost` = „offen"/Paywall-Zustand; Ergiebigkeit erst nach Aktivierung.

## 7. Dedup-Hinweise
1. **rbb24-Feed identisch** für Berlin/Brandenburg → eine Fundstelle, zwei Paketreferenzen.
2. Klassen 4–6 aus **einer** Open-Data-XML je Land.
3. `landesregierung ⊃ staatskanzlei ⊃ ministerien` über **einen** Pressedienst je Land.

## 8. Tests — alle grün
- **`test:landesmodule-kandidaten` 50/50** (Klassenabdeckung, Reifegrad, Korrektur 1
  „kein Partei-/Personen-Ersatz", Ehrlichkeit, rbb-Dedup, abgelehnte Kandidaten, Empfehlungslage
  + Härtungen: `klassenFehlend`-Invariante, unbesetzt method/cost null, robuster SPD-/Personen-Guard,
  `hoechsteStufe`-Grenzfall, kein `unknown`-Reifegrad).
- **`test:admin-source-report` 54/54** (+ Reifegrad-Block: Berlin 15 Kandidat/0 einsatzbereit,
  Brandenburg 13/2 unbesetzt, ohne Rollup readiness `available:false`).
- **`test:admin-source-ui` 29/29** (+ Reifegrad-Darstellung, unbesetzte Pilotklassen,
  „kein Ersatz durch fremde Partei/Person").
- **Keine Regression:** source-architecture 88, profile-packages 57, quality-watchdog 65, scoring 73.

## 8a. Adversarialer Review (2 unabhängige Reviewer) — Befunde behoben
Beide Reviewer bestätigten die Korrekturen als belastbar (kein High/Medium-Bug). Behobene
Niedrig-/Latenz-Befunde:
- `readinessRollup`: unbekannter/fehlender Reifegrad wird jetzt als `unknown` gezählt statt still
  als `kandidat` (Datenfehler sichtbar, Abdeckung nicht geschönt).
- `landReadiness.hoechsteStufe`: bei leerem/komplett unbesetztem Land ehrlich `unbesetzt` statt `kandidat`.
- Abdeckungs-Zähler nutzt jetzt **distinct** `klassenAbgedeckt` (Set-basiert) statt Eintragszahl —
  eine künftige Mehrfachbelegung einer Klasse kann so nie „16/15" ergeben.
- Admin-Report normalisiert die Rollup-Zahlen defensiv (`Number||0`) → nie „undefined" im Client.
- Test-Härtung (siehe §8): tautologische Prüfung entfernt, Guards robuster, fehlende Invarianten ergänzt.

## 9. Branch & Commit
- **Branch:** `claude/helmut-source-architecture-ruhyvb`
- **Geändert/neu:** `seeds/landesmodule-kandidaten.js`, `admin-report.js`, `server.js`, `client.js`,
  `scripts/landesmodule-kandidaten-test.js`, `admin-source-report-test.js`, `admin-source-ui-test.js`,
  `docs/quellenarchitektur/11-…md`, dieser Bericht.
- **Commit:** siehe Push (Sprint-9-Korrektur-Commit).

## 10. Offene Risiken
- **Byte-genaue Verifikation ausstehend** (Egress-Block) → Reifegrad bleibt `kandidat`.
- **Paywall-Klassen** (`regionale_leitmedien`): nur Metadaten via googlenews.
- **Bot-403** bei Parlamentsseiten → realistischer User-Agent beim späteren Crawl.
- **2 Brandenburg-Pilotklassen unbesetzt** — bleiben offen, bis ein echtes Pilotprofil feststeht
  (bewusst kein Ersatz).

## 11. Freigabepflichtige Folgeschritte (NICHT ausgeführt)
Verifikation außerhalb des Egress-Blocks (→ `verifiziert`) → Publisher/Geography/Retrieval-Paths
anlegen → Freigabe (→ `bereit`) → Aktivierung + Cron/Crawl (→ `aktiv`). **Alles freigabepflichtig.**
