# Konkreter Entwicklungsvertrag fuer beleggebundene Prosa

20.09.2026. **Offline Bindungsbaustein implementiert, keine integrierte
Production Methode und keine fachliche Freigabe.** Null Modellaufrufe,
keine Productiondaten geschrieben. Dieser
Vertrag setzt den nach PR452 dokumentierten anderen Ansatz konkret fort.
Er wiederholt weder den verworfenen Quellenrichter noch dessen Prompts.

## Die fehlende Eingangsvoraussetzung

Heute entstehen freie Texte, Klassifikation und mehrere strukturierte
Urteile in derselben Understandingantwort. `assembleKnowledgeObject`
uebernimmt diese Werte; `briefing-aussagenbindung` kann die Vollstaendigkeit
eines getrennten Urteils und seine Textstellenbindung pruefen, aber nicht
selbst die Bedeutung bestaetigen. `lage-textqualitaet` hat denselben
Unterschied zwischen technischen Bindungen und fachlichem Urteil.

Der neue Belegplan darf deshalb nur auf einer **unabhaengig geprueften
Faktenmenge** formulieren. Ein Generator darf Faktenkennungen auswaehlen und
zulassige Operationen angeben. Er darf keine neuen behauptenden Literale,
Rollen, Folgen, Fristen oder Bedeutungslabels in den Plan schreiben.

Eine Faktenzeile muss mindestens Quellkennung und Quellenhash, genaue
Textstelle samt Kontext, Akteur, Handlung, Gegenstand, Aussagegrad,
Verneinung, Zuschreibung, Bedingung und getrennte Ereigniszeit tragen.
Unbekannte Felder bleiben unknown. Hinzu kommen Herkunft der Interpretation
und ihre Freigabe. Ein vom erzeugenden Modell selbst gesetztes true ist
keine Freigabe. Bei Quellenaenderung ist der alte Sachbeleg ungueltig.

Fakten koennen aus eindeutig typisierten Originaldaten eines spezifischen
Quellenadapters oder aus einer vollstaendigen gesonderten Quellenpruefung
kommen. Fuer freien Nachrichtentext existiert dieser Adapter heute nicht.
Eine automatische universelle Extraktion mit blossen Wortlisten waere
derselbe unbelegte Interpretationsschritt an einer anderen Stelle.

## Zulaessige Formulierungsoperationen

| Operation | Voraussetzung | Erhaltene Bedeutung |
| --- | --- | --- |
| Ereignis darstellen | Freigegebenes Tupel aus Akteur, Handlung, Gegenstand und Aussagegrad | Vorschlag, Pruefung, Beschluss und Vollzug bleiben verschieden; keine Rollenvertauschung |
| Zugeschriebene Aussage darstellen | Sprecher, Adressat und Aussage sind gemeinsam belegt | Herausgeber wird nicht zum Sprecher; Kritikrichtung und Vorbehalt bleiben erhalten |
| Zeit einordnen | Ereignisbezug und Zeithorizont sind belegt | Publikation und Abruf ersetzen weder Ereignistermin noch Frist; unknown bleibt unknown |
| Wirkung nennen | Wirkung, Betroffener und Voraussetzungen sind in derselben Faktenmenge getragen | Keine finanzielle oder politische Folge allein aus einem Themenlabel |
| Profilbezug begruenden | Echtes Profilfeld und separat gepruefte Beziehung zur konkreten Quelle | Nennung einer Partei oder eines Ressorts allein erzeugt keine persoenliche Pflicht |
| Bedingte Handlungsoption darstellen | Akteur, Voraussetzung, Handlung und gegebenenfalls deren eigene Frist sind belegt | Keine automatische Aufgabenverteilung, Prioritaet oder politische Linie des Lesers |
| Betriebszustand beschreiben | Aktuell gemessene Zaehler und Auswahl | Kein politisches Sachurteil aus technischen Metadaten |

Der Server waehlt vorab fachlich gepruefte Satzformen. Er darf keine
Teilsaetze abschneiden, Negationen entfernen oder zwei unabhaengige Fakten
kausal verbinden. Quelle, Faktenzeile, Operation und fertiger Text werden
inhaltsgebunden. Ein bloesser Teilstring in einer Quelle reicht nicht.

## Vollstaendige Feldabdeckung

| Sichtbare Felder | Erforderliche Fakten oder ehrliche Grenze |
| --- | --- |
| headline, display_title, was_ist_passiert, display_summary | Ereignis oder zugeschriebene Aussage; jede enthaltene Teilbehauptung muss erhalten bleiben |
| warum_wichtig, why_relevant | Belegte Bedeutung beziehungsweise expliziter Profilbezug; keine gleiche Quelle als pauschaler Ersatztext |
| wer_ist_betroffen, Akteurslisten, Kategorie | Getragene Akteursrolle beziehungsweise typisiertes Sachgebiet; Herausgebername ist kein Sachgebiet |
| risiken, chancen, risk_of_no_action, opportunity_summary | Konkrete Wirkung und Voraussetzung; zugehoerige Stufen benoetigen eigenen Massstab |
| handlungsempfehlung, recommendation, action_items | Bedingte Option fuer einen belegten Akteur; Pflichtfeld ohne Grundlage benennt diese Grenze |
| communicationLine und Kommunikationsfelder | Belegte sachliche Linie samt Adressat und Voraussetzung; keine angenommene Leserposition |
| action_items_struct einschliesslich description und dueHint | Handlung, Akteur, Voraussetzung; Frist muss genau dazu gehoeren |
| Lageabsaetze | Mindestens zwei eigenstaendige, konkrete und mandatsbezogene Sachverhalte; alle Teilbehauptungen quellengebunden |
| Ausgabezusammenfassungen und UI Aliase | Dieselben bereits freigegebenen Inhalte oder gemessener Betriebszustand; kein zweiter freier Formulierungsweg |

Sind fuer ein optionales Feld keine tragfaehigen Fakten vorhanden, bleibt
es ehrlich leer. Fehlen notwendige Sachinhalte, ist das Ergebnis partial
oder abgelehnt. Das zaehlt nicht als gelieferte500er Versorgung. Alle Felder
mit identischen Zitaten zu fuellen oder positive Inhalte pauschal zu loeschen
ist ausdruecklich kein bestandener Ansatz.

## Vorab festgelegte Gegenfaelle fuer beide Fachpfade

Synthetische Beispiele; keine Behauptungen ueber reale Ereignisse.
Jede Zeile wird als Negativfall, als positiver Gegenfall und mit fehlender
beziehungsweise widerspruechlicher Grundlage geprueft. Das sind mindestens
18 Fachfaelle, jeweils im globalen Briefing und im Lagepfad, also36
Pfadfaelle. Dazu kommen fremde Kennung, geaenderter Quellenhash, fehlende
Teilbehauptung, neue freie Felder und Speicherung samt Ruecklesung.

| Klasse | Negativfall muss scheitern | Positiver Inhalt muss nutzbar bleiben |
| --- | --- | --- |
| Sachgebiet und Finanzwirkung | Unbestimmter Ausgleichsbetrag wird zur Steuer oder Pflegeleistung | Ausdruecklich genannter Zuschuss fuer Busfahrkarten samt getragener Finanzwirkung |
| Vollzug und Modalitaet | Pruefung eines Vorschlags wird zur beschlossenen Verlaengerung | Ausdruecklicher Beschluss und spaeter bestaetigter Betrieb werden konkret wiedergegeben |
| Rolle und Zuschreibung | Kritiker und Adressat vertauscht; Gastbeitrag als Redaktionsposition | Belegter Sprecher, Adressat, Gruppen und Herausgeber bleiben unterscheidbar |
| Zeit und Frist | Konzert2024 wird zur neuen Reise2028; Publikation erzeugt Handlungsfrist | Beide expliziten kuenftigen Termine bleiben den neuen Auftritten zugeordnet |
| Profil und Zustaendigkeit | Stellvertretung wird zum Vorsitz; Fachthema zur individuellen Pflicht | Gelieferte Mitgliedschaft und konkret gepruefter Fachbezug bleiben erhalten |
| Bedingte Wirkung und Empfehlung | Moegliche Folge wird sicher; fremde Frist wird persoenlicher Auftrag | Belegte Voraussetzung, Wirkung und eigene Frist bleiben zusammen und bedingt |

Die Tests muessen aus dem wirklichen Eingabevertrag formulieren und alle
sichtbaren Ausgabefelder vollstaendig erfassen. Vorher bekannte Fehlantworten
bleiben negative Referenzen; positive Beispiele werden nicht angepasst, um
einen Ansatz nachtraeglich bestehen zu lassen. Ein bestandener endlicher
Testsatz ist noch keine universelle Semantikgarantie.

## Anschluss an Versorgung, Laufzeit und Kosten

Vor einer Implementierung mit Productionwirkung fehlt die belastbare
Faktenversorgung fuer die tatsaechlichen Quellen aller500 Profile. Die
31 vorbereiteten Rohquellen sind noch keine solchen Fakten und kein
Produktionsimportrecht. Ein neues globales Teilen mandatsbezogener Texte
wuerde zudem die heutige Mandantentrennung beruehren und ist kein erlaubter
Trick, um1000 Modellaufrufe billiger zu rechnen.

Dieser Vertrag setzt kein neues Modell und keinen bezahlten Versuch fest.
Zuerst muss ein offline implementierbarer kleiner Quellenvertrag mindestens
die positiven und negativen Sachfaelle in beiden Pfaden tragen. Danach
Kosten pro tatsaechlichem Entwurfs und Pruefpaar sowie vollstaendige
Versorgung gegen den unveraenderten4 USD Riegel rechnen. Der heutige
Entwurf bestaetigt weder diese Erreichbarkeit noch einen neuen500er Start.

## Offline Bindungsbaustein fuer bereits gepruefte Fakten

20.09.2026, Branch `codex/prosa-faktenbindung-20260920`, Basis Main
`6bb5659afe7402ad408286438ef19bc1aa475d1b`. **Teilweise abgeschlossen.**
`lib/helmut/prosa-faktenplan.js` setzt die bisher nur beschriebene Grenze
zwischen getrennt geprueften Fakten und einem unzuverlaessigen Textplan um.
Das Modul wird noch von keinem produktiven Fachpfad aufgerufen. Es ist weder
eine automatische Faktengewinnung noch ein Ersatz fuer deren Integration.

Eine Faktenzeile bindet die ganze Quelle, genaue Textstelle samt Kontext,
Akteur, Handlung, Gegenstand, Aussagegrad, Verneinung, Zuschreibung,
Bedingung, Ereigniszeit und gegebenenfalls das vollstaendige Profil.
Unbekannte Sachfelder bleiben null. Ganze separat gepruefte Saetze sind
nach Verwendungszweck getrennt; sie werden weder abgeschnitten noch aus
Teilzitaten neu zusammengesetzt. Die gesamte Faktenzeile braucht eine
separate inhaltsgebundene Fachfreigabe samt Pruefer und Nachweiskennung.

Der Textplan darf ausschliesslich Faktenkennungen und freigegebene Zwecke
auswaehlen. Der separat vorgegebene Feldvertrag verlangt alle vorgesehenen
Felder und deren Vorgangsbezug. Freie Texte, Rollen oder Wahrheitswerte im
Plan, fehlende Felder, falsche Zwecke und fremde Fakten scheitern. Die
Rueckpruefung rekonstruiert die vollstaendige Ausgabe statt einen vom
Absender selbst erneuerten Hash als Nachweis anzunehmen. Eigene Kopien
verhindern nachtraegliche Mutation gebundener Eingaben.

Wichtige Vertrauensgrenze: `trustedFreigaben` und `feldvertrag` sind
Servereingaben aus einer getrennten Fachpruefung. Der Hash ist weder eine
Signatur noch der Nachweis, dass ein Mensch oder unabhaengiger Adapter
wirklich geprueft hat. Ein spaeterer Aufrufer muss Herkunft, Aktualitaet,
Berechtigung und die vollstaendige Abdeckung seiner wirklichen sichtbaren
Felder sicherstellen. Er darf diese Servereingaben nicht vom Generator
oder einem ungeprueften Request uebernehmen. Nach Quellen oder
Profilaenderung muss mit frisch gelesenen Eingaben neu gebunden werden.

`scripts/prosa-faktenplan-test.js`: final51/51 isolierte Bindungsgruppen
bestanden. Darunter sechs vorab formulierte synthetische Sachklassen mit
positiven, negativen und fehlenden/widerspruechlichen Urteilen an je zwei
Feldadressen, Manipulation nach eigener Hashneuberechnung und echte lokale
Dateispeicherung mit Ruecklesung. **Diese36 adressbezogenen Bindungsfaelle
sind NICHT die geplante36er Fachabnahme beider produktiven Pfade.** Es
wurde weder `assembleKnowledgeObject` noch der produktive Lagegenerator
durch diese neue Suite abgenommen. Jeder Rueckgabevertrag behaelt
`vollstaendigeFaktenpruefung: false`.

Offen bleiben die reale unabhaengige Faktenversorgung, vollstaendige
Feldvertraege und Anschluss beider Fachpfade samt echter Speicherung und
Ruecklesung, die geplante36er Fachabnahme, frische500er Versorgung und
gemessene Zeit/Kosten. Keine Quellen im Bestand korrigiert, keine
Produktionsurteile angelegt, keine Modellaufrufe und keine Aktivierung.
Kanonischer lokaler Gesamtlauf431/436 in885s. Die fuenf Fehlschlaege
betreffen die lokale Umgebung: zwei Browser finden die Headless Shell
nicht; drei Konten/Transportpruefungen treffen bereits vorhandene
Testkonten. Unveraendert in einem sauberen eigenen Testcheckout und mit
dem vorhandenen Browserpfad bestehen danach admin-nutzer-loeschen75/75,
passwort-setzen-login-fix39/39, mailpit-transport119/119,
resend-transport201/201 und reset-timing-seitenkanal83/83.
Damit wurde jede der436 Suiten erfolgreich geprueft, aber kein einzelner
vollstaendig gruener436er Lauf behauptet. Bestandene Suiten werden nicht
erneut lokal ausgefuehrt. Der nachfolgende vollstaendig gruene CI Nachweis
und die Integration sind unten belegt.
Nur die Vorschau des eigenen Branches ist in vercel.json abgeschaltet;
alle anderen Konfigurationswerte einschliesslich Crons bleiben identisch.

Abschlussgegenprobe nach PR475: Ein unbesetzter JavaScript Arrayplatz wird
von map uebersprungen. Auf dem ersten PR Kopf8c47a2c wird eine leere
Einerauswahl nach JSON Speicherung faelschlich als gebunden bestaetigt.
Der Fix verlangt zusaetzlich die vollstaendige Zahl tatsaechlich besuchter
Felder. Die betroffene Bindungssuite besteht danach51/51, einschliesslich
unbesetzter Plaetze und ihrer JSON Nullfassung. Nur diese betroffene Suite
wurde erneut lokal ausgefuehrt. Die exakte neue PR CI prueft den korrigierten
Kopf erfolgreich; der vorherige abgeloeste CI Stand ist keine Abschlussabnahme.


## Integration PR475

PR475 am20.09.2026 gemergt. Fachlicher Main
`de03ea482b69633db0749aff4e062c56d94b8869`, Deployment
`dpl_4yYN814oRBdoVbcAv4wYyft5htPm` READY und Production Alias zugeordnet.
HTTP200 liefert Versionde03ea48. Keine Kommentare, Reviews oder offenen
Reviewthreads vor dem Merge. Exakte CI35515137143 auf dem letzten PR Kopf
`307a988d46654a54df22c3a814acbaec200c17b3`:436/436 Suiten in801s,
Browser50/50, PostgreSQL23/0, Null50026/0 und Z2248/0; alle Pflichtstufen
abgeschlossen. Der automatische Main Lauf ist beim Abschluss noch in Arbeit;
der vollstaendige fachliche Nachweis stammt aus dieser exakten PR CI.

Rein lesende SQL Nachkontrolle14:20:06 UTC:504 Profile,0 aktiv,0 lebende
Sperren,0 lebende Verstehen und Job Leases,0 unerledigte Jobs,0 junge offene
Prozesse. Tageskosten0,264700 USD; vorherige Kostenlesung bestaetigt4 USD
Grenze und0 offene Reserve. Die vier vollstaendigen Hashgrundlinien von
13:50:44 UTC sind um14:20:08 UTC identisch:

| Datenmenge | SHA256 |
| --- | --- |
| mandate_profiles | ea339008ddc23668d7234b6305a2346c116b474a40ff68dbd474d73005056e06 |
| profiles | 03e0b4e26272fbaa1d78aa199ad7e66b44e84d93b3d2d8ef02c62dcd0907f60e |
| main-auth | 9c28308d05c4619ac1801b007e2c28bae4c848a49acbe1c761d2fd2eab3f48a7 |
| main | 58d58420f47f7bb9b29be1ec47c32a7c3670363f5f5c2c5cf5ef701211c238ef |

Die technische Bindung ist abgeschlossen, das Gesamtziel bleibt teilweise
abgeschlossen. Naechster fachlicher Schritt ist ein wirklich unabhaengiger
Fakteneingang mit positivem Nutzwert und vollstaendigen Vertraegen fuer die
beiden echten Fachpfade. Weitere Hashhuellen ersetzen diesen Schritt nicht.
Die36 echten Fachfaelle bleiben offen. Keine Wiederholung von PR452.

Quellenaufnahme13:48:35 UTC:29782 gespeicherte Quellen,0 Publikationen der
letzten48 Stunden und0 Rohquellen mit helmutDipQuellfelder. Der reparierte
Adapter allein fuellt historische Daten nicht auf. Damit ist frische500er
Versorgung weiterhin nicht belegt; der31er Import bleibt nicht freigegeben.
Zeit und Kosten muessen fuer die tatsaechliche Methode und alle500 Profile
neu belastbar bestimmt werden. Alle1500 Sollpositionen bleiben vollstaendig
zu bilanzieren. Qualitaetswaechter, Crons, Environment und4 USD Grenze sind
unveraendert. Keine Aktivierung und kein neuer Teststart.

Ein moeglicher begrenzter naechster Quellenvertrag wurde nur lesend in der
[amtlichen DIP OpenAPI Beschreibung](https://search.dip.bundestag.de/api/v1/openapi.yaml)
geprueft. Schema SHA256:
`95b2e852649cff71021de2497628c3158070ecbfc9dbd15651ae485b7379c6ff`.
Vorgangsposition bietet Beschlussfassung mit Beschlusstenor sowie Ueberweisung
mit Ausschuss und Federfuehrung. Dokumenttyp allein belegt keinen Beschluss.
Das Datum bezeichnet das zugehoerige Dokument und keine automatische Frist.
aktivitaet_anzeige zeigt hoechstens vier Eintraege; aktivitaet_anzahl kann
groesser sein. Der heutige Drucksachenadapter liest diese Vorgangspositionen
nicht. Das ist eine untersuchte Anschlussmoeglichkeit, kein implementierter
Faktenlieferant oder Nachweis fuer Wirkung und individuelle Handlung.


## Erster umgesetzter Eingabebaustein: DIP Dokumentangaben

20.09.2026, PR472 integriert; [Productionbeleg](500-betriebsplan-2026-09-20.md#integration-pr472).
Dies ist die Reparatur eines Quellenverlusts, nicht die fertige neue
Prosamethode. Der vorhandene Adapter liest Dokumenttyp, Urheber und Ressort,
aber der allgemeine Weg machte daraus untypisierten Auszug beziehungsweise
verlor den Typ im Modelleingang. Der bereinigte Titel verlor ausserdem den
Originalvorspann bei Antworten auf Anfragen.

Der neue begrenzte Vertrag bewahrt diese bereits gelieferten Felder getrennt,
mit Originaltitel und inhaltsgebundener Zuordnung zur Quelle. Kein PDF Text,
kein kompletter Rohpayload und keine ergaenzten Rollen. Ein Antrag bleibt
als Dokumenttyp Antrag; daraus wird weder Annahme noch Vollzug abgeleitet.
Publikationsmetadaten erzeugen keinen Ereignistermin. Die zwei Schreibwege
und sechs echten Speicherleser erhalten den Teilbaum; Understanding, Lage
und separate Briefingpruefeingabe erhalten dieselben Angaben. Quellen und
Pruefhashes aendern sich bei geaenderten Angaben. Die kostenvermeidende
bestehende Idempotenz nach Dokumentkennungen bleibt erhalten: kein neuer
teurer Analyseauftrag allein durch diese Reparatur.

Die erste Fassung mit15 neuen Offlinegruppen prueft den wirklichen Adapter, beide Speicherwege
und alle sechs Leser mit lokalem HTTP Speicher. Sie bestand. Ein danach
hinzugefuegter gezielter Gegenfall verweigert ein abweichendes kanonisches
Quellenziel. Der Abgleich mit der amtlichen OpenAPI Beschreibung
(20.09.2026, https://search.dip.bundestag.de/api/v1/openapi.yaml)
belegt ausserdem die getrennten Felder einbringer/rolle beim
koerperschaftlichen Urheber und federfuehrend beim Ressort. Diese bleiben
jetzt einschliesslich false/unknown erhalten. Die neue gezielte Rollenprobe
besteht ebenfalls; die finale Suite umfasst16 Gruppen.
Der vorherige432er lokale Gesamtlauf wurde gemaess Nutzerauftrag
nicht wiederholt. CI35508978114 des exakten neuen PR Kopfes besteht433/433
Suiten in795s, Browser50/50 und alle isolierten PostgreSQL Pflichtgruppen.

Grenzen: Konsistenzhash ist keine Authentizitaetssignatur oder Faktenpruefung.
227 bestehende DIP Rohdokumente tragen keine gespeicherten getrennten Urheber
oder Ressortfelder; diese werden nicht aus dem Alttext rekonstruiert. Ihre
juengste Publikation ist21.08.2026, also keine frische500er Versorgung.
Die36 fachlichen Prosa Gegenfaelle bleiben geplante Abnahme, nicht bestanden.
Fuer Nachrichtentexte fehlt weiter eine unabhaengig gepruefte Faktenbasis
mit Handlung, Aussagegrad, Bedingung, Wirkung und individuellem Profilbezug.

### Dokumentidentitaet und ganze Titel

Die als PR473 integrierte Anschlussreparatur schliesst
zwei weitere konkret reproduzierte Quellenverluste. Zwei synthetische DIP
Drucksachen mit verschiedenen Kennungen, URLs und Typen, aber gleichem
Titel/Urheber, wurden bisher als ein Dokument gespeichert. Eine gueltig
gebundene API Kennung ersetzt jetzt den blossen Textfingerabdruck; die
ungefaehre Titelsuche darf verschiedene bekannte DIP Kennungen nicht
zusammenlegen. Der alte kanonische Bestandsabgleich bleibt erhalten.
Acht neue Gruppen bestanden einmal lokal, einschliesslich Altbestand,
gleicher Kennung mit anderer URL, RSS Fundstelle und manipulierten Angaben.
Zwei danach neu reproduzierte Gegenfaelle betrafen eine zuerst gelieferte
RSS Fundstelle: sie verband verschiedene Drucksachen ueber einen schwachen
Titel und verdeckte die Kennung im gespeicherten Fingerabdruck. Bekannte
DIP Kennungen werden jetzt vorab auch ihren gleichen kanonischen RSS
Adressen zugeordnet; schwache Titel duerfen diese Gruppen nicht erweitern.
Die zwei neuen Proben bestanden gezielt, darunter alle24 Reihenfolgen von
zwei amtlichen Dokumenten und ihren zwei RSS Fundstellen. Die zehnteilige
finale Identitaetssuite besteht in CI35510294577 des letzten PR Kopfes.

Ausserdem schnitt der direkte Schreibweg einen415 Zeichen langen Titel
vor der abschliessenden Verneinung ab; der globale Weg umging die Grenze
ganz. Beide speichern jetzt nur ganze Titel bis300 Zeichen, sonst null,
und behalten den getrennten Kontext. Drei neue Gruppen bestehen einmal
lokal, einschliesslich spaeter Verneinung/Bedingung und positiver Grenze.
Keine historischen Titel rekonstruiert, keine pauschale Loeschung positiver
Ausgaben. Dies ist weiterhin keine allgemeine Fakten oder Prosaabnahme.
CI35510294577 besteht435/435 Suiten in800s, Browser50/50 und alle
PostgreSQL Pflichtstufen. Die Productionintegration ist abgeschlossen;
[Beleg und verbleibende Grenze](500-betriebsplan-2026-09-20.md#integration-pr473).


## Unabhaengiger DIP Fakteneingang

20.09.2026, Branch `codex/dip-vorgangsfakten-20260920`, Basis Main
`1f1ce7175df9ab2cd4a9b68e773a45834d45c2e3`. **Teilweise abgeschlossen.**
Die vorher noch offene Main CI35517133382 ist inzwischen in beiden Jobs
vollstaendig erfolgreich. Keine offenen PRs oder laufenden Actions bei
Uebernahme. SQL15:55:58 UTC:504 Profile,0 aktiv, keine lebenden Pipeline,
Verstehen oder Job Sperren und keine jungen offenen Prozesse. Alle22709
Bestandsjobs haben den Status erledigt. Kostenlesung16:07:58 UTC:
0,264700 USD,0 offene Reserve, unveraenderte4 USD Grenze.

`lib/helmut/dip-vorgangsfakten.js` besitzt jetzt einen eigenen begrenzten
amtlichen Leser. Er liest hoechstens12 ausdrueckliche Positionskennungen
vom festen DIP Endpunkt, je Antwort hoechstens128000 Bytes und12 Sekunden.
Authentifizierung nur per Header aus `process.env.DIP_API_KEY`, keine
Weiterleitung, kein Modell, keine Datenbankschreibung oder automatische
Aufnahme in den Crawler. Es gibt noch keinen produktiven Aufrufer.
Ein geliefertes Modellobjekt oder ein vom Modell gesetztes Urteil ist kein
Eingang dieser Funktion. Die begrenzten Fachfreigaben entstehen erst aus
der vom Leser selbst abgerufenen typisierten Antwort und festen Satzformen.

Der fachliche Nutzwert ist eng, aber konkret: originale Beschlusstenore
bleiben samt Vorlagennummer, Abstimmungsangaben, Grundlage und Protokollseite
erhalten. Ueberweisungen nennen den konkreten Ausschuss, getrennte
Federfuehrung und eine gelieferte Ueberweisungsart. Fortsetzung und Nachtrag
bleiben sichtbar. Ein Beschlussempfehlungstitel erzeugt keinen Beschluss;
fehlende Vorlagennummer wird genannt, niemals aus dem Vorgangstitel geraten.
Mehrere Vorlagen bleiben getrennt beziehungsweise als gelieferte ganze
Nummernangabe erhalten. Neue unbekannte Sachfelder werden abgelehnt, damit
kein spaeter hinzugekommener Vorbehalt still verloren geht.

Die Quelle ist ausdruecklich eine normalisierte strukturierte API Aufnahme,
kein vorgetaeuschter PDF Auszug. Sie behaelt amtlichen Endpunkt, Dokumentlink,
Dokumentdatum, Originaltitel und Kontext. Datum wird nicht zur Frist oder
zum behaupteten Ereignisdatum. Aktivitaeten werden weder als vollstaendige
Personenliste noch als Rollenbeweis verwendet. Die Sachangaben tragen Zweck ereignis. Optional darf ein vom autorisierten
Aufrufer geliefertes Profil einen engen zusaetzlichen Zweck profil tragen:
explizite Bundestagsebene, exakt derselbe volle Ausschussname und eine
eindeutige normale oder stellvertretende Mitgliedschaft. Die Aussage nennt
ausdruecklich die Profilangabe und die amtliche Ueberweisung. Keine
Themenaehnlichkeit, keine Gleichsetzung mit einem Landtagsausschuss, kein
Vorsitz und keine persoenliche Pflicht. Das Profil und die vollstaendige Positionsauswahl werden vor dem ersten
asynchronen Abruf kopiert; sein vollstaendiger Hash bindet den individuellen
Satz. Widerspruechliche Ebene oder Mitgliedschaft ergibt keinen Profilbeleg.
Wirkung, Kausalitaet, allgemeiner Profilbezug, individuelle Handlung,
Frist und Vollzug bleiben unbelegt. `vollstaendigeFaktenpruefung` bleibt false.
Der vorhandene Planbaustein kann diese konkreten Saetze binden; seine Hashes
belegen weiterhin keine darueber hinausgehende Bedeutung.

Rein lesende amtliche Quellenaufnahme am20.09.: eine erste Seite mit100
Positionen war nur ein Ausschnitt aus5924 Treffern und wird nicht als
Vollbestand ausgegeben. Der ausdruecklich auf September2026 und
Plenarprotokolle der Wahlperiode21 begrenzte Abruf lieferte55 von55
Treffern:13 Positionen mit Beschlussfassung,6 mit Ueberweisungen. Die
anschliessende lokale Verarbeitung aller55 aufgenommenen Datensaetze durch
den echten Leser mit ausschliesslich ersetztem HTTP Transport liefert26
konkrete Angaben,0 technische Ablehnungen. Das ist keine Profilversorgung
und keine Frischegarantie zum spaeteren Teststart. Vier oeffentliche,
personenfreie Eingaben sind minimiert in
`scripts/fixtures/dip-vorgangsfakten-amtlich.json` reproduzierbar gesichert.
Sie liefern11 Angaben: Haushaltsbegleitgesetz, Umweltstrafrecht,
Notfallversorgung und abgelehnte Verkehrsvorlage. Die amtlichen Kennungen
sind Belegfixtures, keine Anwendungsregeln oder erlaubte Profilsonderfaelle.

18 isolierte Eingangsgruppen,4 amtliche Gegenproben und8 gezielte Profil und Aufnahmegruppen
bestanden. Nach dem Profilanschluss wurden nur die beiden betroffenen
Eingangssuiten erneut gezielt geprueft, nicht der schon laufende Gesamtlauf. Darunter Bedingungen und Ablehnung, mehrere Vorlagen, false bei
Federfuehrung, fremde Kennung und Quelle, Datumskonflikt, Transportgrenzen,
fehlende Sachgrundlage, Geheimnisschutz sowie Formulierung durch den echten
Planbaustein mit Dateispeicherung und Ruecklesung. Der kanonische lokale
Gesamtlauf endet437/438 in858s. Einzig p1-security-check meldet drei401
Antworten im lokalen Accountbestand. Derselbe unveraenderte Test besteht
anschliessend im sauberen eigenen Checkout339/339. An der Sicherheitssuite
oder Anwendungsanmeldung wurde nichts geaendert. Die neue Profil und
Aufnahmesuite wurde nach Start dieses Gesamtlaufs ergaenzt und separat8/8
geprueft; beide betroffenen Eingangssuiten bestehen erneut18/18 und4/4.
Es wird weder ein einzelner gruener438er Lauf noch ein lokaler Gesamtlauf
aller inzwischen439 Suiten auf dem finalen Kopf behauptet. Die exakte PR CI
bleibt das abschliessende Gesamtgate. Keine Behauptung, die geplanten36
produktiven Fachfaelle seien bestanden.

**Integrationsgrenze:** Der neue Eingang kann allein weder den vollstaendigen
Briefingvertrag noch zwei eigenstaendige mandatsbezogene Lageabsaetze tragen.
Die sechs geplanten positiven Sachklassen verlangen unter anderem belegte
Finanzwirkung, weitergehenden individuellen Profilbezug, Vollzug und bedingte Handlungen;
diese werden im begrenzten DIP Schema nicht geliefert. Deshalb wurden keine
freien Analysefelder durch identische Zitate ersetzt, keine positiven
Altinhalte pauschal geleert und keine automatische Gesamtfreigabe erzeugt.
Die anschliessende Integration muss die vorhandenen Feld und Qualitaetsvertraege
erhalten. Fuer die61 synthetischen Landtagsprofile und freie Nachrichtentexte
ist weiterhin ein anderer unabhaengiger Fakteneingang erforderlich.

Kein Productionimport, keine Profilaktivierung, keine Modellkosten,
keine Migration und keine Aenderung des4 USD Riegels. Nur die Vorschau des
eigenen Arbeitsbranches ist abgeschaltet. Erst nach der vollstaendigen
fachlichen Eingangsabdeckung sind beide echten Produktpfade einschliesslich
Speicherung und Ruecklesung sowie deren36 Fachfaelle abnahmefaehig.


## Integration PR477

20.09.2026,19:38 Tuerkei /18:38 Berlin /16:38 UTC. Der begrenzte
Fakteneingang ist erfolgreich integriert, der autonome Gesamtauftrag bleibt
**teilweise abgeschlossen**. PR477 ist geschlossen und gemergt auf
`7067b42f2940377dc20c66a18cdf1250d8f71de4`. Deployment
`dpl_CeUk5VzmqrYXf4aMyjGhrhX7MdwX` READY, Production Alias zugeordnet;
HTTP200 liefert Version7067b42f. Kein produktiver Aufrufer des neuen Lesers.

Exakte PR CI35522560738 auf `c41178cf28125d5d060714fc0ed60df4646ee6a6`:
439/439 Suiten in655s, Browser50/50, PostgreSQL23/0, Null50026/0 und Z2248/0.
Alle Pflichtstufen erfolgreich, keine Kommentare, Reviews oder offenen
Reviewthreads vor dem Merge. Automatischer Main Lauf35523295094 beim
Schreiben noch in Arbeit; nicht als bestanden behauptet. Der oben belegte
lokale Lauf437/438 und die anschliessende isolierte Sicherheitssuite339/339
bleiben getrennte Nachweise, kein nachtraeglich umetikettierter Gesamtlauf.

Rein lesende SQL Nachkontrolle16:38:22 UTC:504 Profile,0 aktiv,0 lebende
Sperren und Leases,0 unerledigte Jobs,0 junge offene Prozesse. Tageskosten
0,264700 USD,0 offene Reserve,4 USD Grenze unveraendert. Alle vier
vollstaendigen Datenhashes sind identisch zur Tabelle unter Integration
PR475 und damit seit13:50:44 UTC unveraendert. Berechnung: SHA256 ueber
UTF8 des JSONB Textes; vollstaendige Profilzeilen sortiert nach user_id
beziehungsweise id, bei main-auth und main ueber die vollstaendige data
Spalte. Eine anfaengliche Kontrollabfrage mit anderer Sortierung und ganzen
Storezeilen ist nicht mit dieser Grundlinie vergleichbar und kein Beleg
fuer eine Bestandsaenderung. Kein Quellenimport, Modellaufruf, Aktivierung
oder neuer Teststart durch diese Sitzung.

### Aktuelle Reichweite des Fakteneingangs

Der begrenzte amtliche Abruf fuer Wahlperiode21 mit Dokumentdatum ab18.09.2026
liefert9 von9 Vorgangspositionen, alle Drucksachen,0 Beschlussangaben und0
Ueberweisungen. Kennungen699707,699710,699721,699725,699732,699733,699736,
699737,699687. SHA256 der unveraenderten oeffentlichen Antwort:
`b09260ca60b14af3656514ef5f2cc6e137cc5ceeb1af1a0a89e7279fbfd508b7`.
Dokumentdatum ist weiterhin kein exakter Publikationszeitpunkt und kein
48 Stunden Frischebeleg. Die55 Septemberpositionen mit26 Angaben ersetzen
keine frische Versorgung zum Start.

Rein lesende relationale Mengenpruefung16:32:15 UTC, **alle504 Profile,
nicht die500er Zielauswahl**:442 Bundestagsprofile,62 Landtagsprofile.
251 Bundestagsprofile haben in ausschuesse einen exakten vollen Namen aus
den neun Ausschussnamen der Septemberueberweisungen; Landtagsprofile0.
Das ist nur ein moeglicher normaler Ausschussbezug, keine Ausfuehrung des
Profilpruefers und weder Frische, zwei eigenstaendige Inhalte noch
vollstaendige fachliche Versorgung. Stellvertretungen wurden in dieser
SQL Mengenaufnahme nicht bilanziert. Die bestehende Auswahl der fuenf
Bestandsprofile wurde nicht veraendert oder neu erfunden.

### Landesportale nur lesend untersucht

Die amtlichen Einstiege [Thueringer Rechercheportal](https://suche.thueringer-landtag.de/)
und [Landtag Mecklenburg Vorpommern](https://www.landtag-mv.de/) fuehren zu
oeffentlichen Parlamentsdatenbanken. Beide waren im Browser erreichbar.
Keine Anmeldung, kein Konto, keine Nachricht und kein Productionimport.

Thueringen zeigt bei Drucksache8/4333 im Vorgang8/4111Dr die Anfrage vom
17.08.2026 und ihre Beantwortung vom10.09.2026 getrennt. Der Status
beantwortete Anfrage beweist keine zugesagte Finanzhilfe. Der gepruefte
Ausschnitt stammt aus der auf100 Dokumente begrenzten Neuzugangsliste,
sortiert nach Nummer, nicht aus einer vollstaendigen Frischebilanz.
[Gepruefte Ergebnisadresse](https://parldok.thltcloud.de/parldok/neu/10_1_8___8.%20Wahlperiode%20(ab%2026.09.2024)).

Mecklenburg Vorpommern zeigt Beschlussprotokoll8/138 zur Sitzung vom03.07.2026.
Der erste darin angezeigte Vorgang8/Pl138c ist zurueckgezogen; im Ablauf
steht die Ruecknahme des Ausspracheantrags. Ein Beschlussprotokoll als
Dokumentart beweist somit auch hier nicht die Annahme des einzelnen
Vorgangs. Der Ausschnitt bietet47 Vorgangsseiten, nicht eine ganze Liste
auf der ersten Seite. [Amtlicher Einstieg](https://www.dokumentation.landtag-mv.de/).
Keine Behauptung, alle Landesquellen oder API Moeglichkeiten seien geprueft.
Noch kein implementierter Landesfaktenlieferant.

### Naechster eigenstaendiger Methodenblock

Fuer die vollstaendige Produktintegration fehlen weiterhin Belege fuer die
positiven Sachklassen des unveraenderten36er Vertrags. Der neue Leser darf
nicht zur Freigabe beliebiger Nachrichtenauslegung erweitert werden.
Zuerst den unabhaengigen Eingang fuer diese noch fehlenden Aussagen und
die61 synthetischen Landesprofile konkret tragen, dann beide echten Pfade
mit allen sichtbaren Feldern, Speicherung und Ruecklesung pruefen.
Anschliessend heutige Vollversorgung, Zeit und Kosten fuer500 nachweisen;
alle1500 Sollpositionen bleiben vollstaendig zu bilanzieren.

Kein Absenken von Reserven, keine ausgelassene Qualitaetsstufe, kein neues
Tagesbudget. Historische1000 Lageaufrufe und deren Kostenbeispiele aus dem
Betriebsplan beweisen weiterhin weder Erreichbarkeit noch Unmoeglichkeit
des noch nicht fertigen Verfahrens unter4 USD. Der31er Import ist nicht
freigegeben und allein kein ausreichender naechster Versorgungsschritt.
Fuer sichere Entwicklung und deren gepruefte Integration fehlt keine
pauschale Arbeitsfreigabe. Die naechste Production Datenwirkung benoetigt
einen konkret vorbereiteten Import und eigene Freigabe; Aktivierung und
500er Test bleiben gesondert gesperrt.

Dieser abschliessende PR aendert nur Dokumentation gemaess CLAUDE.md
Paragraph9. Sein eigener Merge und Deployment werden aus der Historie
belegt, kein rekursiver Dokumentations PR und kein erneuter manueller
fachlicher Gesamtlauf allein fuer diese beiden Dokumentationsdateien.


## Freigegebene Trennung von Tatsachen und Einordnung

Betreiberentscheidung21.09.2026: Das ausdrueckliche Ja im Anschluss an
PR482 erlaubt die Entwicklung des getrennten Ansatzes. Die damalige Aussage
im Forschungsentwurf, diese Produktentscheidung stehe aus, ist damit ueberholt.
Freigabeumfang: strikt belegte Tatsachen, davon sichtbar getrennte, zusaetzlich
gepruefte und weiterhin fehlbare KI Einordnung. Kein neuer bezahlter Versuch,
Import, Aktivierungsauftrag oder500er Start. Die bisherigen gescheiterten
Versuche bleiben geschlossen. [PR482](https://github.com/ernisch/helmut-pilot/pull/482)
enthaelt die unveraenderten Forschungsbefunde; dessen NLI Kandidat wird nicht
als Faktenfreigabe uebernommen.

### Implementierter Entwicklungsstand

Eigener Branch `codex/prosa-trennung-20260921`, direkt von Main
`be4b237b6154248f30e175235ed81aa9893b01bf`. Keine Forschungsimplementierung
oder Versuchsdaten aus PR479 bis482 uebernommen.

`prosa-einordnung.js` bindet den bestehenden unabhaengigen Faktenplan.
Ein serverseitiger Plan legt den freigegebenen Wortlaut fest. Der Generator
darf nur Faktenkennungen auswaehlen, keine Tatsachensaetze schreiben oder
Freigaben mitliefern. Ereignis, Zuschreibung, Zeit, Wirkung und Profil bleiben
an ihre vorher gepruefte Formulierung gebunden. Option und Kommunikation
werden nicht allein durch Umetikettieren zu Tatsachen. Maximal12 Fakten,
64.000 Eingabezeichen, vier Bloecke und600 Zeichen je freiem Feld; keine
Kuerzung. Ein Block bleibt an genau einen Vorgang und ein Quelldokument
gebunden. Eine Lage benoetigt mindestens zwei unterschiedliche Sachverhalte.

Freie Felder sind Relevanz, Risiko, Chance, Option und Kommunikation.
Relevanz und Option sind Pflicht; andere Felder duerfen ausdruecklich fehlen.
Jedes vorhandene Feld braucht ein eigenes Urteil: getragene Voraussetzungen,
keine neue Tatsachenbehauptung, korrekte Rollen/Modalitaet, konkreter
Mandatsbezug und Nutzen. Unklar, widersprochen, ein fehlendes Urteil oder
ein negatives Teilkriterium sperren die ganze Ausgabe. Alle Blockpaare
brauchen ein Urteil ueber eigenstaendige Sachinformation. Kennungen allein
reichen nicht. Quellen, gesamtes Profil, Datum, Bereich und ganzer Entwurf
sind an genau dieses Urteil gebunden. Ein alter Hash darf nicht fuer eine
geaenderte Empfehlung oder ein anderes Mandat benutzt werden.

Der bekannte Sachdetailschutz bleibt zusaetzlich bestehen. Eine neue
Gegenprobe zeigte, dass er eine neue Zahl999 nicht allgemein zurueckhaelt.
Darum kontrolliert der neue Vertrag zusaetzlich alle Ziffernangaben gegen die
ausgewaehlten Faktensaetze. Keine Umrechnung oder neue Zahleninterpretation.
Das ist ein enger technischer Schutz, kein semantischer Zahlenbeweis:
gleiche Zahlen koennen noch immer falschen Empfaengern oder Zeitrollen
zugeordnet werden. Ausgeschriebene Zahlen und sonstige Bedeutungsfehler
bleiben ebenfalls Gegenstand der separaten Fachpruefung.

`prosa-einordnung-ai.js` bereitet zwei getrennte Aufrufe vor: Entwurf und
Pruefung. Beide gehen durch die bestehende `ai.requestStructuredJson`
Schnittstelle mit mini, strengem Schema, bestehendem Budgetriegel und
maximal3000 Ausgabetoken. Kein Retry und kein Budgetbypass. Vor JEDEM
Aufruf muss der spaetere Ausfuehrer den Vorflug erneut pruefen; nach JEDEM
Ergebnis muss er den unveraenderten Rohbeleg bestaetigt speichern. Die Speicherquittung muss gespeicherten Zustand, Auftrag, Phase, Mandat,
Faktenbasis und Antwortinhalt exakt bestaetigen; blosses Promise Ende oder
false reichen nicht. Erst danach wird validiert oder die zweite Phase
betreten. Fehler beim Beleg,
Vorflug oder Anbieter stoppen. Der Adapter allein ist weder eine
dauerhafte Versuchssperre noch eine Production Ausfuehrungsfreigabe.
Er hat keinen automatischen oder oeffentlichen Aufrufer.

`prosa-vorschau.js` erstellt einen nicht serialisierbaren Prozesszugang.
Nur dieser Zugang oeffnet die internen Optionen in `buildV3Briefing` und
`buildLageBriefing`. Profil, Mandat, Tag und Bereich muessen exakt stimmen;
ein Request JSON kann den Zugang nicht ersetzen. Die Vorschau liest und
schreibt keine Produktdaten und ruft keine KI auf. Der regulaere
Briefingspeicher lehnt sie ausdruecklich ab. Damit kann sie weder einen
Tagesnachweis ersetzen noch eine500er Vollstaendigkeit vortaeuschen.

Beide tatsaechlichen Client Ansichten besitzen einen gemeinsamen Leser
fuer diese Vorschau. Belegte Quellenangaben und KI Einordnung stehen in
getrennten Abschnitten. Die Einordnung traegt pro Block den sichtbaren
Hinweis „Zusaetzlich geprueft, kann Fehler enthalten“. Alte UI Aliase werden
in dieser Vorschau nicht zusaetzlich gerendert. Texte werden escaped;
Quellenlinks erlauben ausschliesslich HTTPS ohne eingebettete Zugangsdaten.
Der gesamte Textexport behaelt die Kennzeichnung auch beim
Formulierungsvorschlag. Eine manuelle Auswahl nur einzelner Woerter oder
Saetze durch den Menschen ist kein kontrollierter Export.

### Nachweise und ausdrueckliche Grenzen

Neue lokale Vertragspruefung50/50:36 redaktionelle Faelle aus sechs Klassen
mal positiv/negativ/unklar mal Briefing/Lage. Dazu Grenzen fuer fehlende
Felder, Manipulation, Quelle/Profil, neue Zahlen, Paarvergleich,
Speicherung/Ruecklesung und getrennte Aufrufreihenfolge. Diese Tests
verwenden vorgegebene Fachurteile. Sie messen NICHT, ob ein Sprachmodell
diese Urteile selbst richtig findet. Auch ein absichtlich falsches
positives Sprachurteil wird als Methodengrenze festgehalten: Der falsche
Einordnungstext kann dann bestehen, aber niemals als bestandene
Faktenvollpruefung oder Produktabnahme. Der Tatsachenwortlaut bleibt dabei
unveraendert. Ein positives Urteil ist keine unabhaengige Beglaubigung.

Echte interne Servereinstiege und Client Ansichten lokal geprueft,
noch keine regulaere Generation/Speicherung oder Production Abnahme.
Vorschau19/19, darin zwoelf Chromium Kombinationen aus zwei Ansichten,
drei Breiten320/390/1280 und hell/dunkel. Keine seitliche Ueberbreite,
Kennzeichnung und Quellenlinks sichtbar, keine Browserfehler. Der lokale
Browserfehler des vorigen Sprints war umgebungsbedingt: passendes bereits
vorhandenes Chromium gefunden; gezielte Altpruefung75/75 bestanden.
Keine neue Installation und keine Aenderung fremder Arbeitsstaende.

Der begrenzte DIP Fakteneingang kann weiterhin nur seine dokumentierten
amtlichen Felder liefern. Die neue Trennung schafft keine allgemeine
unabhaengige Faktenversorgung fuer freie Nachrichten. Rohzitat, eigener
Modellhash und positives Eigenurteil werden nicht nachtraeglich zu einer
inhaltlichen Freigabe erklaert. Die Profilrelevanz und der Nutzen der
synthetischen Beispiele sind keine fachliche Abnahme realer Mandate.

Offen bleiben die echte Modellleistung, alle36 regulaeren Produktfaelle
mit wirklichem Speicherpfad und Ruecklesung, die vollstaendige Feld und
Aliasabdeckung ausserhalb der Vorschau, frische Versorgung aller500
Profile,1500 Ergebnispositionen sowie gemessene Zeit und Kosten. Die
bestehenden Nachlauf und Qualitaetstore sind unveraendert. Die Vorschau
erfuellt diese Tore bewusst noch nicht.

Naechster fachlicher Schritt: ein vorab begrenzter neuer Modellversuch am
getrennten Vertrag, mit festgelegter Faktenbasis, eingefrorenen Prompts,
eigener einmaliger Quittung, Rohantworten und unabhaengigen Sollurteilen.
Danach erst regulaere Speicherung und Generation anschliessen. Kein
kleiner Ersatz fuer den500er Test und kein Wiederverwenden alter Freigaben.
Ohne gesonderte Kostenfreigabe wird kein solcher Versuch ausgefuehrt.

Kanonischer Gesamtlauf ueber `scripts/lokal.js`:441/441 Suiten in915s.
Beide neuen Suiten laufen darin erfolgreich; die Antwortquittungskorrektur
war vor ihrem Start enthalten. Gesonderter Browser Smoke50/50. Alle lokalen
Pruefungen nutzen den vorhandenen passenden Chromiumstand. Neue fachliche
Vertragsgruppen50/50 und Vorschaugruppen19/19, Dokumentationsgroesse4/4.
Die mobile Vorschau wurde zusaetzlich als Bild gelesen: beide Abschnitte,
Hinweise und Quellen ohne abgeschnittenen Text sichtbar. git diff --check
besteht. Kein eigener Modellaufruf und keine behauptete Modellqualitaet.
[Entwurf PR483](https://github.com/ernisch/helmut-pilot/pull/483) sichert
Codekopf `11105012b0fb95065cc1693272b390ab2b2a1938`, Baum
`cb337d7bc908cd71cfb530fa07d67bb133c59970`. Lokaler und entfernter
Codebaum identisch. Der nachfolgende reine Dokumentationsabschluss ergaenzt
nur diesen PR Verweis. Pflicht CI am letzten Kopf separat nachsehen;
kein Merge oder Deployment behauptet.


Reine Production Nachsicht21.09.2026 um09:04:44 Tuerkei /08:04:44 Berlin /
06:04:44 UTC:504 Profile,0 aktiv,0 lebende Sperren,0 lebende Job und
Verstehensleases,0 unerledigte Jobs,0 junge offene Prozesse. Zweite SELECT
Abfrage06:04:48 UTC: alle drei alten Versuchsquittungen gestoppt; heutiges
Kostenbuch0,137576 USD, Grenze4 USD. Die Buchungen sind keine neue
Modellfreigabe. Kein eigener API Aufruf, Import oder Production Schreibzugriff.
Keine vollstaendige erneute Hashinventur behauptet.
