import { firebaseConfig, firebaseEnabled } from "./firebase-config.js";

const teams = [
  {id:"esordienti-misto", name:"Esordienti Misto", short:"ESORDIENTI MISTO"},
  {id:"esordienti-puro", name:"Esordienti Puro", short:"ESORDIENTI PURO"},
  {id:"giovanissimi", name:"Giovanissimi", short:"GIOVANISSIMI"},
  {id:"allievi", name:"Allievi", short:"ALLIEVI"}
];

const USERS = {
  "simone.pacitti@godanaa.com": {role:"admin", teamId:null, label:"Amministratore"},
  "jack.sgarbossa03@gmail.com": {role:"mister", teamId:"giovanissimi", label:"Mister Giovanissimi"},
  "leo.piralli03@gmail.com": {role:"mister", teamId:"allievi", label:"Mister Allievi"},
  "marsel74@gmail.com": {role:"mister", teamId:"esordienti-misto", label:"Mister Esordienti Misto"}
};

const potentialMeanings = {
  1:"Non pronto",2:"Da monitorare",3:"Potenziale interessante",
  4:"Futuro prima squadra",5:"Da coinvolgere subito"
};

let db = null, auth = null, currentUser = null, unsubscribeCloud = [];
let permissions = {role:"guest",teamId:null,label:"Ospite"};
let local = loadLocal();
let state = {view:"dashboard", selectedTeam:"all", selectedPlayer:null};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const today = () => new Date().toISOString().slice(0,10);
const toast = msg => { const t=$("#toast"); if(!t)return; t.textContent=msg; t.style.display="block"; setTimeout(()=>t.style.display="none",2200); };

function loadLocal(){
  const raw = localStorage.getItem("beaversData");
  if(raw) return JSON.parse(raw);
  return {players:[],trainings:[],trainingRecords:[],matches:[],matchRecords:[],evaluations:[],potentials:[],notes:[]};
}
function saveLocal(){ localStorage.setItem("beaversData",JSON.stringify(local)); }
function getUserPermissions(){
  const email = currentUser?.email?.toLowerCase?.() || "";
  return USERS[email] || {role:"guest",teamId:null,label:"Utente non autorizzato"};
}
function isAdmin(){ return permissions.role === "admin"; }
function isMister(){ return permissions.role === "mister"; }
function visibleTeams(){ return isAdmin() ? teams : teams.filter(t=>t.id===permissions.teamId); }
function canAccessTeam(teamId){ return isAdmin() || (isMister() && permissions.teamId===teamId); }
function enforceTeamSelection(){
  if(!isAdmin()) state.selectedTeam=permissions.teamId;
  else if(!teams.some(t=>t.id===state.selectedTeam) && state.selectedTeam!=="all") state.selectedTeam="all";
}

async function boot(){
  if(firebaseEnabled){
    try{
      const {initializeApp}=await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
      const {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut}=await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
      const {getFirestore,collection,getDocs,query,where,onSnapshot,setDoc,doc,deleteDoc}=await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
      const app=initializeApp(firebaseConfig); auth=getAuth(app); db=getFirestore(app);
      window.fb={GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut,collection,getDocs,query,where,onSnapshot,setDoc,doc,deleteDoc};
      onAuthStateChanged(auth, async u=>{
        stopCloudSync();
        currentUser=u;
        permissions=getUserPermissions();
        if(u && permissions.role!=="guest"){
          enforceTeamSelection();
          await syncFromCloud();
          startCloudSync();
          showApp();
          if(isAdmin()) migrateCloudData();
        }else if(u){
          toast("Account non autorizzato");
          await signOut(auth);
          showLogin();
        }else{
          showLogin();
        }
      });
      $("#loginBtn").onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).catch(e=>toast(e.message));
      $("#loginHint").textContent="Accesso Google attivo. Ogni mister vede solo la propria squadra; l'amministratore vede tutto.";
    }catch(e){
      console.error(e);
      $("#loginHint").textContent="Configurazione cloud non valida: puoi usare la demo.";
    }
  } else {
    $("#loginBtn").style.display="none";
    $("#loginHint").textContent="Modalità demo locale: i dati restano nel browser.";
  }

  $("#demoBtn").onclick=()=>{
    currentUser={displayName:"Amministratore Demo",email:"simone.pacitti@godanaa.com"};
    permissions=getUserPermissions();
    showApp();
  };
  $("#logoutBtn").onclick=async()=>{ if(auth&&window.fb) await window.fb.signOut(auth); else showLogin(); };
  document.querySelectorAll(".nav-btn[data-view]").forEach(b=>b.onclick=()=>navigate(b.dataset.view));
  $("#importBtn").onclick=()=>$("#excelInput").click();
  $("#excelInput").onchange=handleExcel;
  $("#exportBtn").onclick=exportData;
  $("#settingsBtn").onclick=showSettings;
  $("#mobileMenu").onclick=()=>$(".sidebar").classList.toggle("open");
}

function showLogin(){ stopCloudSync(); $("#loginScreen").classList.remove("hidden"); $("#app").classList.add("hidden"); }
function showApp(){
  enforceTeamSelection();
  $("#loginScreen").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#userName").textContent=currentUser?.displayName||permissions.label||"Mister";
  $("#modeBadge").textContent=isAdmin()?"ADMIN":(isMister()?teamName(permissions.teamId).toUpperCase():"DEMO");
  const teamsNav=document.querySelector('[data-view="teams"] span');
  if(teamsNav) teamsNav.textContent=isAdmin()?"Tutte le squadre":"La mia squadra";
  $("#importBtn").style.display=isAdmin()?"flex":"none";
  render();
}
function navigate(view){
  state.view=view;
  $(".sidebar").classList.remove("open");
  document.querySelectorAll(".nav-btn[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  render();
}
function teamPlayers(teamId){
  const target = isAdmin() ? teamId : permissions.teamId;
  return local.players.filter(p=>target==="all"||p.teamId===target);
}
function teamName(id){return teams.find(t=>t.id===id)?.name||"Non assegnata";}
function accessiblePlayers(){ return isAdmin()?local.players:teamPlayers(permissions.teamId); }
function accessibleTrainings(){ return isAdmin()?local.trainings:local.trainings.filter(x=>canAccessTeam(x.teamId)); }
function accessibleMatches(){ return isAdmin()?local.matches:local.matches.filter(x=>canAccessTeam(x.teamId)); }
function accessibleEvaluations(){
  return isAdmin()?local.evaluations:local.evaluations.filter(x=>canAccessTeam(x.teamId) || canAccessPlayer(x.playerId));
}
function accessibleNotes(){ return isAdmin()?local.notes:local.notes.filter(x=>!x.teamId || canAccessTeam(x.teamId)); }
function canAccessPlayer(playerId){ return accessiblePlayers().some(p=>p.id===playerId); }

function render(){
  enforceTeamSelection();
  const titles={dashboard:isAdmin()?"Benvenuto, Simone!":"Benvenuto, Mister!",teams:isAdmin()?"Tutte le squadre":"La mia squadra",calendar:"Calendario",trainings:"Allenamenti",matches:"Partite",players:"Giocatori",evaluations:"Valutazioni",stats:"Statistiche",notes:"Note"};
  $("#pageTitle").textContent=titles[state.view]||"Beavers Calcio";
  $("#pageSubtitle").textContent=isAdmin()?"Amministrazione settore giovanile":"Area allenatore — "+teamName(permissions.teamId);
  const fn={dashboard:renderDashboard,teams:renderTeams,calendar:renderCalendar,trainings:renderTrainings,matches:renderMatches,players:renderPlayers,evaluations:renderEvaluations,stats:renderStats,notes:renderNotes}[state.view];
  $("#content").innerHTML=fn();
  bindView();
}
function renderDashboard(){
  const cards=visibleTeams().map(t=>`<div class="card team-card"><div class="team-head"><img src="logo.jpeg"><div><h3>${t.name}</h3><span class="muted">${teamPlayers(t.id).length} giocatori</span></div></div><div class="team-foot"><span>Apri squadra</span><button class="btn btn-small btn-primary open-team" data-id="${t.id}">→</button></div></div>`).join("");
  const notes=accessibleNotes();
  const recent=notes.slice(-3).reverse().map(n=>`<div class="note"><b>${esc(n.title||"Nota")}</b><div class="muted">${esc(n.text)}</div></div>`).join("")||'<div class="empty">Nessuna nota recente.</div>';
  const total=teamPlayers(isAdmin()?"all":permissions.teamId).length, pres=calcAttendance();
  return `<div class="grid grid-${visibleTeams().length>1?"4":"1"}">${cards}</div>
  <div style="height:18px"></div>
  <div class="grid grid-2">
    <div class="card"><h3>Azioni rapide</h3><div class="grid grid-4">
      <button class="quick" id="newTraining">🏃<b>Nuovo allenamento</b><span class="plus">＋</span></button>
      <button class="quick" id="newMatch">⚽<b>Nuova partita</b><span class="plus">＋</span></button>
      <button class="quick" id="newEvaluation">★<b>Valutazione</b><span class="plus">＋</span></button>
      <button class="quick" id="newPlayer">●<b>Nuovo giocatore</b><span class="plus">＋</span></button>
    </div></div>
    <div class="card"><h3>Riepilogo</h3><div class="grid grid-3">
      <div class="stat"><div><div class="num">${total}</div><div class="label">Giocatori</div></div></div>
      <div class="stat"><div><div class="num">${pres}%</div><div class="label">Presenza media</div></div></div>
      <div class="stat"><div><div class="num">${accessibleMatches().length}</div><div class="label">Partite</div></div></div>
    </div></div>
  </div>
  <div style="height:18px"></div><div class="grid grid-2"><div class="card"><h3>Note recenti</h3>${recent}</div>
  <div class="card"><h3>Prossimi appuntamenti</h3>${upcomingHtml()}</div></div>`;
}
function upcomingHtml(){
  const items=[...accessibleTrainings().map(x=>({...x,type:"Allenamento"})),...accessibleMatches().map(x=>({...x,type:"Partita"}))].sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(0,5);
  return items.map(x=>`<div class="note"><b>${esc(x.date)} — ${esc(x.type)}</b><div>${esc(teamName(x.teamId))}${x.opponent?" · "+esc(x.opponent):""}</div></div>`).join("")||'<div class="empty">Nessun appuntamento inserito.</div>';
}
function renderTeams(){return `<div class="grid grid-2">${visibleTeams().map(t=>`<div class="card"><div class="team-head"><img src="logo.jpeg" style="width:55px;height:55px;border-radius:10px"><div><h3>${t.name}</h3><div class="muted">${teamPlayers(t.id).length} giocatori</div></div></div><button class="btn btn-primary open-team" data-id="${t.id}">Vedi rosa</button></div>`).join("")}</div>`}
function renderCalendar(){return `<div class="card"><h3>Calendario</h3>${upcomingHtml()}</div>`}
function renderTrainings(){
  const rows=accessibleTrainings().slice().reverse().map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(teamName(x.teamId))}</td><td>${esc(x.title||"Allenamento")}</td><td><button class="btn btn-small btn-primary attendance" data-id="${x.id}">Presenze</button> <button class="btn btn-small btn-danger delete-training" data-id="${x.id}">Elimina</button></td></tr>`).join("");
  return `<div class="toolbar"><button class="btn btn-primary" id="addTraining">＋ Nuovo allenamento</button></div><div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Squadra</th><th>Attività</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="empty">Nessun allenamento.</td></tr>'}</tbody></table></div></div>`;
}
function renderMatches(){
  const rows=accessibleMatches().slice().reverse().map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(teamName(x.teamId))}</td><td>${esc(x.opponent)}</td><td><button class="btn btn-small btn-primary matchrec" data-id="${x.id}">Gestisci</button> <button class="btn btn-small btn-danger delete-match" data-id="${x.id}">Elimina</button></td></tr>`).join("");
  return `<div class="toolbar"><button class="btn btn-primary" id="addMatch">＋ Nuova partita</button></div><div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Squadra</th><th>Avversario</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="empty">Nessuna partita.</td></tr>'}</tbody></table></div></div>`;
}
function renderPlayers(){
  const filtered=teamPlayers(state.selectedTeam);
  const rows=filtered.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.role||"")}</td><td><button class="btn btn-small btn-primary player" data-id="${p.id}">Scheda</button></td></tr>`).join("");
  const filter=isAdmin()?`<select id="teamFilter"><option value="all">Tutte le squadre</option>${teams.map(t=>`<option value="${t.id}" ${state.selectedTeam===t.id?"selected":""}>${t.name}</option>`).join("")}</select>`:`<span class="btn btn-secondary">${esc(teamName(permissions.teamId))}</span>`;
  return `<div class="toolbar">${filter}<button class="btn btn-primary" id="addPlayer">＋ Nuovo giocatore</button></div><div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Ruolo</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="3" class="empty">Nessun giocatore.</td></tr>'}</tbody></table></div></div>`;
}
function renderEvaluations(){
  const rows=accessibleEvaluations().slice().reverse().map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(playerName(e.playerId))}</td><td>${e.tech||"—"}</td><td>${e.tactic||"—"}</td><td>${e.phys||"—"}</td><td>${e.mental||"—"}</td><td><button class="btn btn-small btn-danger delete-evaluation" data-id="${e.id}">Elimina</button></td></tr>`).join("");
  return `<div class="toolbar"><button class="btn btn-primary" id="addEvaluation">＋ Nuova valutazione</button></div><div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Giocatore</th><th>Tecnica</th><th>Tattica</th><th>Fisica</th><th>Mentalità</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="7" class="empty">Nessuna valutazione.</td></tr>'}</tbody></table></div></div>`;
}
function renderStats(){
  const cards=visibleTeams().map(t=>{const ps=teamPlayers(t.id), ids=ps.map(p=>p.id), rec=local.trainingRecords.filter(r=>ids.includes(r.playerId)); const total=rec.length, present=rec.filter(r=>r.status==="present").length; const pct=total?Math.round(present/total*100):0; return `<div class="card"><h3>${t.name}</h3><div class="stat"><div class="num">${pct}%</div><div class="label">presenza allenamenti</div></div><div class="kpi-bar"><span style="width:${pct}%"></span></div><p class="muted">${ps.length} giocatori · ${accessibleMatches().filter(m=>m.teamId===t.id).length} partite</p></div>`}).join("");
  return `<div class="grid grid-2">${cards}</div>`;
}
function renderNotes(){
  const rows=accessibleNotes().slice().reverse().map(n=>`<div class="note"><b>${esc(n.title||"Nota")}</b> <span class="muted">· ${esc(n.date||"")}</span><div>${esc(n.text)}</div><div style="margin-top:8px"><button class="btn btn-small btn-danger delete-note" data-id="${n.id}">Elimina</button></div></div>`).join("");
  return `<div class="toolbar"><button class="btn btn-primary" id="addNote">＋ Nuova nota</button></div><div class="card">${rows||'<div class="empty">Nessuna nota.</div>'}</div>`;
}
function playerName(id){return local.players.find(p=>p.id===id)?.name||"Giocatore";}
function calcAttendance(){const ps=accessiblePlayers().map(p=>p.id); const r=local.trainingRecords.filter(x=>ps.includes(x.playerId)); if(!r.length)return 0; return Math.round(r.filter(x=>x.status==="present").length/r.length*100)}

function bindView(){
  $("#teamFilter")?.addEventListener("change",e=>{state.selectedTeam=e.target.value;render()});
  document.querySelectorAll(".open-team").forEach(b=>b.onclick=()=>{if(canAccessTeam(b.dataset.id)){state.selectedTeam=b.dataset.id;state.view="players";render()}});
  $("#newTraining")?.addEventListener("click",()=>openTraining());
  $("#addTraining")?.addEventListener("click",()=>openTraining());
  $("#newMatch")?.addEventListener("click",()=>openMatch());
  $("#addMatch")?.addEventListener("click",()=>openMatch());
  $("#newPlayer")?.addEventListener("click",()=>openPlayer());
  $("#addPlayer")?.addEventListener("click",()=>openPlayer());
  $("#newEvaluation")?.addEventListener("click",()=>openEvaluation());
  $("#addEvaluation")?.addEventListener("click",()=>openEvaluation());
  $("#addNote")?.addEventListener("click",()=>openNote());
  document.querySelectorAll(".player").forEach(b=>b.onclick=()=>openPlayer(b.dataset.id));
  document.querySelectorAll(".attendance").forEach(b=>b.onclick=()=>openAttendance(b.dataset.id));
  document.querySelectorAll(".matchrec").forEach(b=>b.onclick=()=>openMatchRecords(b.dataset.id));
  document.querySelectorAll(".delete-training").forEach(b=>b.onclick=()=>deleteTraining(b.dataset.id));
  document.querySelectorAll(".delete-match").forEach(b=>b.onclick=()=>deleteMatch(b.dataset.id));
  document.querySelectorAll(".delete-evaluation").forEach(b=>b.onclick=()=>deleteEvaluation(b.dataset.id));
  document.querySelectorAll(".delete-note").forEach(b=>b.onclick=()=>deleteNote(b.dataset.id));
}

function modal(html){const d=document.createElement("div");d.className="modal";d.innerHTML=`<div class="modal-box">${html}</div>`;document.body.appendChild(d);d.querySelector(".close")?.addEventListener("click",()=>d.remove());return d;}
function teamOptions(selected=""){
  return visibleTeams().map(t=>`<option value="${t.id}" ${selected===t.id?"selected":""}>${t.name}</option>`).join("");
}

function openPlayer(id){
  const existing=local.players.find(x=>x.id===id);
  if(existing&&!canAccessTeam(existing.teamId))return toast("Non hai accesso a questa squadra");
  const p=existing||{id:"p"+Date.now(),name:"",year:"",teamId:isAdmin()?teams[0].id:permissions.teamId,role:"",foot:"",registered:false};
  const d=modal(`<div class="modal-head"><h3>${id?"Scheda giocatore":"Nuovo giocatore"}</h3><button class="close">×</button></div><div class="form-grid" style="margin-top:18px">
  <div class="field"><label>Nome e cognome</label><input id="pName" value="${esc(p.name)}"></div>
  <div class="field"><label>Anno</label><input id="pYear" type="number" value="${esc(p.year)}"></div>
  <div class="field"><label>Squadra</label><select id="pTeam">${teamOptions(p.teamId)}</select></div>
  <div class="field"><label>Ruolo</label><input id="pRole" value="${esc(p.role)}"></div>
  <div class="field"><label>Piede</label><input id="pFoot" value="${esc(p.foot)}"></div>
  <div class="field"><label>Tesseramento</label><select id="pReg"><option value="true" ${p.registered?"selected":""}>OK</option><option value="false" ${!p.registered?"selected":""}>Da verificare</option></select></div>
  </div><div style="margin-top:20px;display:flex;justify-content:flex-end;gap:8px">${id?'<button class="btn btn-danger" id="deleteP">Elimina</button>':''}<button class="btn btn-primary" id="saveP">Salva</button></div>`);
  d.querySelector("#saveP").onclick=async()=>{
    p.name=$("#pName").value.trim();p.year=$("#pYear").value;p.teamId=$("#pTeam").value;p.role=$("#pRole").value.trim();p.foot=$("#pFoot").value.trim();p.registered=$("#pReg").value==="true";
    if(!p.name)return toast("Inserisci il nome del giocatore");
    if(!canAccessTeam(p.teamId))return toast("Non puoi assegnare giocatori a un'altra squadra");
    if(!local.players.some(x=>x.id===p.id))local.players.push(p); else local.players[local.players.findIndex(x=>x.id===p.id)]=p;
    saveLocal(); await cloudWrite("players",p); d.remove();render();toast("Giocatore salvato");
  };
  d.querySelector("#deleteP")?.addEventListener("click",()=>deletePlayer(p.id,d));
}

function openTraining(){
  const defaultTeam=isAdmin()?teams[0].id:permissions.teamId;
  const d=modal(`<div class="modal-head"><h3>Nuovo allenamento</h3><button class="close">×</button></div><div class="form-grid" style="margin-top:18px">
  <div class="field"><label>Data</label><input id="tDate" type="date" value="${today()}"></div><div class="field"><label>Squadra</label><select id="tTeam">${teamOptions(defaultTeam)}</select></div>
  <div class="field"><label>Titolo</label><input id="tTitle" value="Allenamento"></div></div><div style="margin-top:20px;text-align:right"><button class="btn btn-primary" id="saveT">Crea allenamento</button></div>`);
  d.querySelector("#saveT").onclick=async()=>{const x={id:"t"+Date.now(),date:$("#tDate").value,teamId:$("#tTeam").value,title:$("#tTitle").value};if(!canAccessTeam(x.teamId))return toast("Squadra non autorizzata");local.trainings.push(x);teamPlayers(x.teamId).forEach(p=>local.trainingRecords.push({id:`${x.id}_${p.id}`,trainingId:x.id,playerId:p.id,teamId:x.teamId,status:"present",clothing:"OK"}));saveLocal();await cloudWrite("trainings",x);await cloudWriteMany("trainingRecords",local.trainingRecords.filter(r=>r.trainingId===x.id));d.remove();render();toast("Allenamento creato")};
}
function openAttendance(id){
  const tr=local.trainings.find(x=>x.id===id);if(!tr||!canAccessTeam(tr.teamId))return toast("Non hai accesso a questo allenamento");
  const ps=teamPlayers(tr.teamId), d=modal(`<div class="modal-head"><h3>Presenze — ${esc(tr.date)}</h3><button class="close">×</button></div><div style="margin-top:14px">${ps.map(p=>{const r=local.trainingRecords.find(x=>x.trainingId===id&&x.playerId===p.id)||{status:"present",clothing:"OK"};return `<div style="display:grid;grid-template-columns:1fr 130px 110px;gap:8px;align-items:center;border-bottom:1px solid var(--border);padding:10px 0"><b>${esc(p.name)}</b><select class="att" data-p="${p.id}"><option value="present" ${r.status==="present"?"selected":""}>Presente</option><option value="absent" ${r.status==="absent"?"selected":""}>Assente</option><option value="justified" ${r.status==="justified"?"selected":""}>Giustificato</option></select><select class="cloth" data-p="${p.id}"><option ${r.clothing==="OK"?"selected":""}>OK</option><option ${r.clothing!=="OK"?"selected":""}>Non OK</option></select></div>`}).join("")}</div><div style="margin-top:18px;text-align:right"><button class="btn btn-primary" id="saveAtt">Salva presenze</button></div>`);
  d.querySelector("#saveAtt").onclick=async()=>{ps.forEach(p=>{let r=local.trainingRecords.find(x=>x.trainingId===id&&x.playerId===p.id);if(!r){r={id:`${id}_${p.id}`,trainingId:id,playerId:p.id,teamId:tr.teamId};local.trainingRecords.push(r)}r.status=d.querySelector(`.att[data-p="${p.id}"]`).value;r.clothing=d.querySelector(`.cloth[data-p="${p.id}"]`).value});saveLocal();await cloudWriteMany("trainingRecords",local.trainingRecords.filter(r=>r.trainingId===id));d.remove();render();toast("Presenze salvate")};
}
function openMatch(){
  const defaultTeam=isAdmin()?teams[0].id:permissions.teamId;
  const d=modal(`<div class="modal-head"><h3>Nuova partita</h3><button class="close">×</button></div><div class="form-grid" style="margin-top:18px">
  <div class="field"><label>Data</label><input id="mDate" type="date" value="${today()}"></div><div class="field"><label>Squadra</label><select id="mTeam">${teamOptions(defaultTeam)}</select></div>
  <div class="field"><label>Avversario</label><input id="mOpp" placeholder="Nome squadra"></div></div><div style="margin-top:20px;text-align:right"><button class="btn btn-primary" id="saveM">Crea partita</button></div>`);
  d.querySelector("#saveM").onclick=async()=>{const x={id:"m"+Date.now(),date:$("#mDate").value,teamId:$("#mTeam").value,opponent:$("#mOpp").value};if(!canAccessTeam(x.teamId))return toast("Squadra non autorizzata");local.matches.push(x);teamPlayers(x.teamId).forEach(p=>local.matchRecords.push({id:`${x.id}_${p.id}`,matchId:x.id,playerId:p.id,teamId:x.teamId,called:false,starter:false,minutes:0}));saveLocal();await cloudWrite("matches",x);await cloudWriteMany("matchRecords",local.matchRecords.filter(r=>r.matchId===x.id));d.remove();render();toast("Partita creata")};
}
function openMatchRecords(id){
  const m=local.matches.find(x=>x.id===id);
  if(!m || !canAccessTeam(m.teamId)) return toast("Non hai accesso a questa partita");

  const ps=teamPlayers(m.teamId);

  const d=modal(`
    <div class="modal-head">
      <h3>${esc(m.date)} - ${esc(m.opponent)}</h3>
      <button class="close">×</button>
    </div>

    <div class="card">
      ${ps.map(p=>{
        const r=local.matchRecords.find(
          x=>x.matchId===id && x.playerId===p.id
        ) || {};

        return `
          <div class="form-grid" style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #ddd">
            
            <div>
              <b>${esc(p.name)}</b>
            </div>

            <div class="field">
              <label>Presenza</label>
              <select class="mr-status" data-player="${p.id}">
                <option value="present" ${(r.status||"present")==="present"?"selected":""}>Presente</option>
                <option value="absent" ${(r.status||"")==="absent"?"selected":""}>Assente</option>
                <option value="justified" ${(r.status||"")==="justified"?"selected":""}>Giustificato</option>
              </select>
            </div>

            <div class="field">
              <label>Titolare</label>
              <select class="mr-starter" data-player="${p.id}">
                <option value="false" ${!r.starter?"selected":""}>No</option>
                <option value="true" ${r.starter?"selected":""}>Sì</option>
              </select>
            </div>

            <div class="field">
              <label>Minuti</label>
              <input 
                class="mr-minutes" 
                data-player="${p.id}"
                type="number"
                min="0"
                value="${Number(r.minutes||0)}"
              >
            </div>

            <div class="field">
              <label>Gol</label>
              <input 
                class="mr-goals"
                data-player="${p.id}"
                type="number"
                min="0"
                value="${Number(r.goals||0)}"
              >
            </div>

            <div class="field">
              <label>Assist</label>
              <input 
                class="mr-assists"
                data-player="${p.id}"
                type="number"
                min="0"
                value="${Number(r.assists||0)}"
              >
            </div>

          </div>
        `;
      }).join("")}

      <div style="margin-top:20px;text-align:right">
        <button class="btn btn-primary" id="saveMR">
          Salva statistiche
        </button>
      </div>
    </div>
  `);

  d.querySelector("#saveMR").onclick=async()=>{
    for(const p of ps){

      let r=local.matchRecords.find(
        x=>x.matchId===id && x.playerId===p.id
      );

      if(!r){
        r={
          id:"mr"+Date.now()+Math.random().toString(36).slice(2),
          matchId:id,
          playerId:p.id,
          teamId:m.teamId
        };
        local.matchRecords.push(r);
      }

      r.teamId=m.teamId;
      r.status=d.querySelector(`.mr-status[data-player="${p.id}"]`).value;
      r.starter=d.querySelector(`.mr-starter[data-player="${p.id}"]`).value==="true";
      r.minutes=Number(d.querySelector(`.mr-minutes[data-player="${p.id}"]`).value||0);
      r.goals=Number(d.querySelector(`.mr-goals[data-player="${p.id}"]`).value||0);
      r.assists=Number(d.querySelector(`.mr-assists[data-player="${p.id}"]`).value||0);

      await cloudWrite("matchRecords",r);
    }

    saveLocal();
    d.remove();
    render();
    toast("Statistiche partita salvate");
  };
}
function openEvaluation(){
  const players=accessiblePlayers();
  const d=modal(`<div class="modal-head"><h3>Valutazione trimestrale</h3><button class="close">×</button></div><div class="form-grid" style="margin-top:18px">
  <div class="field"><label>Giocatore</label><select id="ePlayer">${players.map(p=>`<option value="${p.id}">${esc(p.name)} — ${teamName(p.teamId)}</option>`).join("")}</select></div><div class="field"><label>Data</label><input id="eDate" type="date" value="${today()}"></div>
  ${["Tecnica","Tattica","Fisica","Mentalità"].map((x,i)=>`<div class="field"><label>${x}</label><input id="e${i}" type="number" min="1" max="10" step=".5"></div>`).join("")}
  <div class="field"><label>Dettaglio tecnica</label><input id="eTechDetail" placeholder="Controllo, passaggio, dribbling, tiro..."></div>
  <div class="field"><label>Dettaglio mentalità</label><input id="eMentalDetail" placeholder="Impegno, concentrazione, leadership..."></div>
  </div><div style="margin-top:20px;text-align:right"><button class="btn btn-primary" id="saveE">Salva valutazione</button></div>`);
  if(!players.length){d.remove();return toast("Nessun giocatore disponibile");}
  d.querySelector("#saveE").onclick=async()=>{const playerId=$("#ePlayer").value, player=local.players.find(p=>p.id===playerId);const ev={id:"e"+Date.now(),playerId,teamId:player.teamId,date:$("#eDate").value,tech:$("#e0").value,tactic:$("#e1").value,phys:$("#e2").value,mental:$("#e3").value,techDetail:$("#eTechDetail").value,mentalDetail:$("#eMentalDetail").value};local.evaluations.push(ev);saveLocal();await cloudWrite("evaluations",ev);d.remove();render();toast("Valutazione salvata")};
}
function openNote(){
  const defaultTeam=isAdmin()?teams[0].id:permissions.teamId;
  const teamField=isAdmin()?`<div class="field"><label>Squadra</label><select id="nTeam">${teamOptions(defaultTeam)}</select></div>`:`<input id="nTeam" type="hidden" value="${permissions.teamId}">`;
  const d=modal(`<div class="modal-head"><h3>Nuova nota</h3><button class="close">×</button></div><div class="form-grid" style="margin-top:18px">${teamField}<div class="field"><label>Titolo</label><input id="nTitle"></div><div class="field" style="grid-column:1/-1"><label>Nota</label><textarea id="nText" rows="5"></textarea></div></div><div style="margin-top:18px;text-align:right"><button class="btn btn-primary" id="saveN">Salva</button></div>`);
  d.querySelector("#saveN").onclick=async()=>{const note={id:"n"+Date.now(),title:$("#nTitle").value,text:$("#nText").value,date:today(),teamId:$("#nTeam").value};if(!canAccessTeam(note.teamId))return toast("Squadra non autorizzata");local.notes.push(note);saveLocal();await cloudWrite("notes",note);d.remove();render();toast("Nota salvata")};
}
function showSettings(){
  modal(`<div class="modal-head"><h3>Impostazioni</h3><button class="close">×</button></div>
  <p><b>Utente:</b> ${esc(currentUser?.email||"")}</p><p><b>Ruolo:</b> ${esc(permissions.label)}</p>
  <p><b>Modalità:</b> ${firebaseEnabled?"Cloud Firebase":"Demo locale"}</p>
  <p class="muted">Le modifiche vengono salvate su Firestore e sincronizzate in tempo reale tra tutti gli utenti autorizzati.</p>`);
}

async function handleExcel(e){
  if(!isAdmin())return toast("Solo l'amministratore può importare gli Excel");
  const files=[...e.target.files]; if(!files.length)return;
  try{
    const XLSX=await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs"); let imported=0;
    for(const file of files){
      const wb=XLSX.read(await file.arrayBuffer(),{cellDates:true});
      const ws=wb.Sheets["ANAGRAFICA GIOCATORE"]||wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{defval:null,raw:true});
      const filename=file.name.toLowerCase();
      let teamId;
      if(filename.includes("alliev"))teamId="allievi";
      else if(filename.includes("giovan"))teamId="giovanissimi";
      else if(filename.includes("pura"))teamId="esordienti-puro";
      else if(filename.includes("misto"))teamId="esordienti-misto";
      else {toast(`File non riconosciuto: ${file.name}`);continue;}
      for(const r of rows){
        const rawName=r["NOME COGNOME"]; if(rawName===null||rawName===undefined||String(rawName)==="")continue;
        const name=String(rawName), role=r["RUOLO"]==null?"":String(r["RUOLO"]), excelRow={};
        Object.entries(r).forEach(([k,v])=>{excelRow[k]=v instanceof Date?v.toISOString():v});
        const excelId=(r["ID"]!==null&&r["ID"]!==undefined&&String(r["ID"])!=="")?String(r["ID"]):name.trim().toLowerCase().replace(/[^a-z0-9àèéìòù]+/gi,"-").replace(/^-|-$/g,"");
        const id=`${teamId}-${excelId}`;
        const player={id,name,year:normalizeYear(r["ANNO"]),teamId,role,foot:r["PIEDE"]==null?"":String(r["PIEDE"]),registered:String(r["TESSERAMENTO"]??"").trim().toLowerCase()==="ok",sourceExcel:file.name,excelData:excelRow};
        const idx=local.players.findIndex(p=>p.id===id); if(idx>=0)local.players[idx]=player; else local.players.push(player);
        await cloudWrite("players",player); imported++;
      }
    }
    saveLocal();render();toast(`Importati ${imported} giocatori da ${files.length} Excel`);
  }catch(err){console.error(err);toast("Impossibile importare gli Excel");}
  e.target.value="";
}
function normalizeYear(v){if(!v)return "";if(v instanceof Date)return v.getFullYear();const s=String(v),m=s.match(/(20\d{2})/);return m?m[1]:s}
function exportData(){const blob=new Blob([JSON.stringify(local,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`beavers-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href);toast("Backup dati esportato")}

async function readCloudCollection(name){
  if(!db||!window.fb)return [];
  const ref=window.fb.collection(db,name);
  const snap=isAdmin()?await window.fb.getDocs(ref):await window.fb.getDocs(window.fb.query(ref,window.fb.where("teamId","==",permissions.teamId)));
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function syncFromCloud(){
  if(!db||!window.fb)return;
  try{
    const [players,trainings,trainingRecords,matches,matchRecords,evaluations,notes]=await Promise.all([
      readCloudCollection("players"),readCloudCollection("trainings"),readCloudCollection("trainingRecords"),readCloudCollection("matches"),readCloudCollection("matchRecords"),readCloudCollection("evaluations"),readCloudCollection("notes")
    ]);
    local.players=players;local.trainings=trainings;local.trainingRecords=trainingRecords;local.matches=matches;local.matchRecords=matchRecords;local.evaluations=evaluations;local.notes=notes;saveLocal();
  }catch(e){console.warn("Cloud sync non disponibile",e);toast("Errore nel caricamento dei dati cloud")}
}
function startCloudSync(){
  stopCloudSync(); if(!db||!window.fb)return;
  const collections=["players","trainings","trainingRecords","matches","matchRecords","evaluations","notes"];
  for(const name of collections){
    const ref=window.fb.collection(db,name);
    const q=isAdmin()?ref:window.fb.query(ref,window.fb.where("teamId","==",permissions.teamId));
    const unsub=window.fb.onSnapshot(q,snap=>{
      const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
      local[name]=rows; saveLocal(); render();
    },err=>console.warn(`Realtime ${name} non disponibile`,err));
    unsubscribeCloud.push(unsub);
  }
}
function stopCloudSync(){unsubscribeCloud.forEach(fn=>{try{fn()}catch{}});unsubscribeCloud=[];}

async function migrateCloudData(){
  if(!isAdmin()||!db||!window.fb)return;
  try{
    const [trainings,matches,evaluations,trainingRecords,matchRecords,notes]=await Promise.all([readCloudCollection("trainings"),readCloudCollection("matches"),readCloudCollection("evaluations"),readCloudCollection("trainingRecords"),readCloudCollection("matchRecords"),readCloudCollection("notes")]);
    const players=local.players;
    const tmap=Object.fromEntries(trainings.map(x=>[x.id,x.teamId]));
    const mmap=Object.fromEntries(matches.map(x=>[x.id,x.teamId]));
    for(const x of evaluations){if(!x.teamId){const p=players.find(p=>p.id===x.playerId);if(p)await cloudWrite("evaluations",{...x,teamId:p.teamId});}}
    for(const x of trainingRecords){if(!x.teamId&&tmap[x.trainingId])await cloudWrite("trainingRecords",{...x,teamId:tmap[x.trainingId],id:x.id||`${x.trainingId}_${x.playerId}`});}
    for(const x of matchRecords){if(!x.teamId&&mmap[x.matchId])await cloudWrite("matchRecords",{...x,teamId:mmap[x.matchId],id:x.id||`${x.matchId}_${x.playerId}`});}
    for(const x of notes){if(!x.teamId)await cloudWrite("notes",{...x,teamId:permissions.teamId||teams[0].id});}
  }catch(e){console.warn("Migrazione cloud non riuscita",e)}
}

async function cloudWrite(collectionName,obj){
  if(db&&window.fb&&firebaseEnabled){try{await window.fb.setDoc(window.fb.doc(db,collectionName,obj.id),obj);}catch(e){console.warn("Cloud write non riuscita",e);toast("Salvataggio cloud non riuscito")}}
}
async function cloudDelete(collectionName,id){
  if(db&&window.fb&&firebaseEnabled){try{await window.fb.deleteDoc(window.fb.doc(db,collectionName,id));}catch(e){console.warn("Cloud delete non riuscita",e);toast("Eliminazione cloud non riuscita")}}
}
async function cloudWriteMany(collectionName,items){for(const item of items)await cloudWrite(collectionName,item)}
async function cloudDeleteMany(collectionName,items){for(const item of items)await cloudDelete(collectionName,item.id)}

async function deletePlayer(id,modalEl=null){
  const p=local.players.find(x=>x.id===id);if(!p||!canAccessTeam(p.teamId))return toast("Non hai accesso a questo giocatore");
  if(!confirm(`Eliminare definitivamente ${p.name}?`))return;
  const evals=local.evaluations.filter(x=>x.playerId===id), tr=local.trainingRecords.filter(x=>x.playerId===id), mr=local.matchRecords.filter(x=>x.playerId===id);
  local.players=local.players.filter(x=>x.id!==id);local.evaluations=local.evaluations.filter(x=>x.playerId!==id);local.trainingRecords=local.trainingRecords.filter(x=>x.playerId!==id);local.matchRecords=local.matchRecords.filter(x=>x.playerId!==id);saveLocal();
  await cloudDelete("players",id);await cloudDeleteMany("evaluations",evals);await cloudDeleteMany("trainingRecords",tr);await cloudDeleteMany("matchRecords",mr);
  modalEl?.remove();render();toast("Giocatore eliminato");
}
async function deleteTraining(id){const x=local.trainings.find(v=>v.id===id);if(!x||!canAccessTeam(x.teamId))return;if(!confirm("Eliminare questo allenamento e le relative presenze?"))return;const rec=local.trainingRecords.filter(r=>r.trainingId===id);local.trainings=local.trainings.filter(v=>v.id!==id);local.trainingRecords=local.trainingRecords.filter(r=>r.trainingId!==id);saveLocal();await cloudDelete("trainings",id);await cloudDeleteMany("trainingRecords",rec);render();toast("Allenamento eliminato")}
async function deleteMatch(id){const x=local.matches.find(v=>v.id===id);if(!x||!canAccessTeam(x.teamId))return;if(!confirm("Eliminare questa partita e i relativi dati?"))return;const rec=local.matchRecords.filter(r=>r.matchId===id);local.matches=local.matches.filter(v=>v.id!==id);local.matchRecords=local.matchRecords.filter(r=>r.matchId!==id);saveLocal();await cloudDelete("matches",id);await cloudDeleteMany("matchRecords",rec);render();toast("Partita eliminata")}
async function deleteEvaluation(id){const x=local.evaluations.find(v=>v.id===id);if(!x||!canAccessTeam(x.teamId))return;if(!confirm("Eliminare questa valutazione?"))return;local.evaluations=local.evaluations.filter(v=>v.id!==id);saveLocal();await cloudDelete("evaluations",id);render();toast("Valutazione eliminata")}
async function deleteNote(id){const x=local.notes.find(v=>v.id===id);if(!x||!canAccessTeam(x.teamId))return;if(!confirm("Eliminare questa nota?"))return;local.notes=local.notes.filter(v=>v.id!==id);saveLocal();await cloudDelete("notes",id);render();toast("Nota eliminata")}

boot();
