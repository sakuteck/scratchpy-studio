import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { IconLogo, IconInbox } from './Icons';
import { t } from '../i18n';

export interface EditorHandle {
  jumpTo(line: number): void;
}

interface Props {
  value: string;
  onChange(v: string): void;
  onCursor(pos: { line: number; col: number }): void;
  dragging: boolean;
}

const LINE_H = 20;

const Editor = forwardRef<EditorHandle, Props>(function Editor({ value, onChange, onCursor, dragging }, ref) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const lnRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => value.split('\n'), [value]);

  const updateCursor = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const before = value.slice(0, pos);
    const line = before.split('\n').length;
    const col = pos - (before.lastIndexOf('\n') + 1) + 1;
    onCursor({ line, col });
    if (lnRef.current) {
      lnRef.current.querySelectorAll('.current').forEach(el => el.classList.remove('current'));
      const el = lnRef.current.children[line - 1] as HTMLElement | undefined;
      el?.classList.add('current');
    }
  }, [value, onCursor]);

  useImperativeHandle(ref, () => ({
    jumpTo(line: number) {
      const ta = taRef.current;
      if (!ta) return;
      const ls = ta.value.split('\n');
      const idx = ls.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
      ta.focus();
      ta.setSelectionRange(idx, idx + (ls[line - 1]?.length ?? 0));
      ta.scrollTop = Math.max(0, (line - 4) * LINE_H);
      if (lnRef.current) lnRef.current.scrollTop = ta.scrollTop;
      updateCursor();
    },
  }), [updateCursor]);

  /**
   * Tab を押したときの挙動（v1.0.18・診断 N4）。
   * 既定は「4 スペース挿入」だが、それだけだとキーボードだけで編集欄から出られず
   * WCAG 2.1.2（キーボード・トラップ）に反する。Esc で 1 回だけ解除、
   * Ctrl/⌘+M で切り替えられるようにし、状態を画面にも出す。
   */
  // 選択は端末に覚えておく（診断 v1.0.18 の B2）。毎回 Esc を押させない。
  const TAB_MODE_KEY = 'sp-tab-mode';
  const [tabInserts, setTabInserts] = useState(() => {
    try {
      return localStorage.getItem(TAB_MODE_KEY) !== 'move';
    } catch {
      return true;
    }
  });
  const setTabMode = (inserts: boolean) => {
    setTabInserts(inserts);
    try { localStorage.setItem(TAB_MODE_KEY, inserts ? 'insert' : 'move'); } catch { /* 保存できなくても動作は変えない */ }
  };

  /**
   * Ctrl/⌘+M は**画面のどこでも**効く（診断 v1.0.18 の B1）。
   * 以前はエディタにフォーカスがあるときだけだったため、案内文と挙動が食い違っていた。
   */
  useEffect(() => {
    const onWindowKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== 'm') return;
      e.preventDefault();
      setTabInserts(v => {
        const next = !v;
        try { localStorage.setItem(TAB_MODE_KEY, next ? 'insert' : 'move'); } catch { /* 同上 */ }
        return next;
      });
    };
    window.addEventListener('keydown', onWindowKey);
    return () => window.removeEventListener('keydown', onWindowKey);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      setTabMode(!tabInserts);
      return;
    }
    if (e.key === 'Escape' && tabInserts) {
      // 次の Tab は「移動」として通す（インデントは解除後に Ctrl+M で戻せる）。
      setTabMode(false);
      return;
    }
    if (e.key !== 'Tab' || !tabInserts) return;
    e.preventDefault();
    const s = ta.selectionStart;
    const en = ta.selectionEnd;
    if (e.shiftKey) {
      // 行頭の空白を最大 4 つ削除する
      const before = ta.value.slice(0, s);
      const lineStart = before.lastIndexOf('\n') + 1;
      const indent = ta.value.slice(lineStart, lineStart + 4);
      const m = /^( {1,4})/.exec(indent);
      if (m && /^\s*$/.test(ta.value.slice(lineStart, s))) {
        const next = ta.value.slice(0, lineStart) + ta.value.slice(lineStart + m[1].length);
        onChange(next);
        requestAnimationFrame(() => ta.setSelectionRange(s - m[1].length, en - m[1].length));
      }
    } else {
      const next = ta.value.slice(0, s) + '    ' + ta.value.slice(en);
      onChange(next);
      requestAnimationFrame(() => ta.setSelectionRange(s + 4, s + 4));
    }
  };

  const onScroll = () => {
    if (taRef.current && lnRef.current) {
      lnRef.current.scrollTop = taRef.current.scrollTop;
    }
  };

  return (
    <div className="editor-wrap">
      <div className="line-numbers" ref={lnRef}>
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={taRef}
        aria-label={t('ScratchPy コード', 'ScratchPy code')}
        aria-describedby="editor-keyboard-hint"
        className="code"
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={onScroll}
        onKeyUp={updateCursor}
        onClick={updateCursor}
        onSelect={updateCursor}
        placeholder=""
      />
      {value === '' && (
        <div className="editor-empty-hint">
          <div className="big"><IconLogo size={44} /></div>
          {t('ここに ScratchPy コードを書くか、', 'Write ScratchPy code here, or')}<br />
          {t('.sb3 ファイルをドラッグ&ドロップしてください', 'drag and drop an .sb3 file.')}
        </div>
      )}
      {dragging && (
        <div className="drop-overlay"><IconInbox size={20} /> {t('ドロップして .sb3 を読み込む', 'Drop to open the .sb3 file')}</div>
      )}
      {/* 読み上げ用の説明は常に出す（aria-describedby）。見える案内は Tab 移動中だけ。 */}
      <p id="editor-keyboard-hint" className="sr-only">
        {t('Tab はインデント。Esc で編集欄から出られます。', 'Tab indents. Press Escape to leave the editor.')}
      </p>
      {!tabInserts && (
        <div className="editor-tab-mode" role="status" title={t('Ctrl/⌘+M は画面のどこでも効きます（設定はこの端末に保存されます）。', 'Ctrl/⌘+M works anywhere in the app (remembered on this device).')}>
          {t('Tab 移動モード（Ctrl+M でインデントに戻る）', 'Tab moves focus (Ctrl+M to indent again)')}
        </div>
      )}
    </div>
  );
});

export default Editor;
