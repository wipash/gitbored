import { randomBytes } from 'node:crypto';
import { chmod, lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { readEncryptionKeyFile } from '../src/server/encryptionKey.js';

process.umask(0o077);
const databaseName = 'gitbored.sqlite';

async function openExisting(directory: string): Promise<DatabaseSync> {
  const folder = await lstat(directory);
  const file = await lstat(join(directory, databaseName));
  if (!folder.isDirectory() || !file.isFile() || file.size === 0) {
    throw new Error('Source must contain an existing GitBored database, not an empty file or symlink.');
  }
  const database = new DatabaseSync(join(directory, databaseName), { readOnly: true });
  try {
    // Reject unrelated SQLite files without fixing a schema version: future tables are copied too.
    database.prepare('SELECT id, github_id FROM users LIMIT 0').all();
    database.prepare('SELECT id, owner_id, document, revision FROM boards LIMIT 0').all();
    return database;
  } catch {
    database.close();
    throw new Error('Source is not an initialized GitBored database.');
  }
}

async function snapshot(source: string, destination: string): Promise<void> {
  const database = await openExisting(source);
  let created = false;
  try {
    // Exclusive leaf creation prevents overwriting any existing operator directory or backup.
    await mkdir(destination, { mode: 0o700 });
    created = true;
    const temporary = join(destination, '.incomplete.sqlite');
    await backup(database, temporary);
    const copy = new DatabaseSync(temporary);
    try {
      copy.exec('PRAGMA journal_mode = DELETE;');
      const integrity = copy.prepare('PRAGMA integrity_check').all();
      if (integrity.length !== 1 || integrity[0]?.['integrity_check'] !== 'ok'
        || copy.prepare('PRAGMA foreign_key_check').all().length !== 0) {
        throw new Error('Snapshot failed SQLite integrity checks.');
      }
    } finally {
      copy.close();
    }
    await chmod(temporary, 0o600);
    // Only fully completed snapshots have the filename accepted by restore/startup.
    await rename(temporary, join(destination, databaseName));
  } catch (cause) {
    if (created) await rm(destination, { recursive: true, force: true });
    throw cause;
  } finally {
    database.close();
  }
}

async function main(): Promise<void> {
  const [command, source, destination, extra] = process.argv.slice(2);
  if (command === 'keygen' && source && !destination) {
    await writeFile(resolve(source), `${randomBytes(32).toString('hex')}\n`, { flag: 'wx', mode: 0o600 });
    console.info('Created protected encryption key. Store a separate protected recovery copy.');
  } else if (command === 'key-copy' && source && destination && !extra) {
    const key = readEncryptionKeyFile(resolve(source));
    await writeFile(resolve(destination), `${key}\n`, { flag: 'wx', mode: 0o600 });
    console.info('Created protected encryption-key recovery copy.');
  } else if ((command === 'backup' || command === 'restore') && source && destination && !extra) {
    await snapshot(resolve(source), resolve(destination));
    console.info(command === 'backup' ? 'Created consistent database backup; encryption key is NOT included.'
      : 'Restored isolated database. Configure its separately recovered encryption key before starting.');
  } else {
    throw new Error('Usage: pnpm data backup <data-dir> <new-backup-dir> | restore <backup-dir> <new-data-dir> | keygen <new-key-file> | key-copy <key-file> <new-recovery-file>');
  }
}

void main().catch((error: unknown) => {
  // Filesystem/SQLite exceptions can contain private paths or data. Do not print their payloads.
  console.error(error instanceof Error && !('code' in error) ? error.message : 'Operation failed. Check source, permissions and that the destination does not already exist.');
  process.exitCode = 1;
});
