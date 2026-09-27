# Ein gemeinsames Bereichspaket: begrenzter Auftrag27.09.2026

Roadmap3.1, technischer Plan vor Ausfuehrung. Noch kein Productionlauf und keine
Drei-Bereiche-Abnahme. Betreiberauftrag:7USD insgesamt,6USD je UTC-Tag,
alle500 Profile weiterhin inaktiv. Keine erneute Aktivierung oder500er Test.

## Umfang, Wirkung und Grenzen

Genau ein bestehendes inaktives Profil, gebunden an
`0178727cc56dc0c9b8a0d17a655bfe434b0aecab80b92debed92e74175a4b869`.
Production-Umgebung, fest27.09.; neuer Auftrag `bereichspaket-20260927-a`.
Die Vorlage `bereichsurteil-vorlage-20260927-a` darf einmal neu in helmut_store
hinterlegt werden. Das ist eine gesonderte Kontrollvorlage, noch kein importiertes
Fachurteil. Ihr vollstaendiger Hash ist Workfloweingabe; private Texte stehen
nicht im Repository oder Workflowinput.

Plan liest nur. Der explizite Ausfuehrungsmodus beansprucht eine neue Quittung
und globale Sperre, importiert das Urteil ausschliesslich ueber den geprueften
v2-Writer und liest es mit dem normalen Nachlaufleser zurueck. Danach maximal
zwei bezahlte Aufrufe: Entwurf low/3000, Pruefung medium/6000. Vier Minuten
harte Prozessgrenze, maximal0,436USD, keine Wiederholung. Vor jedem Transport
bleiben120s Transportzeit plus15s Reserve. Das Speichern nach zwei Aufrufen
hat einen eigenen Zustandscheck und ist ausdruecklich kein dritter Aufruf.

Auftrag/Tag/Profil/Inhalte/Quellen/Commit sind gebunden; veraenderte Eingabe,
Bestand, Kosten, laufende Fremdarbeit oder vorhandene Tagessaetze sperren.
Neue Urteils-, Lage- und gemeinsame Briefingzeile sind hoechstens einmal
moeglich. Kein Profil-, Identitaets-, Aktivierungs-, Cron- oder Environmentwrite.
Der Lauf behaelt den bestehenden atomaren Tages-/Auftragsriegel. Vor Start
muessen0,436USD frei sein; vor dem Review mindestens dessen0,224USD.

## Fachliche Voraussetzung

Private Eingabe:98 Aussagepfade,31 manuell gelesene Text-/Kontextgruppen,
vier Quellen, drei Vertragsobjekte, eine heutige Briefingprioritaet und ein
Radarhinweis. Alle42 konkret zurueckgehaltenen Altobjekte bleiben als nicht
abgenommen ausgewiesen;455 weitere sind ausserhalb des begrenzten Umfangs.
Der gebundene Fachbeleg prueft diese begrenzte Briefing-/Radar-Eingabe,
keine noch nicht erzeugte Lage und keine500er Versorgung.

Hash der korrigierten Eingabe:
`bad90be36ec0a755e1cde1190b9054b819fa493df505ca8378c40167d0ed4bc2`.
Hash des gesonderten Urteils:
`86a12b19fef7e9754a1aacf19ac1151d5ac85d1488e3ed471179afeb877517dd`.
Private Dateien: `/private/tmp/helmut-budget7/fachurteil.json` und
`fachurteil.cjs`; das Skript expandiert nur Aliase der fest geprueften Eingabe
und bricht bei einem anderen Hash ab. Kein automatisches Positivurteil fuer
unbekannte Inhalte. Die Quellenfakten gehen nicht ueber gespeicherte Auszuege
und den separat gelesenen Mediathek-Kopf hinaus.

## Risiko, Kontrolle und Rueckweg

Ein Modell kann fachlich scheitern, der Transport kann einen unklaren Ausgang
hinterlassen oder die Nachkontrolle kann abbrechen. Dann kein Erfolg, kein
Retry, Quittung und volle ungeklaerte Kosten erhalten. Ein hart beendeter
Prozess darf eine laufende Quittung behalten; auch diese verhindert Wiederholung.

Anschliessend: Quittung, Kosten, drei Tagesslot-Zaehler/-Hashes, alle500 inaktiv,
vollstaendige Profil-/Identitaetshashes und freigegebene Sperre rein lesend
kontrollieren. Inhaltlich werden alle tatsaechlich gerenderten Texte der drei
Ansichten verglichen. Ein gespeichertes Paket allein ist kein Fachnachweis.

Rueckweg: keine Altzeile ueberschreiben oder loeschen. Bei unbrauchbarem
Neuergebnis genau dessen ID und Vollhash sichern und es mit eigenem belegtem
Korrektur-/Quarantaeneauftrag behandeln. Urteile, Quittungen und Kosten nicht
wiederverwenden. Der bislang unveraenderte Bestand braucht keine Ruecksetzung;
das einzelne Profil bleibt wie alle500 inaktiv.

## Lokale Absicherung

10 gezielte Gruppen: fester Runtimeauftrag, beide Budgets, Plan ohne Writes,
wirklicher Hookablauf Generate/Review/beforeSave, bestehende/aktive Profile,
abgelehnter Import, Drift nach Review, dritter Aufruf, fehlende Ruecklesung
und Zeitverbrauch beim Lesen. Private End-to-End-Speicherpruefung des v2-
Imports im vorherigen PR; kein fiktives Testergebnis wird als Productionbeleg
gewertet. Ein eigener Helfer wurde hier nicht gestartet.

## Tatsaechliche lokale Renderer-Gegenprobe

Die echte Briefingansicht zeigt eine Tagesprioritaet, Quellenstand26.09. und
Nicht-aktuell-Kennzeichnung. Radar zeigt den Originaltitel der eigenen Rede,
Quellentag25.09. und die ausdruecklich fehlende Ton-/Resonanzbewertung.
Die Lage ist weiterhin leer; deshalb keine Drei-Bereiche-Abnahme.
Vier pauschale Radar-Leertexte behaupteten noch fehlende Entwicklungen trotz
begrenzter Ansicht. Sie benennen jetzt ausschliesslich die fehlende Anzeige
entsprechender belegter Hinweise; keine allgemeine Entwarnung.

Die automatische Freigabepruefung hat selbst die transaktionale Probe der
Vorlagenuebertragung am27.09. wegen des vollstaendigen privaten Fachurteils mit
profilnahen Aussagen abgelehnt. Nichts wurde uebertragen. Eine ausdrueckliche
Freigabe genau der privaten Datei, der neuen Kontrollvorlage und des Zielprojekts
`ddckuvvpcytqbyfmbvie` ist beim Betreiber angefragt. Kein anderer Transportweg
umgeht diese Sperre. Codepruefung und regulaere Deployments laufen unabhaengig
weiter; der Daten-/Modelllauf bleibt bis zur Antwort gesperrt.


## Freigabe, Uebertragung und technische Planabbrueche27.09.

Der Betreiber hat auf die konkrete Freigabefrage zur Datei `fachurteil.json`,
Zielprojekt und neuen Kontrollvorlage geantwortet: "Ja. Du hast die Freigabe."
Die zuvor genannte automatische Sperre ist damit fuer genau diese Uebertragung
aufgehoben. Erst eine zurueckgerollte Transaktionsprobe, danach derselbe Insert
mit Commit. Der anschliessend unabhaengig gelesene gesamte JSON-Inhalt ist
kanonisch identisch zur freigegebenen Vorlage; genau eine Kontrollzeile.

[PR645](https://github.com/ernisch/helmut-pilot/pull/645), Pflicht-CI
[36305781781](https://github.com/ernisch/helmut-pilot/actions/runs/36305781781)
am Kopf5144b3de gruen, Merge `df5c08a437e9f51c6e871a0163d4b0f0207c37ba`,
[Production READY](https://vercel.com/nohut/helmut-pilot/HggStF3r6YC7Q7epmvzME3N4McqV).
SQL-Nachkontrolle08:32:12UTC:500 Mandatsprofile inaktiv,501 Identitaeten,
volle Profil-/Identitaetshashes unveraendert,0 Jobs/Locks/Leases. Authhash
`2716e1ad0234a0d49c889dad51a6adfb3fb104d0a12bba7967961c94af0a70e2`
unveraendert; insgesamt6,387592USD gebunden,0,612408USD frei.

Planlaeufe [36306517067](https://github.com/ernisch/helmut-pilot/actions/runs/36306517067)
und [36306625183](https://github.com/ernisch/helmut-pilot/actions/runs/36306625183)
an df5c08a4: beide `bereichspaket-technischer-fehler`, kein Ausfuehrungsmodus,
keine Modellzugangsdaten und kein bezahlter Aufruf. Nach genau einer rein
lesenden Wiederholung keine weitere blinde Wiederholung. Der neue Diagnosepfad
nennt ausschliesslich feste Leseschritte, bekannte Fachfehler und Zeitabbrueche;
keine freie Fehlermeldung, URL, Profilkennung oder Payload.12/12 gezielte
Gruppen bestanden, darunter Datenschutz der Diagnose und unveraenderte
negative Fachablehnung. Keine Grenzerhoehung, keine automatische Wiederholung.


## Belegte Ursache und neue Bindung der unveraenderten Inhalte

[PR646](https://github.com/ernisch/helmut-pilot/pull/646) nach gruener Pflicht-CI
[36307266025](https://github.com/ernisch/helmut-pilot/actions/runs/36307266025)
gemergt als `f1a5f97616b15a3b0daf0775d626d92c53cfb089`,
[Production READY](https://vercel.com/nohut/helmut-pilot/9ygiZ9FbLPPCsQNAaFUTBbzPJbk9).
Der gezielte Plan [36307911426](https://github.com/ernisch/helmut-pilot/actions/runs/36307911426)
belegt `briefing-korrektur-abweichend`, Phase `fachaufbau`. Kein bestaetigter
Transportfehler. Die frische09:01-SQL-Pruefung bestaetigt den unveraenderten
500er Quellen-/Wissenssnapshot
`8b4e164866f72f5918a272a97cf4ab2029ec3ae6fb08ee46a5d531ed4a7ce276`.

Der lokale Vergleich belegt die Abweichungen des vorbereitenden Lesemodells:
Quellen waren lokal nach Kennung statt wie im echten Leser nach Publikationszeit
sortiert. Bei20 gleichen Updatezeiten standen22 Wissensobjekte ohne eindeutigen
Sortierzusatz anders. Der Profilzeitpunkt war derselbe, lokal aber als SQL-Text
statt JSON-Zeitwert dargestellt; die gesamte fachliche Profilbindung ist gleich.
Mittlerweile gilt seit11Uhr Berlin der Mittagsslot. Diese Unterschiede duerfen
nicht durch Abschwaechen der Hashpruefung oder einen eingefrorenen Morgenslot
uebergangen werden.

Korrektur: Wissensobjekte werden bei gleichen Updatezeiten VOR dem Limit nach ID
geordnet, Quellen mit festem ID-Zusatz und danach wie bisher neueste zuerst.
Die Vorpruefung verwendet dieselbe Reihenfolge und den frisch nachgelesenen
Profilkontext. Echte Storage-Leser gegen lokalen HTTP-Transport pruefen den
Gleichstand am Limit und Quellenreihenfolge;6 bestehende Quellenlesepfade gruen.
Alle98 Aussagepfade,4 Quellen und sichtbaren Texte bleiben vollstaendig gleich.
Die Darstellung unterscheidet sich nur im internen `briefingType` (midday).
Alle strengen Einzel-/Gesamturteile wurden gegen die neue Bindung validiert.

Neue private Datei `/private/tmp/helmut-budget7/fachurteil-mittag.json`, neuer
Kontrollschluessel `bereichsurteil-vorlage-20260927-b`. Die erste Vorlage bleibt
unveraendert.15 Aenderungen betreffen ausschliesslich Hashbindungen, keine
Urteile, Begruendungen, Quellentexte oder Profilinhalte:

- Ursprung: `82f896677b385397f49436794acd3732ea49757205c0288a8755582a6f2fb871`
- Eingabe: `646504e262054afd1e6dc72551e303ea2bf8b3ab9865ded0e4b06ea8b72b6b82`
- Gesamte Vorlage: `9005bfdee5e9fe38f83083d89c7b580b31c56fc6ddcb4f3e3c2f9fdbc3b529fe`

Die automatische Freigabepruefung hat auch die zurueckgerollte Probe dieser
neuen Vorlage abgelehnt: neuer Schluessel und geaenderte Bindungen seien nicht
von der konkreten Freigabe fuer Vorlage a umfasst. Neue konkrete Freigabe beim
Betreiber angefragt; b wurde nicht uebertragen. Codekorrektur laeuft unabhaengig
weiter. Laufquittung bleibt unbenutzt, Grenzen2 Aufrufe/240s/0,436USD sowie
7USD insgesamt/6USD taeglich unveraendert. Kein Modell- oder500er Nachweis.


## Freigabe b und bestandene Vorpruefung27.09.2026

Der Betreiber bestaetigte Vorlage b ausdruecklich und beauftragte, die autonome
Roadmap-Dauerfreigabe in AGENTS.md zu konkretisieren. Die oben dokumentierte
Ablehnung ist damit fuer b erledigt. Keine Kosten- oder Schutzgrenze wurde
angehoben. Vorlage a bleibt erhalten.

PR647 ist nach beiden gruenen Pflichtpruefungen am Kopf2d586bd1 gemergt als
`502ee5bc088dcecb22128862e10d28cb8d9e44de`,
[Production READY](https://vercel.com/nohut/helmut-pilot/E2jDPfTKi4DE2VYi1WSciifqFDYS).
Nachkontrolle09:28:23UTC:500 inaktiv/501 Identitaeten, volle Bestands-/Authhashes
unveraendert,0 Jobs/Locks/Leases; keine error/fatal Logs im kontrollierten Fenster.

Die exakt freigegebene Vorlage b wurde nach erfolgreicher Transaktionsprobe in
Supabase ddckuvvpcytqbyfmbvie unter `bereichsurteil-vorlage-20260927-b` gespeichert.
Unabhaengige Vollruecklesung: exakt eine Zeile, gesamter JSON-Inhalt identisch mit
der freigegebenen Datei und dem oben dokumentierten Hash. Rueckweg: neue Vorlage
unbenutzt lassen; keine bestehenden Fachausgaben oder Profile wurden ersetzt.

[Plan36309700686](https://github.com/ernisch/helmut-pilot/actions/runs/36309700686)
am Commit502ee5bc bestanden: korrekte Eingabe646504e2,4 Quellen,3 Vorgaenge,
maximal2 Aufrufe/0,436USD/240s. Reiner Leseschritt09:32:43 bis09:33:16UTC,
kein Modellzugang, keine Laufquittung verbraucht, kein fachlicher Gesamtnachweis.

Die Ablaufpruefung zeigt ein Zeitrisiko vor dem ersten Modell: Der Urteilsimport
baut fuer jede Frischekontrolle Original und Korrektur erneut auf. Bei der
beobachteten Dauer der zwei Planaufnahmen koennten die vielen Einzelabfragen
bereits die105s-Vorstartgrenze verbrauchen. Deshalb vor dem bezahlten Lauf ein
eng aktivierter Stapelleser: nur der Bereichspaket-Builder verwendet ihn,
25 Vorgangskennungen je Request, maximal8 Requests gleichzeitig und weiterhin
40 nach ID geordnete Quellkanten je Vorgang. Danach dieselbe Publikationssortierung
und derselbe Originaltextleser. Jede Frischepruefung liest erneut; kein Cache,
keine ausgelassene Pruefung, keine vergroesserte Zeit- oder Kostengrenze.
Dokumentiertes PostgREST-Verfahren: [Limit und Ordnung eingebetteter Ressourcen](https://docs.postgrest.org/en/v13/references/api/resource_embedding.html).

Gezielter lokaler Nachweis gegen echte Storage-Leser:225 Eingaben vollstaendig
identisch,9 statt225 HTTP-Anfragen, maximal8 parallel,40er Grenze je Vorgang und
frische Quellenaenderung belegt; fehlende/fremde/doppelte Daten und Transportfehler
sperren.12 Ablaufgruppen und6 bestehende Quellenlesepfade bestanden. Keine
lokalen Modellkosten; kein zusaetzlicher Helfer wegen der engen Kostenreserve.
Die neue Lesestrategie muss nach Deployment denselben Production-Eingabehash in
der rein lesenden Vorpruefung bestaetigen, bevor der Modelllauf startet.


## Stapelleser: Production-Vorpruefung und Umlautkorrektur

[PR648](https://github.com/ernisch/helmut-pilot/pull/648) am Kopf8caa42e3 mit
beiden Pflichtpruefungen gruen (Run36309993159), Merge
`a28d00dadd25bb06cd2a9232856604322c791c1a`,
[Production READY](https://vercel.com/nohut/helmut-pilot/3CA1bBmfiqFyyXQb1NoY8wKYg6ZL).
Nachkontrolle09:50:14UTC:500 inaktiv/501 Identitaeten, volle Bestands-/Authhashes
unveraendert;2 Kontrollvorlagen, keine Laufquittung,0 Jobs/Locks/Leases.

[Vorpruefung36310639711](https://github.com/ernisch/helmut-pilot/actions/runs/36310639711)
stoppte in fachaufbau vor Modellen. Lokale Ursachenpruefung mit allen500
Originalkennungen:86 enthalten ü/ä/ö/ß, keine ist zu lang, alle sind eindeutig
und entsprechen der bestehenden ko-Vorgangsbindung. Die neue ASCII-Pruefung war
zu eng; der bisherige Einzelleser erlaubt diese Kennungen bereits.
Korrektur: Unicode-Buchstaben und Ziffern erlauben, Quotes, Klammern und
Filteroperatoren weiterhin sperren; unveraenderte URL-Kodierung und Umfangsgrenzen.
Echter lokaler Einzel-/Stapelleservergleich enthaelt jetzt Umlautkennungen.
Bekannte feste Stapelleser-Fehlercodes werden ohne private Inhalte sichtbar.
Keine Wiederholung des bezahlten Auftrags, keine neue Kostenbindung oder
Laufquittung; gezielte Vorpruefung erst nach Korrekturdeployment.


## Einmallauf36311505665: fachlich abgelehnt, Kosten geschlossen

[PR649](https://github.com/ernisch/helmut-pilot/pull/649), Pflicht-CI36310784711
am Kopfe1d05c1c gruen, Merge `b3a7ffaf5ee48c57c590c090fec24ae7219ab12f`,
[Production READY](https://vercel.com/nohut/helmut-pilot/HiDi9FZBgqN4XdJbnj1ao22r4xph).
Vollvergleich aller500 lokal gesicherten Originaldatensaetze: beide echten
Storage-Leser liefern dieselben967 Quellen, Vollhash
`69b4972d93a755f910a72440d7dcb74991061006904890ed650816e5cb0e092c`.
20 statt500 HTTP-Anfragen; kein neuer Productionabruf fuer diesen lokalen Test.

[Plan36311432521](https://github.com/ernisch/helmut-pilot/actions/runs/36311432521)
bestanden: gleicher Eingabehash646504e2,4 Quellen/3 Vorgaenge, reiner Leseschritt
10:05:55 bis10:06:06UTC statt zuvor32s. Nachkontrolle10:05:32UTC ohne Drift.

[Einmallauf36311505665](https://github.com/ernisch/helmut-pilot/actions/runs/36311505665)
10:07:18–10:09:15UTC:2 freigegebene Modellaufrufe,0,019921USD,0 offene Kosten,
keine automatische Wiederholung. Quittung `bereichspaket-20260927-a` gestoppt
und verbraucht. Das freigegebene Briefing-/Radar-Urteil wurde neu importiert und
zurueckgelesen; Entwurf und Modellpruefung sind als nicht auslieferbare
`lage-pruefentwurf`-Belege gespeichert. Keine Lage und kein Gesamtpaket.

Die Quellenpruefung lehnt Absatzindex1 (den zweiten Absatz) korrekt ab:
`profilbezug-fehlt`. Der Mediathek-Titel belegt Sitzung, Tagesordnung und den
Namen des Redners, aber keinen fachlichen Inhalt und keine Zustaendigkeit des
gewaehlten Ausschusses. Die private Auswahlnotiz hatte diese Verbindung
hinzuerfunden. Das Quellenurteil wurde weder positiv umgedeutet noch der
beanstandete Absatz nachtraeglich aus dem bezahlten Ergebnis entfernt.
Private Vollbelege: `/private/tmp/helmut-budget7/entwurfsbelege-36311505665.json`.

SQL10:10:46UTC:500 Profile inaktiv,501 Identitaeten, volle Bestandshashes
unveraendert,0 Jobs/Locks/Leases. Tagesverbrauch27.09.0,041091USD, insgesamt
6,407513USD gebunden,0,592487USD frei. Keine offene Productionreservierung.

## Begruendeter Folgeauftrag nach der Namensfehlbindung

Innerhalb der erneuerten Dauerfreigabe vom27.09.: neue Quittung
`bereichspaket-20260927-b`, derselbe feste Tag, dasselbe einzelne inaktive
Profil und dieselbe bereits gepruefte Eingabe/Vorlage b. Der Vorgänger wird
exakt auf Run36311505665, dessen Commit, geschlossene Kosten, unveraenderten
Profilbestand und den konkreten fachlichen Ablehnungsgrund gebunden. Kein
allgemeiner Retryparameter; a bleibt unveraendert und verbraucht.

Sachliche Korrektur: Entwurf UND separater Quellenpruefer erhalten dieselbe
Regel: ein blosser Namens-/Mediathekbeleg ohne fachlichen Inhalt gehoert in
Radar, nicht als erfundene Ausschussmeldung in Lage. Ein Titel mit eigener
konkreter Fachaussage bleibt nach den bestehenden Regeln zulaessig. Keine
Quelle, Tatsache, Profilangabe, Absatzgrenze oder Qualitaetssperre wird veraendert.
Die erwartete Verbesserung bleibt bis zum echten Folgelauf unbewiesen.

Der Folgeauftrag prueft das vorhandene importierte Urteil vollstaendig und
frisch vor Modellen/Speichern. Kein erneuter Urteilsimport, keine Aenderung
bestehender Urteilszeilen. Vorhandene Lage/Briefingausgabe sperrt. Nur neue Lage
und neues Gesamtpaket koennen nach erfolgreicher Pruefung entstehen. Plan bleibt
rein lesend, Ausfuehrung separat gebunden. Maximal2 Aufrufe,0,436USD,240s; alte
Kosten zaehlen weiter,7USD insgesamt/6USD taeglich unveraendert. Rueckweg:
bei Ablehnung keine auslieferbare Ausgabe, neue Quittung beenden, Sperren
freigeben und Kosten bilanziert halten; kein Loeschen oder Ueberschreiben.
Nachkontrolle wie beim ersten Lauf, danach die drei echten Ansichten fachlich
abnehmen. Lokale Abnahme:15 Ablaufgruppen einschliesslich falschem Vorgänger,
Urteilsdrift, fehlendem/gesperrtem Bestand und0 erneuten Importen; anonymisierter
Namensbeleg bleibt bei negativem Mandatsurteil abgelehnt. Kein Modellbeweis durch
synthetische Tests.

## Folgeauftrag b: vollstaendiges Paket, Anzeigeadapter korrigiert

PR650 ist als `4a83b3875965b4aeaab9126fb8c903cce1bfa208` ausgerollt
(Vercel `dpl_4X6tqDoWtQb1KSgPzZq8XWb33cYD` READY). Rein lesender Plan
[36312750954](https://github.com/ernisch/helmut-pilot/actions/runs/36312750954)
und begrenzter Folgelauf
[36312820431](https://github.com/ernisch/helmut-pilot/actions/runs/36312820431)
erfolgreich:2 Modellaufrufe,0,022990USD, vollstaendiges Paket gespeichert und
zurueckgelesen, Quittung b geschlossen. Drei gepruefte Lageabsaetze aus drei
Quellen zu zwei Vorgaengen; der reine Namensbeleg bleibt im Radar.
Das ist zunaechst ein technischer Paketnachweis, keine fachliche Bereichsabnahme.

SQL10:34:24UTC:500 Profile inaktiv/501 Identitaeten und Bestandshashes
unveraendert,0 Jobs/Locks/Leases/offene Productionkosten. Alte Quittung a und
importiertes Fachurteil vollstaendig hashgleich. Tagesverbrauch0,064081USD;
6,430503USD einschliesslich externer Reservierungen gebunden,0,569497USD frei.
Die beiden heutigen Bereichslaeufe zusammen kosten0,042911USD.

Die erste lokale Aufnahme mit dem echten Client-Renderer zeigte einen
Produktfehler: `lageAusgabe` lieferte Absaetze, aber keine Vorgangskarten.
Der gespeicherte App-Lesepfad benutzt denselben Adapter; die Lage blieb deshalb
sichtbar leer. Die Korrektur uebertraegt nur nach dem bestehenden Quellenvertrag
gueltige gespeicherte Absaetze in Karten und vollstaendige Detailtexte. Gruppiert
wird nach Vorgang, Quellen kommen ausschliesslich aus den zitierten Absatzbelegen.
Keine neuen Fakten, Empfehlungen, Modellaufrufe oder Datenbankaenderungen.
Alte/ungueltige Quellenvertraege ergeben keine neuen sichtbaren Karten.

Gezielte lokale Abnahme:24/24 Vollstaendigkeitsgruppen, einschliesslich echtem
Client-Renderer, vollstaendigen Detailtexten, exakten Links, ausgeschlossener
unbenutzter Quelle, unveraendertem Payload und negativen Quellenhash-/Versionsfaellen.
Nach Merge und Deployment dasselbe gespeicherte Paket erneut aufnehmen und
alle drei sichtbaren Bereichspaare beurteilen. Kein weiterer bezahlter Lauf.

## Ausrollung und gemeinsame semantische Abnahme

[PR651](https://github.com/ernisch/helmut-pilot/pull/651), Kopf61b357d2:
beide Pflichtpruefungen in
[CI36313317750](https://github.com/ernisch/helmut-pilot/actions/runs/36313317750)
erfolgreich. Merge `a6817214ee8bb52e4eb18f778206670b55fff134` um10:48:10UTC;
[Production-Deployment](https://vercel.com/nohut/helmut-pilot/HNHoWWbtbmp3KtqpcjVguPhhLtAY)
`dpl_HNHoWWbtbmp3KtqpcjVguPhhLtAY` READY am selben Commit. Fehler-/Fatal-Logs
im begrenzten Fenster10:48:10–10:49:11UTC ohne Treffer.

Das gespeicherte Paket wurde nach dem Merge erneut unabhaengig aus Production
gelesen: gesamter Inhalt unveraendert, beide Zeitwerte bei unterschiedlicher
SQL-Darstellung derselbe Zeitpunkt. Der aktuelle Client und der ausgerollte
Speicheradapter liefern lokal nun2 Karten und alle3 geprueften Detailabsaetze.
Alle drei vollstaendigen Ansichtstexte und HTML-Hashes wurden verglichen und
das separate semantische Urteil an genau diesen Stand gebunden.
[Ergebnisbericht](bereichsabnahme-20260927.json):3/3 Paare getrennt.

- Briefing/Lage: kurzer Berliner Anlass und Beobachtungsauftrag im Briefing;
  die ausfuehrlichen Beschluesse samt Quellen und die Solidarprinzip-Beratung
  ausschliesslich in Lage. Titel und wechselseitige Verweise bleiben erlaubt.
- Briefing/Radar: priorisierter Berliner Anlass gegen den persoenlichen
  amtlichen Redenbeleg; kein wiederholter Sachstand.
- Lage/Radar: parlamentarische Sachverhalte gegen Namensnennung; kein Inhalt
  der Rede und keine Resonanz aus dem Mediathektitel erfunden.

Pruefeingabe `f34fbc78ffeb4cdb91ad21092f0d854d4c7fe94c6903d19b26330d17e674a788`,
Urteil `972a6e926b1dcb886a36af6cbd9753e5de79625cbaeb4b77ff51f74b9e75ada9`.
Private Volltexte/HTML/Urteil unter `/private/tmp/helmut-budget7/`:
`ansichten-prod651-geprueft.json`, `urteil-prod651.json` und
`paket-nach-pr651.json`. Keine Texte entfernt, keine erneute Modellbewertung.
Das Urteil der fuehrenden Codex-Sitzung ueber das gpt-5-mini-Paket bleibt
fehlbar; es ist kein unabhaengiger Bedeutungsbeweis, keine Faktenvollpruefung,
kein frischer Live-App-Mitschnitt und kein500er Nachweis. Die Anzeigenhinweise
auf teilweise Vollstaendigkeit und fehlenden heutigen Morgenlauf bleiben ehrlich.

SQL10:49:09UTC:500 inaktive Profile und501 Identitaeten mit unveraenderten
Vollhashes,0 Jobs/Locks/Leases/offene Productionreservierungen. Tageskosten und
Gesamtbindung unveraendert. Kein neuer Helfer-/Production-Modelllauf fuer die
Adapterkorrektur oder Bereichsabnahme. Genaue Variante/Denkstufe der fuehrenden
Codex-Sitzung nicht auslesbar; kein Astra-Uebergang. Das Production-Paket stammt
von gpt-5-mini: Entwurf low, separate Quellenpruefung medium.
