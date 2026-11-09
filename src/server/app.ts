import { access } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
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
import { RepositoryAccessError } from './sourceProvider.js';
import { requestErrorDetails } from './requestDiagnostics.js';
import { createGitHubCacheInvalidation } from './cacheInvalidation.js';

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
  const app = Fastify({ logger: false, requestIdHeader: false, genReqId: () => randomUUID() });
  let draining = false;
  app.addHook('preClose', (done) => { draining = true; done(); });
  app.addHook('onResponse', (_request, _reply, done) => {
    // server.close() only reaps connections already idle when shutdown starts.
    // Reap again after active responses finish, without cutting those responses short.
    if (draining) app.server.closeIdleConnections();
    done();
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    const status = error instanceof AuthenticationError ? error.statusCode
      : error instanceof Error && 'statusCode' in error
        && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode : 500;
    if (status >= 500) {
      // Only the registered route template is safe: raw URLs, headers and exception
      // messages can contain OAuth codes, credentials or private board content.
      console.error(JSON.stringify({ event: 'server_request_failed', level: 'error',
        requestId: request.id, method: request.method, route: request.routeOptions.url ?? 'unmatched',
        statusCode: status, ...requestErrorDetails(error) }));
      reply.header('X-Request-Id', request.id);
    }
    if (error instanceof AuthenticationError) {
      if (error instanceof RepositoryAccessError) console.warn(JSON.stringify(error.diagnostic));
      return reply.code(error.statusCode).send({ error: error.code, message: error.message,
        ...(error.code === 'sso_required' && error.ssoOrganization ? { ssoOrganization: error.ssoOrganization } : {}) });
    }
    return reply.code(status).send({ error: status === 500 ? 'Internal server error' : 'Invalid request' });
  });

  app.get('/api/health', (_request, reply) => {
    checkStorage(database);
    return reply.header('Cache-Control', 'no-store').send({ status: 'ok', storage: 'sqlite' });
  });

  app.get('/api/client-config.js', (_request, reply) => reply
    .header('Cache-Control', 'no-store')
    .type('application/javascript; charset=utf-8')
    .send(`window.gitboredConfig = ${JSON.stringify({ tldrawKey: config.tldrawKey })};`));

  const cacheInvalidation = createGitHubCacheInvalidation(database);
  app.decorate('authentication', registerAuthentication(app, database, config.auth, cacheInvalidation));
  registerSources(app, database, config.auth, cacheInvalidation);
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
