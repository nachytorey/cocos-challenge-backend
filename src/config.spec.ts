import { ConfigError, loadConfig, loadConfigOrExit } from './config';

const validEnv = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };

describe('loadConfig', () => {
  it('rechaza DATABASE_URL ausente nombrando la variable', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('rechaza PORT no numérico nombrando la variable', () => {
    expect(() => loadConfig({ ...validEnv, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('aplica los defaults de .env.example', () => {
    const config = loadConfig(validEnv);
    expect(config).toMatchObject({
      nodeEnv: 'development',
      port: 3000,
      dbPoolMax: 10,
      dbStatementTimeoutMs: 5000,
      dbLockTimeoutMs: 5000,
      dbIdleInTxTimeoutMs: 10000,
      requestTimeoutMs: 10000,
      shutdownTimeoutMs: 10000,
      trustProxy: 0,
      bodyLimit: '100kb',
      rateLimitWindowMs: 60000,
      rateLimitMax: 300,
      ordersRateLimitMax: 30,
      logLevel: 'info',
    });
  });

  it('separa CORS_ORIGINS por comas', () => {
    const config = loadConfig({ ...validEnv, CORS_ORIGINS: 'http://a.com, http://b.com' });
    expect(config.corsOrigins).toEqual(['http://a.com', 'http://b.com']);
  });
});

describe('getConfig', () => {
  const original = process.env;
  afterEach(() => {
    process.env = original;
    jest.resetModules();
  });

  it('lee process.env una sola vez y cachea el resultado', () => {
    process.env = {
      ...original,
      NODE_ENV: 'production',
      DATABASE_URL: validEnv.DATABASE_URL,
      PORT: '4000',
    };
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- módulo aislado con env propio
      const { getConfig } = require('./config') as typeof import('./config');
      const first = getConfig();
      process.env.PORT = '5000';
      expect(first.port).toBe(4000);
      expect(getConfig()).toBe(first);
    });
  });

  it('fuera de producción también carga .env sin fallar', () => {
    process.env = { ...original, NODE_ENV: 'test', DATABASE_URL: validEnv.DATABASE_URL };
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- módulo aislado con env propio
      const { getConfig } = require('./config') as typeof import('./config');
      expect(getConfig().nodeEnv).toBe('test');
    });
  });
});

describe('loadConfigOrExit', () => {
  it('escribe el error en stderr (no console) y termina el proceso con código 1', () => {
    const write = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const consoleError = jest.spyOn(console, 'error');

    loadConfigOrExit({});

    expect(write).toHaveBeenCalledWith(expect.stringContaining('DATABASE_URL'));
    expect(exit).toHaveBeenCalledWith(1);
    expect(consoleError).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('devuelve la config cuando es válida', () => {
    expect(loadConfigOrExit(validEnv).databaseUrl).toBe(validEnv.DATABASE_URL);
  });
});
