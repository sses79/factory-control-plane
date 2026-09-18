import { PACKET_STATUSES } from '../blueprintStatus.js';
import type { BlueprintStatus } from '../blueprintStatus.js';
import type { IdeaSummary } from '../ideaSummary.js';
import { card, emptyState, escapeHtml, progressBar, renderPage, table, timestamp } from './layout.js';

export interface IdeaListEntry {
  idea: IdeaSummary;
  plan_revision?: number;
  blueprint?: { revision: number; totals: BlueprintStatus['totals'] };
}

function planCell(planRevision: number | undefined): string {
  if (planRevision === undefined) {
    return '<td class="nowrap"><span class="muted">No plan</span></td>';
  }
  return `<td class="nowrap">rev ${String(planRevision)}</td>`;
}

function blueprintCell(
  blueprint: { revision: number; totals: BlueprintStatus['totals'] } | undefined,
): string {
  if (blueprint === undefined) {
    return '<td><span class="muted">No blueprint</span></td>';
  }
  const total = PACKET_STATUSES.reduce((sum, status) => sum + blueprint.totals[status], 0);
  const merged = blueprint.totals.MERGED;
  // The full count per status stays in the title, in PACKET_STATUSES order, for anyone who wants it.
  const breakdown = PACKET_STATUSES.map(
    (status) => `${status}: ${String(blueprint.totals[status])}`,
  ).join(', ');
  return `<td title="${escapeHtml(breakdown)}"><span class="muted">rev ${String(
    blueprint.revision,
  )}</span>${progressBar(merged, total, `${String(merged)} of ${String(total)} merged`)}</td>`;
}

function ideaRow(entry: IdeaListEntry): string {
  const idea = entry.idea;
  return `<tr><td class="id"><a href="/ideas/${encodeURIComponent(idea.idea_id)}">${escapeHtml(
    idea.idea_id,
  )}</a></td><td class="wide">${escapeHtml(idea.excerpt)}</td><td>${timestamp(
    idea.created_at,
  )}</td>${planCell(entry.plan_revision)}${blueprintCell(entry.blueprint)}</tr>`;
}

export function renderIdeaList(input: { ideas: IdeaListEntry[]; generatedAt: string }): string {
  const body =
    input.ideas.length === 0
      ? card('Ideas', emptyState('No ideas recorded.'))
      : card(
          'Ideas',
          table(['Idea', 'Excerpt', 'Recorded', 'Plan', 'Blueprint'], input.ideas.map(ideaRow)),
          `${String(input.ideas.length)} recorded`,
        );
  return renderPage({
    title: 'Ideas',
    heading: 'Ideas',
    subheading: 'Each idea with its plan and how far its blueprint has got.',
    section: 'ideas',
    generatedAt: input.generatedAt,
    body,
  });
}
