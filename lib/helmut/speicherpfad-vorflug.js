"use strict";

// Helmut — VORFLUG-RIEGEL fuer schreibende Betreiberwerkzeuge.
// =============================================================================
// REINE LOGIK: kein Netz, keine DB, keine Uhr, kein `require` auf storage.js.
// Die Umgebung kommt als Parameter herein, damit jede Konstellation offline
// pruefbar ist. Dieses Modul ist die EINE Wahrheit ueber die wirksame
// crawlRuns-Aufbewahrung — `lib/helmut/storage.js` liest sie von hier.
//
// DER PRODUCTION-BEFUND, DEN DIESES MODUL SCHLIESST (2026-09-04, SR §37):
// Die inaktive Anlage von 20 synthetischen Profilen hat den geteilten Ring
// `helmut_store.main.crawlRuns` von 36 auf 20 Eintraege gekuerzt. Ursache war
// keine Fehlfunktion des Profilpfads, sondern eine STILLE Nebenwirkung des
// gemeinsamen Transportwegs:
//
//   saveProfile -> writeStore("main") -> compactStore -> crawlRuns kappen
//
// `compactStore` laeuft bei JEDEM Schreibvorgang auf die geteilte Zeile `main`
// und kappte `crawlRuns` mit der Aufbewahrung DER AUSFUEHRENDEN UMGEBUNG. In der
// Sitzung fehlte `HELMUT_CRAWL_RUN_RETENTION`, also griff der Code-Vorgabewert 20
// statt der Production-Einstellung 36. Die 16 entfernten Laufzeilen existieren
// nirgends sonst und sind nicht rekonstruierbar (SR §37.4).
//
// ZWEITER BEFUND DESSELBEN LAUFS: `HELMUT_PROFILE_DB_MODE` musste im Prozess
// gesetzt werden, weil `saveProfile` den Blob UNBEDINGT schreibt und die
// relationale Zeile nur BEDINGT. Ohne die Variable waere der Lauf blob-only
// gelaufen und die Nachpruefung haette — aus eben diesem gerade geschriebenen
// Blob lesend — FALSCHES GRUEN gemeldet.
//
// WARUM EINE VERFAHRENSREGEL NICHT GENUEGT: genau eine solche Regel („bitte die
// Variable mitsetzen") hat gefehlt. Der Riegel ist deshalb technisch und
// fail closed — er hat bewusst KEINE Uebergehungsoption.
//
// ARBEITSTEILUNG mit `lib/helmut/production-schreibgate.js`: jenes Modul prueft,
// ob Fachtabellen und Betriebsdaten auf DASSELBE Backend zeigen (Befund
// 2026-07-27). Dieses Modul setzt darauf auf und ergaenzt die beiden Punkte, die
// der Vorfall vom 2026-09-04 offengelegt hat: die wirksame Aufbewahrung und den
// wirksamen Profil-Schreibmodus. Keine Regel wird doppelt gefuehrt.

const SCHREIBGATE = require("./production-schreibgate");

// Das groesste Lesefenster ueber ALLE crawlRuns-Verbraucher im Anwendungscode.
// Alle fuenf Produktiv-Aufrufer uebergeben explizit 20:
//   lib/helmut/scheduler.js:267  (Google-Cooldown aus runSourceCrawl)
//   lib/helmut/scheduler.js:2249 (Google-Cooldown aus der Globalphase)
//   server.js:5071               (Legacy-Gesundheitsbericht -> saveWatchdogState)
//   server.js:6371, server.js:6874
// Eine Aufbewahrung UNTER diesem Wert verkuerzt den Google-Cooldown nicht, sie
// schaltet ihn STILL AB: die Altersgrenzen in `evaluateCooldown` sind eine
// Nachpruefung des bereits ausgewaehlten Eintrags, kein Listenfilter
// (lib/helmut/google-news-hardening.js:397-422). Ein fehlender Eintrag ist dort
// kein "kein Cooldown noetig", sondern "kein Cooldown moeglich".
const CRAWL_RUN_LESEFENSTER = 20;

// Dieselbe Wahrheitsschreibweise wie storage.isFlagOn / production-schreibgate.
function istFlagAn(wert) {
  return ["1", "true", "on", "yes"].includes(String(wert || "").trim().toLowerCase());
}

// Dieselbe Reihenfolge wie storage.supabaseServiceRoleKey().
function serviceRoleKey(env) {
  return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY || "";
}

// Nachbildung von storage.v3StoreReady() — dieselben drei Bedingungen.
function relationalBereit(env) {
  return istFlagAn(env.HELMUT_V3_STORE) && Boolean(env.SUPABASE_URL) && Boolean(serviceRoleKey(env));
}

// Nachbildung von storage.useSupabase().
function blobAufSupabase(env) {
  return String(env.HELMUT_STORAGE_BACKEND || "").trim().toLowerCase() === "supabase"
    && Boolean(env.SUPABASE_URL)
    && Boolean(serviceRoleKey(env));
}

// ── Die wirksame crawlRuns-Aufbewahrung ─────────────────────────────────────
//
// Liefert IMMER einen vollstaendigen Befund — auch im Fehlerfall — damit ein
// Werkzeug genau benennen kann, was an der Umgebung fehlt.
//
// `gueltig: false` heisst nicht "kuerze mit einem Ersatzwert", sondern
// "KUERZE NICHT". Ein Vorgabewert, der Daten loescht, ist kein sicherer
// Vorgabewert.
function crawlRunAufbewahrung(env = process.env) {
  const e = env || {};
  const roh = e.HELMUT_CRAWL_RUN_RETENTION;
  const text = roh === undefined || roh === null ? "" : String(roh).trim();

  if (!text) {
    return Object.freeze({
      variable: "HELMUT_CRAWL_RUN_RETENTION",
      gesetzt: false,
      roh: null,
      gueltig: false,
      wirksam: null,
      lesefenster: CRAWL_RUN_LESEFENSTER,
      grund: "nicht-gesetzt",
      meldung: "HELMUT_CRAWL_RUN_RETENTION ist im Prozess nicht gesetzt. Es wird NICHT gekuerzt "
        + "— der vorgefundene Stand bleibt vollstaendig erhalten. Genau hier ist am 04.09. "
        + "der Ring von 36 auf 20 gefallen (SR §37)."
    });
  }

  const zahl = Number(text);
  if (!Number.isInteger(zahl) || zahl < 1) {
    return Object.freeze({
      variable: "HELMUT_CRAWL_RUN_RETENTION",
      gesetzt: true,
      roh: text.slice(0, 40),
      gueltig: false,
      wirksam: null,
      lesefenster: CRAWL_RUN_LESEFENSTER,
      grund: "ungueltig",
      meldung: `HELMUT_CRAWL_RUN_RETENTION="${text.slice(0, 40)}" ist keine positive ganze Zahl. `
        + "Es wird NICHT gekuerzt."
    });
  }

  if (zahl < CRAWL_RUN_LESEFENSTER) {
    return Object.freeze({
      variable: "HELMUT_CRAWL_RUN_RETENTION",
      gesetzt: true,
      roh: text.slice(0, 40),
      gueltig: false,
      wirksam: null,
      lesefenster: CRAWL_RUN_LESEFENSTER,
      grund: "unter-lesefenster",
      meldung: `HELMUT_CRAWL_RUN_RETENTION=${zahl} liegt UNTER dem groessten Lesefenster `
        + `(${CRAWL_RUN_LESEFENSTER}, listCrawlRuns(20)). Ein solcher Wert wuerde den `
        + "Google-Cooldown still abschalten. Er wird nicht angewendet — es wird NICHT gekuerzt."
    });
  }

  return Object.freeze({
    variable: "HELMUT_CRAWL_RUN_RETENTION",
    gesetzt: true,
    roh: text.slice(0, 40),
    gueltig: true,
    wirksam: zahl,
    lesefenster: CRAWL_RUN_LESEFENSTER,
    grund: "belegt",
    meldung: `HELMUT_CRAWL_RUN_RETENTION=${zahl} ist belegt und liegt auf oder ueber dem `
      + `Lesefenster (${CRAWL_RUN_LESEFENSTER}).`
  });
}

// Die tatsaechlichen ZEILENKENNUNGEN im `helmut_store`. Nachbildung von
// storage.js (`supabaseStoreId`, `authStoreId`): beide sind ueber die Umgebung
// verschiebbar. Ein Bericht, der nur "helmut_store" sagt, nennt die Tabelle,
// aber nicht die Zeile — und genau die Zeile ist hier das Schutzgut.
//
// KORRIGIERT (Betreiberbefund): `verschoben` wurde zuerst allein daraus
// abgeleitet, OB eine der beiden Variablen gesetzt ist. Das war falsch — es hat
// den voellig unveraenderten Zielzustand blockiert, sobald ihn jemand
// AUSDRUECKLICH hinschreibt (`HELMUT_SUPABASE_STORE_ID=main`). Eine ausdrueckliche
// Bestaetigung der Vorgabe ist keine Verschiebung. Verglichen werden deshalb die
// AUFGELOESTEN wirksamen Werte gegen `main`/`main-auth`, nicht die Anwesenheit
// der Variablen.
const VORGABE_BLOBZEILE = "main";
const VORGABE_AUTHZEILE = "main-auth";

function zeilenkennungen(env = process.env) {
  const e = env || {};
  // Dieselbe Aufloesung wie storage.js: leerer/ungesetzter Wert faellt auf die
  // Vorgabe zurueck, die Auth-Zeile haengt an der Blob-Zeile.
  const blobRoh = e.HELMUT_SUPABASE_STORE_ID;
  const authRoh = e.HELMUT_SUPABASE_AUTH_STORE_ID;
  const blob = blobRoh || VORGABE_BLOBZEILE;
  const auth = authRoh || `${blob}-auth`;
  const blobAbweichend = blob !== VORGABE_BLOBZEILE;
  const authAbweichend = auth !== VORGABE_AUTHZEILE;
  return Object.freeze({
    blob,
    auth,
    blobAbweichend,
    authAbweichend,
    // Nur eine TATSAECHLICHE Abweichung gilt als Verschiebung.
    verschoben: blobAbweichend || authAbweichend,
    // Rein informativ fuer den Bericht: stand der Wert ausdruecklich da oder kam
    // er aus der Vorgabe? Das aendert die Bewertung NICHT.
    ausdruecklichGesetzt: Object.freeze({
      blob: Boolean(blobRoh),
      auth: Boolean(authRoh)
    }),
    vorgabe: Object.freeze({ blob: VORGABE_BLOBZEILE, auth: VORGABE_AUTHZEILE })
  });
}

// ── Das ausgewiesene Schreibziel ────────────────────────────────────────────
//
// SR §37.5 (4): Das Werkzeug muss VOR dem scharfen Vorgang sagen, WOHIN es
// schreibt. Bis 2026-09-04 stand davon nichts in der Ausgabe.
function speicherziel(env = process.env) {
  const e = env || {};
  const zeilen = zeilenkennungen(e);
  const blobSupabase = blobAufSupabase(e);
  const v3 = relationalBereit(e);
  const dbModusFlag = istFlagAn(e.HELMUT_PROFILE_DB_MODE);
  const dbModusWirksam = dbModusFlag && v3;
  const exklusivFlag = istFlagAn(e.HELMUT_PROFILE_DB_EXCLUSIVE);
  const exklusivWirksam = dbModusWirksam && exklusivFlag;
  return Object.freeze({
    blobBackend: blobSupabase ? "supabase:helmut_store" : "lokale-dateien:.helmut-data",
    blobSchreibmodus: exklusivWirksam
      ? "kein Blob-Write (Exklusivmodus)"
      : `Blob-Write auf ${blobSupabase ? "supabase:helmut_store" : "lokale-dateien:.helmut-data"}`,
    relationalerSchreibmodus: exklusivWirksam
      ? "mandate_profiles (relational-only, kein Blob-Write)"
      : (dbModusWirksam
        ? "mandate_profiles + helmut_store (Dual Write)"
        : "helmut_store (Blob-only)"),
    profileDbModeFlagGesetzt: dbModusFlag,
    profileDbModeWirksam: dbModusWirksam,
    profileDbExclusiveFlagGesetzt: exklusivFlag,
    profileDbExclusiveWirksam: exklusivWirksam,
    v3StoreBereit: v3,
    zeilenkennungen: zeilen,
    crawlRunAufbewahrung: crawlRunAufbewahrung(e)
  });
}

// ── Der Riegel ──────────────────────────────────────────────────────────────
//
// `verlangeProfilSchreibpfad`: nur Werkzeuge, die tatsaechlich Profile
// schreiben, muessen einen wirksamen relationalen Schreibpfad nachweisen. Ein
// reines Blob-Werkzeug (etwa der Blob-Aufraeumer) darf das nicht muessen.
function pruefeSpeicherpfad({
  env = process.env,
  zweck = "Production-Schreiblauf",
  verlangeProfilSchreibpfad = true
} = {}) {
  const e = env || {};
  const ziel = speicherziel(e);
  const gate = SCHREIBGATE.pruefeSchreibgate(e, { zweck });
  const befunde = [];

  // 1 · Die Aufbewahrung muss belegt sein. Fehlt sie, kuerzt zwar seit SR §37
  //     nichts mehr — aber der Betreiber laeuft dann OHNE die Production-Grenze,
  //     und das darf ein scharfer Lauf nicht stillschweigend tun.
  befunde.push(Object.freeze({
    name: "crawlRuns-Aufbewahrung belegt und nicht unter dem Lesefenster",
    ok: ziel.crawlRunAufbewahrung.gueltig === true,
    grund: ziel.crawlRunAufbewahrung.grund,
    detail: ziel.crawlRunAufbewahrung.meldung
  }));

  // 2 · Speicher- und Telemetrieziel muessen dasselbe Backend sein. Diese Regel
  //     wird NICHT hier gefuehrt, sondern aus dem bestehenden Schreibgate
  //     uebernommen — eine zweite Wahrheit waere genau der Fehler, den dieser
  //     Sprint beseitigt.
  befunde.push(Object.freeze({
    name: "Blob und Fachtabellen zeigen auf dasselbe Backend",
    ok: gate.ok === true,
    grund: gate.ok ? "belegt" : (gate.widerspruch ? "widerspruch" : "unvollstaendig"),
    detail: gate.ok
      ? `Blob: ${ziel.blobBackend}; Fachtabellen relational bereit: ${ziel.v3StoreBereit}.`
      : `Fehlende oder widerspruechliche Variablen: ${gate.fehlendeVariablen.join(", ")}.`
  }));

  // 2b · Die Zeilenkennungen muessen auf der Vorgabe stehen.
  //      Sonst zielt der Lauf auf eine ANDERE geteilte Zeile als die, auf die
  //      alle Erhebungs- und Kontrollabfragen der Kohortenwerkzeuge schauen
  //      (`scripts/testkohorte-495.js` fuehrt `main-auth` als Literal). Eine
  //      verschobene Zeile hiesse: schreiben nach A, kontrollieren gegen B.
  befunde.push(Object.freeze({
    name: "Zeilenkennungen stehen auf der Vorgabe (main / main-auth)",
    ok: ziel.zeilenkennungen.verschoben === false,
    grund: ziel.zeilenkennungen.verschoben ? "verschoben" : "vorgabe",
    detail: ziel.zeilenkennungen.verschoben
      ? `Die WIRKSAMEN Zeilenkennungen sind "${ziel.zeilenkennungen.blob}" / `
        + `"${ziel.zeilenkennungen.auth}" statt "${VORGABE_BLOBZEILE}" / "${VORGABE_AUTHZEILE}". `
        + "Die Erhebungs-SQL der Kohortenwerkzeuge liest weiterhin main/main-auth — geschrieben "
        + "und kontrolliert wuerde dann NICHT dieselbe Zeile."
      : `Geschrieben und kontrolliert wird dieselbe Zeile (${ziel.zeilenkennungen.blob} / `
        + `${ziel.zeilenkennungen.auth}). Ein ausdruecklich auf die Vorgabe gesetzter Wert `
        + "zaehlt als unveraendert, nicht als Verschiebung."
  }));

  // 3 · Der Profil-Schreibmodus muss ausdruecklich wirksam sein. Ein fehlender
  //     Wert fuehrt sonst zu einem STILLEN Blob-only-Ergebnis, das die
  //     Nachpruefung aus eben diesem Blob als Erfolg zurueckliest.
  if (verlangeProfilSchreibpfad) {
    befunde.push(Object.freeze({
      name: "Profil-Schreibmodus ist ausdruecklich gesetzt (kein stilles Blob-only)",
      ok: ziel.profileDbModeFlagGesetzt === true,
      grund: ziel.profileDbModeFlagGesetzt ? "belegt" : "nicht-gesetzt",
      detail: ziel.profileDbModeFlagGesetzt
        ? "HELMUT_PROFILE_DB_MODE ist gesetzt."
        : "HELMUT_PROFILE_DB_MODE fehlt. saveProfile schriebe dann NUR den geteilten Blob; "
          + "die Nachpruefung laese aus eben diesem Blob und meldete falsches Gruen."
    }));
    befunde.push(Object.freeze({
      name: "Profil-Schreibmodus ist auch WIRKSAM (v3StoreReady)",
      ok: ziel.profileDbModeWirksam === true,
      grund: ziel.profileDbModeWirksam ? "belegt" : "unwirksam",
      detail: ziel.profileDbModeWirksam
        ? `Wirksam: ${ziel.relationalerSchreibmodus}.`
        : (ziel.profileDbModeFlagGesetzt
          ? "HELMUT_PROFILE_DB_MODE ist gesetzt, aber UNWIRKSAM (HELMUT_V3_STORE, SUPABASE_URL "
            + "oder Service-Role-Schluessel fehlt). Das Ergebnis waere still Blob-only."
          : "HELMUT_PROFILE_DB_MODE ist nicht gesetzt, also auch nicht wirksam. Das Ergebnis "
            + "waere still Blob-only.")
    }));
  }

  const offen = befunde.filter((b) => !b.ok);
  const sicher = offen.length === 0;

  const zeilen = [];
  zeilen.push(`=== Speicherziel des Laufs (${zweck}) ===`);
  zeilen.push(`  Blob-Backend            : ${ziel.blobBackend}`);
  zeilen.push(`  Geteilte Zeile          : ${ziel.zeilenkennungen.blob}`
    + ` · Kontenzeile: ${ziel.zeilenkennungen.auth}`
    + `${ziel.zeilenkennungen.verschoben
      ? "  ← VERSCHOBEN gegenüber der Vorgabe (main/main-auth)"
      : "  (Vorgabe)"}`);
  zeilen.push(`  Blob-Schreibmodus       : ${ziel.blobSchreibmodus}`);
  zeilen.push(`  Relationaler Schreibmodus: ${ziel.relationalerSchreibmodus}`);
  zeilen.push(`  HELMUT_PROFILE_DB_MODE  : ${ziel.profileDbModeFlagGesetzt ? "gesetzt" : "NICHT gesetzt"}`
    + ` (wirksam: ${ziel.profileDbModeWirksam})`);
  zeilen.push(`  HELMUT_PROFILE_DB_EXCLUSIVE: ${ziel.profileDbExclusiveFlagGesetzt ? "gesetzt" : "nicht gesetzt"}`
    + ` (wirksam: ${ziel.profileDbExclusiveWirksam})`);
  zeilen.push(`  crawlRuns-Aufbewahrung  : ${ziel.crawlRunAufbewahrung.gueltig
    ? `${ziel.crawlRunAufbewahrung.wirksam} (Lesefenster ${CRAWL_RUN_LESEFENSTER})`
    : `NICHT BELEGT (${ziel.crawlRunAufbewahrung.grund}) — Lesefenster ${CRAWL_RUN_LESEFENSTER}`}`);

  if (!sicher) {
    zeilen.push("");
    zeilen.push(`ABBRUCH: ${zweck} — die Prozessumgebung traegt nicht jeden erforderlichen Wert.`);
    for (const b of offen) zeilen.push(`  * ${b.name}\n      ${b.detail}`);
    zeilen.push("");
    zeilen.push("Diese Werte muessen in der Prozessumgebung stehen, BEVOR der Lauf beginnt:");
    // KORRIGIERT (Betreiberbefund): Hier stand "(Production: 36)". Diese Zahl ist
    // eine Betreiberangabe, die aus dem Code NICHT belegbar ist — der Bericht sagt
    // das an anderer Stelle selbst. Eine Meldung, die eine unbestaetigte Zahl als
    // aktuellen Production-Wert ausgibt, laedt genau zum falschen Nachsetzen ein.
    // Verlangt wird jetzt der fuer DIESEN Vorgang geprueft freigegebene Wert.
    zeilen.push("  HELMUT_CRAWL_RUN_RETENTION — mit dem fuer diesen konkreten Production-Vorgang");
    zeilen.push("    ausdruecklich geprueften und freigegebenen Wert (kein Vorgabewert, keine");
    zeilen.push("    aus der Doku uebernommene Zahl; er muss >= " + CRAWL_RUN_LESEFENSTER + " sein)");
    zeilen.push("  HELMUT_PROFILE_DB_MODE");
    zeilen.push("  HELMUT_V3_STORE=1 · HELMUT_STORAGE_BACKEND=supabase · SUPABASE_URL · Service-Role-Schluessel");
    zeilen.push("In einer Claude-Code-Cloud-Sitzung ausschliesslich ueber die Environment-Einstellungen");
    zeilen.push("setzen — nie im Chat, nie im Commit (CLAUDE.md §4.9). Jede Umgebungsvariable eines");
    zeilen.push("Production-Laufs ist freigabepflichtig, auch wenn sie nur im Prozess gesetzt wird.");
    zeilen.push("Es gibt bewusst KEINE Option, diesen Riegel zu uebergehen. Trockenlaeufe sind nicht betroffen.");
  }

  return Object.freeze({
    werkzeug: "speicherpfad-vorflug",
    zweck,
    sicher,
    speicherziel: ziel,
    befunde: Object.freeze(befunde),
    offen: Object.freeze(offen.map((b) => b.name)),
    meldung: zeilen.join("\n")
  });
}

// Fuer die AUSFUEHRER (lib/helmut/testkohorte-*.js): dort steht der Riegel an
// der einzig richtigen Stelle — nachdem feststeht, dass der Lauf WIRKLICH scharf
// ist (Freigabe UND Startfenster UND Vorstufe), und VOR dem ersten
// Schreibvorgang. Ein Lauf, der ohnehin auf den Trockenlauf zurueckfaellt,
// schreibt nichts und braucht deshalb keine belegte Speicherumgebung; er soll
// weiterhin seinen eigenen, genaueren Grund melden ("freigabe-fehlt",
// "startfenster-nicht-geprueft", …) statt hier abgeschnitten zu werden.
//
// Wirft mit `grund: "speicherpfad-unsicher"`, damit die CLIs daraus Exitcode 2
// machen koennen (Umgebungsfehler), nicht Exitcode 1 (fachlicher Fehlschlag).
// Bewusst kein `process.exit` in diesem Modul: reine Logik bleibt testbar.
function erzwingeSpeicherpfadOderWirf({ env = process.env, zweck, verlangeProfilSchreibpfad = true } = {}) {
  const befund = pruefeSpeicherpfad({ env, zweck, verlangeProfilSchreibpfad });
  if (befund.sicher) return befund;
  const fehler = new Error(befund.meldung);
  fehler.grund = "speicherpfad-unsicher";
  fehler.befund = befund;
  throw fehler;
}

module.exports = {
  CRAWL_RUN_LESEFENSTER,
  zeilenkennungen,
  erzwingeSpeicherpfadOderWirf,
  crawlRunAufbewahrung,
  speicherziel,
  pruefeSpeicherpfad,
  istFlagAn
};
