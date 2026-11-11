# Büro: fachlicher Gegencheck für Bundestag und Landtage

Stand: 11.11.2026. **Analyse abgeschlossen; keine Änderung der Auswahlregeln.**
Geprüfte Basis `7898fd5d` (derselbe Büro-Client wie der Livegang `57b342d6`).
Die einfache Oberfläche und die ausdrückliche Format-/Erstellaktion bleiben richtig.
Die verfügbare Themenmenge ist für ein parlamentarisches Arbeitsbüro zu eng.

## Was geprüft wurde

Zwölf ausdrücklich konstruierte, synthetische Fälle: sechs für Bundestag,
sechs für Landtag/Berlin. Tatsächliche Funktionen `applyStartPayload`,
`officeDecisions`, Quellenprüfung und `officeCommunicationBasis` aus dem
Repository, mit dem bestehenden VM-Aufbau der Büro-Ehrlichkeitsprüfung.
Zusätzlich vier Zuständigkeitsgegenproben für Ausschussfragen.

Die Rangfolge der Eingangsempfehlungen ist als Testeingabe vorgegeben.
Dieser Test misst weder die Qualität der vorgelagerten Bewertung noch die
Häufigkeit dieser Fälle im echten Betrieb. Beispiele und Fristen sind keine
Behauptungen über aktuelle Nachrichten oder wirkliche Parlamentsvorgänge.
Kein Browser-/Endkundentest, kein Quellenabruf, kein Modell oder Production-Aufruf.

[Ergebnisse](results.json), [reproduzierbarer Prüfaufbau](audit-source.txt).
Aus dem Repositorywurzelverzeichnis:

```sh
node scripts/lokal.js -- node docs/ui/buero-redaktionscheck-20261111/audit-source.txt
```

Die Ausführung schreibt nur eine neue `results.json` neben den Prüfaufbau.
Die abschließenden Gegenproben reproduzieren alle unten genannten Beobachtungen.

## Gegenüberstellung

Jede Zeile wurde mit beiden Mandatsebenen durchgespielt.

| Parlamentarischer Fall | Beobachtetes Verhalten | Fachliche Bewertung |
| --- | --- | --- |
| Ein geeigneter Ausschussvorgang | Ein Thema erscheint. | Passende Grundfunktion. |
| Drei geeignete Themen; Thema 3 enthält im Testbeleg eine Ausschussvorbereitung am Folgetag | Nur 1 und 2 sichtbar, obwohl 3 bereits im internen Dreierpool vorhanden ist. | Dritter Arbeitsanlass sollte erreichbar sein; daraus folgt keine automatische Veröffentlichung oder neue KI-Ausgabe. |
| Empfehlungen 1–3 haben zu kurze Zusammenfassungen; 4 ist ausreichend belegt | Büro zeigt 0 Themen; 4 erreicht die Büro-Prüfung nicht. | Die Begrenzung erfolgt vor der Prüfung der Eignung für Büro. Nur das Zweierlimit zu erhöhen behebt diese Lücke nicht. |
| Ausführliche Zusammenfassung, aber Quelle nur als URL ohne Originalauszug | Thema erscheint; Backend meldet `quellenbasis-fehlt`. | Kein Modellaufruf: finanziell sicher. Die normale Erstellaktion sollte den fehlenden Arbeitsstand früher erkennen und benennen. |
| Explizit ignorierter Vorgang | Wird nicht empfohlen. | Sinnvolle Schutzregel für Empfehlungen. Eine spätere bewusste Übernahme aus Lage wäre eine eigene Produktentscheidung mit Quellen-/Mandatsprüfung. |
| Hauptthema mit geringerem Gesamtwert neben zwei höher bewerteten Vorgängen | Hauptthema bleibt zuerst. | Absichtliche Kontinuität zum Briefing; kein eigenständiger redaktioneller Büro-Vorrat. Kein Nachweis eines falschen vorgelagerten Scores. |

### Zuständigkeitsprüfung

Bundestag mit Ausschuss und Landtag mit Land/Ausschuss lassen das unterstützte
Format Ausschussfragen zu. Landtag ohne Land und Bundestag ohne Ausschuss werden
mit `zustaendigkeit-offen` abgewiesen. Diese vier Gegenproben betreffen das
Vorhandensein des erforderlichen Kontextes, keine semantische Prüfung jeder Frage
auf parlamentarische Zuständigkeit. Das Format bleibt ausdrücklich ein
Arbeitsentwurf, keine automatisch formgerechte parlamentarische Anfrage.

## Drei reproduzierte Auswahllücken

1. **Zwei sichtbare Themen begrenzen den Arbeitsvorrat.** Ein drittes geeignetes
   Thema bleibt unerreichbar, auch wenn der Abgeordnete daran arbeiten möchte.
2. **Die Auswahl ist doppelt abgeschnitten.** Der gemeinsame Client-Pool wird
   zuerst auf drei Empfehlungen begrenzt; Büro filtert daraus und nimmt höchstens
   zwei. Ein geeigneter vierter Vorgang wird nicht nachgezogen.
3. **Angebot und Textbereitschaft unterscheiden sich.** Die UI verlangt einen
   gültigen direkten Quellenlink und eine hinreichende Vorgangszusammenfassung; der
   Generator verlangt zusätzlich verwertbaren Originalquellentext. Das Backend
   stoppt sicher vor dem Modell, die Oberfläche bietet dennoch eine erfolglose
   Erstellaktion an. Das ist keine belegte Geldverschwendung durch den Generator.

Codebelege: [Client-Pool](../../../client.js#L647),
[Büroaufnahme](../../../client.js#L7626),
[Quellenbasis vor Erstellung](../../../lib/helmut/ai.js#L210).
Die Entscheidungsbewertung berücksichtigt bereits Profiltreffer und einen
Zeitdruckbonus; diese Prüfung rechtfertigt weder eine neue willkürliche
Punktformel noch die Behauptung, Fristen würden serverseitig grundsätzlich ignoriert.

## Vorhandene Profilbefunde wiederverwenden

Der parallel bereits abgeschlossene [Profil-Wirkungscheck](../profil-wirkungscheck-20261111/README.md)
belegt gespeicherte Ausschussverluste, eine nur teilweise abgestufte Themenwirkung
und fehlende aktive Verbraucher für Termine. Außerdem entwertet das gesamte Profil
einschließlich `updatedAt` den Bürocache, selbst ohne bedeutsame Inhaltsänderung.
Diese Befunde wurden hier nicht erneut ausgeführt oder behoben. Eine Büro-Liste
kann einen vorgelagert verlorenen Ausschussbezug nicht durch zusätzliche Zeilen
reparieren. Kalender-/Terminvorbereitung ist damit noch nicht vollständig belegt.

## Empfohlener Zielvertrag – zur fachlichen Abstimmung

- **Briefing priorisiert, Büro hält Arbeitsanlässe erreichbar.** Büro erhält einen
  eigenen vollständigen Vorrat aus vorhandenen quellengebundenen, zum Mandat
  gehörenden Vorgängen. Keine zweite Quellensuche oder automatische Entwurfsserie.
- **Eignung vor Begrenzung prüfen.** Eindeutigkeit, Quellenstand und Mandatskontext
  werden vor der kompakten Präsentation berücksichtigt. Die vorhandene
  Briefing-Startseitenauswahl darf dabei nicht mitverändert werden.
- **Oben wenige Empfehlungen, darunter „Weitere Themen“.** Eine einzige ruhige
  Liste mit nachvollziehbarer Anzahl genügt; keine neuen Filterleisten oder
  Erklärungstexte an jeder Zeile. Volle Titel und Begründung bei Bedarf öffnen.
- **Bereitschaft früh zeigen.** Fehlenden Originaltext ehrlich benennen und die
  konkrete Erstellaktion daran ausrichten. Themenanzeige ist kein fertiger Text.
- **Handlungsbedarf nachvollziehbar machen.** Bei Bedarf kurz sagen, welcher
  belegte Ausschuss-, Wahlkreis- oder Fristbezug den Arbeitsanlass begründet.
  Beobachten begründet keine automatische öffentliche Positionierung.
- **Geldschutz beibehalten.** Format und Erstellung bleiben ausdrücklich gewählt;
  kein Hintergrundentwurf, kein automatischer Retry. Ein bloßes Profilspeichern
  sollte brauchbare Entwürfe nicht ohne fachlichen Grund entwerten.

**Genau ein nächster Schritt:** den begrenzten Aufnahmevertrag für Büro fachlich
festlegen und mit denselben Bundestags-/Landtagsfällen abnehmen; vorhandene
Profilfehler als Voraussetzung koordinieren. Noch kein Auswahl-, Profil- oder
Rankingfix, keine Aussage über perfekte Modellqualität.
