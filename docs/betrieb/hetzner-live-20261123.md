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
