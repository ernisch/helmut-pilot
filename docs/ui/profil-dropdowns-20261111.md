# Profil: Partei, Fraktion und Ort als Dropdowns

Stand 11.11.2026. Branch `codex/profil-dropdowns-20261111`, Basis `3a012b0b`.
**Endstatus: blockiert.** Partei, Fraktion und Ort sind implementiert und lokal
geprueft. Noch kein Merge oder Production-Rollout, weil die erforderliche
GitHub-Browserinstallation an DNS der Ubuntu-Paketserver scheitert.
Status: lokal umgesetzt und geprüft; [PR1134](https://github.com/ernisch/helmut-pilot/pull/1134),
Codecommit `21484e9b`. CI43024856182: Browser und Standardprüfung erfolgreich,
363/364 Fachbereichssuiten erfolgreich. Ein alter Test verlangte noch das ersetzte
Partei-Textfeld; diese Erwartung ist jetzt auf das Dropdown korrigiert.
Aktuelle Pflicht-CI und Kopf siehe PR. Die Dauerfreigabe in `AGENTS.md`
vom11.11.2026 erlaubt den auftragsbezogenen Merge und regulaeren Rollout nach Gruen.
Der parallel gemergte Hauptstand `8293a307` ist integriert; die kompakte
Statusdokumentation bleibt gemeinsam unter ihrer verbindlichen Groessengrenze.

CI43035811742 auf dem integrierten Kopf `4b8bf6f2` bestand die Syntax-,
Offline-, Fachbereichs- und Datenbankpruefung. Beide Browser-Installationsversuche
scheiterten vor Teststart an `Temporary failure resolving azure.archive.ubuntu.com`
(Originalarchive der Versuche1/2 gelesen). Ein begrenzter Versuch entfernte den
bekannt defekten Mirror-Eintrag nur auf seinem kurzlebigen Testrechner, sofern
vorhandene offizielle HTTPS-Ubuntu-Fallbacks erhalten blieben. Originaldatei wurde
gesichert; fehlender offizieller Fallback stoppte. Playwright1.56.1, Chromium,
APT-Signaturen, Paket-Hashes und Pflichtpruefungen blieben unveraendert.
Der unveraenderte eingebettete Python-Helfer wurde lokal aus dem Workflow
extrahiert: YAML/Python-Syntax und acht Positiv-/Negativfaelle bestanden,
einschliesslich Idempotenz und Abbruch ohne offiziellen HTTPS-Fallback.

CI43042168335 auf `b47ff88b` bestaetigte nach diesem Eingriff stattdessen
`Temporary failure resolving archive.ubuntu.com`: Auch der offizielle Spiegel
war nicht erreichbar. Der Browserjob scheiterte wiederum vor dem Test;
der danach bereits rote Gesamtlauf wurde zur Logauswertung und zum Vermeiden
weiterer unnoetiger Wiederholungen abgebrochen. Das Originalarchiv ist gelesen.
Der wirkungslose CI-Workaround ist wieder entfernt; Workflow, Versionen und
Schutzpruefungen entsprechen dem bisherigen Hauptstand. Keine blinden weiteren
Installationsversuche und kein Merge bei fehlender Pflichtpruefung.

Der inzwischen aktuelle Hauptstand `68abc505` einschliesslich Buero-Formatwahl
ist zusaetzlich in einer separaten, konfliktfreien Testkopie integriert:
Commit `410edc4b948ecd5eff493048608113b4035e282a`, Baum
`21f286ed67fc1ac066353921c288c8c7fa4d8f8e`. Profil37/37, Schnellkern14/14,
Browser126/126 plus Adminstart17/17 bestanden; Statusdokument29699Zeichen/340Zeilen.
Vercel-Vorschau `dpl_2GWK7zprbDKt1dziyJ8QnGH8Sh3U` auf `4b8bf6f2` READY:
Client und Ortsdatei HTTP200, alle drei Dropdowns im ausgelieferten Client,
16Laender/10578Ortsnamen im ausgelieferten JSON. Kein Production-Profil bearbeitet.

Partei und Fraktion sind im eigenen Mandatsprofil und in der Ersteinrichtung
getrennte native Auswahllisten. Parteiunabhängigkeit (`parteilos`) und
Fraktionsunabhängigkeit (`fraktionslos`) sind getrennt auswählbar.
Die Listen gelten für Bundestag und Landtage. Bestehende abweichende
Bezeichnungen bleiben als gewählte Option erhalten; leere Angaben erhalten
keinen stillen Standardwert. Neue Freitexteingaben entfallen.

Ort ist ebenfalls eine native Auswahlliste, gefiltert nach Bundesland.
Beim Bundeslandwechsel wird ein Ort, der im neuen Land nicht vorkommt,
abgewählt. Kein neuer Ort wird automatisch ausgewählt. Die Ortsdatei wird
erst beim Öffnen des Profils vom eigenen Server geladen und im Arbeitsspeicher
wiederverwendet. Ein Ladefehler wird mitgeteilt; gespeicherte Angaben bleiben
erhalten. Abgebrochene Ansichten werden von einer verspäteten Antwort nicht
verändert. Der bestehende autorisierte PATCH-Pfad bleibt unverändert.

## Ortsquelle

Statistisches Bundesamt (Destatis), Gemeindeverzeichnis GV-ISys,
Gebietsstand 30.09.2026. Originaldatei und SHA256 stehen in
`assets/profil-orte-20260930.json`. Quelle:
[Amtliches Gemeindeverzeichnis, 3. Quartal 2026](https://www.destatis.de/DE/Themen/Laender-Regionen/Regionales/Gemeindeverzeichnis/Administrativ/Archiv/GVAuszugQ/AuszugGV3QAktuell.html).

Übernommen wurden Satzart 60 ohne unbewohnte gemeindefreie Gebiete
(Textkennzeichen 66), nach dem zweistelligen Landesschlüssel gruppiert.
Verwaltungszusätze nach dem ersten `, ` wurden entfernt (z. B.
`Salzgitter, Stadt` → `Salzgitter`). Gleichnamige Orte innerhalb eines
Bundeslands teilen denselben Ortsnamenwert. Das ergibt aus 10.749 Einträgen
10.578 unterschiedliche Ortsnamen in 16 Ländern, alphabetisch nach deutscher
Sortierung. Keine Ortsteil- oder Wahlkreiszuordnung wird behauptet.
Vervielfältigung und Verbreitung sind laut Original mit Quellenangabe gestattet;
die Profilmaske nennt Destatis und den Gebietsstand.

## Nachweise

- Syntax und `git diff --check` bestanden.
- `node scripts/lokal.js -- node scripts/onboarding-tenant-test.js`: 37/37,
  einschließlich gerenderter Partei-/Fraktionsauswahl der Ersteinrichtung.
- Gezielt korrigierter `admin-nutzer-anlegen-schnellstart-test.js`: 34/34.
- Browser-/Mobile-Smoke mit lokalem Originalserver und System-Chromium:
  126/126, zusätzlich der enthaltene Adminstart-Nachweis 17/17.
  Die 12 neuen Profilprüfungen testen Desktop/Mobil, bestehende Werte,
  Bundeslandwechsel und echtes lokales PATCH/Speichern/erneutes Öffnen
  für Bundestag und Landtag mit ausschließlich synthetischem Mandat.
- Schnellkern: 14/14 Suiten. Drei lokale HTTP-Suiten mussten wegen
  Sandbox-`listen EPERM` außerhalb der Sandbox mit demselben
  Produktionszugangsschutz nachgeholt werden; alle bestanden.

Keine Production-Datenänderung, kein Modellaufruf. Rückweg nach einem
freigegebenen Rollout: den zugehörigen UI-Commit regulär zurücknehmen;
es gibt keine Migration oder Datenumformung. Nächster Schritt:
nach DNS-Erholung die erforderliche Browser-/Pflicht-CI am aktuellen PR-Kopf
abschließen, dann automatisch mergen, regulaeren Rollout
und ausgelieferte Profilfelder rein lesend kontrollieren.
