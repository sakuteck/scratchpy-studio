/** `_headers` を Cloudflare Pages 風に解釈する小さな実装（検証用）。 */
export interface HeaderEntry { name?: string; value?: string; detach?: string }
export interface HeaderRule { paths: string[]; entries: HeaderEntry[] }
export function parseHeaders(text: string): HeaderRule[];
export function matchesPath(pattern: string, pathname: string): boolean;
export function collectHeaders(rules: HeaderRule[], pathname: string, options?: { reverse?: boolean }): Record<string, string>;
export function duplicateHeaders(rules: HeaderRule[], pathname: string): string[];
