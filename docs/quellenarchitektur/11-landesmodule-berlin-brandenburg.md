# 11 — Landesmodule Berlin & Brandenburg (Quellenkandidaten)

**Stand:** 2026-07-13 · **Sprint 9** · **Status: `prepared` (vorbereitet, NICHTS aktiviert)**

Diese Doku beschreibt die recherchierten Quellenkandidaten für die beiden nächsten
Landesmodule **Berlin** und **Brandenburg**. Sie sind **ausschließlich als Vorschläge
(`prepared`)** angelegt — es ist **kein** Abrufweg erzeugt, **kein** Crawl verdrahtet,
**nichts** aktiviert. Aktivierung ist ein späterer, ausdrücklich **freigabepflichtiger**
Schritt.

Datenquelle im Code: `lib/helmut/quellenarchitektur/seeds/landesmodule-kandidaten.js`.

---

## 1. Ehrlichkeitsvorbehalt (Recherche-Grundlage)

- **URLs sind per WebSearch belegt, aber in dieser Umgebung NICHT byte-genau abrufbar:**
  Der Egress-Proxy blockt deutsche Gov-/Medien-Domains (403). Jeder Kandidat trägt
  daher `verifyBeforeActivation: true` — **vor Aktivierung byte-genau prüfen**.
- **Aus CMS-Mustern abgeleitete Feed-Pfade** (TYPO3 `feed.rss`, WordPress `/feed/`,
  Brandenburg `bbo_rss`) sind Kandidatenpfade, keine bestätigten Endpunkte.
- **Bot-Abwehr:** `parlament-berlin.de` und `landtag.brandenburg.de` blocken generische
  Bots (403) → realistischer User-Agent nötig (operatives Abrufrisiko, kein Blocker).
- Es werden **keine erfundenen Kennzahlen** angegeben: `cost` ist „offen" bzw. der real
  bekannte Paywall-Zustand; Ergiebigkeit wird erst nach Aktivierung gemessen.

---

## 2. Geprüfte Quellenklassen (15 Pflichtklassen je Land)

Beide Länder decken **alle 15 Landesmodul-Pflichtklassen** ab (Single Source:
`seeds/packages.js` → `LANDESMODUL_PFLICHTKLASSEN`):

| # | Klasse | Berlin (Herausgeber) | Brandenburg (Herausgeber) |
|---|--------|----------------------|---------------------------|
| 1 | `landesparlament` | Abgeordnetenhaus Berlin (RSS) | Landtag Brandenburg (RSS) |
| 2 | `plenum` | Abgeordnetenhaus — Open-Data-XML | Landtag — parldok-XML |
| 3 | `ausschuesse` | Abgeordnetenhaus (RSS je Ausschuss) | Landtag (RSS je Ausschuss) |
| 4 | `drucksachen` | PARDOK Open-Data-XML | parldok `exportWP1.xml` |
| 5 | `schriftliche_anfragen` | Typfilter der PARDOK-XML | Typfilter der parldok-XML |
| 6 | `gesetzgebung` | Vorgangstyp der PARDOK-XML | Vorgangstyp der parldok-XML |
| 7 | `landesregierung` | Landespressedienst berlin.de | `landesregierung-brandenburg.de` (bbo_rss) |
| 8 | `staatskanzlei` | Senatskanzlei/RBm (Institutionsfilter) | Staatskanzlei `stk.brandenburg.de` |
| 9 | `ministerien` | Senatsverwaltungen (Institutionsfilter) | Ministerien (bbo_rss je Haus) |
| 10 | `landesfraktionen` | Fraktionen im AGH (je Feed) | **nur SPD/AfD/BSW/CDU** (8. WP) |
| 11 | `regionale_leitmedien` | Tagesspiegel u.a. (RSS-Metadaten) | MAZ/LR — **googlenews** (Paywall) |
| 12 | `oer_landesberichterstattung` | rbb24 Politik-Feed | **rbb24 — gleicher Feed** (dedup) |
| 13 | `partei_pilot` | Die Linke Berlin | Die Linke Brandenburg |
| 14 | `fraktion_pilot` | Linksfraktion Berlin (AGH) | **SPD-Fraktion** (Ausweich) |
| 15 | `person_pilot` | Tobias Schulze (MdA, Linke) | **Björn Lüttmann** (MdL, SPD, Ausweich) |

---

## 3. Empfehlungslage

| | Berlin | Brandenburg |
|---|--------|-------------|
| Klassen abgedeckt | 15/15 | 15/15 |
| **empfohlen** | **13** | **11** |
| **mit_einschränkung** | **2** | **4** |
| abgelehnt (siehe §5) | — | — |
| aktiviert | **0** | **0** |
| Methoden | überwiegend RSS + Open-Data-XML | überwiegend RSS + Open-Data-XML |

**Berlin — mit_einschränkung (2):**
- `schriftliche_anfragen` — Typfilter der Drucksachen-XML, nicht als zweite Rohquelle
  (sonst Doppelzählung).
- `regionale_leitmedien` — RSS-Metadaten frei, Volltext hinter Paywall; googlenews als Fallback.

**Brandenburg — mit_einschränkung (4):**
- `schriftliche_anfragen` — wie Berlin (Typfilter, nicht doppelt crawlen).
- `regionale_leitmedien` — MAZ+ Paywall + **kein** öffentlicher RSS → nur googlenews_search.
- `fraktion_pilot` — **Ausweich SPD** statt Die Linke (Linke ohne Landtagsfraktion, siehe §4).
- `person_pilot` — **Ausweich SPD-MdL** (kein Die-Linke-MdL verfügbar).

---

## 4. Brandenburg-Sonderfall: Pilot-Linie „Die Linke" (8. Wahlperiode)

Die Bundes-Pilotlinie folgt **Die Linke**. In Brandenburg gilt:

- **Die Linke (Partei) existiert** und hat eine Landespresse → `partei_pilot` bleibt
  sauber bei **Die Linke Brandenburg** (`empfohlen`).
- **Die Linke hat in der 8. WP KEINE Landtagsfraktion** (im Landtag sitzen nur
  **SPD, AfD, BSW, CDU**). Deshalb:
  - `landesfraktionen` nennt ausdrücklich **nur SPD/AfD/BSW/CDU**.
  - `fraktion_pilot` weicht auf die **Regierungsfraktion SPD** aus (`mit_einschränkung`).
  - `person_pilot` weicht auf **Björn Lüttmann** (SPD-Fraktionsvorsitzender) aus
    (`mit_einschränkung`).
- Eine „aktive Linksfraktion Brandenburg" wäre eine **falsche Aktivierung** → ausdrücklich
  **abgelehnt** (§5).

Berlin bleibt konsistent: Die Linke sitzt im Abgeordnetenhaus (24 MdA) → `partei_pilot`,
`fraktion_pilot` (Linksfraktion) und `person_pilot` (Tobias Schulze) alle bei Die Linke.

---

## 5. Abgelehnte Kandidaten (mit Grund)

| Land | Klasse | Abgelehnter Kandidat | Grund |
|------|--------|----------------------|-------|
| Brandenburg | `regionale_leitmedien` | MAZ `maz-online.de` als Direkt-RSS | Kein öffentlicher RSS + harte MAZ+-Paywall → googlenews_search als Ersatz. |
| Brandenburg | `fraktion_pilot` | `linksfraktion-brandenburg.de` als aktiver Pilot | Die Linke ist in der 8. WP **nicht im Landtag** — keine aktive Fraktion. |
| Berlin | `gesetzgebung` | `gesetze.berlin.de` / `gvbl-berlin.de` als eigener Feed | Kein RSS, nur HTML/PDF-DB → hoher Scrape-Aufwand; über Open-Data-Vorgangstyp abbilden. |
| Brandenburg | `gesetzgebung` | `bravors.brandenburg.de` als eigener Feed | Kein RSS (StarWeb/HTML) → über parldok-Vorgangstyp; BRAVORS nur ergänzend. |
| beide | `schriftliche_anfragen` | schriftliche Anfragen als zweite Rohquelle | Typgefilterte Teilmenge der Drucksachen-XML → separates Crawlen = Doppelzählung. |

---

## 6. Dedup- und Überschneidungshinweise

Für die globale Referenzzählung (`model.js`) relevant, damit dieselbe Rohquelle nicht
doppelt gecrawlt/gezählt wird:

1. **rbb24-Politik-Feed ist identisch für Berlin und Brandenburg** (rbb = Rundfunk
   Berlin-Brandenburg) → **eine Fundstelle, zwei Paketreferenzen**, nicht doppelt crawlen.
2. Innerhalb eines Landes speisen sich **Klassen 4–6** (Drucksachen/Anfragen/Gesetzgebung)
   aus **einer** Open-Data-XML → eine Rohquelle, typbasierte Klassenzuordnung.
3. `landesregierung ⊃ staatskanzlei ⊃ ministerien` laufen über **einen** Landespressedienst
   (Berlin) bzw. **ein** bbo_rss-Aggregat (Brandenburg) → Institutionsfilter, Rohabruf einmalig.

---

## 7. Was NICHT passiert ist (Sicherheitsrahmen)

- **Keine** Production-Migration, **keine** Production-Datenänderung, **keine** RLS-Änderung.
- **Keine** Quellenaktivierung, **kein** Cron, **kein** Deployment.
- **Kein** Abrufweg (`retrieval_path`) erzeugt, **kein** Publisher/Geography in die DB geschrieben.
- Alle Kandidaten liegen als **reine Seed-Daten** (`prepared`) im Code — `candidateSummary().aktiviert === 0`.

## 8. Freigabepflichtige Folgeschritte (später)

1. **Byte-genaue Verifikation** jeder URL/jedes Feed-Pfads (außerhalb des Egress-Blocks).
2. Anlegen der Publisher/Geographies/Retrieval-Paths je Land als DB-Einträge.
3. Aktivierung der Landespakete `berlin`/`brandenburg` (Paketstatus → `active`).
4. Cron/Crawl-Verdrahtung und erste Ergiebigkeitsmessung (Watchdog Sprint 7).
