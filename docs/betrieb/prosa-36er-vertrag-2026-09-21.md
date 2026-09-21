# 36er Pruefvertrag: echte Produktfaelle beider Fachpfade

21.09.2026. **Entwurf; keine Freigabe, kein Lauf, keine Productionwirkung.**
Diese Datei operationalisiert die **bestehende** 36er Fachabnahme zu einem
kleinsten belastbaren Pruefrahmen. Die Fallauswahl selbst ist kanonisch im
[Prosaentwicklungsvertrag](prosa-belegplan-2026-09-20.md), Abschnitt
"Vorab festgelegte Gegenfaelle fuer beide Fachpfade", festgelegt und wird hier
**nicht** dupliziert. Der Vertrag ist **noch nicht freigabereif**: §9 nennt die
vor einer Freigabe verbindlich zu schliessenden Punkte.

Der vorausgegangene 8-Fall-Vergleich hat ausschliesslich die **Pruefmethode**
abgenommen (Semantik der Praemissenpruefung). Er ist **kein** Produkt- und
**kein** 500er-Nachweis.

---

## 1 · Fachliche Frage

Traegt die **echte Produktausgabe** je Pfadfall genau die ausgewiesenen
Sachverhalte — und nichts darueber hinaus —, vollstaendig ueber alle sichtbaren
Felder, und bleibt sie nach **Speicherung und Ruecklesung** unveraendert
tragfaehig?

## 2 · Auswahl der Faelle (kanonisch, unveraendert)

6 Klassen (Sachgebiet/Finanzwirkung · Vollzug/Modalitaet · Rolle/Zuschreibung ·
Zeit/Frist · Profil/Zustaendigkeit · Bedingte Wirkung/Empfehlung) × drei
Fallarten (Negativfall, positiver Gegenfall, fehlende/widerspruechliche
Grundlage) = **18 Fachfaelle**; je im globalen Briefing **und** im Lagepfad =
**36 Pfadfaelle**. Dazu die dort benannten Strukturfaelle: fremde Kennung,
geaenderter Quellenhash, fehlende Teilbehauptung, neue freie Felder sowie
Speicherung samt Ruecklesung.

## 3 · Eingabevertrag (vor Freigabe zu fixieren)

Die 18 Fachfaelle werden **aus dem wirklichen Eingabevertrag** formuliert und
mit vollstaendigen, eingefrorenen Eingaben (Quellen, Profil, Mandatsbezug)
samt Paket-Hash gebunden. Keine erfundenen Quellen, keine Katalogquellen, keine
Wiederverwendung der alten gesperrten Faelle. Vorher bekannte Fehlantworten
bleiben negative Referenzen; positive Beispiele werden **nicht** angepasst, um
einen Ansatz nachtraeglich bestehen zu lassen.

## 4 · Erwartetes Sollurteil je Fallart

| Fallart | Soll |
| --- | --- |
| Negativfall | Die falsche Aussage erscheint **nicht**; das betroffene Feld entfaellt oder bleibt ehrlich leer/partial. Nie erfunden. |
| Positiver Gegenfall | Alle im Feldvertrag geforderten sichtbaren Felder sind gefuellt, quellengebunden und nutzbar. |
| Fehlende/widerspruechliche Grundlage | Ehrliche Grenze (partial/leer); kein falsches "tragfaehig". "Nicht genannt" bleibt unbekannt. |
| Strukturfall | Die Manipulation wird **fail closed** abgelehnt (fremde Kennung, geaenderter Quellenhash, fehlende Teilbehauptung). |
| Neue freie Felder | Kein zweiter freier Formulierungsweg; keine Umgehung des Feldvertrags. |
| Speicherung/Ruecklesung | Ausgabe bleibt nach Ruecklesung gueltig; kein stiller Verlust, kein stilles Auseinanderlaufen. |

Alle sichtbaren Felder werden **vollstaendig** erfasst; ein bestandener
endlicher Testsatz bleibt dennoch **keine** universelle Semantikgarantie.

## 5 · Kosten, Aufrufe und Grenzen

- Kein neues Modell: `gpt-5-mini`, reasoning low, volle Reserve je Aufruf wie im
  bestehenden Geldmodell (`lib/helmut/testkosten-budget.js`).
- Je Pfadfall ein Entwurfs-/Pruefpaar: **hoechstens 2 Aufrufe je Pfadfall**,
  damit hoechstens **72 Aufrufe** insgesamt. **Kein Retry**, kein zweiter Aufruf.
- **Absolute Obergrenze ist der unveraenderte 4-USD-Tagesriegel.** Zusaetzlich
  gilt je Aufruf der bestehende Reservedeckel. Die Ist-Kosten der beiden
  gemessenen Einzelversuche lagen bei **0,012763** bzw. **0,012989 USD** je
  Aufruf; daraus ergibt sich eine **Groessenordnung** von deutlich unter 4 USD
  fuer 72 Aufrufe. Eine belastbare Aufrufzahl und Prognose wird **vor** der
  Freigabe aus dem echten Pfadcode erhoben (siehe §9.2).
- Aufruf- und Tagesdeckel bleiben unveraendert (`HELMUT_MAX_LLM_CALLS_PER_DAY`,
  4 USD). **Keine Budgeterhoehung.**
- Unbekannte Ausgaenge bleiben voll reserviert (kein Nachtrag, kein Loeschen).
  Jeder unbekannte Ausgang ist ein Stop (§6), nicht ein Retry.

## 6 · Harte Stoppbedingungen

Sofortiger Stop ohne Retry bei jeder der folgenden Bedingungen:

1. Falsches Positivurteil (unbelegte Tatsache, Rolle, Frist, Pflicht oder
   angenommene Leserposition erscheint als tragfaehig).
2. Ein gefordertes sichtbares Feld des positiven Gegenfalls bleibt leer oder
   ist nicht quellengebunden.
3. Erfundener Inhalt oder erfundene Quellen-URL.
4. Ein Strukturfall wird **nicht** abgelehnt.
5. Speicher- oder Rueckleseabweichung (stiller Verlust, stilles
   Auseinanderlaufen).
6. Abweichung vom eingefrorenen Paket (Hash), ungeklaerte Herkunft der Eingaben.
7. Mehr als die festgelegte Aufrufzahl; Ueberschreitung der KI-Obergrenze oder
   des 4-USD-Tagesriegels.
8. Unvollstaendige Quittung oder unbrauchbare Belegbindung.
9. Technischer Fehler ohne verwertbares Ergebnis (Timeout, kein HTTP 200, keine
   Antwortbytes, Transportabbruch).

## 7 · Belege und Quittungen

Je Aufruf: vollstaendige Anbieter-Rohantwort, Transportbeleg, Kostenbeleg und
Quittung, privat und rueckgelesen gesichert; die Sollurteile bleiben **getrennt**
von der Modellnutzlast und gehen nie in den Auftrag ein. Kein privater
Schluessel, kein Rohlog und keine Rohantwort liegen im Repository.

## 8 · Was dieser Vertrag ausdruecklich NICHT beweist

- Keine universelle Semantik- oder Fehlerfreiheitsgarantie (endlicher Testsatz).
- **Keinen 500er-Nachweis:** frische Quellenversorgung fuer exakt 500 Profile,
  1500 Ergebnispositionen und belastbare Zeit-/Kostenrechnung bleiben getrennt.
- Keine Produktionsfreigabe, keine Profilaktivierung, keine Migration, keine
  Cron- oder Environmentaenderung, keine regulaere Speicherung von Produkttexten.

## 9 · Offene Punkte vor der Freigabe (verbindlich)

1. **18 Fachfaelle einfrieren:** aus dem echten Eingabevertrag formulieren,
   inklusive der realen/qualifizierten Quellen und Profile, die die positiven
   Sachklassen tatsaechlich tragen; Paket-Hash bilden.
2. **Aufrufzahl belegen:** Anzahl und Art der Modellaufrufe je Pfadfall aus dem
   echten Pfadcode erheben (Entwurfs-/Pruefpaar und etwaige Zusatzschritte) und
   daraus die absolute KI-Obergrenze innerhalb des 4-USD-Riegels ableiten.
3. **Ausfuehrer und Bindung:** einmaliger, fail-closed gebundener Ausfuehrer
   analog zum 8-Fall-Vertrag (eigener KEY, eigene Quittung, ein Lauf, kein Retry).
4. **Betreiberfreigabe:** konkrete Aufrufzahl, Kostenobergrenze und Startfenster
   ausdruecklich freigeben. Ohne diese Freigabe startet **kein** Aufruf.

Bis §9.1–§9.4 geschlossen sind, gilt dieser Vertrag als **Entwurf** und ist
**nicht** startbereit.
