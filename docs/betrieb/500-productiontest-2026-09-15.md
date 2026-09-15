# Tatsächlicher Production-Test am 15./16. September 2026

Die ausdrückliche Startfreigabe ersetzt den früheren Halt vor Aktivierung. Keine Zwischenstufen, keine erneute Provisionierung und keine parallelen Ausführer. Der vollständige historische Bereitschaftsbeleg bleibt in [500-startbereitschaft-2026-09-15.md](500-startbereitschaft-2026-09-15.md) erhalten.

## Tatsächlicher Start und verbindliches Ende

Reaktivierung34962357883 erfolgreich:495 Schreibversuche,495 bestätigt. Unabhängig exakt500 aktive Zielprofile,504 Profilzeilen. Die fünf bestehenden aktiven Profile, vier übrigen inaktiven Profile, Konten und Identitäten sind unverändert. Erste Aktivierung15.09.14:16:15.844Türkei/13:16:15.844Berlin/11:16:15.844UTC; vollständige500 ab14:25:00.479Türkei/13:25:00.479Berlin/11:25:00.479UTC.

Unverändertes festes Ende16.09.14:00Türkei/13:00Berlin/11:00UTC. Die spätere Aktivierung verschiebt das Ende nicht. Der vorhandene GitHub Timer wartet ab10:43UTC auf11:00UTC und fordert einmal den bestehenden495er Abschluss an. Tatsächliche Vorprüfungsdispatches34959657667 und34959679666 waren erfolgreich und rein lesend. Zusätzliche dauerhafte Begleitung und Endkontrolle sind aktiv; die Endkontrolle beginnt10:40UTC. Keine bezahlte oder lange Arbeit ab10:00UTC; Steuerung bis10:30UTC freigeben. Bei unbekanntem oder laufendem Abschluss keinen zweiten Auftrag starten. Nach bestätigter Deaktivierung alle495 exakten Kennungen sowie die geschützten Bestände unabhängig lesen und die Testautomationen beenden.

## Nachweisstand

Appworkflow34963417569 hat500/500 gelesen:497 fehlen, zwei ohne vollständige Lage, ein strukturell vollständiges altes B055 Ergebnis. Null neue vollständige Testbriefings nachgewiesen. Keine technische Quittung ersetzt die Inhaltsprüfung. Erste kontrollierte Pipeline34964311237 abgeschlossen:456 erledigte Jobs, keine Fehler. Native Warteschlange11:43UTC:500 Projektionen fällig12:00–17:59UTC,500 Materialisierungen18:00–21:35UTC. Das sind keine fertiggestellten Ergebnisse.

Wortlautprüfung fand eine falsche Zuschreibung eines namentlichen Gastbeitrags an die Zeitung, fehlende Lageabsätze, eine leere Handlung bei angezeigtem sofortigem Reaktionsbedarf, einen möglichen doppelten Quellenbeleg und unklare Trennung eines historischen2004Urteils vom aktuellen Bericht. Befunde privat gesichert; noch nicht als behoben behaupten. Quellen, Aussagen, Zuschreibung, Aktualität, zeitliche Einordnung, Profilbezug, Auswahl, Wiederholung und fehlende Ergebnisse bleiben je tatsächlichem Ergebnis zu prüfen.

Tagesbuch11:43:36UTC:378929 MikroUSD verbraucht,424000 alte offene Reserve,802929 gebunden. Neue24 Aufrufe im Testfenster158885 MikroUSD, davon14 reguläre Rückstandsaufrufe91898 und10 kontrollierte Pipelineaufrufe66987. Vorbereitung separat. Vor jedem Modellaufruf erneut vollständige konservative Deckung unter4USD jeUTC Tag verlangen. Ungeklärte Altaufrufe weder wiederholen noch ausbuchen.

## Befristeter fachlicher Nurleser

Der alte Modus `eingabe` bleibt auf inaktive synthetische Profile beschränkt. Der neue `eingabe-500` ist ausschließlich innerhalb des oben tatsächlich begonnenen Testfensters für die unabhängig bestätigte exakte aktive500er Menge bestimmt. Die fünf privaten Originalkennungen stehen nicht im öffentlichen Quelltext; der feste kanonische Zielhash bindet sie gemeinsam mit den495 Repo-Kennungen. Ein bloß gleicher Zähler reicht nicht.

Nach exaktem Merge, grünen Pflichtgates und unabhängig bestätigtem Production READY: vorhandenen Workflow `500-zugangspruefung.yml` einmal auf main aufrufen. Productioncommit und Berliner Briefingtag setzen, private Inhaltsprobe und `pruefeingabe_500` wählen, Position in der sortierten500er Menge sowie Anzahl1–3 angeben und einen öffentlichen RSA3072 SPKI Schlüssel als Base64 übergeben. Den privaten Schlüssel ausschließlich lokal geschützt erhalten. Diese Lesemenge ist keine Aktivierungszwischenstufe. Der alte B055 Einzelauftrag wird nicht benutzt.

Der bestehende private Leser ergänzt gespeicherte Belege um die echte Production-Eingabe desselben Mandats. GET ist Cron-authentisiert, commitgebunden und liegt vor Account-/Tracking-Vorläufen. Exakte Zielidentität, aktive Profile, Kostenkonfiguration, Kommunikationssperre und fehlende aktive Prozesse/Leases/Sperren werden geprüft. Der echte Production-Builder liest zweimal bei gleicher Referenzzeit; Profil- und Eingabedrift brechen ab. Das belegt Lesegleichstand, keinen transaktionalen Snapshot. Fehler geben keine Inhalte oder Secrets aus. Übertragung nutzt den vorhandenen RSA/AES-GCM Transport; zusätzlich tatsächlichen Actions-Job, Commit und Rückgabekontext prüfen, denn öffentliche Verschlüsselung ist keine Absendersignatur.

Keine Modellaufrufe, Profilwrites, Urteilsimporte oder positive Fachquittungen. Anzahl und Einmalversuch sind begrenzt; die gemeinsame Actions-Concurrency schützt vor gleichzeitigem kontrolliertem Fachlauf. Vor jedem späteren bezahlten Textnachlauf braucht es echte, vollständige und exakt gebundene Fachurteile. Fehlende Urteile werden nicht erfunden. Auch ohne volle Abnahme endet der Test zum festen Zeitpunkt; Lücken und Kosten ehrlich berichten.

## Konkreter CI-Abbruch und Korrektur

CI34967754746 am ersten PR415 Head endete mit390/391, genau eine fehlgeschlagene Timeout-Klassifikation. Browser50 und Kontoschutz15 bestanden; Z22 wurde wegen des Fehlers nicht ausgeführt. Kein Merge und kein blinder Wiederholungslauf. Der rohe Kindprozessfehler fehlte im bisherigen CI-Auszug; seine konkrete Millisekunde ist daher nicht belegt.

Die bereits unter OP-28 dokumentierte Ursache wurde vor Änderung deterministisch reproduziert: Ein Timeout-Endpunkt mit `.401Z` wurde als `auth` klassifiziert. Die Korrektur erkennt401/403 nur als strukturierte Statuswerte oder ausdrückliche HTTP-Fehlermeldung. Zeitstempel, Portnummern und DNS-Namen mit diesen Ziffernfolgen behalten ihre tatsächliche Fehlerklasse. Echte Zugangsfehler bleiben gesperrt. Zusätzlicher Regressionstest, bessere Timeout-Diagnose und vollständige neue Pflichtgates vor dem aktualisierten PR-Stand; fehlgeschlagenen Vorgänger erhalten.

Der lokale Folgelauf hatteExit1 bei unvollständiger umgeleiteter Logdatei und wurde nicht grün gewertet. Eine anschließende vollständige direkte Diagnose belegte389/392 in621s: ausschließlich drei historischeB055 Prüfungen erwarteten die aktuelle `storage.js` byteidentisch zum gepinnten Vorgänger. Die vollständige Datei aus Commit `e7501a4b7cc010d2661cb0d7f34a6b259d07bb75` ist jetzt komprimiert als unveränderte Offline-Testfixture erhalten, mit dem ursprünglichen SHA256 `d34f24f396c7939443b023e1ca9098d86bdd6111ecef675e54daab37de9be888`. Produktionspins und alte Aufträge bleiben unverändert. Die historischen Tests prüfen ihren echten Vorgängercode und zusätzlich die Ablehnung des neuen Codes vor jedem Transport. Kein alterB055 Auftrag wird wieder gestartet. Die Statuszahlkorrektur erhält zusätzlich eine Mutationsprobe gegen die frühere Heuristik.
