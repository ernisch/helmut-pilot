# Sprint 9 — Abschlussbericht (Quellenrecherche Berlin & Brandenburg)

**Stand:** 2026-07-13 · **Branch:** `claude/helmut-source-architecture-ruhyvb` ·
**Modus:** ausschließlich sichere, reversible, additive Arbeiten — **reine Seed-Daten**,
**keine** Production-Migration, keine Production-Datenänderung, **keine Quellenaktivierung**,
**kein Cron**, **kein Deployment**.

## 1. Geprüfte Quellenklassen
Beide Landesmodule decken **alle 15 Pflichtklassen** ab (Single Source
`seeds/packages.js` → `LANDESMODUL_PFLICHTKLASSEN`): `landesparlament`, `plenum`,
`ausschuesse`, `drucksachen`, `schriftliche_anfragen`, `gesetzgebung`, `landesregierung`,
`staatskanzlei`, `ministerien`, `landesfraktionen`, `regionale_leitmedien`,
`oer_landesberichterstattung`, `partei_pilot`, `fraktion_pilot`, `person_pilot`.
→ **Berlin 15/15, Brandenburg 15/15**, keine unbekannte Klasse.

## 2. Empfohlene Kandidaten
- **Berlin: 13 empfohlen** + 2 mit_einschränkung. Rückgrat: Abgeordnetenhaus-**RSS** +
  **PARDOK-Open-Data-XML** (Drucksachen/Anfragen/Gesetzgebung aus **einer** Rohquelle),
  Landespressedienst (Regierung/Staatskanzlei/Ministerien als Institutionsfilter),
  rbb24, Die-Linke-Pilotlinie (Partei/Linksfraktion/Tobias Schulze MdA).
- **Brandenburg: 11 empfohlen** + 4 mit_einschränkung. Rückgrat: Landtag-**RSS** +
  **parldok `exportWP1.xml`**, `bbo_rss`-Aggregat der Landesregierung, rbb24.
- Methoden überwiegend **RSS + Open-Data-XML** (nicht scrape-lastig); jeder Kandidat mit
  konkreter URL, Methode und Herausgeber.

## 3. Mit Einschränkung (ehrlich markiert)
- **`schriftliche_anfragen`** (beide): Typfilter der Drucksachen-XML — als **Filter**, nicht
  als zweite Rohquelle (sonst Doppelzählung).
- **`regionale_leitmedien`**: Berlin RSS-Metadaten frei/Volltext Paywall; Brandenburg MAZ+
  Paywall **ohne** öffentlichen RSS → nur `googlenews_search`.
- **Brandenburg `fraktion_pilot` + `person_pilot`**: Ausweich auf **SPD** (Björn Lüttmann),
  weil Die Linke in der 8. WP **keine Landtagsfraktion** hat (Partei-Pilot bleibt Die Linke).

## 4. Abgelehnte Kandidaten (mit Grund)
1. **MAZ `maz-online.de` als Direkt-RSS** — kein Feed + harte Paywall → googlenews-Ersatz.
2. **`linksfraktion-brandenburg.de` als aktiver Pilot** — Die Linke nicht im Landtag (8. WP).
3. **`gesetze.berlin.de`/GVBl als eigener Feed** — kein RSS, nur HTML/PDF → Open-Data-Vorgangstyp.
4. **`bravors.brandenburg.de` als eigener Feed** — kein RSS (StarWeb) → parldok-Vorgangstyp.
5. **Schriftliche Anfragen als zweite Rohquelle** (beide) — Doppelzählung → als Filter führen.

## 5. Ehrlichkeit / Recherche-Vorbehalt
- URLs **per WebSearch belegt**, aber in dieser Umgebung **nicht byte-genau abrufbar**
  (Egress-Proxy blockt Gov-/Medien-Domains, 403). Deshalb trägt **jeder** Kandidat
  `verifyBeforeActivation: true` — vor Aktivierung byte-genau prüfen.
- Aus CMS-Mustern abgeleitete Feed-Pfade (`feed.rss`, `/feed/`, `bbo_rss`) sind Kandidaten,
  keine bestätigten Endpunkte. `parlament-berlin.de`/`landtag.brandenburg.de` verlangen einen
  realistischen User-Agent (Bot-403).
- **Keine erfundenen Kennzahlen:** `cost` = „offen" bzw. realer Paywall-Zustand; Ergiebigkeit
  wird erst nach Aktivierung gemessen.

## 6. Dedup-Hinweise (für globale Referenzzählung)
1. **rbb24-Politik-Feed identisch** für Berlin und Brandenburg → eine Fundstelle, zwei
   Paketreferenzen.
2. Klassen 4–6 aus **einer** Open-Data-XML je Land.
3. `landesregierung ⊃ staatskanzlei ⊃ ministerien` über **einen** Pressedienst je Land.

## 7. Tests — alle grün
- **`test:landesmodule-kandidaten` 29/29** (Klassenabdeckung, „nichts aktiviert",
  Ehrlichkeit/`verifyBeforeActivation`, Brandenburg-Fraktionslinie, rbb-Dedup,
  abgelehnte Kandidaten, Empfehlungslage).
- **Keine Regression:** source-architecture 88, profile-packages 57, quality-watchdog 65,
  scoring 73, admin-source-report 48, admin-source-ui 23.

## 8. Branch & Commit
- **Branch:** `claude/helmut-source-architecture-ruhyvb`
- **Neu:** `lib/helmut/quellenarchitektur/seeds/landesmodule-kandidaten.js`,
  `scripts/landesmodule-kandidaten-test.js`,
  `docs/quellenarchitektur/11-landesmodule-berlin-brandenburg.md`,
  `docs/quellenarchitektur/sprint-9-abschlussbericht.md`;
  `package.json` (Testregistrierung).
- **Commit:** siehe Push (Sprint-9-Commit) auf o.g. Branch.

## 9. Offene Risiken
- **Byte-genaue Verifikation ausstehend** (Egress-Block): Feed-Pfade/URLs vor Aktivierung real prüfen.
- **Paywall-Klassen** (`regionale_leitmedien`): nur Metadaten via googlenews — Volltext nicht verfügbar.
- **Bot-Abwehr** (403) bei den Parlamentsseiten → realistischer User-Agent beim späteren Crawl nötig.
- **Brandenburg-Pilotlinie** ist ein bewusster Ausweich (SPD) — bei Bedarf fachlich bestätigen.

## 10. Freigabepflichtige Folgeschritte (NICHT ausgeführt)
Verifikation der URLs außerhalb des Egress-Blocks → Anlegen von Publisher/Geography/
Retrieval-Paths → Aktivierung der Landespakete → Cron/Crawl-Verdrahtung.
**Alles freigabepflichtig; in diesem Sprint bewusst nicht angefasst.**
