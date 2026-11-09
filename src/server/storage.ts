import { chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { emptyIncoming } from '../shared/incoming.js';
import { initializeSources } from './sources.js';
import { initializeSharing } from './sharing.js';

export async function openStorage(directory: string): Promise<DatabaseSync> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const database = new DatabaseSync(join(directory, 'gitbored.sqlite'));
  await chmod(join(directory, 'gitbored.sqlite'), 0o600);
  try {
    checkStorage(database);
    database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, github_id TEXT NOT NULL UNIQUE,
        login TEXT NOT NULL, name TEXT,
        access_token TEXT, refresh_token TEXT,
        access_expires INTEGER, refresh_expires INTEGER,
        reauthorize INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
        csrf_token TEXT NOT NULL, expires INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS oauth_states (
        state_hash TEXT PRIMARY KEY, binding_hash TEXT NOT NULL,
        verifier TEXT NOT NULL, expires INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL, document TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS boards_owner_updated ON boards(owner_id, updated_at DESC);
    `);
    initializeSources(database);
    initializeSharing(database);
    // SQLite retains this canonical default for existing rows and future inserts.
    if (!database.prepare('PRAGMA table_info(boards)').all().some((column) => column['name'] === 'incoming')) {
      database.exec(`ALTER TABLE boards ADD COLUMN incoming TEXT NOT NULL DEFAULT '${JSON.stringify(emptyIncoming())}'`);
    }
    if (!database.prepare('PRAGMA table_info(oauth_states)').all().some((column) => column['name'] === 'return_to')) {
      database.exec("ALTER TABLE oauth_states ADD COLUMN return_to TEXT NOT NULL DEFAULT '/'");
    }
    return database;
  } catch (cause) {
    database.close();
    throw new Error('Unable to initialize SQLite storage.', { cause });
  }
}

export function checkStorage(database: DatabaseSync): void {
  const result = database.prepare('SELECT 1 AS ready').get();
  if (result?.['ready'] !== 1) {
    throw new Error('SQLite readiness query did not return the expected result.');
  }
}
