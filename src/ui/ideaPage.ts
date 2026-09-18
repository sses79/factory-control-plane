import type { BlueprintStatus } from '../blueprintStatus.js';
import type { IdeaSummary } from '../ideaSummary.js';
import type { PlanRevision } from '../state/planningDatabase.js';

import { renderMarkdown } from './markdown.js';

export interface IdeaPageInput {
  idea: IdeaSummary;
  plan?: PlanRevision;
  blueprint?: { revision: number; status: BlueprintStatus };
  generatedAt: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function countText(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([label, count]) => `${escapeHtml(label)}: ${count}`)
    .join(', ');
}

function pullRequestCell(pullRequestUrl: string | undefined): string {
  if (pullRequestUrl === undefined) {
    return '';
  }
  if (!pullRequestUrl.startsWith('https://')) {
    return escapeHtml(pullRequestUrl);
  }
  const number = pullRequestUrl.slice(pullRequestUrl.lastIndexOf('/') + 1);
  return `<a href="${escapeHtml(pullRequestUrl)}">${escapeHtml(
    `#${number}`,
  )}</a>`;
}

type Packet = BlueprintStatus['phases'][number]['packets'][number];

function packetRow(packet: Packet): string {
  const runCell =
    packet.run_id === undefined
      ? ''
      : `<a href="/runs/${encodeURIComponent(
          packet.run_id,
        )}">${escapeHtml(packet.run_id)}</a>`;
  return `<tr><td>${escapeHtml(packet.feature_id)}</td><td>${escapeHtml(
    packet.status,
  )}</td><td>${String(packet.attempts)}</td><td>${runCell}</td><td>${pullRequestCell(
    packet.pull_request_url,
  )}</td></tr>`;
}

const PACKET_TABLE_HEAD =
  '<thead><tr><th>Feature</th><th>Status</th><th>Attempts</th><th>Run</th><th>Pull request</th></tr></thead>';

function phaseSection(phase: BlueprintStatus['phases'][number]): string {
  return `<h3>${escapeHtml(phase.title)}</h3>
<p>Goal: ${escapeHtml(phase.goal)}</p>
<p>Exit: ${escapeHtml(phase.exit)}</p>
<p>Counts: ${countText(phase.counts)}</p>
<table>
${PACKET_TABLE_HEAD}
<tbody>
${phase.packets.map(packetRow).join('\n')}
</tbody>
</table>`;
}

function planSection(plan: PlanRevision | undefined): string {
  if (plan === undefined) {
    return '<p>No plan recorded.</p>';
  }
  return `<p>Revision: ${String(plan.revision)}</p>
<p>Created at: ${escapeHtml(plan.created_at)}</p>
${renderMarkdown(plan.markdown)}`;
}

function blueprintSection(
  blueprint: { revision: number; status: BlueprintStatus } | undefined,
): string {
  if (blueprint === undefined) {
    return '<p>No blueprint recorded.</p>';
  }
  return `<p>Revision: ${String(blueprint.revision)}</p>
<p>Title: ${escapeHtml(blueprint.status.title)}</p>
<p>${countText(blueprint.status.totals)}</p>
${blueprint.status.phases.map(phaseSection).join('\n')}`;
}

export function renderIdeaPage(input: IdeaPageInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(input.idea.idea_id)}</title>
<style>
body {
  font-family: system-ui, -apple-system, sans-serif;
  margin: 1rem;
  color: #222;
}
h1, h2, h3 {
  font-weight: 600;
}
table {
  border-collapse: collapse;
  margin-top: 0.5rem;
}
th, td {
  border: 1px solid #ccc;
  padding: 0.25rem 0.5rem;
  text-align: left;
}
</style>
</head>
<body>
<h1>Idea ${escapeHtml(input.idea.idea_id)}</h1>
<p><a href="/">Back to dashboard</a></p>
<p>Generated at: ${escapeHtml(input.generatedAt)}</p>
<h2>Idea</h2>
<dl>
<dt>Idea ID</dt><dd>${escapeHtml(input.idea.idea_id)}</dd>
<dt>Operator ID</dt><dd>${escapeHtml(input.idea.operator_id)}</dd>
<dt>Created at</dt><dd>${escapeHtml(input.idea.created_at)}</dd>
<dt>Content length</dt><dd>${String(input.idea.content_length)}</dd>
<dt>Excerpt</dt><dd>${escapeHtml(input.idea.excerpt)}</dd>
</dl>
<h2>Plan</h2>
${planSection(input.plan)}
<h2>Blueprint</h2>
${blueprintSection(input.blueprint)}
</body>
</html>`;
}
