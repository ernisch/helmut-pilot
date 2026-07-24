# Referenzmethodik — Fachreview von Quellenpaketen

**Stand:** 2026-07-24 · **Gilt für:** ALLE Quellenpakete (Fachpakete, Landesmodule, künftige
Pakete) · **Autoren-Rolle:** politischer Research Director (fachlich), nicht Integrationstechnik

> **Zweck.** Diese Methodik legt fest, **wie** ein Quellenpaket fachlich bewertet wird — getrennt
> von seiner technischen Integrationsreife. Sie ist das fachliche Gegenstück zum technischen
> `quellenpaket-workflow.md` (der ausdrücklich sagt: „Modell … FACHLICH — hier nicht angefasst").
> Erst beide zusammen ergeben ein vollständiges Urteil über ein Paket.

---

## 0. Das Grundprinzip: zwei Ebenen, die sich niemals vermischen dürfen

Ein Quellenpaket wird auf **zwei voneinander unabhängigen Achsen** bewertet:

| Achse | Frage | Skala | Wer urteilt |
|---|---|---|---|
| **A — Fachliche Qualität** | Ist diese Quelle die richtige, wenn es keinerlei technische Grenzen gäbe? | **A / B / C** | Research Director (Fach) |
| **B — Technische Integrationsreife** | Können wir sie heute sauber, stabil, produktionsreif abrufen? | **Grün / Gelb / Rot** | Integrationstechnik / CI |

**Die eiserne Regel:** Ein technisches Rot senkt **niemals** eine fachliche Note. Ein technisches
Grün hebt **niemals** eine fachliche Note. Die beiden Achsen werden getrennt erhoben, getrennt
dokumentiert und erst am Schluss über eine feste Entscheidungsregel (§3) zu einer Kategorie
zusammengeführt.

> **Warum das zählt.** „GENESIS liefert heute einen HTTP-404" und „GENESIS ist fachlich
> ungeeignet" sind **zwei völlig verschiedene Aussagen**. Die erste ist ein Integrations-Ticket.
> Die zweite wäre ein fachlicher Fehler. Wer beide vermischt, wirft hochwertige amtliche
> Primärquellen wegen eines Timeouts weg — genau das verhindert diese Methodik.

Die technische Umsetzung beschreibt nur den **aktuell integrierten Zustand**. Sie ist **nicht**
die Wahrheit über die Zielarchitektur. Die Wahrheit über die Zielarchitektur liefert Achse A.

---

## 1. Achse A — Fachliche Qualität (A / B / C)

Bewertet die Quelle als **Herausgeber in ihrer Rolle** (nicht den Abrufweg). Sieben Kriterien:

| Kriterium | Frage |
|---|---|
| **Politische Relevanz** | Trifft die Quelle den politischen Kern des Paketthemas? |
| **Vollständigkeit** | Deckt sie ihren Bereich vollständig ab oder nur einen Ausschnitt? |
| **Aktualität** | Erscheint Neues zeitnah (laufend/periodisch/statisch)? |
| **Primärquelle?** | Ist sie Erstquelle (`official_primary`/`data_source`) oder abgeleitet/aggregiert? |
| **Zitierfähigkeit** | Kann man sich in einem Briefing/Vermerk auf sie berufen? |
| **Langfristige Bedeutung** | Bleibt sie über Wahlperioden hinweg relevant? |
| **Strategischer Wert** | Ist sie ein Früh-/Alleinstellungsindikator oder redundanter Zusatz? |

**Notenanker** (evidence_role als Startpunkt, dann Feinjustierung über die sieben Kriterien):

- **A — unverzichtbar.** Amtliche Primär- oder maßgebliche Datenquelle (`official_primary` /
  `data_source`), hohe Relevanz, vollständig für ihren Bereich, zitierfähig, langfristig,
  strategischer Früh-/Alleinstellungswert. **Gehört dauerhaft in die Zielarchitektur.**
- **B — solide, aber nicht tragend.** Echter fachlicher Nutzen, aber enger im Fokus, teils
  administrativ/nachgeordnet, redundant zu einer A-Quelle, oder geringeres strategisches Gewicht.
  Bleibt sinnvoll, ist aber ersetz- oder konsolidierbar.
- **C — schwach/randständig.** Fachfremd, Umsetzungs-/Marketingebene statt Politik, keine
  Primärquelle, oder vollständig durch eine bessere Quelle abgedeckt. **Entfernungskandidat.**

> Die fachliche Note ist **unabhängig davon**, ob die Quelle heute technisch erreichbar ist.
> Eine 404-liefernde A-Quelle bleibt eine A-Quelle.

---

## 2. Achse B — Technische Integrationsreife (Grün / Gelb / Rot)

Bewertet den **Abrufweg** (nicht den Herausgeber). Prüfmerkmale: HTML · RSS · Atom · XML · API ·
Auth notwendig · Rate Limits · robots · Stabilität · CI-verifiziert · produktionsreif.

- **Grün — produktionsreif.** Stabiler, maschinenlesbarer Zugang (RSS/Atom/API/strukturierter
  Download), CI-verifiziert erreichbar, kein blockierendes Auth-/robots-/Rate-Limit-Problem,
  geringes Bruchrisiko. **Kann nach Standard-Freigabe sofort aktiviert werden.**
- **Gelb — nutzbar mit Auflagen.** Erreichbar und einbindbar, aber mit Einschränkung:
  HTML-Scrape (fragile DOM-Selektoren), Suchformular-Endpunkt, Aktualität nicht maschinell
  messbar, mögliche Bot-Sperren (403/429) beim echten Crawl. Funktioniert **jetzt**, braucht aber
  Härtung/Monitoring vor oder kurz nach der Aktivierung.
- **Rot — heute nicht sauber integrierbar.** URL 404/veraltet, Timeout, erfordert
  Auth/Registrierung oder POST/strukturiertes Protokoll, das wir noch nicht gebaut haben, oder es
  ist nur eine Beschreibungsseite (kein realer Endpunkt verifiziert). **Rein technisch — keine
  fachliche Aussage.**

**Belegpflicht (Ehrlichkeit).** Jede technische Note **muss** ihren realen Nachweis nennen
(HTTP-Status + CI-Lauf/Datum). Jedes **Rot muss benennen, was genau fehlt** — anhand des
Fehlt-Katalogs:

`API` · `Authentifizierung` · `Feed (RSS/Atom/XML)` · `Crawler/Parser` · `URL-Nachrecherche` ·
`Rechtliche/robots-Prüfung`.

So ist „technisch momentan nicht integriert" nie mit „fachlich ungeeignet" verwechselbar.

> **Granularität (wichtige Verfeinerung).** Ein Herausgeber kann **mehrere Abrufwege** haben
> (Modell: „Ein Herausgeber kann mehrere Abrufwege haben"). Die **fachliche Note liegt am
> Herausgeber/Rolle**, die **technische Note am einzelnen Abrufweg**. Beispiel: Destatis (fachlich
> **A**) hat den HTML-Tabellen-Scrape (**Gelb**) *und* die GENESIS-API (**Rot**) — dieselbe
> A-Quelle, zwei Abrufwege auf verschiedenen Reifegraden.

---

## 3. Entscheidungsregel — von den zwei Achsen zur Kategorie

Die Kategorie ist eine Aussage über den **Lebenszyklus des Abrufwegs**, nicht über den fachlichen
Wert der Quelle. Eine fachlich-A-Quelle kann für ihren heutigen Scrape-Weg in Kategorie 3 stehen,
während ihr strukturierter Zielweg in Kategorie 2 (future_target) steht — die fachliche A bleibt
auf Achse A erhalten.

| Fachliche Qualität (A) | Technische Reife (B) des betrachteten Abrufwegs | → Kategorie |
|---|---|---|
| A | Grün (oder belastbares Gelb, HTML-Scrape als akzeptierter Endzustand) | **1 — ideal + sofort nutzbar** |
| A / B | **Idealer** Abrufweg Rot (Feed/API/Auth/URL fehlt) | **2 — future_target** (Übergangsweg darf parallel laufen) |
| B (oder A-Quelle über einen Stopgap-Weg) | Gelb, mit klar besserem Zielweg → später ersetzen | **3 — Übergang** |
| C | egal | **4 — entfernen / nicht aufnehmen** |

### Die vier Kategorien

- **Kategorie 1 — IDEAL + SOFORT NUTZBAR.** Fachlich hervorragend (A) **und** technisch
  einsatzbereit. → sofort produktiv (nach Standard-Freigabe).
- **Kategorie 2 — IDEAL, future_target.** Fachlich hervorragend, aber technisch noch nicht sauber
  integrierbar (GENESIS, strukturierte APIs, Auth erforderlich, POST statt GET, offizielle
  XML-Endpunkte, veraltete URLs hochwertiger Behörden). **Diese Quellen bleiben ausdrücklich
  Bestandteil der Zielarchitektur. Sie werden NICHT entfernt.** Status: **`future_target`**.
- **Kategorie 3 — Übergang.** Fachlich okay, technisch heute nutzbar, aber später durch einen
  besseren Weg (meist einen Kat-2-Zielweg) zu ersetzen.
- **Kategorie 4 — Entfernen.** Fachlich unnötig oder vollständig durch bessere Quellen ersetzt.

### Der Status `future_target` (Definition und technische Abbildung)

`future_target` ist eine **fachliche/architektonische Kennzeichnung**, kein Datenbank-Status. Das
Modell kennt heute die Path-Status `healthy|degraded|broken|needs_review|paused|archived` und die
Paket-Status `draft|prepared|active|paused|archived` — **kein** `future_target`. Ein Kat-2-Weg ist
technisch heute abgebildet als:

- **Abrufweg (noch) nicht angelegt** (z. B. GENESIS-REST — Endpunkt noch nicht ermittelt), **oder**
- **angelegt als `needs_review`/`manual`** mit dokumentiertem Ziel-Upgrade (z. B. HTML-Scrape heute,
  Feed/API als future_target).

Der Fachreview führt Kat-2-Quellen auf einer **stehenden `future_target`-Liste** mit dem konkreten
Fehlt-Katalog (§2) und der auslösenden Voraussetzung für die Höherstufung.

---

## 4. Vorlage (wiederverwendbar je Paket)

Jeder Fachreview eines Pakets besteht aus:

1. **Herausgeber-Bewertung (Achse A):** je Herausgeber die A/B/C-Note mit kurzer Begründung
   entlang der sieben Kriterien.
2. **Abrufweg-Matrix (Achse B → Kategorie):** eine Zeile je Abrufweg.

   | Herausgeber | Abrufweg (Rolle) | Methode | Fachl. (A) | Techn. (B) | Kategorie | Fehlt (§2) | Beleg (HTTP/CI) |
   |---|---|---|---|---|---|---|---|

3. **Kategorien-Zusammenfassung:** welche Quellen in Kat 1 / 2 / 3 / 4.
4. **`future_target`-Liste:** Kat-2-Quellen + Fehlt-Katalog + Höherstufungs-Auslöser.
5. **Sechs Abschlussfragen** (siehe §5).
6. **Verweise** auf das technische Rechercheprotokoll / die Verifikations-CSV / den CI-Lauf.

---

## 5. Sechs Pflicht-Abschlussfragen (je Paket zu beantworten)

1. Welche Quellen gehören zur **endgültigen Zielarchitektur**?
2. Welche Quellen bleiben **Übergangslösungen**?
3. Welche Quellen können **später ersetzt** werden?
4. Welche Quellen sollten wir **aktiv weiter erforschen**?
5. Welche **technischen Arbeiten** sind nötig, um die Zielarchitektur vollständig umzusetzen?
6. **Trägt die Methodik** auch für dieses Paket? (Abweichungen dokumentieren, Methodik nachziehen.)

---

## 6. Verhältnis zu bestehenden Dokumenten

| Dokument | Ebene | Aussage |
|---|---|---|
| **Diese Methodik** | fachlich (Meta) | Wie bewertet man ein Paket fachlich, getrennt von der Technik. |
| `<paket>-fachreview.md` | fachlich (Instanz) | Anwendung auf ein konkretes Paket (z. B. WBSB). |
| `<paket>-zielarchitektur.md` | fachlich (Ziel) | Ideale Langfristarchitektur ohne technische Grenzen. |
| `quellenpaket-workflow.md` | technisch | Nicht-destruktive Materialisierung in Seed-SQL, CI-Garantien, Runtime-Inertheit. |
| `02-zielarchitektur.md` | strukturell | Herausgeber/Abrufweg/Paket-Modell, Belegfunktionen, Google-News-Regel. |

Der Fachreview **ändert keinen Code** — nicht Workflow, nicht Registry, nicht Generatoren, keine
Aktivierung. Er ist die fachliche Grundlage, auf der später (in einem eigenen, freigabepflichtigen
Schritt) technische Integrationsarbeit und Aktivierung aufsetzen.

---

## 7. Prüfliste gegen die häufigsten Fehler

- [ ] Wurde die fachliche Note **ohne Blick auf die Technik** vergeben?
- [ ] Trägt jedes technische Rot einen **konkreten Fehlt-Katalog-Eintrag** (§2)?
- [ ] Wurde **keine** A-/B-Quelle allein wegen 404/Timeout auf C herabgestuft oder entfernt?
- [ ] Sind Herausgeber (fachlich) und Abrufweg (technisch) **getrennt** bewertet?
- [ ] Steht jede Kat-2-Quelle auf der **`future_target`-Liste** statt in Kat 4?
- [ ] Nennt jede technische Note ihren **realen Beleg** (HTTP + CI-Lauf/Datum)?
- [ ] Ist „mehr Quellen ≠ besser" berücksichtigt (Redundanz → Kat 3/4, nicht künstlich Kat 1)?
