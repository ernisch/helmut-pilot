"use strict";

const PRODUKTIONSBASIS = Object.freeze({
  quelle: "docs/betrieb/quellenfaelligkeit-20261119.md",
  tag: "2026-11-19",
  gemessenerCommit: "12c3686f",
  dokumentierterProduktionscommit: "da61adfe04b0188e20c1a3bc4325a841733e4a47",
  bedarf: 162,
  technischErledigt: 41,
  rueckstand: 754,
  googleBedarf: 145,
  googleErledigt: 28,
  googleReservierungen: 500,
  googleMixReservierungen: 990,
  googleMixAbschluesse: 58,
  googleMinutengrenze: 30,
  geteilteQuellenOhneDip: 159,
  geteilteGoogleQuellen: 143,
  dipJeFenster: 1,
  personensuchenJeMandat: 1,
  archivWechselTage: 7,
  amtlicheMorgenpflichten: 5,
  amtlichTechnischErledigt: 1,
  fenster: 8,
  sekundenJeFenster: 300,
  originalReservierungen: 16,
  mindestensAbgewieseneOriginale: 3,
  modellGrenzeTagUsd: 1,
  modellGrenzeGesamtUsd: 30,
  lageStartUtc: "04:55",
  briefingStartUtc: "05:10",
  lageFristUtc: "05:00",
  briefingFristUtc: "05:15",
  beobachteteLageUtc: "05:00:51.628",
  beobachtetesBriefingUtc: "05:15:44.627"
});

// Ein Fenster kann bei einem Start außerhalb der vollen Minute zwei Teilminuten berühren.
const GOOGLE_RESERVIERUNGEN_JE_FENSTER = (PRODUKTIONSBASIS.sekundenJeFenster / 60 + 1)
  * PRODUKTIONSBASIS.googleMinutengrenze;
const MAX_GOOGLE_RESERVIERUNGEN = PRODUKTIONSBASIS.fenster * GOOGLE_RESERVIERUNGEN_JE_FENSTER;
const GOOGLE_MIX = PRODUKTIONSBASIS.googleMixReservierungen / PRODUKTIONSBASIS.googleMixAbschluesse;
const RESERVE = 0.25;
const TAGESMESSWERTE = ["bedarf", "eingeplant", "technischErledigt", "fristgerecht", "blockiert",
  "googleBedarf", "googleErledigt", "googleReservierungen", "originalReservierungen", "fenster",
  "laufzeitMs", "rueckstandBeginn", "rueckstandEnde", "historischErledigt"];
const VERGLEICHSWERTE = ["technischErledigt", "fristgerecht", "googleReservierungen", "originalReservierungen",
  "httpAnfragen", "modellAufrufe", "laufzeitMs", "rueckstandEnde"];
const PRUEFARTEN = { produktionscode: "Produktionscode", simulation: "Simulation", produktionsmessung: "Produktionsmessung" };

const zaehler = wert => Number.isFinite(wert) && wert >= 0;
const rund = wert => Math.round(wert * 100) / 100;
const verhaeltnis = (zaehlerWert, nenner) => nenner > 0 ? rund(zaehlerWert / nenner) : null;

function vergleichswerte(vergleich) {
  const { vorher, nachher } = vergleich || {};
  if (!vorher || !nachher) return { status: "offen", grund: "Vergleichslauf auf denselben Prüfdaten fehlt." };
  if (typeof vorher.arbeitsschluessel !== "string" || !vorher.arbeitsschluessel
    || vorher.arbeitsschluessel !== nachher.arbeitsschluessel || !zaehler(vorher.bedarf) || vorher.bedarf === 0
    || vorher.bedarf !== nachher.bedarf) {
    return { status: "offen", grund: "Arbeitsdefinition oder Bedarf vor und nach der Änderung weichen ab." };
  }
  const werte = VERGLEICHSWERTE.filter(name => zaehler(vorher[name]) && zaehler(nachher[name])).map(name => ({
    messwert: name, vorher: vorher[name], nachher: nachher[name], aenderung: rund(nachher[name] - vorher[name])
  }));
  if (!werte.length) return { status: "offen", grund: "Paarweise gemessene Zähler fehlen." };
  return { status: "gemessen", arbeitsschluessel: vorher.arbeitsschluessel, bedarf: vorher.bedarf, werte };
}

function tagesbedarf(mandate, archivwechsel, fixtureMix) {
  const b = PRODUKTIONSBASIS;
  const persoenlich = b.personensuchenJeMandat * mandate;
  const archiv = archivwechsel ? mandate : mandate / b.archivWechselTage;
  const google = b.geteilteGoogleQuellen + persoenlich + archiv;
  const gesamt = b.geteilteQuellenOhneDip + b.dipJeFenster + persoenlich + archiv;
  const googleMitReserve = Math.ceil(google * (1 + RESERVE));
  const reservierungen = Math.ceil(google * GOOGLE_MIX);
  const reservierungenMitReserve = Math.ceil(googleMitReserve * GOOGLE_MIX);
  const mindestfenster = Math.ceil(reservierungenMitReserve / GOOGLE_RESERVIERUNGEN_JE_FENSTER);
  const fixtureReservierungen = fixtureMix === null ? null : Math.ceil(google * fixtureMix);
  const fixtureReservierungenMitReserve = fixtureMix === null ? null : Math.ceil(googleMitReserve * fixtureMix);
  return {
    gesamt: rund(gesamt), google: rund(google), gesamtMitReserve: Math.ceil(gesamt * (1 + RESERVE)),
    googleMitReserve, reservierungenBeimBeobachtetenMix: reservierungen,
    googleMindestbedarfMitReserve: {
      reservierungen: reservierungenMitReserve,
      anbieterminuten: Math.ceil(reservierungenMitReserve / b.googleMinutengrenze),
      arbeitsfenster: mindestfenster,
      reservierteSekunden: mindestfenster * b.sekundenJeFenster
    },
    zusaetzlicheReservierungenBeimBeobachtetenMix: Math.max(0, reservierungen - MAX_GOOGLE_RESERVIERUNGEN),
    reservierungenBeimFixtureMix: fixtureReservierungen,
    zusaetzlicheReservierungenBeimFixtureMix: fixtureReservierungen === null ? null
      : Math.max(0, fixtureReservierungen - MAX_GOOGLE_RESERVIERUNGEN),
    reservierungenMitReserveBeimFixtureMix: fixtureReservierungenMitReserve,
    zusaetzlicheReservierungenMitReserveBeimFixtureMix: fixtureReservierungenMitReserve === null ? null
      : Math.max(0, fixtureReservierungenMitReserve - MAX_GOOGLE_RESERVIERUNGEN),
    zulaessigerMixOhneReserve: verhaeltnis(MAX_GOOGLE_RESERVIERUNGEN, google),
    zulaessigerMixMitReserve: verhaeltnis(MAX_GOOGLE_RESERVIERUNGEN, googleMitReserve)
  };
}

function kapazitaet(tage, gruende) {
  const b = PRODUKTIONSBASIS;
  const googleTage = tage.filter(tag => zaehler(tag.googleBedarf) && tag.googleBedarf > 0
    && zaehler(tag.googleReservierungen) && zaehler(tag.googleAbschluesseGesamt));
  const googleBuchungen = googleTage.reduce((summe, tag) => summe + tag.googleReservierungen, 0);
  const googleAbschluesse = googleTage.reduce((summe, tag) => summe + tag.googleAbschluesseGesamt, 0);
  const fixtureMix = googleTage.length === tage.length && googleAbschluesse > 0 && googleBuchungen > 0
    ? googleBuchungen / googleAbschluesse : null;
  const messung = {
    tage: googleTage.length,
    googleAbschluesse,
    googleReservierungen: googleBuchungen,
    googleGemessenerMix: verhaeltnis(googleBuchungen, googleAbschluesse),
    historischErledigt: tage.length > 0 && tage.every(tag => zaehler(tag.historischErledigt))
      ? tage.reduce((summe, tag) => summe + tag.historischErledigt, 0) : null
  };
  return {
    status: "produktionsabnahme-offen",
    synthetisch: gruende.length ? "verweigert" : "belegt",
    gruende,
    reserveProzent: RESERVE * 100,
    messung,
    beobachteterGoogleMix: rund(GOOGLE_MIX),
    rechnerischeGoogleReservierungen: MAX_GOOGLE_RESERVIERUNGEN,
    googleAbschluesseBeimBeobachtetenMix: Math.floor(MAX_GOOGLE_RESERVIERUNGEN / GOOGLE_MIX),
    googleObergrenzeBeiIstBuchungen: verhaeltnis(b.googleReservierungen, b.googleBedarf),
    abschluesseFuerRueckstandInFuenfTagen: b.bedarf + Math.ceil(b.rueckstand / 5),
    mindestensOriginalbedarfAmBeobachtetenTag: b.originalReservierungen + b.mindestensAbgewieseneOriginale,
    modellkosten100NeuUsd: { von: 1.905, bis: 1.913, neueLagenBeiTagesgrenzeVon: 32, neueLagenBeiTagesgrenzeBis: 34 },
    mandate: [1, 100].map(anzahl => ({
      anzahl, beobachteterMix: "bedarf-ueber-kapazitaet", produktiverNachweis: "offen",
      tagesmittel: tagesbedarf(anzahl, false, fixtureMix), archivwechsel: tagesbedarf(anzahl, true, fixtureMix)
    }))
  };
}

function pruefeKapazitaet(tage, konfiguration) {
  if (tage.length < 2 || tage.some(tag => TAGESMESSWERTE.some(name => !zaehler(tag[name]))))
    return ["Für die Kapazitätsprüfung fehlen vollständige Tagesmessungen."];
  const gruende = [];
  const sortiert = [...tage].sort((a, b) => String(a.tag).localeCompare(String(b.tag)));
  const anfang = sortiert[0];
  const ende = sortiert[sortiert.length - 1];
  if (anfang.rueckstandBeginn <= 0 || ende.rueckstandEnde >= anfang.rueckstandBeginn
    || !tage.some(tag => tag.historischErledigt > 0))
    gruende.push("Ein sinkender historischer Rückstand ist über die Prüftage nicht belegt.");
  if (tage.some(tag => tag.bedarf <= 0 || tag.fristgerecht + tag.historischErledigt < Math.ceil(tag.bedarf * (1 + RESERVE))))
    gruende.push("Die gemessenen Abschlüsse reichen an mindestens einem Prüftag nicht für neue Tagesarbeit und 25 % Reserve.");
  if (tage.some(tag => tag.googleErledigt < tag.googleBedarf))
    gruende.push("Der Google-Tagesbedarf ist in mindestens einem Prüftag offen geblieben.");
  if (tage.some(tag => tag.googleBedarf > 0 && !zaehler(tag.googleAbschluesseGesamt)))
    gruende.push("Für den Google-Mix fehlen Abschlüsse einschließlich der Altaufträge.");
  const fenster = konfiguration.quellenfenster ?? konfiguration.fenster ?? PRODUKTIONSBASIS.fenster;
  const sekunden = konfiguration.fensterSekunden ?? PRODUKTIONSBASIS.sekundenJeFenster;
  const originale = konfiguration.originalReservierungen ?? PRODUKTIONSBASIS.originalReservierungen;
  const googleMinute = konfiguration.googleReservierungenJeMinute ?? PRODUKTIONSBASIS.googleMinutengrenze;
  const googleMaximum = fenster * (Math.ceil(sekunden / 60) + 1) * googleMinute;
  if (tage.some(tag => tag.fenster > fenster
    || tag.originalReservierungen > originale || tag.googleReservierungen > googleMaximum))
    gruende.push("Die Messung überschreitet mindestens eine belegte Betriebsgrenze.");
  return gruende;
}

function erstelleBericht({ szenario, commit = null, lauf = null, versuch = null, konfiguration = {}, tage = [],
  pruefungen = [], abweichungen = [], vergleich } = {}) {
  const vergleichsbericht = vergleichswerte(vergleich);
  const pflichtpruefungen = pruefungen.filter(pruefung => pruefung.pflicht !== false);
  const fehlgeschlagen = pruefungen.some(pruefung => pruefung.status === "fehlgeschlagen");
  const offen = !pflichtpruefungen.length || pflichtpruefungen.some(pruefung => pruefung.status !== "geprueft");
  const technischeDurchfuehrung = fehlgeschlagen ? "fehlgeschlagen" : offen ? "teilweise" : "bestanden";
  const abnahmegruende = [];
  if (technischeDurchfuehrung !== "bestanden") abnahmegruende.push("Erforderliche Prüfungen sind unvollständig oder fehlgeschlagen.");
  if (!/^[a-f0-9]{40}$/.test(commit || "") || !szenario || !Object.keys(konfiguration).length)
    abnahmegruende.push("Commit, Szenario oder geprüfte Konfiguration sind unvollständig gebunden.");
  if (new Set(tage.map(tag => tag.tag)).size < 2 || tage.some(tag => TAGESMESSWERTE.some(name => !zaehler(tag[name]))
    || !Array.isArray(tag.quellen) || !tag.quellen.length || typeof tag.lageFrist !== "boolean"
    || typeof tag.briefingFrist !== "boolean"))
    abnahmegruende.push("Messungen, Einzelnachweise oder Ausgabefristen fehlen über mehrere Tage.");
  if (tage.some(tag => tag.lageFrist === false || tag.briefingFrist === false
    || (zaehler(tag.fristgerecht) && zaehler(tag.blockiert) && tag.fristgerecht + tag.blockiert !== tag.bedarf)))
    abnahmegruende.push("Quellenfälligkeiten oder Ausgabefristen wurden verfehlt.");
  if (tage.some(tag => zaehler(tag.eingeplant) && tag.eingeplant !== tag.bedarf))
    abnahmegruende.push("Die geplanten Quellenaufträge entsprechen mindestens einmal nicht dem fälligen Soll.");
  const kapazitaetsgruende = pruefeKapazitaet(tage, konfiguration);
  abnahmegruende.push(...kapazitaetsgruende);
  if (vergleichsbericht.status !== "gemessen") abnahmegruende.push(vergleichsbericht.grund);
  if (abweichungen.some(abweichung => typeof abweichung === "string" || abweichung.abnahmehindernis !== false))
    abnahmegruende.push("Produktionsrelevante Pfade oder Konfigurationen sind nicht abgedeckt.");
  return {
    szenario, commit, lauf, versuch, konfiguration, technischeDurchfuehrung,
    synthetischeAbnahme: abnahmegruende.length ? "verweigert" : "bestanden", abnahmegruende,
    produktionsbasis: PRODUKTIONSBASIS, tage, pruefungen, abweichungen, vergleich: vergleichsbericht,
    kapazitaet: kapazitaet(tage, kapazitaetsgruende)
  };
}

const anzeige = wert => wert === null || wert === undefined ? "offen" : typeof wert === "boolean"
  ? (wert ? "ja" : "nein") : typeof wert === "number" ? wert.toLocaleString("de-DE") : String(wert);
const zelle = wert => anzeige(wert).replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|");
const tabellenzeile = werte => `| ${werte.map(zelle).join(" | ")} |`;

function formatiereBericht(bericht) {
  const { kapazitaet: k, produktionsbasis: b } = bericht;
  const zeilen = ["## HELMUT Quellenprüfstand", "",
    `Szenario ${zelle(bericht.szenario)} · Commit ${zelle(bericht.commit)} · Lauf ${zelle(bericht.lauf)}/${zelle(bericht.versuch)}`,
    `Technische Durchführung **${bericht.technischeDurchfuehrung}** · Synthetische Abnahme **${bericht.synthetischeAbnahme}** · Produktionsabnahme **offen**`,
    "", ...bericht.abnahmegruende.map(grund => `- ${grund}`), "",
    `Der reguläre Ausgangslauf vom ${b.tag} auf ${b.gemessenerCommit} verzeichnete ${b.technischErledigt}/${b.bedarf} technische Abschlüsse und ${b.googleErledigt}/${b.googleBedarf} Google-Abschlüsse bei ${b.googleReservierungen} Reservierungen. Der lesende Abgleich desselben Tages ergab insgesamt ${b.rueckstand} wartende Fälligkeiten. Die gespeicherte Lage um ${b.beobachteteLageUtc} UTC und die Morgenausgabe um ${b.beobachtetesBriefingUtc} UTC lagen nach den Fristen. Produktionsstand nach #1272 ist ${b.dokumentierterProduktionscommit.slice(0, 8)} mit Starts um ${b.lageStartUtc} und ${b.briefingStartUtc} UTC und Fristen um ${b.lageFristUtc} und ${b.briefingFristUtc} UTC. [Betriebsbeleg](https://github.com/ernisch/helmut-pilot/blob/7b1f55b0f0462674ef46fe86eef9be4b41a21a28/${b.quelle})`,
    "", "### Gemessener Szenariolauf", "",
    "| UTC-Tag | Bedarf | Geplant | Technisch erledigt | Fristgerecht | Blockiert | Google Bedarf / Tagesabschlüsse / alle Abschlüsse / Reserv. | Originalreserv. | Fenster | Laufzeit (ms) | Rückstand Beginn / Ende | Altaufträge erledigt | Lage / Briefing fristgerecht |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | ---: | --- |"
  ];
  for (const tag of bericht.tage) zeilen.push(tabellenzeile([tag.tag, tag.bedarf, tag.eingeplant, tag.technischErledigt,
    tag.fristgerecht, tag.blockiert, [tag.googleBedarf, tag.googleErledigt, tag.googleAbschluesseGesamt, tag.googleReservierungen].map(anzeige).join(" / "),
    tag.originalReservierungen, tag.fenster, tag.laufzeitMs, [tag.rueckstandBeginn, tag.rueckstandEnde].map(anzeige).join(" / "),
    tag.historischErledigt, [tag.lageFrist, tag.briefingFrist].map(anzeige).join(" / ")]));
  if (!bericht.tage.length) zeilen.push(tabellenzeile(["Keine Tagesmessung", ...Array(12).fill(null)]));
  zeilen.push("", "### Vergleich auf derselben Prüfbasis", "");
  if (bericht.vergleich.status === "gemessen") {
    zeilen.push(`Arbeitsdefinition ${zelle(bericht.vergleich.arbeitsschluessel)} · Bedarf ${anzeige(bericht.vergleich.bedarf)}`, "",
      "| Messwert | Vorher | Nachher | Änderung |", "| --- | ---: | ---: | ---: |");
    for (const wert of bericht.vergleich.werte) zeilen.push(tabellenzeile([wert.messwert, wert.vorher, wert.nachher, wert.aenderung]));
  } else zeilen.push(bericht.vergleich.grund);
  zeilen.push("", "### Kapazität für 1 und 100 Mandate", "",
    `Synthetischer Kapazitätsnachweis für das einzelne Testmandat **${k.synthetisch}**. Hochrechnung im Fixture-Mix für identischen Mandatsbedarf und dieselben gemeinsam genutzten Quellen.`,
    `Synthetische Messung über ${k.messung.tage} Tage mit Google-Zählern · ${anzeige(k.messung.googleAbschluesse)} Abschlüsse · ${anzeige(k.messung.googleReservierungen)} Reservierungen · ${anzeige(k.messung.googleGemessenerMix)} Reservierungen je Abschluss · erledigte Altaufträge ${anzeige(k.messung.historischErledigt)}.`,
    `Der dokumentierte Google-Mix von ${anzeige(k.beobachteterGoogleMix)} Reservierungen je technischem Abschluss ergibt höchstens ${k.googleAbschluesseBeimBeobachtetenMix} Abschlüsse bei ${anzeige(k.rechnerischeGoogleReservierungen)} rechnerisch möglichen Reservierungen. Mit den ${b.googleReservierungen} Ist-Buchungen dürfte der Mix am beobachteten Tag höchstens ${anzeige(k.googleObergrenzeBeiIstBuchungen)} betragen. Bei ${k.reserveProzent} % Reserve ergeben sich folgende Grenzen.`, "",
    "| Mandate | Tag | Quellenbedarf | Abschlüsse mit Reserve | Google-Bedarf | Fehlende Google-Reserv. beim beobachteten Mix | Google-Reserv. im Fixture-Mix inkl. Reserve / davon fehlend | Zulässige Reserv. je Google-Abschluss mit Reserve |",
    "| ---: | --- | ---: | ---: | ---: | ---: | --- | ---: |");
  for (const mandat of k.mandate) {
    for (const [tag, bedarf] of [["Tagesmittel", mandat.tagesmittel], ["Archivwechsel", mandat.archivwechsel]]) {
      zeilen.push(tabellenzeile([mandat.anzahl, tag, bedarf.gesamt, bedarf.gesamtMitReserve, bedarf.google,
        bedarf.zusaetzlicheReservierungenBeimBeobachtetenMix,
        [bedarf.reservierungenMitReserveBeimFixtureMix, bedarf.zusaetzlicheReservierungenMitReserveBeimFixtureMix].map(anzeige).join(" / "),
        bedarf.zulaessigerMixMitReserve]));
    }
  }
  zeilen.push("", "### Rechnerischer Google-Mindestbedarf im 24-Stunden-Entwurf", "",
    `Beim beobachteten Mix und ${k.reserveProzent} % Reserve auf ganze Abschlüsse aufgerundet. Die Vergleichswerte beziehen sich auf die ${b.fenster} Fenster des historischen Ausgangslaufs. Reale Anbietergrenzen, Laufzeit weiterer Arbeit, Originale und Kosten brauchen eigene Nachweise.`, "",
    "| Mandate | Tag | Reservierungen | Anbieterminuten | Fünfminutenfenster | Reservierte Sekunden |",
    "| ---: | --- | ---: | ---: | ---: | ---: |");
  for (const mandat of k.mandate) {
    for (const [tag, bedarf] of [["Tagesmittel", mandat.tagesmittel], ["Archivwechsel", mandat.archivwechsel]]) {
      const minimum = bedarf.googleMindestbedarfMitReserve;
      zeilen.push(tabellenzeile([mandat.anzahl, tag, minimum.reservierungen, minimum.anbieterminuten,
        minimum.arbeitsfenster, minimum.reservierteSekunden]));
    }
  }
  zeilen.push("", `Für den Abbau von ${b.rueckstand} Altaufträgen in fünf Tagen bei ${b.bedarf} neuen Aufträgen täglich wären ${k.abschluesseFuerRueckstandInFuenfTagen} bestätigte Abschlüsse pro Tag nötig. Der beobachtete Originalbedarf lag bei mindestens ${k.mindestensOriginalbedarfAmBeobachtetenTag} gegenüber ${b.originalReservierungen} Buchungen.`,
    `100 täglich neu erstellte und geprüfte Lagen entsprechen nach dem beobachteten Kostenmix ${anzeige(k.modellkosten100NeuUsd.von)}–${anzeige(k.modellkosten100NeuUsd.bis)} USD. Die Grenze von ${b.modellGrenzeTagUsd} USD pro UTC-Tag trägt rechnerisch ${k.modellkosten100NeuUsd.neueLagenBeiTagesgrenzeVon}–${k.modellkosten100NeuUsd.neueLagenBeiTagesgrenzeBis} neue Lagen. Der Gesamtrahmen beträgt ${b.modellGrenzeGesamtUsd} USD.`,
    "", "### Prüfnachweise", "");
  for (const p of bericht.pruefungen) zeilen.push(`- ${zelle(p.name)} · ${zelle(PRUEFARTEN[p.art] || "Prüfart offen")} · ${zelle(p.status)}${p.beleg ? ` · ${zelle(p.beleg)}` : ""}`);
  zeilen.push("", "### Offene Produktionsabweichungen", "");
  for (const a of bericht.abweichungen) zeilen.push(`- ${zelle(typeof a === "string" ? a : a.beschreibung)}`);
  return zeilen.join("\n") + "\n";
}

module.exports = { PRODUKTIONSBASIS, erstelleBericht, formatiereBericht };
