-- Receita pontual (dinheiro extra): vale só no mês indicado e não é projetada para os seguintes.
-- null = receita recorrente (comportamento anterior).
alter table public.income_sources
  add column if not exists one_off_month text check (one_off_month is null or one_off_month ~ '^\d{4}-\d{2}$');
