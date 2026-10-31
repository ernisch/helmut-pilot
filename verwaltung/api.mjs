// Ausschließlich explizit eingebundener Client vorhandener Admin-Leserouten.
// Kein automatischer Start, kein Token, keine Schreibmethode, kein Datenstatus.
const ENDPOINTS = Object.freeze({
  overview: "/api/admin/overview",
  budget: "/api/admin/stats/budget-today",
  customers: "/api/admin/customers",
  sources: "/api/admin/sources-status",
  runs: "/api/admin/stats/process-runs?limit=20"
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

export function createAdminReader({ fetcher = globalThis.fetch, timeoutMs = 12000 } = {}) {
  const cache = new Map();
  const pending = new Set();
  let disposed = false;
  return {
    read(key, id = null) {
      if (disposed) return Promise.reject(new AdminReadError());
      let url = typeof key === "string" && Object.hasOwn(ENDPOINTS, key) ? ENDPOINTS[key] : null;
      if (key === "profile" && typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,119}$/.test(id)) {
        url = `/api/admin/profile/${encodeURIComponent(id)}`;
      }
      if (!url) return Promise.reject(new AdminReadError(400));
      if (cache.has(url)) return cache.get(url);
      const controller = new AbortController();
      pending.add(controller);
      const promise = (async () => {
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetcher(url, {
            method: "GET", credentials: "same-origin", mode: "same-origin",
            cache: "no-store", redirect: "error", signal: controller.signal,
            headers: { Accept: "application/json" }
          });
          if (!response.ok) throw new AdminReadError(response.status);
          const data = await response.json();
          if (!data || typeof data !== "object" || Array.isArray(data)) throw new AdminReadError();
          return data;
        } catch (error) {
          if (error instanceof AdminReadError) throw error;
          throw new AdminReadError();
        } finally {
          clearTimeout(timer);
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
