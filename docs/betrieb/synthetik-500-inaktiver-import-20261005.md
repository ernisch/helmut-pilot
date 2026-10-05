# Inaktiver synthetischer500er Import —05.10.2026

Der fehlende inaktive Bestand ist produktiv hergestellt und um01:08:49 UTC vollständig nachkontrolliert. Dies ist die Vorbereitung des500er Starttors; es wurden keine Profile aktiviert und kein500er Production-Test gestartet.

## Ergebnis

Exakt500 kanonische synthetische Mandatsprofile:330 Bundestag (je165 Berlin/Brandenburg),120 Landtag Berlin,50 Landtag Brandenburg. Insgesamt501 Identitäten, einschließlich des unveränderten Fremdprofils;0 aktive Mandate. Neue Sollpositionen bleiben fachlich ausstehend.

Die Nachkontrolle umfasst sämtliche Importprojektionsfelder, komplette Datenbank-Postimages samtxmin, alle17 Nichtziel-Schlüssel-/xmin-Mengen einschließlich NULL-Nebenbindungen, vollständige Fremdprofilfelder, Auth-Vollhash/xmin, Steuerungstabellen, aktuelle Quellkataloge, Sicherungs-/Postimage-Kataloge und deren versiegelte Revisionen. Alle Vergleiche bestanden; Jobs, Locks, laufende Prozesse und offene Outbox jeweils0.

## Atomarer Weg und Beleggrenzen

PR #804, `main` `542f5bc6586d0c8d41c9432e6108c31533b090b3`, beide Pflichtchecks grün und reguläres Production-Deployment Ready. Der bestehende native Generator bleibt Grundlage. Ein privat unabhängig geprüfter Transport führt alle ursprünglichen SQL-Anweisungen byteidentisch und in derselben Reihenfolge innerhalb genau einer Transaktion aus. Harte Gesamtgrenze17s einschließlich Entschlüsselung/vorbestehender Transaktion, Statement20s, Lock2s; keine Teilcommits und keine Wiederholung bei unbekanntem Ausgang.

Der vorherige monolithische Stage-Lauf wurde an der17s-Grenze abgebrochen. Eine ausdrücklich immer zurückrollende Diagnose führte anschließend alle121 Stage-Anweisungen aus; beide Rücknahmen wurden vollständig lesend bestätigt. Der danach eingesetzte segmentierte Transport erhielt sämtliche ursprünglichen Anweisungen und entfernte ausschließlich den unbedingten Diagnose-Rollback. Es wird keine stabile Zeitreserve behauptet.

Stage und inaktiver Ersatz wurden erfolgreich committed. Unabhängige lesende Nachkontrollen bestätigten beide Zustände. Das Migrationsjournal enthält46 Versionen; ausschließlich `20261005010528` fürStage und `20261005010720` fürForward sind hinzugekommen.

Die18 vollständigen scoped Sicherungen,17 Metadatentabellen und2 echten Postimages liegen weiterhin ausschließlich eigentümerprivat in der Datenbank. Der unveränderte native CAS-Rückweg ist vorbereitet und wurde nicht ausgeführt. Private Originalantworten, SQL-Dateien, Manifeste und Belegarchive bleiben außerhalb Git; keine Originaldatei wurde verändert oder ins Repository übernommen.

## Nächste notwendige Tore

Der tatsächliche D/R-Datenbankvertrag fehlt weiterhin. Vollständiges aktuelles W/Kontext, tatsächlicher Providerantwortbeleg, finanzierter Request-/Zeitplan und lebender gebundener Endwächter sind getrennt zu schließen. Historische Caller-/Root-Abnahmen gelten nur für ihre gespeicherten Primärbelege. Die Importabnahme ersetzt keinen fachlichen Versorgungs-, Bedeutungs- oder500er Nachweis.

Die aktuelle Betreiberfreigabe deckt notwendige Vorbereitung dieser Arbeitsphase einschließlich Production-Änderungen; bezahlte Production-Modellaufrufe bleiben insgesamt auf20USD begrenzt, bestehende Kosten/Reservierungen werden erhalten. In dieser Phase bisher0 solche Aufrufe und0 neue USD. Neue kostenpflichtige Infrastruktur und der eigentliche500er Test bleiben gesperrt. Profiländerungen sind für diese Arbeitsphase ausdrücklich freigegeben; der inaktive Bestand bleibt bis zu den vollständigen technischen Toren erhalten.


## Weitere vorbereitende Belege am05.10.

Die aktuelle Providerkonfiguration wurde am05.10. auf dem regulären PR#805-Deployment geprüft: Azure, `helmut-resource.openai.azure.com`, aktive Text-/Verstehendeployment `gpt-5-mini`, Schlüssel vorhanden, kein Loopback. Dies belegt weder einen Modellaufruf noch den aktuellen Kontotarif. ARM-Metadaten bestätigen GlobalStandard inSwedenCentral; der bestehende konservative Kostenriegel bleibt führend.

Die native D-Metadatenprüfung ist um02:57:46 UTC vollständig erfolgreich: sämtliche sechs Foundation-Hashes,497 Funktionen,74 Typen,839 Closure- und1757 Hook-Einträge sowie276 Target-D-Tupel. Post-Import-Namespace- und vollständige physische Katalogzeilen wurden verlustfrei neu gebunden; kein Feld wurde aus dem Vergleich entfernt. Geschäftsinhalte, Effekte, SourceGlobal17, Backend, Gesamtinstallation und vollständiges W sind dadurch nicht abgenommen. Das externe MCP-Wrapper-Queryhash ist weiterhin nicht als Identität der lokal eingereichten SQL-Bytes belegt.

Der vorbereitete Einzelprobe-Handler verwendet ausschließlich einen festen synthetischen Kurzprompt,0 Profile und höchstens16 Ausgabetokens. Ein dauerhaftes CAS-Claim vor dem vorhandenen AI-/Kostenpfad verhindert einen zweiten Aufruf; bei unbestätigtem Schreiben wird kein Anbieter aufgerufen. Wiederaufrufe schreiben den verbrauchten Claim nicht erneut. Authentisierung ist an einen separaten kurzlebigen Bearer-Hash, Nonce, Deployment-Commit/-Host und ein20-Minutenfenster gebunden. Die maximale konservative Vorreservierung beträgt0,200064USD; historische Kosten und offene Reserven bleiben erhalten. Code und lokale synthetische Tests sind Vorbereitung, kein tatsächlicher Providerbeleg.


## Einzelprobe und Kostentage — aktuelle Grenze

PR#806 ist mit beiden Pflichtchecks auf `main` `f1dc2eafe1cd6ee58a96e91077cf028b87195f28` gemergt. Das reguläre Production-Deployment `dpl_BbsgegLFkuVdVLnm43E4PV7cDAkX` ist Ready; die konkrete Deployment-Aliasantwort bindet `helmut-pilot.vercel.app` ohne Redirect an diesen Stand.

Genau ein HTTP-Einzelprobeversuch endete vor Claim und Anbieter mit503. Fehlende Tagesbücher03./04.10. blockierten den bestehenden kumulativen Kostenriegel. Kein Anbieteraufruf, keine neue Geldreserve und kein Verbrauch der alten Nonce wurden behauptet; die alten Belege bleiben unverändert erhalten. Dieser Versuch ist abgeschlossen, kein HTTP-Retry. Eine neue getrennte Einmalfreigabe erneuert ausschließlich Nonce, Bearer-Hash, Ablaufzeit und Laufkennung des unveränderten Handlers. Vor einem neuen begrenzten Versuch sind grüne Pflicht-CI, exaktes Ready-Deployment und unabhängige Prüfung Voraussetzung.

Die gezielte native Korrektur ergänzte ausschließlich zwei vollständige Nullbücher: je14 gültige Skip-Belege, keine relationalen Anbieterereignisse oder globalen Zählerzeilen. Alle24 bisherigen Bücher sowie die übrigen vollständigen Auth-Daten, Reservierungen und Grenzen blieben durch Hash-/xmin-CAS und einen vollständigen Vorher-/Nachher-Deltaguard geschützt. Der erste zeitgebundene SQL-Aufruf wurde vor DML abgewiesen; unveränderte Auth- und46 Journal-Vollzeilen/xmin wurden nachgewiesen. Eine zweite Zeitbindung scheiterte lokal vor dem Schreibaufruf, weil die Werkzeugantwort älter als60 Sekunden war. Die getrennte, unabhängig geprüfte atomare Zulassung bindet dieselbe vollständige Datenprüfsumme und exakte Datenversion innerhalb der Transaktion;17s Gesamt-/20s Statement-/2s Lockgrenze,60s internes Fenster und feste absolute UTC-Frist bleiben wirksam.

Native Nachkontrolle vom05.10. **04:40:27 UTC** bestätigt26 Bücher, die zwei vollständigen Nulleinträge, neue Auth-Revision, unverbrauchte Provider-Nonce, exakt eine neue Auditzeile `20261005043912` und deren vollständigen SQL-SHA `51c25fabc53418a60b4c45b4f7ffa3caeffe5f7e3ba5d5be28e5881a057a72f9`. Alle46 vorherigen Journal-Vollhashes undxmin sind identisch. Auth-Änderung und Werkzeug-Audit besitzen unterschiedlichexmin; gemeinsame Transaktionszugehörigkeit wird ausdrücklich nicht behauptet. Die schmale unabhängige lesende Prüfung bestätigt den beobachteten Zustand; ein kryptografisch signierter Ausführungsbeleg liegt nicht vor. Keine zusätzlichen Finanzinhalte wurden exportiert. Gesamte geschützte Tages-/Auftragsgrenzen bleiben6/7USD; die aktuelle Betreiberobergrenze20USD hebt die bestehende technische7USD-Grenze nicht automatisch an. Neue bezahlte Production-Aufrufe weiterhin0, neue Kosten0USD.

## Privater Belegtransport — lokal vorbereitet

Der neue ausdrücklich versionierte Wörterbuch-/PGP-Transport behält131072 Bytes Native-Antwortcap. Vollständige unveränderte Originalbytes werden privat über eine begrenzte Referenzhülle wiederhergestellt;16MiB Raw- und32MiB private Framegrenze ersetzen keinen alten Vertrag stillschweigend. Sieben gezielte lokale PG17-/GPG-Fälle bestehen, einschließlich falschem Schlüssel, verändertem Ciphertext, Expansion, Dictionary-/Bindungsabweichung und unverschlüsseltem OpenPGP-Inhalt. Ein unabhängiger Prüfer hatte die fehlende Verschlüsselungserkennung beanstandet; GPG-MDC-/AES256-Status und UTF8-Zulassung wurden ergänzt und erneut gezielt geprüft.

Das ist ausschließlich lokale Transportvorbereitung. Vollständige aktuelle Journal-Restorezeilen, Source-/Effekt-/Metadatenzulassung vor Projektion, Gesamtinstallation und tatsächliches W bleiben offen. Es wurde keine neue private Vollprojektion gestartet; historische Caller-/Root-Quellen und aktuelle D-Metadaten werden nicht als vollständige Runtime-Abnahme ausgegeben.
