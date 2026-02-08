// ==========================================
// 日報管理機能
// 現場Pro 設備くん Phase3
// ==========================================

// ==========================================
// 画面初期化
// ==========================================

async function initNippoScreen() {
  // 月フィルターに今月をセット
  var now = new Date();
  var monthInput = document.getElementById('nippoFilterMonth');
  if (monthInput && !monthInput.value) {
    monthInput.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }
  await loadNippoFilters();
  await filterNippo();
}

async function loadNippoFilters() {
  try {
    var genbaList = await getAllGenba();
    var filterSel = document.getElementById('nippoFilterGenba');
    if (!filterSel) return;
    var val = filterSel.value;
    filterSel.innerHTML = '<option value="">全ての現場</option>';
    genbaList.forEach(function(g) {
      filterSel.innerHTML += '<option value="' + g.id + '">' + escapeHtml(g.name) + '</option>';
    });
    filterSel.value = val;
  } catch (e) {
    console.error('[Nippo] フィルター読み込み失敗:', e);
  }
}

// ==========================================
// 一覧表示
// ==========================================

async function filterNippo() {
  var filterGenba = document.getElementById('nippoFilterGenba');
  var filterMonth = document.getElementById('nippoFilterMonth');
  if (!filterGenba) return;

  var genbaId = filterGenba.value;
  var month = filterMonth ? filterMonth.value : '';

  try {
    var nippoList;
    if (genbaId) {
      nippoList = await getNippoByGenba(genbaId);
    } else {
      nippoList = await getAllNippo();
    }

    // 月フィルター
    if (month) {
      nippoList = nippoList.filter(function(n) {
        return (n.date || '').startsWith(month);
      });
    }

    renderNippoList(nippoList);
  } catch (e) {
    console.error('[Nippo] 一覧取得エラー:', e);
  }
}

async function renderNippoList(nippoList) {
  var container = document.getElementById('nippoList');
  if (!container) return;

  if (nippoList.length === 0) {
    container.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-state-icon">📋</div>' +
        '<div>日報がありません</div>' +
        '<div style="font-size: 12px; margin-top: 8px;">「日報を作成」または「AI自動生成」で作成してください</div>' +
      '</div>';
    return;
  }

  // 現場名キャッシュ
  var genbaCache = {};
  try {
    var allGenba = await getAllGenba();
    allGenba.forEach(function(g) { genbaCache[g.id] = g.name; });
  } catch (e) {}

  var weatherIcons = { '晴れ': '☀️', '曇り': '☁️', '雨': '🌧️', '雪': '❄️' };

  var html = '';
  nippoList.forEach(function(n) {
    var genbaName = genbaCache[n.genbaId] || '不明';
    var wIcon = weatherIcons[n.weather] || '';
    var dateDisp = (n.date || '').replace(/-/g, '/');
    var contentPreview = (n.content || '').substring(0, 60);
    if ((n.content || '').length > 60) contentPreview += '...';

    html += '<div onclick="editNippo(\'' + n.id + '\')" style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; margin-bottom: 10px; cursor: pointer;">';
    html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">';
    html += '<div style="font-weight: bold; color: #1f2937; font-size: 15px;">' + dateDisp + ' ' + wIcon + '</div>';
    if (n.aiGenerated) {
      html += '<span style="background: #dbeafe; color: #1d4ed8; padding: 2px 8px; border-radius: 10px; font-size: 11px;">🤖 AI</span>';
    }
    html += '</div>';
    html += '<div style="font-size: 13px; color: #3b82f6; margin-bottom: 4px;">🏗️ ' + escapeHtml(genbaName) + '</div>';
    html += '<div style="font-size: 13px; color: #6b7280;">' + escapeHtml(contentPreview) + '</div>';
    if (n.workers) {
      html += '<div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">👷 ' + escapeHtml(n.workers) + '</div>';
    }
    html += '</div>';
  });

  container.innerHTML = html;
}

// ==========================================
// 日報フォーム
// ==========================================

async function showNippoForm(editId) {
  var today = new Date().toISOString().split('T')[0];

  // 現場リスト読み込み
  try {
    var genbaList = await getAllGenba();
    var sel = document.getElementById('nippoGenbaSelect');
    sel.innerHTML = '<option value="">選択してください</option>';
    genbaList.forEach(function(g) {
      sel.innerHTML += '<option value="' + g.id + '">' + escapeHtml(g.name) + '</option>';
    });
  } catch (e) {}

  if (editId) {
    // 編集モード
    document.getElementById('nippoFormTitle').textContent = '📋 日報編集';
    document.getElementById('nippoDeleteBtn').style.display = 'block';
    try {
      var nippo = await getNippo(editId);
      if (!nippo) { alert('日報が見つかりません'); return; }
      document.getElementById('nippoEditId').value = nippo.id;
      document.getElementById('nippoDate').value = nippo.date || today;
      document.getElementById('nippoWeather').value = nippo.weather || '晴れ';
      document.getElementById('nippoGenbaSelect').value = nippo.genbaId || '';
      document.getElementById('nippoContent').value = nippo.content || '';
      document.getElementById('nippoWorkers').value = nippo.workers || '';
      document.getElementById('nippoNotes').value = nippo.notes || '';
      if (nippo.genbaId) await loadNippoKouteiProgress(nippo.genbaId, nippo.kouteiProgress);
      if (nippo.genbaId) await loadNippoPhotos(nippo.genbaId, nippo.date);
    } catch (e) {
      console.error('[Nippo] 編集データ読み込みエラー:', e);
    }
  } else {
    // 新規モード
    document.getElementById('nippoFormTitle').textContent = '📋 日報作成';
    document.getElementById('nippoDeleteBtn').style.display = 'none';
    document.getElementById('nippoEditId').value = '';
    document.getElementById('nippoDate').value = today;
    document.getElementById('nippoWeather').value = '晴れ';
    document.getElementById('nippoGenbaSelect').value = '';
    document.getElementById('nippoContent').value = '';
    document.getElementById('nippoWorkers').value = '';
    document.getElementById('nippoNotes').value = '';
    document.getElementById('nippoKouteiProgress').innerHTML =
      '<div style="color: #9ca3af; font-size: 13px;">現場を選択すると工程が表示されます</div>';
    document.getElementById('nippoPhotoList').innerHTML =
      '<div style="color: #9ca3af; font-size: 13px;">現場を選択すると当日の写真が表示されます</div>';
  }

  document.getElementById('nippoFormModal').classList.remove('hidden');
}

function closeNippoForm() {
  document.getElementById('nippoFormModal').classList.add('hidden');
}

function editNippo(id) {
  showNippoForm(id);
}

// 現場変更時
async function onNippoGenbaChange() {
  var genbaId = document.getElementById('nippoGenbaSelect').value;
  if (!genbaId) return;

  await loadNippoKouteiProgress(genbaId);
  var date = document.getElementById('nippoDate').value;
  if (date) await loadNippoPhotos(genbaId, date);
}

// 工程進捗リスト表示
async function loadNippoKouteiProgress(genbaId, savedProgress) {
  var container = document.getElementById('nippoKouteiProgress');
  try {
    var kouteiList = await getKouteiByGenba(genbaId);
    if (kouteiList.length === 0) {
      container.innerHTML = '<div style="color: #9ca3af; font-size: 13px;">工程が登録されていません</div>';
      return;
    }

    var progressMap = {};
    if (savedProgress && Array.isArray(savedProgress)) {
      savedProgress.forEach(function(p) { progressMap[p.kouteiId] = p; });
    }

    var html = '';
    kouteiList.forEach(function(k) {
      var saved = progressMap[k.id] || {};
      var progress = saved.progress || 0;
      html += '<div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin-bottom: 8px;">';
      html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">';
      html += '<span style="font-size: 13px; font-weight: 500;">' + escapeHtml(k.name) + '</span>';
      html += '<span style="font-size: 12px; color: #3b82f6;" id="nippo-prog-val-' + k.id + '">' + progress + '%</span>';
      html += '</div>';
      html += '<input type="range" min="0" max="100" step="10" value="' + progress + '" data-koutei-id="' + k.id + '" class="nippo-progress-slider" ';
      html += 'oninput="document.getElementById(\'nippo-prog-val-' + k.id + '\').textContent=this.value+\'%\'" ';
      html += 'style="width: 100%; accent-color: #3b82f6;">';
      html += '</div>';
    });

    container.innerHTML = html;
  } catch (e) {
    console.error('[Nippo] 工程進捗読み込みエラー:', e);
    container.innerHTML = '<div style="color: #ef4444; font-size: 13px;">読み込みエラー</div>';
  }
}

// 当日の写真サムネイル表示
async function loadNippoPhotos(genbaId, date) {
  var container = document.getElementById('nippoPhotoList');
  try {
    var photos = await getPhotosByGenba(genbaId);
    // 日付でフィルター
    if (date) {
      photos = photos.filter(function(p) { return p.date === date; });
    }

    if (photos.length === 0) {
      container.innerHTML = '<div style="color: #9ca3af; font-size: 13px;">当日の写真はありません</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < photos.length; i++) {
      var thumb = await getImageFromIDB(photos[i].imageRef);
      if (thumb) {
        html += '<img src="' + thumb + '" style="width: 56px; height: 56px; object-fit: cover; border-radius: 8px; border: 1px solid #e5e7eb;">';
      }
    }
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<div style="color: #9ca3af; font-size: 13px;">写真の読み込みに失敗</div>';
  }
}

// ==========================================
// 保存
// ==========================================

async function saveNippoForm() {
  var genbaId = document.getElementById('nippoGenbaSelect').value;
  var date = document.getElementById('nippoDate').value;
  var content = document.getElementById('nippoContent').value.trim();

  if (!genbaId) { alert('現場を選択してください'); return; }
  if (!date) { alert('日付を入力してください'); return; }
  if (!content) { alert('作業内容を入力してください'); return; }

  // 工程進捗を収集
  var sliders = document.querySelectorAll('.nippo-progress-slider');
  var kouteiProgress = [];
  sliders.forEach(function(s) {
    kouteiProgress.push({
      kouteiId: s.getAttribute('data-koutei-id'),
      progress: parseInt(s.value) || 0
    });
  });

  var editId = document.getElementById('nippoEditId').value;
  var nippo = {
    id: editId || undefined,
    genbaId: genbaId,
    date: date,
    weather: document.getElementById('nippoWeather').value,
    content: content,
    workers: document.getElementById('nippoWorkers').value.trim(),
    notes: document.getElementById('nippoNotes').value.trim(),
    kouteiProgress: kouteiProgress
  };

  // AI生成フラグ
  var hiddenInput = document.getElementById('nippoEditId');
  if (hiddenInput.getAttribute('data-ai') === 'true') {
    nippo.aiGenerated = true;
    hiddenInput.removeAttribute('data-ai');
  }

  // 編集時は既存データのフラグを保持
  if (editId) {
    try {
      var existing = await getNippo(editId);
      if (existing) {
        nippo.createdAt = existing.createdAt;
        if (existing.aiGenerated) nippo.aiGenerated = true;
      }
    } catch (e) {}
  }

  try {
    await saveNippo(nippo);
    closeNippoForm();
    await filterNippo();
    alert('日報を保存しました');
  } catch (e) {
    console.error('[Nippo] 保存エラー:', e);
    alert('保存に失敗しました: ' + e.message);
  }
}

async function deleteCurrentNippo() {
  var editId = document.getElementById('nippoEditId').value;
  if (!editId) return;
  if (!confirm('この日報を削除しますか？')) return;
  try {
    await deleteNippo(editId);
    closeNippoForm();
    await filterNippo();
    alert('削除しました');
  } catch (e) {
    console.error('[Nippo] 削除エラー:', e);
    alert('削除に失敗しました');
  }
}

// ==========================================
// AI自動生成
// ==========================================

async function generateNippoWithAI() {
  var today = new Date().toISOString().split('T')[0];

  // 現場選択モーダルを表示
  try {
    var genbaList = await getAllGenba();
    var sel = document.getElementById('nippoAiGenbaSelect');
    sel.innerHTML = '<option value="">選択してください</option>';
    genbaList.filter(function(g) { return g.status === '進行中'; }).forEach(function(g) {
      sel.innerHTML += '<option value="' + g.id + '">' + escapeHtml(g.name) + '</option>';
    });
  } catch (e) {}

  document.getElementById('nippoAiDate').value = today;
  document.getElementById('nippoAiSelectModal').classList.remove('hidden');
}

async function executeAiNippo() {
  var genbaId = document.getElementById('nippoAiGenbaSelect').value;
  var date = document.getElementById('nippoAiDate').value;

  if (!genbaId) { alert('現場を選択してください'); return; }
  if (!date) { alert('日付を選択してください'); return; }

  var settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  var apiKey = settings.geminiApiKey;
  if (!apiKey) {
    alert('この機能にはGemini APIキーが必要です。\n設定画面からAPIキーを入力してください。');
    return;
  }

  document.getElementById('nippoAiSelectModal').classList.add('hidden');
  document.getElementById('nippoAiLoading').classList.remove('hidden');

  try {
    // データ収集
    var genba = await getGenba(genbaId);
    var kouteiList = await getKouteiByGenba(genbaId);
    var photos = await getPhotosByGenba(genbaId);
    var todayPhotos = photos.filter(function(p) { return p.date === date; });

    // 写真情報テキスト
    var photoInfo = todayPhotos.map(function(p) {
      return '- カテゴリ: ' + (p.category || '不明') + ', メモ: ' + (p.memo || 'なし');
    }).join('\n');

    // 工程情報テキスト
    var kouteiInfo = kouteiList.map(function(k) {
      return '- ' + k.name + ' (状態: ' + (k.status || '未着手') + ')';
    }).join('\n');

    var prompt = '以下の現場情報と写真記録をもとに、建設・リフォーム業の日報を作成してください。\n\n' +
      '【現場情報】\n' +
      '現場名: ' + (genba ? genba.name : '') + '\n' +
      'お客様: ' + (genba ? genba.clientName || '' : '') + '\n' +
      '日付: ' + date + '\n\n' +
      '【工程】\n' + (kouteiInfo || 'なし') + '\n\n' +
      '【本日の写真記録】\n' + (photoInfo || '写真なし') + '\n\n' +
      '以下のJSON形式で返してください。説明文は不要です。\n' +
      '{\n' +
      '  "content": "作業内容（100〜200文字程度。箇条書きで）",\n' +
      '  "workers": "想定作業員（例: 配管工1名、電工1名）",\n' +
      '  "notes": "備考・安全事項（50文字程度）"\n' +
      '}';

    var response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
        })
      }
    );

    if (!response.ok) throw new Error('API呼び出しに失敗');

    var data = await response.json();
    var text = data.candidates[0].content.parts[0].text;
    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI応答のパースに失敗');

    var result = JSON.parse(jsonMatch[0]);

    // フォームに反映して表示
    await showNippoForm();
    document.getElementById('nippoDate').value = date;
    document.getElementById('nippoGenbaSelect').value = genbaId;
    document.getElementById('nippoContent').value = result.content || '';
    document.getElementById('nippoWorkers').value = result.workers || '';
    document.getElementById('nippoNotes').value = result.notes || '';
    document.getElementById('nippoEditId').value = '';

    // AI生成フラグ（保存時に付与）
    var hiddenInput = document.getElementById('nippoEditId');
    hiddenInput.setAttribute('data-ai', 'true');

    await onNippoGenbaChange();

    alert('AIが日報の下書きを作成しました。\n内容を確認・修正して保存してください。');
  } catch (e) {
    console.error('[Nippo] AI生成エラー:', e);
    alert('AI生成に失敗しました: ' + e.message);
  } finally {
    document.getElementById('nippoAiLoading').classList.add('hidden');
  }
}

// ==========================================
// 報告書PDF出力（HTML印刷方式 - 日本語フォント対応）
// doc-template.js と同じ window.open() + window.print() 方式
// ==========================================

async function exportNippoPDF() {
  var genbaId = document.getElementById('nippoGenbaSelect').value;
  var date = document.getElementById('nippoDate').value;
  var content = document.getElementById('nippoContent').value.trim();
  var weather = document.getElementById('nippoWeather').value;
  var workers = document.getElementById('nippoWorkers').value.trim();
  var notes = document.getElementById('nippoNotes').value.trim();

  if (!genbaId || !content) {
    alert('現場と作業内容を入力してから出力してください');
    return;
  }

  try {
    var genba = await getGenba(genbaId);
    var genbaName = genba ? genba.name : '';
    var clientName = genba ? (genba.clientName || '') : '';

    // 工程進捗収集
    var sliders = document.querySelectorAll('.nippo-progress-slider');
    var progressItems = [];
    for (var i = 0; i < sliders.length; i++) {
      var s = sliders[i];
      var kId = s.getAttribute('data-koutei-id');
      var pct = parseInt(s.value) || 0;
      try {
        var k = await getKoutei(kId);
        if (k) progressItems.push({ name: k.name, progress: pct });
      } catch (e) {}
    }

    // 写真取得（最大6枚）
    var photos = await getPhotosByGenba(genbaId);
    var dayPhotos = photos.filter(function(p) { return p.date === date; });
    var photoImages = [];
    for (var j = 0; j < Math.min(dayPhotos.length, 6); j++) {
      var img = await getImageFromIDB(dayPhotos[j].imageRef);
      if (img) photoImages.push({ src: img, memo: dayPhotos[j].memo || '', category: dayPhotos[j].category || '' });
    }

    // 会社情報
    var settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');

    // HTML生成
    var html = generateNippoHTML({
      date: date,
      weather: weather,
      genbaName: genbaName,
      clientName: clientName,
      workers: workers,
      content: content,
      notes: notes,
      progressItems: progressItems,
      photoImages: photoImages,
      settings: settings
    });

    // 新しいウィンドウで印刷（doc-template.jsと同じ方式）
    var printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('ポップアップがブロックされました。\nブラウザの設定でポップアップを許可してください。');
      return;
    }

    printWindow.document.write(html);
    printWindow.document.close();

    await new Promise(function(resolve) {
      printWindow.onload = resolve;
      setTimeout(resolve, 1000);
    });

    printWindow.print();
  } catch (e) {
    console.error('[Nippo] PDF出力エラー:', e);
    alert('PDF出力に失敗しました: ' + e.message);
  }
}

function generateNippoHTML(d) {
  var weatherIcons = { '晴れ': '☀️', '曇り': '☁️', '雨': '🌧️', '雪': '❄️' };
  var wIcon = weatherIcons[d.weather] || '';

  // 会社情報
  var companyHtml = '';
  var s = d.settings;
  if (s.companyName) companyHtml += '<div style="font-size:12px;font-weight:bold;margin-bottom:1mm;">' + escapeHtml(s.companyName) + '</div>';
  if (s.phone) companyHtml += '<div>TEL: ' + escapeHtml(s.phone) + '</div>';

  // 工程進捗HTML
  var progressHtml = '';
  if (d.progressItems.length > 0) {
    progressHtml = '<div class="section"><div class="section-title">工程進捗</div><table class="progress-table"><thead><tr><th style="text-align:left;">工程名</th><th style="width:100px;">進捗</th><th style="width:45px;">%</th></tr></thead><tbody>';
    d.progressItems.forEach(function(p) {
      var barColor = p.progress >= 100 ? '#22c55e' : (p.progress >= 50 ? '#3b82f6' : '#f59e0b');
      progressHtml += '<tr><td>' + escapeHtml(p.name) + '</td>';
      progressHtml += '<td><div class="progress-bar"><div class="progress-fill" style="width:' + p.progress + '%;background:' + barColor + ';"></div></div></td>';
      progressHtml += '<td style="text-align:center;font-weight:bold;">' + p.progress + '%</td></tr>';
    });
    progressHtml += '</tbody></table></div>';
  }

  // 写真HTML
  var photoHtml = '';
  if (d.photoImages.length > 0) {
    photoHtml = '<div class="section"><div class="section-title">現場写真</div><div class="photo-grid">';
    d.photoImages.forEach(function(p) {
      photoHtml += '<div class="photo-item">';
      photoHtml += '<img src="' + p.src + '" class="photo-img">';
      if (p.category || p.memo) {
        photoHtml += '<div class="photo-caption">';
        if (p.category) photoHtml += '<span class="photo-badge">' + escapeHtml(p.category) + '</span> ';
        if (p.memo) photoHtml += escapeHtml(p.memo);
        photoHtml += '</div>';
      }
      photoHtml += '</div>';
    });
    photoHtml += '</div></div>';
  }

  // 備考HTML
  var notesHtml = '';
  if (d.notes) {
    notesHtml = '<div class="section"><div class="section-title">備考・連絡事項</div><div class="notes-content">' + escapeHtml(d.notes).replace(/\n/g, '<br>') + '</div></div>';
  }

  return '<!DOCTYPE html>\n<html lang="ja">\n<head>\n<meta charset="UTF-8">\n<title>作業日報 - ' + escapeHtml(d.genbaName) + ' ' + d.date + '</title>\n<style>\n' +
    '* { margin: 0; padding: 0; box-sizing: border-box; }\n' +
    '@page { size: A4 portrait; margin: 8mm 10mm 8mm 10mm; }\n' +
    'body {\n' +
    '  font-family: "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro", "Yu Gothic", "游ゴシック", "Meiryo", "メイリオ", sans-serif;\n' +
    '  font-size: 10px; color: #1a1a1a; line-height: 1.5;\n' +
    '  -webkit-print-color-adjust: exact; print-color-adjust: exact;\n' +
    '}\n' +
    '.page { width: 190mm; margin: 0 auto; }\n' +
    '.doc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4mm; padding-bottom: 2mm; border-bottom: 3px solid #1e3a5f; }\n' +
    '.doc-title { font-size: 22px; font-weight: bold; letter-spacing: 6px; color: #1e3a5f; }\n' +
    '.company-block { text-align: right; font-size: 9px; line-height: 1.6; }\n' +
    '.info-table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }\n' +
    '.info-table td { padding: 2mm 3mm; border: 1px solid #cbd5e0; font-size: 10px; vertical-align: middle; }\n' +
    '.info-table .label { background: #edf2f7; font-weight: bold; color: #2d3748; width: 22mm; text-align: center; }\n' +
    '.section { margin-bottom: 4mm; }\n' +
    '.section-title { font-size: 12px; font-weight: bold; color: #1e3a5f; border-left: 4px solid #1e3a5f; padding-left: 3mm; margin-bottom: 2mm; }\n' +
    '.content-box { border: 1px solid #cbd5e0; border-radius: 2px; padding: 3mm; font-size: 10px; line-height: 1.8; white-space: pre-wrap; min-height: 20mm; }\n' +
    '.progress-table { width: 100%; border-collapse: collapse; font-size: 9px; }\n' +
    '.progress-table th { background: #edf2f7; padding: 1.5mm 2mm; border: 1px solid #cbd5e0; font-size: 9px; }\n' +
    '.progress-table td { padding: 1.5mm 2mm; border: 1px solid #cbd5e0; }\n' +
    '.progress-bar { width: 100%; height: 4mm; background: #e2e8f0; border-radius: 2px; overflow: hidden; }\n' +
    '.progress-fill { height: 100%; border-radius: 2px; }\n' +
    '.photo-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3mm; }\n' +
    '.photo-item { border: 1px solid #cbd5e0; border-radius: 2px; overflow: hidden; }\n' +
    '.photo-img { width: 100%; height: 35mm; object-fit: cover; display: block; }\n' +
    '.photo-caption { padding: 1mm 2mm; font-size: 8px; color: #4a5568; }\n' +
    '.photo-badge { background: #edf2f7; padding: 0.5mm 2mm; border-radius: 2px; font-size: 7px; font-weight: bold; }\n' +
    '.notes-content { border: 1px solid #cbd5e0; border-radius: 2px; padding: 2mm 3mm; font-size: 9px; line-height: 1.6; background: #fffef5; }\n' +
    '.doc-footer { font-size: 8px; color: #a0aec0; text-align: center; padding-top: 3mm; margin-top: 3mm; border-top: 1px solid #e2e8f0; }\n' +
    '@media print { body { margin: 0; } .page { width: auto; } .no-print { display: none !important; } }\n' +
    '@media screen { body { background: #e2e8f0; padding: 10mm; } .page { background: white; box-shadow: 0 2px 10px rgba(0,0,0,0.15); padding: 8mm 10mm; border-radius: 2px; } }\n' +
    '</style>\n</head>\n<body>\n<div class="page">\n' +

    '<!-- ヘッダー -->\n' +
    '<div class="doc-header">\n' +
    '  <div><div class="doc-title">作 業 日 報</div></div>\n' +
    '  <div class="company-block">' + companyHtml + '</div>\n' +
    '</div>\n' +

    '<!-- 基本情報テーブル -->\n' +
    '<table class="info-table">\n' +
    '  <tr><td class="label">日付</td><td>' + escapeHtml(d.date) + '</td><td class="label">天候</td><td>' + wIcon + ' ' + escapeHtml(d.weather) + '</td></tr>\n' +
    '  <tr><td class="label">現場名</td><td colspan="3">' + escapeHtml(d.genbaName) + '</td></tr>\n' +
    (d.clientName ? '  <tr><td class="label">お客様</td><td colspan="3">' + escapeHtml(d.clientName) + '</td></tr>\n' : '') +
    (d.workers ? '  <tr><td class="label">作業員</td><td colspan="3">' + escapeHtml(d.workers) + '</td></tr>\n' : '') +
    '</table>\n' +

    '<!-- 作業内容 -->\n' +
    '<div class="section">\n' +
    '  <div class="section-title">作業内容</div>\n' +
    '  <div class="content-box">' + escapeHtml(d.content) + '</div>\n' +
    '</div>\n' +

    progressHtml +
    photoHtml +
    notesHtml +

    '<!-- フッター -->\n' +
    '<div class="doc-footer">現場Pro 設備くん - 作業日報</div>\n' +
    '</div>\n</body>\n</html>';
}

// ==========================================
// グローバル公開
// ==========================================
window.initNippoScreen = initNippoScreen;
window.filterNippo = filterNippo;
window.showNippoForm = showNippoForm;
window.closeNippoForm = closeNippoForm;
window.editNippo = editNippo;
window.onNippoGenbaChange = onNippoGenbaChange;
window.saveNippoForm = saveNippoForm;
window.deleteCurrentNippo = deleteCurrentNippo;
window.generateNippoWithAI = generateNippoWithAI;
window.executeAiNippo = executeAiNippo;
window.exportNippoPDF = exportNippoPDF;
