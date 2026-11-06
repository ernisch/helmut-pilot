# Neutrale Quellenversorgung und laufende Prüfung

Stand: 06.11.2026. PR1079 und dessen freigegebene Katalogergänzungen sind live übernommen; neue Quellenzugänge bleiben pausiert. Spätere Ergänzung: [DIP, EUR-Lex und Bundespuls](48-dip-eurlex-bundespuls.md).

## Gleiche Anforderungen

Alle 24 Bundestagsausschüsse erhalten Fachpakete, alle 16 Länder ein Landesmodell
und die zehn erfassten Parteien eigene Pakete nach derselben Zuordnungsregel.
Unbekannte Parteien werden als fehlende Zuordnung gemeldet. Fraktionslosigkeit
erzeugt keine erfundene Parteizugehörigkeit. Die bestehende Kundenzulassung bleibt
von der politischen Quellenbeobachtung getrennt.

Gleichbehandlung bedeutet passende amtliche, journalistische und gegebenenfalls
wissenschaftliche Belege für denselben Bedarf. Eine gleiche Trefferzahl wäre kein
Qualitätsbeleg. Bestehende Quellen werden nicht entfernt, um Zahlen anzugleichen.
Historische Fraktionen sind keine aktuellen Bundestagsfraktionen.

## Ergänzungen und Grenzen

Vorbereitet sind 24 amtliche Ausschuss-RSS, elf Fachfeeds, vier geprüfte Partei-RSS,
zehn gleichartig definierte Partei-Suchwege und 31 amtliche Landeszugänge. Die
technischen Prüfbelege stehen in `seeds/fachfeeds-verifiziert.json` und
`seeds/landesmodule-pruefbelege.js`. Fehlende Datumsfelder, veraltete Feeds und offene
Nutzungsbedingungen sind ausdrücklich vermerkt. Ein technischer RSS-Erfolg ist
keine Freigabe für kommerzielle Textnutzung.

Sachsen ergänzt einen öffentlich geprüften JSON-/HTML-Zugang des Medienservice:
höchstens zwei Seiten, zwölf Treffer und 15 Sekunden je Abruf. Er liefert amtliche
Überschriften, Originaladressen und Herausgeberorganisationen, keine Volltexte.
Der lokale Publikationstag und Uhrzeittext bleiben als geprüfte Metadaten erhalten;
ohne belegte Zeitzone bleibt `published_at` leer. Der Weg ist vorbereitet und inaktiv,
Nutzungsrechte sind ungeprüft. Das schließt keine vollständige Ressortabdeckung,
Landtagsversorgung oder journalistische Einordnung ein. Die bestehenden
Briefingleser werten die neuen lokalen Datumsmetadaten noch nicht gesondert aus.

Für Bremen, Hamburg, Mecklenburg-Vorpommern, Rheinland-Pfalz, Saarland,
Sachsen-Anhalt und Thüringen liegen geeignete Angebotskandidaten vor, aber kein
zusätzlicher technisch bestätigter Direktfeed. Auch Regierung, Fachjournalismus,
Kommunalebene und Fraktionsabdeckung sind noch nicht überall vollständig belegt.
Diese Lücken bleiben sichtbar; vorbereitete Einträge zählen nicht als Versorgung.
Auch die regionale Vertiefung für Bundestagsprofile ist außerhalb Niedersachsens
noch nicht gleichwertig vorhanden. Der Resolver meldet diesen Bedarf ausdrücklich
als fehlendes Regionalpaket; ein Landesbasispaket für Landtagsprofile wird dafür
nicht als fertiger Ersatz ausgegeben.

## Kontrolle im Betrieb

`betriebsabdeckung.js` vergleicht den tatsächlich installierten relationalen Katalog
mit den zentralen Sollregeln. Code-Seeds werden niemals als installierte Quellen
ausgegeben. Prüfmetadaten gelten nur bei identischer URL, Methode, Parser und Kennung.
Die Verwaltung zeigt konkrete fehlende Klassen/Rollen, fehlende Pakete, unbekannte
oder gestörte Wege, abgelaufene Prüfbelege und wirksame Google-Abhängigkeit.

Ein erfolgreicher Abruf und belastbare Inhalte werden getrennt geprüft. Überschrift
allein, Cookiehinweise, fehlende Veröffentlichungsdaten und reine Google-Verweise
bestätigen keine Versorgung. Bekannte Veröffentlichungsrhythmen bestimmen die
Frischeprüfung; unbekannte Rhythmen werden nicht erfunden. Technische Prüfbelege
erhalten eine erneute Prüfung nach 90 Tagen. Bestätigte parlamentarische Ausnahmen
werden aus der bestehenden Vollständigkeitsprüfung übernommen.

Am gemeinsamen Abschluss von `/api/cron/crawl` und `/api/cron/pipeline` wird die
Prüfung einmal ausgeführt: nach Warteschlangen-, Global-/Kontext- oder Altpfad,
auch bei Quellenmodus `off`/`shadow`. Sie liest den echten relationalen Katalog,
Profile, höchstens 1.000 Telemetriezeilen aus 14 Tagen und 800 Dokumente aus 30 Tagen.
Lesen und Speichern sind auf die verbleibende Abschlussreserve bis spätestens
290 Sekunden nach Slotbeginn begrenzt; fehlende Daten oder Zeit bleiben unbekannt.
Der vorhandene atomare/CAS-gesicherte Prozessspeicher erhält unter
`quellen-abdeckung` mit derselben Laufkennung nur Status, Zähler und Befundcodes;
Schreibfehler bleiben in der Cronantwort sichtbar. Kein zusätzlicher Cron,
Modellaufruf, künstlicher Quellenlauf oder Nachrichtendienst. Die Verwaltung liest
diesen Prozessbeleg und prüft daneben den aktuellen Bestand mit höchstens 800
Dokumenten aus 30 Tagen. Dies sind Stichproben, keine Vollprüfung des Archivs.
Ohne Profilbedarf sind allgemeine Lücken Hinweise.

## Einspielen und Rücknahme

Die generierten historischen Seed-Dateien bleiben für Neuinstallationen und
Driftprüfungen synchron. Sie dürfen für diese Ergänzung nicht erneut auf den
laufenden Bestand angewendet werden: ihre alten Upserts können Livewerte ändern.

`scripts/quellen-ergaenzungsplan.js` erstellt aus einem vollständigen frischen
Bestandsabzug einen gesonderten Ergänzungsplan mit SQL und Rücknahme. Bestehende
Abrufwege, Statuswerte, Gesundheitsdaten und manuelle Korrekturen bleiben erhalten.
Neue Pakete bleiben vorbereitet, neue Wege pausiert/manuell. Das Erzeugen des Plans
führt kein SQL aus. Apply und Rücknahme benötigen die dokumentierten Vorbedingungen
und den tatsächlichen Ausführungsbeleg; eine Rücknahme darf später veränderte oder
inzwischen verwendete Einträge nicht löschen.

Der gesonderte Plan `scripts/neutrale-quellenzuordnung-plan.js` korrigiert genau drei
bestehende Beziehungen: Brandenburgs Partei-Pilotquelle aus der neutralen Basis
entfernen, dem vorhandenen Parteipaket zuordnen und die zweite rbb-Geografie ergänzen.
Er prüft den Ausgangsstand und inaktive Zustände, schreibt keine Quelleninhalte und
liefert einen eigenen Ausführungsbeleg mit abgesichertem Rückweg. Beide Pläne wurden
gemeinsam gegen eine isolierte PostgreSQL-17-Kopie geprüft und vollständig
zurückgenommen; alle zehn Quellentabellen entsprachen danach exakt dem Ausgangsstand.

Der historische Seed-Restore bleibt an seinen ursprünglichen Zielstand gebunden;
prüfsummengesicherte SQL-Fixtures erhalten diesen Rücknahmebeleg. Der aktuelle
Katalogausbau verwendet ausschließlich den gesonderten Ergänzungsplan und dessen
eigene Rücknahmeprüfung.

Validierung: 25 Offline- und 25 PostgreSQL-Prüfungen des Ergänzungsplans sowie
9 Offline- und 29 PostgreSQL-Prüfungen der begrenzten Korrektur. Hinzu kommen die
Fach-/Parteizuordnung, Landesparser, Betriebsabdeckung, echte Cron-Abschlusswege
und Verwaltungsanzeige einschließlich fehlender Daten und HTML-Escaping.

## Produktionsübernahme am 06.11.2026

Nach ausdrücklichem GO wurde [PR1079](https://github.com/ernisch/helmut-pilot/pull/1079)
auf `ec70fe310a8615a42bfb0cdea460471fe19bb51b` gemergt. Vercel bestätigt
`dpl_7fx63YAcsDHDbnd8NU4BRoXbTYXm` als READY/Production. Die Hauptdomain liefert
Version `ec70fe31` und bytegleiche Clientdateien. `/api/release/public` bestätigt
Bereitschaft und persistenten Speicher; die Quellenverwaltung antwortet ohne
Anmeldung mit401. Die kurze deploymentbezogene Fehlerlog-Abfrage fand keine
error/fatal-Einträge. Dies ist kein angemeldeter Production-UI-Test.
Pflicht-CI42214268113:189/189Standard-,336/336Bereichssuiten und Browser bestanden;
auch PARDOK, Shadow-Pilot und Abrufwegeprüfung grün. Der separat lokal gefundene
alte Farbtest im Nutzerlöschdialog bleibt dokumentiert; keine Quellenregression.

Der frische Katalog vom13:14:41UTC entsprach exakt der freigegebenen Baseline.
Beide geprüften Pläne wurden unverändert und jeweils atomar eingespielt:
46Pakete prepared,89Wege paused/manual,32Herausgeber,2Entitäten und126Paketlinks
sowie je eine Ebenen-/Geografiezuordnung. Anschließend wurden genau die drei
beschriebenen BB/rbb-Beziehungen korrigiert. Die Kontrolle vom13:19:50UTC
bestätigt alle zehn Tabellen exakt als Ausgangsstand plus genehmigte Receipts.
Endstand:55Pakete,252Wege,291Paketlinks. Keine bestehenden Zeilen aktualisiert;
ausschließlich die vorgesehene alte Parteibasis-Verknüpfung entfernt.
Neue Zugänge bleiben pausiert, ihre Healthwerte unverändert leer. Keine zusätzlichen
Profil-, Budget-, Cron- oder Modellaktionen. Der automatische Prozessbeleg wird
erst beim nächsten regulären Quellenlauf erwartet (04:00UTC); dessen Durchführung
ist durch diesen Rollout noch nicht nachgewiesen.

[Maschinenlesbarer Nachweis](47-rollout-20261106.json) enthält Prüfsummen und
Zähler, keine Rohbestände oder Authentifizierungsdaten. Echte Receipts und daran
gebundene Rücknahme-SQL liegen im Arbeitsartefakt
`/workspace/helmut-abdeckung-2026-11-06/production-20261106/`.
Rücknahme nur bei passendem unverändertem/nicht inzwischen genutztem Bestand:
zuerst Zuordnungskorrektur, danach Ergänzungen. Kein Rücknahmetest in Production.
Für den Code ist das vorherige READY-Deployment
`dpl_6mL7X1bobnCQ1wQ24CpdxBKiC2aJ` (`c4425d7a`) der belegte Rückweg.

Technische Übernahme und Datenkontrolle sind abgeschlossen. Nächster fachlicher
Schritt: Nutzungsrechte und fehlende Inhalte/Anbindungen klären und geeignete
Quellen gesondert aktivieren; vorbereitete Zugänge bleiben keine belegte Versorgung.
