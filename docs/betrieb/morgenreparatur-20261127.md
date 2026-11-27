# Gezielte Morgenreparatur vom 27.11.2026

## Anlass und tatsächlicher Betriebsstand

Die Abnahme auf `e93b45e9` ist gescheitert. Der normale Kundenleser lieferte
am 27.11. um 07:29:22 und 07:32:11 Uhr Berlin die quittierte Teilfassung mit
64 Meldungen. Es gab keinen freigegebenen Lage-Text. Die zwölf Pflichtabrufe
enthielten zehn vollständige und zwei teilweise Quittungen; von 84 exakt
referenzierten Analysen waren 83 erledigt und eine terminal gesperrt.
Private Originale und Hashmanifeste bleiben außerhalb von Git erhalten.

Die direkte Lesung um 11:39 Uhr bestätigte den weiterhin regulären Hetznerbetrieb,
1.552 fällige Analysen und 105 fällige Abrufe. Eine spätere Lesung um 11:42 Uhr
ergab 41 seit 01:00 Uhr abgeschlossene terminale Dokumentaufträge. Das ist eine
zeitbezogene Fehlerbilanz, kein Auftrag zur pauschalen Bestandsänderung.

## Nachgewiesene interne Fehler und kleine Korrekturen

### Amtlicher HIB-Archivstand im nativen Leser

Vier der zwölf heutigen Quellenstandfehler betreffen gültige amtliche HIB-Fassungen.
Der native Datenbankleser liefert den Abrufpfad als `quellenabrufpfad`; vollständige
Rohzeilen führen ihn in `raw.retrievalPathId`. Die bestehende Abbildung überschrieb
das projizierte Feld mit `undefined` und rekonstruierte die Gegenseite nicht.
Dadurch wurde eine erlaubte Metadatennormalisierung als Textabweichung klassifiziert.

Der Leser bildet beide bereits unterstützten Formate auf den unveränderten engen
Vertrag `amtlicherHibFeedstand` ab. Keine neue Herausgeber-/Titel-Ausnahme:
Identität, Host, Pfad, amtlicher Titelzusatz, Zeitfenster, Quellenbindung,
Archivhash und geschützter Konfliktbeleg bleiben erforderlich.
Der neue Fall durchläuft den echten Projektionsleser, die Einreihung und den
Dokumenthandler bis zum unveränderten Klassenriegel. Negative Titel-, Herausgeber-,
Pfad-, Zeit- und manipulierte Archivfälle bleiben gesperrt.

Diese vier Fehler entstanden erst nach dem Morgen. Sie erklären nicht nachträglich
die bereits um 01:01 Uhr entstandenen Teilquittungen von DIP und Bundesregierung.

### DIP-Metadaten im Lage-Auszug

Eine gespeicherte Urheberbezeichnung wurde als `summary` an das Modell übergeben.
Die Lage-Erzeugung machte daraus ein nicht belegtes Vorlegen einer Drucksache,
obwohl der typisierte Urheberbeleg `einbringer=false` enthielt.
Nur die exakt bekannte Urheber-/Ressortlabel-Projektion entfällt jetzt im
Artikel-Auszug. Originaltitel, Dokumenttyp und sämtliche true/false/null-Rollen
bleiben vollständig sichtbar. Echte Textauszüge und andere Quellen bleiben erhalten.

Erzeugung und Prüfung bekommen dieselbe Feldregel: Eine konkrete Titelbehauptung
darf ausdrücklich der Quelle zugeschrieben werden; Metadatenlabels beweisen keine
Handlung. Bloße Themenüberschriften, Rollenverwechslungen, zusätzliche Behauptungen
und Widersprüche bleiben unzulässig. Kein negatives Urteil wird umgedeutet.

Die zweite ursprüngliche Ablehnung wegen eines fehlenden Auszugs widersprach bereits
der vorhandenen Titelregel. Besseres tatsächliches Modellverhalten ist offline nicht
beweisbar. Beide ursprünglichen Negativurteile bleiben gespeichert und ungültig.
Die korrigierte Quellenprojektion ändert den Eingabehash. Ein künftig regulär
autorisierter Lage-Termin kann dadurch eine neue Eingabe sehen; kein zusätzlicher
Modellaufruf oder manueller Retry wird durch diese Reparatur gestartet.

### Kurzzeitige Auth-Speicherlesestörung

Originale Supabase-Transportprotokolle belegen während des unbekannten Kostenabschlusses
um 01:33 Uhr Berlin HTTP 520/521, unter anderem beim KO-Schreiben, bei Klassenfreigabe,
Auth-Lesen und der Abschlussquittung. Ein Providerausfall von Azure ist damit nicht belegt.
Der unbekannte historische Modellausgang lässt sich daraus nicht als kostenlos oder
erfolgreich auflösen.

Auth-GETs konnten bisher eine kurze transiente Störung nicht auffangen.
Sie lesen jetzt höchstens dreimal innerhalb derselben bisherigen Anfragefrist.
Der Zeitdeckel umfasst alle Versuche einschließlich Warteschlange und Antwortinhalt.
Permanente Rechtefehler und ungültige Antwortstrukturen bleiben geschlossen.
Kein POST/PATCH wird dadurch wiederholt, keine CAS-Grundlinie oder Mutationsfrist
geändert. Bei fortdauernder Störung bleiben Kosten-/Modellausgang unbekannt.

### Falsche Nicht-Aufruf-Meldung nach dem Modellstart

In acht Fehlerpfaden von Erstverstehen und Aktualisierung wurde nach einem möglichen
Modellversand zusätzlich `keinAufruf=true` mit Modell `none` protokolliert. Dies
erklärte den widersprüchlichen Nullkosten-Marker beim heutigen unbestätigten
Kostenabschluss. Diese acht Meldungen entfallen: Den Kostenbeleg schreibt weiterhin
ausschließlich die bestehende KI-Engstelle. Fachfehler bleiben in Ergebnis und CAS
sichtbar. Die beiden belegten Budget-Nichtstarts behalten ihre Nullkosten-Meldung.

Der gezielte lokale Sender-/Kosten-/CAS-Verbundtest reproduzierte zunächst acht
falsche Nicht-Aufrufe. Nach der Korrektur bestehen alle zehn Fälle: Erst-/Updatepfad
jeweils mit unbestätigtem Kostenabschluss, Nullantwort, ungültigem Inhalt und
unklarem Speichern sowie zwei Budget-Gegenfälle. Ein zweiter Modellstart bleibt
gesperrt. Bei unbestätigtem Kostenabschluss bleiben exakt 212.000 Mikro-USD gebunden;
bei bestätigter Antwort bleibt der echte Senderbeleg erhalten. Bestehende
CAS-Prüfungen 107/107 und Nutzungsprotokoll-Prüfungen 38/38 bestehen weiter.
Vier ältere P1-Erwartungen verlangten noch die falschen Nachstart-Marker und
stoppten die erste Pflicht-CI. Mit unveränderten Fehler-, Speicher- und
Datenschutzprüfungen verlangen sie jetzt deren Abwesenheit; lokal 347/347 bestanden.
Weitere gleiche Erwartungen im Ebenenkonsistenz- und Nullantwort-Vertrag wurden
mit unveränderten Sperren korrigiert: gezielt 8/8 Gruppen und 40/40 Prüfungen.
Historische falsche Marker und unbekannte Ausgänge werden dadurch nicht verändert.

## Gezielte Nachweise

Keine erneute Monats- oder allgemeine Lastsimulation; keine bezahlten Testaufrufe.
Alle lokalen Prüfungen verwenden den vorhandenen `scripts/lokal.js`-Netzschutz.

- Neue Auth-Lesestörfälle: vor Korrektur 2 FAIL / 2 PASS, danach 4 PASS.
- Auth-CAS einschließlich Parallelität, Antwortverlust und neuer Lesefälle: 20/20.
- Auth-Leseprojektion und Schreibschutz: 18/18.
- Artikel-Versionskonflikte mit nativer HIB-Projektion: 12/12;
  neuer HIB-Fall scheiterte vor der Korrektur.
- Lage-Quellenbeleg: 21/21, Dokumentbindung erfolgreich;
  erweiterte Prüfquellenregression einschließlich unveränderter negativer
  Fortsetzungen und synthetischer Metadaten-Gegenfälle erfolgreich.

Die bisherigen Monats-/Störfallnachweise bleiben datierte Nachweise ihrer jeweiligen
Stände. Die neue Reparatur behauptet weder eine bestandene Produktionsabnahme noch
eine Wiederholung der bisherigen 604 Prüfungen.

## Übrige Fehlerklassen und offene Bestandsentscheidungen

Die 41 Endzustände verteilen sich auf:

| Klasse | Zahl | Behandlung |
| --- | ---: | --- |
| Quellenstandfehler | 12 | Vier HIB-Lesefehler korrigiert; acht echte Titel-/Herausgeber-/Datumsabweichungen geschützt |
| `skipped-failed` | 12 | Sieben historische fehlgeschlagene KOs mit unbekanntem CAS und jeweils altem KI-Start; keine zwölf neuen Modellfehler |
| DIP-Quellfelder | 2 | IDs 292779/292778; ohne gespeicherte Originalantwort kein belegbarer Untervalidator-Fix |
| Budgetwartefrist | 13 | Historische Wartefristen von 49 bis 162 Stunden; bestehende 48-Stunden-Wache erhalten |
| Artikelzustand offen | 1 | Kein aus der Quittung sicher rekonstruierbarer Unterausgang |
| Neuer CAS-UNKNOWN | 1 | Unbestätigter Kostenabschluss, Reserve erhalten |

Insbesondere `f346fe50-dadb-4139-b68a-b78fd88cf4ea` bleibt geschützt:
kein belegter Modellausgang, 0,212 USD weiterhin gebunden.
Ein fehlerhafter Skip-Log mit `keinAufruf=true` entlastet diese Reserve nicht.
Die zwei freigegebenen Regierungsfassungen sind nativ mit neuem Ergebnis,
Archivlektüre und fertigem CAS belegt. Der gezielte Bundestagsneuversuch wartet
weiterhin. Die unbestätigte 01:30-Laufquittung bleibt historisch offen.

Die Codekorrektur entsperrt weder terminale Jobs noch CAS-Zustände.
Ein notwendiger Eingriff braucht exakte frische Vorwerte, konkreten aktuellen Bedarf,
zulässige Fassung, Kostenbindung, freien Eigentümer/Lease und einen belegten Rückweg.
Verbrauchte Einzelgenehmigungen von PR #1359 werden nicht erneut verwendet.
Keine pauschale Löschung, Erledigung oder Wiederaufnahme des Altbestands.

## Rolloutgrenze und Rückweg

Reiner Code-Rollout innerhalb der vorhandenen Freigabe erst nach unabhängigem Review
und beiden grünen Pflichtprüfungen am endgültigen PR-Kopf. Die bestehende Hetzner-
Updateautomatik und das normale Vercel-Deployment verwenden denselben Merge-Stand.
Keine Produktionsmigration, Daten-, Profil-, Cron-, Env- oder Budgetänderung.
Grenzen bleiben 1 USD/UTC-Tag, 30 USD kumulativ, 100 Hetzner-Aufrufe und 16 Originale.
GIZ-Veröffentlichungsriegel und bestehende Zeitungssperre bleiben unverändert.

Rückweg ist die Rücknahme dieser Codeänderungen auf den zuvor gebundenen Stand;
die aktive Veröffentlichungs-Policy muss erhalten bleiben. Historische Daten,
Reservierungen, Negativurteile und Laufquittungen werden nicht zurückgesetzt.
Nach Deployment tatsächlichen Code/Ort, reguläre Jobs und Kosten rein lesend prüfen.
Das vollständige Morgenbriefing bleibt bis zum nächsten echten Produktionsnachweis offen.

## Nachkontrolle und weitere Pflichtlücken am 27.11.

Der reguläre Hetzner-Lauf um 13:15 Uhr Berlin auf `781c7445` endete um 13:18:22
erfolgreich: 157 Zielaufträge, drei erledigt und 154 zurückgestellt, null
endgültige Fehler oder Leaseverluste. Das bestätigt den laufenden Code, keine
vollständige Versorgung und keinen erneuten produktiven Modellfehlernachweis.
Der Kundenleser lieferte weiter 64 Meldungen als quittierte Teilfassung;
83 von 84 referenzierten Morgenanalysen waren erledigt, ein UNKNOWN blieb gesperrt.

### DIP-Langtitel: nachgewiesener weiterer Aufnahmefehler

Der Betreiber beschaffte um 13:42 Uhr ausschließlich lesend die zwei amtlichen
Metadatenantworten für `292778` und `292779`. Originalbytes und Prüfsummen
liegen privat vor; die öffentlichen Metadaten sind als Offline-Fixtures erhalten.
Beide gültigen Titel sind 472 Zeichen lang. Die bisherige 300-Zeichen-Grenze
verwarf erst die DIP-Bindung und anschließend den ganzen Rohdatentitel.

Nur vollständig gebundene DIP-Titel erhalten jetzt den bestehenden endlichen
600-Zeichen-Rahmen der DIP-Vorgangstitel. Die allgemeine Schlagzeilengrenze bleibt
300. Rollen, Dokumenttyp, Titel, Datum und URL werden weiterhin vollständig
hashgebunden; die 5.000-Zeichen-Gesamtgrenze und alle übrigen Typ-/Größenwachen
bleiben erhalten. Keine gekürzte Gesetzesbezeichnung oder Rollenvermutung.
Der neue Originalfall scheiterte vor der Korrektur. Danach bestehen 26 Gruppen
über Adapter, beide Schreibwege, sechs Leser und Fachbelege; zusätzliche
Grenzfälle weisen 600/601, ungebundene 300/301, Manipulation und Gesamtgröße nach.
Die zwei historischen Eingangsdiagnosen und die alte Teilquittung bleiben erhalten.
Eine neue gültige Fassung bekommt regulär ihren eigenen gebundenen Auftrag.

### Enger EU-Wiederaufnahmeweg, noch keine Produktionsfreigabe

Der neue Operator `scripts/ops/quellen-restpflicht-20261127.{js,sql}` bereitet
ausschließlich den Fall `f346fe50-dadb-4139-b68a-b78fd88cf4ea` für den 28.11. vor.
Ein frischer Tagesplan muss weiterhin exakt diesen Pflichtbedarf, Artikel und
Archivhash bestätigen. Die native CAS-Entscheidung und der Auftrag werden
gemeinsam vorwertgebunden behandelt; höchstens eine neue Versuchskapazität,
keine Zählernullung. Alle sieben ungeklärten Geldbindungen bleiben erhalten.
Die vorgangsweite Entscheidung ist keine Zusage genau eines HTTP-Aufrufs;
notwendige reguläre Abschnittsfortsetzungen bleiben unter den unveränderten
Sender-, CAS-, Geld-, Aufruf- und Originalgrenzen.

Sechs lokale Gruppen einschließlich isoliertem PostgreSQL und echtem Queue-Claim
bestanden: Vorwert-/Tages-/GO-/Quellen-/Kosten-/Leaseabweichungen stoppen,
Originale und Reserven bleiben gleich, eine dauerhafte Einmalquittung verhindert
eine zweite Freigabe auch nach dem Rückweg. Der Rückweg ist nach Workerübernahme
gesperrt. Die unveränderte heutige Uhr lehnt eine Aktivierung ab. Nur die private
Testuhr wurde auf den 28.11. gestellt; Artikel-, Vorgangs-, Ticket-, Vertrags- und
Funktionspins blieben unverändert. CI prüft die synthetischen Negativverträge;
der positive native Nachweis verwendet den privaten Originalkostenvertrag.
Eine neue konkrete Betreiberfreigabe bleibt vor der Produktionsaktion erforderlich.

### Bundesregierung: historische Quellen dürfen nicht umgehängt werden

Die Pflichtteilquittung enthält eine alte Eingangsdiagnose zu
`rd-0477967d342ba91bd337044bd1a6ff70f7db589f8b7bd03ae35bfbf1a3054068`
(„Entlastungen für Deutschland“). Die gespeicherte amtliche RSS-Fassung vom
25.11. steht einer alten Google-Fassung vom April gegenüber. Zwei fertige alte
Analysen hängen ohne native Lektürebindung an derselben Rohzeile. Deren
Überschreiben würde historische Quellen auf Novembertext umhängen und bleibt
gesperrt. Eine getrennte Versionsbindung für die Quellenleser wird vorbereitet;
keine globale Regel-A-Ausnahme, kein erfundener Lektürebeleg oder Ereignistag.
Neue Migration und Bestandskorrektur benötigen ihren eigenen geprüften Umfang.

## Regulärer Rollout von PR #1362 und gezielte Bestandsvorbereitung

PR #1362 ist als `dadf999f390736094219b6a0f1ea7dcccd999700` gemergt
(Tree `53aafc8222ec890ded6fc4374ddc457b51a28505`). PR-CI `46005365285`
und Main-CI `46006757780` bestanden; beide unabhängigen Teilreviews sind erhalten.
Vercel `dpl_56PBeq2FnAMkvhEgxM4QLJzm5MzM` ist READY mit Produktionsalias.
Der echte reguläre Hetzner-Lauf am 27.11. von 14:45 bis 14:48:21 Uhr Berlin
belegt denselben Commit: 141 Zielaufträge = drei erledigt + 137 vertagt + ein
endgültiger historischer Budgetwartefall, keine Wiederholung oder Leaseverluste.
Das ist ein Rolloutnachweis, keine vollständige Betriebsabnahme.

Der normale Kundenleser antwortete um 14:30:31 Uhr Berlin mit HTTP 200 und
64 Meldungen, weiterhin quittiert TEILWEISE. Die geschützte GIZ-Mischfassung
`2109409.pdf`/`ko-vg-wirtschaftliche-20261113-a78a93` fehlt. Der andere
GIZ-Beitrag `2109421.pdf` bleibt verfügbar; die Policy ist kein allgemeiner
GIZ- oder Parteienfilter. Die Policy bleibt
`23e4bb853f7de2faafc471c0408e7de1e51875e8bc8e740d760796ee5dfb7bff`.
Der gescheiterte Morgen vom 27.11. wird nicht nachträglich umgewertet.

### Zusätzliche Produktionsdiagnosen richtig zuordnen

Zum Lesestand 14:26:54 Uhr Berlin wurden seit 01:00 Uhr 50 eindeutige Aufträge
endgültig fehlgeschlagen: 14 Eingangsdiagnosen, 13 Prüfungen vorhandener failed-KOs,
ein neuer UNKNOWN und 22 historische Budgetwartefristen. Die 50 Endfehler stimmen
mit der Summe der abgeschlossenen Quellenlaufquittungen überein; wiederholt
vertagte Aufträge werden dadurch nicht zu zusätzlichen eindeutigen Aufträgen.
Die fehlende Abschlussquittung des 01:30-Uhr-Laufs bleibt ausdrücklich UNKNOWN.

Bis 14:49:37 Uhr kamen drei Eingangsdiagnosen und ein alter Budgetwartefall hinzu.
Die drei Diagnosen wurden bereits um 09:18:30 Uhr angelegt, erst um 14:31 Uhr
terminal. Beide Fassungen aller drei Artikel sind unveränderlich archiviert;
alle sechs Standhashes wurden nachgerechnet. Originale Edge-Logs belegen
erfolgreiche Archiv-GETs vor der Diagnoseanlage, keine HTTP-Fehler im engen
Zeitfenster. Der Konflikt lautet `Table.Briefings` gegenüber `Table.Media` bei
gleichem Titel, Text, URL und Datumsinstant. Der vorhandene Metadatenschutz wird
ebenfalls als `quellenstand-nicht-bestaetigt` quittiert: Hier fehlt kein Archiv.
Keine unbelegte Verlagsalias-Freigabe, kein zusätzlicher Abruf oder Modellneuversuch.
Andere kanonische Fassungsaufträge bleiben separat budgetbedingt bzw. mit alter
Profilwiedervorlage offen. Die Diagnosen erzeugen keinen neuen Pflichtbedarf.

### Geschützte BReg-Quellenfassungen

Die geplante additive Migration `20261127131039_ko_quellenfassungen.sql` bindet
Quellensätze an KO-ID, tatsächliche KO-Version und Roh-ID. Archiv-FK, Standhash,
vollständiger Archivdigest sowie Anzahl und Manifesthash sichern den vollständigen
Satz. Ausschließlich ausdrücklich initialisierte KOs werden geschützt; kein
globaler Backfill. Ungeschützte Bestände behalten ihren bisherigen Quellenpfad.
Alle neuen Schnittstellen sind service-only und SECURITY INVOKER mit RLS.

Die aktuelle und die ausdrücklich angeforderte historische Quellensicht lesen
Archivdaten in einem SQL-Snapshot, vor Datumsfilter, Sortierung und Seitenlimit.
Eine geschützte neue KO-Version ohne vollständigen Quellensatz bleibt UNKNOWN.
Die Batch-/Einzel- und Lagepfade dürfen dafür keinen Titel-/URL-Ersatz erfinden.
Der bestätigte Schreibaufruf prüft unter KO-Zeilensperre die tatsächlich gespeicherte
Version. Eine Teilbestätigung ist nur für ein bereits vollständiges unverändertes
Manifest zulässig; die erste Anlage verlangt `source_document_count`.

Technische vollständige Quellenbindung und positive Modelllektüre bleiben getrennt:
Der gezielte Nachpersistenz-Abbruchfall erhält 13 technische Quellen, aber nur die
tatsächlich bestätigten zwölf Promptlektüren. Die Wiederaufnahme ergänzt die Bindung
ohne zweiten Modellaufruf. Die lokalen Modelle sind Mocks, keine Anbieteraufrufe.
Die gezielten nativen Leser-/RLS-/Snapshot-, Writer- und Wiederaufnahmebelege liegen
privat vor. Unabhängiger Runtime-/Schema-Review bestanden; die integrierte Pflicht-CI
am endgültigen PR-Kopf bleibt vor Aktivierung verbindlich.

Die Bestandsprüfung um 14:41 Uhr Berlin ergab 60 Quellenkanten an
`ko-vg-bundesregierung-20241119-743c6b` und eine an
`ko-vg-entlastungen-20260417-6517e5`, beide KO-Version 1. Insgesamt sind es
60 verschiedene Rohzeilen. 13 besitzen exakt passende heutige Archive;
17 bestehende Archivversionen und 105 Fundstellen bleiben unverändert.
47 Rohzeilen besaßen dabei kein Archiv. Der ursprüngliche Vorbereitungsumfang war:
47 heutige Insert-only-Bestandssnapshots, 61 vollständige Versionsbindungen und
eine Promotion der Zielrohzeile auf den bereits gespeicherten amtlichen RSS-Stand
`0968e51ad7faa8d8f2d74416e55ebcbb5a86312b6d2a8c1ba1d4ff44dbe6a795`.
Snapshots erhalten den tatsächlich vorhandenen Inhalt und seine echten Feldzeitpunkte.
Sie sind ausdrücklich keine nachgebauten historischen KI-Lektüren oder neuen Abrufe.

Die erneute reine Bestandslesung um 15:28 Uhr Berlin belegt einen regulären Nachtrag:
18 Archive und 106 Fundstellen, darunter ein inzwischen exakt archivierter weiterer
kanonischer Stand. Alle 60 Rohzeilen, zwei KOs und 61 Kanten sowie die ursprünglichen
17 Archive und 105 Fundstellen sind unverändert. Deshalb sind aktuell nur noch
46 neue Bestandssnapshots erforderlich. Der Operator fordert die ursprünglichen
17/105 vollständigen Originalanker weiterhin unverändert als Teilmenge und bindet
alle regulären Nachträge vollständig an die frische Vorschau. Er validiert deren
Hash, Schema, Rohidentität, URL und Quellenautorität. Andere Standfassungen werden
erhalten und nicht als kanonische KO-Quelle verwendet. Nur wirklich fehlende exakte
kanonische Archive werden angelegt, höchstens 47; vorhandene korrekte Archive werden
wiederverwendet. Die 61 Versionsbindungen und eine Promotion bleiben fest.

Aktivierungsreihenfolge: neues konkretes GO, additive Migration unter altem
kanonischem Bestand, geprüfter Merge und reguläres Deployment auf beiden Plattformen,
frischer Vorflug, dann erst die atomare Bestandskorrektur. Kein zusätzlicher Workerstart.
Rückweg nur vor Konsum und bei exakt unverändertem Nachbestand: Promotion und genau
die neuen Bindungen zurücknehmen. Die 47 echten Snapshots und die Einmalquittung
bleiben erhalten. Nach neuem Claim, Ergebnis, Verwendung oder Drift kein blinder
Rollback. Der Schema-Rückweg verweigert noch vorhandene Bindungsdaten.

### Abgelaufene CAS-Eigentümer sind keine aktuellen Worker

Sieben zusätzliche historische CAS-Zeilen tragen abgelaufene Eigentümer-Leases
(September bis 26.11.). Sie werden weder freigegeben noch gelöscht. Der enge
EU-Operator unterschied diesen Bestand zunächst nicht von laufender Arbeit.
Der Nachtrag erlaubt nur eine leere Liste oder genau die sieben vollständig
hashgebundenen unveränderten Altzeilen mit nachweislich abgelaufener Lease.
Unbekannte, veränderte, fehlerhafte oder aktive Eigentümer stoppen weiterhin.
Der kanonische Vollhash lautet
`76f8a7856e80e9ea9b614c1aa11b57af3029ad764570027c3f7ea9b13252af18`.
Die gezielte native Nachtragsprobe erhält alle sieben CAS-Zeilen und das Kostenbuch
bei Aktivierung und Rückweg bytegleich. Ein frisch gebundener veränderter oder
zusätzlicher Eigentümer wird auch von SQL abgewiesen. Unabhängiger Nachtragsreview PASS.
Die früheren sechs positiven Operatorgruppen wurden nicht erneut ausgeführt.

Diese sieben CAS-Zeilen sind von den sieben ungeklärten **Geldbindungen** zu
unterscheiden. Beide Bestände bleiben geschützt. Stand 14:49 Uhr: 81 Modellaufrufe,
0,789474 USD heutige Bindung, 10,331840 USD kumulativ; Grenzen unverändert
1 USD/UTC-Tag, 30 USD gesamt, 100 Hetzner-Aufrufe und 16 Originale. Für 100/16
liegt zuletzt der direkte Betreiber-Envbeleg vom 26.11. vor, kein erfundener neuer
SSH-Nachweis. Keine Freigabe einer Reserve, kein pauschaler Retry oder Budgetanstieg.

Der inerte BReg-Operator liegt unter
`scripts/ops/quellen-breg-fassung-20261127.{js,sql,-test.js}`; sein Root-Wrapper
führt die drei synthetischen CI-Gruppen aus. Sieben getrennte native Prüfgruppen
mit unveränderten echten Produktpins bestanden: 47+61+1, Erhalt aller Altarchive,
Fundstellen, KOs, CAS-Zeilen und Finanzdaten, atomarer Abbruch bei falschem GO,
Vorwert-/Rechte-/Quotenabweichung sowie gesperrter Rückweg nach Konsum oder Drift.
Zusätzliche drei native Append-Gruppen bestehen mit den unveränderten Produktpins:
aktueller Bestand 46+61+1, weitere reguläre Nachträge mit 45+61+1 und 65 erhaltenen
Archiven nach dem Rückweg sowie Abbruch bei Ankerlöschung, Mutation, fremder
Identität/Autorität und jeder Änderung nach der frischen Vorwertbindung.
Vier synthetische Gruppen bleiben vom privaten Produktnachweis getrennt.
Globale Driftwachen binden jede vollständige Tabellenzeile über nativen SHA256
und sortierte Zeilenhashes, ohne einen riesigen rekursiven JSON-Aggregatbaum.
Aktivierungsbindung und Rückweg benötigen nur 405 beziehungsweise 139 Byte;
die vollständige private Vorschau und der tatsächliche Beleg bleiben erhalten.
Der vorhandene geprüfte Transport entfernt nur den psql-Prolog und bindet die
drei Parameter kollisionsfrei als SQL-Dollar-Literale. Der Transaktionskern bleibt
unverändert; SQL-Körper und begrenzte Parameter bleiben deutlich unter der
API-Eingangsgrenze. Ein reiner Produktions-SELECT
bestätigt für diesen bestehenden Zugang `current_user=session_user=postgres`,
UTC und keine Recovery. Kein zusätzlicher SSH-/Datenbankzugang wird eingerichtet.

Die neue Migration, Bestandskorrektur und EU-Wiederaufnahme sind noch nicht aktiviert.
Vor deren Freigabe müssen unabhängiger Operatorreview und beide Pflichtprüfungen
am endgültigen integrierten Kopf vorliegen. Die bisherige gemeinsame isolierte
PostgreSQL-Prozessuhr stammt aus einer Dezember-Simulation; sie wird für keinen
heutigen positiven Aktivierungsbeleg verwendet. Der heutige Operatornachweis wurde
mit einem getrennten kleinen PG17.6-Prozess und unverfälschter 27.-November-Uhr
geführt. Danach wurden nur dieser eigene Prozess beendet und sein Cluster entfernt;
gemeinsamer Monatsserver und Production wurden nicht neu gestartet.

### CI-Anschlussprobe: neue Schemaabhängigkeit ausdrücklich mitnehmen

Am ersten integrierten Kopf `1b7163ea` bestand die frische Browserprüfung;
Pflicht-CI `46014585685` stoppte in der bestehenden nativen Drei-Profil-Probe
mit `skipped-bestandslesefehler`. Ihr isolierter Schemaaufbau verwendete eine
feste Liste von 21 Migrationen und installierte die neue Quellenleseschnittstelle
noch nicht. Erstfehler und bereinigter Abbruch bleiben privat erhalten.

Die begrenzte Liste enthält jetzt zusätzlich genau diese erforderliche Migration.
Sie wird nach den allgemeinen Fixture-Grants installiert, damit ihre engen
Append-only-Rechte erhalten bleiben. Ein echter Datenbank-Readback verlangt
SELECT und INSERT für service_role, verweigert UPDATE/DELETE sowie jeden Zugang
für anon/authenticated. Die gezielte Auswahlprüfung scheiterte vor dem Nachtrag
und besteht danach; fehlende neue Migration wird ausdrücklich abgewiesen.
Keine pauschale Installation geschützter Kohortenpfade, keine gelockerte Prüfung
und keine erneute Monatssimulation. Beide Pflichtchecks müssen für den neuen
endgültigen Kopf erneut erfolgreich sein.

Die korrigierte native Anschlussprobe sowie die Browserprüfung bestanden am Kopf
`9653e63e`. Die nachfolgenden Offline-Prüfungen fanden noch zwei alte Mocks, die
nur den Einzelquellenleser ersetzten und unbeabsichtigt auf den bisherigen
Batch-Fehlerfallback angewiesen waren. Die Fixtures liefern jetzt ausdrücklich
denselben vollständigen Batch mit identischen Quellen und geprüften KO-/Vorgangs-
bindungen. Kandidatenzeit 36/36 und Publication Eligibility 12/12 bestanden gezielt;
Policy-, GIZ-, Tenant-, Original-, Schreib- und Modellschutz bleiben erhalten.
Der Runtime-Fehlerschutz wurde dafür nicht geändert. Beide Erstfehler bleiben
erhalten; Nachträge werden gemeinsam auf einem neuen CI-Endkopf geprüft.

Auch die bereits vorhandene Altlink-Erhaltungsprobe wurde wegen des geänderten
Schreibwegs gezielt weiterverwendet: Ihr alter Tabellen-POST-Mock scheiterte am
neuen atomaren Link-RPC. Der Fixture-RPC prüft jetzt Payload, Fremdschlüssel und
eindeutige Kanten vor dem ersten Write, erhält idempotenten Bestand und simuliert
echte RPC-Fehler. Alle bisherigen Raw-/Linkfehler- und Bestandsschutzprüfungen
bleiben erhalten; 27/27 gezielte Fälle bestehen. Kein Runtime-Nachtrag dafür.

