"use strict";
const P = require("./synthetik-500-profile");
const V = require("./synthetik-500-vertrag");
const F = require("./realkohorte-500-end-runtime");
const erzeugeEndRuntime = bytes => F.erzeugeEndRuntime(V.erzeugeVertrag(bytes), { synthetik: true });
module.exports = { ...erzeugeEndRuntime(P.serialisiere(P.erzeuge())), erzeugeEndRuntime };
