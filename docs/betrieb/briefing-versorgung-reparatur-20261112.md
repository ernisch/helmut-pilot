# Fehlendes Tagesbriefing: Diagnose und Reparatur, 12.11.2026

## Endstand: Codekorrekturen live, Briefingbetrieb weiter blockiert

Die sieben beschriebenen Codekorrekturen sind auf Production. Ein frisches,
vollstaendiges Kundenbriefing ist weiterhin NICHT nachgewiesen: drei separat
freigegebene Quellenfenster wurden von ungeordneten Datenbankneustarts
unterbrochen. Weitere Quellen-, Modell- und Briefinglaeufe sind nach der
vereinbarten Stoppbedingung beendet; keine erneute Freigabe aus alten GOs ableiten.
Die Lage-/Morgenaufrufe des ersten Zyklus sind erfolgt, die des zweiten/dritten NICHT.

### Speicherbefund und Softwareentlastung ohne Mehrkosten

Der Betreiber lehnt Small/2GB und zusaetzliche Kosten ausdruecklich ab:
„Keine Mehrkosten; Software weiter pruefen“. Keine Ressourcenumschaltung,
kein neuer Quellen-/Modell-/Lage-/Morgenlauf daraus freigegeben oder ausgefuehrt.
Die beiden3h-Dashboardbilder zeigen hohe Memory commitment und Einbrueche
nahe den Neustarts; maximal etwa15Verbindungen gegen60zulaessige. Commitment
ist zugesagter virtueller Speicher, nicht residenter RAM. Native Momentaufnahme
nach dem ersten Ausfall: Committed_AS1834622976Bytes bei CommitLimit1547833344,
physischer Speicher948191232Bytes. Speicherknappheit ist belegt; der konkrete
Absturzausloeser und ein OOM-Kill bleiben unbewiesen. Keine pauschale Erhoehung
des Verbindungslimits oder Aenderung der Datenbankkonfiguration.

Eine konkrete unnoetige Belastung liegt im Softwarelesepfad: die Sitzungspruefung
und kleine Statusleser holen den kompletten main-auth-Block samt Kostenhistorie.
Der Kostenbericht holt denselben Block sogar zweimal. Die Korrektur waehlt
serverseitig nur benoetigte JSON-Felder; Kostenbericht und Laufzuordnung nutzen
einen gemeinsamen Lesestand. Sitzungen werden nicht gecacht. Vollstaendige
CAS-Mutationen, Kostenbuecher, offene Reserven und historische Journale bleiben
erhalten. Die reine Teilsicht darf auch als flache Kopie weder den Auth- noch
den Content-Speicher ueberschreiben, einschliesslich lokalem Dateimodus.

Rein lesende native REST-Gegenprobe12.11.,10:47:30UTC: vollstaendige Antwort
4304637Bytes, dieselben Konten/Sitzungen408327Bytes (-90,51Prozent), dieselben
Prozesslaeufe339551Bytes (-92,11Prozent). Drei begrenzte GETs, Werte direkt
verglichen; keine gespeicherten Konteninhalte im oeffentlichen Beleg. Einzelne
Antwortzeiten2,153/0,877/0,401s sind keine Lastmessung. Keine behauptete Senkung
des RAM-Spitzenverbrauchs und kein Nachweis ausgebliebener Neustarts.

Gezielte lokale Pruefungen ueber lokal.js:12/12Lese-/Fehlergruppen,
15/15Konten-CAS einschliesslich fuenf Prozessen,13/13Profil-/Auth-Entkopplung,
24/24Login/HTTP,17/17Sitzungs-/Mandatszuordnung und21/21Speicherintegritaet.
Socket-EPERM wurde mit demselben isolierten Test ausserhalb der Sandbox
aufgeloest. Der zusaetzlich gelesene historische Kostenmessungstest meldet
128/129: sein Scheduler-Regulaerausdruck endet am verschachtelten Optionsobjekt
vor runId. Derselbe Fehler tritt
unveraendert im isolierten main-Standf2676192 auf; die Kosten-/Laufaggregationen
bestehen. Kein gruener Gesamtnachweis fuer diesen Legacytest behauptet.
Die vorhandene verpflichtende PostgreSQL-/PostgREST-CI prueft zusaetzlich die
echte JSON-Feldauswahl und den hashgleichen Datenbestand nach gesperrtem
Teilschreiben. [PR1163](https://github.com/ernisch/helmut-pilot/pull/1163): beide Pflichtchecks
auf Kopf46677bdf9b406d51dcdbd8ec33f919fb9bbc12f6 SUCCESS in
[CI43203897145](https://github.com/ernisch/helmut-pilot/actions/runs/43203897145).
Alle Datenbank-, Standard-, Fach- und Z22-Schritte erfolgreich; Browserausfuehrung
fuer diesen Backenddiff planmaessig uebersprungen, erfolgreicher Pflichtcheck.
Vor Merge mainf2676192, vollstaendiger Diff/Kopf und0lebende Leases bestaetigt.
Merge6557405d8419a47dfdcfe53d6f03ca26a863ee3c um11:25:05UTC;
Deploymentdpl_8MLTAiwYsrTA8Ho9jyvv5TEo5UgE READY und Hauptalias bestaetigt.
Lesende Runtimekontrolle11:25:46UTC: Startseitenversion6557405d, exakter
Mergecommit, production=true, kommunikationGesperrt=true. Anonyme Sitzung
bleibt nicht authentifiziert. Im abgefragten neuen Deploymentfenster keine
error/warning/fatal-Gruppen; kurze Ruhebeobachtung, kein Lastnachweis.
Keine echte authentifizierte Production-Bedienabnahme oder wiederhergestelltes
Kundenbriefing daraus ableiten.

Native Nachkontrolle11:26:28UTC: weiterhin1aktives Profil,0lebende Job-/Pipeline-/
Klassensperren, PostgreSQL seit09:27:43UTC ohne weiteren Neustart. Gesamtbindung
1,720205USD, heute0,487723USD einschliesslich2offener Reservierungen; frozen=null,
Vertrag8c98b2e1 unveraendert. Fenster3/8, Sekunden900/2400, Originale16/16.
Kein neuer Quellen-, Modell-, Lage- oder Morgenlauf waehrend der Softwarephase.
Der anschliessend ausdruecklich freigegebene dritte Nachlauf ist unten belegt;
seine Stoppbedingung ist eingetreten. Kein unverbrauchtes Laufrecht daraus.
Rueckweg: gezielter Revert dieser Lesekorrektur, keine Datenruecksetzung.

### Drittes freigegebenes Zusatzfenster: trotz Lesefix erneut abgebrochen

Der Betreiber gab genau ein weiteres300s-Quellenfenster frei, danach nur bei
bestaetigtem Abschluss je einen Lage-/Morgenlauf. Gleiche1USD heute/30USD insgesamt
inklusive Reserven, keine Mehrkosten durch Datenbankupgrade, Resets oder Nachrichten;
Stopp bei erneutem Datenbankfehler. Startsignal12:43:58UTC, echter geschuetzter
Adminstart12:44:55.738UTC, Quellenlauf
admin-quellen-2026-11-12-d9fc6386-35e0-46d5-8c10-c00d075ed01e,
commit6557405d8419a47dfdcfe53d6f03ca26a863ee3c,
Requestwd8px-1794487495506-b95d3a6ca296. Damit wurde der Lesefix wirklich verwendet.

Um12:47:29.631157UTC startet PostgreSQL erneut. Native Meldungen:
`database system was interrupted`, `not properly shut down; automatic recovery`.
Runtime ab12:47:32: KO-Schreiben503/PGRST002, unbestaetigter Kostenabschluss,
danach521auch fuer Journale/Sperren/Endquittung. Die native Quittung bleibt
running ohne Endbeleg; keine erzwungene Umschreibung oder Wiederholung.
Lage-/Morgenlauf3 NICHT gestartet. Alle bezahlten Arbeiten nach der vereinbarten
Stoppbedingung beendet. Die Lesekorrektur verhinderte diesen Neustart nicht.

Fuenf Modellaufrufe sind mit zusammen0,033501USD abgerechnet; ein weiterer
Aufruf seit12:46:47.608UTC bleibt mit0,212000USD reserviert und ungeklaert.
Vier technisch vollstaendige Wissensobjekte sind geaendert gespeichert; weder
fachliche Kundenrelevanz noch ein aktuelles Briefing dadurch nachgewiesen.
Native Kontrolle12:51:54.941035UTC: Gesamtbindung1,965706USD,
heute0,733224USD, frozen=null. Drei heutige Reserven zusammen0,636000USD und
vier historische Reserven unveraendert gebunden. Fenster4/8, Sekunden1200/2400,
Originale16/16;0lebende Job-/Pipeline-/Klassensperren. Keine Freigabe fuer einen
vierten Quellenlauf; gebundene Betrage sind keine ausschliesslich abgerechneten Kosten.

Erfolgreicher grosser Store-PATCH vor dem Neustart3997ms. Zwischen12:47:00 und
12:47:31 keine App-REST-Anfrage sichtbar, waehrend ein Anbieteraufruf wartete.
Store insgesamt12951552Bytes, nur Primaerschluesselindex und Zeitstempeltrigger.
Das belegt weder einen bestimmten abstuerzenden SQL-Befehl noch OOM oder Bloat.
Aktuelle Metriken nach Neustart:948195328Bytes RAM,600424448verfuegbar,
Committed_AS1204494336 bei CommitLimit1547833344, oom_kill0; Momentaufnahme nach
Reset, kein Entlastungsbeweis fuer den vorangegangenen Ausfall. Ursache bleibt UNKNOWN.

### Auth-Schreibentlastung vorbereitet, noch nicht aktiviert

Branch `codex/auth-schreiblast-vorbereiten-20261112`: kleine Auth-Aenderungen
sollen nur geaenderte oberste JSON-Felder uebertragen. Die ganze Zeilenrevision
bleibt atomare Schreibbedingung, auch bei verschiedenen geaenderten Feldern.
Unveraenderliche SHA256-Fingerabdruecke erkennen verschachtelte Aenderungen und
Entfernungen. Unveraenderte Historien, Reserven und unbekannte Felder bleiben
auf der Datenbank erhalten; kein Retention-, Reset- oder Kontingenteingriff.
PostgreSQL bildet intern weiterhin eine komplette neue JSONB-Zeilenversion.
Weniger HTTP-/JSON-Eingabe ist kein bewiesener Rueckgang des RAM-Spitzenverbrauchs
und keine bestaetigte Reparatur der Neustartursache.

Neue serverseitige Funktion `helmut_auth_cas_patch_v1`: SECURITY INVOKER,
fester search_path, EXECUTE ausschliesslich service_role, Ziel-ID endet in `-auth`.
Keine neuen Tabellen/Indizes/Policies, keine Bestandsdatenaenderung bei Installation.
Eine fehlende Migration oder verlorene Schreibantwort bleibt Fehler; kein
Rueckfall auf Gesamtschreiben und kein blinder Retry. Neue Zeilen bleiben beim
bisherigen bedingten Insert. Ohne exakt `HELMUT_AUTH_PATCH_V1=on` bleiben bestehende
Schreibpfade aktiv, einschliesslich ihrer bisherigen CAS-Pruefung.
Vercel-Env-Metadaten rein lesend geprueft: Flag in keinem Ziel gesetzt.

Gezielt lokal ueber lokal.js:12/12Schreibgruppen und12/12Lesegruppen bestanden.
Synthetischer Sitzungstest mit3MBHistorie:594statt3000253Requestbytes, keine
Production-/RAM-Messung. PostgreSQL17.6 im isolierten Container:8/8SQL-Gruppen
mit echten Rollen, zwei konkurrierenden Verbindungen, Historien-/Reservenhashes,
Altbestand, Eingabeabwehr und datenbewahrendem Rollback bestanden. Budget16/16,
CAS15/15, Env38/38 und Migration71/71 zuvor bestanden. Zwei lokale REST-Aufbauten
scheiterten an Containerstart/Portbereitstellung vor den neuen Testfaellen;
kein bestandener lokaler REST-Nachweis behauptet. Der bestehende verpflichtende
PG17-/PostgREST-CI-Schritt enthaelt neun neue echte REST-/SQL-Gruppen und muss vor
Merge erfolgreich sein. Pflicht-CI und Production-Rollout fuer diesen Kopf noch offen.

Konkreter Aktivierungsplan nach gruener CI und inaktivem Coderollout:
1. Frischen Productionstand, fehlenden RPC, Ziel-ID-Endung,0lebende Schreiber
   und weiter fehlendes Flag rein lesend pruefen; aktuelle Kostenreserven erhalten.
2. Nur mit gesondertem GO Migration
   `20261112130226_auth_store_cas_patch_v1.sql` auf derselben Datenbank anwenden,
   ausschliesslich Flag `HELMUT_AUTH_PATCH_V1=on` fuer Production setzen und
   denselben geprueften Code regulaer neu deployen. Keine Ressourcenvergroesserung
   oder neue monatliche Datenbankkosten; keine bezahlten Laeufe eingeschlossen.
3. Funktion/ACL, Installation ohne Bestandsdatenveraenderung und Runtimeversion
   rein lesend bestaetigen. Echte Schreib-/Quellenprobe braucht eigenes konkretes GO;
   die drei alten Laufrechte sind verbraucht. Stopp bei erneutem DB-Fehler.
4. Rueckweg bei Fehler: Flag entfernen und vorherigen Schreibpfad redeployen;
   erst danach `rollback_20261112130226_auth_store_cas_patch_v1.sql` anwenden.
   Die Funktion wird entfernt, keine Daten oder Journale zurueckgesetzt.

### Zusaetzliche Codekorrekturen und echte Rolloutbelege

[PR1160](https://github.com/ernisch/helmut-pilot/pull/1160): Lage-Gesamtabschluss
uebernimmt negative Mandatsergebnisse. Kopf7ae6113d1007d18d44dfe18514b9f4c46b00cedb,
beide Pflichtchecks SUCCESS in
[CI43183841074](https://github.com/ernisch/helmut-pilot/actions/runs/43183841074).
Merge9acd4d5948a629238648dcb07468c3e53a13359d um09:08:47UTC,
Vercel dpl_23iZDkbq6Qj5wnw1BPNd8oBay8oa READY. Alias und Runtime bestaetigt.
Ein automatischer Merge-Review lehnte zunaechst wegen angeblich fehlendem GO ab;
die Dauerfreigabe wurde direkt aus AGENTS.md auf GitHub-main gelesen, derselbe
exakt gebundene Merge danach akzeptiert. Kein offener Freigabeblocker.

[PR1161](https://github.com/ernisch/helmut-pilot/pull/1161): belegter Fristablauf
loest die lokale dauerhafte Startsperre. Kopf8faa6780d581ac31d0ecc3b7222a51d3af5f4765,
beide Pflichtchecks SUCCESS in
[CI43187026061](https://github.com/ernisch/helmut-pilot/actions/runs/43187026061).
Merge94c43f8a47721579bab5ceb864c6413c747290ec um09:45:36UTC,
Vercel dpl_637r6ZZrNY3jvWCpU7FSDKG2yUHS READY. Hauptalias auf genau dieser
Deployment-ID, Startseite HTTP200 mit Clientversion94c43f8a; reiner Runtime-
Leser HTTP200, commit94c43f8a, production=true, kommunikationGesperrt=true.
Das geschuetzte Verwaltungsmodul liefert ohne Benutzersitzung401; keine
Umgehung, kein authentifizierter Production-Bedien- oder Bytegleichheitsnachweis.
Die20/20 lokalen HTTP-/Browserpruefungen und Pflicht-CI sind getrennte Nachweise.
Beide neuen Pflicht-Browserjobs haben die Browserpruefung wirklich ausgefuehrt.
Vor beiden Merges aktueller main, Diff/Kopf, Parallelitaet und leere lebende
Leasemenge geprueft. Keine Quoten-, Budget-, Cron- oder Profilkonfiguration
geaendert; nur die neue Arbeitsbranch-Preview deaktiviert.

### Zweites ausdruecklich freigegebenes Zusatzfenster

Nach dem ersten Abbruch erteilte der Betreiber ein neues GO fuer genau ein
weiteres300s-Fenster und anschliessend je einen Lage-/Morgenlauf, bei erneutem
Datenbankfehler ohne weiteren Lauf stoppen. Gleiche1USD/UTC-Tag/30USD insgesamt,
einschliesslich Reserven, keine Resets/Nachrichten. Vorflug09:00:57UTC:
1aktives Profil,0lebende Leases/Sperren, heute0,461436USD, frozen=null;
Vertrag unveraendert. Nach Startsignal bestaetigte der Betreiber den neuen Start.

Nativer Lauf admin-quellen-2026-11-12-e605748f-5578-430d-ac12-a9a420d425a8,
09:25:56.351UTC, commit9acd4d59, Requestkdntg-1794475556051-d0cd8ea73ed6.
Der vorab gepruefte16-Quellen-Auftrag40607078-aeaf-430d-96aa-a94a7f582097
wurde tatsaechlich verarbeitet. Vier Modellaufrufe sind vollstaendig verbucht,
Kosten0,026287USD; drei technisch vollstaendige Wissensobjekte gespeichert.
Zwei davon haben leere headline/display_title trotz nichtleerem Faktentext,
das dritte behandelt eine Papstmesse. Keine fachliche Kundenbriefing-Abnahme
oder vollstaendige Versorgung daraus ableiten; Inhaltsqualitaet bleibt offen.

Um09:27:43.720937UTC startet PostgreSQL erneut ungeordnet. Native Logmeldungen
wie beim ersten Ausfall: interrupted/not properly shut down/automatic recovery.
Vercel521 bei KO-/Rohdaten-/Sperr-/Quittungszugriffen und Timeout beim Vermerken
eines unbekannten Verstehensausgangs. Laufzeit120514ms, Endquittung fehlgeschlagen;
kein bestaetigter Abschluss. Die vereinbarte Stoppbedingung ist eingetreten.
lage2/morgen2 wurden nicht aufgerufen; die privaten Einmal-Skripte bleiben
unbenutzt, alte Lage-/Morgenartefakte unveraendert erhalten.

Native Nachkontrolle09:33UTC: Gesamtbindung1,720205USD, heute0,487723USD,
frozen=null. Die zwei alten heutigen Reservierungen von zusammen0,424000USD
bleiben voll gebunden; keine neue offene Geldreservierung im zweiten Lauf.
Vier historische Reserven ebenfalls erhalten. Fenster3/8, Sekunden900/2400,
Originale16/16. Beide Zusatzfenster sind verbraucht, keine weitere Startfreigabe.
Um09:44:40UTC0lebende Job-/Pipelineleases; keine alten Quittungen umgeschrieben.

### Diagnose nach dem zweiten Ausfall (historisch)

Bis09:33UTC ist der Neustart zweimal nativ belegt, sein Ausloeser weiter UNKNOWN.
pg_stat_statements enthaelt nach dem zweiten Neustart nur den neuen Bestand;
die verursachende Abfrage laesst sich daraus nicht bestimmen. Langsamster
erfolgreicher sichtbarer Store-PATCH vor dem Abbruch4905ms. Das beweist weder
einen OOM noch eine konkrete App-Abfrage als Absturzursache.
Aktuelle Projektmetriken nach dem zweiten Ausfall: verfuegbar593858560Bytes
von948191232, OOM-/PostgreSQL-Neustartzaehler0, PostgreSQL UND GoTrue mit neuen
Startzeiten. Momentaufnahme, kein Beleg gegen einen vorigen Ressourcenfehler.
Konfigurierter Managementtoken401; keine Rotation oder Ressourcenbuchung.
Die aktuelle oeffentliche Management-API bietet nur aktuelle Scrape-Metriken,
keine damit abrufbare historische Infrastruktur-Ursache. Der lokale Browser-
Leitfaden und Cloud-Desktop-Leitfaden wurden geprueft: kein Browser-js/CUA-js
oder Desktop-Oeffner angeboten; keine angemeldete Dashboard-Sitzung kontrolliert.
Die vollstaendige Umgebungsdiagnose bleibt privat, keine Tokens im Repository.

Der Betreiber wurde um den Ereigniswortlaut im Supabase-Dashboard fuer09:11
und10:27Berliner Zeit gebeten. Naechster Schritt: diesen Infrastrukturgrund
belegen und dann eine gezielte Reparatur vorbereiten; keine weiteren bezahlten
Wiederholungen, Limits erhoehen oder Daten/Reserven zuruecksetzen.
Ein Supportentwurf ist privat vorbereitet, NICHT versandt. Externe Nachrichten
sind von diesem Auftrag nicht freigegeben.

## Historie: erste Reparatur und erster Nachlauf

[PR1158](https://github.com/ernisch/helmut-pilot/pull/1158) wurde am12.11.,
07:52:14UTC nach vollstaendig gruener Endkopf-CI gemergt: gepruefter Kopf
`d751de20419b7a69e1e6e004c47e2adad56c6d93`, Merge
`d72cd2189e37dfe56260f925ef44c8a2f9c45fb0`.
[CI43174627705](https://github.com/ernisch/helmut-pilot/actions/runs/43174627705):
189/189 Standardsuiten,367/367 Fachsuiten,48/48 Z22-Datenbankpruefungen;
beide Pflichtchecks SUCCESS. Die Browserausfuehrung wurde fuer diesen Backend-
Diff gemaess unveraendertem Pruefplan bewusst uebersprungen, kein ausgefuehrter
Browsernachweis und kein neuer Mock100-/500er-Lasttest.

Vercel `dpl_7kWQ2pfTsTej4Gnb8iF76BSEmmof`, Production/fra1, READY,
aliasError=null; die Hauptdomain verweist auf genau diesen Merge.
Startseite und oeffentlicher Releasecheck HTTP200, ok/ready/storage true;
Client und Styles tragen die neue Versionskennungd72cd218.
Diese technischen Auslieferungsbelege beweisen noch kein frisches Tagesbriefing.

Native Vor-/Nachkontrolle07:51–07:53UTC:1 aktives Profil,0 laufende Prozesse,
0 lebende Pipeline-/Jobleases; Kostenbuch unveraendert1,244553USD,
heute12.071MikroUSD und0 offene heutige Geldreservierungen, frozen=null.
Vertraghash unveraendert
`8c98b2e18ee5dc21c73561bbf5bad2d8cb6c76f8ccd533b3153270bbd7d9a348`.
Fenster1/8, Sekunden300/2400, Originalabrufe16/16; Wissensstand weiter09.11.
Kein Quellen-, Modell-, Profil-, Budget- oder Cron-Eingriff durch den Rollout.

Der Betreiber hat fuer die Zeit nach dem Rollout genau ein weiteres Quellenfenster von maximal300s
fuer den bestehenden Einprofilbetrieb sowie anschliessend die vorhandenen
Lage-/Morgenlaeufe freigegeben, innerhalb1USD/UTC-Tag und30USD insgesamt,
ohne Kontingentreset und ohne externe Nachrichten. Der echte angemeldete
Adminstart und die nachfolgenden Lage-/Morgenlaeufe sind erfolgt; Ergebnis unten.
Die vollstaendige produktive Wiederherstellung bleibt offen.

## Erster Zusatzlauf und erster Datenbankblocker

Der Betreiber bestaetigte den Start mit „gestartet“. Nativer Quellenstart
08:09:27UTC, Lauf
`admin-quellen-2026-11-12-6d6ed153-9013-4cff-b6e4-28aa61d74fc9`,
Production weiterhin d72cd218. Das eine zusaetzliche Fenster ist verbraucht:
2/8 Fenster,600/2400Sekunden; Originale unveraendert16/16.
Keine Wiederholung, kein Reset und keine neue Quellenfreigabe.

Zwei vollstaendige Wissensobjekte sind um08:09:57 und08:10:11 gespeichert.
Ihre echten Quellenpublikationen sind23.09. beziehungsweise30.10.; das ist
Verarbeitungsfortschritt, kein Nachweis aktueller Meldungen. Der bearbeitete
Auftrag enthaelt auch Quellen bis11.11., wurde aber nicht abgeschlossen.

Ab08:10:12 meldet PostgREST Timeouts,08:10:49/51 native Statement-Timeouts
beim Lesen von helmut_store beziehungsweise beim Zaehlen der Wissensobjekte.
Um08:11:29 startet PostgreSQL tatsaechlich neu. Native Logmeldungen:
„database system was interrupted“ und „was not properly shut down; automatic
recovery in progress“; pg_postmaster_start_time bestaetigt08:11:29.034722UTC.
Vercel meldet521 beim Speichern und503/PGRST002 beim Quellenabschluss.
Die Ursache des ungeordneten Datenbankneustarts ist aus diesen Logs NICHT
bestimmbar; kein belegter OOM-, Wartungs- oder App-Lastnachweis.
Der Health-Advisor liefert keine Hinweise, beweist aber keine Fehlerfreiheit.
Der Quellenprozess bleibt wegen fehlender Endquittung technisch running;
der abgelaufene Joblease und die um08:19:43 abgelaufene Globalsperre wurden
nicht manuell geloescht. Originalstatus und Fehler bleiben erhalten.

Nach REST-Erholung, leerer lebender Lease-Menge, erneutem Kosten-/Vertrags-
vorflug und bestaetigter Runtime-Nachrichtensperre genau einmal die vorhandenen
Lage-/Morgenhandler aufgerufen. Lage08:25:32–08:26:05 HTTP200, ein Text neu
gespeichert. Einzelergebnis meldet quellenversorgung-offen/ok=false;
der bisherige Gesamtabschluss behauptet dennoch vollstaendig=true/success.
Dieser damit produktiv reproduzierte fuenfte Fehler wird korrigiert:
ein ausdruecklich negatives Einzelergebnis verhindert Gesamtgruen, bei weiter
verfuegbarem Text wird der Quellenrueckstand als partial protokolliert.
Gezielte echte Handler-/Persistenzpruefung10/10 und Fortsetzungspruefung14/14
bestanden; offener, unbekannter, gemischter und gesunder Quellenstand geprueft.
Zwei Testaufrufe auf nicht vorhandene Dateipfade fuehrten keine Suite aus;
der vorhandene19/19-Paketnachweis bleibt unveraendert. Die tatsaechliche
Statusgroessenpruefung current-state-groesse-test.js besteht4/4 bei29979Zeichen.

Morgen08:26:23–08:26:33 HTTP200: Tagespaket und Erfolgsquittung gespeichert
und gegengelesen, aber Paket vollstaendig=false, Versorgung partial/0von1.
Native Inhaltspruefung quellenversorgung-unvollstaendig; Hauptthema weiterhin
Pflegereform mit echter Publikation06.11. Push explizit gesperrt:
testfenster-sperrt-alle-aussenkanaele. Kein zweiter Lage-/Morgenaufruf.

Kostenbuch nach den Nachlaeufen:1,693918USD gebunden insgesamt,
heute0,461436USD einschliesslich0,424000USD fuer zwei offene Reservierungen
aus dem unterbrochenen Quellenjob. Beide bleiben konservativ voll gebunden;
vier historische Reserven ebenfalls unveraendert. frozen=null, Vertrag und
1USD/Tag/30USD insgesamt unveraendert. Kein blinder Wiederholungsaufruf.

Noch offen: Ursache/Stabilitaet des Datenbankausfalls, Quellenauftraege und
frisches vollstaendiges Tagesbriefing. Ein weiteres Quellenfenster liegt
ausserhalb der verbrauchten Einmalfreigabe und benoetigt eine neue konkrete
Betreiberentscheidung gemaess AGENTS.md/Production Schutz. Es besteht kein
technischer Zwang, bis morgen zu warten; die Zusatzverarbeitung ist begrenzt.

## Historie: weiterer Arbeitsvorrat und Verwaltungssperre

Zusaetzliche rein lesende Diagnose: Supabase-Projekt ACTIVE_HEALTHY,
Metrikfeed HTTP200. Aktuell439.664.640 von948.191.232Bytes verfuegbar,
OOM-Zaehler0. Die momentanen Metriken beweisen keine Ursache des vorigen
Neustarts. Der konfigurierte Managementtoken liefert401; keine Credentials
geaendert, der dokumentierte Projektmetrikfeed funktioniert mit dem bestehenden
Serverschluessel. Weder Computewechsel noch Neustart oder Budgetaenderung.

Von89 oeffentlichen Quelldokumenten ab11.11.,08:00UTC haben73 gemaess
unveraendertem Inhaltsvertrag brauchbaren Bestandstext,16 benoetigen Originale.
Zwei wartende Auftraege enthalten je16 der aktuellen Bestandstexte. Privater
Replay aller32 gebundenen Original-Snapshots: Auftrag
40607078-aeaf-430d-96aa-a94a7f582097 besteht16/16 Hash-/Metadatenbindungen,
kein neuer Originalabruf erforderlich. Der andere Auftrag behaelt seine echte
Metadatenabweichung und bleibt gesperrt. Das ist ein konkreter Arbeitsvorrat,
kein behaupteter weiterer Production-Erfolg; noch kein neuer Lauf freigegeben.

Beim Vorbereiten der Bedienung fiel eine weitere konkrete Sperre auf:
original-quellenlauf.mjs behaelt unbekannte Auftragskennungen unbegrenzt in der
Sitzung und deaktiviert jeden neuen Start, auch wenn die maximale Laufzeit
nachweislich vorbei ist. Korrektur: nur ein korrelierter, authentifizierter
Server-Status mit gueltiger Startzeit und abgelaufenen300s gibt die lokale
Startsperre frei. Der Ausgang bleibt unbekannt; kein Endbeleg, keine Buchung,
kein Job oder Kontingent wird umgeschrieben. Jeder weitere Lauf erfordert einen
neuen ausdruecklichen Klick, eine neue Kennung, CSRF und saemtliche bisherigen
serverseitigen Sperr-/Budgetpruefungen. Ein noch offener POST, unlesbarer Beleg,
ungueltige Startzeit oder fremde Laufkennung halten die Sperre weiter fest.
20/20 gezielte lokale Pruefungen bestanden, darunter vier echte Chromium-
Browsergruppen mit1280/390/320px und dem beleglosen abgelaufenen Auftrag.
0 externe Aufrufe; Originalquittung und Verbrauch im Browserfall erhalten.
Eigener Arbeitsbranch; Preview fuer ihn explizit deaktiviert, damit keine
Vorschau mit Productionzugang entsteht. Pflicht-CI und Rollout noch offen.

## Produktionsbefund vor der Reparatur

Rein lesende Aufnahme am12.11.,06:22–06:30UTC. Production953c1dfe,
Vercel dpl_4EEymRutzUa22MEq32GFJDFP719v READY. Der Quellenlauf03:00–03:04:29
hat69 neue Rohdokumente geholt, aber keinen neuen vollstaendigen Wissensstand
erzeugt. Juengster vollstaendiger Wissensstand09.11.,04:02:58UTC.
Lage05:00 lief auf altem Bestand; Morgenbriefing05:15 meldete
`morgenversorgung-unvollstaendig`. Ein heutiger Erstellungszeitpunkt belegt
keine heutigen Inhalte.

Erstes Fenster:1/8 und300/2400Sekunden reserviert. Sechs endgueltig gescheiterte
Verstehensjobs verhindern die automatische Fortsetzung. Heutiges Manifest
119/158 eingereiht; der gestrige Plan wurde zuvor vollstaendig abgeschlossen.
Die restlichen sieben Termine sind keine automatische Fehlerbehebung.

## Nachgewiesene Ursachen

1. In30 archivierten Quellen der ersten beiden fehlgeschlagenen Auftraege
   fehlt `content_hash`. Quellenkennung und unveraenderlicher Quellenhash
   sind korrekt. Der gebundene Leser erhaelt die NULL-Werte; Dedup entfernt
   alle30 Zeilen und die anschliessende Restbindung scheitert. Der Fix leitet
   ausschliesslich das technische Dedupfeld aus der bereits geprueften
   kanonischen Kennung ab. Gebundene Texte, Daten, Originale und Quellenhashes
   bleiben unveraendert; widerspruechliche vorhandene Hashes bleiben gesperrt.
2. Die fruehe Wache `restzeit-vor-quellenbindung` wurde als echter Fehlversuch
   behandelt. Jetzt wird der Job vor weiterer Quellenlesung/Beschaffung,
   Budgetreservierung und Modellstart vertagt. Der Worker gibt seinen
   unbegonnenen Stapelrest zurueck und beendet das Fenster ohne weitere Claims.
   Andere Fehler behalten ihren bisherigen Fehlerpfad.
3. Amtliche Bundestags-HIB-/Presseseiten liefern `og:url` und ein amtliches
   Tagesdatum statt der vom allgemeinen Leser verlangten Canonical-/JSON-LD-
   Struktur. Zwei echte oeffentliche HTML-Antworten reproduzieren die Ablehnung.
   Der spezielle Bundestagsleser wird fuer diese belegten Artikelwege und
   die vollstaendige Artikelgewinnung angeschlossen; Titel, Ziel und Datum
   bleiben gebunden, ein Leitabsatz wird nicht als Vollartikel bezeichnet.
4. Die globale Frischeabfrage betrachtet nur `created_at`. Der echte
   Verarbeitungsweg schreibt bei der Aktualisierung eines vorhandenen Vorgangs
   nur `updated_at`; das Anlagedatum bleibt erhalten. Dadurch koennte selbst ein
   erfolgreicher Nachlauf weiter als veraltet gelten. Die Abfrage beruecksichtigt
   deshalb beide gespeicherten Zeitpunkte vollstaendiger Wissensobjekte.
   Keine aktuelle Uhrzeit wird als Ersatz verwendet. Die getrennte Pruefung
   der Quellpublikation und des Tagesanlasses bleibt unveraendert.
   Native Triggerpruefung: nur die Fencingwache, kein allgemeiner Zeitstempel-
   Trigger; der Anreicherungswriter setzt `updated_at` nicht.

Zwei weitere Metadatenwidersprueche in einem alten Quellenauftrag sind echte
Bindungsabweichungen: geaenderter Titelsuffix beziehungsweise geaenderte
Publikationsuhrzeit. Diese werden nicht durch Lockerung der Quellenpruefung
akzeptiert. Alle42 untersuchten Archivzeilen bleiben unveraendert erhalten.

## Grenzen und Nachlauf

Ein heutiges unvollstaendiges Morgenpaket kann im bestehenden Handler noch
heute durch einen vollstaendigen Nachlauf ersetzt werden. Das ist bereits im
vorhandenen CAS-/Paketnachweis getestet; kein neuer Zeitplan erforderlich.

Vorbefund Kosten: heute0,012071USD, keine heutigen offenen Geldreservierungen;
gebundener Gesamtbestand1,244553USD einschliesslich historischer Reserven.
Bestehender Vertrag1USD/UTC-Tag und30USD insgesamt, unveraendert.
Originalabrufe heute16/16; alle16 endeten ohne gelieferten Originalbeleg.
Die begrenzte Zusatzaufnahme ordnet5/16 Fehler den reparierten Bundestagswegen
zu. Zwei echte HTML-Antworten bestaetigen diesen Parserfehler. Die uebrigen11
Cachebindungen sind aus396 verfuegbaren Quellenfassungen nicht rekonstruierbar;
Ausleseausgang UNKNOWN, weder als Sicherheitsablehnung noch als behoben gewertet.
Parserkorrekturen setzen weder negative Cachebelege noch Kontingente zurueck.

Codebereitstellung und normale Merges/Deployments sind dauerhaft freigegeben.
Ein manueller Production-Nachlauf samt bezahlter Verarbeitung benoetigt laut
AGENTS.md eine gesonderte konkrete Freigabe. Vorgesehener Umfang nach READY:
nur das vorhandene eine aktive Profil, genau ein weiteres freies Arbeitsfenster,
hoechstens300Sekunden Quellenarbeit am selben UTC-Tag,
danach bestehende Lage-/Morgenhandler; unveraenderte1USD/30USD-Gates.
Keine Profil-, Cron-, Budget-, Reserve- oder Secret-Aenderung, keine externen
Nachrichten, kein Zuruecksetzen gescheiterter Quellenversionen.
Vor jedem weiteren Fenster Abschluss und Erstfehler lesen; bei FAIL/UNKNOWN
stoppen statt blind wiederholen. Ein echter Zugriff ueber den angemeldeten
Adminstart bleibt Voraussetzung, kein Secret-Bypass dieses Endpunkts.

Nachkontrolle: neue vollstaendige Wissensobjekte, bestaetigte Projektion,
gespeichertes Tagespaket samt Quellenstand und echte App-Antwort lesen.
Ohne diese Belege bleibt die produktive Wiederherstellung offen.
Rueckweg des Codes: gezielter Revert der Reparatur; Originale, Kostenbuch,
Quellenversionen und bisherige Laufquittungen erhalten.

## Gezielte Pruefungen

Alle lokalen Tests ueber scripts/lokal.js ohne Production-Zugangsdaten.
Hash-/Restbindung24/24, Queue-Inhaltsversorgung29/29, Morgenpaket19/19,
Frischekopf26/26, Auswertungszeit/Live-Flow39/39 und schneller Kernschutz14/14 bestanden. Der erste
Kernschutzversuch scheiterte in drei HTTP-Tests an Sandbox-EPERM fuer lokale
Ports; derselbe geschuetzte Lauf ausserhalb der Sandbox bestand vollstaendig.
Der private42-Zeilen-Replay erhaelt alle gebundenen Dokumente und Quellenhashes.
Unabhaengiger Review der Restzeitkorrektur ohne offenen Befund.
Parserabnahme:94 Gruppen in sieben vorhandenen Suiten bestanden. Beide echten
HTML-Fixtures werden vollstaendig gelesen; manipulierte Ziele, Titel, Tage,
versteckte Texte, Sperrmetadaten und widerspruechliche Artikeldeklarationen
bleiben gesperrt. Die beiden HTML-Fixtures enthalten nur oeffentlichen Kopf
und Artikelbereich. Keine Cacheversionsaenderung oder neue Abruffreigabe.
Der erste Pflichtlauf43169501323 wurde wegen des vierten Fehlers bewusst
abgebrochen. Lauf43171311844 bestand188/189 Standardsuiten und scheiterte
ausschliesslich an30368/30000 Statuszeichen; nachfolgende Bereichs-/Z22-Schritte
liefen dort nicht. Die erste Kuerzung liess54 Restzeichen; ihr Zwischenlauf
43174509306 wurde vom korrigierten Kopf abgeloest. Lokale Dokumentationsgrenze
danach29978 Zeichen/4 von4 Pruefungen PASS. Der oben belegte Endlauf ist die
massgebliche Abnahme, keine Umwertung der Vorlaeufe. Produktiver Nachlauf offen.
