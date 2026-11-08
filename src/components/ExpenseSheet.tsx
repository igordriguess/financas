import { useEffect, useMemo, useState } from 'react';
import { Banknote, Check, ChevronLeft, ChevronRight, CreditCard, Gift, Landmark, Lock, QrCode, Trash2, TriangleAlert } from 'lucide-react';
import { readExpenseDraft, useStore, writeExpenseDraft } from '../store/useStore';
import { benefitBalance, creditUsage, expenseLocked, invoiceDueDate, invoiceMonthFor } from '../domain/finance';
import { PAYMENT_LABEL, PERSON_LABEL, RESPONSIBLES, type PaymentMethod, type Responsible } from '../domain/types';
import { brl, splitCents } from '../lib/money';
import { addMonths, fmtDate, monthLabel, monthOf, todayISO } from '../lib/months';
import { Badge, Button, Field, IconButton, Input, MoneyInput, Segmented, Sheet, cx, useResetOnOpen } from './ui';
import { CategoryIcon } from './icons';
import { cardGradient } from '../lib/color';
import { PersonGlyph } from './people';

const METHOD_ICON: Record<PaymentMethod, typeof QrCode> = { pix: QrCode, credit: CreditCard, debit: Landmark, cash: Banknote, benefit: Gift };
const METHOD_ORDER: PaymentMethod[] = ['pix', 'credit', 'debit', 'cash', 'benefit'];
const LAST_METHOD_KEY = 'fic-last-method';

interface Form {
  amountCents: number;
  description: string;
  categoryId: string;
  responsible: Responsible;
  date: string;
  method: PaymentMethod;
  cardId: string | null;
  installments: number;
  /** null = automático (data da compra + fechamento do cartão). */
  firstInvoiceMonth: string | null;
}

export function ExpenseSheet() {
  const { open, editId, presetCardId } = useStore((s) => s.expenseSheet);
  const close = useStore((s) => s.closeExpense);
  const data = useStore((s) => s.data);
  const me = useStore((s) => s.me);
  const saveExpense = useStore((s) => s.saveExpense);
  const deleteExpense = useStore((s) => s.deleteExpense);
  const confirm = useStore((s) => s.confirm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editing = editId ? data.expenses.find((e) => e.id === editId) ?? null : null;
  const locked = editing ? expenseLocked(data, editing.id) : false;
  const categories = useMemo(() => data.categories.filter((c) => !c.archivedAt).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })), [data.categories]);
  const creditCards = data.cards.filter((c) => c.kind === 'credit' && c.active && !c.deletedAt);
  const benefitCards = data.cards.filter((c) => c.kind === 'benefit' && c.active && !c.deletedAt);

  const [f, setF] = useResetOnOpen<Form>(open, () => {
    setError(null);
    const draft = readExpenseDraft<Form>(editId);
    if (draft) return draft;
    if (editing)
      return {
        amountCents: editing.amountCents,
        description: editing.description,
        categoryId: editing.categoryId,
        responsible: editing.responsible,
        date: editing.date,
        method: editing.method,
        cardId: editing.cardId,
        installments: editing.installments,
        firstInvoiceMonth: editing.firstInvoiceMonth ?? null,
      };
    let method: PaymentMethod = 'pix';
    try {
      const m = localStorage.getItem(LAST_METHOD_KEY) as PaymentMethod | null;
      if (m && METHOD_ORDER.includes(m)) method = m;
    } catch {
      /* ignore */
    }
    // Aberto pela tela do cartão: já vem em crédito nesse cartão.
    const preset = presetCardId ? data.cards.find((c) => c.id === presetCardId && c.kind === 'credit') : null;
    if (preset) return { amountCents: 0, description: '', categoryId: '', responsible: me.person, date: todayISO(), method: 'credit', cardId: preset.id, installments: 1, firstInvoiceMonth: null };
    return { amountCents: 0, description: '', categoryId: '', responsible: me.person, date: todayISO(), method, cardId: null, installments: 1, firstInvoiceMonth: null };
  });

  // Guarda o rascunho enquanto o formulário está aberto.
  useEffect(() => {
    if (open) writeExpenseDraft(editId, f);
  }, [open, editId, f]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setError(null);
    setF((p) => ({ ...p, [k]: v }));
  };

  const pickMethod = (m: PaymentMethod) => {
    setError(null);
    setF((p) => {
      let cardId: string | null = null;
      if (m === 'credit') cardId = creditCards.find((c) => c.id === p.cardId)?.id ?? (creditCards.length === 1 ? creditCards[0].id : null);
      if (m === 'benefit') cardId = benefitCards.find((c) => c.id === p.cardId)?.id ?? benefitCards.find((c) => c.owner === p.responsible)?.id ?? null;
      return { ...p, method: m, cardId, installments: m === 'credit' ? p.installments : 1, firstInvoiceMonth: null };
    });
  };

  const card = f.cardId ? data.cards.find((c) => c.id === f.cardId) ?? null : null;
  const creditInfo = f.method === 'credit' && card?.kind === 'credit' && f.date ? (() => {
    const auto = invoiceMonthFor(card, f.date);
    const first = f.firstInvoiceMonth ?? auto;
    const parts = splitCents(f.amountCents, f.installments);
    const usage = creditUsage(data, card);
    const already = editing && editing.cardId === card.id ? editing.amountCents : 0;
    return { first, auto, due: invoiceDueDate(card, first), parts, available: usage.available + already };
  })() : null;
  const benefitInfo = f.method === 'benefit' && card?.kind === 'benefit' ? benefitBalance(data, card.id) + (editing?.cardId === card.id ? editing.amountCents : 0) : null;

  async function submit(allowDuplicate = false, retry = false) {
    if (saving && !retry) return;
    setSaving(true);
    try {
      const res = await saveExpense({ ...f, id: editing?.id }, { allowDuplicate });
      if (res.duplicate) {
        const ok = await confirm({
          title: 'Possível lançamento duplicado',
          message: `Já existe um gasto de ${brl(res.duplicate.amountCents)} em ${fmtDate(res.duplicate.date)} com o mesmo meio de pagamento${res.duplicate.description ? ` (“${res.duplicate.description}”)` : ''}. Deseja salvar mesmo assim?`,
          confirmText: 'Salvar mesmo assim',
          cancelText: 'Não salvar',
        });
        // Mantém o loading contínuo ao confirmar, sem piscar entre as duas tentativas.
        if (ok) await submit(true, true);
        return;
      }
      if (!res.ok) {
        setError(res.error ?? 'Não foi possível salvar.');
        return;
      }
      try {
        localStorage.setItem(LAST_METHOD_KEY, f.method);
      } catch {
        /* ignore */
      }
      close();
    } catch {
      /* erro já exibido em toast */
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    const ok = await confirm({ title: 'Excluir gasto?', message: `${brl(editing.amountCents)} · ${editing.description || 'Sem descrição'}`, confirmText: 'Excluir', danger: true });
    if (!ok) return;
    await deleteExpense(editing.id);
    close();
  }

  const lockedFinancial = locked;

  return (
    <Sheet
      open={open}
      onClose={close}
      title={editing ? 'Editar gasto' : 'Adicionar gasto'}
      footer={
        <div className="flex gap-2">
          {editing && <Button variant="danger" size="lg" icon={Trash2} onClick={remove} aria-label="Excluir gasto" />}
          <Button size="lg" className="flex-1" loading={saving} onClick={() => submit()} disabled={f.amountCents <= 0}>
            {editing ? 'Salvar alterações' : f.amountCents > 0 ? `Salvar ${brl(f.amountCents)}` : 'Salvar gasto'}
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-5"
      >
        {lockedFinancial && (
          <div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-[13px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            <Lock size={16} className="mt-0.5 shrink-0" />
            Esta compra tem parcela em fatura já paga. Valor, data, cartão e parcelas estão bloqueados para manter as faturas consistentes.
          </div>
        )}

        {/* 1. Valor */}
        <div className={cx('rounded-3xl bg-slate-50 py-5 dark:bg-ink-900', lockedFinancial && 'pointer-events-none opacity-60')}>
          <MoneyInput big value={f.amountCents} onChange={(v) => set('amountCents', v)} autoFocus={!editing} />
          {creditInfo && f.installments > 1 && f.amountCents > 0 && (
            <p className="mt-1 text-center text-sm font-medium text-slate-500">
              {f.installments}x de {brl(creditInfo.parts[creditInfo.parts.length - 1])}
              {creditInfo.parts[0] !== creditInfo.parts[creditInfo.parts.length - 1] && ` (1ª de ${brl(creditInfo.parts[0])})`}
            </p>
          )}
        </div>

        {/* 2. Descrição */}
        <Field label="Descrição (opcional)">
          <Input value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Ifood, farmácia, presente…" maxLength={80} enterKeyHint="done" />
        </Field>

        {/* 3. Categoria */}
        <div>
          <span className="mb-2 block text-[13px] font-medium text-slate-600 dark:text-slate-300">Categoria</span>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-2">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => set('categoryId', c.id)}
                data-tip={c.name}
                aria-pressed={f.categoryId === c.id}
                className={cx(
                  'flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 transition press:scale-95',
                  f.categoryId === c.id ? 'bg-brand-50 ring-2 ring-brand-500 dark:bg-brand-500/15' : 'hover:bg-slate-50 dark:hover:bg-ink-700',
                )}
              >
                <CategoryIcon icon={c.icon} color={c.color} size={40} />
                <span className="w-full break-words text-center text-[12px] font-medium leading-tight text-slate-700 dark:text-slate-200">{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 4. Responsável */}
        <Field label="Responsável">
          <Segmented value={f.responsible} onChange={(v) => set('responsible', v)} options={RESPONSIBLES.map((p) => ({ value: p, label: <span className="inline-flex items-center gap-1.5"><PersonGlyph who={p} size={17} />{PERSON_LABEL[p]}</span>, ariaLabel: PERSON_LABEL[p] }))} />
        </Field>

        {/* 5. Data */}
        <Field label="Data da compra">
          <Input type="date" value={f.date} max="2100-12-31" onChange={(e) => setF((p) => ({ ...p, date: e.target.value, firstInvoiceMonth: null }))} disabled={lockedFinancial} />
        </Field>

        {/* 6. Forma de pagamento */}
        <div className={cx(lockedFinancial && 'pointer-events-none opacity-60')}>
          <span className="mb-2 block text-[13px] font-medium text-slate-600 dark:text-slate-300">Forma de pagamento</span>
          <div className="grid grid-cols-5 gap-1.5">
            {METHOD_ORDER.map((m) => {
              const I = METHOD_ICON[m];
              const active = f.method === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => pickMethod(m)}
                  data-tip={PAYMENT_LABEL[m]}
                  aria-pressed={active}
                  className={cx(
                    'flex flex-col items-center gap-1 rounded-2xl py-2.5 text-[11px] font-semibold leading-tight transition press:scale-95',
                    active ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-ink-900 dark:text-slate-300 dark:hover:bg-ink-700',
                  )}
                >
                  <I size={20} />
                  {m === 'credit' ? 'Crédito' : PAYMENT_LABEL[m]}
                </button>
              );
            })}
          </div>
          {['pix', 'debit', 'cash'].includes(f.method) && <p className="mt-2 text-xs text-slate-500">Sai imediatamente do dinheiro disponível.</p>}
        </div>

        {/* 7. Cartão (somente crédito/benefício) */}
        {(f.method === 'credit' || f.method === 'benefit') && (
          <div className={cx('animate-pop-in', lockedFinancial && 'pointer-events-none opacity-60')}>
            <span className="mb-2 block text-[13px] font-medium text-slate-600 dark:text-slate-300">{f.method === 'credit' ? 'Cartão de crédito' : 'Cartão de benefício'}</span>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" role="group" aria-label="Cartões">
              {(f.method === 'credit' ? creditCards : benefitCards).map((c) => {
                const selected = f.cardId === c.id;
                const amount = c.kind === 'credit' ? creditUsage(data, c).available + (editing?.cardId === c.id ? editing.amountCents : 0) : benefitBalance(data, c.id) + (editing?.cardId === c.id ? editing.amountCents : 0);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setF((p) => ({ ...p, cardId: c.id, firstInvoiceMonth: null }))}
                    aria-pressed={selected}
                    aria-label={`${c.name}, ${c.kind === 'credit' ? 'limite disponível' : 'saldo'} ${brl(amount)}`}
                    className={cx(
                      'relative flex aspect-[1.6] min-w-0 flex-col justify-between overflow-hidden rounded-2xl p-3 text-left text-white transition duration-200 press:scale-95',
                      selected ? 'shadow-lg ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-ink-800' : 'opacity-55 saturate-[0.6]',
                    )}
                    style={{ background: cardGradient(c.color) }}
                  >
                    <span className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-white/10" />
                    <span className="relative flex items-start justify-between gap-2">
                      <span className="min-w-0 break-words text-[14px] font-bold leading-tight">{c.name}</span>
                      {selected ? (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-slate-900">
                          <Check size={13} strokeWidth={3} />
                        </span>
                      ) : c.kind === 'credit' ? (
                        <CreditCard size={16} className="shrink-0 text-white/80" />
                      ) : (
                        <Gift size={16} className="shrink-0 text-white/80" />
                      )}
                    </span>
                    <span className="relative">
                      <span className="block text-[11px] font-medium text-white/75">{c.kind === 'credit' ? 'Limite disponível' : 'Saldo'}</span>
                      <span className="block text-[15px] font-bold tabular-nums">{brl(amount)}</span>
                    </span>
                  </button>
                );
              })}
              {(f.method === 'credit' ? creditCards : benefitCards).length === 0 && <p className="col-span-2 text-sm text-slate-500">Nenhum cartão ativo. Cadastre em Cartões.</p>}
            </div>
            {benefitInfo !== null && f.amountCents > 0 && (
              <p className={cx('mt-2 text-xs', benefitInfo - f.amountCents < 0 ? 'font-semibold text-expense' : 'text-slate-500')}>
                Saldo após a compra: {brl(benefitInfo - f.amountCents)}
                {benefitInfo - f.amountCents < 0 && ' (saldo insuficiente)'}
              </p>
            )}
          </div>
        )}

        {/* 8. Parcelas (somente crédito) */}
        {f.method === 'credit' && (
          <div className={cx('animate-pop-in', lockedFinancial && 'pointer-events-none opacity-60')}>
            <span className="mb-2 block text-[13px] font-medium text-slate-600 dark:text-slate-300">Parcelas</span>
            <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Parcelas">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set('installments', n)}
                  aria-pressed={f.installments === n}
                  data-tip={f.amountCents > 0 ? (n === 1 ? `À vista: ${brl(f.amountCents)}` : `${n}x de ${brl(Math.floor(f.amountCents / n))}`) : undefined}
                  className={cx(
                    'h-10 min-w-0 rounded-xl px-0.5 text-[13px] font-semibold transition press:scale-95',
                    f.installments === n ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-ink-900 dark:text-slate-300',
                  )}
                >
                  {n === 1 ? 'À vista' : `${n}x`}
                </button>
              ))}
              {f.installments > 12 && (
                <p className="col-span-6 rounded-xl bg-brand-500 px-3 py-2 text-center text-[13px] font-semibold text-white">
                  {f.installments}x (parcelamento anterior ao limite de 12x)
                </p>
              )}
            </div>
            {creditInfo && (
              <div className="mt-3 space-y-1 rounded-2xl bg-brand-50 p-3 text-[13px] text-brand-700 dark:bg-brand-500/10 dark:text-brand-100">
                <div className="flex items-center justify-between gap-2">
                  <p>
                    1ª parcela na fatura de <b>{monthLabel(creditInfo.first)}</b>
                    <span className="block text-[12px] opacity-80">
                      vence {fmtDate(creditInfo.due)}
                      {creditInfo.first !== creditInfo.auto ? ' · escolhida manualmente' : ''}
                    </span>
                  </p>
                  <div className="flex shrink-0 gap-1">
                    <IconButton
                      icon={ChevronLeft}
                      label="Fatura anterior"
                      disabled={creditInfo.first <= monthOf(f.date)}
                      onClick={() => set('firstInvoiceMonth', addMonths(creditInfo.first, -1) === creditInfo.auto ? null : addMonths(creditInfo.first, -1))}
                      className="h-9 w-9 bg-white/70 disabled:opacity-30 dark:bg-ink-800"
                    />
                    <IconButton
                      icon={ChevronRight}
                      label="Próxima fatura"
                      onClick={() => set('firstInvoiceMonth', addMonths(creditInfo.first, 1) === creditInfo.auto ? null : addMonths(creditInfo.first, 1))}
                      className="h-9 w-9 bg-white/70 dark:bg-ink-800"
                    />
                  </div>
                </div>
                <p>
                  Limite disponível: <b>{brl(creditInfo.available)}</b>
                  {f.amountCents > creditInfo.available && (
                    <Badge tone="red">
                      <TriangleAlert size={11} /> acima do limite
                    </Badge>
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        {error && <p className="rounded-2xl bg-expense-soft p-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-expense-dark">{error}</p>}
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  );
}
