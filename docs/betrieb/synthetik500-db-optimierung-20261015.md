# Datenbankoptimierung für den synthetischen 500er Auftrag, 15.10.2026

Status: lokal implementierter und mit tatsächlichem PostgreSQL/PostgREST geprüfter Leserbaustein. Keine Productionmigration, kein Deployment und kein 500er Startnachweis aus diesem Kandidaten.

Der neue service_role-Leser bündelt die vollständigen 874 Source23-Dokumente und 500 KO60-Objekte in einen frischen, nur lesenden RPC. Alle ursprünglichen Quellen-, Batch-, ID-, Versions- und Hashprüfungen bleiben erhalten. Andere Eingaben verwenden synchron den ursprünglichen Pfad; nach begonnenem RPC erfolgt kein Wiederholungsversuch. Der Server und der optierte Client begrenzen die vollständige Antwort auf 16 MiB. Der allgemeine Storagepfad behält sein bisheriges Verhalten.

Ein einziger privater positiver Objektverweis darf ausschließlich den neu hinzugefügten Nachweis der rekursiv eingefrorenen Eingabestruktur wiederverwenden. Globale Transportbedingungen werden bei jedem Aufruf geprüft. IDs, Nonce, Datenbanklesung und sämtliche ursprünglichen Sicherheitsprüfungen bleiben frisch.

| Messung auf vollständigen Originaldaten | Vorher | Nachher | Beobachteter Unterschied |
| --- | ---: | ---: | ---: |
| Originaler vollständiger Leser gegen gebündelten Leser | 528,101 ms / 14 HTTP | 429,970 ms / 1 HTTP | 98,131 ms / 18,58 % |
| Zusätzlicher Strukturcheck, kalt gegen dieselbe positive Identität | 36,155 ms | 0,964 ms | 35,191 ms |
| Neuer vollständiger Leser, kalte gegen warme Identität | 492,148 ms | 344,528 ms | 147,620 ms |

Dies sind einzelne lokale Paare, keine garantierten Productionlaufzeiten. Die unterschiedlichen Unterschiede werden nicht addiert oder auf 500 Profile hochgerechnet. Das letzte Paar enthält zusätzlich JIT-/GC-/Datenbankvariation. Neue Command-Decodes können den einzelnen Cacheeintrag verdrängen. Die Antwort steigt von 2.836.290 auf 2.933.541 Bytes; der Gewinn ist kein Nachweis geringerer Antwortbytes.

Vollständige Ergebnisse und Originalhashes sind identisch. Tatsächliche ACL-/Read-only-/Commitfrischeprüfungen, ein serverseitiger Übergrößenfall, neun lokale HTTP-Capfälle und die unabhängigen gezielten Readerprüfungen sind belegt. Datenbank und Authzustand blieben bei den Zeitmessungen unverändert. Der isolierte Übergrößenfall wurde exakt restauriert; sein physischer TOAST-Zuwachs ist getrennt dokumentiert.

Das Quellenaudit deckt den begrenzten direkten D/R-500-Pfad einschließlich versteckter Readbacks, Runtime/Profile, Auth-CAS, Publikationslinks, Belegen und finalen Ausgaben ab. Auth-CAS bestätigt bereits mit derselben Antwort; notwendige frische Authstände und Publikationsbeweise werden nicht zwischengespeichert. Weitere Bündelungskandidaten sind ohne Gleichheits- und Zeitbeleg nicht umgesetzt.

Die 60 Sekunden Vorbereitung, 30 Sekunden Sicherheitsprüfung und der vollständige D/R-Unit60-Nachweis sind offen. Der erfolgreiche frische direkte Pfad enthält mindestens 16 vollständige Commandprüfungen und 10 frische Command-Decodes innerhalb der Unit. Eine hinreichende Beschleunigung ihrer reinen Berechnungen ist gesondert nachzuweisen. Profile bleiben inaktiv; der kostenpflichtige 500er Test benötigt das separate finale GO.

Lokale Primärbelege: `/workspace/helmut-parallel-20261015/wave2/DATABASE_OPTIMIZATION_EVIDENCE_INDEX.SAFE.json`. Der Index bindet Quellen, vollständige Zugriffsberichte, echte DB-Messungen und unabhängige Prüfberichte per SHA256. Keine privaten Nutzdaten oder Schlüssel werden ins Repository übernommen.
