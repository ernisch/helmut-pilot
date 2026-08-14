"use strict";

// Helmut — AWS-Lambda-Einstiegspunkt des Outbox-Relays.
// =============================================================================================
// Bewusst duenn: die Logik liegt in lib/helmut/lambda-relay.js -> lib/helmut/outbox-relay.js.
// Diese Datei existiert nur, damit die Infrastrukturdefinition einen stabilen Handlerpfad
// (`lambda/relay.handler`) hat.
//
// Diese Datei wird in diesem Sprint NICHT nach AWS ausgeliefert — es existiert keine
// Lambda-Funktion (Belegdatei §19.6).

const { handler } = require("../lib/helmut/lambda-relay");

exports.handler = handler;
