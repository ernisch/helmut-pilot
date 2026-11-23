"use strict";

function quellenAusfuehrungAusgelagert(env = process.env) {
  return env.HELMUT_CRAWL_EXECUTOR === "hetzner";
}

module.exports = { quellenAusfuehrungAusgelagert };
