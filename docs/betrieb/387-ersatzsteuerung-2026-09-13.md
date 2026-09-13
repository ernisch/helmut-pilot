# Ersatzsteuerung fuer PR387

Stand: 13.09.2026. Zustand: Merge, Production und automatische main Pruefung erfolgreich. Abschlussbeleg unten; terminaler Steuerungsstatus in steuerung-pr387.json.

## Zweck und ausdrueckliche Betreiberentscheidung

Der bereits freigegebene Merge von PR387 war durch den fehlenden direkten Zugriff auf den privaten Steuerungsbericht blockiert. Der ausdruecklich freigegebene Ersatzweg hat diese auf PR387 begrenzte Fortsetzung ermoeglicht. Diese Vorlage ersetzt weder dessen Historie noch eine fachliche Abnahme. Sie beschreibt eine eng begrenzte alternative Koordination fuer genau PR387, dessen automatische Production Veroeffentlichung, lesende Nachkontrolle und Abschlussdokumentation.

Der Betreiber hat nach Einsicht in diese konkrete Ersatzregel mit ausdruecklichem Ja bestaetigt, dass alle anderen Chats mit Aenderungsauftraegen fuer Helmut gestoppt sind und diese Ersatzablage ausschliesslich fuer PR387 samt Abschluss verwendet werden darf. Damit gilt die bereits erteilte Mergefreigabe weiter. Eine umfassende technische Sicht auf andere Chats wird nicht behauptet.

Die gemeinsame Steuerung wurde mit Revision 1 durch bedingtes Anlegen gespeichert (Commit `c8145bd887d783d994d15eb3a08c3aded7c08cb4`) und vom Zielbranch inhaltlich exakt rueckgelesen (Datei SHA `60bd008c4ae22110c09ce24abe43029a15db29df`). Besitzer: `foreground-pr387-72f4073d6152-20260912T234751Z`; Frist: `2026-09-13T00:17:51.775Z`. Nach der Uebernahme wurden keine neuen Actions oder Deployments fuer die Dokumentation festgestellt.

## Konkrete Ablage

Repository: `ernisch/helmut-pilot`, oeffentlich.

Bereits vorhandener Dokumentationsbranch: `codex/500-fachurteil-import-vorbereitung-20260911`.

Gemeinsame Statusdatei: `docs/betrieb/steuerung-pr387.json`.

Diese Erlaeuterung und der nicht private Abschlussbeleg: `docs/betrieb/387-ersatzsteuerung-2026-09-13.md`.

Zusaetzlich nach dem Merge: gezielter Statusnachtrag in `docs/CURRENT_STATE.md` und `docs/betrieb/briefing-schwerpunkt-frische-2026-09-12.md` auf demselben Dokumentationsbranch. Kein weiterer PR und kein Merge dieses Dokumentationsbranches. Dessen alter Produktcode wird niemals auf main uebernommen.

Nur die vier benannten technischen Dokumentationsdateien duerfen gezielt ueber den verbundenen GitHub Zugang geschrieben werden. Kein gesamter lokaler Arbeitsbaum wird auf den alten Branch hochgeladen. Private Berichte, Personen, Profile, Quellenauszuege, Kontodaten, Modelltexte und Zugangsdaten bleiben ausserhalb der oeffentlichen Ablage. Die gemeinsame Datei enthaelt nur Auftragsumfang, technischen Besitzer, Frist, Revision, Commitkennungen und Pruefstatus.

Der Zielbranch stand beim lesenden Abgleich auf `c020c7f18c0edb88e7bd60a6506dc48ddb5078f5` vom 12.09., 12:49:10 UTC. Die Statusdatei existierte noch nicht. Die dort gelesene `vercel.json` schaltet automatische Deployments fuer genau diesen Branch bereits aus. Die Konfiguration wird nicht geaendert. Der bestehende CI Workflow reagiert auf Push nur fuer main; fuer diesen Branch wird kein PR erstellt. Vor jedem ersten Schreibschritt diese Bedingungen frisch pruefen. Nach jedem Schreiben Actions und Deployments rein lesend abgleichen; unerwartete Ausfuehrung fuehrt zum Stopp.

Quelle fuer die Wirkung von `git.deploymentEnabled`: [Vercel Git Configuration](https://vercel.com/docs/project-configuration/git-configuration).

## Uebernahme und Konfliktschutz

1. Zuerst gueltige Betreiberentscheidung, aktuelle offene PRs, aktive und wartende Actions, Fachautomation, Production Commit, Profilbestand, Datenfingerabdruck, Datenbankarbeit und Tageskosten pruefen. Ein abgelaufener Eintrag ist allein keine Erlaubnis zur Uebernahme.
2. Zielbranch und beide neuen Pfade lesen. Ist die Statusdatei unerwartet vorhanden, deren Inhalt und Besitzer zuerst klaeren. Eine andere gueltige Steuerung blockiert.
3. Erst nach dieser Pruefung die fehlende Statusdatei mit der GitHub Contents Aktion fuer eine NEUE Datei anlegen. Sie verweigert das Anlegen, wenn der Pfad inzwischen existiert. Einen eindeutigen Besitzer fuer diesen Abschnitt, Revision 1 und eine aus frischer Serverzeit abgeleitete Frist von 30 Minuten eintragen. Keine vorausgefuellten Zeitwerte aus der Vorlage verwenden.
4. Den gespeicherten Inhalt vom Zielbranch erneut lesen. Besitzer, Revision, Umfang, Frist und Datei SHA muessen exakt dem gesendeten Inhalt entsprechen. Erst dann ist die bedingte Uebernahme belegt. Die blosse lokale JSON Datei erteilt keine Zuständigkeit.
5. Jede Erneuerung oder Freigabe verwendet den gerade gelesenen Datei SHA als Schreibbedingung. Besitzer muss unveraendert der eigene sein, Revision steigt um eins, keine unbedingte Ueberschreibung. Nach jedem Schreiben erneut lesen. Bei Konflikt oder unbekanntem Schreibausgang nicht blind wiederholen, zuerst aktuellen gespeicherten Zustand lesen.
6. Vor Fristablauf erneuern. Bei abgelaufener oder verlorener Steuerung keine weitere Mutation. Keine automatische Uebernahme aus einem abgelaufenen fremden Eintrag.
7. Andere Ausfuehrer duerfen diesen Bereich waehrend der Eigentumsfrist nur lesen. Die Fachautomation bleibt deaktiviert. Die Ersatzregel gilt nur fuer den benannten Mergeabschnitt und wird nach dessen dokumentiertem Ende nicht auf weitere Arbeiten ausgedehnt.

Dies ist eine gemeinsam beachtete Koordinationsregel. Sie sperrt keinen fremden Schreiber technisch an GitHub oder Supabase aus. Deshalb sind die Betreiberbestaetigung zur alleinigen Ausfuehrung und die frischen Konkurrenzpruefungen erforderlich. Die alte private Steuerung kann hier weder gelesen noch geaendert werden; dieser Umstand bleibt ausdruecklich dokumentiert. Spaeteres Wiederherstellen des Berichtszugriffs fuehrt nicht zu einer automatischen Historienueberschreibung.

## Bereits freigegebener Merge und seine Grenzen

PR: <https://github.com/ernisch/helmut-pilot/pull/387>

Gepruefter Kopf: `e77119ceed6de7b3e731f32049dc53fbafdb1bb7`.

Gepruefte Basis main: `49fabbc9f95c78a7476aa8368db745d1bc95f41c`.

Gepruefter Mergekandidat: `780720d3a70e24fb7ccf3df653137f02f3c6074e`.

Identischer Baum in PR Kopf und Mergekandidat: `78d62fb947cde91efccf05224e4ce56839fed7c9`.

PR387 begrenzt die deterministische Radarzusammenfassung auf die sichtbare Ansicht. Leere Anzeigen behaupten damit keinen global leeren Datenbestand. Auswahl und Profiltrennung bleiben gleich. Vier bereits gepruefte Dateien; keine weitere Produktkorrektur in diesem Abschnitt.

Vor Merge Kopf, Basis, Kandidat, Baum und CI erneut abgleichen. Den Merge mit `expected_head_sha` auf den freigegebenen Kopf begrenzen. Kopf oder Basis veraendert, fremde Arbeit, unklare Steuerung oder rote Pruefung: stoppen. Der Merge loest automatisch die Production Veroeffentlichung aus. Kein zweites Deployment starten.

Danach wirklichen Mergecommit und dessen Baum lesen. Der Baum muss dem geprueften Baum entsprechen. Exakt diesen Commit als READY am Hauptalias `helmut-pilot.vercel.app` bestaetigen. Die automatisch gestartete main Pruefung beobachten und ihr echtes Ergebnis dokumentieren; nicht erneut starten. Profilbestand, Datenfingerabdruck, laufende Arbeit und Tageskosten erneut lesen. Nach dem dokumentierten Abschluss nur die eigene Steuerung bedingt freigeben und ruecklesen.

Bei Deploymentfehler oder falschem Alias stoppen und den tatsaechlichen Zustand dokumentieren. Der technische Rueckweg waere eine Rueckschaltung auf das vorherige Deployment beziehungsweise ein gezielter Revert; beides braucht eine eigene passende Freigabe und wird hier nicht ausgefuehrt.

Keine Fachlaeufe, Modelle, Quellenabrufe, Importe, Profilwechsel, Datenkorrekturen, Migrationen, Cron oder Budgetaenderungen. Die vollstaendige fachliche Production Abnahme exakt 500 gleichzeitig aktiver Testprofile bleibt offen.

## Historische Belege der Vorbereitung

GitHub: PR387 offen, konfliktfrei, Kopf und Basis exakt unveraendert. Nur der historische Draft345 ist zusaetzlich offen. Keine laufende Action; zwei wartende Eintraege stammen vom 06.08.2026. Kein Neustart oder Abbruch veranlasst.

PR Pruefung34716196610: completed/success, Versuch1. Die beendeten Originalprotokolle erneut gelesen:367/367 Suiten in676s,50/50 Browser,15/15 Kontoschutz und48/48 Datenbanknachweise. Beide Jobs checkten den oben genannten Kandidaten aus. Keine Suite erneut ausgefuehrt.

Production: `dpl_9xB1cLnRDtL6hAjMUxYFsycWsVEo`, READY am Hauptalias auf main `49fabbc9f95c78a7476aa8368db745d1bc95f41c`.

SQL Zeitpunkt: 13.09.2026,02:27:59 Tuerkei /01:27:59 Berlin /12.09.2026,23:27:59 UTC.504 Profile,505 Identitaeten,fuenf aktive Profile,495 synthetische Profile und495 synthetische Konten inaktiv. Null laufende Jobs,gueltige Leases,aktive Sperren,junge laufende Prozesse oder andere aktive Datenbanksitzungen.

Geschuetzter PostgreSQL JSONB Hash unveraendert: `96ae66918c06ed847f1673b47d60914bab814cdbd5833a345066db78f7ef45a1`. Die vier aelteren Admin Metadatenabweichungen bleiben offen; kein neuer Ursprungsbeleg wird behauptet.

UTC Tag12.09.:110 Buchungen,0,710396USD im Helmut Kostenzaehler erfasst,heutige offene Reserve0,Limit4USD fuer den gesamten Helmut Betrieb. Gegenueber der Uebergabe sind18 Buchungen und0,121371USD hinzugekommen. Diese Sitzung fuehrte keine Helmut Modellarbeit aus. Die Ursache des zwischenzeitlichen Zuwachses wird nicht allein aus dem Cron Zeitplan abgeleitet. Historische Reserven bleiben ihren Ursprungstagen zugeordnet.

Die Fachautomation ist deaktiviert und hat keinen naechsten Termin. Der separate Erreichbarkeitsmonitor darf nur eine minimale Leseabfrage durchfuehren. Kein umfassender Zugriff auf andere Chats oder deren kuenftige Aktionen wird behauptet.

Die direkten Library Dateifunktionen fehlen in dieser Sitzung. Die Berechtigungsabfrage mit der kanonischen Verbindungskennung erkennt die Anwendung unter dem Namen Library und bestaetigt die Standardberechtigung. Die Abfrage mit Pluginname oder Pluginkennung loeste dagegen nicht auf. Das klaert den zuvor sichtbaren Metadatenwiderspruch, nicht die Ursache fehlender Dateifunktionen. Keine Berechtigung geaendert und keine Installation entfernt.

Die zwei hochgeladenen Berichte sind identische Kopien des Stands nach PR380 vom11.09. Sie wurden nicht als aktuellster gemeinsamer Stand verwendet oder veraendert.

## Fortsetzung nach der Freigabe

Die lokale Vorbereitung liegt auf `codex/387-steuerung-vorbereitung-20260913`, Commit `e71ead413862b9fd553be831729a57d0b2e5927e`. Der vorherige Arbeitsbaum und Commit `f967530a8d1573e4a893011e9ddb7e6b61ed1d64` bleiben unveraendert. Nur die vier benannten technischen Dokumentationsdateien werden gezielt geschrieben.

Frischer Vorflug am 12.09.2026,23:47:51 UTC /13.09.,01:47:51 Berlin /02:47:51 Tuerkei: PR Kopf, Basis, Kandidatbaum und erfolgreiche PR Pruefung unveraendert. Production weiterhin auf dem oben genannten alten Deployment. Profile504,Identitaeten505,fuenf aktiv,495 synthetische Profile und Konten inaktiv; Schutzhash unveraendert; alle geprueften Aktivitaetszaehler null. UTC12.09.:110 Buchungen,0,710396USD erfasst,Reserve0,Limit4USD. Fachautomation deaktiviert. Nur die beiden alten wartenden Actions vom06.08. vorhanden.

## Historischer Zwischenstand: Merge und erste Nachkontrolle

[PR387](https://github.com/ernisch/helmut-pilot/pull/387) wurde am12.09.2026,23:50:16 UTC /13.09.,01:50:16 Berlin /02:50:16 Tuerkei mit festem `expected_head_sha` gemergt. Echter Mergecommit: `8d840d834f8ff312475d86e8c23509b75f63f91d`. Eltern exakt gepruefte Basis und Kopf, Baum `78d62fb947cde91efccf05224e4ce56839fed7c9` identisch mit dem geprueften Kandidaten. main und geschlossener PR wurden unabhaengig rueckgelesen.

Automatisches Production Deployment `dpl_4JSVUt4v2ktF45Yt4XzLSWmW8fUn`, Adresse `helmut-pilot-agpey0c02-nohut.vercel.app`, READY seit12.09.,23:50:34 UTC. Hauptalias `helmut-pilot.vercel.app` zeigt exakt auf den echten Merge. Genau ein neues Deployment seit Uebernahme, ausschliesslich main;keines aus dem Dokumentationsbranch. Keine weitere Veroeffentlichung ausgeloest.

Automatische [main Pruefung 34726446113](https://github.com/ernisch/helmut-pilot/actions/runs/34726446113), Ereignis push, Versuch1, exakter Merge. Browserjob103641278986 belegt50 PASS,0 FAIL und den echten Mergecheckout. Syntax sowie Kontoschreibschutzschritt erfolgreich;die Offline Suiten und der abschliessende Datenbanknachweis stehen noch aus. Keine Pruefung manuell gestartet oder wiederholt.

Unmittelbarer Mergevorflug23:50:07UTC und Nachkontrolle23:51:07UTC am12.09.:504 Profile,505 Identitaeten,fuenf aktive Profile,495 synthetische Profile und Konten inaktiv. Geschuetzter PostgreSQL JSONB Hash `96ae66918c06ed847f1673b47d60914bab814cdbd5833a345066db78f7ef45a1` exakt erhalten. Laufende Jobs,Leases,Sperren,junge laufende Prozesse und andere aktive Datenbankclients jeweils0. Vier bekannte aeltere Admin Metadatenabweichungen offen.

UTC12.09.:110 Buchungen,0,710396USD im Helmut Kostenzaehler erfasst,keine offene Tagesreserve,Limit4USD. Keine Helmut Modellarbeit durch diesen Mergeabschnitt. Laufzeitprotokolle des neuen Deployments ab23:50:16UTC lieferten bei der ersten lesenden Abfrage keine Eintraege mit error oder fatal. Das kurze Beobachtungsfenster ist keine fachliche Abnahme.

Steuerung Revision2 mit eigenem Besitzer bedingt gespeichert und exakt rueckgelesen;Frist `2026-09-13T00:21:07.442Z`. Naechster Schritt: automatisches Gesamtergebnis abwarten,erneuter Schutz und Kostenabgleich,Abschlussdokumentation sichern und nur die eigene Steuerung bedingt freigeben. Keine weitere Production Aktion autorisiert.

## Abschluss der freigegebenen Fortsetzung

Stand13.09.2026: Merge, exakte Production Veroeffentlichung, automatische main Pruefung und lesende Nachkontrolle erfolgreich. Dieser Abschluss betrifft ausschliesslich PR387. Die vollstaendige fachliche Production Abnahme fuer exakt500 gleichzeitig aktive Testprofile bleibt offen.

Die automatische [main Pruefung34726446113](https://github.com/ernisch/helmut-pilot/actions/runs/34726446113) endete am13.09.,00:03:54UTC /02:03:54Berlin /03:03:54Tuerkei mit completed/success,Versuch1,Ereignis push. Beide beendeten Originalprotokolle belegen den echten Mergecheckout `8d840d834f8ff312475d86e8c23509b75f63f91d`. Offlinejob103641279136:367/367 Suiten in682s,Kontoschutz15 PASS/0 FAIL,Z22 Datenbank48 PASS/0 FAIL gegen die isolierte Testdatenbank. Browserjob103641278986:50 PASS/0 FAIL. Kein manuelles Starten oder Wiederholen einer Pruefung.

Das erneut gelesene main zeigt auf den echten Merge. Production `dpl_4JSVUt4v2ktF45Yt4XzLSWmW8fUn` bleibt READY am Hauptalias `helmut-pilot.vercel.app` auf exakt diesem Commit. Der gepruefte PR,Kandidat und echte Merge haben denselben vollstaendigen Baum `78d62fb947cde91efccf05224e4ce56839fed7c9`. Seit Uebernahme genau die eine freigegebene automatische Production Veroeffentlichung. Keine vom Dokumentationsbranch ausgeloeste Action oder Veroeffentlichung festgestellt.

Finaler Schutzabgleich13.09.,00:04:41UTC /02:04:41Berlin /03:04:41Tuerkei:504 Profile,505 Identitaeten,fuenf Profile aktiv.495 synthetische Profile und495 synthetische Konten ausdruecklich inaktiv. Geschuetzter PostgreSQL JSONB Hash unveraendert `96ae66918c06ed847f1673b47d60914bab814cdbd5833a345066db78f7ef45a1`. Laufende Jobs,gueltige Leases,aktive Sperren,junge laufende Prozesse und andere aktive Datenbankclients jeweils0. Vier aeltere Admin Metadatenabweichungen bleiben offen;dieser Hash ersetzt keine urspruengliche Grundlinie.

Kostenabgleich13.09.,00:02:02UTC,aktuelle Buchungen nochmals00:04:41UTC:UTC12.09. unveraendert110 Buchungen und0,710396USD im Helmut Kostenzaehler,keine offene Tagesreserve. Fuer UTC13.09. noch kein Tagesbuch,keine Buchungen und keine offene Reserve. Die Grenze bleibt4USD fuer den gesamten Helmut Betrieb je UTC Tag. Das ist der gespeicherte Kostenzaehler,keine Anbieterrechnung. Historische gebundene Reserven frisch getrennt bestaetigt:0,424USD am10.09. und0,212USD am11.09.,zusammen0,636USD. Keine Umbuchung,Erstattung oder Wiederholung alter Aufrufe.

Bei der Nachkontrolle wurde ein Fehler in der uebernommenen Leseabfrage erkannt:Der englische Vergleich `status='reserved'` erfasst die tatsaechlichen Zustaende nicht. Die rein lesende Kontrollabfrage verwendet jetzt `status IN ('reserviert','ungeklaert')`,entsprechend `lib/helmut/testkosten-budget.js`. Der erneute Abgleich am12.09.,23:57:34UTC und danach bestaetigt die heutigen0 sowie die historischen0,636USD. Zusaetzlich gilt fuer synthetische Konten ausdruecklich `active IS DISTINCT FROM 'false'` als Abweichung. Weder Produktcode noch Daten wurden dabei geaendert. Die urspruengliche Reserveabfrage allein wird nicht als ausreichender Beleg ausgegeben.

Die erste Abfrage vorhandener Laufzeitprotokolle des exakten neuen Deployments ab23:50:16UTC ergab keine Eintraege mit error oder fatal. Dieses kurze Beobachtungsfenster und gruene CI ersetzen keine fachliche Abnahme. Keine App Fachaktion,kein Helmut Modellaufruf,Quellenabruf,Import,Profilwechsel,keine Migration oder Betriebsparameteraenderung ausgefuehrt.

Die Abschlussdokumentation wird ausschliesslich in den vier freigegebenen Dateien auf `codex/500-fachurteil-import-vorbereitung-20260911` gesichert und nach jedem Schreiben rueckgelesen. `docs/CURRENT_STATE.md` enthaelt den kompakten Endstand,der Betriebsbeleg einen Verweis auf diesen kanonischen Abschluss. Der alte Dokumentationsbranch bleibt ungemergt;sein Produktcode ist keine neue main Basis. Lokale Spiegelung auf `codex/387-steuerung-vorbereitung-20260913`;fruehere lokale Commits `f967530` und `e71ead4` bleiben erhalten.

Die eigene Steuerung bleibt waehrend der Abschlussablage aktiv. Als letzter Schreibschritt wird ausschliesslich der eigene Eintrag mit frisch gelesenem Datei SHA freigegeben und erneut gelesen. Der tatsaechliche terminale Zustand,die Revision und die Commitbelege der abgeschlossenen Dokumentation stehen in [steuerung-pr387.json](steuerung-pr387.json). Eine Freigabe ist nur aus dem dort gespeicherten Zustand `frei` mit leerem Besitzer abzuleiten.

Der private Bericht bleibt nicht erreichbar und wurde nicht veraendert;keine neue private Version behauptet. Die zwei hochgeladenen alten Kopien bleiben unveraendert. Die vom Betreiber bestaetigte Ersatzregel endet mit diesem dokumentierten PR387 Abschnitt. Keine weitere Production Aktion autorisiert. Naechster fachlicher Gegenstand ist die noch offene500er Gesamtabnahme mit aktueller alleiniger Zustaendigkeit und passendem konkreten Auftrag;keine automatische Fortsetzung dieses Mergeauftrags.
