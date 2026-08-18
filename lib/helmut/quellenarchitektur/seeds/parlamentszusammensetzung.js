"use strict";

// Helmut — Quellenarchitektur · EXTERNE fachliche Sollmenge: Zusammensetzung der Parlamente,
// auf die sich Paketanforderungen berufen.
//
// WARUM DIESE DATEI EXISTIERT
// ---------------------------
// Zwei Paketanforderungen waren zuvor **katalogrelativ** oder nur als Freitext begruendet:
//
//   1. "alle Fraktionen" (bund-basis) — die Sollmenge wurde aus dem Katalog abgeleitet und dann
//      gegen den Katalog geprueft. Dasselbe Fehlermuster wie bei den Ausschuessen (23 statt 24).
//      Gemessen wurde "8 von 8"; der Katalog fuehrte aber FDP, BSW und SSW als Fraktionen mit,
//      obwohl FDP und BSW im 21. Bundestag ueberhaupt nicht vertreten sind und der SSW mit einem
//      Mandat keinen Fraktionsstatus hat. Fachlich richtig sind **5 Fraktionen**.
//   2. "fachlich nicht anwendbar" (die-linke-brandenburg) — die Begruendung stand nur als
//      Freitext im Anforderungsobjekt. Sie war damit nicht ueberpruefbar: niemand haette
//      gemerkt, wenn eine echte Quellenluecke als "nicht anwendbar" getarnt worden waere.
//
// Diese Datei liefert fuer beides eine PRUEFBARE Grundlage: welche Fraktionen und Gruppen ein
// Parlament in einer Wahlperiode tatsaechlich hat. Sie wird NICHT aus dem Katalog abgeleitet;
// der Katalog und die Paketanforderungen werden gegen sie geprueft.
//
// REINE DATEN. Kein Netz, keine KI, kein Storage-Zugriff. Die Datei wird NICHT automatisch
// aktualisiert: ein Wahlperiodenwechsel ist eine bewusste, belegpflichtige Pflege (und macht die
// Pruefungen bis dahin rot — das ist gewollt).

// --- Bundestag, 21. Wahlperiode ---------------------------------------------
// Grundlage: amtliche Sitzverteilung des 21. Deutschen Bundestages (630 Sitze) —
//   bundestag.de/parlament/plenum/sitzverteilung
//   bundestag.de/dokumente/textarchiv/2025/kw09-wahlergebnis-1049580
//     ("CDU/CSU wird staerkste Fraktion im neuen Bundestag")
// CDU 164 + CSU 44 = 208 · AfD 152 · SPD 120 · Buendnis 90/Die Gruenen 85 · Die Linke 64 ·
// SSW 1 = 630. Die Sitzzahlen sind der Stand der Konstituierung; Fraktionswechsel aendern sie,
// nicht aber die Menge der Fraktionen — deshalb ist `sitze` nur dokumentarisch und wird NICHT
// als Zusicherung geprueft.
const BUNDESTAG_21 = Object.freeze({
  parlament: "bundestag",
  name: "Deutscher Bundestag",
  wahlperiode: 21,
  sitze: 630,
  grundlage: "Amtliche Sitzverteilung des 21. Deutschen Bundestages (630 Sitze)",
  belege: Object.freeze([
    "bundestag.de/parlament/plenum/sitzverteilung",
    "bundestag.de/dokumente/textarchiv/2025/kw09-wahlergebnis-1049580"
  ]),
  // Parlamentarische Zusammenschluesse MIT Fraktionsstatus. Die Bezeichnungen sind die
  // Plenarbezeichnungen der amtlichen Sitzverteilung.
  fraktionen: Object.freeze([
    { key: "cdu-csu", name: "CDU/CSU", typ: "fraktion", sitze: 208, beleg: "Sitzverteilung 21. WP (CDU 164 + CSU 44)" },
    { key: "afd", name: "AfD", typ: "fraktion", sitze: 152, beleg: "Sitzverteilung 21. WP" },
    { key: "spd", name: "SPD", typ: "fraktion", sitze: 120, beleg: "Sitzverteilung 21. WP" },
    { key: "gruene", name: "Bündnis 90/Die Grünen", typ: "fraktion", sitze: 85, beleg: "Sitzverteilung 21. WP" },
    { key: "linke", name: "Die Linke", typ: "fraktion", sitze: 64, beleg: "Sitzverteilung 21. WP" }
  ]),
  // Mandate OHNE Fraktionsstatus. Bewusst getrennt gefuehrt, damit sie nicht versehentlich in
  // die Fraktionszaehlung geraten (genau das war der Fehler der Alt-Zaehlung "8 von 8").
  ohneFraktionsstatus: Object.freeze([
    {
      key: "ssw", name: "SSW (Südschleswigscher Wählerverband)", typ: "ohne_fraktionsstatus", sitze: 1,
      grund: "Ein Mandat. Als Partei der daenischen und friesischen Minderheit von der Fuenf-Prozent-Huerde befreit, aber mit einem Sitz ohne Fraktionsstatus.",
      beleg: "Sitzverteilung 21. WP (1 Sitz SSW)"
    }
  ]),
  // Parteien, die im 21. Bundestag NICHT vertreten sind. Fuer Negativkontrollen: ein
  // Katalogeintrag, der eine dieser Parteien als Fraktion fuehrt, ist ein Befund.
  nichtVertreten: Object.freeze([
    { key: "fdp", name: "FDP", ergebnis: "4,3 %", grund: "Fuenf-Prozent-Huerde nicht erreicht", beleg: "bundestag.de/dokumente/textarchiv/2025/kw09-wahlergebnis-1049580" },
    { key: "bsw", name: "BSW", ergebnis: "4,97 %", grund: "Fuenf-Prozent-Huerde nicht erreicht", beleg: "bundestag.de/dokumente/textarchiv/2025/kw09-wahlergebnis-1049580" }
  ]),
  // Gruppen (Zusammenschluesse ohne Fraktionsstatus nach § 10 Abs. 4 GO-BT) existieren in der
  // 21. WP nicht: die Sitzverteilung weist alle 630 Sitze den 5 Fraktionen und EINEM
  // SSW-Mandat zu. Ein einzelnes Mandat kann keine Gruppe bilden. Abgeleitet aus der
  // Sitzverteilung, nicht separat zitiert — deshalb ausdruecklich als Ableitung markiert.
  gruppen: Object.freeze([]),
  gruppenAbleitung: "Aus der Sitzverteilung abgeleitet: 208+152+120+85+64 Fraktionssitze + 1 SSW-Mandat = 630. Fuer eine Gruppe bleibt kein Mandat uebrig."
});

// --- Landtag Brandenburg, 8. Wahlperiode -------------------------------------
// Grundlage: amtliches Endergebnis der Landtagswahl vom 22.09.2024 (Landeswahlleiterin) und
// das Handbuch des Landtags fuer die 8. Wahlperiode.
//   wahlen.brandenburg.de/wahlen/de/pressemitteilungen/detail/~07-10-2024-endgueltiges-ergebnis-ltw-24
//   landtag.brandenburg.de/media_fast/6/Handbuch_lang_Inhalt_2025-web.pdf
//     ("Landtag Brandenburg Namen – Daten – Fakten 8. Wahlperiode 2024 – 2029")
// Konstituierung: SPD 32 · AfD 30 · BSW 14 · CDU 12 = 88. Alle weiteren Landeslisten blieben
// unberuecksichtigt, weil sie weder die Fuenf-Prozent-Huerde ueberwanden noch ein Direktmandat
// gewannen — darunter Die Linke.
const LANDTAG_BRANDENBURG_8 = Object.freeze({
  parlament: "landtag-brandenburg",
  name: "Landtag Brandenburg",
  wahlperiode: 8,
  zeitraum: "2024–2029",
  wahltag: "2024-09-22",
  sitze: 88,
  grundlage: "Amtliches Endergebnis der Landtagswahl 22.09.2024 + Landtagshandbuch 8. Wahlperiode",
  belege: Object.freeze([
    "wahlen.brandenburg.de/wahlen/de/pressemitteilungen/detail/~07-10-2024-endgueltiges-ergebnis-ltw-24",
    "landtag.brandenburg.de/media_fast/6/Handbuch_lang_Inhalt_2025-web.pdf"
  ]),
  fraktionen: Object.freeze([
    { key: "spd", name: "SPD", typ: "fraktion", sitze: 32, beleg: "Endergebnis LTW 2024 / Landtagshandbuch 8. WP" },
    { key: "afd", name: "AfD", typ: "fraktion", sitze: 30, beleg: "Endergebnis LTW 2024 / Landtagshandbuch 8. WP" },
    { key: "bsw", name: "BSW", typ: "fraktion", sitze: 14, beleg: "Endergebnis LTW 2024 / Landtagshandbuch 8. WP" },
    { key: "cdu", name: "CDU", typ: "fraktion", sitze: 12, beleg: "Endergebnis LTW 2024 / Landtagshandbuch 8. WP" }
  ]),
  ohneFraktionsstatus: Object.freeze([]),
  nichtVertreten: Object.freeze([
    {
      key: "linke", name: "Die Linke", ergebnis: "unter 5 %, kein Direktmandat",
      grund: "Alle weiteren Landeslisten blieben unberuecksichtigt, weil sie weder die Fuenf-Prozent-Huerde ueberwanden noch ein Direktmandat gewannen.",
      beleg: "wahlen.brandenburg.de — Endgueltiges Ergebnis LTW 24"
    }
  ]),
  gruppen: Object.freeze([]),
  gruppenAbleitung: "Keine Gruppe im Konstituierungsstand; das Landtagshandbuch der 8. WP fuehrt vier Fraktionen.",
  // Ehrlicher Hinweis: nach Fraktionsaustritten (Januar 2026) gibt es fraktionslose Abgeordnete.
  // Das aendert die MENGE der Fraktionen nicht und ist fuer die Paketanforderung ohne Belang.
  hinweis: "Nach Fraktionsaustritten im Januar 2026 verschieben sich Fraktionsstaerken und es gibt fraktionslose Abgeordnete; die Menge der Fraktionen (4) bleibt unveraendert."
});

// --- Abgeordnetenhaus von Berlin, 19. Wahlperiode ----------------------------
// Grundlage: amtliches Endergebnis der Wiederholungswahl vom 12.02.2023 (Landeswahlleiterin,
// die Hauptwahl vom 26.09.2021 wurde vollstaendig wiederholt) und die Fraktionsuebersicht des
// Abgeordnetenhauses.
//   wahlen-berlin.de/wahlen/be2023/afspraes/agh/ergebnisse.html
//     (endgueltiges Ergebnis: CDU 28,2 % · SPD 18,4 % · Gruene 18,4 % · Die Linke 12,2 % ·
//      AfD 9,1 % · FDP 4,6 %)
//   parlament-berlin.de/das-parlament/fraktionen
// Sitzverteilung nach der Wiederholungswahl (159 Sitze): CDU 52 · SPD 34 ·
// Buendnis 90/Die Gruenen 34 · Die Linke 22 · AfD 17. Die Sitzzahlen sind der Stand der
// Neukonstituierung (16.03.2023); Fraktionsaustritte danach aendern Staerken und erzeugen
// fraktionslose Mitglieder, nicht aber die Menge der Fraktionen — `sitze` bleibt wie bei den
// anderen Parlamenten dokumentarisch und wird NICHT als Zusicherung geprueft.
const ABGEORDNETENHAUS_BERLIN_19 = Object.freeze({
  parlament: "abgeordnetenhaus-berlin",
  name: "Abgeordnetenhaus von Berlin",
  wahlperiode: 19,
  zeitraum: "2021–2026 (Wiederholungswahl 12.02.2023)",
  wahltag: "2023-02-12",
  sitze: 159,
  grundlage: "Amtliches Endergebnis der Wiederholungswahl 12.02.2023 + Fraktionsuebersicht des Abgeordnetenhauses",
  belege: Object.freeze([
    "wahlen-berlin.de/wahlen/be2023/afspraes/agh/ergebnisse.html",
    "parlament-berlin.de/das-parlament/fraktionen"
  ]),
  fraktionen: Object.freeze([
    { key: "cdu", name: "CDU", typ: "fraktion", sitze: 52, beleg: "Endergebnis Wiederholungswahl 2023 / Fraktionsuebersicht AGH" },
    { key: "spd", name: "SPD", typ: "fraktion", sitze: 34, beleg: "Endergebnis Wiederholungswahl 2023 / Fraktionsuebersicht AGH" },
    { key: "gruene", name: "Bündnis 90/Die Grünen", typ: "fraktion", sitze: 34, beleg: "Endergebnis Wiederholungswahl 2023 / Fraktionsuebersicht AGH" },
    { key: "linke", name: "Die Linke", typ: "fraktion", sitze: 22, beleg: "Endergebnis Wiederholungswahl 2023 / Fraktionsuebersicht AGH" },
    { key: "afd", name: "AfD", typ: "fraktion", sitze: 17, beleg: "Endergebnis Wiederholungswahl 2023 / Fraktionsuebersicht AGH" }
  ]),
  ohneFraktionsstatus: Object.freeze([]),
  nichtVertreten: Object.freeze([
    {
      key: "fdp", name: "FDP", ergebnis: "4,6 %",
      grund: "Fuenf-Prozent-Huerde in der Wiederholungswahl 2023 nicht erreicht (bis dahin Fraktion der 19. WP).",
      beleg: "wahlen-berlin.de — endgueltiges Ergebnis der Wiederholungswahl 12.02.2023"
    }
  ]),
  gruppen: Object.freeze([]),
  gruppenAbleitung: "Keine Gruppe im Stand der Neukonstituierung 16.03.2023; die Fraktionsuebersicht des Abgeordnetenhauses fuehrt fuenf Fraktionen.",
  // Zwei ehrliche Hinweise: (1) Nach Fraktionsaustritten gibt es fraktionslose Mitglieder;
  // die Menge der Fraktionen (5) bleibt unveraendert. (2) Die Wahl zum 20. Abgeordnetenhaus
  // ist amtlich auf den 20.09.2026 festgesetzt (Senatsbeschluss 03.06.2025,
  // berlin.de/wahlen/wahlen/berliner-wahlen-2026) — diese Sollmenge gilt nur fuer die 19. WP
  // und macht einen Wahlperiodenwechsel als bewusste, belegpflichtige Pflege sichtbar.
  hinweis: "Nach Fraktionsaustritten gibt es fraktionslose Mitglieder; die Menge der Fraktionen (5) bleibt unveraendert. Wahl zum 20. Abgeordnetenhaus: 20.09.2026 (amtlich festgesetzt)."
});

const PARLAMENTE = Object.freeze({
  "bundestag": BUNDESTAG_21,
  "landtag-brandenburg": LANDTAG_BRANDENBURG_8,
  "abgeordnetenhaus-berlin": ABGEORDNETENHAUS_BERLIN_19
});

function parlament(key) {
  return PARLAMENTE[String(key || "")] || null;
}

// Hat die Partei in diesem Parlament/dieser Wahlperiode eine Fraktion?
// Liefert { bekannt, hatFraktion, hatMandate, eintrag } — `bekannt: false`, wenn das Parlament
// oder die Wahlperiode nicht hinterlegt ist (dann darf NICHTS daraus geschlossen werden).
function fraktionsLage({ parlament: pKey, wahlperiode, partei } = {}) {
  const p = parlament(pKey);
  if (!p) return { bekannt: false, grund: `Parlament '${pKey}' nicht hinterlegt` };
  if (Number(wahlperiode) !== Number(p.wahlperiode)) {
    return { bekannt: false, grund: `Wahlperiode ${wahlperiode} weicht von der hinterlegten (${p.wahlperiode}) ab` };
  }
  const key = String(partei || "").toLowerCase();
  const fraktion = p.fraktionen.find((f) => f.key === key) || null;
  const gruppe = p.gruppen.find((g) => g.key === key) || null;
  const ohne = p.ohneFraktionsstatus.find((o) => o.key === key) || null;
  const nicht = p.nichtVertreten.find((n) => n.key === key) || null;
  return {
    bekannt: true,
    parlament: p.parlament,
    parlamentName: p.name,
    wahlperiode: p.wahlperiode,
    hatFraktion: !!fraktion,
    hatGruppe: !!gruppe,
    hatMandate: !!fraktion || !!gruppe || !!ohne,
    nichtVertreten: !!nicht,
    eintrag: fraktion || gruppe || ohne || nicht || null,
    belege: p.belege
  };
}

// Selbstschutz der Sollmengen: Anzahl, Eindeutigkeit, Typen, Belege, Widerspruchsfreiheit.
function validateSollmenge() {
  const fehler = [];
  for (const p of Object.values(PARLAMENTE)) {
    const alle = [...p.fraktionen, ...p.gruppen, ...p.ohneFraktionsstatus];
    const keys = alle.map((e) => e.key);
    if (new Set(keys).size !== keys.length) fehler.push(`${p.parlament}: doppelte Kennung`);
    const namen = p.fraktionen.map((f) => f.name);
    if (new Set(namen).size !== namen.length) fehler.push(`${p.parlament}: doppelte Fraktionsbezeichnung`);
    if (!Number.isInteger(p.wahlperiode) || p.wahlperiode <= 0) fehler.push(`${p.parlament}: ungueltige Wahlperiode`);
    if (!Array.isArray(p.belege) || p.belege.length < 1) fehler.push(`${p.parlament}: kein Beleg`);
    for (const f of p.fraktionen) {
      if (f.typ !== "fraktion") fehler.push(`${p.parlament}/${f.key}: typ muss 'fraktion' sein`);
      if (!f.key || !/^[a-z0-9-]+$/.test(f.key)) fehler.push(`${p.parlament}/${f.key}: ungueltige Kennung`);
      if (!f.name || !f.beleg) fehler.push(`${p.parlament}/${f.key}: Bezeichnung oder Beleg fehlt`);
    }
    for (const g of p.gruppen) {
      if (g.typ !== "gruppe") fehler.push(`${p.parlament}/${g.key}: typ muss 'gruppe' sein`);
    }
    // Widerspruchsfreiheit: eine Partei kann nicht gleichzeitig Fraktion und nicht vertreten sein.
    for (const n of p.nichtVertreten) {
      if (p.fraktionen.some((f) => f.key === n.key)) fehler.push(`${p.parlament}/${n.key}: als Fraktion UND als nicht vertreten gefuehrt`);
      if (p.gruppen.some((g) => g.key === n.key)) fehler.push(`${p.parlament}/${n.key}: als Gruppe UND als nicht vertreten gefuehrt`);
      if (p.ohneFraktionsstatus.some((o) => o.key === n.key)) fehler.push(`${p.parlament}/${n.key}: ohne Fraktionsstatus UND nicht vertreten`);
      if (!n.beleg || !n.grund) fehler.push(`${p.parlament}/${n.key}: Beleg oder Grund fehlt`);
    }
    for (const o of p.ohneFraktionsstatus) {
      if (o.typ !== "ohne_fraktionsstatus") fehler.push(`${p.parlament}/${o.key}: typ muss 'ohne_fraktionsstatus' sein`);
      if (!o.grund || !o.beleg) fehler.push(`${p.parlament}/${o.key}: Grund oder Beleg fehlt`);
    }
    if (!p.gruppen.length && !p.gruppenAbleitung) fehler.push(`${p.parlament}: leere Gruppenliste ohne Ableitungsbegruendung`);
  }
  return { ok: fehler.length === 0, fehler };
}

// Vergleich einer IST-Menge (aus dem Quellenkatalog) gegen die Fraktions-Sollmenge EINES
// Parlaments. `ist`: [{ key, name, typ }]. Eine Umbenennung erscheint als `abweichenderName`,
// ein falsch typisierter Eintrag als `abweichenderTyp` — nie als bloßer Zahlengleichstand.
function vergleicheFraktionen(pKey, ist = []) {
  const p = parlament(pKey);
  if (!p) return { bekannt: false, vollstaendig: false, grund: `Parlament '${pKey}' nicht hinterlegt` };
  const istListe = (Array.isArray(ist) ? ist : []).filter(Boolean);
  const sollByKey = new Map(p.fraktionen.map((f) => [f.key, f]));
  const istByKey = new Map();
  const doppelt = [];
  for (const e of istListe) {
    const k = String(e.key || "");
    if (istByKey.has(k)) doppelt.push(k);
    else istByKey.set(k, e);
  }
  const fehlend = p.fraktionen.filter((f) => !istByKey.has(f.key)).map((f) => ({ key: f.key, name: f.name, typ: f.typ }));
  const unbekannt = [...istByKey.values()]
    .filter((e) => !sollByKey.has(String(e.key || "")))
    .map((e) => {
      const k = String(e.key || "");
      return {
        key: k, name: String(e.name || ""),
        nichtVertreten: p.nichtVertreten.find((n) => n.key === k) || null,
        ohneFraktionsstatus: p.ohneFraktionsstatus.find((o) => o.key === k) || null
      };
    });
  const abweichenderName = [...istByKey.values()]
    .filter((e) => sollByKey.has(String(e.key || "")))
    .filter((e) => !nameEnthaeltBezeichnung(String(e.name || ""), sollByKey.get(String(e.key || "")).name))
    .map((e) => ({ key: String(e.key || ""), ist: String(e.name || ""), soll: sollByKey.get(String(e.key || "")).name }));
  const abweichenderTyp = [...istByKey.values()]
    .filter((e) => sollByKey.has(String(e.key || "")))
    .filter((e) => String(e.typ || "fraktion") !== sollByKey.get(String(e.key || "")).typ)
    .map((e) => ({ key: String(e.key || ""), ist: String(e.typ || ""), soll: sollByKey.get(String(e.key || "")).typ }));
  return {
    bekannt: true,
    parlament: p.parlament,
    wahlperiode: p.wahlperiode,
    soll: p.fraktionen.length,
    ist: istByKey.size,
    fehlend, unbekannt, abweichenderName, abweichenderTyp, doppelt,
    vollstaendig: fehlend.length === 0 && unbekannt.length === 0
      && abweichenderName.length === 0 && abweichenderTyp.length === 0 && doppelt.length === 0
  };
}

// Traegt die Quellenbezeichnung die amtliche Bezeichnung? Umlautgefaltet und ohne
// Trennzeichen-Rauschen, damit "Linksfraktion" fuer "Die Linke" NICHT als Treffer gilt, aber
// "SPD-Fraktion" fuer "SPD" schon. Bewusst streng: eine Umbenennung soll auffallen.
function nameEnthaeltBezeichnung(quellenname, amtlich) {
  const fold = (v) => String(v || "").toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const q = fold(quellenname);
  const a = fold(amtlich);
  if (!q || !a) return false;
  if (q.includes(a)) return true;
  // Mehrteilige amtliche Bezeichnungen: jeder tragende Bestandteil muss vorkommen
  // ("buendnis 90 die gruenen" -> "gruene fraktion" traegt "gruenen" nicht wortgleich).
  const teile = a.split(" ").filter((t) => t.length >= 4);
  return teile.length > 1 && teile.every((t) => q.includes(t.slice(0, Math.max(4, t.length - 1))));
}

module.exports = {
  BUNDESTAG_21,
  LANDTAG_BRANDENBURG_8,
  ABGEORDNETENHAUS_BERLIN_19,
  PARLAMENTE,
  parlament,
  fraktionsLage,
  validateSollmenge,
  vergleicheFraktionen,
  nameEnthaeltBezeichnung
};
