import { existsSync, readdirSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { toBlueprintStatus } from '../blueprintStatus.js';
import type { RunSummary } from '../runSummary.js';
import { readIdeas } from '../state/ideaDatabase.js';
import {
  readLatestBlueprint,
  readLatestPlan,
} from '../state/planningDatabase.js';
import { readQueueEntries } from '../state/queueDatabase.js';
import { readRunSummaries } from '../state/runDatabase.js';
import type { IdeaListEntry } from '../ui/ideaList.js';
import type { IdeaPageInput } from '../ui/ideaPage.js';
import { routeRequest, type ReadSources } from './router.js';

export interface ReadSourcesOptions {
  runsRoot: string;
  queuePath: string;
  listDirectories?: (root: string) => string[];
  fileExists?: (path: string) => boolean;
  openDatabase?: (path: string) => DatabaseSync;
}

export interface ReadSourcesWithIdeas extends ReadSources {
  listIdeas(): IdeaListEntry[];
  getIdea(ideaId: string): Omit<IdeaPageInput, 'generatedAt'> | undefined;
}

export function createReadSources(
  options: ReadSourcesOptions,
): ReadSourcesWithIdeas {
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
    listIdeas() {
      if (!fileExists(options.queuePath)) {
        return [];
      }
      const database = openDatabase(options.queuePath);
      try {
        const ideas = readIdeas(database);
        if (ideas.length === 0) {
          return [];
        }
        const queue = readQueueEntries(database);
        const runs = this.listRunSummaries();
        return ideas.map((idea) => {
          const entry: IdeaListEntry = { idea };
          const plan = readLatestPlan(database, idea.idea_id);
          if (plan !== undefined) {
            entry.plan_revision = plan.revision;
          }
          const blueprint = readLatestBlueprint(database, idea.idea_id);
          if (blueprint !== undefined) {
            entry.blueprint = {
              revision: blueprint.revision,
              totals: toBlueprintStatus({
                blueprint: blueprint.blueprint,
                queue,
                runs,
              }).totals,
            };
          }
          return entry;
        });
      } finally {
        database.close();
      }
    },
    getIdea(ideaId: string) {
      if (!fileExists(options.queuePath)) {
        return undefined;
      }
      const database = openDatabase(options.queuePath);
      try {
        const idea = readIdeas(database).find(
          (candidate) => candidate.idea_id === ideaId,
        );
        if (idea === undefined) {
          return undefined;
        }
        const page: Omit<IdeaPageInput, 'generatedAt'> = { idea };
        const plan = readLatestPlan(database, ideaId);
        if (plan !== undefined) {
          page.plan = plan;
        }
        const blueprint = readLatestBlueprint(database, ideaId);
        if (blueprint !== undefined) {
          page.blueprint = {
            revision: blueprint.revision,
            status: toBlueprintStatus({
              blueprint: blueprint.blueprint,
              queue: readQueueEntries(database),
              runs: this.listRunSummaries(),
            }),
          };
        }
        return page;
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
    if (routed.contentType === undefined) {
      response.writeHead(routed.status, {
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify(routed.body));
      return;
    }
    response.writeHead(routed.status, {
      'content-type': routed.contentType,
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
    });
    response.end(String(routed.body));
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
