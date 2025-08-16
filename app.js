// Configuration
const SOCKET_SERVER_URL = null; // set to 'https://your-server.example' to connect
const FALLBACK_SIMULATION = true; // keep true to allow demo without a server

// DOM refs
const overallScoreEl = document.getElementById('overallScore');
const scoreTrendEl = document.getElementById('scoreTrend');
const activeAlertsCountEl = document.getElementById('activeAlertsCount');
const avg24El = document.getElementById('avg24');
const alerts24El = document.getElementById('alerts24');
const blockedCountEl = document.getElementById('blockedCount');
const alertsTableBody = document.querySelector('#alertsTable tbody');
const stepsList = document.getElementById('stepsList');
const investigationsList = document.getElementById('investigationsList');
const lastUpdateEl = document.getElementById('lastUpdate');

// Chart.js setups
const riskCtx = document.getElementById('riskChart').getContext('2d');
const alertsCtx = document.getElementById('alertsBar').getContext('2d');

const riskData = {labels:[], datasets:[{label:'Risk score',data:[],tension:0.35, borderWidth:2, fill:true, backgroundColor:(ctx)=>{return 'rgba(6,182,212,0.06)';}, borderColor:'#06b6d4', pointRadius:2}]};
const riskChart = new Chart(riskCtx,{type:'line',data:riskData,options:{responsive:true,maintainAspectRatio:false,scales:{x:{display:true,ticks:{color:'#9aa4b2'}},y:{min:0,max:100,ticks:{color:'#9aa4b2'}}},plugins:{legend:{display:false}}}});

const alertsData = {labels:['Payment','Account','Chargeback','Velocity','Other'],datasets:[{label:'Count',data:[0,0,0,0,0],borderRadius:6,barPercentage:0.7}]};
const alertsChart = new Chart(alertsCtx,{type:'bar',data:alertsData,options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,scales:{x:{ticks:{color:'#9aa4b2'}},y:{ticks:{color:'#9aa4b2'}}},plugins:{legend:{display:false}}}});

// Internal state
let alerts = []; // {id,time,type,risk,entity,handled}
let investigations = [];

// Utilities
function formatTime(ts){ const d=new Date(ts); return d.toLocaleString(); }

function computeOverallScore(){
  if(riskData.datasets[0].data.length===0) return 0;
  const arr = riskData.datasets[0].data.slice(-24*2); // recent values
  const avg = Math.round(arr.reduce((a,b)=>a+b,0)/arr.length);
  return avg;
}

function refreshSummary(){
  const overall = computeOverallScore();
  overallScoreEl.textContent = overall;
  const previous = riskData.datasets[0].data[riskData.datasets[0].data.length-2] ?? overall;
  const trend = overall - previous;
  scoreTrendEl.textContent = trend>0? `Up ${trend}` : trend<0? `Down ${Math.abs(trend)}` : 'Stable';
  avg24El.textContent = Math.round((riskData.datasets[0].data.slice(-48).reduce((a,b)=>a+b,0) || 0) / Math.max(1, Math.min(48, riskData.datasets[0].data.length)));
  alerts24El.textContent = alerts.filter(a=>Date.now()-a.time<24*3600*1000).length;
  blockedCountEl.textContent = alerts.filter(a=>a.autoBlocked).length;
  activeAlertsCountEl.textContent = alerts.filter(a=>!a.handled).length;
}

function pushRiskPoint(value, ts=Date.now()){
  const label = new Date(ts).toLocaleTimeString();
  riskData.labels.push(label);
  riskData.datasets[0].data.push(value);
  if(riskData.labels.length>200){ riskData.labels.shift(); riskData.datasets[0].data.shift(); }
  riskChart.update();
  lastUpdateEl.textContent = new Date(ts).toLocaleTimeString();
  refreshSummary();
}

function addAlert(type, risk, entity, autoBlocked=false){
  const id = 'A'+Math.random().toString(36).slice(2,9);
  const alert = {id,time:Date.now(),type,risk,entity,handled:false,autoBlocked};
  alerts.unshift(alert);
  if(alerts.length>200) alerts.pop();
  renderAlertsTable();
  updateAlertsChart();
  addSuggestedStep(alert);
  refreshSummary();
}

function renderAlertsTable(){
  alertsTableBody.innerHTML = '';
  for(const a of alerts.slice(0,80)){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatTime(a.time)}</td>
      <td>${a.type}</td>
      <td><strong>${a.risk}</strong></td>
      <td>${a.entity}</td>
      <td style="text-align:right">
        <div class="actions">
          <button onclick="handleAlert('${a.id}')" class="btn">Mark</button>
          <button onclick="openInvestigation('${a.id}')" class="btn btn-warn">Investigate</button>
        </div>
      </td>
    `;
    alertsTableBody.appendChild(tr);
  }
}

function updateAlertsChart(){
  const categories = alertsData.labels;
  const counts = categories.map(c=>alerts.filter(a=>a.type===c).length);
  alertsData.datasets[0].data = counts;
  alertsChart.update();
}

function addSuggestedStep(alert){
  const el = document.createElement('div'); el.className='step';
  el.id = 'step-'+alert.id;
  el.innerHTML = `<div style='display:flex;justify-content:space-between;align-items:start'>
    <div>
      <strong>${alert.type} — Risk ${alert.risk}</strong>
      <div style='color:${'var(--muted)'};font-size:12px'>Entity ${alert.entity} — ${new Date(alert.time).toLocaleString()}</div>
    </div>
    <div style='text-align:right'>
      <button class='btn' onclick="handleAlert('${alert.id}')">Mark handled</button>
    </div>
  </div>
  <div style='margin-top:8px;color:var(--muted);font-size:13px'>Suggested: ${suggestedFor(alert)}</div>`;
  stepsList.prepend(el);
}

function suggestedFor(alert){
  if(alert.risk>=80) return 'Block card/account. Contact customer. Full investigation.';
  if(alert.risk>=50) return 'Temporarily hold transaction. Request verification.';
  return 'Monitor and flag for review.';
}

function handleAlert(id){
  const a = alerts.find(x=>x.id===id); if(!a) return;
  a.handled = true;
  const stepEl = document.getElementById('step-'+id); if(stepEl) stepEl.style.opacity=0.5;
  renderAlertsTable(); refreshSummary();
}

function openInvestigation(id){
  const a = alerts.find(x=>x.id===id); if(!a) return;
  const el = document.createElement('div'); el.className='step';
  el.innerHTML = `<strong>Investigation for ${a.entity}</strong><div style='color:var(--muted);font-size:13px;margin-top:6px'>Start: ${new Date().toLocaleString()}</div>
  <div style='margin-top:8px'>
    <button class='btn' onclick="completeInvestigation(this)">Mark complete</button>
    <button class='btn btn-secondary' onclick="escalateInvestigation(this)">Escalate</button>
  </div>`;
  investigationsList.prepend(el);
}
function completeInvestigation(btn){ btn.closest('.step').style.opacity=0.6; }
function escalateInvestigation(btn){ btn.closest('.step').style.borderLeft='4px solid #ff6b6b'; }

// Export CSV
document.getElementById('exportBtn').addEventListener('click',()=>{
  const rows = [['id','time','type','risk','entity','handled']];
  for(const r of alerts) rows.push([r.id,new Date(r.time).toISOString(),r.type,r.risk,r.entity,r.handled]);
  const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('
');
  const blob = new Blob([csv],{type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='corepay-alerts.csv'; a.click(); URL.revokeObjectURL(url);
});

// Simulation helpers
function randomInt(min,max){return Math.floor(Math.random()*(max-min+1))+min}
const types = ['Payment','Account','Chargeback','Velocity','Other'];
function simulateEvent(){
  const type = types[randomInt(0,types.length-1)];
  const risk = randomInt(5,95);
  const entity = 'user_'+randomInt(1000,9999);
  const autoBlocked = risk>85;
  addAlert(type,risk,entity,autoBlocked);
  // push risk point influenced by risk
  const noise = Math.round(risk*0.4 + randomInt(-6,6));
  pushRiskPoint(Math.max(0,Math.min(100,noise)));
}

// Wire simulate button
document.getElementById('simulateBtn').addEventListener('click',()=> simulateEvent());

// Socket.IO connection
function setupSocket(){
  if(!window.io) return false;
  try{
    const socket = SOCKET_SERVER_URL? io(SOCKET_SERVER_URL) : io();
    socket.on('connect',()=>console.log('socket connected',socket.id));
    socket.on('disconnect',()=>console.log('socket disconnected'));
    // expected server message: {type:'event',payload:{risk:34,type:'Payment',entity:'user_123'}}
    socket.on('event', (msg)=>{
      if(msg && msg.payload){
        const p = msg.payload;
        addAlert(p.type||'Other', p.risk||30, p.entity||'unknown', p.autoBlocked||false);
        pushRiskPoint(p.risk||randomInt(5,80), Date.now());
      }
    });
    return true;
  }catch(e){console.warn('socket setup failed',e);return false}
}

// Try to initialize socket; otherwise fallback to simulation
const socketOk = SOCKET_SERVER_URL ? setupSocket() : false;
if(!socketOk && FALLBACK_SIMULATION){
  // seed with a few points
  for(let i=0;i<18;i++){ pushRiskPoint(20+Math.round(Math.sin(i/3)*12)+randomInt(-3,3), Date.now()-((18-i)*5*60*1000)); }
  // seed alerts
  addAlert('Payment',72,'user_8791',true);
  addAlert('Account',46,'user_2371',false);
  setInterval(()=>{ if(Math.random()<0.55) simulateEvent(); else pushRiskPoint(Math.max(0,Math.min(100,computeOverallScore()+randomInt(-6,6)))) }, 4000);
}

// expose some functions for debug buttons (used inline from generated HTML)
window.handleAlert = handleAlert;
window.openInvestigation = openInvestigation;
window.completeInvestigation = completeInvestigation;
window.escalateInvestigation = escalateInvestigation;

// initial refresh
refreshSummary();