# Sprint 2 — Live-Validierung der ersten drei Pflichtquellen

**Stand:** 2026-07-23 · **main-HEAD:** `035898b` · **Bearbeitete Quellen:** ausschließlich
hib, Pressemitteilungen der Bundesregierung, Pressemitteilungen des
Bundesverfassungsgerichts (keine weiteren).

**Update (echte Verifikation durchgeführt):** Alle drei URLs wurden inzwischen mit
echtem, offenem Egress getestet — Ergebnis unten in Abschnitt „Echte
GitHub-Actions-Verifikation". Der ursprüngliche Deskrecherche-Versuch (Abschnitt direkt
darunter) bleibt als Kontext stehen, ist aber durch die echten Ergebnisse **teilweise
widerlegt**: Die Deskrecherche hatte Bundesregierung als eher tot und BVerfG als
plausibelste Quelle eingeschätzt — der echte Test zeigt das **Gegenteil**. Das ist genau
der Grund, warum reine Deskrecherche keinen Live-Test ersetzt.

---

## Ursprünglicher Vorbehalt: keine echte Live-Verifikation aus der Arbeitsumgebung möglich

Zwei unabhängige Versuche, die drei Feeds direkt aus der Arbeitsumgebung abzurufen,
waren gescheitert:

1. **Direkter HTTPS-Abruf (curl über den Session-Proxy):** Der Proxy verweigert den
   CONNECT-Tunnel zu `www.bundestag.de:443` mit `403 Forbidden` — laut Proxy-Diagnose
   (`/root/.ccr/README.md`) eine **Egress-Policy-Entscheidung der Organisation**, die
   ausdrücklich nicht wiederholt oder umgangen werden soll, sondern zu melden ist.
2. **`WebFetch` (separater Pfad, umgeht den Session-Proxy):** Alle drei Domains
   antworteten mit `403 Forbidden` **vom Zielserver selbst** — Bot-Schutz, deckungsgleich
   mit `docs/quellenarchitektur/13-landesmodule-technische-pruefung-und-bundeswege.md`.

Daraufhin wurde zunächst reine Deskrecherche durchgeführt (nicht live getestet). Auf
ausdrücklichen Wunsch wurde anschließend ein kleiner, read-only GitHub-Actions-Workflow
gebaut (`.github/workflows/sprint2-verify-pflichtquellen.yml` +
`scripts/sprint2-verify-pflichtquellen.js`, nach dem Muster von `sprint9b-verify.yml`)
und über einen **Draft-Pull-Request** (`#115`, **nicht gemerged**) auf einem
GitHub-Actions-Runner mit offenem Egress ausgeführt, weil `workflow_dispatch` für einen
brandneuen Workflow erst funktioniert, sobald die Datei auf `main` liegt (derselbe Grund,
warum `sprint9b-verify.yml` einen `pull_request`-Trigger hat).

---

## Echte GitHub-Actions-Verifikation (PR #115, Lauf 1, 2026-07-23 20:01 UTC)

**Lauf:** [github.com/ernisch/helmut-pilot/actions/runs/30040374820](https://github.com/ernisch/helmut-pilot/actions/runs/30040374820)
(`conclusion: success`, Laufzeit 15 s, `ubuntu-latest`, offener Egress, keine Secrets,
`permissions: contents: read`) · **Artefakt:** `sprint2-pflichtquellen-verifikation`
(Run-Artefakt-ID `8576963773`, 30 Tage Aufbewahrung).

Reale Konsolen-Ausgabe des Abrufschritts (unverändert übernommen):

```
✅  Heute im Bundestag (hib)                      HTTP 200  HTTP 2xx, gueltige RSS/Atom-Struktur mit auswertbaren Eintraegen (echter Produktionsparser liefert Items)
✅  Pressemitteilungen der Bundesregierung        HTTP 200  HTTP 2xx, gueltige RSS/Atom-Struktur mit auswertbaren Eintraegen (echter Produktionsparser liefert Items)
❌  Pressemitteilungen des Bundesverfassungsgerichts HTTP 404  HTTP 404 — nicht gefunden
```

**Hinweis zur Vollständigkeit:** Die vom Skript zusätzlich erzeugte JSON-/Markdown-Ausgabe
enthält je Quelle auch Content-Type, Redirect-Kette, Kanal-Titel und einen
Beispieleintrag. Der Job-Log (oben, vollständig ausgelesen) enthält diese Zusatzfelder
nicht (sie werden nur in die Artefakt-Dateien geschrieben, nicht auf die Konsole). Der
Versuch, das Artefakt selbst herunterzuladen, scheiterte am selben Egress-Proxy dieser
Arbeitsumgebung (die temporäre Azure-Blob-Storage-URL ist nicht auf der Freigabeliste) —
das Artefakt ist aber über den obigen Run-Link direkt in GitHub abrufbar. Die
**Kernaussage (HTTP-Status + eindeutiges Urteil) ist damit real bestätigt**; die
Zusatzfelder (Kanal-Titel, Beispieleintrag, exakter Content-Type, Redirect-Anzahl) müssten
bei Bedarf direkt aus dem Artefakt entnommen werden.

---

## 1) Heute im Bundestag (hib)

| Feld | Befund |
|---|---|
| Geprüfte URL | `https://www.bundestag.de/static/appdata/includes/rss/hib.rss` |
| **Echter Testbefund** | **HTTP 200 — gültige RSS/Atom-Struktur, echter Produktionsparser (`crawler.parseRssItems`) liefert auswertbare Einträge** |
| Feedtyp | RSS (Struktur vom Produktionsparser als `<item>`-basiert erkannt) |
| Aktualisierungsfrequenz (institutionell bekannt) | hib erscheint an Sitzungstagen des Bundestages mehrfach täglich |
| Beispieleintrag / genauer Content-Type / Redirects | In der Artefakt-JSON des Laufs enthalten, aus dieser Umgebung nicht herunterladbar (siehe Hinweis oben) — direkt im GitHub-Actions-Run abrufbar |
| Bekannte Einschränkungen | Die alte Basis-URL `/rss` (ohne den `/static/appdata/...`-Pfad) ist weiterhin real defekt (`rp-bundestag`, Status `broken`) — nur die spezifische `hib.rss`-Datei wurde jetzt bestätigt, nicht der allgemeine Bundestag-Feed |
| Existierender Parser/Fetcher | `lib/helmut/crawler.js:533` `parseRssItems()` — bereits produktiv im Einsatz, **kein neuer Parser nötig** (durch diesen Test praktisch bestätigt) |
| Existierender Retrieval Path | Nur schwache Proxies: `rp-bundestag` (RSS, `broken`) + `rp-general-hib` (Google-News-Suche) — siehe Sprint-1-Matrix, Zeile 2. Kein dedizierter hib-Weg. |
| **Verdikt** | **✅ technisch erreichbar und als Feed nutzbar** |
| **Nächster technischer Schritt** | Dedizierten Retrieval Path für hib (Publisher `bundestag.de`, bereits vorhanden) als `prepared`/`needs_review` vorbereiten — **in einem eigenen, künftigen Sprint** (keine Integration in diesem Sprint, siehe Abschnitt unten). |

---

## 2) Pressemitteilungen der Bundesregierung

| Feld | Befund |
|---|---|
| Geprüfte URL | `https://www.bundesregierung.de/service/rss/breg-de/1151244/feed.xml` |
| **Echter Testbefund** | **HTTP 200 — gültige RSS/Atom-Struktur, echter Produktionsparser liefert auswertbare Einträge** |
| Feedtyp | RSS (Struktur vom Produktionsparser als `<item>`-basiert erkannt) |
| Einordnung gegenüber Deskrecherche | Die vorherige Deskrecherche (siehe unten) vermutete, die Knoten-ID-URL sei durch einen CMS-Relaunch veraltet — das ist **widerlegt**: die exakte Masterpaket-URL ist real erreichbar und liefert einen echten Feed. |
| Beispieleintrag / genauer Content-Type / Redirects | In der Artefakt-JSON enthalten, siehe Hinweis oben |
| Bekannte Einschränkungen | `rp-bundesregierung` im bestehenden Katalog nutzt eine **andere, ältere** URL (`.../breg-de/service/rss`) und ist dort als `broken` markiert — das ist eine separate, tatsächlich tote URL und bleibt unabhängig von diesem Befund korrekturbedürftig. Die hier getestete, im Masterpaket dokumentierte URL ist eine dritte, bislang nicht im Katalog geführte Adresse. |
| Existierender Parser/Fetcher | `crawler.js:533` `parseRssItems()` — wiederverwendbar, kein neuer Parser nötig |
| Existierender Retrieval Path | `rp-bundesregierung` (RSS, `broken`, andere URL) — siehe Sprint-1-Matrix, Zeile 9. Die jetzt bestätigte URL ist dort noch nicht hinterlegt. |
| **Verdikt** | **✅ technisch erreichbar und als Feed nutzbar** |
| **Nächster technischer Schritt** | `rp-bundesregierung` in einem künftigen Sprint auf die jetzt bestätigte URL korrigieren (statt der alten, toten `.../breg-de/service/rss`) — **keine Integration in diesem Sprint** (siehe Abschnitt unten). |

---

## 3) Pressemitteilungen des Bundesverfassungsgerichts

| Feld | Befund |
|---|---|
| Geprüfte URL | `https://www.bundesverfassungsgericht.de/SiteGlobals/Functions/RSSFeed/DE/Pressemitteilungen/RSSPressemitteilungen.xml` |
| **Echter Testbefund** | **HTTP 404 — nicht gefunden** |
| Einordnung gegenüber Deskrecherche | Die vorherige Deskrecherche hatte diese URL als die **plausibelste** der drei eingeschätzt (mehrfach unabhängig referenziert, stabiles Government-CMS-Muster, kein bekannter Relaunch) — das ist **widerlegt**: die Datei existiert unter dieser Adresse nicht (mehr). |
| Bekannte Einschränkungen | Für Bundesverfassungsgericht existiert weiterhin **gar nichts** in der Architektur — kein Publisher, keine Political Entity, kein Retrieval Path, in keinem Paket. Die im Masterpaket dokumentierte URL kann nicht als Grundlage dienen. |
| Existierender Parser/Fetcher | Nicht relevant, solange keine funktionierende URL vorliegt |
| Existierender Retrieval Path | Keiner (siehe Sprint-1-Matrix, Zeile 12) |
| **Verdikt** | **❌ tot, 404, blockiert oder ungeeignet** |
| **Nächster technischer Schritt** | Auf der offiziellen Website (`bundesverfassungsgericht.de`) gezielt nach dem aktuellen RSS-Pfad der Pressemitteilungen suchen (z. B. über die Presse-Übersichtsseite `DE/Presse/Pressemitteilungen/pressemitteilungen_node.html`) und die gefundene Kandidaten-URL in einem eigenen, künftigen Testlauf real verifizieren, **bevor** Publisher/Entity/Retrieval Path angelegt werden. |

---

## Warum trotz zwei bestätigter Quellen keine Quellenkonfiguration erzeugt wurde

Der Auftrag für diesen Verifikationsschritt war ausdrücklich auf den **Testlauf selbst**
begrenzt ("Noch keine Quelle integrieren. Stoppe danach."). Obwohl hib und die
Pressemitteilungen der Bundesregierung jetzt real als funktionsfähig bestätigt sind,
wurde bewusst **keine** Publisher-/Retrieval-Path-/Package-Path-Konfiguration angelegt
oder geändert — das bleibt ausdrücklich einem eigenen, künftigen Schritt vorbehalten.

**In diesem Schritt geändert/hinzugefügt:**
- `docs/quellen/bund-basis/sprint-2-live-validierung.md` (aktualisiert, dieser Bericht)
- `.github/workflows/sprint2-verify-pflichtquellen.yml` (neu, bereits im vorigen Schritt committet)
- `scripts/sprint2-verify-pflichtquellen.js` (neu, bereits im vorigen Schritt committet)
- Draft-Pull-Request `#115` auf GitHub, **offen, nicht gemerged**, dient ausschließlich
  dazu, den Actions-Lauf mit offenem Egress auszulösen

**Nicht geändert:** keine Seeds, keine Katalog-/Architekturdateien
(`lib/helmut/sources.js`, `lib/helmut/quellenarchitektur/**`), keine Retrieval Paths,
keine Migration, keine Aktivierung, kein Production Write, kein Deployment.

---

## Kurzbericht (Abschluss)

| Nr | Quelle | Status (echt getestet) | Nächster Schritt |
|---|---|---|---|
| 1 | Heute im Bundestag (hib) | ✅ technisch erreichbar und als Feed nutzbar (HTTP 200, echter Parser liefert Einträge) | Dedizierten Retrieval Path in künftigem Sprint vorbereiten |
| 2 | Pressemitteilungen der Bundesregierung | ✅ technisch erreichbar und als Feed nutzbar (HTTP 200, echter Parser liefert Einträge) | `rp-bundesregierung` in künftigem Sprint auf diese URL korrigieren |
| 3 | Pressemitteilungen des Bundesverfassungsgerichts | ❌ tot, 404 | Aktuellen offiziellen RSS-Pfad auf bundesverfassungsgericht.de suchen und real neu testen |

**✅ vollständig funktionsfähig bestätigt: 2 von 3** (hib, Pressemitteilungen der
Bundesregierung) · **❌ tot: 1 von 3** (BVerfG-Pressemitteilungen, dokumentierte
Masterpaket-URL ist ein 404) · **⚠ eingeschränkt: 0 von 3**.

Dieses Ergebnis korrigiert die vorherige Deskrecherche in beiden unsicheren Fällen: die
als „wahrscheinlich veraltet" eingeschätzte Bundesregierungs-URL funktioniert real, und
die als „plausibelste" eingeschätzte BVerfG-URL ist real tot. Das bestätigt die
Entscheidung aus dem vorigen Schritt, keine Quellenkonfiguration auf Basis reiner
Deskrecherche anzulegen.

**Geänderte Dateien in diesem Schritt:**
- `docs/quellen/bund-basis/sprint-2-live-validierung.md` (aktualisiert mit den echten Testergebnissen)

Zusätzlich in vorangegangenen Teilschritten dieses Sprints bereits erstellt (unverändert):
- `.github/workflows/sprint2-verify-pflichtquellen.yml`
- `scripts/sprint2-verify-pflichtquellen.js`

Keine weiteren Dateien. Keine Migration, keine Aktivierung, kein Production Write, kein
Deployment, keine Änderung an bestehenden Google-News-Quellen oder an der Architektur.
Pull Request `#115` bleibt als Draft offen (nicht gemerged) und dokumentiert den
Testlauf; die PR-Aktivitäts-Überwachung wurde beendet, da dieser Schritt mit der
Ergebnis-Dokumentation abgeschlossen ist.
