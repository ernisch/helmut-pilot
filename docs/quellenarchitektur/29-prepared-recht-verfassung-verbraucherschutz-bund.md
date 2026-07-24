# PREPARED-Paket: `recht-verfassung-und-verbraucherschutz-bund`

**Status:** `prepared` · vollständig inaktiv · freigabepflichtig · **nichts aktiviert**
**Analog zu:** Landesmodul-PREPARED-Doku (Sprint 9B) und den freigegebenen Fachpaketen.
**Erzeugt:** `lib/helmut/quellenarchitektur/seeds/recht-verfassung-verbraucherschutz.js`
→ `scripts/generate-recht-verfassung-verbraucherschutz-seed.js`
→ `supabase/seeds/20260724_recht_verfassung_verbraucherschutz_bund_seed(.rollback).sql`
**Test:** `scripts/recht-verfassung-verbraucherschutz-test.js` (87 Assertions, offline, auto-discovered).

---

## 1 · Fachlicher Scope

Rechts-, verfassungs- und verbraucherpolitische **Bundesebene**. Kompaktes Signal-Paket
für einen politischen KI-Stabschef — **kein Flächenmonitoring**.

- **Recht/Justiz:** Verfassungs-, Grundrechts-, Staatsorganisationsrecht; Zivil-, Straf-,
  Straf-/Zivilprozessrecht; Familien- (rechtspolitisch), Miet-, Insolvenz-, Gesellschaftsrecht
  (soweit BMJV-zuständig); digitale Justiz, Gerichtsmodernisierung, Zugang zum Recht,
  juristische Berufe, Rechtsdienstleistungen, Opferschutz, internationale Rechtshilfe (Bundesbezug).
- **Verbraucherpolitik:** Verbraucherrechte/-verträge (auch digital), kollektiver Rechtsschutz,
  Verbands-/Musterfeststellungsklagen, Recht auf Reparatur, Verbraucherbildung/-information,
  Schuldner-/Insolvenzberatung — in BMJV-Zuständigkeit.
- **Datenschutz & Informationsfreiheit:** Stellungnahmen, Tätigkeitsberichte, Empfehlungen,
  Gesetzgebungsbegleitung (gebündelt bei der BfDI).
- **Verfassungsgerichtsbarkeit:** Grundsatzentscheidungen, Organstreit, Normenkontrollen,
  Grundrechte, geplante Entscheidungen/mündliche Verhandlungen (über BVerfG-Pressemitteilungen).

## 2 · Paketgrenzen (bewusst NICHT aufgenommen)

Polizei/Verfassungsschutz/Nachrichtendienste/Terrorismus, Migration/Asyl, innere Sicherheit,
Cybersecurity, allgemeine Digital-/Plattform-/KI-Regulierung, reine EU-Rechtssetzung ohne
deutschen Umsetzungsbezug, Kartell-/Wettbewerbs-/Steuerrecht, Finanzmarktaufsicht, allgemeine
Wirtschaftsregulierung, Länderjustiz/Strafvollzug der Länder, reine Fachrechtsprechung ohne
politischen Signalwert, private juristische Fachmedien/Legal-Tech, operative Verbraucherfälle,
Produkttests, einzelne Klage-/Registerfälle ohne politische Bedeutung. Grenzfälle
(Verbraucherschutz Finanzen → BaFin; Energie/Telekom → BNetzA; Lebensmittel → BMEL) gehören
in andere Pakete.

## 3 · Zielarchitektur — 7 Retrieval Paths (5 neu + 2 wiederverwendet)

| # | Retrieval Path | Herausgeber | Methode | Einstiegsseite | Neu/Reuse |
|---|---|---|---|---|---|
| 1 | `rp-bmjv-recht` — Recht, Justiz und Gesetzgebung | BMJV (`bmjv.de`) | html | `…/service/gesetzgebung/gesetzgebungsverfahren/…_node.html` | **neu** |
| 2 | `rp-bmjv-verbraucher` — Verbraucherpolitik | BMJV (`bmjv.de`) | html | `…/Ministerium/Abteilungen/Verbraucherpolitik/…_node.html` | **neu** |
| 3 | `rp-bverfg-presse` — Pressemitteilungen | BVerfG (`bundesverfassungsgericht.de`) | html | `…/DE/Presse/presse_node.html` | **neu** |
| 4 | `rp-bfdi` — Datenschutz + Informationsfreiheit | BfDI (`bfdi.bund.de`) | rss | offizieller RSS-Newsfeed (`rssnewsfeed.xml`) | **neu** |
| 5 | `rp-ausschuss-recht-verbraucherschutz` — Anhörungen/Tagesordnungen | Deutscher Bundestag (`bundestag.de`, **bestehend**) | html | `bundestag.de/recht` | **neu** (Weg), Herausgeber reuse |
| 6 | `rp-dip` — Drucksachen/Vorgänge (Bundestag/Bundesrat) | DIP (`dip.bundestag.de`) | api | DIP-API | **reuse** |
| 7 | `rp-bundesregierung` — Ressortübergreifend | Bundesregierung (`bundesregierung.de`) | rss | Bundesregierung-RSS | **reuse** |

> Sieben gute Wege statt acht mit Rauschen: der optionale **achte** Weg (Bundesamt für Justiz)
> wird bewusst **nicht** angelegt → Future Target (§6).

## 4 · Neue vs. wiederverwendete Komponenten

**Neue Entitäten (3, Institutionen — keine Personen):**
`ministry-bmjv` (Bundesministerium der Justiz und für Verbraucherschutz; Aliase `BMJV`,
`Bundesministerium der Justiz`, `BMJ`), `institution-bverfg` (`other_institution`, Alias `BVerfG`),
`authority-bfdi` (Alias `BfDI`).

**Neue Herausgeber (3):** `publisher-bmjv.de`, `publisher-bundesverfassungsgericht.de`,
`publisher-bfdi.bund.de` — je `official_primary`, `trust=hoch`.

**Neue Abrufwege (5):** siehe Tabelle §3, Zeilen 1–5 — **alle** `needs_review` + `manual` +
`is_critical=false`.

**Wiederverwendet (nicht dupliziert, nur via `package_paths` verknüpft, nicht verändert):**
- Herausgeber: `publisher-bundestag.de` (trägt den Ausschuss-Weg), `publisher-dip.bundestag.de`,
  `publisher-bundesregierung.de`.
- Entitäten: `committee-bt-recht` (Ausschuss), `parliament-bundestag`, `government-bund`.
- Wege: `rp-dip`, `rp-bundesregierung`.

## 5 · Fachliche Modellierungsentscheidungen (Korrekturen K1–K7)

- **K1 BMJV-Historie:** genau **eine** Ministeriums-Entity für die aktuelle Institution
  („…der Justiz und für Verbraucherschutz", seit 21. WP wieder mit Verbraucherschutz — nicht
  durchgehend seit 2021). Historische Namen `BMJ` / „Bundesministerium der Justiz" nur als **Alias**.
- **K2 Institutionen statt Amtsinhaber:** keine Person in Seed/Architektur — insbesondere bei
  der BfDI keine Amtsinhaberin, kein Nachfolger, kein Personenwechsel als Strukturmerkmal.
- **K3 BfDI gebündelt:** **ein** Weg über den offiziellen RSS-Newsfeed bündelt Pressemitteilungen,
  Stellungnahmen, Tätigkeitsberichte, Datenschutz **und** Informationsfreiheit — kein separater
  IFG-/Berichtspfad, keine Berichtsjahre hardcodiert.
- **K4 Bundesamt für Justiz:** **nicht** aufgenommen → Future Target (Begründung §6).
- **K5 EGMR:** falls je Future Target → **Europarat**, nicht EU.
- **K6 BVerfG:** **ein** Weg, Schwerpunkt Pressemitteilungen (kann Termine/mündliche
  Verhandlungen/Jahresberichte mit abdecken); **keine** Volltext-Entscheidungsdatenbank,
  kein Urteils-Massenabruf.
- **K7 Keine aktuellen Vorhaben/Amtsinhaber/Drucksachennummern/Jahreszahlen** in der Architektur —
  langlebig. Aktuelle Vorhaben dienten nur der Scope-Verifikation (§Verifikation).

**BMJV-Trennung (§9):** zwei Wege auf **einer** Domain, fachlich sauber differenziert
(Gesetzgebungsverfahren vs. Abteilung Verbraucherpolitik) — kein zweiter Herausgeber.

**Ausschuss (§9):** eigener Weg für Anhörungen/Tagesordnungen/Stellungnahmen gerechtfertigt;
Drucksachen deckt DIP ab → **kein** paralleler Drucksachenweg. Der bereits global in `bund-basis`
liegende Google-News-Rechtsthemenweg `rp-committee-recht` wird **nicht** zusätzlich verknüpft
(keine Dublette; er liefert Themen-Rauschen, nicht die amtlichen Ausschussaktivitäten).

## 6 · Verworfene Kandidaten & Future Targets

| Kandidat | Einordnung | Begründung |
|---|---|---|
| **Bundesamt für Justiz** (BfJ) | **Future Target** | Verbandsklageregister = operative Registerflut; Verbraucherschlichtungsbericht nur ~alle 4 Jahre → kein enger, regelmäßig signalstarker, rauscharmer Weg (K4/§9). Bedingung für spätere Aufnahme: stabile, filterbare Berichts-Einstiegsseite mit belegbar niedriger Rauschquote. |
| **Bundesgerichtshof** (BGH) | Future Target | Überwiegend Einzelfallrechtsprechung; Aufnahme nur mit Filter auf bundespolitisch relevante Verfahren. |
| **vzbv** | Future Target | Verbandsperspektive, nicht amtlich; bei regelmäßig signalstarken Stellungnahmen. |
| **Antidiskriminierungsstelle des Bundes** | Future Target | Begrenzter Themenfokus; bei Mandatsausweitung. |
| **EGMR** | Future Target | **Europarat** (nicht EU); bei Grundsatzentscheidungen mit Deutschlandbezug. |
| **EuGH / EDSA** | Future Target | EU-Ebene; nur mit deutschem Umsetzungsbezug. |
| Bundesrat (Rechtsausschuss) | verworfen | Über DIP (Bundesratsdrucksachen) abgedeckt → kein eigener Weg. |
| Bundesverwaltungs-/Arbeits-/Sozial-/Finanzgericht | verworfen | Geringer bundespolitischer Signalwert. |
| Stiftung Warentest, BVL, BaFin, BNetzA, Bundeskartellamt | verworfen | Operativ/produktbezogen bzw. anderes Ressort/Paket. |

## 7 · Technische Verifikationspunkte

Verifiziert (Websuche; Direktabruf per WebFetch teils durch WAF geblockt → siehe Risiken):
- **BMJV** offizielle Domain `www.bmjv.de`; Gesetzgebungsverfahren-Übersicht und Abteilung
  Verbraucherpolitik als stabile Sektionsseiten (URLs aus verifizierten Suchtreffern).
- **BVerfG** `www.bundesverfassungsgericht.de`, Presse-Übersicht `…/DE/Presse/presse_node.html`;
  zusätzlich existiert `…/Aktuelles/TermineWochenausblick/…` (Termine/Wochenausblick).
- **BfDI** `www.bfdi.bund.de`, **offizieller RSS-Newsfeed** `…/RSSFeed/Allgemein/rssnewsfeed.xml`
  (verifiziert) → rauscharmer, maschinell erfassbarer Weg.
- **Ausschuss** offizielle Kurz-URL `bundestag.de/recht` (21. WP, „Ausschuss für Recht und
  Verbraucherschutz").
- **DIP/Bundesregierung** bereits produktiv (bestehende Wege).

Geprüft je Weg: offizielle Domain, stabile Einstiegsseite, bestehender Publisher/Entity,
URL-/Domain-Kollision (keine), Methode/Parser, Rausch-/Aktualisierungserwartung, Wiederverwendung.
**Keine URLs/Feeds/APIs erfunden; keine instabilen Einzel-PDFs als Retrieval Path.**

## 8 · Aktivierungsrisiken

- **WAF/Bot-Schutz:** `bmjv.de`, `bundesverfassungsgericht.de`, `bfdi.bund.de` lieferten bei
  Direktabruf HTTP 403 → beim Scharfschalten Fetch-Strategie/Header prüfen; ggf. Google-News-
  `site:`-Ersatzweg als Fallback (bestehende Architektur unterstützt das).
- **HTML-Stabilität:** die vier HTML-Wege hängen an CMS-Listenseiten (Bund-Standard-CMS) —
  Parser-Selektoren vor Aktivierung an der Live-Struktur bestätigen. Die genaue rauschärmste
  BMJV-Sub-URL (Gesetzgebungsverfahren vs. Presse/Meldungen) am Gate final festlegen.
- **BfDI-RSS-Feed-ID:** `nn=253102`-Parameter am Gate gegen den Live-Feed verifizieren.
- **Rauschquote Ausschuss:** `bundestag.de/recht` kann Navigations-/Bestandselemente enthalten →
  auf Anhörungen/Tagesordnungen filtern.

## 9 · Aktivierungsgate (freigabepflichtig)

Nicht Teil dieses Auftrags. Vor Aktivierung: (1) Seed anwenden (`…_seed.sql`), (2) HTML-Selektoren/
RSS-Feed live bestätigen, (3) Paket `prepared → active` **nur** nach Freigabe, (4) neue Wege
`needs_review → healthy` + `activation_mode` nach Bedarf, (5) Profil-Mapping separat. Erst dann
greift die Referenzzählung (`computeGlobalActivation`).

## 10 · Rollback (referenzsicher)

`…_seed_rollback.sql`: Kinder vor Eltern (`path_expected_*` → `package_paths` **dieses** Pakets →
neue `retrieval_paths` → Paket → guarded Publisher → guarded Entities). Wiederverwendete Wege
`rp-dip`/`rp-bundesregierung` werden **nie** gelöscht; nur ihre Verknüpfung zu diesem Paket fällt
weg. Publisher/Entities werden nur gelöscht, wenn keine weitere Referenz existiert (Cascade-Schutz
für geteilte Objekte). Rein additiv → risikofrei.

## 11 · Bestätigung: nichts aktiviert

- Paket `prepared`, `is_base=false` → `computeGlobalActivation` aktiviert es nicht.
- Alle 5 neuen Wege `needs_review` + `manual` + `is_critical=false` → **0** Auto-Crawl.
- Keine Migration ausgeführt, keine SQL gegen Production, kein Deployment, kein Merge, kein PR,
  kein Profil-Mapping, kein aktiver Crawl, keine Cron-/Pipeline-/Lock-/Telemetrie-Änderung.
- Bestehende globale Wege/Seeds unverändert; keine bestehende ID/Domain/Alias-Dublette.
- Offline-Suite grün (inkl. neuer Paket-Test, auto-discovered).
