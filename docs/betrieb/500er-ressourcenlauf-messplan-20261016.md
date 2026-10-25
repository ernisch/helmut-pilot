# Messplan für den einmaligen lokalen 500er-Ressourcenlauf

Stand: 16.10.2026. Status: vorbereitet, nicht ausgeführt.

Die aktuelle Betreiberfreigabe erlaubt insgesamt genau einen neuen isolierten
lokalen 500er-Ressourcenlauf inklusive notwendiger neuer Testkopie, nur bei
nachweislich verfügbarer ursprünglicher Umgebung, vollständigen Originalen und
erfüllten Sicherheitsvoraussetzungen. Das GO ist nicht additiv, kein Retry und
kein verbrauchter Auftrag. Hier fehlen ursprüngliche Arbeitsbereiche, lokale
Datenbanken, Gateways und sechs vertrauliche Eingabedateien; deshalb bleibt der
Start blockiert und das GO ungenutzt. Historisches OWNER_LOCAL_GO ist gesperrt.
Es wird nicht behauptet, dass ein Messharness implementiert oder unabhängig
abgenommen ist oder dass ein Test gelaufen ist.

## Laufziel

- 500 gleichzeitig aktive Profile: 330 BT / 120 BE / 50 BB.
- 1000 D-/R-Mockaufrufe, 0 echte Modellaufrufe und keine externen
  Anbieterzugriffe. Native HTTP-/Datenbankzugriffe bleiben auf das lokale Fixture begrenzt.
- Originaldaten (Dateien, DB, Historie) unverändert; Messung nur in neuer
  isolierter Kopie mit getrennter Historie und exklusivem Fixture.
- Jedes Ergebnisfeld einzeln als pass/fail/unknown mit Rohbeleg, SHA256,
  Commit und RunID.

## Vorbedingungen

Einmal vor dem Start nachzuweisen:

- Prozesssperre, Originalhash-Sperre, Netzwerksperre, kein Prodcredential im
  Kindprozess oder Messharness.
- Messharness separat abgenommen; PIDs je Gruppe erfasst; keine verwaisten
  Prozesse; Metadaten ohne Secrets.
- Technische Vorprüfung vollständig; keine Erhöhung von Sicherheits-, Timeout-
  oder Finanzlimits.

## Vollständige Messung

Alle Felder im SELBEN Lauf:

- RAM: cgroup-v2 `memory.peak` und `memory.current` inklusive aller App-,
  Root-, Worker-, Hilfs- und Messprozesse, ab VOR der Vorbereitung bis zum
  letzten Exit. Sampling-only ist keine Grünmeldung. Observer außerhalb der
  Gruppe werden ebenfalls bilanziert. Physische DB und Gateway separat messen
  und separat plus als Gesamtsumme ausweisen; keine neue RAM-Vertragsauslegung.
  Vertrag 2048 MB unverändert.
- CPU/Zeit: `cpu.stat` mit `usage_usec`, `user_usec` und `system_usec` je Gruppe, Laufzeit/Lebensdauer
  aller Prozesse, lokale CPU-Grenzen gegenüber Vercel vCPU-Sekunden. Phasen:
  Offline90 separat; Vorbereitung60; Unit60 bis finalem CAS-ACK; Auth30 für die
  gesamte Mutation.
- Native DB: `pg_database_size`, Relationen, TOAST, Indizes, Deadtuples,
  `pg_wal_lsn_diff` sowie physische WAL- und Temp-Spitzen. Exklusives Fixture;
  jede Messlücke wird als offen geführt, nicht als grün.
- Traffic: Wirebytes pro Richtung am Transport für Request, Response, Header,
  Errors, Exporte und CAS-Konflikte; Payload-only getrennt kennzeichnen.
- Weiteres: Log-/Dateiwachstum, Wächteraktivität, Messoverhead.
- 16 Kontrollen pro Profil = 8000. 1500 Positionen und 12000
  Kriterienpositionen werden aus Mocks nie als Modellqualität ausgewiesen.
- Jede übertragene Größe braucht eine Fehler-, Wachstums-, Concurrency- und
  Preisbasis. Die lokale Istmessung ist keine Production-Obergrenze.

## Abnahme und Kostenübertragung

- Rohbelege plus SHA/Commit/RunID; pass, fail und unknown getrennt; keine
  kostenpflichtigen Replays.
- Vercel-Budget 200 USD mit Auto-Pause aus und ohne Hard-Stop; 18 USD alt und
  6,94 USD Compute alt gelten nicht als aktuelle Deckung.
- Keine neue Architektur oder Limit-Erhöhung. Das bestehende lokale GO reicht
  innerhalb seines Umfangs; Production bleibt separat freizugeben.

## Sicherer Abschluss

- Rückweg auf 0 aktive Profile belegen; Originale unverändert bestätigen.
- Genau ein nächster Schritt: im ursprünglichen zugänglichen Workspace
  Vorbedingungen und Harness belegen; danach das vorhandene GO genau einmal
  nutzen.
