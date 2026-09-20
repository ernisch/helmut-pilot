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

## Vorbereiteter Quellenzerlegungsversuch nach PR478

20.09.2026. **Historische Vorbereitung vor der separaten Freigabe. Der spaetere
bezahlte Versuch ist unten als abgebrochen dokumentiert, keine Methodenabnahme.**
Basis Main be4b237b6154248f30e175235ed81aa9893b01bf,
Arbeitsbranch `codex/quellenfakten-versuch-20260920`, Entwurf PR479.
Fachlicher Vorbereitungskopf d5a3774db9f62f778758aae684fc6e773b78775e.
Rein lesende Uebernahme
17:05:50 UTC:504/0,0 lebende Pipeline Sperren und Job Leases,0 unerledigte
Jobs,0 junge offene Prozesse.29782 Rohquellen,916 mit Auszug,0 mit DIP
Quellfeldern,0 Publikationen innerhalb48 Stunden. Juengste Publikation
16.09.15:55:56 UTC. Die beiden Profilhashes und beide Storehashes sind gleich
der oben festgehaltenen Grundlinie. Kosten0,264700 USD, Riegel4 USD.
Deployment dpl_H133uvcugPyny1diBKuTe71Ro55V READY mit Productionalias und
be4b237b. Main CI35524341257 bei Uebernahme noch in Arbeit.
Die anschliessende GitHub Nachsicht bestaetigte completed/success.

Die erneut gelesene amtliche OpenAPI beschreibt am Vorgang zusaetzlich
sachgebiet, beratungsstand, initiative und inkrafttreten samt erlaeuterung.
Diese Felder tragen weitere begrenzte Aussagen. Inkrafttreten belegt keinen
tatsaechlichen Vollzug; das Dokumentdatum bleibt die Datierung des letzten
Dokuments. Finanzwirkung, Bedingungen, individuelle Empfehlungen und freie
Nachrichten lassen sich damit nicht vollstaendig typisiert versorgen.
Deshalb kein weiterer Teiladapter als vermeintliche Gesamtloesung.

### Andere Reihenfolge, weiterhin unbewiesene Methode

Der verworfene Quellenrichter bewertete schon formulierte Modelltexte.
Der vorbereitete Versuch erhaelt ausschliesslich synthetische Originaltexte,
keine Produktantwort, Sollwerte oder redaktionellen Freigaben. Er zerlegt die
Hauptaussage je Quelle in belegte Wortstellen und vorgeschlagene Rollen und
Modalitaet. Der vollstaendige Originaltext muss unveraendert erhalten bleiben.
Keine freie Produktformulierung, keine Verbindung mit Productionprofilen,
keine Aufnahme in den Faktenplan und keine Erzeugung von trustedFreigaben.
Die bestehenden geschlossenen Versuche bleiben unveraendert geschlossen.

**Vertrauensgrenze:** Auch hier interpretiert ein Modell. Wortgleiche Spannen
beweisen ihre Zuordnung nicht. Ein akzeptiertes Moduslabel ist keine
unabhaengige Wahrheit. Alle Ergebnisse bleiben ungepruefte Kandidaten und
brauchen getrennte vollstaendige Originalsichtung. Dieser Versuch prueft nur,
ob eine nachvollziehbare Vorarbeit fuer den fehlenden Quellenpruefpfad
moeglich ist. Er liefert selbst noch keinen automatischen unabhaengigen
Faktenpruefer. Dauerhafter manueller Redaktionsbetrieb ist nicht beschlossen.
Eine solche Produktentscheidung darf nicht still durch diesen Versuch
eingefuehrt werden.

`scripts/fixtures/quellenfakten-korpus.json` fixiert18 synthetische Texte und
separat geschriebene Sollannotationen: je drei fuer Finanzwirkung, Vollzug,
Zuschreibung, Ereigniszeit, Profilrolle und bedingte Option. Die Profilfaelle
beschreiben ein synthetisches Register; daraus darf spaeter niemals ein
Request oder Modellprofil als autorisierte Mandatsaufloesung werden.
Der Zeitgegenfall erhaelt beide2028er Auftritte getrennt vom Konzert2024.
Der positive Vollzugsfall nennt ausdruecklichen Beschluss und Umsetzung.
Alle Bedingungen und Verneinungen bleiben im ganzen Quelltext erhalten.

Der exakte Annotationsvergleich ist ein endlicher Referenztest, kein
universeller semantischer Richter. Eine andere richtige Wortspanne kann
abweichen; dann stoppt die Serie zur Sichtung statt ein falsches Sachurteil
zu behaupten. Sollannotationen werden nach einem Ergebnis nicht angepasst,
um einen gescheiterten Lauf nachtraeglich gruen zu machen. Ein einzelnes
Tupel erfasst zudem nicht alle Nebenbehauptungen einer mehrteiligen Quelle.
Diese Grenze muss vor einer spaeteren Produktintegration aufgeloest werden.

### Konkrete getrennte Freigabegrenze

Der zu diesem Vorbereitungszeitpunkt noch NICHT gestartete Auftrag war:

* Genau sechs moegliche Aufrufe, je drei Quellen einer Klasse; kein Retry.
* Jeweils gpt-5-mini, reasoning minimal, bestehende3000 Ausgabetokens und
  unveraenderte volle Reserve0,212 USD. Hoechstens1,272 USD insgesamt.
* Ein einziges30 Minuten Fenster am20.09.2026, sechs manuelle Blockstarts;
  pro Actionsjob maximal3 Minuten. Jeder Folgeblock verlangt den gespeicherten
  Antwortbezug und eine getrennte komplette Fachsichtung des vorigen Blocks.
* Start nur bei exakt gebundenem Branch und Commit, Runversuch1, passendem
  Production Main, gesperrter Kommunikation und unveraenderten Kostenregeln.
  Kein aktives Profil, lebende Pipeline/Verstehen/Job Lease, offener Job oder
  junger offener Prozess. Vor jedem Block und nach Abschluss erneut lesen.
* Neue CAS Quittung quellenfaktenEingang20260920 im bestehenden Auth Store;
  dort duerfen nur diese Quittung, Kostenbuch und Aufruftelemetrie samt
  Storeversion wechseln. Bis zu sechs verdraengbare alte Telemetriezeilen
  werden erhalten. Der unveraenderte Modellpfad bucht ausserdem global in
  llm_budget_counters sowie fuer Azure in helmut_anbieter_fenster und
  helmut_anbieter_schutzschalter. Diese Betriebswirkungen gehoeren zur
  angefragten Freigabe; keine neue Anbietergrenze oder Azurekonfiguration.
  Keine Konten, Sessions, Profile, Quellen, Wissensobjekte oder Apptexte schreiben.
  Vor und nach jedem Block die geschuetzten Vollhashes, den Tageszaehler und
  den Anbieterzustand getrennt lesen. Ausserhalb dieser ausdruecklich benannten
  Buchungen keine neue Datenwirkung erlauben. Abweichung sperrt die Fortsetzung.
* Vollstaendige Auftraege, Rohantworten und Kostenbelege privat verschluesseln.
  Keine Geheimnisse oder politischen Rohtexte in Klartextlogs.
* Sofortstopp bei Annotationsabweichung, Schemafehler, falscher Quellbindung,
  unklaren Kosten, ungepruefter Fortsetzung oder Schutzabweichung.
  Ein unbekannter Ausgang bleibt gesperrt; keine Quittung zuruecksetzen.

Die1,272 USD sind eine konservative Höchstbindung, keine Kostenschaetzung.
Zusammen mit der gemessenen Tagesbuchung waeren1,536700 USD gebunden;
konkurrierender neuer Verbrauch kann den Start weiterhin sperren. Der4 USD
Riegel wird weder erhoeht noch umgangen. Die Tagesbindung verfaellt bei
Datumswechsel; keine eigenmaechtige Umschreibung auf einen anderen Tag.
Der Workflow ist nur ein vorbereiteter manueller Einstieg und bleibt ohne
explizite Freigabe unbenutzt. Die Branchvorschau ist ausgeschaltet.

**Abnahme bleibt getrennt:** lokale Schutztests belegen technische Isolation,
der spaetere18er Versuch hoechstens diese Quellenzerlegung.0 von36 echten
Produktpfadfaellen wurden hier geprueft. Auch bei18 richtigen Ergebnissen
bleiben vollstaendige Faktenerfassung, unabhaengige Fachfreigabe fuer echte
Quellen, Feldabdeckung beider Pfade, Speicherung/Ruecklesung, Landesversorgung,
500er Frische und gemessene Kosten/Laufzeit offen. Kein Antrag auf500er Start.

### Technische Pruefung der Vorbereitung

Kanonischer lokaler Lauf ausschliesslich ueber scripts/lokal.js:
438/441 Suiten in984s. Drei unveraenderte Suiten scheiterten:
admin-nutzer-loeschen-test.js und passwort-setzen-login-fix-test.js am lokalen
Chromium Start (socket Operation not permitted); narrativ-stress-1000-test.js
am unveraenderten180 Sekunden Limit. Kein gruener lokaler Gesamtlauf.
Die neue Korpussuite und der neue Versuchslaeufer bestanden darin beide;
die zuvor einzeln gemessenen Gruppenstaende10/10 und13/13 sind technische
Schutzpruefungen, keine gemessenen Modellantworten und keine36er Fachabnahme.
GitHub CI35526424586 prueft den Vorbereitungskopf d5a3774d. Browser50/50 und
die ersten beiden Datenbankpflichtschritte sind bestanden; die441 Suiten
laufen bei dieser Dokumentationspraezisierung noch. Bis zum kompletten
CI Abschluss bleibt die technische Abnahme offen. Endstand und exakter
abschliessender Dokumentationskopf werden im PR479 samt CI Historie belegt.

## Ausgang des freigegebenen Quellenversuchs

20.09.2026. **Gescheitert oder abgebrochen: vereinbarte Annotationsabnahme
nicht bestanden, Serie nach dem ersten Block verbindlich gestoppt.** Die
technische Isolation hat funktioniert. Das Gesamtziel bleibt teilweise
abgeschlossen, die unabhaengige Eingangsabdeckung weiterhin offen.

Die konkrete Freigabe durch das anschliessende Nutzerwort Ja galt dem oben
beschriebenen einmaligen Auftrag. Sie wurde nicht auf weitere Tage, Wiederholungen,
andere Nutzlasten oder den500er Test erweitert. Ausgefuehrter Kopf:
`3ca35bd378bfcabacd69346e75646c1156429852`,
[Actions35530374788](https://github.com/ernisch/helmut-pilot/actions/runs/35530374788),
Job106129787133. Nur der neue Quellenversuchsjob lief; die anderen Einstiege
dieses Workflows wurden uebersprungen. Die Quittung begann21:51:08 Tuerkei /
20:51:08 Berlin /18:51:08 UTC und endete18:51:27 UTC im Zustand gestoppt mit
FAKTEN_ANNOTATIONSABWEICHUNG. Kein zweiter Block, Retry oder Reset.

### Vollstaendige Sichtung von Block1

Drei synthetische Finanzquellen wurden in genau einem gpt-5-mini Aufruf
bearbeitet. Alle drei vollstaendigen Originaltexte, Quellkennungen und
ausgegebenen Wortspannen blieben quellengebunden. Der Vergleich mit den
vorher fixierten Sollannotationen ergab12 Feldabweichungen. Das bedeutet
ausdruecklich nicht12 falsche Tatsachen: sieben betreffen Artikel oder
groessere Wortspannen, eine die mehrdeutige Hauptaussagenart, vier die
unvollstaendige strukturierte Erfassung. Die Sollwerte bleiben unveraendert.

| Quelle | Vollstaendiger Befund | Bedeutung fuer die Abnahme |
| --- | --- | --- |
| f01, beschlossener Buszuschuss | Beschluss und ganze Wirkung einschliesslich Fuer Berechtigte und20 Euro sind erhalten. akteur, handlung und gegenstand verwenden andere Originalspannen. adressat und bedingung sind null. | Keine erfundene Geldwirkung. Die Berechtigten fehlen aber als eigene Struktur und damit fuer eine getrennte spaetere Feldbindung. |
| f02, unbestimmter Ausgleichsbetrag | art unbestimmt und modus offen bleiben richtig. Der Gegenstand enthaelt zusaetzlich den Artikel. handlung ist null statt koennte entfallen; der Originalbeleg enthaelt die Aussage weiterhin. | Keine Umdeutung zur Steuer oder Pflegeleistung. Der moegliche Wegfall fehlt in der strukturierten Handlung. |
| f03, bestrittene Fahrpreissenkung | modus offen und wirkung null erhalten die Unsicherheit. art ereignis statt wirkung ist allein kein belastbares Falschurteil. Andere Akteurs und Handlungsspannen sind woertlich getragen. einschraenkung enthaelt das Bestreiten, aber nicht die ausstehende gemeinsame Klaerung. | Keine sichere Preissenkung behauptet. Die ganze vereinbarte einschraenkende Passage ist strukturiert nicht erhalten, obwohl sie im Originalbeleg steht. |

Aus diesem einen Block folgt weder die generelle Unmoeglichkeit einer
Quellenzerlegung noch eine erfolgreiche unabhaengige Faktenpruefung.
Geprueft:3/18 Quellen. Nicht aufgerufen:15/18. Bestandene echte
Produktpfadfaelle:0/36. Kein Ergebnis wurde in Faktenplan, Wissensobjekte,
Mandatsbriefing, Lage oder Morgenquittung uebernommen. Weder andere richtige
Spannen noch ein nachtraeglich gelockerter Vergleich duerfen diese
geschlossene Serie nachtraeglich als bestanden oder fortsetzbar ausweisen.

### Kosten, Schutz und Nachkontrolle

Ein erfolgreicher Modelltransport,723 Eingabe und386 Ausgabetokens,
1109 insgesamt, gemessene Aufrufdauer4679ms. Das verbindliche Kostenbuch
hat die volle Reserve212000 Mikrodollar abgerechnet und1906 Mikrodollar
gebucht:0,001906 USD. Der kleinere Telemetrieschaetzwert0,000953 USD ist
nicht der hier geltende konservative Kostenbuchbetrag.

Vorflug18:49:56 UTC: Tageskosten0,387853 USD, Aufrufzaehler63.
Der Anstieg gegenueber dem frueheren Stand0,264700 stammt aus dem vorhandenen
Rueckstandslauf understanding-rueckstand-20260920173037-r2jou:20 abgerechnete
Aufrufe zwischen17:30:37 und17:34:06 UTC, zusammen0,123153 USD. Zeitlich
passend zum unveraenderten17:30 Cron, kein manueller Start durch diese Arbeit.
Seine spaetere Budgetablehnung betraf den eigenen Laufdeckel20, nicht4 USD.

Rein lesende SQL Nachkontrolle21:56:56 Tuerkei /20:56:56 Berlin /
18:56:56 UTC:504 Profile,0 aktiv;0 lebende Pipeline Sperren, Job und
Verstehen Leases,0 unerledigte Jobs,0 junge offene Prozesse. Tag0,389759 USD,
offene Reserve0, globaler Zaehler64. Der4 USD Riegel ist unveraendert.

Vollstaendige Hashes vor und nach diesem Block:

| Bestand und Berechnung | Unveraenderter SHA256 |
| --- | --- |
| mandate_profiles, jsonb_agg ganzer Zeilen nach user_id | ea339008ddc23668d7234b6305a2346c116b474a40ff68dbd474d73005056e06 |
| profiles, jsonb_agg ganzer Zeilen nach id | 03e0b4e26272fbaa1d78aa199ad7e66b44e84d93b3d2d8ef02c62dcd0907f60e |
| main, ganzes data JSONB | 58d58420f47f7bb9b29be1ec47c32a7c3670363f5f5c2c5cf5ef701211c238ef |
| Geschuetztes main-auth data, nur vier freigegebene Schluessel ausgeschlossen | 328e986acc2ab04e1bf6cf5967bec3554a58863bfed7c718d96dbeacfe1cf84e |

SQL jeweils encode(sha256(convert_to(JSONB::text,'UTF8')),'hex'). Beim
geschuetzten Auth Hash ausschliesslich llmUsage, testKostenTage,
_authStoreRevision und quellenfaktenEingang20260920 entfernt. Zusaetzlich
bestaetigte der Laeufer unveraenderte alte Kostenbuchungen und vollstaendige
Erhaltung der Aufruftelemetrie samt archivierten verdraengbaren Altzeilen.
Der ganze Auth Hash ist erwartungsgemaess geaendert: vorher
267d41fa0196f62e674afad8cc695f5cc4c1abb755d17ebef98c49eef6135291,
nachher813761d84483632f95c4bfb5718b39feae62755798ae379a0c5a8f90e1799e9a.
Kein Bericht ueber vier unveraenderte ganze Datenbestandswerte.

Die freigegebenen relationalen Buchungen sind ebenfalls sichtbar:
llm_budget_counters global63 auf64; ein neues Azure Minutenfenster18:51 UTC
mit verbraucht1. azure|gpt-5-mini bleibt zu, fehler_folge0, erfolg_folge5
auf6, aktualisiert18:51:23 UTC. Keine Anbietergrenze oder Konfiguration
geaendert. Vollstaendige Transportantwort und Kostenbeleg wurden privat
entschluesselt und gesichtet; keine privaten Schluessel im Repository.
Antwort SHA256:8c4c8f1b42db84fd6978278ac0cd66fcba6e8670491ff4a3c53e3516b1caca1c.
Transport SHA256:59e409b4618dd8d990acf076e7c096486a851f1f07696e50cba25ede12f7d168.

### Verwendbarer Stand und naechste Grenze

CI35526852330 auf dem exakt ausgefuehrten Kopf3ca35bd3 ist vollstaendig
erfolgreich:441/441 Suiten in807s, Browser50/50, PostgreSQL23/0,
Null50026/0, Z2248/0. Der vorherige lokale438/441 Lauf in984s bleibt
teilweise fehlgeschlagen; keine nachtraegliche Umdeutung. Der fruehere
CI35526424586 wurde durch die Dokumentationsaenderung abgebrochen.
Die spaetere Dokumentationskorrektur aendert weder den ausgefuehrten
Code noch Prompt, Sollannotationen, Manifest, Schema oder Freigabegrenzen.

PR479 bleibt Entwurf, ohne Merge oder Deployment. Sichere Schutzbausteine
und der negative Nachweis bleiben auf dem Branch erhalten; dieser Versuch
wird nicht als Produktfortschritt integriert. Production Main bleibt
be4b237b6154248f30e175235ed81aa9893b01bf, Deployment
dpl_H133uvcugPyny1diBKuTe71Ro55V. Keine Profile aktiviert, keine Quellen
importiert, kein500er Test gestartet. Rueckweg ist das Unterlassen weiterer
Starts unter Erhaltung aller Kosten und Quittungen; kein Datenrollback.

Die naechste sichere Arbeit ist ein vollstaendiger Eingangsvertrag fuer
mehrteilige Aussagen samt wirklich getrennter Herkunft ihrer Fachfreigabe.
Ein weiteres Modelllabel oder eine Hashhuelle loest diese Herkunft nicht.
Ein dauerhafter manueller Redaktionsbetrieb waere eine noch nicht getroffene
Produktentscheidung und wird nicht still vorausgesetzt. Fuer unveraendert
automatischen Betrieb ist bisher keine vollstaendig unabhaengig gepruefte
Versorgung aller sechs Klassen belegt. Die Tests des Versuchs belegen
weder die Erreichbarkeit noch die Unmoeglichkeit dieses Gesamtziels.

Vor weiteren bezahlten Production Methodenversuchen muss ein neuer konkreter
Auftrag mit tatsaechlich anderem Pruefziel, festen Eingaben, Abnahme, Kosten,
Datenwirkung und Rueckweg vorbereitet und gesondert freigegeben werden.
Das Restkontingent der geschlossenen Serie ist keine Wiederholungsfreigabe.
Fuer lokale Entwicklung fehlt keine pauschale Arbeitsfreigabe. Weiter offen:
beide echten Pfade und alle UI Aliase,36 Fachfaelle mit Speicherung und
Ruecklesung, frische Versorgung der ausgewaehlten500 einschliesslich Laender,
belastbare Zeit und Kosten unter4 USD und die1500er Ergebnisbilanz.
Keine Import oder500er Testfreigabe jetzt anfordern.


## Neuer freigegebener Auftrag: vollstaendige Aussagenabdeckung

20.09.2026. **Vor Start fixierter Vertrag; Ausgang siehe Folgeabschnitt.** Der Betreiber hat
im aktuellen Uebernahmeauftrag genau EINEN neuen bezahlten Methodenauftrag
ausdruecklich freigegeben. Fuer den folgenden konkretisierten Umfang ist
keine erneute Startbestaetigung erforderlich. Die frueheren Aussagen ueber
fehlende Freigabe gelten fuer den abgeschlossenen Altversuch und weitere
Auftraege ausserhalb dieses Umfangs; sie sperren diesen neuen Auftrag nicht.
Der alte Versuch und seine Referenzen bleiben unveraendert geschlossen.

### Pruefgegenstand und unabhaengige Herkunft

Der bisherige Eingang verlangte eine Hauptaussage pro Quelle. Der neue
Vergleich prueft mehrere ausdrueckliche Teilbehauptungen je Quelle und
bindet Akteur, Handlung, Gegenstand, Aussagegrad, Zuschreibung, Verneinung,
Adressat, Voraussetzung, Wirkung, Ereigniszeit, Ort, getrennte Publikationszeit und Kontext an die jeweilige
Aussage. Die18 unveraenderten synthetischen Quellen erhalten39 separat VOR
dem bezahlten Aufruf formulierte Referenzaussagen. Die alten Sollannotationen
werden weder veraendert noch nachbewertet. Die neue Referenz ist eine neue
Messvorschrift, keine nachtraegliche Gruenfaerbung des alten Laufs.

Die unabhaengige Grundlage dieses endlichen Tests ist der vorab versionierte
Referenzsatz, NICHT das getestete Modell, dessen Label oder dessen eigener
Hash. Er geht nicht in den Modellprompt ein. Jede Referenz enthaelt eine
separate fachliche Erlaeuterung und vorab ausgeschriebene zulaessige Spannen.
Artikelvarianten koennen dadurch bestehen; Bedingung, Verneinung, Rolle und
Termine duerfen nicht durch allgemeine Textnormalisierung verloren gehen.
Eindeutige Zuordnung eins zu eins verhindert, dass dieselbe Aussage mehrere
Referenzen scheinbar abdeckt. Reihenfolge ist unerheblich. Fehlende Angaben,
fehlende Aussagen, Zusatzbehauptungen und noch ungeklaerte Abweichungen
bleiben getrennt sichtbar. Eine Abweichung ist NICHT automatisch eine
falsche Tatsache; auch eine andere richtige Zerlegung kann abweichen.

Offene Frage pro geplantem Einzelaufruf, jeweils positiv/negativ/ungewiss:

1. Finanzwirkung: bleiben Beschluss, berechtigte Wirkung, moegliches Entfallen,
   Bestreiten und ausstehende Klaerung einzeln erhalten? Alter Beleg liefert
   gerade keine vollstaendige strukturelle Abdeckung.
2. Vollzug: bleiben Beschluss, bestaetigte Umsetzung, Pruefung und explizite
   Nichtbestaetigung getrennt? Im alten Versuch nicht aufgerufen.
3. Zuschreibung: bleiben Kritiker, Adressat und fremde Redaktionsposition
   samt negierten Rollen erhalten? Im alten Versuch nicht aufgerufen.
4. Zeit: bleiben Konzert2024 und zwei Auftritte2028 mit jeweils eigenem Ort
   und Datum getrennt, ohne Publikationsdatum als Ereigniszeit? Unversucht.
5. Profil: bleiben Stellvertretung, fehlender Vorsitz, Gaststatus und fehlende
   Registerangaben erhalten? Kein produktiver Mandatsbeweis. Unversucht.
6. Bedingung: bleiben Antragsmoeglichkeit, Voraussetzung, fremde Frist und
   nicht zugesagte Bewilligung gemeinsam gebunden? Unversucht.

Auch ein39/39 Referenztreffer beweist weder universelle Semantik noch einen
unabhaengigen automatischen Pruefer fuer freie reale Quellen. Der Versuch
liefert KEINE trustedFreigaben und importiert keine Kandidaten. Ein weiterer
Extraktionsprompt ist fuer sich keine Loesung des Produktproblems. Der hier
implementierte Referenzvergleich misst konkret die dokumentierte Luecke;
sein manuell vorformulierter Testsatz ist KEIN beschlossener Redaktionsbetrieb.
Beide echten Produktpfade und ihre36 Fachfaelle bleiben separat offen.

### Unveraenderlicher Umfang vor dem ersten bezahlten Aufruf

Branch `codex/aussagenabdeckung-20260920`, Ausgangskopf b8e058f4 aus PR479;
neuer eigener Entwurf, Altbranch und Altquittung unangetastet. Production
muss beim Lauf weiterhin exakt be4b237b6154248f30e175235ed81aa9893b01bf sein.
Der auszufuehrende neue Commit wird nach technischer Abnahme im Startinput
fest gebunden. Keine Aenderung von Eingaben, Prompt oder Referenzen innerhalb
des bezahlten Fensters.

* Modell/Bereitstellung: bestehendes Azure gpt-5-mini, reasoning minimal,
  maximal3000 Ausgabetokens, unveraenderte volle Reserve0,212 USD pro Aufruf.
* Hoechstens sechs Aufrufe, kein Retry, maximal1,272 USD gesamte Bindung;
  der technische4 USD Riegel zaehlt saemtlichen anderen Tagesverbrauch mit.
* Ein30 Minuten Fenster am aktuellen vorab geprueften UTC Tag20.09.2026.
  Nach Beginn fest gespeichert; jeder neue Start benoetigt mindestens drei
  Minuten Restzeit. Keine Fortsetzung oder neue Kennung nach Tageswechsel.
* Einzelne kontrollierte Starts. Vor jedem weiteren Start komplette Antwort,
  alle zum Block gehoerenden Sollpositionen UND alle gelieferten Kandidaten,
  Quellbindung, Kosten und geschuetzte Daten vergleichen. Die eigene
  Quellensichtung wird mit Einzelurteil und Begruendung je Referenz und je
  Kandidat, Prueferkennung, Antwortbezug und berechnetem Reviewhash gespeichert.
* Abnahme eines Blocks: alle gelieferten Quellen exakt gebunden und jede
  ausdrueckliche Originalaussage fachlich vollstaendig erhalten. Der exakte
  Referenzstand wird getrennt ausgewiesen und niemals nachtraeglich angepasst.
  Eine noch nicht gelistete harmlose Wortvariante darf nur nach dokumentierter
  voller Originalsichtung als bedeutungserhaltend beurteilt werden; der
  technische Referenztreffer bleibt dann trotzdem falsch. Jede Referenz UND
  jeder Kandidat braucht ein begruendetes eigenes Urteil. Ein Hash oder
  pauschales bestanden allein erlaubt keine Fortsetzung. Positive Inhalte
  erforderlich; Leerung und identische Zitate bestehen nicht.
* Sofortstopp der bezahlten Serie bei fachlich fehlender oder unklarer Abdeckung,
  Schema/Quellfehler, unklarem Transport/Kosten, Schutzabweichung, Konkurrenz,
  abweichender Laufzeitkonfiguration, Fensterschluss oder UTC Wechsel.
  Ein Referenzunterschied wartet zwingend auf komplette getrennte Sichtung.
  Bei abgelehnt/unklar schliesst eine eigene kontrollierte Abschlussaktion
  nur die neue Quittung, mit NULL Modellaufrufen. Nach Position6 ist diese
  letzte Sichtung ebenfalls erforderlich. Kein Reset. Negative Messung bleibt
  negativ; sichere Offlineentwicklung geht weiter.
* Ein neuer CAS Schluessel aussagenabdeckung20260920 im bestehenden Auth
  Store. Erlaubt sind nur diese neue Quittung, llmUsage, testKostenTage,
  _authStoreRevision sowie notwendige bestehende globale und Anbieterbuchungen.
  quellenfaktenEingang20260920 bleibt Teil des vollstaendig geschuetzten
  Auth Bestands und muss bereits gestoppt sein. Keine Konten, Sessions,
  Profile, Quellen, Wissensobjekte oder produktiven Ergebnisse schreiben.
* Vor und nach jedem Aufruf ganze Hashes von mandate_profiles, profiles
  und main lesen. Auth Hash ausschliesslich um die VIER neuen erlaubten
  Schluessel bereinigen; alten Versuchsbeleg darin behalten. Alte Kosten
  und alle Telemetriezeilen einschliesslich verdraengbarer Ringzeilen erhalten.
* Vollstaendige Eingaben, Referenzen, Modellantwort, Transport und Kosten
  privat verschluesselt aufbewahren. Keine privaten Schluessel oder Rohbelege
  ins oeffentliche Repository. Rueckweg: weitere Starts unterlassen, alle
  Kosten und Quittungen erhalten; kein Reset und kein Datenrollback.

Manifest SHA256:f6eb266a778b0773b058ef7bc7ea64de8adc118a06b6f3b3aebc1b9608626501.
Schema SHA256:663f2807e999c5da7bafd54034fafa35f3a45dd333c8225d6f88b269198b6aeb.
Sechs Prompthashes sind fest im neuen Laeufer hinterlegt und vor jedem Start
gegen den berechneten Text geprueft. Die bytegleichen Altdateien behalten
ihre bisherigen Hashes. Keine neue Bereitstellung oder Ressource.

### Uebernahme und technische Vorpruefung

20.09.2026,23:01:22 Tuerkei /22:01:22 Berlin /20:01:22 UTC:504/0,
keine lebenden Sperren oder Leases, offenen Jobs oder jungen offenen Prozesse.
Kostenlesung20:02:12 UTC:0,389759 USD, offene Reserve0, Altquittung gestoppt.
Mit der maximalen neuen Bindung waeren1,661759 USD gebunden; das ist KEIN
Startbeleg fuer einen spaeteren Zeitpunkt. Vor bezahltem Start frisch lesen.
Production Deployment dpl_H133uvcugPyny1diBKuTe71Ro55V erneut READY und mit
Production Alias; Main unveraendert. PR479 bleibt Entwurf. CI35530927958 des
Dokumentationskopfs b8e058f4 inzwischen in beiden Pflichtjobs erfolgreich.
Keine laufende Action; zwei alte wartende Offline CI vom06.08. betreffen
andere Branches, keine konkurrierenden Production Schreiber. Keine AGENTS.md
im Checkout oder den uebergeordneten Verzeichnissen gefunden.

Erste neue lokale Suiten ausschliesslich ueber scripts/lokal.js:
13/13 Eingangsgruppen und14/14 Ausfuehrungsschutzgruppen bestanden.
Darunter der echte KI Requestpfad mit ersetzt transportierter Offlineantwort,
volle Reserve vor HTTP, einmaliger Transport, alter Belegschutz, UTC und
Fenstergrenze, sechs Positionen, konkurrierender Claim, fremde Auth Mutation,
Telemetrieerhaltung und Kostenhistorie. Kein realer Modellaufruf daraus.
Kanonischer Gesamtlauf und exakte neue CI vor Ausfuehrung noch offen.

Vor dem ersten bezahlten Aufruf nachgeschaerft: Der urspruengliche neue
Entwurf auf97489291 stoppte bereits bei jedem unbekannten Referenzwort.
Das haette erneut eine harmlose Zerlegungsvariante mit Bedeutungsverlust
verwechseln koennen. Der vorbereitete Folgekopf trennt deshalb festes
Messergebnis und komplette operatorseitige Fachsichtung. Keine Modellantwort
ist bisher bekannt; keine Referenz, Quelle oder Prompt wurde dafuer geaendert.
Die betroffene Schutzsuite besteht16/16, einschliesslich unabhaengiger
Einzelbegruendungen, fehlender Reviewpositionen, Widerspruch zwischen Einzel
und Gesamturteil, abgewiesener Fortsetzung und kostenfreier irreversibler
Versuchsquittungsbeendigung. Die Eingangs13er Suite wurde nicht wiederholt.
Das ist nur die Herkunft des endlichen Testurteils, kein beschlossener
manueller Quellenbetrieb fuer reale500 Profile.

## Ausgang des neuen Aussagenabdeckungsauftrags

20.09.2026. Der neue ausdruecklich freigegebene Auftrag ist nach genau
EINEM Modellaufruf verbindlich gestoppt. Actions35536097423,
Job106145288687, ausgefuehrter Kopf e2477783fbf7fc2bf0a306fd9711ee634cb74430.
CAS Beginn20:36:52.744 UTC, gespeicherter Abschluss20:37:17.201 UTC.
Fensterende war21:06:52.744 UTC. Quittung aussagenabdeckung20260920:
status gestoppt, errorCode ABDECKUNG_QUELLBINDUNG. Workflow failure;
alle anderen Einstiege skipped. Kein Retry, kein zweiter Block, kein Reset.
Die fuenf ungenutzten Positionen duerfen nicht unter neuer Kennung oder
nach einer Promptkorrektur weiterverwendet werden. Kein Merge/Deployment.
Altversuch, alte Sollwerte und alte Quittung bleiben unveraendert geschlossen.

### Vollstaendige Sichtung, keine Gleichsetzung mit falschen Tatsachen

Alle drei ganzen Originaltexte sind erhalten. Geliefert wurden2+2+3
getrennte Aussagen, entsprechend den sieben Referenzpositionen dieses Blocks.
Drei von18 Quellen verarbeitet,15 nicht aufgerufen; sieben von39
Referenzpositionen betroffen,32 nicht aufgerufen. Keine bestandene
Produktpfadpruefung der36 echten Fachfaelle. Sieben Eintraege beweisen
keine siebenfach bestandene Bedeutung oder automatische Vollabdeckung.

Der erste technische Fehler verdeckte weitere Unterschiede. Die neue,
rein lokale Nachdiagnose erhaelt deshalb alle Befunde, OHNE die damalige
Pruefung, Antwort, Referenz oder Quittung zu veraendern:

* Alle drei Kennungen lauten q-f01 bis q-f03 statt f01 bis f03. Im Prompt
  standen Fallkennung und Quellkennung nebeneinander. Das ist auch eine
  vermeidbare Mehrdeutigkeit des Versuchsentwurfs, kein Tatsachenfehler.
* Alle sieben Aussagegradwerte sind eigene Labels statt Originalspannen:
  Beschluss, Folge (Wirkung), Moeglichkeit, Ungewissheit, Feststellung/Behauptung,
  Bestreitung und nochmals Ungewissheit. Inhaltlich plausible Labels sind
  dennoch nicht der freigegebene Spannenvertrag. Keine pauschale Behauptung
  sieben falscher Tatsachen. Die zusaetzlichen drei fehlenden Sollkennungen
  in der Diagnose sind die Kehrseite derselben Kennungsverwechslung.
* Alle anderen nichtleeren Felder sind Originalspannen. Das allein prueft
  weder ihren Bedeutungszusammenhang noch die Zuschreibung.

f01: Beschlossener Buszuschuss,20 Euro, Fahrpreissenkung und Berechtigte
sind erhalten. Die Preiswirkung steht teilweise in gegenstand und adressat;
null in bedingung/wirkung bedeutet hier NICHT, dass Betrag oder Berechtigte
voellig verloren seien. Kein Feld erhaelt aber die ausdrueckliche kausale
Verbindung dadurch zum Zuschuss. Die Zuschreibung des ersten Kandidaten
an den Stadtrat als Aussageurheber ist aus dessen beschriebener Handlung
nicht unabhaengig belegt. Ganze Originale bleiben daneben erhalten.

f02: Moegliches Entfallen UND Unbestimmtheit des Ausgleichsbetrags sind
jetzt getrennt strukturiert. koennte entfallen bewahrt die Modalitaet im
Praedikat, bleibt offen bewahrt die offene Sachbestimmung. Keine erfundene
Steuer oder Pflegeleistung. Die eigenen Aussagegradlabels verletzen die
Spannenregel, ohne damit allein eine falsche Finanzbehauptung zu beweisen.

f03: Nennung durch die Stadt, Bestreiten durch den Betreiber UND ausstehende
gemeinsame Klaerung bleiben nun getrennt erhalten. verneinung bleibt null,
aber handlung bestreitet bewahrt die Negation am richtigen Gegenstand.
Keine bestaetigte Preissenkung behauptet. Eigene Moduslabels bleiben
vertragswidrig. Die separate Erfassung des zweiten Satzes ist ein Fortschritt
gegenueber dem Altversuch, keine allgemeine Faktenfreigabe.

Alle sieben Referenzen UND alle sieben Kandidaten wurden nach dem Stopp
mit eigener Begruendung am vollstaendigen Original gesichtet. Diese Sichtung
liegt privat; sie wird nicht nachtraeglich in die geschlossene Quittung
hineingeschrieben. Der negative Vertragsausgang bleibt erhalten. Weder
universelle Unmoeglichkeit noch eine funktionierende Gesamtmethode bewiesen.

### Kosten und unabhängige Nachkontrolle

Genau ein abgerechneter Aufruf:844 Eingabe,1014 Ausgabe,1858 Gesamttokens,
11399 ms gemessene Aufrufdauer. Volle Reserve0,212 USD, danach verbindlich
0,004478 USD abgerechnet. Telemetrieschaetzung0,002239 USD verwendet einen
anderen Tarif und ist nicht der konservative Buchbetrag. Tageskosten
0,389759 auf0,394237 USD, offene Reserve0, global64 auf65.4 USD unveraendert.
Azure erhielt genau ein neues Minutenfenster20:36 mit Verbrauch1; bestehende
Buchungen blieben erhalten. Schutzschalter weiter zu, Erfolgsfolge6 auf7.

SQL Grundlinie20:36:10.886 UTC, Nachkontrolle20:37:57.584 UTC:

| Bestand und Berechnung | Vorher und nachher |
| --- | --- |
| mandate_profiles, ganze Zeilen nach user_id | ea339008ddc23668d7234b6305a2346c116b474a40ff68dbd474d73005056e06 |
| profiles, ganze Zeilen nach id | 03e0b4e26272fbaa1d78aa199ad7e66b44e84d93b3d2d8ef02c62dcd0907f60e |
| main, ganzer data Bestand | 58d58420f47f7bb9b29be1ec47c32a7c3670363f5f5c2c5cf5ef701211c238ef |
| main-auth, nur vier neu erlaubte Schluessel ausgenommen | 7fe5035b850eaf2a8c0bedf9a0a3373ab093087314daeeb4e3f6bbd1eb190a79 |
| alte quellenfaktenEingang20260920 Quittung, ganz | 0224cf3074140eade2d3cc61091f9c3b8d5b2496562da2e693ffb6ac5a972ad6 |

Berechnung wie oben per sha256 ueber JSONB::text. Ausgenommen ausschliesslich
llmUsage, testKostenTage, _authStoreRevision, aussagenabdeckung20260920.
Die alte Quittung bleibt im geschuetzten Auth Hash eingeschlossen. Ganze
Auth Hashes erwartungsgemaess verschieden: vorher
813761d84483632f95c4bfb5718b39feae62755798ae379a0c5a8f90e1799e9a,
nachher898107d55db4b92a2e5db66fed3f16904ec4ccad2b14902cd14fb600857e16ae.
Keine vier unveraenderten GANZEN Bestaende behaupten. Alte Kosten und alle
Telemetriezeilen sind zusaetzlich durch den Laeufer auf Erhaltung geprueft;
die maximal sechs verdraengbaren Ringzeilen liegen in der neuen Quittung.

Erneute Betriebssicht20:41:01 UTC /22:41:01 Berlin /23:41:01 Tuerkei:
504 Profile,0 aktiv, keine lebenden Pipeline/Job/Verstehen Sperren, offenen
Jobs oder jungen offenen Prozesse. Production Main weiterhin
be4b237b6154248f30e175235ed81aa9893b01bf, Deployment
dpl_H133uvcugPyny1diBKuTe71Ro55V erneut READY mit Production Alias.
Quellenaufnahme20:22:31 UTC:29782 Rohquellen,0 Publikationen innerhalb48
Stunden, neueste Publikation16.09.15:55:56 UTC. Kein Import oder Aktivierung.

### Belege und sichere Folgeentwicklung

Privater Vollbeleg Helmut_Aussagenabdeckung_2026-09-20.md,
Dateikennung libfile_ca99965a3e9081919b35bbbe32dd004a, SHA256
82812870adc77d41e14cf1626392d67d870738ebc5a290b85be177755f75332b.
Enthaelt Originalquellen, fixe Referenzen, Request/Response, Transport,
Kosten, Einzelurteile und SQL Vergleich. Kein Schluessel oder privater
Rohbeleg im oeffentlichen Repository.

Vor dem bezahlten Start war CI35535327586 auf dem EXAKTEN Kopfe2477783
vollstaendig erfolgreich:443/443 Suiten in646s, Browser50/50,
PostgreSQL23/0, Null50026/0, Z2248/0. Der lokale kanonische Gesamtlauf
endete441/443 in827s auf588bbce, dessen Baum mit97489291 identisch ist.
admin-nutzer-loeschen und passwort-setzen-login-fix scheiterten am lokalen
Chromium Socket; narrativ-stress-1000 bestand in144692ms. Kein gruener
lokaler Gesamtlauf, keine Umdeutung zum Gesamtnachweis des spaeteren Kopfs.
Die danach geaenderte Schutzsuite bestand separat16/16; Eingang13/13.

Nach dem Stopp wurde scripts/aussagenabdeckung-diagnose.js mit7/7 neuen
Gegenproben ergaenzt. Alle Fehler werden trotz fruehem Kennungsfehler
sichtbar; wortgleiche Texte dienen ausschliesslich der Diagnosezuordnung,
niemals der automatischen Kennungsreparatur oder Bedeutungserlaubnis.
Keine Aenderung an Laeufer, Prompt, Schema, Korpus oder Referenzen. Diese
sichere Arbeit setzt den Gesamtauftrag fort, nicht das bezahlte Experiment.

Konkrete weitere Offline Gegenprobe: Der EINGEFRORENE Referenzsatz erlaubt
bei f01 die Wirkungsspanne um20 Euro, waehrend handlung nur sinkt lautet.
Diese zulässige Kombination trifft alle Referenzen und verliert dennoch
die explizite Beziehung dadurch zwischen Beschluss und Preissenkung in
den strukturierten Aussagen. Auch der neue Referenzsatz prueft damit die
Beziehungen nicht vollstaendig. Die neue Gegenprobe haelt genau dieses
Ergebnis fest; sie verbessert nicht rueckwirkend den alten Sollsatz und
behauptet keine automatische Erkennung beliebiger Bedeutungsverluste.

Die naechste methodische Arbeit muss eine unabhaengige Pruefung der
Beziehungen zwischen Teilbehauptungen tragen: Ausloeser/Wirkung,
Aussageurheber versus Handelnder, Negation und Voraussetzung. Ein nur
bereinigter Kennungsprompt oder eine automatische Labelnormalisierung
waere dafuer kein ausreichender Pruefgegenstand. Die vorhandenen Antworten
reichen zur weiteren Offlineanalyse dieser Luecken aus; dafuer ist kein
weiterer bezahlter Aufruf erforderlich. Eine neue empirische Modellmessung
braucht dagegen einen neuen konkreten Auftrag; dieser ist geschlossen.

Weiter offen: unabhaengiger Eingang fuer reale Quellen, beide echten
Produktpfade mit allen UI Feldern,36 Fachfaelle mit Speicherung/Ruecklesung,
frische Versorgung der festgelegten500 einschliesslich beider Laender,
gemessener Zeit/Kostenvertrag unter4 USD. Der Methodenauftrag erzeugte keine
neuen500 Mandatsbriefings,500 Lageergebnisse oder500 Morgenquittungen;
alle1500 Positionen des noch ungestarteten Nachweises bleiben ungeprueft.
Keine Import oder500er Testfreigabe als naechsten Schritt anfordern.

## Vorbereitung der getrennten Relationsmessung

20.09.2026, Branch `codex/aussagenrelationen-20260920`, Basis
`dc01d7c458e956e114330435f5685c12f15ec548`. **Teilweise abgeschlossen;
kein weiterer bezahlter Start freigegeben oder ausgefuehrt.** Die beiden
abgeschlossenen Versuche, ihre Quellen, Sollwerte, Prompts und Laeufer
bleiben bytegleich. Der neue Entwurf ist keine Produktloesung und wird
nicht zusammen mit PR479/480 nach main gemergt.

### Konkreter Fortschritt und verbleibende Vertrauensgrenze

`scripts/quellenrelationen.js` prueft gerichtete Beziehungen mit Typ,
beiden Endpunkten und positionsgenauen Originalspannen. Identischer
Wortlaut an einer anderen Position, vertauschte Endpunkte, fehlende oder
zusaetzliche Beziehungen und geaenderte Quellen werden getrennt sichtbar.
Lokale Kennungen und Reihenfolge sind bedeutungsfrei. Andere Wortspannen,
etwa ein weggelassener Artikel, bleiben als ungeklaerte Abweichung zur
festen Messvorschrift sichtbar und werden nicht automatisch als falsche
Tatsache bezeichnet. Eine getrennte vollstaendige Sichtung kann sie als
harmlos einordnen; das aendert den technischen Referenztreffer nicht.

Die neue eigene Messvorschrift in
`scripts/fixtures/quellenrelationen-korpus.json` bewahrt alle18 ganzen
Originale des alten Korpus. Sie beschreibt67 getrennt begruendete
Relationen: Ursache, Bedingung, Zuschreibung, Adressat, Negation,
Modalitaet, Koreferenz, Ereigniszeit, Ereignisort, Publikationszeit,
Unbestimmtheit, Kontext, Rolle und zeitliche Folge. Umfang je Block:
9/10/12/16/7/13. Die alten39 Referenzaussagen werden weder ersetzt noch
rueckwirkend neu bewertet.67 Beziehungen beweisen keine vollstaendige
Erfassung saemtlicher atomarer Tatsachen. Beide Sichtweisen bleiben
fuer einen spaeteren produktiven Eingang notwendig.

Ein zweiter, von Kandidat und Sollgraph unabhaengiger Leser findet
sprachliche Hinweise unmittelbar in beliebigen tatsaechlichen Quelltexten.
Er meldet **Pruefbedarf**, keine automatisch verstandene Relation. Insbesondere
kann dadurch in einem Zitat stehen; kein Treffer beweist nicht die
Abwesenheit impliziter Beziehungen. Auch ein vollstaendiger Referenztreffer
und null offene Signalstellen liefern niemals eine Fachfreigabe.

Diese Gegenpruefung fand vor Einfrieren zwei Fehler der NEUEN Vorbereitung:
Bei f11 war die Spanne keine zuerst dem Teilwort von keinen statt der
spaeteren Verneinung der Handlungsfrist zugeordnet; bei f17 erkannte die
erste Signalliste steht aus innerhalb von besteht aus. Korrekte
Positionsbindung und Wortgrenzen sind jetzt gesondert testgesichert.
Zudem bleiben die Zuschreibung an die Meldung in f11 und die Einschraenkung
aus dieser Quelle in f17 ausdruecklich gebunden. Kein geschlossener
bezahlter Versuch wurde durch diese Vorbereitung veraendert.

Die neue Gegenprobe bestaetigt den alten Methodenfehler unveraendert:
Alle sieben alten Referenzpositionen koennen getroffen sein, obwohl
dadurch in den strukturierten Aussagen fehlt. Der neue Graphvergleich
weist dann die fehlende Ursachenbeziehung aus. Die tatsaechliche alte
Antwort wurde erneut aus dem gesicherten Rohbeleg gelesen: Betrag,
Berechtigte, moegliches Entfallen, Unbestimmtheit, Bestreiten und offene
Klaerung bleiben erhalten. Daraus keine neun neuen Tatsachenfehler und
kein nachtraegliches Bestehen ableiten. Sie hatte keinen Graphvertrag.

Der endliche manuell annotierte Testsatz ist **kein automatischer
unabhaengiger Pruefer fuer neue Nachrichtentexte**. Die Signalliste ist
auch kein solcher Pruefer. Kein produktiver Aufrufer, kein
trustedFreigaben Lieferant und kein dauerhafter Redaktionsbetrieb.
36 echte Produktfaelle, Landesversorgung, frische500er Versorgung,
gemessene Gesamtkosten und alle1500 Ergebnispositionen bleiben offen.

### Konkreter Vorschlag fuer einen neuen einmaligen Methodenauftrag

**Noch nicht freigegeben.** Offene empirische Frage: Kann das bestehende
Azure gpt5 mini ausdrueckliche Beziehungen samt ihren Geltungsbereichen
in einem getrennten Graphformat erhalten, statt sie zwischen einzelnen
Tupeln zu verlieren? Die Messung beantwortet nur diese begrenzte Frage.
Auch ein positives Ergebnis waere keine Production Faktenfreigabe und
wuerde den unabhaengigen Eingang fuer unbekannte Quellen nicht ersetzen.

`scripts/quellenrelationen-eingang.js` erzeugt sechs feste Prompts mit
je drei Originalquellen. Referenzen und Begruendungen werden nicht an
das Modell gesendet. Eine einzige Quellkennung vermeidet die fruehere
Fall/Quellkennungsmehrdeutigkeit. Die Ausgabe benennt woertliche Originalspannen; der Server bestimmt ihre
Positionen. Bei mehrfach gleichem Text muss das Modell die Vorkommensnummer
ab0 ausdruecklich waehlen; null ist nur bei genau einem Vorkommen erlaubt.
Keine ungepruefte erste Fundstelle und keine Normalisierung von Originaltext.
Zwei zusaetzliche Gegenproben pruefen das zweite keine sowie UTF16 nach Emoji.
So vermischt die Messung keine vom Modell ausgerechneten Zeichenpositionen
mit der offenen Bedeutungsfrage. Der Server berechnet den Quellenhash aus
seiner tatsaechlichen Eingabe; ein Modellhash gilt nicht als Beweis.

Der neue getrennte Laeufer `scripts/quellenrelationen-versuch.js` und
sein eigener Branchjob im bestehenden Workflow sind vorbereitet:

* Einmalig maximal sechs kontrollierte Einzelaufrufe, ein Block je Aufruf,
  kein Retry und keine automatische Schleife.18 synthetische Originalquellen,
  null ausgewaehlte oder aktivierte Mandatsprofile.
* Bestehendes Azure gpt5 mini, reasoning minimal, maximal3000 Ausgabetokens.
  Volle unveraenderte Reserve0,212 USD je Aufruf; maximal1,272 USD gesamte
  Auftragsbindung. Der4 USD Riegel zaehlt alle anderen Tageskosten mit.
  Keine neue Ressource, Anbietergrenze oder Budgetaenderung.
* Genau ein30 Minuten Fenster. Der bei Freigabe und frischem Vorflug
  ausgewaehlte aktuelle UTC Tag ist ein verpflichtendes Startfeld und
  bleibt danach an die persistierte Quittung gebunden. Start vor23 UTC;
  mindestens drei Minuten Restfenster vor jedem weiteren Aufruf.
  Ein anderer Tag erlaubt keinen zweiten Start, Reset oder Restverbrauch.
* Vor Start: exakten Codekopf und alle eingefrorenen Hashes, gruene Pflicht CI,
  unveraenderten Production Main, Kommunikationssperre,504/0, ruhigen Betrieb,
  Kostenbuch samt Reserven und ganze geschuetzte Datenhashes frisch lesen.
* Nur neuer CAS Schluessel quellenrelationen20260920 sowie bestehende
  llmUsage, testKostenTage, _authStoreRevision, globale Zaehler und
  Anbieterbuchungen duerfen sich aendern. Beide alten Quittungen muessen
  gestoppt sein und bleiben Teil der geschuetzten Grundlinie.
  Keine Quellen, Produkttexte, Wissensobjekte, Profile, Konten oder Sessions.
* Nach jedem Aufruf: ganze Antwort samt Transport sichern, Kosten und
  Datenintegritaet gegenlesen; jede Referenz UND jede gelieferte Relation
  am vollstaendigen Original einzeln begruendet beurteilen. Harmloser
  Variantenbefund bleibt getrennt vom festen Vergleich. Quelle nochmals
  auf im Sollsatz fehlende Beziehungen pruefen. Kein pauschales Hashurteil.
* Abnahme: alle ausdruecklichen Beziehungen mit richtiger Richtung,
  Modalitaet, Negation und Geltung erhalten, keine neue unbelegte Beziehung,
  keine Leerung und keine identischen Ganzzitate als pauschaler Ersatz.
  Bei unklarer oder abgelehnter Bedeutungsabdeckung, Schema/Transportfehler,
  unbekannten Kosten, Schutzabweichung, Konkurrenz, Fenster oder Tagesende
  sofort stoppen. Ein noch nicht gesichteter Block erlaubt keinen Folgestart.
* Rohbelege privat verschluesselt sichern. Vorher/Nachher ganze Hashes von
  mandate_profiles, profiles und main sowie Auth ohne genau die vier neuen
  erlaubten Schluessel; alte Kosten und Telemetrie zusaetzlich auf Erhaltung
  pruefen. Bis zu sechs verdraengbare Ringzeilen werden vorher archiviert.
* Rueckweg: weitere Starts unterlassen und ausschliesslich die neue Quittung
  bei erforderlicher getrennter Sichtung mit null Modellaufrufen terminal
  abschliessen. Kosten und alle alten Belege erhalten; kein Datenrollback.
  Auch nach dem sechsten Aufruf braucht es die getrennte Abschlussbewertung.

Manifest SHA256:
`9ccbc5079a27ae6a5ed02b1c1e349c9b06d2ae2ea0a84052035bd74259d85000`.
Schema SHA256:
`6e125cf881fbd91addcbbb0d4ad999235e7d7ec69a3d5c4078ec95653a8d0416`.
Alle sechs Prompthashes stehen unveraenderlich im Laeufer. Nach dem ersten
bezahlten Start keine Anpassung der Messvorschrift fuer gruenere Ergebnisse.

### Pruefstand der Vorbereitung

Gezielt ueber scripts/lokal.js:67/67 Relationsgruppen,12/12 Eingangsgruppen
und18/18 Schutzgruppen bestanden. Darunter jede der67 Relationen einmal
entfernt, vertauschte Richtungen, falsche Beziehungstypen, alle sechs
Klassen, echte lokale JSON Speicherung/Ruecklesung, volle Telemetrie,
beide geschlossenen Altquittungen, Tageswechsel und echter KI Budgetpfad
mit isoliertem HTTPS Ersatz. Kein externer Modellaufruf durch diese Tests.
Der kanonische Gesamtlauf auf Codebestand83ad2f482b17c31241a947caa524b9ec5e034201
endete445/447 in839 Sekunden. Die zwei unveraenderten Browserpruefungen
finden lokal die Headless Shell nicht. narrativ-stress-1000 bestand in150066ms.
Codebaum33f29ea7f5906b39ce87f0bf55ff8dd7a0114761 war identisch zum
entfernten Codekopf7bdd93c39dfec5948f1610c4cc4b83a223bd7b87.
Danach wurde nur die neue Spannenuebertragung wie oben verbessert;
betroffener Eingang12/12 und Schutz18/18 separat erneut bestanden.
Kein gruener lokaler Gesamtlauf und keine Gesamtabnahme des spaeteren
Kopfs daraus behauptet. Im sauberen isolierten Checkout wurde der vorhandene
Browserpfad gezielt fuer genau diese zwei Suiten gesetzt: admin scheitert
nun am Chromium Socket mit Operation not permitted; passwort endet mit
Exit1 ohne erfolgreichen Browserabschluss. Keine weitere lokale Wiederholung.
Die exakte finale CI und der zugehoerige Kopf werden am PR ausgewiesen;
der lokale Teilerfolg wird dadurch nicht nachtraeglich umetikettiert.

Startkontrolle21.09.00:12:19 Tuerkei /20.09.23:12:19 Berlin /21:12:19 UTC:
504 Profile,0 aktiv,0 lebende Pipeline Sperren, Job und Verstehen Leases,
0 unerledigte Jobs,0 junge offene Prozesse. Main weiterhinbe4b237b,
Deploymentdpl_H133uvcugPyny1diBKuTe71Ro55V READY mit Production Alias,
Regionfra1. Keine Production Wirkung durch diese Vorbereitung.

Naechste Grenze ist ausschliesslich die konkrete neue bezahlte Messung,
nicht eine pauschale Entwicklungsfreigabe. Keine Import oder500er
Testfreigabe anfordern. Dieser Auftrag bleibt bis zu ausdruecklicher
neuer Freigabe ungestartet. Sichere Folgeentwicklung ist weiterhin erlaubt.
