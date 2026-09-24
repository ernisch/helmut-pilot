# Kontrollierte Nacharbeit der vier unbekannten Vorgaenge

Stand: 24.09.2026. [PR #543](https://github.com/ernisch/helmut-pilot/pull/543) aus Branch `codex/verstehen-vier-nacharbeit-20260924` ist nach Nutzerfreigabe gemergt (14:34:22 UTC), Commit `1c70b4c162953280806ee2d74525894de1fed8f8`.
**Migration nicht angewendet; kein Dispatch, keine CAS-Freigabe und kein Production-Modellaufruf.**

Production-Nachkontrolle: Vercel `dpl_AUw8inmYwx9iM6EjsSyNCGKHix2J` READY, fra1, Production-Alias und derselbe Commit. Keine Runtime-Fehler im Fenster 14:34:22–14:35:20 UTC. Datenbank um 14:35:27 UTC: 504 Profile, 0 aktiv, keine unerledigten Jobs oder lebenden Understanding-Leases; alle vier CAS-Zustaende und KI-Zaehler unveraendert, neuer RPC nicht vorhanden, neue Quittung nicht angelegt. Kein fachlicher Erfolg der vier Faelle durch den Merge behauptet.

## Ausgangsbelege

Rein lesend am 24.09.2026 bestaetigt:
- [PR #542](https://github.com/ernisch/helmut-pilot/pull/542) gemergt, main `a44ab3aa1aaf043f389fd4b8488453d482b800eb`.
- [Post-Merge-CI 36007476404](https://github.com/ernisch/helmut-pilot/actions/runs/36007476404) SUCCESS, beide Pflichtjobs erfolgreich, Abschluss 13:49 UTC.
- Vercel `dpl_8XHujg4j5Bdcakdecpz1g4surSqL` READY, production, fra1, derselbe Commit; keine Fehler im geprueften Runtime-Fenster ab 13:42:27 UTC.
- Supabase-Aufnahme 13:57:35 UTC: 504 Mandatsprofile, 0 aktiv; alle 22709 Jobs erledigt; keine lebenden Job-/Understanding-Leases oder Pipeline-Locks.
- Die vier CAS-Zeilen weiterhin `unbekannt`, Besitzer/Lease null. Keine automatische Wiederaufnahme.
- Alte Quittung `verstehen169-20260924-c` weiterhin terminal `unbekannt`; 81 Aufrufe, 0,522795 USD laut Kostenbuch, keine offenen Kostenreservierungen dieses Laufs.

Damit ist Sprint #542 technisch ausgerollt und seine Pflicht-CI abgeschlossen. Ein neuer fachlicher Erfolg der vier Faelle ist dadurch **nicht** belegt. Parteienvalidierung bleibt strikt; neu sind sichere Schema-Diagnosen.

## Fallentscheidung vor einer spaeteren Freigabe

| Vorgang | Stand fencing / KI / Versuche | Ergebnis | Vorgehen |
|---|---|---|---|
| `vg-gemeinsame-20260921-dcd0f5` | 2 / 2 / 2 | kein aktuelles vollstaendiges KO | Ein neuer Versuch ist moeglich, aber ohne Erfolgsgarantie; Parteienpruefung unveraendert. |
| `vg-arbeitsplätze-20260715-6cc672` | 2 / 2 / 2 | altes vollstaendiges KO mit fencing 1 | Vorher fachlich entscheiden: drei Dokumente enthalten neben der Industrie-Meldung eine Thueringen-Kritik. Ein Ereignismix ist nicht ausgeschlossen. Altes Ergebnis ersetzt keinen Beleg fuer Versuch 2. |
| `vg-linkenpolitiker-20260921-37cdeb` | 1 / 1 / 1 | kein aktuelles vollstaendiges KO | Ein neuer Versuch ist moeglich; Quellenbeleg und Parteien bleiben streng. |
| `vg-verzögerung-20230613-95c80f` | 1 / 1 / 1 | kein aktuelles vollstaendiges KO | Meldung vom 13.06.2023, nur Titel, keine URL/Zusammenfassung im Bestand. Keinen blinden kostenpflichtigen Versuch empfehlen. Fachlich als ungeeignet zurueckstellen; ein dauerhaftes CAS-Aufgeben waere eine gesonderte Datenfreigabe und ist hier nicht implementiert. |

Keiner der vier Faelle kann aufgrund der vorhandenen Daten als erfolgreich `fertig` aufgeloest werden. Jeder neue Modellversuch braucht eine ausdrueckliche Freigabe fuer **genau seine Kennung** sowie CAS `erneut`. Rein lesende fachliche Ablehnung ist ohne Modellaufruf moeglich; sie veraendert den CAS-Zustand nicht.

Vorgeschlagen: hoechstens drei neue Aufrufe nach Quellenpruefung; der Bedienweg erlaubt eine ausdrueckliche Teilmenge von einem bis vier Faellen. Es gibt keine automatische Auswahl. Ein erfolgreicher Teillauf schliesst ausgeschlossene Faelle nicht mit ab.

## Feste Grenzen und Stopbedingungen

- GPT-5-mini/Azure, unveraenderte Validatoren, keine neuen Quellenabrufe.
- Maximal ein Provider-Versuch je ausgewaehltem Vorgang, insgesamt maximal vier.
- Maximal **0,30 USD** gebundene Laufkosten, maximal **20 Minuten** ab Runner-Start. Vor jedem Vorgang und Provider-Versuch muss zusaetzlich die volle bestehende Reservierung (gegenwaertig 0,212 USD) Platz haben. Deshalb koennen bei hohen Einzelkosten weniger als vier Faelle laufen.
- Zur Einordnung: groesster Einzelbetrag des vorigen Laufs 0,00992 USD; vier solche Aufrufe waeren 0,03968 USD. Das ist keine Kostengarantie. Der technische Tagesriegel bleibt 4 USD.
- Keine Profilaktivierung oder Profilwrites, keine Kommunikation, keine Cron-/Environment-Aenderungen. Alle 504 Profile bleiben inaktiv; Hashvergleich aller Mandats-/Profilzeilen vor und nach dem Lauf schuetzt auch die fuenf realen Profile. Profilinhalte werden nicht ausgegeben.
- Stopp beim ersten ungueltigen oder nicht bestaetigten Ergebnis, veraenderten Eingangsbestand, Profilabweichung, offenen Jobs/lebenden Understanding-Leases beim Start, fehlender Migration, fehlender Sperre, unlesbaren Kosten, Kosten-/Zeitgrenze oder unklarer Quittung.
- Kein automatischer Retry, kein zweiter Dispatch desselben Auftrags. Nicht begonnene Faelle werden vollstaendig ausgewiesen.

## Bedienweg und atomarer Start

`scripts/verstehen-vier.js` verwendet den vorhandenen Einzelvorgang-Motor. Es gibt keine neue HTTP-Route und keinen automatischen Trigger. Die Auswahl ist im Code auf genau die vier obigen Kennungen begrenzt. Der 169er Runner wird nicht aufgerufen.

Eine neue feste Einmalquittung `verstehen4-20260924-a` wird ausschliesslich per INSERT beansprucht. Alte 169er Quittungen bleiben unberuehrt. Revision und Nonce sichern Fortschritt und Abschluss; jede Quittung wird zurueckgelesen. Der Plan-Hash bindet Auswahl, vollstaendige CAS-/KO-/Dokumentdaten und Profilbestand. Execution bindet zusaetzlich den vollen main-Commit an Dispatch und Checkout; GitHub-Reruns sind gesperrt.

Die vorbereitete Migration `20260924140548_verstehen_vier_start.sql` fuegt einen eng begrenzten RPC hinzu. Er prueft Quittung, Frist, explizite Auswahl und die alten CAS-Zaehler. In **einer Datenbanktransaktion** folgen die vorhandenen Schritte `erneut`, Reservierung und Modellstart-Marke. Damit existiert kein fuer Cron sichtbares offenes Zwischenstadium. Nur service_role besitzt Ausfuehrungsrecht.

Die fruehe Modellstart-Marke ist eine Sicherheitsmarke: CAS `ki_aufrufe` kann auch steigen, wenn anschliessend noch vor dem HTTP-Aufruf gestoppt wird. Sie ist **kein Nachweis eines echten Provider-Aufrufs**. Runner-Aufrufversuche und Kostenbuch werden getrennt bilanziert. Bei Prozessverlust bleibt die Marke gesperrt; nach Lease-Ablauf fuehrt der bestehende Vertrag zu `unbekannt`, nicht zu einem Retry.

Nach jedem Vorgang prueft der Runner CAS-Zustand, fencing/Ergebnis-fencing, vollstaendig gespeichertes KO, Validierung, eigene Aufrufzahl, gebundene Laufkosten, freie Lease, unveraenderte Dokumente und Profile. Fehlgeschlagene Antworten liefern nur zugelassene wertfreie Fehlercodes. Bei hartem Prozessabbruch kann die Quittung `laeuft` bleiben: dann ist ausschliesslich eine rein lesende Rekonstruktion aus CAS, KO und Kostenbuch zulaessig, kein Rerun.

## Freigabefolge und Rueckweg

1. **Erledigt:** PR #543 nach gruener Pflicht-CI im freigegebenen Umfang gemergt und Production-Deployment rein lesend bestaetigt. Die spaetere Nutzeranweisung vom 24.09.2026 widerruft die zwischenzeitliche Dauerfreigabe: Kuenftige Merges brauchen wieder ein konkretes GO fuer genau den PR. Migration und Modellauftrag bleiben getrennt freigabepflichtig.
2. **Nur die neue Migration gesondert freigeben**; keine anderen offenen Migrationen mit anwenden. Nachkontrolle: Funktionsdefinition, Rechte und unveraenderte vier CAS-Zeilen/Profile. Rueckweg: `rollback_20260924140548_verstehen_vier_start.sql` entfernt ausschliesslich den neuen RPC; erst ausfuehren, wenn kein Lauf aktiv ist. Keine Quittungen, CAS-Zaehler oder Kosten zuruecksetzen.
3. Quellenentscheid und explizite Fallauswahl festhalten. Rein lesenden Workflow `verstehen-vier.yml`, Modus `plan`, mit vollem aktuellem main-Commit und Kennungen ausfuehren; dieser Job hat keine Modellzugangsdaten. Alternativ CLI ohne `--execute`: `node scripts/verstehen-vier.js --ids '<ausgewaehlte Kennungen, komma-getrennt>'`. Plan erzeugt keine Quittung und ruft keinen RPC auf.
4. Erst nach neuem ausdruecklichem GO fuer **Kennungen + Plan-Hash + Runtime-Commit + maximal einen Versuch je Fall + 0,30 USD + 20 Minuten** scharf ausfuehren. Workflow: Modus `ausfuehren`, Bestaetigung `VIER_UNKNOWN_EINMALIG_BESTAETIGT`. Das GO umfasst die gebundene CAS-Freigabe und Modellversuche, keine Profil-/Budgetaenderung.
5. Rein lesend Bilanz aller ausgewaehlten und ausgeschlossenen Faelle, Quittung, Kostenbuch und Sperren kontrollieren. Rueckweg bei Problemen: keine weitere Ausfuehrung; unklare Ergebnisse gesperrt lassen und gesondert entscheiden. Bereits gespeicherte fachliche Ergebnisse werden nicht automatisch geloescht.

**Diese Anleitung ist keine Production-Freigabe.**

## Entwicklungsnachweise

Gezielt lokal ueber `scripts/lokal.js`: Vierer-Runner 30/30 Gruppen einschliesslich echtem Motor fuer Erstverstehen, Update, Parteienfehler, Budgetstopp, verlorene Startantwort und Providerfehler; Budgetvertrag 12/12; Migrationsorganisation 44/44. Keine Production-Verbindung oder kostenpflichtigen Modellaufrufe.

Ein neuer Pflicht-CI-Schritt prueft die SQL-Funktion gegen isoliertes PostgreSQL 17: Vorwaerts/Rollback, Rechte, Transaktionsrollback, 20 konkurrierende Starter, Ausschluss doppelter und Cron-Starts, abgelaufene/fremde Quittung, veraenderten CAS-Stand und bereits gespeicherte Ergebnisse. Lokal fehlt PostgreSQL; der echte Datenbanknachweis war in [PR-CI 36011641381](https://github.com/ernisch/helmut-pilot/actions/runs/36011641381) erfolgreich. Beide Pflichtjobs, Standardlauf und Bereichsregression SUCCESS auf Commit `21351654bd63218fa745501a5674b7a515db047d`. [Post-Merge-CI 36013754698](https://github.com/ernisch/helmut-pilot/actions/runs/36013754698) ebenfalls vollstaendig SUCCESS auf Merge-Commit `1c70b4c162953280806ee2d74525894de1fed8f8`.

Nach Abschluss der vier Faelle folgt der kleine Pflichtsprint **Lage / Radar / Briefing Trennung**, danach erst die getrennt freizugebende 500er Vollversorgung mit 1500 bilanzierten Ergebnispositionen.
