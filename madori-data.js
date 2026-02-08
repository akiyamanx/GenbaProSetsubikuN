// ==========================================
// 間取りエディタ — データ永続化・外部連携
// 現場Pro 設備くん Phase4
//
// このファイルは間取りエディタのデータ管理と外部連携を担当する。
// IDB保存/読込/一覧、Undo/Redo、Web Bluetooth距離計連携、
// AI部品提案(Gemini API)、PDF出力を行う。
//
// 依存: madori-core.js, madori-tools.js, idb-storage.js, globals.js
// ==========================================

// === Undo/Redo ===
var MAX_UNDO = 30;

function pushUndo() {
  var st = window._madoriState;
  st.undoStack.push(JSON.stringify(st.objects));
  if (st.undoStack.length > MAX_UNDO) st.undoStack.shift();
  st.redoStack = [];
}

function undoMadori() {
  var st = window._madoriState;
  if (st.undoStack.length === 0) return;
  st.redoStack.push(JSON.stringify(st.objects));
  st.objects = JSON.parse(st.undoStack.pop());
  st.selectedId = null;
  updateSelectionBar();
  renderMadoriCanvas();
}

function redoMadori() {
  var st = window._madoriState;
  if (st.redoStack.length === 0) return;
  st.undoStack.push(JSON.stringify(st.objects));
  st.objects = JSON.parse(st.redoStack.pop());
  st.selectedId = null;
  updateSelectionBar();
  renderMadoriCanvas();
}

// === IDB保存 ===
async function saveMadoriCurrent() {
  var st = window._madoriState;
  if (!st.currentMadoriId) {
    createNewMadori();
    return;
  }
  try {
    var record = await getMadoriRecord(st.currentMadoriId);
    if (!record) { alert('保存先が見つかりません'); return; }
    record.canvasData = {
      version: 1,
      viewport: Object.assign({}, st.viewport),
      gridSize: st.gridSize,
      pixelsPerMm: st.pixelsPerMm,
      objects: st.objects
    };
    // サムネイル生成
    var thumbData = generateMadoriThumbnail();
    if (thumbData) {
      await saveImageToIDB('madori_thumb_' + record.id, thumbData);
      record.thumbnailRef = 'madori_thumb_' + record.id;
    }
    await saveMadoriRecord(record);
    alert('保存しました');
  } catch (e) {
    console.error('[Madori] 保存エラー:', e);
    alert('保存に失敗しました: ' + e.message);
  }
}

function generateMadoriThumbnail() {
  try {
    var canvas = document.getElementById('madoriCanvas');
    if (!canvas) return null;
    var thumb = document.createElement('canvas');
    thumb.width = 400;
    thumb.height = 300;
    var tc = thumb.getContext('2d');
    tc.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, 400, 300);
    return thumb.toDataURL('image/png');
  } catch (e) { return null; }
}

// === IDB読込 ===
async function loadMadoriFromIDB(id) {
  try {
    var record = await getMadoriRecord(id);
    if (!record) { alert('データが見つかりません'); return; }
    var st = window._madoriState;
    st.currentMadoriId = record.id;
    st.currentGenbaId = record.genbaId || null;
    if (record.canvasData) {
      st.objects = record.canvasData.objects || [];
      st.viewport = record.canvasData.viewport || { offsetX: 50, offsetY: 50, scale: 1 };
      st.gridSize = record.canvasData.gridSize || 100;
      st.pixelsPerMm = record.canvasData.pixelsPerMm || 2;
    } else {
      st.objects = [];
      st.viewport = { offsetX: 50, offsetY: 50, scale: 1 };
    }
    st.selectedId = null;
    st.undoStack = [];
    st.redoStack = [];
    updateSelectionBar();
    renderMadoriCanvas();
  } catch (e) {
    console.error('[Madori] 読込エラー:', e);
    alert('読込に失敗しました');
  }
}

// === 間取り一覧 ===
async function showMadoriList() {
  var modal = document.getElementById('madoriListModal');
  if (modal) modal.style.display = 'flex';
  // 現場フィルタ
  var sel = document.getElementById('madoriListGenbaFilter');
  if (sel && typeof getAllGenba === 'function') {
    var genbaList = await getAllGenba();
    sel.innerHTML = '<option value="">すべての現場</option>';
    genbaList.forEach(function(g) {
      sel.innerHTML += '<option value="' + escapeHtml(g.id) + '">' + escapeHtml(g.name) + '</option>';
    });
  }
  await loadMadoriList();
}

async function loadMadoriList() {
  var content = document.getElementById('madoriListContent');
  if (!content) return;
  content.innerHTML = '<div style="text-align:center; color:#9ca3af; padding:20px;">読み込み中...</div>';

  try {
    var filterGenba = document.getElementById('madoriListGenbaFilter');
    var genbaId = filterGenba ? filterGenba.value : '';
    var list = genbaId ? await getMadoriByGenba(genbaId) : await getAllMadoriRecords();

    if (list.length === 0) {
      content.innerHTML = '<div style="text-align:center; color:#9ca3af; padding:30px;">間取りデータがありません</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      var date = m.updatedAt ? m.updatedAt.substring(0, 10) : '';
      var thumbImg = '';
      if (m.thumbnailRef) {
        try { var td = await getImageFromIDB(m.thumbnailRef); if (td) thumbImg = td; } catch(e) {}
      }
      html += '<div onclick="selectMadoriFromList(\'' + escapeHtml(m.id) + '\')" style="display:flex; gap:12px; align-items:center; padding:12px; background:white; border-radius:10px; margin-bottom:8px; cursor:pointer; border:1px solid #e5e7eb;">';
      if (thumbImg) {
        html += '<img src="' + thumbImg + '" style="width:60px; height:45px; object-fit:cover; border-radius:6px; flex-shrink:0; border:1px solid #e5e7eb;">';
      } else {
        html += '<div style="width:60px; height:45px; background:#f1f5f9; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0;">📐</div>';
      }
      html += '<div style="flex:1; min-width:0;">';
      html += '<div style="font-size:14px; font-weight:bold; color:#1f2937; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(m.name || '無題') + '</div>';
      html += '<div style="font-size:11px; color:#9ca3af;">' + escapeHtml(m.floor || '') + ' ・ ' + date + '</div>';
      html += '</div>';
      html += '<button onclick="event.stopPropagation(); confirmDeleteMadori(\'' + escapeHtml(m.id) + '\')" style="background:none; border:none; font-size:18px; color:#ef4444; cursor:pointer;">🗑</button>';
      html += '</div>';
    }
    content.innerHTML = html;
  } catch (e) {
    content.innerHTML = '<div style="text-align:center; color:#ef4444; padding:20px;">読込エラー</div>';
  }
}

async function selectMadoriFromList(id) {
  closeMadoriListModal();
  await loadMadoriFromIDB(id);
}

function closeMadoriListModal() {
  var modal = document.getElementById('madoriListModal');
  if (modal) modal.style.display = 'none';
}

// === 新規作成 ===
async function createNewMadori() {
  closeMadoriListModal();
  var modal = document.getElementById('madoriNewModal');
  if (modal) modal.style.display = 'flex';
  // 現場リスト
  var sel = document.getElementById('madoriNewGenba');
  if (sel && typeof getAllGenba === 'function') {
    var genbaList = await getAllGenba();
    sel.innerHTML = '<option value="">未選択</option>';
    genbaList.forEach(function(g) {
      sel.innerHTML += '<option value="' + escapeHtml(g.id) + '">' + escapeHtml(g.name) + '</option>';
    });
  }
}

async function confirmNewMadori() {
  var name = document.getElementById('madoriNewName');
  var floor = document.getElementById('madoriNewFloor');
  var genba = document.getElementById('madoriNewGenba');
  var nameVal = name ? name.value.trim() : '';
  if (!nameVal) { alert('図面名を入力してください'); return; }

  var record = {
    name: nameVal,
    floor: floor ? floor.value : '1F',
    genbaId: genba ? genba.value : '',
    canvasData: {
      version: 1,
      viewport: { offsetX: 50, offsetY: 50, scale: 1 },
      gridSize: 100,
      pixelsPerMm: 2,
      objects: []
    },
    thumbnailRef: ''
  };
  var saved = await saveMadoriRecord(record);
  if (saved) {
    closeMadoriNewModal();
    var st = window._madoriState;
    st.currentMadoriId = saved.id;
    st.currentGenbaId = saved.genbaId;
    st.objects = [];
    st.viewport = { offsetX: 50, offsetY: 50, scale: 1 };
    st.undoStack = [];
    st.redoStack = [];
    st.selectedId = null;
    renderMadoriCanvas();
  }
}

function closeMadoriNewModal() {
  var modal = document.getElementById('madoriNewModal');
  if (modal) modal.style.display = 'none';
}

async function confirmDeleteMadori(id) {
  if (!confirm('この間取りを削除しますか？')) return;
  await deleteMadoriRecord(id);
  var st = window._madoriState;
  if (st.currentMadoriId === id) {
    st.currentMadoriId = null;
    st.objects = [];
    renderMadoriCanvas();
  }
  await loadMadoriList();
}

// === メニュー ===
function showMadoriMenu() {
  var modal = document.getElementById('madoriMenuModal');
  if (modal) modal.style.display = 'flex';
}
function closeMadoriMenu() {
  var modal = document.getElementById('madoriMenuModal');
  if (modal) modal.style.display = 'none';
}

// === Web Bluetooth距離計 ===
async function connectBluetoothMeter() {
  closeMadoriMenu();
  if (!navigator.bluetooth) {
    alert('このブラウザはBluetoothに対応していません。\n寸法は手動入力してください。');
    return;
  }
  try {
    var device = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: 'GLM' },
        { namePrefix: 'BOSCH' },
        { namePrefix: 'Leica' },
        { namePrefix: 'DISTO' }
      ],
      optionalServices: ['00005301-0000-0041-5253-534f42000000']
    });
    var server = await device.gatt.connect();
    var service = await server.getPrimaryService('00005301-0000-0041-5253-534f42000000');
    var chars = await service.getCharacteristics();
    if (chars.length > 0) {
      var ch = chars[0];
      await ch.startNotifications();
      ch.addEventListener('characteristicvaluechanged', onBluetoothMeasurement);
      window._madoriState.btDevice = device;
      window._madoriState.btCharacteristic = ch;
    }
    updateBtBadge(true);
    alert('Bluetooth距離計に接続しました');
  } catch (e) {
    if (e.name !== 'NotFoundError') {
      alert('Bluetooth接続に失敗しました。\n手動入力をご利用ください。');
    }
    console.error('[Madori] BT接続エラー:', e);
  }
}

function updateBtBadge(connected) {
  var badge = document.getElementById('madoriBtBadge');
  if (badge) {
    badge.style.display = connected ? 'flex' : 'none';
  }
}

function onBluetoothMeasurement(event) {
  try {
    var val = event.target.value;
    var meters = val.getFloat32(0, true);
    var mm = Math.round(meters * 1000);
    console.log('[Madori] BT測定値:', mm, 'mm');
    // 寸法入力モーダルが開いていれば自動入力
    var dimInput = document.getElementById('dimValueInput');
    var dimModal = document.getElementById('madoriDimInputModal');
    if (dimModal && dimModal.style.display === 'flex' && dimInput) {
      dimInput.value = mm;
      return;
    }
    // 寸法ツール使用中なら自動で寸法線作成
    var st = window._madoriState;
    if (st.mode === 'dimension' && st._dimStart) {
      var dx = mm, dy = 0;
      addMadoriObject({type:'dimension', x:st._dimStart.x, y:st._dimStart.y, x2:st._dimStart.x + dx, y2:st._dimStart.y + dy, value:mm, source:'bluetooth'});
      st._dimStart = null;
      renderMadoriCanvas();
      return;
    }
    alert('測定値: ' + mm + 'mm');
  } catch (e) {
    console.error('[Madori] BT測定値解析エラー:', e);
  }
}

function disconnectBluetoothMeter() {
  var st = window._madoriState;
  try {
    if (st.btDevice && st.btDevice.gatt && st.btDevice.gatt.connected) {
      st.btDevice.gatt.disconnect();
    }
  } catch(e) { console.error('[Madori] BT切断エラー:', e); }
  st.btDevice = null;
  st.btCharacteristic = null;
  updateBtBadge(false);
}

// === AI部品提案 ===
async function suggestPartsWithAI() {
  closeMadoriMenu();
  var settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  var apiKey = settings.geminiApiKey;
  if (!apiKey) {
    alert('Gemini APIキーが必要です。\n設定画面から入力してください。');
    return;
  }
  if (typeof canUseApi === 'function') {
    var apiCheck = canUseApi();
    if (!apiCheck.allowed) { alert(apiCheck.reason); return; }
  }
  var st = window._madoriState;
  var pipes = st.objects.filter(function(o) { return o.type === 'pipe'; });
  var equips = st.objects.filter(function(o) { return o.type === 'equipment'; });
  var rooms = st.objects.filter(function(o) { return o.type === 'room'; });
  if (pipes.length === 0 && equips.length === 0) {
    alert('配管または設備を配置してからAI提案を実行してください。');
    return;
  }

  var loading = document.getElementById('madoriAiLoading');
  if (loading) loading.style.display = 'flex';

  var desc = '【部屋】\n';
  rooms.forEach(function(r) { desc += '- ' + r.label + ' (' + r.width + '×' + r.height + 'mm)\n'; });
  desc += '\n【設備】\n';
  equips.forEach(function(eq) { desc += '- ' + (eq.label || eq.equipType) + '\n'; });
  desc += '\n【配管】\n';
  pipes.forEach(function(p) {
    var len = 0;
    for (var i = 1; i < p.points.length; i++) {
      var dx = p.points[i].x - p.points[i-1].x;
      var dy = p.points[i].y - p.points[i-1].y;
      len += Math.sqrt(dx*dx + dy*dy);
    }
    desc += '- ' + PIPE_LABELS[p.pipeType] + ': 約' + Math.round(len) + 'mm (' + p.points.length + '点)\n';
  });

  var prompt = '以下の設備配管図面から必要な部材リストを提案してください。\n\n' + desc +
    '\nJSON形式で返してください:\n{"parts":[{"name":"部品名","spec":"規格","quantity":数量,"unit":"単位","note":"備考"}],"summary":"概要"}';

  try {
    var res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
        })
      }
    );
    if (!res.ok) throw new Error('API Error: ' + res.status);
    if (typeof recordApiUsage === 'function') recordApiUsage();
    var data = await res.json();
    var text = data.candidates[0].content.parts[0].text;
    var match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON解析失敗');
    var result = JSON.parse(match[0]);
    showAiPartsResult(result);
  } catch (e) {
    console.error('[Madori] AI提案エラー:', e);
    alert('AI提案に失敗しました: ' + e.message);
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

function showAiPartsResult(result) {
  var content = document.getElementById('madoriAiResultContent');
  if (!content) return;
  var html = '';
  if (result.summary) html += '<p style="font-size:13px; color:#6b7280; margin:0 0 12px;">' + escapeHtml(result.summary) + '</p>';
  if (result.parts && result.parts.length > 0) {
    html += '<table style="width:100%; border-collapse:collapse; font-size:12px;">';
    html += '<tr style="background:#f1f5f9;"><th style="padding:6px; text-align:left;">部品</th><th>規格</th><th>数量</th><th>備考</th></tr>';
    result.parts.forEach(function(p) {
      html += '<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:6px;">' + escapeHtml(p.name) + '</td>';
      html += '<td style="padding:6px;">' + escapeHtml(p.spec || '') + '</td>';
      html += '<td style="padding:6px; text-align:center;">' + (p.quantity || '') + (p.unit || '') + '</td>';
      html += '<td style="padding:6px; font-size:11px; color:#6b7280;">' + escapeHtml(p.note || '') + '</td></tr>';
    });
    html += '</table>';
  }
  content.innerHTML = html;
  var modal = document.getElementById('madoriAiResultModal');
  if (modal) modal.style.display = 'flex';
}

function closeMadoriAiResult() {
  var modal = document.getElementById('madoriAiResultModal');
  if (modal) modal.style.display = 'none';
}

// === PDF出力 ===
function generateHiResCanvas() {
  var st = window._madoriState;
  var b = {x:Infinity,y:Infinity,x2:-Infinity,y2:-Infinity};
  st.objects.forEach(function(o) {
    var ob = getObjectBounds(o); if (!ob) return;
    if (ob.x < b.x) b.x = ob.x;
    if (ob.y < b.y) b.y = ob.y;
    if (ob.x+ob.w > b.x2) b.x2 = ob.x+ob.w;
    if (ob.y+ob.h > b.y2) b.y2 = ob.y+ob.h;
  });
  var margin = 500;
  b.x -= margin; b.y -= margin; b.x2 += margin; b.y2 += margin;
  var ppmm = 3; // 3px/mm for hi-res
  var cw = (b.x2 - b.x) * ppmm, ch = (b.y2 - b.y) * ppmm;
  var maxPx = 4000;
  if (cw > maxPx || ch > maxPx) { var s = maxPx / Math.max(cw, ch); cw *= s; ch *= s; ppmm *= s; }
  var c = document.createElement('canvas');
  c.width = Math.round(cw); c.height = Math.round(ch);
  var ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  // Render with custom viewport
  var origVp = st.viewport, origPpmm = st.pixelsPerMm, origCanvas = _madoriCanvas, origCtx = _madoriCtx;
  st.viewport = { offsetX: -b.x * ppmm, offsetY: -b.y * ppmm, scale: 1 };
  st.pixelsPerMm = ppmm;
  _madoriCanvas = c; _madoriCtx = ctx;
  var order = ['room','wall','pipe','door','window','equipment','dimension'];
  order.forEach(function(type) {
    st.objects.forEach(function(obj) {
      if (obj.type === type) renderMadoriObject(ctx, obj);
    });
  });
  st.viewport = origVp; st.pixelsPerMm = origPpmm;
  _madoriCanvas = origCanvas; _madoriCtx = origCtx;
  return c.toDataURL('image/png');
}

async function exportMadoriPDF() {
  closeMadoriMenu();
  var st = window._madoriState;
  if (st.objects.length === 0) { alert('図面にオブジェクトがありません'); return; }

  try {
    var imgData = generateHiResCanvas();
    var record = st.currentMadoriId ? await getMadoriRecord(st.currentMadoriId) : null;
    var genba = st.currentGenbaId ? await getGenba(st.currentGenbaId) : null;

    var equips = st.objects.filter(function(o){return o.type==='equipment';});
    var pipes = st.objects.filter(function(o){return o.type==='pipe';});

    var htmlStr = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
    htmlStr += '<title>間取り図</title>';
    htmlStr += '<style>@page{size:A4 landscape;margin:10mm;}body{font-family:"Hiragino Sans","Noto Sans JP",sans-serif;margin:0;padding:16px;font-size:12px;}';
    htmlStr += 'table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px;}th,td{padding:4px 6px;border:1px solid #d1d5db;text-align:left;}th{background:#f1f5f9;font-weight:bold;}';
    htmlStr += '.no-print{display:none;}@media print{.no-print{display:none!important;}-webkit-print-color-adjust:exact;print-color-adjust:exact;}</style></head><body>';
    htmlStr += '<div style="text-align:center; margin-bottom:8px;">';
    htmlStr += '<h2 style="margin:0; font-size:18px;">' + escapeHtml(record ? record.name : '間取り図') + '</h2>';
    if (genba) htmlStr += '<div style="font-size:12px; color:#666;">現場: ' + escapeHtml(genba.name) + '</div>';
    htmlStr += '<div style="font-size:10px; color:#999;">' + new Date().toLocaleDateString('ja-JP') + '</div>';
    htmlStr += '</div>';
    htmlStr += '<div style="text-align:center;"><img src="' + imgData + '" style="max-width:100%; max-height:55vh; border:1px solid #ddd;"></div>';
    // 凡例
    htmlStr += '<div style="margin:8px 0; display:flex; gap:16px; justify-content:center; font-size:11px;">';
    htmlStr += '<span><span style="display:inline-block;width:14px;height:3px;background:#3b82f6;vertical-align:middle;margin-right:3px;"></span>給水</span>';
    htmlStr += '<span><span style="display:inline-block;width:14px;height:3px;background:#6b7280;vertical-align:middle;margin-right:3px;"></span>排水</span>';
    htmlStr += '<span><span style="display:inline-block;width:14px;height:3px;background:#ef4444;vertical-align:middle;margin-right:3px;"></span>給湯</span>';
    htmlStr += '<span><span style="display:inline-block;width:14px;height:3px;background:#eab308;vertical-align:middle;margin-right:3px;"></span>ガス</span>';
    htmlStr += '</div>';
    // 設備リスト
    if (equips.length > 0) {
      htmlStr += '<h4 style="margin:8px 0 4px; font-size:13px;">設備一覧</h4><table><tr><th>種類</th><th>幅(mm)</th><th>奥行(mm)</th></tr>';
      equips.forEach(function(eq){
        var info=EQUIP_SIZES[eq.equipType]||{w:500,h:500,label:'?'};
        htmlStr+='<tr><td>'+escapeHtml(eq.label||info.label)+'</td><td>'+(eq.customW||info.w)+'</td><td>'+(eq.customH||info.h)+'</td></tr>';
      });
      htmlStr += '</table>';
    }
    // 配管リスト
    if (pipes.length > 0) {
      htmlStr += '<h4 style="margin:8px 0 4px; font-size:13px;">配管一覧</h4><table><tr><th>用途</th><th>種類</th><th>径</th><th>長さ</th></tr>';
      pipes.forEach(function(p){
        var pLen=0;
        if(p.points){for(var i=1;i<p.points.length;i++){var dx=p.points[i].x-p.points[i-1].x,dy=p.points[i].y-p.points[i-1].y;pLen+=Math.sqrt(dx*dx+dy*dy);}}
        htmlStr+='<tr><td>'+escapeHtml(PIPE_LABELS[p.pipeType]||'-')+'</td><td>'+escapeHtml(p.pipeMaterial||'-')+'</td><td>'+escapeHtml(p.pipeDiameter||'-')+'</td><td>'+Math.round(pLen)+'mm</td></tr>';
      });
      htmlStr += '</table>';
    }
    htmlStr += '<button class="no-print" onclick="window.print()" style="margin:16px auto; display:block; padding:12px 30px; background:#3b82f6; color:white; border:none; border-radius:8px; font-size:14px; cursor:pointer;">印刷 / PDF保存</button>';
    htmlStr += '</body></html>';

    var w = window.open('', '_blank');
    if (!w) { alert('ポップアップがブロックされました'); return; }
    w.document.write(htmlStr);
    w.document.close();
  } catch (e) {
    console.error('[Madori] PDF出力エラー:', e);
    alert('PDF出力に失敗しました: ' + e.message);
  }
}

// === グローバル公開 ===
window.pushUndo = pushUndo;
window.undoMadori = undoMadori;
window.redoMadori = redoMadori;
window.saveMadoriCurrent = saveMadoriCurrent;
window.loadMadoriFromIDB = loadMadoriFromIDB;
window.showMadoriList = showMadoriList;
window.loadMadoriList = loadMadoriList;
window.selectMadoriFromList = selectMadoriFromList;
window.closeMadoriListModal = closeMadoriListModal;
window.createNewMadori = createNewMadori;
window.confirmNewMadori = confirmNewMadori;
window.closeMadoriNewModal = closeMadoriNewModal;
window.confirmDeleteMadori = confirmDeleteMadori;
window.showMadoriMenu = showMadoriMenu;
window.closeMadoriMenu = closeMadoriMenu;
window.connectBluetoothMeter = connectBluetoothMeter;
window.disconnectBluetoothMeter = disconnectBluetoothMeter;
window.suggestPartsWithAI = suggestPartsWithAI;
window.closeMadoriAiResult = closeMadoriAiResult;
window.exportMadoriPDF = exportMadoriPDF;

console.log('[madori-data.js] ✓ 間取りデータ・連携 読み込み完了');
