# Knowledge Object — Presentation Contract (V3)

> **Status:** Verbindliche Architekturregel für Helmut V3.
> **Zweck:** Verhindern, dass Oberflächen jemals wieder eigene Titel, Kürzungen
> oder Zusammenfassungen erzeugen. Dies ist ein **Dokumentations- und
> Absicherungsdokument** — es beschreibt eine bereits umgesetzte Entscheidung
> und ändert keine Produkt-, Backend-, DB-, KI- oder UI-Logik.

---

## 1. Was ist ein Knowledge Object?

Ein **Knowledge Object (KO)** ist der zentrale politische **Vorgang** in Helmut V3.

- Es entsteht **einmal** in der **Understanding Engine** (C7/C8) aus mehreren
  geclusterten Rohdokumenten.
- Dabei fällt **genau ein** KI-Aufruf pro neuem Vorgang an (global,
  mandantenlos — nicht pro Nutzer).
- Das Ergebnis wird **dauerhaft gespeichert** (`knowledge_objects` in Supabase).
- Danach lesen **alle** Oberflächen dasselbe gespeicherte KO — ohne erneute
  KI-Kosten.

Kern-Dateien:

| Rolle | Datei |
| --- | --- |
| Erzeugung (Prompt, Zusammenbau, Validierung) | `lib/helmut/understanding.js` |
| Schema / Feldvertrag | `lib/helmut/understanding-schema.js` |
| Persistenz (Spalten-Whitelist) | `lib/helmut/storage.js` (`V3_KNOWLEDGE_OBJECT_COLUMNS`) |
| DB-Tabelle | `supabase/schema.sql` (`public.knowledge_objects`) |
| KO → Karte fürs Frontend | `lib/helmut/lage.js` (`koToVorgangCard`) |
| Anzeige | `client.js` (`renderVorgangCard`) |

---

## 2. Architekturprinzip

```
Einmal verstehen (global, KI).
Einmal speichern.
Überall wiederverwenden (0 KI).
```

- Keine Oberfläche erzeugt eigene politische Inhalte.
- Keine Oberfläche ruft KI auf, um Titel oder Zusammenfassungen neu zu
  formulieren.
- Qualität wird **beim Schreiben** gesichert (Understanding Engine), nicht
  später in der UI repariert.

Diese Trennung — „einmal verstehen (global, KI) → mehrfach lesen/bewerten (pro
Nutzer, 0 KI)" — ist das Fundament von V3 und darf nicht verwischt werden.

---

## 3. Raw Fields vs. Presentation Fields

Ein KO trägt zwei klar getrennte Feldgruppen.

### Raw Fields (Rohinformation, Quellen, Analysegrundlage)

Diese Felder beschreiben Rohinformationen, Quellen, Beziehungen und
Analysegrundlagen. Sie sind **nicht** für die direkte 1:1-Anzeige gedacht.

| Konzept (Auftrag) | Tatsächliches Feld / Herkunft im KO |
| --- | --- |
| `headline` | `headline` — rohe Modell-Schlagzeile (**Legacy/Raw-Fallback**, siehe §5) |
| `body` | Analyse-Prosa: `was_ist_passiert`, `warum_wichtig`, `wer_ist_betroffen` |
| `documents` | über `ko_document_links` → `raw_documents` (Karte: `documents`) |
| `sources` | über `ko_document_links` → `raw_documents` (Karte: `sources`, `sourceCount`) |
| `entities` | `mentioned_people`, `mentioned_mps`, `mentioned_locations`, `mentioned_organizations` |
| `topics` | `policy_field`, `tags` |
| `parties` | `parteien` (+ `mentioned_parties`) |
| `ministries` | `ministerien` (+ `mentioned_ministries`) |
| `committees` | `ausschuesse` (+ `mentioned_committees`) |

### Presentation Fields (offizieller Präsentationsvertrag)

Diese Felder sind der **offizielle Präsentationsvertrag** für alle UI-Oberflächen.
Sie werden in der Understanding Engine erzeugt, validiert und dauerhaft gespeichert.

| Vertrag (Auftrag) | Gespeichertes KO-Feld (snake_case) | Karten-Feld im Client (camelCase) |
| --- | --- | --- |
| `display_title` | `display_title` | `displayTitle` |
| `summary` | `display_summary` | `displaySummary` |
| `why_relevant` | `why_relevant` | `whyRelevant` |
| `recommendation` | `recommendation` | `recommendation` |
| *(Kategorie-Label)* | `display_category` | `displayCategory` |

> **Namens-Präzisierung (wichtig, gegen genau die Drift, die dieser Vertrag
> verhindern soll):**
> Das Zusammenfassungs-Feld heißt im Code **`display_summary`** (Karte:
> `displaySummary`), **nicht** `summary`. Es gibt zwar ein Karten-Feld
> `summary`, aber das ist das **verschachtelte Roh-Analyse-Objekt**
> (`summary.wasIstPassiert`, `summary.warumWichtig`, `summary.werIstBetroffen`)
> — also ein **Raw Field**, kein Presentation Field. Für die direkte Anzeige
> gilt ausschließlich `display_summary` / `displaySummary`.
>
> `display_category` gehört ebenfalls zum `display_*`-Präsentationsvertrag (kurzes
> Kategorie-Label wie „BMG", „Bundestag"), auch wenn es im Auftrag nicht
> ausdrücklich als Presentation Field genannt war.

Alle Presentation Fields teilen sich das Präfix `display_*` bzw. sind bewusst
kurze, fertige Anzeige-Texte. Sie sind die **einzige** Quelle für
Darstellungstexte eines Vorgangs (Single Source of Truth).

---

## 4. Bedeutung der Presentation Fields

### `display_title`
- **Kanonischer UI-Titel** eines politischen Vorgangs.
- Wird von **Lage, Detailansicht, Radar, Suche, Push** und künftigen **Widgets/
  Dashboards** verwendet.
- Darf im Frontend **nicht** gekürzt, ersetzt oder neu erzeugt werden.
- Regeln bei der Erzeugung: höchstens ~9 Wörter / ~60 Zeichen, ein vollständiger
  Gedanke, kein Nachrichten-/Zeitungstitel, kein Satzfragment, keine Ellipse,
  keine Behördensprache, keine Quellennamen, keine Doppelpunkt-Ketten, neutral,
  politischer Kern zuerst.

### `display_summary` (im Auftrag „summary")
- Kurze, verständliche Zusammenfassung des Vorgangs — **ausschließlich: was ist
  passiert?**
- Soll direkt angezeigt werden. **Keine UI erzeugt eine eigene Zusammenfassung.**
- Keine Bewertung, keine Empfehlung, keine Wiederholung des Titels.

### `why_relevant`
- Kurze politische **Relevanzbegründung**: warum kann der Vorgang für den Nutzer
  relevant sein (betroffener Ausschuss/Partei/Politikfeld)?
- Nicht den Titel umformulieren, nicht allgemein bleiben.

### `recommendation`
- **Kurzer Handlungshinweis zum einzelnen Vorgang** (z. B. „Position mit
  Referenten abstimmen.", „Bis Freitag beobachten.").
- **Keine übergreifende Tagesentscheidung. Keine Helmut-Gesamtstrategie. Keine
  Statement-Generierung.** Nur Empfehlung für **diesen konkreten** Vorgang.

---

## 5. Harte Regeln für alle Oberflächen

Verbindlich für jede aktuelle und künftige Oberfläche:

1. **Keine UI erzeugt eigene Titel.**
2. **Keine UI kürzt Titel** per `slice`, `substring`, `truncate`,
   `text-overflow: ellipsis` oder `-webkit-line-clamp`. Ein Titel wird immer
   vollständig angezeigt.
3. **Keine UI erzeugt eigene Zusammenfassungen.**
4. **Keine UI ruft KI für die Standardanzeige auf** (weder beim Öffnen, beim
   Rendern noch beim Wischen/Scrollen).
5. **Keine UI vermischt `headline` und `display_title`.**
6. **`headline` ist Legacy bzw. Raw-Fallback** — nur für Alt-Vorgänge ohne
   `display_title`, und dann **unverändert und ungekürzt** (kein Zuschneiden).
   Dieser Fallback soll nach einem gezielten Backfill verschwinden.
7. **`display_title` ist der kanonische UI-Titel.**

### Wo diese Regeln bereits durchgesetzt sind
- **Erzeugung + Qualitätsgate:** `lib/helmut/understanding.js`
  (`buildUnderstandingPrompt`, `isValidDisplayTitle`, `sanitizeDisplayTitle`).
- **Frontend hält sich daran:** `client.js` (`renderVorgangCard`) zeigt
  ausschließlich `v.displayTitle` und fällt nur als Legacy auf den vollständigen
  Alt-Titel zurück — **ohne** Kürzung. Die frühere algorithmische
  Kürzungsfunktion (`lageShortTitle`) wurde entfernt.
- **Statischer Guard im Test:** `scripts/p1-security-check.js` prüft, dass
  `lageShortTitle` nicht zurückkehrt und dass der Titel-Fallback keine kürzende
  Funktion verwendet.

---

## 6. Abgrenzung Lage vs. Helmut

| Lage | Helmut |
| --- | --- |
| Zeigt **Vorgänge**. | **Priorisiert** und **entscheidet**. |
| Liest die **Presentation Fields**. | Gibt **übergreifende** Handlungsempfehlungen. |
| Darf **pro Vorgang eine kurze** Empfehlung (`recommendation`) anzeigen. | Trifft die **Tagesentscheidung** / Gesamtstrategie. |
| Keine Priorisierung, keine Strategie, kein Statement-Assistent. | **Erzeugt keine zweite Lage-Ansicht.** |

Kurz: Lage = Fakten + genau eine vorgangsbezogene Empfehlung. Helmut = globale
Priorisierung, Strategie, Kommunikation, Tagesentscheidung. Diese Grenze ist
bewusst und darf nicht verwischen.

---

## 7. Fehlende Felder

Wenn eine Oberfläche ein Feld braucht, das im Knowledge Object noch nicht
existiert:

- **Nicht** im Frontend improvisieren.
- **Nicht** per UI-Logik erzeugen.
- **Nicht** neue KI-Calls beim Anzeigen einbauen.

Stattdessen:

1. Das benötigte Feld **dokumentieren** (Zweck, Länge, welche Oberflächen es
   nutzen).
2. Es **gezielt in der Understanding Engine ergänzen**, sodass es im **einen**
   bestehenden Understanding-Call miterzeugt wird (keine zusätzlichen KI-Kosten).
3. Es dem Schema (`understanding-schema.js`), der Spalten-Whitelist
   (`storage.js`) und der DB (`supabase/schema.sql`, idempotente Migration)
   hinzufügen.
4. Bei Bedarf beim Erzeugen **validieren** (siehe §8).

So bleibt jedes neue Anzeige-Feld Teil des Präsentationsvertrags statt einer
UI-Sonderlogik.

---

## 8. Qualitätsregel

- Presentation Fields werden **beim Erzeugen** des Knowledge Objects validiert.
- **Schlechte Titel oder unvollständige Felder werden gar nicht erst
  gespeichert.** Ein ungültiger `display_title` wird verworfen (→ leeres Feld,
  UI zeigt den Legacy-Titel) — nie gekürzt oder „repariert".
- Qualität wird **beim Schreiben** gesichert, **nicht** später in der UI.

Beispiel `display_title` (`isValidDisplayTitle` in `understanding.js`): verwirft
Ellipsen, hängende Satzzeichen, schwache Funktionswort-Endungen (z. B. endet auf
„zur"/„für"/„und"/„gegenüber"), Ein-Wort-„Titel", Fragmente und Über-/Unterlänge.
Trennbare Verbpräfixe (z. B. „…bringt Gesetz **ein**", „…setzt Reform **um**",
„…lehnt … **ab**") bleiben bewusst gültig.

---

## 9. Akzeptanzkriterien (erfüllt durch dieses Dokument)

- [x] Die Datei `docs/knowledge-object-contract.md` existiert.
- [x] Sie erklärt klar **Raw Fields** und **Presentation Fields** (§3).
- [x] Sie dokumentiert `display_title`, `display_summary` (= „summary"),
      `why_relevant` und `recommendation` als offiziellen UI-Vertrag (§3–4).
- [x] Sie verbietet eigene Titel und eigene Zusammenfassungen im Frontend (§5).
- [x] Sie hält ausdrücklich fest, dass **keine zusätzlichen KI-Calls** für
      Standardanzeigen erlaubt sind (§2, §5, §7).
- [x] Sie grenzt Lage sauber von Helmut ab (§6).
- [x] Sie beschreibt, wie künftige fehlende Felder ergänzt werden (§7).

---

_Dieses Dokument beschreibt eine Architekturentscheidung und enthält keine
ausführbare Logik. Es wurde ohne Änderungen an Produkt-, Backend-, DB-, KI- oder
UI-Code angelegt._
