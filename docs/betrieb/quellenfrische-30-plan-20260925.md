# Begrenzter Frischeimport — Vorbereitung 25.09.2026

**Nicht ausgefuehrt. Production-Daten-GO fehlt.** Der globale Betreiberauftrag
vom25.09. erlaubt alle auftragsbezogenen PR-Merges nach gruener Pflicht-CI samt
regulaeren Deployments. Dafuer nicht erneut fragen. Diese Freigabe ersetzt
kein GO fuer den nachstehenden konkreten Datenimport oder den500er Start.

## Ziel und konkrete Wirkung

Frische Eingangsdaten fuer die noch ausstehende gemeinsame fachliche Pruefung.
Genau30 neue `raw_documents` und30 zugehoerige `document_findings` in Production
`ddckuvvpcytqbyfmbvie`. Quellen:16 Deutschlandfunk- und14 Tagesschau-Artikel aus
den beiden bereits vorhandenen Katalogfeeds. Keine weitere Quellenabfrage
waehrend des Imports. Die gespeicherten Originalzeiten bleiben erhalten.

0 Modellaufrufe,0 Profilwrites,0 Aktivierungen,0 neue Hintergrundauftraege.
Keine Wiederholung der abgeschlossenen169er Stufe. Der Import allein beweist
weder Understanding noch aktuelle Briefing-/Lage-/Radar-Ausgaben fuer500.

## Exakt gebundene Eingabe

- Probe09:03:56.594–09:03:57.810 UTC,32 gelesene Feedpositionen, zwei ohne
  vollstaendigen Auszug abgelehnt;30 Kandidaten.
- Originalpublikationen24.09.,17:20:41 bis25.09.,09:00:51 UTC.
- Kandidatenhash `6358a17967e2c3184c85411ba2ef22a46941b2f1fce6ee99476401c7553ee231`.
- Minimierung/Fundstellenbildung durch den bestehenden `planDedupWrites`.
  Eingabehash `e986c8b0e9c18d29f665cada54cac5e3cb1f37f1ff03da90938a54aabdf0eadf`.
- SQL-Importhash `d2782682d184db5e290013ba5ee0cb870e12a24e6220f139b36d0a9bd5a362d6`.
- SQL-Rueckweghash `1643be95fb0db1392be000da2c659a9283195bb96f2553e67726a0c99e4e130d`.

09:20:38 UTC nur SELECT:504 Mandate/0 aktiv,0 vorhandene Ziele,0 Fundstellen,
0 KO-Verknuepfungen. Keine Kollision ueber ID, Inhaltsfingerabdruck, kanonische
Zieladresse oder kanonische Adresse. Unmittelbar vor Ausfuehrung neu pruefen.

## Ausfuehrungsschutz und Rueckweg

Eine Transaktion, Statementlimit15 Sekunden, Locklimit2 Sekunden. Abbruch bei
aktiven Profilen, laufenden Jobs/Prozessen/Sperren, bereits vorhandenen oder
veralteten/zukuenftigen Quellen. Eingabehash und30/30 Zaehler werden im SQL
geprueft. Keine Updates/Upserts vorhandener Quellen. Alle gespeicherten
Nutzfelder werden vor COMMIT exakt rueckgelesen. Profil-, Identitaets- und
Auth-/Main-Zustaende muessen unveraendert sein.

Risiko: Neue Quellen sind noch nicht fachlich verstanden. Ein roher Import ist
keine Freigabe seiner Inhalte. Locks koennen bei paralleler Arbeit zum Abbruch
fuehren. Bei unbekanntem Schreibausgang ausschliesslich den gebundenen Leser
benutzen; kein automatischer zweiter Import.

Rueckweg ist separat vorbereitet und gesperrt: nur diese30 unveraenderten
Neuanlagen samt ihren30 Fundstellen entfernen, wenn keine fachliche Verknuepfung,
Weiterverarbeitung oder laufende Arbeit besteht. Fremde oder spaeter geaenderte
Daten verhindern den Rueckweg. Auch dessen Ausfuehrung braucht ein konkretes GO.

## Lokaler Bedienweg und Nachweise

`node scripts/lokal.js -- node scripts/quellenfrische-30-plan.js PROBE_JSON AUSGABEPRAEFIX`
erzeugt nur lokale Eingabe-, Import-, Nurlese-, Rueckweg- und Berichtsdateien;
keine DB-Verbindung. Er akzeptiert nur die oben exakt eingefrorene Probe.
Quelltexte bleiben lokal; keine Veroeffentlichung der Artikel im Repository.

Lokal: reale Planerzeugung und6/6 Ablehnungen veraenderter Texte, Adressen,
Zeitstempel, Aufnahmezeit und SQL-Begrenzer. Der bestehende echte PostgreSQL-CI-
Nachweis prueft die neue30er Vorlage zusaetzlich zum unveraenderten31er Vertrag:
Atomarik, Wiederholungsverbot, Quellenfrische, Ruecklesung, Schutzdaten und
Rueckweg einschliesslich spaeterer Verknuepfung/Inhaltsaenderung. Ergebnis
dieser neuen Datenbankpruefung steht bis zum gruenen CI-Lauf aus.

Nach GO: frische Vorlesung, genau eine Ausfuehrung des gehashten Imports,
gebundene Nachlesung30/30 und unveraenderte504/0-Profilgrundlinie. Danach den
separat begrenzten Understanding-Schritt planen; hier kein impliziter Modellstart.
