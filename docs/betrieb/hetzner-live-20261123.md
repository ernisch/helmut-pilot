# Hetzner Quellenworker: erster produktiver Betriebsnachweis

**Datum:** 23.11.2026. **Zeitzone:** Europe/Berlin.  
**Quelle:** Rein lesende SQL Abfrage der Supabase Production Tabelle `public.process_runs` für `process = 'warteschlange-crawl'`; ergänzend Existenzprüfung der DLQ Tabelle.

## Nachgewiesene Produktionsläufe

| Start Berlin | Abschluss Berlin | location | status | processed_count | failed_count | deferred_count |
| --- | --- | --- | --- | ---: | ---: | ---: |
| 16:15:00 | 16:19:00 | `hetzner-de` | `partial` | 37 | 21 | 231 |
| 16:30:00 | 16:33:58 | `hetzner-de` | `partial` | 34 | 19 | 218 |

Zum Vergleich: Der Quellenlauf um 16:00:38 war noch als `fra1` eingetragen. Der neue Ausführungsort ist deshalb anhand tatsächlicher Laufquittungen belegt. Die Tabelle `public.helmut_quellen_dlq` existierte zum Prüfzeitpunkt. Die aktive DLQ Regel für jeden fehlerhaften Auftrag wurde durch diesen lesenden Nachweis **nicht** einzeln funktional verifiziert.

Der durch [PR #1324](https://github.com/ernisch/helmut-pilot/pull/1324) gebaute DLQ und Heartbeat Pfad sowie der durch [PR #1325](https://github.com/ernisch/helmut-pilot/pull/1325) eingeführte Quellenworker sind am 23.11. gemergt. Die Betriebsanleitung befindet sich in [hetzner-quellenworker.md](hetzner-quellenworker.md).

## Interpretation und Grenzen

- **Belegt:** Zwei produktive Quellenfenster liefen auf Hetzner, Quittungen liegen in Supabase, DLQ Tabelle ist vorhanden.
- **Nicht belegt:** 100 Prozent Quellenabdeckung, durchgängig fehlerfreier 24 Stunden Betrieb, fertig ausgeliefertes vollständiges Morgenbriefing, aktiver Vercel Environmentwert oder vollständige 100 Mandate Skalierung.
- **Bestehende Grenzen bleiben:** Der Worker unterliegt nicht dem Vercel Function Timeout. Er hat weiterhin fachliche Quellenfenster, Auftragsgrenzen, Besitzerprüfungen sowie Quoten und Kostenwachen. Keine Behauptung unbegrenzter Auftragslaufzeit.
- **Betriebsentscheidung laut Betreiber:** Der Quellen Normalbetrieb wurde auf Hetzner umgeschaltet; Vercel ist für Quellenarbeit ausschließlich geschützter manueller Rückweg. Die Environmentwerte wurden aus Sicherheitsgründen nicht ausgelesen oder dokumentiert.

Dieser Bericht ändert **keine** Production Daten, Cronzeiten, Secrets, Budgets oder Systemeinstellungen. Spätere Betriebsnachweise gehören weiterhin in [CURRENT_STATE.md](../CURRENT_STATE.md); historische Quittungen dürfen nicht nachträglich umgewertet werden.

## Lesende Störungsprüfung am 23.11.2026

Um 19:10 Uhr Berlin waren seit dem ersten Hetzner-Fenster 245 Quellenaufträge abgeschlossen und 589 Rohdokumente hinzugekommen. Es gab keinen neuen KI-Auftragsabschluss und kein aktualisiertes Wissensobjekt mit Modellangabe. Bei 2.155 der 2.156 wartenden Analysen war `verstehen-cas-erforderlich` gespeichert. Der verbleibende Auftrag wartete auf das Original-Tageskontingent.

Von insgesamt 775 fehlgeschlagenen Analysen hatten 170 seit der Umschaltung eine Aktualisierung und 133 einen Abschluss. 153 der aktualisierten Zeilen waren Diagnoseaufträge für Versionskonflikte. Rohzeile und angeforderte Archivkennung waren bei allen 153 vorhanden. Bei sieben hib-Meldungen folgte eine textlose Suchfundstelle auf ein bereits archiviertes und verarbeitetes amtliches Original. Für die übrigen Metadatenabweichungen ist keine allgemeine Gleichwertigkeit belegt. Der aktive DLQ-Trigger erfasst endgültig fehlgeschlagene `source_fetch`-Aufträge. Davon gab es bei der Prüfung keinen.

Der Betreiber bestätigte im laufenden Container deaktiviertes CAS, deaktivierte Einzeltelemetrie und eine fehlende Build-Kennung. Beide Schalter waren in Vercel Production eingeschaltet. Der letzte dortige Einzelbeleg stammte von 16:01 Uhr. In elf von zwölf Abdeckungsprüfungen lief die interne Lesefrist von 6,5 Sekunden ab. Die zwölfte meldete `faelligkeitsabgleich_unbekannt`. Ihre genaue Ursache geht aus der Quittung nicht hervor.

## Rollout von PR 1327 und regulärer Nachlauf

[PR #1327](https://github.com/ernisch/helmut-pilot/pull/1327) wurde um 19:35 Uhr auf `c6444d5462dfe23fc751daa7a2b5c983449b75ce` gemergt. Beide [Pflichtchecks](https://github.com/ernisch/helmut-pilot/actions/runs/45238311105) auf `a8e86252` waren erfolgreich. Der separat freigegebene Vercel-Build für denselben Merge erreichte die Produktionsdomain. [Deployment](https://vercel.com/nohut/helmut-pilot/7LSvYcMxcbADego48NHY1a2QiBD8)

Der Betreiber bestätigte den Neubau mit aktivem CAS und aktiver Einzeltelemetrie sowie die Build-Kennung im laufenden Worker. Das letzte Fenster des Vorgängers begann um 19:45 Uhr. Beim Startentscheid um 20:00 Uhr war noch kein Auftrag fällig. Der früheste Quellenauftrag war um 20:00:10 Uhr fällig, die früheste Analyse um 20:00:17 Uhr. Bei vorhandenen Fehleraufträgen meldete die Automatik dafür `automatik-startfehler`.

Das reguläre Fenster `cron-crawl-20261123191500-quz76` lief auf `hetzner-de` mit dem Merge-Commit von 20:15:00 bis 20:19:16 Uhr. Es gab drei abgeschlossene Quellenaufträge, drei erfolgreiche Einzelbelege und ein neu gespeichertes Rohdokument. Die Abdeckungsprüfung endete nach 10,843 Sekunden mit `partial` und `eingeschraenkt`. Sie meldete unter anderem 65 offene Abrufbelege und 24 fehlende Zuordnungen.

Bis 20:20 Uhr gab es seit Fensterstart keinen neuen Versionskonflikt und keine neue CAS-Vertagung. Es gab auch keinen KI-Abschluss und kein neues modellgestütztes Wissensobjekt. Bei 79 Analysen war der dritte Versuch an `betriebskosten-profilbindung-abweichend` gescheitert, weitere 131 warteten nach einem Fehlversuch. Die Prüfung liegt vor der Inhaltsbeschaffung und dem Modell. Der Rückgang der Warteschlange belegt hier keine erfolgreiche Abarbeitung.

Der lesende Abgleich mit der bestehenden Produktionszulassung ergab bei den Altprofilen und beim gemischten Lesen je 25 aktive geeignete Profile. 24 aktive Altprofile haben keine Entsprechung im relationalen Mandatsbestand. Von 501 relationalen Mandaten war genau eines aktiv. Der ausschließlich relationale Lesepfad bestand dieselbe Profilprüfung wie beim KI-Auftrag.
