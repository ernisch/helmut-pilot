# Pflichtversorgung: verbliebene Ursachen und begrenzte Korrekturen

## Tatsächlicher Ausgangsstand am28.11.

Die gespeicherte07:20-Ausgabe war vor07:30 über den normalen Kundenleser
verfügbar, aber ausdrücklich teilweise: Pflichtversorgung9/12, Abrufabdeckung43/52,
fehlender belegter Tagesanlass. Die heutige Morgenabnahme bleibt gescheitert.
Das49erModellaufkommen bei der Morgenkontrolle erklärt diese Pflichtlücken
nicht durch Tagesbudgeterschöpfung; der Zähler erreichte erst später100/100.

Nach der freigegebenen einmaligen Wiederaufnahme um14:00Berlin ist der
blockierte Quellenauftrag erledigt. Reguläre Hetzner-Folgeläufe um14:15,14:30
und14:45 sind auf02a74e69 gespeichert und vollständig bilanziert, ohne
Leaseverlust. Das ist ein Wiederanlaufnachweis, keine vollständige Kundenabnahme.

## Erneuter Datenbankausfall beim Wiederaufnahmelauf

PR1366 ist auf `4c25df17` ausgerollt. Der einmal freigegebene Politico-Lauf
vom28Nov16:45Berlin hat den Zielauftrag im zweiten Versuch leasefrei erledigt.
Die hashgeprüfte Hostantwort belegt80reservierte Aufträge:9erledigt,
38zur Wiederholung vorgesehen,30zurückgestellt und3endgültig fehlgeschlagen;
kein Leaseverlust. Die30Vertagungen betreffen11Anbietergrenzen vor Abruf
und19übersprungene Analysen. Das ist keine vollständige Versorgung.

Der Laufabschluss scheiterte mitHTTP521; auch der Lesespiegel mit94gesammelten
Einträgen wurde nicht bestätigt. Die kanonische Ablage blieb laut nativer
Fehlermeldung unberührt. Daraus folgt weder ein Verlust kanonischer Inhalte
noch ein erfolgreicher Spiegel. Relational bleibt die Laufzeile `running`
mit unbekannter Endzeit und unbekannten Zählern. Kein Quellenfreigabe-Replay.

PostgreSQL begann um16:49:18Berlin erneut, nach einem weiteren Start um15:46:37Berlin.
Zwei Prozessquittungs-POSTs um16:49:17 und16:49:32Berlin erhielten521;
57P03/PGRST002/08006 bestätigen die Verbindungsunterbrechung. Der Auslöser
bleibt ohne Compute-/Kernel-/Restart-Audit offen; kein OOM- oder Lastbeleg.
Die sieben aktualisierten terminalen Zeilen sind nicht sieben neue Fehlschläge:
vier wurden nur erneut beobachtet. Neu abgeschlossen wurden eine alte
Budgetwartefrist und zwei Diagnosejobs zu Versionskonflikten. Zwei historische
Table-Aufträge mit Profilbindungsfehler bzw. Budgetwartefrist haben allerdings
heute erneut belegten Abrufbedarf; passende fertige Analysen fehlen. Sie sind
keine irrelevanten Altlasten und brauchen einen frisch abgesicherten Reparaturweg.
Für die zwei Versionskonflikte fehlt eine heutige positive Zielbindung.

Das konkrete GO für Politico, zwei Regierungsfassungen und den bedingten
EU29-Fall liegt vor. Nach dem technischen UNKNOWN bleiben Folgeaktionen
gestoppt; bereits verbrauchte Einmalrechte und Reserven bleiben erhalten.
100Hetzner-Aufrufe sind ausgeschöpft. Die28Nov-Morgenabnahme bleibt FAILED.
Der lokale Folgefix erhält die genaue Abschlusszeile bei Speicherfehlern und
bestätigt unklare Schreibantworten nur bei exakt passendem persistiertem Beleg.
Er führt keinen zweiten Schreib- oder Quellenaufruf aus und ersetzt weder
den fehlenden aktuellen Laufabschluss noch eine Produktionsabnahme.

## Endlicher negativer Abschluss entfallener Altaufträge

Ein frischer Originalbefund zeigt469Quellenjobs mit erster Fälligkeit11.–19Nov,
die trotz fehlender heutiger Abrufbindung immer wieder um24Stunden verschoben
wurden. Die native Vertagung gab den Versuch zurück. Damit war ihr Lebenszyklus
unbegrenzt, obwohl die vorgelagerte Rechteprüfung den Abruf korrekt verhinderte.

Nur ein vollständig gebundener, abgeschlossener heutiger UTC-Tagesplan darf
nun einen permanenten negativen Ausgang `quellenbedarf-entfallen` begründen.
Der unveränderte native Claim-/Finish-Pfad verbraucht die vorhandenen Versuche
bis zur bestehenden Obergrenze. Kein Erfolg, Abrufbeleg, Löschen oder Zählerreset.
Ein neuer Tagesbedarf erhält weiterhin einen eigenen regulären Fensterschlüssel.

Fehlende, offene, fremde, beschädigte oder widersprüchliche Pläne bleiben vertagt.
Planlesefehler behalten ihren bereinigten Erstfehler. Frist und UTC-Tag werden
vor dem negativen Abschluss erneut geprüft. Bestehende positive Identitäts- und
Google-Feed-Bindungen bleiben erhalten. Es gibt keine pauschale Mutation der469Zeilen;
die Korrektur greift bei deren regulärer Übernahme.

## Zwei weitere belegte Metadatenvarianten

Die neue Bilanz seit der Wiederaufnahme zeigt zwei weitere enge Leserfehler:
RND/RND.de sowie OSTHESSEN|NEWS/Osthessen|News mit dem jeweils zugehörigen
Titelsuffix. In den gespeicherten Originalpaaren stimmen direkte Artikeladresse,
kanonische Adresse, Titelrumpf und exakte Publikationszeit überein. Nur diese
hostgebundenen Paare werden im bestehenden Leser ergänzt. Andere Titel,
Zeitpunkte, IDs, Hosts und Zugriffsarten bleiben gesperrt; die kanonische
Persistenz erhält keine zusätzliche Schreibfreigabe. Beide Originalpaare sind
textlos. Ihre Metadatenäquivalenz erzeugt keinen Artikeltext oder KI-Erfolg.
Die betroffene bestehende Suite besteht14/14; beide Originalpaare scheitern vor
der Korrektur und sind danach ausschließlich als Metadaten lesbar.

## Zwei aktuelle amtliche Regierungsfassungen

Die14RohIDs ohne Analyseverweis in zwei Morgenquittungen sind keine14fehlenden
aktuellen Analysen. Neun sind bekannte Archivkennungen ohne belegte aktuelle
Analysepflicht. Für unbeobachtete neuere Fassungen wird daraus nichts abgeleitet.
Drei weitere sind aktuelle HIB-Fassungen; der dafür erforderliche enge Leserfix
ist bereits in02a74e69 enthalten und wird nicht erneut implementiert.

Zwei amtliche Regierungsfassungen sind tatsächlich aktuell und fachlich verändert:
„Zuckergetränkesteuer soll Gesundheitssystem entlasten“ vom27Nov13:51UTC und
„Etat im Zeichen von Wohlstand und Sicherheit“ vom27Nov11:45UTC. Die älteren
kanonischen Zeilen tragen andere Titel, Texte und Publikationstage. Ein Alias
oder Ausblenden anhand des alten Datums würde neue Sachstände verwerfen.

Der getrennte Bestandsoperator `scripts/ops/quellen-breg-neufassungen-20261128`
bindet ausschließlich diese zwei Fassungen. Vor deren Promotion erhält er die
vollständigen aktuellen historischen Quellenansichten von acht KO-Versionen
(einmalv5, siebenmalv1):110Rohzeilen,155Verknüpfungen, höchstens103fehlende
unveränderliche Archive. Bestehende KO-Zeilen einschließlich gemischter Zustände
und alter Zählabweichungen bleiben exakt erhalten. Bestandssnapshots sind keine
nachträglich erfundenen historischen Modelllektüren.

Vorschau und nativer Plan müssen dieselben vollständigen Vorwerte bestätigen.
Aktivierung braucht ein neues konkretes GO, frische Plattform-/Migrations-/GIZ-
und Kostenbelege sowie die Fünfminutenbindung. Die100/0-Aufrufbindung gilt
ausdrücklich für Hetzner; Vercel belegt den Kundenleser und denselben Geldvertrag.
Erst nach Erwerb aller bisherigen
globalen Schreibsperren liest ein getrenntes Hauptstatement den aktuellen Zustand.
So bleiben zwischen Vorflug und Sperre bestätigte Claims oder Quotenwrites sichtbar.
Kein Modell-/Quellenstart, keine Job-, CAS-, Kosten-, Profil- oder Rechtemutation.
Eine dauerhafte Einmalquittung verhindert Wiederholung; der Rückweg ist nach
Claim, Konsum oder Snapshotabweichung gesperrt. Archive werden auch beim Rückweg
erhalten. Der alte bereits ausgeführte27erOperator bleibt unverändert.

## EU-UNKNOWN: neuer getrennter29Nov-Vorschlag

Der28Nov-Freigabeaufruf verlor beim Austausch der Ausführungsumgebung seine
Originalantwort. Eine dauerhafte Quittung fehlt; Job und CAS blieben im gesperrten
Vorwert. Zusätzliche PostgreSQL-Loglesungen ersetzen die fehlende Antwort nicht.
Die alte Freigabe wird nicht wiederverwendet.

Der neue Operator `scripts/ops/quellen-eu-wiederaufnahme-20261129` ist auf29Nov,
einen neuen Einmalschlüssel und ein neues konkretes GO beschränkt. Jede später
auffindbare alte Aktivierungs-/Rückwegquittung sperrt ihn. Ein tatsächlich fertiger
neuer Tagesplan und ein regulärer positiver amtlicher Pflichtabruf müssen exakt
Artikel, Archivhash und Einzelauftrag erneut belegen. Ohne Bedarf keine Aktion.
Die historische Fehlabschlusszeit bleibt unverändert an27Nov gebunden.

Zulässige Wirkung: native CAS-Entscheidung `erneut`, maximal ein zusätzlicher
Jobversuch3→4; kein Versuchsreset, kein direkter Worker-/Modell-/Quellenstart.
Die alte0,212USD-UNKNOWN-Reserve bleibt erhalten; eine volle neue Reservierung
muss zusätzlich in den bestehenden Grenzen möglich sein. Rückweg nur vor Claim,
unter exakt quittiertem Nachzustand. Bei FAIL/UNKNOWN sofort stoppen, nicht wiederholen.

## Grenzen und noch erforderlicher Produktionsnachweis

Unveränderte Betriebsgrenzen:1USD/UTC-Tag,30USDkumulativ,100Hetzner-Aufrufe,
Reserve0 auf Hetzner,16Originale. Die frische Vercel-Projektprüfung zeigt
2416Aufrufe/702Reserve bei16Originalen. Die ursprünglichen Freigaben bezeichnen
die100Aufrufe ausdrücklich als Hetzner-Grenze; sie belegen keine entsprechende
Vercel-Vorgabe. Unterschiedliche Appwerte allein sind kein nachgewiesener
Produktionsfehler und keine Erlaubnis zur Änderung. Projektkonfiguration ist
auch kein neuer Runtimebeleg. Die neu vorbereitete Vorflugannahme wurde daher
auf ihren belegten Umfang berichtigt; keine Produktionsvariable wird verändert
und kein systemweiter100er-Deckel behauptet. Native1/30USD-Buchwachen und der
100er-Gegenwert im aktuellen Queuevorflug bleiben unverändert.
Sieben ungeklärte Geldbindungen mit1,484USD bleiben geschützt. Die sechs aktuell
noch im Eigentümerfilter stehenden abgelaufenen CAS-Zeilen sind eine andere Menge;
sie werden exakt gebunden und nicht bereinigt. Der siebte frühere CAS steht jetzt
mit dem Grund `kein-ergebnis-vor-modellstart`, `ki_aufrufe=0` und ohne Eigentümer
wieder offen. Daraus folgt keine Geldfreigabe.

Quellenkonflikte ohne Primärbeleg und unbekannte historische Modellausgänge bleiben
gesperrt. Der GIZ-Veröffentlichungsriegel bleibt unverändert; Nachrichten über
Parteien werden nicht pauschal gefiltert. Kein Quellenrecht wird erweitert.

Neue Codeprüfungen und lokale Operatorbelege sind keine Produktionsaktivierung.
Die beiden Bestandskorrekturen brauchen ihren konkreten Freigabeschritt; der EU-Fall
zusätzlich den tatsächlich neu belegten Bedarf und freie reguläre Kapazität.
Kein nachträglich vervollständigter Datensatz darf die heutige verfehlte Frist
umschreiben. Die Betriebsabnahme erfordert ein späteres tatsächlich vollständiges,
fristgerecht gespeichertes und am normalen Kundenleser verfügbares Morgenpaket.
Private Originale, Erstfehler, Testprotokolle und unabhängige Reviews liegen
außerhalb von Git im vorhandenen Reparaturverzeichnis.

## Erhaltene Vergleichsnachweise

**25.11. Offline.** Lasttest 320/323, 0/2 vollständig. Einzelmorgen 51/51. [Monat 26/30 vollständig](quellen-monatssimulation-20261125.md). Teilfassung Desktop/Mobil 15/15, Budget PostgreSQL 59/59. [Lasttest](https://github.com/ernisch/helmut-pilot/actions/runs/45584784897) · [Einzelmorgen](https://github.com/ernisch/helmut-pilot/actions/runs/45590271955) · [Drei Tage](https://github.com/ernisch/helmut-pilot/actions/runs/45596100664)
