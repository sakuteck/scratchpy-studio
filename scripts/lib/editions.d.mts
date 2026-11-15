/** 配信する版の一覧と、そこから導出する文書 URL（検証用）。 */
export interface Edition {
  name: string;
  output: string;
  base: string;
  language: 'ja' | 'en';
  education: 'true' | 'false';
}
export const EDITIONS: Edition[];
export function documentUrls(): string[];
