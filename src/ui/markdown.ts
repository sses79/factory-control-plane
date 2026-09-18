const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderInline(source: string): string {
  let html = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    if (char === '`') {
      const end = source.indexOf('`', index + 1);
      if (end !== -1) {
        html += `<code>${escapeHtml(source.slice(index + 1, end))}</code>`;
        index = end + 1;
        continue;
      }
    } else if (char === '[') {
      const close = source.indexOf(']', index + 1);
      if (close !== -1 && source[close + 1] === '(') {
        let end = close + 2;
        let depth = 1;
        while (end < source.length && depth > 0) {
          const nextChar = source[end]!;
          if (nextChar === '(') {
            depth += 1;
          } else if (nextChar === ')') {
            depth -= 1;
          }
          end += 1;
        }
        if (depth === 0) {
          const text = source.slice(index + 1, close);
          const target = source.slice(close + 2, end - 1);
          const inner = renderInline(text);
          if (target.startsWith('https://')) {
            html += `<a href="${escapeHtml(target)}">${inner}</a>`;
          } else {
            html += inner;
          }
          index = end;
          continue;
        }
      }
    } else if (char === '*' && source[index + 1] === '*') {
      const end = source.indexOf('**', index + 2);
      if (end !== -1 && end > index + 2) {
        html += `<strong>${renderInline(
          source.slice(index + 2, end),
        )}</strong>`;
        index = end + 2;
        continue;
      }
    } else if (char === '*') {
      const end = source.indexOf('*', index + 1);
      if (end !== -1 && end > index + 1) {
        html += `<em>${renderInline(source.slice(index + 1, end))}</em>`;
        index = end + 1;
        continue;
      }
    }
    html += escapeHtml(char);
    index += 1;
  }
  return html;
}

export function renderMarkdown(source: string): string {
  if (source === '') {
    return '';
  }

  const lines = source.split('\n');
  const blocks: string[] = [];
  let index = 0;
  let inFence = false;
  const codeLines: string[] = [];

  while (index < lines.length) {
    const line = lines[index]!;
    const trimmed = line.trim();

    if (inFence) {
      if (trimmed.startsWith('```')) {
        blocks.push(
          `<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`,
        );
        codeLines.length = 0;
        inFence = false;
      } else {
        codeLines.push(line);
      }
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      inFence = true;
      index += 1;
      continue;
    }

    if (trimmed === '') {
      index += 1;
      continue;
    }

    const heading = HEADING_PATTERN.exec(line.trimStart());
    if (heading !== null) {
      const level = heading[1]!.length;
      blocks.push(`<h${level}>${renderInline(heading[2]!)}</h${level}>`);
      index += 1;
      continue;
    }

    const unorderedItem = /^- (.*)$/.exec(line.trimStart());
    if (unorderedItem !== null) {
      const items: string[] = [unorderedItem[1]!];
      index += 1;
      while (index < lines.length) {
        const next = lines[index]!;
        const item = /^- (.*)$/.exec(next.trimStart());
        if (next.trim() === '' || item === null) {
          break;
        }
        items.push(item[1]!);
        index += 1;
      }
      blocks.push(
        `<ul>${items
          .map((item) => `<li>${renderInline(item)}</li>`)
          .join('')}</ul>`,
      );
      continue;
    }

    const orderedItem = /^(\d+)\. (.*)$/.exec(line.trimStart());
    if (orderedItem !== null) {
      const items: string[] = [orderedItem[2]!];
      index += 1;
      while (index < lines.length) {
        const next = lines[index]!;
        const item = /^(\d+)\. (.*)$/.exec(next.trimStart());
        if (next.trim() === '' || item === null) {
          break;
        }
        items.push(item[2]!);
        index += 1;
      }
      blocks.push(
        `<ol>${items
          .map((item) => `<li>${renderInline(item)}</li>`)
          .join('')}</ol>`,
      );
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index]!;
      const nextTrimmed = next.trim();
      if (nextTrimmed === '') {
        break;
      }
      if (
        nextTrimmed.startsWith('```') ||
        HEADING_PATTERN.test(next.trimStart()) ||
        /^- /.test(nextTrimmed) ||
        /^\d+\. /.test(nextTrimmed)
      ) {
        break;
      }
      paragraph.push(next);
      index += 1;
    }
    blocks.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
  }

  if (inFence) {
    blocks.push(
      `<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`,
    );
  }

  return blocks.join('\n');
}
