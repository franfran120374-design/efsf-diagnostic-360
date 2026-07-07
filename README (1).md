
# Diagnostic 360° — Pôle Familles Enfance Sans Fil

Application web pour les bénévoles/pros du Pôle Familles, afin de suivre les
7 volets de l'accompagnement d'un enfant en sevrage de nutrition entérale ou
parentérale (et de sa famille) sans en oublier aucun.

Statique (HTML/CSS/JS, pas de build), connectée directement à un projet
Supabase (base de données + authentification). Pas de serveur à héberger.

## Sécurité & confidentialité (à lire en premier)

Ces données sont sensibles (enfants, santé, situation familiale). Le modèle
d'accès est verrouillé côté base de données (Row Level Security Supabase) —
pas seulement dans l'appli :

- **Le rôle n'est jamais choisi par l'utilisateur.** Il est pré-attribué par
  la coordinatrice et appliqué automatiquement à l'inscription. Personne ne
  peut se donner un rôle à soi-même (même en trafiquant le navigateur).
- **Accès sur invitation.** Un e-mail absent de la liste de pré-attribution
  n'obtient aucun profil, donc aucun accès aux données.
- **Cloisonnement par volet.** Un contributeur ne voit que les volets d'une
  famille auxquels il a été explicitement rattaché.
- **Traçabilité.** Chaque consultation / modification / export est journalisée
  (`journal_acces`), consultable par la coordinatrice.
- **Pas de nom complet stocké** : uniquement un code famille (ex : F-2026-014)
  et le prénom de l'enfant. Le nom réel reste dans vos outils habituels.

> Le point HDS (hébergement de données de santé) reste à trancher avec Supabase
> avant un déploiement en conditions réelles à grande échelle.

## Mise en route

### Nouvelle base (première installation)
1. Supabase → **SQL Editor** → colle `schema.sql` → **Run**.
2. Édite `config.js` avec l'URL et la clé `anon public` (Supabase →
   **Project Settings → API**). La clé anon est publique par nature, c'est
   la RLS qui protège les données — ne mets **jamais** la clé `service_role`
   dans ce dépôt (il est public).
3. Supabase → **Authentication → Providers → Email** : désactive la
   confirmation par e-mail pour une connexion directe (mot de passe).
4. **Deviens coordinatrice** (bootstrap) :
   ```sql
   insert into roles_preattribues (email, role, nom)
   values ('ton-email@exemple.org', 'coordinateur', 'Sandra');
   ```
   puis ouvre l'appli, clique « Créer mon accès », choisis ton mot de passe.
   Le trigger te crée automatiquement un profil coordinateur.
5. Active **GitHub Pages** (Settings → Pages → branche `main` → `/`).

### Base déjà en production ⚠️
N'exécute pas `schema.sql` (il recrée les tables). Lance **une fois**
`migration-securite.sql` dans le SQL Editor : il corrige la faille de rôle,
ajoute la pré-attribution et l'accès sur invitation, sans perdre de données.
Vérifie ensuite que ton profil est bien `coordinateur` :
```sql
select email, role from profils order by role;
```

## Utilisation au quotidien

- **Pré-attribuer un rôle** : dans l'appli, bouton **⚙ Coordination**
  (visible seulement par la coordinatrice) → « Pré-attribution » → e-mail +
  rôle. La personne reçoit ce rôle dès qu'elle crée son accès. Plus besoin
  de toucher à Supabase.
- **Changer le rôle d'un compte existant** : même écran, section
  « Comptes déjà créés ».
- **Donner accès à un volet précis à un contributeur** (ex : le volet médical
  à une diététicienne) : pour l'instant via Supabase → **Table editor** →
  `acces_volets` (une ligne : `famille_id`, `profil_id`, `volet`,
  `peut_modifier`). Une interface dédiée viendra plus tard.
- **Guide de l'appli** : bouton **❔ Aide** — explique les 7 volets et les
  3 rôles.

## Les 3 rôles

| Rôle | Ce qu'il peut faire |
|---|---|
| **Coordinateur** | Voit toutes les familles, gère les accès et les rôles, exporte les synthèses. |
| **Bénévole référent** | Crée des fiches familles et remplit tous les volets de **ses** familles. |
| **Contributeur** | Accès uniquement aux volets d'une famille pour lesquels il a été invité. |

## Maintenance — garder l'aide à jour

La popup **❔ Aide** est **générée automatiquement** à partir des tableaux
`VOLETS` et `ROLES` en haut de `app.js`. Elle est donc toujours synchronisée :

- Tu ajoutes / modifies un volet ou un champ dans `VOLETS` → l'aide se met à
  jour toute seule.
- Tu changes la description d'un rôle dans `ROLES` → idem.
- Seul le petit texte d'intro / confidentialité est fixe : si tu le changes,
  bump la constante `GUIDE_MAJ` (date affichée en bas de la popup).

Autrement dit, il n'y a **pas** de texte d'aide à maintenir en double : la
configuration de l'appli EST la source du guide.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure (écrans, modales aide + coordination) |
| `app.js` | Logique : auth, familles, volets, aide, coordination |
| `styles.css` | Styles (charte EFSF) |
| `config.js` | URL + clé anon Supabase |
| `schema.sql` | Schéma complet — **nouvelle base uniquement** |
| `migration-securite.sql` | Mise à jour d'une base **existante** |

## Ce qui n'est pas encore fait
- Vue radar/synthèse visuelle par famille
- Export PDF
- Alertes automatiques sur volet non mis à jour
- Interface de gestion des accès par volet (au lieu du Table editor Supabase)
