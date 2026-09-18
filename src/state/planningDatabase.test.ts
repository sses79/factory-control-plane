import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import {
  BlueprintSchema,
  readLatestBlueprint,
  readLatestPlan,
  readRevisionHistory,
} from './planningDatabase.js';
import type { Blueprint } from './planningDatabase.js';

interface PlanningRow {
  idea_id: string;
  kind: 'plan' | 'blueprint';
  revision: number;
  created_at: string;
  content_sha256: string;
  content: string;
}

function makeBlueprint(overrides: Partial<Blueprint> = {}): Blueprint {
  return {
    schema_version: 1,
    idea_id: 'idea-1',
    project_id: 'project-1',
    title: 'Widget builder',
    repositories: ['acme/widgets'],
    phases: [
      {
        phase_id: 'phase-1',
        title: 'Foundation',
        goal: 'Establish the foundation',
        exit: 'Foundation is in place',
        packets: [
          {
            feature_id: 'feature-1',
            repository: 'acme/widgets',
            title: 'Scaffold the project',
            outcome: 'Project is scaffolded',
            writable_paths: ['src'],
            acceptance_criteria: ['The project builds'],
            depends_on: [],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeRow(
  ideaId: string,
  kind: 'plan' | 'blueprint',
  revision: number,
  content: string,
  createdAt = '2026-01-15T10:00:00Z',
): PlanningRow {
  return {
    idea_id: ideaId,
    kind,
    revision,
    created_at: createdAt,
    content_sha256: `sha-${ideaId}-${kind}-${revision}`,
    content,
  };
}

function createDatabase(rows: PlanningRow[]): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE planning_revisions (
      idea_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      revision INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      content TEXT NOT NULL,
      PRIMARY KEY (idea_id, kind, revision)
    );
  `);
  const insert = database.prepare(
    `INSERT INTO planning_revisions (idea_id, kind, revision, created_at, content_sha256, content)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const row of rows) {
    insert.run(
      row.idea_id,
      row.kind,
      row.revision,
      row.created_at,
      row.content_sha256,
      row.content,
    );
  }
  return database;
}

describe('readLatestPlan', () => {
  it('returns the highest plan revision with its markdown', () => {
    const database = createDatabase([
      makeRow('idea-1', 'plan', 1, '# Plan v1'),
      makeRow('idea-1', 'plan', 2, '# Plan v2', '2026-01-16T10:00:00Z'),
    ]);

    expect(readLatestPlan(database, 'idea-1')).toEqual({
      idea_id: 'idea-1',
      revision: 2,
      created_at: '2026-01-16T10:00:00Z',
      content_sha256: 'sha-idea-1-plan-2',
      markdown: '# Plan v2',
    });
  });

  it('returns undefined when the idea has no plan revision', () => {
    const database = createDatabase([
      makeRow('idea-1', 'blueprint', 1, JSON.stringify(makeBlueprint())),
      makeRow('idea-2', 'plan', 1, '# Plan v1'),
    ]);

    expect(readLatestPlan(database, 'idea-1')).toBeUndefined();
    expect(readLatestPlan(database, 'missing-idea')).toBeUndefined();
  });
});

describe('readLatestBlueprint', () => {
  it('returns the highest blueprint revision parsed into phases and packets', () => {
    const blueprint = makeBlueprint();
    const database = createDatabase([
      makeRow(
        'idea-1',
        'blueprint',
        1,
        JSON.stringify(makeBlueprint({ title: 'First draft' })),
      ),
      makeRow(
        'idea-1',
        'blueprint',
        2,
        JSON.stringify(blueprint),
        '2026-01-16T10:00:00Z',
      ),
    ]);

    expect(readLatestBlueprint(database, 'idea-1')).toEqual({
      idea_id: 'idea-1',
      revision: 2,
      created_at: '2026-01-16T10:00:00Z',
      content_sha256: 'sha-idea-1-blueprint-2',
      blueprint,
    });
  });

  it('returns undefined when the idea has no blueprint revision', () => {
    const database = createDatabase([
      makeRow('idea-1', 'plan', 1, '# Plan v1'),
      makeRow(
        'idea-2',
        'blueprint',
        1,
        JSON.stringify(makeBlueprint({ idea_id: 'idea-2' })),
      ),
    ]);

    expect(readLatestBlueprint(database, 'idea-1')).toBeUndefined();
    expect(readLatestBlueprint(database, 'missing-idea')).toBeUndefined();
  });
});

describe('plan and blueprint revision independence', () => {
  it('reports each kind with its own revision number for one idea', () => {
    const database = createDatabase([
      makeRow('idea-1', 'plan', 1, '# Plan v1'),
      makeRow('idea-1', 'plan', 3, '# Plan v3', '2026-01-18T10:00:00Z'),
      makeRow(
        'idea-1',
        'blueprint',
        1,
        JSON.stringify(makeBlueprint({ title: 'First draft' })),
      ),
      makeRow(
        'idea-1',
        'blueprint',
        2,
        JSON.stringify(makeBlueprint({ title: 'Second draft' })),
        '2026-01-16T10:00:00Z',
      ),
    ]);

    expect(readLatestPlan(database, 'idea-1')).toMatchObject({
      revision: 3,
      markdown: '# Plan v3',
    });
    expect(readLatestBlueprint(database, 'idea-1')).toMatchObject({
      revision: 2,
    });
  });
});

describe('readRevisionHistory', () => {
  it('returns every revision of one kind oldest first', () => {
    const database = createDatabase([
      makeRow('idea-1', 'plan', 3, '# Plan v3', '2026-01-17T10:00:00Z'),
      makeRow('idea-1', 'plan', 1, '# Plan v1', '2026-01-15T10:00:00Z'),
      makeRow('idea-1', 'plan', 2, '# Plan v2', '2026-01-16T10:00:00Z'),
      makeRow(
        'idea-1',
        'blueprint',
        1,
        JSON.stringify(makeBlueprint({ title: 'First draft' })),
      ),
    ]);

    expect(readRevisionHistory(database, 'idea-1', 'plan')).toEqual([
      {
        revision: 1,
        created_at: '2026-01-15T10:00:00Z',
        content_sha256: 'sha-idea-1-plan-1',
      },
      {
        revision: 2,
        created_at: '2026-01-16T10:00:00Z',
        content_sha256: 'sha-idea-1-plan-2',
      },
      {
        revision: 3,
        created_at: '2026-01-17T10:00:00Z',
        content_sha256: 'sha-idea-1-plan-3',
      },
    ]);
  });

  it('returns an empty array when there are no revisions of that kind', () => {
    const database = createDatabase([
      makeRow('idea-1', 'plan', 1, '# Plan v1'),
    ]);

    expect(readRevisionHistory(database, 'idea-1', 'blueprint')).toEqual([]);
    expect(readRevisionHistory(database, 'missing-idea', 'plan')).toEqual([]);
  });
});

describe('readLatestBlueprint validation', () => {
  it('throws for a blueprint that is not valid JSON naming the idea id and revision', () => {
    const database = createDatabase([
      makeRow('idea-bad-json', 'blueprint', 4, '{not valid json'),
    ]);

    expect(() => readLatestBlueprint(database, 'idea-bad-json')).toThrowError(
      /idea-bad-json.*revision 4/,
    );
  });

  it('throws for a blueprint missing a required field naming the idea id and revision', () => {
    const partial = makeBlueprint({ idea_id: 'idea-missing' }) as Partial<Blueprint>;
    delete partial.title;
    const database = createDatabase([
      makeRow('idea-missing', 'blueprint', 2, JSON.stringify(partial)),
    ]);

    expect(() => readLatestBlueprint(database, 'idea-missing')).toThrowError(
      /idea-missing.*revision 2/,
    );
  });
});

describe('BlueprintSchema', () => {
  it('accepts every blueprint readLatestBlueprint returns', () => {
    const database = createDatabase([
      makeRow(
        'idea-1',
        'blueprint',
        1,
        JSON.stringify(makeBlueprint({ title: 'First draft' })),
      ),
      makeRow(
        'idea-1',
        'blueprint',
        2,
        JSON.stringify(makeBlueprint({ title: 'Second draft' })),
        '2026-01-16T10:00:00Z',
      ),
      makeRow(
        'idea-2',
        'blueprint',
        1,
        JSON.stringify(
          makeBlueprint({
            idea_id: 'idea-2',
            project_id: 'project-2',
            title: 'Other builder',
          }),
        ),
      ),
    ]);

    for (const ideaId of ['idea-1', 'idea-2']) {
      const revision = readLatestBlueprint(database, ideaId);
      if (revision !== undefined) {
        expect(BlueprintSchema.parse(revision.blueprint)).toEqual(
          revision.blueprint,
        );
      }
    }
  });
});

describe('read-only behavior', () => {
  it('only reads from the planning_revisions table', () => {
    const database = createDatabase([
      makeRow('idea-1', 'plan', 1, '# Plan v1'),
      makeRow('idea-1', 'plan', 2, '# Plan v2', '2026-01-16T10:00:00Z'),
      makeRow('idea-1', 'blueprint', 1, JSON.stringify(makeBlueprint())),
    ]);
    const rowsBefore = database
      .prepare('SELECT * FROM planning_revisions ORDER BY idea_id, kind, revision')
      .all();
    const tablesBefore = database
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all();

    readLatestPlan(database, 'idea-1');
    readLatestBlueprint(database, 'idea-1');
    readRevisionHistory(database, 'idea-1', 'plan');
    readRevisionHistory(database, 'idea-1', 'blueprint');
    readRevisionHistory(database, 'missing-idea', 'plan');

    expect(
      database
        .prepare('SELECT * FROM planning_revisions ORDER BY idea_id, kind, revision')
        .all(),
    ).toEqual(rowsBefore);
    expect(
      database
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
        .all(),
    ).toEqual(tablesBefore);
  });
});
