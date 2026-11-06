import type { ReactNode } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { cx, IconButton, inputCls } from './ui';

/** Busca sempre visível + botão "Filtros" (com contador). Os filtros ficam numa janela. */
export function SearchFilterBar({
  q,
  setQ,
  placeholder,
  activeCount,
  onOpenFilters,
  className,
}: {
  q: string;
  setQ: (v: string) => void;
  placeholder: string;
  activeCount: number;
  onOpenFilters: () => void;
  className?: string;
}) {
  return (
    <div className={cx('flex gap-2', className)}>
      <div className="relative min-w-0 flex-1">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          enterKeyHint="search"
          className={cx(inputCls, 'pl-11 pr-10')}
        />
        {q && <IconButton icon={X} label="Limpar busca" onClick={() => setQ('')} className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2" />}
      </div>
      <button
        type="button"
        onClick={onOpenFilters}
        aria-label={activeCount ? `Filtros (${activeCount} ativos)` : 'Filtros'}
        className={cx(
          'relative flex h-12 shrink-0 items-center gap-2 rounded-2xl border px-4 text-[15px] font-semibold transition press:scale-[0.98]',
          activeCount
            ? 'border-brand-500 bg-brand-50 text-brand-600 dark:border-brand-500 dark:bg-brand-500/15 dark:text-brand-100'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-ink-600 dark:bg-ink-900 dark:text-slate-200',
        )}
      >
        <SlidersHorizontal size={18} />
        <span>Filtros</span>
        {activeCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white">{activeCount}</span>}
      </button>
    </div>
  );
}

export interface ActivePill {
  key: string;
  label: ReactNode;
  onRemove: () => void;
}

/** Filtros ativos como etiquetas pequenas que se removem com um toque. */
export function ActivePills({ pills, onClear, summary }: { pills: ActivePill[]; onClear: () => void; summary?: ReactNode }) {
  if (!pills.length) return null;
  return (
    <div className="mt-3 animate-fade-in">
      <div className="flex flex-wrap items-center gap-1.5">
        {pills.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={p.onRemove}
            aria-label={`Remover filtro ${typeof p.label === 'string' ? p.label : ''}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-slate-900 pl-3 pr-2 text-[13px] font-medium text-white transition press:scale-95 dark:bg-white dark:text-slate-900"
          >
            {p.label}
            <X size={14} className="opacity-70" />
          </button>
        ))}
        <button type="button" onClick={onClear} className="ml-1 h-8 px-2 text-[13px] font-semibold text-brand-500 hover:underline">
          Limpar
        </button>
      </div>
      {summary && <p className="mt-2 px-1 text-[13px] text-slate-500">{summary}</p>}
    </div>
  );
}

/** Bloco de filtro dentro da janela de filtros. */
export function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h4 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      {children}
    </section>
  );
}

/** Opção selecionável (célula de grade) usada nas janelas de filtro. */
export function OptionTile({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-2xl px-2 py-2 text-center text-[14px] font-medium leading-tight transition press:scale-[0.97]',
        active ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-ink-900 dark:text-slate-200 dark:hover:bg-ink-700',
        className,
      )}
    >
      {children}
    </button>
  );
}
