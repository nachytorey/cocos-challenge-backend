/**
 * Segundos que faltan para que se reinicie la ventana del rate limit (valor de `Retry-After`).
 * Si no se conoce el reinicio devuelve la ventana completa; nunca menos de 1 segundo.
 */
export function secondsUntilReset(
  resetTime: Date | undefined,
  windowMs: number,
  now: number = Date.now(),
): number {
  const remainingMs = resetTime ? resetTime.getTime() - now : windowMs;
  return Math.max(1, Math.ceil(remainingMs / 1000));
}
