"use strict";

// Helmut — IN-SPEICHER-TREIBER der Arbeitswarteschlange (Testhilfe, OP-30).
// =============================================================================================
// EHRLICHE EINORDNUNG, ganz oben, weil sie die wichtigste Aussage ueber diese Datei ist:
//
//   Dieser Treiber ist eine ATTRAPPE. Er ERSETZT KEINEN DATENBANKNACHWEIS.
//   Der Datenbanknachweis ist `scripts/jobqueue-datenbank-test.js` gegen einen echten
//   PostgreSQL-Server. Diese Datei existiert aus einem einzigen Grund: der
//   1000-Profile-Skalierungsnachweis muss auch dort laufen, wo kein Server steht (CI,
//   fremder Rechner), und er muss ohne Netz laufen.
//
//   Damit die Attrappe nicht heimlich etwas anderes tut als die Datenbank, prueft
//   `scripts/jobqueue-vertrag-test.js` Abschnitt „Gleichheit mit der Datenbank" dieselben
//   Faelle gegen BEIDE — und meldet jede Abweichung als Fehlschlag. Die Attrappe ist damit
//   nachweislich verhaltensgleich in genau den Punkten, die der Vertrag zusagt.
//
// Er bildet die Semantik von 20260808_scalable_job_queue.sql nach:
//   * eindeutiger idempotency_key ueber ALLE Status,
//   * Reservierung nach (priority, due_at, created_at), nur faellige,
//   * Wiederaufnahme abgelaufener Leases, dabei attempts++,
//   * erschoepfte Auftraege werden VOR der Ausgabe endgueltig fehlgeschlagen,
//   * Abschluss und Lease-Verlaengerung sind an den Halter gebunden,
//   * last_error auf 500 Zeichen gekappt, zu grosser Payload wird abgelehnt.
//
// Die Zeit ist INJIZIERBAR (`now`), damit Lease-Ablauf und Faelligkeit ohne echtes Warten
// pruefbar sind.

// `tenant_narrative` gehoert seit Migration 20260809_jobqueue_narrativ.sql zur CHECK-Menge —
// die Attrappe MUSS dieselbe Menge kennen, sonst wiche sie von der Datenbank ab (der
// Vertragstest prueft die Gleichheit in beide Richtungen).
const AUFGABENTYPEN = new Set([
  "source_fetch", "document_understanding", "mandate_projection", "briefing_materialization",
  "tenant_narrative"
]);

// Die Wartezeitformel wird NICHT nachgebaut, sondern aus der Anwendung geliehen — sonst
// gaebe es drei Fassungen derselben Regel (SQL, App, Attrappe) und zwei davon koennten
// stillschweigend auseinanderlaufen.
const { wartezeitS } = require("../../lib/helmut/scalable-pipeline");

function erzeugeSpeicherWarteschlange({ now = () => Date.now() } = {}) {
  const zeilen = new Map();     // id -> Zeile
  const nachSchluessel = new Map();  // idempotency_key -> id
  let laufendeNummer = 0;

  function neueId() {
    laufendeNummer += 1;
    return `job-${String(laufendeNummer).padStart(8, "0")}`;
  }

  function kappen(zeile) {
    if (zeile.last_error != null && String(zeile.last_error).length > 500) {
      zeile.last_error = String(zeile.last_error).slice(0, 500);
    }
    if (zeile.payload && JSON.stringify(zeile.payload).length > 20000) {
      throw new Error(`helmut_jobs: payload zu gross fuer job_type ${zeile.job_type}`);
    }
    zeile.updated_at = new Date(now()).toISOString();
  }

  async function enqueue(auftrag) {
    if (!AUFGABENTYPEN.has(auftrag.jobType)) {
      return { verfuegbar: false, grund: "helmut_jobs_type_chk" };
    }
    const vorhanden = nachSchluessel.get(auftrag.idempotencyKey);
    if (vorhanden) return { verfuegbar: true, id: vorhanden, neu: false };

    const id = neueId();
    const jetzt = new Date(now()).toISOString();
    const zeile = {
      id,
      job_type: auftrag.jobType,
      idempotency_key: auftrag.idempotencyKey,
      freshness_window: auftrag.freshnessWindow,
      due_at: auftrag.dueAt || jetzt,
      // Urspruengliche Faelligkeit, wird NIE veraendert — exakt wie in der Migration
      // (Abschlussreview 2026-08-08). Ohne sie waere jede Rueckstandsmessung durch
      // Zurueckstellen loeschbar.
      first_due_at: auftrag.dueAt || jetzt,
      priority: Number.isFinite(auftrag.priority) ? auftrag.priority : 100,
      status: "wartend",
      created_at: jetzt,
      updated_at: jetzt,
      attempts: 0,
      max_attempts: Number.isFinite(auftrag.maxAttempts) ? auftrag.maxAttempts : 5,
      lease_owner: null,
      lease_expires_at: null,
      last_error: null,
      finished_at: null,
      payload: auftrag.payload || {},
      tenant_id: auftrag.tenantId == null ? null : String(auftrag.tenantId),
      first_claimed_at: null
    };
    try { kappen(zeile); } catch (error) { return { verfuegbar: false, grund: error.message }; }
    zeilen.set(id, zeile);
    nachSchluessel.set(auftrag.idempotencyKey, id);
    return { verfuegbar: true, id, neu: true };
  }

  async function claim({ owner, limit = 10, leaseMs = 120000, types = null } = {}) {
    if (!owner || !String(owner).trim()) {
      return { verfuegbar: false, grund: "p_owner ist Pflicht", auftraege: [] };
    }
    const jetztMs = now();

    // (a) Erschoepfte zuerst endgueltig fehlschlagen lassen — exakt wie in der SQL.
    for (const z of zeilen.values()) {
      const leaseAb = z.lease_expires_at ? Date.parse(z.lease_expires_at) : 0;
      const kandidat = z.status === "wartend" || (z.status === "laeuft" && leaseAb < jetztMs);
      if (kandidat && z.attempts >= z.max_attempts) {
        z.status = "fehlgeschlagen";
        z.finished_at = new Date(jetztMs).toISOString();
        z.lease_owner = null;
        z.lease_expires_at = null;
        z.last_error = z.last_error || "versuche-erschoepft";
      }
    }

    // (b)+(c) Reservieren.
    //
    // RESSOURCENHINWEIS (Kapazitaetssprint 2026-08-09, Befund R6 — KEINE Semantikaenderung):
    // die Sortierung stand frueher direkt auf den Zeilen und rief `Date.parse` INNERHALB des
    // Vergleichs auf — bei m Kandidaten also bis zu 3·m·log(m) Zeichenkettenanalysen je
    // Reservierung. Im 1000-Mandate-Stresstest (ueber 12 000 Zeilen, mehrere tausend
    // Reservierungen) war das der groesste Einzelposten der Laufzeit, und zwar vollstaendig
    // im TESTGERUEST, nicht in der geprueften Fachlogik. Jetzt wird jeder Schluessel GENAU
    // EINMAL berechnet (decorate–sort–undecorate). Die Reihenfolge ist Feld fuer Feld
    // dieselbe: Prioritaet, dann Faelligkeit, dann Anlagezeit, dann Kennung.
    const kandidaten = [];
    for (const z of zeilen.values()) {
      if (types && !types.includes(z.job_type)) continue;
      if (z.attempts >= z.max_attempts) continue;
      if (z.status === "wartend") {
        if (!(Date.parse(z.due_at) <= jetztMs)) continue;
      } else if (z.status === "laeuft") {
        if (!(Date.parse(z.lease_expires_at || 0) < jetztMs)) continue;
      } else continue;
      kandidaten.push([z.priority, Date.parse(z.due_at), Date.parse(z.created_at), String(z.id), z]);
    }
    kandidaten.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]) || a[3].localeCompare(b[3]));

    const genommen = kandidaten.slice(0, Math.max(0, limit)).map((k) => k[4]);
    for (const z of genommen) {
      z.status = "laeuft";
      z.lease_owner = owner;
      z.lease_expires_at = new Date(jetztMs + Math.max(leaseMs, 1000)).toISOString();
      z.attempts += 1;
      if (!z.first_claimed_at) z.first_claimed_at = new Date(jetztMs).toISOString();
      z.updated_at = new Date(jetztMs).toISOString();
    }
    return { verfuegbar: true, auftraege: genommen.map((z) => ({ ...z })) };
  }

  async function finish({ id, owner, ok, error = null, retryDelayMs = 0 } = {}) {
    const z = zeilen.get(id);
    if (!z || z.lease_owner !== owner || z.status !== "laeuft") {
      return { verfuegbar: true, uebernommen: false, neuerStatus: null };
    }
    const jetztMs = now();
    if (ok) {
      z.status = "erledigt";
      z.finished_at = new Date(jetztMs).toISOString();
      z.last_error = null;
    } else if (z.attempts >= z.max_attempts) {
      z.status = "fehlgeschlagen";
      z.finished_at = new Date(jetztMs).toISOString();
      z.last_error = error;
    } else {
      z.status = "wartend";
      z.due_at = new Date(jetztMs + Math.max(0, Number(retryDelayMs) || 0)).toISOString();
      z.last_error = error;
    }
    z.lease_owner = null;
    z.lease_expires_at = null;
    kappen(z);
    return { verfuegbar: true, uebernommen: true, neuerStatus: z.status };
  }

  async function extendLease({ id, owner, leaseMs = 120000 } = {}) {
    const z = zeilen.get(id);
    if (!z || z.lease_owner !== owner || z.status !== "laeuft") {
      return { verfuegbar: true, verlaengert: false };
    }
    z.lease_expires_at = new Date(now() + Math.max(leaseMs, 1000)).toISOString();
    return { verfuegbar: true, verlaengert: true };
  }

  async function metrics(seitMinuten = 1440) {
    const jetztMs = now();
    const ab = jetztMs - Math.max(1, seitMinuten) * 60000;
    const alle = [...zeilen.values()];
    const zaehleNach = (feld) => alle.reduce((akk, z) => {
      akk[z[feld]] = (akk[z[feld]] || 0) + 1; return akk;
    }, {});
    const wartendFaellig = alle.filter((z) => z.status === "wartend" && Date.parse(z.due_at) <= jetztMs);
    const erledigt = alle.filter((z) => z.status === "erledigt" && z.finished_at && Date.parse(z.finished_at) >= ab);
    const offene = alle.filter((z) => z.status === "wartend" || z.status === "laeuft");
    const mandate = offene.filter((z) => z.tenant_id);
    return {
      verfuegbar: true,
      kennzahlen: {
        wartend: alle.filter((z) => z.status === "wartend").length,
        laufend: alle.filter((z) => z.status === "laeuft").length,
        erledigt_im_zeitraum: erledigt.length,
        fehlgeschlagen_gesamt: alle.filter((z) => z.status === "fehlgeschlagen").length,
        endgueltig_fehler: alle.filter((z) => z.status === "fehlgeschlagen" && z.attempts >= z.max_attempts).length,
        wiederholungen: alle.reduce((s, z) => s + Math.max(0, z.attempts - 1), 0),
        aktive_leases: alle.filter((z) => z.status === "laeuft" && Date.parse(z.lease_expires_at || 0) > jetztMs).length,
        aeltester_faelliger_s: wartendFaellig.length
          ? Math.max(...wartendFaellig.map((z) => (jetztMs - Date.parse(z.due_at)) / 1000)) : 0,
        durchsatz_pro_stunde: erledigt.length / Math.max((jetztMs - ab) / 3600000, 0.0001),
        mittlere_dauer_s: erledigt.length
          ? erledigt.reduce((s, z) => s + (Date.parse(z.finished_at) - Date.parse(z.first_claimed_at || z.created_at)) / 1000, 0) / erledigt.length
          : null,
        nach_typ: zaehleNach("job_type"),
        nach_status: zaehleNach("status"),
        ueberfaellige_mandate: new Set(mandate
          .filter((z) => Date.parse(z.first_due_at || z.due_at) <= jetztMs - 24 * 3600 * 1000)
          .map((z) => z.tenant_id)).size,
        max_mandatsalter_s: mandate.length
          ? Math.max(...mandate.map((z) => (jetztMs - Date.parse(z.first_due_at || z.due_at)) / 1000)) : 0,
        // ── WARTEZEITSICHT (Migration 20260812) ───────────────────────────────────────
        // Dieselbe Formel wie die SQL-Fassung: `greatest(created_at, first_due_at)` ist der
        // Zeitpunkt, ab dem der Auftrag bearbeitbar ist; eine in der Zukunft liegende
        // Bearbeitbarkeit ergibt 0 s, nicht eine negative Wartezeit. Der Vertragstest
        // vergleicht Attrappe und echte Datenbank Zeile fuer Zeile.
        aeltester_offener_s: offene.length
          ? Math.max(...offene.map((z) => wartezeitS(z, jetztMs))) : 0,
        max_mandatswartezeit_s: mandate.length
          ? Math.max(...mandate.map((z) => wartezeitS(z, jetztMs))) : 0,
        ueberfaellige_mandate_wartezeit: new Set(mandate
          .filter((z) => wartezeitS(z, jetztMs) >= 24 * 3600)
          .map((z) => z.tenant_id)).size
      }
    };
  }

  // NEU (Sprint V3-Anbindung): dieselben drei Faehigkeiten wie die Datenbank —
  // Vorbedingungen zaehlen und einen Auftrag EHRLICH zurueckstellen.
  // Der Vertragstest prueft die Gleichheit von Attrappe und echter Datenbank.
  async function offeneVorbedingungen({ fenster = null, typen = null } = {}) {
    // Befund O3: `helmut_jobs_offen` nimmt seit der Korrektur eine LISTE von Fenstern
    // (`j.freshness_window = any(p_fenster)`), weil geteilte Abrufe in 8-h-Fenstern liegen,
    // mandatsbezogene Arbeit aber in einem 24-h-Fenster. Die Attrappe MUSS dasselbe tun —
    // eine Attrappe, die enger vergleicht als die Datenbank, meldet „keine Vorbedingung
    // offen" und ist damit genau die Sorte falsches Gruen, die dieser Pfad ausschliessen soll.
    //
    // RESSOURCENHINWEIS (Kapazitaetssprint 2026-08-09, Befund R6 — KEINE Semantikaenderung):
    // diese Funktion baute frueher SECHS vollstaendige Arrays ueber alle Zeilen (einmal
    // filtern, dann fuenfmal zaehlen) und verglich Fenster und Typ mit `Array.includes`.
    // Sie wird einmal je Auftrag gerufen; im 1000-Mandate-Stresstest waren das ueber
    // 12 000 Aufrufe auf ueber 12 000 Zeilen — im CPU-Profil der groesste Einzelposten des
    // Testgeruests (22,6 s) und der Haupttreiber der Speicherbereinigung. Jetzt: EIN
    // Durchlauf, `Set`-Vergleiche, keine Zwischenarrays. Dieselben fuenf Zahlen.
    const fensterMenge = fenster == null
      ? null
      : new Set((Array.isArray(fenster) ? fenster : [fenster]).map(String));
    const typMenge = (typen == null || !typen.length) ? null : new Set(typen);
    let wartend = 0;
    let laufend = 0;
    let fehlgeschlagen = 0;
    let erledigt = 0;
    for (const z of zeilen.values()) {
      if (fensterMenge && !fensterMenge.has(z.freshness_window)) continue;
      if (typMenge && !typMenge.has(z.job_type)) continue;
      if (z.status === "wartend") wartend += 1;
      else if (z.status === "laeuft") laufend += 1;
      else if (z.status === "fehlgeschlagen") fehlgeschlagen += 1;
      else if (z.status === "erledigt") erledigt += 1;
    }
    return {
      verfuegbar: true,
      offen: wartend + laufend,
      wartend,
      laufend,
      fehlgeschlagen,
      erledigt
    };
  }

  async function zurueckstellen({ id, owner, delayMs = 60000, grund = null } = {}) {
    const z = zeilen.get(id);
    if (!z || z.lease_owner !== owner || z.status !== "laeuft") {
      return { verfuegbar: true, uebernommen: false, neueFaelligkeit: null };
    }
    z.status = "wartend";
    z.lease_owner = null;
    z.lease_expires_at = null;
    // Warten ist KEIN Fehlversuch — exakt wie `helmut_defer_job`.
    z.attempts = Math.max(0, (Number(z.attempts) || 0) - 1);
    z.due_at = new Date(now() + Math.max(1000, Number(delayMs) || 60000)).toISOString();
    if (grund != null) z.last_error = `zurueckgestellt: ${String(grund).slice(0, 200)}`;
    kappen(z);
    return { verfuegbar: true, uebernommen: true, neueFaelligkeit: z.due_at };
  }

  return {
    enqueue, claim, finish, extendLease, metrics,
    offeneVorbedingungen, zurueckstellen,
    // Testhilfen (nicht Teil des Produktionsvertrags):
    _zeilen: zeilen,
    alle: () => [...zeilen.values()],
    nachStatus: (s) => [...zeilen.values()].filter((z) => z.status === s),
    // RESSOURCENSCHONENDE ZUGRIFFE (Kapazitaetssprint 2026-08-09, Befund R6).
    // `alle()` baut bei JEDEM Aufruf ein neues Array ueber alle Zeilen. Im
    // 1000-Mandate-Stresstest wurde es einmal je Auftragsabschluss aufgerufen, um EINE Zeile
    // zu suchen — bei rund 12 000 Zeilen und 12 000 Abschluessen sind das ueber 10^8
    // Objektkopien, allein fuer die Buchhaltung des Testgeruests. Die drei Zugriffe unten
    // liefern dasselbe Ergebnis ohne Zwischenarray. Sie aendern WEDER die Warteschlangen-
    // semantik NOCH die fachliche Belastung des Tests — nur seinen Speicher- und Rechenbedarf.
    hole: (id) => zeilen.get(id) || null,
    groesse: () => zeilen.size,
    zaehle: (praedikat) => {
      let n = 0;
      for (const z of zeilen.values()) if (praedikat(z)) n += 1;
      return n;
    },
    zuruecksetzen: () => { zeilen.clear(); nachSchluessel.clear(); laufendeNummer = 0; }
  };
}

module.exports = { erzeugeSpeicherWarteschlange, AUFGABENTYPEN };
