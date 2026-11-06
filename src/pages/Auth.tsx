import { useState } from 'react';
import { KeyRound, LogOut, Mail, UserPlus, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useStore } from '../store/useStore';
import { PEOPLE, PERSON_LABEL, type Person } from '../domain/types';
import { Button, Card, Field, Input, Segmented } from '../components/ui';

function Shell({ children, subtitle }: { children: React.ReactNode; subtitle: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm animate-pop-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/icon.svg?v=2" alt="" className="mb-4 h-16 w-16" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Finanças Igor e Carol</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setMsg(null);
    const { data, error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } });
    setLoading(false);
    if (error) return setMsg({ kind: 'error', text: translate(error.message) });
    if (mode === 'signup' && !data.session) setMsg({ kind: 'info', text: 'Conta criada! Confirme o e-mail recebido e depois entre.' });
  }

  return (
    <Shell subtitle="Controle financeiro compartilhado">
      <Card className="p-5">
        <Segmented
          value={mode}
          onChange={(v) => (setMode(v), setMsg(null))}
          options={[
            { value: 'login', label: 'Entrar' },
            { value: 'signup', label: 'Criar conta' },
          ]}
        />
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label="E-mail">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
          </Field>
          <Field label="Senha" hint={mode === 'signup' ? 'Mínimo de 6 caracteres' : undefined}>
            <Input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {msg && <p className={msg.kind === 'error' ? 'text-sm text-expense' : 'text-sm text-income'}>{msg.text}</p>}
          <Button type="submit" size="lg" className="w-full" loading={loading} icon={mode === 'login' ? KeyRound : Mail}>
            {mode === 'login' ? 'Entrar' : 'Criar conta'}
          </Button>
        </form>
      </Card>
    </Shell>
  );
}

const translate = (m: string) =>
  m.includes('Invalid login') ? 'E-mail ou senha incorretos.' : m.includes('already registered') ? 'Este e-mail já possui conta. Use “Entrar”.' : m.includes('Email not confirmed') ? 'Confirme seu e-mail antes de entrar.' : m;

export function OnboardingPage() {
  const createHousehold = useStore((s) => s.createHousehold);
  const joinHousehold = useStore((s) => s.joinHousehold);
  const signOut = useStore((s) => s.signOut);
  const [choice, setChoice] = useState<'create' | 'join'>('create');
  const [person, setPerson] = useState<Person>('igor');
  const [name, setName] = useState('Igor');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      if (choice === 'create') await createHousehold(person, name.trim() || PERSON_LABEL[person]);
      else await joinHousehold(code, person, name.trim() || PERSON_LABEL[person]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell subtitle="Vamos configurar o ambiente compartilhado">
      <Card className="p-5">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Quem é você?">
            <Segmented
              value={person}
              onChange={(p) => {
                setPerson(p);
                setName(PERSON_LABEL[p]);
              }}
              options={PEOPLE.map((p) => ({ value: p, label: PERSON_LABEL[p] }))}
            />
          </Field>
          <Field label="Como quer ser chamado(a)?">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </Field>
          <Segmented
            value={choice}
            onChange={setChoice}
            options={[
              { value: 'create', label: <span className="inline-flex items-center gap-1.5"><UserPlus size={15} /> Criar ambiente</span> },
              { value: 'join', label: <span className="inline-flex items-center gap-1.5"><Users size={15} /> Tenho convite</span> },
            ]}
          />
          {choice === 'create' ? (
            <p className="text-[13px] text-slate-500">Um novo ambiente será criado com as categorias, cartões e receitas iniciais. Depois, compartilhe o código de convite com a outra pessoa.</p>
          ) : (
            <Field label="Código de convite">
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Ex.: 4F9A12BC" required maxLength={12} className="font-mono uppercase tracking-widest" />
            </Field>
          )}
          {err && <p className="text-sm text-expense">{err}</p>}
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            {choice === 'create' ? 'Criar ambiente' : 'Entrar no ambiente'}
          </Button>
        </form>
      </Card>
      <Button variant="ghost" className="mx-auto mt-4 flex" icon={LogOut} onClick={() => void signOut()}>
        Sair
      </Button>
    </Shell>
  );
}
