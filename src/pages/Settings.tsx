import { useEffect, useState } from 'react';
import { Copy, Monitor, Moon, RefreshCw, RotateCcw, Sun, UserMinus, Users } from 'lucide-react';
import { useStore } from '../store/useStore';
import { PEOPLE, PERSON_LABEL } from '../domain/types';
import { Badge, Button, Card, Field, Input, ListRow, PageHeader, Segmented, SectionTitle, cx } from '../components/ui';
import { PersonAvatar, PersonGlyph } from '../components/people';

type Theme = 'system' | 'light' | 'dark';
const THEME_KEY = 'fic-theme';

export function applyTheme(t: Theme) {
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}
export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function SettingsPage() {
  const mode = useStore((s) => s.mode);
  const resetDemo = useStore((s) => s.resetDemo);
  const reload = useStore((s) => s.reload);
  const confirm = useStore((s) => s.confirm);
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
    applyTheme(theme);
  }, [theme]);

  return (
    <div className="animate-fade-in">
      <PageHeader back title="Configurações" />
      <SectionTitle>Aparência</SectionTitle>
      <Card className="p-5">
        <Segmented
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: <span className="inline-flex items-center gap-1.5"><Monitor size={15} /> Sistema</span> },
            { value: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun size={15} /> Claro</span> },
            { value: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon size={15} /> Escuro</span> },
          ]}
        />
      </Card>

      <SectionTitle>Dados</SectionTitle>
      <Card>
        <ListRow
          title="Sincronizar agora"
          subtitle={mode === 'demo' ? 'Recarrega os dados deste navegador' : 'Busca as alterações mais recentes do servidor'}
          right={<Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => void reload()}>Atualizar</Button>}
        />
        {mode === 'demo' && (
          <div className="border-t border-slate-100 dark:border-ink-700">
            <ListRow
              title="Restaurar dados de demonstração"
              subtitle="Apaga as alterações feitas neste navegador"
              right={
                <Button
                  size="sm"
                  variant="danger"
                  icon={RotateCcw}
                  onClick={async () => {
                    if (await confirm({ title: 'Restaurar demonstração?', message: 'Todos os lançamentos feitos neste navegador serão substituídos pelos dados de exemplo.', confirmText: 'Restaurar', danger: true })) await resetDemo();
                  }}
                >
                  Restaurar
                </Button>
              }
            />
          </div>
        )}
      </Card>

      <SectionTitle>Sobre</SectionTitle>
      <Card className="p-4 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
        <p>
          <b>Modo:</b> {mode === 'demo' ? 'demonstração' : 'Supabase (dados na nuvem, compartilhados)'}
        </p>
        <p className="mt-2">Desenvolvido para facilitar o controle de gastos e o planejamento financeiro conjunto.</p>
      </Card>
    </div>
  );
}

export function UsersPage() {
  const mode = useStore((s) => s.mode);
  const me = useStore((s) => s.me);
  const members = useStore((s) => s.members);
  const household = useStore((s) => s.household);
  const rotateInvite = useStore((s) => s.rotateInvite);
  const removeMember = useStore((s) => s.removeMember);
  const updateMyProfile = useStore((s) => s.updateMyProfile);
  const setDemoPerson = useStore((s) => s.setDemoPerson);
  const toast = useStore((s) => s.toast);
  const confirm = useStore((s) => s.confirm);
  const [name, setName] = useState(me.displayName);

  return (
    <div className="animate-fade-in">
      <PageHeader back title="Usuários" subtitle="Igor e Carol compartilham o mesmo ambiente" />

      <SectionTitle>Seu perfil</SectionTitle>
      <Card className="space-y-4 p-4">
        {mode === 'demo' ? (
          <Field label="Você está usando como" hint="Define o responsável padrão nos novos lançamentos.">
            <Segmented value={me.person} onChange={(p) => setDemoPerson(p)} options={PEOPLE.map((p) => ({ value: p, label: <span className="inline-flex items-center gap-1.5"><PersonGlyph who={p} size={17} />{PERSON_LABEL[p]}</span>, ariaLabel: PERSON_LABEL[p] }))} />
          </Field>
        ) : (
          <>
            <Field label="Nome de exibição">
              <div className="flex gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
                <Button disabled={!name.trim() || name === me.displayName} onClick={() => void updateMyProfile(name.trim())}>
                  Salvar
                </Button>
              </div>
            </Field>
            <p className="text-[13px] text-slate-500">
              Vinculado como <b>{PERSON_LABEL[me.person]}</b> · {me.email}
            </p>
          </>
        )}
      </Card>

      <SectionTitle>Membros</SectionTitle>
      <Card>
        {members.map((m, i) => (
          <div key={m.userId} className={cx(i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
            <ListRow
              left={<PersonAvatar who={m.person} size={40} />}
              title={
                <span className="flex items-center gap-2">
                  {m.displayName} {m.userId === me.userId && <Badge tone="blue">você</Badge>} {m.role === 'owner' && <Badge>dono</Badge>}
                </span>
              }
              subtitle={`${PERSON_LABEL[m.person]}${m.email ? ` · ${m.email}` : ''}`}
              right={
                mode === 'supabase' && me.role === 'owner' && m.userId !== me.userId ? (
                  <Button
                    size="sm"
                    variant="danger"
                    icon={UserMinus}
                    onClick={async () => {
                      if (await confirm({ title: `Remover ${m.displayName}?`, message: 'A pessoa perde o acesso ao ambiente. Os lançamentos continuam salvos.', confirmText: 'Remover acesso', danger: true })) await removeMember(m.userId);
                    }}
                  >
                    Remover
                  </Button>
                ) : null
              }
            />
          </div>
        ))}
      </Card>

      {mode === 'supabase' && household && members.length < 2 && (
        <>
          <SectionTitle>Convidar</SectionTitle>
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15">
                <Users size={20} />
              </span>
              <p className="flex-1 text-[13px] text-slate-600 dark:text-slate-300">Peça para a outra pessoa criar uma conta e escolher “Tenho convite” com este código:</p>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-center font-mono text-xl font-bold tracking-[0.3em] text-slate-900 dark:bg-ink-900 dark:text-white">{household.inviteCode}</code>
              <Button
                variant="secondary"
                icon={Copy}
                aria-label="Copiar código"
                onClick={() => {
                  navigator.clipboard?.writeText(household.inviteCode).then(
                    () => toast('Código copiado', 'success'),
                    () => toast('Não foi possível copiar', 'error'),
                  );
                }}
              />
            </div>
            <Button variant="ghost" size="sm" icon={RefreshCw} className="mt-2" onClick={() => void rotateInvite()}>
              Gerar novo código
            </Button>
          </Card>
        </>
      )}
      {mode === 'demo' && <p className="mt-4 px-1 text-[13px] text-slate-500">No modo demonstração não há login. Com o Supabase configurado, cada um entra com seu e-mail e os dois veem os mesmos dados em tempo real.</p>}
    </div>
  );
}
