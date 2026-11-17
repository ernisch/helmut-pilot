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
