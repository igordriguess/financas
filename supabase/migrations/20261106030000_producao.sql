-- Ajustes para produção.

-- 1) Segurança: o membro só pode alterar o próprio NOME de exibição.
--    Antes era possível um membro mudar o próprio papel para "owner" (e depois remover o dono)
--    ou trocar a pessoa vinculada. Papel e vínculo agora só mudam pelas funções do sistema.
revoke update on public.household_members from anon, authenticated;
grant update (display_name) on public.household_members to authenticated;

-- 2) Contas pagas pela fatura do cartão: marcação de origem.
--    "Desfazer pagamento da fatura" passa a desfazer só o que foi quitado por ela,
--    e não uma conta que tenha sido marcada como paga separadamente.
alter table public.bill_occurrences add column if not exists paid_via_invoice boolean not null default false;

-- 3) Valor pago congelado nos pagamentos já existentes: editar a conta depois não muda um mês já quitado.
update public.bill_occurrences o
set paid_amount_cents = coalesce(
  o.amount_cents,
  (select bv.amount_cents from public.bill_versions bv
    where bv.bill_id = o.bill_id and bv.from_month <= o.month
    order by bv.from_month desc limit 1),
  (select bv.amount_cents from public.bill_versions bv
    where bv.bill_id = o.bill_id
    order by bv.from_month asc limit 1)
)
where o.paid_at is not null and o.paid_amount_cents is null;
