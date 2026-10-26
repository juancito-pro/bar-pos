-- =====================================================================
--  MIGRACIÓN: Notificaciones y Llamados de Mesero desde Menú QR
--  Ejecutar UNA VEZ en: Supabase > SQL Editor > New query > Run
-- =====================================================================

-- 1. Tabla de llamados y pedidos recibidos desde el QR de las mesas
create table if not exists public.table_calls (
  id           bigint generated always as identity primary key,
  table_id     bigint references public.bar_tables(id) on delete set null,
  table_number int not null default 0,
  type         text not null default 'llamado' check (type in ('llamado', 'pedido', 'cuenta')),
  items        jsonb not null default '[]'::jsonb, -- [{ id, name, price, qty, category }]
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

-- 2. Habilitar Seguridad por Fila (RLS)
alter table public.table_calls enable row level security;

-- Los clientes desde el Menú QR (anónimos o autenticados) pueden enviar llamados
drop policy if exists "calls_insert_all" on public.table_calls;
create policy "calls_insert_all" on public.table_calls
  for insert to anon, authenticated
  with check (true);

-- Todos pueden consultar los llamados (el cliente para ver su estado y el personal para atender)
drop policy if exists "calls_select_all" on public.table_calls;
create policy "calls_select_all" on public.table_calls
  for select to anon, authenticated
  using (true);

-- Solo el personal (mesero, cajero, admin) puede marcar el llamado como atendido o cancelado
drop policy if exists "calls_update_staff" on public.table_calls;
create policy "calls_update_staff" on public.table_calls
  for update to authenticated
  using (public.my_role() is not null)
  with check (public.my_role() is not null);

-- 3. Habilitar Tiempo Real para notificaciones instantáneas
do $$ begin
  begin alter publication supabase_realtime add table public.table_calls; exception when others then null; end;
end $$;
