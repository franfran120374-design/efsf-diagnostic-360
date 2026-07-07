-- ============================================================
-- Diagnostic 360° — Pôle Familles Enfance Sans Fil
-- Schéma Supabase (Postgres) — à exécuter dans SQL Editor
--
-- ⚠️  Base DÉJÀ créée / en production ? N'exécute PAS ce fichier
--     (il recrée les tables). Utilise plutôt `migration-securite.sql`,
--     qui met à jour une base existante sans perdre les données.
--
-- Choix de confidentialité (voir plan) :
--   - Pas de nom de famille complet stocké : un code_famille (ex: F-2026-014)
--     et le prénom de l'enfant seul. Le nom réel reste dans vos outils
--     habituels (Drive, dossier papier), pas ici.
--   - Chaque volet est cloisonné : un contributeur ne voit que les volets
--     auxquels il est explicitement rattaché (acces_volets).
--   - journal_acces trace qui a consulté/modifié/exporté quoi et quand.
--
-- Modèle de sécurité (résumé) :
--   - Le RÔLE d'une personne n'est JAMAIS choisi par elle-même.
--     Il est pré-attribué par la coordinatrice (table roles_preattribues)
--     et appliqué automatiquement à l'inscription par un trigger.
--   - Accès sur invitation : un e-mail non pré-inscrit n'obtient aucun profil,
--     donc aucun accès aux données.
-- ============================================================

create extension if not exists "pgcrypto";

-- --- Types -------------------------------------------------
do $$ begin
  create type role_type as enum ('benevole_referent', 'contributeur', 'coordinateur');
exception when duplicate_object then null; end $$;

do $$ begin
  create type volet_type as enum (
    'medical', 'psychologique', 'social', 'scolaire',
    'fratrie', 'administratif', 'accompagnement'
  );
exception when duplicate_object then null; end $$;

-- --- Tables ------------------------------------------------

-- Profils : un par personne connectée (bénévole, pro, coordinateur).
-- Le rôle n'est jamais renseigné par l'utilisateur : il vient du trigger.
create table profils (
  id uuid primary key references auth.users(id) on delete cascade,
  nom text not null,
  email text not null,
  role role_type not null default 'contributeur',
  created_at timestamptz not null default now()
);

-- Pré-attribution des rôles : la coordinatrice ajoute ici les e-mails
-- autorisés + leur rôle AVANT que la personne ne crée son accès.
-- À l'inscription, le trigger lit cette table pour poser le bon rôle.
create table roles_preattribues (
  email text primary key,
  role role_type not null default 'contributeur',
  nom text,
  invite_par uuid references profils(id) on delete set null,
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
-- FONCTIONS DE SÉCURITÉ
-- ============================================================

-- Teste si l'utilisateur courant est coordinateur.
-- SECURITY DEFINER : lit `profils` en contournant RLS. Indispensable pour
-- éviter la récursion (une policy SUR profils ne peut pas relire profils).
create or replace function is_coordinateur()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profils where id = auth.uid() and role = 'coordinateur'
  );
$$;

-- À la création d'un compte (auth.users), crée le profil SEULEMENT si
-- l'e-mail a été pré-inscrit, en appliquant le rôle pré-attribué.
-- SECURITY DEFINER : peut lire roles_preattribues et écrire profils.
-- Conséquence : un e-mail non invité n'a pas de profil → aucun accès.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pre roles_preattribues%rowtype;
begin
  select * into pre from roles_preattribues where email = lower(new.email);
  if not found then
    -- Non invité : on ne crée pas de profil. L'appli refuse l'accès.
    return new;
  end if;
  insert into profils (id, nom, email, role)
  values (
    new.id,
    coalesce(nullif(pre.nom, ''), split_part(new.email, '@', 1)),
    lower(new.email),
    pre.role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- SÉCURITÉ — Row Level Security
-- ============================================================
alter table profils            enable row level security;
alter table roles_preattribues enable row level security;
alter table familles           enable row level security;
alter table acces_volets       enable row level security;
alter table volet_entries      enable row level security;
alter table journal_acces      enable row level security;

-- --- profils ---
-- Lecture : son propre profil, ou tout si coordinateur.
-- AUCUN insert/update client : le rôle ne peut donc pas être auto-attribué.
-- (Le trigger, en SECURITY DEFINER, contourne RLS pour créer le profil.)
create policy "profils_select_self" on profils for select
  using (id = auth.uid());
create policy "profils_select_coordinateur" on profils for select
  using (is_coordinateur());
-- Seule la coordinatrice peut changer un rôle (ex : promouvoir un référent).
create policy "profils_update_coordinateur" on profils for update
  using (is_coordinateur())
  with check (is_coordinateur());

-- --- roles_preattribues ---
-- Réservé à la coordinatrice (lecture + écriture).
create policy "preattrib_coordinateur" on roles_preattribues for all
  using (is_coordinateur())
  with check (is_coordinateur());

-- --- familles ---
create policy "familles_select" on familles for select using (
  is_coordinateur()
  or referent_id = auth.uid()
  or exists (select 1 from acces_volets a where a.famille_id = familles.id and a.profil_id = auth.uid())
);
create policy "familles_insert" on familles for insert with check (
  is_coordinateur()
  or (
    exists (select 1 from profils p where p.id = auth.uid() and p.role = 'benevole_referent')
    and referent_id = auth.uid()
  )
);
create policy "familles_update" on familles for update
  using (is_coordinateur() or referent_id = auth.uid())
  with check (is_coordinateur() or referent_id = auth.uid());

-- --- acces_volets ---
create policy "acces_volets_select" on acces_volets for select using (
  profil_id = auth.uid()
  or is_coordinateur()
  or exists (select 1 from familles f where f.id = acces_volets.famille_id and f.referent_id = auth.uid())
);
create policy "acces_volets_insert" on acces_volets for insert with check (
  is_coordinateur()
  or exists (select 1 from familles f where f.id = famille_id and f.referent_id = auth.uid())
);
create policy "acces_volets_delete" on acces_volets for delete using (
  is_coordinateur()
  or exists (select 1 from familles f where f.id = acces_volets.famille_id and f.referent_id = auth.uid())
);

-- --- volet_entries ---
-- Le référent de la famille a accès à TOUS les volets de SES familles.
-- Un contributeur : seulement les volets où il est explicitement rattaché.
create policy "volet_entries_select" on volet_entries for select using (
  is_coordinateur()
  or exists (select 1 from familles f where f.id = volet_entries.famille_id and f.referent_id = auth.uid())
  or exists (
    select 1 from acces_volets a
    where a.famille_id = volet_entries.famille_id
      and a.profil_id = auth.uid()
      and a.volet = volet_entries.volet
  )
);
create policy "volet_entries_insert" on volet_entries for insert with check (
  auteur_id = auth.uid()
  and (
    is_coordinateur()
    or exists (select 1 from familles f where f.id = famille_id and f.referent_id = auth.uid())
    or exists (
      select 1 from acces_volets a
      where a.famille_id = volet_entries.famille_id
        and a.profil_id = auth.uid()
        and a.volet = volet_entries.volet
        and a.peut_modifier = true
    )
  )
);

-- --- journal_acces ---
create policy "journal_select" on journal_acces for select
  using (is_coordinateur());
create policy "journal_insert" on journal_acces for insert
  with check (profil_id = auth.uid());

-- ============================================================
-- BOOTSTRAP — créer la toute première coordinatrice
-- ============================================================
-- 1. Ajoute ton e-mail à la pré-attribution AVANT ta première connexion :
--      insert into roles_preattribues (email, role, nom)
--      values ('ton-email@exemple.org', 'coordinateur', 'Sandra');
-- 2. Ouvre l'appli, clique « Créer mon accès », choisis ton mot de passe.
--    Le trigger te crée automatiquement un profil coordinateur.
-- 3. Ensuite, tout se gère depuis l'écran « Coordination » de l'appli.
-- ============================================================
