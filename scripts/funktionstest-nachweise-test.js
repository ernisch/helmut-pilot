"use strict";

// Helmut — Vertragstest der REPRODUZIERBAREN AUSWERTER (A01, A06, A10).
// =============================================================================
// Anlass: Die Abbruchregeln A01, A06 und A10 hatten keine erhebbare Quelle. Sie
// akzeptierten stattdessen menschliche Zusagen (`blobAusgezaehlt: true`,
// `gezaehlt: true`). Eine Abbruchregel, deren Messwert zugesagt statt gerechnet
// wird, ist keine Abbruchregel.
//
// Die ERSTE Fassung des A10-Auswerters wurde in einer Gegenpruefung widerlegt:
// sie zaehlte Auditereignisse als Versandspur, obwohl die Route sie UNABHAENGIG
// vom tatsaechlichen Versand schreibt. Genau dieser Fehler wird hier gepinnt.

const fs = require("fs");
const path = require("path");
const N = require("../lib/helmut/funktionstest-nachweise");
const K = require("../lib/helmut/funktionstest-kontrolle");

const ROOT = path.join(__dirname, "..");
let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

const T = Date.UTC(2026, 8, 10, 12, 0, 0);
const VON = T - 3600000;
const BIS = T + 3600000;
const iso = (versatzMs = 0) => new Date(T + versatzMs).toISOString();

console.log("Helmut — Vertragstest der reproduzierbaren Auswerter\n");

// ── A · A01/A06 über dem Nutzungslog ────────────────────────────────────────
console.log("A · Nutzungslog: A01 (unbekannte Arten) und A06 (Drosselungen)");
{
  const e = [
    { createdAt: iso(), callType: "understanding" },
    { createdAt: iso(1000), callType: "understanding-rueckstand" },
    { createdAt: iso(2000), callType: "office-output" },
    { createdAt: iso(3000), callType: "voellig-neue-art" },
    { createdAt: iso(4000), callType: "" },
    { createdAt: iso(5000), callType: "lageBriefing", error: "HTTP 429 Too Many Requests" },
    { createdAt: iso(6000), callType: "skipped-lageBriefing" }
  ];
  const r = N.werteNutzungslogAus({ eintraege: e, vonMs: VON, bisMs: BIS });
  check("A1 Bekannte Arten zählen nicht als unbekannt", r.unbekannteModellaufrufe === 2,
    `unbekannt=${r.unbekannteModellaufrufe}`);
  check("A2 Die Präfixfamilie understanding- gilt als bekannt", N.istBekannterCallType("understanding-staff-backfill"));
  check("A3 Ein leerer callType zählt als unbekannt", r.unbekannteArten.some((a) => a.art === "(leer)"));
  check("A4 Eine 429 wird als Drosselung erkannt", r.drosselungen === 1);
  check("A5 Budgetablehnungen sind KEINE Modellaufrufe und werden getrennt gezählt",
    r.budgetablehnungen === 1 && !r.unbekannteArten.some((a) => a.art.startsWith("skipped-")));
  check("A6 '1429' ist keine Drosselung",
    N.istDrosselung({ error: "code 1429 unbekannt" }) === false);
  check("A7 Ein Eintrag außerhalb des Fensters zählt nicht",
    N.werteNutzungslogAus({ eintraege: [{ createdAt: iso(-99999999), callType: "neu" }], vonMs: VON, bisMs: BIS })
      .unbekannteModellaufrufe === 0);
}

console.log("\nB · Der Ringpuffer darf kein falsches Grün erzeugen");
{
  const voll = Array.from({ length: 5000 }, (_, i) => ({ createdAt: iso(-i * 1000), callType: "understanding" }));
  const r = N.werteNutzungslogAus({ eintraege: voll, vonMs: T - 30 * 86400000, bisMs: BIS, ringMax: 5000 });
  check("B1 Voller Ring mit zu jungem ältesten Eintrag ⇒ NICHT auswertbar", r.auswertbar === false);
  check("B2 Und der Grund wird benannt", /gekuerzt|gekürzt/.test(r.grund));
  const r2 = N.werteNutzungslogAus({ eintraege: voll.slice(0, 4999), vonMs: T - 30 * 86400000, bisMs: BIS, ringMax: 5000 });
  check("B3 Ein NICHT voller Ring ist auswertbar", r2.auswertbar === true);
  check("B4 Fehlt der Nutzungslog, ist nichts auswertbar",
    N.werteNutzungslogAus({ eintraege: null, vonMs: VON, bisMs: BIS }).auswertbar === false);
}

// ── C · A10: nur belegte Versandspuren ──────────────────────────────────────
console.log("\nC · A10 zählt tatsächliche Versendungen, nicht Routenprotokolle");
{
  const audit = [
    { createdAt: iso(), action: "admin.user.invite", politicianId: "test-kohorte-a-001",
      detail: "a@test-kohorte.invalid · versand=ja" },
    { createdAt: iso(1000), action: "admin.user.invite", politicianId: "test-kohorte-a-002",
      detail: "b@test-kohorte.invalid · versand=nein" },
    { createdAt: iso(2000), action: "password.reset-requested", politicianId: "ein-reales-mandat",
      detail: "real@example.org · versand=ja" }
  ];
  const r = N.werteKommunikationsspurenAus({
    auditEvents: audit, pushEreignisse: [], jobOutbox: [], vonMs: VON, bisMs: BIS
  });
  // DER WIDERLEGTE FEHLER: die erste Fassung hätte hier 2 gezählt (beide
  // Kohorteneinträge), obwohl einer NICHT versendet wurde.
  check("C1 Ein Eintrag mit versand=nein zählt NICHT", r.kommunikationsversuche === 1,
    `gezählt=${r.kommunikationsversuche}`);
  check("C2 Ein REALES Mandat zählt nicht als synthetischer Versand",
    r.jeKanal.mail === 0 && r.jeKanal.einladung === 1);
  const rPush = N.werteKommunikationsspurenAus({
    auditEvents: [], pushEreignisse: [{ createdAt: iso(), politicianId: "test-kohorte-a-003", delivered: 3 }],
    jobOutbox: [], vonMs: VON, bisMs: BIS
  });
  check("C3 Angenommene Push-Sendungen zählen einzeln", rPush.kommunikationsversuche === 3);
  check("C4 Ein Push ohne Zustellung zählt nicht",
    N.werteKommunikationsspurenAus({
      auditEvents: [], pushEreignisse: [{ createdAt: iso(), politicianId: "test-kohorte-a-003", delivered: 0 }],
      jobOutbox: [], vonMs: VON, bisMs: BIS
    }).kommunikationsversuche === 0);
  const rOutbox = N.werteKommunikationsspurenAus({
    auditEvents: [], pushEreignisse: [], jobOutbox: [{ sentAt: iso(), tenantId: "test-kohorte-a-004" }],
    vonMs: VON, bisMs: BIS
  });
  check("C5 Eine Zeile im Job-Ausgangspostfach zählt", rOutbox.kommunikationsversuche === 1);
}

console.log("\nD · Was NICHT messbar ist, wird gesagt statt als 0 gemeldet");
{
  const r = N.werteKommunikationsspurenAus({ auditEvents: [], vonMs: VON, bisMs: BIS });
  check("D1 Ohne Push-/Outbox-Quelle ist die Erhebung UNVOLLSTÄNDIG",
    r.vollstaendig === false && r.nichtGemessen.includes("push") && r.nichtGemessen.includes("job-transport"));
  check("D2 Die bauartbedingt unmessbaren Kanäle werden benannt",
    r.nichtMessbar.includes("whatsapp") && r.nichtMessbar.includes("lambda-invoke")
      && r.nichtMessbar.includes("monitoring-webhook"));
  check("D3 Der Hinweis sagt ausdrücklich, dass eine 0 kein Freispruch ist",
    /kein Freispruch/.test(r.hinweis));
  check("D4 Mit allen Quellen ist die Erhebung vollständig",
    N.werteKommunikationsspurenAus({ auditEvents: [], pushEreignisse: [], jobOutbox: [], vonMs: VON, bisMs: BIS })
      .vollstaendig === true);
}

// ── E · Die Stufenkontrolle nimmt nur noch Auswerter-Ergebnisse ─────────────
console.log("\nE · Keine menschliche Zusage mehr");
{
  const zusage = K.baueBeobachtungen({
    modellaufrufe: { blobAusgezaehlt: true, unbekannteModellaufrufe: 0, drosselungen: 0 },
    riegel: { gezaehlt: true, durchgelassen: 0 }
  });
  check("E1 `blobAusgezaehlt`/`gezaehlt` erzeugen KEINE Beobachtung mehr",
    !("unbekannteModellaufrufe" in zusage) && !("kommunikationsversuche" in zusage));
  const gerechnet = K.baueBeobachtungen({
    modellaufrufe: N.werteNutzungslogAus({ eintraege: [], vonMs: VON, bisMs: BIS }),
    riegel: N.werteKommunikationsspurenAus({ auditEvents: [], pushEreignisse: [], jobOutbox: [], vonMs: VON, bisMs: BIS })
  });
  check("E2 Das Ergebnis der Auswerter erzeugt sie",
    gerechnet.unbekannteModellaufrufe === 0 && gerechnet.drosselungen === 0
      && gerechnet.kommunikationsversuche === 0);
  // DRITTER REVIEWBEFUND: `auswertbar: true` allein genuegte — eine HALBE
  // Erhebung (ohne Push-/Outbox-Quelle) wurde als 0 uebernommen. Genau das
  // falsche Gruen, das A10 verhindern soll.
  check("E2a Eine UNVOLLSTAENDIGE A10-Erhebung erzeugt KEINE Zahl",
    !("kommunikationsversuche" in K.baueBeobachtungen({
      riegel: N.werteKommunikationsspurenAus({ auditEvents: [], vonMs: VON, bisMs: BIS })
    })));
  check("E2b Erst die vollstaendige Erhebung erzeugt sie",
    K.baueBeobachtungen({
      riegel: N.werteKommunikationsspurenAus({
        auditEvents: [], pushEreignisse: [], jobOutbox: [], vonMs: VON, bisMs: BIS
      })
    }).kommunikationsversuche === 0);
  check("E3 Ein NICHT auswertbarer Nutzungslog erzeugt keine Zahl",
    !("unbekannteModellaufrufe" in K.baueBeobachtungen({
      modellaufrufe: { auswertbar: false, grund: "x" }
    })));
  check("E4 Der relationale Weg bleibt als zweite Herkunft zulässig",
    K.baueBeobachtungen({ modellaufrufe: { relationalAktiv: true, unbekannteModellaufrufe: 7, drosselungen: 0 } })
      .unbekannteModellaufrufe === 7);
}

console.log("\nF · Das Modul erhebt nichts selbst");
{
  const quelle = fs.readFileSync(path.join(ROOT, "lib/helmut/funktionstest-nachweise.js"), "utf8");
  const code = quelle.replace(/\/\/.*$/gm, "");
  check("F1 Kein Netz, keine Datenbank, keine Uhr",
    !/\bfetch\(/.test(code) && !/require\(["']\.\/storage["']\)/.test(code) && !/Date\.now\(\)/.test(code));
  check("F2 Kein realer Mandats-Slug", !/cem|annika|klose|ince|mustermann/i.test(quelle));
  check("F3 Die vier Mailaufrufer schreiben Kennung UND Versandstatus",
    (() => {
      const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
      return (server.match(/versand=\$\{/g) || []).length === 3
        && (server.match(/politicianId: await kontoKennung\(/g) || []).length === 3;
    })(),
    "drei Auditstellen (die vierte Mailstelle schreibt kein Audit)");
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
