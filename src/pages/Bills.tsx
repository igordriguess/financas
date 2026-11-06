import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarClock, Check, ChevronRight, CircleSlash, CreditCard, Undo2, History, Pause, Pencil, Play, Plus, SearchX, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { billCountBetween, billEndMonth, billLine, billLines, billVersionAt, isPausedNow, type BillLine } from '../domain/finance';
import { FREQUENCY_LABEL, FREQUENCY_MONTHS, PERSON_LABEL, RESPONSIBLES, type Bill, type Frequency, type Responsible } from '../domain/types';
import { brl } from '../lib/money';
import { addMonths, currentMonth, fmtDate, monthLabel, monthRange, type Month } from '../lib/months';
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, ListRow, Money, MoneyInput, MonthSwitcher, PageHeader, Progress, Segmented, SectionTitle, Select, Sheet, cx, span5, useResetOnOpen, useSessionState } from '../components/ui';
import { CategoryIcon } from '../components/icons';
import { ActivePills, FilterSection, OptionTile, SearchFilterBar, type ActivePill } from '../components/filters';
import { PersonAvatar, PersonGlyph, PersonTag, RESPONSIBLE_COLOR, WithOwner } from '../components/people';

/* ───────────────────────── Lista ───────────────────────── */
type BillStatusFilter = 'all' | 'pending' | 'paid' | 'overdue';
type BillSort = 'due' | 'amount' | 'name';
type RegStatus = 'all' | 'Ativa' | 'Pausada' | 'Encerrada' | 'Agendada';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function BillsPage() {
  const data = useStore((s) => s.data);
  const month = useStore((s) => s.month);
  const setBillPaid = useStore((s) => s.setBillPaid);
  const [tab, setTab] = useSessionState<'month' | 'all'>('fic-bills-tab', 'month');
  const [q, setQ] = useSessionState('fic-bills-q', '');
  const [who, setWho] = useSessionState<Responsible | 'all'>('fic-bills-who', 'all');
  const [status, setStatus] = useSessionState<BillStatusFilter>('fic-bills-status', 'all');
  const [regStatus, setRegStatus] = useSessionState<RegStatus>('fic-bills-regstatus', 'all');
  const [cat, setCat] = useSessionState('fic-bills-cat', '');
  const [sort, setSort] = useSessionState<BillSort>('fic-bills-sort', 'due');
  const [formOpen, setFormOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<BillLine | null>(null);
  const nav = useNavigate();

  const lines = useMemo(() => billLines(data, month), [data, month]);
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const usedCats = useMemo(() => {
    const ids = new Set(data.bills.filter((b) => !b.archivedAt).map((b) => b.categoryId));
    return data.categories.filter((c) => ids.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [data.bills, data.categories]);

  const matches = (b: Bill) => {
    if (who !== 'all' && b.responsible !== who) return false;
    if (cat && b.categoryId !== cat) return false;
    if (q.trim()) {
      const term = norm(q.trim());
      const hay = norm(`${b.name} ${catById.get(b.categoryId)?.name ?? ''} ${PERSON_LABEL[b.responsible]}`);
      if (!term.split(/\s+/).every((t) => hay.includes(t))) return false;
    }
    return true;
  };
  const sorter = (a: BillLine, b: BillLine) =>
    sort === 'amount' ? b.amountCents - a.amountCents : sort === 'name' ? a.bill.name.localeCompare(b.bill.name) : a.dueDate.localeCompare(b.dueDate) || a.bill.name.localeCompare(b.bill.name);

  const filtered = lines
    .filter((l) => matches(l.bill))
    .filter((l) => (status === 'pending' ? !l.paid : status === 'paid' ? l.paid : status === 'overdue' ? l.overdue : true))
    .sort(sorter);
  const total = lines.reduce((a, b) => a + b.amountCents, 0);
  const paid = lines.filter((l) => l.paid).reduce((a, b) => a + b.amountCents, 0);
  const fTotal = filtered.reduce((a, b) => a + b.amountCents, 0);
  const pending = filtered.filter((l) => !l.paid);
  const done = filtered.filter((l) => l.paid);
  const byWho = RESPONSIBLES.map((p) => ({ p, total: lines.filter((l) => l.bill.responsible === p).reduce((a, l) => a + l.amountCents, 0), count: lines.filter((l) => l.bill.responsible === p).length }));
  const overdueCount = lines.filter((l) => l.overdue).length;

  const allBills = data.bills
    .filter((b) => !b.archivedAt && matches(b))
    .filter((b) => regStatus === 'all' || billStatus(b).label === regStatus)
    .map((b) => ({ b, v: billVersionAt(data.billVersions, b.id, currentMonth()) }))
    .sort((x, y) => (sort === 'amount' ? (y.v?.amountCents ?? 0) - (x.v?.amountCents ?? 0) : sort === 'due' ? (x.v?.dueDay ?? 0) - (y.v?.dueDay ?? 0) || x.b.name.localeCompare(y.b.name) : x.b.name.localeCompare(y.b.name)));

  const clear = () => {
    setQ('');
    setWho('all');
    setCat('');
    setStatus('all');
    setRegStatus('all');
  };

  const row = (l: BillLine, i: number) => {
    const c = catById.get(l.bill.categoryId);
    return (
      <div key={l.bill.id} className={cx(i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
        <div className="flex items-center">
          <ListRow
            className="flex-1"
            onClick={() => setSelected(l)}
            left={<WithOwner who={l.bill.responsible}>{c ? <CategoryIcon icon={c.icon} color={c.color} size={40} /> : <span className="h-10 w-10" />}</WithOwner>}
            title={l.bill.name}
            subtitle={
              <span className="inline-flex items-center gap-1.5">
                <span className={cx(l.overdue && 'font-semibold text-expense')}>{l.paid ? `Paga em ${fmtDate(l.paidAt)}` : `${l.overdue ? 'Venceu' : 'Vence'} ${fmtDate(l.dueDate)}`}</span>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <PersonTag who={l.bill.responsible} />
                {l.bill.cardId && <CardTag cardId={l.bill.cardId} />}
                {l.total && l.total > 1 && (
                  <>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span>
                      {l.index}/{l.total}
                    </span>
                  </>
                )}
              </span>
            }
            right={<Money cents={l.amountCents} className={cx('text-[15px] font-semibold', l.paid ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-900 dark:text-white')} />}
          />
          <button
            onClick={() => void setBillPaid(l.bill.id, month, !l.paid)}
            aria-label={l.paid ? `Marcar ${l.bill.name} como pendente` : `Marcar ${l.bill.name} como paga`}
            className={cx(
              'mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-90',
              l.paid ? 'bg-income text-white' : 'border-2 border-slate-200 text-transparent hover:border-income hover:text-income dark:border-ink-600',
            )}
          >
            <Check size={20} strokeWidth={3} />
          </button>
        </div>
      </div>
    );
  };

  const statusLabel: Record<BillStatusFilter, string> = { all: 'Todas', pending: 'Pendentes', paid: 'Pagas', overdue: 'Vencidas' };
  const sortLabel: Record<BillSort, string> = { due: 'Vencimento', amount: 'Maior valor', name: 'Nome A–Z' };
  const pills: ActivePill[] = [
    ...(who !== 'all' ? [{ key: 'who', label: <span className="inline-flex items-center gap-1"><PersonGlyph who={who} size={14} />{PERSON_LABEL[who]}</span>, onRemove: () => setWho('all') }] : []),
    ...(tab === 'month' && status !== 'all' ? [{ key: 'st', label: statusLabel[status], onRemove: () => setStatus('all') }] : []),
    ...(tab === 'all' && regStatus !== 'all' ? [{ key: 'rs', label: `${regStatus}s`, onRemove: () => setRegStatus('all') }] : []),
    ...(cat ? [{ key: 'cat', label: catById.get(cat)?.name ?? 'Categoria', onRemove: () => setCat('') }] : []),
    ...(sort !== 'due' ? [{ key: 'sort', label: `Ordem: ${sortLabel[sort]}`, onRemove: () => setSort('due') }] : []),
  ];
  const resultCount = tab === 'month' ? filtered.length : allBills.length;

  const filterBar = (
    <div className="mt-6">
      <SearchFilterBar q={q} setQ={setQ} placeholder="Buscar contas" activeCount={pills.length} onOpenFilters={() => setFiltersOpen(true)} />
      <ActivePills
        pills={pills}
        onClear={() => {
          clear();
          setSort('due');
        }}
        summary={tab === 'month' ? `${filtered.length} de ${lines.length} contas · ${brl(fTotal)}` : `${allBills.length} de ${data.bills.filter((b) => !b.archivedAt).length} contas`}
      />
      {!pills.length && q.trim() && (
        <p className="mt-2 px-1 text-[13px] text-slate-500">{tab === 'month' ? `${filtered.length} de ${lines.length} contas · ${brl(fTotal)}` : `${allBills.length} contas`}</p>
      )}
      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtrar contas"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                clear();
                setSort('due');
              }}
            >
              Limpar
            </Button>
            <Button size="lg" onClick={() => setFiltersOpen(false)}>
              Ver {resultCount} {resultCount === 1 ? 'conta' : 'contas'}
            </Button>
          </div>
        }
      >
        <div className="space-y-6 pb-2">
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
          <FilterSection title="Situação">
            {tab === 'month' ? (
              <div className="grid grid-cols-2 gap-2">
                {(['all', 'pending', 'paid', 'overdue'] as BillStatusFilter[]).map((v) => (
                  <OptionTile key={v} active={status === v} onClick={() => setStatus(v)}>
                    {statusLabel[v]}
                    {v === 'overdue' && overdueCount > 0 && <span className="rounded-full bg-expense px-1.5 text-[11px] font-bold text-white">{overdueCount}</span>}
                  </OptionTile>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-6 gap-2">
                {(['all', 'Ativa', 'Pausada', 'Agendada', 'Encerrada'] as RegStatus[]).map((v, i) => (
                  <OptionTile key={v} className={span5(i)} active={regStatus === v} onClick={() => setRegStatus(v)}>
                    {v === 'all' ? 'Todas' : `${v}s`}
                  </OptionTile>
                ))}
              </div>
            )}
          </FilterSection>
          <FilterSection title="Ordenar por">
            <div className="grid grid-cols-3 gap-2">
              {(['due', 'amount', 'name'] as BillSort[]).map((v) => (
                <OptionTile key={v} active={sort === v} onClick={() => setSort(v)}>
                  {sortLabel[v]}
                </OptionTile>
              ))}
            </div>
          </FilterSection>
          {usedCats.length > 0 && (
            <FilterSection title="Categoria">
              <div className="grid grid-cols-2 gap-2">
                <OptionTile active={!cat} onClick={() => setCat('')} className="col-span-2">
                  Todas as categorias
                </OptionTile>
                {usedCats.map((c) => (
                  <OptionTile key={c.id} active={cat === c.id} onClick={() => setCat(cat === c.id ? '' : c.id)} className="justify-start px-3">
                    <CategoryIcon icon={c.icon} color={c.color} size={24} />
                    <span className="min-w-0 break-words text-left">{c.name}</span>
                  </OptionTile>
                ))}
              </div>
            </FilterSection>
          )}
        </div>
      </Sheet>
    </div>
  );

  const noResults = (
    <Card className="mt-5">
      <EmptyState icon={SearchX} title="Nenhuma conta encontrada" text="Tente outro termo ou remova os filtros." action={<Button variant="secondary" onClick={clear}>Limpar filtros</Button>} />
    </Card>
  );

  return (
    <div className="animate-fade-in">
      <PageHeader title="Contas fixas" subtitle="Despesas recorrentes da casa" actions={<Button size="sm" icon={Plus} onClick={() => setFormOpen(true)}>Nova</Button>} />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'month', label: 'Contas do mês' },
          { value: 'all', label: 'Cadastradas' },
        ]}
      />

      {tab === 'month' ? (
        <>
          <div className="mt-5">
            <MonthSwitcher />
          </div>
          <Card className="mt-5 p-5 md:p-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[13px] text-slate-500">Total do mês</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{brl(total)}</p>
              </div>
              <div className="text-right text-[13px]">
                <p className="text-income">Pago {brl(paid)}</p>
                <p className="text-expense">Pendente {brl(total - paid)}</p>
              </div>
            </div>
            <div className="mt-3">
              <Progress value={total ? (paid / total) * 100 : 0} tone="green" />
            </div>
            {lines.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {byWho.map(({ p, total: t, count }) => (
                  <button
                    key={p}
                    onClick={() => setWho(who === p ? 'all' : p)}
                    aria-pressed={who === p}
                    className={cx(
                      'flex min-w-0 flex-col items-center gap-1 rounded-2xl p-2 text-center transition sm:flex-row sm:gap-2 sm:text-left',
                      who === p ? 'bg-slate-100 ring-2 ring-inset dark:bg-ink-700' : 'hover:bg-slate-50 dark:hover:bg-ink-700/60',
                    )}
                    style={who === p ? ({ '--tw-ring-color': RESPONSIBLE_COLOR[p] } as React.CSSProperties) : undefined}
                    data-tip={`Filtrar contas de ${PERSON_LABEL[p]} (${count})`}
                  >
                    <PersonAvatar who={p} size={30} />
                    <span className="min-w-0 max-w-full">
                      <span className="block break-words text-[12px] text-slate-500">
                        {PERSON_LABEL[p]} · {count}
                      </span>
                      <span className="block whitespace-nowrap text-[13px] font-semibold tabular-nums text-slate-900 dark:text-white">{brl(t)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-[12px] text-slate-500">Tudo sai do orçamento conjunto — o responsável é só identificação.</p>
          </Card>

          {lines.length > 0 && filterBar}

          {lines.length === 0 ? (
            <Card className="mt-5">
              <EmptyState icon={CalendarClock} title="Nenhuma conta neste mês" text="Cadastre aluguel, internet, energia e outros compromissos mensais." action={<Button onClick={() => setFormOpen(true)}>Cadastrar conta</Button>} />
            </Card>
          ) : filtered.length === 0 ? (
            noResults
          ) : (
            <>
              {pending.length > 0 && (
                <>
                  <SectionTitle>
                    Pendentes · {pending.length} · {brl(pending.reduce((a, l) => a + l.amountCents, 0))}
                  </SectionTitle>
                  <Card>{pending.map(row)}</Card>
                </>
              )}
              {done.length > 0 && (
                <>
                  <SectionTitle>
                    Pagas · {done.length} · {brl(done.reduce((a, l) => a + l.amountCents, 0))}
                  </SectionTitle>
                  <Card>{done.map(row)}</Card>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {data.bills.some((b) => !b.archivedAt) && filterBar}
          {data.bills.filter((b) => !b.archivedAt).length === 0 ? (
            <Card className="mt-5">
              <EmptyState icon={CalendarClock} title="Nenhuma conta cadastrada" action={<Button onClick={() => setFormOpen(true)}>Cadastrar conta</Button>} />
            </Card>
          ) : allBills.length === 0 ? (
            noResults
          ) : (
            <Card className="mt-5">
              {allBills.map(({ b, v }, i) => {
                const c = catById.get(b.categoryId);
                const st = billStatus(b);
                return (
                  <div key={b.id} className={cx(i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
                    <ListRow
                      onClick={() => nav(`/contas/${b.id}`)}
                      left={<WithOwner who={b.responsible}>{c ? <CategoryIcon icon={c.icon} color={c.color} size={40} /> : <span className="h-10 w-10" />}</WithOwner>}
                      title={b.name}
                      subtitle={
                        <span className="inline-flex items-center gap-1.5">
                          <PersonTag who={b.responsible} />
                          {b.cardId && <CardTag cardId={b.cardId} />}
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <span>
                            {b.frequency !== 'monthly' && `${FREQUENCY_LABEL[b.frequency]} · `}dia {v?.dueDay} · {recurrenceText(b)}
                          </span>
                        </span>
                      }
                      right={
                        <div className="flex flex-col items-end gap-1">
                          <Money cents={v?.amountCents ?? 0} className="text-[15px] font-semibold text-slate-900 dark:text-white" />
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </div>
                      }
                    />
                  </div>
                );
              })}
            </Card>
          )}
        </>
      )}

      <BillForm open={formOpen} onClose={() => setFormOpen(false)} />
      <BillMonthSheet line={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

export function billStatus(b: Bill): { label: string; tone: 'green' | 'amber' | 'gray' | 'blue' } {
  const cm = currentMonth();
  const end = billEndMonth(b);
  if (b.archivedAt) return { label: 'Excluída', tone: 'gray' };
  if (end && end < cm) return { label: 'Encerrada', tone: 'gray' };
  if (isPausedNow(b, cm)) return { label: 'Pausada', tone: 'amber' };
  if (b.startMonth > cm) return { label: 'Agendada', tone: 'blue' };
  return { label: 'Ativa', tone: 'green' };
}
function recurrenceText(b: Bill) {
  const end = billEndMonth(b);
  if (!end) return `desde ${monthLabel(b.startMonth, { short: true })}, sem data final`;
  const offset = b.installmentOffset ?? 0;
  const total = offset + billCountBetween(b.startMonth, end, b.frequency);
  return `${monthLabel(b.startMonth, { short: true })} a ${monthLabel(end, { short: true })} (${offset ? `parcelas ${offset + 1} a ${total} de ${total}` : `${total}x`})`;
}

/* ───────────────────────── Ações do mês ───────────────────────── */
function BillMonthSheet({ line, onClose }: { line: BillLine | null; onClose: () => void }) {
  const data = useStore((s) => s.data);
  const updateBill = useStore((s) => s.updateBill);
  const setBillPaid = useStore((s) => s.setBillPaid);
  const nav = useNavigate();
  // Recalcula a linha a partir dos dados atuais (após salvar, reflete a mudança).
  const l = line ? billLine(data, data.bills.find((b) => b.id === line.bill.id) ?? line.bill, line.month) ?? line : null;
  const [mode, setMode] = useResetOnOpen<'view' | 'pay' | 'edit'>(!!line, () => 'view');
  const [f, setF] = useResetOnOpen(!!line, () => ({
    amount: line?.amountCents ?? 0,
    dueDay: Number(line?.dueDate.slice(8, 10) ?? 10),
    paidAmount: line?.amountCents ?? 0,
    scope: 'forward' as 'month' | 'forward',
  }));
  const [busy, setBusy] = useState(false);
  if (!l) return null;
  const c = data.categories.find((x) => x.id === l.bill.categoryId);
  const changed = f.amount !== l.amountCents || f.dueDay !== Number(l.dueDate.slice(8, 10));
  const validEdit = changed && f.amount > 0 && f.dueDay >= 1 && f.dueDay <= 31;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onClose();
    } catch {
      /* toast já exibido */
    } finally {
      setBusy(false);
    }
  };

  const status = l.paid ? (
    <Badge tone="green">
      <Check size={11} strokeWidth={3} /> Paga
    </Badge>
  ) : l.overdue ? (
    <Badge tone="red">Vencida</Badge>
  ) : (
    <Badge tone="amber">Pendente</Badge>
  );

  return (
    <Sheet
      open={!!line}
      onClose={onClose}
      title={l.bill.name}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-x-1.5">
          {monthLabel(l.month)} · <PersonTag who={l.bill.responsible} />
        </span>
      }
    >
      {/* Resumo */}
      <div className="flex items-center gap-4 rounded-3xl bg-slate-50 p-4 dark:bg-ink-900">
        {c && (
          <WithOwner who={l.bill.responsible}>
            <CategoryIcon icon={c.icon} color={c.color} size={48} />
          </WithOwner>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Money cents={l.amountCents} className="text-[26px] font-bold leading-tight text-slate-900 dark:text-white" />
            {status}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-slate-500">
            <span>{l.paid ? `Paga em ${fmtDate(l.paidAt)}` : `Vence ${fmtDate(l.dueDate)}`}</span>
            {l.total && l.total > 1 && <span>· parcela {l.index}/{l.total}</span>}
            {l.bill.cardId && <CardTag cardId={l.bill.cardId} />}
          </p>
        </div>
      </div>

      {mode === 'view' && (
        <div className="mt-5 animate-fade-in">
          {l.paid ? (
            <Button variant="secondary" size="lg" icon={Undo2} className="w-full" loading={busy} onClick={() => run(() => setBillPaid(l.bill.id, l.month, false))}>
              Desfazer pagamento
            </Button>
          ) : (
            <>
              <Button variant="success" size="lg" icon={Check} className="w-full" loading={busy} onClick={() => run(() => setBillPaid(l.bill.id, l.month, true, null))}>
                Marcar como paga
              </Button>
              <button onClick={() => setMode('pay')} className="mt-2 w-full py-2 text-center text-[14px] font-semibold text-brand-500 hover:underline">
                Paguei um valor diferente
              </button>
            </>
          )}

          <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-slate-100 dark:ring-ink-700">
            <ActionRow icon={Pencil} label="Alterar valor ou vencimento" onClick={() => setMode('edit')} />
            <ActionRow icon={History} label="Histórico, recorrência e detalhes" onClick={() => nav(`/contas/${l.bill.id}`)} border />
          </div>
        </div>
      )}

      {mode === 'pay' && (
        <div className="mt-5 space-y-4 animate-fade-in">
          <Field label="Valor pago">
            <MoneyInput autoFocus value={f.paidAmount} onChange={(paidAmount) => setF({ ...f, paidAmount })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" onClick={() => setMode('view')}>
              Voltar
            </Button>
            <Button
              variant="success"
              size="lg"
              loading={busy}
              disabled={f.paidAmount <= 0}
              onClick={() => run(() => setBillPaid(l.bill.id, l.month, true, f.paidAmount !== l.amountCents ? f.paidAmount : null))}
            >
              Confirmar
            </Button>
          </div>
        </div>
      )}

      {mode === 'edit' && (
        <div className="mt-5 space-y-4 animate-fade-in">
          <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
            <Field label="Valor">
              <MoneyInput value={f.amount} onChange={(amount) => setF({ ...f, amount })} />
            </Field>
            <Field label="Dia do venc.">
              <Input type="number" inputMode="numeric" min={1} max={31} value={f.dueDay} onChange={(e) => setF({ ...f, dueDay: Number(e.target.value) })} className="text-center" />
            </Field>
          </div>
          <div role="radiogroup" aria-label="A alteração vale para" className="space-y-2">
            <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">A alteração vale para</p>
            {(
              [
                ['forward', `${monthLabel(l.month)} em diante`, 'Atualiza este mês e os próximos.'],
                ['month', `Somente ${monthLabel(l.month)}`, 'Os outros meses continuam iguais.'],
              ] as ['month' | 'forward', string, string][]
            ).map(([v, t, d]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={f.scope === v}
                onClick={() => setF({ ...f, scope: v })}
                className={cx(
                  'flex w-full items-center gap-3 rounded-2xl p-3.5 text-left ring-1 transition',
                  f.scope === v ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-500/10' : 'ring-slate-200 hover:bg-slate-50 dark:ring-ink-600 dark:hover:bg-ink-700/60',
                )}
              >
                <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', f.scope === v ? 'border-brand-500' : 'border-slate-300 dark:border-ink-600')}>
                  {f.scope === v && <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />}
                </span>
                <span>
                  <span className="block text-[14px] font-semibold text-slate-900 dark:text-white">{t}</span>
                  <span className="block text-[12px] text-slate-500">{d}</span>
                </span>
              </button>
            ))}
            <p className="px-1 text-[12px] text-slate-500">Meses anteriores nunca são alterados.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" onClick={() => setMode('view')}>
              Voltar
            </Button>
            <Button size="lg" loading={busy} disabled={!validEdit} onClick={() => run(() => updateBill(l.bill.id, l.month, f.scope, { amountCents: f.amount, dueDay: f.dueDay }))}>
              Salvar
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function ActionRow({ icon: Icon, label, onClick, border }: { icon: typeof Pencil; label: string; onClick: () => void; border?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] font-medium text-slate-800 transition-colors active:bg-slate-100 dark:text-slate-100 dark:active:bg-ink-700 [@media(hover:hover)]:hover:bg-slate-50 dark:[@media(hover:hover)]:hover:bg-ink-700/60',
        border && 'border-t border-slate-100 dark:border-ink-700',
      )}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-slate-300">
        <Icon size={18} />
      </span>
      <span className="flex-1">{label}</span>
      <ChevronRight size={18} className="text-slate-300" />
    </button>
  );
}

/* ───────────────────────── Detalhe e histórico ───────────────────────── */
export function BillDetailPage() {
  const { id } = useParams();
  const data = useStore((s) => s.data);
  const pauseBill = useStore((s) => s.pauseBill);
  const resumeBill = useStore((s) => s.resumeBill);
  const endBill = useStore((s) => s.endBill);
  const deleteBill = useStore((s) => s.deleteBill);
  const setBillPaid = useStore((s) => s.setBillPaid);
  const confirm = useStore((s) => s.confirm);
  const nav = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [selected, setSelected] = useState<BillLine | null>(null);
  const bill = data.bills.find((b) => b.id === id);
  const cm = currentMonth();

  const history = useMemo(() => {
    if (!bill) return [];
    const end = billEndMonth(bill);
    const last = end && end < addMonths(cm, 3) ? end : addMonths(cm, 3);
    return monthRange(bill.startMonth, last)
      .reverse()
      .map((m) => ({ m, line: billLine(data, bill, m) }));
  }, [bill, data, cm]);

  if (!bill) return <EmptyState icon={CalendarClock} title="Conta não encontrada" action={<Link to="/contas" className="font-semibold text-brand-500">Voltar</Link>} />;
  const c = data.categories.find((x) => x.id === bill.categoryId);
  const st = billStatus(bill);
  const paused = isPausedNow(bill, cm);
  const end = billEndMonth(bill);
  const ended = !!end && end < cm;
  const v = billVersionAt(data.billVersions, bill.id, cm);
  const paidTotal = history.filter((h) => h.line?.paid).reduce((a, h) => a + (h.line?.amountCents ?? 0), 0);

  async function remove() {
    const ok = await confirm({
      title: `Excluir ${bill!.name}?`,
      message: 'A conta deixará de ser gerada. Os meses anteriores continuam no histórico e nos relatórios.',
      confirmText: 'Excluir conta',
      danger: true,
    });
    if (!ok) return;
    await deleteBill(bill!.id);
    nav('/contas', { replace: true });
  }

  return (
    <div className="animate-fade-in">
      <PageHeader back title={bill.name} subtitle={c?.name} actions={!bill.archivedAt && <IconButton icon={Pencil} label="Editar conta" onClick={() => setEditOpen(true)} />} />
      <Card className="p-5">
        <div className="flex items-center gap-3">
          {c && (
            <WithOwner who={bill.responsible}>
              <CategoryIcon icon={c.icon} color={c.color} size={48} />
            </WithOwner>
          )}
          <div className="flex-1">
            <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{brl(v?.amountCents ?? 0)}</p>
            <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-slate-500">
              {FREQUENCY_LABEL[bill.frequency]} · vence dia {v?.dueDay} · <PersonTag who={bill.responsible} />
            </p>
          </div>
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
        <p className="mt-3 text-[13px] text-slate-600 dark:text-slate-300">{recurrenceText(bill)}</p>
        <p className="text-[12px] text-slate-500">Total já pago: {brl(paidTotal)}</p>
        {!bill.archivedAt && !ended && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {paused ? (
              <Button variant="secondary" size="sm" icon={Play} onClick={() => void resumeBill(bill.id, cm)}>
                Retomar
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                icon={Pause}
                onClick={async () => {
                  const from = addMonths(cm, billLine(data, bill, cm)?.paid ? 1 : 0);
                  if (await confirm({ title: 'Pausar recorrência?', message: `A conta não será gerada a partir de ${monthLabel(from)} até ser retomada. Meses anteriores não mudam.`, confirmText: 'Pausar' })) await pauseBill(bill.id, from);
                }}
              >
                Pausar
              </Button>
            )}
            <Button variant="secondary" size="sm" icon={CircleSlash} onClick={() => setEndOpen(true)}>
              Encerrar
            </Button>
            <Button variant="danger" size="sm" icon={Trash2} onClick={remove}>
              Excluir
            </Button>
          </div>
        )}
      </Card>

      <SectionTitle>Histórico</SectionTitle>
      <Card>
        {history.map(({ m, line }, i) => (
          <div key={m} className={cx(i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
            <ListRow
              onClick={line ? () => setSelected(line) : undefined}
              title={<span className={cx(m === cm && 'text-brand-600 dark:text-brand-100')}>{monthLabel(m)}{m === cm && ' · atual'}</span>}
              subtitle={
                line
                  ? line.paid
                    ? `Paga em ${fmtDate(line.paidAt)}`
                    : `${line.overdue ? 'Vencida' : m > cm ? 'Prevista' : 'Pendente'} · vence ${fmtDate(line.dueDate)}`
                  : bill.pauses.some((p) => m >= p.from && (p.to === null || m <= p.to))
                    ? 'Pausada'
                    : 'Sem cobrança neste mês'
              }
              right={
                line ? (
                  <div className="flex items-center gap-2">
                    <Money cents={line.amountCents} className="text-[15px] font-semibold text-slate-900 dark:text-white" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void setBillPaid(bill.id, m, !line.paid);
                      }}
                      aria-label={line.paid ? 'Marcar como pendente' : 'Marcar como paga'}
                      className={cx('flex h-8 w-8 items-center justify-center rounded-full', line.paid ? 'bg-income text-white' : 'border-2 border-slate-200 text-transparent dark:border-ink-600')}
                    >
                      <Check size={16} strokeWidth={3} />
                    </button>
                  </div>
                ) : (
                  <span className="text-[13px] text-slate-400">—</span>
                )
              }
            />
          </div>
        ))}
      </Card>

      <BillInfoSheet bill={bill} open={editOpen} onClose={() => setEditOpen(false)} />
      <EndSheet bill={bill} open={endOpen} onClose={() => setEndOpen(false)} onEnd={endBill} />
      <BillMonthSheet line={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function EndSheet({ bill, open, onClose, onEnd }: { bill: Bill; open: boolean; onClose: () => void; onEnd: (id: string, m: Month) => Promise<void> }) {
  const [m, setM] = useResetOnOpen(open, () => currentMonth());
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Encerrar conta"
      footer={
        <Button size="lg" className="w-full" onClick={() => void onEnd(bill.id, m).then(onClose)} disabled={!m || m < bill.startMonth}>
          Encerrar após {m ? monthLabel(m) : '…'}
        </Button>
      }
    >
      <Field label="Último mês de cobrança" hint="A conta não será gerada depois deste mês. O histórico é mantido.">
        <Input type="month" value={m} min={bill.startMonth} onChange={(e) => setM(e.target.value)} />
      </Field>
    </Sheet>
  );
}

/* ───────────────────────── Recorrência inteligente ───────────────────────── */
interface RecState {
  frequency: Frequency;
  startMonth: Month;
  hasEnd: boolean;
  /** Total de parcelas do contrato (ex.: 48). */
  installments: number | null;
  /** Número da parcela que cai no mês de início (ex.: 47). */
  current: number;
  endMonth: Month | null;
}
function RecurrenceFields({ v, onChange, lockStart }: { v: RecState; onChange: (v: RecState) => void; lockStart?: boolean }) {
  const step = FREQUENCY_MONTHS[v.frequency];
  const cur = Math.max(1, v.current || 1);
  // Término = início + parcelas restantes. Parcelas → calcula término; término → calcula parcelas.
  const endFor = (total: number | null, c: number, start: Month, st: number) => (total && total - c + 1 > 0 ? addMonths(start, (total - c) * st) : null);
  const setCount = (n: number | null) => onChange({ ...v, installments: n, endMonth: endFor(n, cur, v.startMonth, step) });
  const setCurrent = (c: number) => {
    const nc = Math.max(1, c);
    onChange({ ...v, current: nc, endMonth: endFor(v.installments, nc, v.startMonth, step) });
  };
  const setEnd = (m: Month | null) =>
    onChange({ ...v, endMonth: m, installments: m && m >= v.startMonth ? cur - 1 + billCountBetween(v.startMonth, m, v.frequency) : null });
  const setStart = (m: Month) => onChange({ ...v, startMonth: m, endMonth: v.installments ? endFor(v.installments, cur, m, step) : v.endMonth });
  const invalidCurrent = !!v.installments && cur > v.installments;
  const remaining = v.installments ? v.installments - cur + 1 : null;

  return (
    <div className="space-y-4">
      <Field label="Mês de início" hint="Cobrança mensal.">
        <Input type="month" value={v.startMonth} disabled={lockStart} onChange={(e) => e.target.value && setStart(e.target.value)} />
      </Field>
      <Segmented
        value={v.hasEnd ? 'end' : 'open'}
        onChange={(x) => onChange({ ...v, hasEnd: x === 'end', ...(x === 'open' ? { installments: null, endMonth: null, current: 1 } : {}) })}
        options={[
          { value: 'open', label: 'Sem data final' },
          { value: 'end', label: 'Com término' },
        ]}
      />
      {v.hasEnd && (
        <div className="animate-pop-in">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Total de parcelas">
              <Input type="number" inputMode="numeric" min={1} max={600} value={v.installments ?? ''} placeholder="Ex.: 48" onChange={(e) => setCount(e.target.value ? Math.max(1, Math.min(600, Number(e.target.value))) : null)} />
            </Field>
            <Field label="Parcela atual" error={invalidCurrent ? 'Maior que o total' : null}>
              <Input type="number" inputMode="numeric" min={1} max={600} value={cur} disabled={lockStart} onChange={(e) => setCurrent(Number(e.target.value) || 1)} />
            </Field>
            <Field label="Término">
              <Input type="month" value={v.endMonth ?? ''} min={v.startMonth} onChange={(e) => setEnd(e.target.value || null)} />
            </Field>
          </div>
          {v.endMonth && v.installments && !invalidCurrent ? (
            <p className="mt-2 rounded-2xl bg-brand-50 p-3 text-[13px] text-brand-700 dark:bg-brand-500/10 dark:text-brand-100">
              {cur > 1 ? `Parcela ${cur}/${v.installments} em ${monthLabel(v.startMonth)}. ` : ''}
              {remaining} {remaining === 1 ? 'cobrança restante' : 'cobranças restantes'}: de {monthLabel(v.startMonth)} a {monthLabel(v.endMonth)}
            </p>
          ) : (
            <p className="mt-2 text-[12px] text-slate-500">
              Informe o total de parcelas ou o mês de término — o outro é calculado. Se a conta já está em andamento, informe a parcela atual (ex.: 47 de 48).
            </p>
          )}
          {v.endMonth && v.endMonth < v.startMonth && <p className="mt-1 text-[12px] text-expense">O término deve ser depois do início.</p>}
        </div>
      )}
    </div>
  );
}

export function BillForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useStore((s) => s.data);
  const me = useStore((s) => s.me);
  const createBill = useStore((s) => s.createBill);
  const month = useStore((s) => s.month);
  const cats = data.categories.filter((c) => !c.archivedAt).sort((a, b) => a.sortOrder - b.sortOrder);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useResetOnOpen(open, () => ({
    name: '',
    amount: 0,
    categoryId: cats.find((c) => c.name === 'Moradia')?.id ?? cats[0]?.id ?? '',
    responsible: me.person as Responsible,
    cardId: '',
    dueDay: 10,
    rec: { frequency: 'monthly' as Frequency, startMonth: month < currentMonth() ? currentMonth() : month, hasEnd: false, installments: null, current: 1, endMonth: null } as RecState,
  }));
  const valid =
    f.name.trim() &&
    f.amount > 0 &&
    f.categoryId &&
    f.dueDay >= 1 &&
    f.dueDay <= 31 &&
    (!f.rec.hasEnd || (f.rec.endMonth && f.rec.endMonth >= f.rec.startMonth && (!f.rec.installments || f.rec.current <= f.rec.installments)));

  async function save() {
    if (!valid) return;
    setBusy(true);
    try {
      await createBill({
        name: f.name,
        amountCents: f.amount,
        categoryId: f.categoryId,
        responsible: f.responsible,
        dueDay: f.dueDay,
        frequency: f.rec.frequency,
        startMonth: f.rec.startMonth,
        endMonth: f.rec.hasEnd ? f.rec.endMonth : null,
        installments: f.rec.hasEnd ? f.rec.installments : null,
        installmentOffset: f.rec.hasEnd ? Math.max(0, f.rec.current - 1) : 0,
        cardId: f.cardId || null,
      });
      onClose();
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Nova conta fixa" footer={<Button size="lg" className="w-full" disabled={!valid} loading={busy} onClick={save}>Cadastrar conta</Button>}>
      <div className="space-y-4">
        <Field label="Nome da conta">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Aluguel, Internet, Academia…" maxLength={50} autoFocus />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
          <Field label="Valor">
            <MoneyInput value={f.amount} onChange={(amount) => setF({ ...f, amount })} />
          </Field>
          <Field label="Vence dia">
            <Input type="number" inputMode="numeric" min={1} max={31} value={f.dueDay} onChange={(e) => setF({ ...f, dueDay: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Categoria">
          <Select value={f.categoryId} onChange={(categoryId) => setF({ ...f, categoryId })}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Responsável" hint="Apenas para organização — o valor sai do orçamento compartilhado.">
          <Segmented value={f.responsible} onChange={(responsible) => setF({ ...f, responsible })} options={RESPONSIBLES.map((p) => ({ value: p, ariaLabel: PERSON_LABEL[p], label: <span className="inline-flex items-center gap-1.5"><PersonGlyph who={p} size={17} />{PERSON_LABEL[p]}</span> }))} />
        </Field>
        <RecurrenceFields v={f.rec} onChange={(rec) => setF({ ...f, rec })} />
        <p className="rounded-2xl bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-500 dark:bg-ink-900">
          Contas fixas saem do dinheiro (boleto, Pix ou débito automático). Compras no cartão de crédito são gastos variáveis: use <b>Adicionar gasto</b>.
        </p>
      </div>
    </Sheet>
  );
}

function BillInfoSheet({ bill, open, onClose }: { bill: Bill; open: boolean; onClose: () => void }) {
  const data = useStore((s) => s.data);
  const updateBillInfo = useStore((s) => s.updateBillInfo);
  const cats = data.categories.filter((c) => !c.archivedAt || c.id === bill.categoryId);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useResetOnOpen(open, () => {
    const end = billEndMonth(bill);
    return {
      name: bill.name,
      categoryId: bill.categoryId,
      responsible: bill.responsible,
      cardId: bill.cardId ?? '',
      rec: {
        frequency: bill.frequency,
        startMonth: bill.startMonth,
        hasEnd: !!end,
        installments: end ? (bill.installmentOffset ?? 0) + billCountBetween(bill.startMonth, end, bill.frequency) : null,
        current: (bill.installmentOffset ?? 0) + 1,
        endMonth: end,
      } as RecState,
    };
  });
  const valid = f.name.trim() && (!f.rec.hasEnd || (f.rec.endMonth && f.rec.endMonth >= bill.startMonth));
  async function save() {
    if (!valid) return;
    setBusy(true);
    try {
      await updateBillInfo(bill.id, {
        name: f.name.trim(),
        categoryId: f.categoryId,
        responsible: f.responsible,
        frequency: f.rec.frequency,
        endMonth: f.rec.hasEnd ? f.rec.endMonth : null,
        installments: f.rec.hasEnd ? f.rec.installments : null,
        installmentOffset: f.rec.hasEnd ? Math.max(0, f.rec.current - 1) : 0,
        cardId: f.cardId || null,
      });
      onClose();
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Editar conta" footer={<Button size="lg" className="w-full" disabled={!valid} loading={busy} onClick={save}>Salvar</Button>}>
      <div className="space-y-4">
        <Field label="Nome da conta">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={50} />
        </Field>
        <Field label="Categoria">
          <Select value={f.categoryId} onChange={(categoryId) => setF({ ...f, categoryId })}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Responsável">
          <Segmented value={f.responsible} onChange={(responsible) => setF({ ...f, responsible })} options={RESPONSIBLES.map((p) => ({ value: p, ariaLabel: PERSON_LABEL[p], label: <span className="inline-flex items-center gap-1.5"><PersonGlyph who={p} size={17} />{PERSON_LABEL[p]}</span> }))} />
        </Field>
        {bill.cardId && (
          <div className="space-y-2 rounded-2xl bg-amber-50 p-3 text-[13px] leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <p>
              Esta conta está no cartão — o ideal é tratá-la como <b>gasto variável</b>. Converta na tela do cartão (<b>Converter em gasto</b>).
            </p>
            <ChargeField value={f.cardId} onChange={(cardId) => setF({ ...f, cardId })} />
          </div>
        )}
        <RecurrenceFields lockStart v={f.rec} onChange={(rec) => setF({ ...f, rec: { ...rec, startMonth: bill.startMonth } })} />
        <p className="text-[12px] text-slate-500">Para mudar valor ou vencimento, toque em um mês no histórico e escolha se vale só para ele ou também para os próximos.</p>
      </div>
    </Sheet>
  );
}

/** Onde a conta é cobrada: dinheiro (boleto/Pix/débito) ou um cartão de crédito. */
function ChargeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const cards = useStore((s) => s.data.cards).filter((c) => c.kind === 'credit' && !c.deletedAt && (c.active || c.id === value));
  return (
    <Field
      label="Cobrança"
      hint={value ? 'Entra na fatura e ocupa o limite do cartão. No orçamento conta uma vez só, como conta fixa.' : 'Sai do dinheiro disponível (boleto, Pix ou débito automático).'}
    >
      <Select value={value} onChange={onChange}>
        <option value="">Boleto, Pix ou débito (dinheiro)</option>
        {cards.map((c) => (
          <option key={c.id} value={c.id}>
            Cartão de crédito · {c.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Mostra em qual cartão a conta é cobrada. */
function CardTag({ cardId }: { cardId: string }) {
  const card = useStore((s) => s.data.cards.find((c) => c.id === cardId));
  if (!card) return null;
  return (
    <>
      <span className="text-slate-300 dark:text-slate-600">·</span>
      <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300" data-tip={`Cobrada no cartão ${card.name}`}>
        <CreditCard size={13} style={{ color: card.color }} />
        {card.name}
      </span>
    </>
  );
}
