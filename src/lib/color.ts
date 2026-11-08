/** Escurece uma cor hex (#rrggbb) para o fim do degradê dos cartões. */
export function shade(hex: string, factor = 0.62) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * factor));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

export const cardGradient = (hex: string) => `linear-gradient(135deg, ${hex}, ${shade(hex)})`;
