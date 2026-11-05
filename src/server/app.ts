import { access } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RuntimeConfig } from './config.js';
import { checkStorage } from './storage.js';
import { AuthenticationError, registerAuthentication } from './auth.js';
import { registerSources } from './sources.js';
import { registerBoards } from './boards.js';

function isClientNavigation(request: FastifyRequest): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false;
  }
  if (!request.headers.accept?.split(',').some((value) => value.trim().startsWith('text/html'))) {
    return false;
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(request.url.split('?')[0] ?? '');
  } catch {
    return false;
  }

  return pathname.startsWith('/')
    && pathname !== '/api'
    && !pathname.startsWith('/api/')
    && pathname !== '/assets'
    && !pathname.startsWith('/assets/')
    && !pathname.split('/').some((segment) => segment.startsWith('.'))
    && extname(pathname) === '';
}

export async function createApp(config: RuntimeConfig, database: DatabaseSync): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error: unknown, _request, reply) => {
    if (error instanceof AuthenticationError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    const status = error instanceof Error && 'statusCode' in error
      && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500
      ? error.statusCode
      : 500;
    return reply.code(status).send({ error: status === 500 ? 'Internal server error' : 'Invalid request' });
  });

  app.get('/api/health', (_request, reply) => {
    checkStorage(database);
    return reply.header('Cache-Control', 'no-store').send({ status: 'ok', storage: 'sqlite' });
  });

  app.decorate('authentication', registerAuthentication(app, database, config.auth));
  registerSources(app, database, config.auth);
  registerBoards(app, database);

  app.setNotFoundHandler((request, reply) => {
    if (config.serveClient && isClientNavigation(request)) {
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not found' });
  });

  try {
    if (config.serveClient) {
      await access(join(config.clientDirectory, 'index.html'));
      await app.register(fastifyStatic, {
        root: config.clientDirectory,
        index: false,
        redirect: false,
      });
      app.get('/', (_request, reply) => reply.header('Cache-Control', 'no-cache').sendFile('index.html'));
    }
    await app.ready();
    return app;
  } catch (cause) {
    await app.close();
    throw new Error('Unable to initialize the HTTP runtime.', { cause });
  }
}
