import { createApp } from './app.js';
import { readConfig } from './config.js';
import { openStorage } from './storage.js';

async function main(): Promise<void> {
  const config = readConfig(process.env, process.cwd());
  const database = await openStorage(config.dataDirectory);
  const app = await createApp(config, database).catch((cause: unknown) => {
    database.close();
    throw new Error('Unable to start the local runtime.', { cause });
  });

  const server = app;
  let closing: Promise<void> | undefined;
  function close(): Promise<void> {
    closing ??= server.close().finally(() => database.close());
    return closing;
  }

  function onSignal(): void {
    void close().catch((error: unknown) => {
      console.error('Unable to close the local runtime cleanly.', error);
      process.exitCode = 1;
    });
  }

  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    const address = await server.listen({ host: config.host, port: config.port });
    console.info(`GitBored local runtime listening at ${address}`);
  } catch (cause) {
    await close();
    throw new Error('Unable to listen for local HTTP requests.', { cause });
  }
}

void main().catch((error: unknown) => {
  console.error('GitBored could not start. Check runtime configuration and the production build.', error);
  process.exitCode = 1;
});
