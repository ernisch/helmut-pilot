# 14 — Sprint 9B: technische Verifikation der 19 BE/BB-Abrufwege + 6 Bundes-Reparaturwege

**Stand:** 2026-07-14 · **Sprint 9B** · **Status: ECHT VERIFIZIERT (GitHub Actions, offener Egress)**

---

## 0. Ergebnis (echt gemessen, nichts erfunden)

Der geforderte echte Abruf+Parser-Test **wurde durchgeführt** — nicht in der Sandbox (deren
Egress ist gesperrt: curl UND WebFetch liefern 403 selbst für example.com), sondern auf einem
**GitHub-Actions-Runner mit offenem Egress**, ausgelöst über einen **`pull_request`-Trigger**
(die YAML läuft aus dem PR-Head, **kein** main-Merge, **kein** Deployment).

- **Runs:** GitHub Actions `29294900851` (Erstlauf) + `29295849135` (Re-Run nach URL-Fix), PR **#71**, 2026-07-14.
- **Kontroll-Abruf:** `example.com` / `google.com` = HTTP 200 → Egress **offen**.
- **Real geprüft:** **25 / 25** — im Erstlauf 24/25 (1× TLS-Fehler bei `bb-staatskanzlei`); nach
  dem `www`-Fix (URL-Korrektur) im Re-Run **alle 25** erreicht.

**Urteile (echt, Re-Run):**

| Urteil | Anzahl |
|--------|-------:|
| ✅ geeignet | **9** |
| 🟡 geeignet mit Einschränkung | **5** |
| ⛔ ablehnen | **11** |
| ⚪ nicht_verifizierbar | **0** |

Die Recherche-Kandidaten haben sich damit teils **bestätigt**, teils **widerlegt** — inklusive
einer WebSearch-„Bestätigung", die real ein **404** war (`bundesregierung`). Ground-Truth ist
jetzt der Workflow, nicht die Recherche.

---

## 1. Verifikationsmechanismus (ohne Deployment)

- **Harness** `scripts/sprint9b-verify-abrufwege.js`: echter HTTPS-Abruf der 25 Adressen (Status,
  Redirect-Kette, Content-Type), **echter Produktionsparser** `crawler.parseRssItems`, Urteil
  `geeignet` / `geeignet mit Einschränkung` / `ablehnen`, Egress-Schranke → `nicht_verifizierbar`.
- **Workflow** `.github/workflows/sprint9b-verify.yml`: `workflow_dispatch` **+** `pull_request`
  (paths-scoped), `permissions: contents: read`, **keine** Secrets/Supabase/Deployment. Artefakte:
  JSON-Report + Markdown-Summary.
- **Overlay** `lib/helmut/quellenarchitektur/seeds/landesmodule-verifikation.js`: die echten
  Urteile als **datierte Ground-Truth** (LIVE_URTEILE je Weg, mit Beleg).

---

## 2. Verifikationstabelle (25 Wege, echt)

### Berlin (10)

| Weg | krit. | Urteil | HTTP | Beleg |
|-----|:---:|--------|:----:|-------|
| be-landesparlament | ⚠ | ⛔ ablehnen | 200 | text/html — `/service/rss-feeds` ist Hub, kein Feed |
| be-plenum | ⚠ | ✅ geeignet | 200 | **8108 `<Dokument>`** (PARDOK WP19) |
| be-landesregierung | ⚠ | ⛔ ablehnen | 200 | rss+xml, aber **0 Items** (Basis-Feed ohne `institutions[]` leer) |
| be-staatskanzlei | ⚠ | 🟡 mit Einschränkung | 200 | 10 Items, aber **1678 Tage alt (2021)** — Institutionsfilter veraltet |
| be-landesfraktionen | | ⛔ ablehnen | 200 | text/html — Landing |
| be-regionale_leitmedien | | ✅ geeignet | 200 | 20 Items, 0 Tage (Tagesspiegel Berlin) |
| rbb24-politik | | ✅ geeignet | 200 | 20 Items, 0 Tage (rbb24, BE+BB) |
| be-partei_pilot | | 🟡 mit Einschränkung | 429 | Bot-Sperre — server-seitiger Abruf nötig |
| be-fraktion_pilot | | 🟡 mit Einschränkung | 429 | Bot-Sperre |
| be-person_pilot | | ✅ geeignet | 200 | 20 Items, 12 Tage (Google News) |

### Brandenburg (9)

| Weg | krit. | Urteil | HTTP | Beleg |
|-----|:---:|--------|:----:|-------|
| bb-landesparlament | ⚠ | ⛔ ablehnen | 200 | text/html — `/rss-infodienste/12411` kein Feed |
| bb-plenum | ⚠ | ✅ geeignet | 200 | **6092 `<Vorgang>`** (parldok **WP8** — WP1→WP8-Korrektur **bestätigt**) |
| bb-ausschuesse | ⚠ | ⛔ ablehnen | 404 | `/de/ausschuesse` → 404 |
| bb-landesregierung | ⚠ | ⛔ ablehnen | 200 | text/html — Root, kein RSS |
| bb-staatskanzlei | ⚠ | ⛔ ablehnen | 200 | `www`-Fix behob **TLS**; `stk.brandenburg.de` leitet auf HTML-CMS (`www.brandenburg.de/…/staatskanzlei`) → kein RSS |
| bb-ministerien | ⚠ | ⛔ ablehnen | 200 | text/html — kein Feed |
| bb-landesfraktionen | | ⛔ ablehnen | 200 | text/html — Landing |
| bb-regionale_leitmedien | | ✅ geeignet | 200 | 20 Items, 0 Tage (Google News MAZ) |
| bb-partei_pilot | | 🟡 mit Einschränkung | 429 | Bot-Sperre |

### Bund — Reparaturwege (6)

| Weg | krit. | Urteil | HTTP | Status |
|-----|:---:|--------|:----:|--------|
| bundestag | ⚠ | ✅ geeignet | 200 | 15 Items, 3 Tage → **repariert** |
| bundesregierung | ⚠ | ⛔ ablehnen | 404 | GSB-URL **falsch** (WebSearch widerlegt) → **reparatur_url_falsch** |
| die-linke | ⚠ | 🟡 mit Einschränkung | 429 | Bot-Sperre → **bot_gesperrt** (noch nicht repariert) |
| linksfraktion | ⚠ | ✅ geeignet | 200 | 15 Items, 0 Tage → **repariert** |
| ausschuss-arbeit-soziales | | ✅ geeignet | 200 | 20 Items, 0 Tage (googlenews-Ersatz) → **repariert** |
| dgb | | ⛔ ablehnen | 200 | HTML statt Feed → **reparatur_url_falsch** (OPML-Deep-Link nötig) |

---

## 3. Bundeswege: ehrliche Reparaturlage (nach echtem Test)

**3 von 6 repariert** (real geeignet), 2 mit falscher URL, 1 bot-gesperrt.

- **repariert (verifiziert):** `bundestag`, `linksfraktion`, `ausschuss-arbeit-soziales`.
- **kritisch offen:** `bundesregierung` (404 — Feed-URL vom RSS-Hub neu holen), `die-linke`
  (429 — server-seitiger Abruf mit realistischem UA, NICHT umgehen).
- **kritische Bilanz: 2/4 repariert** → `alleKritischGeloest = false` (kein Schönen der Lage;
  die frühere „4/4 gelöst"-Aussage der Recherche ist damit korrigiert).

---

## 4. Was ist verifiziert — und was als `prepared` eintragbar

**Real verifiziert (`geeignet`) — 9 Wege, aktivierungsreif nach Freigabe:**
`be-plenum` (deckt Plenum/Drucksachen/Anfragen/Gesetzgebung), `be-regionale_leitmedien`,
`rbb24-politik` (BE+BB), `be-person_pilot`, `bb-plenum` (deckt 4 BB-Klassen),
`bb-regionale_leitmedien`, `bundestag`, `linksfraktion`, `ausschuss-arbeit-soziales`.

**Korrektur-Backlog (`ablehnen` (11) → Feed-Deep-Link/Ersatz vor Aktivierung):**
`be-landesparlament`, `be-landesregierung`, `be-landesfraktionen`, `bb-landesparlament`,
`bb-ausschuesse`, `bb-landesregierung`, `bb-staatskanzlei` (HTML-Redirect, kein RSS),
`bb-ministerien`, `bb-landesfraktionen`, `bundesregierung`, `dgb`.

**Bot-gesperrt (`429`) → server-seitiger Abruf nötig:** `be-partei_pilot`, `be-fraktion_pilot`,
`bb-partei_pilot`, `die-linke`.

**Klarstellung (Reifegrad):** `prepared`-Eintrag = **inert** (needs_review/manual/inaktiv) und
unabhängig vom Urteil risikofrei. Der `prepared`-Eintrag der 19 BE/BB-Wege ist **auf ausdrücklichen
Wunsch NICHT erfolgt** und bleibt ein eigener, freigabepflichtiger Schritt. Die Urteile hier sind
das Gate für die **Aktivierung** (nur `geeignet`/korrigierte Wege).

---

## 5. Tests, Commit, offene Risiken

| Test | Ergebnis |
|------|----------|
| `scripts/landesmodule-verifikation-test.js` (Overlay + Konsistenz gegen Seed-Wege) | GRÜN |
| `scripts/landesmodule-kandidaten-test.js` (inkl. neuer Bundeswege-Bilanz) | **73 PASS / 0 FAIL** |
| `scripts/sprint9b-verify-test.js` (Bewertungslogik + Egress-Schranke) | **39 PASS / 0 FAIL** |
| `scripts/source-architecture-test.js` | **88 PASS / 0 FAIL** |

**Angewandte Korrekturen (Seeds/Tests, KEINE Production-Daten):** `bb-staatskanzlei` URL
`www.` entfernt (TLS); Bundeswege-Status auf echtes Ergebnis (`repariert`/`reparatur_url_falsch`/
`bot_gesperrt`, `alleKritischGeloest=false`); Verifikations-Overlay als datierte Ground-Truth;
Header/Notizen ent-egress-blockiert.

**Offene Risiken / nächste Schleife (nur nach Freigabe):**
- 10 `ablehnen`-Wege brauchen Feed-Deep-Links bzw. googlenews-Ersatz; danach erneut über den
  Workflow verifizieren (PR-Re-Run).
- 4 Bot-429-Wege: nur mit server-seitigem Abruf/realistischem UA verifizierbar (nicht umgehen).
- `be-staatskanzlei`/`be-landesregierung`: LPD-Feed braucht die korrekten `institutions[]`-Filter
  (Basis-Feed leer, Senatskanzlei-Filter liefert veraltete 2021-Items).
- `prepared`-Eintrag BE/BB + Bundeswege-Umschreibung = eigene, freigabepflichtige Schritte.
