import { describe, expect, it } from 'vitest';

import {
  ProjectSummarySchema,
  toProjectSummary,
} from './projectSummary.js';

interface Project {
  project_id: string;
  name: string;
  repositories: string[];
  created_at: string;
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    project_id: 'project-1',
    name: 'Control Plane',
    repositories: ['sses79/factory-control-plane', 'sses79/factory-projects'],
    created_at: '2026-01-02T03:04:05.000Z',
    ...overrides,
  };
}

describe('toProjectSummary', () => {
  it('carries project_id, name and created_at through unchanged', () => {
    const project = makeProject();
    const summary = toProjectSummary(project);

    expect(summary).toEqual({
      project_id: project.project_id,
      name: project.name,
      created_at: project.created_at,
      repositories: [...project.repositories].sort(),
      repository_count: project.repositories.length,
    });
  });

  it('deduplicates and sorts repository slugs ascending', () => {
    const summary = toProjectSummary(
      makeProject({
        repositories: ['b/repo', 'a/repo', 'b/repo', 'A/repo'],
      }),
    );

    expect(summary.repositories).toEqual(['A/repo', 'a/repo', 'b/repo']);
    expect(summary.repository_count).toBe(3);
  });

  it('counts a duplicated slug once', () => {
    const summary = toProjectSummary(
      makeProject({ repositories: ['sses79/one', 'sses79/one'] }),
    );

    expect(summary.repositories).toEqual(['sses79/one']);
    expect(summary.repository_count).toBe(1);
  });

  it('handles a project with no repositories', () => {
    const summary = toProjectSummary(makeProject({ repositories: [] }));

    expect(summary.repositories).toEqual([]);
    expect(summary.repository_count).toBe(0);
  });

  it('throws on invalid created_at naming the project_id and value', () => {
    const project = makeProject({ created_at: '2026' });

    expect(() => toProjectSummary(project)).toThrow(
      `Project ${project.project_id} has invalid created_at: ${project.created_at}`,
    );
  });

  it('throws on an invalid repository slug naming the project_id and value', () => {
    const project = makeProject({ repositories: ['no-slash'] });

    expect(() => toProjectSummary(project)).toThrow(
      `Project ${project.project_id} has invalid repository: no-slash`,
    );
  });

  it('does not mutate its input', () => {
    const project = makeProject({
      repositories: ['b/repo', 'a/repo', 'b/repo'],
    });
    const repositories = [...project.repositories];
    const createdAt = project.created_at;

    toProjectSummary(project);

    expect(project.repositories).toEqual(repositories);
    expect(project.created_at).toBe(createdAt);
  });
});

describe('ProjectSummarySchema', () => {
  it('accepts every summary toProjectSummary builds', () => {
    const projects: Project[] = [
      makeProject(),
      makeProject({ repositories: [] }),
      makeProject({
        repositories: ['a/one', 'b/two', 'a/one'],
      }),
    ];

    for (const project of projects) {
      const summary = toProjectSummary(project);
      expect(ProjectSummarySchema.parse(summary)).toEqual(summary);
    }
  });
});
