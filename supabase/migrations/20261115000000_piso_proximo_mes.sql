-- Valor do mês seguinte que nunca pode ser comprometido no crédito ("Pode gastar").
-- Antes fixo em R$ 2.500,00 no código; agora ajustável no menu Mais e compartilhado pelo ambiente.
alter table public.households
  add column if not exists next_month_floor_cents bigint not null default 250000
  check (next_month_floor_cents >= 0 and next_month_floor_cents <= 10000000000);

-- Sincronização em tempo real: quando um muda o valor, o outro celular atualiza.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'households') then
    alter publication supabase_realtime add table public.households;
  end if;
end $$;
