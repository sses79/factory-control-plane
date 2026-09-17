import { describe, expect, it } from 'vitest';

import {
  RepositorySummarySchema,
  toRepositorySummary,
} from './repositorySummary.js';

interface Repository {
  repository: string;
  default_branch: string;
  classification: string;
  writable_paths: string[];
  denied_paths: string[];
  required_checks: string[];
  available_commands: { command_id: string; validation_kind: string }[];
}

function makeRepository(overrides: Partial<Repository> = {}): Repository {
  return {
    repository: 'sses79/factory-control-plane',
    default_branch: 'main',
    classification: 'public',
    writable_paths: ['src/**', 'README.md'],
    denied_paths: ['.env', '.git/**', '*.pem'],
    required_checks: ['typecheck', 'test'],
    available_commands: [
      { command_id: 'test', validation_kind: 'test' },
      { command_id: 'typecheck', validation_kind: 'generic' },
    ],
    ...overrides,
  };
}

describe('toRepositorySummary', () => {
  it('carries fields through unchanged and computes the path counts', () => {
    const repository = makeRepository();
    const summary = toRepositorySummary(repository);

    expect(summary).toEqual({
      repository: repository.repository,
      default_branch: repository.default_branch,
      classification: repository.classification,
      writable_path_count: repository.writable_paths.length,
      denied_path_count: repository.denied_paths.length,
      required_checks: repository.required_checks,
      command_ids: ['test', 'typecheck'],
    });
    expect(summary.writable_path_count).toBe(2);
    expect(summary.denied_path_count).toBe(3);
  });

  it('keeps required_checks in the order given', () => {
    const requiredChecks = ['test', 'typecheck', 'test'];
    const summary = toRepositorySummary(
      makeRepository({ required_checks: requiredChecks }),
    );

    expect(summary.required_checks).toEqual(requiredChecks);
  });

  it('sorts command_ids ascending whatever the input order', () => {
    const summary = toRepositorySummary(
      makeRepository({
        available_commands: [
          { command_id: 'typecheck', validation_kind: 'generic' },
          { command_id: 'build', validation_kind: 'generic' },
          { command_id: 'test', validation_kind: 'test' },
        ],
      }),
    );

    expect(summary.command_ids).toEqual(['build', 'test', 'typecheck']);
  });

  it('maps empty arrays to zero counts and empty lists', () => {
    const summary = toRepositorySummary(
      makeRepository({
        writable_paths: [],
        denied_paths: [],
        required_checks: [],
        available_commands: [],
      }),
    );

    expect(summary.writable_path_count).toBe(0);
    expect(summary.denied_path_count).toBe(0);
    expect(summary.required_checks).toEqual([]);
    expect(summary.command_ids).toEqual([]);
  });

  it('throws when a required check has no matching command', () => {
    expect(() =>
      toRepositorySummary(
        makeRepository({ required_checks: ['typecheck', 'lint'] }),
      ),
    ).toThrow(
      /Repository sses79\/factory-control-plane requires unknown check lint/,
    );
  });

  it('does not mutate its input, including the available_commands order', () => {
    const repository = makeRepository();
    const writablePaths = [...repository.writable_paths];
    const deniedPaths = [...repository.denied_paths];
    const requiredChecks = [...repository.required_checks];
    const availableCommands = [...repository.available_commands];

    toRepositorySummary(repository);

    expect(repository.writable_paths).toEqual(writablePaths);
    expect(repository.denied_paths).toEqual(deniedPaths);
    expect(repository.required_checks).toEqual(requiredChecks);
    expect(repository.available_commands).toEqual(availableCommands);
  });

  it('is pure: the same input produces the same summary', () => {
    const repository = makeRepository();

    expect(toRepositorySummary(repository)).toEqual(
      toRepositorySummary(repository),
    );
  });
});

describe('RepositorySummarySchema', () => {
  it('accepts every summary toRepositorySummary builds', () => {
    const repositories: Repository[] = [
      makeRepository(),
      makeRepository({
        writable_paths: [],
        denied_paths: [],
        required_checks: [],
        available_commands: [],
      }),
      makeRepository({
        required_checks: ['test', 'typecheck', 'test'],
        available_commands: [
          { command_id: 'typecheck', validation_kind: 'generic' },
          { command_id: 'test', validation_kind: 'test' },
        ],
      }),
    ];

    for (const repository of repositories) {
      const summary = toRepositorySummary(repository);
      expect(RepositorySummarySchema.parse(summary)).toEqual(summary);
    }
  });

  it('rejects negative counts', () => {
    const result = RepositorySummarySchema.safeParse({
      repository: 'sses79/factory-control-plane',
      default_branch: 'main',
      classification: 'public',
      writable_path_count: -1,
      denied_path_count: 0,
      required_checks: [],
      command_ids: [],
    });

    expect(result.success).toBe(false);
  });
});
