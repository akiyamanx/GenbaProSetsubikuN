// ==========================================
// AI工程表取込のUI制御・結果表示・スケジュール連携
// 現場Pro 設備くん v0.52 - Phase5-2
// ==========================================

var _kouteiImportImageData = null;
var _kouteiImportFileName = '';
var _kouteiImportResult = null;
var _kouteiImportGenbaId = '';
var _kouteiImportGenbaName = '';

// ==========================================
// 画面初期化
// ==========================================
async function initKouteiImport() {
  await loadKouteiImportGenbaList();
  await loadKouteiImportHistory();
  clearKouteiPreview();
}

// ==========================================
// 現場一覧読み込み
// ==========================================
async function loadKouteiImportGenbaList() {
  var select = document.getElementById('koutei-import-genba-select');
  if (!select) return;

  try {
    var genbaList = await getAllGenba();
    var html = '<option value="">現場を選択してください</option>';
    for (var i = 0; i < genbaList.length; i++) {
      var g = genbaList[i];
      html += '<option value="' + g.id + '" data-name="' + escapeHtml(g.name) + '">' + escapeHtml(g.name) + '</option>';
    }
    select.innerHTML = html;
  } catch (e) {
    console.error('[koutei-import] 現場一覧読み込み失敗:', e);
  }
}

// ==========================================
// 現場クイック追加
// ==========================================
async function quickAddGenbaKouteiImport() {
  var name = prompt('新しい現場名を入力してください');
  if (!name || !name.trim()) return;

  try {
    var genba = { name: name.trim(), status: '進行中' };
    var saved = await saveGenba(genba);
    if (!saved) {
      alert('現場の保存に失敗しました');
      return;
    }
    await loadKouteiImportGenbaList();
    var select = document.getElementById('koutei-import-genba-select');
    if (select) select.value = saved.id;
  } catch (e) {
    console.error('[koutei-import] 現場クイック追加エラー:', e);
    alert('現場の追加に失敗しました: ' + e.message);
  }
}

// ==========================================
// ファイル選択トリガー
// ==========================================
function triggerKouteiCamera() {
  document.getElementById('kouteiCameraInput').click();
}

function triggerKouteiGallery() {
  document.getElementById('kouteiGalleryInput').click();
}

function triggerKouteiFile() {
  document.getElementById('kouteiFileInput').click();
}

// ==========================================
// ファイル選択ハンドラ
// ==========================================
function handleKouteiFileSelect(event, source) {
  var file = event.target.files[0];
  if (!file) return;

  // Excelファイルチェック
  var name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    alert('Excelファイルは直接読み込めません。\nスクリーンショットを撮って画像として取り込んでください。');
    event.target.value = '';
    return;
  }

  // PDFの場合
  if (file.type === 'application/pdf') {
    readFileAsBase64(file, function(dataUrl) {
      _kouteiImportImageData = dataUrl;
      _kouteiImportFileName = file.name;
      showKouteiPreviewPDF(file);
      updateKouteiAnalyzeBtn();
    });
    event.target.value = '';
    return;
  }

  // 画像の場合
  var reader = new FileReader();
  reader.onload = function(e) {
    _kouteiImportImageData = e.target.result;
    _kouteiImportFileName = file.name;
    showKouteiPreviewImage(e.target.result, file);
    updateKouteiAnalyzeBtn();
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

// ファイル→base64変換
function readFileAsBase64(file, callback) {
  var reader = new FileReader();
  reader.onload = function(e) {
    callback(e.target.result);
  };
  reader.readAsDataURL(file);
}

// ==========================================
// プレビュー表示
// ==========================================
function showKouteiPreviewImage(dataUrl, file) {
  var preview = document.getElementById('koutei-import-preview');
  var img = document.getElementById('kouteiPreviewImg');
  var nameEl = document.getElementById('kouteiFileName');
  var sizeEl = document.getElementById('kouteiFileSize');

  if (img) { img.src = dataUrl; img.style.display = 'block'; }
  if (nameEl) nameEl.textContent = file.name;
  if (sizeEl) sizeEl.textContent = '(' + formatKouteiFileSize(file.size) + ')';
  if (preview) preview.style.display = 'block';
}

function showKouteiPreviewPDF(file) {
  var preview = document.getElementById('koutei-import-preview');
  var img = document.getElementById('kouteiPreviewImg');
  var nameEl = document.getElementById('kouteiFileName');
  var sizeEl = document.getElementById('kouteiFileSize');

  // PDFはプレビュー画像なし
  if (img) img.style.display = 'none';
  if (nameEl) nameEl.textContent = '📄 ' + file.name;
  if (sizeEl) sizeEl.textContent = '(' + formatKouteiFileSize(file.size) + ')';
  if (preview) preview.style.display = 'block';
}

function clearKouteiPreview() {
  _kouteiImportImageData = null;
  _kouteiImportFileName = '';
  var preview = document.getElementById('koutei-import-preview');
  if (preview) preview.style.display = 'none';
  var results = document.getElementById('koutei-import-results');
  if (results) { results.style.display = 'none'; results.innerHTML = ''; }
  var error = document.getElementById('koutei-import-error');
  if (error) error.style.display = 'none';
  _kouteiImportResult = null;
  updateKouteiAnalyzeBtn();
}

function formatKouteiFileSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

function updateKouteiAnalyzeBtn() {
  var btn = document.getElementById('koutei-analyze-btn');
  if (btn) btn.disabled = !_kouteiImportImageData;
}

// ==========================================
// 解析開始
// ==========================================
async function startKouteiAnalysis() {
  if (!_kouteiImportImageData) {
    alert('画像またはPDFファイルを選択してください');
    return;
  }

  var genbaSelect = document.getElementById('koutei-import-genba-select');
  _kouteiImportGenbaId = genbaSelect ? genbaSelect.value : '';
  _kouteiImportGenbaName = '';
  if (genbaSelect && genbaSelect.selectedIndex > 0) {
    _kouteiImportGenbaName = genbaSelect.options[genbaSelect.selectedIndex].getAttribute('data-name') || genbaSelect.options[genbaSelect.selectedIndex].text;
  }

  // UI更新：ローディング表示
  var btn = document.getElementById('koutei-analyze-btn');
  var loading = document.getElementById('koutei-import-loading');
  var results = document.getElementById('koutei-import-results');
  var error = document.getElementById('koutei-import-error');

  if (btn) btn.disabled = true;
  if (loading) loading.style.display = 'block';
  if (results) { results.style.display = 'none'; results.innerHTML = ''; }
  if (error) error.style.display = 'none';

  try {
    // 画像リサイズ（PDFはそのまま）
    var base64Data, mimeType;
    if (_kouteiImportImageData.indexOf('data:application/pdf') === 0) {
      base64Data = _kouteiImportImageData.split(',')[1];
      mimeType = 'application/pdf';
    } else {
      var resized = await resizeImageForAPI(_kouteiImportImageData);
      base64Data = resized.base64;
      mimeType = resized.mimeType;
    }

    // AI解析実行
    var result = await analyzeKouteiImage(base64Data, mimeType, _kouteiImportGenbaName);
    _kouteiImportResult = result;

    // パースエラーチェック
    if (result.parseError) {
      showKouteiImportError('JSONパースエラー: AIの応答を解析できませんでした。\n\n【AIの生レスポンス】\n' + (result.rawText || '(空)'));
      return;
    }

    // 結果表示
    displayKouteiResults(result);

    // 履歴保存
    await saveKouteiImportHistory(result);
    await loadKouteiImportHistory();

  } catch (e) {
    console.error('[koutei-import] 解析エラー:', e);
    showKouteiImportError(e.message || '解析に失敗しました。ネットワーク接続を確認してください。');
  } finally {
    if (btn) btn.disabled = false;
    if (loading) loading.style.display = 'none';
  }
}

// エラー表示
function showKouteiImportError(msg) {
  var error = document.getElementById('koutei-import-error');
  if (error) {
    error.style.display = 'block';
    error.style.whiteSpace = 'pre-wrap';
    error.style.wordBreak = 'break-all';
    error.textContent = msg;
  }
}

// ==========================================
// 解析結果表示
// ==========================================
function displayKouteiResults(result) {
  var container = document.getElementById('koutei-import-results');
  if (!container) return;

  var items = result.koutei || [];
  var meta = result.metadata || {};

  var html = '<div style="font-size: 15px; font-weight: bold; color: #374151; margin-bottom: 12px;">📊 読み取り結果</div>';

  // メタデータ表示
  if (meta.projectName || meta.totalPeriod) {
    html += '<div class="koutei-metadata">';
    if (meta.projectName) html += '<div><strong>工事名:</strong> ' + escapeHtml(meta.projectName) + '</div>';
    if (meta.totalPeriod) html += '<div><strong>全体工期:</strong> ' + escapeHtml(meta.totalPeriod) + '</div>';
    if (meta.imageQuality) {
      var qLabel = meta.imageQuality === 'good' ? '良好' : (meta.imageQuality === 'fair' ? '普通' : '不鮮明');
      html += '<div><strong>画像品質:</strong> ' + qLabel + '</div>';
    }
    html += '</div>';
  }

  if (items.length === 0) {
    html += '<div style="text-align: center; padding: 30px; color: #9ca3af; font-size: 14px;">工程が読み取れませんでした。<br>画像を確認して再度お試しください。</div>';
    container.innerHTML = html;
    container.style.display = 'block';
    return;
  }

  // 全件反映ボタン
  html += '<button class="apply-all-btn" onclick="applyAllKouteiToSchedule()">✅ 全 ' + items.length + ' 件をまとめてスケジュールに反映</button>';

  // 各工程カード
  for (var i = 0; i < items.length; i++) {
    html += renderKouteiImportCard(items[i], i);
  }

  container.innerHTML = html;
  container.style.display = 'block';
}

// 工程カード描画
function renderKouteiImportCard(item, index) {
  var confLabel = item.confidence === 'high' ? '高' : (item.confidence === 'medium' ? '中' : '低');

  var html = '<div class="koutei-card" id="koutei-card-' + index + '">';
  html += '<div class="koutei-card-name">' + escapeHtml(item.name || '不明') + '</div>';

  if (item.startDate || item.endDate) {
    html += '<div class="koutei-card-period">📅 ';
    if (item.startDate) html += escapeHtml(item.startDate);
    if (item.startDate && item.endDate) html += ' 〜 ';
    if (item.endDate) html += escapeHtml(item.endDate);
    html += '</div>';
  }

  if (item.who) {
    html += '<div class="koutei-card-who">👷 ' + escapeHtml(item.who) + '</div>';
  }
  if (item.note) {
    html += '<div class="koutei-card-note">📝 ' + escapeHtml(item.note) + '</div>';
  }

  html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">';
  html += '<span class="confidence-' + item.confidence + '" style="font-size: 12px;">確度: ' + confLabel + '</span>';
  html += '<button id="koutei-apply-btn-' + index + '" class="apply-schedule-btn" onclick="applyKouteiToSchedule(' + index + ')">📅 スケジュールに反映</button>';
  html += '</div>';

  html += '</div>';
  return html;
}

// ==========================================
// スケジュール反映
// ==========================================

// 工程アイテムからスケジュールデータを生成
function buildKouteiScheduleData(item) {
  return {
    date: item.startDate || new Date().toISOString().split('T')[0],
    genbaId: _kouteiImportGenbaId || '',
    genbaName: _kouteiImportGenbaName || '',
    kouteiId: '', kouteiName: item.name || '',
    shokuninId: '', shokuninName: item.who || '',
    memo: '[工程取込] ' + (item.name || '') + (item.endDate ? '\n終了: ' + item.endDate : '') + (item.note ? '\n' + item.note : ''),
    source: 'koutei-import'
  };
}

// 反映済みボタンに変更
function markKouteiApplied(index) {
  var btn = document.getElementById('koutei-apply-btn-' + index);
  if (btn) { btn.textContent = '✅ 反映済み'; btn.classList.add('applied'); btn.disabled = true; }
}

// 1件反映
async function applyKouteiToSchedule(index) {
  if (!_kouteiImportResult || !_kouteiImportResult.koutei || !_kouteiImportResult.koutei[index]) {
    alert('該当する工程が見つかりません'); return;
  }
  try {
    var saved = await saveSchedule(buildKouteiScheduleData(_kouteiImportResult.koutei[index]));
    if (saved) { markKouteiApplied(index); }
    else { alert('スケジュールの保存に失敗しました。'); }
  } catch (e) {
    console.error('[koutei-import] スケジュール反映エラー:', e);
    alert('スケジュールの保存に失敗しました: ' + e.message);
  }
}

// 全件反映
async function applyAllKouteiToSchedule() {
  if (!_kouteiImportResult || !_kouteiImportResult.koutei || _kouteiImportResult.koutei.length === 0) {
    alert('反映する工程がありません'); return;
  }
  if (!confirm(_kouteiImportResult.koutei.length + '件の工程をスケジュールに反映しますか？')) return;
  var successCount = 0;
  var items = _kouteiImportResult.koutei;
  for (var i = 0; i < items.length; i++) {
    try {
      var saved = await saveSchedule(buildKouteiScheduleData(items[i]));
      if (saved) { successCount++; markKouteiApplied(i); }
    } catch (e) { console.error('[koutei-import] 全件反映エラー (index=' + i + '):', e); }
  }
  alert(successCount + '/' + items.length + '件をスケジュールに反映しました');
}

// ==========================================
// 取込履歴の保存・読み込み
// ==========================================
async function saveKouteiImportHistory(result) {
  try {
    var record = {
      genbaId: _kouteiImportGenbaId || '',
      genbaName: _kouteiImportGenbaName || '未指定',
      fileName: _kouteiImportFileName || '',
      result: result,
      importedAt: new Date().toISOString(),
      appliedItems: []
    };
    await saveKouteiImport(record);
  } catch (e) {
    console.error('[koutei-import] 履歴保存失敗:', e);
  }
}

async function loadKouteiImportHistory() {
  var listEl = document.getElementById('koutei-import-history-list');
  if (!listEl) return;

  try {
    var histories = await getAllKouteiImport();

    if (histories.length === 0) {
      listEl.innerHTML = '<div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 13px;">まだ取込履歴がありません</div>';
      return;
    }

    var html = '';
    var max = Math.min(histories.length, 10);
    for (var i = 0; i < max; i++) {
      var h = histories[i];
      var dateStr = '';
      if (h.importedAt) {
        var d = new Date(h.importedAt);
        dateStr = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      }
      var cnt = (h.result && h.result.koutei) ? h.result.koutei.length : 0;

      html += '<div class="history-item" onclick="showKouteiImportHistoryDetail(\'' + h.id + '\')">' +
        '<div style="display: flex; justify-content: space-between; align-items: center;">' +
          '<div>' +
            '<div style="font-size: 14px; font-weight: bold; color: #374151;">' + escapeHtml(h.genbaName || '未指定') + '</div>' +
            '<div style="font-size: 12px; color: #9ca3af;">' + dateStr + ' / ' + cnt + '工程 / ' + escapeHtml(h.fileName || '') + '</div>' +
          '</div>' +
          '<div style="font-size: 18px; color: #d1d5db;">›</div>' +
        '</div>' +
      '</div>';
    }
    listEl.innerHTML = html;
  } catch (e) {
    console.error('[koutei-import] 履歴読み込み失敗:', e);
    listEl.innerHTML = '<div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 13px;">履歴の読み込みに失敗しました</div>';
  }
}

// 過去の取込結果を再表示
async function showKouteiImportHistoryDetail(id) {
  try {
    var record = await getKouteiImport(id);
    if (!record || !record.result) {
      alert('取込結果が見つかりません');
      return;
    }

    _kouteiImportResult = record.result;
    _kouteiImportGenbaId = record.genbaId || '';
    _kouteiImportGenbaName = record.genbaName || '';

    // 現場セレクトを復元
    var select = document.getElementById('koutei-import-genba-select');
    if (select && record.genbaId) {
      select.value = record.genbaId;
    }

    // 結果表示
    displayKouteiResults(record.result);

    // 画面上部にスクロール
    var resultsEl = document.getElementById('koutei-import-results');
    if (resultsEl) resultsEl.scrollIntoView({ behavior: 'smooth' });

  } catch (e) {
    console.error('[koutei-import] 履歴表示失敗:', e);
    alert('履歴の表示に失敗しました');
  }
}

// グローバル公開
window.initKouteiImport = initKouteiImport;
window.loadKouteiImportGenbaList = loadKouteiImportGenbaList;
window.quickAddGenbaKouteiImport = quickAddGenbaKouteiImport;
window.triggerKouteiCamera = triggerKouteiCamera;
window.triggerKouteiGallery = triggerKouteiGallery;
window.triggerKouteiFile = triggerKouteiFile;
window.handleKouteiFileSelect = handleKouteiFileSelect;
window.clearKouteiPreview = clearKouteiPreview;
window.startKouteiAnalysis = startKouteiAnalysis;
window.displayKouteiResults = displayKouteiResults;
window.applyKouteiToSchedule = applyKouteiToSchedule;
window.applyAllKouteiToSchedule = applyAllKouteiToSchedule;
window.loadKouteiImportHistory = loadKouteiImportHistory;
window.showKouteiImportHistoryDetail = showKouteiImportHistoryDetail;

console.log('[koutei-import.js] ✓ 工程表取込UIモジュール読み込み完了（v0.52）');
