/**
 * 親ウィンドウ → 実行 iframe（`/scratch-runner/`）へのメッセージ送信を 1 か所にまとめる。
 *
 * 診断 v1.0.16 の V11「`postMessage(..., '*')`」への対応方針:
 *
 * 実行 iframe は `sandbox="allow-scripts"`（`allow-same-origin` なし）なので
 * **不透明オリジン**を持ち、`event.origin` も宛先オリジンも文字列 `"null"` になる。
 * `postMessage` の `targetOrigin` はタプルオリジンとの一致しか受け付けないため、
 * 不透明オリジンに対しては `'*'` 以外を指定できない（`'null'` を渡しても届かない）。
 * つまり「具体的なオリジンに変える」ことは仕様上できないので、代わりに
 *   1. 送信先は常に親が保持する自前 iframe の `contentWindow` に限る
 *   2. 送る中身は許可したキーだけを明示的に組み立てる（オブジェクトのスプレッドを使わない）
 *      → 将来 payload に API キーなどが紛れ込んでも、`'*'` で外へ出ることがない
 * を構造的に保証する。`allow-same-origin` を足すと隔離が失われるため sandbox は変えない
 * （`src/tests/release-v117.test.ts` が固定している）。
 */

/** 実行 iframe の sandbox。`allow-same-origin` を足すと不透明オリジンでなくなる。 */
export const RUNNER_SANDBOX = 'allow-scripts';

/**
 * 不透明オリジン（sandbox iframe）宛てのため `'*'` 以外は選べない。
 * 受信側（public/scratch-runner/runner.js）は親オリジンを referrer から求め、
 * 送信元が違えば捨てる。親側も `event.origin === 'null'` と `event.source` を検査する。
 */
export const RUNNER_TARGET_ORIGIN = '*';

export type RunnerPayload =
  | { type: 'run'; engineUrl: string; bytes: Uint8Array }
  | { type: 'stop' };

/** 送信する形。`bytes`（.sb3 のバイト列）と `engineUrl`（公開 URL）以外は載せない。 */
export function runnerMessage(payload: RunnerPayload): {
  source: 'scratchpy-parent';
  type: RunnerPayload['type'];
  engineUrl?: string;
  bytes?: Uint8Array;
} {
  if (payload.type === 'run') {
    return { source: 'scratchpy-parent', type: 'run', engineUrl: payload.engineUrl, bytes: payload.bytes };
  }
  return { source: 'scratchpy-parent', type: 'stop' };
}

/** 自前の iframe にだけ送る。参照が無ければ何もしない。 */
export function postToRunner(target: Window | null | undefined, payload: RunnerPayload): void {
  if (!target) return;
  target.postMessage(runnerMessage(payload), RUNNER_TARGET_ORIGIN);
}
