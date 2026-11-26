"use strict";
// Pure comparison of validated official DIP procedure references.
const DIP = require("./dip-quellfelder");
function leseBezug(dokument) {
  const beleg = DIP.lese(dokument);
  return beleg?.version === 2 && beleg.vorgangsbezug.length ? beleg : null;
}
function bezugskonflikt(x, y) {
  if (!x || !y || x.dokumentId === y.dokumentId) return null;
  const ids = new Set(x.vorgangsbezug.map(v => v.id));
  return y.vorgangsbezug.some(v => ids.has(v.id)) ? null
    : { gleich: false, grund: "dip-vorgangsbezug-konflikt" };
}
function konflikt(a, b) {
  return bezugskonflikt(leseBezug(a), leseBezug(b));
}
module.exports = { konflikt, leseBezug, bezugskonflikt };
