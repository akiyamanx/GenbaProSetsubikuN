// ==========================================
// データ一元連携ロジック（全画面共通の同期関数）
// 現場Pro 設備くん v0.53 - Phase5-3
// ==========================================

// v5.3追加 - 工種カラーマップ
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

// カテゴリからカラーを自動判定
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

// カテゴリを工程名から推定
function guessCategory(name) {
  if (!name) return '';
  var map = [
    ['解体', '解体'], ['電気', '電気'], ['給排水', '給排水'], ['給水', '給排水'], ['排水', '給排水'],
    ['配管', '給排水'], ['設備', '設備'], ['ガス', 'ガス'], ['大工', '大工'], ['木工', '大工'],
    ['クロス', 'クロス'], ['壁紙', 'クロス'], ['タイル', 'タイル'], ['建具', '建具'],
    ['塗装', '塗装'], ['美装', '美装'], ['クリーニング', '美装'], ['検査', '検査'],
    ['防水', '防水'], ['外壁', '外壁'], ['屋根', '屋根'], ['基礎', '基礎'],
    ['仮設', '仮設'], ['外構', '外構'], ['内装', 'クロス'], ['床', 'クロス']
  ];
  for (var i = 0; i < map.length; i++) {
    if (name.indexOf(map[i][0]) >= 0) return map[i][1];
  }
  return '';
}

// ==========================================
// 工程表取込 → スケジュール同期
// ==========================================
async function syncKouteiToSchedule(kouteiItem, genbaId, genbaName) {
  var cat = kouteiItem.category || guessCategory(kouteiItem.name);
  var entry = {
    date: kouteiItem.startDate || new Date().toISOString().split('T')[0],
    endDate: kouteiItem.endDate || kouteiItem.startDate || '',
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
  return await saveSchedule(entry);
}

// ==========================================
// トーク解析 → スケジュール同期
// ==========================================
async function syncTalkToSchedule(talkItem, genbaId, genbaName) {
  var cat = guessCategory(talkItem.summary || '');
  var entry = {
    date: talkItem.date || new Date().toISOString().split('T')[0],
    endDate: talkItem.endDate || talkItem.date || '',
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
  return await saveSchedule(entry);
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

// グローバル公開
window.KOUTEI_COLORS = KOUTEI_COLORS;
window.getKouteiColor = getKouteiColor;
window.guessCategory = guessCategory;
window.syncKouteiToSchedule = syncKouteiToSchedule;
window.syncTalkToSchedule = syncTalkToSchedule;
window.expandSchedulesToDayMap = expandSchedulesToDayMap;
window.collectUsedColors = collectUsedColors;

console.log('[schedule-sync.js] ✓ データ一元連携モジュール読み込み完了（v0.53）');
