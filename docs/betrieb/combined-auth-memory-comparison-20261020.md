# Gemeinsamer Speichervergleich des alten und aktuellen Authpfads

Stand 20.10.2026. Branch `codex/controlled-cleanup-and-late-probe-20261020`,
Entwurfs-PR [927](https://github.com/ernisch/helmut-pilot/pull/927), auf PR926,
PR925 und PR924. **Gemeinsame RAM-Ersparnis der Authkomponente reproduziert;
vollständiger Motor, Zeitvertrag und500MB-Puffer weiterhin offen.**

## Änderung und nachgewiesene Ursache

Der Motor enthält bereits drei strukturelle Korrekturen: PR925 ersetzt die
materialisierten Vorkommens-/Sortier-/Tokenmengen des PostgreSQL-Renderers durch
einen begrenzten Tiefenstapel und64KiB-Ausgabefragmente. Die kalte Hashprojektion
vermeidet eine unnötige vollständige Knotensortierung. Der Kontrollcache hält
die authentische4.856.607B-Sicht als eigenen komprimierten Buffer innerhalb
derselben2MiB-Grenze, mit exakten Hash-/Längen-/UTF8-Prüfungen und weiterhin
frischen nativen Bindungen. U-Schreiben/CAS/ACK und unbekannte Schreibausgänge
bleiben unverändert. Diese Produktänderungen wurden bereits auf6d528425 mit
179/179 Suiten abgenommen; dieser Schritt ergänzt ihren gemeinsamen Vergleich.

Der zuvor stärkste isoliert belegte vermeidbare RAM-Verbrauch lag im alten
PG-Renderer: rund124,8MB zusätzliche anonyme Backendbelegung. Der frühere
Cachevergleich hatte den neuen Renderer auf BEIDEN Seiten und belegte trotz
geringerer HTTP-/Serialisierungsarbeit keine robuste gemeinsame RAM-Ersparnis.
Der neue Vergleich prüft deshalb den echten V11-Authcode gegen ALLE aktuellen
Authkorrekturen. Seine gesamte Ersparnis wird keiner einzelnen Änderung allein
zugeschrieben. Die konkrete verbleibende Snapshot-Allokationsursache in Node
ist weiterhin nicht bewiesen; kein weiterer Umbau auf Verdacht.

## Tatsächlicher fairer Vergleich

Je eine eigene persistente Kopie der authentischen späten Quelle827a9872,
1709Dateien/369.399.611B,6000 historische Einträge. OLD nutzt die exakten
U/Parts-Snapshots und beiden SQL-Funktionskörper aus5fae25be. NEW nutzt den
integrierten aktuellen Code. Beide installieren genau zwei Funktionskörper
mit gleichem Setup; vollständiger Katalog/ABI/ACL bleiben sonst identisch.
Gleiche PG-Einstellungen, PostgREST-Pool2, Node384MiB Old/16MiB Semi,
256MiB originales JIT-tmpfs und identische27 echte HTTP-RPCs:
5 vollständige Reads,4 CAS,18Kontrollen,3 Änderungen plus Wiederherstellung.

Die native gemeinsame Lebenszeitgruppe umfasst Quellen-/Kopierarbeit,
Installation, JIT, Node, PG, PostgREST und sämtliche eigenen Prozessenden.
Keine Addition getrennter Spitzen, kein Peakreset, kein erzwungener GC und
keine Cachebereinigung. Die Grenze1.547.997.184B/high1.399.996.416B/swap0 ist
auf beiden Seiten gleich; alle high/max/OOM-Ereignisse bleiben0. Die native
Begrenzung allein wird nicht als Einsparung gewertet. Keine Behauptung identisch
kalter Hostcaches; die Reihenfolge OLD–NEW–NEW–OLD begrenzt Reihenfolgeeffekte.

| Arm | Gemeinsamer Lebenszeitpeak, Bytes | Gesamtdauer, s | Ergebnis |
|---|---:|---:|---|
| OLD1 | 1.164.427.264 | 34,043 | PASS |
| NEW1 | 1.023.926.272 | 31,410 | PASS |
| NEW2 | 1.007.882.240 | 31,758 | PASS |
| OLD2 | 1.177.153.536 | 34,412 | PASS |

Paarweise sinkt der Peak um140.500.992 beziehungsweise169.271.296B.
Die beiden NEW-Spitzen liegen beide unter beiden OLD-Spitzen. Mittelwerte:
**1.170.790.400→1.015.904.256B, Ersparnis154.886.144B/13,23%.**
Gesamtdauer34,228→31,584s; gemeinsameCPU35,165→31,312s; tatsächliche
Geräteschreibmenge341.159.936→306.837.504B. Kumulative Schreibmengen sind
kein RAM. Die27 Aufrufe allein benötigen14,060→11,047s.
HTTP-Antwortkörper157.016.193→57.089.403B, Kontrollserialisierungen41→5.
Auch diese beiden Mengen sind keine zusätzliche RAM-Ersparnis.

## Sicherheit, Verlauf und Grenzen

Der gesonderte Null-Auth-Lebenszeitfall `control-bd23264526494f6fcfab1715`
bestand vor den vier Messungen:652.660.736B/18,204s, keine Node-/Autharbeit.
Alle vier Messungen wurden einzeln frisch adoptiert und vollständig beendet.
Die unabhängige SOL-Abnahme prüft344 kleine Fallbelege und22 Quellpins,
108 echte RPCs,92 frische Nonce-/History- und72 Graphbindungen,16 bestätigte
CAS-Revisionen sowie6000History-/Kontrollfelder,606B physische Referenzen,
Originalhashes und Wiederherstellung. Nur die jeweils frisch bestätigte finale
Revision ändert sich. Alle68 begrenzten Captures endeten fehlerfrei.
PG endet0; der originale PostgREST−2 ist ausschließlich mit der unveränderten,
engen12.2.3-SIGTERM-/Identitäts-/EOF-Policy akzeptiert. Frühere FAILs bleiben FAIL.

Aktuelle gemeinsame Runden-Endwerte NEW1:943.861.760/943.955.968/963.506.176B;
NEW2:942.022.656/932.900.864/947.195.904B. Natürliche GC-Wellen bleiben sichtbar.
**Drei Runden belegen weder kontinuierliches Langzeitwachstum noch ein belastbares
Plateau.** Anon/File/Shmem/Kernel und Node sind im geschlossenen Zahlenbeleg
getrennt erhalten; Shmem gehört bereits zu File. Die vorherige instrumentierte
[Besitzerdiagnose](native-auth-ownership-20261020.md) bleibt eine andere Messung
mit Sammlereinfluss und lückenhafter Host-PSS-Zuordnung, kein Ersatz dieses ABBA.

Der vollständige V11 benötigte2.151.936.000B. Die dort fehlenden603.936.000B
Reserve werden durch den Komponentenvergleich NICHT nachträglich geschlossen.
Exakt500 aktive Profile,1500 geprüfte brauchbare Positionen, alle16 Kontrollen
je Profil, Offline90/Unit60/Auth30, gesamte Installation/Abschluss und dauerhafte
Reserve500.000.000B sind weiterhin nicht gemeinsam bewiesen. Eine Teilkomponente
unter1.548.000.000B ist kein voller Motorbeleg. Das Ziel ist technisch günstiger
geworden, seine Erreichbarkeit für alle500 bleibt offen; Sprint teilweise abgeschlossen.

## Integration und nächster Haltepunkt

Der byteidentisch integrierte diagnostische Starter liegt unter
`scripts/helmut-resource-meter/combined-auth-baseline-native-launcher`;
Root-PREP7c32a0ce bindet30 unveränderte Körper und die richtigen alten/neuen
SQL-/JS-Paare. Die unabhängige Quell- und Root-Einbindungsprüfung bestanden.
Root prüfte einmal4 Python-ASTs,5 Node-Syntaxfälle und20 Auswahlguards;
keine Wiederholung der179 bereits bestandenen Produktsuiten.

Die fünf PASS-Arbeitskopien sind vor Start ausdrücklich entbehrlich klassifiziert;
ihre kontrollierte Entsorgung bleibt getrennt von Messung/Belegsicherung.
Kanonische Quelle827a, Originale, alle Belege und Hüllen bleiben geschützt.
Platten-Volladmission und genaue32 Startbedingungen sind separat frisch zu prüfen.
Der unveränderte Vollstartvertrag bindet bisher DeepSeek; der Konflikt zur
aktuellenSOL-Vorgabe wird nicht umgangen. Betreiberkosten/Reserven bleiben gleich.
Kein vollständiger500er Lauf ohne neues konkretesGO, keine Production/Merge/
Deployment/Migration. Im selben Thread mit Denkstufe Sehr hoch fortsetzen.

## Unveränderte Zahlenbelege

- [Root-Zahlenvergleich mit40 Eingabepins](combined-auth-abba-actual-summary-20261020.SAFE.json).
- [Unabhängige tatsächliche Vierarm-Abnahme](combined-auth-all-four-sol-review-20261020.SAFE.json).
- [Quellprüfung](combined-auth-source-sol-review-20261020.SAFE.json) und
  [Einbindungsprüfung](combined-auth-integration-sol-review-20261020.SAFE.json).
- [Null-Auth-Lebenszeit](combined-auth-zero-lifecycle-actual-20261020.SAFE.json)
  und [deren Abnahme](combined-auth-zero-lifecycle-sol-review-20261020.SAFE.json).

Private Rohdaten bleiben unter
`/workspace/helmut-ram-fix-20261020/combined-auth-baseline-comparison-20261020/cases`.
Keine Ersatzoriginale, Modellaufrufe, kostenpflichtige Infrastruktur oder neuen
500er Freigaben wurden daraus erzeugt.
