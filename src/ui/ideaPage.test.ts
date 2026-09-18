import { describe, expect, it } from 'vitest';

import type { BlueprintStatus } from '../blueprintStatus.js';
import type { IdeaSummary } from '../ideaSummary.js';
import type { PlanRevision } from '../state/planningDatabase.js';

import { renderIdeaPage, type IdeaPageInput } from './ideaPage.js';
import { expectSafeDocument } from './testSafety.js';

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
          MERGED: 0,
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
          MERGED: 0,
          FAILED: 0,
        },
      },
    ],
    totals: {
      NOT_STARTED: 1,
      QUEUED: 1,
      RUNNING: 0,
      AWAITING_REVIEW: 1,
      MERGED: 0,
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

describe('renderIdeaPage', () => {
  it('returns a safe document headed by the idea id, with the ideas section active', () => {
    const html = renderIdeaPage(fullInput());
    expect(html).toContain('<title>idea-42</title>');
    expect(html).toContain('<h1>idea-42</h1>');
    expect(html).toContain('<p class="subheading">Example idea excerpt.</p>');
    expect(html).toContain('<a href="/ideas" class="active" aria-current="page">Ideas</a>');
    expect(html).toContain(`Generated at: ${GENERATED_AT}`);
    expectSafeDocument(html);
  });

  it('shows the idea id, operator, recorded time, length and excerpt', () => {
    const html = renderIdeaPage(fullInput());
    expect(html).toContain('<dt>Idea ID</dt><dd class="id">idea-42</dd>');
    expect(html).toContain('<dt>Operator</dt><dd>operator-1</dd>');
    expect(html).toContain('<dt>Recorded</dt><dd><time datetime="2026-09-18T10:00:00+00:00">2026-09-18 10:00:00</time></dd>');
    expect(html).toContain('<dt>Length</dt><dd>351 characters</dd>');
    expect(html).toContain('<dt>Excerpt</dt><dd>Example idea excerpt.</dd>');
  });

  it('shows the blueprint before the plan, and the plan collapsed and rendered from markdown', () => {
    const html = renderIdeaPage(fullInput());
    expect(html.indexOf('<h2>Blueprint</h2>')).toBeLessThan(html.indexOf('<h2>Plan</h2>'));
    expect(html).toContain('Revision 3 · <time datetime="2026-09-18T11:00:00+00:00">');
    expect(html).toContain('<details class="plan"><summary>Show the plan</summary>');
    expect(html).toContain('<h1>Overview</h1>');
    expect(html).toContain('<p>Build the thing.</p>');
  });

  it('shows the blueprint revision, title, overall progress, totals and each phase in order', () => {
    const html = renderIdeaPage(fullInput());
    expect(html).toContain('Revision 2');
    expect(html).toContain('<p><strong>Ship the idea</strong></p>');
    expect(html).toContain('0 of 3 packets merged');
    expect(html).toContain('<span class="tile-count">1</span><span class="tile-label">Awaiting review</span>');
    expect(html).toContain('<h3>Phase one</h3>');
    expect(html).toContain('<p><strong>Goal</strong> Reach the checkpoint.</p>');
    expect(html).toContain('<p><strong>Exit</strong> All packets done.</p>');
    const phases = BLUEPRINT.status.phases.map((phase) => html.indexOf(`<h3>${phase.title}</h3>`));
    expect([...phases].sort((a, b) => a - b)).toEqual(phases);
  });

  it('renders a packet row with feature, status badge, attempts, run link and pull request', () => {
    const html = renderIdeaPage(fullInput());
    expect(html).toContain('<td class="id wide">feat-a</td>');
    expect(html).toContain('<span class="badge badge-success" title="AWAITING_REVIEW">Awaiting review</span>');
    expect(html).toContain('<td class="num">2</td>');
    expect(html).toContain('<a href="/runs/run-1"><span title="run-1">run-1</span></a>');
    expect(html).toContain('<a class="pr" href="https://github.com/acme/proj-a/pull/7">#7</a>');
    expect(html).toContain('<span class="badge badge-progress" title="QUEUED">Queued</span>');
  });

  it('encodes a run id containing a slash and a quote in its link', () => {
    const input = fullInput();
    const packet = { ...BLUEPRINT.status.phases[0]!.packets[0]!, run_id: 'run/1"x' };
    input.blueprint = {
      revision: 2,
      status: { ...BLUEPRINT.status, phases: [{ ...BLUEPRINT.status.phases[0]!, packets: [packet] }] },
    };
    const html = renderIdeaPage(input);
    expect(html).toContain('href="/runs/run%2F1%22x"');
    expectSafeDocument(html);
  });

  it('states an absent plan or blueprint', () => {
    const html = renderIdeaPage({ idea: IDEA, generatedAt: GENERATED_AT });
    expect(html).toContain('<p class="empty">No plan recorded.</p>');
    expect(html).toContain('<p class="empty">No blueprint recorded.</p>');
    expect(html).not.toContain('<table>');
  });

  it('escapes markup in the excerpt and in a feature id', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const input = fullInput();
    input.idea = { ...IDEA, excerpt: payload };
    const packet = { ...BLUEPRINT.status.phases[0]!.packets[0]!, feature_id: payload };
    input.blueprint = {
      revision: 2,
      status: { ...BLUEPRINT.status, phases: [{ ...BLUEPRINT.status.phases[0]!, packets: [packet] }] },
    };
    const html = renderIdeaPage(input);
    expect(html).not.toContain(payload);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expectSafeDocument(html);
  });

  it('does not mutate its input', () => {
    const input = fullInput();
    const snapshot = structuredClone(input);
    renderIdeaPage(input);
    expect(input).toEqual(snapshot);
  });
});
