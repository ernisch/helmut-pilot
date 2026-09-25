# Kein Dringlichkeitsbonus fuer "keiner", 25.09.2026

Der regulaere Understanding-Schemawert zeitdruck="keiner" erhielt in der
Entscheidungsengine8 Dringlichkeitspunkte, weil jeder nichtleere String als
Zeitdruck galt. Reproduktion: ein ausschliesslicher Ausschussbeleg ohne
Aehnlichkeit, Deadline oder weitere Bonussignale erhielt34 Punkte bei leerem
Zeitdruck, aber42/Beobachten bei "keiner". Das ist fachlich widerspruechlich
und verhindert eine belastbare500er Priorisierungsabnahme.

Die Korrektur akzeptiert fuer diesen Bonus nur die drei positiven
Schemawerte niedrig/mittel/hoch. "keiner", leere oder unbekannte Angaben
tragen keinen Zeitdruck. Eine separate Deadline bleibt ein eigenes Signal;
Zeitdruck plus Deadline zaehlen unveraendert nur einmal. Die Schwellen40/60,
sonstige Gewichte, Matching, Profile und Rohquellen bleiben unveraendert.
Kein Modell, keine Migration und kein manueller Daten-Backfill.

Gezielt52/52 Entscheidungspruefungen,20/20 Bereichsvertragsfaelle und19/19
Server-Client-Vertragspruefungen bestanden. Letztere melden5 bereits
additive Feldwarnungen, keinen Vertragsbruch. Der lokale HTTP-Test brauchte
lediglich einen Loopback-Port und lief ohne Production-Zugang.

Vor Merge beide Pflicht-CI-Jobs am exakten Head. Danach Production-Code und
betroffene Tagesprioritaeten rein lesend pruefen. Weniger angezeigte
Prioritaeten sind moeglich und werden vollstaendig ausgewiesen; keine
Schwellenabsenkung, um die alte Zahl wiederherzustellen. Rueckweg: gepruefter
Code-Revert. Der Fehler ist lokal reproduziert; Production-Rollout und
vollstaendige500er Nachkontrolle stehen noch aus.
