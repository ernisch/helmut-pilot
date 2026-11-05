import { mountAdministration } from "./app.mjs";
import { createPreviewReader } from "./beispieldaten.mjs";

mountAdministration(document.querySelector("#verwaltung"), {
  reader: createPreviewReader(), preview: true
});
