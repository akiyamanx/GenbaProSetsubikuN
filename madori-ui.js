// ==========================================
// 間取りエディタ — UI / プロパティ編集 (現場Pro 設備くん Phase4)
// オブジェクトプロパティ編集パネル、ドアタイプ選択、
// 寸法値入力、リサイズハンドル操作
// 依存: madori-core.js, madori-tools.js → 後続: madori-data.js
// ==========================================

// === 配管の径・種類定義 ===
var PIPE_DIAMETERS = [
  {id:'13A',label:'13A'},{id:'20A',label:'20A'},{id:'25A',label:'25A'},
  {id:'30A',label:'30A'},{id:'40A',label:'40A'},{id:'50A',label:'50A'},
  {id:'75A',label:'75A'},{id:'100A',label:'100A'}
];
var PIPE_MATERIALS = [
  {id:'VP',label:'VP'},{id:'VU',label:'VU'},{id:'HIVP',label:'HIVP'},
  {id:'銅管',label:'銅管'},{id:'ポリ管',label:'ポリ管'},
  {id:'架橋ポリ',label:'架橋ポリ'},{id:'SUS管',label:'SUS管'}
];
window.PIPE_DIAMETERS = PIPE_DIAMETERS;
window.PIPE_MATERIALS = PIPE_MATERIALS;

// === ドアタイプ選択 ===
var _pendingDoorPos = null;
var DOOR_TYPES = [
  { id:'hinged-left', label:'左開き' },
  { id:'hinged-right', label:'右開き' },
  { id:'sliding-single', label:'片引き戸' },
  { id:'sliding-double', label:'両引き戸' }
];

function showDoorTypePicker(wx, wy) {
  _pendingDoorPos = { x:wx, y:wy };
  var m = document.getElementById('madoriDoorTypePicker');
  if (m) m.style.display = 'flex';
}

function closeDoorTypePicker() {
  var m = document.getElementById('madoriDoorTypePicker');
  if (m) m.style.display = 'none';
  _pendingDoorPos = null;
}

function selectDoorTypeAndPlace(doorStyle) {
  if (!_pendingDoorPos) return;
  addMadoriObject({
    type:'door', x:_pendingDoorPos.x, y:_pendingDoorPos.y,
    width:800, doorStyle:doorStyle, angle:0
  });
  closeDoorTypePicker();
}

// === プロパティ編集パネル ===
function showMadoriPropertyPanel() {
  var st = window._madoriState;
  if (!st.selectedId) return;
  var obj = getObjectById(st.selectedId);
  if (!obj) return;
  var panel = document.getElementById('madoriPropertyPanel');
  var content = document.getElementById('madoriPropContent');
  if (!panel || !content) return;

  var html = '';
  if (obj.type === 'room') {
    html += _propInput('propRoomW', '幅 (mm)', Math.round(obj.width), 100, 99999, 50);
    html += _propInput('propRoomH', '高さ (mm)', Math.round(obj.height), 100, 99999, 50);
    html += _propInput('propAngle', '回転角度', obj.angle||0, 0, 359, 1);
  } else if (obj.type === 'door') {
    html += _propInput('propDoorW', '幅 (mm)', obj.width||800, 300, 3000, 50);
    html += _propSelect('propDoorStyle', 'タイプ', DOOR_TYPES, obj.doorStyle||'hinged-right');
    html += _propInput('propAngle', '回転角度', obj.angle||0, 0, 359, 1);
  } else if (obj.type === 'window') {
    html += _propInput('propWinW', '幅 (mm)', obj.width||900, 300, 5000, 50);
    html += _propInput('propAngle', '回転角度', obj.angle||0, 0, 359, 1);
  } else if (obj.type === 'equipment') {
    var eqInfo = EQUIP_SIZES[obj.equipType] || {w:500, h:500};
    html += _propInput('propEqW', '幅 (mm)', obj.customW || eqInfo.w, 50, 9999, 50);
    html += _propInput('propEqH', '奥行き (mm)', obj.customH || eqInfo.h, 50, 9999, 50);
    html += _propInput('propAngle', '回転角度', obj.angle||0, 0, 359, 1);
  } else if (obj.type === 'dimension') {
    html += _propInput('propDimVal', '寸法値 (mm)', obj.value||0, 0, 999999, 1);
  } else if (obj.type === 'wall') {
    var wallLen = Math.round(Math.sqrt(Math.pow(obj.x2 - obj.x, 2) + Math.pow(obj.y2 - obj.y, 2)));
    html += _propInput('propWallLen', '長さ (mm)', wallLen, 100, 99999, 50);
    html += _propInput('propWallThick', '壁厚 (mm)', obj.thickness||120, 50, 500, 10);
  } else if (obj.type === 'pipe') {
    var pLen = 0;
    if (obj.points) {
      for (var pi = 1; pi < obj.points.length; pi++) {
        var pdx = obj.points[pi].x - obj.points[pi-1].x;
        var pdy = obj.points[pi].y - obj.points[pi-1].y;
        pLen += Math.sqrt(pdx * pdx + pdy * pdy);
      }
    }
    var pipeUseOpts = Object.keys(PIPE_LABELS).map(function(k){return {id:k,label:PIPE_LABELS[k]};});
    html += _propSelect('propPipeUse', '用途', pipeUseOpts, obj.pipeType||'water');
    html += _propInput('propPipeLen', '長さ (mm)', Math.round(pLen), 100, 999999, 50);
    html += _propSelect('propPipeDia', '配管径', PIPE_DIAMETERS, obj.pipeDiameter||'20A');
    html += _propSelect('propPipeMat', '配管種類', PIPE_MATERIALS, obj.pipeMaterial||'');
  }
  content.innerHTML = html;
  panel.style.display = 'flex';
}

function _propInput(id, label, val, min, max, step) {
  return '<div class="madori-prop-group"><label>' + label + '</label>' +
    '<input type="number" id="' + id + '" value="' + val + '" min="' + min + '" max="' + max + '" step="' + step + '"></div>';
}

function _propSelect(id, label, opts, current) {
  var html = '<div class="madori-prop-group"><label>' + label + '</label><select id="' + id + '">';
  opts.forEach(function(o) {
    html += '<option value="' + o.id + '"' + (current===o.id ? ' selected' : '') + '>' + o.label + '</option>';
  });
  return html + '</select></div>';
}

function closeMadoriPropertyPanel() {
  var panel = document.getElementById('madoriPropertyPanel');
  if (panel) panel.style.display = 'none';
}

function applyMadoriProperty() {
  var st = window._madoriState;
  if (!st.selectedId) { closeMadoriPropertyPanel(); return; }
  var obj = getObjectById(st.selectedId);
  if (!obj) { closeMadoriPropertyPanel(); return; }
  if (typeof pushUndo === 'function') pushUndo();

  var el;
  if (obj.type === 'room') {
    el = document.getElementById('propRoomW');
    if (el) obj.width = Math.max(100, parseInt(el.value)||obj.width);
    el = document.getElementById('propRoomH');
    if (el) obj.height = Math.max(100, parseInt(el.value)||obj.height);
    el = document.getElementById('propAngle');
    if (el) obj.angle = (parseInt(el.value)||0) % 360;
  } else if (obj.type === 'door') {
    el = document.getElementById('propDoorW');
    if (el) obj.width = Math.max(300, parseInt(el.value)||obj.width);
    el = document.getElementById('propDoorStyle');
    if (el) obj.doorStyle = el.value;
    el = document.getElementById('propAngle');
    if (el) obj.angle = (parseInt(el.value)||0) % 360;
  } else if (obj.type === 'window') {
    el = document.getElementById('propWinW');
    if (el) obj.width = Math.max(300, parseInt(el.value)||obj.width);
    el = document.getElementById('propAngle');
    if (el) obj.angle = (parseInt(el.value)||0) % 360;
  } else if (obj.type === 'equipment') {
    el = document.getElementById('propEqW');
    if (el) obj.customW = Math.max(50, parseInt(el.value)||0);
    el = document.getElementById('propEqH');
    if (el) obj.customH = Math.max(50, parseInt(el.value)||0);
    el = document.getElementById('propAngle');
    if (el) obj.angle = (parseInt(el.value)||0) % 360;
  } else if (obj.type === 'dimension') {
    el = document.getElementById('propDimVal');
    if (el) {
      var newVal = Math.max(0, parseInt(el.value)||0);
      if (newVal > 0) {
        var ddx = obj.x2 - obj.x, ddy = obj.y2 - obj.y;
        var cLen = Math.sqrt(ddx * ddx + ddy * ddy);
        if (cLen > 0) {
          var r = newVal / cLen;
          obj.x2 = obj.x + ddx * r;
          obj.y2 = obj.y + ddy * r;
        }
      }
      obj.value = newVal;
    }
  } else if (obj.type === 'wall') {
    el = document.getElementById('propWallLen');
    if (el) {
      var newWLen = Math.max(100, parseInt(el.value)||0);
      var wdx = obj.x2 - obj.x, wdy = obj.y2 - obj.y;
      var curWLen = Math.sqrt(wdx * wdx + wdy * wdy);
      if (curWLen > 0 && newWLen > 0) {
        var wr = newWLen / curWLen;
        obj.x2 = obj.x + wdx * wr;
        obj.y2 = obj.y + wdy * wr;
      }
    }
    el = document.getElementById('propWallThick');
    if (el) obj.thickness = Math.max(50, parseInt(el.value)||obj.thickness);
  } else if (obj.type === 'pipe') {
    el = document.getElementById('propPipeLen');
    if (el && obj.points && obj.points.length >= 2) {
      var newPLen = Math.max(100, parseInt(el.value)||0);
      var curPLen = 0;
      for (var pi = 1; pi < obj.points.length; pi++) {
        var pdx = obj.points[pi].x - obj.points[pi-1].x;
        var pdy = obj.points[pi].y - obj.points[pi-1].y;
        curPLen += Math.sqrt(pdx * pdx + pdy * pdy);
      }
      if (curPLen > 0 && Math.round(curPLen) !== newPLen) {
        var pr = newPLen / curPLen;
        var bx = obj.points[0].x, by = obj.points[0].y;
        for (var pi = 1; pi < obj.points.length; pi++) {
          obj.points[pi].x = bx + (obj.points[pi].x - bx) * pr;
          obj.points[pi].y = by + (obj.points[pi].y - by) * pr;
        }
      }
    }
    el = document.getElementById('propPipeUse');
    if (el) obj.pipeType = el.value;
    el = document.getElementById('propPipeDia');
    if (el) obj.pipeDiameter = el.value;
    el = document.getElementById('propPipeMat');
    if (el) obj.pipeMaterial = el.value;
  }
  closeMadoriPropertyPanel();
  renderMadoriCanvas();
}

// === リサイズハンドル ===
function hitTestResizeHandle(wx, wy) {
  var st = window._madoriState;
  if (!st.selectedId) return null;
  var obj = getObjectById(st.selectedId);
  if (!obj || obj.type !== 'room') return null;
  var b = getObjectBounds(obj);
  if (!b) return null;
  var corners = [
    { handle:'tl', x:b.x, y:b.y },
    { handle:'tr', x:b.x+b.w, y:b.y },
    { handle:'bl', x:b.x, y:b.y+b.h },
    { handle:'br', x:b.x+b.w, y:b.y+b.h }
  ];
  var threshold = 80 / (st.viewport.scale * st.pixelsPerMm);
  for (var i = 0; i < corners.length; i++) {
    var c = corners[i];
    var dx = wx - c.x, dy = wy - c.y;
    if (Math.sqrt(dx*dx + dy*dy) < threshold) return c;
  }
  return null;
}

// === 寸法値直接入力 ===
var _pendingDimObj = null;

function showDimValueInput(dimObj) {
  _pendingDimObj = dimObj;
  var m = document.getElementById('madoriDimInputModal');
  var inp = document.getElementById('dimValueInput');
  if (!m || !inp) return;
  inp.value = dimObj.value || '';
  m.style.display = 'flex';
  setTimeout(function() { inp.focus(); inp.select(); }, 100);
}

function closeDimValueInput() {
  var m = document.getElementById('madoriDimInputModal');
  if (m) m.style.display = 'none';
  _pendingDimObj = null;
}

function applyDimValue() {
  var inp = document.getElementById('dimValueInput');
  if (_pendingDimObj && inp) {
    var val = parseInt(inp.value);
    if (!isNaN(val) && val > 0) {
      // 寸法値に連動して線の長さも更新
      var dx = _pendingDimObj.x2 - _pendingDimObj.x;
      var dy = _pendingDimObj.y2 - _pendingDimObj.y;
      var curLen = Math.sqrt(dx * dx + dy * dy);
      if (curLen > 0) {
        var ratio = val / curLen;
        _pendingDimObj.x2 = _pendingDimObj.x + dx * ratio;
        _pendingDimObj.y2 = _pendingDimObj.y + dy * ratio;
      }
      _pendingDimObj.value = val;
      renderMadoriCanvas();
    }
  }
  closeDimValueInput();
}

// === 部材リスト表示 ===
function showPartsList() {
  closeMadoriMenu();
  var st = window._madoriState;
  var rooms = [], walls = [], doors = [], windows = [], equips = [], pipes = [], dims = [];
  st.objects.forEach(function(o) {
    if (o.type === 'room') rooms.push(o);
    else if (o.type === 'wall') walls.push(o);
    else if (o.type === 'door') doors.push(o);
    else if (o.type === 'window') windows.push(o);
    else if (o.type === 'equipment') equips.push(o);
    else if (o.type === 'pipe') pipes.push(o);
    else if (o.type === 'dimension') dims.push(o);
  });
  var html = '';
  // 部屋一覧
  html += _partsSection('🏠 部屋一覧', rooms.length);
  if (rooms.length > 0) {
    html += '<table class="madori-parts-tbl"><tr><th>名前</th><th>幅</th><th>高さ</th></tr>';
    rooms.forEach(function(r) {
      html += '<tr><td>' + escapeHtml(r.label || '部屋') + '</td>';
      html += '<td>' + _fmtMm(r.width) + '</td><td>' + _fmtMm(r.height) + '</td></tr>';
    });
    html += '</table>';
  }
  // 建具一覧（ドア＋窓）
  html += _partsSection('🚪 建具一覧', doors.length + windows.length);
  if (doors.length > 0 || windows.length > 0) {
    html += '<table class="madori-parts-tbl"><tr><th>種類</th><th>タイプ</th><th>幅</th></tr>';
    doors.forEach(function(d) {
      var dt = DOOR_TYPES.find(function(t){return t.id===d.doorStyle;});
      html += '<tr><td>ドア</td><td>' + (dt ? escapeHtml(dt.label) : '-') + '</td>';
      html += '<td>' + _fmtMm(d.width || 800) + '</td></tr>';
    });
    windows.forEach(function(w) {
      html += '<tr><td>窓</td><td>-</td><td>' + _fmtMm(w.width || 900) + '</td></tr>';
    });
    html += '</table>';
  }
  // 設備一覧
  html += _partsSection('🔧 設備一覧', equips.length);
  if (equips.length > 0) {
    html += '<table class="madori-parts-tbl"><tr><th>種類</th><th>幅</th><th>奥行き</th></tr>';
    equips.forEach(function(eq) {
      var info = EQUIP_SIZES[eq.equipType] || {w:500,h:500,label:'?'};
      html += '<tr><td>' + escapeHtml(eq.label || info.label) + '</td>';
      html += '<td>' + _fmtMm(eq.customW || info.w) + '</td>';
      html += '<td>' + _fmtMm(eq.customH || info.h) + '</td></tr>';
    });
    html += '</table>';
  }
  // 配管一覧
  html += _partsSection('🔵 配管一覧', pipes.length);
  if (pipes.length > 0) {
    html += '<table class="madori-parts-tbl"><tr><th>用途</th><th>種類</th><th>径</th><th>長さ</th></tr>';
    pipes.forEach(function(p) {
      var pLen = 0;
      if (p.points) {
        for (var i = 1; i < p.points.length; i++) {
          var dx = p.points[i].x - p.points[i-1].x;
          var dy = p.points[i].y - p.points[i-1].y;
          pLen += Math.sqrt(dx*dx + dy*dy);
        }
      }
      html += '<tr><td>' + escapeHtml(PIPE_LABELS[p.pipeType] || '-') + '</td>';
      html += '<td>' + escapeHtml(p.pipeMaterial || '-') + '</td>';
      html += '<td>' + escapeHtml(p.pipeDiameter || '-') + '</td>';
      html += '<td>' + _fmtMm(Math.round(pLen)) + '</td></tr>';
    });
    html += '</table>';
  }
  // 壁一覧
  html += _partsSection('🧱 壁一覧', walls.length);
  if (walls.length > 0) {
    html += '<table class="madori-parts-tbl"><tr><th>長さ</th><th>壁厚</th></tr>';
    walls.forEach(function(w) {
      var wl = Math.round(Math.sqrt(Math.pow(w.x2-w.x,2)+Math.pow(w.y2-w.y,2)));
      html += '<tr><td>' + _fmtMm(wl) + '</td><td>' + _fmtMm(w.thickness||120) + '</td></tr>';
    });
    html += '</table>';
  }

  if (st.objects.length === 0) {
    html = '<div style="text-align:center; color:#9ca3af; padding:30px;">配置済みのオブジェクトがありません</div>';
  }
  var modal = document.getElementById('madoriPartsListModal');
  var content = document.getElementById('madoriPartsListContent');
  if (modal && content) {
    content.innerHTML = html;
    modal.style.display = 'flex';
  }
}

function _partsSection(title, count) {
  return '<div style="font-size:14px; font-weight:bold; color:#1f2937; margin:12px 0 6px; padding-bottom:4px; border-bottom:2px solid #e5e7eb;">' +
    title + ' <span style="font-size:12px; color:#9ca3af; font-weight:normal;">(' + count + '件)</span></div>';
}

function _fmtMm(val) {
  if (val >= 1000) return (val / 1000).toFixed(1) + 'm';
  return Math.round(val) + 'mm';
}

function closePartsListModal() {
  var modal = document.getElementById('madoriPartsListModal');
  if (modal) modal.style.display = 'none';
}

// === グローバル公開 ===
window.DOOR_TYPES = DOOR_TYPES;
window.showDoorTypePicker = showDoorTypePicker;
window.closeDoorTypePicker = closeDoorTypePicker;
window.selectDoorTypeAndPlace = selectDoorTypeAndPlace;
window.showMadoriPropertyPanel = showMadoriPropertyPanel;
window.closeMadoriPropertyPanel = closeMadoriPropertyPanel;
window.applyMadoriProperty = applyMadoriProperty;
window.hitTestResizeHandle = hitTestResizeHandle;
window.showDimValueInput = showDimValueInput;
window.closeDimValueInput = closeDimValueInput;
window.applyDimValue = applyDimValue;
window.showPartsList = showPartsList;
window.closePartsListModal = closePartsListModal;
console.log('[madori-ui.js] ✓ 間取りUI 読み込み完了');
