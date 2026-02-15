// drawing-viewer.js - Phase8 Step2: 図面ビューア
// PDF.js + 画像表示 + ピンチ操作 + 回転
// 依存: drawing-manager.js（getDrawing）, pdf.js（CDN）

// === 状態管理 ===
var dvDrawingId = null;
var dvDrawingData = null;
var dvPdfDoc = null;
var dvCurrentPage = 1;
var dvTotalPages = 1;
var dvObjectUrl = null;
var dvMode = 'view'; // 'view', 'pin', or 'draw'
// トランスフォーム状態
var dvScale = 1;
var dvTransX = 0;
var dvTransY = 0;
var dvMinScale = 0.5;
var dvMaxScale = 5;
// 回転状態
var dvRotation = 0; // 0, 90, 180, 270
// タッチ状態
var dvTouches = [];
var dvLastPinchDist = 0;
var dvLastPinchCenter = null;
var dvIsPanning = false;
var dvPanStartX = 0;
var dvPanStartY = 0;
var dvPanBaseX = 0;
var dvPanBaseY = 0;
var dvLastTapTime = 0;

// === 初期化 ===
async function initDrawingViewer(drawingId) {
  console.log('[DrawingViewer] 初期化:', drawingId);
  if (typeof dpCleanup === 'function') dpCleanup();
  if (typeof fhCleanup === 'function') fhCleanup();
  dvCleanup();
  dvDrawingId = drawingId;
  dvScale = 1; dvTransX = 0; dvTransY = 0; dvRotation = 0;
  dvCurrentPage = 1; dvMode = 'view';
  dvUpdateModeUI();
  if (!drawingId) {
    console.error('[DrawingViewer] drawingIdがありません');
    return;
  }
  try {
    dvDrawingData = await getDrawing(drawingId);
    if (!dvDrawingData) {
      alert('図面データが見つかりません。');
      dvGoBack();
      return;
    }
    var title = document.getElementById('dvTitle');
    if (title) title.textContent = dvDrawingData.fileName || '図面ビューア';
    dvSetupTouch();
    if (dvDrawingData.fileType === 'pdf') {
      await dvRenderPdf();
      if (typeof initDrawingPins === 'function') initDrawingPins(drawingId);
      if (typeof initFreehand === 'function') initFreehand(drawingId);
    } else {
      dvRenderImage();
    }
  } catch (e) {
    console.error('[DrawingViewer] 初期化エラー:', e);
    alert('図面の読み込みに失敗しました。');
  }
}

// === クリーンアップ ===
function dvCleanup() {
  if (typeof fhCleanup === 'function') fhCleanup();
  if (dvObjectUrl) { URL.revokeObjectURL(dvObjectUrl); dvObjectUrl = null; }
  if (dvPdfDoc) { dvPdfDoc.destroy(); dvPdfDoc = null; }
  var canvas = document.getElementById('dvCanvas');
  if (canvas) { canvas.style.display = 'none'; canvas.width = 0; canvas.height = 0; }
  var img = document.getElementById('dvImage');
  if (img) { img.style.display = 'none'; img.src = ''; }
  var nav = document.getElementById('dvPdfNav');
  if (nav) nav.style.display = 'none';
  dvDrawingData = null;
  dvDrawingId = null;
}

// === PDF表示 ===
async function dvRenderPdf() {
  if (!dvDrawingData || !dvDrawingData.fileBlob) {
    console.error('[DrawingViewer] PDFデータがありません');
    return;
  }
  if (typeof pdfjsLib === 'undefined') {
    alert('PDF.jsが読み込まれていません。\nネットワーク接続を確認してください。');
    return;
  }
  var blob = dvDrawingData.fileBlob;
  dvObjectUrl = URL.createObjectURL(blob);
  try {
    dvPdfDoc = await pdfjsLib.getDocument(dvObjectUrl).promise;
    dvTotalPages = dvPdfDoc.numPages;
    dvCurrentPage = 1;
    console.log('[DrawingViewer] PDF読み込み完了: ' + dvTotalPages + 'ページ');
    var nav = document.getElementById('dvPdfNav');
    if (nav) nav.style.display = (dvTotalPages > 1) ? 'flex' : 'none';
    dvUpdatePageInfo();
    await dvRenderPdfPage(dvCurrentPage);
  } catch (e) {
    console.error('[DrawingViewer] PDF読み込みエラー:', e);
    alert('PDFの読み込みに失敗しました。');
  }
}

async function dvRenderPdfPage(pageNum) {
  if (!dvPdfDoc) return;
  try {
    var page = await dvPdfDoc.getPage(pageNum);
    var container = document.getElementById('dvContainer');
    if (!container) return;
    var cw = container.clientWidth;
    var ch = container.clientHeight;
    var viewport = page.getViewport({ scale: 1 });
    var fitScale = Math.min(cw / viewport.width, ch / viewport.height);
    var scaledViewport = page.getViewport({ scale: fitScale });
    var canvas = document.getElementById('dvCanvas');
    if (!canvas) return;
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    canvas.style.display = 'block';
    var img = document.getElementById('dvImage');
    if (img) img.style.display = 'none';
    var ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
    dvRecenter();
    dvApplyTransform();
    console.log('[DrawingViewer] ページ ' + pageNum + ' レンダリング完了');
  } catch (e) {
    console.error('[DrawingViewer] ページレンダリングエラー:', e);
  }
}

function dvChangePage(delta) {
  var newPage = dvCurrentPage + delta;
  if (newPage < 1 || newPage > dvTotalPages) return;
  dvCurrentPage = newPage;
  dvUpdatePageInfo();
  dvRenderPdfPage(dvCurrentPage);
}

function dvUpdatePageInfo() {
  var info = document.getElementById('dvPageInfo');
  if (info) info.textContent = dvCurrentPage + ' / ' + dvTotalPages;
  var prev = document.getElementById('dvPrevPage');
  var next = document.getElementById('dvNextPage');
  if (prev) prev.style.opacity = dvCurrentPage <= 1 ? '0.3' : '1';
  if (next) next.style.opacity = dvCurrentPage >= dvTotalPages ? '0.3' : '1';
}

// === 画像表示 ===
function dvRenderImage() {
  if (!dvDrawingData || !dvDrawingData.fileBlob) {
    console.error('[DrawingViewer] 画像データがありません');
    return;
  }
  var blob = dvDrawingData.fileBlob;
  dvObjectUrl = URL.createObjectURL(blob);
  var canvas = document.getElementById('dvCanvas');
  if (canvas) canvas.style.display = 'none';
  var nav = document.getElementById('dvPdfNav');
  if (nav) nav.style.display = 'none';
  var img = document.getElementById('dvImage');
  if (!img) return;
  img.onload = function() {
    var container = document.getElementById('dvContainer');
    if (!container) return;
    var cw = container.clientWidth, ch = container.clientHeight;
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var fitScale = Math.min(cw / iw, ch / ih);
    img.style.width = (iw * fitScale) + 'px';
    img.style.height = (ih * fitScale) + 'px';
    dvRecenter();
    dvApplyTransform();
    console.log('[DrawingViewer] 画像表示完了');
    if (typeof initDrawingPins === 'function') initDrawingPins(dvDrawingId);
    if (typeof initFreehand === 'function') initFreehand(dvDrawingId);
  };
  img.style.display = 'block';
  img.src = dvObjectUrl;
}

// === トランスフォーム ===
function dvApplyTransform() {
  var el = document.getElementById('dvTransform');
  if (el) {
    el.style.transform = 'translate(' + dvTransX + 'px,' + dvTransY + 'px) scale(' + dvScale + ') rotate(' + dvRotation + 'deg)';
  }
  if (typeof updatePinScales === 'function') updatePinScales(dvScale);
}

// === タッチ操作 ===
function dvSetupTouch() {
  var container = document.getElementById('dvContainer');
  if (!container) return;
  container.addEventListener('touchstart', dvOnTouchStart, { passive: false });
  container.addEventListener('touchmove', dvOnTouchMove, { passive: false });
  container.addEventListener('touchend', dvOnTouchEnd, { passive: false });
  container.addEventListener('touchcancel', dvOnTouchEnd, { passive: false });
  container.addEventListener('mousedown', dvOnMouseDown);
  container.addEventListener('mousemove', dvOnMouseMove);
  container.addEventListener('mouseup', dvOnMouseUp);
  container.addEventListener('mouseleave', dvOnMouseUp);
  container.addEventListener('wheel', dvOnWheel, { passive: false });
  container.addEventListener('dblclick', dvOnDblClick);
}

function dvOnTouchStart(e) {
  if (dvMode !== 'view') return;
  e.preventDefault();
  dvTouches = Array.from(e.touches);
  if (dvTouches.length === 1) {
    var now = Date.now();
    if (now - dvLastTapTime < 300) {
      dvOnDoubleTap(dvTouches[0].clientX, dvTouches[0].clientY);
      dvLastTapTime = 0;
      return;
    }
    dvLastTapTime = now;
    dvIsPanning = true;
    dvPanStartX = dvTouches[0].clientX;
    dvPanStartY = dvTouches[0].clientY;
    dvPanBaseX = dvTransX;
    dvPanBaseY = dvTransY;
  } else if (dvTouches.length === 2) {
    dvIsPanning = false;
    dvLastPinchDist = dvGetPinchDist(dvTouches[0], dvTouches[1]);
    dvLastPinchCenter = dvGetPinchCenter(dvTouches[0], dvTouches[1]);
  }
}

function dvOnTouchMove(e) {
  if (dvMode !== 'view') return;
  e.preventDefault();
  var touches = Array.from(e.touches);
  if (touches.length === 1 && dvIsPanning) {
    dvTransX = dvPanBaseX + (touches[0].clientX - dvPanStartX);
    dvTransY = dvPanBaseY + (touches[0].clientY - dvPanStartY);
    dvApplyTransform();
  } else if (touches.length === 2) {
    var dist = dvGetPinchDist(touches[0], touches[1]);
    var center = dvGetPinchCenter(touches[0], touches[1]);
    if (dvLastPinchDist > 0) {
      var ratio = dist / dvLastPinchDist;
      var newScale = Math.min(dvMaxScale, Math.max(dvMinScale, dvScale * ratio));
      var container = document.getElementById('dvContainer');
      var rect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
      var cx = center.x - rect.left;
      var cy = center.y - rect.top;
      var scaleChange = newScale / dvScale;
      dvTransX = cx - (cx - dvTransX) * scaleChange;
      dvTransY = cy - (cy - dvTransY) * scaleChange;
      dvScale = newScale;
      dvApplyTransform();
    }
    dvLastPinchDist = dist;
    dvLastPinchCenter = center;
  }
}

function dvOnTouchEnd(e) {
  if (dvMode !== 'view') return;
  dvTouches = Array.from(e.touches);
  if (dvTouches.length < 2) { dvLastPinchDist = 0; dvLastPinchCenter = null; }
  if (dvTouches.length === 0) {
    dvIsPanning = false;
  } else if (dvTouches.length === 1) {
    dvIsPanning = true;
    dvPanStartX = dvTouches[0].clientX;
    dvPanStartY = dvTouches[0].clientY;
    dvPanBaseX = dvTransX;
    dvPanBaseY = dvTransY;
  }
}

// === マウス操作（PC対応） ===
function dvOnMouseDown(e) {
  if (dvMode !== 'view') return;
  dvIsPanning = true;
  dvPanStartX = e.clientX; dvPanStartY = e.clientY;
  dvPanBaseX = dvTransX; dvPanBaseY = dvTransY;
  e.preventDefault();
}

function dvOnMouseMove(e) {
  if (!dvIsPanning || dvMode !== 'view') return;
  dvTransX = dvPanBaseX + (e.clientX - dvPanStartX);
  dvTransY = dvPanBaseY + (e.clientY - dvPanStartY);
  dvApplyTransform();
}

function dvOnMouseUp() { dvIsPanning = false; }

function dvOnWheel(e) {
  if (dvMode !== 'view') return;
  e.preventDefault();
  var delta = e.deltaY > 0 ? 0.9 : 1.1;
  var newScale = Math.min(dvMaxScale, Math.max(dvMinScale, dvScale * delta));
  var container = document.getElementById('dvContainer');
  var rect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
  var cx = e.clientX - rect.left;
  var cy = e.clientY - rect.top;
  var scaleChange = newScale / dvScale;
  dvTransX = cx - (cx - dvTransX) * scaleChange;
  dvTransY = cy - (cy - dvTransY) * scaleChange;
  dvScale = newScale;
  dvApplyTransform();
}

function dvOnDblClick(e) {
  if (dvMode !== 'view') return;
  dvOnDoubleTap(e.clientX, e.clientY);
}

// === ダブルタップ ===
function dvOnDoubleTap(cx, cy) {
  var container = document.getElementById('dvContainer');
  var rect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
  var px = cx - rect.left;
  var py = cy - rect.top;
  if (dvScale > 1.05) {
    dvRecenter();
  } else {
    var newScale = 2;
    var scaleChange = newScale / dvScale;
    dvTransX = px - (px - dvTransX) * scaleChange;
    dvTransY = py - (py - dvTransY) * scaleChange;
    dvScale = newScale;
  }
  dvApplyTransform();
}

// === ユーティリティ ===
function dvGetPinchDist(t1, t2) {
  var dx = t1.clientX - t2.clientX;
  var dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function dvGetPinchCenter(t1, t2) {
  return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
}

// === 回転 ===
function dvRotate() {
  dvRotation = (dvRotation + 90) % 360;
  dvRecenter();
  dvApplyTransform();
}

function dvRecenter() {
  var container = document.getElementById('dvContainer');
  if (!container) return;
  var el = (dvDrawingData && dvDrawingData.fileType === 'pdf')
    ? document.getElementById('dvCanvas')
    : document.getElementById('dvImage');
  if (!el) return;
  var ew = parseFloat(el.style.width) || el.width || el.naturalWidth || 0;
  var eh = parseFloat(el.style.height) || el.height || el.naturalHeight || 0;
  var cw = container.clientWidth;
  var ch = container.clientHeight;
  var isRotated = (dvRotation === 90 || dvRotation === 270);
  var dispW = isRotated ? eh : ew;
  var dispH = isRotated ? ew : eh;
  dvScale = Math.min(cw / dispW, ch / dispH);
  var s = dvScale;
  if (dvRotation === 0) {
    dvTransX = (cw - ew * s) / 2; dvTransY = (ch - eh * s) / 2;
  } else if (dvRotation === 90) {
    dvTransX = (cw + eh * s) / 2; dvTransY = (ch - ew * s) / 2;
  } else if (dvRotation === 180) {
    dvTransX = (cw + ew * s) / 2; dvTransY = (ch + eh * s) / 2;
  } else if (dvRotation === 270) {
    dvTransX = (cw - eh * s) / 2; dvTransY = (ch + ew * s) / 2;
  }
}

// === モード切替 ===
function dvSetMode(mode) {
  dvMode = mode;
  dvUpdateModeUI();
}

function dvUpdateModeUI() {
  var viewBtn = document.getElementById('dvModeView');
  var pinBtn = document.getElementById('dvModePin');
  var drawBtn = document.getElementById('dvModeDraw');
  if (viewBtn) viewBtn.style.opacity = dvMode === 'view' ? '1' : '0.4';
  if (pinBtn) pinBtn.style.opacity = dvMode === 'pin' ? '1' : '0.4';
  if (drawBtn) drawBtn.style.opacity = dvMode === 'draw' ? '1' : '0.4';
  var container = document.getElementById('dvContainer');
  if (container) container.style.cursor = dvMode === 'view' ? 'grab' : 'crosshair';
  if (dvMode === 'draw') {
    if (typeof enableDrawMode === 'function') enableDrawMode();
  } else {
    if (typeof disableDrawMode === 'function') disableDrawMode();
  }
}

// === 画面遷移 ===
function dvGoBack() {
  dvCleanup();
  if (typeof showScreen === 'function') showScreen('drawing');
}

// === グローバル公開 ===
window.initDrawingViewer = initDrawingViewer;
window.dvGoBack = dvGoBack;
window.dvSetMode = dvSetMode;
window.dvChangePage = dvChangePage;
window.dvCleanup = dvCleanup;
window.dvRotate = dvRotate;

console.log('[drawing-viewer.js] Phase8 Step2 図面ビューアモジュール読み込み完了');
