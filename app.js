// ============================================================
// Diagnostic 360° — Pôle Familles EFSF
// Logique applicative : auth, familles, volets historisés.
// ============================================================

const sb = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);

// Les 7 volets du diagnostic — modifie ce tableau pour ajuster les champs
// sans toucher au reste de la logique.
const VOLETS = [
  { id: 'medical', label: 'Médical & nutrition', color: 'bleu', champs: [
    { key: 'etape_sevrage', label: 'Étape du sevrage', type: 'select', options: [
      'Dépendance totale sonde/cathéter', 'Sevrage engagé', 'Alimentation mixte',
      'Autonomie orale quasi complète', 'Autonomie orale acquise'
    ]},
    { key: 'type_nutrition', label: 'Type de nutrition actuel', type: 'select', options: [
      'Sonde nasogastrique', 'Gastrostomie', 'Cathéter central (parentérale)', 'Mixte', 'Orale exclusive'
    ]},
    { key: 'notes', label: 'Notes (suivi, RDV à venir, points de vigilance)', type: 'textarea' }
  ]},
  { id: 'psychologique', label: 'Psychologique & oralité', color: 'rose', champs: [
    { key: 'suivi_enfant', label: 'Suivi psy enfant en cours', type: 'checkbox' },
    { key: 'suivi_parents', label: 'Suivi psy parents en cours', type: 'checkbox' },
    { key: 'notes', label: 'Notes', type: 'textarea' }
  ]},
  { id: 'social', label: 'Social & familial', color: 'vert', champs: [
    { key: 'droits_ouverts', label: 'Droits ouverts (AEEH, PCH, CMI...)', type: 'text' },
    { key: 'logement_adapte', label: 'Logement adapté', type: 'checkbox' },
    { key: 'notes', label: 'Notes', type: 'textarea' }
  ]},
  { id: 'scolaire', label: 'Scolaire & petite enfance', color: 'orange', champs: [
    { key: 'mode_garde', label: 'Mode de garde / scolarisation', type: 'text' },
    { key: 'pai_en_place', label: 'PAI en place', type: 'checkbox' },
    { key: 'notes', label: 'Notes', type: 'textarea' }
  ]},
  { id: 'fratrie', label: 'Fratrie', color: 'violet', champs: [
    { key: 'impact_repere', label: 'Impact repéré sur la fratrie', type: 'checkbox' },
    { key: 'notes', label: 'Notes', type: 'textarea' }
  ]},
  { id: 'administratif', label: 'Administratif & droits', color: 'bleu', champs: [
    { key: 'dossier_mdph', label: 'Dossier MDPH', type: 'select', options: ['Aucun', 'En cours', 'Accepté', 'À renouveler'] },
    { key: 'notes', label: 'Notes', type: 'textarea' }
  ]},
  { id: 'accompagnement', label: 'Accompagnement EFSF', color: 'rose', champs: [
    { key: 'referent', label: 'Bénévole(s) référent(s)', type: 'text' },
    { key: 'actions_en_cours', label: 'Actions en cours', type: 'textarea' },
    { key: 'notes', label: 'Notes', type: 'textarea' }
  ]}
];

let currentUser = null;
let currentFamilleId = null;
let currentVoletId = null;

function $(id) { return document.getElementById(id); }
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
function relTime(dateStr) {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days < 1) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 30) return `il y a ${days} j`;
  const months = Math.floor(days / 30);
  return `il y a ${months} mois`;
}

// ===== AUTH =====

// Panneau de diagnostic visible sur la page — temporaire, le temps de
// résoudre le souci de connexion (évite de dépendre des DevTools).
function debugLog(msg) {
  const panel = $('debug-panel');
  if (!panel) return;
  panel.style.display = 'block';
  panel.textContent += (panel.textContent ? '\n' : '') + msg;
}

async function ensureProfil(user) {
  debugLog('→ Vérification du profil pour ' + user.email);
  const { data: existing, error: selectErr } = await sb.from('profils').select('*').eq('id', user.id).maybeSingle();
  if (selectErr) { debugLog('✗ Erreur lecture profil : ' + selectErr.message); return null; }
  if (existing) { debugLog('✓ Profil existant trouvé'); return existing; }
  debugLog('→ Aucun profil, création en cours…');
  const { data: created, error } = await sb.from('profils')
    .insert({ id: user.id, nom: user.email.split('@')[0], email: user.email })
    .select().single();
  if (error) { debugLog('✗ Création profil échouée : ' + error.message); console.error('Création profil échouée:', error); return null; }
  debugLog('✓ Profil créé');
  return created;
}

async function initSession() {
  debugLog('Démarrage — URL : ' + window.location.href.replace(/access_token=[^&]+/, 'access_token=***'));
  const { data: { session }, error } = await sb.auth.getSession();
  if (error) debugLog('✗ Erreur getSession : ' + error.message);
  if (session) { debugLog('✓ Session trouvée pour ' + session.user.email); await onLoggedIn(session.user); }
  else { debugLog('✗ Aucune session détectée'); showLogin(); }
}

async function onLoggedIn(user) {
  currentUser = await ensureProfil(user);
  if (!currentUser) { debugLog('✗ onLoggedIn interrompu (pas de profil)'); showLogin(); return; }
  debugLog('✓ Connexion réussie, ouverture de l\'appli');
  $('user-name').textContent = currentUser.nom + (currentUser.role !== 'contributeur' ? ` · ${currentUser.role}` : '');
  $('screen-login').style.display = 'none';
  $('screen-app').style.display = 'block';
  showListView();
}

function showLogin() {
  $('screen-login').style.display = 'flex';
  $('screen-app').style.display = 'none';
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (hash.get('error')) {
    debugLog('✗ Erreur dans le lien : ' + hash.get('error') + ' — ' + (hash.get('error_description') || ''));
  }
}

$('login-btn').addEventListener('click', async () => {
  const email = $('login-email').value.trim();
  if (!email) return;
  $('login-btn').disabled = true;
  $('login-msg').textContent = 'Envoi en cours…';
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
  $('login-btn').disabled = false;
  $('login-msg').textContent = error
    ? 'Erreur : ' + error.message
    : `Lien envoyé à ${email} — ouvre-le depuis ta boîte mail.`;
});

$('logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
  currentUser = null;
  showLogin();
});

sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) onLoggedIn(session.user);
  if (event === 'SIGNED_OUT') showLogin();
});

// ===== VUE LISTE DES FAMILLES =====

async function showListView() {
  $('view-famille').style.display = 'none';
  $('view-list').style.display = 'block';
  const { data, error } = await sb.from('familles')
    .select('*').eq('archive', false).order('created_at', { ascending: false });
  const list = $('familles-list');
  if (error) { list.innerHTML = `<div class="empty-state">Erreur de chargement : ${esc(error.message)}</div>`; return; }
  if (!data.length) { list.innerHTML = '<div class="empty-state">Aucune famille pour le moment.</div>'; return; }
  list.innerHTML = data.map(f => `
    <div class="famille-row" data-id="${f.id}">
      <div>
        <div class="famille-row-code">${esc(f.code_famille)}</div>
        <div class="famille-row-prenom">${esc(f.prenom_enfant || 'Prénom non renseigné')}</div>
      </div>
      <div style="display:flex; align-items:center; gap:10px">
        <span class="tag-consentement ${f.consentement_recueilli ? '' : 'manquant'}">
          ${f.consentement_recueilli ? '✓ Consentement' : '⚠ Consentement manquant'}
        </span>
        <span class="famille-row-arrow">→</span>
      </div>
    </div>`).join('');
  list.querySelectorAll('.famille-row').forEach(row => {
    row.addEventListener('click', () => openFamille(row.dataset.id));
  });
}

$('new-famille-btn').addEventListener('click', () => {
  $('new-code').value = '';
  $('new-prenom').value = '';
  $('new-naissance').value = '';
  $('new-consentement').checked = false;
  $('modal-famille').style.display = 'flex';
});
$('cancel-famille-btn').addEventListener('click', () => { $('modal-famille').style.display = 'none'; });

$('save-famille-btn').addEventListener('click', async () => {
  const code = $('new-code').value.trim();
  if (!code) { alert('Le code famille est requis.'); return; }
  const { error } = await sb.from('familles').insert({
    code_famille: code,
    prenom_enfant: $('new-prenom').value.trim() || null,
    date_naissance: $('new-naissance').value || null,
    consentement_recueilli: $('new-consentement').checked,
    consentement_date: $('new-consentement').checked ? new Date().toISOString().slice(0, 10) : null,
    referent_id: currentUser.id
  });
  if (error) { alert('Erreur : ' + error.message); return; }
  $('modal-famille').style.display = 'none';
  showListView();
});

// ===== VUE FICHE FAMILLE =====

async function openFamille(familleId) {
  currentFamilleId = familleId;
  const { data: famille, error } = await sb.from('familles').select('*').eq('id', familleId).single();
  if (error) { alert('Erreur : ' + error.message); return; }

  $('view-list').style.display = 'none';
  $('view-famille').style.display = 'block';
  $('famille-title').textContent = `${famille.code_famille} — ${famille.prenom_enfant || 'Prénom non renseigné'}`;
  $('famille-meta').textContent = famille.consentement_recueilli
    ? `Consentement recueilli le ${famille.consentement_date || '—'}`
    : '⚠ Consentement non recueilli';

  await sb.from('journal_acces').insert({ famille_id: familleId, profil_id: currentUser.id, action: 'consultation' });
  await renderVolets(familleId);
}

$('back-btn').addEventListener('click', showListView);

async function renderVolets(familleId) {
  const { data: entries } = await sb.from('volet_entries')
    .select('*').eq('famille_id', familleId).order('created_at', { ascending: false });

  const container = $('volets-container');
  container.innerHTML = VOLETS.map(v => {
    const derniere = (entries || []).find(e => e.volet === v.id);
    return `
      <div class="volet-card c-${v.color}" data-volet="${v.id}">
        <div class="volet-card-head">
          <div class="volet-card-title">${esc(v.label)}</div>
          <button class="volet-add-btn" data-volet="${v.id}">+ Mettre à jour</button>
        </div>
        ${derniere
          ? `<div class="volet-last-entry">${formatEntry(v, derniere.contenu)}</div>
             <div class="volet-meta">Mis à jour ${relTime(derniere.created_at)}</div>`
          : '<div class="volet-empty">Pas encore renseigné.</div>'}
      </div>`;
  }).join('');

  container.querySelectorAll('.volet-add-btn').forEach(btn => {
    btn.addEventListener('click', () => openEntryModal(btn.dataset.volet));
  });
}

function formatEntry(volet, contenu) {
  return volet.champs
    .filter(c => contenu[c.key] !== undefined && contenu[c.key] !== '' && contenu[c.key] !== false)
    .map(c => {
      const val = contenu[c.key];
      const shown = c.type === 'checkbox' ? '✓' : esc(val);
      return `<strong>${esc(c.label)} :</strong> ${shown}`;
    }).join('<br>');
}

// ===== MODALE : ajouter une entrée =====

function openEntryModal(voletId) {
  currentVoletId = voletId;
  const volet = VOLETS.find(v => v.id === voletId);
  $('entry-modal-title').textContent = volet.label;
  $('entry-fields').innerHTML = volet.champs.map(c => {
    if (c.type === 'select') {
      return `<label class="field-label">${esc(c.label)}</label>
        <select class="input" data-key="${c.key}">
          <option value="">—</option>
          ${c.options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
        </select>`;
    }
    if (c.type === 'checkbox') {
      return `<label class="checkbox-line"><input type="checkbox" data-key="${c.key}"> ${esc(c.label)}</label>`;
    }
    if (c.type === 'textarea') {
      return `<label class="field-label">${esc(c.label)}</label>
        <textarea class="input" data-key="${c.key}"></textarea>`;
    }
    return `<label class="field-label">${esc(c.label)}</label>
      <input type="text" class="input" data-key="${c.key}">`;
  }).join('');
  $('modal-entry').style.display = 'flex';
}

$('cancel-entry-btn').addEventListener('click', () => { $('modal-entry').style.display = 'none'; });

$('save-entry-btn').addEventListener('click', async () => {
  const volet = VOLETS.find(v => v.id === currentVoletId);
  const contenu = {};
  volet.champs.forEach(c => {
    const el = document.querySelector(`#entry-fields [data-key="${c.key}"]`);
    contenu[c.key] = c.type === 'checkbox' ? el.checked : el.value.trim();
  });

  const { error } = await sb.from('volet_entries').insert({
    famille_id: currentFamilleId,
    volet: currentVoletId,
    contenu,
    auteur_id: currentUser.id
  });
  if (error) { alert('Erreur : ' + error.message); return; }

  await sb.from('journal_acces').insert({
    famille_id: currentFamilleId, profil_id: currentUser.id, action: 'modification', volet: currentVoletId
  });

  $('modal-entry').style.display = 'none';
  renderVolets(currentFamilleId);
});

// ===== DÉMARRAGE =====
initSession();
