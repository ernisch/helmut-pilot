# Blocker 2 — Vorbereitung Einzelquelle n-tv (09.10.2026)

Die Datenkorrektur ist vorbereitet und nicht ausgeführt. Dieser PR stellt nur
die geprüfte Code-Kompatibilität für ihre feste neue Quellenversion bereit.
Kein Production-Datenwrite, keine neue Aufnahme oder Fachabnahme.

## Gegenstand
- Quelle `rd-e116a8d2e36564a8169d128853c3d2fcc3f2b5b45e4573a406db10058807e78d`,
  gebunden an die tatsächliche alte500-Capture [Run37873722112](https://github.com/ernisch/helmut-pilot/actions/runs/37873722112) @`a7aa1fc2` (330BT/120BE/50BB, inaktiv).
- Vorher: `published_at` `2026-07-08T07:00:00+00:00`, `summary` null.
- Nachher: `published_at` `2026-07-08T19:41:40+00:00`, `summary` = exakt200 Zeichen
  Original-OG-Beschreibung (<=240); `raw` alte Schlüssel erhalten plus
  `helmutQuellenkontext` (Herkunft `artikel-metadaten`, Methode `og:description`,
  Auszug-Hash `903d099b...`, `sourceCaptureRun`37873722112, originalBodySHA256`43e25628...`).
- Zeitbeleg: JSON-LD `NewsArticle.datePublished` `2026-07-08T21:41:40+02:00`,
  Sekundengenauigkeit, `precision:instant`, `notEventTime:true`; separates
  `dateModified` `2026-07-08T21:49:26+02:00` — kein Ereigniszeitpunkt-Claim.

## Vorbereitete Wirkung
- Genau1 `UPDATE` auf3 Felder;0 Löschungen,0 KO-/Link-/Profil-/Reservierungs-/Budgetänderungen.
- Vorwärts-SQL-SHA256
  `b4c0aab4f48cf171d5ab7a608076269d02b47706f014fde0acf5b4fca86b90b8`; Zeilen-Hash vorher `202aef56...`, nachher
  `1b1382e7...`; Source-xmin vorher203340. Nicht autorisiert, nicht ausgeführt.
- Erhalten:24 Source-Links,25 Guard-Links,25 native KOs,Peer-Quellen unverändert.
- Code-Kompatibilität in diesem PR: feste alte+neue Source-19-Allowlist für
  dasselbe n-tv-Mitglied, Peer-Bindungen unverändert, keine beliebige
  Hash-/Versionsannahme, kein frisches Textlesen zur Laufzeit.
  Source19-Projektionshash vorher`e040157a...`, nachher`97e4f458...`;
  diese Quellenhashes sind keine Deployment-Commits.
- Kein SQL im PR; keine privaten500-Profile, Preimages oder Artikeltexte im Repo.

## Prüfstand (alles Vorbereitung)
- Lokal gepinnt PG17.6:13 SQL-Fälle PASS, kein Netz; tatsächlicher nativer
  Source22-Codec nur lesend (RO).
- Unabhängige Pro-High-Endprüfung: PASS, nur Vorbereitung,0 kritische Befunde.
- Alle500 Offline-Replays PASS: alte Version für500 unverändert,91 Gruppen und
  KO-IDs erhalten; die vorgeschlagene Version ändert500 Eingabe-Hashes und
  112 sichtbare Kartenprofile,10 unbekannte Versionen werden abgelehnt.
  Keine tatsächliche Aufnahme, keine semantische Abnahme.
- Stand:0/500 angenommen;0 Production-Writes;0 bezahlte Helmut-Modelle.

## Risiko, Rückweg, nächster Schritt
- Die neue Quellenversion ändert Eingabe-Hashes. Die tatsächliche frische500-
  Fachprüfung bleibt nötig. Konkurrierende Änderungen außerhalb der drei
  gesperrten Tabellen sind möglich: unerwarteter Nachbefund führt zum Stopp.
  Kein automatischer Rückweg.
- Rückgabe-Template `20775c2d...` ist fail-closed mit Platzhalter für den
  tatsächlichen Post-Write-xmin; alte Ziel-xmin ist nicht wiederherstellbar.
  Ausführung erfordert separates Betreiber-GO.
- Alle52 Tabellen vor und nach Ausführung über vollständige Zeilen plus xmin
  prüfen; nur die eine Zielquelle ausnehmen und separat vollständig prüfen.
  Katalog, alle gebundenen Zielzustände und geschlossene Runtime frisch prüfen. Nach einem etwaigen Write nötig: neue echte
  500-Eingabe-Capture und unabhängige positive500-Semantik.
- Freigegebene Tarifkorrektur (372Profile) weiterhin nicht angewendet; der frische
  native Versuch blieb `Invalid/expiredrequestState`, reguläre API42501
  Readonly-Role,52 Tabellen bei der letzten Nachkontrolle unverändert. Das ist ein technischer Fehler,
  kein Nachweis einer Policy-Ablehnung.
- Budget unverändert; keine bezahlten Production-Calls. DeepSeek ist nur
  autorisierte Entwicklungsprüfung, keine Production-Instanz.
