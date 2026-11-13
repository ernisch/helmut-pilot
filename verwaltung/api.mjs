// Ausschließlich explizit eingebundener Client vorhandener Admin-Leserouten.
// Kein automatischer Start, kein Token, keine Schreibmethode, kein Datenstatus.
const ENDPOINTS = Object.freeze({
  overview: "/api/admin/overview",
  budget: "/api/admin/stats/budget-today",
  customers: "/api/admin/customers",
  sources: "/api/admin/sources-status",
  runs: "/api/admin/stats/process-runs?limit=20",
  sourceRuns: "/api/admin/stats/process-runs?limit=5&process=warteschlange-crawl",
  ergebnisse: "/api/admin/ergebnisse?proSeite=500"
});

export class AdminReadError extends Error {
  constructor(status = 0) {
    super(status === 401 ? "Bitte melde dich erneut an."
      : status === 403 ? "Die Verwaltung ist nur für Administratoren zugänglich."
        : "Die Daten konnten nicht geladen werden. Bitte versuche es erneut.");
    this.name = "AdminReadError";
    this.status = status;
  }
}

export function createAdminReader({ fetcher = globalThis.fetch, timeoutMs = 12000, customerScope = 'all' } = {}) {
  const cache = new Map();
  const pending = new Set();
  const queue = [];
  let active = 0;
  let disposed = false;
  // Dieselben Verwaltungsstarts koennen verschiedene Serverinstanzen erreichen.
  // Deshalb bereits hier nur zwei Leseantworten zugleich, einschliesslich Body.
  // Die Frist laeuft auch beim Warten; clear/dispose entfernen alte Wartende.
  function drain() {
    while (active < 2 && queue.length) queue.shift().start();
  }
  function acquire(signal) {
    return new Promise((resolve, reject) => {
      const entry = { start() {
        signal.removeEventListener("abort", cancel);
        active++;
        resolve(() => { active--; drain(); });
      } };
      function cancel() {
        const index = queue.indexOf(entry);
        if (index !== -1) queue.splice(index, 1);
        reject(new AdminReadError());
      }
      if (signal.aborted) { reject(new AdminReadError()); return; }
      signal.addEventListener("abort", cancel, { once: true });
      queue.push(entry); drain();
    });
  }
  return {
    read(key, id = null) {
      if (disposed) return Promise.reject(new AdminReadError());
      let url = typeof key === "string" && Object.hasOwn(ENDPOINTS, key) ? ENDPOINTS[key] : null;
      if (key === "customers" && customerScope === "regular") url += "?scope=regular";
      if (key === "ergebnisse" && id !== null && /^[2-4]$/.test(String(id))) url = `${ENDPOINTS.ergebnisse}&seite=${id}`;
      if (key === "profile" && typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,119}$/.test(id)) {
        url = `/api/admin/profile/${encodeURIComponent(id)}`;
      }
      if (!url) return Promise.reject(new AdminReadError(400));
      if (cache.has(url)) return cache.get(url);
      const controller = new AbortController();
      pending.add(controller);
      const promise = (async () => {
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let rejectAbort;
        const aborted = new Promise((_, reject) => { rejectAbort = () => reject(new AdminReadError()); });
        controller.signal.addEventListener("abort", rejectAbort, { once: true });
        const work = (async () => {
          const release = await acquire(controller.signal);
          try {
            controller.signal.throwIfAborted();
            const response = await fetcher(url, {
              method: "GET", credentials: "same-origin", mode: "same-origin",
              cache: "no-store", redirect: "error", signal: controller.signal,
              headers: { Accept: "application/json" }
            });
            if (!response.ok) throw new AdminReadError(response.status);
            const data = await response.json();
            if (!data || typeof data !== "object" || Array.isArray(data)) throw new AdminReadError();
            return data;
          } finally {
            // Ein abgebrochener Aufrufer beweist keinen Fetch-Abschluss. Auch
            // bei ignoriertem Abort erst nach wirklichem Abschluss freigeben.
            release();
          }
        })();
        try {
          return await Promise.race([work, aborted]);
        } catch (error) {
          if (error instanceof AdminReadError) throw error;
          throw new AdminReadError();
        } finally {
          clearTimeout(timer);
          controller.signal.removeEventListener("abort", rejectAbort);
          pending.delete(controller);
        }
      })();
      cache.set(url, promise);
      return promise;
    },
    clear() {
      for (const controller of pending) controller.abort();
      cache.clear();
    },
    dispose() {
      disposed = true;
      for (const controller of pending) controller.abort();
      cache.clear();
    }
  };
}
