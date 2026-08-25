"use strict";

// Helmut — STAPELPROVISIONIERUNG UND WIEDERHOLUNGSSICHERHEIT (Skalierungssprint 2026-08-25).
// =============================================================================================
// Dieser Nachweis gehoert zur Vorbereitung auf 25/50/100 Mandate. Er sichert drei Dinge,
// die vorher NICHT gesichert waren:
//
//   1. WIEDERHOLUNGSSICHERHEIT DER WERTE. Ein zweiter, identischer Provisionierungslauf
//      darf keine Dubletten erzeugen — das galt schon — und er darf ausserdem KEINE
//      nachtraeglich gepflegten Profilfelder loeschen. Genau das tat er vorher:
//      `buildProfile` erzeugt 13 Felder, `toMandateProfileRow` schreibt jede Spalte,
//      der Upsert ersetzt die Zeile vollstaendig.
//
//   2. KEINE STILLE REAKTIVIERUNG. Ein Wiederholungslauf setzte `profileActive: true`
//      und machte damit ein deaktiviertes Mandat wieder aktiv — eine Aktivierung ohne
//      Freigabe (CLAUDE.md §5). Aktivierung muss ausdruecklich angefordert werden.
//
//   3. STAPELBETRIEB. Fuer 25/50/100 Mandate braucht es eine Vorpruefung der GANZEN
//      Liste vor dem ersten Schreibvorgang, einen Trockenlauf als Standard und eine
//      ehrliche Bilanz.
//
// AUSSCHLIESSLICH SYNTHETISCHE MANDANTEN (Praefix `stapel-`). KEIN Netz, KEINE echte DB,
// keine Beruehrung realer Mandate.

const fs = require("fs");
const path = require("path");

process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_V3_STORE;

const storage = require("../lib/helmut/storage");
const accounts = require("../lib/helmut/accounts");
const provisioning = require("../lib/helmut/provisioning");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

const IDS = ["stapel-eins", "stapel-zwei", "stapel-drei", "stapel-fremd",
  "stapel-vier", "stapel-fuenf"];
function spec(id, extra = {}) {
  return {
    id,
    email: `${id}@synthetic.test`,
    name: `Testperson ${id}`,
    password: "stapel-pass-123",
    party: "Partei Alpha",
    parliamentType: "Landtag",
    state: "Berlin",
    constituency: "Wahlkreis 1",
    committees: ["Ausschuss fuer Gesundheit"],
    focusTopics: ["Pflege"],
    ...extra
  };
}

const dataDir = path.join(__dirname, "..", ".helmut-data");
const guarded = ["store.json", "auth.json", ...IDS.map((i) => `p-${i}.json`)].map((f) => path.join(dataDir, f));
const backups = guarded.map((f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null));

function restore() {
  guarded.forEach((f, i) => {
    try {
      if (backups[i] === null) { if (fs.existsSync(f)) fs.unlinkSync(f); }
      else fs.writeFileSync(f, backups[i], "utf8");
    } catch { /* Aufraeumen darf den Testausgang nicht bestimmen */ }
  });
}

async function profilVon(id) { return storage.getProfile(id); }
async function anzahlNutzer(id) {
  return (await accounts.listUsers()).filter((u) => u.politicianId === id).length;
}
async function anzahlProfile(id) {
  return (await storage.listProfiles()).filter((p) => p.id === id).length;
}

(async () => {
  try {
    // Ausgangslage sauber: eventuelle Reste aus einem frueheren Lauf entfernen.
    for (const id of IDS) { try { await provisioning.teardownTenant(id); } catch { /* egal */ } }

    // ── 1 · Ein zweiter identischer Lauf loescht keine gepflegten Felder ──────────
    abschnitt("1 · Wiederholungslauf bewahrt nachtraeglich gepflegte Profilfelder");
    const r1 = await provisioning.provisionTenant(spec("stapel-eins"));
    check("1.1 Erstanlage erfolgreich", r1.ok === true && r1.created === true, JSON.stringify(r1.reason || r1.errors));

    // Nachtraegliche Pflege, wie sie im Betrieb ueber die Profilmaske entsteht.
    const gepflegt = await profilVon("stapel-eins");
    gepflegt.regionalInterests = ["Bezirk Mitte", "Bezirk Pankow"];
    gepflegt.relevantMinistries = ["Gesundheitsministerium"];
    gepflegt.nameVariants = ["T. Person"];
    gepflegt.governmentRole = "Sprecherin";
    await storage.saveProfile(gepflegt);
    const vorher = await profilVon("stapel-eins");
    check("1.2 Gepflegte Felder sind gespeichert",
      Array.isArray(vorher.regionalInterests) && vorher.regionalInterests.length === 2
      && vorher.governmentRole === "Sprecherin");

    const r2 = await provisioning.provisionTenant(spec("stapel-eins"));
    const nachher = await profilVon("stapel-eins");
    check("1.3 Zweiter identischer Lauf ist erfolgreich und legt NICHT neu an",
      r2.ok === true && r2.created === false);
    check("1.4 KEINE Dublette (1 Nutzer, 1 Profil)",
      (await anzahlNutzer("stapel-eins")) === 1 && (await anzahlProfile("stapel-eins")) === 1);
    check("1.5 regionalInterests ueberlebt den Wiederholungslauf",
      Array.isArray(nachher.regionalInterests) && nachher.regionalInterests.length === 2,
      JSON.stringify(nachher.regionalInterests));
    check("1.6 relevantMinistries ueberlebt den Wiederholungslauf",
      Array.isArray(nachher.relevantMinistries) && nachher.relevantMinistries.length === 1,
      JSON.stringify(nachher.relevantMinistries));
    check("1.7 nameVariants ueberlebt den Wiederholungslauf",
      Array.isArray(nachher.nameVariants) && nachher.nameVariants.length === 1,
      JSON.stringify(nachher.nameVariants));
    check("1.8 governmentRole ueberlebt den Wiederholungslauf",
      nachher.governmentRole === "Sprecherin", String(nachher.governmentRole));
    check("1.9 Die Spec-Felder sind weiterhin korrekt gesetzt",
      nachher.party === "Partei Alpha" && nachher.state === "Berlin"
      && Array.isArray(nachher.committees) && nachher.committees.length === 1);

    // ── 2 · Keine stille Reaktivierung ───────────────────────────────────────────
    abschnitt("2 · Ein Wiederholungslauf reaktiviert kein deaktiviertes Mandat");
    await provisioning.deactivateTenant("stapel-eins");
    const deaktiviert = await profilVon("stapel-eins");
    check("2.1 Mandat ist deaktiviert", deaktiviert.profileActive === false, String(deaktiviert.profileActive));

    const r3 = await provisioning.provisionTenant(spec("stapel-eins"));
    const nachWiederholung = await profilVon("stapel-eins");
    // Das Zusammenspiel ist absichtlich FAIL-CLOSED und schaerfer als eine blosse
    // Nicht-Reaktivierung: die Verschmelzung haelt `profileActive:false` fest,
    // `validateProfile` meldet daraufhin den Zustand "deaktiviert", und
    // `provisionTenant` bricht VOR jedem Schreibvorgang ab. Ein Wiederholungslauf
    // gegen ein deaktiviertes Mandat aktiviert es also nicht nur nicht — er
    // veraendert es ueberhaupt nicht.
    check("2.2 Wiederholungslauf bricht sauber ab statt still zu reaktivieren",
      r3.ok === false && r3.reason === "profile-not-ready"
      && r3.validation.state === "deaktiviert", JSON.stringify(r3.reason));
    check("2.3 Das Mandat bleibt DEAKTIVIERT (keine Aktivierung ohne Freigabe)",
      nachWiederholung.profileActive === false, String(nachWiederholung.profileActive));

    const r4 = await provisioning.provisionTenant(spec("stapel-eins", { reaktivieren: true }));
    const reaktiviert = await profilVon("stapel-eins");
    check("2.4 Mit ausdruecklichem reaktivieren:true wird wieder aktiviert",
      r4.ok === true && reaktiviert.profileActive === true, String(reaktiviert.profileActive));

    // ── 3 · Vorpruefung des ganzen Pakets vor dem ersten Schreibvorgang ──────────
    abschnitt("3 · Stapel-Vorpruefung: unvollstaendig, widerspruechlich, doppelt");

    const unvollstaendig = await provisioning.provisionBatch(
      [spec("stapel-zwei"), { id: "stapel-drei", name: "Ohne Pflichtfelder" }], {}, { ausfuehren: true });
    check("3.1 Unvollstaendige Spec bricht den GESAMTEN Stapel ab",
      unvollstaendig.ok === false && unvollstaendig.grund === "vorpruefung-fehlgeschlagen");
    check("3.2 Dabei wurde NICHTS geschrieben (auch nicht das gueltige Mandat)",
      (await anzahlNutzer("stapel-zwei")) === 0 && (await anzahlProfile("stapel-zwei")) === 0);
    check("3.3 Die Vorbefunde benennen die Fundstelle konkret",
      unvollstaendig.vorbefunde.some((b) => b.includes("#2") && b.includes("stapel-drei")),
      JSON.stringify(unvollstaendig.vorbefunde.slice(0, 3)));

    const doppelteId = await provisioning.provisionBatch(
      [spec("stapel-zwei"), spec("stapel-zwei", { email: "anders@synthetic.test" })], {}, { ausfuehren: true });
    check("3.4 Doppelte id im Paket wird erkannt und bricht ab",
      doppelteId.ok === false && doppelteId.vorbefunde.some((b) => b.includes("doppelt")),
      JSON.stringify(doppelteId.vorbefunde));

    const doppelteMail = await provisioning.provisionBatch(
      [spec("stapel-zwei"), { ...spec("stapel-drei"), email: "stapel-zwei@synthetic.test" }], {}, { ausfuehren: true });
    check("3.5 Doppelte E-Mail im Paket wird erkannt und bricht ab",
      doppelteMail.ok === false && doppelteMail.vorbefunde.some((b) => b.includes("E-Mail")),
      JSON.stringify(doppelteMail.vorbefunde));
    check("3.6 Die doppelte E-Mail erscheint NUR maskiert im Befund",
      !JSON.stringify(doppelteMail.vorbefunde).includes("stapel-zwei@synthetic.test"),
      JSON.stringify(doppelteMail.vorbefunde));

    const leer = await provisioning.provisionBatch([], {}, { ausfuehren: true });
    check("3.7 Leeres Paket wird abgewiesen", leer.ok === false && leer.grund === "leeres-paket");

    // ── 4 · Trockenlauf ist der Standard und schreibt nichts ─────────────────────
    abschnitt("4 · Trockenlauf");
    const trocken = await provisioning.provisionBatch([spec("stapel-zwei"), spec("stapel-drei")]);
    check("4.1 Ohne ausfuehren:true ist es ein Trockenlauf",
      trocken.ok === true && trocken.trockenlauf === true);
    check("4.2 Der Trockenlauf hat NICHTS geschrieben",
      (await anzahlNutzer("stapel-zwei")) === 0 && (await anzahlProfile("stapel-zwei")) === 0
      && (await anzahlNutzer("stapel-drei")) === 0);
    check("4.3 Der Trockenlauf sagt fuer beide 'anlegen' voraus",
      trocken.ergebnisse.length === 2 && trocken.ergebnisse.every((e) => e.vorhaben === "anlegen"),
      JSON.stringify(trocken.ergebnisse.map((e) => e.vorhaben)));
    check("4.4 Die Bilanz weist 'geplant' aus, nicht 'angelegt'",
      trocken.bilanz.geplant === 2 && trocken.bilanz.angelegt === 0);

    // ── 5 · Scharfer Stapellauf, zweimal ─────────────────────────────────────────
    abschnitt("5 · Scharfer Stapellauf und Wiederholung");
    const scharf = await provisioning.provisionBatch(
      [spec("stapel-zwei"), spec("stapel-drei")], {}, { ausfuehren: true });
    check("5.1 Beide Mandate wurden angelegt",
      scharf.ok === true && scharf.bilanz.angelegt === 2 && scharf.bilanz.fehlgeschlagen === 0,
      JSON.stringify(scharf.bilanz));
    check("5.2 Je genau ein Nutzer und ein Profil",
      (await anzahlNutzer("stapel-zwei")) === 1 && (await anzahlProfile("stapel-zwei")) === 1
      && (await anzahlNutzer("stapel-drei")) === 1 && (await anzahlProfile("stapel-drei")) === 1);

    const scharf2 = await provisioning.provisionBatch(
      [spec("stapel-zwei"), spec("stapel-drei")], {}, { ausfuehren: true });
    check("5.3 Der zweite identische Stapellauf legt NICHTS neu an",
      scharf2.ok === true && scharf2.bilanz.angelegt === 0 && scharf2.bilanz.aktualisiert === 2,
      JSON.stringify(scharf2.bilanz));
    check("5.4 Weiterhin KEINE Dubletten",
      (await anzahlNutzer("stapel-zwei")) === 1 && (await anzahlProfile("stapel-zwei")) === 1
      && (await anzahlNutzer("stapel-drei")) === 1 && (await anzahlProfile("stapel-drei")) === 1);

    const trockenNachAnlage = await provisioning.provisionBatch([spec("stapel-zwei")]);
    check("5.5 Der Trockenlauf erkennt jetzt 'aktualisieren'",
      trockenNachAnlage.ergebnisse[0].vorhaben === "aktualisieren",
      trockenNachAnlage.ergebnisse[0].vorhaben);

    // ── 6 · Ein fehlerhaftes Mandat hinterlaesst keinen Teilzustand ──────────────
    abschnitt("6 · Fehlerhaftes Mandat im Stapel");
    // Ein Profil-Schreibfehler mitten im Stapel: die Ablage wirft. `provisionTenant`
    // rollt den in DIESEM Lauf angelegten Nutzer zurueck — es darf kein halber Account
    // entstehen, und die bereits verarbeiteten Mandate bleiben unberuehrt.
    const echteSpeicherung = storage.saveProfile;
    let fehlerAusgeloest = false;
    storage.saveProfile = async (p) => {
      if (p && p.id === "stapel-fremd") { fehlerAusgeloest = true; throw new Error("simulierter Schreibfehler"); }
      return echteSpeicherung(p);
    };
    let mitFehler;
    try {
      mitFehler = await provisioning.provisionBatch(
        [spec("stapel-fremd"), spec("stapel-zwei")], {}, { ausfuehren: true });
    } finally {
      storage.saveProfile = echteSpeicherung;
    }
    check("6.1 Der simulierte Schreibfehler ist tatsaechlich eingetreten", fehlerAusgeloest === true);
    check("6.2 Der Stapel bricht fail-closed beim ersten Fehler ab",
      mitFehler.ok === false && mitFehler.abgebrochen === true
      && String(mitFehler.grund).includes("profile-write-failed"), JSON.stringify(mitFehler.grund));
    check("6.3 KEIN halber Account: der Nutzer des gescheiterten Mandats ist zurueckgerollt",
      (await anzahlNutzer("stapel-fremd")) === 0, String(await anzahlNutzer("stapel-fremd")));
    check("6.4 Kein Profil des gescheiterten Mandats",
      (await anzahlProfile("stapel-fremd")) === 0);
    check("6.5 Das NACHFOLGENDE Mandat wurde wegen des Abbruchs gar nicht erst angefasst",
      mitFehler.ergebnisse.length === 1, `${mitFehler.ergebnisse.length} Ergebnisse`);
    check("6.6 Bereits bestehende Mandate sind unveraendert",
      (await anzahlNutzer("stapel-zwei")) === 1 && (await anzahlProfile("stapel-zwei")) === 1);

    // ── 7 · weiterBeiFehler verarbeitet gesunde Mandate weiter ───────────────────
    abschnitt("7 · weiterBeiFehler: ein krankes Mandat stoppt die gesunden nicht");
    const echteSpeicherung2 = storage.saveProfile;
    storage.saveProfile = async (p) => {
      if (p && p.id === "stapel-fremd") throw new Error("simulierter Schreibfehler");
      return echteSpeicherung2(p);
    };
    let weiter;
    try {
      weiter = await provisioning.provisionBatch(
        [spec("stapel-fremd"), spec("stapel-zwei")], {}, { ausfuehren: true, weiterBeiFehler: true });
    } finally {
      storage.saveProfile = echteSpeicherung2;
    }
    check("7.1 Beide Mandate wurden verarbeitet", weiter.ergebnisse.length === 2);
    check("7.2 Die Bilanz nennt genau einen Fehlschlag",
      weiter.bilanz.fehlgeschlagen === 1, JSON.stringify(weiter.bilanz));
    check("7.3 Das gesunde Mandat wurde trotzdem aktualisiert",
      weiter.bilanz.aktualisiert === 1, JSON.stringify(weiter.bilanz));
    check("7.4 Der Gesamtlauf gilt als NICHT erfolgreich", weiter.ok === false);

    // ── 8 · Mandantentrennung im Stapel ─────────────────────────────────────────
    abschnitt("8 · Mandantentrennung");
    const fremdProfil = { id: "stapel-fremd", fullName: "Fremdes Bestandsmandat", profileActive: true };
    await storage.saveProfile(fremdProfil); // OHNE provisionedBy -> geschuetzter Bestand
    const gegenFremd = await provisioning.provisionBatch([spec("stapel-fremd")], {}, { ausfuehren: true });
    check("8.1 Ein fremdes (nicht selbst angelegtes) Mandat wird hart verweigert",
      gegenFremd.ok === false && String(gegenFremd.grund).includes("protected-tenant"),
      JSON.stringify(gegenFremd.grund));
    const fremdNachher = await profilVon("stapel-fremd");
    check("8.2 Das fremde Profil ist voellig unveraendert",
      fremdNachher.fullName === "Fremdes Bestandsmandat" && !fremdNachher.provisionedBy,
      JSON.stringify({ n: fremdNachher.fullName, p: fremdNachher.provisionedBy }));
    check("8.3 Der Trockenlauf meldet das fremde Mandat ebenfalls als Abbruch",
      (await provisioning.provisionBatch([spec("stapel-fremd")])).ergebnisse[0].vorhaben
        === "abbruch:geschuetztes-mandat");

    // ── 9 · Review-Befund 2: der Trockenlauf meldet kein falsches Gruen ──────────
    abschnitt("9 · Trockenlauf: ein blockiertes Mandat laesst den GESAMTEN Lauf fehlschlagen");
    // Vorher meldete der Trockenlauf pauschal ok:true — auch bei
    // `abbruch:geschuetztes-mandat`. Die CLI endete dadurch mit Status 0, obwohl ein
    // scharfer Lauf gescheitert waere.
    const gemischt = await provisioning.provisionBatch([spec("stapel-zwei"), spec("stapel-fremd")]);
    check("9.1 Der Trockenlauf insgesamt gilt als NICHT erfolgreich",
      gemischt.ok === false, JSON.stringify(gemischt.ok));
    check("9.2 Er ist als abgebrochen gekennzeichnet und nennt den Grund",
      gemischt.abgebrochen === true && String(gemischt.grund).startsWith("vorschau-blockiert"),
      JSON.stringify(gemischt.grund));
    check("9.3 Die Bilanz trennt durchfuehrbar von blockiert",
      gemischt.bilanz.geplant === 1 && gemischt.bilanz.blockiert === 1,
      JSON.stringify(gemischt.bilanz));
    check("9.4 Das blockierte Mandat traegt ok:false und einen Grundtext",
      gemischt.ergebnisse[1].ok === false && typeof gemischt.ergebnisse[1].grund === "string"
      && gemischt.ergebnisse[1].grund.length > 0, JSON.stringify(gemischt.ergebnisse[1]));
    check("9.5 Das durchfuehrbare Mandat bleibt ok:true", gemischt.ergebnisse[0].ok === true);
    check("9.6 Der Trockenlauf hat trotzdem NICHTS geschrieben",
      (await anzahlProfile("stapel-fremd")) === 1 // nur das vorbestehende fremde Profil
      && (await anzahlNutzer("stapel-fremd")) === 0);

    // ── 10 · Review-Befund 2: die Vorschau sagt echte Konflikte voraus ───────────
    abschnitt("10 · Trockenlauf sagt Deaktivierung, E-Mail- und Kennungskonflikte voraus");

    // (a) deaktiviertes Mandat ohne Reaktivierungsabsicht
    await provisioning.deactivateTenant("stapel-drei");
    const deakt = await provisioning.provisionBatch([spec("stapel-drei")]);
    check("10.1 Ein deaktiviertes Mandat erscheint als BLOCKIERT",
      deakt.ok === false && deakt.ergebnisse[0].vorhaben === "abbruch:deaktiviert-ohne-reaktivierung",
      deakt.ergebnisse[0].vorhaben);
    const deaktJa = await provisioning.provisionBatch([spec("stapel-drei", { reaktivieren: true })]);
    check("10.2 Mit ausdruecklichem reaktivieren:true ist es wieder durchfuehrbar",
      deaktJa.ok === true && deaktJa.ergebnisse[0].ok === true, deaktJa.ergebnisse[0].vorhaben);
    check("10.3 Auch diese Vorschau hat nichts geschrieben",
      (await profilVon("stapel-drei")).profileActive === false);

    // (b) E-Mail gehoert einem anderen Konto
    const fremdeMail = { ...spec("stapel-eins"), email: "stapel-zwei@synthetic.test" };
    const mailKonflikt = await provisioning.provisionBatch([fremdeMail]);
    check("10.4 Eine fremde E-Mail wird VOR dem ersten Schreibvorgang erkannt",
      mailKonflikt.ok === false
      && mailKonflikt.ergebnisse[0].vorhaben === "abbruch:email-gehoert-anderem-konto",
      mailKonflikt.ergebnisse[0].vorhaben);
    check("10.5 Der Grund nennt die E-Mail NUR maskiert",
      !String(mailKonflikt.ergebnisse[0].grund).includes("stapel-zwei@synthetic.test"),
      String(mailKonflikt.ergebnisse[0].grund));

    // (c) Mandatskennung ist an eine andere E-Mail gebunden
    const andereMail = { ...spec("stapel-zwei"), email: "ganz-neu@synthetic.test" };
    const idKonflikt = await provisioning.provisionBatch([andereMail]);
    check("10.6 Eine an eine andere E-Mail gebundene Kennung wird erkannt",
      idKonflikt.ok === false
      && idKonflikt.ergebnisse[0].vorhaben === "abbruch:id-an-andere-email-gebunden",
      idKonflikt.ergebnisse[0].vorhaben);

    // ── 11 · Review-Befund 3: kein halber Zustand nach fehlgeschlagener Kontrolle ─
    abschnitt("11 · Abbruch nach der Auth-Kontrolle rollt das neue Konto zurueck");
    const echteAccounts = require("../lib/helmut/accounts");

    // (a) Der Kontroll-Lesezugriff WIRFT.
    {
      let nachAnlage = false;
      const attrappe = {
        ...echteAccounts,
        createUser: async (...a) => { const u = await echteAccounts.createUser(...a); nachAnlage = true; return u; },
        listUsers: async () => {
          if (nachAnlage) throw new Error("simulierter Lesefehler der Ablage");
          return echteAccounts.listUsers();
        }
      };
      const r = await provisioning.provisionTenant(spec("stapel-vier"), { accounts: attrappe });
      check("11.1 Der Lauf bricht mit auth-write-not-persisted ab",
        r.ok === false && r.reason === "auth-write-not-persisted", JSON.stringify(r.reason));
      check("11.2 Der Rueckweg wurde ausgefuehrt", r.rueckweg === "ok", JSON.stringify(r.rueckweg));
      check("11.3 KEIN halbes Konto bleibt zurueck",
        (await anzahlNutzer("stapel-vier")) === 0, String(await anzahlNutzer("stapel-vier")));
      check("11.4 KEIN Profil bleibt zurueck",
        (await anzahlProfile("stapel-vier")) === 0, String(await anzahlProfile("stapel-vier")));
    }

    // (b) Der Lesezugriff GELINGT, findet das neue Konto aber nicht.
    {
      let neueId = null;
      const attrappe = {
        ...echteAccounts,
        createUser: async (...a) => { const u = await echteAccounts.createUser(...a); neueId = u.id; return u; },
        listUsers: async () => {
          const alle = await echteAccounts.listUsers();
          return neueId ? alle.filter((u) => u.id !== neueId) : alle;
        }
      };
      const r = await provisioning.provisionTenant(spec("stapel-fuenf"), { accounts: attrappe });
      check("11.5 Auch der leere Treffer fuehrt zum Abbruch",
        r.ok === false && r.reason === "auth-write-not-persisted", JSON.stringify(r.reason));
      check("11.6 Der Rueckweg wurde ausgefuehrt", r.rueckweg === "ok", JSON.stringify(r.rueckweg));
      check("11.7 KEIN halbes Konto bleibt zurueck",
        (await anzahlNutzer("stapel-fuenf")) === 0, String(await anzahlNutzer("stapel-fuenf")));
      check("11.8 KEIN Profil bleibt zurueck",
        (await anzahlProfile("stapel-fuenf")) === 0, String(await anzahlProfile("stapel-fuenf")));
    }

    // ── 12 · Review-Befund 2: die CLI endet mit Fehlerstatus ────────────────────
    abschnitt("12 · CLI-Exitcode des Trockenlaufs");
    // Ein Trockenlauf, der einen Abbruch vorhersagt, muss auch als Prozess scheitern —
    // sonst laeuft ein Skript oder eine Freigabekette daran vorbei.
    {
      const { spawnSync } = require("child_process");
      const os = require("os");
      const CLI = path.join(__dirname, "provision-tenant.js");
      const schreibePaket = (datei, inhalt) => { fs.writeFileSync(datei, JSON.stringify(inhalt), "utf8"); return datei; };
      const lauf = (datei) => spawnSync(process.execPath, [CLI, "--paket", datei],
        { encoding: "utf8", env: { ...process.env, HELMUT_STORAGE_BACKEND: "local" } });

      const blockiertDatei = schreibePaket(path.join(os.tmpdir(), `stapel-blockiert-${process.pid}.json`),
        [spec("stapel-fremd")]);          // stapel-fremd ist ein geschuetztes Bestandsmandat
      const rBlockiert = lauf(blockiertDatei);
      check("12.1 Blockierter Trockenlauf endet mit Exitcode 1",
        rBlockiert.status === 1, `Exitcode ${rBlockiert.status}`);
      check("12.2 Die Meldung nennt den Abbruch ausdruecklich",
        /ABGEBROCHEN|ABBRUCH/i.test(String(rBlockiert.stdout) + String(rBlockiert.stderr)));

      const sauberDatei = schreibePaket(path.join(os.tmpdir(), `stapel-sauber-${process.pid}.json`),
        [spec("stapel-zwei")]);           // vorhandenes, eigenes Mandat -> aktualisieren
      const rSauber = lauf(sauberDatei);
      check("12.3 Gegenprobe: ein durchfuehrbarer Trockenlauf endet mit Exitcode 0",
        rSauber.status === 0, `Exitcode ${rSauber.status}`);
      check("12.4 Der scharfe Lauf wird ehrlich als SEQUENZIELL beschrieben, nicht als atomarer Stapel",
        /SEQUENZIELL/.test(String(rSauber.stdout)) === false, "Hinweis erscheint nur im scharfen Lauf");

      try { fs.unlinkSync(blockiertDatei); fs.unlinkSync(sauberDatei); } catch { /* egal */ }
    }

    // ── 13 · Aufraeumen ─────────────────────────────────────────────────────────
    for (const id of IDS) { try { await provisioning.teardownTenant(id); } catch { /* egal */ } }
  } catch (err) {
    fail += 1;
    console.log(`FAIL  Unerwarteter Fehler: ${err && err.stack || err}`);
  } finally {
    restore();
  }

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})();
