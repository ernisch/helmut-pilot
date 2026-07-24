# Quellenbewertung — Die verbindliche Drei-Achsen-Methodik

**Status:** verbindlich für **alle** Quellenpakete des Helmut-Datenmotors · **Ebene:** Kuratierung/Doku
**Gilt für:** jede Quelle (Abrufweg) und jedes Paket — Bund, Länder, Fachthemen, Partei-/Personenquellen
**Ändert nichts am Laufzeitverhalten:** rein dokumentarische Bewertungsebene. Kein Workflow, keine
Registry, keine Generatoren, kein Code, keine Aktivierung.

> **Kernsatz in einem Satz:** Jede Quelle wird auf **drei voneinander unabhängigen Achsen** bewertet —
> **wie belastbar** sie belegt (fachliche Qualität), **wie fertig** sie technisch ist (Integrationsreife)
> und **wie viel sie einem politischen Entscheidungsträger nützt** (strategischer Nutzen). Die Achsen
> dürfen sich **niemals gegenseitig beeinflussen**.

Diese Methodik **konsolidiert** die bisher über Einzelfelder verstreute Bewertungspraxis
(`evidenceRole`, `readiness`/`LIVE_URTEIL`, `produktnutzen`) zu **einer** verbindlichen Systematik und
**erweitert** die bewährte Zwei-Achsen-Bewertung um die dritte Achse „strategischer Nutzen".

---

## 0. Was bewertet wird — und was ausdrücklich NICHT

**Bewertungseinheit** ist die einzelne **Quelle = Abrufweg** (`retrieval_path`). Ein **Paket**
(`source_package`) erbt sein Bewertungsprofil als Aggregat seiner Wege (siehe §7).

**Diese Methodik bewertet die QUELLE — nicht den einzelnen Inhalt.** Das ist die wichtigste
Abgrenzung der gesamten Systematik:

| Ebene | Wer bewertet | Wann | Womit | Beispiel |
|---|---|---|---|---|
| **Quelle/Paket** (diese Methodik) | Mensch, kuratorisch | **einmalig** bei Aufnahme, selten revidiert | 3 Achsen (A/B/C · Ampel · Sterne) | „Der Bundestags-Feed ist fachlich A, technisch Rot, strategisch ★★★★★." |
| **Vorgang** (Laufzeit, `lib/helmut/scoring.js`, s. `08-…`) | Code, deterministisch | **bei jedem Crawl** neu | globale Wichtigkeit · persönliche Relevanz · Handlungsfähigkeit | „Dieser eine Gesetzentwurf ist heute wichtig/relevant/handelbar." |

Beide Ebenen sind **entkoppelt**: Eine ★★★★★-Quelle darf einen belanglosen Einzelvorgang liefern
(den das Laufzeit-Scoring niedrig rankt), und eine ★★☆☆☆-Quelle darf ausnahmsweise einen
Top-Vorgang liefern. **Das ist kein Widerspruch — es sind verschiedene Ebenen.** Wer die
Quellen-Sterne mit der Vorgangs-Wichtigkeit verwechselt, erzeugt genau die Doppelbewertung, die diese
Methodik vermeidet (siehe §8, Befund D1).

---

## 1. Achse A — Fachliche Qualität (A / B / C)

**Frage:** *Wie belastbar belegt diese Quelle einen Sachverhalt?* Reine Beleggüte — unabhängig davon,
wie nützlich oder wie fertig die Quelle ist.

Bildet direkt auf das bestehende Feld **`evidenceRole`** ab (`lib/helmut/quellenarchitektur/model.js`,
`EVIDENCE_ROLES`):

| Note | Bedeutung | `evidenceRole` | Beispiele |
|---|---|---|---|
| **A** | Amtlich/neutral, unmittelbar belegend | `official_primary`, `data_source` (Behörde/Statistik) | Bundestag/Plenum, Kabinett, Ministerien amtlich, DIP-Drucksachen, PARDOK, Destatis |
| **B** | Belastbar, aber interessen- oder redaktionsgefiltert | `direct_interest`, `journalistic` | Partei/Fraktion (primär nur für die **eigene** Position), Verbände, Gewerkschaften, Leit-/Fachmedien |
| **C** | Schwacher Beleg / nur Fundhinweis | `aggregator` | Google-News-Suchwege ohne eigenen Herausgeber, ungeprüfte Herkunft |

**Regel A1:** Die Note folgt der **Belegfunktion des Herausgebers**, nicht dem Thema und nicht der
Wichtigkeit. Eine Partei ist für ihre eigene Position **A-nah primär**, als neutraler Beleg aber **B**
(`direct_interest`) — genau diese Trennung leistet `evidenceRole`.

**Regel A2:** Ein Google-News-Suchweg ist **immer C**, auch wenn er inhaltlich ein A-Thema (z. B.
Bundestag) abdeckt. Er transportiert fremde Belege, ist aber selbst kein Herausgeber. (Deshalb ist er
als **Übergangsbrücke** wertvoll, siehe §6 — aber nie als fachliches Ziel.)

---

## 2. Achse B — Technische Integrationsreife (Grün / Gelb / Rot)

**Frage:** *Kann diese Quelle heute stabil und rechtssauber in Production laufen?* Ein reiner
Engineering-Zustand — die **einzige mutable** Achse.

Fasst die bestehenden technischen Teilsignale zu **einer** Ampel zusammen: `PATH_STATUS`
(healthy/degraded/broken/…), `readiness` (kandidat→verifiziert→bereit→aktiv), das datierte
`LIVE_URTEIL` (geeignet / geeignet mit Einschränkung / ablehnen / nicht_verifizierbar) sowie
`parserEffort`, `duplicateRisk`, `stabileAdresse`, `cost`.

| Ampel | Bedeutung | Typische Signale |
|---|---|---|
| **🟢 Grün** | Läuft ohne Vorbehalt in Production | `healthy` · `readiness ≥ verifiziert` · `LIVE_URTEIL = geeignet` · stabile Adresse · tragbarer Parser · kein Bot-Block |
| **🟡 Gelb** | Integrierbar **mit** Vorbehalt | `degraded`/`needs_review` · „geeignet mit Einschränkung" (z. B. Bot-Sperre 429/403 → server-seitiger Abruf nötig) · instabile Adresse · hoher `parserEffort`/`duplicateRisk` · `verifyBeforeActivation` offen |
| **🔴 Rot** | Heute **nicht** direkt integrierbar | `broken` · „ablehnen"/„nicht_verifizierbar" · hart gesperrt (BE/BB bis Freigabe) · Direktfeed tot |

**Regel B1:** Die Ampel ist **eine Momentaufnahme**, kein Urteil über den Wert der Quelle. Sie ändert
sich, sobald ein Feed repariert, ein Parser gebaut oder eine Freigabe erteilt wird. Rot ist ein
**Reparatur-Backlog-Eintrag**, kein Ausschluss.

**Regel B2 (Kosten & Betriebsstabilität gehören hierher):** Betriebsrisiko (z. B. Google-News-
Klumpenrisiko), Abrufkosten und Ausfallwahrscheinlichkeit sind Teil von Achse B — sie sind
Integrationseigenschaften, **keine eigene Achse** (siehe §8, Befund K1).

---

## 3. Achse C — Strategischer Nutzen (★☆☆☆☆ … ★★★★★)

**Frage:** *Wie viel nützt diese Quelle einem politischen Entscheidungsträger?* Bewertet **nicht die
Quelle an sich**, sondern ihren tatsächlichen Mehrwert für politische Arbeit — Entscheidungen,
Fristen, Risiken, Chancen.

Diese Achse **verfeinert und ersetzt** das bestehende grobe Feld **`produktnutzen`**
(hoch/mittel/niedrig) durch eine 5-stufige Skala. Es entsteht **kein zweites Nutzenfeld** — die alte
3-Stufung ist der Ankerwert (`hoch → 4–5★`, `mittel → 3★`, `niedrig → 1–2★`), die politische
Tier-Liste schärft ihn.

| Sterne | Stufe | Nutzen | Quellenarten |
|---|---|---|---|
| **★★★★★** | unverzichtbar | direkte politische Entscheidungen | Kabinettsbeschlüsse, Gesetzesverfahren, Bundestag/Plenum, Ausschüsse, Fristen & Beschlüsse, unmittelbare politische Risiken/Chancen |
| **★★★★☆** | sehr hoher Nutzen | naher Entscheidungsvorlauf | Ministerien, amtliche Presse (BPA/Landespressedienst), wichtige Behörden, Bundesrat |
| **★★★☆☆** | wichtiger Kontext | Einordnung & Frühwarnung | Verbände, wissenschaftliche Institute, Monitoring, Förderprogramme |
| **★★☆☆☆** | Hintergrundwissen | Beleg & Langfrist | Statistiken, Berichte, Studien, Langzeitentwicklungen |
| **★☆☆☆☆** | geringer unmittelbarer Nutzen | Nachschlagen | Archiv, Grundlagen, Nachschlagewerke, statische Informationen |

**Regel C1:** Die Sterne messen **politischen Handlungswert der Quellengattung**, nicht Beleggüte.
Deshalb kann eine amtliche Statistik fachlich **A**, aber strategisch **★★☆☆☆** sein (belastbar, aber
selten unmittelbar entscheidungsrelevant) — und eine Verbandsmeldung fachlich **B**, aber im
richtigen Politikfeld strategisch **★★★★☆**.

**Regel C2:** Der strategische Nutzen ist **profilunabhängig zu vergeben** (Nutzen der Gattung „für
politische Entscheidungsträger allgemein"). Die profilspezifische Zuspitzung („nützt **diesem**
Mandat heute") leistet das Laufzeit-Scoring, nicht diese Achse (siehe §0).

---

## 4. Die Bewertungskarte — verbindliches Format

Für **jede** Quelle werden künftig genau drei Werte dokumentiert, in fester Reihenfolge und Notation:

```
Fachliche Qualität   ·   Technische Integrationsreife   ·   Strategischer Nutzen
        A/B/C         ·          🟢 / 🟡 / 🔴            ·        ★☆☆☆☆ … ★★★★★
```

**Kurznotation:** `A · 🔴 · ★★★★★`  ·  `B · 🟢 · ★★★☆☆`  ·  `C · 🟢 · ★★★☆☆`

Reale Beispiele aus dem Ist-Katalog (Belegstellen: `28-quellenabdeckung-p2-5-readiness-diagnose.md`,
`landesmodule-*.js`):

| Quelle | Achse A | Achse B | Achse C | Kommentar |
|---|---|---|---|---|
| `rp-bundestag` (echter Direktfeed) | **A** | **🔴** (`broken`) | **★★★★★** | Parlament, amtlich, unverzichtbar — aber Direktfeed defekt |
| `rp-linksfraktion` (Fraktions-RSS) | **B** (`direct_interest`) | **🔴** (`broken`) | **★★★★★** | eigene Fraktions-Primärstimme; Direktfeed bot-gesperrt |
| `general-hib` (Bundestags-Pressedienst) | **A** | **🟢** | **★★★★★** | amtlicher Ersatz, läuft |
| Google-News-Proxy „Bundestag" | **C** (`aggregator`) | **🟢** | **★★★★★** | Übergangsbrücke für den defekten Direktfeed |
| `be-plenum` (PARDOK XML) | **A** | **🔴** (BE hart gesperrt) | **★★★★★** | Landesparlament, amtlich; bis Freigabe inaktiv |
| Destatis-/Statistik-Feed | **A** (`data_source`) | **🟢** | **★★☆☆☆** | belastbar, stabil — aber selten unmittelbar entscheidungsrelevant |

Die Tabelle zeigt bereits: **alle Achsenkombinationen kommen real vor.** Genau das regelt §5.

---

## 5. Verbindliche Regeln — die Achsen sind unabhängig

**Regel 1 (Unabhängigkeit).** Die drei Achsen messen drei verschiedene Dinge (Beleggüte ·
Engineering-Zustand · politischer Nutzen) und **beeinflussen sich niemals gegenseitig**. Keine Achse
darf eine andere hoch- oder herabstufen.

**Regel 2 (jede Kombination ist zulässig).** Es gibt **keine verbotenen Kombinationen**. Ausdrücklich
zulässig — und real:

- `A · 🔴 · ★★★★★` — fachlich top, technisch defekt, strategisch unverzichtbar (`rp-bundestag`). ✅
- `B · 🟢 · ★☆☆☆☆` — belastbar genug, sofort integrierbar, kaum strategischer Nutzen (z. B. ein
  stabiles Nachschlage-/Archivmedium). ✅
- `C · 🟢 · ★★★★★` — schwacher Beleg, aber sofort lauffähig und strategisch unverzichtbar
  (Google-News-Brücke für ein Parlament). ✅

**Regel 3 (kein Gesamtscore).** Die drei Achsen werden **niemals zu einer einzigen Zahl gemittelt**.
Ein Durchschnitt würde die Unabhängigkeit zerstören (eine rote Ampel würde einen ★★★★★-Nutzen
„verrechnen"). Entschieden wird über den **Entscheidungsleitfaden** (§6), nicht über einen Mittelwert.

**Regel 4 (hartes Ausschluss-Gate — steht VOR den Achsen).** Rechtlich/technisch **unzulässige**
Quellen werden gar nicht erst bewertet, sondern **ausgeschlossen** — unabhängig von A und ★★★★★:
Umgehung von Bot-Sperren/ToS („429 — NICHT umgehen"), hart gesperrte Module ohne Freigabe (BE/BB),
`dev_only`-Wege, urheberrechtlich unzulässige Übernahme. Das Gate ist **keine vierte Achse**, sondern
eine **Vorbedingung** (siehe §8, Befund F1).

---

## 6. Entscheidungsleitfaden — welche Quelle gewinnt?

Wenn zwei Quellen dieselbe inhaltliche Lücke füllen, entscheidet folgende **feste Prioritätsordnung**:

> **Strategischer Nutzen  ➜  Fachliche Qualität  ➜  Technische Integrationsreife**

Begründung der Reihenfolge:
1. **Strategischer Nutzen zuerst** — er definiert Helmuts Zweck. Eine strategisch wertlose Quelle
   lohnt keine Investition, egal wie sauber sie ist.
2. **Fachliche Qualität als zweites** — bei gleichem Nutzen zählt die Beleggüte (amtlich vor
   aggregiert).
3. **Technische Reife zuletzt** — sie ist die **einzige mutable** Achse und entscheidet daher nur das
   **Timing** (wann live), **nie** die langfristige Auswahl.

### Das geforderte Beispiel

| | Achse A | Achse B | Achse C |
|---|---|---|---|
| **Quelle A** | A | 🔴 Rot | ★★★★★ |
| **Quelle B** | B | 🟢 Grün | ★★★☆☆ |

- **Langfristig bevorzugt → Quelle A.** Höchster strategischer Nutzen **und** höchste fachliche
  Qualität — beides **dauerhafte** Eigenschaften. Die rote Ampel ist ein reparierbarer
  Engineering-Zustand, **kein** Grund, eine strategisch unverzichtbare Primärquelle aufzugeben.
  Quelle A kommt auf den **Reparatur-Backlog mit Vorrang**.
- **Kurzfristig integriert → Quelle B** (ist Grün, geht **sofort** live und hat tragbaren Nutzen) —
  **und** der Inhalt von Quelle A wird **sofort über eine Übergangsbrücke** geliefert (siehe unten).
- **Nur Übergang → die Brücke.** Ein grüner Behelf **geringerer** fachlicher Qualität (typisch ein
  `C · 🟢`-Google-News-Proxy), der Quelle A vertritt, **bis** deren Ampel auf Grün steht. Die Brücke
  trägt einen **Ablöse-Vermerk** und wird zurückgestuft/entfernt, sobald Quelle A grün ist.

### Verbindliche Entscheidungsregeln

**E1 — Rot verwirft nie hohen Wert.** Eine Quelle mit hohem strategischem Nutzen **und** hoher
fachlicher Qualität wird **wegen Rot niemals verworfen**. Rot ⇒ Reparatur-Backlog **plus**
Übergangsbrücke. (Realer Präzedenzfall: `28-…` priorisiert ausdrücklich die Reparatur von
`rp-bundestag` + `rp-linksfraktion`, statt sie zu streichen.)

**E2 — Übergang ist immer befristet und markiert.** Jede Brücke, die eine rote Quelle vertritt, ist
als **Übergang** gekennzeichnet und wird abgelöst, sobald die Zielquelle grün ist — oder als
**redundant** zurückgestuft, falls sie inhaltlich vollständig in der grünen Zielquelle aufgeht.

**E3 — Grün + hoher Nutzen geht sofort live**, unabhängig von parallelen Reparaturvorhaben.

**E4 — Gleichstand:** Bei gleichem Nutzen **und** gleicher Qualität gewinnt die **grünere** Ampel
(schneller live). Bei komplettem Gleichstand entscheidet **Redundanzvermeidung** (die Quelle, die
weniger mit bestehenden Wegen überlappt — Portfolio-Sicht, siehe §8, Befund R1).

**E5 — Ausschluss vor Auswahl.** Verletzt eine Quelle das harte Gate (Regel 4), scheidet sie **vor**
jeder Achsenabwägung aus — auch als Brücke.

---

## 7. Aggregation auf Paketebene

Ein **Paket** wird nicht separat „neu bewertet", sondern **liest sich als Aggregat** seiner Wege:

- **Fachliche Qualität des Pakets:** die **beste erreichbare** Note für jede Pflicht-/Kernklasse
  (ein Paket ist so belastbar wie seine besten Primärquellen je Klasse — nicht der Durchschnitt).
- **Technische Integrationsreife des Pakets:** die **schwächste** Ampel unter den **Pflichtwegen**
  (ein Paket ist erst grün, wenn alle Pflichtklassen grün sind — deshalb bleiben BE/BB `prepared`,
  solange Pflichtwege rot sind).
- **Strategischer Nutzen des Pakets:** der Nutzen seines **Zwecks** (`purpose`) — ein Basispaket
  „Bund Basis" trägt den Nutzen seiner unverzichtbaren Kernklassen, nicht den Mittelwert aller Wege.

Das deckt sich mit der bestehenden Paket-Semantik (`is_base`, `required_classes`, `status`
draft/prepared/active/paused/archived) — es kommt **kein** neues Paketfeld hinzu.

---

## 8. Kritische Prüfung & Vereinfachung

Auftragsgemäß die komplette Methodik gegen Widersprüche, Doppelbewertungen, unnötige Komplexität und
fehlende Dimensionen geprüft — mit den vorgenommenen Vereinfachungen:

**D1 — Doppelbewertung Quelle ↔ Vorgang (aufgelöst durch Ebenentrennung).** Der „strategische Nutzen"
(Achse C) und das Laufzeit-Scoring (`scoring.js`: globale Wichtigkeit/Relevanz/Handlungsfähigkeit)
klingen ähnlich. Sie sind es nicht: Achse C bewertet **die Quelle einmalig**, das Scoring **jeden
Vorgang laufend**. **Regel:** Achse C nie profil-/tagesabhängig vergeben; das leistet das Scoring.
→ keine Doppelbewertung, solange die Ebene (§0) eingehalten wird.

**D2 — Doppeltes Nutzenfeld (vereinheitlicht).** `produktnutzen` (hoch/mittel/niedrig) existierte
bereits. Achse C **ersetzt** es (5 Sterne) statt daneben zu treten — **ein** Nutzenbegriff, nicht zwei.

**K1 — Über-Zerlegung der Technik (auf eine Ampel reduziert).** `status`, `readiness`, `LIVE_URTEIL`,
`parserEffort`, `duplicateRisk`, `stabileAdresse`, `cost` sind **Belege für die Ampel**, keine eigenen
Achsen. Sie werden zu **einem** Signal (Grün/Gelb/Rot) zusammengefasst. Auch Kosten/Betriebsrisiko
bleiben **in** Achse B — keine vierte „Kosten-Achse".

**F1 — Fehlende Dimension: Rechtmäßigkeit/Compliance (ergänzt als Gate, nicht als Achse).** Eine
graduelle Bewertung würde eine unzulässige Quelle (Bot-Umgehung, gesperrtes Modul) durch A/★★★★★
„überstimmbar" machen. Deshalb ist Compliance ein **hartes Ausschluss-Gate vor** den Achsen (Regel 4),
keine bewertete vierte Achse. Das hält das Modell bei drei Achsen **und** schließt die Lücke.

**R1 — Fehlende Dimension: Redundanz/Portfolio (verortet im Leitfaden, nicht als Achse).** „Deckt eine
andere Quelle das schon ab?" ist eine Eigenschaft des **Zusammenspiels**, nicht der Einzelquelle. Sie
gehört in die Entscheidung (E4/E2 Dedup & Ablöse), nicht auf eine Bewertungsachse.

**Widerspruchsprüfung:** Das alte Feld `recommendation` (empfohlen/mit_einschraenkung/abgelehnt) wird
zur **abgeleiteten Ausgabe** des Leitfadens (§6), **nicht** zu einer konkurrierenden vierten Achse —
sonst gäbe es zwei Stellen, die „ja/nein" sagen.

**Ergebnis der Vereinfachung:** **3 bewertete Achsen + 1 hartes Ausschluss-Gate.** Kein Gesamtscore,
kein Parallel-Nutzenfeld, keine Technik-Zerfaserung, klare Trennung vom Laufzeit-Scoring. Einfacher
geht es nicht, ohne eine echte Dimension zu verlieren.

---

## 9. Abschluss — die drei Fragen

**1. Ist diese Methodik stabil genug, um alle zukünftigen Quellenpakete damit zu bewerten?**
**Ja — innerhalb ihres klar gezogenen Scopes** (sie bewertet **Quellen/Pakete**, nicht **Vorgänge**).
Die drei Achsen sind orthogonal, bilden je auf ein bereits gepflegtes Feld ab und trennen dauerhafte
Urteile (Qualität, Nutzen) vom mutablen Engineering-Zustand (Reife). Für jedes künftige Paket — Länder,
neue Politikfelder, weitere Partei-/Personenquellen — genügt: pro Weg drei Werte vergeben, Paket per
§7 aggregieren, per §6 entscheiden. Keine Sonderregeln.

**2. Fehlt noch etwas Grundsätzliches?**
Zwei Dinge, die die kritische Prüfung sichtbar gemacht und **bereits eingebaut** hat: das
**Compliance-Ausschluss-Gate** (F1, als Vorbedingung) und die **Redundanz-/Portfolio-Sicht** (R1, im
Leitfaden). Kosten und Betriebsstabilität sind in Achse B abgedeckt. Mit diesen dreien ist der Rahmen
**vollständig** — es fehlt nichts Grundsätzliches mehr für die Quellenbewertung.

**3. Warum ist diese Methodik langfristig skalierbar?**
- **Additiv statt strukturell:** eine neue Quelle = **eine Zeile mit drei Werten**. Kein neues Feld,
  kein neuer Prozess, keine Migration.
- **Entkopplung schützt vor Verfall:** weil die Achsen sich nie beeinflussen, „vergiftet" eine
  schlechte Achse die anderen nicht; Re-Bewertung ist **lokal und billig**.
- **Dauerhaft vs. mutabel getrennt:** nur die Ampel ändert sich häufig (Feeds gehen kaputt/werden
  repariert); Qualität und Nutzen sind stabil → **geringe Pflegelast** über Jahre.
- **Kein Konflikt mit dem Datenmotor:** rein kuratorische Doku-Ebene, sauber getrennt vom
  Laufzeit-Scoring (`scoring.js`). Wachsende Quellenzahl destabilisiert weder Ranking noch Code.
- **Neue Pakettypen fügen sich ohne Sonderregeln ein:** Länder- und Fachfeld-Pakete slotten über
  dieselben drei Achsen + §7-Aggregation ein — die Systematik wächst mit dem Katalog, ohne selbst zu
  wachsen.

**→ Fazit:** Die Methodik ist **möglichst einfach** (drei Achsen, ein Gate, kein Gesamtscore) und
zugleich **dauerhaft tragfähig** (orthogonal, additiv, entkoppelt). Sie ist ab sofort die verbindliche
Grundlage für die Bewertung **aller** Helmut-Quellenpakete.

---

### Anhang — Feld-Abbildung (Referenz)

| Achse | Verbindliche Werte | Bestehendes Feld | Belegstelle |
|---|---|---|---|
| A — Fachliche Qualität | A / B / C | `evidenceRole` | `lib/helmut/quellenarchitektur/model.js` (`EVIDENCE_ROLES`) |
| B — Technische Integrationsreife | 🟢 / 🟡 / 🔴 | `PATH_STATUS` + `readiness` + `LIVE_URTEIL` (+ parserEffort/duplicateRisk/stabileAdresse/cost) | `model.js`, `seeds/landesmodule-kandidaten.js`, `seeds/landesmodule-verifikation.js` |
| C — Strategischer Nutzen | ★☆☆☆☆ … ★★★★★ | verfeinert `produktnutzen` | `seeds/landesmodule-kandidaten.js` |
| (Gate) Compliance | zulässig / ausgeschlossen | `activation_mode` (`dev_only`), Bot-Sperre, BE/BB-Sperre | `model.js` (`ACTIVATION_MODES`), `seeds/landesmodule-verifikation.js` |

*Diese Datei ist reine Dokumentation. Sie ändert kein Laufzeitverhalten, keine Registry, keine
Generatoren und aktiviert nichts.*
