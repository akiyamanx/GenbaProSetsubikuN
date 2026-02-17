// drawing-export.js - 図面エクスポート（レイヤー合成＋共有）
// このファイルは: 図面＋手書き＋ピン＋テキストを1枚のJPEG画像に合成し、
// Web Share APIでLINE等に共有（非対応ならダウンロード）する機能
// v1.0.0 Phase8 Step5 新規作成
// 依存: drawing-viewer.js, drawing-pin.js, drawing-freehand.js,
//       drawing-text.js, drawing-manager.js, idb-storage.js

/**
 * 図面エクスポート — メイン関数
 * ①図面 → ②手書きCanvas → ③ピン → ④テキスト の順でレイヤー合成
 */
async function exportDrawingAsImage() {
  try {
    deShowLoading(true);

    // === 図面要素を取得 ===
    var drawingEl = document.getElementById('dvCanvas');
    if (!drawingEl || drawingEl.style.display === 'none') {
      drawingEl = document.getElementById('dvImage');
    }
    if (!drawingEl || drawingEl.style.display === 'none') {
      alert('図面が表示されていません');
      deShowLoading(false);
      return;
    }

    // 図面の表示サイズ（CSSピクセル）
    var dispW = parseFloat(drawingEl.style.width) || drawingEl.width ||
                drawingEl.naturalWidth || drawingEl.offsetWidth;
    var dispH = parseFloat(drawingEl.style.height) || drawingEl.height ||
                drawingEl.naturalHeight || drawingEl.offsetHeight;
    if (dispW === 0 || dispH === 0) {
      alert('図面サイズを取得できません');
      deShowLoading(false);
      return;
    }

    // 高解像度出力（devicePixelRatio倍）
    var dpr = window.devicePixelRatio || 1;
    var exportW = Math.round(dispW * dpr);
    var exportH = Math.round(dispH * dpr);

    // === 合成用Canvas ===
    var exportCanvas = document.createElement('canvas');
    exportCanvas.width = exportW;
    exportCanvas.height = exportH;
    var ctx = exportCanvas.getContext('2d');

    // 背景を白で塗る（JPEGは透明非対応）
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, exportW, exportH);

    // === ①図面を描画 ===
    ctx.drawImage(drawingEl, 0, 0, exportW, exportH);

    // === ②手書きフリーハンドCanvasを重ねる ===
    var fhCanvas = document.getElementById('freehandCanvas');
    if (fhCanvas) {
      ctx.drawImage(fhCanvas, 0, 0, exportW, exportH);
    }

    // === ③ピンを描画 ===
    await deDrawPins(ctx, exportW, exportH);

    // === ④テキストを描画 ===
    deDrawTexts(ctx, exportW, exportH, dpr);

    // === JPEG変換して共有/ダウンロード ===
    var blob = await deCanvasToBlob(exportCanvas, 'image/jpeg', 0.92);
    await deShareOrDownload(blob);

    deShowLoading(false);
  } catch (error) {
    console.error('[drawing-export] エクスポートエラー:', error);
    alert('エクスポートに失敗しました: ' + error.message);
    deShowLoading(false);
  }
}

/**
 * ③ ピンをCanvasに描画
 * IDBからピンデータを取得し、相対座標をCanvasピクセルに変換
 */
async function deDrawPins(ctx, cw, ch) {
  if (typeof dvDrawingId === 'undefined' || !dvDrawingId) return;
  if (typeof getDrawingPinsByDrawing !== 'function') return;

  var pins = [];
  try {
    pins = await getDrawingPinsByDrawing(dvDrawingId);
  } catch (e) {
    console.warn('[drawing-export] ピン取得エラー:', e);
    return;
  }

  pins.forEach(function(pin) {
    var x = pin.posX * cw;
    var y = pin.posY * ch;
    var pc = (typeof PIN_COLORS !== 'undefined' && PIN_COLORS[pin.color])
      ? PIN_COLORS[pin.color].hex : '#EF4444';
    var pinSize = Math.max(20, Math.round(Math.min(cw, ch) * 0.025));

    // ピンアイコン（ドロップピン形状）
    deDrawPinIcon(ctx, x, y, pc, pinSize);

    // ステータスバッジ
    var statusColors = { todo: '#EF4444', inProgress: '#F59E0B', done: '#10B981' };
    var sc = statusColors[pin.status] || '#EF4444';
    var badgeR = Math.max(4, pinSize * 0.2);
    ctx.beginPath();
    ctx.arc(x + pinSize * 0.35, y - pinSize * 1.3, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = sc;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(1, badgeR * 0.4);
    ctx.stroke();
  });
}

/**
 * ドロップピンアイコンをCanvasに描画
 * 先端(x, y)が座標位置に合うように描く
 */
function deDrawPinIcon(ctx, x, y, color, size) {
  ctx.save();
  // ピン形状: 上部の円弧 + 下の三角（先端が(x, y)）
  var r = size * 0.4;
  var topY = y - size;
  ctx.beginPath();
  ctx.arc(x, topY, r, Math.PI, 0, false);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(1.5, size * 0.08);
  ctx.stroke();
  // 中心の白丸
  ctx.beginPath();
  ctx.arc(x, topY, r * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();
}

/**
 * ④ テキストをCanvasに描画
 * ftTextElements配列から読み取り、相対座標をCanvasピクセルに変換
 */
function deDrawTexts(ctx, cw, ch, dpr) {
  if (typeof ftTextElements === 'undefined' || !ftTextElements.length) return;

  ftTextElements.forEach(function(t) {
    if (!t.text || !t.text.trim()) return;
    var x = t.posX * cw;
    var y = t.posY * ch;
    var fontSize = Math.round((t.fontSize || 24) * dpr);

    ctx.save();
    ctx.font = 'bold ' + fontSize + 'px sans-serif';
    ctx.textBaseline = 'top';

    // テキスト背景のアウトライン（白縁取り — 視認性確保）
    var outlineW = Math.max(2, fontSize * 0.1);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = outlineW;
    ctx.lineJoin = 'round';
    ctx.strokeText(t.text, x, y);

    // テキスト本体
    ctx.fillStyle = t.color || '#000000';
    ctx.fillText(t.text, x, y);
    ctx.restore();
  });
}

/**
 * Web Share API で共有、非対応なら通常ダウンロード
 */
async function deShareOrDownload(blob) {
  var now = new Date();
  var dateStr = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
  var fileName = '図面_' + dateStr + '.jpg';
  var file = new File([blob], fileName, { type: 'image/jpeg' });

  // Web Share API（ファイル共有対応チェック）
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: '図面共有',
        text: '現場Pro設備くんから図面を共有'
      });
      return; // 共有成功
    } catch (err) {
      if (err.name === 'AbortError') return; // ユーザーキャンセル
      console.warn('[drawing-export] Web Share失敗:', err);
    }
  }

  // フォールバック: ダウンロード
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
}

/**
 * Canvas → Blob変換（Promise版）
 */
function deCanvasToBlob(canvas, type, quality) {
  return new Promise(function(resolve, reject) {
    canvas.toBlob(function(blob) {
      if (blob) resolve(blob);
      else reject(new Error('Canvas→Blob変換失敗'));
    }, type, quality);
  });
}

/**
 * ローディング表示
 */
function deShowLoading(show) {
  var loader = document.getElementById('deExportLoader');
  if (show && !loader) {
    loader = document.createElement('div');
    loader.id = 'deExportLoader';
    loader.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;' +
      'background:rgba(0,0,0,0.5);display:flex;align-items:center;' +
      'justify-content:center;z-index:9999;';
    loader.innerHTML = '<div style="background:#fff;padding:24px 32px;' +
      'border-radius:12px;text-align:center;font-size:16px;' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.3);">' +
      '<div style="font-size:32px;margin-bottom:8px;">📤</div>' +
      'エクスポート中...</div>';
    document.body.appendChild(loader);
  } else if (!show && loader) {
    loader.remove();
  }
}

// === グローバル公開 ===
window.exportDrawingAsImage = exportDrawingAsImage;

console.log('[drawing-export.js] v1.0.0 図面エクスポートモジュール読み込み完了');
