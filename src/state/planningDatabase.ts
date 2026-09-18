import type { DatabaseSync } from 'node:sqlite';

import { z } from 'zod';

export const BlueprintSchema = z.object({
  schema_version: z.literal(1),
  idea_id: z.string(),
  project_id: z.string(),
  title: z.string(),
  repositories: z.array(z.string()),
  phases: z.array(
    z.object({
      phase_id: z.string(),
      title: z.string(),
      goal: z.string(),
      exit: z.string(),
      packets: z.array(
        z.object({
          feature_id: z.string(),
          repository: z.string(),
          title: z.string(),
          outcome: z.string(),
          writable_paths: z.array(z.string()),
          acceptance_criteria: z.array(z.string()),
          depends_on: z.array(z.string()),
        }),
      ),
    }),
  ),
});

export type Blueprint = z.infer<typeof BlueprintSchema>;

export type PlanRevision = {
  idea_id: string;
  revision: number;
  created_at: string;
  content_sha256: string;
  markdown: string;
};

export type BlueprintRevision = {
  idea_id: string;
  revision: number;
  created_at: string;
  content_sha256: string;
  blueprint: Blueprint;
};

export type RevisionHistoryEntry = {
  revision: number;
  created_at: string;
  content_sha256: string;
};

interface PlanningRevisionRow {
  idea_id: string;
  revision: number;
  created_at: string;
  content_sha256: string;
  content: string;
}

function parseBlueprint(
  ideaId: string,
  revision: number,
  content: string,
): Blueprint {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error(
      `Blueprint for idea ${ideaId} revision ${revision} has an invalid document: not valid JSON`,
    );
  }

  const parsed = BlueprintSchema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'blueprint'}: ${issue.message}`)
      .join('; ');
    throw new Error(
      `Blueprint for idea ${ideaId} revision ${revision} has an invalid document: ${details}`,
    );
  }
  return parsed.data;
}

export function readLatestPlan(
  database: DatabaseSync,
  ideaId: string,
): PlanRevision | undefined {
  const row = database
    .prepare(
      `SELECT idea_id, revision, created_at, content_sha256, content
       FROM planning_revisions
       WHERE idea_id = ? AND kind = 'plan'
       ORDER BY revision DESC
       LIMIT 1`,
    )
    .get(ideaId) as PlanningRevisionRow | undefined;

  if (row === undefined) {
    return undefined;
  }
  return {
    idea_id: row.idea_id,
    revision: row.revision,
    created_at: row.created_at,
    content_sha256: row.content_sha256,
    markdown: row.content,
  };
}

export function readLatestBlueprint(
  database: DatabaseSync,
  ideaId: string,
): BlueprintRevision | undefined {
  const row = database
    .prepare(
      `SELECT idea_id, revision, created_at, content_sha256, content
       FROM planning_revisions
       WHERE idea_id = ? AND kind = 'blueprint'
       ORDER BY revision DESC
       LIMIT 1`,
    )
    .get(ideaId) as PlanningRevisionRow | undefined;

  if (row === undefined) {
    return undefined;
  }
  return {
    idea_id: row.idea_id,
    revision: row.revision,
    created_at: row.created_at,
    content_sha256: row.content_sha256,
    blueprint: parseBlueprint(row.idea_id, row.revision, row.content),
  };
}

export function readRevisionHistory(
  database: DatabaseSync,
  ideaId: string,
  kind: 'plan' | 'blueprint',
): RevisionHistoryEntry[] {
  const rows = database
    .prepare(
      `SELECT revision, created_at, content_sha256
       FROM planning_revisions
       WHERE idea_id = ? AND kind = ?
       ORDER BY revision ASC`,
    )
    .all(ideaId, kind) as Array<Omit<PlanningRevisionRow, 'content'>>;

  return rows.map((row) => ({
    revision: row.revision,
    created_at: row.created_at,
    content_sha256: row.content_sha256,
  }));
}
