import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { Button, Card, Field, MoneyInput, PageHeader } from '../components/ui';
import { brl } from '../lib/money';

/** Valor do mês seguinte que fica fora do "Pode gastar" no crédito. */
export function RemainingValuePage() {
  const floor = useStore((s) => s.nextMonthFloorCents);
  const setNextMonthFloor = useStore((s) => s.setNextMonthFloor);
  const [value, setValue] = useState(floor);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(floor), [floor]);
  const changed = value !== floor;

  return (
    <div className="animate-fade-in">
      <PageHeader back title="Saldo Remanescente" subtitle="Quanto deve sobrar na conta do próximo mês" />
      <Card className="p-4">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!changed || saving) return;
            setSaving(true);
            await setNextMonthFloor(value);
            setSaving(false);
          }}
        >
          <Field label="Informe o valor desejado" hint={`Valor atual: ${brl(floor)}`}>
            <MoneyInput value={value} onChange={setValue} />
          </Field>
          <div className="mt-3 flex gap-2">
            {changed && (
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setValue(floor)}>
                Cancelar
              </Button>
            )}
            <Button type="submit" className="flex-1" disabled={!changed} loading={saving}>
              Salvar
            </Button>
          </div>
        </form>
      </Card>
      <p className="mt-4 px-1 text-[13px] leading-relaxed text-slate-500">
        Saldo remanescente do próximo mês: Calcula o quanto dá para gastar por dia até o próximo pagamento (dia 05) deixando essa quantia livre na conta do mês seguinte.
      </p>
    </div>
  );
}
