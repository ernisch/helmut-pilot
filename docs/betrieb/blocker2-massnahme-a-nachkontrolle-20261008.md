# Blocker 2: Maßnahme A angewendet und vollständig nachkontrolliert

Stand: 08.10.2026, Europe/Istanbul (UTC+3). **A erfolgreich; Blocker2 weiterhin offen, fachliche Abnahme 0/500.** Nur die konkret freigegebenen vier INSERTs wurden ausgeführt. B bleibt unfreigegeben, C gesperrt. Kein neuer Eingabelauf oder Funktionstest.

## Ausführung und Schutzbedingungen

- Exakter freigegebener Transaktions-SHA256: `c3c1b8075ff5adf9ff43b6b05df980e1a8ff146b007d6abcc88706a6c83ce1cd`; unverändert ausgeführt, keine angehängte oder ersetzte SQL-Aktion.
- Production READY: `05cc738df6e8b8856e84540fc7c5fef8c0f08fb7`, Deployment `dpl_8EKpz8KrQXQTDnXR21nBrGyQbH38`. Main enthält nur den späteren Dokumentationsmerge `1b8236af`; Anwendungscode unverändert.
- Frische Vollstandskontrolle aller 52 Tabellen um 10:13:41 Istanbul (07:13:41 UTC): sämtliche vorherigen Zeilenwerte und xmin identisch mit dem gebundenen Ausgangsstand.
- Frische Quellen-/Schema-/Trigger-/Abwesenheitskontrolle um 10:15:42: beide vollständigen Quellenzeilen, Hashes und xmin exakt; 64 Spalteninformationen, vier Constraints, Triggerdefinition und Triggerfunktionskörper unverändert. Keine Ziel-KOs, Vorgänge, Quellenkanten, Reservierungen oder Ziel-Warteschlangenreferenzen. Keine deaktivierten Usertrigger oder zusätzlichen Rewrite-Regeln.
- Berliner Tag unverändert 08.10.; Brandenburg-Sitzung weiterhin angekündigt für 13:00 Berlin (14:00 Istanbul), nicht als durchgeführt oder beschlossen dargestellt.
- Eine SERIALIZABLE-Transaktion, exakt zwei KO- und zwei Kanten-INSERTs; vollständige interne Altzeilen-/Nachherhash-Prüfungen vor COMMIT. Kein Teilcommit, UPSERT, bestehendes UPDATE oder automatischer Rückweg.

## Vier vollständige Nachherzeilen

Unmittelbar um 10:18:10 Istanbul (07:18:10 UTC) wurden alle vier vollständigen Zeilen zurückgelesen. Jede Zeile stimmt mit ihrem vorbereiteten nativen Nachherhash überein; alle vier tragen **xmin 496218**.

| Tabelle / Schlüssel | Vollständiger nativer SHA256 |
| --- | --- |
| `public.knowledge_objects`: `ko-vg-b2-infrastruktur-neb-20261008-17` | `bd0a167d6dd3c992bb2ef1634443cc950f8e7204135ada93dd8fb06060960d77` |
| `public.knowledge_objects`: `ko-vg-sorgeberechtigte-20261003-b35a5a` | `a7c1d7465e7a96d243417bfca3a98f3bddc2664420c3ad7e154523e7950488ce` |
| `public.ko_document_links`: `ko-vg-b2-infrastruktur-neb-20261008-17` → `rd-5fe9253cea9bfbe2ab29221ee9a713eb235fe2547f532a2874494c8edd44126b` | `49876bf150582ee8c962c95860b300dfca875161918f9f46d3d158102198911c` |
| `public.ko_document_links`: `ko-vg-sorgeberechtigte-20261003-b35a5a` → `rd-65e95b8ffad2e60d3794ce6a3d9bdac81479e7e1bf30a45b4687b33d4e3d49ad` | `5b9e295b2c46553a4ec975d7f6322e1aae2aa3994b3d20462604a3930d9562de` |

Die beiden tatsächlichen Vorgänge sind `vg-sorgeberechtigte-20261003-b35a5a` und der getrennte Sitzungsvorgang `vg-b2-infrastruktur-neb-20261008-17`. Kein Zusammenführen mit einem anderen Kalenderereignis. Beide Rohquellen blieben mit dem bisherigen vollständigen Zeilenhash und xmin 475965 unverändert.

## Vollständige Nachkontrolle der 52 Tabellen

Um 10:18:28 wurden alle 52 Relationen vollständig zurückgelesen und gehasht. Nur `knowledge_objects` und `ko_document_links` unterscheiden sich, jeweils mit exakt zwei zusätzlichen Zeilen. Um 10:20:17 wurde zusätzlich der vollständige Altzeilenbestand nach Ausschluss ausschließlich der vier genau bezeichneten neuen Datensätze gelesen: **alle 52 vorher bestehenden Zeilenbestände samt xmin identisch**.

Keine bestehenden KO-/Quellen-/Profilzeilen verändert, keine Profilaktivierung, keine Reservierungs- oder Kontrolltabellenänderung, keine zusätzlichen DIP-Korrekturen, keine kostenpflichtigen Helmut-Production-Modellaufrufe. B und C wurden nicht ausgeführt.

## Tatsächlicher Fortschritt für alle 500 Profile

Die [neue Einzelbilanz](blocker2-500-bindungsfortschritt-nach-a-20261008.csv) prüft sämtliche 500 unveränderten Profil-/Themenbindungen gegen die tatsächlich eingefügten nativen KO-/Quellenzeilen. Sie überschreibt keinen früheren Originalbody und enthält keine behauptete neue tatsächliche Briefingeingabe.

| Gespeicherte notwendige Bindung durch A ergänzt | Profile |
| --- | ---: |
| Berlin, Bildung | 30 |
| Brandenburg, Verkehr | 12 |
| Insgesamt konkret näher an der Abnahme | **42** |
| Kein zusätzlicher notwendiger Bindungsfortschritt aus A konkret belegt | 458 |
| Vollständig fachlich angenommen | **0** |

Für diese 42 Profile ist die vorher fehlende notwendige KO-/Originalquellenbindung jetzt tatsächlich im Bestand vorhanden. Eine tatsächliche Übernahme in die aktuelle Briefingeingabe, Auswahl/Rang/Frische und die übrigen fachlichen Kriterien sind damit nicht bewiesen. Die 458 übrigen Profile wurden ebenfalls einzeln geprüft; aus A folgt für sie kein belegter zusätzlicher notwendiger Eingabefortschritt. Das ist keine Behauptung, dass sie die neuen KOs technisch niemals sehen können.

Die ursprüngliche aktuelle Aufnahme auf `000e313b` bleibt unverändert: 343 Inputs mit Zeit-/Quellen-/Ebenenbefund, 34 ausschließlich doppelt, 123 mit fehlendem positiven Nachweis. Diese historischen Kategorien werden nicht durch synthetisches Einfügen der neuen KOs oder die Präsentationskorrektur PR858 neu gezählt. Es gibt **0 neu erfasste tatsächliche Briefingeingaben nach A**, keine Teilannahme und keine neue vollständige 500er Aufnahme.

## Nächster kleinster notwendiger Nachweisschritt

Ein neuer **einmaliger vollständiger 500er Nurleselauf** mit dem bereits technisch bewiesenen Workflow ist vorbereitet, nicht gestartet. Zweck: tatsächliche Quellen-/KO-/Resolver-/Profilbindung und Briefingeingabe nach A und PR858 feststellen, statt aus gespeicherten KOs ihre Verwendung abzuleiten. Kein Codeumbau, keine neue Quelle, kein Modellaufruf und keine Datenaktion nötig.

- Ausschließlich `briefing-nachweis?modus=eingabe`; exakt die bisherigen 500 inaktiven synthetischen Profile (330 BT, 120 BE, 50 BB).
- Gebundener tatsächlicher Production Commit `05cc738df6e8b8856e84540fc7c5fef8c0f08fb7`, geplanter Berliner Tag 08.10.2026; maximal 500 Eingabe-GETs, zwei Identitätsprüfungen und 55 Minuten Aufnahme. Setup und mögliche Cipher-Rettung haben den bestehenden 75-Minuten-Jobtimeout; keine Verlängerung der 55-Minuten-Erfassung.
- Derselbe Commit und Berliner Tag während der gesamten Aufnahme; vor/nachher vollständiger 52-Tabellenvergleich gegen den frischen Zustand **mit A**, die vier neuen Zeilen samt Hash/xmin zusätzlich gebunden.
- Vorhandenes Cronsecret ausschließlich im GitHub-Workflow; gleicher fest gebundener Verschlüsselungsempfänger; bewiesene laufende verschlüsselte Zwischenstände mit Uploadquittungen vor weiteren GETs.
- Bei Commit-/Tagesdrift, Auth-/Profil-/Schreib-/Modell-/Transportwiderspruch sofort stoppen und vorhandene Originale sichern. Keine automatische Wiederholung, kein Profil-/Datenwrite, keine Modellaufrufe oder Funktionstests.
- Danach alle 500 Originale vollständig authentifizieren und einzeln fachlich prüfen; sämtliche Kategorien einschließlich leer, doppelt, widersprüchlich und nach Stop nicht erfasst getrennt ausweisen. Keine Vermischung mit früheren Inputs und keine automatische Annahme.

**Dafür ist eine neue konkrete Nurleselauf-Freigabe erforderlich.** Bei anderem Tag, Commit oder Datenstand zuerst frisch prüfen und konkret neu binden. Die Freigabe für A autorisiert diesen Lauf nicht.

B bleibt eine getrennte Datenfreigabegrenze. Der bisherige Fünf-Korrekturen-SQLhash `d2c267f8…` enthält den alten Vollstand vor A und würde jetzt stoppen: nicht ausführen, nicht stillschweigend umschreiben. Vor einer späteren B-Ausführungsfreigabe neuen konkreten Vollstand und Transaktionshash vorbereiten und unabhängig prüfen. C bleibt unverändert gesperrt; keine Löschung abgeschlossener KO-Identitäten.

## Belege

Private Originale, vollständige Zeilen und SQL-Toolantworten bleiben unter `/workspace/private/blocker2-20261007/`, außerhalb von Git.

| Beleg | SHA256 |
| --- | --- |
| `A-approved-20261008-completion-and-guards.json` | `35955d814b3b167fea779830f4452032354b5016a4b21efec5a299b636bd8d55` |
| `A-approved-20261008-immediate-full-four-row-readback.json` | `8a6414a74d16ea36574bd797dc1244c29a0dff92bb7870dffbc33e20e9ef2d12` |
| `A-approved-20261008-postcommit-full52.json` | `4b9676953b602fdef1edd6e1e743f03757d434ce999b98cc73371cf77e7c3627` |
| `A-approved-20261008-postcommit-old52-excluding-only-four-new.json` | `4a337a0f158f8d3cf4b5774afd32d4033e650185666a82b9b8cec9b1c18d38f7` |
| `A-approved-20261008-all500-individual-binding-progress.json` | `29b268848304cb6c22d8cdac7d9b729e3e4b62735430479fbb9bef7a2c4ef958` |
| `A-approved-20261008-next500-readonly-proposal-NOT-APPROVED.json` | `8867ad7f2ab59b20721a636ae3338e6a21d114923d85a5f68fe0401d14497451` |

500er Fortschritts-CSV SHA256: `2fac905ae043c3b6339c6be4ce25aa35f9998a28c121b5d1bdc8e4b0d1bea802`.
