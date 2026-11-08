import { useMemo, useState } from 'react';
import { cardGradient } from '../lib/color';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CheckCircle2, CreditCard, Gift, Info, Pencil, Plus, RefreshCcw, Shuffle, Trash2, Undo2, Wallet } from 'lucide-react';
import { useStore } from '../store/useStore';
import {
  benefitBalance,
  currentInvoiceMonth,
  invoicePaidInfo,
  billEndMonth,
  billVersionAt,
  cardBillLines,
  creditUsage,
  invoiceClosingDate,
  invoiceDueDate,
  invoiceStatus,
  invoiceTotal,
  isInvoicePaid,
  type InvoiceStatus,
} from '../domain/finance';
import { PEOPLE, PERSON_LABEL, type Card as CardT, type CardKind, type Person } from '../domain/types';
import { brl } from '../lib/money';
import { addMonths, fmtDate, monthLabel, monthShort, todayISO, type Month } from '../lib/months';
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, ListRow, Money, MoneyInput, PageHeader, Progress, Segmented, SectionTitle, Sheet, cx, useResetOnOpen } from '../components/ui';
import { CategoryIcon } from '../components/icons';
import { PersonGlyph, PersonTag, WithOwner } from '../components/people';

const STATUS: Record<InvoiceStatus, { label: string; tone: 'gray' | 'green' | 'red' | 'blue' | 'amber' }> = {
  open: { label: 'Aberta', tone: 'blue' },
  closed: { label: 'Fechada', tone: 'amber' },
  overdue: { label: 'Vencida', tone: 'red' },
  paid: { label: 'Paga', tone: 'green' },
  future: { label: 'Futura', tone: 'gray' },
  empty: { label: 'Sem lançamentos', tone: 'gray' },
};

/* ───────────────────────── Lista ───────────────────────── */
export function CardsPage() {
  const data = useStore((s) => s.data);
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as CardKind) || 'credit';
  const [formOpen, setFormOpen] = useState(false);
  const nav = useNavigate();
  const today = todayISO();

  const cards = data.cards.filter((c) => c.kind === tab && !c.deletedAt).sort((a, b) => Number(b.active) - Number(a.active) || a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="animate-fade-in">
      <PageHeader title="Cartões" subtitle="Crédito e benefícios" actions={<Button size="sm" icon={Plus} onClick={() => setFormOpen(true)}>Novo</Button>} />
      <Segmented
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
        options={[
          { value: 'credit', label: 'Crédito' },
          { value: 'benefit', label: 'Benefícios' },
        ]}
      />

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((c) => {
          if (c.kind === 'benefit') {
            const bal = benefitBalance(data, c.id);
            return (
              <VisualCard key={c.id} card={c} onClick={() => nav(`/cartoes/${c.id}`)}>
                <p className="text-[12px] text-white/75">Saldo disponível</p>
                <p className="text-[26px] font-bold tabular-nums">{brl(bal)}</p>
                <p className="text-[12px] text-white/75">{c.owner ? PERSON_LABEL[c.owner] : ''}</p>
              </VisualCard>
            );
          }
          const u = creditUsage(data, c);
          const cur = currentInvoiceMonth(data, c, today);
          const st = invoiceStatus(data, c, cur, today);
          return (
            <VisualCard key={c.id} card={c} onClick={() => nav(`/cartoes/${c.id}`)}>
              <p className="text-[12px] text-white/75">Limite disponível</p>
              <p className="text-[26px] font-bold tabular-nums">{c.limitCents ? brl(u.available) : 'Defina o limite'}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/25">
                <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, u.usedPct)}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 text-[12px] text-white/85">
                <span>
                  Fatura {monthShort(cur)}: <b className="tabular-nums">{brl(invoiceTotal(data, c.id, cur))}</b>
                </span>
                <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
                  {st === 'paid' ? '✓ Paga' : st === 'empty' ? 'Sem lançamentos' : `${STATUS[st].label} · vence ${fmtDate(invoiceDueDate(c, cur)).slice(0, 5)}`}
                </span>
              </div>
            </VisualCard>
          );
        })}
      </div>
      {cards.length === 0 && (
        <Card className="mt-5">
          <EmptyState icon={tab === 'credit' ? CreditCard : Gift} title="Nenhum cartão" text="Cadastre seu primeiro cartão." action={<Button onClick={() => setFormOpen(true)}>Adicionar cartão</Button>} />
        </Card>
      )}
      <CardForm open={formOpen} onClose={() => setFormOpen(false)} kind={tab} />
    </div>
  );
}

function VisualCard({ card, children, onClick }: { card: CardT; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cx('relative w-full overflow-hidden rounded-3xl p-5 text-left text-white shadow-card transition press:scale-[0.99]', !card.active && 'opacity-60 grayscale')}
      style={{ background: cardGradient(card.color) }}
    >
      <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-16 right-10 h-40 w-40 rounded-full bg-white/5" />
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[15px] font-bold">{card.name}</span>
        <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-white/75">
          {!card.active && 'inativo · '}
          {card.kind === 'credit' ? <CreditCard size={16} /> : <Gift size={16} />}
        </span>
      </div>
      {children}
    </button>
  );
}

/* ───────────────────────── Detalhe ───────────────────────── */
export function CardDetailPage() {
  const { id } = useParams();
  const data = useStore((s) => s.data);
  const card = data.cards.find((c) => c.id === id);
  const [editOpen, setEditOpen] = useState(false);
  const removeCard = useStore((s) => s.removeCard);
  const confirm = useStore((s) => s.confirm);
  const nav = useNavigate();

  if (!card) return <EmptyState icon={CreditCard} title="Cartão não encontrado" action={<Link to="/cartoes" className="font-semibold text-brand-500">Voltar</Link>} />;

  async function remove() {
    const hasFuture = data.installments.some((i) => i.cardId === card!.id && !isInvoicePaid(data, card!.id, i.invoiceMonth));
    const ok = await confirm({
      title: `Remover ${card!.name}?`,
      message: `O cartão deixará de aparecer para novos lançamentos. Todas as despesas e parcelas já registradas serão preservadas no histórico.${hasFuture ? ' Atenção: ainda existem parcelas em aberto neste cartão — elas continuarão contando nos meses correspondentes.' : ''}`,
      confirmText: 'Remover cartão',
      danger: true,
    });
    if (!ok) return;
    await removeCard(card!.id);
    nav('/cartoes', { replace: true });
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        back
        title={card.name}
        subtitle={card.deletedAt ? 'Cartão removido — somente histórico' : card.institution}
        actions={
          !card.deletedAt && (
            <>
              <IconButton icon={Pencil} label="Editar cartão" onClick={() => setEditOpen(true)} />
              <IconButton icon={Trash2} label="Remover cartão" onClick={remove} className="text-expense" />
            </>
          )
        }
      />
      {card.kind === 'credit' ? <CreditDetail card={card} /> : <BenefitDetail card={card} />}
      <CardForm open={editOpen} onClose={() => setEditOpen(false)} kind={card.kind} card={card} />
    </div>
  );
}

function CreditDetail({ card }: { card: CardT }) {
  const data = useStore((s) => s.data);
  const payInvoice = useStore((s) => s.payInvoice);
  const unpayInvoice = useStore((s) => s.unpayInvoice);
  const confirm = useStore((s) => s.confirm);
  const openExpense = useStore((s) => s.openExpense);
  const nav = useNavigate();
  const today = todayISO();
  const [month, setMonth] = useState<Month>(() => currentInvoiceMonth(data, card, today));
  const [limitSheet, setLimitSheet] = useState<'total' | 'available' | null>(null);
  const [converting, setConverting] = useState<string | null>(null);
  const convertBillToExpense = useStore((s) => s.convertBillToExpense);
  const u = creditUsage(data, card, today);
  const total = invoiceTotal(data, card.id, month);
  const status = invoiceStatus(data, card, month, today);
  const payment = isInvoicePaid(data, card.id, month);
  const payInfo = invoicePaidInfo(data, card, month);
  const expById = useMemo(() => new Map(data.expenses.map((e) => [e.id, e])), [data.expenses]);
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const items = data.installments
    .filter((i) => i.cardId === card.id && i.invoiceMonth === month)
    .sort((a, b) => (expById.get(b.expenseId)?.date ?? '').localeCompare(expById.get(a.expenseId)?.date ?? ''));
  const billItems = cardBillLines(data, card.id, month, today);
  const cardBills = data.bills.filter((b) => b.cardId === card.id && !b.archivedAt).sort((a, b) => a.name.localeCompare(b.name));
  const openMonth = currentInvoiceMonth(data, card, today);

  // Próximas faturas: parcelas + contas fixas do cartão (previsão).
  const upcoming = useMemo(() => {
    const m = new Map<Month, number>();
    for (const i of data.installments) if (i.cardId === card.id && i.invoiceMonth > month) m.set(i.invoiceMonth, (m.get(i.invoiceMonth) ?? 0) + i.amountCents);
    for (let k = 1; k <= 12; k++) {
      const mm = addMonths(month, k);
      const v = cardBillLines(data, card.id, mm).reduce((a, l) => a + l.amountCents, 0);
      if (v) m.set(mm, (m.get(mm) ?? 0) + v);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 12);
  }, [data, card.id, month]);
  const maxUp = Math.max(1, ...upcoming.map(([, v]) => v));

  async function pay() {
    const ok = await confirm({
      title: 'Marcar fatura como paga?',
      message: `Fatura de ${monthLabel(month)} — ${brl(total)}. O pagamento liquida as compras e contas já registradas; não cria uma nova despesa.${billItems.some((l) => !l.paid) ? ' As contas fixas deste cartão no mês também serão marcadas como pagas.' : ''}`,
      confirmText: 'Confirmar pagamento',
    });
    if (ok) await payInvoice(card.id, month, total, today);
  }

  async function convertOne(billId: string) {
    const b = cardBills.find((x) => x.id === billId);
    if (!b) return;
    const ok = await confirm({
      title: `Converter ${b.name} em gasto?`,
      message: 'Vira uma compra no cartão (gasto variável) com as parcelas restantes nas mesmas faturas. Sai da lista de contas fixas; meses já pagos ficam no histórico.',
      confirmText: 'Converter',
    });
    if (!ok) return;
    setConverting(billId);
    try {
      await convertBillToExpense(billId);
    } finally {
      setConverting(null);
    }
  }
  async function convertAll() {
    const ok = await confirm({
      title: `Converter ${cardBills.length} contas em gastos?`,
      message: 'Todas viram compras no cartão (gastos variáveis), com as parcelas restantes nas mesmas faturas. Meses já pagos ficam no histórico.',
      confirmText: 'Converter todas',
    });
    if (!ok) return;
    setConverting('all');
    try {
      for (const b of cardBills) if (billEndMonth(b)) await convertBillToExpense(b.id);
    } finally {
      setConverting(null);
    }
  }

  const tone = u.usedPct > 90 ? 'red' : u.usedPct > 70 ? 'amber' : 'blue';

  return (
    <div className="space-y-8">
      {/* ── Limite ── */}
      <section>
        <SectionTitle>Limite</SectionTitle>
        <Card className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[13px] text-slate-500">Disponível</p>
              <Money cents={u.available} tone={u.available < 0 ? 'expense' : 'income'} className="text-[30px] font-bold leading-tight" />
              <p className="text-[13px] text-slate-500">de {brl(card.limitCents)} de limite total</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setLimitSheet('total')}>
                Limite total
              </Button>
              <Button variant="secondary" size="sm" icon={RefreshCcw} onClick={() => setLimitSheet('available')}>
                Atualizar disponível
              </Button>
            </div>
          </div>
          <div className="mt-5">
            <Progress value={u.usedPct} tone={tone} />
            <p className="mt-2 text-[12px] text-slate-500">
              {u.usedPct}% comprometido · fecha dia {card.closingDay} · vence dia {card.dueDay}
            </p>
          </div>
          <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-4 text-[14px] dark:border-ink-700">
            <UsageRow label="Compras à vista" hint="Compras em 1x em faturas ainda não pagas" value={u.purchasesSingle + u.bills} />
            <UsageRow
              label="Compras parceladas"
              hint="Todas as parcelas restantes ainda não pagas, inclusive de faturas futuras — o limite é liberado conforme cada fatura é paga"
              value={u.purchasesInstallments + u.billsInstallments}
            />
            {u.billsReleased > 0 && (
              <p className="-mt-1 flex items-center gap-1.5 text-[12px] text-income">
                <CheckCircle2 size={13} /> {brl(u.billsReleased)} em contas já pagas — limite liberado
              </p>
            )}
            <UsageRow
              label="Uso fora do app"
              hint="Compras anteriores ao app — ajustado ao informar o limite disponível do banco"
              value={u.external}
            />
            <div className="flex justify-between border-t border-dashed border-slate-200 pt-2.5 font-semibold dark:border-ink-600">
              <span>Total utilizado</span>
              <span className="tabular-nums text-expense dark:text-expense-dark">{brl(u.used)}</span>
            </div>
          </div>
        </Card>
      </section>

      {/* ── Fatura ── */}
      <section>
        <SectionTitle
          action={
            !card.deletedAt && (
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => openExpense(null, card.id)}>
                Novo gasto
              </Button>
            )
          }
        >
          Fatura
        </SectionTitle>
        <Card>
          <div className="flex items-center justify-between p-2">
            <IconButton icon={ChevronLeft} label="Fatura anterior" onClick={() => setMonth(addMonths(month, -1))} />
            <button className="text-center" onClick={() => setMonth(openMonth)} data-tip="Ir para a fatura atual">
              <p className="text-[15px] font-semibold text-slate-900 dark:text-white">Fatura de {monthLabel(month)}</p>
              <p className="text-[12px] text-slate-500">
                Fecha {fmtDate(invoiceClosingDate(card, month))} · vence {fmtDate(invoiceDueDate(card, month))}
              </p>
              {month !== openMonth && <p className="text-[11px] font-medium text-brand-500">Toque para ir à fatura atual</p>}
            </button>
            <IconButton icon={ChevronRight} label="Próxima fatura" onClick={() => setMonth(addMonths(month, 1))} />
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-slate-100 px-5 py-5 dark:border-ink-700">
            <div>
              <p className="text-[13px] text-slate-500">Total da fatura</p>
              <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{brl(total)}</p>
              {payInfo.paid && (
                <p className="text-[12px] text-income">
                  Paga{payInfo.paidAt ? ` em ${fmtDate(payInfo.paidAt)}` : ''}
                  {payInfo.viaBills ? ' (conta marcada como paga em Contas)' : ''}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
              {payment ? (
                <Button size="sm" variant="secondary" icon={Undo2} onClick={() => void unpayInvoice(card.id, month)}>
                  Desfazer
                </Button>
              ) : payInfo.viaBills ? null : (
                total > 0 && (
                  <Button size="sm" variant="success" icon={CheckCircle2} onClick={pay}>
                    Pagar fatura
                  </Button>
                )
              )}
            </div>
          </div>
          {items.length === 0 && billItems.length === 0 ? (
            <p className="border-t border-slate-100 p-5 text-center text-sm text-slate-500 dark:border-ink-700">Nenhuma compra ou conta nesta fatura.</p>
          ) : (
            <>
              {billItems.map((l) => {
                const c = catById.get(l.bill.categoryId);
                return (
                  <div key={l.bill.id} className="border-t border-slate-100 dark:border-ink-700">
                    <ListRow
                      onClick={() => nav(`/contas/${l.bill.id}`)}
                      left={<WithOwner who={l.bill.responsible}>{c ? <CategoryIcon icon={c.icon} color={c.color} size={38} /> : <span className="h-[38px] w-[38px]" />}</WithOwner>}
                      title={
                        <span className="inline-flex items-center gap-2">
                          {l.bill.name} <Badge tone="blue">conta fixa</Badge>
                        </span>
                      }
                      subtitle={
                        <>
                          <PersonTag who={l.bill.responsible} />
                          {l.total && l.total > 1 ? ` · ${l.index}/${l.total}` : ''}
                          {l.paid ? ' · paga' : ''}
                        </>
                      }
                      right={<Money cents={l.amountCents} className="text-[15px] font-semibold text-slate-900 dark:text-white" />}
                    />
                  </div>
                );
              })}
              {items.map((i) => {
                const e = expById.get(i.expenseId);
                const c = e ? catById.get(e.categoryId) : null;
                return (
                  <div key={i.id} className="border-t border-slate-100 dark:border-ink-700">
                    <ListRow
                      onClick={e ? () => openExpense(e.id) : undefined}
                      left={e ? <WithOwner who={e.responsible}>{c ? <CategoryIcon icon={c.icon} color={c.color} size={38} /> : <span className="h-[38px] w-[38px]" />}</WithOwner> : undefined}
                      title={e?.description || c?.name || 'Compra'}
                      subtitle={
                        <>
                          {e ? fmtDate(e.date) : ''}
                          {i.total > 1 ? ` · parcela ${i.number}/${i.total}` : ''}
                          {e && (
                            <>
                              {' · '}
                              <PersonTag who={e.responsible} />
                            </>
                          )}
                        </>
                      }
                      right={<Money cents={i.amountCents} className="text-[15px] font-semibold text-slate-900 dark:text-white" />}
                    />
                  </div>
                );
              })}
            </>
          )}
        </Card>
      </section>

      {/* ── Contas antigas vinculadas ao cartão: converter em gasto variável ── */}
      {cardBills.length > 0 && (
        <section>
          <SectionTitle>Contas fixas no cartão · {cardBills.length}</SectionTitle>
          <div className="mb-3 flex items-start gap-2.5 rounded-2xl bg-amber-50 p-3.5 text-[13px] leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <Info size={16} className="mt-0.5 shrink-0" />
            <span>
              O que passa no cartão é <b>gasto variável</b>, não conta fixa. Converta estas contas: as parcelas restantes continuam nas mesmas faturas e os meses já pagos ficam no histórico.
            </span>
          </div>
          {cardBills.length > 1 && (
            <Button icon={Shuffle} className="mb-3 w-full" loading={converting === 'all'} onClick={convertAll}>
              Converter todas ({cardBills.length})
            </Button>
          )}
          <Card>
            {cardBills.map((b, i) => {
              const c = catById.get(b.categoryId);
              const v = billVersionAt(data.billVersions, b.id, openMonth);
              const end = billEndMonth(b);
              return (
                <div key={b.id} className={cx('md:flex md:items-center', i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
                  <ListRow
                    className="min-w-0 flex-1"
                    onClick={() => nav(`/contas/${b.id}`)}
                    left={<WithOwner who={b.responsible}>{c ? <CategoryIcon icon={c.icon} color={c.color} size={38} /> : <span className="h-[38px] w-[38px]" />}</WithOwner>}
                    title={b.name}
                    subtitle={
                      <>
                        <PersonTag who={b.responsible} /> · {brl(v?.amountCents ?? 0)} · {end ? `até ${monthLabel(end, { short: true })}` : 'sem término'}
                      </>
                    }
                  />
                  <div className="px-4 pb-3.5 md:shrink-0 md:pb-0 md:pl-0 md:pr-5">
                  <Button size="sm" variant="secondary" icon={Shuffle} className="w-full md:w-auto" loading={converting === b.id} disabled={!end} onClick={() => convertOne(b.id)}>
                    {end ? 'Converter em gasto' : 'Defina o término'}
                  </Button>
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      )}

      {/* ── Próximas faturas ── */}
      <section>
        <SectionTitle>Próximas faturas</SectionTitle>
        <Card className="p-5">
          {upcoming.length === 0 ? (
            <p className="text-center text-sm text-slate-500">Nenhuma parcela ou conta prevista após {monthLabel(month)}.</p>
          ) : (
            <div className="space-y-3">
              {upcoming.map(([m, v]) => (
                <button key={m} onClick={() => setMonth(m)} className="flex w-full items-center gap-3 rounded-xl text-left" data-tip={`Ver fatura de ${monthLabel(m)}`}>
                  <span className="w-14 shrink-0 text-[13px] font-medium text-slate-500">{monthShort(m)}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-ink-700">
                    <div className="h-full rounded-full" style={{ width: `${(v / maxUp) * 100}%`, background: card.color }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-[13px] font-semibold tabular-nums text-slate-800 dark:text-slate-100">{brl(v)}</span>
                </button>
              ))}
              <p className="pt-1 text-[12px] text-slate-500">Parcelas de compras + contas fixas do cartão. Novas compras ainda não lançadas não aparecem.</p>
            </div>
          )}
        </Card>
      </section>

      <LimitSheet card={card} mode={limitSheet} onClose={() => setLimitSheet(null)} usage={u} />
    </div>
  );
}

function UsageRow({ label, hint, value }: { label: string; hint: string; value: number }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-600 underline decoration-slate-300 decoration-dotted underline-offset-4 dark:text-slate-300 dark:decoration-slate-600" data-tip={hint}>
        {label}
      </span>
      <span className={cx('tabular-nums', value < 0 ? 'text-income' : 'text-slate-800 dark:text-slate-100')}>{brl(value)}</span>
    </div>
  );
}

/** Linha de cálculo: rótulo (com explicação opcional) à esquerda, valor sempre em uma linha à direita. */
function CalcRow({ label, hint, value, strong }: { label: string; hint?: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={cx('text-[14px]', strong ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300')}>{label}</p>
        {hint && <p className="text-[12px] leading-snug text-slate-500">{hint}</p>}
      </div>
      <span className={cx('shrink-0 whitespace-nowrap text-[14px] tabular-nums', strong ? 'font-bold' : 'font-semibold', strong && value < 0 ? 'text-expense' : 'text-slate-900 dark:text-white')}>
        {value < 0 ? `− ${brl(-value)}` : brl(value)}
      </span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-brand-50 p-3 text-[13px] leading-relaxed text-brand-700 dark:bg-brand-500/10 dark:text-brand-100">
      <Info size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function LimitSheet({ card, mode, onClose, usage }: { card: CardT; mode: 'total' | 'available' | null; onClose: () => void; usage: ReturnType<typeof creditUsage> }) {
  const saveCard = useStore((s) => s.saveCard);
  const setCardAvailable = useStore((s) => s.setCardAvailable);
  const recalcCardAvailable = useStore((s) => s.recalcCardAvailable);
  const [v, setV] = useResetOnOpen(!!mode, () => (mode === 'total' ? card.limitCents : Math.max(0, usage.available)));
  const [source, setSource] = useResetOnOpen<'bank' | 'app'>(!!mode, () => 'bank');
  const [busy, setBusy] = useState(false);
  const known = usage.purchases + usage.bills + usage.billsInstallments;
  // Contas fixas no cartão entram junto: recorrentes como à vista, com término como parceladas.
  const cashSide = usage.purchasesSingle + usage.bills;
  const installmentSide = usage.purchasesInstallments + usage.billsInstallments;
  const fromApp = mode === 'available' && source === 'app';
  const tooHigh = mode === 'available' && !fromApp && v > card.limitCents;
  async function save() {
    setBusy(true);
    try {
      if (mode === 'total') await saveCard({ ...card, limitCents: v });
      else if (fromApp) await recalcCardAvailable(card.id);
      else await setCardAvailable(card.id, v);
      onClose();
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={!!mode}
      onClose={onClose}
      title={mode === 'total' ? 'Limite total' : 'Atualizar limite disponível'}
      subtitle={card.name}
      size="sm"
      footer={
        <Button size="lg" className="w-full" loading={busy} disabled={tooHigh} onClick={save}>
          {fromApp ? 'Recalcular' : 'Salvar'}
        </Button>
      }
    >
      <div className="space-y-4">
        {mode === 'available' && (
          <Segmented
            value={source}
            onChange={setSource}
            options={[
              { value: 'bank', label: 'Valor do banco' },
              { value: 'app', label: 'Calcular pelo app' },
            ]}
          />
        )}

        {fromApp ? (
          <>
            <div className="overflow-hidden rounded-3xl bg-slate-50 dark:bg-ink-900">
              <div className="space-y-3 p-4">
                <CalcRow label="Limite total" value={card.limitCents} />
                <CalcRow label="Compras à vista" value={-cashSide} />
                <CalcRow label="Compras parceladas" hint="Todas as parcelas que ainda faltam pagar" value={-installmentSide} />
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-200/70 bg-white/60 px-4 py-3.5 dark:border-ink-700 dark:bg-ink-800/60">
                <span className="text-[15px] font-semibold text-slate-900 dark:text-white">Disponível</span>
                <Money cents={card.limitCents - known} tone={card.limitCents - known < 0 ? 'expense' : 'income'} className="whitespace-nowrap text-[24px] font-bold leading-none" />
              </div>
            </div>
            <Note>
              Considera só o que está lançado no app.
              {usage.external !== 0 && <> O ajuste de uso fora do app ({brl(usage.external)}) deixa de ser descontado.</>}
            </Note>
          </>
        ) : (
          <>
            <div>
              <p className="mb-1.5 px-1 text-[13px] font-medium text-slate-600 dark:text-slate-300">{mode === 'total' ? 'Limite total do cartão' : `Disponível no app do ${card.institution || card.name}`}</p>
              <div className="rounded-3xl bg-slate-50 py-5 dark:bg-ink-900">
                <MoneyInput big autoFocus value={v} onChange={setV} />
              </div>
              {tooHigh && <p className="mt-2 px-1 text-[13px] text-expense">O disponível não pode ser maior que o limite total ({brl(card.limitCents)}).</p>}
            </div>
            <div className="space-y-3 rounded-3xl bg-slate-50 p-4 dark:bg-ink-900">
              {mode === 'total' ? (
                <>
                  <CalcRow label="Utilizado hoje" value={-usage.used} />
                  <CalcRow label="Disponível passa a ser" value={v - usage.used} strong />
                </>
              ) : (
                <>
                  <CalcRow label="Lançado no app" value={known} />
                  <CalcRow label="Uso fora do app" hint="Compras feitas antes de vocês usarem o app" value={card.limitCents - v - known} strong />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

function BenefitDetail({ card }: { card: CardT }) {
  const data = useStore((s) => s.data);
  const openExpense = useStore((s) => s.openExpense);
  const [sheet, setSheet] = useState<'balance' | 'recharge' | null>(null);
  const balance = benefitBalance(data, card.id);
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);

  const history = useMemo(() => {
    const entries = data.benefitEntries.filter((e) => e.cardId === card.id).map((e) => ({ kind: 'entry' as const, date: e.date, created: e.createdAt, id: e.id, amount: e.amountCents, title: e.note || (e.kind === 'recharge' ? 'Recarga' : 'Ajuste de saldo'), sub: e.kind === 'recharge' ? 'Recarga' : 'Ajuste manual', expenseId: null as string | null, cat: null as string | null }));
    const spent = data.expenses.filter((e) => e.method === 'benefit' && e.cardId === card.id).map((e) => ({ kind: 'expense' as const, date: e.date, created: e.createdAt, id: e.id, amount: -e.amountCents, title: e.description || catById.get(e.categoryId)?.name || 'Compra', sub: `${catById.get(e.categoryId)?.name ?? ''} · ${PERSON_LABEL[e.responsible]}`, expenseId: e.id, cat: e.categoryId }));
    return [...entries, ...spent].sort((a, b) => (a.date === b.date ? b.created.localeCompare(a.created) : b.date.localeCompare(a.date)));
  }, [data.benefitEntries, data.expenses, card.id, catById]);

  return (
    <>
      <VisualCard card={card}>
        <p className="text-[12px] text-white/75">Saldo disponível</p>
        <p className="text-[32px] font-bold tabular-nums">{brl(balance)}</p>
        <p className="text-[12px] text-white/75">{card.owner ? `Benefício de ${PERSON_LABEL[card.owner]}` : 'Benefício'} · não conta como dinheiro em conta</p>
      </VisualCard>
      {!card.deletedAt && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={RefreshCcw} onClick={() => setSheet('balance')}>
            Atualizar saldo
          </Button>
          <Button variant="secondary" icon={Plus} onClick={() => setSheet('recharge')}>
            Registrar recarga
          </Button>
        </div>
      )}

      <SectionTitle>Histórico de utilização</SectionTitle>
      <Card>
        {history.length === 0 ? (
          <EmptyState icon={Wallet} title="Sem movimentações" text="Registre uma recarga ou informe o saldo atual." />
        ) : (
          history.slice(0, 80).map((h, i) => {
            const c = h.cat ? catById.get(h.cat) : null;
            return (
              <div key={h.id} className={cx(i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
                <ListRow
                  onClick={h.expenseId ? () => openExpense(h.expenseId!) : undefined}
                  left={
                    c ? (
                      <CategoryIcon icon={c.icon} color={c.color} size={36} />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-income-soft text-income dark:bg-green-500/15">
                        {h.amount >= 0 ? <Plus size={18} /> : <RefreshCcw size={16} />}
                      </span>
                    )
                  }
                  title={h.title}
                  subtitle={`${fmtDate(h.date)} · ${h.sub}`}
                  right={<Money cents={h.amount} sign tone={h.amount >= 0 ? 'income' : undefined} className="text-[15px] font-semibold text-slate-900 dark:text-white" />}
                />
              </div>
            );
          })
        )}
      </Card>
      <BenefitSheet card={card} mode={sheet} onClose={() => setSheet(null)} balance={balance} />
    </>
  );
}

function BenefitSheet({ card, mode, onClose, balance }: { card: CardT; mode: 'balance' | 'recharge' | null; onClose: () => void; balance: number }) {
  const setBenefitBalance = useStore((s) => s.setBenefitBalance);
  const addBenefitRecharge = useStore((s) => s.addBenefitRecharge);
  const [v, setV] = useResetOnOpen(!!mode, () => ({ amount: mode === 'balance' ? Math.max(0, balance) : 0, date: todayISO(), note: '' }));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      if (mode === 'balance') await setBenefitBalance(card.id, v.amount, v.note);
      else await addBenefitRecharge(card.id, v.amount, v.date, v.note);
      onClose();
    } catch {
      /* toast já exibido */
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={!!mode}
      onClose={onClose}
      title={mode === 'balance' ? 'Atualizar saldo' : 'Registrar recarga'}
      footer={<Button size="lg" className="w-full" loading={busy} onClick={save}>Salvar</Button>}
    >
      <div className="space-y-4">
        <div className="rounded-3xl bg-slate-50 py-5 dark:bg-ink-900">
          <MoneyInput big autoFocus value={v.amount} onChange={(amount) => setV({ ...v, amount })} />
        </div>
        {mode === 'balance' ? (
          <p className="text-[13px] text-slate-500">
            Informe o saldo atual que aparece no app do {card.institution || card.name}. Será registrado um ajuste de {brl(v.amount - balance)} para manter o histórico.
          </p>
        ) : (
          <Field label="Data da recarga">
            <Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
          </Field>
        )}
        <Field label="Observação (opcional)">
          <Input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} maxLength={60} />
        </Field>
      </div>
    </Sheet>
  );
}

/* ───────────────────────── Formulário ───────────────────────── */
const COLORS = ['#820ad1', '#ec0000', '#004e9f', '#00a6e0', '#2b2b2b', '#b0102a', '#ff5a1f', '#0aa5a0', '#16a34a', '#ca8a04', '#2f6bf0', '#db2777'];

export function CardForm({ open, onClose, kind, card }: { open: boolean; onClose: () => void; kind: CardKind; card?: CardT }) {
  const saveCard = useStore((s) => s.saveCard);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useResetOnOpen(open, () => ({
    kind: card?.kind ?? kind,
    name: card?.name ?? '',
    institution: card?.institution ?? '',
    owner: (card?.owner ?? 'igor') as Person,
    limitCents: card?.limitCents ?? 0,
    closingDay: card?.closingDay ?? 1,
    dueDay: card?.dueDay ?? 10,
    color: card?.color ?? COLORS[0],
    active: card?.active ?? true,
  }));
  const isCredit = f.kind === 'credit';
  const dayOk = (d: number) => Number.isInteger(d) && d >= 1 && d <= 31;
  const valid = f.name.trim() && (!isCredit || (dayOk(f.closingDay) && dayOk(f.dueDay)));

  async function save() {
    if (!valid) return;
    setBusy(true);
    try {
      await saveCard({ ...card, ...f, owner: isCredit ? null : f.owner, id: card?.id });
      onClose();
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={card ? 'Editar cartão' : 'Novo cartão'}
      footer={<Button size="lg" className="w-full" loading={busy} disabled={!valid} onClick={save}>Salvar cartão</Button>}
    >
      <div className="space-y-4">
        {!card && (
          <Segmented
            value={f.kind}
            onChange={(k) => setF({ ...f, kind: k })}
            options={[
              { value: 'credit', label: 'Crédito' },
              { value: 'benefit', label: 'Benefício' },
            ]}
          />
        )}
        <Field label="Nome">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={isCredit ? 'Ex.: Nubank' : 'Ex.: Flash Igor'} maxLength={40} />
        </Field>
        <Field label="Instituição">
          <Input value={f.institution} onChange={(e) => setF({ ...f, institution: e.target.value })} placeholder="Ex.: Nubank, Santander, Flash…" maxLength={40} />
        </Field>
        {isCredit ? (
          <>
            <Field label="Limite total">
              <MoneyInput value={f.limitCents} onChange={(limitCents) => setF({ ...f, limitCents })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dia de fechamento" error={!dayOk(f.closingDay) ? 'Entre 1 e 31' : null}>
                <Input type="number" inputMode="numeric" min={1} max={31} value={f.closingDay} onChange={(e) => setF({ ...f, closingDay: Number(e.target.value) })} />
              </Field>
              <Field label="Dia de vencimento" error={!dayOk(f.dueDay) ? 'Entre 1 e 31' : null}>
                <Input type="number" inputMode="numeric" min={1} max={31} value={f.dueDay} onChange={(e) => setF({ ...f, dueDay: Number(e.target.value) })} />
              </Field>
            </div>
            {card && (card.closingDay !== f.closingDay || card.dueDay !== f.dueDay) && (
              <p className="rounded-2xl bg-amber-50 p-3 text-[12px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                As parcelas de compras ainda sem fatura paga serão redistribuídas conforme as novas datas. Faturas já pagas não mudam.
              </p>
            )}
          </>
        ) : (
          <Field label="Titular">
            <Segmented value={f.owner} onChange={(owner) => setF({ ...f, owner })} options={PEOPLE.map((p) => ({ value: p, label: <span className="inline-flex items-center gap-1.5"><PersonGlyph who={p} size={17} />{PERSON_LABEL[p]}</span>, ariaLabel: PERSON_LABEL[p] }))} />
          </Field>
        )}
        <div>
          <span className="mb-2 block text-[13px] font-medium text-slate-600 dark:text-slate-300">Cor</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Usar esta cor`}
                onClick={() => setF({ ...f, color: c })}
                className={cx('h-9 w-9 rounded-full transition', f.color === c && 'ring-4 ring-offset-2 ring-slate-300 dark:ring-offset-ink-800')}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        {card && (
          <Field label="Status">
            <Segmented
              value={f.active ? 'on' : 'off'}
              onChange={(v) => setF({ ...f, active: v === 'on' })}
              options={[
                { value: 'on', label: 'Ativo' },
                { value: 'off', label: 'Inativo' },
              ]}
            />
          </Field>
        )}
      </div>
    </Sheet>
  );
}
