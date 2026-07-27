/* GMAO — Gestion de Maintenance Assistée par Ordinateur
   Centrale Diesel DAKHLA • ONEE-BE */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

const GMAO_SESSION_KEY = 'as_session';
const SESSION_TTL_MS   = 5 * 60 * 1000;

const STORE = {
  dt:           'gmao_dt',
  bt:           'gmao_bt',
  ot:           'gmao_ot',
  appro:        'gmao_appro',
  bsm:          'gmao_bsm',
  intervention: 'gmao_intervention',
  rapport:      'gmao_rapport',
};

const MACHINES = [
  'Groupe Diesel 1 (MAN)',
  'Groupe Diesel 2 (MAN)',
  'Groupe Diesel 3 (Caterpillar)',
  'Alternateur G1',
  'Alternateur G2',
  'Alternateur G3',
  'Transformateur HTA/BT',
  'Compresseur de démarrage',
  'Pompe eau de refroidissement',
  'Système alimentation fuel',
  'Tableau électrique général',
  'Groupe électrogène de secours',
  'Pont roulant',
  'Station de pompage',
];

const EQUIPES = [
  'Équipe mécanique A',
  'Équipe mécanique B',
  'Équipe électrique A',
  'Équipe électrique B',
  'Équipe instrumentation',
  'Équipe générale',
];

const DT_TYPES  = ['Corrective', 'Préventive', 'Améliorative'];
const PRIORITES = ['Urgente', 'Haute', 'Normale', 'Basse'];

const DT_STATUS = {
  nouvelle:  { label: 'Nouvelle',  cls: 'secondary' },
  planifiée: { label: 'Planifiée', cls: 'info'      },
  en_cours:  { label: 'En cours',  cls: 'warning'   },
  clôturée:  { label: 'Clôturée',  cls: 'success'   },
  annulée:   { label: 'Annulée',   cls: 'danger'    },
};

const BT_STATUS = {
  créé:      { label: 'Créé',      cls: 'secondary' },
  transmis:  { label: 'Transmis',  cls: 'info'      },
  préparé:   { label: 'Préparé',   cls: 'success'   },
};

const OT_STATUS = {
  créé:              { label: 'Créé',              cls: 'secondary' },
  approvisionnement: { label: 'Approvisionnement', cls: 'info'      },
  lancé:             { label: 'Lancé',             cls: 'warning'   },
  terminé:           { label: 'Terminé',           cls: 'success'   },
};

const APPRO_STATUS = {
  en_attente: { label: 'En attente', cls: 'warning'  },
  livré:      { label: 'Livré',      cls: 'success'  },
};

const INT_STATUS = {
  planifiée: { label: 'Planifiée', cls: 'info'    },
  en_cours:  { label: 'En cours',  cls: 'warning' },
  terminée:  { label: 'Terminée',  cls: 'success' },
};

// ─── Utilities ────────────────────────────────────────────────────────────────

const uid      = () => Math.random().toString(36).slice(2, 10);
const fmtDate  = v  => v ? new Date(v).toLocaleDateString('fr-FR') : '–';
const fmtDT    = v  => v ? new Date(v).toLocaleString('fr-FR', { dateStyle:'short', timeStyle:'short' }) : '–';
const esc      = s  => String(s ?? '').replace(/[&<>"']/g, m =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
const escAttr  = s  => String(s ?? '').replace(/"/g, '&quot;');

function gRead(key)        { try { return JSON.parse(localStorage.getItem(STORE[key]) || '[]'); } catch { return []; } }
function gWrite(key, arr)  { localStorage.setItem(STORE[key], JSON.stringify(arr)); }
function gFind(key, id)    { return gRead(key).find(x => x.id === id) || null; }
function gUpsert(key, obj) {
  const arr = gRead(key);
  const i   = arr.findIndex(x => x.id === obj.id);
  if (i >= 0) arr[i] = { ...arr[i], ...obj };
  else         arr.push(obj);
  gWrite(key, arr);
}
function gRemove(key, id)  { gWrite(key, gRead(key).filter(x => x.id !== id)); }

function nextNum(key, prefix) {
  const arr  = gRead(key);
  const year = new Date().getFullYear();
  const max  = arr.reduce((acc, d) => {
    if (!d.numero) return acc;
    const parts = d.numero.split('-');
    return Math.max(acc, parseInt(parts[parts.length - 1]) || 0);
  }, 0);
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
}

function badge(statusMap, status) {
  const s = statusMap[status] || { label: status || '–', cls: 'secondary' };
  const txtCls = (s.cls === 'warning' || s.cls === 'info') ? ' text-dark' : '';
  return `<span class="badge bg-${s.cls}${txtCls}">${esc(s.label)}</span>`;
}

function priorityBadge(p) {
  const map = { Urgente:'danger', Haute:'warning', Normale:'primary', Basse:'secondary' };
  const cls = map[p] || 'secondary';
  const dark = cls === 'warning' ? ' text-dark' : '';
  return `<span class="badge bg-${cls}${dark}">${esc(p || '–')}</span>`;
}

function sel(id) { return document.getElementById(id); }

function buildSelect(items, selectedVal = '', placeholder = '— Choisir —') {
  const opts = items.map(v => `<option value="${escAttr(v)}" ${v === selectedVal ? 'selected' : ''}>${esc(v)}</option>`).join('');
  return `<option value="">${esc(placeholder)}</option>${opts}`;
}

// ─── Session / Auth ───────────────────────────────────────────────────────────

function getSession() {
  try {
    const r = JSON.parse(localStorage.getItem(GMAO_SESSION_KEY) || 'null');
    if (!r) return null;
    if (r.expiresAt && r.expiresAt <= Date.now()) {
      localStorage.removeItem(GMAO_SESSION_KEY);
      return null;
    }
    // refresh TTL
    r.expiresAt = Date.now() + SESSION_TTL_MS;
    localStorage.setItem(GMAO_SESSION_KEY, JSON.stringify(r));
    return r;
  } catch { return null; }
}

function isAdmin() { const s = getSession(); return s && s.role === 'admin'; }

function initAuth() {
  const s = getSession();
  if (!s) { window.location.href = 'index.html'; return; }

  const nameEl  = sel('gmaoUserName');
  const roleEl  = sel('gmaoRoleBadge');
  const logBtn  = sel('gmaoLogout');
  if (nameEl) nameEl.textContent = s.display || s.username || '–';
  if (roleEl) {
    const labels = { admin:'Administrateur', user:'Utilisateur', viewer:'Lecteur' };
    roleEl.textContent = labels[s.role] || s.role;
    roleEl.classList.remove('d-none');
  }
  if (logBtn) {
    logBtn.addEventListener('click', () => {
      localStorage.removeItem(GMAO_SESSION_KEY);
      window.location.href = 'index.html';
    });
  }
}

// ─── Modal helpers ────────────────────────────────────────────────────────────

function showModal(title, bodyHTML, footerHTML = '') {
  sel('gmaoModalTitle').textContent = title;
  sel('gmaoModalBody').innerHTML    = bodyHTML;
  const footer = sel('gmaoModalFooter');
  footer.innerHTML = `<button class="btn btn-secondary" data-bs-dismiss="modal">Fermer</button>`;
  if (footerHTML) footer.insertAdjacentHTML('afterbegin', footerHTML);
  bootstrap.Modal.getOrCreateInstance(sel('gmaoModal')).show();
}

function showDetail(title, bodyHTML) {
  sel('gmaoDetailTitle').textContent = title;
  sel('gmaoDetailBody').innerHTML    = bodyHTML;
  bootstrap.Modal.getOrCreateInstance(sel('gmaoDetailModal')).show();
}

function hideModal() {
  const m1 = bootstrap.Modal.getInstance(sel('gmaoModal'));
  const m2 = bootstrap.Modal.getInstance(sel('gmaoDetailModal'));
  if (m1) m1.hide();
  if (m2) m2.hide();
}

// ─── Populate filter dropdowns ────────────────────────────────────────────────

function populateSelects() {
  // Machine filters
  ['dtFltMachine', 'rapFltMachine'].forEach(id => {
    const el = sel(id);
    if (!el) return;
    el.innerHTML = `<option value="">— Toutes les machines —</option>` +
      MACHINES.map(m => `<option value="${escAttr(m)}">${esc(m)}</option>`).join('');
  });

  // Equipe filter
  const eqEl = sel('intFltEquipe');
  if (eqEl) {
    eqEl.innerHTML = `<option value="">— Toutes équipes —</option>` +
      EQUIPES.map(e => `<option value="${escAttr(e)}">${esc(e)}</option>`).join('');
  }
}

// ─── Render functions ─────────────────────────────────────────────────────────

const Render = {

  all() {
    this.dashboard();
    this.dt();
    this.ordonnancement();
    this.appro();
    this.interventions();
    this.rapports();
    this.badges();
  },

  badges() {
    const nouvelles = gRead('dt').filter(d => d.status === 'nouvelle').length;
    const badgeEl = sel('dtBadge');
    if (badgeEl) {
      badgeEl.textContent = nouvelles || '';
      badgeEl.classList.toggle('d-none', !nouvelles);
    }
  },

  dashboard() {
    const dts   = gRead('dt');
    const ots   = gRead('ot');
    const ints  = gRead('intervention');
    const now   = new Date();
    const month = now.getMonth();
    const year  = now.getFullYear();

    const setText = (id, v) => { const el = sel(id); if (el) el.textContent = v; };
    setText('kpi-dt-new',     dts.filter(d => d.status === 'nouvelle').length);
    setText('kpi-dt-plan',    dts.filter(d => d.status === 'planifiée').length);
    setText('kpi-ot-appro',   ots.filter(d => d.status === 'approvisionnement').length);
    setText('kpi-int-encours',ints.filter(d => d.status === 'en_cours').length);
    setText('kpi-dt-close',   dts.filter(d => d.status === 'clôturée').length);

    const monthDTs = dts.filter(d => {
      const dt = new Date(d.date_emission);
      return dt.getMonth() === month && dt.getFullYear() === year;
    });
    setText('kpi-dt-month', monthDTs.length);

    // Recent DTs table
    const dtBody = sel('dashDtTable')?.querySelector('tbody');
    if (dtBody) {
      const recent = [...dts].sort((a, b) => new Date(b.date_emission) - new Date(a.date_emission)).slice(0, 8);
      dtBody.innerHTML = recent.length
        ? recent.map(d => `<tr>
            <td><a href="#" onclick="GMAO.ui.viewDT('${d.id}');return false">${esc(d.numero)}</a></td>
            <td class="small">${esc(d.machine)}</td>
            <td>${priorityBadge(d.priorite)}</td>
            <td>${badge(DT_STATUS, d.status)}</td>
          </tr>`).join('')
        : '<tr><td colspan="4" class="text-muted text-center small py-3">Aucune DT enregistrée</td></tr>';
    }

    // Recent interventions table
    const intBody = sel('dashIntTable')?.querySelector('tbody');
    if (intBody) {
      const recent = [...ints].sort((a, b) => new Date(b.date_planifiee) - new Date(a.date_planifiee)).slice(0, 8);
      intBody.innerHTML = recent.length
        ? recent.map(i => `<tr>
            <td><a href="#" onclick="GMAO.ui.viewIntervention('${i.id}');return false">${esc(i.numero)}</a></td>
            <td class="small">${esc(i.machine)}</td>
            <td class="small">${esc(i.equipe)}</td>
            <td>${badge(INT_STATUS, i.status)}</td>
          </tr>`).join('')
        : '<tr><td colspan="4" class="text-muted text-center small py-3">Aucune intervention</td></tr>';
    }
  },

  dt() {
    const tbody = sel('tblDT')?.querySelector('tbody');
    if (!tbody) return;

    let data = gRead('dt');
    const machine = sel('dtFltMachine')?.value || '';
    const type    = sel('dtFltType')?.value    || '';
    const status  = sel('dtFltStatus')?.value  || '';
    const q       = (sel('dtFltSearch')?.value || '').trim().toLowerCase();

    if (machine) data = data.filter(d => d.machine === machine);
    if (type)    data = data.filter(d => d.type    === type);
    if (status)  data = data.filter(d => d.status  === status);
    if (q)       data = data.filter(d => `${d.description} ${d.emetteur} ${d.machine}`.toLowerCase().includes(q));

    data.sort((a, b) => new Date(b.date_emission) - new Date(a.date_emission));

    const admin = isAdmin();
    tbody.innerHTML = data.length
      ? data.map(d => `<tr>
          <td><a href="#" onclick="GMAO.ui.viewDT('${d.id}');return false">${esc(d.numero)}</a></td>
          <td class="small">${esc(d.machine)}</td>
          <td><span class="badge bg-light text-dark border">${esc(d.type)}</span></td>
          <td>${priorityBadge(d.priorite)}</td>
          <td class="small" style="max-width:220px">${esc(d.description)}</td>
          <td class="small">${esc(d.emetteur)}</td>
          <td class="small">${fmtDate(d.date_emission)}</td>
          <td>${badge(DT_STATUS, d.status)}</td>
          <td class="tbl-action-col">
            ${admin ? `<button class="btn btn-sm btn-outline-secondary me-1" onclick="GMAO.ui.openDT('${d.id}')">
              <i class="bi bi-pencil"></i></button>` : ''}
            ${d.status === 'nouvelle' && admin ? `<button class="btn btn-sm btn-outline-primary me-1" onclick="GMAO.actions.planifierDT('${d.id}')" title="Planifier">
              <i class="bi bi-calendar-plus"></i></button>` : ''}
            ${['nouvelle','planifiée'].includes(d.status) && admin ? `<button class="btn btn-sm btn-outline-warning me-1" onclick="GMAO.actions.annulerDT('${d.id}')" title="Annuler">
              <i class="bi bi-x-circle"></i></button>` : ''}
            ${admin ? `<button class="btn btn-sm btn-outline-danger" onclick="GMAO.actions.removeDT('${d.id}')" title="Supprimer">
              <i class="bi bi-trash"></i></button>` : ''}
          </td>
        </tr>`).join('')
      : '<tr><td colspan="9" class="text-muted text-center py-4">Aucune demande de travaux trouvée.</td></tr>';
  },

  ordonnancement() {
    this._dtPending();
    this._bt();
    this._ot();
  },

  _dtPending() {
    const tbody = sel('tblDTPending')?.querySelector('tbody');
    if (!tbody) return;
    const data = gRead('dt').filter(d => d.status === 'nouvelle')
      .sort((a, b) => {
        const po = { Urgente:0, Haute:1, Normale:2, Basse:3 };
        return (po[a.priorite] ?? 9) - (po[b.priorite] ?? 9);
      });
    const admin = isAdmin();
    tbody.innerHTML = data.length
      ? data.map(d => `<tr>
          <td><a href="#" onclick="GMAO.ui.viewDT('${d.id}');return false">${esc(d.numero)}</a></td>
          <td class="small">${esc(d.machine)}</td>
          <td><span class="badge bg-light text-dark border">${esc(d.type)}</span></td>
          <td>${priorityBadge(d.priorite)}</td>
          <td class="small">${esc(d.description)}</td>
          <td class="small">${fmtDate(d.date_emission)}</td>
          <td>${admin ? `<button class="btn btn-sm btn-primary" onclick="GMAO.actions.planifierDT('${d.id}')">
            <i class="bi bi-calendar-plus me-1"></i>Planifier</button>` : '–'}</td>
        </tr>`).join('')
      : '<tr><td colspan="7" class="text-muted text-center py-3 small">Aucune DT en attente de planification.</td></tr>';
  },

  _bt() {
    const tbody = sel('tblBT')?.querySelector('tbody');
    if (!tbody) return;
    const data = [...gRead('bt')].sort((a, b) => new Date(b.date_creation) - new Date(a.date_creation));
    const admin = isAdmin();
    tbody.innerHTML = data.length
      ? data.map(b => `<tr>
          <td>${esc(b.numero)}</td>
          <td><a href="#" onclick="GMAO.ui.viewDT('${b.dt_id}');return false">${esc(b.dt_numero)}</a></td>
          <td class="small">${esc(b.machine)}</td>
          <td class="small">${fmtDate(b.date_creation)}</td>
          <td class="small">${fmtDate(b.date_planifiee)}</td>
          <td>${badge(BT_STATUS, b.status)}</td>
          <td class="small">${esc(b.dossier_prepa || '–')}</td>
          <td class="tbl-action-col">
            ${admin && b.status === 'créé' ? `<button class="btn btn-sm btn-outline-info me-1" onclick="GMAO.actions.transmettreBT('${b.id}')" title="Transmettre au Bureau des Méthodes">
              <i class="bi bi-send"></i></button>` : ''}
            ${admin && b.status === 'transmis' ? `<button class="btn btn-sm btn-outline-success me-1" onclick="GMAO.actions.preparerBT('${b.id}')" title="Dossier préparé">
              <i class="bi bi-check-circle"></i></button>` : ''}
          </td>
        </tr>`).join('')
      : '<tr><td colspan="8" class="text-muted text-center py-3 small">Aucun bon de travail.</td></tr>';
  },

  _ot() {
    const tbody = sel('tblOT')?.querySelector('tbody');
    if (!tbody) return;
    let data = gRead('ot');
    const status = sel('otFltStatus')?.value || '';
    const q      = (sel('otFltSearch')?.value || '').trim().toLowerCase();
    if (status) data = data.filter(d => d.status === status);
    if (q)      data = data.filter(d => `${d.machine} ${d.equipe} ${d.numero}`.toLowerCase().includes(q));
    data.sort((a, b) => new Date(a.date_planifiee) - new Date(b.date_planifiee));
    const admin = isAdmin();
    tbody.innerHTML = data.length
      ? data.map(o => `<tr>
          <td>${esc(o.numero)}</td>
          <td><a href="#" onclick="GMAO.ui.viewDT('${o.dt_id}');return false">${esc(o.dt_numero)}</a></td>
          <td class="small">${esc(o.machine)}</td>
          <td class="small">${esc(o.equipe)}</td>
          <td class="small">${fmtDate(o.date_planifiee)}</td>
          <td class="small">${o.duree_estimee ? o.duree_estimee + ' h' : '–'}</td>
          <td>${badge(OT_STATUS, o.status)}</td>
          <td class="tbl-action-col">
            ${admin && o.status === 'créé' ? `<button class="btn btn-sm btn-outline-info me-1" onclick="GMAO.actions.creerAppro('${o.id}')" title="Demande approvisionnement">
              <i class="bi bi-cart-plus"></i></button>` : ''}
            ${admin && ['créé','approvisionnement'].includes(o.status) ? `<button class="btn btn-sm btn-outline-primary me-1" onclick="GMAO.actions.lancerOT('${o.id}')" title="Lancer l'intervention">
              <i class="bi bi-play-circle"></i></button>` : ''}
            ${admin ? `<button class="btn btn-sm btn-outline-secondary" onclick="GMAO.ui.viewOT('${o.id}')" title="Détail">
              <i class="bi bi-eye"></i></button>` : ''}
          </td>
        </tr>`).join('')
      : '<tr><td colspan="8" class="text-muted text-center py-3 small">Aucun ordre de travail.</td></tr>';
  },

  appro() {
    this._appro();
    this._bsm();
  },

  _appro() {
    const tbody = sel('tblAppro')?.querySelector('tbody');
    if (!tbody) return;
    const data = [...gRead('appro')].sort((a, b) => new Date(b.date_demande) - new Date(a.date_demande));
    const admin = isAdmin();
    tbody.innerHTML = data.length
      ? data.map(a => `<tr>
          <td>${esc(a.numero)}</td>
          <td>${esc(a.ot_numero)}</td>
          <td class="small">${esc(a.machine)}</td>
          <td class="small">${esc(a.pieces)}</td>
          <td>${esc(a.quantite)}</td>
          <td class="small">${fmtDate(a.date_demande)}</td>
          <td>${badge(APPRO_STATUS, a.status)}</td>
          <td class="tbl-action-col">
            ${admin && a.status === 'en_attente' ? `<button class="btn btn-sm btn-outline-success" onclick="GMAO.actions.livrerAppro('${a.id}')" title="Créer BSM (livraison)">
              <i class="bi bi-box-arrow-right me-1"></i>Livrer</button>` : ''}
          </td>
        </tr>`).join('')
      : '<tr><td colspan="8" class="text-muted text-center py-3 small">Aucune demande d\'approvisionnement.</td></tr>';
  },

  _bsm() {
    const tbody = sel('tblBSM')?.querySelector('tbody');
    if (!tbody) return;
    const data = [...gRead('bsm')].sort((a, b) => new Date(b.date_sortie) - new Date(a.date_sortie));
    tbody.innerHTML = data.length
      ? data.map(b => `<tr>
          <td>${esc(b.numero)}</td>
          <td>${esc(b.appro_numero)}</td>
          <td>${esc(b.ot_numero)}</td>
          <td class="small">${esc(b.pieces_livrees)}</td>
          <td>${esc(b.quantite_livree)}</td>
          <td class="small">${fmtDate(b.date_sortie)}</td>
          <td><button class="btn btn-sm btn-outline-secondary" onclick="GMAO.ui.viewBSM('${b.id}')">
            <i class="bi bi-eye"></i></button></td>
        </tr>`).join('')
      : '<tr><td colspan="7" class="text-muted text-center py-3 small">Aucun bon de sortie matériel.</td></tr>';
  },

  interventions() {
    const tbody = sel('tblInterventions')?.querySelector('tbody');
    if (!tbody) return;
    let data = gRead('intervention');
    const status = sel('intFltStatus')?.value || '';
    const equipe = sel('intFltEquipe')?.value  || '';
    const q      = (sel('intFltSearch')?.value || '').trim().toLowerCase();
    if (status) data = data.filter(d => d.status === status);
    if (equipe) data = data.filter(d => d.equipe === equipe);
    if (q)      data = data.filter(d => `${d.machine} ${d.ot_numero} ${d.numero}`.toLowerCase().includes(q));
    data.sort((a, b) => new Date(b.date_planifiee) - new Date(a.date_planifiee));
    const admin = isAdmin();
    tbody.innerHTML = data.length
      ? data.map(i => `<tr>
          <td><a href="#" onclick="GMAO.ui.viewIntervention('${i.id}');return false">${esc(i.numero)}</a></td>
          <td>${esc(i.ot_numero)}</td>
          <td class="small">${esc(i.machine)}</td>
          <td class="small">${esc(i.equipe)}</td>
          <td class="small">${fmtDate(i.date_planifiee)}</td>
          <td class="small">${i.date_debut ? fmtDT(i.date_debut) : '–'}</td>
          <td>${i.duree_reelle ? i.duree_reelle + ' h' : '–'}</td>
          <td>${badge(INT_STATUS, i.status)}</td>
          <td class="tbl-action-col">
            ${admin && i.status === 'planifiée' ? `<button class="btn btn-sm btn-outline-warning me-1" onclick="GMAO.actions.demarrerIntervention('${i.id}')" title="Démarrer">
              <i class="bi bi-play-fill"></i></button>` : ''}
            ${admin && i.status === 'en_cours' ? `<button class="btn btn-sm btn-outline-success me-1" onclick="GMAO.actions.terminerIntervention('${i.id}')" title="Terminer et créer rapport">
              <i class="bi bi-check2-circle"></i></button>` : ''}
            <button class="btn btn-sm btn-outline-secondary" onclick="GMAO.ui.viewIntervention('${i.id}')">
              <i class="bi bi-eye"></i></button>
          </td>
        </tr>`).join('')
      : '<tr><td colspan="9" class="text-muted text-center py-4">Aucune intervention.</td></tr>';
  },

  rapports() {
    const tbody = sel('tblRapports')?.querySelector('tbody');
    if (!tbody) return;
    let data = gRead('rapport');
    const machine = sel('rapFltMachine')?.value || '';
    const monthV  = sel('rapFltMonth')?.value   || '';
    const q       = (sel('rapFltSearch')?.value || '').trim().toLowerCase();
    if (machine) data = data.filter(d => d.machine === machine);
    if (monthV) {
      const [y, m] = monthV.split('-').map(Number);
      data = data.filter(d => {
        const dt = new Date(d.date_rapport);
        return dt.getFullYear() === y && (dt.getMonth() + 1) === m;
      });
    }
    if (q) data = data.filter(d => `${d.int_numero} ${d.machine} ${d.travaux} ${d.observations}`.toLowerCase().includes(q));
    data.sort((a, b) => new Date(b.date_rapport) - new Date(a.date_rapport));
    const admin = isAdmin();
    tbody.innerHTML = data.length
      ? data.map(r => `<tr>
          <td>${esc(r.numero)}</td>
          <td>${esc(r.int_numero)}</td>
          <td class="small">${esc(r.machine)}</td>
          <td class="small">${fmtDate(r.date_rapport)}</td>
          <td class="small" style="max-width:200px">${esc(r.travaux)}</td>
          <td class="small" style="max-width:180px">${esc(r.observations)}</td>
          <td>${r.valide ? '<span class="badge bg-success">Validé</span>' : '<span class="badge bg-secondary">Brouillon</span>'}</td>
          <td class="tbl-action-col">
            <button class="btn btn-sm btn-outline-secondary me-1" onclick="GMAO.ui.viewRapport('${r.id}')">
              <i class="bi bi-eye"></i></button>
            ${admin && !r.valide ? `<button class="btn btn-sm btn-outline-success" onclick="GMAO.actions.validerRapport('${r.id}')">
              <i class="bi bi-check-circle me-1"></i>Valider</button>` : ''}
          </td>
        </tr>`).join('')
      : '<tr><td colspan="8" class="text-muted text-center py-4">Aucun rapport d\'intervention.</td></tr>';
  },
};

// ─── UI (forms & detail views) ────────────────────────────────────────────────

const UI = {

  openDT(id = null) {
    const item = id ? gFind('dt', id) : null;
    const v    = k => item ? (item[k] ?? '') : '';
    const title = id ? `Modifier DT — ${esc(item?.numero)}` : 'Nouvelle Demande de Travaux';

    const body = `
      <form id="dtForm">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Machine <span class="text-danger">*</span></label>
            <select class="form-select" id="dt_machine" required>
              ${buildSelect(MACHINES, v('machine'), '— Sélectionner —')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Type <span class="text-danger">*</span></label>
            <select class="form-select" id="dt_type" required>
              ${buildSelect(DT_TYPES, v('type'), '— Sélectionner —')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">Priorité <span class="text-danger">*</span></label>
            <select class="form-select" id="dt_priorite" required>
              ${buildSelect(PRIORITES, v('priorite'), '— Sélectionner —')}
            </select>
          </div>
          <div class="col-12">
            <label class="form-label">Description de la défaillance / travaux <span class="text-danger">*</span></label>
            <textarea class="form-control" id="dt_description" rows="3" required>${esc(v('description'))}</textarea>
          </div>
          <div class="col-md-6">
            <label class="form-label">Émetteur</label>
            <input class="form-control" id="dt_emetteur" value="${escAttr(v('emetteur'))}">
          </div>
          <div class="col-md-6">
            <label class="form-label">Date d'émission</label>
            <input type="date" class="form-control" id="dt_date_emission"
              value="${v('date_emission') ? new Date(v('date_emission')).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)}">
          </div>
          <div class="col-12">
            <label class="form-label">Observations / contexte</label>
            <textarea class="form-control" id="dt_observations" rows="2">${esc(v('observations'))}</textarea>
          </div>
        </div>
      </form>`;

    const footer = `<button class="btn btn-primary" onclick="GMAO.actions.saveDT('${id || ''}')">
      <i class="bi bi-save me-1"></i>Enregistrer</button>`;
    showModal(title, body, footer);
  },

  viewDT(id) {
    const d = gFind('dt', id);
    if (!d) return;
    const linkedBTs = gRead('bt').filter(b => b.dt_id === id);
    const linkedOTs = gRead('ot').filter(o => o.dt_id === id);

    const body = `
      <div class="row g-3 mb-3">
        <div class="col-md-4"><div class="text-muted small">Numéro</div><div class="fw-semibold">${esc(d.numero)}</div></div>
        <div class="col-md-4"><div class="text-muted small">Machine</div><div class="fw-semibold">${esc(d.machine)}</div></div>
        <div class="col-md-4"><div class="text-muted small">Type</div><div>${esc(d.type)}</div></div>
        <div class="col-md-4"><div class="text-muted small">Priorité</div><div>${priorityBadge(d.priorite)}</div></div>
        <div class="col-md-4"><div class="text-muted small">Statut</div><div>${badge(DT_STATUS, d.status)}</div></div>
        <div class="col-md-4"><div class="text-muted small">Émetteur</div><div>${esc(d.emetteur || '–')}</div></div>
        <div class="col-md-4"><div class="text-muted small">Date émission</div><div>${fmtDate(d.date_emission)}</div></div>
        <div class="col-12"><div class="text-muted small">Description</div><div>${esc(d.description)}</div></div>
        ${d.observations ? `<div class="col-12"><div class="text-muted small">Observations</div><div>${esc(d.observations)}</div></div>` : ''}
      </div>
      ${linkedBTs.length ? `<h6 class="mt-3">Bons de Travail liés</h6>
        <ul class="list-group list-group-sm mb-2">${linkedBTs.map(b =>
          `<li class="list-group-item d-flex justify-content-between"><span>${esc(b.numero)}</span>${badge(BT_STATUS, b.status)}</li>`).join('')}
        </ul>` : ''}
      ${linkedOTs.length ? `<h6 class="mt-3">Ordres de Travail liés</h6>
        <ul class="list-group list-group-sm">${linkedOTs.map(o =>
          `<li class="list-group-item d-flex justify-content-between"><span>${esc(o.numero)} — ${esc(o.equipe)}</span>${badge(OT_STATUS, o.status)}</li>`).join('')}
        </ul>` : ''}

      <div class="mt-3 d-flex gap-2 flex-wrap">
        <div class="fw-semibold small text-muted">Flux de travail :</div>
        <div class="status-flow">
          ${Object.entries(DT_STATUS).map(([k, s]) =>
            `<span class="badge bg-${s.cls} ${s.cls === 'warning' || s.cls === 'info' ? 'text-dark' : ''} ${d.status === k ? 'border border-dark border-2' : 'opacity-50'}">${s.label}</span>
             <span class="arrow small">›</span>`).join('')}
        </div>
      </div>`;

    showDetail(`Fiche DT — ${d.numero}`, body);
  },

  viewOT(id) {
    const o = gFind('ot', id);
    if (!o) return;
    const body = `
      <div class="row g-3">
        <div class="col-md-4"><div class="text-muted small">Numéro OT</div><div class="fw-semibold">${esc(o.numero)}</div></div>
        <div class="col-md-4"><div class="text-muted small">DT liée</div><div>${esc(o.dt_numero)}</div></div>
        <div class="col-md-4"><div class="text-muted small">Machine</div><div>${esc(o.machine)}</div></div>
        <div class="col-md-4"><div class="text-muted small">Équipe</div><div>${esc(o.equipe)}</div></div>
        <div class="col-md-4"><div class="text-muted small">Date planifiée</div><div>${fmtDate(o.date_planifiee)}</div></div>
        <div class="col-md-4"><div class="text-muted small">Durée estimée</div><div>${o.duree_estimee ? o.duree_estimee + ' h' : '–'}</div></div>
        <div class="col-md-4"><div class="text-muted small">Statut</div><div>${badge(OT_STATUS, o.status)}</div></div>
        <div class="col-12"><div class="text-muted small">Description travaux</div><div>${esc(o.description || '–')}</div></div>
      </div>`;
    showDetail(`Fiche OT — ${o.numero}`, body);
  },

  viewIntervention(id) {
    const i = gFind('intervention', id);
    if (!i) return;
    const rapport = gRead('rapport').find(r => r.intervention_id === id);
    const body = `
      <div class="row g-3">
        <div class="col-md-4"><div class="text-muted small">N° Intervention</div><div class="fw-semibold">${esc(i.numero)}</div></div>
        <div class="col-md-4"><div class="text-muted small">OT lié</div><div>${esc(i.ot_numero)}</div></div>
        <div class="col-md-4"><div class="text-muted small">Machine</div><div>${esc(i.machine)}</div></div>
        <div class="col-md-4"><div class="text-muted small">Équipe</div><div>${esc(i.equipe)}</div></div>
        <div class="col-md-4"><div class="text-muted small">Date planifiée</div><div>${fmtDate(i.date_planifiee)}</div></div>
        <div class="col-md-4"><div class="text-muted small">Date début</div><div>${fmtDT(i.date_debut)}</div></div>
        <div class="col-md-4"><div class="text-muted small">Durée réelle</div><div>${i.duree_reelle ? i.duree_reelle + ' h' : '–'}</div></div>
        <div class="col-md-4"><div class="text-muted small">Statut</div><div>${badge(INT_STATUS, i.status)}</div></div>
        <div class="col-12"><div class="text-muted small">Travaux effectués</div><div>${esc(i.travaux || '–')}</div></div>
      </div>
      ${rapport ? `<div class="mt-3 p-3 bg-light rounded border">
        <div class="fw-semibold mb-1"><i class="bi bi-journal-check me-1"></i>Rapport lié : ${esc(rapport.numero)}</div>
        <div class="small text-muted">Date : ${fmtDate(rapport.date_rapport)}</div>
        <div class="small mt-1">${esc(rapport.travaux)}</div>
      </div>` : ''}`;
    showDetail(`Intervention — ${i.numero}`, body);
  },

  viewBSM(id) {
    const b = gFind('bsm', id);
    if (!b) return;
    const body = `
      <div class="row g-3">
        <div class="col-md-4"><div class="text-muted small">N° BSM</div><div class="fw-semibold">${esc(b.numero)}</div></div>
        <div class="col-md-4"><div class="text-muted small">N° Appro</div><div>${esc(b.appro_numero)}</div></div>
        <div class="col-md-4"><div class="text-muted small">OT lié</div><div>${esc(b.ot_numero)}</div></div>
        <div class="col-md-6"><div class="text-muted small">Pièces livrées</div><div>${esc(b.pieces_livrees)}</div></div>
        <div class="col-md-3"><div class="text-muted small">Quantité livrée</div><div>${esc(b.quantite_livree)}</div></div>
        <div class="col-md-3"><div class="text-muted small">Date sortie</div><div>${fmtDate(b.date_sortie)}</div></div>
        ${b.observations ? `<div class="col-12"><div class="text-muted small">Observations</div><div>${esc(b.observations)}</div></div>` : ''}
      </div>`;
    showDetail(`BSM — ${b.numero}`, body);
  },

  viewRapport(id) {
    const r = gFind('rapport', id);
    if (!r) return;
    const body = `
      <div class="row g-3">
        <div class="col-md-4"><div class="text-muted small">N° Rapport</div><div class="fw-semibold">${esc(r.numero)}</div></div>
        <div class="col-md-4"><div class="text-muted small">N° Intervention</div><div>${esc(r.int_numero)}</div></div>
        <div class="col-md-4"><div class="text-muted small">Machine</div><div>${esc(r.machine)}</div></div>
        <div class="col-md-4"><div class="text-muted small">Date rapport</div><div>${fmtDate(r.date_rapport)}</div></div>
        <div class="col-md-4"><div class="text-muted small">Validé</div><div>${r.valide ? '<span class="badge bg-success">Oui</span>' : '<span class="badge bg-secondary">Non</span>'}</div></div>
        <div class="col-12"><div class="text-muted small">Travaux réalisés</div><div class="mt-1 p-2 bg-light rounded">${esc(r.travaux)}</div></div>
        <div class="col-12"><div class="text-muted small">Compte-rendu / Observations</div><div class="mt-1 p-2 bg-light rounded">${esc(r.observations || '–')}</div></div>
        ${r.recommandations ? `<div class="col-12"><div class="text-muted small">Recommandations</div><div class="mt-1 p-2 bg-light rounded">${esc(r.recommandations)}</div></div>` : ''}
      </div>`;
    showDetail(`Rapport d'Intervention — ${r.numero}`, body);
  },
};

// ─── Actions (business logic / workflow) ─────────────────────────────────────

const Actions = {

  saveDT(id) {
    const machine = sel('dt_machine')?.value;
    const type    = sel('dt_type')?.value;
    const priorite= sel('dt_priorite')?.value;
    const desc    = sel('dt_description')?.value?.trim();
    if (!machine || !type || !priorite || !desc) {
      alert('Veuillez remplir les champs obligatoires (Machine, Type, Priorité, Description).');
      return;
    }
    const obj = {
      id:             id || uid(),
      numero:         id ? (gFind('dt', id)?.numero || nextNum('dt', 'DT')) : nextNum('dt', 'DT'),
      machine,
      type,
      priorite,
      description:    desc,
      emetteur:       sel('dt_emetteur')?.value?.trim() || getSession()?.display || '',
      date_emission:  new Date(sel('dt_date_emission')?.value || Date.now()).toISOString(),
      observations:   sel('dt_observations')?.value?.trim() || '',
      status:         id ? (gFind('dt', id)?.status || 'nouvelle') : 'nouvelle',
      created_at:     id ? (gFind('dt', id)?.created_at || new Date().toISOString()) : new Date().toISOString(),
    };
    gUpsert('dt', obj);
    hideModal();
    Render.all();
  },

  removeDT(id) {
    if (!isAdmin()) return;
    if (!confirm('Supprimer cette DT ?')) return;
    gRemove('dt', id);
    Render.all();
  },

  annulerDT(id) {
    if (!isAdmin()) return;
    if (!confirm('Annuler cette DT ?')) return;
    const d = gFind('dt', id);
    if (d) { gUpsert('dt', { ...d, status: 'annulée' }); }
    Render.all();
  },

  // DT → BT + OT (planning step)
  planifierDT(dtId) {
    const dt = gFind('dt', dtId);
    if (!dt) return;

    const body = `
      <div class="alert alert-info small mb-3">
        <i class="bi bi-info-circle me-1"></i>
        Planifier la DT <strong>${esc(dt.numero)}</strong> va créer un <strong>Bon de Travail (BT)</strong>
        et un <strong>Ordre de Travail (OT)</strong>.
      </div>
      <form id="planForm">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Date planifiée <span class="text-danger">*</span></label>
            <input type="date" class="form-control" id="plan_date" required
              min="${new Date().toISOString().slice(0,10)}"
              value="${new Date().toISOString().slice(0,10)}">
          </div>
          <div class="col-md-6">
            <label class="form-label">Équipe d'intervention <span class="text-danger">*</span></label>
            <select class="form-select" id="plan_equipe" required>
              ${buildSelect(EQUIPES, '', '— Sélectionner —')}
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label">Durée estimée (h)</label>
            <input type="number" class="form-control" id="plan_duree" min="0" step="0.5" placeholder="ex: 4">
          </div>
          <div class="col-12">
            <label class="form-label">Description travaux</label>
            <textarea class="form-control" id="plan_description" rows="2" placeholder="Préciser les travaux à effectuer…">${esc(dt.description)}</textarea>
          </div>
          <div class="col-12">
            <label class="form-label">Dossier de préparation (référence)</label>
            <input class="form-control" id="plan_dossier" placeholder="ex: DP-2026-0001">
          </div>
        </div>
      </form>`;

    const footer = `<button class="btn btn-primary" onclick="GMAO.actions._confirmPlanifier('${dtId}')">
      <i class="bi bi-calendar-check me-1"></i>Confirmer la planification</button>`;
    showModal(`Planifier — ${dt.numero}`, body, footer);
  },

  _confirmPlanifier(dtId) {
    const dt     = gFind('dt', dtId);
    if (!dt) return;
    const date   = sel('plan_date')?.value;
    const equipe = sel('plan_equipe')?.value;
    if (!date || !equipe) { alert('Date et équipe sont requis.'); return; }

    // Create BT
    const bt = {
      id:            uid(),
      numero:        nextNum('bt', 'BT'),
      dt_id:         dtId,
      dt_numero:     dt.numero,
      machine:       dt.machine,
      date_creation: new Date().toISOString(),
      date_planifiee:new Date(date).toISOString(),
      status:        'créé',
      dossier_prepa: sel('plan_dossier')?.value?.trim() || '',
    };
    gUpsert('bt', bt);

    // Create OT
    const ot = {
      id:            uid(),
      numero:        nextNum('ot', 'OT'),
      dt_id:         dtId,
      dt_numero:     dt.numero,
      bt_id:         bt.id,
      bt_numero:     bt.numero,
      machine:       dt.machine,
      equipe,
      date_planifiee:new Date(date).toISOString(),
      duree_estimee: parseFloat(sel('plan_duree')?.value || '0') || null,
      description:   sel('plan_description')?.value?.trim() || dt.description,
      status:        'créé',
    };
    gUpsert('ot', ot);

    // Update DT status
    gUpsert('dt', { ...dt, status: 'planifiée' });

    hideModal();
    Render.all();
    alert(`✅ Planification effectuée :\n• ${bt.numero} créé\n• ${ot.numero} créé\nDT marquée "Planifiée".`);
  },

  transmettreBT(id) {
    const b = gFind('bt', id);
    if (!b) return;
    gUpsert('bt', { ...b, status: 'transmis', date_transmission: new Date().toISOString() });
    Render.all();
  },

  preparerBT(id) {
    const b = gFind('bt', id);
    if (!b) return;
    gUpsert('bt', { ...b, status: 'préparé', date_preparation: new Date().toISOString() });
    Render.all();
  },

  // OT → Demande Approvisionnement
  creerAppro(otId) {
    const ot = gFind('ot', otId);
    if (!ot) return;

    const body = `
      <form id="approForm">
        <div class="row g-3">
          <div class="col-12">
            <label class="form-label">Pièces / Matériaux nécessaires <span class="text-danger">*</span></label>
            <textarea class="form-control" id="appro_pieces" rows="2" required placeholder="ex: Joint d'étanchéité, courroie de transmission…"></textarea>
          </div>
          <div class="col-md-4">
            <label class="form-label">Quantité <span class="text-danger">*</span></label>
            <input class="form-control" id="appro_quantite" required placeholder="ex: 2 unités">
          </div>
          <div class="col-12">
            <label class="form-label">Observations</label>
            <input class="form-control" id="appro_obs" placeholder="Précisions ou urgence…">
          </div>
        </div>
      </form>`;

    const footer = `<button class="btn btn-primary" onclick="GMAO.actions._confirmAppro('${otId}')">
      <i class="bi bi-cart-plus me-1"></i>Créer la demande</button>`;
    showModal(`Demande Approvisionnement — ${ot.numero}`, body, footer);
  },

  _confirmAppro(otId) {
    const ot     = gFind('ot', otId);
    if (!ot) return;
    const pieces = sel('appro_pieces')?.value?.trim();
    const qte    = sel('appro_quantite')?.value?.trim();
    if (!pieces || !qte) { alert('Pièces et quantité sont requis.'); return; }

    const appro = {
      id:          uid(),
      numero:      nextNum('appro', 'APP'),
      ot_id:       otId,
      ot_numero:   ot.numero,
      machine:     ot.machine,
      pieces,
      quantite:    qte,
      observations:sel('appro_obs')?.value?.trim() || '',
      date_demande:new Date().toISOString(),
      status:      'en_attente',
    };
    gUpsert('appro', appro);
    gUpsert('ot', { ...ot, status: 'approvisionnement' });

    hideModal();
    Render.all();
  },

  // Appro → BSM (livraison depuis magasin)
  livrerAppro(approId) {
    const appro = gFind('appro', approId);
    if (!appro) return;

    const body = `
      <form id="bsmForm">
        <div class="row g-3">
          <div class="col-12">
            <label class="form-label">Pièces livrées <span class="text-danger">*</span></label>
            <textarea class="form-control" id="bsm_pieces" rows="2" required>${esc(appro.pieces)}</textarea>
          </div>
          <div class="col-md-4">
            <label class="form-label">Quantité livrée <span class="text-danger">*</span></label>
            <input class="form-control" id="bsm_quantite" required value="${escAttr(appro.quantite)}">
          </div>
          <div class="col-md-4">
            <label class="form-label">Date de sortie</label>
            <input type="date" class="form-control" id="bsm_date" value="${new Date().toISOString().slice(0,10)}">
          </div>
          <div class="col-12">
            <label class="form-label">Observations</label>
            <input class="form-control" id="bsm_obs" placeholder="Remarques magasin…">
          </div>
        </div>
      </form>`;

    const footer = `<button class="btn btn-success" onclick="GMAO.actions._confirmBSM('${approId}')">
      <i class="bi bi-box-arrow-right me-1"></i>Confirmer la sortie</button>`;
    showModal(`Bon de Sortie Matériel — ${appro.numero}`, body, footer);
  },

  _confirmBSM(approId) {
    const appro = gFind('appro', approId);
    if (!appro) return;
    const pieces = sel('bsm_pieces')?.value?.trim();
    const qte    = sel('bsm_quantite')?.value?.trim();
    if (!pieces || !qte) { alert('Pièces et quantité sont requis.'); return; }

    const bsm = {
      id:             uid(),
      numero:         nextNum('bsm', 'BSM'),
      appro_id:       approId,
      appro_numero:   appro.numero,
      ot_id:          appro.ot_id,
      ot_numero:      appro.ot_numero,
      pieces_livrees: pieces,
      quantite_livree:qte,
      date_sortie:    new Date(sel('bsm_date')?.value || Date.now()).toISOString(),
      observations:   sel('bsm_obs')?.value?.trim() || '',
    };
    gUpsert('bsm', bsm);
    gUpsert('appro', { ...appro, status: 'livré', bsm_id: bsm.id });

    hideModal();
    Render.all();
  },

  // OT → Intervention (lancement)
  lancerOT(otId) {
    const ot = gFind('ot', otId);
    if (!ot) return;

    const body = `
      <div class="alert alert-warning small mb-3">
        <i class="bi bi-exclamation-triangle me-1"></i>
        Lancer l'OT <strong>${esc(ot.numero)}</strong> va créer une <strong>Intervention</strong>
        affectée à l'équipe <strong>${esc(ot.equipe)}</strong>.
      </div>
      <form id="intForm">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Équipe</label>
            <select class="form-select" id="int_equipe">
              ${buildSelect(EQUIPES, ot.equipe, '— Sélectionner —')}
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label">Date planifiée</label>
            <input type="date" class="form-control" id="int_date_plan"
              value="${ot.date_planifiee ? new Date(ot.date_planifiee).toISOString().slice(0,10) : new Date().toISOString().slice(0,10)}">
          </div>
          <div class="col-12">
            <label class="form-label">Consignes de sécurité / instructions</label>
            <textarea class="form-control" id="int_consignes" rows="2" placeholder="Consignes, outillage requis…"></textarea>
          </div>
        </div>
      </form>`;

    const footer = `<button class="btn btn-primary" onclick="GMAO.actions._confirmLancerOT('${otId}')">
      <i class="bi bi-play-circle me-1"></i>Lancer</button>`;
    showModal(`Lancer OT — ${ot.numero}`, body, footer);
  },

  _confirmLancerOT(otId) {
    const ot = gFind('ot', otId);
    if (!ot) return;
    const equipe    = sel('int_equipe')?.value;
    const datePlan  = sel('int_date_plan')?.value;
    const consignes = sel('int_consignes')?.value?.trim() || '';
    if (!equipe) { alert('Équipe requise.'); return; }

    const intervention = {
      id:            uid(),
      numero:        nextNum('intervention', 'INT'),
      ot_id:         otId,
      ot_numero:     ot.numero,
      dt_id:         ot.dt_id,
      machine:       ot.machine,
      equipe,
      consignes,
      date_planifiee:datePlan ? new Date(datePlan).toISOString() : new Date().toISOString(),
      date_debut:    null,
      date_fin:      null,
      duree_reelle:  null,
      travaux:       '',
      status:        'planifiée',
    };
    gUpsert('intervention', intervention);
    gUpsert('ot', { ...ot, status: 'lancé', equipe });

    // Update DT to en_cours
    const dt = gFind('dt', ot.dt_id);
    if (dt && dt.status !== 'clôturée') {
      gUpsert('dt', { ...dt, status: 'en_cours' });
    }

    hideModal();
    Render.all();
  },

  demarrerIntervention(id) {
    const i = gFind('intervention', id);
    if (!i) return;
    gUpsert('intervention', { ...i, status: 'en_cours', date_debut: new Date().toISOString() });
    Render.all();
  },

  terminerIntervention(id) {
    const i = gFind('intervention', id);
    if (!i) return;

    const body = `
      <form id="finIntForm">
        <div class="row g-3">
          <div class="col-md-4">
            <label class="form-label">Durée réelle (h) <span class="text-danger">*</span></label>
            <input type="number" class="form-control" id="fin_duree" min="0" step="0.5" required placeholder="ex: 3.5">
          </div>
          <div class="col-12">
            <label class="form-label">Travaux réalisés <span class="text-danger">*</span></label>
            <textarea class="form-control" id="fin_travaux" rows="3" required
              placeholder="Décrire les travaux effectués, pièces remplacées…"></textarea>
          </div>
          <div class="col-12">
            <label class="form-label">Observations / Compte-rendu</label>
            <textarea class="form-control" id="fin_observations" rows="2"
              placeholder="Anomalies constatées, état après intervention…"></textarea>
          </div>
          <div class="col-12">
            <label class="form-label">Recommandations</label>
            <textarea class="form-control" id="fin_recommandations" rows="2"
              placeholder="Actions à planifier, préventif à mettre en place…"></textarea>
          </div>
        </div>
      </form>`;

    const footer = `<button class="btn btn-success" onclick="GMAO.actions._confirmTerminer('${id}')">
      <i class="bi bi-check2-circle me-1"></i>Terminer et créer le rapport</button>`;
    showModal(`Terminer Intervention — ${i.numero}`, body, footer);
  },

  _confirmTerminer(intId) {
    const i      = gFind('intervention', intId);
    if (!i) return;
    const duree  = parseFloat(sel('fin_duree')?.value || '0');
    const travaux= sel('fin_travaux')?.value?.trim();
    if (!duree || !travaux) { alert('Durée et travaux réalisés sont requis.'); return; }

    const now = new Date().toISOString();

    // Update intervention
    gUpsert('intervention', {
      ...i, status:'terminée', date_fin: now,
      duree_reelle: duree, travaux,
      observations: sel('fin_observations')?.value?.trim() || '',
    });

    // Create rapport
    const rapport = {
      id:              uid(),
      numero:          nextNum('rapport', 'RAP'),
      intervention_id: intId,
      int_numero:      i.numero,
      ot_id:           i.ot_id,
      machine:         i.machine,
      equipe:          i.equipe,
      date_rapport:    now,
      travaux,
      observations:    sel('fin_observations')?.value?.trim() || '',
      recommandations: sel('fin_recommandations')?.value?.trim() || '',
      valide:          false,
    };
    gUpsert('rapport', rapport);

    // Update OT
    const ot = gFind('ot', i.ot_id);
    if (ot) gUpsert('ot', { ...ot, status: 'terminé', date_fin: now });

    // Update DT
    const dt = gFind('dt', i.dt_id);
    if (dt) gUpsert('dt', { ...dt, status: 'clôturée', date_cloture: now });

    hideModal();
    Render.all();
    alert(`✅ Intervention terminée.\n• Rapport ${rapport.numero} créé\n• DT clôturée\n• OT terminé`);
  },

  validerRapport(id) {
    const r = gFind('rapport', id);
    if (!r) return;
    if (!confirm('Valider ce rapport définitivement ?')) return;
    gUpsert('rapport', { ...r, valide: true, date_validation: new Date().toISOString() });
    Render.all();
  },
};

// ─── Filters ──────────────────────────────────────────────────────────────────

const Filters = {
  resetDT() {
    ['dtFltMachine','dtFltType','dtFltStatus','dtFltSearch'].forEach(id => {
      const el = sel(id);
      if (el) el.value = '';
    });
    Render.dt();
  },
  resetRap() {
    ['rapFltMachine','rapFltMonth','rapFltSearch'].forEach(id => {
      const el = sel(id);
      if (el) el.value = '';
    });
    Render.rapports();
  },
};

// ─── Event bindings ───────────────────────────────────────────────────────────

function bindEvents() {
  const live = (id, fn) => { const el = sel(id); if (el) el.addEventListener('input', fn); };
  const liveC = (id, fn) => { const el = sel(id); if (el) el.addEventListener('change', fn); };

  live('dtFltSearch',   () => Render.dt());
  liveC('dtFltMachine', () => Render.dt());
  liveC('dtFltType',    () => Render.dt());
  liveC('dtFltStatus',  () => Render.dt());

  liveC('otFltStatus',  () => Render._ot ? Render._ot() : Render.ordonnancement());
  live('otFltSearch',   () => Render.ordonnancement());

  liveC('intFltStatus', () => Render.interventions());
  liveC('intFltEquipe', () => Render.interventions());
  live('intFltSearch',  () => Render.interventions());

  liveC('rapFltMachine',() => Render.rapports());
  liveC('rapFltMonth',  () => Render.rapports());
  live('rapFltSearch',  () => Render.rapports());
}

// ─── Public API ───────────────────────────────────────────────────────────────

window.GMAO = {
  ui:      UI,
  actions: Actions,
  filters: Filters,
  render:  Render,
};

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  populateSelects();
  bindEvents();
  Render.all();
});
