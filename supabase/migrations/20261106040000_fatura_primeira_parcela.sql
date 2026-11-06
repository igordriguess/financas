-- Compra no cartão com a fatura da 1ª parcela escolhida manualmente
-- (ex.: o banco lançou na fatura seguinte; ou conta antiga convertida em gasto variável).
-- null = calculada pela data da compra e pelo fechamento do cartão.
alter table public.expenses add column if not exists first_invoice_month text;
alter table public.expenses drop constraint if exists expenses_first_invoice_month_check;
alter table public.expenses add constraint expenses_first_invoice_month_check
  check (first_invoice_month is null or (first_invoice_month ~ '^\d{4}-\d{2}$' and method = 'credit'));
