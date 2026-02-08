// ==========================================
// 間取りエディタ — UI / プロパティ編集 (現場Pro 設備くん Phase4)
// オブジェクトプロパティ編集パネル、ドアタイプ選択、
// 寸法値入力、リサイズハンドル操作
// 依存: madori-core.js, madori-tools.js → 後続: madori-data.js
// ==========================================

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
    html += _propInput('propAngle', '回転角度', obj.angle||0, 0, 359, 1);
  } else if (obj.type === 'dimension') {
    html += _propInput('propDimVal', '寸法値 (mm)', obj.value||0, 0, 999999, 1);
  } else if (obj.type === 'wall') {
    html += _propInput('propWallThick', '壁厚 (mm)', obj.thickness||120, 50, 500, 10);
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
    el = document.getElementById('propAngle');
    if (el) obj.angle = (parseInt(el.value)||0) % 360;
  } else if (obj.type === 'dimension') {
    el = document.getElementById('propDimVal');
    if (el) obj.value = Math.max(0, parseInt(el.value)||0);
  } else if (obj.type === 'wall') {
    el = document.getElementById('propWallThick');
    if (el) obj.thickness = Math.max(50, parseInt(el.value)||obj.thickness);
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
      _pendingDimObj.value = val;
      renderMadoriCanvas();
    }
  }
  closeDimValueInput();
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
console.log('[madori-ui.js] ✓ 間取りUI 読み込み完了');
