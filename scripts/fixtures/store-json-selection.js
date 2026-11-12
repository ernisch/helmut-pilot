"use strict";

// Testtransport fuer die unterstuetzte PostgREST Spaltenauswahl. Absichtlich
// unabhaengig von der Runtime-Allowlist; unbekannte Ausdruecke sind Testfehler.
module.exports = function selectedRow(id, data, input) {
  const selection = new URL(input).searchParams.get("select") || "*";
  const row = {};
  for (const item of selection.split(",")) {
    if (item === "*") Object.assign(row, { id, data });
    else if (item === "id") row.id = id;
    else if (item === "data") row.data = data;
    else {
      const match = /^([A-Za-z_][A-Za-z_0-9]*):data->([A-Za-z_][A-Za-z_0-9]*)$/.exec(item);
      if (!match) throw new Error(`Nicht unterstuetzte Testprojektion: ${item}`);
      row[match[1]] = data?.[match[2]] ?? null;
    }
  }
  return row;
};
