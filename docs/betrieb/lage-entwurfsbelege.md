# Private Entwurfsbelege im manuellen Textnachlauf

Der bisherige Quellenpruefer meldet feste Fehlerklassen. Bei verworfenen Antworten fehlt jedoch der konkrete Entwurf, sodass eine gezielte Korrektur nicht zuverlaessig aus der Ablehnung ableitbar ist.

Der vorhandene, ausdruecklich gestartete Modus `textnachlauf` speichert deshalb nach bestaetigter Kostenquittung den strukturierten Entwurf und nach dem zweiten Modellaufruf dessen strukturiertes Pruefurteil. Die Belege liegen mandatsgebunden im gesonderten Slot `lage-pruefentwurf` der bestehenden Tabelle. Sie sind kein ausgegebenes Briefing und werden nicht als erfolgreich geprueft bezeichnet. Die App Leser verwenden weiterhin ihre konkreten Ausgabe Slots.

Jede Kennung bindet Mandat, Tag, Lauf und Phase. Inserts ignorieren bestehende Kennungen; eine Erfolgsbestaetigung verlangt danach unabhaengiges Ruecklesen mit identischem Inhalt. Unbekannter Schreibausgang stoppt den Schritt. Es gibt keinen automatischen Schreibretry und kein Ueberschreiben vorhandener Texte. Der Quellenstand und ein Hash des fachlichen Profilkontexts binden den Pruefbeleg an seine Eingabe. Die Antwortgroesse ist begrenzt.

Es entsteht kein weiterer Modellaufruf. Tageskosten, manuelle Aufrufgrenze, Zeitreserve, Quellenpruefung und Kontoschutz bleiben unveraendert. Normale App Aufrufe und Cron Aufrufe ohne manuelle Laufkennung schreiben diese Arbeitsbelege nicht. Ein Belegfehler verhindert den naechsten Modellschritt. Prompt und Antwortinhalte gelangen weiterhin weder in Kostenprotokolle noch in oeffentliche Workflow Ergebnisse.

Tests: `lage-entwurfsbeleg-test.js` kontrolliert Besitzerfilter, Fremdantworten, unveraenderliche Inserts, Kollisionen und Ruecklesen. `lage-kostenquittung-test.js` prueft die Reihenfolge Kostenquittung, Entwurfsbeleg, zweiter Modellaufruf, Pruefbeleg sowie die Erfassung eines fachlich abgelehnten Entwurfs. Kanonische Gesamtsuite und beide Pflichtjobs sind vor einer Veroeffentlichung erforderlich.

Rueckweg: die beiden privaten Belegcallbacks im Lagepfad entfernen. Bereits gespeicherte Belege bleiben als Historie erhalten; keine Migration, Umgebungsvariable oder Cron Aenderung erforderlich.


## Veroeffentlichungsnachweis 09.09.2026

PR 350 wurde als c110ae01366f4d9281442f57d6904bbe8140aa20 veroeffentlicht. READY dpl_GGHopu8XYC8tJ4aSTWPY7ePcPKrM am Hauptalias bestaetigt. PR Kopf 92c850dee880378da3eb81721548b29109a28cc5 und Merge haben Baum 7d538e57a3b56dee213626a218b2b3ddf0da23b0. CI 34385750014: 348/348 Suiten in 650 Sekunden, 50 Browserpruefungen, 15 Kontoschutz und Kosten Gruppen gegen PostgreSQL/PostgREST sowie Z22 Datenbanknachweis erfolgreich. Dies belegt die Codepruefung, keine vollstaendige fachliche Versorgung.

### Erhaltener Veroeffentlichungsabsatz vor PR 350

**Veroeffentlichung #348:** [PR 348](https://github.com/ernisch/helmut-pilot/pull/348) ist als `79fbde465ab955c43fed3a25208122521475ab5f` gemergt. PR CI `34374247585` und main CI `34377210042` erfolgreich: 347/347 Offline Suiten, 50 Browserpruefungen und die erforderlichen Datenbankpruefungen. PR Kopf und Merge haben denselben Dateibaum. Die folgenden Angaben zu #346/#347 und zur damals noch unveroeffentlichten Quellenreparatur sind historische Belege vor #348. Codepruefung ist keine fachliche Gesamtabnahme.


## Eindeutige Textart und begruendete Urteile

Der bisherige Modellvertrag verwendet den negierten Wahrheitswert `keine_fuelltexte` und erklaert nur dessen Ablehnungsfall. Der neue Vertrag ersetzt ihn durch die eindeutigen Werte `konkreter_sachverhalt`, `fuelltext`, `wiederholung` und `unklar`. Ausschliesslich ein konkreter Sachverhalt kann bestehen. Quellenabdeckung, Themenreinheit und Profilbezug muessen weiterhin jeweils ausdruecklich bestaetigt sein. Eine unbekannte Einordnung, eine fehlende Begruendung oder eine Ablehnung verwirft weiterhin den gesamten Text. Alte Zusatzfelder koennen das neue Urteil nicht ersetzen.

Die Pruefanweisung unterscheidet Quellenzuschreibung, fehlenden Profilbezug und tatsaechlichen Fuelltext. Eine kurze konkrete Aussage wird nicht allein wegen ihrer Laenge oder ihres Quellenhinweises zum Fuelltext. Ein exaktes Quellenzitat ist kein Duplikat eines anderen Absatzes. Eine knappe private Begruendung benennt Quellenabdeckung, das passende fachliche Profilfeld und die Textart. Diese Begruendung bleibt im privaten Pruefbeleg und gelangt weder in ausgelieferte Texte noch in oeffentliche Prozessdiagnosen.

Der Generator prueft die gesamte vorhandene Quellenauswahl auf konkrete Ausschuss, Schwerpunkt oder Wahlkreisbezuege. Er soll nicht einfach die ersten Listeneintraege verwenden und keine Titel oder Quellenetiketten doppelt an den Text anhaengen. Quellenbindung und Inhaltsgrenzen gelten unveraendert. Die vorhandenen unabhaengigen Modellaufrufe bleiben bestehen; keine Wiederholung, erhoehte Aufrufgrenze oder automatische Anerkennung eines alten abgelehnten Entwurfs.

Gezielte Tests pruefen jede abgelehnte und unbekannte Textart, alte widerspruechliche Zusatzfelder, fehlende und ueberlange Begruendungen sowie den Ausschluss privater Begruendungen aus Ausgabe und Diagnose. Der echte KI Transporttest prueft weiterhin beide Kostenquittungen und das Verbot automatischer Wiederholung. Production Wirkung und Gesamtabnahme sind vor Veroeffentlichung nicht belegt. Die zusaetzliche main CI zu PR 350, Lauf 34393098443, ist erfolgreich abgeschlossen.


## Veroeffentlichung der Textkorrektur in PR 351

PR 351 wurde als d710857060aa071819082aa7b549ff256205811e uebernommen. Production READY dpl_4emadr3vHX84vrEiPK5qjJFFHk9a am Hauptalias bestaetigt. Gepruefter PR Kopf ca37aad42642a1e587d2ec79f6e83afda3d6fc61 und Merge besitzen den identischen Dateibaum dc7a7ec85b301896b96a7d22c6d208f7d7060971. CI 34396450576: 348/348 Suiten in 647 Sekunden, 50 Browserpruefungen, 15 PostgreSQL/PostgREST Kontoschutz und Kosten Gruppen sowie 48 Z22 Datenbankpruefungen erfolgreich. Die zusaetzliche main Pruefung 34397929866 laeuft noch.

Die finale Generatoranweisung bindet technische Vorgangskennungen ausdruecklich an das JSON Referenzfeld. Der sichtbare Satz darf keine solchen Kennungen enthalten. Die Codepruefung ist abgeschlossen; die fachliche Production Wirkung muss weiterhin durch gespeicherte und abgerufene Ausgaben belegt werden. Dieser Dokumentationsnachtrag aendert keinen Fachpfad.

## Verbindlicher Antwortvertrag der Quellenpruefung

Der Quellenpruefer fordert jetzt als einziger bestehender Modellpfad `strict: true` an. Sein Schema verwendet nur den von [Azure Structured Outputs](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs) unterstuetzten Umfang. Alle Prueffelder sind Pflichtfelder; Freitextgrenzen werden weiterhin unabhaengig im Code geprueft. Andere strukturierte Modellvertraege bleiben unveraendert. Fehlende, zu lange oder fachlich ablehnende Urteile bleiben gesperrt.

Das Modell waehlt die konkrete Quellenkennung und das vorhandene Originalfeld `titel` oder `auszug`. Der Server uebernimmt dessen Text als Zitatanker. Damit koennen eingefuegte Feldetiketten oder aus mehreren Stellen zusammengesetzte Modellzitate die Belegbindung nicht beschaedigen. Ein leeres Feld, eine fremde Quelle oder ein beliebiges anderes Feld wird abgelehnt. Die semantische Pruefung muss weiterhin jede Aussage gegen Titel UND Auszug desselben Dokuments bestaetigen. Ein Originalanker allein beweist keine Aussagenabdeckung. Es entsteht weder ein weiterer Modellaufruf noch ein automatischer Retry.

Die Generatoranweisung vermeidet sichtbare redaktionelle Auswahlhinweise und Aemter, die in der Quelle fehlen. Der Transporttest prueft die tatsaechlich versendete Strict Einstellung, die Pflichtfelder und beide Kostenbelege. Die Inhaltspruefung deckt ungueltige und leere Belegfelder sowie weiterhin abgelehnte Aussagen trotz gueltigem Originalanker ab. Production Wirkung bleibt vor der Veroeffentlichung offen. Die zusaetzliche main CI nach PR 351, Lauf 34397929866, ist inzwischen erfolgreich.

### Erhaltener Stand aus CURRENT_STATE vor PR 351

**Veroeffentlicht 09.09.:** [PR 350](https://github.com/ernisch/helmut-pilot/pull/350), `c110ae01366f4d9281442f57d6904bbe8140aa20`, READY `dpl_GGHopu8XYC8tJ4aSTWPY7ePcPKrM` am Hauptalias. CI `34385750014`: 348/348 Suiten, 50 Browserpruefungen und beide Datenbankgates erfolgreich; PR und Merge baumgleich. [Vertrag und Nachweis](betrieb/lage-entwurfsbelege.md). Fachliche Gesamtabnahme weiterhin offen.

**In Arbeit:** eindeutige Textart statt negiertem Fülltexturteil, private Prüfbegründung und präzisere Themenauswahl; [Vertrag](betrieb/lage-entwurfsbelege.md). Noch unveröffentlicht. **Historie vor #350:** überholte Betriebsstände bleiben als Belege erhalten.
