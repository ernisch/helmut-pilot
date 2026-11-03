# W15: begrenzte autonome Mock500-Serie

Betreiberauftrag vom 03.11.2026 UTC. Gilt ausschließlich für die bestehende
isolierte GitHub-Umgebung `helmut-ci-originals`, ohne Production-Wirkung.

## Umfang und unveränderte Einzelverträge

Höchstens drei vollständige Originalläufe insgesamt, nicht drei je Fehler,
Commit, Tageswechsel, Automation oder wiederaufgenommener Sitzung. Erster
Ausführungskopf ist unverändert
`789ea3ad49509d8a575a3e545333505f64e0f2ea` (PR #1032,
Pflicht-CI 41707992564). Alte verbrauchte Versuche bleiben erhalten. Eine alte
unverbrauchte Einzelfreigabe begründet keinen zusätzlichen vierten Versuch.

Der Serienwächter ist ausschließlich eine zusätzliche Zulassungsgrenze vor dem
vorhandenen Einmal-Launcher. Er startet keine Jobs, beschafft keine Links und
ersetzt keine bestehenden Prüfungen. Jede tatsächlich zugelassene Ausführung
braucht weiterhin ihre eigene frische Nonce, exakt gebundene Codequalifikation,
Originalbindungen, Pflicht-CI, unabhängigen Review und einzelne technische
Freigabe. Maximal eine private Linkrunde und ein Dispatch je Kindfreigabe.
GO-/REQUEST-Metadaten dürfen vor der Reservierung vorbereitet und unabhängig
geprüft werden. Ausführbar werden sie erst nach dauerhafter Reservierung und
getrenntem Reservierungsanker: Launcherstart, Linkrunde und einziger POST prüfen
diese Bindung jeweils selbst.

Unverändert bleiben 180 Minuten Verarbeitung und 210 Minuten insgesamt,
vollständig innerhalb desselben UTC- und Berliner Kalendertags im genehmigten
Fenster 01.–07.11.2026. Kein historisches Systemdatum und keine rückdatierte
Berechtigung. Frische Links erst nach READY; unmittelbar vor Dispatch müssen
mehr als 90 Sekunden tatsächliche Restgültigkeit und höchstens 65.535
Parameterzeichen bestehen. Keine Linkauffrischung.

Der dynamisch frisch ermittelte gemeinsame Hostschutz behält exakt
2.147.483.648 Bytes Hostreserve, Swap/OOM/harte Grenzereignisse null und mindestens
536.870.912 Bytes freie Platte. 60 Datenbankverbindungen, Auth unter 30 Sekunden,
Unit unter 60 Sekunden und Mockphase unter 20 Sekunden bleiben unverändert.
Höchstens 0,05 USD neue Speicherung je Versuch, 0,15 USD für die Serie insgesamt;
je Versuch maximal ein verschlüsseltes Artefakt mit einem Tag Aufbewahrung.
Keine echten Modellaufrufe, neuen Ressourcen, Merges oder Deployments.

## Dauerhafte Versuchszählung und Fortsetzung

Eine unveränderlich gehashte Betreiberfreigabe und ein privates, exklusiv
geschriebenes und synchronisiertes Journal binden alle Kindversuche an genau
eine Serie. Ein reservierter Platz zählt konservativ bereits vor Links und
Dispatch gegen die drei Versuche und seine maximale Speicherreserve. Ein
ungeklärter Startausgang bleibt gesperrt; er wird weder gelöscht noch durch
einen frischen Prozess oder ein anderes Verzeichnis zu einem neuen Versuch.
Ein unvollständiges oder widersprüchliches Journal ist kein leeres Journal.
Getrennte exklusive Anker für Reservierungen, Abschlüsse und Serienstopps
verhindern, dass ein verkürztes Journal einen beendeten Platz wieder öffnet.
Die gesamte authentifizierte GitHub-Laufhistorie seit Serienfreigabe wird vor
einer weiteren Zulassung mit diesen Belegen abgeglichen.

Sol prüft vor jedem Start unabhängig zusätzlich die tatsächlichen GitHub-Läufe.
Nie zwei geschützte Läufe gleichzeitig. Ein noch nicht abgeschlossener Platz
verbietet einen zweiten Start. Nach PASS, UNKNOWN, Sicherheitsverletzung,
ungeklärtem Prozesszustand oder unklarer Originalintegrität wird die Serie
gesperrt. Ein funktionaler FAIL erlaubt ausschließlich Reparaturarbeit; er
erteilt allein noch keine weitere Startberechtigung.

Ein weiterer Platz setzt den authentifiziert zugeordneten Abschluss des
vorherigen FAIL, vollständig bekannten sicheren Prozesszustand, die konkrete
Ursachen-/Korrekturbindung und einen tatsächlich geänderten Nachfolgecommit
voraus. Gezielte Prüfungen, Pflicht-CI und unabhängiger Review müssen auf dessen
tatsächlichem Kopf bestanden sein. Keine spekulative Wiederholung desselben
Fehlers. Nach Ausschöpfung weiter nur erlaubte Entwicklungsarbeit, kein vierter
Originallauf. Keine automatische Branchrücksetzung oder Beleglöschung.

## Vollständige Abnahme desselben tatsächlichen Laufs

Vor Aktivierung müssen sämtliche 500 tatsächlichen Eingaben über Originalbuilder,
D, Provider, Review und vollständigen C-Auftrag gültig gebunden sein. Historischer
Quellenvertrag und November-Simulationskalender bleiben unverändert; reale
Ausführungszeiten bleiben aktuell. Die positive unabhängige End500-Abnahme
41325430429 und der bestehende Originalempfang werden übernommen.

PASS verlangt exakt 500 gleichzeitig aktive synthetische Profile, 500 Einheiten,
1.000 lokale Modellphasen, 1.500 einzeln geprüfte gespeicherte Ergebnisse,
8.000 Sicherheitskontrollen und 17.000 Auditprüfungen. Fehlende, leere, doppelte,
unbrauchbare und technisch fehlerhafte Ergebnisse werden getrennt bilanziert.
Vollständige verschlüsselte Sicherung, authentifizierte entfernte Rücklesung,
zweite frische Wiederherstellung, vollständiger Integritätsvergleich, finale
Nullaktivität und tatsächlicher Prozessstillstand bleiben Pflicht. Acht äußere
Bereinigungsprüfungen ersetzen keinen inneren Datenbank-Nullaktivitätsbeleg.
Endabnahme unabhängig vom ausführenden Modelllauf; keine zusammengesetzten
Erfolge verschiedener Runs und keine Umwertung historischer FAILs.

## Zeitsteuerung und Nachweisgrenze

Der bisherige reine lokale Countdown startet selbst keinen Job und ist keine
verlässliche automatische Fortsetzung nach Ende eines Modelllaufs. Die bereits
vorhandene Codex-Automation kann erst nach unabhängiger Abnahme des zusätzlichen
Serienwächters an diesen Auftrag gebunden und aktiviert werden. Vor Ausführung
müssen ihr ursprünglicher Thread, die tatsächlich angebundene Arbeitsumgebung,
die geprüften Code-/Privatdateien und das persistente Journal erreichbar sein.
Fehlender Zugriff ist BLOCKED, kein Anlass zur Rekonstruktion einer leeren Serie.
Eine gespeicherte Zeitsteuerung ist noch kein Beweis ihres späteren Starts.
Vor Zulassung muss deshalb ein tatsächlicher laufender Codex-Zeitsteuerungs-
Aufruf mit passender Thread-/Umgebungsidentität beobachtet und an den frischen
unabhängigen Vorflug gebunden sein. Ohne diesen Beleg erfolgt kein Dispatch.

Rückweg: Automation pausieren, keine weiteren Empfangspfade benutzen, eigene
Prozesse kontrolliert stoppen und Stillstand prüfen. Originale, Secrets, Drive,
Historie und verschlüsselte Belege erhalten. Production500 bleibt nicht ausgeführt
und separat freizugeben; Anbieterressourcen bleiben unabhängig zu beurteilen.
