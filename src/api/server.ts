import { existsSync, readdirSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { RunSummary } from '../runSummary.js';
import { readQueueEntries } from '../state/queueDatabase.js';
import { readRunSummaries } from '../state/runDatabase.js';
import { routeRequest, type ReadSources } from './router.js';

export interface ReadSourcesOptions {
  runsRoot: string;
  queuePath: string;
  listDirectories?: (root: string) => string[];
  fileExists?: (path: string) => boolean;
  openDatabase?: (path: string) => DatabaseSync;
}

export function createReadSources(options: ReadSourcesOptions): ReadSources {
  const listDirectories =
    options.listDirectories ??
    ((root: string) =>
      readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name));
  const fileExists = options.fileExists ?? existsSync;
  const openDatabase =
    options.openDatabase ??
    ((path: string) => new DatabaseSync(path, { readOnly: true }));

  return {
    listRunSummaries() {
      const summaries: RunSummary[] = [];
      const names = listDirectories(options.runsRoot).sort();
      for (const name of names) {
        const databasePath = join(options.runsRoot, name, 'factory.sqlite');
        if (!fileExists(databasePath)) {
          continue;
        }
        const database = openDatabase(databasePath);
        try {
          summaries.push(...readRunSummaries(database));
        } finally {
          database.close();
        }
      }
      return summaries;
    },
    listQueueEntries() {
      if (!fileExists(options.queuePath)) {
        return [];
      }
      const database = openDatabase(options.queuePath);
      try {
        return readQueueEntries(database);
      } finally {
        database.close();
      }
    },
  };
}

export function createRequestHandler(
  sources: ReadSources,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    const routed = routeRequest(
      { method: request.method ?? 'GET', url: request.url ?? '/' },
      sources,
    );
    response.writeHead(routed.status, {
      'content-type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify(routed.body));
  };
}

export function startReadServer(options: {
  runsRoot: string;
  queuePath: string;
  port: number;
}): Server {
  const server = createServer(createRequestHandler(createReadSources(options)));
  server.listen(options.port, '127.0.0.1');
  return server;
}
