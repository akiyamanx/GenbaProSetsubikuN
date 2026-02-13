// ==========================================
// photo-blackboard.js
// Phase6: 簡易電子黒板のCanvas描画ロジック
// 現場Pro 設備くん v0.97追加
// ==========================================

// v0.97追加 - 写真のBlobに黒板を合成して新しいBlobを返す
function pmCompositeBlackboard(photoBlob, blackboardData) {
  return new Promise(function(resolve) {
    var img = new Image();
    var url = URL.createObjectURL(photoBlob);
    img.onload = function() {
      var canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      var ctx = canvas.getContext('2d');

      // 写真を描画
      ctx.drawImage(img, 0, 0);

      // 黒板サイズ（写真の約35%幅、左下配置）
      var bbWidth = Math.floor(img.width * 0.35);
      var bbHeight = Math.floor(bbWidth * 0.65);
      var bbX = 8;
      var bbY = img.height - bbHeight - 8;

      // 黒板背景（ダークグリーン、半透明）
      ctx.fillStyle = 'rgba(27, 94, 32, 0.92)';
      ctx.fillRect(bbX, bbY, bbWidth, bbHeight);

      // 黒板の枠線（木枠風）
      ctx.strokeStyle = '#8d6e63';
      ctx.lineWidth = Math.max(2, Math.floor(bbWidth / 100));
      ctx.strokeRect(bbX, bbY, bbWidth, bbHeight);

      // テキスト描画
      var fontSize = Math.max(11, Math.floor(bbWidth / 16));
      ctx.fillStyle = 'white';
      ctx.font = 'bold ' + fontSize + 'px sans-serif';

      var lines = [
        '工事名: ' + (blackboardData.kojiName || ''),
        '場 所: ' + (blackboardData.location || ''),
        '区 分: ' + (blackboardData.category || ''),
        '施工者: ' + (blackboardData.contractor || ''),
        '日 付: ' + pmFormatBbDate(blackboardData.date)
      ];

      var lineHeight = fontSize * 1.5;
      var startY = bbY + fontSize + Math.floor(bbHeight * 0.08);
      var maxTextWidth = bbWidth - 16;

      lines.forEach(function(line, i) {
        // テキストがはみ出ないようにクリップ
        var text = line;
        while (ctx.measureText(text).width > maxTextWidth && text.length > 3) {
          text = text.slice(0, -1);
        }
        ctx.fillText(text, bbX + 8, startY + i * lineHeight);
      });

      canvas.toBlob(function(blob) {
        URL.revokeObjectURL(url);
        resolve(blob);
      }, 'image/jpeg', 0.9);
    };
    img.onerror = function() {
      URL.revokeObjectURL(url);
      resolve(photoBlob); // エラー時は元画像をそのまま返す
    };
    img.src = url;
  });
}

function pmFormatBbDate(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  return parts[0] + '年' + parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
}

// グローバル公開
window.pmCompositeBlackboard = pmCompositeBlackboard;
