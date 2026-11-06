import { useEffect, useState } from 'react';

/** Saudação conforme o horário: 5h–11h59 bom dia, 12h–17h59 boa tarde, demais boa noite. */
export function greetingFor(hour: number): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Atualiza a saudação sozinha (a cada minuto e ao voltar para o app). */
export function useGreeting() {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const tick = () => setHour(new Date().getHours());
    const t = setInterval(tick, 60_000);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return greetingFor(hour);
}
