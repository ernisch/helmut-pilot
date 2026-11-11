# Quellenautomatik nach belegtem Bedarf (vorbereitet, 11.11.2026)

Betreiberauftrag: Die morgens vorhandenen acht Termine sollen nicht pauschal
acht Arbeitsfenster verbrauchen. Nach erledigter Arbeit oder einem Startfehler
stoppen; echte Restarbeit fortsetzen. Bestehende Tages-, Zeit-, Originalabruf-
und Geldlimits erhalten. Kein Productioneingriff aus der Vorbereitung ableiten.

## Kleinster Eingriff

Die acht bisherigen Crontermine bleiben unverändert als Kontrollpunkte.
Nach dem vorhandenen Worker-Vorflug unter derselben exklusiven worker-drain-
Lease wird vor jeder automatischen Kontingentreservierung rein lesend geprüft:

- Tagesplan und bestätigte ältere Planreste aus dem bestehenden Manifestjournal.
- Heutige relationale Crawl-/Pipeline-Laufquittungen und vorhandene Fenster-/
  Slotreservierungen, einschließlich Adminslots. Unvollständige Reservierungen
  oder fehlende Laufquittungen ergeben UNKNOWN, keine erneute automatische Arbeit.
- Offene und tatsächlich übernehmbare Queuejobs. Quellenmodus und zulässige
  Worker-Typen bleiben maßgeblich; ausgeschöpfte Versuche sind kein Arbeitsbedarf.
- Heutige endgültige Jobfehler verhindern eine Entwarnung nach einem leeren
  späteren Lauf. Historische Altfehler werden nicht pauschal neu gesperrt.

Ohne Tagesplan und ohne bisherige Reservierung darf der erste Tagesstart planen.
Bei bestätigten Planresten oder übernehmbaren Queuejobs darf die Automatik
fortsetzen. Nach Fehler/unklarem Ausgang stoppt sie. Noch nicht fällige oder
gesperrte Aufträge werden als wartend angezeigt; fertiger Plan ohne offene Jobs
als ohne offene Arbeitsaufträge. Das ist kein Quellenqualitäts-/Versorgungsnachweis.

Ein regulärer Planungszeitrest wird nur dann als fortsetzbare Teilquittung
markiert, wenn bestätigter Fortschritt vorliegt und keine Worker-, Lease-,
Übernahme-, Rückstellungs- oder Spiegelfehler bekannt sind. Eine Unterbrechung
allein ist keine neue Freigabe. Fehlt diese enge Bestätigung, bleibt der Stopp.

Der explizite manuelle Einstieg erhält weiterhin seine bisherigen Berechtigungs-,
CSRF-, Lease-, Idempotenz-, Kontingent- und Budgetprüfungen. Er setzt nichts zurück.
Eine erfolgreiche bestätigte manuelle Reparatur kann den letzten Fehlerbefund
ablösen; heutige weiterhin fehlgeschlagene Jobs bleiben ein Stoppsignal.
Keine automatische Erhöhung, Reserve oder Erstattung. Acht Fenster und maximal
2400 reservierte Sekunden bleiben die unveränderte Obergrenze; bestehende
kleinere konfigurierte Grenzen und Geldlimits gelten zusätzlich.

Der bestehende Adminleser sources-status liefert den Automatikgrund additiv.
Die ausgelieferte Originalverwaltung zeigt ihn unter Betrieb → Quellen.
Nur technische Metadaten verlassen den neuen Leser, keine Payloads oder Secrets.

## Prüfungen und Grenzen

Gezielt über scripts/lokal.js: 15 Automatikgruppen, 5 Gruppen der echten lokalen
Cronroute, 21 bestehende Arbeitsfenstergruppen, 9 bestehende Cronroutengruppen,
17 Adminstartgruppen einschließlich Originalbrowser bei1280/390/320px sowie
sichtbarem Automatikstopp; Manifestjournal8 und Verwaltungsregression5 bestanden.
Tests verwenden ausschließlich Ersatzantworten und lokale Server. Pflicht-CI und
unabhängiges Review auf dem tatsächlichen PR-Endkopf bleiben maßgeblich.

Der Kandidatenleser betrachtet maximal101 fällige Jobs. Enthält eine volle Probe
keinen zulässigen Treffer, bleibt der Zustand UNKNOWN; sie beweist keine leere
Warteschlange. Reservierungs-/Quittungsabweichungen stoppen konservativ, auch
wenn eine Ursache nachträglich harmlos erscheinen könnte. Fehlende oder unklare
Arbeit wird niemals durch Zurücksetzen historischer Zähler erneut freigegeben.

Keine Migration, neue Tabelle, Infrastruktur, Flags oder Cronänderung.
Kein Merge, Deployment, Quellenabruf, kostenpflichtiger Modellaufruf oder
gesonderter Massenlauf in diesem Auftrag. Branchdeployment explizit deaktiviert.
Nächster Schritt: konkreten PR bei grüner Endkopf-CI abnehmen; Rollout braucht
gesonderte Freigabe. Rückweg: nur diese Bedarfsprüfung und ihre Anzeige gezielt
revertieren; historische Reservierungen, Quittungen und Manifeste erhalten.
