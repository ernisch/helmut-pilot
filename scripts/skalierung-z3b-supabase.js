"use strict";

// Helmut — begrenzter Z3b Messlauf gegen das isolierte Supabase Testprojekt.
// =============================================================================
// Diese Datei ist absichtlich NICHT Teil der Anwendung und startet ohne eine
// vollstaendige, laufbezogene Freigabekennung keinen Netzaufruf. Sie misst nur
// den PostgREST Weg der Warteschlange mit rein synthetischen Auftraegen.
//
// WICHTIG:
//   * Production und jedes andere Supabase Projekt sind hart gesperrt.
//   * Google, Azure, OpenAI und echte Quellen kommen in diesem Lauf nicht vor.
//   * Es gibt keine automatische Wiederholung und keine automatische Loeschung.
//   * F9 und Z22 muessen vor einem Messlauf im Testprojekt nachweisbar sein.
//   * Antwortruempfe, Auftrag IDs und Zugangsschluessel gelangen nie in Berichte.

const {
  TEST_PROJECT_REF,
  TEST_PROJECT_URL,
  MESSSTUFEN,
  GEMEINSAME_PROBEGRENZEN,
  probeprofilFuerMandate,
  pruefeTestprojekt,
  erzeugeSynthetischeAuftraege
} = require("./fixtures/z3b-supabase-plan");

const RPC_ERLAUBT = Object.freeze([
  "helmut_enqueue_job",
  "helmut_claim_jobs",
  "helmut_finish_job",
  "helmut_job_metrics",
  "helmut_job_ankunft",
  "helmut_jobs_offen"
]);
const RPC_ERLAUBT_SET = new Set(RPC_ERLAUBT);
const PARALLELITAET_ERLAUBT = new Set(GEMEINSAME_PROBEGRENZEN.parallelitaet);
const ANTWORT_MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10000;
const LEASE_MS = 120000;

// Diese Namen duerfen im Messprozess nicht sichtbar sein. Der Messlauf besitzt
// bewusst eigene HELMUT_Z3B_* Variablen, damit kein vorhandener Production oder
// Anbieterwert versehentlich als Testkonfiguration interpretiert werden kann.
const FREMDKENNUNGEN = Object.freeze([
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "AZURE_OPENAI_KEY",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "SERPAPI_KEY"
]);

class Z3bAbbruch extends Error {
  constructor(nachricht, grund = "sicherheitsabbruch") {
    super(nachricht);
    this.name = "Z3bAbbruch";
    this.grund = grund;
  }
}

function ganzeZahl(roh, name) {
  const text = String(roh == null ? "" : roh).trim();
  if (!/^\d+$/.test(text)) throw new Z3bAbbruch(`${name} fehlt oder ist keine ganze Zahl`, "konfiguration");
  const wert = Number(text);
  if (!Number.isSafeInteger(wert)) throw new Z3bAbbruch(`${name} ist ausserhalb des Zahlenbereichs`, "konfiguration");
  return wert;
}

function jwtRolle(schluessel) {
  const teile = String(schluessel || "").split(".");
  if (teile.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(teile[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch (_) {
    return null;
  }
}

function liesZugang(env) {
  const geheim = String(env.HELMUT_Z3B_SUPABASE_SECRET_KEY || "").trim();
  const alt = String(env.HELMUT_Z3B_SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (geheim && alt) {
    throw new Z3bAbbruch("Z3b Zugang abgelehnt: neuer Secret Key und alter service_role Key sind gleichzeitig gesetzt", "zugang");
  }
  if (!geheim && !alt) {
    throw new Z3bAbbruch("Z3b Zugang fehlt: ein nur fuer diesen Test bereitgestellter Backend Schluessel ist erforderlich", "zugang");
  }
  if (geheim) {
    if (!/^sb_secret_[A-Za-z0-9_-]{12,}$/.test(geheim)) {
      throw new Z3bAbbruch("Z3b Zugang abgelehnt: erwartet wird ein Supabase Secret Key, kein Publishable oder Anon Key", "zugang");
    }
    return Object.freeze({ art: "secret", wert: geheim });
  }
  if (jwtRolle(alt) !== "service_role") {
    throw new Z3bAbbruch("Z3b Zugang abgelehnt: der alte JWT Schluessel hat nicht die Rolle service_role", "zugang");
  }
  return Object.freeze({ art: "service_role", wert: alt });
}

function freigabeKennung({ mandate, laufKennung }) {
  return `z3b:${TEST_PROJECT_REF}:${mandate}:${laufKennung}`;
}

function berechneAnfragenObergrenze({ auftraege, parallelitaet }) {
  // Vier lesende Vorpruefungen, Einreihen, eine Claim Runde, Abschliessen und
  // vier lesende Nachpruefungen. Es gibt absichtlich keine Retry Reserve.
  return 8 + (2 * auftraege) + Math.min(auftraege, parallelitaet);
}

function liesKonfiguration(env = process.env) {
  const sichtbar = FREMDKENNUNGEN.filter((name) => String(env[name] || "").trim() !== "");
  if (sichtbar.length) {
    throw new Z3bAbbruch(
      `Z3b Umgebung abgelehnt: nicht testgebundene Zugangsdaten sind sichtbar (${sichtbar.join(", ")}; Werte werden nicht ausgegeben)`,
      "umgebung"
    );
  }
  if (String(env.HELMUT_SOURCE_MODE || "").trim().toLowerCase() !== "off") {
    throw new Z3bAbbruch("Z3b Umgebung abgelehnt: HELMUT_SOURCE_MODE muss genau off sein", "umgebung");
  }

  const projekt = pruefeTestprojekt({
    projektRef: String(env.HELMUT_Z3B_SUPABASE_PROJECT_REF || "").trim(),
    url: String(env.HELMUT_Z3B_SUPABASE_URL || "").trim()
  });
  const mandate = ganzeZahl(env.HELMUT_Z3B_STUFE, "HELMUT_Z3B_STUFE");
  if (!MESSSTUFEN.includes(mandate)) {
    throw new Z3bAbbruch(`Z3b Stufe abgelehnt: erlaubt sind nur ${MESSSTUFEN.join(", ")}`, "konfiguration");
  }
  const auftraege = ganzeZahl(env.HELMUT_Z3B_AUFTRAEGE, "HELMUT_Z3B_AUFTRAEGE");
  const parallelitaet = ganzeZahl(env.HELMUT_Z3B_PARALLELITAET, "HELMUT_Z3B_PARALLELITAET");
  if (!PARALLELITAET_ERLAUBT.has(parallelitaet)) {
    throw new Z3bAbbruch(
      `Z3b Parallelitaet abgelehnt: erlaubt sind nur ${GEMEINSAME_PROBEGRENZEN.parallelitaet.join(", ")}`,
      "konfiguration"
    );
  }
  const laufKennung = String(env.HELMUT_Z3B_LAUF || "").trim();
  // Die Erzeugung prueft gleichzeitig Laufkennung, Stufe und Auftragsriegel.
  erzeugeSynthetischeAuftraege({ mandate, anzahl: auftraege, laufKennung });

  const profil = probeprofilFuerMandate(mandate);
  const anfragenObergrenze = berechneAnfragenObergrenze({ auftraege, parallelitaet });
  if (!profil || anfragenObergrenze > profil.anfragenGesamtMax) {
    throw new Z3bAbbruch(
      `Z3b Anfrageplan abgelehnt: ${anfragenObergrenze} geplante Anfragen ueberschreiten den Riegel ${profil ? profil.anfragenGesamtMax : 0}`,
      "anfragenriegel"
    );
  }

  const erwartet = freigabeKennung({ mandate, laufKennung });
  if (String(env.HELMUT_Z3B_FREIGABE || "") !== erwartet) {
    throw new Z3bAbbruch("Z3b Lauf ist nicht laufbezogen freigeschaltet", "freigabe");
  }

  const zugang = liesZugang(env);
  const konfiguration = {
    projektRef: projekt.projektRef,
    url: projekt.url,
    mandate,
    auftraege,
    parallelitaet,
    laufKennung,
    anfragenGesamtMax: profil.anfragenGesamtMax,
    anfragenObergrenze,
    timeoutMs: TIMEOUT_MS,
    leaseMs: LEASE_MS,
    zugangsart: zugang.art
  };
  // Der Wert bleibt absichtlich nicht aufzaehlbar. JSON Berichte und normale
  // Objektprotokolle koennen ihn dadurch nicht versehentlich ausgeben.
  Object.defineProperty(konfiguration, "zugang", { value: zugang, enumerable: false });
  return Object.freeze(konfiguration);
}

function verteilung(werte) {
  if (!werte.length) return Object.freeze({ n: 0, min: null, p50: null, p95: null, p99: null, max: null, mittel: null });
  const sortiert = [...werte].sort((a, b) => a - b);
  const quantil = (p) => sortiert[Math.min(sortiert.length - 1, Math.floor(p * (sortiert.length - 1)))];
  return Object.freeze({
    n: sortiert.length,
    min: sortiert[0],
    p50: quantil(0.5),
    p95: quantil(0.95),
    p99: quantil(0.99),
    max: sortiert[sortiert.length - 1],
    mittel: Math.round((sortiert.reduce((summe, wert) => summe + wert, 0) / sortiert.length) * 10) / 10
  });
}

function baueMessung(anfragenMax) {
  const zustand = {
    anfragenMax,
    anfragen: 0,
    laufend: 0,
    gleichzeitigSpitze: 0,
    nachStatus: {},
    nachRpc: {},
    dauerMs: [],
    zeitueberschreitungen: 0,
    netzfehler: 0,
    gedrosselt: 0,
    serverfehler: 0,
    folge429: 0,
    folge5xx: 0,
    gestoppt: false,
    stoppgrund: null
  };

  return {
    vor(rpc) {
      if (zustand.gestoppt) throw new Z3bAbbruch(`Z3b Lauf gestoppt: ${zustand.stoppgrund}`, "anbietergrenze");
      if (zustand.anfragen >= zustand.anfragenMax) {
        zustand.gestoppt = true;
        zustand.stoppgrund = "HTTP Anfrageobergrenze erreicht";
        throw new Z3bAbbruch("Z3b HTTP Anfrageobergrenze erreicht", "anfragenriegel");
      }
      zustand.anfragen += 1;
      zustand.nachRpc[rpc] = (zustand.nachRpc[rpc] || 0) + 1;
      zustand.laufend += 1;
      zustand.gleichzeitigSpitze = Math.max(zustand.gleichzeitigSpitze, zustand.laufend);
    },
    nach(status, dauerMs) {
      zustand.laufend = Math.max(0, zustand.laufend - 1);
      zustand.dauerMs.push(Math.max(0, Math.round(Number(dauerMs) || 0)));
      zustand.nachStatus[String(status)] = (zustand.nachStatus[String(status)] || 0) + 1;
      if (status === 429) {
        zustand.gedrosselt += 1;
        zustand.folge429 += 1;
      } else {
        zustand.folge429 = 0;
      }
      if (status >= 500 && status <= 599) {
        zustand.serverfehler += 1;
        zustand.folge5xx += 1;
      } else {
        zustand.folge5xx = 0;
      }
      if (zustand.folge429 >= GEMEINSAME_PROBEGRENZEN.stopNach429InFolge) {
        zustand.gestoppt = true;
        zustand.stoppgrund = `${zustand.folge429} HTTP 429 Antworten in Folge`;
      }
      if (zustand.folge5xx >= GEMEINSAME_PROBEGRENZEN.stopNach5xxInFolge) {
        zustand.gestoppt = true;
        zustand.stoppgrund = `${zustand.folge5xx} HTTP 5xx Antworten in Folge`;
      }
    },
    transportfehler({ dauerMs, timeout }) {
      zustand.laufend = Math.max(0, zustand.laufend - 1);
      zustand.dauerMs.push(Math.max(0, Math.round(Number(dauerMs) || 0)));
      if (timeout) zustand.zeitueberschreitungen += 1;
      else zustand.netzfehler += 1;
      zustand.gestoppt = true;
      zustand.stoppgrund = timeout ? "Zeitueberschreitung mit unklarem Mutationsergebnis" : "Netzfehler mit unklarem Mutationsergebnis";
    },
    istGestoppt: () => zustand.gestoppt,
    bericht: () => Object.freeze({
      anfragen: zustand.anfragen,
      anfragenMax: zustand.anfragenMax,
      nachStatus: Object.freeze({ ...zustand.nachStatus }),
      nachRpc: Object.freeze({ ...zustand.nachRpc }),
      dauerMs: verteilung(zustand.dauerMs),
      gleichzeitigSpitze: zustand.gleichzeitigSpitze,
      zeitueberschreitungen: zustand.zeitueberschreitungen,
      netzfehler: zustand.netzfehler,
      gedrosselt: zustand.gedrosselt,
      serverfehler: zustand.serverfehler,
      gestoppt: zustand.gestoppt,
      stoppgrund: zustand.stoppgrund
    })
  };
}

function zugangskopf(zugang) {
  const kopf = {
    apikey: zugang.wert,
    "Content-Type": "application/json",
    "User-Agent": "helmut-z3b-server/1.0"
  };
  // Neue sb_secret Schluessel duerfen laut Supabase nicht als Bearer JWT
  // gesendet werden. Nur der alte JWT basierte service_role Schluessel bekommt
  // zusaetzlich den Authorization Kopf.
  if (zugang.art === "service_role") kopf.Authorization = `Bearer ${zugang.wert}`;
  return kopf;
}

async function rpcAnfrage({ konfiguration, rpc, parameter = {}, messung, fetchImpl = globalThis.fetch }) {
  if (!RPC_ERLAUBT_SET.has(rpc)) {
    throw new Z3bAbbruch(`Z3b RPC abgelehnt: ${rpc} ist nicht freigeplant`, "rpc-riegel");
  }
  if (typeof fetchImpl !== "function") throw new Z3bAbbruch("Z3b braucht Node fetch", "laufzeit");
  messung.vor(rpc);
  const controller = new AbortController();
  const beginn = Date.now();
  const timer = setTimeout(() => controller.abort(), konfiguration.timeoutMs);
  let antwort;
  try {
    antwort = await fetchImpl(`${konfiguration.url}/rest/v1/rpc/${rpc}`, {
      method: "POST",
      headers: zugangskopf(konfiguration.zugang),
      body: JSON.stringify(parameter || {}),
      signal: controller.signal
    });
  } catch (fehler) {
    clearTimeout(timer);
    const timeout = Boolean(fehler && fehler.name === "AbortError");
    messung.transportfehler({ dauerMs: Date.now() - beginn, timeout });
    throw new Z3bAbbruch(
      timeout ? `Z3b Zeitueberschreitung bei ${rpc}` : `Z3b Netzfehler bei ${rpc}`,
      timeout ? "timeout" : "netzfehler"
    );
  }
  clearTimeout(timer);
  const status = Number(antwort && antwort.status) || 0;
  messung.nach(status, Date.now() - beginn);

  let text = "";
  try { text = await antwort.text(); }
  catch (_) { throw new Z3bAbbruch(`Z3b Antwort von ${rpc} war nicht lesbar`, "antwort"); }
  if (Buffer.byteLength(text || "", "utf8") > ANTWORT_MAX_BYTES) {
    throw new Z3bAbbruch(`Z3b Antwort von ${rpc} ueberschreitet die lokale Groessenbegrenzung`, "antwort");
  }
  if (!antwort.ok) {
    // Der Rumpf wird bewusst weder zurueckgegeben noch in den Fehler uebernommen.
    return Object.freeze({ ok: false, status, gestoppt: messung.istGestoppt() });
  }
  if (!text) return Object.freeze({ ok: true, status, daten: null });
  try {
    return Object.freeze({ ok: true, status, daten: JSON.parse(text) });
  } catch (_) {
    throw new Z3bAbbruch(`Z3b Antwort von ${rpc} war kein gueltiges JSON`, "antwort");
  }
}

function ersteZeile(antwort) {
  if (!antwort || !antwort.ok) return null;
  const daten = antwort.daten;
  if (Array.isArray(daten)) return daten[0] || null;
  return daten && typeof daten === "object" ? daten : null;
}

function zeilen(antwort) {
  if (!antwort || !antwort.ok) return [];
  return Array.isArray(antwort.daten) ? antwort.daten : (antwort.daten == null ? [] : [antwort.daten]);
}

function erwarteOk(antwort, nachricht, grund = "vorpruefung") {
  if (!antwort || !antwort.ok) {
    const status = antwort && antwort.status ? ` (HTTP ${antwort.status})` : "";
    throw new Z3bAbbruch(`${nachricht}${status}`, grund);
  }
  return antwort;
}

function statusZeile(zeile) {
  const wert = zeile || {};
  return Object.freeze({
    offen: Number(wert.offen) || 0,
    wartend: Number(wert.wartend) || 0,
    laufend: Number(wert.laufend) || 0,
    fehlgeschlagen: Number(wert.fehlgeschlagen) || 0,
    erledigt: Number(wert.erledigt) || 0
  });
}

function ankunftZeile(zeile) {
  const wert = zeile || {};
  return Object.freeze({
    eingereihtImZeitraum: Number(wert.eingereiht_im_zeitraum) || 0,
    erledigtImZeitraum: Number(wert.erledigt_im_zeitraum) || 0,
    abflussverhaeltnis: wert.abflussverhaeltnis == null ? null : Number(wert.abflussverhaeltnis),
    fensterMinuten: Number(wert.fenster_minuten) || 0
  });
}

function metricsZeile(zeile) {
  const wert = zeile || {};
  // Nur aggregierte Werte. nach_typ und nach_status sind ebenfalls reine
  // Zaehler, keine IDs oder Nutzdaten.
  return Object.freeze({
    wartend: Number(wert.wartend) || 0,
    laufend: Number(wert.laufend) || 0,
    erledigtImZeitraum: Number(wert.erledigt_im_zeitraum) || 0,
    fehlgeschlagenGesamt: Number(wert.fehlgeschlagen_gesamt) || 0,
    endgueltigFehler: Number(wert.endgueltig_fehler) || 0,
    wiederholungen: Number(wert.wiederholungen) || 0,
    aktiveLeases: Number(wert.aktive_leases) || 0,
    aeltesterFaelligerS: Number(wert.aeltester_faelliger_s) || 0,
    durchsatzProStunde: Number(wert.durchsatz_pro_stunde) || 0,
    mittlereDauerS: Number(wert.mittlere_dauer_s) || 0,
    ueberfaelligeMandate: Number(wert.ueberfaellige_mandate) || 0,
    maxMandatsalterS: Number(wert.max_mandatsalter_s) || 0,
    nachTyp: wert.nach_typ && typeof wert.nach_typ === "object" ? Object.freeze({ ...wert.nach_typ }) : Object.freeze({}),
    nachStatus: wert.nach_status && typeof wert.nach_status === "object" ? Object.freeze({ ...wert.nach_status }) : Object.freeze({})
  });
}

async function pruefeVoraussetzungen(konfiguration, messung, fetchImpl) {
  const basis = erwarteOk(await rpcAnfrage({
    konfiguration, rpc: "helmut_job_metrics", parameter: { p_seit_minuten: 60 }, messung, fetchImpl
  }), "Z3b Basismigrationen sind nicht lesbar");
  const ankunft = erwarteOk(await rpcAnfrage({
    konfiguration, rpc: "helmut_job_ankunft", parameter: { p_seit_minuten: 60 }, messung, fetchImpl
  }), "Z3b F9 Ankunftsmigration ist nicht nachgewiesen", "migration-f9");
  erwarteOk(await rpcAnfrage({
    konfiguration,
    rpc: "helmut_jobs_offen",
    parameter: {
      p_fenster: ["z3b:vorpruefung:nichtvorhanden"],
      p_typen: ["source_fetch"],
      p_mandat: "z3b-synth-mandat-0000"
    },
    messung,
    fetchImpl
  }), "Z3b Z22 Mandatsfilter ist nicht nachgewiesen", "migration-z22");
  const bestandAntwort = erwarteOk(await rpcAnfrage({
    konfiguration, rpc: "helmut_jobs_offen", parameter: { p_fenster: null, p_typen: null }, messung, fetchImpl
  }), "Z3b Warteschlangenbestand ist nicht lesbar");
  const bestand = statusZeile(ersteZeile(bestandAntwort));
  if (bestand.offen !== 0 || bestand.wartend !== 0 || bestand.laufend !== 0 || bestand.fehlgeschlagen !== 0) {
    throw new Z3bAbbruch(
      "Z3b Testprojekt ist nicht laufbereit: offene, laufende oder fehlgeschlagene Altauftraege sind vorhanden",
      "testbestand"
    );
  }
  return Object.freeze({
    metrics: metricsZeile(ersteZeile(basis)),
    ankunft: ankunftZeile(ersteZeile(ankunft)),
    bestand
  });
}

async function parallel(items, parallelitaet, arbeit, messung) {
  let naechster = 0;
  const ergebnisse = new Array(items.length);
  let ersterFehler = null;
  const arbeiter = Array.from({ length: Math.min(items.length, parallelitaet) }, async () => {
    while (!ersterFehler && !messung.istGestoppt()) {
      const index = naechster;
      naechster += 1;
      if (index >= items.length) return;
      try { ergebnisse[index] = await arbeit(items[index], index); }
      catch (fehler) { ersterFehler = fehler; }
    }
  });
  await Promise.all(arbeiter);
  if (ersterFehler) throw ersterFehler;
  return ergebnisse.filter((wert) => wert !== undefined);
}

async function fuehreMesslauf(konfiguration, { fetchImpl = globalThis.fetch, jetzt = () => new Date() } = {}) {
  const messung = baueMessung(konfiguration.anfragenGesamtMax);
  const begonnen = jetzt();
  const vorher = await pruefeVoraussetzungen(konfiguration, messung, fetchImpl);
  const synthetisch = erzeugeSynthetischeAuftraege({
    mandate: konfiguration.mandate,
    anzahl: konfiguration.auftraege,
    laufKennung: konfiguration.laufKennung
  });

  const eingereihtAntworten = await parallel(synthetisch, konfiguration.parallelitaet, (parameter) => rpcAnfrage({
    konfiguration, rpc: "helmut_enqueue_job", parameter, messung, fetchImpl
  }), messung);
  const eingereiht = eingereihtAntworten.map(ersteZeile).filter(Boolean);
  if (eingereihtAntworten.length !== synthetisch.length
      || eingereihtAntworten.some((antwort) => !antwort.ok)
      || eingereiht.length !== synthetisch.length
      || eingereiht.some((zeile) => zeile.neu !== true || !zeile.id)) {
    throw new Z3bAbbruch("Z3b Einreihung war nicht vollstaendig neu; der Lauf wird vor dem Claim beendet", "einreihung");
  }
  const erwarteteIds = new Set(eingereiht.map((zeile) => String(zeile.id)));

  const workerAnzahl = Math.min(konfiguration.parallelitaet, synthetisch.length);
  const limitJeWorker = Math.ceil(synthetisch.length / workerAnzahl);
  const worker = Array.from({ length: workerAnzahl }, (_, index) => ({
    owner: `z3b-${konfiguration.laufKennung}-${String(index).padStart(2, "0")}`,
    limit: limitJeWorker
  }));
  const claimAntworten = await parallel(worker, workerAnzahl, ({ owner, limit }) => rpcAnfrage({
    konfiguration,
    rpc: "helmut_claim_jobs",
    parameter: { p_owner: owner, p_limit: limit, p_lease_ms: konfiguration.leaseMs, p_types: ["source_fetch"] },
    messung,
    fetchImpl
  }).then((antwort) => ({ antwort, owner })), messung);
  if (claimAntworten.length !== workerAnzahl || claimAntworten.some((wert) => !wert.antwort.ok)) {
    throw new Z3bAbbruch("Z3b Claim Runde war nicht vollstaendig", "claim");
  }
  const reserviert = claimAntworten.flatMap(({ antwort, owner }) => zeilen(antwort).map((zeile) => ({ zeile, owner })));
  const reservierteIds = reserviert.map(({ zeile }) => String(zeile && zeile.id || ""));
  if (reserviert.length !== synthetisch.length
      || new Set(reservierteIds).size !== reserviert.length
      || reservierteIds.some((id) => !erwarteteIds.has(id))) {
    throw new Z3bAbbruch("Z3b Claim lieferte fehlende, doppelte oder laufzeitfremde Auftraege", "claim-vertrag");
  }

  const finishAntworten = await parallel(reserviert, konfiguration.parallelitaet, ({ zeile, owner }) => rpcAnfrage({
    konfiguration,
    rpc: "helmut_finish_job",
    parameter: { p_id: zeile.id, p_owner: owner, p_ok: true, p_error: null, p_retry_delay_ms: 0 },
    messung,
    fetchImpl
  }), messung);
  const abschluesse = finishAntworten.map(ersteZeile).filter(Boolean);
  if (finishAntworten.length !== synthetisch.length
      || finishAntworten.some((antwort) => !antwort.ok)
      || abschluesse.length !== synthetisch.length
      || abschluesse.some((zeile) => zeile.uebernommen !== true || zeile.neuer_status !== "erledigt")) {
    throw new Z3bAbbruch("Z3b Abschluss war nicht vollstaendig oder eine Lease wurde verloren", "abschluss");
  }

  const nachMetrics = erwarteOk(await rpcAnfrage({
    konfiguration, rpc: "helmut_job_metrics", parameter: { p_seit_minuten: 60 }, messung, fetchImpl
  }), "Z3b Abschlusskennzahlen sind nicht lesbar", "nachpruefung");
  const nachAnkunft = erwarteOk(await rpcAnfrage({
    konfiguration, rpc: "helmut_job_ankunft", parameter: { p_seit_minuten: 60 }, messung, fetchImpl
  }), "Z3b Ankunftskennzahlen sind nicht lesbar", "nachpruefung");
  const fenster = `z3b:${konfiguration.laufKennung}:${konfiguration.mandate}`;
  const nachGlobal = erwarteOk(await rpcAnfrage({
    konfiguration,
    rpc: "helmut_jobs_offen",
    parameter: { p_fenster: [fenster], p_typen: ["source_fetch"] },
    messung,
    fetchImpl
  }), "Z3b globale Fensterzaehlung ist nicht lesbar", "nachpruefung");
  const erstesMandat = "z3b-synth-mandat-0000";
  const nachMandat = erwarteOk(await rpcAnfrage({
    konfiguration,
    rpc: "helmut_jobs_offen",
    parameter: { p_fenster: [fenster], p_typen: ["source_fetch"], p_mandat: erstesMandat },
    messung,
    fetchImpl
  }), "Z3b mandatsbezogene Fensterzaehlung ist nicht lesbar", "nachpruefung");

  const metricsNachher = metricsZeile(ersteZeile(nachMetrics));
  const ankunftNachher = ankunftZeile(ersteZeile(nachAnkunft));
  const globalNachher = statusZeile(ersteZeile(nachGlobal));
  const mandatNachher = statusZeile(ersteZeile(nachMandat));
  const erstesMandatSoll = Math.ceil(synthetisch.length / konfiguration.mandate);
  if (globalNachher.offen !== 0 || globalNachher.fehlgeschlagen !== 0
      || globalNachher.erledigt !== synthetisch.length
      || mandatNachher.offen !== 0 || mandatNachher.fehlgeschlagen !== 0
      || mandatNachher.erledigt !== erstesMandatSoll
      || metricsNachher.laufend !== 0 || metricsNachher.aktiveLeases !== 0) {
    throw new Z3bAbbruch("Z3b Nachpruefung stimmt nicht mit dem synthetischen Lauf ueberein", "nachpruefung");
  }

  const beendet = jetzt();
  return Object.freeze({
    art: "Z3b Supabase Plattformteilnachweis",
    einordnung: "Misst nur den echten Supabase PostgREST Warteschlangenweg; Z2 und Z3a wurden nicht wiederholt",
    ergebnis: "vollstaendig",
    projektRef: konfiguration.projektRef,
    productionBeruehrt: false,
    anbieterAufrufe: 0,
    echteMandatsdaten: 0,
    stufe: konfiguration.mandate,
    synthetischeAuftraege: synthetisch.length,
    parallelitaet: konfiguration.parallelitaet,
    laufKennung: konfiguration.laufKennung,
    begonnenUtc: begonnen.toISOString(),
    beendetUtc: beendet.toISOString(),
    dauerMs: Math.max(0, beendet.getTime() - begonnen.getTime()),
    migrationsvoraussetzungen: Object.freeze({ basis: true, f9: true, z22: true }),
    vorher,
    nachher: Object.freeze({
      metrics: metricsNachher,
      ankunft: ankunftNachher,
      laufGlobal: globalNachher,
      erstesMandat: mandatNachher
    }),
    auftraege: Object.freeze({
      eingereiht: eingereiht.length,
      reserviert: reserviert.length,
      abgeschlossen: abschluesse.length,
      unbekannt: 0,
      doppeltReserviert: 0,
      leaseVerloren: 0
    }),
    http: messung.bericht(),
    aufraeumung: "nicht ausgefuehrt; bleibt ein eigener Freigabeschritt"
  });
}

function sichererFehler(fehler) {
  if (fehler instanceof Z3bAbbruch) return Object.freeze({ grund: fehler.grund, nachricht: fehler.message });
  return Object.freeze({ grund: "interner-fehler", nachricht: "Z3b wurde wegen eines internen Fehlers ohne Detailausgabe abgebrochen" });
}

async function main() {
  try {
    const konfiguration = liesKonfiguration(process.env);
    const bericht = await fuehreMesslauf(konfiguration);
    process.stdout.write(`${JSON.stringify(bericht, null, 2)}\n`);
  } catch (fehler) {
    process.stderr.write(`${JSON.stringify({
      art: "Z3b Supabase Plattformteilnachweis",
      ergebnis: "abgebrochen",
      productionBeruehrt: false,
      automatischeAufraeumung: false,
      fehler: sichererFehler(fehler)
    }, null, 2)}\n`);
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = {
  RPC_ERLAUBT,
  FREMDKENNUNGEN,
  Z3bAbbruch,
  jwtRolle,
  liesZugang,
  freigabeKennung,
  berechneAnfragenObergrenze,
  liesKonfiguration,
  verteilung,
  baueMessung,
  zugangskopf,
  rpcAnfrage,
  pruefeVoraussetzungen,
  fuehreMesslauf,
  sichererFehler
};
