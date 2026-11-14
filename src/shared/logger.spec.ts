import { Writable } from 'node:stream';
import { createLogger } from './logger';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { stream, lines };
}

describe('createLogger', () => {
  it('redacta cookie, authorization y email', () => {
    const { stream, lines } = capture();
    const logger = createLogger({ level: 'info', destination: stream });
    logger.info(
      {
        req: { headers: { cookie: 'session=abc', authorization: 'Bearer xyz', host: 'h' } },
        user: { email: 'a@b.com', id: 1 },
      },
      'evento',
    );
    const out = lines.join('');
    expect(out).not.toMatch(/session=abc|Bearer xyz|a@b\.com/);
    const parsed = JSON.parse(out) as {
      req: { headers: Record<string, string> };
      user: Record<string, unknown>;
    };
    expect(parsed.req.headers.cookie).toBe('[Redacted]');
    expect(parsed.req.headers.authorization).toBe('[Redacted]');
    expect(parsed.user.email).toBe('[Redacted]');
    expect(parsed.req.headers.host).toBe('h');
  });

  it('respeta el nivel configurado', () => {
    const { stream, lines } = capture();
    const logger = createLogger({ level: 'warn', destination: stream });
    logger.info('no se ve');
    logger.warn('se ve');
    expect(lines).toHaveLength(1);
    expect(logger.level).toBe('warn');
  });
});
