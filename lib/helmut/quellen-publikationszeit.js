"use strict";

const { publikationsdatum } = require("./quellen-zeitvertrag");
const MONATE = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WOCHENTAGE = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Begrenzter Importvertrag: ISO oder explizite RSS Datumskomponenten mit
// Zeitzone (RFC5322 3.3). Kein freies Date.parse, kein heutiges Ersatzdatum,
// keine Interpretation lokaler Zahlenfolgen oder zweistelliger Jahre.
function publikationszeit(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const iso = publikationsdatum(text);
  if (iso) return iso.iso;
  const minute = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(Z|[+-]\d{2}:\d{2})$/i.exec(text);
  if (minute) return publikationsdatum(`${minute[1]}:00${minute[2]}`)?.iso || null;
  const r = /^(?:(Sun|Mon|Tue|Wed|Thu|Fri|Sat),\s+)?(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+(GMT|UT|UTC|[+-]\d{4})$/i.exec(text);
  if (!r) return null;
  const month = String(MONATE.indexOf(r[3].toLowerCase()) + 1).padStart(2, "0");
  const day = r[2].padStart(2, "0");
  const zone = /^[+-]/.test(r[8]) ? `${r[8].slice(0, 3)}:${r[8].slice(3)}` : "Z";
  const local = `${r[4]}-${month}-${day}T${r[5]}:${r[6]}:${r[7] || "00"}`;
  const parsed = publikationsdatum(local + zone);
  if (!parsed) return null;
  // Ein ausdruecklich widerspruechlicher Wochentag ist kein sicherer Zeitbeleg.
  if (r[1] && WOCHENTAGE[new Date(local + "Z").getUTCDay()] !== r[1].toLowerCase()) return null;
  return parsed.iso;
}

module.exports = { publikationszeit };
