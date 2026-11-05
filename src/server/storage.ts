import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export async function openStorage(directory: string): Promise<DatabaseSync> {
  await mkdir(directory, { recursive: true });
  const database = new DatabaseSync(join(directory, 'gitbored.sqlite'));
  try {
    checkStorage(database);
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
