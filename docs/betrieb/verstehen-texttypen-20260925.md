# Texttypen vor der Understanding-Speicherung

Production SELECT25.09.2026 10:48:18UTC bestaetigt im Ergebnis zur
grenzueberschreitenden Vermoegenseinziehung den Ortsnamen `[object Object]`:
sowohl in `mentioned_locations` als auch in `mentioned_geographies`.
Das ist kein Ort. Die rohe Modellantwort ist nicht gespeichert; ihr konkreter
Typ wird deshalb nicht nachtraeglich als belegt ausgegeben.

Die Ursache ist reproduzierbar: `cleanEntry` wandelte jedes Objekt, jede Zahl
und jedes Array mit `String` in einen Text um. Der anschliessende Validator
sah dadurch einen schema-gueltigen Ortsnamen oder sogar eine Pflichtaussage.
Jetzt werden nur echte Strings angenommen. Ungueltige optionale Werte bleiben
leer; eine ungueltige Pflichtprosa bleibt am bestehenden Validator gesperrt.
Handlungseintraege mit vorhandener, aber unlesbarer Voraussetzung oder Frist
werden als ganzer Eintrag verworfen, damit keine unbedingte Resthandlung bleibt.
Keine Aenderung an Prompt, Modell, Budget oder bestehender Ergebnisfreigabe.

Gezielte lokale Pruefungen ohne Netz, Productionzugang oder Modellaufrufe:
Schema-/DSGVO-Diagnose60/60, Textgrenzen8/8, Klassifikation70/70.
Die neuen Faelle pruefen Objekt-/Zahl-/Arraywerte, Klassifikationsdurchreichung,
Pflichtprosa-Ablehnung, unteilbare Handlungen und unveraenderte gueltige Texte.

Unter der bereits freigegebenen Fehler-Sperrung des einmaligen30er Laufs wurde
genau dieses Ergebnis auf pending/failed-final gesetzt. Einmalige Transaktion,
15s je Statement,2s Sperrwartezeit, voller alter Zeilenhash,504/0 und keine
Jobs/Locks/Leases als Vorbedingungen. SELECT10:49:24UTC bestaetigt die Sperre
und den vollstaendig unveraenderten Inhalt ausser Status/updated_at.
Backup: `/private/tmp/helmut-frische30-texttyp-vorher.json`.
Keine Quellen-, Profil-, Kosten- oder Modellaktion. Keine automatische Wiederholung.
Dieses zwoelfte gesperrte Ergebnis ist NICHT Teil der acht freigegebenen
redaktionellen Korrekturen. Die spaetere separate Wiederfreigabe ist im [Restnachweis](frische30-rest-nachweis-20260925.md) belegt.

PR566 am geprueften Kopf a7da6f554783fa649c26b86e58a426b2509d833f:
Pflicht-CI36126672687 erfolgreich, Merge09a949fab9c9dc7b2be461c22e97fbb02af219ea.
Production dpl_7TJ4a5KQxMS6nZ2c4eNpQywT9eqf READY seit11:05:12UTC;
Alias am selben Commit, keine error/fatal-Logs bis11:06:01UTC (kurzes Fenster).
Die Typkorrektur ist damit ausgerollt. Fachliche Gesamtabnahme weiterhin offen.
Weder technische Speicherung noch diese Korrektur ist ein500er Nachweis.
