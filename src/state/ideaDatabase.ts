import type { DatabaseSync } from 'node:sqlite';

import { z } from 'zod';

import { toIdeaSummary, type IdeaSummary } from '../ideaSummary.js';

const IdeaDocumentSchema = z.object({
  schema_version: z.literal(1),
  idea_id: z.string(),
  operator_id: z.string(),
  classification: z.literal('public'),
  content: z.string(),
  content_sha256: z.string(),
  created_at: z.iso.datetime({ offset: true }),
  provenance: z.object({
    origin: z.literal('local-manual'),
  }),
});

type IdeaDocument = z.infer<typeof IdeaDocumentSchema>;

function toIdeaDocument(row: { idea_id: string; document: string }): IdeaDocument {
  let document: unknown;
  try {
    document = JSON.parse(row.document);
  } catch {
    throw new Error(
      `Idea ${row.idea_id} has an invalid document: not valid JSON`,
    );
  }

  const parsed = IdeaDocumentSchema.safeParse(document);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'document'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Idea ${row.idea_id} has an invalid document: ${details}`);
  }

  return parsed.data;
}

export function readIdeas(database: DatabaseSync): IdeaSummary[] {
  const rows = database
    .prepare(
      'SELECT idea_id, document FROM idea_inbox ORDER BY created_at DESC, idea_id ASC',
    )
    .all() as Array<{ idea_id: string; document: string }>;

  return rows.map((row) => toIdeaSummary(toIdeaDocument(row)));
}
