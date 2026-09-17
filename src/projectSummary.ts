import { z } from 'zod';

export const ProjectSummarySchema = z.object({
  project_id: z.string(),
  name: z.string(),
  repositories: z.array(z.string()),
  repository_count: z.number().int().nonnegative(),
  created_at: z.iso.datetime({ offset: true }),
});

export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

interface Project {
  project_id: string;
  name: string;
  repositories: string[];
  created_at: string;
}

const REPOSITORY_SLUG_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function toProjectSummary(project: Project): ProjectSummary {
  const createdAt = z.iso.datetime({ offset: true }).safeParse(project.created_at);
  if (!createdAt.success) {
    throw new Error(
      `Project ${project.project_id} has invalid created_at: ${project.created_at}`,
    );
  }

  for (const repository of project.repositories) {
    if (!REPOSITORY_SLUG_PATTERN.test(repository)) {
      throw new Error(
        `Project ${project.project_id} has invalid repository: ${repository}`,
      );
    }
  }

  const repositories = [...new Set(project.repositories)].sort();

  return {
    project_id: project.project_id,
    name: project.name,
    repositories,
    repository_count: repositories.length,
    created_at: project.created_at,
  };
}
