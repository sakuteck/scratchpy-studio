/* ScratchPy Studio — 初回描画の前に配色を決める小さなスクリプト。
 * src/app/theme.ts の COLOR_MODES と同じ対応表を持ち、localStorage の選択を
 * 最初のペイント前に html 属性へ反映する（夜モードで白く光るのを防ぐ）。
 * CSP は script-src 'self' のまま（インラインではなく同一オリジンの外部ファイル）。
 * Education 版は配色固定なので何もしない。 */
(function () {
  try {
    if (location.pathname.indexOf('/education') === 0) return;
    var modes = {
      standard: ['light', 'standard'],
      scratch: ['light', 'scratch'],
      pastel: ['light', 'pastel'],
      contrast: ['light', 'contrast'],
      night: ['dark', 'scratch'],
      'night-contrast': ['dark', 'contrast'],
    };
    var id = null;
    try { id = localStorage.getItem('sp-color-mode'); } catch (e) { id = null; }
    if (!id) {
      var legacy = null;
      try { legacy = localStorage.getItem('sp-theme'); } catch (e) { legacy = null; }
      id = legacy === 'dark' ? 'night' : 'scratch';
    }
    var mode = modes[id] || modes.scratch;
    var root = document.documentElement;
    root.setAttribute('data-theme', mode[0]);
    root.setAttribute('data-palette', mode[1]);
    root.style.colorScheme = mode[0];
  } catch (e) { /* 何もしない（既定の明るい配色で描画する） */ }
})();
