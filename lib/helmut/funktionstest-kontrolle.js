"use strict";

// Helmut — DIE KURZE SICHERHEITSKONTROLLE ZWISCHEN DEN STUFEN (20 / 75 / 400).
// =============================================================================
// WAS BISHER FEHLTE (adversarialer Review 02.09., bestätigter Befund):
// `funktionstest-500.pruefeAbbruch()` konnte fünfzehn Regeln auswerten — aber
// NIEMAND erhob die Messwerte. Die Regeln hatten keinen einzigen produktiven
// Aufrufer; sie liefen ausschließlich im Vertragstest. Damit war die Zusage
// „zwischen den Gruppen wird kontrolliert" eine Absichtserklärung, kein Ablauf.
//
// Dieses Modul schließt genau diese Lücke — und zwar so, dass es nichts tut,
// was es nicht darf:
//
//   1. `erhebungsSql()` liefert das REIN LESENDE SQL für alles, was aus der
//      Datenbank kommt. Es wird gedruckt, nicht ausgeführt (dasselbe Verfahren
//      wie `scripts/testkohorte-495.js sql`).
//   2. `baueBeobachtungen()` ist eine REINE Abbildung der erhobenen Zahlen auf
//      die fünfzehn Beobachtungsgrößen. Kein Netz, keine Datenbank, keine Uhr.
//   3. `kontrolliere()` wertet damit `pruefeAbbruch()` aus und liefert das
//      Stufenurteil.
//
// ─── DIE EINE REGEL, DIE DIESES MODUL TRÄGT ─────────────────────────────────
// KEINE KOERZIERUNG. Ein nicht erhobener Wert wird NICHT übernommen — er fehlt,
// und eine Regel ohne Messwert ist „nicht bewertbar" und bricht ab. Genau das
// ist der Unterschied zwischen einer Kontrolle und einem Anschein: `Number(null)`
// ist 0, und eine 0 sieht aus wie „alles in Ordnung" (CLAUDE.md §4.4).

const funktionstest = require("./funktionstest-500");
const { PRAEFIX } = require("./test-kohorte-500");

// Die fünfzehn Beobachtungsgrößen mit ihrer Herkunft. Wer eine davon nicht
// erheben kann, darf die Stufe nicht als bestanden melden.
const HERKUNFT = Object.freeze({
  unbekannteModellaufrufe: "SQL Block 3 — llmUsage-Einträge mit callType außerhalb des freigegebenen Katalogs",
  haengendeLeases: "SQL Block 1 — helmut_jobs mit abgelaufener Lease ohne lebenden Bearbeiter",
  fehlerquote: "lauf-bilanz.js — endgültig fehlgeschlagen ÷ verarbeitet",
  kostenBisherUsd: "SQL Block 2 (llm_budget_counters) × bestätigtem Preis je Aufruf",
  laufzeitMinuten: "Startzeitpunkt der Stufe gegen die Uhr des Aufrufers (Betreibereingabe)",
  drosselungen: "SQL Block 3 — llmUsage-Einträge mit HTTP 429",
  rueckstandWachstum: "Drain-Bilanz im Gesundheitsbericht (Ankunft − Abfluss)",
  bilanzVollstaendig: "lauf-bilanz.js — verarbeitet + vertagt + fehlgeschlagen = cluster",
  realeMandateVeraendert: "SQL Block 4 — Grundlinienvergleich der Nicht-Kohortenzeilen",
  kommunikationsversuche: "Kommunikationsriegel — durchgelassene Zustellversuche (muss 0 sein)",
  productionCommit: "Vercel-Deployment (githubCommitSha), rein lesend",
  fensterKonflikte: "funktionstest-500.pruefeStartfenster() gegen vercel.json",
  dubletten: "SQL Block 1 — doppelt ausgeführte Aufträge und doppelte Kennungen",
  realeMandateOhneZuteilung: "llm-budget-fair.tagesplan().klassen — reale Mandate ohne notwendige Zuteilung",
  verarbeiteteVorgaenge: "lauf-bilanz.js — verarbeitete Vorgänge seit Beginn der Stufe"
});

// Nur eine ECHTE Zahl zählt. `null`, `undefined`, `""`, `NaN`, `true`, `[]`
// werden NICHT zu 0 gemacht — sie fehlen dann schlicht.
function zahl(wert) {
  if (typeof wert !== "number" || !Number.isFinite(wert)) return undefined;
  return wert;
}
function boolStreng(wert) {
  return typeof wert === "boolean" ? wert : undefined;
}
function textStreng(wert) {
  return typeof wert === "string" && wert.trim() ? wert.trim() : undefined;
}

// Rein lesendes SQL. Es wird GEDRUCKT, nicht ausgeführt — genau wie das
// Erhebungs-SQL der Kohortenwerkzeuge. Keine Zeile wird verändert.
function erhebungsSql({ seitIso = "<STUFENBEGINN-UTC>" } = {}) {
  return [
    "-- Helmut · rein lesende Erhebung der Abbruchkontrolle (Stufen 20/75/400).",
    "-- NUR SELECT. Keine Zeile wird veraendert. Ergebnis als JSON ablegen.",
    `-- Zeitfenster: alles seit '${seitIso}' (Beginn der Stufe).`,
    "",
    "-- 1 · WARTESCHLANGE: haengende Leases und Dubletten",
    "select",
    "  -- Kanonische Spalten- und Statusnamen der Warteschlange",
    "  -- (Migration 20260808_scalable_job_queue.sql): status 'laeuft',",
    "  -- Lease-Ende in lease_expires_at.",
    "  count(*) filter (",
    "    where status = 'laeuft' and lease_expires_at is not null and lease_expires_at < now()",
    "  ) as \"haengendeLeases\",",
    // KORRIGIERT 02.09. (adversariales Diff-Review, bestaetigter Befund): Hier
    // stand `group by idempotency_key having count(*) > 1`. Auf
    // `helmut_jobs` liegt ein UNIQUE-Index genau auf dieser Spalte
    // (20260808_scalable_job_queue.sql:137-138) — die Abfrage konnte
    // strukturell NIE eine Zeile liefern. A13 war damit eine Tautologie: eine
    // Abbruchregel, die nie ausloest, ist keine Abbruchregel.
    //
    // GEMESSEN WIRD JETZT DIE ECHTE DUBLETTENKLASSE: dieselbe fachliche Arbeit
    // unter VERSCHIEDENEN Schluesseln. Der Schluessel entsteht aus Aufgabentyp,
    // normalisierter Suchdefinition, Quellenkontext und Aktualitaetsfenster —
    // zwei minimal abweichende Normalisierungen ergeben zwei Schluessel und
    // damit zwei Auftraege fuer dieselbe Arbeit. Gruppiert wird deshalb ueber
    // (Aufgabentyp, Mandant, Aktualitaetsfenster), nicht ueber den Schluessel.
    "  -- Dubletten: dieselbe fachliche Arbeit MEHRFACH abgeschlossen (verschiedene",
    "  -- Idempotenzschluessel, gleicher Aufgabentyp/Mandant/Aktualitaetsfenster).",
    "  coalesce((",
    "    select count(*) from (",
    "      select job_type, tenant_id, freshness_window from helmut_jobs",
    `      where finished_at >= '${seitIso}' and status = 'erledigt' and tenant_id is not null`,
    "      group by job_type, tenant_id, freshness_window having count(*) > 1",
    "    ) d", "  ), 0) as \"dubletten\"",
    "from helmut_jobs;",
    "",
    "-- 2 · KOSTEN: der atomare Tageszaehler (nicht der verlustbehaftete Blob-Ring)",
    "select coalesce(sum(used), 0) as \"aufrufeHeute\"",
    "from llm_budget_counters",
    "where day = to_char(now() at time zone 'utc','YYYY-MM-DD') and scope = 'global';",
    "",
    "-- 3 · MODELLAUFRUFE: unbekannte Arbeitsformen und Drosselungen",
    "--",
    "-- ACHTUNG (korrigiert 02.09., adversariales Diff-Review, bestaetigter Befund):",
    "-- Dieser Block liest `public.llm_usage`. Diese Tabelle ist LEER, solange",
    "-- HELMUT_LLM_USAGE_RELATIONAL aus ist ODER die Migration 20260902121500",
    "-- nicht angewendet wurde — beides ist der Zustand dieses Sprints. Wer den",
    "-- Block dann ausfuehrt, bekommt 0/0 und haelt es fuer 'keine unbekannten",
    "-- Aufrufe, keine Drosselung'. Das ist genau der Fehlschluss K4 des",
    "-- Sicherheitsrahmens: eine leere Quelle ist kein gruener Befund.",
    "--",
    "-- DESHALB: `quellen.modellaufrufe.relationalAktiv` MUSS mit uebergeben werden.",
    "-- Ohne `relationalAktiv === true` erzeugt `baueBeobachtungen` KEINE Zahl, und",
    "-- A01/A06 bleiben ausdruecklich UNBEWERTBAR statt gruen. Solange die",
    "-- relationale Ablage aus ist, ist die Ersatzquelle helmut_store.data.llmUsage",
    "-- (Blob) — die dann von Hand ausgezaehlt und als Zahl uebergeben wird.",
    "select",
    "  count(*) filter (where call_type is null or call_type = 'unknown') as \"unbekannteModellaufrufe\",",
    "  count(*) filter (where error like '%429%') as \"drosselungen\"",
    `from llm_usage where created_at >= '${seitIso}';`,
    "",
    "-- 4 · REALE MANDATE: unveraendert gegenueber der Grundlinie?",
    "select",
    `  (select count(*) from mandate_profiles where user_id not like '${PRAEFIX}-%') as "realeGesamt",`,
    `  (select count(*) from mandate_profiles where user_id not like '${PRAEFIX}-%' and aktiv is true) as "realeAktiv",`,
    `  (select count(*) from mandate_profiles where user_id not like '${PRAEFIX}-%' and geloescht_at is not null) as "realeGeloescht";`,
    ""
  ].join("\n");
}

// Bildet die erhobenen Zahlen auf die Beobachtungsgrößen ab. Jede Quelle ist
// EINGABE; dieses Modul erhebt nichts selbst.
//
//   warteschlange   { haengendeLeases, dubletten }              (SQL 1)
//   kosten          { aufrufeHeute, preisJeAufrufUsd }          (SQL 2 + Preis)
//   modellaufrufe   { unbekannteModellaufrufe, drosselungen }   (SQL 3)
//   realeMandate    { gesamt, aktiv, geloescht }                (SQL 4)
//   grundlinie      { realeMandate, realeMandateAktiv, realeMandateGeloescht }
//   laufbilanz      { verarbeitet, fehlgeschlagen, vollstaendig }
//   drain           { rueckstandWachstum }
//   riegel          { durchgelassen }
//   deployment      { githubCommitSha }
//   startfenster    Ergebnis von pruefeStartfenster()
//   tagesplan       Ergebnis von llm-budget-fair.tagesplan()
//   laufzeitMinuten Betreibereingabe
function baueBeobachtungen({
  warteschlange = null,
  kosten = null,
  modellaufrufe = null,
  realeMandate = null,
  grundlinie = null,
  laufbilanz = null,
  drain = null,
  riegel = null,
  deployment = null,
  startfenster = null,
  tagesplan = null,
  laufzeitMinuten = null
} = {}) {
  const b = {};
  const setze = (name, wert) => { if (wert !== undefined) b[name] = wert; };

  setze("haengendeLeases", zahl(warteschlange && warteschlange.haengendeLeases));
  setze("dubletten", zahl(warteschlange && warteschlange.dubletten));

  // Kosten = Aufrufe × bestätigter Preis. FEHLT DER PREIS, FEHLT DIE ZAHL —
  // eine Kostenkontrolle ohne Preisbasis wäre eine Rechnung ohne Rechnung.
  const aufrufe = zahl(kosten && kosten.aufrufeHeute);
  const preis = zahl(kosten && kosten.preisJeAufrufUsd);
  if (aufrufe !== undefined && preis !== undefined) {
    setze("kostenBisherUsd", Math.round(aufrufe * preis * 1000000) / 1000000);
  }

  // A01/A06 — VERSCHÄRFT 02.09. (zweiter Reviewbefund): Die vorige Fassung
  // akzeptierte ein von Hand gesetztes `blobAusgezaehlt: true` — also die
  // BEHAUPTUNG eines Menschen, gezählt zu haben. Eine Abbruchregel, deren
  // Messwert aus einer Zusage stammt, ist keine Abbruchregel.
  //
  // Verlangt wird jetzt das ERGEBNIS eines reproduzierbaren Auswerters:
  // `funktionstest-nachweise.werteNutzungslogAus(...)` rechnet die Zahlen aus
  // dem tatsächlich persistierten Nutzungslog und meldet selbst, ob das Fenster
  // überhaupt abgedeckt ist (`auswertbar`). Ein gekürzter Ringpuffer liefert
  // ausdrücklich KEINE Zahl.
  //
  // `relationalAktiv: true` bleibt als ZWEITE zulässige Herkunft bestehen — für
  // den späteren relationalen Lesepfad, der zwei getrennte Betreiberfreigaben
  // braucht (Migration anwenden UND Flag einschalten).
  const modellAuswerter = modellaufrufe && modellaufrufe.auswertbar === true
    && typeof modellaufrufe.quelle === "string" && modellaufrufe.quelle.length > 0;
  const modellRelational = modellaufrufe && modellaufrufe.relationalAktiv === true;
  if (modellAuswerter || modellRelational) {
    setze("unbekannteModellaufrufe", zahl(modellaufrufe.unbekannteModellaufrufe));
    setze("drosselungen", zahl(modellaufrufe.drosselungen));
  }

  // A09 misst die ABWEICHUNG gegen die Grundlinie — nicht den Bestand.
  if (realeMandate && grundlinie) {
    const g = zahl(realeMandate.gesamt);
    const a = zahl(realeMandate.aktiv);
    const l = zahl(realeMandate.geloescht);
    const gg = zahl(grundlinie.realeMandate);
    const ga = zahl(grundlinie.realeMandateAktiv);
    const gl = zahl(grundlinie.realeMandateGeloescht);
    if ([g, a, l, gg, ga, gl].every((x) => x !== undefined)) {
      setze("realeMandateVeraendert",
        Math.abs(g - gg) + Math.abs(a - ga) + Math.abs(l - gl));
    }
  }

  const verarbeitet = zahl(laufbilanz && laufbilanz.verarbeitet);
  const fehlgeschlagen = zahl(laufbilanz && laufbilanz.fehlgeschlagen);
  setze("verarbeiteteVorgaenge", verarbeitet);
  if (verarbeitet !== undefined && fehlgeschlagen !== undefined) {
    // Ohne verarbeitete Vorgänge gibt es keine Quote — und 0/0 ist NICHT 0.
    if (verarbeitet > 0) setze("fehlerquote", fehlgeschlagen / verarbeitet);
  }
  setze("bilanzVollstaendig", boolStreng(laufbilanz && laufbilanz.vollstaendig));

  setze("rueckstandWachstum", zahl(drain && drain.rueckstandWachstum));
  // A10 — VERSCHÄRFT 02.09. (zweiter Reviewbefund): Die vorige Fassung
  // akzeptierte `gezaehlt: true`, also wieder eine menschliche Zusage — und der
  // Kommunikationsriegel führt bis heute überhaupt keinen Zähler.
  //
  // Verlangt wird jetzt das Ergebnis von
  // `funktionstest-nachweise.werteKommunikationsspurenAus(...)`. Das zählt nicht
  // Riegelentscheidungen, sondern die Spuren TATSÄCHLICH erfolgter Versendungen
  // (Auditereignisse der Mailwege, Push-Abos synthetischer Profile). Das ist die
  // stärkere Messung: sie sieht auch einen Versand, der den Riegel UMGANGEN hat
  // — den ein Riegelzähler bauartbedingt nie bemerken könnte.
  //
  // NACHGESCHÄRFT (dritter Reviewbefund): `auswertbar: true` allein genügt NICHT.
  // Der Auswerter kann auswertbar sein und trotzdem nur einen TEIL der Kanäle
  // gesehen haben (etwa wenn Push-Ereignisse oder das Job-Ausgangspostfach nicht
  // übergeben wurden). Eine 0 aus einer halben Erhebung ist genau das falsche
  // Grün, das A10 verhindern soll. Verlangt wird deshalb zusätzlich
  // `vollstaendig === true`.
  const riegelAuswerter = riegel && riegel.auswertbar === true
    && riegel.vollstaendig === true
    && typeof riegel.quelle === "string" && riegel.quelle.length > 0;
  if (riegelAuswerter) {
    setze("kommunikationsversuche", zahl(riegel.kommunikationsversuche));
  }
  setze("productionCommit", textStreng(deployment && deployment.githubCommitSha));
  setze("laufzeitMinuten", zahl(laufzeitMinuten));

  // A12 — KORRIGIERT 02.09. (adversariales Diff-Review, bestätigter Befund):
  // Gelesen wurde allein `konflikte.length`. Ein NICHT BEWERTBARER Befund
  // (`startErlaubt: false`, `grund: "startfenster-unvollstaendig"`, konflikte
  // leer) wurde damit zur gemessenen 0 und sah frei aus. Ebenso ein Befund, der
  // gegen eine leere Cronliste gerechnet wurde.
  if (startfenster && typeof startfenster === "object" && Array.isArray(startfenster.konflikte)) {
    const gepruefteCrons = Number.isFinite(startfenster.gepruefteCrons) ? startfenster.gepruefteCrons : 0;
    if (gepruefteCrons > 0 && typeof startfenster.startErlaubt === "boolean") {
      // Ein gesperrtes Fenster ohne benannten Konflikt zählt als EIN Konflikt —
      // „nicht erlaubt" darf nie als 0 Konflikte durchgehen.
      setze("fensterKonflikte", startfenster.startErlaubt === true
        ? startfenster.konflikte.length
        : Math.max(1, startfenster.konflikte.length));
    }
  }

  // A14: wie viele REALE Mandate haben heute keine notwendige Arbeit bekommen?
  if (tagesplan && tagesplan.klassen && tagesplan.zuteilung) {
    const kl = tagesplan.klassen;
    if (typeof kl.realeVollstaendigBedient === "boolean" && typeof kl.real === "number") {
      // Genau zählen statt schätzen: ein Mandat ohne notwendige Zuteilung ist
      // verdrängt. Die Klassenbilanz sagt nur „alle oder nicht alle".
      const mandatsklasse = require("./mandatsklasse");
      const realeIds = Object.keys(tagesplan.zuteilung)
        .filter((id) => !mandatsklasse.istSynthetischeKennung(id));
      const ohne = realeIds
        .filter((id) => {
          const z = tagesplan.zuteilung[id];
          return !z || (Number(z.notwendig) || 0) < 1;
        }).length;
      // KORRIGIERT 02.09. (adversariales Diff-Review, bestätigter Befund):
      // Fehlten die realen Mandate in der Zuteilung VOLLSTÄNDIG — also der Fall
      // der TOTALEN Verdrängung, den A14 gerade fangen soll —, war `ohne` 0 und
      // damit ununterscheidbar von „alles in Ordnung". Ein reales Mandat, das
      // gar nicht erst in der Zuteilung auftaucht, ist verdrängt, nicht bedient.
      const fehlend = Math.max(0, kl.real - realeIds.length);
      setze("realeMandateOhneZuteilung", ohne + fehlend);
    }
  }

  return b;
}

// Die Stufenkontrolle. Wirft nie; antwortet immer vollständig — und ist
// FAIL CLOSED: eine Regel ohne Messwert bricht ab wie eine ausgelöste Regel.
function kontrolliere({ stufe = null, quellen = {}, grenzen = {} } = {}) {
  const beobachtungen = baueBeobachtungen(quellen);
  const befund = funktionstest.pruefeAbbruch({ beobachtungen, grenzen });
  const fehlend = funktionstest.ABBRUCHREGELN
    .map((r) => r.beobachtung)
    .filter((name) => !Object.prototype.hasOwnProperty.call(beobachtungen, name));
  return Object.freeze({
    stufe: stufe ? String(stufe) : null,
    bestanden: befund.abbrechen === false,
    abbrechen: befund.abbrechen,
    beobachtungen: Object.freeze({ ...beobachtungen }),
    fehlendeMesswerte: Object.freeze(fehlend),
    herkunftFehlender: Object.freeze(fehlend.map((name) => ({ messwert: name, quelle: HERKUNFT[name] || "unbekannt" }))),
    befunde: befund.befunde,
    ausgeloest: befund.ausgeloest,
    nichtBewertbar: befund.nichtBewertbar,
    meldung: befund.abbrechen
      ? `Stufe${stufe ? ` ${stufe}` : ""} NICHT bestanden — ${befund.meldung}`
      : `Stufe${stufe ? ` ${stufe}` : ""} bestanden: alle ${befund.befunde.length} Abbruchregeln bewertet und eingehalten.`
  });
}

module.exports = {
  HERKUNFT,
  erhebungsSql,
  baueBeobachtungen,
  kontrolliere
};
