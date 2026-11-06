-- Reserva: dinheiro guardado pelo casal.
-- Cada linha é um movimento: positivo = guardou, negativo = retirou.
-- source 'balance' = saiu do (ou voltou para o) saldo do mês; 'other' = outra fonte/destino.
create table if not exists public.reserve_entries (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  date date not null,
  amount_cents bigint not null check (amount_cents <> 0),
  source text not null check (source in ('balance', 'other')),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists reserve_entries_household_idx on public.reserve_entries (household_id, date);

alter table public.reserve_entries enable row level security;
drop policy if exists "household_rw" on public.reserve_entries;
create policy "household_rw" on public.reserve_entries for all
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

-- Sincronização em tempo real entre Igor e Carol.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reserve_entries') then
    alter publication supabase_realtime add table public.reserve_entries;
  end if;
end $$;

-- Valor inicial da reserva: R$ 6.412,00 (só se houver um único ambiente e a reserva ainda estiver vazia).
do $$
declare
  hid uuid;
begin
  if (select count(*) from public.households) = 1 then
    select id into hid from public.households;
    if not exists (select 1 from public.reserve_entries where household_id = hid) then
      insert into public.reserve_entries (id, household_id, date, amount_cents, source, note)
      values (gen_random_uuid(), hid, date '2026-11-06', 641200, 'other', 'Saldo inicial da reserva');
    end if;
  end if;
end $$;
