# Artikelidentität und widersprüchliche Quellenzeiten

Stand 17.09.2026. Fünfter begrenzter Reparaturteil auf PR422. Status: teilweise abgeschlossen. Korrektur und lokale Prüfungen fertig; unabhängige GitHub CI und spätere Production Wirkung getrennt im zugehörigen Draft PR nachweisen. Kein Merge und keine Production Wirkung.

## Übernahme und Basis

Der erste rein lesende Abgleich fand gegenüber dem übergebenen Stand bereits PR422 mit Head `6528ecabb028fcfbdc97e1ed55c84f2bbc8dfc83`. Die Titelreparatur wird erhalten und nicht erneut implementiert. Der Betreiber bestätigte anschließend das Stoppen der bisherigen Threads und autorisierte die Fortsetzung hier. Erneuter Abgleich gegen 13:10 Türkei / 12:10 Berlin / 10:10 UTC: keine neuen Commits oder weiteren Reparaturbranches. Einziger aktueller Actionslauf war die isolierte CI von PR422, kein Production Lauf. Keine fremden lokalen Reparaturprozesse sichtbar. Ein globaler Work Sitzungsstatus bleibt nicht abfragbar; der private Übergabebeleg Version505 ist historisch und keine neue Exklusivitätsgarantie.

Main unverändert `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`. PR419, PR420 und PR421 offen, Draft, ungemergt mit unveränderten Heads und erfolgreichen CI Läufen. PR422 offen und ungemergt; CI35208611642 am exakten Head anschließend vollständig erfolgreich, beendet17.09.13:20:40 Türkei /12:20:40 Berlin /10:20:40 UTC.397/397 Suiten in790s, Browser und Kontoschutz samt500 Registrierungen erfolgreich, Z22 PASS48/FAIL0. Dieser bestehende Lauf wurde nur nachgelesen. Eigene Kopie `/workspace/scratch/7516b5a83caa/helmut`, Branch `codex/artikelidentitaet-20260917`, Basis exakt PR422. Alle fremden Kopien und die 55 älteren uncommitteten Vorarbeiten bleiben erhalten. Erster veröffentlichter Zwischencommit `fad9d533bfb20b37944ee1e65291d03a9a6267cf`, Dateibaum `c8ae0575a5d8cd3b0ecd4d6bbef299c5e8922438`, bytegleich zum erhaltenen lokalen Zwischencommit `01a6ad16bfd3dcece7041c0e64154c51ae9be9d9`. Veröffentlichung über die vorhandene GitHub Verbindung. Die saubere Arbeitskopie ist anschließend an den veröffentlichten Commit gebunden.

Vercel rein lesend bestätigt: Deployment `dpl_At93X1HMzB5fsAJ2wZQ8FuvW3Dfy`, Production READY, passender Main und Hauptalias. Am17.09. bis zur Übernahme kein neues Deployment. Keine frische Production Datenbankaufnahme.

## Originalbefund und Ursache

Original `Qualitaetsbefund_A001_Doppelte_Artikelkennung_20260915.json` im privaten Paket `Helmut_500_Productiontest_20260915_Belege.zip`, Version18. Die zwei WELT Links enthalten dieselbe 24-stellige Artikelkennung, aber verschiedene Pfadtexte. Die gespeicherten Veröffentlichungszeiten lauten11.09. und13.09.2026. Der Originalbericht bewertet sie ausdrücklich nicht als zwei unabhängige Quellen. Originalinhalt und maßgebliche Veröffentlichungszeit sind darin ungeprüft.

Die erhaltene Originalaufnahme `Pruefaufnahme_A001_34984794661.json`, SHA256 `6da8ee383caede846d0e312f7366c6fbb81d8d5ebeed0dc7a1c9c6209f995455`, enthält dieselben zwei Quellen unter22 Briefingkarten. Der bisherige Adapter `buildSources` übernimmt jede Dokumentzeile unverändert als eigene Quelle. Die allgemeine URL Normalisierung entfernt technische Varianten, gleicht diese Artikelkennungen bei verschiedenen Pfadtexten aber nicht ab. Die sichtbaren Quellenzähler folgen den Zeilen; die Frischeauswahl kann deren jüngstes Datum verwenden.

## Begrenzte Korrektur

* Die Briefingprojektion erkennt das belegte WELT HTTPS Format mit 24-stelliger Kennung auf exakt `welt.de` oder `www.welt.de`. Andere Anbieter, andere Kennungen, unbekannte Formate, zusätzliche Hostnamen, Zugangsdaten und abweichende Ports werden nicht gleichgesetzt.
* Varianten derselben Kennung ergeben eine Quelle. Der erste vorhandene Link bleibt mit seinen bisherigen Texten verbunden. Es wird keine angeblich kanonische URL erzeugt und keine Artikelversion als maßgeblich bezeichnet.
* Alle geladenen Belegvarianten bleiben unter `variants` erhalten, mit ursprünglichem Link, Titel, Zusammenfassung, Veröffentlichungszeit und Dokumentkennung. Rohdaten, Dokumenthashes, Speicherung und Eingaben werden weder zusammengelegt noch verändert.
* Unterschiedliche Zeitpunkte ergeben `publishedAt=null` und `publishedAtConflict=true`. Gleichwertige Zeitangaben mit verschiedener Zeitzone sind kein Konflikt. Fehlende Datumsangaben werden nicht erfunden.
* Briefingkarten, Empfehlungen und der zugehörige Detailstand zählen diese Artikel einmal. Alle zugrunde liegenden Quellenkennungen bleiben erhalten. Bei nicht betroffenen Vorgängen bleibt auch der bisherige Zählervertrag unverändert.
* Für zusammengefasste Varianten tragen nur widerspruchsfreie Artikelzeiten den Meldungszeitpunkt. Fehlt danach ein Datum, werden auch die im Detailstand verwendeten Ersatzzeitfelder leer gehalten. Analysezeit und Ersterfassung dürfen den fehlenden Publikationsbeleg nicht als heutige Meldung ausgeben. Ein anderer Artikel mit eindeutigem Datum kann weiterhin den Meldungszeitpunkt belegen.

Dies klärt die Identität und behandelt den Widerspruch ehrlich. Es bestimmt ausdrücklich NICHT das richtige Publikationsdatum oder die sachlich richtige Fassung.

## Prüfungen

Neue synthetische Suite `scripts/briefing-artikelidentitaet-test.js`:11/11 Gruppen erfolgreich. Vor der Änderung scheiterte der erste Test am belegten Fehler zwei statt einer Quelle. Abgedeckt sind Host und Kennungsabgrenzung, Erhalt sämtlicher Varianten und Rohdatenkennungen, gleiche sowie fehlende Zeiten, Reihenfolge, alle betroffenen Quellenzähler, Tagesstatus, Briefingfenster und Schutz vor falscher Schwerpunktverdrängung.

Privater Replay:22/22 Originalquellenlisten exakt reproduziert. Eine Karte und ihre Empfehlung korrigiert,21/21 übrige Karten unverändert. Genau sechs Vertragsfelder ändern sich: Quellenliste, Primärquelle und Quellenzahl in der betroffenen Karte sowie ihrer Empfehlung. Beide ursprünglichen Varianten vollständig erhalten, der strittige Zeitpunkt leer. Alle anderen Vertragsfelder und sämtliche Eingaben identisch. Keine privaten Originalkarten oder Profile im Repository. Der Replay läuft auf der erhaltenen Aufnahme, nicht gegen Production.

Gezielte bestehende Regressionen: Quellen Dedup13/13, Contract Adapter31/31, CurrentHelmutState92/92, Frischevertrag69/69 und Schwerpunkt78/78 erfolgreich. Alle neuen Tests über `scripts/lokal.js`, ohne Production Zugang. Lokale Abhängigkeiten aus der abgeschlossenen PR421 Kopie bei identischen Paketdateien; vorhandene Playwright1.56.1 Laufzeit passend zur CI. Kein Download, keine Paketänderung oder Schutzabsenkung.

Kanonischer Gesamtlauf: **398/398 Suiten in648 Sekunden**, Exit0. Danach wurde ein konkreter Randfall zusätzlich reproduziert: Eine HTTP Variante vor einem HTTPS Beleg könnte beim Gruppieren das nutzbare Linkziel verdecken. Die Identitätserkennung ist deshalb abschließend auf das belegte HTTPS Format begrenzt; andere Protokolle bleiben getrennt. Gezielte Nachprüfung am finalen Anwendungscode: Artikel11/11, Contract31/31, Detailstand92/92, Quellenpflicht58/58 und Dedup39/39 erfolgreich. Der private Originalreplay erneut identisch erfolgreich. Lokal gilt Gesamtlauf plus diese Nachprüfungen, kein behaupteter zweiter vollständiger Lauf am letzten Codezustand. Syntax, Diff und Statusgröße erfolgreich. Der vollständige GitHub Gesamtlauf wird separat am finalen PR Head belegt.

## Grenzen und nächster Schritt

Der Eingriff ist auf die Briefingprojektion und das belegte WELT URL Format begrenzt. Keine neue allgemeine Quellenplattform. Raw Document Identitäten, Erfassung, Clustering, gespeicherte Wissensobjekte und die separate Radarprojektion bleiben unverändert. Die Variantenmetadaten sind im Vertrag enthalten; es entsteht keine neue Bedienoberfläche. Vollständige Altpakete werden nicht rückwirkend verändert.

Das maßgebliche Originaldatum und die Artikelversion bleiben fachlich ungeklärt. Die bereits belegten falschen Zuschreibungen, Ebenen, Ereigniszeiten, fehlenden Quellentexte und Profilbezüge sowie Auswahl und Wiederholung sind durch diesen Sprint nicht behoben. Der als bevorstehend ausgegebene abgeschlossene Gipfel und die Vermischung zweier Ministerreisen bleiben offene Originalbefunde.

Nächster begrenzter Inhaltsblock: Zuschreibung und Ereignisbindung anhand dieser beiden erhaltenen Originalvergleiche. Zuerst den kleinsten gemeinsamen Fehlerpfad belegen, keine pauschale Faktenfreigabe. Dafür nach Abschluss dieses Sprints einen neuen Thread verwenden, Denkstufe Sehr hoch. Vor erneutem500er Nachweis bleiben Versorgungskapazität, begrenzte Fortsetzungsplanung, fachliche Aussagenprüfung, vollständiger App Abruf aller500, Kosten, zuverlässiges Testende und unabhängiger Abschluss erforderlich.

Automatische Deployments dieses Branches sind vor Veröffentlichung in `vercel.json` ausgeschaltet. Alle13 Crondefinitionen unverändert. Kein Merge, Deployment, Migration, Profilwechsel, Production Datenänderung, Environment oder Azure Wechsel, Budgetwechsel, externer Versand oder bezahlter Modellaufruf. Lokaler Rückweg: nur diesen Folgebranch zurücknehmen. Ein späterer Production Rückweg braucht gesonderte Freigabe und muss die Zustandsversion3 aus PR420 erhalten. Merge würde Production deployen und ist nicht freigegeben. Ein neuer vollständiger500er Test braucht neue Startfreigabe.
