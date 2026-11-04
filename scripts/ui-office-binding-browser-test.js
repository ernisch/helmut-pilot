"use strict";
// Reuse the existing isolated CDP runner; execute only the binding cases.
process.argv.push("--office-binding");
require("./ui-preview-browser-check");
