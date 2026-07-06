-- ============================================================
-- Diagnostic 360° — Pôle Familles Enfance Sans Fil
-- Schéma Supabase (Postgres) — à exécuter dans SQL Editor
--
-- Choix de confidentialité (voir plan) :
--   - Pas de nom de famille complet stocké : un code_famille (ex: F-2026-014)
--     et le prénom de l'enfant seul. Le nom réel reste dans vos outils
--     habituels (Drive, dossier papier), pas ici.
--   - Chaque volet est cloisonné : un contributeur ne voit que les volets
--     auxquels il est explicitement rattaché (acces_volets).
--   - journal_acces trace qui a consulté/modifié/exporté quoi et quand.
-- ============================================================

create extension if not exists "pgcrypto";

create type role_type as enum ('benevole_referent', 'contributeur', 'coordinateur');
create type volet_type as enum (
  'medical', 'psychologique', 'social', 'scolaire',
  'fratrie', 'administratif', 'accompagnement'
);

-- Profils : un par personne connectée (bénévole, pro, coordinateur)
create table profils (
  id uuid primary key references auth.users(id) on delete cascade,
  nom text not null,
  email text not null,
  role role_type not null default 'contributeur',
  created_at timestamptz not null default now()
);

-- Familles suivies
create table familles (
  id uuid primary key default gen_random_uuid(),
  code_famille text not null unique,
  prenom_enfant text,
  date_naissance date,
  referent_id uuid references profils(id),
  consentement_recueilli boolean not null default false,
  consentement_date date,
  archive boolean not null default false,
  created_at timestamptz not null default now()
);

-- Qui a accès à quel volet, pour quelle famille
create table acces_volets (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references familles(id) on delete cascade,
  profil_id uuid not null references profils(id) on delete cascade,
  volet volet_type not null,
  peut_modifier boolean not null default true,
  unique (famille_id, profil_id, volet)
);

-- Contenu des volets, historisé (chaque mise à jour = une nouvelle ligne,
-- jamais d'écrasement — c'est ce qui permet l'historique et les alertes)
create table volet_entries (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references familles(id) on delete cascade,
  volet volet_type not null,
  contenu jsonb not null,
  auteur_id uuid not null references profils(id),
  created_at timestamptz not null default now()
);
create index idx_volet_entries_famille on volet_entries(famille_id, volet, created_at desc);

-- Journal d'accès — traçabilité RGPD
create table journal_acces (
  id uuid primary key default gen_random_uuid(),
  famille_id uuid not null references familles(id) on delete cascade,
  profil_id uuid not null references profils(id),
  action text not null check (action in ('consultation', 'modification', 'export_pdf')),
  volet volet_type,
  created_at timestamptz not null default now()
);

-- ============================================================
-- SÉCURITÉ — Row Level Security
-- ============================================================
alter table profils enable row level security;
alter table familles enable row level security;
alter table acces_volets enable row level security;
alter table volet_entries enable row level security;
alter table journal_acces enable row level security;

create policy "profil_self" on profils for all
  using (id = auth.uid());

create policy "familles_select" on familles for select using (
  exists (select 1 from profils p where p.id = auth.uid() and p.role = 'coordinateur')
  or referent_id = auth.uid()
  or exists (select 1 from acces_volets a where a.famille_id = familles.id and a.profil_id = auth.uid())
);

create policy "familles_insert" on familles for insert with check (
  exists (select 1 from profils p where p.id = auth.uid() and p.role in ('benevole_referent', 'coordinateur'))
);

create policy "familles_update" on familles for update using (
  exists (select 1 from profils p where p.id = auth.uid() and p.role = 'coordinateur')
  or referent_id = auth.uid()
);

create policy "acces_volets_select" on acces_volets for select using (
  profil_id = auth.uid()
  or exists (select 1 from profils p where p.id = auth.uid() and p.role = 'coordinateur')
);

create policy "acces_volets_manage" on acces_volets for insert with check (
  exists (select 1 from familles f where f.id = famille_id and f.referent_id = auth.uid())
  or exists (select 1 from profils p where p.id = auth.uid() and p.role = 'coordinateur')
);

create policy "volet_entries_select" on volet_entries for select using (
  exists (select 1 from profils p where p.id = auth.uid() and p.role = 'coordinateur')
  or exists (
    select 1 from acces_volets a
    where a.famille_id = volet_entries.famille_id
      and a.profil_id = auth.uid()
      and a.volet = volet_entries.volet
  )
);

create policy "volet_entries_insert" on volet_entries for insert with check (
  exists (select 1 from profils p where p.id = auth.uid() and p.role = 'coordinateur')
  or exists (
    select 1 from acces_volets a
    where a.famille_id = volet_entries.famille_id
      and a.profil_id = auth.uid()
      and a.volet = volet_entries.volet
      and a.peut_modifier = true
  )
);

create policy "journal_select" on journal_acces for select using (
  exists (select 1 from profils p where p.id = auth.uid() and p.role = 'coordinateur')
);

create policy "journal_insert" on journal_acces for insert with check (profil_id = auth.uid());

-- ============================================================
-- Après exécution : créer ton propre profil coordinateur.
-- 1. Connecte-toi une première fois depuis l'appli (lien magique par e-mail)
-- 2. Puis lance ceci en remplaçant l'e-mail par le tien :
--
-- insert into profils (id, nom, email, role)
-- select id, 'Sandra', email, 'coordinateur'
-- from auth.users where email = 'ton-email@exemple.org';
-- ============================================================
