# Quellenpaket GESUNDHEIT (Bund) — Technische Validierung & inaktive Vorbereitung

**Status:** `prepared` (technisch INAKTIV) · **Paket-Key:** `gesundheit-bund` · **Ebene:** Bund
**Sprint-Ergebnis 2026-07-24.** Keine Aktivierung, kein Profil-Mapping, kein Crawl, kein Deployment.

> Dieses Dokument trennt strikt drei Ebenen (Auftrag §2):
> 1. **fachliche Idealarchitektur** (was das Politikfeld braucht),
> 2. **technische Integrationsreife** (Recherche-belegt, aber byte-genau noch offen),
> 3. **tatsächlich jetzt integrierbarer Abrufweg** (was der Seed konkret anlegt).
>
> Die externe Deep-Research war fachliche Longlist/Zielarchitektur, **nicht** technische Wahrheit.
> Maßgeblich sind Repository-Bestand + echte Verifikationsergebnisse.

Einstieg für neue Threads: **`docs/quellenarchitektur/gesundheit-bund-MANIFEST.md`** (kompakt, 1 Seite).
Technisches Protokoll: **`docs/quellenarchitektur/gesundheit-bund-integrationsprotokoll.md`**.

---

## 0. Bestandsmatrix (Auftrag §1)

Vor Neuanlage geprüft: Katalog (`v1Sources`), Publisher-, Entitäts-, Paket-, Retrieval-Path-,
Seed- und Profil-Mapping-Schicht. Ergebnis:

| Fachquelle | Bereits vorhanden? | Bestehender Pfad/Entität | Bestehendes Paket | Entscheidung |
|---|---|---|---|---|
| BMG | **Publisher + Entität** `publisher-bundesgesundheitsministerium.de` / `ministry-bmg`; v1 `news-bundesgesundheitsministerium-pflege` (Pflege) | rp-news-bundesgesundheitsministerium-pflege | bund-basis/arbeit-soziales | **Herausgeber wiederverwenden**, neuer Weg (Gesetzgebung, distinkte Suche) |
| Bundestag Ausschuss Gesundheit | **Entität** `committee-bt-gesundheit`; v1 `committee-gesundheit`; DIP-API `rp-dip` | rp-committee-gesundheit, rp-dip | bund-basis | **Bestand wiederverwenden** (kein neuer Weg) |
| Bundesrat | **Publisher + Entität** `publisher-bundesrat.de` / `parliament-bundesrat` (kein eigener Weg) | — | — | **Herausgeber wiederverwenden**, neuer thematischer Weg |
| Destatis | **Publisher + Entität** `publisher-destatis.de` / `statoffice-destatis`; v1 `news-destatis-soziales` | rp-news-destatis-soziales | arbeit-soziales | **Herausgeber wiederverwenden**, neuer gemeinsamer Datenweg |
| Deutsches Ärzteblatt | **v1** `news-aerzteblatt` (Fachmedium) | rp-news-aerzteblatt | bund-basis | **ausgeschlossen aus Kern** (Fachmedium; Bestand bleibt) |
| RKI | nein | — | — | **neu** |
| G-BA | nein | — | — | **neu** |
| BfArM | nein | — | — | **neu** |
| PEI | nein | — | — | **neu** |
| IQWiG | nein | — | — | **neu** |
| GKV-Spitzenverband | nein | — | — | **neu** |
| KBV | nein | — | — | **neu** |
| DKG | nein | — | — | **neu** |
| Bundesärztekammer | nein | — | — | **neu** |
| Deutscher Pflegerat | nein | — | — | **neu** |
| Sachverständigenrat Gesundheit | nein | — | — | **neu** |

**Wiederverwendet (keine Duplikate):** 3 Herausgeber (BMG, Bundesrat, Destatis) + 3 Entitäten
(`ministry-bmg`, `parliament-bundesrat`, `statoffice-destatis`) + der parlamentarische Prozess
(DIP-API + `committee-bt-gesundheit`).

---

## 1. Fachliche Zielarchitektur (16 Kernquellen)

Vollständige Abdeckung der gesundheitspolitischen Funktionen auf Bundesebene:

| # | Quelle | Funktion | fachliche Belegfunktion (korrigiert, §3) |
|---|---|---|---|
| 1 | BMG — Gesetze/Verordnungen | Gesetzgebung | normative Primärquelle (Ressort) |
| 2 | Bundestag — Ausschuss Gesundheit | Parlamentarischer Prozess | normative Primärquelle (→ Bestand: DIP + Ausschuss) |
| 3 | Bundesrat — Gesundheitsausschuss | Länderbeteiligung | normative Primärquelle (Länderkammer) |
| 4 | G-BA — Beschlüsse/Richtlinien | Selbstverwaltung | normative Primärquelle (verbindliche Richtlinien) |
| 5 | RKI — Epidemiologisches Bulletin | Epidemiologie | amtliche Datenquelle (Bundesoberbehörde) |
| 6 | Destatis — Grunddaten Krankenhäuser | Krankenhaus | amtliche Datenquelle (Vollerhebung) |
| 7 | Destatis — Gesundheitsausgabenrechnung | Finanzierung | amtliche Datenquelle |
| 8 | GKV-Spitzenverband | Kassenposition | **Interessenvertretung** (kein neutraler Beleg) |
| 9 | KBV — PraxisNachrichten | Ärzteposition | **Interessenvertretung** |
| 10 | DKG — Positionspapiere | Krankenhausposition | **Interessenvertretung** |
| 11 | Sachverständigenrat Gesundheit | Reformgutachten | gesetzlich legitimierte Evidenzquelle (§142 SGB V) |
| 12 | BfArM — Lieferengpässe | Arzneimittel | amtliche Zulassungs-/Sicherheitsbehörde |
| 13 | PEI — Chargenprüfung/Sicherheit | Impfstoffe | amtliche Zulassungs-/Sicherheitsbehörde |
| 14 | IQWiG — Nutzenbewertungen | Evidenz | gesetzlich legitimierte Evidenzquelle (§139a SGB V) |
| 15 | Bundesärztekammer | Ärzteschaft | **Interessenvertretung** |
| 16 | Deutscher Pflegerat | Pflege | **Interessenvertretung** |

### Fachliche Korrekturen an der Deep-Research (§3)

- **Primärquellen-Begriff geschärft.** Die Research setzte „Primärquelle: Ja/Nein" grob. Präzisiert:
  *normative Primärquelle* (BMG, Bundestag, Bundesrat, G-BA) ≠ *amtliche Datenquelle* (Destatis, RKI)
  ≠ *gesetzlich legitimierte Evidenz* (IQWiG, SVR) ≠ *Interessenvertretung* (GKV-SV, KBV, DKG, BÄK,
  Pflegerat) ≠ *Fachmedium* (Ärzteblatt, ausgeschlossen). Die eingefrorene Drei-Achsen-Methodik
  wird **nicht** verändert — die Schärfung lebt in `evidence_role` (bestehende Achse).
- **Verbände nicht mit amtlichen Quellen gleichsetzen.** GKV-SV/KBV/DKG erhalten `direct_interest`
  (Akteursposition/Konfliktindikator), nicht `official_primary`. Trotz „★★★★★"-Bewertung der
  Research werden sie nicht amtlich behandelt.
- **Wissenschaftliche Dienste des Bundestages:** **kein** laufender Kern-Crawler. Gutachten
  entstehen auf Anfrage, nicht systematisch publiziert → als **ergänzende Rechercheressource**
  dokumentiert (§Übergangsquellen), kein Abrufweg.
- **Destatis:** zwei Reihen fachlich getrennt bewertet, technisch über **einen** Herausgeber +
  **einen** strukturierten Abrufweg (GENESIS) modelliert (§3 + §7).
- **EU-Quellen (EMA/ECDC/DG SANTE):** als Future Targets erhalten, **nicht** in den deutschen
  Always-on-Kern übernommen.

---

## 2. Tatsächlich technisch integrierte Kandidaten (14 Abrufwege)

Angelegt im standalone-Seed `lib/helmut/quellenarchitektur/seeds/gesundheit-bund-quellen.js`
(→ `supabase/seeds/20260724_gesundheit_bund_seed.sql`). **Alle** Wege: `status=needs_review`,
`activation_mode=manual` → technisch INAKTIV.

| legacy_source_id | Herausgeber | Methode (jetzt integrierbar) | Frequenzklasse | fachlich bevorzugte strukturierte Alternative |
|---|---|---|---|---|
| gesbund-bmg-gesetzgebung | BMG *(reuse)* | googlenews_search `site:` | ereignisnah | BMG RSS-Hub `/service/rss-feed` |
| gesbund-bundesrat-gesundheit | Bundesrat *(reuse)* | googlenews_search `site:` | ereignisnah | Bundesrat Plenum/TOP-Strukturdaten |
| gesbund-gba-beschluesse | G-BA *(neu)* | **rss** `…/beschluesse/letzte-aenderungen/?rss=1` | ereignisnah | Presse-RSS `?rss=1` |
| gesbund-rki-epidbull | RKI *(neu)* | googlenews_search `site:` | ereignisnah | RKI EpidBull-RSS (Feed-Hub, **URL migriert**) |
| gesbund-destatis-genesis | Destatis *(reuse)* | **structured_download** (Portal) | periodisch | GENESIS-API 23111 + 23611 |
| gesbund-gkv-spitzenverband | GKV-SV *(neu)* | googlenews_search `site:` | regelmäßig | GKV-SV Presse (E-Mail-Abo) |
| gesbund-kbv-praxisnachrichten | KBV *(neu)* | googlenews_search `site:` | regelmäßig | KBV PraxisNachrichten-Feed |
| gesbund-dkg-positionen | DKG *(neu)* | googlenews_search `site:` | regelmäßig | DKG Presse `/dkg/presse/` |
| gesbund-svr-gutachten | SVR *(neu)* | googlenews_search `site:` | periodisch | SVR Gutachten-Download |
| gesbund-bfarm-lieferengpaesse | BfArM *(neu)* | googlenews_search `site:` | ereignisnah | BfArM Lieferengpass-RSS + DB-Export |
| gesbund-pei-sicherheit | PEI *(neu)* | googlenews_search `site:` | ereignisnah | PEI SiteGlobals-RSS |
| gesbund-iqwig-berichte | IQWiG *(neu)* | googlenews_search `site:` | regelmäßig | IQWiG RSS/Atom |
| gesbund-baek-stellungnahmen | BÄK *(neu)* | googlenews_search `site:` | regelmäßig | BÄK Stellungnahmen-Feed |
| gesbund-pflegerat-stellungnahmen | DPR *(neu)* | googlenews_search `site:` | regelmäßig | DPR Presse/Stellungnahmen |

**Warum überwiegend `googlenews_search site:`?** Für 11 der 14 Wege ist zwar ein Feed-/API-Angebot
belegt, aber **kein konkreter, byte-verifizierter Deep-Link** (Sandbox-Egress gesperrt, s. §7).
`googlenews_search site:<domain>` ist der etablierte, stabile, byte-verifizierbare Übergangsweg
(dasselbe Muster wie Landesmodule Berlin/Brandenburg). Die fachlich bevorzugte RSS/API-Alternative
ist je Weg dokumentiert und **vor Aktivierung** zu fixieren (`verifyBeforeActivation: true`).
Konkret byte-nah bereits belegt: **G-BA** (RSS-Deep-Link) und **Destatis** (GENESIS-API).

---

## 3. Future Targets (fachlich bestätigt, technisch später)

| Quelle | Warum noch nicht im Kern | Potenzial |
|---|---|---|
| EMA (Europäische Arzneimittel-Agentur) | EU-Ebene, kein deutscher Always-on-Kern | bei Arzneimittelthemen |
| ECDC | EU-Ebene, ergänzt RKI | bei Pandemielagen |
| EU-Kommission DG SANTE | EU-Ebene, selten direkt relevant | bei EU-Gesetzgebung |
| ZfKD (RKI) — Krebsregister | spezifisches Thema, RKI-nah (keine RKI-Dublette) | thematisch |
| Zi (Zentralinstitut kassenärztl. Versorgung) | KV-nah, spezifisch (keine KBV-Dublette) | Versorgungsdaten |
| vdek / AOK-Bundesverband (WIdO) / BKK / PKV | nur bei konkreten Themen (kein GKV-SV-Ersatz) | Akteurspositionen |
| Medizinischer Dienst Bund | Jahresstatistik, nicht laufend | Behandlungsfehler |
| BAG SELBSTHILFE | seltene Veröffentlichungen | Patientenperspektive |
| IGES Institut | Auftragsforschung, nicht laufend | Versorgungsforschung |
| Bundesamt für Soziale Sicherung (BAS) | kaum eigenständige Publikationen mit Politikbezug | gering |
| BIÖG (ehem. BZgA) | Umbenennung 2/2025, Profil unklar, wenig Gesetzgebungsbezug | Prävention |

---

## 4. Übergangs-/Rechercheressourcen (kein laufender Crawler)

- **Wissenschaftliche Dienste des Bundestages** — hochwertige, aber **nicht systematisch
  publizierte** Gutachten (auf Anfrage). Für Recherche unverzichtbar, für automatisierte
  Beobachtung ungeeignet → kein Abrufweg.

---

## 5. Ausgeschlossene Quellen (mit Begründung)

| Quelle | Grund |
|---|---|
| Deutsches Ärzteblatt | Fachmedium, keine Primärquelle (berichtet über Politik). Bestand `news-aerzteblatt` bleibt in bund-basis. |
| Bertelsmann Stiftung | Impulsgeber, kein verbindlicher Steuerungscharakter |
| BAGFW (Wohlfahrtspflege) | für Kern-Gesundheitspolitik nur am Rand |
| OECD Health at a Glance | internationaler Vergleich, zu abstrakt |
| WHO | globale Ebene, selten direkt national relevant |
| Petitionsausschuss | unregelmäßig, schwer systematisierbar (Frühwarnsignal) |

Keine Quelle wurde nur wegen technischer Schwierigkeit gestrichen (Auftrag §2) — die
technisch schwierigen Kernquellen (RKI-Migration, BfArM-Feed, Destatis-API) sind **enthalten**,
mit robustem Übergangsweg + dokumentierter Zielalternative.

---

## 6. Bestandswiederverwendung (keine Duplikate)

- **Herausgeber:** `publisher-bundesgesundheitsministerium.de`, `publisher-bundesrat.de`,
  `publisher-destatis.de` — nur referenziert, **nicht** neu angelegt.
- **Entitäten:** `ministry-bmg`, `parliament-bundesrat`, `statoffice-destatis` — nur referenziert.
- **Parlamentarischer Prozess:** über bestehende **DIP-API** (`rp-dip`, always_on, Bund Basis) +
  bestehenden Ausschuss-Weg (`rp-committee-gesundheit`, `committee-bt-gesundheit`) — **kein**
  neuer gesundheit-bund-Weg für Bundestags-Drucksachen (Funktionsdublette vermieden).

Neu angelegt: **11 Herausgeber**, **11 Entitäten**, **14 Abrufwege**, **1 Paket** (`gesundheit-bund`).

---

## 7. Verifikationsergebnisse (zwei getrennte Ebenen, §5)

Record: `lib/helmut/quellenarchitektur/seeds/gesundheit-bund-verifikation.js`.

- **Ebene 1 — Recherche (belegt).** Quelle: WebSearch-Suchindex, 2026-07-24. Domain-Existenz,
  Publikationsreihe und Feed-/API-Angebot je Kernquelle belegt. Ergebnis: 12× `belegt`,
  1× `belegt_mit_migrationsrisiko` (RKI — Website 2024/25 migriert, alter EpidBull-Pfad ungültig),
  2× `teilbelegt` (GKV-SV, SVR — Angebot belegt, konkreter Deep-Link offen).
- **Ebene 2 — Byte-genau (OFFEN).** HTTP-Status, Redirect, Content-Type, Feed-Parsebarkeit,
  Paywall/Bot-Sperre, dauerhafte URL: in dieser Sandbox **nicht durchführbar** — der
  Egress-Proxy beantwortet **jeden** CONNECT mit HTTP 403 (Kontroll-Abruf `example.com` = 403,
  geprüft 2026-07-24; `curl` **und** WebFetch identisch blockiert). Byte-Verifikation ist über
  den etablierten offenen Egress-Runner (GitHub Actions, Muster `sprint9b-verify.yml`)
  nachzuholen und danach im Record zu ergänzen.

> Ein einzelner 404/Timeout = „technisch noch nicht bestätigt", **nicht** „fachlich ungeeignet".
> Beide Ebenen sind bewusst getrennt geführt.

---

## 8. Frequenzklassen & Betriebsempfehlung (§6)

| Klasse | Quellen | Priorität | expected_frequency | Timeout | Retry |
|---|---|---|---|---|---|
| **ereignisnah** (6) | BMG, Bundesrat, G-BA, RKI, BfArM, PEI | 85 | anlassbezogen | 20 s | 3 |
| **regelmäßig** (6) | GKV-SV, KBV, DKG, IQWiG, BÄK, Pflegerat | 65 | wöchentlich | 20 s | 2 |
| **periodisch** (2) | Destatis, SVR | 45 | jährlich | 30 s | 2 |

Timeout/Retry sind keine `retrieval_paths`-Spalten → als Betriebsempfehlung im Modell
(`timeoutMsEmpfehlung`/`retriesEmpfehlung`) geführt. Periodische Quellen (Jahres-/Zweijahres-
berichte) werden bewusst **nicht** häufig abgerufen — keine unnötige Frequenz aus strategischer
Relevanz.

---

## 9. Offene Risiken

1. **Byte-Verifikation ausstehend** (Sandbox-Egress gesperrt) — bevor irgendein Weg aktiviert
   wird, ist der offene Egress-Runner Pflicht.
2. **RKI-URL-Migration** — dedizierter EpidBull-Feed-Deep-Link vor Aktivierung neu ermitteln.
3. **Feed-Deep-Links unbestätigt** (BfArM, PEI, IQWiG, BMG, RKI) — Übergangsweg googlenews_search
   ist stabil; die RSS/API-Alternative ist die Zielarchitektur.
4. **Destatis GENESIS-API** benötigt Token + konkrete Tabellen-ID (23111/23611).
5. **Bot-/Paywall-Sperren** (deutsche Gov-Domains blocken generische Bots) — realistischer
   User-Agent / server-seitiger Abruf vor Aktivierung prüfen.
6. **Verbandslandschaft** (vdek/AOK/BKK/PKV): dauerhafte Überwachung vs. themenbezogen offen —
   aktuell GKV-SV als Umbrella, Rest Future.

---

## 10. Abdeckungsmatrix nach Funktion

| Funktion | Kernquelle (gesundheit-bund) | Bestand/Ergänzung | vermiedene Funktionsdublette |
|---|---|---|---|
| Gesetzgebung | BMG | — | — |
| Parlamentarischer Prozess | *(Bestand)* DIP-API + Ausschuss Gesundheit | — | **kein** eigener Bundestags-Weg |
| Länderbeteiligung | Bundesrat (thematisch) | — | Bundesrat-Ausschuss vs. allg. Bundesrat: ein thematischer Weg |
| Selbstverwaltung | G-BA | IQWiG (Evidenz-Zulieferer) | IQWiG ≠ G-BA (beide behalten) |
| Epidemiologie | RKI | — | RKI vs. ZfKD: ZfKD Future |
| Krankenhaus | Destatis (Grunddaten) | DKG (Position) | — |
| Finanzierung | Destatis (GAR) | GKV-SV | Destatis: **ein** Weg für beide Reihen |
| Arzneimittel | BfArM | PEI | — |
| Impfstoffe | PEI | RKI (STIKO) | — |
| Evidenz | IQWiG | SVR | — |
| Pflege | Deutscher Pflegerat | — | — |
| Ärzteschaft | Bundesärztekammer | KBV | BÄK ≠ Ärzteblatt (Fachmedium ausgeschlossen) |
| Akteurspositionen | GKV-SV, KBV, DKG | vdek/AOK/BKK/PKV (Future) | GKV-SV ≠ Einzelkassen |

**Funktionsdubletten-Entscheidungen (§7):**

| Überschneidung | Entscheidung |
|---|---|
| Bundestagsausschuss vs. DIP-API | vorhandenen Weg wiederverwenden (kein neuer Weg) |
| Bundesrat-Ausschuss vs. allg. Bundesrat | ein thematischer Abrufweg |
| Destatis-Einzelseiten vs. gemeinsamer Zugang | **ein** gemeinsamer strukturierter Weg (GENESIS) |
| GKV-SV vs. vdek/AOK/BKK | GKV-SV Kern, Rest Future |
| IQWiG vs. G-BA | eigener Weg je (Evidenz vs. Entscheidung) |
| BMG vs. nachgeordnete Behörden | eigene Wege je Behörde (unterschiedliche Funktion) |
| RKI vs. ZfKD | RKI Kern, ZfKD Future |
| KBV vs. Zi | KBV Kern, Zi Future |
| Ärzteblatt vs. Bundesärztekammer | BÄK Kern (Akteur), Ärzteblatt ausgeschlossen (Fachmedium) |

---

## Produktreife-Einordnung

Das Paket ist **fachlich vollständig** und **technisch vorbereitet**, aber **nicht produktionsreif**:
byte-genaue Verifikation offen, alle Wege `needs_review`/`manual`, kein Profil-Mapping, kein Crawl,
Paket `prepared`. Aktivierung = eigener, ausdrücklich freigabepflichtiger Schritt.
