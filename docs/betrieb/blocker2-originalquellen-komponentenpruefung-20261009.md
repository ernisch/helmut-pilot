# Blocker 2 — Originalquellen und aktuelle 500er-Komponentenprüfung (09.10.2026)

## Zweck und Abgrenzung

Dieser Bericht dokumentiert zwei getrennt zu bewertende Ergebnisse vom 09.10.2026: die Wiederherstellung von acht exakten vollständigen Originaltexten zu sichtbaren KO und eine unabhängige tatsächliche Neuauszählung der aktuellen 500er-Komponente. Beide Ergebnisse sind rein lesend erhoben. Es gab keine Aktivierung, keinen 500er Funktionstest, keine Production-Schreibvorgänge und keine bezahlten Helmut-Modellaufrufe.

Der Bericht trennt strikt zwischen **Body-Verfügbarkeit** — liegt ein exakter Volltext der veröffentlichten Quellenseite vor? — und der **positiven Abnahme** von Quelle, Tatsachen, Zeitbezug und Profilversorgung. Verbessert wurde ausschließlich die Body-Verfügbarkeit. Die fachliche Abnahme bleibt **0 von 500**.

Die Quellenmatrizen wurden mit DeepSeek Flash High rein lesend geprüft; diese Modellprüfungen führten keine Tests aus. Ein separater Python-Verifier prüfte tatsächlich alle 500 vollständigen Antworten, Körper- und Eingabehashes, KO-/Quellversionen, Quellenzugehörigkeiten und sämtliche neuen Ledgerzeilen. Root führte die Ergebnisse zusammen und korrigierte die unten beschriebenen Abgrenzungen. Die Hashbindungen des unabhängig geprüften Ledgers blieben dabei unverändert.

## Unveränderte Ausgangslage

| Feld | Wert |
| --- | --- |
| Capture-Run | `37923233626` |
| Workflow-Commit | `e5a3a3e9…` |
| Production-Commit | `81a70cbe…` |
| Unabhängiger Beleg-Hash | `8a7bc73a342fa313517392a98f0a6a4e66299c369c0dd38fcfcee2ede35ee77d` |
| Hashverifizierte Dateien der drei Quellenpakete | 127 |
| Schreibvorgänge der Quellenwiederherstellung | 0 |
| Bezahlte Helmut-Modellaufrufe der Wiederherstellung | 0 |
| Neue Schreibvorgänge (gesamt) | 0 |

Die tatsächliche 500er-Eingabe bleibt unverändert: rohe Bodies und Eingabe-Hashes sind verifiziert, jede Eingabe enthält 500 KOs mit je 59 Feldern und 875 Quellen mit je 19 Feldern, alle 500 Ledger-Zeilen sind exakt. Sichtbar sind 20.525 Karten, 398 KO-Kennungen und 91 Gruppen mit 91 zusätzlich erhaltenen Mitgliedern. Die acht Wiederherstellungen haben keine Eingabeversion verändert; es wurde kein Capture allein wegen externer Belege neu ausgelöst.

## Acht exakte Volltextwiederherstellungen

| # | KO-Kennung | Form | Sichtbare Profile | Belegte Quellenseite |
| --- | --- | --- | --- | --- |
| 1 | `ko-vg-kommissionspräsidentin-20260926-6e0da6` | `native_full_render` | 152 | [Original](https://www.deutschlandfunk.de/eu-kommissionspraesidentin-von-der-leyen-kuendigt-710-millionen-euro-hilfsgelder-fuer-vertriebene-un-102.html) |
| 2 | `ko-vg-bezirksbürgermeister-20130813-631155` | `native_full_render` | 16 | [Original](https://www.openpr.de/news/740149/Bezirksbuergermeister-Kleebank-weiht-Baum-der-Erinnerung-ein.html) |
| 3 | `ko-vg-entscheidungstag-20260915-6213de` | `native_full_render` | 5 | [Original](https://table.media/podcast/2026-09-15-entscheidungstag-fuer-merz) |
| 4 | `ko-vg-kanzler-20260913-34a2b7` | `native_full_render` | 3 | [Original](https://table.media/berlin/professional-briefing/916-kanzler-krise-debatte-um-oerr-arktis-gipfel) |
| 5 | `ko-vg-cannstatter-20260925-2ffa75` | `native_full_render` | 3 | [Original](https://www.deutschlandfunk.de/cannstatter-volksfest-hat-begonnen-108.html) |
| 6 | `ko-vg-exekutivausschusses-20260915-e4046d` | `HTML` | 5 | [Original](https://vietnam.vn/de/hoi-nghi-ban-chap-hanh-lien-doan-lao-dong-tinh-lan-thu-5-nhiem-ky-2025-2030) |
| 7 | `ko-vg-überschritten-20260915-88acbf` | `HTML` | 4 | [Original](https://www.vietnam.vn/de/nhat-ban-so-nguoi-tu-100-tuoi-tro-len-lan-dau-vuot-moc-100-nghin-nguoi) |
| 8 | `ko-vg-drohnenangriff-20260925-8e8203` | `native_full_render` | 255 | [Original](https://www.deutschlandfunk.de/sieben-tote-bei-angriff-auf-buerogebaeude-in-kiew-102.html) |

Zugehörige Quellenkennungen der privaten Belegbasis, unverändert übernommen:

1. `rd-f6626eeb6eb85d5473ca1c7087bfdb9eca0804a688cc5ff8d5f0076047464bf1`
2. `rd-66692bd3d79081a3390cdcbe1f8ea5bbf60aff78e1250e7f200ffc5f4aa44991`
3. `rd-1d0ab0fe5eb04f19fed2343d5d136d4f0a0b11802077bd8648f1a2c3e9956d7a`
4. `rd-334d4c1bf090a8325341143a0be48d96a64d5d66388caa4ff6e220e26a5cf4c1`
5. `rd-e1754b96f568d7317f3e220b2d8ae4afa15766fc6246ff870e63ef1cf0301abc`
6. `rd-7dc4764417171da0e72b129ea7780fdaa19ad0036c83415ef28dab297de3949d`
7. `rd-0f078ba66f3bdad8e10072d88e8f76f05b1eedb3861ca31279feb79aa0a6010f`
8. `rd-f6d21343b62073d58d76fc8f5154283d4b03bbf42e9febfe8950a033ba19f963`

Gemeinsamer Umfangsvorbehalt für alle acht Positionen: wiederhergestellt ist der vollständige Text genau der veröffentlichten Quellenseite; Podcast-Audio und verlinkte Einzelartikel sind nicht beansprucht. Bei den sechs öffentlichen Webrenderungen wurde der vollständige gerenderte Quellentext gesichert, kein natives Original-HTML oder HTTP-Header. Die beiden Vietnam-Quellen wurden zusätzlich als vollständiges natives HTTP-200-HTML samt Headern gesichert. Exakte Erstpublikationshistorie bleibt offen.

Die acht Positionen ergeben zusammen 443 Profil-Sichtbarkeiten; die Vereinigungsmenge umfasst 347 Profile.

## Unabhängige 500er-Neuauszählung der gelisteten negativen Fälle

Die Herkunftsprüfung hat den Umfang der bisherigen Ableitung korrigiert: Der Ausgangsledger bindet ausdrücklich nur 26 frühere negative KO-Fälle (`negativeEvidenceOnly=true`) an die aktuelle Aufnahme. Die spätere Ableitung entfernt die acht neu belegten KO-Fälle. Für die anderen sichtbaren KO prüft dieser Pfad keine individuellen Artikelkörper. Die rechnerische Abwesenheit eines gelisteten Falls ist deshalb kein positiver Volltextnachweis. Frühere hashgebundene Ledgers bleiben unverändert; ihre darüber hinausgehenden Vollständigkeitsbeschreibungen werden nicht übernommen.

| Kennzahl | Baseline | Aktuell |
| --- | --- | --- |
| Profile mit mindestens einem KO aus der gelisteten Negativmenge | 499 | 465 |
| Profile mit mindestens einem neu wiedergewonnenen Körper | — | 347 |
| Profile neu ohne einen dieser gelisteten Fälle | — | 34 |
| Positiv abgenommene Profile | 0 | 0 |
| Fehlender vollständiger positiver Nachweis | 500 | 500 |
| Fehlende Eingaben | 0 | 0 |
| Leere Eingaben | 0 | 0 |
| Doppelte Antworten | 0 | 0 |
| Technische Antwortfehler | 0 | 0 |
| Bekannte sichtbare Tarifwidersprüche | 372 | 372 |
| Offene KO im Prüfumfang | 26 | 18 |
| Offene Quellen im Prüfumfang | 28 | 20 |

Die Differenz 499→465 beträgt genau34.35Profile enthalten keinen der18verbleibenden gelisteten Fälle;23davon enthalten weiterhin den Tarif-KO,12nicht. Weder diese35Profile noch die12Kandidaten sind damit positiv volltextgeprüft. Im bisherigen negativen Prüfumfang von26KOs/28Quellen verbleiben18KOs/20Quellen. Das ist keine vollständige Inventur aller möglichen Quellenlücken. Root hat die korrigierte Zählung direkt gegen alle500aktuellen Antwortkörper und ihre Hashes geprüft (Beleg-SHA256`d9f0aa257dbd3a14d2ea2b58a37ee6f478cc46b8c2ac7ef23d5ef685dbed1fc8`). Fehlende, leere, doppelte und technisch fehlerhafte Antworten bleiben bei0.

## Body-Verfügbarkeit ist nicht fachliche Abnahme

Die acht Volltexte belegen ausschließlich, dass zu sichtbaren KO ein exakter Text der veröffentlichten Quellenseite vorliegt. Sie belegen **nicht** die positive Qualität der Quelle, nicht einzelne Tatsachen, nicht den Zeit- und Zuständigkeitsbezug, nicht die Relevanz für ein konkretes Mandat und nicht die vollständige positive Profilversorgung. Ebenso wenig belegen sie, dass jede einzelne Aussage eines sichtbaren Elements einer bestimmten Textstelle zugeordnet ist.

Für die acht neu gebundenen KO liegt jeweils der vollständige veröffentlichte Text genau ihrer Quellenseite vor. Für alle übrigen sichtbaren KO folgt daraus kein Volltextnachweis. Verlinkte Einzelartikel, Audio, historische Erstpublikation, sämtliche Fakten, Zeit-, Zuständigkeits- und Profilurteile bleiben gesondert zu prüfen. Der Baseline-Ledger bleibt erhalten. Die Fachabnahme bleibt bei0von500.

Trennung der beiden Ebenen:

| Ebene | Aussage | Stand |
| --- | --- | --- |
| Body-Verfügbarkeit | Exakter Volltext der veröffentlichten Seite liegt vor | 8 Positionen neu belegt; keine vollständige Profilabdeckung abgeleitet |
| Positive Abnahme | Quelle, Tatsachen, Zeit und Profil individuell akzeptiert | 0 von 500 |

## Konkrete nächste Quellenprüfung

Position100der aktuellen Aufnahme ist als kleinster bisheriger Kandidat ohne gelisteten Negativfall und ohne Tarif-KO vorbereitet:42sichtbareKO-Versionen,60Source19-Verträge und326Ausgabeaussagen. Auch Auswahl und Auslassungen gegenüber dem globalen500KO-Pool müssen fachlich geprüft werden. Source19 enthält keinen Rohtext; bei50der60Quellen fehlt auch ein brauchbarer Auszug.

Die lokale Herkunftsinventur hat alle60Verträge direkt an die aktuelle Eingabe gebunden und147unterschiedliche Original-/Textartefakte hashgeprüft. Stand dieser Inventur:1bereits gebundenes DLF-Recovery,40Kandidaten mit noch offener Artikelidentität/-vollständigkeit und19fehlende oder nicht vollständige Originalnachweise (8ohneURL,3Fehlabrufe/Redirects,4Zugangssperren,3Landing-/Abstractseiten,1Metadatenseite). Katalog-SHA256`7931e1488fca381fa3cbe253ff4ffe12797d9846e655d070e045e82b2b7c33d2`; Root-Abgleich`8352ca5a22f3fa54c5f5c2117fde805c4ac30e3f297f42bdc4d9c5441d8b1a47`. Die anschließende Einzelprüfung ist jetzt abgeschlossen; ihr begrenztes Ergebnis folgt unten. Vollständige HTML-Bytes, HTTP200, eine Seitennavigation oder verwandte Artikel ersetzen keinen vollständigen exakten Originaltext.


## Integrierte Artikel- und Zeitprüfung der 40 Kandidaten

35 weitere vollständige eigene schriftliche Seiten-/Artikelkomponenten sind an die aktuellen Source19- und KO59-Verträge gebunden: 18 aus Paket A, 17 aus Paket B. Hinzu kommt das schon gebundene DLF-Drohnen-Recovery. Damit sind **36 von 60 Quellenkomponenten** des Audits belegt; **24 Quellen** bleiben ohne diesen Nachweis. **32 von 42 Audit-KOs** haben mindestens eine belegte eigene schriftliche Komponente, zehn noch keine. Eine vorhandene Komponente belegt weder sämtliche zugehörigen Quellen noch Tatsachen, historische Artikelversion, Erstveröffentlichung, Zuständigkeit oder Profilrelevanz.

Offen bleiben bei den 40 Kandidaten die falsche Stern-Themenweiterleitung, zwei Top-Agrar-Zugangssperren, die Tiefe einer Stern-Videoseite und eines eigenständigen DLF-Artikels. Die beiden Bundestagsartikel wurden an der richtigen Artikelsektion gebunden; andere historische Sektionen werden nicht übernommen. Tagesschau/WDR ist nur als tatsächlich veröffentlichter eigener Seitentext gebunden. Ein gespeicherter DLF-Redirect belegt diese Seitenidentität, nicht die historische Wortfassung. Audio, Video und verlinkte Dokumente werden nicht durch den Seitentext mitabgenommen. Der Nachtkritik-Aprilscherz bleibt ausdrücklich als erfundener Inhalt gekennzeichnet.

Root hat die 40 Originalkörper, 39 DOM-Extraktionen und eine vollständige PDF-Textextraktion erneut geprüft, 643 physische Zeilenzitate kontrolliert und alle 500 tatsächlichen Antwortkörper mit der gebundenen KO-/Quellenbasis verglichen. **458 Antworten** zeigen Audit-KOs mit mindestens einer neuen verfügbaren schriftlichen Komponente; **466** einschließlich des bereits vorhandenen DLF-Recovery. Nur **91 Antworten** nennen eine neue positive SourceId ausdrücklich im sichtbaren Output. Fehlende SourceIds beweisen keine fehlenden URL-Quellenangaben. Die 942 globalen Eingabe-Quellenverträge werden nicht als sichtbare Zitate gewertet; die anderen 356 sichtbaren KOs erhalten durch dieses begrenzte Audit keine Volltextabnahme. Die wiedergewonnenen Texte wurden nicht in die damaligen Modelleingaben eingefügt; ihre tatsächliche Modellnutzung ist nicht belegt. **Fachabnahme bleibt 0/500.**

Auch die Zeitinventur aller 40 Quellen ist integriert. A enthält zwei exakte deklarierte Publikationsübereinstimmungen, eine nur auf Sekundenpräzision und sechs Abweichungen von expliziten Publikationsdeklarationen; beide DLF-Seiten enthalten intern verschiedene Publikationsfelder. B enthält zwölf deklarierte Metadatenabweichungen, zwei sichtbare Datums-/Standabweichungen, fünf Fälle ohne genaue Publikationszeit und eine deklarierte Übereinstimmung. Die übrigen A-Fälle betreffen fehlende Zeitangaben, unbestimmte Rollen oder Zonen, PDF-Metadaten und Datumsunterschiede. Stand und dateModified sind von datePublished getrennt; unbekannte Uhrzeit oder Zeitzone wird nicht ergänzt. Bei ZDF entspricht die sichtbare Zeit der Aktualisierungsdeklaration, bei der Frankfurter Rundschau steht dem Septemberdatum im Vertrag eine Julideklaration gegenüber. Das sind Prüfhinweise, keine automatischen Gegenfakten oder Datenkorrekturen. Keine historische Erstveröffentlichung ist dadurch bestätigt.

Private neue Root-Belege unter `/workspace/blocker2-semantic-progress-20261009/`:

- `root-40-article-component-integration-proof-private.json`, SHA256 `e9509c4dda28567973fa8a1570bc3e93c6fb1d7f6819f229f537ec288846ba5d`: 25.081 tatsächliche lokale Prüfungen, 824 gebundene Artefakte, keine Profilabnahme.
- `root-40-time-integration-proof-private.json`, SHA256 `5bac1af3cdab689ab75cddf421299a0dddeecc5e37aa41f5f60ff1ad56c3ef48`: 1.694 tatsächliche Prüfungen und 83 kontrollierte UTC-Vergleiche aus expliziten Offsets.
- `root-actual-model-read-coverage-proof-private.json`: neun tatsächliche DeepSeek Flash High Read-Läufe; 16 individuelle Notizen aus A und alle 20 aus B erhalten. Vier kompaktierte A-Notizen werden nicht als Modellreviews behauptet; die korrigierte A01-Artikelsektion wurde lokal integriert. DeepSeek führte keine Tests aus.

Die neue Prüfung ist lokal gesichert. Sie ist nicht Bestandteil der unten beschriebenen älteren 174-Dateien-Drive-Sicherung; eine neue externe Sicherung wird nicht behauptet.

## Bekannte Tarifwidersprüche und keine neuen Gegenfakten

Im sichtbaren Bestand bleiben **372** bekannte Tarifwidersprüche bestehen. Diese Zahl ist der einzige belegte Widerspruchsstand und gegenüber der Baseline unverändert. Aus den im vorliegenden Material nicht gestützten Einzelheiten werden **keine neuen belegten Gegenfakten** abgeleitet. Für den DLF-Befund gilt: eine zeitgleiche Odessa-Behauptung ist nicht gestützt, ein neuer belegter Gegenfakt liegt nicht vor, und Seitentag und Sendung sind nicht die Erstveröffentlichung.

## Root-Abgleich

| Punkt | Belegter Stand |
| --- | --- |
| Japan | Das Original stützt ausdrücklich die Überschrift über 100.000. Der Wert 107.677 ist im Textkörper prospektiv und **kein** durch den aktuellen KO behaupteter Wert; es wird kein belegter Gegenfakt ergänzt. |
| Vietnam | Beim Exekutivausschuss sind `political_level` und `decision_level` aktuell `unknown`. Es wird keine falsche deutsche Bundesebene behauptet; Provinz- und Gremienangaben sowie die individuelle Relevanz bleiben unvollständig. |
| Table | Die veröffentlichte vollständige Berlin.Table-Ausgabe ist ihr eigener Quellentext und **nicht** die Gesamtheit der einzeln verlinkten Geschichten. Beim Podcast ist das veröffentlichte Transkript wiedergewonnen; Audio- und ASR-Treue sind nicht verifiziert. |
| Reform | Ein verwandtes amtliches Bundesprogramm (Koalition CDU/CSU+SPD, Wohnungsabschnitt 18, 12 Seiten, Druckseite 8, PDF-SHA256 `bc9474e8ad5ad7de37ae9c274a1e77ff6a1a786c69f2cb60ca262fca7689c2ef`) stützt einen Bund/Land-Prüfkandidaten, ist aber **nicht** die exakt fehlende ZEIT-Quelle. Die exakte ZEIT-Quelle bleibt nicht verfügbar; das Programm darf die ZEIT-Quelle nicht ersetzen. |

## Tarif: bestehende Autorisierung und konkreter Transportblocker

| Punkt | Stand |
| --- | --- |
| SQL | `041378b6fecd58b41639bd072b23fb6fd36aa0fb5d9fd005102b3e5a01b14e5a` |
| Autorisierung | bereits ausdrücklich erteilt |
| Anwendung | weiterhin nicht angewendet |
| Umfang | 1 KO UPDATE + 1 Primärquellen-UPDATE + 1 inkompatibler KO-/Quellen-Link-DELETE; Quelldokumente bleiben erhalten; Embedding bewusst NULL |
| Nativer Fehler | `McpServerError: Invalid or expired requestState; JSON-RPC -32602 invalid_request_state` |
| Letzter Schreibversuch | nach bestätigtem Brave-Web-Reconnect mit „Connected“ erneut derselbe Fehler |
| Native Caller-Rechte | postgres mit vollständigen DML-Rechten auf drei Ziele, bestätigt13:56:22UTC |
| Vollständige Nachkontrolle |14:13:00.83382UTC:52gebundeneTabellen/372.070Zeilen, alle Zeilen-/xmin-Aggregate und vollständige Ziele unverändert; zusätzlich328unabhängige Python-Prüfungen |
| Aktueller nativer Lesezugriff | rein lesende Probe14:43:06UTC erfolgreich |
| Management-API |14:48:16UTC:auch mit`read_only:false`als Transportparameter in einer ausdrücklich nur lesenden SQL-Transaktion weiterhin`supabase_read_only_user`,SELECTtrue/UPDATE-INSERT-DELETEfalse auf allen dreiZielen; kein neuer DML-Versuch |
| Support | Fall16845711am14:14:48UTC an einen Spezialisten eskaliert; Antwort „in den kommenden Tagen“ angekündigt, keine Reparatur bestätigt |

Die fachliche Autorisierung für die unveränderte Transaktion bleibt gültig. Der native Schreibweg scheitert im Bestätigungstransport; sein genauer interner Fehlerort ist unbekannt. Der reguläre Cloud-API-Weg hat keine erforderlichen Änderungsrechte. Für die Übernahme wird ein funktionierender Connector oder ein tatsächlich passend berechtigter Supabase-Transport benötigt. Ein Mac-Wechsel ist keine belegte Reparatur. Quellen-/Faktenprüfung und lokale Entwicklung können unabhängig fortgesetzt werden. Keine Rollen-/Grantänderung und kein blinder Retry. Nachkontrollen belegen keine beobachtete Commit-Wirkung zwischen den Aufnahmen, nicht die Abwesenheit vorübergehender oder zurückgerollter Aktivität.

## Sicherung und Serverordner

Die neuen Belege sind in [diesem privaten Eigentümerordner](https://drive.google.com/drive/folders/1bSTQdVchSMJSOWIwhDCfEil_om4iL_2E) gesichert: vier verschlüsselte Teile, **174 Dateien**, 7.111.309 unverschlüsselte Dateibytes und 3.110.032 Ciphertext-Bytes. Jede Serverkopie wurde frisch zurückgelesen und bytegleich geprüft; ein eigener Python-Verifier entschlüsselte RSA-OAEP/AES-GCM/gzip und prüfte alle 174 Dateien gegen Größe und SHA256. Zugriff, Elternordner und Ciphertext-Größen wurden nativ geprüft: ausschließlich ein User-Eigentümer, kein festes Drive-Ablaufdatum. Schlüsselwerte sind weder in Git noch in den Belegpaketen enthalten; die private Schlüsselablage bleibt separat.

[Serverindex `blocker2-originalquellen-current500-server-index-20261009.json`](https://drive.google.com/file/d/1H4swEexvhLBj1a3yRrXAj2_STx2crGn5/view): 52.054 Bytes, SHA256 `492ad3be0cea8b6b69383b0fb9d521e71afcd65fcf8cbc4077ce9c2341c92e74`, frisch serverseitig bytegleich zurückgelesen, owner-only. Er enthält die vier Datei-IDs, Größen, Hashes, authentisierten Transportkontexte, vollständigen relativen Dateimanifeste und Wiederherstellungsanweisungen. Er verweist auf den vorherigen aktuellen Capture-Index `14NSnqUdVHUJa6yCmmzGhr68GDryrgtvs` mit den 28 nativen ZIPs der unveränderten tatsächlichen 500er-Aufnahme. Historische Gesamtaufnahmen werden nicht als aktuelle übernommen. Drive bleibt vom Eigentümerkonto und der Dienstverfügbarkeit abhängig.

Eine abschließende Dokumentations-/CI-/Runtime-Quittung kann separat im gleichen Ordner gesichert werden; die vier Quellenbelegteile werden dafür nicht verändert.

## 52er-Nachkontrolle

| Feld | Wert |
| --- | --- |
| Status | `PASS_CURRENT500_STILL_CURRENT_AFTER_SOURCE_RECOVERY` |
| Capture-Run | `37923233626` |
| Beobachtet (UTC) | `2026-10-09T12:45:29.60489Z` |
| Ein Snapshot | `524930:524930:` |
| Baseline (UTC) | `2026-10-09T12:25:54.631872Z` |
| Schreibvorgänge der Quellenwiederherstellung | 0 |
| Bezahlte Helmut-Modellaufrufe der Wiederherstellung | 0 |

Die vollständigen Zeilen samt xmin aller 52 geschützten Tabellen sind seit dem Capture unverändert. Die aktuelle 500er-Komponente ist damit weiterhin aktuell; die acht Wiederherstellungen haben keine Eingabe- oder Bestandsänderung erzeugt. Der Vergleich umfasst vollständige Tabellenfingerprints einschließlich xmin in je einer Repeatable-Read-/Read-Only-Transaktion (vier Abschnitte mit je 13 Relationen); kein Ziel wurde ausgenommen. SHA256 aggregiert sortierte MD5-Zeilenfingerprints. Das ist eine Hashprüfung mit theoretischer Kollisionsgrenze.

## Archivbindung

Die archivierte Vorversion dieses Cockpits ist [docs/archive/project_state/2026_10_09_CURRENT_STATE_vor_originalquellen_pruefung.md](../archive/project_state/2026_10_09_CURRENT_STATE_vor_originalquellen_pruefung.md) mit SHA256 `07a01251d3b845df21bc2a3f19a7457299cea9ffbb89b9d5afacdc0e666e0465`. Das Archiv wurde bereits durch Root geschrieben und wird von diesem Dokument nicht verändert.

## Ausgeführte Integrationsprüfungen

Die unabhängige Python-Ausführung bestand für alle 500 tatsächlichen Antworten und die Originaltext-Komponente. Root prüfte zusätzlich alle 127 unveränderlichen Dateien der drei Quellenpakete, die aktuellen KO59-/Source19-Bindungen und die mathematisch konsistenten Zählungen. Der frische native Vollvergleich aller 52 geschützten Tabellen bestand. Eine vollständige positive fachliche Endabnahme wurde dabei nicht erteilt.
