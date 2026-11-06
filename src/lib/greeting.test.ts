import { describe, expect, it } from 'vitest';
import { greetingFor } from './greeting';

describe('saudação pelo horário', () => {
  it.each([
    [0, 'Boa noite'],
    [4, 'Boa noite'],
    [5, 'Bom dia'],
    [11, 'Bom dia'],
    [12, 'Boa tarde'],
    [17, 'Boa tarde'],
    [18, 'Boa noite'],
    [23, 'Boa noite'],
  ])('%ih → %s', (h, g) => expect(greetingFor(h)).toBe(g));
});
