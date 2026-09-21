# 36er Pruefvertrag: echte Produktfaelle beider Fachpfade

21.09.2026 (Fassung 2: konkretisiert — Faelle, Pfade, Aufrufe, Kosten, Kriterien).
**Kein Lauf, keine Freigabe, keine Productionwirkung.** Diese Datei legt den
kleinsten belastbaren Rahmen fuer die 36er Fachabnahme fest. Die inhaltliche
Fallauswahl (sechs Sachklassen mit Negativfall, positivem Gegenfall und
fehlender/widerspruechlicher Grundlage) ist kanonisch im
[Prosaentwicklungsvertrag](prosa-belegplan-2026-09-20.md), Abschnitt
"Vorab festgelegte Gegenfaelle fuer beide Fachpfade" und wird hier **nicht**
dupliziert, sondern operationalisiert.

Der vorausgegangene 8-Fall-Vergleich hat ausschliesslich die **Pruefmethode**
der Praemissenpruefung abgenommen (8 von 8). Er ist **kein** Produkt- und
**kein** 500er-Nachweis.

---

## 1 · Fachliche Frage

Fuehrt der **echte Produktpfad** `lib/helmut/prosa-einordnung.js` jeden der 18
Fachfaelle in **beiden** Bereichen zu einer Ausgabe, die genau die ausgewiesenen
Sachverhalte traegt — und nichts darueber hinaus —, vollstaendig ueber alle
sichtbaren Felder, und bleibt sie nach **Speicherung und Ruecklesung**
unveraendert gueltig?

## 2 · Warum genau diese Faelle

- Sechs Sachklassen decken die bekannten Fehlerklassen ab: Sachgebiet/Finanzwirkung,
  Vollzug/Modalitaet, Rolle/Zuschreibung, Zeit/Frist, Profil/Zustaendigkeit,
  Bedingte Wirkung/Empfehlung.
- Je Klasse drei Fallarten erzwingen die Pruefung **in beide Richtungen** und der
  ehrlichen Grenze: Negativfall (muss scheitern), positiver Gegenfall (muss
  nutzbar bleiben), fehlende/widerspruechliche Grundlage (darf nicht zu einer
  Erfindung werden). Damit ist ein pauschales Ablehnen ebenso unzulaessig wie ein
  pauschales Bestaetigen.
- Beide Bereiche (`briefing` und `lage`) sind echte Produktpfade desselben
  Vertrags und unterscheiden sich in der Blockzahl (Briefing 1–4, Lage 2–4) und
  der geforderten Eigenstaendigkeit der Sachverhalte. **18 × 2 = 36 Pfadfaelle.**

## 3 · Die 36 Pfadfaelle

18 Fachfaelle (kanonische Tabelle) × die zwei Bereiche `briefing` und `lage`.
Jeder Pfadfall ist eindeutig benannt als `<klasse>/<art>/<bereich>`, z. B.
`finanzwirkung/negativ/briefing` … `bedingte-wirkung/unklar/lage`. Es sind genau
**36** verschiedene Pfadfaelle; keiner darf doppelt gezaehlt werden.

Dazu die dort benannten **Strukturfaelle** (keine Modellfaelle, deterministisch):
fremde Kennung, geaenderter Quellenhash, fehlende Teilbehauptung, neue freie
Felder sowie Speicherung samt Ruecklesung.

## 4 · Eingabevertrag (frozen)

- Je Fachfall eine vollstaendige, eingefrorene `basis` gemaess dem **echten**
  Eingabevertrag `lib/helmut/prosa-faktenplan.js` (`binde`) mit `profile`, `tag`,
  `fakten` (id, text, zweck, vorgangId, quelleId) und `quellen`
  (id, titel, auszug, url, veroeffentlichtAm), herkunftsgebunden und
  hashgesichert. Keine erfundenen Quellen, keine Katalogquellen, keine
  Wiederverwendung der alten gesperrten Faelle.
- Der Pfad wird **unveraendert** ueber `lib/helmut/prosa-einordnung.js`
  (`binde({basis, faktenPlan, bereich})`) gefahren; `bereich` ist genau
  `briefing` oder `lage`. Kein zweiter Formulierungsweg.
- Je Pfadfall ist der **Sollentwurf eingefroren** und liegt in der Fixture
  (`scripts/fixtures/prosa-36er.js`). Er ist **Eingabe des Pruefschritts**, nicht
  Modellausgabe. Belegter Grund: der deterministische Vertrag akzeptiert alle 36
  Sollentwuerfe; ein modellgenerierter Entwurf wuerde die falsche Aussage eines
  Negativfalls gar nicht erst enthalten. Eingefrorener Entwurf plus modell-
  gestuetzte Pruefung ist deshalb die einzige Fassung, die die Negativfaelle
  tatsaechlich prueft.
- Paket- und Eingabehashes werden **vor** dem Lauf berechnet und eingefroren;
  eine Abweichung stoppt (§8.6).

## 5 · Erwartetes Ergebnis je Fallart

| Fallart | Soll (beide Bereiche) |
| --- | --- |
| Negativfall | Die falsche Aussage erscheint **nicht**. Entweder der Entwurf wird server-seitig abgelehnt (z. B. `sachdetail-unbelegt`, `pruefung-abgelehnt`) oder das betroffene Einordnungsfeld bleibt `null`. **Nie** erfunden. |
| Positiver Gegenfall | Der Vertrag akzeptiert den Entwurf; **jedes** nichtleere Feld ist quellengebunden und nutzbar; die Pruefung bestaetigt alle fuenf Kriterien (`premissenGetragen`, `keineNeueTatsache`, `rollenUndModalitaet`, `mandatsbezug`, `nuetzlich`). |
| Fehlende/widerspruechliche Grundlage | Ehrliche Grenze: betroffenes Feld `null` oder Ablehnung; **kein** falsches "plausibel". "Nicht genannt" bleibt unbekannt, "nicht bestaetigt" wird nicht als "widerlegt" ausgegeben. |
| Strukturfall | Deterministisch **fail closed** abgelehnt (fremde Kennung, geaenderter Quellenhash, fehlende Teilbehauptung, neues freies Feld). |
| Speicherung/Ruecklesung | Ausgabe bleibt nach Speicherung und Ruecklesung byte-/hashgleich gueltig (`pruefe`); kein stiller Verlust, kein stilles Auseinanderlaufen. |

**Ausfuehrbarer Sollvergleich je Pfadfall:** `positiv` → `akzeptiert`;
`negativ` und `unklar` → `nicht-akzeptiert` (die Pruefung darf das betroffene
Feld **nicht** als `plausibel` bestaetigen). Genau diese Zuordnung ist das
Sollurteil; sie liegt getrennt vom Modellpayload.

## 6 · Qualitaets- und Vollstaendigkeitskriterien

- **Vollstaendigkeit:** alle sichtbaren Felder des jeweiligen Pfads werden
  erfasst (Tatsachenblock, Einordnungsfelder, Quellenangabe; bei `lage`
  mindestens zwei eigenstaendige, mandatsbezogene Sachverhalte).
- **Sachbindung:** keine neue Tatsache, kein neuer Akteur, kein Amt, Betrag,
  Frist oder Rechtsfolge; Zahlen stammen ausschliesslich aus den gelieferten
  Fakten (`sachdetail-unbelegt` bleibt aktiv).
- **Trennung:** `Belegte Quellenangaben` und `KI Einordnung · zusaetzlich geprueft,
  kann Fehler enthalten` bleiben sichtbar getrennt; kein unmarkierter Alias.
- **Ehrlichkeit:** leere Zustände werden benannt, nicht kaschiert (kein falsches Gruen).

## 7 · Modellaufrufe und Kosten

- Kein neues Modell: `gpt-5-mini`, reasoning low, gebundene Prompts
  (`entwurfsPrompt`, `pruefPrompt`) und Schema wie im unveraenderten Vertrag.
- Je Pfadfall wird genau **ein Pruefaufruf** gefahren (der Sollentwurf ist
  eingefroren, §4); fuer 36 Pfadfaelle hoechstens **36 Aufrufe**. Die formale
  Obergrenze aus der Erstfassung (Entwurfs- plus Pruefaufruf) bleibt **72**;
  erreicht werden hoechstens 36. **Kein Retry**, kein zweiter Aufruf, keine
  Wiederholung.
- Volle Reservierung je Aufruf gemaess `lib/helmut/testkosten-budget.js`
  (Kontextlimit, kein Tokenraten); unbekannte Ausgaenge bleiben voll reserviert.
- **Absolute Obergrenze bleibt der unveraenderte 4-USD-Tagesriegel.** Gemessene
  Ist-Kosten der beiden letzten Einzelaufrufe: **0,012763** und **0,012989 USD**;
  daraus ergibt sich fuer 36 Aufrufe eine **Groessenordnung unter 1 USD**. Die
  belastbare Aufrufzahl und Prognose wird aus dem echten Pfadcode erhoben und vor
  der Freigabe fixiert (§10.2). **Keine Budgeterhoehung.**
- Der Lauf bleibt auf **einen** UTC-Tag begrenzt (TAG-Fenster) und endet
  spaetestens mit dem Tagesriegel oder der Laufzeitgrenze.

## 8 · Harte Stoppbedingungen

Sofortiger Stop ohne Retry bei:

1. falschem Positivurteil (unbelegte Tatsache/Rolle/Frist/Pflicht erscheint als
   akzeptiert);
2. nicht nutzbarem Feld des positiven Gegenfalls (leer, obwohl getragen, oder
   nicht quellengebunden);
3. erfundenem Inhalt oder erfundener Quellen-URL;
4. nicht abgelehntem Strukturfall;
5. Speicher-/Rueckleseabweichung (`pruefe` nicht gebunden);
6. Abweichung vom eingefrorenen Paket (Hash), ungeklaerter Herkunft der Eingaben;
7. mehr als der festgelegten Aufrufe; Ueberschreitung der KI-Obergrenze oder des
   4-USD-Tagesriegels;
8. unvollstaendiger Quittung oder unbrauchbarer Belegbindung;
9. technischem Fehler ohne verwertbares Ergebnis (Timeout, kein HTTP 200, keine
   Antwortbytes, Transportabbruch).

## 9 · Umgang mit fehlenden, leeren, doppelten, unbrauchbaren Ergebnissen

- **Fehlendes Ergebnis** (kein Pfadfall reproduzierbar): gilt als **nicht
  bestanden**, nicht als Luecke — die Abnahme ist erst vollstaendig, wenn alle 36
  Pfadfaelle ein verwertbares Ergebnis haben.
- **Leeres Ergebnis** (kein Feld gefuellt, obwohl der Fall es traegt): abgelehnt.
- **Doppeltes Ergebnis** (derselbe Pfadfall zweimal, oder identische Ausgabe fuer
  zwei verschiedene Sachverhalte): ungueltig; die Eigenstaendigkeit wird ueber die
  Paarpruefung des Vertrags erzwungen.
- **Unbrauchbares Ergebnis** (ungueltiges JSON, Schemaverstoss, `pruefung-abgelehnt`):
  gilt als abgelehnt; keine Umdeutung in "bestanden".
- Ein **einzelner** nicht bestandener Pfadfall beendet die Abnahme (keine
  Mehrheitsregel); die uebrigen Ergebnisse bleiben als Beleg erhalten.

## 10 · Offene Punkte vor jeder Freigabe (verbindlich)

1. **18 Fachfaelle einfrieren:** als `basis` nach §4 formulieren, mit Hash; inkl.
   der Quellen/Fakten, die die positiven Klassen tatsaechlich tragen.
2. **Aufrufzahl belegen:** Anzahl/Art der Aufrufe je Pfadfall aus dem echten
   Pfadcode bestaetigen (Entwurfs-/Pruefpaar und etwaige Zusatzschritte).
3. **Ausfuehrer und Bindung:** einmaliger, fail-closed gebundener Ausfuehrer
   analog zum 8-Fall-Vertrag (eigener KEY, eigene Quittung, ein Lauf, kein Retry).
4. **Betreiberfreigabe:** konkrete Aufrufzahl, Kostenobergrenze und Startfenster
   ausdruecklich freigeben. Ohne diese Freigabe startet **kein** Aufruf.

## 11 · Was dieser Vertrag NICHT beweist

- Keine universelle Semantik- oder Fehlerfreiheitsgarantie (endlicher Testsatz).
- **Keinen 500er-Nachweis:** frische Quellenversorgung fuer exakt 500 Profile,
  1500 Ergebnispositionen und belastbare Zeit-/Kostenrechnung bleiben getrennt und
  offen.
- Keine Produktionsfreigabe, keine Profilaktivierung, keine Migration, keine
  Cron- oder Environmentaenderung, keine regulaere Speicherung von Produkttexten.
