/** Mês de competência no formato 'YYYY-MM'. Datas no formato ISO 'YYYY-MM-DD'. */
export type Month = string;

const NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toMonth(y: number, m: number): Month {
  const d = new Date(y, m - 1, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function parseMonth(m: Month): [number, number] {
  const [y, mo] = m.split('-').map(Number);
  return [y, mo];
}
export function addMonths(m: Month, n: number): Month {
  const [y, mo] = parseMonth(m);
  return toMonth(y, mo + n);
}
/** Quantidade de meses de a até b (b - a). */
export function diffMonths(a: Month, b: Month): number {
  const [ya, ma] = parseMonth(a);
  const [yb, mb] = parseMonth(b);
  return (yb - ya) * 12 + (mb - ma);
}
export const monthOf = (iso: string): Month => iso.slice(0, 7);
export const cmpMonth = (a: Month, b: Month) => (a < b ? -1 : a > b ? 1 : 0);

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const currentMonth = (): Month => monthOf(todayISO());

export function monthLabel(m: Month, opts: { short?: boolean; year?: boolean } = {}): string {
  const [y, mo] = parseMonth(m);
  const name = opts.short ? SHORT[mo - 1] : NAMES[mo - 1];
  return opts.year === false ? name : `${name}/${y}`;
}
export const monthShort = (m: Month) => `${SHORT[parseMonth(m)[1] - 1]}/${String(parseMonth(m)[0]).slice(2)}`;

export function daysInMonth(m: Month): number {
  const [y, mo] = parseMonth(m);
  return new Date(y, mo, 0).getDate();
}
/** Data ISO de um dia dentro do mês, ajustando para o último dia quando necessário (ex.: dia 31 em fevereiro). */
export function dateInMonth(m: Month, day: number): string {
  return `${m}-${pad(Math.min(Math.max(1, day), daysInMonth(m)))}`;
}

/** DD/MM/AAAA */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export function fmtDayHeader(iso: string): string {
  const t = todayISO();
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  if (iso === t) return 'Hoje';
  if (date.toDateString() === yest.toDateString()) return 'Ontem';
  const wd = date.toLocaleDateString('pt-BR', { weekday: 'long' });
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)}, ${fmtDate(iso)}`;
}
export const isValidISODate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00').getTime());

export function monthRange(from: Month, to: Month): Month[] {
  const out: Month[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}
