# Blocker4: unabhaengige Endsteuerung

Auftrag: lebender Endwaechter, korrekte Authentifizierung, Fristende, Notstopp,
Rueckfuehrung auf0aktive Zielprofile und Vorbereitung der konkreten Fensterbindung.
Keine Aktivierung und kein500er Production-Test. Kein Merge ohne konkrete Freigabe.

## Rein lesender Ausgangsbefund

07.10.2026,10:41:49UTC /13:41:49Europe/Istanbul:500Zielprofile/0aktiv,
IDs-SHA256 `4d6d7b169831128cc69f0f3beb04c2fe05b57b7b4f528934b52e5c155f54e258`,
keine Synthetik-Runtime-Envelopes. Bestehende Synthetik-/Realkohorten-End-RPCs
installiert, SECURITY INVOKER, EXECUTE nur postgres/service_role;
anon/authenticated ausgeschlossen. Synthetik-Endworkflow:0Runs. Lokale
Service-/Cron-Secrets fehlen; GH-Secrets-Leserecht403. pg_cron1.6.4 verfuegbar
und vorgeladen, aber nicht installiert. Keine fremden Profiltrigger vorhanden.
Main/READY beim Start `416cb2f1028203df1fe05ff8580bb1a23a7f36b8`.

## Fehlende Teile und eng begrenzte Umsetzung

Die bisherigen Endwege benoetigen ein fertiges Startmanifest samt Quittungen;
der GitHub-Waechter hat keinen expliziten Operator-Notstopp. Beide bleiben
erhalten. Die zusaetzliche Endsteuerung laeuft als SQL-Job alle30s in derselben
bestehenden Supabase-Datenbank. Kein Codex-Prozess, GitHub-Runner, Vercel-Runtime,
HTTP-Dienstschluessel oder Modellaufruf ist fuer den Friststopp erforderlich.
Es wird keine neue kostenpflichtige Infrastruktur angelegt.

Die Installation erzeugt ein privates Schema, zwei RLS-geschuetzte kleine Tabellen,
drei service-only invoker RPCs und zwei Profiltrigger. Sie verlangt500inaktive
Ziele mit exakt den kanonischen Generator-IDs. Der Job beginnt ungebunden im
Standby und schreibt ausschliesslich seinen eigenen Heartbeat. Fuer eine Bindung
muessen mindestens zwei echte erfolgreiche Scheduler-Runs innerhalb90s vorliegen.

`helmut_end500_binden` bindet eine neue operationId, den privaten Manifesthash,
Production-Commit und Start/Ende (maximal4h). Es aktiviert kein Profil und erzeugt
kein Test-GO. Genau ein Fenster darf offen sein. Verbrauchte operationIds bleiben
gesperrt. Nach Fristende deaktiviert der Job ausschliesslich die festgelegten
500Zielkennungen und schliesst die Bindung atomar. Fachfelder, Startquittung und
teilweise Aktivierung koennen diesen neuen Endweg nicht sperren.

`helmut_end500_notstopp` verlangt die exakte Operation/Manifestbindung und
`GEBUNDENE_SYNTHETIK500_NUR_DEAKTIVIEREN`. Derselbe Stopp ist idempotent; ein
alter Endauftrag darf ein neueres Fenster nicht beenden. Profiltrigger verhindern
Aktivierung ohne offenes Fenster, nach Fristende oder nach Notstopp sowie das
Umbenennen einer Zielkennung. Die vorhandenen Aktivierungs-/Budget-/Test-Gates
werden dadurch nicht ersetzt. Gleichzeitige Writer und Endsteuerung verwenden
dieselbe Sperrreihenfolge: Profiltabelle vor Bindungszeile.

## Authentifizierung und Operatorweg

Der Scheduler laeuft mit der bestehenden Datenbankidentitaet postgres; frische
`cron.job_run_details` muessen seine tatsaechliche Verbindung/Execution belegen.
Die Public-RPCs sind nur postgres/service_role zugaenglich. Die Dienstrolle darf
weder private Tabellen direkt aendern noch Scheduler-Jobs erstellen oder tick
ausloesen. Definer-Helfer liegen im nicht exponierten privaten Schema, mit festem
search_path. Es werden keine Zugangsschluessel in Git, Logs oder Ausgaben gespeichert.

Ein authentifizierter Supabase-Management-Zugang beziehungsweise der SQL-Editor
des vorhandenen Projekts ist der Operator-Rueckweg, auch bei nicht erreichbarer
Vercel-/GitHub-Runtime. Dort zuerst `select public.helmut_end500_status();`, dann
einmal den exakt gebundenen Notstopp aufrufen und den Status separat gegenlesen.
Die feste Confirmation ist eine Bedienungssperre, kein Authentifizierungsschluessel.
Ein separater PostgREST-Bearer-Test ist mit den fehlenden lokalen Dienstschluesseln
nicht moeglich; der SQL-Scheduler benoetigt diesen Transport nicht.

## Spaetere Testfensterbindung

Die Vorlage in [end500-testfenster-vorlage.json](end500-testfenster-vorlage.json)
enthaelt bewusst keine erfundenen Laufwerte. Erst beim konkret freigegebenen Lauf
werden die echten Werte gebunden; anschliessend frischen DB-Status gegenlesen und
mit [dem Belegadapter](../../lib/helmut/end500-waechter-beleg.js) in den bestehenden
Endwaechter-Belegvertrag ueberfuehren. Er prueft Operation/Hash/Commit, dieselben
Fenstergrenzen,0aktive Ziele, Schedulerstatus und frische echte Runs. Der Original-
Status samt SHA256 und der echte RPC-Definitionshash bleiben Primaerbelege.
Das ist kein Aktivierungs- oder500er Test-GO.

## Wirkung, Grenze und Rueckweg

Friststopp erfolgt beim naechsten30sTick. Der SQL-Befehl setzt15s Statement- und
3s Lockgrenzen. Ein gesperrter/ausgefallener Datenbankserver kann waehrend des
Ausfalls nicht beschrieben werden; nach Wiederkehr versucht der persistente
Scheduler das faellige atomare Ende erneut. Manuelles Stoppen setzt keinen
erfolgreichen Start oder aktuellen App-Deploymentzustand voraus. Ein geplanter
SQL-Job allein ist kein Lebendbeleg: frische erfolgreiche Runs sind erforderlich.

[Rollback](../../supabase/migrations/rollback_20261007104720_synthetik500_unabhaengiger_endwaechter.sql)
verweigert ein offenes Fenster oder aktive Ziele. Nach bestaetigtem0-Zustand
entfernt er ausschliesslich den eigenen gebundenen Job, entfernt die eigenen
Trigger/RPCs/Tabellen und nur eine von ihm selbst neu installierte pg_cron-
Extension, falls inzwischen keine fremden Jobs existieren. Profile bleiben erhalten.
Vor Rueckbau die Bindungs-/Heartbeat-Belege sichern. Keine automatisch ausgefuehrte
Migration beim App-Start oder Deployment.

## Abnahmebelege

Installation und Production-Abnahme stehen noch aus. Die konkrete kontrollierte
Production-Qualifikation wird nur zwei kurze Endfenster mit bereits0aktiven
Zielen verwenden: ein automatisch ablaufendes Fenster und einen Operator-Notstopp.
Keine Profilaktivierung;500->0 und die Writer-Race werden ausschliesslich mit
kuenstlichen Daten in isoliertem PostgreSQL17/pg_cron geprueft.

Lokale Belegadapter-Pruefung17/17 und Migrationsorganisation56/56 bestanden.
Der erste echte Cron-Test fand und reproduzierte einen Background-Worker-Fehler
bei explizitem BEGIN/COMMIT im Jobcommand. Korrigierter Job nutzt SET/SELECT ohne
Transaktionsklammer; echte isolierte PG17.6/pg_cron-Abnahme12/12bestanden:
zwei Scheduler-Runs, automatische Frist500->0, Notstopp500/499->0 trotz
Fachdrift, Rechte, Idempotenz, Reaktivierungsriegel, Writer-Race und Rueckweg. Bereichsauswahl hat zwei
vorbestehende Zaehlerfehler106vs145; STANDARD ist bytegleich zu main. Diese zwei
Checks sind kein Beleg fuer eine Standardmengen-Aenderung durch diesen PR.
