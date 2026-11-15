# ScratchPy Studio v1.1.0 — セキュリティレビュー（公開版）

- 対象: `ScratchPy-Cloudflare-Pages-v1.1.0.zip`（`1.1.0`）
- 前提版: v1.0.12 の診断メモ（`脆弱性診断-v1.0.12.md`）の指摘を**すべて実装で解消**し、同メモに**書かれていなかった項目**も追加で塞いだ
- 手法: クリーン展開 → `npm ci` → `tsc --noEmit` → 全テスト → 4版ビルド → `npm audit --omit=dev`・`npm audit`（dev 込み）→ `npm run check:headers` / `check:editions` / `check:cssvars` → **ヘッダを実際に付けて配信し、Chromium で 4 版 + Blockly + Scratch 実行 + AI パネルを動作確認**
- 対象範囲: `src/core`（言語・変換）、`src/app`（Studio UI・AI）、`src/education`、`public/`（runner・ヘッダ）、`.github/`（CI）、`vite.config.ts`

---

## 0. 結論

1. **v1.0.12 のメモにあった 中2・低5・情報6 は、すべて修正済み**。修正はテストで固定しており、再発すると CI が落ちる。
2. メモに**無かった**問題として、次の 3 点を追加で発見し、修正した。
   - **CSP を入れると Blockly のアイコンが外部ドメイン（`blockly-demo.appspot.com`）へ取りに行き、ブロック画面が欠ける**（メモの修正案をそのまま適用すると起きる回帰）。→ Blockly のメディアを `public/blockly-media/` に同梱し、`media` オプションで自ホストを指定。
   - **`/scratch-runner/*` の CSP をメモの案（`connect-src data: blob:` / `'unsafe-eval'` 無し）で入れると実行が壊れる**。ヘッダと `index.html` の meta CSP は**両方が満たされる必要がある**（交差）。→ meta と揃えたうえで `frame-ancestors 'self'` を追加。
   - **アセット名 `__proto__` は `Object.create(null)` だけでは直らない**（`fflate` 内部のオブジェクトで同じ破壊が起き、`TypeError` になる）。→ 名前に加えて**書き出し前の検証**を入れた。
3. 判定は「重大 0・高 0・中 0・低 0（残存は運用上の注意のみ）」。**XSS・コード実行・キー窃取・データ破壊は、試した範囲で成立しない**。

| 区分 | v1.0.12 | v1.0.13 |
|---|---|---|
| 重大（任意コード実行・窃取） | 0 | **0** |
| 高 | 0 | **0** |
| 中（DoS） | 2 | **0**（上限で遮断） |
| 低 | 5 | **0**（全て修正） |
| 情報 | 6 | **0**（設定・文書・テストで解消） |

---

## 1. 指摘への対応（1 件ずつ）

### 【中-1】`.sb3` の解凍に上限が無い → **修正済み**

`src/core/sb3/zip.ts`

```ts
export const MAX_SB3_BYTES    = 50 * 1024 * 1024;   // 圧縮後 50 MB
export const MAX_SB3_ENTRIES  = 2000;
export const MAX_SB3_UNZIPPED = 64 * 1024 * 1024;       // 展開後合計 64 MB
export const MAX_PROJECT_JSON_BYTES = 8 * 1024 * 1024; // project.json 単体
```

- 読み込み**前**にファイルサイズを検査（`assertSb3Size(f.size)`：`App.tsx` 3 か所、`EducationApp.tsx` 1 か所）。`arrayBuffer()` に巨大ファイルを渡さない。
- 展開は `unzipSync(bytes, { filter })`。`filter` は展開しながら呼ばれるので、**エントリ数・展開後サイズが上限に達した時点で例外**にして打ち切る（メモリを食い尽くす前に止まる）。
- 超過は専用の診断 `zip.tooLarge` / `zip.tooManyEntries` / `zip.expandsTooMuch` / `zip.projectJsonTooLarge`（日英）。既存のエラー UI にそのまま乗る。

**実測（`security-hardening.test.ts`）**

| 入力 | v1.0.12 | v1.0.13 |
|---|---|---|
| 200,000 バイトのゼロ ×2 を詰めた zip（圧縮後 < 20 KB） | 展開成功・受理 | `zip.expandsTooMuch` で停止 |
| 9 エントリの zip（上限 3 で検証） | — | `zip.tooManyEntries` で停止 |
| 50 MB + 1 バイト | `arrayBuffer()` が読む | `zip.tooLarge` で停止（読む前に判定） |
| 上限内の正常な `.sb3` | 受理 | 受理（回帰なし） |

### 【中-2】テキスト入力・行数に上限が無い → **修正済み**

`src/core/lang/parser.ts` の `parseCollect` 入口で判定し、`text.tooLarge`（50,000 行 / 2 MB）を返す。`analyzeText` 経由の全 UI が自動的にこの診断を表示する。同期パースでの UI 停止は、入力を上限で切ることで回避（Worker 化は将来の改善候補）。

**実測**: 50,001 行 → 即座に `text.tooLarge`（パースに進まない）／通常のサンプル → 変化なし。

### 【低-1】セキュリティヘッダが 2 本しかない → **修正済み（＋メモの案を 2 点修正）**

`public/_headers`

```text
/*
  Content-Security-Policy: default-src 'self'; base-uri 'none'; object-src 'none';
    frame-ancestors 'none'; form-action 'self'; script-src 'self';
    style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:;
    font-src 'self' data:; worker-src 'self' blob:; frame-src 'self'; child-src 'self';
    connect-src 'self' https://api.openai.com https://generativelanguage.googleapis.com https://api.anthropic.com
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), usb=(), serial=(), payment=(), …
```

メモの案からの修正点:

- **`frame-ancestors 'self'` → `'none'`（＋ `X-Frame-Options: DENY`）**。アプリ本体を埋め込む正当な用途は無いので、同一オリジンも許可しない。埋め込みが必要なのは runner だけ。
- **`form-action 'none'` → `'self'`**。`'none'` にすると将来フォーム（検索など）を足したときに壊れる。CSP の他の値はメモどおり。
- `connect-src` の 3 API は必須（抜くと AI が動かない）。`style-src 'unsafe-inline'` も必要（実測で確認）。

**実行検証（Chromium）**: `dist/` を `_headers` と同じヘッダで配信し、4 版すべての表示、Blockly の描画、Scratch の実行、AI パネルの表示を確認。**CSP 違反 0 件・ページエラー 0 件。**

### 【低-2】`allowedHosts: true` → **修正済み**

`vite.config.ts` の `allowedDevHosts()` が返すのは `localhost` / `127.0.0.1` / `[::1]` と、環境変数 `PREVIEW_HOST`（カンマ区切り）で明示したホストのみ。`server` と `preview` の両方に適用。ワイルドカード許可は使わない。テストで `allowedHosts: true` の再来と `PREVIEW_HOST` の欠落を検出。

### 【低-3】未処理 `TypeError`（400 変異中 21 件）→ **修正済み**

`src/core/api.ts` の `sb3ToText` を薄いラッパにし、**最上位の最後の網**を 1 か所だけ置いた。

```ts
try { return sb3ToTextInner(bytes, language); }
catch (e) {
  if (e instanceof Sb3ParseError) throw e;           // 既存の丁寧な診断は保つ
  if (e instanceof RangeError)   throw new Sb3ParseError(diag('api.depth'));
  throw new Sb3ParseError(diag('sb3.unknown'));      // 内部文字列を出さない
}
```

**実測（テスト）**: `{"targets":"nope"}` / `{"targets":[{"isStage":true}]}` / `{}` / `[]` の 4 種すべてが `Sb3ParseError` になり、例外メッセージは辞書の文言。UI に `op.startsWith is not a function` のような内部文言は出ない。

### 【低-4】`saveSb3` の `__proto__` → **修正済み（メモの 1 行では不十分だった）**

`Object.create(null)` に加えて、アセット名を検証する。

```ts
export const SAFE_ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const UNSAFE_NAMES = new Set(['__proto__', 'constructor', 'prototype']);
for (const [name, bytes] of assets) { if (!isSafeAssetName(name)) continue; data[name] = bytes; }
```

**理由**: `fflate` は内部で `r[name] = [file, opts]` のように**素のオブジェクト**へ代入するため、`Object.create(null)` だけでは `__proto__` を渡した時点で `zipSync` が `TypeError`（`p.level` が undefined）で落ちることを実測で確認した。名前の段階で除外するのが正しい。

### 【低-5】任意のサイトが runner を iframe で駆動できる → **修正済み（多層化）**

1. `_headers` の `/scratch-runner/*` に `frame-ancestors 'self'`（＋ `X-Frame-Options: SAMEORIGIN`）。第三者サイトへの埋め込み自体を拒否。
2. `runner.js` が `document.referrer` から親オリジンを推定し、`event.origin` が一致しないメッセージを無視。`parent.postMessage` の送信先も親オリジンに限定（推定できない場合のみ `'*'`）。
3. `event.source !== parent` の既存チェックは維持。

**残る限界（正直な記載）**: `document.referrer` が空になる設定（`Referrer-Policy: no-referrer` を利用者が強制した場合など）では推定できず、`'*'` にフォールバックする。ただし `frame-ancestors 'self'` により第三者の埋め込みは拒否されるため、実質的な駆動経路は無い。

### 【情報 6 件】

| # | 対応 |
|---|---|
| I-1 CI のタグ参照 | `actions/checkout@11bd7190…`（v4.2.2）、`actions/setup-node@39370e3…`（v4.1.0）へ **commit SHA 固定**。`persist-credentials: false`。Dependabot で更新 PR |
| I-2 runner の CSP が meta のみ／`unsafe-eval` | ヘッダにも同内容を付与。**meta と交差する**ため内容を揃えた。`unsafe-eval` は不透明オリジンの iframe 内に閉じるので許容し、**理由をヘッダにコメントとして残した** |
| I-3 `collectUi()` 既定で除外が混ざる | **引数なしでも allowlist を読む**（`defaultSkipFiles()`）。戻り値に `skipFiles` を追加し、`frozen`（除外後）と `skipped`（除外分）を分離したまま |
| I-4 `x: undefined` | `(t.x ?? 0)` で補完。欠落した座標を持つ target を取り込んでも `undefined` を書かない（テストで固定） |
| I-5 Education の localStorage | README に「共有端末ではサイトデータを消去」を明記（キーは保存しない） |
| I-6 依存監視 | CI に `npm audit --omit=dev`、Dependabot（npm 週次 / Actions 月次、自動マージなし） |

---

## 2. メモに無かった追加の強化

| # | 項目 | 対応 |
|---|---|---|
| A-1 | **CSP 導入で Blockly の画像が外部取得になる**（`blockly-demo.appspot.com`） | `node_modules/blockly/media` を `public/blockly-media/` に同梱し、`Blockly.inject({ media })` で自ホストを指定。実測で CSP 違反 0 件 |
| A-2 | **ヘッダ CSP と meta CSP の交差**（片方だけ直すと実行不能） | runner のヘッダを meta と同一内容にし、`frame-ancestors` のみ追加。CI のブラウザ検証で実行まで確認 |
| A-3 | **AI がプロジェクトを生成してしまう**（プロンプトインジェクション／過剰生成） | 通常版の AI を説明専用へ。役割定義で禁止し、さらに **表示直前のサニタイズ**（12 行超・`stage:`/`sprite` 宣言を含むフェンスは非表示）で二重化。旧生成プロンプトの再来はテストで検出 |
| A-4 | **AI へ渡す文脈が無制限**（コード全体・履歴全件） | コードは先頭 12,000 文字、履歴は直近 4 往復、質問は 4,000 文字まで。**送信内容を UI に常時表示** |
| A-5 | **1 質問で最大 9 リクエスト**（自動修正 3 × 503 再送 3） | 自動修正ループを撤去し、1 質問 1 リクエスト（503 再送で最大 3）に削減。課金・情報送信の双方で有利 |
| A-6 | **`Cross-Origin-Opener-Policy` が無い** | `same-origin` を追加（ウィンドウ参照を介した攻撃面の縮小） |
| A-7 | **runner の `Cross-Origin-Embedder-Policy`** | `credentialless` を付与（第三者リソースの資格情報送信を防ぐ） |
| A-8 | **`/assets/*` の長期キャッシュ** | `immutable` を明示（内容ハッシュ付きファイル名のため安全） |
| A-9 | **プロンプトに言語仕様を確実に渡す** | `docs/01-scratchpy-language.md` を `?raw` で同梱し、`SYSTEM_PROMPT` 先頭に役割定義、続けて言語処理の設計図（lexer → parser → checker → exporter → importer → validate/ZIP）を付加。本番バンドルに含まれることをテストで確認 |
| A-10 | **`__proto__` を含む ZIP を読み込んだ後の再書き出し** | `saveSb3` の名前検証（低-4 と同じ）。`Object.prototype` が変化しないことをテストで固定 |

---

## 3. 「攻撃が成立しない」ことの再確認（v1.0.13 実測）

| 試したこと | 結果 |
|---|---|
| XSS の sink（`innerHTML` / `eval` / `new Function` / `document.write` / `srcdoc`） | `src` 全体で **0 件**（維持） |
| `.sb3` のターゲット名に `"` と改行を入れてコード注入 | `JSON.stringify` 由来のクォートでエスケープされ、再パースで元に戻る。注入は成立しない |
| `__proto__` を変数名・アセット名に持つ `.sb3` | `Object.prototype` は無変化。書き出しでは危険名を除外し、ZIP も壊れない |
| パーサ DoS（括弧 5,000 段・インデント 100 段・深いリスト） | 上限（200 / 101 / 80）で即エラー。加えて入力量の上限を追加 |
| ZIP 爆弾 | 展開後 64 MB / `project.json` 8 MB / 2,000 エントリで遮断（`filter` による打ち切り） |
| API キーの扱い | localStorage 保存 0 件、`type="password"`、`secure context` 以外は送信不可、コード・質問への混入時は送信中止、エラー文言は伏字化、OpenAI は `store:false` |
| runner の隔離 | `sandbox="allow-scripts"`（`allow-same-origin` なし）、拡張セキュリティ 11 フラグ、親オリジン検証、`frame-ancestors 'self'` |
| 配信物 | 実行時の外部リソース読み込み 0（Blockly media も自ホスト化）、sourcemap なし、ハードコード秘密 0、`postinstall` 0、`npm audit` 0 |
| ヘッダ適用下の動作 | 4 版 + Blockly + Scratch 実行 + AI パネルで **CSP 違反 0・ページエラー 0** |

---

## 4. 残存リスク（受容または運用でカバー）

| # | 内容 | 判断 |
|---|---|---|
| R-1 | **同期パースによる UI 停止** | 入力上限（50,000 行 / 2 MB）で実害を抑制。Worker 化は将来の改善 |
| R-2 | **AI の回答内容そのものの正確性** | 説明専用にし、エディターへ適用しない設計で影響を限定。UI に「診断と Scratch の動作を正とする」と明記 |
| R-3 | **ブラウザから API キーが見える**（BYOK の本質的制約） | 保存しない・送信先を限定・`secure context` 必須・利用上限の設定を促す。サーバ側プロキシは「キーを運営者が持つ」別リスクになるため採用しない |
| R-4 | **レート制限が無い**（公開サイトでのAI乱用） | キーは利用者自身のものなので課金は本人負担。Cloudflare 側の Rate limiting を任意で併用可（文書化のみ） |
| R-5 | **動的生成の文言・外部ライブラリの例外**は静的監査の対象外 | README とスクリプト冒頭に明記済み（既知の限界） |
| R-6 | **`unsafe-eval` を runner で許可** | TurboWarp が要求。不透明オリジン＋`default-src 'none'`＋11 フラグで閉じている |

---

## 5. 検証手順（再現用）

```bash
npm ci
npx tsc --noEmit
npm test                 # 378 tests / 29 files
npm run build            # dist/ に4版
npx http-server dist -p 4180   # ヘッダ無しの確認用
```

ヘッダ込みの確認は、`public/_headers` を適用する簡易サーバ（リポジトリ外の検証スクリプト）で `dist/` を配信し、Chromium（Playwright）で
`/`・`/en/`・`/education/`・`/education/en/` の表示、Blockly の描画、Scratch の実行、AI パネルを確認する。**CSP 違反とページエラーが 0 件であること**を合格条件にしている。

> 前回メモの「ブラウザの実行系が無く runner を確認できなかった」という検証ギャップは、`libnspr4`・`libnss3` などを `apt-get download` → `dpkg-deb -x` でローカル展開し、`LD_LIBRARY_PATH` を指定して Chromium を起動することで解消した（root 権限は不要）。今回のレビューでは runner の実動作まで確認している。

---

## 6. 総評

- v1.0.12 の指摘は**すべて実装で解消**し、テストで固定した。
- 追加で見つかった「CSP を入れると Blockly が壊れる」「ヘッダと meta の交差で runner が動かない」「`Object.create(null)` だけでは `__proto__` を防げない」は、**修正案をそのまま適用すると踏む回帰**だった。今回はヘッダ適用下での実ブラウザ検証まで行い、回帰が無いことを確認している。
- 残るリスクは「BYOK の本質（キーがブラウザに見える）」「AI 回答の正確性」「同期パースの将来改善」で、いずれも**設計上の受容**として文書化した。

---

## 7. v1.0.14 で追加した防御（評価レポート P2-3 / P3 対応）

| 項目 | v1.0.13 | v1.0.14 |
|---|---|---|
| 展開後サイズ上限 | 300 MB（実運用に対して過大） | **64 MB**（v1.0.15 で 128 MB から引き下げ） |
| `project.json` 単体の上限 | なし | **8 MB**（`zip.projectJsonTooLarge`） |
| 安全でないアセット名 | 無言で書き出しから除外 | `saveSb3Report` が `skipped` を返し、`export.assetNameSkipped` の警告として日英表示 |
| アプリページの COEP | 未設定（`/scratch-runner/*` のみ） | `/*` に `credentialless`＋`CORP: same-site` |
| `/assets/*` | `CORP` 未設定（COEP 文書から読めない可能性） | `CORP: cross-origin`（`immutable` は据え置き） |
| `/scratch-runner/*` | `COEP` のみ | 不透明オリジンから読めるよう `CORP: cross-origin` を追加 |
| AI チューターのサニタイズ | `~~~`・タグ無しフェンス・合計行数で回避可能 | 4 経路すべて遮断、合計 24 行予算 |
| AI に送る内容の表示 | コード冒頭と診断件数のみ | これまでのやりとり件数と前回の送信文字数も表示 |

`_headers` を実際に適用して配信する検証（`check-csp.cjs`）と、`_headers` の内容を固定する `release-v114.test.ts` の両方で、**CSP 違反 0・ページエラー 0** を確認しています。


---

## 8. v1.0.15 で追加した防御（総合診断 v1.0.14 対応）

| 項目 | v1.0.14 | v1.0.15 |
|---|---|---|
| 展開後サイズ上限 | 128 MB（上限内の 100 MB も通っていた） | **64 MB**（`MAX_SB3_UNZIPPED`。テストの期待値も同じ値で固定） |
| AI の地の文コード | フェンス**内**だけを検査（フェンス無しの 20 行は素通り） | 返答全体を行単位で走査。`stage:` / `sprite` 宣言、連続 12 行／合計 24 行を超える塊を説明文に置換 |
| 診断の英語混入 | `join('、')` で日本語の読点が混じった | 名前ごとに 1 件ずつ診断（最大 5 件）＋残数は `export.assetNameSkippedMore`。`、` は使わない |
| 配色のちらつき（FOUC） | 初回描画後に `data-theme` を設定（夜モードで白く光る） | 本体 JS より前に `public/theme-init.js` が反映。**インラインではなく外部ファイル**なので CSP は `script-src 'self'` のままで、ハッシュ注入も不要 |
| 配信容量 | 3.8 MB のエンジンを 4 版に重複（`dist` 21 MB） | `dist/engine/scaffolding.js` に 1 コピー（`dist` 約 10 MB）。エンジン本体は上流の無改変バンドル。不透明オリジンの runner から読むため `/engine/*` に `Cross-Origin-Resource-Policy: cross-origin` を追加（**この 1 行が無いと `_headers` 適用下で「実行できません」になる**ことを `check-csp.cjs` で検出） |
| 失敗の検出 | CI は型検査・単体テスト・ビルドのみ | `scripts/smoke-browser.cjs` を CI に追加（4 版の白画面・CSP ヘッダ・`theme-init.js` の順序・配色切替・共有エンジンの配信） |

### 変わっていない（意図的な据え置き）

- CSP の内容は v1.0.14 と同じ（`default-src 'self'`、`script-src 'self'`、`object-src 'none'`、`frame-ancestors 'none'`）。`theme-init.js` を外部ファイルにしたため、**ハッシュの追加も `'unsafe-inline'` の緩和も不要**です。
- `Report-Only` の CSP は導入していません。違反収集の送信先を持たない構成では、`check-csp.cjs` の「`_headers` を適用した状態で CSP 違反 0」というローカル検証のほうが実効性が高いと判断しました（本番の `report-uri` 運用は未検証であることをここに明記します）。
- 変換エンジン（`src/core/lang`・`src/core/sb3` のロジック）には触れていません。変更は CSS、診断の整形（`api.ts`）、上限定数（`zip.ts`）、配色の初期化スクリプト、ビルドスクリプトのみです。

---

## 9. v1.0.16 で直したもの（総合診断 v1.0.15 対応）

### 本番でしか壊れない 2 件

| 項目 | v1.0.15 | v1.0.16 |
|---|---|---|
| `_headers` の二重定義 | `/*` と `/scratch-runner/*` の両方に CSP と `X-Frame-Options`。Cloudflare Pages は同名ヘッダを**カンマ連結**するため、実行 iframe が `frame-ancestors 'none', 'self'` を受けて**本番だけ拒否**される | 規則を「全パス共通」「アプリ文書 6 パス」「`/scratch-runner/*`」「`/assets/*`」「`/engine/*`」に分割し、**同じヘッダを 2 回書かない**構成にした。`scripts/lib/headers-rules.mjs` が Cloudflare の照合（glob・全規則適用・カンマ連結・`!` による解除）を再現し、`npm run check:headers` が重複 0・順序非依存・向き（文書は `none`/`DENY`、runner は `self`/`SAMEORIGIN`）を検査する |
| 単独ビルドにエンジンが無い | エンジンの配置は `scripts/build-pages.mjs` だけ。`npm run build:ja` などの成果物には `engine/` が無く、**「実行」だけが 404 → 30 秒タイムアウト**。パスも絶対固定でサブディレクトリ配置に弱かった | Vite のプラグイン（`scratchpy-engine`）が**どのビルドでも** `engine/scaffolding.js` を出力。アプリは `BASE_URL` 基準で解決し、`?v=<version>` を付けてキャッシュを更新する。統合ビルドのみ `VITE_ENGINE_URL` で 1 コピーを共有 |

### 検証の穴

- `scripts/smoke-browser.cjs` は `_headers` を解釈しない素のサーバで配っていたため、「CSP でしか壊れない不具合」を検出できなかった。現在は `scripts/lib/pages-server.mjs` が**実際に `_headers` を適用**して配り、実行 iframe が動くところまで確認する。ブラウザが無いときのスキップも、CI（`SMOKE_REQUIRE_BROWSER=1`）では**失敗**にした。
- 文書が「`check-contrast.cjs`／`check-v114.cjs` で実測」と書いていたが、リポジトリに無かった。**`scripts/check-headers.mjs` / `check-contrast.cjs` / `check-colour-modes.cjs` / `check-theme-init.cjs` を同梱**し、CI でも実行する。文書の記述はこの 4 本に合わせた。

### AI（説明専用）の担保

- 返答を**行単位で正規化**してからコード判定する（行頭の `>` 引用と箇条書き記号を外す）。これが無いと、AI が「引用」の体裁で出しただけの 30 行コードが上限を素通りした。
- 逆に、URL の一覧（`https://…`）と入れ子の箇条書きをコードと誤認していたのを直した（正当な説明が削られていた）。
- 返答は**最小限の Markdown だけ**を要素にする（`**強調**`・`` `コード` ``・見出し・箇条書き）。HTML を組み立てないので XSS の入口は増えない。`dangerouslySetInnerHTML` は使っていない。伏せたときはラベルにも印を出す。

### その他

- 依存: `playwright` を 1.49.1 → 1.65.0 に更新（GHSA-7mvr-c777-76hp）。`npm audit --omit=dev` は引き続き 0 件。
- Education 版は `theme-init.js` を読み込まない（配色固定のため 1 命令も仕事をしていなかった）。英語版の HTML から日本語コメントを除去。
- コントラスト: Education の 3 件（3.78 / 4.17 / 4.42）を 6.85 / 6.66 / 6.17 に。検査は**レッスン内のクイズ・ヒント・答え合わせ**の状態も走査する（この 3 件はそこにしか現れない）。
- `LearnGuide` を実際のモーダルに（Escape・初期フォーカス・フォーカスの循環・背景 `inert`・復帰）。Studio に `<header>` / `<main>` / `h1`（スクリーンリーダー用）を追加。
- `engines` は既に `^22.12.0 || ^24.0.0 || >=26.0.0` が定義済みだった（診断の指摘は古い）。`.node-version`（22.20.0）と整合していることをテストで固定した。

### 既知のまま残すもの

- **往復変換でコメント行が消える／型注釈が `any` ⇄ `str` で揺れる**（診断 N-B7）。これは変換エンジン（`src/core/lang`・`src/core/sb3`）の設計に属するため、**この版では触っていない**。非対応ブロックの記録を構造化データとして保持する案は将来の課題。
- `postMessage` の `targetOrigin` は `'*'` のまま。実行 iframe は `sandbox="allow-scripts"`（不透明オリジン）なので、送信先を特定オリジンに固定できません。受信側は `event.origin === 'null'` と `event.source === iframe.contentWindow` を検査しています。
- CSP の `style-src 'unsafe-inline'` は残ります（インライン style 属性を多用しているため）。XSS の入口を作らない方針（AI 返答を HTML にしない）と組み合わせて受容します。

---

## 10. v1.0.17 で直したもの（総合診断 v1.0.16 対応）

診断の指摘 V1〜V13 をすべて閉じ、**指摘に無い同種の問題**も塞いだ。変換エンジン（`src/core/lang`・`src/core/sb3`）には触れていない。

### 配信ヘッダ（V1 / V4 / V13）

| 項目 | v1.0.16 | v1.0.17 |
|---|---|---|
| 教育版の `index.html` 直 URL | 文書ブロックが末尾スラッシュ形の 6 パス列挙で、`/education/index.html` と `/education/en/index.html` に **CSP も `X-Frame-Options` も付かなかった**（v1.0.15 からの回帰） | 文書ブロックを**版のディレクトリ単位**（`/`・`/index.html`・`/en/*`・`/education/*`）に変更。配信される HTML の一覧は `dist/**/index.html` から導出し、16 文書パスすべてで `frame-ancestors 'none'` / `DENY`・重複 0・順序非依存を実測 |
| パスの列挙 | `_headers`・`check-headers.mjs`・テストが同じ 6 パスを別々に保持 | `check-headers.mjs` はハードコード 0（dist 導出）。版の一覧は `scripts/lib/editions.mjs` が唯一の定義で、CI とテストもそこから導出（`npm run check:editions`） |
| 配下の `_headers` | 4 コピー出力（3 つは解釈されない） | ビルド時に削除し、配信物は `dist/_headers` の 1 コピーのみ |

### AI（説明専用）の担保（V2 / V3 / V7）

- 入れ子リスト・字下げした散文・命令語で始まる説明の箇条書きが「コード」と誤認されて切られていたのを解消（日本語を含む行は説明文、インデント量は判定材料にしない）。実測: 4 スペースの入れ子リスト 40 行 → 通過、コードは 12 行まで通過・13 行目から案内文。
- **診断未記載**: 二重の上限が同時に効くと案内文が 2 回並んでいたのを 1 回に。
- テストが実装より弱かった点（V3）を、実際に切れる入力（12 / 13 行の境界、40 行のリスト、案内文の回数）で固定し直した。CHANGELOG の記述も実測に合わせた。
- 返答の描画が `<ol>`・引用・フェンス・バックスラッシュエスケープ・空文字に対応（V7）。HTML 文字列は組み立てない（`dangerouslySetInnerHTML` 不使用、`<script>` の文字列化をテストで固定）。

### `postMessage` の `'*'`（V11・方針決定）

- 実行 iframe は `sandbox="allow-scripts"` の**不透明オリジン**なので、`targetOrigin` に具体的なオリジンは指定できない（`'null'` も一致しない）。**`'*'` は仕様上の要請**であり、変更ではなく「何が出て行きうるか」を絞る方針を採った。
- `src/app/components/runnerBridge.ts` に集約し、送信先は自前 iframe の `contentWindow` のみ、payload は許可キーだけを明示的に組み立てる（スプレッド禁止）。余計なキーが落ちることをテストで固定。`sandbox` 属性も定数化して固定した。

### CSS（V8）

- 未定義変数（`--code-bg` / `--ink` / `--warn-soft`）を廃止し、ライト・ダーク両方で定義（コントラスト 13.78 / 6.99 / 11.0 / 10.22）。
- **診断未記載**: `:root` と `html[data-theme="dark"]` の重複ブロック（後のブロックが 18 個を黙って上書き、`--editor-bg` は同一ブロック内で二重）を 1 か所に統合。統合前後の実効値が完全一致することを機械的に比較して確認した。
- `npm run check:cssvars` を新設（未定義の `var()`・テーマセレクタの重複定義・同一ブロック内の重複を静的に検査、ビルド不要・CI 実行）。

### アクセシビリティ（V9）

- `LearnGuide` の effect 依存から `onClose` を外し、マウント時 1 回だけに固定（`inert` の付け直しとフォーカス復帰が再レンダーのたびに走らない）。

### 検証・文書（V12 / V13）

- 版番号と UI 走査ファイル数と CI の成果物パスを、テスト・設定に**書き写すのをやめた**（それぞれ `package.json`、実ディレクトリ、`scripts/lib/editions.mjs` から導出）。
- 文書が引用する `npm run …` の実在をテストで検査。
- CI に `check:cssvars`・`check:editions` と **dev 依存込みの `npm audit`** を追加。

### 持ち越し

- **V10**: 往復変換での警告コメント消失と `any` ⇄ `str` の型揺れは、変換エンジン不変の方針により未着手（意図的な持ち越し）。

---

## 11. v1.1.0 で直したもの（総合診断 v1.0.17 対応）

診断 N1〜N22・S11 のうち、**セキュリティ／プライバシーに関わるもの**は次の 3 点です。変換エンジン（`src/core/lang`・`src/core/sb3`）のロジックには触れていません。

| 項目 | v1.0.17 | v1.0.18 |
|---|---|---|
| 端末に残る下書き（S11） | インデックス DB に**無期限・平文**で残り、消す導線が無かった | 右パネル上部に「端末の下書きを削除」（`storeDraft.clearDrafts()`）。確認ダイアログのうえ、コード・読み込んだ画像・音の全下書きを削除する。**画面のコードは消さない**（誤操作で作業を失わないため） |
| サンプル読み込み（N1） | 編集内容が**確認も取り消しもなく**消えた | 置き換え前の確認＋1 段の「元に戻す」。作業を失う操作を減らす |
| `.sb3` ドロップ（N3） | 50 MB 超で**未処理の Promise 拒否**（画面・ログとも無反応） | `assertSb3Size` を通し、例外は理由付きでログに出す。ファイル名は `textContent` として扱い、HTML 文字列は組み立てない |

**外部送信は増えていません。** 追加したのは端末内の保存の削除と UI の操作だけです。AI は従来どおり説明専用で、送信内容（同意のうえコード先頭 12,000 文字・会話・診断・言語仕様）も変えていません。CSP・`X-Frame-Options`・runner の sandbox ヘッダも変更なし（`npm run check:headers` で再確認済み）。

### アクセシビリティ（WCAG 2.1.2 / 1.4.3 / 1.4.11）
- Tab キーがエディタから出られなかった（2.1.2）→ **Esc で解除**、`Ctrl/⌘+M` で切替。解除中は画面にも表示。
- 夜モードの非選択ラベルが 2.13:1（1.4.3）→ 配色別に修正し、**3 配色 × 4 版で AA 未達 0 件**。
- フォーカス輪が白背景で見えなかった（1.4.11）→ 内側＋外側の 2 重リングに変更。
- 検査タブに `role="tablist"/"tab"/"tabpanel"` と矢印キー移動、診断行を `<button>` 化（2.1.1）。

---

## 12. v1.1.0 で直したもの（総合診断 v1.0.18 / v1.0.19 対応）

新規の脆弱性は 0 件でした。今回の変更は**UI の詰め方と、破壊的操作・読み上げの扱い**です。外部送信・CSP・sandbox は変更なし。

| 項目 | v1.0.18 | v1.0.19 |
|---|---|---|
| 下書き削除（B7） | 確認 1 回で即削除（件数は不明） | **何件消えるかを出してから**確認。0 件なら何もしない。削除後に件数を読み上げ |
| 「新規」（B6） | 空でも確認が出る | 失うものが無いときは確認しない（コードが空＋読み込み直後） |
| Tab 設定（B2） | リロードで既定に戻る | 端末に保存（`sp-tab-mode`）。値は `insert` / `move` のみ |
| 読み上げ（B4） | 状態変化が伝わらない | 1 つの `role="status"` で診断件数・未反映・保存・削除を通知（保存は 30 秒に 1 回まで） |
| 検査の網（C3） | 6 配色中 3 配色のみ | **6 配色すべて**で AA を検査（failures 0） |
| 狭い画面（A1〜A3） | 320〜420 px で押せない・読めない | アイコン化と折返しの修正で可視・到達可能に（数値は CHANGELOG） |

追加した保存は `localStorage['sp-tab-mode']` の 1 キーだけで、コードや個人情報は含みません。`clearDrafts()` の対象は従来どおり IndexedDB の下書きのみです。
