/* Achat & Suivi — Front only (localStorage persistence) */
const USER_PROFILES = [
  {username:'admin',  role:'admin',  display:'Administrateur'},
  {username:'user',   role:'user',   display:'Utilisateur'},
  {username:'viewer', role:'viewer', display:'Lecteur'}
];
const STORAGE = {
  ot: 'as_ot', oi: 'as_oi', launch: 'as_launch', exec: 'as_exec', pj: 'as_pj'
};
const state = { currentItemKey: null, currentItemId: null };

const SESSION_TTL_MS = 60 * 1000; // 1 minute session timeout
let sessionTimeoutId = null;
let sessionExpiredFlag = false;

function readSessionRecord(){
  try{ return JSON.parse(localStorage.getItem('as_session')||'null'); }
  catch(e){ return null; }
}

function markSessionExpired(){ sessionExpiredFlag = true; }
function consumeSessionExpiryNotice(){ const flag = sessionExpiredFlag; sessionExpiredFlag = false; return flag; }

function cancelSessionTimeout(){
  if(sessionTimeoutId){
    clearTimeout(sessionTimeoutId);
    sessionTimeoutId = null;
  }
}

function handleSessionTimeout(){
  markSessionExpired();
  clearSession();
  updateUserMenu(null);
  resetAppView();
  try{ loader.hide(true); }catch(e){}
  try{
    if(globalThis.App && App.Auth && typeof App.Auth.initLogin === 'function'){
      App.Auth.initLogin();
    }
  }catch(e){ console.warn(e); }
}

function scheduleSessionTimeout(expiresAt){
  cancelSessionTimeout();
  const expiry = typeof expiresAt === 'number' ? expiresAt : readSessionRecord()?.expiresAt;
  if(!expiry) return;
  const delay = Math.max(0, expiry - Date.now());
  sessionTimeoutId = setTimeout(handleSessionTimeout, delay);
}

// ===== UTIL =====
const fmtMoney = n => Intl.NumberFormat('fr-FR', {style:'currency', currency:'MAD', maximumFractionDigits:0}).format(+n||0);
const fmtDate = v => v ? new Date(v).toLocaleDateString() : '';
const fmtPercent = v => `${(v*100).toFixed(1).replace('.0','')}%`;
const uid = () => Math.random().toString(36).slice(2,10);
function getRole(){ const s = getSession(); return s?s.role:null; }
function isAdmin(){ return getRole()==='admin'; }
function read(key){ return JSON.parse(localStorage.getItem(STORAGE[key])||'[]'); }
function write(key, arr){ localStorage.setItem(STORAGE[key], JSON.stringify(arr)); renderAll(); }
function saveSession(user){
  const record = { ...user, expiresAt: Date.now() + SESSION_TTL_MS };
  localStorage.setItem('as_session', JSON.stringify(record));
  sessionExpiredFlag = false;
  scheduleSessionTimeout(record.expiresAt);
  const { expiresAt, ...rest } = record;
  return rest;
}
function getSession(){
  const record = readSessionRecord();
  if(!record) return null;
  if(record.expiresAt && record.expiresAt <= Date.now()){
    markSessionExpired();
    clearSession();
    return null;
  }
  if(!record.expiresAt){
    record.expiresAt = Date.now() + SESSION_TTL_MS;
    localStorage.setItem('as_session', JSON.stringify(record));
  }
  scheduleSessionTimeout(record.expiresAt);
  const { expiresAt, ...rest } = record;
  return rest;
}
function clearSession(){
  cancelSessionTimeout();
  localStorage.removeItem('as_session');
}

const ROLE_LABELS = { admin:'Administrateur', user:'Utilisateur', viewer:'Lecteur' };
const LIMITED_ROLES = new Set(['user','viewer']);
const DEFAULT_DATASETS = [
  { key:'launch', importKind:'launch', path:'Data/donnees.xlsx', label:'PPA', statusId:'status' },
  { key:'ot', importKind:'ot', path:'Data/donnees_ot.xlsx', label:'budget OT', statusId:'status-ot' },
  { key:'oi', importKind:'oi', path:'Data/donnees_oi.xlsx', label:'budget OI', statusId:'status-oi' }
];

let appReady = false;
let initPromise = null;
let initialDataPromise = null;
let initialDataLoaded = false;

const loader = {
  counter: 0,
  el(){ return document.getElementById('globalLoader'); },
  show(message){
    const el = this.el();
    if(!el) return;
    this.counter++;
    el.classList.remove('d-none');
    el.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(()=> el.classList.add('active'));
    this.setMessage(message || 'Chargement…');
  },
  setMessage(message){
    const el = this.el();
    const msg = el?.querySelector('.loader-message');
    if(msg) msg.textContent = message || 'Chargement…';
  },
  hide(force=false){
    const el = this.el();
    if(!el) return;
    if(force){
      this.counter = 0;
    }else{
      this.counter = Math.max(0, this.counter-1);
      if(this.counter>0) return;
    }
    el.classList.remove('active');
    setTimeout(()=>{
      if(this.counter===0){
        el.classList.add('d-none');
        el.setAttribute('aria-hidden', 'true');
      }
    }, 320);
  }
};

globalThis.AppLoader = loader;

function setAppReady(flag){
  appReady = !!flag;
  document.body?.classList.toggle('app-active', appReady);
}

function bindLogoutButton(){
  const btnOut = document.getElementById('btnLogout');
  if(btnOut && !btnOut.dataset.bound){
    btnOut.dataset.bound = '1';
    btnOut.addEventListener('click', ev=>{
      ev.preventDefault();
      clearSession();
      updateUserMenu(null);
      resetAppView();
      try{ if(globalThis.App && App.Auth && typeof App.Auth.initLogin === 'function'){ App.Auth.initLogin(); } }catch(e){ console.warn(e); }
    });
  }
}

function updateUserMenu(session){
  bindLogoutButton();
  const nameEl = document.getElementById('userMenuName');
  if(nameEl) nameEl.textContent = session ? (session.display || session.username || '–') : '–';
  const badge = document.getElementById('roleBadge');
  if(badge){
    if(session?.role){
      const label = ROLE_LABELS[session.role] || session.role;
      badge.textContent = label;
      badge.classList.remove('d-none');
    }else{
      badge.textContent = '';
      badge.classList.add('d-none');
    }
  }
  const btnOut = document.getElementById('btnLogout');
  if(btnOut){
    btnOut.classList.toggle('d-none', !session);
  }
}

function applyRolePermissions(session){
  const role = session?.role || '';
  if(document.body){
    if(role){ document.body.dataset.role = role; }
    else{ delete document.body.dataset.role; }
    const limited = LIMITED_ROLES.has(role);
    document.body.classList.toggle('role-user', limited);
  }
  if(!session) return;
  const limited = LIMITED_ROLES.has(role);
  const target = limited ? '#tabLaunch' : '#tabDash';
  try{
    const btn = document.querySelector(`#mainTabs [data-bs-target="${target}"]`);
    if(btn && typeof bootstrap !== 'undefined' && bootstrap?.Tab){
      bootstrap.Tab.getOrCreateInstance(btn).show();
    }
  }catch(e){ /* ignore */ }
}

function resetAppView(){
  const loginScreen = document.getElementById('loginScreen');
  if(loginScreen){
    loginScreen.classList.remove('d-none');
    loginScreen.classList.remove('screen-hidden');
  }
  const appSection = document.getElementById('app');
  if(appSection){
    appSection.classList.remove('app-visible');
    if(!appSection.classList.contains('d-none')) appSection.classList.add('d-none');
  }
  const mainNav = document.getElementById('mainNav');
  if(mainNav && !mainNav.classList.contains('d-none')){
    mainNav.classList.add('d-none');
  }
  if(document.body){
    document.body.classList.remove('role-user');
    delete document.body.dataset.role;
  }
  setAppReady(false);
}

async function fetchExcelFile(path){
  const resp = await fetch(path, { cache:'no-store' });
  if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const name = path.split('/').pop() || 'donnees.xlsx';
  return new File([buf], name, { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

async function ensureInitialDataLoaded(force=false){
  if(force){
    initialDataPromise = null;
    initialDataLoaded = false;
  }
  if(initialDataLoaded && !force){
    return { errors: [] };
  }
  if(initialDataPromise){
    return initialDataPromise;
  }
  initialDataPromise = (async ()=>{
    const errors = [];
    for(const cfg of DEFAULT_DATASETS){
      let stored = [];
      try{ stored = read(cfg.key); }catch(e){ stored = []; }
      if(!force && Array.isArray(stored) && stored.length){
        if(cfg.statusId){
          const statusEl = document.getElementById(cfg.statusId);
          if(statusEl && !statusEl.textContent){ statusEl.textContent = 'Données prêtes.'; }
        }
        if(cfg.key==='launch'){
          const card = document.getElementById('accessCard');
          if(card) card.classList.add('d-none');
        }
        continue;
      }
      loader.setMessage(`Chargement ${cfg.label}…`);
      try{
        const file = await fetchExcelFile(cfg.path);
        await App.importExcelFile(cfg.importKind, file);
        if(cfg.statusId){
          const statusEl = document.getElementById(cfg.statusId);
          if(statusEl) statusEl.textContent = `Chargé automatiquement (${file.name})`;
        }
        if(cfg.key==='launch'){
          const card = document.getElementById('accessCard');
          if(card) card.classList.add('d-none');
        }
      }catch(err){
        console.warn('Chargement automatique échoué', cfg.path, err);
        errors.push({ dataset: cfg, error: err });
        if(cfg.statusId){
          const statusEl = document.getElementById(cfg.statusId);
          if(statusEl) statusEl.textContent = `Erreur chargement automatique (${err.message||err})`;
        }
      }
    }
    loader.setMessage('Finalisation…');
    initialDataLoaded = true;
    return { errors };
  })().finally(()=>{ initialDataPromise = null; });
  return initialDataPromise;
}

async function initApp(options={}){
  const session = getSession();
  if(!session){
    resetAppView();
    updateUserMenu(null);
    return { errors: [] };
  }
  if(initPromise){
    return initPromise;
  }
  const { skipLoader=false, forceDataReload=false } = options;
  const loginScreen = document.getElementById('loginScreen');
  const appSection = document.getElementById('app');
  const mainNav = document.getElementById('mainNav');

  const runner = async ()=>{
    if(!skipLoader) loader.show('Préparation de l’application…');
    let result = { errors: [] };
    try{
      result = await ensureInitialDataLoaded(forceDataReload);
    }catch(err){
      console.error('Erreur chargement initial', err);
      result = { errors: [err] };
    }finally{
      try{
        try{ applyRolePermissions(session); }catch(err){ console.error('applyRolePermissions failed', err); }
        try{ updateUserMenu(session); }catch(err){ console.error('updateUserMenu failed', err); }
        try{
          if(mainNav) mainNav.classList.remove('d-none');
          if(appSection){
            appSection.classList.remove('d-none');
            requestAnimationFrame(()=> appSection.classList.add('app-visible'));
          }
          if(loginScreen){
            loginScreen.classList.add('screen-hidden');
            setTimeout(()=> loginScreen.classList.add('d-none'), 450);
          }
        }catch(err){ console.error('initApp UI transition failed', err); }
        try{ renderAll(); }catch(err){ console.error('renderAll failed', err); }
        try{ setAppReady(true); }catch(err){ console.error('setAppReady failed', err); }
      }finally{
        loader.hide(true);
      }
    }
    return result;
  };

  initPromise = runner().catch(err=>{
    throw err;
  }).finally(()=>{ initPromise = null; });
  return initPromise;
}

// ===== RENDERERS =====
function renderAll(){ renderDashboard(); renderOT(); renderOI(); renderLaunch(); renderExec(); }

function renderDashboard(){
  try{
    if(!document.getElementById('dashboard')) return;
    const ot = Array.isArray(read('ot'))? read('ot') : [];
    const oi = Array.isArray(read('oi'))? read('oi') : [];
    const ppa = Array.isArray(read('launch'))? read('launch') : [];

    const setText = (id, value) => { const el = document.getElementById(id); if(el) el.textContent = value; };
    setText('dashOtCount', ot.length);
    setText('dashOiCount', oi.length);
    setText('dashPpaCount', ppa.length);

    const sumEst = arr => arr.reduce((acc, row)=> acc + (Number(row.estimation)||0), 0);
    const sumOt = sumEst(ot);
    const sumOi = sumEst(oi);

    const elOtTotal = document.getElementById('kpi-ot-total'); if(elOtTotal) elOtTotal.textContent = fmtMoney(sumOt);
    const realizedOt = ot.reduce((acc,row)=> acc + (Number(row.realise || row.anX || 0)), 0);
    const otRatio = sumOt>0 ? realizedOt/sumOt : 0;
    const elOtProgress = document.getElementById('kpi-ot-progress');
    if(elOtProgress){
      const pct = Math.min(100, Math.round(otRatio*100));
      elOtProgress.style.width = pct + '%';
      elOtProgress.setAttribute('aria-valuenow', pct);
      elOtProgress.setAttribute('aria-valuemin', '0');
      elOtProgress.setAttribute('aria-valuemax', '100');
    }
    const elOtTaux = document.getElementById('kpi-ot-taux');
    if(elOtTaux){
      elOtTaux.textContent = sumOt>0 ? `${fmtPercent(otRatio)} (${fmtMoney(realizedOt)})` : fmtMoney(realizedOt);
    }

    const oiActual = oi.reduce((acc,row)=> acc + (Number(row.realise || row.actual || row.anX || 0)), 0);
    const oiVariance = sumOi - oiActual;
    const kpiOiVar = document.getElementById('kpi-oi-variance');
    if(kpiOiVar){
      const absVal = fmtMoney(Math.abs(oiVariance));
      kpiOiVar.textContent = oiVariance===0 ? fmtMoney(0) : `${oiVariance>=0?'+':'−'}${absVal}`;
    }
    const kpiOiSub = document.getElementById('kpi-oi-sub');
    if(kpiOiSub){
      kpiOiSub.textContent = `Budget: ${fmtMoney(sumOi)} | Réalisé: ${fmtMoney(oiActual)}`;
    }
    setText('kpi-oi-count', oi.length);

    const updateTop = (data, containerId, totalId, emptyText) => {
      const container = document.getElementById(containerId);
      const totalEl = totalId ? document.getElementById(totalId) : null;
      if(totalEl){ totalEl.textContent = data.length ? fmtMoney(sumEst(data)) : 'Aucune donnée'; }
      if(!container) return;
      if(!data.length){
        container.textContent = emptyText;
        container.classList.add('text-muted');
        return;
      }
      const top = [...data].sort((a,b)=> (Number(b.estimation)||0) - (Number(a.estimation)||0)).slice(0,5);
      const items = top.map(item=>{
        const label = item.designation || item.numero || item.num || item.action || '—';
        return `<li class="list-group-item d-flex justify-content-between align-items-center"><span class="text-truncate me-2" style="max-width:70%">${escapeHTML(label)}</span><span class="fw-semibold">${fmtMoney(item.estimation||0)}</span></li>`;
      }).join('');
      container.innerHTML = `<ol class="list-group list-group-numbered small mb-0">${items}</ol>`;
      container.classList.remove('text-muted');
    };

    updateTop(ot, 'dashOtTop', 'dashOtTotal', 'Importez un fichier OT pour afficher les plus importants budgets.');
    updateTop(oi, 'dashOiTop', 'dashOiTotal', 'Importez un fichier OI pour afficher les plus importants budgets.');
  }catch(e){ console.warn(e); }
}

function renderOT(){
  const tbody = document.querySelector('#tblOT tbody');
  if(!tbody) return;
  let data = read('ot');
  if(!Array.isArray(data)) data = [];
  try{ data = Filters.apply('ot', data); }catch(e){}
  const countEl = document.getElementById('otCount'); if(countEl) countEl.textContent = data.length;
  const total = data.reduce((a,b)=>a+(+b.estimation||0),0);
  const sumEl = document.getElementById('otSum'); if(sumEl) sumEl.textContent = fmtMoney(total);
  try{
    const y0 = new Date().getFullYear();
    const yearEl = document.getElementById('otYearLabel'); if(yearEl) yearEl.textContent = `Année ${y0}`;
  }catch(e){}
  const sumY0 = data.reduce((a,b)=>a+(+b.anX||0),0);
  const otPctEl = document.getElementById('otPct');
  if(otPctEl){
    otPctEl.textContent = total>0 ? `${fmtPercent(sumY0/total)} (${fmtMoney(sumY0)})` : fmtMoney(sumY0);
  }
  tbody.innerHTML='';
  data.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><a href="#" onclick="UI.linkToDossiers('${r.numero}')">${r.numero||''}</a></td>
      <td>${r.action||''}</td>
      <td class="small">${escapeHTML(r.designation||'')}</td>
      <td>${fmtMoney(r.estimation)}</td>
      <td>${fmtMoney(r.anX)}</td>
      <td>${fmtMoney(r.anX1)}</td>
      <td>${fmtMoney(r.anX2)}</td>
      <td>${escapeHTML(r.base||'')}</td>
      <td>${escapeHTML(r.commande||'')}</td>
      <td class="text-nowrap">${isAdmin()? `<button class="btn btn-sm btn-outline-secondary me-1" onclick="UI.openForm('ot','${r.id}')">Modifier</button><button class="btn btn-sm btn-outline-danger" onclick="UI.remove('ot','${r.id}')">Supprimer</button>`:''}
        <button class="btn btn-sm btn-primary ms-1" onclick="UI.openDetail('ot','${r.id}')">Fiche</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderOI(){
  const tbody = document.querySelector('#tblOI tbody');
  if(!tbody) return;
  let data = read('oi');
  if(!Array.isArray(data)) data = [];
  try{ data = Filters.apply('oi', data); }catch(e){}
  const countEl = document.getElementById('oiCount'); if(countEl) countEl.textContent = data.length;
  const total = data.reduce((a,b)=>a+(+b.estimation||0),0);
  const sumEl = document.getElementById('oiSum'); if(sumEl) sumEl.textContent = fmtMoney(total);
  try{
    const y0 = new Date().getFullYear();
    const yearEl = document.getElementById('oiYearLabel'); if(yearEl) yearEl.textContent = `Année ${y0}`;
  }catch(e){}
  const sumY0 = data.reduce((a,b)=>a+(+b.anX||0),0);
  const oiPctEl = document.getElementById('oiPct');
  if(oiPctEl){
    oiPctEl.textContent = total>0 ? `${fmtPercent(sumY0/total)} (${fmtMoney(sumY0)})` : fmtMoney(sumY0);
  }
  tbody.innerHTML='';
  data.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><a href="#" onclick="UI.linkToDossiers('${r.numero}')">${r.numero||''}</a></td>
      <td>${r.action||''}</td>
      <td class="small">${escapeHTML(r.designation||'')}</td>
      <td>${fmtMoney(r.estimation)}</td>
      <td>${fmtMoney(r.anX)}</td>
      <td>${fmtMoney(r.anX1)}</td>
      <td>${fmtMoney(r.anX2)}</td>
      <td>${escapeHTML(r.base||'')}</td>
      <td>${escapeHTML(r.commande||'')}</td>
      <td class="text-nowrap">${isAdmin()? `<button class="btn btn-sm btn-outline-secondary me-1" onclick="UI.openForm('oi','${r.id}')">Modifier</button><button class="btn btn-sm btn-outline-danger" onclick="UI.remove('oi','${r.id}')">Supprimer</button>`:''}
        <button class="btn btn-sm btn-primary ms-1" onclick="UI.openDetail('oi','${r.id}')">Fiche</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== Filters (shared behavior similar to excel.html) =====
const Filters = {
  apply(kind, arr){
    if(!Array.isArray(arr)) return arr;
    const q = (document.getElementById(`flt-${kind}-q`)?.value||'').trim().toLowerCase();
    const min = parseFloat(document.getElementById(`flt-${kind}-min`)?.value||'') || 0;
    const maxRaw = document.getElementById(`flt-${kind}-max`)?.value || '';
    const max = maxRaw === '' ? Infinity : (parseFloat(maxRaw)||0);
    return arr.filter(r=>{
      const combined = `${r.numero||r.num||''} ${r.designation||''} ${r.base||''} ${r.commande||''}`.toLowerCase();
      const qok = !q || combined.includes(q);
      const val = +(r.estimation||0);
      const mok = val >= min;
      const xok = max===Infinity || val <= max;
      return qok && mok && xok;
    });
  },
  reset(kind){
    const q = document.getElementById(`flt-${kind}-q`); if(q) q.value='';
    const mn = document.getElementById(`flt-${kind}-min`); if(mn) mn.value='';
    const mx = document.getElementById(`flt-${kind}-max`); if(mx) mx.value='';
    // re-render
    if(kind==='ot') renderOT(); if(kind==='oi') renderOI();
  }
};

// bind filter inputs to re-render
['ot','oi'].forEach(kind=>{
  const q = document.getElementById(`flt-${kind}-q`);
  const mn = document.getElementById(`flt-${kind}-min`);
  const mx = document.getElementById(`flt-${kind}-max`);
  if(q) q.addEventListener('input', ()=>{ if(getSession()) renderAll(); else renderAll(); });
  if(mn) mn.addEventListener('input', ()=>{ renderAll(); });
  if(mx) mx.addEventListener('input', ()=>{ renderAll(); });
});

function renderLaunch(){
  const tbody = document.querySelector('#dossiersTable tbody');
  if(!tbody) return;
  const data = read('launch');
  const rows = Array.isArray(data) ? data : [];
  tbody.innerHTML='';
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.num||''}</td><td class="small">${escapeHTML(r.designation||'')}</td><td>${fmtMoney(r.estimation)}</td>
      <td>${escapeHTML(r.da||'')}</td><td>${escapeHTML(r.ao||'')}</td><td>${fmtDate(r.date_lancement)}</td>
      <td>${r.pme?'Oui':'Non'}</td><td>${escapeHTML(r.caution_prov||'')}</td><td>${fmtDate(r.date_ouverture)}</td>
      <td>${escapeHTML(r.jug_adm||'')}</td><td>${escapeHTML(r.jug_fin||'')}</td><td>${escapeHTML(r.jug_tech||'')}</td>
      <td>${escapeHTML(r.delai_option||'')}</td><td><a href="#" onclick="UI.linkToBudget('${r.marche}')">${escapeHTML(r.marche||'')}</a></td>
      <td>${escapeHTML(r.obs||'')}</td>
      <td class="text-nowrap">${isAdmin()? `<button class="btn btn-sm btn-outline-secondary me-1" onclick="UI.openForm('launch','${r.id}')">Modifier</button><button class="btn btn-sm btn-outline-danger" onclick="UI.remove('launch','${r.id}')">Supprimer</button>`:''}
        <button class="btn btn-sm btn-primary ms-1" onclick="UI.openDetail('launch','${r.id}')">Fiche</button></td>`;
    tbody.appendChild(tr);
  });
}

function renderExec(){
  // Exec rendering intentionally disabled because 'Dossiers en réalisation' tab was removed from the UI.
  // Data is still stored and available via localStorage if needed.
}

// ===== UI (forms, modals, linking) =====
const UI = {
  openForm(kind, id=null){
    const map = {
      ot: {title:'Budget OT', fields:[['numero','N° OT'],['action','N° action'],['designation','Désignation'],['estimation','Estimation','number'],['anX','Année X','number'],['anX1','Année X+1','number'],['anX2','Année X+2','number'],['base','Base d’estimation'],['commande','N° commande']]},
      oi: {title:'Budget OI', fields:[['numero','N° DI'],['action','N° action'],['designation','Désignation'],['estimation','Estimation','number'],['anX','Année X','number'],['anX1','Année X+1','number'],['anX2','Année X+2','number'],['base','Base d’estimation'],['commande','N° commande']]},
      launch: {title:'Dossier en lancement', fields:[['num','N°'],['designation','Désignation'],['estimation','Estimation','number'],['da','N° DA'],['ao','N° AO'],['date_lancement','Date de lancement','date'],['pme','PME (oui/non)','checkbox'],['caution_prov','Caution provisoire'],['date_ouverture','Date ouverture','date'],['jug_adm','Jugement administratif'],['jug_fin','Jugement financier'],['jug_tech','Jugement technique'],['delai_option','Délai option'],['marche','N° marché'],['obs','Observation']]},
      exec: {title:'Dossier en réalisation', fields:[['num','N°'],['marche','N° marché'],['designation','Désignation'],['estimation','Estimation','number'],['date_notif','Date notification','date'],['caution_def','Caution définitive'],['date_odl','Date ODL','date'],['date_ods','Date ODS','date'],['delai_exec','Délai d’exécution'],['etat','État (non réalisée, en cours, en attente, terminée)'],['date_achevement','Date d’achèvement','date'],['pvrpp','PVRPP'],['pvrpg','PVRPG'],['pvrdg','PVRDG'],['delai_gar','Délai de garantie'],['obs','Observation']]}
    };
    const conf = map[kind];
    const data = read(kind);
    const item = id? data.find(x=>x.id===id) : null;
    state.currentItemKey = kind; state.currentItemId = id;

    let html = `<form id="dynForm">`;
    conf.fields.forEach(([k,label,type])=>{
      const v = item? (item[k]??'') : '';
      if(type==='checkbox'){
        html += `<div class="mb-2 form-check"><input class="form-check-input" type="checkbox" id="${k}" ${v?'checked':''}><label class="form-check-label" for="${k}">${label}</label></div>`;
      }else{
        html += `<div class="mb-2"><label class="form-label">${label}</label><input class="form-control" id="${k}" value="${type==='date'? (v? new Date(v).toISOString().slice(0,10):'') : (escapeAttr(v))}" ${type?`type="${type}"`:''}></div>`;
      }
    });
    html += `</form><div class="d-flex justify-content-end gap-2">
      ${id? `<button class="btn btn-outline-danger" onclick="UI.remove('${kind}','${id}')">Supprimer</button>`:''}
      <button class="btn btn-primary" onclick="UI.saveForm()">Enregistrer</button></div>`;

    showDetail(`${conf.title} — ${id? 'Modifier':'Ajouter'}`, html, false);
  },

  saveForm(){
    const key = state.currentItemKey; const id = state.currentItemId;
    const data = read(key);
    const form = document.getElementById('dynForm');
    const obj = {}; [...form.querySelectorAll('input')].forEach(inp=>{
      const k = inp.id; let v = inp.type==='checkbox'? inp.checked : inp.value;
      if(inp.type==='number') v = parseFloat(v||'0');
      if(inp.type==='date') v = v? new Date(v).toISOString() : '';
      obj[k] = v;
    });
    if(id){
      const i = data.findIndex(x=>x.id===id); if(i>=0) data[i] = {...data[i], ...obj};
    }else{
      data.push({id:uid(), ...obj});
    }
    write(key, data);
    bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide();
  },

  remove(kind, id){
    if(!isAdmin()) return;
    if(!confirm('Supprimer cet élément ?')) return;
    write(kind, read(kind).filter(x=>x.id!==id));
    const modal = bootstrap.Modal.getInstance(document.getElementById('detailModal')); if(modal) modal.hide();
  },

  openDetail(kind, id){
    const data = read(kind); const item = data.find(x=>x.id===id); if(!item) return;
    state.currentItemKey = kind; state.currentItemId = id;
    let html = `<div class="row row-cols-1 row-cols-md-3 g-2">`;
    Object.entries(item).forEach(([k,v])=>{
      if(k==='id') return;
      html += `<div><div class="text-muted small">${k}</div><div class="fw-semibold">${typeof v==='number'? fmtMoney(v) : (k.startsWith('date')? fmtDate(v) : escapeHTML(String(v)))}</div></div>`;
    });
    html += `</div>`;
    showDetail(`Fiche — ${kind.toUpperCase()} — ${item.designation||item.numero||item.num||item.marche||''}`, html, true);
    UI.renderPJ();
  },

  renderPJ(){
    const key = `${state.currentItemKey}:${state.currentItemId}`;
    const list = JSON.parse(localStorage.getItem(STORAGE.pj)||'{}')[key] || [];
    const box = document.getElementById('pjList'); box.innerHTML='';
    list.forEach((f,ix)=>{
      const a = document.createElement('a'); a.className='list-group-item list-group-item-action d-flex justify-content-between align-items-center';
      a.href = f.url; a.download = f.name; a.textContent = f.name;
      const btn = document.createElement('button'); btn.className='btn btn-sm btn-outline-danger'; btn.textContent='Supprimer';
      btn.onclick = ()=>{ UI.removePJ(ix); };
      const wrap = document.createElement('div'); wrap.className='d-flex w-100 justify-content-between align-items-center';
      const span = document.createElement('span'); span.textContent=f.name;
      wrap.append(span); wrap.append(btn); a.textContent=''; a.append(wrap);
      box.appendChild(a);
    });
  },

  addPJ(){
    const file = document.getElementById('pjInput').files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const key = `${state.currentItemKey}:${state.currentItemId}`;
      const store = JSON.parse(localStorage.getItem(STORAGE.pj)||'{}');
      store[key] = store[key] || [];
      store[key].push({name:file.name, url:reader.result});
      localStorage.setItem(STORAGE.pj, JSON.stringify(store));
      UI.renderPJ();
      document.getElementById('pjInput').value='';
    };
    reader.readAsDataURL(file);
  },

  removePJ(idx){
    const key = `${state.currentItemKey}:${state.currentItemId}`;
    const store = JSON.parse(localStorage.getItem(STORAGE.pj)||'{}');
    if(!Array.isArray(store[key])) return;
    store[key].splice(idx,1);
    localStorage.setItem(STORAGE.pj, JSON.stringify(store));
    UI.renderPJ();
  },

  linkToDossiers(num){
    // When clicking an OT/DI number, move to "Dossiers en lancement" tab and filter by presence in 'marche' or text fields
    const t = new bootstrap.Tab(document.querySelector('button[data-bs-target="#tabLaunch"]')); t.show();
    alert("Astuce : utilisez la recherche du navigateur (Ctrl+F) pour repérer les lignes liées à : " + num);
  },

  linkToBudget(marche){
    // Move to OT/OI tabs; here we just notify for demo
    alert("Aller au budget lié : " + marche);
  }
};

function showDetail(title, html, showPJ){
  document.getElementById('detailTitle').textContent = title;
  document.getElementById('detailContent').innerHTML = html;
  document.getElementById('pjInput').disabled = !showPJ;
  document.getElementById('pjList').classList.toggle('d-none', !showPJ);
  const m = new bootstrap.Modal('#detailModal'); m.show();
}

// ===== Export / Import JSON =====
/*const App = {
  exportJSON(kind){
    const blob = new Blob([JSON.stringify(read(kind), null, 2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${kind}.json`; a.click(); URL.revokeObjectURL(a.href);
  },
  importJSON(e, kind){
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader(); reader.onload = () => {
      try{ const arr = JSON.parse(reader.result); if(Array.isArray(arr)) write(kind, arr); }catch(err){ alert('Fichier invalide'); }
    }; reader.readAsText(file);
  }
};*/

// Helpers
function escapeHTML(s){ return (s||'').replace(/[&<>\"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function escapeAttr(s){ return String(s||'').replace(/"/g,'&quot;'); }

// ====== Export / Import EXCEL ======
const SCHEMAS = {
  ot: [
    ['numero','N° OT'], ['action','N° action'], ['designation','Désignation'],
    ['estimation','Estimation'], ['anX','Année X'], ['anX1','Année X+1'], ['anX2','Année X+2'],
    ['base','Base d’estimation'], ['commande','N° commande']
  ],
  oi: [
    ['numero','N° DI'], ['action','N° action'], ['designation','Désignation'],
    ['estimation','Estimation'], ['anX','Année X'], ['anX1','Année X+1'], ['anX2','Année X+2'],
    ['base','Base d’estimation'], ['commande','N° commande']
  ],
  launch: [
    ['num','N°'], ['designation','Désignation'], ['estimation','Estimation'],
    ['da','N° DA'], ['ao','N° AO'], ['date_lancement','Date de lancement'],
    ['pme','PME'], ['caution_prov','Caution provisoire'], ['date_ouverture','Date ouverture'],
    ['jug_adm','Jugement administratif'], ['jug_fin','Jugement financier'], ['jug_tech','Jugement technique'],
    ['delai_option','Délai option'], ['marche','N° marché'], ['obs','Observation']
  ],
  exec: [
    ['num','#'], ['marche','N° marché'], ['designation','Désignation'], ['estimation','Estimation'],
    ['date_notif','Date notification'], ['caution_def','Caution définitive'],
    ['date_odl','Date ODL'], ['date_ods','Date ODS'], ['delai_exec','Délai exéc.'],
    ['etat','État'], ['date_achevement','Date achèvement'],
    ['pvrpp','PVRPP'], ['pvrpg','PVRPG'], ['pvrdg','PVRDG'],
    ['delai_gar','Délai garantie'], ['obs','Observation']
  ]
};

// Conversion helpers
function toSheetRows(kind, arr){
  const schema = SCHEMAS[kind];
  return arr.map(o=>{
    const row = {};
    schema.forEach(([k, hdr])=>{
      let v = o[k];
      if(String(k).startsWith('date') && v) v = new Date(v).toISOString().slice(0,10);
      if(typeof v === 'boolean') v = v ? 'Oui' : 'Non';
      row[hdr] = v ?? '';
    });
    return row;
  });
}
function fromSheetRows(kind, rows){
  const schema = SCHEMAS[kind];
  const hdr2key = Object.fromEntries(schema.map(([k,h])=>[h,k]));
  return rows.map(r=>{
    const obj = { id: uid() };
    Object.keys(r).forEach(h=>{
      const key = hdr2key[h]; if(!key) return;
      let v = r[h];
      // re-typage
      if(String(key).startsWith('date') && v){
        // accepter formats JJ/MM/AAAA ou ISO
        const parts = String(v).split(/[\/\-]/);
        if(parts.length>=3){
          const [a,b,c] = parts;
          // heuristique JJ/MM/AAAA
          const iso = (a.length===2 && b.length===2) ? `${c}-${b}-${a}` : `${a}-${b}-${c}`;
          v = new Date(iso).toISOString();
        } else {
          v = new Date(v).toISOString();
        }
      } else if(['estimation','anX','anX1','anX2'].includes(key)) {
        v = parseFloat(String(v).replace(/\s/g,'').replace(',', '.')) || 0;
      } else if(key==='pme'){
        v = String(v).trim().toLowerCase().startsWith('o'); // Oui/Non
      }
      obj[key] = v;
    });
    return obj;
  });
}

const App = {
  exportExcel(kind){
    const data = read(kind);
    const rows = toSheetRows(kind, data);
    const ws = XLSX.utils.json_to_sheet(rows, {header: SCHEMAS[kind].map(x=>x[1])});
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, kind.toUpperCase());
    XLSX.writeFile(wb, `${kind}.xlsx`);
  },
  importExcel(e, kind){
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const wb = XLSX.read(reader.result, {type:'binary'});
      const first = wb.SheetNames[0];
      const ws = wb.Sheets[first];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''}); // tableau d’objets par ligne
      if(!rows.length){ alert('Fichier Excel vide.'); return; }
      const arr = fromSheetRows(kind, rows);
      write(kind, arr);
      e.target.value = '';
    };
    reader.readAsBinaryString(file);
  },

  importExcelFile(kind, file){
    return new Promise((resolve, reject)=>{
      if(!file) return reject(new Error('No file'));
      const reader = new FileReader();
      reader.onload = () => {
        try{
          const wb = XLSX.read(reader.result, {type:'binary'});
          const first = wb.SheetNames[0];
          const ws = wb.Sheets[first];
          const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
          if(!rows.length){ alert('Fichier Excel vide.'); return reject(new Error('Fichier Excel vide')); }
          const arr = fromSheetRows(kind, rows);
          write(kind, arr);
          resolve();
        }catch(err){ reject(err); }
      };
      reader.onerror = (err)=> reject(err);
      reader.readAsBinaryString(file);
    });
  },

  // (je laisse l’export/import JSON pour compat rétro si tu en as besoin)
  exportJSON(kind){
    const blob = new Blob([JSON.stringify(read(kind), null, 2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${kind}.json`; a.click(); URL.revokeObjectURL(a.href);
  },
  importJSON(e, kind){
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader(); reader.onload = () => {
      try{ const arr = JSON.parse(reader.result); if(Array.isArray(arr)) write(kind, arr); }catch(err){ alert('Fichier invalide'); }
    }; reader.readAsText(file);
  }
};

// Optional OT/OI drag & drop and file pick handlers (safe: only attach if elements exist)
{
  const pickOt = document.getElementById('pickDir-ot');
  const fileInputOt = document.getElementById('fileInput-ot');
  if(fileInputOt){
    fileInputOt.addEventListener('change', e=>{
      const f = e.target.files?.[0];
      if(f){
        App.importExcelFile('ot', f).then(()=>{
          const s=document.getElementById('status-ot'); if(s) s.textContent=`Chargé: ${f.name}`;
          const b=document.getElementById('btnSave-ot'); if(b) b.disabled=false;
        }).catch(err=>{ const s=document.getElementById('status-ot'); if(s) s.textContent='Erreur: '+err.message; });
      }
    });
  }
  const dropOt = document.getElementById('dropArea-ot');
  if(dropOt){
    ['dragenter','dragover'].forEach(ev=>dropOt.addEventListener(ev,e=>{e.preventDefault(); dropOt.classList.add('border-primary');}));
    ['dragleave','drop'].forEach(ev=>dropOt.addEventListener(ev,e=>{e.preventDefault(); dropOt.classList.remove('border-primary');}));
    dropOt.addEventListener('drop', e=>{ const f = e.dataTransfer.files?.[0]; if(f) App.importExcelFile('ot', f).then(()=>{ const s=document.getElementById('status-ot'); if(s) s.textContent=`Chargé: ${f.name}`; const b=document.getElementById('btnSave-ot'); if(b) b.disabled=false; }).catch(err=>{ const s=document.getElementById('status-ot'); if(s) s.textContent='Erreur: '+err.message; }); });
  }
  if(pickOt) pickOt.addEventListener('click', ()=> fileInputOt?.click());

  const pickOi = document.getElementById('pickDir-oi');
  const fileInputOi = document.getElementById('fileInput-oi');
  if(fileInputOi){
    fileInputOi.addEventListener('change', e=>{ const f = e.target.files?.[0]; if(f) { App.importExcelFile('oi', f).then(()=>{ const s=document.getElementById('status-oi'); if(s) s.textContent=`Chargé: ${f.name}`; const b=document.getElementById('btnSave-oi'); if(b) b.disabled=false; }).catch(err=>{ const s=document.getElementById('status-oi'); if(s) s.textContent='Erreur: '+err.message; }); } });
  }
  const dropOi = document.getElementById('dropArea-oi');
  if(dropOi){
    ['dragenter','dragover'].forEach(ev=>dropOi.addEventListener(ev,e=>{e.preventDefault(); dropOi.classList.add('border-primary');}));
    ['dragleave','drop'].forEach(ev=>dropOi.addEventListener(ev,e=>{e.preventDefault(); dropOi.classList.remove('border-primary');}));
    dropOi.addEventListener('drop', e=>{ const f = e.dataTransfer.files?.[0]; if(f) App.importExcelFile('oi', f).then(()=>{ const s=document.getElementById('status-oi'); if(s) s.textContent=`Chargé: ${f.name}`; const b=document.getElementById('btnSave-oi'); if(b) b.disabled=false; }).catch(err=>{ const s=document.getElementById('status-oi'); if(s) s.textContent='Erreur: '+err.message; }); });
  }
  if(pickOi) pickOi.addEventListener('click', ()=> fileInputOi?.click());
}


// When default OT file loads via fetch, try to render as Fascicule if format matches
;(function(){
  const _origParse = (window.App && App.parseExcelTo2D) ? App.parseExcelTo2D : null;
  // If excel.js exposes a workbook parser, we rely on excel.js; otherwise we attach after fetch responses.
  document.addEventListener("ot-excel-loaded-2d", (e)=>{
    tryRenderOTBudgetFromSheet(e.detail);
  });
})();


// Hook OI: dispatch custom event 'oi-excel-loaded-2d' with 2D array to render OI table
document.addEventListener("oi-excel-loaded-2d", (e)=>{
  tryRenderOIBudgetFromSheet(e.detail);
});


// ==================== AUTH (Client-side, zero-serveur) ====================
window.App = window.App || {};
App.Auth = (function(){
  const SESS_KEY = "app.session.v1";
  const LOCK_KEY = "app.lockout.v1";
  const MAX_ATTEMPTS = 5;
  const LOCK_SECONDS = 60; // lock for 60s after too many failed attempts

  // Predefined users (username + SHA-256 of password)
  const users = [
    { username: "admin",  passHash: "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9" }, // "admin123"
    { username: "user",   passHash: "e606e38b0d8c19b24cf0ee3808183162ea7cd63ff7912dbb22b5e803286b4446" }, // "user123"
    { username: "viewer", passHash: "656d604dfdba41a262963cce53699bbc56cd7a2c0da1ad5ead45fc49214159d6" }  // "view123"
  ];

  let lockTimerId = null;
  let submitHandler = null;

  async function sha256Hex(text){
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    const arr = Array.from(new Uint8Array(buf));
    return arr.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function now(){ return Math.floor(Date.now()/1000); }

  function getLock(){
    try{ return JSON.parse(localStorage.getItem(LOCK_KEY)||"null") || { attempts:0, until:0 }; }catch{ return {attempts:0, until:0}; }
  }
  function setLock(obj){ localStorage.setItem(LOCK_KEY, JSON.stringify(obj)); }
  function clearLock(){ setLock({attempts:0, until:0}); }

  function lockedMsg(sec){
    const s = Math.max(0, sec);
    return "Trop d'essais. Veuillez réessayer dans " + s + "s.";
  }

  function buildUserObject(uname){
    const meta = Array.isArray(USER_PROFILES) ? USER_PROFILES.find(u=>u.username===uname) : null;
    return { username: uname, display: meta?.display || uname, role: meta?.role || 'viewer' };
  }

  function persistSession(uname){
    const userObj = buildUserObject(uname);
    try{
      if(typeof saveSession === 'function'){
        return saveSession(userObj);
      }
    }catch(e){ console.warn('saveSession failed', e); }
    const fallback = { ...userObj, expiresAt: Date.now() + SESSION_TTL_MS };
    try{ localStorage.setItem('as_session', JSON.stringify(fallback)); }
    catch(e){ localStorage.setItem('as_session', JSON.stringify(fallback)); }
    sessionExpiredFlag = false;
    scheduleSessionTimeout(fallback.expiresAt);
    const { expiresAt, ...rest } = fallback;
    return rest;
  }

  function showAlert(msg){
    const el = document.getElementById("authAlert");
    if(!el) return;
    el.textContent = msg;
    el.classList.remove("d-none");
  }
  function hideAlert(){
    const el = document.getElementById("authAlert");
    if(!el) return;
    el.classList.add("d-none");
    el.textContent = "";
  }

  // App.Auth will use the application's global session helpers (saveSession/getSession/clearSession)

  async function validate(username, password){
    const u = users.find(x=>x.username===username);
    if(!u) return false;
    const h = await sha256Hex(password);
    return h === u.passHash;
  }

  function guard(){
    const sess = getSession();
    if(!sess){
      updateUserMenu(null);
      resetAppView();
      try{ initLogin(); }catch(e){ console.warn(e); }
      return;
    }
    updateUserMenu(sess);
    applyRolePermissions(sess);
    if(!appReady){
      initApp().catch(err=>console.error('initApp error', err));
    }
  }

  function initLogin(){
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', initLogin, {once:true});
      return;
    }

    const sess = getSession();
    if(sess){
      updateUserMenu(sess);
      applyRolePermissions(sess);
      if(!appReady){
        initApp().catch(err=>console.error('initApp error', err));
      } else {
        const mainNav = document.getElementById('mainNav');
        const appSection = document.getElementById('app');
        const loginScreen = document.getElementById('loginScreen');
        if(mainNav) mainNav.classList.remove('d-none');
        if(appSection){
          appSection.classList.remove('d-none');
          appSection.classList.add('app-visible');
        }
        if(loginScreen){
          loginScreen.classList.add('screen-hidden');
          setTimeout(()=> loginScreen.classList.add('d-none'), 450);
        }
      }
      return;
    }

    resetAppView();
    updateUserMenu(null);
    const expired = consumeSessionExpiryNotice();
    if(expired){
      showAlert('Votre session a expiré. Veuillez vous reconnecter.');
    }else{
      hideAlert();
    }

    const form = document.getElementById('loginForm');
    const user = document.getElementById('username');
    const pass = document.getElementById('password');
    const btn  = document.getElementById('btnLogin');
    const chk  = document.getElementById('rememberMe');
    const toggle = document.getElementById('togglePwd');
    const lockHint = document.getElementById('lockHint');

    if(form) form.classList.remove('was-validated');
    if(btn){
      btn.disabled = false;
      btn.textContent = 'Se connecter';
    }

    const remember = localStorage.getItem('as_remember') === '1';
    if(chk) chk.checked = remember;
    if(remember && user){ user.value = localStorage.getItem('as_last_user') || ''; }

    try{
      user?.focus();
      user?.select?.();
    }catch(e){
      setTimeout(()=>{ try{ user?.focus(); user?.select?.(); }catch(_){} }, 200);
    }

    if(toggle && !toggle.dataset.bound){
      toggle.dataset.bound = '1';
      toggle.addEventListener('click', ()=>{
        if(!pass) return;
        const vis = pass.type === 'text';
        pass.type = vis ? 'password' : 'text';
        toggle.textContent = vis ? 'Afficher' : 'Masquer';
      });
    }

    if(lockTimerId){ clearInterval(lockTimerId); lockTimerId = null; }

    function updateLock(){
      const L = getLock();
      if(!btn) return false;
      if(L.until > now()){
        const rem = L.until - now();
        btn.disabled = true;
        if(lockHint) lockHint.textContent = lockedMsg(rem);
        return true;
      }
      btn.disabled = false;
      if(lockHint) lockHint.textContent = '';
      return false;
    }
    updateLock();
    lockTimerId = setInterval(updateLock, 1000);

    async function handleLoginSubmit(e){
      if(e && e.preventDefault) e.preventDefault();
      hideAlert();
      if(updateLock()) return;
      if(form) form.classList.add('was-validated');
      if(!user?.value?.trim?.() || !pass?.value?.trim?.()){
        showAlert("Veuillez renseigner l'utilisateur et le mot de passe.");
        return;
      }

      const username = user.value.trim();
      if(btn){ btn.disabled = true; btn.textContent = 'Vérification…'; }
      try{
        const ok = await validate(username, pass.value);
        if(!ok){
          const L = getLock();
          L.attempts = (L.attempts||0) + 1;
          if(L.attempts >= MAX_ATTEMPTS){
            L.until = now() + LOCK_SECONDS;
            L.attempts = 0;
            showAlert("Identifiants invalides. Votre accès est temporairement bloqué.");
          }else{
            showAlert(`Identifiants invalides. Tentative ${L.attempts} / ${MAX_ATTEMPTS}.`);
          }
          setLock(L);
          updateLock();
          return;
        }

        clearLock();
        const sessionUser = persistSession(username);
        if(chk){
          if(chk.checked){
            localStorage.setItem('as_remember', '1');
            localStorage.setItem('as_last_user', username);
          }else{
            localStorage.removeItem('as_remember');
            localStorage.removeItem('as_last_user');
          }
        }
        if(btn) btn.textContent = 'Chargement…';
        const result = await initApp();
        if(result?.errors?.length){
          console.warn('Certaines données n\'ont pas pu être chargées automatiquement.', result.errors);
        }
        if(lockTimerId){ clearInterval(lockTimerId); lockTimerId = null; }
        updateUserMenu(sessionUser);
      }catch(err){
        console.error('App.Auth: unexpected error', err);
        showAlert('Erreur inattendue. Réessayez.');
      }finally{
        if(btn){ btn.disabled = false; btn.textContent = 'Se connecter'; }
      }
    }

    if(form){
      if(submitHandler){ form.removeEventListener('submit', submitHandler); }
      submitHandler = handleLoginSubmit;
      form.addEventListener('submit', handleLoginSubmit);
    }else if(btn){
      if(submitHandler){ btn.removeEventListener('click', submitHandler); }
      submitHandler = handleLoginSubmit;
      btn.addEventListener('click', handleLoginSubmit);
    }
  }

  async function login(username, password, options={}){
    const ok = await validate(username, password);
    if(!ok) return { ok:false };
    clearLock();
    const userObj = persistSession(username);
    return { ok:true, user:userObj };
  }

  return { initLogin, guard, getSession, clearSession, login };
})();

// Run guard on non-login pages
document.addEventListener("DOMContentLoaded", ()=>{
  const onLogin = /\/login\.html(?:$|\?|#)/.test(window.location.pathname) || document.title.toLowerCase().includes("connexion");
  if(!onLogin && App.Auth && App.Auth.guard){
    App.Auth.guard();
  }
});
