# Sieben amtliche Quellen: redaktionelle Verarbeitung am 25.09.2026

## Ziel und Abnahme

Der verbrauchte Modellauftrag b hinterliess eine Renten-Dublette und sechs
unverarbeitete amtliche Quellen. Der gemischte Altvorgang wurde separat gesperrt.
Dieser kostenfreie Plan verarbeitet exakt die sieben bereits importierten
Quellen anhand ihrer gebundenen Originalabsaetze. Erfolg bedeutet sieben
schemagueltige, quellengetreue complete-Vorgaenge mit zehn korrekten Links,
eine gesperrte Dublette ohne Link und unveraenderte Rohquellen/Profile.
Das ist weder eine Modellabnahme noch der500er Production Nachweis.

## Konkreter Umfang

| Quelle | Aenderung | Belegte Einordnung |
|---|---|---|
| Fruehstartrente,21/7864 | Bestehenden Vorgang fortschreiben, neue Dublette sperren | Erste Lesung, Finanzausschuss; kein Gesetzesbeschluss |
| Tankrabatt | Bestehenden Vorgang fortschreiben | Bundestagsbeschluss,434:128; Bundesrat und tatsaechlicher Pumpenpreis nicht belegt |
| Zwei AfD-Antraege | Neuer gemeinsamer Absetzungs-Vorgang | Beratung abgesetzt; keine erfolgte Innenausschussueberweisung |
| Bundeszentrale,21/8074 | Neuer Vorgang | Gruenen-Entwurf an Innenausschuss ueberwiesen |
| Solidarprinzip,21/7970 | Neuer Vorgang | Linken-Antrag an Arbeit und Soziales ueberwiesen |
| CO2-Preis,21/7869 | Neuer eigenstaendiger Vorgang | Regierungsentwurf an Umweltausschuss; Preisstabilitaet noch kein geltendes Recht |
| Tabaksteuer,21/7859 | Neuer Vorgang | Regierungsentwurf an Finanzausschuss; keine erfundenen Steuersaetze |

Genau5 neue KOs,2 Fortschreibungen,1 gesperrte Dublette. Eine Quellenbindung
wird verschoben,6 werden angelegt. Alle7 Rohquellen bleiben byte-/feldgleich.
Bestehende3 historische Links bleiben. Herkunft ist ausdruecklich
`redaktion-amtliche-quellen-20260925`, keine Modellproduktion. Keine neue
Modellquittung, keine CAS-Freigabe, keine Frist oder Handlung erfunden.
Schema-Konfidenz60 ist keine gemessene Wahrscheinlichkeit.

Vollstaendige Texte, Feldwerte, Vorherzustand und Originalbelege:
`/private/tmp/helmut-bund7-redaktion-plan.json`.
Eingabe-SHA256 `d00021f980b6fca689c86318234be29ae695d5e7b8cdcf669930c75a7132fc15`.
Ausfuehrung `/private/tmp/helmut-bund7-redaktion-korrektur.sql`,
SHA256 `9c6fddb5b772595c0d9dfbf144a44dccf15e5d33b3b7c07933213e54feae8bdd`.
Rueckweg `/private/tmp/helmut-bund7-redaktion-rueckweg.sql`,
SHA256 `07547d4345ecd01f2a7efbb2665f1979d45aaab87969a1bbe2c7f7892f64b09b`.

## Ausfuehrung und Schutz

Stand: vorbereitet, noch nicht ausgefuehrt. Betreiber-GO fuer notwendigen
Roadmap-Umfang liegt vor. Ausfuehrung nach gruener Pflicht-CI und regulärem
Production-Rollout des dokumentierten Plans. Eine Transaktion,15s je Anweisung,
2s Locks; jede Vor-/Nachbedingungsabweichung rollt alles zurueck.

Sperren bei aktiven Profilen, Profil-/Identitaetsdrift, laufenden Jobs/Prozessen/
Leases, geaenderten alten KOs/Links oder Rohquellen, belegten neuen Kennungen/CAS.
Alle sieben Originalartikelbindungen wurden erneut aus dem Importbeleg validiert.
Quittung `bund7-redaktion-20260925-a` einmalig, mit Vollsicherung und Nachhashes.
Keine Modelle, Kosten, Profil-, Cron- oder Budgetaenderung.
Risiko sind fachlich falsche Zusammenfassung oder falsche Zuordnung; darum
vollstaendige Absatzpruefung und SQL-Nachvergleich aller Texte und Links.
Rein lesend danach alle8 KOs,10 Links,7 Quellen,500/0 Profile und Kosten pruefen.

Bedingter Rueckweg prueft alle8 Nachhashes, Links und7 Rohquellen. Nur bei
unveraendertem Stand entfernt er die7 neuen Bindungen, stellt den alten
Dublettelink wieder her und sperrt alle8 betroffenen Texte. Historie bleibt.
Keine automatische Wiederholung oder Reaktivierung ungesicherter Texte.

## Nachweise und Grenzen

12/12 Gruppen bestanden. Gezielte isolierte PGlite-Pruefung mit echten Tabellenspalten und gesicherten
Quelldaten; nur Profilhashes durch500 synthetische Laborzeilen ersetzt.
Erfolgsfall, Wiederholungssperre, Rueckweg, aktives Profil, Quellendrift,
Bestandsdrift, Fremdlink, belegte CAS-Kennung, laufender Prozess und ein
absichtlich korrumpierter Schreibtrigger vollstaendig geprueft.
Zusaetzlich Rueckwegsperren bei neuem Quelleninhalt oder spaeteren Links.
Labor `/private/tmp/helmut-rest-sqllab/bund7-redaktion.js`.

Die reine Profilzuordnungsprojektion der7 Entwuerfe erreicht149/500 mit
Score>=40. Sie ist keine Production-Vollversorgung und kein sichtbarer
Drei-Bereiche-Nachweis. Aktivierung bleibt aus, bis die weiteren Starttore
vollstaendig belegt sind.
