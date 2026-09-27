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
