# Private Entwurfsbelege im manuellen Textnachlauf

Der bisherige Quellenpruefer meldet feste Fehlerklassen. Bei verworfenen Antworten fehlt jedoch der konkrete Entwurf, sodass eine gezielte Korrektur nicht zuverlaessig aus der Ablehnung ableitbar ist.

Der vorhandene, ausdruecklich gestartete Modus `textnachlauf` speichert deshalb nach bestaetigter Kostenquittung den strukturierten Entwurf und nach dem zweiten Modellaufruf dessen strukturiertes Pruefurteil. Die Belege liegen mandatsgebunden im gesonderten Slot `lage-pruefentwurf` der bestehenden Tabelle. Sie sind kein ausgegebenes Briefing und werden nicht als erfolgreich geprueft bezeichnet. Die App Leser verwenden weiterhin ihre konkreten Ausgabe Slots.

Jede Kennung bindet Mandat, Tag, Lauf und Phase. Inserts ignorieren bestehende Kennungen; eine Erfolgsbestaetigung verlangt danach unabhaengiges Ruecklesen mit identischem Inhalt. Unbekannter Schreibausgang stoppt den Schritt. Es gibt keinen automatischen Schreibretry und kein Ueberschreiben vorhandener Texte. Der Quellenstand und ein Hash des fachlichen Profilkontexts binden den Pruefbeleg an seine Eingabe. Die Antwortgroesse ist begrenzt.

Es entsteht kein weiterer Modellaufruf. Tageskosten, manuelle Aufrufgrenze, Zeitreserve, Quellenpruefung und Kontoschutz bleiben unveraendert. Normale App Aufrufe und Cron Aufrufe ohne manuelle Laufkennung schreiben diese Arbeitsbelege nicht. Ein Belegfehler verhindert den naechsten Modellschritt. Prompt und Antwortinhalte gelangen weiterhin weder in Kostenprotokolle noch in oeffentliche Workflow Ergebnisse.

Tests: `lage-entwurfsbeleg-test.js` kontrolliert Besitzerfilter, Fremdantworten, unveraenderliche Inserts, Kollisionen und Ruecklesen. `lage-kostenquittung-test.js` prueft die Reihenfolge Kostenquittung, Entwurfsbeleg, zweiter Modellaufruf, Pruefbeleg sowie die Erfassung eines fachlich abgelehnten Entwurfs. Kanonische Gesamtsuite und beide Pflichtjobs sind vor einer Veroeffentlichung erforderlich.

Rueckweg: die beiden privaten Belegcallbacks im Lagepfad entfernen. Bereits gespeicherte Belege bleiben als Historie erhalten; keine Migration, Umgebungsvariable oder Cron Aenderung erforderlich.
