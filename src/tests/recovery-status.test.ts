import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StatusBar from '../app/components/StatusBar';
import { emptyAssetStore } from '../core/api';

const render = (assetsUnavailable: boolean, errors: number, warnings: number) => renderToStaticMarkup(createElement(StatusBar, {
 analysis:null, cursor:{line:1,col:1}, fileName:'', assetStore:emptyAssetStore(), errors, warnings, assetsUnavailable,
}));
describe('recovery status display', () => {
 it('shows missing assets, not a green all-clear', () => {
  const html=render(true,0,0);expect(html).toContain('アセット未復元');expect(html).toContain('dot warn');expect(html).not.toContain('問題なし');
 });
 it('keeps the error or warning count visible alongside missing assets', () => {
  expect(render(true,2,0)).toContain('2 件のエラー');expect(render(true,2,0)).toContain('アセット未復元');expect(render(true,2,0)).toContain('dot err');
  expect(render(true,0,3)).toContain('3 件の警告');expect(render(true,0,3)).toContain('アセット未復元');
 });
 it('leaves the normal all-clear unchanged', () => {
  const html=render(false,0,0);expect(html).toContain('問題なし');expect(html).toContain('dot ok');expect(html).not.toContain('アセット未復元');
 });
});
