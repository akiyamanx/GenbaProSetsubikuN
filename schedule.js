// ==========================================
// スケジュール管理（schedule.js）
// 現場Pro 設備くん v0.55 - Phase5-3 v5.5修正
// ガントチャート風カレンダー + 現場フィルター + 複数日またぎバー連結
// ==========================================

var _scheduleYear = new Date().getFullYear();
var _scheduleMonth = new Date().getMonth();
var _scheduleSelectedDate = '';
var _scheduleGenbaFilter = ''; // 現場フィルター

// ==========================================
// 初期化
// ==========================================
async function initScheduleScreen() {
  bindScheduleSaveButton();
  await loadCustomCategories(); // v5.4追加 - ユーザー追加工種をマージ
  await loadScheduleGenbaFilter();
  await renderCalendar(_scheduleYear, _scheduleMonth);
}

function bindScheduleSaveButton() {
  var btn = document.getElementById('schedule-save-btn');
  if (!btn || btn._scheduleBound) return;
  btn._scheduleBound = true;
  btn.addEventListener('click', function() { saveScheduleForm(); });
}

// 現場フィルタードロップダウン
async function loadScheduleGenbaFilter() {
  var select = document.getElementById('schedule-genba-filter');
  if (!select) return;
  try {
    var list = await getAllGenba();
    var html = '<option value="">全ての現場</option>';
    for (var i = 0; i < list.length; i++) {
      html += '<option value="' + list[i].id + '">' + escapeHtml(list[i].name) + '</option>';
    }
    select.innerHTML = html;
    if (_scheduleGenbaFilter) select.value = _scheduleGenbaFilter;
  } catch (e) { console.error('[schedule] genba filter load失敗:', e); }
}

function onScheduleGenbaFilterChange() {
  var select = document.getElementById('schedule-genba-filter');
  _scheduleGenbaFilter = select ? select.value : '';
  renderCalendar(_scheduleYear, _scheduleMonth);
}

// ==========================================
// ガントチャートカレンダー描画
// v5.4修正 - 行高さ自動拡張 + タップハイライト
// ==========================================

// v5.8修正 - bars-area + texts-area 分離構造で動的計算
function calcRowHeight(maxEvents) {
  var dateAreaHeight = 18;
  var numLines = Math.min(maxEvents, 4);
  var barsAreaHeight = numLines > 0 ? numLines * 5 + 4 : 0; // 3px bar + 2px gap + padding
  var numTexts = Math.min(maxEvents, 3);
  var textsAreaHeight = numTexts > 0 ? numTexts * 13 + 4 : 0; // 9px*1.4 + border-top
  if (maxEvents > 3) textsAreaHeight += 13; // +N件
  return Math.max(dateAreaHeight + barsAreaHeight + textsAreaHeight, 38);
}

async function renderCalendar(year, month) {
  var calEl = document.getElementById('schedule-calendar');
  if (!calEl) return;

  var labelEl = document.getElementById('schedule-month-label');
  if (labelEl) labelEl.textContent = year + '年' + (month + 1) + '月';

  // スケジュール取得（複数日またぎ対応）
  var ym = year + '-' + String(month + 1).padStart(2, '0');
  console.log('[schedule] renderCalendar 対象月:', ym);
  var schedules = [];
  try {
    schedules = await getScheduleForMonthView(ym);
    console.log('[schedule] getScheduleForMonthView結果:', schedules.length, '件');
  } catch(e) {
    console.error('[schedule] getScheduleForMonthView失敗:', e);
    try { schedules = await getScheduleByMonth(ym); } catch(e2) {}
  }

  // 現場フィルター適用
  if (_scheduleGenbaFilter) {
    schedules = schedules.filter(function(s) { return s.genbaId === _scheduleGenbaFilter; });
  }

  // 月の範囲
  var lastDay = new Date(year, month + 1, 0);
  var monthStart = ym + '-01';
  var monthEnd = ym + '-' + String(lastDay.getDate()).padStart(2, '0');

  // v5.5修正 - 予定をスパンとしてまとめ、段割り当て
  var spans = buildEventSpans(schedules);
  var dayRows = assignBarRows(spans, monthStart, monthEnd);

  // カレンダー計算
  var firstDay = new Date(year, month, 1);
  var startDow = firstDay.getDay();
  var totalDays = lastDay.getDate();
  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  var maxBars = 4;

  // v5.4追加 - 週ごとの最大予定数を事前計算
  var cellSlots = []; // 全セル情報（空セル含む）
  // 空セル（月初の前）
  for (var e = 0; e < startDow; e++) {
    cellSlots.push({ type: 'empty', count: 0 });
  }
  // 各日セル
  for (var day = 1; day <= totalDays; day++) {
    var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    var rows = dayRows[dateStr] || [];
    cellSlots.push({ type: 'day', day: day, dateStr: dateStr, rows: rows, count: rows.length });
  }
  // 月末の空セル
  var endDow = (startDow + totalDays) % 7;
  if (endDow > 0) {
    for (var fill = endDow; fill < 7; fill++) {
      cellSlots.push({ type: 'empty', count: 0 });
    }
  }
  // 週ごとの行高さを計算
  var rowHeights = [];
  for (var r = 0; r < cellSlots.length; r += 7) {
    var maxInRow = 0;
    for (var c = 0; c < 7 && (r + c) < cellSlots.length; c++) {
      if (cellSlots[r + c].count > maxInRow) maxInRow = cellSlots[r + c].count;
    }
    rowHeights.push(calcRowHeight(maxInRow));
  }

  // 曜日ヘッダー
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
    var isSelected = (slot.dateStr === _scheduleSelectedDate);
    var dow = (startDow + slot.day - 1) % 7;
    var cls = 'gantt-day' + (isToday ? ' today' : '') + (dow === 0 || dow === 6 ? ' weekend' : '') + (isSelected ? ' selected' : '');

    html += '<div class="' + cls + '" data-date="' + slot.dateStr + '" style="min-height:' + rh + 'px;" onclick="onDayClick(\'' + slot.dateStr + '\', this)">';
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
        var numHtml = (barType === 'start' || barType === 'single') ? '<span class="gantt-bar-num">' + getCircleNum(bi + 1) + '</span>' : '';
        html += '<div class="gantt-bar ' + barType + '" style="background:' + color + ';" title="' + escapeHtml(sc.kouteiName || sc.memo || '') + '" data-schedule-id="' + span.id + '">' + numHtml + '</div>';
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
        var tLabel = tSc.kouteiName || tSc.shokuninName || tSc.genbaName || tSc.memo || '';
        if (tLabel) {
          textsHtml += '<div class="gantt-text-item"><span style="color:' + tColor + '; font-weight:bold;">' + getCircleNum(ti + 1) + '</span>' + escapeHtml(tLabel).substring(0, 8) + '</div>';
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

  // 凡例更新
  renderLegend(schedules);

  // 日詳細パネルを非表示
  var detailEl = document.getElementById('schedule-day-detail');
  if (detailEl) detailEl.style.display = 'none';
}

// v5.4追加 - 日付タップ時のハイライト＋詳細表示
function onDayClick(dateStr, el) {
  // 前の選択を解除
  var prev = document.querySelector('#schedule-calendar .gantt-day.selected');
  if (prev) prev.classList.remove('selected');
  // タップした日をハイライト
  if (el) el.classList.add('selected');
  // 日詳細を表示
  showDayDetail(dateStr);
}

// v5.4修正 - 凡例描画（＋工種追加ボタン表示）
function renderLegend(schedules) {
  var legendEl = document.getElementById('schedule-legend');
  var addEl = document.getElementById('schedule-legend-add');
  if (!legendEl) return;
  var used = collectUsedColors(schedules);
  var keys = Object.keys(used);
  if (keys.length === 0) {
    legendEl.style.display = 'none';
    if (addEl) addEl.style.display = 'block'; // ボタンは常に表示
    return;
  }
  var html = '';
  for (var i = 0; i < keys.length; i++) {
    html += '<div class="gantt-legend-item"><span class="gantt-legend-color" style="background:' + used[keys[i]] + ';"></span>' + escapeHtml(keys[i]) + '</div>';
  }
  legendEl.innerHTML = html;
  legendEl.style.display = 'flex';
  if (addEl) addEl.style.display = 'block';
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
async function goToday() {
  var now = new Date();
  _scheduleYear = now.getFullYear();
  _scheduleMonth = now.getMonth();
  var todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  _scheduleSelectedDate = todayStr;
  await renderCalendar(_scheduleYear, _scheduleMonth);
  // ハイライト付きで詳細表示
  var todayEl = document.querySelector('#schedule-calendar .gantt-day[data-date="' + todayStr + '"]');
  onDayClick(todayStr, todayEl);
}

// ==========================================
// 日詳細パネル
// ==========================================
async function showDayDetail(dateStr) {
  _scheduleSelectedDate = dateStr;
  var detailEl = document.getElementById('schedule-day-detail');
  if (!detailEl) return;

  // この日に関連する全スケジュール取得
  var entries = [];
  try {
    var allByDate = await getScheduleByDate(dateStr);
    // endDateを持つエントリも含める（全件取得してフィルター）
    var allSchedules = await getScheduleForMonthView(dateStr.substring(0, 7));
    var seen = {};
    for (var i = 0; i < allByDate.length; i++) { seen[allByDate[i].id] = true; entries.push(allByDate[i]); }
    for (var j = 0; j < allSchedules.length; j++) {
      var sc = allSchedules[j];
      if (seen[sc.id]) continue;
      var end = sc.endDate || sc.date || '';
      if (sc.date <= dateStr && end >= dateStr) { entries.push(sc); seen[sc.id] = true; }
    }
  } catch(e) { console.error('[schedule] showDayDetail失敗:', e); }

  // 現場フィルター
  if (_scheduleGenbaFilter) {
    entries = entries.filter(function(s) { return s.genbaId === _scheduleGenbaFilter; });
  }

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
      var color = s.color || getKouteiColor(s.category || guessCategory(s.kouteiName || ''));
      var srcLabel = '';
      if (s.source === 'koutei_import') srcLabel = '工程表取込より';
      else if (s.source === 'talk_analysis' || s.source === 'talk-ai') srcLabel = 'トーク解析より';
      var period = s.date || '';
      if (s.endDate && s.endDate !== s.date) period += ' 〜 ' + s.endDate;

      html += '<div style="background:white; border-radius:12px; padding:14px; margin-bottom:8px; border-left:4px solid ' + color + '; box-shadow:0 1px 4px rgba(0,0,0,0.06);">';
      if (s.kouteiName) html += '<div style="font-size:15px; font-weight:bold; color:#1f2937;">📋 ' + escapeHtml(s.kouteiName) + '</div>';
      if (s.genbaName) html += '<div style="font-size:13px; color:#6b7280; margin-top:2px;">🏗️ ' + escapeHtml(s.genbaName) + '</div>';
      if (s.shokuninName) html += '<div style="font-size:13px; color:#1e40af; margin-top:2px;">👷 ' + escapeHtml(s.shokuninName) + '</div>';
      if (period) html += '<div style="font-size:12px; color:#2196F3; margin-top:2px;">📅 ' + escapeHtml(period) + '</div>';
      if (srcLabel) html += '<div style="font-size:11px; color:#9ca3af; margin-top:2px;">' + srcLabel + '</div>';
      if (s.memo) html += '<div style="font-size:12px; color:#9ca3af; margin-top:4px;">' + escapeHtml(s.memo) + '</div>';
      html += '<div style="display:flex; gap:8px; margin-top:8px;">' +
        '<button onclick="openScheduleForm(\'' + dateStr + '\', \'' + s.id + '\')" style="flex:1; padding:8px; font-size:13px; font-weight:bold; background:#f5f3ff; color:#7c3aed; border:1px solid #ddd6fe; border-radius:8px; cursor:pointer;">編集</button>' +
        '<button onclick="confirmDeleteSchedule(\'' + s.id + '\')" style="padding:8px 12px; font-size:13px; background:#fef2f2; color:#ef4444; border:1px solid #fecaca; border-radius:8px; cursor:pointer;">削除</button></div>';
      html += '</div>';
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
  await populateScheduleSelects();

  document.getElementById('schedule-edit-id').value = '';
  document.getElementById('schedule-date').value = dateStr || new Date().toISOString().split('T')[0];
  document.getElementById('schedule-end-date').value = '';
  document.getElementById('schedule-genba').value = '';
  document.getElementById('schedule-koutei').innerHTML = '<option value="">-- 工程を選択 --</option>';
  document.getElementById('schedule-shokunin').value = '';
  document.getElementById('schedule-memo').value = '';

  if (id) {
    var sc = await getSchedule(id);
    if (sc) {
      document.getElementById('schedule-modal-title').textContent = '予定を編集';
      document.getElementById('schedule-edit-id').value = sc.id;
      document.getElementById('schedule-date').value = sc.date || '';
      document.getElementById('schedule-end-date').value = sc.endDate || '';
      document.getElementById('schedule-genba').value = sc.genbaId || '';
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
// セレクトボックス
// ==========================================
async function populateScheduleSelects() {
  var genbaSelect = document.getElementById('schedule-genba');
  if (genbaSelect) {
    var genbaList = await getAllGenba();
    var h = '<option value="">-- 現場を選択 --</option>';
    for (var i = 0; i < genbaList.length; i++) {
      h += '<option value="' + genbaList[i].id + '">' + escapeHtml(genbaList[i].name) + '</option>';
    }
    genbaSelect.innerHTML = h;
  }
  var shokuninSelect = document.getElementById('schedule-shokunin');
  if (shokuninSelect) {
    var sList = await getAllShokunin();
    var h2 = '<option value="">-- 職人を選択 --</option>';
    for (var j = 0; j < sList.length; j++) {
      h2 += '<option value="' + sList[j].id + '">' + escapeHtml(sList[j].name) + '（' + escapeHtml(sList[j].shokuType) + '）</option>';
    }
    shokuninSelect.innerHTML = h2;
  }
}

async function onScheduleGenbaChange() {
  var genbaId = document.getElementById('schedule-genba').value;
  if (genbaId) { await populateKouteiSelect(genbaId); }
  else { document.getElementById('schedule-koutei').innerHTML = '<option value="">-- 工程を選択 --</option>'; }
}

async function populateKouteiSelect(genbaId) {
  var kSel = document.getElementById('schedule-koutei');
  if (!kSel) return;
  var list = await getKouteiByGenba(genbaId);
  var h = '<option value="">-- 工程を選択 --</option>';
  for (var i = 0; i < list.length; i++) { h += '<option value="' + list[i].id + '">' + escapeHtml(list[i].name) + '</option>'; }
  kSel.innerHTML = h;
}

// ==========================================
// 保存
// ==========================================
async function saveScheduleForm() {
  var saveBtn = document.getElementById('schedule-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '保存中...'; }
  try {
    var date = document.getElementById('schedule-date').value;
    if (!date) { alert('日付を入力してください'); return; }
    var id = document.getElementById('schedule-edit-id').value;
    var schedule = {};
    if (id) {
      try { schedule = (await getSchedule(id)) || {}; } catch(e) { schedule = { id: id }; }
    }
    schedule.date = date;
    schedule.endDate = document.getElementById('schedule-end-date').value || '';
    var gSel = document.getElementById('schedule-genba');
    schedule.genbaId = gSel.value || '';
    schedule.genbaName = gSel.value ? gSel.options[gSel.selectedIndex].text : '';
    var kSel = document.getElementById('schedule-koutei');
    schedule.kouteiId = kSel.value || '';
    schedule.kouteiName = kSel.value ? kSel.options[kSel.selectedIndex].text : '';
    var sSel = document.getElementById('schedule-shokunin');
    schedule.shokuninId = sSel.value || '';
    schedule.shokuninName = sSel.value ? sSel.options[sSel.selectedIndex].text : '';
    schedule.memo = document.getElementById('schedule-memo').value.trim();
    // カテゴリ・色を自動設定
    if (!schedule.category) schedule.category = guessCategory(schedule.kouteiName || '');
    if (!schedule.color) schedule.color = getKouteiColor(schedule.category);
    if (!schedule.source) schedule.source = 'manual';

    console.log('[schedule] saveScheduleForm 保存データ:', JSON.stringify(schedule));
    var result = await saveSchedule(schedule);
    console.log('[schedule] saveSchedule結果:', result ? 'OK id=' + result.id : 'FAIL');
    if (!result) { alert('保存に失敗しました。'); return; }
    closeScheduleModal();
    await renderCalendar(_scheduleYear, _scheduleMonth);
    if (date) showDayDetail(date);
  } catch(e) {
    console.error('[schedule] save失敗:', e);
    alert('保存に失敗しました: ' + e.message);
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '保存する'; }
  }
}

// ==========================================
// 削除
// ==========================================
async function confirmDeleteSchedule(id) {
  if (!confirm('この予定を削除しますか？')) return;
  try {
    await deleteSchedule(id);
    await renderCalendar(_scheduleYear, _scheduleMonth);
    if (_scheduleSelectedDate) showDayDetail(_scheduleSelectedDate);
  } catch(e) { alert('削除に失敗しました。'); }
}

// ==========================================
// v5.4追加 - ユーザー工種追加モーダル
// ==========================================
function openCustomCategoryModal() {
  var modal = document.getElementById('custom-category-modal');
  if (!modal) return;
  document.getElementById('custom-cat-name').value = '';
  document.getElementById('custom-cat-color').value = '#607D8B';
  document.getElementById('custom-cat-color-hex').textContent = '#607D8B';
  // プリセット色ボタン生成
  var presetsEl = document.getElementById('custom-cat-presets');
  if (presetsEl) {
    var html = '';
    for (var i = 0; i < PRESET_COLORS.length; i++) {
      html += '<button class="color-preset-btn" style="background:' + PRESET_COLORS[i] + ';" onclick="selectPresetColor(\'' + PRESET_COLORS[i] + '\')"></button>';
    }
    presetsEl.innerHTML = html;
  }
  // カラーピッカー変更イベント
  var colorInput = document.getElementById('custom-cat-color');
  colorInput.onchange = function() {
    document.getElementById('custom-cat-color-hex').textContent = colorInput.value;
    // プリセットの選択状態を解除
    var btns = document.querySelectorAll('#custom-cat-presets .color-preset-btn');
    for (var j = 0; j < btns.length; j++) btns[j].classList.remove('selected');
  };
  modal.style.display = 'block';
}

function closeCustomCategoryModal() {
  var modal = document.getElementById('custom-category-modal');
  if (modal) modal.style.display = 'none';
}

function selectPresetColor(color) {
  document.getElementById('custom-cat-color').value = color;
  document.getElementById('custom-cat-color-hex').textContent = color;
  // 選択状態の更新
  var btns = document.querySelectorAll('#custom-cat-presets .color-preset-btn');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].style.background === color || btns[i].style.backgroundColor === color) {
      btns[i].classList.add('selected');
    } else {
      btns[i].classList.remove('selected');
    }
  }
}

async function saveCustomCategoryForm() {
  var name = document.getElementById('custom-cat-name').value.trim();
  var color = document.getElementById('custom-cat-color').value;
  if (!name) { alert('工種名を入力してください'); return; }
  // 既存チェック
  if (KOUTEI_COLORS[name]) {
    alert('「' + name + '」は既に登録されています');
    return;
  }
  try {
    await saveCustomCategory({ name: name, color: color });
    // KOUTEI_COLORSにマージ
    KOUTEI_COLORS[name] = color;
    window.KOUTEI_COLORS = KOUTEI_COLORS;
    closeCustomCategoryModal();
    await renderCalendar(_scheduleYear, _scheduleMonth);
    alert('工種「' + name + '」を追加しました');
  } catch (e) {
    console.error('[schedule] saveCustomCategory失敗:', e);
    alert('保存に失敗しました');
  }
}

// ==========================================
// 簡易現場登録モーダル
// ==========================================
function openQuickGenbaModal() {
  var modal = document.getElementById('quick-genba-modal');
  if (!modal) return;
  document.getElementById('quick-genba-name').value = '';
  document.getElementById('quick-genba-address').value = '';
  document.getElementById('quick-genba-client').value = '';
  modal.style.display = 'block';
}

function closeQuickGenbaModal() {
  var modal = document.getElementById('quick-genba-modal');
  if (modal) modal.style.display = 'none';
}

async function saveQuickGenba() {
  var name = document.getElementById('quick-genba-name').value.trim();
  if (!name) { alert('現場名を入力してください'); return; }
  var address = document.getElementById('quick-genba-address').value.trim();
  var client = document.getElementById('quick-genba-client').value.trim();
  try {
    var genba = { name: name, address: address, clientName: client, status: 'active' };
    var result = await saveGenba(genba);
    if (!result) { alert('保存に失敗しました'); return; }
    // ドロップダウンに追加して選択状態にする
    var genbaSelect = document.getElementById('schedule-genba');
    if (genbaSelect) {
      var opt = document.createElement('option');
      opt.value = result.id;
      opt.textContent = name;
      genbaSelect.appendChild(opt);
      genbaSelect.value = result.id;
      // 工程セレクトもリセット
      onScheduleGenbaChange();
    }
    // フィルタードロップダウンも更新
    await loadScheduleGenbaFilter();
    closeQuickGenbaModal();
  } catch (e) {
    console.error('[schedule] saveQuickGenba失敗:', e);
    alert('保存に失敗しました: ' + e.message);
  }
}

// グローバル公開
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
window.onScheduleGenbaFilterChange = onScheduleGenbaFilterChange;
window.onDayClick = onDayClick;
window.openCustomCategoryModal = openCustomCategoryModal;
window.closeCustomCategoryModal = closeCustomCategoryModal;
window.selectPresetColor = selectPresetColor;
window.saveCustomCategoryForm = saveCustomCategoryForm;
window.openQuickGenbaModal = openQuickGenbaModal;
window.closeQuickGenbaModal = closeQuickGenbaModal;
window.saveQuickGenba = saveQuickGenba;

console.log('[schedule.js] ✓ ガントチャートスケジュールモジュール読み込み完了（v0.61）');
