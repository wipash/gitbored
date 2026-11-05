import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';

/** Read through one descriptor: never follow a final symlink or accept shared key files. */
export function readEncryptionKeyFile(path: string): string {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0
      || info.size < 64 || info.size > 66) throw new Error('Invalid key file.');
    const key = readFileSync(descriptor, 'utf8').trim();
    if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error('Invalid key file.');
    return key;
  } catch {
    throw new Error('Encryption key file must be a readable, owner-only regular file containing one 64-hex key.');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
