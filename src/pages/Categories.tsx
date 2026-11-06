import { useMemo, useState } from 'react';
import { Plus, Tags, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { categoryUsage } from '../domain/finance';
import type { Category } from '../domain/types';
import { brl } from '../lib/money';
import { monthOf } from '../lib/months';
import { Button, Card, EmptyState, Field, Input, ListRow, PageHeader, Select, Sheet, cx, useResetOnOpen } from '../components/ui';
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoryIcon, ICON_LABELS } from '../components/icons';

export function CategoriesPage() {
  const data = useStore((s) => s.data);
  const month = useStore((s) => s.month);
  const [form, setForm] = useState<{ open: boolean; cat?: Category }>({ open: false });
  const cats = useMemo(() => data.categories.filter((c) => !c.archivedAt).sort((a, b) => a.sortOrder - b.sortOrder), [data.categories]);
  const monthTotals = useMemo(() => {
    const m = new Map<string, { total: number; count: number }>();
    for (const e of data.expenses) {
      if (monthOf(e.date) !== month) continue;
      const cur = m.get(e.categoryId) ?? { total: 0, count: 0 };
      m.set(e.categoryId, { total: cur.total + e.amountCents, count: cur.count + 1 });
    }
    return m;
  }, [data.expenses, month]);

  return (
    <div className="animate-fade-in">
      <PageHeader back title="Categorias" subtitle="Compras do mês selecionado por categoria" actions={<Button size="sm" icon={Plus} onClick={() => setForm({ open: true })}>Nova</Button>} />
      <Card>
        {cats.length === 0 ? (
          <EmptyState icon={Tags} title="Nenhuma categoria" action={<Button onClick={() => setForm({ open: true })}>Criar categoria</Button>} />
        ) : (
          cats.map((c, i) => {
            const t = monthTotals.get(c.id);
            const u = categoryUsage(data, c.id);
            return (
              <div key={c.id} className={cx(i > 0 && 'border-t border-slate-100 dark:border-ink-700')}>
                <ListRow
                  onClick={() => setForm({ open: true, cat: c })}
                  left={<CategoryIcon icon={c.icon} color={c.color} size={42} />}
                  title={c.name}
                  subtitle={`${u.expenses} lançamentos no total${u.bills ? ` · ${u.bills} contas fixas` : ''}`}
                  right={
                    <div>
                      <p className="text-[15px] font-semibold tabular-nums text-slate-900 dark:text-white">{brl(t?.total ?? 0)}</p>
                      <p className="text-[12px] text-slate-500">{t?.count ?? 0} no mês</p>
                    </div>
                  }
                />
              </div>
            );
          })
        )}
      </Card>
      <CategorySheet open={form.open} cat={form.cat} onClose={() => setForm({ open: false })} />
    </div>
  );
}

function CategorySheet({ open, cat, onClose }: { open: boolean; cat?: Category; onClose: () => void }) {
  const data = useStore((s) => s.data);
  const saveCategory = useStore((s) => s.saveCategory);
  const deleteCategory = useStore((s) => s.deleteCategory);
  const confirm = useStore((s) => s.confirm);
  const [f, setF] = useResetOnOpen(open, () => ({ name: cat?.name ?? '', icon: cat?.icon ?? 'Tag', color: cat?.color ?? CATEGORY_COLORS[6] }));
  const [delOpen, setDelOpen] = useState(false);
  const [target, setTarget] = useState('');
  const usage = cat ? categoryUsage(data, cat.id) : { expenses: 0, bills: 0 };
  const others = data.categories.filter((c) => c.id !== cat?.id && !c.archivedAt);

  async function save() {
    await saveCategory({ ...cat, ...f, id: cat?.id });
    onClose();
  }
  async function remove() {
    if (!cat) return;
    if (usage.expenses || usage.bills) {
      setTarget(others[0]?.id ?? '');
      setDelOpen(true);
      return;
    }
    if (await confirm({ title: `Excluir ${cat.name}?`, confirmText: 'Excluir', danger: true })) {
      await deleteCategory(cat.id);
      onClose();
    }
  }

  return (
    <>
      <Sheet
        open={open && !delOpen}
        onClose={onClose}
        title={cat ? 'Editar categoria' : 'Nova categoria'}
        footer={
          <div className="flex gap-2">
            {cat && <Button variant="danger" size="lg" icon={Trash2} onClick={remove} aria-label="Excluir categoria" />}
            <Button size="lg" className="flex-1" disabled={!f.name.trim()} onClick={save}>
              Salvar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <CategoryIcon icon={f.icon} color={f.color} size={56} />
            <Field label="Nome">
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Pet, Viagem…" maxLength={30} autoFocus={!cat} />
            </Field>
          </div>
          <div>
            <span className="mb-2 block text-[13px] font-medium text-slate-600 dark:text-slate-300">Cor</span>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_COLORS.map((c) => (
                <button key={c} type="button" aria-label={`Usar esta cor`} onClick={() => setF({ ...f, color: c })} className={cx('h-9 w-9 rounded-full', f.color === c && 'ring-4 ring-slate-300 ring-offset-2 dark:ring-offset-ink-800')} style={{ background: c }} />
              ))}
            </div>
          </div>
          <div>
            <span className="mb-2 block text-[13px] font-medium text-slate-600 dark:text-slate-300">Ícone</span>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
              {Object.entries(CATEGORY_ICONS).map(([name, I]) => (
                <button
                  key={name}
                  type="button"
                  aria-label={ICON_LABELS[name] ?? name}
                  aria-pressed={f.icon === name}
                  onClick={() => setF({ ...f, icon: name })}
                  className={cx('flex aspect-square items-center justify-center rounded-2xl transition', f.icon === name ? 'text-white' : 'bg-slate-100 text-slate-600 dark:bg-ink-900 dark:text-slate-300')}
                  style={f.icon === name ? { background: f.color } : undefined}
                >
                  <I size={20} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={delOpen}
        onClose={() => setDelOpen(false)}
        title={`Excluir ${cat?.name}`}
        footer={
          <Button
            variant="danger"
            size="lg"
            className="w-full"
            disabled={!target}
            onClick={async () => {
              await deleteCategory(cat!.id, target);
              setDelOpen(false);
              onClose();
            }}
          >
            Reclassificar e excluir
          </Button>
        }
      >
        <p className="mb-4 text-[15px] text-slate-600 dark:text-slate-300">
          Esta categoria possui {usage.expenses} lançamento(s){usage.bills ? ` e ${usage.bills} conta(s) fixa(s)` : ''}. Escolha para qual categoria eles serão movidos antes da exclusão.
        </p>
        <Field label="Mover lançamentos para">
          <Select value={target} onChange={setTarget}>
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </Sheet>
    </>
  );
}
