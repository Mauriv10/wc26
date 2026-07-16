const APP_VERSION="6.1.5.9";
const DATA_REVISION="2026-07-16-master-4";
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

let originalInventory={},inventory={},flags={},teamGroups={},history=[],finishedSessions=[];
let sessionStats={plus:0,minus:0,startedAt:new Date().toISOString()};
let currentFilter="all",currentView="inventory",exchangeType="give",exchangeListType="give";
let exchange={give:{},receive:{}};
let projects={},activeProjectId="",pendingSync={},lastSyncedAt=null;
let mainTab="collection",collectionFilter="all",collectionTeamFilter="all",collectionSort="album";
let pendingExcelImport=null;
let pendingBackupRestore=null;

const $=s=>document.querySelector(s);
const teamSelect=$("#teamSelect"),teamSearch=$("#teamSearch"),suggestions=$("#searchSuggestions");
const targetInput=$("#targetInput"),targetValue=$("#targetValue"),grid=$("#stickerGrid");
const toast=$("#toast"),undoButton=$("#undoButton"),emptyState=$("#emptyState");

function makeId(){return crypto.randomUUID?.()||`p-${Date.now()}-${Math.random().toString(16).slice(2)}`}
function emptyInventory(){return Object.fromEntries(Object.entries(originalInventory).map(([team,stickers])=>[team,Object.fromEntries(Object.keys(stickers).map(code=>[code,0]))]))}
function defaultProject(name,target,projectInventory){
 return {
   id:makeId(),name,target:Number(target)||1,inventory:structuredClone(projectInventory),
   history:[],finishedSessions:[],sessionStats:{plus:0,minus:0,startedAt:new Date().toISOString()},
   exchange:{give:{},receive:{}},selectedTeam:Object.keys(projectInventory)[0]||"",
   pendingSync:{},lastSyncedAt:null,createdAt:new Date().toISOString()
 };
}
function migrateLegacy(){
 // El Excel maestro incorporado en esta versión es la fuente de verdad.
 const p=defaultProject("Mundial 2026 · 5 álbumes",5,structuredClone(originalInventory));
 p.selectedTeam=localStorage.getItem(LEGACY_KEYS.team)||Object.keys(originalInventory)[0];
 projects={[p.id]:p};activeProjectId=p.id;
 persistProjects();
}
function persistProjects(){
 localStorage.setItem(PROJECTS_KEY,JSON.stringify(projects));
 localStorage.setItem(ACTIVE_PROJECT_KEY,activeProjectId);
}
function loadProjectState(){
 const p=projects[activeProjectId];
 inventory=structuredClone(p.inventory);
 history=structuredClone(p.history||[]);
 finishedSessions=structuredClone(p.finishedSessions||[]);
 sessionStats=structuredClone(p.sessionStats||{plus:0,minus:0,startedAt:new Date().toISOString()});
 exchange=structuredClone(p.exchange||{give:{},receive:{}});
 pendingSync=structuredClone(p.pendingSync||{});
 lastSyncedAt=p.lastSyncedAt||null;
 targetInput.value=String(p.target||1);
 targetValue.textContent=String(p.target||1);
 populateTeams();
 teamSelect.value=inventory[p.selectedTeam]?p.selectedTeam:Object.keys(inventory)[0];
 updateCurrentTeamUI();
 $("#activeProjectName").textContent=p.name;
 renderAll();updateNavigationBadges();updateSyncUI();
}
function commitProjectState(){
 const p=projects[activeProjectId];
 if(!p)return;
 p.inventory=structuredClone(inventory);
 p.history=structuredClone(history.slice(-300));
 p.finishedSessions=structuredClone(finishedSessions.slice(-100));
 p.sessionStats=structuredClone(sessionStats);
 p.exchange=structuredClone(exchange);
 p.pendingSync=structuredClone(pendingSync);
 p.lastSyncedAt=lastSyncedAt;
 p.target=getTarget();
 p.selectedTeam=teamSelect.value;
 persistProjects();
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
 showLoading("Preparando tus proyectos…");
 const [i,f,g]=await Promise.all([
   fetch("./data/inventory.json"),
   fetch("./data/flags-v4.json"),
   fetch("./data/team-groups.json")
 ]);
 originalInventory=await i.json();flags=await f.json();teamGroups=await g.json();
 projects=readJSON(PROJECTS_KEY,null);
 activeProjectId=localStorage.getItem(ACTIVE_PROJECT_KEY)||"";
 if(!projects||!Object.keys(projects).length||!projects[activeProjectId])migrateLegacy();
 loadProjectState();
 renderProjectsList();
 setupSettingsCenter();
 document.body.classList.add("main-tab-collection");
 updateConnectionStatus();
 hideLoading();
}
function readJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function normalize(s){return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()}
function flagHTML(team){return `<img src="${flags[team]||""}" alt="">`}
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
 Object.keys(inventory).forEach(team=>{
   const option=document.createElement("option");
   option.value=team;option.textContent=team;
   teamSelect.appendChild(option);
 });
 renderTeamList(Object.keys(inventory));
}

function updateCurrentTeamUI(){
 const team=teamSelect.value;
 $("#currentTeamName").textContent=team;
 $("#currentTeamFlag").src=flags[team]||"";
}
function selectTeam(team){
 collectionTeamFilter=team||"all";
 teamSearch.value="";
 $("#dialogSearch").value="";
 suggestions.hidden=true;

 if(collectionTeamFilter==="all"){
   // Keep a valid internal team selected so legacy counters/renderers never fail.
   if(!inventory[teamSelect.value]){
     teamSelect.value=Object.keys(inventory)[0];
   }

   $("#currentTeamName").textContent="Todas las selecciones";
   $("#currentTeamFlag").removeAttribute("src");
   $("#currentTeamFlag").alt="Todas";
   $("#currentTeamFlag").style.display="none";

   collectionFilter="all";
   currentFilter="all";

   document.querySelectorAll(".collection-filter-button").forEach(button=>{
     button.classList.toggle("active",button.dataset.collectionFilter==="all");
   });
   document.querySelectorAll(".tab").forEach(button=>{
     button.classList.toggle("active",button.dataset.filter==="all");
   });

   saveAll();
   renderAll();

   // renderAll may refresh legacy UI; force the global label afterwards.
   $("#currentTeamName").textContent="Todas las selecciones";
   $("#currentTeamFlag").removeAttribute("src");
   $("#currentTeamFlag").alt="Todas";
   $("#currentTeamFlag").style.display="none";
   return;
 }

 if(!inventory[team])return;
 $("#currentTeamFlag").style.display="";
 teamSelect.value=team;
 updateCurrentTeamUI();
 saveAll();
 renderAll();
}
function renderTeamList(teams){
 const worldButton=`<button class="team-option world-option" data-team="all">
   <span class="team-option-world-icon">🌍</span><strong>Todas las selecciones</strong>
 </button>`;
 $("#teamList").innerHTML=worldButton+teams.map(team=>`<button class="team-option" data-team="${team}">${flagHTML(team)}<strong>${team}</strong></button>`).join("");
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
   if(currentView==="exchange")stageFromMainList("give",team,code,e.currentTarget);
   else changeQuantity(team,code,-1,e.currentTarget);
 };
 if(plusButton)plusButton.onclick=e=>{
   if(currentView==="exchange")stageFromMainList("receive",team,code,e.currentTarget);
   else changeQuantity(team,code,1,e.currentTarget);
 };
 return card;
}

function changeQuantity(team,code,delta,button){
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
 renderAll();
 showToast(`✓ ${team} ${code} actualizado · x${next}`);
}
function matchesFilter(qty){
 const kind=stateFor(qty).kind;
 return currentFilter==="all"||(currentFilter==="need"&&kind==="need")||(currentFilter==="offer"&&kind==="offer");
}
function renderCards(){
 const team=inventory[teamSelect.value]?teamSelect.value:Object.keys(inventory)[0];
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
 const team=inventory[teamSelect.value]?teamSelect.value:Object.keys(inventory)[0];
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
 return team==="FWC"||code==="01";
}
function collectionStickerMatches(team,code,qty){
 const target=getTarget();
 const effectiveFilter=currentFilter==="need"?"missing":currentFilter==="offer"?"repeats":collectionFilter;
 if(effectiveFilter==="all")return true;
 if(effectiveFilter==="missing")return qty<target;
 if(effectiveFilter==="repeats")return qty>target;
 if(effectiveFilter==="shiny")return isShinySticker(team,code);
 return true;
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
     vibrate();
     saveAll("Intercambio preparado");
     renderAll();
     showToast(`${team} ${code} · ${type==="give"?"dar":"recibir"} x${current+1}`);
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
     vibrate();
     renderAll();
     showToast(`✓ ${team} ${code} · x${next}`);
   });
 }
 return item;
}

function renderGlobalCollection(){
 const list=$("#globalCollectionList");
 if(!list)return;
 list.innerHTML="";
 let teams=Object.entries(inventory);
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
 let total=0,missing=0,repeats=0,shiny=0,fwc=0,badges=0,complete=0;
 Object.entries(inventory).forEach(([team,stickers])=>{
   let teamComplete=true;
   Object.entries(stickers).forEach(([code,raw])=>{
     const qty=Number(raw)||0;
     total+=qty;
     missing+=Math.max(0,target-qty);
     repeats+=Math.max(0,qty-target);
     if(qty<target)teamComplete=false;
     if(team==="FWC"){shiny+=qty;fwc+=qty}
     else if(code==="01"){shiny+=qty;badges+=qty}
   });
   if(teamComplete)complete++;
 });
 const required=Object.keys(inventory).length*20*target;
 return {total,missing,repeats,shiny,fwc,badges,complete,progress:required?Math.min(100,Math.round((total-mathExcessForProgress())/required*100)):0};
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
   statsCompleteTeamsText:`${s.complete} selecciones completas`
 };
 Object.entries(values).forEach(([id,value])=>{const node=$("#"+id);if(node)node.textContent=value});
 const ring=$("#statsProgressRing");
 if(ring)ring.style.setProperty("--progress",String(s.progress));
}
function setMainTab(tab){
 if(tab==="settings"){
   $("#settingsDialog").showModal();
   return;
 }
 mainTab=tab;
 document.body.classList.remove("main-tab-collection","main-tab-statistics","main-tab-trade");
 document.body.classList.add(`main-tab-${tab}`);

 document.querySelectorAll(".bottom-nav-button").forEach(button=>{
   button.classList.toggle("active",button.dataset.mainView===tab);
 });

 const inventoryView=$("#inventoryView");
 const statisticsView=$("#statisticsView");
 const tradeView=$("#tradeView");
 const missingView=$("#missingView");

 if(inventoryView)inventoryView.hidden=tab!=="collection";
 if(statisticsView)statisticsView.hidden=tab!=="statistics";
 if(tradeView)tradeView.hidden=tab!=="trade";
 if(missingView)missingView.hidden=true;

 if(tab==="collection")renderGlobalCollection();
 if(tab==="statistics")renderStatistics();

 window.scrollTo({top:0,behavior:"smooth"});
}

function renderAll(){
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

teamSelect.onchange=()=>{updateCurrentTeamUI();saveAll();renderAll()};
teamSearch.oninput=()=>{
 const q=normalize(teamSearch.value);
 if(!q){suggestions.hidden=true;return}
 const matches=Object.keys(inventory).filter(team=>normalize(team).includes(q)).slice(0,8);
 const worldMatch=["todo","todos","mundo","global","selecciones"].some(word=>word.includes(q)||q.includes(word));
 suggestions.innerHTML=(worldMatch?`<button class="suggestion" data-team="all"><span>🌍</span><strong>Todas las selecciones</strong></button>`:"")
   +matches.map(team=>`<button class="suggestion" data-team="${team}">${flagHTML(team)}<strong>${team}</strong></button>`).join("");
 suggestions.hidden=!matches.length;
 suggestions.querySelectorAll("button").forEach(button=>button.onclick=()=>selectTeam(button.dataset.team));
};
document.addEventListener("click",e=>{if(!e.target.closest(".search-wrap"))suggestions.hidden=true});
$("#teamSelectorButton").onclick=()=>{$("#dialogSearch").value="";renderTeamList(Object.keys(inventory));$("#teamDialog").showModal()};
$("#closeTeamDialog").onclick=()=>$("#teamDialog").close();
$("#dialogSearch").oninput=e=>renderTeamList(Object.keys(inventory).filter(team=>normalize(team).includes(normalize(e.target.value))));
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
     behavior:"smooth",
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
 const teams=Object.keys(groups);
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
 return Object.entries(inventory).map(([team,stickers])=>{
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
   const order=new Map(Object.keys(inventory).map((team,index)=>[team,index]));
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
 const teams=Object.keys(inventory);
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
 const safeName=project.name.replace(/[\\/:*?"<>|]+/g,"-").trim()||"proyecto";
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

$("#resetButton").onclick=()=>{if(confirm("¿Restaurar el inventario cargado desde el último Excel maestro?")){inventory=structuredClone(originalInventory);history=[];sessionStats={plus:0,minus:0,startedAt:new Date().toISOString()};exchange={give:{},receive:{}};saveAll("Inventario restaurado");renderAll()}};


function projectStats(p){
 const total=Object.values(p.inventory).reduce((sum,stickers)=>sum+Object.values(stickers).reduce((a,b)=>a+Number(b),0),0);
 return {total,changes:(p.history||[]).length,pending:Object.keys(p.pendingSync||{}).length};
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
 $("#projectsDialog").close();showToast(`Proyecto: ${projects[id].name}`);
}
function deleteProject(id){
 if(id===activeProjectId){alert("Cambia primero a otro proyecto.");return}
 if(!confirm(`¿Eliminar el proyecto "${projects[id].name}"?`))return;
 createAutomaticBackup("antes-de-eliminar-proyecto");
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
 if(!name){alert("Escribe un nombre para el proyecto.");return}
 const sourceType=document.querySelector('input[name="projectSource"]:checked')?.value||"empty";
 let inv=emptyInventory(),transfer=null,source=null;
 if(sourceType==="repeats"){
   source=projects[$("#sourceProjectSelect").value];
   const mode=document.querySelector('input[name="repeatMode"]:checked')?.value||"target";
   transfer=calculateTransfer(source,target,mode);inv=transfer.inventory;
   if(!confirm(`Crear "${name}" transfiriendo ${transfer.units} cromos del proyecto "${source.name}"?`))return;
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
 showToast(`Proyecto creado: ${name}`);
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
 if(!projectValues.length)throw new Error("La copia no contiene proyectos.");
 for(const project of projectValues){
   if(!project.id||!project.name||!project.inventory)throw new Error("La copia contiene un proyecto incompleto.");
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
 return `<strong>${projectsCount} proyectos</strong><br>
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
   ?"Se reemplazarán todos los proyectos actuales. ¿Continuar?"
   :"Los proyectos de la copia se añadirán como proyectos nuevos. ¿Continuar?";
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
   : "<p>El proyecto y el Excel ya tienen las mismas cantidades.</p>";
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
 if(!confirm(`Marcar ${count} cambios como sincronizados en el proyecto activo?`))return;
 pendingSync={};
 lastSyncedAt=new Date().toISOString();
 saveAll("Proyecto sincronizado");
 renderAll();
 renderProjectsList();
 showToast("✓ Proyecto marcado como sincronizado");
};


function setupSettingsCenter(){
 const dialog=$("#settingsDialog");
 const projectBar=document.querySelector(".project-bar");
 const syncCard=document.querySelector(".sync-card");
 const backupCard=document.querySelector(".backup-card");
 const actions=document.querySelector(".actions");
 if(projectBar)$("#settingsProjectsSlot").appendChild(projectBar);
 if(syncCard)$("#settingsSyncSlot").appendChild(syncCard);
 if(backupCard)$("#settingsBackupSlot").appendChild(backupCard);
 if(actions)$("#settingsActionsSlot").appendChild(actions);
 $("#settingsButton").onclick=()=>dialog.showModal();
 $("#closeSettingsDialog").onclick=()=>dialog.close();
 dialog.addEventListener("click",event=>{
   if(event.target===dialog)dialog.close();
 });
}


$("#settingsTargetButton").onclick=()=>{
 const current=getTarget();
 const value=prompt("Objetivo de álbumes para este proyecto:",String(current));
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


teamSelect.addEventListener("change",()=>{
 collectionTeamFilter=teamSelect.value||"all";
 renderGlobalCollection();
});


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

if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js"));
loadData().catch(error=>{console.error(error);hideLoading();document.body.innerHTML="<main class='app-main'><h1>Error al cargar</h1><p>Comprueba que todos los archivos estén subidos.</p></main>"});
