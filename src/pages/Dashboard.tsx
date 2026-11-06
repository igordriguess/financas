import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, CalendarClock, Check, CreditCard, Gift, Info, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { useStore } from '../store/useStore';
import { benefitBalance, billLines, creditUsage, forecast, futureInstallments, monthSummary } from '../domain/finance';
import { PAYMENT_LABEL, PERSON_LABEL } from '../domain/types';
import { brl } from '../lib/money';
import { useGreeting } from '../lib/greeting';
import { addMonths, currentMonth, fmtDate, monthLabel } from '../lib/months';
import { Button, Card, EmptyState, ListRow, Money, MonthSwitcher, Progress, SectionTitle, cx } from '../components/ui';
import { CategoryIcon } from '../components/icons';
import { PersonTag, WithOwner } from '../components/people';

export function DashboardPage() {
  const data = useStore((s) => s.data);
  const month = useStore((s) => s.month);
  const me = useStore((s) => s.me);
  const greeting = useGreeting();
  const openExpense = useStore((s) => s.openExpense);
  const setBillPaid = useStore((s) => s.setBillPaid);
  const nav = useNavigate();

  const s = useMemo(() => monthSummary(data, month), [data, month]);
  const bills = useMemo(() => billLines(data, month).filter((b) => !b.paid), [data, month]);
  const next = useMemo(() => forecast(data, addMonths(month, 1)), [data, month]);
  const future = useMemo(() => futureInstallments(data, month), [data, month]);
  const benefits = data.cards.filter((c) => c.kind === 'benefit' && !c.deletedAt).map((c) => ({ card: c, balance: benefitBalance(data, c.id) }));
  const credits = data.cards.filter((c) => c.kind === 'credit' && !c.deletedAt && c.active).map((c) => ({ card: c, ...creditUsage(data, c) }));
  const creditAvailable = credits.reduce((a, c) => a + Math.max(0, c.available), 0);
  const creditLimit = credits.reduce((a, c) => a + c.limit, 0);
  const benefitTotal = benefits.reduce((a, b) => a + b.balance, 0);
  const recent = useMemo(() => [...data.expenses].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date))).slice(0, 6), [data.expenses]);
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const cardById = useMemo(() => new Map(data.cards.map((c) => [c.id, c])), [data.cards]);
  const isCurrent = month === currentMonth();
  const tone = s.committedPct >= 100 ? 'red' : s.committedPct >= 85 ? 'amber' : 'green';

  return (
    <div className="animate-fade-in">
      <header className="pb-4 pt-[max(20px,env(safe-area-inset-top))] md:pb-5 md:pt-8">
        <h1 className="break-words text-[28px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white md:text-[32px]">
          {greeting}, {me.displayName || PERSON_LABEL[me.person]}
        </h1>
        <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">Este é o resumo de {monthLabel(month)}</p>
      </header>
      <MonthSwitcher />

      {/* 2.1 Resumo financeiro */}
      <Card className="mt-5 overflow-hidden">
        <div className="bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-white/80">Saldo do mês {isCurrent ? '' : `· ${monthLabel(month)}`}</span>
            {s.incomeHasProjection && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">receita prevista</span>}
          </div>
          <p className={cx('mt-1 text-[34px] font-bold tracking-tight tabular-nums', s.balance < 0 && 'text-red-200')}>{brl(s.balance)}</p>
          <p className="text-[13px] text-white/75">Receitas − contas fixas − gastos à vista − faturas do mês</p>
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-[12px] font-medium text-white/85">
              <span>Renda comprometida</span>
              <span>{s.income > 0 ? `${s.committedPct}%` : '—'}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
              <div
                className={cx('h-full rounded-full transition-all duration-700', tone === 'red' ? 'bg-red-300' : tone === 'amber' ? 'bg-amber-300' : 'bg-emerald-300')}
                style={{ width: `${Math.min(100, s.committedPct)}%` }}
              />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-ink-700">
          <Link to="/receitas" className="p-4 press:bg-slate-50 dark:press:bg-ink-700">
            <span className="flex items-center gap-1 text-[12px] font-medium text-slate-500">
              <ArrowUpRight size={14} className="text-income" /> Receitas
            </span>
            <Money cents={s.income} tone="income" className="mt-0.5 block text-lg font-bold" />
          </Link>
          <Link to="/relatorios" className="p-4 press:bg-slate-50 dark:press:bg-ink-700">
            <span className="flex items-center gap-1 text-[12px] font-medium text-slate-500">
              <ArrowDownRight size={14} className="text-expense" /> Despesas
            </span>
            <Money cents={s.outflows} tone="expense" className="mt-0.5 block text-lg font-bold" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-slate-100 px-4 py-3 text-[12px] dark:border-ink-700">
          <Breakdown label="Contas fixas" value={s.fixed} to="/contas" />
          <Breakdown label="À vista" value={s.cashSpent} to="/despesas" />
          <Breakdown label="Faturas" value={s.creditInvoices} to="/cartoes" />
        </div>
        {s.incomeMissing && (
          <Link to="/receitas" className="flex items-center gap-2 border-t border-slate-100 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800 dark:border-ink-700 dark:bg-amber-500/10 dark:text-amber-200">
            <Info size={16} /> Nenhuma receita registrada. Toque para cadastrar.
          </Link>
        )}
      </Card>

      {/* 2.2 Disponível para gastar */}
      <SectionTitle>Disponível para gastar</SectionTitle>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <Tile icon={Wallet} color="text-income bg-income-soft dark:bg-green-500/15" label="Dinheiro disponível" />
          <Money cents={s.balance} tone="auto" className="mt-2 block text-2xl font-bold" />
          <p className="mt-1 text-[12px] text-slate-500">Considera todas as contas fixas do mês, pagas ou não.</p>
        </Card>
        <Card className="p-4" onClick={() => nav('/cartoes?tab=benefit')}>
          <Tile icon={Gift} color="text-orange-600 bg-orange-50 dark:bg-orange-500/15" label="Benefícios" />
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{brl(benefitTotal)}</p>
          <div className="mt-2 space-y-1">
            {benefits.map((b) => (
              <div key={b.card.id} className="flex justify-between text-[13px]">
                <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span className="h-2 w-2 rounded-full" style={{ background: b.card.color }} />
                  {b.card.name}
                </span>
                <span className={cx('font-semibold tabular-nums', b.balance < 0 ? 'text-expense' : 'text-slate-800 dark:text-slate-100')}>{brl(b.balance)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4" onClick={() => nav('/cartoes')}>
          <Tile icon={CreditCard} color="text-brand-600 bg-brand-50 dark:bg-brand-500/15 dark:text-brand-100" label="Limite de crédito disponível" />
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{brl(creditAvailable)}</p>
          <div className="mt-2">
            <Progress value={creditLimit ? ((creditLimit - creditAvailable) / creditLimit) * 100 : 0} tone="blue" />
            <p className="mt-1 text-[12px] text-slate-500">de {brl(creditLimit)} em {credits.length} cartões</p>
          </div>
        </Card>
        <Card className="p-5">
          <Tile icon={CalendarClock} color="text-expense bg-expense-soft dark:bg-red-500/15" label="Já comprometido" />
          <div className="mt-2 space-y-1.5 text-[13px]">
            <Row label="Contas pendentes do mês" value={s.fixedPending} />
            <Row label="Parcelas em faturas futuras" value={future} />
          </div>
        </Card>
      </div>

      {/* Contas pendentes */}
      <SectionTitle action={<Link to="/contas" className="text-[13px] font-semibold text-brand-500">Ver todas</Link>}>Contas a pagar</SectionTitle>
      <Card>
        {bills.length === 0 ? (
          <div className="flex items-center gap-3 p-4 text-sm text-slate-500">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-income-soft text-income dark:bg-green-500/15">
              <Check size={18} />
            </span>
            {data.bills.length ? 'Todas as contas do mês estão pagas.' : 'Nenhuma conta fixa cadastrada.'}
          </div>
        ) : (
          bills.slice(0, 4).map((b, i) => {
            const c = catById.get(b.bill.categoryId);
            return (
              <div key={b.bill.id} className={cx(i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
                <ListRow
                  left={<WithOwner who={b.bill.responsible}>{c ? <CategoryIcon icon={c.icon} color={c.color} size={38} /> : <span className="h-[38px] w-[38px]" />}</WithOwner>}
                  title={b.bill.name}
                  subtitle={
                    <span className="inline-flex items-center gap-1.5">
                      <span className={cx(b.overdue && 'font-semibold text-expense')}>
                        {b.overdue ? 'Venceu' : 'Vence'} {fmtDate(b.dueDate)}
                      </span>
                      · <PersonTag who={b.bill.responsible} />
                    </span>
                  }
                  right={
                    <div className="flex items-center gap-2">
                      <Money cents={b.amountCents} className="text-[15px] font-semibold text-slate-900 dark:text-white" />
                      <button
                        onClick={() => void setBillPaid(b.bill.id, month, true)}
                        aria-label={`Marcar ${b.bill.name} como paga`}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-income-soft hover:text-income press:scale-90 dark:bg-ink-700"
                      >
                        <Check size={18} />
                      </button>
                    </div>
                  }
                />
              </div>
            );
          })
        )}
        {bills.length > 4 && (
          <Link to="/contas" className="block border-t border-slate-100 p-3 text-center text-[13px] font-semibold text-brand-500 dark:border-ink-700">
            + {bills.length - 4} contas pendentes
          </Link>
        )}
      </Card>

      {/* Próximo mês */}
      <SectionTitle>Próximo mês</SectionTitle>
      <Card onClick={() => nav('/proximo-mes')} className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-slate-500">Saldo projetado para {monthLabel(next.month)}</p>
            <Money cents={next.projectedBalance} tone="auto" className="text-2xl font-bold" />
            <p className="text-[12px] text-slate-500">antes das despesas variáveis</p>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15">
            <TrendingUp size={22} />
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
          <Mini label="Receitas" value={next.income} />
          <Mini label="Contas" value={next.fixed} />
          <Mini label="Cartões" value={next.installments} />
        </div>
      </Card>

      {/* Últimos gastos */}
      <SectionTitle action={<Link to="/despesas" className="text-[13px] font-semibold text-brand-500">Ver todos</Link>}>Últimos gastos</SectionTitle>
      <Card>
        {recent.length === 0 ? (
          <EmptyState icon={Receipt} title="Nenhum gasto ainda" text="Registre o primeiro gasto em poucos segundos." action={<Button onClick={() => openExpense()}>Adicionar gasto</Button>} />
        ) : (
          recent.map((e, i) => {
            const c = catById.get(e.categoryId);
            const card = e.cardId ? cardById.get(e.cardId) : null;
            return (
              <div key={e.id} className={cx(i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
                <ListRow
                  onClick={() => openExpense(e.id)}
                  left={<WithOwner who={e.responsible}>{c ? <CategoryIcon icon={c.icon} color={c.color} size={38} /> : <span className="h-[38px] w-[38px]" />}</WithOwner>}
                  title={e.description || c?.name || 'Gasto'}
                  subtitle={`${fmtDate(e.date)} · ${card ? card.name : PAYMENT_LABEL[e.method]}${e.installments > 1 ? ` · ${e.installments}x` : ''}`}
                  right={<Money cents={-e.amountCents} className="text-[15px] font-semibold text-slate-900 dark:text-white" />}
                />
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}

function Tile({ icon: Icon, color, label }: { icon: typeof Wallet; color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cx('flex h-8 w-8 items-center justify-center rounded-xl', color)}>
        <Icon size={17} />
      </span>
      <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">{label}</span>
    </div>
  );
}
function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{brl(value)}</span>
    </div>
  );
}
function Breakdown({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <Link to={to} className="rounded-xl p-1 press:bg-slate-50 dark:press:bg-ink-700">
      <span className="block text-slate-500">{label}</span>
      <span className="block font-semibold tabular-nums text-slate-800 dark:text-slate-100">{brl(value)}</span>
    </Link>
  );
}
function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2 dark:bg-ink-900">
      <span className="block text-slate-500">{label}</span>
      <span className="block font-semibold tabular-nums text-slate-800 dark:text-slate-100">{brl(value)}</span>
    </div>
  );
}

