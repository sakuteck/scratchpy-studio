import { Fragment, type ReactNode } from 'react';

/**
 * AI の返答を「記号のまま」出さないための最小の整形。
 *
 * 外部の Markdown レンダラは入れない（HTML 文字列を組み立てないので XSS の入口を作らない）。
 * 扱うのは、モデルがよく使う次の記法だけ:
 *   - 見出し（`#`, `##`, `###`）
 *   - 箇条書き（`-`, `*`, `+`）と番号付きリスト（`1.`, `1)`）→ `<ul>` / `<ol>`
 *   - 引用（`> `）→ `<blockquote>`（記号は残さない）
 *   - フェンス（``` … ```）→ `<pre><code>`
 *   - 強調（`**text**`）とインラインコード（`` `code` ``）
 *   - バックスラッシュのエスケープ（`\*` → `*`）
 * 表などそれ以外は、記号を消さずに素の文字として出す（崩れないことを優先する）。
 *
 * v1.0.17（診断 V7）: `<ol>`・引用・フェンス・エスケープ・空文字対応を追加。
 * 空文字列は「空配列」を返す（以前は `<br/>` 1 個になっていた）。
 */
export function renderTutorMessage(text: string): ReactNode[] {
  if (!text.trim()) return [];

  const lines = text.split('\n');
  const nodes: ReactNode[] = [];
  let list: { ordered: boolean; items: ReactNode[] } | null = null;
  // 連続する地の文は、行間だけを <br> にして 1 つのまとまりにする
  let prose: string[] = [];
  const flushList = () => {
    if (!list) return;
    const items = list.items;
    nodes.push(list.ordered ? <ol key={`list-${nodes.length}`}>{items}</ol> : <ul key={`list-${nodes.length}`}>{items}</ul>);
    list = null;
  };
  const flushProse = () => {
    if (!prose.length) return;
    const run = prose.map((line, i) => (
      <Fragment key={`p-${nodes.length}-${i}`}>
        {inline(line)}
        {i < prose.length - 1 ? <br /> : null}
      </Fragment>
    ));
    nodes.push(<Fragment key={`prose-${nodes.length}`}>{run}</Fragment>);
    prose = [];
  };
  const flushAll = () => { flushProse(); flushList(); };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    // ``` フェンス: 閉じるまでをそのままコードとして出す（長い塊はサニタイザが既に置換している）
    if (/^\s*```/.test(line)) {
      flushAll();
      const body: string[] = [];
      let next = index + 1;
      for (; next < lines.length && !/^\s*```/.test(lines[next]); next++) body.push(lines[next]);
      nodes.push(<pre key={`pre-${index}`}><code>{body.join('\n')}</code></pre>);
      index = next; // 閉じるフェンスを読み飛ばす
      continue;
    }

    const ordered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (ordered) {
      flushProse();
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; }
      list.items.push(<li key={`li-${index}`}>{inline(ordered[2])}</li>);
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flushProse();
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; }
      list.items.push(<li key={`li-${index}`}>{inline(bullet[1])}</li>);
      continue;
    }
    flushList();

    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flushProse();
      nodes.push(<blockquote key={`quote-${index}`}>{inline(quote[1])}</blockquote>);
      continue;
    }

    const heading = /^\s*#{1,3}\s+(.*)$/.exec(line);
    if (heading) {
      flushProse();
      nodes.push(<strong key={`heading-${index}`} className="ai-md-heading">{inline(heading[1])}</strong>);
      continue;
    }

    prose.push(line);
  }
  flushAll();
  return nodes;
}

/** 強調とインラインコードだけを要素にする（それ以外は文字列のまま）。 */
function inline(text: string): ReactNode[] {
  // `\*` のようなエスケープは「その記号そのもの」として残す。目印に NUL を使い、最後に戻す。
  const unescaped = text.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, '\u0000$1');
  const restore = (value: string) => value.split('\u0000').join('');
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const match of unescaped.matchAll(pattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) out.push(restore(unescaped.slice(last, start)));
    if (token.startsWith('**')) out.push(<strong key={`b-${start}`}>{restore(token.slice(2, -2))}</strong>);
    else out.push(<code key={`c-${start}`}>{restore(token.slice(1, -1))}</code>);
    last = start + token.length;
  }
  if (last < unescaped.length) out.push(restore(unescaped.slice(last)));
  return out;
}
