# Helmut Mandantenfähigkeit

Stand: Pilotbetrieb.

## Jetzt

- Ein Pilotprofil läuft hinter `PILOT_SECRET`.
- Supabase speichert den Helmut-Store persistent.
- Alle Daten sind bereits profilbezogen strukturiert, aber noch nicht vollständig relational getrennt.

## Vor 20 zahlenden Abgeordneten

1. Echte Auth einführen.
2. Jede Anfrage einer `user_id` und `politician_id` zuordnen.
3. Supabase-Tabellen relational nutzen:
   - `profiles`
   - `mandate_profiles`
   - `political_items`
   - `personalized_recommendations`
   - `daily_tasks`
   - `communication_drafts`
   - `user_notes`
   - `priority_changes`
4. Row Level Security aktivieren.
5. Service-Role-Zugriff nur serverseitig verwenden.
6. Pilot-Gate entfernen, sobald echte Auth aktiv ist.

## Regel

Keine Empfehlung, Aufgabe, Notiz oder Quelle darf ohne Mandantenbezug gespeichert werden.
