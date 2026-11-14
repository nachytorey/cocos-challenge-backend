import { secondsUntilReset } from './rate-limit';

describe('secondsUntilReset', () => {
  const now = Date.parse('2026-11-14T12:00:00.000Z');

  it('devuelve los segundos que faltan para que se reinicie la ventana, redondeando hacia arriba', () => {
    expect(secondsUntilReset(new Date(now + 40_000), 60_000, now)).toBe(40);
    expect(secondsUntilReset(new Date(now + 40_001), 60_000, now)).toBe(41);
  });

  it('nunca devuelve menos de 1 segundo', () => {
    expect(secondsUntilReset(new Date(now + 10), 60_000, now)).toBe(1);
    expect(secondsUntilReset(new Date(now - 5_000), 60_000, now)).toBe(1);
  });

  it('si no se conoce el reinicio, devuelve la ventana completa', () => {
    expect(secondsUntilReset(undefined, 60_000, now)).toBe(60);
    expect(secondsUntilReset(undefined, 1_500, now)).toBe(2);
  });
});
