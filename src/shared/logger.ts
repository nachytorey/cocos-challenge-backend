import pino, { type DestinationStream, type Logger } from 'pino';

export type { Logger };

export interface LoggerOptions {
  level: string;
  destination?: DestinationStream;
}

/** Nunca loguear secretos ni datos personales (principio XIV). */
export const REDACTED_PATHS = ['req.headers.cookie', 'req.headers.authorization', '*.email'];

export function createLogger({ level, destination }: LoggerOptions): Logger {
  const options = { level, redact: { paths: REDACTED_PATHS } };
  return destination ? pino(options, destination) : pino(options);
}
