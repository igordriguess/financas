import { useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, Pencil, Plus, PowerOff, Trash2, Wallet } from 'lucide-react';
import { useStore } from '../store/useStore';
import { incomeLines, type IncomeLine } from '../domain/finance';
import { PEOPLE, PERSON_LABEL, type IncomeSource, type Person } from '../domain/types';
import { brl } from '../lib/money';
import { addMonths, cmpMonth, dateInMonth, fmtDate, monthLabel, monthOf, monthShort, todayISO } from '../lib/months';
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, ListRow, Money, MoneyInput, MonthSwitcher, PageHeader, Segmented, SectionTitle, Sheet, cx, useResetOnOpen } from '../components/ui';
import { PersonGlyph, PersonTag } from '../components/people';

export function IncomesPage() {
  const data = useStore((s) => s.data);
  const month = useStore((s) => s.month);
  const [editing, setEditing] = useState<IncomeLine | null>(null);
  const [sourceForm, setSourceForm] = useState<{ open: boolean; source?: IncomeSource }>({ open: false });
  const lines = useMemo(() => incomeLines(data, month), [data, month]);
  const total = lines.reduce((a, l) => a + l.amountCents, 0);
  const inactive = data.incomeSources.filter((s) => !s.active && !s.oneOffMonth);

  return (
    <div className="animate-fade-in">
      <PageHeader back title="Receitas" subtitle="Valores registrados por mês" actions={<Button size="sm" icon={Plus} onClick={() => setSourceForm({ open: true })}>Nova</Button>} />
      <MonthSwitcher />
      <Card className="mt-5 p-5 md:p-6">
        <p className="text-[13px] text-slate-500">Total de receitas · {monthLabel(month)}</p>
        <Money cents={total} tone="income" className="text-[28px] font-bold" />
        {lines.some((l) => l.projected) && <p className="mt-1 text-[12px] text-slate-500">Valores “previstos” seguem o último valor lançado. Toque para confirmar ou alterar.</p>}
      </Card>

      <SectionTitle>Fontes de receita</SectionTitle>
      <Card>
        {lines.length === 0 ? (
          <EmptyState icon={Wallet} title="Nenhuma receita" text="Cadastre os pagamentos de Igor e Carol." action={<Button onClick={() => setSourceForm({ open: true })}>Nova receita</Button>} />
        ) : (
          lines.map((l, i) => (
            <div key={l.source.id} className={cx(i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
              <ListRow
                onClick={() => setEditing(l)}
                left={
                  <span className={cx('flex h-10 w-10 items-center justify-center rounded-2xl', l.record?.receivedDate ? 'bg-income-soft text-income dark:bg-green-500/15' : 'bg-slate-100 text-slate-400 dark:bg-ink-700')}>
                    {l.record?.receivedDate ? <CheckCircle2 size={20} /> : <CircleDashed size={20} />}
                  </span>
                }
                title={l.source.name}
                subtitle={
                  <>
                    <PersonTag who={l.source.responsible} /> ·{' '}
                    {l.missing ? 'sem valor registrado' : l.record?.receivedDate ? `recebido em ${fmtDate(l.record.receivedDate)}` : l.projected ? 'previsto' : 'a receber'}
                  </>
                }
                right={
                  <div className="flex flex-col items-end gap-0.5">
                    <Money cents={l.amountCents} className="text-[15px] font-semibold text-slate-900 dark:text-white" />
                    {l.projected && <Badge tone="amber">previsto</Badge>}
                    {l.source.oneOffMonth && <Badge>só neste mês</Badge>}
                    {!l.source.active && <Badge>inativa</Badge>}
                  </div>
                }
              />
            </div>
          ))
        )}
      </Card>

      <SectionTitle>Histórico por fonte</SectionTitle>
      <Card className="p-5">
        <HistoryTable />
      </Card>

      {inactive.length > 0 && (
        <>
          <SectionTitle>Receitas desativadas</SectionTitle>
          <Card>
            {inactive.map((s, i) => (
              <div key={s.id} className={cx(i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
                <ListRow
                  onClick={() => setSourceForm({ open: true, source: s })}
                  title={s.name}
                  subtitle={PERSON_LABEL[s.responsible]}
                  right={<span className="text-[14px] font-semibold text-brand-500">Editar ou excluir</span>}
                />
              </div>
            ))}
          </Card>
        </>
      )}

      <IncomeSheet line={editing} onClose={() => setEditing(null)} onEditSource={(s) => (setEditing(null), setSourceForm({ open: true, source: s }))} />
      <SourceSheet open={sourceForm.open} source={sourceForm.source} onClose={() => setSourceForm({ open: false })} />
    </div>
  );
}

function HistoryTable() {
  const data = useStore((s) => s.data);
  const month = useStore((s) => s.month);
  const months = [-5, -4, -3, -2, -1, 0].map((n) => addMonths(month, n));
  const sources = data.incomeSources.filter((s) => !s.oneOffMonth && (s.active || data.incomes.some((i) => i.sourceId === s.id))).sort((a, b) => a.sortOrder - b.sortOrder);
  if (!sources.length) return <p className="text-sm text-slate-500">Sem histórico.</p>;
  return (
    <div className="space-y-4">
      {sources.map((s) => {
        const vals = months.map((m) => ({ m, rec: data.incomes.find((i) => i.sourceId === s.id && i.month === m) }));
        return (
          <div key={s.id}>
            <p className="mb-1.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200">{s.name}</p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {vals.map(({ m, rec }, i) => {
                const prev = i > 0 ? vals[i - 1].rec : undefined;
                const changed = rec && prev && rec.amountCents !== prev.amountCents;
                return (
                  <div key={m} className={cx('rounded-xl p-2 text-center', m === month ? 'bg-brand-50 dark:bg-brand-500/10' : 'bg-slate-50 dark:bg-ink-900')}>
                    <p className="text-[11px] text-slate-500">{monthShort(m)}</p>
                    <p className={cx('text-[12px] font-semibold tabular-nums', rec ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400')}>{rec ? brl(rec.amountCents).replace('R$', '').trim() : '—'}</p>
                    {changed && <p className={cx('text-[10px] font-semibold', rec!.amountCents > prev!.amountCents ? 'text-income' : 'text-expense')}>{rec!.amountCents > prev!.amountCents ? '▲' : '▼'} alterado</p>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IncomeSheet({ line, onClose, onEditSource }: { line: IncomeLine | null; onClose: () => void; onEditSource: (s: IncomeSource) => void }) {
  const month = useStore((s) => s.month);
  const setIncome = useStore((s) => s.setIncome);
  const data = useStore((s) => s.data);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useResetOnOpen(!!line, () => ({
    amount: line?.amountCents ?? 0,
    received: !!line?.record?.receivedDate,
    date: line?.record?.receivedDate ?? dateInMonth(month, 5),
  }));
  if (!line) return null;
  const laterRecords = data.incomes.filter((i) => i.sourceId === line.source.id && cmpMonth(i.month, month) > 0).length;

  async function save() {
    setBusy(true);
    try {
      await setIncome(line!.source.id, month, f.amount, f.received ? f.date : null);
      onClose();
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={line.source.name} footer={<Button size="lg" className="w-full" loading={busy} onClick={save}>Salvar {monthLabel(month)}</Button>}>
      <div className="space-y-4">
        <div className="rounded-3xl bg-slate-50 py-5 dark:bg-ink-900">
          <p className="mb-1 text-center text-[13px] text-slate-500">Valor recebido em {monthLabel(month)}</p>
          <MoneyInput big autoFocus value={f.amount} onChange={(amount) => setF({ ...f, amount })} />
        </div>
        <Segmented
          value={f.received ? 'yes' : 'no'}
          onChange={(v) => setF({ ...f, received: v === 'yes' })}
          options={[
            { value: 'no', label: 'A receber' },
            { value: 'yes', label: 'Recebido' },
          ]}
        />
        {f.received && (
          <Field label="Data do recebimento">
            <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
        )}
        <p className="rounded-2xl bg-brand-50 p-3 text-[13px] text-brand-700 dark:bg-brand-500/10 dark:text-brand-100">
          {line.source.oneOffMonth ? `Receita pontual: entra só em ${monthLabel(month)} e não se repete nos meses seguintes.` : <>O valor vale para {monthLabel(month)} e passa a ser a referência dos meses seguintes{laterRecords ? ` (exceto ${laterRecords} mês(es) futuros já registrados)` : ''}. Meses anteriores não mudam.</>}
        </p>
        <Button variant="ghost" icon={Pencil} className="w-full" onClick={() => onEditSource(line.source)}>
          {line.source.oneOffMonth ? 'Editar descrição, responsável ou excluir' : 'Editar nome e responsável'}
        </Button>
      </div>
    </Sheet>
  );
}

function SourceSheet({ open, source, onClose }: { open: boolean; source?: IncomeSource; onClose: () => void }) {
  const save = useStore((s) => s.saveIncomeSource);
  const remove = useStore((s) => s.removeIncomeSource);
  const del = useStore((s) => s.deleteIncomeSource);
  const data = useStore((s) => s.data);
  const confirm = useStore((s) => s.confirm);
  const addOneOff = useStore((s) => s.addOneOffIncome);
  const month = useStore((s) => s.month);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useResetOnOpen(open, () => ({
    name: source?.name ?? '',
    responsible: (source?.responsible ?? 'igor') as Person,
    active: source?.active ?? true,
    kind: (source?.oneOffMonth ? 'once' : 'monthly') as 'monthly' | 'once',
    amount: 0,
    received: true,
    date: monthOf(todayISO()) === month ? todayISO() : dateInMonth(month, 1),
  }));
  const isNew = !source;
  const once = f.kind === 'once';

  async function submit() {
    setBusy(true);
    try {
      if (isNew && once) await addOneOff({ name: f.name, responsible: f.responsible, month, amountCents: f.amount, receivedDate: f.received ? f.date : null });
      else await save({ ...source, name: f.name, responsible: f.responsible, active: f.active, id: source?.id });
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
      title={source ? (source.oneOffMonth ? 'Editar receita pontual' : 'Editar receita') : 'Nova receita'}
      footer={
        <div className="flex gap-2">
          {source?.active && !source.oneOffMonth && (
            <IconButton
              icon={PowerOff}
              label="Desativar receita"
              className="h-14 w-14 rounded-2xl bg-expense-soft text-expense dark:bg-red-500/15"
              onClick={async () => {
                if (await confirm({ title: `Desativar ${source.name}?`, message: 'Ela deixa de ser prevista nos próximos meses. O histórico é mantido.', confirmText: 'Desativar', danger: true })) {
                  await remove(source.id);
                  onClose();
                }
              }}
            />
          )}
          <Button size="lg" className="flex-1" loading={busy} disabled={!f.name.trim() || (isNew && once && f.amount <= 0)} onClick={submit}>
            {isNew && once ? `Adicionar em ${monthLabel(month)}` : 'Salvar'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {isNew && (
          <Field label="Frequência">
            <Segmented
              value={f.kind}
              onChange={(kind) => setF({ ...f, kind })}
              options={[
                { value: 'monthly', label: 'Todo mês' },
                { value: 'once', label: 'Só neste mês' },
              ]}
            />
          </Field>
        )}
        {isNew && once && (
          <div className="rounded-3xl bg-slate-50 py-5 dark:bg-ink-900">
            <p className="mb-1 text-center text-[13px] text-slate-500">Valor recebido em {monthLabel(month)}</p>
            <MoneyInput big value={f.amount} onChange={(amount) => setF({ ...f, amount })} />
          </div>
        )}
        <Field label={once ? 'Descrição' : 'Nome da receita'}>
          <Input
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder={once ? 'Ex.: Freela, venda de usado, reembolso…' : 'Ex.: Pagamento Igor, Aluguel recebido…'}
            maxLength={50}
            autoFocus={!isNew || !once}
          />
        </Field>
        <Field label="Responsável">
          <Segmented value={f.responsible} onChange={(responsible) => setF({ ...f, responsible })} options={PEOPLE.map((p) => ({ value: p, label: <span className="inline-flex items-center gap-1.5"><PersonGlyph who={p} size={17} />{PERSON_LABEL[p]}</span>, ariaLabel: PERSON_LABEL[p] }))} />
        </Field>
        {source && !source.active && (
          <Field label="Status">
            <Segmented
              value={f.active ? 'on' : 'off'}
              onChange={(v) => setF({ ...f, active: v === 'on' })}
              options={[
                { value: 'on', label: 'Ativa' },
                { value: 'off', label: 'Inativa' },
              ]}
            />
          </Field>
        )}
        {isNew && once && (
          <>
            <Segmented
              value={f.received ? 'yes' : 'no'}
              onChange={(v) => setF({ ...f, received: v === 'yes' })}
              options={[
                { value: 'no', label: 'A receber' },
                { value: 'yes', label: 'Recebido' },
              ]}
            />
            {f.received && (
              <Field label="Data do recebimento">
                <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
              </Field>
            )}
            <p className="text-[13px] text-slate-500">Entra só em {monthLabel(month)} e não se repete nos meses seguintes.</p>
          </>
        )}
        {isNew && !once && <p className="text-[13px] text-slate-500">Depois de criar, toque na receita para informar o valor do mês.</p>}
        {source && (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[15px] font-semibold text-expense press:bg-expense-soft dark:press:bg-red-500/15"
            onClick={async () => {
              const count = data.incomes.filter((i) => i.sourceId === source.id && i.amountCents > 0).length;
              const ok = await confirm({
                title: `Excluir ${source.name}?`,
                message: count
                  ? `Ela some do app junto com ${count === 1 ? 'o valor registrado' : `os ${count} valores registrados`}, inclusive de meses passados. Os saldos desses meses vão mudar. Não dá para desfazer.`
                  : 'Ela some do app. Não dá para desfazer.',
                confirmText: 'Excluir',
                danger: true,
              });
              if (ok) {
                await del(source.id);
                onClose();
              }
            }}
          >
            <Trash2 size={18} /> Excluir receita
          </button>
        )}
      </div>
    </Sheet>
  );
}
