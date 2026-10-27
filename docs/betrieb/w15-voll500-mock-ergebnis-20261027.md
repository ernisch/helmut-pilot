# W15: einmaliger Aufbau vor Aktivierung abgebrochen

Der freigegebene Versuch auf `cdea4b19` wurde genau einmal gestartet und am
27.10.,19:13:27,194UTC beim ersten Fehler beendet. **Kein lokaler500er-PASS,
kein Productionnachweis.** Keine Wiederholung, kein Resume und kein zweiter
Container. PR969/971/972 bleiben ungemergt.

Die fuenf Harness-Verbindungen sind implementiert. Ein reiner Preflight bestand
genau einmal; drei unabhaengige Vorabreviews prueften die Verbindungen statisch.
Dieser Vorabbefund hat den folgenden Aufbaufehler nicht erkannt.
Anwendungscode/Workflows sind gegenueber `da63309c` unveraendert. Dessen
[CI40534410137](https://github.com/ernisch/helmut-pilot/actions/runs/40534410137)
ist weiterhin success; keine neue Voll-CI gestartet. Dieser uebernommene
Codebefund prueft den neuen privaten Restorecontroller nicht.

## Tatsaechlicher Erstfehler

Der Originaldump setzt den Sitzungssuchpfad auf leer:
`SELECT pg_catalog.set_config('search_path', '', false)`.
Der neue Controller fuehrt Restore und initiale Deaktivierung korrekt in einer
Transaktion aus, verwendet anschliessend aber `update mandate_profiles` ohne
`public.`. PostgreSQL meldet deshalb `relation "mandate_profiles" does not exist`.
Die Transaktion rollt saemtliche Anwendungstabellen und Daten zurueck.
Der Fehler liegt im neuen lokalen Testaufbau. Keine Daten- oder Motorreparatur
wurde vorgenommen. Die kleinste Korrektur waere die explizite Schemaqualifikation.

## Frisch gemessener Umfang

| Merkmal | Tatsaechlicher Befund |
|---|---|
| Neue Container / Wiederanlaeufe |1 /0; netzlos, keine Ports, ausschliesslich neues PGDATA |
| Profilaktivierungen / Units / Mockantworten |0 /0 /0 |
| Echte KI-Aufrufe / neue Signaturschluessel |0 /0 |
| Gespeicherte Ergebnisse / Soll |0 /1500; alle1500Sollpositionen fehlen |
| Leer / doppelt / technisch fehlerhaft / unbrauchbar |Mangels Ergebnissen nicht inhaltlich geprueft; keine Validatorabnahme |
| Echte8000Kontrollpunkte |0ausgefuehrt; vorhandene Vorabtests ersetzen sie nicht |
| Unit60 / Auth30 / Full-C90 |Nicht erreicht, keine neuen Zeitnachweise |
| Kernelcap / Swaplimit |2.048.000.000B /0 technisch bestaetigt |
| Gemeinsamer Kernelpeak |165.920.768B; ausschliesslich Initialisierung/Restoreabbruch |
| Rechnerische Reserve im erreichten Umfang |1.882.079.232B; kein RAM-Nachweis unter500er-Last |
| OOM-/Limitereignisse |0; kein Peakreset, kein Baselineabzug |

Der Rohcontroller meldet Cleanup zunaechst UNKNOWN, weil seine Profilzaehlung
nach dem Rollback ebenfalls keine Tabelle findet. **Dieser Rohbefund bleibt
unveraendert erhalten.** Eine getrennte rein lesende Pruefung bestaetigt danach:
keine Anwendungstabellen/-schemas/-funktionen, keine weitere DB-Sitzung,
keine Anwendungsprozesse und damit keine aktiven Testprofile. Nur PostgreSQL
laeuft. Es gibt keinen erfundenen nativen500→0-Endbeleg:500wurden nie aktiviert.
Die Originalquelle bleibt mit vorher/nachher bytegleichen Profil-/Store-/
Dokumenthashbelegen unveraendert; ihre bestehenden500Aktivflags wurden nicht
angefasst. Geschuetzte Originaldateien und private Logs bleiben ausserhalbGit.

Offline-Fixturezusammenstellung war gemaess Plan ausserhalb der Laufmessung
vorgesehen. Echte gespeicherte Full-C-Vorbereitung, HTTP-Motor, Worker und Auditor
sollten gemeinsam im Cap laufen; sie wurden nicht erreicht. Neue Anwendungs-
Coverage wurde deshalb nicht erhoben. Historische Zeiten, UNIT0B und die20%-
Neuberechnung werden nicht als Ergebnis dieses Versuchs ausgegeben.

## Belege und naechster Schritt

- [Gesamtbericht](belege/w15-processing-20261027/FULL500_ATTEMPT_RESULT.SAFE.json).
- [Unabhaengig bestaetigte Fehlerursache](belege/w15-processing-20261027/FULL500_RESTORE_ROOT_CAUSE_INDEPENDENT.SAFE.json).
- [Unveraenderter Controllerabschluss](belege/w15-processing-20261027/FULL500_CONTROLLER_RESULT.SAFE.json).
- [Unabhaengige Null-/Nichtstartpruefung](belege/w15-processing-20261027/FULL500_INDEPENDENT_BOOTSTRAP_ZERO_NO_START.SAFE.json).
- [Unabhaengige Speicherpruefung](belege/w15-processing-20261027/FULL500_MEMORY_POSTRUN_INDEPENDENT.SAFE.json).
- [Vorabpruefung](belege/w15-processing-20261027/FULL500_PREFLIGHT.SAFE.json).

Gestoppt. Fuer eine gezielte Schemaqualifikation samt begrenzter Aufbaupruefung
und genau einen neuen Gesamtversuch ist eine neue ausdrueckliche Freigabe noetig:
die aktuelle Freigabe erlaubte nur einen Versuch. Keine Reparatur oder weitere
Ausfuehrung innerhalb dieses abgebrochenen Versuchs. Production und echte
Modellqualitaet bleiben getrennt und offen.
