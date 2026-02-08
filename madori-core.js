// ==========================================
// 間取りエディタ — Canvas基盤・描画エンジン (現場Pro 設備くん Phase4)
// Canvas初期化、グリッド描画、座標変換、パン/ズーム、
// レンダリングループ、ヒットテスト、タッチ/マウスイベント処理
// 依存: idb-storage.js, globals.js → 後続: madori-tools.js, madori-data.js
// ==========================================

// === グローバル状態 ===
window._madoriState = {
  mode: 'select', objects: [], selectedId: null,
  viewport: { offsetX: 0, offsetY: 0, scale: 1.0 },
  gridSize: 100, pixelsPerMm: 2,
  isDragging: false, dragStartWX: 0, dragStartWY: 0,
  dragObjStartX: 0, dragObjStartY: 0,
  isPanning: false, panStartX: 0, panStartY: 0,
  panStartOffsetX: 0, panStartOffsetY: 0,
  pinchStartDist: 0, pinchStartScale: 0,
  currentGenbaId: null, currentMadoriId: null,
  drawingPoints: [], drawingStart: null, _drawingEnd: null,
  undoStack: [], redoStack: [],
  btDevice: null, btCharacteristic: null,
  _pendingRoomObj: null, _selectedEquipType: null,
  _pipeType: 'water', _dimStart: null,
  isResizing: false, resizeHandle: null,
  resizeStartWX: 0, resizeStartWY: 0, resizeObjStart: null
};
var _madoriCanvas = null, _madoriCtx = null;

var PIPE_COLORS = { water:'#3b82f6', drain:'#6b7280', hotwater:'#ef4444', gas:'#eab308' };
var PIPE_LABELS = { water:'給水', drain:'排水', hotwater:'給湯', gas:'ガス' };
var ROOM_COLORS = {
  'リビング':'#fef3c7','キッチン':'#fce7f3','浴室':'#dbeafe','洗面所':'#e0e7ff',
  'トイレ':'#f3e8ff','寝室':'#fef9c3','和室':'#dcfce7','廊下':'#f1f5f9',
  '玄関':'#fed7aa','収納':'#e5e7eb'
};

function initMadoriScreen() {
  _madoriCanvas = document.getElementById('madoriCanvas');
  if (!_madoriCanvas) return;
  _madoriCtx = _madoriCanvas.getContext('2d');
  resizeMadoriCanvas();
  var evts = [['mousedown',onMadoriMouseDown],['mousemove',onMadoriMouseMove],['mouseup',onMadoriMouseUp]];
  evts.forEach(function(e){_madoriCanvas.removeEventListener(e[0],e[1]);_madoriCanvas.addEventListener(e[0],e[1]);});
  _madoriCanvas.removeEventListener('wheel',onMadoriWheel);
  _madoriCanvas.addEventListener('wheel',onMadoriWheel,{passive:false});
  _madoriCanvas.removeEventListener('touchstart',onMadoriTouchStart);
  _madoriCanvas.removeEventListener('touchmove',onMadoriTouchMove);
  _madoriCanvas.removeEventListener('touchend',onMadoriTouchEnd);
  _madoriCanvas.addEventListener('touchstart',onMadoriTouchStart,{passive:false});
  _madoriCanvas.addEventListener('touchmove',onMadoriTouchMove,{passive:false});
  _madoriCanvas.addEventListener('touchend',onMadoriTouchEnd);
  window.removeEventListener('resize',resizeMadoriCanvas);
  window.addEventListener('resize',resizeMadoriCanvas);
  renderMadoriCanvas();
}

function resizeMadoriCanvas() {
  if (!_madoriCanvas) return;
  var container = document.getElementById('madoriCanvasContainer');
  if (!container) return;
  var dpr = window.devicePixelRatio || 1;
  var w = container.clientWidth, h = container.clientHeight;
  _madoriCanvas.width = w * dpr; _madoriCanvas.height = h * dpr;
  _madoriCanvas.style.width = w + 'px'; _madoriCanvas.style.height = h + 'px';
  _madoriCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderMadoriCanvas();
}

function screenToWorld(sx, sy) {
  var vp = window._madoriState.viewport, ppmm = window._madoriState.pixelsPerMm;
  return { x: (sx - vp.offsetX) / (vp.scale * ppmm), y: (sy - vp.offsetY) / (vp.scale * ppmm) };
}
function worldToScreen(wx, wy) {
  var vp = window._madoriState.viewport, ppmm = window._madoriState.pixelsPerMm;
  return { x: wx * vp.scale * ppmm + vp.offsetX, y: wy * vp.scale * ppmm + vp.offsetY };
}
function snapToGrid(val) {
  var gs = window._madoriState.gridSize;
  return Math.round(val / gs) * gs;
}

function drawGrid(ctx) {
  var st = window._madoriState, vp = st.viewport, ppmm = st.pixelsPerMm;
  var w = _madoriCanvas.width / (window.devicePixelRatio || 1);
  var h = _madoriCanvas.height / (window.devicePixelRatio || 1);
  // Adaptive grid: increase step when zoomed out
  var step = st.gridSize;
  while (step * vp.scale * ppmm < 4) { step *= 10; }
  var stepPx = step * vp.scale * ppmm;
  if (stepPx < 2) return;
  var majorStep = (step < 1000) ? 1000 : step * 10;
  var tl = screenToWorld(0, 0), br = screenToWorld(w, h);
  var startX = Math.floor(tl.x / step) * step, endX = Math.ceil(br.x / step) * step;
  var startY = Math.floor(tl.y / step) * step, endY = Math.ceil(br.y / step) * step;
  ctx.save();
  for (var x = startX; x <= endX; x += step) {
    var sx = worldToScreen(x, 0).x, isM = (x % majorStep === 0);
    ctx.strokeStyle = isM ? '#cbd5e1' : '#e2e8f0'; ctx.lineWidth = isM ? 1 : 0.5;
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke();
    if (isM && stepPx > 3) { ctx.fillStyle='#94a3b8'; ctx.font='10px sans-serif'; ctx.fillText((x/1000)+'m', sx+2, 12); }
  }
  for (var y = startY; y <= endY; y += step) {
    var sy = worldToScreen(0, y).y, isM = (y % majorStep === 0);
    ctx.strokeStyle = isM ? '#cbd5e1' : '#e2e8f0'; ctx.lineWidth = isM ? 1 : 0.5;
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(w, sy); ctx.stroke();
    if (isM && stepPx > 3) { ctx.fillStyle='#94a3b8'; ctx.font='10px sans-serif'; ctx.fillText((y/1000)+'m', 2, sy-2); }
  }
  ctx.restore();
}

function renderMadoriCanvas() {
  if (!_madoriCtx || !_madoriCanvas) return;
  var ctx = _madoriCtx;
  var w = _madoriCanvas.width / (window.devicePixelRatio || 1);
  var h = _madoriCanvas.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  drawGrid(ctx);
  var order = ['room','wall','pipe','door','window','equipment','dimension'];
  var st = window._madoriState;
  order.forEach(function(type) {
    st.objects.forEach(function(obj) {
      if (obj.type === type && typeof renderMadoriObject === 'function') renderMadoriObject(ctx, obj);
    });
  });
  if (st.selectedId) {
    var sel = getObjectById(st.selectedId);
    if (sel) drawSelectionHandles(ctx, sel);
  }
  if (typeof drawMadoriPreview === 'function') drawMadoriPreview(ctx);
}

function drawSelectionHandles(ctx, obj) {
  var b = getObjectBounds(obj); if (!b) return;
  var tl = worldToScreen(b.x, b.y), br = worldToScreen(b.x + b.w, b.y + b.h);
  ctx.save(); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]); ctx.strokeRect(tl.x, tl.y, br.x-tl.x, br.y-tl.y);
  ctx.setLineDash([]); ctx.fillStyle = '#3b82f6';
  [[tl.x,tl.y],[br.x,tl.y],[tl.x,br.y],[br.x,br.y]].forEach(function(p) { ctx.fillRect(p[0]-4,p[1]-4,8,8); });
  ctx.restore();
}

function getObjectBounds(obj) {
  if (!obj) return null;
  switch (obj.type) {
    case 'room': return { x:obj.x, y:obj.y, w:obj.width, h:obj.height };
    case 'wall':
      return { x:Math.min(obj.x,obj.x2), y:Math.min(obj.y,obj.y2), w:Math.abs(obj.x2-obj.x)||20, h:Math.abs(obj.y2-obj.y)||20 };
    case 'door': return { x:obj.x, y:obj.y, w:obj.width||800, h:200 };
    case 'window': return { x:obj.x, y:obj.y, w:obj.width||900, h:100 };
    case 'equipment':
      var info = (typeof EQUIP_SIZES!=='undefined') ? EQUIP_SIZES[obj.equipType] : null;
      return { x:obj.x, y:obj.y, w:info?info.w:500, h:info?info.h:500 };
    case 'pipe':
      if (!obj.points||obj.points.length===0) return null;
      var mnx=Infinity,mny=Infinity,mxx=-Infinity,mxy=-Infinity;
      obj.points.forEach(function(p){if(p.x<mnx)mnx=p.x;if(p.y<mny)mny=p.y;if(p.x>mxx)mxx=p.x;if(p.y>mxy)mxy=p.y;});
      return { x:mnx, y:mny, w:(mxx-mnx)||20, h:(mxy-mny)||20 };
    case 'dimension':
      return { x:Math.min(obj.x,obj.x2), y:Math.min(obj.y,obj.y2), w:Math.abs(obj.x2-obj.x)||20, h:Math.abs(obj.y2-obj.y)||20 };
    default: return null;
  }
}

function hitTest(wx, wy) {
  var st = window._madoriState;
  for (var i = st.objects.length - 1; i >= 0; i--) {
    var b = getObjectBounds(st.objects[i]); if (!b) continue;
    var m = 50;
    if (wx>=b.x-m && wx<=b.x+b.w+m && wy>=b.y-m && wy<=b.y+b.h+m) return st.objects[i];
  }
  return null;
}
function getObjectById(id) { return window._madoriState.objects.find(function(o){return o.id===id;})||null; }

function setMadoriTool(tool) {
  var st = window._madoriState;
  st.mode = tool; st.selectedId = null; st.drawingStart = null; st.drawingPoints = []; st._dimStart = null;
  document.querySelectorAll('.madori-tool-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-tool') === tool);
  });
  var sub = document.getElementById('madoriSubToolbar');
  if (tool === 'pipe') { sub.style.display = 'flex'; sub.innerHTML = buildPipeSubToolbar(); }
  else if (tool === 'equipment') { sub.style.display = 'none'; if (typeof openEquipmentPicker==='function') openEquipmentPicker(); }
  else { sub.style.display = 'none'; }
  updateSelectionBar(); renderMadoriCanvas();
}

function buildPipeSubToolbar() {
  var types=['water','drain','hotwater','gas'], st=window._madoriState, html='';
  types.forEach(function(t){
    var a = (st._pipeType===t);
    html += '<button class="madori-pipe-btn'+(a?' active':'')+'" style="border-color:'+PIPE_COLORS[t]+';background:'+(a?PIPE_COLORS[t]:'white')+';color:'+(a?'white':'#374151')+';" onclick="selectPipeType(\''+t+'\')">'+PIPE_LABELS[t]+'</button>';
  });
  if (st.drawingPoints.length > 0)
    html += '<button onclick="finishPipeDraw()" style="padding:6px 14px;background:#22c55e;color:white;border:none;border-radius:8px;font-size:13px;font-weight:bold;cursor:pointer;margin-left:auto;">✓ 確定</button>';
  return html;
}
function selectPipeType(type) { window._madoriState._pipeType=type; var s=document.getElementById('madoriSubToolbar'); if(s) s.innerHTML=buildPipeSubToolbar(); }
function updateSelectionBar() { var b=document.getElementById('madoriSelectionBar'); if(b) b.style.display=window._madoriState.selectedId?'flex':'none'; }

function zoomMadori(factor) {
  var vp = window._madoriState.viewport; if (!_madoriCanvas) return;
  var w = _madoriCanvas.width/(window.devicePixelRatio||1), h = _madoriCanvas.height/(window.devicePixelRatio||1);
  var cx=w/2, cy=h/2;
  vp.offsetX = cx-(cx-vp.offsetX)*factor; vp.offsetY = cy-(cy-vp.offsetY)*factor;
  vp.scale = Math.max(0.01, Math.min(10, vp.scale*factor)); renderMadoriCanvas();
}
function resetMadoriView() { var vp=window._madoriState.viewport; vp.offsetX=50; vp.offsetY=50; vp.scale=1.0; renderMadoriCanvas(); }

// マウスイベント
function _getCanvasXY(e) { var r=_madoriCanvas.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; }
function onMadoriMouseDown(e) { var p=_getCanvasXY(e); handlePointerDown(p.x,p.y,e); }
function onMadoriMouseMove(e) { var p=_getCanvasXY(e); handlePointerMove(p.x,p.y,e); }
function onMadoriMouseUp(e) { var p=_getCanvasXY(e); handlePointerUp(p.x,p.y,e); }
function onMadoriWheel(e) {
  e.preventDefault(); var f = e.deltaY<0?1.1:0.9, vp=window._madoriState.viewport;
  var r=_madoriCanvas.getBoundingClientRect(), cx=e.clientX-r.left, cy=e.clientY-r.top;
  vp.offsetX=cx-(cx-vp.offsetX)*f; vp.offsetY=cy-(cy-vp.offsetY)*f;
  vp.scale=Math.max(0.01,Math.min(10,vp.scale*f)); renderMadoriCanvas();
}

// タッチイベント
function getTouchDist(t) { var dx=t[0].clientX-t[1].clientX,dy=t[0].clientY-t[1].clientY; return Math.sqrt(dx*dx+dy*dy); }
function onMadoriTouchStart(e) {
  e.preventDefault(); var st=window._madoriState;
  if (e.touches.length===2) {
    st.isPanning=true; st.pinchStartDist=getTouchDist(e.touches); st.pinchStartScale=st.viewport.scale;
    st.panStartX=(e.touches[0].clientX+e.touches[1].clientX)/2; st.panStartY=(e.touches[0].clientY+e.touches[1].clientY)/2;
    st.panStartOffsetX=st.viewport.offsetX; st.panStartOffsetY=st.viewport.offsetY; return;
  }
  if (e.touches.length===1) { var r=_madoriCanvas.getBoundingClientRect(); handlePointerDown(e.touches[0].clientX-r.left, e.touches[0].clientY-r.top, e); }
}
function onMadoriTouchMove(e) {
  e.preventDefault(); var st=window._madoriState;
  if (e.touches.length===2 && st.isPanning) {
    var dist=getTouchDist(e.touches), ns=Math.max(0.01,Math.min(10,st.pinchStartScale*(dist/st.pinchStartDist)));
    var mx=(e.touches[0].clientX+e.touches[1].clientX)/2, my=(e.touches[0].clientY+e.touches[1].clientY)/2;
    st.viewport.offsetX=st.panStartOffsetX+(mx-st.panStartX); st.viewport.offsetY=st.panStartOffsetY+(my-st.panStartY);
    var sf=ns/st.viewport.scale, r=_madoriCanvas.getBoundingClientRect(), cx=mx-r.left, cy=my-r.top;
    st.viewport.offsetX=cx-(cx-st.viewport.offsetX)*sf; st.viewport.offsetY=cy-(cy-st.viewport.offsetY)*sf;
    st.viewport.scale=ns; renderMadoriCanvas(); return;
  }
  if (e.touches.length===1) { var r=_madoriCanvas.getBoundingClientRect(); handlePointerMove(e.touches[0].clientX-r.left, e.touches[0].clientY-r.top, e); }
}
function onMadoriTouchEnd(e) {
  var st=window._madoriState;
  if (st.isPanning && e.touches.length<2) { st.isPanning=false; return; }
  handlePointerUp(0, 0, e);
}

// 統一ポインタハンドラ
function handlePointerDown(sx, sy) {
  var st=window._madoriState, w=screenToWorld(sx,sy), wx=snapToGrid(w.x), wy=snapToGrid(w.y);
  if (typeof onMadoriToolDown==='function') onMadoriToolDown(st.mode, wx, wy, w.x, w.y, sx, sy);
}
function handlePointerMove(sx, sy) {
  var st=window._madoriState, w=screenToWorld(sx,sy), wx=snapToGrid(w.x), wy=snapToGrid(w.y);
  if (typeof onMadoriToolMove==='function') onMadoriToolMove(st.mode, wx, wy, w.x, w.y, sx, sy);
}
function handlePointerUp(sx, sy) {
  var st=window._madoriState, w=screenToWorld(sx,sy), wx=snapToGrid(w.x), wy=snapToGrid(w.y);
  if (typeof onMadoriToolUp==='function') onMadoriToolUp(st.mode, wx, wy, w.x, w.y);
}

// === グローバル公開 ===
window.initMadoriScreen = initMadoriScreen;
window.renderMadoriCanvas = renderMadoriCanvas;
window.screenToWorld = screenToWorld;
window.worldToScreen = worldToScreen;
window.snapToGrid = snapToGrid;
window.hitTest = hitTest;
window.getObjectById = getObjectById;
window.getObjectBounds = getObjectBounds;
window.setMadoriTool = setMadoriTool;
window.selectPipeType = selectPipeType;
window.zoomMadori = zoomMadori;
window.resetMadoriView = resetMadoriView;
window.updateSelectionBar = updateSelectionBar;
window.PIPE_COLORS = PIPE_COLORS;
window.PIPE_LABELS = PIPE_LABELS;
window.ROOM_COLORS = ROOM_COLORS;
console.log('[madori-core.js] ✓ 間取りCanvas基盤 読み込み完了');
