// ==========================================
// drawing-manager.js
// Phase8 Step1: 図面管理 - 一覧画面・登録機能
// 現場Pro 設備くん v12追加
// ==========================================
// 図面（PDF/画像）をIndexedDBに保存し、
// 一覧表示・登録・削除を行うモジュール。
// 依存: idb-storage.js（getDB, generateId, getAllGenba）
// ==========================================

// STORE_DRAWING, STORE_DRAWING_PIN は idb-storage.js で const 定義済み
var dwObjectUrls = [];
var dwGenbaCache = {};
var dwSelectedFile = null;

// === 図面（drawing）CRUD ===

async function saveDrawing(record, _retry) {
  if (!record.id) record.id = generateId();
  var now = new Date().toISOString();
  if (!record.createdAt) record.createdAt = now;
  record.updatedAt = now;
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_DRAWING, 'readwrite');
      tx.objectStore(STORE_DRAWING).put(record);
      tx.oncomplete = function() { resolve(record); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] saveDrawing失敗:', e);
    if (!_retry) { _dbPromise = null; return saveDrawing(record, true); }
    return null;
  }
}

async function getDrawing(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_DRAWING, 'readonly');
      var req = tx.objectStore(STORE_DRAWING).get(id);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getDrawing失敗:', e);
    if (!_retry) { _dbPromise = null; return getDrawing(id, true); }
    return null;
  }
}

async function getAllDrawings(_retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_DRAWING, 'readonly');
      var req = tx.objectStore(STORE_DRAWING).getAll();
      req.onsuccess = function() {
        var r = req.result || [];
        r.sort(function(a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
        resolve(r);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getAllDrawings失敗:', e);
    if (!_retry) { _dbPromise = null; return getAllDrawings(true); }
    return [];
  }
}

async function getDrawingsByGenba(genbaId, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_DRAWING, 'readonly');
      var req = tx.objectStore(STORE_DRAWING).index('genbaId').getAll(genbaId);
      req.onsuccess = function() {
        var r = req.result || [];
        r.sort(function(a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
        resolve(r);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getDrawingsByGenba失敗:', e);
    if (!_retry) { _dbPromise = null; return getDrawingsByGenba(genbaId, true); }
    return [];
  }
}

async function deleteDrawing(id, _retry) {
  try {
    var pins = await getDrawingPinsByDrawing(id);
    for (var i = 0; i < pins.length; i++) await deleteDrawingPin(pins[i].id);
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_DRAWING, 'readwrite');
      tx.objectStore(STORE_DRAWING).delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] deleteDrawing失敗:', e);
    if (!_retry) { _dbPromise = null; return deleteDrawing(id, true); }
  }
}

// === 図面ピン（drawingPin）CRUD ===

async function saveDrawingPin(record, _retry) {
  if (!record.id) record.id = generateId();
  var now = new Date().toISOString();
  if (!record.createdAt) record.createdAt = now;
  record.updatedAt = now;
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_DRAWING_PIN, 'readwrite');
      tx.objectStore(STORE_DRAWING_PIN).put(record);
      tx.oncomplete = function() { resolve(record); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] saveDrawingPin失敗:', e);
    if (!_retry) { _dbPromise = null; return saveDrawingPin(record, true); }
    return null;
  }
}

async function getDrawingPinsByDrawing(drawingId, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_DRAWING_PIN, 'readonly');
      var req = tx.objectStore(STORE_DRAWING_PIN).index('drawingId').getAll(drawingId);
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getDrawingPinsByDrawing失敗:', e);
    if (!_retry) { _dbPromise = null; return getDrawingPinsByDrawing(drawingId, true); }
    return [];
  }
}

async function deleteDrawingPin(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_DRAWING_PIN, 'readwrite');
      tx.objectStore(STORE_DRAWING_PIN).delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] deleteDrawingPin失敗:', e);
    if (!_retry) { _dbPromise = null; return deleteDrawingPin(id, true); }
  }
}

// === 図面一覧画面 ===

async function initDrawingScreen() {
  console.log('[DrawingManager] 初期化開始');
  // イベントを最初にバインド（非同期処理の失敗に関わらず操作可能にする）
  dwSetupEvents();
  dwObjectUrls.forEach(function(u) { URL.revokeObjectURL(u); });
  dwObjectUrls = [];
  try {
    var list = await getAllGenba();
    dwGenbaCache = {};
    list.forEach(function(g) { dwGenbaCache[g.id] = g; });
    await dwLoadGenbaFilter();
    await dwRenderList();
  } catch (e) {
    console.error('[DrawingManager] 初期化中にエラー:', e);
  }
  console.log('[DrawingManager] 初期化完了');
}

async function dwLoadGenbaFilter() {
  var sel = document.getElementById('dwGenbaFilter');
  if (!sel) return;
  var list = await getAllGenba();
  sel.innerHTML = '<option value="">すべての現場</option>';
  list.forEach(function(g) {
    var o = document.createElement('option');
    o.value = g.id; o.textContent = g.name || '(名称なし)';
    sel.appendChild(o);
  });
}

function dwSetupEvents() {
  var f = document.getElementById('dwGenbaFilter');
  if (f) f.onchange = function() { dwRenderList(); };
  var a = document.getElementById('dwAddBtn');
  if (a) a.onclick = dwOpenRegisterModal;
  var rc = document.getElementById('dwRegCloseBtn');
  if (rc) rc.onclick = dwCloseRegisterModal;
  var cc = document.getElementById('dwRegCancelBtn');
  if (cc) cc.onclick = dwCloseRegisterModal;
  var fi = document.getElementById('dwFileInput');
  if (fi) fi.onchange = dwHandleFileSelect;
  var rb = document.getElementById('dwRegisterBtn');
  if (rb) rb.onclick = dwRegisterDrawing;
}

// === 図面一覧描画 ===

async function dwRenderList() {
  var container = document.getElementById('dwListContainer');
  if (!container) return;
  // ローディング表示
  container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#9ca3af;">' +
    '<div style="font-size:14px;">読み込み中...</div></div>';
  var filterSel = document.getElementById('dwGenbaFilter');
  var fid = filterSel ? filterSel.value : '';
  var drawings;
  try {
    drawings = fid ? await getDrawingsByGenba(fid) : await getAllDrawings();
  } catch (e) {
    console.error('[DrawingManager] データ取得失敗:', e);
    drawings = [];
  }

  if (drawings.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:40px 20px; color:#9ca3af;">' +
      '<div style="font-size:48px; margin-bottom:12px;">📐</div>' +
      '<div style="font-size:14px;">図面がまだありません</div>' +
      '<div style="font-size:12px; margin-top:4px;">「＋ 図面を追加」から登録してください</div></div>';
    return;
  }
  var pinCounts = {};
  for (var i = 0; i < drawings.length; i++) {
    var pins = await getDrawingPinsByDrawing(drawings[i].id);
    pinCounts[drawings[i].id] = pins.length;
  }
  var html = '';
  drawings.forEach(function(d) {
    var gn = dwGenbaCache[d.genbaId] ? dwGenbaCache[d.genbaId].name : '(未設定)';
    var pc = pinCounts[d.id] || 0;
    var ti = d.fileType === 'pdf' ? '📄' : '🖼️';
    var ds = d.createdAt ? new Date(d.createdAt).toLocaleDateString('ja-JP') : '';
    var th = '';
    if (d.thumbnailBlob) {
      var tu = URL.createObjectURL(d.thumbnailBlob);
      dwObjectUrls.push(tu);
      th = '<img src="' + tu + '" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">';
    } else {
      th = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#f3f4f6;border-radius:8px;font-size:36px;">' + ti + '</div>';
    }
    html += '<div style="background:white;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);margin-bottom:12px;">' +
      '<div style="display:flex;gap:12px;padding:12px;">' +
      '<div style="width:80px;height:80px;flex-shrink:0;">' + th + '</div>' +
      '<div style="flex:1;min-width:0;">' +
      '<div style="font-size:14px;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + ti + ' ' + dwEsc(d.fileName) + '</div>' +
      '<div style="font-size:12px;color:#6b7280;margin-top:4px;">🏗️ ' + dwEsc(gn) + '</div>' +
      '<div style="font-size:11px;color:#9ca3af;margin-top:2px;">📌 ピン: ' + pc + '件 ｜ ' + ds + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:8px;">' +
      '<button onclick="dwOpenDrawing(\'' + d.id + '\')" style="flex:1;padding:6px 0;font-size:12px;font-weight:bold;background:#3b82f6;color:white;border:none;border-radius:8px;cursor:pointer;">開く</button>' +
      '<button onclick="dwDeleteDrawing(\'' + d.id + '\')" style="padding:6px 12px;font-size:12px;background:#fee2e2;color:#dc2626;border:none;border-radius:8px;cursor:pointer;">削除</button>' +
      '</div></div></div></div>';
  });
  container.innerHTML = html;
}

function dwEsc(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// === 登録モーダル ===

function dwOpenRegisterModal() {
  console.log('[DrawingManager] モーダルを開きます');
  var modal = document.getElementById('dwRegisterModal');
  if (!modal) { console.error('[DrawingManager] dwRegisterModal が見つかりません'); return; }
  dwSelectedFile = null;
  var fi = document.getElementById('dwFileInput');
  if (fi) fi.value = '';
  // ファイル選択エリアをリセット
  var fa = document.getElementById('dwFileArea');
  if (fa) {
    fa.innerHTML = '<div style="font-size:40px; margin-bottom:8px;">📄</div>' +
      '<div style="color:#6366f1; font-weight:bold;">タップしてファイルを選択</div>' +
      '<div style="color:#999; font-size:12px; margin-top:4px;">PDF / JPG / PNG（PDF:最大20MB / 画像:最大10MB）</div>';
  }
  var preview = document.getElementById('dwFilePreview');
  if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
  var regBtn = document.getElementById('dwRegisterBtn');
  if (regBtn) { regBtn.disabled = true; regBtn.style.opacity = '0.5'; }
  dwLoadGenbaSelect();
  modal.style.display = 'block';
  console.log('[DrawingManager] モーダル表示完了');
}

function dwCloseRegisterModal() {
  var modal = document.getElementById('dwRegisterModal');
  if (modal) modal.style.display = 'none';
  dwSelectedFile = null;
}

async function dwLoadGenbaSelect(selectId) {
  var sel = document.getElementById('dwRegGenba');
  if (!sel) return;
  var list = await getAllGenba();
  sel.innerHTML = '<option value="">-- 現場を選択 --</option>' +
    '<option value="__new__">＋ 新しい現場を登録</option>';
  list.forEach(function(g) {
    var o = document.createElement('option');
    o.value = g.id; o.textContent = g.name || '(名称なし)';
    sel.appendChild(o);
  });
  if (selectId) sel.value = selectId;
  sel.onchange = function() {
    if (sel.value === '__new__') dwCreateGenbaFromSelect();
  };
}

async function dwCreateGenbaFromSelect() {
  var name = prompt('新しい現場名を入力してください');
  if (!name || !name.trim()) {
    var sel = document.getElementById('dwRegGenba');
    if (sel) sel.value = '';
    return;
  }
  try {
    var genba = { id: generateId(), name: name.trim(), status: '進行中' };
    var result = await saveGenba(genba);
    if (result) {
      await dwLoadGenbaSelect(result.id);
      if (typeof showToast === 'function') showToast('現場「' + name.trim() + '」を登録しました');
    } else {
      alert('現場の登録に失敗しました。');
      var sel = document.getElementById('dwRegGenba');
      if (sel) sel.value = '';
    }
  } catch (e) {
    console.error('[DrawingManager] 現場登録失敗:', e);
    alert('現場の登録に失敗しました。');
    var sel = document.getElementById('dwRegGenba');
    if (sel) sel.value = '';
  }
}

// === ファイル選択 ===

function dwHandleFileSelect(e) {
  var file = e.target.files && e.target.files[0];
  if (!file) return;
  var isPdf = file.type === 'application/pdf';
  var maxSize = isPdf ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize) {
    alert('ファイルサイズが大きすぎます。\n' + (isPdf ? 'PDF: 最大20MB' : '画像: 最大10MB'));
    e.target.value = ''; return;
  }
  if (['application/pdf','image/jpeg','image/png'].indexOf(file.type) === -1) {
    alert('対応していないファイル形式です。\nPDF / JPG / PNG のみ対応しています。');
    e.target.value = ''; return;
  }
  dwSelectedFile = file;
  var mb = (file.size / 1024 / 1024).toFixed(1);
  var icon = isPdf ? '📄' : '🖼️';
  // ファイルエリア更新
  var fa = document.getElementById('dwFileArea');
  if (fa) {
    fa.innerHTML = '<div style="font-size:40px; margin-bottom:8px;">' + icon + '</div>' +
      '<div style="color:#6366f1; font-weight:bold;">' + dwEsc(file.name) + '</div>' +
      '<div style="color:#999; font-size:12px; margin-top:4px;">' + (isPdf ? 'PDF' : '画像') + ' / ' + mb + 'MB ｜ タップで変更</div>';
  }
  // 画像プレビュー
  var preview = document.getElementById('dwFilePreview');
  if (preview) {
    if (!isPdf) {
      var url = URL.createObjectURL(file);
      dwObjectUrls.push(url);
      preview.innerHTML = '<img src="' + url + '" style="max-width:100%;max-height:150px;border-radius:8px;">';
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }
  }
  var regBtn = document.getElementById('dwRegisterBtn');
  if (regBtn) { regBtn.disabled = false; regBtn.style.opacity = '1'; }
  console.log('[DrawingManager] ファイル選択:', file.name, mb + 'MB');
}

// === 図面登録実行 ===

async function dwRegisterDrawing() {
  if (!dwSelectedFile) { alert('ファイルを選択してください。'); return; }
  var genbaId = document.getElementById('dwRegGenba').value;
  if (!genbaId) { alert('現場を選択してください。'); return; }
  var btn = document.getElementById('dwRegisterBtn');
  btn.disabled = true; btn.textContent = '登録中...';
  try {
    var isPdf = dwSelectedFile.type === 'application/pdf';
    var thumbnailBlob = null;
    try {
      thumbnailBlob = isPdf ? await dwGeneratePdfThumbnail(dwSelectedFile) : await dwGenerateImageThumbnail(dwSelectedFile);
    } catch (te) { console.warn('[DrawingManager] サムネイル生成失敗:', te); }
    var saved = await saveDrawing({
      genbaId: genbaId, fileName: dwSelectedFile.name,
      fileType: isPdf ? 'pdf' : 'image', fileBlob: dwSelectedFile, thumbnailBlob: thumbnailBlob
    });
    if (!saved) throw new Error('保存失敗');
    console.log('[DrawingManager] 図面登録成功:', saved.id);
    dwCloseRegisterModal();
    var gl = await getAllGenba();
    dwGenbaCache = {};
    gl.forEach(function(g) { dwGenbaCache[g.id] = g; });
    await dwRenderList();
    if (typeof showToast === 'function') showToast('図面を登録しました');
  } catch (err) {
    console.error('[DrawingManager] 登録失敗:', err);
    alert('図面の登録に失敗しました。\n' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = '登録';
  }
}

// === サムネイル生成: PDF（1ページ目） ===

function dwGeneratePdfThumbnail(pdfBlob) {
  return new Promise(function(resolve, reject) {
    if (typeof pdfjsLib === 'undefined') {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = function() {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        dwRenderPdfPage(pdfBlob).then(resolve).catch(reject);
      };
      s.onerror = function() { reject(new Error('pdf.js読込失敗')); };
      document.head.appendChild(s);
    } else {
      dwRenderPdfPage(pdfBlob).then(resolve).catch(reject);
    }
  });
}

async function dwRenderPdfPage(pdfBlob) {
  var buf = await pdfBlob.arrayBuffer();
  var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  var page = await pdf.getPage(1);
  var vp = page.getViewport({ scale: 0.5 });
  var sc = Math.min(200 / vp.width, 1);
  vp = page.getViewport({ scale: 0.5 * sc });
  var c = document.createElement('canvas');
  c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return new Promise(function(resolve) {
    c.toBlob(function(b) { resolve(b); }, 'image/jpeg', 0.7);
  });
}

// === サムネイル生成: 画像（リサイズ） ===

function dwGenerateImageThumbnail(imgBlob) {
  return new Promise(function(resolve, reject) {
    var url = URL.createObjectURL(imgBlob);
    var img = new Image();
    img.onload = function() {
      URL.revokeObjectURL(url);
      var w = img.width, h = img.height;
      if (w > 200) { h = h * 200 / w; w = 200; }
      if (h > 200) { w = w * 200 / h; h = 200; }
      var c = document.createElement('canvas');
      c.width = Math.round(w); c.height = Math.round(h);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(function(b) { resolve(b); }, 'image/jpeg', 0.7);
    };
    img.onerror = function() { URL.revokeObjectURL(url); reject(new Error('画像読込失敗')); };
    img.src = url;
  });
}

// === 図面を開く（Step2で実装予定） ===

async function dwOpenDrawing(id) {
  if (typeof showScreen === 'function') showScreen('drawing-viewer');
  if (typeof initDrawingViewer === 'function') initDrawingViewer(id);
}

// === 図面削除 ===

async function dwDeleteDrawing(id) {
  if (!confirm('この図面を削除しますか？\n紐づくピンも全て削除されます。')) return;
  try {
    await deleteDrawing(id);
    await dwRenderList();
    if (typeof showToast === 'function') showToast('図面を削除しました');
  } catch (err) {
    console.error('[DrawingManager] 削除失敗:', err);
    alert('削除に失敗しました。');
  }
}

// === グローバル公開 ===
window.saveDrawing = saveDrawing;
window.getDrawing = getDrawing;
window.getAllDrawings = getAllDrawings;
window.getDrawingsByGenba = getDrawingsByGenba;
window.deleteDrawing = deleteDrawing;
window.saveDrawingPin = saveDrawingPin;
window.getDrawingPinsByDrawing = getDrawingPinsByDrawing;
window.deleteDrawingPin = deleteDrawingPin;
window.initDrawingScreen = initDrawingScreen;
window.dwOpenDrawing = dwOpenDrawing;
window.dwDeleteDrawing = dwDeleteDrawing;
window.dwOpenRegisterModal = dwOpenRegisterModal;
window.dwCloseRegisterModal = dwCloseRegisterModal;
window.dwRegisterDrawing = dwRegisterDrawing;
window.dwHandleFileSelect = dwHandleFileSelect;

console.log('[drawing-manager.js] Phase8 Step1 図面管理モジュール読み込み完了（v12）');
