-- 1) Responsável "casal" para despesas e contas (apenas organização; tudo sai do orçamento conjunto).
alter table public.expenses drop constraint if exists expenses_responsible_check;
alter table public.expenses add constraint expenses_responsible_check check (responsible in ('igor', 'carol', 'casal'));

alter table public.bills drop constraint if exists bills_responsible_check;
alter table public.bills add constraint bills_responsible_check check (responsible in ('igor', 'carol', 'casal'));

-- 2) Contas já em andamento: quantas parcelas foram pagas antes do mês de início (ex.: começa na 47ª de 48 → 46).
alter table public.bills add column if not exists installment_offset int not null default 0;
alter table public.bills drop constraint if exists bills_installment_offset_check;
alter table public.bills add constraint bills_installment_offset_check
  check (installment_offset >= 0 and (installments is null or installment_offset < installments));
