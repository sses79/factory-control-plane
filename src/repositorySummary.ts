import { z } from 'zod';

export const RepositorySummarySchema = z.object({
  repository: z.string(),
  default_branch: z.string(),
  classification: z.string(),
  writable_path_count: z.number().int().nonnegative(),
  denied_path_count: z.number().int().nonnegative(),
  required_checks: z.array(z.string()),
  command_ids: z.array(z.string()),
});

export type RepositorySummary = z.infer<typeof RepositorySummarySchema>;

interface Repository {
  repository: string;
  default_branch: string;
  classification: string;
  writable_paths: string[];
  denied_paths: string[];
  required_checks: string[];
  available_commands: { command_id: string; validation_kind: string }[];
}

export function toRepositorySummary(
  repository: Repository,
): RepositorySummary {
  const availableCommandIds = new Set(
    repository.available_commands.map((command) => command.command_id),
  );

  for (const check of repository.required_checks) {
    if (!availableCommandIds.has(check)) {
      throw new Error(
        `Repository ${repository.repository} requires unknown check ${check}`,
      );
    }
  }

  return {
    repository: repository.repository,
    default_branch: repository.default_branch,
    classification: repository.classification,
    writable_path_count: repository.writable_paths.length,
    denied_path_count: repository.denied_paths.length,
    required_checks: repository.required_checks,
    command_ids: repository.available_commands
      .map((command) => command.command_id)
      .sort(),
  };
}
