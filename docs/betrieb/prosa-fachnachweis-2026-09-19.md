# Vorbereiteter isolierter Prosanachweis

**19.09.2026: eng begrenzt ausdruecklich freigegeben, noch nicht ausgefuehrt. Status: blockiert am aktuellen Tarifnachweis.**
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

## Tarifnachweis und automatische Zugriffssperre

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
