# Acht Quellenkorrekturen — konkreter Freigabeplan25.09.2026

**Konkret freigegeben, noch nicht ausgefuehrt.** Betreiberantwort25.09.:
„GO fuer diese acht Korrekturen“. CI/RolloutPR565 bleiben Vorbedingungen. Der einmalige30er Modelllauf bleibt verbraucht.
Aus dem Auftrag sind inzwischen11 Ergebnisse terminal gesperrt: drei um10:27,
acht weitere SELECT-bestaetigt10:32:09UTC. Texte und Quellen blieben erhalten.
Die bereits freigegebene Fehler-Sperrung umfasst keine neue Veroeffentlichung.

Dieser Plan korrigiert genau acht der gesperrten Ergebnisse redaktionell anhand
ihrer jeweils einen gelieferten Originalquelle und setzt nur diese acht wieder
auf neu/complete. Keine neuen Rohdaten, KOs oder Quellenverknuepfungen.

| Ergebnis | Konkrete Korrektur |
| --- | --- |
| Bundespolizeigesetz | Keine erfundene Ursache der wiederholten Abstimmung oder behauptete bereits wirksame Rechtsfolge. |
| BDI-Grundsatzpapier | Keine angeblich im Papier genannten Lieferketten-Diskussionen. |
| Boersenvorwuerfe Tuerkei | Keine angeblich berichteten Ermittlungen. |
| MPK-Vorsitz | Angekündigten Stand erhalten; nur AfD als belegte Kritikerin, auch in der Beteiligungsliste. |
| KI im Unterricht Singapur | Keine unbelegte Veroeffentlichung, staatliche Entwicklung/Pruefung oder konkrete Drittanbieter. |
| Stolpersteine Heidenau | Kommunale Entscheidung statt Landesentscheidung. |
| CNN-Zugang Weisses Haus | Internationale statt deutscher Bundesebene. |
| VW/Audi-Rueckruf | Fehlende Modelljahre/Abhilfemassnahmen ehrlich benennen; keine erfundene Handlungsfrist. |

Exakte Texte, alte Zeilen, Fingerabdruecke und geaenderte Felder:
`/private/tmp/helmut-frische30-acht-korrekturplan.json`.
Schreibplan: `/private/tmp/helmut-frische30-acht-korrekturen.sql`.
Leser: `/private/tmp/helmut-frische30-acht-korrekturen-lesen.sql`.
Rueckweg: `/private/tmp/helmut-frische30-acht-korrekturen-rueckweg.sql`.

0 Modellaufrufe,0 Modellkosten,0 Profilwrites/Aktivierungen. Eine Transaktion,
15 Sekunden pro SQL-Anweisung,2 Sekunden Sperrwartezeit. Vorbedingungen:
504 Profile/0 aktiv mit bekanntem Mandatshash, keine Jobs/Locks/Leases,
alle acht vollstaendigen KO-Zeilen hashgleich zum gelesenen gesperrten Stand,
acht unveraenderte Originalquellen samt eindeutiger Verknuepfung und Alter<48h.
Bei irgendeiner Abweichung Abbruch der gesamten Transaktion, kein Retry.
Nach dem Schreiben werden alle Felder aller acht Zeilen gegen den exakten
Entwurf geprueft, nicht nur ihre Anzahl. Eine separate Nurleseabfrage bestaetigt
anschliessend die Speicherung und die unveraenderten Profile/Kosten.

Schreibstatement auf Production mit EXPLAIN **ohne ANALYZE** in explizit
lesender Transaktion geprueft; keine Ausfuehrung der Aenderung. Reiner
Schema-Validator:8/8 Entwuerfe gueltig. Quellenbindung lesend:8/8 exakt.
Dies ist keine fachliche Gesamtabnahme und kein500er Funktionsnachweis.

Rueckweg bei nachtraeglichem Fehler: exakt diese korrigierten Zeilen erneut
terminal sperren; fehlerhafte alte Texte nicht wieder freigeben. Drei weitere
Faelle (Bundestag-Mix, Praesidenten-Mix, Schulstreik-Zeitstand) bleiben gesperrt
und benoetigen getrennte Ereignisaufteilung. Keine Migration oder Profilbereinigung.

**Erteiltes GO:** einmalige Anwendung genau dieser acht redaktionellen
Production-Korrekturen inklusive bedingtem Wieder-Sperren bei Nachkontrollfehler.
Erst nach gruener Pflicht-CI und ausgerollter EreignisreparaturPR565.
