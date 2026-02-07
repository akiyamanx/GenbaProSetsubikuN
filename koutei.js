// ==========================================
// 工程表管理（koutei.js）
// 現場Pro 設備くん v1.0
// ガントチャート風の工程管理
// ==========================================

let _currentKouteiGenbaId = '';
let _kouteiSelectedColor = '#3b82f6';

// ==========================================
// 初期化
// ==========================================
async function initKouteiScreen() {
  await populateGenbaSelect();
  if (_currentKouteiGenbaId) {
    var sel = document.getElementById('koutei-genba-select');
    if (sel) sel.value = _currentKouteiGenbaId;
    await renderKouteiChart(_currentKouteiGenbaId);
  }
}

// 現場一覧からの遷移用
async function loadKouteiForGenba(genbaId) {
  _currentKouteiGenbaId = genbaId;
  await populateGenbaSelect();
  var sel = document.getElementById('koutei-genba-select');
  if (sel) sel.value = genbaId;
  await renderKouteiChart(genbaId);
}

// ==========================================
// 現場セレクタ
// ==========================================
async function populateGenbaSelect() {
  var sel = document.getElementById('koutei-genba-select');
  if (!sel) return;
  var genbaList = await getAllGenba();
  var html = '<option value="">-- 現場を選択 --</option>';
  for (var i = 0; i < genbaList.length; i++) {
    var g = genbaList[i];
    html += '<option value="' + g.id + '">' + escapeHtml(g.name) + '</option>';
  }
  sel.innerHTML = html;
}

function onKouteiGenbaChange() {
  var sel = document.getElementById('koutei-genba-select');
  if (!sel) return;
  _currentKouteiGenbaId = sel.value;
  if (_currentKouteiGenbaId) {
    renderKouteiChart(_currentKouteiGenbaId);
  } else {
    var area = document.getElementById('koutei-chart-area');
    if (area) {
      area.innerHTML =
        '<div style="text-align:center; padding:40px; color:#9ca3af;">' +
          '<div style="font-size:60px; margin-bottom:16px;">📊</div>' +
          '<div style="font-size:16px;">現場を選択してください</div>' +
        '</div>';
    }
  }
}

// ==========================================
// ガントチャート描画
// ==========================================
async function renderKouteiChart(genbaId) {
  var area = document.getElementById('koutei-chart-area');
  if (!area) return;

  var kouteiList = await getKouteiByGenba(genbaId);
  var genba = await getGenba(genbaId);

  // ヘッダータイトル更新
  var title = document.getElementById('koutei-header-title');
  if (title && genba) {
    title.textContent = '工程表: ' + genba.name;
  }

  if (kouteiList.length === 0) {
    area.innerHTML =
      '<div style="text-align:center; padding:60px 20px;">' +
        '<div style="font-size:60px; margin-bottom:16px;">📋</div>' +
        '<div style="font-size:16px; color:#6b7280; margin-bottom:8px;">工程がまだ登録されていません</div>' +
        '<button onclick="openKouteiForm()" style="margin-top:16px; padding:14px 32px; font-size:16px; font-weight:bold; background:linear-gradient(135deg, #22c55e, #16a34a); color:white; border:none; border-radius:12px; cursor:pointer;">＋ 工程を追加</button>' +
      '</div>';
    return;
  }

  // 日付範囲を計算
  var minDate = null;
  var maxDate = null;
  for (var i = 0; i < kouteiList.length; i++) {
    var k = kouteiList[i];
    if (k.startDate) {
      var sd = new Date(k.startDate);
      if (!minDate || sd < minDate) minDate = sd;
    }
    if (k.endDate) {
      var ed = new Date(k.endDate);
      if (!maxDate || ed > maxDate) maxDate = ed;
    }
  }

  if (!minDate) minDate = new Date();
  if (!maxDate) maxDate = new Date(minDate.getTime() + 14 * 86400000);

  // 前後に1日余裕
  var chartStart = new Date(minDate.getTime() - 86400000);
  var chartEnd = new Date(maxDate.getTime() + 86400000);
  var totalDays = Math.ceil((chartEnd - chartStart) / 86400000) + 1;
  if (totalDays < 7) totalDays = 7;

  var dayWidth = 40; // 1日あたりの幅(px)
  var chartWidth = totalDays * dayWidth;

  // ヘッダー（日付行）
  var headerHtml = '<div style="display:flex; border-bottom:2px solid #e5e7eb; min-width:' + (180 + chartWidth) + 'px;">';
  headerHtml += '<div style="min-width:180px; padding:8px; font-weight:bold; font-size:12px; color:#374151; border-right:1px solid #e5e7eb;">工程名</div>';
  for (var d = 0; d < totalDays; d++) {
    var day = new Date(chartStart.getTime() + d * 86400000);
    var isWeekend = (day.getDay() === 0 || day.getDay() === 6);
    var isToday = isSameDay(day, new Date());
    var dayBg = isToday ? '#fef3c7' : (isWeekend ? '#f9fafb' : 'transparent');
    headerHtml += '<div style="min-width:' + dayWidth + 'px; max-width:' + dayWidth + 'px; padding:4px 2px; text-align:center; font-size:10px; border-right:1px solid #f3f4f6; background:' + dayBg + ';">';
    headerHtml += '<div style="color:' + (isWeekend ? '#ef4444' : '#6b7280') + ';">' + (day.getMonth() + 1) + '/' + day.getDate() + '</div>';
    headerHtml += '<div style="color:#9ca3af; font-size:9px;">' + ['日','月','火','水','木','金','土'][day.getDay()] + '</div>';
    headerHtml += '</div>';
  }
  headerHtml += '</div>';

  // 行（各工程）
  var rowsHtml = '';
  for (var i = 0; i < kouteiList.length; i++) {
    var k = kouteiList[i];
    var color = k.color || '#3b82f6';

    rowsHtml += '<div style="display:flex; border-bottom:1px solid #f3f4f6; min-width:' + (180 + chartWidth) + 'px; align-items:stretch;">';

    // 工程名セル
    rowsHtml += '<div style="min-width:180px; max-width:180px; padding:10px 8px; border-right:1px solid #e5e7eb; display:flex; flex-direction:column; justify-content:center;">';
    rowsHtml += '<div style="font-size:13px; font-weight:bold; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(k.name) + '</div>';
    rowsHtml += '<div style="font-size:11px; color:#9ca3af; margin-top:2px;">' + (k.progress || 0) + '%</div>';
    rowsHtml += '<div style="display:flex; gap:4px; margin-top:4px;">';
    rowsHtml += '<button onclick="openKouteiForm(\'' + k.id + '\')" style="padding:2px 8px; font-size:10px; background:#eff6ff; color:#3b82f6; border:1px solid #bfdbfe; border-radius:4px; cursor:pointer;">編集</button>';
    rowsHtml += '<button onclick="confirmDeleteKoutei(\'' + k.id + '\', \'' + escapeHtml(k.name).replace(/'/g, "\\'") + '\')" style="padding:2px 8px; font-size:10px; background:#fef2f2; color:#ef4444; border:1px solid #fecaca; border-radius:4px; cursor:pointer;">削除</button>';
    rowsHtml += '</div>';
    rowsHtml += '</div>';

    // ガントバー描画エリア
    rowsHtml += '<div style="flex:1; position:relative; min-height:50px;">';

    // 背景グリッド（週末と今日ハイライト）
    for (var d = 0; d < totalDays; d++) {
      var day = new Date(chartStart.getTime() + d * 86400000);
      var isWeekend = (day.getDay() === 0 || day.getDay() === 6);
      var isToday = isSameDay(day, new Date());
      if (isWeekend || isToday) {
        var bgColor = isToday ? '#fef3c7' : '#f9fafb';
        rowsHtml += '<div style="position:absolute; left:' + (d * dayWidth) + 'px; top:0; width:' + dayWidth + 'px; height:100%; background:' + bgColor + ';"></div>';
      }
    }

    // ガントバー
    if (k.startDate && k.endDate) {
      var barStart = Math.max(0, Math.floor((new Date(k.startDate) - chartStart) / 86400000));
      var barEnd = Math.floor((new Date(k.endDate) - chartStart) / 86400000) + 1;
      var barLeft = barStart * dayWidth;
      var barWidth = (barEnd - barStart) * dayWidth;
      var progress = k.progress || 0;

      rowsHtml += '<div style="position:absolute; left:' + barLeft + 'px; top:12px; width:' + barWidth + 'px; height:26px; background:' + color + '33; border-radius:6px; overflow:hidden; border:1px solid ' + color + ';">';
      // 進捗バー
      if (progress > 0) {
        rowsHtml += '<div style="width:' + progress + '%; height:100%; background:' + color + '; border-radius:5px;"></div>';
      }
      rowsHtml += '</div>';
    }

    rowsHtml += '</div>';
    rowsHtml += '</div>';
  }

  // 今日の縦線
  var todayOffset = Math.floor((new Date() - chartStart) / 86400000);
  var todayLineHtml = '';
  if (todayOffset >= 0 && todayOffset < totalDays) {
    todayLineHtml = '<div style="position:absolute; left:' + (180 + todayOffset * dayWidth + dayWidth / 2) + 'px; top:0; width:2px; height:100%; background:#ef4444; z-index:10; opacity:0.6;"></div>';
  }

  area.innerHTML =
    '<div style="overflow-x:auto; border:1px solid #e5e7eb; border-radius:12px; background:white; position:relative;">' +
      todayLineHtml +
      headerHtml +
      rowsHtml +
    '</div>' +
    '<div style="text-align:center; padding:16px;">' +
      '<button onclick="openKouteiForm()" style="padding:14px 32px; font-size:16px; font-weight:bold; background:linear-gradient(135deg, #22c55e, #16a34a); color:white; border:none; border-radius:12px; cursor:pointer;">＋ 工程を追加</button>' +
    '</div>';
}

// ==========================================
// モーダル
// ==========================================
async function openKouteiForm(id) {
  if (!_currentKouteiGenbaId) {
    alert('先に現場を選択してください');
    return;
  }
  var modal = document.getElementById('koutei-modal');
  if (!modal) return;

  // リセット
  document.getElementById('koutei-edit-id').value = '';
  document.getElementById('koutei-name').value = '';
  document.getElementById('koutei-start').value = new Date().toISOString().split('T')[0];
  document.getElementById('koutei-end').value = '';
  document.getElementById('koutei-progress').value = 0;
  document.getElementById('koutei-progress-val').textContent = '0%';
  document.getElementById('koutei-memo').value = '';
  _kouteiSelectedColor = '#3b82f6';

  if (id) {
    var k = await getKoutei(id);
    if (k) {
      document.getElementById('koutei-modal-title').textContent = '工程を編集';
      document.getElementById('koutei-edit-id').value = k.id;
      document.getElementById('koutei-name').value = k.name || '';
      document.getElementById('koutei-start').value = k.startDate || '';
      document.getElementById('koutei-end').value = k.endDate || '';
      document.getElementById('koutei-progress').value = k.progress || 0;
      document.getElementById('koutei-progress-val').textContent = (k.progress || 0) + '%';
      document.getElementById('koutei-memo').value = k.memo || '';
      _kouteiSelectedColor = k.color || '#3b82f6';
    }
  } else {
    document.getElementById('koutei-modal-title').textContent = '工程を追加';
  }

  updateKouteiColorPicker();
  modal.style.display = 'block';
}

function closeKouteiModal() {
  var modal = document.getElementById('koutei-modal');
  if (modal) modal.style.display = 'none';
}

// ==========================================
// 色選択
// ==========================================
function selectKouteiColor(color) {
  _kouteiSelectedColor = color;
  updateKouteiColorPicker();
}

function updateKouteiColorPicker() {
  var btns = document.querySelectorAll('.koutei-color-btn');
  btns.forEach(function(btn) {
    if (btn.getAttribute('data-color') === _kouteiSelectedColor) {
      btn.style.borderColor = btn.getAttribute('data-color');
      btn.style.transform = 'scale(1.2)';
    } else {
      btn.style.borderColor = 'transparent';
      btn.style.transform = 'scale(1)';
    }
  });
}

// ==========================================
// 保存
// ==========================================
async function saveKouteiForm() {
  var name = document.getElementById('koutei-name').value.trim();
  if (!name) {
    alert('工程名を入力してください');
    return;
  }

  var id = document.getElementById('koutei-edit-id').value;
  var koutei = {};

  if (id) {
    koutei = (await getKoutei(id)) || {};
  }

  koutei.genbaId = _currentKouteiGenbaId;
  koutei.name = name;
  koutei.startDate = document.getElementById('koutei-start').value;
  koutei.endDate = document.getElementById('koutei-end').value;
  koutei.progress = parseInt(document.getElementById('koutei-progress').value) || 0;
  koutei.color = _kouteiSelectedColor;
  koutei.memo = document.getElementById('koutei-memo').value.trim();

  await saveKoutei(koutei);
  closeKouteiModal();
  await renderKouteiChart(_currentKouteiGenbaId);
}

// ==========================================
// 削除
// ==========================================
async function confirmDeleteKoutei(id, name) {
  if (confirm('工程「' + name + '」を削除しますか？')) {
    await deleteKoutei(id);
    await renderKouteiChart(_currentKouteiGenbaId);
  }
}

// ==========================================
// ユーティリティ
// ==========================================
function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

// escapeHtmlはgenba.jsで定義済み

// ==========================================
// グローバル公開
// ==========================================
window.initKouteiScreen = initKouteiScreen;
window.loadKouteiForGenba = loadKouteiForGenba;
window.populateGenbaSelect = populateGenbaSelect;
window.onKouteiGenbaChange = onKouteiGenbaChange;
window.renderKouteiChart = renderKouteiChart;
window.openKouteiForm = openKouteiForm;
window.closeKouteiModal = closeKouteiModal;
window.selectKouteiColor = selectKouteiColor;
window.saveKouteiForm = saveKouteiForm;
window.confirmDeleteKoutei = confirmDeleteKoutei;

console.log('[koutei.js] ✓ 工程表モジュール読み込み完了');
