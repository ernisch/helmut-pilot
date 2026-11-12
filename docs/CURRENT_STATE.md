# CURRENT STATE — Helmut

**Stand: 11.11.2026.** Betreibersteuerung und frische Productionbelege gelten. [PR1105 live](betrieb/validierungsdiagnose-20261108.md). [Agentenregeln vereinfacht](../AGENTS.md): bis drei Agenten, Schutz/CI/Kosten erhalten.

**11.11., Production:** PR1118–1124 live; main/Production `4dee3255`, READY, Hauptdomain/Runtime bestätigt. Release-Frische `ready=false`; vollständige reguläre Verarbeitung und echte Kundensitzung bleiben zu belegen.

**UX (08.11.):** [PR1108: Tagesgrund, Radar ohne Knopf](ui/mobile-ux-20261108/README.md); kein Merge/Deploy, ChatGPT-Abnahme offen. [Briefing PR1102 live](ui/briefing-ohne-refresh-20261107/rollout.md).

**Briefing PR1117 live:** main/Production `f13a430a`, READY; [Belege](betrieb/briefing-tagesorientierung-20261109.md). PR1115 aufc37d85f8 live; Pendingreparatur in Vorbereitung.

**11.11., Quellen/Radar14:31UTC:** [Adminstart PR1126](betrieb/admin-quellenstart-rollout-20261111.md) live; AutomatikPR1133 auf `88c876f1` READY. [Radar-Ausschlussdiagnose](betrieb/radar-ausschlussdiagnose-20261111.md):acht alte Signale, vier neuere Fachartikel ohne Umfeldbezug, keine belegte kommende Frist. Replay bestätigt0sichtbare Signale. Nachschub seit09.11. ausgeblieben; heute8/8Fenster und2400/2400Sekunden reserviert,0Prozesse/Sperren. Kein Reset oder neuer Lauf. Nächster regulärer Start12.11.,03:00UTC; Erfolg danach prüfen.

## Büro: Kosten-/Antwortzeitfix live, echte Einzelprobe erfolgreich (11.11.2026)

**11.11., Büro live:** [PR1135, Nachweise und Rückweg](ui/buero-formatwahl-20261111/README.md).

**Büro (11.11.):** [Übersicht PR1145](ui/buero-themenuebersicht-20261111/README.md); [Quellentextfix PR1153](ui/buero-quellentext-20261111/README.md) auf `1b031b58` live/READY. Appstart erhält Quellenkurztexte. CI189/189+367/367+Browser grün, keine KI-Probe.

[PR1129](https://github.com/ernisch/helmut-pilot/pull/1129) auf `ca9a3fc6` live/READY; Buero wartet60s statt12s, kein Auto-Retry. Pflicht-CI43001755133 gruen:14/14 Schnellkern,135/135 Bereich und Browser/Mobil. Nach Nutzer-„Ja“ genau1echte Probe11:40UTC: HTTP200 nach15,023s,844Zeichen,kein Fallback,1bestaetigte Buchung0,002823USD. Die alte12s-Frist haette diese erfolgreiche Antwort verworfen. Unveraenderter Client zeigt die Originalantwort im isolierten Desktop-/Mobilreplay nach13s bytegleich,37/37Pruefungen,Cache/Teilenaktion bestaetigt,0externeAnfragen. Native Bilanz11:43UTC:64Buchungen,heute0,029144USD/1USD,gesamt1,214451USD/30USD;Vertrag/Altreserven erhalten. Erfolgreich fuer diese Einzelprobe; normale Kundensitzung/natives Teilen nicht geprueft. [Beleg, Grenzen und Rueckweg](betrieb/buero-kostensperre-20261111.md).

## Kompaktes Profil live (11.11.2026)

[Profil/Belege](ui/profil-kompakt-20261111/README.md): PR1144 und FolgePR1151 live. „Bitte vermeiden“ aus UI/Formular entfernt, Altwerte erhalten. Production953c1dfe READY; Hauptdomain bestätigt, Client/CSS bytegleich. CI43099987478:189/189Standard,367/367Fach,48/48Z22 und Browser grün; gemeinsam60Profil-/76Bürochecks bestanden. GitHub-Ausfall/Fehlversuche historisch belegt. Keine echten Profiländerungen/KI-Kosten. Nächster Schritt: Profil neu öffnen. [Audit](ui/profil-wirkungscheck-20261111/README.md).

**Historie 07.11.:** Lageauswahl PR1100 auf `d9651861` live/READY, Pflicht-CI42409807375 grün. Fachliche Aufnahme vor Limit, Quellen-/Profilbindung; synthetische Gegenproben und Windenergiefall bestanden. Authentifizierte Production-Bedienabnahme offen. [Vollständige Belege, Grenzen und Rückweg](betrieb/lage-profilbezug-20261107.md); keine neue Daten-/Modellfreigabe.

## UX Mergeabschluss (07.11.2026)

Nach Betreiber GO nacheinander bei jeweils beiden gruenen Pflichtchecks gemergt: Mobil PR1091 (`c3f5f2a0`), Desktop PR1092 (`eec7d804`), Navigation/Zeiten/Radar PR1093 (`2f9ff56d`), inaktive Quellenvorbereitung PR1094 (`1057d000`). Integrierte Quellen CI42352831258 aufefb26134 bestanden; Laufbelege bleiben in den PRs erhalten.
Production `dpl_LzrnS2fnHtPYkq71B1SD4EhHU9rF` READY auf1057d000; Hauptseite und Releasecheck HTTP200 mit ok/ready/storage true. Client/CSS bytegleich zum geprueften Git Stand, Version1057d000. Keine error/fatal Eintraege im abgefragten Deploymentfenster. Authentifizierte gemeinsame Production Bedienabnahme noch offen; die Browserabnahme ist ein CI Beleg.
Voriger Status unveraendert im [Archiv](archive/project_state/2026_11_07_CURRENT_STATE_vor_ux_abnahme.md). Rueckweg: vorheriges Deployment oder gezielter Revert, keine Datenmutation. Buero bleibt wie beauftragt zuletzt und unveraendert.

## Quellen: aktueller Stand und fruehere Belege

**11.11., Einreihung live / Kontingentvorflug vorbereitet:** PR1124 erhält Planmanifest/Hash/Inhaltsschlüssel/Artikeldatum; Runtime bestätigt `4dee3255`. Historische Manifeste und Schutzkonfiguration beim Rollout unverändert, keine aktive Verarbeitung oder Sperre. Der neue enge Vorflug prüft nach exklusiver Lease die vorhandene Workerbereitschaft und dieselbe 60s-/Slotgrenze vor der ersten Quotenreservierung. Planung/Enqueue/Claim bleiben dahinter. Teilreservierung, unbekannte Schreibantwort und Abbruch bleiben konservativ verbraucht; kein historischer Reset. Gezielte Gruppen: Arbeitsfenster21, echte lokale Route9 bestanden. Lesebereitschaft garantiert keine späteren RPC-Schreibaufrufe; der separate Pflichtfeldfehler wurde durch PR1124 behoben. Keine neuen Termine, Limits, Migration oder Productionänderung. Diagnosebelege bleiben privat. Nächster Schritt nach grüner Pflicht-CI: konkrete Merge-/Rolloutfreigabe für den neuen Reparaturkopf.

**Historie 07.11.:** [PR1098](https://github.com/ernisch/helmut-pilot/pull/1098) wurde nach GO und gruener CI inaktiv auf `778c289b` ausgerollt. Separat freigegebene Quellenkorrektur: vier Originalauszuege, eine Bundestagsquelle, fuenf Kurzfassungen; zwei Altfaelle geparkt, RP Online ohne Original offen. Kein 6/6-Nachweis und keine Provideraufrufe. [Quellenkorrektur mit Vor-/Nachwerten und Rueckweg](betrieb/quellenkorrektur-20261107.md). [Unveraenderter damaliger Detailstand](https://github.com/ernisch/helmut-pilot/blob/feadca2829b6b54c010c2fcfef16d208ab6e0c05/docs/CURRENT_STATE.md#quellenkorrektur-07112026-gemergt-und-inaktiv).

**Historie 06.11.:** PR1084 (`14c558b2`) ausgerollt; EUR-Lex/Bundespuls aktiviert und Arbeit-/Soziales-Ausschuss, DGB sowie Die Linke repariert. Damals 55 Pakete/254 Wege/98 Anbieter, 89 Zugaenge pausiert; erste regulaere Abrufe der fuenf Wege offen, kein allgemeiner Gesundheitsnachweis. [Aktivierung](quellenarchitektur/48-dip-eurlex-bundespuls.md), [Reparatur samt Pruefungen/Rueckweg](quellenarchitektur/49-stoerungsquellen-20261106.md), [verbleibende Quellenluecken](quellenarchitektur/47-neutrale-quellenversorgung.md).

## Verwaltungszahlen: Korrektur ausgerollt (06.11.2026)

Rein lesend bestaetigt:501 relationale Mandatsprofile, davon nur `cem-ince`
aktiv;500 synthetische Testprofile inaktiv. Production nutzt
den exklusiven relationalen Leser. Die alte Vorschau von PR1065 (`91903c00`)
erreicht dieselbe Datenbank, hat aber die nur fuer Production gesetzten
Profilflags nicht. Sie liest deshalb25 alte Profilkopien aus `helmut_store/main`
und zeigt25/25; diese Zahlen beschreiben nicht den aktuellen Betrieb.

Nach ausdruecklichem Betreiber-GO ist [PR1067](https://github.com/ernisch/helmut-pilot/pull/1067)
auf `6663c7a2` gemergt und auf Production ausgerollt. Die Verwaltung
nutzt die vorhandene Konfigurationsdiagnose und zeigt bei unbestaetigter
Profilquelle einen Hinweis statt alter Zahlen, leerer Profilbestandsbehauptung
oder einer daraus abgeleiteten Tagesbilanz. Bestaetigter Bestand wird unveraendert
gezaehlt. Kein Profil-, Konfigurations-, Motor- oder Budgeteingriff.
Gezielte Storage/HTTP/Anzeige-Regression einschliesslich Originalbrowser10/10,
Verwaltungsnavigation8/8 und isolierte Verwaltungs-/Browserpruefungen30/30
bestanden; unabhaengiges Review ohne verbleibenden Befund. Auf `main`13c4c1e5
einschliesslich des inzwischen gemergten Design-PR1065 integriert und geprueft.
Beide Pflichtchecks auf PR-Kopf `5ef616a0` gruen
([CI42186106722](https://github.com/ernisch/helmut-pilot/actions/runs/42186106722)).
Vercel-Deployment `dpl_BgRfSUKMaW2X1KZNNS8qqTWgd8MU` READY, regulaerer Alias
`helmut-pilot.vercel.app`. Lesende Nachkontrolle06.11.,12:11 Istanbul:
Runtime bestaetigt Mergecommit `6663c7a2`, Production und exklusiven relationalen
Profilzugriff; Release/Storage bereit. Datenbank exakt501 Mandate,1 aktiv
(`cem-ince`),500 inaktiv. Verwaltung ohne Sitzung HTTP401. Kein authentifizierter
Production-Klicktest; die Originalanzeige501/1 wurde lokal im Browser geprueft.
Auftrag abgeschlossen; keine weitere Profil- oder Konfigurationsaenderung noetig.

## Aktueller Auftrag: taegliche Versorgung nur fuer Cem Ince

Der Betreiber hat die Wiederaufnahme ausschliesslich fuer Cem Ince und die
Deaktivierung aller anderen Profile beauftragt. Zusaetzlich ausdruecklich
freigegeben: **1 USD je Tag, maximal 30 USD insgesamt** fuer diesen neuen Betrieb.
Entwicklung und Review nur mit GPT-6.1 Sol/Astra, kein DeepSeek.

**Betrieb aktiv und live gegengelesen (06.11.2026, 01:00 UTC).**
Production `8b01e1ff` nach PR1061 und Pflicht-CI42136772045:
181/181 Standardsuiten,332/332 Bereichssuiten und native Datenbanknachweise
gruen. Nur `cem-ince` aktiv;500 andere Mandatsprofile unveraendert inaktiv.
Vercel bestaetigt drei Tagesjobs:04:00 Quellen,05:00 Lage,05:15 Morgenpaket
UTC (Abschluss06:15 Berlin im Winter,07:15 im Sommer).

Quellenlauf147/147 erfolgreich,6 neue vollstaendige Wissensobjekte.
Die Lage wurde erfolgreich erzeugt und der normale App-Start liefert
sie aus dem Cache:2 quellengebundene Absaetze und5 Vorgangskarten.
Heutiges Morgenpaket und Frischequittung gespeichert/verifiziert;
Frische aktuell, ehrliche Ruhelage ohne neue Tagesprioritaet.
Der einzige verbleibende Paketpruefhinweis lautet
`briefing-ohne-tagesanlass`; keine fehlende Lage oder Speicherstoerung.
Der strenge Vollstaendigkeitsmarker bleibt deshalb partial.
`fachlichGeprueft:false` ist im normalen Morgenlauf fest vorgegeben
und wird nicht als menschliche Vollabnahme umgedeutet.

Kosten nativ:12 heutige Aufrufe abgerechnet mit0,080449 USD.
Vier Reserven aus dem behobenen JSONB-Abschlussfehler bleiben mit0,848 USD
konservativ gebunden; insgesamt0,928449 USD gegen den30-USD-Deckel.
Keine neue offene Reserve, keine eingefrorene Buchung. Kommunikation
bleibt gesperrt. Fremde Profile und historische Kostenvertraege
hashgleich. Keine weiteren Modellversuche oder Lasttests erforderlich.
Die nachfolgenden offenen Release1053-Aussagen sind historisch.
[Umsetzung, Nachweise und Rueckweg](betrieb/cem-einprofilbetrieb-20261105.md).

## Briefing-Anzeige nach Nutzerbefund (06.11.2026)

Der erneute Handy-Befund zeigt eine Luecke im bisherigen Betriebsnachweis:
Die heutigen Daten und der Lage-Text waren gespeichert, die Briefing-Startseite
zeigte ohne Tagesprioritaet aber ausschliesslich eine Leerkarte. Production
`86490251` und sein ausgeliefertes `client.js` sind bytegleich mit `main`;
kein alter Client-Cache als Ursache. Morgenlauf05:15 und Lage05:00 UTC
haben stattgefunden. Die Auswahl belegt derzeit keine Tagesprioritaet;
Vorgangsanlagezeit ist kein neues Quellen-Publikationsdatum.

PR1063 ist nach Pflicht-CI42181867677 auf `13c4c1e5` produktiv
(`dpl_6PcDh9jZHJt2CmBYhMRJErQaBXYp`, READY). Client und CSS bytegleich.
Der Fix zeigt vorhandenen, quellengebundenen Text ohne erfundene Prioritaet
und verwendet die gespeicherte Morgenlaufzeit. Die Nachkontrolle08:09 UTC
zeigte jedoch einen weiteren echten Leerfall: Lage verfuegbar, aber
`pendingNarrative:true`, null Absaetze und neun statt zehn Karten.
Der erste Browser-Nachlauf schlug deshalb ehrlich fehl; kein Abschluss-PASS.

Die Wien-Quelle vom23.10.,07:00 UTC liegt seit06.11.,07:00 UTC ausserhalb
des rollenden14-Tage-Fensters. Eine solche Aenderung der Quellen-/Vorgangsmenge
entwertet den gesamten Narrativ-Cache. Der Code und die fehlende Karte erklaeren
diesen Verlauf; ein nativer Vergleich der gespeicherten Cachehashes liegt nicht vor.
Der ergaenzende UI-Fix zeigt bei diesem ausdruecklichen Cache-Leerfall bis zu
vier vorhandene Lage-Zusammenfassungen mit Originalquellen, Quelldaten und
Verweisen. Reine Titel-Platzhalter bleiben ausgeschlossen. Keine neue
Generierung, keine gelockerte Cache-/Quellenpruefung, keine HTTP-Lesezeit als
Erstellungsdatum. Fehler und fehlende aktuelle Frischequittung bleiben gesperrt.
Astra-Review mit der echten Antwort bestaetigt vier substanzielle Zusammenfassungen.
Cache-Leerfall ausPR1069 nach Pflicht-CI42186838886 gemergt
(`5a01c311`). Abschliessend auf Production `4e53576e` mit
bereinigtem Client erneut nativ und im isolierten Browser geprueft:21/21 bei
1280/390/360 Pixeln. Vier vorhandene Zusammenfassungen samt Originalquellen,
Quelldaten und Lage-Verweisen sichtbar; keine reine Leerkarte, kein Ueberlauf,
keine JS-Fehler oder Generierungsaufrufe. Alte Cachetexte bleiben ausgeschlossen.
[Diagnose und Abnahme](betrieb/cem-einprofilbetrieb-20261105.md#briefing-anzeige-am-06112026).

## Einheitlicher Helmut: Altpfade und alte Deployment-Adressen (06.11.2026)

Neuer ausdruecklicher Betreiberauftrag: alte Systemteile pruefen und entfernen,
Helmut einheitlich betreiben; parallel nur Astra/GPT6.1 Sol, kein DeepSeek.
Sechs getrennte Audits bestaetigen einen normalen App-Einstieg und denselben
V3-Motor fuer App-Start/Briefing. Kein zweites Cem-V1-System und kein automatischer
V2-Rueckfall nachgewiesen. Marketingprojekt und historische Daten bleiben erforderlich.

Produktiv entfernt:58 unerreichbare Frontendfunktionen (darunter zwei alte
Briefingrenderer), zwei ungenutzte Blob-Briefing-APIs und ein toter automatischer
Refreshhelfer. Die alte branchabhaengige Testdatenaktivierung entfaellt; Production
weist den Testdatenschalter jetzt auch bei gesetztem Flag ab. Aktuelle
Mandantentrennung, Login, Profil-/Aufgaben-/Themenspeicher und drei Tagesjobs
bleiben erhalten. Unabhaengiger Astra- und Pipeline-Review ohne Blocker;
260 gezielte UI-,41 Cross-Tenant- und20 Mandantentrennungs-Assertions bestanden.
171/171 integrierte Chromium-Assertions bestanden. PR1070 nach beiden
Pflichtchecks auf `6377e473` (CI42189099678) gemergt. Production
`4e53576e` / `dpl_2SPTqnpJW5wCCWBevL91WKEpwipp` READY; ausgelieferte Client-/CSS-Bytes
identisch zum geprueften Stand. Abschliessender Replay mit echten gelesenen
Daten und diesen Bytes:21/21 auf Desktop/Mobil. Testdatenschalter in Production
gesperrt, aktueller Einstieg unveraendert; keine Daten-/Profil-/Budgetaenderung.

Alte eindeutige Production-URLs waren weiterhin direkt erreichbar, aber ohne
Verweis aus der aktuellen App. Deshalb Vercel Authentication fuer helmut-pilot
von `preview` auf `all_except_custom_domains` gestellt: bestehende/künftige
Deployment-Adressen schuetzen, regulaere Produktionsdomain ausnehmen. Kostenloser
Standard-Schutz, kein Abo/Deployment/Datenloeschen. Nativ08:37 UTC geprueft:
Hauptdomain und Release-Status HTTP200; alte und aktuelle eindeutige URLs samt
Alt-Clientdateien HTTP302 zur Vercel-Anmeldung. Projektfeld erneut bestaetigt.
Rueckweg ist dasselbe Projektfeld mit `preview`. Historische Builds bleiben
fuer berechtigte Betreiber/Rueckwege erhalten; keine vollstaendige Loeschung behauptet.
Die alte lokale Verwaltungsvorschau ist kein produktiver Einstieg und wird wegen
paralleler Verwaltungsarbeit inPR1067/1068 hier nicht abgebaut.

## Navigation und Verwaltung live (06.11.2026)

[PR #1057](https://github.com/ernisch/helmut-pilot/pull/1057) nach ausdrücklichem
„merge wenn grün“ auf `7d115a41fb84598fcc3849ed556ad0ede31d65b5` gemergt.
Tagesinput ist in der UI pausiert, einschließlich gespeicherter Ansicht und Formular.
Der doppelte Admin-Eintrag entfällt; Profil & Einstellungen führt für Admins zur
Verwaltung, dort erhält **Erweiterte Werkzeuge** alle bisherigen Admin-Bereiche
mit Rücklink. Funktionen und Daten bleiben erhalten.
Die verbindliche Wiedervorlage und schrittweise Zielzuordnung stehen in
[OP-32 und OP-33](datenmotor-restliste.md#op-32--tagesinput-bewusst-pausiert-06112026-p3).
Gezielt geprüft: Syntax, Schnellkern 14/14, Verwaltungsnavigation 8/8,
Browser-Smoke 78/78. Übergangsweg im echten Browser bei 1280 und 390 Pixeln
bestanden, alle sieben Werkzeugbereiche erhalten; Referenten und Abgeordnete
erhalten keinen Verwaltungszugang (HTTP403, kein Link/URL-Einstieg).
Beide Pflichtchecks auf Kopf `abeecebb` erfolgreich:
[CI 42119327817](https://github.com/ernisch/helmut-pilot/actions/runs/42119327817),
176/176 Standard- und 332/332 Bereichssuiten, Browsercheck und isolierte
Datenbankprüfungen grün. Production-Deployment
`dpl_CJoBeMTV6V7MHeH86MuhM3iA1Qbj` READY auf Merge `7d115a41`, Alias
`helmut-pilot.vercel.app`. Lesende Nachkontrolle: Startseite HTTP200,
`client.js?v=7d115a41` bytegleich zur geprüften Datei, Tagesinput aus,
Verwaltung ohne Sitzung HTTP401. Kein authentifizierter Production-Klicktest;
dieser Übergangsweg wurde lokal mit echten Sessions geprüft.
Der umfassendere historische Verwaltungstest
stoppt im unveränderten Kontoclient an einer alten Null-IO-Erwartung beim Freigeben
eines Kontos; die gezielte Navigationsauswahl führt keine Schreibaktion aus.
**12.11.:** [Kundenverwaltung](ui/verwaltung-einfach-20261111/README.md): Dropdowns wie im Profil, lokal geprüft; private Vorschau. PR1155 bleibt Draft ohne Merge.

## Verwaltung: Darstellungskorrekturen gegen Design v3 (06.11.2026)

[PR #1065](https://github.com/ernisch/helmut-pilot/pull/1065) nach ausdrücklichem GO gemergt (`67f96fca`); Production-Deployment `dpl_4urqDjr2Kicxjr61SuBn7EjvneYQ` READY, Alias `helmut-pilot.vercel.app`. Pflichtchecks grün (CI-Lauf 42182474226). Kein authentifizierter Production-Klicktest; Sichtprüfung lokal. Schritt 0: die
Übergabe-Vorlage ist bytegleich mit `verwaltung/claude-original/`. `/verwaltung/`
liefert bereits dieses Original. `verwaltung/styles.css`/`index.html` sind nur die alte
helle Vorschau und werden nicht ausgeliefert, deshalb sind sie unverändert.
Korrigiert sind nur sichtbare Abweichungen im Echtbetrieb, und zwar ausschließlich über
`original-adapter.mjs` und den Paketbauer (Original und Prüfsummen unverändert):
Aktualisieren-Knopf ohne Gold, neutraler Statusring statt Lücke am Seitenkopf,
einzeilige Navigation, Filterzähler „–“ statt „Nicht geprüft“, Kostenspalte ohne
Umbruch, Leerzustände für Kunden und Läufe. „Kunde anlegen“ und alle Funktionen
bleiben. `original-verwaltung-test.js` stoppt wie auf `main` an der bekannten alten
Null-IO-Erwartung. Auftrag abgeschlossen.

## Verwaltung: Briefing · Zustellung · Lage (06.11.2026, live)

[PR #1073](https://github.com/ernisch/helmut-pilot/pull/1073) nach ausdrücklichem GO gemergt (`68af1f1f`); Pflichtchecks grün (CI-Lauf 42193764133); Production-Deployment `dpl_6oNUBTr2i7hsWHmtUPTK5Y6fTbF4` READY, Alias `helmut-pilot.vercel.app`. Kein authentifizierter Production-Klicktest (Umgebung erreicht die Seite nicht); Sichtprüfung lokal. Ohne bestätigten Profilbestand (Schutz aus PR #1070) zeigt die Verwaltung auch keine Ergebniszahlen. Neu: das rein lesende Modul `lib/helmut/admin-ergebnisstand.js`
und die Route `GET /api/admin/ergebnisse?tag=&seite=&proSeite=` (nur Admin, ohne KI, ohne Schreiben).
Sie nutzt unverändert `pruefeZeile`/`pruefeInhalt` (frisch berechnet), `gespeicherterTextGueltig`
und die Quittungsbindung aus dem Ergebnisnachweis, aber ohne Testfenster. Gelesen wird in Stapeln
von 25 Profilen über `listRenderedBriefingsV3ForTenants` (mit `user_id`-Filter). Die Bilanz zählt
alle aktiven Profile. **Aktiv** ist `profileActive` aus `listFullProfiles`, also dieselbe Quelle wie
die Profilzahlen der Verwaltung. Stufe 4 „brauchbar“ wird nie abgeleitet, weil es kein gebundenes
Fachurteil gibt. Die Verwaltung zeigt Briefing · Zustellung · Lage, Radar nur im Profildetail
unter „Radar im Briefing“, „Wiederholung zwischen Ansichten“ statt „Doppelt“, ohne die Spalten
Brauchbar/Unbrauchbar. Ohne V3-Speicher bleibt alles „Nicht geprüft“.
Production-Lesebeleg 06.11. (nur Strukturfelder): 1 Paket mit `currentRadarState.anzeige`,
alle vier Radar-Abschnitte leer, `pruefung.fehler = [briefing-ohne-tagesanlass]`, `bestanden=false`;
1 Erfolgsquittung mit `ausgabeBeleg`; 1 Lage mit Text. Seit PR „ruhiger Tag“ gilt: Ist ein ruhiger Tag ausdrücklich markiert (`currentHelmutState.emptyState.kind = "quiet"`) und der fehlende Tagesanlass der einzige Befund, zeigt die Verwaltung „Vollständig · Ruhiger Tag“. Die gemeinsame Prüfung `pruefeInhalt` bleibt unverändert. Tests: 8/8 Modul, 6/6 Route (Rollen, Paging 20/500/2000), 5/5 Verwaltungsansichten.
Auftrag abgeschlossen. Nächster Schritt: Betreiber sieht sich die Verwaltung mit eigenem Login an.

## Oberstes Ziel: Mock100 PASS, dann Helmut sicher live

1. **Mock100 PASS**: exakt **100 gleichzeitig aktive synthetische
   Mandatsprofile** wurden vollstaendig und nachvollziehbar verarbeitet,
   ohne kostenpflichtige Helmut KI Modellaufrufe. Beleg: Run 42053461090.
2. **Danach Helmut sicher live bringen**: die vorbereitete UI und
   Backend Integration fertigstellen, notwendige Sicherheits-,
   Datenschutz-, Mandantentrennungs-, Funktions- und
   Kostenkontrollanforderungen fuer den ersten kleinen
   Kundenkreis erfuellen; geeigneten Produktstand auf `main`
   zusammenfuehren und Vercel Production ausrollen.
3. **Kein Production100 oder Production500 Lasttest.** Der
   Betreiber hat diese kostenpflichtigen Vollnachweise
   ausdruecklich verworfen. Kein Mock500 mehr und keine
   neuen mehrstuendigen Blindtests.

Push/Merge/regulaeres Deployment: [Dauerfreigabe11.11.](../AGENTS.md).
Datenmutation/bezahlter Aufruf: separates GO.

## Nachweisstand

| Meilenstein | Aktueller Stand |
| --- | --- |
| End500, historisch | **PASS**: [GitHub Run 41325430429](https://github.com/ernisch/helmut-pilot/actions/runs/41325430429), Commit f157d97f. Bereits bestandene Backup-, Restore- und Authnachweise nicht unnoetig wiederholen. |
| Mock500, historisch | **ABGEBROCHEN ALS PROJEKTZIEL, KEIN PASS**. [Run 41939166457](https://github.com/ernisch/helmut-pilot/actions/runs/41939166457) cancelled/UNKNOWN; [Run 41996804804](https://github.com/ernisch/helmut-pilot/actions/runs/41996804804) nach 176min02s FAIL im Controller. Innere Ursache und Profilfortschritt UNKNOWN, nicht null. Acht aeussere Bereinigungen PASS, native Datenbanknullaktivitaet nicht belegt. [Beleg PR1049](https://github.com/ernisch/helmut-pilot/pull/1049). |
| Mock100, neues Ziel | **PASS**: [Run 42053461090](https://github.com/ernisch/helmut-pilot/actions/runs/42053461090), exakt Commit `be0c6d1630f5987e755eb4030cc23a4f7d7247d7` nach [Pflicht-CI 42047654519](https://github.com/ernisch/helmut-pilot/actions/runs/42047654519). 100/100 Profile und 300/300 Ergebnisse nativ geprueft, 400 Tenant-/Quellenschutzkontrollen, alle fuenf Fehlerkategorien null; 296 simulierte Modellaufrufe, keine bezahlten Anbieteraufrufe. Nach 242,633 s einschliesslich Abschluss null aktive Profile, Bereinigung PASS. [Quittung und Fortschritt in PR #1052](https://github.com/ernisch/helmut-pilot/pull/1052) und [vollstaendiger Laufbericht](betrieb/mock100-20261105.md). Historischer erster [FAIL 42042488458](https://github.com/ernisch/helmut-pilot/actions/runs/42042488458) bleibt unveraendert. |
| Production100 / Production500 | **ABBESTELLT.** Keine neue Vollastpruefung mit echten KI Aufrufen, keine Kostenfreigabe. |
| Produktintegration und Livegang, historisch05.11. | **DAMALS RELEASE-PR #1053 IN PFLICHT-CI.** Privater Kandidat814c8b63 einschliesslich UI, Backend und main76b75e37 uebernommen; Vercel-Git-Sperre fuer den Releasebranch ergaenzt. Alte Browser-Testselektoren und verlorene Lage-Quellenfrische/Fallback korrigiert; Assetversion erneuert. Browser78+19 und Standard-Offlinesuite auf9feb9969 PASS; Bereich330/332. Zwei alte Profil-/Splash-Testannahmen gezielt korrigiert (5/5 HTTP,33/33 VM), ohne weiteren Produktfix. Pflicht-CI wird auf dem neuesten PR-Kopf abgenommen; main-Merge und Production bleiben gesperrt. [Uebernahme](betrieb/release-ci-20261105.md), [lokale Abnahme](betrieb/release-prep-20261105.md). |

## Neuer Testumfang und Arbeitsweise

Verbindlich ist **Mock100** mit genau 100 gleichzeitig
aktiven, vollstaendig fiktiven Profilen aus Bundestag,
Berlin und Brandenburg. Die fruehere 330/120/50
Verteilung ergibt 66/24/10; diese konkrete synthetische Auswahl
ist im neuen Diagnosepfad reproduzierbar hashgebunden.
Keine realen personenbezogenen Testprofile.

Der bestandene Vollversuch umfasst 100 Profile, 200 simulierte
Entwurfs-/Pruefphasen und 96 separat ausgewiesene Understanding-
Simulationen (insgesamt 296). Alle 300 Ergebnispositionen wurden
nativ geprueft.
Weitere vorbestehende Schutz- und Kontrollanforderungen
sind technisch korrekt auf 100 abzubilden, nicht
blind aus alten 500er Artefakten als PASS uebernehmen.
Bestehende gueltige Sicherungs- und Restorebelege
wiederverwenden, soweit sachlich zulaessig.
Ein wirklicher Mock100 PASS erfordert einen
tatsaechlichen vollstaendigen 100er Lauf und
belastbare Profil-, Ergebnis- und Abschlussbelege.

**Neue Effizienzregel:** Erstfehler und letzten bestaetigten
Fortschritt aus dem schon bestehenden Controllerkanal
zuverlaessig erhalten, danach zielgerichtete Unit und
Integrationstests, dann genau der noetige synthetische
Mock100 Gesamtversuch. Keine weiteren Blindtests,
zusaetzlichen Teststufen, neuen Runner oder
Infrastrukturprojekte ohne konkrete Notwendigkeit.

## Noch relevant

- Der letzte 500er Controllerfehler ist **nicht aufgeklart**.
  Der Verlust seiner ersten inneren Fehler- und
  Fortschrittsdetails ist nachgewiesen. [PR1049](https://github.com/ernisch/helmut-pilot/pull/1049)
  ist nur Dokumentation; keine Runtimekorrektur oder
  Mock100 Freigabe.
- Mock100 PASS wurde auf dem unveraenderten, vollstaendig geprueften
  Runtimecommit `be0c6d1630f5987e755eb4030cc23a4f7d7247d7` belegt.
  Der originale freie Diagnosepfad aus PR1050 wurde auf main 8901385d
  angepasst. Die native Drei-Profil-Probe, Pflicht-CI und unabhaengige
  Abschlusspruefung waren erfolgreich. Historische W15-Originale,
  Runtimepins, Claims und STOP-/UNKNOWN-Belege bleiben unveraendert.
  Aeltere FAIL-/GO-offen-Aussagen in ueberlieferten Commits sind
  ausdruecklich historische Zwischenstaende, keine aktuellen Blocker.
- UI und Backend Integration sowie die fuer den
  ersten zahlenden Kunden erforderliche Produktsicherheit
  sind getrennt nachzuweisen. Ein simulierter
  Mock100 PASS ist kein Production Funktionsnachweis.
- Vorhandenes Vercel Production Deployment war
  bei letzter lesender Pruefung READY, aber das
  beweist keinen aktuellen Stand der neuen
  Produktintegration. Es wurde nichts neu deployed.

## Private Produktintegration (05.11.2026, lokal geprueft)

PR #1052 ist auf `76b75e371c7db69d7c9381071e23443182fc3607` gemergt. Der bestandene Mock100-Meilenstein bleibt abgeschlossen und wird nicht wiederholt. Der private Branch `integration/release-prep-20261105` verbindet diesen main-Stand mit Backend/UI `3c5765c577b35641ba107a4d6b863ab1e5ab7456`. Kontosicherheit, beide Designs und historische Belege bleiben erhalten. Die [vorige lokale Integration](betrieb/backend-ui-integration-20261105.md) und [UI-Abnahme](ui-backend.md) bleiben historische, quellengebundene Belege. Vier gezielte Gruppen mit202 echten lokalen HTTP-Antworten bestanden. Zwei inhaltsgebundene Assetversionen beseitigen den belegten Altcache-Erststartfehler. Motor, beide Designs und historische Nachweise unveraendert; drei lesende Reviews positiv. Main-CI42069590393 gruen, Kandidaten-Pflicht-CI noch offen. [Abnahme und konkrete Mergevoraussetzungen](betrieb/release-prep-20261105.md). Keine Productionfreigabe.

## Designangleich und UI-Aufraeumen (06.11.2026, erfolgreich abgeschlossen)

Nach Betreiber-GO bei gruener Pflicht-CI gemergt und live: [PR #1055](https://github.com/ernisch/helmut-pilot/pull/1055) (Merge `8649025`, Design nach freigegebenem Claude Design, Desktop/Mobil, alle Vollbild-Karten, dunkles Favicon, Startbild mit ruhigem Puls) und [PR #1058](https://github.com/ernisch/helmut-pilot/pull/1058) (Merge `00ecd5f`, 108 nie aufgerufene Client-Funktionen und 768 CSS-Regeln ohne genutzte Klassen entfernt, Zugangs-/Passwort-/Rechtsseiten im Design). Production-Deployment `dpl_5Xs3rTFGmhuEUXWR1sBGmWmiEm8A` READY; `/api/release/public` ok/ready/storage true; keine Laufzeitfehler seit Deployment (06.11.2026, lesend geprueft). [PR #1088](https://github.com/ernisch/helmut-pilot/pull/1088) (Merge `82cb3cb`, Briefing-Aufbau nach Design; Betreiberentscheidung: ruhiger Tag zeigt ehrlichen Leerzustand mit Lage-Themenzahl statt Lage-Liste) live: `dpl_6ucJseSYamRPDN71U55GppKAKcem` READY, `/api/release/public` ok/ready/storage. Naechster Designschritt: Aufbau von Lage, Radar, Buero, Profil. Nur Darstellung. Lokale Altfehler: `kalender-ics-test.js` (`ical.js` fehlt), `admin-nutzer-loeschen-test.js` (`#ff5967`).

## Genau ein naechster Schritt

**App-Start (06.11.2026):** PR1078/1081/1085 nach GO/Pflicht-CI live; PR1085`2a5e0774`, Vercel`dpl_45AMnvEB1XmP3jh5Xa7QGRb3nSgc`READY. HTTP-Median4,836→4,234s; HTTP200, Briefing/10Lagekarten, kein Androidwert.
Installierte Brave-App haengt im nativen Android-Bild, Hauptadresse funktioniert; Geraeteursache offen. Folgefix vorbereitet: Icon-/Manifestfarbe angleichen,8s Workerfrist mit Wiederholungsansicht. Briefing vor App-Oeffnung, keine private Cacheansicht.
Worker7/7, Icons70/70, echter Worker-Wiederholungsfall und Browser82/82 bestanden. [Vollstaendige Messungen, Rollout und Befunde](betrieb/app-start-performance-20261106.md).
**Mobiler Start (11.11.):** [Befund](betrieb/mobiler-start-20261111.md): Brave schwarz, anderer Browser geht; Neuinstallation offen.
Keine weiteren synthetischen Vollversuche oder bezahlten Lasttests.

Historische alte Anweisungen, darunter [`ROADMAP_BIS_500.md`](ROADMAP_BIS_500.md), sind keine aktuellen Testauftraege. Alle alten Laufbelege,
STOPs, UNKNOWNs, Grants und Journale bleiben erhalten.
Vor konkreten Production Aktionen Wirkung, Risiko,
Kosten, Nachkontrolle und Rueckweg benennen.
