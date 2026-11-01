# End500: getrennte Diagnose mit tatsächlicher Hostkapazität

Stand 01.11.2026. Vorbereitung auf Basis des geprüften SQL-Einzelablagefixes
`e5dd23a4` aus PR1009; noch kein Originallauf und keine neue Laufnonce.
Historische FAILs und das verbrauchte Versuchsjournal bleiben unverändert.

## Eigener Vertrag und Sicherheitslimit

Nur `end500-full-host-capacity-diagnostic` verwendet den neuen Vertrag
`helmut-w15-end500-host-capacity-diagnostic/1`. Der öffentliche Startauftrag bindet
die Berechnungspolitik mit exakt 2 GiB Hostreserve und Swap0, keinen geratenen
Bytecap. Alle alten Diagnose-, Funktions- und regulären Verträge bleiben erhalten.

Vor Anlage des gemeinsamen Parents wählt der privilegierte vorhandene Helper
einmalig das Limit:

`L = 4096 × floor((min(MemAvailable, sämtliche freien endlichen relevanten Ancestorbudgets) − 2.147.483.648) / 4096)`

Die tatsächliche Kernelhierarchiewurzel muss belegt sein; unbekannte oder
unvollständige Grenzen blockieren. Auch die ursprünglichen Caller-Ancestors
bleiben bindend, obwohl die Test-Slice direkt unter der Hierarchiewurzel liegt.
Root und äußerer Launcher vergleichen dafür Pfade, Identitäten und Grenzen.
Ein Cgroupwechsel durch sudo/PAM darf keine Zuteilung umgehen.

Das Root-eigene exklusive 0600-Record bindet tatsächliche Aufnahme, Run,
Commit und Nonce. Slice, Docker, innere Wächter, Fehlerkanäle und Abschlussprüfung
verwenden dasselbe L. Das Limit wird nicht später vergrößert. Kein 5-GB-Fallback,
kein Cacheeingriff und kein Peakreset.

Die vorhandenen Wächter prüfen fortlaufend die echte Hostreserve, die gebundenen
Caller-Headrooms und Identitäten, harte Grenzereignisse, OOM und Swap. Rohe
MemAvailable-Werte werden nicht um bereits enthaltenen Dateispeicher erhöht.
Unbekannte Werte und Reserveverlust stoppen; bestehende Prozesse werden sicher
beendet und ihr Stillstand geprüft. Eine Aufnahme ist keine exklusive Reservierung
gegen beliebige konkurrierende Last des gemeinsamen Hosts.

## Tatsächliche Kapazitätsprobe und Freigabegrenze

Die Pflicht-CI liest auf einem vorhandenen normalen GitHub-Runner MemTotal,
MemAvailable und alle relevanten Ancestorbudgets. Sie protokolliert eine SAFE-
Aufnahme mit berechnetem L, aktiviert aber kein Limit und liest keine Originale.
Der tatsächliche Messwert und seine Kopfbindung stehen am zugehörigen Draft-PR.

Der spätere Originalrunner ist zu diesem Zeitpunkt noch nicht zugewiesen.
Seine Kapazität wird deshalb nach einem neuen konkreten GO frisch gemessen und
vor der ersten Originalarbeit unveränderlich gebunden. Der Wert der CI-Maschine
wird nicht als garantierte Kapazität einer anderen Maschine ausgegeben.
Keine größere kostenpflichtige Maschine und keine neue Infrastruktur.

## Umfang des später einmalig freizugebenden Laufs

Vorhandene 15 Cipherteile und zwölf Originalpins, isolierter Restore500/0,
500 Auth-CAS, 6.000 Usagezeilen, 3.501 Postimages, vollständige Exporte und
finale0 aktive Profile. Danach vollständige verschlüsselte Sicherung,
authentifizierte entfernte Rücklesung, zweite frische isolierte Wiederherstellung
und vollständiger Integritätsvergleich. 60 maximale DB-Verbindungen bleiben
auch im primären Verarbeitungs- und zweiten Restorepfad erhalten.

Unverändert: höchstens3.600s, mindestens512MiB freie Plattenreserve und
vollständiger vorhandener Plattenplan; Swap/OOM/Maxereignisse0. Höchstens0,05USD
zusätzliche Speicherung, ein verschlüsseltes Artefakt für einen Tag,0Modellaufrufe.
Kein Retry, Linkrefresh, Merge, Deployment oder Production-Eingriff.

Alle Vorbereitung vor frischen Links; unmittelbar vor dem einzigen Start
tatsächliche Restgültigkeit über90s und höchstens65.535Parameterzeichen.
Originale, Drive, Secrets und vorhandene Belege bleiben erhalten. Kein Reset des
alten Versuchsjournals; neue eigene Einmalautorität und neue Nonce erst nach GO.

## Messung und getrennte Abnahme

Der vorhandene Kernelzähler bleibt über Empfang, Restore, Verarbeitung, Sicherung
und zweite Rücksicherung erhalten. Bestehende Phasen-/Fortschrittsmessung und PSS-
Zuordnung werden weiterverwendet. Dateiseiten, Shared Memory und PSS überlappen
und werden nicht addiert. Fehlende Komponentenwerte bleiben UNKNOWN.
Die neue gebundene Traceversion erhält auch Werte oberhalb5GB durch sämtliche
geschlossenen Python-/Actions-Fehlerausgaben, einschließlich letzter Phase,
bestätigter Zähler und erster Ressourcenfehlerklasse.

Ein vollständiger Abschluss heißt ausschließlich
`COMPLETED_FULL_END500_HOST_CAPACITY_DIAGNOSTIC_ONLY`. Die acht Ergebnisfelder
verlangen echte500/6.000/3.501/0 sowie Export, Prozessstopp, authentifizierte
Rücklesung und zweite Recoveryintegrität dieses selben Laufs.
End500-, Mock500-, reguläre RAM- und Anbieterabnahmen bleiben false.
Auch ein Durchlauf ist kein offizieller Erfolg des 5-GB-Funktionsvertrags.

Der echte vorherige Run41280267757 bleibt FAIL: höchste bestätigte Spitze knapp5GB,
zwei Maxkontakte, OOM/Swap0, acht Bereinigungsprüfungen PASS; zweite Recovery und
Gesamtintegrität nicht bestätigt. Der gezielte SQL-Fix wird übernommen, weitere
Optimierungen vor dem neuen Messlauf sind nicht Bestandteil dieses Auftrags.
