# 11 — Landesmodule Berlin & Brandenburg (Quellenkandidaten)

**Stand:** 2026-07-13 · **Sprint 9 (inkl. Korrekturen 1+2)** · **Status: `prepared` (vorbereitet, NICHTS aktiviert)**

Diese Doku beschreibt die recherchierten Quellenkandidaten für die beiden nächsten
Landesmodule **Berlin** und **Brandenburg**. Sie sind **ausschließlich als Vorschläge
(`prepared`)** angelegt — es ist **kein** Abrufweg erzeugt, **kein** Crawl verdrahtet,
**nichts** aktiviert. Aktivierung ist ein späterer, ausdrücklich **freigabepflichtiger**
Schritt.

Datenquelle im Code: `lib/helmut/quellenarchitektur/seeds/landesmodule-kandidaten.js`.

---

## 1. Reifegrad: Kandidatenabdeckung ist NICHT Einsatzbereitschaft

Jeder Eintrag trägt einen **Reifegrad** (`readiness`) auf einer geordneten Skala. Damit ist
im Modell und im Admin klar unterschieden, wie weit eine Klasse wirklich ist:

| Stufe | Bedeutung | heutiger Bestand |
|-------|-----------|------------------|
| `unbesetzt` | keine Quelle vorgesehen (bewusst offen, bis ein echtes Profil feststeht) | **2** (BB fraktion_pilot/person_pilot) |
| `kandidat` | recherchiert, aber **nicht** byte-genau technisch verifiziert | **28** (BE 15 + BB 13) |
| `verifiziert` | URL/Feed byte-genau geprüft (Struktur, Datum, Original-URL) | **0** |
| `bereit` | verifiziert **und** zur Aktivierung freigegeben | **0** |
| `aktiv` | läuft in Production | **0** |

**Ehrliche Kernaussage:** Berlin und Brandenburg sind **Kandidaten-abgedeckt, aber nicht
einsatzbereit** — 0 verifiziert, 0 bereit, 0 aktiv. Der Egress-Proxy blockt in dieser
Umgebung die byte-genaue Verifikation (403 auf Gov-/Medien-Domains), deshalb bleibt jede
besetzte Klasse vorerst auf Stufe `kandidat`.

---

## 2. Ehrlichkeitsvorbehalt (Recherche-Grundlage)

- **URLs sind per WebSearch belegt, aber in dieser Umgebung NICHT byte-genau abrufbar.**
  Jeder besetzte Kandidat trägt `verifyBeforeActivation: true` — vor Aktivierung byte-genau prüfen.
- **Aus CMS-Mustern abgeleitete Feed-Pfade** (TYPO3 `feed.rss`, WordPress `/feed/`,
  Brandenburg `bbo_rss`) sind Kandidatenpfade, keine bestätigten Endpunkte.
- **Bot-Abwehr:** `parlament-berlin.de`/`landtag.brandenburg.de` blocken generische Bots
  (403) → realistischer User-Agent nötig (operatives Abrufrisiko).
- **Keine erfundenen Kennzahlen:** `cost` = „offen" bzw. realer Paywall-Zustand; Ergiebigkeit
  wird erst nach Aktivierung gemessen.

---

## 3. Geprüfte Quellenklassen (15 Pflichtklassen je Land)

Beide Module enthalten **alle 15 Pflichtklassen** (Single Source `seeds/packages.js`):

| # | Klasse | Berlin (Reifegrad) | Brandenburg (Reifegrad) |
|---|--------|--------------------|-------------------------|
| 1 | `landesparlament` | Abgeordnetenhaus (RSS) · kandidat | Landtag (RSS) · kandidat |
| 2 | `plenum` | Open-Data-XML · kandidat | parldok-XML · kandidat |
| 3 | `ausschuesse` | RSS je Ausschuss · kandidat | RSS je Ausschuss · kandidat |
| 4 | `drucksachen` | PARDOK-XML · kandidat | `exportWP1.xml` · kandidat |
| 5 | `schriftliche_anfragen` | Typfilter der XML · kandidat | Typfilter der XML · kandidat |
| 6 | `gesetzgebung` | Vorgangstyp der XML · kandidat | Vorgangstyp der XML · kandidat |
| 7 | `landesregierung` | Landespressedienst · kandidat | bbo_rss · kandidat |
| 8 | `staatskanzlei` | Senatskanzlei/RBm · kandidat | Staatskanzlei · kandidat |
| 9 | `ministerien` | Senatsverwaltungen · kandidat | Ministerien (bbo_rss) · kandidat |
| 10 | `landesfraktionen` | Fraktionen im AGH · kandidat | **reale Fraktionen SPD/AfD/BSW/CDU** · kandidat |
| 11 | `regionale_leitmedien` | Tagesspiegel u.a. (RSS) · kandidat | MAZ/LR — googlenews (Paywall) · kandidat |
| 12 | `oer_landesberichterstattung` | rbb24 · kandidat | **rbb24 — gleicher Feed** (dedup) · kandidat |
| 13 | `partei_pilot` | Die Linke Berlin · kandidat | **Die Linke Brandenburg** (Partei) · kandidat |
| 14 | `fraktion_pilot` | Linksfraktion Berlin · kandidat | **UNBESETZT** (kein echter Pilot) |
| 15 | `person_pilot` | Tobias Schulze (MdA) · kandidat | **UNBESETZT** (kein echter Pilot) |

**Kandidatenabdeckung:** Berlin **15/15**, Brandenburg **13/15** (2 Pilotklassen bewusst
unbesetzt). Keine dieser Klassen ist technisch verifiziert oder einsatzbereit.

---

## 4. Brandenburg-Sonderfall: kein Ersatz-Pilot (Korrektur 1)

Die Bundes-Pilotlinie folgt **Die Linke**. In Brandenburg gilt (8. Wahlperiode):

- **Die Linke (Partei) existiert** → `partei_pilot` = **Die Linke Brandenburg** (`kandidat`).
  Die Partei darf als Partei beobachtet werden.
- **Die Linke hat in der 8. WP KEINE Landtagsfraktion** (im Landtag sitzen nur SPD, AfD,
  BSW, CDU). Ein fehlender echter Pilot wird **nicht** durch eine andere Partei oder Person
  ersetzt. Deshalb:
  - `fraktion_pilot` → **`unbesetzt`** (kein Publisher, keine URL), bis ein echtes
    Pilotprofil feststeht.
  - `person_pilot` → **`unbesetzt`**, keine Ersatzperson aus fremder Partei.
- **Das allgemeine Brandenburg-Paket darf die realen Landtagsfraktionen enthalten:**
  `landesfraktionen` nennt SPD/AfD/BSW/CDU (`kandidat`). Diese allgemeine Beobachtung ist
  von der pilotbezogenen Quelle sauber getrennt.

> Der frühere SPD-Ausweich (SPD-Fraktion / Björn Lüttmann als Pilot) ist **entfernt** und
> steht ausdrücklich in der Ablehnungsliste (§6).

Berlin bleibt konsistent: Die Linke sitzt im Abgeordnetenhaus (24 MdA) → `partei_pilot`,
`fraktion_pilot` (Linksfraktion) und `person_pilot` (Tobias Schulze) alle besetzt.

---

## 5. Empfehlungslage (nur besetzte Kandidaten)

| | Berlin | Brandenburg |
|---|--------|-------------|
| Klassen im Modul | 15 | 15 |
| Kandidat besetzt | 15 | 13 |
| **empfohlen** | **13** | **11** |
| **mit_einschränkung** | **2** | **2** |
| **unbesetzt** | 0 | **2** |
| verifiziert / bereit / aktiv | 0 / 0 / 0 | 0 / 0 / 0 |

**mit_einschränkung:**
- Berlin: `schriftliche_anfragen` (Typfilter, nicht doppelt), `regionale_leitmedien` (Paywall-Volltext).
- Brandenburg: `schriftliche_anfragen` (Typfilter), `regionale_leitmedien` (MAZ+ Paywall ohne RSS).

---

## 6. Abgelehnte Kandidaten (mit Grund)

| Land | Klasse | Abgelehnter Kandidat | Grund |
|------|--------|----------------------|-------|
| Brandenburg | `regionale_leitmedien` | MAZ `maz-online.de` als Direkt-RSS | Kein Feed + MAZ+-Paywall → googlenews_search. |
| Brandenburg | `fraktion_pilot` | **SPD-Fraktion als Pilot-Ersatz** | Kein Partei-Ersatz für fehlenden echten Pilot → `fraktion_pilot` bleibt unbesetzt. |
| Brandenburg | `person_pilot` | **Björn Lüttmann (SPD) als Pilot-Person** | Keine Ersatzperson aus fremder Partei → `person_pilot` bleibt unbesetzt. |
| Brandenburg | `fraktion_pilot` | `linksfraktion-brandenburg.de` als aktive Fraktion | Die Linke ist in der 8. WP nicht im Landtag — keine aktive Fraktion. |
| Berlin | `gesetzgebung` | `gesetze.berlin.de` / GVBl als eigener Feed | Kein RSS → Open-Data-Vorgangstyp. |
| Brandenburg | `gesetzgebung` | `bravors.brandenburg.de` als eigener Feed | Kein RSS (StarWeb) → parldok-Vorgangstyp. |
| beide | `schriftliche_anfragen` | zweite Rohquelle | Teilmenge der Drucksachen-XML → als Filter. |

---

## 7. Dedup- und Überschneidungshinweise

1. **rbb24-Politik-Feed identisch für Berlin und Brandenburg** → eine Fundstelle, zwei
   Paketreferenzen, nicht doppelt crawlen.
2. Klassen 4–6 (Drucksachen/Anfragen/Gesetzgebung) aus **einer** Open-Data-XML je Land.
3. `landesregierung ⊃ staatskanzlei ⊃ ministerien` über **einen** Pressedienst je Land.

---

## 8. Was NICHT passiert ist (Sicherheitsrahmen)

- **Keine** Production-Migration, **keine** Production-Datenänderung, **keine** RLS-Änderung.
- **Keine** Quellenaktivierung, **kein** Cron, **kein** Deployment.
- **Kein** Abrufweg (`retrieval_path`) erzeugt, **kein** Publisher/Geography in die DB geschrieben.
- Alle Kandidaten liegen als **reine Seed-Daten** (`prepared`) im Code —
  `candidateSummary().aktiviert === 0`, `verifiziert === 0`, `einsatzbereit === 0`.

## 9. Freigabepflichtige Folgeschritte (später)

1. **Byte-genaue Verifikation** jeder URL/jedes Feed-Pfads (außerhalb des Egress-Blocks)
   → Reifegrad `kandidat` → `verifiziert`.
2. Anlegen der Publisher/Geographies/Retrieval-Paths je Land als DB-Einträge.
3. Freigabe zur Aktivierung → Reifegrad `bereit`.
4. Aktivierung der Landespakete, Cron/Crawl-Verdrahtung → Reifegrad `aktiv`.
5. Die **unbesetzten** Brandenburg-Pilotklassen bleiben offen, bis ein echtes Pilotprofil feststeht.
