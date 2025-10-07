// ====== Page 2 : Données locales persistantes (sans serveur) ======
// Session guard handled in main app; no redirect here to keep embedded login flow.
try{
  const s = JSON.parse(localStorage.getItem('as_session')||'null');
  if(!s){
    document.addEventListener('DOMContentLoaded', ()=>{
      try{ if(globalThis.App && App.Auth && typeof App.Auth.initLogin === 'function'){ App.Auth.initLogin(); } }catch(err){ console.warn(err); }
    }, {once:true});
  }
}catch(e){}

let fileHandle = null; // PPA handle
const fileHandles = { ot: null, oi: null };
const ORDER = ["Ref PPA","Objet","Catégorie","Pilote","N° Action","Date limite","N° OT","Contractant","Année"];
const DB_NAME = 'achat-suivi-db', STORE = 'fs-handles',
  KEY_FILE='donnees-file', KEY_DIR='data-dir',
  KEY_FILE_OT='donnees-file-ot', KEY_DIR_OT='data-dir-ot',
  KEY_FILE_OI='donnees-file-oi', KEY_DIR_OI='data-dir-oi';

const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
const statusEl = document.getElementById('status');
const dropArea = document.getElementById('dropArea');
function setStatus(m){ if(statusEl) statusEl.textContent = m; }

// IndexedDB helpers
function openDB(){ return new Promise((res,rej)=>{ const x=indexedDB.open(DB_NAME,1); x.onupgradeneeded=()=>{ const db=x.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); }; x.onsuccess=()=>res(x.result); x.onerror=()=>rej(x.error); });}
async function idbGet(k){ const db=await openDB(); return new Promise((res,rej)=>{ const t=db.transaction(STORE,'readonly'); const s=t.objectStore(STORE); const r=s.get(k); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });}
async function idbSet(k,v){ const db=await openDB(); return new Promise((res,rej)=>{ const t=db.transaction(STORE,'readwrite'); const s=t.objectStore(STORE); const r=s.put(v,k); r.onsuccess=()=>res(true); r.onerror=()=>rej(r.error); });}
async function idbDel(k){ const db=await openDB(); return new Promise((res,rej)=>{ const t=db.transaction(STORE,'readwrite'); const s=t.objectStore(STORE); const r=s.delete(k); r.onsuccess=()=>res(true); r.onerror=()=>rej(r.error); });}

async function verifyPermission(handle, write=false){
  if(!handle) return false;
  const opts={mode:write?'readwrite':'read'};
  if((await handle.queryPermission(opts))==='granted') return true;
  if((await handle.requestPermission(opts))==='granted') return true;
  return false;
}

// startup
window.addEventListener('DOMContentLoaded', async ()=>{
  await navigator.storage?.persist?.();
  bindUI();
  tryAutoRestore();
  // set PPA year label
  try{ const ppaYearEl = document.getElementById('ppaYear'); if(ppaYearEl) ppaYearEl.textContent = new Date().getFullYear(); }catch(e){}
  // attempt to fetch default donnees.xlsx from site root if nothing restored
  try{
    const savedFile = await idbGet(KEY_FILE);
    const savedDir = await idbGet(KEY_DIR);
    if(!savedFile && !savedDir){
      // try fetching /donnees.xlsx
      const resp = await fetch('Data/donnees.xlsx');
      if(resp.ok){
        const buf = await resp.arrayBuffer();
        const f = new File([buf], 'donnees.xlsx');
        showLoader();
        try{
          await loadFromFile(f);
          document.getElementById('accessCard')?.classList.add('d-none');
        }finally{
          hideLoader();
        }
      }
    }
    // Try loading default OT/OI files into their local stores if empty
    try{
      const otData = JSON.parse(localStorage.getItem('as_ot')||'[]');
      if(Array.isArray(otData) && otData.length===0){
        try{
          console.debug('Attempting to fetch Data/donnees_ot.xlsx');
          const respOt = await fetch('Data/donnees_ot.xlsx');
          if(respOt.ok){
            const buf = await respOt.arrayBuffer(); const f = new File([buf],'donnees_ot.xlsx');
            showLoader();
            try{
              await App.importExcelFile('ot', f);
            }finally{
              hideLoader();
            }
            const s=document.getElementById('status-ot'); if(s) s.textContent = 'Chargé depuis donnees_ot.xlsx';
            console.debug('donnees_ot.xlsx imported into OT');
          } else {
            window._defaultsFetchFailed = true;
            const s=document.getElementById('status-ot'); if(s) s.textContent = 'donnees_ot.xlsx introuvable (HTTP ' + respOt.status + ')';
          }
        }catch(e){ console.error('Failed to fetch/import donnees_ot.xlsx:', e); const s=document.getElementById('status-ot'); if(s) s.textContent = 'Erreur chargement donnees_ot.xlsx: '+(e.message||e); }
      }
    }catch(e){ console.warn('Error while checking as_ot:', e); }
    try{
      const oiData = JSON.parse(localStorage.getItem('as_oi')||'[]');
      if(Array.isArray(oiData) && oiData.length===0){
        try{
          console.debug('Attempting to fetch Data/donnees_oi.xlsx');
          const respOi = await fetch('Data/donnees_oi.xlsx');
          if(respOi.ok){
            const buf = await respOi.arrayBuffer(); const f = new File([buf],'donnees_oi.xlsx');
            showLoader();
            try{
              await App.importExcelFile('oi', f);
            }finally{
              hideLoader();
            }
            const s=document.getElementById('status-oi'); if(s) s.textContent = 'Chargé depuis donnees_oi.xlsx';
            console.debug('donnees_oi.xlsx imported into OI');
          } else {
            window._defaultsFetchFailed = true;
            const s=document.getElementById('status-oi'); if(s) s.textContent = 'donnees_oi.xlsx introuvable (HTTP ' + respOi.status + ')';
          }
        }catch(e){ console.error('Failed to fetch/import donnees_oi.xlsx:', e); const s=document.getElementById('status-oi'); if(s) s.textContent = 'Erreur chargement donnees_oi.xlsx: '+(e.message||e); }
      }
    }catch(e){ console.warn('Error while checking as_oi:', e); }
  }catch(e){}
});

// --- Server-free fallback UI handlers ---
// Show UI when we detect file:// origin or fetch to Data/ will fail
function isFileProtocol(){ try{ return location.protocol === 'file:'; }catch(e){ return false; } }

document.addEventListener('DOMContentLoaded', ()=>{
    try{
    if(isFileProtocol() || window._defaultsFetchFailed){
      const box = document.getElementById('localFileFallback'); if(box) box.style.display = 'block';
      const btn = document.getElementById('btnLoadDefaultFiles');
      const sampleBtn = document.getElementById('btnUseSampleData');
      const inp = document.getElementById('defaultFilesInput');
      const status = document.getElementById('localFallbackStatus');
      if(btn && inp){
        btn.addEventListener('click', ()=> inp.click());
        inp.addEventListener('change', async (e)=>{
          const files = Array.from(e.target.files||[]);
          console.debug('default files selected', files.map(f=>f.name));
          if(!files.length){ if(status) status.textContent='Aucun fichier sélectionné.'; return; }
          // Expecting up to three files; try to recognize by name
          for(const f of files){
            const name = (f.name||'').toLowerCase();
            showLoader();
            try{
              if(name.includes('donnees_ot')){ await App.importExcelFile('ot', f); const s=document.getElementById('status-ot'); if(s) s.textContent = `Chargé: ${f.name}`; }
              else if(name.includes('donnees_oi')){ await App.importExcelFile('oi', f); const s=document.getElementById('status-oi'); if(s) s.textContent = `Chargé: ${f.name}`; }
              else if(name.includes('donnees') && !name.includes('ot') && !name.includes('oi')){ await loadFromFile(f); }
              else { // try to import by asking user via prompt
                const kind = prompt(`Type pour ${f.name} (ot/oi/ppa)`, 'ot');
                if(kind==='ot' || kind==='oi'){ await App.importExcelFile(kind, f); }
                else if(kind==='ppa'){ await loadFromFile(f); }
              }
              if(status) status.textContent = `Chargé: ${f.name}`;
            }catch(err){ console.error('Import error', err); if(status) status.textContent = 'Erreur: '+(err.message||err); }finally{ hideLoader(); }
          }
          if(status) status.textContent = 'Import terminé.';
        });
      }
      // Also provide a direct fetch-based "Load defaults" as a fallback when file picker is confusing
      if(btn){
        btn.addEventListener('auxclick', (e)=>{}); // noop to ensure multiple listeners okay
      }
      const directLoadBtn = document.getElementById('btnLoadDefaultFiles');
      if(directLoadBtn){
        directLoadBtn.addEventListener('click', async (e)=>{
          // If input already handled click -> bail
          try{
            if(!isFileProtocol()){
              if(status) status.textContent = 'Tentative de chargement depuis Data/ (HTTP)…';
              const toLoad = [ ['donnees.xlsx','ppa'], ['donnees_ot.xlsx','ot'], ['donnees_oi.xlsx','oi'] ];
              for(const [name, kind] of toLoad){
                try{
                  const resp = await fetch('Data/'+name);
                  if(!resp.ok){
                    if(status) status.textContent = `${name} introuvable (HTTP ${resp.status}).`; window._defaultsFetchFailed = true; continue;
                  }
                  const buf = await resp.arrayBuffer(); const f = new File([buf], name);
                  showLoader();
                  try{
                    if(kind==='ppa') await loadFromFile(f); else await App.importExcelFile(kind, f);
                  }finally{
                    hideLoader();
                  }
                  if(status){ status.textContent = `${name} chargé.`; }
                }catch(err){ console.error('Error loading default', name, err); if(status) status.textContent = `Erreur chargement ${name}: ${err.message||err}`; window._defaultsFetchFailed = true; }
              }
              if(status) status.textContent = 'Tentative de chargement terminée.';
            } else {
              if(status) status.textContent = 'Impossible de fetch depuis file:// – utilisez le bouton Choisir/Importer pour sélectionner les fichiers localement.';
            }
          }catch(err){ console.error(err); if(status) status.textContent = 'Erreur inattendue: '+(err.message||err); }
        }, {capture:false});
      }
      if(sampleBtn){ sampleBtn.addEventListener('click', ()=>{
        // Populate small sample data for PPA/OT/OI into localStorage
        const ppaSample = [{num:'PPA-001', designation:'Exemple PPA', num_ot:'OT-001'}];
        const otSample = [{id: 'ot1', numero:'OT-001', designation:'Ex OT', estimation:1000, anX:100}];
        const oiSample = [{id: 'oi1', numero:'OI-001', designation:'Ex OI', estimation:500, anX:50}];
        localStorage.setItem('as_launch', JSON.stringify(ppaSample));
        localStorage.setItem('as_ot', JSON.stringify(otSample));
        localStorage.setItem('as_oi', JSON.stringify(oiSample));
        if(status) status.textContent = 'Données d’exemple chargées. Rechargez la page pour les voir.';
      }); }
    }
  }catch(e){ console.warn(e); }
});

function bindUI(){
  // directory pick
  const pickDirBtn = document.getElementById('pickDir');
  if(pickDirBtn){
    pickDirBtn.addEventListener('click', async ()=>{
      try{
        if(!window.showDirectoryPicker){ setStatus('Navigateur non supporté (choisissez le fichier).'); return; }
        const dir = await window.showDirectoryPicker();
        if(!(await verifyPermission(dir,true))){ setStatus('Permission refusée.'); return; }
        await idbSet(KEY_DIR, dir);
        let dataDir=dir; try{ dataDir = await dir.getDirectoryHandle('data'); }catch{ try{ dataDir = await dir.getDirectoryHandle('Data'); }catch{} }
        for await(const [name, h] of dataDir.entries()){
          if(h.kind==='file' && /^(donnees)\.xlsx$/i.test(name)){
            fileHandle = h; await idbSet(KEY_FILE,h);
            const f = await h.getFile();
            showLoader();
            try{
              await loadFromFile(f);
              document.getElementById('accessCard')?.classList.add('d-none');
            }finally{
              hideLoader();
            }
            return;
          }
        }
        setStatus('donnees.xlsx introuvable dans ce dossier.');
      }catch(e){ setStatus('Erreur: '+e.message); }
    });
  }

  // file input
  const fileInput = document.getElementById('fileInput');
  if(fileInput){
    fileInput.addEventListener('change', async e=>{
      const f = e.target.files?.[0]; if(!f) return;
      await idbDel(KEY_FILE); fileHandle=null;
      showLoader();
      try{
        await loadFromFile(f);
        document.getElementById('accessCard')?.classList.add('d-none');
      }finally{
        hideLoader();
      }
    });
  }

  // drag & drop
  if(dropArea){
    ['dragenter','dragover'].forEach(ev=>dropArea.addEventListener(ev,e=>{e.preventDefault(); dropArea.classList.add('border-primary');}));
    ['dragleave','drop'].forEach(ev=>dropArea.addEventListener(ev,e=>{e.preventDefault(); dropArea.classList.remove('border-primary');}));
    dropArea.addEventListener('drop', async e=>{
      const f = e.dataTransfer.files?.[0]; if(!f) return;
      await idbDel(KEY_FILE); fileHandle=null;
      showLoader();
      try{
        await loadFromFile(f);
        document.getElementById('accessCard')?.classList.add('d-none');
      }finally{
        hideLoader();
      }
    });
  }

  // OT / OI: bind pick buttons and drop areas (delegate parsing to App.importExcelFile)
  try{
    const bindKind = async (kind, pickId, dropId, statusId, keyFile, keyDir, defaultName)=>{
      const pick = document.getElementById(pickId);
      const dropA = document.getElementById(dropId);
      const status = document.getElementById(statusId);
      if(pick){
        pick.addEventListener('click', async ()=>{
          try{
            if(!window.showDirectoryPicker){
              // fallback to file input
              const inp = document.createElement('input'); inp.type='file'; inp.accept='.xlsx';
              inp.onchange = e=>{ const f = e.target.files?.[0]; if(f) showLoader(); App.importExcelFile(kind, f).finally(()=>hideLoader()); };
              inp.click();
              return;
            }
            const dir = await window.showDirectoryPicker();
            if(!(await verifyPermission(dir,true))){ if(status) status.textContent='Permission refusée.'; return; }
            await idbSet(keyDir, dir);
            // try to find default file inside directory (and/or root)
            try{ const dataDir = await dir.getDirectoryHandle('data');
              for await(const [name,h] of dataDir.entries()){
                if(h.kind==='file' && new RegExp(`^${defaultName.replace(/\./g,'\\.')}$`,`i`).test(name)){
                  await idbSet(keyFile,h); fileHandles[kind]=h; const f = await h.getFile(); showLoader(); App.importExcelFile(kind, f).finally(()=>hideLoader()); if(status) status.textContent=`Chargé: ${name}`; return; }
              }
            }catch(e){}
            // try root
            for await(const [name,h] of dir.entries()){
              if(h.kind==='file' && new RegExp(`^${defaultName.replace(/\./g,'\\.')}$`,`i`).test(name)){
                await idbSet(keyFile,h); fileHandles[kind]=h; const f = await h.getFile(); showLoader(); App.importExcelFile(kind, f).finally(()=>hideLoader()); if(status) status.textContent=`Chargé: ${name}`; return; }
            }
            if(status) status.textContent=`${defaultName} introuvable dans ce dossier.`;
          }catch(err){ if(status) status.textContent='Erreur: '+err.message; }
        });
      }
      if(dropA){
        ['dragenter','dragover'].forEach(ev=>dropA.addEventListener(ev,e=>{e.preventDefault(); dropA.classList.add('border-primary');}));
        ['dragleave','drop'].forEach(ev=>dropA.addEventListener(ev,e=>{e.preventDefault(); dropA.classList.remove('border-primary');}));
        dropA.addEventListener('drop', e=>{ const f = e.dataTransfer.files?.[0]; if(f){ showLoader(); App.importExcelFile(kind, f).finally(()=>hideLoader()); if(status) status.textContent = `Chargé: ${f.name}`; } });
      }
    };
    bindKind('ot','pickDir-ot','dropArea-ot','status-ot', KEY_FILE_OT, KEY_DIR_OT, 'donnees_ot.xlsx');
    bindKind('oi','pickDir-oi','dropArea-oi','status-oi', KEY_FILE_OI, KEY_DIR_OI, 'donnees_oi.xlsx');
  }catch(e){}

  // set OT/OI year labels and initial save button state
  try{ const y = new Date().getFullYear(); const oy = document.getElementById('otYear'); if(oy) oy.textContent = y; const oiy = document.getElementById('oiYear'); if(oiy) oiy.textContent = y; }catch(e){}
  try{ const btnOt = document.getElementById('btnSave-ot'); if(btnOt) btnOt.disabled = false; const btnOi = document.getElementById('btnSave-oi'); if(btnOi) btnOi.disabled = false; }catch(e){}

  // filters
  ['#fCategorie','#fOt','#fAction','#fAnnee'].forEach(id=>{ const el=$(id); if(el) el.addEventListener('change', applyFilters); });
  const searchInput = document.getElementById('fSearch'); if(searchInput) searchInput.addEventListener('input', applyFilters);
  const resetBtn = document.getElementById('btnReset');
  if(resetBtn){
    resetBtn.addEventListener('click', ()=>{
      ['#fCategorie','#fOt','#fAction','#fAnnee'].forEach(id=>{ const el=$(id); if(el) el.value=''; });
      if(searchInput) searchInput.value='';
      applyFilters();
    });
  }

  // actions
  const btnSave = document.getElementById('btnSave'); if(btnSave) btnSave.addEventListener('click', saveExcel);
  const btnExport = document.getElementById('btnExport'); if(btnExport) btnExport.addEventListener('click', exportExcel);

  // OT/OI save bindings (use saved file handle if available, otherwise fallback to export)
  try{
    const saveKind = async (kind, btnId, keyFile, defaultName)=>{
      const btn = document.getElementById(btnId);
      if(!btn) return;
      btn.addEventListener('click', async ()=>{
        try{
          // get rows from App (script.js) storage by delegating to export-like behavior
          // We'll create the workbook from localStorage data for the given kind
          const data = JSON.parse(localStorage.getItem((kind==='ot')? 'as_ot' : 'as_oi')||'[]');
          const schema = (kind==='ot')? [{hdr:'N° OT'}]:[]; // unused here, we'll rely on App.exportExcel to build correctly
          // If a saved handle exists in IndexedDB, use it
          const saved = await idbGet(keyFile);
          if(saved && await verifyPermission(saved,true) && 'createWritable' in saved){
            // build sheet using App.exportExcel logic via toSheetRows/fromSheetRows helper in script.js isn't accessible here,
            // so reuse App.exportExcel by creating a workbook and using writeFile fallback: instead we just call App.exportExcel(kind) to download
            // but prefer writable: attempt to write binary produced by App's logic by reconstructing workbook here
            // We'll attempt to reconstruct using SCHEMAS from script.js by reading stored JSON
            const rows = data.map(r=>r);
            // Create worksheet using a simple approach: write JSON with headers from first object's keys
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, kind.toUpperCase());
            const out = XLSX.write(wb, {bookType:'xlsx', type:'array'});
            const w = await saved.createWritable(); await w.write(out); await w.close();
            const sEl = document.getElementById('status-'+kind); if(sEl) sEl.textContent = `💾 Sauvegardé dans ${defaultName}`;
          }else{
            // fallback to download using App.exportExcel
            App.exportExcel(kind);
            const sEl = document.getElementById('status-'+kind); if(sEl) sEl.textContent = `⬇️ Téléchargé ${defaultName}`;
          }
        }catch(err){ const sEl = document.getElementById('status-'+kind); if(sEl) sEl.textContent = 'Erreur: '+err.message; }
      });
    };
    saveKind('ot','btnSave-ot', KEY_FILE_OT, 'donnees_ot.xlsx');
    saveKind('oi','btnSave-oi', KEY_FILE_OI, 'donnees_oi.xlsx');
  }catch(e){}
}

async function tryAutoRestore(){
  try{
    // PPA
    const savedFile = await idbGet(KEY_FILE);
    if(savedFile && await verifyPermission(savedFile,false)){
      fileHandle = savedFile; const f = await savedFile.getFile();
      showLoader();
      try{
        await loadFromFile(f);
        document.getElementById('accessCard').classList.add('d-none');
        setStatus('Fichier PPA restauré automatiquement.');
      }finally{
        hideLoader();
      }
    } else {
      const savedDir = await idbGet(KEY_DIR);
      if(savedDir && await verifyPermission(savedDir,false)){
        for await(const [name,h] of savedDir.entries()){
          if(h.kind==='file' && /^(donnees)\.xlsx$/i.test(name)){
            fileHandle = h; const f = await h.getFile();
            showLoader();
            try{
              await loadFromFile(f);
              document.getElementById('accessCard').classList.add('d-none');
              setStatus('Dossier PPA restauré automatiquement.');
            }finally{
              hideLoader();
            }
            break;
          }
        }
      }
    }

    // OT
    try{
      const sf_ot = await idbGet(KEY_FILE_OT);
      if(sf_ot && await verifyPermission(sf_ot,false)){
        fileHandles.ot = sf_ot; const f = await sf_ot.getFile(); showLoader(); App.importExcelFile('ot', f).finally(()=>hideLoader()); const s=document.getElementById('status-ot'); if(s) s.textContent='OT restauré automatiquement.';
        try{ const b = document.getElementById('btnSave-ot'); if(b) b.disabled = false; }catch(e){}
      } else {
        const sd_ot = await idbGet(KEY_DIR_OT);
        if(sd_ot && await verifyPermission(sd_ot,false)){
          for await(const [name,h] of sd_ot.entries()){
            if(h.kind==='file' && /^(donnees_ot)\.xlsx$/i.test(name)){ fileHandles.ot = h; const f = await h.getFile(); showLoader(); App.importExcelFile('ot', f).finally(()=>hideLoader()); const s=document.getElementById('status-ot'); if(s) s.textContent='OT restauré automatiquement.'; break; }
          }
        }
      }
    }catch(e){}

    // OI
    try{
      const sf_oi = await idbGet(KEY_FILE_OI);
      if(sf_oi && await verifyPermission(sf_oi,false)){
        fileHandles.oi = sf_oi; const f = await sf_oi.getFile(); showLoader(); App.importExcelFile('oi', f).finally(()=>hideLoader()); const s=document.getElementById('status-oi'); if(s) s.textContent='OI restauré automatiquement.';
        try{ const b = document.getElementById('btnSave-oi'); if(b) b.disabled = false; }catch(e){}
      } else {
        const sd_oi = await idbGet(KEY_DIR_OI);
        if(sd_oi && await verifyPermission(sd_oi,false)){
          for await(const [name,h] of sd_oi.entries()){
            if(h.kind==='file' && /^(donnees_oi)\.xlsx$/i.test(name)){ fileHandles.oi = h; const f = await h.getFile(); showLoader(); App.importExcelFile('oi', f).finally(()=>hideLoader()); const s=document.getElementById('status-oi'); if(s) s.textContent='OI restauré automatiquement.'; break; }
          }
        }
      }
    }catch(e){}
  }catch(e){ console.warn(e); }
}

async function loadFromFile(file){
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, {type:'array'});
  const names = wb.SheetNames.filter(n=>{
    const ws=wb.Sheets[n]; const a=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
    return a.some(r=>r.some(c=>String(c).trim()!==''));
  });
  if(!names.length){ setStatus('Classeur vide.'); return; }
  const ws = wb.Sheets[names[0]];
  const rows = parseSheetSmart(ws);
  renderTable(rows); fillDynamicFilters();
  document.getElementById('btnSave').disabled=false; document.getElementById('btnExport').disabled=false;
  setStatus(`Chargé: ${names[0]} (${rows.length} lignes)`);
}

function parseSheetSmart(ws){
  const aoa = XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
  let headerRow=0; for(let i=0;i<Math.min(40,aoa.length);i++){ if(aoa[i].filter(v=>String(v).trim()!=='').length>=3){headerRow=i;break;} }
  const header = aoa[headerRow].map(h=>String(h||'').trim());
  const dataRows = aoa.slice(headerRow+1);
  const norm=s=>s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/\s+/g,' ').trim();
  const wanted={
    "Ref PPA":["ref ppa","ref","refppa"], "Objet":["objet","description","intitule"],
    "Catégorie":["categorie","etat dossier","etat","categorie dossier"], "Pilote":["pilote","responsable"],
    "N° Action":["n° action","action","no action"], "Date limite":["date limite","echeance","deadline","date"],
    "N° OT":["n° ot","ot"], "Contractant":["contractant","fournisseur","titulaire","prestataire"],
    "Année":["annee","année","an"]
  };
  const colIndex={}; Object.keys(wanted).forEach(k=>{ colIndex[k]=-1; for(let i=0;i<header.length;i++){ const h=norm(header[i]); if(!h) continue; if(wanted[k].some(w=>h.includes(w))){ colIndex[k]=i; break; }}});
  Object.keys(colIndex).forEach((k,i)=>{ if(colIndex[k]===-1 && i<header.length) colIndex[k]=i; });
  return dataRows.filter(r=>r.some(c=>String(c).trim()!=='')).map(r=>{
    const o={}; ORDER.forEach(k=>{ const idx=colIndex[k]; let v=(idx>=0?r[idx]:'')??'';
      if(k==='Date limite'&&v){ const d=new Date(v); if(!isNaN(d)) v=`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; }
      o[k]=String(v??'').trim(); });
    return o;
  });
}

function renderTable(rows){
  const tb = document.querySelector('#dossiersTable tbody'); tb.innerHTML='';
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    ORDER.forEach((k,idx)=>{
      const td=document.createElement('td');
      td.textContent = r[k] || '';
      const readOnly = (idx===6);
      td.contentEditable = !readOnly;
      if(readOnly) td.classList.add('bg-light');
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
}

function uniqueFromCol(i){ return [...new Set($$('#dossiersTable tbody tr').map(r=>r.children[i].textContent.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr')); }
function fillSelect(sel, arr){ sel.innerHTML = '<option value=\"\">— Tous —</option>' + arr.map(v=>`<option>${v}</option>`).join(''); }
function fillDynamicFilters(){ fillSelect(document.getElementById('fOt'), uniqueFromCol(6)); fillSelect(document.getElementById('fAction'), uniqueFromCol(4)); }
function normalize(s){ return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,''); }
function applyFilters(){
  const fCat=document.getElementById('fCategorie').value.trim(), fOt=document.getElementById('fOt').value.trim(), fAct=document.getElementById('fAction').value.trim(), fAnn=document.getElementById('fAnnee').value.trim(), q=normalize(document.getElementById('fSearch').value.trim());
  $$('#dossiersTable tbody tr').forEach(r=>{
    const vCat=r.children[2].textContent.trim(), vAct=r.children[4].textContent.trim(), vOt=r.children[6].textContent.trim(), vAnn=r.children[8].textContent.trim();
    const ok=(!fCat||vCat===fCat)&&(!fOt||vOt===fOt)&&(!fAct||vAct===fAct)&&(!fAnn||vAnn===fAnn)&&(!q||normalize(r.textContent).includes(q));
    r.style.display = ok? '' : 'none';
  });
}

function rowsFromDOM(){
  const rows=[]; $$('#dossiersTable tbody tr').forEach(tr=>{ const o={}; ORDER.forEach((k,i)=>o[k]=tr.children[i]?.textContent.trim()||''); rows.push(o); }); return rows;
}

async function saveExcel(){
  try{
    const rows = rowsFromDOM();
    const ws = XLSX.utils.json_to_sheet(rows, {header: ORDER});
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Dossiers');
    const out = XLSX.write(wb, {bookType:'xlsx', type:'array'});
    if(fileHandle && 'createWritable' in fileHandle){
      const w = await fileHandle.createWritable(); await w.write(out); await w.close(); setStatus('💾 Sauvegardé dans donnees.xlsx');
    }else{
      const blob = new Blob([out], {type:'application/octet-stream'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='donnees.xlsx'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
      setStatus('⬇️ Téléchargé (pas de permission d’écriture)');
    }
  }catch(e){ setStatus('Erreur: '+e.message); }
}

function exportExcel(){
  const rows = rowsFromDOM();
  const ws = XLSX.utils.json_to_sheet(rows, {header: ORDER});
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Dossiers');
  XLSX.writeFile(wb, 'donnees_export.xlsx');
}


// Global loader helpers
function showLoader(message){
  try{
    if(globalThis.AppLoader){
      globalThis.AppLoader.show(message);
    }else{
      const el = document.getElementById('globalLoader');
      if(el){
        const msg = el.querySelector('.loader-message');
        if(msg) msg.textContent = message || 'Chargement…';
        el.classList.remove('d-none');
        requestAnimationFrame(()=> el.classList.add('active'));
      }
    }
  }catch(e){}
}
function hideLoader(){
  try{
    if(globalThis.AppLoader){
      globalThis.AppLoader.hide();
    }else{
      const el = document.getElementById('globalLoader');
      if(el){
        el.classList.remove('active');
        setTimeout(()=> el.classList.add('d-none'), 320);
      }
    }
  }catch(e){}
}



// ===== OT Budget (Fascicule) adapter =====
const OTBudget = {
  headersWanted: [
    "N° OT","Objet de la dépense","Coût global",
    "Prévision 2024 (a)","Réalisations 2024 à fin août (b)",
    "Forecast 2024 de septembre à décembre (c)",
    "Réalisations totales (b+c)=d","Réal 2025","Réal 2026","Réal 2027",
    "Taux de réalisation 2024 actuel (b/a)",
    "Taux de réalisation 2024 prévu à fin 2024 (d/a)",
    "Taux année 2025 par rapport2024"
  ],
  findHeaderRow(sheet2D){
    for(let r=0;r<8;r++){
      const row = sheet2D[r]||[];
      if(row.some(c => (c||"").toString().trim() === "N° OT")) return r;
    }
    return -1;
  },
  normalizeHeader(h){
    return (h||"").toString().replace(/\s+/g," ").replace(/\n/g," ").trim()
  },
  parse(sheet2D){
    const hr = this.findHeaderRow(sheet2D);
    if(hr<0) return [];
    const headers = (sheet2D[hr]||[]).map(x=>this.normalizeHeader(x));
    const idx = {};
    for(let i=0;i<headers.length;i++){
      const h = headers[i];
      idx[h]=i;
    }
    const map = {
      num_ot: idx["N° OT"],
      objet: idx["Objet de la dépense"],
      cout_global: idx["Coût global"],
      prev_2024: idx["Prévision 2024 (a)"],
      real_2024_aout: idx["Réalisations 2024 à fin août (b)"],
      forecast_2024: idx["Forecast 2024 de septembre à décembre (c)"],
      total_2024: idx["Réalisations totales (b+c)=d"],
      real_2025: idx["Réal 2025"],
      real_2026: idx["Réal 2026"],
      real_2027: idx["Réal 2027"],
      taux_actuel: idx["Taux de réalisation 2024 actuel (b/a)"],
      taux_prevu: idx["Taux de réalisation 2024 prévu à fin 2024 (d/a)"],
      taux_2025_vs_2024: idx["Taux année 2025 par rapport2024"]
    };
    const out = [];
    for(let r=hr+1; r<sheet2D.length; r++){
      const row = sheet2D[r]||[];
      const num = row[map.num_ot];
      if(num===undefined || num===null || num==="") continue;
      const rec = {};
      for(const [k,c] of Object.entries(map)){
        rec[k] = (c!=null)? row[c] : null;
      }
      out.push(rec);
    }
    return out;
  }
};

// Hook: if a table container exists, render a budget table when a 'Fascicule'-style sheet is present
function tryRenderOTBudgetFromSheet(sheet2D){
  try{
    const data = OTBudget.parse(sheet2D);
    if(!data.length) return;
    if(!document.getElementById("otBudgetTable")) return;
    window.App = window.App||{};
    App.state = App.state||{};
    App.state.OTBudget = data;
    renderOTBudget();
  }catch(e){ console.warn("OTBudget parse error:", e); }
}

function fmtNum(n){
  const v = Number(n);
  if(!isFinite(v)) return "";
  return v.toLocaleString(undefined,{maximumFractionDigits:2});
}
function fmtPct(n){
  const v = Number(n);
  if(!isFinite(v)) return "";
  return (v*100).toFixed(1)+"%";
}

function renderOTBudget(){
  const tbl = document.getElementById("otBudgetTable");
  if(!tbl) return;
  const thead = tbl.querySelector("thead");
  const tbody = tbl.querySelector("tbody");
  const tfoot = tbl.querySelector("tfoot");
  const H = ["N° OT","Objet","Coût global","Prev 2024 (a)","Réel 2024 (b)","Fcst 2024 (c)","Total 2024 (d)","2025","2026","2027","Taux b/a","Taux d/a","Taux 2025/2024"];
  thead.innerHTML = "<tr>"+H.map(h=>`<th class="text-nowrap">${h}</th>`).join("")+"</tr>";
  const src = (App.state&&App.state.OTBudget)||[];

  // Filters
  const otSet = Array.from(new Set(src.map(r=>r.num_ot))).filter(Boolean).sort();
  const sel = document.getElementById("otFilter");
  if(sel && !sel.dataset.filled){
    sel.innerHTML = '<option value="">— Tous les OT —</option>'+ otSet.map(v=>`<option>${v}</option>`).join("");
    sel.dataset.filled = "1";
  }
  const q = (document.getElementById("otSearch")?.value||"").toLowerCase();
  const f = (sel?.value||"");
  const rows = src.filter(r=> (f? String(r.num_ot)==f : true) && (q? String(r.objet||"").toLowerCase().includes(q):true));

  // Body
  tbody.innerHTML = rows.map(r=>`<tr>
    <td>${r.num_ot??""}</td>
    <td>${r.objet??""}</td>
    <td class="text-end">${fmtNum(r.cout_global)}</td>
    <td class="text-end">${fmtNum(r.prev_2024)}</td>
    <td class="text-end">${fmtNum(r.real_2024_aout)}</td>
    <td class="text-end">${fmtNum(r.forecast_2024)}</td>
    <td class="text-end fw-semibold">${fmtNum(r.total_2024)}</td>
    <td class="text-end">${fmtNum(r.real_2025)}</td>
    <td class="text-end">${fmtNum(r.real_2026)}</td>
    <td class="text-end">${fmtNum(r.real_2027)}</td>
    <td class="text-end">${fmtPct(r.taux_actuel)}</td>
    <td class="text-end">${fmtPct(r.taux_prevu)}</td>
    <td class="text-end">${fmtNum(r.taux_2025_vs_2024)}</td>
  </tr>`).join("");

  // Footer totals
  const sum = (k)=> rows.reduce((a,b)=> a + (Number(b[k])||0), 0);
  const foot = `<tr class="table-secondary">
    <th colspan="2" class="text-end">Totaux</th>
    <th class="text-end">${fmtNum(sum("cout_global"))}</th>
    <th class="text-end">${fmtNum(sum("prev_2024"))}</th>
    <th class="text-end">${fmtNum(sum("real_2024_aout"))}</th>
    <th class="text-end">${fmtNum(sum("forecast_2024"))}</th>
    <th class="text-end fw-bold">${fmtNum(sum("total_2024"))}</th>
    <th class="text-end">${fmtNum(sum("real_2025"))}</th>
    <th class="text-end">${fmtNum(sum("real_2026"))}</th>
    <th class="text-end">${fmtNum(sum("real_2027"))}</th>
    <th></th><th></th><th></th>
  </tr>`;
  tfoot.innerHTML = foot;

  // Events
  document.getElementById("otFilter")?.addEventListener("change", renderOTBudget, {once:true});
  document.getElementById("otSearch")?.addEventListener("input", renderOTBudget, {once:true});
}

// Integration: when loading an Excel file, try to render the OT budget if headers are found.
// We assume a global helper 'sheetTo2D' exists; if not, we build a small fallback using XLSX.


// ===== OI Budget (Fascicule DI) adapter =====
const OIBudget = {
  findHeaderRow(sheet2D){
    for(let r=0;r<40;r++){
      const row = (sheet2D[r]||[]).map(x=> (x||"").toString().toLowerCase());
      if(row.includes("r-e") && row.includes("taux engagement")) return r;
    }
    return -1;
  },
  parse(sheet2D){
    const hr = this.findHeaderRow(sheet2D);
    if(hr<0) return [];
    const H = sheet2D[hr];
    // column indices inferred from sample fascicule
    const idx = {
      OI: 5,            // Code OI
      OBJET: 7,         // Description
      COUT: 34,         // 'cout' (budget global)
      REAL_CUM_2024: 23,// Réalisé Cum Fin 2024 (a)+(d)
      TYPE: 6,          // Type
      CIRCUIT: 8        // Circuit
    };
    const out = [];
    for(let r=hr+1; r<sheet2D.length; r++){
      const row = sheet2D[r]||[];
  const cat = row[idx.OI];
  const catStr = String(cat ?? '').trim();
  if(!catStr || catStr === "***") continue;
      const desc = row[idx.OBJET];
      const budget = Number(row[idx.COUT])||0;
      const actual = Number(row[idx.REAL_CUM_2024])||0;
      const variance = budget - actual;
      const notes = [row[idx.TYPE], row[idx.CIRCUIT]].filter(Boolean).join(" · ");
      out.push({category:cat, description:desc, budgeted:budget, actual:actual, variance:variance, notes});
    }
    return out;
  }
};

function fmtEUR(n){
  const v=Number(n); if(!isFinite(v)) return "";
  return v.toLocaleString(undefined,{maximumFractionDigits:2});
}
function fmtSign(n){
  const v=Number(n); if(!isFinite(v)) return "";
  const s = v>=0? "+" : "−";
  return s + Math.abs(v).toLocaleString(undefined,{maximumFractionDigits:2});
}

function renderOIBudget(){
  const tbl = document.getElementById("oiBudgetTable");
  if(!tbl) return;
  const thead = tbl.querySelector("thead");
  const tbody = tbl.querySelector("tbody");
  const tfoot = tbl.querySelector("tfoot");
  const H = ["Category","Description","Budgeted Amount","Actual Amount","Variance","Notes"];
  thead.innerHTML = "<tr>"+H.map(h=>`<th class="text-nowrap">${h}</th>`).join("")+"</tr>";
  const src = (App.state&&App.state.OIBudget)||[];

  // Filters
  const catSet = Array.from(new Set(src.map(r=>r.category))).filter(Boolean).sort();
  const sel = document.getElementById("oiFilter");
  if(sel && !sel.dataset.filled){
    sel.innerHTML = '<option value="">— Toutes les catégories —</option>'+ catSet.map(v=>`<option>${v}</option>`).join("");
    sel.dataset.filled = "1";
  }
  const q = (document.getElementById("oiSearch")?.value||"").toLowerCase();
  const f = (sel?.value||"");
  const rows = src.filter(r=> (f? String(r.category)==f : true) && (q? String(r.description||"").toLowerCase().includes(q):true));

  // Body
  tbody.innerHTML = rows.map(r=>`<tr>
    <td>${r.category??""}</td>
    <td>${r.description??""}</td>
    <td class="text-end">${fmtEUR(r.budgeted)}</td>
    <td class="text-end">${fmtEUR(r.actual)}</td>
    <td class="text-end ${r.variance<0?'text-danger fw-semibold':'text-success fw-semibold'}">${fmtSign(r.variance)}</td>
    <td>${r.notes??""}</td>
  </tr>`).join("");

  // Footer totals
  const sum = (k)=> rows.reduce((a,b)=> a + (Number(b[k])||0), 0);
  tfoot.innerHTML = `<tr class="table-secondary">
    <th colspan="2" class="text-end">Totaux</th>
    <th class="text-end">${fmtEUR(sum("budgeted"))}</th>
    <th class="text-end">${fmtEUR(sum("actual"))}</th>
    <th class="text-end ${sum('variance')<0?'text-danger fw-bold':'text-success fw-bold'}">${fmtSign(sum("variance"))}</th>
    <th></th>
  </tr>`;

  // Events
  document.getElementById("oiFilter")?.addEventListener("change", renderOIBudget, {once:true});
  document.getElementById("oiSearch")?.addEventListener("input", renderOIBudget, {once:true});

  // CSV export
  document.getElementById("oiExportCsv")?.addEventListener("click", ()=>{
    const csvRows = [["Category","Description","Budgeted Amount","Actual Amount","Variance","Notes"]]
      .concat(rows.map(r=>[r.category, r.description, r.budgeted, r.actual, r.variance, r.notes]));
    const csv = csvRows.map(r=>r.map(x=>`"${String(x??'').replace(/"/g,'""')}"`).join(",")).join("\\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "budget_oi.csv"; a.click();
    URL.revokeObjectURL(url);
  }, {once:true});
}

function tryRenderOIBudgetFromSheet(sheet2D){
  try{
    const data = OIBudget.parse(sheet2D);
    if(!data.length) return;
    window.App = window.App||{}; App.state = App.state||{};
    App.state.OIBudget = data;
    renderOIBudget();
    // Update dashboard cards
    const b = data.reduce((s,x)=>s+(x.budgeted||0),0);
    const a = data.reduce((s,x)=>s+(x.actual||0),0);
    const v = b - a;
    const f = (n)=> (Number(n)||0).toLocaleString(undefined,{maximumFractionDigits:0});
    const sign = v>=0? "+" : "−";
    document.getElementById("kpi-oi-variance")?.innerText = sign + f(Math.abs(v));
    document.getElementById("kpi-oi-sub")?.innerText = "Budget: "+f(b)+" | Réalisé: "+f(a);
    document.getElementById("kpi-oi-count")?.innerText = data.length;
  }catch(e){ console.warn("OIBudget parse error:", e); }
}
