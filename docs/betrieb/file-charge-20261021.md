# Speicherzuordnung und Kapazitätsgrenze am 21.10.2026

**Teilweise geklärt, kein weiterer Motorumbau oder Test gestartet.** Die vorhandenen
Belege ordnen178.290.688Bytes der diagnostischen JIT-Einrichtung zu. Das ist keine
zusätzliche Motorersparnis. Die vollständige500er-Abnahme und500MB-Reserve bleiben offen.

Fortsetzung auf `5504c8e6`, Branch
`codex/controlled-cleanup-and-late-probe-20261020`, Entwurfs-[PR927](https://github.com/ernisch/helmut-pilot/pull/927).
Keine fremden Änderungen; c8624f7c erhalten. Die aktuelle Cloud ist angebunden,
die historische Originalcloud weiterhin nicht direkt. Fünf geschützte Container,
Originalbank und kanonische827a-Metadaten sind bei Wiederaufnahme unverändert.
Drei getrennte SOL-Helfer prüfen Verlauf, Quellen und Methode; keine externen Modelle.

## Was jetzt aus bestehenden Belegen zugeordnet ist

Der bereits akzeptierte Fall `heap-c35697a3832dc8dd58b21042` enthält eine vollständige
JIT-Restaurierungsquittung. Noch vor PostgreSQL/SQL werden974neue Dateien in der
privaten `/ram`-tmpfs erzeugt:176.281.648logische Bytes und178.290.688tatsächlich
allokierte reguläre Dateibytes. Die zugehörigen Gruppenbeobachtungen zeigen:

| Im begrenzten JIT-Einrichtungsintervall | Vorher, Bytes | Nachher, Bytes |
| --- | ---: | ---: |
| `memory.stat.shmem` |0 |178.290.688 |
| `memory.stat.file`, enthält shmem |370.311.168 |548.601.856 |

Beide Anstiege sind exakt178.290.688Bytes. Frisches privates Dateisystem,
Erzeugungsweg, tatsächliche Allokationen und Messintervall qualifizieren diesen
Einrichtungsanteil. Die drei Links im separaten PostgreSQL-Lib-Mount zeigen auf
dieselben Dateien; sie erzeugen keine zweite JIT-Kopie.

Der zuvor beobachtete Anstieg von `file`724.992→370.311.168Bytes liegt beim
persistent erzeugten und vollständig geprüften Datenbankklon. Das ist ein
belegter Einrichtungszusammenhang, aber keine exakte spätere Inode-/Memcg-Zuordnung.
Originale und Runtime können zuvor extern geladene Cachepages besitzen.

Diese Einrichtungsarbeiten gehören weiterhin zur vorgeschriebenen gemeinsamen
Lebenszeitmessung. Ihre Bytes werden weder vom gemessenen Peak abgezogen noch
als freie Reserve ausgegeben. Ein Verschieben in andere Prozesse, Ausschließen
des Caches oder bloßes Ändern der Speichergrenze wäre kein Lösungsnachweis.

## Welche Aussage weiterhin fehlt

Die14Node-/Gruppenframes vor und nach dem letzten Restore enthalten jeweils
`file=605392896`, darin `shmem=233881600`. Der spätere Worker-Messpunkt
`measurement-complete` hat `file=605753344` und denselben shmem-Wert.
Diese Zeitpunkte sind verschieden und zerlegen den historischen Gesamtpeak nicht.
Nach PostgreSQL-/PostgREST-Abschluss sind178.294.784shmem-Bytes beobachtet;
das belegt einen Lebenszeit-Zusammenhang, keine exakte Objektzerlegung.

Dateiallokation, gemappte residente Seiten und Cgroup-Verbrauch sind getrennte
Größen. `file` enthält bereits `shmem`; weder RSS-Summen noch `file-shmem`
weisen einzelne Datenbank-, JIT- oder Cache-Inodes einem Speicherbesitzer zu.
Die vorhandene Prozessprobe erfasst Node55/Postmaster8/PostgREST37, nicht den
bedienenden Backend54. Frühere smaps-Proben liefern keine nachträglichen
Pagecache-Charges.

Ein begrenzter Census an sechs vorhandenen Kontrollgrenzen könnte nur dortige
tmpfs-Allokationen und bekannte PostgreSQL-Mappings zeigen. Alle sechs Grenzen
liegen vor dem letzten Restore. Auch eine einzelne spätere Beobachtung würde
nur ihren eigenen Messpunkt erklären. Dieser Zusatz schließt die entscheidende
Lücke zum vermeidbaren Motorbedarf oder Gesamtpeak nicht; daher kein neuer
Actor und kein weiterer nativer Versuch für diesen Vorschlag.

Der unabhängige Methodenbericht enthielt zunächst eine falsche Zeitbezeichnung
für605392896Bytes. Er bleibt unverändert erhalten; der verlinkte Korrekturbeleg
trennt die14Frames vom späteren Worker-Messpunkt. Keine Rohmessung wurde geändert.

## Sichere Kapazitätsprüfung

Der Wiederaufnahme-Snapshot zeigt14.959.497.216Bytes frei:220.282.504Bytes fehlen
zur unveränderten Volladmission15.179.779.720Bytes. Das ist keine Reservierung;
neue Belege verbrauchen weiteren Platz. Die Komponentenadmission wäre räumlich
möglich, ist aber kein sachlicher Grund für eine weitere unwirksame Messung.

Die separat installierten öffentlichen Supabase-/Vercel-CLIs unter
`/workspace/.helmut-cloud-tools/node_modules` belegen nominell720.142.336Bytes.
Die zwei größten konkret geprüften ELF-Dateien belegen zusammen282.112.000Bytes.
Einzelne Node-, Python-, PostgreSQL- oder PostgREST-Laufzeiten sind keine Kandidaten.

**Keine Archivierung oder Löschung:** `/workspace` ist OverlayFS. Hohe Inodewerte
und vorinstallierte Zeitstempel sind Hinweise auf die untere Imageschicht;
die konkrete Schichtzugehörigkeit der Dateien ist nicht bewiesen. Bei Dateien
der unteren Schicht erzeugt Entfernen lediglich Whiteouts, während ein neues
Archiv zusätzlichen Platz belegen würde. `du`/`st_blocks` belegen deshalb hier
keinen rückgewinnbaren Speicher. Keine Copy-up- oder Löschprobe zur Klärung.

Zusätzlich fehlen tatsächliche Archivgrößen, zwei vollständige unabhängige
Rekonstruktionsvergleiche und Nutzungsfreigabe. Supabase wäre nach Entfernen seines
Binärteils bis zur Wiederherstellung nicht verfügbar; Vercel könnte unbemerkt auf
JavaScript zurückfallen. Solche Änderungen werden nicht als unveränderte Werkzeuge
ausgegeben. Anrechenbare Rückgewinnung:0Bytes. Die alten Kandidatenlisten enthalten
keine weitere verbliebene qualifizierte Datenbankkopie. Alle Originale,
Rekonstruktionsarchive, Arbeitsstände, Quellen, Belege und Ressourcen bleiben erhalten.

## Entscheidung

Der bereits integrierte und vergleichbar belegte Umbau bleibt unverändert:
1.170.790.400→1.015.904.256Bytes,154.886.144Bytes/13,23% Ersparnis.
Die aktuelle Zuordnung beweist keinen weiteren vermeidbaren Motorverursacher,
kein Plateau und keine500MB-Reserve. Keine neue Architektur auf Verdacht.

Ein vollständiger500er-Lauf ist derzeit nicht empfohlen oder freigegeben.
Er braucht ausreichende tatsächlich verfügbare Platte,32frische Startbedingungen,
gültige Fall-/Zeitbindung und ein neues konkretes GO. Alte GOs bleiben verbraucht.
Offline90/Unit60/Auth30,1500brauchbare Ergebnispositionen und16frische Kontrollen
je Profil bleiben unverändert. Bekannte private CI-Originalbindungen und Vercel
sind getrennte offene Probleme; kein Merge oder Deployment.

Für die Fortsetzung bleiben zwei konkrete Voraussetzungen: Eine tatsächlich
freigebbare persistente Kapazitätsquelle muss belegt sein; ein weiterer Motorumbau
braucht eine belastbare Ursache für vermeidbaren Verbrauch. Der vorgeschlagene
sechs-Punkte-Census erfüllt Letzteres nicht und wird nicht gestartet.
Hier fortsetzen, Denkstufe **Sehr hoch**, wegen nativer Speicherzuordnung und
Schutz der Originalbindungen.

## Belege

- [Frische Original-/Kapazitätsprüfung](belege/file-charge-20261021/ROOT_RESUME_PROTECTION.SAFE.json).
- [Verlauf und bestehende Zuordnung](belege/file-charge-20261021/FILE_CHARGE_FINDINGS.SAFE.json).
- [Unabhängige Methode](belege/file-charge-20261021/METHOD_REVIEW.SAFE.json)
  mit [Korrektur der Zeitbezeichnung](belege/file-charge-20261021/CORRECTION_ADDENDUM.SAFE.json).
- [Begrenzung des Census](belege/file-charge-20261021/SOURCE_REVIEW.SAFE.json).
- [CLI-Quellenprüfung](belege/file-charge-20261021/CLI_ARCHIVE_FEASIBILITY.SAFE.json),
  [Kapazitätsbedingungen](belege/file-charge-20261021/CLI_ARCHIVE_REQUIREMENTS.SAFE.json)
  und [unabhängige Sperre](belege/file-charge-20261021/CLI_ARCHIVE_INDEPENDENT_SCOPE.SAFE.json).
- [Vorherige Kandidatenprüfung](belege/file-charge-20261021/DELTA_ARCHIVE_FEASIBILITY.SAFE.json).
- [Bytegleiche Kopien und Quellpins](belege/file-charge-20261021/REVIEWABLE_COPIES.SAFE.json).
- [Vollständiger voriger CAS-Abschluss](cas-heap-20261021.md).
