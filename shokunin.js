// ==========================================
// 職人・協力会社管理（shokunin.js）
// 現場Pro 設備くん v2.0 - Phase 2
// ==========================================

var _shokuninFilter = 'all';

var SHOKU_TYPES = ['大工','電気','配管','ガス','クロス','タイル','建具','塗装','美装','その他'];

// ==========================================
// 初期化
// ==========================================
async function initShokuninScreen() {
  bindShokuninSaveButton();
  await renderShokuninList();
}

// 保存ボタンにaddEventListenerをバインド
function bindShokuninSaveButton() {
  var btn = document.getElementById('shokunin-save-btn');
  if (!btn) {
    console.warn('[shokunin] shokunin-save-btn が見つかりません');
    return;
  }
  if (btn._shokuninBound) return;
  btn._shokuninBound = true;
  btn.addEventListener('click', function() {
    console.log('[shokunin] 保存ボタンクリック検知');
    saveShokuninForm();
  });
  console.log('[shokunin] ✓ 保存ボタンにイベントをバインドしました');
}

// ==========================================
// 一覧表示
// ==========================================
async function renderShokuninList() {
  var list = await getAllShokunin();
  var container = document.getElementById('shokunin-list');
  if (!container) return;

  // フィルター適用
  var filtered = list;
  if (_shokuninFilter !== 'all') {
    filtered = list.filter(function(s) { return s.shokuType === _shokuninFilter; });
  }

  if (filtered.length === 0) {
    container.innerHTML =
      '<div style="text-align:center; padding:60px 20px;">' +
        '<div style="font-size:60px; margin-bottom:16px;">👷</div>' +
        '<div style="font-size:16px; color:#6b7280; margin-bottom:8px;">' +
          (_shokuninFilter === 'all' ? '職人がまだ登録されていません' : '「' + _shokuninFilter + '」の職人はいません') +
        '</div>' +
        '<button onclick="openShokuninForm()" style="margin-top:16px; padding:14px 32px; font-size:16px; font-weight:bold; background:linear-gradient(135deg, #1e40af, #1e3a8a); color:white; border:none; border-radius:12px; cursor:pointer;">＋ 職人を登録</button>' +
      '</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < filtered.length; i++) {
    var s = filtered[i];
    var typeColor = getShokuTypeColor(s.shokuType);
    var rateStr = s.dailyRate ? Number(s.dailyRate).toLocaleString() + '円/日' : '';

    html +=
      '<div style="background:white; border-radius:14px; padding:16px; margin-bottom:12px; box-shadow:0 2px 8px rgba(0,0,0,0.08); border-left:4px solid ' + typeColor + ';">' +
        // 名前・職種
        '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">' +
          '<div style="flex:1;">' +
            '<div style="font-size:17px; font-weight:bold; color:#1f2937;">' + escapeHtml(s.name) + '</div>' +
            (rateStr ? '<div style="font-size:13px; color:#6b7280; margin-top:2px;">💰 ' + rateStr + '</div>' : '') +
          '</div>' +
          '<span style="padding:4px 10px; background:' + typeColor + '22; color:' + typeColor + '; border:1px solid ' + typeColor + '; border-radius:20px; font-size:12px; font-weight:bold; white-space:nowrap;">' + escapeHtml(s.shokuType) + '</span>' +
        '</div>' +
        // ワンタップ連絡ボタン
        '<div style="display:flex; gap:8px; margin-bottom:10px;">' +
          (s.phone ?
            '<a href="tel:' + escapeHtml(s.phone) + '" style="flex:1; display:flex; align-items:center; justify-content:center; gap:4px; padding:12px; font-size:14px; font-weight:bold; background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; border-radius:10px; text-decoration:none; cursor:pointer;">📞 電話</a>' : '') +
          (s.phone ?
            '<a href="sms:' + escapeHtml(s.phone) + '" style="flex:1; display:flex; align-items:center; justify-content:center; gap:4px; padding:12px; font-size:14px; font-weight:bold; background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; border-radius:10px; text-decoration:none; cursor:pointer;">💬 SMS</a>' : '') +
          (s.lineId ?
            '<a href="https://line.me/R/ti/p/' + encodeURIComponent(s.lineId) + '" target="_blank" style="flex:1; display:flex; align-items:center; justify-content:center; gap:4px; padding:12px; font-size:14px; font-weight:bold; background:#f0fdf4; color:#06c755; border:1px solid #86efac; border-radius:10px; text-decoration:none; cursor:pointer;">LINE</a>' : '') +
        '</div>' +
        // 編集・削除
        '<div style="display:flex; gap:8px;">' +
          '<button onclick="openShokuninForm(\'' + s.id + '\')" style="flex:1; padding:10px; font-size:14px; font-weight:bold; background:#eff6ff; color:#3b82f6; border:1px solid #bfdbfe; border-radius:8px; cursor:pointer;">編集</button>' +
          '<button onclick="confirmDeleteShokunin(\'' + s.id + '\', \'' + escapeHtml(s.name).replace(/'/g, "\\'") + '\')" style="padding:10px 14px; font-size:14px; background:#fef2f2; color:#ef4444; border:1px solid #fecaca; border-radius:8px; cursor:pointer;">削除</button>' +
        '</div>' +
      '</div>';
  }
  container.innerHTML = html;
}

// ==========================================
// フィルター
// ==========================================
function filterShokunin(filter) {
  _shokuninFilter = filter;
  var btns = document.querySelectorAll('.shokunin-filter-btn');
  btns.forEach(function(btn) {
    var f = btn.getAttribute('data-filter');
    if (f === filter) {
      btn.style.background = '#1e40af';
      btn.style.color = 'white';
      btn.style.borderColor = '#1e40af';
    } else {
      btn.style.background = 'white';
      btn.style.color = '#6b7280';
      btn.style.borderColor = '#d1d5db';
    }
  });
  renderShokuninList();
}

// ==========================================
// モーダル開閉
// ==========================================
async function openShokuninForm(id) {
  var modal = document.getElementById('shokunin-modal');
  if (!modal) return;

  bindShokuninSaveButton();

  // リセット
  document.getElementById('shokunin-edit-id').value = '';
  document.getElementById('shokunin-name').value = '';
  document.getElementById('shokunin-type').value = '大工';
  document.getElementById('shokunin-phone').value = '';
  document.getElementById('shokunin-email').value = '';
  document.getElementById('shokunin-line').value = '';
  document.getElementById('shokunin-rate').value = '';
  document.getElementById('shokunin-memo').value = '';

  if (id) {
    var s = await getShokunin(id);
    if (s) {
      document.getElementById('shokunin-modal-title').textContent = '職人を編集';
      document.getElementById('shokunin-edit-id').value = s.id;
      document.getElementById('shokunin-name').value = s.name || '';
      document.getElementById('shokunin-type').value = s.shokuType || '大工';
      document.getElementById('shokunin-phone').value = s.phone || '';
      document.getElementById('shokunin-email').value = s.email || '';
      document.getElementById('shokunin-line').value = s.lineId || '';
      document.getElementById('shokunin-rate').value = s.dailyRate || '';
      document.getElementById('shokunin-memo').value = s.memo || '';
    }
  } else {
    document.getElementById('shokunin-modal-title').textContent = '職人を登録';
  }

  modal.style.display = 'block';
}

function closeShokuninModal() {
  var modal = document.getElementById('shokunin-modal');
  if (modal) modal.style.display = 'none';
}

// ==========================================
// 保存
// ==========================================
async function saveShokuninForm() {
  console.log('[shokunin] saveShokuninForm 開始');

  var saveBtn = document.getElementById('shokunin-save-btn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
  }

  try {
    var name = document.getElementById('shokunin-name').value.trim();
    if (!name) {
      alert('名前を入力してください');
      return;
    }

    var id = document.getElementById('shokunin-edit-id').value;
    var shokunin = {};

    if (id) {
      try {
        shokunin = (await withTimeout(getShokunin(id), 5000)) || {};
      } catch(e) {
        console.error('[shokunin] getShokunin失敗:', e);
        shokunin = { id: id };
      }
    }

    shokunin.name = name;
    shokunin.shokuType = document.getElementById('shokunin-type').value;
    shokunin.phone = document.getElementById('shokunin-phone').value.trim();
    shokunin.email = document.getElementById('shokunin-email').value.trim();
    shokunin.lineId = document.getElementById('shokunin-line').value.trim();
    shokunin.dailyRate = document.getElementById('shokunin-rate').value ? parseInt(document.getElementById('shokunin-rate').value) : 0;
    shokunin.memo = document.getElementById('shokunin-memo').value.trim();

    console.log('[shokunin] 保存データ:', JSON.stringify(shokunin));

    var result = await withTimeout(saveShokunin(shokunin), 8000);
    if (!result) {
      console.error('[shokunin] saveShokunin returned null');
      alert('保存に失敗しました。アプリを再読み込みしてください。');
      return;
    }
    console.log('[shokunin] 保存成功:', result.id, result.name);
    closeShokuninModal();
    await renderShokuninList();
  } catch(e) {
    console.error('[shokunin] saveShokunin失敗:', e);
    if (e.message === 'TIMEOUT') {
      alert('保存がタイムアウトしました。ページを再読み込みしてください。');
    } else {
      alert('保存に失敗しました: ' + e.message);
    }
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存する';
    }
  }
}

// withTimeoutはgenba.jsで定義済み。未定義の場合のフォールバック
if (typeof withTimeout !== 'function') {
  function withTimeout(promise, ms) {
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() { reject(new Error('TIMEOUT')); }, ms);
      promise.then(function(v) { clearTimeout(timer); resolve(v); })
             .catch(function(e) { clearTimeout(timer); reject(e); });
    });
  }
  window.withTimeout = withTimeout;
}

// ==========================================
// 削除
// ==========================================
async function confirmDeleteShokunin(id, name) {
  if (confirm('「' + name + '」を削除しますか？')) {
    try {
      await deleteShokunin(id);
      await renderShokuninList();
    } catch(e) {
      console.error('[shokunin] deleteShokunin失敗:', e);
      alert('削除に失敗しました。');
    }
  }
}

// ==========================================
// ユーティリティ
// ==========================================
function getShokuTypeColor(type) {
  var colors = {
    '大工': '#d97706',
    '電気': '#2563eb',
    '配管': '#059669',
    'ガス': '#dc2626',
    'クロス': '#7c3aed',
    'タイル': '#0891b2',
    '建具': '#92400e',
    '塗装': '#c026d3',
    '美装': '#ec4899',
    'その他': '#6b7280'
  };
  return colors[type] || '#6b7280';
}

// ==========================================
// グローバル公開
// ==========================================
window.initShokuninScreen = initShokuninScreen;
window.renderShokuninList = renderShokuninList;
window.filterShokunin = filterShokunin;
window.openShokuninForm = openShokuninForm;
window.closeShokuninModal = closeShokuninModal;
window.saveShokuninForm = saveShokuninForm;
window.bindShokuninSaveButton = bindShokuninSaveButton;
window.confirmDeleteShokunin = confirmDeleteShokunin;
window.getShokuTypeColor = getShokuTypeColor;

console.log('[shokunin.js] ✓ 職人管理モジュール読み込み完了');
