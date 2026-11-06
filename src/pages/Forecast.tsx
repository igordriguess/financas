import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Info } from 'lucide-react';
import { useStore } from '../store/useStore';
import { forecast, invoiceDueDate, type BillLine } from '../domain/finance';
import { brl } from '../lib/money';
import { addMonths, currentMonth, fmtDate, monthLabel } from '../lib/months';
import { Badge, Card, ListRow, Money, MonthSwitcher, PageHeader, SectionTitle, cx } from '../components/ui';
import { PersonTag } from '../components/people';

export function ForecastPage() {
  const data = useStore((s) => s.data);
  const [month, setMonth] = useState(() => addMonths(currentMonth(), 1));
  const f = useMemo(() => forecast(data, month), [data, month]);

  return (
    <div className="animate-fade-in">
      <PageHeader back title="Próximo mês" subtitle="Compromissos já conhecidos" />
      <MonthSwitcher value={month} onChange={setMonth} />

      <Card className="mt-5 overflow-hidden">
        <div className="p-5">
          <p className="text-[13px] text-slate-500">Saldo projetado · {monthLabel(month)}</p>
          <Money cents={f.projectedBalance} tone="auto" className="text-[32px] font-bold" />
          <p className="text-[12px] text-slate-500">antes das despesas variáveis</p>
        </div>
        <div className="space-y-2 border-t border-slate-100 p-5 text-[14px] dark:border-ink-700">
          <Line label="Receitas previstas" value={f.income} sign="+" />
          <Line label="Contas fixas e recorrentes" value={f.recurringBills.reduce((a, b) => a + b.amountCents, 0)} sign="−" />
          <Line label="Contas parceladas / com término" value={f.termBills.reduce((a, b) => a + b.amountCents, 0)} sign="−" />
          <Line label="Faturas de cartões" value={f.installments} sign="−" />
          <div className="flex justify-between border-t border-dashed border-slate-200 pt-2 font-semibold dark:border-ink-600">
            <span>Total de compromissos</span>
            <span className="tabular-nums text-expense">{brl(f.commitments)}</span>
          </div>
        </div>
      </Card>

      <div className="mt-3 space-y-2">
        {f.warnings.map((w) => (
          <div key={w} className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-[13px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            <Info size={16} className="mt-0.5 shrink-0" /> {w}
          </div>
        ))}
        {f.variableAverage !== null && (
          <div className="rounded-2xl bg-slate-100 p-3 text-[13px] text-slate-600 dark:bg-ink-800 dark:text-slate-300">
            Referência: nos últimos meses, os gastos à vista (Pix, débito e dinheiro) foram em média <b>{brl(f.variableAverage)}</b>/mês. Esse valor <b>não</b> está incluído no saldo projetado.
          </div>
        )}
      </div>

      <SectionTitle>Receitas previstas</SectionTitle>
      <Card>
        {f.incomes.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Nenhuma receita cadastrada.</p>
        ) : (
          f.incomes.map((l, i) => (
            <div key={l.source.id} className={cx(i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
              <ListRow
                title={l.source.name}
                subtitle={l.missing ? 'Sem dados para projetar' : l.projected ? 'Repete o último valor registrado' : 'Valor registrado para o mês'}
                right={l.missing ? <Badge tone="amber">sem dados</Badge> : <Money cents={l.amountCents} tone="income" className="text-[15px] font-semibold" />}
              />
            </div>
          ))
        )}
      </Card>

      <BillSection title="Contas fixas e recorrentes" lines={f.recurringBills} />
      <BillSection title="Contas parceladas / com término" lines={f.termBills} />

      <SectionTitle>Faturas de cartões</SectionTitle>
      {f.cards.length === 0 ? (
        <Card>
          <p className="p-5 text-sm text-slate-500">Nenhuma fatura prevista para {monthLabel(month)}.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {f.cards.map((c) => (
            <Card key={c.card.id} className="overflow-hidden">
              <Link
                to={`/cartoes/${c.card.id}`}
                className="flex items-center gap-3.5 px-4 py-4 transition-colors md:px-5 [@media(hover:hover)]:hover:bg-slate-50 dark:[@media(hover:hover)]:hover:bg-ink-700/60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: c.card.color }}>
                  <CreditCard size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[15px] font-semibold text-slate-900 dark:text-white">Fatura {c.card.name}</p>
                  <p className="text-[13px] text-slate-500">
                    {c.card.deletedAt ? 'Cartão removido' : `Vence ${fmtDate(invoiceDueDate(c.card, month))}`}
                  </p>
                </div>
                <Money cents={c.amountCents} className="text-[16px] font-bold text-slate-900 dark:text-white" />
              </Link>
              <div className="border-t border-slate-100 bg-slate-50/60 dark:border-ink-700 dark:bg-ink-900/40">
                {c.purchases > 0 && (
                  <div className="flex items-center justify-between px-4 py-2.5 text-[13px] md:px-5">
                    <span className="text-slate-600 dark:text-slate-300">Parcelas de compras</span>
                    <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{brl(c.purchases)}</span>
                  </div>
                )}
                {c.bills.map((l) => (
                  <div key={l.bill.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] md:px-5">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-slate-600 dark:text-slate-300">
                      <span className="break-words">{l.bill.name}</span>
                      <PersonTag who={l.bill.responsible} />
                      {l.total && l.total > 1 && <span className="shrink-0 text-slate-400">· {l.index}/{l.total}</span>}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-800 dark:text-slate-100">{brl(l.amountCents)}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Line({ label, value, sign }: { label: string; value: number; sign: '+' | '−' }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className={cx('tabular-nums font-medium', sign === '+' ? 'text-income' : 'text-slate-800 dark:text-slate-100')}>
        {sign} {brl(value)}
      </span>
    </div>
  );
}

function BillSection({ title, lines }: { title: string; lines: BillLine[] }) {
  if (!lines.length) return null;
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <Card>
        {lines.map((l, i) => (
          <div key={l.bill.id} className={cx(i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
            <ListRow
              title={l.bill.name}
              subtitle={
                <>
                  Vence {fmtDate(l.dueDate)} · <PersonTag who={l.bill.responsible} />
                  {l.total && l.total > 1 ? ` · ${l.index}/${l.total}` : ''}
                </>
              }
              right={<Money cents={l.amountCents} className="text-[15px] font-semibold text-slate-900 dark:text-white" />}
            />
          </div>
        ))}
      </Card>
    </>
  );
}
