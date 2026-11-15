/* Runs in an opaque-origin, script-only sandbox. No keys or parent DOM access. */
(() => {
  // 親ページのオリジン。sandbox で不透明オリジンになるため、referrer から推定して送受信の相手を限定する。
  const parentOrigin = (() => { try { return document.referrer ? new URL(document.referrer).origin : null; } catch { return null; } })();
  let instance = null;
  let enginePromise = null;
  let busy = false;
  function report(type, detail) { parent.postMessage({source:'scratchpy-runner',type,detail}, parentOrigin || '*'); }
  function engine(url) {
    if (enginePromise) return enginePromise;
    enginePromise = new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load the Scratch runtime.'));
      document.head.appendChild(script);
    });
    return enginePromise;
  }
  window.addEventListener('message', async event => {
    if (event.source !== parent || !event.data || event.data.source !== 'scratchpy-parent') return;
    // 推定できた場合は親のオリジンを必須にする（第三者ページからの駆動を拒否）。
    if (parentOrigin && event.origin !== parentOrigin) return;
    const {type} = event.data;
    if (type === 'stop') { if (instance) instance.stopAll(); report('stopped'); return; }
    if (type !== 'run' || busy) return;
    busy = true;
    try {
      await engine(event.data.engineUrl);
      if (!instance) {
        instance = new Scaffolding.Scaffolding();
        instance.shouldConnectPeripherals = false;
        instance.setup();
        instance.setExtensionSecurityManager({canLoadExtensionFromProject:false,canFetch:false,canOpenWindow:false,canRedirect:false,canRecordAudio:false,canRecordVideo:false,canReadClipboard:false,canNotify:false,canGeolocate:false,canEmbed:false,canDownload:false});
        instance.appendTo(document.getElementById('stage'));
      }
      instance.stopAll();
      await instance.loadProject(event.data.bytes);
      instance.relayout();
      instance.greenFlag();
      report('running');
    } catch (error) {
      report('error', String(error && error.message || error).slice(0,500));
    } finally { busy = false; }
  });
  window.addEventListener('resize', () => { if (instance) instance.relayout(); });
  report('ready');
})();
