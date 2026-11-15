/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 統合ビルドのときだけ、ルートの共有エンジンを指す絶対 URL（/engine/scaffolding.js）。 */
  readonly VITE_ENGINE_URL?: string;
}

declare const __APP_VERSION__: string;
/// <reference types="vite/client" />
