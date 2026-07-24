# 29 — Quellenpaket „Gesundheit Bund" — vollständige Bewertung nach eingefrorener Methodik V1.0

**Stand:** 2026-07-24 · **Status:** `prepared` (Bewertung + Freigabevorlage, **NICHTS aktiviert**)
**Modus der Analyse:** lesend (Code) + Recherche (WebSearch) · **Egress byte-genau geblockt** (Probes 000)
**Branch:** `claude/source-package-frozen-methodology-n7y63l`
**Methodik:** Quellenbewertungsmethodik **V1.0 — eingefroren**. Diese Bewertung wendet sie
**unverändert** an. Keine neue Achse, kein neues Feld, keine Registry-/Generator-/Workflow-/
Teständerung.

> **Kernaussage in einem Satz:** Das Fachthemenpaket **Gesundheit Bund** schließt die in
> `audit/source-coverage.md` §5.2 dokumentierte Lücke „Politikfeld-Tiefe jenseits Arbeit &
> Soziales" und erreicht Bewertungsreife auf demselben Rigor-Standard wie das Referenzpaket
> (WBSB): 15 konkrete Quellen, jede durch alle vier Achsen geführt und einer der vier
> Kategorien zugeordnet — mit strikter Trennung von fachlicher Qualität und technischer
> Integrationsreife.

---

## 0. Warum dieses Paket, warum Gesundheit

**Zielwahl (Fachthemenpaket Bund):** `audit/source-coverage.md` §5 belegt, dass jede
Fachtiefe in Helmut heute an **Arbeit & Soziales** gekoppelt ist (die 350er-Themenmatrix,
alle Fach-/Verbands-/Prozessquellen tragen `SOCIAL_THEME_TERMS`). Ein Gesundheitsmandat
bekäme heute **kein einziges Fachmedium, keinen Fachverband, keine Prozessquelle** seines
Feldes — nur die neutrale Basis.

**Gesundheit** ist unter den offenen Feldern (Gesundheit, Verteidigung, Klima/Energie,
Inneres, Finanzen, Verkehr, Bildung, Digitales) das **stärkste Proof-Ziel**, weil:

1. **Direkt an das bewiesene Feld angrenzend** (Sozial-/Pflegepolitik ↔ Gesundheitspolitik),
   aber institutionell klar abgegrenzt → sauberer Test der Feld-Entkopplung.
2. **Dichteste verifizierbare Quellenlage** aller offenen Felder: eine echte
   Prozess-/Entscheidungsinstanz (G-BA) mit **direktem RSS**, ein Fachministerium mit RSS,
   ein A-Fachblatt mit RSS, dazu die klassische Selbstverwaltung (GKV-SV, KBV, DKG).
3. **Belegte Alt-Berührung als Dedup-/Umwidmungsfall:** `sources.js` führt „Ärzteblatt" und
   „BMG Pflege" bereits — aber **SOCIAL-gated**, also an A&S gebunden. Das liefert einen
   echten Portfolio-Überschneidungsfall (siehe §6/§8).

**Paketprofil (analog `arbeit-und-soziales`):**

| Feld | Wert |
|---|---|
| `key` / `name` | `gesundheit-bund` / **Gesundheit Bund** |
| `purpose` | Fachthemenpaket Gesundheitspolitik (Institutionen, Selbstverwaltung/Prozess, Fachverbände, Fachmedien). **Fachthema, NICHT Region.** |
| `status` (Vorschlag) | `prepared` — Aktivierung ist ein eigener, freigabepflichtiger Schritt |
| `is_base` | `false` |
| `political_level` / `geography` | `bund` / `geo-bund` |
| `required_classes` | `[]` (Fachpaket, keine Landesmodul-Pflichtklassen) |

> Dieses Dokument **definiert und bewertet** das Paket. Es schreibt **nichts** in Code,
> Seeds, Registry oder DB. `PACKAGE_DEFINITIONS` (`seeds/packages.js`) bleibt unverändert.

---

## 1. Angewandte Methodik (eingefroren — hier nur referenziert, nicht neu definiert)

Für **jede** Quelle wird in fester Reihenfolge geführt:

1. **Compliance-Gate** — *bestanden / nicht bestanden*. Vorgeschaltetes **Gate**: öffentlich/
   lizenzkonform nutzbar? Keine Paywall-Volltextentnahme, keine Bot-Sperren-Umgehung, TLS
   aktiv, keine ungeklärte Drittinhalts-Weiterverbreitung. **Nicht bestanden ⇒ Quelle scheidet
   aus, unabhängig von allen weiteren Achsen.**
2. **Fachliche Qualität** — **A / B / C**. A = primäre/autoritative Quelle des Feldes;
   B = solide Sekundärquelle (Fachmedium/Fachverband); C = dünn/derivativ.
3. **Technische Integrationsreife** — **🟢 / 🟡 / 🔴**. 🟢 = sauberer Direkt-Feed (RSS/XML),
   stabile Adresse, geringer Parser-Aufwand, geringes Dublettenrisiko; 🟡 = integrierbar über
   Brückenweg/Filter/Deep-Link-Fix oder unbestätigter Feed; 🔴 = kein Feed / Paywall /
   harte Bot-Sperre → aktuell nicht sauber integrierbar.
4. **Strategischer Nutzen** — **★☆☆☆☆ … ★★★★★** für ein Mandat im Politikfeld Gesundheit.

**Kategorie-Zuordnung** — abgeleitet **ausschließlich** aus den vier Achsen (keine fünfte
Dimension):

| Kategorie | Regel (rein aus den 4 Achsen) |
|---|---|
| **Ideal + sofort nutzbar** | Compliance ✅ ∧ Fachlich ∈ {A,B} ∧ Technisch 🟢 ∧ Strategisch ≥ ★★★ |
| **Future Target** | Compliance ✅ ∧ Fachlich ∈ {A,B} ∧ Strategisch ≥ ★★★★ ∧ Technisch 🔴 — *hoher Wert, aktuell technisch nicht sauber integrierbar; wird NICHT verworfen* |
| **Übergang** | Compliance ✅ ∧ Fachlich ∈ {A,B} ∧ Technisch 🟡 — *über Brückenweg (googlenews_search / Deep-Link-Fix) sofort nutzbar, bis der Direktweg verifiziert/gebaut ist* |
| **Entfernen** | Compliance ❌ ∨ (Fachlich C ∧ Strategisch ≤ ★★) ∨ vollständige Redundanz zu einem bereits aktiven Paketweg (Portfolio-Dedup) |

> **Konstruktion erzwingt die geforderte Trennung:** Die Grenze zwischen *Future Target* und
> *Übergang* liegt **allein auf der Technik-Achse** (🔴 vs. 🟡); die Fachlich-Achse demotet
> **nie** eine Quelle in „Entfernen", solange sie A/B ist. Eine fachlich starke, technisch
> schwierige Quelle landet also zwangsläufig in *Future Target*, nicht im Papierkorb — genau
> wie in der Qualitätsanforderung verlangt.

---

## 2. Achse 1 — Compliance-Gate

| # | Quelle | Klasse | Compliance | Begründung |
|---|--------|--------|:---:|-----------|
| 1 | **BMG** (bundesgesundheitsministerium.de) | Ministerium | ✅ | Amtliche Pressemitteilungen, öffentlich, RSS-Angebot des BMG selbst. TLS aktiv. |
| 2 | **G-BA** (g-ba.de) | Selbstverwaltung/Prozess | ✅ | Öffentliche Beschlüsse/PM einer Körperschaft öff. Rechts; RSS ausdrücklich angeboten. |
| 3 | **RKI** (rki.de) | Bundesbehörde | ✅ | Amtliche Publikationen/PM, RSS-Angebot vorhanden. |
| 4 | **IQWiG** (iqwig.de) | Institut (§139a SGB V) | ✅ | Öffentliche Berichte/PM. |
| 5 | **GKV-Spitzenverband** (gkv-spitzenverband.de) | Kostenträger/Selbstverw. | ✅ | Öffentliche PM/Statements. |
| 6 | **KBV** (kbv.de) | Selbstverw./Leistungserbr. | ✅ | Öffentliche Presse. |
| 7 | **DKG** (dkgev.de) | Verband/Leistungserbr. | ✅ | Öffentliche Pressemitteilungen. |
| 8 | **Bundesärztekammer** (baek.de) | Kammer | ✅ | Öffentliche PM. |
| 9 | **vfa** (vfa.de) | Industrieverband | ✅ | Öffentliche PM, RSS vom Verband selbst angeboten. Interessengebundenheit ist **fachlich** einzuordnen (Achse 2), **kein** Compliance-Defekt. |
| 10 | **Deutsches Ärzteblatt** (aerzteblatt.de) | Fachmedium | ✅ | Öffentlicher redaktioneller RSS; nur Titel/Teaser/Link, kein Volltext-Reprint. |
| 11 | **Ärzte Zeitung** (aerztezeitung.de) | Fachmedium | ✅ | Redaktioneller Feed/Newsfeed; nur Metadaten. |
| 12 | **Tagesspiegel Background Gesundheit** | Fachmedium (Paywall) | ✅* | **Nur** über den compliant erreichbaren Weg (Metadaten/Überschriften via googlenews_search). **Volltext-Scrape hinter der Paywall = Compliance ❌** und wird ausgeschlossen (siehe §6, Zeile 12 + §8 Beobachtung 3). |
| 13 | **Observer Gesundheit** (observer-gesundheit.de) | Fachmedium/Portal | ✅ | Öffentliche Beiträge/Standpunkte; Metadaten. |
| 14 | **Gesundheitsausschuss Bundestag** | Parlament | ✅ | Öffentlich — **aber bereits über `bund-basis` (alle 22 Ausschüsse) global abgedeckt** → Dedup, siehe §6. |
| 15 | **krankenkassen-direkt.de** (News-Aggregat) | Aggregator | ❌ | Republiziert fremde PM/Meldungen ohne erkennbare Lizenz-/Herkunftsgrundlage; unklare Weiterverbreitungsrechte. **Gate nicht bestanden.** |

**Ergebnis Gate:** 14 bestanden, **1 nicht bestanden** (#15). #12 bestanden **nur** in der
Metadaten-Variante; die Volltext-Variante ist ausgeschlossen.

---

## 3. Achse 2 — Fachliche Qualität (A / B / C)

*Isolierte Bewertung des inhaltlichen Werts — technische Erreichbarkeit spielt hier
**keine** Rolle.*

| # | Quelle | Fachl. | Begründung (rein inhaltlich) |
|---|--------|:---:|-----------|
| 1 | BMG | **A** | Oberste Fachbehörde; Referentenentwürfe, Gesetzesvorhaben, Verordnungen — Primärquelle der Gesundheitspolitik. |
| 2 | G-BA | **A** | Zentrale Entscheidungs-/Prozessinstanz der GKV (Richtlinien, Beschlüsse, Nutzenbewertung). **Höchster fachlicher Primärwert** im Feld. |
| 3 | RKI | **A** | Autoritative epidemiologische/Public-Health-Primärquelle. Politiknah v. a. bei Lage/Infektionsschutz. |
| 4 | IQWiG | **B** | Autoritativ für Nutzenbewertung, aber schmaleres, spezialisiertes Segment; speist ohnehin oft in G-BA-Prozesse. |
| 5 | GKV-Spitzenverband | **A** | Zentraler Kostenträger-Akteur; Stellungnahmen prägen Finanzierungs-/Versorgungsdebatte unmittelbar. |
| 6 | KBV | **A** | Bundesweite Vertretung der Vertragsärzte; Kernakteur der ambulanten Versorgung. |
| 7 | DKG | **B** | Krankenhausseite; hoher Wert v. a. bei Krankenhausreform/Finanzierung, sonst enger. |
| 8 | Bundesärztekammer | **B** | Ärztliche Selbstverwaltung/Berufsrecht; wertvoll, aber teils überlappend mit Ärzteblatt (Herausgeberin). |
| 9 | vfa | **B** | Belastbare Fach-/Marktsicht zu Arzneimitteln/Innovation — **erklärt interessengebunden** (Herstellerverband). Fachlich solide, aber **kein** neutraler Primärwert → B, nicht A. |
| 10 | Deutsches Ärzteblatt | **A** | Führendes ärztliches Organ, deckt Gesundheitspolitik **und** Medizin redaktionell auf hohem Niveau. |
| 11 | Ärzte Zeitung | **B** | Solides tagesaktuelles Fachmedium (Springer Medizin), etwas praxis-/marktnäher, redaktionell dünner als Ärzteblatt. |
| 12 | Tagesspiegel Background Gesundheit | **A** | Politisch dichtestes Fach-Briefing zur Bundes-Gesundheitspolitik (Entscheider-Ebene). |
| 13 | Observer Gesundheit | **B** | Standpunkte/Analysen von Akteuren; wertvoll, aber meinungs-/gastbeitragslastig. |
| 14 | Gesundheitsausschuss BT | **A** | Parlamentarischer Primärprozess — inhaltlich erstklassig (deshalb liegt der Ausschluss **nicht** an der Fachlichkeit, s. §8/Beobachtung 1). |
| 15 | krankenkassen-direkt.de | **C** | Derivatives Aggregat ohne eigene Primärleistung (Gate ohnehin ❌). |

---

## 4. Achse 3 — Technische Integrationsreife (🟢 / 🟡 / 🔴)

*Recherchebasis WebSearch (wie Doc 13); direkter Abruf in dieser Umgebung 403/000-geblockt.
**Jede Feed-URL ist vor Aktivierung byte-genau zu verifizieren** (`verifyBeforeActivation`).*

| # | Quelle | Techn. | Belegter/kandidierender Abrufweg | Aufwand / Risiko |
|---|--------|:---:|-----------|-----------|
| 1 | BMG | 🟢 | RSS-Newsfeed vom BMG angeboten (`/service/rss-feed`); SiteGlobals-XML-Deep-Link byte-genau fixieren | gering; Deep-Link verifizieren |
| 2 | **G-BA** | 🟢 | **Direkt-RSS bestätigt:** Beschlüsse `/beschluesse/letzte-aenderungen/?rss=1`, Presse `/presse/pressemitteilungen-meldungen/letzte-aenderungen/?rss=1` | gering; **zwei getrennte Feeds** sauber trennbar |
| 3 | RKI | 🟡 | RSS über SiteGlobals-`RSSGenerator`-XML + edoc-Atom; **kein** eindeutiger allgemeiner Presse-Feed-Deep-Link belegt | mittel; richtigen Feed auswählen/verifizieren |
| 4 | IQWiG | 🟡 | RSS wahrscheinlich (CMS), nicht bestätigt | mittel; Übergang googlenews bis Direktweg steht |
| 5 | GKV-Spitzenverband | 🟡 | Presse `.jsp`; RSS im Header angedeutet, **nicht** als Deep-Link bestätigt | mittel; Übergang `site:gkv-spitzenverband.de` |
| 6 | KBV | 🟡 | `kbv.de/presse`; **kein** bestätigter RSS (nur Newsletter „PraxisNachrichten") | mittel; Übergang googlenews |
| 7 | DKG | 🟡 | `dkgev.de/dkg/presse/`; kein bestätigter RSS | mittel; Übergang googlenews |
| 8 | Bundesärztekammer | 🟡 | Presse vorhanden; RSS unbestätigt; Überlappung mit Ärzteblatt | mittel; Dedup gg. #10 beachten |
| 9 | vfa | 🟢 | **Direkt-RSS bestätigt** (`/de/verband-mitglieder/rss`, `vfa.rss`) | gering |
| 10 | Deutsches Ärzteblatt | 🟢 | **Direkt-RSS bestätigt** (`/service/rss`, Nachrichten-Feed) | gering; **Alt-Quelle bereits im Katalog** (Umwidmung, §6/§8) |
| 11 | Ärzte Zeitung | 🟡 | RSS-Service-Seite existiert; exakte Feed-URL nicht byte-belegt | gering–mittel; Feed-URL verifizieren |
| 12 | Tagesspiegel Background Gesundheit | 🔴 | **Paywall, kein offener Volltext-RSS**; nur Metadaten via googlenews möglich | hoch; compliant nur Metadaten |
| 13 | Observer Gesundheit | 🟡 | Portal, WordPress-typischer `/feed/` wahrscheinlich, unbestätigt | mittel |
| 14 | Gesundheitsausschuss BT | 🟢 | technisch trivial — **aber redundant** zu `bund-basis` | n/a (Dedup, §6) |
| 15 | krankenkassen-direkt.de | 🟡 | RSS vorhanden — **irrelevant**, Gate ❌ | n/a |

> **SPOF-Hinweis (bekannt, keine neue Achse):** Alle 🟡-Übergangswege laufen über den
> Google-News-Auflöser (`crawler.js`) — dessen strukturelle Fragilität ist in
> `audit/source-coverage.md` §2 dokumentiert. Das ist ein **operatives** Infrastrukturrisiko,
> das die Methodik bewusst nicht als eigene Achse führt (siehe §8/Beobachtung).

---

## 5. Achse 4 — Strategischer Nutzen (★) für ein Gesundheits-Mandat

| # | Quelle | Nutzen | Begründung |
|---|--------|:---|-----------|
| 2 | **G-BA** | ★★★★★ | Prozess-/Entscheidungssignal ohne Substitut — was der G-BA beschließt, ist Versorgungsrealität. Flaggschiff. |
| 1 | **BMG** | ★★★★★ | Gesetzes-/Verordnungsvorhaben an der Quelle; jedes Gesundheitsmandat braucht das. |
| 10 | Deutsches Ärzteblatt | ★★★★ | Deckt Politik **und** Medizin, hohe Trefferdichte, direkter Feed. |
| 12 | Tagesspiegel Background Gesundheit | ★★★★ | Höchste politische Informationsdichte auf Entscheider-Ebene. |
| 5 | GKV-Spitzenverband | ★★★★ | Finanzierungs-/Versorgungsdebatte wird hier maßgeblich geprägt. |
| 6 | KBV | ★★★ | Ambulante Versorgung, Kernakteur; etwas standesbezogen. |
| 3 | RKI | ★★★ | Sehr wertvoll bei Lage/Public Health, politiknäher nur situativ. |
| 7 | DKG | ★★★ | Hoch bei Krankenhausreform, sonst enger. |
| 9 | vfa | ★★★ | Arzneimittel-/Innovationspolitik; interessengebunden gewichten. |
| 8 | Bundesärztekammer | ★★★ | Berufs-/Standespolitik; teils Überlappung mit #10. |
| 11 | Ärzte Zeitung | ★★★ | Gute Breite, aber redundanter zu #10. |
| 13 | Observer Gesundheit | ★★★ | Meinungs-/Debattensignal, ergänzend. |
| 4 | IQWiG | ★★ | Spezialsegment, oft über G-BA mittelbar abgedeckt. |
| 14 | Gesundheitsausschuss BT | ★★★★ | Hoher Nutzen — **aber bereits über `bund-basis` geliefert** → im Fachpaket **kein additiver** Nutzen. |
| 15 | krankenkassen-direkt.de | ★☆☆☆☆ | Derivativ, kein Eigenwert. |

---

## 6. Synthese — Kategorie je Quelle

| # | Quelle | Compl. | Fachl. | Techn. | Strat. | **Kategorie** |
|---|--------|:---:|:---:|:---:|:---:|---|
| 2 | G-BA | ✅ | A | 🟢 | ★★★★★ | **Ideal + sofort nutzbar** |
| 1 | BMG | ✅ | A | 🟢 | ★★★★★ | **Ideal + sofort nutzbar** |
| 10 | Deutsches Ärzteblatt | ✅ | A | 🟢 | ★★★★ | **Ideal + sofort nutzbar** |
| 9 | vfa | ✅ | B | 🟢 | ★★★ | **Ideal + sofort nutzbar** |
| 12 | Tagesspiegel Background Gesundheit | ✅* | A | 🔴 | ★★★★ | **Future Target** |
| 5 | GKV-Spitzenverband | ✅ | A | 🟡 | ★★★★ | **Übergang** |
| 6 | KBV | ✅ | A | 🟡 | ★★★ | **Übergang** |
| 3 | RKI | ✅ | A | 🟡 | ★★★ | **Übergang** |
| 7 | DKG | ✅ | B | 🟡 | ★★★ | **Übergang** |
| 11 | Ärzte Zeitung | ✅ | B | 🟡 | ★★★ | **Übergang** |
| 8 | Bundesärztekammer | ✅ | B | 🟡 | ★★★ | **Übergang** |
| 13 | Observer Gesundheit | ✅ | B | 🟡 | ★★★ | **Übergang** |
| 4 | IQWiG | ✅ | B | 🟡 | ★★ | **Übergang** |
| 14 | Gesundheitsausschuss BT | ✅ | A | 🟢 | ★★★★ | **Entfernen** (Portfolio-Dedup) |
| 15 | krankenkassen-direkt.de | ❌ | C | 🟡 | ★☆☆☆☆ | **Entfernen** (Compliance) |

**Nachvollziehbare Begründung je Kategorie:**

- **Ideal + sofort nutzbar (4):** G-BA, BMG, Ärzteblatt, vfa. Alle vier: Gate ✅, Fachlich
  A/B, **Direkt-Feed 🟢**, Strategisch ≥★★★. **G-BA ist der Ankerbeleg des ganzen Pakets** —
  eine primäre Prozessquelle mit bestätigtem RSS ist genau das, was A&S für sein Feld hat und
  was allen anderen Feldern fehlt. vfa ist trotz nur B (Interessenbindung) drin, weil die
  Kategorie **fachliche Qualität und Technik trennt**: B + 🟢 + ✅ qualifiziert.
- **Future Target (1):** Tagesspiegel Background. **Fachlich A, Strategisch ★★★★ — und wird
  gerade NICHT verworfen, obwohl 🔴.** Das ist der methodisch wichtigste Einzelfall: hoher
  Wert schlägt aktuelle technische Schwierigkeit nicht in „Entfernen" um, sondern in
  „beobachten/später erschließen" (Direkt-Lizenz/Feed, sobald verfügbar).
- **Übergang (9):** GKV-SV, KBV, RKI, DKG, Ärzte Zeitung, BÄK, Observer, IQWiG. Alle: Gate ✅,
  Fachlich A/B, **🟡** — sofort über einen Brückenweg (`site:`-googlenews bzw. Deep-Link-Fix)
  nutzbar, mit dem klaren Auftrag, den bestätigten Direktweg nachzuziehen. **Keine** dieser
  Quellen wird wegen der aktuellen technischen Unschärfe verworfen.
- **Entfernen (2):**
  - **#15 krankenkassen-direkt.de — Compliance ❌.** Trotz technisch vorhandenem RSS: das
    Gate ist vorgeschaltet und bindend. Fachlich C bestätigt die Entscheidung, ist aber nicht
    nötig — das Gate allein entfernt.
  - **#14 Gesundheitsausschuss BT — Portfolio-Dedup, KEIN Qualitätsurteil.** Fachlich A,
    technisch 🟢, strategisch ★★★★ — nach den vier Achsen ein „Ideal". Es wird **ausschließlich**
    entfernt, weil `bund-basis` alle 22 Ausschüsse bereits global genau einmal crawlt
    (`seeds/packages.js`, Referenzzählung `model.js`) → im Fachpaket **null additiver Nutzen**,
    doppelter Crawl. Genau dieser Fall deckt eine Methodik-Grenze auf → §8/Beobachtung 1.

---

## 7. Paketzusammenfassung

| Kategorie | Anzahl | Quellen |
|---|:---:|---|
| **Ideal + sofort nutzbar** | 4 | G-BA, BMG, Deutsches Ärzteblatt, vfa |
| **Future Target** | 1 | Tagesspiegel Background Gesundheit |
| **Übergang** | 9 | GKV-SV, KBV, RKI, DKG, Ärzte Zeitung, Bundesärztekammer, Observer Gesundheit, IQWiG |
| **Entfernen** | 2 | Gesundheitsausschuss BT (Dedup), krankenkassen-direkt.de (Compliance) |
| **Bewertet gesamt** | **15** | |

**Klassenabdeckung (analog A&S-Struktur):** Ministerium ✅ · Selbstverwaltung/Prozess ✅✅
(G-BA, GKV-SV, KBV, DKG) · Bundesbehörden ✅ (RKI, IQWiG) · Industrieverband ✅ (vfa) ·
Kammer ✅ (BÄK) · Fachmedien ✅✅✅ (Ärzteblatt, Ärzte Zeitung, Background, Observer). Der
parlamentarische Prozess (Gesundheitsausschuss) ist **bewusst nicht** im Paket, weil global
über `bund-basis` gedeckt.

**Dedup-/Umwidmungshinweise (belegt):**
1. **Ärzteblatt** existiert bereits (`sources.js`, `siteSource("news-aerzteblatt", …)`),
   aber **SOCIAL-gated** (an A&S gebunden). Für Gesundheit ist es **umzuwidmen/feld-zu-taggen**
   — nicht neu anzulegen. (Kein Code-Eingriff in diesem Dokument.)
2. **BMG** ist als „BMG Pflege" (googlenews, Pflege-verengt) vorhanden — das Fachpaket braucht
   den **breiten** BMG-Feed (Direkt-RSS), nicht die Pflege-Query.
3. **Bundesärztekammer ⊂/⋂ Ärzteblatt** (Herausgeberin) → bei Aktivierung Dublettenrisiko
   prüfen.
4. **Gesundheitsausschuss** → 0 zusätzliche Wege (bereits `bund-basis`).

---

## 8. Abschluss — die vier verlangten Antworten

### 1. Wurde die Methodik ohne Anpassungen vollständig angewendet?

**Ja.** Alle vier Achsen wurden in fester Reihenfolge auf **alle 15** Quellen angewandt
(Compliance-Gate → Fachlich A/B/C → Technisch 🟢/🟡/🔴 → Strategisch ★). Jede Quelle wurde
genau einer der vier Kategorien zugeordnet, und die Zuordnungsregel ist **rein aus den vier
Achsen** abgeleitet. Es wurde **keine** fünfte Dimension, kein neues Feld, keine
Registry-/Generator-/Workflow-/Teständerung eingeführt. Fachliche Qualität und technische
Integrationsreife wurden strikt getrennt bewertet (Nachweis: #12 Fachlich A trotz 🔴 → nicht
verworfen; #9/#7 Fachlich B trotz 🟢 → nicht hochgestuft über den Fachwert hinaus).

### 2. Gab es Stellen, an denen die Methodik nicht ausgereicht hat?

**Ja, drei — dokumentiert als reine Beobachtung, ohne die Methodik zu ändern:**

- **Beobachtung 1 — Portfolio-Redundanz ist keine Achse.** Der Gesundheitsausschuss ist nach
  allen vier Achsen ein „Ideal" (✅/A/🟢/★★★★), gehört aber trotzdem nicht ins Paket, weil er
  bereits über `bund-basis` global gecrawlt wird. Die Kategorie „Entfernen" musste hier aus
  einem Grund (Dedup gegen das Gesamtportfolio) vergeben werden, den **keine** der vier
  Achsen misst — die Achsen bewerten die Quelle isoliert, nicht ihre Überschneidung mit
  bereits aktiven Paketwegen. (Das Datenmodell kennt Dedup via `package_paths`/Referenzzählung
  — die **Bewertungs**methodik nicht.)
- **Beobachtung 2 — „Strategischer Nutzen" ist mandatsrelativ, das Paket ist mandatsneutral.**
  Der ★-Wert ist nur definiert *für ein Mandat im Feld Gesundheit*; für ein Fremdfeld wäre er
  null. Die Methodik nennt kein explizites Referenzmandat, gegen das der Nutzen zu messen ist.
  Bei A&S fiel das nicht auf, weil der Pilot A&S **ist**. Ich habe die Konvention „Nutzen für
  ein typisches Feld-Mandat" gewählt und offengelegt.
- **Beobachtung 3 — Gate und Technik überlappen bei Paywall.** Bei #12 ist derselbe Umstand
  (Paywall) zugleich Compliance- (Volltext-Entnahme unzulässig) **und** Technik-Thema (🔴).
  Die Methodik trennt beide sauber in der Definition, gibt aber keine Regel, **welcher** Weg
  „die Quelle" ist (compliant-Metadaten vs. non-compliant-Volltext). Ich habe die Konvention
  „bewerte den compliant erreichbaren Weg" gewählt und offengelegt.

> Diese drei Punkte sind **Beobachtungen zur späteren Kenntnis**, keine Änderungsvorschläge.
> Die Methodik bleibt eingefroren. Es wird **kein** neuer Bewertungsmechanismus vorgeschlagen.

### 3. Falls ja — dokumentiert als Beobachtung, Methodik NICHT geändert.

Erledigt: §8/Frage 2 oben. Keine Achse, kein Feld, kein Workflow, keine Registry, kein
Generator, keine Testarchitektur wurde angefasst.

### 4. Ist das Quellenpaket produktionsreif?

**Differenziert — ehrlich nach dem Reifegrad-Modell des Repos (Doc 11 §1):**

- **Als Bewertung und Freigabevorlage: JA.** Das Paket ist methodisch vollständig, jede
  Entscheidung ist nachvollziehbar begründet, es erreicht den geforderten Rigor-Standard.
- **Als produktionsaktiver Crawl: NEIN — Reifegrad `kandidat`.** Zwei bekannte, dem Repo
  eigene Gründe:
  1. **Byte-genaue Verifikation ausstehend.** Der Egress-Proxy blockt Gov-/Medien-Domains in
     dieser Umgebung (alle Probes `000`). Jede Feed-URL trägt `verifyBeforeActivation` und ist
     vor Aktivierung auf HTTP 200 + valides RSS/XML zu prüfen — v. a. die bestätigten
     Direkt-Feeds (G-BA, BMG, Ärzteblatt, vfa) und alle 🟡-Deep-Links.
  2. **Aktivierung ist ein eigener, freigabepflichtiger Schritt** (Publisher/Geography/
     retrieval_paths anlegen → `verifiziert` → `bereit` → `aktiv`), analog Bund-Migration und
     Landesmodule. Dieses Dokument schreibt **nichts** in DB, Seeds oder Registry.

**Fazit:** produktionsreif **als bewertetes, freigabefähiges Paket** — nicht als bereits
scharfgeschalteter Crawl. Nächster (separat freizugebender) Schritt: byte-Verifikation der
vier 🟢-Direktfeeds → als erste Aktivierungswelle; die 9 Übergangsquellen über googlenews als
Brücke; Tagesspiegel Background als Future Target vormerken.

---

## 9. Sicherheitsrahmen — was NICHT passiert ist

- **Keine** Methodikänderung, **keine** neue Bewertungsachse/-feld, **kein** neues
  Bewertungsmodell.
- **Keine** Änderung an `seeds/packages.js`, `catalog.js`, `model.js`, Generatoren
  (`generate-source-architecture-seed.js`) oder der Testarchitektur.
- **Keine** Production-Migration, **kein** Crawl, **kein** Flag, **kein** Cron, **kein**
  Deployment, **keine** RLS-Änderung.
- **Kein** `retrieval_path`/Publisher/Geography erzeugt. Das Paket „Gesundheit Bund" existiert
  bislang **ausschließlich als Bewertung in diesem Dokument**.
- Alle URLs sind per WebSearch recherchierte **Kandidaten** — vor jeder Aktivierung
  byte-genau zu verifizieren.

**Ende. Keine neuen Methodikvorschläge. Keine Änderungen an Workflow, Registry, Generatoren
oder Bewertungsmodell.**
