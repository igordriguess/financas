import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useStore } from './store/useStore';
import { Layout } from './components/Layout';
import { ExpenseSheet } from './components/ExpenseSheet';
import { Button, ConfirmHost, Toasts } from './components/ui';
import { TooltipHost } from './components/interaction';
import { DashboardPage } from './pages/Dashboard';
import { ExpensesPage } from './pages/Expenses';
import { CardDetailPage, CardsPage } from './pages/Cards';
import { BillDetailPage, BillsPage } from './pages/Bills';
import { MorePage } from './pages/More';
import { IncomesPage } from './pages/Incomes';
import { ReservePage } from './pages/Reserve';
import { CategoriesPage } from './pages/Categories';
const ReportsPage = lazy(() => import('./pages/Reports').then((m) => ({ default: m.ReportsPage })));
import { ForecastPage } from './pages/Forecast';
import { SettingsPage, UsersPage, applyTheme, readTheme } from './pages/Settings';
import { LoginPage, OnboardingPage } from './pages/Auth';

function Splash({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <img src="/icon.svg?v=2" alt="" className="h-14 w-14 animate-pulse" />
      {children ?? <p className="text-sm text-slate-500">Carregando suas finanças…</p>}
    </div>
  );
}

export default function App() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const init = useStore((s) => s.init);

  useEffect(() => {
    void init();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => readTheme() === 'system' && applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [init]);

  let body: ReactNode;
  if (status === 'loading') body = <Splash />;
  else if (status === 'error')
    body = (
      <Splash>
        <AlertTriangle className="text-expense" />
        <p className="max-w-sm text-sm text-slate-600 dark:text-slate-300">Não foi possível carregar os dados: {error}</p>
        <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
      </Splash>
    );
  else if (status === 'auth') body = <LoginPage />;
  else if (status === 'onboarding') body = <OnboardingPage />;
  else
    body = (
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="despesas" element={<ExpensesPage />} />
          <Route path="cartoes" element={<CardsPage />} />
          <Route path="cartoes/:id" element={<CardDetailPage />} />
          <Route path="contas" element={<BillsPage />} />
          <Route path="contas/:id" element={<BillDetailPage />} />
          <Route path="mais" element={<MorePage />} />
          <Route path="receitas" element={<IncomesPage />} />
          <Route path="reserva" element={<ReservePage />} />
          <Route path="categorias" element={<CategoriesPage />} />
          <Route path="relatorios" element={<Suspense fallback={<p className="py-10 text-center text-sm text-slate-500">Carregando relatórios…</p>}><ReportsPage /></Suspense>} />
          <Route path="proximo-mes" element={<ForecastPage />} />
          <Route path="configuracoes" element={<SettingsPage />} />
          <Route path="usuarios" element={<UsersPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    );

  return (
    <BrowserRouter>
      {body}
      {status === 'ready' && <ExpenseSheet />}
      <ConfirmHost />
      <Toasts />
      <TooltipHost />
    </BrowserRouter>
  );
}
