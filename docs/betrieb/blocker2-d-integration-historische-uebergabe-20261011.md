# Begrenzte B2-Übergabe an den direkten D-Sender

Stand: 11.10.2026. **Vorbereitung, keine Production-Abnahme.** Blocker2 bleibt
abgeschlossen. Der bereits abgenommene direkte Blocker1-Motor wird nicht neu
abgenommen. Dieses Dossier betrifft ausschließlich seine technische Versorgung
mit den unveränderten 500 final angenommenen Eingaben.

Der Betreiber hat einen begrenzten historischen Übergabevertrag zur Vorbereitung
gewählt. Production, Profile, Daten, Konfiguration, Budget und bezahlte Aufrufe
bleiben bis zu einer konkreten Freigabe unverändert. Kein Test-GO wird aus dieser
Vorbereitung abgeleitet.

## Gebundene Ausgangslage und gemeinsame Ursache

Die [finale Blocker2-Abnahme](blocker2-abschluss-20261011.md) gilt für
Run38102593796, Runtime `6cdaa1cd3cdf16b9e5d18cb9add267583a730292`, Berliner
Aufnahmetag 2026-10-11. Ihre Root-Abnahme hat SHA256
`74175988639291cfb86d50e149c98f55f79df3288bb8f091335ef5c3ad32557c`,
die finale E-Enumeration
`0e48b02dfa15eafea6946d7baf1332c16aec599c5ce5687a1a6359b709dca170`.
Die vorhandenen Originale wurden aus bereits gesicherten, authentifizierten
Artefakten wiederhergestellt; keine neue Production-Aufnahme und kein neues
Quellenfachurteil. Der Wiederherstellungsbeleg hat SHA256
`64871e96f8f034f8ad85acbfa6168066bdbf0f9817f1e932b8e70a77c1a211de`.
Die exakt von der finalen Root-Abnahme gepinnte Originalmatrix
(`feadad579d11a6816ac31acbf210d4413454041317a072a31509539afdd3f746`)
bindet alle 180.397 vorhandenen Claim-Inputhashes samt Besitzer und Position
an genau die neuen 500 Merkle-Leaves. Nur der entsprechende Matrixshard wurde
zusätzlich restauriert; bestehende Urteile wurden nicht wiederholt. Privater
Provenienzbeleg `provenance/final-root-matrix-merkle-input-binding-receipt.json`,
SHA256 `3065d0a6f116590c16b521c01da3eae6fcfaf76878dc28c46ec88e6845064cf5`.

Der unveränderte direkte Quellenprojektor liefert 468 nichtleere und 32 leere
Kontexte. Bei allen 32 fehlen Quellen innerhalb der bestehenden 14 Tage.
Auch die jeweils jüngste gültige gewöhnliche Quelle ist bereits
14,1638–15,7106 Tage alt. 1.939 ausgewählte Quellenvorkommen dieser Positionen
wurden gemeinsam auf die tatsächlichen Ausschlusszweige gebunden:
1.634 gewöhnliche alte Quellen, 282 ebenfalls alte Quellen mit nicht öffnender
Artikeladresse und 23 Vorkommen eines validierten Artikelstands vom 25.09.
Längen-, Herausgeber-, Titel-, Dedup- und Mengengrenzen sind hier nicht die
gemeinsame Ursache. Eine Adresskorrektur allein würde das Quellenfenster nicht
füllen. Ungerankte Teilmitglieder bei zwei Positionen tragen ebenfalls keine
aktuelle Quelle.

Privater Ursachenbeleg:
`/workspace/private/d-integration-20261011/diagnostics/cause-summary.json`,
SHA256 `d2f3c1bf459db6ea96fa9ce345e63bce59cfb15dd8e91019ff6031fc8e0d36a1`.
Das ist eine technische Ursachenprüfung, keine wiederholte Blocker2-Fachabnahme.

## Vorbereiteter Übergabevertrag

`blocker2-d-historical-binding.js` nimmt ausschließlich Basisversion2 mit
Membership-Proof für genau diese Originalaufnahme an. Der feste Merkle-Root ist
`ce7ee487274b39952d23dbb377647659f6c41b6684eb0406cbc1d8553df87c69`.
Die unveröffentlichte Membership-Liste hat den kanonischen Hash
`4a8551f54487979610269d86e674f6b1622651fe454e23aa361c3ede7c8602b6`.
Position, Besitzer, Originalprofil, Originalbody, vollständige Basis und Eingabe
bleiben gebunden. Die ursprüngliche inaktive Profilprojektion wird anhand ihres
vollständigen Hashes nachgewiesen; die Produktions-Aktivierungswache bleibt
separat zwingend. Es wird kein Ersatz-Fachurteil erzeugt.

Nur der geschlossene direkte Adapter kann diese Basisversion übernehmen.
Normale Briefingaufrufe behalten ihren vorhandenen Version1-Urteilsvertrag.
Die geprüfte historische Fähigkeit ist prozessgebunden, eingefroren und über
eine private WeakMap geschützt; JSON kann sie nicht erzeugen. Die Quellen und
KO-Projektion werden nochmals gegen diese Fähigkeit versiegelt. Fremde Quellen,
Profilabweichungen, veränderte Texte oder Publikationsdaten scheitern.

Der tatsächliche Lage-Sender behält die vollständige Publicationpolicy sowie
Themenreinheit und Source-Safety. Er versucht zuerst unverändert die normalen
14 Tage. Nur bei leerem Kontext verwendet er den begrenzten historischen Weg.
Die obere Zeitgrenze ist dann die tatsächliche Originalaufnahme; keine Quelle
aus der Zukunft und kein erfundener Zeitstempel wird angenommen. Der ganze
Berliner Publikationstag eines Artikelstands muss bereits abgeschlossen sein.
Der Vertrag gilt ausschließlich für den gebundenen Berliner Aufnahmetag; er ist
keine automatisch weiterlaufende Ausnahme.

Öffnende Artikeladresse, belegter Titel und Publikationsdatum, vollständiger
Auszug, Herausgeberlänge, sechs Belege je Vorgang, Dedup und 16.000 Zeichen
bleiben erhalten. Nicht öffnende Originaladressen bleiben in der unveränderten
Basis nachgewiesen und werden aus den D-Modellquellen ausgeschlossen; es wird
keine neue Adresse eingesetzt. Historische Kontextmetadaten zählen zum endlichen
Eingabebudget und zur Cachebindung. D und R erhalten denselben ausdrücklichen
historischen Zeitvertrag: damaligen Sachstand wiedergeben, keine heutige
Entwicklung, fortdauernde Gültigkeit oder bevorstehende Frist behaupten.
250 Wörter, 2–4 Absätze und der unabhängige Quellen-/Mandatsreview bleiben
unverändert.

## Native Versionen und verlustfreier Transport

Eine gezielte native `repeatable read / read only`-Transaktion las exakt die
874 vorhandenen Dokumente, 500 KO und sämtliche 972 Publicationlinks dieser
KO. Alle 469.500 Source19- und 250.000 KO59-Vorkommen in den Originaleingaben
sind identisch mit der bestehenden Leserprojektion. Zusätzliche Source23- und
KO60-Felder kommen aus den tatsächlichen nativen Zeilen, einschließlich
`verstehen_fencing`; es wird kein Default erfunden. Die Rückprojektion muss jedes
Originalfeld erhalten; die aktuellen Inputwachen binden weiterhin die vollen
nativen Versionen.

Die vollständigen Links enthalten 32 weitere Dokumentidentitäten außerhalb
der ursprünglichen ersten-40-Quellenauswahl. Sie bleiben für Publicationeligibility
erhalten. Unveränderte Policy:
`274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04`.
Alle 500 KO sind frei; keine bestehende Publikationssperre wird entfernt.
Lesender Prüfzeitpunkt: 2026-10-11T08:44:07.862495+00:00, Snapshot
`567766:567766:`. Privater Beleg `current-source-binding/receipt.json`,
SHA256 `25d863375908f34d836917946d5840ef922600b1e7dd735873fa96533214fe3b`.

Die Basis mit tatsächlichen Proofs umfasst bereits rund 1,702 GB. Zusätzlich
duplizierte Quellen-/KO-Arrays überschreiten bereits drei GB vor weiteren
Commandfeldern. Der alte gzip-Vertrag prüft
64 MiB **vor** Kompression. Auch ein einzelner kanonischer String scheitert an
V8s Grenze von 536.870.888 Zeichen. Eine bloße gzip-Kompression oder ungebundene
Cap-Erhöhung schließt diese gemeinsame technische Ursache nicht.

Der vorbereitete neue `dictionary-gzip/2`-Vertrag transportiert vollständige,
verlustfrei gemeinsam referenzierte JSON-Werte. Er bindet ursprüngliche
expandierte UTF8-Bytes und Dictionarybytes separat, prüft Rückreferenzen,
unerreichbare Knoten, Schlüssel, Zyklen, Tiefe und UTF8. V2 dekodiert gemeinsame
Objektinstanzen unveränderlich. Der vorhandene kleine `gzip/1`-Vertrag bleibt
bytegleich. Explizite V2-Grenzen: 64 MiB Dictionary, 16 MiB Envelope,
200.000 Knoten, Tiefe80, 4 GiB expandierter Inhalt. Diese neue Transportgrenze
ist ausdrücklich Teil des vorbereiteten Vertrags; ihre Eignung für den
vollständigen finalen Command ist gesondert zu messen.

Die kanonische Hashbildung schreibt große JSON-Daten in endlichen Teilen und
erhält die alten Hashwerte. Nicht-JSON-Eingaben einschließlich Getter behalten
ihre bisherige Auswertung. Ein unabhängig blockweise gehashter DAG oberhalb der
V8-Stringgrenze stimmt exakt überein. Keine Quelle und kein Claim wird zur
Transportverkleinerung weggelassen.

Der reale vollständige lokale Drafttransport ist für 500/500 belegt:
3.107.153.561 expandierte Original-UTF8-Bytes, 10.937.248 Dictionarybytes,
75.726 Knoten und 2.804.748 Envelopebytes. Alle Basis-, Profil- und Proof-Hashes
sowie die unabhängig fortgeschriebenen Original-JSON-Bytes stimmen nach Decode
exakt überein. Original-UTF8-SHA256:
`97c465b8437cc7dde7c975052728cee03e5133c4009c141cfe091ebcd0d7db86`.
Encode/Decode: 5,709/3,742 Sekunden; gemessener RSS-Peak des Gesamtprüfprozesses
576.790.528 Bytes. Privater Beleg `transport/actual-500-transport-receipt.json`,
SHA256 `14db98343ace3113e30677bab22e21fc468122c481ced2ba1c5e932ef8ddfb83`.
Dies ist der vollständige Draftpayload, kein vollständiger finaler Command mit
zusätzlichen Executor-/Kosten-/Admissionbindungen. Dessen Größen, CPU und
tatsächliche Production-Speichergrenze bleiben vor Installation zu belegen.

## Nachweise und offene Abnahme

Gezielte Prüfungen decken Membership, Besitzer-/Profil-/Zeit-/Policyabweichung,
Tokenfälschung, Quellenmanipulation, native Rückprojektion, Legacy-Hashidentität,
große DAGs und Dictionary-Manipulationen ab. Die bestehenden direkten
Sender-/Quellen-/Lagebindungstests bleiben grün; keine breite Vorsichtsprüfung
und keine neue vollständige Production-Aufnahme.

Die abschließende lokale 500er Probe verwendet den tatsächlichen
`buildLageBriefing`-Pfad mit finite Token. Sie liest die hashgebundenen nativen
Archive, behält alle Publicationlinks und hält jede Position per Sentinel
unmittelbar vor Budget-/Modellarbeit an. Netzwerk, externe Modellfunktionen und
Productionwriter sind gesperrt. Lokale Profilkopien aktivieren keine DB-Profile.
Diese Probe ist ausdrücklich kein produktiver 500er Test und keine Abnahme
eines bereitgestellten Production-Commands.

Die erste vollständige lokale Probe belegte 498 gültige Kontexte. Bei genau zwei
historischen Ereignisverbünden waren jeweils 11.521 Zeichen unveränderter
Darstellungsmetadaten erst nach der Quellenbudgetierung hinzugefügt worden:
24.439/24.455 statt höchstens 16.000 Zeichen. Die kleinste Korrektur reserviert
diese vollständigen, snapshotgebundenen Metadaten jetzt vor der Quellenauswahl
im selben Budget. Originale und Grenze bleiben erhalten. Der tatsächliche
Sender ist für die beiden korrigierten Fälle gezielt grün; unveränderte Zweige
werden anhand ihres gebundenen Vorbelegs übertragen, statt eine zweite gesamte
Aufnahme auszuführen. Auch diese technische Prüfung erzeugt kein Quellenfachurteil.

Der geschlossene lokale Gesamtbeleg enthält **exakt 500/500 gültige, nichtleere
Kontexte: 468 unverändert normale und 32 ausdrücklich historische; 0 Fehler,
0 bezahlte Calls, 0 Productionwrites.** Alle 500 Positionen sind eindeutig an
die finalen Originale gebunden und erreichen den tatsächlichen Sender bis zum
Sentinel vor Modellarbeit. Der Beleg kombiniert 498 tatsächlich geprüfte
unveränderte Positionen mit den zwei tatsächlich am korrigierten Sender
geprüften Positionen 196/228. Die minimale Änderung der drei betroffenen
Code-Dateien wurde auf die exakten Vorbeleghashes zurückrekonstruiert; die
weiteren 20 gebundenen Dateien sind identisch. Originalgebundene
Ereignismetadaten betreffen innerhalb der 32 historischen Fälle nur 196/228;
damit gilt die Zweigübertragung deterministisch für die anderen 498. Es handelt
sich um einen geschlossenen Transfernachweis, keinen zweiten vollständigen
500er Lauf unter dem neuen Code und keine Prognose.

Privater Ergebnisbeleg
`current-source-binding/sender-final500-budget-transfer.json`, 499.220 Bytes,
SHA256 `e7d062ddd3c528a25437e9fe28300ae6c2588ff5a9e191e4448c998a71902b02`;
Bindungsreceipt SHA256
`9fc9b690e251b575425c5c63a1c3461cadb1b2172650ae7ccc0740e3725bd845`.
Der darin gebundene gezielte Nachbeleg für 196/228 hat SHA256
`dcb3a101427cd932acb9c46a68cb6eba6f1bc09b3a695db99e7270a536ba69c6`.
`productionAdmission` und `approval` sind ausdrücklich `false`.

## Konkrete Production-Freigabegrenze

Vor jeder geschützten Wirkung ist eine konkrete Freigabe erforderlich. Der
vorbereitete Code wird deshalb als Reviewstand behandelt und nicht autonom
auf Production ausgerollt oder installiert.

| Punkt | Begrenzter nächster Schritt |
|---|---|
| Änderung | Geprüften Übergabecode aus diesem Sprint nach grüner Pflicht-CI ausrollen; danach ausschließlich die gebundenen historischen Eingaben am direkten Sender vor bezahlter Arbeit prüfen. |
| Umgebung | Vercel-Projekt `helmut-pilot`, bestehende Helmut-Production und Supabase-Projekt `ddckuvvpcytqbyfmbvie`; keine Migration und keine Quellen-/Profil-/Budget-/Policyänderung. |
| Erwartete Wirkung | 468 normale Kontexte erhalten; 32 leere Kontexte aus exakt denselben angenommenen historischen Quellen füllen und als historisch markieren. |
| Risiko | Explizite historische Zeitsemantik; neuer endlicher Transport-/Speichervertrag. Vollständiger Command, tatsächliche Deploymentbindung und frische native Versionsidentität müssen vor Installation belegt sein. Aufnahme-/Tagesdrift stoppt den Vertrag. |
| Rein lesende Nachkontrolle | Deploymentcommit und alle betroffenen Quellhashes, Original-/Merklebindung, vollständige aktuelle native Versionen und Publicationidentitäten; genau eine vollständige finale 500er Kontextprüfung des bereitgestellten direkten Wegs vor Modellarbeit, 0 bezahlte Calls und 0 Daten-/Profil-/Budgetänderungen. |
| Rückweg | Vorheriges unverändertes Deployment wieder zuweisen; den neuen Snapshot nicht installieren oder aufrufen. Bestehende Originale/Belege erhalten. Eine später separat freigegebene Commandinstallation benötigt einen eigenen konkreten privaten Identifier und Rückweg. |

Ein Installations-, Aktivierungs- oder bezahlter Testaufruf ist hiervon nicht
autorisiert. Das übrige [Blocker3-Kostenstarttor](blocker3-finaler-kostenvertrag-20261011.md)
bleibt getrennt. **Sprintabnahme erst bei exakt 500/500 gültigen, nichtleeren
Kontexten über den tatsächlich vorgesehenen bereitgestellten direkten D-Weg.**
