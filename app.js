const APP_VERSION=globalThis.WC26_CONFIG?.version||"704.6.1";
const DATA_SCHEMA_VERSION=2;
const DATA_REVISION="2026-07-17-collections-v70111";
const MASTER_SEED_KEY="world-cup-2026-master-seed-revision";
const PROJECTS_KEY="world-cup-2026-projects-v600";
const ACTIVE_PROJECT_KEY="world-cup-2026-active-project-v600";
const LEGACY_KEYS={
 inventory:"panini-mercat-inventory-v423",
 team:"panini-mercat-team-v3",
 target:"panini-mercat-target-v3",
 session:"panini-mercat-session-v3",
 history:"panini-mercat-history-v3",
 sessions:"panini-mercat-finished-sessions-v3",
 exchange:"panini-mercat-exchange-v423"
};

let originalInventory={},masterInventories={},inventory={},flags={},teamGroups={},history=[],finishedSessions=[];
let sessionStats={plus:0,minus:0,startedAt:new Date().toISOString()};
let currentFilter="all",currentView="inventory",exchangeType="give",exchangeListType="give";
let exchange={give:{},receive:{}};
let projects={},activeProjectId="",pendingSync={},lastSyncedAt=null;
let mainTab="collection",collectionFilter="all",collectionTeamFilter="all",collectionSort="album";
let pendingExcelImport=null;

const CLOUD_STATE_TABLE="wc_user_state";
const CLOUD_LOCAL_META_KEY="world-cup-2026-cloud-meta-v7007";
let cloudSession=null,cloudSubscription=null,cloudSaveTimer=null,cloudApplying=false,cloudReady=false,cloudRevision=0,cloudLastUpdatedAt=null;
let pendingBackupRestore=null;
let appDataReady=false,appDataReadyResolve;
const appDataReadyPromise=new Promise(resolve=>{appDataReadyResolve=resolve});

const $=s=>document.querySelector(s);
const teamSelect=$("#teamSelect"),teamSearch=$("#teamSearch"),suggestions=$("#searchSuggestions");
const targetInput=$("#targetInput"),targetValue=$("#targetValue"),grid=$("#stickerGrid");
const toast=$("#toast"),undoButton=$("#undoButton"),emptyState=$("#emptyState");

function makeId(){return crypto.randomUUID?.()||`p-${Date.now()}-${Math.random().toString(16).slice(2)}`}
function emptyInventory(){return Object.fromEntries(Object.entries(originalInventory).map(([team,stickers])=>[team,Object.fromEntries(Object.keys(stickers).map(code=>[code,0]))]))}
function defaultProject(name,target,projectInventory,seedType="custom"){
 return {
   id:makeId(),name,target:Number(target)||1,seedType,inventory:structuredClone(projectInventory),
   history:[],finishedSessions:[],sessionStats:{plus:0,minus:0,startedAt:new Date().toISOString()},
   exchange:{give:{},receive:{}},teamOrder:Object.keys(projectInventory),selectedTeam:Object.keys(projectInventory)[0]||"",
   pendingSync:{},lastSyncedAt:null,ui:{teamFilter:"all",collectionFilter:"all",currentFilter:"all",sort:"album",mainTab:"collection",scrollY:0},createdAt:new Date().toISOString()
 };
}
function projectTeamOrder(project=projects?.[activeProjectId],sourceInventory=project?.inventory||inventory){
 const available=Object.keys(sourceInventory||{});
 const preferred=Array.isArray(project?.teamOrder)&&project.teamOrder.length
   ? project.teamOrder
   : Object.keys(masterInventories[project?.seedType]||{});
 const seen=new Set();
 return [...preferred,...available].filter(team=>available.includes(team)&&!seen.has(team)&&seen.add(team));
}
function currentTeamOrder(){return projectTeamOrder(projects?.[activeProjectId],inventory)}
function ensureProjectInventorySchema(project){
 if(!project||!project.inventory)return;
 // FWC se mostraba antiguamente como 01–20. La app usa ahora los códigos reales 00–19.
 const currentFwc=project.inventory.FWC||{};
 if(Object.prototype.hasOwnProperty.call(currentFwc,"20")&&!Object.prototype.hasOwnProperty.call(currentFwc,"00")){
   const migrated={};
   for(let n=1;n<=20;n++)migrated[String(n-1).padStart(2,"0")]=Number(currentFwc[String(n).padStart(2,"0")])||0;
   project.inventory.FWC=migrated;
 }
 // Coca-Cola es una colección independiente de colaboración, CC01–CC12.
 if(!project.inventory["Coca-Cola"])project.inventory["Coca-Cola"]=Object.fromEntries(Array.from({length:12},(_,i)=>[String(i+1).padStart(2,"0"),0]));
 else for(let n=1;n<=12;n++){const code=String(n).padStart(2,"0");if(!Object.prototype.hasOwnProperty.call(project.inventory["Coca-Cola"],code))project.inventory["Coca-Cola"][code]=0;}
}
function ensureProjectTeamOrder(project){
 if(!project)return;
 ensureProjectInventorySchema(project);
 project.teamOrder=projectTeamOrder(project,project.inventory);
 if(!project.selectedTeam||!project.inventory?.[project.selectedTeam])project.selectedTeam=project.teamOrder[0]||"";
 project.ui={teamFilter:"all",collectionFilter:"all",currentFilter:"all",sort:"album",mainTab:"collection",scrollY:0,...(project.ui||{})};
 if(project.ui.teamFilter!=="all"&&!project.inventory?.[project.ui.teamFilter])project.ui.teamFilter="all";
}
function migrateLegacy(seedProjects=[]){
 const created=seedProjects.map(seed=>defaultProject(seed.name,seed.target,seed.inventory,seed.seedType));
 if(!created.length){
   created.push(defaultProject("Mundial 2026 · 5 álbumes",5,structuredClone(originalInventory),"world-cup-2026-main"));
 }
 created[0].selectedTeam=localStorage.getItem(LEGACY_KEYS.team)||Object.keys(created[0].inventory)[0];
 projects=Object.fromEntries(created.map(project=>[project.id,project]));
 activeProjectId=created[0].id;
 persistProjects();
}
function findSeedProject(seed){
 return Object.values(projects).find(project=>
   project.seedType===seed.seedType||
   (seed.seedType==="panini-swiss-edition"&&normalize(project.name).includes("swiss"))||
   (seed.seedType==="world-cup-2026-main"&&(normalize(project.name).includes("mundial 2026")||normalize(project.name).includes("world cup")))
 );
}
function bootstrapProjectsFromSeed(seedData){
 const seedProjects=Array.isArray(seedData?.projects)?seedData.projects:[];
 masterInventories=Object.fromEntries(seedProjects.map(seed=>[seed.seedType,structuredClone(seed.inventory)]));
 originalInventory=structuredClone(masterInventories["world-cup-2026-main"]||originalInventory);

 // Build 700.7: los datos existentes pertenecen al usuario y nunca se sobrescriben
 // por una actualización de código o por una nueva revisión del archivo seed.
 if(projects&&Object.keys(projects).length){
   Object.values(projects).forEach(ensureProjectTeamOrder);
   if(!projects[activeProjectId])activeProjectId=Object.keys(projects)[0];
   return;
 }

 migrateLegacy(seedProjects);
 localStorage.setItem(MASTER_SEED_KEY,seedData.revision||DATA_REVISION);
}
function getMasterInventoryForProject(project){
 return structuredClone(masterInventories[project?.seedType]||originalInventory);
}
function persistProjects(){
 localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));
 localStorage.setItem(ACTIVE_PROJECT_KEY,activeProjectId);
 if(!cloudApplying)scheduleCloudSave();
}

function cloudClient(){return window.WCAuth?.client||window.wcSupabase||null}
function cloudMeta(){return readJSON(CLOUD_LOCAL_META_KEY,{revision:0,updatedAt:null,userId:null})}
function writeCloudMeta(meta){localStorage.setItem(CLOUD_LOCAL_META_KEY,JSON.stringify(meta))}
function cloudPayload(){
 commitProjectStateLocalOnly();
 return {format:"world-cup-2026-cloud-state",schemaVersion:DATA_SCHEMA_VERSION,dataOwner:"supabase-user",version:APP_VERSION,activeProjectId,projects:structuredClone(projects)};
}
function commitProjectStateLocalOnly(){
 const p=projects[activeProjectId];
 if(!p)return;
 p.inventory=structuredClone(inventory);p.history=structuredClone(history.slice(-300));
 p.finishedSessions=structuredClone(finishedSessions.slice(-100));p.sessionStats=structuredClone(sessionStats);
 p.exchange=structuredClone(exchange);p.pendingSync=structuredClone(pendingSync);p.lastSyncedAt=lastSyncedAt;
 p.target=getTarget();if(inventory[teamSelect.value])p.selectedTeam=teamSelect.value;
 p.ui={...(p.ui||{}),teamFilter:collectionTeamFilter,collectionFilter,currentFilter,sort:collectionSort,mainTab,scrollY:Math.max(0,Math.round(window.scrollY||0))};
 localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));
 localStorage.setItem(ACTIVE_PROJECT_KEY,activeProjectId);
}
function setCloudStatus(text,state="idle"){
 const node=$("#saveStatus");if(node)node.textContent=text;
 document.body.dataset.cloudState=state;
}
function scheduleCloudSave(delay=450){
 if(!cloudReady||!cloudSession||cloudApplying)return;
 clearTimeout(cloudSaveTimer);cloudSaveTimer=setTimeout(()=>saveCloudState().catch(console.error),delay);
}
async function saveCloudState(){
 const client=cloudClient();if(!client||!cloudSession||!navigator.onLine)return;
 clearTimeout(cloudSaveTimer);cloudSaveTimer=null;setCloudStatus("Sincronizando…","syncing");
 const nextRevision=Math.max(cloudRevision,Number(cloudMeta().revision)||0)+1;
 const payload=cloudPayload();
 const {data,error}=await client.from(CLOUD_STATE_TABLE).upsert({
   user_id:cloudSession.user.id,payload,revision:nextRevision,updated_at:new Date().toISOString()
 },{onConflict:"user_id"}).select("revision,updated_at").single();
 if(error){setCloudStatus("Guardado local · pendiente de nube","error");throw error}
 cloudRevision=Number(data.revision)||nextRevision;cloudLastUpdatedAt=data.updated_at;lastSyncedAt=data.updated_at;
 Object.values(projects).forEach(p=>{p.pendingSync={};p.lastSyncedAt=data.updated_at});pendingSync={};
 commitProjectStateLocalOnly();writeCloudMeta({revision:cloudRevision,updatedAt:data.updated_at,userId:cloudSession.user.id});
 updateSyncUI();setCloudStatus("✓ Guardado en la nube","synced");
}
async function applyCloudPayload(row,{silent=false}={}){
 if(!row?.payload?.projects)return false;
 cloudApplying=true;
 try{
   projects=structuredClone(row.payload.projects);
   // Supabase es la fuente de verdad. El código de la build nunca reinicia inventarios ni objetivos.
   Object.values(projects).forEach(ensureProjectTeamOrder);
   activeProjectId=row.payload.activeProjectId&&projects[row.payload.activeProjectId]?row.payload.activeProjectId:Object.keys(projects)[0];
   cloudRevision=Number(row.revision)||0;cloudLastUpdatedAt=row.updated_at||null;
   localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));localStorage.setItem(ACTIVE_PROJECT_KEY,activeProjectId);
   writeCloudMeta({revision:cloudRevision,updatedAt:cloudLastUpdatedAt,userId:cloudSession?.user?.id||null});
   loadProjectState();renderProjectsList();
   if(!silent)showToast("Datos actualizados desde la nube");
   setCloudStatus("✓ Sincronizado","synced");return true;
 }finally{cloudApplying=false}
}
function displayUserName(user){
 const raw=user?.user_metadata?.full_name||user?.user_metadata?.name||user?.email?.split("@")[0]||"";
 return String(raw).trim().split(/\s+/)[0]||"coleccionista";
}
function hideAppSplash(){window.WCAuth?.hideSplash?.();const splash=$("#appSplash");if(splash)splash.hidden=true}
function showReturningWelcome(session){
 hideAppSplash();
 const name=displayUserName(session?.user);
 showToast(`👋 Bienvenido de nuevo, ${name}`);
}
function openFirstCollectionOnboarding(session){
 hideAppSplash();
 const gate=$("#onboardingGate");if(!gate)return;
 $("#onboardingUserName").textContent=displayUserName(session?.user);
 $("#onboardingCreateStep").hidden=false;$("#onboardingReadyStep").hidden=true;
 $("#onboardingMessage").textContent="";
 gate.hidden=false;document.body.classList.add("onboarding-locked");
}
function closeFirstCollectionOnboarding(){
 const gate=$("#onboardingGate");if(gate)gate.hidden=true;
 document.body.classList.remove("onboarding-locked");
}
async function createFirstCloudCollection(event){
 event?.preventDefault();
 const name=$("#onboardingCollectionName")?.value.trim();
 const target=Math.max(1,Number(document.querySelector('input[name="onboardingTarget"]:checked')?.value)||5);
 const message=$("#onboardingMessage"),button=$("#onboardingCreateButton");
 if(!name){if(message)message.textContent="Escribe un nombre para la colección.";return}
 if(button){button.disabled=true;button.textContent="Creando colección…"}
 if(message)message.textContent="Sincronizando con la nube…";
 try{
   const seedType=Object.keys(masterInventories)[0]||"world-cup-2026-main";
   const base=structuredClone(masterInventories[seedType]||originalInventory);
   const blank=Object.fromEntries(Object.entries(base).map(([team,stickers])=>[team,Object.fromEntries(Object.keys(stickers).map(code=>[code,0]))]));
   const first=defaultProject(name,target,blank,seedType);
   projects={[first.id]:first};activeProjectId=first.id;
   localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));localStorage.setItem(ACTIVE_PROJECT_KEY,activeProjectId);
   loadProjectState();renderProjectsList();
   cloudReady=true;await saveCloudState();startRealtime();
   $("#onboardingCreateStep").hidden=true;$("#onboardingReadyStep").hidden=false;
 }catch(error){
   console.error(error);if(message)message.textContent="No se pudo crear la colección. Comprueba la conexión e inténtalo de nuevo.";
 }finally{if(button){button.disabled=false;button.textContent="Crear colección"}}
}
async function initialCloudSync(session){
 const client=cloudClient();if(!client||!session)return;
 await appDataReadyPromise;
 cloudSession=session;setCloudStatus("Conectando con la nube…","syncing");
 const {data,error}=await client.from(CLOUD_STATE_TABLE).select("payload,revision,updated_at").eq("user_id",session.user.id).maybeSingle();
 if(error){setCloudStatus("Falta preparar la base de datos","error");console.error(error);hideAppSplash();return}
 cloudReady=true;
 if(data?.payload?.projects&&Object.keys(data.payload.projects).length){
   await applyCloudPayload(data,{silent:true});startRealtime();showReturningWelcome(session);
 }else{
   cloudReady=false;openFirstCollectionOnboarding(session);
 }
}
function startRealtime(){
 const client=cloudClient();if(!client||!cloudSession)return;
 if(cloudSubscription)client.removeChannel(cloudSubscription);
 cloudSubscription=client.channel(`wc-state-${cloudSession.user.id}`).on("postgres_changes",{event:"UPDATE",schema:"public",table:CLOUD_STATE_TABLE,filter:`user_id=eq.${cloudSession.user.id}`},payload=>{
   const row=payload.new;if(!row||Number(row.revision)<=cloudRevision)return;applyCloudPayload(row).catch(console.error);
 }).subscribe();
}
window.addEventListener("wc-auth-ready",event=>{if(event.detail?.session)initialCloudSync(event.detail.session).catch(console.error)});
window.addEventListener("wc-auth-changed",event=>{
 const session=event.detail?.session;if(session&&!cloudReady)initialCloudSync(session).catch(console.error);
 if(!session){cloudSession=null;cloudReady=false;if(cloudSubscription)cloudClient()?.removeChannel(cloudSubscription);cloudSubscription=null}
});
window.addEventListener("online",()=>{if(cloudSession){cloudReady=true;scheduleCloudSave(100)}});

// Build 703.1: foreground recovery for iOS PWAs and desktop browser tabs.
// A token refresh or a restored page must not leave the loading overlay above
// an application whose cloud state is already available.
let foregroundRecoveryTimer=null;
function recoverFromForeground(){
 if(document.visibilityState&&document.visibilityState!=="visible")return;
 clearTimeout(foregroundRecoveryTimer);
 foregroundRecoveryTimer=setTimeout(()=>{
   const authGate=$("#authGate");
   const onboardingGate=$("#onboardingGate");
   const authIsOpen=authGate&&!authGate.hidden;
   const onboardingIsOpen=onboardingGate&&!onboardingGate.hidden;
   if(cloudReady&&!authIsOpen&&!onboardingIsOpen){
     hideAppSplash();
   }
 },120);
}
document.addEventListener("visibilitychange",recoverFromForeground);
window.addEventListener("pageshow",recoverFromForeground);
window.addEventListener("focus",recoverFromForeground);

function loadProjectState(){
 const p=projects[activeProjectId];
 ensureProjectTeamOrder(p);
 inventory=structuredClone(p.inventory);
 history=structuredClone(p.history||[]);
 finishedSessions=structuredClone(p.finishedSessions||[]);
 sessionStats=structuredClone(p.sessionStats||{plus:0,minus:0,startedAt:new Date().toISOString()});
 exchange=structuredClone(p.exchange||{give:{},receive:{}});
 pendingSync=structuredClone(p.pendingSync||{});
 lastSyncedAt=p.lastSyncedAt||null;
 targetInput.value=String(p.target||1);
 targetValue.textContent=String(p.target||1);
 const ui=p.ui||{};
 collectionTeamFilter=ui.teamFilter||"all";
 collectionFilter=ui.collectionFilter||"all";
 currentFilter=ui.currentFilter||"all";
 collectionSort=ui.sort||"album";
 mainTab=ui.mainTab||"collection";
 populateTeams();
 teamSelect.value=collectionTeamFilter==="all"?"all":(inventory[collectionTeamFilter]?collectionTeamFilter:"all");
 updateCurrentTeamUI();
 const sortNode=$("#collectionSort");if(sortNode)sortNode.value=collectionSort;
 document.querySelectorAll(".collection-filter-button").forEach(button=>button.classList.toggle("active",button.dataset.collectionFilter===collectionFilter));
 document.querySelectorAll(".tab").forEach(button=>button.classList.toggle("active",button.dataset.filter===currentFilter));
 $("#activeProjectName").textContent=p.name;
 renderAll();updateNavigationBadges();updateSyncUI();
 requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:Number(ui.scrollY)||0,left:0,behavior:"auto"})));
}
function commitProjectState(){
 commitProjectStateLocalOnly();
 scheduleCloudSave();
}

function updateConnectionStatus(){
 const online=navigator.onLine;
 document.body.classList.toggle("is-online",online);
 document.body.classList.toggle("is-offline",!online);
}
function showLoading(message="Cargando…"){
 let overlay=$("#loadingOverlay");
 if(!overlay){
   overlay=document.createElement("div");
   overlay.id="loadingOverlay";
   overlay.className="loading-overlay";
   overlay.innerHTML=`<div class="loading-card"><div class="loading-spinner"></div><strong id="loadingMessage"></strong></div>`;
   document.body.appendChild(overlay);
 }
 $("#loadingMessage").textContent=message;
 overlay.hidden=false;
 overlay.style.display="grid";
}
function hideLoading(){
 const overlay=$("#loadingOverlay");
 if(!overlay)return;
 overlay.hidden=true;
 overlay.style.display="none";
}
window.addEventListener("online",updateConnectionStatus);
window.addEventListener("offline",updateConnectionStatus);

async function loadData(){
 showLoading("Preparando tus colecciones…");
 const [i,f,g,s]=await Promise.all([
   fetch("./data/inventory.json"),
   fetch("./data/flags-v4.json"),
   fetch("./data/team-groups.json"),
   fetch("./data/projects-seed.json")
 ]);
 originalInventory=await i.json();flags=await f.json();teamGroups=await g.json();
 const seedData=await s.json();
 projects=readJSON(PROJECTS_KEY,null);
 activeProjectId=localStorage.getItem(ACTIVE_PROJECT_KEY)||"";
 bootstrapProjectsFromSeed(seedData);
 if(!projects||!Object.keys(projects).length||!projects[activeProjectId])migrateLegacy(seedData.projects);
 loadProjectState();
 renderProjectsList();
 setupSettingsCenter();
 document.body.classList.add("main-tab-collection");
 updateConnectionStatus();
 appDataReady=true;appDataReadyResolve?.();window.dispatchEvent(new CustomEvent("wc-app-data-ready"));
 hideLoading();
}
function readJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function normalize(s){return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function flagHTML(team){const flag=flags[team]||TEAM_FLAG_EMOJI?.[team]||"";return /^(?:\.|\/|https?:|data:)/.test(flag)?`<img src="${flag}" alt="">`:`<span class="inline-flag-emoji" aria-hidden="true">${flag}</span>`}
function formatTime(iso){return new Date(iso).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}
function getTarget(){return Math.max(1,Number(targetInput.value)||5)}
function keyFor(team,code){return `${team}|||${code}`}
function splitKey(key){const [team,code]=key.split("|||");return{team,code}}
function showToast(msg){toast.textContent=msg;toast.classList.add("show");clearTimeout(window.__tt);window.__tt=setTimeout(()=>toast.classList.remove("show"),900)}
function vibrate(){if("vibrate"in navigator)navigator.vibrate(12)}


function syncKey(team,code){return `${team}|||${code}`}
function markPendingSync(team,code,previous,next,source="manual"){
 const key=syncKey(team,code);
 const existing=pendingSync[key];
 pendingSync[key]={
   team,code,
   firstPrevious:existing?existing.firstPrevious:previous,
   latestValue:next,
   updatedAt:new Date().toISOString(),
   source
 };
}
function pendingSyncCount(){return Object.keys(pendingSync).length}
function isPendingSync(team,code){return Boolean(pendingSync[syncKey(team,code)])}
function updateSyncUI(){
 const count=pendingSyncCount();
 const countText=`${count} ${count===1?"cambio pendiente":"cambios pendientes"}`;
 const countNode=$("#pendingSyncCount");
 const badge=$("#projectPendingBadge");
 const button=$("#markSyncedButton");
 if(countNode)countNode.textContent=countText;
 if(badge)badge.textContent=`${count} pendientes`;
 if(button)button.disabled=count===0;
 if($("#lastSyncText")){
   $("#lastSyncText").textContent=lastSyncedAt
     ? `Última sincronización: ${new Date(lastSyncedAt).toLocaleString("es-ES",{dateStyle:"short",timeStyle:"short"})}`
     : "Todavía no sincronizado";
 }
}

function saveAll(message="Todo guardado"){
 commitProjectState();
 $("#saveStatus").textContent=message;
 $("#saveDot").textContent="✓";
}
function populateTeams(){
 teamSelect.innerHTML="";
 const allOption=document.createElement("option");
 allOption.value="all";allOption.textContent="Todas las selecciones";
 teamSelect.appendChild(allOption);
 currentTeamOrder().forEach(team=>{
   const option=document.createElement("option");
   option.value=team;option.textContent=team;
   teamSelect.appendChild(option);
 });
 renderTeamList(currentTeamOrder());
}

function updateCurrentTeamUI(){
 const team=teamSelect.value||"all";
 if(team==="all"){
   $("#currentTeamName").textContent="Todas las selecciones";
   $("#currentTeamFlag").removeAttribute("src");
   $("#currentTeamFlag").alt="Todas";
   $("#currentTeamFlag").style.display="none";
   return;
 }
 $("#currentTeamName").textContent=team;
 $("#currentTeamFlag").style.display="";
 $("#currentTeamFlag").src=flags[team]||"";
 $("#currentTeamFlag").alt=team;
}
function selectTeam(team){
 collectionTeamFilter=team&&inventory[team]?team:"all";
 teamSelect.value=collectionTeamFilter;
 teamSearch.value="";
 $("#dialogSearch").value="";
 suggestions.hidden=true;
 updateCurrentTeamUI();
 saveAll();
 renderAll();
}
function renderTeamList(teams){
 const worldButton=`<button class="team-option world-option" data-team="all">
   <span class="team-option-world-icon">🌍</span><strong>Todas las selecciones</strong>
 </button>`;
 const pinned=["FWC","Coca-Cola"].filter(team=>teams.includes(team));
 const regular=teams.filter(team=>!pinned.includes(team));
 const categoryButtons=pinned.map(team=>`<button class="team-option featured-team-option" data-team="${team}"><span class="team-option-world-icon">${TEAM_FLAG_EMOJI[team]||""}</span><strong>${team==="Coca-Cola"?"Coca-Cola · CC":team+" · Especiales"}</strong></button>`).join("");
 $("#teamList").innerHTML=worldButton+categoryButtons+regular.map(team=>`<button class="team-option" data-team="${team}">${flagHTML(team)}<strong>${team}</strong></button>`).join("");
 $("#teamList").querySelectorAll("button").forEach(button=>button.onclick=()=>{
   selectTeam(button.dataset.team);
   $("#teamDialog").close();
 });
}

function stateFor(qty){
 const need=Math.max(0,getTarget()-qty),offer=Math.max(0,qty-getTarget());
 if(need>0)return{kind:"need",text:`🔴 −${need}`,need,offer};
 if(offer>0)return{kind:"offer",text:`🟢 +${offer}`,need,offer};
 return{kind:"just",text:"🟡 JUSTO",need,offer};
}

function createCard(team,code,qty){
 const st=stateFor(qty),card=document.createElement("article");
 const stagedGive=getExchangeQty("give",team,code);
 const stagedReceive=getExchangeQty("receive",team,code);
 card.className=`sticker-card sticker-card-premium ${st.kind}`;
 card.dataset.code=code;
 card.innerHTML=`
   <div class="sticker-main">
     <div class="sticker-number">${code}</div>
     <div class="sticker-meta">
       <span class="sticker-stock-label">Stock</span>
       <strong class="sticker-stock-value">x${qty}</strong>
       <span class="status ${st.kind}">${st.text}</span>
     </div>
   </div>
   <div class="sticker-actions">
     ${currentView!=="exchange"||currentFilter!=="need"
       ? `<button class="step-button minus ${currentView==="exchange"?"exchange-action give-action":""}" aria-label="${currentView==="exchange"?"Marcar para dar":"Restar stock"}">
            <span class="button-symbol">${currentView==="exchange"?"DAR":"−"}</span>
            ${currentView==="exchange"&&stagedGive?`<small>✓ x${stagedGive}</small>`:""}
          </button>`
       : `<span class="exchange-action-placeholder"></span>`}
     ${currentView!=="exchange"||currentFilter!=="offer"
       ? `<button class="step-button plus ${currentView==="exchange"?"exchange-action receive-action":""}" aria-label="${currentView==="exchange"?"Marcar para recibir":"Sumar stock"}">
            <span class="button-symbol">${currentView==="exchange"?"RECIBIR":"+"}</span>
            ${currentView==="exchange"&&stagedReceive?`<small>✓ x${stagedReceive}</small>`:""}
          </button>`
       : `<span class="exchange-action-placeholder"></span>`}
   </div>`;
 const minusButton=card.querySelector(".minus");
 const plusButton=card.querySelector(".plus");
 if(minusButton)minusButton.onclick=e=>{
   const isExchange=currentView==="exchange";
   showActionFeedback(e.currentTarget,isExchange?"give":"minus",isExchange?"DAR ✓":"−1");
   const next=isExchange?getExchangeQty("give",team,code)+1:Math.max(0,(Number(inventory[team][code])||0)-1);
   showTopFeedback({
     type:isExchange?"exchange":"negative",
     title:`${team} ${code} ${isExchange?"preparado para dar":"eliminado"}`,
     detail:isExchange?`Marcados: x${next}`:`Inventario: x${next}`,
     key:`${isExchange?"give":"minus"}:${team}:${code}`
   });
   if(isExchange)stageFromMainList("give",team,code,e.currentTarget);
   else changeQuantity(team,code,-1,e.currentTarget);
 };
 if(plusButton)plusButton.onclick=e=>{
   const isExchange=currentView==="exchange";
   showActionFeedback(e.currentTarget,isExchange?"receive":"plus",isExchange?"RECIBIR ✓":"+1");
   const next=isExchange?getExchangeQty("receive",team,code)+1:(Number(inventory[team][code])||0)+1;
   showTopFeedback({
     type:isExchange?"exchange":"positive",
     title:`${team} ${code} ${isExchange?"preparado para recibir":"añadido"}`,
     detail:isExchange?`Marcados: x${next}`:`Inventario: x${next}`,
     key:`${isExchange?"receive":"plus"}:${team}:${code}`
   });
   if(isExchange)stageFromMainList("receive",team,code,e.currentTarget);
   else changeQuantity(team,code,1,e.currentTarget);
 };
 return card;
}

function isCurrentAlbumComplete(){const target=getTarget();return Object.values(inventory||{}).every(stickers=>Object.values(stickers||{}).every(qty=>Number(qty)>=target));}
function checkAlbumCompletion(previouslyComplete=false){
 const project=projects?.[activeProjectId];if(!project)return;project.ui=project.ui||{};
 const nowComplete=isCurrentAlbumComplete(),key=`${getTarget()}`;
 if(!nowComplete){if(project.ui.albumCompletedTarget===key)delete project.ui.albumCompletedTarget;return;}
 if(previouslyComplete||project.ui.albumCompletedTarget===key)return;
 project.ui.albumCompletedTarget=key;persistProjects();
 const overlay=$("#albumCompleteOverlay");if(overlay){$("#albumCompleteName").textContent=project.name||"Álbum";overlay.hidden=false;overlay.classList.add("show");navigator.vibrate?.([80,50,120]);}
}
function changeQuantity(team,code,delta,button){
 const wasComplete=isCurrentAlbumComplete();
 const previous=Number(inventory[team][code])||0,next=Math.max(0,previous+delta);
 if(next===previous)return;
 history.push({id:crypto.randomUUID?.()||String(Date.now()+Math.random()),team,code,previous,next,delta,at:new Date().toISOString()});
 inventory[team][code]=next;
 markPendingSync(team,code,previous,next,"inventario");
 delta>0?sessionStats.plus++:sessionStats.minus++;
 saveAll("✓ Guardado ahora");vibrate();
 const card=button.closest(".sticker-card");
 card?.classList.add(delta>0?"flash-card-plus":"flash-card-minus");
 setTimeout(()=>card?.classList.remove("flash-card-plus","flash-card-minus"),430);
 renderAll();checkAlbumCompletion(wasComplete);
 showToast(`✓ ${team} ${code} actualizado · x${next}`);
}
function matchesFilter(qty){
 const kind=stateFor(qty).kind;
 return currentFilter==="all"||(currentFilter==="need"&&kind==="need")||(currentFilter==="offer"&&kind==="offer");
}
function renderCards(){
 const team=inventory[teamSelect.value]?teamSelect.value:currentTeamOrder()[0];
 if(!team||!inventory[team])return;
 grid.innerHTML="";
 Object.entries(inventory[team]).sort(([a],[b])=>Number(a)-Number(b)).forEach(([code,q])=>{
   q=Number(q)||0;if(matchesFilter(q))grid.appendChild(createCard(team,code,q));
 });
 emptyState.hidden=grid.children.length>0;
}


function updateSettingsTargetUI(){
 const node=$("#settingsTargetValue");
 if(node)node.textContent=String(getTarget());
}

function updateGlobalDashboard(){
 const target=getTarget();
 let total=0,missing=0,repeats=0;
 Object.values(inventory).forEach(stickers=>{
   Object.values(stickers).forEach(raw=>{
     const qty=Number(raw)||0;
     total+=qty;
     missing+=Math.max(0,target-qty);
     repeats+=Math.max(0,qty-target);
   });
 });
 const totalNode=$("#globalInventoryTotal");
 const missingNode=$("#globalMissingTotal");
 const repeatsNode=$("#globalRepeatsTotal");
 if(totalNode)totalNode.textContent=total.toLocaleString("es-ES");
 if(missingNode)missingNode.textContent=missing.toLocaleString("es-ES");
 if(repeatsNode)repeatsNode.textContent=repeats.toLocaleString("es-ES");
}

function updateSummary(){
 const team=inventory[teamSelect.value]?teamSelect.value:currentTeamOrder()[0];
 if(!team||!inventory[team])return;
 const values=Object.values(inventory[team]).map(Number);
 let need=0,offer=0,total=0,needCards=0,offerCards=0;
 values.forEach(q=>{const s=stateFor(q);need+=s.need;offer+=s.offer;total+=q;if(s.kind==="need")needCards++;if(s.kind==="offer")offerCards++;});
 $("#needTotal").textContent=need;$("#offerTotal").textContent=offer;$("#selectionTotal").textContent=total;
 $("#tabAllCount").textContent=values.length;$("#tabNeedCount").textContent=needCards;$("#tabOfferCount").textContent=offerCards;
 $("#sessionChanges").textContent=`+${sessionStats.plus} / −${sessionStats.minus}`;
 const balance=sessionStats.plus-sessionStats.minus;$("#sessionBalance").textContent=(balance>0?"+":"")+balance;
}
function updateLastChange(){
 const last=history.at(-1);
 $("#lastChange").textContent=last?`Último cambio: ${last.team} ${last.code} · ${last.delta>0?"+1":"−1"} · ${formatTime(last.at)}`:"Sin cambios todavía";
}

function isShinySticker(team,code){
 return team==="FWC"||(team!=="Coca-Cola"&&code==="01");
}
function collectionStickerMatches(team,code,qty){
 const target=getTarget();
 const effectiveFilter=currentFilter==="need"?"missing":currentFilter==="offer"?"repeats":collectionFilter;
 if(effectiveFilter==="all")return true;
 if(effectiveFilter==="missing")return qty<target;
 if(effectiveFilter==="repeats")return qty>target;
 if(effectiveFilter==="shiny")return isShinySticker(team,code);
 if(effectiveFilter==="collaboration")return team==="Coca-Cola";
 return true;
}


let topFeedbackTimer=null;
let topFeedbackState={key:"",count:0,lastAt:0};

function showTopFeedback({type,title,detail,key}){
 const capsule=$("#topFeedbackCapsule");
 if(!capsule)return;

 const now=Date.now();
 if(key&&topFeedbackState.key===key&&now-topFeedbackState.lastAt<850){
   topFeedbackState.count+=1;
 }else{
   topFeedbackState={key:key||"",count:1,lastAt:now};
 }
 topFeedbackState.lastAt=now;

 capsule.classList.remove("positive","negative","exchange","show");
 capsule.classList.add(type);
 $("#topFeedbackIcon").textContent=type==="positive"?"✓":type==="negative"?"−":"⇄";
 $("#topFeedbackTitle").textContent=title;
 $("#topFeedbackDetail").textContent=topFeedbackState.count>1
   ? `${detail} · ${topFeedbackState.count} acciones`
   : detail;

 capsule.hidden=false;
 void capsule.offsetWidth;
 capsule.classList.add("show");

 clearTimeout(topFeedbackTimer);
 topFeedbackTimer=setTimeout(()=>{
   capsule.classList.remove("show");
   setTimeout(()=>{capsule.hidden=true},220);
 },1250);
}

function animateCounter(card,positive){
 if(!card)return;
 const counter=card.querySelector(".collection-sticker-qty,.sticker-stock-value");
 if(!counter)return;
 counter.classList.remove("counter-pop","positive","negative");
 void counter.offsetWidth;
 counter.classList.add("counter-pop",positive?"positive":"negative");
 setTimeout(()=>counter.classList.remove("counter-pop","positive","negative"),460);
}

function showActionFeedback(button,type,label){
 if(!button)return;
 button.classList.remove("press-feedback");
 void button.offsetWidth;
 button.classList.add("press-feedback");

 const card=button.closest(".collection-sticker,.sticker-card");
 if(!card)return;
 animateCounter(card,type==="plus"||type==="receive");

 const positive=type==="plus"||type==="receive";
 card.classList.remove("feedback-plus","feedback-minus");
 void card.offsetWidth;
 card.classList.add(positive?"feedback-plus":"feedback-minus");

 card.querySelectorAll(".action-feedback").forEach(node=>node.remove());
 const bubble=document.createElement("span");
 bubble.className=`action-feedback ${type}`;
 bubble.textContent=label;
 card.appendChild(bubble);

 setTimeout(()=>{
   bubble.remove();
   card.classList.remove("feedback-plus","feedback-minus");
   button.classList.remove("press-feedback");
 },760);

 if(navigator.vibrate){
   navigator.vibrate(positive?[18]:[12,22,12]);
 }
}

function createGlobalSticker(team,code,qty){
 const state=stateFor(qty);
 const item=document.createElement("article");
 const giveQty=getExchangeQty("give",team,code);
 const receiveQty=getExchangeQty("receive",team,code);
 const staged=giveQty||receiveQty;
 item.className=`collection-sticker ${state.kind} ${isShinySticker(team,code)?"shiny":""} ${staged?"exchange-staged":""}`;
 const exchangeMode=currentView==="exchange";
 item.innerHTML=`<div><span class="collection-sticker-code">${code}</span><div class="collection-sticker-qty">x${qty}</div></div>
 <div class="collection-sticker-actions ${exchangeMode?"exchange-actions":""}">
   ${exchangeMode
     ? `${currentFilter!=="need"?`<button class="give-global" data-type="give">DAR${giveQty?` <small>✓x${giveQty}</small>`:""}</button>`:"<span></span>"}
        ${currentFilter!=="offer"?`<button class="receive-global" data-type="receive">RECIBIR${receiveQty?` <small>✓x${receiveQty}</small>`:""}</button>`:"<span></span>"}`
     : `<button data-delta="-1" aria-label="Restar">−</button><button data-delta="1" aria-label="Sumar">+</button>`}
 </div>`;
 if(exchangeMode){
   item.querySelectorAll("button[data-type]").forEach(button=>button.onclick=()=>{
     const type=button.dataset.type;
     const current=getExchangeQty(type,team,code);
     if(type==="give"&&current>=qty){
       showToast(`No puedes marcar más de x${qty} para dar`);
       return;
     }
     setExchangeQty(type,team,code,current+1);
     showActionFeedback(button,type,type==="give"?"DAR ✓":"RECIBIR ✓");
     showTopFeedback({
       type:"exchange",
       title:`${team} ${code}`,
       detail:type==="give"?`Preparado para dar · x${current+1}`:`Preparado para recibir · x${current+1}`,
       key:`${type}:${team}:${code}`
     });
     saveAll("Intercambio preparado");
     setTimeout(()=>renderAll(),130);
   });
 }else{
   item.querySelectorAll("button[data-delta]").forEach(button=>button.onclick=()=>{
     const delta=Number(button.dataset.delta);
     const previous=Number(inventory[team][code])||0;
     const next=Math.max(0,previous+delta);
     if(next===previous)return;
     inventory[team][code]=next;
     markPendingSync(team,code,previous,next,"coleccion-global");
     history.push({id:makeId(),team,code,previous,next,delta,at:new Date().toISOString()});
     delta>0?sessionStats.plus++:sessionStats.minus++;
     saveAll("✓ Guardado ahora");
     showActionFeedback(button,delta>0?"plus":"minus",delta>0?"+1":"−1");
     showTopFeedback({
       type:delta>0?"positive":"negative",
       title:`${team} ${code} ${delta>0?"añadido":"eliminado"}`,
       detail:`Inventario: x${next}`,
       key:`${delta>0?"plus":"minus"}:${team}:${code}`
     });
     setTimeout(()=>renderAll(),130);
   });
 }
 return item;
}

function activeShareListType(){
 const effectiveFilter=currentFilter==="need"?"missing":currentFilter==="offer"?"repeats":collectionFilter;
 return effectiveFilter==="missing"||effectiveFilter==="repeats"?effectiveFilter:null;
}

function updateShareCollectionButton(){
 const button=$("#shareCollectionListButton");
 if(!button)return;
 const type=activeShareListType();
 button.hidden=!type;
 button.setAttribute("aria-label",type==="missing"?"Compartir cromos que me faltan":"Compartir cromos repetidos");
}

const TEAM_FLAG_EMOJI={
 "México":"🇲🇽","Sudáfrica":"🇿🇦","Corea del Sur":"🇰🇷","Chequia":"🇨🇿",
 "Canadá":"🇨🇦","Bosnia y Herzegovina":"🇧🇦","Catar":"🇶🇦","Suiza":"🇨🇭",
 "Brasil":"🇧🇷","Marruecos":"🇲🇦","Haití":"🇭🇹","Escocia":"🏴󠁧󠁢󠁳󠁣󠁴󠁿",
 "Estados Unidos":"🇺🇸","Paraguay":"🇵🇾","Australia":"🇦🇺","Turquía":"🇹🇷",
 "Alemania":"🇩🇪","Curazao":"🇨🇼","Costa de Marfil":"🇨🇮","Ecuador":"🇪🇨",
 "Países Bajos":"🇳🇱","Japón":"🇯🇵","Suecia":"🇸🇪","Túnez":"🇹🇳",
 "Bélgica":"🇧🇪","Egipto":"🇪🇬","Irán":"🇮🇷","Nueva Zelanda":"🇳🇿",
 "España":"🇪🇸","Cabo Verde":"🇨🇻","Arabia Saudita":"🇸🇦","Uruguay":"🇺🇾",
 "Francia":"🇫🇷","Senegal":"🇸🇳","Irak":"🇮🇶","Noruega":"🇳🇴",
 "Argentina":"🇦🇷","Argelia":"🇩🇿","Austria":"🇦🇹","Jordania":"🇯🇴",
 "Portugal":"🇵🇹","RD Congo":"🇨🇩","Uzbekistán":"🇺🇿","Colombia":"🇨🇴",
 "Inglaterra":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Croacia":"🇭🇷","Ghana":"🇬🇭","Panamá":"🇵🇦",
 "FWC":"⭐","Coca-Cola":"🥤"
};

const PANINI_TEAM_CODES={
 "FWC":"FWC","CC":"Coca-Cola","MEX":"México","RSA":"Sudáfrica","KOR":"Corea del Sur","CZE":"Chequia",
 "CAN":"Canadá","BIH":"Bosnia y Herzegovina","QAT":"Catar","SUI":"Suiza",
 "BRA":"Brasil","MAR":"Marruecos","HAI":"Haití","SCO":"Escocia",
 "USA":"Estados Unidos","PAR":"Paraguay","AUS":"Australia","TUR":"Turquía",
 "GER":"Alemania","CUW":"Curazao","CIV":"Costa de Marfil","ECU":"Ecuador",
 "NED":"Países Bajos","JPN":"Japón","SWE":"Suecia","TUN":"Túnez",
 "BEL":"Bélgica","EGY":"Egipto","IRN":"Irán","NZL":"Nueva Zelanda",
 "ESP":"España","CPV":"Cabo Verde","KSA":"Arabia Saudita","URU":"Uruguay",
 "FRA":"Francia","SEN":"Senegal","IRQ":"Irak","NOR":"Noruega",
 "ARG":"Argentina","ALG":"Argelia","AUT":"Austria","JOR":"Jordania",
 "POR":"Portugal","COD":"RD Congo","UZB":"Uzbekistán","COL":"Colombia",
 "ENG":"Inglaterra","CRO":"Croacia","GHA":"Ghana","PAN":"Panamá"
};
const TEAM_TO_PANINI_CODE=Object.fromEntries(Object.entries(PANINI_TEAM_CODES).map(([code,team])=>[team,code]));
const PANINI_CODE_ALIASES={JAP:"JPN",SAU:"KSA",NLD:"NED",HOL:"NED",KOR:"KOR",RDC:"COD",DRC:"COD",BOS:"BIH",CZR:"CZE",CRC:"CUW"};

// Nombres admitidos para listas copiadas desde WhatsApp, en castellano e inglés.
const PANINI_TEAM_NAME_ALIASES={
 FWC:["fwc","fifa world cup","mundial"],CC:["cc","coca cola","coca-cola","cocacola","colaboracion coca cola","colaboración coca cola"],
 MEX:["mexico","méxico"],RSA:["south africa","sudafrica","sudáfrica"],KOR:["south korea","korea republic","corea del sur","corea"],CZE:["czechia","czech republic","chequia","republica checa","república checa"],
 CAN:["canada","canadá"],BIH:["bosnia and herzegovina","bosnia-herzegovina","bosnia y herzegovina","bosnia"],QAT:["qatar","catar"],SUI:["switzerland","suiza"],
 BRA:["brazil","brasil"],MAR:["morocco","marruecos","morroco","marocco"],HAI:["haiti","haití"],SCO:["scotland","escocia"],
 USA:["united states","usa","estados unidos","eeuu","estados unidos de america"],PAR:["paraguay"],AUS:["australia"],TUR:["turkey","turkiye","türkiye","turquia","turquía"],
 GER:["germany","alemania"],CUW:["curacao","curaçao","curazao","curazao"],CIV:["ivory coast","cote d ivoire","côte d'ivoire","costa de marfil"],ECU:["ecuador"],
 NED:["netherlands","holland","paises bajos","países bajos","holanda"],JPN:["japan","japon","japón"],SWE:["sweden","suecia"],TUN:["tunisia","tunez","túnez"],
 BEL:["belgium","belgica","bélgica"],EGY:["egypt","egipto"],IRN:["iran","irán"],NZL:["new zealand","nueva zelanda"],
 ESP:["spain","espana","españa"],CPV:["cape verde","cabo verde"],KSA:["saudi arabia","arabia saudita","arabia saudi"],URU:["uruguay"],
 FRA:["france","francia"],SEN:["senegal"],IRQ:["iraq","irak"],NOR:["norway","noruega"],
 ARG:["argentina"],ALG:["algeria","argelia"],AUT:["austria"],JOR:["jordan","jordania"],
 POR:["portugal"],COD:["dr congo","d r congo","democratic republic of congo","rd congo","republica democratica del congo","república democrática del congo","congo"],UZB:["uzbekistan","uzbekistán"],COL:["colombia"],
 ENG:["england","inglaterra"],CRO:["croatia","croacia"],GHA:["ghana"],PAN:["panama","panamá"]
};
function normalizeTradeName(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
const PANINI_NORMALIZED_NAME_TO_CODE=(()=>{const map={};Object.keys(PANINI_TEAM_CODES).forEach(code=>{map[normalizeTradeName(code)]=code;});Object.entries(PANINI_TEAM_NAME_ALIASES).forEach(([code,names])=>names.forEach(name=>map[normalizeTradeName(name)]=code));return map;})();
const PANINI_SORTED_NAME_ALIASES=Object.keys(PANINI_NORMALIZED_NAME_TO_CODE).sort((a,b)=>b.length-a.length);
function teamSearchText(team){
 const code=TEAM_TO_PANINI_CODE[team]||team;
 const aliases=PANINI_TEAM_NAME_ALIASES[code]||[];
 return normalizeTradeName([team,code,...aliases].join(" "));
}
function filterTeamsByQuery(query){
 const q=normalizeTradeName(query);
 if(!q)return currentTeamOrder();
 return currentTeamOrder().filter(team=>teamSearchText(team).includes(q));
}

function paniniDisplayCode(team,internalCode){
 const n=Number(internalCode);
 return String(n).padStart(2,"0");
}

function paniniInternalCode(team,displayNumber){
 const n=Number(displayNumber);
 if(!Number.isInteger(n))return null;
 if(team==="FWC")return n>=0&&n<=19?String(n).padStart(2,"0"):null;
 if(team==="Coca-Cola")return n>=1&&n<=12?String(n).padStart(2,"0"):null;
 return n>=1&&n<=20?String(n).padStart(2,"0"):null;
}


function collectShareGroups(type){
 const target=getTarget();
 const groups=[];
 let totalUnits=0;
 currentTeamOrder().forEach(team=>{
   const stickers=inventory[team]||{};
   const items=Object.entries(stickers)
     .map(([code,raw])=>{
       const qty=Number(raw)||0;
       const units=type==="missing"?Math.max(0,target-qty):Math.max(0,qty-target);
       return {code,units};
     })
     .filter(item=>item.units>0)
     .sort((a,b)=>Number(a.code)-Number(b.code));
   if(!items.length)return;
   totalUnits+=items.reduce((sum,item)=>sum+item.units,0);
   groups.push({team,items});
 });
 return {groups,totalUnits};
}

function buildShareCollectionText(type,{flags=false,compact=false}={}){
 const projectName=projects?.[activeProjectId]?.name||"Mundial 2026";
 const {groups,totalUnits}=collectShareGroups(type);
 if(!groups.length)return {text:"",totalUnits:0};
 const missing=type==="missing";
 const lines=[
   "🏆 "+projectName,
   "",
   missing?`Me faltan ${totalUnits} cromos`:`Tengo ${totalUnits} cromos repetidos para cambiar`,
   ""
 ];
 groups.forEach((group,index)=>{
   const officialCode=TEAM_TO_PANINI_CODE[group.team]||group.team;
   const heading=(flags?`${TEAM_FLAG_EMOJI[group.team]||""} `:"")+officialCode;
   const stickers=group.items.map(item=>{
     const shown=paniniDisplayCode(group.team,item.code);
     return item.units>1?`${shown} x${item.units}`:shown;
   }).join(", ");
   if(compact){
     lines.push(`${heading.trim()}: ${stickers}`);
   }else{
     lines.push(heading.trim());
     lines.push(stickers);
     if(index<groups.length-1)lines.push("");
   }
 });
 return {text:lines.join("\n"),totalUnits};
}

function openShareOptions(){
 const type=activeShareListType();
 if(!type)return;
 const {totalUnits}=collectShareGroups(type);
 if(!totalUnits){
   showToast(type==="missing"?"No te falta ningún cromo":"No tienes cromos repetidos");
   return;
 }
 const sheet=$("#shareOptionsSheet");
 if(!sheet)return;
 sheet.dataset.type=type;
 $("#shareOptionsTitle").textContent=type==="missing"?"Compartir cromos que me faltan":"Compartir cromos repetidos";
 sheet.hidden=false;
 requestAnimationFrame(()=>sheet.classList.add("open"));
 document.body.classList.add("share-sheet-open");
}

function closeShareOptions(){
 const sheet=$("#shareOptionsSheet");
 if(!sheet)return;
 sheet.classList.remove("open");
 document.body.classList.remove("share-sheet-open");
 setTimeout(()=>{if(!sheet.classList.contains("open"))sheet.hidden=true;},180);
}

async function copyShareText(text){
 if(navigator.clipboard?.writeText){
   await navigator.clipboard.writeText(text);
   return;
 }
 const area=document.createElement("textarea");
 area.value=text;
 area.setAttribute("readonly","");
 area.style.position="fixed";
 area.style.opacity="0";
 document.body.appendChild(area);
 area.select();
 const copied=document.execCommand("copy");
 area.remove();
 if(!copied)throw new Error("No se pudo copiar la lista");
}


function actionFeedback(button,{busy="Procesando…",done="Hecho ✓",error="Error"}={}){
 if(!button)return {success(){},fail(){},restore(){}};
 const original=button.dataset.originalLabel||button.textContent;
 button.dataset.originalLabel=original;
 button.disabled=true;button.classList.add("is-working");button.textContent=busy;
 vibrate();
 let timer;
 const finish=(label,cls)=>{clearTimeout(timer);button.classList.remove("is-working","is-success","is-error");button.classList.add(cls);button.textContent=label;timer=setTimeout(()=>{button.disabled=false;button.classList.remove(cls);button.textContent=original;},1100)};
 return {success(label=done){finish(label,"is-success")},fail(label=error){finish(label,"is-error")},restore(){clearTimeout(timer);button.disabled=false;button.classList.remove("is-working","is-success","is-error");button.textContent=original}};
}

async function runShareOption(mode){
 const type=$("#shareOptionsSheet")?.dataset.type||activeShareListType();
 if(!type)return;
 const options=mode==="share"?{flags:true,compact:true}:mode==="compact"?{flags:false,compact:true}:{flags:false,compact:false};
 const {text,totalUnits}=buildShareCollectionText(type,options);
 if(!text||!totalUnits){
   closeShareOptions();
   showToast(type==="missing"?"No te falta ningún cromo":"No tienes cromos repetidos");
   return;
 }
 const title=type==="missing"?"Cromos que me faltan":"Cromos repetidos";
 closeShareOptions();
 try{
   if(mode==="share"){
     // En iOS el Web Share API altera el viewport visual al volver de WhatsApp.
     // Abrimos WhatsApp directamente y mantenemos el scroll dentro del shell de la app.
     await copyShareText(text);
     showToast("Lista copiada · abriendo WhatsApp…");
     const whatsappUrl=`whatsapp://send?text=${encodeURIComponent(text)}`;
     setTimeout(()=>{window.location.href=whatsappUrl;},80);
     return;
   }
   await copyShareText(text);
   showToast(mode==="compact"?"Lista compacta copiada ✓":"Lista copiada al portapapeles ✓");
 }catch(error){
   if(error?.name==="AbortError"){
     document.documentElement.style.scrollBehavior="auto";
     document.body.style.scrollBehavior="auto";
     requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:window.scrollY,left:0,behavior:"auto"})));
     return;
   }
   try{
     await copyShareText(text);
     showToast("Lista copiada al portapapeles ✓");
   }catch(copyError){
     console.error("No se pudo compartir la lista",error,copyError);
     showToast("No se pudo compartir la lista");
   }
 }
}

const DEFAULT_TOP_STARS={
 "ESP|15":"Lamine Yamal","ENG|11":"Jude Bellingham","ENG|18":"Harry Kane",
 "FRA|20":"Kylian Mbappé","FRA|15":"Ousmane Dembélé","FRA|14":"Michael Olise",
 "POR|15":"Cristiano Ronaldo","ARG|17":"Lionel Messi","NZL|06":"Tim Payne","CPV|02":"Vozinha"
};

function tradeStickerKey(item){return `${item.officialCode}|${item.displayCode}`}
function currentTradePreferences(){
 const project=projects?.[activeProjectId];
 if(!project)return {stars:{},protected:{}};
 project.tradePreferences=project.tradePreferences||{stars:{},protected:{}};
 project.tradePreferences.stars=project.tradePreferences.stars||{};
 project.tradePreferences.protected=project.tradePreferences.protected||{};
 return project.tradePreferences;
}
function isTradeStar(item){const key=tradeStickerKey(item);return Boolean(DEFAULT_TOP_STARS[key]||currentTradePreferences().stars[key])}
function isTradeProtected(item){const key=tradeStickerKey(item);return Boolean(DEFAULT_TOP_STARS[key]||currentTradePreferences().protected[key])}
function tradeStarName(item){return DEFAULT_TOP_STARS[tradeStickerKey(item)]||""}
function tradeStickerCategory(item){return item.team==="Coca-Cola"?"collaboration":item.team==="FWC"||(item.team!=="Coca-Cola"&&Number(item.displayCode)===1)?"special":"normal"}
function toggleTradeMark(item,type){
 const prefs=currentTradePreferences();const key=tradeStickerKey(item);
 if(DEFAULT_TOP_STARS[key]&&type==="protected"){showToast("Esta estrella TOP está protegida por defecto");return;}
 prefs[type][key]=!prefs[type][key];if(!prefs[type][key])delete prefs[type][key];
 persistProjects();renderTradeAnalyzerResult();
}

function levenshteinDistance(a,b){
 const rows=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
 for(let i=0;i<=a.length;i++)rows[i][0]=i;
 for(let j=0;j<=b.length;j++)rows[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)rows[i][j]=Math.min(rows[i-1][j]+1,rows[i][j-1]+1,rows[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
 return rows[a.length][b.length];
}
function suggestPaniniCode(rawCode){
 const code=String(rawCode||"").toUpperCase();const alias=PANINI_CODE_ALIASES[code];if(alias)return alias;
 const best=Object.keys(PANINI_TEAM_CODES).map(candidate=>({candidate,d:levenshteinDistance(code,candidate)})).sort((a,b)=>a.d-b.d)[0];
 return best&&best.d<=1?best.candidate:null;
}
function suggestPaniniTeamName(rawName){
 const normalized=normalizeTradeName(rawName);if(!normalized)return null;
 const best=PANINI_SORTED_NAME_ALIASES.map(alias=>({alias,d:levenshteinDistance(normalized,alias)})).sort((a,b)=>a.d-b.d||a.alias.length-b.alias.length)[0];
 const limit=normalized.length<=5?1:Math.max(2,Math.floor(normalized.length*.22));
 return best&&best.d<=limit?PANINI_NORMALIZED_NAME_TO_CODE[best.alias]:null;
}
function parseTradeList(rawText){
 const found=[],invalid=[],foundByKey=new Map(),invalidSeen=new Set();
 const addInvalid=(raw,reason,suggestion="")=>{const key=`${raw}|${reason}`;if(!raw||invalidSeen.has(key))return;invalidSeen.add(key);invalid.push({raw,reason,suggestion});};
 const addSticker=(rawCode,number,rawToken,requestedUnits=1)=>{
   let code=String(rawCode||"").toUpperCase();code=PANINI_CODE_ALIASES[code]||code;const team=PANINI_TEAM_CODES[code];
   if(!team){addInvalid(rawToken||`${rawCode}${number}`,"Selección no reconocida",suggestPaniniCode(rawCode)||suggestPaniniTeamName(rawCode)||"");return;}
   const internalCode=paniniInternalCode(team,number);if(!internalCode){addInvalid(rawToken||`${code}${number}`,team==="FWC"?"FWC admite números del 00 al 19":team==="Coca-Cola"?"CC admite números del 01 al 12":"El número debe estar entre 01 y 20");return;}
   const key=`${team}|${internalCode}`;const units=Math.max(1,Number(requestedUnits)||1);const existing=foundByKey.get(key);
   if(existing){existing.requestedUnits+=units;return;}
   const item={team,officialCode:code,internalCode,displayCode:paniniDisplayCode(team,internalCode),requestedUnits:units};foundByKey.set(key,item);found.push(item);
 };
 String(rawText||"").replace(/\r/g,"").split("\n").forEach(originalLine=>{
   const quantityMatch=originalLine.match(/[×xX]\s*(\d+)/);const requestedUnits=quantityMatch?Math.max(1,Number(quantityMatch[1])||1):1;
   const clean=originalLine.replace(/[×xX]\s*\d+/g,"").replace(/[：]/g,":").trim();if(!clean)return;
   const heading=normalizeTradeName(clean).replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
   const ignoredHeadings=["he needs from you","he gives you","what i need","what i give","missing","duplicates","needed","offered","faltantes","repetidas","lo que necesito","lo que doy","figuritas app liste","figuritas app list","figuritas app lista"];
   if(ignoredHeadings.some(value=>heading===value||heading.startsWith(value+" ")))return;

   // Formato compacto con uno o varios códigos: ESP15, ESP 15, KSA01...
   const compactMatches=[...clean.toUpperCase().matchAll(/(?:^|[^A-Z])([A-Z]{3})\s*[:]?\s*(\d{1,2})(?=$|[^0-9])/g)];
   if(compactMatches.length){
     compactMatches.forEach(m=>addSticker(m[1],m[2],m[0].trim(),requestedUnits));
     const residue=clean.toUpperCase().replace(/(?:^|[^A-Z])([A-Z]{3})\s*[:]?\s*(\d{1,2})(?=$|[^0-9])/g," ").replace(/[\s,;:\-–—]+/g,"").trim();
     if(!residue)return;
   }

   // Nombre completo o abreviatura al principio; el guion se trata como separador, no como rango.
   const normalizedLine=normalizeTradeName(clean);
   let matchedAlias="";
   for(const alias of PANINI_SORTED_NAME_ALIASES){if(normalizedLine===alias||normalizedLine.startsWith(alias+" ")){matchedAlias=alias;break;}}
   if(matchedAlias){
     const code=PANINI_NORMALIZED_NAME_TO_CODE[matchedAlias];
     const words=matchedAlias.split(" ").length;
     const normalizedParts=normalizedLine.split(" ");
     const numericText=normalizedParts.slice(words).join(" ");
     const nums=[...numericText.matchAll(/\b(\d{1,2})\b/g)].map(m=>m[1]);
     if(nums.length){nums.forEach(n=>addSticker(code,n,`${code}${n}`,requestedUnits));return;}
     addInvalid(clean,"No se ha encontrado ningún número de cromo");return;
   }

   // Si hay números pero el país no se reconoce, sugerir la selección más próxima.
   const nums=[...clean.matchAll(/\b(\d{1,2})\b/g)].map(m=>m[1]);
   if(nums.length){
     const rawName=clean.replace(/[\d,;:\-–—]+/g," ").trim();
     addInvalid(clean,"Selección no reconocida",suggestPaniniTeamName(rawName)||suggestPaniniCode(rawName)||"");
   }else addInvalid(clean,"No se ha encontrado ningún código o selección");
 });
 return {found,invalid};
}
function groupTradeAnalysis(items){const order=currentTeamOrder(),groups={};items.forEach(item=>(groups[item.team]||=[]).push(item));return Object.entries(groups).sort((a,b)=>order.indexOf(a[0])-order.indexOf(b[0]));}
function escapeTradeHtml(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[char]);}
function applyTradeAnalyzerSuggestion(raw,replacement){const input=$("#tradeAnalyzerInput");if(!input||!raw||!replacement)return;const escaped=String(raw).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");input.value=input.value.replace(new RegExp(escaped,"i"),replacement);renderTradeAnalyzerResult();}
function editTradeAnalyzerList(){const dialog=$("#tradeAnalyzerDialog");dialog?.classList.remove("analyzed","exchange-step");$("#tradeAnalyzerEntry").hidden=false;$("#tradeAnalyzerResult").hidden=true;$("#tradeAnalyzerBody")?.scrollTo({top:0,behavior:"auto"});setTimeout(()=>$("#tradeAnalyzerInput")?.focus(),60);}
function tradeCopyLines(items,includeQuantities=true){return groupTradeAnalysis(items).map(([team,rows])=>`${TEAM_FLAG_EMOJI[team]||""} ${TEAM_TO_PANINI_CODE[team]||team}: ${rows.map(row=>{const units=Object.prototype.hasOwnProperty.call(row,"selectedUnits")?row.selectedUnits:row.available;return includeQuantities&&units>1?`${row.displayCode} x${units}`:row.displayCode;}).join(" ")}`);}
function chooseBalancedTrade(available,normalNeeded,specialNeeded,collaborationNeeded=0,allowDuplicates=false){const pool=available.filter(x=>!isTradeProtected(x)&&!isTradeStar(x)).sort((a,b)=>b.available-a.available||currentTeamOrder().indexOf(a.team)-currentTeamOrder().indexOf(b.team)||Number(a.displayCode)-Number(b.displayCode));const take=(category,needed)=>{const candidates=pool.filter(x=>tradeStickerCategory(x)===category),selected=[];let left=Math.max(0,Number(needed)||0);for(const item of candidates){if(left<=0)break;selected.push({...item,selectedUnits:1});left--;}if(allowDuplicates&&left>0){let pass=2;while(left>0){let added=false;for(const item of candidates){if(left<=0)break;if(item.available>=pass){selected.find(x=>tradeStickerKey(x)===tradeStickerKey(item)).selectedUnits++;left--;added=true;}}if(!added)break;pass++;}}return {selected,left};};const normals=take("normal",normalNeeded),specials=take("special",specialNeeded),collaborations=take("collaboration",collaborationNeeded);return {items:[...normals.selected,...specials.selected,...collaborations.selected],missingNormal:normals.left,missingSpecial:specials.left,missingCollaboration:collaborations.left};}
function renderInvalidLines(items){if(!items.length)return "";return `<div class="trade-review-list">${items.map(item=>{const numberMatch=String(item.raw).match(/(\d{1,2})/),replacement=item.suggestion&&numberMatch?`${item.suggestion}${String(numberMatch[1]).padStart(2,"0")}`:"";return `<div class="trade-review-item"><div><strong>${escapeTradeHtml(item.raw)}</strong><small>${escapeTradeHtml(item.reason)}</small></div>${replacement?`<button type="button" data-raw="${escapeTradeHtml(item.raw)}" data-replacement="${escapeTradeHtml(replacement)}">Corregir</button>`:""}</div>`;}).join("")}</div>`;}
function wireInvalidCorrections(root){root.querySelectorAll("[data-replacement]").forEach(b=>b.addEventListener("click",()=>applyTradeAnalyzerSuggestion(b.dataset.raw,b.dataset.replacement)));}
function renderBalancedStickerList(items){
 const normal=items.filter(item=>tradeStickerCategory(item)==="normal"),special=items.filter(item=>tradeStickerCategory(item)==="special"),collaboration=items.filter(item=>tradeStickerCategory(item)==="collaboration");
 const section=(label,rows,detail="")=>{if(!rows.length)return "";const units=rows.reduce((sum,item)=>sum+(item.selectedUnits||1),0);return `<section class="balanced-sticker-section"><header><strong>${label}</strong><span>${units}${detail}</span></header><div class="balanced-sticker-groups">${groupTradeAnalysis(rows).map(([team,teamRows])=>`<div class="balanced-sticker-row"><b>${TEAM_FLAG_EMOJI[team]||""} ${TEAM_TO_PANINI_CODE[team]||team}</b><span>${teamRows.map(row=>{const units=row.selectedUnits||1;return `${row.displayCode}${units>1?` ×${units}`:""}`;}).join(" · ")}</span></div>`).join("")}</div></section>`;};
 return `${section("Normales",normal," cromos")}${section("Especiales",special," cromos")}${section("Colaboración",collaboration," cromos")}`;
}
function applyAssistantTrade(receivedItems,givenItems,button){
 if(!receivedItems?.length){showToast("Pega la lista recibida para actualizar el inventario");return;}
 if(button.disabled)return;button.disabled=true;
 const wasComplete=isCurrentAlbumComplete(),now=new Date().toISOString(),changes=[];
 for(const item of givenItems||[]){const qty=Number(item.selectedUnits)||1,previous=Number(inventory[item.team]?.[item.internalCode])||0;if(previous<qty){button.disabled=false;showToast(`Stock insuficiente: ${item.team} ${item.displayCode}`);return;}changes.push({item,delta:-qty,previous,next:previous-qty});}
 for(const item of receivedItems){const previous=Number(inventory[item.team]?.[item.internalCode])||0;changes.push({item,delta:1,previous,next:previous+1});}
 changes.forEach(({item,delta,previous,next})=>{inventory[item.team][item.internalCode]=next;markPendingSync(item.team,item.internalCode,previous,next,"asistente-intercambio");history.push({id:makeId(),team:item.team,code:item.internalCode,previous,next,delta,at:now,source:"asistente-intercambio"});if(delta>0)sessionStats.plus+=delta;else sessionStats.minus+=Math.abs(delta);});
 saveAll("Intercambio completado");renderAll();checkAlbumCompletion(wasComplete);button.textContent="Intercambio completado ✓";showToast("✓ Inventario actualizado");
}
function renderBalancedTrade(box,available,normalNeeded,specialNeeded,collaborationNeeded=0,allowDuplicates=null,receivedItems=null){
 const balanced=chooseBalancedTrade(available,normalNeeded,specialNeeded,collaborationNeeded,allowDuplicates===true),delivered=balanced.items.reduce((s,x)=>s+(x.selectedUnits||1),0),short=balanced.missingNormal+balanced.missingSpecial+balanced.missingCollaboration;
 const canApply=Array.isArray(receivedItems)&&receivedItems.length>0;
 box.innerHTML=`<div class="trade-clean-status"><strong>${delivered} cromos para entregar</strong></div>${short&&allowDuplicates===null?`<div class="trade-clean-choice"><span>Solo tienes ${delivered} cromos diferentes disponibles.</span><button type="button" data-balance-choice="different">Usar solo diferentes</button><button type="button" class="primary" data-balance-choice="duplicates">Completar con iguales</button></div>`:short?`<p class="trade-clean-note">La propuesta queda ${short} unidades por debajo.</p>`:""}${balanced.items.length?`<div class="balanced-sticker-list">${renderBalancedStickerList(balanced.items)}</div><button id="copyBalancedTrade" class="primary trade-main-action" type="button">Copiar intercambio</button><button id="completeAssistantTrade" class="trade-main-action complete-trade-action" type="button" ${canApply?"":"disabled"}>Completar intercambio</button>${canApply?"":`<p class="trade-clean-note">Para actualizar el inventario automáticamente, pega la lista exacta que vas a recibir.</p>`}`:""}`;
 box.querySelector('[data-balance-choice="different"]')?.addEventListener("click",()=>renderBalancedTrade(box,available,normalNeeded,specialNeeded,collaborationNeeded,false,receivedItems));
 box.querySelector('[data-balance-choice="duplicates"]')?.addEventListener("click",()=>renderBalancedTrade(box,available,normalNeeded,specialNeeded,collaborationNeeded,true,receivedItems));
 $("#copyBalancedTrade")?.addEventListener("click",async event=>{const fb=actionFeedback(event.currentTarget,{busy:"Copiando…",done:"Copiado ✓"});try{await copyShareText(tradeCopyLines(balanced.items,true).join("\n"));fb.success();}catch{fb.fail("Error");}});
 $("#completeAssistantTrade")?.addEventListener("click",event=>applyAssistantTrade(receivedItems,balanced.items,event.currentTarget));
}
function renderExchangeStep(available){
 const result=$("#tradeAnalyzerResult"),dialog=$("#tradeAnalyzerDialog");dialog?.classList.add("exchange-step");
 result.innerHTML=`<button id="backToTradeSummary" class="trade-back-button" type="button">← Volver</button><div class="trade-clean-card"><h3>¿Qué te dará la otra persona?</h3><div class="trade-receive-tabs"><button type="button" class="active" data-receive-mode="list">Pegar lista</button><button type="button" data-receive-mode="counts">Cantidades</button></div><div id="tradeReceiveListPanel"><p class="trade-context-label compact">Pega la lista de cromos que vas a recibir</p><textarea id="tradeReceiveList" rows="6" placeholder="Ejemplo: Francia 15 · FWC 18"></textarea></div><div id="tradeReceiveCountsPanel" hidden><div class="trade-count-stepper" data-count-kind="normal"><span>Normales</span><div class="trade-count-controls"><button type="button" class="trade-count-btn" data-count-action="decrease" aria-label="Restar cromo normal">−</button><output id="tradeReceiveNormalCount" aria-live="polite">0</output><button type="button" class="trade-count-btn primary" data-count-action="increase" aria-label="Sumar cromo normal">+</button></div></div><div class="trade-count-stepper" data-count-kind="special"><span>Especiales</span><div class="trade-count-controls"><button type="button" class="trade-count-btn" data-count-action="decrease" aria-label="Restar cromo especial">−</button><output id="tradeReceiveSpecialCount" aria-live="polite">0</output><button type="button" class="trade-count-btn primary" data-count-action="increase" aria-label="Sumar cromo especial">+</button></div></div><div class="trade-count-stepper" data-count-kind="collaboration"><span>Colaboración</span><div class="trade-count-controls"><button type="button" class="trade-count-btn" data-count-action="decrease" aria-label="Restar cromo de colaboración">−</button><output id="tradeReceiveCollaborationCount" aria-live="polite">0</output><button type="button" class="trade-count-btn primary" data-count-action="increase" aria-label="Sumar cromo de colaboración">+</button></div></div></div><button id="generateBalancedTrade" class="primary trade-main-action" type="button">Generar intercambio</button><div id="receivedListErrors"></div><div id="balancedTradeResult"></div></div>`;
 $("#backToTradeSummary")?.addEventListener("click",renderTradeAnalyzerResult);
 result.querySelectorAll("[data-receive-mode]").forEach(btn=>btn.addEventListener("click",()=>{result.querySelectorAll("[data-receive-mode]").forEach(x=>x.classList.toggle("active",x===btn));$("#tradeReceiveListPanel").hidden=btn.dataset.receiveMode!=="list";$("#tradeReceiveCountsPanel").hidden=btn.dataset.receiveMode!=="counts";$("#receivedListErrors").innerHTML="";$("#balancedTradeResult").innerHTML="";}));
 const countState={normal:0,special:0,collaboration:0};
 const renderCount=(kind)=>{const out=$(kind==="normal"?"#tradeReceiveNormalCount":kind==="special"?"#tradeReceiveSpecialCount":"#tradeReceiveCollaborationCount");if(out)out.textContent=String(countState[kind]);};
 result.querySelectorAll(".trade-count-stepper").forEach(stepper=>{stepper.querySelectorAll("[data-count-action]").forEach(button=>button.addEventListener("click",()=>{const kind=stepper.dataset.countKind;const delta=button.dataset.countAction==="increase"?1:-1;countState[kind]=Math.max(0,countState[kind]+delta);renderCount(kind);if(navigator.vibrate)navigator.vibrate(8);}));});
 $("#generateBalancedTrade")?.addEventListener("click",event=>{const fb=actionFeedback(event.currentTarget,{busy:"Generando…",done:"Generado ✓"});let normalNeeded=0,specialNeeded=0,collaborationNeeded=0,receivedItems=null;const errors=$("#receivedListErrors");if(!$("#tradeReceiveListPanel").hidden){const received=parseTradeList($("#tradeReceiveList").value);receivedItems=received.found;normalNeeded=received.found.filter(x=>tradeStickerCategory(x)==="normal").length;specialNeeded=received.found.filter(x=>tradeStickerCategory(x)==="special").length;collaborationNeeded=received.found.filter(x=>tradeStickerCategory(x)==="collaboration").length;if(received.invalid.length){errors.innerHTML=`<details class="trade-ignored-lines"><summary>${received.invalid.length} ${received.invalid.length===1?"línea ignorada":"líneas ignoradas"}</summary>${renderInvalidLines(received.invalid)}</details>`;wireInvalidCorrections(errors);}else errors.innerHTML="";}else{normalNeeded=countState.normal;specialNeeded=countState.special;collaborationNeeded=countState.collaboration;errors.innerHTML="";}if(!normalNeeded&&!specialNeeded&&!collaborationNeeded){fb.fail("No hay cromos válidos");return;}renderBalancedTrade($("#balancedTradeResult"),available,normalNeeded,specialNeeded,collaborationNeeded,null,receivedItems);requestAnimationFrame(()=>{const body=$("#tradeAnalyzerBody"),target=$("#balancedTradeResult");if(body&&target)body.scrollTo({top:Math.max(0,target.offsetTop-16),behavior:"auto"});});fb.success();});
}
function renderTradeAnalyzerResult(){const input=$("#tradeAnalyzerInput"),result=$("#tradeAnalyzerResult"),dialog=$("#tradeAnalyzerDialog");if(!input||!result)return;const parsed=parseTradeList(input.value);if(!parsed.found.length&&!parsed.invalid.length){result.hidden=false;result.innerHTML='<div class="trade-inline-alert">No se ha reconocido ningún cromo de la lista que pide la otra persona.</div>';return;}const target=getTarget(),analysed=parsed.found.map(item=>{const owned=Number(inventory?.[item.team]?.[item.internalCode])||0;const stockAvailable=Math.max(0,owned-target);const requestedUnits=Math.max(1,Number(item.requestedUnits)||1);return {...item,owned,stockAvailable,requestedUnits,available:Math.min(stockAvailable,requestedUnits)};}),available=analysed.filter(x=>x.available>0),safeAvailable=available.filter(x=>!isTradeStar(x)&&!isTradeProtected(x)),previewItems=safeAvailable.map(item=>({...item,selectedUnits:item.available})),previewUnits=previewItems.reduce((sum,item)=>sum+(item.selectedUnits||0),0);result.innerHTML=`<button id="editTradeAnalyzerList" class="trade-back-button" type="button">← Editar lista</button><div class="trade-clean-card"><div class="trade-clean-status"><strong>${analysed.length} cromos detectados</strong>${parsed.invalid.length?`<span>${parsed.invalid.length} ${parsed.invalid.length===1?"línea no entendida":"líneas no entendidas"}</span>`:""}</div>${parsed.invalid.length?`<div class="trade-inline-alert">${renderInvalidLines(parsed.invalid)}</div>`:""}${safeAvailable.length?`<details class="trade-offer-preview" open><summary>Ver lo que puedes ofrecer · ${previewUnits}</summary><div class="balanced-sticker-list">${renderBalancedStickerList(previewItems)}</div></details>`:""}<button id="copyTradeAnalyzerAll" class="primary trade-main-action" type="button" ${safeAvailable.length?"":"disabled"}>Copiar lo que puedes ofrecer</button><button id="prepareBalancedTrade" class="secondary trade-main-action" type="button" ${safeAvailable.length?"":"disabled"}>Preparar intercambio</button></div>`;result.hidden=false;dialog?.classList.add("analyzed");dialog?.classList.remove("exchange-step");$("#tradeAnalyzerEntry").hidden=true;$("#tradeAnalyzerBody")?.scrollTo({top:0,behavior:"auto"});$("#editTradeAnalyzerList")?.addEventListener("click",editTradeAnalyzerList);wireInvalidCorrections(result);$("#copyTradeAnalyzerAll")?.addEventListener("click",async event=>{const fb=actionFeedback(event.currentTarget,{busy:"Copiando…",done:"Copiado ✓"});try{await copyShareText(tradeCopyLines(safeAvailable).join("\n"));fb.success();}catch{fb.fail("Error");}});$("#prepareBalancedTrade")?.addEventListener("click",()=>renderExchangeStep(safeAvailable));}
function openTradeAnalyzer(){const dialog=$("#tradeAnalyzerDialog");if(!dialog)return;dialog.classList.remove("analyzed","exchange-step");$("#tradeAnalyzerEntry").hidden=false;$("#tradeAnalyzerResult").hidden=true;if(!dialog.open)dialog.showModal();$("#tradeAnalyzerBody")?.scrollTo({top:0,behavior:"auto"});setTimeout(()=>$("#tradeAnalyzerInput")?.focus(),80);}
function closeTradeAnalyzer(){const dialog=$("#tradeAnalyzerDialog");if(dialog?.open)dialog.close();}


async function shareActiveCollectionList(){
 openShareOptions();
}

function renderGlobalCollection(){
 updateShareCollectionButton();
 const list=$("#globalCollectionList");
 if(!list)return;
 list.innerHTML="";
 let teams=currentTeamOrder().map(team=>[team,inventory[team]]);
 if(collectionSort==="az")teams.sort(([a],[b])=>a.localeCompare(b,"es"));
 if(collectionSort==="most-repeats"){
   teams.sort(([,a],[,b])=>{
     const target=getTarget();
     const ra=Object.values(a).reduce((s,q)=>s+Math.max(0,Number(q||0)-target),0);
     const rb=Object.values(b).reduce((s,q)=>s+Math.max(0,Number(q||0)-target),0);
     return rb-ra;
   });
 }
 if(collectionSort==="least-repeats"){
   teams.sort(([,a],[,b])=>{
     const target=getTarget();
     const ra=Object.values(a).reduce((s,q)=>s+Math.max(0,Number(q||0)-target),0);
     const rb=Object.values(b).reduce((s,q)=>s+Math.max(0,Number(q||0)-target),0);
     return ra-rb;
   });
 }
 teams.forEach(([team,stickers])=>{
   if(collectionTeamFilter!=="all"&&team!==collectionTeamFilter)return;
   let entries=Object.entries(stickers)
     .filter(([code,qty])=>collectionStickerMatches(team,code,Number(qty)||0));
   entries.sort(([a],[b])=>Number(a)-Number(b));
   if(collectionSort==="number")entries.sort(([a],[b])=>Number(a)-Number(b));
   if(!entries.length)return;
   const target=getTarget();
   const total=Object.values(stickers).reduce((sum,q)=>sum+Number(q||0),0);
   const missing=Object.values(stickers).reduce((sum,q)=>sum+Math.max(0,target-Number(q||0)),0);
   const section=document.createElement("section");
   section.className="collection-team";
   section.innerHTML=`<header class="collection-team-header">
     <div class="collection-team-title">${flagHTML(team)}<strong>${team}</strong></div>
     <div class="collection-team-summary"><strong>${total} cromos</strong>${missing?`${missing} pendientes`:"Completa"}</div>
   </header><div class="collection-stickers-grid"></div>`;
   const grid=section.querySelector(".collection-stickers-grid");
   entries.forEach(([code,qty])=>grid.appendChild(createGlobalSticker(team,code,Number(qty)||0)));
   list.appendChild(section);
 });
 if(!list.children.length)list.innerHTML='<div class="collection-empty">No hay cromos para este filtro.</div>';
}
function calculateProjectStatistics(){
 const target=getTarget();
 let total=0,missing=0,repeats=0,shiny=0,fwc=0,badges=0,collaboration=0,complete=0;
 Object.entries(inventory).forEach(([team,stickers])=>{
   let teamComplete=true;
   Object.entries(stickers).forEach(([code,raw])=>{
     const qty=Number(raw)||0;
     total+=qty;
     missing+=Math.max(0,target-qty);
     repeats+=Math.max(0,qty-target);
     if(qty<target)teamComplete=false;
     if(team==="FWC"){shiny+=qty;fwc+=qty}
     else if(team==="Coca-Cola"){collaboration+=qty}
     else if(code==="01"){shiny+=qty;badges+=qty}
   });
   if(teamComplete)complete++;
 });
 const required=Object.values(inventory).reduce((sum,stickers)=>sum+Object.keys(stickers).length,0)*target;
 return {total,missing,repeats,shiny,fwc,badges,collaboration,complete,progress:required?Math.min(100,Math.round((total-mathExcessForProgress())/required*100)):0};
}
function mathExcessForProgress(){
 const target=getTarget();
 return Object.values(inventory).reduce((sum,stickers)=>sum+Object.values(stickers).reduce((s,q)=>s+Math.max(0,Number(q||0)-target),0),0);
}
function renderStatistics(){
 const s=calculateProjectStatistics();
 const values={
   statsTotalStickers:`${s.total.toLocaleString("es-ES")} cromos`,
   statsMissingUnits:s.missing.toLocaleString("es-ES"),
   statsRepeatUnits:s.repeats.toLocaleString("es-ES"),
   statsShinyTotal:s.shiny.toLocaleString("es-ES"),
   statsCompleteTeams:String(s.complete),
   statsProgress:`${s.progress}%`,
   statsFwcTotal:s.fwc.toLocaleString("es-ES"),
   statsBadgesTotal:s.badges.toLocaleString("es-ES"),
   statsCollaborationTotal:s.collaboration.toLocaleString("es-ES"),
   statsCompleteTeamsText:`${s.complete} selecciones completas`
 };
 Object.entries(values).forEach(([id,value])=>{const node=$("#"+id);if(node)node.textContent=value});
 const ring=$("#statsProgressRing");
 if(ring)ring.style.setProperty("--progress",String(s.progress));
}
function setMainTab(tab){
 if(tab==="settings"){
   const dialog=$("#settingsDialog");
   if(dialog&&!dialog.open){
     document.body.classList.add("settings-overlay-open");
     dialog.showModal();
   }
   return;
 }
 mainTab=tab;
 document.body.classList.remove("main-tab-collection","main-tab-statistics","main-tab-trade","main-tab-collections");
 document.body.classList.add(`main-tab-${tab}`);

 document.querySelectorAll(".bottom-nav-button").forEach(button=>{
   button.classList.toggle("active",button.dataset.mainView===tab);
 });

 const inventoryView=$("#inventoryView");
 const statisticsView=$("#statisticsView");
 const tradeView=$("#tradeView");
 const collectionsView=$("#collectionsView");
 const missingView=$("#missingView");

 if(inventoryView)inventoryView.hidden=tab!=="collection";
 if(statisticsView)statisticsView.hidden=tab!=="statistics";
 if(tradeView)tradeView.hidden=tab!=="trade";
 if(collectionsView)collectionsView.hidden=tab!=="collections";
 if(missingView)missingView.hidden=true;

 if(tab==="collection")renderGlobalCollection();
 if(tab==="statistics")renderStatistics();
 if(tab==="collections")renderCollections();

 window.scrollTo({top:0,behavior:"auto"});
}

function renderAll(){
 const homeName=$("#homeCollectionName");if(homeName&&projects[activeProjectId])homeName.textContent=projects[activeProjectId].name;
 if(currentView!=="missing")renderCards();
 updateSummary();
 updateGlobalDashboard();
 updateSettingsTargetUI();
 updateLastChange();
 undoButton.disabled=history.length===0;
 if(currentView==="missing")renderMissing();
 updateNavigationBadges();
 renderGlobalCollection();
 renderStatistics();
 renderCollections();
 const banner=$("#globalExchangeBanner");
 if(banner){
   const active=currentView==="exchange";
   banner.hidden=!active;
   banner.style.display=active?"flex":"none";
   document.body.classList.toggle("exchange-active",active);
   const totals=exchangeTotals();
   $("#globalExchangeSummary").textContent=`${totals.give} para dar · ${totals.receive} para recibir`;
 }
}

function undoChange(change){
 const current=Number(inventory[change.team][change.code])||0;
 inventory[change.team][change.code]=change.previous;
 markPendingSync(change.team,change.code,current,change.previous,"deshacer");
 change.delta>0?sessionStats.plus=Math.max(0,sessionStats.plus-1):sessionStats.minus=Math.max(0,sessionStats.minus-1);
 history=history.filter(item=>item.id!==change.id);
 saveAll("Cambio deshecho");renderAll();renderHistory();showToast("Cambio deshecho");
}

function setView(view){
 currentView=view==="missing"?"inventory":view;
 document.querySelectorAll(".mode-button").forEach(button=>button.classList.toggle("active",button.dataset.view===currentView));
 $("#inventoryView").hidden=false;
 $("#missingView").hidden=true;
 $("#exchangeModePanel").hidden=currentView!=="exchange";
 document.body.classList.toggle("exchange-active",currentView==="exchange");
 renderAll();
}
document.querySelectorAll(".mode-button").forEach(button=>button.onclick=()=>setView(button.dataset.view));
document.querySelectorAll(".tab").forEach(button=>button.onclick=()=>{
 document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
 button.classList.add("active");
 currentFilter=button.dataset.filter;
 collectionFilter=currentFilter==="need"?"missing":currentFilter==="offer"?"repeats":"all";
 document.querySelectorAll(".collection-filter-button").forEach(x=>{
   const wanted=currentFilter==="need"?"missing":currentFilter==="offer"?"repeats":"all";
   x.classList.toggle("active",x.dataset.collectionFilter===wanted);
 });
 renderCards();
 renderGlobalCollection();
});

teamSelect.onchange=()=>{collectionTeamFilter=teamSelect.value||"all";updateCurrentTeamUI();saveAll();renderAll()};
teamSearch.oninput=()=>{
 const q=normalizeTradeName(teamSearch.value);
 if(!q){suggestions.hidden=true;return}
 const matches=filterTeamsByQuery(q).slice(0,8);
 const worldMatch=["todo","todos","mundo","global","selecciones"].some(word=>word.includes(q)||q.includes(word));
 suggestions.innerHTML=(worldMatch?`<button class="suggestion" data-team="all"><span>🌍</span><strong>Todas las selecciones</strong></button>`:"")
   +matches.map(team=>`<button class="suggestion" data-team="${team}">${flagHTML(team)}<strong>${team}</strong><small>${TEAM_TO_PANINI_CODE[team]||""}</small></button>`).join("");
 suggestions.hidden=!(matches.length||worldMatch);
 suggestions.querySelectorAll("button").forEach(button=>button.onclick=()=>selectTeam(button.dataset.team));
};
document.addEventListener("click",e=>{if(!e.target.closest(".search-wrap"))suggestions.hidden=true});
function syncTeamDialogViewport(){
 const vv=window.visualViewport;
 const root=document.documentElement;
 const height=vv?vv.height:window.innerHeight;
 const top=vv?vv.offsetTop:0;
 root.style.setProperty("--team-vv-height",`${Math.round(height)}px`);
 root.style.setProperty("--team-vv-top",`${Math.round(top)}px`);
 const dialog=$("#teamDialog");
 if(dialog?.open){
   const keyboardOpen=height<window.innerHeight-120;
   dialog.classList.toggle("keyboard-open",keyboardOpen);
   requestAnimationFrame(()=>$("#teamList")?.scrollTo({top:0,behavior:"auto"}));
 }
}
window.visualViewport?.addEventListener("resize",syncTeamDialogViewport);
window.visualViewport?.addEventListener("scroll",syncTeamDialogViewport);
window.addEventListener("orientationchange",()=>setTimeout(syncTeamDialogViewport,120));
$("#teamSelectorButton").onclick=()=>{
 $("#dialogSearch").value="";
 renderTeamList(currentTeamOrder());
 syncTeamDialogViewport();
 $("#teamDialog").showModal();
 requestAnimationFrame(syncTeamDialogViewport);
};
$("#closeTeamDialog").onclick=()=>$("#teamDialog").close();
$("#teamDialog").addEventListener("close",()=>$("#teamDialog").classList.remove("keyboard-open"));
$("#dialogSearch").addEventListener("focus",()=>{
 syncTeamDialogViewport();
 requestAnimationFrame(()=>$("#teamList")?.scrollTo({top:0,behavior:"auto"}));
});
$("#dialogSearch").oninput=e=>{
 renderTeamList(filterTeamsByQuery(e.target.value));
 syncTeamDialogViewport();
 requestAnimationFrame(()=>$("#teamList")?.scrollTo({top:0,behavior:"auto"}));
};
$("#targetLockButton").onclick=()=>{
 const value=prompt("Nuevo objetivo de álbumes:",targetInput.value);
 if(value!==null&&Number(value)>=1&&Number(value)<=20){
   targetInput.value=Number(value);targetValue.textContent=Number(value);saveAll("Objetivo actualizado");renderAll();renderProjectsList();
 }
};
undoButton.onclick=()=>{const last=history.at(-1);if(last)undoChange(last)};

// --------------------
// MODO INTERCAMBIO
// --------------------
function getExchangeQty(type,team,code){return Number(exchange[type][keyFor(team,code)]||0)}
function setExchangeQty(type,team,code,qty){
 const key=keyFor(team,code);
 if(qty<=0)delete exchange[type][key];else exchange[type][key]=qty;
 saveAll("Intercambio guardado");updateNavigationBadges();renderExchangeSummary();
 if(currentView==="exchange")renderCards();
}
function stageFromMainList(type,team,code,button){
 const current=getExchangeQty(type,team,code);
 if(type==="give"){
   const stock=Number(inventory[team][code])||0;
   if(current>=stock){showToast(`No puedes marcar más de x${stock} para dar`);return}
 }
 setExchangeQty(type,team,code,current+1);
 vibrate();
 const card=button.closest(".sticker-card");
 card?.classList.add(type==="give"?"flash-card-minus":"flash-card-plus");
 setTimeout(()=>card?.classList.remove("flash-card-minus","flash-card-plus"),430);
 renderCards();
 showToast(`${team} ${code} · ${type==="give"?"dar":"recibir"} x${current+1}`);
}


function exitManualExchange({clear=true,message="Intercambio cancelado"}={}){
 if(clear)exchange={give:{},receive:{}};
 currentView="inventory";
 currentFilter="all";
 collectionFilter="all";
 document.body.classList.remove("exchange-active");

 document.querySelectorAll(".tab").forEach(button=>{
   button.classList.toggle("active",button.dataset.filter==="all");
 });
 document.querySelectorAll(".collection-filter-button").forEach(button=>{
   button.classList.toggle("active",button.dataset.collectionFilter==="all");
 });

 saveAll(message);
 renderAll();
 showToast(message);
}


function enterManualExchange(){
 mainTab="collection";
 currentView="exchange";

 document.body.classList.remove("main-tab-statistics","main-tab-trade");
 document.body.classList.add("main-tab-collection","exchange-active");

 document.querySelectorAll(".bottom-nav-button").forEach(button=>{
   button.classList.toggle("active",button.dataset.mainView==="collection");
 });

 const inventoryView=$("#inventoryView");
 const statisticsView=$("#statisticsView");
 const tradeView=$("#tradeView");
 const collectionsView=$("#collectionsView");
 const missingView=$("#missingView");

 if(inventoryView)inventoryView.hidden=false;
 if(statisticsView)statisticsView.hidden=true;
 if(tradeView)tradeView.hidden=true;
 if(missingView)missingView.hidden=true;

 renderAll();

 const banner=$("#globalExchangeBanner");
 if(banner){
   banner.hidden=false;
   banner.style.display="flex";
 }

 requestAnimationFrame(()=>{
   document.querySelector(".collection-sticky-controls")?.scrollIntoView({
     behavior:"auto",
     block:"start"
   });
 });
}

function exchangeTotals(){
 return {
   give:Object.values(exchange.give).reduce((a,b)=>a+Number(b),0),
   receive:Object.values(exchange.receive).reduce((a,b)=>a+Number(b),0)
 };
}
function renderExchangeSummary(){
 const totals=exchangeTotals();
 $("#exchangeSummary").textContent=`${totals.give} para dar · ${totals.receive} para recibir`;
 $("#giveListCount").textContent=totals.give;$("#receiveListCount").textContent=totals.receive;
}
function groupedExchange(type){
 const groups={};
 Object.entries(exchange[type]).forEach(([key,qty])=>{
   const {team,code}=splitKey(key);
   (groups[team]??=[]).push({team,code,qty:Number(qty)});
 });
 Object.values(groups).forEach(items=>items.sort((a,b)=>Number(a.code)-Number(b.code)));
 return groups;
}
function renderExchangeList(){
 const groups=groupedExchange(exchangeListType);
 const teams=currentTeamOrder().filter(team=>groups[team]);
 if(!teams.length){$("#exchangeList").innerHTML="<p>No has marcado ningún cromo en esta lista.</p>";return}
 $("#exchangeList").innerHTML=teams.map(team=>`<section class="exchange-team-group">
   <div class="exchange-team-title">${flagHTML(team)}<span>${team}</span></div>
   ${groups[team].map(item=>`<div class="exchange-item">
     <strong>${item.code}</strong>
     <div class="exchange-item-controls"><button data-action="minus" data-team="${team}" data-code="${item.code}">−</button><b>x${item.qty}</b><button data-action="plus" data-team="${team}" data-code="${item.code}">+</button></div>
     <button class="exchange-remove" data-action="remove" data-team="${team}" data-code="${item.code}">Quitar</button>
   </div>`).join("")}
 </section>`).join("");
 $("#exchangeList").querySelectorAll("button").forEach(button=>button.onclick=()=>{
   const {team,code,action}=button.dataset,current=getExchangeQty(exchangeListType,team,code);
   if(action==="remove")setExchangeQty(exchangeListType,team,code,0);
   if(action==="minus")setExchangeQty(exchangeListType,team,code,current-1);
   if(action==="plus"){
     const max=exchangeListType==="give"?Number(inventory[team][code])||0:99;
     setExchangeQty(exchangeListType,team,code,Math.min(max,current+1));
   }
   renderExchangeList();
 });
}
$("#openExchangeListButton").onclick=()=>{exchangeListType="give";renderExchangeDialogTabs();renderExchangeList();$("#exchangeDialog").showModal()};
$("#closeExchangeDialog").onclick=()=>$("#exchangeDialog").close();
document.querySelectorAll(".exchange-list-tab").forEach(button=>button.onclick=()=>{
 exchangeListType=button.dataset.listType;renderExchangeDialogTabs();renderExchangeList();
});
function renderExchangeDialogTabs(){
 document.querySelectorAll(".exchange-list-tab").forEach(button=>button.classList.toggle("active",button.dataset.listType===exchangeListType));
 renderExchangeSummary();
}
$("#cancelExchangeButton").onclick=()=>{
 if(!confirm("¿Cancelar este intercambio? El inventario no cambiará."))return;
 $("#exchangeDialog").close();
 exitManualExchange();
};
$("#confirmExchangeButton").onclick=()=>{
 const totals=exchangeTotals();
 if(!totals.give&&!totals.receive){showToast("La lista está vacía");return}
 for(const [key,qty] of Object.entries(exchange.give)){
   const {team,code}=splitKey(key),stock=Number(inventory[team][code])||0;
   if(stock<Number(qty)){alert(`No hay suficiente stock de ${team} ${code}.`);return}
 }
 if(!confirm(`Confirmar intercambio: dar ${totals.give} y recibir ${totals.receive}.`))return;
 const now=new Date().toISOString();
 Object.entries(exchange.give).forEach(([key,qty])=>{
   const {team,code}=splitKey(key),previous=Number(inventory[team][code])||0,next=previous-Number(qty);
   inventory[team][code]=next;markPendingSync(team,code,previous,next,"intercambio");history.push({id:crypto.randomUUID?.()||String(Date.now()+Math.random()),team,code,previous,next,delta:-Number(qty),at:now});
   sessionStats.minus+=Number(qty);
 });
 Object.entries(exchange.receive).forEach(([key,qty])=>{
   const {team,code}=splitKey(key),previous=Number(inventory[team][code])||0,next=previous+Number(qty);
   inventory[team][code]=next;markPendingSync(team,code,previous,next,"intercambio");history.push({id:crypto.randomUUID?.()||String(Date.now()+Math.random()),team,code,previous,next,delta:Number(qty),at:now});
   sessionStats.plus+=Number(qty);
 });
 exchange={give:{},receive:{}};
 currentView="inventory";
 currentFilter="all";
 collectionFilter="all";
 document.body.classList.remove("exchange-active");
 document.querySelectorAll(".tab").forEach(button=>button.classList.toggle("active",button.dataset.filter==="all"));
 document.querySelectorAll(".collection-filter-button").forEach(button=>button.classList.toggle("active",button.dataset.collectionFilter==="all"));
 saveAll("Intercambio confirmado");
 $("#exchangeDialog").close();
 renderAll();
 showToast("✓ Intercambio aplicado al inventario");
};

// --------------------
// TODOS LOS QUE FALTAN
// --------------------
function missingCountries(){
 return currentTeamOrder().map(team=>[team,inventory[team]]).map(([team,stickers])=>{
   const missing=Object.entries(stickers)
   .filter(([,qty])=>Number(qty)<getTarget())
   .map(([code,qty])=>({code,qty:Number(qty),need:getTarget()-Number(qty)}))
   .sort((a,b)=>Number(a.code)-Number(b.code));
   return {team,missing,distinct:missing.length,units:missing.reduce((sum,item)=>sum+item.need,0)};
 }).filter(country=>country.distinct>0);
}
function renderMissing(){
 const sort=$("#missingSort").value;
 const countries=missingCountries();
 if(sort==="album"){
   const order=new Map(currentTeamOrder().map((team,index)=>[team,index]));
   countries.sort((a,b)=>(order.get(a.team)??999)-(order.get(b.team)??999));
 }
 if(sort==="most")countries.sort((a,b)=>b.distinct-a.distinct||b.units-a.units||a.team.localeCompare(b.team,"es"));
 if(sort==="least")countries.sort((a,b)=>a.distinct-b.distinct||a.units-b.units||a.team.localeCompare(b.team,"es"));
 if(sort==="az")countries.sort((a,b)=>a.team.localeCompare(b.team,"es"));
 if(sort==="za")countries.sort((a,b)=>b.team.localeCompare(a.team,"es"));
 const distinct=countries.reduce((sum,c)=>sum+c.distinct,0),units=countries.reduce((sum,c)=>sum+c.units,0);
 $("#missingTotals").textContent=`${distinct} cromos · ${units} unidades`;
 $("#missingList").innerHTML=countries.map(country=>`<section class="missing-country">
   <div class="missing-country-header">
     <div class="missing-country-name">${flagHTML(country.team)}<span>${country.team}</span></div>
     <div class="missing-country-stats"><strong>${country.distinct}/20 cromos pendientes</strong><br>${country.units} unidades</div>
   </div>
   <div class="missing-stickers">${country.missing.map(item=>`
     <div class="missing-chip">
       <strong>${item.code}</strong>
       <span>faltan ${item.need}</span>
       <div class="missing-direct-controls">
         <button class="missing-direct-minus" data-team="${country.team}" data-code="${item.code}" ${item.qty<=0?"disabled":""}>−</button>
         <b>x${item.qty}</b>
         <button class="missing-direct-plus" data-team="${country.team}" data-code="${item.code}">RECIBIR +1</button>
       </div>
     </div>`).join("")}</div>
 </section>`).join("");

 $("#missingList").querySelectorAll(".missing-direct-plus").forEach(button=>button.onclick=()=>{
   const team=button.dataset.team,code=button.dataset.code;
   const current=Number(inventory[team][code])||0;
   const target=getTarget();
   if(current>=target){
     showToast(`${team} ${code} ya está completo`);
     renderMissing();
     return;
   }
   const next=current+1;
   inventory[team][code]=next;
   markPendingSync(team,code,current,next,"me-faltan");
   history.push({
     id:crypto.randomUUID?.()||String(Date.now()+Math.random()),
     team,code,previous:current,next,delta:1,at:new Date().toISOString()
   });
   sessionStats.plus+=1;
   saveAll("✓ Guardado ahora");
   renderAll();
   setView("missing");
   showToast(`✓ ${team} ${code} recibido · x${next}`);
 });

 $("#missingList").querySelectorAll(".missing-direct-minus").forEach(button=>button.onclick=()=>{
   const team=button.dataset.team,code=button.dataset.code;
   const current=Number(inventory[team][code])||0;
   if(current<=0)return;
   const next=current-1;
   inventory[team][code]=next;
   markPendingSync(team,code,current,next,"me-faltan");
   history.push({
     id:crypto.randomUUID?.()||String(Date.now()+Math.random()),
     team,code,previous:current,next,delta:-1,at:new Date().toISOString()
   });
   sessionStats.minus+=1;
   saveAll("✓ Guardado ahora");
   renderAll();
   setView("missing");
   showToast(`✓ ${team} ${code} corregido · x${next}`);
 });
}
$("#missingSort").onchange=renderMissing;

function updateNavigationBadges(){
 const totals=exchangeTotals();
 $("#exchangeBadge").textContent=totals.give+totals.receive;
 $("#missingBadge").textContent=missingCountries().reduce((sum,c)=>sum+c.distinct,0);
 renderExchangeSummary();
}

// Historial y finalización.
function renderHistory(){
 const list=$("#historyList");
 if(!history.length){list.innerHTML="<p>No hay movimientos en la jornada actual.</p>";return}
 list.innerHTML=[...history].reverse().map(c=>`<article class="history-row"><div><strong>${c.delta>0?"+":"−"}${Math.abs(c.delta)} · ${c.team} ${c.code}</strong>${isPendingSync(c.team,c.code)?'<span class="history-sync-badge">Pendiente</span>':""}<br><small>${formatTime(c.at)} · ${c.previous} → ${c.next}</small></div><button data-id="${c.id}">Deshacer</button></article>`).join("");
 list.querySelectorAll("button").forEach(button=>button.onclick=()=>{const change=history.find(x=>x.id===button.dataset.id);if(change)undoChange(change)});
}
$("#historyButton").onclick=()=>{renderHistory();$("#historyDialog").showModal()};
$("#closeHistoryButton").onclick=()=>$("#historyDialog").close();
function sessionSnapshot(){return{startedAt:sessionStats.startedAt,finishedAt:new Date().toISOString(),plus:sessionStats.plus,minus:sessionStats.minus,balance:sessionStats.plus-sessionStats.minus,movements:[...history]}}
function renderFinish(s){$("#finishSummary").innerHTML=`<article><strong>Conseguidos: +${s.plus}</strong></article><article><strong>Entregados: −${s.minus}</strong></article><article><strong>Balance: ${s.balance>0?"+":""}${s.balance}</strong></article><article><strong>Movimientos: ${s.movements.length}</strong></article>`}
$("#finishButton").onclick=()=>{const s=sessionSnapshot();renderFinish(s);$("#finishDialog").dataset.snapshot=JSON.stringify(s);$("#finishDialog").showModal()};
$("#closeFinishButton").onclick=()=>$("#finishDialog").close();
function downloadJSON(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$("#downloadFinishButton").onclick=()=>downloadJSON(JSON.parse($("#finishDialog").dataset.snapshot),"resumen-mercat.json");
$("#confirmFinishButton").onclick=()=>{finishedSessions.push(JSON.parse($("#finishDialog").dataset.snapshot));history=[];sessionStats={plus:0,minus:0,startedAt:new Date().toISOString()};saveAll("Nueva jornada preparada");$("#finishDialog").close();renderAll()};
$("#resetSessionButton").onclick=()=>{if(confirm("¿Reiniciar estadísticas e historial?")){history=[];sessionStats={plus:0,minus:0,startedAt:new Date().toISOString()};saveAll("Estadísticas reiniciadas");renderAll()}};
$("#exportButton").onclick=()=>downloadJSON({exportedAt:new Date().toISOString(),target:getTarget(),sessionStats,history,finishedSessions,exchange,inventory},"panini-mercat-backup.json");

function csvEscape(value){const text=String(value??"");return /[;"\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text}

function xmlEscape(value){
 return String(value??"")
  .replaceAll("&","&amp;")
  .replaceAll("<","&lt;")
  .replaceAll(">","&gt;")
  .replaceAll('"',"&quot;")
  .replaceAll("'","&apos;");
}
function excelColumnName(number){
 let result="";
 while(number>0){
   const remainder=(number-1)%26;
   result=String.fromCharCode(65+remainder)+result;
   number=Math.floor((number-1)/26);
 }
 return result;
}
function xlsxCell(ref,value,styleId=0){
 if(typeof value==="number"&&Number.isFinite(value)){
   return `<c r="${ref}" s="${styleId}" t="n"><v>${value}</v></c>`;
 }
 return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
}
function buildInventorySheetXml(){
 const teams=currentTeamOrder();
 const headers=["Grupo","Selección",...Array.from({length:20},(_,i)=>String(i+1).padStart(2,"0"))];
 const rows=[];

 rows.push(`<row r="1" ht="24" customHeight="1">${headers.map((value,index)=>
   xlsxCell(`${excelColumnName(index+1)}1`,value,1)
 ).join("")}</row>`);

 teams.forEach((team,teamIndex)=>{
   const rowNumber=teamIndex+2;
   const stickers=Object.entries(inventory[team]).sort(([a],[b])=>Number(a)-Number(b));
   const cells=[
     xlsxCell(`A${rowNumber}`,teamGroups[team]||"",2),
     xlsxCell(`B${rowNumber}`,team,2)
   ];
   stickers.forEach(([code,quantity],stickerIndex)=>{
     const column=excelColumnName(stickerIndex+3);
     const style=isPendingSync(team,code)?3:4;
     cells.push(xlsxCell(`${column}${rowNumber}`,Number(quantity)||0,style));
   });
   rows.push(`<row r="${rowNumber}" ht="20" customHeight="1">${cells.join("")}</row>`);
 });

 const lastRow=teams.length+1;
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
 <sheetViews>
  <sheetView workbookViewId="0">
   <pane xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight" state="frozen"/>
  </sheetView>
 </sheetViews>
 <cols>
  <col min="1" max="1" width="10" customWidth="1"/>
  <col min="2" max="2" width="25" customWidth="1"/>
  <col min="3" max="22" width="7" customWidth="1"/>
 </cols>
 <sheetData>${rows.join("")}</sheetData>
 <autoFilter ref="A1:V${lastRow}"/>
 <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;
}
function buildStylesXml(){
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
 <fonts count="3">
  <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
  <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
  <font><b/><color rgb="FF17202A"/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
 </fonts>
 <fills count="4">
  <fill><patternFill patternType="none"/></fill>
  <fill><patternFill patternType="gray125"/></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FF173A59"/><bgColor indexed="64"/></patternFill></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FFFFEB3B"/><bgColor indexed="64"/></patternFill></fill>
 </fills>
 <borders count="2">
  <border><left/><right/><top/><bottom/><diagonal/></border>
  <border>
   <left style="thin"><color rgb="FFD9E0E7"/></left>
   <right style="thin"><color rgb="FFD9E0E7"/></right>
   <top style="thin"><color rgb="FFD9E0E7"/></top>
   <bottom style="thin"><color rgb="FFD9E0E7"/></bottom>
   <diagonal/>
  </border>
 </borders>
 <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
 <cellXfs count="5">
  <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
  <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
   <alignment horizontal="center" vertical="center"/>
  </xf>
  <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
   <alignment vertical="center"/>
  </xf>
  <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
   <alignment horizontal="center" vertical="center"/>
  </xf>
  <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
   <alignment horizontal="center" vertical="center"/>
  </xf>
 </cellXfs>
 <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}
async function exportProjectXlsx(){
 showLoading("Creando Excel…");
 if(typeof JSZip==="undefined"){
   alert("No se ha podido cargar el generador de Excel.");
   hideLoading();
   return;
 }
 const project=projects[activeProjectId];
 const zip=new JSZip();

 zip.file("[Content_Types].xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="xml" ContentType="application/xml"/>
 <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
 <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
 <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
 <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
 <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);

 zip.folder("_rels").file(".rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
 <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
 <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);

 zip.folder("docProps").file("core.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <dc:title>Inventario Panini — ${xmlEscape(project.name)}</dc:title>
 <dc:creator>Panini Mercat</dc:creator>
 <cp:lastModifiedBy>Panini Mercat</cp:lastModifiedBy>
 <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
 <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`);
 zip.folder("docProps").file("app.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
 <Application>Panini Mercat</Application>
</Properties>`);

 const xl=zip.folder("xl");
 xl.file("workbook.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>
 <sheets><sheet name="Inventario" sheetId="1" r:id="rId1"/></sheets>
</workbook>`);
 xl.folder("_rels").file("workbook.xml.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
 <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
 xl.file("styles.xml",buildStylesXml());
 xl.folder("worksheets").file("sheet1.xml",buildInventorySheetXml());

 const blob=await zip.generateAsync({
   type:"blob",
   mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
   compression:"DEFLATE",
   compressionOptions:{level:6}
 });
 const safeName=project.name.replace(/[\\/:*?"<>|]+/g,"-").trim()||"colección";
 const url=URL.createObjectURL(blob);
 const anchor=document.createElement("a");
 anchor.href=url;
 anchor.download=`Inventario-${safeName}.xlsx`;
 anchor.click();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
 showToast(`Excel creado · ${pendingSyncCount()} celdas amarillas`);
 hideLoading();
}
$("#excelButton").onclick=exportProjectXlsx;

$("#resetButton").onclick=()=>{if(confirm("¿Restaurar esta colección con el inventario cargado desde el último Excel maestro?")){inventory=getMasterInventoryForProject(projects[activeProjectId]);history=[];sessionStats={plus:0,minus:0,startedAt:new Date().toISOString()};exchange={give:{},receive:{}};pendingSync={};saveAll("Inventario restaurado");renderAll()}};


function projectStats(p){
 const total=Object.values(p.inventory).reduce((sum,stickers)=>sum+Object.values(stickers).reduce((a,b)=>a+Number(b),0),0);
 return {total,changes:(p.history||[]).length,pending:Object.keys(p.pendingSync||{}).length};
}
function albumWord(value){return Number(value)===1?"álbum":"álbumes"}
function collectionProgress(p){
 const target=Math.max(1,Number(p.target)||1);
 const teams=Object.keys(p.inventory||{}).length;
 const required=teams*20*target;
 let useful=0,total=0,different=0,pending=0;
 Object.values(p.inventory||{}).forEach(stickers=>Object.values(stickers||{}).forEach(q=>{
   const qty=Math.max(0,Number(q)||0);total+=qty;if(qty>0)different++;useful+=Math.min(qty,target);pending+=Math.max(0,target-qty);
 }));
 return {total,different,pending,progress:required?Math.min(100,Math.round(useful/required*100)):0};
}
function collectionSafeText(value){
 return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
}
function renderCollections(){
 const list=$("#collectionsList");if(!list)return;
 const items=Object.values(projects);
 list.innerHTML=items.map(p=>{
   const s=collectionProgress(p),active=p.id===activeProjectId;
   return `<article class="collection-library-card clean-library-card ${active?"active":""}" data-collection-id="${p.id}">
    <button type="button" class="collection-card-main" data-open-collection="${p.id}" aria-label="Abrir ${collectionSafeText(p.name)}">
      <div class="collection-album-icon" aria-hidden="true"><span>26</span></div>
      <div class="collection-library-copy">
        <div class="collection-title-line"><h3>${collectionSafeText(p.name)}</h3>${active?'<span class="collection-active-badge">Activa</span>':''}</div>
        <span class="collection-brief">${s.progress}% completado · Objetivo ${p.target} ${albumWord(p.target)}</span>
        <div class="collection-progress-track"><div class="collection-progress-fill" style="width:${s.progress}%"></div></div>
      </div>
      <span class="collection-card-chevron">›</span>
    </button>
    <button type="button" class="collection-card-menu" data-edit-collection="${p.id}" aria-label="Editar ${collectionSafeText(p.name)}">•••</button>
   </article>`;
 }).join("");
 list.querySelectorAll("[data-open-collection]").forEach(button=>button.onclick=()=>{
   const id=button.dataset.openCollection;
   if(id!==activeProjectId)switchProject(id);
   setMainTab("collection");
 });
 list.querySelectorAll("[data-edit-collection]").forEach(button=>button.onclick=event=>{
   event.stopPropagation();openEditCollection(button.dataset.editCollection);
 });
}
function openEditCollection(id){
 const p=projects[id],dialog=$("#editCollectionDialog");if(!p||!dialog)return;
 $("#editCollectionId").value=id;
 $("#editCollectionName").value=p.name||"Colección";
 $("#editCollectionTarget").value=Math.max(1,Number(p.target)||1);
 $("#deleteCollectionButton").hidden=Object.keys(projects).length<=1;
 dialog.showModal();
 setTimeout(()=>$("#editCollectionName")?.focus(),80);
}
function closeEditCollection(){const dialog=$("#editCollectionDialog");if(dialog?.open)dialog.close()}
function changeEditTarget(delta){
 const input=$("#editCollectionTarget");if(!input)return;
 input.value=String(Math.min(20,Math.max(1,(Number(input.value)||1)+delta)));
}
function saveEditedCollection(){
 const id=$("#editCollectionId").value,p=projects[id];if(!p)return;
 const name=$("#editCollectionName").value.trim();
 const target=Math.min(20,Math.max(1,Number($("#editCollectionTarget").value)||1));
 if(!name){$("#editCollectionName").focus();return}
 if(id===activeProjectId)commitProjectState();
 p.name=name;p.target=target;
 persistProjects();
 if(id===activeProjectId)loadProjectState();
 renderAll();renderProjectsList();closeEditCollection();showToast("Colección actualizada");
}
function duplicateEditedCollection(){
 const id=$("#editCollectionId").value,p=projects[id];if(!p)return;
 if(id===activeProjectId)commitProjectState();
 const copy=structuredClone(p);copy.id=makeId();copy.name=`${p.name} · copia`;
 copy.createdAt=new Date().toISOString();copy.updatedAt=copy.createdAt;
 projects[copy.id]=copy;persistProjects();renderCollections();renderProjectsList();closeEditCollection();showToast("Colección duplicada");
}
function deleteEditedCollection(){
 const id=$("#editCollectionId").value,p=projects[id];if(!p||Object.keys(projects).length<=1)return;
 if(!confirm(`¿Eliminar la colección "${p.name}"? Esta acción no se puede deshacer.`))return;
 createAutomaticBackup("antes-de-eliminar-colección");
 if(id===activeProjectId){
   const replacement=Object.keys(projects).find(projectId=>projectId!==id);
   delete projects[id];activeProjectId=replacement;persistProjects();loadProjectState();
 }else{delete projects[id];persistProjects()}
 renderAll();renderProjectsList();closeEditCollection();showToast("Colección eliminada");
}

function renderProjectsList(){
 const list=$("#projectsList");
 if(!list)return;
 list.innerHTML=Object.values(projects).map(p=>{
   const stats=projectStats(p);
   return `<article class="project-item ${p.id===activeProjectId?"active":""}">
    <div class="project-item-copy"><strong>${p.name}</strong><small>Objetivo ${p.target} · ${stats.total} cromos · ${stats.pending} pendientes</small></div>
    <div class="project-item-actions">
      <button class="project-open" data-id="${p.id}">${p.id===activeProjectId?"Activo":"Abrir"}</button>
      ${Object.keys(projects).length>1?`<button class="project-delete" data-delete="${p.id}">Eliminar</button>`:""}
    </div>
   </article>`;
 }).join("");
 list.querySelectorAll("[data-id]").forEach(b=>b.onclick=()=>switchProject(b.dataset.id));
 list.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteProject(b.dataset.delete));
}
function switchProject(id){
 if(!projects[id])return;
 commitProjectState();activeProjectId=id;persistProjects();loadProjectState();renderProjectsList();
 if($("#projectsDialog")?.open)$("#projectsDialog").close();showToast(`Colección: ${projects[id].name}`);
}
function deleteProject(id){
 if(id===activeProjectId){alert("Cambia primero a otra colección.");return}
 if(!confirm(`¿Eliminar la colección "${projects[id].name}"?`))return;
 createAutomaticBackup("antes-de-eliminar-colección");
 delete projects[id];persistProjects();renderProjectsList();
}
function openCreateProject(){
 $("#newProjectName").value="";
 $("#newProjectTarget").value="2";
 document.querySelector('input[name="projectSource"][value="empty"]').checked=true;
 $("#repeatOptions").hidden=true;
 $("#sourceProjectSelect").innerHTML=Object.values(projects).map(p=>`<option value="${p.id}">${p.name}</option>`).join("");
 updateTransferPreview();
 $("#createProjectDialog").showModal();
}
function calculateTransfer(source,target,mode){
 const transferred=emptyInventory();
 let units=0,refs=0;
 Object.entries(source.inventory).forEach(([team,stickers])=>{
   Object.entries(stickers).forEach(([code,qty])=>{
     const available=Math.max(0,Number(qty)-Number(source.target));
     const move=mode==="all"?available:Math.min(available,target);
     transferred[team][code]=move;
     if(move>0){units+=move;refs++}
   });
 });
 return {inventory:transferred,units,refs};
}
function updateTransferPreview(){
 if($("#repeatOptions").hidden)return;
 const source=projects[$("#sourceProjectSelect").value];
 const target=Math.max(1,Number($("#newProjectTarget").value)||1);
 const mode=document.querySelector('input[name="repeatMode"]:checked')?.value||"target";
 if(!source)return;
 const result=calculateTransfer(source,target,mode);
 $("#transferPreview").innerHTML=`Se transferirán <strong>${result.units}</strong> cromos de <strong>${result.refs}</strong> referencias.`;
}
function createProject(){
 const name=$("#newProjectName").value.trim();
 const target=Math.max(1,Number($("#newProjectTarget").value)||1);
 if(!name){alert("Escribe un nombre para la colección.");return}
 const sourceType=document.querySelector('input[name="projectSource"]:checked')?.value||"empty";
 let inv=emptyInventory(),transfer=null,source=null;
 if(sourceType==="repeats"){
   source=projects[$("#sourceProjectSelect").value];
   const mode=document.querySelector('input[name="repeatMode"]:checked')?.value||"target";
   transfer=calculateTransfer(source,target,mode);inv=transfer.inventory;
   if(!confirm(`Crear "${name}" transfiriendo ${transfer.units} cromos dla colección "${source.name}"?`))return;
 }
 if(sourceType==="repeats")createAutomaticBackup("antes-de-transferir-repetidas");
 const p=defaultProject(name,target,inv);
 projects[p.id]=p;
 if(sourceType==="repeats"&&source){
   Object.entries(inv).forEach(([team,stickers])=>Object.entries(stickers).forEach(([code,qty])=>{
     source.inventory[team][code]=Math.max(0,Number(source.inventory[team][code])-Number(qty));
   }));
 }
 commitProjectState();activeProjectId=p.id;persistProjects();$("#createProjectDialog").close();loadProjectState();renderProjectsList();
 showToast(`Colección creada: ${name}`);
}
$("#projectSelectorButton").onclick=()=>{renderProjectsList();$("#projectsDialog").showModal()};
$("#newProjectQuickButton").onclick=openCreateProject;
$("#closeProjectsDialog").onclick=()=>$("#projectsDialog").close();
$("#createProjectButton").onclick=()=>{$("#projectsDialog").close();openCreateProject()};
$("#closeCreateProjectDialog").onclick=()=>$("#createProjectDialog").close();
$("#confirmCreateProjectButton").onclick=createProject;
document.querySelectorAll('input[name="projectSource"]').forEach(r=>r.onchange=()=>{
 $("#repeatOptions").hidden=r.value!=="repeats"||!r.checked;updateTransferPreview();
});
document.querySelectorAll('input[name="repeatMode"]').forEach(r=>r.onchange=updateTransferPreview);
$("#sourceProjectSelect").onchange=updateTransferPreview;
$("#newProjectTarget").oninput=updateTransferPreview;





function buildFullBackup(reason="manual"){
 commitProjectState();
 return {
   format:"panini-mercat-backup",
   version:APP_VERSION,
   createdAt:new Date().toISOString(),
   reason,
   activeProjectId,
   projects:structuredClone(projects),
   metadata:{
     projectCount:Object.keys(projects).length,
     totalStickers:Object.values(projects).reduce((sum,project)=>
       sum+Object.values(project.inventory||{}).reduce((teamSum,stickers)=>
         teamSum+Object.values(stickers).reduce((a,b)=>a+Number(b||0),0)
       ,0)
     ,0)
   }
 };
}
function downloadBackup(data,fileName){
 const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob);
 const anchor=document.createElement("a");
 anchor.href=url;
 anchor.download=fileName;
 anchor.click();
 setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function createAutomaticBackup(reason){
 const backup=buildFullBackup(reason);
 const snapshots=readJSON("panini-mercat-auto-backups-v5",[]);
 snapshots.push(backup);
 while(snapshots.length>5)snapshots.shift();
 localStorage.setItem("panini-mercat-auto-backups-v5",JSON.stringify(snapshots));
 return backup;
}
function validateBackup(data){
 if(!data||data.format!=="panini-mercat-backup"||!data.projects||typeof data.projects!=="object"){
   throw new Error("El archivo no es una copia válida de Panini Mercat.");
 }
 const projectValues=Object.values(data.projects);
 if(!projectValues.length)throw new Error("La copia no contiene colecciones.");
 for(const project of projectValues){
   if(!project.id||!project.name||!project.inventory)throw new Error("La copia contiene un colección incompleto.");
 }
 return data;
}
function backupSummaryHtml(data){
 const projectsCount=Object.keys(data.projects).length;
 const total=data.metadata?.totalStickers??Object.values(data.projects).reduce((sum,project)=>
   sum+Object.values(project.inventory||{}).reduce((teamSum,stickers)=>
     teamSum+Object.values(stickers).reduce((a,b)=>a+Number(b||0),0)
   ,0)
 ,0);
 return `<strong>${projectsCount} colecciones</strong><br>
 <span>${total} cromos · copia del ${new Date(data.createdAt).toLocaleString("es-ES")}</span>`;
}
async function readBackupFile(file){
 const text=await file.text();
 return validateBackup(JSON.parse(text));
}
function restoreBackup(data,mode){
 showLoading("Restaurando copia…");
 createAutomaticBackup("antes-de-restaurar");
 if(mode==="replace"){
   projects=structuredClone(data.projects);
   activeProjectId=data.activeProjectId&&projects[data.activeProjectId]
     ?data.activeProjectId:Object.keys(projects)[0];
 }else{
   const idMap={};
   Object.values(data.projects).forEach(project=>{
     const copy=structuredClone(project);
     const oldId=copy.id;
     copy.id=makeId();
     copy.name=`${copy.name} · restaurado`;
     copy.createdAt=new Date().toISOString();
     idMap[oldId]=copy.id;
     projects[copy.id]=copy;
   });
 }
 persistProjects();
 loadProjectState();
 renderProjectsList();
 hideLoading();
}
$("#exportBackupButton").onclick=()=>{
 const backup=buildFullBackup("manual");
 const stamp=new Date().toISOString().slice(0,10);
 downloadBackup(backup,`Panini-Mercat-Backup-${stamp}.json`);
 showToast("Copia completa exportada");
};
$("#restoreBackupButton").onclick=()=>$("#backupFileInput").click();
$("#backupFileInput").onchange=async event=>{
 const file=event.target.files?.[0];
 if(!file)return;
 try{
   pendingBackupRestore=await readBackupFile(file);
   $("#restoreBackupSummary").innerHTML=backupSummaryHtml(pendingBackupRestore);
   $("#restoreBackupDialog").showModal();
 }catch(error){
   console.error(error);
   alert(error.message||"No se ha podido leer la copia.");
 }finally{
   event.target.value="";
 }
};
$("#closeRestoreBackupDialog").onclick=()=>$("#restoreBackupDialog").close();
$("#cancelRestoreBackupButton").onclick=()=>$("#restoreBackupDialog").close();
$("#confirmRestoreBackupButton").onclick=()=>{
 if(!pendingBackupRestore)return;
 const mode=document.querySelector('input[name="restoreMode"]:checked')?.value||"replace";
 const message=mode==="replace"
   ?"Se reemplazarán todos los colecciones actuales. ¿Continuar?"
   :"Los colecciones de la copia se añadirán como colecciones nuevos. ¿Continuar?";
 if(!confirm(message))return;
 restoreBackup(pendingBackupRestore,mode);
 $("#restoreBackupDialog").close();
 pendingBackupRestore=null;
 showToast("✓ Copia restaurada");
};


function parseCellReference(ref){
 const match=String(ref||"").match(/^([A-Z]+)(\d+)$/i);
 if(!match)return null;
 let column=0;
 for(const char of match[1].toUpperCase()){
   column=column*26+(char.charCodeAt(0)-64);
 }
 return {column,row:Number(match[2])};
}
function decodeXmlEntities(text){
 const node=document.createElement("textarea");
 node.innerHTML=text||"";
 return node.value;
}
function normaliseImportedTeam(name){
 const wanted=normalize(String(name||""));
 return Object.keys(originalInventory).find(team=>normalize(team)===wanted)||null;
}
async function readInventoryWorkbook(file){
 const bytes=await file.arrayBuffer();
 const zip=await JSZip.loadAsync(bytes);

 const workbookFile=zip.file("xl/workbook.xml");
 const relsFile=zip.file("xl/_rels/workbook.xml.rels");
 if(!workbookFile||!relsFile)throw new Error("El archivo no parece un Excel válido.");

 const workbookXml=await workbookFile.async("string");
 const relsXml=await relsFile.async("string");
 const parser=new DOMParser();
 const workbookDoc=parser.parseFromString(workbookXml,"application/xml");
 const relsDoc=parser.parseFromString(relsXml,"application/xml");

 const relTargets={};
 relsDoc.querySelectorAll("Relationship").forEach(rel=>{
   relTargets[rel.getAttribute("Id")]=rel.getAttribute("Target");
 });

 let inventoryTarget=null;
 workbookDoc.querySelectorAll("sheet").forEach(sheet=>{
   if(normalize(sheet.getAttribute("name"))==="inventario"){
     const relId=sheet.getAttribute("r:id")||sheet.getAttributeNS(
       "http://schemas.openxmlformats.org/officeDocument/2006/relationships","id"
     );
     inventoryTarget=relTargets[relId];
   }
 });
 if(!inventoryTarget)throw new Error('No se encontró una hoja llamada "Inventario".');

 const cleanTarget=inventoryTarget.replace(/^\/?/,"").replace(/^xl\//,"");
 const sheetFile=zip.file(`xl/${cleanTarget}`);
 if(!sheetFile)throw new Error("No se pudo leer la hoja Inventario.");

 let sharedStrings=[];
 const sharedFile=zip.file("xl/sharedStrings.xml");
 if(sharedFile){
   const sharedXml=await sharedFile.async("string");
   const sharedDoc=parser.parseFromString(sharedXml,"application/xml");
   sharedStrings=[...sharedDoc.querySelectorAll("si")].map(si=>
     [...si.querySelectorAll("t")].map(t=>t.textContent||"").join("")
   );
 }

 const sheetXml=await sheetFile.async("string");
 const sheetDoc=parser.parseFromString(sheetXml,"application/xml");
 const cells=new Map();

 sheetDoc.querySelectorAll("c").forEach(cell=>{
   const ref=cell.getAttribute("r");
   const type=cell.getAttribute("t");
   let value="";
   if(type==="s"){
     const index=Number(cell.querySelector("v")?.textContent||0);
     value=sharedStrings[index]??"";
   }else if(type==="inlineStr"){
     value=[...cell.querySelectorAll("is t")].map(t=>t.textContent||"").join("");
   }else{
     value=cell.querySelector("v")?.textContent??"";
   }
   cells.set(ref,value);
 });

 const imported=emptyInventory();
 const groups={};
 const foundTeams=new Set();

 for(let row=2;row<=300;row++){
   const rawTeam=cells.get(`B${row}`);
   if(rawTeam===undefined||String(rawTeam).trim()==="")continue;
   const team=normaliseImportedTeam(rawTeam);
   if(!team)continue;
   foundTeams.add(team);
   groups[team]=String(cells.get(`A${row}`)||"").trim();

   for(let index=1;index<=20;index++){
     const code=team==="FWC"?String(index-1).padStart(2,"0"):String(index).padStart(2,"0");
     const column=excelColumnName(index+2);
     const raw=cells.get(`${column}${row}`);
     const quantity=Math.max(0,Math.round(Number(raw)||0));
     imported[team][code]=quantity;
   }
 }
 if(foundTeams.size!==49){
   throw new Error(`Se encontraron ${foundTeams.size} de las 49 categorías esperadas.`);
 }
 return {inventory:imported,groups,teams:foundTeams.size,fileName:file.name};
}
function buildImportComparison(importedResult){
 const differences=[];
 Object.entries(importedResult.inventory).forEach(([team,stickers])=>{
   Object.entries(stickers).forEach(([code,excelValue])=>{
     const appValue=Number(inventory[team][code])||0;
     if(appValue===Number(excelValue))return;
     differences.push({
       team,code,appValue,excelValue:Number(excelValue),
       conflict:isPendingSync(team,code)
     });
   });
 });
 return {
   ...importedResult,
   differences,
   conflicts:differences.filter(item=>item.conflict)
 };
}
function renderImportReview(){
 if(!pendingExcelImport)return;
 $("#importFileTeams").textContent=pendingExcelImport.teams;
 $("#importChangedCells").textContent=pendingExcelImport.differences.length;
 $("#importConflictCells").textContent=pendingExcelImport.conflicts.length;
 $("#importConflictHelp").innerHTML=pendingExcelImport.conflicts.length
   ? `<strong>${pendingExcelImport.conflicts.length} conflictos:</strong> esas celdas tienen cambios pendientes en la app y un valor diferente en el Excel.`
   : "No hay conflictos con cambios pendientes de la app.";

 $("#importDifferencesList").innerHTML=pendingExcelImport.differences.length
   ? pendingExcelImport.differences.slice(0,300).map(item=>`<article class="import-difference-row ${item.conflict?"conflict":""}">
      <div><strong>${item.team} ${item.code}</strong>${item.conflict?'<span class="import-conflict-badge">Conflicto</span>':""}<small>App → Excel</small></div>
      <div class="import-difference-values">x${item.appValue} → x${item.excelValue}</div>
     </article>`).join("")
   : "<p>El colección y el Excel ya tienen las mismas cantidades.</p>";
}
function openImportExcel(){
 pendingExcelImport=null;
 $("#excelFileInput").value="";
 $("#importExcelStart").hidden=false;
 $("#importExcelReview").hidden=true;
 $("#importExcelDialog").showModal();
}
async function handleExcelFile(file){
 if(!file)return;
 showLoading("Leyendo Excel…");
 try{
   $("#chooseExcelFileButton").disabled=true;
   $("#chooseExcelFileButton").textContent="Leyendo Excel…";
   const imported=await readInventoryWorkbook(file);
   pendingExcelImport=buildImportComparison(imported);
   renderImportReview();
   $("#importExcelStart").hidden=true;
   $("#importExcelReview").hidden=false;
   hideLoading();
 }catch(error){
   console.error(error);
   hideLoading();
   alert(error.message||"No se ha podido importar el Excel.");
 }finally{
   $("#chooseExcelFileButton").disabled=false;
   $("#chooseExcelFileButton").textContent="Seleccionar Excel";
 }
}
function applyExcelImport(){
 if(!pendingExcelImport)return;
 createAutomaticBackup("antes-de-importar-excel");
 const resolution=$("#importConflictResolution").value;
 const now=new Date().toISOString();
 let applied=0,kept=0;

 pendingExcelImport.differences.forEach(item=>{
   if(item.conflict&&resolution==="app"){
     kept++;
     return;
   }
   const previous=Number(inventory[item.team][item.code])||0;
   const next=Number(item.excelValue)||0;
   if(previous===next)return;
   inventory[item.team][item.code]=next;
   history.push({
     id:makeId(),team:item.team,code:item.code,
     previous,next,delta:next-previous,at:now,source:"import-excel"
   });
   if(item.conflict&&resolution==="excel"){
     delete pendingSync[syncKey(item.team,item.code)];
   }
   applied++;
 });

 Object.entries(pendingExcelImport.groups||{}).forEach(([team,group])=>{
   if(group)teamGroups[team]=group;
 });

 saveAll("Excel importado");
 renderAll();renderProjectsList();
 $("#importExcelDialog").close();
 showToast(`Excel aplicado · ${applied} cambios${kept?` · ${kept} mantenidos`:""}`);
 pendingExcelImport=null;
}
$("#importExcelButton").onclick=openImportExcel;
$("#closeImportExcelDialog").onclick=()=>$("#importExcelDialog").close();
$("#chooseExcelFileButton").onclick=()=>$("#excelFileInput").click();
$("#excelFileInput").onchange=e=>handleExcelFile(e.target.files?.[0]);
$("#cancelExcelImportButton").onclick=()=>$("#importExcelDialog").close();
$("#applyExcelImportButton").onclick=applyExcelImport;


$("#markSyncedButton").onclick=()=>{
 const count=pendingSyncCount();
 if(!count){showToast("No hay cambios pendientes");return}
 if(!confirm(`Marcar ${count} cambios como sincronizados en la colección activa?`))return;
 pendingSync={};
 lastSyncedAt=new Date().toISOString();
 saveAll("Colección sincronizada");
 renderAll();
 renderProjectsList();
 showToast("✓ Colección marcada como sincronizado");
};


function renderTradeProtectionSettings(){const root=$("#tradeProtectionSettings");if(!root)return;const prefs=currentTradePreferences(),customStars=Object.keys(prefs.stars||{}),customProtected=Object.keys(prefs.protected||{}),defaults=Object.keys(DEFAULT_TOP_STARS),total=new Set([...defaults,...customStars,...customProtected]).size;root.innerHTML=`<button id="manageTradeProtection" class="trade-settings-row" type="button"><span><strong>Protegidos para intercambios</strong><small>${total} cromos excluidos</small></span><b>Gestionar ›</b></button><div id="tradeProtectionDetails" hidden></div>`;$("#manageTradeProtection")?.addEventListener("click",()=>{const details=$("#tradeProtectionDetails"),opening=details.hidden;details.hidden=!opening;if(!opening)return;const chips=[...new Set([...defaults,...customStars,...customProtected])].map(key=>{const [code,num]=key.split("|"),label=DEFAULT_TOP_STARS[key]||`${code}${num}`;return `<span class="trade-setting-chip"><strong>${escapeTradeHtml(label)}</strong><small>${escapeTradeHtml(code+num)}</small></span>`;}).join("");details.innerHTML=`<div class="trade-setting-chips">${chips}</div>${customStars.length||customProtected.length?'<button id="resetCustomTradeMarks" type="button">Quitar marcas personalizadas</button>':""}`;$("#resetCustomTradeMarks")?.addEventListener("click",()=>{prefs.stars={};prefs.protected={};persistProjects();renderTradeProtectionSettings();showToast("Marcas personalizadas eliminadas");});});}


function setupSettingsCenter(){
 const dialog=$("#settingsDialog");
 if(!dialog)return;

 const projectBar=document.querySelector(".project-bar");
 const syncCard=document.querySelector(".sync-card");
 const backupCard=document.querySelector(".backup-card");
 const actions=document.querySelector(".actions");

 const syncSlot=$("#settingsSyncSlot");
 const backupSlot=$("#settingsBackupSlot");
 const actionsSlot=$("#settingsActionsSlot");
 if(syncCard&&syncSlot&&!syncSlot.contains(syncCard))syncSlot.appendChild(syncCard);
 if(backupCard&&backupSlot&&!backupSlot.contains(backupCard))backupSlot.appendChild(backupCard);
 if(actions&&actionsSlot&&!actionsSlot.contains(actions))actionsSlot.appendChild(actions);

 const openSettings=()=>{
   if(dialog.open)return;
   renderTradeProtectionSettings();
   document.body.classList.add("settings-overlay-open");
   dialog.showModal();
   const scrollArea=dialog.querySelector(".settings-groups");
   if(scrollArea)scrollArea.scrollTop=0;
 };

 const closeSettings=()=>{
   if(!dialog.open)return;
   dialog.close();
 };

 const headerButton=$("#settingsButton");
 if(headerButton)headerButton.onclick=openSettings;

 document.querySelectorAll('.bottom-nav-button[data-main-view="settings"]').forEach(button=>{
   button.onclick=openSettings;
 });

 const closeButton=$("#closeSettingsDialog");
 if(closeButton)closeButton.onclick=closeSettings;

 dialog.addEventListener("close",()=>{
   document.body.classList.remove("settings-overlay-open");
 });

 dialog.addEventListener("cancel",event=>{
   event.preventDefault();
   closeSettings();
 });

 dialog.addEventListener("click",event=>{
   if(event.target===dialog)closeSettings();
 });
}


const settingsTargetButton=$("#settingsTargetButton");
if(settingsTargetButton)settingsTargetButton.onclick=()=>{
 const current=getTarget();
 const value=prompt("Objetivo de álbumes para esta colección:",String(current));
 if(value===null)return;
 const next=Math.max(1,Math.min(20,Number(value)||current));
 targetInput.value=String(next);
 targetValue.textContent=String(next);
 saveAll("Objetivo actualizado");
 renderAll();
 renderProjectsList();
 showToast(`Objetivo actualizado a ${next}`);
};


document.querySelectorAll(".bottom-nav-button").forEach(button=>button.onclick=()=>setMainTab(button.dataset.mainView));
$("#shareCollectionListButton")?.addEventListener("click",shareActiveCollectionList);
$("#shareOptionsClose")?.addEventListener("click",closeShareOptions);
$("#shareOptionsBackdrop")?.addEventListener("click",closeShareOptions);
document.querySelectorAll("[data-share-option]").forEach(button=>button.addEventListener("click",()=>runShareOption(button.dataset.shareOption)));
$("#openTradeAnalyzerButton")?.addEventListener("click",openTradeAnalyzer);
$("#closeTradeAnalyzerDialog")?.addEventListener("click",closeTradeAnalyzer);
$("#runTradeAnalyzerButton")?.addEventListener("click",event=>{const fb=actionFeedback(event.currentTarget,{busy:"Analizando…",done:"Lista analizada ✓"});try{renderTradeAnalyzerResult();fb.success();}catch(error){console.error(error);fb.fail("No se pudo analizar");}});
$("#clearTradeAnalyzerButton")?.addEventListener("click",()=>{const input=$("#tradeAnalyzerInput");if(input)input.value="";const dialog=$("#tradeAnalyzerDialog");dialog?.classList.remove("analyzed");const result=$("#tradeAnalyzerResult");if(result){result.hidden=true;result.innerHTML="";}input?.focus();});
$("#tradeAnalyzerDialog")?.addEventListener("click",event=>{if(event.target===$("#tradeAnalyzerDialog"))closeTradeAnalyzer();});

document.querySelectorAll(".collection-filter-button").forEach(button=>button.onclick=()=>{
 document.querySelectorAll(".collection-filter-button").forEach(x=>x.classList.remove("active"));
 button.classList.add("active");
 collectionFilter=button.dataset.collectionFilter;
 currentFilter=collectionFilter==="missing"?"need":collectionFilter==="repeats"?"offer":"all";
 document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.filter===currentFilter));
 renderGlobalCollection();
});
$("#openClassicExchangeButton").onclick=()=>{
 $("#settingsDialog").close();
 enterManualExchange();
 showToast("Modo intercambio manual activado");
};



$("#openGlobalExchangeListButton").onclick=()=>{
 exchangeListType="give";
 renderExchangeDialogTabs();
 renderExchangeList();
 $("#exchangeDialog").showModal();
};


$("#cancelGlobalExchangeButton").onclick=()=>{
 const totals=exchangeTotals();
 if((totals.give||totals.receive)&&!confirm("¿Cancelar este intercambio? Las selecciones marcadas se descartarán."))return;
 exitManualExchange();
};


$("#collectionSort").onchange=event=>{
 collectionSort=event.target.value;
 renderGlobalCollection();
};

let scrollSaveTimer=null;
window.addEventListener("scroll",()=>{
 clearTimeout(scrollSaveTimer);
 scrollSaveTimer=setTimeout(()=>{
   const p=projects?.[activeProjectId];if(!p)return;
   p.ui={...(p.ui||{}),scrollY:Math.max(0,Math.round(window.scrollY||0))};
   localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));
 },180);
},{passive:true});

const PUBLIC_BUILD_VERSION=globalThis.WC26_CONFIG?.version||APP_VERSION;
let serviceWorkerRegistration=null;
let updateReloadStarted=false;

function showAppUpdate(version=PUBLIC_BUILD_VERSION){
 const banner=document.getElementById("appUpdateBanner");
 const message=document.getElementById("appUpdateMessage");
 if(!banner)return;
 if(message)message.textContent=`La versión ${version} está lista para instalar.`;
 banner.hidden=false;
}

function hideAppUpdate(){
 const banner=document.getElementById("appUpdateBanner");
 if(banner)banner.hidden=true;
}

function versionParts(value){
 return String(value||"").match(/\d+/g)?.map(Number)||[];
}

function isNewerVersion(remote,current){
 const a=versionParts(remote),b=versionParts(current);
 const length=Math.max(a.length,b.length);
 for(let i=0;i<length;i++){
   const delta=(a[i]||0)-(b[i]||0);
   if(delta!==0)return delta>0;
 }
 return false;
}

async function checkPublishedVersion(){
 try{
   const response=await fetch(`./version.json?check=${Date.now()}`,{cache:"no-store"});
   if(!response.ok)return;
   const info=await response.json();
   if(isNewerVersion(info.version,PUBLIC_BUILD_VERSION)){
     showAppUpdate(info.version);
     serviceWorkerRegistration?.update().catch(()=>{});
   }
 }catch(error){
   console.debug("No se pudo comprobar la versión publicada",error);
 }
}

function watchInstallingWorker(worker){
 if(!worker)return;
 worker.addEventListener("statechange",()=>{
   // An installed worker is not enough to announce an update: old/stale
   // registrations can remain waiting. Confirm against version.json first.
   if(worker.state==="installed"&&navigator.serviceWorker.controller){
     checkPublishedVersion();
   }
 });
}

async function installAvailableUpdate(){
 const button=document.getElementById("appUpdateButton");
 if(button){button.disabled=true;button.textContent="Actualizando…";}
 try{
   const registration=serviceWorkerRegistration||await navigator.serviceWorker.getRegistration();
   if(registration){
     serviceWorkerRegistration=registration;
     await registration.update().catch(()=>{});
     const worker=registration.waiting||registration.installing;
     if(worker){
       worker.postMessage({type:"SKIP_WAITING"});
       setTimeout(()=>{
         const url=new URL(location.href);
         url.searchParams.set("updated",Date.now());
         location.replace(url.toString());
       },1800);
       return;
     }
   }
   if("caches" in window){
     const keys=await caches.keys();
     await Promise.all(keys.filter(key=>key.startsWith("wc26-build-")).map(key=>caches.delete(key)));
   }
   const url=new URL(location.href);
   url.searchParams.set("updated",Date.now());
   location.replace(url.toString());
 }catch(error){
   console.error("No se pudo aplicar la actualización",error);
   if(button){button.disabled=false;button.textContent="Reintentar";}
 }
}

function initialiseAppUpdates(){
 const button=document.getElementById("appUpdateButton");
 if(button)button.addEventListener("click",installAvailableUpdate);
 if(!("serviceWorker" in navigator))return;

 navigator.serviceWorker.addEventListener("controllerchange",()=>{
   if(updateReloadStarted)return;
   updateReloadStarted=true;
   hideAppUpdate();
   location.reload();
 });

 window.addEventListener("load",async()=>{
   try{
     const registration=await navigator.serviceWorker.register("./service-worker.js",{updateViaCache:"none"});
     serviceWorkerRegistration=registration;
     // Do not show the banner merely because a worker is waiting. The
     // published version check below is the source of truth.
     watchInstallingWorker(registration.installing);
     registration.addEventListener("updatefound",()=>watchInstallingWorker(registration.installing));
     await registration.update().catch(()=>{});
     await checkPublishedVersion();
   }catch(error){
     console.error("No se pudo registrar el sistema de actualización",error);
   }
 });

 document.addEventListener("visibilitychange",()=>{
   if(document.visibilityState==="visible"){
     serviceWorkerRegistration?.update().catch(()=>{});
     checkPublishedVersion();
   }
 });
 setInterval(checkPublishedVersion,5*60*1000);
}

initialiseAppUpdates();
loadData().catch(error=>{console.error(error);hideLoading();document.body.innerHTML="<main class='app-main'><h1>Error al cargar</h1><p>Comprueba que todos los archivos estén subidos.</p></main>"});


/* Build 703.2 · formatos de compartir y copiar + recuperación al volver a primer plano */
document.addEventListener("DOMContentLoaded",()=>{
 $("#onboardingForm")?.addEventListener("submit",createFirstCloudCollection);
 $("#onboardingStartButton")?.addEventListener("click",()=>{closeFirstCollectionOnboarding();switchMainView?.("collection");window.scrollTo({top:0,behavior:"auto"});showToast("Colección creada y sincronizada ✓")});
 const form=$("#editCollectionForm");
 if(form)form.addEventListener("submit",event=>{event.preventDefault();saveEditedCollection()});
 $("#closeEditCollectionDialog")?.addEventListener("click",closeEditCollection);
 $("#editTargetMinus")?.addEventListener("click",()=>changeEditTarget(-1));
 $("#editTargetPlus")?.addEventListener("click",()=>changeEditTarget(1));
 $("#duplicateCollectionButton")?.addEventListener("click",duplicateEditedCollection);
 $("#deleteCollectionButton")?.addEventListener("click",deleteEditedCollection);
 $("#editCollectionDialog")?.addEventListener("click",event=>{if(event.target===$("#editCollectionDialog"))closeEditCollection()});
});

// BUILD 704.3.6 — Ajustes en acordeón: una sección abierta cada vez.
document.addEventListener("toggle",event=>{
 const item=event.target;
 if(!(item instanceof HTMLDetailsElement)||!item.matches(".settings-accordion")||!item.open)return;
 document.querySelectorAll(".settings-accordion[open]").forEach(other=>{if(other!==item)other.open=false;});
},true);

$("#closeAlbumComplete")?.addEventListener("click",()=>{const overlay=$("#albumCompleteOverlay");if(overlay){overlay.classList.remove("show");overlay.hidden=true;}});
