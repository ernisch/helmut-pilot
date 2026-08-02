"use strict";

// Mutationsprobe zum Persistenzvertrag der Fairnesszeile (F-CAS).
// ================================================================================
// Ein gruener Vertrag beweist nichts, solange nicht gezeigt ist, dass er auch ROT
// werden kann. Jede Mutation nimmt GENAU EINE Schutzbedingung dieses Fix-Sprints in
// der PRODUKTIONSDATEI zurueck — die erste stellt exakt den Fehler wieder her, der
// am 2026-08-02 in Production zum verlorenen Abschluss gefuehrt hat. Die Probe ist
// nur gruen, wenn scripts/cron-fairness-persistenz-test.js JEDE Ruecknahme bemerkt.
//
// Arbeitsweise: gemeinsames Geruest scripts/e2e-mutationsprobe-geruest.js —
// vollstaendiger Abzug je Mutation, Arbeitskopie unangetastet, eindeutige Anker,
// Referenzlauf muss gruen sein.

const { fuehreMutationsprobe } = require("./e2e-mutationsprobe-geruest");

fuehreMutationsprobe({
  titel: "Fairness-Persistenz-Mutationsprobe (F-CAS)",
  suite: "cron-fairness-persistenz-test.js",
  // server.js und vercel.json werden von der Suite nur GELESEN (Quelltext- und
  // Grenzvertrag), supabase/migrations nur aufgelistet.
  zusatzdateien: ["server.js", "vercel.json"],
  zusatzverzeichnisse: ["supabase/migrations"],
  mutationen: [
    {
      name: "M1: der Schreibvorgang ist wieder unbedingt (der Vorfall selbst)",
      beschreibung: "Das bedingte Update wird zum unbedingten Upsert zurueckgebaut — ein ueberlappender Cron kann den Abschluss eines anderen Laufs wieder loeschen, ohne Fehler und ohne Signal.",
      datei: "lib/helmut/storage.js",
      von: "  const bedingung = rev === null ? \"data-%3E%3Erev=is.null\" : `data-%3E%3Erev=eq.${rev}`;",
      nach: "  const bedingung = \"id=not.is.null\"; // Bedingung entfernt (Mutation)"
    },
    {
      name: "M2: ein Konflikt wird als Erfolg gewertet",
      beschreibung: "Das Ergebnis des Vergleichs wird ignoriert — ein abgewiesenes Update gilt als geschrieben, der Patch geht verloren und niemand wiederholt ihn.",
      datei: "lib/helmut/storage.js",
      von: "  return Array.isArray(zeilen) && zeilen.length > 0;",
      nach: "  return true; // Konflikt wird verschluckt (Mutation)"
    },
    {
      name: "M3: der Zaehler wird nicht fortgeschrieben",
      beschreibung: "Die Zeile behaelt ihren alten Stand des Zaehlers — die Bedingung trifft danach immer, und zwei Schreiber koennen einander wieder ueberholen.",
      datei: "lib/helmut/storage.js",
      von: "      const geschrieben = { ...merged, rev: (aktuell.rev === null ? 0 : aktuell.rev) + 1 };",
      nach: "      const geschrieben = { ...merged, rev: aktuell.rev === null ? 0 : aktuell.rev };"
    },
    {
      name: "M4: das Anlegen der Zeile ueberschreibt einen fremden Stand",
      beschreibung: "Der Konflikt beim gleichzeitigen Anlegen wird wieder zum Upsert — der zuerst angelegte Stand eines anderen Laufs waere ueberschrieben.",
      datei: "lib/helmut/storage.js",
      von: "        headers: { Prefer: \"return=minimal\" },\n        body: JSON.stringify({ id, data: daten })",
      nach: "        headers: { Prefer: \"resolution=merge-duplicates,return=minimal\" },\n        body: JSON.stringify({ id, data: daten })"
    },
    {
      name: "M5: der verspaetete Versuchsvermerk darf den Abschluss wieder zurueckdrehen",
      beschreibung: "Die Rueckfallschranke in mergeEntry faellt weg — ein spaeter eintreffender Claim DESSELBEN Laufs setzt einen persistierten Abschluss wieder auf 'laufend'.",
      datei: "lib/helmut/cron-fairness.js",
      von: "  if (!endzustand(lead.status) && endzustand(unterlegen.status) && !echtNeuerer(lead, unterlegen)) {",
      nach: "  if (false) {"
    },
    {
      name: "M6: die Gegenprobe am Laufende entfaellt",
      beschreibung: "Der Vergleich zwischen gemeldeter und persistierter Wahrheit wird abgeklemmt — ein Lauf koennte wieder 'erfolgreich=6' melden, waehrend die Ablage nur fuenf Abschluesse traegt.",
      datei: "lib/helmut/cron-fairness.js",
      von: "  const persistenzAbweichung = fair && abschluss.ok && abschluss.remote",
      nach: "  const persistenzAbweichung = false && abschluss.ok && abschluss.remote"
    },
    {
      name: "M7: die Abweichung wird nicht mehr gemeldet",
      beschreibung: "Die festgestellte Abweichung landet weder im Zustandsfehler noch in der Ablage — sie waere erkannt, aber still.",
      datei: "lib/helmut/cron-fairness.js",
      von: "  if (persistenzAbweichung.length) {",
      nach: "  if (false && persistenzAbweichung.length) {"
    },
    {
      name: "M8: die Gegenprobe uebersieht einen fehlenden Abschluss",
      beschreibung: "Die Ausgangspruefung faellt weg — ein Mandat, das im Laufdatensatz auf 'begonnen' steht, obwohl der Lauf es als Erfolg meldet, bliebe unbemerkt.",
      datei: "lib/helmut/cron-fairness.js",
      von: "    if (!istErfolg.has(tenantId)) abweichungen.push(`ausgang:${tenantId}:${lauf.ausgaenge[tenantId] || \"-\"}`);\n    const eintrag = entryOf(normalized, cronName, tenantId);",
      nach: "    const eintrag = entryOf(normalized, cronName, tenantId);"
    },
    {
      name: "M9: die Gegenprobe uebersieht die fehlende Mandatsbuchfuehrung",
      beschreibung: "Der Abgleich zwischen Laufdatensatz und Buchfuehrung entfaellt — beide duerften wieder auseinanderlaufen (Kriterium 4).",
      datei: "lib/helmut/cron-fairness.js",
      von: "    else if ((!runId || eintrag.letzteLaufkennung === runId) && eintrag.status !== STATUS_ERFOLG) {",
      nach: "    else if (false) {"
    },
    {
      name: "M10: die DSGVO-Loeschung schreibt wieder unbedingt",
      beschreibung: "Der zweite Schreiber auf derselben Zeile verliert seine Bedingung — eine Loeschung koennte den Fortschritt eines laufenden Crons entfernen oder umgekehrt.",
      datei: "lib/helmut/storage.js",
      von: "      const gesetzt = useSupabase()\n        ? await schreibeCronFairnessZeile(request, geschrieben, aktuell)\n        : schreibeCronFairnessDatei(geschrieben, aktuell);\n      if (gesetzt) return { ok: true, entfernt: true };",
      nach: "      if (useSupabase()) await request(\"/rest/v1/helmut_store\", { method: \"POST\", headers: { Prefer: \"resolution=merge-duplicates,return=minimal\" }, body: JSON.stringify({ id: cronFairnessRowId(), data: geschrieben }) });\n      return { ok: true, entfernt: true };"
    },
    {
      name: "M11: der Wettlauf laeuft wieder endlos statt ehrlich aufzugeben",
      beschreibung: "Ein dauerhafter Konflikt wird nicht mehr als Fehler gemeldet — der Aufrufer haelt einen nie geschriebenen Patch fuer geschrieben.",
      datei: "lib/helmut/storage.js",
      von: "        letzterFehler = \"gleichzeitiger-schreibvorgang\";\n        continue;",
      nach: "        return { ok: true, state: merged, gelesen: true, versuche: versuch };"
    }
  ]
});
