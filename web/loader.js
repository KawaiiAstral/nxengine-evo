// loader.js - simple loader that:
// 1) If engine script present (engine.js), load it as Module
// 2) Allow drag & drop of files to put into Emscripten FS
// Note: build step copies generated js-> engine.js and wasm-> engine.wasm

const status = (t) => { document.getElementById('status').innerText = t; };

async function init() {
  status("初期化中…");
  // If engine.js exists, load it.
  const scriptExists = await fetch('engine.js', { method: 'HEAD' }).then(r => r.ok).catch(() => false);
  if (!scriptExists) {
    status("ビルド済みの engine.js が見つかりません。GitHub Actions のビルドを確認してください。");
    return;
  }

  // Prepare drop handlers
  const dropzone = document.getElementById('dropzone');
  dropzone.addEventListener('dragover', (e)=>{ e.preventDefault(); dropzone.style.opacity = 0.8; });
  dropzone.addEventListener('dragleave', (e)=>{ dropzone.style.opacity = 1; });
  dropzone.addEventListener('drop', (e)=> {
    e.preventDefault();
    dropzone.style.opacity = 1;
    handleFiles(e.dataTransfer.files);
  });

  document.getElementById('fileinput').addEventListener('change', (e)=> {
    handleFiles(e.target.files);
  });

  // Load engine script which should register Module object when executed.
  // We create a Module wrapper so the engine can use canvas and functions.
  window.Module = {
    canvas: (function() {
      const c = document.getElementById('canvas');
      return c;
    })(),
    preRun: [],
    postRun: [],
    print: (text) => console.log(text),
    printErr: (text) => console.error(text),
    onRuntimeInitialized: function() {
      status("エンジン起動済み。ゲームデータをドロップしてください。");
    }
  };

  // Load the generated engine JS (renamed to engine.js in build)
  const s = document.createElement('script');
  s.src = 'engine.js';
  s.onload = () => { console.log('engine.js loaded'); };
  s.onerror = () => { status('engine.js 読み込み失敗'); };
  document.body.appendChild(s);
}

function handleFiles(fileList) {
  status("ファイル読み込み中…");
  const files = Array.from(fileList);

  // For each file, write into the Emscripten FS root (if available)
  if (!window.FS) {
    status("Emscripten FS がまだ初期化されてません。エンジンが起動してから再度読み込んでください。");
    console.warn("FS not ready yet.");
    return;
  }

  // user may drop zip. We simply place files under /user_data/
  const base = '/user_data';
  try {
    if (!FS.analyzePath(base).exists) {
      FS.mkdir(base);
    }
  } catch(e) { /* ignore */ }

  let count = 0;
  const writePromises = files.map(f => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(ev) {
      const data = new Uint8Array(ev.target.result);
      const path = base + '/' + f.name;
      try {
        // remove if exists
        try { FS.unlink(path); } catch(err){}
        FS.createDataFile('/', 'user_data/'+f.name, data, true, true);
        count++;
        resolve();
      } catch(err) { console.error(err); reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(f);
  }));

  Promise.all(writePromises).then(() => {
    status(`ファイルを ${count} 個 /user_data に配置しました。ゲーム側で読み込んでください。`);
  }).catch((e)=> {
    status('ファイル配置中にエラーが発生しました。コンソール参照');
    console.error(e);
  });
}

// Start
window.addEventListener('load', init);
