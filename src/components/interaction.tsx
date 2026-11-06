import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

/* ───────────────────────────── Tooltips ─────────────────────────────
 * Qualquer elemento com `data-tip="texto"` mostra o texto ao passar o mouse.
 * Com `data-tip-truncated`, mostra o próprio conteúdo apenas quando ele está cortado (…).
 * No celular, segurar o dedo ~0,5s sobre o elemento mostra o mesmo balão.
 */
function tipText(el: HTMLElement): string | null {
  if (el.dataset.tip) return el.dataset.tip;
  if (el.hasAttribute('data-tip-truncated')) {
    const cut = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    return cut ? el.textContent?.trim() || null : null;
  }
  // Botões só com ícone: usa o aria-label como balão.
  const label = el.getAttribute('aria-label');
  if (label && el.tagName === 'BUTTON' && !el.textContent?.trim()) return label;
  return null;
}
const findTipTarget = (t: EventTarget | null): HTMLElement | null => {
  const el = (t as Element | null)?.closest?.('[data-tip],[data-tip-truncated],button[aria-label]') as HTMLElement | null;
  return el && tipText(el) !== null ? el : el?.parentElement ? findTipTarget(el.parentElement) : null;
};

export function TooltipHost() {
  const [tip, setTip] = useState<{ text: string; rect: DOMRect } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const bubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let current: HTMLElement | null = null;
    let touchStart: { x: number; y: number } | null = null;

    const show = (el: HTMLElement) => {
      const text = tipText(el);
      if (text) setTip({ text, rect: el.getBoundingClientRect() });
    };
    const hide = () => {
      clearTimeout(timer);
      clearTimeout(hideTimer);
      current = null;
      touchStart = null;
      setTip(null);
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = findTipTarget(e.target);
      if (el === current) return;
      clearTimeout(timer);
      current = el;
      if (!el) return setTip(null);
      timer = setTimeout(() => show(el), 300);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return hide();
      const el = findTipTarget(e.target);
      hide();
      if (!el) return;
      touchStart = { x: e.clientX, y: e.clientY };
      current = el;
      timer = setTimeout(() => {
        show(el);
        hideTimer = setTimeout(hide, 2200);
      }, 500);
    };
    const onMove = (e: PointerEvent) => {
      if (touchStart && Math.hypot(e.clientX - touchStart.x, e.clientY - touchStart.y) > 10) {
        clearTimeout(timer);
        touchStart = null;
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') clearTimeout(timer);
    };
    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp, true);
    // Rolagem só esconde o balão visível; um balão pendente aparece na nova posição.
    const onScroll = () => setTip(null);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', hide);
    window.addEventListener('keydown', hide);
    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', hide);
      window.removeEventListener('keydown', hide);
      clearTimeout(timer);
      clearTimeout(hideTimer);
    };
  }, []);

  // Posiciona acima (ou abaixo, se faltar espaço) e mantém dentro da tela.
  useLayoutEffect(() => {
    if (!tip || !bubble.current) return setPos(null);
    const b = bubble.current.getBoundingClientRect();
    const below = tip.rect.top - b.height - 10 < 4;
    const top = below ? tip.rect.bottom + 8 : tip.rect.top - b.height - 8;
    const center = tip.rect.left + tip.rect.width / 2;
    const left = Math.min(Math.max(8, center - b.width / 2), window.innerWidth - b.width - 8);
    setPos({ left, top, below });
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={bubble}
      role="tooltip"
      className={cx(
        'pointer-events-none fixed z-[90] max-w-[260px] rounded-lg bg-slate-900 px-2.5 py-1.5 text-[12px] font-medium leading-snug text-white shadow-lg dark:bg-white dark:text-slate-900',
        pos ? 'animate-fade-in' : 'opacity-0',
      )}
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0 }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}

/* ───────────────────────────── Rolagem horizontal ─────────────────────────────
 * Faixa com rolagem lateral que funciona em todo dispositivo:
 * dedo (nativo), mouse (arrastar), roda do mouse, setas nas bordas e esmaecimento indicando que há mais itens.
 */
export function HScroll({ children, className, innerClassName, ariaLabel }: { children: ReactNode; className?: string; innerClassName?: string; ariaLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const [dragging, setDragging] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((p) => (p.left === left && p.right === right ? p : { left, right }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    el.addEventListener('scroll', update, { passive: true });
    // Roda do mouse (vertical) rola a faixa na horizontal enquanto houver para onde ir.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.ctrlKey) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const next = el.scrollLeft + e.deltaY;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max)) return;
      e.preventDefault();
      el.scrollLeft = Math.min(max, Math.max(0, next));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', update);
      el.removeEventListener('wheel', onWheel);
    };
  }, [update, children]);

  // Arrastar com o mouse; um arrasto não dispara o clique do item em que começou.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = ref.current!;
    if (el.scrollWidth <= el.clientWidth) return;
    const startX = e.clientX;
    const start = el.scrollLeft;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) > 5) {
        moved = true;
        setDragging(true);
      }
      if (moved) el.scrollLeft = start - dx;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragging(false);
      if (moved) {
        const block = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        window.addEventListener('click', block, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', block, { capture: true }), 0);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current!;
    el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' });
  };

  const mask = edges.left && edges.right
    ? 'linear-gradient(90deg, transparent, #000 28px, #000 calc(100% - 28px), transparent)'
    : edges.left
      ? 'linear-gradient(90deg, transparent, #000 28px)'
      : edges.right
        ? 'linear-gradient(90deg, #000 calc(100% - 28px), transparent)'
        : undefined;

  const Arrow = ({ dir }: { dir: 1 | -1 }) => (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={() => scrollBy(dir)}
      className={cx(
        'absolute top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-700 shadow-md ring-1 ring-black/5 transition hover:scale-105 dark:bg-ink-700 dark:text-slate-100 [@media(hover:hover)]:flex',
        dir === -1 ? 'left-0' : 'right-0',
        'opacity-0 group-hover/hs:opacity-100',
      )}
    >
      {dir === -1 ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
    </button>
  );

  return (
    <div className={cx('group/hs relative', className)}>
      {edges.left && <Arrow dir={-1} />}
      <div
        ref={ref}
        role={ariaLabel ? 'group' : undefined}
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        className={cx('no-scrollbar flex overflow-x-auto overscroll-x-contain', dragging ? 'cursor-grabbing select-none' : edges.left || edges.right ? '[@media(hover:hover)]:cursor-grab' : '', innerClassName)}
        style={mask ? { WebkitMaskImage: mask, maskImage: mask } : undefined}
      >
        {children}
      </div>
      {edges.right && <Arrow dir={1} />}
    </div>
  );
}
