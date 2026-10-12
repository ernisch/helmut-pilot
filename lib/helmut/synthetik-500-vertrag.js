"use strict";
// Eigener Fiktionsvertrag; keine Freigabe und kein Transport.
const S = require("./synthetik-500-profile");
const R = require("./realkohorte-500-vertrag");
const K = require("./testkosten-budget");
const EU = require("./synthetik-500-eu-service-contract");
function pruefeKosten(k, start, end, serviceContractHash = null) {
  if (serviceContractHash === null) return R.pruefeKosten(k, start, end,
    [K.AUFTRAG_V3_LIMIT_MICRO_USD, K.AUFTRAG_V4_LIMIT_MICRO_USD]);
  EU.requireThat(serviceContractHash === EU.HASH && k && Object.keys(k).sort().join("|") ===
    ["tag", "beobachtetAm", "tageslimitMikroUsd", "auftragslimitMikroUsd", "tagVerbrauchtMikroUsd",
      "tagReserviertMikroUsd", "auftragVerbrauchtMikroUsd", "auftragReserviertMikroUsd",
      "restreserveMikroUsd", "laufreserveMikroUsd"].sort().join("|"), "cost-projection-shape");
  EU.requireThat(Object.keys(k).filter(x => x.endsWith("MikroUsd")).every(x => Number.isSafeInteger(k[x]) && k[x] >= 0)
    && k.tageslimitMikroUsd === EU.DAY_MICRO_USD && k.auftragslimitMikroUsd === EU.ORDER_MICRO_USD
    && R.zeit(k.beobachtetAm) && k.tag === start.slice(0, 10) && k.tag === end.slice(0, 10)
    && Date.parse(k.beobachtetAm) <= Date.parse(start) && Date.parse(start) - Date.parse(k.beobachtetAm) <= 60000,
  "cost-projection-binding");
  EU.assertOpening({ dayOtherMicroUSD: k.tagVerbrauchtMikroUsd + k.tagReserviertMikroUsd - EU.PRIVATE_MICRO_USD,
    cumulativeMicroUSD: k.auftragVerbrauchtMikroUsd + k.auftragReserviertMikroUsd });
  const rest = Math.min(EU.DAY_MICRO_USD - k.tagVerbrauchtMikroUsd - k.tagReserviertMikroUsd,
    EU.ORDER_MICRO_USD - k.auftragVerbrauchtMikroUsd - k.auftragReserviertMikroUsd);
  EU.requireThat(k.restreserveMikroUsd === rest && k.laufreserveMikroUsd === EU.RUN_MAX_MICRO_USD
    && rest >= EU.RUN_MAX_MICRO_USD, "complete-run-not-financed");
}
const VERSION = "helmut-synthetik-500/1";
const OFFEN = Object.freeze(["aktivierungs-go", "500er-test-go", "endweg-datenbankabnahme", "endwaechter-live-nachweis"]);
const fordere = (ok, code) => { if (!ok) throw new Error("synthetik500-" + code); };
function pruefePaket(bytes) {
  fordere(Buffer.isBuffer(bytes) || typeof bytes === "string", "paket-fehlt");
  const paket = JSON.parse(String(bytes)), meta = S.pruefePaket(paket);
  return { paket, profile: paket.profile, ids: paket.profile.map(p => p.mandatsId).sort(),
    paketHash: meta.paketHash, idsHash: meta.idsHash, profileHash: meta.profileHash, erwartungenHash: meta.erwartungenHash };
}
function erzeugeVertrag(bytes) {
  const paket = pruefePaket(bytes);
  const PAKET_HASH = paket.paketHash, IDS_HASH = paket.idsHash;
  function pruefeNullbestand(snapshot, ids, profile) {
    // Die erprobte Mengen-/Fremdprofilbindung wird unveraendert wiederverwendet.
    const nullstand = R.pruefeNullbestand(snapshot, ids, profile);
    const { erzeugeZeilen } = require("./synthetik-500-import");
    const erwartet = erzeugeZeilen(paket.paket), rows = new Map(erwartet.mandateRows.map(p => [p.user_id, p]));
    for (const row of snapshot.mandate_profiles) {
      const e = rows.get(row.user_id);
      fordere(e && Object.keys(e).every(k => S.hash(row[k]) === S.hash(e[k])), "nullbestand-feldprojektion");
    }
    const identities = new Map(erwartet.profileRows.map(p => [p.id, p]));
    for (const row of snapshot.profiles.filter(p => identities.has(p.id))) {
      const e = identities.get(row.id);
      fordere(Object.keys(e).every(k => S.hash(row[k]) === S.hash(e[k])), "nullbestand-identitaetsprojektion");
    }
    return nullstand;
  }
  function pruefeManifest(m, paketBytes, snapshot) {
    const p = pruefePaket(paketBytes), eu = EU.isManifest(m);
    fordere(m && Object.keys(m).sort().join("|") === ["version","operationId","paketHash","idsHash","profileHash","erwartungenHash","ids","verteilung","profilnullzustand","vorflugAm","startBis","endeAm","kosten","zustand","offen",...(eu ? ["serviceContractHash"] : [])].sort().join("|"), "manifest-format");
    fordere((m.version === VERSION || eu) && /^synthetik500-[a-zA-Z0-9_-]{8,100}$/.test(m.operationId || "")
      && m.paketHash === PAKET_HASH && p.paketHash === PAKET_HASH && m.idsHash === IDS_HASH
      && S.hash(m.ids) === IDS_HASH && m.profileHash === p.profileHash && m.erwartungenHash === p.erwartungenHash
      && S.hash(m.verteilung) === S.hash(S.VERTEILUNG), "manifest-bindung");
    fordere(m.zustand === "inaktiv-vorbereitung" && S.hash(m.offen) === S.hash(OFFEN), "manifest-keine-freigabe");
    fordere([m.vorflugAm,m.startBis,m.endeAm].every(R.zeit)
      && Date.parse(m.startBis)>Date.parse(m.vorflugAm) && Date.parse(m.startBis)-Date.parse(m.vorflugAm)<=300000
      && Date.parse(m.endeAm)>Date.parse(m.startBis) && Date.parse(m.endeAm)-Date.parse(m.vorflugAm)<=(eu ? EU.ACTIVE_MS : 4*3600000),
    "manifest-zeitfenster");
    const n = pruefeNullbestand(snapshot, m.ids, p.profile);
    fordere(S.hash(m.profilnullzustand)===S.hash(n) && Date.parse(n.beobachtetAm)<=Date.parse(m.vorflugAm)
      && Date.parse(m.vorflugAm)-Date.parse(n.beobachtetAm)<=60000, "nullbestand-bindung-zeit");
    pruefeKosten(m.kosten,m.vorflugAm,m.endeAm,eu ? EU.HASH : null);
    return m;
  }
  function vorbereiten({paketBytes,snapshot,operationId,vorflugAm,startBis,endeAm,kosten,serviceContractHash = null}) {
    fordere(serviceContractHash === null || serviceContractHash === EU.HASH, "EU-contract-hash");
    return pruefeManifest({version:serviceContractHash ? EU.MANIFEST_VERSION : VERSION,
      ...(serviceContractHash ? {serviceContractHash} : {}),operationId,paketHash:PAKET_HASH,idsHash:IDS_HASH,
      profileHash:paket.profileHash,erwartungenHash:paket.erwartungenHash,ids:paket.ids,verteilung:{...S.VERTEILUNG},
      profilnullzustand:pruefeNullbestand(snapshot,paket.ids,paket.profile),vorflugAm,startBis,endeAm,kosten,
      zustand:"inaktiv-vorbereitung",offen:[...OFFEN]},paketBytes,snapshot);
  }
  function pruefeEndquittung(q,m) {
    fordere(q && Object.keys(q).sort().join("|") === "aktiviertAm|bestaetigtAktiv|manifest|operationId|version|zustand"
      && q.version===m.version && q.operationId===m.operationId && S.hash(q.manifest)===S.hash(m)
      && q.zustand==="aktiv" && q.bestaetigtAktiv===500 && R.zeit(q.aktiviertAm)
      && Date.parse(q.aktiviertAm)>=Date.parse(m.vorflugAm) && Date.parse(q.aktiviertAm)<Date.parse(m.startBis),"endquittung-bindung");
    return q;
  }
  return {VERSION,PAKET_HASH,IDS_HASH,OFFEN,VERTEILUNG:S.VERTEILUNG,fordere,hash:S.hash,stabil:R.stabil,
    zeit:R.zeit,sortiere:R.sortiere,fachzeilen:R.fachzeilen,pruefeKosten,pruefePaket,
    pruefeNullbestand,pruefeManifest,vorbereiten,pruefeEndquittung};
}
module.exports = {VERSION,OFFEN,VERTEILUNG:S.VERTEILUNG,fordere,hash:S.hash,stabil:R.stabil,zeit:R.zeit,
  sortiere:R.sortiere,fachzeilen:R.fachzeilen,pruefePaket,erzeugeVertrag,
  pruefeManifest:(m,bytes,s)=>erzeugeVertrag(bytes).pruefeManifest(m,bytes,s),
  vorbereiten:input=>erzeugeVertrag(input.paketBytes).vorbereiten(input),
  pruefeEndquittung:(q,m)=>erzeugeVertrag(S.serialisiere(S.erzeuge())).pruefeEndquittung(q,m)};
