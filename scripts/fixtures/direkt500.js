"use strict";

// Ausschliesslich Offline Fixtures. Keine echten Profile oder Production Belege.
const D = require("../../lib/helmut/testkohorte-direkt500");
const P = require("../../lib/helmut/provisioning");
const S = require("../../lib/helmut/storage");
const { baueKohorte } = require("../../lib/helmut/test-kohorte-500");
const JETZT = "2026-09-10T22:00:00.000Z";
const SHA = "a".repeat(40);
const kopie = (x) => JSON.parse(JSON.stringify(x));

function welt() {
  const profile = new Map();
  const mandate = new Map();
  const identitaeten = new Map();
  const users = [];
  let writes = 0;
  let deletes = 0;
  const main = { crawlRuns: Array.from({ length: 36 }, (_, id) => ({ id })) };
  function speichern(p) {
    profile.set(p.id, kopie(p));
    const alt = mandate.get(p.id);
    mandate.set(p.id, { user_id: p.id, ...S.toMandateProfileRow(p),
      created_at: alt?.created_at || JETZT, updated_at: JETZT });
    identitaeten.set(p.id, { ...(identitaeten.get(p.id) || {}), id: p.id, name: p.fullName, email: p.email || null });
  }
  for (let i = 0; i < 9; i++) {
    const id = `bestand-${i}`;
    speichern({ id, fullName: `Offline Bestand ${i}`, profileActive: i < 5 });
    if (i < 5) users.push({ id: `konto-${id}`, politicianId: id, email: `${id}@example.invalid`,
      role: "abgeordneter", active: i < 3 });
  }
  for (const spec of baueKohorte().slice(0, 20)) {
    speichern(P.buildProfile(spec, { aktiv: true }));
    users.push({ id: `konto-${spec.id}`, politicianId: spec.id, email: spec.email,
      name: spec.name, role: "abgeordneter", active: false });
  }
  identitaeten.set("admin-fixture", { id: "admin-fixture", email: "admin@example.invalid" });
  const storage = {
    setTestProfileActive: async (id, active) => {
      const row = mandate.get(id);
      if (!row || !id.startsWith("test-kohorte-")) throw new Error("Fremdes Testziel");
      if (row.aktiv !== active) { writes++; row.aktiv = active; }
      return { ok: true };
    },
    getProfile: async (id) => mandate.has(id)
      ? S.fromMandateProfileRow(kopie(identitaeten.get(id)), kopie(mandate.get(id))) : null,
    saveProfile: async (p) => { writes++; speichern(p); return kopie(p); }
  };
  const accounts = {
    normalizeEmail: (e) => String(e).toLowerCase(),
    listUsers: async () => kopie(users),
    createUser: async ({ email, name, role, politicianId, active }) => {
      const u = { id: `konto-${politicianId}`, email, name, role, politicianId, active };
      users.push(u); return kopie(u);
    },
    updateUser: async (id, patch) => {
      const u = users.find((r) => r.id === id); Object.assign(u, patch); return kopie(u);
    },
    deleteUser: async () => { deletes++; throw new Error("Loeschen verboten"); }
  };
  const snapshot = () => kopie({ mandate: [...mandate.values()], identitaeten: [...identitaeten.values()],
    auth: { users, llmUsage: [], auditEvents: [], pushEvents: [] }, main });
  const w = { profile, mandate, identitaeten, users, main, storage, accounts, snapshot,
    writes: () => writes, deletes: () => deletes };
  w.beleg = beleg(w.snapshot());
  w.deps = {
    jetzt: () => new Date(JETZT),
    leseSnapshot: async () => snapshot(),
    pruefeBetrieb: async () => {},
    leseZiel: async (id) => kopie(mandate.get(id)),
    schreibe: async ({ id, spec, vorgang }) => vorgang === "provisionierung"
      ? P.provisionTenant(spec, { storage, accounts }, { neuAktiv: false, kontoBeiFehlerBehalten: true })
      : P.activateTenant(id, { storage, accounts })
  };
  return w;
}

function beleg(snapshot) {
  const abgenommenAm = "2026-09-10T21:50:00.000Z";
  const aktive = snapshot.mandate.filter((p) => p.aktiv).map((p) => p.user_id);
  return { schemaVersion: 1, stufe: "a", abgenommenAm, productionCommit: SHA,
    geschuetzterBestandHash: D.pruefeSnapshot(snapshot, "vorpruefung").geschuetzterBestandHash,
    reservierungen: 124, budgetTag: "2026-09-10", frischefenster: "2026-09-10T00Z",
    auftraege: baueKohorte().slice(0, 20).flatMap((s) => D.KLASSEN.map((job_type) => ({
      id: `${s.id}_${job_type}`, tenant_id: s.id, job_type, status: "erledigt",
      freshness_window: "2026-09-10T00Z", finished_at: "2026-09-10T21:40:00.000Z"
    }))),
    qualitaet: aktive.map((tenant_id) => ({ tenant_id, urteil: "bestanden",
      begruendung: "Nur eine Offline Fixture fuer den Sicherheitsvertrag.", beleg: "belege/500/offline-fixture.md" })),
    quellen: {
      warteschlange: { haengendeLeases: 0, dubletten: 0 },
      kosten: { aufrufeHeute: 124, preisJeAufrufUsd: 0.003 },
      modellaufrufe: { auswertbar: true, quelle: "Offline Fixture", unbekannteModellaufrufe: 0, drosselungen: 0 },
      realeMandate: { gesamt: 9, aktiv: 5, geloescht: 0 },
      grundlinie: { realeMandate: 9, realeMandateAktiv: 5, realeMandateGeloescht: 0 },
      laufbilanz: { verarbeitet: 60, fehlgeschlagen: 0, vollstaendig: true },
      drain: { rueckstandWachstum: 0 },
      riegel: { auswertbar: true, vollstaendig: true, quelle: "Offline Fixture", kommunikationsversuche: 0 },
      deployment: { githubCommitSha: SHA },
      startfenster: { gepruefteCrons: 13, startErlaubt: true, konflikte: [] },
      tagesplan: { klassen: { realeVollstaendigBedient: true, real: 5 },
        zuteilung: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`bestand-${i}`, { notwendig: 1 }])) },
      laufzeitMinuten: 5
    }
  };
}

function env(vorgang) {
  return { GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: SHA, HELMUT_PRODUCTION_COMMIT: SHA,
    SUPABASE_URL: "https://ddckuvvpcytqbyfmbvie.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "offline-fixture-key",
    HELMUT_CRON_SECRET: "offline-fixture-cron", HELMUT_TESTKOHORTE_EXECUTE: "1",
    HELMUT_TESTKOHORTE_CONFIRM: D.WORTE[vorgang] };
}
module.exports = { welt, beleg, env, kopie, JETZT, SHA };
