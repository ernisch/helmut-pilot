"use strict";

const V = require("./verstehen-vier");
const { baueVertrag, baueBesitzer } = require("./verstehen-vertrag");
const fordere = (ok, code) => { if (!ok) throw new Error(code); };

// Nur dieser Bedienweg benutzt den Adapter. Keine neuen HTTP-Routen/Crons.
// request bleibt injizierbar; keine Wiederholung eines unklaren Schreibzugriffs.
function adapter({ env = process.env, request: injected, storage: storageDeps, ai: aiDeps, budget: budgetDeps, motorBasis } = {}) {
  const storage = storageDeps || require("./storage");
  const budget = budgetDeps || require("./testkosten-budget");
  const ai = aiDeps || require("./ai");
  const request = injected || (async (path, options = {}) => {
    fordere(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY, "vier-speicherzugang-fehlt");
    const response = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + path, {
      ...options, redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json", Prefer: "return=representation" }
    });
    fordere(response.ok, "vier-speicherzugriff-fehlgeschlagen");
    return response.json();
  });
  const rows = async path => {
    const r = await request("/rest/v1/" + path);
    fordere(Array.isArray(r), "vier-leseantwort-ungueltig"); return r;
  };
  const eine = async path => {
    const r = await rows(path);
    fordere(r.length === 1, "vier-zeile-nicht-eindeutig"); return r[0];
  };
  const cas = id => eine("helmut_verstehen_reservierungen?vorgang_id=eq." + encodeURIComponent(id) + "&select=*&limit=2");
  const quittung = () => eine("helmut_store?id=eq." + V.QUITTUNG + "&select=id,data&limit=2");
  return {
    async profile() {
      // Autorisierte Betreiberinventur. Keine Profilinhalte im Bericht, nur Fingerabdruck.
      const mandate = await rows("mandate_profiles?select=*&order=user_id.asc&limit=505");
      const profile = await rows("profiles?select=*&order=id.asc&limit=505");
      fordere(mandate.length === 504 && profile.length < 505, "vier-profile-abweichend");
      return { anzahl: mandate.length, aktiv: mandate.filter(p => p.aktiv !== false).length,
        hash: V.hash({ mandate, profile }) };
    },
    async leseFall(id) {
      fordere(V.IDS.includes(id), "vier-fremder-vorgang");
      const r = await cas(id);
      const ko = await eine("knowledge_objects?vorgang_id=eq." + encodeURIComponent(id) + "&select=*&limit=2");
      const links = await rows("ko_document_links?knowledge_object_id=eq." + encodeURIComponent(ko.id)
        + "&select=raw_document_id&order=raw_document_id.asc&limit=41");
      fordere(links.length > 0 && links.length <= 40, "vier-dokumentmenge-abweichend");
      const docs = await storage.getRawDocumentsByIds(links.map(l => l.raw_document_id));
      fordere(docs.length === links.length && docs.every(d => links.some(l => l.raw_document_id === d.id)),
        "vier-dokumentmenge-abweichend");
      docs.sort((a, b) => a.id.localeCompare(b.id));
      return { cas: r, ko, docs };
    },
    async voraussetzungen() {
      fordere(storage.v3StoreReady() && ai.isAiEnabled() && ai.aiProviderName() === "azure"
        && ai.understandingModelName() === "gpt-5-mini" && budget.aktiv(env)
        && env.HELMUT_VERSTEHEN_CAS === "on" && env.HELMUT_UNDERSTANDING_LOCK === "on",
      "vier-umgebung-nicht-freigegeben");
      const jobs = await rows("helmut_jobs?status=neq.erledigt&select=id&limit=1");
      const leases = await rows("helmut_verstehen_reservierungen?lease_bis=gt."
        + encodeURIComponent(new Date().toISOString()) + "&select=vorgang_id&limit=1");
      fordere(!jobs.length && !leases.length, "vier-parallelbetrieb");
      // Ein SELECT prueft nur die Existenz des RPC ueber OpenAPI, kein Probe-POST.
      const response = await request("/rest/v1/");
      fordere(response?.paths?.["/rpc/helmut_verstehen_vier_start"], "vier-migration-fehlt");
    },
    reserveUsd: () => budget.reservierungHoeheUsd(),
    kosten: runId => budget.laufGebundenUsd(runId, { env }),
    acquireLock: ttl => storage.acquireGlobalUnderstandingLock(ttl),
    async releaseLock() {
      await storage.releaseGlobalUnderstandingLock();
      // Beide vorhandenen Lock-Backends pruefen; fehlende Freigabe nicht verschweigen.
      const live = await rows("pipeline_locks?job_name=eq.global-understanding&expires_at=gt."
        + encodeURIComponent(new Date().toISOString()) + "&select=job_name");
      const auth = await storage.readAuthStore();
      fordere(!live.length && !(auth.pipelineLocks?.["global-understanding"]?.expiresAt > Date.now()),
        "vier-sperrfreigabe-nicht-bestaetigt");
    },
    async claim(data) {
      const r = await request("/rest/v1/helmut_store", {
        method: "POST", body: JSON.stringify({ id: V.QUITTUNG, data })
      });
      fordere(Array.isArray(r) && r.length === 1 && r[0].id === V.QUITTUNG,
        "vier-quittung-nicht-bestaetigt");
      fordere(V.hash((await quittung()).data) === V.hash(data), "vier-quittung-nicht-bestaetigt");
    },
    async finish(data, rev) {
      const r = await request("/rest/v1/helmut_store?id=eq." + V.QUITTUNG
        + "&data->>nonce=eq." + data.nonce + "&data->>rev=eq." + rev + "&data->>status=eq.laeuft", {
        method: "PATCH", body: JSON.stringify({ data })
      });
      fordere(Array.isArray(r) && r.length === 1, "vier-quittung-nicht-bestaetigt");
      fordere(V.hash((await quittung()).data) === V.hash(data), "vier-quittung-nicht-bestaetigt");
    },
    motorDeps(f, ctx) {
      const id = f.cas.vorgang_id;
      const deps = (motorBasis || require("./understanding").defaultDeps)({ runId: ctx.runId, callType: "understanding-rueckstand" });
      const vertrag = baueVertrag({ besitzer: baueBesitzer(ctx.runId), env, deps: { speicher: storage } });
      fordere(vertrag, "vier-cas-fehlt");
      let gestartet = false, fencing = null;
      const sperren = async args => {
        if (!gestartet) return { ok: false };
        return vertrag.ausgangUnbekannt({ ...args, grund: "vier-kein-bestaetigtes-ergebnis" });
      };
      const gebunden = {
        ...vertrag,
        async reserviere({ vorgangId, eingabeHash }) {
          fordere(vorgangId === id && !gestartet, "vier-reservierung-abweichend");
          // FREIGABE + RESERVIERUNG + MODELLSTART-MARKE IN EINER TRANSAKTION.
          // Auch bei Prozessabbruch vor HTTP entsteht kein automatisch wiederholbares offen.
          const r = await request("/rest/v1/rpc/helmut_verstehen_vier_start", {
            method: "POST", body: JSON.stringify({ p_vorgang_id: id, p_eingabe_hash: eingabeHash,
              p_besitzer: vertrag.besitzer, p_run_id: ctx.runId, p_nonce: ctx.nonce })
          });
          fordere(Array.isArray(r) && r.length === 1 && r[0].erlaubt === true
            && Number(r[0].fencing) === f.cas.fencing + 1, "vier-start-nicht-bestaetigt");
          gestartet = true; fencing = Number(r[0].fencing);
          return { erlaubt: true, fencing, zustand: "modell-laeuft", versuche: f.cas.versuche + 1 };
        },
        async modellstart(args) {
          fordere(gestartet && args.vorgangId === id && args.fencing === fencing, "vier-start-abweichend");
          const r = await cas(id);
          return { erlaubt: r.zustand === "modell-laeuft" && r.besitzer === vertrag.besitzer
            && r.fencing === fencing && Date.parse(r.lease_bis) > Date.now(), grund: "vier-lease-pruefung" };
        },
        freigabe: sperren,
        freigabeOhneAufruf: sperren
      };
      return {
        ...deps, verstehenVertrag: () => gebunden,
        // Der Motor sieht ausschliesslich den gebundenen Bestand; keine allgemeine Suche.
        getExisting: async other => { fordere(other === id, "vier-fremder-vorgang"); return f.ko; },
        getExistingStreng: async other => { fordere(other === id, "vier-fremder-vorgang"); return f.ko; },
        listVorgangDocuments: async koId => { fordere(koId === f.ko.id, "vier-fremder-vorgang"); return f.docs; }
      };
    }
  };
}
module.exports = { adapter };
