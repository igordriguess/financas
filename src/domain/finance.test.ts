import { describe, expect, it } from 'vitest';
import {
  validateExpense,
  forecast,
  cardBillLines,
  currentInvoiceMonth,
  invoicePaidInfo,
  invoiceStatus,
  invoiceTotal,
  billCountBetween,
  billEndMonth,
  billLines,
  buildInstallments,
  creditUsage,
  benefitBalance,
  findDuplicate,
  incomeLines,
  invoiceMonthFor,
  materializeIncomes,
  monthSummary,
  reserveBalance,
} from './finance';
import { emptyData, type Bill, type Card, type Expense, type FinanceData } from './types';

const card = (p: Partial<Card> = {}): Card => ({
  id: 'c1',
  createdAt: '',
  kind: 'credit',
  name: 'Nubank',
  institution: 'Nubank',
  owner: null,
  limitCents: 500000,
  closingDay: 3,
  dueDay: 10,
  color: '',
  active: true,
  deletedAt: null,
  externalUsedCents: 0,
  ...p,
});
const expense = (p: Partial<Expense> = {}): Expense => ({
  id: 'e1',
  createdAt: '',
  updatedAt: '',
  amountCents: 120000,
  description: '',
  categoryId: 'cat',
  responsible: 'igor',
  date: '2026-11-05',
  method: 'credit',
  cardId: 'c1',
  installments: 6,
  firstInvoiceMonth: null,
  ...p,
});
const bill = (p: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  createdAt: '',
  name: 'Aluguel',
  categoryId: 'cat',
  responsible: 'igor',
  frequency: 'monthly',
  startMonth: '2026-11',
  endMonth: null,
  installments: null,
  installmentOffset: 0,
  cardId: null,
  pauses: [],
  archivedAt: null,
  ...p,
});

describe('fatura do cartão', () => {
  it('compra antes do fechamento entra na fatura do mês; no fechamento ou depois, na seguinte', () => {
    const c = card({ closingDay: 3, dueDay: 10 });
    expect(invoiceMonthFor(c, '2026-11-02')).toBe('2026-11');
    expect(invoiceMonthFor(c, '2026-11-03')).toBe('2026-12');
    expect(invoiceMonthFor(c, '2026-11-20')).toBe('2026-12');
  });
  it('vencimento antes do fechamento vence no mês seguinte ao fechamento', () => {
    const c = card({ closingDay: 25, dueDay: 5 });
    expect(invoiceMonthFor(c, '2026-11-20')).toBe('2026-12');
    expect(invoiceMonthFor(c, '2026-11-26')).toBe('2027-01');
  });
  it('R$ 1.200 em 6x gera 6 parcelas de R$ 200 em meses consecutivos', () => {
    const inst = buildInstallments(expense(), card());
    expect(inst).toHaveLength(6);
    expect(inst.every((i) => i.amountCents === 20000)).toBe(true);
    expect(inst.map((i) => i.invoiceMonth)).toEqual(['2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05']);
  });
  it('centavos restantes vão para a primeira parcela', () => {
    const inst = buildInstallments(expense({ amountCents: 10000, installments: 3 }), card());
    expect(inst.map((i) => i.amountCents)).toEqual([3334, 3333, 3333]);
  });
  it('limite comprometido considera parcelas não pagas e libera ao pagar a fatura', () => {
    const d: FinanceData = { ...emptyData(), cards: [card()], expenses: [expense()] };
    d.installments = buildInstallments(d.expenses[0], d.cards[0]);
    expect(creditUsage(d, d.cards[0]).used).toBe(120000);
    d.invoicePayments = [{ id: 'p', createdAt: '', cardId: 'c1', month: '2026-12', amountCents: 20000, paidAt: '2026-12-10' }];
    expect(creditUsage(d, d.cards[0]).available).toBe(500000 - 100000);
  });
  it('compra no crédito não sai do dinheiro no mês da compra, só a parcela da fatura', () => {
    const d: FinanceData = { ...emptyData(), cards: [card()], expenses: [expense()] };
    d.installments = buildInstallments(d.expenses[0], d.cards[0]);
    expect(monthSummary(d, '2026-11', '2026-11-06').creditInvoices).toBe(0);
    expect(monthSummary(d, '2026-12', '2026-11-06').creditInvoices).toBe(20000);
  });
});

describe('benefícios', () => {
  it('compra com benefício reduz o saldo do cartão e não o dinheiro', () => {
    const d: FinanceData = {
      ...emptyData(),
      benefitEntries: [{ id: 'x', createdAt: '', cardId: 'f', date: '2026-11-01', amountCents: 100000, kind: 'recharge', note: '' }],
      expenses: [expense({ method: 'benefit', cardId: 'f', installments: 1, amountCents: 3000 })],
    };
    expect(benefitBalance(d, 'f')).toBe(97000);
    expect(monthSummary(d, '2026-11').cashSpent).toBe(0);
    expect(monthSummary(d, '2026-11').benefitSpent).toBe(3000);
  });
});

describe('recorrência das contas', () => {
  it('12 parcelas a partir de Nov/2026 terminam em Out/2027', () => {
    expect(billEndMonth({ startMonth: '2026-11', endMonth: null, installments: 12, frequency: 'monthly' })).toBe('2027-10');
  });
  it('conta já em andamento: parcela 47 de 48 em Nov/2026 termina em Dez/2026', () => {
    const b = bill({ installments: 48, installmentOffset: 46 });
    expect(billEndMonth(b)).toBe('2026-12');
    const d: FinanceData = {
      ...emptyData(),
      bills: [b],
      billVersions: [{ id: 'v', createdAt: '', billId: 'b1', fromMonth: '2026-11', amountCents: 66128, dueDay: 10 }],
    };
    expect(billLines(d, '2026-11')[0]).toMatchObject({ index: 47, total: 48 });
    expect(billLines(d, '2026-12')[0]).toMatchObject({ index: 48, total: 48 });
    expect(billLines(d, '2027-01')).toHaveLength(0);
    expect(billLines(d, '2026-10')).toHaveLength(0);
  });
  it('Nov/2026 a Abr/2027 = 6 parcelas', () => {
    expect(billCountBetween('2026-11', '2027-04', 'monthly')).toBe(6);
  });
  it('conta pausada não gera cobrança no período', () => {
    const d: FinanceData = {
      ...emptyData(),
      bills: [bill({ pauses: [{ from: '2027-01', to: '2027-02' }] })],
      billVersions: [{ id: 'v', createdAt: '', billId: 'b1', fromMonth: '2026-11', amountCents: 150000, dueDay: 5 }],
    };
    expect(billLines(d, '2026-12')).toHaveLength(1);
    expect(billLines(d, '2027-01')).toHaveLength(0);
    expect(billLines(d, '2027-03')).toHaveLength(1);
  });
  it('nova versão de valor vale do mês em diante, sem alterar meses anteriores', () => {
    const d: FinanceData = {
      ...emptyData(),
      bills: [bill()],
      billVersions: [
        { id: 'v1', createdAt: '', billId: 'b1', fromMonth: '2026-11', amountCents: 150000, dueDay: 5 },
        { id: 'v2', createdAt: '', billId: 'b1', fromMonth: '2027-01', amountCents: 160000, dueDay: 5 },
      ],
    };
    expect(billLines(d, '2026-12')[0].amountCents).toBe(150000);
    expect(billLines(d, '2027-02')[0].amountCents).toBe(160000);
  });
  it('conta fixa pendente entra no orçamento do mês', () => {
    const d: FinanceData = {
      ...emptyData(),
      bills: [bill()],
      billVersions: [{ id: 'v', createdAt: '', billId: 'b1', fromMonth: '2026-11', amountCents: 150000, dueDay: 5 }],
    };
    const s = monthSummary(d, '2026-11', '2026-11-01');
    expect(s.fixed).toBe(150000);
    expect(s.fixedPending).toBe(150000);
  });
});

describe('receitas', () => {
  const base = (): FinanceData => ({
    ...emptyData(),
    incomeSources: [{ id: 's', createdAt: '', name: 'Pagamento Igor', responsible: 'igor', sortOrder: 0, active: true }],
    incomes: [{ id: 'i1', createdAt: '', sourceId: 's', month: '2026-11', amountCents: 500000, receivedDate: null }],
  });
  it('mês seguinte repete o último valor como previsão', () => {
    const l = incomeLines(base(), '2026-12')[0];
    expect(l.amountCents).toBe(500000);
    expect(l.projected).toBe(true);
  });
  it('mês futuro com valor lançado e não recebido aparece como previsto', () => {
    const d = base();
    d.incomes.push({ id: 'i2', createdAt: '', sourceId: 's', month: '2026-12', amountCents: 550000, receivedDate: null });
    expect(incomeLines(d, '2026-12', '2026-11')[0].projected).toBe(true);
    expect(incomeLines(d, '2026-11', '2026-11')[0].projected).toBe(false);
    d.incomes[1].receivedDate = '2026-12-05';
    expect(incomeLines(d, '2026-12', '2026-11')[0].projected).toBe(false);
  });
  it('alterar dezembro não muda novembro e vira referência para os seguintes', () => {
    const d = base();
    d.incomes.push({ id: 'i2', createdAt: '', sourceId: 's', month: '2026-12', amountCents: 550000, receivedDate: null });
    expect(incomeLines(d, '2026-11')[0].amountCents).toBe(500000);
    expect(incomeLines(d, '2027-02')[0].amountCents).toBe(550000);
  });
  it('materializa meses passados para congelar o histórico', () => {
    const created = materializeIncomes(base(), '2027-01');
    expect(created.map((c) => c.month)).toEqual(['2026-12', '2027-01']);
  });
});

describe('integridade', () => {
  it('detecta lançamento duplicado', () => {
    const d: FinanceData = { ...emptyData(), expenses: [expense({ method: 'pix', cardId: null, installments: 1 })] };
    const dup = findDuplicate(d, { ...expense({ method: 'pix', cardId: null, installments: 1 }), id: 'novo' });
    expect(dup?.id).toBe('e1');
  });
});

describe('contas cobradas no cartão', () => {
  const base = (): FinanceData => ({
    ...emptyData(),
    cards: [card({ closingDay: 3, dueDay: 10 })],
    bills: [bill({ id: 'nf', name: 'Netflix', cardId: 'c1' })],
    billVersions: [{ id: 'v', createdAt: '', billId: 'nf', fromMonth: '2026-11', amountCents: 2000, dueDay: 10 }],
  });
  it('entram na fatura do mês e ocupam o limite, sem contar como compra', () => {
    const d = base();
    expect(cardBillLines(d, 'c1', '2026-11')).toHaveLength(1);
    expect(invoiceTotal(d, 'c1', '2026-11')).toBe(2000);
    // hoje 06/11 → fatura aberta é Dez: cobranças de Nov e Dez ocupam o limite; Jan ainda não
    const u = creditUsage(d, d.cards[0], '2026-11-06');
    expect(u.bills).toBe(4000);
    expect(u.purchases).toBe(0);
    // no orçamento a conta conta uma vez só (como conta fixa), nunca como fatura
    const s = monthSummary(d, '2026-11', '2026-11-06');
    expect(s.fixed).toBe(0);
    expect(s.creditInvoices).toBe(2000);
    expect(s.outflows).toBe(2000);
  });
  it('fatura paga libera o limite das contas daquele mês', () => {
    const d = base();
    d.invoicePayments = [{ id: 'p', createdAt: '', cardId: 'c1', month: '2026-11', amountCents: 2000, paidAt: '2026-11-10' }];
    expect(creditUsage(d, d.cards[0], '2026-11-06').bills).toBe(2000);
  });
  it('uso fora do app reduz o disponível', () => {
    const d = base();
    d.cards[0].externalUsedCents = 100000;
    const u = creditUsage(d, d.cards[0], '2026-11-06');
    expect(u.available).toBe(500000 - 100000 - 4000);
  });
});

describe('fatura quitada pela conta fixa', () => {
  // Cartão Carrefour: fecha dia 1, vence dia 8. Hoje 06/11 → fatura de Nov fechada, Dez aberta.
  const base = (paid: boolean): FinanceData => ({
    ...emptyData(),
    cards: [card({ closingDay: 1, dueDay: 8 })],
    bills: [bill({ id: 'cf', name: 'Cartão Carrefour', cardId: 'c1', endMonth: '2026-11' })],
    billVersions: [{ id: 'v', createdAt: '', billId: 'cf', fromMonth: '2026-11', amountCents: 99848, dueDay: 10 }],
    billOccurrences: paid ? [{ id: 'o', createdAt: '', billId: 'cf', month: '2026-11', amountCents: null, dueDay: null, paidAt: '2026-11-05', paidAmountCents: null, paidViaInvoice: false }] : [],
  });
  it('fatura pendente ocupa o limite e é a fatura que importa agora', () => {
    const d = base(false);
    expect(invoiceStatus(d, d.cards[0], '2026-11', '2026-11-06')).toBe('closed');
    expect(currentInvoiceMonth(d, d.cards[0], '2026-11-06')).toBe('2026-11');
    expect(creditUsage(d, d.cards[0], '2026-11-06').billsInstallments).toBe(99848);
  });
  it('conta paga em Contas quita a fatura e libera o limite', () => {
    const d = base(true);
    expect(invoicePaidInfo(d, d.cards[0], '2026-11')).toMatchObject({ paid: true, viaBills: true });
    expect(invoiceStatus(d, d.cards[0], '2026-11', '2026-11-06')).toBe('paid');
    expect(currentInvoiceMonth(d, d.cards[0], '2026-11-06')).toBe('2026-12');
    const u = creditUsage(d, d.cards[0], '2026-11-06');
    expect(u.bills + u.billsInstallments).toBe(0);
    expect(u.billsReleased).toBe(99848);
  });
});

describe('conta parcelada no cartão (Oficina 5x de R$ 254,50)', () => {
  // Carrefour: fecha dia 1, vence dia 8. Hoje 06/11 → fatura aberta é Dez. Parcelas Dez/26 a Abr/27.
  const base = (): FinanceData => ({
    ...emptyData(),
    cards: [card({ closingDay: 1, dueDay: 8, limitCents: 243000 })],
    bills: [bill({ id: 'of', name: 'Oficina', cardId: 'c1', startMonth: '2026-12', installments: 5, endMonth: '2027-04' })],
    billVersions: [{ id: 'v', createdAt: '', billId: 'of', fromMonth: '2026-12', amountCents: 25450, dueDay: 8 }],
  });
  it('compromete as 5 parcelas de uma vez', () => {
    const d = base();
    const u = creditUsage(d, d.cards[0], '2026-11-06');
    expect(u.billsInstallments).toBe(5 * 25450);
    expect(u.available).toBe(243000 - 5 * 25450);
  });
  it('libera uma parcela a cada fatura paga', () => {
    const d = base();
    d.invoicePayments = [{ id: 'p', createdAt: '', cardId: 'c1', month: '2026-12', amountCents: 25450, paidAt: '2026-12-08' }];
    expect(creditUsage(d, d.cards[0], '2026-12-09').billsInstallments).toBe(4 * 25450);
  });
  it('parcela marcada como paga em Contas também libera', () => {
    const d = base();
    d.billOccurrences = [{ id: 'o', createdAt: '', billId: 'of', month: '2026-12', amountCents: null, dueDay: null, paidAt: '2026-12-08', paidAmountCents: null, paidViaInvoice: false }];
    expect(creditUsage(d, d.cards[0], '2026-12-09').billsInstallments).toBe(4 * 25450);
  });
});

describe('previsão do próximo mês com contas no cartão', () => {
  it('conta parcelada no cartão aparece na fatura do cartão, não nas contas fixas', () => {
    const d: FinanceData = {
      ...emptyData(),
      cards: [card({ closingDay: 1, dueDay: 8 })],
      bills: [bill({ id: 'of', name: 'Oficina', cardId: 'c1', startMonth: '2026-12', installments: 5, endMonth: '2027-04' }), bill({ id: 'al', name: 'Aluguel' })],
      billVersions: [
        { id: 'v1', createdAt: '', billId: 'of', fromMonth: '2026-12', amountCents: 25450, dueDay: 8 },
        { id: 'v2', createdAt: '', billId: 'al', fromMonth: '2026-11', amountCents: 359000, dueDay: 10 },
      ],
    };
    const f = forecast(d, '2026-12', '2026-11-06');
    expect(f.termBills.map((l) => l.bill.name)).not.toContain('Oficina');
    expect(f.fixed).toBe(359000);
    expect(f.cards).toHaveLength(1);
    expect(f.cards[0].bills[0].bill.name).toBe('Oficina');
    expect(f.installments).toBe(25450);
    expect(f.commitments).toBe(359000 + 25450);
  });
});

describe('fatura da 1ª parcela escolhida', () => {
  it('sem escolha, segue a data e o fechamento', () => {
    expect(buildInstallments(expense(), card())[0].invoiceMonth).toBe('2026-12');
  });
  it('com escolha, as parcelas começam na fatura escolhida', () => {
    const inst = buildInstallments(expense({ firstInvoiceMonth: '2027-01', installments: 2, amountCents: 50900 }), card());
    expect(inst.map((i) => i.invoiceMonth)).toEqual(['2027-01', '2027-02']);
  });
  it('não aceita fatura anterior ao mês da compra', () => {
    expect(validateExpense({ ...expense(), firstInvoiceMonth: '2026-10' })).toMatch(/anterior/);
    expect(validateExpense({ ...expense(), firstInvoiceMonth: '2026-11' })).toBeNull();
  });
});


describe('reserva', () => {
  const entry = (amountCents: number, source: 'balance' | 'other', date = '2026-11-06') => ({ id: `r${amountCents}${source}`, createdAt: '', date, amountCents, source, note: '' });
  it('saldo da reserva soma entradas e saídas', () => {
    const d: FinanceData = { ...emptyData(), reserveEntries: [entry(641200, 'other'), entry(50000, 'balance'), entry(-20000, 'other')] };
    expect(reserveBalance(d)).toBe(671200);
  });
  it('só movimentos do saldo do mês mexem no saldo do mês', () => {
    const d: FinanceData = { ...emptyData(), reserveEntries: [entry(641200, 'other'), entry(50000, 'balance'), entry(-10000, 'balance'), entry(30000, 'balance', '2026-10-05')] };
    const s = monthSummary(d, '2026-11', '2026-11-06');
    expect(s.reserveIn).toBe(50000);
    expect(s.reserveOut).toBe(10000);
    expect(s.outflows).toBe(0);
    expect(s.balance).toBe(-40000);
  });
});
