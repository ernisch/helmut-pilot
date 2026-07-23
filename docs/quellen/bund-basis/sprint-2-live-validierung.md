# Sprint 2 — Live-Validierung der ersten drei Pflichtquellen

**Stand:** 2026-07-23 · **main-HEAD:** `035898b` (+ Sprint-1-Commit `d969565` auf diesem Branch) ·
**Bearbeitete Quellen:** ausschließlich hib, Pressemitteilungen der Bundesregierung,
Pressemitteilungen des Bundesverfassungsgerichts (keine weiteren).

## Wichtiger Vorbehalt: keine echte Live-Verifikation möglich

Zwei unabhängige Versuche, die drei Feeds tatsächlich abzurufen, sind gescheitert:

1. **Direkter HTTPS-Abruf (curl über den Session-Proxy):** Der Proxy verweigert den
   CONNECT-Tunnel zu `www.bundestag.de:443` mit `403 Forbidden` — laut Proxy-Diagnose
   (`/root/.ccr/README.md`) eine **Egress-Policy-Entscheidung der Organisation**, die
   ausdrücklich nicht wiederholt oder umgangen werden soll, sondern zu melden ist.
2. **`WebFetch` (separater Pfad, umgeht den Session-Proxy):** Alle drei Domains
   (`bundestag.de`, `bundesregierung.de`, `bundesverfassungsgericht.de` — auch deren
   Startseiten) antworten mit `403 Forbidden` **vom Zielserver selbst** — Bot-Schutz.
   Das deckt sich exakt mit einem bereits im Repo dokumentierten Befund:
   `docs/quellenarchitektur/13-landesmodule-technische-pruefung-und-bundeswege.md`:
   „direkter Abruf deutscher Gov-/Medien-Domains 403-geblockt".

Auf Nachfrage wurde entschieden: **kein GitHub-Actions-Testlauf** (der frühere Sprints
mit demselben Blocker über einen Runner mit offenem Egress gelöst hatten, siehe
`sprint9b-verify.yml`), sondern **reine Deskrecherche**, ausdrücklich als **nicht live
getestet** gekennzeichnet. Die folgenden Einträge sind entsprechend mit `⚠` oder `❌`
bewertet, nie mit `✅` — für keine der drei Quellen liegt ein echter, heutiger
HTTP-Nachweis vor.

---

## 1) Heute im Bundestag (hib)

| Feld | Befund |
|---|---|
| Dokumentierte URL (Masterpaket) | `https://www.bundestag.de/static/appdata/includes/rss/hib.rss` |
| Live-Verifikation heute | Nicht möglich (siehe Vorbehalt oben) |
| Deskrecherche | Bundestag betreibt weiterhin eine offizielle RSS-Übersicht unter `bundestag.de/services/rss/feeds_allgemein-249014` bzw. `.../feeds_themen-249016`; Suchtreffer bestätigen dort u. a. eine Kategorie "Kurzmeldungen (hib)". Die exakte aktuelle Datei-URL ließ sich aus Suchergebnis-Snippets nicht extrahieren (dafür wäre ein echter Seitenabruf nötig). |
| Bereits vorhandene reale Testevidenz im Repo | `lib/helmut/quellenarchitektur/seeds/bundeswege-reparaturen.js:25-31` — am 2026-07-14 auf einem GitHub-Actions-Runner mit offenem Egress **real getestet**: `https://www.bundestag.de/static/appdata/includes/rss/pressemitteilungen.rss` → HTTP 200, valides `application/rss+xml`, 15 Items, jüngstes 3 Tage alt. Das ist **dasselbe Verzeichnis** wie die dokumentierte hib-URL — erhöht die Plausibilität, ist aber **kein Beweis** für die hib-Datei selbst (nie einzeln getestet). |
| Feedtyp (angenommen, nicht verifiziert) | RSS 2.0 |
| Aktualisierungsfrequenz (institutionell bekannt, nicht heute gemessen) | hib erscheint an Sitzungstagen des Bundestages mehrfach täglich |
| Format | Vermutlich Standard-RSS (`title`/`link`/`pubDate`/`description`/`guid`) — nicht verifiziert |
| Beispieleintrag | Nicht verfügbar — kein echter Abruf möglich |
| Bekannte Einschränkungen | Bot-Schutz auf `bundestag.de` (zweifach bestätigt); die alte Basis-URL `/rss` ist real defekt (`rp-bundestag`, Status `broken`); die spezifische `hib.rss`-Datei wurde nie unabhängig getestet |
| Existierender Parser/Fetcher | `lib/helmut/crawler.js:533` `parseRssItems()` — generischer, CDATA- und Atom/RSS-fähiger Parser, bereits produktiv für alle RSS-Retrieval-Paths im Einsatz (Label `rss-regex` in `catalog.js`). **Kein neuer Parser nötig.** |
| Existierender Retrieval Path | Nur schwache Proxies: `rp-bundestag` (RSS, `broken`, hib nur als Nebenlink) + `rp-general-hib` (Google-News-Suche) — siehe Sprint-1-Matrix, Zeile 2. Kein dedizierter hib-Weg. |
| **Verdikt** | **⚠ funktioniert vermutlich mit Einschränkungen** — hohe Plausibilität durch Verzeichnis-Präzedenz, aber nicht bestätigt. Keine ❌, weil nichts auf einen Defekt hindeutet; keine ✅, weil kein echter Test vorliegt. |
| **Nächster technischer Schritt** | Echten HTTP-Abruf von `https://www.bundestag.de/static/appdata/includes/rss/hib.rss` über einen Runner mit offenem Egress durchführen (z. B. Erweiterung des bestehenden `sprint9b-verify.yml`-Musters um genau diese eine URL), **bevor** ein Retrieval Path in der Architektur angelegt wird. |

---

## 2) Pressemitteilungen der Bundesregierung

| Feld | Befund |
|---|---|
| Dokumentierte URL (Masterpaket) | `https://www.bundesregierung.de/service/rss/breg-de/1151244/feed.xml` |
| Live-Verifikation heute | Nicht möglich (siehe Vorbehalt oben) |
| Deskrecherche | Die aktuelle offizielle RSS-Übersichtsseite ist `bundesregierung.de/breg-de/service/newsletter-und-abos/rss-newsfeed` (mehrfach unabhängig in Suchtreffern bestätigt). Die im Masterpaket genannte konkrete Datei-URL (Knoten-ID `1151244`) taucht in **keinem** Suchtreffer auf — ein Hinweis, dass sie durch einen CMS-Relaunch wahrscheinlich nicht mehr aktuell ist. |
| Bereits vorhandene reale Testevidenz im Repo | `bundeswege-reparaturen.js:32-38` — für dieselbe Institution wurde bereits **eine andere** direkte Feed-URL real getestet und als **„real 404"** befunden; als Ersatz wurde dort (in einem früheren Sprint) auf eine Google-News-Suche ausgewichen. Das ist ausdrücklich **nicht** das Ziel dieses Sprints (keine Google-News-Ersetzung) — es bestätigt aber, dass eine direkte Feed-URL-Vermutung bei dieser Institution bereits einmal falsch war. |
| Feedtyp/Format/Beispieleintrag | Nicht verifizierbar ohne echten Abruf |
| Bekannte Einschränkungen | Mehrfacher CMS-Relaunch bei `bundesregierung.de` macht Knoten-ID-URLs instabil (identisches Muster wie bei der bereits gescheiterten Vermutung); die tatsächliche aktuelle Feed-Datei-URL müsste aus der HTML-Übersichtsseite extrahiert werden — das erfordert einen echten Seitenabruf, der aktuell blockiert ist |
| Existierender Parser/Fetcher | `rp-bundesregierung` existiert bereits im Katalog (Status `broken`, alte URL); derselbe generische RSS-Parser (`crawler.js:533`) wäre wiederverwendbar |
| Existierender Retrieval Path | `rp-bundesregierung` (RSS, `broken`) — siehe Sprint-1-Matrix, Zeile 9 |
| **Verdikt** | **❌ derzeit nicht automatisierbar** — weder die Masterpaket-URL noch eine sicher bestätigte aktuelle Alternative liegen vor; die einzige bekannte vorherige direkte Alternative wurde real getestet und ist tot. |
| **Nächster technischer Schritt** | Echten Abruf der Übersichtsseite `bundesregierung.de/breg-de/service/newsletter-und-abos/rss-newsfeed` über einen Runner mit offenem Egress durchführen, um die darin tatsächlich verlinkte(n) `feed.xml`-URL(s) zu extrahieren, danach den konkreten Feed real testen. Ohne diesen Schritt keine Quellenkonfiguration anlegen. |

---

## 3) Pressemitteilungen des Bundesverfassungsgerichts

| Feld | Befund |
|---|---|
| Dokumentierte URL (Masterpaket) | `https://www.bundesverfassungsgericht.de/SiteGlobals/Functions/RSSFeed/DE/Pressemitteilungen/RSSPressemitteilungen.xml` |
| Live-Verifikation heute | Nicht möglich (siehe Vorbehalt oben) |
| Deskrecherche | Die URL wird in mehreren unabhängigen Suchtreffern exakt als offizieller RSS-Feed der BVerfG-Pressemitteilungen referenziert und folgt dem Standard-URL-Muster `.../SiteGlobals/Functions/RSSFeed/...` des deutschen Government-Site-Builder-CMS (gleiches Muster u. a. bei Bundesarbeitsgericht/Bundesverwaltungsgericht beobachtbar). **Keine** Hinweise auf einen CMS-Relaunch oder eine URL-Änderung gefunden — anders als bei `bundestag.de`/`bundesregierung.de`. |
| Bereits vorhandene reale Testevidenz im Repo | Keine — BVerfG wurde in keinem bisherigen Sprint real getestet |
| Feedtyp (angenommen) | RSS 2.0 (Government-Site-Builder-Standard) |
| Aktualisierungsfrequenz (institutionell bekannt) | Unregelmäßig, ereignisgetrieben (Pressemitteilungen erscheinen anlassbezogen zu Entscheidungen/Terminen, keine feste Taktung) |
| Format/Beispieleintrag | Nicht verifizierbar ohne echten Abruf |
| Bekannte Einschränkungen | Für Bundesverfassungsgericht existiert **aktuell gar nichts** in der Architektur — kein Publisher, keine Political Entity, kein Retrieval Path, in keinem Paket. Komplette Neuanlage nötig, keine Reparatur eines bestehenden Wegs. |
| Existierender Parser/Fetcher | Kein BVerfG-spezifischer Code; generischer RSS-Parser (`crawler.js:533`) wäre anwendbar, sofern Standard-RSS bestätigt wird |
| Existierender Retrieval Path | Keiner (siehe Sprint-1-Matrix, Zeile 12) |
| **Verdikt** | **⚠ funktioniert vermutlich, aber nicht bestätigt** — von den drei Kandidaten die **stärkste Plausibilität** (stabile, mehrfach unabhängig referenzierte Government-CMS-URL, kein bekannter Relaunch), dennoch kein echter Test heute. |
| **Nächster technischer Schritt** | Echten HTTP-Abruf über einen Runner mit offenem Egress durchführen; bei Erfolg Publisher (`bundesverfassungsgericht.de`) + Political Entity (`entity_type: other_institution`, da kein `court`-Typ im Schema vorgesehen) + Retrieval Path nach demselben Muster wie `rp-dip` neu anlegen (aktuell 0 vorhanden). |

---

## Warum in diesem Sprint keine Quellenkonfiguration erzeugt wurde

Punkt 6 des Auftrags ("Falls sinnvoll: Erzeuge oder aktualisiere ausschließlich die
notwendige Quellenkonfiguration") ist **bewusst nicht ausgeführt** worden: Da keine der
drei URLs heute real bestätigt werden konnte, würde das Anlegen von "prepared"
Retrieval-Path-Einträgen mit geratenen URLs genau das Risiko wiederholen, das in diesem
Repository bereits einmal eingetreten ist — die frühere, sorgfältig recherchierte
Reparatur-URL-Vermutung für `bundesregierung` (`bundeswege-reparaturen.js`) erwies sich
beim späteren echten Test als real defekt (404). Eine unbestätigte Quellenkonfiguration
in die Architektur zu schreiben würde einen Bestätigungsgrad vortäuschen, der nicht
besteht.

**Kein Code, keine Seeds, keine Architekturdateien wurden in diesem Sprint verändert.**
Die einzige neue Datei ist dieser Bericht.

---

## Kurzbericht (Abschluss)

| Nr | Quelle | Status | Nächster Schritt |
|---|---|---|---|
| 1 | Heute im Bundestag (hib) | ⚠ funktioniert vermutlich mit Einschränkungen (nicht live bestätigt) | Echten Abruf von `hib.rss` über Runner mit offenem Egress durchführen |
| 2 | Pressemitteilungen der Bundesregierung | ❌ derzeit nicht automatisierbar (Masterpaket-URL wahrscheinlich veraltet, keine bestätigte Alternative) | Übersichtsseite real abrufen, um die aktuelle Feed-URL zu extrahieren, dann real testen |
| 3 | Pressemitteilungen des Bundesverfassungsgerichts | ⚠ funktioniert vermutlich (stärkste Plausibilität, aber nicht live bestätigt) | Echten Abruf über Runner mit offenem Egress durchführen, danach Publisher/Entity/Retrieval Path neu anlegen |

**✅ vollständig funktionsfähig bestätigt: 0 von 3** — dieser Sprint konnte aus der
Arbeitsumgebung heraus keinen einzigen echten HTTP-Nachweis erbringen (Proxy-Policy +
serverseitiger Bot-Schutz, siehe Vorbehalt oben). Alle drei brauchen als gemeinsamen
nächsten Schritt einen echten Abruftest mit offenem Egress (Muster:
`.github/workflows/sprint9b-verify.yml`), bevor irgendeine Quellenkonfiguration in die
Architektur aufgenommen wird.

**Geänderte Dateien in diesem Sprint:**
- `docs/quellen/bund-basis/sprint-2-live-validierung.md` (neu)

Keine weiteren Dateien. Keine Migration, keine Aktivierung, kein Production Write, kein
Deployment, keine Änderung an bestehenden Google-News-Quellen oder an der Architektur.
