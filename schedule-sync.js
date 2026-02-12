// ==========================================
// データ一元連携ロジック（全画面共通の同期関数）
// 現場Pro 設備くん v0.55 - Phase5-3 v5.5修正
// 複数日またぎバー連結描画対応
// ==========================================

// v5.4修正 - 工種カラーマップ（デフォルト）
var KOUTEI_COLORS = {
  '解体': '#E74C3C',
  '電気': '#F1C40F',
  '給排水': '#3498DB',
  '設備': '#3498DB',
  'ガス': '#E67E22',
  '大工': '#8B4513',
  'クロス': '#9B59B6',
  'タイル': '#1ABC9C',
  '建具': '#D35400',
  '塗装': '#2ECC71',
  '美装': '#FF69B4',
  '検査': '#2C3E50',
  '防水': '#0288D1',
  '外壁': '#795548',
  '屋根': '#607D8B',
  '基礎': '#455A64',
  '仮設': '#78909C',
  '外構': '#4CAF50',
  'その他': '#95A5A6'
};

// v5.4追加 - カラーピッカーのプリセット色
var PRESET_COLORS = [
  '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C',
  '#3498DB', '#9B59B6', '#8B4513', '#FF69B4', '#34495E',
  '#607D8B', '#00BCD4', '#795548', '#FF5722', '#4CAF50',
  '#673AB7', '#009688', '#CDDC39'
];

// v5.4修正 - 色取得のフォールバック強化
function getKouteiColor(category) {
  if (!category) return KOUTEI_COLORS['その他'];
  // 完全一致
  if (KOUTEI_COLORS[category]) return KOUTEI_COLORS[category];
  // 部分一致
  var keys = Object.keys(KOUTEI_COLORS);
  for (var i = 0; i < keys.length; i++) {
    if (category.indexOf(keys[i]) >= 0) return KOUTEI_COLORS[keys[i]];
  }
  return KOUTEI_COLORS['その他'];
}

// v5.4修正 - 工種カテゴリ推定の強化版（キーワードベース）
function guessCategory(taskName) {
  if (!taskName) return '';

  var name = taskName.toLowerCase();

  // キーワードマッピング（優先度順）
  var keywordMap = [
    { keywords: ['解体', '撤去', '取り壊し', 'はつり', '斫り', '取外', '取り外', '搬出'], category: '解体' },
    { keywords: ['電気', '配線', '分電盤', 'コンセント', 'スイッチ', '照明', 'エアコン', '弱電'], category: '電気' },
    { keywords: ['給水', '排水', '給湯', '配管', '水道', 'ub', 'ユニットバス', '浴室', 'トイレ', '便器', '洗面', 'キッチン', '流し', '水回り', 'シャワー', '設備', '衛生', '器具', '取付', '据付'], category: '給排水' },
    { keywords: ['ガス', '給湯器', 'ボイラー'], category: 'ガス' },
    { keywords: ['大工', '造作', '下地', 'フローリング', '床', '天井', '間仕切', 'ボード', '木工', '框', '幅木', '棚', '収納'], category: '大工' },
    { keywords: ['クロス', '壁紙', 'cf', 'クッションフロア', '内装', '仕上', '張替'], category: 'クロス' },
    { keywords: ['タイル', 'モザイク'], category: 'タイル' },
    { keywords: ['建具', 'ドア', '扉', '引戸', 'サッシ', '窓', '網戸'], category: '建具' },
    { keywords: ['塗装', 'ペンキ', '塗り', '吹付', 'コーキング', '防水'], category: '塗装' },
    { keywords: ['美装', 'クリーニング', '清掃', '養生'], category: '美装' },
    { keywords: ['検査', '確認', '試運転', '引渡', '竣工', '打合', '立会'], category: '検査' },
    { keywords: ['仮設', '足場'], category: '仮設' },
    { keywords: ['補修', '手直し', 'パテ'], category: 'クロス' },
    { keywords: ['墨出', '墨出し'], category: '給排水' },
    { keywords: ['搬入'], category: '給排水' },
  ];

  for (var i = 0; i < keywordMap.length; i++) {
    var map = keywordMap[i];
    for (var j = 0; j < map.keywords.length; j++) {
      if (name.indexOf(map.keywords[j].toLowerCase()) !== -1) {
        return map.category;
      }
    }
  }

  return '';
}

// v5.4追加 - ユーザー追加カテゴリをKOUTEI_COLORSにマージ
async function loadCustomCategories() {
  try {
    var customs = await getAllCustomCategory();
    for (var i = 0; i < customs.length; i++) {
      KOUTEI_COLORS[customs[i].name] = customs[i].color;
    }
    console.log('[schedule-sync] カスタム工種 ' + customs.length + '件をマージ');
  } catch (e) {
    console.log('[schedule-sync] カスタム工種読み込みスキップ:', e.message);
  }
}

// ==========================================
// 工程表取込 → スケジュール同期
// ==========================================
async function syncKouteiToSchedule(kouteiItem, genbaId, genbaName) {
  console.log('[schedule-sync] syncKouteiToSchedule 入力:', JSON.stringify(kouteiItem));
  console.log('[schedule-sync] genbaId:', genbaId, 'genbaName:', genbaName);
  var cat = kouteiItem.category || guessCategory(kouteiItem.name);
  var dateVal = kouteiItem.startDate || new Date().toISOString().split('T')[0];
  var endDateVal = kouteiItem.endDate || kouteiItem.startDate || dateVal;
  var entry = {
    date: dateVal,
    endDate: endDateVal,
    genbaId: genbaId || '',
    genbaName: genbaName || '',
    kouteiId: '',
    kouteiName: kouteiItem.name || '',
    shokuninId: '',
    shokuninName: kouteiItem.who || '',
    memo: kouteiItem.note || '',
    category: cat,
    color: getKouteiColor(cat),
    source: 'koutei_import',
    isUserSchedule: false
  };
  console.log('[schedule-sync] 保存するentry:', JSON.stringify(entry));
  var result = await saveSchedule(entry);
  console.log('[schedule-sync] saveSchedule結果:', result ? 'OK id=' + result.id : 'FAIL');
  return result;
}

// ==========================================
// トーク解析 → スケジュール同期
// ==========================================
async function syncTalkToSchedule(talkItem, genbaId, genbaName) {
  console.log('[schedule-sync] syncTalkToSchedule 入力:', JSON.stringify(talkItem));
  var cat = guessCategory(talkItem.summary || '');
  var dateVal = talkItem.date || new Date().toISOString().split('T')[0];
  var entry = {
    date: dateVal,
    endDate: talkItem.endDate || talkItem.date || dateVal,
    genbaId: genbaId || '',
    genbaName: genbaName || '',
    kouteiId: '',
    kouteiName: '',
    shokuninId: '',
    shokuninName: talkItem.who || '',
    memo: '[トーク解析] ' + (talkItem.summary || '') + (talkItem.detail ? '\n' + talkItem.detail : ''),
    category: cat,
    color: cat ? getKouteiColor(cat) : '#607D8B',
    source: 'talk_analysis',
    isUserSchedule: false
  };
  console.log('[schedule-sync] 保存するentry:', JSON.stringify(entry));
  var result = await saveSchedule(entry);
  console.log('[schedule-sync] saveSchedule結果:', result ? 'OK id=' + result.id : 'FAIL');
  return result;
}

// ==========================================
// 日付ごとにスケジュールを展開（複数日またぎ対応）
// ==========================================
function expandSchedulesToDayMap(schedules, monthStart, monthEnd) {
  var dayMap = {}; // { 'YYYY-MM-DD': [ {schedule, barType} ] }
  for (var i = 0; i < schedules.length; i++) {
    var sc = schedules[i];
    var start = sc.date || '';
    var end = sc.endDate || sc.date || start;
    if (!start) continue;
    // 期間を日ごとに展開
    var cur = start < monthStart ? monthStart : start;
    var last = end > monthEnd ? monthEnd : end;
    while (cur <= last) {
      if (!dayMap[cur]) dayMap[cur] = [];
      var barType = 'single';
      if (start !== end) {
        if (cur === start) barType = 'start';
        else if (cur === last && last === end) barType = 'end';
        else if (cur === last && last !== end) barType = 'middle';
        else barType = 'middle';
      }
      dayMap[cur].push({ schedule: sc, barType: barType });
      // 次の日
      var d = new Date(cur + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      cur = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
  }
  return dayMap;
}

// v5.5追加 - 予定をスパン（期間）としてまとめる（ID重複排除）
function buildEventSpans(schedules) {
  var spans = [];
  var seen = {};
  for (var i = 0; i < schedules.length; i++) {
    var sc = schedules[i];
    if (!sc.id || seen[sc.id]) continue;
    seen[sc.id] = true;
    var startDate = sc.date || '';
    var endDate = sc.endDate || sc.date || startDate;
    if (!startDate) continue;
    if (!endDate) endDate = startDate;
    spans.push({ id: sc.id, schedule: sc, startDate: startDate, endDate: endDate, _row: 0, _drawDates: [] });
  }
  return spans;
}

// v5.5追加 - バーの段割り当て（重なり回避）
function assignBarRows(spans, monthStart, monthEnd) {
  // 開始日順にソート（同じ開始日なら期間が長い方が先）
  spans.sort(function(a, b) {
    if (a.startDate < b.startDate) return -1;
    if (a.startDate > b.startDate) return 1;
    if (a.endDate > b.endDate) return -1;
    if (a.endDate < b.endDate) return 1;
    return 0;
  });
  var dayRows = {};
  for (var i = 0; i < spans.length; i++) {
    var span = spans[i];
    var cur = span.startDate < monthStart ? monthStart : span.startDate;
    var last = span.endDate > monthEnd ? monthEnd : span.endDate;
    var dates = [];
    while (cur <= last) {
      dates.push(cur);
      if (!dayRows[cur]) dayRows[cur] = [];
      var d = new Date(cur + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      cur = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    if (dates.length === 0) continue;
    // 空いている段を探す
    var row = 0;
    var found = false;
    while (!found) {
      var rowOk = true;
      for (var j = 0; j < dates.length; j++) {
        if (dayRows[dates[j]][row]) { rowOk = false; break; }
      }
      if (rowOk) found = true;
      else row++;
    }
    span._row = row;
    span._drawDates = dates;
    for (var j = 0; j < dates.length; j++) {
      while (dayRows[dates[j]].length <= row) dayRows[dates[j]].push(null);
      dayRows[dates[j]][row] = span;
    }
  }
  return dayRows;
}

// v5.5追加 - バー位置タイプ判定（start/middle/end/single）
function getBarType(span, dateStr, monthStart, monthEnd) {
  if (span.startDate === span.endDate) return 'single';
  var visStart = span.startDate < monthStart ? monthStart : span.startDate;
  var visEnd = span.endDate > monthEnd ? monthEnd : span.endDate;
  if (visStart === visEnd) return 'single';
  if (dateStr === visStart) return 'start';
  if (dateStr === visEnd) return 'end';
  return 'middle';
}

// 凡例用: 使用されている工種カラーを収集
function collectUsedColors(schedules) {
  var used = {};
  for (var i = 0; i < schedules.length; i++) {
    var sc = schedules[i];
    var cat = sc.category || guessCategory(sc.kouteiName || sc.genbaName || '');
    if (cat && !used[cat]) {
      used[cat] = getKouteiColor(cat);
    }
  }
  return used;
}

// v5.6追加 - 丸数字ヘルパー（バーとテキストの番号表示用）
var CIRCLE_NUMS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
function getCircleNum(n) {
  if (n >= 1 && n <= 10) return CIRCLE_NUMS[n - 1];
  return '(' + n + ')';
}

// グローバル公開
window.KOUTEI_COLORS = KOUTEI_COLORS;
window.PRESET_COLORS = PRESET_COLORS;
window.getKouteiColor = getKouteiColor;
window.guessCategory = guessCategory;
window.loadCustomCategories = loadCustomCategories;
window.syncKouteiToSchedule = syncKouteiToSchedule;
window.syncTalkToSchedule = syncTalkToSchedule;
window.expandSchedulesToDayMap = expandSchedulesToDayMap;
window.buildEventSpans = buildEventSpans;
window.assignBarRows = assignBarRows;
window.getBarType = getBarType;
window.collectUsedColors = collectUsedColors;
window.getCircleNum = getCircleNum;

console.log('[schedule-sync.js] ✓ データ一元連携モジュール読み込み完了（v0.56）');
