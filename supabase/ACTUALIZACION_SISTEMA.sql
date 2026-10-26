-- =====================================================================
--  BARPOS - SCRIPT DE ACTUALIZACIÓN INTEGRAL DE BASE DE DATOS
--  (Gmail en Usuarios + Notificaciones en Tiempo Real desde QR)
--
--  INSTRUCCIONES DE EJECUCIÓN:
--  1. Entra a tu panel de Supabase: https://supabase.com/dashboard
--  2. Selecciona tu proyecto del Bar
--  3. En el menú de la izquierda, entra a "SQL Editor"
--  4. Haz clic en el botón verde "New query"
--  5. Pega TODO este código y haz clic en "Run" (o presiona Ctrl + Enter)
--  6. Verás: "Success. No rows returned" ¡Y listo!
-- =====================================================================

-- ---------------------------------------------------------------------
-- PARTE 1: SOPORTE DE GMAIL Y CONTACTO PARA USUARIOS
-- ---------------------------------------------------------------------

-- 1.1 Agregar columna "email" a la tabla profiles
alter table public.profiles add column if not exists email text;

-- 1.2 Validación de formato de correo (permite nulo/vacío si aún no tiene)
alter table public.profiles drop constraint if exists profiles_email_format;
alter table public.profiles add constraint profiles_email_format
  check (email is null or email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$');

-- 1.3 Índice único: dos usuarios no pueden tener el mismo Gmail registrado
create unique index if not exists uq_profiles_email
  on public.profiles (lower(email)) where email is not null;

-- 1.4 Función que vincula la cuenta de auth con su perfil y guarda su Gmail
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

-- ---------------------------------------------------------------------
-- PARTE 2: TABLA DE LLAMADOS Y PEDIDOS DESDE EL MENÚ QR
-- ---------------------------------------------------------------------

-- 2.1 Crear tabla table_calls si no existe
create table if not exists public.table_calls (
  id           bigint generated always as identity primary key,
  table_id     bigint references public.bar_tables(id) on delete set null,
  table_number int not null default 0,
  type         text not null default 'llamado' check (type in ('llamado', 'pedido', 'cuenta')),
  items        jsonb not null default '[]'::jsonb,
  total        numeric(10,2) not null default 0,
  notes        text default '',
  status       text not null default 'pendiente' check (status in ('pendiente', 'atendido', 'cancelado')),
  created_at   timestamptz not null default now(),
  attended_at  timestamptz,
  attended_by  uuid references public.profiles(id)
);

create index if not exists idx_table_calls_status  on public.table_calls(status);
create index if not exists idx_table_calls_table   on public.table_calls(table_id);
create index if not exists idx_table_calls_created on public.table_calls(created_at desc);

-- 2.2 Seguridad por Fila (Row Level Security)
alter table public.table_calls enable row level security;

-- Permitir a clientes del QR (anónimos o autenticados) enviar llamados
drop policy if exists "calls_insert_all" on public.table_calls;
create policy "calls_insert_all" on public.table_calls
  for insert to anon, authenticated
  with check (true);

-- Permitir a todos consultar los llamados (para saber si fue atendido)
drop policy if exists "calls_select_all" on public.table_calls;
create policy "calls_select_all" on public.table_calls
  for select to anon, authenticated
  using (true);

-- Permitir al personal (mesero, cajero, admin) marcar el llamado como atendido
drop policy if exists "calls_update_staff" on public.table_calls;
create policy "calls_update_staff" on public.table_calls
  for update to authenticated
  using (public.my_role() is not null)
  with check (public.my_role() is not null);

-- ---------------------------------------------------------------------
-- PARTE 3: TIEMPO REAL (Supabase Realtime)
-- ---------------------------------------------------------------------

do $$ begin
  begin alter publication supabase_realtime add table public.profiles;    exception when others then null; end;
  begin alter publication supabase_realtime add table public.table_calls; exception when others then null; end;
end $$;

-- Mensaje de confirmación en la consola SQL
select '✅ Base de datos actualizada con éxito: Gmail en Usuarios y Notificaciones QR activadas' as resultado;
