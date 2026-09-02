"use strict";

// Zweitmandanten-Provisionierung (Sprint 1) — sicherer, idempotenter Admin-Prozess.
//
// KEIN öffentlicher Self-Service, KEIN Referentenzugang. Ein Admin legt mit EINEM
// Aufruf einen vollständigen Abgeordneten-Mandanten an bzw. aktualisiert ihn:
//   Auth-Nutzer · Mandatsprofil · Partei · Ebene · Geografie · Ausschüsse/Themen ·
//   Quellenpaket-Zuordnung (deterministisch aus dem Profil) · Budgetkonfiguration ·
//   Grundeinstellungen · Matching-/Briefing-Bereitschaft (validiert).
//
// Garantien:
//   * WIEDERHOLBAR ohne Dubletten: Nutzer wird per E-Mail, Profil per id ge-upsertet.
//   * PFLICHTFELDER validiert BEVOR geschrieben wird (validate-first).
//   * SAUBERER ABBRUCH: bei Fehler nach dem Auth-Write wird ein in DIESEM Lauf neu
//     angelegter Nutzer wieder entfernt -> kein halber Account.
//   * ERGEBNISPROTOKOLL (log[] + formatProtocol()).
//   * DEAKTIVIERUNG ohne Fremddaten zu berühren (strikt auf die id gescoped).
//   * SCHUTZ bestehender Mandanten: DATENGETRIEBEN statt Namensliste. Jeder
//     Mandant, dessen Profil NICHT von diesem Werkzeug angelegt wurde (fehlende
//     provisionedBy-Markierung) oder der nur als Auth-Konto existiert, ist hart
//     gesperrt (kein Anlegen/Deaktivieren/Löschen über dieses Werkzeug). Optional
//     erweiterbar per HELMUT_PROTECTED_TENANT_IDS (Komma-Liste, Betreiber-Env).
//
// Alle Abhängigkeiten sind injizierbar (deps) — die Tests laufen offline im
// lokalen Dateimodus mit synthetischen Mandanten.

// Markierung, die dieses Werkzeug an selbst angelegte Profile schreibt. Nur
// Profile MIT dieser Markierung darf es aendern/deaktivieren/loeschen — alles
// andere ist ein bestehender (z. B. manuell angelegter Production-) Mandant.
const PROVISIONING_MARKER = "helmut-provisioning";

function slugify(value) {
  return String(value || "")
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Optionale zusaetzliche Sperrliste des Betreibers (Env, KEINE Namen im Code).
function envProtectedIds(env = process.env) {
  return new Set(String(env.HELMUT_PROTECTED_TENANT_IDS || "")
    .split(",").map((v) => slugify(v)).filter(Boolean));
}

// DATENGETRIEBENER Schutz bestehender Mandanten:
//   * Profil vorhanden, aber OHNE provisionedBy-Markierung -> geschuetzt
//     (wurde nicht von diesem Werkzeug angelegt; z. B. die bestehenden
//     Production-Mandanten — deren Datensaetze bleiben unangetastet).
//   * Kein Profil, aber ein Auth-Konto mit dieser politicianId -> geschuetzt.
//   * In HELMUT_PROTECTED_TENANT_IDS gelistet -> immer geschuetzt.
//   * Sonst (frische id oder eigene, markierte Anlage) -> nicht geschuetzt.
async function isProtectedTenant(id, deps = {}) {
  const cleanId = slugify(id);
  if (!cleanId) return true; // leere id niemals verarbeiten
  if (envProtectedIds(deps.env).has(cleanId)) return true;
  const storage = deps.storage || require("./storage");
  const accounts = deps.accounts || require("./accounts");
  // FAIL-CLOSED: Ist der Datenzustand nicht LESBAR, gilt der Mandant als
  // geschuetzt — eine transiente Store-/DB-Stoerung darf den Bestandsschutz
  // nie aushebeln (adversarialer Review-Befund).
  let profile;
  try {
    profile = await storage.getProfile(cleanId);
  } catch {
    return true;
  }
  if (profile) return profile.provisionedBy !== PROVISIONING_MARKER;
  let users;
  try {
    users = await accounts.listUsers();
  } catch {
    return true;
  }
  return (Array.isArray(users) ? users : []).some((u) => u && u.politicianId === cleanId);
}

function hasStr(v) { return String(v || "").trim().length > 0; }
function hasList(v) { return Array.isArray(v) && v.some((x) => hasStr(x)); }

// E-Mail fuer das Ergebnisprotokoll maskieren (DSGVO: die volle Adresse ist PII und
// soll nicht im Klartext in Protokolle/stdout/Tickets wandern). Domain + erster
// Buchstabe bleiben zur Nachvollziehbarkeit erhalten, z. B. a****@example.test.
function maskEmail(email) {
  const s = String(email || "").trim();
  const at = s.indexOf("@");
  if (at <= 0) return "[E-Mail]";
  return `${s.slice(0, 1)}${"*".repeat(Math.max(1, at - 1))}${s.slice(at)}`;
}

function levelOf(spec) {
  const raw = String(spec.parliamentType || spec.politicalLevel || "").trim().toLowerCase();
  if (raw.includes("landtag") || raw === "land" || raw.startsWith("landes")) return "Landtag";
  if (raw.includes("bundestag") || raw === "bund" || raw.startsWith("bundes")) return "Bundestag";
  return "";
}

// Kanonische Klassifizierung real/synthetisch (reservierte Kennungsfamilien).
const mandatsklasse = require("./mandatsklasse");

// Pflichtfeld-Prüfung VOR jedem Schreibvorgang. Gibt eine Liste klarer Fehler zurück.
function validateSpec(spec = {}) {
  const errors = [];
  if (!hasStr(spec.id)) errors.push("id fehlt (Mandant-/Profil-Kennung)");
  else if (slugify(spec.id) !== String(spec.id)) errors.push(`id "${spec.id}" ist kein sauberer Slug (nur a-z, 0-9, Bindestrich)`);
  // RESERVIERTE KENNUNGSFAMILIEN (ergaenzt 02.09.). Die vier synthetischen
  // Familien (`test-kohorte-`, `test-mdb-`, `synth-mandat-`, `stapel-`) sind die
  // Grundlage jedes Schutzriegels dieses Projekts: Kommunikationsriegel,
  // Verdraengungsschutz, Erlaubnisliste der Kohortenwerkzeuge und das rein
  // lesende Erhebungs-SQL entscheiden allein an ihnen. Ein REALES Mandat mit
  // einer solchen Kennung waere fuer alle vier gleichzeitig ein synthetisches:
  // seine Mails und Pushes waeren gesperrt, es stuende in der Warteschlange
  // hinten, es zoege den Erhebungs-SQL in die Kohorte — und der Rueckbau haette
  // es deaktiviert. Deshalb eine harte Ablehnung statt einer stillen
  // Verwechslung. Der ausdrueckliche Kohortenweg setzt `synthetischErlaubt`.
  else if (mandatsklasse.istSynthetischeKennung(spec.id) && spec.synthetischErlaubt !== true) {
    errors.push(`id "${spec.id}" liegt in einer reservierten synthetischen Kennungsfamilie `
      + `(${mandatsklasse.KENNUNGSFAMILIEN_SYNTHETISCH.join(", ")}) — reale Mandate duerfen sie nicht tragen`);
  }
  if (!hasStr(spec.email)) errors.push("email fehlt (Auth-Nutzer)");
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(spec.email).trim())) errors.push(`email ${maskEmail(spec.email)} ist ungültig`);
  if (!hasStr(spec.name)) errors.push("name fehlt");
  if (!hasStr(spec.password) || String(spec.password).length < 8) errors.push("password fehlt oder < 8 Zeichen");
  if (!hasStr(spec.party) && !hasStr(spec.faction)) errors.push("party (oder faction) fehlt");
  const level = levelOf(spec);
  if (!level) errors.push("parliamentType fehlt (Bundestag|Landtag)");
  if (level === "Landtag" && !hasStr(spec.state) && !hasStr(spec.bundesland)) errors.push("bundesland/state fehlt (Landtag)");
  if (!hasStr(spec.constituency) && !hasStr(spec.wahlkreis) && !hasStr(spec.state) && !hasStr(spec.bundesland) && !hasStr(spec.region)) {
    errors.push("region fehlt (constituency/wahlkreis/state/region)");
  }
  if (!hasList(spec.committees) && !hasStr(spec.committee) && !hasList(spec.focusTopics)) {
    errors.push("mind. ein Ausschuss (committees) oder Thema (focusTopics) fehlt");
  }
  for (const [k, label] of [["aiBudgetDailyCents", "KI-Tagesbudget"], ["aiBudgetMonthlyCents", "KI-Monatsbudget"]]) {
    if (spec[k] === undefined || spec[k] === null || spec[k] === "") continue;
    const n = Number(spec[k]);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) errors.push(`${label} (${k}) muss eine positive Ganzzahl sein`);
  }
  if (spec.tenantDailyCallLimit !== undefined && spec.tenantDailyCallLimit !== null && spec.tenantDailyCallLimit !== "") {
    const n = Number(spec.tenantDailyCallLimit);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) errors.push("tenantDailyCallLimit muss eine positive Ganzzahl sein");
  }
  return errors;
}

// Baut aus der Spec ein Profil-Objekt, wie es validateProfile/saveProfile/
// resolveProfilePackages erwarten (camelCase). Setzt Grundeinstellungen.
//
// DER AKTIVIERUNGSZUSTAND IST EINE EINGABE, KEIN VORGABEWERT (Korrekturrunde 2026-08-25/4).
// ---------------------------------------------------------------------------
// Bis hierher stand hier fest `profileActive: true`. Damit legte JEDER Aufrufer — auch
// der neue Stapelpfad — ein Mandat AKTIV an. Der Importvertrag verlangt das Gegenteil
// (`op30-profilvertrag-200-mandate.md` §6: „Ein Import aktiviert niemals ein Mandat",
// „`profileActive: false` unabhaengig vom Eingang"), und `CLAUDE.md` §5 macht die
// Aktivierung zu einer getrennten Freigabeentscheidung. Ein stiller Vorgabewert im
// gemeinsamen Profilbauer ist genau der Weg, auf dem diese Freigabe umgangen wird.
//
// Deshalb: kein Default. Wer ein Profil baut, muss den Zustand ausdruecklich nennen.
// Ein fehlender Wert ist ein Programmierfehler und bricht laut — nicht still aktiv.
function buildProfile(spec = {}, optionen = {}) {
  const aktiv = optionen.aktiv;
  if (aktiv !== true && aktiv !== false) {
    throw new TypeError(
      "buildProfile: der Aktivierungszustand muss ausdruecklich uebergeben werden"
      + " (buildProfile(spec, { aktiv: true|false })). Ein stiller Vorgabewert auf AKTIV"
      + " wuerde die getrennte Aktivierungsfreigabe umgehen (CLAUDE.md §5).");
  }
  const level = levelOf(spec);
  const profile = {
    id: String(spec.id),
    fullName: String(spec.name || "").trim(),
    party: hasStr(spec.party) ? String(spec.party).trim() : "",
    faction: hasStr(spec.faction) ? String(spec.faction).trim() : (hasStr(spec.party) ? String(spec.party).trim() : ""),
    parliamentType: level,
    politicalLevel: level === "Landtag" ? "Land" : "Bund", // Legacy-/Blob-Kompat
    state: hasStr(spec.state) ? String(spec.state).trim() : (hasStr(spec.bundesland) ? String(spec.bundesland).trim() : ""),
    constituency: hasStr(spec.constituency) ? String(spec.constituency).trim() : (hasStr(spec.wahlkreis) ? String(spec.wahlkreis).trim() : (hasStr(spec.region) ? String(spec.region).trim() : "")),
    committees: hasList(spec.committees) ? spec.committees.map((c) => String(c).trim()).filter(Boolean) : (hasStr(spec.committee) ? [String(spec.committee).trim()] : []),
    focusTopics: hasList(spec.focusTopics) ? spec.focusTopics.map((t) => String(t).trim()).filter(Boolean) : [],
    profileActive: aktiv,
    onboardingStatus: "abgeschlossen",
    // Herkunftsmarkierung: NUR so markierte Profile darf dieses Werkzeug spaeter
    // aktualisieren/deaktivieren/entfernen (datengetriebener Bestandsschutz).
    provisionedBy: PROVISIONING_MARKER
  };
  if (spec.aiBudgetDailyCents !== undefined && spec.aiBudgetDailyCents !== null && spec.aiBudgetDailyCents !== "") profile.aiBudgetDailyCents = Number(spec.aiBudgetDailyCents);
  if (spec.aiBudgetMonthlyCents !== undefined && spec.aiBudgetMonthlyCents !== null && spec.aiBudgetMonthlyCents !== "") profile.aiBudgetMonthlyCents = Number(spec.aiBudgetMonthlyCents);
  return profile;
}

// Ein Wert gilt als LEER, wenn die Spec ihn faktisch nicht traegt. buildProfile setzt
// fuer jedes nicht gelieferte Feld einen Platzhalter ("" bzw. []) — genau diese
// Platzhalter duerfen einen vorhandenen Bestandswert NIE ueberschreiben.
function istLeer(wert) {
  if (wert === undefined || wert === null) return true;
  if (typeof wert === "string") return wert.trim() === "";
  if (Array.isArray(wert)) return wert.length === 0;
  return false;
}

// VERSCHMELZEN STATT ERSETZEN (Skalierungssprint 2026-08-25).
// ---------------------------------------------------------------------------
// Der Befund: `buildProfile` erzeugt 13 Felder, `toMandateProfileRow` schreibt aber
// JEDE Spalte, und der Upsert ersetzt die Zeile vollstaendig. Ein zweiter, identischer
// Provisionierungslauf loeschte damit alle nachtraeglich gepflegten Profilfelder
// (regionale_interessen, relevante_ministerien, namensvarianten, stellvertretende
// Ausschuesse, regierungsrolle, themen_prioritaeten, profil_extras) — also genau die
// Angaben, die die Personalisierung tragen. Fuer 25/50/100 Mandate ist ein wiederholbarer
// Stapellauf ohne diese Verschmelzung unbrauchbar.
//
// REGEL: Was die Spec nicht traegt, behaelt seinen Bestandswert.
//
// ZWEITER BEFUND, hier mitbehoben: `buildProfile` setzt `profileActive` fest. Ein
// Wiederholungslauf REAKTIVIERTE damit still ein zuvor deaktiviertes Mandat und umging
// faktisch die Aktivierungsfreigabe nach CLAUDE.md §5. Der Bestandswert gewinnt jetzt;
// eine Reaktivierung muss ausdruecklich angefordert werden.
//
// NACHGESCHAERFT (Korrekturrunde 2026-08-25/4): der Aktivierungszustand eines
// BESTEHENDEN Mandats gehoert ausschliesslich dem Bestand — er wird NIE aus dem
// gebauten Profil uebernommen. Vorher lief `profileActive` durch dieselbe Schleife wie
// jedes andere Feld; sobald der Bauer den Wert `false` liefert (Stapelpfad), haette ein
// Wiederholungslauf ein AKTIVES Mandat still DEAKTIVIERT. Beide Richtungen sind
// Freigabeentscheidungen, nicht Nebenwirkungen eines Wiederholungslaufs.
function mergeMitBestand(neu, bestand, { reaktivieren = false } = {}) {
  if (!bestand || typeof bestand !== "object") return { profil: neu, reaktivierung: false };
  const ergebnis = { ...bestand };
  for (const [schluessel, wert] of Object.entries(neu)) {
    if (schluessel === "profileActive") continue;                // gehoert dem Bestand, s. u.
    if (istLeer(wert) && !istLeer(bestand[schluessel])) continue; // Bestand gewinnt
    ergebnis[schluessel] = wert;
  }
  // Aktivierung ist eine Freigabeentscheidung, kein Nebeneffekt eines Wiederholungslaufs.
  const warDeaktiviert = bestand.profileActive === false;
  if (warDeaktiviert) {
    // Nur eine ausdrueckliche Anforderung hebt die Deaktivierung auf.
    ergebnis.profileActive = reaktivieren === true;
    if (!reaktivieren && bestand.deletedAt) ergebnis.deletedAt = bestand.deletedAt;
  } else {
    // Bestand war aktiv (oder trug den Wert gar nicht — `validateProfile` liest nur
    // `=== false` als deaktiviert). Der Zustand bleibt, was er war.
    ergebnis.profileActive = true;
  }
  return { profil: ergebnis, reaktivierung: warDeaktiviert && reaktivieren === true };
}

// Ist der Aktivierungszustand eines Bestandsprofils sicher bestimmbar?
// `profile-validation.isDisabled` liest ausschliesslich `profileActive === false` (plus
// `deletedAt`/`geloescht_at`). Ein Wert, der weder `true`, `false` noch abwesend ist —
// etwa die ZEICHENKETTE "false" nach einer fehlerhaften Serialisierung — waere damit
// still AKTIV, obwohl er das Gegenteil zu sagen scheint. Ein Trockenlauf darf einen
// solchen Zustand nicht vorhersagen, und ein scharfer Lauf darf ihn nicht ueberschreiben:
// beide melden ihn und tun nichts.
function aktivierungszustandBestimmbar(bestand) {
  if (!bestand || typeof bestand !== "object") return true;      // neues Mandat: bestimmt
  const wert = bestand.profileActive;
  return wert === true || wert === false || wert === undefined || wert === null;
}

function log(entries, step, status, detail) {
  entries.push({ step, status, detail: detail || null });
  return entries;
}

// DER EINZIGE RUECKWEG nach einem in DIESEM Lauf angelegten Konto (Review 2026-08-25/3).
// ---------------------------------------------------------------------------
// Vorher gab es drei verschiedene Rueckwege, zwei davon ueber
// `deleteAuthDataForPolitician(...)`. Das ist zu breit: die Funktion raeumt alles ab, was
// an der MANDATSKENNUNG haengt — auch VORBESTEHENDE Referentenzuweisungen, die dieser Lauf
// nie angelegt hat. Beide Stellen verschluckten zudem einen Loeschfehler
// (`.catch(() => {})`) und protokollierten trotzdem einen sauberen Rueckweg. Damit konnte
// die Provisionierung einen Rueckbau MELDEN, den die Ablage nicht traegt — genau das
// verbietet CLAUDE.md §4.10.
//
// Diese Hilfsfunktion trifft ausschliesslich das eine, neu angelegte Konto (`deleteUser`
// arbeitet auf der Nutzer-ID, nicht auf der Mandatskennung) und sagt ehrlich, ob es
// geklappt hat. Rueckgabe: "ok" | "fehlgeschlagen".
async function rolleNeuesKontoZurueck(accounts, entries, userId) {
  try {
    await accounts.deleteUser(userId);
    log(entries, "rollback", "ok",
      `neu angelegtes Konto ${userId} entfernt (kein halbes Konto, keine fremden Daten beruehrt)`);
    return "ok";
  } catch (err) {
    // EHRLICH: hier wird KEIN sauberer Zustand behauptet. Der Betreiber muss wissen,
    // dass moeglicherweise ein Konto ohne Profil zurueckbleibt.
    log(entries, "rollback", "fehler",
      `Konto ${userId} konnte NICHT entfernt werden: ${String(err && err.message || err).slice(0, 160)}`
      + " — moeglicherweise bleibt ein Konto ohne Profil zurueck.");
    return "fehlgeschlagen";
  }
}

// STAPELPROVISIONIERUNG (Skalierungssprint 2026-08-25).
// ---------------------------------------------------------------------------
// Bis hierher gab es KEINEN Aufrufer, der eine Liste von Mandaten anlegt: 25/50/100
// Mandate bedeuteten 25/50/100 Handlaeufe des Einzel-CLI — ohne gemeinsames Protokoll,
// ohne Gesamtbilanz, ohne Vorpruefung der ganzen Menge.
//
// Diese Funktion baut KEINE zweite Anlagelogik. Sie ruft ausschliesslich das vorhandene,
// bereits idempotente `provisionTenant` auf und ergaenzt drei Dinge:
//   1. eine VOLLSTAENDIGE Vorpruefung der ganzen Liste, BEVOR irgendetwas geschrieben wird
//      (Pflichtfelder je Spec + Dubletten von id und E-Mail INNERHALB des Pakets),
//   2. einen TROCKENLAUF als Standard — scharf wird nur mit ausdruecklichem `ausfuehren`,
//   3. eine ehrliche Bilanz je Mandat und in der Summe.
//
// FEHLERVERHALTEN: Standard ist fail-closed — der erste Fehler beendet den Stapel, damit
// kein halb angelegter Satz entsteht. `weiterBeiFehler` verarbeitet die uebrigen weiter
// und weist die Fehler am Ende aus. Ein einzelnes gescheitertes Mandat hinterlaesst dank
// des Rollbacks in `provisionTenant` keinen halben Account.
//
// ANLAGE UND AKTIVIERUNG SIND GETRENNT (Korrekturrunde 2026-08-25/4).
// ---------------------------------------------------------------------------
// Der Stapel legt AUSSCHLIESSLICH inaktiv an (`STAPEL_NEU_AKTIV`). Das ist kein
// Vorgabewert, den ein Aufrufer uebersteuern kann: `provisionBatch` nimmt dafuer keinen
// Parameter entgegen. Grundlage ist der Importvertrag
// (`op30-profilvertrag-200-mandate.md` §6) und `CLAUDE.md` §5 — Aktivierung ist eine
// getrennte Freigabeentscheidung und findet in diesem Werkzeug ueberhaupt nicht statt.
// Ein Datensatz, der eine Aktivierung VERLANGT, wird abgelehnt und nicht still
// umgedeutet (§6 des Vertrags: „Eine stille Korrektur waere eine Absichtserklaerung;
// eine Ablehnung ist eine Sperre.").
const STAPEL_NEU_AKTIV = false;

// Welche Felder einer Spec waeren eine Aktivierungsabsicht? Erlaubt ist ausschliesslich
// „nicht gesetzt" oder ausdrueckliches `false`. Jeder andere Wert (`true`, "true", 1, "ja")
// wird abgelehnt — auch ein wahrheitswertartiger String, der sonst still als aktiv
// durchginge.
function aktivierungswunschBefund(spec, stelle) {
  const befunde = [];
  for (const feld of ["aktiv", "profileActive", "active"]) {
    const wert = spec[feld];
    if (wert === undefined || wert === null || wert === false) continue;
    befunde.push(`${stelle}: "${feld}" ist gesetzt (${JSON.stringify(wert)}). Ein Stapellauf`
      + " aktiviert kein Mandat und deutet den Wunsch auch nicht still um — zulaessig ist"
      + " nur `false` oder gar kein Wert (op30-profilvertrag-200-mandate.md §6).");
  }
  if (spec.reaktivieren !== undefined && spec.reaktivieren !== null && spec.reaktivieren !== false) {
    befunde.push(`${stelle}: "reaktivieren" ist gesetzt (${JSON.stringify(spec.reaktivieren)}).`
      + " Eine Reaktivierung ist eine getrennte Freigabeentscheidung und im Stapelpfad"
      + " ausgeschlossen (CLAUDE.md §5).");
  }
  return befunde;
}

async function provisionBatch(specs, deps = {}, optionen = {}) {
  const { ausfuehren = false, weiterBeiFehler = false } = optionen;
  const liste = Array.isArray(specs) ? specs : [];
  const vorbefunde = [];

  if (!liste.length) {
    return { ok: false, trockenlauf: !ausfuehren, abgebrochen: true, grund: "leeres-paket",
      vorbefunde: ["Das Paket enthaelt kein einziges Mandat."], ergebnisse: [], bilanz: leereBilanz() };
  }

  // 1) Vorpruefung der GANZEN Liste — kein Schreibvorgang davor.
  const gesehenId = new Map();
  const gesehenEmail = new Map();
  liste.forEach((spec, i) => {
    const stelle = `#${i + 1}${spec && spec.id ? ` (${spec.id})` : ""}`;
    const fehler = validateSpec(spec || {});
    for (const f of fehler) vorbefunde.push(`${stelle}: ${f}`);
    for (const f of aktivierungswunschBefund(spec || {}, stelle)) vorbefunde.push(f);
    const id = slugify(spec && spec.id);
    if (id) {
      if (gesehenId.has(id)) vorbefunde.push(`${stelle}: id "${id}" kommt im Paket doppelt vor (zuerst #${gesehenId.get(id) + 1})`);
      else gesehenId.set(id, i);
    }
    const mail = String((spec && spec.email) || "").trim().toLowerCase();
    if (mail) {
      if (gesehenEmail.has(mail)) vorbefunde.push(`${stelle}: E-Mail ${maskEmail(mail)} kommt im Paket doppelt vor (zuerst #${gesehenEmail.get(mail) + 1})`);
      else gesehenEmail.set(mail, i);
    }
  });

  if (vorbefunde.length) {
    return { ok: false, trockenlauf: !ausfuehren, abgebrochen: true, grund: "vorpruefung-fehlgeschlagen",
      vorbefunde, ergebnisse: [], bilanz: leereBilanz() };
  }

  // 2) Trockenlauf: rein lesend feststellen, was ein scharfer Lauf TUN WUERDE.
  if (!ausfuehren) {
    const ergebnisse = [];
    for (const spec of liste) ergebnisse.push(await vorschauFuerMandat(spec, deps));
    const blockiert = ergebnisse.filter((e) => !e.ok);
    // GESCHLOSSEN FEHLSCHLAGEN, WENN DER ZIELZUSTAND NICHT VORHERSAGBAR IST.
    // Eine Vorschau, die den Aktivierungszustand nicht nennen kann, darf keinen
    // scharfen Lauf empfehlen — an diesem Zustand haengt die Freigabepflicht.
    const ohneZielzustand = ergebnisse.filter((e) => e.ok && e.zielAktiv !== true && e.zielAktiv !== false);
    if (ohneZielzustand.length) {
      return {
        ok: false, trockenlauf: true, abgebrochen: true,
        grund: `zielzustand-unbestimmt:${ohneZielzustand.length}`,
        vorbefunde: ohneZielzustand.map((e) => `${e.tenantId}: der Aktivierungszustand nach dem Lauf`
          + " ist nicht sicher vorhersagbar — kein scharfer Lauf."),
        ergebnisse, bilanz: bilanzAus(ergebnisse, true)
      };
    }
    // KORREKTUR 2026-08-25/2 (Review-Befund 2): Der Trockenlauf meldete frueher
    // pauschal `ok: true` — auch dann, wenn ein Mandat als
    // `abbruch:geschuetztes-mandat` vorhergesagt wurde. Das war falsches Gruen
    // (CLAUDE.md §4.4): die Vorschau sagte einen Fehlschlag voraus und meldete
    // trotzdem Erfolg, und die CLI endete mit Status 0. Jetzt gilt: ein einziges
    // blockiertes Mandat laesst den GESAMTEN Trockenlauf fehlschlagen.
    return {
      ok: blockiert.length === 0,
      trockenlauf: true,
      abgebrochen: blockiert.length > 0,
      grund: blockiert.length ? `vorschau-blockiert:${blockiert.length}` : undefined,
      vorbefunde: [],
      ergebnisse,
      bilanz: bilanzAus(ergebnisse, true)
    };
  }

  // 3) Scharfer Lauf — ausschliesslich inaktiv anlegend, nicht uebersteuerbar.
  const ergebnisse = [];
  for (const spec of liste) {
    const res = await provisionTenant(spec, deps, { neuAktiv: STAPEL_NEU_AKTIV });
    ergebnisse.push(res);
    if (!res.ok && !weiterBeiFehler) {
      return { ok: false, trockenlauf: false, abgebrochen: true, grund: `abbruch-bei-${res.reason}`,
        vorbefunde: [], ergebnisse, bilanz: bilanzAus(ergebnisse, false) };
    }
  }
  const bilanz = bilanzAus(ergebnisse, false);
  return { ok: bilanz.fehlgeschlagen === 0, trockenlauf: false, abgebrochen: false,
    vorbefunde: [], ergebnisse, bilanz };
}

// VORSCHAU EINES EINZELNEN MANDATS — rein lesend (Review-Befund 2, 2026-08-25/2).
// ---------------------------------------------------------------------------
// Nimmt dieselben Riegel vorweg, an denen `provisionTenant` spaeter abbrechen wuerde,
// und schreibt dabei NICHTS. Der frueher gemeldete `vorhaben`-Wert war zu grob: er kannte
// nur "anlegen"/"aktualisieren"/"geschuetzt" und sagte weder Konto- und E-Mail-Konflikte
// noch fehlende Profilreife voraus. Ein Trockenlauf, der einen scharfen Lauf nicht
// vorhersagt, ist wertlos.
//
// GRENZE, ehrlich benannt: vorhergesagt wird nur, was rein lesend entscheidbar ist.
// Laufzeitfehler der Ablage (Schreibfehler, verdraengter Blob, Netzabbruch) kann kein
// Trockenlauf vorwegnehmen.
async function vorschauFuerMandat(spec, deps = {}) {
  const storage = deps.storage || require("./storage");
  const accounts = deps.accounts || require("./accounts");
  // `zielAktiv` ist der Aktivierungszustand, den das Mandat NACH einem scharfen Lauf
  // haette. `null` bedeutet ausdruecklich „nicht vorhersagbar" — der Aufrufer laesst die
  // Vorschau dann geschlossen fehlschlagen. Ein Abbruch sagt nichts ueber den Zustand
  // voraus, weil er nichts veraendert; dort bleibt der Wert `null`.
  const treffer = (vorhaben, grund, zielAktiv = null) => ({
    tenantId: spec.id, ok: !String(vorhaben).startsWith("abbruch"), trockenlauf: true, vorhaben,
    grund: grund || null, zielAktiv
  });

  // Schritt 0 von provisionTenant: Bestandsschutz.
  if (await isProtectedTenant(spec.id, deps)) {
    return treffer("abbruch:geschuetztes-mandat",
      "bestehendes Mandat ohne provisionedBy-Markierung oder gesperrte Kennung");
  }

  // Schritt 2: Bestand lesen und verschmelzen — genau wie im scharfen Lauf.
  let bestand = null;
  try {
    bestand = await storage.getProfile(spec.id);
  } catch (err) {
    return treffer("abbruch:bestand-nicht-lesbar", String(err && err.message || err).slice(0, 160));
  }

  // Der Aktivierungszustand des Bestands muss sicher lesbar sein — sonst waere jede
  // Vorhersage geraten. Derselbe Riegel wie im scharfen Lauf.
  if (!aktivierungszustandBestimmbar(bestand)) {
    return treffer("abbruch:aktivierungszustand-unklar",
      `Bestandswert profileActive ist weder true noch false (${typeof bestand.profileActive})`);
  }

  // Die Vorschau bildet den STAPELPFAD ab — und der legt ausschliesslich inaktiv an.
  // Ein bereits deaktiviertes Mandat ist deshalb KEIN Abbruchgrund (anders als im
  // aktiven Einzelpfad): der Stapel aktualisiert seinen Inhalt und laesst den Zustand.
  const { profil } = mergeMitBestand(buildProfile(spec, { aktiv: STAPEL_NEU_AKTIV }), bestand,
    { reaktivieren: spec.reaktivieren === true });
  // Zielzustand: neues Mandat -> inaktiv; bestehendes Mandat -> unveraendert.
  const zielAktiv = bestand ? profil.profileActive !== false : STAPEL_NEU_AKTIV;

  const { validateProfile } = deps.validation || require("./profile-validation");
  // Inhalt und Zustand getrennt — genau wie im scharfen Lauf (siehe dort). Die
  // Loeschmarke bleibt stehen und laesst ein soft-geloeschtes Mandat weiterhin abbrechen.
  const validierung = validateProfile(
    profil.profileActive === false ? { ...profil, profileActive: true } : profil);
  if (["fehlerhaft", "nicht_bereit", "deaktiviert"].includes(validierung.state)) {
    return treffer("abbruch:profil-nicht-bereit", `Zustand ${validierung.state}: ${validierung.reason}`);
  }

  // Schritt 2b: harte Bundestagsreife.
  const reife = (deps.readiness || require("./profile-readiness")).pruefeNeuaktivierung(profil);
  if (reife.zutreffend && !reife.zulaessig) {
    return treffer("abbruch:bundestagsprofil-nicht-bereit",
      `${(reife.fehler || []).length} Blocker`);
  }

  // Schritt 3: Konto- und E-Mail-Konflikte — rein lesend entscheidbar.
  let nutzer;
  try {
    nutzer = await accounts.listUsers();
  } catch (err) {
    return treffer("abbruch:konten-nicht-lesbar", String(err && err.message || err).slice(0, 160));
  }
  const liste = Array.isArray(nutzer) ? nutzer : [];
  const emailNorm = accounts.normalizeEmail(spec.email);
  const perEmail = liste.find((u) => accounts.normalizeEmail(u.email) === emailNorm) || null;
  const perMandat = liste.find((u) => u.politicianId === spec.id) || null;
  if (perEmail && perEmail.politicianId !== spec.id) {
    return treffer("abbruch:email-gehoert-anderem-konto",
      `${maskEmail(spec.email)} gehoert einem anderen Konto (Rolle ${perEmail.role})`);
  }
  if (perMandat && (!perEmail || perMandat.id !== perEmail.id)) {
    return treffer("abbruch:id-an-andere-email-gebunden",
      `Mandatskennung ${spec.id} ist bereits an eine andere E-Mail gebunden`);
  }

  // Das Vorhaben nennt den Zielzustand MIT — „anlegen" allein hat den entscheidenden
  // Teil verschwiegen. `aktualisieren-*` sagt ausdruecklich, dass der Lauf den
  // Aktivierungszustand des Bestands NICHT anfasst.
  // Massgeblich ist das PROFIL: ohne Bestandsprofil entsteht das Mandat neu — und zwar
  // inaktiv, auch wenn zu der E-Mail bereits ein Konto existiert.
  if (!bestand) return treffer("anlegen-inaktiv", null, false);
  return treffer(zielAktiv ? "aktualisieren-bleibt-aktiv" : "aktualisieren-bleibt-inaktiv",
    null, zielAktiv);
}

function leereBilanz() {
  return { gesamt: 0, angelegt: 0, aktualisiert: 0, fehlgeschlagen: 0, geplant: 0, blockiert: 0 };
}

function bilanzAus(ergebnisse, trockenlauf) {
  const b = leereBilanz();
  b.gesamt = ergebnisse.length;
  for (const r of ergebnisse) {
    // Im Trockenlauf zaehlt nur ein DURCHFUEHRBARES Mandat als geplant. Ein
    // blockiertes als "geplant" zu fuehren waere dieselbe Beschoenigung, die
    // Review-Befund 2 beanstandet hat.
    if (trockenlauf) { if (r.ok) b.geplant += 1; else b.blockiert += 1; continue; }
    if (!r.ok) b.fehlgeschlagen += 1;
    else if (r.created) b.angelegt += 1;
    else b.aktualisiert += 1;
  }
  return b;
}

// Der Kern-Ablauf. deps: { accounts, storage, validation, packages }.
//
// `optionen.neuAktiv` (PFLICHT, kein Vorgabewert) sagt, in welchem Zustand ein NEU
// angelegtes Mandat entsteht:
//   * `true`  — Einzelprovisionierung von Hand: der Betreiber trifft die
//               Aktivierungsentscheidung in genau diesem Moment (bisheriges Verhalten).
//   * `false` — Anlage ohne Aktivierung: Profil `profileActive: false`, Konto gesperrt
//               (`active: false`), Kontostatus wird NICHT auf "aktiv" gezogen.
//               Das ist der einzige zulaessige Modus des Stapelpfads.
// Auf ein BESTEHENDES Mandat wirkt der Wert nicht: dessen Zustand gehoert dem Bestand
// (`mergeMitBestand`), und eine Reaktivierung verlangt weiterhin `reaktivieren: true`.
async function provisionTenant(spec = {}, deps = {}, optionen = {}) {
  const neuAktiv = optionen.neuAktiv;
  if (neuAktiv !== true && neuAktiv !== false) {
    throw new TypeError(
      "provisionTenant: der Aktivierungszustand neu angelegter Mandate muss ausdruecklich"
      + " uebergeben werden (provisionTenant(spec, deps, { neuAktiv: true|false }))."
      + " Ein stiller Vorgabewert auf AKTIV wuerde die getrennte Aktivierungsfreigabe"
      + " umgehen (CLAUDE.md §5).");
  }
  const accounts = deps.accounts || require("./accounts");
  const storage = deps.storage || require("./storage");
  const { validateProfile } = deps.validation || require("./profile-validation");
  const { resolveProfilePackages, profileSupplyStatus } = deps.packages || require("./quellenarchitektur/profile-packages");
  const entries = [];

  // 0) Schutz bestehender Mandanten (datengetrieben, siehe isProtectedTenant).
  if (await isProtectedTenant(spec.id, deps)) {
    log(entries, "schutz", "abbruch", `${spec.id} ist ein bestehender/geschützter Mandant — Provisionierung verweigert.`);
    return { ok: false, aborted: true, reason: "protected-tenant", tenantId: spec.id, log: entries };
  }

  // 1) Pflichtfelder VOR jedem Schreibvorgang prüfen.
  const specErrors = validateSpec(spec);
  if (specErrors.length) {
    log(entries, "spec-validierung", "abbruch", `${specErrors.length} Pflichtfeld-Fehler`);
    return { ok: false, aborted: true, reason: "spec-invalid", errors: specErrors, tenantId: spec.id, log: entries };
  }
  log(entries, "spec-validierung", "ok", "Pflichtfelder vollständig");

  // 2) Profil bauen + fachlich validieren (nicht_bereit/fehlerhaft => Abbruch VOR Write).
  // Bei einem WIEDERHOLUNGSLAUF wird der Bestand vorher gelesen und verschmolzen — sonst
  // wuerde der vollstaendig ersetzende Upsert gepflegte Felder loeschen (mergeMitBestand).
  // Der Bestand ist hier immer ein von DIESEM Werkzeug angelegtes Profil: Schritt 0 hat
  // jedes fremde Mandat bereits abgewiesen.
  let bestandsprofil = null;
  try {
    bestandsprofil = await storage.getProfile(spec.id);
  } catch (err) {
    // FAIL-CLOSED wie in isProtectedTenant: ist der Bestand nicht lesbar, darf NICHT
    // blind ersetzt werden — sonst loescht eine transiente Stoerung gepflegte Felder.
    log(entries, "bestand-lesen", "abbruch", `Bestand nicht lesbar: ${String(err && err.message || err).slice(0, 160)}`);
    return { ok: false, aborted: true, reason: "existing-profile-unreadable", tenantId: spec.id, log: entries };
  }
  // FAIL CLOSED bei unklarem Aktivierungszustand: lieber kein Schreibvorgang als eine
  // Vermutung ueber einen Zustand, an dem die Freigabepflicht haengt.
  if (!aktivierungszustandBestimmbar(bestandsprofil)) {
    log(entries, "aktivierungszustand", "abbruch",
      `Bestandswert profileActive ist weder true noch false (${typeof bestandsprofil.profileActive})`
      + " — der Zustand ist nicht sicher bestimmbar, es wird nichts geschrieben.");
    return { ok: false, aborted: true, reason: "aktivierungszustand-unklar", tenantId: spec.id, log: entries };
  }
  const specProfil = buildProfile(spec, { aktiv: neuAktiv });
  const { profil: profile, reaktivierung } = mergeMitBestand(
    specProfil, bestandsprofil, { reaktivieren: spec.reaktivieren === true }
  );
  if (!bestandsprofil) {
    log(entries, "aktivierungszustand", neuAktiv ? "aktiv" : "inaktiv",
      neuAktiv
        ? "neues Mandat wird AKTIV angelegt (Einzelprovisionierung)"
        : "neues Mandat wird INAKTIV angelegt (profileActive=false, Konto gesperrt) —"
          + " die Aktivierung bleibt eine getrennte Freigabeentscheidung (CLAUDE.md §5)");
  }
  if (bestandsprofil) {
    const behalten = Object.keys(bestandsprofil).filter((k) => !(k in specProfil));
    log(entries, "bestand-verschmolzen", "ok",
      `bestehendes Profil verschmolzen · ${behalten.length} zusaetzliche Felder behalten`
      + (bestandsprofil.profileActive === false
        ? ` · war deaktiviert -> ${reaktivierung ? "auf ausdrueckliche Anforderung REAKTIVIERT" : "bleibt deaktiviert"}`
        : ""));
  }
  // WIDERSPRUCH ZWISCHEN ABSICHT UND BESTAND — nicht Inaktivitaet an sich.
  // Ein Lauf, der ein AKTIVES Mandat herstellen will (`neuAktiv: true`, Einzel-
  // provisionierung von Hand), darf ein deaktiviertes Mandat nicht stillschweigend
  // anfassen: das war Befund 2 (§4.5) und bleibt ein geschlossener Abbruch.
  // Ein Lauf, der ohnehin INAKTIV arbeitet (Stapel), findet in einem deaktivierten
  // Mandat keinen Widerspruch — er aktualisiert den Inhalt und laesst den Zustand, wie
  // er ist. Ohne diese Unterscheidung koennte der Stapel seine EIGENEN, inaktiv
  // angelegten Mandate nie wieder anfassen; die zugesicherte Wiederholbarkeit waere weg.
  const bestandDeaktiviert = Boolean(bestandsprofil) && bestandsprofil.profileActive === false;
  if (bestandDeaktiviert && neuAktiv && spec.reaktivieren !== true) {
    log(entries, "aktivierungszustand", "abbruch",
      "Mandat ist deaktiviert, dieser Lauf will es aktiv herstellen — Reaktivierung verlangt"
      + " ausdruecklich reaktivieren:true (CLAUDE.md §5). Es wird nichts geschrieben.");
    return { ok: false, aborted: true, reason: "profile-not-ready", tenantId: spec.id, log: entries };
  }

  // INHALT UND ZUSTAND GETRENNT PRUEFEN (Korrekturrunde 2026-08-25/4).
  // `validateProfile` liefert `deaktiviert`, sobald `profileActive === false` ist — der
  // Zustand verdeckt dann jedes inhaltliche Urteil. Wo die Inaktivitaet die ABSICHT des
  // Laufs ist, ist sie kein Mangel; geprueft wird deshalb der INHALT an einer Pruefkopie.
  // NICHT mit umgangen wird die Loeschmarke: `deletedAt`/`geloescht_at` bleiben in der
  // Pruefkopie stehen, ein soft-geloeschtes Mandat bleibt also `deaktiviert` und bricht ab.
  const inaktivIstAbsicht = profile.profileActive === false && neuAktiv === false;
  const inhaltsprofil = inaktivIstAbsicht ? { ...profile, profileActive: true } : profile;
  const validation = validateProfile(inhaltsprofil);
  if (validation.state === "fehlerhaft" || validation.state === "nicht_bereit" || validation.state === "deaktiviert") {
    log(entries, "profil-validierung", "abbruch", `Zustand ${validation.state}: ${validation.reason}`);
    return { ok: false, aborted: true, reason: "profile-not-ready", validation, tenantId: spec.id, log: entries };
  }
  log(entries, "profil-validierung", "ok", `Zustand ${validation.state} (${validation.missingRequired.length} fehlende Felder)`
    + (inaktivIstAbsicht ? " — am INHALT geprueft; gespeichert wird das Mandat inaktiv" : ""));

  // 2b) HARTE SPERRE des NEUEN Aktivierungsuebergangs (Bundestag): ein neues
  // unvollstaendiges Bundestagsprofil wird NICHT angelegt/aktiviert. Der Fehler
  // nennt jede fehlende/ungueltige Angabe konkret. Bestehende aktive Mandate
  // beruehrt das nicht — dieses Werkzeug fasst sie ohnehin nie an (Schritt 0),
  // und die laufende Verarbeitung liest weiterhin nur validateProfile.
  const readiness = (deps.readiness || require("./profile-readiness")).pruefeNeuaktivierung(profile);
  if (readiness.zutreffend && !readiness.zulaessig) {
    log(entries, "bundestagsreife", "abbruch", `${readiness.fehler.length} Blocker (kein Write ausgefuehrt)`);
    return { ok: false, aborted: true, reason: "bundestagsprofil-nicht-bereit", errors: readiness.fehler, validation, readiness, tenantId: spec.id, log: entries };
  }
  if (readiness.zutreffend) {
    const warnzahl = readiness.ergebnis ? readiness.ergebnis.warnungen.length : 0;
    log(entries, "bundestagsreife", "ok", `bereit (${warnzahl} Qualitaetswarnung${warnzahl === 1 ? "" : "en"})`);
  }

  // 3) Konflikt-Vorprüfung: gehört die id/E-Mail schon jemand ANDEREM?
  const users = await accounts.listUsers();
  const emailNorm = accounts.normalizeEmail(spec.email);
  const byEmail = users.find((u) => accounts.normalizeEmail(u.email) === emailNorm) || null;
  const byPolitician = users.find((u) => u.politicianId === spec.id) || null;
  // Die E-Mail darf NUR übernommen werden, wenn sie bereits GENAU dem Abgeordneten
  // DIESES Mandats gehört. Andernfalls (anderes Mandat ODER ein Admin/Referent/Demo
  // mit politicianId=null) NICHT übernehmen/degradieren — sonst würde z. B. ein
  // Admin-Konto zum Abgeordneten umgebunden (Kontoübernahme). Idempotenz greift
  // ausschließlich bei exakt gleicher (E-Mail, id)-Paarung.
  if (byEmail && byEmail.politicianId !== spec.id) {
    log(entries, "konflikt", "abbruch", `E-Mail ${maskEmail(spec.email)} gehört einem anderen Konto (politicianId=${byEmail.politicianId ?? "—"}, Rolle ${byEmail.role})`);
    return { ok: false, aborted: true, reason: "email-belongs-to-other-account", tenantId: spec.id, log: entries };
  }
  if (byPolitician && (!byEmail || byPolitician.id !== byEmail.id)) {
    // Mandant-id ist bereits an ein Konto mit ANDERER E-Mail gebunden.
    log(entries, "konflikt", "abbruch", `Mandant-id ${spec.id} ist bereits an eine andere E-Mail gebunden`);
    return { ok: false, aborted: true, reason: "id-belongs-to-other-email", tenantId: spec.id, log: entries };
  }

  // 4) Auth-Nutzer idempotent anlegen/aktualisieren.
  let user = null;
  let createdUserThisRun = false;
  try {
    if (byEmail) {
      // Der Kontostatus wird NUR im aktiven Pfad angefasst. Ein erzwungenes "aktiv" im
      // inaktiven Anlagepfad waere genau die stille Aktivierung, die dieser Lauf
      // ausschliesst — ein gesperrtes Konto wuerde dadurch wieder anmeldefaehig.
      const kontoPatch = { name: spec.name, role: "abgeordneter", politicianId: spec.id };
      if (neuAktiv) kontoPatch.status = "aktiv";
      user = await accounts.updateUser(byEmail.id, kontoPatch);
      log(entries, "auth-nutzer", "aktualisiert", `bestehendes Konto ${user.id} (${maskEmail(spec.email)})`
        + (neuAktiv ? "" : " · Kontostatus unveraendert gelassen (Anlage ohne Aktivierung)"));
    } else {
      // `active: false` sperrt das Konto. Genau diesen Wert lesen `accounts.resolveSession`
      // (keine Sitzung aufloesbar), `accounts.createPasswordToken` und
      // `accounts.setPasswordWithToken` (kein Einladungs-/Zuruecksetzlink). Ohne ihn
      // entstuende fuer ein Mandat, das niemand freigegeben hat, ein nutzbares Konto.
      user = await accounts.createUser({ email: spec.email, name: spec.name, role: "abgeordneter", password: spec.password, politicianId: spec.id, active: neuAktiv });
      createdUserThisRun = true;
      // createUser leitet die politicianId ggf. eindeutig ab — bei Kollision != spec.id.
      if (user.politicianId !== spec.id) {
        log(entries, "auth-nutzer", "abbruch",
          `politicianId-Kollision: erwartet ${spec.id}, erhalten ${user.politicianId}`);
        // Eng begrenzt auf das gerade angelegte Konto. Frueher lief hier
        // `deleteAuthDataForPolitician(user.politicianId)` — das haette zusaetzlich
        // vorbestehende Zuweisungen an der ABGELEITETEN Kennung getroffen.
        const rueckweg = await rolleNeuesKontoZurueck(accounts, entries, user.id);
        return { ok: false, aborted: true, reason: "politician-id-collision",
          rueckweg, tenantId: spec.id, log: entries };
      }
      // CLAUDE.md §4.10: Wer einen Erfolg MELDET, prueft ihn gegen den persistierten Stand.
      // Der Auth-Speicher wird als GANZER Blob unbedingt Lesen->Aendern->Schreiben
      // geschrieben (accounts.js readStore/writeStore, last write wins). Bei einem
      // Stapellauf ueber 25/50/100 Mandate laufen viele solcher Vollschreibvorgaenge
      // kurz hintereinander; ein nebenlaeufiger Schreiber (Session, llmUsage, Login)
      // kann den frisch angelegten Nutzer wieder verdraengen. Ohne diese Rueckpruefung
      // meldete die Provisionierung dann einen Erfolg, den die Ablage nicht traegt.
      let persistiert = null;
      try {
        const nachher = await accounts.listUsers();
        persistiert = (Array.isArray(nachher) ? nachher : []).find((u) => u && u.id === user.id) || null;
      } catch (err) {
        persistiert = null;
        log(entries, "auth-nachpruefung", "warnung", `Bestand nicht lesbar: ${String(err && err.message || err).slice(0, 120)}`);
      }
      if (!persistiert) {
        log(entries, "auth-nachpruefung", "abbruch",
          `Konto ${user.id} ist nach dem Schreiben NICHT in der Ablage auffindbar (verdraengter Blob-Schreibvorgang?)`);
        // Dieser Abbruch liegt NACH dem Anlegen des Kontos und VOR dem Profil-Write.
        // Ohne Rueckweg bliebe genau der halbe Zustand zurueck, den die Provisionierung
        // ausschliesst — auch dann, wenn das Konto sehr wohl geschrieben wurde und nur
        // der Kontroll-Lesezugriff scheiterte.
        const rueckweg = await rolleNeuesKontoZurueck(accounts, entries, user.id);
        return { ok: false, aborted: true, reason: "auth-write-not-persisted",
          rueckweg, tenantId: spec.id, log: entries };
      }
      log(entries, "auth-nutzer", "angelegt", `neues Konto ${user.id} (${maskEmail(spec.email)})`);
      log(entries, "auth-nachpruefung", "ok", "Konto ist in der Ablage nachweisbar");
    }
  } catch (err) {
    log(entries, "auth-nutzer", "fehler", String(err && err.message || err).slice(0, 200));
    return { ok: false, aborted: true, reason: "auth-write-failed", tenantId: spec.id, log: entries };
  }

  // 5) Profil schreiben. Bei Fehler: neu angelegten Nutzer zurückrollen (kein halber Account).
  try {
    await storage.saveProfile(profile);
    log(entries, "profil", "gespeichert", `store.profiles[${spec.id}] + mandateProfiles`);
  } catch (err) {
    log(entries, "profil", "fehler", String(err && err.message || err).slice(0, 200));
    // Rollback NUR des in DIESEM Lauf angelegten Kontos — und nur ueber seine Nutzer-ID.
    // Frueher lief hier `deleteAuthDataForPolitician(spec.id)`; der zugehoerige Kommentar
    // erklaerte das Mitloeschen VORBESTEHENDER Referentenzuweisungen fuer akzeptabel.
    // Das ist zurueckgenommen (Review 2026-08-25/3): ein Rueckbau darf ausschliesslich
    // das entfernen, was dieser Lauf angelegt hat.
    let rueckweg;
    if (createdUserThisRun) rueckweg = await rolleNeuesKontoZurueck(accounts, entries, user.id);
    return { ok: false, aborted: true, reason: "profile-write-failed",
      rueckweg, tenantId: spec.id, log: entries };
  }

  // 6) Quellenpaket-Zuordnung (deterministisch aus dem Profil) — Versorgungsnachweis.
  let packages = null;
  let supply = null;
  try {
    packages = resolveProfilePackages(profile);
    supply = profileSupplyStatus(profile);
    log(entries, "quellenpakete", "abgeleitet", `pflicht: ${packages.required.join(", ")} · optional: ${packages.optional.join(", ") || "—"}`);
  } catch (err) {
    log(entries, "quellenpakete", "warnung", `Paketableitung fehlgeschlagen (nicht fatal): ${String(err && err.message).slice(0, 120)}`);
  }

  // 7) Budget-/Kostendeckel-Konfiguration (Hinweis — env-Änderung ist freigabepflichtig).
  const budget = {
    aiBudgetDailyCents: profile.aiBudgetDailyCents ?? null,
    aiBudgetMonthlyCents: profile.aiBudgetMonthlyCents ?? null,
    tenantDailyCallLimit: spec.tenantDailyCallLimit != null && spec.tenantDailyCallLimit !== "" ? Number(spec.tenantDailyCallLimit) : null
  };
  log(entries, "budget", "konfiguriert", `EUR-Deckel Tag=${budget.aiBudgetDailyCents ?? "Systemdefault"} · per-Mandant-Callcap=${budget.tenantDailyCallLimit ?? "uniformer Default"}`);

  return {
    ok: true,
    created: createdUserThisRun,
    updated: !createdUserThisRun,
    // EHRLICHE MELDUNG DES TATSAECHLICH GESPEICHERTEN ZUSTANDS. `validation` beschreibt
    // bei einer bewussten Inaktiv-Anlage den INHALT, nicht den Zustand — deshalb steht
    // der Zustand hier ausdruecklich und getrennt.
    profilAktiv: profile.profileActive !== false,
    tenantId: spec.id,
    userId: user.id,
    email: user.email,
    validation,
    packages,
    supply,
    budget,
    readiness: {
      kannBriefingErhalten: Boolean(validation.impact && validation.impact.kannBriefingErhalten),
      kannMatching: Boolean(validation.usable),
      quellenVersorgt: Boolean(supply && supply.fullyActivated)
    },
    log: entries
  };
}

// Reversible Deaktivierung eines Mandanten — berührt KEINE Fremddaten.
async function deactivateTenant(id, deps = {}) {
  const accounts = deps.accounts || require("./accounts");
  const storage = deps.storage || require("./storage");
  const entries = [];
  if (await isProtectedTenant(id, deps)) {
    log(entries, "schutz", "abbruch", `${id} ist ein bestehender/geschützter Mandant — Deaktivierung verweigert.`);
    return { ok: false, aborted: true, reason: "protected-tenant", tenantId: id, log: entries };
  }
  const users = await accounts.listUsers();
  const user = users.find((u) => u.politicianId === id) || null;
  if (user) {
    await accounts.updateUser(user.id, { status: "deaktiviert" });
    log(entries, "auth-nutzer", "deaktiviert", `Konto ${user.id} gesperrt (Login blockiert)`);
  } else {
    log(entries, "auth-nutzer", "übersprungen", "kein Konto zu dieser id");
  }
  const profile = await storage.getProfile(id);
  if (profile) {
    await storage.saveProfile({ ...profile, profileActive: false, deletedAt: null });
    log(entries, "profil", "deaktiviert", "profileActive=false (Job-/Cron-Teilnahme aus)");
  } else {
    log(entries, "profil", "übersprungen", "kein Profil zu dieser id");
  }
  return { ok: true, deactivated: true, tenantId: id, reversible: true, log: entries };
}

// ── AKTIVIERUNG EINES EINZELNEN MANDATS (ergaenzt 02.09.) ────────────────────
// Spiegelbild zu `deactivateTenant`. Es gab bis hierher KEINEN Weg, ein einzelnes
// bereits angelegtes Mandat wieder scharf zu schalten: `provisionBatch` weist
// jeden Aktivierungswunsch ausdruecklich ab (`aktivierungswunschBefund`), und
// dieser Vertrag bleibt unangetastet — ein Stapellauf aktiviert weiterhin nichts.
// Die gestufte Aktivierung des 500er-Funktionstests braucht aber genau diesen
// einen Schritt, und zwar getrennt freigegeben.
//
// BEWUSST MINIMAL — es wird GENAU EIN Feld geschrieben:
//   * `profileActive: true` schaltet die Job-/Cron-Teilnahme ein. Mehr braucht
//     der Motor nicht (`profile-validation.isDisabled` liest allein dieses Feld).
//   * Das KONTO wird ABSICHTLICH NICHT angefasst. Ein deaktiviertes Konto kann
//     sich nicht anmelden und keine Einladungs-/Reset-Mail ausloesen — das ist
//     fuer den Testtag die SICHERERE Stellung, nicht die schlechtere. Wer ein
//     Konto braucht, entscheidet das getrennt.
//
// DREI ABLEHNUNGEN, alle fail closed:
//   1. Ein geschuetzter (realer) Mandant wird nie aktiviert.
//   2. Eine gesetzte Loeschmarke wird nie stillschweigend uebergangen — eine
//      geloeschte Zeile wieder scharf zu schalten ist eine andere Entscheidung.
//   3. Fehlt das Profil, wird nichts angelegt. Diese Funktion aktiviert nur.
async function activateTenant(id, deps = {}) {
  const storage = deps.storage || require("./storage");
  const entries = [];
  if (await isProtectedTenant(id, deps)) {
    log(entries, "schutz", "abbruch", `${id} ist ein bestehender/geschützter Mandant — Aktivierung verweigert.`);
    return { ok: false, aborted: true, reason: "protected-tenant", tenantId: id, log: entries };
  }
  const profile = await storage.getProfile(id);
  if (!profile) {
    log(entries, "profil", "abbruch", "kein Profil zu dieser id — es wird keines angelegt");
    return { ok: false, aborted: true, reason: "kein-profil", tenantId: id, log: entries };
  }
  if (profile.deletedAt) {
    log(entries, "profil", "abbruch", "Löschmarke gesetzt — eine gelöschte Zeile wird nicht still reaktiviert");
    return { ok: false, aborted: true, reason: "loeschmarke", tenantId: id, log: entries };
  }
  if (profile.profileActive === true) {
    log(entries, "profil", "übersprungen", "bereits aktiv (idempotent)");
    return { ok: true, activated: false, bereitsAktiv: true, tenantId: id, log: entries };
  }
  await storage.saveProfile({ ...profile, profileActive: true });
  log(entries, "profil", "aktiviert", "profileActive=true (Job-/Cron-Teilnahme an); Konto unverändert");
  return { ok: true, activated: true, tenantId: id, kontoUnveraendert: true, log: entries };
}

// Vollständige Entfernung (für Tests / Rollback einer Provisionierung). Strikt auf
// die id gescoped über storage.deleteTenantScopedData: Profil-Identität, EIGENE
// rawItems (nur explizite Zuordnung), Content-Store, V3-Zeilen (user_id) + Auth.
// BEWUSST NICHT storage.deleteProfileData — dessen breiter person/news/term-Match
// würde beim Entfernen EINES Mandanten auch Personen-/News-Rohdaten ANDERER
// Mandanten mitlöschen.
async function teardownTenant(id, deps = {}) {
  const storage = deps.storage || require("./storage");
  const entries = [];
  if (await isProtectedTenant(id, deps)) {
    log(entries, "schutz", "abbruch", `${id} ist ein bestehender/geschützter Mandant — Löschung verweigert.`);
    return { ok: false, aborted: true, reason: "protected-tenant", tenantId: id, log: entries };
  }
  const result = await storage.deleteTenantScopedData(id);
  log(entries, "loeschung", result.ok ? "ok" : "teilweise", `entfernt (strikt eigen): ${JSON.stringify(result.before || {})}`);
  return { ok: Boolean(result.ok), tenantId: id, detail: result, log: entries };
}

// Menschlich lesbares Ergebnisprotokoll.
function formatProtocol(result) {
  const lines = [];
  lines.push(`Mandant: ${result.tenantId}`);
  lines.push(`Ergebnis: ${result.ok ? "ERFOLG" : "ABBRUCH"}${result.reason ? ` (${result.reason})` : ""}`);
  if (result.created) lines.push("Aktion: NEU angelegt");
  if (result.updated) lines.push("Aktion: aktualisiert (idempotent, keine Dublette)");
  // Der gespeicherte Aktivierungszustand gehoert in die Meldung: an ihm haengt, ob das
  // Mandat ueberhaupt an Cron-, Briefing- und Verarbeitungslaeufen teilnimmt.
  if (result.ok && typeof result.profilAktiv === "boolean") {
    lines.push(`Zustand: Profil ${result.profilAktiv ? "AKTIV" : "INAKTIV"}`
      + (result.profilAktiv ? "" : " — nimmt an keinem Lauf teil; Aktivierung ist ein getrennter, freigabepflichtiger Schritt"));
  }
  if (result.errors && result.errors.length) {
    lines.push("Fehler:");
    for (const e of result.errors) lines.push(`  - ${e}`);
  }
  if (result.readiness) {
    lines.push(`Bereitschaft: Briefing=${result.readiness.kannBriefingErhalten} · Matching=${result.readiness.kannMatching} · Quellen=${result.readiness.quellenVersorgt}`);
  }
  if (result.log && result.log.length) {
    lines.push("Protokoll:");
    for (const s of result.log) lines.push(`  [${s.status}] ${s.step}${s.detail ? " — " + s.detail : ""}`);
  }
  return lines.join("\n");
}

module.exports = {
  PROVISIONING_MARKER,
  isProtectedTenant,
  validateSpec,
  buildProfile,
  mergeMitBestand,
  provisionBatch,
  vorschauFuerMandat,
  provisionTenant,
  deactivateTenant,
  activateTenant,
  teardownTenant,
  formatProtocol,
  maskEmail
};
