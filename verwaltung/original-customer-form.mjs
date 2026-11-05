// Ergänzt ausschließlich Verhalten und Werte des vorhandenen Originalformulars.
// Keine eigene Oberfläche, Styles, dauerhafte Datenhaltung oder automatischer POST.
export function validateCustomerForm(form = {}, availableProfiles = []) {
  const errors = {};
  const clean = value => typeof value === "string" ? value.trim() : "";
  const value = { name: clean(form.name), person: clean(form.person), mail: clean(form.mail).toLowerCase(), tarif: clean(form.tarif), profil: clean(form.profil) };
  for (const [key, label, max] of [["name", "Kundenname", 160], ["person", "Ansprechpartner", 160]]) {
    if (!value[key]) errors[key] = `${label} fehlt.`;
    else if (value[key].length > max || /[\x00-\x1f\x7f]/.test(value[key])) errors[key] = `${label}: bitte höchstens ${max} Zeichen ohne Zeilenumbruch.`;
  }
  if (!value.mail || value.mail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.mail) || /[\x00-\x1f\x7f]/.test(value.mail)) errors.mail = "Bitte eine gültige E-Mail-Adresse angeben.";
  if (!["Basis", "Büro", "Fraktion"].includes(value.tarif)) errors.tarif = "Bitte einen vorhandenen Tarifwunsch wählen; der Preis bleibt offen.";
  if (value.profil && !availableProfiles.some(profile => profile.id === value.profil)) errors.profil = "Dieses Profil ist nicht als frei bestätigt. Bitte später zuordnen oder neu laden.";
  return { value, errors, valid: Object.keys(errors).length === 0, dto: { customerName: value.name, person: value.person, email: value.mail, tariffIntent: value.tarif, politicianId: value.profil || null } };
}

// Als ÄUSSEREN Wrapper installieren: attachCustomerForm(attachOriginalBackend(...)).
export function attachCustomerForm(Component) {
  return class extends Component {
    constructor(...args) {
      super(...args);
      this._customerBusy = false; this._customerLocked = false;
      this._customerErrors = {}; this._customerMessage = "";
    }
    denyAccess(status) {
      this._customerLocked = true; this._customerErrors = {};
      this._customerMessage = status === 401 ? "Bitte melde dich erneut an." : "Die Kundenanlage ist nur für Administratoren zugänglich.";
      super.denyAccess(status);
      this.setState({ form: { name: "", person: "", mail: "", tarif: "Basis", profil: "" }, tried: false });
    }
    async submitCustomerForm(event, availableProfiles = []) {
      event?.preventDefault?.();
      if (this._closed || this._customerBusy || this._customerLocked) return;
      const validated = validateCustomerForm(this.state.form, availableProfiles);
      this._customerErrors = validated.errors; this._customerMessage = "";
      if (!validated.valid) { this.setState({ tried: true }); return; }
      if (!this._actions?.createCustomerAccount || this._phase !== "ready") {
        this._customerMessage = "Die Kundenanlage ist noch nicht bereit. Bitte die Ansicht neu laden.";
        this.setState({ tried: true }); return;
      }
      this._customerBusy = true; this.setState({ tried: true });
      try {
        const result = await this._actions.createCustomerAccount(validated.dto);
        if (this._closed) return;
        // Ergebnis erst nach beiden bestätigten vorhandenen Schreibantworten.
        this._customerLocked = true;
        await this.refresh();
        if (this._closed || ["unauthorized", "forbidden"].includes(this._phase)) return;
        const visible = this.data().customers.find(customer => customer.id === result.user.id);
        if (!visible || visible.raw?.active !== false) {
          this._customerMessage = `Konto ${result.user.id} wurde bei der Anlage bestätigt. Der aktuelle Zugangsstatus ist nicht bestätigt. Bitte den Kontostand und die Profilkennung ${result.user.politicianId || "(nicht bestätigt)"} prüfen; nicht erneut anlegen.`;
          this.setState({ tried: true }); return;
        }
        this._customerErrors = {}; this._customerMessage = ""; this._customerLocked = false;
        this.setState({ form: { name: "", person: "", mail: "", tarif: "Basis", profil: "" }, tried: false, route: { page: "kunde", id: result.user.id } });
        this.go?.(`#/kunde/${result.user.id}`)?.();
        this.say(`Gesperrtes Konto gespeichert. Profilkennung ${result.user.politicianId || "(nicht bestätigt)"} bitte prüfen. Tarifwunsch notiert; Preis offen. Keine Einladung und kein neues Profil angelegt.`);
      } catch (error) {
        if (this._closed) return;
        if ([401, 403].includes(error?.status)) { this.denyAccess(error.status); return; }
        this._customerErrors = error?.fieldErrors || {};
        this._customerLocked = Boolean(error?.outcomeUnknown || error?.partialAccount);
        const partial = error?.partialAccount;
        this._customerMessage = partial
          ? `Konto ${partial.id} wurde bei der Anlage bestätigt. Der aktuelle Konto- und Notizstand ist ${error.outcomeUnknown ? "unklar" : "noch nicht vollständig bestätigt"}. Bitte den Kontostand neu laden; nicht erneut anlegen.`
          : error?.outcomeUnknown ? "Der Ausgang der Kontoanlage ist unklar. Bitte den Kontostand neu laden; nicht erneut anlegen."
            : error?.message || "Die Kontoanlage wurde nicht bestätigt.";
        this.setState({ tried: true });
      } finally {
        this._customerBusy = false;
        if (!this._closed) this.setState({});
      }
    }
    renderVals() {
      const values = super.renderVals();
      if (!values.pKundeNeu) return values;
      const profiles = values.freeProfiles || [];
      const validation = validateCustomerForm(this.state.form, profiles);
      const errors = this.state.tried ? { ...validation.errors, ...this._customerErrors } : this._customerErrors;
      const fieldKeys = ["name", "person", "mail"];
      values.formFields = (values.formFields || []).map((field, index) => {
        const key = fieldKeys[index];
        return { ...field, invalid: errors[key] ? "true" : "false", border: errors[key] ? "var(--risk)" : "var(--line-2)", error: errors[key] || "", onChange: event => {
          if (this._customerBusy || this._customerLocked) return;
          this._customerErrors = { ...this._customerErrors }; delete this._customerErrors[key]; this._customerMessage = "";
          field.onChange(event);
        } };
      });
      for (const name of ["setTarif", "setProfil"]) {
        const original = values[name], key = name === "setTarif" ? "tarif" : "profil";
        values[name] = event => { if (!this._customerBusy && !this._customerLocked) { this._customerErrors = { ...this._customerErrors }; delete this._customerErrors[key]; this._customerMessage = ""; original(event); } };
      }
      values.hasFormErr = Boolean(this._customerMessage || Object.values(errors).some(Boolean) || this._customerBusy);
      values.formErr = [this._customerBusy ? "Gesperrtes Konto wird gespeichert. Bitte kurz warten." : this._customerMessage, ...Object.values(errors).filter(Boolean)].filter(Boolean).join(" ");
      values.customerFormBusy = this._customerBusy;
      values.customerFormLocked = this._customerLocked;
      values.customerSubmitDisabled = this._customerBusy || this._customerLocked || this._phase !== "ready";
      values.customerSubmitLabel = this._customerBusy ? "Wird gespeichert …" : this._customerLocked ? "Kontostand prüfen" : "Gesperrtes Konto speichern";
      values.formSubmit = event => this.submitCustomerForm(event, profiles);
      return values;
    }
  };
}
