/**
 * Cloudflare Pages の `_headers` を最小限だけ再現する（検証用）。
 *
 * 本物の仕様で重要なのは次の 3 点で、どれも「重なると壊れる」方向に働く:
 *   1. 一致する規則は**すべて**適用される（狭い規則が広い規則を置き換えるわけではない）
 *   2. 同じ名前のヘッダを 2 回書くと**カンマで連結**される（上書きではない）
 *   3. `! Name` は、それまでに積まれた同名ヘッダを消す（が、適用順に依存する）
 *
 * そのため「`/*` で CSP を出し、`/scratch-runner/*` で別の CSP を出す」と
 * `frame-ancestors 'none', 'self'` のような値になり、実行 iframe が本番だけで
 * 拒否される。ここでは規則を解析し、任意のパスについて**最終的なヘッダ**を
 * 求められるようにする（順序を変えても結果が変わらないことをテストで確かめる）。
 */

/** 1 行がパス行か（インデントされていない、空でない行） */
const isPathLine = line => /^\S/.test(line);
const isHeaderLine = line => /^\s+\S/.test(line);

export function parseHeaders(text) {
  const rules = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (isPathLine(line)) {
      const paths = line.split(/\s+/).filter(Boolean);
      // 連続するパス行は 1 つの規則（＝同じヘッダを配るパス群）としてまとめる。
      if (current && current.entries.length === 0) current.paths.push(...paths);
      else rules.push((current = { paths, entries: [] }));
      continue;
    }
    if (!isHeaderLine(line) || !current) continue;
    const body = line.trim();
    if (body.startsWith('!')) {
      current.entries.push({ detach: body.slice(1).trim() });
      continue;
    }
    const at = body.indexOf(':');
    if (at === -1) continue;
    current.entries.push({ name: body.slice(0, at).trim(), value: body.slice(at + 1).trim() });
  }
  return rules;
}

/** Cloudflare のパス照合（`*` は任意の文字列、それ以外は完全一致） */
export function matchesPath(pattern, pathname) {
  if (pattern === pathname) return true;
  if (!pattern.includes('*')) return false;
  const source = pattern
    .split('*')
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}$`).test(pathname);
}

/**
 * パスに適用される最終ヘッダ。
 * 同じ名前が複数回現れた場合は Cloudflare と同じくカンマ連結になるので、
 * 呼び出し側が「重複しているか」を判定できるよう配列で返す。
 */
export function collectHeaders(rules, pathname, { reverse = false } = {}) {
  const ordered = reverse ? [...rules].reverse() : rules;
  const acc = new Map();
  const touch = name => {
    if (!acc.has(name)) acc.set(name, []);
    return acc.get(name);
  };
  for (const rule of ordered) {
    if (!rule.paths.some(path => matchesPath(path, pathname))) continue;
    for (const entry of rule.entries) {
      if (entry.detach) {
        const list = touch(entry.detach);
        list.length = 0;
        continue;
      }
      touch(entry.name).push(entry.value);
    }
  }
  const result = {};
  for (const [name, values] of acc) {
    if (values.length) result[name] = values.join(', ');
  }
  return result;
}

/** 重複（＝カンマ連結）しているヘッダ名を返す。空なら健全。 */
export function duplicateHeaders(rules, pathname) {
  const seen = new Map();
  for (const rule of rules) {
    if (!rule.paths.some(path => matchesPath(path, pathname))) continue;
    for (const entry of rule.entries) {
      if (entry.detach) continue;
      seen.set(entry.name, (seen.get(entry.name) || 0) + 1);
    }
  }
  return [...seen].filter(([, count]) => count > 1).map(([name]) => name);
}
