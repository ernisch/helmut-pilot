"use strict";

// Rein lokaler Vertragstest fuer den echten Z3b Supabase Messlaeufer.
// Kein Netz, keine Datenbank, kein Zugangsschluessel und keine Testdaten ausserhalb
// dieses Prozesses. Alle HTTP Antworten kommen aus der Attrappe unten.

const fs = require("fs");
const path = require("path");
const {
  PRODUCTION_PROJECT_REF,
  TEST_PROJECT_REF,
  TEST_PROJECT_URL,
  MESSSTUFEN,
  probeprofilFuerMandate
} = require("./fixtures/z3b-supabase-plan");
const Z = require("./skalierung-z3b-supabase");

const ROOT = path.join(__dirname, "..");
const TEST_SECRET = "sb_secret_NURLOKALEATTRAPPE123456789";
let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function wirft(fn, muster) {
  try {
    fn();
    return false;
  } catch (fehler) {
    return muster.test(String(fehler && fehler.message));
  }
}

async function verwirft(fn, muster) {
  try {
    await fn();
    return false;
  } catch (fehler) {
    return muster.test(String(fehler && fehler.message));
  }
}

function jwt(rolle) {
  const kodiert = (wert) => Buffer.from(JSON.stringify(wert)).toString("base64url");
  return `${kodiert({ alg: "HS256", typ: "JWT" })}.${kodiert({ role: rolle })}.attrappensignatur`;
}

function umgebung({ stufe = 25, auftraege = stufe, parallelitaet = 4, lauf = "z3bprobe01" } = {}) {
  return {
    HELMUT_SOURCE_MODE: "off",
    HELMUT_Z3B_SUPABASE_PROJECT_REF: TEST_PROJECT_REF,
    HELMUT_Z3B_SUPABASE_URL: TEST_PROJECT_URL,
    HELMUT_Z3B_SUPABASE_SECRET_KEY: TEST_SECRET,
    HELMUT_Z3B_STUFE: String(stufe),
    HELMUT_Z3B_AUFTRAEGE: String(auftraege),
    HELMUT_Z3B_PARALLELITAET: String(parallelitaet),
    HELMUT_Z3B_LAUF: lauf,
    HELMUT_Z3B_FREIGABE: Z.freigabeKennung({ mandate: stufe, laufKennung: lauf })
  };
}

function antwort(status, daten, roh = null) {
  return {
    status,
    ok: status >= 200 && status <= 299,
    text: async () => roh == null ? (daten == null ? "" : JSON.stringify(daten)) : String(roh)
  };
}

function baueSupabaseAttrappe() {
  const aufrufe = [];
  const jobs = [];
  let nummer = 0;

  function statusFuer(parameter) {
    const fenster = Array.isArray(parameter.p_fenster) ? new Set(parameter.p_fenster) : null;
    const typen = Array.isArray(parameter.p_typen) ? new Set(parameter.p_typen) : null;
    const mandat = typeof parameter.p_mandat === "string" && parameter.p_mandat.trim() ? parameter.p_mandat.trim() : null;
    const auswahl = jobs.filter((job) => (!fenster || fenster.has(job.freshness_window))
      && (!typen || typen.has(job.job_type))
      && (!mandat || job.tenant_id == null || job.tenant_id === mandat));
    return [{
      offen: auswahl.filter((job) => job.status === "wartend" || job.status === "laeuft").length,
      wartend: auswahl.filter((job) => job.status === "wartend").length,
      laufend: auswahl.filter((job) => job.status === "laeuft").length,
      fehlgeschlagen: auswahl.filter((job) => job.status === "fehlgeschlagen").length,
      erledigt: auswahl.filter((job) => job.status === "erledigt").length
    }];
  }

  const fetchImpl = async (url, optionen) => {
    const rpc = new URL(url).pathname.split("/").pop();
    const parameter = JSON.parse(optionen.body || "{}");
    aufrufe.push({ url, rpc, method: optionen.method, headers: optionen.headers, parameter });
    if (rpc === "helmut_job_metrics") {
      return antwort(200, [{
        wartend: jobs.filter((job) => job.status === "wartend").length,
        laufend: jobs.filter((job) => job.status === "laeuft").length,
        erledigt_im_zeitraum: jobs.filter((job) => job.status === "erledigt").length,
        fehlgeschlagen_gesamt: jobs.filter((job) => job.status === "fehlgeschlagen").length,
        endgueltig_fehler: 0,
        wiederholungen: 0,
        aktive_leases: jobs.filter((job) => job.status === "laeuft").length,
        aeltester_faelliger_s: 0,
        durchsatz_pro_stunde: jobs.filter((job) => job.status === "erledigt").length,
        mittlere_dauer_s: 0.1,
        nach_typ: jobs.length ? { source_fetch: jobs.length } : {},
        nach_status: jobs.reduce((acc, job) => ({ ...acc, [job.status]: (acc[job.status] || 0) + 1 }), {}),
        ueberfaellige_mandate: 0,
        max_mandatsalter_s: 0
      }]);
    }
    if (rpc === "helmut_job_ankunft") {
      const erledigt = jobs.filter((job) => job.status === "erledigt").length;
      return antwort(200, [{
        eingereiht_im_zeitraum: jobs.length,
        erledigt_im_zeitraum: erledigt,
        abflussverhaeltnis: jobs.length ? erledigt / jobs.length : null,
        fenster_minuten: Number(parameter.p_seit_minuten) || 60
      }]);
    }
    if (rpc === "helmut_jobs_offen") return antwort(200, statusFuer(parameter));
    if (rpc === "helmut_enqueue_job") {
      nummer += 1;
      const id = `nur-lokale-auftrag-id-${String(nummer).padStart(4, "0")}`;
      jobs.push({
        id,
        job_type: parameter.p_job_type,
        idempotency_key: parameter.p_idempotency_key,
        freshness_window: parameter.p_freshness_window,
        payload: parameter.p_payload,
        tenant_id: parameter.p_tenant_id,
        status: "wartend",
        lease_owner: null
      });
      return antwort(200, [{ id, neu: true }]);
    }
    if (rpc === "helmut_claim_jobs") {
      const typen = Array.isArray(parameter.p_types) ? new Set(parameter.p_types) : null;
      const auswahl = jobs.filter((job) => job.status === "wartend" && (!typen || typen.has(job.job_type)))
        .slice(0, Number(parameter.p_limit) || 0);
      for (const job of auswahl) {
        job.status = "laeuft";
        job.lease_owner = parameter.p_owner;
      }
      return antwort(200, auswahl.map((job) => ({ ...job })));
    }
    if (rpc === "helmut_finish_job") {
      const job = jobs.find((wert) => wert.id === parameter.p_id
        && wert.status === "laeuft" && wert.lease_owner === parameter.p_owner);
      if (!job) return antwort(200, [{ uebernommen: false, neuer_status: null }]);
      job.status = "erledigt";
      job.lease_owner = null;
      return antwort(200, [{ uebernommen: true, neuer_status: "erledigt" }]);
    }
    return antwort(404, { geheim: "ANTWORTRUMPF DARF NICHT IN DEN BERICHT" });
  };

  return { fetchImpl, aufrufe, jobs };
}

async function main() {
  console.log("Helmut — lokaler Vertragstest des Z3b Supabase Messlaeufers\n");

  console.log("== A · Ziel, Freigabe und Zugang ==");
  const basis = Z.liesKonfiguration(umgebung());
  check("A1 Exakt das isolierte Testprojekt wird angenommen",
    basis.projektRef === TEST_PROJECT_REF && basis.url === TEST_PROJECT_URL);
  check("A2 Der Zugangsschluessel ist nicht aufzaehlbar und fehlt in JSON",
    !Object.keys(basis).includes("zugang") && !JSON.stringify(basis).includes(TEST_SECRET));

  const ohneUrl = umgebung();
  delete ohneUrl.HELMUT_Z3B_SUPABASE_URL;
  check("A3 Ohne ausdrueckliche Test URL wird vor jedem Netzweg abgebrochen",
    wirft(() => Z.liesKonfiguration(ohneUrl), /URL|Testprojekt/));

  const ohneKey = umgebung();
  delete ohneKey.HELMUT_Z3B_SUPABASE_SECRET_KEY;
  check("A4 Ohne testgebundenen Backend Schluessel wird abgebrochen",
    wirft(() => Z.liesKonfiguration(ohneKey), /Zugang fehlt/));

  const production = umgebung();
  production.HELMUT_Z3B_SUPABASE_PROJECT_REF = PRODUCTION_PROJECT_REF;
  production.HELMUT_Z3B_SUPABASE_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
  check("A5 Production wird durch Kennung und URL abgelehnt",
    wirft(() => Z.liesKonfiguration(production), /Production/));

  const fremd = umgebung();
  fremd.HELMUT_Z3B_SUPABASE_PROJECT_REF = "abcdefghijklmnopqrst";
  fremd.HELMUT_Z3B_SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
  check("A6 Jedes andere Supabase Projekt wird abgelehnt",
    wirft(() => Z.liesKonfiguration(fremd), /Testprojekt/));

  const publishable = umgebung();
  publishable.HELMUT_Z3B_SUPABASE_SECRET_KEY = "sb_publishable_attrappe123456789";
  check("A7 Publishable Keys werden als Backend Zugang abgelehnt",
    wirft(() => Z.liesKonfiguration(publishable), /Secret Key|Anon/));

  const doppelt = umgebung();
  doppelt.HELMUT_Z3B_SUPABASE_SERVICE_ROLE_KEY = jwt("service_role");
  check("A8 Zwei gleichzeitig gesetzte Backend Schluessel werden abgelehnt",
    wirft(() => Z.liesKonfiguration(doppelt), /gleichzeitig/));

  const anon = umgebung();
  delete anon.HELMUT_Z3B_SUPABASE_SECRET_KEY;
  anon.HELMUT_Z3B_SUPABASE_SERVICE_ROLE_KEY = jwt("anon");
  check("A9 Ein alter Anon JWT wird abgelehnt",
    wirft(() => Z.liesKonfiguration(anon), /service_role/));

  const service = umgebung();
  delete service.HELMUT_Z3B_SUPABASE_SECRET_KEY;
  service.HELMUT_Z3B_SUPABASE_SERVICE_ROLE_KEY = jwt("service_role");
  const serviceConfig = Z.liesKonfiguration(service);
  check("A10 Ein alter service_role JWT bleibt als begrenzter Rueckfall moeglich",
    serviceConfig.zugangsart === "service_role");
  check("A11 Neue Secret Keys werden nur als apikey und nicht als Bearer JWT gesendet",
    Z.zugangskopf(basis.zugang).apikey === TEST_SECRET
      && !("Authorization" in Z.zugangskopf(basis.zugang)));
  check("A12 Nur der alte service_role JWT bekommt den Authorization Kopf",
    /^Bearer /.test(Z.zugangskopf(serviceConfig.zugang).Authorization || ""));

  const mitProductionEnv = umgebung();
  mitProductionEnv.SUPABASE_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
  check("A13 Sichtbare allgemeine Supabase Variablen sperren den Lauf",
    wirft(() => Z.liesKonfiguration(mitProductionEnv), /nicht testgebundene Zugangsdaten/));
  const mitAzure = umgebung();
  mitAzure.AZURE_OPENAI_KEY = "wird-nie-ausgegeben";
  check("A14 Sichtbare Anbieterkennungen sperren den Lauf",
    wirft(() => Z.liesKonfiguration(mitAzure), /nicht testgebundene Zugangsdaten/));
  const quelleAn = umgebung();
  quelleAn.HELMUT_SOURCE_MODE = "live";
  check("A15 Quellenmodus muss hart ausgeschaltet sein",
    wirft(() => Z.liesKonfiguration(quelleAn), /SOURCE_MODE.*off/));
  const ohneFreigabe = umgebung();
  delete ohneFreigabe.HELMUT_Z3B_FREIGABE;
  check("A16 Ohne laufbezogene Freigabekennung wird abgebrochen",
    wirft(() => Z.liesKonfiguration(ohneFreigabe), /nicht laufbezogen freigeschaltet/));

  console.log("\n== B · Stufen und harte Mengenriegel ==");
  check("B1 Genau die geplanten Stufen lassen sich konfigurieren",
    MESSSTUFEN.every((stufe) => Z.liesKonfiguration(umgebung({ stufe })).mandate === stufe));
  check("B2 Eine ungeplante 300er Stufe wird abgelehnt",
    wirft(() => Z.liesKonfiguration(umgebung({ stufe: 300 })), /Stufe abgelehnt/));
  check("B3 Die 200er Auftragsgrenze ist hart",
    wirft(() => Z.liesKonfiguration(umgebung({ stufe: 200, auftraege: 201 })), /Auftragszahl|interne/));
  check("B4 Die 500er Auftragsgrenze ist hart",
    wirft(() => Z.liesKonfiguration(umgebung({ stufe: 500, auftraege: 501 })), /Auftragszahl|interne/));
  check("B5 Parallelitaet 64 wird abgelehnt",
    wirft(() => Z.liesKonfiguration(umgebung({ parallelitaet: 64 })), /Parallelitaet abgelehnt/));
  check("B6 Nur 4, 8, 16 und 32 werden angenommen",
    [4, 8, 16, 32].every((parallelitaet) => Z.liesKonfiguration(umgebung({ parallelitaet })).parallelitaet === parallelitaet));
  check("B7 Der vorausberechnete HTTP Bedarf bleibt je Profil unter dem Riegel",
    MESSSTUFEN.every((stufe) => {
      const config = Z.liesKonfiguration(umgebung({ stufe, auftraege: stufe, parallelitaet: 32 }));
      return config.anfragenObergrenze <= probeprofilFuerMandate(stufe).anfragenGesamtMax;
    }));

  console.log("\n== C · RPC Riegel, Fehler und Geheimnisschutz ==");
  let unerlaubteAufrufe = 0;
  const messungUnerlaubt = Z.baueMessung(10);
  check("C1 Ein nicht geplanter RPC wird vor fetch abgewiesen",
    await verwirft(() => Z.rpcAnfrage({
      konfiguration: basis,
      rpc: "helmut_prune_jobs",
      messung: messungUnerlaubt,
      fetchImpl: async () => { unerlaubteAufrufe += 1; return antwort(200, null); }
    }), /nicht freigeplant/) && unerlaubteAufrufe === 0);

  let fehlerAufrufe = 0;
  const messungFehler = Z.baueMessung(10);
  let fehlerNachricht = "";
  try {
    await Z.rpcAnfrage({
      konfiguration: basis,
      rpc: "helmut_job_metrics",
      messung: messungFehler,
      fetchImpl: async () => {
        fehlerAufrufe += 1;
        throw new Error(`Netz meldet versehentlich ${TEST_SECRET}`);
      }
    });
  } catch (fehler) { fehlerNachricht = String(fehler && fehler.message); }
  check("C2 Netzfehler werden nicht wiederholt", fehlerAufrufe === 1);
  check("C3 Ein vom Transport wiederholter Geheimwert erscheint nicht im Fehler",
    !fehlerNachricht.includes(TEST_SECRET) && /Netzfehler/.test(fehlerNachricht));
  check("C4 Der Bericht enthaelt keine Antwort oder Geheimwerte",
    !JSON.stringify(messungFehler.bericht()).includes(TEST_SECRET));

  let drosselAufrufe = 0;
  const messung429 = Z.baueMessung(10);
  const drosselFetch = async () => {
    drosselAufrufe += 1;
    return antwort(429, null, `geheimer Rumpf ${TEST_SECRET}`);
  };
  const drossel1 = await Z.rpcAnfrage({
    konfiguration: basis, rpc: "helmut_job_metrics", messung: messung429, fetchImpl: drosselFetch
  });
  const drossel2 = await Z.rpcAnfrage({
    konfiguration: basis, rpc: "helmut_job_metrics", messung: messung429, fetchImpl: drosselFetch
  });
  const drossel3Gesperrt = await verwirft(() => Z.rpcAnfrage({
    konfiguration: basis, rpc: "helmut_job_metrics", messung: messung429, fetchImpl: drosselFetch
  }), /gestoppt/);
  check("C5 Nach zwei 429 in Folge wird hart gestoppt",
    !drossel1.ok && !drossel2.ok && drossel2.gestoppt && drossel3Gesperrt && drosselAufrufe === 2);
  check("C6 429 Rumpf und Geheimwert fehlen im Bericht",
    !JSON.stringify(messung429.bericht()).includes("geheimer Rumpf")
      && !JSON.stringify(messung429.bericht()).includes(TEST_SECRET));

  let serverAufrufe = 0;
  const messung5xx = Z.baueMessung(10);
  const serverFetch = async () => { serverAufrufe += 1; return antwort(503, null, "Failing row contains (privat)"); };
  await Z.rpcAnfrage({ konfiguration: basis, rpc: "helmut_job_metrics", messung: messung5xx, fetchImpl: serverFetch });
  const server2 = await Z.rpcAnfrage({
    konfiguration: basis, rpc: "helmut_job_metrics", messung: messung5xx, fetchImpl: serverFetch
  });
  check("C7 Nach zwei 5xx in Folge wird ohne Retry gestoppt",
    server2.gestoppt && serverAufrufe === 2 && messung5xx.bericht().serverfehler === 2);
  check("C8 Datenbankfehlertexte fehlen vollstaendig im Bericht",
    !JSON.stringify(messung5xx.bericht()).includes("Failing row"));

  let limitAufrufe = 0;
  const messungLimit = Z.baueMessung(1);
  await Z.rpcAnfrage({
    konfiguration: basis,
    rpc: "helmut_job_metrics",
    messung: messungLimit,
    fetchImpl: async () => { limitAufrufe += 1; return antwort(200, []); }
  });
  const limitGesperrt = await verwirft(() => Z.rpcAnfrage({
    konfiguration: basis,
    rpc: "helmut_job_metrics",
    messung: messungLimit,
    fetchImpl: async () => { limitAufrufe += 1; return antwort(200, []); }
  }), /nfrageobergrenze/);
  check("C9 Die HTTP Obergrenze sperrt vor dem naechsten fetch",
    limitGesperrt && limitAufrufe === 1 && messungLimit.bericht().anfragen === 1);

  const messungF9 = Z.baueMessung(20);
  const ohneF9 = async (url) => new URL(url).pathname.endsWith("/helmut_job_ankunft")
    ? antwort(404, null, "F9 fehlt und dieser Rumpf bleibt geheim")
    : antwort(200, [{}]);
  let f9Fehler = "";
  try { await Z.pruefeVoraussetzungen(basis, messungF9, ohneF9); }
  catch (fehler) { f9Fehler = `${fehler.grund}:${fehler.message}`; }
  check("C10 Fehlendes F9 wird vor jeder Einreihung ehrlich erkannt",
    /migration-f9/.test(f9Fehler) && /F9/.test(f9Fehler) && messungF9.bericht().nachRpc.helmut_enqueue_job == null);
  check("C11 Der fehlende F9 Antwortrumpf erscheint nicht im Fehler",
    !f9Fehler.includes("dieser Rumpf"));

  console.log("\n== D · Vollstaendiger Offline Gegenlauf ==");
  const attrappe = baueSupabaseAttrappe();
  let tick = 0;
  const bericht = await Z.fuehreMesslauf(basis, {
    fetchImpl: attrappe.fetchImpl,
    jetzt: () => new Date(Date.parse("2026-08-27T12:00:00.000Z") + (tick++ * 1234))
  });
  const berichtText = JSON.stringify(bericht);
  check("D1 Der begrenzte Lauf reiht, reserviert und beendet exakt 25 Auftraege",
    bericht.auftraege.eingereiht === 25
      && bericht.auftraege.reserviert === 25
      && bericht.auftraege.abgeschlossen === 25);
  check("D2 Es gibt keine unbekannten, doppelten oder lease verlorenen Auftraege",
    bericht.auftraege.unbekannt === 0
      && bericht.auftraege.doppeltReserviert === 0
      && bericht.auftraege.leaseVerloren === 0);
  check("D3 Alle Attrappenauftraege sind am Ende abgeschlossen",
    attrappe.jobs.length === 25 && attrappe.jobs.every((job) => job.status === "erledigt"));
  check("D4 Exakt die vorausberechnete Zahl von HTTP Anfragen wurde verwendet",
    bericht.http.anfragen === basis.anfragenObergrenze
      && attrappe.aufrufe.length === basis.anfragenObergrenze,
    `${bericht.http.anfragen} Anfragen`);
  check("D5 p50, p95 und p99 werden als Verteilung ausgewiesen",
    bericht.http.dauerMs.n === bericht.http.anfragen
      && bericht.http.dauerMs.p50 != null
      && bericht.http.dauerMs.p95 != null
      && bericht.http.dauerMs.p99 != null);
  check("D6 Jeder Aufruf ist POST und bleibt auf der RPC Erlaubnisliste",
    attrappe.aufrufe.every((aufruf) => aufruf.method === "POST"
      && aufruf.url.startsWith(`${TEST_PROJECT_URL}/rest/v1/rpc/`)
      && Z.RPC_ERLAUBT.includes(aufruf.rpc)));
  check("D7 Kein Anbieter, Tabellenendpunkt, DELETE oder Aufraeum RPC wurde beruehrt",
    attrappe.aufrufe.every((aufruf) => !/azure|openai|google|prune|delete|helmut_jobs\?/.test(aufruf.url.toLowerCase())));
  check("D8 Der Bericht enthaelt weder Zugang, Auftrag IDs noch Nutzdaten",
    !berichtText.includes(TEST_SECRET)
      && !berichtText.includes("nur-lokale-auftrag-id")
      && !berichtText.includes("p_payload"));
  check("D9 Der Bericht ordnet sich als Teilnachweis ein und wiederholt Z2 oder Z3a nicht",
    /Plattformteilnachweis/.test(bericht.art)
      && /Z2 und Z3a wurden nicht wiederholt/.test(bericht.einordnung));
  check("D10 Production, Anbieter und echte Mandatsdaten bleiben nachweislich unberuehrt",
    bericht.productionBeruehrt === false && bericht.anbieterAufrufe === 0 && bericht.echteMandatsdaten === 0);
  check("D11 Es gibt keine automatische Loeschung",
    /nicht ausgefuehrt/.test(bericht.aufraeumung));

  const quelltext = fs.readFileSync(path.join(ROOT, "scripts", "skalierung-z3b-supabase.js"), "utf8");
  check("D12 Im Werkzeug ist kein echter Secret oder JWT Wert gespeichert",
    !/sb_secret_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}/.test(quelltext));

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

main().catch((fehler) => {
  console.error("Testabbruch ohne Detailausgabe");
  process.exit(1);
});
