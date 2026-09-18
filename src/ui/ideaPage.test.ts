import { describe, expect, it } from 'vitest';

import type { BlueprintStatus } from '../blueprintStatus.js';
import type { IdeaSummary } from '../ideaSummary.js';
import type { PlanRevision } from '../state/planningDatabase.js';

import { renderIdeaPage, type IdeaPageInput } from './ideaPage.js';

const GENERATED_AT = '2026-09-18T12:00:00+00:00';

const IDEA: IdeaSummary = {
  idea_id: 'idea-42',
  operator_id: 'operator-1',
  classification: 'public',
  content_sha256: 'a'.repeat(64),
  created_at: '2026-09-18T10:00:00+00:00',
  origin: 'local-manual',
  content_length: 351,
  excerpt: 'Example idea excerpt.',
};

const PLAN: PlanRevision = {
  idea_id: 'idea-42',
  revision: 3,
  created_at: '2026-09-18T11:00:00+00:00',
  content_sha256: 'b'.repeat(64),
  markdown: '# Overview\n\nBuild the thing.',
};

const BLUEPRINT: { revision: number; status: BlueprintStatus } = {
  revision: 2,
  status: {
    idea_id: 'idea-42',
    project_id: 'project-1',
    title: 'Ship the idea',
    phases: [
      {
        phase_id: 'phase-1',
        title: 'Phase one',
        goal: 'Reach the checkpoint.',
        exit: 'All packets done.',
        packets: [
          {
            feature_id: 'feat-a',
            title: 'Feature A',
            repository: 'acme/proj-a',
            depends_on: [],
            status: 'AWAITING_REVIEW',
            attempts: 2,
            run_id: 'run-1',
            pull_request_url: 'https://github.com/acme/proj-a/pull/7',
          },
          {
            feature_id: 'feat-b',
            title: 'Feature B',
            repository: 'acme/proj-b',
            depends_on: ['feat-a'],
            status: 'QUEUED',
            attempts: 1,
          },
        ],
        counts: {
          NOT_STARTED: 0,
          QUEUED: 1,
          RUNNING: 0,
          AWAITING_REVIEW: 1,
          FAILED: 0,
        },
      },
      {
        phase_id: 'phase-2',
        title: 'Phase two',
        goal: 'Finish the work.',
        exit: 'Shipped.',
        packets: [
          {
            feature_id: 'feat-c',
            title: 'Feature C',
            repository: 'acme/proj-c',
            depends_on: [],
            status: 'NOT_STARTED',
            attempts: 0,
          },
        ],
        counts: {
          NOT_STARTED: 1,
          QUEUED: 0,
          RUNNING: 0,
          AWAITING_REVIEW: 0,
          FAILED: 0,
        },
      },
    ],
    totals: {
      NOT_STARTED: 1,
      QUEUED: 1,
      RUNNING: 0,
      AWAITING_REVIEW: 1,
      FAILED: 0,
    },
  },
};

function fullInput(): IdeaPageInput {
  return {
    idea: IDEA,
    plan: PLAN,
    blueprint: BLUEPRINT,
    generatedAt: GENERATED_AT,
  };
}

function tagAttributeNames(html: string): string[] {
  const names: string[] = [];
  const tagPattern =
    /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z][a-zA-Z0-9-]*\s*=\s*"[^"]*")*)\s*\/?>/g;
  let tag: RegExpExecArray | null;
  while ((tag = tagPattern.exec(html)) !== null) {
    const attributes = tag[2] ?? '';
    const attributePattern = /\s+([a-zA-Z][a-zA-Z0-9-]*)\s*=/g;
    let attribute: RegExpExecArray | null;
    while ((attribute = attributePattern.exec(attributes)) !== null) {
      names.push(attribute[1]!);
    }
  }
  return names;
}

describe('renderIdeaPage', () => {
  it('returns an HTML5 document titled with the idea id and a link back to /', () => {
    const html = renderIdeaPage(fullInput());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>idea-42</title>');
    expect(html).toContain('<a href="/">');
  });

  it('shows the idea id, operator, created at, content length and excerpt', () => {
    const html = renderIdeaPage(fullInput());
    expect(html).toContain('<dt>Idea ID</dt><dd>idea-42</dd>');
    expect(html).toContain('<dt>Operator ID</dt><dd>operator-1</dd>');
    expect(html).toContain(
      '<dt>Created at</dt><dd>2026-09-18T10:00:00+00:00</dd>',
    );
    expect(html).toContain('<dt>Content length</dt><dd>351</dd>');
    expect(html).toContain('<dt>Excerpt</dt><dd>Example idea excerpt.</dd>');
  });

  it('shows the plan revision and the markdown rendered by renderMarkdown', () => {
    const html = renderIdeaPage(fullInput());
    expect(html).toContain('<p>Revision: 3</p>');
    expect(html).toContain('<p>Created at: 2026-09-18T11:00:00+00:00</p>');
    expect(html).toContain('<h1>Overview</h1>');
    expect(html).toContain('<p>Build the thing.</p>');
  });

  it('shows the blueprint revision, title, totals and phases in order', () => {
    const html = renderIdeaPage(fullInput());
    expect(html).toContain('<p>Revision: 2</p>');
    expect(html).toContain('<p>Title: Ship the idea</p>');
    expect(html).toContain(
      'NOT_STARTED: 1, QUEUED: 1, RUNNING: 0, AWAITING_REVIEW: 1, FAILED: 0',
    );
    const firstPhase = html.indexOf('<h3>Phase one</h3>');
    const secondPhase = html.indexOf('<h3>Phase two</h3>');
    expect(firstPhase).toBeGreaterThan(-1);
    expect(secondPhase).toBeGreaterThan(firstPhase);
    expect(html).toContain('<p>Goal: Reach the checkpoint.</p>');
    expect(html).toContain('<p>Exit: All packets done.</p>');
    expect(html).toContain(
      'Counts: NOT_STARTED: 0, QUEUED: 1, RUNNING: 0, AWAITING_REVIEW: 1, FAILED: 0',
    );
    expect(html).toContain('<p>Goal: Finish the work.</p>');
    expect(html).toContain('<p>Exit: Shipped.</p>');
    expect(html).toContain(
      '<th>Feature</th><th>Status</th><th>Attempts</th><th>Run</th><th>Pull request</th>',
    );
  });

  it('renders a packet row with feature, status, attempts, run and pull request', () => {
    const html = renderIdeaPage(fullInput());
    expect(html).toContain(
      '<td>feat-a</td><td>AWAITING_REVIEW</td><td>2</td><td><a href="/runs/run-1">run-1</a></td><td><a href="https://github.com/acme/proj-a/pull/7">#7</a></td>',
    );
    expect(html).toContain(
      '<td>feat-b</td><td>QUEUED</td><td>1</td><td></td><td></td>',
    );
  });

  it('encodes a run id containing a slash and quote in the run link', () => {
    const input = structuredClone(fullInput());
    input.blueprint!.status.phases[0]!.packets[0]!.run_id = 'run/with"quote';
    const html = renderIdeaPage(input);
    expect(html).toContain('<a href="/runs/run%2Fwith%22quote">');
    expect(html).not.toContain('href="/runs/run/with');
    expect(html).toContain('>run/with&quot;quote</a>');
  });

  it('renders a javascript: pull request url as escaped text without a href', () => {
    const input = structuredClone(fullInput());
    input.blueprint!.status.phases[0]!.packets[0]!.pull_request_url =
      'javascript:alert(1)';
    const html = renderIdeaPage(input);
    expect(html).toContain('<td>javascript:alert(1)</td>');
    expect(html).not.toContain('href="javascript:');
  });

  it('says no plan or blueprint recorded when they are absent', () => {
    const html = renderIdeaPage({ idea: IDEA, generatedAt: GENERATED_AT });
    expect(html).toContain('<p>No plan recorded.</p>');
    expect(html).toContain('<p>No blueprint recorded.</p>');
  });

  it('escapes a feature id or excerpt containing markup', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const input = structuredClone(fullInput());
    input.idea.excerpt = payload;
    input.blueprint!.status.phases[0]!.packets[0]!.feature_id = payload;
    const html = renderIdeaPage(input);
    const escapedPayload = '&lt;img src=x onerror=alert(1)&gt;';
    expect(html).toContain(`<dd>${escapedPayload}</dd>`);
    expect(html).toContain(`<td>${escapedPayload}</td>`);
    expect(html).not.toContain(payload);
  });

  it('escapes the idea id in the title', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const input = structuredClone(fullInput());
    input.idea.idea_id = payload;
    const html = renderIdeaPage(input);
    expect(html).toContain(
      '<title>&lt;img src=x onerror=alert(1)&gt;</title>',
    );
    expect(html).not.toContain(payload);
  });

  it('contains no script element, on-prefixed attribute or external resource', () => {
    const html = renderIdeaPage(fullInput());
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<\/script\b/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<img\b/i);

    const attributes = tagAttributeNames(html);
    expect(
      attributes.some((name) => name.toLowerCase().startsWith('on')),
    ).toBe(false);
    expect(attributes).not.toContain('src');

    const styleElements = html.match(/<style[\s>][\s\S]*?<\/style>/g) ?? [];
    expect(styleElements).toHaveLength(1);
    expect(styleElements[0]).toMatch(/^<style>/);
  });

  it('does not mutate its input and produces deterministic output', () => {
    const input = fullInput();
    const snapshot = structuredClone(input);
    const first = renderIdeaPage(input);
    const second = renderIdeaPage(input);
    expect(input).toEqual(snapshot);
    expect(second).toEqual(first);
  });
});
