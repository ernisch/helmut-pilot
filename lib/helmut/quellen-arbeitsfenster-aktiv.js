"use strict";

// Gemeinsame reine Schalterauswertung ohne Arbeits-/Schedulerimport.
function aktiv(env = process.env) {
  return String(env.HELMUT_QUELLEN_ARBEITSFENSTER || "").trim().toLowerCase() === "on";
}
module.exports = { aktiv };
