# Lokaler Versuch: atomare LLM-Verbrauchshistorie

Stand: 17.10.2026. Ausschließlich lokaler Architekturversuch. Kein Production-
Schemaauftrag, keine Aktivierung und keine Freigabe für einen vollständigen 500er Lauf.

## Änderung

Der bisherige Kontenschreibweg überträgt und schreibt die vollständige `llmUsage`-
Historie bei jeder Kontomutation erneut. Die vorhandene relationale Projektion
allein ist kein Ersatz: Sie lässt unter anderem Vertrags- und Abgleichfelder weg.

Der Kandidat verwendet die bereits vorhandenen Tabellen `llm_usage` und
`helmut_store`. Eine ausdrücklich gestartete Transaktion übernimmt einmal die
vollständigen Originaleinträge. Danach speichert eine CAS-Transaktion nur neue
Einträge und den übrigen Kontostand gemeinsam. Berechtigungen, Kostenbücher,
Profile, Quellen, Fristen und Notstopp werden nicht zwischengespeichert.

Jeder relationale Eintrag enthält das unveränderte JSON-Objekt. PostgreSQL erzeugt
Datensatz- und Kettenhash als echte gespeicherte generierte Spalten. Änderungen
an den Originalbytes berechnen diese Hashes deshalb auch bei deaktiviertem
Zeilentrigger neu. Frische Lesevorgänge prüfen Kette, Anzahl, Reihenfolge und Kopf
gegen die gebundene Kontorevision. Alle 5000 ursprünglichen Datensatzhashes wurden
gegen `sha256(convert_to(record::text, 'UTF8'))` abgeglichen. Server und Verbindung
müssen UTF8 verwenden; die native JSONB-Darstellung ist an PostgreSQL 17.6 gebunden.

`ALWAYS`-Trigger verhindern direkte Änderungen/Löschungen der übernommenen
Historie, ungebundene Kontoschreibvorgänge und Truncate. Neue Einträge und Kosten-
kontostand gewinnen gemeinsam oder werden vollständig zurückgerollt. Bei
bestätigtem CAS-Konflikt darf der vorhandene Mutationspfad frisch lesen; bei
unklarer Netzwerkbestätigung gibt es keine automatische Wiederholung.

Kostenquittungen behaupten ausdrücklich **keine** Blobablage. Eine private
Prozessbindung bestätigt den tatsächlich beantworteten atomaren Schreibvorgang;
die Abrechnung verlangt zusätzlich einen frischen Datenbankstand und den exakt
enthaltenen Datensatz. Bei fehlender Bestätigung bleibt die bestehende
Reservierungs-/Fehlerbehandlung erhalten. Kein unbestätigter Betrag wird freigegeben.

## Lokale Schalter und Rückweg

- Standard bleibt der bisherige Blobpfad.
- Kandidat: `HELMUT_LLM_USAGE_STORAGE=relational-atomic-v1`, nutzbarer lokaler
  Supabase-Datenbankpfad und PostgreSQL-GUC `helmut.local_usage_experiment=on`.
- JavaScript verweigert Vercel, HTTPS und öffentliche Zielhosts. SQL-RPCs
  verweigern die Ausführung ohne den separaten lokalen Datenbankschalter.
- `supabase/proposals/auth_usage_atomic_local.sql` ist ein inaktiver Vorschlag;
  er gehört nicht zu automatisch angewendeten Migrationen.
- Bootstrap nur in einer neuen, angehaltenen lokalen Testkopie und nur bei
  Übereinstimmung des nativen vollständigen Originalhashes. Vorhandene Generationen
  oder kollidierende IDs werden nicht still übernommen.
- Rückweg: Schreibzugriffe anhalten, Restore-RPC mit frischer erwarteter Revision
  ausführen und vollständige rekonstruierte Historie prüfen. Erst danach den
  lokalen Schalter ausschalten. Das relationale Archiv bleibt erhalten.
- Ein gemischter Betrieb alter/neuer Writer oder ein Production-Rollout ist mit
  diesem Versuch ausdrücklich nicht qualifiziert.

## Tatsächlicher kleiner Vergleich

Je Variante: 96 vollständige Lese-/CAS-Mutationen, davon 24 mit einem neuen
Verbrauchseintrag; 5000 vorhandene Einträge, abschließend 5024. Tatsächlicher
Storage-Code, PostgreSQL/PostgREST, Node 24.19.0, PostgreSQL 17.6, Netznamespace
ohne externen Zugang; keine Profile aktiviert und keine Modellanbieter aufgerufen.
Ein gemeinsamer Kernelzähler erfasst Datenbank, Node, Hilfsprozesse und Dateicache
bis zum letzten Prozessende. Die vorhandene äußere Beobachtung liegt bei beiden
kleinen Varianten außerhalb dieser Gruppe. Dies ist kein vollständiger
Ressourcenbeleg für den 500er Ablauf.

| Messwert | Bisheriger Scalar-JSONB-Schreibweg | Finaler Kandidat |
| --- | ---: | ---: |
| Gemeinsamer Lebenszeit-Speicherhöchststand | 811.950.080 B | 680.054.784 B |
| WAL-LSN-Zuwachs im Schreibabschnitt | 92.240.536 B | 59.256.280 B |
| Temporäre Datenbankdateien | 0 B | 0 B |
| CPU im übereinstimmenden Mutationsabschnitt | 26,642111 s | 27,735437 s |
| Median einer vollständigen Mutation | 254,401358 ms | 256,948009 ms |
| Langsamste vollständige Mutation | 404,767699 ms | 327,689252 ms |
| Summe der 96 Mutationen | 24,376580 s | 24,928068 s |
| Einmaliger Bootstrap einschließlich Gleichheitsprüfung | entfällt | 739,267448 ms |
| Vollständige kleine Lebenszeit-CPU | 29,028665 s | 31,839908 s |

Der Kandidat spart 131.895.296 B Spitzenspeicher (16,24 %) und 32.984.256 B
WAL-LSN-Zuwachs (35,76 %). Im vergleichbaren Mutationsabschnitt steigt die CPU um
4,10 %, die summierte Laufzeit um 0,551488 s. Die vollständige Lebenszeit-CPU des
Kandidaten enthält zusätzlich Bootstrap und zusätzliche negative Prüfungen und
ist deshalb kein Vergleich identischer Arbeit. `pg_stat_wal` wurde ebenfalls
erfasst; asynchron veröffentlichte Statistikwerte werden nicht mit dem synchron
abgelesenen LSN-Zuwachs gleichgesetzt.

Zwei verworfene Leserfassungen erzeugten unnötige breite Sortierungen bzw.
wiederholte Serialisierung. Der finale Leser vermeidet beides durch schmale
Kettenprüfung und die nativen generierten Hashes. Die ältere Baseline wurde nicht
unnötig wiederholt. Keine Aussage über einen statistisch abgesicherten Mittelwert.

## Sicherheitsnachweise

Zwölf gezielte Gruppen bestanden mit tatsächlicher Datenbank:

1. Native generierte Hashes und UTF8-Bindung; kein explizites Überschreiben.
2. Fehlende Datenbank führt zu Abbruch, niemals zu lokalem Ersatzschreiben.
3. Einzelner atomarer Eintrag und wahrheitsgemäße, nicht fälschbare Quittung.
4. Alter Leser/Writer wird nach dem lokalen Übergang zurückgewiesen.
5. Veraltete CAS-Revision überschreibt weder Bücher noch Historie.
6. Zwei gleichzeitige RPCs: ein Gewinner, ein Konflikt, ein Eintrag.
7. Historische Änderung, Löschung, Umordnung und Triggerumgehungsfälle.
8. Doppelte ID rollt auch zuvor eingefügte neue Einträge und Kontostand zurück.
9. Rein lesende native Rekonstruktion; echte Manipulation wird erkannt.
10. Unberechtigte Datenbankrolle darf weder lesen noch RPCs ausführen.
11. Verlorene Bestätigung wird nicht wiederholt; gefälschte Quittung abgewiesen.
12. Rückweg stellt den vollständigen alten logischen Stand mit Archiv wieder her.

In beiden Messkopien wurde ein eigener Datenbankabsturz mit tatsächlichem WAL-
Redo geprüft, ohne den Schreibabschnitt zu wiederholen. Physischer und logisch
rekonstruierter Datenbankhash stimmen vor/nach der Wiederherstellung überein.
`fsync`, `full_page_writes` und `synchronous_commit` blieben aktiv; WAL-Kompression
blieb aus. Bestehende lokale Regressionen: Kostenbudget 26, Lagequittungen 30,
relationale Ablage 44 sowie Konten-CAS 15 Prüfungen bestanden. Dies ersetzt keine
der 16 Sicherheitskontrollen pro Profil im vollständigen Test.

DeepSeek `deepseek-v4-pro`, Aufwand `high`, hat den exakten finalen Laufzeitcode,
SQL-Vorschlag und die gelieferten realen Prüfbelege rein lesend unabhängig
geprüft: kein blockierender Fehler für den lokalen Versuch. Sol hat anschließend
die ausdrücklich benannte Übergabelücke in `ai.js` gezielt geprüft:
`node scripts/lokal.js scripts/lage-atomic-quittung-test.js` bestand alle drei
Fälle. Die echte Abschlussfunktion akzeptiert dieselbe gebundene Quittung,
verweigert eine serialisierte Kopie und eine gefälschte Blobmarkierung; auch bei
spätem Transportfehler erfolgt nur ein Abschluss. Dieser zusätzliche Test mockt
Provider und Speicherbestätigung und ersetzt keinen Datenbank- oder Buchungstest.

Die ausgeführte kleine Fixture ist unverändert als
`scripts/helmut-resource-meter/auth-usage-atomic-small-fixture.py` gesichert; der
eigentliche Storage-Prüfer steht daneben in `auth-usage-atomic-check.js`. Die
Fixture verwendet den vorhandenen `kernel-meter.py`, feste ursprüngliche lokale
Pfade und einen vor jeder Ausführung verifizierten privaten Eingabehash. Sie ist
kein allgemeiner Startbefehl und kein Ersatz für den vollständigen Vorabcheck.
`HELMUT_USAGE_COMPARE_MODE` unterscheidet `baseline`, `atomic` und `security`.
Keine vorhandene Messung zur Probe wiederholen.

## Grenzen und nächster Ressourcenlauf

Der Speicher wächst über die 96 Mutationen weiterhin; weitere veränderliche
Kontofelder werden noch als Gesamtobjekt geschrieben. Ein Plateau oder die
Einhaltung von 2.048.000.000 B im vollständigen Lauf ist nicht belegt. Unit60,
Auth30 und Offline90 wurden mit diesem Kandidaten nicht vollständig durchlaufen.
Die historische Unit60-Reserve von 1,049644 s darf nicht übernommen werden.

Vor einer neuen konkreten GO-Anfrage sind erforderlich:

1. Den bestehenden vollständigen Controller und Vorabcheck an die native logische
   Rekonstruktion anschließen. Direkte physische Blobleser würden nur die neue
   Bindung sehen; sie dürfen nicht auf leere Historie zurückfallen. Originalhash,
   aktueller physischer Hash, Generation und tatsächliche SQL-/Spaltendefinitionen
   sind getrennt zu belegen. Keine Änderung des Prüfvertrags.
2. Eine neue isolierte Fallbindung mit unverbrauchten Ressourcen und gültiger
   Tagesbindung erstellen. Die bereits korrigierten historischen Nulltage bleiben
   unverändert. Alte Aufträge/GOs bleiben verbraucht.
3. Die bestehende Plattenreserve und ein wirklich freies geeignetes Loopgerät
   nachweisen. Die letzte Bestandsaufnahme bot nur 10.663.145.472 B freien Platz
   gegenüber 16.589.934.592 B Mindestreserve; gebundene fremde Geräte nicht lösen.
4. Alle 32 Startbedingungen einschließlich tatsächlicher Containersichtbarkeit
   frisch prüfen und unabhängig abnehmen. Der späteste freigegebene Start am
   17.10.2026 um 17:35 Istanbul ist verstrichen; kein Start außerhalb des Fensters.
5. Erst dann genau ein neues ausdrückliches lokales GO für diesen Kandidaten
   anfordern. Der spätere Lauf muss 500 Profile, 8000 Kontrollen, 1500 Positionen,
   vollständigen Abschluss und unveränderte Zeiten/Gesamtspeicher erfassen.

Production bleibt separat gesperrt. Dieser lokale Versuch belegt weder die
vollständige Infrastrukturkostendeckung noch den Übergang zur getrennten Vercel-/
Supabase-Architektur. Dafür bleiben kontrollierte Integration und der echte
kostenpflichtige 500er Nachweis jeweils gesondert freizugeben.
