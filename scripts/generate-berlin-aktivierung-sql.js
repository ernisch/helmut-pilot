"use strict";

// Helmut — Phase-1-Punkt 14/14A: Generator für das Berliner AKTIVIERUNGS-SQL + Rollback.
// =============================================================================================
// REINE CODEGEN. Kein DB-Zugriff, kein Netz, kein Flag. Das erzeugte SQL wird von diesem
// Sprint AUSDRÜCKLICH NICHT ausgeführt — es ist der freigabepflichtige Production-Schritt.
//
// Quelle der Wahrheit: lib/helmut/quellenarchitektur/seeds/berlin-aktivierung.js
// (`ausfuehrungsschritte()` — Reihenfolge, Vor-/Nachbedingungen, berührte Wege).
// Der Seed-Drift-Test hält die committeten Dateien byte-genau an diesen Generator.
//
// AUFBAU (Befund V-1 behoben, 2026-07-26): JE SCHRITT EINE DATEI, JE DATEI EINE TRANSAKTION.
//   1 …_a_neutralisierung.sql    Block A — 3 Partei-/Fraktions-/Personenwege umhängen (P0-2)
//   2 …_b1_paketstatus.sql       Block B1 — berlin-basis prepared -> active
//   3 …_b2_stufe1.sql            Stufe 1 — die 2 Direktfeeds
//   4 …_b2_stufe2.sql            Stufe 2 — die 2 Google-News-Wege (nur nach BELEGTER Stufe 1)
//   5 …_b2_stufe1_rollback.sql   Rollback NUR Stufe 1 (Stufe 2 bleibt gesperrt)
//   6 …_b2_stufe2_rollback.sql   Rollback NUR Stufe 2 (Stufe 1 läuft weiter)
//   7 …_rollback.sql             Rollback ALLE Stufen (Block B), Block A bleibt
//   8 …_rollback_vollstaendig.sql Rollback Block B UND Block A (Ausgangszustand 2026-07-26)
//
// Die frühere Sammeldatei `20260726_berlin_aktivierung.sql` bleibt als FAIL-CLOSED
// STOP-DATEI erhalten: sie mutiert nichts mehr, sondern bricht mit `raise exception` ab und
// nennt die Einzelschritte. Wer einer älteren Anleitung folgt, aktiviert damit nichts.
//
// STAFFELUNG IST STRUKTURELL, NICHT REDAKTIONELL:
//   - Stufe 1 und Stufe 2 liegen in getrennten Dateien und getrennten Transaktionen.
//   - Stufe 1 verlangt, dass Stufe 2 noch VOLLSTÄNDIG gesperrt ist (Reihenfolge).
//   - Stufe 2 verlangt Stufe 1 vollständig aktiv UND je Weg >= 2 erfolgreiche Crawl-Läufe in
//     `source_crawl_telemetry` — zwei Dateien direkt hintereinander auszuführen genügt nicht.
//   - Jede verletzte Bedingung endet in `raise exception`, also fail-closed mit Rollback der
//     eigenen Transaktion. Kein stilles „0 Zeilen betroffen", das wie Erfolg aussieht.
//   - Jede Datei prüft nach der Mutation ihre eigene Nachbedingung; eine Teilausführung
//     (z. B. nur 1 von 2 Wegen getroffen) bricht ab.
//
// BRANDENBURG: kein Statement dieser Dateien nennt eine rp-bb-*-Id oder ein
// brandenburg-*-Paket. Der Test prüft das als Zeichenketten-Invariante.

const fs = require("fs");
const path = require("path");
const B = require("../lib/helmut/quellenarchitektur/seeds/berlin-aktivierung");

const SEED_DIR = path.join(__dirname, "..", "supabase", "seeds");

function q(v) { return `'${String(v).replace(/'/g, "''")}'`; }
function idListe(ids) { return ids.map(q).join(", "); }

function kopf(titel) {
  return [
    `-- Helmut — ${titel}`,
    "-- Generiert von scripts/generate-berlin-aktivierung-sql.js. NICHT von Hand editieren.",
    "-- FREIGABEPFLICHTIG: mutiert Production-Daten. In Phase-1-Punkt 14/14A NICHT ausgeführt.",
    "-- Voraussetzungen (docs/betrieb/berlin-aktivierung.md §3): " + B.VORAUSSETZUNGEN.map((v) => v.id).join(" · ")
  ];
}

// --- Bedingung -> ausführbarer Riegel ---------------------------------------------------------
// Jede Bedingung wird zu einem eigenen `do $$ … $$;`-Block. `raise exception` bricht die
// laufende Transaktion ab — dadurch ist eine verletzte Bedingung fail-closed und sichtbar,
// nicht ein stilles No-Op.
function bedingungSql(bedingung, rolle) {
  const marke = rolle === "vor" ? "VORBEDINGUNG" : "NACHBEDINGUNG";
  const out = [];
  if (bedingung.art === "zuordnung") {
    out.push("do $$");
    out.push("declare ist int;");
    out.push("begin");
    out.push("  select count(*) into ist from public.package_paths");
    out.push(`   where package_id = ${q(bedingung.paket)} and retrieval_path_id in (${idListe(bedingung.wege)});`);
    out.push(`  if ist not in (${bedingung.erlaubt.join(", ")}) then`);
    out.push(`    raise exception '${marke} VERLETZT: ${bedingung.meldung.replace(/'/g, "''")} (ist: %, erlaubt: ${bedingung.erlaubt.join("/")})', ist;`);
    out.push("  end if;");
    out.push("end $$;");
    return out.join("\n");
  }
  if (bedingung.art === "paketstatus") {
    out.push("do $$");
    out.push("declare ist text;");
    out.push("begin");
    out.push(`  select status into ist from public.source_packages where key = ${q(bedingung.key)};`);
    out.push(`  if ist is null or ist not in (${bedingung.erlaubt.map(q).join(", ")}) then`);
    out.push(`    raise exception '${marke} VERLETZT: ${bedingung.meldung.replace(/'/g, "''")} (ist: %, erlaubt: ${bedingung.erlaubt.join("/")})', coalesce(ist, '<Paket fehlt>');`);
    out.push("  end if;");
    out.push("end $$;");
    return out.join("\n");
  }
  if (bedingung.art === "wegzustand") {
    out.push("do $$");
    out.push("declare ist int;");
    out.push("begin");
    out.push("  select count(*) into ist from public.retrieval_paths");
    out.push(`   where id in (${idListe(bedingung.wege)})`);
    out.push(`     and status = ${q(bedingung.status)} and activation_mode = ${q(bedingung.activation_mode)};`);
    out.push(`  if ist not in (${bedingung.erlaubt.join(", ")}) then`);
    out.push(`    raise exception '${marke} VERLETZT: ${bedingung.meldung.replace(/'/g, "''")} (${bedingung.status}/${bedingung.activation_mode} ist: %, erlaubt: ${bedingung.erlaubt.join("/")})', ist;`);
    out.push("  end if;");
    out.push("end $$;");
    return out.join("\n");
  }
  if (bedingung.art === "telemetriebeleg") {
    out.push("do $$");
    out.push("declare fehlend text;");
    out.push("begin");
    out.push("  select string_agg(x.quelle || '=' || x.laeufe, ', ' order by x.quelle) into fehlend from (");
    out.push(`    select s.quelle, (select count(distinct t.run_id) from public.source_crawl_telemetry t`);
    out.push(`             where t.source_id = s.quelle and t.status = ${q(bedingung.status)}) as laeufe`);
    out.push(`      from (values ${bedingung.quellen.map((s) => `(${q(s)})`).join(", ")}) as s(quelle)`);
    out.push(`  ) x where x.laeufe < ${bedingung.minLaeufeJeQuelle};`);
    out.push("  if fehlend is not null then");
    out.push(`    raise exception '${marke} VERLETZT: ${bedingung.meldung.replace(/'/g, "''")} (Laeufe je Quelle: %)', fehlend;`);
    out.push("  end if;");
    out.push("end $$;");
    return out.join("\n");
  }
  throw new Error("Generator kennt diese Bedingungsart nicht: " + bedingung.art);
}

function bedingungsblock(bedingungen, rolle, ueberschrift) {
  if (!bedingungen.length) return [];
  const out = [`-- ${ueberschrift}`];
  for (const b of bedingungen) { out.push(bedingungSql(b, rolle)); out.push(""); }
  out.pop();
  return out;
}

// --- Mutationen je Schritt -------------------------------------------------------------------
// Bewusst ausgeschrieben statt generisch: die vier Formen sind fest, und ein Operator muss
// lesen können, was passiert. Die Ids kommen ausschliesslich aus dem Schritt.
function mutationSql(schritt) {
  const out = [];
  if (schritt.id === "A") {
    out.push("-- A1) Zielzuordnung anlegen (idempotent).");
    out.push("insert into public.package_paths (package_id, retrieval_path_id) values");
    out.push(B.UMHAENGUNG.wege.map((w) => `  (${q(B.UMHAENGUNG.nach)}, ${q(w)})`).join(",\n"));
    out.push("on conflict (package_id, retrieval_path_id) do nothing;");
    out.push("");
    out.push("-- A2) Alte Zuordnung am Pflicht-Basispaket entfernen (eng begrenzt auf diese 3 Wege).");
    out.push(`delete from public.package_paths where package_id = ${q(B.UMHAENGUNG.von)}`);
    out.push(`  and retrieval_path_id in (${idListe(B.UMHAENGUNG.wege)});`);
    return out;
  }
  if (schritt.id === "B1") {
    out.push("-- Paketstatus: prepared -> active. Erst dadurch zählt die Referenz eines");
    out.push("-- Berliner Landtagsprofils (computeGlobalActivation).");
    out.push(`update public.source_packages set status = 'active' where key = ${q(B.BASISPAKET_KEY)} and status = 'prepared';`);
    return out;
  }
  if (schritt.id === "S1" || schritt.id === "S2") {
    out.push(`-- Genau ${schritt.wegeBeruehrt.length} Wege dieser Stufe scharfschalten. Kein Weg einer anderen Stufe`);
    out.push("-- wird hier genannt — die Trennung ist die Datei, nicht ein Kommentar.");
    out.push("update public.retrieval_paths set status = 'healthy', activation_mode = 'auto'");
    out.push(`  where id in (${idListe(schritt.wegeBeruehrt)})`);
    out.push("    and status = 'needs_review' and activation_mode = 'manual';");
    return out;
  }
  if (schritt.id === "S1-RB" || schritt.id === "S2-RB") {
    out.push(`-- Setzt AUSSCHLIESSLICH die ${schritt.wegeBeruehrt.length} Wege dieser Stufe zurück.`);
    out.push("update public.retrieval_paths set status = 'needs_review', activation_mode = 'manual'");
    out.push(`  where id in (${idListe(schritt.wegeBeruehrt)});`);
    return out;
  }
  if (schritt.id === "RB-ALLE" || schritt.id === "RB-VOLL") {
    out.push(`-- Setzt ALLE ${schritt.wegeBeruehrt.length} Wege des Berliner Basispakets zurück, nicht nur das aktuelle`);
    out.push("-- Aktivierungsset — sonst bliebe ein von einer früheren Fassung aktivierter Weg stehen.");
    out.push("update public.retrieval_paths set status = 'needs_review', activation_mode = 'manual'");
    out.push(`  where id in (${idListe(schritt.wegeBeruehrt)});`);
    out.push(`update public.source_packages set status = 'prepared' where key = ${q(B.BASISPAKET_KEY)};`);
    if (schritt.id === "RB-VOLL") {
      out.push("-- Block A rückwärts (stellt den Befund A-3 wieder her):");
      out.push("insert into public.package_paths (package_id, retrieval_path_id) values");
      out.push(B.UMHAENGUNG.wege.map((w) => `  (${q(B.UMHAENGUNG.von)}, ${q(w)})`).join(",\n"));
      out.push("on conflict (package_id, retrieval_path_id) do nothing;");
      out.push(`delete from public.package_paths where package_id = ${q(B.UMHAENGUNG.nach)}`);
      out.push(`  and retrieval_path_id in (${idListe(B.UMHAENGUNG.wege)});`);
    }
    return out;
  }
  throw new Error("Generator kennt diesen Schritt nicht: " + schritt.id);
}

function buildSchritt(schritt) {
  const out = [];
  out.push(...kopf(`Berlin-Aktivierung · Schritt ${schritt.nummer} von 8 · ${schritt.titel}`));
  out.push("--");
  for (const zeile of schritt.zweck.match(/.{1,92}(\s|$)/g) || [schritt.zweck]) out.push("-- " + zeile.trim());
  out.push("--");
  out.push(`-- Berührte Abrufwege (retrieval_paths):       ${schritt.wegeBeruehrt.length ? schritt.wegeBeruehrt.join(", ") : "keine"}`);
  out.push(`-- Berührte Paketzuordnung (package_paths):    ${schritt.zuordnungBeruehrt.length ? schritt.zuordnungBeruehrt.join(", ") : "keine"}`);
  out.push(`-- Berührter Paketstatus (source_packages):    ${schritt.paketBeruehrt.length ? schritt.paketBeruehrt.join(", ") : "keiner"}`);
  if (schritt.weiterMit) {
    out.push(`-- Danach: ${schritt.weiterMit}`
      + (schritt.weiterErst && schritt.weiterErst !== "—" ? ` — aber erst ${schritt.weiterErst}` : ""));
  }
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

// Die frühere Sammeldatei: mutiert nichts mehr und bricht ab. So wird aus dem V-1-Risiko
// („Block B am Stück ausführen schaltet alle 4 Wege scharf") ein fail-closed Hinweis.
function buildStop() {
  const schritte = B.ausfuehrungsschritte();
  const out = [];
  out.push(...kopf("Berlin-Aktivierung · STILLGELEGTE SAMMELDATEI (führt NICHTS aus)"));
  out.push("--");
  out.push("-- Diese Datei enthielt bis 2026-07-26 Block A, B1, Stufe 1 und Stufe 2 — Block B sogar in");
  out.push("-- EINER Transaktion. Wer sie am Stück ausführte, schaltete alle 4 Berliner Wege auf einmal");
  out.push("-- scharf, inklusive der beiden Google-News-Wege, die bewusst einen vollen Crawl-Zyklus");
  out.push("-- später kommen sollten (Befund V-1). Die Staffelung bestand nur aus einer Kommentarzeile.");
  out.push("--");
  out.push("-- Sie mutiert jetzt NICHTS und bricht ab. Die Ausführung läuft über 8 Einzeldateien:");
  for (const s of schritte) out.push(`--   ${s.nummer}) ${s.datei}`);
  out.push("");
  out.push("do $$");
  out.push("begin");
  out.push("  raise exception 'STILLGELEGT: diese Sammeldatei aktiviert nichts mehr (Befund V-1). "
    + "Einzelschritte in der Reihenfolge %, %, %, % ausfuehren — Stufe 2 erst nach belegter Stufe 1.',");
  out.push(`    ${q(schritte[0].datei)}, ${q(schritte[1].datei)}, ${q(schritte[2].datei)}, ${q(schritte[3].datei)};`);
  out.push("end $$;");
  out.push("");
  return out.join("\n");
}

function dateien() {
  const out = { [B.DATEI_STOP]: buildStop() };
  for (const schritt of B.ausfuehrungsschritte()) out[schritt.datei] = buildSchritt(schritt);
  return out;
}

function writeFiles() {
  fs.mkdirSync(SEED_DIR, { recursive: true });
  const alle = dateien();
  for (const [name, text] of Object.entries(alle)) fs.writeFileSync(path.join(SEED_DIR, name), text);
  const l = B.lastprognose();
  const st = B.staffelungspruefung();
  console.log(`Aktivierungs-SQL geschrieben: ${Object.keys(alle).length} Dateien in supabase/seeds/`);
  console.log(`Stufe 1 (${st.stufe1.length}): ${st.stufe1.join(", ")}`);
  console.log(`Stufe 2 (${st.stufe2.length}): ${st.stufe2.join(", ")}`);
  console.log(`Wege im Aktivierungsset: ${l.wegeProLauf} · Abrufe je Lauf: ${l.abrufeProLaufMin}–${l.abrufeProLaufMax}`);
  console.log("AUSGEFÜHRT WURDE NICHTS — die Ausführung ist ein eigener, freigabepflichtiger Schritt.");
}

if (require.main === module) writeFiles();

module.exports = { dateien, buildSchritt, buildStop, bedingungSql, writeFiles };
