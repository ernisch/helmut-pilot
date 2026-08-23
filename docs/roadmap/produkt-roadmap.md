# Produktroadmap nach der Verkaufsbereitschaft

**Stand:** 5. August 2026

## 1. Zweck und Abgrenzung

Diese Datei ist die kanonische Roadmap für neue Produktfunktionen nach der technischen
Verkaufsbereitschaft. Sie ersetzt weder die operative Phase 1 Checkliste noch die
verbindliche Datenmotor Restliste.

1. Die [Phase 1 Checkliste](phase_1_checkliste.md) bleibt die Wahrheit für die Abnahme des Datenmotors.
2. Die [Datenmotor Restliste](../datenmotor-restliste.md) bleibt die Wahrheit für offene Betriebs,
   Rechts und Sicherheitsaufgaben.
3. Ein Eintrag hier ist eine Produktentscheidung, keine Freigabe für Umsetzung,
   Production Daten, Migrationen, Flags, externe Dienste oder Deployment.
4. Neue Funktionen bleiben nachrangig, solange P0 Verkaufsblocker offen sind.

## 2. Priorität

| Rang | Initiative | Produktziel | Zustand |
|---|---|---|---|
| 1 | KALENDER | Termine lesen und automatisch zu einer belegten Tages und Terminvorbereitung verdichten | Machbarkeit 1 abgeschlossen, Rechtsfrage und Freigabe des Kalendersystems offen |
| 2 | LINIE | Belegbares politisches Gedächtnis und persönlicher Linienwächter | Auf Roadmap angenommen, Umsetzung nicht begonnen |

KALENDER liefert den häufigsten täglichen Anlass. LINIE schafft die stärkere langfristige
Differenzierung. Der öffentliche LINIE MVP benötigt keinen Kalender. Eine spätere Verbindung mit
Terminen ist ein eigener, erneut zu prüfender Ausbau.

Kanonischer Stand zu KALENDER:
[Kalender Machbarkeit 1](../kalender-machbarkeit-1.md).

## 3. LINIE

### 3.1 Produktversprechen

LINIE kennt die früheren öffentlichen Positionen des jeweiligen Mandats und vergleicht neue
relevante Vorgänge mit dieser belegten Historie.

Beispiel für eine zulässige Ausgabe:

> Mögliche Abweichung zu deiner bisherigen Linie. Am 14. Mai hast du dich öffentlich gegen
> Kürzungen ausgesprochen. Prüfe, ob der neue Vorschlag dazu passt.

Jede Ausgabe nennt die Originalquelle, das Datum und den konkreten Bezug. LINIE behauptet niemals
einen sicheren Widerspruch. Die politische Bewertung und jede Handlung bleiben beim Menschen.

### 3.2 Konkreter Nutzen

1. Widersprüche und vergessene Zusagen werden vor einer öffentlichen Reaktion sichtbar.
2. Neue Mitarbeitende verstehen die bisherige politische Linie schneller.
3. Briefings und spätere Terminvorbereitungen erhalten belastbaren historischen Kontext.
4. Jede Aussage bleibt durch eine Originalquelle überprüfbar.
5. Das Produkt wird mit der Zeit persönlicher und wertvoller, ohne automatische Entscheidungen zu treffen.

### 3.3 Sicherer MVP Umfang

Der erste MVP verarbeitet ausschließlich bewusst veröffentlichte eigene Inhalte des aktivierenden
Mandats:

1. Öffentliche Reden und Plenarreden.
2. Eigene Anträge, parlamentarische Initiativen und dokumentierte Abstimmungen.
3. Eigene Pressemitteilungen und veröffentlichte Positionspapiere.
4. Öffentlich zugängliche Interviews oder Beiträge, wenn Urheberschaft und Originalquelle
   eindeutig belegt sind.
5. Vom Büro hochgeladene Dateien nur dann, wenn das Büro ausdrücklich bestätigt, dass der Inhalt
   bereits öffentlich ist und für LINIE verwendet werden darf.

Der MVP zeigt zu einem neuen Vorgang höchstens:

1. Die relevanteste frühere Position.
2. Eine mögliche Abweichung oder erkennbare Kontinuität.
3. Originalquelle, Datum, Dokumentart und Fundstelle.
4. Eine kurze Prüfempfehlung für das Büro.

### 3.4 Ausdrücklich nicht Teil des MVP

1. Bürgeranfragen, private E Mails und Postfachinhalte.
2. Kalendernotizen, Teilnehmerlisten oder vertrauliche Termine.
3. Interne Gesprächsnotizen, nicht öffentliche Zusagen und Wahlkreisgespräche.
4. Automatische Profile politischer Gegner oder anderer Personen.
5. Mandatsübergreifende Vergleiche oder Lernen aus Daten anderer Kunden.
6. Eine automatische politische Entscheidung, Veröffentlichung oder Kontaktaufnahme.
7. Die Behauptung eines Widerspruchs ohne eindeutige und öffnende Originalquelle.
8. Eine private Datenstufe als stiller späterer Ausbau. Sie benötigt eine neue Produkt,
   Rechts und Sicherheitsentscheidung.

### 3.5 Produktregeln

1. LINIE ist je Mandat standardmäßig aus und wird ausdrücklich aktiviert.
2. Kandidaten dürfen semantisch gefunden werden. Die sichtbare Aussage muss anschließend gegen
   gespeicherte Herkunftsdaten und die Originalquelle geprüft werden.
3. Unsicherheit führt zu keiner Warnung. Lieber kein Hinweis als eine falsche Unterstellung.
4. Jede Position trägt Quelle, Datum, Dokumentart, Fundstelle und eine nachvollziehbare Zuordnung.
5. Korrekturen, Widerrufe und spätere Positionsänderungen werden zeitlich versioniert. Eine alte
   Aussage wird nicht als aktuelle Linie ausgegeben, wenn eine neuere belegte Position sie ersetzt.
6. Das Büro kann Einträge berichtigen, ausschließen, exportieren und löschen.
7. LINIE darf keine Daten zwischen Mandaten vermischen.
8. Ausgaben dienen der Vorbereitung. Menschen prüfen und entscheiden.

### 3.6 Datenschutz und Rechtsfreigabe

LINIE verarbeitet politische Meinungen und damit besonders geschützte Daten. Öffentlich zugängliche
Aussagen sind keine pauschale Erlaubnis für unbegrenzte Profilbildung.

Vor jeder Production Aktivierung müssen mindestens folgende Punkte erfüllt und dokumentiert sein:

1. OP 02 ist für den konkreten LINIE Zweck abgeschlossen. Die Rechtsgrundlagen nach Artikel 6
   und Artikel 9 DSGVO sind schriftlich bewertet und freigegeben.
2. Die Datenschutz Folgenabschätzung ist für LINIE ergänzt und vor der Aktivierung abgeschlossen.
3. Zweck, Datenquellen, zulässige Dokumentarten, Aufbewahrungsfristen und Löschregeln sind verbindlich festgelegt.
4. Auftragsverarbeitungsverträge, europäische Verarbeitungsregionen und mögliche Drittlandtransfers
   aller beteiligten Dienste sind geprüft.
5. Betroffenenrechte für Auskunft, Berichtigung, Export, Einschränkung und Löschung funktionieren praktisch.
6. Das aktivierende Mandat erhält eine verständliche Beschreibung der Verarbeitung und kann LINIE
   jederzeit wieder deaktivieren.
7. Es werden nur die für den konkreten Zweck erforderlichen Daten gespeichert.
8. Eine juristische oder datenschutzrechtliche Freigabe ist dokumentiert. Die technische
   Vorprüfung ersetzt diese Freigabe nicht.

Kanonische Grundlage:
[Datenschutz Folgenabschätzung Vorprüfung](../recht/datenschutz-folgenabschaetzung-vorpruefung.md).

### 3.7 Technische Voraussetzungen

1. OP 03 ist vor einem Einsatz mit einem zahlenden Zweitmandanten vollständig abgeschlossen.
   Dazu gehören das Zweitmandanten Freigabepaket, die dokumentierte Entscheidung zur
   datenbankseitigen Durchsetzung, die Schließung der bekannten Blob Restlücke und der
   Provisionierungsnachweis.
2. OP 01 ist vor neuen sensiblen Production Daten mindestens in dem für Migration und
   Wiederherstellung erforderlichen Umfang freigegeben.
3. Jede LINIE Abfrage und jeder Schreibpfad erzwingt Mandatsbezug. Es gibt keinen Default,
   Fallback oder Sonderpfad für einen einzelnen Pilotmandanten.
4. Öffentliche Ursprungsdokumente bleiben mandantenneutral. Die Zuordnung zur persönlichen Linie,
   Ausschlüsse, Korrekturen und Bewertungen sind mandatsgebunden.
5. Die vorhandenen semantischen Embeddings dürfen für die Kandidatensuche wiederverwendet werden.
   Sie entscheiden nicht über einen Widerspruch.
6. Modell, Rezept, Eingabehash, Quelle, Fundstelle, Bewertungszeitpunkt und verwendeter
   Datenstand müssen nachvollziehbar versioniert werden.
7. Neue KI Aufrufe erhalten ein eigenes messbares Budget und einen harten Deckel. Sie dürfen
   das Understanding Budget nicht still verbrauchen.
8. Die Funktion bleibt hinter einem standardmäßig ausgeschalteten Flag, bis alle Abnahmekriterien erfüllt sind.

Kanonische technische Grundlagen:
[Embedding Architektur](../embedding-architektur.md) und
[Sicherheitsmodell](../quellenarchitektur/05-sicherheitsmodell-rls.md).

### 3.8 Kostenannahme

LINIE benötigt nach heutigem Stand keine neue kostenpflichtige Plattform. Die vorhandene
Embedding Infrastruktur kann als Ausgangspunkt dienen.

Variable Zusatzkosten entstehen durch:

1. Embeddings für neue öffentliche Positionsdokumente.
2. Suche und Vergleich bei neuen relevanten Vorgängen.
3. Optional eine kurze KI Formulierung nach erfolgreicher Quellenprüfung.
4. Zusätzlichen Speicher und Sicherungen.

Für einen einzelnen Pilotmandanten ist zunächst mit Centbeträgen bis wenigen Euro pro Monat zu
rechnen. Das ist eine Hypothese, kein belegter Production Wert. Vor einer breiteren Aktivierung
muss ein echter vierwöchiger Kostennachweis pro Mandat vorliegen. Ein Kostenüberschreiten muss
fail closed stoppen.

### 3.9 Umsetzungsstufen

| Stufe | Inhalt | Production Wirkung |
|---|---|---|
| LINIE A | Produktvertrag, Datenkategorien, Rechtsgrundlage, Datenschutz Folgenabschätzung, Goldset und Datenmodell festlegen | Keine |
| LINIE B | Offline Prototyp mit öffentlichen Testquellen und synthetischen Mandaten | Keine |
| LINIE C | Verdeckter Shadow Betrieb für einen ausdrücklich teilnehmenden Pilotmandanten, ohne sichtbare Warnungen | Nur nach Rechts und Sicherheitsfreigabe |
| LINIE D | Sichtbarer, standardmäßig ausgeschalteter Pilot mit Korrektur, Export und Löschung | Nur nach vollständiger Abnahme |
| LINIE E | Verbindung mit freigegebenen Kalenderdaten oder weiteren privaten Daten | Nicht vor einer neuen Rechts und Produktentscheidung |

LINIE A und Teile von LINIE B können fachlich vorbereitet werden, während andere Arbeiten laufen.
Eine Production Aktivierung bleibt hinter den genannten Freigaben gesperrt.

### 3.10 Abnahmekriterien für den sichtbaren Pilot

LINIE gilt erst als erfolgreich abgeschlossen, wenn alle folgenden Kriterien belegt sind:

1. Der zulässige Datenumfang und die Rechtsgrundlagen sind schriftlich freigegeben.
2. Die Datenschutz Folgenabschätzung und alle erforderlichen Verträge sind abgeschlossen.
3. Aktivierung und Deaktivierung funktionieren je Mandat und sind standardmäßig aus.
4. Kein Test kann Daten eines anderen Mandats lesen, schreiben oder als Beleg verwenden.
5. Jede sichtbare frühere Position besitzt eine öffnende Originalquelle, ein Datum und eine Fundstelle.
6. Keine sichtbare Ausgabe behauptet einen sicheren Widerspruch.
7. Eine adversariale Testsuite erzeugt bei unklaren, widersprüchlichen oder fehlenden Quellen
   keinen falschen Hinweis.
8. Ein fachlich kuratiertes Goldset des Pilotbüros belegt den politischen Nutzen. Die Zielwerte
   für Trefferqualität werden vor der Implementierung festgelegt und dürfen nicht nachträglich
   an das Ergebnis angepasst werden.
9. Berichtigung, Ausschluss, Export und Löschung sind technisch und praktisch Ende zu Ende bewiesen.
10. Modell und Rezeptwechsel, wiederholte Läufe und Teilfehler erzeugen keine doppelten oder
    widersprüchlichen Erinnerungen.
11. Kosten werden pro Mandat gemessen, gedeckelt und über vier Wochen dokumentiert.
12. Das Pilotbüro bestätigt, dass LINIE Zeit spart und keine politisch gefährlichen
    Fehlinterpretationen erzeugt.
13. Der Sprintstatus und alle offenen Grenzen sind in CURRENT_STATE dokumentiert.

## 4. Aktueller Beschluss

LINIE ist als Premium Produktinitiative angenommen.

**Status:** geplant, nicht begonnen.

**Priorität:** nach dem direkten Alltagsnutzen von KALENDER und nach den offenen P0 Verkaufsblockern.

**Freigabe:** keine Umsetzung, keine Production Daten und keine Aktivierung durch diesen Roadmap Eintrag.
