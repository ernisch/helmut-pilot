"use strict";
const P = require("./synthetik-500-profile");
const V = require("./synthetik-500-vertrag");
const F = require("./realkohorte-500-startschutz");
const erzeugeStartschutz = bytes => F.erzeugeStartschutz(V.erzeugeVertrag(bytes), { synthetik: true });
module.exports = { ...erzeugeStartschutz(P.serialisiere(P.erzeuge())), erzeugeStartschutz };
