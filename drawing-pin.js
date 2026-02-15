// drawing-pin.js - 図面ピン管理モジュール（v8.3.0 Phase8 Step3）
// 依存: drawing-viewer.js, drawing-manager.js, idb-storage.js

var dpPinTapStart = null;
var dpPhotoSelection = [];
var dpEditingPin = null;
var dpPhotoUrls = [];

// === 初期化 ===
function initDrawingPins(drawingId) {
  var container = document.getElementById('dvContainer');
  if (!container) {
    console.error('[drawing-pin] dvContainerが見つかりません');
    return;
  }
  dpSetupPinTap(container);
  dpRenderAllPins(drawingId, container);
  dpRenderPinListPanel(drawingId);
  console.log('[drawing-pin] ピン機能初期化完了 drawingId:', drawingId);
}

// === タップでピン追加 ===
function dpSetupPinTap(container) {
  // タッチ（モバイル）: touchstart/touchend でタップ判定
  container.addEventListener('touchstart', function(e) {
    if (dvMode !== 'pin') return;
    if (e.touches.length !== 1) return;
    e.preventDefault();
    dpPinTapStart = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now()
    };
  }, { passive: false });

  container.addEventListener('touchend', function(e) {
    if (dvMode !== 'pin' || !dpPinTapStart) return;
    e.preventDefault();
    var ct = e.changedTouches[0];
    var dx = ct.clientX - dpPinTapStart.x;
    var dy = ct.clientY - dpPinTapStart.y;
    var dt = Date.now() - dpPinTapStart.time;
    dpPinTapStart = null;
    // タップ判定: 移動15px以内 & 500ms以内
    if (Math.abs(dx) < 15 && Math.abs(dy) < 15 && dt < 500) {
      dpHandlePinTap(ct.clientX, ct.clientY, container);
    }
  }, { passive: false });

  // マウス（PC）: click
  container.addEventListener('click', function(e) {
    if (dvMode !== 'pin') return;
    dpHandlePinTap(e.clientX, e.clientY, container);
  });
}

function dpHandlePinTap(clientX, clientY, container) {
  var coord = dpScreenToDrawingCoord(clientX, clientY, container);
  if (!coord) return;
  if (coord.posX < 0 || coord.posX > 1 || coord.posY < 0 || coord.posY > 1) return;
  dpShowPinDetailModal(null, coord.posX, coord.posY);
}

// === 座標変換: スクリーン座標 → 図面相対座標（0.0〜1.0） ===
function dpScreenToDrawingCoord(clientX, clientY, container) {
  var rect = container.getBoundingClientRect();
  var cx = clientX - rect.left;
  var cy = clientY - rect.top;

  // drawing-viewer.jsのtransform逆算: translate(tx,ty) scale(s) rotate(r) origin(0,0)
  var ux = (cx - dvTransX) / dvScale;
  var uy = (cy - dvTransY) / dvScale;

  // 回転の逆算
  var rad = -dvRotation * Math.PI / 180;
  var px = ux * Math.cos(rad) - uy * Math.sin(rad);
  var py = ux * Math.sin(rad) + uy * Math.cos(rad);

  // 図面要素のサイズ取得
  var el = document.getElementById('dvCanvas');
  if (!el || el.style.display === 'none') el = document.getElementById('dvImage');
  if (!el) return null;
  var w = parseFloat(el.style.width) || el.width || el.naturalWidth || el.offsetWidth;
  var h = parseFloat(el.style.height) || el.height || el.naturalHeight || el.offsetHeight;
  if (w === 0 || h === 0) return null;

  return {
    posX: Math.max(0, Math.min(1, px / w)),
    posY: Math.max(0, Math.min(1, py / h))
  };
}

// === ピンオーバーレイ（dvTransform内に配置→図面と一緒にスケール） ===
function dpCreatePinOverlay() {
  var existing = document.getElementById('dpPinOverlay');
  if (existing) return existing;
  var transform = document.getElementById('dvTransform');
  if (!transform) return null;
  var overlay = document.createElement('div');
  overlay.id = 'dpPinOverlay';
  overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';
  transform.style.position = 'relative';
  transform.appendChild(overlay);
  return overlay;
}

async function dpRenderAllPins(drawingId, container) {
  var overlay = dpCreatePinOverlay();
  if (!overlay) return;
  var old = overlay.querySelectorAll('.dp-pin-marker');
  for (var i = 0; i < old.length; i++) old[i].remove();
  try {
    var pins = await getDrawingPinsByDrawing(drawingId);
    pins.forEach(function(pin) { dpRenderPin(pin, overlay); });
  } catch (e) {
    console.error('[drawing-pin] ピン描画エラー:', e);
  }
}

function dpRenderPin(pin, overlay) {
  var colors = { todo: '#EF4444', inProgress: '#F59E0B', done: '#10B981' };
  var color = colors[pin.status] || colors.todo;
  var el = document.createElement('div');
  el.className = 'dp-pin-marker';
  el.dataset.pinId = pin.id;
  el.style.cssText = 'position:absolute;left:' + (pin.posX * 100) + '%;top:' + (pin.posY * 100) +
    '%;transform:translate(-50%,-100%);width:28px;height:28px;cursor:pointer;pointer-events:auto;' +
    'z-index:11;font-size:24px;text-align:center;line-height:28px;' +
    'filter:drop-shadow(1px 1px 2px rgba(0,0,0,0.5));transition:transform 0.15s ease;';
  el.innerHTML = '<span style="color:' + color + ';">📌</span>';
  el.addEventListener('click', function(e) {
    e.stopPropagation();
    dpShowPinDetailModal(pin);
  });
  el.addEventListener('touchend', function(e) {
    e.stopPropagation();
    e.preventDefault();
    dpShowPinDetailModal(pin);
  });
  overlay.appendChild(el);
}

// === ピン詳細モーダル ===
function dpShowPinDetailModal(existingPin, posX, posY) {
  var isNew = !existingPin;
  var pin = existingPin || {
    id: generateId(),
    drawingId: dvDrawingId,
    posX: posX || 0,
    posY: posY || 0,
    title: '',
    memo: '',
    status: 'todo',
    photoIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  dpEditingPin = pin;
  dpPhotoSelection = pin.photoIds ? pin.photoIds.slice() : [];

  var old = document.getElementById('dpPinModal');
  if (old) old.remove();

  var statusOpts = [
    { val: 'todo', label: '🔴 要対応', bc: '#EF4444', bg: '#FEE2E2' },
    { val: 'inProgress', label: '🟡 作業中', bc: '#F59E0B', bg: '#FEF3C7' },
    { val: 'done', label: '🟢 完了', bc: '#10B981', bg: '#D1FAE5' }
  ];

  var statusHtml = statusOpts.map(function(o) {
    var sel = pin.status === o.val;
    return '<label style="flex:1;text-align:center;padding:10px;border:2px solid ' +
      (sel ? o.bc : '#ddd') + ';border-radius:8px;cursor:pointer;background:' +
      (sel ? o.bg : '#fff') + ';font-size:13px;">' +
      '<input type="radio" name="dpStatus" value="' + o.val + '"' +
      (sel ? ' checked' : '') + ' style="display:none;">' + o.label + '</label>';
  }).join('');

  var html = '<div id="dpPinModal" style="position:fixed;top:0;left:0;right:0;bottom:0;' +
    'background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:flex-end;justify-content:center;">' +
    '<div style="background:#fff;border-radius:16px 16px 0 0;padding:20px;width:100%;max-width:500px;max-height:80vh;overflow-y:auto;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
    '<h3 style="margin:0;font-size:18px;">📌 ' + (isNew ? 'ピン追加' : 'ピン編集') + '</h3>' +
    '<button id="dpModalClose" style="background:none;border:none;font-size:24px;cursor:pointer;">✕</button></div>' +
    '<div style="margin-bottom:12px;"><label style="font-weight:bold;font-size:14px;">タイトル</label>' +
    '<input id="dpPinTitle" type="text" value="' + escapeHtml(pin.title) + '" placeholder="例: 給水管交換" ' +
    'style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:16px;box-sizing:border-box;margin-top:4px;"></div>' +
    '<div style="margin-bottom:12px;"><label style="font-weight:bold;font-size:14px;">メモ</label>' +
    '<textarea id="dpPinMemo" rows="3" placeholder="詳細メモを入力..." ' +
    'style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:16px;box-sizing:border-box;resize:vertical;margin-top:4px;">' +
    escapeHtml(pin.memo) + '</textarea></div>' +
    '<div style="margin-bottom:12px;"><label style="font-weight:bold;font-size:14px;">ステータス</label>' +
    '<div id="dpStatusRow" style="display:flex;gap:8px;margin-top:4px;">' + statusHtml + '</div></div>' +
    '<div style="margin-bottom:16px;"><label style="font-weight:bold;font-size:14px;">📷 紐付き写真</label>' +
    '<div id="dpPhotoList" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;"></div>' +
    '<button id="dpAddPhotoBtn" style="margin-top:8px;padding:8px 16px;background:#3B82F6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;">＋ 写真を紐付け</button></div>' +
    '<div style="display:flex;gap:8px;">' +
    '<button id="dpSaveBtn" style="flex:1;padding:12px;background:#3B82F6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:16px;font-weight:bold;">💾 保存</button>' +
    (isNew ? '' : '<button id="dpDeleteBtn" style="padding:12px 20px;background:#EF4444;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:16px;">🗑</button>') +
    '</div></div></div>';

  document.body.insertAdjacentHTML('beforeend', html);

  // ステータス選択UI
  document.querySelectorAll('input[name="dpStatus"]').forEach(function(r) {
    r.addEventListener('change', function() {
      document.querySelectorAll('input[name="dpStatus"]').forEach(function(r2) {
        var lbl = r2.closest('label');
        var opt = statusOpts.find(function(o) { return o.val === r2.value; });
        if (r2.checked) {
          lbl.style.borderColor = opt.bc;
          lbl.style.background = opt.bg;
        } else {
          lbl.style.borderColor = '#ddd';
          lbl.style.background = '#fff';
        }
      });
    });
  });

  // 閉じる
  document.getElementById('dpModalClose').addEventListener('click', function() {
    dpCloseModal();
  });

  // 保存
  document.getElementById('dpSaveBtn').addEventListener('click', async function() {
    pin.title = document.getElementById('dpPinTitle').value.trim() || '無題のピン';
    pin.memo = document.getElementById('dpPinMemo').value.trim();
    var sel = document.querySelector('input[name="dpStatus"]:checked');
    pin.status = sel ? sel.value : 'todo';
    pin.photoIds = dpPhotoSelection.slice();
    pin.updatedAt = new Date().toISOString();
    try {
      await saveDrawingPin(pin);
      dpCloseModal();
      dpRenderAllPins(dvDrawingId, document.getElementById('dvContainer'));
      dpRenderPinListPanel(dvDrawingId);
    } catch (e) {
      console.error('[drawing-pin] 保存エラー:', e);
      alert('ピンの保存に失敗しました。');
    }
  });

  // 削除
  if (!isNew) {
    var delBtn = document.getElementById('dpDeleteBtn');
    if (delBtn) {
      delBtn.addEventListener('click', async function() {
        if (!confirm('このピンを削除しますか？')) return;
        try {
          await deleteDrawingPin(pin.id);
          dpCloseModal();
          dpRenderAllPins(dvDrawingId, document.getElementById('dvContainer'));
          dpRenderPinListPanel(dvDrawingId);
        } catch (e) {
          console.error('[drawing-pin] 削除エラー:', e);
          alert('ピンの削除に失敗しました。');
        }
      });
    }
  }

  // 写真紐付け
  document.getElementById('dpAddPhotoBtn').addEventListener('click', function() {
    dpShowPhotoPicker();
  });

  // 紐付き写真表示
  dpRenderPinPhotos();
}

function dpCloseModal() {
  var m = document.getElementById('dpPinModal');
  if (m) m.remove();
  dpRevokePhotoUrls();
  dpEditingPin = null;
}

// === ピン一覧パネル（画面下部） ===
async function dpRenderPinListPanel(drawingId) {
  var panel = document.getElementById('dpPinListPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'dpPinListPanel';
    panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:35vh;overflow-y:auto;' +
      'background:#fff;border-top:2px solid #e5e7eb;box-shadow:0 -2px 10px rgba(0,0,0,0.1);' +
      'z-index:50;padding:8px;transition:max-height 0.3s ease;';
    document.body.appendChild(panel);
  }

  var pins = [];
  try {
    pins = await getDrawingPinsByDrawing(drawingId);
  } catch (e) { console.error('[drawing-pin] ピン取得エラー:', e); }

  if (pins.length === 0) {
    panel.innerHTML = '<div style="text-align:center;padding:16px;color:#9ca3af;font-size:14px;">' +
      '📌 ピンモードで図面をタップしてピンを追加</div>';
    return;
  }

  var sl = { todo: '🔴 要対応', inProgress: '🟡 作業中', done: '🟢 完了' };
  var html = '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;">' +
    '<span style="font-weight:bold;font-size:14px;">📌 ピン一覧（' + pins.length + '件）</span>' +
    '<button id="dpTogglePanel" style="background:none;border:none;font-size:18px;cursor:pointer;">▼</button></div>';

  pins.forEach(function(pin) {
    var ph = (pin.photoIds && pin.photoIds.length > 0) ? ' | 📷 ' + pin.photoIds.length + '枚' : '';
    html += '<div class="dp-list-item" data-pin-id="' + pin.id + '" style="' +
      'display:flex;align-items:center;padding:10px 8px;border-bottom:1px solid #f3f4f6;cursor:pointer;">' +
      '<span style="font-size:18px;margin-right:8px;">📌</span>' +
      '<div style="flex:1;min-width:0;">' +
      '<div style="font-weight:bold;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
      escapeHtml(pin.title || '無題のピン') + '</div>' +
      '<div style="font-size:12px;color:#6b7280;">' + (sl[pin.status] || '🔴 要対応') + ph + '</div>' +
      '</div><span style="font-size:12px;color:#9ca3af;">▶</span></div>';
  });
  panel.innerHTML = html;

  // パネル開閉
  var toggle = document.getElementById('dpTogglePanel');
  if (toggle) {
    toggle.addEventListener('click', function() {
      if (panel.style.maxHeight === '40px') {
        panel.style.maxHeight = '35vh';
        toggle.textContent = '▼';
      } else {
        panel.style.maxHeight = '40px';
        toggle.textContent = '▲';
      }
    });
  }

  // リストアイテムクリック
  var items = panel.querySelectorAll('.dp-list-item');
  items.forEach(function(item) {
    item.addEventListener('click', function() {
      var pinId = item.dataset.pinId;
      dpHandlePinListItemClick(pinId, pins);
    });
  });
}

function dpHandlePinListItemClick(pinId, pins) {
  var markers = document.querySelectorAll('.dp-pin-marker');
  markers.forEach(function(m) {
    m.style.transform = m.dataset.pinId === pinId
      ? 'translate(-50%,-100%) scale(1.5)' : 'translate(-50%,-100%) scale(1)';
  });
  var pin = pins.find(function(p) { return p.id === pinId; });
  if (pin) dpShowPinDetailModal(pin);
}

// === 写真紐付け ===
async function dpShowPhotoPicker() {
  var photos = [];
  try {
    photos = await getAllPhotoManager();
  } catch (e) { console.error('[drawing-pin] 写真取得エラー:', e); }

  if (photos.length === 0) {
    alert('写真がまだ登録されていません。\n写真管理画面から写真を追加してください。');
    return;
  }

  var oldPicker = document.getElementById('dpPhotoPicker');
  if (oldPicker) oldPicker.remove();

  var gridHtml = '';
  photos.forEach(function(photo) {
    var isSel = dpPhotoSelection.indexOf(photo.id) >= 0;
    var thumbSrc = '';
    if (photo.thumbnailBlob) {
      var url = URL.createObjectURL(photo.thumbnailBlob);
      dpPhotoUrls.push(url);
      thumbSrc = url;
    }
    var checkMark = isSel ? '<div style="position:absolute;top:4px;right:4px;background:#3B82F6;color:#fff;' +
      'border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:14px;">✓</div>' : '';
    gridHtml += '<div class="dp-photo-item" data-photo-id="' + photo.id + '" style="position:relative;' +
      'aspect-ratio:1;border:3px solid ' + (isSel ? '#3B82F6' : 'transparent') +
      ';border-radius:8px;overflow:hidden;cursor:pointer;">' +
      (thumbSrc ? '<img src="' + thumbSrc + '" style="width:100%;height:100%;object-fit:cover;">' :
        '<div style="width:100%;height:100%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:24px;">📷</div>') +
      checkMark + '</div>';
  });

  var pickerHtml = '<div id="dpPhotoPicker" style="position:fixed;top:0;left:0;right:0;bottom:0;' +
    'background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:center;justify-content:center;">' +
    '<div style="background:#fff;border-radius:12px;padding:16px;width:90%;max-width:400px;max-height:70vh;overflow-y:auto;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
    '<h3 style="margin:0;font-size:16px;">📷 写真を選択</h3>' +
    '<button id="dpPickerClose" style="background:none;border:none;font-size:20px;cursor:pointer;">✕</button></div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">' + gridHtml + '</div>' +
    '<button id="dpPickerConfirm" style="width:100%;margin-top:12px;padding:12px;background:#3B82F6;' +
    'color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer;">✓ 選択完了</button></div></div>';

  document.body.insertAdjacentHTML('beforeend', pickerHtml);

  // 閉じる
  document.getElementById('dpPickerClose').addEventListener('click', function() {
    document.getElementById('dpPhotoPicker').remove();
  });

  // 写真トグル
  document.querySelectorAll('.dp-photo-item').forEach(function(item) {
    item.addEventListener('click', function() {
      var pid = item.dataset.photoId;
      var idx = dpPhotoSelection.indexOf(pid);
      if (idx >= 0) {
        dpPhotoSelection.splice(idx, 1);
        item.style.borderColor = 'transparent';
        var ck = item.querySelector('div[style*="border-radius:50%"]');
        if (ck) ck.remove();
      } else {
        dpPhotoSelection.push(pid);
        item.style.borderColor = '#3B82F6';
        item.insertAdjacentHTML('beforeend', '<div style="position:absolute;top:4px;right:4px;' +
          'background:#3B82F6;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;' +
          'align-items:center;justify-content:center;font-size:14px;">✓</div>');
      }
    });
  });

  // 確定
  document.getElementById('dpPickerConfirm').addEventListener('click', function() {
    document.getElementById('dpPhotoPicker').remove();
    dpRenderPinPhotos();
  });
}

async function dpRenderPinPhotos() {
  var container = document.getElementById('dpPhotoList');
  if (!container) return;
  container.innerHTML = '';
  if (!dpPhotoSelection || dpPhotoSelection.length === 0) {
    container.innerHTML = '<span style="color:#9ca3af;font-size:13px;">写真なし</span>';
    return;
  }
  for (var i = 0; i < dpPhotoSelection.length; i++) {
    try {
      var photo = await getPhotoManager(dpPhotoSelection[i]);
      if (photo && photo.thumbnailBlob) {
        var url = URL.createObjectURL(photo.thumbnailBlob);
        dpPhotoUrls.push(url);
        var thumb = document.createElement('div');
        thumb.style.cssText = 'width:60px;height:60px;border-radius:8px;overflow:hidden;flex-shrink:0;';
        thumb.innerHTML = '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;">';
        container.appendChild(thumb);
      }
    } catch (e) {
      console.warn('[drawing-pin] 写真読込エラー:', dpPhotoSelection[i], e);
    }
  }
}

// === ユーティリティ ===
function dpRevokePhotoUrls() {
  dpPhotoUrls.forEach(function(u) { URL.revokeObjectURL(u); });
  dpPhotoUrls = [];
}

function dpCleanup() {
  var panel = document.getElementById('dpPinListPanel');
  if (panel) panel.remove();
  var overlay = document.getElementById('dpPinOverlay');
  if (overlay) overlay.remove();
  dpCloseModal();
  dpRevokePhotoUrls();
}

// === グローバル公開 ===
window.initDrawingPins = initDrawingPins;
window.dpCleanup = dpCleanup;

console.log('[drawing-pin.js] v8.3.0 Phase8 Step3 ピン立て機能モジュール読み込み完了');
