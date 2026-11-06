import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, PiggyBank } from 'lucide-react';
import { useStore } from '../store/useStore';
import { monthSummary, reserveBalance } from '../domain/finance';
import type { ReserveEntry, ReserveSource } from '../domain/types';
import { brl } from '../lib/money';
import { currentMonth, fmtDate, monthLabel, monthOf, todayISO } from '../lib/months';
import { Button, Card, EmptyState, Field, Input, ListRow, Money, MoneyInput, PageHeader, SectionTitle, Segmented, Sheet, cx, useResetOnOpen } from '../components/ui';

type Kind = 'in' | 'out';

const SOURCE_TEXT: Record<Kind, Record<ReserveSource, string>> = {
  in: { balance: 'Do saldo do mês', other: 'De outra fonte' },
  out: { balance: 'Para o saldo do mês', other: 'Para outro destino' },
};

export function ReservePage() {
  const data = useStore((s) => s.data);
  const deleteReserveEntry = useStore((s) => s.deleteReserveEntry);
  const confirm = useStore((s) => s.confirm);
  const [sheet, setSheet] = useState<Kind | null>(null);
  const balance = reserveBalance(data);
  const cm = currentMonth();

  const entries = useMemo(
    () => [...data.reserveEntries].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date))),
    [data.reserveEntries],
  );
  const thisMonth = entries.filter((e) => monthOf(e.date) === cm);
  const inMonth = thisMonth.filter((e) => e.amountCents > 0).reduce((a, e) => a + e.amountCents, 0);
  const outMonth = -thisMonth.filter((e) => e.amountCents < 0).reduce((a, e) => a + e.amountCents, 0);

  async function remove(e: ReserveEntry) {
    const kind: Kind = e.amountCents > 0 ? 'in' : 'out';
    const ok = await confirm({
      title: 'Excluir movimento?',
      message: `${kind === 'in' ? 'Guardado' : 'Retirado'} ${brl(Math.abs(e.amountCents))} em ${fmtDate(e.date)}. ${
        e.source === 'balance' ? `O saldo de ${monthLabel(monthOf(e.date))} volta a ficar como antes.` : 'O saldo da reserva é recalculado.'
      }`,
      confirmText: 'Excluir',
      danger: true,
    });
    if (ok) await deleteReserveEntry(e.id);
  }

  return (
    <div className="animate-fade-in">
      <PageHeader back title="Reserva" subtitle="Dinheiro guardado do casal" />

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-5 text-white">
          <span className="flex items-center gap-2 text-[13px] font-medium text-white/85">
            <PiggyBank size={16} /> Saldo da reserva
          </span>
          <p className={cx('mt-1 text-[34px] font-bold tracking-tight tabular-nums', balance < 0 && 'text-red-200')}>{brl(balance)}</p>
          <p className="text-[13px] text-white/75">Não entra no dinheiro disponível do mês</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-ink-700">
          <div className="p-4">
            <span className="block text-[12px] font-medium text-slate-500">Guardado em {monthLabel(cm)}</span>
            <Money cents={inMonth} tone="income" className="mt-0.5 block text-lg font-bold" />
          </div>
          <div className="p-4">
            <span className="block text-[12px] font-medium text-slate-500">Retirado em {monthLabel(cm)}</span>
            <Money cents={outMonth} className="mt-0.5 block text-lg font-bold text-slate-900 dark:text-white" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-4 dark:border-ink-700">
          <Button size="lg" icon={ArrowDownToLine} onClick={() => setSheet('in')}>
            Guardar
          </Button>
          <Button size="lg" variant="secondary" icon={ArrowUpFromLine} disabled={balance <= 0} onClick={() => setSheet('out')}>
            Retirar
          </Button>
        </div>
      </Card>

      <SectionTitle>Histórico</SectionTitle>
      <Card>
        {entries.length === 0 ? (
          <EmptyState icon={PiggyBank} title="Nenhum movimento ainda" text="Guarde um valor para começar a reserva." action={<Button onClick={() => setSheet('in')}>Guardar valor</Button>} />
        ) : (
          entries.map((e, i) => {
            const kind: Kind = e.amountCents > 0 ? 'in' : 'out';
            return (
              <div key={e.id} className={cx(i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
                <ListRow
                  onClick={() => void remove(e)}
                  left={
                    <span className={cx('flex h-10 w-10 items-center justify-center rounded-2xl', kind === 'in' ? 'bg-income-soft text-income dark:bg-green-500/15' : 'bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-slate-300')}>
                      {kind === 'in' ? <ArrowDownToLine size={19} /> : <ArrowUpFromLine size={19} />}
                    </span>
                  }
                  title={e.note || (kind === 'in' ? 'Guardado' : 'Retirado')}
                  subtitle={`${fmtDate(e.date)} · ${SOURCE_TEXT[kind][e.source]}`}
                  right={<Money cents={e.amountCents} className={cx('whitespace-nowrap text-[15px] font-semibold', kind === 'in' ? 'text-income' : 'text-slate-900 dark:text-white')} />}
                />
              </div>
            );
          })
        )}
      </Card>
      {entries.length > 0 && <p className="mt-2 px-1 text-[12px] text-slate-500">Toque em um movimento para excluí-lo.</p>}

      <ReserveSheet kind={sheet} balance={balance} onClose={() => setSheet(null)} />
    </div>
  );
}

function ReserveSheet({ kind, balance, onClose }: { kind: Kind | null; balance: number; onClose: () => void }) {
  const addReserveEntry = useStore((s) => s.addReserveEntry);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useResetOnOpen(!!kind, () => ({ amount: 0, source: 'balance' as ReserveSource, date: todayISO(), note: '' }));
  const k: Kind = kind ?? 'in';
  const tooHigh = k === 'out' && f.amount > balance;
  const valid = f.amount > 0 && !!f.date && !tooHigh;
  const data = useStore((s) => s.data);
  // Saldo do mês da data escolhida, antes deste movimento.
  const monthBalance = useMemo(() => (f.date ? monthSummary(data, monthOf(f.date)).balance : null), [data, f.date]);
  /** Quanto a reserva muda: positivo ao guardar, negativo ao retirar. */
  const delta = k === 'in' ? f.amount : -f.amount;
  const showMonth = f.source === 'balance' && monthBalance !== null;

  async function save() {
    if (!valid) return;
    setBusy(true);
    try {
      await addReserveEntry({ kind: k, amountCents: f.amount, date: f.date, source: f.source, note: f.note });
      onClose();
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!kind}
      onClose={onClose}
      title={k === 'in' ? 'Guardar na reserva' : 'Retirar da reserva'}
      subtitle={`Reserva hoje: ${brl(balance)}`}
      size="sm"
      footer={
        <Button size="lg" className="w-full" disabled={!valid} loading={busy} onClick={save}>
          {k === 'in' ? 'Guardar' : 'Retirar'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 px-1 text-[13px] font-medium text-slate-600 dark:text-slate-300">Valor</p>
          <div className="overflow-hidden rounded-3xl bg-slate-50 dark:bg-ink-900">
            <div className="py-5">
              <MoneyInput big autoFocus value={f.amount} onChange={(amount) => setF({ ...f, amount })} />
            </div>
            <div className={cx('grid divide-x divide-slate-200/70 border-t border-slate-200/70 dark:divide-ink-700 dark:border-ink-700', showMonth ? 'grid-cols-2' : 'grid-cols-1')}>
              {showMonth && <PreviewTile label="Saldo do mês" before={monthBalance!} after={monthBalance! - delta} />}
              <PreviewTile label="Reserva" before={balance} after={balance + delta} />
            </div>
          </div>
          {tooHigh && <p className="mt-2 px-1 text-[13px] text-expense">O valor é maior que o saldo da reserva ({brl(balance)}).</p>}
        </div>

        <div>
          <p className="mb-1.5 px-1 text-[13px] font-medium text-slate-600 dark:text-slate-300">{k === 'in' ? 'De onde vem o dinheiro?' : 'Para onde vai o dinheiro?'}</p>
          <Segmented
            value={f.source}
            onChange={(source) => setF({ ...f, source })}
            options={[
              { value: 'balance', label: 'Saldo do mês' },
              { value: 'other', label: k === 'in' ? 'Outra fonte' : 'Outro destino' },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Data">
            <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Descrição (opcional)">
            <Input
              value={f.note}
              maxLength={60}
              placeholder={k === 'in' ? (f.source === 'other' ? 'Ex.: 13º salário' : 'Ex.: Reserva') : 'Ex.: Conserto do carro'}
              onChange={(e) => setF({ ...f, note: e.target.value })}
            />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}

/** Como o valor fica depois do movimento, com o valor de antes logo abaixo. */
function PreviewTile({ label, before, after }: { label: string; before: number; after: number }) {
  const tone = after < 0 ? 'text-expense' : after > before ? 'text-income' : 'text-slate-900 dark:text-white';
  return (
    <div className="min-w-0 px-4 py-3 text-center">
      <p className="text-[12px] font-medium text-slate-500">{label}</p>
      <p className={cx('mt-0.5 whitespace-nowrap text-[17px] font-bold leading-tight tabular-nums', tone)}>{brl(after)}</p>
      <p className="mt-0.5 whitespace-nowrap text-[12px] text-slate-500">
        {before === after ? 'sem alteração' : <>antes <span className="tabular-nums">{brl(before)}</span></>}
      </p>
    </div>
  );
}
