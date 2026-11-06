import { useMemo, useState } from 'react';
import { Receipt } from 'lucide-react';
import { useStore } from '../store/useStore';
import { PAYMENT_LABEL, PAYMENT_METHODS, PERSON_LABEL, RESPONSIBLES, type PaymentMethod, type Responsible } from '../domain/types';
import { brl } from '../lib/money';
import { fmtDayHeader, monthOf } from '../lib/months';
import { Button, Card, EmptyState, ListRow, Money, MonthSwitcher, PageHeader, Sheet, cx, span5, useSessionState } from '../components/ui';
import { ActivePills, FilterSection, OptionTile, SearchFilterBar, type ActivePill } from '../components/filters';
import { CategoryIcon } from '../components/icons';
import { PersonGlyph, PersonTag, WithOwner } from '../components/people';

export function ExpensesPage() {
  const data = useStore((s) => s.data);
  const month = useStore((s) => s.month);
  const openExpense = useStore((s) => s.openExpense);
  const [q, setQ] = useSessionState('fic-exp-q', '');
  const [who, setWho] = useSessionState<Responsible | 'all'>('fic-exp-who', 'all');
  const [methods, setMethods] = useSessionState<PaymentMethod[]>('fic-exp-methods', []);
  const [cats, setCats] = useSessionState<string[]>('fic-exp-cats', []);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const cardById = useMemo(() => new Map(data.cards.map((c) => [c.id, c])), [data.cards]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.expenses
      .filter((e) => monthOf(e.date) === month)
      .filter((e) => who === 'all' || e.responsible === who)
      .filter((e) => !methods.length || methods.includes(e.method))
      .filter((e) => !cats.length || cats.includes(e.categoryId))
      .filter((e) => !term || e.description.toLowerCase().includes(term) || (catById.get(e.categoryId)?.name.toLowerCase().includes(term) ?? false))
      .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
  }, [data.expenses, month, who, methods, cats, q, catById]);

  const groups = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const e of list) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return [...m.entries()];
  }, [list]);

  const total = list.reduce((a, e) => a + e.amountCents, 0);
  const byMethod = (ms: PaymentMethod[]) => list.filter((e) => ms.includes(e.method)).reduce((a, e) => a + e.amountCents, 0);
  const activeFilters = (who !== 'all' ? 1 : 0) + methods.length + cats.length;
  const pills: ActivePill[] = [
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
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Despesas" subtitle="Compras pela data da compra" />
      <MonthSwitcher />

      <SearchFilterBar className="mt-5" q={q} setQ={setQ} placeholder="Buscar gastos" activeCount={pills.length} onOpenFilters={() => setFiltersOpen(true)} />
      <ActivePills pills={pills} onClear={clear} />

      <Card className="mt-5 p-5 md:p-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[13px] text-slate-500">{activeFilters || q ? 'Total filtrado' : 'Total de compras no mês'}</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{brl(total)}</p>
          </div>
          <p className="text-[13px] text-slate-500">{list.length} lançamentos</p>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-[12px]">
          <Stat label="À vista" value={byMethod(['pix', 'debit', 'cash'])} />
          <Stat label="Crédito" value={byMethod(['credit'])} />
          <Stat label="Benefício" value={byMethod(['benefit'])} />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Compras no crédito entram no saldo pela fatura (parcela a parcela), não pelo valor total.</p>
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
        groups.map(([date, items]) => (
          <section key={date} className="mt-8">
            <div className="mb-3 flex justify-between px-1 text-[13px] font-semibold text-slate-500">
              <span>{fmtDayHeader(date)}</span>
              <span className="tabular-nums">{brl(items.reduce((a, e) => a + e.amountCents, 0))}</span>
            </div>
            <Card>
              {items.map((e, i) => {
                const c = catById.get(e.categoryId);
                const card = e.cardId ? cardById.get(e.cardId) : null;
                return (
                  <div key={e.id} className={cx(i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
                    <ListRow
                      onClick={() => openExpense(e.id)}
                      left={<WithOwner who={e.responsible}>{c ? <CategoryIcon icon={c.icon} color={c.color} size={40} /> : <span className="h-10 w-10" />}</WithOwner>}
                      title={e.description || c?.name || 'Gasto'}
                      subtitle={
                        <>
                          {c?.name} · <PersonTag who={e.responsible} /> · {card ? `${card.name}${card.deletedAt ? ' (removido)' : ''}` : PAYMENT_LABEL[e.method]}
                        </>
                      }
                      right={
                        <div>
                          <Money cents={-e.amountCents} className="block text-[15px] font-semibold text-slate-900 dark:text-white" />
                          {e.installments > 1 && <span className="text-[12px] text-slate-500">{e.installments}x de {brl(Math.floor(e.amountCents / e.installments))}</span>}
                          {e.method === 'benefit' && <span className="text-[12px] text-orange-600">benefício</span>}
                        </div>
                      }
                    />
                  </div>
                );
              })}
            </Card>
          </section>
        ))
      )}

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
              }}
            >
              Limpar
            </Button>
            <Button size="lg" onClick={() => setFiltersOpen(false)}>
              Ver {list.length} {list.length === 1 ? 'gasto' : 'gastos'}
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
            <div className="grid grid-cols-2 gap-2">
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2 dark:bg-ink-900">
      <span className="block text-slate-500">{label}</span>
      <span className="block font-semibold tabular-nums text-slate-800 dark:text-slate-100">{brl(value)}</span>
    </div>
  );
}
