"use strict";

// Helmut — SOURCE DEMAND COMPILER (OP-30).
// =============================================================================================
// WARUM ES DIESES MODUL GIBT (Ursache, belegt — nicht vermutet):
// docs/betrieb/v3-skalierungspruefung-2026-08-08.md hat gemessen, dass der V3-Datenmotorkern
// skaliert (ein Dokument wird EINMAL verstanden, Matching und Entscheidungen ohne KI), die
// EINGANGSMENGE der zentralen Sammlung aber linear mit der Mandatszahl waechst:
// `scheduler.getSourcesForProfile` stellt jedem Profil `[personNewsSource, ...mandateNewsSources]`
// voran — 7 eigene Google-Wege je Bundestagsmandat, 8 je Landtagsmandat. Bei 200 Mandaten sind
// das 1 400 eigene Wege gegen 140 geteilte; bei 1 000 Mandaten 7 000 gegen 140.
//
// Der Befund dazu, woertlich aus dem Bestandscode:
//   „`scheduler.personNewsSource` erzeugt je Mandat zur Laufzeit eine Personensuche. Sie steht
//    bewusst NIE im geteilten Katalog (CLAUDE.md §4.2) und gehoert damit zu keinem Paket."
//   — lib/helmut/quellenarchitektur/paket-inventur.js §3.8
//
// DER VERTRAG DIESES MODULS in einem Satz:
//
//   Aus n Profilen entsteht die MENGE der tatsaechlich verschiedenen Abrufdefinitionen —
//   nicht die Summe der Profilplaene.
//
// Der entscheidende Unterschied zum Bestandspfad: `cron-globalphase.planGlobaleQuellen`
// dedupliziert ueber `source.id`, und die Kennung ENTHAELT die Mandats-ID
// (`<mandats-id>-news-fraktion-partei`). Zwei Mandate derselben Fraktion mit denselben Themen
// erzeugen dort zwei Kennungen und damit zwei Plaeneintraege — nur der prozessweite
// `sharedFetchLedger` verhindert den doppelten HTTP-Abruf, und auch nur innerhalb eines
// Prozesses und eines 15-Minuten-Fensters. Hier wird stattdessen ueber die NORMALISIERTE
// ABRUFDEFINITION dedupliziert; die Mandats-ID ist gar nicht Teil des Schluessels, ausser der
// Auftrag ist wirklich persoenlich.
//
// WAS DIESES MODUL NICHT TUT (ausdruecklich):
//   - Es baut KEINE Quellen selbst. Die Definitionen kommen unveraendert aus
//     `scheduler.personNewsSource` und `scheduler.mandateNewsSources` — dieselben Funktionen,
//     dieselben Abfragen, dieselben URLs. Es wird nichts nachgebaut und nichts umformuliert.
//   - Es fuehrt KEINEN Abruf aus. Es plant nur.
//   - Es kennt KEINE Mandantendaten ausser dem, was das Profil ohnehin traegt.
//   - Es fasst NIE zwei Personensuchen zusammen (§7.4 des Auftrags) — der Riegel dafuer ist
//     strukturell, nicht per Konvention: bei `type === "person"` geht die Mandatskennung in den
//     Schluessel ein, und ausserdem enthaelt die Abruf-URL bereits den Namen.

const crypto = require("crypto");

// --- Aktualitaetsfenster ----------------------------------------------------------------------

// Fensterbreiten, alle konfigurierbar (Auftrag §7.7).
//   GETEILT  — geteilte Suchen und globale Quellen: mehrmals taeglich zulaessig.
//   PERSON   — persoenliche AKTUELL-Suche: hoechstens einmal je 24 h (Auftrag §7.5).
//   ARCHIV   — persoenliche ARCHIV-Suche (`when:3m`): hoechstens einmal je 7 Tagen (§7.6).
function fensterKonfig(env = process.env) {
  const zahl = (roh, standard, minimum) => {
    const s = String(roh ?? "").trim();
    if (s === "") return standard;
    const n = Number(s);
    // Fail closed: ein gesetzter, aber unbrauchbarer Wert faellt auf den konservativen
    // Standard zurueck — nie auf "unbegrenzt haeufig".
    return Number.isFinite(n) && n >= minimum ? Math.floor(n) : standard;
  };
  return {
    geteiltStundenFenster: zahl(env.HELMUT_DEMAND_SHARED_WINDOW_H, 8, 1),
    personStundenFenster: zahl(env.HELMUT_DEMAND_PERSON_WINDOW_H, 24, 1),
    archivStundenFenster: zahl(env.HELMUT_DEMAND_ARCHIVE_WINDOW_H, 24 * 7, 24),
    // Obergrenze der Mandatsaktualitaet. Der Compiler garantiert, dass jedes Profil in
    // JEDEM Fenster dieser Breite mindestens einmal vollstaendig geplant wird (§7.9).
    mandatMaxAlterStunden: zahl(env.HELMUT_DEMAND_TENANT_MAX_AGE_H, 24, 1)
  };
}

// Fensterkennung: der Beginn des Fensters, in dem `jetzt` liegt, als ISO-Stunde.
// Deterministisch und zeitzonenfrei (UTC), damit derselbe Zeitpunkt ueberall dieselbe
// Kennung ergibt — der Idempotenzschluessel darf nicht von der Serverzeitzone abhaengen.
function fensterKennung(jetztMs, breiteStunden) {
  const breiteMs = Math.max(1, Number(breiteStunden) || 1) * 3600 * 1000;
  const start = Math.floor(Number(jetztMs) / breiteMs) * breiteMs;
  return new Date(start).toISOString().slice(0, 13) + "Z"; // z. B. 2026-08-08T00Z
}

// --- Normalisierung der Abrufdefinition -------------------------------------------------------

// Die Abrufdefinition ist das, was den Abruf TATSAECHLICH bestimmt: die Feed-URLs.
// Alles andere (Anzeigename, Prioritaet, Kategorie, Kennung) ist Beiwerk und darf NICHT in die
// Gleichheit eingehen — sonst waeren zwei identische Suchen zweier Mandate wieder verschieden,
// nur weil ihre Kennung die Mandats-ID traegt. Genau das ist der Bestandsfehler.
function abrufwege(quelle = {}) {
  const roh = [
    ...(Array.isArray(quelle.rssUrls) ? quelle.rssUrls : []),
    quelle.rssUrl,
    // `url` nur, wenn es keine Feed-URLs gibt (HTML-/amtliche Quellen).
    (Array.isArray(quelle.rssUrls) && quelle.rssUrls.length) || quelle.rssUrl ? null : quelle.url
  ];
  return [...new Set(roh.map((u) => String(u || "").trim()).filter(Boolean))].sort();
}

// Kanonische Form einer URL fuer den Gleichheitsvergleich. Bewusst KONSERVATIV:
// - Host kleingeschrieben, Standardport entfernt,
// - Abfrageparameter sortiert (news.google.com liefert bei gleicher Suche dieselben Parameter
//   in wechselnder Reihenfolge, wenn sie aus verschiedenen Codepfaden gebaut werden),
// - NICHTS wird entfernt oder umgeschrieben. Ein `hl`/`gl`/`ceid` bleibt Teil der Identitaet,
//   denn es veraendert das Ergebnis. Lieber eine Dublette zu wenig zusammengefasst als eine
//   falsche Zusammenfassung.
function kanonischeUrl(roh) {
  const s = String(roh || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    u.hostname = u.hostname.toLowerCase();
    if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) u.port = "";
    const paare = [...u.searchParams.entries()].sort((a, b) =>
      a[0] === b[0] ? String(a[1]).localeCompare(String(b[1])) : a[0].localeCompare(b[0]));
    u.search = "";
    for (const [k, v] of paare) u.searchParams.append(k, v);
    u.hash = "";
    return u.toString();
  } catch (_) {
    return s; // unparsebar -> woertlich vergleichen, nie raten
  }
}

function hash(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex").slice(0, 32);
}

// Ist diese Quelle eine PERSOENLICHE Suche? Zwei unabhaengige Merkmale, beide muessen
// falsch sein, damit geteilt wird — fail closed in Richtung "nicht zusammenfassen".
//   1. `type === "person"` (so kennzeichnet `scheduler.personNewsSource` seine Quelle),
//   2. `category === "profil"` (dieselbe Funktion setzt beides).
function istPersoenlich(quelle = {}) {
  return quelle.type === "person" || quelle.category === "profil";
}

// Ist dieser Abrufweg die ARCHIV-Variante einer Personensuche? `personNewsSource` haengt an
// den zweiten Feed woertlich `when:3m` an (scheduler.js: `${query} when:3m`).
function istArchivweg(url) {
  return /when%3A3m|when:3m/i.test(String(url || ""));
}

// --- Der Compiler -----------------------------------------------------------------------------

// Eingabe: Profile + eine Funktion, die je Profil den heutigen Quellenplan liefert
// (im Betrieb `scheduler.getSourcesForProfile`, in Tests eine Attrappe).
// Ausgabe: die MENGE der Abrufauftraege, jeder mit deterministischem Idempotenzschluessel.
//
// KEINE HARTE MANDATSGRENZE (Auftrag §7.12): es gibt hier kein `slice`, kein MAX_LAUF_MANDATE
// und keine Obergrenze. Alle uebergebenen Profile werden verarbeitet.
async function kompiliereQuellenbedarf({
  profile = [],
  quellenFuerProfil,
  jetztMs = Date.now(),
  env = process.env,
  // OP-30/O1: die ROTATIONSREIHENFOLGE des Tages (Liste von Mandatskennungen). Sie entscheidet
  // NICHT, WER geplant wird — sie entscheidet, WER ZUERST faellig wird. Siehe `rangKarte`.
  rotation = null
} = {}) {
  if (typeof quellenFuerProfil !== "function") {
    throw new Error("kompiliereQuellenbedarf: quellenFuerProfil ist Pflicht");
  }
  const konfig = fensterKonfig(env);
  const rang = rangKarte(rotation);
  const auftraege = new Map();      // idempotencyKey -> Auftrag
  const fehlerhafteProfile = [];
  const statistik = {
    profile: 0,
    profilePlaene: 0,
    quellenGesehen: 0,
    geteilteAuftraege: 0,
    persoenlicheAuftraege: 0,
    archivAuftraege: 0,
    zusammengefasst: 0            // wie viele Profilquellen auf einen bestehenden Auftrag fielen
  };

  for (const profil of Array.isArray(profile) ? profile : []) {
    const mandatsId = String((profil && profil.id) || "").trim();
    if (!mandatsId) { fehlerhafteProfile.push({ mandatsId: null, fehler: "profil-ohne-id" }); continue; }
    statistik.profile += 1;

    let quellen;
    try {
      quellen = await quellenFuerProfil(profil);
    } catch (error) {
      // Fehlerisolation wie im Bestandspfad: ein kaputtes Profil kostet nie die Versorgung
      // der uebrigen (scheduler.js runGlobaleErfassung, Schritt 2).
      fehlerhafteProfile.push({ mandatsId, fehler: String((error && error.message) || "unbekannt").slice(0, 200) });
      continue;
    }
    if (!Array.isArray(quellen)) { fehlerhafteProfile.push({ mandatsId, fehler: "quellenplan-kein-array" }); continue; }
    statistik.profilePlaene += 1;

    for (const quelle of quellen) {
      statistik.quellenGesehen += 1;
      const wege = abrufwege(quelle);
      if (!wege.length) continue;   // ohne Abrufweg nicht planbar

      const persoenlich = istPersoenlich(quelle);

      if (persoenlich) {
        // PERSOENLICH: je Feed-URL ein eigener Auftrag, damit Aktuell- und Archivsuche
        // GETRENNTE Fenster bekommen (§7.5/§7.6). Sie werden NIE mit einer fremden
        // Personensuche zusammengefasst — die Mandatskennung ist Teil des Schluessels.
        for (const weg of wege) {
          const archiv = istArchivweg(weg);
          const breite = archiv ? konfig.archivStundenFenster : konfig.personStundenFenster;
          const fenster = fensterKennung(jetztMs, breite);
          const schluessel = `source_fetch|person|${mandatsId}|${hash(kanonischeUrl(weg))}|${fenster}`;
          if (auftraege.has(schluessel)) { statistik.zusammengefasst += 1; continue; }
          auftraege.set(schluessel, {
            jobType: "source_fetch",
            idempotencyKey: schluessel,
            freshnessWindow: fenster,
            // Persoenliche Arbeit -> Mandatsbezug wird gesetzt (und NUR hier).
            tenantId: mandatsId,
            priority: archiv ? 300 : 60,   // Archiv ist Hintergrundarbeit, Aktuell ist wichtig
            maxAttempts: 5,
            dueAt: null,                   // wird unten deterministisch gestreut
            payload: {
              art: archiv ? "person-archiv" : "person-aktuell",
              quelle: quellenNutzlast(quelle, [weg])
            },
            _streuSchluessel: `${mandatsId}|${archiv ? "archiv" : "aktuell"}`,
            _fensterBreiteStunden: breite,
            // Mandatsbezogen -> die Faelligkeit folgt dem Rotationsrang des Tages, nicht einem
            // tagesunabhaengigen Streuwert (O1). Ohne Rotation bleibt `null` und der bisherige
            // Streuwert entscheidet — verhaltensgleich zu vorher.
            _rang: rang.rangVon(mandatsId)
          });
          if (archiv) statistik.archivAuftraege += 1; else statistik.persoenlicheAuftraege += 1;
        }
        continue;
      }

      // GETEILT: der Schluessel entsteht AUSSCHLIESSLICH aus der normalisierten
      // Abrufdefinition. Keine Mandatskennung. Zwei Mandate mit identischer Fraktions-,
      // Ausschuss-, Regional- oder Themensuche erzeugen damit EINEN Auftrag (§7.2/§7.3).
      const definition = wege.map(kanonischeUrl).join("\n");
      const breite = konfig.geteiltStundenFenster;
      const fenster = fensterKennung(jetztMs, breite);
      const schluessel = `source_fetch|geteilt|${hash(definition)}|${fenster}`;
      const vorhanden = auftraege.get(schluessel);
      if (vorhanden) {
        statistik.zusammengefasst += 1;
        // Herkunft mitschreiben (Auditierbarkeit): welche Mandate haben diesen Weg
        // angefordert? Gedeckelt, damit der Payload bei 1000 Profilen nicht explodiert —
        // die ZAHL bleibt exakt, nur die Namensliste ist gekappt.
        vorhanden.payload.angefordertVon += 1;
        if (vorhanden.payload.beispielMandate.length < 5) vorhanden.payload.beispielMandate.push(mandatsId);
        continue;
      }
      auftraege.set(schluessel, {
        jobType: "source_fetch",
        idempotencyKey: schluessel,
        freshnessWindow: fenster,
        // GETEILTE Arbeit gehoert KEINEM Mandat (CLAUDE.md §4.2).
        tenantId: null,
        priority: 100,
        maxAttempts: 5,
        dueAt: null,
        payload: {
          art: "geteilt",
          quelle: quellenNutzlast(quelle, wege),
          angefordertVon: 1,
          beispielMandate: [mandatsId]
        },
        _streuSchluessel: schluessel,
        _fensterBreiteStunden: breite
      });
      statistik.geteilteAuftraege += 1;
    }
  }

  // FAELLIGKEITEN DETERMINISTISCH STREUEN (§7.8): ohne Streuung wuerden bei 1 000 Profilen
  // alle Auftraege exakt gleichzeitig faellig — der Worker haette eine Spitze und danach
  // Leerlauf, und Google saehe eine Welle. Der Versatz ist eine reine Funktion des
  // Streuschluessels, also ueber Laeufe hinweg STABIL (kein Zufall, keine Uhr).
  //
  // Der Versatz bleibt strikt INNERHALB des eigenen Fensters. Damit gilt die Zusage aus
  // §7.9 automatisch: ein Auftrag mit 24-h-Fenster wird spaetestens nach 24 h faellig, ein
  // Profil bleibt also nie laenger als sein Fenster ohne Aktualisierung.
  const liste = [...auftraege.values()];
  for (const auftrag of liste) {
    const breiteMs = auftrag._fensterBreiteStunden * 3600 * 1000;
    const fensterStartMs = Date.parse(auftrag.freshnessWindow.replace(/Z$/, ":00:00.000Z"));
    // Streubereich: die ersten 90 % des Fensters. Die letzten 10 % bleiben Reserve, damit ein
    // Auftrag auch bei voller Streuung noch im selben Fenster bearbeitet werden kann.
    const spanne = Math.max(1, Math.floor(breiteMs * 0.9));
    const versatzMs = auftrag._rang == null
      ? (streuwert(auftrag._streuSchluessel) % spanne)
      : rangVersatz(auftrag._rang, rang.anzahl, spanne);
    const faellig = fensterStartMs + versatzMs;
    // Nie in der Vergangenheit VOR dem Fensterstart und nie kuenstlich in der Zukunft, wenn
    // das Fenster schon laeuft: ein bereits faelliger Auftrag bleibt sofort faellig.
    auftrag.dueAt = new Date(Math.max(fensterStartMs, faellig)).toISOString();
    delete auftrag._streuSchluessel;
    delete auftrag._fensterBreiteStunden;
    delete auftrag._rang;
  }

  return {
    auftraege: liste,
    statistik: {
      ...statistik,
      auftraegeGesamt: liste.length,
      // Die Kennzahl, um die es geht: wie viele Profilquellen fielen auf wie viele Auftraege?
      verdichtung: statistik.quellenGesehen > 0
        ? Math.round((statistik.quellenGesehen / Math.max(1, liste.length)) * 100) / 100
        : 0
    },
    fehlerhafteProfile,
    konfig
  };
}

// Gleichverteilter, stabiler Streuwert aus einem Schluessel (kein Math.random — der Plan muss
// bei gleichem Eingang identisch sein, sonst waere er nicht idempotent).
function streuwert(schluessel) {
  const h = crypto.createHash("sha256").update(String(schluessel), "utf8").digest();
  return h.readUInt32BE(0);
}

// Was vom Quellenobjekt in den Auftrag wandert. BEWUSST SPARSAM (Auftrag §6, letzter Absatz):
// keine Geheimnisse, keine vollstaendigen externen Antworten, keine Profilkopien. Nur das,
// was der Worker braucht, um `crawlAllSources` mit exakt derselben Quelle aufzurufen.
// Aus welchem ANBIETER kommt ein Abrufweg? Rein aus dem Host abgeleitet, ohne Liste und ohne
// Sonderfall: `news.google.com` -> `google-news`, alles andere -> der Host selbst.
//
// WARUM DAS HIER STEHT: heute laufen 100 % der profileigenen Abrufe ueber einen einzigen
// Anbieter (gemessen, skalierung-1000-test.js §15). Solange der Auftrag das nicht BENENNT,
// ist ein Ausfall dieses Anbieters weder messbar noch gezielt abschaltbar — man saehe nur,
// dass "Abrufe scheitern". Das Feld aendert KEIN Verhalten; es macht die Abhaengigkeit
// sichtbar und einen spaeteren Anbieterwechsel ueberhaupt erst umsetzbar.
function anbieterVonWeg(weg) {
  try {
    const host = new URL(String(weg)).host.toLowerCase().replace(/^www\./, "");
    if (host === "news.google.com") return "google-news";
    return host || "unbekannt";
  } catch (_) { return "unbekannt"; }
}

function anbieterVonWegen(wege = []) {
  const gefunden = [...new Set((wege || []).map(anbieterVonWeg))];
  return gefunden.length === 1 ? gefunden[0] : (gefunden.length ? "gemischt" : "unbekannt");
}

function quellenNutzlast(quelle = {}, wege = []) {
  return {
    // Anbieterkennzeichnung (additiv, verhaltensneutral): macht die Abhaengigkeit messbar.
    anbieter: anbieterVonWegen(wege.length ? wege : [quelle.rssUrl || quelle.url].filter(Boolean)),
    id: quelle.id,
    name: quelle.name,
    type: quelle.type,
    category: quelle.category,
    crawlMethod: quelle.crawlMethod || "rss",
    priority: quelle.priority,
    maxItems: quelle.maxItems,
    active: true,
    url: quelle.url,
    rssUrl: wege[0] || quelle.rssUrl,
    rssUrls: wege
  };
}

// --- Rotationsrang (OP-30, Befund O1) ---------------------------------------------------------
//
// DAS PROBLEM, DAS DAS LOEST — und es war real, nicht theoretisch.
// Bis hierher entstand die Faelligkeit mandatsbezogener Auftraege aus
// `streuwert("<typ>|<mandatsId>")`. Dieser Wert ist ein SHA-256 der Mandatskennung und damit
// ueber alle Tage hinweg IDENTISCH. Zusammen mit der Anspruchsordnung der Warteschlange
// (`order by priority asc, due_at asc, created_at asc`, Migration 20260808_scalable_job_queue)
// bedeutet das: innerhalb eines Auftragstyps stehen JEDEN TAG DIESELBEN Mandate vorn und
// dieselben hinten. Reicht das Zeitbudget eines Slots nicht fuer alle, faellt immer dieselbe
// Gruppe hinten herunter — und zwar jeden Tag. Genau das ist das Verhungern, das
// `llm-budget-fair` verhindern soll und das der Abschlussreview als O1 benannt hat
// ("Mandantenanteil und faire Rotation sind im Produktionspfad unbenutzt").
//
// DIE KORREKTUR IST EINE REIHENFOLGE, KEINE AUSWAHL. Es wird weiterhin JEDES aktive Mandat
// geplant — es gibt kein `slice`, keine Obergrenze, kein Weglassen (Auftrag §7.12). Nur die
// Verteilung der Faelligkeiten INNERHALB des ohnehin vorhandenen Streubereichs folgt jetzt dem
// Rotationsrang des Tages (`llm-budget-fair.rotationsReihenfolge`), der mit dem Tag wandert.
// Damit ist die Zusage "kein Mandat verhungert dauerhaft" nachrechenbar statt gehofft.
function rangKarte(rotation) {
  const liste = Array.isArray(rotation)
    ? [...new Set(rotation.map((m) => String(m || "").trim()).filter(Boolean))]
    : [];
  const karte = new Map(liste.map((m, i) => [m, i]));
  return {
    anzahl: liste.length,
    rangVon: (mandatsId) => (karte.has(mandatsId) ? karte.get(mandatsId) : null)
  };
}

// Rang -> Versatz im Streubereich. Gleichverteilt und in Rangreihenfolge: Rang 0 ist zuerst
// faellig, Rang n-1 zuletzt. Der Streubereich bleibt derselbe wie vorher (90 % des Fensters),
// es wird also weder frueher noch spaeter geplant als bisher — nur die ZUORDNUNG der Plaetze
// wandert taeglich.
function rangVersatz(rang, anzahl, spanne) {
  const n = Math.max(1, Number(anzahl) || 1);
  const r = Math.max(0, Math.min(n - 1, Number(rang) || 0));
  return Math.floor((spanne * r) / n);
}

// --- Mandatsbezogene Folgearbeit --------------------------------------------------------------

// Projektion und Briefingmaterialisierung sind je Mandat, aber KI-frei (V3-Vertrag §13.3/§13.4).
// Sie werden je Mandat und Aktualitaetsfenster genau einmal geplant.
function planeMandatsarbeit({ profile = [], jetztMs = Date.now(), env = process.env, rotation = null,
  // FUENFTER AUFTRAGSTYP (E1, 2026-08-09): DEFAULT AUS. Ohne ausdrueckliche Zusage ist der
  // Plan byte-gleich zu vorher — der Aufrufer (`scalable-pipeline.planeArbeit`) setzt ihn
  // ausschliesslich aus `narrativUeberWarteschlange` (beide Flags an).
  narrativAktiv = false } = {}) {
  const konfig = fensterKonfig(env);
  const rang = rangKarte(rotation);
  const fenster = fensterKennung(jetztMs, konfig.mandatMaxAlterStunden);
  const breiteMs = konfig.mandatMaxAlterStunden * 3600 * 1000;
  const fensterStartMs = Date.parse(fenster.replace(/Z$/, ":00:00.000Z"));
  const auftraege = [];
  // ── Phasenfenster des Lage-Narrativs (tenant_narrative) ────────────────────────────────
  // ABGELEITET, NICHT ERFUNDEN (Auftrag §9): der bestehende Produktvertrag ist der Cron-Slot
  // `lage-briefing` um 05:45 UTC (`vercel.json`, "45 5 * * *") — nach crawl 04:00 und
  // understanding 05:30. 05:45 UTC sind 23,96 % des 24-h-UTC-Fensters; das Phasenfenster
  // beginnt deshalb bei 24 %. Es endet bei 33,3 % (= 08:00 UTC): dort beginnt das ZWEITE
  // geteilte 8-h-Abruffenster des Tages, und ein Narrativ, das danach faellig wuerde, muesste
  // per Vorbedingung auf Abrufe warten, die bis 15:12 gestreut sind — die Morgenlage laege
  // dann am Nachmittag. Innerhalb [24 %, 33,3 %) wartet es nur auf die Morgenabrufe (00Z),
  // exakt die Eingangsbasis des bisherigen 05:45-Laufs.
  // Prioritaet 240: nach der Projektion (200), vor der Briefingmaterialisierung (250) —
  // das Narrativ ist der sichtbare Morgenteil des Produkts.
  const NARRATIV_PHASE = ["tenant_narrative", 240, 0.24, 1 / 3];
  for (const profil of Array.isArray(profile) ? profile : []) {
    const mandatsId = String((profil && profil.id) || "").trim();
    if (!mandatsId) continue;
    // PHASENFENSTER statt Gleichverteilung. Belegter Anlass (2026-08-08, lokaler
    // 1000-Profil-Durchlauf): bei gleichmaessiger Streuung ueber das ganze Fenster lag die
    // Briefingmaterialisierung von 37 der 1000 Mandate ZEITLICH VOR ihren eigenen Abrufen.
    // Ergebnis war ein ehrlicher, aber unnoetiger Leerzustand. Die Reihenfolge
    // Abruf -> Projektion -> Briefing wird deshalb ueber die Faelligkeit erzwungen:
    //   Projektion  ab 50 % des Fensters, Briefing ab 75 %.
    // Innerhalb ihres Abschnitts bleibt die Streuung deterministisch (kein Math.random),
    // damit die Planung idempotent bleibt und die Last nicht auf eine Minute faellt.
    //
    // ZWEITE KORREKTUR (2026-08-08, Korrektursprint): das Briefingfenster reichte bis 98 %
    // des Tages. Der letzte Briefingauftrag wurde damit erst bei 23:28 FAELLIG — und musste
    // danach noch seine Vorbedingungen pruefen und laufen. Gemessen im 200-Mandate-Lauf:
    // Faelligkeit des letzten Briefings 23,47 h, Abschluss der Pflichtarbeit erst jenseits
    // von 24:00. Das war die tatsaechliche Ursache der frueheren "25 Stunden" — KEIN
    // Kapazitaets-, Budget-, Parallelitaets- oder Wiederholungsbefund, sondern eine
    // Faelligkeit, die keinen Raum mehr fuer die Arbeit selbst liess.
    //
    // Ein Fenster muss Platz fuer das lassen, was darin passieren soll. Die Obergrenze ist
    // deshalb 90 %: der letzte Briefingauftrag ist bei 21:36 faellig und hat gut zwei Stunden
    // fuer Vorbedingungspruefung, Zurueckstellungen (je 2 Minuten) und Ausfuehrung.
    // Die REIHENFOLGE bleibt unveraendert — Briefing beginnt weiterhin genau dort, wo die
    // Projektion endet (75 %). Es wird keine Arbeit uebersprungen und kein Tag verlaengert.
    for (const [typ, prio, ab, bis] of [
      ...(narrativAktiv ? [NARRATIV_PHASE] : []),
      ["mandate_projection", 200, 0.50, 0.75],
      ["briefing_materialization", 250, 0.75, 0.90]
    ]) {
      const abMs = Math.floor(breiteMs * ab);
      const spanne = Math.max(1, Math.floor(breiteMs * (bis - ab)));
      // O1: der Platz im Phasenfenster folgt dem Rotationsrang des Tages. Ohne uebergebene
      // Rotation bleibt es beim bisherigen, tagesunabhaengigen Streuwert — der Aufrufer
      // entscheidet, und bestehende Aufrufer verhalten sich unveraendert.
      const rangDesMandats = rang.rangVon(mandatsId);
      const versatz = abMs + (rangDesMandats == null
        ? (streuwert(`${typ}|${mandatsId}`) % spanne)
        : rangVersatz(rangDesMandats, rang.anzahl, spanne));
      auftraege.push({
        jobType: typ,
        idempotencyKey: `${typ}|${mandatsId}|${fenster}`,
        freshnessWindow: fenster,
        tenantId: mandatsId,
        priority: prio,
        maxAttempts: 5,
        dueAt: new Date(fensterStartMs + versatz).toISOString(),
        payload: { mandatsId }
      });
    }
  }
  return { auftraege, fenster, konfig };
}

module.exports = {
  kompiliereQuellenbedarf,
  planeMandatsarbeit,
  // exportiert fuer Vertragstests:
  fensterKonfig,
  fensterKennung,
  kanonischeUrl,
  abrufwege,
  istPersoenlich,
  istArchivweg,
  streuwert,
  anbieterVonWeg,
  anbieterVonWegen,
  // OP-30/O1 — Rotationsrang, exportiert fuer Vertragstests:
  rangKarte,
  rangVersatz
};
