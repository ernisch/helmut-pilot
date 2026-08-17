"use strict";

// Helmut — NEUTRALISIERUNG der inerten Altauftraege der Warteschlange (OP-30).
// =============================================================================================
// WAS DIESER BAUSTEIN IST:
//
//   Die EINE Quelle des Neutralisierungs-SQL fuer die 524 inerten Altauftraege aus dem
//   zweiten OP-30-Aktivierungsversuch (Runbook §19; Vorbild ist das am 2026-08-12 bewiesene
//   und ausgefuehrte Muster §17.8/§17.10). App, Betreiber-CLI, Runbook und Nachweissuite
//   benutzen DENSELBEN Generator — es gibt keine zweite, abweichende Fassung des Ablaufs.
//
//   Der Baustein selbst verbindet sich NIRGENDWOHIN: er baut ausschliesslich SQL-Text und
//   prueft Vertraege. Ausfuehrung ist Betreiberaktion (CLAUDE.md §5) ueber psql oder den
//   dokumentierten MCP-Weg; gegen Production erst nach ausdruecklicher Freigabe.
//
// WARUM LOESCHEN (unveraendert §17.8): `fehlgeschlagen` wuerde als endgueltiger Fehler
// gezaehlt oder von der Wiedervorlage zurueckgeholt; `first_due_at` ist unveraenderlich;
// ein erfundener „pausiert"-Status waere eine neue Statusart ohne Not. Die Arbeit geht
// nicht verloren: der Planer erzeugt beim naechsten Lauf fensterfrische Auftraege mit
// denselben Idempotenzschluesseln (Zielarchitektur §13 — „kein Datenverlust").
//
// DIE SICHERHEITSRIEGEL (jeder einzelne bricht die GESAMTE Transaktion ab):
//   R1  exakte Statusverteilung (wartend/erledigt/laeuft/fehlgeschlagen/gesamt)
//   R2  keine offene Lease auf einer nicht erledigten Zeile
//   R3  exakte Gesamtsignatur md5(id|status|typ|versuche) ueber ALLE Zeilen
//   R4  exakte ID-Ketten-md5 der Zielmenge (die Loeschung trifft GENAU diese Zeilen)
//   R5  exakte Signatur der erledigten Zeilen — VOR und NACH der Loeschung identisch
//   R6  keine wartende Zeile ausserhalb der Zeitgrenze (eine neue Zeile blockiert)
//   R7  exakte Typverteilung der Zielmenge
//   R8  Loeschanzahl == Erwartung (get diagnostics, nach dem Delete, in der Transaktion)
//   R9  Nachzustand in der Transaktion == Erwartung (0 offen, erledigt unveraendert)
//   R10 SERIALIZABLE + FOR-UPDATE-Sperre: eine konkurrierende Aenderung zwischen Vor-
//       pruefung und Commit endet als Abbruch, nie als Teilzustand
//   R11 TROCKENLAUF IST DER STANDARD und endet BAUARTBEDINGT im Rollback: er schliesst mit
//       `raise exception 'TROCKENLAUF-OK…'` — ein Commit ist in diesem Modus unmoeglich
//
// WIEDERHOLBARKEIT: nach erfolgreicher scharfer Ausfuehrung findet ein zweiter Lauf
// 0 wartende Zeilen, erkennt den bereits neutralisierten Zustand an der Erledigt-Signatur
// und bricht mit `ABBRUCH-BEREITS-NEUTRALISIERT` ab — ohne jede Aenderung.
//
// RUECKWEG: Schritt-1-Export (alle Spalten, mit Pruefsumme) + `wiederherstellungSql`
// (identisch zum 31-PASS-bewiesenen §17.8 Schritt R, nur mit der neuen Erwartung).
//
// DATENSPARSAMKEIT: Signaturen und Quittung tragen ausschliesslich technische Kennungen,
// Zaehlwerte, Zeitstempel und Pruefsummen — keine Nutzdaten, keine politischen Inhalte.

// ── Der Production-Vertrag (Teil-A-Befund 2026-08-17, rein lesend erhoben) ───────────────────
// Jeder Wert ist eine EINGABE aus der Vorpruefung, keine Selbstauskunft: ein Skript, das
// seine eigene Erwartung nachrechnet, prueft nichts (bewiesene Regel aus §17.8 Schritt 0).
const PRODUCTION_VERTRAG = Object.freeze({
  beleg: "docs/betrieb/op30-aktivierung-5-mandate.md §26 (Teil A, 2026-08-17)",
  // Zeitgrenze STRIKT NACH dem juengsten Zielauftrag (2026-08-13 16:07:05 UTC) und vor jeder
  // moeglichen neuen Arbeit (Flag ist seit der Ruecknahme 16:27 UTC aus). Ein spaeter
  // erzeugter Auftrag faellt NIE in die Zielmenge — und laesst R1/R3/R6 abbrechen.
  grenze: "2026-08-13 16:30:00+00",
  wartend: 524,
  erledigt: 235,
  laeuft: 0,
  fehlgeschlagen: 0,
  gesamt: 759,
  signaturGesamt: "a069f91fde4547493796395f2c989497",
  idKettenMd5Wartend: "59af8c9e9e61631f30fc9e968c14de7c",
  signaturErledigt: "f7989b8cc2828acb99f26148a405999f",
  nachTyp: Object.freeze({
    source_fetch: 365,
    document_understanding: 139,
    mandate_projection: 10,
    briefing_materialization: 10
  })
});

const MD5_MUSTER = /^[0-9a-f]{32}$/;
const GRENZE_MUSTER = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\+00$/;

// FAIL CLOSED: ein unvollstaendiger oder verformter Vertrag erzeugt KEIN SQL. Lieber ein
// harter Fehler beim Bauen als eine Loeschung mit halber Erwartung.
function pruefeVertrag(vertrag) {
  const v = vertrag || {};
  const zahlen = ["wartend", "erledigt", "laeuft", "fehlgeschlagen", "gesamt"];
  for (const feld of zahlen) {
    if (!Number.isInteger(v[feld]) || v[feld] < 0) {
      throw new Error(`Neutralisierungsvertrag unvollstaendig: ${feld} muss eine ganze Zahl >= 0 sein`);
    }
  }
  if (v.wartend + v.erledigt + v.laeuft + v.fehlgeschlagen !== v.gesamt) {
    throw new Error("Neutralisierungsvertrag widerspruechlich: Statusverteilung ergibt nicht gesamt");
  }
  if (v.wartend < 1) {
    throw new Error("Neutralisierungsvertrag ohne Zielmenge: wartend muss >= 1 sein");
  }
  for (const feld of ["signaturGesamt", "idKettenMd5Wartend", "signaturErledigt"]) {
    if (!MD5_MUSTER.test(String(v[feld] || ""))) {
      throw new Error(`Neutralisierungsvertrag unvollstaendig: ${feld} muss eine md5-Pruefsumme sein`);
    }
  }
  if (!GRENZE_MUSTER.test(String(v.grenze || ""))) {
    throw new Error("Neutralisierungsvertrag unvollstaendig: grenze muss 'JJJJ-MM-TT hh:mm:ss+00' sein");
  }
  const typen = v.nachTyp && typeof v.nachTyp === "object" ? v.nachTyp : null;
  if (!typen || !Object.keys(typen).length) {
    throw new Error("Neutralisierungsvertrag unvollstaendig: nachTyp fehlt");
  }
  const typSumme = Object.values(typen).reduce((a, b) => a + Number(b), 0);
  if (typSumme !== v.wartend) {
    throw new Error(`Neutralisierungsvertrag widerspruechlich: Typverteilung ${typSumme} != wartend ${v.wartend}`);
  }
  return v;
}

// Die Signaturformel — WOERTLICH die aus Runbook §24.7, mit der die Production-Anker
// erhoben wurden. `where_klausel` schraenkt optional auf eine Teilmenge ein.
function signaturAusdruck(whereKlausel = "") {
  return `(select coalesce(md5(string_agg(id||'|'||status||'|'||job_type||'|'||attempts, ',' order by id)), 'leer')
     from public.helmut_jobs${whereKlausel ? ` where ${whereKlausel}` : ""})`;
}

function zielmengeWhere(vertrag) {
  return `status = 'wartend' and created_at < timestamptz '${vertrag.grenze}'`;
}

// ── Schritt 0: Vorpruefung (rein lesend, ausserhalb jeder Transaktion) ───────────────────────
function vorpruefungSql(vertrag = PRODUCTION_VERTRAG) {
  const v = pruefeVertrag(vertrag);
  return `-- OP-30-Neutralisierung · Schritt 0: Vorpruefung (REIN LESEND, keine Aenderung)
-- Erwartung laut ${v.beleg}. Jede Abweichung: ANHALTEN und neu bewerten.
select
  count(*) filter (where status = 'wartend')                                   as wartend,          -- erwartet ${v.wartend}
  count(*) filter (where status = 'erledigt')                                  as erledigt,         -- erwartet ${v.erledigt}
  count(*) filter (where status = 'laeuft')                                    as laeuft,           -- erwartet ${v.laeuft}
  count(*) filter (where status = 'fehlgeschlagen')                            as fehlgeschlagen,   -- erwartet ${v.fehlgeschlagen}
  count(*)                                                                     as gesamt,           -- erwartet ${v.gesamt}
  count(*) filter (where status <> 'erledigt' and lease_owner is not null)     as offene_leases,    -- erwartet 0
  ${signaturAusdruck()}                                                        as signatur_gesamt,  -- erwartet ${v.signaturGesamt}
  (select coalesce(md5(string_agg(id::text, ',' order by id)), 'leer')
     from public.helmut_jobs where ${zielmengeWhere(v)})                       as id_kette_zielmenge, -- erwartet ${v.idKettenMd5Wartend}
  ${signaturAusdruck("status = 'erledigt'")}                                   as signatur_erledigt, -- erwartet ${v.signaturErledigt}
  count(*) filter (where status = 'wartend'
                     and created_at >= timestamptz '${v.grenze}')              as wartend_ausserhalb_grenze -- erwartet 0
from public.helmut_jobs;`;
}

// ── Schritt 1: Export = Rueckweg (rein lesend; Datei speichern, Pruefsumme notieren) ─────────
function exportSql(vertrag = PRODUCTION_VERTRAG) {
  const v = pruefeVertrag(vertrag);
  return `-- OP-30-Neutralisierung · Schritt 1: vollstaendiger Export der Zielmenge (REIN LESEND).
-- to_jsonb(j) nimmt ALLE Spalten mit, auch NULL-Felder. Ergebnis in EINE Datei speichern,
-- md5 der Datei notieren (Laufquittung) — der Export ist der Rueckweg (Schritt R).
select coalesce(jsonb_agg(to_jsonb(j) order by j.id), '[]'::jsonb)
  from public.helmut_jobs j
 where ${zielmengeWhere(v)};`;
}

// ── Schritt 2: Neutralisieren — EINE Transaktion, Standard ist der Trockenlauf ───────────────
// Alle Riegel R1–R9 werden INNERHALB der Transaktion geprueft, unmittelbar vor und nach der
// einen Aenderung; die Zielzeilen sind ab der ersten Pruefung mit FOR UPDATE gesperrt und die
// Transaktion laeuft SERIALIZABLE — eine konkurrierende Statusaenderung endet als
// Serialisierungsfehler oder Signaturabbruch, nie als Teilzustand (R10).
function neutralisierungSql(vertrag = PRODUCTION_VERTRAG, { modus = "trockenlauf" } = {}) {
  const v = pruefeVertrag(vertrag);
  if (modus !== "trockenlauf" && modus !== "scharf") {
    throw new Error(`Unbekannter Modus '${modus}' — erlaubt sind 'trockenlauf' (Standard) und 'scharf'`);
  }
  const scharf = modus === "scharf";
  const typPruefung = Object.entries(v.nachTyp).map(([typ, n]) => `
  if (select count(*) from ziel where job_type = '${typ}') <> ${Number(n)} then
    raise exception 'ABBRUCH R7: Typverteilung der Zielmenge weicht ab (%: % statt ${Number(n)}) — nichts veraendert',
      '${typ}', (select count(*) from ziel where job_type = '${typ}');
  end if;`).join("");

  return `-- OP-30-Neutralisierung · Schritt 2 · MODUS: ${scharf ? "SCHARF (loescht bei Erfolg)" : "TROCKENLAUF (Standard — endet IMMER im Rollback)"}
-- Erwartung laut ${v.beleg}. Vorher Schritt 0 + 1 ausfuehren (Export = Rueckweg).
begin isolation level serializable;
create temporary table neutralisierung_quittung (quittung jsonb) on commit drop;
do $neutralisierung$
declare
  v_wartend        bigint;
  v_erledigt       bigint;
  v_laeuft         bigint;
  v_fehlgeschlagen bigint;
  v_gesamt         bigint;
  v_leases         bigint;
  v_ausserhalb     bigint;
  v_signatur       text;
  v_id_kette       text;
  v_erledigt_sig   text;
  v_geloescht      bigint;
  v_quittung       jsonb;
begin
  -- Zielzeilen SOFORT sperren (R10): ab hier kann kein Verbraucher sie beanspruchen.
  create temporary table ziel on commit drop as
    select id, job_type from public.helmut_jobs
     where ${zielmengeWhere(v)}
     for update;

  -- R1: exakte Statusverteilung — jede neue Zeile, jede Statusaenderung bricht ab.
  select count(*) filter (where status = 'wartend'),
         count(*) filter (where status = 'erledigt'),
         count(*) filter (where status = 'laeuft'),
         count(*) filter (where status = 'fehlgeschlagen'),
         count(*)
    into v_wartend, v_erledigt, v_laeuft, v_fehlgeschlagen, v_gesamt
    from public.helmut_jobs;
  if v_wartend = 0 and v_laeuft = 0 and v_fehlgeschlagen = 0
     and v_erledigt = ${v.erledigt}
     and ${signaturAusdruck("status = 'erledigt'")} = '${v.signaturErledigt}' then
    raise exception 'ABBRUCH-BEREITS-NEUTRALISIERT: 0 wartende Zeilen, die ${v.erledigt} erledigten sind unveraendert — keine Aenderung noetig, keine ausgefuehrt';
  end if;
  if v_wartend <> ${v.wartend} or v_erledigt <> ${v.erledigt} or v_laeuft <> ${v.laeuft}
     or v_fehlgeschlagen <> ${v.fehlgeschlagen} or v_gesamt <> ${v.gesamt} then
    raise exception 'ABBRUCH R1: Statusverteilung %/%/%/% (gesamt %) statt ${v.wartend}/${v.erledigt}/${v.laeuft}/${v.fehlgeschlagen} (gesamt ${v.gesamt}) — nichts veraendert',
      v_wartend, v_erledigt, v_laeuft, v_fehlgeschlagen, v_gesamt;
  end if;

  -- R2: keine offene Lease (eine Reservierung heisst: jemand arbeitet — dann NIE loeschen).
  select count(*) into v_leases from public.helmut_jobs
   where status <> 'erledigt' and lease_owner is not null;
  if v_leases <> 0 then
    raise exception 'ABBRUCH R2: % offene Lease(s) — nichts veraendert', v_leases;
  end if;

  -- R6: keine wartende Zeile ausserhalb der Zeitgrenze (eine NEUE Zeile blockiert).
  select count(*) into v_ausserhalb from public.helmut_jobs
   where status = 'wartend' and created_at >= timestamptz '${v.grenze}';
  if v_ausserhalb <> 0 then
    raise exception 'ABBRUCH R6: % wartende Zeile(n) neuer als die Grenze ${v.grenze} — nichts veraendert', v_ausserhalb;
  end if;

  -- R3/R4/R5: harte Anker — Gesamtsignatur, ID-Kette der Zielmenge, Erledigt-Signatur.
  v_signatur := ${signaturAusdruck()};
  if v_signatur <> '${v.signaturGesamt}' then
    raise exception 'ABBRUCH R3: Gesamtsignatur % statt ${v.signaturGesamt} — nichts veraendert', v_signatur;
  end if;
  select coalesce(md5(string_agg(id::text, ',' order by id)), 'leer') into v_id_kette from ziel;
  if v_id_kette <> '${v.idKettenMd5Wartend}' then
    raise exception 'ABBRUCH R4: ID-Kette der Zielmenge % statt ${v.idKettenMd5Wartend} — nichts veraendert', v_id_kette;
  end if;
  v_erledigt_sig := ${signaturAusdruck("status = 'erledigt'")};
  if v_erledigt_sig <> '${v.signaturErledigt}' then
    raise exception 'ABBRUCH R5: Erledigt-Signatur % statt ${v.signaturErledigt} — nichts veraendert', v_erledigt_sig;
  end if;

  -- R7: exakte Typverteilung der Zielmenge.${typPruefung}

  -- DIE EINE AENDERUNG: ausschliesslich die gesperrten Zielzeilen, ueber ihre IDs.
  delete from public.helmut_jobs j using ziel z where j.id = z.id;
  get diagnostics v_geloescht = row_count;
  if v_geloescht <> ${v.wartend} then
    raise exception 'ABBRUCH R8: % Zeilen geloescht, erwartet ${v.wartend} — Transaktion zurueckgenommen', v_geloescht;
  end if;

  -- R9: Nachzustand NOCH IN DER TRANSAKTION — die ${v.erledigt} erledigten sind unveraendert.
  select count(*) filter (where status in ('wartend','laeuft')), count(*)
    into v_wartend, v_gesamt from public.helmut_jobs;
  if v_wartend <> 0 or v_gesamt <> ${v.erledigt} then
    raise exception 'ABBRUCH R9: Nachzustand %/% statt 0/${v.erledigt} — Transaktion zurueckgenommen', v_wartend, v_gesamt;
  end if;
  if ${signaturAusdruck("status = 'erledigt'")} <> '${v.signaturErledigt}' then
    raise exception 'ABBRUCH R9: Erledigt-Signatur nach der Loeschung veraendert — Transaktion zurueckgenommen';
  end if;

  -- LAUFQUITTUNG (nur technische Kennungen, Zaehlwerte, Zeit, Pruefsummen — keine Nutzdaten).
  v_quittung := jsonb_build_object(
    'verfahren', 'op30-neutralisierung-524',
    'modus', '${modus}',
    'zeitpunkt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'geloescht', v_geloescht,
    'grenze', '${v.grenze}',
    'signatur_gesamt_vorher', '${v.signaturGesamt}',
    'id_kette_zielmenge', v_id_kette,
    'signatur_erledigt_vorher_nachher', v_erledigt_sig,
    'nachzustand', jsonb_build_object('wartend', 0, 'erledigt', ${v.erledigt}, 'laeuft', 0, 'fehlgeschlagen', 0),
    'ergebnis', ${scharf ? "'neutralisiert'" : "'trockenlauf-ok'"});
  insert into neutralisierung_quittung values (v_quittung);
  raise notice 'QUITTUNG %', v_quittung::text;
${scharf ? "" : `
  -- TROCKENLAUF-RIEGEL (R11): dieser Abbruch ist KEIN Fehlerfall, sondern die Garantie,
  -- dass der Standardmodus niemals committen kann. Alle Riegel oben sind durchlaufen.
  raise exception 'TROCKENLAUF-OK: alle Riegel bestanden, % Zeilen WAEREN geloescht worden — Transaktion vollstaendig zurueckgenommen. Quittung: %',
    v_geloescht, v_quittung::text;`}
end
$neutralisierung$;
select quittung from neutralisierung_quittung;
${scharf ? `commit;
-- Gegenprobe NACH dem Commit (rein lesend):
select count(*) filter (where status in ('wartend','laeuft')) as offen,          -- erwartet 0
       count(*)                                               as gesamt,         -- erwartet ${v.erledigt}
       ${signaturAusdruck("status = 'erledigt'")}             as signatur_erledigt -- erwartet ${v.signaturErledigt}
  from public.helmut_jobs;` : `rollback; -- Sicherheitsnetz: der Trockenlauf ist durch R11 bereits abgebrochen`}`;
}

// ── Schritt R: Wiederherstellung aus dem Export (der bewiesene §17.8-Rueckweg) ───────────────
// Identisch zum 31-PASS-belegten Muster (jobqueue-ruecknahme-datenbank-test.js), nur die
// Erwartung ist die neue Zielmenge. `exakt` = Variante B (byte-gleich, Trigger in der
// Transaktion aus). Der Export kommt als psql-Variable :'export' herein.
function wiederherstellungSql(vertrag = PRODUCTION_VERTRAG, { exakt = false } = {}) {
  const v = pruefeVertrag(vertrag);
  return `-- OP-30-Neutralisierung · Schritt R: Wiederherstellung (nur falls noetig; Vorbedingungen §17.8 R-a…R-d)
begin;
create temporary table wh_export (daten jsonb) on commit drop;
insert into wh_export values (:'export'::jsonb);
create temporary view wh_zeilen as
  select * from jsonb_populate_recordset(null::public.helmut_jobs, (select daten from wh_export));
${exakt ? "alter table public.helmut_jobs disable trigger helmut_jobs_kappen_trg;" : ""}
do $wh$
declare
  v_erwartet   bigint := ${v.wartend};
  v_im_export  bigint;
  v_konflikte  bigint;
  v_eingefuegt bigint;
  v_abweichend bigint;
begin
  select count(*) into v_im_export from wh_zeilen;
  if v_im_export <> v_erwartet then
    raise exception 'ABBRUCH: Export enthaelt % Zeilen, erwartet % — nichts eingefuegt',
      v_im_export, v_erwartet;
  end if;

  select count(*) into v_konflikte
    from wh_zeilen e
    join public.helmut_jobs j
      on j.id = e.id or j.idempotency_key = e.idempotency_key;
  if v_konflikte > 0 then
    raise exception 'ABBRUCH: % vorhandene Zeile(n) kollidieren mit dem Export — nichts eingefuegt',
      v_konflikte;
  end if;

  insert into public.helmut_jobs select * from wh_zeilen;
  get diagnostics v_eingefuegt = row_count;
  if v_eingefuegt <> v_erwartet then
    raise exception 'ABBRUCH: % Zeilen eingefuegt, erwartet % — Transaktion zurueckgenommen',
      v_eingefuegt, v_erwartet;
  end if;

  select count(*) into v_abweichend
    from wh_zeilen e
    join public.helmut_jobs j on j.id = e.id
   where ${exakt ? "to_jsonb(j) is distinct from to_jsonb(e)"
                 : "(to_jsonb(j) - 'updated_at') is distinct from (to_jsonb(e) - 'updated_at')"};
  if v_abweichend > 0 then
    raise exception 'ABBRUCH: % wiederhergestellte Zeile(n) weichen vom Export ab', v_abweichend;
  end if;
end
$wh$;
${exakt ? "alter table public.helmut_jobs enable trigger helmut_jobs_kappen_trg;" : ""}
commit;`;
}

module.exports = {
  PRODUCTION_VERTRAG,
  pruefeVertrag,
  signaturAusdruck,
  zielmengeWhere,
  vorpruefungSql,
  exportSql,
  neutralisierungSql,
  wiederherstellungSql
};
