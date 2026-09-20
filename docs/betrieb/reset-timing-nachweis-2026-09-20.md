# Besitzerzeitmessung und aktueller Laufzeitnachweis

20.09.2026, **teilweise abgeschlossen**. Basis Main
`a4a67831da809405561b8b61fbee62aa712c1a82`, eigener Branch
`codex/reset-timing-nachweis-20260920`. Kein Anwendungscode geaendert.

## Ursache und Grenzen

Main CI35480668575, Job105997763798:429/430 Offline Suiten in659s.
Einziger Fehler: Besitzerpfad181,0ms bei behaupteter Obergrenze100ms;
79 Assertions erfolgreich, eine fehlgeschlagen. Browser erfolgreich,
PostgreSQL Konten und Quellen23/0 sowie Null auf500 auf Null26/0.
Die nachfolgende Z22 Pruefung wurde wegen des Fehlers uebersprungen.
Der vorangegangene PR463 Lauf35479888757 war vollstaendig erfolgreich.
PR Head und Main tragen denselben Git Baum ba674de0269d61da4ada821ad940de0b6e3a53ef.

`handleAuthRequestReset` wartet beim angemeldeten Besitzer synchron auf
Tokenablage, Mail und Audit. Nur der anonyme beziehungsweise fremde Zweig
ruft `warteBisFreigabe` auf. Gesamtdauer unter100ms beweist daher nicht
die Abwesenheit der Gitterverzoegerung und ist keine Produktzusicherung.
Der beobachtete Fehler klassifiziert einen langsamen legitimen Besitzerweg
faelschlich als Gitteraufruf. Keine Regression durch PR463 nachgewiesen.
Die exakte Aufteilung der181ms in Speicherung, Transport, CPU und
Runnerwartezeit ist im historischen Log nicht enthalten; keine erfundene
Node oder Runnerursache. Der Warnhinweis zu Node24 betrifft Actions;
er beweist keinen Fehler im unter setup-node22 gestarteten Testprozess.

Isolierte Gegenprobe am unveraenderten Anwendungscode, Node24.19.0:
urspruengliche Suite80/0. Mit180ms lokaler Versandverzoegerung und einem
transparenten Beobachter am echten Gitteraufruf:185,4ms, **null**
Gitteraufrufe, exakt derselbe alte Fehler,79/1. Nur synthetische lokale
Konten und Loopbacktransport, alle Laeufe ueber scripts/lokal.js.

## Kleinste Korrektur und Nachweis

Nur Abschnitt J der vorhandenen Suite geaendert. Ein transparenter
Beobachter zaehlt die echten Gitteraufrufe und delegiert unveraendert an
die Originalfunktion. Eigene Adresse mit Versand und Kopierweg verlangen
null Aufrufe; fremde Adresse verlangt einen echten Aufruf. Eine absichtlich
langsame lokale Zustellung belegt, dass korrekter synchroner Versand das
100ms Fenster ueberschreiten darf. Originalfunktion und Transportzustand
werden auch bei Fehlern wiederhergestellt. Keine Produktionsschwelle,
keine anonymen Zeitmessungen und keine AUC Grenze geaendert.

Gezielte korrigierte Suite:83/0. Isolierte Gegenmutation fuegt im
Besitzerzweig absichtlich einen echten Gitteraufruf ein:80/3, neue
Pruefungen erkennen den Fehler. Ein erster Mutationsstart traf auf einen
uebriggebliebenen lokalen synthetischen Testzustand und brach vor der
Fachpruefung ab; der Zustand wurde separat erhalten und die Gegenprobe
sauber neu ausgefuehrt. Kein Productionfehler und kein gruen gezaehlter Lauf.
Kanonischer lokaler Gesamtlauf:423/430 in800s. Zwei Browserteile konnten mangels installiertem Chromium nicht starten; vier Kontosuiten trafen auf einen erhaltenen synthetischen lokalen Nutzer, darunter der Timingtest vor AbschnittD. Die Statusdatei lag208 Zeichen ueber der unveraenderten Grenze. Historie wurde bytegleich archiviert, der aktuelle Status verkuerzt; alle sieben betroffenen Originalsuiten anschliessend jeweils erfolgreich im kanonischen Einzelrunner nachgeprueft. Chromium1194 aus dem vorhandenen lokalen Testbestand verwendet. Synthetische lokale Vorzustaende separat erhalten, vor den isolierten Laeufen leer begonnen. Ein erster Sammelnachlauf blieb bei Mailpit rot; eine rein protokollierende Gegenprobe und der anschliessende unveraenderte Originaltest bestanden119/119. Der Zwischenfehler wird nicht als neuer Produktfehler oder gruener Lauf ausgegeben; seine einzelne HTTP Ursache wurde nicht aufgezeichnet. Neue vollstaendige PR CI steht noch aus.

## Aktuelle Production Belege

Deployment dpl_H7mgeHZhPRmsGy6tg4MNo9fTaEgr READY, Production/fra1,
Main a4a67831, alle drei bisherigen Aliase erhalten. Rein lesender
Lauf35482171245, Job106001810172,20.09.04:44:40 Tuerkei /
03:44:40 Berlin /01:44:40 UTC: HTTP200 am exakten Main. Supabase/V3,
relationale exklusive Profile, Kommunikationssperre, Kohortenquellensperre,
Retention36, Aufrufdeckel2416, Understanding Reserve702, Realreserve200,
Kostenregel2 aktiv und4 USD. Unbekannte Ausgaenge bleiben reserviert.
Testnachlauf Version2, Arbeitsauswahl/Testfenster/Pruefaufnahme Version1.
Keine optionalen Inhaltsleser ausgefuehrt.

Native Lesungen01:40:50 und01:45:57 UTC:504 Profile,0 aktiv; alle vier
Hashgrundlinien fuer vollstaendige Profile, Identitaeten, Auth samt Sessions
und Main identisch. Keine lebenden Sperren, Leases, offenen Jobs, jungen
offenen Prozesse oder Testfensterquittungen.01:41:50 UTC kein Kostentag20.09.;
19.09.0,526234 USD, an diesem Tag keine offene Kostenreserve. Gesamtlesung01:56 UTC trennt sechs alte ungeklaerte Tickets vom10./11./15./17.09. mit zusammen1,272 USD weiter gebundener Reserve; kein heutiger Verbrauch und keine Freigabe dieser Altreserven. Kein Modellaufruf,
Quellenimport oder500er Start durch diesen Sprint.

## Integration und naechster Schritt

Erst erforderliche Gesamtabnahme und PR CI. Der freigegebene Merge deployt
automatisch; Test und Dokumentation aendern sich; ausschliesslich das Deployment dieses Vorschaubranches wird abgeschaltet. Main und Cronkonfiguration bleiben identisch. Rueckweg waere ein
gepruefter Revert PR ohne Datenruecknahme, bei Productionwirkung separat
freizugeben. Nach Merge READY, Commit/Alias und Ruhezustand rein lesend
kontrollieren. Allgemeine Prosa,500er Versorgung,1500 Ergebnispositionen
und belastbare Zeit/Kostenplanung bleiben offen.
