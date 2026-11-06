import { addMonths, currentMonth, dateInMonth, todayISO, type Month } from '../lib/months';
import { uid } from '../lib/id';
import { buildInstallments, invoiceDueDate } from '../domain/finance';
import {
  emptyData,
  type Bill,
  type Card,
  type Category,
  type Expense,
  type FinanceData,
  type IncomeSource,
  type PaymentMethod,
  type Person,
  type Responsible,
} from '../domain/types';

const ts = (iso: string) => `${iso}T12:00:00.000Z`;

/** Categorias iniciais (as 7 do escopo + algumas usadas pelas contas fixas). */
export const INITIAL_CATEGORIES: [string, string, string][] = [
  ['Ifood', 'Pizza', '#ef4444'],
  ['Restaurante', 'UtensilsCrossed', '#f97316'],
  ['Mercado', 'ShoppingCart', '#16a34a'],
  ['Roupa', 'Shirt', '#8b5cf6'],
  ['Calçado', 'Footprints', '#a16207'],
  ['Shopping', 'ShoppingBag', '#ec4899'],
  ['Lazer', 'PartyPopper', '#0ea5e9'],
  ['Farmácia', 'Pill', '#14b8a6'],
  ['Combustível', 'Fuel', '#64748b'],
  ['Moradia', 'House', '#2563eb'],
  ['Contas da casa', 'Zap', '#ca8a04'],
  ['Assinaturas', 'Tv', '#6366f1'],
  ['Educação', 'GraduationCap', '#0891b2'],
];

/** [nome, instituição, limite (R$), fechamento, vencimento, cor] */
const INITIAL_CREDIT: [string, string, number, number, number, string][] = [
  ['Santander', 'Santander', 12000, 28, 5, '#ec0000'],
  ['Riachuelo', 'Riachuelo', 2500, 10, 20, '#2b2b2b'],
  ['Renner', 'Renner', 3000, 15, 25, '#b0102a'],
  ['Carrefour', 'Carrefour', 4000, 5, 12, '#004e9f'],
  ['Mercado Pago', 'Mercado Pago', 5000, 1, 8, '#00a6e0'],
  ['Nubank', 'Nubank', 8000, 3, 10, '#820ad1'],
];

export function initialCatalog(created = new Date().toISOString(), withLimits = false) {
  const categories: Category[] = INITIAL_CATEGORIES.map(([name, icon, color], i) => ({
    id: uid(),
    createdAt: created,
    name,
    icon,
    color,
    sortOrder: i,
    archivedAt: null,
  }));
  const cards: Card[] = [
    { id: uid(), createdAt: created, kind: 'benefit', name: 'Flash Igor', institution: 'Flash', owner: 'igor', limitCents: 0, closingDay: 1, dueDay: 1, color: '#ff5a1f', active: true, deletedAt: null, externalUsedCents: 0 },
    { id: uid(), createdAt: created, kind: 'benefit', name: 'Pluxee Carol', institution: 'Pluxee', owner: 'carol', limitCents: 0, closingDay: 1, dueDay: 1, color: '#0aa5a0', active: true, deletedAt: null, externalUsedCents: 0 },
    ...INITIAL_CREDIT.map(([name, institution, limit, closingDay, dueDay, color]): Card => ({
      id: uid(),
      createdAt: created,
      kind: 'credit',
      name,
      institution,
      owner: null,
      limitCents: withLimits ? limit * 100 : 0,
      closingDay,
      dueDay,
      color,
      active: true,
      deletedAt: null,
      externalUsedCents: 0,
    })),
  ];
  const incomeSources: IncomeSource[] = [
    { id: uid(), createdAt: created, name: 'Pagamento Igor', responsible: 'igor', sortOrder: 0, active: true },
    { id: uid(), createdAt: created, name: 'Pagamento Carol', responsible: 'carol', sortOrder: 1, active: true },
  ];
  return { categories, cards, incomeSources };
}

/** Ambiente novo e vazio (usado ao criar um ambiente no Supabase). */
export function initialData(): FinanceData {
  return { ...emptyData(), ...initialCatalog() };
}

/* ──────────────────────── Dados de demonstração ──────────────────────── */

export function demoData(): FinanceData {
  const M = currentMonth();
  const today = todayISO();
  const todayDay = Number(today.slice(8, 10));
  const start = addMonths(M, -4);
  const d: FinanceData = { ...emptyData(), ...initialCatalog(ts(dateInMonth(start, 1)), true) };

  const cat = (name: string) => d.categories.find((c) => c.name === name)!.id;
  const card = (name: string) => d.cards.find((c) => c.name === name)!;

  // Receitas: histórico mensal preservado (Igor teve aumento há dois meses).
  const [igor, carol] = d.incomeSources;
  for (let i = -4; i <= 0; i++) {
    const m = addMonths(M, i);
    const recv = dateInMonth(m, 5);
    const received = recv <= today ? recv : null;
    d.incomes.push({ id: uid(), createdAt: ts(dateInMonth(m, 1)), sourceId: igor.id, month: m, amountCents: i < -1 ? 500000 : 550000, receivedDate: received });
    d.incomes.push({ id: uid(), createdAt: ts(dateInMonth(m, 1)), sourceId: carol.id, month: m, amountCents: 300000, receivedDate: received });
  }

  // Benefícios: recarga mensal.
  for (let i = -4; i <= 0; i++) {
    const m = addMonths(M, i);
    d.benefitEntries.push({ id: uid(), createdAt: ts(dateInMonth(m, 1)), cardId: card('Flash Igor').id, date: dateInMonth(m, 1), amountCents: 60000, kind: 'recharge', note: 'Recarga mensal' });
    d.benefitEntries.push({ id: uid(), createdAt: ts(dateInMonth(m, 1)), cardId: card('Pluxee Carol').id, date: dateInMonth(m, 1), amountCents: 85000, kind: 'recharge', note: 'Recarga mensal' });
  }

  // Contas fixas.
  const bill = (name: string, category: string, responsible: Responsible, amount: number, dueDay: number, startMonth: Month, extra: Partial<Bill> = {}) => {
    const b: Bill = { id: uid(), createdAt: ts(dateInMonth(startMonth, 1)), name, categoryId: cat(category), responsible, frequency: 'monthly', startMonth, endMonth: null, installments: null, installmentOffset: 0, cardId: null, pauses: [], archivedAt: null, ...extra };
    d.bills.push(b);
    d.billVersions.push({ id: uid(), createdAt: b.createdAt, billId: b.id, fromMonth: startMonth, amountCents: amount, dueDay });
    return b;
  };
  bill('Aluguel', 'Moradia', 'casal', 180000, 10, start);
  bill('Condomínio', 'Moradia', 'casal', 52000, 10, start);
  bill('Internet', 'Contas da casa', 'casal', 11990, 15, start);
  bill('Energia elétrica', 'Contas da casa', 'carol', 23000, 20, start);
  bill('Água', 'Contas da casa', 'carol', 9500, 18, start);
  bill('Academia', 'Lazer', 'igor', 14990, 5, start);
  bill('Streaming', 'Assinaturas', 'carol', 5590, 12, start);
  bill('Curso de inglês', 'Educação', 'carol', 35000, 8, addMonths(M, -2), { installments: 12, endMonth: addMonths(M, 9) });
  const energy = d.bills.find((b) => b.name === 'Energia elétrica')!;
  d.billVersions.push({ id: uid(), createdAt: ts(dateInMonth(addMonths(M, -1), 1)), billId: energy.id, fromMonth: addMonths(M, -1), amountCents: 24800, dueDay: 20 });

  // Ocorrências pagas: meses anteriores e o que já venceu no mês atual.
  for (const b of d.bills) {
    for (let i = -4; i <= 0; i++) {
      const m = addMonths(M, i);
      if (m < b.startMonth) continue;
      const v = d.billVersions.filter((x) => x.billId === b.id && x.fromMonth <= m).sort((a, c) => (a.fromMonth < c.fromMonth ? 1 : -1))[0];
      const due = dateInMonth(m, v.dueDay);
      if (i < 0 || due <= today) {
        d.billOccurrences.push({ id: uid(), createdAt: ts(due), billId: b.id, month: m, amountCents: null, dueDay: null, paidAt: due, paidAmountCents: null, paidViaInvoice: false });
      }
    }
  }

  // Despesas do dia a dia.
  type T = [day: number, amount: number, desc: string, category: string, who: Person, method: PaymentMethod, card?: string, inst?: number];
  const monthly = (k: number): T[] => [
    [1, 31250 + k * 1730, 'Compra do mês', 'Mercado', 'carol', 'benefit', 'Pluxee Carol'],
    [2, 6890, 'Ifood — japonês', 'Ifood', 'igor', 'credit', 'Nubank', 1],
    [3, 4520, 'Almoço', 'Restaurante', 'igor', 'benefit', 'Flash Igor'],
    [4, 22000, 'Posto Shell', 'Combustível', 'igor', 'debit'],
    [6, 3990, 'Ifood — pizza', 'Ifood', 'carol', 'pix'],
    [8, 18740, 'Feira e hortifruti', 'Mercado', 'carol', 'benefit', 'Pluxee Carol'],
    [9, 5600, 'Farmácia São João', 'Farmácia', 'carol', 'debit'],
    [11, 12800, 'Cinema + pipoca', 'Lazer', 'igor', 'credit', 'Mercado Pago', 1],
    [12, 3850, 'Almoço', 'Restaurante', 'igor', 'benefit', 'Flash Igor'],
    [14, 9870, 'Ifood — hambúrguer', 'Ifood', 'igor', 'credit', 'Nubank', 1],
    [15, 25430 + k * 990, 'Atacadão', 'Mercado', 'igor', 'credit', 'Carrefour', 1],
    [17, 4210, 'Almoço', 'Restaurante', 'carol', 'benefit', 'Pluxee Carol'],
    [19, 21000, 'Posto Ipiranga', 'Combustível', 'carol', 'pix'],
    [20, 27480, 'Supermercado Dia', 'Mercado', 'igor', 'benefit', 'Flash Igor'],
    [21, 16500, 'Jantar aniversário', 'Restaurante', 'igor', 'credit', 'Santander', 1],
    [23, 7490, 'Ifood — mercado', 'Ifood', 'carol', 'credit', 'Nubank', 1],
    [25, 4860, 'Almoço', 'Restaurante', 'igor', 'benefit', 'Flash Igor'],
    [27, 15990, 'Padaria e açougue', 'Mercado', 'carol', 'benefit', 'Pluxee Carol'],
    [28, 3200, 'Estacionamento', 'Lazer', 'igor', 'cash'],
  ];
  const specials: Record<number, T[]> = {
    [-3]: [[18, 59990, 'Tênis de corrida', 'Calçado', 'igor', 'credit', 'Renner', 3]],
    [-2]: [
      [10, 48000, 'Roupas de trabalho', 'Roupa', 'carol', 'credit', 'Riachuelo', 2],
      [26, 360000, 'Geladeira nova', 'Shopping', 'igor', 'credit', 'Santander', 10],
    ],
    [-1]: [[13, 120000, 'Fone + relógio', 'Shopping', 'carol', 'credit', 'Mercado Pago', 6]],
    [0]: [[2, 21990, 'Vestido', 'Roupa', 'carol', 'credit', 'Renner', 2]],
  };

  for (let k = -4; k <= 0; k++) {
    const m = addMonths(M, k);
    const list = [...(k === -4 ? [] : monthly(k + 4)), ...(specials[k] ?? [])];
    for (const [day, amount, desc, category, who, method, cardName, inst] of list) {
      if (k === 0 && day > todayDay) continue;
      const date = dateInMonth(m, day);
      const c = cardName ? card(cardName) : null;
      const e: Expense = {
        id: uid(),
        createdAt: ts(date),
        updatedAt: ts(date),
        amountCents: amount,
        description: desc,
        categoryId: cat(category),
        responsible: who,
        date,
        method,
        cardId: c?.id ?? null,
        installments: method === 'credit' ? inst ?? 1 : 1,
      };
      d.expenses.push(e);
      if (method === 'credit' && c) d.installments.push(...buildInstallments(e, c));
    }
  }

  // Faturas já vencidas foram pagas.
  const seen = new Set<string>();
  for (const i of d.installments) {
    const key = `${i.cardId}|${i.invoiceMonth}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const c = d.cards.find((x) => x.id === i.cardId)!;
    const due = invoiceDueDate(c, i.invoiceMonth);
    if (due < today) {
      const total = d.installments.filter((x) => x.cardId === i.cardId && x.invoiceMonth === i.invoiceMonth).reduce((a, b) => a + b.amountCents, 0);
      d.invoicePayments.push({ id: uid(), createdAt: ts(due), cardId: i.cardId, month: i.invoiceMonth, amountCents: total, paidAt: due });
    }
  }
  return d;
}
