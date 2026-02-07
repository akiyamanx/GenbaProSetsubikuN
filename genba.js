// ==========================================
// 現場管理（genba.js）
// 現場Pro 設備くん v1.0
// ==========================================

let _genbaFilter = 'all';
let _genbaSelectedStatus = '進行中';

// ==========================================
// 現場一覧の表示
// ==========================================
async function initGenbaScreen() {
  // 保存ボタンのイベントバインド（毎回確認）
  bindGenbaSaveButton();
  await renderGenbaList();
}

// 保存ボタンにaddEventListenerをバインド
function bindGenbaSaveButton() {
  var btn = document.getElementById('genba-save-btn');
  if (!btn) {
    console.warn('[genba] genba-save-btn が見つかりません');
    return;
  }
  // 二重バインド防止
  if (btn._genbaBound) return;
  btn._genbaBound = true;
  btn.addEventListener('click', function() {
    console.log('[genba] 保存ボタンクリック検知');
    saveGenbaForm();
  });
  console.log('[genba] ✓ 保存ボタンにイベントをバインドしました');
}

async function renderGenbaList() {
  var list = await getAllGenba();
  var container = document.getElementById('genba-list');
  if (!container) return;

  // フィルター適用
  var filtered = list;
  if (_genbaFilter !== 'all') {
    filtered = list.filter(function(g) { return g.status === _genbaFilter; });
  }

  if (filtered.length === 0) {
    container.innerHTML =
      '<div style="text-align:center; padding:60px 20px;">' +
        '<div style="font-size:60px; margin-bottom:16px;">🏗️</div>' +
        '<div style="font-size:16px; color:#6b7280; margin-bottom:8px;">' +
          (_genbaFilter === 'all' ? '現場がまだ登録されていません' : '「' + _genbaFilter + '」の現場はありません') +
        '</div>' +
        '<button onclick="openGenbaForm()" style="margin-top:16px; padding:14px 32px; font-size:16px; font-weight:bold; background:linear-gradient(135deg, #f59e0b, #d97706); color:white; border:none; border-radius:12px; cursor:pointer;">＋ 現場を登録</button>' +
      '</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < filtered.length; i++) {
    var g = filtered[i];
    var statusBadge = getStatusBadge(g.status);
    var dateStr = '';
    if (g.startDate) {
      dateStr = formatDateShort(g.startDate);
      if (g.endDate) dateStr += ' 〜 ' + formatDateShort(g.endDate);
    }

    html +=
      '<div style="background:white; border-radius:14px; padding:16px; margin-bottom:12px; box-shadow:0 2px 8px rgba(0,0,0,0.08); border-left:4px solid ' + getStatusColor(g.status) + ';">' +
        '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">' +
          '<div style="flex:1;">' +
            '<div style="font-size:17px; font-weight:bold; color:#1f2937;">' + escapeHtml(g.name) + '</div>' +
            (g.clientName ? '<div style="font-size:13px; color:#6b7280; margin-top:2px;">👤 ' + escapeHtml(g.clientName) + '</div>' : '') +
          '</div>' +
          statusBadge +
        '</div>' +
        (g.address ? '<div style="font-size:13px; color:#6b7280; margin-bottom:6px;">📍 ' + escapeHtml(g.address) + '</div>' : '') +
        (dateStr ? '<div style="font-size:13px; color:#6b7280; margin-bottom:8px;">📅 ' + dateStr + '</div>' : '') +
        '<div style="display:flex; gap:8px; margin-top:10px;">' +
          '<button onclick="openGenbaForm(\'' + g.id + '\')" style="flex:1; padding:10px; font-size:14px; font-weight:bold; background:#eff6ff; color:#3b82f6; border:1px solid #bfdbfe; border-radius:8px; cursor:pointer;">編集</button>' +
          '<button onclick="showScreen(\'koutei\'); loadKouteiForGenba(\'' + g.id + '\')" style="flex:1; padding:10px; font-size:14px; font-weight:bold; background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; border-radius:8px; cursor:pointer;">工程表</button>' +
          '<button onclick="confirmDeleteGenba(\'' + g.id + '\', \'' + escapeHtml(g.name).replace(/'/g, "\\'") + '\')" style="padding:10px 14px; font-size:14px; background:#fef2f2; color:#ef4444; border:1px solid #fecaca; border-radius:8px; cursor:pointer;">削除</button>' +
        '</div>' +
      '</div>';
  }
  container.innerHTML = html;
}

// ==========================================
// フィルター
// ==========================================
function filterGenba(filter) {
  _genbaFilter = filter;
  // ボタンのactive切替
  var btns = document.querySelectorAll('.genba-filter-btn');
  btns.forEach(function(btn) {
    if (btn.getAttribute('data-filter') === filter) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  renderGenbaList();
}

// ==========================================
// モーダル開閉
// ==========================================
async function openGenbaForm(id) {
  var modal = document.getElementById('genba-modal');
  if (!modal) return;

  // 保存ボタンのバインド確認
  bindGenbaSaveButton();

  // フォームリセット
  document.getElementById('genba-edit-id').value = '';
  document.getElementById('genba-name').value = '';
  document.getElementById('genba-address').value = '';
  document.getElementById('genba-client').value = '';
  document.getElementById('genba-start').value = '';
  document.getElementById('genba-end').value = '';
  document.getElementById('genba-memo').value = '';
  _genbaSelectedStatus = '進行中';

  if (id) {
    // 編集モード
    var g = await getGenba(id);
    if (g) {
      document.getElementById('genba-modal-title').textContent = '現場を編集';
      document.getElementById('genba-edit-id').value = g.id;
      document.getElementById('genba-name').value = g.name || '';
      document.getElementById('genba-address').value = g.address || '';
      document.getElementById('genba-client').value = g.clientName || '';
      document.getElementById('genba-start').value = g.startDate || '';
      document.getElementById('genba-end').value = g.endDate || '';
      document.getElementById('genba-memo').value = g.memo || '';
      _genbaSelectedStatus = g.status || '進行中';
    }
  } else {
    document.getElementById('genba-modal-title').textContent = '現場を登録';
    // 開始日にデフォルトで今日をセット
    document.getElementById('genba-start').value = new Date().toISOString().split('T')[0];
  }

  updateGenbaStatusButtons();
  modal.style.display = 'block';
}

function closeGenbaModal() {
  var modal = document.getElementById('genba-modal');
  if (modal) modal.style.display = 'none';
}

// ==========================================
// ステータス選択
// ==========================================
function selectGenbaStatus(status) {
  _genbaSelectedStatus = status;
  updateGenbaStatusButtons();
}

function updateGenbaStatusButtons() {
  var btns = document.querySelectorAll('.genba-status-btn');
  btns.forEach(function(btn) {
    var s = btn.getAttribute('data-status');
    if (s === _genbaSelectedStatus) {
      btn.style.borderColor = getStatusColor(s);
      btn.style.background = getStatusBg(s);
      btn.style.color = getStatusColor(s);
    } else {
      btn.style.borderColor = '#e5e7eb';
      btn.style.background = 'white';
      btn.style.color = '#374151';
    }
  });
}

// ==========================================
// 保存
// ==========================================
async function saveGenbaForm() {
  console.log('[genba] saveGenbaForm 開始');

  // ボタンの視覚フィードバック
  var saveBtn = document.getElementById('genba-save-btn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
  }

  try {
    var name = document.getElementById('genba-name').value.trim();
    if (!name) {
      alert('現場名を入力してください');
      return;
    }

    var id = document.getElementById('genba-edit-id').value;
    var genba = {};

    if (id) {
      // 編集 - 既存データを取得してマージ
      try {
        genba = (await withTimeout(getGenba(id), 5000)) || {};
      } catch(e) {
        console.error('[genba] getGenba失敗:', e);
        genba = { id: id };
      }
    }

    genba.name = name;
    genba.address = document.getElementById('genba-address').value.trim();
    genba.clientName = document.getElementById('genba-client').value.trim();
    genba.startDate = document.getElementById('genba-start').value;
    genba.endDate = document.getElementById('genba-end').value;
    genba.status = _genbaSelectedStatus;
    genba.memo = document.getElementById('genba-memo').value.trim();

    console.log('[genba] 保存データ:', JSON.stringify(genba));

    var result = await withTimeout(saveGenba(genba), 8000);
    if (!result) {
      console.error('[genba] saveGenba returned null');
      alert('保存に失敗しました。アプリを再読み込みしてください。');
      return;
    }
    console.log('[genba] 保存成功:', result.id, result.name);
    closeGenbaModal();
    // ホーム画面に戻る
    showScreen('home');
  } catch(e) {
    console.error('[genba] saveGenba失敗:', e);
    if (e.message === 'TIMEOUT') {
      alert('保存がタイムアウトしました。ページを再読み込み（キャッシュクリア）してください。');
    } else {
      alert('保存に失敗しました: ' + e.message);
    }
  } finally {
    // ボタンを元に戻す
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存する';
    }
  }
}

// Promiseタイムアウトラッパー
function withTimeout(promise, ms) {
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      reject(new Error('TIMEOUT'));
    }, ms);
    promise.then(function(val) {
      clearTimeout(timer);
      resolve(val);
    }).catch(function(err) {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ==========================================
// 削除
// ==========================================
async function confirmDeleteGenba(id, name) {
  if (confirm('「' + name + '」を削除しますか？\n紐づく工程データも削除されます。')) {
    try {
      await deleteGenba(id);
      await renderGenbaList();
      if (typeof updateDashboard === 'function') updateDashboard();
    } catch(e) {
      console.error('deleteGenba失敗:', e);
      alert('削除に失敗しました。');
    }
  }
}

// ==========================================
// ユーティリティ
// ==========================================
function getStatusColor(status) {
  if (status === '進行中') return '#f59e0b';
  if (status === '予定') return '#3b82f6';
  if (status === '完了') return '#22c55e';
  return '#9ca3af';
}

function getStatusBg(status) {
  if (status === '進行中') return '#fffbeb';
  if (status === '予定') return '#eff6ff';
  if (status === '完了') return '#f0fdf4';
  return '#f9fafb';
}

function getStatusBadge(status) {
  var color = getStatusColor(status);
  var bg = getStatusBg(status);
  var icon = status === '進行中' ? '🔨' : status === '予定' ? '📋' : '✅';
  return '<span style="padding:4px 10px; background:' + bg + '; color:' + color + '; border:1px solid ' + color + '; border-radius:20px; font-size:12px; font-weight:bold; white-space:nowrap;">' + icon + ' ' + status + '</span>';
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.split('-');
  if (parts.length === 3) {
    return parseInt(parts[1]) + '/' + parseInt(parts[2]);
  }
  return dateStr;
}

// escapeHtmlはglobals.jsで定義済み

// ==========================================
// グローバル公開
// ==========================================
window.initGenbaScreen = initGenbaScreen;
window.renderGenbaList = renderGenbaList;
window.filterGenba = filterGenba;
window.openGenbaForm = openGenbaForm;
window.closeGenbaModal = closeGenbaModal;
window.selectGenbaStatus = selectGenbaStatus;
window.saveGenbaForm = saveGenbaForm;
window.bindGenbaSaveButton = bindGenbaSaveButton;
window.confirmDeleteGenba = confirmDeleteGenba;

console.log('[genba.js] ✓ 現場管理モジュール読み込み完了');
