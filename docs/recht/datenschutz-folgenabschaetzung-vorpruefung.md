# Datenschutz-Folgenabschätzung (DSFA) — technische Vorprüfung

> **Status: TECHNISCHE VORPRÜFUNG, KEINE Rechtsentscheidung.** Dieses Dokument
> bewertet aus **technischer** Sicht, ob eine DSFA nach Art. 35 DSGVO nötig ist, und
> liefert das technische Datenschutz-Inventar. Es trifft **keine** Aussage über die
> Rechtsgrundlage (Art. 6/9) — das ist ausdrücklich einer juristischen Prüfung
> vorbehalten. Bezug: `docs/helmut_datenmotor_audit.md`, `docs/recht/*`.

| | |
|---|---|
| **Verarbeitung** | Überwachter Bundestagspilot: automatisierte Sammlung + KI-Analyse öffentlicher politischer Vorgänge, personalisiert je Mandat |
| **Erstellt** | 2026-07-16 · technische Vorprüfung durch Thread 2 |
| **Nicht enthalten** | Rechtsgrundlage, Interessenabwägung, Betroffenenrechte-Prozess (juristisch) |

## 1. Verarbeitet Helmut besonders schutzbedürftige Daten (Art. 9)?

**Technischer Befund: JA.** Der Motor verarbeitet und leitet ab:
- **politische Meinungen / Parteizugehörigkeit** (Mandatsprofil: Partei/Fraktion; KO:
  `parteien`, `decision_level`, Bewertungen),
- daraus **abgeleitete personenbezogene Relevanz** (Matching Vorgang↔Mandat, Scoring).

Diese Daten sind im technischen Inventar (§4) ausdrücklich als **Art. 9 — besonders
schutzbedürftig** markiert (`lib/helmut/retention.js` `DATA_CLASSES.*.art9`).

## 2. DSFA-Auslöser (Art. 35 Abs. 3 + WP248-Kriterien)

| Kriterium (WP248) | Trifft zu? | Technischer Beleg |
|---|---|---|
| Systematische Bewertung/Scoring von Personen | **JA** | `scoring.js` (Wichtigkeit/Relevanz/Handlungsfähigkeit), `matching.js` |
| Automatisierte Entscheidungen mit Wirkung | teilweise | `decisions.js` erzeugt Relevanz-/Prioritätsentscheidungen (heute Vorschlag, kein Rechtsakt) |
| Besondere Datenkategorien (Art. 9) | **JA** | politische Meinung/Partei (§1) |
| Umfangreiche Verarbeitung | **JA** | 145 Quellen, 5733 raw_documents, 314 KOs, 2× täglich |
| Innovative Nutzung / KI | **JA** | externe KI (Azure OpenAI `gpt-5-mini`) für das Textverständnis |
| Datenzusammenführung | **JA** | Quelle→Dokument→KO→Entscheidung→Briefing je Mandat |
| Betroffene ohne eigene Kontrolle | teilweise | Vorgänge nennen Dritte (Abgeordnete, Amtsträger) |

**Technische Einschätzung:** Mehrere DSFA-Kriterien sind erfüllt (Scoring + Art. 9 +
umfangreich + KI). Eine **DSFA ist aus technischer Sicht angezeigt** — die
**verbindliche Feststellung ist eine juristische/datenschutzrechtliche Entscheidung.**

## 3. Bewertung der genannten Prüfpunkte

| Prüfpunkt | Technischer Stand nach Thread 2 |
|---|---|
| Systematische Bewertung von Personen | Scoring/Matching deterministisch, nachvollziehbar; **Scharfschalten Scoring (E5) freigabepflichtig** |
| Politische Profile | je Mandat; als Art. 9 markiert; Mandantentrennung getestet (§4) |
| Automatisierte Relevanzentscheidungen | on-read, deterministisch; Understanding-Priorisierung (P1-3) **default aus** |
| Umfangreiche Verarbeitung politischer Infos | Datensparsamkeit erzwungen (≤240-Zeichen-Summary, kein Volltext) |
| Externe KI-Anbieter | Azure OpenAI (EU-Region); nur minimierte Cluster-Metadaten im Prompt, kein Volltext (siehe `docs/recht/datenfluss-dienstleister-avv.md`) |
| Mandantentrennung | RLS aktiv; App-Schicht-Guard (`assertTenant`); **automatisiert getestet** (`mandantentrennung-test.js`) |
| Monitoring/Protokollierung | Fehler-Metadaten ohne PII (P0-3), Alarm-Payload ohne Inhalte (P1-7), Secrets redigiert |

## 4. Technisches Datenschutz-Inventar (je Datenart)

Für die Art.-9-relevanten Daten — **welche Daten, warum technisch nötig, woher, an
welche externen Dienste, wie lange, wie löschbar, welche Rechtsprüfung offen:**

### 4.1 Politische Analyse (`knowledge_objects`) — Art. 9
- **Welche Daten:** Ebene (`decision_level`), Parteien/Ausschüsse/Ministerien,
  Bewertung (Wichtigkeit/Risiko/Chance), Handlungsempfehlung.
- **Warum technisch nötig:** Kern des Produkts — ohne Analyse kein Briefing/Radar.
- **Woher:** abgeleitet aus öffentlichen `raw_documents` via KI-Verständnis.
- **Externe Übertragung:** minimierte Cluster-Metadaten an Azure OpenAI (EU) für das
  Verständnis; **kein Volltext, keine Nutzeridentität** im Prompt.
- **Aufbewahrung:** Empfehlung 365 Tage (§Matrix), freizugeben.
- **Löschung:** `deleteProfileDataV3` (nutzergebunden) + Retention-Werkzeug (Kaskade).
- **Offene Rechtsprüfung:** Rechtsgrundlage (Art. 6/9), Verhältnismäßigkeit, DSFA-Pflicht.

### 4.2 Mandatsprofil (Partei/Fraktion/Ebene) — Art. 9
- **Welche Daten:** Partei/Fraktion, politische Ebene, Ministerien-Bezug, Wahlkreis.
- **Warum nötig:** Personalisierung (Relevanz je Mandat).
- **Woher:** Nutzer-/Onboarding-Eingabe.
- **Externe Übertragung:** KEINE an KI (Profil bleibt in Supabase/EU); nur intern.
- **Aufbewahrung/Löschung:** nutzergebunden, per Profil löschbar.
- **Offene Rechtsprüfung:** Einwilligung/Rechtsgrundlage, Betroffenenrechte.

### 4.3 Nutzer-Ausgabe (`briefings`) — politisches Profil
- **Welche Daten:** personalisiertes Briefing-Payload (politische Schwerpunkte).
- **Externe Übertragung:** KEINE (nur Web-Push-Trigger, ohne Inhalt).
- **Aufbewahrung:** 90 Tage (Empfehlung); Löschung nutzergebunden.

### 4.4 Öffentliche Quellen (`raw_documents`) — kann Personen nennen
- **Datensparsamkeit:** nur Titel + Summary ≤240 Zeichen, **kein Volltext** (by design).
- **Externe Übertragung:** minimierte Metadaten an Azure (Verständnis).
- **Aufbewahrung:** 180 Tage (Empfehlung).

## 5. Was eine juristische/datenschutzrechtliche Freigabe benötigt

1. **Feststellung der DSFA-Pflicht** (Art. 35) und ggf. Durchführung der vollen DSFA.
2. **Rechtsgrundlage** für Art.-9-Verarbeitung (politische Meinung).
3. **Aufbewahrungsfristen** je Datenklasse (§Matrix) verbindlich festlegen.
4. **AVV mit Azure OpenAI** prüfen/bestätigen (`docs/recht/datenfluss-dienstleister-avv.md`).
5. **Betroffenenrechte-Prozess** (Auskunft/Löschung Dritter, die in Vorgängen genannt sind).
6. **Scoring/Priorisierung scharfschalten** erst nach Bewertung der Wirkung (E5, P1-3).

## 6. Technische Maßnahmen bereits umgesetzt (Nachweisbasis)

- Datensparsamkeit (kein Volltext; Allowlists in Telemetrie/crawlRun).
- Fehler-Metadaten ohne PII + Secret-Redaction (P0-3, `redact.js`).
- Alarmkanäle nur technischer Status (P1-7, `alarm-payload.js`).
- Mandantentrennung automatisiert getestet (`mandantentrennung-test.js`).
- Retention-Werkzeug + referenzielle Integrität (Trockenlauf, `retention.js`).

> Diese Vorprüfung ersetzt **keine** DSFA und **keine** Rechtsberatung. Sie stellt die
> technische Faktenbasis bereit, damit die datenschutzrechtliche Bewertung fundiert
> erfolgen kann.
