"use strict";

// Helmut — SKALIERBARER PFAD (OP-30): Scheduler und Worker ueber der Arbeitswarteschlange.
// =============================================================================================
// FLAGGRENZE — das Erste, was hier steht, weil es das Wichtigste ist:
//
//   `HELMUT_SCALABLE_PIPELINE` ist DEFAULT AUS und fail closed. Ohne ausdrueckliches `on`
//   wird von hier NICHTS aufgerufen. Der bestehende Cron-Pfad (`cronSchwererPfad` ->
//   `runCronForTenants` bzw. `runCronMitGlobalerPhase`) bleibt byte-gleich unberuehrt.
//   Es gibt in diesem Modul keinen Codepfad, der ohne gesetztes Flag externe Arbeit
//   ausloest — auch keinen Schattenlauf, auch keine Messung.
//
// KEINE DOPPELTE EXTERNE ARBEIT (Auftrag §13.4): der Riegel dafuer ist strukturell und nicht
// eine Absprache. `waehleVerarbeitungspfad()` liefert GENAU EINEN Pfad. Ist das Flag an, gibt
// es fuer die schweren Crons nur noch den Warteschlangenpfad; ist es aus, nur den bisherigen.
// Es existiert keine Konstellation, in der beide dieselbe Quelle abrufen.
//
// WAS DIESES MODUL BEWUSST NICHT TUT:
//   - Es schreibt KEINE V3-Funktion um. Handler rufen die unveraenderten Produktionsfunktionen
//     auf (`crawlAllSources`, `saveRawItems`, `persistRawDocumentsShadow`,
//     `runUnderstandingShadow`, `runMatchingShadow`, `runDecisionShadow`, `buildV3Briefing`).
//     Wo eine Bestandsfunktion nicht sicher wiederverwendbar ist, wird der Handler ehrlich als
//     `nicht-implementiert` gemeldet statt eine zweite Fachlogik zu bauen (Auftrag §6).
//   - Es aendert KEINE Cron-Zeit, KEIN Zeitbudget, KEIN Flag, KEINE Env.
//   - Es fuehrt KEINEN eigenen KI-Aufruf. Verstehen laeuft ueber den unveraenderten
//     V3-Pfad und damit ueber dessen unveraenderten globalen Deckel.

const crypto = require("crypto");

// --- Flaggrenze -------------------------------------------------------------------------------

// Fail closed, exakt wie `vorgangskontext.kontextpfadEnabled`: nur eine ausdrueckliche Zusage
// schaltet ein; jeder andere Wert — leer, `off`, Tippfehler — bedeutet AUS.
function skalierbarerPfadAktiv(env = process.env) {
  const roh = String((env && env.HELMUT_SCALABLE_PIPELINE) || "").trim().toLowerCase();
  return roh === "on" || roh === "true" || roh === "1" || roh === "an";
}

// Genau EIN Pfad. Der Aufrufer bekommt eine Entscheidung, keine Menge.
function waehleVerarbeitungspfad(env = process.env) {
  return skalierbarerPfadAktiv(env)
    ? { pfad: "warteschlange", grund: "HELMUT_SCALABLE_PIPELINE" }
    : { pfad: "bestand", grund: "flag-aus" };
}

// --- Fehlerbereinigung ------------------------------------------------------------------------

// Was in `last_error` landen darf. Der Auftrag verlangt: keine Geheimnisse, keine
// vollstaendigen externen Antworten, keine unnoetigen personenbezogenen Inhalte.
// Vorgehen: erst maskieren, dann kappen. Die Reihenfolge ist wichtig — ein gekappter
// Token waere immer noch ein Teiltoken.
const GEHEIMNIS_MUSTER = [
  // Bearer-/Basic-Token, JWTs, API-Keys, Supabase-/OpenAI-Schluessel, Query-Secrets
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bBasic\s+[A-Za-z0-9+/=]{8,}/gi,
  /\beyJ[A-Za-z0-9._-]{20,}/g,                       // JWT
  /\bsk-[A-Za-z0-9_-]{16,}/g,                        // OpenAI-artig
  /\bsb[a-z]*_[A-Za-z0-9_-]{16,}/gi,                 // Supabase-artig
  // BELEGTER FEHLER (gefunden von jobqueue-sicherheit-test.js 8.1): die erste Fassung
  // verlangte den Parameternamen EXAKT — `?key=` wurde maskiert, `?service_key=` nicht.
  // Genau die zusammengesetzten Namen sind aber die haeufigen (`service_key`, `apikey`,
  // `access_token`, `anon_key`). Deshalb ist jetzt ein beliebiges Wortpraefix erlaubt.
  /([?&][\w.-]*(?:secret|token|key|password|passwd|pwd|signature|credential)=)[^&\s"']+/gi,
  /("?[\w.-]*(?:secret|token|key|password|authorization|credential)"?\s*[:=]\s*"?)[^\s",}]{6,}/gi
];

function bereinigeFehler(roh, maxLaenge = 300) {
  let text = roh instanceof Error ? String(roh.message || roh) : String(roh == null ? "" : roh);
  if (!text) return null;
  for (const muster of GEHEIMNIS_MUSTER) {
    // ACHTUNG (belegter Fehler, beim ersten Smoke-Test gefunden): bei einem Muster OHNE
    // Fanggruppe ist das zweite Callback-Argument der OFFSET (eine Zahl), nicht die Gruppe.
    // Ein blosses `praefix ? …` haette die Trefferstelle in den Text geschrieben
    // ("13<entfernt>"). Deshalb wird ausdruecklich auf `string` geprueft.
    text = text.replace(muster, (treffer, praefix) =>
      (typeof praefix === "string" ? `${praefix}<entfernt>` : "<entfernt>"));
  }
  // Absolute URLs mit Zugangsdaten im Autoritaetsteil.
  text = text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, "$1<entfernt>@");
  // Mehrzeilige Stacktraces auf die erste Zeile reduzieren: der Rest ist Dateisystempfad-Rauschen.
  text = text.split("\n")[0].trim();
  return text.length > maxLaenge ? `${text.slice(0, maxLaenge)}…` : text;
}

// Vorübergehend oder endgueltig? Vorübergehende Fehler bekommen Backoff, endgueltige nicht.
// Konservativ: im Zweifel VORUEBERGEHEND, damit ein unbekannter Fehler nicht sofort einen
// Auftrag verbrennt. Die Versuchsobergrenze faengt den Dauerfall ohnehin ab.
function istEndgueltig(fehlertext) {
  return /unbekannter-aufgabentyp|payload-ungueltig|nicht-implementiert|profil-nicht-gefunden/i
    .test(String(fehlertext || ""));
}

// Exponentieller Backoff mit stabiler Streuung (kein Math.random: der Test muss ihn
// nachrechnen koennen). Streuung aus der Auftrags-ID — verhindert, dass 1000 gleichzeitig
// gescheiterte Auftraege synchron wiederkommen.
function backoffMs(versuche, auftragsId, { basisMs = 30000, deckelMs = 30 * 60 * 1000 } = {}) {
  const n = Math.max(1, Number(versuche) || 1);
  const roh = Math.min(deckelMs, basisMs * Math.pow(2, n - 1));
  const streu = crypto.createHash("sha256").update(String(auftragsId || "x"), "utf8").digest().readUInt32BE(0);
  // Halb fest, halb gestreut (dasselbe Muster wie google-news-hardening.computeRetryDelayMs).
  return Math.floor(roh / 2 + (streu % Math.max(1, Math.floor(roh / 2))));
}

// Zeitgrenze EINES Auftrags. Ohne sie kann der Worker sein Laufzeitbudget nicht halten:
// `crawlAllSources` hat je EINZELNER Anfrage ein Timeout (`CRAWLER_TIMEOUT_MS`), aber KEINE
// Gesamtgrenze — belegt in docs/betrieb/vorgangskontext.md §7.6 (Befund F-REQ: einzelne
// Production-Quellen liefen 41 892 ms bei 7 000 ms Anfragelimit und `retry_count = 0`, weil
// eine Google-Quelle eine Kette von 37–98 Anfragen ausloest). Ein einziger haengender Auftrag
// wuerde sonst den ganzen Slot verbrauchen.
//
// EHRLICHE GRENZE, ausdruecklich: `Promise.race` BEENDET die urspruengliche Promise nicht
// (dieselbe Einschraenkung wie beim aeusseren Cron-Zeitlimit, R-6). Der Auftrag laeuft im
// Hintergrund weiter; der Worker gibt ihn aber NICHT als erledigt aus, sondern als
// voruebergehend gescheitert — die Lease laeuft aus und der Auftrag kehrt zurueck.
const AUFTRAG_MAX_MS = Math.max(5000, Number(process.env.HELMUT_JOB_TIMEOUT_MS) || 120000);

function mitZeitgrenze(promise, maxMs, kennung) {
  let zeiger = null;
  const wecker = new Promise((_, ablehnen) => {
    zeiger = setTimeout(() => ablehnen(new Error(`auftrag-zeitlimit (${kennung}, ${maxMs} ms)`)), maxMs);
  });
  return Promise.race([promise, wecker]).finally(() => { if (zeiger) clearTimeout(zeiger); });
}

// --- Scheduler --------------------------------------------------------------------------------

// Der Scheduler PLANT nur. Er fuehrt keinen schweren externen Abruf aus (Auftrag §8) und
// gibt ehrliche Zaehler zurueck.
async function planeArbeit({
  deps = {},
  jetztMs = Date.now(),
  env = process.env
} = {}) {
  if (!skalierbarerPfadAktiv(env)) {
    return { uebersprungen: true, grund: "flag-aus", geplant: 0, neu: 0, vorhanden: 0 };
  }
  const sourceDemand = deps.sourceDemand || require("./source-demand");
  const listFullProfiles = deps.listFullProfiles || (() => require("./storage").listFullProfiles());
  const quellenFuerProfil = deps.quellenFuerProfil || ((p) => require("./scheduler").getSourcesForProfile(p));
  const enqueue = deps.enqueue || ((a) => require("./storage").jobQueueEnqueue(a));

  const alleProfile = await listFullProfiles();
  // AKTIVE Profile. KEINE Obergrenze, kein `slice` (Auftrag §7.12): wer aktiv ist, wird geplant.
  const profile = (Array.isArray(alleProfile) ? alleProfile : []).filter((p) => p && p.id && p.disabled !== true);

  const bedarf = await sourceDemand.kompiliereQuellenbedarf({ profile, quellenFuerProfil, jetztMs, env });
  const mandatsarbeit = sourceDemand.planeMandatsarbeit({ profile, jetztMs, env });
  const alle = [...bedarf.auftraege, ...mandatsarbeit.auftraege];

  let neu = 0;
  let vorhanden = 0;
  let nichtEingereiht = 0;
  const gruende = new Set();
  for (const auftrag of alle) {
    const ergebnis = await enqueue(auftrag);
    if (!ergebnis || ergebnis.verfuegbar === false) {
      nichtEingereiht += 1;
      if (ergebnis && ergebnis.grund) gruende.add(String(ergebnis.grund));
      continue;
    }
    if (ergebnis.neu) neu += 1; else vorhanden += 1;
  }

  return {
    uebersprungen: false,
    profile: profile.length,
    geplant: alle.length,
    neu,
    vorhanden,
    // EHRLICH: was nicht eingereiht werden konnte, wird benannt — nicht verschwiegen
    // (CLAUDE.md §4.4). Ein Scheduler, der 7000 Auftraege plant und 7000 stillschweigend
    // verliert, wuerde sonst wie ein erfolgreicher Lauf aussehen.
    nichtEingereiht,
    gruende: [...gruende],
    ok: nichtEingereiht === 0,
    bedarf: bedarf.statistik,
    fehlerhafteProfile: bedarf.fehlerhafteProfile,
    fenster: mandatsarbeit.fenster
  };
}

// --- Handler ----------------------------------------------------------------------------------

// Jeder Handler bekommt (auftrag, deps) und liefert { ok, ... } oder wirft.
// Sie rufen ausschliesslich UNVERAENDERTE Bestandsfunktionen auf.

async function handleSourceFetch(auftrag, deps) {
  const quelle = auftrag && auftrag.payload && auftrag.payload.quelle;
  if (!quelle || !quelle.id) throw new Error("payload-ungueltig: quelle fehlt");

  // 1. Abruf — die unveraenderte Produktionsfunktion, mit derselben Google-Haertung.
  const hardening = deps.hardeningConfig();
  const gate = hardening.enabled ? deps.createGate(hardening, {}) : null;
  const bilanz = await deps.crawlAllSources([quelle], {
    googleGate: gate,
    cooldown: { active: false, skipGoogle: false, reason: null },
    hardeningConfig: hardening,
    // Das prozessweite Gedaechtnis geteilter Wege bleibt aktiv: es schadet nie und faengt
    // strukturgleiche Wege ab, die der Compiler bewusst nicht zusammengelegt hat.
    sharedLedger: hardening.enabled && hardening.sharedPathDedup ? deps.sharedLedger(hardening.sharedPathWindowMs) : null
  });

  const ergebnis = (bilanz.results || [])[0] || {};
  if (ergebnis.ok === false) {
    // Ein Abruffehler ist VORUEBERGEHEND (Drosselung, Timeout) -> Backoff, nicht endgueltig.
    throw new Error(ergebnis.error || "abruf-fehlgeschlagen");
  }

  // 2. Rohitems in den GLOBALEN Dokumentpfad — derselbe Weg wie im Bestandslauf.
  const gespeichert = await deps.saveRawItems(bilanz.rawItems || []);
  const persistenz = await deps.persistRawDocuments(gespeichert, { runId: auftrag.id }).catch(() => null);
  const persistenzOk = Boolean(persistenz && !persistenz.skipped && !persistenz.error);

  // ERFOLG WIRD GEGEN DIE ABLAGE GEPRUEFT (CLAUDE.md §4.10): gab es Dokumente, muss die
  // Persistenz sie auch angenommen haben. Sonst ist der Auftrag NICHT erledigt.
  if (gespeichert.length && !persistenzOk) {
    throw new Error("persistenz-fehlgeschlagen-oder-unbekannt");
  }

  // 3. VERSTEHEN EINREIHEN — die Stufe, die bisher fehlte.
  //    Bis zu diesem Sprint erzeugte der Compiler `source_fetch`, `mandate_projection` und
  //    `briefing_materialization`, aber NIEMAND reihte `document_understanding` ein. Der
  //    Handler existierte und war getestet — er wurde nur nie aufgerufen. Damit endete der
  //    Warteschlangenpfad faktisch beim Rohdokument.
  //
  //    Der Schluessel ist der INHALT, nicht die Zeit: die Dokumentkennung ist `rd-<hash>`
  //    (siehe `dedup.toRawDocumentRow`), also ein Inhaltsfingerabdruck. Derselbe Artikel
  //    erzeugt morgen dieselbe Kennung, dieselbe Kennungsmenge denselben Auftragsschluessel —
  //    und `helmut_enqueue_job` legt ihn kein zweites Mal an. Ein Aktualitaetsfenster waere
  //    hier FALSCH: es wuerde denselben Artikel in jedem Fenster erneut zum Verstehen
  //    anmelden.
  const einreihen = typeof deps.enqueue === "function" ? deps.enqueue : null;
  let verstehensAuftraege = 0;
  let verstehenNeu = 0;
  if (einreihen && gespeichert.length) {
    const kennungen = [...new Set(gespeichert.map((d) => d && d.id).filter(Boolean))].sort();
    for (let i = 0; i < kennungen.length; i += UNDERSTANDING_BUENDEL) {
      const teil = kennungen.slice(i, i + UNDERSTANDING_BUENDEL);
      const schluessel = `document_understanding|${buendelHash(teil)}`;
      const ergebnis = await einreihen({
        jobType: "document_understanding",
        idempotencyKey: schluessel,
        // Das Fenster dient hier NUR der Auswertbarkeit (Vorbedingungszaehlung), nicht der
        // Idempotenz — die steckt vollstaendig im Schluessel oben.
        freshnessWindow: auftrag.freshnessWindow || auftrag.freshness_window || null,
        // GETEILTE, GLOBALE ARBEIT: kein Mandatsbezug (CLAUDE.md §4.2). Ein Vorgang gehoert
        // keinem Mandanten, auch dann nicht, wenn ihn eine persoenliche Suche gefunden hat.
        tenantId: null,
        priority: 80,                       // vor Projektion (200) und Briefing (250)
        maxAttempts: 3,
        payload: { dokumentIds: teil }      // NUR Kennungen — kein Titel, kein Text
      });
      verstehensAuftraege += 1;
      if (ergebnis && ergebnis.neu) verstehenNeu += 1;
    }
  }

  return {
    ok: true,
    quellen: 1,
    rohitems: (bilanz.rawItems || []).length,
    gespeichert: gespeichert.length,
    neueRohdokumente: persistenz && Number.isFinite(persistenz.persisted) ? persistenz.persisted : null,
    verstehensAuftraege,
    verstehenNeu
  };
}

// Wie viele Dokumentkennungen kommen in EINEN Verstehensauftrag? Klein genug, dass ein
// Auftrag in seinem Zeitbudget bleibt; gross genug, dass nicht je Artikel ein Auftrag
// entsteht. Der V3-Clusterschritt arbeitet ohnehin ueber die uebergebene Menge.
const UNDERSTANDING_BUENDEL = Math.max(1, Number(process.env.HELMUT_UNDERSTANDING_BUENDEL) || 25);

function buendelHash(kennungen) {
  return crypto.createHash("sha256").update(kennungen.join("\n"), "utf8").digest("hex").slice(0, 32);
}

async function handleDocumentUnderstanding(auftrag, deps) {
  // V3-VERTRAG: ein Dokument wird GLOBAL nur einmal verstanden. Dieser Handler ruft die
  // unveraenderte `runUnderstandingShadow` auf; deren `existing`-Kurzschluss und deren
  // GLOBALER Budgetdeckel (`canSpendLlm(null)`) bleiben die einzige Wahrheit.
  // Es wird KEIN mandatsbezogener KI-Deckel belastet — globale Dokumente werden keinem
  // zufaelligen Mandanten zugerechnet (Auftrag §13.6).
  //
  // DREI SCHICHTEN GEGEN DOPPELTES VERSTEHEN, bewusst uebereinander:
  //   1. Auftragsebene: der Idempotenzschluessel ist der Inhaltsfingerabdruck der
  //      Dokumentmenge -> dieselbe Menge wird nie zweimal eingereiht.
  //   2. Budgetebene: die Reservierung ist an den `result_key` gebunden -> eine WIEDERHOLUNG
  //      desselben Auftrags zahlt NICHT ein zweites Mal.
  //   3. V3-Ebene: `runUnderstandingShadow` kurzschliesst bereits verstandene Vorgaenge
  //      (`existing` -> `duplicate`) ohne Modellaufruf. Diese Schicht ist die eigentliche
  //      Garantie; die beiden darueber sparen die Arbeit, die sie sonst leisten muesste.
  const payload = (auftrag && auftrag.payload) || {};
  let dokumente = Array.isArray(payload.dokumente) ? payload.dokumente : null;
  const kennungen = Array.isArray(payload.dokumentIds) ? payload.dokumentIds : null;

  if (!dokumente && !kennungen) throw new Error("payload-ungueltig: weder dokumente noch dokumentIds");
  if (dokumente && !Array.isArray(dokumente)) throw new Error("payload-ungueltig: dokumente kein Array");

  // Kennungen -> minimierte Zeilen aus der Ablage. Der Auftrag traegt bewusst KEINE Inhalte
  // (Datensparsamkeit); die Zeilen kommen aus `raw_documents`.
  if (!dokumente) {
    if (typeof deps.ladeRohdokumente !== "function") throw new Error("dokumentladen-nicht-verfuegbar");
    dokumente = await deps.ladeRohdokumente(kennungen);
    if (!Array.isArray(dokumente)) throw new Error("dokumentladen-fehlgeschlagen");
    // EHRLICH: sind Dokumente verschwunden (Aufbewahrung, Loeschung), ist das kein Fehler
    // des Auftrags — aber es wird gezaehlt und nicht stillschweigend als Erfolg verbucht.
    if (!dokumente.length) {
      return { ok: true, verstanden: 0, zurueckgestellt: 0, dokumenteGefunden: 0, grund: "keine-dokumente-mehr-vorhanden" };
    }
  }

  // BUDGETRESERVIERUNG (nur wenn der Aufrufer sie mitgibt — ohne sie verhaelt sich der
  // Handler exakt wie bisher, damit bestehende Tests und der Flag-aus-Pfad unberuehrt sind).
  const budget = deps.budget || null;
  let reservierung = null;
  if (budget && typeof budget.reserviere === "function") {
    reservierung = await budget.reserviere({
      art: "understanding",
      gegenstand: auftrag.idempotencyKey || auftrag.idempotency_key || auftrag.id,
      mandatsId: null                      // GLOBAL — niemals einem Mandanten zugerechnet
    });
    if (reservierung && reservierung.erlaubt === false) {
      // KEIN Fehler, kein falsches Gruen: der Auftrag bleibt ehrlich offen und kommt wieder,
      // wenn wieder Budget da ist. Ein "erledigt" waere hier eine Luege ueber die Ablage.
      //
      // LANGE Wartezeit, nicht die kurze. BELEGTER ANLASS (2026-08-08,
      // scripts/skalierung-simulation-test.js): mit erschoepftem Tagesbudget wurde derselbe
      // Auftrag in jeder Runde erneut geholt und erneut abgelehnt — gemessen **38 549
      // abgelehnte Reservierungen** an einem simulierten Tag. Das ist keine Arbeit, das ist
      // Leerlauf, der echte Datenbanklast erzeugt und die Warteschlange blockiert.
      // Ein erschoepftes TAGESBUDGET loest sich nicht in zwei Minuten, sondern beim
      // Tageswechsel. Also wird entsprechend lange zurueckgestellt.
      return {
        ok: false,
        zurueckgestellt: true,
        langeWarten: true,
        grund: `budget-nicht-verfuegbar: ${reservierung.grund || "unbekannt"}`
      };
    }
  }

  let ergebnis = null;
  try {
    ergebnis = await deps.eagerUnderstanding(dokumente, {
      budgetMs: Number(payload.budgetMs) || 60000,
      runId: auftrag.id
    });
  } catch (error) {
    if (budget && reservierung && typeof budget.melde === "function") {
      await budget.melde({ reservierung, ok: false, note: "understanding-fehler" });
    }
    throw error;
  }

  if (budget && reservierung && typeof budget.melde === "function") {
    // Hat der V3-Kurzschluss gegriffen (nichts verarbeitet, kein Modellaufruf), wird die
    // Reservierung AUSDRUECKLICH zurueckgegeben — das ist der einzige Fall, in dem der
    // Aufrufer beweisen kann, dass kein Aufruf stattgefunden hat.
    //
    // ABER NIE BEI EINER WIEDERVERWENDETEN RESERVIERUNG. BELEGTER FEHLER (2026-08-08, von
    // dieser Suite gefunden): beim zweiten Lauf desselben Auftrags greift oben die Idempotenz
    // (`wiederverwendet`), unten meldet V3 dann folgerichtig "0 verarbeitet" — und die
    // urspruengliche, laengst VERBRAUCHTE Reservierung wurde daraufhin zurueckgegeben. Der
    // Zaehler waere gesunken, obwohl der Aufruf beim ERSTEN Mal wirklich stattgefunden hat.
    // Aus einer Idempotenzzusage waere so eine Budgetleckage geworden.
    const nichtsGetan = Number((ergebnis && ergebnis.processed) || 0) === 0;
    const darfFreigeben = nichtsGetan && !reservierung.wiederverwendet;
    await budget.melde({
      reservierung, ok: true, ungenutzt: darfFreigeben,
      note: darfFreigeben ? "v3-kurzschluss" : null
    });
  }

  return {
    ok: true,
    verstanden: (ergebnis && ergebnis.processed) || 0,
    zurueckgestellt: (ergebnis && ergebnis.deferred) || 0,
    dokumenteGefunden: dokumente.length,
    budgetWiederverwendet: Boolean(reservierung && reservierung.wiederverwendet)
  };
}

// Sind die Vorbedingungen dieses Auftrags im SELBEN Aktualitaetsfenster fertig?
//
// WARUM UEBERHAUPT: der skalierbare Pfad trennt Planung und Verarbeitung, damit ist die
// Reihenfolge Abruf -> Verstehen -> Projektion -> Briefing nicht mehr durch den Programm-
// ablauf gesichert. Die Phasenfenster der Faelligkeit sind eine gute Naeherung, aber eine
// Annahme ueber die Laufzeit. Hier wird daraus eine Pruefung.
//
// WAS SIE NICHT TUT: sie wartet nicht auf Auftraege, die ENDGUELTIG gescheitert sind. Ein
// Briefing darf nicht ewig auf einen Abruf warten, den Google nie beantwortet — es entsteht
// dann eben mit weniger Belegen oder als ehrlicher Leerzustand. Genau diese Unterscheidung
// liefert `helmut_jobs_offen` mit (`offen` gegen `fehlgeschlagen`).
//
// Ohne verfuegbare Zaehlung (Migration fehlt, Attrappe ohne diese Faehigkeit) gilt der
// bisherige Zustand: die Faelligkeit entscheidet. Das ist der Rueckfall, nicht der Normalfall.
const VORBEDINGUNGEN = {
  mandate_projection: ["source_fetch", "document_understanding"],
  briefing_materialization: ["source_fetch", "document_understanding", "mandate_projection"]
};
const VORBEDINGUNG_WARTE_MS = Math.max(10000, Number(process.env.HELMUT_VORBEDINGUNG_WARTE_MS) || 120000);
// OBERGRENZE DES WARTENS. Ohne sie wartet ein Briefing UNBEGRENZT.
//
// BELEGTER FEHLER (2026-08-08, von scripts/skalierung-simulation-test.js gefunden):
// bei einem vollstaendigen Google-Ausfall und bei erschoepftem KI-Budget blieben die
// Abruf- und Verstehensauftraege dauerhaft offen. Die Briefingauftraege wurden daraufhin
// in JEDER Runde erneut zurueckgestellt — und die Mandate bekamen am Ende **gar kein
// Briefing**, nicht einmal einen leeren. Gemessen: 0 von 200 Briefings.
//
// Das ist schlimmer als ein Leerzustand: ein leeres Briefing sagt "heute nichts Belastbares",
// gar kein Briefing sagt nichts. Genau das verbietet die Ehrlichkeitsregel (CLAUDE.md §4.4).
//
// Deshalb: nach `VORBEDINGUNG_MAX_WARTE_MS` ab Faelligkeit wird NICHT mehr gewartet. Der
// Auftrag laeuft mit dem, was da ist, und meldet ausdruecklich, dass er ohne vollstaendige
// Vorbedingung gelaufen ist. Zeitbasiert und damit ohne zusaetzlichen Zustand — ein Zaehler
// im Auftrag waere bei jedem Neustart wieder bei null.
// Wartezeit bei erschoepftem Tagesbudget. Standard: eine Stunde. Kuerzer waere Leerlauf,
// laenger wuerde freiwerdendes Budget (Tageswechsel, zurueckgegebene Reservierung) zu
// lange ungenutzt lassen.
const BUDGET_WARTE_MS = Math.max(60000, Number(process.env.HELMUT_BUDGET_WARTE_MS) || 3600 * 1000);

const VORBEDINGUNG_MAX_WARTE_MS = Math.max(
  60000, Number(process.env.HELMUT_VORBEDINGUNG_MAX_WARTE_MS) || 6 * 3600 * 1000
);

async function vorbedingungOffen(auftrag, deps) {
  if (typeof deps.offeneVorbedingungen !== "function") return null;
  const typen = VORBEDINGUNGEN[auftrag.jobType || auftrag.job_type] || null;
  const fenster = auftrag.freshnessWindow || auftrag.freshness_window || null;
  if (!typen || !fenster) return null;

  // Wartefrist abgelaufen? Dann NICHT mehr fragen — der Auftrag laeuft.
  //
  // BEZUGSPUNKT IST DIE ENTSTEHUNG, NICHT DIE FAELLIGKEIT. Belegter Fehler (2026-08-08,
  // von scripts/skalierung-simulation-test.js gefunden): die erste Fassung verglich gegen
  // `due_at`. Genau die verschiebt das Zurueckstellen aber bei JEDEM Mal nach vorn
  // (`helmut_defer_job` setzt `due_at = now() + delay`). Die Frist konnte damit NIE ablaufen —
  // ein Briefing wartete unendlich, und bei erschoepftem Budget entstanden am Ende
  // **0 von 200 Briefings**. `created_at` steht fest und wandert nie.
  const jetzt = typeof deps.now === "function" ? deps.now() : Date.now();
  const entstanden = Date.parse(auftrag.createdAt || auftrag.created_at || "") || null;
  const faellig = Date.parse(auftrag.dueAt || auftrag.due_at || "") || null;
  const bezug = entstanden || faellig;
  if (bezug && jetzt - bezug > VORBEDINGUNG_MAX_WARTE_MS) return null;

  const stand = await deps.offeneVorbedingungen({ fenster, typen });
  if (!stand || stand.verfuegbar === false) return null;   // ehrlicher Rueckfall
  return Number(stand.offen) > 0 ? stand : null;
}

async function handleMandateProjection(auftrag, deps) {
  const mandatsId = auftrag && auftrag.payload && auftrag.payload.mandatsId;
  if (!mandatsId) throw new Error("payload-ungueltig: mandatsId fehlt");
  const offen = await vorbedingungOffen(auftrag, deps);
  if (offen) {
    return {
      ok: false, zurueckgestellt: true,
      grund: `vorbedingung-offen: ${offen.offen} Auftrag(e) im Fenster (${offen.wartend} wartend, ${offen.laufend} laufend)`
    };
  }
  const profil = await deps.getActiveProfile(mandatsId);
  if (!profil) throw new Error("profil-nicht-gefunden");
  // Beides KI-frei (V3-Vertrag §13.3/§13.4) — belegt in docs/betrieb/llm-pfad-karte.md 14/15.
  const matching = await deps.matching({ profile: profil, pipelineRunId: auftrag.id, ausloeser: "warteschlange" });
  const decisions = await deps.decisions({ profile: profil });
  return {
    ok: true,
    matched: (matching && (matching.matched ?? matching.count)) || 0,
    entscheidungen: (decisions && (decisions.saved ?? decisions.count)) || 0
  };
}

async function handleBriefingMaterialization(auftrag, deps) {
  const mandatsId = auftrag && auftrag.payload && auftrag.payload.mandatsId;
  if (!mandatsId) throw new Error("payload-ungueltig: mandatsId fehlt");
  const offen = await vorbedingungOffen(auftrag, deps);
  if (offen) {
    return {
      ok: false, zurueckgestellt: true,
      grund: `vorbedingung-offen: ${offen.offen} Auftrag(e) im Fenster (${offen.wartend} wartend, ${offen.laufend} laufend)`
    };
  }
  const profil = await deps.getActiveProfile(mandatsId);
  if (!profil) throw new Error("profil-nicht-gefunden");
  // `buildV3Briefing` ist eine reine Lese-Transformation, 0 KI (llm-pfad-karte.md Zeile 15).
  // Ein Leerzustand ist ein EHRLICHES Ergebnis, kein Fehler: `available:false` heisst
  // "keine belastbare Lage", nicht "Auftrag gescheitert" (CLAUDE.md §4.3).
  const briefing = await deps.buildV3Briefing(profil, mandatsId);
  return {
    ok: true,
    verfuegbar: Boolean(briefing && briefing.available),
    grund: (briefing && briefing.reason) || null,
    positionen: (briefing && Array.isArray(briefing.items) ? briefing.items.length : 0)
  };
}

const HANDLER = {
  source_fetch: handleSourceFetch,
  document_understanding: handleDocumentUnderstanding,
  mandate_projection: handleMandateProjection,
  briefing_materialization: handleBriefingMaterialization
};

// --- KI-Budget als Worker-Abhaengigkeit (OP-30, DEFAULT AUS) ---------------------------------
//
// ZWEITE FLAGGRENZE, bewusst getrennt von der ersten. `HELMUT_SCALABLE_PIPELINE` entscheidet,
// OB der Warteschlangenpfad laeuft. `HELMUT_LLM_FAIRNESS` entscheidet, ob dabei die neue
// ergebnisbezogene Budgetschicht dazwischenliegt. Beide sind fail closed und beide sind aus.
//
// WARUM ZWEI FLAGGEN: die Budgetschicht kann Arbeit ZURUECKSTELLEN. Das ist genau richtig,
// wenn das Budget knapp ist — aber es ist eine Verhaltensaenderung, die man getrennt vom
// Warteschlangenumbau erproben koennen muss. Ein Flag, das zwei Dinge zugleich einschaltet,
// ist bei einem Fehler nicht auswertbar.
//
// WAS SIE NIE TUT: sie erhoeht keinen Deckel. `HELMUT_MAX_LLM_CALLS_PER_DAY` bleibt der
// globale Notfallwert; die Schicht kann nur WENIGER zulassen, nie mehr.
function budgetFairnessAktiv(env = process.env) {
  const roh = String((env && env.HELMUT_LLM_FAIRNESS) || "").trim().toLowerCase();
  return roh === "on" || roh === "true" || roh === "1" || roh === "an";
}

function budgetAdapter({ env = process.env, deps = {} } = {}) {
  if (!budgetFairnessAktiv(env)) return null;
  const fair = require("./llm-budget-fair");
  const speicher = deps.budgetSpeicher || {
    reserviere: (o) => require("./storage").llmReserveResult(o),
    melde: (o) => require("./storage").llmSettleResult(o),
    gib_frei: (o) => require("./storage").llmReleaseResult(o)
  };
  const jetzt = typeof deps.now === "function" ? deps.now : () => Date.now();
  // Der globale Deckel wird GELESEN, nie gesetzt. Fehlt er, gilt derselbe fail-closed-Wert
  // wie in storage.js (Schutzlimit 50) — nicht "unbegrenzt".
  const globalMax = (() => {
    const roh = String(env.HELMUT_MAX_LLM_CALLS_PER_DAY ?? "").trim();
    const n = Number(roh);
    return roh !== "" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 50;
  })();

  return {
    aktiv: true,
    async reserviere({ art, gegenstand, mandatsId = null, workClass = "notwendig", scopeMax = null } = {}) {
      const tag = fair.tagesSchluessel(jetzt());
      const resultKey = fair.ergebnisSchluessel({ art, gegenstand, mandatsId });
      const scope = fair.scopeFuer({ art, mandatsId });
      const antwort = await speicher.reserviere({
        resultKey, day: tag, scope, workClass,
        globalMax, scopeMax
      });
      if (!antwort || antwort.verfuegbar === false) {
        // Steht die Budgetschicht nicht zur Verfuegung (Migration fehlt), wird NICHT
        // stillschweigend durchgelassen und auch nicht blockiert: der Aufrufer bekommt
        // `null` und faellt auf den bestehenden Deckel im V3-Pfad zurueck. Genau der greift
        // ohnehin und war vor diesem Sprint die einzige Schranke.
        return null;
      }
      return { ...antwort, resultKey };
    },
    async melde({ reservierung, ok = true, ungenutzt = false, note = null } = {}) {
      if (!reservierung || !reservierung.resultKey) return null;
      if (ungenutzt) return speicher.gib_frei({ resultKey: reservierung.resultKey, note });
      return speicher.melde({ resultKey: reservierung.resultKey, ok, note });
    }
  };
}

// --- Worker -----------------------------------------------------------------------------------

function workerDeps(overrides = {}) {
  const lazy = (modul, name) => (...args) => require(modul)[name](...args);
  return {
    now: () => Date.now(),
    claim: (o) => require("./storage").jobQueueClaim(o),
    finish: (o) => require("./storage").jobQueueFinish(o),
    extendLease: (o) => require("./storage").jobQueueExtendLease(o),
    // NEU in diesem Sprint — die drei fehlenden Verbindungen zum V3-Ablauf:
    enqueue: (o) => require("./storage").jobQueueEnqueue(o),
    ladeRohdokumente: (ids) => require("./storage").getRawDocumentsByIds(ids),
    offeneVorbedingungen: (o) => require("./storage").jobQueueOffeneVorbedingungen(o),
    zurueckstellen: (o) => require("./storage").jobQueueDefer(o),
    crawlAllSources: lazy("./crawler", "crawlAllSources"),
    saveRawItems: lazy("./storage", "saveRawItems"),
    persistRawDocuments: lazy("./scheduler", "persistRawDocumentsShadow"),
    eagerUnderstanding: lazy("./understanding", "runUnderstandingShadow"),
    matching: lazy("./matching", "runMatchingShadow"),
    decisions: lazy("./decisions", "runDecisionShadow"),
    getActiveProfile: lazy("./scheduler", "getActiveProfile"),
    buildV3Briefing: lazy("./briefingContract", "buildV3Briefing"),
    hardeningConfig: lazy("./google-news-hardening", "googleHardeningConfig"),
    createGate: lazy("./google-news-hardening", "createGoogleNewsGate"),
    sharedLedger: lazy("./google-news-hardening", "sharedFetchLedger"),
    handler: HANDLER,
    ...overrides
  };
}

// Der Worker baut den Budgetadapter EINMAL je Lauf und reicht ihn den Handlern durch.
// Ist die Fairness aus, ist `budget` schlicht `null` und jeder Handler verhaelt sich exakt
// wie vor diesem Sprint.
function mitBudget(d, env) {
  if (d.budget !== undefined) return d;                 // Test-/Aufruferschicht hat Vorrang
  return { ...d, budget: budgetAdapter({ env, deps: d }) };
}

// Ein Worker-Durchlauf. Haelt ein FESTES Laufzeitbudget ein und verlaengert bei Bedarf die
// Lease. Er verliert nach einem Absturz keine Arbeit: was reserviert und nicht abgeschlossen
// wurde, wird nach Ablauf der Lease vom naechsten Claim wieder aufgenommen (der Riegel dafuer
// steht in der SQL-Funktion, nicht hier).
async function arbeite({
  deps = {},
  owner = null,
  budgetMs = 240000,
  leaseMs = 120000,
  stapel = 10,
  types = null,
  env = process.env
} = {}) {
  if (!skalierbarerPfadAktiv(env)) {
    return { uebersprungen: true, grund: "flag-aus", verarbeitet: 0 };
  }
  const d = mitBudget(workerDeps(deps), env);
  const start = d.now();
  const besitzer = owner || `worker-${crypto.randomUUID()}`;
  const verbleibend = () => Math.max(0, budgetMs - (d.now() - start));

  const bilanz = {
    uebersprungen: false, owner: besitzer,
    reserviert: 0, erledigt: 0, wiederholt: 0, endgueltigFehlgeschlagen: 0,
    leaseVerloren: 0, nichtUebernommen: 0,
    zurueckgestellt: 0, zurueckstellGruende: {}, zurueckstellungNichtVerfuegbar: 0,
    nachTyp: {}, dauerMs: 0, verfuegbar: true, grund: null
  };

  // RESERVE fuer den Abschluss: die letzte Runde darf nicht mitten im Abschlussschreiben
  // in das aeussere Zeitlimit laufen (dieselbe Lehre wie K8 der globalen Phase).
  const ABSCHLUSS_RESERVE_MS = 5000;

  while (verbleibend() > ABSCHLUSS_RESERVE_MS) {
    const claim = await d.claim({ owner: besitzer, limit: stapel, leaseMs, types });
    if (!claim || claim.verfuegbar === false) {
      bilanz.verfuegbar = false;
      bilanz.grund = (claim && claim.grund) || "warteschlange-nicht-verfuegbar";
      break;
    }
    const auftraege = claim.auftraege || [];
    if (!auftraege.length) break;                       // nichts faellig -> sauberes Ende
    bilanz.reserviert += auftraege.length;

    for (const auftrag of auftraege) {
      if (verbleibend() <= ABSCHLUSS_RESERVE_MS) {
        // Zeit alle: NICHT abschliessen. Die Lease laeuft aus, der Auftrag kehrt zurueck.
        // Das ist der Unterschied zu "still verlieren".
        break;
      }
      const typ = auftrag.job_type;
      bilanz.nachTyp[typ] = bilanz.nachTyp[typ] || { erledigt: 0, fehler: 0 };
      const handler = d.handler[typ];

      let ergebnis = null;
      let fehler = null;
      if (typeof handler !== "function") {
        fehler = "unbekannter-aufgabentyp";           // endgueltig, kein Backoff
      } else {
        try {
          // Lease verlaengern, wenn die verbleibende Lease knapp wird. Bei langen Abrufen
          // (eine Personenquelle sind ~98 Anfragen) ist das der Unterschied zwischen
          // "laeuft noch" und "wird einem zweiten Worker gegeben".
          const leaseEnde = Date.parse(auftrag.lease_expires_at || "") || 0;
          if (leaseEnde && leaseEnde - d.now() < leaseMs / 2) {
            const v = await d.extendLease({ id: auftrag.id, owner: besitzer, leaseMs });
            if (v && v.verfuegbar && v.verlaengert === false) {
              bilanz.leaseVerloren += 1;
              continue;                                 // fremder Halter -> Finger weg
            }
          }
          // Die Auftragsgrenze ist zusaetzlich durch die RESTZEIT gedeckelt: ein Auftrag
          // darf nie ueber die Abschlussreserve hinaus laufen.
          const auftragsBudget = Math.max(1000, Math.min(AUFTRAG_MAX_MS, verbleibend() - ABSCHLUSS_RESERVE_MS));
          ergebnis = await mitZeitgrenze(
            Promise.resolve(handler(normalisiereAuftrag(auftrag), d)),
            auftragsBudget,
            typ
          );
        } catch (error) {
          fehler = bereinigeFehler(error);
        }
      }

      // EHRLICHE ZURUECKSTELLUNG. Ein Auftrag, der auf seine Vorbedingung oder auf freies
      // Budget wartet, ist nicht gescheitert — und darf deshalb weder einen Versuch
      // verbrauchen noch einen Fehlertext bekommen, der eine Stoerung behauptet.
      if (ergebnis && ergebnis.zurueckgestellt === true) {
        bilanz.zurueckgestellt += 1;
        const gruende = bilanz.zurueckstellGruende;
        const kurz = String(ergebnis.grund || "unbekannt").split(":")[0];
        gruende[kurz] = (gruende[kurz] || 0) + 1;
        if (typeof d.zurueckstellen === "function") {
          const z = await d.zurueckstellen({
            id: auftrag.id, owner: besitzer,
            // Ein erschoepftes Tagesbudget braucht eine LANGE Wartezeit (siehe oben),
            // eine offene Vorbedingung eine kurze.
            delayMs: ergebnis.langeWarten ? BUDGET_WARTE_MS : VORBEDINGUNG_WARTE_MS,
            grund: ergebnis.grund || null
          });
          // Steht die Zurueckstellung nicht zur Verfuegung (Migration fehlt), wird NICHTS
          // abgeschlossen: die Lease laeuft aus und der Auftrag kehrt von selbst zurueck.
          // Das ist langsamer, aber es verliert nichts und behauptet nichts.
          if (z && z.verfuegbar === false) bilanz.zurueckstellungNichtVerfuegbar += 1;
        } else {
          bilanz.zurueckstellungNichtVerfuegbar += 1;
        }
        continue;
      }

      const ok = Boolean(ergebnis && ergebnis.ok);
      const versuche = Number(auftrag.attempts) || 1;
      const maxVersuche = Number(auftrag.max_attempts) || 5;
      const endgueltig = !ok && (istEndgueltig(fehler) || versuche >= maxVersuche);
      const abschluss = await d.finish({
        id: auftrag.id,
        owner: besitzer,
        ok,
        error: ok ? null : (fehler || "unbekannter-fehler"),
        // Endgueltige Fehler brauchen keinen Backoff — sie kommen nicht wieder.
        // Ein endgueltiger Fehler VOR Erreichen der Versuchsobergrenze wird trotzdem
        // sauber durchgereicht; die SQL-Funktion entscheidet den Zielstatus.
        retryDelayMs: ok || endgueltig ? 0 : backoffMs(versuche, auftrag.id)
      });

      if (!abschluss || abschluss.verfuegbar === false) {
        bilanz.nichtUebernommen += 1;
      } else if (abschluss.uebernommen === false) {
        bilanz.leaseVerloren += 1;                      // jemand anderes haelt ihn jetzt
      } else if (ok) {
        bilanz.erledigt += 1; bilanz.nachTyp[typ].erledigt += 1;
      } else if (abschluss.neuerStatus === "fehlgeschlagen") {
        bilanz.endgueltigFehlgeschlagen += 1; bilanz.nachTyp[typ].fehler += 1;
      } else {
        bilanz.wiederholt += 1; bilanz.nachTyp[typ].fehler += 1;
      }
    }
  }

  bilanz.dauerMs = d.now() - start;
  bilanz.verarbeitet = bilanz.erledigt + bilanz.wiederholt + bilanz.endgueltigFehlgeschlagen;
  return bilanz;
}

// DB-Zeile -> Handler-Sicht. Die SQL liefert snake_case, der Handler denkt in Fachbegriffen.
function normalisiereAuftrag(zeile = {}) {
  return {
    id: zeile.id,
    jobType: zeile.job_type,
    payload: zeile.payload || {},
    tenantId: zeile.tenant_id || null,
    attempts: Number(zeile.attempts) || 0,
    maxAttempts: Number(zeile.max_attempts) || 5,
    freshnessWindow: zeile.freshness_window || null,
    // Faelligkeit UND Entstehung werden durchgereicht: die Vorbedingungspruefung braucht
    // eine zeitliche Obergrenze, und die darf nicht an einem Wert haengen, den das
    // Zurueckstellen selbst verschiebt (siehe VORBEDINGUNG_MAX_WARTE_MS).
    dueAt: zeile.due_at || null,
    createdAt: zeile.created_at || null
  };
}

// --- Betriebsmessung --------------------------------------------------------------------------

// Schwellen: Warnung VOR 24 h, kritisch spaetestens BEI 24 h oder bei einem endgueltigen
// Fehler (Auftrag §11). Keine neue Oberflaeche — eine serverseitige Funktion mit
// strukturierter, testbarer Ausgabe.
const WARN_ALTER_S = 18 * 3600;
const KRITISCH_ALTER_S = 24 * 3600;

async function betriebsstatus({ deps = {}, seitMinuten = 1440, env = process.env } = {}) {
  const metrics = deps.metrics || ((m) => require("./storage").jobQueueMetrics(m));
  const antwort = await metrics(seitMinuten);
  if (!antwort || antwort.verfuegbar === false) {
    return {
      verfuegbar: false,
      grund: (antwort && antwort.grund) || "unbekannt",
      // NICHT "gruen": eine nicht lesbare Warteschlange ist ein unbekannter Zustand,
      // kein gesunder (CLAUDE.md §4.4).
      zustand: "unbekannt",
      flag: skalierbarerPfadAktiv(env) ? "on" : "off"
    };
  }
  const k = antwort.kennzahlen || {};
  const zahl = (v) => (v == null ? 0 : Number(v));
  const aeltester = zahl(k.aeltester_faelliger_s);
  const maxMandat = zahl(k.max_mandatsalter_s);
  const endgueltig = zahl(k.endgueltig_fehler);
  const alter = Math.max(aeltester, maxMandat);

  let zustand = "gruen";
  const befunde = [];
  if (endgueltig > 0) { zustand = "kritisch"; befunde.push(`endgueltige-fehler:${endgueltig}`); }
  if (alter >= KRITISCH_ALTER_S) { zustand = "kritisch"; befunde.push(`alter-${Math.round(alter)}s-ueber-24h`); }
  else if (alter >= WARN_ALTER_S) { if (zustand !== "kritisch") zustand = "warnung"; befunde.push(`alter-${Math.round(alter)}s-naehert-24h`); }
  if (zahl(k.ueberfaellige_mandate) > 0) {
    if (zustand === "gruen") zustand = "warnung";
    befunde.push(`ueberfaellige-mandate:${zahl(k.ueberfaellige_mandate)}`);
  }

  return {
    verfuegbar: true,
    flag: skalierbarerPfadAktiv(env) ? "on" : "off",
    zustand,
    befunde,
    kennzahlen: {
      wartend: zahl(k.wartend),
      laufend: zahl(k.laufend),
      aktiveLeases: zahl(k.aktive_leases),
      aeltesterFaelligerS: aeltester,
      erledigtImZeitraum: zahl(k.erledigt_im_zeitraum),
      fehlgeschlagenGesamt: zahl(k.fehlgeschlagen_gesamt),
      endgueltigFehler: endgueltig,
      wiederholungen: zahl(k.wiederholungen),
      mittlereDauerS: zahl(k.mittlere_dauer_s),
      durchsatzProStunde: zahl(k.durchsatz_pro_stunde),
      ueberfaelligeMandate: zahl(k.ueberfaellige_mandate),
      maxMandatsalterS: maxMandat,
      nachTyp: k.nach_typ || {},
      nachStatus: k.nach_status || {},
      // Geschaetzte Kapazitaetsreserve: wie oft passt der Rueckstand in das, was im
      // Zeitraum tatsaechlich geschafft wurde? null = noch keine Messgrundlage.
      // Ausdruecklich eine SCHAETZUNG aus beobachtetem Durchsatz, keine Zusage.
      kapazitaetsreserveFaktor: zahl(k.erledigt_im_zeitraum) > 0 && zahl(k.wartend) > 0
        ? Math.round((zahl(k.erledigt_im_zeitraum) / zahl(k.wartend)) * 100) / 100
        : (zahl(k.wartend) === 0 ? null : 0)
    },
    schwellen: { warnungAlterS: WARN_ALTER_S, kritischAlterS: KRITISCH_ALTER_S }
  };
}

module.exports = {
  skalierbarerPfadAktiv,
  waehleVerarbeitungspfad,
  planeArbeit,
  arbeite,
  betriebsstatus,
  workerDeps,
  normalisiereAuftrag,
  // exportiert fuer Vertragstests:
  bereinigeFehler,
  istEndgueltig,
  backoffMs,
  mitZeitgrenze,
  AUFTRAG_MAX_MS,
  HANDLER,
  WARN_ALTER_S,
  KRITISCH_ALTER_S,
  // NEU in diesem Sprint (V3-Anbindung + Budget), exportiert fuer Vertragstests:
  budgetFairnessAktiv,
  budgetAdapter,
  vorbedingungOffen,
  VORBEDINGUNGEN,
  VORBEDINGUNG_WARTE_MS,
  VORBEDINGUNG_MAX_WARTE_MS,
  BUDGET_WARTE_MS,
  UNDERSTANDING_BUENDEL,
  buendelHash
};
