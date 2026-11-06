import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CreditCard, Receipt, Undo2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { PAYMENT_LABEL, PAYMENT_METHODS, PERSON_LABEL, RESPONSIBLES, type Card as CardT, type Category, type Expense, type PaymentMethod, type Responsible } from '../domain/types';
import { cardBillLines, invoiceDueDate, invoicePaidInfo, invoiceStatus, invoiceTotal, isInvoicePaid, type BillLine } from '../domain/finance';
import { brl } from '../lib/money';
import { fmtDate, fmtDayHeader, monthLabel, monthOf, todayISO } from '../lib/months';
import { Button, Card, EmptyState, ListRow, Money, MonthSwitcher, PageHeader, Sheet, cx, span5, useSessionState } from '../components/ui';
import { ActivePills, FilterSection, OptionTile, SearchFilterBar, type ActivePill } from '../components/filters';
import { CategoryIcon } from '../components/icons';
import { PersonGlyph, PersonTag, WithOwner } from '../components/people';

/** Uma linha da lista: a compra inteira (à vista/benefício/modo compra) ou uma parcela da fatura do mês. */
interface ExpRow {
  key: string;
  expense: Expense;
  amount: number;
  group: string;
  /** Número da parcela quando a linha é uma parcela da fatura. */
  number: number | null;
  /** Conta antiga cobrada no cartão (aparece na fatura do mês). */
  bill: BillLine | null;
  /** Já paga: à vista/benefício sempre; crédito quando a fatura (ou a conta) foi quitada. */
  paid: boolean;
}

export function ExpensesPage() {
  const data = useStore((s) => s.data);
  const month = useStore((s) => s.month);
  const openExpense = useStore((s) => s.openExpense);
  const payInvoice = useStore((s) => s.payInvoice);
  const unpayInvoice = useStore((s) => s.unpayInvoice);
  const setBillPaid = useStore((s) => s.setBillPaid);
  const confirm = useStore((s) => s.confirm);
  const nav = useNavigate();

  const [openInvoice, setOpenInvoice] = useState<string | null>(null);

  /** No cartão só se paga a fatura inteira — nunca um item isolado. */
  async function toggleInvoice(cardId: string) {
    const card = cardById.get(cardId);
    if (!card) return;
    const info = invoicePaidInfo(data, card, month);
    if (info.paid) {
      const ok = await confirm({ title: `Desfazer o pagamento da fatura ${card.name}?`, message: `A fatura de ${monthLabel(month)} volta a ficar pendente, com todos os itens.`, confirmText: 'Desfazer pagamento' });
      if (!ok) return;
      if (isInvoicePaid(data, card.id, month)) await unpayInvoice(card.id, month);
      // Fatura dada como paga pelas contas marcadas em Contas: desfaz essas contas.
      else for (const l of cardBillLines(data, card.id, month)) if (l.paid) await setBillPaid(l.bill.id, month, false);
      return;
    }
    const total = invoiceTotal(data, card.id, month);
    const count = data.installments.filter((i) => i.cardId === card.id && i.invoiceMonth === month).length + cardBillLines(data, card.id, month).length;
    const ok = await confirm({
      title: `Pagar a fatura ${card.name}?`,
      message: `Fatura de ${monthLabel(month)} com ${count} ${count === 1 ? 'item' : 'itens'}: ${brl(total)} (vence ${fmtDate(invoiceDueDate(card, month))}). Todos os itens ficam pagos juntos.`,
      confirmText: 'Pagar fatura',
    });
    if (ok) await payInvoice(card.id, month, total, todayISO());
  }
  const [q, setQ] = useSessionState('fic-exp-q', '');
  const [who, setWho] = useSessionState<Responsible | 'all'>('fic-exp-who', 'all');
  const [methods, setMethods] = useSessionState<PaymentMethod[]>('fic-exp-methods', []);
  const [cats, setCats] = useSessionState<string[]>('fic-exp-cats', []);
  const [view, setView] = useSessionState<'invoice' | 'purchase'>('fic-exp-view', 'invoice');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const cardById = useMemo(() => new Map(data.cards.map((c) => [c.id, c])), [data.cards]);

  /**
   * Linhas da lista. No modo "fatura" (padrão), a compra no crédito aparece em cada mês em que tem parcela,
   * no grupo da fatura do cartão — igual ao que pesa no orçamento. No modo "compra", aparece só na data da compra.
   */
  const { rows, groups } = useMemo(() => {
    const term = q.trim().toLowerCase();
    const keep = (e: Expense) =>
      (who === 'all' || e.responsible === who) &&
      (!methods.length || methods.includes(e.method)) &&
      (!cats.length || cats.includes(e.categoryId)) &&
      (!term || e.description.toLowerCase().includes(term) || (catById.get(e.categoryId)?.name.toLowerCase().includes(term) ?? false));
    const byDateDesc = (a: Expense, b: Expense) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date));
    const out: ExpRow[] = [];
    for (const e of data.expenses.filter(keep)) {
      if (view === 'invoice' && e.method === 'credit') continue;
      if (monthOf(e.date) !== month) continue;
      out.push({ key: e.id, expense: e, amount: e.amountCents, group: `d:${e.date}`, number: null, bill: null, paid: e.method !== 'credit' });
    }
    if (view === 'invoice') {
      const expById = new Map(data.expenses.map((e) => [e.id, e]));
      for (const i of data.installments) {
        if (i.invoiceMonth !== month) continue;
        const e = expById.get(i.expenseId);
        if (!e || !keep(e)) continue;
        const card = cardById.get(i.cardId);
        out.push({ key: i.id, expense: e, amount: i.amountCents, group: `c:${i.cardId}`, number: i.number, bill: null, paid: !!card && invoicePaidInfo(data, card, month).paid });
      }
      // Contas cobradas no cartão (inclusive as antigas já quitadas): também são gastos da fatura do mês.
      for (const card of data.cards.filter((c) => c.kind === 'credit')) {
        const invoicePaid = !!isInvoicePaid(data, card.id, month);
        for (const l of cardBillLines(data, card.id, month)) {
          const pseudo: Expense = {
            id: l.bill.id,
            createdAt: l.bill.createdAt,
            updatedAt: l.bill.createdAt,
            amountCents: l.amountCents,
            description: l.bill.name,
            categoryId: l.bill.categoryId,
            responsible: l.bill.responsible,
            date: l.dueDate,
            method: 'credit',
            cardId: card.id,
            installments: l.total ?? 1,
            firstInvoiceMonth: month,
          };
          if (!keep(pseudo)) continue;
          out.push({ key: `b-${l.bill.id}`, expense: pseudo, amount: l.amountCents, group: `c:${card.id}`, number: l.index, bill: l, paid: l.paid || invoicePaid });
        }
      }
    }
    // Pendentes primeiro; pagas descem. Depois, mais recentes primeiro.
    out.sort((a, b) => (a.paid !== b.paid ? (a.paid ? 1 : -1) : byDateDesc(a.expense, b.expense)));
    const map = new Map<string, ExpRow[]>();
    for (const r of out) map.set(r.group, [...(map.get(r.group) ?? []), r]);
    const dueOf = (g: string) => {
      const card = cardById.get(g.slice(2));
      return card ? invoiceDueDate(card, month) : '9999';
    };
    // Grupos com algo a pagar primeiro; grupos quitados descem. Dentro de cada bloco:
    // faturas por vencimento e dias do mais recente para o mais antigo.
    const allPaid = (items: ExpRow[]) => items.every((r) => r.paid);
    const gs = [...map.entries()].sort(([a, ia], [b, ib]) => {
      if (allPaid(ia) !== allPaid(ib)) return allPaid(ia) ? 1 : -1;
      if (a[0] !== b[0]) return a[0] === 'c' ? -1 : 1;
      return a[0] === 'd' ? b.localeCompare(a) : dueOf(a).localeCompare(dueOf(b));
    });
    return { rows: out, groups: gs };
  }, [data, month, who, methods, cats, q, catById, cardById, view]);

  const invoiceGroups = groups.filter(([g]) => g.startsWith('c:'));
  const dayGroups = groups.filter(([g]) => g.startsWith('d:'));
  const openItems = openInvoice ? (groups.find(([g]) => g === `c:${openInvoice}`)?.[1] ?? []) : [];
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const byMethod = (ms: PaymentMethod[]) => rows.filter((r) => ms.includes(r.expense.method)).reduce((a, r) => a + r.amount, 0);
  const activeFilters = (who !== 'all' ? 1 : 0) + methods.length + cats.length;
  const pills: ActivePill[] = [
    ...(view === 'purchase' ? [{ key: 'view', label: 'Por data da compra', onRemove: () => setView('invoice') }] : []),
    ...(who !== 'all'
      ? [{ key: 'who', label: <span className="inline-flex items-center gap-1"><PersonGlyph who={who} size={14} />{PERSON_LABEL[who]}</span>, onRemove: () => setWho('all') }]
      : []),
    ...methods.map((m) => ({ key: `m-${m}`, label: PAYMENT_LABEL[m], onRemove: () => setMethods(methods.filter((x) => x !== m)) })),
    ...cats.map((id) => ({ key: `c-${id}`, label: catById.get(id)?.name ?? 'Categoria', onRemove: () => setCats(cats.filter((x) => x !== id)) })),
  ];
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const clear = () => {
    setWho('all');
    setMethods([]);
    setCats([]);
    setQ('');
    setView('invoice');
  };

  const groupHeader = (g: string) => {
    if (g.startsWith('d:')) return fmtDayHeader(g.slice(2));
    const card = cardById.get(g.slice(2));
    return card ? `Fatura ${card.name} · vence ${fmtDate(invoiceDueDate(card, month))}` : 'Fatura';
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Despesas" subtitle={view === 'invoice' ? 'Gastos do mês · parcelas no mês da fatura' : 'Compras pela data da compra'} />
      <MonthSwitcher />

      <SearchFilterBar className="mt-5" q={q} setQ={setQ} placeholder="Buscar gastos" activeCount={pills.length} onOpenFilters={() => setFiltersOpen(true)} />
      <ActivePills pills={pills} onClear={clear} />

      <Card className="mt-5 overflow-hidden">
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-medium text-slate-500">
              {activeFilters || q ? 'Total filtrado' : view === 'invoice' ? 'Total de gastos do mês' : 'Total de compras no mês'}
            </p>
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] font-semibold text-slate-600 dark:bg-ink-700 dark:text-slate-300">
              {rows.length} {rows.length === 1 ? 'lançamento' : 'lançamentos'}
            </span>
          </div>
          <Money cents={total} tone="expense" className="mt-1 block text-[30px] font-bold leading-tight tracking-tight" />
          <p className="mt-1 text-[12px] text-slate-500">
            {view === 'invoice' ? 'Compras no crédito entram no mês da fatura de cada parcela.' : 'Compras com o valor total, na data em que foram feitas.'}
          </p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 dark:divide-ink-700 dark:border-ink-700">
          <Stat label="À vista" value={byMethod(['pix', 'debit', 'cash'])} />
          <Stat label={view === 'invoice' ? 'Faturas' : 'Crédito'} value={byMethod(['credit'])} />
          <Stat label="Benefício" value={byMethod(['benefit'])} benefit />
        </div>
      </Card>

      {groups.length === 0 ? (
        <Card className="mt-5">
          <EmptyState
            icon={Receipt}
            title={activeFilters || q ? 'Nada encontrado' : 'Nenhum gasto neste mês'}
            text={activeFilters || q ? 'Tente remover alguns filtros.' : 'Use o botão “Adicionar gasto” para registrar.'}
            action={activeFilters || q ? <Button variant="secondary" onClick={clear}>Limpar filtros</Button> : <Button onClick={() => openExpense()}>Adicionar gasto</Button>}
          />
        </Card>
      ) : (
        <>
          {invoiceGroups.length > 0 && (
            <section className="mt-8">
              <div className="mb-3 flex justify-between gap-3 px-1 text-[13px] font-semibold text-slate-500">
                <span>Faturas de {monthLabel(month)}</span>
                <span className="shrink-0 tabular-nums">{brl(invoiceGroups.reduce((a, [, items]) => a + items.reduce((x, r) => x + r.amount, 0), 0))}</span>
              </div>
              <Card>
                {invoiceGroups.map(([g, items], i) => {
                  const card = cardById.get(g.slice(2));
                  if (!card) return null;
                  const info = invoicePaidInfo(data, card, month);
                  const st = invoiceStatus(data, card, month);
                  const sum = items.reduce((a, r) => a + r.amount, 0);
                  return (
                    <div key={g} className={cx('flex items-center', i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
                      <ListRow
                        className="min-w-0 flex-1"
                        onClick={() => setOpenInvoice(card.id)}
                        left={
                          <span className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: `${card.color}22`, color: card.color }}>
                            <CreditCard size={20} />
                          </span>
                        }
                        title={<span className={cx(info.paid && 'text-income dark:text-income-dark')}>Fatura {card.name}</span>}
                        subtitle={
                          <>
                            {info.paid ? (
                              <span className="text-income dark:text-income-dark">Paga{info.paidAt ? ` em ${fmtDate(info.paidAt)}` : ''}</span>
                            ) : (
                              <span className={cx(st === 'overdue' && 'font-semibold text-expense')}>
                                {st === 'overdue' ? 'Venceu' : 'Vence'} {fmtDate(invoiceDueDate(card, month))}
                              </span>
                            )}
                            {' · '}
                            {items.length} {items.length === 1 ? 'item' : 'itens'}
                          </>
                        }
                        right={<Money cents={-sum} className={cx('whitespace-nowrap text-[15px] font-semibold', info.paid ? 'text-income line-through decoration-income/60 dark:text-income-dark' : 'text-slate-900 dark:text-white')} />}
                      />
                      <button
                        type="button"
                        onClick={() => void toggleInvoice(card.id)}
                        aria-pressed={info.paid}
                        aria-label={info.paid ? `Desfazer pagamento da fatura ${card.name}` : `Pagar fatura ${card.name}`}
                        className={cx(
                          'mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition press:scale-90',
                          info.paid ? 'bg-income text-white' : 'border-2 border-slate-200 text-transparent hover:border-income hover:text-income dark:border-ink-600',
                        )}
                      >
                        <Check size={20} strokeWidth={3} />
                      </button>
                    </div>
                  );
                })}
              </Card>
              <p className="mt-2 px-1 text-[12px] text-slate-500">Toque na fatura para ver os itens. O pagamento é sempre da fatura inteira.</p>
            </section>
          )}

          {dayGroups.map(([g, items]) => (
            <section key={g} className="mt-8">
              <div className="mb-3 flex justify-between gap-3 px-1 text-[13px] font-semibold text-slate-500">
                <span className="break-words">{groupHeader(g)}</span>
                <span className="shrink-0 tabular-nums">{brl(items.reduce((a, r) => a + r.amount, 0))}</span>
              </div>
              <Card>
                {items.map((r, i) => (
                  <ItemRow key={r.key} r={r} first={i === 0} catById={catById} cardById={cardById} onOpen={() => (r.bill ? nav(`/contas/${r.bill.bill.id}`) : openExpense(r.expense.id))} showCheck />
                ))}
              </Card>
            </section>
          ))}
        </>
      )}

      <InvoiceItemsSheet
        cardId={openInvoice}
        items={openItems}
        filtered={activeFilters > 0 || !!q}
        onClose={() => setOpenInvoice(null)}
        onToggle={toggleInvoice}
        onOpenItem={(r) => {
          setOpenInvoice(null);
          if (r.bill) nav(`/contas/${r.bill.bill.id}`);
          else openExpense(r.expense.id);
        }}
        catById={catById}
        cardById={cardById}
      />

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtrar gastos"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                setWho('all');
                setMethods([]);
                setCats([]);
                setView('invoice');
              }}
            >
              Limpar
            </Button>
            <Button size="lg" onClick={() => setFiltersOpen(false)}>
              Ver {rows.length} {rows.length === 1 ? 'lançamento' : 'lançamentos'}
            </Button>
          </div>
        }
      >
        <div className="space-y-6 pb-2">
          <FilterSection title="Ver compras no crédito por">
            <div className="grid grid-cols-2 gap-2">
              <OptionTile active={view === 'invoice'} onClick={() => setView('invoice')}>
                Mês da fatura
              </OptionTile>
              <OptionTile active={view === 'purchase'} onClick={() => setView('purchase')}>
                Data da compra
              </OptionTile>
            </div>
            <p className="text-[12px] text-slate-500">
              {view === 'invoice' ? 'Cada parcela aparece no mês em que pesa no orçamento.' : 'A compra aparece uma vez, com o valor total, no dia em que foi feita.'}
            </p>
          </FilterSection>
          <FilterSection title="Responsável">
            <div className="grid grid-cols-4 gap-2">
              <OptionTile active={who === 'all'} onClick={() => setWho('all')}>
                Todos
              </OptionTile>
              {RESPONSIBLES.map((p) => (
                <OptionTile key={p} active={who === p} onClick={() => setWho(p)}>
                  <PersonGlyph who={p} size={15} />
                  {PERSON_LABEL[p]}
                </OptionTile>
              ))}
            </div>
          </FilterSection>
          <FilterSection title="Forma de pagamento">
            <div className="grid grid-cols-6 gap-2">
              {PAYMENT_METHODS.map((m, i) => (
                <OptionTile key={m} className={span5(i)} active={methods.includes(m)} onClick={() => setMethods(toggle(methods, m))}>
                  {m === 'credit' ? 'Crédito' : PAYMENT_LABEL[m]}
                </OptionTile>
              ))}
            </div>
          </FilterSection>
          <FilterSection title="Categorias">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
              {data.categories
                .filter((c) => !c.archivedAt)
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((c) => (
                  <OptionTile key={c.id} active={cats.includes(c.id)} onClick={() => setCats(toggle(cats, c.id))} className="justify-start px-3">
                    <CategoryIcon icon={c.icon} color={c.color} size={24} />
                    <span className="min-w-0 break-words text-left">{c.name}</span>
                  </OptionTile>
                ))}
            </div>
          </FilterSection>
        </div>
      </Sheet>
    </div>
  );
}

function Stat({ label, value, benefit }: { label: string; value: number; benefit?: boolean }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <span className="block text-[12px] text-slate-500">{label}</span>
      <span className={cx('block whitespace-nowrap text-[14px] font-semibold tabular-nums', benefit ? 'text-orange-600 dark:text-orange-400' : 'text-expense dark:text-expense-dark')}>{brl(value)}</span>
    </div>
  );
}

/** Uma compra (ou parcela/conta da fatura) na lista. `showCheck`: indicador de pago para gastos à vista. */
function ItemRow({
  r,
  first,
  catById,
  cardById,
  onOpen,
  showCheck,
}: {
  r: ExpRow;
  first: boolean;
  catById: Map<string, Category>;
  cardById: Map<string, CardT>;
  onOpen: () => void;
  showCheck?: boolean;
}) {
  const e = r.expense;
  const c = catById.get(e.categoryId);
  const card = e.cardId ? cardById.get(e.cardId) : null;
  const inInvoice = r.number !== null || !!r.bill;
  return (
    <div className={cx('flex items-center', !first && 'border-t border-slate-100 dark:border-ink-700')}>
      <ListRow
        className="min-w-0 flex-1"
        onClick={onOpen}
        left={<WithOwner who={e.responsible}>{c ? <CategoryIcon icon={c.icon} color={c.color} size={40} /> : <span className="h-10 w-10" />}</WithOwner>}
        title={<span className={cx(r.paid && inInvoice && 'text-income line-through decoration-income/60 dark:text-income-dark')}>{e.description || c?.name || 'Gasto'}</span>}
        subtitle={
          r.bill ? (
            <>
              {c?.name} · <PersonTag who={e.responsible} />
              {r.bill.total && r.bill.total > 1 ? ` · parcela ${r.bill.index}/${r.bill.total}` : ''} · conta fixa
            </>
          ) : inInvoice ? (
            <>
              {c?.name} · <PersonTag who={e.responsible} />
              {e.installments > 1 ? ` · parcela ${r.number}/${e.installments}` : ' · à vista'} · compra em {fmtDate(e.date)}
            </>
          ) : (
            <>
              {c?.name} · <PersonTag who={e.responsible} /> · {card ? `${card.name}${card.deletedAt ? ' (removido)' : ''}` : PAYMENT_LABEL[e.method]}
            </>
          )
        }
        right={
          <div className="text-right">
            <Money
              cents={-r.amount}
              className={cx('block whitespace-nowrap text-[15px] font-semibold', r.paid && inInvoice ? 'text-income line-through decoration-income/60 dark:text-income-dark' : 'text-slate-900 dark:text-white')}
            />
            {inInvoice && !r.bill && e.installments > 1 && <span className="whitespace-nowrap text-[12px] text-slate-500">de {brl(e.amountCents)}</span>}
            {!inInvoice && e.installments > 1 && <span className="whitespace-nowrap text-[12px] text-slate-500">{e.installments}x de {brl(Math.floor(e.amountCents / e.installments))}</span>}
            {e.method === 'benefit' && <span className="text-[12px] text-orange-600">benefício</span>}
          </div>
        }
      />
      {showCheck && (
        <span
          role="img"
          aria-label={`${e.description || 'Gasto'}: pago na hora (${PAYMENT_LABEL[e.method]})`}
          className={cx('mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full', r.paid ? 'bg-income text-white' : 'border-2 border-slate-200 text-transparent dark:border-ink-600')}
        >
          <Check size={20} strokeWidth={3} />
        </span>
      )}
    </div>
  );
}

/** Itens de uma fatura. Não há pagamento por item: só a fatura inteira. */
function InvoiceItemsSheet({
  cardId,
  items,
  filtered,
  onClose,
  onToggle,
  onOpenItem,
  catById,
  cardById,
}: {
  cardId: string | null;
  items: ExpRow[];
  filtered: boolean;
  onClose: () => void;
  onToggle: (cardId: string) => Promise<void>;
  onOpenItem: (r: ExpRow) => void;
  catById: Map<string, Category>;
  cardById: Map<string, CardT>;
}) {
  const data = useStore((s) => s.data);
  const month = useStore((s) => s.month);
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  // Mantém o último conteúdo enquanto a janela anima ao fechar.
  const last = useRef({ cardId, items });
  if (cardId) last.current = { cardId, items };
  items = last.current.items;
  const card = last.current.cardId ? cardById.get(last.current.cardId) : null;
  if (!card) return null;
  const info = invoicePaidInfo(data, card, month);
  const st = invoiceStatus(data, card, month);
  const total = invoiceTotal(data, card.id, month);
  const shown = items.reduce((a, r) => a + r.amount, 0);
  // Compras mais recentes primeiro.
  const sorted = [...items].sort((a, b) => (a.expense.date === b.expense.date ? b.expense.createdAt.localeCompare(a.expense.createdAt) : b.expense.date.localeCompare(a.expense.date)));

  async function toggle() {
    setBusy(true);
    try {
      await onToggle(card!.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!cardId}
      onClose={onClose}
      title={`Fatura ${card.name}`}
      subtitle={`${monthLabel(month)} · vence ${fmtDate(invoiceDueDate(card, month))}`}
      footer={
        info.paid ? (
          <Button variant="secondary" size="lg" icon={Undo2} className="w-full" loading={busy} onClick={toggle}>
            Desfazer pagamento da fatura
          </Button>
        ) : (
          <Button variant="success" size="lg" icon={Check} className="w-full" loading={busy} disabled={total <= 0} onClick={toggle}>
            Pagar fatura · {brl(total)}
          </Button>
        )
      }
    >
      <div className="flex items-center justify-between gap-3 rounded-3xl bg-slate-50 p-4 dark:bg-ink-900">
        <div className="min-w-0">
          <p className="text-[13px] text-slate-500">Total da fatura</p>
          <p className="whitespace-nowrap text-[26px] font-bold leading-tight tabular-nums text-slate-900 dark:text-white">{brl(total)}</p>
          {filtered && shown !== total && <p className="text-[12px] text-slate-500">Mostrando {brl(shown)} pelos filtros</p>}
        </div>
        {info.paid ? (
          <span className="shrink-0 rounded-full bg-income-soft px-2.5 py-1 text-[12px] font-bold text-green-700 dark:bg-green-500/15 dark:text-income-dark">
            Paga{info.paidAt ? ` em ${fmtDate(info.paidAt)}` : ''}
          </span>
        ) : (
          <span className={cx('shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold', st === 'overdue' ? 'bg-expense-soft text-expense dark:bg-red-500/15' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200')}>
            {st === 'overdue' ? 'Vencida' : st === 'open' ? 'Aberta' : 'Pendente'}
          </span>
        )}
      </div>

      <p className="mb-2 mt-5 px-1 text-[13px] font-semibold text-slate-500">
        {sorted.length} {sorted.length === 1 ? 'item' : 'itens'}
      </p>
      <div className="overflow-hidden rounded-3xl ring-1 ring-slate-100 dark:ring-ink-700">
        {sorted.map((r, i) => (
          <ItemRow key={r.key} r={r} first={i === 0} catById={catById} cardById={cardById} onOpen={() => onOpenItem(r)} />
        ))}
      </div>
      <button
        onClick={() => {
          onClose();
          nav(`/cartoes/${card.id}`);
        }}
        className="mt-3 w-full py-2 text-center text-[14px] font-semibold text-brand-500 hover:underline"
      >
        Ver cartão e limite
      </button>
    </Sheet>
  );
}
