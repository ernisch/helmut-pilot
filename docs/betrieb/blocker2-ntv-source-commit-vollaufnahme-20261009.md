# Blocker 2 — n-tv-Quelle committed, neue Vollaufnahme

**Stand: 09.10.2026 (UTC).** Rein technische, quellengebundene
Belegdokumentation. Kein fachlicher oder Production-Abnahmeschluss: Blocker 2
bleibt **offen**, Fachabnahme **0/500**. Dieses Dossier ersetzt keine
Aktivierungs- oder Testfreigabe.

## 1 · Problem

Die vorige Vollaufnahme band eine tatsächliche Capture, aber die n-tv-Einzelquelle
war nur vorbereitet und der Source-Write gesperrt. Offen waren: der tatsächliche
Operator-Schreibvorgang auf genau eine Quellenzeile, ein eigener aktueller
500er-Capture auf dem neuen Code-Stand sowie die Trennung technischer
Vollständigkeit von fachlicher Bedeutung. Zusätzlich war eine bereits
freigegebene Tarifkorrektur transportblockiert.

## 2 · Tatsächliche Schreibvorgänge

- Genau eine Quellenzeile der n-tv-Einzelquelle wurde geschrieben und committed
  (`PASS_COMMITTED_EXACT_ONE_SOURCE_UPDATE`); betroffen `published_at`, `raw`,
  `summary`, `updates=1`, `deletes=0`.
- Gebundene SQL-Prüfsumme `b4c0aab4f48cf171d5ab7a608076269d02b47706f014fde0acf5b4fca86b90b8`.
  `xmin` vorher `203340`, tatsächliche Postimage-`xmin` `521168`,
  Postimage-Vollzeilen-Hash
  `1b1382e73121119278a74d573e17bca13c293f2d522257660c855945753817ed`.
- Nach Zielbeobachtung `2026-10-09T08:54:35.921398+00:00` und
  Voll52-Beobachtung `2026-10-09T08:54:51.282105+00:00` unverändert: alle 25
  KO-Zeilen und 25 Link-Zeilen samt `xmin`, die Peer-Quellenzeile, alle übrigen Vollzeilen der 52
  geschützten Tabellen samt `xmin`, die 500 inaktiven Profilzeilen sowie
  Reserven/Budgets/Modelltabellen.
- Damit ist die **einzige Production-Änderung** dieses Vorgangs genau diese eine
  n-tv-Zeile. Keine Profil-, Reserven- oder Modelländerung.

## 3 · Vollständige aktuelle 500er-Aufnahme

- Eigener aktueller Lauf [Run37908512903](https://github.com/ernisch/helmut-pilot/actions/runs/37908512903),
  Workflow `6a4092e4`, Runtime `81a70cbe`, Deployment
  `dpl_AnfQEy7AGrd2jy6VDDg6fUc4v4gF`, Berlin-Tag 09.10.
- **500 authentisierte, inaktive synthetische Profile** in 330 Bundestag /
  120 Berlin / 50 Brandenburg; Sammelstatus `PASS`.
- Transport-/Schema-Bilanz (kein Fachurteil): erfasst 500, leer 0, technisch 0, unbrauchbar 0, widersprüchlich 0,
  nicht erfasst 0; 28 authentisierte Manifeste und 28 native Original-ZIPs.
- Einheitliche Bindungen: gemeinsamer 500-KO-Hash
  `30712faff83b20ee80169761889c2402c665b7cf7e0699296aa5e74ba39f86e7`,
  gemeinsamer Source-Map-Hash
  `fde4d1e6b0e0c50194b851f1892365825a898536d597c6a1106b70b8e94d051f`;
  500 eindeutige KOs, 875 eindeutige Quellen, 398 eindeutige sichtbare KO-IDs,
  20.525 sichtbare Elemente, 91 sichtbar gruppierte Ereignisse und 91 zusätzlich
  bewahrte Gruppenmitglieder.
- Die neue n-tv-Version liegt in allen 500 Eingaben; Vollzeilen samt `xmin` aller 52 Tabellen
  unverändert; beide Production-Identitäten identisch. Der Lauf selbst schrieb
  keine Production-Daten (`ProductionDataWrites=0`).

## 4 · Technisch bestanden, fachlich 0/500

- Unabhängige Prüfung bestanden: Python cryptography RSA-OAEP-SHA256/AESGCM/gzip,
  eigener JSON-Kanonikator, originale ZIP-Bytes ohne JS-Transporthelfer;
  Verifier-Prüfsumme
  `42305c3e5b0304738a2ec86fa36969dd4b130a70d6b2ffe4a4d4deb614332cb4`.
  Verifier: 0 Production-Anfragen, 0 Modellaufrufe, 0 gelesene historische
  Originaleingaben.
- Das belegt **technische Verwahrung und exakte Eingangsintegration** und
  ausdrücklich **keine semantische Abnahme**. Fachabnahme bleibt 0/500; alle 500
  brauchen weiter vollständige positive Bedeutungsevidenz
  (`semanticAccepted0All500StillNeedFullPositiveEvidence`).
- Fachliche Einzelbilanz der aktuellen 500 Eingaben: 500 ohne vollständigen positiven
  Einzelnachweis; 499 Profile mit mindestens einem sichtbaren KO ohne vollständigen
  Originalbeleg; 399 mit bereits belegtem sichtbarem Tarif-/Publikationswiderspruch.
  Kategorien überschneiden sich. Fehlende/leer/doppelt/technisch fehlerhafte
  Eingabeantworten jeweils 0; das ersetzt kein positives Fachurteil.
  Privater positions-/eingabehashgebundener Nachweis:
  `all500-semantic-acceptance-ledger-private.json`.
- Keine Vermischung mit historischen Gesamtaufnahmen; der Lauf gilt
  `PASS-technical-custody-only`, fachliche Gesamtabnahme bleibt offen.

## 5 · Tarifkorrektur: Fehler und Beweis

- Die bereits freigegebene Tarifkorrektur (SQL-Prüfsumme
  `041378b6fecd58b41639bd072b23fb6fd36aa0fb5d9fd005102b3e5a01b14e5a`) wurde
  genau einmal nativ eingereicht und scheiterte mit
  `McpServerError: Invalid or expired requestState`.
- Einordnung: Das ist der **Ausführungs-/Transportzustand der Autorisierung**
  (abgelaufene RequestState), **kein SQL-Constraint-Fehler** und **kein
  nachgewiesener automatischer Review-Ablehnungsgrund**. Der alte RequestState
  wurde nicht übergeben oder wiederverwendet; alternative Credentials/Rollen/Privilegien wurden nicht
  genutzt.
- Tatsächlich committed: `updates=0`, `deletions=0`. Nach Zielbeobachtung
  `2026-10-09T09:43:12.44636+00:00` und Voll52-Beobachtung
  `2026-10-09T09:43:46.659529+00:00` waren die KO-Vollzeile samt `xmin`, beide
  Quellen-Vollzeilen samt `xmin`, beide exakten Kanten sowie alle Vollzeilen der 52 Tabellen
  ohne Ausschluss unverändert — identisch zum aktuellen geschlossenen 500er
  Stand. Profil-/Reserven-/Budget-/Modelltabellen unverändert. Kein automatischer
  Rückweg, kein automatischer Retry.
- Status: bleibt autorisiert, aber **transportblockiert**; kein Blind-Retry.

## 6 · Nächste neue Aktion (vorbereitet, nicht autorisiert/ausgeführt)

- Tankrabatt-Einzelquelle: Vorwärts-Prüfsumme
  `7a6251e258e466a54024631549706edb2562535443d8a1425ea544f17b976339`;
  `xmin` vorher `317756`; Vollzeile vorher
  `a14a5cb6b0952b682346a60ecbb276a2f2749bc944487f56b9000d139e26290e`, nachher
  `10ce2a4da09298f8375e254e51318a2084899cefde2ada99cfbdbb66f6fb859e`.
- Volle Wirkung: Publikation `2026-04-22T07:00:00+00:00` →
  `2026-04-22T09:01:01+00:00`; Felder `published_at`/`summary`/`raw`,
  `summaryChars=190`, `updates=1`, gelöschte Zeilen 0; 1 KO und 1 Link bleiben
  erhalten; 132 sichtbare Profile wären betroffen; die Quelle liegt in allen 500
  globalen Eingaben.
- Vorabprüfungen: nativer Source22-Codec bestanden, 12 isolierte Fälle bestanden,
  unabhängige Flash-Originalmetadaten-Prüfung bestanden, unabhängige
  Pro-Sicherheitsprüfung bestanden. **Nicht autorisiert, nicht ausgeführt**; der
  Rückweg ist ungebunden und niemals automatisch.

## 7 · Risiko und Grenzen

- Offen bleiben: fachliche/semantische Vollabnahme 0/500,
  vollständige positive Bedeutungsevidenz und die Tarif-Transportblockade.
- Drive: 28 Chiffre-Uploads sind in einem privaten Betreiber-Ordner abgeschlossen
  (nur verschlüsselt, kein Klartext-Upload). Alle 28 Archive wurden anschließend frisch aus Drive serverseitig zurückgelesen:
  473.505.552 Bytes, alle Original-SHA256/Größen exakt und jede Datei ausschließlich
  Eigentümerzugriff. Nachweis `Drive-fresh-restoration-byte-proof-private.json`;
  Schlüssel separat im privaten Übergabeordner. Keine Originale vom Betreiber-Endgerät nötig.
- C-Löschung bleibt gesperrt; Übergabebranch-Merge bleibt gesperrt; 0 neue
  bezahlte Production-Modellaufrufe; die 500 Profile bleiben inaktiv; keine
  Aktivierung und kein bezahlter 500er Test.
- Freigabegrenze: keine Policy-, Code-, Schema- oder Umgebungsänderung in
  diesem Doku-Schritt, keine Production-Aktion. Eigentümer bleibt der Operator;
  dieses Dokument ist reine Belegablage. Blocker 2 bleibt **nicht abgeschlossen**.

## Quellen

- Auditkontext `documentation-source-capture-closure-context.json`,
  SHA256 `cdb6e611df2c2aa862cc674b334cf54a59c0b13bf0c9a7e4b6c6f5d698e4d247`.
- Aktuelle Vollaufnahme
  [Run37908512903](https://github.com/ernisch/helmut-pilot/actions/runs/37908512903).
