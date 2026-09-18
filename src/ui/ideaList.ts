import { PACKET_STATUSES } from '../blueprintStatus.js';
import type { BlueprintStatus } from '../blueprintStatus.js';
import type { IdeaSummary } from '../ideaSummary.js';

export interface IdeaListEntry {
  idea: IdeaSummary;
  plan_revision?: number;
  blueprint?: { revision: number; totals: BlueprintStatus['totals'] };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function planCell(planRevision: number | undefined): string {
  if (planRevision === undefined) {
    return '<td>No plan</td>';
  }
  return `<td>rev ${String(planRevision)}</td>`;
}

function blueprintCell(
  blueprint:
    | { revision: number; totals: BlueprintStatus['totals'] }
    | undefined,
): string {
  if (blueprint === undefined) {
    return '<td>No blueprint</td>';
  }
  const totals = PACKET_STATUSES.map(
    (status) => `${status}: ${String(blueprint.totals[status])}`,
  ).join(', ');
  return `<td>rev ${String(blueprint.revision)} ${totals}</td>`;
}

function ideaRow(entry: IdeaListEntry): string {
  const idea = entry.idea;
  return `<tr><td><a href="/ideas/${encodeURIComponent(
    idea.idea_id,
  )}">${escapeHtml(idea.idea_id)}</a></td><td>${escapeHtml(
    idea.excerpt,
  )}</td><td>${escapeHtml(idea.created_at)}</td>${planCell(
    entry.plan_revision,
  )}${blueprintCell(entry.blueprint)}</tr>`;
}

export function renderIdeaList(input: {
  ideas: IdeaListEntry[];
  generatedAt: string;
}): string {
  const rows = input.ideas.map(ideaRow).join('\n');
  const listBody =
    input.ideas.length === 0
      ? '<p>No ideas recorded.</p>'
      : `<table>
<thead><tr><th>Idea</th><th>Excerpt</th><th>Created</th><th>Plan</th><th>Blueprint</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Ideas</title>
<style>
body {
  font-family: system-ui, -apple-system, sans-serif;
  margin: 1rem;
  color: #222;
}
h1 {
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
<h1>Ideas</h1>
<p><a href="/">Back to dashboard</a></p>
<p>Generated at: ${escapeHtml(input.generatedAt)}</p>
${listBody}
</body>
</html>`;
}
