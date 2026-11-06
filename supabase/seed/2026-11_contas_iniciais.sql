-- Cadastro das contas de Igor, Carol e do casal a partir de Novembro/2026.
-- Rode DEPOIS de 20261106010000_casal_parcela_atual.sql.
-- Pode ser executado mais de uma vez: contas já cadastradas (mesmo nome, responsável e valor) são ignoradas.
-- Vencimento: dia 10 para todas (não informado) — ajuste em Contas → toque na conta → "deste mês em diante".

do $$
declare
  hid uuid;
  n int;
  r record;
  bid uuid;
  cid uuid;
  criadas int := 0;
  ignoradas int := 0;
begin
  select count(*) into n from public.households;
  if n <> 1 then
    raise exception 'Esperado exatamente 1 ambiente, encontrado %. Ajuste o script para o household correto.', n;
  end if;
  select id into hid from public.households;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bills' and column_name = 'installment_offset') then
    raise exception 'Rode antes a migração 20261106010000_casal_parcela_atual.sql';
  end if;

  -- Categorias novas (só cria as que ainda não existem)
  insert into public.categories (id, household_id, name, icon, color, sort_order)
  select gen_random_uuid(), hid, c.name, c.icon, c.color,
         (select coalesce(max(sort_order), 0) from public.categories where household_id = hid) + c.ord
  from (values
    ('Cartões de crédito',          'CreditCard',  '#2563eb', 1),
    ('Empréstimos e financiamentos','Landmark',    '#64748b', 2),
    ('Veículos',                    'Car',         '#0ea5e9', 3),
    ('Seguros',                     'ShieldCheck', '#14b8a6', 4),
    ('Impostos e taxas',            'Receipt',     '#a16207', 5)
  ) as c(name, icon, color, ord)
  where not exists (
    select 1 from public.categories x
    where x.household_id = hid and lower(x.name) = lower(c.name) and x.archived_at is null
  );

  -- name, responsável, categoria, valor (centavos), término, total de parcelas, parcelas já pagas
  for r in
    select * from (values
      -- Igor
      ('Cartão Mercado Pago', 'igor',  'Cartões de crédito',            97800, '2026-11', null::int, 0),
      ('Cartão Carrefour',    'igor',  'Cartões de crédito',            99848, '2026-11', null,      0),
      ('Claro',               'igor',  'Contas da casa',                 5000, null,      null,      0),
      ('Netflix',             'igor',  'Assinaturas',                    2000, null,      null,      0),
      ('Futebol',             'igor',  'Lazer',                         12000, null,      null,      0),
      -- Carol
      ('Dindin Santander',    'carol', 'Empréstimos e financiamentos',  13000, null,      null,      0),
      ('Claro',               'carol', 'Contas da casa',                 8092, null,      null,      0),
      ('Cartão Santander',    'carol', 'Cartões de crédito',           138680, '2026-11', null,      0),
      ('Faculdade',           'carol', 'Educação',                      66128, '2026-12', 48,       46),
      ('Sicredi',             'carol', 'Empréstimos e financiamentos',   1250, null,      null,      0),
      ('Moto',                'carol', 'Veículos',                      56414, '2028-09', 48,       25),
      ('C&A',                 'carol', 'Cartões de crédito',            15865, '2026-11', null,      0),
      ('Cartão Renner',       'carol', 'Cartões de crédito',            27731, '2026-11', null,      0),
      ('Cartão Riachuelo',    'carol', 'Cartões de crédito',            75982, '2026-11', null,      0),
      ('Formatura',           'carol', 'Educação',                      40778, null,      null,      0),
      ('DAS',                 'carol', 'Impostos e taxas',              10801, null,      null,      0),
      ('Conta Will',          'carol', 'Empréstimos e financiamentos',  34346, '2026-12', 21,       19),
      -- Casal
      ('IPTU',                'casal', 'Impostos e taxas',               5974, null,      null,      0),
      ('Seguro',              'casal', 'Seguros',                        2416, null,      null,      0),
      ('Aluguel',             'casal', 'Moradia',                      359000, null,      null,      0),
      ('Condomínio',          'casal', 'Moradia',                       84153, null,      null,      0),
      ('Carro',               'casal', 'Veículos',                     206000, null,      null,      0),
      ('Seguro',              'casal', 'Seguros',                       26200, null,      null,      0),
      ('Internet',            'casal', 'Contas da casa',                10000, null,      null,      0),
      ('Energia',             'casal', 'Contas da casa',                21540, null,      null,      0)
    ) as t(name, resp, cat, cents, end_month, total, paid_before)
  loop
    if exists (
      select 1 from public.bills b
      join public.bill_versions v on v.bill_id = b.id
      where b.household_id = hid and b.archived_at is null
        and b.name = r.name and b.responsible = r.resp and v.amount_cents = r.cents
    ) then
      ignoradas := ignoradas + 1;
      continue;
    end if;

    select id into cid from public.categories
    where household_id = hid and lower(name) = lower(r.cat) and archived_at is null
    order by sort_order limit 1;
    if cid is null then
      raise exception 'Categoria "%" não encontrada (conta %)', r.cat, r.name;
    end if;

    bid := gen_random_uuid();
    insert into public.bills (id, household_id, name, category_id, responsible, frequency, start_month, end_month, installments, installment_offset)
    values (bid, hid, r.name, cid, r.resp, 'monthly', '2026-11', r.end_month, r.total, r.paid_before);

    insert into public.bill_versions (id, household_id, bill_id, from_month, amount_cents, due_day)
    values (gen_random_uuid(), hid, bid, '2026-11', r.cents, 10);

    criadas := criadas + 1;
  end loop;

  raise notice 'Contas cadastradas: %, já existentes (ignoradas): %', criadas, ignoradas;
end $$;
