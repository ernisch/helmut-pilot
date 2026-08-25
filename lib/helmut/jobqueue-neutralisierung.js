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
// RUECKWEG = DETERMINISTISCHE NEUERZEUGUNG, KEIN EXPORT (Datenschutzkorrektur 2026-08-17/2).
//   Eine fruehere Fassung dieses Moduls bot einen Vollzeilenexport (`to_jsonb`) als Rueckweg
//   an — der haette payload, tenant_id, idempotency_key und last_error und damit politische
//   bzw. personenbeziehbare Inhalte aus Production in eine Datei geschrieben. Das war ein
//   Verstoss gegen den eigenen Vertrag („nur technische Werte und Pruefsummen") und ist
//   ENTFERNT. Der Rueckweg ist stattdessen FUNKTIONAL: die Zielmenge ist belegt inert und
//   fensterveraltet; der Planer erzeugt beim naechsten regulaeren Lauf exakt die dann
//   benoetigte Arbeit deterministisch neu (gleiche Schluesselbildung; Zielarchitektur §13 —
//   „kein Datenverlust durch Neutralisierung"). Das ist AUSDRUECKLICH KEIN byte-identischer
//   Restore: created_at/attempts/Fehlertexte der geloeschten Zeilen sind danach weg — und
//   genau das ist gewollt, denn ein byte-identischer Ruecktransport wuerde die drei
//   §17.7-Fallen (Doppelverarbeitung, 48-h-Frist, sofortige Ueberalterung) wiederherstellen,
//   die die Neutralisierung beseitigt. Ein byte-identischer Restore ist deshalb nicht
//   erforderlich; eine serverseitige Sicherungstabelle samt Migration braucht es nicht.
//
// DATENSPARSAMKEIT (harter Vertrag, testgesichert): das erzeugte SQL liest die sensiblen
// Spalten payload, tenant_id, idempotency_key, last_error NIRGENDS — auch nicht gefiltert
// oder gehasht; Signaturen und Quittung tragen ausschliesslich Zaehlwerte, Zeitstempel und
// md5-Pruefsummen ueber id|status|job_type|attempts. Nichts davon verlaesst Production.

// Die sensiblen Spalten der Tabelle — im erzeugten SQL vollstaendig verboten.
const SENSIBLE_SPALTEN = Object.freeze(["payload", "tenant_id", "idempotency_key", "last_error"]);
// Konstrukte, die ganze Zeilen nach aussen tragen koennten — ebenfalls verboten.
const VOLLZEILEN_MUSTER = Object.freeze(["to_jsonb", "jsonb_agg", "row_to_json", "json_agg", "select *"]);

// Selbstpruefung JEDES erzeugten SQL-Texts. FAIL CLOSED: ein Text, der eine sensible Spalte
// oder ein Vollzeilenkonstrukt enthaelt, wird nie herausgegeben — eine kuenftige
// Wiedereinfuehrung des Exports scheitert hier (und zusaetzlich in der Nachweissuite) sofort.
function pruefeDatensparsamkeit(sqlText) {
  const t = String(sqlText || "").toLowerCase();
  for (const spalte of SENSIBLE_SPALTEN) {
    if (t.includes(spalte)) {
      throw new Error(`Datensparsamkeitsverstoss: erzeugtes SQL referenziert die sensible Spalte '${spalte}'`);
    }
  }
  for (const muster of VOLLZEILEN_MUSTER) {
    if (t.includes(muster)) {
      throw new Error(`Datensparsamkeitsverstoss: erzeugtes SQL enthaelt das Vollzeilenkonstrukt '${muster}'`);
    }
  }
  return sqlText;
}

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
  return pruefeDatensparsamkeit(`-- OP-30-Neutralisierung · Schritt 0: Vorpruefung (REIN LESEND, keine Aenderung)
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
from public.helmut_jobs;`);
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

  return pruefeDatensparsamkeit(`-- OP-30-Neutralisierung · Schritt 2 · MODUS: ${scharf ? "SCHARF (loescht bei Erfolg)" : "TROCKENLAUF (Standard — endet IMMER im Rollback)"}
-- Erwartung laut ${v.beleg}. Vorher Schritt 0 (Vorpruefung) ausfuehren. KEIN Export:
-- der Rueckweg ist die deterministische Neuerzeugung durch den Planer (Runbook §26.2).
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
  from public.helmut_jobs;` : `rollback; -- Sicherheitsnetz: der Trockenlauf ist durch R11 bereits abgebrochen`}`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// GEMISCHTE ZIELMENGE (OP-30 Sprint 2026-08-19): 383 inerte Auftraege des ERSTEN
// Stufe-1-Aktivierungslaufs — 301 `wartend` PLUS 82 `laeuft` mit ABGELAUFENER Lease.
// ═════════════════════════════════════════════════════════════════════════════════════════════
// WARUM EIN EIGENES VERFAHREN: das obige (§26) unterstuetzt die gemischte Zielmenge
// NACHWEISLICH NICHT — `zielmengeWhere` trifft nur `wartend`, R2 bricht bei JEDER nicht
// erledigten Zeile mit `lease_owner` ab (eine `laeuft`-Zeile traegt ihn per CHECK-Constraint
// zwingend), und R9 verlangt 0 `laeuft` im Nachzustand. Es ist fail closed (kein Teilzustand
// moeglich), aber fuer diese Zielmenge unbrauchbar; die Nachweissuite belegt den Abbruch.
//
// WAS SICH GEGENUEBER §26 AENDERT (und NUR das):
//   * Zielmenge = (`wartend` ODER `laeuft` mit `lease_expires_at <= now()`), jeweils
//     strikt VOR der Zeitgrenze. Eine `laeuft`-Zeile mit AKTIVER Lease bricht ab (R2a) —
//     dort arbeitet jemand, geloescht wird dann NIE.
//   * R2 wird zweiteilig: (a) 0 aktive Leases im gesamten Bestand, (b) JEDE `laeuft`-Zeile
//     gehoert zur Zielmenge — eine laeuft-Zeile ausserhalb (aktive Lease ODER neuer als die
//     Grenze) bricht ab.
//   * NEUER RIEGEL R12 (Outbox): die Zahl der Outbox-Absichten der Zielmenge wird VOR der
//     Loeschung gegen den Vertrag geprueft und NACH der Loeschung muss sie 0 sein — die
//     `on delete cascade`-Kopplung (Migration 20260813) wird damit BEWIESEN, nicht
//     angenommen. Es bleibt keine zur Zielmenge gehoerende Outbox-Restarbeit zurueck.
//   * R9 prueft den Nachzustand auf 0 `wartend` UND 0 `laeuft`.
// Alles Uebrige (Serializable + FOR UPDATE, Trockenlauf-Standard mit bauartbedingtem
// Rollback, Datensparsamkeit, Wiederholbarkeit, funktionaler Rueckweg) ist UNVERAENDERT.

// Anker rein lesend erhoben am 2026-08-19 ~09:12 UTC (12:12 tuerkischer Zeit, 11:12 Berlin);
// Beleg: Runbook §28. Die Grenze liegt strikt NACH der juengsten Zielzeile (05:56:54 UTC)
// und NACH der Ruecknahme (06:56 UTC); seither sind belegt 0 Auftraege entstanden/geaendert.
const PRODUCTION_VERTRAG_GEMISCHT = Object.freeze({
  beleg: "docs/betrieb/op30-aktivierung-5-mandate.md §28 (erhoben 2026-08-19)",
  grenze: "2026-08-19 07:00:00+00",
  wartend: 301,
  erledigt: 235,
  laeuft: 82,
  fehlgeschlagen: 0,
  gesamt: 618,
  zielmenge: 383,
  outboxZielmenge: 383,
  signaturGesamt: "3fd4565a65cdea28a52bde279d6dd69c",
  idKettenMd5Zielmenge: "3b709747630e28d5b7eaae8a36e24939",
  signaturErledigt: "f7989b8cc2828acb99f26148a405999f",
  nachTyp: Object.freeze({
    source_fetch: 361,
    document_understanding: 2,
    mandate_projection: 10,
    briefing_materialization: 10
  })
});

// FAIL CLOSED wie `pruefeVertrag` — zusaetzlich muss die Zielmenge exakt wartend + laeuft
// sein: dieses Verfahren ist NUR fuer den Fall gebaut, dass der GESAMTE offene Bestand
// inert ist. Ein Bestand mit aktiven Anteilen braucht eine neue Betreiberentscheidung.
function pruefeGemischtVertrag(vertrag) {
  const v = vertrag || {};
  const zahlen = ["wartend", "erledigt", "laeuft", "fehlgeschlagen", "gesamt", "zielmenge", "outboxZielmenge"];
  for (const feld of zahlen) {
    if (!Number.isInteger(v[feld]) || v[feld] < 0) {
      throw new Error(`Gemischter Neutralisierungsvertrag unvollstaendig: ${feld} muss eine ganze Zahl >= 0 sein`);
    }
  }
  if (v.wartend + v.erledigt + v.laeuft + v.fehlgeschlagen !== v.gesamt) {
    throw new Error("Gemischter Neutralisierungsvertrag widerspruechlich: Statusverteilung ergibt nicht gesamt");
  }
  if (v.zielmenge !== v.wartend + v.laeuft) {
    throw new Error("Gemischter Neutralisierungsvertrag widerspruechlich: zielmenge muss wartend + laeuft sein");
  }
  if (v.zielmenge < 1) {
    throw new Error("Gemischter Neutralisierungsvertrag ohne Zielmenge: zielmenge muss >= 1 sein");
  }
  for (const feld of ["signaturGesamt", "idKettenMd5Zielmenge", "signaturErledigt"]) {
    if (!MD5_MUSTER.test(String(v[feld] || ""))) {
      throw new Error(`Gemischter Neutralisierungsvertrag unvollstaendig: ${feld} muss eine md5-Pruefsumme sein`);
    }
  }
  if (!GRENZE_MUSTER.test(String(v.grenze || ""))) {
    throw new Error("Gemischter Neutralisierungsvertrag unvollstaendig: grenze muss 'JJJJ-MM-TT hh:mm:ss+00' sein");
  }
  const typen = v.nachTyp && typeof v.nachTyp === "object" ? v.nachTyp : null;
  if (!typen || !Object.keys(typen).length) {
    throw new Error("Gemischter Neutralisierungsvertrag unvollstaendig: nachTyp fehlt");
  }
  const typSumme = Object.values(typen).reduce((a, b) => a + Number(b), 0);
  if (typSumme !== v.zielmenge) {
    throw new Error(`Gemischter Neutralisierungsvertrag widerspruechlich: Typverteilung ${typSumme} != zielmenge ${v.zielmenge}`);
  }
  return v;
}

// Optionaler Alias, damit dieselbe eine Zielmengen-Definition auch in korrelierten
// Unterabfragen (Outbox-Riegel) verwendet wird — es gibt keine zweite Formulierung.
function zielmengeGemischtWhere(vertrag, alias = "") {
  const p = alias ? `${alias}.` : "";
  return `${p}created_at < timestamptz '${vertrag.grenze}'`
    + ` and (${p}status = 'wartend' or (${p}status = 'laeuft' and ${p}lease_expires_at <= now()))`;
}

// ── Schritt 0 (gemischt): Vorpruefung — rein lesend, ausserhalb jeder Transaktion ────────────
function vorpruefungGemischtSql(vertrag = PRODUCTION_VERTRAG_GEMISCHT) {
  const v = pruefeGemischtVertrag(vertrag);
  return pruefeDatensparsamkeit(`-- OP-30-Neutralisierung (GEMISCHTE Zielmenge) · Schritt 0: Vorpruefung (REIN LESEND)
-- Erwartung laut ${v.beleg}. Jede Abweichung: ANHALTEN und neu bewerten.
select
  count(*) filter (where status = 'wartend')                                   as wartend,          -- erwartet ${v.wartend}
  count(*) filter (where status = 'erledigt')                                  as erledigt,         -- erwartet ${v.erledigt}
  count(*) filter (where status = 'laeuft')                                    as laeuft,           -- erwartet ${v.laeuft}
  count(*) filter (where status = 'fehlgeschlagen')                            as fehlgeschlagen,   -- erwartet ${v.fehlgeschlagen}
  count(*)                                                                     as gesamt,           -- erwartet ${v.gesamt}
  count(*) filter (where status <> 'erledigt' and lease_expires_at > now())    as aktive_leases,    -- erwartet 0
  (select count(*) from public.helmut_jobs where ${zielmengeGemischtWhere(v)}) as zielmenge,        -- erwartet ${v.zielmenge}
  ${signaturAusdruck()}                                                        as signatur_gesamt,  -- erwartet ${v.signaturGesamt}
  (select coalesce(md5(string_agg(id::text, ',' order by id)), 'leer')
     from public.helmut_jobs where ${zielmengeGemischtWhere(v)})               as id_kette_zielmenge, -- erwartet ${v.idKettenMd5Zielmenge}
  ${signaturAusdruck("status = 'erledigt'")}                                   as signatur_erledigt, -- erwartet ${v.signaturErledigt}
  count(*) filter (where status in ('wartend','laeuft')
                     and created_at >= timestamptz '${v.grenze}')              as offene_ausserhalb_grenze, -- erwartet 0
  (select count(*) from public.helmut_job_outbox o
    where exists (select 1 from public.helmut_jobs j
                   where j.id = o.job_id and ${zielmengeGemischtWhere(v, "j")})) as outbox_zielmenge -- erwartet ${v.outboxZielmenge}
from public.helmut_jobs;`);
}

// ── Schritt 2 (gemischt): EINE Transaktion, Standard ist der Trockenlauf ─────────────────────
function neutralisierungGemischtSql(vertrag = PRODUCTION_VERTRAG_GEMISCHT, { modus = "trockenlauf" } = {}) {
  const v = pruefeGemischtVertrag(vertrag);
  if (modus !== "trockenlauf" && modus !== "scharf") {
    throw new Error(`Unbekannter Modus '${modus}' — erlaubt sind 'trockenlauf' (Standard) und 'scharf'`);
  }
  const scharf = modus === "scharf";
  const typPruefung = Object.entries(v.nachTyp).map(([typ, n]) => `
  if (select count(*) from ziel where job_type = '${typ}') <> ${Number(n)} then
    raise exception 'ABBRUCH R7: Typverteilung der Zielmenge weicht ab (%: % statt ${Number(n)}) — nichts veraendert',
      '${typ}', (select count(*) from ziel where job_type = '${typ}');
  end if;`).join("");

  return pruefeDatensparsamkeit(`-- OP-30-Neutralisierung (GEMISCHTE Zielmenge: wartend + laeuft mit abgelaufener Lease)
-- Schritt 2 · MODUS: ${scharf ? "SCHARF (loescht bei Erfolg)" : "TROCKENLAUF (Standard — endet IMMER im Rollback)"}
-- Erwartung laut ${v.beleg}. Vorher Schritt 0 (Vorpruefung) ausfuehren. KEIN Export:
-- der Rueckweg ist die deterministische Neuerzeugung durch den Planer (Runbook §26.2/§28).
begin isolation level serializable;
create temporary table neutralisierung_quittung (quittung jsonb) on commit drop;
do $neutralisierung$
declare
  v_wartend        bigint;
  v_erledigt       bigint;
  v_laeuft         bigint;
  v_fehlgeschlagen bigint;
  v_gesamt         bigint;
  v_aktive_leases  bigint;
  v_laeuft_fremd   bigint;
  v_ausserhalb     bigint;
  v_signatur       text;
  v_id_kette       text;
  v_erledigt_sig   text;
  v_outbox_vorher  bigint;
  v_outbox_nachher bigint;
  v_geloescht      bigint;
  v_quittung       jsonb;
begin
  -- Zielzeilen SOFORT sperren (R10): ab hier kann kein Verbraucher sie beanspruchen. Die
  -- Lease-Bedingung ist Teil der Sperrmenge — eine Zeile, deren Lease zwischen Vorpruefung
  -- und jetzt wieder aktiv wurde, faellt heraus und laesst R1/R4 abbrechen.
  create temporary table ziel on commit drop as
    select id, job_type from public.helmut_jobs
     where ${zielmengeGemischtWhere(v)}
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
    raise exception 'ABBRUCH-BEREITS-NEUTRALISIERT: 0 offene Zeilen, die ${v.erledigt} erledigten sind unveraendert — keine Aenderung noetig, keine ausgefuehrt';
  end if;
  if v_wartend <> ${v.wartend} or v_erledigt <> ${v.erledigt} or v_laeuft <> ${v.laeuft}
     or v_fehlgeschlagen <> ${v.fehlgeschlagen} or v_gesamt <> ${v.gesamt} then
    raise exception 'ABBRUCH R1: Statusverteilung %/%/%/% (gesamt %) statt ${v.wartend}/${v.erledigt}/${v.laeuft}/${v.fehlgeschlagen} (gesamt ${v.gesamt}) — nichts veraendert',
      v_wartend, v_erledigt, v_laeuft, v_fehlgeschlagen, v_gesamt;
  end if;

  -- R2a: KEINE aktive Lease im gesamten Bestand — eine aktive Lease heisst: dort arbeitet
  -- jemand, dann wird NIE geloescht.
  select count(*) into v_aktive_leases from public.helmut_jobs
   where status <> 'erledigt' and lease_expires_at > now();
  if v_aktive_leases <> 0 then
    raise exception 'ABBRUCH R2a: % aktive Lease(s) — nichts veraendert', v_aktive_leases;
  end if;

  -- R2b: JEDE laeuft-Zeile gehoert zur gesperrten Zielmenge (abgelaufene Lease UND vor der
  -- Grenze). Eine laeuft-Zeile ausserhalb ist unerwartete Aktivitaet — Abbruch.
  select count(*) into v_laeuft_fremd from public.helmut_jobs j
   where j.status = 'laeuft' and not exists (select 1 from ziel z where z.id = j.id);
  if v_laeuft_fremd <> 0 then
    raise exception 'ABBRUCH R2b: % laeuft-Zeile(n) ausserhalb der Zielmenge — nichts veraendert', v_laeuft_fremd;
  end if;

  -- R6: keine offene Zeile ausserhalb der Zeitgrenze (eine NEUE Zeile blockiert).
  select count(*) into v_ausserhalb from public.helmut_jobs
   where status in ('wartend','laeuft') and created_at >= timestamptz '${v.grenze}';
  if v_ausserhalb <> 0 then
    raise exception 'ABBRUCH R6: % offene Zeile(n) neuer als die Grenze ${v.grenze} — nichts veraendert', v_ausserhalb;
  end if;

  -- R3/R4/R5: harte Anker — Gesamtsignatur, ID-Kette der Zielmenge, Erledigt-Signatur.
  v_signatur := ${signaturAusdruck()};
  if v_signatur <> '${v.signaturGesamt}' then
    raise exception 'ABBRUCH R3: Gesamtsignatur % statt ${v.signaturGesamt} — nichts veraendert', v_signatur;
  end if;
  select coalesce(md5(string_agg(id::text, ',' order by id)), 'leer') into v_id_kette from ziel;
  if v_id_kette <> '${v.idKettenMd5Zielmenge}' then
    raise exception 'ABBRUCH R4: ID-Kette der Zielmenge % statt ${v.idKettenMd5Zielmenge} — nichts veraendert', v_id_kette;
  end if;
  v_erledigt_sig := ${signaturAusdruck("status = 'erledigt'")};
  if v_erledigt_sig <> '${v.signaturErledigt}' then
    raise exception 'ABBRUCH R5: Erledigt-Signatur % statt ${v.signaturErledigt} — nichts veraendert', v_erledigt_sig;
  end if;

  -- R7: exakte Typverteilung der Zielmenge.${typPruefung}

  -- R12 (vorher): exakt die erwarteten Outbox-Absichten gehoeren zur Zielmenge.
  select count(*) into v_outbox_vorher from public.helmut_job_outbox o
   where exists (select 1 from ziel z where z.id = o.job_id);
  if v_outbox_vorher <> ${v.outboxZielmenge} then
    raise exception 'ABBRUCH R12: % Outbox-Absichten der Zielmenge statt ${v.outboxZielmenge} — nichts veraendert', v_outbox_vorher;
  end if;

  -- DIE EINE AENDERUNG: ausschliesslich die gesperrten Zielzeilen, ueber ihre IDs.
  delete from public.helmut_jobs j using ziel z where j.id = z.id;
  get diagnostics v_geloescht = row_count;
  if v_geloescht <> ${v.zielmenge} then
    raise exception 'ABBRUCH R8: % Zeilen geloescht, erwartet ${v.zielmenge} — Transaktion zurueckgenommen', v_geloescht;
  end if;

  -- R12 (nachher): die Kaskade (on delete cascade, Migration 20260813) hat die Absichten
  -- der Zielmenge mitgenommen — BEWIESEN in derselben Transaktion, nicht angenommen.
  select count(*) into v_outbox_nachher from public.helmut_job_outbox o
   where exists (select 1 from ziel z where z.id = o.job_id);
  if v_outbox_nachher <> 0 then
    raise exception 'ABBRUCH R12: % Outbox-Absichten der Zielmenge ueberleben die Loeschung — Transaktion zurueckgenommen', v_outbox_nachher;
  end if;

  -- R9: Nachzustand NOCH IN DER TRANSAKTION — 0 offene, die ${v.erledigt} erledigten unveraendert.
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
    'verfahren', 'op30-neutralisierung-383-gemischt',
    'modus', '${modus}',
    'zeitpunkt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'geloescht', v_geloescht,
    'grenze', '${v.grenze}',
    'signatur_gesamt_vorher', '${v.signaturGesamt}',
    'id_kette_zielmenge', v_id_kette,
    'signatur_erledigt_vorher_nachher', v_erledigt_sig,
    'outbox_zielmenge_vorher', v_outbox_vorher,
    'outbox_zielmenge_nachher', v_outbox_nachher,
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
       ${signaturAusdruck("status = 'erledigt'")}             as signatur_erledigt, -- erwartet ${v.signaturErledigt}
       (select count(*) from public.helmut_job_outbox)        as outbox_gesamt   -- Zielanteil 0
  from public.helmut_jobs;` : `rollback; -- Sicherheitsnetz: der Trockenlauf ist durch R11 bereits abgebrochen`}`);
}


// ═════════════════════════════════════════════════════════════════════════════════════════════
// EINZEILENVERTRAG: die EINE versehentlich erzeugte Testzeile vom 2026-08-24
// ═════════════════════════════════════════════════════════════════════════════════════════════
// ANLASS (Runbook §31.6): ein Handlauf der Bestandssuite `jobdispatch-vertrag-test.js` OHNE
// `scripts/lokal.js` lief in einer Cloud-Sitzung mit Production-Kennungen in der Umgebung. Der
// §9-Pruefpunkt ruft bewusst den echten `standardEnqueue` — und schrieb dadurch je EINE Zeile
// in `helmut_jobs` und `helmut_job_outbox` der Production.
//
// BEGRIFF, EHRLICH (Korrektur 2026-08-25): „Neutralisierung" heisst hier — wie in den beiden
// Vertraegen oben — LOESCHEN. Der Status `aufgegeben` gehoert zur Outbox-VERSANDABSICHT, nicht
// zum Auftrag in `helmut_jobs`; ein Auftrag kennt ihn nicht. Die fachlich ehrliche Massnahme
// lautet deshalb: bedingtes Loeschen genau dieser einen versehentlichen Auftragszeile samt
// ihrer exakt zugeordneten Outbox-Zeile.
//
// WARUM EIN EIGENER VERTRAG UND KEINE ERWEITERUNG DER BEIDEN OBEN:
//   Die Sammelvertraege treffen ihre Zielmenge ueber eine ZEITGRENZE (`created_at < grenze`)
//   plus Signaturen ueber den Gesamtbestand. Das ist fuer 524 bzw. 383 Altauftraege richtig und
//   waere hier grundfalsch: eine Zeitgrenze koennte kuenftig weitere Zeilen einfangen. Dieser
//   Vertrag trifft AUSSCHLIESSLICH zwei fest benannte Kennungen — keine Zeitfenster, keine
//   Mengenlogik, keine Bestandssignatur. Die Vertraege oben bleiben unveraendert.
//
// DATENSPARSAMKEIT — BEWUSST ANDERE REGEL ALS OBEN, UND WARUM:
//   Die Sammelvertraege duerfen `payload`/`tenant_id`/`idempotency_key`/`last_error` NIRGENDS
//   anfassen: ihre Zielmenge enthielt echte politische Arbeit, jeder Blick darauf waere ein
//   unnoetiger Zugriff. Hier ist es umgekehrt: die Sicherheit dieser Loeschung HAENGT daran,
//   dass genau diese Werte geprueft werden — der Idempotenzschluessel der Testsuite, die leere
//   Nutzlast, die fehlende Mandatszuordnung und der technische Handlerfehler unterscheiden die
//   versehentliche Testzeile von echter Arbeit. VERGLICHEN wird ausschliesslich INNERHALB der
//   Datenbank; kein Wert dieser Spalten wird gelesen, ausgegeben oder dokumentiert.
//   Der Riegel `pruefeEinzeilenSql` erlaubt diese Spalten deshalb AUSSCHLIESSLICH in
//   VERGLEICHEN gegen feste Literale und verbietet jede andere Verwendung: kein `select`
//   dieser Werte, keine Zuweisung, keine Ausgabe, kein Vollzeilenkonstrukt. Kein Wert dieser
//   Spalten verlaesst dadurch die Datenbank — weder in der Quittung noch in einer Fehlermeldung
//   (die Meldungen benennen deutsche Feldbezeichnungen, nie Spaltenwerte).

// DER ZUSTAND HAT SICH GEAENDERT — ZWEITE FASSUNG (2026-08-25):
//   Die erste Fassung dieses Vertrags beschrieb den Auftrag als unberuehrt (`wartend`, 0
//   Versuche, nie beansprucht). Das stimmt seit dem 2026-08-25 um 07:01 Uhr tuerkischer Zeit
//   (06:01 Berlin, 04:01 UTC) NICHT MEHR: der regulaere Betrieb hat den Auftrag aufgenommen,
//   der Fachhandler hat die leere Nutzlast erwartungsgemaess abgelehnt, und die fuenf Versuche
//   sind in einem einzigen Slot abgebrannt. Der Auftrag ist jetzt TERMINAL `fehlgeschlagen`
//   und zaehlt damit tatsaechlich als 1 in `endgueltig_fehler`. Die Outbox-Absicht wurde im
//   Schattenmodus versendet und bestaetigt.
//   WICHTIG UND BEABSICHTIGT: der Vertrag der ersten Fassung haette einen Trockenlauf gegen
//   diesen neuen Zustand GESCHLOSSEN ABGEBROCHEN (Riegel E7.1 Status, E7.2 Versuchszahl,
//   E7.7 erste Beanspruchung, E7.8 Abschluss, E4.2 Outbox-Status). Genau dafuer sind die
//   Riegel da. Deshalb wurde nichts ausgefuehrt, sondern der Vertrag berichtigt.
//
// Die Werte stammen aus der rein lesenden Production-Pruefung vom 2026-08-25, 07:48:39 Uhr
// tuerkischer Zeit (06:48:39 Berlin, 04:48:39 UTC) — Eingaben, keine Selbstauskunft des Skripts.
const EINZEILEN_VERTRAG_TESTZEILE = Object.freeze({
  beleg: "docs/betrieb/op30-aktivierung-5-mandate.md §31.8 (Endzustand 2026-08-25, rein lesend erhoben)",
  verfahren: "einzeilen-neutralisierung-testzeile-endzustand-2026-08-25",
  auftrag: Object.freeze({
    id: "371707a4-3d78-44f5-a1c5-d6f11026f4d2",
    jobType: "source_fetch",
    idempotenzschluessel: "k",
    aktualitaetsfenster: "f",
    // TERMINAL: aufgenommen, fuenfmal versucht, endgueltig gescheitert.
    status: "fehlgeschlagen",
    versuche: 5,
    maxVersuche: 5,
    prioritaet: 100,
    wiedervorlagen: 0,
    // Der technische Fehlertext des Fachhandlers. Er wird AUSSCHLIESSLICH innerhalb der
    // Datenbank verglichen — er erscheint in keiner Quittung, keiner Fehlermeldung, keiner
    // Testausgabe und keinem Dokumentationsbeleg.
    fehlertext: "payload-ungueltig: quelle fehlt",
    faelligAb: "2026-08-25 04:01:34.992819+00",
    ersteFaelligkeit: "2026-08-24 20:32:12.512+00",
    erstelltAm: "2026-08-24 20:32:12.754636+00",
    ersteBeanspruchung: "2026-08-25 04:01:05.852564+00",
    abschluss: "2026-08-25 04:01:35.086225+00"
  }),
  outbox: Object.freeze({
    id: "24ba14ec-0827-49af-9cf1-43cb485f4e33",
    status: "bestaetigt",
    versuche: 1,
    maxVersuche: 10,
    schemaVersion: 1,
    transport: "schatten",
    erstelltAm: "2026-08-24 20:32:13.047778+00",
    naechsterVersuchAb: "2026-08-25 04:01:31.580665+00",
    versendetAm: "2026-08-25 04:01:01.580665+00",
    bestaetigtAm: "2026-08-25 04:01:03.624894+00"
  }),
  // Der Datenbankvertrag: genau EINE eingehende Fremdschluesselbeziehung auf `helmut_jobs`,
  // und das ist die Outbox-Kaskade. Rein lesend am 2026-08-25 erneut aus dem Katalog erhoben.
  fremdschluessel: Object.freeze({
    anzahlEingehendAufJobs: 1,
    name: "helmut_job_outbox_job_id_fkey",
    quelltabelle: "helmut_job_outbox",
    loeschregel: "c"   // pg_constraint.confdeltype 'c' = ON DELETE CASCADE
  })
});

const UUID_MUSTER_VERTRAG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ZEITSTEMPEL_MUSTER = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?\+00$/;

// FAIL CLOSED: ein unvollstaendiger oder verformter Einzeilenvertrag erzeugt KEIN SQL.
function pruefeEinzeilenVertrag(vertrag) {
  const v = vertrag || {};
  const a = v.auftrag || {};
  const o = v.outbox || {};
  const f = v.fremdschluessel || {};
  if (!UUID_MUSTER_VERTRAG.test(String(a.id || ""))) {
    throw new Error("Einzeilenvertrag unvollstaendig: auftrag.id muss eine uuid sein");
  }
  if (!UUID_MUSTER_VERTRAG.test(String(o.id || ""))) {
    throw new Error("Einzeilenvertrag unvollstaendig: outbox.id muss eine uuid sein");
  }
  if (a.id === o.id) {
    throw new Error("Einzeilenvertrag widerspruechlich: Auftrag und Outbox tragen dieselbe Kennung");
  }
  for (const [feld, wert] of [["auftrag.jobType", a.jobType], ["auftrag.idempotenzschluessel", a.idempotenzschluessel],
    ["auftrag.aktualitaetsfenster", a.aktualitaetsfenster], ["auftrag.status", a.status],
    ["auftrag.fehlertext", a.fehlertext], ["outbox.status", o.status], ["outbox.transport", o.transport]]) {
    if (typeof wert !== "string" || !wert.length) {
      throw new Error(`Einzeilenvertrag unvollstaendig: ${feld} fehlt`);
    }
    // Ein Hochkomma im Vertrag koennte das erzeugte SQL verlassen — fail closed statt escapen.
    if (/['\;]/.test(wert)) throw new Error(`Einzeilenvertrag unzulaessig: ${feld} enthaelt Sonderzeichen`);
  }
  for (const [feld, wert] of [["auftrag.versuche", a.versuche], ["auftrag.maxVersuche", a.maxVersuche],
    ["auftrag.prioritaet", a.prioritaet], ["auftrag.wiedervorlagen", a.wiedervorlagen],
    ["outbox.versuche", o.versuche], ["outbox.maxVersuche", o.maxVersuche],
    ["outbox.schemaVersion", o.schemaVersion], ["fremdschluessel.anzahlEingehendAufJobs", f.anzahlEingehendAufJobs]]) {
    if (!Number.isInteger(wert) || wert < 0) {
      throw new Error(`Einzeilenvertrag unvollstaendig: ${feld} muss eine ganze Zahl >= 0 sein`);
    }
  }
  for (const [feld, wert] of [["auftrag.faelligAb", a.faelligAb], ["auftrag.ersteFaelligkeit", a.ersteFaelligkeit],
    ["auftrag.erstelltAm", a.erstelltAm], ["auftrag.ersteBeanspruchung", a.ersteBeanspruchung],
    ["auftrag.abschluss", a.abschluss], ["outbox.erstelltAm", o.erstelltAm],
    ["outbox.naechsterVersuchAb", o.naechsterVersuchAb], ["outbox.versendetAm", o.versendetAm],
    ["outbox.bestaetigtAm", o.bestaetigtAm]]) {
    if (!ZEITSTEMPEL_MUSTER.test(String(wert || ""))) {
      throw new Error(`Einzeilenvertrag unvollstaendig: ${feld} muss 'JJJJ-MM-TT hh:mm:ss[.ffffff]+00' sein`);
    }
  }
  // ZWEITE FASSUNG (2026-08-25): der Auftrag ist seit 07:01 Uhr tuerkischer Zeit (06:01 Berlin,
  // 04:01 UTC) TERMINAL. Ein Vertrag, der noch den frueheren unberuehrten Zustand beschreibt,
  // ist veraltet und erzeugt hier KEIN SQL mehr — fail closed statt stiller Anpassung.
  if (a.status === "wartend" || o.status === "offen") {
    throw new Error("Einzeilenvertrag veraltet: der frueher beschriebene Zustand (Auftrag 'wartend' / Outbox 'offen')"
      + " gilt seit dem 2026-08-25 nicht mehr — der Vertrag muss den belegten Endzustand beschreiben");
  }
  if (a.status !== "fehlgeschlagen" || a.versuche !== a.maxVersuche || a.wiedervorlagen !== 0) {
    throw new Error("Einzeilenvertrag unzulaessig: Ziel darf nur der TERMINAL gescheiterte Auftrag sein"
      + " (fehlgeschlagen, Versuche = Versuchsobergrenze, 0 Wiedervorlagen)");
  }
  if (o.status !== "bestaetigt" || o.versuche < 1 || o.versuche > o.maxVersuche) {
    throw new Error("Einzeilenvertrag unzulaessig: die Outbox-Absicht muss bestaetigt und genau einmal versucht sein");
  }
  if (f.anzahlEingehendAufJobs !== 1 || f.loeschregel !== "c"
      || f.quelltabelle !== "helmut_job_outbox" || !/^[a-z_]+$/.test(String(f.name || ""))) {
    throw new Error("Einzeilenvertrag unvollstaendig: fremdschluessel muss genau die Outbox-Kaskade beschreiben");
  }
  return v;
}

// Riegel fuer JEDES erzeugte Einzeilen-SQL. Strenger als der Sammelriegel, wo es zaehlt:
//   (1) kein Vollzeilenkonstrukt (identisch zu oben),
//   (2) die vier sensiblen Spalten NUR als Vergleich gegen ein Literal — nie lesen, nie ausgeben,
//   (3) GENAU EINE Loeschanweisung, und die trifft ausschliesslich die Auftragskennung,
//   (4) KEIN Zeitbereich als Zielmenge (`created_at <`, `>=`, …) — nur Gleichheit als Pruefung.
const EINZEILEN_VERGLEICH = /\b(payload|tenant_id|idempotency_key|last_error)\b\s*(?:=|<>|is\s+(?:not\s+)?null)/gi;
const EINZEILEN_SPALTE = /\b(payload|tenant_id|idempotency_key|last_error)\b/gi;
function pruefeEinzeilenSql(sqlText, sensibleWerte = {}) {
  const t = String(sqlText || "");
  const klein = t.toLowerCase();
  // (0) DATENSPARSAMKEIT AM WERT (zweite Fassung 2026-08-25): jeder sensible Vertragswert darf
  //     AUSSCHLIESSLICH als rechte Seite seines EIGENEN Spaltenvergleichs auftauchen — nie in
  //     einer Abbruchmeldung, nie in der Quittung, nie in einem Kommentar. Damit wird der
  //     Vergleich technisch auf das Innere der Datenbank begrenzt.
  for (const [spalte, wert] of Object.entries(sensibleWerte)) {
    if (typeof wert !== "string" || !wert.length) continue;
    const literal = `'${wert}'`;
    const vergleichsEnde = new RegExp(`\\b${spalte}\\s*=\\s*$`);
    for (let ab = t.indexOf(literal); ab !== -1; ab = t.indexOf(literal, ab + literal.length)) {
      if (!vergleichsEnde.test(t.slice(0, ab))) {
        throw new Error(`Einzeilen-SQL abgelehnt: ein sensibler Vertragswert (Spalte ${spalte}) steht ausserhalb`
          + " seines eigenen Spaltenvergleichs — er darf die Datenbank nicht verlassen");
      }
    }
  }
  for (const muster of VOLLZEILEN_MUSTER) {
    if (klein.includes(muster)) {
      throw new Error(`Einzeilen-SQL abgelehnt: Vollzeilenkonstrukt '${muster}' koennte ganze Zeilen ausgeben`);
    }
  }
  // Gezaehlt wird auf dem CODE, nicht auf Zeichenketten-Literalen: ein Wort innerhalb eines
  // Literals ist per Definition keine Spaltenreferenz (Riegel (0) deckt Literale ab).
  const ohneLiterale = t.replace(/'(?:[^']|'')*'/g, "''");
  const vorkommen = (ohneLiterale.match(EINZEILEN_SPALTE) || []).length;
  const vergleiche = (ohneLiterale.match(EINZEILEN_VERGLEICH) || []).length;
  if (vorkommen !== vergleiche) {
    throw new Error("Einzeilen-SQL abgelehnt: eine sensible Spalte wird nicht ausschliesslich verglichen"
      + ` (${vorkommen} Vorkommen, ${vergleiche} Vergleiche)`);
  }
  const loeschungen = (klein.match(/delete\s+from/g) || []).length;
  if (loeschungen > 1) {
    throw new Error(`Einzeilen-SQL abgelehnt: ${loeschungen} Loeschanweisungen, erlaubt ist hoechstens eine`);
  }
  if (loeschungen === 1 && !/delete from public\.helmut_jobs\s+where id = '[0-9a-f-]{36}'::uuid;/i.test(t)) {
    throw new Error("Einzeilen-SQL abgelehnt: die Loeschung ist nicht exakt auf eine Auftragskennung begrenzt");
  }
  if (/(created_at|due_at|first_due_at|next_attempt_at|first_claimed_at|finished_at|sent_at|confirmed_at)\s*(<|>|<=|>=)/i.test(t)) {
    throw new Error("Einzeilen-SQL abgelehnt: Zeitbereich als Zielmenge ist in diesem Vertrag verboten");
  }
  return t;
}

// ── Schritt 0 (Einzeilenvertrag): Vorpruefung, rein lesend, ausserhalb jeder Transaktion ─────
function einzeilenVorpruefungSql(vertrag = EINZEILEN_VERTRAG_TESTZEILE) {
  const v = pruefeEinzeilenVertrag(vertrag);
  const a = v.auftrag;
  const o = v.outbox;
  return pruefeEinzeilenSql(`-- Einzeilen-Neutralisierung · Schritt 0: Vorpruefung (REIN LESEND, keine Aenderung)
-- Ziel: genau der versehentliche Testauftrag ${a.id} und seine Outbox-Zeile ${o.id}.
-- Erwartung laut ${v.beleg}. Jede Abweichung: ANHALTEN, NICHTS ausfuehren, neu bewerten.
select
  (select count(*) from public.helmut_jobs where id = '${a.id}'::uuid)                          as auftrag_vorhanden,   -- erwartet 1
  (select count(*) from public.helmut_job_outbox where id = '${o.id}'::uuid)                    as outbox_vorhanden,    -- erwartet 1
  (select count(*) from public.helmut_job_outbox where job_id = '${a.id}'::uuid)                as outbox_je_auftrag,   -- erwartet 1
  (select count(*) from public.helmut_jobs where id = '${a.id}'::uuid
     and job_type = '${a.jobType}' and idempotency_key = '${a.idempotenzschluessel}'
     and freshness_window = '${a.aktualitaetsfenster}' and status = '${a.status}'
     and attempts = ${a.versuche} and max_attempts = ${a.maxVersuche}
     and priority = ${a.prioritaet} and wiedervorlagen = ${a.wiedervorlagen}
     and tenant_id is null and payload = '{}'::jsonb and last_error = '${a.fehlertext}'
     and lease_owner is null and lease_expires_at is null
     and first_claimed_at = timestamptz '${a.ersteBeanspruchung}'
     and finished_at = timestamptz '${a.abschluss}'
     and due_at = timestamptz '${a.faelligAb}'
     and first_due_at = timestamptz '${a.ersteFaelligkeit}'
     and created_at = timestamptz '${a.erstelltAm}')                                           as auftrag_vertragstreu, -- erwartet 1
  (select count(*) from public.helmut_job_outbox where id = '${o.id}'::uuid
     and job_id = '${a.id}'::uuid and status = '${o.status}'
     and attempts = ${o.versuche} and max_attempts = ${o.maxVersuche}
     and schema_version = ${o.schemaVersion} and transport = '${o.transport}'
     and sent_at = timestamptz '${o.versendetAm}'
     and confirmed_at = timestamptz '${o.bestaetigtAm}' and last_error is null
     and created_at = timestamptz '${o.erstelltAm}'
     and next_attempt_at = timestamptz '${o.naechsterVersuchAb}')                              as outbox_vertragstreu,  -- erwartet 1
  (select count(*) from pg_constraint con
      join pg_class tgt on tgt.oid = con.confrelid
      join pg_namespace n on n.oid = tgt.relnamespace
     where con.contype = 'f' and n.nspname = 'public' and tgt.relname = 'helmut_jobs')         as fk_auf_jobs,          -- erwartet ${v.fremdschluessel.anzahlEingehendAufJobs}
  (select count(*) from pg_constraint con
      join pg_class src on src.oid = con.conrelid
      join pg_class tgt on tgt.oid = con.confrelid
      join pg_namespace n on n.oid = tgt.relnamespace
     where con.contype = 'f' and n.nspname = 'public' and tgt.relname = 'helmut_jobs'
       and src.relname = '${v.fremdschluessel.quelltabelle}'
       and con.conname = '${v.fremdschluessel.name}'
       and con.confdeltype = '${v.fremdschluessel.loeschregel}')                               as fk_ist_kaskade;       -- erwartet 1`,
    { last_error: a.fehlertext, idempotency_key: a.idempotenzschluessel });
}

// ── Schritt 2 (Einzeilenvertrag): EINE Transaktion, Standard ist der Trockenlauf ─────────────
// Alle Riegel E0–E11 laufen INNERHALB derselben Transaktion; beide Zielzeilen sind ab der
// ersten Pruefung mit FOR UPDATE gesperrt, die Transaktion laeuft SERIALIZABLE. Eine
// konkurrierende Beanspruchung endet als Serialisierungsfehler oder Riegelabbruch — nie als
// Teilzustand.
function einzeilenNeutralisierungSql(vertrag = EINZEILEN_VERTRAG_TESTZEILE, { modus = "trockenlauf" } = {}) {
  const v = pruefeEinzeilenVertrag(vertrag);
  if (modus !== "trockenlauf" && modus !== "scharf") {
    throw new Error(`Unbekannter Modus '${modus}' — erlaubt sind 'trockenlauf' (Standard) und 'scharf'`);
  }
  const scharf = modus === "scharf";
  const a = v.auftrag;
  const o = v.outbox;
  const fk = v.fremdschluessel;

  // Jede Zusage des Vertrags wird zu genau einem Riegel. Die Meldungen benennen deutsche
  // Feldbezeichnungen — NIE Werte der vier sensiblen Spalten.
  const AUFTRAG_FELDER = [
    ["E2.1", "Auftragstyp", `job_type = '${a.jobType}'`],
    ["E2.2", "Idempotenzschluessel", `idempotency_key = '${a.idempotenzschluessel}'`],
    ["E2.3", "Aktualitaetsfenster", `freshness_window = '${a.aktualitaetsfenster}'`],
    ["E2.4", "Prioritaet", `priority = ${a.prioritaet}`],
    ["E2.5", "Mandatszuordnung (muss leer sein)", "tenant_id is null"],
    ["E2.6", "Nutzlast (muss leer sein)", "payload = '{}'::jsonb"],
    ["E2.7", "Fehlertext (technischer Handlerfehler, nur Vergleich)", `last_error = '${a.fehlertext}'`],
    ["E2.8", "Faelligkeit", `due_at = timestamptz '${a.faelligAb}'`],
    ["E2.9", "erste Faelligkeit", `first_due_at = timestamptz '${a.ersteFaelligkeit}'`],
    ["E2.10", "Erstellzeitpunkt", `created_at = timestamptz '${a.erstelltAm}'`],
    ["E7.1", "Status (terminal gescheitert, keine spaetere Aenderung)", `status = '${a.status}'`],
    ["E7.2", "Versuchszahl (alle Versuche abgebrannt, keine weitere)", `attempts = ${a.versuche}`],
    ["E7.3", "Versuchsobergrenze", `max_attempts = ${a.maxVersuche}`],
    ["E7.4", "Wiedervorlagen (keine Wiedervorlage)", `wiedervorlagen = ${a.wiedervorlagen}`],
    ["E7.5", "Lease-Besitzer (keine AKTUELLE Lease)", "lease_owner is null"],
    ["E7.6", "Lease-Ablauf (keine AKTUELLE Lease)", "lease_expires_at is null"],
    ["E7.7", "erste Beanspruchung (belegter Zeitpunkt)", `first_claimed_at = timestamptz '${a.ersteBeanspruchung}'`],
    ["E7.8", "Abschlusszeitpunkt (belegter Zeitpunkt)", `finished_at = timestamptz '${a.abschluss}'`]
  ];
  const OUTBOX_FELDER = [
    ["E4.1", "Auftragszuordnung", `job_id = '${a.id}'::uuid`],
    ["E4.2", "Status", `status = '${o.status}'`],
    ["E4.3", "Versuchszahl", `attempts = ${o.versuche}`],
    ["E4.4", "Versuchsobergrenze", `max_attempts = ${o.maxVersuche}`],
    ["E4.5", "Transport (belegter Transportname)", `transport = '${o.transport}'`],
    ["E4.6", "Sendezeitpunkt (belegter Zeitpunkt)", `sent_at = timestamptz '${o.versendetAm}'`],
    ["E4.7", "Bestaetigungszeitpunkt (belegter Zeitpunkt)", `confirmed_at = timestamptz '${o.bestaetigtAm}'`],
    ["E4.8", "Fehlertext (muss leer sein)", "last_error is null"],
    ["E4.9", "Schemaversion", `schema_version = ${o.schemaVersion}`],
    ["E4.10", "Erstellzeitpunkt", `created_at = timestamptz '${o.erstelltAm}'`],
    ["E4.11", "naechster Versuch", `next_attempt_at = timestamptz '${o.naechsterVersuchAb}'`]
  ];
  const felderSql = (felder, praefix) => ({
    deklaration: felder.map((_, i) => `  ${praefix}${i + 1} boolean;`).join("\n"),
    auswahl: felder.map(([, , p]) => `(${p})`).join(",\n         "),
    ziele: felder.map((_, i) => `${praefix}${i + 1}`).join(", "),
    riegel: felder.map(([kennung, bezeichnung], i) => `
  if not coalesce(${praefix}${i + 1}, false) then
    raise exception 'ABBRUCH ${kennung}: ${bezeichnung} weicht vom Vertrag ab — nichts veraendert';
  end if;`).join("")
  });
  const A = felderSql(AUFTRAG_FELDER, "v_a");
  const O = felderSql(OUTBOX_FELDER, "v_o");

  return pruefeEinzeilenSql(`-- Einzeilen-Neutralisierung · Schritt 2 · MODUS: ${scharf ? "SCHARF (loescht bei Erfolg)" : "TROCKENLAUF (Standard — endet IMMER im Rollback)"}
-- Ziel: AUSSCHLIESSLICH der versehentliche Testauftrag ${a.id}
-- und seine exakt zugeordnete Outbox-Zeile ${o.id}.
-- Erwartung laut ${v.beleg}. Vorher Schritt 0 (Vorpruefung) ausfuehren.
-- Rueckweg: keiner byte-identisch — die Zeile traegt keine echte Arbeit (leere Nutzlast,
-- keine Mandatszuordnung); echte Arbeit erzeugt der Planer deterministisch neu.
begin isolation level serializable;
create temporary table einzeilen_quittung (quittung jsonb) on commit drop;
do $einzeilen$
declare
  v_auftrag_n   bigint;
  v_outbox_n    bigint;
  v_jobs_vorher bigint;
  v_jobs_nachher bigint;
  v_obox_vorher bigint;
  v_obox_nachher bigint;
  v_fk_gesamt   bigint;
  v_fk_kaskade  bigint;
  v_geloescht   bigint;
  v_quittung    jsonb;
${A.deklaration}
${O.deklaration}
begin
  -- SPERRE: ausschliesslich die beiden exakten Zielzeilen, sonst nichts (E10-Grundlage).
  create temporary table ziel_auftrag on commit drop as
    select id from public.helmut_jobs where id = '${a.id}'::uuid for update;
  create temporary table ziel_outbox on commit drop as
    select id from public.helmut_job_outbox where id = '${o.id}'::uuid for update;

  select count(*) into v_auftrag_n from ziel_auftrag;
  select count(*) into v_outbox_n  from ziel_outbox;

  -- E0: WIEDERHOLUNG NACH ERFOLGREICHEM SCHARFEN LAUF — kein Fehlerfall, keine Aenderung.
  if v_auftrag_n = 0 and v_outbox_n = 0 then
    raise exception 'ABBRUCH-BEREITS-NEUTRALISIERT: beide Zielzeilen sind bereits entfernt — keine Aenderung noetig, keine ausgefuehrt';
  end if;

  -- E1: genau EINE Auftragszeile mit der Zielkennung.
  if v_auftrag_n <> 1 then
    raise exception 'ABBRUCH E1: % Auftragszeile(n) mit der Zielkennung, erwartet genau 1 — nichts veraendert', v_auftrag_n;
  end if;

  -- E3: genau EINE Outbox-Zeile, und zwar die Zielkennung, und sie gehoert zum Zielauftrag.
  if v_outbox_n <> 1 then
    raise exception 'ABBRUCH E3: % Outbox-Zeile(n) mit der Zielkennung, erwartet genau 1 — nichts veraendert', v_outbox_n;
  end if;
  select count(*) into v_outbox_n from public.helmut_job_outbox where job_id = '${a.id}'::uuid;
  if v_outbox_n <> 1 then
    raise exception 'ABBRUCH E3b: % Outbox-Zeile(n) verweisen auf den Zielauftrag, erwartet genau 1 — nichts veraendert', v_outbox_n;
  end if;

  -- E2/E7: JEDER vertraglich zugesagte Wert des Auftrags, in derselben Transaktion.
  select ${A.auswahl}
    into ${A.ziele}
    from public.helmut_jobs where id = '${a.id}'::uuid;
${A.riegel}

  -- E4: JEDER vertraglich zugesagte Wert der Outbox-Zeile.
  select ${O.auswahl}
    into ${O.ziele}
    from public.helmut_job_outbox where id = '${o.id}'::uuid;
${O.riegel}

  -- E5/E6: DATENBANKVERTRAG — genau eine eingehende Fremdschluesselbeziehung auf der
  -- Tabelle helmut_jobs, und das ist die belegte Outbox-Kaskade. Damit ist bewiesen, dass die
  -- Loeschung des Auftrags genau eine abhaengige Zeile mitnimmt und sonst nichts.
  select count(*) into v_fk_gesamt from pg_constraint con
    join pg_class tgt on tgt.oid = con.confrelid
    join pg_namespace n on n.oid = tgt.relnamespace
   where con.contype = 'f' and n.nspname = 'public' and tgt.relname = 'helmut_jobs';
  if v_fk_gesamt <> ${fk.anzahlEingehendAufJobs} then
    raise exception 'ABBRUCH E5: % eingehende Fremdschluesselbeziehungen auf helmut_jobs, erwartet ${fk.anzahlEingehendAufJobs} — nichts veraendert', v_fk_gesamt;
  end if;
  select count(*) into v_fk_kaskade from pg_constraint con
    join pg_class src on src.oid = con.conrelid
    join pg_class tgt on tgt.oid = con.confrelid
    join pg_namespace n on n.oid = tgt.relnamespace
   where con.contype = 'f' and n.nspname = 'public' and tgt.relname = 'helmut_jobs'
     and src.relname = '${fk.quelltabelle}' and con.conname = '${fk.name}'
     and con.confdeltype = '${fk.loeschregel}';
  if v_fk_kaskade <> 1 then
    raise exception 'ABBRUCH E6: die eingehende Beziehung ist nicht die belegte Outbox-Kaskade (ON DELETE CASCADE) — nichts veraendert';
  end if;

  -- Umgebungszaehler VOR der Aenderung (E10-Beleg: fremde Zeilen bleiben unberuehrt).
  select count(*) into v_jobs_vorher from public.helmut_jobs;
  select count(*) into v_obox_vorher from public.helmut_job_outbox;

  -- DIE EINE AENDERUNG: ausschliesslich der exakte Zielauftrag ueber seine Kennung.
  delete from public.helmut_jobs where id = '${a.id}'::uuid;
  get diagnostics v_geloescht = row_count;

  -- E8: exakte Loeschanzahl.
  if v_geloescht <> 1 then
    raise exception 'ABBRUCH E8: % Auftragszeile(n) geloescht, erwartet genau 1 — Transaktion zurueckgenommen', v_geloescht;
  end if;

  -- E9: Nachpruefung NOCH IN DER TRANSAKTION — Auftrag weg, Outbox-Zeile durch die geprüfte
  -- Kaskade ebenfalls weg, keine weitere Outbox-Zeile fuer diesen Auftrag.
  select count(*) into v_auftrag_n from public.helmut_jobs where id = '${a.id}'::uuid;
  if v_auftrag_n <> 0 then
    raise exception 'ABBRUCH E9: der Zielauftrag besteht nach der Loeschung weiter — Transaktion zurueckgenommen';
  end if;
  select count(*) into v_outbox_n from public.helmut_job_outbox where id = '${o.id}'::uuid;
  if v_outbox_n <> 0 then
    raise exception 'ABBRUCH E9b: die Outbox-Zeile besteht nach der Kaskade weiter — Transaktion zurueckgenommen';
  end if;
  select count(*) into v_outbox_n from public.helmut_job_outbox where job_id = '${a.id}'::uuid;
  if v_outbox_n <> 0 then
    raise exception 'ABBRUCH E9c: es verweisen weiterhin Outbox-Zeilen auf den Zielauftrag — Transaktion zurueckgenommen';
  end if;

  -- E10: fremde Zeilen unberuehrt — genau eine Auftrags- und genau eine Outbox-Zeile weniger.
  select count(*) into v_jobs_nachher from public.helmut_jobs;
  select count(*) into v_obox_nachher from public.helmut_job_outbox;
  if v_jobs_nachher <> v_jobs_vorher - 1 then
    raise exception 'ABBRUCH E10: Auftragsbestand % statt % — Transaktion zurueckgenommen', v_jobs_nachher, v_jobs_vorher - 1;
  end if;
  if v_obox_nachher <> v_obox_vorher - 1 then
    raise exception 'ABBRUCH E10b: Outbox-Bestand % statt % — Transaktion zurueckgenommen', v_obox_nachher, v_obox_vorher - 1;
  end if;

  -- LAUFQUITTUNG: ausschliesslich technische Kennungen, Zaehlwerte und Zeit. Keine Secrets,
  -- keine Nutzdaten, kein Wert einer sensiblen Spalte.
  v_quittung := jsonb_build_object(
    'verfahren', '${v.verfahren}',
    'modus', '${modus}',
    'zeitpunkt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'auftrag', '${a.id}',
    'outbox', '${o.id}',
    'geloescht_auftrag', v_geloescht,
    'geloescht_outbox_ueber_kaskade', v_obox_vorher - v_obox_nachher,
    'auftraege_vorher_nachher', jsonb_build_array(v_jobs_vorher, v_jobs_nachher),
    'outbox_vorher_nachher', jsonb_build_array(v_obox_vorher, v_obox_nachher),
    'fremdschluessel_geprueft', '${fk.name}',
    'ergebnis', ${scharf ? "'neutralisiert'" : "'trockenlauf-ok'"});
  insert into einzeilen_quittung values (v_quittung);
  raise notice 'QUITTUNG %', v_quittung::text;
${scharf ? "" : `
  -- E11 TROCKENLAUF-RIEGEL: dieser Abbruch ist KEIN Fehlerfall, sondern die Garantie, dass
  -- der Standardmodus niemals committen kann. Alle Riegel oben sind durchlaufen.
  raise exception 'TROCKENLAUF-OK: alle Riegel bestanden, 1 Auftragszeile und 1 Outbox-Zeile WAEREN entfernt worden — Transaktion vollstaendig zurueckgenommen. Quittung: %',
    v_quittung::text;`}
end
$einzeilen$;
select quittung from einzeilen_quittung;
${scharf ? `commit;
-- Gegenprobe NACH dem Commit (rein lesend):
select (select count(*) from public.helmut_jobs where id = '${a.id}'::uuid)        as auftrag_rest,  -- erwartet 0
       (select count(*) from public.helmut_job_outbox where id = '${o.id}'::uuid)  as outbox_rest,   -- erwartet 0
       (select count(*) from public.helmut_job_outbox where job_id = '${a.id}'::uuid) as verweise;   -- erwartet 0` : `rollback; -- Sicherheitsnetz: der Trockenlauf ist durch E11 bereits abgebrochen`}`,
    { last_error: a.fehlertext, idempotency_key: a.idempotenzschluessel });
}

module.exports = {
  PRODUCTION_VERTRAG,
  PRODUCTION_VERTRAG_GEMISCHT,
  SENSIBLE_SPALTEN,
  VOLLZEILEN_MUSTER,
  pruefeVertrag,
  pruefeGemischtVertrag,
  pruefeDatensparsamkeit,
  signaturAusdruck,
  zielmengeWhere,
  zielmengeGemischtWhere,
  vorpruefungSql,
  vorpruefungGemischtSql,
  neutralisierungSql,
  neutralisierungGemischtSql,
  // Einzeilenvertrag (Stoerung 2026-08-24) — getrennt von den Sammelvertraegen oben.
  EINZEILEN_VERTRAG_TESTZEILE,
  pruefeEinzeilenVertrag,
  pruefeEinzeilenSql,
  einzeilenVorpruefungSql,
  einzeilenNeutralisierungSql
};
