# Roadmap bis zum 500er Production Nachweis

Stand: 25.09.2026

Diese Datei ist die verbindliche Reihenfolge bis zum 500er Production Nachweis.
Sie dient Codex als kurze Arbeitsroadmap. Aktueller Production Stand und Belege
stehen weiterhin in `docs/CURRENT_STATE.md`.

## Arbeitsmodus

Wenn der Nutzer einen Roadmap Schritt als Sprint startet, arbeitet Codex diesen
Sprint vollautonom bis zu den definierten Abnahmekriterien ab.

Dazu gehören Analyse, auftragsbezogener Code und Dokumentation, gezielte Tests,
Fehlerkorrekturen, Commit, Push, Pull Request, Merge nach grüner Pflicht CI,
reguläres Vercel Production Deployment und rein lesende Nachkontrolle.

Auftragsbezogene Fehler werden selbstständig behoben und erneut geprüft. Codex
stoppt nicht nur deshalb, weil ein weiterer Korrektur PR nötig wird.

Geschützte Production Aktionen bleiben ausgenommen. Insbesondere Migrationen,
Production Daten oder Profiländerungen, Cron, Environment oder Azure Änderungen,
Budgetänderungen, externe Nachrichten sowie Aktivierung der 500 Profile und Start
des 500er Nachweises brauchen weiterhin das dafür ausdrücklich erforderliche GO.

Notwendige Modelltests dürfen innerhalb des Sprintziels autonom laufen, solange
der technische Tagesriegel von 6 USD je UTC Tag eingehalten wird und der jeweilige
Test vorher klar begrenzt ist.

## 1 · Eingefrorenes Produktziel

Bis zum 500er Nachweis wird die Grundstruktur nicht erneut umgebaut, außer ein
belegter schwerer Produktfehler erzwingt es.

### Briefing

Nutzerfrage: **Was braucht heute meine Aufmerksamkeit?**

Briefing zeigt wenige Tagesprioritäten, einen kurzen belegten Anlass und den
nächsten Arbeitsschritt. Es erklärt den politischen Sachstand nicht noch einmal,
sondern verweist auf den zugehörigen Vorgang in Lage oder auf den passenden
Beobachtungshinweis.

### Lage

Nutzerfrage: **Was muss ich verstehen?**

Lage ist der einzige Ort für die ausführliche politische Erklärung:
Sachstand, Mandatsbezug, Einordnung, Unsicherheit und Quellen.

### Radar

Nutzerfrage: **Was sollte ich im Blick behalten?**

Radar bleibt ein eigener Bereich, aber kein zweiter Newsfeed.

Radar hat genau zwei Funktionen:

1. **Über dich**  
   Artikel und Meldungen, die die betreffende Person tatsächlich erwähnen.
   Titel, Medium, Datum und Link stehen im Vordergrund. Keine zweite
   Sachstandserklärung.

2. **Beobachten**  
   Konkrete belegte Beobachtungshinweise aus Fraktion, Partei, Wahlkreis und
   Ausschüssen sowie bevorstehende Fristen, Termine, Anhörungen oder angekündigte
   nächste Schritte. Partei und Fraktion bleiben fachlich getrennte Signale.

Ein bloßer Themenbezug, ein hoher Score oder ein weiterer Artikel zum gleichen
Sachstand reicht nicht für einen Radar Eintrag.

## 2 · Verbindliche Regel gegen Überschneidungen

Jede Kernaussage hat genau einen Hauptort.

Derselbe politische Vorgang darf in mehreren Bereichen verbunden sein, aber nur
mit unterschiedlicher Funktion:

1. Lage erklärt den Sachstand.
2. Radar zeigt einen neuen Beobachtungsgrund oder eine persönliche Erwähnung.
3. Briefing priorisiert die heutige Arbeit.

Eine bloße Umformulierung derselben Kernaussage in einem anderen Bereich ist
nicht zulässig.

Andere Bereiche verweisen auf den Hauptort, statt denselben Inhalt erneut zu
erzählen.

## 3 · Nächste Arbeiten vor dem 500er Start

1. Die gemeinsame semantische Trennung der tatsächlich sichtbaren Texte aus
   Briefing, Lage und Radar technisch absichern und mit echten Helmut Ausgaben
   belegen. Nicht nur wortgleiche, sondern auch sinngleiche Wiederholungen
   erkennen. Wichtige unterschiedliche Aussagen dürfen dabei nicht entfernt
   werden.

2. Für Radar die Artikelbindung von **Über dich** sauber belegen: Der tatsächlich
   angezeigte beziehungsweise verlinkte Artikel muss die Person nachweislich
   betreffen. Umfeldsignale müssen ihrem echten Ursprung Fraktion, Partei,
   Wahlkreis oder Ausschuss korrekt zugeordnet sein.

3. Frische Production Versorgung für das Testfenster herstellen und belegen.
   Keine alten Quellen umdatieren und keinen abgeschlossenen Vorlauf ohne
   sachlichen Grund wiederholen.

4. Kostenstarttor schließen: vor dem 500er Start keine ungeklärten
   Kostenreservierungen und technischer Tagesriegel gemäß Betreiberfreigabe vom26.09. 6 USD je UTC Tag.

5. Profilbestand auf exakt 500 Zielprofile bereinigen und finalen rein lesenden
   Startplan belegen. Alle 500 werden funktional gleich behandelt. Die fünf realen
   Bestandsprofile bleiben nur technisch vor versehentlichem Löschen geschützt.
   Zusätzliche Nichtzielprofile zuerst eindeutig identifizieren und nur dann
   entfernen. Danach: 0 aktive Profile vor Aktivierung, richtiger Production
   Commit, keine störenden Jobs oder Sperren, Endwächter und Rückweg auf 0 aktive
   Profile bereit.

6. Danach stoppen. Exakt diese 500 gleich behandelten Zielprofile aktivieren und
   den eigentlichen 500er Production Nachweis erst nach neuem ausdrücklichem
   Betreiber GO starten.

## 4 · Nicht vor dem 500er Nachweis

1. Büro beziehungsweise Arbeit grundsätzlich neu gestalten.
2. Das neue mit Claude Design erarbeitete Desktop und Mobile UI integrieren oder
   die bestehende Oberfläche grundsätzlich neu gestalten. Das folgt erst nach dem
   erfolgreichen 500er Production Nachweis. Vorher nur technisch notwendige
   Smoke Prüfungen für tatsächlich geänderte Bereiche.
3. README oder allgemeines Repository Aufräumen ohne unmittelbaren Nachweisnutzen.
4. Neue Anbieter oder Modelle wie Voyage oder Cohere integrieren, solange die
   vorhandene Technik die semantische Trennung ausreichend belegen kann.
5. Die vier abgeschlossenen Understanding Problemfälle ohne sachlich neue
   Grundlage erneut versuchen.

## 5 · Entscheidungsregel

Wenn Codex gefragt wird, was als Nächstes ansteht, gilt diese Reihenfolge
zusammen mit dem aktuellen Production Stand aus `docs/CURRENT_STATE.md`.

Abgeschlossene Schritte werden nicht wiederholt. Neue unabhängige Themen werden
bis nach dem 500er Nachweis zurückgestellt.
