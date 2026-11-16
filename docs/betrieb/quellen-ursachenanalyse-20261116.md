# Gemeinsame Ursachen der Quellenprobleme

Stand: 16.11.2026. Gleiche Ursachen werden gemeinsam behandelt; Vorrang haben
wenige dauerhafte Korrekturen im bestehenden Motor. Keine neue Infrastruktur,
Mengenprüfung oder künstliche Erfolgsquittung. Der private Zwölf-Felder-
Profilabgleich bleibt geschlossen; keine neue Mandatsinventur aus Issue #1218.

## Ursachen und kleinster notwendiger Umfang

| Gemeinsame Ursache | Beleg und Reichweite | Korrektur oder verbleibende Grenze |
| --- | --- | --- |
| Netzarbeit überschreitet die sichere Auftragsfrist | Regulärer 03:30-Fehlabschluss; 5646 ms Restzeit und rot reproduzierte fehlende Abbruchweitergabe. Betrifft alle nativen Quellenabrufe einschließlich Redirects, POST, PARDOK und Spezialadapter. Die alleinige Ursache des damaligen Abbruchs ist damit nicht bewiesen. | PR #1233 live: absolute Netzfrist, durchgängiger Abbruch, abgewartete Requests/Streams/Kinder und Abschlussreserve. Zu kurzer Rest vertagt vor Netz/Reservierung, ohne Fehlversuchsverbrauch. UNKNOWN bleibt geschützt. |
| Gemeinsamer Anbieter-Minutenriegel | 112 wartende Jobs / 112 Quell-IDs mit genau `zurueckgestellt: anbietergrenze: anbietergrenze-minutengrenze`; 112 verschiedene primäre RSS-URLs. Google-Konto `google\|news\|quellenabruf`: acht Minutenfenster, maximal 30 und insgesamt 227 Buchungen, 03:00–03:31 UTC. | Bestehende Schutzfunktion, keine 112 Parserdefekte oder belegte Compilerduplikation. Atomare Reservierung und begrenzte, attempt-erhaltende Vertagung nutzen; keine Limit- oder Reserveänderung und keine 112 Einzelpatches. |
| Technischer Erfolg liefert keinen bestätigten nutzbaren Inhalt | Bereits belegte Queue-Ledger-Früherfolge, HTML als leeres RSS und fehlender Quittungshook. Neuer heutiger EUR-Lex-Job mit Textfreigabe erledigt, aber 16 Metadatenzeilen V1 / ohne Text: gesunder RSS kehrte vor dem Originalpfad zurück. | Frühere Ledger-, Feedhüllen-, Fehlerklassifikations- und Telemetrieheilungen bleiben live. PR #1234 nutzt im exakt freigegebenen nativen EUR-Lex-Weg die vorhandene amtliche CELLAR-/Original-/CAS-Kette vor RSS. Alte Aufrufe und Rechtewachen bleiben erhalten. |
| Abrufziel oder Herausgeberformat geändert | Linke rss.xml HTTP 404 / geprüftes feed.rss HTTP 200; konkrete BMG/BMAS/ZDF/hib-Belege. BMG-Reden konnten aus gespeichertem Original nach Parserrevision wiedergewonnen werden. | Strenge vorhandene Adapter gezielt korrigiert; gemeinsame hashgebundene Archivwiedergewinnung statt neuer Originalabrufe oder manueller Artikelserien. Keine freie HTML-/Titelnäherung. Fehlender positiver Archivbeleg bleibt eine Lücke. |
| Original-, Datums-, Versions- oder Nutzungsnachweis fehlt tatsächlich | Historische NULL-Publisherziele und konkrete NDR/DLF-Konflikte; ungeklärte POLITICO-/Table.Media-Textrechte. Die alten 14 Konflikte betreffen nicht die später geprüften 36 Bindungen: dort jeweils null Titel-, Herausgeber- und Datumsabweichungen. | Echte Sperren erhalten; nur aus gesichertem Original nachweisbare Parser-/Bindungsfehler heilen. Keine Rechte aus RSS oder Quellen-ID ableiten. Amtliche, erlaubte Destatis- und artikelweise belegte iRights-Auszüge nutzen. |
| Betrieb oder ausreichende echte Beobachtung fehlt | Heutige Lage/Morgen partial, Abdeckung 03:31 blocked; vor Fortsetzung Destatis/iRights je zwei Erfolgsquittungen statt drei. Linke wartend / attempt 0; BMG aus Archiv wiedergewonnen / wartend 2, Nachanalyse offen. | Zulässige bestehende Produktverarbeitung fortsetzen und echte Abschlüsse prüfen. Keine neue Retry-/Alarmarchitektur, keine erfundene Tagespriorität und keine künstliche dritte Quittung. |

## Abgrenzung der Nachweise

Die auf fünf Sekunden begrenzten READ-ONLY-Abfragen vergleichen feste öffentliche
Katalogquellen seit 15.11., 00:00 UTC: 167 erledigte Jobs / 148 Quell-IDs,
112 Minutenvertagungen, 17 Wartende ohne Fehlertext, ein Zeitvertagter und ein
alter fehlgeschlagener EUR-Formatjob. Der heutige EUR-Job ist erledigt / attempt 1.
Wartend bedeutet keinen Defekt; erledigt bedeutet noch keinen gelesenen Text,
Rechtenachweis oder vollständige Kundenversorgung.

Der engere EUR-Primärbeleg 07:09 UTC bestätigt `eurlexExcerptApproved:true`,
exakten Pfad/Feed und 16 neue V1-Zeilen ohne Text. Der frühe RSS-Return wurde
isoliert reproduziert. Der Fix verwendet dieselbe bestehende amtliche Kette,
keinen neuen Anbieter und keine pauschale Textfreigabe.

## Dauerhafte Reparaturen und Prüfungen

PR #1233: [Frist-, Erstfehler-, CI- und Rolloutbeleg](quellen-netzfrist-20261116.md).
Merge `a67b44c07e55188357943ced88cd3e1a11398aea`, beide PR-/Main-Pflichtchecks
und unabhängige Runtime-, Test- und CI-Reviews erfolgreich.

PR #1234: Evidence `6fabc7d6950f95e6f6d111ebbbfc8e2b4f5757ed`, geprüfter Kopf
`3fef22388ab0a04b4830e334439a54956f0f5867`, beide Pflichtchecks erfolgreich
in [PR-CI 43827640556](https://github.com/ernisch/helmut-pilot/actions/runs/43827640556).
Merge `7b4c42c1a8b926ca364e0ebf46ba98ec1e31a4f0`, beide Main-Pflichtchecks
in [Main-CI 43828028312](https://github.com/ernisch/helmut-pilot/actions/runs/43828028312) erfolgreich.
Unabhängiger Runtime-/Test-/Dokumentationsreview und getrennter CI-Review geschlossen.

Gezielt grün: zehn Dispatch-, 14 Originalintegrations-, 31 Parlamentsdaten- und
14 Crawlerfristgruppen; 17 CI-Vertragsgruppen, Syntax und 14 Schnellkerngruppen.
Der erste rote Check 43826332348 bleibt dokumentiert: Zwei alte CELLAR-only-
Testattrappen wurden seit der Fristkorrektur auch für RSS benutzt. Nur das
hermetische Fixture wurde korrigiert, alle Assertions erhalten. Keine externen
HTTP-, Modell-, Datenbank- oder Production-Testaufrufe und keine Mengensuiten.

Reguläres Production-Deployment `dpl_8f99YMdV23W9LtdBRnwg45n1mJoj` READY;
Main-SHA und Alias `helmut-pilot.vercel.app` bestätigt. Öffentliche Nachkontrolle
08:02:54 UTC: HTTP 200, 6118 Bytes, Runtime `7b4c42c1`, HTML-SHA256
`3ffcecb243198789bb42c82cd4bdf3540ca575b6c4884f61e6d82195316ee7bf`.
Rollout ist kein vollständiger Versorgungsnachweis.

## Zulässige automatische Behandlung

Bestehende Queue mit begrenzten Versuchen und Backoff, Anbieter- und
Originalquoten, Circuit Breaker, Negativ-/Fassungscache, hashgebundene
Archivwiedergewinnung, technische Quittungen und strenge Inhalts-/Datums-/
Rechteprüfung werden weiterverwendet. Ein bestätigter temporärer Original-HTTP-
Fehler erhält genau einen späteren Versuch nach mindestens 15 Minuten oder
Retry-After. Unbekannte Ausgänge werden nicht blind wiederholt. Dauerhafte
inhaltliche oder rechtliche Fehler bleiben dokumentierte, ehrliche Lücken.

CELLAR ist eine offizielle Alternative ohne Umgehung der Zugangssperre.
[Primärbelege und Abwägung des EUR-Lex-Webdienstes](quellen-dauerbetrieb-20261115.md#eur-lex-offizielle-alternative-statt-zugangssperre-umgehen)
bleiben erhalten: SOAP verlangt Registrierung und gesonderte Zugangsdaten;
CELLAR ist bereits zulässig eingebunden. Publikationsdatum bleibt von
Änderungs-/Ingestionsdatum getrennt; CC0 gilt nur für Metadaten.

## Echter Produktbetrieb und Restgrenze

Vorwerte 08:04:59 UTC: keine laufenden Jobs; drei Fenster / 900 reservierte
Sekunden / ein Original; 0,090652 USD Tagesverbrauch einschließlich Bindungen.
Die unveränderten Grenzen bleiben 1 USD/UTC-Tag und 30 USD insgesamt sowie
8 Fenster / 2400 Sekunden / 16 Originale. Erfolge, Archive und Reserven bleiben.

Der Betreiber hat genau einmal den bestehenden Admin-Quellenlauf gestartet.
Start 08:05:50.914 UTC, Lauf-ID
`admin-quellen-2026-11-16-8e4cd2f7-2090-45ad-b3b2-7c5edd653e5d`.
Echte Adminsitzung und CSRF wurden benutzt; kein Cronkey-Ersatz, kein Reset,
keine Wiederverwendung der alten Einmalrechte und kein paralleler Quellenlauf.

Die bestehende Kontrolle 16.11., 05:25 wurde erhalten und ist beendet. Kein
Nachmittagscron oder paralleler Ersatztermin wurde eingerichtet. Nächster
geplanter regulärer Start 17.11., 03:00 UTC bleibt an die bestehenden
Betriebs-, Automatik- und Kontingentprüfungen gebunden.

## Erhaltene Detailbelege

- [Dauerreparaturen, Originalrechte und erfolgreiche Ergebnisse](quellen-dauerbetrieb-20261115.md).
- [Korrigierte 36 Bindungen und Quittungshook](versorgung-sofortpruefung-20261115.md).
- [Quellenformate und tatsächliche Inhaltsgrenzen](quellen-parser-folge-20261115.md).
- [Linke-RSS-Korrektur und vorheriger Abschluss](quellen-abschlussfenster-20261115.md).
