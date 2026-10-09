# Blocker 2 — Tankrabatt-Einzelquelle committed, neue Vollaufnahme fachlich offen

**Stand: 09.10.2026 (UTC).** Rein technische, quellengebundene
Belegdokumentation. Kein fachlicher oder Production-Abnahmeschluss: Blocker 2
bleibt **offen**, Fachabnahme **0/500**. Dieses Dossier ersetzt keine
Aktivierungs- oder Testfreigabe und enthält keine Geheimnisse, keine
personenbezogenen Rohdaten, keine Schlüsselwerte und keine privaten
Vollantworten.

## 1 · Gegenstand

Die Tankrabatt-Einzelquelle wurde mit einem ausdrücklichen Operator-GO genau
einmal auf genau einer Quellenzeile geschrieben: `updates=1`, `deletes=0`,
geänderte Felder `published_at`, `summary`, `raw`. Alles Weitere blieb außerhalb
des Ziels unverändert. Das frühere n-tv-Dossier dient hier nur als historische
Orientierung und wird nicht fortgeschrieben; dieses Dokument beschreibt
ausschließlich den Tankrabatt-Vorgang.

## 2 · Autorisierung (Operator)

- `operator-authorization.json`: `operatorContinuationText="go"`, Bindung
  `tankrabatt-exact-one-source-action-binding`, Projekt `ddckuvvpcytqbyfmbvie`,
  erfasst `2026-10-09T11:17:44.672285+00:00`.
- Autorisierte SQL-Prüfsumme:
  `7a6251e258e466a54024631549706edb2562535443d8a1425ea544f17b976339`.
- Umfang: `updates=1`, `deletes=0`, drei Felder; `profileWrites=0`,
  `budgetWrites=0`, `paidHelmutModels=0`.
- Gebundene Vorwärtsdatei:
  `/workspace/blocker2-readonly-20261009/separate44/Tankrabatt-single-source-forward-NOT-AUTHORIZED.sql`
  (Dateiname historisch; autorisiert ist genau deren Inhalt).
- `mustFreshlyVerifySingleSnapshotBeforeWrite=true`,
  `noExpiredRequestState=true`, `automaticRetry=false`, `automaticReturn=false`,
  `activationAuthorized=false`, `functionTestAuthorized=false`,
  `tarifTransportPathUntouched=true`.

## 3 · Tatsächlich committede Wirkung

Belegquelle: `exact-source-commit-full52-proof.json`,
`status=PASS_COMMITTED_EXACT_ONE_SOURCE_UPDATE`.

- Quelle:
  `rd-cf883574cde37a660024a295a6f42c89521bf1ca73272b22f0e1dc6b2421e454`.
- `xmin` vorher `317756` → nachher `523524`.
- Vollzeilen-Hash vorher `a14a5cb6b0952b682346a60ecbb276a2f2749bc944487f56b9000d139e26290e`
  (Autorisierung) → Postimage-Hash
  `10ce2a4da09298f8375e254e51318a2084899cefde2ada99cfbdbb66f6fb859e`
  (Beleg, identisch mit `expectedAfterWholeRowSHA256`).
- `published_at`: `2026-04-22T07:00:00+00:00` → `2026-04-22T09:01:01+00:00`.
  Der neue Wert stammt aus dem JSON-LD der Quelle (`11:01:01+02`). Die Quelle
  nennt keinen exakten Ausschusstermin, nur „Mittwochmorgen“.
- `summary`: vorher `NULL` → nachher 190 Zeichen (Inhalt hier bewusst nicht
  abgelegt).
- `raw`: bisherige Rohmetadaten bewahrt und gebundenen Quellenkontext ergänzt.
- Original-HTML-SHA256:
  `2fab377a7a55d5d5c44c7e5a040b98ba3a186eef98c170d483ceae5393551883`.
- 19 weitere Source-Felder unverändert (`other19SourceFieldsUnchanged`).

## 4 · Umgebung der Zielzeile unverändert (52 Tabellen)

- Zwei getrennte Beobachtungen: Ziel `2026-10-09T11:20:00.752323+00:00`,
  Voll52 `2026-10-09T11:20:15.799225+00:00` in einer RR/RO-Transaktion, Snapshot-Kennung
  `523542:523542:`.
- `oneKOAndOneLinkEntireRowsAndXminUnchanged`,
  `all52OtherCompleteRowsAndXminUnchanged`, `sourceRowCountUnchanged`,
  `catalogUnchanged`, `profilesAll500InactiveUnchanged`,
  `reservationsBudgetModelsUnchanged` — alle `true`.
- `raw_documents` Zeilenzahl unverändert 31138; Nichtzielfilter 31137.
  `paidHelmutProductionModels=0`, `acceptedProfiles=0`, `automaticReturn=false`.
- Snapshotmethode **RR/RO**; vier Abschnitte mit je 13 Relationen in **einer**
  Transaktion; vollständige 52 Fingerprints; Statement-Grenze 15 s unverändert.

## 5 · Unabhängige Prüfung (Evidence-only)

`execution-independent-review.json` (`status=ok`, `route=deepseek-v4-pro`,
`effort=high`, `mode=read`) bestätigt: genau eine `raw_documents`-Zeile geändert,
nur `published_at`/`summary`/`raw`, `deletes=0`; KO- und Link-Zeilen hash- und
`xmin`-identisch; alle 51 übrigen Relations-Fingerprints passend; Zeilenzahl
31138 unverändert; Profile/Reserven/Budgets/Modelle unverändert.

Das ist **reines Evidence-Review ohne eigene DB-, Hash- oder SQL-Ausführung**.
Die Relations-Fingerprints beruhen auf MD5-Zeilendigests, aggregiert unter
SHA256 (theoretische Kollisionsgrenze). Technische und fachliche Nachkontrolle
verbleibt bei Sol; die Prüfung selbst hat keine Tests ausgeführt.

## 6 · Neue tatsächliche Vollaufnahme und Fachbilanz

[Run 37923233626](https://github.com/ernisch/helmut-pilot/actions/runs/37923233626)
ist `completed/success`, Versuch 1, Workflow
`e5a3a3e93cd24c8c81596aea6fee31ab586b3bbd`; Production blieb READY auf
`81a70cbe2ffec2499565b68649b97408d80ead69` /
`dpl_AnfQEy7AGrd2jy6VDDg6fUc4v4gF`. Alle 500 inaktiven synthetischen Profile
wurden tatsächlich neu erfasst: 330 Bundestag, 120 Berlin, 50 Brandenburg.
Keine Aktivierung, kein Funktionstest, keine Helmut-Modellaufrufe.

28 native Original-ZIPs, insgesamt **473.607.219 Bytes**, enthalten 500
Einzelbelege und 28 Manifeste. GitHub-Metadaten, ZIP-SHA256, authentisierte
Transportbindungen, vollständige HTTP-200-Bodies und alle Eingabehashes sind
geprüft. Eine zusätzliche Python-Prüfung mit eigener RSA-OAEP-/AESGCM-/gzip-
Entschlüsselung und eigener JSON-Kanonisierung bestand unabhängig vom
JS-Transporthelfer. Beide Production-Identitäten stimmen überein.

Der komplette Bestand aller 52 Tabellen blieb während der Aufnahme unverändert:
Vorbeobachtung `11:20:15.799225 UTC`, Nachbeobachtung `11:42:44.256385 UTC`,
jeweils ein gemeinsamer RR/RO-Snapshot über vollständige Zeilen samt `xmin`.
Hier wurde keine Zielzeile aus den 52 Volltabellen-Fingerprints ausgenommen.
500 Profile bleiben inaktiv, Prozesse 0 running; Katalog und Runtime sind
unverändert. Die eine Quellenkorrektur liegt **vor** der Aufnahme; die Aufnahme
selbst hat 0 Production-Datenschreibaufrufe und 0 bezahlte Helmut-Modellaufrufe.

Alle Eingaben enthalten denselben aktuellen globalen Stand von 500 KOs und
875 Quellen. KO-Hash `30712faff83b20ee80169761889c2402c665b7cf7e0699296aa5e74ba39f86e7`;
Quellenkarten-Hash `ee27bf9fcee8fd6bacdd19c6724ce56812ddf1471467aff70c8a45334d006d69`.
Gegenüber der letzten Aufnahme änderte sich genau ein Source19-Hash:
Tankrabatt `29bce4859e734acb42c415df47d48f7382e8923fda1c06976ee7f91f14bb7914`,
exakt die bisherige 19-Feld-Projektion mit dem jetzt nativen Publikationswert
und Summary. Er ist in **allen 500** tatsächlichen neuen Eingaben enthalten;
der zugehörige KO ist bei **132** Profilen sichtbar. Alle 500 vollständigen
Eingabehashes änderten sich; historische Gesamtaufnahmen werden nicht übernommen.

20.525 sichtbare Karten repräsentieren 398 KO-Versionen. 91 bewahrte
Ereignisgruppen mit 91 zusätzlich erhaltenen Mitgliedern sind keine doppelten
Profilantworten und belegen noch keine vollständige Ereignis-Fachabnahme.

| Kategorie | Profile |
| --- | ---: |
| Fachlich angenommen | **0/500** |
| Vollständiger positiver Einzelnachweis fehlt | 500 |
| Fehlende / leere / doppelte / technisch fehlerhafte Profilantwort | jeweils 0 |
| Mindestens ein sichtbarer KO ohne vollständigen Originalnachweis | 499 |
| Belegter sichtbarer Tarif-Widerspruch | 372 |

Die fachlichen Kategorien überschneiden sich. Die Publikationskorrektur beseitigt
den bisherigen Tankrabatt-Quellenzeitwiderspruch; damit sinkt die bekannte
Widerspruchskategorie von 399 auf 372. Sie beweist keinen genauen Ausschusstermin
und keine vollständige positive Fachabnahme eines Profils. Originalquellen,
KO/Fakten/Versionen, Zeitbindung, Zuständigkeit, Resolver/Ereignisidentität,
Profilrelevanz und das tatsächliche Eingabe-Fachurteil bleiben vollständig
nachzuweisen.

Die 26 bekannten negativen Originalnachweis-KO-Befunde werden ausschließlich
über identische KO59- und zugehörige Source19-Versionen an die neuen sichtbaren
Eingaben gebunden. Geänderte oder ungeprüfte Versionen erhalten kein positives
Urteil. Die genaue Fachbilanz hat zusätzlich einen unabhängigen Python-Nachzähler;
DeepSeek Pro High bestätigte die technische Bindung und die Auswertung der aktuellen
Versionen als Beleg-/Codeprüfung. Die vom Modell referenzierten historischen
Einzelbaselines und der native Quellen-Postimage-Beleg wurden beim Root-Abschluss
zusätzlich nachgerechnet bzw. gegen die gespeicherten Originalbelege geprüft.
Die positiven acht Fachkriterien bleiben offen.

Alle 28 Original-ZIPs wurden im privaten Eigentümerordner
`1tRVd99DA5wRqJ2Fw1iOrEii9TjoopNtM` gesichert, frisch zurückgeladen und
bytegleich zu den nativen GitHub-Digests geprüft. Ordner und Dateien haben
nach Metadaten ausschließlich Eigentümerzugriff; Drive hat kein festes
Ablaufdatum. Private Vollantworten und der separat verwahrte Schlüssel
bleiben außerhalb von Git. Der ergänzende verschlüsselte Belegsatz mit 60 Dateien (Vor-/Nachbilder,
Freigabebindung, Original-SQL, Prüfer und vollständige private Einzelbilanz) wurde
frisch aus Drive geladen, entschlüsselt und für jede Datei an Größe/SHA256 geprüft.
Cipher-SHA256 `28dd357b2fd17f2834994a3b17ca06246b7ea750005fae359d5b60d8cd6dd5b7`.
Der neue private [Serverindex](https://drive.google.com/file/d/14NSnqUdVHUJa6yCmmzGhr68GDryrgtvs/view)
hat 36.803 Bytes, SHA256
`103dd5defdcb48217909803f14566e8b254ebd8c10ae667b4d4a9b9189eecb37`;
frisch bytegleich und ausschließlich Eigentümerzugriff geprüft. Er enthält
alle 28 Artifact-/Drive-IDs, Original-ZIP-Hashes, Wiederherstellungsanleitung
und die getrennte Schlüsselablage-Referenz. Der alte Index bleibt für ursprüngliche
Quellenoriginale und historische Einzelbelege erhalten. Kein Schlüsselwert im
Index oder Bundle, keine Übertragung großer Dateien über das Betreiber-Endgerät.

## 7 · Freigabegrenzen

- Das GO deckt genau die SQL
  `7a6251e258e466a54024631549706edb2562535443d8a1425ea544f17b976339` ab:
  ein Update, drei Felder, null Löschungen.
- Unverändert bleiben die 19 übrigen Source-Felder, alle weiteren Vollzeilen
  samt `xmin`, KO- und Link-Vollzeilen, die 500 inaktiven Profilzeilen,
  Reserven, Budgets und Modelltabellen.
- Rückweg: **UNBOUND, nicht freigegeben, kein automatischer Rückweg.**
- Tarifkorrektur
  `041378b6fecd58b41639bd072b23fb6fd36aa0fb5d9fd005102b3e5a01b14e5a` bleibt
  transportblockiert; hier kein Retry.
- C-Löschung bleibt gesperrt.
- Aktivierung, bezahlte Helmut-Production-Aufrufe und der 500er-Test sind nicht
  freigegeben.
- Keine pauschale Gesamtfachabnahme. **Fachabnahme weiterhin 0/500.**

## Quellen

- `operator-authorization.json` (GO, SQL-Bindung, Feld-/xmin-/Hash-Bindung).
- `exact-source-commit-full52-proof.json` (committede Wirkung, 52 Tabellen).
- `execution-independent-review.json` (Evidence-only-Review).
- Lauf `37923233626` (`completed/success`), Workflow
  `e5a3a3e93cd24c8c81596aea6fee31ab586b3bbd`, Deployment
  `dpl_AnfQEy7AGrd2jy6VDDg6fUc4v4gF`.
- Historische Orientierung: früheres n-tv-Dossier, hier nicht fortgeschrieben.

Keine Policy-, Code-, Schema- oder Umgebungsänderung in diesem Doku-Schritt und
keine Production-Aktion. Eigentümer bleibt der Operator; Blocker 2 bleibt
**nicht abgeschlossen**.
