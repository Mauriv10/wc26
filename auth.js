(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const rawConfig = window.WC_SUPABASE_CONFIG || window.SUPABASE_CONFIG || {};
  const config = {
    url: String(rawConfig.url || rawConfig.supabaseUrl || "").trim(),
    publishableKey: String(rawConfig.publishableKey || rawConfig.anonKey || rawConfig.key || "").trim()
  };
  const keyLooksValid = /^(sb_publishable_|eyJ)/.test(config.publishableKey);
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.url) && keyLooksValid;
  const state = { client: null, session: null, signUpMode: false, localBypass: false, ready: false };

  function emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
  function setMessage(text = "", success = false) {
    const node = $("#authMessage");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("success", success);
  }
  function setBusy(busy) {
    ["#authSubmitButton", "#authGoogleButton", "#authAppleButton", "#authToggleMode"].forEach(sel => {
      const node = $(sel); if (node) node.disabled = busy;
    });
  }
  function updateMode() {
    $("#authSubmitButton").textContent = state.signUpMode ? "Crear cuenta" : "Iniciar sesión";
    $("#authToggleMode").textContent = state.signUpMode ? "Ya tengo una cuenta" : "Crear una cuenta";
    $("#authPassword").autocomplete = state.signUpMode ? "new-password" : "current-password";
    setMessage();
  }
  function openGate() {
    const gate = $("#authGate"); if (!gate) return;
    gate.hidden = false; document.body.classList.add("auth-locked");
  }
  function closeGate() {
    const gate = $("#authGate"); if (!gate) return;
    gate.hidden = true; document.body.classList.remove("auth-locked");
  }
  function updateAccountUI() {
    const email = state.session?.user?.email || "";
    const status = $("#accountStatusLabel");
    const label = $("#accountEmailLabel");
    const action = $("#accountActionButton");
    if (!status || !label || !action) return;
    if (state.session) {
      status.textContent = "Sesión iniciada";
      label.textContent = email || "Cuenta conectada";
      action.textContent = "Cerrar sesión";
    } else {
      status.textContent = configured ? "Sin sesión" : "Modo local";
      label.textContent = configured ? "Inicia sesión para sincronizar" : "Supabase pendiente de configurar";
      action.textContent = "Iniciar sesión";
    }
  }
  async function oauth(provider) {
    if (!state.client) return;
    setBusy(true); setMessage();
    const { error } = await state.client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.href.split("#")[0].split("?")[0] }
    });
    if (error) { setMessage(error.message); setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault();
    if (!state.client) return;
    const email = $("#authEmail").value.trim();
    const password = $("#authPassword").value;
    if (!email || password.length < 6) { setMessage("Introduce un correo válido y una contraseña de al menos 6 caracteres."); return; }
    setBusy(true); setMessage();
    const result = state.signUpMode
      ? await state.client.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href.split("#")[0].split("?")[0] } })
      : await state.client.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) { setMessage(result.error.message); return; }
    if (state.signUpMode && !result.data.session) {
      setMessage("Cuenta creada. Revisa tu correo para confirmarla.", true);
      return;
    }
  }
  async function signOut() {
    if (state.client && state.session) await state.client.auth.signOut();
    state.localBypass = false;
    openGate(); updateAccountUI();
  }
  async function init() {
    const configuredPanel = $("#authConfiguredPanel");
    const setupPanel = $("#authSetupPanel");
    if (!configured || !window.supabase?.createClient) {
      configuredPanel.hidden = true; setupPanel.hidden = false;
      const setupText = setupPanel.querySelector("p");
      if (setupText) setupText.innerHTML = 'Revisa <code>supabase-config.js</code>: la URL debe ser la de tu proyecto y la Publishable key debe empezar por <code>sb_publishable_</code> y estar entre comillas.';
      openGate();
      state.ready = true; updateAccountUI(); emit("wc-auth-ready", { session: null, configured: false }); return;
    }
    setupPanel.hidden = true; configuredPanel.hidden = false;
    state.client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    window.wcSupabase = state.client;
    const { data } = await state.client.auth.getSession();
    state.session = data.session;
    state.client.auth.onAuthStateChange((event, session) => {
      state.session = session;
      if (session) closeGate(); else if (event === "SIGNED_OUT") openGate();
      updateAccountUI(); emit("wc-auth-changed", { event, session });
    });
    state.ready = true;
    if (state.session) closeGate(); else openGate();
    updateAccountUI(); emit("wc-auth-ready", { session: state.session, configured: true });
  }
  document.addEventListener("DOMContentLoaded", () => {
    $("#authForm")?.addEventListener("submit", submit);
    $("#authToggleMode")?.addEventListener("click", () => { state.signUpMode = !state.signUpMode; updateMode(); });
    $("#authGoogleButton")?.addEventListener("click", () => oauth("google"));
    $("#authAppleButton")?.addEventListener("click", () => oauth("apple"));
    $("#authLocalButton")?.addEventListener("click", () => { state.localBypass = true; closeGate(); updateAccountUI(); emit("wc-auth-local-bypass"); });
    $("#accountActionButton")?.addEventListener("click", () => state.session ? signOut() : openGate());
    updateMode(); init().catch(error => { console.error(error); setMessage("No se pudo iniciar el sistema de cuentas."); openGate(); });
  });
  window.WCAuth = { get client(){ return state.client; }, get session(){ return state.session; }, get configured(){ return configured; }, open: openGate, signOut };
})();
