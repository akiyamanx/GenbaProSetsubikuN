// drawing-text.js - 図面テキスト書き込み（DOM要素方式・移動対応）
// v8.4.1 Phase8 テキスト移動・サイズ変更対応
// 依存: drawing-viewer.js, drawing-manager.js

var ftTextElements = [];
var ftSaveTimer = null;

// === テキストオーバーレイ作成 ===
function ftCreateTextOverlay() {
  var existing = document.getElementById('ftTextOverlay');
  if (existing) return existing;
  var transform = document.getElementById('dvTransform');
  if (!transform) return null;
  var el = document.getElementById('dvCanvas');
  if (!el || el.style.display === 'none') el = document.getElementById('dvImage');
  if (!el) return null;
  var w = parseFloat(el.style.width) || el.width || el.naturalWidth || el.offsetWidth;
  var h = parseFloat(el.style.height) || el.height || el.naturalHeight || el.offsetHeight;
  if (w === 0 || h === 0) return null;
  var overlay = document.createElement('div');
  overlay.id = 'ftTextOverlay';
  overlay.style.cssText = 'position:absolute;top:0;left:0;width:' + w + 'px;height:' +
    h + 'px;pointer-events:none;z-index:16;';
  transform.style.position = 'relative';
  transform.appendChild(overlay);
  return overlay;
}

// === テキスト入力モーダル（文字サイズ選択付き） ===
function ftShowTextInput(posX, posY) {
  var old = document.getElementById('ftTextModal');
  if (old) old.remove();
  var html = '<div id="ftTextModal" style="position:fixed;top:0;left:0;right:0;bottom:0;' +
    'background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:center;justify-content:center;">' +
    '<div style="background:#fff;border-radius:12px;padding:20px;width:85%;max-width:400px;">' +
    '<h3 style="margin:0 0 12px;font-size:16px;">テキスト書き込み</h3>' +
    '<input id="ftTextVal" type="text" placeholder="テキストを入力..." ' +
    'style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;' +
    'font-size:16px;box-sizing:border-box;margin-bottom:12px;">' +
    '<div style="margin-bottom:12px;">' +
    '<label style="font-size:14px;color:#6B7280;">文字サイズ</label>' +
    '<div style="display:flex;gap:8px;margin-top:6px;">' +
    '<button class="ft-fs-btn" data-size="14" style="flex:1;padding:8px;border:2px solid #ddd;' +
    'border-radius:8px;background:#fff;cursor:pointer;font-size:12px;">小 (S)</button>' +
    '<button class="ft-fs-btn ft-fs-active" data-size="24" style="flex:1;padding:8px;' +
    'border:2px solid #3B82F6;border-radius:8px;background:#EFF6FF;cursor:pointer;' +
    'font-size:16px;font-weight:bold;">中 (M)</button>' +
    '<button class="ft-fs-btn" data-size="40" style="flex:1;padding:8px;border:2px solid #ddd;' +
    'border-radius:8px;background:#fff;cursor:pointer;font-size:20px;">大 (L)</button>' +
    '</div></div>' +
    '<div style="display:flex;gap:8px;">' +
    '<button id="ftTextCancel" style="flex:1;padding:10px;border:1px solid #ddd;' +
    'border-radius:8px;background:#fff;cursor:pointer;">キャンセル</button>' +
    '<button id="ftTextOk" style="flex:1;padding:10px;border:none;border-radius:8px;' +
    'background:#3B82F6;color:#fff;cursor:pointer;font-weight:bold;">書き込む</button>' +
    '</div></div></div>';
  document.body.insertAdjacentHTML('beforeend', html);

  var fontSize = 24;
  document.querySelectorAll('.ft-fs-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      fontSize = parseInt(btn.dataset.size);
      document.querySelectorAll('.ft-fs-btn').forEach(function(b) {
        b.style.borderColor = '#ddd'; b.style.background = '#fff'; b.style.fontWeight = 'normal';
      });
      btn.style.borderColor = '#3B82F6'; btn.style.background = '#EFF6FF';
      btn.style.fontWeight = 'bold';
    });
  });
  document.getElementById('ftTextCancel').addEventListener('click', function() {
    document.getElementById('ftTextModal').remove();
  });
  document.getElementById('ftTextOk').addEventListener('click', function() {
    var text = document.getElementById('ftTextVal').value.trim();
    if (text) {
      var color = (typeof fhColor !== 'undefined') ? fhColor : '#000';
      ftAddTextElement(text, posX, posY, fontSize, color);
    }
    document.getElementById('ftTextModal').remove();
  });
  document.getElementById('ftTextVal').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') document.getElementById('ftTextOk').click();
  });
  setTimeout(function() {
    var inp = document.getElementById('ftTextVal');
    if (inp) inp.focus();
  }, 100);
}

// === テキストDOM要素作成（内部用・永続化なし） ===
function ftCreateTextDOM(id, text, posX, posY, fontSize, color) {
  var overlay = ftCreateTextOverlay();
  if (!overlay) return null;
  var el = document.createElement('div');
  el.id = id;
  el.className = 'ft-text-element';
  el.style.cssText = 'position:absolute;left:' + (posX * 100) + '%;top:' + (posY * 100) + '%;' +
    'font-size:' + fontSize + 'px;font-weight:bold;color:' + (color || '#000') + ';' +
    'background:rgba(255,255,255,0.6);border-radius:2px;' +
    'cursor:move;pointer-events:auto;user-select:none;white-space:nowrap;z-index:17;' +
    'padding:2px 4px;border:2px dashed transparent;';
  el.textContent = text;
  el.addEventListener('click', function(e) { e.stopPropagation(); ftSelectText(el); });
  el.addEventListener('touchend', function(e) {
    if (!el._ftDragged) { e.stopPropagation(); e.preventDefault(); ftSelectText(el); }
    el._ftDragged = false;
  });
  ftMakeDraggable(el, overlay);
  overlay.appendChild(el);
  // drawモード以外ならインタラクション無効
  if (typeof dvMode !== 'undefined' && dvMode !== 'draw') {
    el.style.pointerEvents = 'none';
  }
  return el;
}

// === テキスト追加（UI操作用・永続化あり） ===
function ftAddTextElement(text, posX, posY, fontSize, color) {
  var id = 'ft_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  var el = ftCreateTextDOM(id, text, posX, posY, fontSize, color || '#000');
  if (!el) return null;
  ftTextElements.push({ id: id, text: text, posX: posX, posY: posY,
    fontSize: fontSize, color: color || '#000' });
  ftPersistTexts();
  return el;
}

// === ドラッグ移動（タッチ + マウス） ===
function ftMakeDraggable(el, overlay) {
  var startX, startY, startLeft, startTop, dragging = false;
  // タッチ
  el.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1) return;
    e.preventDefault(); e.stopPropagation();
    dragging = true; el._ftDragged = false;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    var oR = overlay.getBoundingClientRect();
    var eR = el.getBoundingClientRect();
    startLeft = eR.left - oR.left; startTop = eR.top - oR.top;
    el.style.borderColor = '#3B82F6'; el.style.opacity = '0.85';
  }, { passive: false });
  el.addEventListener('touchmove', function(e) {
    if (!dragging || e.touches.length !== 1) return;
    e.preventDefault(); e.stopPropagation(); el._ftDragged = true;
    var oR = overlay.getBoundingClientRect();
    el.style.left = ((startLeft + e.touches[0].clientX - startX) / oR.width * 100) + '%';
    el.style.top = ((startTop + e.touches[0].clientY - startY) / oR.height * 100) + '%';
  }, { passive: false });
  el.addEventListener('touchend', function() {
    if (!dragging) return;
    dragging = false; el.style.opacity = '1';
    var oR = overlay.getBoundingClientRect();
    var eR = el.getBoundingClientRect();
    ftUpdatePos(el.id, (eR.left - oR.left) / oR.width, (eR.top - oR.top) / oR.height);
  });
  // マウス
  el.addEventListener('mousedown', function(e) {
    e.preventDefault(); e.stopPropagation();
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    var oR = overlay.getBoundingClientRect();
    var eR = el.getBoundingClientRect();
    startLeft = eR.left - oR.left; startTop = eR.top - oR.top;
    el.style.borderColor = '#3B82F6';
    var onMove = function(ev) {
      if (!dragging) return;
      var r = overlay.getBoundingClientRect();
      el.style.left = ((startLeft + ev.clientX - startX) / r.width * 100) + '%';
      el.style.top = ((startTop + ev.clientY - startY) / r.height * 100) + '%';
    };
    var onUp = function() {
      dragging = false; el.style.opacity = '1';
      var r = overlay.getBoundingClientRect();
      var er = el.getBoundingClientRect();
      ftUpdatePos(el.id, (er.left - r.left) / r.width, (er.top - r.top) / r.height);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// === テキスト選択時のミニツールバー ===
function ftSelectText(el) {
  var old = document.getElementById('ftToolbar');
  if (old) old.remove();
  document.querySelectorAll('.ft-text-element').forEach(function(t) {
    t.style.borderColor = 'transparent';
  });
  el.style.borderColor = '#3B82F6';
  var tb = document.createElement('div');
  tb.id = 'ftToolbar';
  tb.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);' +
    'background:#1F2937;border-radius:12px;padding:8px 12px;display:flex;gap:8px;z-index:3000;' +
    'box-shadow:0 4px 12px rgba(0,0,0,0.3);';
  var actions = [
    { label: '\u270F\uFE0F', fn: function() {
      ftShowEditDialog(el.textContent, function(newText) {
        if (newText !== null && newText.trim() !== '') {
          el.textContent = newText.trim();
          ftUpdateText(el.id, newText.trim());
        }
      });
    }},
    { label: 'A-', fn: function() {
      var sz = Math.max(10, (parseInt(el.style.fontSize) || 24) - 4);
      el.style.fontSize = sz + 'px'; ftUpdateSize(el.id, sz);
    }},
    { label: 'A+', fn: function() {
      var sz = Math.min(80, (parseInt(el.style.fontSize) || 24) + 4);
      el.style.fontSize = sz + 'px'; ftUpdateSize(el.id, sz);
    }},
    { label: '\uD83D\uDDD1', fn: function() {
      if (confirm('このテキストを削除しますか？')) {
        ftDeleteText(el.id); el.remove(); tb.remove();
      }
    }},
    { label: '\u2713', fn: function() {
      el.style.borderColor = 'transparent'; tb.remove();
    }}
  ];
  actions.forEach(function(a) {
    var btn = document.createElement('button');
    btn.textContent = a.label;
    btn.style.cssText = 'background:#374151;color:#fff;border:none;border-radius:8px;' +
      'padding:8px 14px;font-size:16px;cursor:pointer;min-width:44px;';
    btn.addEventListener('click', function(e) { e.stopPropagation(); a.fn(); });
    tb.appendChild(btn);
  });
  document.body.appendChild(tb);
}

// === データ管理 ===
function ftUpdatePos(id, x, y) {
  var item = ftTextElements.find(function(t) { return t.id === id; });
  if (item) { item.posX = x; item.posY = y; }
  ftPersistTexts();
}
function ftUpdateSize(id, sz) {
  var item = ftTextElements.find(function(t) { return t.id === id; });
  if (item) { item.fontSize = sz; }
  ftPersistTexts();
}
function ftUpdateText(id, text) {
  var item = ftTextElements.find(function(t) { return t.id === id; });
  if (item) { item.text = text; }
  ftPersistTexts();
}
function ftDeleteText(id) {
  ftTextElements = ftTextElements.filter(function(t) { return t.id !== id; });
  ftPersistTexts();
}

// === テキスト修正ダイアログ ===
function ftShowEditDialog(currentText, callback) {
  var old = document.getElementById('ftEditDialog');
  if (old) old.remove();
  var escaped = currentText.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  var html = '<div id="ftEditDialog" style="position:fixed;top:0;left:0;right:0;bottom:0;' +
    'background:rgba(0,0,0,0.5);z-index:4000;display:flex;align-items:center;justify-content:center;">' +
    '<div style="background:#fff;border-radius:12px;padding:20px;width:85%;max-width:380px;">' +
    '<h3 style="margin:0 0 12px;font-size:16px;">テキスト修正</h3>' +
    '<input id="ftEditInput" type="text" value="' + escaped + '" ' +
    'style="width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;' +
    'font-size:18px;box-sizing:border-box;margin-bottom:16px;">' +
    '<div style="display:flex;gap:8px;">' +
    '<button id="ftEditCancel" style="flex:1;padding:10px;background:#e5e7eb;border:none;' +
    'border-radius:8px;font-size:15px;cursor:pointer;">キャンセル</button>' +
    '<button id="ftEditSave" style="flex:1;padding:10px;background:#3B82F6;color:#fff;border:none;' +
    'border-radius:8px;font-weight:bold;font-size:15px;cursor:pointer;">変更</button>' +
    '</div></div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
  var input = document.getElementById('ftEditInput');
  setTimeout(function() { input.focus(); input.select(); }, 100);
  document.getElementById('ftEditSave').addEventListener('click', function() {
    callback(input.value);
    document.getElementById('ftEditDialog').remove();
  });
  document.getElementById('ftEditCancel').addEventListener('click', function() {
    callback(null);
    document.getElementById('ftEditDialog').remove();
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      callback(input.value);
      document.getElementById('ftEditDialog').remove();
    }
  });
}

// === IDB保存（デバウンス300ms） ===
function ftPersistTexts() {
  if (ftSaveTimer) clearTimeout(ftSaveTimer);
  ftSaveTimer = setTimeout(async function() {
    var drawingId = (typeof dvDrawingId !== 'undefined') ? dvDrawingId : null;
    if (!drawingId) return;
    try {
      var drawing = await getDrawing(drawingId);
      if (drawing) {
        drawing.textElements = ftTextElements.map(function(t) {
          return { id: t.id, text: t.text, posX: t.posX, posY: t.posY,
            fontSize: t.fontSize, color: t.color };
        });
        drawing.updatedAt = new Date().toISOString();
        await saveDrawing(drawing);
      }
    } catch (e) { console.error('[drawing-text] 保存エラー:', e); }
  }, 300);
}

// === IDBから復元 ===
async function ftLoadTexts(drawingId) {
  ftTextElements = [];
  try {
    var drawing = await getDrawing(drawingId);
    if (drawing && drawing.textElements && drawing.textElements.length > 0) {
      drawing.textElements.forEach(function(t) {
        ftCreateTextDOM(t.id, t.text, t.posX, t.posY, t.fontSize, t.color);
        ftTextElements.push({ id: t.id, text: t.text, posX: t.posX, posY: t.posY,
          fontSize: t.fontSize, color: t.color });
      });
    }
  } catch (e) { console.error('[drawing-text] 読込エラー:', e); }
}

// === テキスト要素のインタラクション切替 ===
function ftSetInteractive(enabled) {
  var elems = document.querySelectorAll('.ft-text-element');
  for (var i = 0; i < elems.length; i++) {
    elems[i].style.pointerEvents = enabled ? 'auto' : 'none';
  }
  if (!enabled) {
    var tb = document.getElementById('ftToolbar');
    if (tb) tb.remove();
    elems.forEach(function(el) { el.style.borderColor = 'transparent'; });
  }
}

// === 初期化 ===
function ftInitTexts(drawingId) {
  ftCleanupTexts();
  ftLoadTexts(drawingId);
}

// === クリーンアップ ===
function ftCleanupTexts() {
  var overlay = document.getElementById('ftTextOverlay');
  if (overlay) overlay.remove();
  var tb = document.getElementById('ftToolbar');
  if (tb) tb.remove();
  var modal = document.getElementById('ftTextModal');
  if (modal) modal.remove();
  var edit = document.getElementById('ftEditDialog');
  if (edit) edit.remove();
  ftTextElements = [];
  if (ftSaveTimer) { clearTimeout(ftSaveTimer); ftSaveTimer = null; }
}

// === グローバル公開 ===
window.ftShowTextInput = ftShowTextInput;
window.ftInitTexts = ftInitTexts;
window.ftCleanupTexts = ftCleanupTexts;
window.ftSetInteractive = ftSetInteractive;

console.log('[drawing-text.js] v8.4.2 テキスト書き込みモジュール読み込み完了');
