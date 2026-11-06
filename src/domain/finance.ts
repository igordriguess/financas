/**
 * Motor de regras financeiras — funções puras, sem efeitos colaterais.
 *
 * Princípios:
 * - Dinheiro, saldo de benefícios e limite de crédito nunca se misturam.
 * - Compras no crédito entram no orçamento pela competência da fatura (parcela a parcela),
 *   nunca pelo valor total no mês da compra. O pagamento da fatura apenas liquida esse
 *   compromisso — não é uma nova despesa.
 * - Contas fixas entram no orçamento do mês mesmo quando ainda pendentes.
 * - Receitas de meses passados são registros próprios do mês (histórico imutável).
 */
import { addMonths, cmpMonth, dateInMonth, daysInMonth, diffMonths, monthOf, todayISO, type Month } from '../lib/months';
import { splitCents } from '../lib/money';
import { uid, nowISO } from '../lib/id';
import {
  CASH_METHODS,
  FREQUENCY_MONTHS,
  RESPONSIBLES,
  type Bill,
  type BillOccurrence,
  type BillVersion,
  type Card,
  type Expense,
  type FinanceData,
  type Income,
  type IncomeSource,
  type Installment,
  type PaymentMethod,
  type Responsible,
} from './types';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/* ───────────────────────────── Cartão de crédito ───────────────────────────── */

/**
 * Competência (mês de vencimento) da fatura em que uma compra cai.
 * Compras no dia do fechamento ou depois entram na fatura seguinte.
 */
export function invoiceMonthFor(card: Pick<Card, 'closingDay' | 'dueDay'>, purchaseDate: string): Month {
  const m = monthOf(purchaseDate);
  const day = Number(purchaseDate.slice(8, 10));
  const closing = Math.min(card.closingDay, daysInMonth(m));
  const closingMonth = day >= closing ? addMonths(m, 1) : m;
  return card.dueDay > card.closingDay ? closingMonth : addMonths(closingMonth, 1);
}

export function invoiceClosingDate(card: Pick<Card, 'closingDay' | 'dueDay'>, invoiceMonth: Month): string {
  const closingMonth = card.dueDay > card.closingDay ? invoiceMonth : addMonths(invoiceMonth, -1);
  return dateInMonth(closingMonth, card.closingDay);
}
export const invoiceDueDate = (card: Pick<Card, 'dueDay'>, invoiceMonth: Month) => dateInMonth(invoiceMonth, card.dueDay);

export function buildInstallments(expense: Expense, card: Card): Installment[] {
  const total = Math.max(1, expense.installments);
  const first = expense.firstInvoiceMonth ?? invoiceMonthFor(card, expense.date);
  return splitCents(expense.amountCents, total).map((amountCents, i) => ({
    id: uid(),
    createdAt: nowISO(),
    expenseId: expense.id,
    cardId: card.id,
    number: i + 1,
    total,
    amountCents,
    invoiceMonth: addMonths(first, i),
  }));
}

export const isInvoicePaid = (d: FinanceData, cardId: string, month: Month) =>
  d.invoicePayments.find((p) => p.cardId === cardId && p.month === month) ?? null;

/** Contas fixas cobradas no cartão: a cobrança do mês M entra na fatura que vence em M. */
export function cardBillLines(d: FinanceData, cardId: string, month: Month, today = todayISO()): BillLine[] {
  return d.bills
    .filter((b) => b.cardId === cardId)
    .map((b) => billLine(d, b, month, today))
    .filter((x): x is BillLine => x !== null);
}

/** Total da fatura: parcelas de compras + contas fixas cobradas no cartão. */
export function invoiceTotal(d: FinanceData, cardId: string, month: Month): number {
  return (
    sum(d.installments.filter((i) => i.cardId === cardId && i.invoiceMonth === month).map((i) => i.amountCents)) +
    sum(cardBillLines(d, cardId, month).map((l) => l.amountCents))
  );
}

/**
 * Fatura quitada: pagamento registrado no cartão, ou — quando a fatura só tem contas fixas —
 * todas essas contas já marcadas como pagas (ex.: a conta "Cartão Carrefour" paga em Contas).
 */
export function invoicePaidInfo(d: FinanceData, card: Card, month: Month): { paid: boolean; paidAt: string | null; viaBills: boolean } {
  const p = isInvoicePaid(d, card.id, month);
  if (p) return { paid: true, paidAt: p.paidAt, viaBills: false };
  const hasPurchases = d.installments.some((i) => i.cardId === card.id && i.invoiceMonth === month);
  const lines = cardBillLines(d, card.id, month);
  if (!hasPurchases && lines.length > 0 && lines.every((l) => l.paid)) {
    const last = lines.map((l) => l.paidAt ?? '').sort().pop() || null;
    return { paid: true, paidAt: last, viaBills: true };
  }
  return { paid: false, paidAt: null, viaBills: false };
}

export type InvoiceStatus = 'open' | 'closed' | 'overdue' | 'paid' | 'future' | 'empty';
export function invoiceStatus(d: FinanceData, card: Card, month: Month, today = todayISO()): InvoiceStatus {
  if (invoicePaidInfo(d, card, month).paid) return 'paid';
  const total = invoiceTotal(d, card.id, month);
  const closing = invoiceClosingDate(card, month);
  const due = invoiceDueDate(card, month);
  if (today > due) return total > 0 ? 'overdue' : 'empty';
  if (today >= closing) return total > 0 ? 'closed' : 'empty';
  const openMonth = invoiceMonthFor(card, today);
  if (month === openMonth) return 'open';
  return total > 0 ? 'future' : 'empty';
}

export interface CreditUsage {
  limit: number;
  used: number;
  available: number;
  usedPct: number;
  /** Parcelas de compras lançadas no app (faturas não pagas, inclusive futuras). */
  purchases: number;
  /** Contas recorrentes (sem término) cobradas no cartão até a fatura aberta e não pagas. */
  bills: number;
  /** Contas parceladas (com término) no cartão: todas as parcelas restantes ainda não pagas. */
  billsInstallments: number;
  /** Uso informado fora do app (ajuste do limite disponível). */
  external: number;
  /** Contas do cartão já pagas na fatura vigente/anterior (limite liberado) — informativo. */
  billsReleased: number;
}
/**
 * Limite comprometido = parcelas de faturas não pagas (inclusive futuras)
 * + contas fixas do cartão já cobradas e não pagas + uso fora do app.
 */
export function creditUsage(d: FinanceData, card: Card, today = todayISO()): CreditUsage {
  const paid = new Set(d.invoicePayments.filter((p) => p.cardId === card.id).map((p) => p.month));
  const purchases = sum(d.installments.filter((i) => i.cardId === card.id && !paid.has(i.invoiceMonth)).map((i) => i.amountCents));
  const open = invoiceMonthFor(card, today);
  let bills = 0;
  let billsReleased = 0;
  for (const m of [addMonths(open, -1), open]) for (const l of cardBillLines(d, card.id, m, today)) if (l.paid || paid.has(m)) billsReleased += l.amountCents;
  let billsInstallments = 0;
  for (const b of d.bills.filter((x) => x.cardId === card.id)) {
    const end = billEndMonth(b);
    // Parcelada (tem término): compromete TODAS as parcelas restantes, como uma compra parcelada,
    // e libera conforme cada fatura é paga. Recorrente sem fim: só o que já foi cobrado até a fatura aberta.
    const last = end ?? open;
    for (let m = b.startMonth; m <= last; m = addMonths(m, 1)) {
      if (paid.has(m)) continue;
      const l = billLine(d, b, m, today);
      if (!l || l.paid) continue;
      if (end) billsInstallments += l.amountCents;
      else bills += l.amountCents;
    }
  }
  const external = card.externalUsedCents ?? 0;
  const used = purchases + bills + billsInstallments + external;
  return {
    limit: card.limitCents,
    used,
    available: card.limitCents - used,
    usedPct: card.limitCents > 0 ? Math.round((used / card.limitCents) * 100) : 0,
    purchases,
    bills,
    billsInstallments,
    external,
    billsReleased,
  };
}

/**
 * Fatura que importa agora: a anterior enquanto estiver fechada/vencida e não paga;
 * senão a fatura aberta.
 */
export function currentInvoiceMonth(d: FinanceData, card: Card, today = todayISO()): Month {
  const open = invoiceMonthFor(card, today);
  const prev = addMonths(open, -1);
  const st = invoiceStatus(d, card, prev, today);
  return st === 'closed' || st === 'overdue' ? prev : open;
}

/* ───────────────────────────── Benefícios ───────────────────────────── */

export function benefitBalance(d: FinanceData, cardId: string): number {
  const credits = sum(d.benefitEntries.filter((e) => e.cardId === cardId).map((e) => e.amountCents));
  const spent = sum(d.expenses.filter((e) => e.method === 'benefit' && e.cardId === cardId).map((e) => e.amountCents));
  return credits - spent;
}

/* ───────────────────────────── Receitas ───────────────────────────── */

export interface IncomeLine {
  source: IncomeSource;
  amountCents: number;
  record: Income | null;
  /** true quando o valor vem do último mês registrado (previsão). */
  projected: boolean;
  /** true quando não existe nenhum valor anterior para projetar. */
  missing: boolean;
}

export function incomeLines(d: FinanceData, month: Month): IncomeLine[] {
  return d.incomeSources
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((source): IncomeLine | null => {
      const record = d.incomes.find((i) => i.sourceId === source.id && i.month === month) ?? null;
      if (record) return { source, amountCents: record.amountCents, record, projected: false, missing: false };
      if (!source.active) return null;
      const prev = d.incomes
        .filter((i) => i.sourceId === source.id && i.month < month)
        .sort((a, b) => cmpMonth(b.month, a.month))[0];
      if (prev) return { source, amountCents: prev.amountCents, record: null, projected: true, missing: false };
      return { source, amountCents: 0, record: null, projected: false, missing: true };
    })
    .filter((x): x is IncomeLine => x !== null);
}

/**
 * Cria registros para os meses até `upTo` que ainda não têm valor, copiando o mês anterior.
 * Assim, uma alteração futura nunca muda retroativamente um mês que já passou.
 */
export function materializeIncomes(d: FinanceData, upTo: Month): Income[] {
  const created: Income[] = [];
  for (const s of d.incomeSources.filter((x) => x.active)) {
    const recs = d.incomes.filter((i) => i.sourceId === s.id).sort((a, b) => cmpMonth(a.month, b.month));
    if (!recs.length) continue;
    const have = new Set(recs.map((r) => r.month));
    let last = recs[0];
    for (let m = recs[0].month; m <= upTo; m = addMonths(m, 1)) {
      const existing = recs.find((r) => r.month === m);
      if (existing) {
        last = existing;
        continue;
      }
      if (have.has(m)) continue;
      const rec: Income = { id: uid(), createdAt: nowISO(), sourceId: s.id, month: m, amountCents: last.amountCents, receivedDate: null };
      created.push(rec);
      last = rec;
    }
  }
  return created;
}

/* ───────────────────────────── Contas fixas ───────────────────────────── */

export function billEndMonth(bill: Pick<Bill, 'startMonth' | 'endMonth' | 'installments' | 'frequency'> & { installmentOffset?: number }): Month | null {
  if (bill.endMonth) return bill.endMonth;
  const remaining = (bill.installments ?? 0) - (bill.installmentOffset ?? 0);
  if (bill.installments && remaining > 0) return addMonths(bill.startMonth, (remaining - 1) * FREQUENCY_MONTHS[bill.frequency]);
  return null;
}
/** Quantidade de cobranças entre início e término, conforme a frequência. */
export function billCountBetween(start: Month, end: Month, frequency: Bill['frequency']): number {
  const diff = diffMonths(start, end);
  if (diff < 0) return 0;
  return Math.floor(diff / FREQUENCY_MONTHS[frequency]) + 1;
}

export const isPausedIn = (bill: Bill, m: Month) => bill.pauses.some((p) => m >= p.from && (p.to === null || m <= p.to));
export const isPausedNow = (bill: Bill, m: Month) => bill.pauses.some((p) => p.to === null && m >= p.from);

export function billChargesIn(bill: Bill, m: Month): boolean {
  if (m < bill.startMonth) return false;
  const end = billEndMonth(bill);
  if (end && m > end) return false;
  if (diffMonths(bill.startMonth, m) % FREQUENCY_MONTHS[bill.frequency] !== 0) return false;
  return !isPausedIn(bill, m);
}

export function billVersionAt(versions: BillVersion[], billId: string, m: Month): BillVersion | null {
  const vs = versions.filter((v) => v.billId === billId).sort((a, b) => cmpMonth(a.fromMonth, b.fromMonth));
  if (!vs.length) return null;
  let cur = vs[0];
  for (const v of vs) if (v.fromMonth <= m) cur = v;
  return cur;
}

export interface BillLine {
  bill: Bill;
  month: Month;
  amountCents: number;
  dueDate: string;
  paid: boolean;
  paidAt: string | null;
  occurrence: BillOccurrence | null;
  overdue: boolean;
  /** Número da cobrança (para contas com quantidade definida). */
  index: number | null;
  total: number | null;
}

export function billLine(d: FinanceData, bill: Bill, m: Month, today = todayISO()): BillLine | null {
  if (!billChargesIn(bill, m)) return null;
  const v = billVersionAt(d.billVersions, bill.id, m);
  const occ = d.billOccurrences.find((o) => o.billId === bill.id && o.month === m) ?? null;
  const base = occ?.amountCents ?? v?.amountCents ?? 0;
  const paid = !!occ?.paidAt;
  const amountCents = paid ? occ?.paidAmountCents ?? base : base;
  const dueDate = dateInMonth(m, occ?.dueDay ?? v?.dueDay ?? 10);
  const end = billEndMonth(bill);
  const offset = bill.installmentOffset ?? 0;
  const total = end ? offset + billCountBetween(bill.startMonth, end, bill.frequency) : null;
  const index = total ? offset + Math.floor(diffMonths(bill.startMonth, m) / FREQUENCY_MONTHS[bill.frequency]) + 1 : null;
  return { bill, month: m, amountCents, dueDate, paid, paidAt: occ?.paidAt ?? null, occurrence: occ, overdue: !paid && today > dueDate, index, total };
}

export function billLines(d: FinanceData, m: Month, today = todayISO()): BillLine[] {
  return d.bills
    .map((b) => billLine(d, b, m, today))
    .filter((x): x is BillLine => x !== null)
    .sort((a, b) => (a.dueDate === b.dueDate ? a.bill.name.localeCompare(b.bill.name) : a.dueDate < b.dueDate ? -1 : 1));
}

/* ───────────────────────────── Resumo do mês ───────────────────────────── */

export interface MonthSummary {
  month: Month;
  income: number;
  incomeHasProjection: boolean;
  incomeMissing: boolean;
  fixed: number;
  fixedPaid: number;
  fixedPending: number;
  fixedPendingCount: number;
  /** Pix, débito e dinheiro lançados no mês. */
  cashSpent: number;
  /** Faturas de cartão que vencem no mês: parcelas de compras + contas cobradas no cartão. */
  creditInvoices: number;
  /** Compras com benefício (não saem do dinheiro). */
  benefitSpent: number;
  /** Tudo que sai do dinheiro no mês: contas fixas + à vista + faturas. */
  outflows: number;
  balance: number;
  committedPct: number;
}

export function monthSummary(d: FinanceData, m: Month, today = todayISO()): MonthSummary {
  const inc = incomeLines(d, m);
  const income = sum(inc.map((l) => l.amountCents));
  const allBills = billLines(d, m, today);
  // Contas cobradas no cartão fazem parte da fatura daquele mês (contadas uma vez só).
  const bills = allBills.filter((b) => !b.bill.cardId);
  const cardBills = allBills.filter((b) => !!b.bill.cardId);
  const fixed = sum(bills.map((b) => b.amountCents));
  const fixedPaid = sum(bills.filter((b) => b.paid).map((b) => b.amountCents));
  const monthExp = d.expenses.filter((e) => monthOf(e.date) === m);
  const cashSpent = sum(monthExp.filter((e) => CASH_METHODS.includes(e.method)).map((e) => e.amountCents));
  const benefitSpent = sum(monthExp.filter((e) => e.method === 'benefit').map((e) => e.amountCents));
  const creditInvoices = sum(d.installments.filter((i) => i.invoiceMonth === m).map((i) => i.amountCents)) + sum(cardBills.map((b) => b.amountCents));
  const outflows = fixed + cashSpent + creditInvoices;
  return {
    month: m,
    income,
    incomeHasProjection: inc.some((l) => l.projected),
    incomeMissing: inc.length === 0 || inc.every((l) => l.missing),
    fixed,
    fixedPaid,
    fixedPending: fixed - fixedPaid,
    fixedPendingCount: bills.filter((b) => !b.paid).length,
    cashSpent,
    creditInvoices,
    benefitSpent,
    outflows,
    balance: income - outflows,
    committedPct: income > 0 ? Math.round((outflows / income) * 100) : 0,
  };
}

/** Parcelas de crédito em faturas posteriores ao mês informado. */
export function futureInstallments(d: FinanceData, m: Month): number {
  return sum(d.installments.filter((i) => i.invoiceMonth > m).map((i) => i.amountCents));
}

/* ───────────────────────────── Previsão ───────────────────────────── */

export interface ForecastCard {
  card: Card;
  /** Total da fatura do mês. */
  amountCents: number;
  /** Parcelas de compras lançadas. */
  purchases: number;
  /** Contas cobradas no cartão (parceladas ou recorrentes). */
  bills: BillLine[];
}

export interface Forecast {
  month: Month;
  incomes: IncomeLine[];
  income: number;
  recurringBills: BillLine[];
  termBills: BillLine[];
  fixed: number;
  cards: ForecastCard[];
  installments: number;
  commitments: number;
  projectedBalance: number;
  /** Média das despesas variáveis à vista dos últimos 3 meses com dados (apenas referência). */
  variableAverage: number | null;
  warnings: string[];
}

export function forecast(d: FinanceData, m: Month, today = todayISO()): Forecast {
  const incomes = incomeLines(d, m);
  const income = sum(incomes.map((l) => l.amountCents));
  const all = billLines(d, m, today);
  const lines = all.filter((l) => !l.bill.cardId);
  const recurringBills = lines.filter((l) => billEndMonth(l.bill) === null);
  const termBills = lines.filter((l) => billEndMonth(l.bill) !== null);
  const fixed = sum(lines.map((l) => l.amountCents));
  const byCard = new Map<string, ForecastCard>();
  const slot = (cardId: string) => {
    const card = d.cards.find((c) => c.id === cardId);
    if (!card) return null;
    if (!byCard.has(cardId)) byCard.set(cardId, { card, amountCents: 0, purchases: 0, bills: [] });
    return byCard.get(cardId)!;
  };
  for (const i of d.installments.filter((x) => x.invoiceMonth === m)) {
    const s = slot(i.cardId);
    if (s) s.purchases += i.amountCents;
  }
  for (const l of all.filter((x) => !!x.bill.cardId)) {
    const s = slot(l.bill.cardId!);
    if (s) s.bills.push(l);
  }
  const cards = [...byCard.values()]
    .map((c) => ({ ...c, amountCents: c.purchases + sum(c.bills.map((b) => b.amountCents)) }))
    .sort((a, b) => b.amountCents - a.amountCents);
  const installments = sum(cards.map((c) => c.amountCents));
  const commitments = fixed + installments;

  const prevMonths = [1, 2, 3].map((n) => addMonths(monthOf(today), -n));
  const totals = prevMonths
    .map((pm) => d.expenses.filter((e) => monthOf(e.date) === pm && CASH_METHODS.includes(e.method)))
    .filter((xs) => xs.length > 0)
    .map((xs) => sum(xs.map((e) => e.amountCents)));
  const variableAverage = totals.length ? Math.round(sum(totals) / totals.length) : null;

  const warnings: string[] = [];
  if (!incomes.length || incomes.every((l) => l.missing)) warnings.push('Nenhuma receita registrada para projetar. Cadastre os valores em Receitas.');
  else if (incomes.some((l) => l.missing)) warnings.push(`Sem valor de referência para: ${incomes.filter((l) => l.missing).map((l) => l.source.name).join(', ')}.`);
  if (!d.bills.length) warnings.push('Nenhuma conta fixa cadastrada — a previsão não inclui contas recorrentes.');
  warnings.push('Gastos variáveis (Pix, débito, dinheiro e novas compras no cartão) não são projetados.');

  return { month: m, incomes, income, recurringBills, termBills, fixed, cards, installments, commitments, projectedBalance: income - commitments, variableAverage, warnings };
}

/* ───────────────────────────── Relatórios ───────────────────────────── */

export interface SpendItem {
  key: string;
  amountCents: number;
}

/**
 * Gastos do mês por competência: compras à vista e com benefício pela data,
 * parcelas de crédito pela fatura, e contas fixas do mês.
 */
export function spendingItems(d: FinanceData, m: Month) {
  const items: { categoryId: string; responsible: Responsible; method: PaymentMethod | 'bill'; amountCents: number }[] = [];
  for (const e of d.expenses) if (e.method !== 'credit' && monthOf(e.date) === m) items.push({ categoryId: e.categoryId, responsible: e.responsible, method: e.method, amountCents: e.amountCents });
  const byId = new Map(d.expenses.map((e) => [e.id, e]));
  for (const i of d.installments) {
    if (i.invoiceMonth !== m) continue;
    const e = byId.get(i.expenseId);
    if (e) items.push({ categoryId: e.categoryId, responsible: e.responsible, method: 'credit', amountCents: i.amountCents });
  }
  for (const b of billLines(d, m)) items.push({ categoryId: b.bill.categoryId, responsible: b.bill.responsible, method: b.bill.cardId ? 'credit' : 'bill', amountCents: b.amountCents });
  return items;
}

export function groupSum<T>(items: T[], key: (t: T) => string, val: (t: T) => number): SpendItem[] {
  const map = new Map<string, number>();
  for (const it of items) map.set(key(it), (map.get(key(it)) ?? 0) + val(it));
  return [...map.entries()].map(([k, v]) => ({ key: k, amountCents: v })).sort((a, b) => b.amountCents - a.amountCents);
}

export function byResponsible(d: FinanceData, m: Month): Record<Responsible, number> {
  const items = spendingItems(d, m);
  return Object.fromEntries(RESPONSIBLES.map((p) => [p, sum(items.filter((i) => i.responsible === p).map((i) => i.amountCents))])) as Record<Responsible, number>;
}

/* ───────────────────────────── Integridade ───────────────────────────── */

/** Possível lançamento duplicado: mesmo valor, data, meio, cartão e categoria/descrição. */
export function findDuplicate(d: FinanceData, e: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Expense | null {
  return (
    d.expenses.find(
      (x) =>
        x.id !== e.id &&
        x.amountCents === e.amountCents &&
        x.date === e.date &&
        x.method === e.method &&
        (x.cardId ?? null) === (e.cardId ?? null) &&
        (x.categoryId === e.categoryId || (!!e.description && x.description.trim().toLowerCase() === e.description.trim().toLowerCase())),
    ) ?? null
  );
}

/** Uma compra no crédito com parcela em fatura já paga não pode ter valor/cartão/parcelas alterados. */
export function expenseLocked(d: FinanceData, expenseId: string): boolean {
  const paid = new Set(d.invoicePayments.map((p) => `${p.cardId}|${p.month}`));
  return d.installments.some((i) => i.expenseId === expenseId && paid.has(`${i.cardId}|${i.invoiceMonth}`));
}

export function categoryUsage(d: FinanceData, categoryId: string) {
  return {
    expenses: d.expenses.filter((e) => e.categoryId === categoryId).length,
    bills: d.bills.filter((b) => b.categoryId === categoryId).length,
  };
}

export function validateExpense(e: Pick<Expense, 'amountCents' | 'date' | 'method' | 'cardId' | 'installments' | 'categoryId'> & { firstInvoiceMonth?: Month | null }): string | null {
  if (!Number.isInteger(e.amountCents) || e.amountCents <= 0) return 'Informe um valor maior que zero.';
  if (e.amountCents > 100_000_000_00) return 'Valor muito alto. Confira o lançamento.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return 'Data inválida.';
  if (!e.categoryId) return 'Escolha uma categoria.';
  if ((e.method === 'credit' || e.method === 'benefit') && !e.cardId) return 'Selecione o cartão utilizado.';
  if (e.method === 'credit' && (e.installments < 1 || e.installments > 48)) return 'Parcelas devem estar entre 1 e 48.';
  if (e.method === 'credit' && e.firstInvoiceMonth && e.firstInvoiceMonth < monthOf(e.date)) return 'A 1ª parcela não pode cair numa fatura anterior ao mês da compra.';
  return null;
}
