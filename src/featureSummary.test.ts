import { describe, expect, it } from 'vitest';

import {
  FeatureSummarySchema,
  toFeatureSummary,
} from './featureSummary.js';

interface Feature {
  feature_id: string;
  title: string;
  target_repository: string;
  risk: string;
  writable_paths: string[];
  acceptance_criteria: string[];
  required_checks: string[];
}

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    feature_id: 'feature-1',
    title: 'Add a feature summary projection',
    target_repository: 'sses79/factory-control-plane',
    risk: 'low',
    writable_paths: ['src/featureSummary.ts', 'src/featureSummary.test.ts'],
    acceptance_criteria: ['carry fields through', 'count arrays'],
    required_checks: ['typecheck', 'test'],
    ...overrides,
  };
}

describe('toFeatureSummary', () => {
  it('carries fields through unchanged and computes counts', () => {
    const feature = makeFeature();
    const summary = toFeatureSummary(feature);

    expect(summary).toEqual({
      feature_id: feature.feature_id,
      title: feature.title,
      target_repository: feature.target_repository,
      risk: feature.risk,
      writable_path_count: feature.writable_paths.length,
      acceptance_criteria_count: feature.acceptance_criteria.length,
      required_checks: feature.required_checks,
    });
    expect(summary.writable_path_count).toBe(2);
    expect(summary.acceptance_criteria_count).toBe(2);
  });

  it('keeps required_checks in the order given', () => {
    const requiredChecks = ['typecheck', 'test', 'build', 'typecheck'];
    const summary = toFeatureSummary(
      makeFeature({ required_checks: requiredChecks }),
    );

    expect(summary.required_checks).toEqual(requiredChecks);
  });

  it('maps empty arrays to zero counts and an empty required_checks', () => {
    const summary = toFeatureSummary(
      makeFeature({
        writable_paths: [],
        acceptance_criteria: [],
        required_checks: [],
      }),
    );

    expect(summary.writable_path_count).toBe(0);
    expect(summary.acceptance_criteria_count).toBe(0);
    expect(summary.required_checks).toEqual([]);
  });

  it('does not mutate the arrays it is given', () => {
    const feature = makeFeature({
      writable_paths: ['a.ts', 'b.ts'],
      acceptance_criteria: ['one', 'two'],
      required_checks: ['typecheck'],
    });
    const writablePaths = [...feature.writable_paths];
    const acceptanceCriteria = [...feature.acceptance_criteria];
    const requiredChecks = [...feature.required_checks];

    toFeatureSummary(feature);

    expect(feature.writable_paths).toEqual(writablePaths);
    expect(feature.acceptance_criteria).toEqual(acceptanceCriteria);
    expect(feature.required_checks).toEqual(requiredChecks);
  });

  it('is pure: the same input produces the same summary', () => {
    const feature = makeFeature();

    expect(toFeatureSummary(feature)).toEqual(toFeatureSummary(feature));
  });
});

describe('FeatureSummarySchema', () => {
  it('accepts every summary toFeatureSummary builds', () => {
    const features: Feature[] = [
      makeFeature(),
      makeFeature({
        writable_paths: [],
        acceptance_criteria: [],
        required_checks: [],
      }),
      makeFeature({
        required_checks: ['a', 'a', 'b'],
        writable_paths: ['x.ts', 'x.ts'],
      }),
    ];

    for (const feature of features) {
      const summary = toFeatureSummary(feature);
      expect(FeatureSummarySchema.parse(summary)).toEqual(summary);
    }
  });

  it('rejects negative counts', () => {
    const result = FeatureSummarySchema.safeParse({
      feature_id: 'feature-1',
      title: 'title',
      target_repository: 'repo',
      risk: 'low',
      writable_path_count: -1,
      acceptance_criteria_count: 0,
      required_checks: [],
    });

    expect(result.success).toBe(false);
  });
});
