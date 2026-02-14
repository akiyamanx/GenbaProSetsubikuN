// ==========================================
// report-pdf.js
// Phase7: PDF出力（日報＆完了報告書）
// HTML→window.print()方式でPDF生成
// 現場Pro 設備くん v1.10
// v1.10: rowspanバグ修正/フッター追加/ページブレーク対応
// ==========================================

// === 共通CSS ===
var rpCommonCss =
  '@page { size: A4 portrait; margin: 15mm; }' +
  'body { font-family: "Hiragino Sans", "Meiryo", "Yu Gothic", sans-serif; font-size: 13px; color: #222; margin: 0; padding: 20px; }' +
  '@media print { body { padding: 0; } .no-print { display: none !important; } }' +
  'table { border-collapse: collapse; width: 100%; }' +
  '.photo-pair { page-break-inside: avoid; margin-bottom: 12px; }' +
  '.section { page-break-inside: avoid; }' +
  '.footer { text-align: right; font-size: 10px; color: #999; margin-top: 30px; padding-top: 8px; border-top: 1px solid #ddd; }';

// === 作業日報PDF生成 ===
async function generateDailyReportPDF(report) {
  try {
    var html = await buildDailyReportHTML(report);
    rpOpenPrintWindow(html);
  } catch (e) {
    console.error('[ReportPDF] 日報PDF生成エラー:', e);
    alert('PDF生成に失敗しました: ' + e.message);
  }
}

// === 完了報告書PDF生成 ===
async function generateCompletionReportPDF(report) {
  try {
    var html = await buildCompletionReportHTML(report);
    rpOpenPrintWindow(html);
  } catch (e) {
    console.error('[ReportPDF] 完了報告書PDF生成エラー:', e);
    alert('PDF生成に失敗しました: ' + e.message);
  }
}

// === 印刷ウィンドウを開いてprint()呼び出し ===
function rpOpenPrintWindow(html) {
  var printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('ポップアップがブロックされました。\nブラウザの設定でポップアップを許可してください。');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  // 画像読み込み待ち + print()
  var tryPrint = function() { printWindow.print(); };
  if (printWindow.onload !== undefined) {
    printWindow.onload = tryPrint;
  }
  setTimeout(tryPrint, 2000);
}

// === 写真をDataURLに変換 ===
async function rpGetPhotoDataUrl(photoId) {
  if (!photoId) return null;
  try {
    var photo = await getPhotoManager(parseInt(photoId));
    if (!photo) return null;
    var blob = photo.originalBlob || photo.thumbnailBlob;
    if (!blob) return null;
    return new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.onerror = function() { resolve(null); };
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('[ReportPDF] 写真取得エラー:', e);
    return null;
  }
}

// === 日本語日付フォーマット ===
function rpFormatDateJP(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  var days = ['日', '月', '火', '水', '木', '金', '土'];
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return parts[0] + '年' + parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日(' + days[d.getDay()] + ')';
}

// === HTML文字エスケープ ===
function rpEsc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// === 改行をBRタグに ===
function rpNl2br(str) {
  if (!str) return '';
  return rpEsc(str).replace(/\n/g, '<br>');
}

// ==========================================
// 作業日報 HTML生成
// ==========================================
async function buildDailyReportHTML(report) {
  var entriesHtml = '';
  if (report.entries && report.entries.length > 0) {
    for (var i = 0; i < report.entries.length; i++) {
      var e = report.entries[i];
      var photosHtml = '';
      if (e.photoIds && e.photoIds.length > 0) {
        photosHtml += '<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">';
        for (var j = 0; j < e.photoIds.length; j++) {
          var dataUrl = await rpGetPhotoDataUrl(e.photoIds[j]);
          if (dataUrl) {
            photosHtml += '<img src="' + dataUrl + '" style="width:80px; height:60px; object-fit:cover; border:1px solid #ccc; border-radius:3px;">';
          }
        }
        photosHtml += '</div>';
      }

      entriesHtml +=
        '<tr>' +
          '<td style="border:1px solid #333; padding:8px; vertical-align:top; width:20%;">' +
            '<div style="font-weight:bold;">' + rpEsc(e.genbaName || '未設定') + '</div>' +
            '<div style="font-size:11px; color:#666; margin-top:2px;">' + rpEsc(e.kouji || '') + '</div>' +
          '</td>' +
          '<td style="border:1px solid #333; padding:8px; vertical-align:top; width:12%; text-align:center; font-size:12px;">' +
            (e.startTime || '') + (e.startTime && e.endTime ? '<br>〜<br>' : '') + (e.endTime || '') +
          '</td>' +
          '<td style="border:1px solid #333; padding:8px; vertical-align:top;">' +
            rpNl2br(e.content || '') +
            photosHtml +
            (e.remarks ? '<div style="margin-top:6px; font-size:11px; color:#666;">備考: ' + rpEsc(e.remarks) + '</div>' : '') +
          '</td>' +
        '</tr>';
    }
  }

  var weatherIcon = {'晴れ':'☀', '曇り':'☁', '雨':'🌧', '雪':'❄'}[report.weather] || '';

  var html =
    '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">' +
    '<title>作業日報</title>' +
    '<style>' + rpCommonCss + '</style>' +
    '</head><body>' +
    '<h1 style="text-align:center; font-size:22px; margin:0 0 16px; border-bottom:3px double #333; padding-bottom:8px;">作 業 日 報</h1>' +
    '<table style="margin-bottom:16px;">' +
      '<tr>' +
        '<td style="width:60%; font-size:13px;">' +
          '<div>日付: <strong>' + rpFormatDateJP(report.date) + '</strong></div>' +
          '<div>天気: ' + weatherIcon + ' ' + rpEsc(report.weather || '') + (report.temperature ? '　気温: ' + rpEsc(report.temperature) + '℃' : '') + '</div>' +
        '</td>' +
        '<td style="text-align:right; font-size:13px;">' +
          '<div>記入者: <strong>' + rpEsc(report.reporter || '') + '</strong></div>' +
        '</td>' +
      '</tr>' +
    '</table>' +
    '<table>' +
      '<thead>' +
        '<tr style="background:#f0f0f0;">' +
          '<th style="border:1px solid #333; padding:8px; font-size:13px;">現場 / 工種</th>' +
          '<th style="border:1px solid #333; padding:8px; font-size:13px; width:12%;">時間</th>' +
          '<th style="border:1px solid #333; padding:8px; font-size:13px;">作業内容</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' + entriesHtml + '</tbody>' +
    '</table>';

  // 走行距離・特記事項
  if (report.mileage || report.specialNotes) {
    html += '<div style="margin-top:16px; border-top:1px solid #ccc; padding-top:10px;">';
    if (report.mileage) html += '<div>走行距離: <strong>' + rpEsc(report.mileage) + ' km</strong></div>';
    if (report.specialNotes) html += '<div style="margin-top:4px;">特記事項: ' + rpNl2br(report.specialNotes) + '</div>';
    html += '</div>';
  }

  // フッター
  html += '<div class="footer">現場Pro 設備くん</div>';
  html += '</body></html>';
  return html;
}

// ==========================================
// 完了報告書 HTML生成
// v1.10: rowspanバグ修正 → 各ペアを1行で写真横並び
// ==========================================
async function buildCompletionReportHTML(report) {
  var photoSetsHtml = '';
  if (report.photoSets && report.photoSets.length > 0) {
    for (var i = 0; i < report.photoSets.length; i++) {
      var ps = report.photoSets[i];
      var beforeUrl = await rpGetPhotoDataUrl(ps.beforePhotoId);
      var afterUrl = await rpGetPhotoDataUrl(ps.afterPhotoId);

      // v1.10修正: rowspan削除、1行に部位+施工前+施工後
      photoSetsHtml +=
        '<tr class="photo-pair">' +
          '<td style="border:1px solid #333; padding:8px; text-align:center; vertical-align:middle; font-size:12px; font-weight:bold; width:15%;">' +
            'No.' + (i + 1) + '<br>' + rpEsc(ps.label || '') +
          '</td>' +
          '<td style="border:1px solid #333; padding:6px; text-align:center; vertical-align:top; width:42%;">' +
            '<div style="font-size:11px; color:#666; margin-bottom:4px;">施工前</div>' +
            (beforeUrl ? '<img src="' + beforeUrl + '" style="max-width:100%; max-height:180px; border:1px solid #ccc;">' : '<div style="color:#aaa; padding:30px 0;">写真なし</div>') +
          '</td>' +
          '<td style="border:1px solid #333; padding:6px; text-align:center; vertical-align:top; width:42%;">' +
            '<div style="font-size:11px; color:#666; margin-bottom:4px;">施工後</div>' +
            (afterUrl ? '<img src="' + afterUrl + '" style="max-width:100%; max-height:180px; border:1px solid #ccc;">' : '<div style="color:#aaa; padding:30px 0;">写真なし</div>') +
          '</td>' +
        '</tr>';
    }
  }

  var periodStr = '';
  if (report.period) {
    if (report.period.start) periodStr = rpFormatDateJP(report.period.start);
    if (report.period.end) periodStr += ' 〜 ' + rpFormatDateJP(report.period.end);
  }

  var html =
    '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">' +
    '<title>工事完了報告書</title>' +
    '<style>' + rpCommonCss + '</style>' +
    '</head><body>' +
    '<h1 style="text-align:center; font-size:22px; margin:0 0 16px; border-bottom:3px double #333; padding-bottom:8px;">工事完了報告書</h1>' +

    // 基本情報テーブル
    '<table class="section" style="margin-bottom:16px;">' +
      '<tr>' +
        '<td style="border:1px solid #333; padding:6px 10px; background:#f5f5f5; font-weight:bold; width:20%;">報告日</td>' +
        '<td style="border:1px solid #333; padding:6px 10px;">' + rpFormatDateJP(report.date) + '</td>' +
      '</tr>' +
      '<tr>' +
        '<td style="border:1px solid #333; padding:6px 10px; background:#f5f5f5; font-weight:bold;">工事名</td>' +
        '<td style="border:1px solid #333; padding:6px 10px;">' + rpEsc(report.kojiName || '') + '</td>' +
      '</tr>' +
      '<tr>' +
        '<td style="border:1px solid #333; padding:6px 10px; background:#f5f5f5; font-weight:bold;">現場名</td>' +
        '<td style="border:1px solid #333; padding:6px 10px;">' + rpEsc(report.genbaName || '') + '</td>' +
      '</tr>' +
      '<tr>' +
        '<td style="border:1px solid #333; padding:6px 10px; background:#f5f5f5; font-weight:bold;">住所</td>' +
        '<td style="border:1px solid #333; padding:6px 10px;">' + rpEsc(report.address || '') + '</td>' +
      '</tr>' +
      '<tr>' +
        '<td style="border:1px solid #333; padding:6px 10px; background:#f5f5f5; font-weight:bold;">工期</td>' +
        '<td style="border:1px solid #333; padding:6px 10px;">' + rpEsc(periodStr) + '</td>' +
      '</tr>' +
      '<tr>' +
        '<td style="border:1px solid #333; padding:6px 10px; background:#f5f5f5; font-weight:bold;">施工者</td>' +
        '<td style="border:1px solid #333; padding:6px 10px;">' + rpEsc(report.contractor || '') + '</td>' +
      '</tr>' +
      '<tr>' +
        '<td style="border:1px solid #333; padding:6px 10px; background:#f5f5f5; font-weight:bold;">担当者</td>' +
        '<td style="border:1px solid #333; padding:6px 10px;">' + rpEsc(report.tantousha || '') + '</td>' +
      '</tr>' +
    '</table>';

  // 施工内容（写真台帳の前に配置）
  if (report.sekoContent) {
    html +=
      '<div class="section">' +
        '<h2 style="font-size:16px; margin:20px 0 10px; border-bottom:2px solid #333; padding-bottom:4px;">施工内容</h2>' +
        '<div style="border:1px solid #ccc; padding:10px; border-radius:4px;">' + rpNl2br(report.sekoContent) + '</div>' +
      '</div>';
  }

  // 施工写真台帳
  if (photoSetsHtml) {
    html +=
      '<h2 style="font-size:16px; margin:20px 0 10px; border-bottom:2px solid #333; padding-bottom:4px;">施工写真台帳</h2>' +
      '<table>' +
        '<thead>' +
          '<tr style="background:#f0f0f0;">' +
            '<th style="border:1px solid #333; padding:6px; font-size:12px; width:15%;">部位</th>' +
            '<th style="border:1px solid #333; padding:6px; font-size:12px; width:42%;">施工前</th>' +
            '<th style="border:1px solid #333; padding:6px; font-size:12px; width:42%;">施工後</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' + photoSetsHtml + '</tbody>' +
      '</table>';
  }

  // 備考
  if (report.remarks) {
    html +=
      '<div class="section">' +
        '<h2 style="font-size:16px; margin:20px 0 10px; border-bottom:2px solid #333; padding-bottom:4px;">備考</h2>' +
        '<div style="border:1px solid #ccc; padding:10px; border-radius:4px;">' + rpNl2br(report.remarks) + '</div>' +
      '</div>';
  }

  // フッター
  html += '<div class="footer">現場Pro 設備くん</div>';
  html += '</body></html>';
  return html;
}

// === グローバル公開 ===
window.generateDailyReportPDF = generateDailyReportPDF;
window.generateCompletionReportPDF = generateCompletionReportPDF;

console.log('[report-pdf.js] ✓ Phase7 PDF出力モジュール読み込み完了 v1.10');
