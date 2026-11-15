# Cloudflare Pages への公開手順

ScratchPy Studio は**完全な静的サイト**です（サーバー側の処理なし、AI チューターは利用者のブラウザから
直接 Gemini を呼びます）。`dist/` をそのまま Cloudflare Pages に置けば動きます。

- ビルド: `npm ci --ignore-scripts && npm run build`
- 公開ディレクトリ: `dist/`
- 追加の設定: 不要（`_headers` はビルドで `dist/_headers` に 1 コピーだけ出力されます）
- Node: `.node-version`（22 系）

---

## 1. GitHub にリポジトリを作って push する

```bash
cd scratchpy-studio

git init                       # まだ git 管理していない場合だけ
git add -A
git commit -m "ScratchPy Studio v1.1.0"
git branch -M main

# GitHub 側で空のリポジトリを作ってから（README 等は追加しない）
git remote add origin https://github.com/<あなたのユーザー名>/scratchpy-studio.git
git push -u origin main

# 版タグを打って push（Cloudflare 側の「本番」と一致させやすい）
git tag -a v1.1.0 -m "ScratchPy Studio v1.1.0"
git push origin v1.1.0
```

`gh` CLI を使う場合：

```bash
gh repo create scratchpy-studio --private --source=. --remote=origin --push
git tag -a v1.1.0 -m "ScratchPy Studio v1.1.0" && git push origin v1.1.0
```

> 秘密情報は push しないでください。`.gitignore` は `.env`・`.dev.vars*`・`.wrangler/` などを除外済みです。
> API キーはアプリにも保存しません（画面のメモリーのみ）。

## 2-A. Cloudflare ダッシュボードから接続する（おすすめ）

1. Cloudflare ダッシュボード → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. リポジトリ `scratchpy-studio` を選択
3. ビルド設定:

| 項目 | 値 |
|---|---|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | （空欄） |
| 環境変数 | `NODE_VERSION` = `22.20.0` |

4. **Save and Deploy**。初回ビルドは 1〜2 分。
5. `https://<project>.pages.dev` が公開 URL になります。
   push のたびに自動ビルドされ、`main` 以外のブランチはプレビュー URL になります。

## 2-B. 手元 / CI から wrangler で上げる

```bash
npx wrangler login                 # ブラウザで Cloudflare にログイン
npx wrangler pages project create scratchpy-studio --production-branch main   # 初回だけ
npm run deploy                     # = build → wrangler pages deploy dist
npm run deploy:preview             # プレビュー用（--branch preview）
```

トークンで動かす場合（CI と同じ）：

```bash
export CLOUDFLARE_API_TOKEN=...        # 「Cloudflare Pages:Edit」権限
export CLOUDFLARE_ACCOUNT_ID=...
npm run deploy
```

## 3. 配信されたものを検査する

```bash
npm run check:deploy -- https://<project>.pages.dev
```

4 版 × 2 形式（`/x/` と `/x/index.html`）の 200、**実際のレスポンスの CSP / `X-Frame-Options`**、
runner の向き（`frame-ancestors 'self'`）、未知パスの 404、各版の HTML がバンドルを参照していること
——32 項目を確認します。`DEPLOY CHECK PASSED` が出れば公開して大丈夫です。

`_headers` を書き換えたときは、この検査を必ず再実行してください。Cloudflare は
**同じ名前のヘッダをカンマで連結**するため、規則を増やすと「意図しない CSP が AND 評価される」ことがあります。

## 4. GitHub Actions から自動配信する

`.github/workflows/deploy-pages.yml` が入っています。`main` への push と `v*` タグで
「テスト → ビルド → `wrangler pages deploy` → 配信物の検査」まで走ります。

リポジトリの **Settings → Secrets and variables → Actions** に以下を登録してください。

| 種別 | 名前 | 値 |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | 「Cloudflare Pages:Edit」権限のトークン |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID |
| Variable（任意） | `CF_PAGES_PROJECT` | プロジェクト名（既定 `scratchpy-studio`） |

> 2-A（Git 連携）と 2-B（wrangler）を**同じプロジェクトで併用すると、片方の設定が上書きされます**。
> どちらか一方に決めてください。Actions を使う場合はダッシュボード側の Git 連携を切っておきます。

## 5. 独自ドメイン

1. Pages プロジェクト → **Custom domains** → **Set up a custom domain**
2. Cloudflare で管理しているドメインなら CNAME が自動で作られます（例: `studio.example.com`）
3. 反映後にもう一度 `npm run check:deploy -- https://studio.example.com` を実行

## 6. 公開前チェックリスト

```bash
npm ci --ignore-scripts
npx tsc --noEmit
npm test                      # 452 件
npm run check                 # editions / headers / cssvars / tests
npm run build                 # 4 版を dist/ に
npm run smoke                 # 実ブラウザで 4 版が動くか
npm run check:contrast        # 6 配色 × 4 版
npm run check:colours
npm run check:theme
npm audit --omit=dev
```

- [ ] 4 版（`/`・`/en/`・`/education/`・`/education/en/`）が開く
- [ ] サンプルを読み込み → 実行 → `.sb3` をダウンロード → Scratch で開ける
- [ ] 共有端末で「下書きを削除」が効く（確認に件数が出る）
- [ ] 独自ドメインでも `check:deploy` が PASS
- [ ] AI チューターは**利用者がキーを入れたときだけ**動く（未設定なら説明とキー入力欄のみ）

## 7. ロールバック

- ダッシュボード: Pages → 対象プロジェクト → **Deployments** → 戻したい配信の「…」→ **Rollback**
- wrangler: 直前の配信を再デプロイ（`npx wrangler pages deployment list` で ID を確認）
- 版を戻す場合: `git revert` して push（CI が自動で再配信します）
