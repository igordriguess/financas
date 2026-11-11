import type { Month } from '../lib/months';

export type Person = 'igor' | 'carol';
export const PEOPLE: Person[] = ['igor', 'carol'];
/** Responsável por uma despesa ou conta: uma pessoa ou o casal. Serve só para organização — tudo sai do orçamento conjunto. */
export type Responsible = Person | 'casal';
export const RESPONSIBLES: Responsible[] = ['igor', 'carol', 'casal'];
export const PERSON_LABEL: Record<Responsible, string> = { igor: 'Igor', carol: 'Carol', casal: 'Casal' };

export type PaymentMethod = 'pix' | 'credit' | 'debit' | 'cash' | 'benefit';
export const PAYMENT_METHODS: PaymentMethod[] = ['pix', 'credit', 'debit', 'cash', 'benefit'];
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix: 'Pix',
  credit: 'Cartão de crédito',
  debit: 'Débito',
  cash: 'Dinheiro',
  benefit: 'Benefício',
};
/** Meios que saem imediatamente do dinheiro disponível. */
export const CASH_METHODS: PaymentMethod[] = ['pix', 'debit', 'cash'];

export type Frequency = 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'yearly';
export const FREQUENCY_MONTHS: Record<Frequency, number> = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12 };
export const FREQUENCY_LABEL: Record<Frequency, string> = {
  monthly: 'Mensal',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  yearly: 'Anual',
};

interface Base {
  id: string;
  createdAt: string;
}

export interface Category extends Base {
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  archivedAt: string | null;
}

export type CardKind = 'credit' | 'benefit';
export interface Card extends Base {
  kind: CardKind;
  name: string;
  institution: string;
  owner: Person | null;
  /** Somente crédito: limite total. */
  limitCents: number;
  closingDay: number;
  dueDay: number;
  color: string;
  active: boolean;
  /** Remoção lógica: o histórico de despesas e parcelas é preservado. */
  deletedAt: string | null;
  /**
   * Somente crédito: limite já usado fora do app (compras anteriores ao app).
   * Calculado quando o usuário informa o "limite disponível" que aparece no banco.
   */
  externalUsedCents: number;
}

/** Movimentos de crédito em um cartão de benefício (recargas e ajustes manuais de saldo). */
export interface BenefitEntry extends Base {
  cardId: string;
  date: string;
  /** Positivo = entrada (recarga); negativo = ajuste para baixo. */
  amountCents: number;
  kind: 'recharge' | 'adjust';
  note: string;
}

export interface Expense extends Base {
  amountCents: number;
  description: string;
  categoryId: string;
  responsible: Responsible;
  date: string;
  method: PaymentMethod;
  cardId: string | null;
  /** Quantidade de parcelas (somente crédito; 1 = à vista). */
  installments: number;
  /**
   * Fatura da 1ª parcela escolhida manualmente (ex.: o banco lançou na fatura seguinte).
   * null = calculada pela data da compra e pelo fechamento do cartão.
   */
  firstInvoiceMonth: Month | null;
  updatedAt: string;
}

/** Parcela de uma compra no crédito, vinculada à compra original e à competência da fatura. */
export interface Installment extends Base {
  expenseId: string;
  cardId: string;
  number: number;
  total: number;
  amountCents: number;
  invoiceMonth: Month;
}

/** Pagamento de fatura: liquida um compromisso já registrado (não é nova despesa). */
export interface InvoicePayment extends Base {
  cardId: string;
  month: Month;
  amountCents: number;
  paidAt: string;
}

export interface IncomeSource extends Base {
  name: string;
  responsible: Person;
  sortOrder: number;
  active: boolean;
  /** Receita pontual (dinheiro extra): vale só neste mês e não é projetada para os seguintes. */
  oneOffMonth?: Month | null;
}

/** Valor de receita registrado para um mês específico — histórico imutável por mês. */
export interface Income extends Base {
  sourceId: string;
  month: Month;
  amountCents: number;
  receivedDate: string | null;
}

export interface BillPause {
  from: Month;
  to: Month | null;
}

export interface Bill extends Base {
  name: string;
  categoryId: string;
  responsible: Responsible;
  frequency: Frequency;
  startMonth: Month;
  /** null = recorrência sem data final. */
  endMonth: Month | null;
  /** Quantidade total de cobranças (ex.: 48), quando definida. */
  installments: number | null;
  /** Cobranças já pagas antes do mês de início (ex.: começa na parcela 47 → 46). */
  installmentOffset: number;
  /** Cartão de crédito em que a conta é cobrada (null = sai do dinheiro: boleto, Pix, débito). */
  cardId: string | null;
  pauses: BillPause[];
  archivedAt: string | null;
}

/** Valor/vencimento vigente a partir de um mês (alterações "deste mês em diante"). */
export interface BillVersion extends Base {
  billId: string;
  fromMonth: Month;
  amountCents: number;
  dueDay: number;
}

/** Registro do mês de uma conta: pagamento e ajustes que valem só para aquele mês. */
export interface BillOccurrence extends Base {
  billId: string;
  month: Month;
  amountCents: number | null;
  dueDay: number | null;
  paidAt: string | null;
  /** Valor efetivamente pago (congelado ao pagar: editar a conta depois não muda um mês já pago). */
  paidAmountCents: number | null;
  /** true quando a quitação veio do "Pagar fatura" do cartão (desfazer a fatura só desfaz estas). */
  paidViaInvoice: boolean;
}

/**
 * Movimento da Reserva (dinheiro guardado). Positivo = guardou; negativo = retirou.
 * source 'balance': saiu do (ou voltou para o) saldo do mês; 'other': veio de/foi para outra fonte.
 */
export type ReserveSource = 'balance' | 'other';
export interface ReserveEntry extends Base {
  date: string;
  amountCents: number;
  source: ReserveSource;
  note: string;
}

export interface FinanceData {
  categories: Category[];
  cards: Card[];
  benefitEntries: BenefitEntry[];
  expenses: Expense[];
  installments: Installment[];
  invoicePayments: InvoicePayment[];
  incomeSources: IncomeSource[];
  incomes: Income[];
  bills: Bill[];
  billVersions: BillVersion[];
  billOccurrences: BillOccurrence[];
  reserveEntries: ReserveEntry[];
}

export type TableName = keyof FinanceData;
export const TABLES: TableName[] = [
  'categories',
  'cards',
  'benefitEntries',
  'expenses',
  'installments',
  'invoicePayments',
  'incomeSources',
  'incomes',
  'bills',
  'billVersions',
  'billOccurrences',
  'reserveEntries',
];

export const emptyData = (): FinanceData => ({
  categories: [],
  cards: [],
  benefitEntries: [],
  expenses: [],
  installments: [],
  invoicePayments: [],
  incomeSources: [],
  incomes: [],
  bills: [],
  billVersions: [],
  billOccurrences: [],
  reserveEntries: [],
});
