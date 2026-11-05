import { chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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
    `);
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
