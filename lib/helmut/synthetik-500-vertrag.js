"use strict";
// Eigener Fiktionsvertrag; keine Freigabe und kein Transport.
const S = require("./synthetik-500-profile");
const R = require("./realkohorte-500-vertrag");
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
    const p = pruefePaket(paketBytes);
    fordere(m && Object.keys(m).sort().join("|") === ["version","operationId","paketHash","idsHash","profileHash","erwartungenHash","ids","verteilung","profilnullzustand","vorflugAm","startBis","endeAm","kosten","zustand","offen"].sort().join("|"), "manifest-format");
    fordere(m.version === VERSION && /^synthetik500-[a-zA-Z0-9_-]{8,100}$/.test(m.operationId || "")
      && m.paketHash === PAKET_HASH && p.paketHash === PAKET_HASH && m.idsHash === IDS_HASH
      && S.hash(m.ids) === IDS_HASH && m.profileHash === p.profileHash && m.erwartungenHash === p.erwartungenHash
      && S.hash(m.verteilung) === S.hash(S.VERTEILUNG), "manifest-bindung");
    fordere(m.zustand === "inaktiv-vorbereitung" && S.hash(m.offen) === S.hash(OFFEN), "manifest-keine-freigabe");
    fordere([m.vorflugAm,m.startBis,m.endeAm].every(R.zeit)
      && Date.parse(m.startBis)>Date.parse(m.vorflugAm) && Date.parse(m.startBis)-Date.parse(m.vorflugAm)<=300000
      && Date.parse(m.endeAm)>Date.parse(m.startBis) && Date.parse(m.endeAm)-Date.parse(m.vorflugAm)<=4*3600000,
    "manifest-zeitfenster");
    const n = pruefeNullbestand(snapshot, m.ids, p.profile);
    fordere(S.hash(m.profilnullzustand)===S.hash(n) && Date.parse(n.beobachtetAm)<=Date.parse(m.vorflugAm)
      && Date.parse(m.vorflugAm)-Date.parse(n.beobachtetAm)<=60000, "nullbestand-bindung-zeit");
    R.pruefeKosten(m.kosten,m.vorflugAm,m.endeAm);
    return m;
  }
  function vorbereiten({paketBytes,snapshot,operationId,vorflugAm,startBis,endeAm,kosten}) {
    return pruefeManifest({version:VERSION,operationId,paketHash:PAKET_HASH,idsHash:IDS_HASH,
      profileHash:paket.profileHash,erwartungenHash:paket.erwartungenHash,ids:paket.ids,verteilung:{...S.VERTEILUNG},
      profilnullzustand:pruefeNullbestand(snapshot,paket.ids,paket.profile),vorflugAm,startBis,endeAm,kosten,
      zustand:"inaktiv-vorbereitung",offen:[...OFFEN]},paketBytes,snapshot);
  }
  function pruefeEndquittung(q,m) {
    fordere(q && Object.keys(q).sort().join("|") === "aktiviertAm|bestaetigtAktiv|manifest|operationId|version|zustand"
      && q.version===VERSION && q.operationId===m.operationId && S.hash(q.manifest)===S.hash(m)
      && q.zustand==="aktiv" && q.bestaetigtAktiv===500 && R.zeit(q.aktiviertAm)
      && Date.parse(q.aktiviertAm)>=Date.parse(m.vorflugAm) && Date.parse(q.aktiviertAm)<Date.parse(m.startBis),"endquittung-bindung");
    return q;
  }
  return {VERSION,PAKET_HASH,IDS_HASH,OFFEN,VERTEILUNG:S.VERTEILUNG,fordere,hash:S.hash,stabil:R.stabil,
    zeit:R.zeit,sortiere:R.sortiere,fachzeilen:R.fachzeilen,pruefeKosten:R.pruefeKosten,pruefePaket,
    pruefeNullbestand,pruefeManifest,vorbereiten,pruefeEndquittung};
}
module.exports = {VERSION,OFFEN,VERTEILUNG:S.VERTEILUNG,fordere,hash:S.hash,stabil:R.stabil,zeit:R.zeit,
  sortiere:R.sortiere,fachzeilen:R.fachzeilen,pruefePaket,erzeugeVertrag,
  pruefeManifest:(m,bytes,s)=>erzeugeVertrag(bytes).pruefeManifest(m,bytes,s),
  vorbereiten:input=>erzeugeVertrag(input.paketBytes).vorbereiten(input),
  pruefeEndquittung:(q,m)=>erzeugeVertrag(S.serialisiere(S.erzeuge())).pruefeEndquittung(q,m)};
