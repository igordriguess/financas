import { create } from 'zustand';
import type { RealtimeChannel, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { DemoRepository, SupabaseRepository, tableName, type Repository, type Row } from '../data/repository';
import { demoData, initialData } from '../data/seed';
import { uid, nowISO } from '../lib/id';
import { addMonths, currentMonth, monthLabel, monthRange, todayISO, type Month } from '../lib/months';
import {
  benefitBalance,
  billEndMonth,
  billLine,
  buildInstallments,
  cardBillLines,
  creditUsage,
  expenseLocked,
  findDuplicate,
  materializeIncomes,
  reserveBalance,
  validateExpense,
} from '../domain/finance';
import {
  TABLES,
  type Bill,
  type BillOccurrence,
  type BillVersion,
  type Card,
  type Category,
  type Expense,
  type FinanceData,
  type Income,
  type IncomeSource,
  type Person,
  type ReserveEntry,
  type ReserveSource,
  type TableName,
} from '../domain/types';

/* ───────────────────────────── Tipos de UI ───────────────────────────── */

export interface Toast {
  id: string;
  kind: 'success' | 'error' | 'info';
  text: string;
}
export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}
export interface Member {
  userId: string;
  person: Person;
  displayName: string;
  email: string | null;
  role: 'owner' | 'member';
}
export interface Me {
  userId: string | null;
  person: Person;
  displayName: string;
  email: string | null;
  role: 'owner' | 'member';
}
export type Status = 'loading' | 'auth' | 'onboarding' | 'ready' | 'error';

export type ExpenseInput = Omit<Expense, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };
export type BillInput = Omit<Bill, 'id' | 'createdAt' | 'pauses' | 'archivedAt' | 'installmentOffset' | 'cardId'> & { amountCents: number; dueDay: number; installmentOffset?: number; cardId?: string | null };

interface Changes {
  upsert?: Partial<Record<TableName, Row[]>>;
  remove?: Partial<Record<TableName, string[]>>;
  /** Inseridos só se ainda não existirem (pela chave natural) — nunca sobrescrevem o outro celular. */
  insertOnly?: Partial<Record<TableName, Row[]>>;
  /** Apaga antes de gravar (necessário ao regerar parcelas com a mesma chave compra+número). */
  removeFirst?: boolean;
}

interface State {
  status: Status;
  error: string | null;
  mode: 'demo' | 'supabase';
  data: FinanceData;
  month: Month;
  me: Me;
  members: Member[];
  household: { id: string; name: string; inviteCode: string } | null;
  syncing: number;

  toasts: Toast[];
  confirmReq: ConfirmRequest | null;
  expenseSheet: { open: boolean; editId: string | null; presetCardId?: string | null };

  // ciclo de vida
  init(): Promise<void>;
  /** Busca os dados mais recentes; retorna false se falhar (o erro já é exibido). */
  reload(): Promise<boolean>;
  signOut(): Promise<void>;
  createHousehold(person: Person, displayName: string): Promise<void>;
  joinHousehold(code: string, person: Person, displayName: string): Promise<void>;
  rotateInvite(): Promise<void>;
  removeMember(userId: string): Promise<void>;
  updateMyProfile(displayName: string): Promise<void>;
  setDemoPerson(p: Person): void;
  resetDemo(): Promise<void>;

  // UI
  setMonth(m: Month): void;
  toast(text: string, kind?: Toast['kind']): void;
  dismissToast(id: string): void;
  confirm(req: Omit<ConfirmRequest, 'resolve'>): Promise<boolean>;
  /** Abre o "Adicionar gasto". Com presetCardId, já vem em crédito nesse cartão. */
  openExpense(editId?: string | null, presetCardId?: string | null): void;
  closeExpense(): void;

  // despesas
  saveExpense(input: ExpenseInput, opts?: { allowDuplicate?: boolean }): Promise<{ ok: boolean; error?: string; duplicate?: Expense }>;
  deleteExpense(id: string): Promise<void>;

  // categorias
  saveCategory(c: Partial<Category> & { name: string; icon: string; color: string }): Promise<void>;
  deleteCategory(id: string, reassignTo?: string): Promise<void>;

  // cartões
  saveCard(c: Partial<Card> & Pick<Card, 'kind' | 'name'>): Promise<Card>;
  removeCard(id: string): Promise<void>;
  setBenefitBalance(cardId: string, targetCents: number, note?: string): Promise<void>;
  addBenefitRecharge(cardId: string, amountCents: number, date: string, note?: string): Promise<void>;
  /** Movimento da reserva: kind 'in' guarda, 'out' retira. source diz se mexe no saldo do mês. */
  addReserveEntry(input: { kind: 'in' | 'out'; amountCents: number; date: string; source: ReserveSource; note: string }): Promise<void>;
  deleteReserveEntry(id: string): Promise<void>;
  payInvoice(cardId: string, month: Month, amountCents: number, paidAt: string): Promise<void>;
  setCardAvailable(cardId: string, availableCents: number): Promise<void>;
  /** Recalcula o disponível só com o que está lançado no app (zera o uso fora do app). */
  recalcCardAvailable(cardId: string): Promise<void>;
  setBillsCard(billIds: string[], cardId: string | null): Promise<void>;
  unpayInvoice(cardId: string, month: Month): Promise<void>;

  // receitas
  saveIncomeSource(s: Partial<IncomeSource> & { name: string; responsible: Person }): Promise<void>;
  removeIncomeSource(id: string): Promise<void>;
  /** Apaga a receita e todos os valores registrados dela (inclusive meses passados). */
  deleteIncomeSource(id: string): Promise<void>;
  setIncome(sourceId: string, month: Month, amountCents: number, receivedDate: string | null): Promise<void>;
  /** Receita pontual (dinheiro extra): entra só no mês informado. */
  addOneOffIncome(i: { name: string; responsible: Person; month: Month; amountCents: number; receivedDate: string | null }): Promise<void>;

  // contas fixas
  createBill(b: BillInput): Promise<void>;
  updateBill(billId: string, month: Month, scope: 'month' | 'forward', patch: { amountCents: number; dueDay: number }): Promise<void>;
  updateBillInfo(billId: string, patch: Partial<Pick<Bill, 'name' | 'categoryId' | 'responsible' | 'endMonth' | 'installments' | 'installmentOffset' | 'frequency' | 'cardId'>>): Promise<void>;
  setBillPaid(billId: string, month: Month, paid: boolean, paidAmountCents?: number | null): Promise<void>;
  pauseBill(billId: string, from: Month): Promise<void>;
  resumeBill(billId: string, at: Month): Promise<void>;
  endBill(billId: string, lastMonth: Month): Promise<void>;
  /** Sem purge, contas com histórico são encerradas e arquivadas. Com purge, somem por completo. */
  deleteBill(billId: string, opts?: { purge?: boolean }): Promise<void>;
  /** Converte uma conta cobrada no cartão em gasto variável (compra parcelada) nas mesmas faturas. */
  convertBillToExpense(billId: string): Promise<boolean>;
}

/* ───────────────────────────── Infra ───────────────────────────── */

let repo: Repository | null = null;
let queue: Promise<void> = Promise.resolve();
let channel: RealtimeChannel | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
/** Conta as alterações locais: um carregamento iniciado antes de uma alteração é descartado. */
let mutationSeq = 0;
/** Atualização pedida (ex.: pelo outro celular) enquanto havia gravação em andamento. */
let pendingReload = false;
let channelHousehold: string | null = null;
let bootedUserId: string | null = null;
let loading: Promise<void> | null = null;
let lastLoadAt = 0;

/* ─────────── Cache local: abre na hora e mantém o app usável sem rede ─────────── */
const CACHE_PREFIX = 'fic-cache-v1:';
interface Snapshot {
  me: Me;
  members: Member[];
  household: { id: string; name: string; inviteCode: string };
  data: FinanceData;
  savedAt: number;
}
function readCache(userId: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + userId);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}
function writeCache(userId: string, snap: Snapshot) {
  try {
    localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(snap));
  } catch {
    /* armazenamento cheio ou bloqueado: segue sem cache */
  }
}
function clearCaches() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(CACHE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/* ─────────── Estado de navegação que sobrevive ao recarregamento da aba ─────────── */
const MONTH_KEY = 'fic-month';
const SHEET_KEY = 'fic-expense-sheet';
function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeSession(key: string, value: unknown) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

const DEMO_PERSON_KEY = 'fic-demo-person';
const readDemoPerson = (): Person => {
  try {
    return localStorage.getItem(DEMO_PERSON_KEY) === 'carol' ? 'carol' : 'igor';
  } catch {
    return 'igor';
  }
};
const demoMe = (p: Person): Me => ({ userId: null, person: p, displayName: p === 'igor' ? 'Igor' : 'Carol', email: null, role: 'owner' });

const errMsg = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e));

function applyChanges(d: FinanceData, ch: Changes): FinanceData {
  const next = { ...d } as unknown as Record<TableName, Row[]>;
  for (const t of TABLES) {
    const ups = ch.upsert?.[t];
    const rems = ch.remove?.[t];
    if (!ups?.length && !rems?.length) continue;
    let list = [...next[t]];
    if (rems?.length) {
      const s = new Set(rems);
      list = list.filter((r) => !s.has(r.id));
    }
    for (const r of ups ?? []) {
      const i = list.findIndex((x) => x.id === r.id);
      if (i >= 0) list[i] = r;
      else list.push(r);
    }
    next[t] = list;
  }
  return next as unknown as FinanceData;
}

const rows = <T extends { id: string }>(xs: T[]) => xs as unknown as Row[];

export const useStore = create<State>((set, get) => {
  /** Aplica a mudança na tela imediatamente e persiste em ordem (respeitando dependências). */
  async function commit(ch: Changes, successMsg?: string) {
    mutationSeq++;
    const local: Changes = { ...ch, upsert: { ...ch.upsert } };
    for (const t of TABLES) if (ch.insertOnly?.[t]?.length) local.upsert![t] = [...(ch.insertOnly[t] ?? []), ...(ch.upsert?.[t] ?? [])];
    set((s) => ({ data: applyChanges(s.data, local), syncing: s.syncing + 1 }));
    const job = queue.then(async () => {
      const r = repo!;
      const removes = async () => {
        for (const t of [...TABLES].reverse()) if (ch.remove?.[t]?.length) await r.remove(t, ch.remove[t]!);
      };
      if (ch.removeFirst) await removes();
      for (const t of TABLES) if (ch.insertOnly?.[t]?.length) await r.upsert(t, ch.insertOnly[t]!, { ignoreDuplicates: true });
      for (const t of TABLES) if (ch.upsert?.[t]?.length) await r.upsert(t, ch.upsert[t]!);
      if (!ch.removeFirst) await removes();
    });
    queue = job.catch(() => undefined);
    try {
      await job;
      if (successMsg) get().toast(successMsg, 'success');
    } catch (e) {
      get().toast(`Não foi possível salvar: ${errMsg(e)}`, 'error');
      await get().reload();
      throw e;
    } finally {
      set((s) => ({ syncing: s.syncing - 1 }));
      if (get().syncing === 0 && pendingReload) {
        pendingReload = false;
        void get().reload();
      }
    }
  }

  /** Carregamento único em andamento: chamadas simultâneas reaproveitam a mesma promessa. */
  function loadData(): Promise<void> {
    if (!loading) loading = doLoad().finally(() => (loading = null));
    return loading;
  }

  async function doLoad() {
    const r = repo!;
    const seq = mutationSeq;
    const data = await r.load();
    if (repo !== r) return; // sessão trocou durante o carregamento
    // Houve alteração local durante o carregamento: estes dados já estão velhos — busca de novo depois.
    if (seq !== mutationSeq || get().syncing > 0) {
      pendingReload = true;
      if (get().syncing === 0) {
        pendingReload = false;
        return doLoad();
      }
      return;
    }
    let d = data;
    // Ambiente recém-criado: cadastra categorias, cartões e receitas iniciais.
    if (repo!.mode === 'supabase' && !d.categories.length && !d.cards.length && !d.incomeSources.length) {
      const seed = initialData();
      for (const t of TABLES) if ((seed[t] as unknown[]).length) await repo!.upsert(t, seed[t] as unknown as Row[]);
      d = seed;
    }
    // Congela receitas dos meses já iniciados (histórico imutável).
    const created = materializeIncomes(d, currentMonth());
    if (created.length) {
      // O outro celular pode ter criado o mesmo mês ao mesmo tempo: insere só o que falta e relê.
      await r.upsert('incomes', rows(created), { ignoreDuplicates: true });
      d = r.mode === 'supabase' ? { ...d, incomes: (await r.load()).incomes } : { ...d, incomes: [...d.incomes, ...created] };
    }
    lastLoadAt = Date.now();
    set({ data: d, status: 'ready', error: null });
    const s = get();
    if (r.mode === 'supabase' && s.me.userId && s.household) {
      writeCache(s.me.userId, { me: s.me, members: s.members, household: s.household, data: d, savedAt: lastLoadAt });
    }
  }

  function subscribeRealtime(householdId: string) {
    if (!supabase || channelHousehold === householdId) return;
    channelHousehold = householdId;
    channel?.unsubscribe();
    channel = supabase.channel(`hh-${householdId}`);
    const onRemote = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        if (get().syncing === 0) void get().reload();
        else pendingReload = true;
      }, 800);
    };
    for (const t of TABLES) {
      // Inclusões e alterações do ambiente (filtradas pelo household).
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: tableName(t), filter: `household_id=eq.${householdId}` }, onRemote);
      channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: tableName(t), filter: `household_id=eq.${householdId}` }, onRemote);
      // Exclusões: o Supabase não entrega DELETE em assinatura filtrada — escuta sem filtro e relê os dados.
      channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: tableName(t) }, onRemote);
    }
    channel.subscribe();
  }

  /** Busca vínculo, ambiente e dados no servidor. Sem `silent`, mostra a tela de carregamento. */
  async function fetchSession(session: Session, silent: boolean) {
    const sb = supabase!;
    if (!silent) set({ status: 'loading' });
    const { data: mem, error } = await sb.from('household_members').select('*').eq('user_id', session.user.id).maybeSingle();
    if (error) throw error;
    if (!mem) {
      clearCaches();
      repo = null;
      set({ status: 'onboarding', me: { userId: session.user.id, person: 'igor', displayName: '', email: session.user.email ?? null, role: 'member' } });
      return;
    }
    const [{ data: hh }, { data: allMembers }] = await Promise.all([
      sb.from('households').select('*').eq('id', mem.household_id).single(),
      sb.from('household_members').select('*').eq('household_id', mem.household_id),
    ]);
    set({
      me: { userId: session.user.id, person: mem.person, displayName: mem.display_name, email: mem.email, role: mem.role },
      household: hh ? { id: hh.id, name: hh.name, inviteCode: hh.invite_code } : null,
      members: (allMembers ?? []).map((m) => ({ userId: m.user_id, person: m.person, displayName: m.display_name, email: m.email, role: m.role })),
    });
    if (!repo || channelHousehold !== mem.household_id) repo = new SupabaseRepository(sb, mem.household_id);
    await loadData();
    subscribeRealtime(mem.household_id);
  }

  async function bootSession(session: Session | null) {
    if (!supabase) return;
    if (!session) {
      channel?.unsubscribe();
      channel = null;
      channelHousehold = null;
      repo = null;
      bootedUserId = null;
      clearCaches();
      set({ status: 'auth', household: null, members: [] });
      return;
    }
    // O Supabase dispara SIGNED_IN de novo ao voltar para a aba: mesma pessoa = nada a refazer.
    const st = get().status;
    if (bootedUserId === session.user.id && (st === 'ready' || st === 'loading' || st === 'onboarding')) return;
    bootedUserId = session.user.id;

    // Abre instantaneamente com os últimos dados salvos e atualiza em segundo plano.
    const cache = readCache(session.user.id);
    if (cache) {
      repo = new SupabaseRepository(supabase, cache.household.id);
      set({ me: cache.me, members: cache.members, household: cache.household, data: cache.data, status: 'ready', error: null });
      subscribeRealtime(cache.household.id);
    }
    try {
      await fetchSession(session, !!cache);
    } catch (e) {
      if (cache) get().toast('Sem conexão — exibindo os últimos dados salvos', 'info');
      else set({ status: 'error', error: errMsg(e) });
    }
  }

  return {
    status: 'loading',
    error: null,
    mode: isSupabaseConfigured ? 'supabase' : 'demo',
    data: { categories: [], cards: [], benefitEntries: [], expenses: [], installments: [], invoicePayments: [], incomeSources: [], incomes: [], bills: [], billVersions: [], billOccurrences: [], reserveEntries: [] },
    month: readSession<Month>(MONTH_KEY, currentMonth()),
    me: demoMe(readDemoPerson()),
    members: [],
    household: null,
    syncing: 0,
    toasts: [],
    confirmReq: null,
    expenseSheet: readSession(SHEET_KEY, { open: false, editId: null as string | null }),

    async init() {
      try {
        if (!supabase) {
          repo = new DemoRepository(demoData);
          const p = readDemoPerson();
          set({ me: demoMe(p), members: [demoMe('igor'), demoMe('carol')].map((m) => ({ ...m, userId: m.person })) as Member[] });
          await loadData();
          return;
        }
        const { data } = await supabase.auth.getSession();
        await bootSession(data.session);
        supabase.auth.onAuthStateChange((event, session) => {
          // TOKEN_REFRESHED / INITIAL_SESSION não exigem nada; SIGNED_IN repetido é ignorado em bootSession.
          if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTimeout(() => void bootSession(session), 0);
        });
      } catch (e) {
        set({ status: 'error', error: errMsg(e) });
      } finally {
        // Ao voltar para o app depois de um tempo, atualiza em silêncio (sem tela de carregamento).
        document.addEventListener('visibilitychange', () => {
          const s = get();
          if (document.visibilityState === 'visible' && s.status === 'ready' && s.syncing === 0 && Date.now() - lastLoadAt > 60_000) void s.reload();
        });
      }
    },
    async reload() {
      if (!repo) return false;
      try {
        await loadData();
        return true;
      } catch (e) {
        get().toast(`Falha ao atualizar: ${errMsg(e)}`, 'error');
        return false;
      }
    },
    async signOut() {
      clearCaches();
      if (supabase) await supabase.auth.signOut();
    },
    async createHousehold(person, displayName) {
      const { error } = await supabase!.rpc('create_household', { p_person: person, p_display_name: displayName });
      if (error) throw new Error(error.message);
      const { data } = await supabase!.auth.getSession();
      if (data.session) await fetchSession(data.session, false);
    },
    async joinHousehold(code, person, displayName) {
      const { error } = await supabase!.rpc('join_household', { p_code: code, p_person: person, p_display_name: displayName });
      if (error) throw new Error(error.message);
      const { data } = await supabase!.auth.getSession();
      if (data.session) await fetchSession(data.session, false);
    },
    async rotateInvite() {
      const { data, error } = await supabase!.rpc('rotate_invite_code');
      if (error) return get().toast(error.message, 'error');
      set((s) => ({ household: s.household ? { ...s.household, inviteCode: data as string } : null }));
      get().toast('Novo código de convite gerado', 'success');
    },
    async removeMember(userId) {
      const { error } = await supabase!.rpc('remove_member', { p_user: userId });
      if (error) return get().toast(error.message, 'error');
      set((s) => ({ members: s.members.filter((m) => m.userId !== userId) }));
      get().toast('Membro removido', 'success');
    },
    async updateMyProfile(displayName) {
      const me = get().me;
      if (!supabase || !me.userId) {
        set({ me: { ...me, displayName } });
        return;
      }
      const { error } = await supabase.from('household_members').update({ display_name: displayName }).eq('user_id', me.userId);
      if (error) return get().toast(error.message, 'error');
      set((s) => ({ me: { ...s.me, displayName }, members: s.members.map((m) => (m.userId === me.userId ? { ...m, displayName } : m)) }));
      get().toast('Perfil atualizado', 'success');
    },
    setDemoPerson(p) {
      try {
        localStorage.setItem(DEMO_PERSON_KEY, p);
      } catch {
        /* ignore */
      }
      set({ me: demoMe(p) });
    },
    async resetDemo() {
      DemoRepository.reset();
      await get().reload();
      get().toast('Dados de demonstração restaurados', 'success');
    },

    /* ─────────── UI ─────────── */
    setMonth: (m) => {
      writeSession(MONTH_KEY, m);
      set({ month: m });
    },
    toast(text, kind = 'info') {
      const id = uid();
      set((s) => ({ toasts: [...s.toasts.slice(-2), { id, kind, text }] }));
      setTimeout(() => get().dismissToast(id), kind === 'error' ? 5000 : 2600);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    confirm(req) {
      return new Promise<boolean>((resolve) => set({ confirmReq: { ...req, resolve: (ok) => (set({ confirmReq: null }), resolve(ok)) } }));
    },
    openExpense: (editId = null, presetCardId = null) => {
      writeSession(SHEET_KEY, { open: true, editId, presetCardId });
      set({ expenseSheet: { open: true, editId, presetCardId } });
    },
    closeExpense: () => {
      writeSession(SHEET_KEY, null);
      writeSession(EXPENSE_DRAFT_KEY, null);
      set({ expenseSheet: { open: false, editId: null } });
    },

    /* ─────────── Despesas ─────────── */
    async saveExpense(input, opts = {}) {
      const d = get().data;
      const clean: ExpenseInput = {
        ...input,
        description: input.description.trim(),
        cardId: input.method === 'credit' || input.method === 'benefit' ? input.cardId : null,
        installments: input.method === 'credit' ? input.installments : 1,
        firstInvoiceMonth: input.method === 'credit' ? input.firstInvoiceMonth ?? null : null,
      };
      const err = validateExpense(clean);
      if (err) return { ok: false, error: err };
      const card = clean.cardId ? d.cards.find((c) => c.id === clean.cardId) : null;
      if (clean.cardId && !card) return { ok: false, error: 'Cartão não encontrado.' };
      if (clean.method === 'credit' && card?.kind !== 'credit') return { ok: false, error: 'Selecione um cartão de crédito.' };
      if (clean.method === 'benefit' && card?.kind !== 'benefit') return { ok: false, error: 'Selecione um cartão de benefício.' };

      const prev = clean.id ? d.expenses.find((e) => e.id === clean.id) : null;
      // Compras no crédito: no máximo 12x (só uma compra antiga convertida, sem mudar as parcelas, pode ter mais).
      if (clean.method === 'credit' && clean.installments > 12 && (!prev || prev.installments !== clean.installments)) return { ok: false, error: 'Parcelas devem estar entre 1x e 12x.' };
      if (prev && expenseLocked(d, prev.id)) {
        const financialChange =
          prev.amountCents !== clean.amountCents ||
          prev.cardId !== clean.cardId ||
          prev.installments !== clean.installments ||
          prev.method !== clean.method ||
          prev.date !== clean.date ||
          (prev.firstInvoiceMonth ?? null) !== (clean.firstInvoiceMonth ?? null);
        if (financialChange) return { ok: false, error: 'Esta compra tem parcela em fatura já paga. Só é possível alterar descrição, categoria e responsável.' };
      }
      if (!opts.allowDuplicate) {
        const dup = findDuplicate(d, clean);
        if (dup) return { ok: false, duplicate: dup };
      }

      const now = nowISO();
      const exp: Expense = { ...clean, id: prev?.id ?? uid(), createdAt: prev?.createdAt ?? now, updatedAt: now } as Expense;
      const oldInst = d.installments.filter((i) => i.expenseId === exp.id);
      const regen =
        !prev ||
        prev.amountCents !== exp.amountCents ||
        prev.cardId !== exp.cardId ||
        prev.installments !== exp.installments ||
        prev.method !== exp.method ||
        prev.date !== exp.date ||
        (prev.firstInvoiceMonth ?? null) !== (exp.firstInvoiceMonth ?? null);
      const newInst = regen && exp.method === 'credit' && card ? buildInstallments(exp, card) : [];
      await commit(
        {
          upsert: { expenses: rows([exp]), installments: rows(newInst) },
          remove: { installments: regen ? oldInst.map((i) => i.id) : [] },
          removeFirst: regen,
        },
        prev ? 'Gasto atualizado' : 'Gasto adicionado',
      );
      return { ok: true };
    },
    async deleteExpense(id) {
      const d = get().data;
      if (expenseLocked(d, id)) {
        const ok = await get().confirm({
          title: 'Compra com fatura paga',
          message: 'Uma ou mais parcelas desta compra estão em faturas já pagas. Excluir vai alterar o histórico dessas faturas. Deseja continuar?',
          confirmText: 'Excluir mesmo assim',
          danger: true,
        });
        if (!ok) return;
      }
      await commit({ remove: { expenses: [id], installments: d.installments.filter((i) => i.expenseId === id).map((i) => i.id) } }, 'Gasto excluído');
    },

    /* ─────────── Categorias ─────────── */
    async saveCategory(c) {
      const d = get().data;
      const name = c.name.trim();
      if (!name) return get().toast('Informe um nome para a categoria', 'error');
      if (d.categories.some((x) => x.id !== c.id && !x.archivedAt && x.name.toLowerCase() === name.toLowerCase())) return get().toast('Já existe uma categoria com esse nome', 'error');
      const prev = c.id ? d.categories.find((x) => x.id === c.id) : null;
      const cat: Category = {
        id: prev?.id ?? uid(),
        createdAt: prev?.createdAt ?? nowISO(),
        name,
        icon: c.icon,
        color: c.color,
        sortOrder: prev?.sortOrder ?? d.categories.length,
        archivedAt: prev?.archivedAt ?? null,
      };
      await commit({ upsert: { categories: rows([cat]) } }, prev ? 'Categoria atualizada' : 'Categoria criada');
    },
    async deleteCategory(id, reassignTo) {
      const d = get().data;
      const exps = d.expenses.filter((e) => e.categoryId === id);
      const bills = d.bills.filter((b) => b.categoryId === id);
      if ((exps.length || bills.length) && !reassignTo) return get().toast('Escolha para qual categoria mover os lançamentos', 'error');
      await commit(
        {
          upsert: {
            expenses: rows(exps.map((e) => ({ ...e, categoryId: reassignTo!, updatedAt: nowISO() }))),
            bills: rows(bills.map((b) => ({ ...b, categoryId: reassignTo! }))),
          },
          remove: { categories: [id] },
        },
        exps.length || bills.length ? `Categoria removida e ${exps.length + bills.length} lançamento(s) reclassificado(s)` : 'Categoria removida',
      );
    },

    /* ─────────── Cartões ─────────── */
    async saveCard(c) {
      const d = get().data;
      const prev = c.id ? d.cards.find((x) => x.id === c.id) : null;
      const card: Card = {
        id: prev?.id ?? uid(),
        createdAt: prev?.createdAt ?? nowISO(),
        kind: c.kind,
        name: c.name.trim(),
        institution: (c.institution ?? prev?.institution ?? '').trim(),
        owner: 'owner' in c ? c.owner ?? null : prev?.owner ?? null,
        limitCents: c.limitCents ?? prev?.limitCents ?? 0,
        closingDay: c.closingDay ?? prev?.closingDay ?? 1,
        dueDay: c.dueDay ?? prev?.dueDay ?? 10,
        color: c.color ?? prev?.color ?? '#2f6bf0',
        active: c.active ?? prev?.active ?? true,
        deletedAt: prev?.deletedAt ?? null,
        externalUsedCents: c.externalUsedCents ?? prev?.externalUsedCents ?? 0,
      };
      if (!card.name) {
        get().toast('Informe o nome do cartão', 'error');
        throw new Error('nome');
      }
      // Mudança de fechamento/vencimento recalcula apenas parcelas em faturas ainda não pagas.
      const ups: Changes = { upsert: { cards: rows([card]) } };
      if (prev && card.kind === 'credit' && (prev.closingDay !== card.closingDay || prev.dueDay !== card.dueDay)) {
        const paid = new Set(d.invoicePayments.filter((p) => p.cardId === card.id).map((p) => p.month));
        const affected = d.expenses.filter((e) => e.cardId === card.id && e.method === 'credit' && !expenseLocked(d, e.id));
        const removeIds: string[] = [];
        const newInst = [];
        for (const e of affected) {
          const old = d.installments.filter((i) => i.expenseId === e.id);
          if (old.some((i) => paid.has(i.invoiceMonth))) continue;
          removeIds.push(...old.map((i) => i.id));
          newInst.push(...buildInstallments(e, card));
        }
        ups.upsert!.installments = rows(newInst);
        ups.remove = { installments: removeIds };
        ups.removeFirst = true;
      }
      await commit(ups, prev ? 'Cartão atualizado' : 'Cartão adicionado');
      return card;
    },
    async removeCard(id) {
      const d = get().data;
      const card = d.cards.find((c) => c.id === id);
      if (!card) return;
      await commit({ upsert: { cards: rows([{ ...card, active: false, deletedAt: nowISO() }]) } }, 'Cartão removido — histórico preservado');
    },
    async setBenefitBalance(cardId, targetCents, note) {
      const delta = targetCents - benefitBalance(get().data, cardId);
      if (delta === 0) return get().toast('O saldo já está nesse valor', 'info');
      await commit(
        { upsert: { benefitEntries: rows([{ id: uid(), createdAt: nowISO(), cardId, date: todayISO(), amountCents: delta, kind: 'adjust', note: note?.trim() || 'Ajuste manual de saldo' }]) } },
        'Saldo atualizado',
      );
    },
    async addBenefitRecharge(cardId, amountCents, date, note) {
      if (amountCents <= 0) return get().toast('Informe um valor maior que zero', 'error');
      await commit({ upsert: { benefitEntries: rows([{ id: uid(), createdAt: nowISO(), cardId, date, amountCents, kind: 'recharge', note: note?.trim() || 'Recarga' }]) } }, 'Recarga registrada');
    },
    async addReserveEntry({ kind, amountCents, date, source, note }) {
      if (amountCents <= 0) return get().toast('Informe um valor maior que zero', 'error');
      if (kind === 'out' && amountCents > reserveBalance(get().data)) return get().toast('O valor é maior que o saldo da reserva', 'error');
      const entry: ReserveEntry = { id: uid(), createdAt: nowISO(), date, amountCents: kind === 'in' ? amountCents : -amountCents, source, note: note.trim() };
      await commit({ upsert: { reserveEntries: rows([entry]) } }, kind === 'in' ? 'Valor guardado na reserva' : 'Valor retirado da reserva');
    },
    async deleteReserveEntry(id) {
      await commit({ remove: { reserveEntries: [id] } }, 'Movimento excluído');
    },
    async payInvoice(cardId, month, amountCents, paidAt) {
      const d = get().data;
      if (d.invoicePayments.some((p) => p.cardId === cardId && p.month === month)) return get().toast('Esta fatura já está paga', 'info');
      // As contas fixas cobradas neste cartão ficam pagas junto com a fatura.
      const occ = cardBillLines(d, cardId, month)
        .filter((l) => !l.paid)
        .map(
          (l): BillOccurrence =>
            l.occurrence
              ? { ...l.occurrence, paidAt, paidAmountCents: l.amountCents, paidViaInvoice: true }
              : { id: uid(), createdAt: nowISO(), billId: l.bill.id, month, amountCents: null, dueDay: null, paidAt, paidAmountCents: l.amountCents, paidViaInvoice: true },
        );
      await commit(
        { upsert: { invoicePayments: rows([{ id: uid(), createdAt: nowISO(), cardId, month, amountCents, paidAt }]), billOccurrences: rows(occ) } },
        occ.length ? `Fatura paga — ${occ.length} conta(s) do cartão marcada(s) como paga(s)` : 'Fatura marcada como paga',
      );
    },
    async unpayInvoice(cardId, month) {
      const d = get().data;
      const p = d.invoicePayments.find((x) => x.cardId === cardId && x.month === month);
      if (!p) return;
      const occ = cardBillLines(d, cardId, month)
        .filter((l) => l.occurrence?.paidViaInvoice)
        .map((l) => ({ ...l.occurrence!, paidAt: null, paidAmountCents: null, paidViaInvoice: false }));
      await commit({ upsert: { billOccurrences: rows(occ) }, remove: { invoicePayments: [p.id] } }, 'Pagamento da fatura desfeito');
    },
    async setCardAvailable(cardId, availableCents) {
      const d = get().data;
      const card = d.cards.find((c) => c.id === cardId);
      if (!card) return;
      if (availableCents < 0) return get().toast('Informe um valor válido', 'error');
      if (availableCents > card.limitCents) return get().toast('O disponível não pode ser maior que o limite total', 'error');
      // Uso fora do app = o que o banco considera usado − o que o app já conhece.
      const u = creditUsage(d, card);
      const external = card.limitCents - availableCents - (u.purchases + u.bills + u.billsInstallments);
      await commit({ upsert: { cards: rows([{ ...card, externalUsedCents: external }]) } }, 'Limite disponível atualizado');
    },
    async recalcCardAvailable(cardId) {
      const card = get().data.cards.find((c) => c.id === cardId);
      if (!card) return;
      // Considera só o que está lançado no app: zera o uso fora do app.
      await commit({ upsert: { cards: rows([{ ...card, externalUsedCents: 0 }]) } }, 'Limite disponível recalculado pelo app');
    },
    async setBillsCard(billIds, cardId) {
      const d = get().data;
      const set = new Set(billIds);
      const changed = d.bills.filter((b) => set.has(b.id) && b.cardId !== cardId).map((b) => ({ ...b, cardId }));
      if (!changed.length) return;
      await commit({ upsert: { bills: rows(changed) } }, cardId ? `${changed.length} conta(s) vinculada(s) ao cartão` : 'Conta desvinculada do cartão');
    },

    /* ─────────── Receitas ─────────── */
    async saveIncomeSource(s) {
      const d = get().data;
      const prev = s.id ? d.incomeSources.find((x) => x.id === s.id) : null;
      const src: IncomeSource = {
        id: prev?.id ?? uid(),
        createdAt: prev?.createdAt ?? nowISO(),
        name: s.name.trim(),
        responsible: s.responsible,
        sortOrder: prev?.sortOrder ?? d.incomeSources.length,
        active: s.active ?? prev?.active ?? true,
        ...(prev?.oneOffMonth ? { oneOffMonth: prev.oneOffMonth } : {}),
      };
      if (!src.name) return get().toast('Informe o nome da receita', 'error');
      // Reativação: os meses em que ficou desativada recebem R$ 0 explícito (o passado não muda).
      const gap: Income[] = [];
      if (prev && !prev.active && src.active) {
        const last = d.incomes.filter((i) => i.sourceId === src.id).sort((a, b) => (a.month < b.month ? 1 : -1))[0];
        if (last) for (let m = addMonths(last.month, 1); m < currentMonth(); m = addMonths(m, 1)) gap.push({ id: uid(), createdAt: nowISO(), sourceId: src.id, month: m, amountCents: 0, receivedDate: null });
      }
      await commit({ upsert: { incomeSources: rows([src]) }, insertOnly: { incomes: rows(gap) } }, prev ? 'Receita atualizada' : 'Receita criada');
    },
    async removeIncomeSource(id) {
      const src = get().data.incomeSources.find((s) => s.id === id);
      if (src) await commit({ upsert: { incomeSources: rows([{ ...src, active: false }]) } }, 'Receita desativada — histórico preservado');
    },
    async deleteIncomeSource(id) {
      const d = get().data;
      if (!d.incomeSources.some((s) => s.id === id)) return;
      await commit(
        {
          remove: {
            incomes: d.incomes.filter((i) => i.sourceId === id).map((i) => i.id),
            incomeSources: [id],
          },
        },
        'Receita excluída',
      );
    },
    async setIncome(sourceId, month, amountCents, receivedDate) {
      if (amountCents < 0) return get().toast('Valor inválido', 'error');
      const d = get().data;
      const prev = d.incomes.find((i) => i.sourceId === sourceId && i.month === month);
      // Congela os meses intermediários antes de mudar a referência, para não alterar o passado.
      const fill = materializeIncomes({ ...d, incomeSources: d.incomeSources.filter((s) => s.id === sourceId) }, addMonths(month, -1)).filter((x) => x.month < month);
      const rec = { id: prev?.id ?? uid(), createdAt: prev?.createdAt ?? nowISO(), sourceId, month, amountCents, receivedDate };
      // Meses futuros ainda não recebidos passam a acompanhar este novo valor.
      const after = month > currentMonth() ? month : currentMonth();
      const stale = d.incomes.filter((i) => i.sourceId === sourceId && i.month > after && !i.receivedDate).map((i) => i.id);
      await commit({ insertOnly: { incomes: rows(fill) }, upsert: { incomes: rows([rec]) }, remove: { incomes: stale } }, 'Receita salva');
    },

    async addOneOffIncome({ name, responsible, month, amountCents, receivedDate }) {
      if (!name.trim()) return get().toast('Informe de onde veio o dinheiro', 'error');
      if (amountCents <= 0) return get().toast('Informe o valor da receita', 'error');
      const d = get().data;
      const src: IncomeSource = { id: uid(), createdAt: nowISO(), name: name.trim(), responsible, sortOrder: d.incomeSources.length, active: true, oneOffMonth: month };
      const rec: Income = { id: uid(), createdAt: nowISO(), sourceId: src.id, month, amountCents, receivedDate };
      await commit({ upsert: { incomeSources: rows([src]), incomes: rows([rec]) } }, 'Dinheiro extra adicionado');
    },

    /* ─────────── Contas fixas ─────────── */
    async createBill(b) {
      if (!b.name.trim()) return get().toast('Informe o nome da conta', 'error');
      if (b.amountCents <= 0) return get().toast('Informe o valor da conta', 'error');
      if (b.endMonth && b.endMonth < b.startMonth) return get().toast('O término deve ser depois do início', 'error');
      const bill: Bill = {
        id: uid(),
        createdAt: nowISO(),
        name: b.name.trim(),
        categoryId: b.categoryId,
        responsible: b.responsible,
        frequency: b.frequency,
        startMonth: b.startMonth,
        endMonth: b.endMonth,
        installments: b.installments,
        installmentOffset: b.endMonth ? Math.max(0, b.installmentOffset ?? 0) : 0,
        cardId: b.cardId ?? null,
        pauses: [],
        archivedAt: null,
      };
      const v: BillVersion = { id: uid(), createdAt: nowISO(), billId: bill.id, fromMonth: b.startMonth, amountCents: b.amountCents, dueDay: b.dueDay };
      await commit({ upsert: { bills: rows([bill]), billVersions: rows([v]) } }, 'Conta cadastrada');
    },
    async updateBill(billId, month, scope, patch) {
      const d = get().data;
      const occ = d.billOccurrences.find((o) => o.billId === billId && o.month === month);
      if (scope === 'month') {
        const o: BillOccurrence = occ
          ? { ...occ, amountCents: patch.amountCents, dueDay: patch.dueDay }
          : { id: uid(), createdAt: nowISO(), billId, month, amountCents: patch.amountCents, dueDay: patch.dueDay, paidAt: null, paidAmountCents: null, paidViaInvoice: false };
        await commit({ upsert: { billOccurrences: rows([o]) } }, 'Alteração aplicada somente neste mês');
        return;
      }
      // Deste mês em diante: nova versão a partir do mês; versões posteriores são substituídas.
      const later = d.billVersions.filter((v) => v.billId === billId && v.fromMonth > month);
      const same = d.billVersions.find((v) => v.billId === billId && v.fromMonth === month);
      const v: BillVersion = { id: same?.id ?? uid(), createdAt: same?.createdAt ?? nowISO(), billId, fromMonth: month, ...patch };
      // Ajustes pontuais em meses futuros (não pagos) deixam de valer.
      const futureOcc = d.billOccurrences.filter((o) => o.billId === billId && o.month >= month && !o.paidAt && (o.amountCents !== null || o.dueDay !== null));
      await commit(
        {
          upsert: { billVersions: rows([v]), billOccurrences: rows(futureOcc.map((o) => ({ ...o, amountCents: null, dueDay: null }))) },
          remove: { billVersions: later.map((x) => x.id) },
        },
        'Alteração aplicada deste mês em diante',
      );
    },
    async updateBillInfo(billId, patch) {
      const b = get().data.bills.find((x) => x.id === billId);
      if (!b) return;
      const next = { ...b, ...patch };
      if (next.endMonth && next.endMonth < next.startMonth) return get().toast('O término deve ser depois do início', 'error');
      await commit({ upsert: { bills: rows([next]) } }, 'Conta atualizada');
    },
    async setBillPaid(billId, month, paid, paidAmountCents = null) {
      const d = get().data;
      const occ = d.billOccurrences.find((o) => o.billId === billId && o.month === month);
      // Congela o valor pago: editar a conta depois não altera um mês já quitado.
      const bill = d.bills.find((b) => b.id === billId);
      const frozen = paid ? paidAmountCents ?? (bill ? billLine(d, bill, month)?.amountCents ?? null : null) : null;
      const o: BillOccurrence = occ
        ? { ...occ, paidAt: paid ? todayISO() : null, paidAmountCents: frozen, paidViaInvoice: false }
        : { id: uid(), createdAt: nowISO(), billId, month, amountCents: null, dueDay: null, paidAt: paid ? todayISO() : null, paidAmountCents: frozen, paidViaInvoice: false };
      await commit({ upsert: { billOccurrences: rows([o]) } }, paid ? 'Conta marcada como paga' : 'Conta marcada como pendente');
    },
    async pauseBill(billId, from) {
      const b = get().data.bills.find((x) => x.id === billId);
      if (!b) return;
      await commit({ upsert: { bills: rows([{ ...b, pauses: [...b.pauses.filter((p) => p.to !== null), { from, to: null }] }]) } }, `Conta pausada a partir de ${from.split('-').reverse().join('/')}`);
    },
    async resumeBill(billId, at) {
      const b = get().data.bills.find((x) => x.id === billId);
      if (!b) return;
      const pauses = b.pauses
        .map((p) => (p.to === null ? (at <= p.from ? null : { ...p, to: addMonths(at, -1) }) : p))
        .filter((p): p is NonNullable<typeof p> => p !== null);
      await commit({ upsert: { bills: rows([{ ...b, pauses }]) } }, 'Recorrência retomada');
    },
    async endBill(billId, lastMonth) {
      const b = get().data.bills.find((x) => x.id === billId);
      if (!b) return;
      if (lastMonth < b.startMonth) return get().toast('O término deve ser depois do início', 'error');
      await commit({ upsert: { bills: rows([{ ...b, endMonth: lastMonth, installments: null }]) } }, 'Conta encerrada');
    },
    async convertBillToExpense(billId) {
      const d = get().data;
      const b = d.bills.find((x) => x.id === billId);
      const card = b?.cardId ? d.cards.find((c) => c.id === b.cardId) : null;
      if (!b || !card) return false;
      const end = billEndMonth(b);
      if (!end) {
        get().toast(`${b.name} não tem término — defina a quantidade de parcelas antes de converter`, 'error');
        return false;
      }
      const paidInvoices = new Set(d.invoicePayments.filter((p) => p.cardId === card.id).map((p) => p.month));
      const lines = monthRange(b.startMonth, end)
        .map((m) => billLine(d, b, m))
        .filter((l): l is NonNullable<typeof l> => !!l);
      const open = lines.filter((l) => !l.paid && !paidInvoices.has(l.month));
      const first = open[0]?.month;
      const occIds = (from: Month) => d.billOccurrences.filter((o) => o.billId === b.id && o.month >= from).map((o) => o.id);

      const ch: Changes = { upsert: {}, remove: {} };
      if (open.length) {
        if (open.length > 48) {
          get().toast('Mais de 48 parcelas restantes — não é possível converter', 'error');
          return false;
        }
        const now = nowISO();
        const exp: Expense = {
          id: uid(),
          createdAt: now,
          updatedAt: now,
          amountCents: open.reduce((a, l) => a + l.amountCents, 0),
          description: b.name,
          categoryId: b.categoryId,
          responsible: b.responsible,
          date: todayISO() < `${first}-01` ? todayISO() : `${first}-01`,
          method: 'credit',
          cardId: card.id,
          installments: open.length,
          firstInvoiceMonth: first!,
        };
        // Mantém o valor exato de cada mês (as versões da conta podem ter valores diferentes).
        const inst = buildInstallments(exp, card).map((i, k) => ({ ...i, amountCents: open[k].amountCents }));
        ch.upsert!.expenses = rows([exp]);
        ch.upsert!.installments = rows(inst);
      }
      const hasHistory = lines.some((l) => l.month < (first ?? '9999-99'));
      if (first && !hasHistory) {
        // Nada pago ainda: a conta vira o gasto por inteiro.
        ch.remove = {
          bills: [b.id],
          billVersions: d.billVersions.filter((v) => v.billId === b.id).map((v) => v.id),
          billOccurrences: d.billOccurrences.filter((o) => o.billId === b.id).map((o) => o.id),
        };
      } else {
        // Meses já pagos ficam no histórico; o restante passa a ser o gasto.
        const lastKept = first ? addMonths(first, -1) : end;
        ch.upsert!.bills = rows([{ ...b, endMonth: lastKept, installments: null, installmentOffset: 0, archivedAt: nowISO() }]);
        if (first) ch.remove = { billOccurrences: occIds(first) };
      }
      await commit(
        ch,
        open.length
          ? `${b.name} agora é um gasto no ${card.name} (${open.length}x na fatura de ${monthLabel(first!)})`
          : `${b.name} já estava quitada — mantida só no histórico`,
      );
      return true;
    },

    async deleteBill(billId, opts) {
      const d = get().data;
      const b = d.bills.find((x) => x.id === billId);
      if (!b) return;
      const hasHistory = d.billOccurrences.some((o) => o.billId === billId && o.paidAt) || b.startMonth < currentMonth();
      // purge: apaga tudo, inclusive meses já pagos (ex.: conta que nunca deveria ter existido).
      if (!hasHistory || opts?.purge) {
        await commit(
          {
            remove: {
              bills: [billId],
              billVersions: d.billVersions.filter((v) => v.billId === billId).map((v) => v.id),
              billOccurrences: d.billOccurrences.filter((o) => o.billId === billId).map((o) => o.id),
            },
          },
          'Conta excluída',
        );
        return;
      }
      // Com histórico: encerra no mês anterior e arquiva, preservando os meses já registrados.
      const paidNow = d.billOccurrences.some((o) => o.billId === billId && o.month === currentMonth() && o.paidAt);
      const end = paidNow ? currentMonth() : addMonths(currentMonth(), -1);
      await commit(
        {
          upsert: { bills: rows([{ ...b, endMonth: end < b.startMonth ? b.startMonth : end, installments: null, archivedAt: nowISO() }]) },
          remove: { billOccurrences: d.billOccurrences.filter((o) => o.billId === billId && o.month > end && !o.paidAt).map((o) => o.id) },
        },
        'Conta excluída — histórico dos meses anteriores preservado',
      );
    },
  };
});

/** Rascunho do formulário de gasto (sobrevive se o celular descartar a aba). */
export const EXPENSE_DRAFT_KEY = 'fic-expense-draft';
export const readExpenseDraft = <T,>(editId: string | null): T | null => {
  const d = readSession<{ editId: string | null; form: T } | null>(EXPENSE_DRAFT_KEY, null);
  return d && d.editId === editId ? d.form : null;
};
export const writeExpenseDraft = (editId: string | null, form: unknown) => writeSession(EXPENSE_DRAFT_KEY, { editId, form });

/** Seletores de conveniência */
export const useData = () => useStore((s) => s.data);
export const useMonth = () => useStore((s) => s.month);
