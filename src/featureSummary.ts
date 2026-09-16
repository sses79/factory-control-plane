import { z } from 'zod';

export const FeatureSummarySchema = z.object({
  feature_id: z.string(),
  title: z.string(),
  target_repository: z.string(),
  risk: z.string(),
  writable_path_count: z.number().int().nonnegative(),
  acceptance_criteria_count: z.number().int().nonnegative(),
  required_checks: z.array(z.string()),
});

export type FeatureSummary = z.infer<typeof FeatureSummarySchema>;

interface Feature {
  feature_id: string;
  title: string;
  target_repository: string;
  risk: string;
  writable_paths: string[];
  acceptance_criteria: string[];
  required_checks: string[];
}

export function toFeatureSummary(feature: Feature): FeatureSummary {
  return {
    feature_id: feature.feature_id,
    title: feature.title,
    target_repository: feature.target_repository,
    risk: feature.risk,
    writable_path_count: feature.writable_paths.length,
    acceptance_criteria_count: feature.acceptance_criteria.length,
    required_checks: feature.required_checks,
  };
}
