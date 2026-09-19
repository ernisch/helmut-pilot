# Vorbereiteter isolierter Prosanachweis

**19.09.2026: Zwei getrennte Serien nach je einem echten Aufruf dauerhaft gestoppt. Keine Fachabnahme. Neuer Folgenprompt zurueckgenommen; Integration bewahrt den technisch geprueften Stand0583307 und alle Fehlbelege. Gesamte Versuchskosten0,011244 USD konservativ, Tagesbuch0,124985 USD. Keine weiteren Modellstarts, kein500er Start.**
Aktuell gilt der Schlussabschnitt. Die vorherigen Auftraege und Tarifschritte
stehen nachfolgend als unveraenderte Historie; ihre alten Freigabesperren
sind durch die ausdrueckliche Betreiberfreigabe am19.09. ueberholt.
Basis ist der kumulative Stand des Rollen Folgebranches auf PR443. Die acht
neutralen Eingaben und vorab festgelegten Erwartungen stehen in
`prosa-fachnachweis-2026-09-19.json`. Sie sind ausschliesslich synthetisch.
Keine historische Pruefnotiz wird zum damaligen Quellentext umgedeutet.

Manifest SHA256:
`3c9fabd194af11a6d33cc0f90745448a1dd8fc4f10861b279b4f6f861275f7e6`.
Die acht Prompts wurden mit dem echten `buildUnderstandingPrompt` offline
gerendert, einschliesslich Dokumentkennung, Text, Metadaten und Quellenregeln.
Das zugehoerige Schema hat bei `JSON.stringify` den SHA256
`bec2e28d8cc968739dd89e79d3d2119b000940be43cc350460231fbd8689202c`.
Es gibt bislang null echte Requests und null neue Modellkosten.

## Enger Auftrag zur spaeteren Freigabe

Einmalig hoechstens acht serielle Aufrufe des bestehenden Azure Modells
`gpt-5-mini`, derselbe globale Understanding Prompt und dasselbe Schema wie
im gesicherten Reparaturstand, reasoning minimal, maximal 3000 Ausgabetokens
je Aufruf. Keine neue Modellfamilie, keine Modellkonfiguration aendern,
keine zweite Pruef KI. Jede Fallkennung genau einmal; kein Retry, kein
Fallback, keine Optimierung der Eingabe nach Sichtung der Antwort.

Maximale konservative Vollreserve: 8 mal 0,212 USD = **1,696 USD insgesamt**.
Bestehender atomarer Tagesriegel von 4 USD bleibt unveraendert. Vor Start muss
mindestens die volle Reserve zusaetzlich zu allen gebundenen Tageskosten frei
sein. Der spaetere Lauf bleibt in einem UTC Tag, maximal 20 Minuten ab
bestaetigtem Start. Keine Erhoehung, kein Tageswechsel als Budgetfortsetzung.
Anbieterpreis und tatsaechlicher Tokenverbrauch sind vor dem scharfen Start
gegen die vorhandene konservative Obergrenze zu bestaetigen.

Production Profile bleiben alle inaktiv. Kein Merge, Deployment, Cron, Flag,
Artikelabruf, Kontextaktivierung, Import, Wissensobjekt, Briefing, Profil oder
Konto wird veraendert. Keine externe Zustellung. Ausschliesslich notwendige
Einmalquittung, atomare Kostenreservierungen, Kostenabrechnung und vorhandene
Aufruftelemetrie duerfen bei ausdruecklicher Freigabe geschrieben werden.
Der bestehende Gipfelauftrag und seine Quittung bleiben unberuehrt.

## Ausfuehrungsbindung und Abbruch

Vor dem ersten kostenpflichtigen Request: exakten Branchhead, unveraenderten
Main und Production Stand, Profile0, Sperren0, Leases0, keine konkurrierende
Facharbeit, wirksame Kommunikationssperre und Kostenregel 2 frisch belegen.
Die Freigabe wird an den archivierten Manifesthash und Prompt/Schemahash je
Fall gebunden. Ein eigener atomarer Versuchsbeleg verhindert Wiederholung;
ein unklarer Beleg verhindert den Start. Kein Rueckgriff auf alte Freigabeworte.

Eingabe, gesamte tatsaechliche Requestnutzlast ohne Zugangsdaten, Modellname,
rohe Antwort vor Bereinigung, Tokenbeleg, Kostenquittung und lokale abgeleitete
Fachobjekte getrennt archivieren. Keine Konsolenausgabe privater Tokens.
Das vorbereitete Paket enthaelt den exakt gerenderten Prompt und das Schema;
der spaetere HTTP Wrapper muss auch dessen Transporthuelle erhalten.
Fehlt eine dieser Bindungen, zaehlt der Versuch nicht als Fachnachweis.

Nach jeder Antwort gegen den vorab festgelegten Fallvertrag lesen. Beim ersten
kritischen Inhaltsfehler, Schemascheitern, Transportfehler, unbekanntem
Kostenstand, Zeitende oder unerwarteter Schreibwirkung keine weiteren Aufrufe.
Ein verbrauchter Fall wird nicht nachgebessert und erneut aufgerufen. Bereits
erhaltene Belege sichern; keine pauschale Fortsetzung der restlichen Faelle.

## Fachliche Entscheidung

Jede gesamte Antwort pruefen, einschliesslich Titel, Kurztext, Einordnung,
Folgen, Empfehlungen, Kommunikationsvorschlag und Listen. Ein richtiger Satz
heilt keinen falschen Nachbarsatz. Anschliessend dieselbe rohe Antwort offline
durch Erstverstehen und Update mit Speicherattrappen reichen; keine weitere
KI dabei. So bleiben Modellbefolgung und Anwendungstransformation getrennt.

Der negative Fall muss die unbelegte Behauptung vermeiden oder Unsicherheit
korrekt erhalten. Der positive Fall muss den expliziten Beleg nuetzlich
wiedergeben; leere Prosa und pauschale Ablehnung bestehen nicht. Bei mehreren
zulaessigen Formulierungen werden Bedeutungen beurteilt, keine exakten Texte.

Acht korrekte Antworten waeren ein begrenzter neuer Verhaltensnachweis der
vier Klassen, keine universelle Faktenvalidierung und keine nachtraegliche
Klaerung historischer Requests. Bei einem Fehler Ursache neu einordnen und
den kleinsten allgemeinen Fix offline entwickeln. Bezahlte Wiederholung
bleibt eine eigene Freigabe. Bei Erfolg folgen Artikelkontextentscheidung,
sicherer Testfensterplan und kumulative Integrationsfreigabe separat.


## Ausfuehrer fuer die Freigabe vom 19.09.

Der Betreiber hat genau den vorbereiteten Auftrag freigegeben: hoechstens acht
Aufrufe,1,696 USD,20 Minuten, einschliesslich Einmalquittung, Kosten und
Aufruftelemetrie. Kein Retry; erster kritischer Fehler beendet den gesamten
Auftrag. Alle504 Profile bleiben inaktiv. Merge, Deployment und500er Start
bleiben verboten. Die Freigabe aendert weder Eingaben noch Abnahmekriterien.

Basis PR444 `6a69beeea3dafa7c0f6cb7856023ef260d68d57e`, eigener Folgebranch
`codex/prosa-fachnachweis-20260919`. Anwendungscode, Modellprompt, Schema und
Tarife bleiben identisch. Der neue Ausfuehrer wird vor dem bezahlten Start
lokal und durch die vollstaendige Pflicht CI geprueft.

Jeder manuell gebundene Actionslauf fuehrt exakt eine neue Fallposition aus.
Die Reihenfolge bleibt1 bis8. Vor dem naechsten Start muss die gesamte vorherige
Antwort direkt gelesen und offline durch Erstverstehen und Update geprueft
sein. Antwort und Bewertungsdatei werden gehasht; deren Kennungen binden die
Fortsetzung. Es gibt keine automatische positive Bewertung und keinen
bezahlten Richter. Ein zweiter Start derselben Position scheitert dauerhaft.

Die neue CAS Quittung `main-auth.prosaFachnachweis20260919` setzt beim ersten
bestaetigten Start ein gemeinsames20 Minuten Ende. Alle Folgestarts sind an
Commit, Empfaenger, Manifest, Schema, Vorbewertung und dieses Ende gebunden.
Mindestens180 Sekunden, die ganze maximale Jobdauer, muessen vor einem neuen Fall verbleiben. Maximal acht
Vollreserven zu0,212 USD bilden den zusaetzlichen Gesamtdeckel. Das bestehende
atomare Kostenbuch und der4 USD Tagesriegel bleiben unveraendert.

Der bestehende manuelle Workflow `staff-backfill-one.yml` erhaelt einen eigenen
Job nur fuer den neuen Branch und `PROSA_EINMAL:`. Der alte Backfilljob und der
Gipfeljob werden bei diesem Auftrag uebersprungen. Kein automatischer
Modellstart bei Push oder PR; keine Cronaenderung. GitHub besitzt bereits die
benoetigten Secrets, lokale Codeprozesse besitzen sie nicht. Nur Commit,
Fallposition, oeffentlicher Empfaengerschluessel und Bewertungsbindungen werden
als Formularauftrag uebertragen. Alle Eingaben sind synthetisch und im
bereits veroeffentlichten Manifest festgelegt; kein privater Quellenexport.

Der echte unveraenderte `ai.requestStructuredJson` reserviert Geld, Aufruf und
Anbieterplatz vor Azure. Ein isolierter Beobachter prueft die feste gesamte
HTTP Nutzlast vor dem Senden, erlaubt nur einen Request und sichert die rohe
Antwort vor Bereinigung und Parsing. Keine Zugangsdaten in den Belegen.
Transport, geparste Antwort und Kosten werden getrennt mit RSA3072/AES256GCM
verschluesselt ausgegeben. Der private Schluessel bleibt ausserhalb GitHub.
Auch eine nicht parsebare Antwort bleibt als Transportbeleg erhalten.

Vor und nach jedem Fall: authentifizierter Runtimeabgleich, Profile, Sperren,
Leases und junge offene Prozesse. Geschuetzte Authfelder und alte Kostentickets
muessen unveraendert bleiben. Neue Buchungen muessen eindeutig zu genau einem
Aufruf und zum Tokenverbrauch passen. Unklarheit stoppt, volle Reserve bleibt.
Die abschliessende Fachbewertung wird nur in der eigenen Quittung bedingt
nachgetragen; kein Wissensobjekt oder Briefing wird importiert.

Offline Schutzsuite:11/11 Gruppen einschliesslich echter KI Anbindung bis zur
simulierten HTTPS Grenze, Geldreserve vor Transport, Rohantwort vor Parsing,
negativen Abbruechen und acht verschiedenen einmaligen Positionen. Das ist
kein Modellqualitaetsbeleg. Die Gesamtpruefung und reale Ausfuehrung werden
anschliessend mit ihren tatsaechlichen Ergebnissen ergaenzt.

## Historischer Tarifnachweis und automatische Zugriffssperre

Die bestehende konservative Preisbasis vom09.09. bleibt0,50/4,00 USD je Million
Eingabe und Ausgabetokens. Sie ist keine neue Anbieterrechnung. Die aktuelle
[Microsoft Modellbeschreibung](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure)
bestaetigt400000 Kontext und272000 Eingabetokens fuer `gpt-5-mini`.
Der aktuelle [oeffentliche Preisabruf](https://azure.microsoft.com/en-us/pricing/details/azure-openai/)
zeigt fuer Global und Data Zone ausschliesslich Platzhalter, keine Zahlen.
Gezielte oeffentliche Retailabfragen lieferten keine passenden Zeilen;
dies ist kein Beleg fuer Nullkosten. Der Browser konnte die Preisseite nicht
laden. Keine heutige numerische Tarifbestaetigung behaupten.

Die automatische Freigabepruefung hat anschliessend bereits das Oeffnen von
`https://portal.azure.com/` abgewiesen. Genannter Grund: moeglicher Zugriff auf
private Konto, Abonnement, Abrechnungs oder Deploymentdaten sei nicht durch die
Freigabe des isolierten Tests und oeffentlicher Preispruefung gedeckt.
Keine Umgehung und kein zweiter Portalzugriff. Der Zugriff war ausschliesslich
fuer die vorab verlangte Tarifpruefung vorgesehen; keine Azure Aenderung.

Deshalb kein scharfer Actionsstart, kein Modellaufruf und keine Einmalquittung
oder Kostenbuchung dieses Auftrags. Die lokale und GitHub Pruefung des
Ausfuehrers wird unabhaengig abgeschlossen. Die bestehende enge Modellfreigabe
bleibt erhalten; als naechster Schritt fehlt nur die ausdrueckliche Erlaubnis,
im bestehenden Azure Konto den fuer `gpt-5-mini` geltenden Tarif rein lesend
gegen die konservative Obergrenze zu pruefen. Keine Secretwerte auslesen,
keine Konto oder Konfigurationsaenderung. Erst bei ausreichendem Beleg den
bereits erlaubten isolierten Auftrag ausfuehren.

## Technischer Abschluss vor dem scharfen Versuch

Kanonischer lokaler Gesamtlauf:418/418 Suiten in613 Sekunden erfolgreich.
Danach die Abschlussreserve auf die volle maximale Actionsjobdauer von180
Sekunden gebunden; gezielte Schutzsuite erneut11/11, einschliesslich Stopp
nach17 Minuten im gemeinsamen20 Minuten Fenster. Der Gesamtlauf wird nicht
als identischer Lauf dieses letzten engeren Zeitriegels ausgegeben. Die
vollstaendige CI am veroeffentlichten finalen Head folgt als verbindliches Gate.
Statusgroesse4/4. Kein Anwendungscode, kein bestehender Schutztest und kein
Tarif geaendert. Alle lokalen Pruefungen ueber `scripts/lokal.js`.

Rueckweg vor Ausfuehrung: ungemergten Folgebranch verwerfen. Nach einem spaeter
bestaetigten Start bleiben Quittung und Kosten dauerhaft erhalten; kein Reset,
kein Rueckbuchen unbekannter Kosten und keine Wiederholung verbrauchter Faelle.

## Freigegebener Tarifzugriff und neuer Belegstand

19.09.2026 um09:39 Tuerkei /08:39 Berlin /06:39 UTC: Der Betreiber hat die
Fortsetzung einschliesslich des angefragten lesenden Azure Zugangs freigegeben.
Die geschuetzte Microsoft Anmeldung war erfolgreich. Keine weitere Lesefreigabe
fehlt. Die fruehere automatische Ablehnung bleibt als historischer Vorgang
erhalten, ist aber nicht mehr der aktuelle Startblocker.

Die automatische Sicherheitspruefung lehnte eine vollstaendige Ressourcenliste
wegen ihres zu breiten Umfangs ab. Stattdessen nur gezielte Helmut Suche.
Im bestehenden Projekt wurde `gpt-5-mini`, Version `2025-08-07`, Status Succeeded
und Globaler Standard gelesen. Die Modellkarte bestaetigt400000 Kontext,
272000 Eingabe und128000 Ausgabe. Keine Secretwerte geoeffnet, keine Azure
Aenderung, kein Playgroundaufruf und keine neue Bereitstellung. Eine ungefuellte
Tarifvorschau wurde geschlossen; kein Speichern oder Bereitstellen bestaetigt.

Die Modellkarte nennt keine Zahlen, sondern verweist auf die oeffentliche
Preisseite. Auch die separate Ansicht Nutzung und Preise herunterladen im
bestehenden Konto blieb leer, nach einem Neuladen und genau einem zweiten
Oeffnen ebenfalls. Kein Preisexport und keine weiteren Versuche derselben
Methode. Oeffentliche Preisplatzhalter und fremde Resellerpreise ersetzen keinen
aktuellen numerischen Tarifbeleg fuer das bestehende Deployment.

Damit bleibt der Fachnachweis blockiert:0 von8 Aufrufen,0 USD neue Modellkosten,
keine Einmalquittung, gemeinsames20 Minuten Fenster nicht begonnen. Benoetigt
wird ein aktueller Microsoft Tarifbeleg mit Eingabe und Ausgabepreis je Million
Tokens fuer das bestehende Global Standard Deployment. Ein direkt gelieferter
Tarifausschnitt ohne Zugangsdaten genuegt, wenn Modell, Einheit, Waehrung und
Stand erkennbar sind. Die bereits erteilte Modellfreigabe bleibt bestehen.

Technischer Stand PR445: Head `5a6f8762ef20cdeffda6a934f9c5cf86c01c3f21`,
CI35425611492 completed/success,418/418 Suiten, Browser50/50, Kontoschutz15/15,
500 isolierte Registrierungen, Z22 48/48 und24/24 erfolgreiche Schritte.
Abschluss09:19:23 Tuerkei /08:19:23 Berlin /06:19:23 UTC. Der temporaere CI
Pruefcommit hat exakt denselben Tree wie dieser Head. Dieser Nachtrag aendert
nur Dokumentation; die dadurch vorgeschriebene CI wird gesondert abgewartet.

Frischer GitHub Abgleich: alle27 Reparatur PRs419 bis445 offen und Draft,
jede Basis exakt der vorherige Head,419 basiert auf unveraendertem Main
`2d1eb705e00ea5f5ff8f351997e429cc16d195c1`. PR345 ist eine weitere alte
Dokumentation und gehoert nicht in einen pauschalen Gesamtmerge. Die lineare
Kette beweist keine fachliche Abnahme. Erst den begrenzten Fachnachweis und
die abschliessende kumulative Integration bewerten, dann das genaue Paket
zur Integration vorlegen. Merge nach main deployt automatisch Production.
Keine Mergefreigabe aus der Frage nach dessen Sinnhaftigkeit ableiten.

Lesender Datenabgleich09:34:03 Tuerkei /08:34:03 Berlin /06:34:03 UTC:504 Profile,
alle inaktiv; keine aktive Sperre, Lease oder junge offene Verarbeitung.
Keine Prosaquittung und0 Prosaaufrufe. Bestehende Tageskosten0,113741 USD
unveraendert. Keine laufende Action beim Vorflug; kein weiterer lokaler
Schreiber sichtbar. Globale Work Sitzungen bleiben technisch nicht abfragbar.

## Numerischer Microsoft Tarifbeleg und Fortsetzung am 19.09.

Die Uebernahme fand den inzwischen gesicherten Abschluss von PR444 und PR445.
PR445 Head `0dac7e9404f7e35a0596a3ad9dcf0e9780f4563e` wurde durch
CI35427331451 vollstaendig erfolgreich geprueft:418/418 Suiten,50 Browser,
15 Kontoschutz,48 Z22 und24/24 Schritte. Kein Wiederholungslauf dieses Heads.
Der aktuelle private Abschluss korrigiert ausserdem die fruehere DOM Aussage:
Die Azure Ansicht zeigte eine Monatsliste fuer Nutzungsdateien. Nach zwei
Betaetigungen von Vorbereiten wurde keine Datei erhalten. Serverseitiger
Ausgang unbekannt; kein erneutes Vorbereiten in dieser Uebernahme.

Am19.09.2026 um10:05:33 Tuerkei /09:05:33 Berlin /07:05:33 UTC lieferte die
oeffentliche Microsoft Retail Prices API12 Preiszeilen fuer den tatsaechlichen
Zahlernamen `GPT 5 Mini` in `swedencentral`, ohne weitere Seite.
Die [vollstaendige strukturierte Antwort](azure-gpt5-mini-tarif-2026-09-19.json)
enthaelt Abrufzeit, Abfrage, Waehrung, Einheit und die unveraenderten Zeilen.
Die Azure Kontoansicht nennt dieselben Input und Output Produkte fuer Global
und SE Central. Der bereits belegte Deploymenttyp bleibt Global Standard,
Modellversion `2025-08-07`. Es wurde nichts bereitgestellt oder umgestellt.

| Verbrauch | USD je Million Tokens | Microsoft Meter ID |
| --- | --- | --- |
| Eingabe, regulaer Global | 0,25 | `45f4acef-7483-5b10-8986-cea7d10ba581` |
| Ausgabe, regulaer Global | 2,00 | `22dd2fde-fadb-570f-a541-ca915805441c` |
| Wiederverwendete Eingabe, Global | 0,025 | `194df53e-2ba7-5722-a622-764bb468dcc3` |

Alle drei Zeilen: `Consumption`, `unitOfMeasure=1M`, Mindestmenge0,
Primaerzaehler, `effectiveStartDate=2025-08-01T00:00:00Z`.
Dieses Wirksamkeitsdatum ist nicht das Abrufdatum. Batch und Data Zone Zeilen
sind in der Antwort erhalten, werden aber nicht als Tarif dieses Auftrags
verwendet. Die [Microsoft Dokumentation](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices)
bezeichnet USD Werte als oeffentliche Listenpreise ohne Rabatt. Das ist ein
aktueller Anbieterpreisbeleg, keine individuelle Rechnung, keine bestaetigte
Euro Umrechnung und kein Nachweis der tatsaechlichen acht Tokenverbraeuche.
Die frueheren leeren Abfrageergebnisse beweisen keine fehlenden Tarife.

Konservativer Vergleich mit derselben bestehenden Obergrenze:
400000 Eingabetokens mal0,25/Million plus3000 Ausgabetokens mal2/Million
ergeben0,106 USD pro Aufruf. Acht solche Obergrenzen ergeben0,848 USD.
Die unveraenderte Motorreserve bleibt0,212 USD pro Aufruf und1,696 USD fuer
acht Aufrufe. Die Motorbuchung mit0,50/4,00 bleibt eine konservative Schaetzung;
keine Anpassung von Code, Preisregel, Kostengrenze oder Kostenhistorie.
Tatsaechlicher Verbrauch und Anbieterantwort fehlen weiterhin.

Rein lesende Betriebsaufnahme10:07:36 Tuerkei /09:07:36 Berlin /07:07:36 UTC:
504 Profile,0 aktiv,0 unbekannte Aktivzustaende,0 aktive Sperren,0 Leases,
0 junge offene Prozesse, keine Prosaquittung und0 Prosaaufrufe.
Gebuchter Tagesstand0,113741 USD, keine offenen Reservierungseintraege.
Damit rechnerisch3,886259 USD freie Tagesreserve, nach voller Achtfallreserve
noch2,190259 USD. Diese Momentaufnahme ersetzt keinen frischen Startvorflug.
Main und Production Alias bleiben auf `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`,
Deployment `dpl_At93X1HMzB5fsAJ2wZQ8FuvW3Dfy` READY. Keine laufende Action,
nur die zwei alten queued Laeufe. Kein weiterer lokaler Prozess sichtbar;
globale Work Sitzungen weiterhin nicht direkt abfragbar.

## Naechster bearbeitbarer Fachblock und aktuelle Auftragsgrenze

Sachgebiet ist die erste Position des unveraenderten Achtfallmanifests:
`sachgebiet-offen`, danach bei Erfolg `sachgebiet-belegt`.
Die Rollen und Ausschussableitung aus PR444 ist technisch repariert und bereits
geprueft. Sie beweist nicht die historische Ursache des Pflegefalls und nicht
die korrekte Modellprosa. Die dokumentierten Grenzen zu Vollzug, Zuschreibung
und Ereigniszeit bleiben ebenfalls offen. Kein weiterer belegter
deterministischer Prosafix ergibt sich aus dieser Bestandspruefung.

Kleinster naechster Beleg ist die erste echte Antwort des vorbereiteten
Auftrags samt exakt gesicherter HTTP Eingabe, roher Antwort, Tokenverbrauch
und Kostenquittung. Die ganze Antwort wird gegen die vorher festgelegten
Erwartungen gelesen und offline durch beide Fachpfade verarbeitet. Erst bei
Erfolg darf die naechste Position innerhalb desselben20 Minuten Fensters
folgen. Beim ersten kritischen Fehler sichern und stoppen; kein Retry.
Eine korrekte negative Antwort allein besteht noch nicht die Sachgebietsklasse.
Fehlende historische Requests werden durch diesen neuen Nachweis nicht ersetzt.

Die fruehere ausdrueckliche Achtfallfreigabe samt notwendigen Buchungen ist
erhalten. Der aktuelle Uebernahmeauftrag verlangt zugleich keine Production
Datenaenderung und keine Production Wirkung. `beanspruche` schreibt vor Azure
die dauerhafte Quittung in `main-auth`; der echte KI Pfad schreibt Kosten,
Aufrufzaehler und Telemetrie. Ein scharfer Start ist deshalb kein rein lesender
oder lokaler Schritt. Diese Grenze wird nicht still als aufgehoben behandelt.
Kein Start und keine neuen Buchungen in dieser Uebernahme. Vor der Ausfuehrung
ist nur dieser Widerspruch zum aktuellen Schreibverbot zu klaeren; keine neue
allgemeine Azure Lesefreigabe und keine hoehere Kostenfreigabe erforderlich.
Der bestehende Ausfuehrer ist auf den19.09. vor23:00 UTC gebunden; keine stille
Datumsverlaengerung oder Wiederverwendung nach Tageswechsel.

Dieser Nachtrag aendert ausschliesslich Dokumentation und den oeffentlichen
Tarifbeleg im bestehenden PR445. Kein neuer PR, Anwendungscode, Prompt,
Schema, Manifest, Qualitaetswaechter, Workflow oder Konfiguration geaendert.
Rueckweg: ungemergten Dokumentationsnachtrag nicht uebernehmen. Die bereits
gruenen technischen Nachweise bleiben ihrem jeweiligen Head zugeordnet.

Lokale Nachpruefung: drei eindeutige regulaere Global Tarifzeilen mit richtiger
Waehrung, Einheit, Region und Meter ID; beide Kostenrechnungen und unveraenderte
Motorreserve erfolgreich. Statusgroesse4/4 und `git diff --check` erfolgreich.
Die zunaechst zu lange Statusdatei wurde durch Entfernen des ueberholten
Vorflugs und Verweis auf historische Kostenbelege gekuerzt; keine Grenze
angehoben. Alle lokalen Pruefungen ueber `scripts/lokal.js`. Kein neuer PR
und kein wiederholter lokaler Gesamtlauf identischen Anwendungscodes.
Die automatisch vorgeschriebene CI fuer den neuen Dokumentationshead wird
separat abgewartet und in der bestehenden PR Beschreibung dokumentiert.


## Freigegebene Fortsetzung und nachgewiesener Speicherblocker

Der Betreiber hat am19.09. die notwendigen Reparaturen, Kostenbuchungen und
geprueften Merges samt automatischem Deployment ausdruecklich freigegeben.
Heute insgesamt hoechstens10 USD. Diese Freigabe ersetzt die oben historischen
Merge und Buchungssperren. Der bestehende4 USD Riegel bleibt vorerst enger;
der vorbereitete Achtfallnachweis behaelt1,696 USD und20 Minuten.

[Actions35430388179](https://github.com/ernisch/helmut-pilot/actions/runs/35430388179)
auf geprueftem Head49bb811 endete07:50:17 UTC mit `PROSA_SPEICHERSTAND`.
Keine Quittung und kein Modellstart. Native SQL Gegenlesung07:50:30 UTC:
504 Profile inaktiv,0 aktive Sperren, Leases oder junge Prozesse,0 Prosaaufrufe,
keine Prosaquittung und unveraenderte Tageskosten0,113741 USD.
Gezielte Feldzaehlung belegt `llmUsage` mit5000 Eintraegen. Alle anderen
geprueften Ringe liegen innerhalb ihrer Grenzen. Der Ausfuehrer verlangte
hoechstens4992. Damit ist der Betriebsblocker belegt, kein Modellfehler.

Kleinste Korrektur ausschliesslich im Ausfuehrer: Vor dem ersten Modellstart
werden genau die hoechstens acht durch diese Serie verdraengbaren Altbelege
in derselben atomaren Einmalquittung gesichert und persistiert gegengelesen.
Die bestehende5000er Ringgroesse bleibt unveraendert. Nach jedem Aufruf muss
der Ring exakt aus dem neuen Beleg und dem vorherigen Ring entstehen;
jeder verdraengte Eintrag muss byteinhaltlich im Archiv erhalten sein.
Archiv und Grundlinienhash werden im verschluesselten Kostenbeleg mitgegeben.
Fehlendes Archiv, fremde Telemetrieaenderung, anderer geschuetzter Zustand
oder ungeklaerte Kosten stoppen weiterhin. Keine historischen Kosten loeschen.

13/13 gezielte Schutzgruppen bestanden, einschliesslich vollem5000er Ring
ueber acht Positionen und negativer Archiv/Fremdmutation. Die Simulation
nutzt nun dieselbe Voranstellung und Kappung wie der echte Speicherpfad.
Der erste Actionsstart wird nicht erneut ausgefuehrt. Erst nach kompletter
Pruefung des korrigierten Commits folgt ein neu gebundener Start; mangels
Quittung und Modellaufruf ist noch keine Fallposition verbraucht.

Lokale Gesamtpruefung:414/418 in613 Sekunden. Vier Suiten scheiterten an
fehlenden Checkout-Abhaengigkeiten (Chromium, `ical.js`, AWS SQS SDK).
Mit den unveraenderten, bereits vorhandenen Projektabhaengigkeiten und
Chromium1194 wurden genau diese vier Suiten erfolgreich nachgeprueft.
Damit alle418 Suiten geprueft; kein zweiter identischer Gesamtlauf.
Keine Testaussage abgeschwaecht, keine Paketdatei geaendert.
Neue GitHub CI am korrigierten Head steht noch aus.

## Erster echter Fall und gezielte Folgepruefung

Head `0583307693fac1a72cc2c571601b5cc6d01b9be7`: CI35431115046
vollstaendig erfolgreich,418/418 Suiten in778 Sekunden,50 Browser/Mobil,
15 Kontoschutz,48 Z22, beide Jobs und alle24 Pflichtschritte erfolgreich.
Der volle Nutzungsring ist damit technisch geprueft; kein alter CI-Lauf neu gestartet.

Actions35431831013 fuehrte am19.09.08:22:49 bis08:23:05 UTC genau Fall1 aus.
HTTP200, abgeschlossene Antwort,6301 Eingabe und692 Ausgabetokens.
Rohantwort und geparstes Objekt sind inhaltlich identisch. Vollstaendiger Request,
Rohantwort, Kosten und beide lokalen Fachpfade sind privat archiviert.
Konservativ5919 Mikro USD; Tagesbuch danach119660 Mikro USD, keine offene Reserve.
Listenring5000 erhalten und acht moeglicherweise verdraengte Altbelege gesichert.
Profile, Identitaeten, geschuetzter Authinhalt und main-Blob haben unveraenderte
SHA256 Grundlinien;504 Profile weiterhin inaktiv, keine aktive Konkurrenz.

Fachurteil **nicht bestanden**. Die einzige inhaltliche Quelle lautet
„Ausgleichsbetrag koennte entfallen“. Unter `chancen` ergaenzt das Modell
Effizienzgewinne bei Verwaltungskosten. Die Quelle nennt weder Verwaltungskosten
noch einen Verwaltungsprozess oder einen entsprechenden Wirkungszusammenhang.
Eine als moeglich bezeichnete Folge erhaelt dadurch keinen Quellenbeleg.
Erstverstehen und Update speichern diese Prosa unveraendert.
Moeglicher Entfall und fehlender Beschluss bleiben dagegen korrekt offen.
Keine Steuer, Pflege oder Verkehrsleistung wird konkret behauptet; das breite
Label Finanzen ist deshalb kein Beweis einer falschen konkreten Leistungsart.

Die eigene Quittung `prosaFachnachweis20260919` wurde08:25:56 UTC bedingt auf
`fachlich-gestoppt` gesetzt, gegen exakte Revision und Quittungshash, anschliessend
unabhaengig gegengelesen. Bewertung SHA256
`293246372fc29b370dc58c44ff52dc13a1495eb4518f3b0cac212ea230f45aab`.
Alle Kosten, Rohbelege und die technische Erfolgsquittung bleiben erhalten.
Keine Position2 bis8 dieser Serie wird ausgefuehrt, keine Wiederholung.

Damit ist die falsche Ergaenzung **in dieser neuen Modellantwort** belegt.
Weder der innere Generierungsgrund noch eine historische Pflegefallursache ist
bewiesen. Bestehende allgemeine Quellenregeln wurden bereits mitgeschickt.
Ein pauschaler weiterer Faktenappell oder ein Wortfilter waere kein Nachweis.

Kleinster Folgeversuch: Die bisher nur allgemein begrenzten Pflichtfelder
`warum_wichtig` und `wer_ist_betroffen` erhalten ausdrueckliche Ausgaben bei
fehlender Grundlage. Die bislang nur als Listen genannten `risiken` und
`chancen` verlangen konkret eine gelieferte Folge samt Akteurs-/Gegenstandsbezug.
Vorbehaltswoerter duerfen keine neue Folge erzeugen; keine Verlagerung in
Schwesterfelder. Explizite Folgen bleiben ausdruecklich erlaubt. Das ist eine
gezielte Aenderung des Modellauftrags, **keine deterministische Semantikpruefung**
und noch keine bewiesene fachliche Reparatur. Schema und Qualitaetsregeln bleiben.

Die ausdrueckliche10 USD Freigabe deckt die notwendige neue Pruefung des geaenderten
Codes. Eigene Quittung `prosaFolgenFachnachweis20260919`, maximal neun einmalige
Aufrufe,1,908 USD Vollreserve,30 Minuten, gleicher4 USD Tagesriegel, kein Import.
Die urspruenglichen acht Eingaben **und Erwartungen bleiben identisch**; unabhaengige
SHA256 Bindung ihrer JSON Inhalte samt Dokumentstandard:
`8c1308af1c6da318d3d9187ae4431ad15539f4118db750a70b15beee9b93d477`.
Ein neunter positiver Gegenfall liefert ausdruecklich eine Ersparnis und eine
moegliche Verzoegerung. Beide muessen erhalten bleiben; pauschale leere Listen
koennen die Folgepruefung deshalb nicht bestehen. Neues Manifest SHA256
`ffe89d960c46b1bf325043728da03d2780bbe890705ac141cdbf8f7f4fd497b1`.
Neue Promptbindungen im Ausfuehrer, Schemahash unveraendert. Der alte Auftrag
bleibt geschuetzter Bestand, nicht umgeschrieben oder neu geoeffnet.

14/14 Ausfuehrerschutzgruppen, Mandatsneutralitaet5/5 und Aussagen/Fristen6/6
lokal bestanden. Vollstaendige lokale und anschliessende Head-CI stehen aus.
Erst danach neue Ausfuehrung. Bei erneutem kritischen Befund wieder sofortiger
Serienstopp; keine Optimierung der Eingaben oder Abnahmekriterien.


## Gescheiterter Folgenauftrag und begrenzte Integrationsentscheidung

Kopf `e1f2ba5ddfe10c87ea7f2407a7548663c5361007`:418/418 lokale
Offline Suiten in611 Sekunden,14/14 Ausfuehrerschutzgruppen. Die neue CI
35432854396 lief gleichzeitig in isolierter Testdatenbank; kein paralleler
Production Schreiber. Die vollstaendige lokale Pruefung und vorhandene
Schutzpruefungen trugen den autorisierten Einzelstart. Merge blieb gesperrt.

Actions35433020569 fuehrte08:49:14 bis08:49:30 UTC genau einen Modellaufruf
mit veraendertem Prompt aus. HTTP200/completed,6666 Eingabe und498 Ausgabetokens,
darunter3328 als gecacht gemeldet. Konservative Buchung5325 Mikro USD ohne
Cacheabschlag. Rohinhalt identisch zur geparsten Antwort. Der Ausfuehrer
brach wegen `PROSA_SCHEMA` ab: `display_title: zu lang (66 > 64)`.
Die leere `headline` ist nach vorhandenem Schema zulaessig und **nicht**
die Ursache. Eine vorlaeufige anderslautende Chatdiagnose wurde korrigiert.

Vollstaendige Fachpruefung: Moeglichkeit bleibt erhalten, keine konkrete
Steuer-/Pflege-/Verkehrsleistung erfunden, Risiken/Chancen leer. Trotzdem
fuegen `warum_wichtig` und `why_relevant` potenzielle regulatorische Bedeutung
hinzu, fuer die die blosse Nennung eines moeglichen Entfalls keinen Beleg
liefert. Kein bestandenes Fachpaket; die acht weiteren Faelle wurden nicht
begonnen. Auch der positive Folgengegenfall ist nicht nachgewiesen.

Beide lokalen Speicherpfade speichern die bereinigte Antwort. Den zu langen
Anzeigetitel verwerfen sie gemaess bestehendem Vertrag; kein neuer Fehler
der Sanitisierung belegt. Die unbelegte Bedeutung bleibt gespeichert.
Keine Schema- oder Titelgrenze wurde fuer ein grueneres Ergebnis gelockert.

| Beleg | SHA256 |
| --- | --- |
| Rohe Transportantwort | `e169d71546533c0df9f6fdc1ce84038b55321c5ffed440e3782dbc6f5fb86870` |
| Exakter Request | `2b6b5c4494443f9127666b1e74146ecc54bd86556177e01d934e35970e98a44a` |
| Ganze geparste Antwort | `f91f29d773d87fe29007ff089ab819e7f27a73e8cb612478c1c054e7f7f39f42` |
| Vollstaendige negative Fachbewertung | `7452499e27e54fe796797d393eec0b0d561fb6cd9d4660da7323f08069d73e0a` |

Eigene Quittung `prosaFolgenFachnachweis20260919` um08:52:38 UTC gegen
Revision und Quittungshash bedingt fachlich geschlossen, danach gegengelesen.
Alte Serie unveraendert, deren Hash
`d529ee0b237f94d8a2583aa03d002bba2a823bef428f147c3fd2c16e12786dbf`.
504 Profile weiter inaktiv. Unabhaengige Grundlinien fuer Profile, Identitaeten,
geschuetzten Authinhalt und main-Blob unveraendert. Neun moeglich verdraengte
Altbelege gesichert; keine Kostenhistorie geloescht. Tagesbuch08:53:41 UTC:
124985 Mikro USD, keine offene Reservierung, keine aktive Verarbeitung.

Der nicht abgenommene Folgenprompt wird **nicht** integriert. Anwendungscode,
Ausfuehrer, Manifest und zugehoerige Tests werden bytegleich auf0583307
zurueckgenommen; die abgelehnte Aenderung und ihr genauer Auftrag bleiben
im Commit e1f2ba5 und privaten Belegpaket erhalten. Der wiederhergestellte
alte Ausfuehrer kann seine geschlossene Serie nicht erneut beginnen.
Keine weitere gleichlautende Promptiteration, keine Wortlistenwahrheit.

Die technischen, bereits geprueften Reparaturen der Kette bleiben sinnvoll
und werden mit der vorhandenen Mergefreigabe integriert. Das ist weder eine
Fachabnahme der vier Prosakategorien noch500er Startbereitschaft. Der naechste
begruendete Fachnachweis muss die Informationsgrundlage gegen eine vollstaendig
gebundene Antwort abgrenzen; eine pauschale Sperre aller titelbasierten Quellen
ist keine kleine risikofreie Korrektur. Produktionsauswirkung vorher messen.
Historische Requests fehlen weiterhin teilweise; neuer Befund beweist keine
historische Entstehungsursache.
