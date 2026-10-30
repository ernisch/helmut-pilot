# Helmut: bestaetigte Production Speicherbasis

**Stand:** 30.10.2026. Diese Datei haelt die vom Betreiber bestaetigte Infrastruktur fest. Sie ist eine Planungsgrundlage und keine Aenderung eines freigegebenen Pruefvertrags.

## Istzustand

| Dienst | Konfiguration | Speicher | Beleg und Aussagegrenze |
| --- | --- | --- | --- |
| Vercel, Projekt `helmut-pilot` | Funktionseinstellung laut Betreiber | **2 GB je Funktionsinstanz** | Betreiberbestaetigung vom 30.10.2026. Kein daraus abgeleiteter gemessener Verbrauch; keine unabhaengige API Bestaetigung des konkreten Funktionslimits |
| Supabase, Projekt `ernisch's Project` | **Micro** im Pro Tarif, Region `eu-west-1` | **1 GB fuer die Compute Instanz** | Betreiber Screenshot des Projekt Dashboards vom 30.10.2026; offizielle Supabase Tabelle `Compute and Disk` bestaetigt Micro mit 1 GB |
| Supabase, moegliche spaetere Variante | **Small** | **2 GB fuer die Compute Instanz** | Reine Option, aktuell NICHT gebucht oder freigegeben; niemals still umstellen |

Quelle zu den Supabase Instanzgroessen: https://supabase.com/docs/guides/platform/compute-and-disk

**Begriffsklaerung:** Die 1 GB bei Supabase gelten fuer die Compute Instanz mit Betriebssystem und Diensten, nicht als garantiert frei verfuegbarer RAM ausschliesslich fuer PostgreSQL. Die 2 GB bei Vercel gelten fuer eine Funktion bzw. Instanz, nicht als gemeinsames Speicherbudget fuer alle 500 Profile. Mehrere gleichzeitig laufende Instanzen sind eigene Ressourcen und haben eigene Kosten und Grenzen.

## Getrennte lokale Simulation als zusaetzlicher Pruefpfad

Eine aussagekraeftige vorbereitete Lastpruefung darf die Bereiche separat begrenzen:

1. **Datenbankseite:** eigene isolierte Ressourcenbegrenzung entsprechend Supabase Micro 1 GB. PostgreSQL, notwendige Hilfsdienste und der unvermeidbare Systemanteil muessen innerhalb dieser Grenze beruecksichtigt werden oder explizit als Abbildungsdefizit ausgewiesen werden.
2. **Helmut Anwendung:** eigene Begrenzung entsprechend 2 GB je modellierter Vercel Funktionsinstanz. Gleichzeitigkeit und Instanzzahl explizit festlegen; nicht 500 Profile mit 500 Instanzen gleichsetzen.
3. **Testinfrastruktur:** GitHub Runner, Orchestrator, Kopien, Verschluesselung, Backup und Dateicache separat erfassen. Ihre Werte sind weder Supabase noch Vercel zuzurechnen. Gemeinsame Kernelwerte und Prozess PSS nicht addieren.
4. **Abnahme:** alle 500 gleichzeitig aktiven synthetischen Profile, saemtliche vorgesehenen 1500 Ergebnisse, 8000 Sicherheitskontrollen sowie Vollstaendigkeit, Qualitaet, Zeit, Ressourcen, Rueckfuehrung und Fehlerkategorien gesondert belegen. Ein lokaler Test unter passend begrenzten Ressourcen ist ein starker Kapazitaetsbeleg, aber **kein direkter Production Nachweis**.

**Istzustand im Code:** W15 End500 verwendet derzeit einen gemeinsamen cgroup Speicherwaechter mit 2.560.000.000 Bytes hartem Limit, maximal 2.048.000.000 Bytes Peak und 512.000.000 Bytes Reserve. Mock500 v2 verwendet 2.048.000.000 Bytes hart, maximal 1.638.400.000 Bytes Peak und 409.600.000 Bytes Reserve. Diese beiden Messungen trennen Datenbank und Vercel Anwendung nicht in zwei eigene Production nahe Budgets. Die optionale Rollenaufteilung aus PR #991 ist noch kein ausfuehrbarer getrennter Ressourcentest.

**Freigabegrenze:** Diese Dokumentation setzt KEINE neuen RAM Grenzwerte, keine neuen Gueltigkeitsbedingungen, keine Anpassung an Testcode und kein GO fuer Originaltests oder Production. Keine historischen FAIL oder UNKNOWN in PASS umdeuten. Eine Aenderung des verbindlichen End500 oder Mock500 Pruefvertrags braucht eine konkrete neue Abnahme und ausdrueckliche Betreiberfreigabe. Production Supabase bleibt Micro; Vercel bleibt bei 2 GB.
