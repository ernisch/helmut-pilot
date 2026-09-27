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
