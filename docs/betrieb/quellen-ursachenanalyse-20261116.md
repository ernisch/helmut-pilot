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

## Alle 22 morgendlichen Endfehler und vier Folgefehler

Die 17 + 5 Endfehler aus 03:00/03:15 sind tatsächlich heute abgeschlossene
Artikelanalysen, keine kumulierten Altzähler und keine zusätzlichen RSS-Defekte.
Elf Jobs wurden heute angelegt, elf zuvor. Die reine Katalogabrufstatistik
oben kann diese `document_understanding`-Abschlüsse nicht erklären.

| Technische Ursache | Anzahl | Tatsächlicher Befund / Grenze |
| --- | ---: | --- |
| Kein bestätigtes Artikelziel | 9 | Originalziel nicht belegt; sichere Sperre erhalten. |
| Titel-/Datums-/Nutzungskonflikt | 3 | Gebundene Negativprüfung; kein pauschaler Parserdefekt. |
| BMG-Extraktion | 3 | Revision 2 tatsächlich ohne positiven Reparaturbeleg: zwei Themenpfade strukturell mehrdeutig, eine Pressemitteilung weiterhin unvollständiger Artikeltext. Archive und Originalpointer vorhanden. |
| DIP-Quellfelder nicht bestätigt | 2 | Diagnosejobs ohne kanonisches Dokument; andere Fälle als die zwei erfolgreich reparierten DIP-Fundstellen. |
| Eingangs-Versionskonflikt | 1 | Archiv und Kanonik vorhanden, tatsächlicher Publikationszeitkonflikt. |
| Quellenstand-Metadatenabweichung | 2 | Ein Titel- und ein Publikationszeitkonflikt bei vorhandenem Archiv. |
| Artikelprüfung `skipped-failed` | 1 | Bereits geparkter Analysefall; kein neuer Modellaufruf durch diesen Status. |
| Dauerhaft offener Artikelkontext | 1 | Endliche Wartefrist abgelaufen; keine endlose Wiederholung. |

Die vier Endfehler des Adminlaufs sind ebenfalls Artikel-Eingangs-
Versionskonflikte. Bei allen vier sind Archive und Kanonik vorhanden und beide
URL-Felder identisch. Alle Publikationszeitpunkte unterscheiden sich tatsächlich
(`::timestamptz`, kein bloßer JSON-Schreibweisenvergleich); drei Fälle außerdem
in Titel und Herausgeber. Welcher Stand inhaltlich maßgeblich ist, wurde nicht
entschieden. Kein pauschales Metadatenangleichen und kein behaupteter Abschluss.

Diese 26 Fälle werden nicht durch PR #1233 als behoben deklariert. Kein weiterer
universeller Reader-/Recoverydefekt ist daraus nachgewiesen. Eingangssperre und
Wiedergewinnung: `lib/helmut/scalable-pipeline.js`; Versionsbindung:
`lib/helmut/storage.js`; konservativer Negativabschluss:
`lib/helmut/artikel-verarbeitungszustand.js`.

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

## Gemeinsame Überwachungsreparatur in PR #1235

Der interne Beleg entsteht pro Quelle am bestehenden Anbieterwrapper direkt
vor dem Rohaufruf. Nur bei null begonnenen Abrufen und bestätigter zentraler
Minuten-/Tagesvertagung schreibt der Builder `provider-deferred/provider-limit`.
Die Gesundheitsauswertung zählt diese gekoppelte Art weder als Quellenfehler
noch als erfolgreichen Abruf; drei reine Vertagungen ergeben keinen PASS.
Fehlende/widersprüchliche Belege, echte 429/503-/Parser-/Leerfeedfehler und
Mischfälle nach bereits begonnenem Abruf bleiben konservativ sichtbar.

Die Bilanz ist je Quelle getrennt. Injizierte Fetchadapter gelten nicht als
vollständiger Nullabrufbeleg. Unteraufrufe behalten lokale Fristen und Uhren,
wenn keine Elternwerte gesetzt sind. Die bestehende Storageprojektion genügt;
keine neue Spalte, Migration, Queue-, Quoten- oder Kostenlogik. Historische
`error/unknown`-Quittungen werden nicht nachträglich verändert oder als Erfolg
umgewertet; ein aktueller gesunder Quellenzustand wird dadurch nicht behauptet.

Gezielte lokale Nachweise: 73 Telemetrie- und 174 Health-Prüfungen, fünf
Syntaxchecks und Diffcheck grün. Enthalten sind echter lokaler HTTP-Transport,
Nullabruf, parallele Quellenisolation, Google-503 mit anschließender Vertagung,
RSS-503/Parser/Leerfeed/Redirect vor Vertagung und der native CELLAR-Callback.
Ein abgelaufener lokaler Unteraufruf startet auch ohne Elternfrist keinen GET.
Die reine Folge Telemetrie → drei Vertagungen → null Versuche/Fehler/Erfolge
sowie die tatsächliche reduzierte Storageprojektion sind nachgewiesen.

Evidence `d914f7ea6f6de3b1e57dcf29974a0626747cf71f` bindet fünf Runtime-/
Testblobs; der enge CI-Plan bindet zudem den restlichen Baum, die Basis und den
wirklichen Main-Merge. Beide Pflichtchecks bleiben; nur Schnellkern und
betroffene Telemetrie-/Health-/Queue-/Abdeckungs-/Abbruchverträge werden geprüft.
Unabhängige Reviews und exakter CI-/Merge-/Rolloutabschluss stehen in
[PR #1235](https://github.com/ernisch/helmut-pilot/pull/1235).

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
Abschluss 08:09:37.023 UTC: partial, 13 erledigt / 134 vertagt / vier Endfehler;
30 neue Einträge. Abdeckungsquittung 08:09:37.541 UTC ebenfalls partial.
Linke-Zieljob jetzt erledigt / attempt 1; BMG-Nachanalyse weiterhin wartend 2.
Sechs frühere Zielerfolge unverändert, 08:11:34 UTC keine laufenden Jobs.
Tageskosten einschließlich Bindungen 0,135652 USD, insgesamt 4,230669 USD;
Mehrkosten genau 0,045 USD. Vier Fenster / 1200 reservierte Sekunden / ein Original.

107 Quellenabrufe wurden zentral am Anbieter-Minutenlimit vertagt. Dieselben
107 Quittungen tragen fälschlich `error/unknown`. Der Builder ignoriert die
strukturierte Vertagung, die Gesundheitsauswertung zählt sie dadurch als echte
Fehlversuche und verwendet dies für Quellen-/Abdeckungsbefunde. Das ist ein
weiterer nachgewiesener gemeinsamer Motorfehler; PR #1235 korrigiert genau
diese Grenze. Echte vorherige HTTP-/Parserfehler dürfen dabei nicht verschwinden.

EUR-Lex, Destatis und iRights besitzen bereits erfolgreich abgeschlossene
reguläre Tagesaufträge mit `freshness_window=2026-11-16T00Z`. Die zulässige
Fortsetzung wiederholt diese Erfolge nicht: EUR bleibt heute bislang V1 ohne
Text; Destatis/iRights haben weiterhin je zwei echte Quittungen statt drei.
Eine weitere Betätigung erzeugt dafür keinen neuen regulären Tagesnachweis.
Es werden keine Ersatzjobs oder künstlichen Drittquittungen angelegt.

Die bestehende Kontrolle 16.11., 05:25 wurde erhalten und ist beendet. Kein
Nachmittagscron oder paralleler Ersatztermin wurde eingerichtet. Nächster
geplanter regulärer Start 17.11., 03:00 UTC bleibt an die bestehenden
Betriebs-, Automatik- und Kontingentprüfungen gebunden.

## Erhaltene Detailbelege

- [Dauerreparaturen, Originalrechte und erfolgreiche Ergebnisse](quellen-dauerbetrieb-20261115.md).
- [Korrigierte 36 Bindungen und Quittungshook](versorgung-sofortpruefung-20261115.md).
- [Quellenformate und tatsächliche Inhaltsgrenzen](quellen-parser-folge-20261115.md).
- [Linke-RSS-Korrektur und vorheriger Abschluss](quellen-abschlussfenster-20261115.md).
