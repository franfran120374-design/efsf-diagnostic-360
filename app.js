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
const OPT_DROIT = ['Non concerné', 'À demander', 'En cours', 'Accordé']; // parcours d'un droit/aide
const VOLETS = [
  { id: 'medical', label: 'Médical & nutrition', color: 'bleu',
    reco: "But : situer où en est l'enfant dans son sevrage et par quel dispositif il est nourri aujourd'hui. Noter l'équipe qui le suit et les prochaines échéances médicales.",
    champs: [
    { key: 'etape_sevrage', label: 'Étape du sevrage', type: 'select',
      aide: "Sevrage = passage progressif de la nutrition artificielle (sonde/cathéter) vers l'alimentation par la bouche.",
      options: [
      'Dépendance totale sonde/cathéter', 'Sevrage engagé', 'Alimentation mixte',
      'Autonomie orale quasi complète', 'Autonomie orale acquise'
    ]},
    { key: 'type_nutrition', label: 'Type de nutrition actuel', type: 'select',
      aide: "Entérale = par une sonde dans le tube digestif (nasogastrique, gastrostomie). Parentérale = par un cathéter dans une veine.",
      options: [
      'Sonde nasogastrique', 'Gastrostomie', 'Cathéter central (parentérale)', 'Mixte', 'Orale exclusive'
    ]},
    { key: 'equipe_suivi', label: 'Équipe hospitalière référente', type: 'text',
      aide: "Service ou hôpital qui suit l'enfant (ex : gastro-pédiatrie du CHU)." },
    { key: 'prochain_rdv', label: 'Prochain rendez-vous médical', type: 'text',
      aide: "Date et spécialité connues, pour anticiper." },
    { key: 'notes', label: 'Notes & points de vigilance', type: 'textarea',
      aide: "Reflux, vomissements, courbe de poids, fatigue…" }
  ]},
  { id: 'psychologique', label: 'Psychologique & oralité', color: 'rose',
    reco: "L'oralité est souvent perturbée après une nutrition artificielle. On regarde le rapport de l'enfant à la nourriture ET le vécu psychologique des parents.",
    champs: [
    { key: 'troubles_oralite', label: "Troubles de l'oralité", type: 'select',
      aide: "Oralité = tout ce qui touche la bouche : manger, goûter, porter à la bouche. Des blocages sont fréquents après une sonde.",
      options: ['Aucun repéré', 'Légers', 'Modérés', 'Importants'] },
    { key: 'suivi_enfant', label: "Suivi psychologique de l'enfant", type: 'select',
      options: ['Aucun', 'Souhaité', 'En cours'] },
    { key: 'type_suivi', label: 'Professionnel qui accompagne', type: 'select',
      aide: "Qui suit l'enfant pour l'oralité / le développement.",
      options: ['Orthophoniste', 'Psychologue', 'Psychomotricien', 'Ergothérapeute', 'Autre'] },
    { key: 'suivi_parents', label: 'Soutien psychologique des parents', type: 'select',
      options: ['Aucun', 'Souhaité', 'En cours'] },
    { key: 'notes', label: 'Notes', type: 'textarea' }
  ]},
  { id: 'social', label: 'Social & familial', color: 'vert',
    reco: "Vérifier que les aides financières liées au handicap/à la maladie sont bien ouvertes, et repérer un éventuel isolement de la famille.",
    champs: [
    { key: 'aeeh', label: 'AEEH', type: 'select', options: OPT_DROIT,
      aide: "AEEH = Allocation d'éducation de l'enfant handicapé, versée par la CAF." },
    { key: 'pch', label: 'PCH', type: 'select', options: OPT_DROIT,
      aide: "PCH = Prestation de compensation du handicap, versée par le département via la MDPH." },
    { key: 'cmi', label: 'CMI', type: 'select', options: OPT_DROIT,
      aide: "CMI = Carte mobilité inclusion (stationnement, priorité, invalidité)." },
    { key: 'logement_adapte', label: 'Logement adapté aux besoins', type: 'select',
      options: ['Oui', 'Non', 'À adapter'] },
    { key: 'isolement', label: 'Isolement de la famille', type: 'select',
      aide: "Entourage et relais disponibles autour des parents (famille, amis, aidants).",
      options: ['Non', 'Léger', 'Important'] },
    { key: 'notes', label: 'Notes', type: 'textarea' }
  ]},
  { id: 'scolaire', label: 'Scolaire & petite enfance', color: 'orange',
    reco: "Mode d'accueil de l'enfant et adaptations mises en place pour sa santé et ses éventuels besoins particuliers.",
    champs: [
    { key: 'mode_garde', label: 'Mode de garde / scolarisation', type: 'select',
      options: ['Domicile (parent)', 'Assistante maternelle', 'Crèche', 'École maternelle', 'École élémentaire', 'Autre'] },
    { key: 'pai', label: 'PAI', type: 'select',
      aide: "PAI = Projet d'accueil individualisé : protocole avec la crèche/l'école pour gérer la santé de l'enfant (repas, sonde, conduite d'urgence).",
      options: ['Non nécessaire', 'À mettre en place', 'En cours', 'En place'] },
    { key: 'aesh', label: 'AESH', type: 'select', options: ['Non concerné', 'À demander', 'En cours', 'En place'],
      aide: "AESH = Accompagnant d'élève en situation de handicap (aide humaine à l'école)." },
    { key: 'notes', label: 'Notes', type: 'textarea' }
  ]},
  { id: 'fratrie', label: 'Fratrie', color: 'violet',
    reco: "Les frères et sœurs sont souvent impactés (attention monopolisée, angoisses, jalousie). On repère un éventuel besoin de soutien.",
    champs: [
    { key: 'presence_fratrie', label: 'Frères et sœurs', type: 'select',
      options: ['Enfant unique', '1 frère/sœur', '2 ou plus'] },
    { key: 'impact', label: 'Impact repéré sur la fratrie', type: 'select',
      options: ['Non repéré', 'À surveiller', 'Impact repéré'] },
    { key: 'soutien', label: 'Soutien pour la fratrie', type: 'select',
      options: ['Non nécessaire', 'Souhaité', 'En place'] },
    { key: 'notes', label: 'Notes', type: 'textarea' }
  ]},
  { id: 'administratif', label: 'Administratif & droits', color: 'bleu',
    reco: "Suivre les dossiers MDPH et les échéances de renouvellement, pour éviter toute rupture de droits.",
    champs: [
    { key: 'dossier_mdph', label: 'Dossier MDPH', type: 'select',
      aide: "MDPH = Maison départementale des personnes handicapées : elle instruit l'AEEH, la PCH, la CMI et les orientations.",
      options: ['Aucun', 'En cours', 'Accepté', 'À renouveler'] },
    { key: 'echeance', label: 'Prochaine échéance / renouvellement', type: 'text',
      aide: "Date à surveiller pour ne pas perdre un droit (fin de validité AEEH, PCH…)." },
    { key: 'besoin_aide_dossier', label: 'Besoin d\'aide pour les démarches', type: 'select',
      options: ['Non', 'Oui — à accompagner'] },
    { key: 'notes', label: 'Notes', type: 'textarea' }
  ]},
  { id: 'accompagnement', label: 'Accompagnement EFSF', color: 'rose',
    reco: "Qui suit la famille côté EFSF, à quel rythme, et quelles sont les priorités du moment.",
    champs: [
    { key: 'referent', label: 'Bénévole(s) référent(s)', type: 'text',
      aide: "Prénom(s) du/des bénévole(s) qui suivent cette famille." },
    { key: 'frequence', label: 'Fréquence de contact', type: 'select',
      options: ['Hebdomadaire', 'Toutes les deux semaines', 'Mensuelle', 'Ponctuelle'] },
    { key: 'priorite', label: 'Priorité du moment', type: 'select',
      options: ['Médical', 'Psychologique', 'Social', 'Scolaire', 'Administratif', 'Écoute / soutien'] },
    { key: 'actions_en_cours', label: 'Actions en cours', type: 'textarea' },
    { key: 'notes', label: 'Notes', type: 'textarea' }
  ]}
];

// Glossaire affiché dans la popup Aide (source unique aussi).
const ACRONYMES = [
  { sigle: 'AEEH', sens: "Allocation d'éducation de l'enfant handicapé (versée par la CAF)." },
  { sigle: 'PCH', sens: 'Prestation de compensation du handicap (département, via la MDPH).' },
  { sigle: 'CMI', sens: 'Carte mobilité inclusion (stationnement, priorité, invalidité).' },
  { sigle: 'MDPH', sens: 'Maison départementale des personnes handicapées (instruit AEEH, PCH, CMI, orientations).' },
  { sigle: 'PAI', sens: "Projet d'accueil individualisé (protocole santé avec la crèche/l'école)." },
  { sigle: 'AESH', sens: "Accompagnant d'élève en situation de handicap (aide humaine à l'école)." },
  { sigle: 'Nutrition entérale', sens: 'Alimentation par une sonde digestive (nasogastrique, gastrostomie).' },
  { sigle: 'Nutrition parentérale', sens: 'Alimentation par un cathéter dans une veine.' },
  { sigle: 'Oralité', sens: "Rapport à la bouche et à l'alimentation (manger, goûter, porter à la bouche)." }
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
const GUIDE_MAJ = '7 juillet 2026 (volets enrichis : menus déroulants, aides, glossaire)';

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

    <h3 class="help-h3">Glossaire</h3>
    <div class="help-glossaire">${ACRONYMES.map(a => `
      <div class="help-acro"><span class="help-acro-sigle">${esc(a.sigle)}</span>${esc(a.sens)}</div>`).join('')}</div>

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
  const recoHtml = volet.reco ? `<div class="volet-reco">🎯 ${esc(volet.reco)}</div>` : '';
  $('entry-fields').innerHTML = recoHtml + volet.champs.map(c => {
    if (c.type === 'select') {
      return `<label class="field-label">${esc(c.label)}</label>${aideHtml(c)}
        <select class="input" data-key="${c.key}">
          <option value="">—</option>
          ${c.options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
        </select>`;
    }
    if (c.type === 'checkbox') {
      return `<label class="checkbox-line"><input type="checkbox" data-key="${c.key}"> ${esc(c.label)}</label>${aideHtml(c)}`;
    }
    if (c.type === 'textarea') {
      return `<label class="field-label">${esc(c.label)}</label>${aideHtml(c)}
        <textarea class="input" data-key="${c.key}"></textarea>`;
    }
    return `<label class="field-label">${esc(c.label)}</label>${aideHtml(c)}
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

// ===== MODE ENTRETIEN (assistant pas à pas) =====
// Déroule les 7 volets un par un, grands champs préremplis, pensé pour
// conduire l'entretien en visio. « Terminer » enregistre tout d'un coup.

let entretienStep = 0;
let entretienData = {};

function latestByVolet(entries) {
  const map = {};
  (entries || []).forEach(e => { if (!map[e.volet]) map[e.volet] = e.contenu; });
  return map;
}

async function startEntretien() {
  const { data: entries } = await sb.from('volet_entries')
    .select('*').eq('famille_id', currentFamilleId).order('created_at', { ascending: false });
  const latest = latestByVolet(entries);
  entretienData = {};
  VOLETS.forEach(v => { entretienData[v.id] = Object.assign({}, latest[v.id] || {}); });
  entretienStep = 0;
  $('entretien-famille').textContent = $('famille-title').textContent;
  renderEntretienStep();
  $('modal-entretien').style.display = 'flex';
}

function aideHtml(c) {
  return c.aide ? `<div class="champ-aide">💡 ${esc(c.aide)}</div>` : '';
}

function champField(c, value) {
  const v = value == null ? '' : value;
  if (c.type === 'select') {
    return `<label class="field-label big">${esc(c.label)}</label>${aideHtml(c)}
      <select class="input big" data-key="${c.key}">
        <option value="">—</option>
        ${c.options.map(o => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}
      </select>`;
  }
  if (c.type === 'checkbox') {
    return `<label class="checkbox-line big"><input type="checkbox" data-key="${c.key}" ${v === true ? 'checked' : ''}> ${esc(c.label)}</label>${aideHtml(c)}`;
  }
  if (c.type === 'textarea') {
    return `<label class="field-label big">${esc(c.label)}</label>${aideHtml(c)}
      <textarea class="input big" data-key="${c.key}">${esc(v)}</textarea>`;
  }
  return `<label class="field-label big">${esc(c.label)}</label>${aideHtml(c)}
    <input type="text" class="input big" data-key="${c.key}" value="${esc(v)}">`;
}

function renderEntretienStep() {
  const volet = VOLETS[entretienStep];
  const data = entretienData[volet.id] || {};
  $('entretien-volet-title').textContent = volet.label;
  $('entretien-progress-text').textContent = `Volet ${entretienStep + 1} / ${VOLETS.length}`;
  $('entretien-progress-bar').style.width = `${((entretienStep + 1) / VOLETS.length) * 100}%`;
  const recoHtml = volet.reco ? `<div class="volet-reco">🎯 ${esc(volet.reco)}</div>` : '';
  $('entretien-fields').innerHTML = recoHtml + volet.champs.map(c => champField(c, data[c.key])).join('');
  $('entretien-fields').scrollTop = 0;
  $('entretien-prev').style.visibility = entretienStep === 0 ? 'hidden' : 'visible';
  $('entretien-next').textContent = entretienStep === VOLETS.length - 1 ? "Terminer l'entretien ✓" : 'Suivant →';
}

function collectEntretienStep() {
  const volet = VOLETS[entretienStep];
  const contenu = entretienData[volet.id] || {};
  volet.champs.forEach(c => {
    const el = document.querySelector(`#entretien-fields [data-key="${c.key}"]`);
    if (!el) return;
    contenu[c.key] = c.type === 'checkbox' ? el.checked : el.value.trim();
  });
  entretienData[volet.id] = contenu;
}

function hasContent(contenu) {
  return Object.values(contenu || {}).some(v => v !== '' && v !== false && v != null);
}

async function finishEntretien() {
  collectEntretienStep();
  const rows = [];
  VOLETS.forEach(v => {
    if (hasContent(entretienData[v.id])) {
      rows.push({ famille_id: currentFamilleId, volet: v.id, contenu: entretienData[v.id], auteur_id: currentUser.id });
    }
  });
  if (rows.length) {
    const { error } = await sb.from('volet_entries').insert(rows);
    if (error) { alert("Erreur à l'enregistrement : " + error.message); return; }
    await sb.from('journal_acces').insert(rows.map(r => ({
      famille_id: currentFamilleId, profil_id: currentUser.id, action: 'modification', volet: r.volet
    })));
  }
  $('modal-entretien').style.display = 'none';
  renderVolets(currentFamilleId);
}

$('entretien-btn').addEventListener('click', startEntretien);
$('entretien-close').addEventListener('click', () => {
  if (confirm('Fermer l\'entretien ? Les réponses non enregistrées (bouton « Terminer ») seront perdues.')) {
    $('modal-entretien').style.display = 'none';
  }
});
$('entretien-prev').addEventListener('click', () => {
  collectEntretienStep();
  if (entretienStep > 0) { entretienStep--; renderEntretienStep(); }
});
$('entretien-next').addEventListener('click', () => {
  if (entretienStep === VOLETS.length - 1) { finishEntretien(); return; }
  collectEntretienStep();
  entretienStep++;
  renderEntretienStep();
});

// ===== EXPORT PDF (impression navigateur) =====

async function exportPdf() {
  const { data: famille, error: fErr } = await sb.from('familles').select('*').eq('id', currentFamilleId).single();
  if (fErr) { alert('Erreur : ' + fErr.message); return; }
  const { data: entries } = await sb.from('volet_entries')
    .select('*').eq('famille_id', currentFamilleId).order('created_at', { ascending: false });
  const latest = latestByVolet(entries);
  const today = new Date().toLocaleDateString('fr-FR');

  const voletsHtml = VOLETS.map((v, i) => {
    const c = latest[v.id];
    const lignes = c ? v.champs
      .filter(ch => c[ch.key] !== undefined && c[ch.key] !== '' && c[ch.key] !== false)
      .map(ch => `<div class="pa-champ"><span class="pa-k">${esc(ch.label)} :</span> ${ch.type === 'checkbox' ? 'Oui' : esc(c[ch.key])}</div>`)
      .join('') : '';
    const reco = v.reco ? `<div class="pa-reco">${esc(v.reco)}</div>` : '';
    return `<div class="pa-volet c-${v.color}">
      <div class="pa-volet-head"><span class="pa-volet-num">${i + 1}</span><h3>${esc(v.label)}</h3></div>
      <div class="pa-volet-body">${reco}${lignes || '<div class="pa-empty">— non renseigné à ce jour —</div>'}</div>
    </div>`;
  }).join('');

  const logo = window.LOGO_EFSF ? `<img class="pa-logo" src="${window.LOGO_EFSF}" alt="">` : '';
  const consoClass = famille.consentement_recueilli ? '' : 'manquant';
  const consoTxt = famille.consentement_recueilli
    ? 'Consentement recueilli' + (famille.consentement_date ? ' le ' + esc(famille.consentement_date) : '')
    : 'Consentement à recueillir';

  const signatures = [
    'Parent(s) / responsable légal',
    'Bénévole référent',
    'Coordinateur / coordinatrice',
    'Président(e)'
  ].map(role => `
    <div class="pa-sign">
      <div class="pa-sign-role">${esc(role)}</div>
      <div class="pa-sign-name">Nom : ____________________</div>
      <div class="pa-sign-space">Signature &amp; date</div>
    </div>`).join('');

  $('print-area').innerHTML = `
    <div class="pa-head">
      ${logo}
      <div class="pa-head-txt">
        <div class="pa-asso">En Faim Sans Fil</div>
        <div class="pa-doc-title">Diagnostic 360° — Pôle Accompagnement Familles</div>
      </div>
    </div>
    <div class="pa-accent"><span class="a1"></span><span class="a2"></span><span class="a3"></span><span class="a4"></span></div>
    <div class="pa-meta">
      <span><b>Famille</b> ${esc(famille.code_famille)}</span>
      <span><b>Enfant</b> ${esc(famille.prenom_enfant || '—')}</span>
      <span><b>Édité le</b> ${esc(today)}</span>
      <span class="pa-conso ${consoClass}">${consoTxt}</span>
    </div>
    <div class="pa-intro">
      <p>Ce dossier synthétise l'accompagnement global de la famille par le Pôle Familles
      d'<b>En Faim Sans Fil</b>, sur les 7 volets du diagnostic 360°. Il sert de support à l'entretien,
      de relais entre bénévoles et d'appui à l'orientation vers les professionnels.</p>
      <p class="pa-cadre"><b>Cadre du bénévole&nbsp;:</b> écoute active et empathique, partage d'expérience
      (pair-aidance), information sur les ressources, rupture de l'isolement. Le bénévole ne pose pas de
      diagnostic, ne donne pas de conseil médical et ne remplace pas les professionnels de santé&nbsp;: il
      oriente dès que nécessaire.</p>
    </div>
    ${voletsHtml}
    <div class="pa-ressources">
      <h3>Repères &amp; ressources</h3>
      <div class="pa-urgence">🚨 <b>Détresse ou urgence&nbsp;:</b> 3114 (prévention du suicide, 24h/24)
      · SAMU 15 si danger imminent · prévenir sans délai le coordinateur du Pôle Familles.</div>
      <div class="pa-ressource-grid">
        <div class="pa-ressource"><b>CHU Toulouse — Hôpital des Enfants</b><span>05 34 55 85 55</span></div>
        <div class="pa-ressource"><b>CAMSP Toulouse Centre</b><span>05 61 77 90 00</span></div>
        <div class="pa-ressource"><b>Maison des Adolescents</b><span>05 34 39 40 70</span></div>
        <div class="pa-ressource"><b>MDPH Haute-Garonne</b><span>0 800 31 01 31</span></div>
        <div class="pa-ressource"><b>HAD Santé Service Toulouse</b><span>05 61 50 50 50</span></div>
      </div>
    </div>
    <div class="pa-signatures">
      <h3>Validation &amp; signatures</h3>
      <div class="pa-sign-grid">${signatures}</div>
    </div>
    <div class="pa-foot">Document confidentiel — données de santé. Aucun nom de famille complet n'y figure
    (code famille + prénom uniquement). À conserver dans un espace sécurisé et à détruire selon la politique
    de conservation de l'association. En Faim Sans Fil — Pôle Accompagnement Familles.</div>`;
  $('print-area').style.display = 'block';

  await sb.from('journal_acces').insert({ famille_id: currentFamilleId, profil_id: currentUser.id, action: 'export_pdf' });
  window.print();
}
window.addEventListener('afterprint', () => { const pa = $('print-area'); if (pa) pa.style.display = 'none'; });

// ===== EFFACEMENT DES DONNÉES DE SANTÉ =====

async function effacerDonneesSante() {
  if (!confirm(
    "⚠️ Effacer DÉFINITIVEMENT le contenu des 7 volets de cette famille (données de santé) ?\n\n" +
    "La fiche (code, prénom, consentement) est conservée, vide.\n\n" +
    "As-tu bien exporté le PDF AVANT ? Cette action est irréversible.")) return;
  const { error } = await sb.rpc('effacer_donnees_sante', { fid: currentFamilleId });
  if (error) { alert('Erreur : ' + error.message); return; }
  renderVolets(currentFamilleId);
  alert('Données de santé effacées. La fiche est conservée, prête pour un prochain entretien.');
}

async function supprimerFiche() {
  if (!confirm("⚠️ Supprimer TOUTE la fiche (code, prénom, volets, historique) ? Irréversible.")) return;
  if (!confirm('Dernière confirmation : tout sera définitivement supprimé. Continuer ?')) return;
  const { error } = await sb.from('familles').delete().eq('id', currentFamilleId);
  if (error) { alert('Erreur : ' + error.message); return; }
  showListView();
}

$('export-pdf-btn').addEventListener('click', exportPdf);
$('effacer-sante-btn').addEventListener('click', effacerDonneesSante);
$('supprimer-fiche-btn').addEventListener('click', supprimerFiche);

// ===== DÉMARRAGE =====
// Logo de la charte (base64 dans logo-efsf.js) sur tous les emplacements marqués.
document.querySelectorAll('[data-logo]').forEach(el => { if (window.LOGO_EFSF) el.src = window.LOGO_EFSF; });
initSession();
