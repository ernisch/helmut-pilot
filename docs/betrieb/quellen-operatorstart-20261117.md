# Quellen-Operatorstart17Nov2026

Der Betreiber hat den konkreten Einrichtungsauftrag bestaetigt. Bestehender
Cronauthzugang, neue ausdrueckliche POST-Operation mit Tag+UUID; gleiche globale
Lease, Quoten, Source-/Original-/Geldwachen. Admin-UI/CSRF bleiben unveraendert.

Genau ein heute zusaetzliches Quellenfenster bis300s,9/2700statt Basis8/2400,
Originale weiterhin16, Geld1USDTag/30gesamt. Alte Reserven bleiben verbraucht.
Kein Reset oder blinder Retry bei UNKNOWN. Keine neuen Crontermine/Secrets.

Der um08:42aktivierte BMG-Direktfeed fehlt im unveraenderlichen Tagesmanifest.
Nur diese autorisierte fehlende Quelle wird aus geprueftem aktuellem Katalog
idempotent als neuer Auftrag ergaenzt; vorhandene Quellenjobs/Erfolge bleiben.
Keine pauschale Neuplanung oder Wiederholung abgeschlossener EUR-Lex-Auftraege.

Vorbereitung: Main18d19093, Geld09:10UTC0,736053USDTag/5,029753gesamt,
69heutigeBuchungen/eineUNKNOWN;0aktiveOriginalleases. Die zusaetzlichen
0,004562USD gegenueber07:57stammen aus zwei Buero-Kommunikationsentwuerfen,
nicht aus Quellen-/Lagearbeit. Vor echtem Start frischen Budget-/Ruheabgleich.

Code, gezielte Tests, Review, exakte Pflicht-CI und Deployment werden am PR
belegt. Danach genau ein echter Lauf und lesende Abschluss-/Kostenkontrolle;
keine kuenstliche Gesamtversorgung oder Lizenzfreigabe.

## Gezielter Nachweis vor Integration

Arbeitsfenster25/25, echter lokaler HTTP-Admin-/Cronstart21/21,
Planung11/11 Offlinegruppen bestanden. Einschliesslich Auth/Production/Tag,
striktem Auftrag, genau einem Zusatzfenster, gescheiterter Startquittung,
Planungs-UNKNOWN ohne Worker, Normalbetrieb18Nov, verschobenen Wiederholungen
mit unveraendertem Ersttermin und null Altjobschreibzugriffen.
Zwei unabhaengige OpenAI-Reviews: keine offenen P1/P2 nach Korrekturen.
Die zwei tatsaechlich generierten PostgREST-Leseabfragen wurden separat
rein lesend gegen Production bestaetigt: HTTP200 und jeweils leere Liste;
kein Enqueue, kein Quellenabruf und keine Modellkosten durch diesen Vorflug.
Die vorangegangene Leasediagnose wurde auf echten Status laeuft korrigiert;
frische Probe ueber Status plus aktive Lease leer. Siehe BMG-Belegkorrektur.

PR1243 bindet die sechs Runtime-/Testblobs und den unveraenderten Restbaum.
Beide Pflichtjobs bleiben; nur kleine betroffene Suiten plus Schnellkern.
Unveraenderte UI: vorhandener Browserbeleg PR1240, kein neu behaupteter
Chromiumlauf. Keine 500er-Pruefungen oder zusaetzlichen bezahlten Tests.
Echte Betriebsabnahme nach regularem Deployment bleibt vor dem Start offen.
