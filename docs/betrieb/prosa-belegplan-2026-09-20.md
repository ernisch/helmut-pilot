# Konkreter Entwicklungsvertrag fuer beleggebundene Prosa

20.09.2026. **Vorbereitung, keine integrierte Methode und keine fachliche
Freigabe.** Null Modellaufrufe, keine Productiondaten geschrieben. Dieser
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

Die Anschlussreparatur auf `codex/dip-dokumentidentitaet-20260920` schliesst
zwei weitere konkret reproduzierte Quellenverluste. Zwei synthetische DIP
Drucksachen mit verschiedenen Kennungen, URLs und Typen, aber gleichem
Titel/Urheber, wurden bisher als ein Dokument gespeichert. Eine gueltig
gebundene API Kennung ersetzt jetzt den blossen Textfingerabdruck; die
ungefaehre Titelsuche darf verschiedene bekannte DIP Kennungen nicht
zusammenlegen. Der alte kanonische Bestandsabgleich bleibt erhalten.
Acht neue Gruppen bestanden einmal lokal, einschliesslich Altbestand,
gleicher Kennung mit anderer URL, RSS Fundstelle und manipulierten Angaben.

Ausserdem schnitt der direkte Schreibweg einen415 Zeichen langen Titel
vor der abschliessenden Verneinung ab; der globale Weg umging die Grenze
ganz. Beide speichern jetzt nur ganze Titel bis300 Zeichen, sonst null,
und behalten den getrennten Kontext. Drei neue Gruppen bestehen einmal
lokal, einschliesslich spaeter Verneinung/Bedingung und positiver Grenze.
Keine historischen Titel rekonstruiert, keine pauschale Loeschung positiver
Ausgaben. Dies ist weiterhin keine allgemeine Fakten oder Prosaabnahme.
PR Pflichtpruefung und Productionintegration dieser Anschlussreparatur
stehen bei Erstellung dieses Status noch aus.
