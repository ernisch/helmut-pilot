# Fehlendes Tagesbriefing: Diagnose und Reparatur, 12.11.2026

## Rollout bestaetigt; heutiger Nachlauf teilweise gescheitert

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

## Freigegebener Nachlauf und neuer Blocker

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
