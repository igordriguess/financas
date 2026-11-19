import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CreditCard, Ellipsis, House, Plus, ReceiptText, CalendarClock, CloudUpload } from 'lucide-react';
import { useStore } from '../store/useStore';
import { cx } from './ui';

const NAV = [
  { to: '/', label: 'Início', icon: House, end: true },
  { to: '/despesas', label: 'Despesas', icon: ReceiptText },
  { to: '/cartoes', label: 'Cartões', icon: CreditCard },
  { to: '/contas', label: 'Contas', icon: CalendarClock },
  { to: '/mais', label: 'Mais', icon: Ellipsis },
];
const MORE_PATHS = ['/mais', '/saldo-remanescente', '/reserva', '/receitas', '/categorias', '/relatorios', '/proximo-mes', '/configuracoes', '/usuarios'];

export function Layout() {
  const openExpense = useStore((s) => s.openExpense);
  const mode = useStore((s) => s.mode);
  const syncing = useStore((s) => s.syncing);
  const reload = useStore((s) => s.reload);
  const navigate = useNavigate();
  const loc = useLocation();

  /** Logo do menu lateral: volta para o Início e atualiza os dados em silêncio. */
  function goHome() {
    navigate('/');
    window.scrollTo({ top: 0 });
    void reload();
  }
  const isMore = MORE_PATHS.some((p) => loc.pathname.startsWith(p));

  return (
    <div className="min-h-dvh md:flex">
      {/* Menu lateral (tablet/desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200/70 bg-white/70 px-4 py-6 backdrop-blur dark:border-ink-700 dark:bg-ink-900/60 md:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          {/* Só o ícone é clicável: volta ao Início e busca os dados mais recentes, sem mensagens. */}
          <button type="button" onClick={goHome} className="shrink-0 cursor-pointer rounded-xl focus-visible:outline-offset-4">
            <img src="/icon.svg?v=2" alt="Ir para o início" className="block h-9 w-9" />
          </button>
          <div>
            <p className="text-[15px] font-bold leading-tight text-slate-900 dark:text-white">Finanças</p>
            <p className="text-xs text-slate-500">Igor e Carol</p>
          </div>
        </div>
        <button
          onClick={() => openExpense()}
          className="mb-6 flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand-500 font-semibold text-white shadow-float transition hover:bg-brand-600 press:scale-[0.98]"
        >
          <Plus size={20} strokeWidth={2.5} /> Adicionar gasto
        </button>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition',
                  isActive || (n.to === '/mais' && isMore) ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-100' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-ink-800',
                )
              }
            >
              <n.icon size={20} /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-2 text-xs text-slate-400">
          {mode === 'demo' ? 'Modo demonstração' : syncing > 0 ? 'Sincronizando…' : 'Sincronizado'}
        </div>
      </aside>

      <main className="mx-auto w-full max-w-4xl flex-1 xl:max-w-5xl px-4 pb-[calc(150px+env(safe-area-inset-bottom))] md:px-10 md:pb-16 lg:px-12">
        {mode === 'demo' && (
          <div className="mt-[max(8px,env(safe-area-inset-top))] rounded-2xl bg-amber-50 px-3 py-2 text-center text-[12px] font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-200 md:mt-4">
            Modo demonstração — dados de exemplo salvos apenas neste navegador. Configure o Supabase para uso real.
          </div>
        )}
        <Outlet />
      </main>

      {syncing > 0 && (
        <div className="fixed right-4 top-[max(12px,env(safe-area-inset-top))] z-30 rounded-full bg-white p-2 shadow-card dark:bg-ink-800 md:hidden" aria-label="Sincronizando">
          <CloudUpload size={16} className="animate-pulse text-brand-500" />
        </div>
      )}

      {/* Barra inferior (celular): cápsula flutuante de vidro, no estilo iOS */}
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(10px,env(safe-area-inset-bottom))] md:hidden">
        <div className="pointer-events-auto mx-auto grid max-w-lg grid-cols-5 gap-0.5 rounded-[30px] border border-white/70 bg-white/80 p-1.5 shadow-bar backdrop-blur-2xl backdrop-saturate-150 dark:border-white/[0.08] dark:bg-ink-800/80">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'flex h-[54px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-[24px] text-[11px] font-semibold transition-colors',
                  isActive || (n.to === '/mais' && isMore)
                    ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/20 dark:text-brand-100'
                    : 'text-slate-500 dark:text-slate-400',
                )
              }
            >
              <n.icon size={22} strokeWidth={2} />
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
      {/* Botão flutuante "Adicionar gasto" */}
      <button
        onClick={() => openExpense()}
        aria-label="Adicionar gasto"
        className="fixed bottom-[calc(92px+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-float ring-4 ring-white/70 transition-colors active:bg-brand-600 dark:ring-ink-950/70 md:hidden"
      >
        <Plus size={26} strokeWidth={2} absoluteStrokeWidth aria-hidden />
      </button>
    </div>
  );
}
