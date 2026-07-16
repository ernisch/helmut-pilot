# Visuelle Fassung — Helmut Datenmotor Audit

> **⚠️ Statuskennzeichnung (verbindlich):** Die Dokumente in diesem Ordner sind ein
> **AUDITBERICHT und Umsetzungsplan** — die geprüfte Bestandsaufnahme und der
> Plan. Sie sind **ausdrücklich noch NICHT das endgültige Betriebsdokument.** Das
> endgültige Betriebsdokument (`docs/helmut_datenmotor_betriebslogik.md` + visuelle
> Fassung) entsteht erst **nach** Umsetzung und Production-Nachweis der
> P0/P1-Härtungen durch den Implementierungs-Thread.

**Stand:** 2026-07-16 · **Geprüfter Commit:** `427295c` (= `main` = Production)

---

## Inhalt dieses Ordners

### PDF (maßgebliche visuelle Fassung, extern gedruckt via HeadlessChrome)

| Datei | Inhalt | Seiten |
|---|---|---|
| `helmut_datenmotor_audit.pdf` | **Auditbericht** (Dokument 1 von 2) | 19 |
| `helmut_datenmotor_umsetzungsplan.pdf` | **Umsetzungsplan** (Dokument 2 von 2) | 9 |
| `helmut_datenmotor_audit_und_umsetzungsplan.pdf` | **Gesamtfassung** (Audit + Plan in einem) | 28 |

Die drei PDFs sind die vom Gründer gelieferten Original-Dateien (byte-identisch
abgelegt). Der Auditbericht und der Umsetzungsplan sind inhaltsgleich mit der
Gesamtfassung (verifiziert über Schlüsselzahlen); die Gesamtfassung ist die
zusammengeführte Variante.

### HTML (repo-wartbare visuelle Quelle mit Diagrammen)

| Datei | Zweck |
|---|---|
| `helmut_datenmotor_audit.html` | Visuelle Fassung im Helmut-Stil mit den sechs Diagrammen, Statuslegenden und der Fachbegriff-Legende. Theme-aware (hell/dunkel), druckbar. |

**Hinweis zur Herkunft (ehrlich):** Die Original-Druck-HTML, aus der die
gelieferten PDFs erzeugt wurden, lag **nicht** bei (die PDFs wurden extern via
HeadlessChrome gedruckt). `helmut_datenmotor_audit.html` ist daher eine
**inhaltsgleiche, repo-wartbare Reproduktion** der visuellen Fassung mit
zusätzlichen, selbst gezeichneten Diagrammen — kein pixelgenauer Nachbau des
PDF-Layouts. Die **maßgebliche Textfassung** bleiben die PDF- und
Markdown-Dokumente.

### Diagramme

| Ordner | Inhalt |
|---|---|
| `sources/*.svg` | Bearbeitbare Vektor-Quellen der 6 Diagramme (SVG = editierbarer Text) |
| `assets/*.svg` | SVG-Export (bindet die HTML ein) |
| `assets/*.png` | PNG-Export (1200 px Breite, für Einbettung ohne SVG-Unterstützung) |

| # | Diagramm | Deckt ab |
|---|---|---|
| 01 | Gesamtübersicht des Systems | Quelle → Crawl → Speicher → KI → Relevanz → Ausgabe |
| 02 | Tageszeitstrahl | 9 geplante Prozesse, 05:30-Kollisionsfenster (R14) |
| 03 | Datenfluss eines Dokuments | Weg Quelle → Briefing + Fehlerweg + Lebenszyklus |
| 04 | Risiko-Ampel | R1–R15 nach Schwere, verknüpft mit P0/P1 |
| 05 | P0/P1-Reihenfolge | verbindliche Reihenfolge + Abhängigkeiten + Freigaben |
| 06 | Landtag-Erweiterung | Bundestag → BE/BB, Dreifach-Sperre, Data vs. Code |

**Alle Diagrammwerte stammen aus dem Audit gegen Commit `427295c`. Keine
Fantasiewerte.** Echte Messwerte sind als solche gekennzeichnet (Etikett
„Messwert"), Annahmen/Planwerte als „Annahme" bzw. „Plan".

---

## Verwandte Dokumente (außerhalb dieses Ordners)

- `docs/helmut_datenmotor_audit.md` — Auditbericht (Textfassung, Teil I)
- `docs/helmut_datenmotor_umsetzungsplan.md` — Umsetzungsplan (Textfassung, Teil II)
- `docs/helmut_datenmotor_thread2_handoff.md` — **verbindliche Übergabe an Thread 2**

---

## PDF aus der HTML neu erzeugen (optional, lokal)

Chromium ist in der Arbeitsumgebung vorinstalliert. Die HTML kann bei Bedarf
lokal neu zu PDF gedruckt werden:

```
chromium --headless --no-sandbox --print-to-pdf=out.pdf \
  --no-pdf-header-footer docs/visual/helmut_datenmotor_audit.html
```

Das erzeugte PDF ersetzt **nicht** die gelieferten Original-PDFs, sondern ist die
druckbare Variante der HTML-Reproduktion.
