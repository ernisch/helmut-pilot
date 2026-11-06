# Neutrale Quellenversorgung und laufende Prüfung

Stand: 06.11.2026. Implementierung zur Prüfung, noch nicht produktiv aktiviert.

## Gleiche Anforderungen

Alle 24 Bundestagsausschüsse erhalten Fachpakete, alle 16 Länder ein Landesmodell
und die neun erfassten Parteien eigene Pakete nach derselben Zuordnungsregel.
Unbekannte Parteien werden als fehlende Zuordnung gemeldet. Fraktionslosigkeit
erzeugt keine erfundene Parteizugehörigkeit. Die bestehende Kundenzulassung bleibt
von der politischen Quellenbeobachtung getrennt.

Gleichbehandlung bedeutet passende amtliche, journalistische und gegebenenfalls
wissenschaftliche Belege für denselben Bedarf. Eine gleiche Trefferzahl wäre kein
Qualitätsbeleg. Bestehende Quellen werden nicht entfernt, um Zahlen anzugleichen.
Historische Fraktionen sind keine aktuellen Bundestagsfraktionen.

## Ergänzungen und Grenzen

Vorbereitet sind 24 amtliche Ausschuss-RSS, elf Fachfeeds, vier geprüfte Partei-RSS,
neun gleichartig definierte Partei-Suchwege und 30 amtliche Landeszugänge. Die
technischen Prüfbelege stehen in `seeds/fachfeeds-verifiziert.json` und
`seeds/landesmodule-pruefbelege.js`. Fehlende Datumsfelder, veraltete Feeds und offene
Nutzungsbedingungen sind ausdrücklich vermerkt. Ein technischer RSS-Erfolg ist
keine Freigabe für kommerzielle Textnutzung.

Für Bremen, Hamburg, Mecklenburg-Vorpommern, Rheinland-Pfalz, Saarland, Sachsen,
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

Validierung: 25 Offline- und 25 PostgreSQL-Prüfungen des Ergänzungsplans sowie
9 Offline- und 29 PostgreSQL-Prüfungen der begrenzten Korrektur. Hinzu kommen die
Fach-/Parteizuordnung, Landesparser, Betriebsabdeckung, echte Cron-Abschlusswege
und Verwaltungsanzeige einschließlich fehlender Daten und HTML-Escaping.

Merge/Deployment, Einspielen des Ergänzungsplans und Freigabe neuer Abrufwege sind
noch offen. Der Code allein ändert den relationalen Quellenbestand nicht.
