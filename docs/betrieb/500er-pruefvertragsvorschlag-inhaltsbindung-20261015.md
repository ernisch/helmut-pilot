# Lokal freigegebener Prüfvertrag zur Inhaltsbindung

Stand15.10.2026UTC. Ausdrückliches Betreiber-GO für lokale Integration und den zusätzlichen begrenzten Architekturversuch liegt vor. Branch `codex/immutable-command-proof-20261015`. Maßgeblicher aktueller Endbeleg: [Lokale Endprüfung](500er-lokale-endpruefung-20261015.md).

## Verbindliche lokale Änderung

Unveränderliche tatsächliche Auftragsinhalte dürfen einmal vollständig offline geprüft und mit einem sicheren, kryptografisch gebundenen Nachweis über Requests wiederverwendet werden. Die gesonderte Offlinephase hat höchstens90000ms einschließlich Lesen, ursprünglichem T/C, Einfrieren, nativer Nachkontrolle und Persistenz. Sie ersetzt weder Unit60 noch Auth30. Die gesamte Zeit einschließlich dieser Phase wird getrennt gemessen.

Laufzeitvorbereitung aus dem gültigen Beleg höchstens60000ms. Unit60 höchstens60000ms vom tatsächlichen J.enter bis finalem CAS/ACK. Jede Authmutation einschließlich Lesen/Queue/Callback/CAS/ACK höchstens30000ms. Gesamter Anwendungsspeicher maximal2048MB. Alle16Kontrollpunkte (10Loads+6Admissions), sämtliche frischen Prüfungen sowie originales Gesamt-/Endfenster bleiben verpflichtend. Kein positiver Zeitpunkt oder Speicherwert darf aus einem vorzeitig abgebrochenen Lauf als erfolgreicher Gesamtabschluss ausgegeben werden.

## Inhaltsbindung und Lebenszyklus

Der originale native Speicherpfad hasht den tatsächlich gespeicherten JSONB-Text, prüft ihn vollständig im quellgebundenen isolierten Worker und bindet den Nachweis an Originalcommandhash, tatsächliche Bytes/SHA/Bytezahl, Zeilen-/Datenbankidentität, Ziel, native Quellen, Verifikatorversion, exakte Nodeversion und Veröffentlichungspolicy. Ed25519 verwendet einen unabhängig konfigurierten vertrauenswürdigen öffentlichen Schlüssel. Der private Schlüssel existiert ausschließlich im privilegierten lokalen Offline-/Rootprozess, nicht im Runtimeprozess oder Worker.

Feste Beleggültigkeit höchstens9h und niemals über das Planende hinaus; Zugriffe verlängern sie nicht. Eine kalte Wiederherstellung prüft Signatur, alle Bindungen, tatsächliche Bytes, vollständiges ursprüngliches T und den ursprünglichen Commandhash erneut. Warm kann ausschließlich der tatsächlich geprüfte eingefrorene private Graph wiederverwendet werden. Änderungen, ungültige oder fremde Belege, Ziel-/Code-/Policywechsel und Ablauf verhindern Wiederverwendung. Kein automatischer Wiederaufbau nach unbekannten Wirkungen.

Jeder Request erhält eine neue private Session. Einmalige Proofs sind an tatsächliches Packet, Command, Session und Freigabegeneration gebunden. Parallelkonflikte lehnen den Verlierer ab, ohne den Gewinner zu widerrufen; geschlossene oder ausgelaufene Kontexte erlauben keinen Rückfall mit alter Capability. Fremde Commands einschließlich des ursprünglichen U-Vorgängers behalten ihren originalen vollständigen Datenbank-/T-/C-Pfad.

Native ALWAYS-Trigger verhindern Runtimeänderung/Löschung/Umbenennung/Wiederherstellung/TRUNCATE. Runtime darf weder Besitzer/Superuser noch Funktionsveränderer sein. Vertrauenswürdiger DB-Administrator und kontrollierte Schemaänderungen bleiben Voraussetzung. Die lokale SQL-Proposal ist keine angewandte Productionmigration.

## Frische Sicherheitswirkungen

An jeder Grenze bleiben ihre ursprünglichen Berechtigungs-, Admission-/Original-GO-, Zeit-/Deployment-, exakt500Profile-/Identitäts-, Quellen-/KO-, Kostenbuch-/Tageszähler-/Reservierungs-/Abrechnungs-, Journal-/Claim-/Reentry-, Notstopp- sowie CAS/ACK-Prüfungen erhalten. Keine Wiederverwendung früherer positiver Auth-/Finanzzustände oder privater B2-Fähigkeiten. Signierte Rootfreigaben entstehen ausschließlich nach tatsächlichen ursprünglichen FS-/Gate-/Primary-/TestGO-Prüfungen. Der Inhaltsbeleg enthält und erteilt keine Ausführungsfreigabe.

Eine Änderung geprüfter Eingaben benötigt einen neuen Originalhash und eine neue passende fachliche/technische Bindung. Ein unbekannter oder fehlgeschlagener beanspruchter Auftrag bleibt gesperrt. Weder Platzhalterinhalte noch gelockerte Vollständigkeitsregeln sind Teil dieses GO.

## Tatsächlicher Stand

Integriert; vollständige Offlinephase55,650s, Installation13,142s mit echtem Original-U, kalte Runtimevorbereitung12,688s und beobachtete Authmutationen maximal0,500s bestanden. Nodepeak einschließlich Worker993,6MB. Der erste Unitversuch scheitert korrekt an übernommenen unvollständigen Briefingeingaben (`briefing-ohne-tagesanlass`, Morgen fehlt); alle16Kontrollen erreicht, aber kein finaler Unit-ACK. Kein erfolgreicher Unit60-/Warm-Request-/500er-/Productionnachweis. Details und Primärbelege im Endbericht.

Die Freigabe gilt ausschließlich lokal. Kein Merge, Deployment, Migration, Productionvorgang, Budgeteingriff, keine Profilaktivierung und keine kostenpflichtigen Productiontests. Ein finales Production-GO bleibt separat erforderlich.
