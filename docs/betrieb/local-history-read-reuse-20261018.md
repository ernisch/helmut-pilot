# Lokale Wiederverwendung unveränderlicher Nutzungshistorie

Stand: 18.10.2026. Ausschließlich lokale Entwicklung; standardmäßig ausgeschaltet.

## Problem und begrenzte Änderung

Der einmalige Ressourcenlauf `4598bdb31782` wurde nach 246 beobachteten HTTP200-Antworten bei 2.048.897.024 Bytes gemeinsamem Kernelpeak gestoppt. Das Limit bleibt 2.048.000.000 Bytes; sein GO ist verbraucht. Dieser Sprint führt keinen weiteren vollständigen Lauf aus.

`HELMUT_AUTH_HISTORY_READ_REUSE=verified-history-reuse-v1` erlaubt genau einen privaten, tief eingefrorenen Inhaltsdatensatz der Nutzungshistorie. Die Option benötigt den bestehenden lokalen relationalen Modus und `merkle-auth-v1`; Vercel und öffentliche Datenbankziele bleiben ausgeschlossen. Der gebundene lokale Testdeskriptor muss sie ausdrücklich als `historyReadReuse` enthalten. Standardpfad und nativer Rückweg bleiben erhalten.

Jeder bedingte Leseaufruf prüft im selben Datenbanksnapshot weiterhin die vollständige tatsächliche Historienkette und die Hashes sämtlicher gespeicherter Historienzeilen. Nur bei identischer Ziel-/Zeilen-/Generations-/Anzahl-/Kopf-/Originalhashbindung dürfen die bereits geprüften Historienbytes in der Antwort fehlen. Eine frische Nonce bindet die Antwort zusätzlich an Revision, Zustand und Nachweis. Dieser Digest ist keine Signatur und ersetzt nicht den vertrauenswürdigen authentifizierten Datenbankursprung.

Vollständige aktuelle Graphdaten und sämtliche Knotenhashes werden weiterhin übertragen und geprüft. Berechtigungen, Profile, Quellen, Kosten, Fristen und Notstopp werden nicht zwischengespeichert. Der Cache hat höchstens 8 MiB serialisierten Textinhalt; größerer gültiger Inhalt nutzt den Vollabruf. Neustart, anderes Ziel oder veränderter Inhalt benötigen wieder vollständige Daten. Eine unklare Schreibbestätigung erzeugt weder eine bestätigte Buchung im Client noch einen automatischen Retry.

Die bestehende lokale Ablaufanbindung setzt denselben ausdrücklich gebundenen Modus in Vorbereitung, Root-Brücke und Ausführung. Die initiale Quellenbindung enthält den Modus. Der rein lesende Vorabcheck stellt alle drei Umgebungswerte nach Erfolg und Fehler wieder her. Content-Worker erhalten dadurch keine Datenbankzugänge und keine neue Autorität. Alle 32 frischen Startbedingungen und eine neue konkrete Freigabe bleiben vor einem tatsächlichen Gesamtlauf erforderlich.

## Tatsächliche lokale Prüfung

Vierzehn native Sicherheitsgruppen bestanden: sechs bestehende Graphgruppen und acht neue Historiengruppen. Erfasst sind falsche Nonce/Digest, Wiederverwendungsbehauptung ohne privaten Inhalt, veralteter Nachweis, Rollen-/Ziel-/Formfehler, konkurrierende Schreibvorgänge, verlorene Bestätigung, tatsächlich manipulierte beziehungsweise NULL-Datenbankzeilen mit Rollback, Neustart und Größenüberschreitung. Die ursprünglichen 5.000 Historienzeilen blieben inhaltlich unverändert; ausschließlich drei beabsichtigte synthetische Nullkostenzeilen kamen in dieser Testkopie hinzu. Alle anderen fachlichen Daten sind gleich. Der tatsächliche native Katalog aller 14 Funktionen stimmt mit den Quellkörpern überein.

Der unabhängige DeepSeek-Pro-High-Review des tatsächlichen Readers und SQL-Codes meldet keinen neuen Sicherheitsblocker. Elf zusätzliche reine Anbindungstests bestanden; sie prüfen die bestehenden 26 Vorlagen ohne Ausführung, Aktivierung oder GO-Verbrauch. Die unabhängige Deltaabnahme der Anbindung wird gesondert dokumentiert.

Begrenzter Vergleich mit der vorhandenen gemeinsamen Kernelmessung und demselben isolierten 1-GiB-Dateisystemmechanismus, 42 logische Aufrufe einschließlich 32 wiederholter inhaltlich unveränderter Schreibvorgänge:

| Messgröße | Zeitliche Referenz | Wiederverwendung |
|---|---:|---:|
| Gemeinsamer Speicherpeak einschließlich Dateicache | 957.796.352 B | 921.849.856 B |
| CPU des gesamten eigenen Testlebenszyklus | 54,482110 s | 49,233293 s |
| Eigener gesamter Diagnoselebenszyklus | 61,780192486 s | 54,181098669 s |
| Langsamster einzelner Diagnoseaufruf | 499,616928 ms | 533,708852 ms |
| Summe beobachteter Antwortbytes | 708.754.196 B | 505.304.460 B |

Der gemessene Speichergewinn beträgt 35.946.496 Bytes. Die maximale Antwortzeit wurde schlechter; der Median der 32 Wiederholungsschreibvorgänge änderte sich von 274,8882155 auf 275,997247 ms. Die Referenz ist zeitlich getrennt, kein randomisierter Vergleich desselben Commits. Die Diagnoselebensdauer ist keine Unit60-Messung. Eine garantierte Speicherobergrenze für 500 Profile oder eine vollständige Unit60-/Auth30-Abnahme folgt daraus nicht. Alle eigenen Testprozesse einschließlich Speicherhelfer sind beendet.

Ein anderer SQL-Renderer beseitigte zwar temporäre Blöcke, erhöhte aber den gemessenen gemeinsamen Peak und die CPU. Er wurde verworfen und ist nicht Teil der Integration.

## Belege, Grenzen und nächster Start

[Kompakter Sicherheits- und Integrationsbericht, privat](https://drive.google.com/file/d/1rwbHFCp4TRAiqdMayMvDv_s5HYmYLXdC/view) · [vollständiger kleiner Vergleich, privat](https://drive.google.com/file/d/15GNgney9iUWez4DW0NTl86VN1WM7jOSa/view) · [native Sicherheitsbelege, privat](https://drive.google.com/file/d/1x0CSfB7YqFAJUb81Cgq1sQCnSJuZBimA/view) · [unabhängiger Code-Review, privat](https://drive.google.com/file/d/1zRNMBqu9L3ezNKtfIQtumqtaJ58xUQXk/view). Alle vier Dateien wurden vollständig rückgeladen und bytegleich geprüft; Freigaberechte wurden nicht geändert. Lokale Primärbelege: `/workspace/helmut-parallel-20261015/wave36-auth-graph-read/`.

Die geprüfte Hashdarstellung ist die von PostgreSQL 17.6; eine Übertragung auf andere Versionen oder Production wird nicht vorausgesetzt. Der unveränderte alte Usage-Guard besitzt laut Review eine NULL-empfindliche `NOT IN`-Prüfung; sämtliche tatsächlichen Setter setzen das erforderliche Aktionsfeld. Der Review fand dadurch keinen neuen ausnutzbaren Übergang. Diese historische Eigenschaft ist kein Bestandteil der neuen Cacheautorität und wird nicht still erweitert.

Die sichere Bereinigung dreier eigener beendeter Kleintest-Hüllen gewann tatsächlich 2.735.202.304 Bytes. Alle Datenbanken, Volumes, Images, Originale und Belege blieben erhalten; neun Originalhashes und Original-PG PID1578 sind unverändert. Danach waren 12.375.232.512 Bytes verfügbar gegenüber 16.589.934.592 Bytes vorgeschriebener Reserve: mindestens 4.214.702.080 Bytes fehlen noch. Keine unbenutzten Images oder Build-Caches sind vorhanden. RAM-basierte temporäre Ablagen ersetzen diesen Plattennachweis nicht.

Vor einem neuen Gesamtlauf fehlen genügend Plattenkapazität, eine neue echte Tages-/Quellen-/Finanz-/Fensterbindung, alle 32 frischen Voraussetzungen und erst danach ein neues kandidatgebundenes lokales GO. Das vollständige gültige Startfenster vom 18.10. ist bereits verstrichen. Originale, beanspruchte Aufträge und Geldgrenzen bleiben unverändert. Kein Merge, Deployment, Production-Eingriff oder kostenpflichtiger Production-Modellaufruf wurde durch diese Arbeit freigegeben.
