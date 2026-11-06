import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, ChevronRight, LogOut, Settings, Tags, TrendingUp, Users, Wallet } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Card, PageHeader, cx } from '../components/ui';

const ITEMS = [
  { to: '/receitas', label: 'Receitas', desc: 'Pagamentos mensais de Igor e Carol', icon: Wallet, color: 'bg-income-soft text-income dark:bg-green-500/15' },
  { to: '/proximo-mes', label: 'Próximo mês', desc: 'Previsão de receitas e compromissos', icon: TrendingUp, color: 'bg-brand-50 text-brand-500 dark:bg-brand-500/15' },
  { to: '/relatorios', label: 'Relatórios', desc: 'Histórico, gráficos e comparativos', icon: BarChart3, color: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15' },
  { to: '/categorias', label: 'Categorias', desc: 'Organize seus gastos', icon: Tags, color: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15' },
  { to: '/usuarios', label: 'Usuários', desc: 'Quem participa deste ambiente', icon: Users, color: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15' },
  { to: '/configuracoes', label: 'Configurações', desc: 'Tema, conta e dados', icon: Settings, color: 'bg-slate-100 text-slate-600 dark:bg-ink-700 dark:text-slate-300' },
];

export function MorePage() {
  const me = useStore((s) => s.me);
  const mode = useStore((s) => s.mode);
  const signOut = useStore((s) => s.signOut);
  const [busy, setBusy] = useState(false);
  return (
    <div className="animate-fade-in">
      <PageHeader title="Mais" />
      <Card className="flex items-center gap-3 p-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-lg font-bold text-white">{(me.displayName || 'U').charAt(0)}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 dark:text-white">{me.displayName}</p>
          <p className="break-all text-[13px] text-slate-500">{mode === 'demo' ? 'Modo demonstração' : me.email}</p>
        </div>
      </Card>
      <Card className="mt-5">
        {ITEMS.map((it, i) => (
          <Link key={it.to} to={it.to} className={cx('flex items-center gap-3 px-4 py-3.5 transition active:bg-slate-50 dark:active:bg-ink-700', i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
            <span className={cx('flex h-10 w-10 items-center justify-center rounded-2xl', it.color)}>
              <it.icon size={20} />
            </span>
            <div className="flex-1">
              <p className="text-[15px] font-medium text-slate-900 dark:text-slate-100">{it.label}</p>
              <p className="text-[13px] text-slate-500">{it.desc}</p>
            </div>
            <ChevronRight size={18} className="text-slate-300" />
          </Link>
        ))}
      </Card>
      {mode === 'supabase' && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await signOut();
          }}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-3xl bg-white py-4 font-semibold text-expense shadow-card dark:bg-ink-800"
        >
          <LogOut size={18} /> Sair da conta
        </button>
      )}
      <p className="mt-6 text-center text-[12px] text-slate-400">Finanças Igor e Carol · v1.0</p>
    </div>
  );
}
