-- =====================================================================
--  SISTEMA DE BAR - Esquema Supabase
--  Ejecutar completo en: Supabase > SQL Editor > New query > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

-- Perfiles de usuario (vinculados a auth.users)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  full_name   text not null default '',
  role        text not null default 'mesero' check (role in ('admin','cajero','mesero')),
  active      boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.categories (
  id          bigint generated always as identity primary key,
  name        text not null,
  icon        text not null default '🍹',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.products (
  id           bigint generated always as identity primary key,
  category_id  bigint references public.categories(id) on delete set null,
  name         text not null,
  price        numeric(10,2) not null check (price >= 0),
  cost         numeric(10,2) not null default 0,
  stock        int not null default 0,
  min_stock    int not null default 5,
  track_stock  boolean not null default true,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.bar_tables (
  id          bigint generated always as identity primary key,
  number      int unique not null,
  name        text not null default '',
  capacity    int not null default 4,
  active      boolean not null default true
);

create table if not exists public.cash_sessions (
  id               bigint generated always as identity primary key,
  cashier_id       uuid not null references public.profiles(id),
  opened_at        timestamptz not null default now(),
  opening_amount   numeric(10,2) not null default 0,
  closed_at        timestamptz,
  expected_cash    numeric(10,2),
  counted_cash     numeric(10,2),
  difference       numeric(10,2),
  total_sales      numeric(10,2),
  notes            text,
  status           text not null default 'abierta' check (status in ('abierta','cerrada'))
);

create table if not exists public.orders (
  id               bigint generated always as identity primary key,
  table_id         bigint references public.bar_tables(id) on delete set null,
  waiter_id        uuid references public.profiles(id),
  cashier_id       uuid references public.profiles(id),
  cash_session_id  bigint references public.cash_sessions(id),
  type             text not null default 'mesa' check (type in ('mesa','barra')),
  status           text not null default 'abierta' check (status in ('abierta','por_cobrar','pagada','cancelada')),
  total            numeric(10,2) not null default 0,
  notes            text,
  created_at       timestamptz not null default now(),
  paid_at          timestamptz
);

create table if not exists public.order_items (
  id            bigint generated always as identity primary key,
  order_id      bigint not null references public.orders(id) on delete cascade,
  product_id    bigint references public.products(id) on delete set null,
  product_name  text not null,
  unit_price    numeric(10,2) not null,
  quantity      int not null check (quantity > 0),
  status        text not null default 'pendiente' check (status in ('pendiente','listo','entregado')),
  notes         text,
  created_by    uuid references public.profiles(id) default auth.uid(),
  created_at    timestamptz not null default now()
);

create table if not exists public.payments (
  id               bigint generated always as identity primary key,
  order_id         bigint not null references public.orders(id) on delete cascade,
  cash_session_id  bigint references public.cash_sessions(id),
  method           text not null check (method in ('efectivo','tarjeta','qr')),
  amount           numeric(10,2) not null check (amount > 0),
  created_at       timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id          bigint generated always as identity primary key,
  product_id  bigint not null references public.products(id) on delete cascade,
  quantity    int not null,             -- positivo = entra, negativo = sale
  type        text not null check (type in ('entrada','venta','ajuste','devolucion')),
  note        text,
  user_id     uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists idx_orders_status     on public.orders(status);
create index if not exists idx_orders_paid_at    on public.orders(paid_at);
create index if not exists idx_items_order       on public.order_items(order_id);
create index if not exists idx_payments_session  on public.payments(cash_session_id);
-- Una mesa solo puede tener un pedido abierto a la vez
create unique index if not exists uq_open_order_per_table on public.orders(table_id)
  where status in ('abierta','por_cobrar') and table_id is not null;

-- ---------------------------------------------------------------------
-- 2. FUNCIONES AUXILIARES
-- ---------------------------------------------------------------------

-- Rol del usuario actual (solo si está activo)
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

-- Al registrarse un usuario se crea su perfil INACTIVO.
-- Sólo un admin puede activarlo y asignarle rol (seguridad).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'mesero',
    false
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Recalcula el total del pedido
create or replace function public.recalc_order_total()
returns trigger language plpgsql security definer set search_path = public as $$
declare oid bigint;
begin
  oid := coalesce(new.order_id, old.order_id);
  update public.orders
     set total = coalesce((select sum(unit_price * quantity) from public.order_items where order_id = oid), 0)
   where id = oid;
  return null;
end $$;

drop trigger if exists trg_items_total on public.order_items;
create trigger trg_items_total
  after insert or update or delete on public.order_items
  for each row execute function public.recalc_order_total();

-- Descuenta / devuelve stock automáticamente
create or replace function public.handle_item_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.products set stock = stock - new.quantity
     where id = new.product_id and track_stock;
    if found then
      insert into public.stock_movements(product_id, quantity, type, note)
      values (new.product_id, -new.quantity, 'venta', 'Pedido #' || new.order_id);
    end if;
  elsif tg_op = 'DELETE' then
    update public.products set stock = stock + old.quantity
     where id = old.product_id and track_stock;
    if found then
      insert into public.stock_movements(product_id, quantity, type, note)
      values (old.product_id, old.quantity, 'devolucion', 'Anulado pedido #' || old.order_id);
    end if;
  elsif tg_op = 'UPDATE' and new.quantity <> old.quantity then
    update public.products set stock = stock - (new.quantity - old.quantity)
     where id = new.product_id and track_stock;
    if found then
      insert into public.stock_movements(product_id, quantity, type, note)
      values (new.product_id, -(new.quantity - old.quantity), 'ajuste', 'Cambio cantidad pedido #' || new.order_id);
    end if;
  end if;
  return null;
end $$;

drop trigger if exists trg_items_stock on public.order_items;
create trigger trg_items_stock
  after insert or update or delete on public.order_items
  for each row execute function public.handle_item_stock();

-- Entrada manual de stock (admin)
create or replace function public.add_stock(p_product_id bigint, p_quantity int, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() <> 'admin' then raise exception 'Solo el administrador puede ajustar stock'; end if;
  update public.products set stock = stock + p_quantity where id = p_product_id;
  insert into public.stock_movements(product_id, quantity, type, note)
  values (p_product_id, p_quantity, case when p_quantity >= 0 then 'entrada' else 'ajuste' end, p_note);
end $$;

-- Cobrar un pedido (soporta pagos mixtos)
-- p_payments = '[{"method":"efectivo","amount":50},{"method":"qr","amount":20}]'
create or replace function public.pay_order(p_order_id bigint, p_payments jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_session bigint;
  v_total   numeric;
  v_paid    numeric;
  p         jsonb;
begin
  if public.my_role() not in ('cajero','admin') then raise exception 'No autorizado'; end if;

  select id into v_session from public.cash_sessions
   where cashier_id = auth.uid() and status = 'abierta' order by opened_at desc limit 1;
  if v_session is null then raise exception 'Debes abrir caja antes de cobrar'; end if;

  select total into v_total from public.orders where id = p_order_id and status in ('abierta','por_cobrar') for update;
  if v_total is null then raise exception 'Pedido no encontrado o ya cobrado'; end if;

  select coalesce(sum((x->>'amount')::numeric), 0) into v_paid from jsonb_array_elements(p_payments) x;
  if v_paid < v_total then raise exception 'El monto pagado (%) es menor al total (%)', v_paid, v_total; end if;
  if (select coalesce(sum((x->>'amount')::numeric), 0) from jsonb_array_elements(p_payments) x
       where x->>'method' <> 'efectivo') > v_total then
    raise exception 'Tarjeta/QR no pueden superar el total (el vuelto solo es en efectivo)';
  end if;

  for p in select * from jsonb_array_elements(p_payments) loop
    if (p->>'amount')::numeric > 0 then
      insert into public.payments(order_id, cash_session_id, method, amount)
      values (p_order_id, v_session, p->>'method', (p->>'amount')::numeric);
    end if;
  end loop;

  -- si hubo vuelto en efectivo, se registra el monto exacto del total
  if v_paid > v_total then
    update public.payments set amount = amount - (v_paid - v_total)
     where id = (select id from public.payments where order_id = p_order_id and method = 'efectivo'
                 order by id desc limit 1);
  end if;

  update public.orders
     set status = 'pagada', paid_at = now(), cashier_id = auth.uid(), cash_session_id = v_session
   where id = p_order_id;
end $$;

-- Cerrar caja con arqueo
create or replace function public.close_cash_session(p_session_id bigint, p_counted numeric, p_notes text default null)
returns public.cash_sessions language plpgsql security definer set search_path = public as $$
declare
  v_row      public.cash_sessions;
  v_cash     numeric;
  v_total    numeric;
begin
  if public.my_role() not in ('cajero','admin') then raise exception 'No autorizado'; end if;

  select coalesce(sum(amount) filter (where method = 'efectivo'), 0), coalesce(sum(amount), 0)
    into v_cash, v_total
    from public.payments where cash_session_id = p_session_id;

  update public.cash_sessions
     set closed_at     = now(),
         expected_cash = opening_amount + v_cash,
         counted_cash  = p_counted,
         difference    = p_counted - (opening_amount + v_cash),
         total_sales   = v_total,
         notes         = p_notes,
         status        = 'cerrada'
   where id = p_session_id and status = 'abierta'
     and (cashier_id = auth.uid() or public.my_role() = 'admin')
  returning * into v_row;

  if v_row.id is null then raise exception 'Sesión de caja no encontrada o ya cerrada'; end if;
  return v_row;
end $$;

-- ---------------------------------------------------------------------
-- 3. SEGURIDAD (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.bar_tables      enable row level security;
alter table public.cash_sessions   enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.payments        enable row level security;
alter table public.stock_movements enable row level security;

-- PROFILES
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() is not null);
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles for update to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- CATÁLOGO (categorías, productos, mesas): todos leen, clientes anónimos leen carta/menú QR, admin escribe
drop policy if exists "categories_read" on public.categories;
create policy "categories_read" on public.categories for select to authenticated using (public.my_role() is not null);
drop policy if exists "categories_anon_read" on public.categories;
create policy "categories_anon_read" on public.categories for select to anon using (true);
drop policy if exists "categories_admin" on public.categories;
create policy "categories_admin" on public.categories for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists "products_read" on public.products;
create policy "products_read" on public.products for select to authenticated using (public.my_role() is not null);
drop policy if exists "products_anon_read" on public.products;
create policy "products_anon_read" on public.products for select to anon using (active = true);
drop policy if exists "products_admin" on public.products;
create policy "products_admin" on public.products for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

drop policy if exists "tables_read" on public.bar_tables;
create policy "tables_read" on public.bar_tables for select to authenticated using (public.my_role() is not null);
drop policy if exists "tables_anon_read" on public.bar_tables;
create policy "tables_anon_read" on public.bar_tables for select to anon using (active = true);
drop policy if exists "tables_admin" on public.bar_tables;
create policy "tables_admin" on public.bar_tables for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- PEDIDOS
drop policy if exists "orders_read" on public.orders;
create policy "orders_read" on public.orders for select to authenticated using (public.my_role() is not null);
drop policy if exists "orders_insert" on public.orders;
create policy "orders_insert" on public.orders for insert to authenticated with check (public.my_role() is not null);
drop policy if exists "orders_update" on public.orders;
create policy "orders_update" on public.orders for update to authenticated
  using (public.my_role() is not null and status in ('abierta','por_cobrar'))
  with check (public.my_role() is not null and status <> 'pagada');
drop policy if exists "orders_delete" on public.orders;
create policy "orders_delete" on public.orders for delete to authenticated using (public.my_role() = 'admin');

drop policy if exists "items_read" on public.order_items;
create policy "items_read" on public.order_items for select to authenticated using (public.my_role() is not null);
drop policy if exists "items_insert" on public.order_items;
create policy "items_insert" on public.order_items for insert to authenticated
  with check (public.my_role() is not null
              and exists (select 1 from public.orders o where o.id = order_id and o.status in ('abierta','por_cobrar')));
drop policy if exists "items_update" on public.order_items;
create policy "items_update" on public.order_items for update to authenticated using (public.my_role() is not null);
drop policy if exists "items_delete" on public.order_items;
create policy "items_delete" on public.order_items for delete to authenticated
  using (public.my_role() in ('admin','cajero')
         or (public.my_role() = 'mesero' and status = 'pendiente' and created_by = auth.uid()));

-- PAGOS (solo lectura; se insertan vía pay_order)
drop policy if exists "payments_read" on public.payments;
create policy "payments_read" on public.payments for select to authenticated
  using (public.my_role() in ('admin','cajero'));

-- CAJA
drop policy if exists "cash_read" on public.cash_sessions;
create policy "cash_read" on public.cash_sessions for select to authenticated
  using (public.my_role() = 'admin' or (public.my_role() = 'cajero' and cashier_id = auth.uid()));
drop policy if exists "cash_open" on public.cash_sessions;
create policy "cash_open" on public.cash_sessions for insert to authenticated
  with check (public.my_role() in ('admin','cajero') and cashier_id = auth.uid());

-- MOVIMIENTOS DE STOCK
drop policy if exists "stock_read" on public.stock_movements;
create policy "stock_read" on public.stock_movements for select to authenticated using (public.my_role() = 'admin');

-- ---------------------------------------------------------------------
-- 4. TIEMPO REAL (las pantallas se actualizan solas)
-- ---------------------------------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.orders;      exception when others then null; end;
  begin alter publication supabase_realtime add table public.order_items; exception when others then null; end;
  begin alter publication supabase_realtime add table public.products;    exception when others then null; end;
end $$;

-- ---------------------------------------------------------------------
-- 5. DATOS DE EJEMPLO
-- ---------------------------------------------------------------------
insert into public.bar_tables (number, name, capacity)
select n, 'Mesa ' || n, 4 from generate_series(1, 12) n
on conflict (number) do nothing;

insert into public.categories (name, icon, sort_order)
select * from (values
  ('Cervezas', '🍺', 1), ('Cócteles', '🍸', 2), ('Licores', '🥃', 3),
  ('Sin alcohol', '🥤', 4), ('Piqueos', '🍟', 5)
) v(name, icon, sort_order)
where not exists (select 1 from public.categories);

insert into public.products (category_id, name, price, cost, stock, track_stock)
select c.id, p.name, p.price, p.cost, p.stock, p.track
from (values
  ('Cervezas',    'Paceña 620ml',         25, 14, 120, true),
  ('Cervezas',    'Huari 620ml',          28, 16, 80,  true),
  ('Cervezas',    'Corona 355ml',         30, 18, 60,  true),
  ('Cócteles',    'Chuflay',              30, 10, 0,   false),
  ('Cócteles',    'Mojito',               35, 12, 0,   false),
  ('Cócteles',    'Piña Colada',          40, 14, 0,   false),
  ('Licores',     'Singani Casa Real (botella)', 120, 70, 20, true),
  ('Licores',     'Whisky J. Walker Red (vaso)', 45, 20, 0, false),
  ('Sin alcohol', 'Coca-Cola 500ml',      12, 6,  100, true),
  ('Sin alcohol', 'Agua mineral',         10, 4,  100, true),
  ('Piqueos',     'Salchipapa',           35, 15, 0,   false),
  ('Piqueos',     'Pique Macho',          60, 28, 0,   false)
) p(cat, name, price, cost, stock, track)
join public.categories c on c.name = p.cat
where not exists (select 1 from public.products);

-- ---------------------------------------------------------------------
-- 6. CREAR EL PRIMER ADMINISTRADOR
--    1) Crea un usuario en Authentication > Users > Add user
--       Email: admin@bar.app   Password: (la que quieras)  [x] Auto Confirm
--    2) Ejecuta esta línea:
-- ---------------------------------------------------------------------
-- update public.profiles set role = 'admin', active = true, full_name = 'Administrador' where username = 'admin';
