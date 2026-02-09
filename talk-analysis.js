// ==========================================
// AIトーク解析のUI制御・結果表示・スケジュール連携
// 現場Pro 設備くん v0.51 - Phase5-1
// v0.51修正: ファイル読込対応・LINEヘッダー自動推定
// ==========================================

// 解析結果カテゴリ定義
var TALK_CATEGORIES = {
  progress: {
    icon: '✅',
    label: '進捗報告',
    color: '#4CAF50',
    bg: '#e8f5e9',
    description: '完了した作業・進んでいること'
  },
  problem: {
    icon: '⚠️',
    label: '問題・トラブル',
    color: '#FF9800',
    bg: '#fff3e0',
    description: '遅延・材料不足・トラブルなど'
  },
  schedule: {
    icon: '📅',
    label: '予定・約束',
    color: '#2196F3',
    bg: '#e3f2fd',
    description: '◯日に◯◯する、いつまでに等'
  },
  movement: {
    icon: '👷',
    label: '人の動き',
    color: '#9C27B0',
    bg: '#f3e5f5',
    description: '誰がどこに行く・来る等'
  }
};

// 現在の解析結果を保持
var _currentTalkResult = null;
var _currentTalkGenbaId = '';
var _currentTalkGenbaName = '';
// v0.51追加: ファイル読み込みテキスト保持
var _loadedTalkFileText = null;

// ==========================================
// 画面初期化
// ==========================================

async function initTalkAnalysisScreen() {
  await loadTalkGenbaList();
  initTalkFileInput();
  await loadTalkHistory();
}

// ==========================================
// 現場一覧読み込み
// ==========================================

async function loadTalkGenbaList() {
  var select = document.getElementById('talk-genba-select');
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
    console.error('[talk-analysis] 現場一覧読み込み失敗:', e);
  }
}

// ==========================================
// v0.51追加: 入力タブ切り替え
// ==========================================

function switchTalkInputTab(mode) {
  var pasteArea = document.getElementById('talk-paste-area');
  var fileArea = document.getElementById('talk-file-area');
  var tabPaste = document.getElementById('tab-paste');
  var tabFile = document.getElementById('tab-file');

  if (pasteArea) pasteArea.style.display = (mode === 'paste') ? 'block' : 'none';
  if (fileArea) fileArea.style.display = (mode === 'file') ? 'block' : 'none';
  if (tabPaste) tabPaste.classList.toggle('active', mode === 'paste');
  if (tabFile) tabFile.classList.toggle('active', mode === 'file');
}

// ==========================================
// v0.51追加: ファイル読み込み処理
// ==========================================

function initTalkFileInput() {
  var fileInput = document.getElementById('talk-file-input');
  if (!fileInput || fileInput._talkBound) return;
  fileInput._talkBound = true;

  fileInput.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.txt') && !file.name.endsWith('.text')) {
      alert('テキストファイル(.txt)を選択してください');
      fileInput.value = '';
      return;
    }

    var reader = new FileReader();
    reader.onload = function(ev) {
      var text = ev.target.result;

      // ファイル情報表示
      var nameEl = document.getElementById('talk-file-name');
      var sizeEl = document.getElementById('talk-file-size');
      var previewEl = document.getElementById('talk-file-content-preview');
      var previewWrap = document.getElementById('talk-file-preview');
      var dropZone = document.getElementById('talk-file-drop-zone');

      if (nameEl) nameEl.textContent = file.name;
      if (sizeEl) sizeEl.textContent = '(' + formatTalkFileSize(file.size) + ')';
      if (previewEl) previewEl.value = text.substring(0, 500) + (text.length > 500 ? '\n...(以下省略)' : '');
      if (previewWrap) previewWrap.style.display = 'block';
      if (dropZone) dropZone.style.display = 'none';

      // テキストを保持
      _loadedTalkFileText = text;

      // LINEヘッダーから現場名を自動推定
      autoDetectTalkGenba(text);
    };
    reader.onerror = function() {
      alert('ファイルの読み込みに失敗しました');
    };
    reader.readAsText(file);
  });
}

// v0.51追加: ファイルサイズのフォーマット
function formatTalkFileSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

// v0.51追加: ファイルクリア
function clearTalkFile() {
  var fileInput = document.getElementById('talk-file-input');
  if (fileInput) fileInput.value = '';
  var previewWrap = document.getElementById('talk-file-preview');
  if (previewWrap) previewWrap.style.display = 'none';
  var dropZone = document.getElementById('talk-file-drop-zone');
  if (dropZone) dropZone.style.display = 'block';
  _loadedTalkFileText = null;
}

// v0.51追加: LINEヘッダーから現場名を自動推定
function autoDetectTalkGenba(text) {
  // LINEトーク履歴のヘッダー: [LINE] グループ名のトーク履歴
  var headerMatch = text.match(/\[LINE\]\s*(.+?)のトーク履歴/);
  if (!headerMatch) return;

  var groupName = headerMatch[1].trim();
  var select = document.getElementById('talk-genba-select');
  if (!select) return;

  for (var i = 0; i < select.options.length; i++) {
    var optText = select.options[i].text;
    // 部分一致で検索（LINEグループ名に現場名が含まれている可能性）
    if (optText && (optText.indexOf(groupName) >= 0 || groupName.indexOf(optText) >= 0)) {
      select.value = select.options[i].value;
      console.log('[talk-analysis] LINEグループ名から現場を自動選択:', optText);
      return;
    }
  }
  console.log('[talk-analysis] LINEグループ名「' + groupName + '」に一致する現場が見つかりませんでした');
}

// ==========================================
// v0.51追加: テキスト取得（貼り付け/ファイル両対応）
// ==========================================

function getTalkInputText() {
  // ファイルモードでファイルが読み込まれている場合
  var fileArea = document.getElementById('talk-file-area');
  if (fileArea && fileArea.style.display !== 'none' && _loadedTalkFileText) {
    return _loadedTalkFileText;
  }
  // 貼り付けモード
  var input = document.getElementById('talk-input');
  return input ? input.value : '';
}

// ==========================================
// 入力クリア
// ==========================================

function clearTalkInput() {
  var input = document.getElementById('talk-input');
  if (input) input.value = '';
  clearTalkFile();
  var results = document.getElementById('talk-results');
  if (results) { results.style.display = 'none'; results.innerHTML = ''; }
  var error = document.getElementById('talk-error');
  if (error) error.style.display = 'none';
  _currentTalkResult = null;
}

// ==========================================
// 解析開始（v0.51修正: getTalkInputText()使用）
// ==========================================

async function startTalkAnalysis() {
  var genbaSelect = document.getElementById('talk-genba-select');
  var text = getTalkInputText().trim();

  // バリデーション
  if (!text) {
    alert('会話テキストを貼り付けるか、ファイルを読み込んでください');
    return;
  }
  if (text.length < 10) {
    alert('テキストが短すぎます。LINEの会話をもう少し貼り付けてください。');
    return;
  }

  _currentTalkGenbaId = genbaSelect ? genbaSelect.value : '';
  _currentTalkGenbaName = '';
  if (genbaSelect && genbaSelect.selectedIndex > 0) {
    _currentTalkGenbaName = genbaSelect.options[genbaSelect.selectedIndex].getAttribute('data-name') || genbaSelect.options[genbaSelect.selectedIndex].text;
  }

  // UI更新：ローディング表示
  var btn = document.getElementById('talk-analyze-btn');
  var loading = document.getElementById('talk-loading');
  var results = document.getElementById('talk-results');
  var error = document.getElementById('talk-error');

  if (btn) btn.disabled = true;
  if (loading) loading.style.display = 'block';
  if (results) { results.style.display = 'none'; results.innerHTML = ''; }
  if (error) error.style.display = 'none';

  try {
    // AI解析実行
    var result = await analyzeTalk(text, _currentTalkGenbaName);

    _currentTalkResult = result;

    // パースエラーチェック
    if (result.parseError) {
      // v0.51デバッグ用: AIが返した生テキストをそのまま表示
      showTalkError('JSONパースエラー: AIの応答を解析できませんでした。\n\n【AIの生レスポンス】\n' + (result.rawText || '(空)'));
      return;
    }

    // 結果表示
    displayTalkResults(result);

    // 履歴保存
    await saveTalkHistory(text, result, _currentTalkGenbaId, _currentTalkGenbaName);
    await loadTalkHistory();

  } catch (e) {
    console.error('[talk-analysis] 解析エラー:', e);
    // v0.51デバッグ用: エラー詳細をそのまま表示
    showTalkError(e.message || '解析に失敗しました。ネットワーク接続を確認してください。');
  } finally {
    if (btn) btn.disabled = false;
    if (loading) loading.style.display = 'none';
  }
}

// ==========================================
// エラー表示
// ==========================================

// v0.51デバッグ用: エラー詳細を改行付きで表示
function showTalkError(msg) {
  var error = document.getElementById('talk-error');
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

function displayTalkResults(result) {
  var container = document.getElementById('talk-results');
  if (!container) return;

  var html = '<div style="font-size: 15px; font-weight: bold; color: #374151; margin-bottom: 12px;">📊 解析結果</div>';

  // 結果の合計件数
  var totalItems = 0;
  var catKeys = ['progress', 'problem', 'schedule', 'movement'];
  for (var i = 0; i < catKeys.length; i++) {
    totalItems += (result[catKeys[i]] || []).length;
  }

  if (totalItems === 0) {
    html += '<div style="text-align: center; padding: 30px; color: #9ca3af; font-size: 14px;">工程管理に関する情報は見つかりませんでした。<br>業務に関する会話を貼り付けてみてください。</div>';
    container.innerHTML = html;
    container.style.display = 'block';
    return;
  }

  // 各カテゴリのカードを描画
  for (var j = 0; j < catKeys.length; j++) {
    var key = catKeys[j];
    var items = result[key] || [];
    if (items.length === 0) continue;
    html += renderTalkCategoryCard(key, items);
  }

  container.innerHTML = html;
  container.style.display = 'block';
}

// ==========================================
// カテゴリカード描画
// ==========================================

function renderTalkCategoryCard(categoryKey, items) {
  var cat = TALK_CATEGORIES[categoryKey];
  if (!cat) return '';

  var html = '<div class="analysis-card" style="background: ' + cat.bg + '; border-left: 4px solid ' + cat.color + ';">';

  // ヘッダー
  html += '<div class="analysis-card-header">' +
    '<span style="font-size: 20px;">' + cat.icon + '</span>' +
    '<span style="color: ' + cat.color + ';">' + cat.label + '</span>' +
    '<span style="font-size: 12px; color: #9ca3af; margin-left: auto;">' + items.length + '件</span>' +
    '</div>';

  // 各アイテム
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var itemId = categoryKey + '_' + i;

    html += '<div class="analysis-item">';
    html += '<div class="analysis-item-summary">' + escapeHtml(item.summary || '') + '</div>';
    if (item.detail) {
      html += '<div class="analysis-item-detail">' + escapeHtml(item.detail) + '</div>';
    }
    html += '<div class="analysis-item-meta">';
    if (item.who) {
      html += '<span>👤 ' + escapeHtml(item.who) + '</span>';
    }
    if (item.date) {
      html += '<span>📅 ' + escapeHtml(item.date) + '</span>';
    }
    if (item.confidence) {
      var confLabel = item.confidence === 'high' ? '高' : (item.confidence === 'medium' ? '中' : '低');
      html += '<span class="confidence-' + item.confidence + '">確度: ' + confLabel + '</span>';
    }
    if (item.severity) {
      var sevLabel = item.severity === 'high' ? '重大' : (item.severity === 'medium' ? '注意' : '軽微');
      html += '<span style="color: ' + (item.severity === 'high' ? '#F44336' : '#FF9800') + ';">重要度: ' + sevLabel + '</span>';
    }
    html += '</div>';

    // スケジュール反映ボタン（schedule/movementカテゴリで日付がある場合）
    if ((categoryKey === 'schedule' || categoryKey === 'movement') && item.date) {
      html += '<button id="apply-btn-' + itemId + '" class="apply-schedule-btn" onclick="applyTalkToSchedule(\'' + itemId + '\')">' +
        '📅 スケジュールに反映</button>';
    }

    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ==========================================
// スケジュール反映
// ==========================================

async function applyTalkToSchedule(itemId) {
  if (!_currentTalkResult) {
    alert('解析結果がありません');
    return;
  }

  // itemIdからカテゴリとインデックスを取得
  var parts = itemId.split('_');
  var catKey = parts[0];
  var idx = parseInt(parts[1]);
  var items = _currentTalkResult[catKey];
  if (!items || !items[idx]) {
    alert('該当する項目が見つかりません');
    return;
  }

  var item = items[idx];

  // syncTalkToSchedule()で一元連携（schedule-sync.js）
  var talkItem = {
    date: item.date || new Date().toISOString().split('T')[0],
    summary: item.summary || '',
    detail: item.detail || '',
    who: item.who || ''
  };

  try {
    var saved = await syncTalkToSchedule(talkItem, _currentTalkGenbaId, _currentTalkGenbaName);
    if (saved) {
      // ボタンを「反映済み」に変更
      var btn = document.getElementById('apply-btn-' + itemId);
      if (btn) {
        btn.textContent = '✅ スケジュールに追加しました';
        btn.classList.add('applied');
        btn.disabled = true;
      }
    } else {
      alert('スケジュールの保存に失敗しました。');
    }
  } catch (e) {
    console.error('[talk-analysis] スケジュール反映エラー:', e);
    alert('スケジュールの保存に失敗しました: ' + e.message);
  }
}

// ==========================================
// 解析履歴の保存
// ==========================================

async function saveTalkHistory(inputText, result, genbaId, genbaName) {
  try {
    var record = {
      genbaId: genbaId || '',
      genbaName: genbaName || '未指定',
      inputText: inputText,
      result: result,
      analyzedAt: new Date().toISOString(),
      appliedItems: []
    };
    await saveTalkAnalysis(record);
  } catch (e) {
    console.error('[talk-analysis] 履歴保存失敗:', e);
  }
}

// ==========================================
// 解析履歴の読み込み
// ==========================================

async function loadTalkHistory() {
  var listEl = document.getElementById('talk-history-list');
  if (!listEl) return;

  try {
    var histories = await getAllTalkAnalysis();

    if (histories.length === 0) {
      listEl.innerHTML = '<div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 13px;">まだ解析履歴がありません</div>';
      return;
    }

    var html = '';
    // 最新10件を表示
    var max = Math.min(histories.length, 10);
    for (var i = 0; i < max; i++) {
      var h = histories[i];
      var dateStr = '';
      if (h.analyzedAt) {
        var d = new Date(h.analyzedAt);
        dateStr = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      }
      // 結果件数
      var cnt = 0;
      if (h.result) {
        cnt = (h.result.progress || []).length + (h.result.problem || []).length + (h.result.schedule || []).length + (h.result.movement || []).length;
      }

      html += '<div class="history-item" onclick="showTalkHistoryDetail(\'' + h.id + '\')">' +
        '<div style="display: flex; justify-content: space-between; align-items: center;">' +
          '<div>' +
            '<div style="font-size: 14px; font-weight: bold; color: #374151;">' + escapeHtml(h.genbaName || '未指定') + '</div>' +
            '<div style="font-size: 12px; color: #9ca3af;">' + dateStr + ' / ' + cnt + '件抽出</div>' +
          '</div>' +
          '<div style="font-size: 18px; color: #d1d5db;">›</div>' +
        '</div>' +
      '</div>';
    }
    listEl.innerHTML = html;
  } catch (e) {
    console.error('[talk-analysis] 履歴読み込み失敗:', e);
    listEl.innerHTML = '<div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 13px;">履歴の読み込みに失敗しました</div>';
  }
}

// ==========================================
// 過去の解析結果を再表示
// ==========================================

async function showTalkHistoryDetail(id) {
  try {
    var record = await getTalkAnalysis(id);
    if (!record || !record.result) {
      alert('解析結果が見つかりません');
      return;
    }

    _currentTalkResult = record.result;
    _currentTalkGenbaId = record.genbaId || '';
    _currentTalkGenbaName = record.genbaName || '';

    // 貼り付けタブに切り替えてテキストを復元
    switchTalkInputTab('paste');
    var input = document.getElementById('talk-input');
    if (input) input.value = record.inputText || '';

    // 現場セレクトを復元
    var select = document.getElementById('talk-genba-select');
    if (select && record.genbaId) {
      select.value = record.genbaId;
    }

    // 結果表示
    displayTalkResults(record.result);

    // 画面上部にスクロール
    var resultsEl = document.getElementById('talk-results');
    if (resultsEl) resultsEl.scrollIntoView({ behavior: 'smooth' });

  } catch (e) {
    console.error('[talk-analysis] 履歴表示失敗:', e);
    alert('履歴の表示に失敗しました');
  }
}

// ==========================================
// 現場クイック追加
// ==========================================

async function quickAddGenbaTalk() {
  var name = prompt('新しい現場名を入力してください');
  if (!name || !name.trim()) return;

  try {
    var genba = { name: name.trim(), status: '進行中' };
    var saved = await saveGenba(genba);
    if (!saved) {
      alert('現場の保存に失敗しました');
      return;
    }
    // ドロップダウン再読み込み
    await loadTalkGenbaList();
    // 新規現場を自動選択
    var select = document.getElementById('talk-genba-select');
    if (select) select.value = saved.id;
  } catch (e) {
    console.error('[talk-analysis] 現場クイック追加エラー:', e);
    alert('現場の追加に失敗しました: ' + e.message);
  }
}

// ==========================================
// グローバル公開
// ==========================================
window.initTalkAnalysisScreen = initTalkAnalysisScreen;
window.loadTalkGenbaList = loadTalkGenbaList;
window.switchTalkInputTab = switchTalkInputTab;
window.clearTalkInput = clearTalkInput;
window.clearTalkFile = clearTalkFile;
window.startTalkAnalysis = startTalkAnalysis;
window.displayTalkResults = displayTalkResults;
window.applyTalkToSchedule = applyTalkToSchedule;
window.loadTalkHistory = loadTalkHistory;
window.showTalkHistoryDetail = showTalkHistoryDetail;
window.quickAddGenbaTalk = quickAddGenbaTalk;

console.log('[talk-analysis.js] ✓ トーク解析UIモジュール読み込み完了（v0.51 ファイル読込対応）');
