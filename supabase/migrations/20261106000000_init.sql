-- Finanças Igor e Carol — esquema inicial
-- Todos os valores monetários em centavos (bigint). Meses de competência em 'YYYY-MM'.
-- Cada registro pertence a um "household" (ambiente financeiro compartilhado).

create extension if not exists pgcrypto;

-- ─────────────────────────── Ambiente compartilhado ───────────────────────────
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Finanças Igor e Carol',
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  person text not null check (person in ('igor', 'carol')),
  display_name text not null,
  email text,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

-- Função auxiliar usada pelas políticas RLS (security definer evita recursão).
create or replace function public.is_household_member(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members m where m.household_id = hid and m.user_id = auth.uid());
$$;

-- ─────────────────────────── Cadastros ───────────────────────────
create table public.categories (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  icon text not null default 'Tag',
  color text not null default '#2f6bf0',
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('credit', 'benefit')),
  name text not null,
  institution text not null default '',
  owner text check (owner in ('igor', 'carol')),
  limit_cents bigint not null default 0 check (limit_cents >= 0),
  closing_day int not null default 1 check (closing_day between 1 and 31),
  due_day int not null default 10 check (due_day between 1 and 31),
  color text not null default '#2f6bf0',
  active boolean not null default true,
  deleted_at timestamptz,               -- remoção lógica: histórico preservado
  created_at timestamptz not null default now()
);

create table public.benefit_entries (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete restrict,
  date date not null,
  amount_cents bigint not null,
  kind text not null check (kind in ('recharge', 'adjust')),
  note text not null default '',
  created_at timestamptz not null default now()
);

-- ─────────────────────────── Despesas e parcelas ───────────────────────────
create table public.expenses (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  description text not null default '',
  category_id uuid not null references public.categories(id) on delete restrict,
  responsible text not null check (responsible in ('igor', 'carol')),
  date date not null,
  method text not null check (method in ('pix', 'credit', 'debit', 'cash', 'benefit')),
  card_id uuid references public.cards(id) on delete restrict,
  installments int not null default 1 check (installments between 1 and 48),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint card_required check ((method in ('credit', 'benefit')) = (card_id is not null))
);
create index expenses_household_date on public.expenses (household_id, date);

create table public.installments (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete restrict,
  number int not null check (number >= 1),
  total int not null check (total >= 1),
  amount_cents bigint not null check (amount_cents >= 0),
  invoice_month text not null check (invoice_month ~ '^\d{4}-\d{2}$'),
  created_at timestamptz not null default now(),
  unique (expense_id, number)
);
create index installments_card_month on public.installments (card_id, invoice_month);

-- Pagamento de fatura: liquida um compromisso já registrado (não é nova despesa).
create table public.invoice_payments (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete restrict,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  amount_cents bigint not null check (amount_cents >= 0),
  paid_at date not null,
  created_at timestamptz not null default now(),
  unique (card_id, month)
);

-- ─────────────────────────── Receitas ───────────────────────────
create table public.income_sources (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  responsible text not null check (responsible in ('igor', 'carol')),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Um registro por fonte e mês: o histórico de cada mês é preservado.
create table public.incomes (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  source_id uuid not null references public.income_sources(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  amount_cents bigint not null check (amount_cents >= 0),
  received_date date,
  created_at timestamptz not null default now(),
  unique (source_id, month)
);

-- ─────────────────────────── Contas fixas ───────────────────────────
create table public.bills (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  category_id uuid not null references public.categories(id) on delete restrict,
  responsible text not null check (responsible in ('igor', 'carol')),
  frequency text not null default 'monthly' check (frequency in ('monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly')),
  start_month text not null check (start_month ~ '^\d{4}-\d{2}$'),
  end_month text check (end_month ~ '^\d{4}-\d{2}$'),
  installments int check (installments is null or installments >= 1),
  pauses jsonb not null default '[]'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint end_after_start check (end_month is null or end_month >= start_month)
);

-- Valor e vencimento vigentes a partir de um mês ("deste mês em diante").
create table public.bill_versions (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete cascade,
  from_month text not null check (from_month ~ '^\d{4}-\d{2}$'),
  amount_cents bigint not null check (amount_cents >= 0),
  due_day int not null check (due_day between 1 and 31),
  created_at timestamptz not null default now(),
  unique (bill_id, from_month)
);

-- Ocorrência mensal: pagamento e ajustes que valem só para aquele mês.
create table public.bill_occurrences (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  due_day int check (due_day is null or due_day between 1 and 31),
  paid_at date,
  paid_amount_cents bigint,
  created_at timestamptz not null default now(),
  unique (bill_id, month)
);

-- ─────────────────────────── RLS ───────────────────────────
alter table public.households enable row level security;
alter table public.household_members enable row level security;

create policy "membros veem o household" on public.households
  for select using (public.is_household_member(id));
create policy "membros atualizam o household" on public.households
  for update using (public.is_household_member(id)) with check (public.is_household_member(id));

create policy "membros veem membros" on public.household_members
  for select using (public.is_household_member(household_id));
create policy "membro edita o próprio perfil" on public.household_members
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['categories','cards','benefit_entries','expenses','installments','invoice_payments',
                           'income_sources','incomes','bills','bill_versions','bill_occurrences']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "household_rw" on public.%I for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id))', t);
  end loop;
end $$;

-- ─────────────────────────── Funções de onboarding ───────────────────────────
-- Cria um novo ambiente e adiciona o usuário atual como dono.
create or replace function public.create_household(p_person text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'usuário já participa de um ambiente';
  end if;
  insert into households default values returning id into hid;
  insert into household_members (household_id, user_id, person, display_name, email, role)
  values (hid, auth.uid(), p_person, p_display_name, (select email from auth.users where id = auth.uid()), 'owner');
  return hid;
end $$;

-- Entra em um ambiente existente pelo código de convite (máximo 2 pessoas).
create or replace function public.join_household(p_code text, p_person text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  select id into hid from households where invite_code = upper(trim(p_code));
  if hid is null then raise exception 'código de convite inválido'; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'usuário já participa de um ambiente';
  end if;
  if (select count(*) from household_members where household_id = hid) >= 2 then
    raise exception 'este ambiente já possui dois membros';
  end if;
  if exists (select 1 from household_members where household_id = hid and person = p_person) then
    raise exception 'essa pessoa já está vinculada a outro usuário';
  end if;
  insert into household_members (household_id, user_id, person, display_name, email, role)
  values (hid, auth.uid(), p_person, p_display_name, (select email from auth.users where id = auth.uid()), 'member');
  return hid;
end $$;

-- Gera um novo código de convite (invalida o anterior).
create or replace function public.rotate_invite_code()
returns text language plpgsql security definer set search_path = public as $$
declare code text; hid uuid;
begin
  select household_id into hid from household_members where user_id = auth.uid();
  if hid is null then raise exception 'sem ambiente'; end if;
  code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  update households set invite_code = code where id = hid;
  return code;
end $$;

-- Remove o outro membro (apenas o dono).
create or replace function public.remove_member(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  select household_id into hid from household_members where user_id = auth.uid() and role = 'owner';
  if hid is null then raise exception 'apenas o dono do ambiente pode remover membros'; end if;
  if p_user = auth.uid() then raise exception 'o dono não pode remover a si mesmo'; end if;
  delete from household_members where household_id = hid and user_id = p_user;
end $$;

grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text, text) to authenticated;
grant execute on function public.rotate_invite_code() to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;

-- Sincronização em tempo real entre Igor e Carol.
alter publication supabase_realtime add table
  public.categories, public.cards, public.benefit_entries, public.expenses, public.installments,
  public.invoice_payments, public.income_sources, public.incomes, public.bills, public.bill_versions, public.bill_occurrences;
