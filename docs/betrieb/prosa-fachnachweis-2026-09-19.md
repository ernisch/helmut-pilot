# Vorbereiteter isolierter Prosanachweis

**Nicht ausgefuehrt. Status: blockiert an ausdruecklicher Kostenfreigabe.**
Basis ist der kumulative Stand des Rollen Folgebranches auf PR443. Die acht
neutralen Eingaben und vorab festgelegten Erwartungen stehen in
`prosa-fachnachweis-2026-09-19.json`. Sie sind ausschliesslich synthetisch.
Keine historische Pruefnotiz wird zum damaligen Quellentext umgedeutet.

Manifest SHA256:
`3c9fabd194af11a6d33cc0f90745448a1dd8fc4f10861b279b4f6f861275f7e6`.
Die acht Prompts wurden mit dem echten `buildUnderstandingPrompt` offline
gerendert, einschliesslich Dokumentkennung, Text, Metadaten und Quellenregeln.
Das zugehoerige Schema hat bei `JSON.stringify` den SHA256
`bec2e28d8cc968739dd89e79d3d2119b000940be43cc350460231fbd8689202c`.
Es gibt bislang null echte Requests und null neue Modellkosten.

## Enger Auftrag zur spaeteren Freigabe

Einmalig hoechstens acht serielle Aufrufe des bestehenden Azure Modells
`gpt-5-mini`, derselbe globale Understanding Prompt und dasselbe Schema wie
im gesicherten Reparaturstand, reasoning minimal, maximal 3000 Ausgabetokens
je Aufruf. Keine neue Modellfamilie, keine Modellkonfiguration aendern,
keine zweite Pruef KI. Jede Fallkennung genau einmal; kein Retry, kein
Fallback, keine Optimierung der Eingabe nach Sichtung der Antwort.

Maximale konservative Vollreserve: 8 mal 0,212 USD = **1,696 USD insgesamt**.
Bestehender atomarer Tagesriegel von 4 USD bleibt unveraendert. Vor Start muss
mindestens die volle Reserve zusaetzlich zu allen gebundenen Tageskosten frei
sein. Der spaetere Lauf bleibt in einem UTC Tag, maximal 20 Minuten ab
bestaetigtem Start. Keine Erhoehung, kein Tageswechsel als Budgetfortsetzung.
Anbieterpreis und tatsaechlicher Tokenverbrauch sind vor dem scharfen Start
gegen die vorhandene konservative Obergrenze zu bestaetigen.

Production Profile bleiben alle inaktiv. Kein Merge, Deployment, Cron, Flag,
Artikelabruf, Kontextaktivierung, Import, Wissensobjekt, Briefing, Profil oder
Konto wird veraendert. Keine externe Zustellung. Ausschliesslich notwendige
Einmalquittung, atomare Kostenreservierungen, Kostenabrechnung und vorhandene
Aufruftelemetrie duerfen bei ausdruecklicher Freigabe geschrieben werden.
Der bestehende Gipfelauftrag und seine Quittung bleiben unberuehrt.

## Ausfuehrungsbindung und Abbruch

Vor dem ersten kostenpflichtigen Request: exakten Branchhead, unveraenderten
Main und Production Stand, Profile0, Sperren0, Leases0, keine konkurrierende
Facharbeit, wirksame Kommunikationssperre und Kostenregel 2 frisch belegen.
Die Freigabe wird an den archivierten Manifesthash und Prompt/Schemahash je
Fall gebunden. Ein eigener atomarer Versuchsbeleg verhindert Wiederholung;
ein unklarer Beleg verhindert den Start. Kein Rueckgriff auf alte Freigabeworte.

Eingabe, gesamte tatsaechliche Requestnutzlast ohne Zugangsdaten, Modellname,
rohe Antwort vor Bereinigung, Tokenbeleg, Kostenquittung und lokale abgeleitete
Fachobjekte getrennt archivieren. Keine Konsolenausgabe privater Tokens.
Das vorbereitete Paket enthaelt den exakt gerenderten Prompt und das Schema;
der spaetere HTTP Wrapper muss auch dessen Transporthuelle erhalten.
Fehlt eine dieser Bindungen, zaehlt der Versuch nicht als Fachnachweis.

Nach jeder Antwort gegen den vorab festgelegten Fallvertrag lesen. Beim ersten
kritischen Inhaltsfehler, Schemascheitern, Transportfehler, unbekanntem
Kostenstand, Zeitende oder unerwarteter Schreibwirkung keine weiteren Aufrufe.
Ein verbrauchter Fall wird nicht nachgebessert und erneut aufgerufen. Bereits
erhaltene Belege sichern; keine pauschale Fortsetzung der restlichen Faelle.

## Fachliche Entscheidung

Jede gesamte Antwort pruefen, einschliesslich Titel, Kurztext, Einordnung,
Folgen, Empfehlungen, Kommunikationsvorschlag und Listen. Ein richtiger Satz
heilt keinen falschen Nachbarsatz. Anschliessend dieselbe rohe Antwort offline
durch Erstverstehen und Update mit Speicherattrappen reichen; keine weitere
KI dabei. So bleiben Modellbefolgung und Anwendungstransformation getrennt.

Der negative Fall muss die unbelegte Behauptung vermeiden oder Unsicherheit
korrekt erhalten. Der positive Fall muss den expliziten Beleg nuetzlich
wiedergeben; leere Prosa und pauschale Ablehnung bestehen nicht. Bei mehreren
zulaessigen Formulierungen werden Bedeutungen beurteilt, keine exakten Texte.

Acht korrekte Antworten waeren ein begrenzter neuer Verhaltensnachweis der
vier Klassen, keine universelle Faktenvalidierung und keine nachtraegliche
Klaerung historischer Requests. Bei einem Fehler Ursache neu einordnen und
den kleinsten allgemeinen Fix offline entwickeln. Bezahlte Wiederholung
bleibt eine eigene Freigabe. Bei Erfolg folgen Artikelkontextentscheidung,
sicherer Testfensterplan und kumulative Integrationsfreigabe separat.
