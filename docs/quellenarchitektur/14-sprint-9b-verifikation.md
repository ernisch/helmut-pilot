# 14 — Sprint 9B: technische Verifikation der BE/BB-Abrufwege + Bundes-Reparaturwege

**Stand:** 2026-07-14 · **Sprint 9B (3 Runden)** · **Status: KONVERGIERT — 0 ablehnen, alle Wege real geeignet/mit Einschränkung**

---

## 0. Endergebnis (echt gemessen, GitHub Actions, offener Egress)

Der echte Abruf+Parser-Test wurde auf einem **GitHub-Actions-Runner mit offenem Egress**
durchgeführt (`pull_request`-Trigger, YAML aus PR-Head, **kein** main-Merge, **kein** Deployment).
Nach **3 Korrektur-/Verifikationsrunden** sind **alle** Wege real bestätigt:

- **Finaler Run:** `29297142235`, PR **#72** (Runde 3), 2026-07-14. Kontroll-Abruf 200 → Egress offen. **24/24 real geprüft.**
- Verlauf: R1 (25 Wege, 9✅) → R2 (18 Wege, 18✅) → R3 (letzte 3 Direktfeed-Fehlschläge auf googlenews) → **21✅**.

| Urteil | Anzahl |
|--------|-------:|
| ✅ geeignet | **21** |
| 🟡 geeignet mit Einschränkung | **3** |
| ⛔ ablehnen | **0** |
| ⚪ nicht_verifizierbar | **0** |

Die 3 `mit Einschränkung` sind die **Bot-429-Parteifeeds** (`be-partei_pilot`, `be-fraktion_pilot`,
`bb-partei_pilot`) — server-seitiger Abruf nötig, Bot-Sperre **nicht** umgangen.

**Ehrliche Lehre:** Von den in R2/R3 geratenen echten Direktfeeds hielt real **keiner**
(Berlin RBm-Feed → 404, Brandenburg `bbo_rss` → HTML/404, `bundesregierung` GSB → 404,
`dgb` OPML → HTML). Wo kein stabiler Direktweg existiert, ist der **klar abgegrenzte
Google-News-Ersatz** die belastbare Lösung (jeder googlenews-Weg real geeignet).

---

## 1. Mechanismus (ohne Deployment)

- **Harness** `scripts/sprint9b-verify-abrufwege.js` (echter Abruf + Produktionsparser `crawler.parseRssItems`).
- **Workflow** `.github/workflows/sprint9b-verify.yml` (`workflow_dispatch` + `pull_request`, `contents: read`, keine Secrets).
- **Overlay** `lib/helmut/quellenarchitektur/seeds/landesmodule-verifikation.js` (datierte Ground-Truth je Weg).
- **Loop:** PR öffnen → Runner prüft real → Ergebnis auswerten → Seeds korrigieren → PR-Push re-triggert.

---

## 2. Finale Verifikationstabelle (24 Wege, alle real bestätigt)

### Berlin (10)

| Weg | krit. | Methode | Urteil | Beleg |
|-----|:---:|---------|--------|-------|
| be-landesparlament | ⚠ | googlenews | ✅ geeignet | 20 Items, 23 T (site:parlament-berlin.de) · deckt landesparlament+ausschuesse |
| be-plenum | ⚠ | opendata_xml | ✅ geeignet | 8108 `<Dokument>` · deckt Plenum/Drucksachen/Anfragen/Gesetzgebung |
| be-landesregierung | ⚠ | googlenews | ✅ geeignet | 20 Items, 3 T (Senat site:berlin.de) · deckt landesregierung+ministerien |
| be-staatskanzlei | ⚠ | googlenews | ✅ geeignet | 20 Items, 1 T (Reg. Bürgermeister/Senatskanzlei) — R3-Ersatz |
| be-landesfraktionen | | googlenews | ✅ geeignet | 20 Items, 28 T |
| be-regionale_leitmedien | | rss | ✅ geeignet | 20 Items, 0 T (Tagesspiegel Berlin) |
| rbb24-politik | | rss | ✅ geeignet | 20 Items, 0 T (BE+BB) |
| be-partei_pilot | | rss | 🟡 mit Einschränkung | Bot-429 (Die Linke Berlin) |
| be-fraktion_pilot | | rss | 🟡 mit Einschränkung | Bot-429 (Linksfraktion Berlin) |
| be-person_pilot | | googlenews | ✅ geeignet | 20 Items, 12 T (Tobias Schulze) |

### Brandenburg (8)

| Weg | krit. | Methode | Urteil | Beleg |
|-----|:---:|---------|--------|-------|
| bb-landesparlament | ⚠ | googlenews | ✅ geeignet | 20 Items, 5 T (site:landtag.brandenburg.de) |
| bb-plenum | ⚠ | opendata_xml | ✅ geeignet | 6092 `<Vorgang>` · deckt 4 Klassen |
| bb-ausschuesse | ⚠ | googlenews | ✅ geeignet | 20 Items, 10 T |
| bb-landesregierung | ⚠ | googlenews | ✅ geeignet | 20 Items, 0 T · deckt landesregierung+staatskanzlei — R3-Ersatz |
| bb-ministerien | ⚠ | googlenews | ✅ geeignet | 20 Items, 0 T — R3-Ersatz |
| bb-landesfraktionen | | googlenews | ✅ geeignet | 20 Items, 15 T |
| bb-regionale_leitmedien | | googlenews | ✅ geeignet | 20 Items, 0 T (MAZ) |
| bb-partei_pilot | | rss | 🟡 mit Einschränkung | Bot-429 (Die Linke Brandenburg) |

### Bund — Reparaturwege (6) — alle repariert

| Weg | krit. | Methode | Urteil | Status |
|-----|:---:|---------|--------|--------|
| bundestag | ⚠ | rss | ✅ geeignet | Direktfeed pressemitteilungen.rss → **repariert** |
| bundesregierung | ⚠ | googlenews | ✅ geeignet | GSB-Feed real 404 → googlenews-Ersatz → **repariert** |
| die-linke | ⚠ | googlenews | ✅ geeignet | Direktfeed bot-429 → googlenews-Ersatz → **repariert** |
| linksfraktion | ⚠ | rss | ✅ geeignet | Direktfeed dielinkebt.de feed.rss → **repariert** |
| ausschuss-arbeit-soziales | | googlenews | ✅ geeignet | kein Direktfeed → googlenews-Ersatz → **repariert** |
| dgb | | googlenews | ✅ geeignet | OPML real HTML → googlenews-Ersatz → **repariert** |

**Bundeswege-Bilanz: 6/6 repariert, 4/4 kritische gelöst** (`alleKritischGeloest = true`).

---

## 3. Finale kategorisierte Liste

**✅ geeignet (21):** be-landesparlament, be-plenum, be-landesregierung, be-staatskanzlei,
be-landesfraktionen, be-regionale_leitmedien, rbb24-politik, be-person_pilot, bb-landesparlament,
bb-plenum, bb-ausschuesse, bb-landesregierung, bb-ministerien, bb-landesfraktionen,
bb-regionale_leitmedien, bundestag, bundesregierung, die-linke, linksfraktion,
ausschuss-arbeit-soziales, dgb.

**🟡 geeignet mit Einschränkung (3):** be-partei_pilot, be-fraktion_pilot, bb-partei_pilot
(Bot-429 — server-seitiger Abruf nötig; Direktfeed-Pfad plausibel, nicht umgangen).

**❔ weiterhin ungeklärt: KEINE** (0 nicht_verifizierbar).

**⛔ endgültig ablehnen: KEINE** (0 ablehnen; alle Landing/Hub/404-Wege auf funktionierende
Feeds bzw. googlenews-Ersatz korrigiert).

**🟢 sichere Kandidaten für `prepared` in Production (alle 24):** Alle Wege sind real geeignet
oder geeignet mit Einschränkung und daher sicher als `prepared` (inert: `needs_review` /
`manual` / inaktiv) eintragbar. Klarstellung: der `prepared`-Eintrag ist **inert** und wurde
auf Wunsch **nicht** ausgeführt — er bleibt ein eigener, freigabepflichtiger Schritt. Die
Aktivierung eines Wegs erfordert zusätzlich die Behandlung der Einschränkung (Bot-429 →
server-seitiger Abruf) bzw. den Re-Check kurz vor Live-Gang.

---

## 4. Tests, Commit, offene Risiken

| Test | Ergebnis |
|------|----------|
| `scripts/landesmodule-verifikation-test.js` (Overlay R3 + Konsistenz) | GRÜN |
| `scripts/landesmodule-kandidaten-test.js` (inkl. Bundeswege 6/6 repariert) | **75 PASS / 0 FAIL** |
| `scripts/sprint9b-verify-test.js` (Bewertungslogik + Egress-Schranke) | GRÜN |
| `scripts/source-architecture-test.js` | **88 PASS / 0 FAIL** |

**Offene Risiken:**
- **googlenews-Ersatz = Aggregator, nicht Primärquelle:** liefert journalistische Breite +
  Original-Artikellinks, aber nicht die amtliche Primärquelle. Für kritische Klassen bei Bedarf
  später einen echten Deep-Link nachrüsten (erneut über den Workflow verifizierbar).
- **3 Bot-429-Parteifeeds:** nur mit server-seitigem Abruf/realistischem UA aktivierbar (nicht umgangen).
- **googlenews-Volatilität:** Query-Ausbeute schwankt; vor Aktivierung Re-Check.
- **`prepared`-Eintrag + Aktivierung** = eigene, freigabepflichtige Schritte (noch nicht erfolgt).
