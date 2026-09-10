"use strict";

// Kein Satz wird ergaenzt oder gekuerzt. An einer bekannten Speichergrenze
// ohne Satzende ist ein Alttext moeglicherweise abgeschnitten und kein sicherer
// Ersatz fuer eine vollstaendige Empfehlung. Kurze Alttexte bleiben zulaessig.
function ohneAbschneidung(value, maxLen) {
  const roh = String(value == null ? "" : value).replace(/[\s\u0000-\u001F\u007F]+/g, " ");
  const text = roh.trim();
  if (text.length > maxLen || (roh.length >= maxLen && !/[.!?]["'\u201c\u201d\u2018\u2019\u00ab\u00bb]*$/.test(text))) return "";
  return text;
}

module.exports = { ohneAbschneidung };
