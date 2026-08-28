"use strict";

// Helmut — lokaler Vertrag fuer den isolierten Supabase Nachweis Z3b.
// ============================================================================
// Diese Datei fuehrt nichts aus. Sie enthaelt nur die fest verdrahtete
// Zielgrenze, die spaeter getrennt freizugebende Migrationsreihenfolge und
// offensichtlich synthetische Laufdaten.

const PRODUCTION_PROJECT_REF = "ddckuvvpcytqbyfmbvie";
const TEST_PROJECT_REF = "ffzaxdbatoamsovncrym";
const TEST_PROJECT_URL = `https://${TEST_PROJECT_REF}.supabase.co`;
const STRATEGISCHE_ZIELSTUFEN = Object.freeze([10, 25, 50, 100, 200, 500]);
const MESSSTUFEN = Object.freeze([5, 25, 50, 100, 200, 500]);
const NEUE_MESSSTUFEN = Object.freeze([200, 500]);

// Die Warteschlange ist fuer die fehlenden Plattformwerte ausreichend. Das
// gesamte Helmut Schema und damit auch bereits abgeschlossene Fachtests werden
// bewusst nicht noch einmal aufgebaut.
const MIGRATIONSGRUPPEN = Object.freeze({
  basis: Object.freeze([
    Object.freeze({
      vorwaerts: "20260808_scalable_job_queue.sql",
      rueckweg: "20260808_scalable_job_queue_rollback.sql"
    }),
    Object.freeze({
      vorwaerts: "20260808_jobqueue_abhaengigkeiten.sql",
      rueckweg: "20260808_jobqueue_abhaengigkeiten_rollback.sql"
    }),
    Object.freeze({
      vorwaerts: "20260812_jobqueue_altersmessung.sql",
      rueckweg: "20260812_jobqueue_altersmessung_rollback.sql"
    })
  ]),
  ankunft: Object.freeze([
    Object.freeze({
      vorwaerts: "20260825101500_jobqueue_ankunftskennzahl.sql",
      rueckweg: "rollback_20260825101500_jobqueue_ankunftskennzahl.sql"
    })
  ]),
  z22: Object.freeze([
    Object.freeze({
      vorwaerts: "20260826190000_jobqueue_vorbedingung_mandatsfilter.sql",
      rueckweg: "rollback_20260826190000_jobqueue_vorbedingung_mandatsfilter.sql"
    })
  ])
});

// Diese Zahlen sind ausschliesslich Referenzen aus dem abgeschlossenen Z3a
// Nachweis. Sie werden nicht als neuer Beleg ausgegeben und loesen keinen
// erneuten Fachlauf aus. Der spaetere Z3b Lauf misst nur den Supabase Netzweg.
const Z3A_REFERENZEN = Object.freeze([
  Object.freeze({ mandate: 5, httpAnfragen: 4992, gleichzeitigMax: 151 }),
  Object.freeze({ mandate: 25, httpAnfragen: 20240, gleichzeitigMax: 349 }),
  Object.freeze({ mandate: 50, httpAnfragen: 42566, gleichzeitigMax: 900 }),
  Object.freeze({ mandate: 100, httpAnfragen: 73789, gleichzeitigMax: 1435 })
]);

// Die echte Supabase Probe bleibt absichtlich klein. Bis 100, 200 und 500 sind
// getrennte Freigabepakete. Der naechste groessere Schritt startet nie
// automatisch. Die Parallelitaet bleibt bei allen Stufen gleich hart begrenzt.
const GEMEINSAME_PROBEGRENZEN = Object.freeze({
  parallelitaet: Object.freeze([4, 8, 16, 32]),
  wiederholungenMax: 0,
  stopNach429InFolge: 2,
  stopNach5xxInFolge: 2
});

const PROBEPROFILE = Object.freeze({
  bis100: Object.freeze({
    mandate: Object.freeze([5, 25, 50, 100]),
    synthetischeAuftraegeMax: 250,
    anfragenGesamtMax: 1000
  }),
  stufe200: Object.freeze({
    mandate: Object.freeze([200]),
    synthetischeAuftraegeMax: 200,
    anfragenGesamtMax: 500
  }),
  stufe500: Object.freeze({
    mandate: Object.freeze([500]),
    synthetischeAuftraegeMax: 500,
    anfragenGesamtMax: 1250
  })
});

const SYNTHETISCHE_AUFTRAEGE_MAX = Math.max(
  ...Object.values(PROBEPROFILE).map((profil) => profil.synthetischeAuftraegeMax)
);

function probeprofilFuerMandate(mandate) {
  return Object.values(PROBEPROFILE).find((profil) => profil.mandate.includes(mandate)) || null;
}

function projektRefAusUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    throw new Error("Z3b Ziel abgelehnt: ungueltige Supabase URL");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password
      || parsed.port || (parsed.pathname !== "/" && parsed.pathname !== "")
      || parsed.search || parsed.hash) {
    throw new Error("Z3b Ziel abgelehnt: erwartet wird nur die HTTPS Basis URL");
  }
  const treffer = parsed.hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
  if (!treffer) throw new Error("Z3b Ziel abgelehnt: keine Supabase Projekt URL");
  return treffer[1];
}

function pruefeTestprojekt({ projektRef, url }) {
  const ref = String(projektRef || "").trim();
  const urlRef = projektRefAusUrl(url);
  if (ref === PRODUCTION_PROJECT_REF || urlRef === PRODUCTION_PROJECT_REF) {
    throw new Error("Z3b Ziel abgelehnt: Production ist gesperrt");
  }
  if (ref !== TEST_PROJECT_REF || urlRef !== TEST_PROJECT_REF || url !== TEST_PROJECT_URL) {
    throw new Error("Z3b Ziel abgelehnt: nur das festgelegte Testprojekt ist erlaubt");
  }
  return Object.freeze({ projektRef: ref, url: TEST_PROJECT_URL });
}

function erzeugeSynthetischeAuftraege({ mandate, anzahl, laufKennung }) {
  if (!Number.isInteger(mandate) || !MESSSTUFEN.includes(mandate)) {
    throw new Error(`Mandatszahl muss eine freigeplante Messstufe sein: ${MESSSTUFEN.join(", ")}`);
  }
  const profil = probeprofilFuerMandate(mandate);
  if (!profil || !Number.isInteger(anzahl) || anzahl < mandate || anzahl > profil.synthetischeAuftraegeMax) {
    throw new Error(`Auftragszahl muss zwischen der Mandatszahl und ${profil ? profil.synthetischeAuftraegeMax : 0} liegen`);
  }
  const lauf = String(laufKennung || "").trim();
  if (!/^[a-z0-9]{6,32}$/.test(lauf)) {
    throw new Error("Laufkennung muss 6 bis 32 Kleinbuchstaben oder Ziffern enthalten");
  }

  return Array.from({ length: anzahl }, (_, index) => {
    const nr = String(index).padStart(4, "0");
    const mandatNr = String(index % mandate).padStart(4, "0");
    return Object.freeze({
      p_job_type: "source_fetch",
      p_idempotency_key: `z3b:${lauf}:${mandate}:${nr}`,
      p_freshness_window: `z3b:${lauf}:${mandate}`,
      p_payload: Object.freeze({ z3b: true, synthetisch: true, nummer: index }),
      p_due_at: "1970-01-01T00:00:00.000Z",
      p_priority: 100,
      p_max_attempts: 2,
      p_tenant_id: `z3b-synth-mandat-${mandatNr}`
    });
  });
}

module.exports = {
  PRODUCTION_PROJECT_REF,
  TEST_PROJECT_REF,
  TEST_PROJECT_URL,
  STRATEGISCHE_ZIELSTUFEN,
  MESSSTUFEN,
  NEUE_MESSSTUFEN,
  MIGRATIONSGRUPPEN,
  Z3A_REFERENZEN,
  GEMEINSAME_PROBEGRENZEN,
  PROBEPROFILE,
  SYNTHETISCHE_AUFTRAEGE_MAX,
  probeprofilFuerMandate,
  projektRefAusUrl,
  pruefeTestprojekt,
  erzeugeSynthetischeAuftraege
};
