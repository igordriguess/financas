/** Todos os valores monetários são inteiros em centavos para evitar erros de ponto flutuante. */
const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCompact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });

export const brl = (cents: number) => fmt.format((cents || 0) / 100);
export const brlCompact = (cents: number) => fmtCompact.format((cents || 0) / 100);

/** Máscara monetária brasileira: dígitos digitados entram pela direita (centavos). */
export function maskFromDigits(raw: string): { cents: number; text: string } {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11);
  const cents = digits ? parseInt(digits, 10) : 0;
  return { cents, text: cents ? (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '' };
}

export const centsToInput = (cents: number) =>
  cents ? (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

/** Divide um valor em N partes inteiras; o resto de centavos vai para a primeira parcela. */
export function splitCents(total: number, parts: number): number[] {
  const n = Math.max(1, Math.floor(parts));
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + rest : base));
}

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
