# Quellenreparatur bei null aktiven Profilen

Stand 19.09.2026. Gesamtstatus: **blockiert** an der ausdruecklichen
Freigabe der Production Quelldatenkorrektur nach CLAUDE.md Abschnitt 5.
Codeintegration und rein lesender Production Abschluss: **erfolgreich abgeschlossen**.
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

Noch **nicht ausgefuehrt**. Erst nach Integration, READY Abgleich, frischer
rein lesender Grundlinie und ausdruecklicher Freigabe der Quelldatenkorrektur:

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
ausdrueckliche Freigabe. Der aktuelle Auftrag erlaubt notwendige Code Merges
und deren automatische Deployments, aktiviert aber weder diesen Datenlauf
noch Profile, Feature Flags oder einen neuen 500er Test. Eine Environment
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
| Quellenreichweite | Relevante Luecke bestaetigt; Reparaturbedienweg integriert und technisch geprueft, Production Quelldatenlauf nicht freigegeben. Originalzugriff und Wirkung auf Fachtexte noch offen. |
| Morgenversorgung | PR421 repariert Speicherung und Nachtrag vorhandener Lage; technische Integration bewiesen, Versorgung aller 500 noch offen. |
| Lagekapazitaet | PR420 repariert aktive Auswahl, Rotation, Beginn und 500 Laufplaetze; serielles Zeitbudget und Vollversorgung noch offen. |
| Quellenabruf/Google News | Artikelaufloesung und gebundener Kontext integriert; keine Zusage, alle heutigen Originalartikel erreichen zu koennen. Quellenfrische und Auszugreichweite im neuen Lauf pruefen. |
| Deferred/Ablehnungen | Bleiben gesonderte Nichtabschluesse; weder erledigte Jobs noch Leertexte als bestandene Fachversorgung zaehlen. |
| Mandat/Lage Vollstaendigkeit | Historisch 497/500 bzw. 5/500; kein heutiger Nenner und kein neuer Fachnachweis. |
| Morgenfrische | Historisch 131/500 Morgenquittungen; neues Tagesfenster mit gespeicherten Paketen abzugleichen. |
| Testende | Alter Timer abgelaufen; bisheriger Abschluss laesst fuenf aktiv. Neuer bestaetigter Weg 0 auf 500 auf 0 und zugehoerige Terminierung weiterhin offen. |

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

Naechste fachliche Phase bleibt bis zur ausdruecklichen Freigabe des oben
vollstaendig begrenzten Quelldatenlaufs blockiert. Der eigene abschliessende
Dokumentations PR aendert ausschliesslich diese Datei und CURRENT_STATE;
sein Merge und Deployment werden gemaess CLAUDE.md Abschnitt9 in GitHub und
Vercel belegt, ohne rekursiven Dokumentations PR. Fachlich besteht weiterhin
keine Bereitschaft fuer den500er Teststart.
