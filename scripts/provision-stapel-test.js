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
  "stapel-vier", "stapel-fuenf", "stapel-sechs"];
function spec(id, extra = {}) {
  return {
    id,
    // Seit 02.09. weist `validateSpec` jede Kennung aus einer reservierten
    // synthetischen Familie ab, sofern der Aufrufer sie nicht AUSDRÜCKLICH
    // erlaubt. Diese Suite arbeitet bewusst nur mit `stapel-*` — sie sagt es
    // hier, statt das Verbot zu umgehen.
    synthetischErlaubt: true,
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
    const r1 = await provisioning.provisionTenant(spec("stapel-eins"), {}, { neuAktiv: true });
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

    const r2 = await provisioning.provisionTenant(spec("stapel-eins"), {}, { neuAktiv: true });
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

    const r3 = await provisioning.provisionTenant(spec("stapel-eins"), {}, { neuAktiv: true });
    const nachWiederholung = await profilVon("stapel-eins");
    // Das Zusammenspiel ist absichtlich FAIL-CLOSED und schaerfer als eine blosse
    // Nicht-Reaktivierung: die Verschmelzung haelt `profileActive:false` fest, und
    // `provisionTenant` bricht VOR jedem Schreibvorgang ab. Ein Wiederholungslauf
    // gegen ein deaktiviertes Mandat aktiviert es also nicht nur nicht — er
    // veraendert es ueberhaupt nicht.
    // GEAENDERT 2026-08-25/4: der Abbruch haengt jetzt am WIDERSPRUCH zwischen der
    // Absicht des Laufs (`neuAktiv: true` — dieser Lauf will ein aktives Mandat) und
    // dem deaktivierten Bestand, nicht mehr am Nebeneffekt „validateProfile meldet
    // deaktiviert". Er liegt damit frueher und nennt den Grund selbst. Die
    // Abbruchkennung `profile-not-ready` ist unveraendert, `validation` entfaellt an
    // dieser Stelle, weil gar nicht mehr bis zur Inhaltspruefung gelaufen wird.
    check("2.2 Wiederholungslauf bricht sauber ab statt still zu reaktivieren",
      r3.ok === false && r3.reason === "profile-not-ready", JSON.stringify(r3.reason));
    check("2.2b Der Abbruch benennt den Widerspruch ausdruecklich im Protokoll",
      (r3.log || []).some((e) => e.step === "aktivierungszustand" && e.status === "abbruch"
        && /reaktivieren:true/.test(String(e.detail))),
      JSON.stringify((r3.log || []).map((e) => e.step)));
    check("2.3 Das Mandat bleibt DEAKTIVIERT (keine Aktivierung ohne Freigabe)",
      nachWiederholung.profileActive === false, String(nachWiederholung.profileActive));

    const r4 = await provisioning.provisionTenant(spec("stapel-eins", { reaktivieren: true }), {}, { neuAktiv: true });
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
    check("4.3 Der Trockenlauf sagt fuer beide 'anlegen-inaktiv' voraus",
      trocken.ergebnisse.length === 2 && trocken.ergebnisse.every((e) => e.vorhaben === "anlegen-inaktiv"),
      JSON.stringify(trocken.ergebnisse.map((e) => e.vorhaben)));
    // Der Zielzustand steht als eigener, maschinenlesbarer Wert in jeder Zeile — nicht
    // nur als Wort im `vorhaben`. Daran haengt der Riegel in `provisionBatch`.
    check("4.3b Jede Vorschauzeile nennt den Zielzustand ausdruecklich als INAKTIV",
      trocken.ergebnisse.every((e) => e.zielAktiv === false),
      JSON.stringify(trocken.ergebnisse.map((e) => e.zielAktiv)));
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
    check("5.5 Der Trockenlauf erkennt jetzt 'aktualisieren-bleibt-inaktiv'",
      trockenNachAnlage.ergebnisse[0].vorhaben === "aktualisieren-bleibt-inaktiv",
      trockenNachAnlage.ergebnisse[0].vorhaben);
    check("5.5b Der vorhergesagte Zielzustand bleibt INAKTIV",
      trockenNachAnlage.ergebnisse[0].zielAktiv === false,
      String(trockenNachAnlage.ergebnisse[0].zielAktiv));

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

    // (a) deaktiviertes Mandat — der Stapel laesst es deaktiviert (Korrektur 2026-08-25/4).
    // FRUEHER stand hier die Erwartung „blockiert" und „mit reaktivieren:true wieder
    // durchfuehrbar". Beides war falsch herum gedacht: der Stapel arbeitet OHNEHIN
    // inaktiv, ein deaktiviertes Mandat ist fuer ihn also kein Widerspruch — und eine
    // Reaktivierung ist im Stapelpfad ueberhaupt nicht zulaessig (CLAUDE.md §5). Mit der
    // alten Erwartung haette der Stapel seine EIGENEN, inaktiv angelegten Mandate nie
    // wieder anfassen koennen; die zugesicherte Wiederholbarkeit waere weg gewesen.
    await provisioning.deactivateTenant("stapel-drei");
    const deakt = await provisioning.provisionBatch([spec("stapel-drei")]);
    check("10.1 Ein deaktiviertes Mandat ist durchfuehrbar und bleibt vorhergesagt INAKTIV",
      deakt.ok === true && deakt.ergebnisse[0].vorhaben === "aktualisieren-bleibt-inaktiv"
      && deakt.ergebnisse[0].zielAktiv === false,
      `${deakt.ergebnisse[0].vorhaben} / ${deakt.ergebnisse[0].zielAktiv}`);
    const deaktJa = await provisioning.provisionBatch([spec("stapel-drei", { reaktivieren: true })]);
    check("10.2 Ein Reaktivierungswunsch wird ABGELEHNT, nicht still umgedeutet",
      deaktJa.ok === false && deaktJa.grund === "vorpruefung-fehlgeschlagen"
      && deaktJa.vorbefunde.some((b) => /reaktivieren/.test(b)),
      JSON.stringify(deaktJa.grund));
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
      const r = await provisioning.provisionTenant(spec("stapel-vier"), { accounts: attrappe }, { neuAktiv: true });
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
      const r = await provisioning.provisionTenant(spec("stapel-fuenf"), { accounts: attrappe }, { neuAktiv: true });
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

    // ── 13 · Review 2026-08-25/3: JEDER Rueckweg ist eng begrenzt ───────────────
    abschnitt("13 · Alle Rueckwege treffen ausschliesslich das neu angelegte Konto");
    // Vorher liefen zwei der drei Rueckwege ueber `deleteAuthDataForPolitician(...)`.
    // Das raeumt alles ab, was an der MANDATSKENNUNG haengt — auch vorbestehende
    // Referentenzuweisungen, die der Lauf nie angelegt hat. Zusaetzlich verschluckten
    // beide Stellen einen Loeschfehler und meldeten trotzdem einen sauberen Rueckweg.
    const echt = require("../lib/helmut/accounts");

    // Fremdbestand, der unter KEINEN Umstaenden angefasst werden darf: ein fremder
    // Nutzer UND eine vorbestehende Referentenzuweisung auf genau die Mandatskennung,
    // deren Anlage gleich scheitern wird.
    const fremderNutzer = await echt.createUser({
      email: "fremd-referent@synthetic.test", name: "Fremder Referent", role: "referent",
      password: "fremd-pass-123"
    });
    await echt.addAssignment(fremderNutzer.id, "stapel-sechs");
    const zuweisungenVorher = (await echt.listAssignments())
      .filter((a) => a.politicianId === "stapel-sechs").length;
    check("13.0 Aufbau: fremder Nutzer und vorbestehende Zuweisung auf stapel-sechs",
      zuweisungenVorher === 1, String(zuweisungenVorher));

    // (a) Kennungskollision — gezielter Rueckweg
    {
      const attrappe = {
        ...echt,
        // Legt den Nutzer WIRKLICH an, meldet aber eine abgeleitete Kennung zurueck —
        // genau der Zustand, den `uniquePoliticianId` bei einer Kollision erzeugt.
        createUser: async (...a) => {
          const u = await echt.createUser(...a);
          return { ...u, politicianId: `${u.politicianId}-2` };
        }
      };
      const r = await provisioning.provisionTenant(spec("stapel-sechs"), { accounts: attrappe }, { neuAktiv: true });
      check("13.1 Kennungskollision bricht ab", r.ok === false && r.reason === "politician-id-collision",
        JSON.stringify(r.reason));
      check("13.2 Der gezielte Rueckweg war erfolgreich", r.rueckweg === "ok", JSON.stringify(r.rueckweg));
      check("13.3 Das neu angelegte Konto ist weg",
        (await anzahlNutzer("stapel-sechs")) === 0, String(await anzahlNutzer("stapel-sechs")));
      check("13.4 Die VORBESTEHENDE Referentenzuweisung ist UNANGETASTET",
        (await echt.listAssignments()).filter((a) => a.politicianId === "stapel-sechs").length === 1);
      check("13.5 Der fremde Nutzer existiert weiterhin",
        (await echt.listUsers()).some((u) => u.id === fremderNutzer.id));
    }

    // (b) Profilspeicherfehler — gezielter Rueckweg
    {
      const echteSpeicherung = storage.saveProfile;
      storage.saveProfile = async (p) => {
        if (p && p.id === "stapel-sechs") throw new Error("simulierter Schreibfehler");
        return echteSpeicherung(p);
      };
      let r;
      try { r = await provisioning.provisionTenant(spec("stapel-sechs"), {}, { neuAktiv: true }); }
      finally { storage.saveProfile = echteSpeicherung; }
      check("13.6 Profilspeicherfehler bricht ab",
        r.ok === false && r.reason === "profile-write-failed", JSON.stringify(r.reason));
      check("13.7 Der gezielte Rueckweg war erfolgreich", r.rueckweg === "ok", JSON.stringify(r.rueckweg));
      check("13.8 Kein halbes Konto, kein Profil",
        (await anzahlNutzer("stapel-sechs")) === 0 && (await anzahlProfile("stapel-sechs")) === 0);
      check("13.9 Die vorbestehende Zuweisung ist WEITERHIN unangetastet",
        (await echt.listAssignments()).filter((a) => a.politicianId === "stapel-sechs").length === 1);
      check("13.10 Der fremde Nutzer existiert weiterhin",
        (await echt.listUsers()).some((u) => u.id === fremderNutzer.id));
    }

    // (c) Die Loeschung selbst scheitert — ehrlicher Fehlerstatus statt falschem Gruen
    {
      const echteSpeicherung = storage.saveProfile;
      storage.saveProfile = async (p) => {
        if (p && p.id === "stapel-sechs") throw new Error("simulierter Schreibfehler");
        return echteSpeicherung(p);
      };
      const attrappe = {
        ...echt,
        deleteUser: async () => { throw new Error("simulierter Loeschfehler"); }
      };
      let r;
      try { r = await provisioning.provisionTenant(spec("stapel-sechs"), { accounts: attrappe }, { neuAktiv: true }); }
      finally { storage.saveProfile = echteSpeicherung; }
      check("13.11 Der Lauf bricht ab", r.ok === false && r.reason === "profile-write-failed");
      check("13.12 Der Rueckweg wird als FEHLGESCHLAGEN gemeldet — kein falsches Gruen",
        r.rueckweg === "fehlgeschlagen", JSON.stringify(r.rueckweg));
      const rollbackZeilen = r.log.filter((e) => e.step === "rollback");
      check("13.13 Das Protokoll meldet den Fehler, nicht 'ok'",
        rollbackZeilen.length === 1 && rollbackZeilen[0].status === "fehler",
        JSON.stringify(rollbackZeilen));
      check("13.14 Das Protokoll benennt den moeglichen halben Zustand ausdruecklich",
        /moeglicherweise bleibt ein Konto ohne Profil/.test(String(rollbackZeilen[0].detail)),
        String(rollbackZeilen[0].detail));
      // Das Konto blieb hier tatsaechlich stehen — genau das soll die Meldung sagen.
      check("13.15 Das Konto ist wirklich noch da (die ehrliche Meldung stimmt)",
        (await anzahlNutzer("stapel-sechs")) === 1, String(await anzahlNutzer("stapel-sechs")));
      // Aufraeumen von Hand, damit der Rest des Tests sauber weiterlaeuft.
      const rest = (await echt.listUsers()).filter((u) => u.politicianId === "stapel-sechs");
      for (const u of rest) await echt.deleteUser(u.id);
    }

    check("13.16 Nach allen Rueckwegen ist die vorbestehende Zuweisung immer noch da",
      (await echt.listAssignments()).filter((a) => a.politicianId === "stapel-sechs").length === 1);
    await echt.removeAssignment(fremderNutzer.id, "stapel-sechs");
    await echt.deleteUser(fremderNutzer.id);

    // ── 14 · ANLAGE UND AKTIVIERUNG SIND GETRENNT (Korrekturrunde 2026-08-25/4) ──
    // Der Widerspruch, den dieser Abschnitt schliesst: der Importvertrag verlangt
    // `profileActive: false` unabhaengig vom Eingang (op30-profilvertrag-200-mandate.md
    // §6), der Profilbauer setzte aber fest `profileActive: true` — ein scharfer
    // Stapellauf legte also AKTIVE Mandate an und umging die getrennte
    // Aktivierungsfreigabe (CLAUDE.md §5).
    abschnitt("14 · Ein Stapellauf legt ausschliesslich INAKTIV an und aktiviert nie");
    for (const id of ["stapel-eins", "stapel-zwei", "stapel-drei"]) {
      try { await provisioning.teardownTenant(id); } catch { /* egal */ }
    }

    // (a) KEIN STILLER VORGABEWERT im gemeinsamen Profilbauer.
    {
      let geworfen = null;
      try { provisioning.buildProfile(spec("stapel-eins")); } catch (e) { geworfen = e; }
      check("14.1 buildProfile ohne ausdruecklichen Zustand WIRFT (kein stiller Default)",
        geworfen instanceof TypeError && /ausdruecklich/.test(geworfen.message),
        String(geworfen && geworfen.message).slice(0, 80));
      check("14.2 buildProfile(..., { aktiv: false }) liefert profileActive === false",
        provisioning.buildProfile(spec("stapel-eins"), { aktiv: false }).profileActive === false);
      check("14.3 buildProfile(..., { aktiv: true }) liefert profileActive === true",
        provisioning.buildProfile(spec("stapel-eins"), { aktiv: true }).profileActive === true);
      let geworfen2 = null;
      try { await provisioning.provisionTenant(spec("stapel-eins"), {}); } catch (e) { geworfen2 = e; }
      check("14.4 provisionTenant ohne ausdruecklichen Zustand WIRFT",
        geworfen2 instanceof TypeError && /neuAktiv/.test(geworfen2.message),
        String(geworfen2 && geworfen2.message).slice(0, 80));
    }

    // (b) TROCKENLAUF IST STANDARD und sagt den inaktiven Zustand voraus.
    {
      const vorschau = await provisioning.provisionBatch([spec("stapel-eins"), spec("stapel-zwei")]);
      check("14.5 Der Trockenlauf ist der Standard (kein `ausfuehren`) und schreibt nichts",
        vorschau.trockenlauf === true
        && (await anzahlNutzer("stapel-eins")) === 0 && (await anzahlProfile("stapel-eins")) === 0);
      check("14.6 Er sagt fuer jedes neue Mandat ausdruecklich INAKTIV voraus",
        vorschau.ok === true && vorschau.ergebnisse.every((e) => e.zielAktiv === false
          && e.vorhaben === "anlegen-inaktiv"),
        JSON.stringify(vorschau.ergebnisse.map((e) => [e.vorhaben, e.zielAktiv])));
    }

    // (c) SCHARFER LOKALER STAPELLAUF: legt an, aktiviert nicht.
    {
      const scharf = await provisioning.provisionBatch(
        [spec("stapel-eins"), spec("stapel-zwei")], {}, { ausfuehren: true });
      check("14.7 Der scharfe Stapellauf ist erfolgreich und legt beide Mandate an",
        scharf.ok === true && scharf.bilanz.angelegt === 2 && scharf.bilanz.fehlgeschlagen === 0,
        JSON.stringify(scharf.bilanz));
      const p1 = await profilVon("stapel-eins");
      const p2 = await profilVon("stapel-zwei");
      check("14.8 BEIDE Profile sind INAKTIV gespeichert (profileActive === false)",
        p1.profileActive === false && p2.profileActive === false,
        `${p1.profileActive} / ${p2.profileActive}`);
      check("14.9 Das Ergebnis MELDET den gespeicherten Zustand ehrlich als inaktiv",
        scharf.ergebnisse.every((e) => e.profilAktiv === false),
        JSON.stringify(scharf.ergebnisse.map((e) => e.profilAktiv)));
      // DIE BETRIEBLICH ENTSCHEIDENDE ZUSICHERUNG: es genuegt nicht, dass ein Feld
      // `false` ist — das Mandat muss fuer den Arbeitsplaner wirklich unsichtbar sein.
      // `scalable-pipeline` filtert seine Profile mit genau diesem Praedikat
      // (`planeArbeit`/`planeMandatsarbeit`: `.filter((p) => p && p.id && !isDisabled(p))`).
      // Ein so angelegtes Mandat erzeugt damit KEINEN Auftrag, keine Last und keine Kosten —
      // genau das sichert `op30-profilvertrag-200-mandate.md` §6 zu.
      const { isDisabled } = require("../lib/helmut/profile-validation");
      check("14.9b Der Arbeitsplaner sieht die neuen Mandate als DEAKTIVIERT (kein Auftrag, keine Kosten)",
        isDisabled(p1) === true && isDisabled(p2) === true,
        `${isDisabled(p1)} / ${isDisabled(p2)}`);
      check("14.9c Dasselbe Praedikat benutzt der Planer wirklich (kein zweiter Wahrheitsbegriff)",
        /\.filter\(\(p\) => p && p\.id && !isDisabled\(p\)\)/
          .test(fs.readFileSync(path.join(__dirname, "..", "lib/helmut/scalable-pipeline.js"), "utf8")));
      // Das Konto entsteht, ist aber nicht anmeldefaehig: `accounts.authenticate` liest
      // `user.active === false`. Sonst haette ein Mandat ohne Freigabe einen Login.
      const konten = (await accounts.listUsers()).filter((u) => u.politicianId === "stapel-eins");
      check("14.10 Das angelegte Konto ist GESPERRT (active === false, kein Login)",
        konten.length === 1 && konten[0].active === false, JSON.stringify(konten.map((k) => k.active)));
      // Wirkungsnachweis statt Feldpruefung: fuer ein gesperrtes Konto laesst sich nicht
      // einmal ein Einladungs-/Zuruecksetz-Link erzeugen (`accounts.createPasswordToken`
      // wirft 409 „Nutzer ist gesperrt."). Denselben `active === false`-Riegel liest auch
      // `resolveSession` — eine Sitzung dieses Kontos ist damit nicht aufloesbar.
      let gesperrtFehler = null;
      try { await accounts.createPasswordToken(konten[0].id, "reset"); }
      catch (e) { gesperrtFehler = e; }
      check("14.11 Das gesperrte Konto ist nicht nutzbar (kein Zugangslink erzeugbar)",
        Boolean(gesperrtFehler) && /gesperrt/i.test(String(gesperrtFehler.message)),
        String(gesperrtFehler && gesperrtFehler.message).slice(0, 60));
    }

    // (d) WIEDERHOLUNGSLAUF aktiviert nichts und bleibt wiederholbar.
    {
      const zweiter = await provisioning.provisionBatch(
        [spec("stapel-eins"), spec("stapel-zwei")], {}, { ausfuehren: true });
      check("14.12 Der Wiederholungslauf ist erfolgreich und legt NICHTS neu an",
        zweiter.ok === true && zweiter.bilanz.angelegt === 0 && zweiter.bilanz.aktualisiert === 2,
        JSON.stringify(zweiter.bilanz));
      check("14.13 Er aktiviert kein Mandat — beide bleiben inaktiv",
        (await profilVon("stapel-eins")).profileActive === false
        && (await profilVon("stapel-zwei")).profileActive === false);
      check("14.14 Keine Dubletten durch den Wiederholungslauf",
        (await anzahlNutzer("stapel-eins")) === 1 && (await anzahlProfile("stapel-eins")) === 1);
    }

    // (e) EIN AKTIVIERUNGSWUNSCH WIRD ABGELEHNT, nie still umgedeutet.
    for (const [feld, wert] of [["aktiv", true], ["profileActive", true], ["active", true],
      ["aktiv", "true"], ["aktiv", 1], ["reaktivieren", true]]) {
      const res = await provisioning.provisionBatch(
        [spec("stapel-drei", { [feld]: wert })], {}, { ausfuehren: true });
      check(`14.15 Stapel lehnt ${feld}=${JSON.stringify(wert)} ab (Vorpruefung, kein Schreibvorgang)`,
        res.ok === false && res.grund === "vorpruefung-fehlgeschlagen"
        && res.vorbefunde.some((b) => b.includes(`"${feld}"`))
        && (await anzahlProfile("stapel-drei")) === 0,
        JSON.stringify(res.grund));
    }
    check("14.16 Ein ausdrueckliches aktiv:false ist dagegen zulaessig (Importvertrag §6)",
      (await provisioning.provisionBatch([spec("stapel-drei", { aktiv: false })])).ok === true);

    // (f) EIN BESTEHENDES AKTIVES MANDAT WIRD VOM STAPEL NICHT DEAKTIVIERT.
    // Die Gegenrichtung desselben Fehlers: seit der Bauer `false` liefern kann, haette
    // ein Wiederholungslauf ein aktives Mandat still abschalten koennen.
    {
      const aktiv = await provisioning.provisionTenant(spec("stapel-drei"), {}, { neuAktiv: true });
      check("14.17 Ausgangslage: das Mandat ist AKTIV angelegt",
        aktiv.ok === true && (await profilVon("stapel-drei")).profileActive === true);
      const ueber = await provisioning.provisionBatch([spec("stapel-drei")], {}, { ausfuehren: true });
      check("14.18 Der Stapellauf laesst ein bestehendes AKTIVES Mandat aktiv",
        ueber.ok === true && (await profilVon("stapel-drei")).profileActive === true,
        String((await profilVon("stapel-drei")).profileActive));
      check("14.19 Und er sagt genau das vorher (aktualisieren-bleibt-aktiv)",
        (await provisioning.provisionBatch([spec("stapel-drei")])).ergebnisse[0].vorhaben
          === "aktualisieren-bleibt-aktiv");
    }

    // (g) UNBESTIMMBARER ZUSTAND: die GESAMTE Vorschau faellt geschlossen aus.
    {
      const kaputt = await profilVon("stapel-drei");
      kaputt.profileActive = "false";            // Zeichenkette, kein Wahrheitswert
      await storage.saveProfile(kaputt);
      const res = await provisioning.provisionBatch([spec("stapel-drei")]);
      check("14.20 Ein nicht bestimmbarer Aktivierungszustand bricht die Vorschau ab",
        res.ok === false && res.ergebnisse[0].vorhaben === "abbruch:aktivierungszustand-unklar",
        res.ergebnisse[0].vorhaben);
      const scharf = await provisioning.provisionBatch([spec("stapel-drei")], {}, { ausfuehren: true });
      check("14.21 Auch der scharfe Lauf bricht dort ab, ohne zu schreiben",
        scharf.ok === false && scharf.ergebnisse[0].reason === "aktivierungszustand-unklar",
        String(scharf.ergebnisse[0].reason));
      kaputt.profileActive = true;
      await storage.saveProfile(kaputt);
    }

    // (h) TEILFEHLER: ein gescheitertes Mandat aktiviert die uebrigen nicht.
    {
      for (const id of ["stapel-eins", "stapel-zwei"]) {
        try { await provisioning.teardownTenant(id); } catch { /* egal */ }
      }
      const kaputteSpec = { ...spec("stapel-zwei"), email: "stapel-drei@synthetic.test" };
      const res = await provisioning.provisionBatch(
        [spec("stapel-eins"), kaputteSpec], {}, { ausfuehren: true, weiterBeiFehler: true });
      check("14.22 Genau ein Mandat scheitert, das gesunde wird angelegt",
        res.ok === false && res.bilanz.fehlgeschlagen === 1 && res.bilanz.angelegt === 1,
        JSON.stringify(res.bilanz));
      check("14.23 Das gesunde Mandat ist INAKTIV — ein Teilfehler aktiviert nichts",
        (await profilVon("stapel-eins")).profileActive === false);
      check("14.24 Das gescheiterte Mandat hinterlaesst kein Profil",
        (await anzahlProfile("stapel-zwei")) === 0);
    }

    // ── 15 · Aufraeumen ─────────────────────────────────────────────────────────
    for (const id of IDS) { try { await provisioning.teardownTenant(id); } catch { /* egal */ } }
  } catch (err) {
    fail += 1;
    console.log(`FAIL  Unerwarteter Fehler: ${err && err.stack || err}`);
  } finally {
    restore();
  }

  // ── GEGENPROBE 02.09. (adversariales Diff-Review, bestätigter Befund) ───────
  // Diese Suite setzt `synthetischErlaubt: true` für ALLE ihre Specs. Damit war
  // der neue Schutz vor reservierten Kennungsfamilien hier durchgehend
  // abgeschaltet — und nichts prüfte mehr, dass er überhaupt greift. Eine
  // Ausnahme ohne Gegenprobe ist keine Ausnahme, sondern ein Loch.
  {
    const provisioning = require("../lib/helmut/provisioning");
    const basis = {
      email: "gegenprobe@synthetic.test",
      name: "Gegenprobe",
      password: "gegenprobe-pass-123",
      party: "Partei Alpha",
      parliamentType: "Landtag",
      state: "Bayern"
    };
    for (const kennung of ["test-kohorte-a-001", "test-mdb-001", "synth-mandat-1", "stapel-x"]) {
      // `validateSpec` WIRFT NICHT, es liefert eine Fehlerliste — genau deshalb
      // steht die Gegenprobe hier: eine falsch geschriebene Prüfung hätte den
      // Schutz für "kaputt" erklärt, obwohl er greift.
      const fehler = provisioning.validateSpec({ ...basis, id: kennung });
      const abgewiesen = Array.isArray(fehler)
        && fehler.some((f) => /reservierten synthetischen Kennungsfamilie/i.test(String(f)));
      if (abgewiesen) { pass += 1; console.log(`PASS  Gegenprobe: ${kennung} wird OHNE synthetischErlaubt abgewiesen`); }
      else { fail += 1; console.log(`FAIL  Gegenprobe: ${kennung} kam OHNE synthetischErlaubt durch`); }
    }
    // Und mit ausdrücklicher Erlaubnis geht dieselbe Kennung durch.
    const mitErlaubnis = provisioning.validateSpec({ ...basis, id: "stapel-x", synthetischErlaubt: true });
    const durch = Array.isArray(mitErlaubnis)
      && !mitErlaubnis.some((f) => /reservierten synthetischen Kennungsfamilie/i.test(String(f)));
    if (durch) { pass += 1; console.log("PASS  Gegenprobe: MIT synthetischErlaubt geht dieselbe Kennung durch"); }
    else { fail += 1; console.log("FAIL  Gegenprobe: MIT synthetischErlaubt blieb die Kennung gesperrt"); }
  }

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})();
