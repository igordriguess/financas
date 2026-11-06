import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { useStore } from '../store/useStore';
import { billLines, byResponsible, groupSum, incomeLines, monthSummary, spendingItems } from '../domain/finance';
import { PAYMENT_LABEL, PERSON_LABEL, RESPONSIBLES, type PaymentMethod } from '../domain/types';
import { brl, brlCompact, pct } from '../lib/money';
import { addMonths, fmtDate, monthLabel, monthOf, monthShort } from '../lib/months';
import { Card, ListRow, Money, MonthSwitcher, PageHeader, SectionTitle, cx, span5 } from '../components/ui';
import { CategoryIcon } from '../components/icons';
import { OptionTile } from '../components/filters';
import { PersonAvatar, RESPONSIBLE_COLOR } from '../components/people';

/* Paleta categórica validada (ordem fixa) + tinta de gráfico, clara e escura. */
const VIZ = {
  light: { s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a', grid: '#e1e0d9', axis: '#898781', base: '#c3c2b7' },
  dark: { s1: '#3987e5', s2: '#d95926', s3: '#199e70', grid: '#2c2c2a', axis: '#898781', base: '#383835' },
};

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-[12px] shadow-lg ring-1 ring-black/5 dark:bg-ink-700 dark:ring-white/10">
      <p className="mb-1 font-semibold text-slate-900 dark:text-white">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey as string} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
          {p.name}: <b className="tabular-nums text-slate-900 dark:text-white">{brl(Number(p.value))}</b>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-600 dark:text-slate-300">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <p className="text-[15px] font-semibold text-slate-900 dark:text-white">{title}</p>
      {subtitle && <p className="mb-3 text-[12px] text-slate-500">{subtitle}</p>}
      {children}
    </Card>
  );
}

const METHOD_LABEL: Record<PaymentMethod | 'bill', string> = { ...PAYMENT_LABEL, bill: 'Contas fixas' };

export function ReportsPage() {
  const data = useStore((s) => s.data);
  const month = useStore((s) => s.month);
  const dark = useIsDark();
  const c = dark ? VIZ.dark : VIZ.light;
  const [detail, setDetail] = useState<'incomes' | 'bills' | 'credit' | 'installments' | 'benefit'>('credit');

  const series = useMemo(
    () =>
      [-5, -4, -3, -2, -1, 0].map((n) => {
        const m = addMonths(month, n);
        const s = monthSummary(data, m);
        // Mês sem nenhum dado: não exibimos zero (não inventar valores).
        const empty = s.income === 0 && s.outflows === 0 && s.benefitSpent === 0;
        const v = (x: number) => (empty ? null : x);
        return { m, label: monthShort(m), income: v(s.income), outflows: v(s.outflows), fixed: v(s.fixed), cash: v(s.cashSpent), credit: v(s.creditInvoices), balance: v(s.balance) };
      }),
    [data, month],
  );

  const items = useMemo(() => spendingItems(data, month), [data, month]);
  const total = items.reduce((a, i) => a + i.amountCents, 0);
  const byCat = groupSum(items, (i) => i.categoryId, (i) => i.amountCents);
  const byMethod = groupSum(items, (i) => i.method, (i) => i.amountCents);
  const byWho = byResponsible(data, month);
  const catById = new Map(data.categories.map((x) => [x.id, x]));
  const cardById = new Map(data.cards.map((x) => [x.id, x]));
  const maxCat = Math.max(1, ...byCat.map((x) => x.amountCents));
  const maxMethod = Math.max(1, ...byMethod.map((x) => x.amountCents));

  const axis = { stroke: c.base, tick: { fill: c.axis, fontSize: 11 }, tickLine: false };
  const yAxis = { ...axis, axisLine: false, width: 56, tickFormatter: (v: number) => brlCompact(v) };

  return (
    <div className="animate-fade-in">
      <PageHeader back title="Relatórios" subtitle="Histórico financeiro por competência" />
      <MonthSwitcher />

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Receitas × despesas" subtitle="Últimos 6 meses · despesas = contas fixas + à vista + faturas">
          <Legend items={[{ color: c.s1, label: 'Receitas' }, { color: c.s2, label: 'Despesas' }]} />
          <div className="h-52">
            <ResponsiveContainer>
              <BarChart data={series} barGap={2} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="label" {...axis} />
                <YAxis {...yAxis} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: dark ? '#ffffff0d' : '#0000000a' }} />
                <Bar dataKey="income" name="Receitas" fill={c.s1} radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar dataKey="outflows" name="Despesas" fill={c.s2} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Evolução mensal das despesas" subtitle="Composição das saídas de dinheiro">
          <Legend items={[{ color: c.s1, label: 'Contas fixas' }, { color: c.s2, label: 'À vista' }, { color: c.s3, label: 'Faturas' }]} />
          <div className="h-52">
            <ResponsiveContainer>
              <BarChart data={series} barCategoryGap="34%">
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="label" {...axis} />
                <YAxis {...yAxis} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: dark ? '#ffffff0d' : '#0000000a' }} />
                <Bar dataKey="fixed" name="Contas fixas" stackId="a" fill={c.s1} stroke={dark ? '#181c25' : '#ffffff'} strokeWidth={2} maxBarSize={26} />
                <Bar dataKey="cash" name="À vista" stackId="a" fill={c.s2} stroke={dark ? '#181c25' : '#ffffff'} strokeWidth={2} maxBarSize={26} />
                <Bar dataKey="credit" name="Faturas" stackId="a" fill={c.s3} stroke={dark ? '#181c25' : '#ffffff'} strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Evolução do saldo" subtitle="Saldo do mês (receitas − despesas)">
          <div className="h-48">
            <ResponsiveContainer>
              <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="label" {...axis} />
                <YAxis {...yAxis} />
                <ReferenceLine y={0} stroke={c.base} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="balance" name="Saldo" stroke={c.s1} strokeWidth={2} dot={{ r: 4, fill: c.s1, strokeWidth: 2, stroke: dark ? '#181c25' : '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Por responsável" subtitle={`${monthLabel(month)} · organização, não saldos separados`}>
          <div className="space-y-3">
            {RESPONSIBLES.map((p) => (
              <div key={p}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span className="inline-flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                    <PersonAvatar who={p} size={22} />
                    {PERSON_LABEL[p]}
                  </span>
                  <span className="tabular-nums text-slate-600 dark:text-slate-300">
                    {brl(byWho[p])} · {pct(byWho[p], total)}%
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-ink-700">
                  <div className="h-full rounded-full" style={{ width: `${pct(byWho[p], total)}%`, background: RESPONSIBLE_COLOR[p] }} />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <SectionTitle>Gastos por categoria · {monthLabel(month)}</SectionTitle>
      <Card className="p-5">
        <p className="mb-3 text-[12px] text-slate-500">Inclui compras à vista e com benefício do mês, parcelas que vencem no mês e contas fixas. Total: {brl(total)}</p>
        {byCat.length === 0 ? (
          <p className="text-sm text-slate-500">Sem gastos neste mês.</p>
        ) : (
          <div className="space-y-3">
            {byCat.map((x) => {
              const cat = catById.get(x.key);
              return (
                <div key={x.key} className="flex items-center gap-3">
                  {cat && <CategoryIcon icon={cat.icon} color={cat.color} size={34} />}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex justify-between text-[13px]">
                      <span className="min-w-0 break-words font-medium text-slate-700 dark:text-slate-200">{cat?.name ?? 'Sem categoria'}</span>
                      <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">
                        {brl(x.amountCents)} <span className="text-slate-400">· {pct(x.amountCents, total)}%</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-ink-700">
                      <div className="h-full rounded-full" style={{ width: `${(x.amountCents / maxCat) * 100}%`, background: c.s1 }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <SectionTitle>Gastos por forma de pagamento</SectionTitle>
      <Card className="p-5">
        {byMethod.length === 0 ? (
          <p className="text-sm text-slate-500">Sem gastos neste mês.</p>
        ) : (
          <div className="space-y-3">
            {byMethod.map((x) => (
              <div key={x.key}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{METHOD_LABEL[x.key as PaymentMethod | 'bill']}</span>
                  <span className="tabular-nums text-slate-600 dark:text-slate-300">
                    {brl(x.amountCents)} <span className="text-slate-400">· {pct(x.amountCents, total)}%</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-ink-700">
                  <div className="h-full rounded-full" style={{ width: `${(x.amountCents / maxMethod) * 100}%`, background: c.s1 }} />
                </div>
              </div>
            ))}
            <p className="text-[12px] text-slate-500">Cartão de crédito = parcelas das faturas que vencem no mês.</p>
          </div>
        )}
      </Card>

      <SectionTitle>Detalhes do mês</SectionTitle>
      <div className="grid grid-cols-6 gap-2 md:grid-cols-5" role="group" aria-label="Detalhes do mês">
        {(
          [
            ['incomes', 'Receitas'],
            ['bills', 'Contas'],
            ['credit', 'Crédito'],
            ['installments', 'Parcelas'],
            ['benefit', 'Benefícios'],
          ] as [typeof detail, string][]
        ).map(([v, l], i) => (
          <OptionTile key={v} className={cx(span5(i), 'md:col-span-1')} active={detail === v} onClick={() => setDetail(v)}>
            {l}
          </OptionTile>
        ))}
      </div>
      <Card className="mt-5">
        <DetailList kind={detail} catById={catById} cardById={cardById} />
      </Card>
    </div>
  );
}

function DetailList({ kind, catById, cardById }: { kind: string; catById: Map<string, { name: string; icon: string; color: string }>; cardById: Map<string, { name: string }> }) {
  const data = useStore((s) => s.data);
  const month = useStore((s) => s.month);
  const openExpense = useStore((s) => s.openExpense);
  const rows: { key: string; title: string; sub: string; value: number; cat?: string; onClick?: () => void }[] = [];

  if (kind === 'incomes') for (const l of incomeLines(data, month)) rows.push({ key: l.source.id, title: l.source.name, sub: l.projected ? 'previsto' : l.record?.receivedDate ? `recebido ${fmtDate(l.record.receivedDate)}` : 'registrado', value: l.amountCents });
  if (kind === 'bills') for (const l of billLines(data, month)) rows.push({ key: l.bill.id, title: l.bill.name, sub: `${l.paid ? 'paga' : 'pendente'} · vence ${fmtDate(l.dueDate)}`, value: l.amountCents, cat: l.bill.categoryId });
  if (kind === 'credit')
    for (const e of data.expenses.filter((x) => x.method === 'credit' && monthOf(x.date) === month).sort((a, b) => b.date.localeCompare(a.date)))
      rows.push({ key: e.id, title: e.description || catById.get(e.categoryId)?.name || 'Compra', sub: `${fmtDate(e.date)} · ${cardById.get(e.cardId ?? '')?.name ?? ''}${e.installments > 1 ? ` · ${e.installments}x` : ''}`, value: e.amountCents, cat: e.categoryId, onClick: () => openExpense(e.id) });
  if (kind === 'installments') {
    const exp = new Map(data.expenses.map((e) => [e.id, e]));
    for (const i of data.installments.filter((x) => x.invoiceMonth === month)) {
      const e = exp.get(i.expenseId);
      rows.push({ key: i.id, title: e?.description || (e && catById.get(e.categoryId)?.name) || 'Parcela', sub: `${cardById.get(i.cardId)?.name ?? ''} · ${i.number}/${i.total}`, value: i.amountCents, cat: e?.categoryId, onClick: e ? () => openExpense(e.id) : undefined });
    }
  }
  if (kind === 'benefit')
    for (const e of data.expenses.filter((x) => x.method === 'benefit' && monthOf(x.date) === month).sort((a, b) => b.date.localeCompare(a.date)))
      rows.push({ key: e.id, title: e.description || catById.get(e.categoryId)?.name || 'Compra', sub: `${fmtDate(e.date)} · ${cardById.get(e.cardId ?? '')?.name ?? ''}`, value: e.amountCents, cat: e.categoryId, onClick: () => openExpense(e.id) });

  if (!rows.length) return <p className="p-4 text-center text-sm text-slate-500">Nada registrado em {monthLabel(month)}.</p>;
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <>
      {rows.map((r, i) => {
        const cat = r.cat ? catById.get(r.cat) : null;
        return (
          <div key={r.key} className={cx(i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
            <ListRow onClick={r.onClick} left={cat && <CategoryIcon icon={cat.icon} color={cat.color} size={36} />} title={r.title} subtitle={r.sub} right={<Money cents={r.value} className="text-[15px] font-semibold text-slate-900 dark:text-white" />} />
          </div>
        );
      })}
      <div className="flex justify-between border-t border-slate-100 px-4 py-3 text-[14px] font-semibold dark:border-ink-700">
        <span>Total</span>
        <span className="tabular-nums">{brl(total)}</span>
      </div>
    </>
  );
}
