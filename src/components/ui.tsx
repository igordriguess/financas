import { useEffect, useRef, useState, type Dispatch, type SetStateAction, type PointerEvent as ReactPointerEvent, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, Info, X, XCircle, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { brl, centsToInput, maskFromDigits } from '../lib/money';
import { addMonths, currentMonth, monthLabel, type Month } from '../lib/months';

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

/* ───────────── Superfícies ───────────── */
export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cx(
        'block w-full rounded-3xl bg-white text-left shadow-card ring-1 ring-black/[0.03] dark:bg-ink-800 dark:ring-white/[0.06] dark:shadow-none',
        onClick && 'cursor-pointer transition press:scale-[0.99] [@media(hover:hover)]:hover:shadow-lg [@media(hover:hover)]:hover:ring-black/[0.06] dark:[@media(hover:hover)]:hover:ring-white/[0.12]',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-center justify-between gap-3 px-1 first:mt-0">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{children}</h2>
      {action}
    </div>
  );
}

/* ───────────── Botões ───────────── */
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  className,
  children,
  loading,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; icon?: LucideIcon; loading?: boolean }) {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm',
    secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-ink-700 dark:text-slate-100 dark:hover:bg-ink-600',
    ghost: 'text-brand-600 hover:bg-brand-50 dark:text-brand-100 dark:hover:bg-ink-700',
    danger: 'bg-expense-soft text-expense hover:bg-red-100 dark:bg-red-500/15 dark:text-expense-dark',
    success: 'bg-income text-white hover:brightness-95',
  };
  const s = { sm: 'h-9 px-3 text-sm rounded-xl', md: 'h-11 px-4 text-[15px] rounded-2xl', lg: 'h-14 px-5 text-base rounded-2xl' }[size];
  return (
    <button
      type="button"
      data-tip={!children ? rest['aria-label'] : undefined}
      {...rest}
      disabled={rest.disabled || loading}
      className={cx('inline-flex select-none items-center justify-center gap-2 font-semibold transition press:scale-[0.98] disabled:opacity-50', v[variant], s, className)}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : Icon && <Icon size={18} />}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tip={label}
      {...rest}
      className={cx('inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 press:scale-95 dark:text-slate-300 dark:hover:bg-ink-700', className)}
    >
      <Icon size={20} />
    </button>
  );
}

/* ───────────── Campos ───────────── */
export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-expense">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export const inputCls =
  'h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[16px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 dark:border-ink-600 dark:bg-ink-900 dark:text-slate-100';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

export function Select({ value, onChange, children, className, ariaLabel }: { value: string; onChange: (v: string) => void; children: ReactNode; className?: string; ariaLabel?: string }) {
  return (
    <select value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)} className={cx(inputCls, 'appearance-none bg-[length:16px] pr-10', className)}>
      {children}
    </select>
  );
}

/** Campo monetário com máscara brasileira (R$ 1.234,56) e teclado numérico. */
export function MoneyInput({
  value,
  onChange,
  autoFocus,
  big,
  placeholder = '0,00',
  id,
}: {
  value: number;
  onChange: (cents: number) => void;
  autoFocus?: boolean;
  big?: boolean;
  placeholder?: string;
  id?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => ref.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);
  return (
    <div
      className={
        big
          ? 'flex items-baseline justify-center gap-2'
          : cx(inputCls, 'flex items-center gap-2 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15')
      }
      onClick={() => ref.current?.focus()}
    >
      <span className={cx('font-semibold text-slate-400', big ? 'text-2xl' : 'text-[16px]')}>R$</span>
      <input
        id={id}
        ref={ref}
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="done"
        placeholder={placeholder}
        value={centsToInput(value)}
        onChange={(e) => onChange(maskFromDigits(e.target.value).cents)}
        className={cx(
          'min-w-0 bg-transparent outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600',
          big ? 'w-full max-w-[16ch] text-center text-[44px] font-bold tracking-tight text-slate-900 dark:text-white' : 'h-full w-full text-[16px] font-medium tabular-nums',
        )}
        style={big ? { width: `${Math.max(4, centsToInput(value).length || 4)}ch` } : undefined}
      />
    </div>
  );
}

/** Seletor segmentado (ex.: Igor | Carol). */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; ariaLabel?: string }[]; className?: string }) {
  return (
    <div className={cx('flex rounded-2xl bg-slate-100 p-1 dark:bg-ink-900', className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.ariaLabel ?? (typeof o.label === "string" ? o.label : undefined)}
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-10 min-w-0 flex-1 rounded-xl px-1.5 py-1.5 text-center text-sm font-semibold leading-tight transition',
            o.value === value ? 'bg-white text-slate-900 shadow-sm dark:bg-ink-700 dark:text-white' : 'text-slate-500 dark:text-slate-400',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, icon: Icon, fill, className }: { active?: boolean; onClick?: () => void; children: ReactNode; icon?: LucideIcon; fill?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full text-sm font-medium transition press:scale-95',
        fill ? 'h-auto min-h-9 w-full min-w-0 justify-center px-1.5 py-1 text-center text-[13px] leading-tight md:w-auto md:px-4 md:text-sm' : 'px-4',
        active ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-ink-800 dark:text-slate-300 dark:ring-ink-600',
        className,
      )}
    >
      {Icon && <Icon size={15} />}
      {children}
    </button>
  );
}

export function Badge({ tone = 'gray', children }: { tone?: 'gray' | 'green' | 'red' | 'blue' | 'amber'; children: ReactNode }) {
  const t = {
    gray: 'bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-slate-300',
    green: 'bg-income-soft text-green-700 dark:bg-green-500/15 dark:text-income-dark',
    red: 'bg-expense-soft text-red-700 dark:bg-red-500/15 dark:text-expense-dark',
    blue: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', t)}>{children}</span>;
}

export function Progress({ value, tone = 'blue' }: { value: number; tone?: 'blue' | 'green' | 'red' | 'amber' }) {
  const c = { blue: 'bg-brand-500', green: 'bg-income', red: 'bg-expense', amber: 'bg-amber-500' }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-ink-700">
      <div className={cx('h-full rounded-full transition-all duration-500', c)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Money({ cents, className, sign, tone }: { cents: number; className?: string; sign?: boolean; tone?: 'auto' | 'income' | 'expense' }) {
  const color =
    tone === 'income' ? 'text-income dark:text-income-dark' : tone === 'expense' ? 'text-expense dark:text-expense-dark' : tone === 'auto' ? (cents < 0 ? 'text-expense dark:text-expense-dark' : 'text-income dark:text-income-dark') : '';
  return <span className={cx('tabular-nums', color, className)}>{sign && cents > 0 ? '+' : ''}{brl(cents)}</span>;
}

/* ───────────── Estrutura de página ───────────── */
export function PageHeader({ title, subtitle, back, actions }: { title: string; subtitle?: ReactNode; back?: boolean; actions?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-3 bg-[#f5f6f8]/85 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-xl dark:bg-ink-950/85 md:static md:mx-0 md:mb-6 md:bg-transparent md:px-0 md:pb-0 md:pt-8 md:backdrop-blur-none">
      {back && <IconButton icon={ChevronLeft} label="Voltar" onClick={() => nav(-1)} className="-ml-2" />}
      <div className="min-w-0 flex-1">
        <h1 className="break-words text-[22px] font-bold leading-tight tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <div className="mt-0.5 break-words text-[13px] text-slate-500 dark:text-slate-400">{subtitle}</div>}
      </div>
      {actions}
    </header>
  );
}

export function MonthSwitcher({ value, onChange, compact, min }: { value?: Month; onChange?: (m: Month) => void; compact?: boolean; /** Mês mais antigo permitido. */ min?: Month }) {
  const storeMonth = useStore((s) => s.month);
  const setMonth = useStore((s) => s.setMonth);
  const raw = value ?? storeMonth;
  const m = min && raw < min ? min : raw;
  const change = onChange ?? setMonth;
  const atMin = !!min && m <= min;
  const isCurrent = m === currentMonth();
  return (
    <div className={cx('flex items-center justify-between rounded-2xl bg-white p-1 shadow-card ring-1 ring-black/[0.03] dark:bg-ink-800 dark:ring-white/[0.06]', compact && 'inline-flex')}>
      <IconButton icon={ChevronLeft} label="Mês anterior" disabled={atMin} onClick={() => change(addMonths(m, -1))} className={cx(atMin && 'opacity-30')} />
      <button onClick={() => change(currentMonth())} className="flex min-w-[140px] flex-col items-center px-2" title="Voltar para o mês atual">
        <span className="text-[15px] font-semibold text-slate-900 dark:text-white">{monthLabel(m)}</span>
        {!isCurrent && <span className="text-[11px] font-medium text-brand-500">Toque para voltar a hoje</span>}
      </button>
      <IconButton icon={ChevronRight} label="Próximo mês" onClick={() => change(addMonths(m, 1))} />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center animate-fade-in">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-50 text-brand-500 dark:bg-brand-500/10">
        <Icon size={28} />
      </div>
      <p className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ListRow({
  left,
  title,
  subtitle,
  right,
  onClick,
  className,
}: {
  left?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cx(
        'flex w-full min-w-0 items-center gap-3.5 px-4 py-3.5 text-left md:px-5',
        onClick && 'cursor-pointer transition-colors press:bg-slate-100 dark:press:bg-ink-700 [@media(hover:hover)]:hover:bg-slate-50 dark:[@media(hover:hover)]:hover:bg-ink-700/60',
        className,
      )}
    >
      {left}
      <div className="min-w-0 flex-1">
        <div className="break-words text-[15px] font-medium leading-snug text-slate-900 dark:text-slate-100">
          {title}
        </div>
        {subtitle && (
          <div className="mt-0.5 break-words text-[13px] leading-snug text-slate-500 dark:text-slate-400 [&>span.inline-flex]:flex-wrap [&>span.inline-flex]:gap-y-0.5">
            {subtitle}
          </div>
        )}
      </div>
      {right && <div className="shrink-0 text-right">{right}</div>}
    </Tag>
  );
}

export const Divider = () => <div className="mx-4 h-px bg-slate-100 dark:bg-ink-700" />;

/* ───────────── Sheet (modal inferior no celular, central no desktop) ───────────── */
const sheetStack: symbol[] = [];
/**
 * Trava a rolagem da página enquanto há janela aberta.
 * A trava fica no <html> (a "tela"), não no <body>: no <body> o menu lateral, que é fixo no topo,
 * perderia a referência e "pularia" para cima quando a página estivesse rolada.
 */
const syncBodyLock = () => {
  document.documentElement.style.overflow = sheetStack.length ? 'hidden' : '';
};

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const id = useRef(Symbol('sheet'));
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Mantém montado durante a animação de saída.
  useEffect(() => {
    if (open) {
      setRender(true);
      setClosing(false);
      return;
    }
    if (!render) return;
    setClosing(true);
    const t = setTimeout(() => {
      setRender(false);
      setClosing(false);
    }, 190);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Pilha de modais: Esc fecha só o de cima; foco preso dentro do modal e devolvido ao fechar.
  useEffect(() => {
    if (!render) return;
    const me = id.current;
    sheetStack.push(me);
    syncBodyLock();
    const prevFocus = document.activeElement as HTMLElement | null;
    const focusT = setTimeout(() => {
      if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus({ preventScroll: true });
    }, 80);
    const onKey = (e: KeyboardEvent) => {
      if (sheetStack[sheetStack.length - 1] !== me) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab' && panel.current) {
        const items = Array.from(
          panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select,textarea,a[href],[tabindex]:not([tabindex="-1"])'),
        ).filter((x) => x.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(focusT);
      window.removeEventListener('keydown', onKey);
      const i = sheetStack.indexOf(me);
      if (i >= 0) sheetStack.splice(i, 1);
      syncBodyLock();
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    };
  }, [render]);

  // Arrastar para baixo (pela alça/cabeçalho) fecha no celular.
  const onDragStart = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('button,input,select,a')) return;
    const el = panel.current;
    if (!el) return;
    const startY = e.clientY;
    const t0 = performance.now();
    let dy = 0;
    el.style.transition = 'none';
    const move = (ev: PointerEvent) => {
      dy = Math.max(0, ev.clientY - startY);
      el.style.transform = `translateY(${dy}px)`;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const velocity = dy / Math.max(1, performance.now() - t0);
      el.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
      if (dy > 120 || (dy > 40 && velocity > 0.6)) {
        el.style.transform = 'translateY(100%)';
        setTimeout(() => closeRef.current(), 160);
      } else {
        el.style.transform = '';
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  if (!render) return null;
  const width = { sm: 'md:max-w-sm', md: 'md:max-w-lg', lg: 'md:max-w-2xl' }[size];
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <div className={cx('absolute inset-0 bg-slate-900/45 backdrop-blur-[3px]', closing ? 'animate-fade-out' : 'animate-fade-in')} onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className={cx(
          'relative flex max-h-[94dvh] w-full flex-col rounded-t-[28px] bg-white shadow-2xl outline-none dark:bg-ink-800 md:max-h-[88vh] md:rounded-[28px] md:ring-1 md:ring-black/5 dark:md:ring-white/10',
          width,
          closing ? 'animate-slide-down md:animate-pop-out' : 'animate-slide-up md:animate-pop-in',
        )}
      >
        <div onPointerDown={onDragStart} className="touch-none select-none md:touch-auto">
          <div className="flex justify-center pb-1 pt-2.5 md:hidden">
            <div className="h-1.5 w-10 rounded-full bg-slate-200 dark:bg-ink-600" />
          </div>
          {title !== undefined && (
            <div
              className={cx(
                'flex items-start gap-3 px-5 pb-3 pt-2 transition-shadow md:pt-5',
                scrolled && 'shadow-[0_1px_0_rgba(15,23,42,.08)] dark:shadow-[0_1px_0_rgba(255,255,255,.08)]',
              )}
            >
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-lg font-bold leading-snug text-slate-900 dark:text-white">
                  {title}
                </h3>
                {subtitle && <div className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">{subtitle}</div>}
              </div>
              <IconButton icon={X} label="Fechar (Esc)" onClick={onClose} className="-mr-2 -mt-1 shrink-0 bg-slate-100 dark:bg-ink-700" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 pb-4 pt-1" onScroll={(e) => setScrolled((e.target as HTMLElement).scrollTop > 4)}>
          {children}
        </div>
        {footer && (
          <div className="border-t border-slate-100 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 dark:border-ink-700 md:pb-5">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ───────────── Toasts e confirmação globais ───────────── */
export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-[max(12px,env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? XCircle : Info;
        return (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl bg-slate-900 px-4 py-3 text-left text-sm font-medium text-white shadow-xl animate-pop-in dark:bg-white dark:text-slate-900"
          >
            <Icon size={18} className={t.kind === 'success' ? 'text-income-dark dark:text-income' : t.kind === 'error' ? 'text-expense-dark dark:text-expense' : 'text-brand-100 dark:text-brand-500'} />
            {t.text}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

export function ConfirmHost() {
  const req = useStore((s) => s.confirmReq);
  if (!req) return null;
  return (
    <Sheet open onClose={() => req.resolve(false)} title={req.title} size="sm">
      {req.message && <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">{req.message}</p>}
      <div className="mt-5 flex flex-col gap-2 pb-2 md:flex-row-reverse md:[&>*]:flex-1">
        <Button variant={req.danger ? 'danger' : 'primary'} size="lg" onClick={() => req.resolve(true)} autoFocus>
          {req.confirmText ?? 'Confirmar'}
        </Button>
        <Button variant="secondary" size="lg" onClick={() => req.resolve(false)}>
          {req.cancelText ?? 'Cancelar'}
        </Button>
      </div>
    </Sheet>
  );
}

/** Grade de 5 filtros no celular (6 colunas): 3 na primeira linha e 2 ocupando a segunda inteira. */
export const span5 = (i: number) => (i < 3 ? 'col-span-2' : 'col-span-3');

/** Estado que sobrevive à troca de tela e ao recarregamento da aba (filtros, abas, buscas). */
export function useSessionState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (next: T) => {
    setV(next);
    try {
      sessionStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  return [v, set];
}

/** Hook utilitário para estado de formulário com reset ao abrir. */
export function useResetOnOpen<T>(open: boolean, init: () => T): [T, Dispatch<SetStateAction<T>>] {
  const [v, setV] = useState<T>(init);
  useEffect(() => {
    if (open) setV(init());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return [v, setV];
}
