import { useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, Info, Pencil, Plus, PowerOff, Repeat, Sparkles, Trash2, Wallet } from 'lucide-react';
import { useStore } from '../store/useStore';
import { incomeLines, type IncomeLine } from '../domain/finance';
import { PEOPLE, PERSON_LABEL, type IncomeSource, type Person } from '../domain/types';
import { brl } from '../lib/money';
import { addMonths, cmpMonth, dateInMonth, daysInMonth, fmtDate, monthLabel, monthOf, monthShort, todayISO } from '../lib/months';
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
                    {l.source.oneOffMonth && <Badge tone="green">dinheiro extra</Badge>}
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
    received: !!line?.record?.receivedDate || !!line?.source.oneOffMonth,
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
        {!line.source.oneOffMonth && (
          <Segmented
            value={f.received ? 'yes' : 'no'}
            onChange={(v) => setF({ ...f, received: v === 'yes' })}
            options={[
              { value: 'no', label: 'A receber' },
              { value: 'yes', label: 'Recebido' },
            ]}
          />
        )}
        {f.received && (
          <Field label="Data do recebimento">
            <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
        )}
        <p className="rounded-2xl bg-brand-50 p-3 text-[13px] text-brand-700 dark:bg-brand-500/10 dark:text-brand-100">
          {line.source.oneOffMonth ? `Dinheiro extra: entra só em ${monthLabel(month)} e não se repete nos meses seguintes.` : <>O valor vale para {monthLabel(month)} e passa a ser a referência dos meses seguintes{laterRecords ? ` (exceto ${laterRecords} mês(es) futuros já registrados)` : ''}. Meses anteriores não mudam.</>}
        </p>
        <Button variant="ghost" icon={Pencil} className="w-full" onClick={() => onEditSource(line.source)}>
          {line.source.oneOffMonth ? 'Editar descrição, quem recebeu ou excluir' : 'Editar nome e responsável'}
        </Button>
      </div>
    </Sheet>
  );
}

const KINDS = [
  { value: 'monthly' as const, title: 'Todo mês', text: 'Salário, aluguel recebido', icon: Repeat },
  { value: 'once' as const, title: 'Dinheiro extra', text: 'Entra só neste mês', icon: Sparkles },
];

function SourceSheet({ open, source, onClose }: { open: boolean; source?: IncomeSource; onClose: () => void }) {
  const save = useStore((s) => s.saveIncomeSource);
  const remove = useStore((s) => s.removeIncomeSource);
  const del = useStore((s) => s.deleteIncomeSource);
  const data = useStore((s) => s.data);
  const confirm = useStore((s) => s.confirm);
  const addIncome = useStore((s) => s.addIncome);
  const month = useStore((s) => s.month);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useResetOnOpen(open, () => ({
    name: source?.name ?? '',
    responsible: (source?.responsible ?? 'igor') as Person,
    active: source?.active ?? true,
    kind: (source?.oneOffMonth ? 'once' : 'monthly') as 'monthly' | 'once',
    amount: 0,
    date: monthOf(todayISO()) === month ? todayISO() : dateInMonth(month, 1),
  }));
  const isNew = !source;
  const once = f.kind === 'once';

  async function submit() {
    setBusy(true);
    try {
      if (isNew) {
        const receivedDate = f.date || dateInMonth(month, 1);
        await addIncome({ name: f.name, responsible: f.responsible, month, amountCents: f.amount, receivedDate, oneOff: once });
      }
      else await save({ ...source, name: f.name, responsible: f.responsible, active: f.active, id: source?.id });
      onClose();
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }
  const personOptions = PEOPLE.map((p) => ({ value: p, label: <span className="inline-flex items-center gap-1.5"><PersonGlyph who={p} size={17} />{PERSON_LABEL[p]}</span>, ariaLabel: PERSON_LABEL[p] }));
  const submitLabel = isNew ? 'Adicionar' : 'Salvar alterações';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={source ? (source.oneOffMonth ? 'Editar dinheiro extra' : 'Editar receita') : 'Nova receita'}
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
          <Button size="lg" className="flex-1" loading={busy} disabled={!f.name.trim() || (isNew && f.amount <= 0)} onClick={submit}>
            {submitLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Tipo */}
        {isNew && (
          <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Tipo de receita">
            {KINDS.map((k) => {
              const active = f.kind === k.value;
              return (
                <button
                  key={k.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setF({ ...f, kind: k.value })}
                  className={cx(
                    'flex flex-col items-start gap-2 rounded-2xl p-3.5 text-left transition press:scale-[.98]',
                    active ? 'bg-income-soft ring-2 ring-income dark:bg-green-500/15' : 'bg-slate-100 dark:bg-ink-900',
                  )}
                >
                  <span className={cx('flex h-9 w-9 items-center justify-center rounded-xl', active ? 'bg-income text-white' : 'bg-white text-slate-500 dark:bg-ink-700 dark:text-slate-300')}>
                    <k.icon size={19} />
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold leading-tight text-slate-900 dark:text-white">{k.title}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-slate-500 dark:text-slate-400">{k.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Valor */}
        {isNew && (
          <div className="rounded-3xl bg-income-soft/70 py-5 dark:bg-green-500/10">
            <p className="mb-1 text-center text-[13px] font-medium text-green-800 dark:text-green-200">{once ? `Valor que entrou em ${monthLabel(month)}` : `Valor por mês, a partir de ${monthLabel(month)}`}</p>
            <MoneyInput big value={f.amount} onChange={(amount) => setF({ ...f, amount })} />
          </div>
        )}

        {/* Descrição */}
        <Field label={once ? 'De onde veio?' : 'Nome da receita'}>
          <Input
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder={once ? 'Ex.: Freela, venda, reembolso' : 'Ex.: Salário, aluguel'}
            maxLength={50}
            enterKeyHint="done"
          />
        </Field>

        <Field label={once ? 'Quem recebeu' : 'Responsável'}>
          <Segmented value={f.responsible} onChange={(responsible) => setF({ ...f, responsible })} options={personOptions} />
        </Field>

        {isNew && (
          <Field label="Recebido em">
            <Input type="date" value={f.date} min={dateInMonth(month, 1)} max={dateInMonth(month, daysInMonth(month))} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
        )}

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

        {isNew && (
          <p className="flex items-start gap-2.5 rounded-2xl bg-slate-50 p-3.5 text-[13px] leading-snug text-slate-600 dark:bg-ink-900 dark:text-slate-300">
            <Info size={17} className="mt-px shrink-0 text-slate-400" />
            {once ? `Entra como recebido em ${monthLabel(month)} e não se repete nos meses seguintes.` : `O valor se repete todo mês a partir de ${monthLabel(month)}. Se mudar em algum mês, é só tocar na receita e alterar.`}
          </p>
        )}

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
