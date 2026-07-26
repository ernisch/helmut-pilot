"use strict";

// Helmut — Phase-1-Punkt 14B: Generator für das SQL des Berliner ABNAHMEPROFILS + Rückwege.
// =============================================================================================
// REINE CODEGEN. Kein DB-Zugriff, kein Netz, kein Flag. Das erzeugte SQL wird von diesem
// Sprint AUSDRÜCKLICH NICHT ausgeführt — es ist Schritt 5 der freigabepflichtigen
// Aktivierungsreihenfolge (docs/betrieb/berlin-aktivierung.md §9).
//
// WARUM ES DIESE DATEIEN GIBT: Bis 14A war Schritt 5 als einziger der neun Production-Schritte
// nur Prosa („Berliner Abnahmeprofil anlegen (§8, zwei Zeilen)") mit Verweis auf ein
// Provisionierungswerkzeug. Er hatte damit weder Vorbedingung noch Nachbedingung, weder Dry Run
// noch eine eigene Rollback-Datei — während die acht SQL-Schritte um ihn herum alle vier haben.
// Genau dieser Schritt ist aber die zweite der beiden Bedingungen, an denen der Beweislauf
// zuletzt gescheitert ist (§19.5). Punkt 14B macht ihn ausführbar und prüfbar.
//
// Quelle der Wahrheit: lib/helmut/quellenarchitektur/seeds/berlin-profilplan.js
// (`profilschritte()` — Reihenfolge, Vor-/Nachbedingungen, berührte Tabellen).
// Der Seed-Drift-Test hält die committeten Dateien byte-genau an diesen Generator.
//
// AUFBAU (eine Datei je Schritt, eine Transaktion je Datei — Bauform aus 14A/V-1):
//   1 …_abnahmeprofil.sql                  Profil anlegen (zwei Zeilen, eine Transaktion)
//   2 …_abnahmeprofil_rollback_stufe0.sql  deaktivieren  (schnellster Rückweg)
//   3 …_abnahmeprofil_rollback_stufe1.sql  zusätzlich geloescht_at
//   4 …_abnahmeprofil_rollback_stufe2.sql  Zeilen entfernen (nur nach 0/1, nur ohne Anhang)
//
// WAS DIESE DATEIEN NICHT TUN: kein Abrufweg, kein Paketstatus, keine Paketzuordnung, kein
// Flag, kein Crawl, kein DDL. Testgesichert als Zeichenketten-Invariante.

const fs = require("fs");
const path = require("path");
const P = require("../lib/helmut/quellenarchitektur/seeds/berlin-profilplan");

const SEED_DIR = path.join(__dirname, "..", "supabase", "seeds");

function q(v) { return `'${String(v).replace(/'/g, "''")}'`; }
function textArray(werte) { return `array[${werte.map(q).join(", ")}]::text[]`; }

const ID = q(P.PROFIL_ID);
const M = P.PRODUCTION_ZEILEN.mandate_profiles;

// „Lebt" diese Mandatszeile? Genau die Bedingung aus isActivationEligible/isActiveMandate:
// nicht deaktiviert und nicht gelöscht.
const LEBT = "coalesce(mp.aktiv, true) and mp.geloescht_at is null";

// --- Bedingung -> ausführbarer Riegel ----------------------------------------------------------
// Jede Bedingung wird zu einem eigenen `do $$ … $$;`-Block mit `raise exception`. Eine verletzte
// Bedingung bricht die Transaktion ab (fail-closed) statt still 0 Zeilen zu ändern.
function zaehlAbfrage(bedingung) {
  if (bedingung.art === "profilzeile") {
    if (bedingung.modus === "mit_sollnamen") {
      return `select count(*) into ist from public.profiles p where p.id = ${ID} and p.name = ${q(P.PRODUCTION_ZEILEN.profiles.name)};`;
    }
    if (bedingung.modus === "fremder_name") {
      return `select count(*) into ist from public.profiles p where p.id = ${ID} and p.name is distinct from ${q(P.PRODUCTION_ZEILEN.profiles.name)};`;
    }
    return `select count(*) into ist from public.profiles p where p.id = ${ID};`;
  }
  if (bedingung.art === "mandatszeile") {
    const soll = [
      `mp.politische_ebene = ${q(M.politische_ebene)}`,
      `mp.bundesland = ${q(M.bundesland)}`,
      `mp.partei = ${q(M.partei)}`,
      `mp.wahlkreis = ${q(M.wahlkreis)}`,
      `mp.fachpolitische_schwerpunkte = ${textArray(M.fachpolitische_schwerpunkte)}`,
      `mp.regionale_interessen = ${textArray(M.regionale_interessen)}`
    ].join("\n              and ");
    if (bedingung.modus === "sollfelder") {
      return `select count(*) into ist from public.mandate_profiles mp\n          where mp.user_id = ${ID}\n            and ${soll};`;
    }
    if (bedingung.modus === "abweichend") {
      // NULL-sicher: eine Zeile mit NULL-Feldern liefert bei `not (…)` NULL und wuerde sonst
      // weder als passend noch als abweichend gezaehlt — die Vorbedingung waere blind.
      return `select count(*) into ist from public.mandate_profiles mp\n          where mp.user_id = ${ID}\n            and not coalesce(${soll}, false);`;
    }
    if (bedingung.modus === "aktiv") {
      return `select count(*) into ist from public.mandate_profiles mp where mp.user_id = ${ID} and ${LEBT};`;
    }
    if (bedingung.modus === "inaktiv") {
      return `select count(*) into ist from public.mandate_profiles mp where mp.user_id = ${ID} and mp.aktiv = false;`;
    }
    if (bedingung.modus === "geloescht") {
      return `select count(*) into ist from public.mandate_profiles mp where mp.user_id = ${ID} and mp.geloescht_at is not null;`;
    }
    return `select count(*) into ist from public.mandate_profiles mp where mp.user_id = ${ID};`;
  }
  if (bedingung.art === "fremde_landtagsprofile") {
    const land = bedingung.bundesland ? `\n            and lower(coalesce(mp.bundesland, '')) = ${q(bedingung.bundesland)}` : "";
    return `select count(*) into ist from public.mandate_profiles mp\n          where mp.user_id <> ${ID}\n            and mp.politische_ebene = 'landtag'\n            and ${LEBT}${land};`;
  }
  if (bedingung.art === "berechtigtes_berliner_mandat") {
    // Die GESCHÄRFTE V3-Abfrage (Befund P-1): Zeilen zählen genügt nicht — die Identitätsfelder
    // entscheiden, ob validateProfile das Profil brauchbar findet und es überhaupt zählt.
    return [
      "select count(*) into ist from public.mandate_profiles mp",
      "          left join public.profiles p on p.id = mp.user_id",
      "         where mp.politische_ebene = 'landtag'",
      `           and lower(coalesce(mp.bundesland, '')) = ${q(P.BUNDESLAND.toLowerCase())}`,
      `           and ${LEBT}`,
      "           and (coalesce(trim(mp.partei), '') <> '' or coalesce(trim(p.name), '') <> '')",
      "           and (coalesce(trim(mp.wahlkreis), '') <> '' or coalesce(trim(mp.bundesland), '') <> '')",
      "           and (array_length(mp.fachpolitische_schwerpunkte, 1) > 0 or array_length(mp.ausschuesse, 1) > 0);"
    ].join("\n");
  }
  if (bedingung.art === "abhaengige_daten") {
    const teile = bedingung.tabellen
      .map((t) => `           + (select count(*) from public.${t} t where t.user_id = ${ID})`)
      .join("\n");
    return `select 0\n${teile}\n          into ist;`;
  }
  throw new Error("Generator kennt diese Bedingungsart nicht: " + bedingung.art);
}

function bedingungSql(bedingung, rolle) {
  const marke = rolle === "vor" ? "VORBEDINGUNG" : "NACHBEDINGUNG";
  return [
    "do $$",
    "declare ist int;",
    "begin",
    "  " + zaehlAbfrage(bedingung).split("\n").join("\n  "),
    `  if ist not in (${bedingung.erlaubt.join(", ")}) then`,
    `    raise exception '${marke} VERLETZT: ${bedingung.meldung.replace(/'/g, "''")} (ist: %, erlaubt: ${bedingung.erlaubt.join("/")})', ist;`,
    "  end if;",
    "end $$;"
  ].join("\n");
}

function bedingungsblock(bedingungen, rolle, ueberschrift) {
  if (!bedingungen.length) return [];
  const out = [`-- ${ueberschrift}`];
  for (const b of bedingungen) { out.push(bedingungSql(b, rolle)); out.push(""); }
  out.pop();
  return out;
}

// --- Mutationen je Schritt ---------------------------------------------------------------------
// Bewusst ausgeschrieben statt generisch: ein Operator muss lesen können, was passiert.
function mutationSql(schritt) {
  const out = [];
  if (schritt.id === "P") {
    out.push("-- P1) profiles-Zeile: liefert `fullName` (Befund P-2). Ohne sie bliebe der Radar stumm.");
    out.push("--     `do nothing` ist hier sicher, weil die Vorbedingung einen fremden Datensatz");
    out.push("--     unter dieser Id bereits ausgeschlossen hat.");
    out.push("insert into public.profiles (id, name) values");
    out.push(`  (${ID}, ${q(P.PRODUCTION_ZEILEN.profiles.name)})`);
    out.push("on conflict (id) do nothing;");
    out.push("");
    out.push("-- P2) mandate_profiles-Zeile: `politische_ebene='landtag'` + `bundesland='Berlin'`");
    out.push("--     erzeugen die Referenz auf berlin-basis. `partei='Fraktionslos'` bindet das");
    out.push("--     Testmandat an KEIN Parteipaket. Keine E-Mail, kein Klarname, keine reale Person.");
    out.push("insert into public.mandate_profiles");
    out.push("  (user_id, politische_ebene, bundesland, partei, wahlkreis,");
    out.push("   fachpolitische_schwerpunkte, regionale_interessen, aktiv, onboarding_status) values");
    out.push(`  (${ID}, ${q(M.politische_ebene)}, ${q(M.bundesland)}, ${q(M.partei)}, ${q(M.wahlkreis)},`);
    out.push(`   ${textArray(M.fachpolitische_schwerpunkte)}, ${textArray(M.regionale_interessen)}, true, ${q(M.onboarding_status)})`);
    out.push("on conflict (user_id) do nothing;");
    return out;
  }
  if (schritt.id === "P-RB0") {
    out.push("-- Deaktivieren schlägt Löschen: die Zeile bleibt als Auditspur stehen.");
    out.push("update public.mandate_profiles set aktiv = false, updated_at = now()");
    out.push(`  where user_id = ${ID};`);
    return out;
  }
  if (schritt.id === "P-RB1") {
    out.push("-- Zusätzlich als gelöscht markieren: wirkt unabhängig von `aktiv` und von validateProfile.");
    out.push("update public.mandate_profiles");
    out.push("   set aktiv = false, geloescht_at = coalesce(geloescht_at, now()), updated_at = now()");
    out.push(`  where user_id = ${ID};`);
    return out;
  }
  if (schritt.id === "P-RB2") {
    out.push("-- Reihenfolge: Kind vor Eltern. Der zweite `delete` würde die erste Zeile ohnehin per");
    out.push("-- ON DELETE CASCADE mitnehmen — ausgeschrieben, damit die Wirkung sichtbar ist.");
    out.push(`delete from public.mandate_profiles where user_id = ${ID};`);
    out.push(`delete from public.profiles where id = ${ID};`);
    return out;
  }
  throw new Error("Generator kennt diesen Schritt nicht: " + schritt.id);
}

function kopf(titel) {
  return [
    `-- Helmut — ${titel}`,
    "-- Generiert von scripts/generate-berlin-abnahmeprofil-sql.js. NICHT von Hand editieren.",
    "-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14B NICHT ausgeführt.",
    "-- Einordnung: Schritt 5 der Reihenfolge in docs/betrieb/berlin-aktivierung.md §9 — nach"
  ];
}

function buildSchritt(schritt) {
  const alle = P.profilschritte();
  const out = [];
  out.push(...kopf(`Berliner Abnahmeprofil · Schritt ${schritt.nummer} von ${alle.length} · ${schritt.titel}`));
  out.push("-- Block A (Neutralisierung), vor Block B1 (Paketstatus) und vor dem Freigabeflag.");
  out.push("--");
  for (const zeile of schritt.zweck.match(/.{1,92}(\s|$)/g) || [schritt.zweck]) out.push("-- " + zeile.trim());
  out.push("--");
  out.push(`-- Mandats-Id (Testmandat, KEINE reale Person): ${P.PROFIL_ID}`);
  out.push(`-- Berührte Tabellen:                           ${schritt.tabellen.join(", ")}`);
  out.push("-- Berührte Abrufwege / Pakete / Zuordnungen:   keine");
  if (schritt.weiterMit) out.push(`-- Danach: ${schritt.weiterMit}`);
  if (schritt.rollbackDatei) out.push(`-- Rollback dieses Schritts: ${schritt.rollbackDatei}`);
  out.push("--");
  out.push("-- FAIL-CLOSED: jede verletzte Bedingung unten löst `raise exception` aus und rollt diese");
  out.push("-- Transaktion zurück. Diese Datei ist EINZELN auszuführen, niemals gemeinsam mit anderen.");
  out.push("");
  out.push("begin;");
  out.push("");
  const vor = bedingungsblock(schritt.vorbedingungen, "vor", "---- VORBEDINGUNGEN (brechen bei Verletzung ab) ----");
  if (vor.length) { out.push(...vor); out.push(""); }
  out.push("-- ---- MUTATION ----");
  out.push(...mutationSql(schritt));
  out.push("");
  const nach = bedingungsblock(schritt.nachbedingungen, "nach", "---- NACHBEDINGUNGEN (Teilausführung bricht ab) ----");
  if (nach.length) { out.push(...nach); out.push(""); }
  out.push("commit;");
  out.push("notify pgrst, 'reload schema';");
  out.push("");
  return out.join("\n");
}

function dateien() {
  const out = {};
  for (const schritt of P.profilschritte()) out[schritt.datei] = buildSchritt(schritt);
  return out;
}

function writeFiles() {
  fs.mkdirSync(SEED_DIR, { recursive: true });
  const alle = dateien();
  for (const [name, text] of Object.entries(alle)) fs.writeFileSync(path.join(SEED_DIR, name), text);
  console.log(`Abnahmeprofil-SQL geschrieben: ${Object.keys(alle).length} Dateien in supabase/seeds/`);
  for (const schritt of P.profilschritte()) {
    console.log(`  ${schritt.nummer}) ${schritt.datei} — ${schritt.vorbedingungen.length} Vor-, ${schritt.nachbedingungen.length} Nachbedingungen`);
  }
  console.log("AUSGEFÜHRT WURDE NICHTS — die Ausführung ist ein eigener, freigabepflichtiger Schritt.");
}

if (require.main === module) writeFiles();

module.exports = { dateien, buildSchritt, bedingungSql, writeFiles };
