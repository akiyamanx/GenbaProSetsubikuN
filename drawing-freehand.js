// drawing-freehand.js - 図面手書き書き込み（v8.4.0 Phase8 Step4）
// 依存: drawing-viewer.js, drawing-manager.js, idb-storage.js

var fhIsDrawing = false;
var fhLastX = 0, fhLastY = 0;
var fhColor = '#EF4444'; // デフォルト: 赤
var fhWidth = 4;          // デフォルト: 中(4px)
var fhIsEraser = false;
var fhUndoStack = [];
var FH_MAX_UNDO = 10;
var fhSaveTimer = null;

// === Canvasオーバーレイ作成 ===
function fhCreateCanvas(container) {
  var canvas = document.getElementById('freehandCanvas');
  if (canvas) return canvas;

  // 図面要素を取得（PDF=dvCanvas, 画像=dvImage）
  var drawingEl = document.getElementById('dvCanvas');
  if (!drawingEl || drawingEl.style.display === 'none') {
    drawingEl = document.getElementById('dvImage');
  }
  if (!drawingEl) return null;

  var w = parseFloat(drawingEl.style.width) || drawingEl.width || drawingEl.naturalWidth || drawingEl.offsetWidth;
  var h = parseFloat(drawingEl.style.height) || drawingEl.height || drawingEl.naturalHeight || drawingEl.offsetHeight;
  if (w === 0 || h === 0) return null;

  canvas = document.createElement('canvas');
  canvas.id = 'freehandCanvas';

  // 高解像度ディスプレイ対応
  var dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.cssText = 'position:absolute;top:0;left:0;' +
    'width:' + w + 'px;height:' + h + 'px;' +
    'pointer-events:none;z-index:15;touch-action:none;';

  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // dvTransform内の図面要素の後に追加
  var transform = document.getElementById('dvTransform');
  if (transform) {
    transform.style.position = 'relative';
    drawingEl.insertAdjacentElement('afterend', canvas);
  }

  return canvas;
}

// === タッチ位置→Canvas内座標変換 ===
function fhGetTouchPos(canvas, touch) {
  var rect = canvas.getBoundingClientRect();
  return {
    x: (touch.clientX - rect.left) * (canvas.offsetWidth / rect.width),
    y: (touch.clientY - rect.top) * (canvas.offsetHeight / rect.height)
  };
}

// === マウス位置→Canvas内座標変換 ===
function fhGetMousePos(canvas, e) {
  var rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.offsetWidth / rect.width),
    y: (e.clientY - rect.top) * (canvas.offsetHeight / rect.height)
  };
}

// === タッチイベント設定 ===
// 1本指で描画、2本指はピンチに譲る
function fhInitEvents(canvas) {
  var ctx = canvas.getContext('2d');

  // --- タッチ ---
  canvas.addEventListener('touchstart', function(e) {
    // 2本指はピンチ→描画しない
    if (e.touches.length >= 2) { fhIsDrawing = false; return; }
    e.preventDefault();
    fhSaveUndo(canvas);
    fhIsDrawing = true;
    var pos = fhGetTouchPos(canvas, e.touches[0]);
    fhLastX = pos.x; fhLastY = pos.y;
    // タップだけでも点が残る
    fhDrawDot(ctx, pos.x, pos.y);
  }, { passive: false });

  canvas.addEventListener('touchmove', function(e) {
    // 2本指になったら描画中断→ピンチに移行
    if (e.touches.length >= 2) {
      fhIsDrawing = false;
      canvas.style.pointerEvents = 'none';
      setTimeout(function() {
        if (dvMode === 'draw') canvas.style.pointerEvents = 'auto';
      }, 500);
      return;
    }
    if (!fhIsDrawing) return;
    e.preventDefault();
    var pos = fhGetTouchPos(canvas, e.touches[0]);
    fhDrawLine(ctx, fhLastX, fhLastY, pos.x, pos.y);
    fhLastX = pos.x; fhLastY = pos.y;
  }, { passive: false });

  canvas.addEventListener('touchend', function(e) {
    if (fhIsDrawing) {
      fhIsDrawing = false;
      fhAutoSave(canvas);
    }
  });

  // ダブルタップ→テキスト入力
  var fhLastTap = 0;
  canvas.addEventListener('touchend', function(e) {
    if (e.touches.length > 0) return;
    var now = Date.now();
    if (now - fhLastTap < 300) {
      var pos = fhGetTouchPos(canvas, e.changedTouches[0]);
      fhShowTextInput(canvas, pos.x, pos.y);
      fhLastTap = 0;
    } else {
      fhLastTap = now;
    }
  });

  // --- マウス（PC対応） ---
  var fhMouseDown = false;
  canvas.addEventListener('mousedown', function(e) {
    e.preventDefault();
    fhSaveUndo(canvas);
    fhMouseDown = true;
    var pos = fhGetMousePos(canvas, e);
    fhLastX = pos.x; fhLastY = pos.y;
    fhDrawDot(ctx, pos.x, pos.y);
  });
  canvas.addEventListener('mousemove', function(e) {
    if (!fhMouseDown) return;
    var pos = fhGetMousePos(canvas, e);
    fhDrawLine(ctx, fhLastX, fhLastY, pos.x, pos.y);
    fhLastX = pos.x; fhLastY = pos.y;
  });
  canvas.addEventListener('mouseup', function() {
    if (fhMouseDown) { fhMouseDown = false; fhAutoSave(canvas); }
  });
  canvas.addEventListener('mouseleave', function() {
    if (fhMouseDown) { fhMouseDown = false; fhAutoSave(canvas); }
  });
  // PC: ダブルクリック→テキスト
  canvas.addEventListener('dblclick', function(e) {
    var pos = fhGetMousePos(canvas, e);
    fhShowTextInput(canvas, pos.x, pos.y);
  });
}

// === 描画ヘルパー ===
function fhDrawDot(ctx, x, y) {
  ctx.beginPath();
  if (fhIsEraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.arc(x, y, fhWidth * 1.5, 0, Math.PI * 2);
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = fhColor;
    ctx.arc(x, y, fhWidth / 2, 0, Math.PI * 2);
  }
  ctx.fill();
}

function fhDrawLine(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  if (fhIsEraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = fhWidth * 3;
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = fhColor;
    ctx.lineWidth = fhWidth;
  }
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

// === Undo ===
// スナップショット保存
function fhSaveUndo(canvas) {
  var ctx = canvas.getContext('2d');
  var data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  fhUndoStack.push(data);
  if (fhUndoStack.length > FH_MAX_UNDO) fhUndoStack.shift();
}

// Undo実行
function fhPerformUndo() {
  var canvas = document.getElementById('freehandCanvas');
  if (!canvas || fhUndoStack.length === 0) return;
  var ctx = canvas.getContext('2d');
  var data = fhUndoStack.pop();
  ctx.putImageData(data, 0, 0);
  fhAutoSave(canvas);
}

// 全消し
function fhClearAll() {
  var canvas = document.getElementById('freehandCanvas');
  if (!canvas) return;
  fhSaveUndo(canvas);
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // IDBから削除
  if (dvDrawingId) fhSaveToIDB(dvDrawingId, null);
}

// === テキスト入力（ダブルタップ） ===
function fhShowTextInput(canvas, x, y) {
  var old = document.getElementById('fhTextModal');
  if (old) old.remove();

  var html = '<div id="fhTextModal" style="' +
    'position:fixed;top:0;left:0;right:0;bottom:0;' +
    'background:rgba(0,0,0,0.5);z-index:2000;' +
    'display:flex;align-items:center;justify-content:center;">' +
    '<div style="background:#fff;border-radius:12px;padding:20px;' +
    'width:85%;max-width:400px;">' +
    '<h3 style="margin:0 0 12px;font-size:16px;">テキスト書き込み</h3>' +
    '<input id="fhTextVal" type="text" placeholder="テキストを入力..." ' +
    'style="width:100%;padding:10px;border:1px solid #ddd;' +
    'border-radius:8px;font-size:16px;box-sizing:border-box;margin-bottom:12px;">' +
    '<div style="margin-bottom:12px;">' +
    '<label style="font-size:14px;color:#6B7280;">文字サイズ</label>' +
    '<div id="fhFontSizes" style="display:flex;gap:8px;margin-top:4px;">' +
    '<button class="fh-fs-btn" data-size="14" style="flex:1;padding:8px;border:2px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;">小</button>' +
    '<button class="fh-fs-btn" data-size="20" style="flex:1;padding:8px;border:2px solid #3B82F6;border-radius:8px;background:#EFF6FF;cursor:pointer;font-size:16px;">中</button>' +
    '<button class="fh-fs-btn" data-size="28" style="flex:1;padding:8px;border:2px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:20px;">大</button>' +
    '</div></div>' +
    '<div style="display:flex;gap:8px;">' +
    '<button id="fhTextCancel" style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;">キャンセル</button>' +
    '<button id="fhTextOk" style="flex:1;padding:10px;border:none;border-radius:8px;background:#3B82F6;color:#fff;cursor:pointer;">書き込む</button>' +
    '</div></div></div>';

  document.body.insertAdjacentHTML('beforeend', html);

  var fontSize = 20;
  document.querySelectorAll('.fh-fs-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      fontSize = parseInt(btn.dataset.size);
      document.querySelectorAll('.fh-fs-btn').forEach(function(b) {
        b.style.borderColor = '#ddd'; b.style.background = '#fff';
      });
      btn.style.borderColor = '#3B82F6'; btn.style.background = '#EFF6FF';
    });
  });

  document.getElementById('fhTextCancel').addEventListener('click', function() {
    document.getElementById('fhTextModal').remove();
  });

  document.getElementById('fhTextOk').addEventListener('click', function() {
    var text = document.getElementById('fhTextVal').value.trim();
    if (text) {
      fhSaveUndo(canvas);
      var ctx = canvas.getContext('2d');
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = 'bold ' + fontSize + 'px sans-serif';
      var metrics = ctx.measureText(text);
      var pad = 4;
      // テキスト背景（読みやすく）
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(x - pad, y - fontSize - pad, metrics.width + pad * 2, fontSize + pad * 2);
      // テキスト本体
      ctx.fillStyle = fhColor;
      ctx.fillText(text, x, y);
      fhAutoSave(canvas);
    }
    document.getElementById('fhTextModal').remove();
  });

  setTimeout(function() {
    var inp = document.getElementById('fhTextVal');
    if (inp) inp.focus();
  }, 100);
}

// === ツールバーUI ===
function fhCreateToolbar() {
  var tb = document.getElementById('fhToolbar');
  if (tb) return tb;

  tb = document.createElement('div');
  tb.id = 'fhToolbar';
  tb.style.cssText = 'position:fixed;bottom:0;left:0;right:0;' +
    'background:#1F2937;padding:8px 12px;display:none;z-index:100;' +
    'box-shadow:0 -2px 10px rgba(0,0,0,0.3);';

  var colors = [
    { c: '#EF4444', l: '赤' }, { c: '#3B82F6', l: '青' },
    { c: '#1F2937', l: '黒' }, { c: '#10B981', l: '緑' }, { c: '#FFFFFF', l: '白' }
  ];
  var widths = [
    { w: 2, l: '細' }, { w: 4, l: '中' }, { w: 8, l: '太' }
  ];

  var h = '';
  // 色選択行
  h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">';
  h += '<span style="color:#9CA3AF;font-size:12px;min-width:24px;">色</span>';
  colors.forEach(function(c) {
    var sel = c.c === fhColor;
    h += '<div class="fh-clr" data-color="' + c.c + '" style="' +
      'width:32px;height:32px;border-radius:50%;background:' + c.c + ';' +
      'border:3px solid ' + (sel ? '#F59E0B' : 'rgba(255,255,255,0.3)') + ';' +
      'cursor:pointer;' +
      (c.c === '#FFFFFF' ? 'box-shadow:inset 0 0 0 1px #ccc;' : '') + '"></div>';
  });
  h += '</div>';

  // 太さ選択行
  h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
  h += '<span style="color:#9CA3AF;font-size:12px;min-width:24px;">太</span>';
  widths.forEach(function(w) {
    var sel = w.w === fhWidth;
    h += '<div class="fh-wid" data-width="' + w.w + '" style="' +
      'display:flex;align-items:center;justify-content:center;' +
      'width:48px;height:32px;border-radius:8px;' +
      'background:' + (sel ? '#374151' : 'transparent') + ';' +
      'border:2px solid ' + (sel ? '#F59E0B' : 'rgba(255,255,255,0.3)') + ';' +
      'cursor:pointer;">' +
      '<div style="width:24px;height:' + w.w + 'px;background:#fff;border-radius:' + (w.w / 2) + 'px;"></div></div>';
  });
  h += '</div>';

  // アクションボタン行
  h += '<div style="display:flex;align-items:center;gap:8px;">';
  h += '<button id="fhEraserBtn" style="flex:1;padding:8px;border-radius:8px;' +
    'background:#374151;color:#fff;border:none;cursor:pointer;font-size:14px;">消しゴム</button>';
  h += '<button id="fhUndoBtn" style="flex:1;padding:8px;border-radius:8px;' +
    'background:#374151;color:#fff;border:none;cursor:pointer;font-size:14px;">↩ 戻す</button>';
  h += '<button id="fhClearBtn" style="flex:1;padding:8px;border-radius:8px;' +
    'background:#7F1D1D;color:#fff;border:none;cursor:pointer;font-size:14px;">全消し</button>';
  h += '</div>';

  tb.innerHTML = h;
  document.body.appendChild(tb);

  // 色選択
  tb.querySelectorAll('.fh-clr').forEach(function(btn) {
    btn.addEventListener('click', function() {
      fhColor = btn.dataset.color;
      fhIsEraser = false;
      fhUpdateToolbar(tb);
    });
  });
  // 太さ選択
  tb.querySelectorAll('.fh-wid').forEach(function(btn) {
    btn.addEventListener('click', function() {
      fhWidth = parseInt(btn.dataset.width);
      fhUpdateToolbar(tb);
    });
  });
  // 消しゴム
  document.getElementById('fhEraserBtn').addEventListener('click', function() {
    fhIsEraser = !fhIsEraser;
    fhUpdateToolbar(tb);
  });
  // Undo
  document.getElementById('fhUndoBtn').addEventListener('click', fhPerformUndo);
  // 全消し
  document.getElementById('fhClearBtn').addEventListener('click', function() {
    if (confirm('書き込みを全て消しますか？この操作は戻せません。')) fhClearAll();
  });

  return tb;
}

// ツールバー選択状態の更新
function fhUpdateToolbar(tb) {
  tb.querySelectorAll('.fh-clr').forEach(function(btn) {
    var sel = btn.dataset.color === fhColor && !fhIsEraser;
    btn.style.border = '3px solid ' + (sel ? '#F59E0B' : 'rgba(255,255,255,0.3)');
  });
  tb.querySelectorAll('.fh-wid').forEach(function(btn) {
    var sel = parseInt(btn.dataset.width) === fhWidth;
    btn.style.background = sel ? '#374151' : 'transparent';
    btn.style.border = '2px solid ' + (sel ? '#F59E0B' : 'rgba(255,255,255,0.3)');
  });
  var eb = document.getElementById('fhEraserBtn');
  if (eb) {
    eb.style.background = fhIsEraser ? '#F59E0B' : '#374151';
    eb.style.color = fhIsEraser ? '#000' : '#fff';
  }
}

// === 描画データ保存・復元（IndexedDB） ===
function fhAutoSave(canvas) {
  if (fhSaveTimer) clearTimeout(fhSaveTimer);
  fhSaveTimer = setTimeout(function() {
    var drawingId = dvDrawingId;
    if (!drawingId) return;
    canvas.toBlob(function(blob) {
      if (blob) fhSaveToIDB(drawingId, blob);
    }, 'image/png');
  }, 300);
}

// IDBに保存
async function fhSaveToIDB(drawingId, blob) {
  try {
    var drawing = await getDrawing(drawingId);
    if (drawing) {
      drawing.annotationBlob = blob;
      drawing.updatedAt = new Date().toISOString();
      await saveDrawing(drawing);
    }
  } catch (e) {
    console.error('[freehand] 保存エラー:', e);
  }
}

// 描画データ復元
async function fhLoadAnnotation(drawingId, canvas) {
  try {
    var drawing = await getDrawing(drawingId);
    if (drawing && drawing.annotationBlob) {
      var ctx = canvas.getContext('2d');
      var img = new Image();
      var url = URL.createObjectURL(drawing.annotationBlob);
      img.onload = function() {
        ctx.drawImage(img, 0, 0, canvas.offsetWidth, canvas.offsetHeight);
        URL.revokeObjectURL(url);
      };
      img.onerror = function() { URL.revokeObjectURL(url); };
      img.src = url;
    }
  } catch (e) {
    console.error('[freehand] 復元エラー:', e);
  }
}

// === モード切替 ===
function enableDrawMode() {
  var canvas = document.getElementById('freehandCanvas');
  var tb = document.getElementById('fhToolbar');
  var pinPanel = document.getElementById('dpPinListPanel');
  if (canvas) canvas.style.pointerEvents = 'auto';
  if (tb) tb.style.display = 'block';
  if (pinPanel) pinPanel.style.display = 'none';
}

function disableDrawMode() {
  var canvas = document.getElementById('freehandCanvas');
  var tb = document.getElementById('fhToolbar');
  if (canvas) canvas.style.pointerEvents = 'none';
  if (tb) tb.style.display = 'none';
  fhIsDrawing = false;
}

// === 初期化 ===
function initFreehand(drawingId) {
  var container = document.getElementById('dvContainer');
  if (!container) { console.error('[freehand] dvContainerが見つかりません'); return; }

  var canvas = fhCreateCanvas(container);
  if (!canvas) { console.warn('[freehand] Canvas作成失敗（図面未表示）'); return; }

  fhInitEvents(canvas);
  fhCreateToolbar();
  fhUndoStack = [];
  fhLoadAnnotation(drawingId, canvas);
  console.log('[freehand] 手書き機能を初期化しました');
}

// === クリーンアップ ===
function fhCleanup() {
  var canvas = document.getElementById('freehandCanvas');
  if (canvas) canvas.remove();
  var tb = document.getElementById('fhToolbar');
  if (tb) tb.remove();
  var modal = document.getElementById('fhTextModal');
  if (modal) modal.remove();
  fhUndoStack = [];
  fhIsDrawing = false;
  if (fhSaveTimer) { clearTimeout(fhSaveTimer); fhSaveTimer = null; }
}

// === グローバル公開 ===
window.initFreehand = initFreehand;
window.enableDrawMode = enableDrawMode;
window.disableDrawMode = disableDrawMode;
window.fhCleanup = fhCleanup;

console.log('[drawing-freehand.js] v8.4.0 手書き書き込みモジュール読み込み完了');
