/* Achat & Suivi — Front only (localStorage persistence) */
const USERS = [
  {username:'admin', password:'admin123', role:'admin', display:'Administrateur'},
  {username:'user',  password:'user123',  role:'user',  display:'Utilisateur'}
];
const STORAGE = {
  ot: 'as_ot', oi: 'as_oi', launch: 'as_launch', exec: 'as_exec', pj: 'as_pj'
};
const state = { currentItemKey: null, currentItemId: null };

// ===== UTIL =====
const fmtMoney = n => Intl.NumberFormat('fr-FR', {style:'currency', currency:'MAD', maximumFractionDigits:0}).format(+n||0);
const fmtDate = v => v ? new Date(v).toLocaleDateString() : '';
const fmtPercent = v => `${(v*100).toFixed(1).replace('.0','')}%`;
const uid = () => Math.random().toString(36).slice(2,10);
function getRole(){ const s = JSON.parse(localStorage.getItem('as_session')||'null'); return s?s.role:null; }
function isAdmin(){ return getRole()==='admin'; }
function read(key){ return JSON.parse(localStorage.getItem(STORAGE[key])||'[]'); }
function write(key, arr){ localStorage.setItem(STORAGE[key], JSON.stringify(arr)); renderAll(); }
function saveSession(user){ localStorage.setItem('as_session', JSON.stringify(user)); }
function getSession(){ return JSON.parse(localStorage.getItem('as_session')||'null'); }
function clearSession(){ localStorage.removeItem('as_session'); }

// The login flow is handled by App.Auth (see bottom of file).
// Avoid attaching a duplicate click handler that references non-existent IDs which would throw.
const _btnLogout = document.getElementById('btnLogout');
if(_btnLogout){
  _btnLogout.addEventListener('click', ()=>{ clearSession(); window.location.href = 'login.html'; });
}

function initApp(){
  const s = getSession(); if(!s){ return; }
  document.getElementById('loginCard').classList.add('d-none');
  document.getElementById('app').classList.remove('d-none');
  document.getElementById('btnLogout').classList.remove('d-none');
  const badge = document.getElementById('roleBadge'); badge.textContent = `${s.display} (${s.role})`; badge.classList.remove('d-none');
  renderAll();
}
// If the user opens index.html without a session, force them to the login page.
try{
  const loc = window.location.pathname || window.location.href;
  if(String(loc).toLowerCase().includes('index.html') && !getSession()){
    window.location.href = 'login.html';
  }
}catch(e){}

// If a session exists, initialize the app UI only when the expected app DOM is present (avoid running on login page)
if(getSession()){
  if(document.getElementById('app')){
    initApp();
  } else {
    console.debug('Session found but app DOM not present; skipping initApp');
  }
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
    tr.innerHTML = `<td><a href="#" onclick="UI.linkToDossiers('${r.numero}')">${r.numero||''}</a></td>`
      <td>${r.action||''}</td><td class="small">${escapeHTML(r.designation||'')}</td>
      <td>${fmtMoney(r.estimation)}</td><td>${fmtMoney(r.anX)}</td><td>${fmtMoney(r.anX1)}</td><td>${fmtMoney(r.anX2)}</td>
      <td>${escapeHTML(r.base||'')}</td><td>${escapeHTML(r.commande||'')}</td>
      <td class="text-nowrap">${isAdmin()? `<button class="btn btn-sm btn-outline-secondary me-1" onclick="UI.openForm('ot','${r.id}')">Modifier</button><button class="btn btn-sm btn-outline-danger" onclick="UI.remove('ot','${r.id}')">Supprimer</button>`:''}
        <button class="btn btn-sm btn-primary ms-1" onclick="UI.openDetail('ot','${r.id}')">Fiche</button></td>`;
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
    tr.innerHTML = `<td><a href="#" onclick="UI.linkToDossiers('${r.numero}')">${r.numero||''}</a></td>`
      <td>${r.action||''}</td><td class="small">${escapeHTML(r.designation||'')}</td>
      <td>${fmtMoney(r.estimation)}</td><td>${fmtMoney(r.anX)}</td><td>${fmtMoney(r.anX1)}</td><td>${fmtMoney(r.anX2)}</td>
      <td>${escapeHTML(r.base||'')}</td><td>${escapeHTML(r.commande||'')}</td>
      <td class="text-nowrap">${isAdmin()? `<button class="btn btn-sm btn-outline-secondary me-1" onclick="UI.openForm('oi','${r.id}')">Modifier</button><button class="btn btn-sm btn-outline-danger" onclick="UI.remove('oi','${r.id}')">Supprimer</button>`:''}
        <button class="btn btn-sm btn-primary ms-1" onclick="UI.openDetail('oi','${r.id}')">Fiche</button></td>`;
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
    const key = `${state.currentItemKey}:{id}`;
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
    { username: "admin",  passHash: "e99a18c428cb38d5f260853678922e03abd8334a8a62c70ffb5d7a3a2a0b6f16" }, // "admin123"
    { username: "viewer", passHash: "b0f1d1e6bb338f0e92bf3b1de9cf3a8c0b37b7f9e3d6d8a28b9a8a1b9a6a9d12" }  // "view123" (fake hash placeholder, see note below)
  ];

  // NOTE: Replace viewer hash with real hash of "view123". We'll compute below if crypto.subtle is available.
  async function sha256Hex(text){
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    const arr = Array.from(new Uint8Array(buf));
    return arr.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  // Compute and fix the viewer hash at runtime to avoid hardcoding mistakes
  (async ()=>{
    try {
      const h = await sha256Hex("view123");
      const v = users.find(u=>u.username==="viewer");
      if(v) v.passHash = h;
    }catch(e){ /* ignore */ }
  })();

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
    // Explicit demo override: accept admin / admin123
    if(username === 'admin' && password === 'admin123'){
      return true;
    }
    // If a global USERS list with plaintext passwords exists, prefer direct comparison
    try{
      if(typeof USERS !== 'undefined' && Array.isArray(USERS)){
        const pu = USERS.find(x=>x.username===username);
        if(pu && typeof pu.password === 'string'){
          return pu.password === password;
        }
      }
    }catch(e){ /* ignore and fallback to hashed list */ }
    const u = users.find(x=>x.username===username);
    if(!u) return false;
    const h = await sha256Hex(password);
    return h === u.passHash;
  }

  function guard(){
    // Called on every page except login; if no session -> redirect
    const sess = getSession();
    if(!sess){
      window.location.href = "login.html";
      return;
    }
    // Fill user menu if present
    const el = document.getElementById("userMenuName");
    if(el) el.textContent = sess.username;
    const btnOut = document.getElementById("btnLogout");
    if(btnOut){
      btnOut.addEventListener("click", (ev)=>{
        ev.preventDefault();
        clearSession();
        window.location.href = "login.html";
      }, {once:true});
    }
  }

  function initLogin(){
    // If session already exists -> go to index
    const sess = getSession();
    if(sess){ window.location.href = "index.html"; return; }

    const form = document.getElementById("loginForm");
    const user = document.getElementById("username");
    const pass = document.getElementById("password");
    const btn  = document.getElementById("btnLogin");
    const chk  = document.getElementById("rememberMe");
    const toggle = document.getElementById("togglePwd");
    const lockHint = document.getElementById("lockHint");

  // Debug: ensure elements are found
      function devLog(){
        try{
          const el = document.getElementById('devLog'); if(!el) return;
          el.style.display = 'block';
          const args = Array.from(arguments).map(a=>{
            try{ return (typeof a === 'string') ? a : JSON.stringify(a); }catch(e){ return String(a); }
          }).join(' ');
          el.textContent += args + '\n';
          el.scrollTop = el.scrollHeight;
        }catch(e){}
      }
      try{ console.debug('App.Auth.initLogin called', { formExists: !!form, userExists: !!user, passExists: !!pass, btnExists: !!btn, chkExists: !!chk }); devLog('App.Auth.initLogin called', { formExists: !!form, userExists: !!user, passExists: !!pass, btnExists: !!btn, chkExists: !!chk }); }catch(e){}

    // Toggle password visibility
    toggle?.addEventListener("click", ()=>{
      const vis = pass.type === "text";
      pass.type = vis ? "password" : "text";
      toggle.textContent = vis ? "Afficher" : "Masquer";
    });

    // Lockout check
    function updateLock(){
      const L = getLock();
      if(L.until > now()){
        const rem = L.until - now();
        btn.disabled = true;
        lockHint.textContent = lockedMsg(rem);
        return true;
      } else {
        btn.disabled = false;
        lockHint.textContent = "";
        return false;
      }
    }
    updateLock();
    const tm = setInterval(updateLock, 1000);

    // Client-side validation
    form.addEventListener("submit", async (e)=>{
      e.preventDefault();
  try{ console.debug('App.Auth.submit handler invoked', { username: user?.value?.trim?.() || '', passLen: user? (pass.value.length) : 0 }); devLog('submit invoked', { username: user?.value?.trim?.() || '', passLen: user? (pass.value.length) : 0 }); }catch(e){}
      hideAlert();
      if(updateLock()) return;

      form.classList.add("was-validated");
      if(!user.value.trim() || !pass.value.trim()){
        showAlert("Veuillez renseigner l'utilisateur et le mot de passe.");
        return;
      }

      btn.disabled = true; btn.textContent = "Vérification…";
      try{
  console.debug('App.Auth: validating user', { username: user.value.trim() }); devLog('validating', { username: user.value.trim() });
        const ok = await validate(user.value.trim(), pass.value);
  console.debug('App.Auth: validate result', { ok }); devLog('validate result', { ok });
        if(ok){
          clearLock();
          // Build user object from global USERS metadata when available
          const uname = user.value.trim();
          const meta = (typeof USERS !== 'undefined' && Array.isArray(USERS)) ? USERS.find(u=>u.username===uname) : null;
          const userObj = { username: uname, display: meta?.display || uname, role: meta?.role || 'viewer' };
          try{ if(globalThis.saveSession) { globalThis.saveSession(userObj); } else { localStorage.setItem('as_session', JSON.stringify(userObj)); } }catch(e){ localStorage.setItem('as_session', JSON.stringify(userObj)); }
          console.debug('App.Auth: login success, redirecting'); devLog('login success, redirecting');
          window.location.href = "index.html";
        } else {
          console.debug('App.Auth: login failed'); devLog('login failed');
          const L = getLock();
          L.attempts = (L.attempts||0) + 1;
          if(L.attempts >= MAX_ATTEMPTS){
            L.until = now() + LOCK_SECONDS;
            L.attempts = 0;
            showAlert("Identifiants invalides. Votre accès est temporairement bloqué.");
          }else{
            showAlert("Identifiants invalides. Tentative " + L.attempts + " / " + MAX_ATTEMPTS + ".");
          }
          setLock(L);
          updateLock();
        }
      }catch(err){
        console.error('App.Auth: unexpected error', err);
        showAlert("Erreur inattendue. Réessayez.");
      }finally{
        btn.disabled = false; btn.textContent = "Se connecter";
      }
    }, {once:false});
  }

  return { initLogin, guard, getSession, clearSession };
})();

// Run guard on non-login pages
document.addEventListener("DOMContentLoaded", ()=>{
  const onLogin = /\/login\.html(?:$|\?|#)/.test(window.location.pathname) || document.title.toLowerCase().includes("connexion");
  if(!onLogin && App.Auth && App.Auth.guard){
    App.Auth.guard();
  }
});
