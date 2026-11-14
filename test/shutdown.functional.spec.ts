import { request as httpRequest } from 'node:http';
import { createServer, type AddressInfo } from 'node:net';
import express from 'express';
import request from 'supertest';
import { startServer } from '../src/server';
import { createDataSource } from '../src/data-source';
import { createApp, createLifecycle } from '../src/app';
import { createLogger } from '../src/shared/logger';
import { testConfig } from './helpers/db';

function get(port: number, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ port, path, agent: false }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('arranque con el puerto ocupado', () => {
  it('loguea un error claro con el puerto y termina el proceso con código 1', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, resolve));
    const { port } = blocker.address() as AddressInfo;

    const config = testConfig({ port });
    const logger = createLogger({ level: 'silent' });
    const fatal = jest.spyOn(logger, 'fatal');
    const exited = new Promise<number | undefined>((resolve) => {
      jest.spyOn(process, 'exit').mockImplementation((code) => {
        resolve(typeof code === 'number' ? code : undefined);
        return undefined as never;
      });
    });

    startServer({
      app: express(),
      config,
      dataSource: createDataSource(config),
      logger,
      lifecycle: createLifecycle(),
    });

    await expect(exited).resolves.toBe(1);
    expect(fatal).toHaveBeenCalledWith(
      expect.objectContaining({ port }),
      expect.stringContaining('already in use'),
    );
    jest.restoreAllMocks();
    await new Promise((resolve) => blocker.close(resolve));
  });
});

describe('graceful shutdown', () => {
  it('termina los requests en curso, deja de estar listo, rechaza conexiones nuevas y cierra la base', async () => {
    const config = testConfig({ port: 0, shutdownTimeoutMs: 5000 });
    const dataSource = createDataSource(config);
    await dataSource.initialize();
    const lifecycle = createLifecycle();
    const logger = createLogger({ level: 'silent' });
    const app = createApp({ config, dataSource, logger, lifecycle });

    const outer = express();
    outer.get('/__slow', (_req, res) => {
      setTimeout(() => res.status(200).send('ok'), 500);
    });
    outer.use(app);

    const { server, shutdown } = startServer({ app: outer, config, dataSource, logger, lifecycle });
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;

    const inFlight = get(port, '/__slow');
    await new Promise((r) => setTimeout(r, 100));
    const done = shutdown();

    // Durante el apagado la app reporta "no lista".
    await request(app).get('/health/ready').expect(503);
    // El servidor ya no acepta conexiones nuevas.
    await expect(get(port, '/health/live')).rejects.toThrow();
    // El request en curso termina bien.
    await expect(inFlight).resolves.toBe(200);

    await done;
    expect(dataSource.isInitialized).toBe(false);
  });
});
