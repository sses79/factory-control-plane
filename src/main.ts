import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { startReadServer } from './api/server.js';

// Local entry point for the read API: `pnpm serve [--runs-root DIR] [--queue FILE] [--port N]`.
// It only reads factory state and binds to 127.0.0.1, so nothing outside this machine can reach it.
const { values } = parseArgs({
  options: {
    'runs-root': { type: 'string', default: join(homedir(), 'factory-runs') },
    queue: { type: 'string' },
    port: { type: 'string', default: '4180' },
  },
});

const runsRoot = resolve(values['runs-root']);
const queuePath = resolve(values.queue ?? join(runsRoot, 'queue.sqlite'));
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`--port must be an integer from 1 to 65535, got ${values.port}`);
}

const server = startReadServer({ runsRoot, queuePath, port });
server.once('listening', () => {
  process.stdout.write(`read API on http://127.0.0.1:${port} (runs ${runsRoot}, queue ${queuePath})\n`);
});
