import { z } from 'zod';

export const IdeaSummarySchema = z.object({
  idea_id: z.string(),
  operator_id: z.string(),
  classification: z.string(),
  content_sha256: z.string(),
  created_at: z.iso.datetime({ offset: true }),
  origin: z.string(),
  content_length: z.number().int().nonnegative(),
  excerpt: z.string(),
});

export type IdeaSummary = z.infer<typeof IdeaSummarySchema>;

interface Idea {
  schema_version: 1;
  idea_id: string;
  operator_id: string;
  classification: 'public';
  content: string;
  content_sha256: string;
  created_at: string;
  provenance: {
    origin: 'local-manual';
  };
}

function collapseWhitespace(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

function truncateExcerpt(excerpt: string): string {
  if (excerpt.length <= 120) {
    return excerpt;
  }
  return `${excerpt.slice(0, 119)}\u2026`;
}

export function toIdeaSummary(idea: Idea): IdeaSummary {
  const createdAt = z.iso.datetime({ offset: true }).safeParse(idea.created_at);
  if (!createdAt.success) {
    throw new Error(
      `Idea ${idea.idea_id} has invalid created_at: ${idea.created_at}`,
    );
  }

  return {
    idea_id: idea.idea_id,
    operator_id: idea.operator_id,
    classification: idea.classification,
    content_sha256: idea.content_sha256,
    created_at: idea.created_at,
    origin: idea.provenance.origin,
    content_length: idea.content.length,
    excerpt: truncateExcerpt(collapseWhitespace(idea.content)),
  };
}
