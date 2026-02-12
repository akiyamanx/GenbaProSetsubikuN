// ==========================================
// マイスケジュール（my-schedule.js）
// 現場Pro 設備くん v0.55 - Phase5-3 v5.5修正
// 個人スケジュール + 担当現場カレンダー + 複数日またぎバー連結
// ==========================================

var _mySchYear = new Date().getFullYear();
var _mySchMonth = new Date().getMonth();
var _mySchSelectedDate = '';

// ==========================================
// 初期化
// ==========================================
async function initMySchedule() {
  await loadMyGenbaList();
  await renderMyCalendar(_mySchYear, _mySchMonth);
}

// ==========================================
// 担当現場リスト
// ==========================================
async function loadMyGenbaList() {
  var container = document.getElementById('my-schedule-genba-list');
  if (!container) return;
  try {
    var list = await getAllGenba();
    var active = list.filter(function(g) { return g.status === '進行中'; });
    if (active.length === 0) {
      container.innerHTML = '<div style="color:#9ca3af; font-size:13px;">進行中の現場はありません</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < active.length; i++) {
      html += '<span style="display:inline-block; padding:6px 12px; background:linear-gradient(135deg, #f59e0b, #d97706); color:white; border-radius:20px; font-size:12px; font-weight:bold; cursor:pointer;" onclick="showScreen(\'schedule\')">' + escapeHtml(active[i].name) + '</span>';
    }
    container.innerHTML = html;
  } catch(e) {
    console.error('[my-schedule] genba list失敗:', e);
    container.innerHTML = '<div style="color:#9ca3af; font-size:13px;">読み込み失敗</div>';
  }
}

// ==========================================
// カレンダー描画
// v5.4修正 - 行高さ自動拡張 + タップハイライト
// ==========================================

// v5.8修正 - bars-area + texts-area 分離構造で動的計算
function calcMyRowHeight(maxEvents) {
  var dateAreaHeight = 18;
  var numLines = Math.min(maxEvents, 3);
  var barsAreaHeight = numLines > 0 ? numLines * 5 + 4 : 0;
  var numTexts = Math.min(maxEvents, 3);
  var textsAreaHeight = numTexts > 0 ? numTexts * 13 + 4 : 0;
  if (maxEvents > 3) textsAreaHeight += 13;
  return Math.max(dateAreaHeight + barsAreaHeight + textsAreaHeight, 38);
}

async function renderMyCalendar(year, month) {
  var calEl = document.getElementById('my-schedule-calendar');
  if (!calEl) return;

  var labelEl = document.getElementById('my-schedule-month-label');
  if (labelEl) labelEl.textContent = year + '年' + (month + 1) + '月';

  var ym = year + '-' + String(month + 1).padStart(2, '0');
  var schedules = [];
  try {
    schedules = await getScheduleForMonthView(ym);
  } catch(e) {
    try { schedules = await getScheduleByMonth(ym); } catch(e2) {}
  }

  // 自分のスケジュール（isUserSchedule=true OR source=manual）
  var mySchedules = schedules.filter(function(s) {
    return s.isUserSchedule || s.source === 'manual' || !s.source;
  });

  var lastDay = new Date(year, month + 1, 0);
  var monthStart = ym + '-01';
  var monthEnd = ym + '-' + String(lastDay.getDate()).padStart(2, '0');
  // v5.5修正 - 予定をスパンとしてまとめ、段割り当て
  var spans = buildEventSpans(mySchedules);
  var dayRows = assignBarRows(spans, monthStart, monthEnd);

  var firstDay = new Date(year, month, 1);
  var startDow = firstDay.getDay();
  var totalDays = lastDay.getDate();
  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  var maxBars = 3;

  // v5.4追加 - 週ごとの最大予定数を事前計算
  var cellSlots = [];
  for (var e = 0; e < startDow; e++) {
    cellSlots.push({ type: 'empty', count: 0 });
  }
  for (var day = 1; day <= totalDays; day++) {
    var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    var rows = dayRows[dateStr] || [];
    cellSlots.push({ type: 'day', day: day, dateStr: dateStr, rows: rows, count: rows.length });
  }
  var endDow = (startDow + totalDays) % 7;
  if (endDow > 0) {
    for (var fill = endDow; fill < 7; fill++) {
      cellSlots.push({ type: 'empty', count: 0 });
    }
  }
  var rowHeights = [];
  for (var r = 0; r < cellSlots.length; r += 7) {
    var maxInRow = 0;
    for (var c = 0; c < 7 && (r + c) < cellSlots.length; c++) {
      if (cellSlots[r + c].count > maxInRow) maxInRow = cellSlots[r + c].count;
    }
    rowHeights.push(calcMyRowHeight(maxInRow));
  }

  var html = '<div class="gantt-calendar">';
  var dowNames = ['日','月','火','水','木','金','土'];
  var dowColors = ['#ef4444','#374151','#374151','#374151','#374151','#374151','#3b82f6'];
  for (var d = 0; d < 7; d++) {
    html += '<div class="gantt-dow" style="color:' + dowColors[d] + ';">' + dowNames[d] + '</div>';
  }

  // 全セル描画（行高さ付き）
  for (var ci = 0; ci < cellSlots.length; ci++) {
    var rowIdx = Math.floor(ci / 7);
    var rh = rowHeights[rowIdx] || 50;
    var slot = cellSlots[ci];

    if (slot.type === 'empty') {
      html += '<div class="gantt-day other-month" style="min-height:' + rh + 'px;"></div>';
      continue;
    }

    var isToday = (slot.dateStr === todayStr);
    var isSelected = (slot.dateStr === _mySchSelectedDate);
    var dow = (startDow + slot.day - 1) % 7;
    var cls = 'gantt-day' + (isToday ? ' today' : '') + (dow === 0 || dow === 6 ? ' weekend' : '') + (isSelected ? ' selected' : '');

    html += '<div class="' + cls + '" data-date="' + slot.dateStr + '" style="min-height:' + rh + 'px;" onclick="onMyDayClick(\'' + slot.dateStr + '\', this)">';
    html += '<div class="gantt-day-number" style="color:' + dowColors[dow] + ';">' + slot.day + '</div>';

    // v5.5修正 - スパンベースのバー描画（段揃え + テキストは先頭日のみ）
    if (slot.rows.length > 0) {
      var shown = Math.min(slot.rows.length, maxBars);
      html += '<div class="gantt-bars-area">';
      for (var bi = 0; bi < shown; bi++) {
        var span = slot.rows[bi];
        if (!span) {
          html += '<div class="gantt-bar empty"></div>';
          continue;
        }
        var sc = span.schedule;
        var color = sc.color || getKouteiColor(sc.category || guessCategory(sc.kouteiName || ''));
        var barType = getBarType(span, slot.dateStr, monthStart, monthEnd);
        html += '<div class="gantt-bar ' + barType + '" style="background:' + color + ';"></div>';
      }
      html += '</div>';
      // テキストは開始日（または月初=月またぎ）のみ表示
      var maxText = 3;
      var textCount = 0;
      var totalStarts = 0;
      var textsHtml = '';
      for (var ti = 0; ti < slot.rows.length; ti++) {
        var tSpan = slot.rows[ti];
        if (!tSpan) continue;
        var isTextDay = (slot.dateStr === tSpan.startDate) ||
                        (tSpan.startDate < monthStart && slot.dateStr === monthStart);
        if (!isTextDay) continue;
        totalStarts++;
        if (textCount >= maxText) continue;
        var tSc = tSpan.schedule;
        var tColor = tSc.color || getKouteiColor(tSc.category || guessCategory(tSc.kouteiName || ''));
        var tLabel = tSc.kouteiName || tSc.memo || tSc.genbaName || '';
        if (tLabel) {
          textsHtml += '<div class="gantt-text-item"><span class="gantt-text-dot" style="background:' + tColor + ';"></span>' + escapeHtml(tLabel).substring(0, 8) + '</div>';
          textCount++;
        }
      }
      if (totalStarts > maxText) {
        textsHtml += '<div class="gantt-text-item" style="color:#9ca3af;">+' + (totalStarts - maxText) + '件</div>';
      }
      if (textsHtml) {
        html += '<div class="gantt-texts-area">' + textsHtml + '</div>';
      }
    }
    html += '</div>';
  }

  html += '</div>';
  calEl.innerHTML = html;

  // 凡例
  var legendEl = document.getElementById('my-schedule-legend');
  if (legendEl) {
    var used = collectUsedColors(mySchedules);
    var keys = Object.keys(used);
    if (keys.length === 0) { legendEl.style.display = 'none'; }
    else {
      var lh = '';
      for (var li = 0; li < keys.length; li++) {
        lh += '<div class="gantt-legend-item"><span class="gantt-legend-color" style="background:' + used[keys[li]] + ';"></span>' + escapeHtml(keys[li]) + '</div>';
      }
      legendEl.innerHTML = lh;
      legendEl.style.display = 'flex';
    }
  }

  var detailEl = document.getElementById('my-schedule-day-detail');
  if (detailEl) detailEl.style.display = 'none';
}

// v5.4追加 - 日付タップ時のハイライト＋詳細表示
function onMyDayClick(dateStr, el) {
  var prev = document.querySelector('#my-schedule-calendar .gantt-day.selected');
  if (prev) prev.classList.remove('selected');
  if (el) el.classList.add('selected');
  showMyDayDetail(dateStr);
}

// ==========================================
// 月送り
// ==========================================
function prevMyMonth() {
  _mySchMonth--;
  if (_mySchMonth < 0) { _mySchMonth = 11; _mySchYear--; }
  renderMyCalendar(_mySchYear, _mySchMonth);
}
function nextMyMonth() {
  _mySchMonth++;
  if (_mySchMonth > 11) { _mySchMonth = 0; _mySchYear++; }
  renderMyCalendar(_mySchYear, _mySchMonth);
}
async function goMyToday() {
  var now = new Date();
  _mySchYear = now.getFullYear();
  _mySchMonth = now.getMonth();
  var todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  _mySchSelectedDate = todayStr;
  await renderMyCalendar(_mySchYear, _mySchMonth);
  var todayEl = document.querySelector('#my-schedule-calendar .gantt-day[data-date="' + todayStr + '"]');
  onMyDayClick(todayStr, todayEl);
}

// ==========================================
// 日詳細
// ==========================================
async function showMyDayDetail(dateStr) {
  _mySchSelectedDate = dateStr;
  var detailEl = document.getElementById('my-schedule-day-detail');
  if (!detailEl) return;

  var entries = [];
  try {
    var allByDate = await getScheduleByDate(dateStr);
    var allSchedules = await getScheduleForMonthView(dateStr.substring(0, 7));
    var seen = {};
    for (var i = 0; i < allByDate.length; i++) { seen[allByDate[i].id] = true; entries.push(allByDate[i]); }
    for (var j = 0; j < allSchedules.length; j++) {
      var sc = allSchedules[j];
      if (seen[sc.id]) continue;
      var end = sc.endDate || sc.date || '';
      if (sc.date <= dateStr && end >= dateStr) { entries.push(sc); seen[sc.id] = true; }
    }
  } catch(e) {}

  // 自分のスケジュールのみ
  entries = entries.filter(function(s) {
    return s.isUserSchedule || s.source === 'manual' || !s.source;
  });

  var parts = dateStr.split('-');
  var dateLabel = parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
  var dayOfWeek = ['日','月','火','水','木','金','土'][new Date(dateStr).getDay()];

  var html = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">' +
    '<div style="font-size:18px; font-weight:bold; color:#1f2937;">' + dateLabel + '（' + dayOfWeek + '）</div>' +
    '</div>';

  if (entries.length === 0) {
    html += '<div style="background:white; border-radius:12px; padding:30px; text-align:center; color:#9ca3af; font-size:14px;">予定はありません</div>';
  } else {
    for (var k = 0; k < entries.length; k++) {
      var s = entries[k];
      var color = s.color || '#7c3aed';
      var period = s.date || '';
      if (s.endDate && s.endDate !== s.date) period += ' 〜 ' + s.endDate;

      html += '<div style="background:white; border-radius:12px; padding:14px; margin-bottom:8px; border-left:4px solid ' + color + '; box-shadow:0 1px 4px rgba(0,0,0,0.06);">';
      if (s.kouteiName) html += '<div style="font-size:15px; font-weight:bold; color:#1f2937;">' + escapeHtml(s.kouteiName) + '</div>';
      if (s.genbaName) html += '<div style="font-size:13px; color:#6b7280; margin-top:2px;">' + escapeHtml(s.genbaName) + '</div>';
      if (period) html += '<div style="font-size:12px; color:#2196F3; margin-top:2px;">' + escapeHtml(period) + '</div>';
      if (s.memo) html += '<div style="font-size:12px; color:#9ca3af; margin-top:4px;">' + escapeHtml(s.memo) + '</div>';
      html += '<div style="display:flex; gap:8px; margin-top:8px;">' +
        '<button onclick="openScheduleForm(\'' + dateStr + '\', \'' + s.id + '\'); showScreen(\'schedule\');" style="flex:1; padding:8px; font-size:13px; font-weight:bold; background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe; border-radius:8px; cursor:pointer;">編集</button>' +
        '<button onclick="confirmDeleteMySchedule(\'' + s.id + '\')" style="padding:8px 12px; font-size:13px; background:#fef2f2; color:#ef4444; border:1px solid #fecaca; border-radius:8px; cursor:pointer;">削除</button></div>';
      html += '</div>';
    }
  }
  detailEl.innerHTML = html;
  detailEl.style.display = 'block';
}

// ==========================================
// モーダル
// ==========================================
function openMyScheduleForm(dateStr) {
  var modal = document.getElementById('my-schedule-modal');
  if (!modal) return;
  document.getElementById('my-schedule-date').value = dateStr || new Date().toISOString().split('T')[0];
  document.getElementById('my-schedule-end-date').value = '';
  document.getElementById('my-schedule-memo').value = '';
  // v5.4追加 - カラーピッカー初期化
  document.getElementById('my-schedule-color').value = '#7c3aed';
  document.getElementById('my-schedule-color-hex').textContent = '#7c3aed';
  initMyScheduleColorPresets();
  modal.style.display = 'block';
}

// v5.4追加 - プリセット色ボタン生成
function initMyScheduleColorPresets() {
  var presetsEl = document.getElementById('my-schedule-color-presets');
  if (!presetsEl) return;
  var colors = window.PRESET_COLORS || [
    '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C',
    '#3498DB', '#9B59B6', '#8B4513', '#FF69B4', '#34495E',
    '#607D8B', '#00BCD4', '#795548', '#FF5722', '#4CAF50',
    '#673AB7', '#009688', '#CDDC39'
  ];
  var html = '';
  for (var i = 0; i < colors.length; i++) {
    html += '<button class="color-preset-btn" style="background:' + colors[i] + ';" onclick="selectMyScheduleColor(\'' + colors[i] + '\')"></button>';
  }
  presetsEl.innerHTML = html;
  // カラーピッカー変更イベント
  var colorInput = document.getElementById('my-schedule-color');
  colorInput.onchange = function() {
    document.getElementById('my-schedule-color-hex').textContent = colorInput.value;
    var btns = document.querySelectorAll('#my-schedule-color-presets .color-preset-btn');
    for (var j = 0; j < btns.length; j++) btns[j].classList.remove('selected');
  };
}

function selectMyScheduleColor(color) {
  document.getElementById('my-schedule-color').value = color;
  document.getElementById('my-schedule-color-hex').textContent = color;
  var btns = document.querySelectorAll('#my-schedule-color-presets .color-preset-btn');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].style.background === color || btns[i].style.backgroundColor === color) {
      btns[i].classList.add('selected');
    } else {
      btns[i].classList.remove('selected');
    }
  }
}

function closeMyScheduleModal() {
  var modal = document.getElementById('my-schedule-modal');
  if (modal) modal.style.display = 'none';
}

async function saveMyScheduleForm() {
  var date = document.getElementById('my-schedule-date').value;
  var memo = document.getElementById('my-schedule-memo').value.trim();
  if (!date) { alert('日付を入力してください'); return; }
  if (!memo) { alert('メモを入力してください'); return; }

  // v5.4修正 - ユーザーが選んだ色を使用
  var selectedColor = document.getElementById('my-schedule-color').value || '#7c3aed';

  var entry = {
    date: date,
    endDate: document.getElementById('my-schedule-end-date').value || '',
    genbaId: '', genbaName: '',
    kouteiId: '', kouteiName: '',
    shokuninId: '', shokuninName: '',
    memo: memo,
    category: '',
    color: selectedColor,
    source: 'manual',
    isUserSchedule: true
  };

  try {
    var saved = await saveSchedule(entry);
    if (!saved) { alert('保存に失敗しました'); return; }
    closeMyScheduleModal();
    await renderMyCalendar(_mySchYear, _mySchMonth);
    showMyDayDetail(date);
  } catch(e) {
    alert('保存に失敗しました: ' + e.message);
  }
}

async function confirmDeleteMySchedule(id) {
  if (!confirm('この予定を削除しますか？')) return;
  try {
    await deleteSchedule(id);
    await renderMyCalendar(_mySchYear, _mySchMonth);
    if (_mySchSelectedDate) showMyDayDetail(_mySchSelectedDate);
  } catch(e) { alert('削除に失敗しました'); }
}

// グローバル公開
window.initMySchedule = initMySchedule;
window.prevMyMonth = prevMyMonth;
window.nextMyMonth = nextMyMonth;
window.goMyToday = goMyToday;
window.showMyDayDetail = showMyDayDetail;
window.openMyScheduleForm = openMyScheduleForm;
window.closeMyScheduleModal = closeMyScheduleModal;
window.saveMyScheduleForm = saveMyScheduleForm;
window.confirmDeleteMySchedule = confirmDeleteMySchedule;
window.selectMyScheduleColor = selectMyScheduleColor;
window.onMyDayClick = onMyDayClick;

console.log('[my-schedule.js] ✓ マイスケジュールモジュール読み込み完了（v0.60）');
