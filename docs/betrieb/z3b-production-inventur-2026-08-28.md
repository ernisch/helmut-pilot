# Z3b Production Inventur fuer den Aufnahmebeweis bis 500

> **Stand-Nachtrag 29.08.2026:** Diese Inventur ist ein datierter 28.08.-Schnappschuss.
> Seitdem überholt: **Z22 samt Vorwärtskorrektur ist seit dem 29.08. in Production
> angewendet** (Buchungen `20260829175642`/`20260829175749`, Historie jetzt 35 Einträge) —
> „F9 und `crawl_runs` nicht angewendet" gilt weiter, „Z22 nicht angewendet" nicht mehr.
> Aggregierte Zähler vom 29.08. (rein lesend): 3.330 Aufträge (3.122 erledigt, 208 wartend,
> 0 laufend, 0 fehlgeschlagen), CAS 653 fertig · 1 unbekannt · 1 aufgegeben · 1 offen;
> das natürliche Fünfertor bleibt rot.

## Zweck und Beweisgrenze

Diese Inventur wurde am 28.08.2026 ausschliesslich lesend gegen das bekannte
Production Projekt erhoben. Sie liest nur Tarif, Projektmetadaten, Katalogobjekte,
aggregierte Groessen und technische Zaehler. Sie liest keine Mandatskennungen,
Namen, Inhalte, Prompts oder Zugangsschluessel und fuehrt keine Migration,
Loeschung, Sicherung, Wiederherstellung oder Konfigurationsaenderung aus.

Die Inventur beweist den beschriebenen Production Iststand zum jeweiligen
Erhebungszeitpunkt. Sie ist weder ein siebentaegiger Betriebsnachweis noch ein
Fachweg oder Aufnahmebeweis fuer 500 Mandate.

## Plattform und Tarif

| Merkmal | Lesend erhobener Iststand |
|---|---|
| Organisationstarif | `free` |
| Projektstatus | `ACTIVE_HEALTHY` |
| Region | `eu-west-1` |
| PostgreSQL | `17.6` |
| Release Kanal | `ga` |
| Tabellen im Schema `public` | 51 |
| RLS | auf allen 51 Tabellen aktiv |
| Datenbankgroesse | 177.474.707 Byte |
| Gesamtgroesse der Tabellen in `public` | 163.102.720 Byte |
| Storage API | 0 Objekte, 0 Byte |

Der aktuelle Free Tarif nennt 500 MB Datenbankgroesse je Projekt. Damit sind
nominal etwa 322,5 MB bis zu dieser Tarifgrenze frei. Dieser Abstand ist keine
Kapazitaetszusage fuer 500 Mandate: das Wachstum unter 500 echten Mandaten und
wirksamer Aufbewahrung wurde nicht gemessen. Free Projekte haben ausserdem keine
nativen herunterladbaren taeglichen Datenbanksicherungen. Ein passender Tarif,
die gewaehlte RPO Zusage und ein geuebter aktueller Restore bleiben deshalb
Aufnahmebedingungen.

Aktuelle Produktgrundlagen:

1. Supabase Billing: <https://supabase.com/docs/guides/platform/billing-on-supabase>
2. Supabase Backups: <https://supabase.com/docs/guides/platform/backups>
3. Supabase Production Checkliste: <https://supabase.com/docs/guides/deployment/going-into-prod>

## Vercel Zugriffsgrenze

Der vorhandene rein lesende Vercel Kanal zeigt das Team `Nohut` im Tarif `pro`,
liefert aber keine Projektliste. Auch die Abfrage nach `helmut-pilot` und der
bekannten Deployment Adresse fand kein fuer diesen Kanal sichtbares Projekt.
Damit ist nur der Teamtarif sichtbar, nicht die Zuordnung des Helmut Production
Projekts zu diesem Tarif. Projektplan, Fluid Compute, Laufzeitnutzung, Kosten,
Umgebungswerte und Logs bleiben offen. Es wurde keine Vercel Anmeldung, kein
Deployment und keine Konfigurationsaenderung ausgeloest.

## Lokale Betriebsvertraege, kein Production Vollzug

Der lokale Arbeitsstand bindet alle 51 Production Tabellen im Backupinventar:
Export 74 PASS, reine Dateikopie 56 PASS und lokaler Verifier 86 PASS. Der
sequenzielle REST Export ist jedoch kein transaktionaler Snapshot, die Dateikopie
kein Datenbank Restore und Remote REST konstruktiv gesperrt. Ein aktueller,
querschnittskonsistenter Vollbackup und ein echter isolierter Restore fehlen.

Der Aufbewahrungsplan steht lokal bei 53 Assertions plus 5 Storage Pruefungen.
Der paginierte Offset REST Abzug beweist keinen atomaren Stand und bleibt deshalb
nur Trockenlauf; der Executor erzeugt 0 DELETE. Ein spaeterer scharfer Pfad braucht
einen atomaren Datenbankvertrag oder belegten Schreibstopp und eigene Freigabe.

Der Provider Fachpfad steht lokal bei 86 PASS, die Google News Haertung bei
60 PASS. Redirect, Retry und Artikelaufloesung sind je Transporthop lokal
begrenzt; Hostklassifikation, Breakerschluessel und Vertagung bleiben
mitgeprueft. `TRANSPORT_GRENZEN_STATUS.proHttpVersuchGlobal` bleibt bewusst
falsch. Nichts davon ist deployt. Echter M1, Quote, Production Wirkung und die
Einbindung der Providerkapazitaet in das Aktivierungstor bleiben offen.

## Groesste Tabellen

Die Zeilenzahlen stammen aus den PostgreSQL Statistiken und sind deshalb als
ungefaehre Livewerte, nicht als exakte fachliche Zaehler zu lesen.

| Tabelle | Gesamtgroesse Byte | Geschaetzte lebende Zeilen |
|---|---:|---:|
| `gate_shadow_events` | 43.606.016 | 107.358 |
| `raw_documents` | 30.466.048 | 20.381 |
| `knowledge_objects` | 28.680.192 | 11.095 |
| `ko_document_links` | 20.570.112 | 49.571 |
| `document_findings` | 10.526.720 | 17.722 |
| `source_crawl_telemetry` | 9.854.976 | 33.289 |
| `helmut_store` | 4.587.520 | 12 |
| `helmut_jobs` | 4.194.304 | 2.693 |
| `decisions` | 4.169.728 | 5.646 |
| `knowledge_object_embeddings` | 1.335.296 | 772 |
| `helmut_job_outbox` | 819.200 | 2.458 |

## Warteschlange und Aufbewahrung

Der folgende Schnappschuss wurde waehrend laufendem Production Betrieb erhoben
und kann sich danach natuerlich veraendern.

| Bereich | Aggregierter Iststand |
|---|---|
| Auftraege | 2.693 gesamt, 2.500 erledigt, 193 wartend, 0 laufend, 0 fehlgeschlagen |
| Faellige Auftraege | 37 faellig, davon 0 mindestens 24 Stunden alt; 156 zukuenftig faellig |
| Aufbewahrung Auftraege | 235 erledigte Auftraege aelter als 14 Tage |
| Outbox | 2.458 gesamt, 225 offen, 100 bestaetigt, 2.133 verzichtet |
| Faellige Outbox | 69 offen und faellig, davon 0 mindestens 24 Stunden alt; 156 zukuenftig faellig |
| KI Reservierungen | 0 gesamt, 0 reserviert, 0 aelter als 30 Tage |
| Gate Telemetrie | 107.771 Zeilen vom 14.07. bis 28.08.; 0 aelter als 90 Tage |
| Quellen Telemetrie | 33.289 Zeilen vom 16.07. bis 28.08.; 0 aelter als 90 Tage |

Die vorhandenen Bereinigungsfunktionen haben keinen belegten automatischen
Production Aufrufer. Bei dieser Inventur wurde bewusst keine Bereinigung
ausgefuehrt. Vor einer Aktivierung fuer 500 muessen die rechtlich bestaetigten
Fristen, Trockenlaeufe, automatische Ausfuehrung, Schutzzaehler und das reale
Speicherwachstum gemeinsam belegt werden.

## Verstehens CAS Zustand

| Zustand | Anzahl | Aktive Leases |
|---|---:|---:|
| `fertig` | 568 | 0 |
| `unbekannt` | 1 | 0 |
| `aufgegeben` | 1 | 0 |

Damit bleibt das aktuelle natuerliche Fuenfertor rot. Der lokale Parserfix kann
diesen Production Befund erst nach Merge, Deployment und einem neuen natuerlichen
Lauf regressieren.

## Katalog und Advisor Befunde

Der Katalogabzug um 16:44:08 UTC belegt 51 Tabellen, RLS auf allen Tabellen,
24 Policies, 20 nicht interne Trigger, 62 eigene Funktionen und zwei Identity
Spalten. Die angewendete Migrationshistorie enthaelt 33 Eintraege. `crawl_runs`,
F9 und Z22 sind im Production Stand nicht angewendet.

Der Abzug ist nicht spaltengenau. Ein historischer Spaltenabzug zeigt Drift zum
Repository, wurde am 28.08. aber nicht aktuell bestaetigt. Deshalb darf selbst ein
zaehler- und hashgleicher 51er Export keinen exakten Struktur oder Restore Beweis
behaupten; dafuer fehlt ein neuer gehashter Spaltenkatalog.

Der aktuelle Supabase Advisor meldet:

1. Sicherheit: 27 Hinweise `RLS Enabled No Policy`, ueberwiegend fuer bewusst
   nur dem Backend zugaengliche Tabellen, sowie eine Warnung fuer die Extension
   `vector` im Schema `public`.
2. Leistung: 23 nicht durch einen Index gedeckte Fremdschluessel und 11 derzeit
   unbenutzte Indizes.

Die Hinweise sind keine automatisch bewiesenen Ausfaelle. Die fehlenden
Fremdschluesselindizes muessen vor 500 gegen die echten Schreib, Loesch und
Mandatsabfragen bewertet werden. Indizes werden nicht allein aufgrund eines
Advisor Hinweises entfernt.

## Ergebnis fuer den Aufnahmebeweis

1. Lokal bewiesen: rein lesende Inventurvertraege sowie fail closed Backup,
   Restore, Aufbewahrungs- und Providerpruefungen; kein scharfer Vollzug.
2. Isoliert gegen Supabase bewiesen: unveraendert nur der bereits abgeschlossene
   synthetische Plattformweg bis 500.
3. Vollstaendig im Fachweg bewiesen: durch diese Inventur nichts.
4. In Production bewiesen: heutiger Tarif, Region, Datenbankversion,
   Projektgesundheit, Katalogumfang, Groessen und aggregierter Queue Zustand.
5. Noch offen: Tarifentscheidung, Vercel Projektzustand, echte
   Speicherwachstumsmessung, wirksame Aufbewahrung, aktueller Spaltenkatalog,
   konsistenter Vollbackup, echter isolierter Restore, globaler Providertransport,
   Buero Fachpfad, Advisor Bewertung und der siebentaegige Realbetrieb jeder
   Stufe bis zum Abschlussfenster mit 500 Mandaten.
