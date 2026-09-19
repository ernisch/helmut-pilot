"use strict";

// Nur manuell bewaffneter Endlauf. Aktivierung ist hier nicht implementiert.
const N = require("../lib/helmut/testnachweis-ziel500");
const { fordere, hash, DirektAbbruch } = require("../lib/helmut/testkohorte-direkt500");
const K = require("../lib/helmut/testkosten-budget");
const { PROJECT_URL } = require("./github-fachzyklus-a");
const CONFIRM = "GEBUNDENE_500_NUR_DEAKTIVIEREN";
const MAX_DAUER = 4 * 3600000;

function auftrag(env, jetzt) {
  fordere(env.GITHUB_REPOSITORY === "ernisch/helmut-pilot" && env.GITHUB_REF === "refs/heads/main"
    && env.GITHUB_EVENT_NAME === "workflow_dispatch", "null500-ende-nur-manuell-main");
  fordere(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || "")
    && env.HELMUT_PRODUCTION_COMMIT === env.GITHUB_SHA, "null500-ende-commit-abweichend");
  N.schluessel(env.HELMUT_TESTFENSTER_ID);
  fordere(/^[a-f0-9]{64}$/.test(env.HELMUT_MANIFEST_HASH || ""), "null500-ende-manifesthash-fehlt");
  const ende = Date.parse(env.HELMUT_TESTFENSTER_ENDE);
  fordere(Number.isFinite(ende) && new Date(ende).toISOString() === env.HELMUT_TESTFENSTER_ENDE
    && ende > jetzt && ende - jetzt <= MAX_DAUER, "null500-ende-frist-ungueltig");
  return { laufId: env.HELMUT_TESTFENSTER_ID, manifestHash: env.HELMUT_MANIFEST_HASH,
    ende, productionCommit: env.GITHUB_SHA };
}

function binde(q, a) {
  N.pruefeQuittung([{ id: N.schluessel(a.laufId), data: q }], a.laufId);
  fordere(hash(q.manifest) === a.manifestHash && q.manifest.productionCommit === a.productionCommit
    && Date.parse(q.manifest.endeAm) === a.ende, "null500-ende-falsches-testfenster");
  q.manifest.ids.forEach(id => require("../lib/helmut/storage").assertTenant(id, "null500Endauftrag"));
  return q;
}

async function steuere({ a, deps }) {
  const start = deps.jetzt();
  let versuche = 0;
  try {
    // Kein Bereitschaftssignal, solange nicht einmal der Zugriff auf genau
    // diese Quittung bestaetigt ist. Abwesenheit vor Aktivierung ist erlaubt.
    let q = await deps.leseQuittung();
    if (q) binde(q, a);
    // Erst dieses Signal, der lebende Actionsjob und die installierte RPC bilden
    // die Vorbedingung fuer eine separat freizugebende manuelle Aktivierung.
    deps.melde({ zustand: "bewaffnet", laufId: a.laufId, manifestHash: a.manifestHash,
      endeAm: new Date(a.ende).toISOString(), aktivierungsrecht: false });
    while (!q) {
      fordere(deps.jetzt() - start < 5 * 60000 && deps.jetzt() < a.ende,
        "null500-ende-keine-aktivierungsquittung");
      await deps.warte(10000);
      q = await deps.leseQuittung();
    }
    binde(q, a);
    while (q.zustand === "aktiv") {
      let grund = deps.jetzt() >= a.ende ? "frist" : null;
      if (!grund) {
        try {
          const auth = await deps.leseKosten();
          const day = q.manifest.vorflugAm.slice(0, 10), k = K.kontrolliere(auth, day);
          if (new Date(deps.jetzt()).toISOString().slice(0, 10) !== day
            || k.gebundenUsd >= 4 || auth.testKostenTage[day].frozen !== null
            || Object.values(auth.testKostenTage[day].calls).some(c => c.status === "ungeklaert")) grund = "notstopp";
        } catch { grund = "notstopp"; }
      }
      if (grund) {
        versuche++;
        // Auch HTTP200 ist kein Abschlussbeweis. Keine automatische Wiederholung
        // bei Fehler, Timeout, verlorenem Ergebnis oder widerspruechlicher Antwort.
        try { await deps.beende(q.manifest, grund); } catch { /* Gegenlesung entscheidet. */ }
        q = binde(await deps.leseQuittung(), a);
        break;
      }
      await deps.warte(Math.min(60000, Math.max(0, a.ende - deps.jetzt())));
      q = binde(await deps.leseQuittung(), a);
    }
    const profile = await deps.leseProfile();
    const ids = new Set(N.auswahl(profile, q));
    const zielAktiv = profile.filter(p => ids.has(p.user_id) && p.aktiv).length;
    const ausserhalbAktiv = profile.filter(p => !ids.has(p.user_id) && p.aktiv).length;
    N.gleich(q, binde(await deps.leseQuittung(), a));
    return { ok: q.zustand === "beendet" && zielAktiv === 0 && ausserhalbAktiv === 0,
      zustand: q.zustand, gesamt: profile.length, zielAktiv, ausserhalbAktiv,
      schreibversuche: versuche, automatischeWiederholung: false, laufendeArbeitAbgebrochen: false,
      manuellerSqlRueckwegNoetig: q.zustand !== "beendet" || zielAktiv !== 0 || ausserhalbAktiv !== 0 };
  } catch (e) {
    return { ok: false, schreibversuche: versuche, automatischeWiederholung: false,
      manuellerSqlRueckwegNoetig: true, grund: e instanceof DirektAbbruch ? e.grund : "null500-ende-unbekannter-ausgang" };
  }
}

async function ausfuehren({ scharf = false, env = process.env, fetchFn = global.fetch,
  jetzt = Date.now, warte = ms => new Promise(r => setTimeout(r, ms)), melde = r => console.log(JSON.stringify(r)) } = {}) {
  try {
    const a = auftrag(env, jetzt());
    if (!scharf) return { ok: true, modus: "eingabepruefung", bewaffnet: false, schreibversuche: 0 };
    fordere(env.HELMUT_TESTENDE_EXECUTE === "1" && env.HELMUT_TESTENDE_CONFIRM === CONFIRM,
      "null500-ende-freigabe-fehlt");
    fordere(String(env.SUPABASE_URL || "").replace(/\/$/, "") === PROJECT_URL
      && env.SUPABASE_SERVICE_ROLE_KEY, "null500-ende-zugang-fehlt");
    async function request(path, body) {
      const r = await fetchFn(PROJECT_URL + "/rest/v1/" + path, { method: body ? "POST" : "GET",
        redirect: "error", signal: AbortSignal.timeout(20000),
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: "application/json", "Content-Type": "application/json", Prefer: "count=exact" },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      fordere(r.status === 200, "null500-ende-speicherfehler");
      const rows = await r.json();
      if (!body) fordere(Array.isArray(rows) && r.headers.get("content-range") === (rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0"),
        "null500-ende-bestand-unvollstaendig");
      return rows;
    }
    return await steuere({ a, deps: { jetzt, warte, melde,
      leseQuittung: async () => {
        const rows = await request("helmut_store?select=id,data&id=eq." + N.schluessel(a.laufId) + "&limit=2");
        return rows.length ? N.pruefeQuittung(rows, a.laufId) : null;
      },
      leseProfile: () => request("mandate_profiles?select=user_id,aktiv&order=user_id&limit=505"),
      leseKosten: async () => {
        const rows = await request("helmut_store?select=data&id=eq.main-auth&limit=2");
        fordere(rows.length === 1, "null500-ende-kosten-unlesbar"); return rows[0].data;
      },
      beende: (manifest, grund) => request("rpc/helmut_testfenster_null500_ende", {
        p_lauf_id: a.laufId, p_manifest: manifest, p_grund: grund, p_bestaetigung: CONFIRM
      })
    } });
  } catch (e) {
    return { ok: false, schreibversuche: 0, grund: e instanceof DirektAbbruch ? e.grund : "null500-ende-ungueltiger-auftrag" };
  }
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && args[0] !== "--scharf")) process.exitCode = 2;
  else ausfuehren({ scharf: args[0] === "--scharf" }).then(r => {
    console.log(JSON.stringify(r, null, 2)); process.exitCode = r.ok ? 0 : 1;
  }).catch(() => { console.error("Ende nicht bestaetigt; unabhaengigen SQL Rueckweg pruefen."); process.exitCode = 1; });
}
module.exports = { auftrag, binde, steuere, ausfuehren, CONFIRM, MAX_DAUER };
