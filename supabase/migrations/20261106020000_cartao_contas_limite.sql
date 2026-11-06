-- 1) Contas fixas cobradas em um cartão de crédito (ex.: Netflix no Nubank).
--    A conta continua contando uma vez no orçamento (como conta fixa); no cartão ela entra na fatura e ocupa o limite.
alter table public.bills add column if not exists card_id uuid references public.cards(id) on delete set null;
create index if not exists bills_card on public.bills (card_id);

-- 2) Limite já usado fora do app (compras anteriores), calculado a partir do "limite disponível" informado.
alter table public.cards add column if not exists external_used_cents bigint not null default 0;

-- 3) Vincula automaticamente as contas "Cartão <nome>" ao cartão de mesmo nome (ex.: "Cartão Santander" → Santander).
--    Só altera contas ainda sem cartão. Pode ser executado mais de uma vez.
update public.bills b
set card_id = c.id
from public.cards c
where b.card_id is null
  and c.household_id = b.household_id
  and c.kind = 'credit'
  and c.deleted_at is null
  and lower(b.name) = lower('Cartão ' || c.name);
