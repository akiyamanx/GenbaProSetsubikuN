// ==========================================
// スケジュール管理（schedule.js）
// 現場Pro 設備くん v2.0 - Phase 2
// カレンダー表示 + 職人アサイン
// ==========================================

var _scheduleYear = new Date().getFullYear();
var _scheduleMonth = new Date().getMonth(); // 0-based
var _scheduleSelectedDate = '';

// ==========================================
// 初期化
// ==========================================
async function initScheduleScreen() {
  bindScheduleSaveButton();
  await renderCalendar(_scheduleYear, _scheduleMonth);
}

function bindScheduleSaveButton() {
  var btn = document.getElementById('schedule-save-btn');
  if (!btn) {
    console.warn('[schedule] schedule-save-btn が見つかりません');
    return;
  }
  if (btn._scheduleBound) return;
  btn._scheduleBound = true;
  btn.addEventListener('click', function() {
    console.log('[schedule] 保存ボタンクリック検知');
    saveScheduleForm();
  });
  console.log('[schedule] ✓ 保存ボタンにイベントをバインドしました');
}

// ==========================================
// カレンダー描画
// ==========================================
async function renderCalendar(year, month) {
  var calEl = document.getElementById('schedule-calendar');
  if (!calEl) return;

  // 月ラベル更新
  var labelEl = document.getElementById('schedule-month-label');
  if (labelEl) {
    labelEl.textContent = year + '年' + (month + 1) + '月';
  }

  // その月のスケジュール取得
  var ym = year + '-' + String(month + 1).padStart(2, '0');
  var schedules = [];
  try {
    schedules = await getScheduleByMonth(ym);
  } catch(e) {
    console.error('[schedule] getScheduleByMonth失敗:', e);
  }

  // 日ごとのスケジュールマップ作成
  var dayMap = {};
  for (var i = 0; i < schedules.length; i++) {
    var sc = schedules[i];
    if (!dayMap[sc.date]) dayMap[sc.date] = [];
    dayMap[sc.date].push(sc);
  }

  // カレンダー計算
  var firstDay = new Date(year, month, 1);
  var lastDay = new Date(year, month + 1, 0);
  var startDow = firstDay.getDay(); // 0=日
  var totalDays = lastDay.getDate();
  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

  // 曜日ヘッダー
  var html = '<div style="display:grid; grid-template-columns:repeat(7,1fr); gap:2px; margin-bottom:4px;">';
  var dowNames = ['日','月','火','水','木','金','土'];
  var dowColors = ['#ef4444','#374151','#374151','#374151','#374151','#374151','#3b82f6'];
  for (var d = 0; d < 7; d++) {
    html += '<div style="text-align:center; font-size:12px; font-weight:bold; color:' + dowColors[d] + '; padding:6px 0;">' + dowNames[d] + '</div>';
  }
  html += '</div>';

  // 日セル
  html += '<div style="display:grid; grid-template-columns:repeat(7,1fr); gap:2px;">';

  // 空セル（月初の前）
  for (var e = 0; e < startDow; e++) {
    html += '<div style="min-height:52px;"></div>';
  }

  // 各日
  for (var day = 1; day <= totalDays; day++) {
    var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    var isToday = (dateStr === todayStr);
    var dow = (startDow + day - 1) % 7;
    var isWeekend = (dow === 0 || dow === 6);
    var entries = dayMap[dateStr] || [];

    var hasGenba = false;
    var hasShokunin = false;
    for (var j = 0; j < entries.length; j++) {
      if (entries[j].genbaId) hasGenba = true;
      if (entries[j].shokuninId) hasShokunin = true;
    }

    var cellBg = isToday ? '#fef3c7' : (isWeekend ? '#f9fafb' : 'white');
    var cellBorder = isToday ? '2px solid #f59e0b' : '1px solid #f3f4f6';
    var dayColor = dow === 0 ? '#ef4444' : (dow === 6 ? '#3b82f6' : '#374151');

    html +=
      '<div onclick="showDayDetail(\'' + dateStr + '\')" style="min-height:52px; background:' + cellBg + '; border:' + cellBorder + '; border-radius:8px; padding:4px; cursor:pointer; position:relative;">' +
        '<div style="font-size:13px; font-weight:' + (isToday ? 'bold' : 'normal') + '; color:' + dayColor + ';">' + day + '</div>' +
        '<div style="display:flex; gap:2px; flex-wrap:wrap; margin-top:2px;">' +
          (hasGenba ? '<span style="width:8px; height:8px; border-radius:50%; background:#f59e0b; display:inline-block;"></span>' : '') +
          (hasShokunin ? '<span style="width:8px; height:8px; border-radius:50%; background:#1e40af; display:inline-block;"></span>' : '') +
        '</div>' +
        (entries.length > 0 ? '<div style="font-size:9px; color:#9ca3af; position:absolute; bottom:2px; right:4px;">' + entries.length + '件</div>' : '') +
      '</div>';
  }

  html += '</div>';
  calEl.innerHTML = html;

  // 日詳細パネルを非表示
  var detailEl = document.getElementById('schedule-day-detail');
  if (detailEl) detailEl.style.display = 'none';
}

// ==========================================
// 月送り
// ==========================================
function prevMonth() {
  _scheduleMonth--;
  if (_scheduleMonth < 0) { _scheduleMonth = 11; _scheduleYear--; }
  renderCalendar(_scheduleYear, _scheduleMonth);
}

function nextMonth() {
  _scheduleMonth++;
  if (_scheduleMonth > 11) { _scheduleMonth = 0; _scheduleYear++; }
  renderCalendar(_scheduleYear, _scheduleMonth);
}

function goToday() {
  var now = new Date();
  _scheduleYear = now.getFullYear();
  _scheduleMonth = now.getMonth();
  renderCalendar(_scheduleYear, _scheduleMonth);
  // 今日の詳細も表示
  var todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  showDayDetail(todayStr);
}

// ==========================================
// 日詳細パネル
// ==========================================
async function showDayDetail(dateStr) {
  _scheduleSelectedDate = dateStr;
  var detailEl = document.getElementById('schedule-day-detail');
  if (!detailEl) return;

  var entries = [];
  try {
    entries = await getScheduleByDate(dateStr);
  } catch(e) {
    console.error('[schedule] getScheduleByDate失敗:', e);
  }

  // 日付表示
  var parts = dateStr.split('-');
  var dateLabel = parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
  var dayOfWeek = ['日','月','火','水','木','金','土'][new Date(dateStr).getDay()];

  var html =
    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">' +
      '<div style="font-size:18px; font-weight:bold; color:#1f2937;">' + dateLabel + '（' + dayOfWeek + '）</div>' +
      '<button onclick="openScheduleForm(\'' + dateStr + '\')" style="padding:10px 20px; font-size:14px; font-weight:bold; background:linear-gradient(135deg, #7c3aed, #5b21b6); color:white; border:none; border-radius:10px; cursor:pointer;">＋ 追加</button>' +
    '</div>';

  if (entries.length === 0) {
    html +=
      '<div style="background:white; border-radius:12px; padding:30px; text-align:center; color:#9ca3af; font-size:14px;">' +
        '予定はありません' +
      '</div>';
  } else {
    for (var i = 0; i < entries.length; i++) {
      var sc = entries[i];
      var borderColor = sc.shokuninId ? '#1e40af' : '#f59e0b';

      html +=
        '<div style="background:white; border-radius:12px; padding:14px; margin-bottom:8px; border-left:4px solid ' + borderColor + '; box-shadow:0 1px 4px rgba(0,0,0,0.06);">' +
          (sc.genbaName ? '<div style="font-size:15px; font-weight:bold; color:#1f2937;">🏗️ ' + escapeHtml(sc.genbaName) + '</div>' : '') +
          (sc.kouteiName ? '<div style="font-size:13px; color:#6b7280; margin-top:2px;">📋 ' + escapeHtml(sc.kouteiName) + '</div>' : '') +
          (sc.shokuninName ? '<div style="font-size:13px; color:#1e40af; margin-top:2px;">👷 ' + escapeHtml(sc.shokuninName) + '</div>' : '') +
          (sc.memo ? '<div style="font-size:12px; color:#9ca3af; margin-top:4px;">' + escapeHtml(sc.memo) + '</div>' : '') +
          '<div style="display:flex; gap:8px; margin-top:8px;">' +
            '<button onclick="openScheduleForm(\'' + dateStr + '\', \'' + sc.id + '\')" style="flex:1; padding:8px; font-size:13px; font-weight:bold; background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe; border-radius:8px; cursor:pointer;">編集</button>' +
            '<button onclick="confirmDeleteSchedule(\'' + sc.id + '\')" style="padding:8px 12px; font-size:13px; background:#fef2f2; color:#ef4444; border:1px solid #fecaca; border-radius:8px; cursor:pointer;">削除</button>' +
          '</div>' +
        '</div>';
    }
  }

  detailEl.innerHTML = html;
  detailEl.style.display = 'block';
}

// ==========================================
// モーダル開閉
// ==========================================
async function openScheduleForm(dateStr, id) {
  var modal = document.getElementById('schedule-modal');
  if (!modal) return;

  bindScheduleSaveButton();

  // セレクトボックスを先にポピュレート
  await populateScheduleSelects();

  // リセット
  document.getElementById('schedule-edit-id').value = '';
  document.getElementById('schedule-date').value = dateStr || new Date().toISOString().split('T')[0];
  document.getElementById('schedule-genba').value = '';
  document.getElementById('schedule-koutei').value = '';
  document.getElementById('schedule-koutei').innerHTML = '<option value="">-- 工程を選択 --</option>';
  document.getElementById('schedule-shokunin').value = '';
  document.getElementById('schedule-memo').value = '';

  if (id) {
    var sc = await getSchedule(id);
    if (sc) {
      document.getElementById('schedule-modal-title').textContent = '予定を編集';
      document.getElementById('schedule-edit-id').value = sc.id;
      document.getElementById('schedule-date').value = sc.date || '';
      document.getElementById('schedule-genba').value = sc.genbaId || '';
      // 工程セレクトを連動更新
      if (sc.genbaId) {
        await populateKouteiSelect(sc.genbaId);
        document.getElementById('schedule-koutei').value = sc.kouteiId || '';
      }
      document.getElementById('schedule-shokunin').value = sc.shokuninId || '';
      document.getElementById('schedule-memo').value = sc.memo || '';
    }
  } else {
    document.getElementById('schedule-modal-title').textContent = '予定を追加';
  }

  modal.style.display = 'block';
}

function closeScheduleModal() {
  var modal = document.getElementById('schedule-modal');
  if (modal) modal.style.display = 'none';
}

// ==========================================
// セレクトボックスのポピュレート
// ==========================================
async function populateScheduleSelects() {
  // 現場セレクト
  var genbaSelect = document.getElementById('schedule-genba');
  if (genbaSelect) {
    var genbaList = await getAllGenba();
    var html = '<option value="">-- 現場を選択 --</option>';
    for (var i = 0; i < genbaList.length; i++) {
      var g = genbaList[i];
      html += '<option value="' + g.id + '">' + escapeHtml(g.name) + '</option>';
    }
    genbaSelect.innerHTML = html;
  }

  // 職人セレクト
  var shokuninSelect = document.getElementById('schedule-shokunin');
  if (shokuninSelect) {
    var shokuninList = await getAllShokunin();
    var html = '<option value="">-- 職人を選択 --</option>';
    for (var i = 0; i < shokuninList.length; i++) {
      var s = shokuninList[i];
      html += '<option value="' + s.id + '">' + escapeHtml(s.name) + '（' + escapeHtml(s.shokuType) + '）</option>';
    }
    shokuninSelect.innerHTML = html;
  }
}

// 現場変更で工程セレクトを連動
async function onScheduleGenbaChange() {
  var genbaId = document.getElementById('schedule-genba').value;
  if (genbaId) {
    await populateKouteiSelect(genbaId);
  } else {
    document.getElementById('schedule-koutei').innerHTML = '<option value="">-- 工程を選択 --</option>';
  }
}

async function populateKouteiSelect(genbaId) {
  var kouteiSelect = document.getElementById('schedule-koutei');
  if (!kouteiSelect) return;

  var kouteiList = await getKouteiByGenba(genbaId);
  var html = '<option value="">-- 工程を選択 --</option>';
  for (var i = 0; i < kouteiList.length; i++) {
    var k = kouteiList[i];
    html += '<option value="' + k.id + '">' + escapeHtml(k.name) + '</option>';
  }
  kouteiSelect.innerHTML = html;
}

// ==========================================
// 保存
// ==========================================
async function saveScheduleForm() {
  console.log('[schedule] saveScheduleForm 開始');

  var saveBtn = document.getElementById('schedule-save-btn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
  }

  try {
    var date = document.getElementById('schedule-date').value;
    if (!date) {
      alert('日付を入力してください');
      return;
    }

    var id = document.getElementById('schedule-edit-id').value;
    var schedule = {};

    if (id) {
      try {
        schedule = (await withTimeout(getSchedule(id), 5000)) || {};
      } catch(e) {
        console.error('[schedule] getSchedule失敗:', e);
        schedule = { id: id };
      }
    }

    schedule.date = date;

    // 現場情報
    var genbaSelect = document.getElementById('schedule-genba');
    schedule.genbaId = genbaSelect.value || '';
    schedule.genbaName = genbaSelect.value ? genbaSelect.options[genbaSelect.selectedIndex].text : '';

    // 工程情報
    var kouteiSelect = document.getElementById('schedule-koutei');
    schedule.kouteiId = kouteiSelect.value || '';
    schedule.kouteiName = kouteiSelect.value ? kouteiSelect.options[kouteiSelect.selectedIndex].text : '';

    // 職人情報
    var shokuninSelect = document.getElementById('schedule-shokunin');
    schedule.shokuninId = shokuninSelect.value || '';
    schedule.shokuninName = shokuninSelect.value ? shokuninSelect.options[shokuninSelect.selectedIndex].text : '';

    schedule.memo = document.getElementById('schedule-memo').value.trim();

    console.log('[schedule] 保存データ:', JSON.stringify(schedule));

    var result = await withTimeout(saveSchedule(schedule), 8000);
    if (!result) {
      console.error('[schedule] saveSchedule returned null');
      alert('保存に失敗しました。アプリを再読み込みしてください。');
      return;
    }
    console.log('[schedule] 保存成功:', result.id);
    closeScheduleModal();
    await renderCalendar(_scheduleYear, _scheduleMonth);
    // 保存した日の詳細も更新
    if (date) showDayDetail(date);
  } catch(e) {
    console.error('[schedule] saveSchedule失敗:', e);
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

// ==========================================
// 削除
// ==========================================
async function confirmDeleteSchedule(id) {
  if (confirm('この予定を削除しますか？')) {
    try {
      await deleteSchedule(id);
      await renderCalendar(_scheduleYear, _scheduleMonth);
      if (_scheduleSelectedDate) showDayDetail(_scheduleSelectedDate);
    } catch(e) {
      console.error('[schedule] deleteSchedule失敗:', e);
      alert('削除に失敗しました。');
    }
  }
}

// ==========================================
// グローバル公開
// ==========================================
window.initScheduleScreen = initScheduleScreen;
window.renderCalendar = renderCalendar;
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;
window.goToday = goToday;
window.showDayDetail = showDayDetail;
window.openScheduleForm = openScheduleForm;
window.closeScheduleModal = closeScheduleModal;
window.onScheduleGenbaChange = onScheduleGenbaChange;
window.saveScheduleForm = saveScheduleForm;
window.bindScheduleSaveButton = bindScheduleSaveButton;
window.confirmDeleteSchedule = confirmDeleteSchedule;

console.log('[schedule.js] ✓ スケジュールモジュール読み込み完了');
