import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { boardNameValidator, boardSaveValidator, boardSummaryValidator, createEmptyBoardDocument, type Board } from '../shared/boards.js';
import { MAX_NATIVE_DOCUMENT_BYTES, validateNativeDocument } from '../shared/nativeDocument.js';
import { AuthenticationError } from './auth.js';

const columns = 'id, title, revision, created_at AS createdAt, updated_at AS updatedAt';
export function registerBoards(app: FastifyInstance, database: DatabaseSync): void {
  function ownedRevision(id: string, owner: string): number {
    const row = database.prepare('SELECT revision FROM boards WHERE id = ? AND owner_id = ?').get(id, owner);
    if (!row) throw new AuthenticationError(404, 'board_not_found', 'This board is unavailable. Return to Boards.');
    if (typeof row['revision'] !== 'number') throw new Error('Invalid stored revision');
    return row['revision'];
  }
  function load(id: string, owner: string): Board {
    const row = database.prepare(`SELECT ${columns}, document FROM boards WHERE id = ? AND owner_id = ?`).get(id, owner);
    if (!row) throw new AuthenticationError(404, 'board_not_found', 'This board is unavailable. Return to Boards.');
    if (typeof row['document'] !== 'string') throw new Error('Invalid stored document');
    const { document, ...summary } = row;
    return { ...boardSummaryValidator.validate(summary), document: validateNativeDocument(JSON.parse(document)) };
  }
  function invalid(): never {
    throw new AuthenticationError(400, 'invalid_board', 'Use a board name from 1 to 160 characters and a supported native document.');
  }
  app.get('/api/boards', (request) => {
    const user = app.authentication.requireUser(request);
    return { boards: database.prepare(`SELECT ${columns} FROM boards WHERE owner_id = ? ORDER BY updated_at DESC, id`).all(user.id).map((row) => boardSummaryValidator.validate(row)) };
  });
  app.post('/api/boards', (request, reply) => {
    const user = app.authentication.requireUser(request);
    let title: string;
    try { title = boardNameValidator.validate(request.body).title.trim(); } catch { return invalid(); }
    const id = randomUUID();
    const now = Date.now();
    database.prepare('INSERT INTO boards (id, owner_id, title, document, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)')
      .run(id, user.id, title, JSON.stringify(createEmptyBoardDocument()), now, now);
    return reply.code(201).send(load(id, user.id));
  });
  app.get<{ Params: { id: string } }>('/api/boards/:id', (request) => load(request.params.id, app.authentication.requireUser(request).id));
  app.patch<{ Params: { id: string } }>('/api/boards/:id', (request) => {
    const user = app.authentication.requireUser(request);
    ownedRevision(request.params.id, user.id);
    let title: string;
    try { title = boardNameValidator.validate(request.body).title.trim(); } catch { return invalid(); }
    database.prepare('UPDATE boards SET title = ?, updated_at = ? WHERE id = ? AND owner_id = ?').run(title, Date.now(), request.params.id, user.id);
    return load(request.params.id, user.id);
  });
  app.put<{ Params: { id: string } }>('/api/boards/:id', { bodyLimit: MAX_NATIVE_DOCUMENT_BYTES + 1024 }, (request, reply) => {
    const user = app.authentication.requireUser(request);
    // Authorize before parsing the document; do not disclose whether another owner's ID exists.
    ownedRevision(request.params.id, user.id);
    let save;
    let document;
    try {
      save = boardSaveValidator.validate(request.body);
      document = validateNativeDocument(save.document);
    } catch { return invalid(); }
    // One conditional SQLite UPDATE is the compare-and-swap, including across processes.
    const result = database.prepare(`UPDATE boards SET document = ?, revision = revision + 1, updated_at = ?
      WHERE id = ? AND owner_id = ? AND revision = ?`).run(JSON.stringify(document), Date.now(), request.params.id, user.id, save.expectedRevision);
    if (result.changes === 0) return reply.code(409).send({ error: 'revision_conflict', revision: ownedRevision(request.params.id, user.id) });
    return { revision: save.expectedRevision + 1 };
  });
  app.delete<{ Params: { id: string } }>('/api/boards/:id', (request, reply) => {
    const user = app.authentication.requireUser(request);
    const result = database.prepare('DELETE FROM boards WHERE id = ? AND owner_id = ?').run(request.params.id, user.id);
    if (result.changes === 0) throw new AuthenticationError(404, 'board_not_found', 'This board is unavailable. Return to Boards.');
    return reply.code(204).send();
  });
}
