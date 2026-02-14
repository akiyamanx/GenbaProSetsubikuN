// ==========================================
// daily-report.js
// Phase7: 日報・完了報告書テンプレート
// 現場Pro 設備くん v11
// ==========================================

var drCurrentTab = 'daily';
var drEntryCount = 0;
var drPhotoSetCount = 0;
// 写真ピッカー用の状態
var drPickerMode = 'multi'; // 'multi' or 'single'
var drPickerCallback = null;
var drPickerSelected = [];
var drPickerCat = 'all';
// ObjectURL管理
var drObjectUrls = [];

// === 初期化 ===
async function initDailyReport() {
  console.log('[DailyReport] 初期化開始');
  drCurrentTab = 'daily';
  drUpdateTabUI();
  await drRenderList();
  console.log('[DailyReport] 初期化完了');
}

// === タブ切替 ===
function drSwitchTab(tab) {
  drCurrentTab = tab;
  drUpdateTabUI();
  drRenderList();
}

function drUpdateTabUI() {
  var tabDaily = document.getElementById('drTabDaily');
  var tabComp = document.getElementById('drTabCompletion');
  if (drCurrentTab === 'daily') {
    tabDaily.style.background = '#3b82f6';
    tabDaily.style.color = 'white';
    tabComp.style.background = 'white';
    tabComp.style.color = '#3b82f6';
  } else {
    tabComp.style.background = '#3b82f6';
    tabComp.style.color = 'white';
    tabDaily.style.background = 'white';
    tabDaily.style.color = '#3b82f6';
  }
}

// === 一覧表示 ===
async function drRenderList() {
  var listEl = document.getElementById('drList');
  if (!listEl) return;

  var allReports = await getAllReports();
  var filtered = allReports.filter(function(r) { return r.type === drCurrentTab; });

  if (filtered.length === 0) {
    var typeLabel = drCurrentTab === 'daily' ? '作業日報' : '完了報告書';
    listEl.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-state-icon">📝</div>' +
        '<div>' + typeLabel + 'がありません</div>' +
        '<div style="font-size:12px; margin-top:8px;">「＋新規作成」で作成してください</div>' +
      '</div>';
    return;
  }

  var drafts = filtered.filter(function(r) { return r.status === 'draft'; });
  var completed = filtered.filter(function(r) { return r.status === 'completed'; });

  var html = '';
  if (drafts.length > 0) {
    html += '<div style="font-size:12px; font-weight:bold; color:#f59e0b; margin-bottom:6px; padding:0 4px;">下書き</div>';
    drafts.forEach(function(r) { html += drRenderCard(r); });
  }
  if (completed.length > 0) {
    html += '<div style="font-size:12px; font-weight:bold; color:#22c55e; margin:12px 0 6px; padding:0 4px;">完成</div>';
    completed.forEach(function(r) { html += drRenderCard(r); });
  }
  listEl.innerHTML = html;
}

function drRenderCard(r) {
  var dateStr = drFormatDateShort(r.date);
  var icon = r.status === 'draft' ? '📝' : '✅';
  var statusColor = r.status === 'draft' ? '#f59e0b' : '#22c55e';
  var title = r.title || (r.type === 'daily' ? '作業日報' : '完了報告書');
  var sub = '';
  if (r.type === 'daily' && r.entries && r.entries.length > 0) {
    sub = r.entries.map(function(e) { return e.genbaName || ''; }).filter(Boolean).join('、');
  } else if (r.type === 'completion') {
    sub = r.genbaName || '';
  }

  return '<div style="background:white; border-radius:10px; padding:12px 14px; margin-bottom:8px; display:flex; align-items:center; gap:12px; border-left:4px solid ' + statusColor + '; box-shadow:0 1px 4px rgba(0,0,0,0.06);">' +
    '<div onclick="drOpenReport(' + r.id + ')" style="display:flex; align-items:center; gap:12px; flex:1; min-width:0; cursor:pointer;">' +
      '<div style="font-size:22px;">' + icon + '</div>' +
      '<div style="flex:1; min-width:0;">' +
        '<div style="font-size:14px; font-weight:bold; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(title) + '</div>' +
        (sub ? '<div style="font-size:12px; color:#9ca3af; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(sub) + '</div>' : '') +
      '</div>' +
      '<div style="font-size:12px; color:#9ca3af; white-space:nowrap;">' + dateStr + '</div>' +
      '<div style="font-size:18px; color:#d1d5db;">›</div>' +
    '</div>' +
    '<button onclick="event.stopPropagation(); drDeleteReport(' + r.id + ')" style="background:none; border:none; font-size:16px; color:#d1d5db; cursor:pointer; padding:4px 2px;" title="削除">🗑</button>' +
  '</div>';
}

function drFormatDateShort(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  return parseInt(parts[1]) + '/' + parseInt(parts[2]);
}

// === 新規作成 ===
function drCreateNew() {
  if (drCurrentTab === 'daily') {
    drOpenDailyForm(null);
  } else {
    drOpenCompletionForm(null);
  }
}

// === 報告書を開く（編集） ===
async function drOpenReport(id) {
  var report = await getReport(id);
  if (!report) { alert('データが見つかりません'); return; }
  if (report.type === 'daily') {
    drOpenDailyForm(report);
  } else {
    drOpenCompletionForm(report);
  }
}

// ==========================================
// 作業日報フォーム
// ==========================================

async function drOpenDailyForm(report) {
  drCleanupUrls();
  var modal = document.getElementById('drDailyModal');
  var titleEl = document.getElementById('drDailyTitle');

  // フォーム初期化
  var today = new Date().toISOString().split('T')[0];
  document.getElementById('drDailyEditId').value = '';
  document.getElementById('drDailyDate').value = today;
  document.getElementById('drDailyWeather').value = localStorage.getItem('report_lastWeather') || '晴れ';
  document.getElementById('drDailyReporter').value = localStorage.getItem('report_lastReporter') || '';
  document.getElementById('drDailyMileage').value = '';
  document.getElementById('drDailyTemp').value = '';
  document.getElementById('drDailyNotes').value = '';
  document.getElementById('drEntriesContainer').innerHTML = '';
  drEntryCount = 0;

  // 天気ボタンのUIを更新
  drUpdateWeatherUI(document.getElementById('drDailyWeather').value);

  // 削除ボタン表示制御
  var delBtn = document.getElementById('drDailyDeleteBtn');
  if (!delBtn) {
    titleEl.insertAdjacentHTML('afterend', '<button id="drDailyDeleteBtn" style="display:none; padding:4px 10px; background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; border-radius:6px; font-size:12px; cursor:pointer; margin-left:8px;">🗑削除</button>');
    delBtn = document.getElementById('drDailyDeleteBtn');
  }
  delBtn.style.display = 'none';

  if (report) {
    // 編集モード
    titleEl.textContent = '作業日報 編集';
    delBtn.style.display = 'inline-block';
    delBtn.onclick = function() { drDeleteFromModal(report.id, 'daily'); };
    document.getElementById('drDailyEditId').value = report.id;
    document.getElementById('drDailyDate').value = report.date || today;
    document.getElementById('drDailyWeather').value = report.weather || '晴れ';
    drUpdateWeatherUI(report.weather || '晴れ');
    document.getElementById('drDailyReporter').value = report.reporter || '';
    document.getElementById('drDailyMileage').value = report.mileage || '';
    document.getElementById('drDailyTemp').value = report.temperature || '';
    document.getElementById('drDailyNotes').value = report.specialNotes || '';

    // エントリを復元
    if (report.entries && report.entries.length > 0) {
      for (var i = 0; i < report.entries.length; i++) {
        await drAddEntry(report.entries[i]);
      }
    } else {
      await drAddEntry();
    }
  } else {
    titleEl.textContent = '作業日報 作成';
    await drAddEntry();
  }

  modal.classList.remove('hidden');
}

function drCloseDailyModal() {
  document.getElementById('drDailyModal').classList.add('hidden');
  drCleanupUrls();
}

// === 天気選択 ===
function drSelectWeather(btn, weather) {
  document.getElementById('drDailyWeather').value = weather;
  drUpdateWeatherUI(weather);
}

function drUpdateWeatherUI(weather) {
  var btns = document.querySelectorAll('#drWeatherBtns button');
  btns.forEach(function(b) {
    if (b.getAttribute('data-w') === weather) {
      b.style.background = '#3b82f6';
      b.style.color = 'white';
      b.style.borderColor = '#3b82f6';
    } else {
      b.style.background = 'white';
      b.style.color = '#374151';
      b.style.borderColor = '#d1d5db';
    }
  });
}

// === 現場エントリ追加/削除 ===
async function drAddEntry(data) {
  var idx = drEntryCount++;
  var container = document.getElementById('drEntriesContainer');

  // 丸数字を生成（①②③...）
  var circleNum = (idx < 10) ? String.fromCharCode(0x2460 + idx) : '(' + (idx + 1) + ')';

  // 現場リスト取得
  var genbaList = await getAllGenba();
  var genbaOpts = '<option value="">現場を選択</option>';
  genbaList.forEach(function(g) {
    var sel = (data && data.genbaId === g.id) ? ' selected' : '';
    genbaOpts += '<option value="' + g.id + '" data-name="' + escapeHtml(g.name) + '"' + sel + '>' + escapeHtml(g.name) + '</option>';
  });

  // 工種セレクトオプション（KOUTEI_COLORSから生成）
  var koujiOpts = '<option value="">なし</option>';
  if (typeof KOUTEI_COLORS !== 'undefined') {
    Object.keys(KOUTEI_COLORS).forEach(function(key) {
      var sel = (data && data.kouji === key) ? ' selected' : '';
      koujiOpts += '<option value="' + escapeHtml(key) + '"' + sel + '>' + escapeHtml(key) + '</option>';
    });
  }

  var html =
    '<div id="drEntry_' + idx + '" style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:12px; margin-bottom:12px; position:relative;">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
        '<span style="font-size:14px; font-weight:bold; color:#1565c0;">現場' + circleNum + '</span>' +
        '<button onclick="drRemoveEntry(' + idx + ')" style="background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; border-radius:6px; padding:4px 10px; font-size:12px; cursor:pointer;">× 削除</button>' +
      '</div>' +
      // 現場選択 + ＋新規ボタン
      '<div style="display:flex; gap:6px; align-items:center; margin-bottom:8px;">' +
        '<select id="drEntryGenba_' + idx + '" onchange="drOnEntryGenbaChange(' + idx + ')" style="flex:1; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:14px;">' + genbaOpts + '</select>' +
        '<button type="button" onclick="drShowNewGenbaForm(' + idx + ')" style="padding:8px 12px; background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer; white-space:nowrap;">＋新規</button>' +
      '</div>' +
      // 新規現場ミニフォーム（非表示）
      '<div id="drNewGenbaForm_' + idx + '" style="display:none; background:#e8f5e9; border:1px solid #a5d6a7; border-radius:8px; padding:10px; margin-bottom:8px;">' +
        '<div style="font-size:12px; font-weight:bold; color:#2e7d32; margin-bottom:6px;">新規現場を追加</div>' +
        '<input type="text" id="drNewGenbaName_' + idx + '" placeholder="現場名（例: 小出邸）" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; margin-bottom:6px;">' +
        '<input type="text" id="drNewGenbaAddr_' + idx + '" placeholder="住所（任意）" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:6px; font-size:14px; margin-bottom:8px;">' +
        '<div style="display:flex; gap:6px;">' +
          '<button type="button" onclick="drAddNewGenba(' + idx + ')" style="flex:1; padding:8px; background:#2e7d32; color:white; border:none; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer;">追加する</button>' +
          '<button type="button" onclick="drHideNewGenbaForm(' + idx + ')" style="flex:1; padding:8px; background:#e0e0e0; color:#333; border:none; border-radius:6px; font-size:13px; cursor:pointer;">キャンセル</button>' +
        '</div>' +
      '</div>' +
      // 工種セレクト
      '<div style="margin-bottom:8px;">' +
        '<select id="drEntryKouji_' + idx + '" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:14px;">' + koujiOpts + '</select>' +
      '</div>' +
      '<div style="display:grid; grid-template-columns:1fr auto 1fr; gap:6px; align-items:center; margin-bottom:8px;">' +
        '<input type="time" id="drEntryStart_' + idx + '" value="' + ((data && data.startTime) || '') + '" style="padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:14px;">' +
        '<span style="color:#9ca3af;">〜</span>' +
        '<input type="time" id="drEntryEnd_' + idx + '" value="' + ((data && data.endTime) || '') + '" style="padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:14px;">' +
      '</div>' +
      '<div style="margin-bottom:8px;">' +
        '<textarea id="drEntryContent_' + idx + '" rows="2" placeholder="作業内容" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; resize:vertical; box-sizing:border-box;">' + escapeHtml((data && data.content) || '') + '</textarea>' +
      '</div>' +
      '<div style="margin-bottom:8px;">' +
        '<button onclick="drOpenPhotoPickerForEntry(' + idx + ')" style="padding:8px 14px; background:#eff6ff; color:#3b82f6; border:1px solid #bfdbfe; border-radius:8px; font-size:13px; cursor:pointer;">📷 写真を選ぶ</button>' +
        '<div id="drEntryPhotos_' + idx + '" style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;"></div>' +
        '<input type="hidden" id="drEntryPhotoIds_' + idx + '" value="' + ((data && data.photoIds) ? JSON.stringify(data.photoIds) : '[]') + '">' +
      '</div>' +
      '<div>' +
        '<input type="text" id="drEntryRemarks_' + idx + '" placeholder="備考" value="' + escapeHtml((data && data.remarks) || '') + '" style="width:100%; padding:10px; border:1px solid #d1d5db; border-radius:8px; font-size:14px;">' +
      '</div>' +
    '</div>';

  container.insertAdjacentHTML('beforeend', html);

  // 既存の写真IDがあればサムネイル表示
  if (data && data.photoIds && data.photoIds.length > 0) {
    drRenderEntryThumbs(idx, data.photoIds);
  }
}

function drRemoveEntry(idx) {
  // 最低1つの現場が必要
  var entries = document.querySelectorAll('#drEntriesContainer > div[id^="drEntry_"]');
  if (entries.length <= 1) {
    alert('最低1つの現場が必要です');
    return;
  }
  var el = document.getElementById('drEntry_' + idx);
  if (el) el.remove();
}

function drOnEntryGenbaChange(idx) {
  // 現場変更時の処理（将来拡張用）
}

// === 新規現場インライン追加 ===
function drShowNewGenbaForm(idx) {
  var form = document.getElementById('drNewGenbaForm_' + idx);
  if (form) form.style.display = 'block';
}

function drHideNewGenbaForm(idx) {
  var form = document.getElementById('drNewGenbaForm_' + idx);
  if (form) form.style.display = 'none';
}

async function drAddNewGenba(idx) {
  var nameInput = document.getElementById('drNewGenbaName_' + idx);
  var addrInput = document.getElementById('drNewGenbaAddr_' + idx);
  var name = nameInput ? nameInput.value.trim() : '';
  if (!name) { alert('現場名を入力してください'); return; }
  var address = addrInput ? addrInput.value.trim() : '';

  var genba = await saveGenba({ name: name, address: address, status: 'active' });
  if (!genba) { alert('現場の保存に失敗しました'); return; }

  // セレクトに追加＋自動選択
  var select = document.getElementById('drEntryGenba_' + idx);
  if (select) {
    var opt = document.createElement('option');
    opt.value = genba.id;
    opt.textContent = name;
    opt.setAttribute('data-name', name);
    select.appendChild(opt);
    select.value = genba.id;
  }
  drHideNewGenbaForm(idx);
}

// === 写真サムネイル表示 ===
async function drRenderEntryThumbs(idx, photoIds) {
  var container = document.getElementById('drEntryPhotos_' + idx);
  if (!container) return;
  container.innerHTML = '';
  for (var i = 0; i < photoIds.length; i++) {
    var photo = await getPhotoManager(photoIds[i]);
    if (photo && photo.thumbnailBlob) {
      var url = URL.createObjectURL(photo.thumbnailBlob);
      drObjectUrls.push(url);
      container.innerHTML += '<img src="' + url + '" style="width:56px; height:56px; object-fit:cover; border-radius:6px; border:1px solid #e5e7eb;">';
    }
  }
}

// === 日報保存 ===
async function drSaveDailyDraft() {
  var report = drCollectDailyData();
  if (!report) return;
  report.status = 'draft';

  var saved = await saveReport(report);
  if (saved) {
    // 前回値を記憶
    localStorage.setItem('report_lastReporter', report.reporter || '');
    localStorage.setItem('report_lastWeather', report.weather || '');

    drCloseDailyModal();
    await drRenderList();
    alert('下書きを保存しました');
  } else {
    alert('保存に失敗しました');
  }
}

function drCollectDailyData() {
  var editId = document.getElementById('drDailyEditId').value;
  var date = document.getElementById('drDailyDate').value;
  if (!date) { alert('日付を入力してください'); return null; }

  var entries = [];
  for (var i = 0; i < drEntryCount; i++) {
    var entryEl = document.getElementById('drEntry_' + i);
    if (!entryEl) continue;
    var genbaSelect = document.getElementById('drEntryGenba_' + i);
    var genbaId = genbaSelect ? genbaSelect.value : '';
    var genbaName = '';
    if (genbaSelect && genbaSelect.selectedIndex > 0) {
      genbaName = genbaSelect.options[genbaSelect.selectedIndex].getAttribute('data-name') || genbaSelect.options[genbaSelect.selectedIndex].text;
    }
    var photoIdsStr = document.getElementById('drEntryPhotoIds_' + i) ? document.getElementById('drEntryPhotoIds_' + i).value : '[]';
    var photoIds = [];
    try { photoIds = JSON.parse(photoIdsStr); } catch(e) {}

    entries.push({
      genbaId: genbaId,
      genbaName: genbaName,
      kouji: (document.getElementById('drEntryKouji_' + i) || {}).value || '',
      startTime: (document.getElementById('drEntryStart_' + i) || {}).value || '',
      endTime: (document.getElementById('drEntryEnd_' + i) || {}).value || '',
      content: (document.getElementById('drEntryContent_' + i) || {}).value || '',
      photoIds: photoIds,
      remarks: (document.getElementById('drEntryRemarks_' + i) || {}).value || ''
    });
  }

  var dateParts = date.split('-');
  var titleDate = parseInt(dateParts[1]) + '/' + parseInt(dateParts[2]);

  var report = {
    type: 'daily',
    date: date,
    title: '作業日報 ' + titleDate,
    weather: document.getElementById('drDailyWeather').value || '晴れ',
    temperature: document.getElementById('drDailyTemp').value || '',
    reporter: document.getElementById('drDailyReporter').value.trim(),
    entries: entries,
    mileage: document.getElementById('drDailyMileage').value || '',
    specialNotes: document.getElementById('drDailyNotes').value.trim()
  };

  if (editId) report.id = parseInt(editId);
  return report;
}

// ==========================================
// 完了報告書フォーム
// ==========================================

async function drOpenCompletionForm(report) {
  drCleanupUrls();
  var modal = document.getElementById('drCompletionModal');
  var titleEl = document.getElementById('drCompTitle');

  // 現場リスト読み込み
  var genbaList = await getAllGenba();
  var select = document.getElementById('drCompGenba');
  select.innerHTML = '<option value="">選択してください</option>';
  genbaList.forEach(function(g) {
    select.innerHTML += '<option value="' + g.id + '" data-name="' + escapeHtml(g.name) + '" data-address="' + escapeHtml(g.address || '') + '">' + escapeHtml(g.name) + '</option>';
  });

  // フォーム初期化
  var today = new Date().toISOString().split('T')[0];
  document.getElementById('drCompEditId').value = '';
  document.getElementById('drCompDate').value = today;
  document.getElementById('drCompKojiName').value = '';
  document.getElementById('drCompGenba').value = '';
  document.getElementById('drCompAddress').value = '';
  document.getElementById('drCompPeriodStart').value = '';
  document.getElementById('drCompPeriodEnd').value = '';
  document.getElementById('drCompContractor').value = localStorage.getItem('report_lastContractor') || '';
  document.getElementById('drCompTantou').value = localStorage.getItem('report_lastReporter') || '';
  document.getElementById('drCompContent').value = '';
  document.getElementById('drCompRemarks').value = '';
  document.getElementById('drPhotoSetsContainer').innerHTML = '';
  drPhotoSetCount = 0;

  // 削除ボタン表示制御
  var delBtn2 = document.getElementById('drCompDeleteBtn');
  if (!delBtn2) {
    titleEl.insertAdjacentHTML('afterend', '<button id="drCompDeleteBtn" style="display:none; padding:4px 10px; background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; border-radius:6px; font-size:12px; cursor:pointer; margin-left:8px;">🗑削除</button>');
    delBtn2 = document.getElementById('drCompDeleteBtn');
  }
  delBtn2.style.display = 'none';

  if (report) {
    titleEl.textContent = '完了報告書 編集';
    delBtn2.style.display = 'inline-block';
    delBtn2.onclick = function() { drDeleteFromModal(report.id, 'completion'); };
    document.getElementById('drCompEditId').value = report.id;
    document.getElementById('drCompDate').value = report.date || today;
    document.getElementById('drCompKojiName').value = report.kojiName || '';
    document.getElementById('drCompGenba').value = report.genbaId || '';
    document.getElementById('drCompAddress').value = report.address || '';
    document.getElementById('drCompPeriodStart').value = (report.period && report.period.start) || '';
    document.getElementById('drCompPeriodEnd').value = (report.period && report.period.end) || '';
    document.getElementById('drCompContractor').value = report.contractor || '';
    document.getElementById('drCompTantou').value = report.tantousha || '';
    document.getElementById('drCompContent').value = report.sekoContent || '';
    document.getElementById('drCompRemarks').value = report.remarks || '';

    // 写真ペア復元
    if (report.photoSets && report.photoSets.length > 0) {
      for (var i = 0; i < report.photoSets.length; i++) {
        await drAddPhotoSet(report.photoSets[i]);
      }
    } else {
      await drAddPhotoSet();
    }
  } else {
    titleEl.textContent = '完了報告書 作成';
    await drAddPhotoSet();
  }

  modal.classList.remove('hidden');
}

function drCloseCompletionModal() {
  document.getElementById('drCompletionModal').classList.add('hidden');
  drCleanupUrls();
}

// === 現場変更で住所自動入力 ===
function drOnCompGenbaChange() {
  var select = document.getElementById('drCompGenba');
  if (select.selectedIndex > 0) {
    var opt = select.options[select.selectedIndex];
    var address = opt.getAttribute('data-address') || '';
    document.getElementById('drCompAddress').value = address;
  }
}

// === 写真ペア追加 ===
async function drAddPhotoSet(data) {
  var idx = drPhotoSetCount++;
  var container = document.getElementById('drPhotoSetsContainer');

  var html =
    '<div id="drPhotoSet_' + idx + '" style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:12px; margin-bottom:10px; position:relative;">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
        '<span style="font-size:13px; font-weight:bold; color:#374151;">ペア' + (idx + 1) + '</span>' +
        '<button onclick="drRemovePhotoSet(' + idx + ')" style="background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; border-radius:6px; padding:4px 10px; font-size:12px; cursor:pointer;">×削除</button>' +
      '</div>' +
      '<input type="text" id="drPsLabel_' + idx + '" placeholder="ラベル（例: 3F PS内 配管）" value="' + escapeHtml((data && data.label) || '') + '" style="width:100%; padding:8px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; margin-bottom:8px;">' +
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">' +
        '<div style="text-align:center;">' +
          '<div style="font-size:12px; color:#6b7280; margin-bottom:4px;">施工前</div>' +
          '<div id="drPsBefore_' + idx + '" style="width:100%; height:80px; background:#f3f4f6; border:2px dashed #d1d5db; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden;" onclick="drPickSinglePhoto(' + idx + ',\'before\')">' +
            '<span style="font-size:12px; color:#9ca3af;">タップで選択</span>' +
          '</div>' +
          '<input type="hidden" id="drPsBeforeId_' + idx + '" value="' + ((data && data.beforePhotoId) || '') + '">' +
        '</div>' +
        '<div style="text-align:center;">' +
          '<div style="font-size:12px; color:#6b7280; margin-bottom:4px;">施工後</div>' +
          '<div id="drPsAfter_' + idx + '" style="width:100%; height:80px; background:#f3f4f6; border:2px dashed #d1d5db; border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden;" onclick="drPickSinglePhoto(' + idx + ',\'after\')">' +
            '<span style="font-size:12px; color:#9ca3af;">タップで選択</span>' +
          '</div>' +
          '<input type="hidden" id="drPsAfterId_' + idx + '" value="' + ((data && data.afterPhotoId) || '') + '">' +
        '</div>' +
      '</div>' +
    '</div>';

  container.insertAdjacentHTML('beforeend', html);

  // 既存写真があればサムネイル表示
  if (data && data.beforePhotoId) {
    await drRenderSetThumb(idx, 'before', data.beforePhotoId);
  }
  if (data && data.afterPhotoId) {
    await drRenderSetThumb(idx, 'after', data.afterPhotoId);
  }
}

function drRemovePhotoSet(idx) {
  var el = document.getElementById('drPhotoSet_' + idx);
  if (el) el.remove();
}

async function drRenderSetThumb(idx, side, photoId) {
  var container = document.getElementById('drPs' + (side === 'before' ? 'Before' : 'After') + '_' + idx);
  if (!container) return;
  var photo = await getPhotoManager(photoId);
  if (photo && photo.thumbnailBlob) {
    var url = URL.createObjectURL(photo.thumbnailBlob);
    drObjectUrls.push(url);
    container.innerHTML = '<img src="' + url + '" style="width:100%; height:100%; object-fit:cover;">';
  }
}

// === 完了報告書保存 ===
async function drSaveCompDraft() {
  var report = drCollectCompData();
  if (!report) return;
  report.status = 'draft';

  var saved = await saveReport(report);
  if (saved) {
    localStorage.setItem('report_lastContractor', report.contractor || '');
    localStorage.setItem('report_lastReporter', report.tantousha || '');
    drCloseCompletionModal();
    await drRenderList();
    alert('下書きを保存しました');
  } else {
    alert('保存に失敗しました');
  }
}

function drCollectCompData() {
  var editId = document.getElementById('drCompEditId').value;
  var date = document.getElementById('drCompDate').value;
  if (!date) { alert('報告日を入力してください'); return null; }

  var genbaSelect = document.getElementById('drCompGenba');
  var genbaId = genbaSelect.value;
  var genbaName = '';
  if (genbaSelect.selectedIndex > 0) {
    genbaName = genbaSelect.options[genbaSelect.selectedIndex].getAttribute('data-name') || genbaSelect.options[genbaSelect.selectedIndex].text;
  }

  var photoSets = [];
  for (var i = 0; i < drPhotoSetCount; i++) {
    var setEl = document.getElementById('drPhotoSet_' + i);
    if (!setEl) continue;
    var label = (document.getElementById('drPsLabel_' + i) || {}).value || '';
    var beforeId = (document.getElementById('drPsBeforeId_' + i) || {}).value || '';
    var afterId = (document.getElementById('drPsAfterId_' + i) || {}).value || '';
    photoSets.push({
      label: label,
      beforePhotoId: beforeId ? parseInt(beforeId) : null,
      afterPhotoId: afterId ? parseInt(afterId) : null
    });
  }

  var dateParts = date.split('-');
  var titleDate = parseInt(dateParts[1]) + '/' + parseInt(dateParts[2]);

  var report = {
    type: 'completion',
    date: date,
    title: '完了報告書 ' + titleDate + ' ' + (genbaName || ''),
    kojiName: document.getElementById('drCompKojiName').value.trim(),
    genbaId: genbaId,
    genbaName: genbaName,
    address: document.getElementById('drCompAddress').value.trim(),
    period: {
      start: document.getElementById('drCompPeriodStart').value,
      end: document.getElementById('drCompPeriodEnd').value
    },
    contractor: document.getElementById('drCompContractor').value.trim(),
    tantousha: document.getElementById('drCompTantou').value.trim(),
    sekoContent: document.getElementById('drCompContent').value.trim(),
    photoSets: photoSets,
    remarks: document.getElementById('drCompRemarks').value.trim()
  };

  if (editId) report.id = parseInt(editId);
  return report;
}

// ==========================================
// 写真ピッカー
// ==========================================

// 日報エントリ用（複数選択）
function drOpenPhotoPickerForEntry(entryIdx) {
  drPickerMode = 'multi';
  var photoIdsStr = document.getElementById('drEntryPhotoIds_' + entryIdx) ? document.getElementById('drEntryPhotoIds_' + entryIdx).value : '[]';
  try { drPickerSelected = JSON.parse(photoIdsStr); } catch(e) { drPickerSelected = []; }

  drPickerCallback = function(selectedIds) {
    var hiddenEl = document.getElementById('drEntryPhotoIds_' + entryIdx);
    if (hiddenEl) hiddenEl.value = JSON.stringify(selectedIds);
    drRenderEntryThumbs(entryIdx, selectedIds);
  };

  // 現場を自動設定
  var genbaSelect = document.getElementById('drEntryGenba_' + entryIdx);
  var genbaId = genbaSelect ? genbaSelect.value : '';
  drOpenPhotoPicker(genbaId, 'all');
}

// 完了報告書写真ペア用（単一選択）
function drPickSinglePhoto(setIdx, side) {
  drPickerMode = 'single';
  var hiddenEl = document.getElementById('drPs' + (side === 'before' ? 'Before' : 'After') + 'Id_' + setIdx);
  var currentId = hiddenEl ? hiddenEl.value : '';
  drPickerSelected = currentId ? [parseInt(currentId)] : [];

  drPickerCallback = function(selectedIds) {
    var photoId = selectedIds.length > 0 ? selectedIds[0] : '';
    if (hiddenEl) hiddenEl.value = photoId;
    if (photoId) {
      drRenderSetThumb(setIdx, side, parseInt(photoId));
    } else {
      var container = document.getElementById('drPs' + (side === 'before' ? 'Before' : 'After') + '_' + setIdx);
      if (container) container.innerHTML = '<span style="font-size:12px; color:#9ca3af;">タップで選択</span>';
    }
  };

  // カテゴリを自動フィルタ
  var filterCat = side === 'before' ? 'before' : 'after';
  var genbaId = document.getElementById('drCompGenba') ? document.getElementById('drCompGenba').value : '';
  drOpenPhotoPicker(genbaId, filterCat);
}

async function drOpenPhotoPicker(genbaId, category) {
  drPickerCat = category || 'all';
  var modal = document.getElementById('drPhotoPickerModal');

  // 現場フィルターのselect更新
  var genbaList = await getAllGenba();
  var genbaSelect = document.getElementById('drPickerGenba');
  genbaSelect.innerHTML = '<option value="all">全ての現場</option>';
  genbaList.forEach(function(g) {
    genbaSelect.innerHTML += '<option value="' + g.id + '"' + (g.id === genbaId ? ' selected' : '') + '>' + escapeHtml(g.name) + '</option>';
  });

  // カテゴリフィルターUI
  drUpdatePickerCatUI(drPickerCat);

  // 写真読み込み
  await drLoadPickerPhotos();

  modal.classList.remove('hidden');
}

function drClosePhotoPicker() {
  document.getElementById('drPhotoPickerModal').classList.add('hidden');
}

function drPickerCatFilter(cat) {
  drPickerCat = cat;
  drUpdatePickerCatUI(cat);
  drLoadPickerPhotos();
}

function drUpdatePickerCatUI(cat) {
  var btns = document.querySelectorAll('#drPhotoPickerModal [data-cat]');
  btns.forEach(function(b) {
    if (b.getAttribute('data-cat') === cat) {
      b.style.background = '#3b82f6';
      b.style.color = 'white';
      b.style.fontWeight = 'bold';
    } else {
      b.style.background = 'white';
      b.style.color = '#374151';
      b.style.fontWeight = 'normal';
    }
  });
}

async function drLoadPickerPhotos() {
  var genbaId = document.getElementById('drPickerGenba').value || 'all';
  var grid = document.getElementById('drPickerGrid');
  grid.innerHTML = '<div style="text-align:center; padding:20px; color:#9ca3af;">読み込み中...</div>';

  var photos = await getAllPhotoManager();
  if (genbaId !== 'all') {
    photos = photos.filter(function(p) { return p.genbaId === genbaId; });
  }
  if (drPickerCat !== 'all') {
    photos = photos.filter(function(p) { return p.category === drPickerCat; });
  }

  if (photos.length === 0) {
    grid.innerHTML = '<div style="text-align:center; color:#9ca3af; padding:30px; font-size:14px;">写真がありません</div>';
    drUpdatePickerCount();
    return;
  }

  // 日付でグループ化
  var grouped = {};
  photos.forEach(function(p) {
    var d = p.takenDate || 'unknown';
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(p);
  });

  var html = '';
  var dates = Object.keys(grouped).sort().reverse();
  dates.forEach(function(d) {
    html += '<div style="font-size:12px; font-weight:bold; color:#6b7280; margin:8px 0 4px;">' + drFormatDateJP(d) + '</div>';
    html += '<div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; margin-bottom:8px;">';
    grouped[d].forEach(function(p) {
      var isSelected = drPickerSelected.indexOf(p.id) >= 0;
      var thumbHtml = '';
      if (p.thumbnailBlob) {
        var url = URL.createObjectURL(p.thumbnailBlob);
        drObjectUrls.push(url);
        thumbHtml = '<img src="' + url + '" style="width:100%; height:100%; object-fit:cover;">';
      }
      html += '<div onclick="drTogglePickerPhoto(' + p.id + ', this)" style="position:relative; aspect-ratio:1; border-radius:8px; overflow:hidden; border:' + (isSelected ? '3px solid #3b82f6' : '1px solid #e5e7eb') + '; cursor:pointer;">' +
        thumbHtml +
        (isSelected ? '<div style="position:absolute; top:2px; right:2px; background:#3b82f6; color:white; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold;">✓</div>' : '') +
      '</div>';
    });
    html += '</div>';
  });

  grid.innerHTML = html;
  drUpdatePickerCount();
}

function drTogglePickerPhoto(photoId, el) {
  if (drPickerMode === 'single') {
    // 単一選択: 選択中のを解除して新しいのを選択
    drPickerSelected = [photoId];
    drLoadPickerPhotos(); // 再描画
    return;
  }
  // 複数選択
  var idx = drPickerSelected.indexOf(photoId);
  if (idx >= 0) {
    drPickerSelected.splice(idx, 1);
  } else {
    drPickerSelected.push(photoId);
  }
  drLoadPickerPhotos(); // 再描画
}

function drUpdatePickerCount() {
  var countEl = document.getElementById('drPickerCount');
  if (countEl) countEl.textContent = '選択中: ' + drPickerSelected.length + '枚';
}

function drConfirmPhotoPick() {
  if (drPickerCallback) {
    drPickerCallback(drPickerSelected.slice());
  }
  drClosePhotoPicker();
}

// === 日付フォーマット ===
function drFormatDateJP(dateStr) {
  if (!dateStr || dateStr === 'unknown') return '日付不明';
  var parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  return parts[0] + '年' + parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
}

// === PDF出力 ===
async function drExportDailyPDF() {
  var report = drCollectDailyData();
  if (!report) return;
  report.status = 'completed';
  var saved = await saveReport(report);
  if (saved) {
    localStorage.setItem('report_lastReporter', report.reporter || '');
    localStorage.setItem('report_lastWeather', report.weather || '');
    if (typeof generateDailyReportPDF === 'function') {
      await generateDailyReportPDF(saved);
    } else {
      alert('PDF機能は準備中です');
    }
    drCloseDailyModal();
    await drRenderList();
  }
}

async function drExportCompPDF() {
  var report = drCollectCompData();
  if (!report) return;
  report.status = 'completed';
  var saved = await saveReport(report);
  if (saved) {
    localStorage.setItem('report_lastContractor', report.contractor || '');
    localStorage.setItem('report_lastReporter', report.tantousha || '');
    if (typeof generateCompletionReportPDF === 'function') {
      await generateCompletionReportPDF(saved);
    } else {
      alert('PDF機能は準備中です');
    }
    drCloseCompletionModal();
    await drRenderList();
  }
}

// === 削除 ===
async function drDeleteReport(id) {
  if (!confirm('この報告書を削除しますか？')) return;
  await deleteReport(id);
  await drRenderList();
}

async function drDeleteFromModal(id, type) {
  if (!confirm('この報告書を削除しますか？')) return;
  await deleteReport(id);
  if (type === 'daily') {
    drCloseDailyModal();
  } else {
    drCloseCompletionModal();
  }
  await drRenderList();
}

// === ObjectURL cleanup ===
function drCleanupUrls() {
  drObjectUrls.forEach(function(u) {
    try { URL.revokeObjectURL(u); } catch(e) {}
  });
  drObjectUrls = [];
}

// === グローバル公開 ===
window.initDailyReport = initDailyReport;
window.drSwitchTab = drSwitchTab;
window.drCreateNew = drCreateNew;
window.drOpenReport = drOpenReport;
window.drCloseDailyModal = drCloseDailyModal;
window.drCloseCompletionModal = drCloseCompletionModal;
window.drSelectWeather = drSelectWeather;
window.drAddEntry = drAddEntry;
window.drRemoveEntry = drRemoveEntry;
window.drOnEntryGenbaChange = drOnEntryGenbaChange;
window.drSaveDailyDraft = drSaveDailyDraft;
window.drSaveCompDraft = drSaveCompDraft;
window.drOpenPhotoPickerForEntry = drOpenPhotoPickerForEntry;
window.drPickSinglePhoto = drPickSinglePhoto;
window.drClosePhotoPicker = drClosePhotoPicker;
window.drPickerCatFilter = drPickerCatFilter;
window.drLoadPickerPhotos = drLoadPickerPhotos;
window.drTogglePickerPhoto = drTogglePickerPhoto;
window.drConfirmPhotoPick = drConfirmPhotoPick;
window.drExportDailyPDF = drExportDailyPDF;
window.drExportCompPDF = drExportCompPDF;
window.drDeleteReport = drDeleteReport;
window.drOnCompGenbaChange = drOnCompGenbaChange;
window.drAddPhotoSet = drAddPhotoSet;
window.drRemovePhotoSet = drRemovePhotoSet;
window.drShowNewGenbaForm = drShowNewGenbaForm;
window.drHideNewGenbaForm = drHideNewGenbaForm;
window.drAddNewGenba = drAddNewGenba;

console.log('[daily-report.js] ✓ Phase7日報・報告書モジュール読み込み完了');
