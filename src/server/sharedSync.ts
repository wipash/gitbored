import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type {} from '@fastify/websocket';
import {
  InMemorySyncStorage, JsonChunkAssembler, TLSocketRoom, TLSyncErrorCloseEventCode, TLSyncErrorCloseEventReason,
  type WebSocketMinimal,
} from '@tldraw/sync-core';
import type { TLRecord } from '@tldraw/tlschema';
import { nativeSchema } from '../shared/nativeDocument.js';
import type { SharedBoard } from '../shared/sharing.js';
import { AuthenticationError, type AuthenticatedUser } from './auth.js';
import type { AuthConfig } from './config.js';
import type { SharingService } from './sharing.js';

interface Ticket {
  token: string;
  user: AuthenticatedUser;
  expires: number;
}
interface Viewer {
  authorize(): boolean;
}
interface SharedRoom {
  storage: InMemorySyncStorage<TLRecord>;
  room: TLSocketRoom<TLRecord>;
  viewers: Map<string, Viewer>;
  version: number;
}

/** SQLite board saves remain the only writer. Rooms project committed documents to viewers. */
export function registerSharedSync(app: FastifyInstance, config: AuthConfig | null, sharing: SharingService): void {
  const tickets = new Map<string, Ticket>();
  const rooms = new Map<string, SharedRoom>();
  function unavailable(): never {
    throw new AuthenticationError(404, 'share_unavailable', 'This shared board is unavailable. Ask the owner for access.');
  }
  function checkOrigin(request: FastifyRequest): void {
    if (!config || request.headers.origin !== config.origin) {
      throw new AuthenticationError(403, 'csrf', 'This connection could not be verified. Reload the shared board.');
    }
  }
  function dropRoom(boardId: string): void {
    const current = rooms.get(boardId);
    if (!current) return;
    rooms.delete(boardId);
    current.room.close();
  }
  function getRoom(publication: SharedBoard): SharedRoom {
    const existing = rooms.get(publication.id);
    if (existing) return existing;
    const storage = new InMemorySyncStorage<TLRecord>({ snapshot: {
      schema: publication.document.snapshot.schema,
      documents: Object.values(publication.document.snapshot.store).map((state) => ({ state, lastChangedClock: publication.publicationVersion })),
      // A restarted projection must not reuse clock zero for a different durable document.
      documentClock: publication.publicationVersion,
      tombstoneHistoryStartsAtClock: publication.publicationVersion,
    } });
    const viewers = new Map<string, Viewer>();
    const room = new TLSocketRoom<TLRecord>({
      schema: nativeSchema,
      storage,
      // SDK diagnostics can include document data. Report only the operation, never its arguments.
      log: {
        error: () => console.error(JSON.stringify({ event: 'shared_sync_failed', level: 'error' })),
        warn: () => console.warn(JSON.stringify({ event: 'shared_sync_warning', level: 'warning' })),
      },
      onSessionRemoved: (removedRoom, { sessionId, numSessionsRemaining }) => {
        viewers.delete(sessionId);
        if (numSessionsRemaining === 0 && rooms.get(publication.id)?.room === removedRoom) dropRoom(publication.id);
      },
    });
    const current = { storage, room, viewers, version: publication.publicationVersion };
    rooms.set(publication.id, current);
    return current;
  }
  function publish(boardId: string): void {
    const current = rooms.get(boardId);
    if (!current) return;
    try {
      // Access changes must evict viewers even when the document did not change.
      for (const viewer of [...current.viewers.values()]) viewer.authorize();
      const publication = sharing.getBoardPublication(boardId);
      if (!publication) { dropRoom(boardId); return; }
      if (publication.publicationVersion <= current.version) return;
      const records = publication.document.snapshot.store;
      // A diff keeps the client store mounted; loadSnapshot would disconnect viewers.
      current.storage.transaction((transaction) => {
        for (const id of [...transaction.keys()]) if (!Object.hasOwn(records, id)) transaction.delete(id);
        for (const record of Object.values(records)) {
          if (JSON.stringify(transaction.get(record.id)) !== JSON.stringify(record)) transaction.set(record.id, record);
        }
      });
      current.version = publication.publicationVersion;
      for (const sessionId of current.viewers.keys()) {
        current.room.sendCustomMessage(sessionId, { type: 'publication', version: current.version });
      }
    } catch {
      // A broadcast failure cannot turn an acknowledged SQLite save into a failed owner save.
      // Reconnecting clients reconstruct the room from the durable publication.
      console.error(JSON.stringify({ event: 'shared_sync_publish_failed', level: 'error' }));
      dropRoom(boardId);
    }
  }
  const unsubscribe = sharing.subscribe(publish);

  app.post<{ Params: { token: string } }>('/api/shared/:token/ticket', (request) => {
    const user = app.authentication.requireUserContext(request);
    checkOrigin(request);
    sharing.authorize(request.params.token, user.id);
    const now = Date.now();
    for (const [key, ticket] of tickets) if (ticket.expires <= now) tickets.delete(key);
    if (tickets.size >= 1000 || [...tickets.values()].filter((ticket) => ticket.user.id === user.id).length >= 16) {
      throw new AuthenticationError(429, 'too_many_connections', 'Too many connection attempts. Wait a moment, then retry.');
    }
    const ticket = randomBytes(32).toString('base64url');
    tickets.set(ticket, { token: request.params.token, user, expires: now + 30_000 });
    return { ticket };
  });

  app.get<{ Params: { token: string } }>('/api/shared/:token/connect', { websocket: true }, (socket, request) => {
    let connected: SharedRoom | undefined;
    const sessionId = randomUUID();
    let adapter: WebSocketMinimal | undefined;
    // Message handlers are attached synchronously; initialization below does no awaited I/O.
    socket.on('error', () => {
      connected?.room.handleSocketError(sessionId, adapter);
      socket.close(1011, 'Connection failed');
    });
    try {
      checkOrigin(request);
      const key = new URL(request.url, 'http://localhost').searchParams.get('ticket');
      const ticket = key ? tickets.get(key) : undefined;
      if (key) tickets.delete(key);
      const user = app.authentication.requireUser(request);
      if (!ticket || ticket.expires <= Date.now() || ticket.token !== request.params.token
        || ticket.user.id !== user.id || ticket.user.csrfToken !== user.csrfToken) unavailable();
      const boardId = sharing.authorize(request.params.token, user.id);
      const publication = sharing.getBoardPublication(boardId);
      if (!publication) unavailable();
      const current = getRoom(publication);
      connected = current;
      function authorized(): boolean {
        try {
          const latest = app.authentication.requireUser(request);
          if (latest.id !== user.id || latest.csrfToken !== user.csrfToken
            || sharing.authorize(request.params.token, user.id) !== boardId) unavailable();
          return true;
        } catch (error) {
          socket.close(TLSyncErrorCloseEventCode, error instanceof AuthenticationError && error.statusCode === 401
            ? TLSyncErrorCloseEventReason.NOT_AUTHENTICATED : TLSyncErrorCloseEventReason.FORBIDDEN);
          return false;
        }
      }
      const guarded: WebSocketMinimal = {
        get readyState() { return socket.readyState; },
        send(data) { if (authorized() && socket.readyState === 1) socket.send(data); },
        close(code, reason) { socket.close(code, reason); },
      };
      adapter = guarded;
      current.viewers.set(sessionId, { authorize: authorized });
      const assembler = new JsonChunkAssembler();
      socket.on('message', (data, binary) => {
        if (!authorized()) return;
        if (binary || !Buffer.isBuffer(data)) { socket.close(1003, 'Text messages required'); return; }
        try {
          const message = assembler.handleMessage(data.toString('utf8'));
          if (message === null) return;
          if ('error' in message) { socket.close(1008, 'Invalid synchronization message'); return; }
          const payload: unknown = message.data;
          // The editor can send document repair pushes while mounting a read-only store.
          // Keep the SDK's readonly discard/ack behavior, but forbid its independently
          // writable presence lane, including when a message arrives in chunks.
          if (typeof payload !== 'object' || payload === null || !('type' in payload)
            || (payload.type !== 'connect' && payload.type !== 'ping' && payload.type !== 'push')
            || (payload.type === 'push' && 'presence' in payload && payload.presence !== null)) {
            socket.close(TLSyncErrorCloseEventCode, TLSyncErrorCloseEventReason.FORBIDDEN);
            return;
          }
          current.room.handleSocketMessage(sessionId, message.stringified, guarded);
        }
        catch { socket.close(1008, 'Invalid synchronization message'); }
      });
      socket.on('close', () => current.room.handleSocketClose(sessionId, guarded));
      current.room.handleSocketConnect({ sessionId, socket: guarded, isReadonly: true, objectAccess: 'read' });
    } catch (error) {
      socket.close(TLSyncErrorCloseEventCode, error instanceof AuthenticationError && error.statusCode === 401
        ? TLSyncErrorCloseEventReason.NOT_AUTHENTICATED : TLSyncErrorCloseEventReason.FORBIDDEN);
    }
  });

  // Session expiry also clears a quiet viewer; every actual send still checks synchronously.
  const expiry = setInterval(() => {
    for (const current of rooms.values()) for (const viewer of current.viewers.values()) viewer.authorize();
  }, 1000);
  expiry.unref();
  app.addHook('preClose', (done) => {
    clearInterval(expiry);
    unsubscribe();
    tickets.clear();
    for (const boardId of [...rooms.keys()]) dropRoom(boardId);
    done();
  });
}
