"use strict";

// Echte Provisionierung und echter Kohortenadapter, ausschliesslich Speicherattrappen.
// Der Fehler nach einem bereits erfolgten Profilwrite darf weder loeschen noch gruen werden.
const assert = require("node:assert/strict");
const P = require("../lib/helmut/provisioning");
const V = require("../lib/helmut/testkohorte-vorwaerts");
const K = require("../lib/helmut/testkohorte-betrieb");
const { baueKohorte } = require("../lib/helmut/test-kohorte-500");
const echteProvisionierung = P.provisionTenant;
const basis = baueKohorte().find((s) => s.id === "test-kohorte-b-001");
const spec = { ...basis, password: "nur-offline-testpasswort" };
const behalten = { neuAktiv: false, kontoBeiFehlerBehalten: true };
const clone = (x) => structuredClone(x);
let bestanden = 0;

function bestand(fehler = null) {
  const users = [];
  const profiles = new Map();
  const writes = [];
  const geloescht = [];
  const deps = {
    env: {},
    accounts: {
      normalizeEmail: (s) => String(s).trim().toLowerCase(),
      listUsers: async () => {
        if (users.length && fehler === "kontolesen-wirft") throw new Error("Lesefehler");
        if (users.length && fehler === "konto-nicht-lesbar") return [];
        return clone(users);
      },
      createUser: async (u) => {
        const row = { ...u, id: "offline-konto", politicianId: fehler === "kollision" ? `${u.politicianId}-kollision` : u.politicianId };
        users.push(row); writes.push("konto");
        if (fehler === "konto-schreiben-wirft") throw new Error("Fehler nach Kontowrite");
        return clone(row);
      },
      updateUser: async (id, patch) => {
        const row = users.find((u) => u.id === id);
        Object.assign(row, patch); writes.push("konto-update"); return clone(row);
      },
      deleteUser: async (id) => { geloescht.push(id); users.splice(users.findIndex((u) => u.id === id), 1); }
    },
    storage: {
      getProfile: async (id) => clone(profiles.get(id) || null),
      saveProfile: async (p) => {
        if (fehler === "profil-vorher") throw new Error("Profilwrite gescheitert");
        profiles.set(p.id, clone(p)); writes.push("profil");
        if (fehler === "profil-nachher") throw new Error("Zweite Ablage gescheitert");
      }
    }
  };
  return { users, profiles, writes, geloescht, deps };
}

async function fall(name, fn) { await fn(); bestanden += 1; console.log(`PASS ${name}`); }

async function kohortenlauf(b) {
  // Der echte Standardaufruf setzt die neue Option. Nur sein Speicher wird injiziert.
  const storage = require("../lib/helmut/storage");
  const vorherLesen = storage.getProfile;
  P.provisionTenant = (s, _deps, optionen) => echteProvisionierung(s, b.deps, optionen);
  storage.getProfile = b.deps.storage.getProfile;
  try {
    return await V.fuehreProvisionierungAus({
      stufe: "b", kennungen: [spec.id], modus: V.MODUS_SCHARF,
      env: {
        [K.EXECUTE_FLAG]: "1", [K.CONFIRM_VARIABLE]: "TESTKOHORTE_STUFE_B_PROVISIONIERUNG_BESTAETIGT",
        HELMUT_V3_STORE: "1", HELMUT_STORAGE_BACKEND: "supabase",
        SUPABASE_URL: "https://offline.invalid", SUPABASE_SERVICE_ROLE_KEY: "offline-attrappe",
        HELMUT_PROFILE_DB_MODE: "1", HELMUT_CRAWL_RUN_RETENTION: "20"
      },
      startfensterBefund: { startErlaubt: true, konflikte: [], gepruefteCrons: 13, startMinuteUtc: 21 * 60 + 36, endeMinuteUtc: 1440 + 3 * 60 + 59 },
      jetztUtc: "2026-09-05T22:00:00Z"
    });
  } finally { P.provisionTenant = echteProvisionierung; storage.getProfile = vorherLesen; }
}

(async () => {
  for (const [fehler, grund] of [
    ["kollision", "politician-id-collision"],
    ["kontolesen-wirft", "auth-write-not-persisted"],
    ["konto-nicht-lesbar", "auth-write-not-persisted"],
    ["profil-vorher", "profile-write-failed"],
    ["profil-nachher", "profile-write-failed"],
    ["konto-schreiben-wirft", "auth-write-failed"]
  ]) await fall(`Teilbestand bleibt bei ${fehler} ohne Loeschung erhalten`, async () => {
    const b = bestand(fehler);
    const r = await echteProvisionierung(spec, b.deps, behalten);
    assert.equal(r.ok, false); assert.equal(r.reason, grund);
    assert.equal(r.teilbestandMoeglich, true);
    assert.equal(b.geloescht.length, 0); assert.equal(b.users.length, 1);
    assert.equal(b.users[0].active, false);
    assert.ok(!r.log.some((e) => e.step === "rollback" && e.status === "ok"));
    if (fehler !== "konto-schreiben-wirft") {
      assert.equal(r.rueckweg, "gesperrt"); assert.equal(r.kontoId, b.users[0].id);
    }
  });

  await fall("Konto ohne Profil wird bei Wiederholung weiterhin geschuetzt", async () => {
    const b = bestand("profil-vorher");
    await echteProvisionierung(spec, b.deps, behalten);
    const vorher = clone(b.users); const writes = b.writes.length;
    const r = await echteProvisionierung(spec, b.deps, behalten);
    assert.equal(r.reason, "protected-tenant"); assert.equal(b.writes.length, writes);
    assert.deepEqual(b.users, vorher); assert.equal(b.geloescht.length, 0);
  });

  await fall("Echter Kohortenpfad meldet partiellen Profilwrite als Fehler", async () => {
    const b = bestand("profil-nachher"); const r = await kohortenlauf(b);
    assert.equal(r.ok, false); assert.equal(r.fehlgeschlagen, 1);
    assert.equal(r.angelegt, 0); assert.equal(r.bereitsVorhanden, 0);
    assert.equal(r.ergebnisse[0].zustand, "teilbestand-inaktiv");
    assert.equal(r.ergebnisse[0].schreibfehler, "profile-write-failed");
    assert.equal(r.ergebnisse[0].teilbestand.kontoId, "offline-konto");
    assert.equal(b.geloescht.length, 0); assert.equal(b.users[0].active, false);
    assert.equal(b.profiles.size, 1);
  });

  await fall("Vollstaendige inaktive Anlage bleibt ohne Duplikate wiederholbar", async () => {
    const b = bestand(); const r = await kohortenlauf(b); const wiederholt = await kohortenlauf(b);
    assert.equal(r.ok, true); assert.equal(r.angelegt, 1);
    assert.equal(wiederholt.ok, true); assert.equal(wiederholt.bereitsVorhanden, 1);
    assert.equal(wiederholt.angelegt, 0); assert.equal(b.users.length, 1);
    assert.equal(b.users[0].active, false); assert.equal(b.profiles.size, 1);
    assert.equal(b.profiles.get(spec.id).profileActive, false); assert.equal(b.geloescht.length, 0);
  });

  await fall("Fremde Profile und aktive Fremdkonten bleiben unveraendert", async () => {
    for (const art of ["profil", "konto", "email"]) {
      const b = bestand();
      if (art === "profil") b.profiles.set(spec.id, { id: spec.id, profileActive: false });
      else b.users.push({ id: "fremd", email: spec.email, politicianId: art === "email" ? "fremdes-mandat" : spec.id, active: true });
      const vorher = clone(b.users); const r = await echteProvisionierung(spec, b.deps, behalten);
      assert.equal(r.ok, false); assert.equal(b.writes.length, 0);
      assert.equal(b.geloescht.length, 0); assert.deepEqual(b.users, vorher);
    }
  });

  await fall("Ungenaue Option und aktive Anlage werden vor Writes abgewiesen", async () => {
    const b = bestand();
    await assert.rejects(() => echteProvisionierung(spec, b.deps, { neuAktiv: true, kontoBeiFehlerBehalten: true }), TypeError);
    await assert.rejects(() => echteProvisionierung(spec, b.deps, { neuAktiv: false, kontoBeiFehlerBehalten: "true" }), TypeError);
    assert.equal(b.writes.length, 0);
  });

  await fall("Regulaere Provisionierung behaelt den bisherigen Rueckweg", async () => {
    const b = bestand("profil-vorher");
    const r = await echteProvisionierung(spec, b.deps, { neuAktiv: false });
    assert.equal(r.ok, false); assert.equal(r.rueckweg, "ok");
    assert.equal(b.geloescht.length, 1); assert.equal(b.users.length, 0);
  });
  console.log(`${bestanden} Fehlerpruefungen bestanden, 0 fehlgeschlagen`);
})().catch((e) => { console.error(e); process.exitCode = 1; });
