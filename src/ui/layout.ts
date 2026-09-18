/**
 * Shared page chrome for every control-plane view: one stylesheet, the header and navigation, and
 * the small components views compose (status badges, count tiles, progress bars, links).
 *
 * The response carries `content-security-policy: default-src 'none'; style-src 'unsafe-inline'`,
 * so everything here is inline CSS and plain HTML: no script, no web font, no image, no external
 * resource of any kind. Every value that comes from data is escaped before it reaches the page.
 */

export type NavSection = 'dashboard' | 'ideas';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

type Tone = 'success' | 'progress' | 'warning' | 'danger' | 'neutral' | 'merged';

const TONES: Record<string, Tone> = {
  MERGED: 'merged',
  DONE: 'success',
  SUCCEEDED: 'success',
  HUMAN_CHANGE_REVIEW: 'success',
  AWAITING_REVIEW: 'success',
  QUEUED: 'progress',
  CLAIMED: 'progress',
  RUNNING: 'progress',
  FEATURE_READY: 'progress',
  PREPARING_WORKSPACE: 'progress',
  BUILDING: 'progress',
  INNER_LOOP_VALIDATION: 'progress',
  AGENT_REVIEW: 'progress',
  DRAFT_PR: 'progress',
  CI_OBSERVATION: 'progress',
  REPAIR: 'warning',
  BLOCKED: 'warning',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  NOT_STARTED: 'neutral',
};

function toneOf(status: string): Tone {
  return TONES[status] ?? 'neutral';
}

/** A human label for a SCREAMING_SNAKE status, keeping the raw value for the title attribute. */
export function statusLabel(status: string): string {
  const words = status
    .split('_')
    .map((word) => (ACRONYMS.has(word) ? word : word.toLowerCase()));
  const label = words.join(' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const ACRONYMS = new Set(['CI', 'PR']);

/**
 * A long identifier shown short: the prefix and the first twelve characters after it, with the full
 * value in the title so it can still be read and copied.
 */
export function shortId(value: string): string {
  const match = /^([a-z]+-)([0-9a-f]{12})[0-9a-f]+$/.exec(value);
  const shown = match ? `${match[1] ?? ''}${match[2] ?? ''}` : value;
  return `<span title="${escapeHtml(value)}">${escapeHtml(shown)}</span>`;
}

export function statusBadge(status: string): string {
  return `<span class="badge badge-${toneOf(status)}" title="${escapeHtml(status)}">${escapeHtml(
    statusLabel(status),
  )}</span>`;
}

/**
 * Count tiles, one per status, in the order given. Zero counts are dimmed, or left out entirely with
 * `hideZero` where a progress bar already carries the picture.
 */
export function countTiles(
  counts: Record<string, number>,
  options: { hideZero?: boolean } = {},
): string {
  const entries = Object.entries(counts).filter(([, count]) => !options.hideZero || count > 0);
  if (entries.length === 0) {
    return '';
  }
  const tiles = entries
    .map(
      ([status, count]) =>
        `<div class="tile tile-${toneOf(status)}${count === 0 ? ' tile-zero' : ''}"><span class="tile-count">${String(
          count,
        )}</span><span class="tile-label">${escapeHtml(statusLabel(status))}</span></div>`,
    )
    .join('');
  return `<div class="tiles">${tiles}</div>`;
}

/** A progress bar of merged (or finished) work over total. */
export function progressBar(done: number, total: number, label: string): string {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return `<div class="progress" title="${escapeHtml(label)}"><div class="progress-track"><div class="progress-fill" style="width: ${String(
    percent,
  )}%"></div></div><span class="progress-label">${escapeHtml(label)}</span></div>`;
}

/**
 * A pull request link. Only an https URL becomes a link; anything else is shown as escaped text,
 * so a stored `javascript:` value can never become a live href.
 */
export function pullRequestLink(url: string | undefined): string {
  if (url === undefined) {
    return '<span class="muted">—</span>';
  }
  if (!url.startsWith('https://')) {
    return escapeHtml(url);
  }
  const number = url.slice(url.lastIndexOf('/') + 1);
  return `<a class="pr" href="${escapeHtml(url)}">${escapeHtml(`#${number}`)}</a>`;
}

/** An ISO timestamp shown compactly, with the exact value kept in the datetime attribute. */
export function timestamp(value: string | undefined): string {
  if (value === undefined) {
    return '<span class="muted">—</span>';
  }
  const compact = value.replace('T', ' ').replace(/(\.\d+)?(Z|[+-]\d\d:\d\d)$/, '');
  return `<time datetime="${escapeHtml(value)}">${escapeHtml(compact)}</time>`;
}

/** Wraps a table so wide tables scroll inside their card instead of widening the page. */
export function table(head: string[], rows: string[]): string {
  return `<div class="table-wrap"><table><thead><tr>${head
    .map((cell) => `<th>${escapeHtml(cell)}</th>`)
    .join('')}</tr></thead><tbody>
${rows.join('\n')}
</tbody></table></div>`;
}

export function card(title: string, body: string, meta = ''): string {
  return `<section class="card"><header class="card-head"><h2>${escapeHtml(title)}</h2>${
    meta === '' ? '' : `<div class="card-meta">${meta}</div>`
  }</header>${body}</section>`;
}

export function emptyState(sentence: string): string {
  return `<p class="empty">${escapeHtml(sentence)}</p>`;
}

export function renderPage(input: {
  title: string;
  heading: string;
  section: NavSection;
  generatedAt: string;
  body: string;
  subheading?: string;
}): string {
  const nav = (section: NavSection, href: string, label: string) =>
    `<a href="${href}"${input.section === section ? ' class="active" aria-current="page"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)}</title>
<style>${STYLES}</style>
</head>
<body>
<header class="topbar"><div class="topbar-inner"><span class="brand">Factory Control Plane</span><nav>${nav(
    'dashboard',
    '/',
    'Dashboard',
  )}${nav('ideas', '/ideas', 'Ideas')}</nav><span class="generated">Generated at: ${escapeHtml(
    input.generatedAt,
  )}</span></div></header>
<main>
<div class="page-head"><h1>${escapeHtml(input.heading)}</h1>${
    input.subheading === undefined ? '' : `<p class="subheading">${escapeHtml(input.subheading)}</p>`
  }</div>
${input.body}
</main>
</body>
</html>`;
}

const STYLES = `
:root {
  --bg: #f6f7f9; --surface: #ffffff; --border: #e3e6ea; --text: #1d2330; --muted: #6b7280;
  --accent: #3b5bdb; --topbar: #151a24; --topbar-text: #e7eaf0; --row-alt: #fafbfc;
  --success-bg: #e6f4ea; --success-fg: #1e7a34; --progress-bg: #e7efff; --progress-fg: #2b4fc9;
  --warning-bg: #fff4d6; --warning-fg: #8a5a00; --danger-bg: #fde8e8; --danger-fg: #b42318;
  --neutral-bg: #eef0f3; --neutral-fg: #4b5563; --merged-bg: #efe7fd; --merged-fg: #6d3fc0;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f131a; --surface: #171c26; --border: #2a3140; --text: #e4e7ee; --muted: #9aa3b2;
    --accent: #8ea8ff; --topbar: #0a0d13; --topbar-text: #e4e7ee; --row-alt: #1a202b;
    --success-bg: #173524; --success-fg: #7ee2a0; --progress-bg: #1b2a4d; --progress-fg: #9db6ff;
    --warning-bg: #3a2e10; --warning-fg: #f5c969; --danger-bg: #3d1a1a; --danger-fg: #ff9b8f;
    --neutral-bg: #252c38; --neutral-fg: #b6bfcc; --merged-bg: #2c2046; --merged-fg: #c9b1ff;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.topbar { background: var(--topbar); color: var(--topbar-text); }
.topbar-inner {
  max-width: 1180px; margin: 0 auto; padding: 0 20px; height: 52px;
  display: flex; align-items: center; gap: 28px;
}
.brand { font-weight: 650; letter-spacing: 0.01em; }
.topbar nav { display: flex; gap: 4px; }
.topbar nav a {
  color: var(--topbar-text); opacity: 0.72; padding: 6px 12px; border-radius: 6px;
}
.topbar nav a:hover { opacity: 1; text-decoration: none; background: rgba(255,255,255,0.08); }
.topbar nav a.active { opacity: 1; background: rgba(255,255,255,0.14); }
.generated { margin-left: auto; font-size: 12px; opacity: 0.6; }
main { max-width: 1180px; margin: 0 auto; padding: 24px 20px 48px; }
.page-head { margin-bottom: 20px; }
h1 { font-size: 22px; font-weight: 650; margin: 0; }
.subheading { color: var(--muted); margin: 4px 0 0; }
.card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  padding: 18px 20px; margin-bottom: 20px;
}
.card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.card-head h2 { font-size: 16px; font-weight: 650; margin: 0; }
.card-meta { color: var(--muted); font-size: 12px; }
h3 { font-size: 15px; font-weight: 650; margin: 0; }
.tiles { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
.tile {
  min-width: 108px; padding: 8px 12px; border-radius: 8px; display: flex; flex-direction: column;
  background: var(--neutral-bg); color: var(--neutral-fg);
}
.tile-count { font-size: 20px; font-weight: 700; line-height: 1.2; }
.tile-label { font-size: 12px; }
.tile-zero { opacity: 0.45; }
.tile-success { background: var(--success-bg); color: var(--success-fg); }
.tile-progress { background: var(--progress-bg); color: var(--progress-fg); }
.tile-warning { background: var(--warning-bg); color: var(--warning-fg); }
.tile-danger { background: var(--danger-bg); color: var(--danger-fg); }
.tile-merged { background: var(--merged-bg); color: var(--merged-fg); }
.badge {
  display: inline-block; padding: 1px 9px; border-radius: 999px; font-size: 12px; font-weight: 600;
  white-space: nowrap; background: var(--neutral-bg); color: var(--neutral-fg);
}
.badge-success { background: var(--success-bg); color: var(--success-fg); }
.badge-progress { background: var(--progress-bg); color: var(--progress-fg); }
.badge-warning { background: var(--warning-bg); color: var(--warning-fg); }
.badge-danger { background: var(--danger-bg); color: var(--danger-fg); }
.badge-merged { background: var(--merged-bg); color: var(--merged-fg); }
.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; }
table { width: 100%; border-collapse: collapse; }
th {
  text-align: left; font-size: 12px; font-weight: 600; color: var(--muted); background: var(--row-alt);
  padding: 8px 12px; border-bottom: 1px solid var(--border); white-space: nowrap;
}
td { padding: 8px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover td { background: var(--row-alt); }
td.id, td.id a, .id { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; white-space: nowrap; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
td.wide { min-width: 240px; }
td.nowrap { white-space: nowrap; }
time { white-space: nowrap; color: var(--muted); font-variant-numeric: tabular-nums; }
.muted { color: var(--muted); }
.empty { color: var(--muted); font-style: italic; margin: 4px 0; }
a.pr { font-weight: 600; }
.progress { display: flex; align-items: center; gap: 10px; }
.progress-track { flex: 1; min-width: 120px; height: 8px; background: var(--neutral-bg); border-radius: 999px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--merged-fg); border-radius: 999px; }
.progress-label { font-size: 12px; color: var(--muted); white-space: nowrap; }
dl.facts { display: grid; grid-template-columns: max-content 1fr; gap: 6px 20px; margin: 0; }
dl.facts dt { color: var(--muted); }
dl.facts dd { margin: 0; }
.phase { border-top: 1px solid var(--border); padding-top: 16px; margin-top: 16px; }
.phase-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.phase p { margin: 2px 0; color: var(--muted); }
.phase p strong { color: var(--text); font-weight: 600; }
.phase .tiles { margin: 10px 0; }
.prose { max-width: 760px; }
details.plan > summary {
  cursor: pointer; color: var(--accent); font-weight: 600; list-style: none; padding: 2px 0;
}
details.plan > summary::-webkit-details-marker { display: none; }
details.plan > summary::before { content: "▸ "; }
details.plan[open] > summary::before { content: "▾ "; }
details.plan[open] > summary { margin-bottom: 8px; }
.prose h1 { font-size: 20px; margin: 4px 0 10px; }
.prose h2 { font-size: 16px; margin: 20px 0 6px; }
.prose h3 { font-size: 14px; margin: 16px 0 4px; }
.prose p, .prose li { color: var(--text); }
.prose ul, .prose ol { padding-left: 22px; }
.prose code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; background: var(--row-alt); padding: 1px 5px; border-radius: 4px; }
.prose pre { background: var(--row-alt); border: 1px solid var(--border); border-radius: 8px; padding: 12px; overflow-x: auto; }
.prose pre code { background: none; padding: 0; }
@media (max-width: 720px) {
  .topbar-inner { gap: 14px; }
  .generated { display: none; }
  .tile { min-width: 92px; }
}
`;
