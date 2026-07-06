# Diagnostic 360° — Pôle Familles Enfance Sans Fil

Application web pour les bénévoles/pros du Pôle Familles, afin de suivre les
7 volets de l'accompagnement d'un enfant en sevrage de nutrition entérale ou
parentérale (et de sa famille) sans en oublier aucun.

Statique (HTML/CSS/JS, pas de build), connectée directement à un projet
Supabase (base de données + authentification). Pas de serveur à héberger.

## Mise en route (une seule fois)

### 1. Créer le schéma de base de données
Dans ton projet Supabase → **SQL Editor** → colle le contenu de `schema.sql`
→ **Run**.

### 2. Configurer l'accès
Édite `config.js` avec l'URL et la clé `anon public` de ton projet
(Supabase → **Project Settings → API**).

### 3. Activer l'envoi d'e-mails de connexion
Supabase → **Authentication → Providers → Email** : vérifie que la
connexion par lien magique ("Magic Link") est activée (activée par défaut).

### 4. Devenir coordinatrice
- Ouvre l'appli une première fois, connecte-toi avec ton e-mail (tu reçois
  un lien, clique dessus).
- Retourne dans Supabase → **SQL Editor**, lance :
  ```sql
  update profils set role = 'coordinateur' where email = 'ton-email@exemple.org';
  ```
- Recharge l'appli.

### 5. Déployer (gratuit)
- Active **GitHub Pages** sur ce dépôt (Settings → Pages → Deploy from
  branch → `main` → `/ (root)`).
- L'appli sera accessible à l'URL indiquée par GitHub.

## Donner accès à un volet précis à quelqu'un

Pour le MVP, l'attribution des accès par volet (ex : le volet médical à une
diététicienne) se fait directement dans Supabase → **Table editor** →
`acces_volets` → insérer une ligne (`famille_id`, `profil_id`, `volet`,
`peut_modifier`). Une interface dédiée pourra remplacer cette étape manuelle
dans une prochaine version, une fois le besoin réel observé sur le terrain.

## Ce qui n'est pas encore fait (prochaine étape, phase 3 du plan)
- Vue radar/synthèse visuelle par famille
- Export PDF
- Alertes automatiques sur volet non mis à jour
- Interface de gestion des accès (au lieu du Table editor Supabase)

## Confidentialité — rappel
Pas de nom de famille complet stocké : uniquement un code famille et le
prénom de l'enfant. Voir la section confidentialité du plan de projet pour
le point sur l'hébergement de données de santé (HDS) à trancher avant tout
déploiement en conditions réelles.
