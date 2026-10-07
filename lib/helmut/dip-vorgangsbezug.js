"use strict";
// Pure comparison of validated official DIP procedure references.
const DIP = require("./dip-quellfelder");
function konflikt(a, b) {
  const x = DIP.lese(a), y = DIP.lese(b);
  if (x?.version !== 2 || y?.version !== 2 || x.dokumentId === y.dokumentId
    || !x.vorgangsbezug.length || !y.vorgangsbezug.length) return null;
  const ids = new Set(x.vorgangsbezug.map(v => v.id));
  return y.vorgangsbezug.some(v => ids.has(v.id)) ? null
    : { gleich: false, grund: "dip-vorgangsbezug-konflikt" };
}
module.exports = { konflikt };
