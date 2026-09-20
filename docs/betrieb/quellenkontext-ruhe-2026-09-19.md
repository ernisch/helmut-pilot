# Quellenreparatur bei null aktiven Profilen

Stand 19.09.2026. Gesamtstatus: **teilweise abgeschlossen**.
Der einmalige Quellenkorrekturlauf ist freigegeben und ausgefuehrt.
Nachkontrolle bestaetigt504/0 und unveraenderte Schutzgrundlinie.
Die belegte Satzgrenzenluecke im Auszugpfad ist durch PR451 repariert;
allgemeine Prosa und500er Bereitschaft sind weiterhin offen.
Ausgang ist Main `b3a4fb560cddf482d18706801524630e39c7d1be` nach PR448.
Kein neuer 500er Test, keine Profilaktivierung, kein bezahlter Modellaufruf.

## Frischer Befund und Ursache

GitHub vor dem Schreiben: keine offenen PRs und keine laufenden Actions.
Hauptalias auf READY `dpl_FouTvDe9dD3yJ2ubYD9zHDE3jSNb`, exakt obiger Main.
SQL 11:08:56 UTC: 504 Profile, null aktiv, keine lebende Pipelinesperre oder
junge unbeendete Verarbeitung. Tagesbuch 133388 Mikro USD, keine offene
Kostenreserve. SQL 11:10:32: alle 22709 Jobs erledigt, keine lebende Joblease.
Dies sind getrennte rein lesende Aufnahmen, keine atomare Gesamtaufnahme.

Die bereits dokumentierte Reichweitenaufnahme aus PR448 bleibt historisch:
10710 Itemzeilen in den letzten Mandatspaketen der 500 Zielprofile,
114 vollstaendig aufloesbare Wissensobjekte, davon 95 nur mit Quellen ohne
Auszug. Alle 500 Profile referenzieren mindestens eines, vier ausschliesslich
solche Objekte. Das ist weder ein neuer Test noch eine Ausfallprognose.

Vertiefende SQL Aufnahme 11:09 bis 11:10 UTC: 173 unterschiedliche verknuepfte
Rohdokumente. Bei 172 enthalten die Rohmetadaten nur `sourcePriority` und
`originalUrl`, keinen gespeicherten Artikeltext. Keine gespeicherten
`main-artikelkontext-*` Belege. 35 der 95 Wissensobjekte haben ueberhaupt keine
verknuepfte Quelle mit `source_type=media` und `link_type=direct`.

`artikelkontext-lauf.js` akzeptiert genau diese Medienklasse und hoechstens
einen neuen Abruf pro Verstehenslauf. Seine Artikelpruefung bleibt erhalten.
Die Quellkategorie stammt teilweise aus dem Suchkanal, nicht aus dem spaeter
aufgeloesten Herausgeber. Ein blosses Einschalten von `HELMUT_ARTIKELKONTEXT`
waere deshalb kein allgemeiner Nachweis fuer die 95 Wissensobjekte.
Ausserdem liest `lage-quellenbeleg.js` weiterhin Titel und `summary`.

Die einfachere vorhandene Alternative ist `github-quellenkontext-500.js`:
kurze Originalauszuege aus einem passenden gespeicherten Originaleintrag oder
aus gebundenen HTML Metadaten in fehlende `raw_documents.summary` uebernehmen.
Diese Auszuege stehen Understanding und Lage zur Verfuegung. Keine freie
Zusammenfassung durch ein Modell; Artikelidentitaet, Quellenregeln, maximal
240 Zeichen, Compare and Set und vollstaendige Ruecklesung bleiben erhalten.
Ob die konkret benoetigten Artikel erreichbar und deren Auszuege ausreichend
sind, ist noch nicht bewiesen. Bestehende Wissensobjekte werden nicht neu
analysiert. Auch ein gefuellter Auszug garantiert keine korrekte freie Prosa.

## Kleine Reparatur des vorhandenen Bedienwegs

Abgewogene Alternativen vor einem groesseren Umbau:

| Alternative | Nutzen, Aufwand, Kosten und Grenze |
| --- | --- |
| Weiterer Prompt oder Denkparameter | Geringer Umbau, aber bereits drei negative echte Serien; keine belegte neue Ursache und kein weiterer gleicher Versuch. |
| Wortfilter oder Zitatanker allein | Ohne Modellkosten, aber ein passendes Wort beweist weder Rolle noch Bedeutung. Wuerde unbelegte Paraphrasen durchlassen oder belegte Einordnung entfernen. |
| Separater semantischer Pruefer fuer alle globalen Freitexte | Kann unbelegte Aussagen ablehnen; neue Modellkosten, Laufzeit und eigene Fehlurteile. Der bestehende Lagepruefer zeigt den Mechanismus, ist aber kein globaler Validator. Erst konkrete Quellenbasis und begrenzten Negativ/Positivvertrag beweisen. |
| Vorhandene Auszuege gezielt ergaenzen | Kleiner vorhandener Motorpfad, null Modellkosten, Wirkung in beiden Texteingaengen. Loest Eingabeluecken moeglicherweise teilweise, nicht die offene Semantikpruefung. Deshalb diese begrenzte Vorbereitung. |

`briefing-aussagenbindung.js` sammelt bereits die sichtbaren Textpfade und
verlangt ein separates vollstaendiges Urteil mit exakten Quellenstellen.
Das ist fuer den spaeteren Qualitaetsvertrag nutzbar, entscheidet aber selbst
keine Bedeutung. `lage-textqualitaet.js` kontrolliert nach einem zweiten
Modellurteil strukturelle Bindung, Mandatsfeld und Zitatanker. Beide Vertraege
weisen ausdruecklich keine allgemeine Faktengarantie aus. Sie werden hier
nicht zu einer ungeprueften Freigabe fuer globale Prosa umgedeutet.

Der bisherige Quellenreparaturweg verlangt fuenf aktive Bestandsprofile.
Dieser Vertrag passt nicht zu den heutigen 504 inaktiven Profilen.
Der neue explizite Vorgang `quellenkontext-ruhe` verwendet denselben Leser,
Extraktor und Schreiber, hat aber einen eigenen Auftrag und eine eigene
Bestaetigung. Der alte Fuenfervertrag bleibt unveraendert.

Die Zielmenge wird aus allen 495 vorhandenen synthetischen Kennungen und
genau fuenf explizit uebergebenen Bestandskennungen gebildet. Keine Ableitung
aus aktiven Konten und kein Fallback. Die Auswahl muss genau 500 eindeutige
vorhandene Profile und genau vier ausgeschlossene ergeben. Vorhandene
Konten, Identitaeten und Kohortenmerkmale werden weiter vollstaendig geprueft.
Die konkrete private Zielliste bleibt diejenige aus PR448; reale Kennungen
werden weder in Anwendungslogik noch in Testfixtures fest eingebaut.

Alle 504 Profile muessen vor Beginn inaktiv sein. Vor jedem Artikelabruf und
jedem Quellenwrite wird erneut auf null aktive Profile geprueft. Der gesamte
Profil und Identitaetsbestand sowie der komplette Auth und Main Zustand
muessen nachher denselben Hash haben, einschliesslich Sessions, Berechtigungen,
Kostenbuch und Passwortbelegen. Laufzeitkonfiguration, Kommunikationssperre,
atomare Sperre, fremde Leases, Kosten und Ausfuehrungsfenster bleiben geprueft.
Der Vorgang kann weder den Profilwriter erreichen noch Fachjobs einreihen.

## Konkreter spaeterer Auftrag und Freigabegrenze

Historischer Vorabvertrag, inzwischen einmalig freigegeben und ausgefuehrt
(Ergebnis unten). Integration, READY Abgleich und frische Grundlinie waren
Voraussetzungen der ausdruecklich freigegebenen Quelldatenkorrektur:

| Eigenschaft | Begrenzung |
| --- | --- |
| Workflow | `500-direkt-ausbau.yml`, ausschliesslich manuell auf Main |
| Vorgang | `quellenkontext-ruhe` |
| Bestaetigung | `TESTKOHORTE_500_QUELLENAUSZUEGE_BEI_NULL_AKTIVEN_BESTAETIGT` |
| Auswahl | JSON Array der ausdruecklich festgelegten fuenf Bestandskennungen; weitere 495 aus bestaetigtem Bestand |
| Production Commit | Vollstaendiger SHA, zuvor unabhaengig READY und am Hauptalias bestaetigt |
| Umfang | Genau ein begrenzter Lauf; maximal 40 Artikelabrufe und 40 Quellzeilen |
| Laufzeit | Maximal 480000 ms Arbeitsbudget; kein ueberlappendes Cronfenster, kein Tageswechsel |
| KI | Null Modellaufrufe, null zusaetzliche Modellkosten |
| Inhaltswirkung | Nur bisher fehlende `summary` plus Herkunft/Versuchsbeleg in `raw.helmutQuellenkontext`; daneben bestehende Betriebsaufzeichnungen und Sperre |
| Erfolg | Bestaetigt gespeicherte Originalauszuege samt unveraenderter Schutzgrundlinie; verbleibende Luecken vollstaendig zaehlen |
| Fachgrenze | Weder technische Ausfuehrung noch Auszuganzahl besteht den 500er Fachnachweis |

Kein Wiederholungsversuch fuer eine bereits mit Herkunft/Versuchsbeleg
versehene Quelle. Ein unbekannter Schreibausgang beendet den Lauf sofort;
kein automatischer Retry und keine Erfolgsmeldung. Danach nur exakt betroffene
Zeile rein lesend aufklaeren. Bereits bestaetigte Auszuege bleiben erhalten.
Bei falscher Zielmenge, Aktivierung, Konkurrenz, fehlender Kommunikation oder
Kostenbindung, Zeitende oder fehlgeschlagener Ruecklesung keine weitere Arbeit.

`CLAUDE.md` Abschnitt 5 verlangt fuer Production Datenkorrekturen eine
ausdrueckliche Freigabe. Der Betreiber hat genau diesen einmaligen Lauf
freigegeben. Daraus folgt keine Erlaubnis fuer einen zweiten Datenlauf,
Profile, Feature Flags oder einen neuen500er Test. Eine Environment
Aenderung ist fuer diesen vorhandenen Quellenweg nicht erforderlich.

Rueckweg der Codeaenderung: gepruefter Revert PR auf den Baum vor dieser
Erweiterung. Keine Migration und keine neue gespeicherte Zustandsversion.
Kein Datenrollback durch den Code Revert. Eine etwaige spaetere Datenkorrektur
nur anhand des genauen Vorherbelegs und bedingt gegen die tatsaechliche Zeile;
kein pauschales Leeren aller Auszuege oder Entfernen der Versuchsbelege.

## Abnahme und verbleibende Blocker

Zehn gezielte Offline Pruefgruppen bestanden: positive Quellenuebernahme,
Auswahl und Ausschluss, Kontoschutz, fehlende/falsche Auswahl, jeder aktive
Profiltyp, unveraenderter alter Weg, kein Aktivierungsrecht, Gegenlesen aller
Schutzdaten, unbekannter Schreibausgang sowie echter Adapteraufruf mit
Laufzeit und Auswahlbindung. Kanonischer Gesamtlauf: 418/420 in 619 Sekunden.
Die zwei bestehenden Browsertests fanden den vorhandenen Chromium zunaechst
nicht. Mit `PLAYWRIGHT_BROWSERS_PATH` auf dessen vorhandenes Verzeichnis
anschliessend beide einzeln ueber denselben kanonischen Runner bestanden:
`admin-nutzer-loeschen-test.js` und `passwort-setzen-login-fix-test.js`.
Damit jede der 420 Suiten erfolgreich ausgefuehrt; kein behaupteter einzelner
lokaler Gesamtlauf mit 420/420. PR449 CI35440756347 danach vollstaendig
erfolgreich: 420/420 Suiten in 794 Sekunden, 50 Browserpruefungen,
15 Kontoschutzpruefungen samt 500 isolierten Registrierungen, Z22 PASS48/FAIL0,
beide Pflichtjobs und alle 24 Schritte bestanden. Keine Testbedingung
geaendert, kein Production Quellenlauf behauptet.

Der regulaere Cron `understanding-rueckstand` um 11:30 UTC lief waehrend der
lokalen Pruefung unabhaengig von diesem Auftrag. SQL 11:35:10 UTC:
Tagesbuch 258929 Mikro USD, null offene Reserven, null lebende Sperren/Leases.
Deshalb ist die fruehere 0,133388 USD Aufnahme keine aktuelle Kostenbasis.
Die gesamten 500 Zielkennungen wurden erneut rein lesend mit Production
verglichen und stimmen mit der vorbereiteten Liste ueberein.

| Bereich | Belegter Stand vor neuem Test |
| --- | --- |
| Allgemeine Prosa | Offen. Bestehender Validator prueft Form, Akteure und Ebene, keine allgemeine semantische Deckung freier Aussagen. Drei reale negative Serien bleiben gueltig. |
| Betroffene Texte | `was_ist_passiert`, `warum_wichtig`, `wer_ist_betroffen`, `handlungsempfehlung`, `headline`, Listen zu Risiken/Chancen und daraus uebernommene Anzeige und Stabsfelder. |
| Strukturierte Belege | Tragen Akteure, Rollen, Ebene und Quellenidentitaet, beweisen keine neu behauptete fachliche Wirkung. Eine Woerterliste kann die freie Bedeutung nicht allgemein validieren. |
| Promptvertrag | Vorhandene Verbote haben die gesicherten Fehler nicht verhindert; keine weitere gleiche Parameter oder Promptiteration. Anwendung bleibt unveraendert bei bisherigem Denkaufwand. |
| Positive Gegenfaelle | Explizit belegte Leistungsart, Finanzierung, Folgen und Mandatszustaendigkeit muessen weiterhin nutzbar sein. Keine pauschale Leerregel fuer kurze Quellen. |
| Quellenreichweite | Einmaliger Production Lauf ausgefuehrt:22 Auszuege gespeichert,18 Versuche ohne Ergebnis. Restluecke und Satzgrenzenbefund unten; Wirkung auf neue Fachtexte offen. |
| Morgenversorgung | PR421 repariert Speicherung und Nachtrag vorhandener Lage; technische Integration bewiesen, Versorgung aller 500 noch offen. |
| Lagekapazitaet | PR420 repariert aktive Auswahl, Rotation, Beginn und 500 Laufplaetze; serielles Zeitbudget und Vollversorgung noch offen. |
| Quellenabruf/Google News | Artikelaufloesung und gebundener Kontext integriert; keine Zusage, alle heutigen Originalartikel erreichen zu koennen. Quellenfrische und Auszugreichweite im neuen Lauf pruefen. |
| Deferred/Ablehnungen | Bleiben gesonderte Nichtabschluesse; weder erledigte Jobs noch Leertexte als bestandene Fachversorgung zaehlen. |
| Mandat/Lage Vollstaendigkeit | Historisch 497/500 bzw. 5/500; kein heutiger Nenner und kein neuer Fachnachweis. |
| Morgenfrische | Historisch 131/500 Morgenquittungen; neues Tagesfenster mit gespeicherten Paketen abzugleichen. |
| Testende | Alter Timer abgelaufen. PR455: manueller atomarer0/500/0 Plan integriert,16 echte PostgreSQL Pruefungen. PR457: automatischer Endweg technisch integriert,26 echte Datenbankpruefungen. Production Endfunktion am19.09.18:00:45 UTC separat freigegeben und einmalig installiert; kein Timer bewaffnet. [Installationsbeleg](testfenster-null500-2026-09-19.md#freigegebene-installation-am-1909-1800-utc). |

Vor einem neuen Test alle 500 Kennungen im Nenner halten. Je Profil muessen
Mandatspaket, Morgenbriefing und Lage fuer das vereinbarte Fenster vorhanden,
nicht leer, eindeutig, strukturell vollstaendig und mit nachvollziehbaren
Quellen gespeichert sein. Das ist die Vollstaendigkeitspruefung.
Davon getrennt alle sichtbaren Texte fachlich auf Akteurszuordnung, Fristen,
Ereigniszeiten, behaupteten Vollzug, Mandatsrelevanz, politische Ebene und
zusaetzliche unbelegte Bedeutung pruefen. Eine automatische Vollpruefung
dieser Semantik ist aktuell nicht belegt. Stichproben bleiben Stichproben.
Weder Kostenrahmen noch erwartete Laufzeit des neuen 500er Tests sind damit
abgenommen. Der bestehende 4 USD Tagesriegel bleibt erhalten.

Praezisierung19.09. vor dem naechsten Test: Der Nenner bleibt500 fuer jede
der drei Ergebnisarten, also1500 getrennte Existenz- und Inhaltsnachweise.
Jeder Nachweis bindet Profilkennung, Ergebnisart, gespeicherte Zeile,
Inhaltshash, Erzeugungszeit und vereinbartes Testfenster. Genau eine
akzeptierte Version je Profil und Ergebnisart; Quellenvarianten desselben
Artikels werden nicht mehrfach gezaehlt. Derselbe belegte Artikel darf
mehreren sachlich betroffenen Profilen dienen. Eine Morgenquittung allein
beweist keinen Morgenbriefingtext: Tenant, Berliner Tag, Slot, Version,
Erfolgsstatus und Zeit muessen zur gespeicherten Ausgabe passen. Ihre
bisherige Signatur aus Kennungen und Aktualisierungszeiten ist kein Hash
aller Texte. Dafuer fehlt noch der vollstaendige automatische Leser.

Die Vollstaendigkeitsbilanz und die fachliche Textbilanz erhalten getrennte
Ergebnisse. Fehlend, leer, deferred, fachlich abgelehnt oder unpruefbar
bleibt im Nenner und wird nicht als bestanden gezaehlt. Ein positives
Fachurteil braucht fuer saemtliche sichtbaren Aussagen den tatsaechlich
verwendeten Quellenkontext; Akteure, Fristen, Ereigniszeiten, Vollzug,
Mandatsbezug, Ebene und freie fachliche Bedeutung sind getrennt zu pruefen.
Zulaessige Einordnung braucht einen benannten Beleg und darf eine daraus
nicht folgende Bedeutung auch nicht als angebliche Relevanz hinzufuegen.
Die bisherigen Strukturpruefungen und Teilstichproben leisten diesen
vollstaendigen semantischen Nachweis nicht. Kein automatisches Gesamtgruen
und keine Behauptung einer bereits ausgefuehrten1500er Textpruefung.

## Production Abschluss nach PR449

PR449 mit Head `77ba2688e0dd06ace9cf8688910d2e8d10913c98` nach vollstaendiger
CI und frischem Konkurrenzabgleich gemergt. Keine anderen offenen PRs.
Main `15cdd12816d25debd6ef5725cb22630d3706c7be`, unveraenderter gepruefter
Baum `13d0dc474edc9d67f1bfec41c54e72e686a59706`.
Production `dpl_FVGP8renL6euTStuWuW83vWGRnbc` am 19.09. um 11:58:40 UTC READY,
Commit und Alias `helmut-pilot.vercel.app` unabhaengig bestaetigt.

Anschliessend ausschliesslich lesender Workflow35441590955 auf genau diesem
Main, nur Laufzeitoption aktiviert, keine Inhaltsprobe oder Facharbeit.
11:59:45 UTC HTTP200, Commit identisch, Supabase/V3 und exklusiver relationaler
Profilpfad wirksam, Retention36, Kommunikation und Kohortenquellen gesperrt.
Atomare Sperre und Standardquellenschutz aktiv. Tagesdeckel2416,
Understanding Reserve702, Realreserve200. Kostenregel2 aktiv bei4 USD,
unbekannter Ausgang bleibt reserviert. Kein scharfer Pfad freigegeben.
Dies belegt die Erreichbarkeit und Konfiguration der Anwendung, keine neue
fachliche Textpruefung oder vollstaendige UI Abnahme.

Native SQL Gegenprobe 12:00:11 UTC gegen Grundlinie 11:57:54 UTC:
504 Profile,0 aktiv, genau500 Zielkennungen und4 ausgeschlossene unveraendert.
Hashes aller Profile, Identitaeten, des kompletten Auth und Main Zustands
sowie separat der geschuetzten Konten, Sessions und Passwortbelege identisch.
Null aktive Pipelinesperren, Jobleases, unerledigte Jobs und junge unbeendete
Prozesse. Tagesbuch0,258929 USD, null offene Kostenreserven, nicht eingefroren.
Keine neue Profilaktivierung, kein Quellenkorrekturlauf, keine Modellaufrufe
durch diesen Auftrag. Der regulaere11:30 Cron ist oben gesondert ausgewiesen.

Damals blieb die naechste Phase bis zur ausdruecklichen Freigabe des oben
vollstaendig begrenzten Quelldatenlaufs blockiert. Der eigene abschliessende
Dokumentations PR aendert ausschliesslich diese Datei und CURRENT_STATE;
sein Merge und Deployment werden gemaess CLAUDE.md Abschnitt9 in GitHub und
Vercel belegt, ohne rekursiven Dokumentations PR. Fachlich besteht weiterhin
keine Bereitschaft fuer den500er Teststart.

## Freigegebener einmaliger Production Lauf

PR450 integriert auf Main `a1268b0db0cbf44f28dc3d8ec6e23b239fb162ad`,
READY `dpl_EF8wGwu8v6E17N6yUpB9VtCCx71X`, Hauptalias korrekt.
PR CI35442241050 und Main CI35442873887 erfolgreich; letzter Leser35442915647
HTTP200, identischer Main, Kommunikation gesperrt und4 USD Riegel wirksam.
Vor neuem Schreiben keine offenen PRs oder laufenden relevanten Actions.

Betreiberfreigabe: den beschriebenen einmaligen Quellenkorrekturlauf
ausfuehren und danach autonom weiterarbeiten, ohne Profilaktivierung oder
500er Teststart. [Actions35443741723](https://github.com/ernisch/helmut-pilot/actions/runs/35443741723)
auf genau diesem Main erfolgreich. Vorgang12:45:00 bis12:49:07 UTC,
entsprechend15:45 bis15:49 Tuerkei und14:45 bis14:49 Berlin.
Zielhash `dda70a02c9918d73a7ae45b7ab4febd6bae5a1df0a4d3fc65b9a260c62bcdfc6`.

40 Artikelabrufe,40 neue Versuchsbelege,22 bestaetigte Auszugwrites.
18 ohne Auszug:6 Abrufe nicht bestaetigt,4 abweichende Titel,5 abweichende
Artikelziele,3 ohne belastbaren Auszug. Keine alten Versuche wiederholt,
kein unbekannter Schreibausgang, null Modellaufrufe und Modellmehrkosten.
Native SQL12:53:09 UTC gegen12:43:31:504/0, alle Profile und Identitaeten,
kompletter Auth und Main Zustand sowie Konten/Sessions/Passwortbelege
hashidentisch.22709 Jobs erledigt, keine lebende Sperre/Lease oder junge
unbeendete Verarbeitung. Tagesbuch0,258929 USD, null offene Reserven.

Zwei unterschiedliche Reichweitenmengen nicht vermischen:

| Menge | Beleg nach diesem Lauf |
| --- | --- |
| Aktueller begrenzter Lageeingang aller500 Zielprofile |137 unterschiedliche Quellen,79 vorher ohne gespeicherten Auszug,57 danach;6 bereits frueher versucht,33 noch unversucht.278 Profile mit mindestens2 gespeicherten Auszuegen,163 ohne Auszug. Das sind rohe Auszugzaehlungen vor der untenstehenden Satzpruefung. |
| Letzte gespeicherte Mandatspakete |Weiter10710 Itemzeilen/114 aufloesbare Objekte;95 vorher und91 nachher nur mit Quellen ohne summary. Alle500 Profile weiterhin betroffen,4 ausschliesslich solche Objekte. Keine Neuberechnung oder neue Fachabnahme dieser Altpakete. |

## Belegte Satzgrenzenluecke und kleine Folgereparatur

Vollstaendige Sichtung aller22 neuen Auszuege:15 unveraendert verwendbare
Satzfolgen,3 mit nutzbarem ganzen Praefix und abgebrochenem Anhang,4 ohne
ganzen Satz. Ursache in `quellen-auszug.js`: Satzgrenzen wurden nur oberhalb
von240 Zeichen gesucht. Kuerzere Publisher Metadaten konnten bereits mitten
im Wort enden; Ellipsen oder `Prof. Dr.` zaehlten als vermeintliches Satzende.
Diese Feststellung beurteilt die Textvollstaendigkeit, nicht die Wahrheit
der vom Herausgeber berichteten Tatsachen.

Kleine deterministische Korrektur statt neuer Modellmethode: vorhandene
ganze Satzpraefixe auch unter240 Zeichen erhalten, Abbruchreste, Ellipsen
und typische Abkuerzungen nicht als Satzende verwenden. Kein ergaenzter Satz,
keine historische Quelle im Code und keine pauschale Loeschung aller Auszuege.
Positive Gegenfaelle erhalten mehrere Saetze, Zitate, Fragen, Abkuerzungen
innerhalb eines vollstaendigen Satzes und bisherigen unverkuerzten Kontext.

Alle sechs bestehenden Quellenleser projizieren nur den kleinen vorhandenen
Herkunftsbeleg und wenden denselben Vertrag auf ergaenzte Auszuege an.
Das umfasst Erstverstehen, Rohfenster, Warteschlange, Pending/Aktualisierung,
allgemeine und gezielt gebundene Lagequellen. Kurze andere RSS Kontexte
bleiben unveraendert. Originalzeilen werden nicht korrigiert oder geloescht.
Privater Replay aller22:15 bytegleich,3 ganze Praefixe,4 ohne Auszug;
Titel/Links/Zeiten bleiben vorhanden. Understanding und Lage bekommen
denselben wirksamen Kontext. Eine allgemeine semantische Prosapruefung
ist damit ausdruecklich nicht ersetzt.

Direkter Schwesterbefund: `dedup.sourceExcerpt` kappte RSS Texte ebenfalls
bei240 Zeichen, ohne Satzgrenze. In den37 nichtleeren Quellen der obigen
Altpaketmenge sind8 solche Abbrueche belegt. Deshalb im selben Reparaturblock
auch die eigene Kuerzung auf ganze Saetze umstellen. Beim Lesen alter
Auszuege an der bekannten240 Zeichengrenze nur ganze Praefixe verwenden.
Kurze RSS Texte unterhalb dieser Grenze bleiben unveraendert, weil fehlende
Interpunktion allein dort keinen Motorabbruch belegt. Privater Replay der37:
29 bytegleich,6 ganze Praefixe,2 ohne Auszug; kein pauschales Leeren.

Nutzen: bekannte Eingabeabbrueche ohne neue Modellkosten entfernen.
Aufwand: vorhandener Extraktor und Projektionen, keine Architektur,
Migration, Environment Aenderung oder Wiederholung des Quellenlaufs.
Risiko: knappe Metadaten ohne erkennbaren Satzabschluss liefern weniger
Kontext; ganze vorhandene Praefixe bleiben erhalten. Einfachere Alternative
eines zweiten Datenwrites unnoetig, weil alle betroffenen Leser denselben
Vertrag anwenden. Rueckweg ueber geprueften Code Revert, ohne Datenrollback.

Gezielte Pruefung bisher:10 Extraktorgruppen,6 echte Storage Lesepfade mit
lokalem HTTP Transport und beiden Promptbauern,11 Lagebindungsgruppen
bestanden. Zusaetzlicher echter JSONB Projektionsbeleg im bestehenden
PostgreSQL/PostgREST Pflichtlauf vorbereitet. Erster kanonischer Lauf fuer
den Metadatenfix421/421 in623 Sekunden bestanden. Der erneute Lauf nach
RSS Korrektur erreichte419/421 in620 Sekunden: zwei alte Schutzfixtures
griffen bei einem Zeichenblock ohne ganzen Satz auf `null.length` zu.
Ihre Datenminimierungspruefung bleibt mit einem echten ganzen Praefix
erhalten; zusaetzlich wird fuer reine Zeichenbloecke exakt null verlangt.
Danach beide Suiten einzeln ueber den kanonischen Starter bestanden:
`p1-security-check.js`339/339 und `punkt29-fehlervertrag-test.js`80/80.
Damit alle421 Suiten erfolgreich ausgefuehrt; kein behaupteter einzelner
Gesamtlauf am letzten Stand. CI, Merge und Production Wirkung noch offen.

## Abschluss der Satzgrenzenreparatur nach Merge PR451

Begrenzter Reparaturblock **erfolgreich abgeschlossen**, Gesamtauftrag
weiter **teilweise abgeschlossen**. PR451 Head
`6c09d5a195623725970dd06206b14705cc951a4a`; CI35446231275 vollstaendig
bestanden:421/421 Suiten in782 Sekunden, Browser50/0, Kontoschutz15/0 samt
500 isolierten Registrierungen und echtem JSONB Projektionsbeleg, Z22
PASS48/FAIL0. Beide Pflichtjobs und alle24 Schritte erfolgreich.

Nach erneutem Main/Branch/PR/Actions und Schutzabgleich autorisiert gemergt:
Main `2d239abca16e54371e102ff69384f6c981f86ff1`, exakt gepruefter Baum
`b0b449639332e5750ce39aafa31968aa1d33c372`.
Production `dpl_36YBDeCMzWVrh8iwr2ij3jQiPabP` um13:52:31 UTC READY,
Hauptalias und Commit korrekt. Reiner Leser35447091556 um13:53:44 UTC
HTTP200, gleicher Main, Supabase/V3 und exklusiver Profilpfad bestaetigt.
Kommunikation und Kohortenquellen gesperrt, atomare Sperre aktiv,
Retention36, Tagesdeckel2416, Understanding Reserve702, Realreserve200.
Kostenregel2 bei4 USD, unbekannter Ausgang bleibt reserviert. Kein scharfer
Pfad oder Inhaltslauf freigegeben. Main CI35447030496 inzwischen ebenfalls
erfolgreich; vollstaendige PR CI ist oben gesondert bewiesen.

Native SQL13:54:01 UTC gegen Vorflug13:51:52:504/0, alle Profile,
Identitaeten, gesamter Auth und Main Zustand sowie gesonderter Kontenschutz
hashidentisch.22709 Jobs erledigt, null lebende Sperren/Leases, junge
unbeendete Prozesse und offene Reserven. Tagesbuch0,258929 USD.

Wirksamen Quellenvertrag am frisch gelesenen historischen Paketbestand
nachgerechnet:37 gespeicherte nichtleere Auszuege,35 nach Satzpruefung
verwendbar;29 bytegleich,6 ganze Praefixe,2 ohne ganzen Satz. Auf Objektebene
bleiben91/114 ohne wirksamen Auszug,alle500 Profile mindestens einmal und4
nur davon betroffen. Die verworfenen zwei Fragmente waren also nicht die
einzigen Auszuege ihres Objekts. Keine Produktionszeile dafuer geaendert.
Dies ist eine vollstaendige Pruefung dieser begrenzten Quellenmenge und der
zugehoerigen Altpaketzuordnung, keine fachliche Textabnahme aller500 Profile.

Naechste Phase: getrennte semantische Quellenpruefung an den drei erhaltenen
Fehlantworten und positiven Gegenfaellen untersuchen. Vor bezahlter Arbeit
Budget frisch lesen; maximal zwei Aufrufe und0,424 USD im Methodenblock,
keine Wiederholung bei kritischem Fehlurteil, unvollstaendiger Antwort,
unklarem Transport, Kosten oder Schutzbefund. Noch kein Appanschluss und
kein neuer Modellaufruf. Kein neuer Quellenkorrekturlauf, keine Aktivierung.


## Rein lesende Vertiefung nach PR456

19.09., ohne weiteren Quellenlauf, Modellaufruf oder Environmentaenderung.
Die drei erhaltenen negativen Rohantworten wurden anhand ihrer jeweiligen
Originaleingabe erneut gezielt verglichen. Nicht leere Pflichtfelder im
Understanding Schema erklaeren den Fehler nicht hinreichend: Bereits eine
negative Serie enthielt eine korrekte neutrale Angabe zu unbekannten
Betroffenen und zugleich eine erfundene finanzielle Bedeutung in einem
anderen Feld. Deshalb keine Schemaabsenkung und kein weiterer nur damit
begruendeter Promptversuch. Der vorhandene Prompt verlangt Quellenbindung
bereits; Schema-, Akteurs- und Ebenenpruefung pruefen keine allgemeine
inhaltliche Folgerichtigkeit. Exakte Belegzitate koennen die Herkunft
bestaetigen, allein aber nicht jede Bedeutung einer Paraphrase. Die
integrierten Textgrenzen PR453/454 beseitigen Bedeutungsverlust durch
Abschneiden; sie ersetzen diese weiterhin offene Fachabnahme nicht.

Die erneute rein lesende Gruppierung um16:27 UTC bezieht sich weiterhin
auf die114 Wissensobjekte der alten500 Pakete, nicht auf einen neuen Test.
Bei den91 Objekten ohne Auszug verknuepfen71 direkte Medienquellen57
verschiedene Objekte. Hinzu kommen unter anderem direkte Verbandsquellen
15/12, Parteiquellen15/13 und Ausschussquellen8/8 (je Dokumente/Objekte).
Die Objektmengen ueberlappen und duerfen nicht addiert werden. Damit haben
34 der91 gar keine verknuepfte direkte Medienquelle; die bestehende
Auswahl der zwoelf Promptquellen kann den erreichbaren Kontext weiter
verkleinern. Keine dieser Zahlen ist eine Ausfallprognose fuer neue Texte.

Der Originalartikeladapter waehlt ausschliesslich die erste direkte
Medienquelle der bestehenden Promptauswahl und erlaubt pro Verstehenslauf
hoechstens einen neuen Abruf. Einige als Verband/Partei gefuehrte direkte
Links zeigen ebenfalls auf oeffentliche Presseartikel. Das belegt eine
Reichweitengrenze des aktuellen Filters, nicht automatisch einen falschen
Quellentyp. Die ausdrueckliche Ausschlusspruefung fuer andere Quellentypen
wurde nicht entfernt. Auch Titelidentitaet, vollstaendiger Originalabsatz,
CAS, Restzeit und Anbietergrenzen bleiben erforderlich. Ein Einschalten
des Flags allein schliesst die beobachtete Luecke daher nicht. Die
allgemeine Aktivierungsreife und Notwendigkeit einer Environmentaenderung
sind weiter offen; es wurde keine solche Aenderung vorgenommen oder als
bereits abgenommen dargestellt.


Nach dem regulaeren17:30 Rueckstandslauf wurde diese historische Reichweite
am19.09.17:43 UTC erneut rein lesend geprueft:500 Profile,10710 Itemzeilen,
114 aufloesbare Objekte,91 ausschliesslich ohne summary. Alle500 Profile
haben mindestens eine solche Luecke, vier ausschliesslich; null
unaufgeloeste Itemverweise. Das bestaetigt den Fortbestand dieser Luecke,
keinen neuen500er Test und keine neue Modellprognose. Die aktuelle
Production und die inzwischen erfolgte Installation stehen im [Endwegabschluss](testfenster-null500-2026-09-19.md#freigegebene-installation-am-1909-1800-utc). Die dortige fruehere Installationsgrenze ist erledigt; Quellen und Fachabnahme bleiben offen.

## Konkrete verbleibende Quelldatengrenze nach PR460

Rein lesend19.09.20:02 bis20:06 UTC:29782 Rohdokumente,28881 ohne
Auszug. Letzte Neuanlage16.09.16:04:07 UTC, juengste Publikation16.09.15:55:56.
Die22 Originalauszuege aus dem einmaligen freigegebenen Korrekturlauf sind
im Bestand erhalten. Keine neue Quelle und kein Inhalt wurden hier geschrieben.

Gegen die privat festgelegte500er Auswahl nochmals alle letzten
Mandatspakete gelesen:500 Pakete,10710 Items,114 referenzierte Objekte,
91 ohne verknuepften Auszug. Alle500 Profile haben mindestens eine solche
Luecke, vier ausschliesslich. Die vertiefte reine Lesung der Quellen dieser
vier zeigt auch direkte Artikel ohne bisherigen Korrekturversuch. Daraus
folgt eine konkret bearbeitbare Eingabeluecke; weder Erreichbarkeit noch
ausreichende Aussagekraft eines neuen Auszugs werden vorweg behauptet.
Altpakete sind kein neuer500er Prognose- oder Abnahmebeleg.

Eine weitere gespeicherte Quellenergänzung waere eine Aenderung bestehender
Production Rohdaten. Die dokumentierte Einzelgenehmigung deckte genau
den bereits abgeschlossenen ersten40er Auftrag. Sie wird nicht durch
Wiederholung desselben Aktionsworts verlaengert. CLAUDE.md §5 verlangt
fuer diesen weiteren Datenkorrekturblock eine konkrete Freigabe;
die Reparaturfreigabe fuer Code, Merge und rein lesende Kontrollen wird
nicht als allgemeiner Rohdaten-Schreibauftrag ausgelegt.

Der naechste begrenzte Datenblock ist technisch vorbereitet und reviewbar:
einmal `500-direkt-ausbau.yml`, Schritt `quellenkontext-ruhe`, auf dem
frisch READY bestaetigten Main. Dieselbe private feste Auswahl495 plus5,
vier Ausnahmen und alle504 inaktiv. Exaktes Aktionswort:
`TESTKOHORTE_500_QUELLENAUSZUEGE_BEI_NULL_AKTIVEN_BESTAETIGT`.
Hoechstens40 weitere noch nicht versuchte Quellen, hoechstens40 Abrufe
und40 bedingte Zeilenkorrekturen, maximal8 Minuten Arbeitsbudget.
Null KI-Aufrufe und null zusaetzliche Modellkosten.

Zulaessige Inhaltsfelder sind nur zuvor fehlende `raw_documents.summary`
und der Herkunfts-/Versuchsbeleg `raw.helmutQuellenkontext`; bestehende
Betriebssperre und Laufaufzeichnungen gehoeren zur Ausfuehrung.
Nur Originalauszuege mit Artikelidentitaet, ganzen Saetzen, bestehender
Laengen- und Quellenpruefung, Compare and Set und identischer Gegenlesung.
Kein Wiederholen der18 fehlgeschlagenen oder unklaren alten Quellenversuche,
kein Ueberschreiben vorhandener Auszuege, kein Leeren alter Belege.
Ein neuer Fehlversuch bleibt als solcher erhalten und fuehrt nicht zu
einer Schleife.

Vor Start Main, READY, Laufzeitflags, Nullbestand, Konten/Sessions,
Sperren/Leases/Prozesse, Kostenbuch und Cronabstand frisch lesen.
Bei unbekanntem Schreibausgang sofort stoppen und nur die betroffene
Zeile gegenlesen; kein erneuter PATCH. Nachher alle geschuetzten Grundlinien
identisch nachweisen und neu gelieferte Auszuege sowie Restluecken zaehlen.
Keine Profilaktivierung, Migration, Cron-/Environmentaenderung oder
Artikelkontext-Flagaenderung. Kein Modellrichter und kein500er Start.
Ein Coderevert loescht die Auszuege nicht; eine spaetere Datenruecknahme
braucht den genauen Vorherbeleg und eine eigene bedingte Korrektur.

Dies waere eine Eingabereparatur, keine Behauptung einer abgeschlossenen
Prosareparatur. Auch danach muss der allgemeine Beleg-/Formulierungsvertrag
die negativen und positiven Fachfaelle in mehreren Feldern und im
Schwesterpfad bestehen. Quelle, fachliches Urteil und strukturelle
Vollstaendigkeitspruefung bleiben getrennt.

## Zweiter freigegebener Quellenblock am 19.09. um 22:50 UTC

Der Betreiber gab den nach PR461 konkret beschriebenen zusaetzlichen Block
mit Ja frei. Der begrenzte Datenkorrekturlauf ist **erfolgreich abgeschlossen**;
die Eingabeversorgung und der gesamte500er Auftrag bleiben **teilweise abgeschlossen**.
Ausgefuehrt auf Main f854367b3f3de49a0b43223735b14968b5227b2e,
Production dpl_6e46gS6RrRrfUi5fpqniq9bDqexy READY. Main CI35468477635
war bereits erfolgreich. Vorher keine offenen PRs oder laufenden Actions.

Actions35474457060, Job105981180732:20.09.01:50:31 bis01:54:59 Tuerkei,
20.09.00:50:31 bis00:54:59 Berlin,19.09.22:50:31 bis22:54:59 UTC.
Ein Startklick meldete im Browser eine Zeitueberschreitung. Die direkte
GitHub Gegenlesung bestaetigte genau diesen einen Lauf; kein zweiter Klick.
Der Arbeitsauftrag war ausschliesslich quellenkontext bei null Aktiven.

Alle500 Zielprofile geprueft,142 verschiedene ausgewaehlte Quellen.
38 bisher unversuchte Quellen abgerufen und ihre Versuchsbelege bedingt
persistiert:15 Auszuege ergaenzt,23 abgelehnt. Ablehnungen:8 Artikelziele,
3 Titel,8 nicht bestaetigte Abrufe,4 ohne belastbaren Auszug.25 vorhandene
Versuchsbelege uebersprungen; keine Wiederholung eines alten Versuchs.
Die beiden ungenutzten Plaetze des40er Limits sind kein neuer Auftrag.
Im aktuellen ausgewaehlten Eingang bleibt kein noch unversuchter Kandidat.

Leere Auszuege dieses Eingangs63 vorher und48 nachher.327 Profile haben
mindestens zwei Auszuege,91 weiterhin keinen. Diese Mengen beschreiben
die aktuelle Auswahl nach dem regulaeren21:30 Verstehenlauf; eine Aenderung
gegen eine Stunden aeltere Auswahl wird nicht allein diesem Datenblock
zugerechnet. Keine neuen500 Ergebnisse erzeugt oder fachlich abgenommen.

Native SQL vor22:50:03/nach22:55:20 UTC:504 Profile,0 aktiv; alle vier
vollstaendigen Schutzgrundlinien identisch, einschliesslich Auth und Sessions.
Keine Sperren, Leases, offenen Jobs, jungen offenen Prozesse, neuen
Testfensterquittungen oder offenen Reserven. Tagesbuch0,526234 USD,
Limit4 USD vor und nach identisch, null Modellaufrufe und Modellmehrkosten.
Der Kostenanstieg seit dem frueheren Abschluss liegt vor diesem Lauf;
der regulaere21:30 Verstehenlauf ist separat protokolliert.

Alle15 neuen Auszuege vollstaendig gelesen und lokal durch Originalquellenleser,
Satzpraefix und gespeicherten Inhaltshash gegengeprueft:15/15 bytegleich.
Das ist ein Herkunfts und Textvollstaendigkeitsbeleg, keine Bestaetigung
jeder journalistischen Tatsachenbehauptung oder einer erzeugten Interpretation.
Privater Nachweis: Helmut_Quellenblock_35474457060_Nachweis.json.

Kein weiterer Quellenabruf derselben Kandidaten. Der Verdacht, dass die
Sechserauswahl vorhandene Auszuege vollstaendig verdraengt, erklaert die
aktuelle Luecke nicht. Der gezielte Replay von151 Dokumenten zu vier
auffaelligen Wissensobjekten bestaetigte zwar solche Auswahlfaelle. Alle
vier Objekte haben aber pending Status und werden fuer die aktuelle Lage
nicht verwendet. Im getrennt gelesenen abgeschlossenen Objektbestand
hatten die drei Gruppen mit spaeteren Auszuegen bereits4,5 beziehungsweise6
Auszuege unter den ersten sechs. Keine Aenderung dieser Auswahl auf Verdacht.
Native Zeitstempel wurden fuer den Replay nur in die vom REST Leser
gelieferte ISO Darstellung gebracht; daraus folgt kein Production Zeitfehler.

Die regulaeren Abruflaeufe am18. und19.09. jeweils04:00/20:00 UTC hatten
null Auftraege und null Verarbeitungen. Letzte Rohdatenanlage weiterhin
16.09.16:04:07 UTC, juengste Publikation16.09.15:55:56 UTC. Alte Artikel
werden durch ergaenzte Auszuege nicht zu neuen Nachrichten. Der bestehende
globale Erfassungspfad verlangt seine uebergebenen Mandate; die normalen
Auftraggeber liefern bei null aktiven Profilen keine neue Kohortenarbeit.
Die Hilfswege fachzyklus und der alte Stufe A Ausfuehrer sind kein
freigegebener Ersatz fuer einen frischen Eingang bei null aktiven Profilen.
Ein neuer Quellenimport waere ein neuer Production Datenauftrag; der
abgeschlossene38er Block gibt ihn nicht frei. Keine Aktivierung als Umweg.

Allgemeine Prosa, Quellenfrische und der belegte Zeit und Kostenplan fuer500
bleiben offen. Der separate Modellrichter aus PR452 bleibt verworfen.
Ein wortgleiches Quellenzitat beweist seine Herkunft, aber nicht die
Folgerichtigkeit eines zusaetzlichen Urteils. Auch erzeugte strukturierte
Risiko und Bedeutungsfelder sind ohne unabhaengigen Eingabebeleg keine
neue Tatsachengrundlage fuer eine deterministische Umformulierung.

## Kontextverlust bei globaler Dublettenverarbeitung

19.09.2026, teilweise abgeschlossen. Eigener Branch
`codex/testnachlauf-fenster-20260919`, Basis Main f854367.
Keine konkurrierende Arbeit oder offenen PRs vor der Aenderung.

Zwei oeffentliche RSS Abrufwege wurden einmal isoliert gelesen, ohne
Production Zugang oder Modellaufruf: die beiden relational als healthy
und always_on belegten Wege deutschlandfunk-politik und tagesschau-politik.
Je Weg maximal16 Eintraege,15 Sekunden,1 MiB, keine Weiterleitung,
kein Wiederholen und keine Artikelabrufe. Publikationsdatum muss wirklich
im Eingang stehen und innerhalb48 Stunden liegen. Ein Datum aus einem
Normalisiererfallback gilt nicht als Frischebeleg. Auszuege muessen ganze
gelieferte Saetze enthalten. Grenzen gelten allgemein, nicht je Meldung.

Erster Actionslauf35476120110: elf Offline Pruefgruppen erfolgreich;
der echte Leser wurde versehentlich ebenfalls im Offline Schutz gestartet.
Beide Netzversuche wurden lokal gesperrt, null externe Abrufe. Kein
Publisherfehler und keine erfolgreiche Quellenaufnahme. Der zweite Lauf
35476247012 am20.09.02:29 Tuerkei /01:29 Berlin /19.09.23:29 UTC startete
nur den ausdruecklichen Quellenleser mit leerer Prozessumgebung. Alle
Offline Tests behalten den vorgeschriebenen Schutz. Zwei GET Requests,
32 gelesene Meldungen,31 akzeptiert, eine wegen unvollstaendigem Auszug
abgelehnt. Null Production Writes, null Modelle, kein Import.
Alle31 Titel und Auszuege vollstaendig gelesen. Native Gegenlesung der
31 Kennungen: keine bereits vorhanden. Das ersetzt keinen globalen
Abgleich gegen andere Kennungen und keine vollstaendige500er Versorgung.

**Belegte Ursache:** scheduler minimiert Quellen korrekt, doch
`dedup-global.buildDocument` baut das Dokument nur aus Identitaetsfeldern
neu. summary, url und source_name fehlen danach bei allen31 Meldungen.
Der Storage Spaltenfilter kann nicht retten, was vorher weggeworfen wurde.
Der Warteschlangenpfad verwendet bereits die Minimierung direkt und hat
diesen Verlust nicht. Production Aggregat:29782 Rohdokumente,28866 ohne
summary;18278 mit content_fingerprint, davon17948 ohne summary. Dieses
Aggregat beweist nicht die Ursache jedes einzelnen historischen Leerfelds.

**Erwartung vor Aenderung:** Originalkontext der gewaehlten Primaerquelle
erhalten, keine Mischung mit einer schwaecheren Fundstelle. Unbekannter
Kontext und unbekannte Zeit bleiben unbekannt. Kein Volltext, Rohpayload
oder Personenfeld neu speichern. Dokumentidentitaet, Ranking und
Fundstellen bleiben gleich. Vorhandene Quellenbelege duerfen weder durch
leere noch durch abweichende neue Feedtexte ueberschrieben werden.

Kleinster gemeinsamer Anschluss: die bestehende Minimierung liefert
summary, url, source_name, source_type, confidence, link_type, retrieved_at,
document_type und wahlperiode; nur wirklich vorhandene Werte werden
uebernommen. raw und cluster_id werden nicht neu gesetzt. Der globale
Anlagepfad verwendet atomare Neuanlage mit ignore-duplicates, auch im
Einzelrueckfall. Das schuetzt ID Konflikte ausserhalb des14 Tage Fensters
und konkurrierende Anlagen. Als neu zaehlen nur vom Speicher zurueckgegebene
Kennungen; bereits vorhandene oder unbestaetigte Zeilen zaehlen nicht.
Fundstellen und der bestehende bedingte Zaehlerpfad bleiben erhalten.
Historische Quellen werden nicht automatisch ergaenzt oder ersetzt.

Lokaler Vergleich der echten31 Eingaben: vorher0 Auszuege, nachher31
bytegleich erhalten; Dokumentidentitaeten und alle Fundstellen unveraendert.
Privater vollstaendiger Nachweis Helmut_Quellenmotor_Replay_20260919.json,
Eingabehash9abde02e10f37136bf1b094b0f4aa4665399893776521f46b980028dd8a8f36d.
Zehn neue Offline Pruefgruppen erfolgreich, dazu alle sieben betroffenen
Bestandssuiten. Der bestehende verpflichtende PostgreSQL Nachweis prueft
zusaetzlich beide realen Speicherpfade und geschuetzte ID Konflikte.
Kanonischer lokaler Gesamtlauf ueber scripts/lokal.js mit Exit0 beendet.
Sein vollstaendiger Schlussbericht ist in der Dateiansicht nicht verfuegbar;
daraus wird keine separat abgelesene Suitenanzahl behauptet. Eine wegen
verzoegerter Dateiansicht gestartete isolierte Diagnoseausfuehrung wurde
danach beendet und zaehlt nicht als zweiter Gesamtnachweis. Die echte
CI Datenbankabnahme steht noch aus. Native SQL23:49 UTC weiterhin504/0,
identische Schutzgrundlinien, keine offene Arbeit/Reserve,0,526234 USD.
Auch der volle Abgleich der31 neuen Kennungen, Fingerabdruecke und
kanonischen Adressen gegen Production ergab keine Bestandstreffer.

Vor geplanter Integration: Wirkung ist Quellenkontext bei kuenftigen neuen
Dokumenten; Risiko sind Dubletten und Feldueberschreibung, deshalb deren
explizite Gegenpruefung. Rueckweg ist Revert der notwendigen Codeaenderung,
kein Loeschen neu angelegter Quellen. Nach Merge Deployment, Alias,
Main Commit und geschuetzte Production Grundlinie rein lesend kontrollieren.
Kein neuer Quellenimport, keine Aktivierung, kein geaenderter Kostenriegel.
Erhaltener Quellenkontext ist noch kein Beleg fuer freie Modellfolgerungen.

Erste PR462 CI35477560079: neue Quellenpersistenz, atomarer Belegerhalt
bei ID Konflikten und Schwesterpfad gegen echtes PostgreSQL erfolgreich;
Kontoschutz samt500 isolierten Registrierungen und Browser ebenfalls
erfolgreich. Gesamtlauf gescheitert: der nachfolgende bestehende500er
Datenbanktest konstruierte kurz nach UTC Mitternacht ein ungueltiges
Kostenfenster. Offline Gesamtsuite und Z22 wurden deshalb nicht erreicht.
Der Fixturefehler und seine Reparatur stehen im kanonischen
[Testfensterbeleg](testfenster-null500-2026-09-19.md#utc-grenze-der-datenbankfixture).
Kein Merge auf Basis dieses unvollstaendigen Laufs.
