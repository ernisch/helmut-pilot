# Frische Versorgung: Themenlücke vor500

Production-Lesung26.09.16:11:19–16:11:45UTC nach beiden frischen Importen:
500 aktuelle Vorgänge,950 verknüpfte Quelldokumente vollständig gelesen,
500 unveränderte inaktive Profile. Der spätere korrigierte Pflege-Vorgang liegt
außerhalb dieses500er Vorgangsfensters und beeinflusst die Messung nicht.

Der echte Server-Builder wurde16:14:18UTC lokal mit diesen Leseprojektionen
ausgeführt:127 Profile mit Tagespriorität,373 ohne. Keine Modellaufrufe,
keine Production-Schreibzugriffe; kein Live-API-Mitschnitt und kein500er Test.
Die127 Ergebnisse verteilen sich auf Bundespolizeigesetz82, Steuerentlastung42
und Berlin-Wahl3. Zusätzliche Quellen allein haben die Lücke nicht geschlossen.

Eigene vollständige Nachprüfung16:29:23UTC verwendet den tatsächlichen
`tagesAnlass`-Vertrag samt ursprünglichem Berliner Tagesfenster und allen
Originalquellen:31 von490 verstandenen Vorgängen haben einen aktuellen Anlass.
Für keines der373 fehlenden Profile erreicht einer davon die bestehende
Relevanzschwelle40; höchster Wert38. Keine oberhalb der Schwelle verlorene
Tagesmeldung. Ältere passende Vorgänge ersetzen keinen aktuellen Anlass.

Alle490 verstandenen Vorgänge haben leere `tags` und `policy_field`;26 tragen
explizite Ausschussakteure. `knowledgeObjectFeatures()` kann Themen daher nur
aus einem tatsächlich handelnden Ausschuss ableiten. Profilthemen stammen aus
expliziten Schwerpunkten, nicht aus einer unabhängigen fachlichen Zuordnung zur
Institution. Der Merkmalsvektor ist absichtlich kein semantisches Embedding.

Nächster notwendiger Schritt: fachliche Themenversorgung aus den Quellen
getrennt von Akteursbeteiligung absichern. Bloße Wortgleichheit, erfundene
Ausschussakteure, Umdatierung, abgesenkte Relevanzschwellen oder Anpassung der
Testprofile an vorhandene Nachrichten sind kein Nachweis. Der alte
Tags-Backfill mit Budget-Bypass wird dafür nicht verwendet.

Private vollständige Belege: `nach-frische18/builder-page-0..4.json`,
`builder500-ergebnis.json`, `builder500-ausgaben.json`, `profile500.json`,
`relevanzdiagnose.json`; Runtimebasis`61d4772f4116dd04d07ab699cc60fa94daa9736a`.
Das ist ein belegter offener500er Startpunkt, keine vollständige semantische
Abnahme der500 Ausgaben.
