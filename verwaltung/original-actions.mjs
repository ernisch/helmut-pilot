// Explizite Kontoverwaltung über bestehende Routen. Keine Profil-/Motoraktion.
// Kein automatischer Aufruf, Wiederholungsversuch oder dauerhafter Tokenspeicher.
export class AdminMutationError extends Error {
  constructor(status = 0, outcomeUnknown = false, details = {}) {
    super(details.message || (outcomeUnknown
      ? "Der Ausgang ist unklar. Bitte den Kontostand neu laden, bevor du erneut speicherst."
      : status === 401 ? "Bitte melde dich erneut an."
        : status === 403 ? "Du darfst diese Änderung nicht durchführen."
          : status === 409 ? "Die Änderung ist mit dem aktuellen Kontostand nicht möglich. Bitte neu laden."
            : status === 400 ? "Bitte prüfe die markierten Angaben."
              : "Die Änderung wurde nicht bestätigt. Bitte den Kontostand prüfen."));
    this.name = "AdminMutationError";
    this.status = status;
    this.outcomeUnknown = outcomeUnknown;
    this.fieldErrors = details.fieldErrors || {};
    this.partialAccount = details.partialAccount || null;
    this.stage = details.stage || null;
  }
}

export function createAdminActions({ fetcher = globalThis.fetch, timeoutMs = 12000 } = {}) {
  let busy = false, disposed = false;
  const pending = new Set();
  const validId = id => typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,119}$/i.test(id);
  const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
  function customerInput(dto) {
    if (!plain(dto) || Object.keys(dto).some(key => !["customerName", "person", "email", "tariffIntent", "politicianId"].includes(key))) throw new AdminMutationError(400);
    const text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max && !/[\x00-\x1f\x7f]/.test(value);
    const errors = {};
    if (!text(dto.customerName, 160)) errors.name = "Bitte einen Kundennamen mit höchstens 160 Zeichen angeben.";
    if (!text(dto.person, 160)) errors.person = "Bitte eine Ansprechperson mit höchstens 160 Zeichen angeben.";
    if (!text(dto.email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email.trim())) errors.mail = "Bitte eine gültige E-Mail-Adresse angeben.";
    if (!["Basis", "Büro", "Fraktion"].includes(dto.tariffIntent)) errors.tarif = "Bitte einen vorhandenen Tarifwunsch wählen.";
    if (dto.politicianId != null && !validId(dto.politicianId)) errors.profil = "Bitte ein vorhandenes Profil wählen oder später zuordnen.";
    if (Object.keys(errors).length) throw new AdminMutationError(400, false, { fieldErrors: errors });
    return { customerName: dto.customerName.trim(), person: dto.person.trim(), email: dto.email.trim().toLowerCase(), tariffIntent: dto.tariffIntent, politicianId: dto.politicianId || null };
  }
  async function createCustomerAccount(input) {
    const dto = customerInput(input);
    if (disposed || busy) throw new AdminMutationError(409);
    busy = true;
    const controller = new AbortController(); pending.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const options = { credentials: "same-origin", mode: "same-origin", redirect: "error", cache: "no-store", signal: controller.signal };
    let stage = "preflight", sent = false, created = null;
    const partial = () => created ? { id: created.id, email: dto.email, politicianId: created.politicianId || null } : null;
    try {
      // Frischer admin-geschützter Rollen-/Bestandsbeleg, kein dauerhafter Cache.
      const preflight = await fetcher("/api/admin/users", { ...options, method: "GET", headers: { Accept: "application/json" } });
      if (!preflight.ok) throw new AdminMutationError(preflight.status);
      const users = await preflight.json();
      if (!Array.isArray(users)) throw new AdminMutationError();
      if (users.some(user => typeof user?.email === "string" && user.email.trim().toLowerCase() === dto.email)) throw new AdminMutationError(409, false, { fieldErrors: { mail: "Diese E-Mail-Adresse wird bereits verwendet." } });
      if (dto.politicianId && users.some(user => user?.politicianId === dto.politicianId)) throw new AdminMutationError(409, false, { fieldErrors: { profil: "Dieses Profil ist bereits einem Konto zugeordnet. Bitte neu laden." } });
      const csrf = await fetcher("/api/security/csrf", { ...options, method: "GET", headers: { Accept: "application/json" } });
      if (!csrf.ok) throw new AdminMutationError(csrf.status);
      const { token } = await csrf.json();
      if (typeof token !== "string" || token.length < 20 || token.length > 300 || /[\r\n]/.test(token)) throw new AdminMutationError();
      const headers = { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": token };
      if (disposed || controller.signal.aborted) throw new AdminMutationError();
      const account = { name: dto.person, email: dto.email, role: "abgeordneter", active: false };
      if (dto.politicianId) account.politicianId = dto.politicianId;
      stage = "create"; sent = true;
      const response = await fetcher("/api/admin/users", { ...options, method: "POST", headers, body: JSON.stringify(account) });
      if (!response.ok) throw new AdminMutationError(response.status, response.status >= 500, response.status === 409 ? { fieldErrors: { mail: "Diese E-Mail-Adresse wird bereits verwendet. Bitte den Kontostand prüfen." } } : {});
      const user = await response.json();
      if (!validId(user?.id) || users.some(existing => existing?.id === user.id) || user.email !== dto.email || user.name !== dto.person || user.role !== "abgeordneter" || user.active !== false || user.status !== "eingeladen" || !validId(user.politicianId) || user.inviteUrl || user.mail || user.passwordHash || user.passwordSalt) throw new AdminMutationError(0, true);
      // Eine syntaktisch passende ID allein bestaetigt weder Identitaet noch Sperre.
      created = user;
      if (dto.politicianId && user.politicianId !== dto.politicianId) throw new AdminMutationError(409, false, { fieldErrors: { profil: "Das Profil wurde zwischenzeitlich anders zugeordnet. Das bereits angelegte Konto bitte prüfen." }, stage: "profile-mismatch" });
      if (disposed || controller.signal.aborted) throw new AdminMutationError(0, true);
      // Bestehende lesbare interne Notiz bewahrt beide Namen und den Tarifwunsch.
      // Kein CRM-Schema, kein echter Preis, keine Rechnung und keine Profilmutation.
      const customer = { pricePerMonth: null, paymentStatus: "none", internalNote: `Kundenname: ${dto.customerName}\nAnsprechpartner: ${dto.person}\nTarifwunsch: ${dto.tariffIntent} (Preis offen)` };
      stage = "customer";
      const saved = await fetcher(`/api/admin/users/${encodeURIComponent(user.id)}`, { ...options, method: "PATCH", headers, body: JSON.stringify({ customer }) });
      if (!saved.ok) throw new AdminMutationError(saved.status, saved.status >= 500);
      const result = await saved.json();
      if (result?.id !== user.id || result.email !== dto.email || result.name !== dto.person || result.active !== false || result.role !== "abgeordneter" || result.politicianId !== user.politicianId || result.customer?.pricePerMonth !== null || result.customer?.paymentStatus !== "none" || result.customer?.internalNote !== customer.internalNote) throw new AdminMutationError(0, true);
      return { user: result, profileReferenceOnly: true, priceAgreed: false, invitationSent: false };
    } catch (error) {
      const known = error instanceof AdminMutationError ? error : new AdminMutationError(0, sent);
      known.stage ||= stage; known.partialAccount ||= partial();
      throw known;
    } finally {
      clearTimeout(timer); pending.delete(controller); busy = false;
    }
  }
  async function send(id, payload) {
    if (disposed || busy) throw new AdminMutationError(409);
    if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{0,119}$/i.test(id)) throw new AdminMutationError(400);
    busy = true;
    const controller = new AbortController(); pending.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let sent = false;
    const options = { credentials: "same-origin", mode: "same-origin", redirect: "error", cache: "no-store", signal: controller.signal };
    try {
      const csrf = await fetcher("/api/security/csrf", { ...options, method: "GET", headers: { Accept: "application/json" } });
      if (!csrf.ok) throw new AdminMutationError(csrf.status);
      const { token } = await csrf.json();
      if (typeof token !== "string" || token.length < 20 || token.length > 300 || /[\r\n]/.test(token)) throw new AdminMutationError();
      if (disposed || controller.signal.aborted) throw new AdminMutationError();
      sent = true;
      const response = await fetcher(`/api/admin/users/${encodeURIComponent(id)}`, {
        ...options, method: "PATCH", headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": token }, body: JSON.stringify(payload)
      });
      if (!response.ok) throw new AdminMutationError(response.status, response.status >= 500);
      const user = await response.json();
      if (!user || user.id !== id) throw new AdminMutationError(0, true);
      return user;
    } catch (error) {
      if (error instanceof AdminMutationError) throw error;
      throw new AdminMutationError(0, sent);
    } finally {
      clearTimeout(timer); pending.delete(controller); busy = false;
    }
  }
  return {
    createCustomerAccount,
    setAccess(id, active) {
      if (typeof active !== "boolean") return Promise.reject(new AdminMutationError(400));
      // D-01: gemeinsamer Server kann deaktiviert/gekuendigt + active:true zulassen.
      // Bis der geprüfte Serverfix integriert ist, hier nur sicheren Entzug anbieten.
      if (active) return Promise.reject(new AdminMutationError(409));
      return send(id, { active });
    },
    updateCustomer(id, customer) {
      if (!customer || Object.getPrototypeOf(customer) !== Object.prototype) return Promise.reject(new AdminMutationError(400));
      const keys = Object.keys(customer);
      if (!keys.length || keys.some(key => !["pricePerMonth", "paymentStatus"].includes(key))) return Promise.reject(new AdminMutationError(400));
      if (Object.hasOwn(customer, "pricePerMonth") && customer.pricePerMonth !== null
          && (typeof customer.pricePerMonth !== "number" || !Number.isFinite(customer.pricePerMonth) || customer.pricePerMonth < 0)) return Promise.reject(new AdminMutationError(400));
      if (Object.hasOwn(customer, "paymentStatus") && !["paid", "open", "overdue", "none"].includes(customer.paymentStatus)) return Promise.reject(new AdminMutationError(400));
      return send(id, { customer: { ...customer } });
    },
    dispose() { disposed = true; for (const controller of pending) controller.abort(); }
  };
}
