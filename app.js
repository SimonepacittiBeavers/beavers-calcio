import { firebaseConfig, firebaseEnabled } from "./firebase-config.js";

const teams = [
  {id:"esordienti-misto", name:"Esordienti Misto", short:"ESORDIENTI MISTO"},
  {id:"esordienti-puro", name:"Esordienti Puro", short:"ESORDIENTI PURO"},
  {id:"giovanissimi", name:"Giovanissimi", short:"GIOVANISSIMI"},
  {id:"allievi", name:"Allievi", short:"ALLIEVI"}
];

const potentialMeanings = {
  1:"Non pronto",2:"Da monitorare",3:"Potenziale interessante",
  4:"Futuro prima squadra",5:"Da coinvolgere subito"
};

let db = null, auth = null, currentUser = null;
let local = loadLocal();
let state = {view:"dashboard", selectedTeam:"all", selectedPlayer:null};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const today = () => new Date().toISOString().slice(0,10);
const toast = msg => { const t=$("#toast"); t.textContent=msg; t.style.display="block"; setTimeout(()=>t.style.display="none",2200); };

function loadLocal(){
  const raw = localStorage.getItem("beaversData");
  if(raw) return JSON.parse(raw);
  return {
    return {
  players:[],
  trainings:[],
  trainingRecords:[],
  matches:[],
  matchRecords:[],
  evaluations:[],
  potentials:[],
  notes:[]
};

function saveLocal(){
  localStorage.setItem("beaversData",JSON.stringify(local));
}

async function boot(){
  if(firebaseEnabled){
    try{
      const {initializeApp}=await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
      const {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut}=await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
      const {getFirestore,collection,getDocs,addDoc,setDoc,doc,deleteDoc}=await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
      const app=initializeApp(firebaseConfig); auth=getAuth(app); db=getFirestore(app);
      window.fb={GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut,collection,getDocs,addDoc,setDoc,doc,deleteDoc};
      onAuthStateChanged(auth, async u=>{ if(u){currentUser=u; await syncFromCloud(); showApp();} else showLogin(); });
      $("#loginBtn").onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).catch(e=>toast(e.message));
      $("#loginHint").textContent="Accesso Google attivo. I dati vengono salvati nel database Firebase.";
    }catch(e){console.error(e); $("#loginHint").textContent="Configurazione cloud non valida: puoi usare la demo."; }
  } else {
    $("#loginBtn").style.display="none";
    $("#loginHint").textContent="Modalità demo locale: i dati restano nel browser. Per il multi-allenatore configura Firebase.";
  }
  $("#demoBtn").onclick=()=>{currentUser={displayName:"Mister Demo",email:"demo@beavers.local"}; showApp();};
  $("#logoutBtn").onclick=async()=>{if(auth&&window.fb) await window.fb.signOut(auth); else showLogin();};
  document.querySelectorAll(".nav-btn[data-view]").forEach(b=>b.onclick=()=>navigate(b.dataset.view));
  $("#importBtn").onclick=()=>$("#excelInput").click();
  $("#excelInput").onchange=handleExcel;
  $("#exportBtn").onclick=exportData;
  $("#settingsBtn").onclick=showSettings;
  $("#mobileMenu").onclick=()=>$(".sidebar").classList.toggle("open");
}

function showLogin(){ $("#loginScreen").classList.remove("hidden"); $("#app").classList.add("hidden"); }
function showApp(){
  $("#loginScreen").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#userName").textContent=currentUser?.displayName||"Mister";
  $("#modeBadge").textContent=firebaseEnabled?"CLOUD":"DEMO";
  render();
}
function navigate(view){state.view=view; $(".sidebar").classList.remove("open"); document.querySelectorAll(".nav-btn[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view)); render();}

function teamPlayers(teamId){
  return local.players.filter(p=>teamId==="all"||p.teamId===teamId);
}
function teamName(id){return teams.find(t=>t.id===id)?.name||"Non assegnata";}
function render(){
  const titles={dashboard:"Benvenuto, Mister!",teams:"Le mie squadre",calendar:"Calendario",trainings:"Allenamenti",matches:"Partite",players:"Giocatori",evaluations:"Valutazioni",stats:"Statistiche",notes:"Note"};
  $("#pageTitle").textContent=titles[state.view]||"Beavers Calcio";
  $("#pageSubtitle").textContent=state.view==="dashboard"?"Area allenatori Beavers Calcio":"Gestione settore giovanile";
  const fn={dashboard:renderDashboard,teams:renderTeams,calendar:renderCalendar,trainings:renderTrainings,matches:renderMatches,players:renderPlayers,evaluations:renderEvaluations,stats:renderStats,notes:renderNotes}[state.view];
  $("#content").innerHTML=fn();
  bindView();
}
function renderDashboard(){
  const cards=teams.map(t=>`<div class="card team-card"><div class="team-head"><img src="logo.jpeg"><div><h3>${t.name}</h3><span class="muted">${teamPlayers(t.id).length} giocatori</span></div></div><div class="team-foot"><span>Apri squadra</span><button class="btn btn-small btn-primary open-team" data-id="${t.id}">→</button></div></div>`).join("");
  const recent=local.notes.slice(-3).reverse().map(n=>`<div class="note"><b>${esc(n.title||"Nota")}</b><div class="muted">${esc(n.text)}</div></div>`).join("")||'<div class="empty">Nessuna nota recente.</div>';
  const total=local.players.length, pres=calcAttendance();
  return `<div class="grid grid-4">${cards}</div>
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
      <div class="stat"><div><div class="num">${local.matches.length}</div><div class="label">Partite</div></div></div>
    </div></div>
  </div>
  <div style="height:18px"></div><div class="grid grid-2"><div class="card"><h3>Note recenti</h3>${recent}</div>
  <div class="card"><h3>Prossimi appuntamenti</h3>${upcomingHtml()}</div></div>`;
}
function upcomingHtml(){
  const items=[...local.trainings.map(x=>({...x,type:"Allenamento"})),...local.matches.map(x=>({...x,type:"Partita"}))].sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(0,5);
  return items.map(x=>`<div class="note"><b>${esc(x.date)} — ${esc(x.type)}</b><div>${esc(teamName(x.teamId))}${x.opponent?" · "+esc(x.opponent):""}</div></div>`).join("")||'<div class="empty">Nessun appuntamento inserito.</div>';
}
function renderTeams(){return `<div class="grid grid-2">${teams.map(t=>`<div class="card"><div class="team-head"><img src="logo.jpeg" style="width:55px;height:55px;border-radius:10px"><div><h3>${t.name}</h3><div class="muted">${teamPlayers(t.id).length} giocatori</div></div></div><button class="btn btn-primary open-team" data-id="${t.id}">Vedi rosa</button></div>`).join("")}</div>`}
function renderCalendar(){return `<div class="card"><h3>Calendario</h3>${upcomingHtml()}</div>`}
function renderTrainings(){
  const rows=local.trainings.slice().reverse().map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(teamName(x.teamId))}</td><td>${esc(x.title||"Allenamento")}</td><td><button class="btn btn-small btn-primary attendance" data-id="${x.id}">Presenze</button></td></tr>`).join("");
  return `<div class="toolbar"><button class="btn btn-primary" id="addTraining">＋ Nuovo allenamento</button></div><div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Squadra</th><th>Attività</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="empty">Nessun allenamento.</td></tr>'}</tbody></table></div></div>`;
}
function renderMatches(){
  const rows=local.matches.slice().reverse().map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(teamName(x.teamId))}</td><td>${esc(x.opponent)}</td><td><button class="btn btn-small btn-primary matchrec" data-id="${x.id}">Gestisci</button></td></tr>`).join("");
  return `<div class="toolbar"><button class="btn btn-primary" id="addMatch">＋ Nuova partita</button></div><div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Squadra</th><th>Avversario</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="empty">Nessuna partita.</td></tr>'}</tbody></table></div></div>`;
}
function renderPlayers(){
  const filtered=teamPlayers(state.selectedTeam);
  const rows=filtered.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.role||"")}</td><td><button class="btn btn-small btn-primary player" data-id="${p.id}">Scheda</button></td></tr>`).join("");
  return `<div class="toolbar"><select id="teamFilter"><option value="all">Tutte le squadre</option>${teams.map(t=>`<option value="${t.id}" ${state.selectedTeam===t.id?"selected":""}>${t.name}</option>`).join("")}</select><button class="btn btn-primary" id="addPlayer">＋ Nuovo giocatore</button></div><div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Ruolo</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="3" class="empty">Nessun giocatore.</td></tr>'}</tbody></table></div></div>`;
}
function renderEvaluations(){
  const rows=local.evaluations.slice().reverse().map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(playerName(e.playerId))}</td><td>${e.tech||"—"}</td><td>${e.tactic||"—"}</td><td>${e.phys||"—"}</td><td>${e.mental||"—"}</td></tr>`).join("");
  return `<div class="toolbar"><button class="btn btn-primary" id="addEvaluation">＋ Nuova valutazione</button></div><div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Giocatore</th><th>Tecnica</th><th>Tattica</th><th>Fisica</th><th>Mentalità</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="empty">Nessuna valutazione.</td></tr>'}</tbody></table></div></div>`;
}
function renderStats(){
  const cards=teams.map(t=>{const ps=teamPlayers(t.id), ids=ps.map(p=>p.id), rec=local.trainingRecords.filter(r=>ids.includes(r.playerId)); const total=rec.length, present=rec.filter(r=>r.status==="present").length; const pct=total?Math.round(present/total*100):0; return `<div class="card"><h3>${t.name}</h3><div class="stat"><div class="num">${pct}%</div><div class="label">presenza allenamenti</div></div><div class="kpi-bar"><span style="width:${pct}%"></span></div><p class="muted">${ps.length} giocatori · ${local.matches.filter(m=>m.teamId===t.id).length} partite</p></div>`}).join("");
  return `<div class="grid grid-2">${cards}</div>`;
}
function renderNotes(){
  const rows=local.notes.slice().reverse().map(n=>`<div class="note"><b>${esc(n.title||"Nota")}</b> <span class="muted">· ${esc(n.date||"")}</span><div>${esc(n.text)}</div></div>`).join("");
  return `<div class="toolbar"><button class="btn btn-primary" id="addNote">＋ Nuova nota</button></div><div class="card">${rows||'<div class="empty">Nessuna nota.</div>'}</div>`;
}
function playerName(id){return local.players.find(p=>p.id===id)?.name||"Giocatore";}
function calcAttendance(){const r=local.trainingRecords;if(!r.length)return 0;return Math.round(r.filter(x=>x.status==="present").length/r.length*100)}

function bindView(){
  $("#teamFilter")?.addEventListener("change",e=>{state.selectedTeam=e.target.value;render()});
  document.querySelectorAll(".open-team").forEach(b=>b.onclick=()=>{state.selectedTeam=b.dataset.id;state.view="players";render()});
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
}

function modal(html){
  const d=document.createElement("div");d.className="modal";d.innerHTML=`<div class="modal-box">${html}</div>`;document.body.appendChild(d);
  d.querySelector(".close")?.addEventListener("click",()=>d.remove()); return d;
}
function teamOptions(selected=""){return teams.map(t=>`<option value="${t.id}" ${selected===t.id?"selected":""}>${t.name}</option>`).join("")}

function openPlayer(id){
  const p=local.players.find(x=>x.id===id)||{id:"p"+Date.now(),name:"",year:"",teamId:teams[0].id,role:"",foot:"",registered:false};
  const d=modal(`<div class="modal-head"><h3>${id?"Scheda giocatore":"Nuovo giocatore"}</h3><button class="close">×</button></div><div class="form-grid" style="margin-top:18px">
  <div class="field"><label>Nome e cognome</label><input id="pName" value="${esc(p.name)}"></div>
  <div class="field"><label>Anno</label><input id="pYear" type="number" value="${esc(p.year)}"></div>
  <div class="field"><label>Squadra</label><select id="pTeam">${teamOptions(p.teamId)}</select></div>
  <div class="field"><label>Ruolo</label><input id="pRole" value="${esc(p.role)}"></div>
  <div class="field"><label>Piede</label><input id="pFoot" value="${esc(p.foot)}"></div>
  <div class="field"><label>Tesseramento</label><select id="pReg"><option value="true" ${p.registered?"selected":""}>OK</option><option value="false" ${!p.registered?"selected":""}>Da verificare</option></select></div>
  </div><div style="margin-top:20px;display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-primary" id="saveP">Salva</button></div>`);
  d.querySelector("#saveP").onclick=()=>{p.name=$("#pName").value.trim();p.year=$("#pYear").value;p.teamId=$("#pTeam").value;p.role=$("#pRole").value;p.foot=$("#pFoot").value;p.registered=$("#pReg").value==="true";if(!local.players.some(x=>x.id===p.id))local.players.push(p);saveLocal();cloudWrite("players",p);d.remove();render();toast("Giocatore salvato")};
}
function openTraining(){
  const d=modal(`<div class="modal-head"><h3>Nuovo allenamento</h3><button class="close">×</button></div><div class="form-grid" style="margin-top:18px">
  <div class="field"><label>Data</label><input id="tDate" type="date" value="${today()}"></div><div class="field"><label>Squadra</label><select id="tTeam">${teamOptions(teams[0].id)}</select></div>
  <div class="field"><label>Titolo</label><input id="tTitle" value="Allenamento"></div></div><div style="margin-top:20px;text-align:right"><button class="btn btn-primary" id="saveT">Crea allenamento</button></div>`);
  d.querySelector("#saveT").onclick=()=>{const x={id:"t"+Date.now(),date:$("#tDate").value,teamId:$("#tTeam").value,title:$("#tTitle").value};local.trainings.push(x);teamPlayers(x.teamId).forEach(p=>local.trainingRecords.push({trainingId:x.id,playerId:p.id,status:"present",clothing:"OK"}));saveLocal();cloudWrite("trainings",x);cloudWriteMany("trainingRecords",local.trainingRecords.filter(r=>r.trainingId===x.id));d.remove();render();toast("Allenamento creato")};
}
function openAttendance(id){
  const tr=local.trainings.find(x=>x.id===id), ps=teamPlayers(tr.teamId), d=modal(`<div class="modal-head"><h3>Presenze — ${esc(tr.date)}</h3><button class="close">×</button></div><div style="margin-top:14px">${ps.map(p=>{const r=local.trainingRecords.find(x=>x.trainingId===id&&x.playerId===p.id)||{status:"present",clothing:"OK"};return `<div style="display:grid;grid-template-columns:1fr 130px 110px;gap:8px;align-items:center;border-bottom:1px solid var(--border);padding:10px 0"><b>${esc(p.name)}</b><select class="att" data-p="${p.id}"><option value="present" ${r.status==="present"?"selected":""}>Presente</option><option value="absent" ${r.status==="absent"?"selected":""}>Assente</option><option value="justified" ${r.status==="justified"?"selected":""}>Giustificato</option></select><select class="cloth" data-p="${p.id}"><option ${r.clothing==="OK"?"selected":""}>OK</option><option ${r.clothing!=="OK"?"selected":""}>Non OK</option></select></div>`}).join("")}</div><div style="margin-top:18px;text-align:right"><button class="btn btn-primary" id="saveAtt">Salva presenze</button></div>`);
  d.querySelector("#saveAtt").onclick=()=>{ps.forEach(p=>{let r=local.trainingRecords.find(x=>x.trainingId===id&&x.playerId===p.id);if(!r){r={trainingId:id,playerId:p.id};local.trainingRecords.push(r)}r.status=d.querySelector(`.att[data-p="${p.id}"]`).value;r.clothing=d.querySelector(`.cloth[data-p="${p.id}"]`).value});saveLocal();cloudWriteMany("trainingRecords",local.trainingRecords.filter(r=>r.trainingId===id));d.remove();render();toast("Presenze salvate")};
}
function openMatch(){
  const d=modal(`<div class="modal-head"><h3>Nuova partita</h3><button class="close">×</button></div><div class="form-grid" style="margin-top:18px">
  <div class="field"><label>Data</label><input id="mDate" type="date" value="${today()}"></div><div class="field"><label>Squadra</label><select id="mTeam">${teamOptions(teams[0].id)}</select></div>
  <div class="field"><label>Avversario</label><input id="mOpp" placeholder="Nome squadra"></div></div><div style="margin-top:20px;text-align:right"><button class="btn btn-primary" id="saveM">Crea partita</button></div>`);
  d.querySelector("#saveM").onclick=()=>{const x={id:"m"+Date.now(),date:$("#mDate").value,teamId:$("#mTeam").value,opponent:$("#mOpp").value};local.matches.push(x);teamPlayers(x.teamId).forEach(p=>local.matchRecords.push({matchId:x.id,playerId:p.id,called:false,starter:false,minutes:0}));saveLocal();cloudWrite("matches",x);cloudWriteMany("matchRecords",local.matchRecords.filter(r=>r.matchId===x.id));d.remove();render();toast("Partita creata")};
}
function openMatchRecords(id){
  const m=local.matches.find(x=>x.id===id), ps=teamPlayers(m.teamId), d=modal(`<div class="modal-head"><h3>${esc(m.date)} — ${esc(m.opponent)}</h3><button class="close">×</button></div><div style="margin-top:14px">${ps.map(p=>{const r=local.matchRecords.find(x=>x.matchId===id&&x.playerId===p.id)||{};return `<div style="display:grid;grid-template-columns:1fr 80px 80px 90px;gap:8px;align-items:center;border-bottom:1px solid var(--border);padding:9px 0"><b>${esc(p.name)}</b><label><input type="checkbox" class="called" data-p="${p.id}" ${r.called?"checked":""}> Conv.</label><label><input type="checkbox" class="starter" data-p="${p.id}" ${r.starter?"checked":""}> Tit.</label><input class="mins" data-p="${p.id}" type="number" min="0" value="${r.minutes||0}" placeholder="min"></div>`}).join("")}</div><div style="margin-top:18px;text-align:right"><button class="btn btn-primary" id="saveMR">Salva</button></div>`);
  d.querySelector("#saveMR").onclick=()=>{ps.forEach(p=>{let r=local.matchRecords.find(x=>x.matchId===id&&x.playerId===p.id);if(!r){r={matchId:id,playerId:p.id};local.matchRecords.push(r)}r.called=d.querySelector(`.called[data-p="${p.id}"]`).checked;r.starter=d.querySelector(`.starter[data-p="${p.id}"]`).checked;r.minutes=Number(d.querySelector(`.mins[data-p="${p.id}"]`).value||0)});saveLocal();cloudWriteMany("matchRecords",local.matchRecords.filter(r=>r.matchId===id));d.remove();render();toast("Dati partita salvati")};
}
function openEvaluation(){
  const d=modal(`<div class="modal-head"><h3>Valutazione trimestrale</h3><button class="close">×</button></div><div class="form-grid" style="margin-top:18px">
  <div class="field"><label>Giocatore</label><select id="ePlayer">${local.players.map(p=>`<option value="${p.id}">${esc(p.name)} — ${teamName(p.teamId)}</option>`).join("")}</select></div><div class="field"><label>Data</label><input id="eDate" type="date" value="${today()}"></div>
  ${["Tecnica","Tattica","Fisica","Mentalità"].map((x,i)=>`<div class="field"><label>${x}</label><input id="e${i}" type="number" min="1" max="10" step=".5"></div>`).join("")}
  <div class="field"><label>Dettaglio tecnica</label><input id="eTechDetail" placeholder="Controllo, passaggio, dribbling, tiro..."></div>
  <div class="field"><label>Dettaglio mentalità</label><input id="eMentalDetail" placeholder="Impegno, concentrazione, leadership..."></div>
  </div><div style="margin-top:20px;text-align:right"><button class="btn btn-primary" id="saveE">Salva valutazione</button></div>`);
  d.querySelector("#saveE").onclick=()=>{const ev={id:"e"+Date.now(),playerId:$("#ePlayer").value,date:$("#eDate").value,tech:$("#e0").value,tactic:$("#e1").value,phys:$("#e2").value,mental:$("#e3").value,techDetail:$("#eTechDetail").value,mentalDetail:$("#eMentalDetail").value};local.evaluations.push(ev);saveLocal();cloudWrite("evaluations",ev);d.remove();render();toast("Valutazione salvata")};
}
function openNote(){
  const d=modal(`<div class="modal-head"><h3>Nuova nota</h3><button class="close">×</button></div><div style="margin-top:18px" class="field"><label>Titolo</label><input id="nTitle"></div><div style="margin-top:14px" class="field"><label>Nota</label><textarea id="nText" rows="5"></textarea></div><div style="margin-top:18px;text-align:right"><button class="btn btn-primary" id="saveN">Salva</button></div>`);
  d.querySelector("#saveN").onclick=()=>{const note={id:"n"+Date.now(),title:$("#nTitle").value,text:$("#nText").value,date:today()};local.notes.push(note);saveLocal();cloudWrite("notes",note);d.remove();render();toast("Nota salvata")};
}
function showSettings(){
  modal(`<div class="modal-head"><h3>Impostazioni</h3><button class="close">×</button></div>
  <p><b>Modalità:</b> ${firebaseEnabled?"Cloud Firebase":"Demo locale"}</p>
  <p class="muted">La demo salva nel browser. La versione cloud usa Firebase Authentication + Firestore.</p>
  <p><b>Struttura dati già prevista:</b> giocatori, squadre, allenamenti, presenze, partite, minuti, valutazioni, potenziale, note.</p>`);
}

async function handleExcel(e){
  const files=[...e.target.files];
  if(!files.length)return;

  try{
    const XLSX=await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
    let imported=0;

    for(const file of files){
      const wb=XLSX.read(await file.arrayBuffer(),{cellDates:true});
      const ws=wb.Sheets["ANAGRAFICA GIOCATORE"]||wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{defval:null,raw:true});
      local.players = local.players.filter(p => p.sourceExcel !== file.name);
const filename = file.name.toLowerCase().trim();

let teamId = "";

if (filename.includes("alliev")) {
  teamId = "allievi";
} else if (filename.includes("giovan")) {
  teamId = "giovanissimi";
} else if (filename.includes("pura")) {
  teamId = "esordienti-puro";
} else if (filename.includes("misto")) {
  teamId = "esordienti-misto";
} else {
  toast(`File non riconosciuto: ${file.name}`);
  continue;
}

      for(const r of rows){
        const rawName=r["NOME COGNOME"];
        if(rawName===null || rawName===undefined || String(rawName)==="") continue;

        const name=String(rawName);
        const role=r["RUOLO"]===null || r["RUOLO"]===undefined ? "" : String(r["RUOLO"]);

        // Keep the complete Excel row so Firestore contains the source data,
        // while the interface continues to show only Nome e Ruolo.
        const excelRow={};
        Object.entries(r).forEach(([k,v])=>{
          if(v instanceof Date) excelRow[k]=v.toISOString();
          else excelRow[k]=v;
        });

        const excelId=(r["ID"]!==null && r["ID"]!==undefined && String(r["ID"])!=="")
          ? String(r["ID"])
          : name.trim().toLowerCase().replace(/[^a-z0-9àèéìòù]+/gi,"-").replace(/^-|-$/g,"");

        const id=`${teamId}-${excelId}`;
        const player={
          id,
          name,
          year:normalizeYear(r["ANNO"]),
          teamId,
          role,
          foot:r["PIEDE"]===null || r["PIEDE"]===undefined ? "" : String(r["PIEDE"]),
          registered:String(r["TESSERAMENTO"]??"").trim().toLowerCase()==="ok",
          sourceExcel:file.name,
          excelData:excelRow
        };

        const existingIndex=local.players.findIndex(p=>p.id===id);
        if(existingIndex>=0) local.players[existingIndex]=player;
        else local.players.push(player);

        // Se il login Firebase è attivo, salva immediatamente anche in Firestore.
        await cloudWrite("players",player);
        imported++;
      }
    }

    saveLocal();
    render();
    toast(`Importati ${imported} giocatori da ${files.length} Excel`);
  }catch(err){
    console.error(err);
    toast("Impossibile importare gli Excel");
  }
  e.target.value="";
}
function normalizeYear(v){if(!v)return ""; if(v instanceof Date)return v.getFullYear(); const s=String(v); const m=s.match(/(20\d{2})/); return m?m[1]:s}
function exportData(){
  const blob=new Blob([JSON.stringify(local,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`beavers-backup-${today()}.json`;a.click();URL.revokeObjectURL(a.href);
  toast("Backup dati esportato");
}
async function syncFromCloud(){
  if(!db||!window.fb)return;
  try{
    const get=async(name)=>{const s=await window.fb.getDocs(window.fb.collection(db,name));return s.docs.map(d=>({id:d.id,...d.data()}));};
    const [players,trainings,matches,evaluations,notes]=await Promise.all([get("players"),get("trainings"),get("matches"),get("evaluations"),get("notes")]);
    if(players.length)local.players=players;
    if(trainings.length)local.trainings=trainings;
    if(matches.length)local.matches=matches;
    if(evaluations.length)local.evaluations=evaluations;
    if(notes.length)local.notes=notes;
    saveLocal();
  }catch(e){console.warn("Cloud sync non disponibile",e)}
}
async function cloudWrite(collectionName,obj){
  if(db&&window.fb&&firebaseEnabled) {
    try { await window.fb.setDoc(window.fb.doc(db,collectionName,obj.id),obj); }
    catch(e){ console.warn("Cloud write non riuscita", e); }
  }
}
boot();

async function cloudWriteMany(collectionName, items){
  for(const item of items) await cloudWrite(collectionName,item);
}
