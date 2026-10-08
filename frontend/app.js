const API_BASE = window.location.protocol === "file:" ? "http://localhost:5000" : "";
const DEVICE_ID = "ESP32-001";

const state = {
  token: localStorage.getItem("smart_power_token") || "",
  user: JSON.parse(localStorage.getItem("smart_power_user") || "null"),
  demo: localStorage.getItem("smart_power_demo") === "true",
  theme: localStorage.getItem("smart_power_theme") || "light",
  device: null,
  latest: null,
  history: [],
  charts: {},
  demoTimer: null
};

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function api(path, options = {}) {
  const headers = {"Content-Type":"application/json", ...(options.headers || {})};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`${API_BASE}${path}`, {...options, headers});
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function loginScreen(message="") {
  $("app").innerHTML = `
    <main class="login-shell">
      <section class="login-card">
        <div class="brand-mark">⚡</div>
        <h1>Smart Power IoT</h1>
        <p>IoT Based Smart Power Monitoring and Control System</p>
        <form id="loginForm">
          <div class="field"><label>Email / Username</label><input id="loginIdentity" required autocomplete="username" placeholder="admin@example.com"></div>
          <div class="field"><label>Password</label><div class="password-wrap"><input id="loginPassword" type="password" required autocomplete="current-password" placeholder="Enter password"><button class="show-pass" type="button" id="showPassword">SHOW</button></div></div>
          <div class="login-row"><label><input id="remember" type="checkbox" checked> Remember me</label><span class="muted">Secure login</span></div>
          <button class="login-submit" type="submit">Login to Dashboard</button>
          <div class="login-error" id="loginError">${esc(message)}</div>
        </form>
        <div class="demo-note">Default demo account is configured in <b>backend/.env</b>.</div>
      </section>
    </main>`;
  $("showPassword").onclick = () => {
    const input = $("loginPassword");
    input.type = input.type === "password" ? "text" : "password";
    $("showPassword").textContent = input.type === "password" ? "SHOW" : "HIDE";
  };
  $("loginForm").onsubmit = async e => {
    e.preventDefault();
    $("loginError").textContent = "";
    try {
      const identity = $("loginIdentity").value.trim();
      const password = $("loginPassword").value;
      const data = await api("/api/auth/login", {method:"POST", body:JSON.stringify({email:identity,password})});
      state.token = data.token; state.user = data.user;
      localStorage.setItem("smart_power_token", data.token);
      localStorage.setItem("smart_power_user", JSON.stringify(data.user));
      if (!$("remember").checked) sessionStorage.setItem("temporary_login","1");
      renderApp();
    } catch (err) { $("loginError").textContent = err.message; }
  };
}

function renderApp() {
  if (!state.token || !state.user) return loginScreen();
  document.documentElement.dataset.theme = state.theme;
  $("app").innerHTML = `
    <div class="app">
      <aside class="sidebar">
        <div class="side-brand"><div class="side-icon">⚡</div><span>Smart Power IoT</span></div>
        <div class="side-sub">ENGINEERING CONTROL PLATFORM</div>
        <nav class="nav">
          <button class="active" data-view="dashboard">▦ <span>Dashboard</span></button>
          <button data-view="monitoring">◉ <span>Live Monitoring</span></button>
          <button data-view="history">▤ <span>Power History</span></button>
          <button data-view="relay">⏻ <span>Relay Control</span></button>
          <button data-view="alerts">⚠ <span>Alerts</span></button>
          <button data-view="devices">▣ <span>Devices</span></button>
          ${state.user.role === "ADMIN" ? `<button data-view="users">♙ <span>Users</span></button><button data-view="logs">☷ <span>System Logs</span></button>` : ""}
          <button data-view="settings">⚙ <span>Settings</span></button>
        </nav>
        <div class="sidebar-bottom"><button class="btn" id="logoutBtn">↪ Logout</button></div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div><h1 id="pageTitle">Dashboard</h1><p>Real-time electrical monitoring and remote load control</p></div>
          <div class="top-actions">
            <span id="demoBadge" class="badge ${state.demo?'badge-orange':'badge-green'}">${state.demo?'● DEMO MODE':'● LIVE MODE'}</span>
            <span id="connectionBadge" class="badge badge-red">● Device Offline</span>
            <div class="user-chip"><div><b>${esc(state.user.name)}</b><div class="small muted">${esc(state.user.role)}</div></div><div class="avatar">${esc(state.user.name[0] || "U")}</div></div>
          </div>
        </header>

        <section id="view-dashboard" class="view active"></section>
        <section id="view-monitoring" class="view"></section>
        <section id="view-history" class="view"></section>
        <section id="view-relay" class="view"></section>
        <section id="view-alerts" class="view"></section>
        <section id="view-devices" class="view"></section>
        ${state.user.role === "ADMIN" ? `<section id="view-users" class="view"></section><section id="view-logs" class="view"></section>` : ""}
        <section id="view-settings" class="view"></section>
      </main>
    </div>
    <div id="toastHost"></div>`;
  bindNavigation();
  bindGlobal();
  buildViews();
  refreshAll();
  connectSocket();
}

function bindNavigation() {
  document.querySelectorAll(".nav button").forEach(btn => btn.onclick = () => showView(btn.dataset.view, btn.textContent.trim()));
}
function showView(name, title) {
  document.querySelectorAll(".nav button").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  $(`view-${name}`).classList.add("active");
  $("pageTitle").textContent = title;
  if (name === "history") loadHistory();
  if (name === "alerts") loadAlerts();
  if (name === "devices") loadDevices();
  if (name === "users" && state.user.role === "ADMIN") loadUsers();
  if (name === "logs" && state.user.role === "ADMIN") loadLogs();
}

function bindGlobal() {
  $("logoutBtn").onclick = async () => {
    try { await api("/api/auth/logout",{method:"POST"}); } catch {}
    state.token=""; state.user=null; localStorage.removeItem("smart_power_token"); localStorage.removeItem("smart_power_user");
    stopDemo(); renderApp();
  };
}

function buildViews() {
  $("view-dashboard").innerHTML = `
    <div class="cards">
      <div class="card"><div class="metric-title">Voltage</div><div class="metric-value" id="vVoltage">-- <span class="metric-unit">V</span></div><div class="metric-foot">AC supply</div></div>
      <div class="card"><div class="metric-title">Current</div><div class="metric-value" id="vCurrent">-- <span class="metric-unit">A</span></div><div class="metric-foot">ACS712</div></div>
      <div class="card"><div class="metric-title">Power</div><div class="metric-value" id="vPower">-- <span class="metric-unit">W</span></div><div class="metric-foot">V × I</div></div>
      <div class="card"><div class="metric-title">Energy</div><div class="metric-value" id="vEnergy">-- <span class="metric-unit">kWh</span></div><div class="metric-foot">Accumulated</div></div>
      <div class="card"><div class="metric-title">Device</div><div class="metric-value" id="vDevice" style="font-size:19px">Offline</div><div class="metric-foot" id="vLastSeen">No data</div></div>
      <div class="card"><div class="metric-title">Relay</div><div class="metric-value" id="vRelay">OFF</div><div class="metric-foot" id="vRelayFoot">Load disconnected</div></div>
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-head"><h2>Live Power Consumption</h2><span class="small muted" id="lastUpdated">Waiting for data</span></div><div class="chart-box"><canvas id="powerChart"></canvas></div></div>
      <div class="card"><div class="card-head"><h2>Relay Control</h2><span class="badge badge-blue">Authorized</span></div><div class="control-card"><div><b>Electrical Load</b><div class="small muted" id="loadText">Disconnected</div></div><button class="switch" id="dashboardRelay"><span></span></button></div><button class="emergency" id="dashboardEmergency">EMERGENCY OFF</button><p class="small muted" style="margin-top:12px">Confirmation is required before changing the relay.</p></div>
    </div>
    <div class="grid-3">
      <div class="card"><div class="card-head"><h2>Current</h2></div><div class="chart-box"><canvas id="currentChart"></canvas></div></div>
      <div class="card"><div class="card-head"><h2>Voltage</h2></div><div class="chart-box"><canvas id="voltageChart"></canvas></div></div>
      <div class="card"><div class="card-head"><h2>Energy</h2></div><div class="chart-box"><canvas id="energyChart"></canvas></div></div>
    </div>`;
  $("view-monitoring").innerHTML = `
    <h2 class="section-title">Live Monitoring</h2><p class="section-sub">Real-time measurements, connectivity and device health.</p>
    <div class="cards">
      <div class="card"><div class="metric-title">Voltage</div><div class="metric-value" id="mVoltage">-- V</div></div>
      <div class="card"><div class="metric-title">Current</div><div class="metric-value" id="mCurrent">-- A</div></div>
      <div class="card"><div class="metric-title">Power</div><div class="metric-value" id="mPower">-- W</div></div>
      <div class="card"><div class="metric-title">Energy</div><div class="metric-value" id="mEnergy">-- kWh</div></div>
      <div class="card"><div class="metric-title">Uptime</div><div class="metric-value" id="mUptime">--</div></div>
      <div class="card"><div class="metric-title">Wi-Fi</div><div class="metric-value" id="mWifi">--</div></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="card-head"><h2>Connection Status</h2></div><div id="monitorStatus"></div></div>`;
  $("view-history").innerHTML = `
    <h2 class="section-title">Power History</h2><p class="section-sub">Review historical electrical parameters.</p>
    <div class="card"><div class="toolbar"><select id="rangeSelect"><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="custom">Custom</option></select><input id="fromDate" type="datetime-local"><input id="toDate" type="datetime-local"><button class="btn btn-primary" id="loadHistoryBtn">Apply</button></div><div class="chart-box"><canvas id="historyChart"></canvas></div></div>
    <div class="card" style="margin-top:16px"><div class="table-wrap"><table class="table"><thead><tr><th>Timestamp</th><th>Voltage</th><th>Current</th><th>Power</th><th>Energy</th><th>Relay</th></tr></thead><tbody id="historyTable"></tbody></table></div></div>`;
  $("view-relay").innerHTML = `
    <h2 class="section-title">Relay Control</h2><p class="section-sub">Remote control of the authorized electrical load.</p>
    <div class="grid-2"><div class="card"><div class="card-head"><h2>Load Control</h2><span id="relayPageStatus" class="badge badge-red">OFF</span></div><div class="control-card"><div><b>Relay Output</b><div class="small muted">ESP32 → AT89S52 → Relay</div></div><button class="switch" id="relayPageSwitch"><span></span></button></div><button class="emergency" id="relayEmergency">EMERGENCY OFF</button></div><div class="card"><h2>Safety</h2><p class="muted small">Relay commands are authenticated. In live mode, the backend sends a command to the ESP32. If the device is offline, control is disabled.</p></div></div>`;
  $("view-alerts").innerHTML = `<h2 class="section-title">Alerts</h2><p class="section-sub">Over-current, over-voltage, abnormal power and communication events.</p><div class="card"><div class="toolbar"><select id="alertStatus"><option value="">All status</option><option>OPEN</option><option>ACKNOWLEDGED</option><option>CLEARED</option></select><button class="btn btn-primary" id="refreshAlerts">Refresh</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Type</th><th>Value</th><th>Severity</th><th>Status</th><th>Time</th><th>Action</th></tr></thead><tbody id="alertsTable"></tbody></table></div></div>`;
  $("view-devices").innerHTML = `<h2 class="section-title">Device Management</h2><p class="section-sub">ESP32 and sensor communication health.</p><div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Device ID</th><th>Name</th><th>Status</th><th>IP</th><th>Wi-Fi</th><th>Last Seen</th><th>Relay</th><th>Sensor</th></tr></thead><tbody id="devicesTable"></tbody></table></div></div>`;
  if (state.user.role === "ADMIN") {
    $("view-users").innerHTML = `<h2 class="section-title">User Management</h2><p class="section-sub">Manage administrators and authorized lab assistants.</p><div class="card"><button class="btn btn-primary" id="addUserBtn">+ Add Lab Assistant</button><div class="table-wrap" style="margin-top:14px"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Devices</th><th>Action</th></tr></thead><tbody id="usersTable"></tbody></table></div></div>`;
    $("view-logs").innerHTML = `<h2 class="section-title">System Logs</h2><p class="section-sub">Authentication and administrative events.</p><div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Action</th><th>Actor</th><th>Details</th><th>Time</th></tr></thead><tbody id="logsTable"></tbody></table></div></div>`;
    $("addUserBtn").onclick = addUser;
  }
  $("view-settings").innerHTML = `<h2 class="section-title">Settings</h2><p class="section-sub">Dashboard preferences and demonstration controls.</p><div class="card"><div class="switch-row"><div><b>Demo Mode</b><div class="small muted">Generate sample data only for demonstration. Clearly marked as DEMO.</div></div><button class="switch ${state.demo?'on':''}" id="demoSwitch"><span></span></button></div><div class="switch-row"><div><b>Dark Mode</b><div class="small muted">Use a dark engineering dashboard theme.</div></div><button class="switch ${state.theme==='dark'?'on':''}" id="themeSwitch"><span></span></button></div></div>`;

  $("dashboardRelay").onclick = () => requestRelay(!state.device?.relay_status);
  $("dashboardEmergency").onclick = () => requestRelay(false);
  $("relayPageSwitch").onclick = () => requestRelay(!state.device?.relay_status);
  $("relayEmergency").onclick = () => requestRelay(false);
  $("loadHistoryBtn").onclick = loadHistory;
  $("refreshAlerts").onclick = loadAlerts;
  $("demoSwitch").onclick = () => { state.demo=!state.demo; localStorage.setItem("smart_power_demo",state.demo); if(state.demo) startDemo(); else stopDemo(); renderApp(); };
  $("themeSwitch").onclick = () => { state.theme=state.theme==="dark"?"light":"dark"; localStorage.setItem("smart_power_theme",state.theme); renderApp(); };
}

async function refreshAll() {
  if (state.demo) {
    state.device = {device_id:DEVICE_ID,device_name:"Demo ESP32",status:"ONLINE",wifi_status:"CONNECTED",last_seen:new Date().toISOString(),relay_status:false,sensor_status:"OK"};
    startDemo();
    updateUI();
    return;
  }
  try {
    const [latest, device] = await Promise.all([api(`/api/sensor-data/latest?device_id=${DEVICE_ID}`),api(`/api/device/status?device_id=${DEVICE_ID}`)]);
    state.latest=latest.reading; state.device=device.device; updateUI();
  } catch (e) {
    state.device = {device_id:DEVICE_ID,status:"OFFLINE",relay_status:false};
    updateUI();
    toast("Backend/device data unavailable");
  }
}

function connectSocket() {
  if (state.demo || typeof io === "undefined") return;
  const socket = io(API_BASE || undefined);
  socket.on("sensor-update", reading => {
    if (reading.device_id !== DEVICE_ID) return;
    state.latest=reading;
    state.device={...(state.device||{}),status:"ONLINE",last_seen:reading.timestamp,relay_status:reading.relay_status};
    updateUI();
  });
  socket.on("device-status", device => { if(device.device_id===DEVICE_ID){state.device=device;updateUI();} });
  socket.on("relay-status", x => { if(x.device_id===DEVICE_ID){state.device={...(state.device||{}),relay_status:x.relay_status};updateUI();} });
  socket.on("alert-created", x => toast(`Alert: ${x.alert_type}`));
}

function startDemo() {
  stopDemo();
  if (!state.history.length) state.history=[];
  state.demoTimer=setInterval(()=>{
    const relay=state.device?.relay_status ?? false;
    const voltage=229 + Math.random()*3;
    const current=relay ? 1.6 + Math.random()*1.2 : 0;
    const power=voltage*current;
    const previous=state.latest?.energy || 0;
    const energy=previous + power/3600000*2;
    state.latest={device_id:DEVICE_ID,voltage,current,power,energy,relay_status:relay,timestamp:new Date().toISOString()};
    state.device={...(state.device||{}),status:"ONLINE",wifi_status:"CONNECTED",last_seen:new Date().toISOString(),relay_status:relay,wifi_rssi:-48,sensor_status:"OK"};
    state.history.push(state.latest);
    if(state.history.length>60) state.history.shift();
    updateUI();
  },2000);
}
function stopDemo(){if(state.demoTimer){clearInterval(state.demoTimer);state.demoTimer=null;}}

function updateUI() {
  const r=state.latest, d=state.device;
  const online=state.demo || (d?.status==="ONLINE" && d?.last_seen && Date.now()-new Date(d.last_seen).getTime()<30000);
  $("connectionBadge").className=`badge ${online?'badge-green':'badge-red'}`;
  $("connectionBadge").textContent=online?"● Device Online":"● Device Offline";
  $("vVoltage").innerHTML=r?`${Number(r.voltage).toFixed(1)} <span class="metric-unit">V</span>`:"-- <span class=\"metric-unit\">V</span>";
  $("vCurrent").innerHTML=r?`${Number(r.current).toFixed(2)} <span class="metric-unit">A</span>`:"-- <span class=\"metric-unit\">A</span>";
  $("vPower").innerHTML=r?`${Number(r.power).toFixed(0)} <span class="metric-unit">W</span>`:"-- <span class=\"metric-unit\">W</span>";
  $("vEnergy").innerHTML=r?`${Number(r.energy).toFixed(3)} <span class="metric-unit">kWh</span>`:"-- <span class=\"metric-unit\">kWh</span>";
  $("vDevice").textContent=online?"Online":"Offline";
  $("vLastSeen").textContent=d?.last_seen?`Last seen ${formatTime(d.last_seen)}`:"No data";
  $("vRelay").textContent=d?.relay_status?"ON":"OFF";
  $("vRelayFoot").textContent=d?.relay_status?"Load connected":"Load disconnected";
  $("loadText").textContent=d?.relay_status?"Load connected":"Disconnected";
  $("lastUpdated").textContent=r?.timestamp?`Updated ${formatTime(r.timestamp)}`:"Waiting for data";
  ["dashboardRelay","relayPageSwitch"].forEach(id=>{if($(id)){ $(id).classList.toggle("on",!!d?.relay_status); $(id).disabled=!state.demo&&!online; }});
  if($("relayPageStatus")){$("relayPageStatus").textContent=d?.relay_status?"ON":"OFF";$("relayPageStatus").className=`badge ${d?.relay_status?'badge-green':'badge-red'}`;}
  $("mVoltage").textContent=r?`${Number(r.voltage).toFixed(1)} V`:"-- V"; $("mCurrent").textContent=r?`${Number(r.current).toFixed(2)} A`:"-- A"; $("mPower").textContent=r?`${Number(r.power).toFixed(0)} W`:"-- W"; $("mEnergy").textContent=r?`${Number(r.energy).toFixed(3)} kWh`:"-- kWh";
  $("mWifi").textContent=d?.wifi_status||"Offline"; $("mUptime").textContent=d?.last_seen?formatTime(d.last_seen):"--";
  $("monitorStatus").innerHTML=`<p><span class="status-dot ${online?'online':'offline'}"></span> ${online?'ESP32 connected':'ESP32 offline'}</p><p class="small muted">Last communication: ${d?.last_seen?formatTime(d.last_seen):'No communication recorded'}</p>`;
  updateCharts();
}

function makeChart(id,label,data,labels) {
  const el=$(id); if(!el || typeof Chart==="undefined") return;
  if(state.charts[id]) state.charts[id].destroy();
  state.charts[id]=new Chart(el,{type:"line",data:{labels,datasets:[{label,data,borderColor:"#2563eb",backgroundColor:"#2563eb18",fill:true,tension:.35,pointRadius:0,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{display:false},y:{beginAtZero:true,grid:{color:"#e5eaf1"}}}}});
}
function updateCharts() {
  const arr=state.history.length?state.history:(state.latest?[state.latest]:[]);
  const labels=arr.map(x=>formatTime(x.timestamp));
  makeChart("powerChart","Power",arr.map(x=>Number(x.power)||0),labels);
  makeChart("currentChart","Current",arr.map(x=>Number(x.current)||0),labels);
  makeChart("voltageChart","Voltage",arr.map(x=>Number(x.voltage)||0),labels);
  makeChart("energyChart","Energy",arr.map(x=>Number(x.energy)||0),labels);
}

async function requestRelay(on) {
  if (!state.demo && (!state.device || state.device.status!=="ONLINE")) return toast("Relay disabled: ESP32 is offline.");
  if (!confirm(`Confirm switching the electrical load ${on?"ON":"OFF"}?`)) return;
  if(state.demo) {
    state.device={...(state.device||{}),relay_status:on};
    updateUI(); toast(`Demo relay switched ${on?"ON":"OFF"}`); return;
  }
  try {
    await api(on?"/api/relay/on":"/api/relay/off",{method:"POST",body:JSON.stringify({device_id:DEVICE_ID})});
    toast(`Relay ${on?"ON":"OFF"} command sent to ESP32`);
  } catch(e){toast(e.message);}
}

async function loadHistory() {
  const range=$("rangeSelect").value;
  let from=new Date(), to=new Date();
  if(range==="today"){from.setHours(0,0,0,0);}
  else if(range==="yesterday"){to.setHours(0,0,0,0);from=new Date(to);from.setDate(from.getDate()-1);}
  else if(range==="7"){from.setDate(from.getDate()-7);}
  else if(range==="30"){from.setDate(from.getDate()-30);}
  else {from=new Date($("fromDate").value);to=new Date($("toDate").value);}
  if(state.demo){renderHistory(state.history);return;}
  try { const d=await api(`/api/sensor-data/history?device_id=${DEVICE_ID}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`); renderHistory(d.readings); }
  catch(e){toast(e.message);}
}
function renderHistory(rows){
  const safe=rows||[];
  $("historyTable").innerHTML=safe.slice().reverse().slice(0,300).map(r=>`<tr><td>${formatTime(r.timestamp)}</td><td>${Number(r.voltage).toFixed(1)} V</td><td>${Number(r.current).toFixed(2)} A</td><td>${Number(r.power).toFixed(0)} W</td><td>${Number(r.energy).toFixed(3)} kWh</td><td>${r.relay_status?"ON":"OFF"}</td></tr>`).join("")||`<tr><td colspan="6" class="empty">No readings found.</td></tr>`;
  const labels=safe.map(x=>formatTime(x.timestamp));
  makeChart("historyChart","Power",safe.map(x=>Number(x.power)||0),labels);
}

async function loadAlerts(){
  if(state.demo){ $("alertsTable").innerHTML=`<tr class="alert-row-warning"><td>DEMO_OVER_CURRENT</td><td>0.00 A</td><td><span class="badge badge-orange">WARNING</span></td><td>OPEN</td><td>${formatTime(new Date())}</td><td>Demo</td></tr>`;return; }
  try{const d=await api(`/api/alerts?device_id=${DEVICE_ID}`);const filter=$("alertStatus").value;const rows=d.alerts.filter(a=>!filter||a.status===filter);$("alertsTable").innerHTML=rows.map(a=>`<tr class="alert-row-${a.severity.toLowerCase()}"><td>${esc(a.alert_type)}</td><td>${a.value==null?"-":Number(a.value).toFixed(2)}</td><td><span class="badge ${a.severity==='CRITICAL'?'badge-red':a.severity==='WARNING'?'badge-orange':'badge-blue'}">${a.severity}</span></td><td>${a.status}</td><td>${formatTime(a.timestamp)}</td><td>${a.status==='OPEN'?`<button class="btn" onclick="ackAlert('${a._id}')">Acknowledge</button>`:"-"}</td></tr>`).join("")||`<tr><td colspan="6" class="empty">No alerts.</td></tr>`;}catch(e){toast(e.message);}
}
async function ackAlert(id){try{await api(`/api/alerts/${id}/acknowledge`,{method:"POST"});loadAlerts();}catch(e){toast(e.message);}}
window.ackAlert=ackAlert;

async function loadDevices(){
  if(state.demo){$("devicesTable").innerHTML=`<tr><td>ESP32-001</td><td>Demo ESP32</td><td><span class="badge badge-green">ONLINE</span></td><td>Demo</td><td>CONNECTED</td><td>${formatTime(new Date())}</td><td>${state.device?.relay_status?"ON":"OFF"}</td><td>OK</td></tr>`;return;}
  try{const d=await api("/api/device");$("devicesTable").innerHTML=d.devices.map(x=>`<tr><td>${esc(x.device_id)}</td><td>${esc(x.device_name)}</td><td><span class="badge ${x.status==='ONLINE'?'badge-green':'badge-red'}">${x.status}</span></td><td>${esc(x.esp32_ip||"-")}</td><td>${esc(x.wifi_status||"-")} ${x.wifi_rssi??""}</td><td>${x.last_seen?formatTime(x.last_seen):"-"}</td><td>${x.relay_status?"ON":"OFF"}</td><td>${esc(x.sensor_status||"-")}</td></tr>`).join("")||`<tr><td colspan="8" class="empty">No devices.</td></tr>`;}catch(e){toast(e.message);}
}

async function loadUsers(){
  try{const d=await api("/api/users");$("usersTable").innerHTML=d.users.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role}</td><td>${u.status}</td><td>${(u.device_permissions||[]).join(", ")||"-"}</td><td><button class="btn" onclick="toggleUser('${u._id}','${u.status}')">${u.status==='ACTIVE'?'Disable':'Enable'}</button> <button class="btn btn-danger" onclick="deleteUser('${u._id}')">Delete</button></td></tr>`).join("")||`<tr><td colspan="6" class="empty">No users.</td></tr>`;}catch(e){toast(e.message);}
}
async function addUser(){
  const name=prompt("Lab assistant name:"); if(!name)return;
  const email=prompt("Email:"); if(!email)return;
  const password=prompt("Temporary password:"); if(!password)return;
  try{await api("/api/users",{method:"POST",body:JSON.stringify({name,email,password,role:"LAB_ASSISTANT",device_permissions:[DEVICE_ID]})});toast("Lab assistant created");loadUsers();}catch(e){toast(e.message);}
}
async function toggleUser(id,status){try{await api(`/api/users/${id}`,{method:"PUT",body:JSON.stringify({status:status==="ACTIVE"?"DISABLED":"ACTIVE"})});loadUsers();}catch(e){toast(e.message);}}
async function deleteUser(id){if(!confirm("Delete this user?"))return;try{await api(`/api/users/${id}`,{method:"DELETE"});loadUsers();}catch(e){toast(e.message);}}
window.toggleUser=toggleUser;window.deleteUser=deleteUser;

async function loadLogs(){try{const d=await api("/api/logs");$("logsTable").innerHTML=d.logs.map(x=>`<tr><td>${esc(x.action)}</td><td>${esc(x.actor)}</td><td>${esc(x.details)}</td><td>${formatTime(x.timestamp)}</td></tr>`).join("")||`<tr><td colspan="4" class="empty">No logs.</td></tr>`;}catch(e){toast(e.message);}}

function formatTime(v){try{return new Date(v).toLocaleString();}catch{return "-";}}
function toast(message){const host=$("toastHost");if(!host)return;const el=document.createElement("div");el.className="toast";el.textContent=message;host.appendChild(el);setTimeout(()=>el.remove(),3200);}

if (state.token && state.user) {
  api("/api/auth/me").then(()=>renderApp()).catch(()=>{state.token="";state.user=null;localStorage.removeItem("smart_power_token");localStorage.removeItem("smart_power_user");loginScreen("Session expired. Please login again.");});
} else loginScreen();
