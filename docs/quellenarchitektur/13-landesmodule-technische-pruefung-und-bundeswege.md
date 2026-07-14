# 13 — Landesmodule Berlin/Brandenburg: technische Prüfung, vorbereitete Struktur, Bundeswege-Reparaturen

**Stand:** 2026-07-13 · **Sprint 9 (Vertiefung)** · **Status: `prepared` / technisch INAKTIV**

Diese Doku vertieft die Sprint-9-Kandidaten (Doc 11) um die **technische Quellenprüfung**, die
**strukturierte Vorbereitung** (Herausgeber/Abrufwege/Paketzuordnungen/Ebenen/Geografien) und
die **Reparatur der 6 defekten Bundes-Abrufwege**. Recherchebasis: WebSearch (direkter Abruf
deutscher Gov-/Medien-Domains 403-geblockt) — **jede URL vor Aktivierung byte-genau verifizieren**.

**Nichts aktiviert:** kein Crawl, keine Flags, kein Cron, kein Deployment. Berlin/Brandenburg
bleiben `prepared` und technisch inaktiv.

---

## 1. Technische Prüfung je Klasse (Kriterien)

Jeder besetzte Kandidat trägt jetzt: **Aktualität**, **stabileAdresse** (kanonischer Deep-Link
vs. Landing/Hub), **Abrufmethode**, **parserEffort**, **duplicateRisk**, **evidenceRole**
(Quellenrolle), **produktnutzen** — plus aktualisierte **recommendation**.

**Empfehlungslage nach technischer Prüfung** (ehrlicher als die Erst-Recherche):

| | Berlin | Brandenburg |
|---|--------|-------------|
| besetzt | 15 | 13 |
| **empfohlen** | **8** | **7** |
| **mit_einschränkung** | **7** | **6** |
| **unbesetzt** | 0 | 2 |

**Zentrale URL-Korrekturen (echte Datenfehler behoben):**
- **Brandenburg Open-Data:** `exportWP1.xml` → **`exportWP8.xml`**. `exportWP[N].xml` folgt der
  Wahlperiode; WP1 = **1990–1994**. Die laufende **8. WP (2024–2029)** liegt unter `exportWP8.xml`.
- **Berlin Open-Data:** Landingpage → Download-Deep-Link **`parlament-berlin.de/opendata/pardok-wp19.xml`**
  (PARDOK-XML mit eigener DTD, **kein** OParl — OParl war nur angekündigt).
- **Berlin Presse (7/8/9):** **`berlin.de/presse/pressemitteilungen/index/feed[?institutions[]=…]`**
  (LPD-Gesamtfeed mit Institutionsfilter) statt `/presse/` bzw. `/sen/` (letzteres ist ein Verzeichnis).
- **Berlin partei_pilot:** Domain **`dielinke.berlin` ohne www**; **fraktion_pilot** Deep-Link `…/feed.rss`.

**Neue abgelehnte Kandidaten (technische Sackgassen):** `berlin.de/sen/` als Feed;
`parlament-berlin.de/das-parlament/fraktionen` als RSS (ist Landing); OParl (nicht live);
`exportWP1.xml` als laufende WP. Insgesamt **11 abgelehnte** Kandidaten dokumentiert.

**Duplikat-Cluster (belegt):** Berlin PARDOK-XML speist 2/4/5/6; LPD-Feed speist 7/8/9;
Brandenburg parldok-XML speist 2/4/5/6; bbo_rss-Aggregat speist 7/8/9; **rbb24 ist für Berlin
UND Brandenburg identisch** (Zwei-Länder-Sender). Berlin person_pilot (Tobias Schulze,
Fraktionsvorsitzender) ⊂ fraktion_pilot.

---

## 2. Vorbereitete Struktur (`seeds/landesmodule-quellen.js`)

`buildLandesmodulSeed()` formt die geprüften Kandidaten **dedup-bewusst** in das relationale
Modell — ausschließlich **vorbereitet**:

| Kennzahl | Wert |
|----------|------|
| Herausgeber (publishers) | 14 |
| neue Landes-Entitäten | 4 (party-linke-berlin, group-agh-linke, person-tobias-schulze, party-linke-brandenburg) |
| Abrufwege (retrieval_paths) | **19** (dedup aus 28 besetzten Kandidaten) |
| davon kritisch (Pflicht-Primärquelle) | 10 |
| Paketzuordnungen (package_paths) | 20 (Berlin 10 + Brandenburg 10) |
| politische Ebene / Geografie | `land` / geo-land-berlin bzw. -brandenburg je Weg |
| **aktive Abrufwege** | **0** |

**Technische Inaktivität doppelt gesichert:**
- Jeder Abrufweg: `status = "needs_review"` (nicht healthy/active), `activation_mode = "manual"`
  (nie auto/always_on) → wird **nie automatisch gecrawlt**.
- Landespakete `berlin-basis`/`brandenburg-basis` bleiben `prepared` → `computeGlobalActivation`
  aktiviert sie nicht.
- Der Live-Crawl nutzt ohnehin `v1Sources`, nicht diese Struktur.

**Dedup umgesetzt:** rbb24 = **ein** globaler Abrufweg mit **zwei** Paketreferenzen;
Berlin-PARDOK = **ein** Abrufweg, der 4 Klassen abdeckt (`covers`).

> **Anwendung auf Production ist ein eigener, freigabepflichtiger Schritt** (wie die
> Bund-Migration). Dieses Modul erzeugt nur das In-Memory-Abbild; es schreibt nichts in die DB.

---

## 3. Reparatur der 6 defekten Bundes-Abrufwege (`seeds/bundeswege-reparaturen.js`)

> **Überholt durch Sprint 9B (echter Test in 3 Runden, siehe Doc 14):** Endstand **6/6 repariert**,
> **4/4 kritische gelöst** (`alleKritischGeloest = true`). `bundestag`/`linksfraktion` als
> Direktfeed; `bundesregierung`/`die-linke`/`ausschuss`/`dgb` als klar abgegrenzter
> googlenews-Ersatz, weil der jeweilige Direktweg real 404/HTML/bot-gesperrt war (Bot-Sperren
> nicht umgangen). Die untenstehende Recherche-Tabelle bleibt als Ausgangslage stehen.

**Recherche-Ausgangslage (vor 9B-Realtest): 5 reparierbar, 1 Ersatzweg, 0 dauerhaft defekt** (keine stille
Archivierung, Auftrag §30):

| Weg (kritisch?) | Ist-Diagnose | Reparatur / Ersatz | Methode | Bewertung |
|-----------------|--------------|--------------------|---------|-----------|
| **bundestag** ⚠ | `/rss`→`/services/rss/`; XML unter `/static/appdata/includes/rss/` | `…/static/appdata/includes/rss/pressemitteilungen.rss` (+ DIP-API) | rss | reparierbar |
| **bundesregierung** ⚠ | Pfad umgezogen (`/service/newsletter-und-abos/rss-newsfeed`) | `…/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/RSS_Breg_aktuell/RSSNewsfeed.xml` | rss | reparierbar |
| **die-linke** ⚠ | TYPO3-Relaunch, `rss.xml`→404 | `die-linke.de/start/presse/feed.rss` | rss | reparierbar |
| **linksfraktion** ⚠ | `dielinkebt.de` korrekt (seit 25.02.2025 wieder Fraktion); `rss.xml`→404; **linksfraktion.de veraltet** | `dielinkebt.de/presse/pressemitteilungen/feed.rss` | rss | reparierbar |
| ausschuss-arbeit-soziales | Seite lebt, Scrape/DOM gebrochen (Neukonstituierung 21. WP), kein Feed | googlenews `site:bundestag.de "Ausschuss für Arbeit und Soziales"` bzw. DIP-API | googlenews_search | ersatzweg_noetig |
| dgb | Startseiten-Scrape + Relaunch; offizielle Feeds vorhanden | `dgb.de/presse/pressemitteilungen/` (aus `dgb.de/unsere-rss-feeds/` / OPML) | rss | reparierbar |

Jede reparierte URL ist `verifyBeforeActivation: true`; **angewendet = 0** (reine Dokumentation).

---

## 4. Offene Risiken

- **Byte-genaue Verifikation ausstehend** (Egress-Block): alle URLs vor Aktivierung auf HTTP 200
  + valides RSS/XML prüfen (statt HTML-Fehlerseite).
- **Bot-403** bei parlament-berlin.de / landtag.brandenburg.de → realistischer User-Agent nötig.
- **Wahlperioden-Nummer** in den Open-Data-URLs (`pardok-wp19.xml`, `exportWP8.xml`) ist an die
  laufende WP gebunden — Berlin wählt regulär 2026, vor/nach Wahl auf `wp20` prüfen.
- **mit_einschränkung-Klassen:** Landing→Deep-Link je Fraktion/Ausschuss noch zu fixieren;
  Paywall (Tagesspiegel Plus, MAZ+) → nur Metadaten; rbb24 cross-modul deduplizieren.
- **Brandenburg fraktion_pilot/person_pilot** bleiben unbesetzt (Die Linke 8. WP unter 5%).
- **Anwendung auf Production** (BE/BB-Seed, Bundeswege-Reparaturen) = eigener freigabepflichtiger Schritt.
