-- =====================================================================
--  MIGRACIÓN: Correo Gmail / Email de contacto para cada usuario
--  Ejecutar UNA VEZ en: Supabase > SQL Editor > New query > Run
--  (Es seguro ejecutarla varias veces: no borra datos)
-- =====================================================================

-- 1. Nueva columna "email" en perfiles (correo real de contacto: Gmail, etc.)
--    El inicio de sesión sigue siendo con el nombre de usuario.
alter table public.profiles add column if not exists email text;

-- 2. Validación de formato de correo (permite vacío / null)
alter table public.profiles drop constraint if exists profiles_email_format;
alter table public.profiles add constraint profiles_email_format
  check (email is null or email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$');

-- 3. Un mismo correo no puede repetirse entre usuarios (sin importar mayúsculas)
create unique index if not exists uq_profiles_email
  on public.profiles (lower(email)) where email is not null;

-- 4. Al registrar un usuario nuevo, guardar también su Gmail si se envió
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, email, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(lower(trim(new.raw_user_meta_data->>'email')), ''),
    'mesero',
    false
  );
  return new;
end $$;

-- 5. Tiempo real para la pantalla de usuarios (opcional, no falla si ya existe)
do $$ begin
  begin alter publication supabase_realtime add table public.profiles; exception when others then null; end;
end $$;
