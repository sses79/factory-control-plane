import type { BlueprintStatus } from '../blueprintStatus.js';
import type { IdeaSummary } from '../ideaSummary.js';
import type { PlanRevision } from '../state/planningDatabase.js';
import {
  card,
  countTiles,
  emptyState,
  escapeHtml,
  progressBar,
  pullRequestLink,
  renderPage,
  shortId,
  statusBadge,
  table,
  timestamp,
} from './layout.js';
import { renderMarkdown } from './markdown.js';

export interface IdeaPageInput {
  idea: IdeaSummary;
  plan?: PlanRevision;
  blueprint?: { revision: number; status: BlueprintStatus };
  generatedAt: string;
}

type Phase = BlueprintStatus['phases'][number];
type Packet = Phase['packets'][number];

function packetRow(packet: Packet): string {
  const runCell =
    packet.run_id === undefined
      ? '<span class="muted">—</span>'
      : `<a href="/runs/${encodeURIComponent(packet.run_id)}">${shortId(packet.run_id)}</a>`;
  return `<tr><td class="id wide">${escapeHtml(packet.feature_id)}</td><td>${statusBadge(
    packet.status,
  )}</td><td class="num">${String(packet.attempts)}</td><td class="id">${runCell}</td><td>${pullRequestLink(
    packet.pull_request_url,
  )}</td></tr>`;
}

function mergedOf(counts: Record<string, number>): number {
  return counts['MERGED'] ?? 0;
}

function totalOf(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function phaseSection(phase: Phase): string {
  const merged = mergedOf(phase.counts);
  const total = totalOf(phase.counts);
  return `<div class="phase">
<div class="phase-head"><h3>${escapeHtml(phase.title)}</h3>${progressBar(
    merged,
    total,
    `${String(merged)} of ${String(total)} merged`,
  )}</div>
<p><strong>Goal</strong> ${escapeHtml(phase.goal)}</p>
<p><strong>Exit</strong> ${escapeHtml(phase.exit)}</p>
${countTiles(phase.counts, { hideZero: true })}
${table(['Feature', 'Status', 'Attempts', 'Run', 'Pull request'], phase.packets.map(packetRow))}
</div>`;
}

function ideaCard(idea: IdeaSummary): string {
  return card(
    'Idea',
    `<dl class="facts">
<dt>Idea ID</dt><dd class="id">${escapeHtml(idea.idea_id)}</dd>
<dt>Operator</dt><dd>${escapeHtml(idea.operator_id)}</dd>
<dt>Recorded</dt><dd>${timestamp(idea.created_at)}</dd>
<dt>Length</dt><dd>${String(idea.content_length)} characters</dd>
<dt>Excerpt</dt><dd>${escapeHtml(idea.excerpt)}</dd>
</dl>`,
  );
}

function planCard(plan: PlanRevision | undefined): string {
  if (plan === undefined) {
    return card('Plan', emptyState('No plan recorded.'));
  }
  // Collapsed by default: a plan is long and read once, the blueprint above it is checked often.
  // <details> needs no script, which the page's content-security-policy does not allow.
  return card(
    'Plan',
    `<details class="plan"><summary>Show the plan</summary><div class="prose">${renderMarkdown(
      plan.markdown,
    )}</div></details>`,
    `Revision ${String(plan.revision)} · ${timestamp(plan.created_at)}`,
  );
}

function blueprintCard(
  blueprint: { revision: number; status: BlueprintStatus } | undefined,
): string {
  if (blueprint === undefined) {
    return card('Blueprint', emptyState('No blueprint recorded.'));
  }
  const totals = blueprint.status.totals;
  const merged = mergedOf(totals);
  const total = totalOf(totals);
  return card(
    'Blueprint',
    `<p><strong>${escapeHtml(blueprint.status.title)}</strong></p>
${progressBar(merged, total, `${String(merged)} of ${String(total)} packets merged`)}
<div style="height: 12px"></div>
${countTiles(totals)}
${blueprint.status.phases.map(phaseSection).join('\n')}`,
    `Revision ${String(blueprint.revision)}`,
  );
}

export function renderIdeaPage(input: IdeaPageInput): string {
  return renderPage({
    title: input.idea.idea_id,
    heading: input.idea.idea_id,
    subheading: input.idea.excerpt,
    section: 'ideas',
    generatedAt: input.generatedAt,
    body: [ideaCard(input.idea), blueprintCard(input.blueprint), planCard(input.plan)].join('\n'),
  });
}
