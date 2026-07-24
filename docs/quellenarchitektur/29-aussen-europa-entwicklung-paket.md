# 29 — Paketmanifest + fachliche Dokumentation: `aussen-europa-und-entwicklung-bund` (prepared)

**Stand:** 2026-07-24 · **Status: VORBEREITET (prepared) — additiv erzeugt, NICHT auf Production angewendet.**
Kein Crawl, keine Aktivierung, kein Profil-Mapping, keine Flags, kein Cron, kein Deployment, kein PR-Merge.

Fachthemenpaket **Außen-, Europa- und Entwicklungspolitik (Bund)** für Helmut (politischer KI-Stabschef).
Ziel: politische Relevanz, frühe Signale, kleine wartbare Quellenarchitektur, maximale Wiederverwendung —
**nicht** möglichst viele Quellen. Artefakte:
`supabase/seeds/20260724_aussen_europa_entwicklung_seed.sql` (+ `_rollback.sql`), generiert von
`scripts/generate-aussen-europa-entwicklung-seed.js` (Modell: `lib/helmut/quellenarchitektur/seeds/aussen-europa-entwicklung-quellen.js`),
Test: `scripts/aussen-europa-entwicklung-seed-test.js` (56/56 grün).

---

## 1. Kanonischer Paketname + Paketdefinition

| Feld | Wert |
|------|------|
| `key` (kanonisch) | **`aussen-europa-und-entwicklung-bund`** (im Repo vorher nicht vorhanden — keine Kollision) |
| `id` | `pkg-aussen-europa-und-entwicklung-bund` |
| `name` | Außen, Europa und Entwicklung (Bund) |
| `status` | **`prepared`** (nicht `active`) |
| `is_base` | **`false`** |
| `political_level` | `bund` |
| `geography_id` | `geo-bund` |
| `required_classes` | `{}` (Fachthemenpaket, keine Landesmodul-Pflichtklassen) |

Dies ist das **erste Fachthemen-Bund-Paket** neben `arbeit-und-soziales`; die im Auftrag genannten
Grenzthemen-Zielpakete (`verteidigung-bund`, `wirtschaft-industrie-und-mittelstand-bund` usw.) existieren
noch **nicht** — sie werden hier nur als Ablageziele referenziert, nicht angelegt.

---

## 2. Zielarchitektur: 7 Abrufwege (5 neu + 2 wiederverwendet)

| # | Weg | Institution | Neu/Wieder | Methode | Einstiegsseite | Signalwert |
|---|-----|-------------|-----------|---------|----------------|-----------|
| 1 | `rp-aa-newsroom` | Auswärtiges Amt | **neu** | html | `auswaertiges-amt.de/de/newsroom/presse` | Sanktionen, Krisen, Erklärungen, Reisen, Berichte |
| 2 | `rp-bmz-aktuelles` | BMZ | **neu** | html | `bmz.de/de/aktuelles/aktuelle-meldungen` | Entwicklungspolitik, EZ, humanitäre Hilfe |
| 3 | `rp-eu-kommission` | Europäische Kommission | **neu** | html | `ec.europa.eu/commission/presscorner/home/en` | EU-Gesetzesinitiativen, EU-Außenpolitik |
| 4 | `rp-eu-rat` | Rat der EU **+ Europäischer Rat** (gebündelt) | **neu** | html | `consilium.europa.eu/en/press/press-releases/` | Sanktionen, Ratsschlussfolgerungen, Gipfel |
| 5 | `rp-eu-parlament-oeil` | Europäisches Parlament — Legislative Observatory | **neu** | html | `oeil.secure.europarl.europa.eu/` | EU-Gesetzgebungsverfahren, deutscher Umsetzungsbedarf |
| 6 | `rp-dip` | Deutscher Bundestag (DIP-API) | **wiederverwendet** | api | `search.dip.bundestag.de/api/v1` | alle parlamentarischen Vorgänge/Drucksachen (inkl. Ausschüsse) |
| 7 | `rp-bundesregierung` | Bundesregierung | **wiederverwendet** | rss | `bundesregierung.de/breg-de/service/rss` | Kabinett, Regierungserklärungen, Gipfel, Kanzlerreisen |

**Kein 8. Weg (bewusst minimal):** ein separater „AA-Berichte/Publikationen"-Weg wird **nicht**
angelegt — Berichte sind über Weg 1 (AA-Newsroom kündigt sie an) + DIP (Unterrichtungen/Drucksachen) +
Bundesregierung/`publikationen-bundesregierung.de` abgedeckt (siehe §5, Korrektur 1/5).

---

## 3. Zeilen-Deltas (additiv) + Sicherheitsinvarianten

Der Seed ist rein additiv. Da §11 DB-Abfragen untersagt und keine Live-DB gelesen wurde, werden **Deltas**
und die zu prüfenden **Invarianten** angegeben (absolute Vorher/Nachher-Zahlen erst beim read-only
Pre-Apply-Snapshot zur Freigabe).

| Tabelle | Δ | Kennzeichnung |
|---------|---:|---------------|
| `source_packages` | **+1** | `prepared`, `is_base=false` |
| `political_entities` | **+5** | `ministry-bmz` + 4 EU-Institutionen |
| `publishers` | **+5** | AA, BMZ, EU-Kommission, Consilium, EP (alle `canonical_domain` neu/unique) |
| `retrieval_paths` | **+5** | alle `status='needs_review'`, `activation_mode='manual'` |
| `package_paths` | **+7** | 5 neue Wege + `rp-dip` + `rp-bundesregierung` |
| `path_expected_levels` | **+7** | AA/BMZ: `bund`+`international`; EU-Wege: `eu` |
| `path_expected_geographies` | **+5** | je neuer Weg `geo-bund` (deutscher Handlungsbezug) |
| `path_expected_topics` | **+21** | Fachthemen (außen/europa/entwicklung) |
| `path_expected_entities` | **+6** | inkl. Bündelung Rat + Europäischer Rat am Weg 4 |

**Invarianten nach dem Insert (read-only zu prüfen):**
- **0** neue Wege mit `status<>'needs_review'` oder `activation_mode<>'manual'` (technisch inaktiv).
- `source_packages.status` für das Paket = **`prepared`**.
- Aktive Wege gesamt **unverändert** (die Zuordnung von `rp-dip`/`rp-bundesregierung` erzeugt keinen neuen
  Crawl — beide sind bereits `always_on` aktiv; ihre Zeilen bleiben byte-identisch).
- Bestehende `package_paths` von `bund-basis` zu `rp-dip`/`rp-bundesregierung` **unverändert**.
- 0 FK-Waisen; `raw_documents`/`knowledge_objects`/`briefings` unverändert (kein Crawl).

---

## 4. Wiederverwendung (keine Dubletten)

| Wiederverwendet | Wie |
|-----------------|-----|
| `rp-dip` (DIP-API) | nur `package_paths`-Verknüpfung — deckt Drucksachen, Unterrichtungen, **Ausschussvorgänge** ab |
| `rp-bundesregierung` | nur `package_paths`-Verknüpfung — Kabinett, Regierungserklärungen, Gipfel, Kanzlerreisen |
| Entity `ministry-auswaertiges-amt` | AA-Herausgeber referenziert die **bestehende** Entity — **keine zweite AA-Entity** |
| Entities `committee-bt-auswaertiges` / `-europa` / `-entwicklung` / `-menschenrechte` | existieren bereits; **keine neuen Ausschuss-Entities**, keine neuen Ausschusswege (DIP deckt ab) |
| Entity `government-bund` (Alias „Bundeskanzleramt"/„Bundeskabinett") | über den Bundesregierung-Weg abgedeckt — **kein neuer Kanzleramt-Weg** |
| Entity `parliament-bundesrat` | über DIP abgedeckt (nur bei europapolitischen Zustimmungsgesetzen relevant) — kein eigener Weg |

**Neu angelegt (minimal, je eine Entität pro realer Institution):**
- Entities: `ministry-bmz`, `eu-commission`, `eu-council-of-the-eu`, `eu-european-council`, `eu-parliament`.
- Herausgeber: `publisher-auswaertiges-amt.de`, `publisher-bmz.de`, `publisher-commission.europa.eu`,
  `publisher-consilium.europa.eu`, `publisher-europarl.europa.eu`.

---

## 5. Umgang mit den geprüften Research-Korrekturen

| Korrektur | Umsetzung |
|-----------|-----------|
| **1 — Humanitäre Hilfe (Bericht 2022–2025)** | **Keine einzelne PDF** als Weg. Abgedeckt über AA-Newsroom (Weg 1) + DIP (Unterrichtung an den Bundestag) + `publikationen-bundesregierung.de` (AA-Herausgeberseite). Kein eigener Berichtsweg nötig. |
| **2 — Europäisches Parlament ≠ DIP** | EP **nicht** durch DIP ersetzt: eigener Weg `rp-eu-parlament-oeil` auf das **Legislative Observatory (OEIL)** + eigene Entity `eu-parliament`. Aufgenommen (Tier-1-tauglich für EU-Gesetzgebung mit deutschem Handlungsbedarf). |
| **3 — Bundeskanzleramt** | **Kein** neuer Kanzleramt-Publisher/-Weg. Gipfel, außenpolitische Grundsatzentscheidungen, Regierungserklärungen, Kanzlerreisen, Kabinettsbeschlüsse sind über den **Bundesregierung-Weg** (`government-bund` trägt Alias „Bundeskanzleramt") abgedeckt. |
| **4 — Bundestagsausschüsse** | Amtliche Kern-Ausschüsse existieren bereits als Entities (Auswärtiger, EU-Angelegenheiten, Wirtschaftliche Zusammenarbeit und Entwicklung; zusätzlich Menschenrechte/humanitäre Hilfe). **Keine** neuen Ausschusswege — DIP deckt Drucksachen/Vorgänge ab. Mitgliederzahlen/Besetzungen **nicht** technisch verankert. |
| **5 — Entwicklungspolitischer Bericht** | Rhythmus **nicht** als „dreijährlich" festgeschrieben (17. Bericht 12/2024); als **legislaturbezogen/unregelmäßig** dokumentiert. Abgedeckt über BMZ-Weg + `publikationen-bundesregierung.de`. |
| **6 — Rüstungsexporte / BMWE** | Rüstungsexportberichte **nicht** im Kern (Grenzthema Wirtschaft/Verteidigung → `wirtschaft-industrie-und-mittelstand-bund` / `verteidigung-bund`). Nur außenpolitische Einzelfallentscheidungen erscheinen ggf. über AA/Bundesregierung/DIP. Kein BMWE-Weg. |

---

## 6. Geprüfte Institutionen (§6) — Entscheidungen

| Institution | Entscheidung |
|-------------|--------------|
| Auswärtiges Amt | **Aufgenommen** (Weg 1). Domain in `sourceSafety.OFFICIAL_DOMAINS`. |
| BMZ | **Aufgenommen** (Weg 2). Domain in `sourceSafety.OFFICIAL_DOMAINS`. |
| Bundesregierung | **Wiederverwendet** (Weg 7). |
| DIP | **Wiederverwendet** (Weg 6). |
| Auswärtiger / EU- / AWZ-Ausschuss | Entities vorhanden; **über DIP abgedeckt**, kein eigener Weg. |
| Bundesrat | Entity vorhanden; über DIP abgedeckt; kein eigener Weg. |
| Europäische Kommission | **Aufgenommen** (Weg 3). |
| Rat der EU + Europäischer Rat | **Aufgenommen, gebündelt** (Weg 4, gemeinsame Domain `consilium.europa.eu`). |
| Europäisches Parlament | **Aufgenommen** (Weg 5, OEIL). |
| Europäischer Auswärtiger Dienst (EAD/EEAS) | **Nicht** aufgenommen (Überschneidung AA + Rat; Future Target). |
| Vereinte Nationen (VN) | **Nicht** aufgenommen (über AA + DIP abgedeckt; Future Target). |
| OECD (DAC) | **Nicht** neu; `publisher-oecd.org` existiert bereits (Arbeit&Soziales), unverändert. Spezialisiert/unregelmäßig → Future Target. |
| NATO | **Nicht** aufgenommen (Grenzbereich Verteidigung; nur außenpolitische Einzelentscheidungen über AA/Bundesregierung). |

**Operative Organisationen (§7):** **GIZ, KfW Entwicklungsbank, Engagement Global** — **nicht** als eigene
Publisher/Wege modelliert. Ihre politisch-strategischen Signale laufen über BMZ/Bundesregierung/DIP; kein
nachgewiesener eigener stabiler Signalwert jenseits des BMZ.

---

## 7. EU-Abgrenzung + Bündelung

- **Rat der EU ↔ Europäischer Rat gebündelt:** eine Domain (`consilium.europa.eu`), ein gemeinsamer
  Presseraum → **ein** Herausgeber + **ein** Weg; die Bündelung ist explizit über
  `path_expected_entities` (beide Entitäten am Weg 4) modelliert.
- **EU-Kommission ↔ Europäisches Parlament abgegrenzt:** Kommission = Initiativrecht/Exekutive/EU-Außenpolitik
  (Presseraum-Weg); EP = demokratische Kontrolle + **Gesetzgebungsverfahren** (OEIL-Verfahrensdatenbank). Zwei
  Institutionen, zwei Herausgeber, zwei Wege, zwei Entitäten.

---

## 8. Technische Verifikation (§10) — ehrliche Trennung

| Kategorie | Status |
|-----------|--------|
| **Bytegenau bestätigt** | **Keine** neue externe URL — Egress war in der Bau-Umgebung für die Zielhosts gesperrt (HTTP **403** auf AA/BMZ/EP; Bot-/WAF- bzw. Egress-Policy). Kein Retry (Proxy-README: 403 nicht umgehen). |
| **Fachlich bestätigt** | Alle 5 neuen Einstiegsseiten (offizielle Domains; AA/BMZ zusätzlich in `sourceSafety.OFFICIAL_DOMAINS`; EU-Domains über WebSearch als offizielle Seiten korroboriert). |
| **Amtlich dokumentierte RSS/API (Upgrade, nicht verdrahtet)** | AA-RSS-Übersicht `…/newsroom/presse/newsletter`; BMZ-RSS `…/service/nl/rss.html`; EU-Kommission Press-corner-RSS-API `ec.europa.eu/commission/presscorner/api/rss`; Rat-RSS-Übersicht `…/about-site/rss/`. **Nicht** technisch gesetzt (bytegenau unbestätigt → keine erfundene Feed-URL, Auftrag §10). |

Deshalb: alle neuen Wege `method='html'` auf die stabile Übersichtsseite. **Vor Aktivierung** ist ein echter
Abruf-/Parser-Lauf über den vorhandenen offenen Egress-Runner (Muster `sprint9b-verify.yml`, reiner
Verifikationslauf, **keine neue CI**) nötig, inkl. Bot-Schutz-Prüfung (AA/BMZ/EU) und Umstellung auf die
amtlichen RSS/API, wo bestätigt.

---

## 9. Sicherheit / Inaktivität

- Alle 5 neuen Wege: `status='needs_review'`, `activation_mode='manual'` → **technisch inaktiv**
  (kein Auto-Crawl; DB-Default `activation_mode='auto'` wird explizit übersteuert).
- Paket `status='prepared'`, `is_base=false` → `computeGlobalActivation` aktiviert es **nicht**.
- **Kein** Profil-Mapping, **kein** aktiver Crawl-Plan, keine Flags/Cron/Migration/Deployment.
- Seed **idempotent** (durchgehend `ON CONFLICT DO NOTHING`), **deterministisch** (reine Codegen),
  Rollback **guarded** (Herausgeber/Entitäten nur bei 0 Referenzen; `package_paths` nur per `package_id` →
  `bund-basis`-Links von `rp-dip`/`rp-bundesregierung` bleiben unberührt; wiederverwendete Wege werden nicht gelöscht).
- **Keine bestehende aktive Quelle verändert**, keine Basis-Seeds regeneriert (das Paket lebt in einem
  **separaten** Seed nach dem etablierten BE/BB-Muster; die Basis-Definitionen in `packages.js`/Basis-Seed
  bleiben unberührt).

---

## 10. Rollback

`supabase/seeds/20260724_aussen_europa_entwicklung_seed_rollback.sql` (eine Transaktion, Kinder vor Eltern):
`path_expected_*` der 5 Weg-IDs → `package_paths` des Pakets (per `package_id`) → 5 `retrieval_paths` →
Paket → Herausgeber (guarded) → Entitäten (guarded). Ergebnis: exakter Ausgangszustand; berührt **keine**
Bundes-/Basis-Wege und **keine** wiederverwendeten Wege.

---

## 11. Verbleibende Risiken vor Aktivierung

1. **Keine bytegenaue URL-/RSS-Verifikation** (Egress 403) — Pre-Aktivierungs-Lauf zwingend.
2. **Bot-/WAF-Schutz** bei AA/BMZ/EU realistisch → ggf. server-seitiger Abruf/RSS nötig.
3. **EU-Mehrsprachigkeit** (Einstiegsseiten teils `/en/`) — deutsche Varianten vor Aktivierung prüfen.
4. **EU-Domains fehlen in `sourceSafety.OFFICIAL_DOMAINS`** — vor Aktivierung additiv ergänzen (separater,
   den Live-Lesepfad berührender Schritt, hier bewusst **nicht** vorgenommen).
5. **OEIL** ist eine Verfahrensdatenbank (kein einfacher Feed) — strukturierter Zugang vor Aktivierung bewerten.

---

## Freigabefrage

Gibst du „Go" für die **prepared**-Eintragung des Pakets `aussen-europa-und-entwicklung-bund` (1 Paket,
5 Entitäten, 5 Herausgeber, 5 inaktive Wege `needs_review`/`manual`, 7 Paketzuordnungen inkl.
Wiederverwendung DIP + Bundesregierung, Ebenen/Geografien/Themen/Entitäten) — technisch inaktiv, ohne
Aktivierung, ohne Profil-Mapping, ohne Crawl, mit vorheriger bytegenauer Verifikation als Aktivierungs-Gate?
