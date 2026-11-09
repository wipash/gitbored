import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { readCachedBoardMetadata, type CachedBoardMetadataItem } from '../shared/cachedMetadata.js';
import { validateIncoming } from '../shared/incoming.js';
import { getDocumentReferenceIds, validateNativeDocument } from '../shared/nativeDocument.js';
import { readItemContext } from '../shared/planning.js';
import { readSourceItem } from '../shared/sources.js';
import { readSharedBoard, readSharedBoardDetails, readSharingSettings, shareTokenPattern, sharingUpdateValidator, type SharedBoard, type SharingSettings } from '../shared/sharing.js';
import { AuthenticationError } from './auth.js';

export interface SharingService {
  authorize(token: string, userId: string): string;
  getAuthorizedShared(token: string, userId: string): SharedBoard;
  getBoardPublication(boardId: string): SharedBoard | null;
  subscribe(listener: (boardId: string) => void): () => void;
  /** Runs inside the caller's transaction; never notifies before commit. */
  publish(boardId: string): void;
  notify(boardId: string): void;
  cacheUpdated(userId: string, key: string): string[];
}

export function initializeSharing(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS board_shares (
      board_id TEXT PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      mode TEXT NOT NULL DEFAULT 'private' CHECK(mode IN ('private','link','people')),
      version INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NOT NULL DEFAULT '{"items":[]}',
      published_at INTEGER NOT NULL DEFAULT 0,
      publication_version INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS board_share_people (
      board_id TEXT NOT NULL REFERENCES board_shares(board_id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      PRIMARY KEY(board_id,user_id)
    );
  `);
}

function unavailable(): never {
  throw new AuthenticationError(404, 'shared_board_unavailable', 'This shared board is unavailable. Ask its owner to check your access.');
}

export function registerSharing(app: FastifyInstance, database: DatabaseSync): SharingService {
  const listeners = new Set<(boardId: string) => void>();
  function notify(boardId: string) {
    for (const listener of listeners) {
      try { listener(boardId); }
      catch {
        // A committed save stays successful even if a live viewer must reconnect.
        console.error(JSON.stringify({ event: 'shared_board_broadcast_failed', level: 'error' }));
      }
    }
  }
  function owner(boardId: string, userId: string) {
    if (!database.prepare('SELECT 1 FROM boards WHERE id=? AND owner_id=?').get(boardId, userId)) unavailable();
  }
  function authorize(token: string, userId: string): string {
    if (!shareTokenPattern.test(token)) return unavailable();
    const row = database.prepare(`SELECT b.id FROM board_shares s JOIN boards b ON b.id=s.board_id
      WHERE s.token=? AND (b.owner_id=? OR s.mode='link' OR (s.mode='people' AND EXISTS
        (SELECT 1 FROM board_share_people p WHERE p.board_id=b.id AND p.user_id=?)))`).get(token, userId, userId);
    if (typeof row?.['id'] !== 'string') return unavailable();
    return row['id'];
  }
  function getBoardPublication(boardId: string): SharedBoard | null {
    const row = database.prepare(`SELECT b.id,b.title,b.revision,b.document,b.incoming,s.metadata,
      s.published_at AS publishedAt,s.publication_version AS publicationVersion
      FROM boards b JOIN board_shares s ON s.board_id=b.id WHERE b.id=?`).get(boardId);
    if (!row) return null;
    if (typeof row['document'] !== 'string' || typeof row['incoming'] !== 'string' || typeof row['metadata'] !== 'string') throw new Error('Invalid shared board');
    const { incoming, document, metadata, ...summary } = row;
    const parsedDocument: unknown = JSON.parse(document);
    const parsedMetadata: unknown = JSON.parse(metadata);
    return readSharedBoard({ ...summary, document: parsedDocument,
      planning: validateIncoming(JSON.parse(incoming)).planning ?? null, metadata: parsedMetadata });
  }
  function getAuthorizedShared(token: string, userId: string): SharedBoard {
    return getBoardPublication(authorize(token, userId)) ?? unavailable();
  }
  function settings(boardId: string): SharingSettings {
    const row = database.prepare('SELECT token,mode,version FROM board_shares WHERE board_id=?').get(boardId);
    if (!row || typeof row['token'] !== 'string') throw new Error('Missing sharing settings');
    const people = database.prepare(`SELECT u.id,u.login,u.name FROM board_share_people p JOIN users u ON u.id=p.user_id
      WHERE p.board_id=? ORDER BY lower(u.login),u.id`).all(boardId);
    return readSharingSettings({ mode: row['mode'], version: row['version'], path: `/share/${row['token']}`, people });
  }
  function publish(boardId: string) {
    const board = database.prepare(`SELECT b.owner_id,b.document,s.metadata FROM boards b
      JOIN board_shares s ON s.board_id=b.id WHERE b.id=?`).get(boardId);
    if (!board) return;
    if (typeof board['owner_id'] !== 'string' || typeof board['document'] !== 'string' || typeof board['metadata'] !== 'string') throw new Error('Invalid shared board');
    const ownerId = board['owner_id'];
    const placed = getDocumentReferenceIds(validateNativeDocument(JSON.parse(board['document'])));
    const previous = new Map(readCachedBoardMetadata(JSON.parse(board['metadata'])).items.map((entry) => [entry.item.reference.id, entry]));
    const lookup = database.prepare(`SELECT c.payload FROM github_cache c JOIN item_references r ON r.id=? AND r.user_id=c.user_id
      WHERE c.user_id=? AND c.cache_key=?`);
    function cached<T>(referenceId: string, key: string, parse: (value: unknown) => T): T | null {
      const row = lookup.get(referenceId, ownerId, key);
      if (typeof row?.['payload'] !== 'string') return null;
      try { return parse(JSON.parse(row['payload'])); }
      catch { return null; } // Optional malformed cache never replaces a valid publication.
    }
    const items: CachedBoardMetadataItem[] = [];
    for (const referenceId of placed) {
      const old = previous.get(referenceId);
      const fetched = cached(referenceId, `reference:${referenceId}`, readSourceItem);
      const item = fetched?.reference.id === referenceId ? fetched : old?.item;
      if (!item) continue;
      const context = cached(referenceId, `context:${referenceId}`, readItemContext) ?? old?.context ?? null;
      items.push({ item, context, stale: false, contextStale: false });
    }
    // A publication is durable board content, not an authorization cache. Old
    // details survive provider/cache loss; removing a placement always prunes them.
    database.prepare(`UPDATE board_shares SET metadata=?,published_at=?,publication_version=publication_version+1 WHERE board_id=?`)
      .run(JSON.stringify({ items }), Date.now(), boardId);
  }
  function ensure(boardId: string) {
    database.prepare('INSERT OR IGNORE INTO board_shares (board_id,token) VALUES (?,?)').run(boardId, randomBytes(32).toString('base64url'));
    const row = database.prepare('SELECT publication_version FROM board_shares WHERE board_id=?').get(boardId);
    if (row?.['publication_version'] === 0) publish(boardId);
  }
  function cacheUpdated(userId: string, key: string) {
    const match = /^(?:reference|context):([A-Za-z0-9_-]{1,128})$/.exec(key);
    const referenceId = match?.[1];
    if (!referenceId) return [];
    const rows = database.prepare(`SELECT DISTINCT b.id FROM boards b JOIN board_shares s ON s.board_id=b.id,
      json_each(b.document,'$.snapshot.store') r
      WHERE b.owner_id=? AND s.mode!='private' AND json_extract(r.value,'$.type')='item-card'
      AND json_extract(r.value,'$.props.referenceId')=?`).all(userId, referenceId);
    return rows.map((row) => {
      if (typeof row['id'] !== 'string') throw new Error('Invalid shared board identifier');
      publish(row['id']);
      return row['id'];
    });
  }
  app.get<{ Params: { id: string } }>('/api/boards/:id/sharing', (request) => {
    const user = app.authentication.requireUserContext(request);
    owner(request.params.id, user.id);
    ensure(request.params.id);
    return settings(request.params.id);
  });
  app.put<{ Params: { id: string } }>('/api/boards/:id/sharing', (request) => {
    const user = app.authentication.requireUserContext(request);
    const boardId = request.params.id;
    owner(boardId, user.id);
    let update;
    try { update = sharingUpdateValidator.validate(request.body); }
    catch { throw new AuthenticationError(400, 'invalid_sharing', 'Choose an access setting and up to 100 existing GitHub usernames.'); }
    const people = new Set<string>();
    for (const login of update.logins) {
      const matches = database.prepare('SELECT id FROM users WHERE lower(login)=lower(?)').all(login);
      const id = matches.length === 1 ? matches[0]?.['id'] : undefined;
      if (typeof id !== 'string') throw new AuthenticationError(400, 'person_unavailable', 'A username was not found or is ambiguous. Ask that person to sign in to GitBored, then try again.');
      if (id !== user.id) people.add(id);
    }
    database.exec('BEGIN IMMEDIATE');
    try {
      ensure(boardId);
      const result = database.prepare('UPDATE board_shares SET mode=?,version=version+1 WHERE board_id=? AND version=?').run(update.mode, boardId, update.expectedVersion);
      if (!result.changes) throw new AuthenticationError(409, 'sharing_conflict', 'Sharing changed in another tab. Reload sharing settings before trying again.');
      database.prepare('DELETE FROM board_share_people WHERE board_id=?').run(boardId);
      const insert = database.prepare('INSERT INTO board_share_people (board_id,user_id) VALUES (?,?)');
      for (const id of people) insert.run(boardId, id);
      publish(boardId);
      database.exec('COMMIT');
    } catch (error) { database.exec('ROLLBACK'); throw error; }
    notify(boardId);
    return settings(boardId);
  });
  app.get<{ Params: { token: string } }>('/api/shared/:token', (request) => {
    const user = app.authentication.requireUserContext(request);
    return getAuthorizedShared(request.params.token, user.id);
  });
  app.get<{ Params: { token: string } }>('/api/shared/:token/details', (request) => {
    const user = app.authentication.requireUserContext(request);
    const boardId = authorize(request.params.token, user.id);
    const row = database.prepare(`SELECT b.id,b.title,b.revision,b.incoming,s.metadata,
      s.published_at AS publishedAt,s.publication_version AS publicationVersion
      FROM boards b JOIN board_shares s ON s.board_id=b.id WHERE b.id=?`).get(boardId);
    if (!row || typeof row['incoming'] !== 'string' || typeof row['metadata'] !== 'string') throw new Error('Invalid shared details');
    const { incoming, metadata, ...summary } = row;
    const parsedMetadata: unknown = JSON.parse(metadata);
    return readSharedBoardDetails({ ...summary, planning: validateIncoming(JSON.parse(incoming)).planning ?? null, metadata: parsedMetadata });
  });
  return { authorize, getAuthorizedShared, getBoardPublication, publish, notify, cacheUpdated,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}
