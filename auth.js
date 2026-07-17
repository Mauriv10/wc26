(() => {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const rawConfig = window.WC_SUPABASE_CONFIG || window.SUPABASE_CONFIG || {};
  const config = {
    url: String(rawConfig.url || rawConfig.supabaseUrl || "").trim(),
    publishableKey: String(rawConfig.publishableKey || rawConfig.anonKey || rawConfig.key || "").trim()
  };
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.url) && /^(sb_publishable_|eyJ)/.test(config.publishableKey);
  const state = { client: null, session: null, localBypass: false, ready: false };

  function emit(name, detail = {}) { window.dispatchEvent(new CustomEvent(name, { detail })); }
  function setMessage(text = "") { const n = $("#authMessage"); if (n) n.textContent = text; }
  function setBusy(busy) { const n = $("#authGoogleButton"); if (n) n.disabled = busy; }
  function showStep(name) {
    const welcome = $("#authWelcomeStep"), login = $("#authLoginStep");
    if (welcome) welcome.hidden = name !== "welcome";
    if (login) login.hidden = name !== "login";
    setMessage();
  }
  function showSplash(message = "Sincronizando…") {
    const splash = $("#appSplash"); if (!splash) return;
    const label = $("#splashMessage"); if (label) label.textContent = message;
    splash.hidden = false;
  }
  function hideSplash() { const splash = $("#appSplash"); if (splash) splash.hidden = true; }
  function openGate(step = "welcome") {
    const gate = $("#authGate"); if (!gate) return;
    gate.hidden = false; document.body.classList.add("auth-locked"); showStep(step); hideSplash();
  }
  function closeGate() {
    const gate = $("#authGate"); if (!gate) return;
    gate.hidden = true; document.body.classList.remove("auth-locked");
  }
  function userLabel(user) {
    return user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "Cuenta conectada";
  }
  function updateAccountUI() {
    const status = $("#accountStatusLabel"), label = $("#accountEmailLabel"), action = $("#accountActionButton");
    if (!status || !label || !action) return;
    if (state.session) { status.textContent = "Sincronizado"; label.textContent = userLabel(state.session.user); action.textContent = "Cerrar sesión"; }
    else { status.textContent = configured ? "Sin sesión" : "Modo local"; label.textContent = configured ? "Inicia sesión para sincronizar" : "Supabase pendiente"; action.textContent = "Iniciar sesión"; }
  }
  async function oauth() {
    if (!state.client) return;
    setBusy(true); setMessage(); showSplash("Abriendo Google…"); closeGate();
    const redirectTo = window.location.href.split("#")[0].split("?")[0];
    const { error } = await state.client.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) { hideSplash(); openGate("login"); setMessage(error.message); setBusy(false); }
  }
  async function signOut() {
    showSplash("Cerrando sesión…");
    if (state.client && state.session) await state.client.auth.signOut();
    state.localBypass = false; hideSplash(); openGate("welcome"); updateAccountUI();
  }
  async function init() {
    showSplash("Comprobando tu cuenta…");
    const configuredPanel = $("#authConfiguredPanel"), setupPanel = $("#authSetupPanel");
    if (!configured || !window.supabase?.createClient) {
      if (configuredPanel) configuredPanel.hidden = true;
      if (setupPanel) setupPanel.hidden = false;
      state.ready = true; updateAccountUI(); openGate("login"); emit("wc-auth-ready", { session: null, configured: false }); return;
    }
    if (setupPanel) setupPanel.hidden = true;
    if (configuredPanel) configuredPanel.hidden = false;
    state.client = window.supabase.createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    window.wcSupabase = state.client;
    const { data } = await state.client.auth.getSession();
    state.session = data.session;
    state.client.auth.onAuthStateChange((event, session) => {
      const previous = state.session;
      state.session = session;
      updateAccountUI();
      if (session) { closeGate(); showSplash("Cargando tus colecciones…"); }
      else if (event === "SIGNED_OUT") openGate("welcome");
      emit("wc-auth-changed", { event, session, previousSession: previous });
    });
    state.ready = true; updateAccountUI();
    if (state.session) { closeGate(); showSplash("Cargando tus colecciones…"); }
    else openGate("welcome");
    emit("wc-auth-ready", { session: state.session, configured: true });
  }
  document.addEventListener("DOMContentLoaded", () => {
    $("#authContinueButton")?.addEventListener("click", () => showStep("login"));
    $("#authBackButton")?.addEventListener("click", () => showStep("welcome"));
    $("#authGoogleButton")?.addEventListener("click", oauth);
    $("#authLocalButton")?.addEventListener("click", () => { state.localBypass = true; closeGate(); hideSplash(); updateAccountUI(); emit("wc-auth-local-bypass"); });
    $("#accountActionButton")?.addEventListener("click", () => state.session ? signOut() : openGate("welcome"));
    init().catch(error => { console.error(error); openGate("login"); setMessage("No se pudo iniciar el sistema de cuentas."); });
  });
  window.WCAuth = { get client(){ return state.client; }, get session(){ return state.session; }, get configured(){ return configured; }, open: openGate, signOut, showSplash, hideSplash };
})();
