# Gemeinsame Ursachen der Quellenprobleme

Stand16.11.2026,07:40UTC. Auftrag: gleiche Ursachen gemeinsam behandeln,
moeglichst viele Quellen durch wenige dauerhafte Korrekturen verbessern.
Keine neue Infrastruktur, Massenpruefung oder kuenstliche Erfolgsquittung.
Der private12FelderProfilabgleich bleibt geschlossen; dies ist keine vorgezogene
mandatsbezogene Vollstaendigkeitsinventur aus Issue1218.

## Ergebnis und Prioritaet

| Prioritaet / gemeinsame Ursache | Vorhandener Nachweis und Reichweite | Status / kleinste dauerhafte Korrektur |
| --- | --- | --- |
| 1. Netzarbeit laeuft ueber die sichere Auftragsfrist hinaus | Regulärer03:30Fehlabschluss;5646ms-Restauftrag und rot reproduzierte fehlende Abbruchweitergabe. Betroffen sind alle nativen Quellenabrufe, auch Redirects, POST, PARDOK und Spezialadapter. Die alleinige Ursache des damaligen Laufabbruchs ist damit nicht bewiesen. | PR1233 nach gruener Pflicht-CI und unabhaengigen Reviews gemergt:a67b44c0. Absolute Netzfrist, durchgaengiger Abbruch, abgewartete Kinder/Streams und Aufraeumreserve im bestehenden Motor; UNKNOWN bleibt geschuetzt. |
| 2. Gemeinsamer Anbieter-Minutenriegel |112wartendeJobs/112QuellIDs mit exakt `zurueckgestellt: anbietergrenze: anbietergrenze-minutengrenze`.112verschiedene primaereRSS-URLs, keine belegte Compilerduplikation. Google-Konto `google\|news\|quellenabruf`:8Minutenfenster, maximal30 und insgesamt227Buchungen,03:00–03:31. | Vorhandene Schutzfunktion, keine112Parserdefekte. Atomare Reservierung und attempt-erhaltende Vertagung existieren. Kein Limitreset/keine Erhoehung; gemeinsame zulaessige Betriebsfortsetzung statt112Einzelpatches. |
| 3. Technischer Erfolg erreicht nicht den bestaetigten nutzbaren Inhalt | Prozessledger erzeugte skipped-shared nach Fehlversuch; HTML wurde als leeresRSS interpretiert; Quittungshook fehlte. Jetzt: EUR-Lex-Job mit ausdruecklicher Textfreigabe erledigt,16neueZeilen aber HerkunftV1/summarynull, weil erfolgreicherRSS vor dem Originalpfad zurueckkehrt. | Ledger-, Feedhuellen-, Fehlerklassifikations- und Telemetriereparaturen sind bereits live. Verbleibender EUR-Befund wird mit bestehender amtlicher CELLAR-Kette vor dem RSS-Frueherfolg geschlossen, ausschliesslich im exakt freigegebenen nativen Weg; keine Artikelkorrektur. |
| 4. Abrufziel oder Herausgeberformat hat sich geaendert | Linke rss.xml404/feed.rss200; konkrete BMG/BMAS/ZDF/hib- und Titel-/Einleitungsbelege. BMG-Reden konnten aus vorhandenem Original nach gepruefter Parserrevision wiedergewonnen werden. | Bestehende strenge Adapter/Reader gezielt korrigiert. Gemeinsame hashgebundene Archivwiedergewinnung statt erneuter Originalabrufe oder manueller Artikelserien; keine freie HTML-/Titelaehnlichkeit. BMG-Nachanalyse bleibt offen. |
| 5. Original-, Datums-, Versions- oder Nutzungsnachweis fehlt wirklich | Historische NULL-Publisherziele und konkret abweichende NDR/DLF-Daten sind keine pauschalen Parserfehler. Ungeklaerte POLITICO-/Table.Media-Textrechte bleiben offen. Die alten14Metadatenkonflikte gelten nicht fuer spaeter gepruefte36Bindungen: dort Titel/Herausgeber/Datum jeweils0Abweichungen. | Echte Sperren erhalten. Nur belegt reparierbare Parser-/Bindungsfehler aus gesicherten Originalen heilen; kein generischer Metadatenabgleich, keine Rechte aus RSS/Quellen-ID ableiten. Bereits erlaubte amtliche/Destatis-/artikelweiseiRights-Auszuge nutzen. |
| 6. Betrieb ist gestoppt oder echte Beobachtung fehlt | Heutige Lage/Morgen partial, Abdeckung03:31blocked; Destatis/iRights je2echteErfolgsquittungen statt3. Linke-Auftragwartend0, BMGausArchivwiedergewonnen/wartend2.17weitereWartende ohneFehlertext sind nicht17belegteQuellendefekte. | Bestehenden zulaessigen Produktlauf fortsetzen und echte Abschluesse lesen. Keine zusaetzliche Retry-/Alarmarchitektur, keine erfundene Tagesprioritaet, keine kuenstliche dritte Quittung. |

## Wie die aktuellen Gruppen ermittelt wurden

Rein lesende, auf5sbegrenzte Productionabfragen. Fuer den Jobvergleich nur
seit15.11.00:00UTC angelegte Jobs mit fester Katalogquellen-ID in retrieval_paths
und Quellentyp ungleich person; keine Profil-, Mandats- oder Nachrichteninhalte.
Ergebnis:167erledigteJobs/148QuellIDs;112wartend mit gemeinsamem Minutenriegel;
17wartend ohneFehlertext;1wartend mit Zeitgrenze(Bundestag);1alterfehlgeschlagener
EUR-Formatjob. Der neue heutige EUR-Job ist separat erledigt/attempt1.
Die erste Klassenbildung nach Fehlertext wurde durch den exakten112erGrund
und den engen Anbieter-Kontenabgleich bestaetigt. Wartend ist nicht defekt;
erledigt ist noch kein Lesetext-, Rechte- oder Kundenversorgungsnachweis.

Gesonderter Originalpfadbeleg07:09: heutiger EUR-Auftrag hat
eurlexExcerptApproved:true und den exakt bekannten Pfad/Feed. Alle16seit
Mitternacht neu gespeicherten EUR-Dokumente tragen HerkunftV1 und keinen Text.
Der fruehe RSS-Return ist im Code und isoliert mit gesundemRSS reproduzierbar.
Der passende Fix verwendet denselben bestehenden CELLAR-/Original-/CAS-Weg;
keine neue Quelle, kein neuer Anbieter und keine pauschale Textfreigabe.

Vorwerte07:25UTC:0laufendeJobs;3Quellenfenster/900reservierteSekunden/1Original;
0,090652USDheute und4,185669USDgesamtgebunden.1USD/UTC-Tag und30USDgesamt,
alle Reserven, Fristen, Rechte, Archive und erfolgreiche Ergebnisse bleiben.

## Was heute fuer einen echten Abschluss fehlt

Der heutige bestehende Fortsetzungsweg ist `POST /api/admin/quellenlauf` mit
echter Adminsitzung und CSRF. Er verwendet normale300s-/8Fenster-/2400s-/
16Original-Kontingente und ein neues heutiges Auftragspaar. Die Betreiberfreigabe
ersetzt technisch weder Sitzung noch CSRF; ein Cronkey ist kein Adminersatz.
Es ist hier kein bedienbarer angemeldeter Browser verfuegbar.

Die regulaeren Quellenfenster enden vor05:00UTC. Es gibt keinen aktuellen
Nachmittagscron. Der naechste geplante regulaere Start ist17.11.03:00UTC,
vorbehaltlich vorhandener Bereitschafts-/Automatik-/Kontingentpruefung.
Legacy-Lage/Understanding und worker-weck ersetzen keinen nativen Claim.
Alte14/15Nov-Einmalrechte werden nicht wiederverwendet.

Prioritaetenfolge bleibt: universellen Fristfix abschliessen, den laufenden
amtlichen Originalpfad schliessen, dann dieselbe zulaessige Betriebsfortsetzung
auf Inhalte, Quittungen und Kundenausgabe pruefen. Erst ein dabei konkret
belegter Restdefekt begruendet eine weitere Reparatur. Kein Gesamt-PASS aus Code.

## Primaere vorhandene Detailbelege

- [Fristkorrektur und Erstfehler](quellen-netzfrist-20261116.md).
- [Dauerreparaturen, Originalrechte und erhaltene Erfolge](quellen-dauerbetrieb-20261115.md).
- [Korrigierte36Bindungen und Telemetriehook](versorgung-sofortpruefung-20261115.md).
- [Gepruefte Quellenformate und echte Inhaltsgrenzen](quellen-parser-folge-20261115.md).
- [Linke-RSS-Korrektur und vorheriger Abschluss](quellen-abschlussfenster-20261115.md).
