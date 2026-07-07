-- ============================================================
-- Diagnostic 360° — MIGRATION SÉCURITÉ
-- À exécuter UNE fois dans Supabase → SQL Editor sur une base DÉJÀ créée.
--
-- Ce que ça corrige :
--   1. FAILLE CRITIQUE : n'importe qui pouvait se donner le rôle
--      « coordinateur » et voir toutes les familles. Le rôle n'est plus
--      modifiable par l'utilisateur — uniquement par la coordinatrice.
--   2. Pré-attribution des rôles : l'e-mail → rôle est posé automatiquement
--      à l'inscription (table roles_preattribues + trigger).
--   3. Accès sur invitation : un e-mail non pré-inscrit n'a aucun accès.
--   4. Le bénévole référent peut enfin remplir tous les volets de SES familles.
--
-- Idempotent : peut être relancé sans danger.
-- ============================================================

create extension if not exists "pgcrypto";

-- --- Table de pré-attribution (si absente) -----------------
create table if not exists roles_preattribues (
  email text primary key,
  role role_type not null default 'contributeur',
  nom text,
  invite_par uuid references profils(id) on delete set null,
  created_at timestamptz not null default now()
);

-- --- Normalisation des e-mails existants en minuscules -----
update profils set email = lower(email) where email <> lower(email);

-- --- Fonctions de sécurité ---------------------------------
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
    return new; -- non invité : pas de profil, donc pas d'accès
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

-- --- Amorçage : refléter les comptes existants dans la -----
-- --- pré-attribution (pour ne bloquer personne d'existant) -
insert into roles_preattribues (email, role, nom)
select lower(email), role, nom from profils
on conflict (email) do nothing;

-- --- RLS : (ré)activation ----------------------------------
alter table profils            enable row level security;
alter table roles_preattribues enable row level security;
alter table familles           enable row level security;
alter table acces_volets       enable row level security;
alter table volet_entries      enable row level security;
alter table journal_acces      enable row level security;

-- --- Suppression des anciennes policies --------------------
drop policy if exists "profil_self"          on profils;
drop policy if exists "familles_select"      on familles;
drop policy if exists "familles_insert"      on familles;
drop policy if exists "familles_update"      on familles;
drop policy if exists "acces_volets_select"  on acces_volets;
drop policy if exists "acces_volets_manage"  on acces_volets;
drop policy if exists "acces_volets_insert"  on acces_volets;
drop policy if exists "acces_volets_delete"  on acces_volets;
drop policy if exists "volet_entries_select" on volet_entries;
drop policy if exists "volet_entries_insert" on volet_entries;
drop policy if exists "journal_select"       on journal_acces;
drop policy if exists "journal_insert"       on journal_acces;
drop policy if exists "profils_select_self"        on profils;
drop policy if exists "profils_select_coordinateur" on profils;
drop policy if exists "profils_update_coordinateur" on profils;
drop policy if exists "preattrib_coordinateur"      on roles_preattribues;

-- --- profils : plus d'auto-attribution de rôle -------------
create policy "profils_select_self" on profils for select
  using (id = auth.uid());
create policy "profils_select_coordinateur" on profils for select
  using (is_coordinateur());
create policy "profils_update_coordinateur" on profils for update
  using (is_coordinateur())
  with check (is_coordinateur());

-- --- roles_preattribues : coordinatrice seulement ----------
create policy "preattrib_coordinateur" on roles_preattribues for all
  using (is_coordinateur())
  with check (is_coordinateur());

-- --- familles ---------------------------------------------
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

-- --- acces_volets -----------------------------------------
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

-- --- volet_entries ----------------------------------------
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

-- --- journal_acces ----------------------------------------
create policy "journal_select" on journal_acces for select
  using (is_coordinateur());
create policy "journal_insert" on journal_acces for insert
  with check (profil_id = auth.uid());

-- ============================================================
-- APRÈS EXÉCUTION — vérifier que TON profil est bien coordinateur :
--   select email, role from profils order by role;
-- Si besoin (première fois) :
--   update profils set role = 'coordinateur' where email = 'ton-email@exemple.org';
-- Puis tout se gère depuis l'écran « Coordination » de l'appli.
-- ============================================================
