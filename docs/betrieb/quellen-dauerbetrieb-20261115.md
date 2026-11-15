# Dauerhafte Quellenfehlerbehandlung, 15.11.2026

## Auftrag und Iststand

Quellen innerhalb der bestehenden Architektur dauerhaft behandeln; keine neuen
bezahlten Tests, Massenlaeufe oder kuenstlichen Verarbeitungen. Die eingerichtete
Kontrolle am16.11.,05:25UTC bleibt erhalten. Ausgangspunkt main dfe311b6.
Offene Quellenaufgabe #1218 folgt erst nach regulaerer Nachkontrolle der laufenden
Reparatur; keine erneute private Profilinventur. Gesamtversorgung weiterhin partial.

Bereits vorhanden und wiederverwendet: source-demand dedupliziert normalisierte
Abrufdefinitionen je Zeitfenster; Queue UNIQUE/Lease, exponentieller Backoff mit
maximal5Versuchen, begrenzte Wiedervorlage2; Google Retry-After/Gate/Circuit/Cooldown;
mehrere vorbereitete Feedwege und gebundene Landesquellenketten; automatische
Abrufquittungen und Quellenabdeckung mit Erholungs-/Paketbewertung. Kein neues
Retry-, Alarm-, Storage- oder Cron-System. Die Schwelle3echterLaeufe bleibt bestehen.
Rechte, Herkunft, Publikationsdatum und tatsaechlicher Lesetext bleiben eigene Gates.

## Nachgewiesene Ursachen und kleinster Reparaturumfang

1. Der native Queuepfad nutzt zusaetzlich einen Prozess-Ledger, der einen Versuch
   vor Abruf und Speicherung merkt. Nach503 oder unbekannter Rohpersistenz kann
   der Retry innerhalb15Minuten skipped-shared/ok statt echter Arbeit liefern.
   Lokal reproduziert: Fehler, danach uebersprungen, nur1HTTP-Aufruf.
   Kleinster Fix: nur im nativen Queuehandler diesen redundanten Ledger weglassen;
   Compiler, eindeutiger Auftrag, Lease und saemtliche Anbietergrenzen bleiben.
2. Allgemeiner RSS-Reader versteht HTML als leere Liste; ein generischer oder
   undatierter Homepageersatz verdeckt404/202. Lokal reproduziert. Kleinster Fix:
   RSS1/RSS2/Atom-Huellen pruefen; defekten Feed bei unbrauchbarem Ersatz als Fehler
   erhalten. Echte leere Feeds und datierte Artikel bleiben moeglich.
3. Die zwei vom Reader erzeugten RSS-Fehlermeldungen werden als unknown statt
   parse quittiert. Genau diese Meldungen klassifizieren; keine unbewiesene
   WAF-Ursache aus jedem Parserfehler ableiten.

Permanente Fehler werden weiter endlich beendet und im bestehenden Quellenbericht
sichtbar. Die native Finish-API erlaubt kein vorzeitiges Terminal; keine neue
Migration und keine Zweckentfremdung des Artikel-Quarantaenepfades. Unbekannte
Originalabruf-/CAS-Ausgaenge und alte negative Belege bleiben geschuetzt.

## EUR-Lex: offizielle Alternative statt Zugangssperre umgehen

Der bisherige RSS liefert nach Weiterleitung202/HTML/AWS-WAF-Challenge statt RSS;
vorherige Belege bleiben im [Abschlussnachweis](quellen-abschlussfenster-20261115.md).
Keine Challenge ausgefuehrt, keine Cookies/Identitaeten umgangen.

Primaere offizielle Dokumentation:

- [CELLAR-Wissensgraph und SPARQL](https://op.europa.eu/en/web/cellar/cellar-data/metadata/knowledge-graph)
- [CELLAR REST und Dateien](https://op.europa.eu/en/web/cellar/cellar-data/publications)
- [CELLAR RSS/Atom: Ingestionsmeldungen](https://op.europa.eu/en/web/cellar/cellar-data/rss-and-atom-feeds)
- [Amtsblatt seit01.10.2023: Einzelaktmodell](https://op.europa.eu/en/web/cellar/the-official-journal-act-by-act)
- [EUR-Lex-Webdienst](https://eur-lex.europa.eu/content/help/data-reuse/webservice.html?locale=en)
- [Rechtshinweis: Metadaten CC0](https://eur-lex.europa.eu/content/legal-notice/legal-notice.html?locale=en)

CELLAR ist ein offizieller oeffentlicher Maschinenzugang desselben Herausgebers.
Der native CELLAR-RSS meldet Ingestion/Aenderungen, keine Artikelpublikationen;
sein Zeitstempel darf kein Publikationsdatum ersetzen. Der SOAP-Webdienst verlangt
Registrierung und gesonderte Zugangsdaten, ist laut offizieller Beschreibung
kostenlos; kein Account, keine Nachricht und kein Secret angelegt.

Begrenzte rein lesende Metadatenproben haben das Datumsschema geklaert:
GDPR32016R0679 Dokumentdatum27.04.2016, Amtsblattpublikation04.05.2016.
Der alte OJ-Join funktioniert nicht fuer moderne Einzelakte. Offizielles Feld
`official-journal-act_date_publication`, KollektionOJ-L und deutsche Expression
liefern fuer32025D1771 Publikation11.09.2025 statt Beschluss08.09.2025.
NeuesteLIMIT3-Abfrage20:32:12UTC:32026D2505/32026D2510/32026D2521,
alle13.11.2026, mit deutschem Titel/CELEX/amtlicher OJ-L-Identitaet.
HTTP200,3169Bytes,SHA256
`625beaf8497aa200dda494c42dc6e42388bd2f679156e2d68629e83105012b95`.
Keine Modellaufrufe, Originalvolltexte oder Production-Schreibaktionen.

Kleinster Ersatz: ausschliesslich fuer die exakt bekannte EUR-Lex-Identitaet
einen begrenzten CELLAR-Metadatenweg verwenden, wenn der RSS wirklich fehlschlaegt.
Keine Erweiterung der Textrechte: nur Titel, CELEX-Link, echtes Publikationsdatum
und ausdruecklicher CELLAR-Herkunftsbeleg. Adapter und Integration vorhanden:
14UTC-Tage, maximal16Metadatensaetze, 256KiB JSON, fester HTTPS-Host,
einmaliger Ersatzversuch ohne eigene Retries. Anbietervertagung verhindert den
Ersatzabruf. HerkunftV2 bindet den konfigurierten RSS und den tatsaechlichen
CELLAR-Endpunkt/Werk/OJ-L/CELEX/Publikationsdatum; bestehende V1-Belege bleiben.
300Zeichen-Titelgrenze und Kennzeichnung der Kuerzung bleiben erhalten.
Keine unvollstaendige CELEX-Sektorliste; die amtliche OJ-L-Kollektion bestimmt
den Umfang. Kein automatisches HTML-/Textnachladen fuer diese Metadatenquelle.

## Gezielte Pruefungen und Review

Runtime-Evidence-Commit ae58b9b7bb070018437be523cea4beb9bcd11111:
33Crawler-,40Telemetrie-,8Queuequittungs-,31Parlamentsdaten- und11CELLAR-Gruppen
gruen; Quellenstoerungen160/Googlehaertung58 bestehende Pruefungen gruen.
Der unabhaengige Review hat Homepageersatz ohne Datum, einfache DOCTYPE-Huelle
und stillen CELEX-Sektorausschluss gefunden; alle drei korrigiert und geprueft.
Der CI-Plan bindet PR1225, Branch/Basis/Evidence und alle zehn Runtime-/Testblobs,
den uebrigen Baum sowie echten Merge und identischen PR-Kopf. Beide Pflichtjobs
bleiben erforderlich; keine Auth-/Budget-/Quoten-/Schema-/Cron-/Profilmutation.
Vor Merge: exakte Pflicht-CI und abschliessendes unabhaengiges CI-Review.

Fehler bei der lokalen Testauswahl: die vorhandenen Suites source-demand und
warteschlange-blob-entkopplung wurden einmal ohne Mengenfilter ausgefuehrt.
Sie enthielten synthetische200/700Profil- und450/5002Dokumentfaelle. Das lag
ausserhalb der ausdruecklichen Grenze, obwohl keine Production-Zugriffe,
Modellaufrufe oder API-Kosten entstanden. Nach Review sofort korrigiert:
source-demand nicht erneut starten, Blobentkopplung ausschliesslich mit dem
bereits vorhandenen `--gezielt`; die Pflicht-CI uebernimmt diese Begrenzung.
Keinen historischen Mengenfall als erforderliche neue Abnahme ausgeben.

Rein lesende Production-Kontrolle20:42:48UTC:0laufendeJobs, alle6vorherigen
Zieljobs weiter erledigt, Tagesbindung0,711983USD/Gesamtbindung4,095017USD
unveraendert. Keine neue Verarbeitung oder Datenkorrektur ausgefuehrt.

## Abnahmegrenzen

Die bisherigen sechs Zieljobs und ihre erfolgreichen Ergebnisse bleiben erhalten.
Die zwei neuen Feeds haben erst je1echte Quittung; fehlende Beobachtungen nicht
erfinden. Andere Artikel ohne gepruefte Original-/Nutzungsnachweise bleiben offen.
Keine globale Rechtefreigabe, kein Gesamt-PASS und kein zahlender Kunde aus
Metadatenzahlen allein. Betriebswirkung neuer Korrekturen im ohnehin regulaeren
Lauf nachweisen; keine Sonderverarbeitung und keine erneute Einmalfreigabe.
