/** `dist/` を `_headers` 付きで配る検証用サーバ。 */
import type { Server } from 'node:http';
export function resolveFile(root: string, urlPath: string): string | null;
export function createPagesServer(
  root: string,
  options?: { headersFile?: string },
): { server: Server; listen: (port?: number, host?: string) => Promise<number>; close: () => Promise<void> };
