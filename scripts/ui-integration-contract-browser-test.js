"use strict";
// Only the newly open HTTP/bootstrap/curated-data contracts, not the old suites.
process.argv.push("--integration-contracts");
require("./ui-preview-browser-check");
