import { mountAdministration } from './app.mjs';
import { createSimpleApi } from './api.mjs';
mountAdministration(document.querySelector('#verwaltung'), { api: createSimpleApi() });
