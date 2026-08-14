"use strict";

// Helmut — AWS-Lambda-Einstiegspunkt für den SQS-Auftragsverbraucher.
// =============================================================================================
// Bewusst dreizeilig: die Verarbeitung liegt in lib/helmut/lambda-verbraucher.js und die
// Fachlogik in lib/helmut/queue-verbraucher.js, das denselben Fachhandler benutzt wie Cron
// und Warteschlange. Diese Datei existiert nur, damit die Infrastrukturdefinition einen
// stabilen Handler-Pfad (`lambda/index.handler`) hat.
//
// Diese Datei wird in diesem Sprint NICHT nach AWS ausgeliefert — es existiert keine
// Lambda-Funktion (Belegdatei §19.6).

const { handler } = require("../lib/helmut/lambda-verbraucher");

exports.handler = handler;
