import { createAdminReader } from "./api.mjs";
import { originalHelpers, originalSnapshot, applyOriginalTruth } from "./original-adapter.mjs";
import { buildDailyLedger } from "./original-daily-ledger.mjs";

// Die Originalkomponente behält Template, CSS, Navigation und ihren DC-Lebenszyklus.
// Installation ist ausdrücklich; Import allein startet keine Anfrage.
export function attachOriginalBackend(Original, { readerFactory = createAdminReader, actionsFactory = null, host = globalThis.window } = {}) {
  return class extends Original {
    constructor(props) {
      super(props);
      this._reader = readerFactory(); this._actions = actionsFactory?.();
      this._phase = "loading"; this._epoch = 0; this._closed = false;
      this._snapshot = originalSnapshot(); this._detail = null; this._detailError = false;
      host.HV3 = originalHelpers;
    }
    parse() {
      try { return super.parse(); } catch { return { page: "uebersicht" }; }
    }
    data() { return this._snapshot; }
    denyAccess(status) {
      ++this._epoch;
      this._reader.clear(); this._detail = null; this._detailError = false;
      this._phase = status === 401 ? "unauthorized" : "forbidden";
      this._snapshot = originalSnapshot({}, { access: status });
      this.setState({ loading: false, route: { page: "uebersicht" }, dlg: null, toast: null });
    }
    componentDidMount() {
      this.onHash = () => {
        this._detail = null; this._detailError = false;
        this.setState({ route: this.parse(), menuOpen: false, dlg: null });
        host.scrollTo(0, 0); this.loadDetail();
      };
      this.onResize = () => this.setState({ vw: host.innerWidth });
      this.onKey = event => { if (event.key === "Escape") this.setState({ dlg: null, protoOpen: false, menuOpen: false }); };
      host.addEventListener("hashchange", this.onHash); host.addEventListener("resize", this.onResize); host.addEventListener("keydown", this.onKey);
      this.refresh();
    }
    componentWillUnmount() {
      this._closed = true; ++this._epoch;
      host.removeEventListener("hashchange", this.onHash); host.removeEventListener("resize", this.onResize); host.removeEventListener("keydown", this.onKey);
      clearTimeout(this.tt); this._reader.dispose(); this._actions?.dispose();
    }
    async refresh() {
      if (this._closed) return;
      const epoch = ++this._epoch;
      this._reader.clear(); this._detail = null; this._detailError = false;
      this._phase = "loading"; this._snapshot = originalSnapshot(); this.setState({ loading: true, dlg: null, toast: null });
      const keys = ["overview", "budget", "customers", "sources", "runs"];
      const results = await Promise.allSettled(keys.map(key => this._reader.read(key)));
      if (this._closed || epoch !== this._epoch) return;
      const denied = results.find(r => r.status === "rejected" && [401, 403].includes(r.reason?.status));
      if (denied) {
        this.denyAccess(denied.reason.status);
        return;
      }
      const payloads = {}, errors = {};
      results.forEach((result, index) => {
        if (result.status === "fulfilled") payloads[keys[index]] = result.value;
        else errors[keys[index]] = result.reason?.status || 0;
      });
      const snapshot = originalSnapshot(payloads, errors);
      snapshot.dailyLedger = await buildDailyLedger({ overview: payloads.overview, runs: payloads.runs }).catch(() => null);
      if (this._closed || epoch !== this._epoch) return;
      this._snapshot = snapshot;
      this._phase = Object.keys(payloads).length ? "ready" : "error";
      this.setState({ loading: false });
      await this.loadDetail();
    }
    async loadDetail() {
      const id = this.state.route.page === "profil" ? this.state.route.id : null;
      if (!id || !this._snapshot.byId[id] || this._phase !== "ready") return;
      const epoch = this._epoch;
      try {
        const result = await this._reader.read("profile", id);
        if (this._closed || epoch !== this._epoch || this.state.route.id !== id) return;
        // Der bestehende Server liefert für fehlendes Profil UND Lesefehler HTTP200.
        // Nur eine passende, benannte Antwort darf als Detail gelesen gelten.
        if (result.profile?.id !== id || typeof result.profile?.fullName !== "string" || !result.profile.fullName.trim()) throw new Error("Unbestaetigtes Profil");
        this._detail = { id, validierung: result.validierung }; this._detailError = false;
      } catch (error) {
        if (this._closed || epoch !== this._epoch) return;
        if ([401, 403].includes(error?.status)) {
          this.denyAccess(error.status);
          return;
        }
        if (this.state.route.id !== id) return;
        this._detail = null; this._detailError = true;
      }
      this.setState({});
    }
    async changeAccess(id, active) {
      if (!this._actions || this._phase !== "ready") { this.say("Die Kontoverwaltung ist noch nicht eingebunden."); return; }
      try { await this._actions.setAccess(id, active); await this.refresh(); if (!this._closed) this.say("Kontostand aktualisiert."); }
      catch (error) {
        if (!this._closed) { await this.refresh(); if (!this._closed) this.say(error.message || "Änderung nicht bestätigt."); }
      }
    }
    renderVals() {
      const values = super.renderVals();
      if (values.loading) return values;
      return applyOriginalTruth(this, values, this._snapshot, this._phase);
    }
  };
}
