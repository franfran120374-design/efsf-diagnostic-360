// ============================================================
// Diagnostic 360° — Pôle Familles EFSF
// Logique applicative : auth, familles, volets historisés.
// ============================================================

const sb = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);

// Les 7 volets du diagnostic — modifie ce tableau pour ajuster les champs
// sans toucher au reste de la logique.
// ⚠️ SOURCE UNIQUE : la popup d'aide (bouton « ❔ Aide ») est générée à partir
// de ce tableau. Ajouter/retirer un volet ou un champ met l'aide à jour tout
// seul, sans rien écrire ailleurs.
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

// Les 3 rôles — SOURCE UNIQUE aussi (aide + écran Coordination). Modifier
// ici met à jour l'explication des rôles dans la popup automatiquement.
const ROLES = [
  { id: 'coordinateur', label: 'Coordinateur',
    desc: "Voit toutes les familles, gère les accès et les rôles, exporte les synthèses." },
  { id: 'benevole_referent', label: 'Bénévole référent',
    desc: "Crée des fiches familles et remplit tous les volets de ses propres familles." },
  { id: 'contributeur', label: 'Contributeur',
    desc: "Accès uniquement aux volets précis d'une famille pour lesquels il a été invité (ex : un pro sur le seul volet médical)." }
];
function roleLabel(id) { const r = ROLES.find(r => r.id === id); return r ? r.label : id; }

// Date de la dernière évolution du contenu du guide (à bumper quand on
// change le texte d'intro / confidentialité — pas nécessaire pour les
// volets/rôles, qui se régénèrent seuls).
const GUIDE_MAJ = '7 juillet 2026';

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

// Panneau de diagnostic — désactivé par défaut. Il ne s'affiche que si on
// ouvre l'appli avec ?debug=1 dans l'URL (pour ne jamais exposer d'e-mails
// ni d'infos de session sur l'écran de connexion en usage normal).
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
function debugLog(msg) {
  if (!DEBUG) return;
  const panel = $('debug-panel');
  if (!panel) return;
  panel.style.display = 'block';
  panel.textContent += (panel.textContent ? '\n' : '') + msg;
}

// Récupère le profil (créé côté base par le trigger à l'inscription).
// Aucun insert ici : le rôle ne peut donc pas être auto-attribué depuis le
// navigateur. Petite boucle de retry le temps que le trigger ait tourné.
async function fetchProfil(user, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const { data, error } = await sb.from('profils').select('*').eq('id', user.id).maybeSingle();
    if (error) debugLog('lecture profil : ' + error.message);
    if (data) return data;
    await new Promise(r => setTimeout(r, 400));
  }
  return null;
}

async function initSession() {
  debugLog('Démarrage');
  const { data: { session }, error } = await sb.auth.getSession();
  if (error) debugLog('getSession : ' + error.message);
  if (session) { debugLog('session trouvée'); await onLoggedIn(session.user); }
  else { debugLog('aucune session'); showLogin(); }
}

async function onLoggedIn(user) {
  currentUser = await fetchProfil(user);
  if (!currentUser) {
    // Compte authentifié mais e-mail non pré-inscrit → aucun accès.
    debugLog('profil absent : accès non autorisé');
    await sb.auth.signOut();
    setMode('login');
    showLogin();
    $('login-msg').textContent =
      "Ton accès n'est pas encore autorisé. Demande à la coordinatrice de t'ajouter à la liste, puis reconnecte-toi.";
    return;
  }
  debugLog('connexion réussie');
  $('user-name').textContent =
    currentUser.nom + (currentUser.role !== 'contributeur' ? ` · ${roleLabel(currentUser.role)}` : '');
  // Écran Coordination réservé à la coordinatrice.
  $('coord-btn').style.display = currentUser.role === 'coordinateur' ? '' : 'none';
  $('screen-login').style.display = 'none';
  $('screen-app').style.display = 'block';
  showListView();
}

function showLogin() {
  $('screen-login').style.display = 'flex';
  $('screen-app').style.display = 'none';
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (hash.get('error')) {
    debugLog('erreur lien : ' + hash.get('error'));
  }
}

// Connexion par e-mail + mot de passe : robuste et instantané, sans dépendre
// de l'envoi d'e-mails (les codes/liens à usage unique étaient consommés par
// les scanners de sécurité des messageries pro ou bloqués par le réseau).
// Deux modes : "connexion" (compte existant) ou "création d'accès" (nouveau).
let mode = 'login'; // 'login' | 'signup'

function setMode(m) {
  mode = m;
  if (m === 'signup') {
    $('login-mode-hint').textContent = 'Choisis un mot de passe (min. 6 caractères) pour créer ton accès.';
    $('login-btn').textContent = 'Créer mon accès';
    $('signup-toggle').textContent = 'J\'ai déjà un accès — me connecter';
    $('login-password').setAttribute('autocomplete', 'new-password');
  } else {
    $('login-mode-hint').textContent = 'Entre ton e-mail et ton mot de passe pour te connecter.';
    $('login-btn').textContent = 'Se connecter';
    $('signup-toggle').textContent = 'Première fois ? Créer mon accès';
    $('login-password').setAttribute('autocomplete', 'current-password');
  }
  $('login-msg').textContent = '';
}

$('signup-toggle').addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));

async function submitAuth() {
  const email = $('login-email').value.trim().toLowerCase();
  const password = $('login-password').value;
  if (!email || !password) { $('login-msg').textContent = 'E-mail et mot de passe requis.'; return; }
  if (mode === 'signup' && password.length < 6) { $('login-msg').textContent = 'Le mot de passe doit faire au moins 6 caractères.'; return; }

  $('login-btn').disabled = true;
  $('login-msg').textContent = mode === 'signup' ? 'Création…' : 'Connexion…';
  debugLog(mode === 'signup' ? 'création…' : 'connexion…');

  let data, error;
  try {
    if (mode === 'signup') {
      ({ data, error } = await sb.auth.signUp({ email, password }));
    } else {
      ({ data, error } = await sb.auth.signInWithPassword({ email, password }));
    }
  } catch (e) { error = e; }

  $('login-btn').disabled = false;

  if (error) {
    debugLog('échec — status:' + (error.status || '?') + ' code:' + (error.code || '?'));
    if (error.message && /already registered/i.test(error.message)) {
      $('login-msg').textContent = 'Ce compte existe déjà — clique sur « J\'ai déjà un accès » pour te connecter.';
    } else if (error.message && /Invalid login credentials/i.test(error.message)) {
      $('login-msg').textContent = 'E-mail ou mot de passe incorrect.';
    } else {
      $('login-msg').textContent = 'Erreur : ' + error.message;
    }
    return;
  }

  if (!data.session) {
    // Cas où la confirmation e-mail est encore activée côté Supabase
    debugLog('pas de session (confirmation e-mail probablement activée)');
    $('login-msg').textContent = 'Compte créé, mais la confirmation par e-mail est activée. Désactive-la dans Supabase pour une connexion directe.';
    return;
  }

  $('login-msg').textContent = '';
  debugLog('authentifié');
  await onLoggedIn(data.user);
}

$('login-btn').addEventListener('click', submitAuth);
$('login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });

$('logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
  currentUser = null;
  showLogin();
});

// ===== POPUP AIDE (générée depuis VOLETS + ROLES) =====
// Se met à jour toute seule : elle lit les mêmes tableaux que l'appli, donc
// elle reflète toujours les volets et rôles réellement en place.

function openHelp() {
  const volets = VOLETS.map(v => `
    <div class="help-volet c-${v.color}">
      <div class="help-volet-title">${esc(v.label)}</div>
      <div class="help-volet-champs">${v.champs.map(c => esc(c.label)).join(' · ')}</div>
    </div>`).join('');
  const roles = ROLES.map(r => `
    <div class="help-role">
      <span class="role-chip role-${r.id}">${esc(r.label)}</span>
      <div class="help-role-desc">${esc(r.desc)}</div>
    </div>`).join('');
  $('help-body').innerHTML = `
    <p class="help-intro">Le Diagnostic 360° fait le tour de l'accompagnement d'un enfant et de sa
    famille, volet par volet, pour n'en oublier aucun.</p>

    <h3 class="help-h3">Les ${VOLETS.length} volets</h3>
    <div class="help-volets">${volets}</div>

    <h3 class="help-h3">Qui voit quoi — les rôles</h3>
    <div class="help-roles">${roles}</div>

    <h3 class="help-h3">Confidentialité</h3>
    <p class="help-note">Aucun nom de famille complet n'est stocké : seulement un code famille
    (ex : F-2026-014) et le prénom de l'enfant. Chaque consultation, modification ou export est
    tracé. Un contributeur ne voit que les volets pour lesquels il a été explicitement invité, et
    personne ne peut se donner un rôle à soi-même.</p>

    <div class="help-maj">🔄 Ce guide est généré automatiquement à partir de la configuration de
    l'appli : il reste toujours à jour quand les volets ou les rôles changent. Dernière évolution
    du texte : ${esc(GUIDE_MAJ)}.</div>`;
  $('modal-help').style.display = 'flex';
}

$('help-btn').addEventListener('click', openHelp);
$('close-help-btn').addEventListener('click', () => { $('modal-help').style.display = 'none'; });

// ===== ÉCRAN COORDINATION (coordinateur uniquement) =====

async function openCoord() {
  if (!currentUser || currentUser.role !== 'coordinateur') return;
  $('coord-msg').textContent = '';
  $('modal-coord').style.display = 'flex';
  // Remplir le sélecteur de rôle du formulaire d'ajout
  $('coord-new-role').innerHTML = ROLES.map(r => `<option value="${r.id}">${esc(r.label)}</option>`).join('');
  await renderPreattrib();
  await renderComptes();
}

async function renderPreattrib() {
  const { data, error } = await sb.from('roles_preattribues').select('*').order('created_at', { ascending: false });
  const box = $('coord-preattrib-list');
  if (error) { box.innerHTML = `<div class="coord-empty">Erreur : ${esc(error.message)}</div>`; return; }
  if (!data.length) { box.innerHTML = '<div class="coord-empty">Aucun e-mail pré-inscrit pour le moment.</div>'; return; }
  box.innerHTML = data.map(r => `
    <div class="coord-row">
      <div class="coord-row-main">
        <div class="coord-row-email">${esc(r.email)}</div>
        <span class="role-chip role-${r.role}">${esc(roleLabel(r.role))}</span>
      </div>
      <button class="coord-del" data-email="${esc(r.email)}" title="Retirer de la liste">✕</button>
    </div>`).join('');
  box.querySelectorAll('.coord-del').forEach(b =>
    b.addEventListener('click', () => delPreattrib(b.dataset.email)));
}

async function addPreattrib() {
  const email = $('coord-new-email').value.trim().toLowerCase();
  const role = $('coord-new-role').value;
  if (!email || !/.+@.+\..+/.test(email)) { $('coord-msg').textContent = 'Entre un e-mail valide.'; return; }
  const { error } = await sb.from('roles_preattribues')
    .upsert({ email, role, invite_par: currentUser.id }, { onConflict: 'email' });
  if (error) { $('coord-msg').textContent = 'Erreur : ' + error.message; return; }
  $('coord-new-email').value = '';
  $('coord-msg').textContent = `${email} recevra le rôle « ${roleLabel(role)} » en créant son accès.`;
  renderPreattrib();
}

async function delPreattrib(email) {
  const { error } = await sb.from('roles_preattribues').delete().eq('email', email);
  if (error) { $('coord-msg').textContent = 'Erreur : ' + error.message; return; }
  $('coord-msg').textContent = `${email} retiré de la liste (les accès déjà créés ne sont pas supprimés).`;
  renderPreattrib();
}

async function renderComptes() {
  const { data, error } = await sb.from('profils').select('*').order('nom');
  const box = $('coord-comptes-list');
  if (error) { box.innerHTML = `<div class="coord-empty">Erreur : ${esc(error.message)}</div>`; return; }
  if (!data.length) { box.innerHTML = '<div class="coord-empty">Aucun compte créé pour le moment.</div>'; return; }
  box.innerHTML = data.map(p => `
    <div class="coord-row">
      <div class="coord-row-main">
        <div class="coord-row-email">${esc(p.nom)} <span class="coord-row-sub">${esc(p.email)}</span></div>
      </div>
      <select class="coord-role-select" data-id="${esc(p.id)}">
        ${ROLES.map(r => `<option value="${r.id}" ${r.id === p.role ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}
      </select>
    </div>`).join('');
  box.querySelectorAll('.coord-role-select').forEach(sel =>
    sel.addEventListener('change', () => updateRole(sel.dataset.id, sel.value, sel)));
}

async function updateRole(id, role, sel) {
  if (id === currentUser.id && role !== 'coordinateur') {
    if (!confirm('Attention : tu vas retirer ton propre accès coordinateur. Tu ne pourras plus gérer les rôles. Continuer ?')) {
      if (sel) sel.value = 'coordinateur';
      return;
    }
  }
  const { error } = await sb.from('profils').update({ role }).eq('id', id);
  $('coord-msg').textContent = error ? ('Erreur : ' + error.message) : 'Rôle mis à jour.';
}

$('coord-btn').addEventListener('click', openCoord);
$('close-coord-btn').addEventListener('click', () => { $('modal-coord').style.display = 'none'; });
$('coord-add-btn').addEventListener('click', addPreattrib);
$('coord-new-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') addPreattrib(); });

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
