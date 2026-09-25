# Ausschussbeleg Recht/Menschenrechte, 25.09.2026

## Belegter Fehler

Die vollstaendige lokale500er Lesepruefung aus dem Production-Snapshot
16:30:56.996900UTC meldete technisch190 frische Tagesanlaesse,21 veraltete
und289 leere. Das ist keine Fachabnahme. Bei41 Profilen erzeugt der neue
Vorgang zur Verwaltungsgerichtsreform einen falschen Mitgliedschaftsbeleg:
Der Rechtsausschuss wird mit dem Menschenrechtsausschuss gleichgesetzt.

Konkreter Vorgang:ko-vg-verwaltungsgerichtlicher-20260925-6ded8e.
Beispiele:test-kohorte-a-012 undtest-kohorte-a-017 haben Menschenrechte,
keinen Rechtsausschuss. Trotzdem entstand matched_features/ausschuss mit
ihrem Menschenrechtsausschuss und Score45/Beobachten. Das kurze Wort
"recht" gewann im alten unspezifischen Namensabgleich vor "menschenrechte".
Die gleiche Verwaltungsvorlage ist fuer test-kohorte-a-001 mit echtem
Rechtsausschuss dagegen korrekt zugeordnet.

## Begrenzte Korrektur

Nur der harte Mitgliedschaftsvergleich in matchedFeatures verwendet jetzt
den bereits vorhandenen spezifischen committeeMatchKey. Institutioneller
Zustaendigkeitsraum bleibt Pflicht. Vektorbildung, gespeicherte Vektoren,
Aehnlichkeitsrechnung, Suchfilter und Schwellen40/60 bleiben unveraendert.
Kein Profil, keine Quelle und kein Bedeutungsurteil wird angepasst.
Die Zahl falscher Ausschusspunkte sinkt; allgemeine fachliche Aehnlichkeit
bleibt zulaessig, belegt aber keine Mitgliedschaft.

Das Matching-Rezept steigt von legacy_relevance_v2 auf v3. Ohne diese
Aenderung wuerde die vorhandene Idempotenz alte falsche Belege erhalten.
Der naechste regulaere Lauf berechnet deshalb eine neue Generation;
der identische Folgelauf bleibt wieder idempotent. Kein manueller
Production-Backfill oder Modellstart. Alte Auditgenerationen bleiben erhalten.
Historische v1/v2-Vertraege werden weiter ausdruecklich mit v2 geprueft.

## Pruefungen und Grenze

30/30 Normalisierungspruefungen,88/88 institutionelle Ausschusspruefungen,
39/39 historische Rezeptpruefungen,178/178 Auditpruefungen,
60/60 Erklaerungsabdeckung und5/5 neuer v3-Generationsvertrag bestanden.

Mit allen500 unveraenderten Profilzeilen und genau dem genannten echten
Vorgang verglichen:41 falsche Ausschussbelege entfernt, jeweils exakt34
Punkte weniger; alle41 danach Ignorieren.459 Entscheidungen vollstaendig
unveraendert. Private vollstaendige Einzelbilanz:
/private/tmp/helmut-ausschussbeleg-41-vergleich.json.
Kein Profilwrite,0 Modelle,0 Kosten. Noch keine Production-Ausrollbestaetigung.

Die technische190er Versorgungszahl ist wegen dieser41 Fehlbelege nicht als
fachliche Versorgung verwendbar. Nach Rollout ist der echte Lesepfad zu
pruefen; die verbleibenden Versorgungsluecken muessen weiter geschlossen
werden. Die495 synthetischen Themen/Parteien bleiben unangetastet; sie werden
nicht auf vorhandene Quellen zugeschnitten.

Risiko: echte Belege koennten verloren gehen; die Gegenproben erhalten
Recht/Rechtsausschuss, Menschenrechte/Menschenrechtsausschuss und Arbeit/
Soziales. Rueckweg ist ein gepruefter Code-Revert, nicht das Loeschen von
Profilen oder Auditdaten. Kein500er Start und keine automatische Wiederholung
alter Fachlaeufe durch diese Reparatur.
