/**
 * Camada de persistência. A store conversa apenas com esta interface,
 * então trocar entre modo demonstração e Supabase não afeta a interface.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { emptyData, TABLES, type FinanceData, type TableName } from '../domain/types';

export type Row = { id: string } & Record<string, unknown>;

export interface UpsertOptions {
  /** Não sobrescreve um registro que já exista com a mesma chave natural (ex.: receita do mês já criada no outro celular). */
  ignoreDuplicates?: boolean;
}

export interface Repository {
  readonly mode: 'demo' | 'supabase';
  load(): Promise<FinanceData>;
  upsert(table: TableName, rows: Row[], opts?: UpsertOptions): Promise<void>;
  remove(table: TableName, ids: string[]): Promise<void>;
}

/**
 * Chaves naturais (constraints UNIQUE do banco). Gravar por elas evita conflito quando os dois
 * celulares criam o mesmo registro ao mesmo tempo (ex.: marcar a mesma conta como paga).
 */
const NATURAL_KEYS: Partial<Record<TableName, string>> = {
  installments: 'expense_id,number',
  incomes: 'source_id,month',
  billOccurrences: 'bill_id,month',
  billVersions: 'bill_id,from_month',
  invoicePayments: 'card_id,month',
};

/* ─────────────── Conversão camelCase ⇄ snake_case ─────────────── */
const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
export const tableName = (t: TableName) => toSnake(t);

/** Colunas numéricas grandes (bigint) chegam como number pelo PostgREST; datas chegam como string. */
function fromDb(row: Record<string, unknown>): Row {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'household_id') continue;
    out[toCamel(k)] = v;
  }
  return out as Row;
}
function toDb(row: Row, householdId: string): Record<string, unknown> {
  const out: Record<string, unknown> = { household_id: householdId };
  for (const [k, v] of Object.entries(row)) out[toSnake(k)] = v === undefined ? null : v;
  return out;
}

/* ─────────────── Supabase ─────────────── */
export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const;
  constructor(private sb: SupabaseClient, private householdId: string) {}

  private async loadTable(t: TableName): Promise<Row[]> {
    const page = 1000;
    const rows: Row[] = [];
    for (let from = 0; ; from += page) {
      const { data, error } = await this.sb
        .from(tableName(t))
        .select('*')
        .eq('household_id', this.householdId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + page - 1);
      if (error) throw error;
      rows.push(...(data ?? []).map(fromDb));
      if (!data || data.length < page) break;
    }
    return rows;
  }

  async load(): Promise<FinanceData> {
    const d = emptyData();
    const results = await Promise.all(TABLES.map((t) => this.loadTable(t)));
    TABLES.forEach((t, i) => ((d as unknown as Record<string, Row[]>)[t] = results[i]));
    return d;
  }
  async upsert(table: TableName, rows: Row[], opts: UpsertOptions = {}) {
    if (!rows.length) return;
    const { error } = await this.sb
      .from(tableName(table))
      .upsert(rows.map((r) => toDb(r, this.householdId)), { onConflict: NATURAL_KEYS[table], ignoreDuplicates: !!opts.ignoreDuplicates });
    if (error) throw error;
  }
  async remove(table: TableName, ids: string[]) {
    if (!ids.length) return;
    const { error } = await this.sb.from(tableName(table)).delete().in('id', ids);
    if (error) throw error;
  }
}

/* ─────────────── Demonstração (navegador) ─────────────── */
const DEMO_KEY = 'fic-demo-data-v1';

export class DemoRepository implements Repository {
  readonly mode = 'demo' as const;
  constructor(private seed: () => FinanceData) {}

  private read(): FinanceData | null {
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      return raw ? { ...emptyData(), ...JSON.parse(raw) } : null;
    } catch {
      return null;
    }
  }
  private write(d: FinanceData) {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(d));
    } catch {
      /* armazenamento indisponível: segue apenas em memória */
    }
  }
  async load() {
    const existing = this.read();
    if (existing) return existing;
    const d = this.seed();
    this.write(d);
    return d;
  }
  async upsert(table: TableName, rows: Row[], opts: UpsertOptions = {}) {
    const d = this.read() ?? this.seed();
    const list = d[table] as unknown as Row[];
    for (const r of rows) {
      const i = list.findIndex((x) => x.id === r.id);
      if (i >= 0) {
        if (!opts.ignoreDuplicates) list[i] = r;
      } else list.push(r);
    }
    this.write(d);
  }
  async remove(table: TableName, ids: string[]) {
    const d = this.read() ?? this.seed();
    const set = new Set(ids);
    (d as unknown as Record<string, Row[]>)[table] = (d[table] as unknown as Row[]).filter((x) => !set.has(x.id));
    this.write(d);
  }
  static reset() {
    try {
      localStorage.removeItem(DEMO_KEY);
    } catch {
      /* ignore */
    }
  }
}
