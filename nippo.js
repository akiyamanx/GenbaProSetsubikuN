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
// 報告書PDF出力
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
    var progressTexts = [];
    for (var i = 0; i < sliders.length; i++) {
      var s = sliders[i];
      var kId = s.getAttribute('data-koutei-id');
      var pct = s.value;
      try {
        var k = await getKoutei(kId);
        if (k) progressTexts.push(k.name + ': ' + pct + '%');
      } catch (e) {}
    }

    // 写真取得
    var photos = await getPhotosByGenba(genbaId);
    var dayPhotos = photos.filter(function(p) { return p.date === date; });
    var photoImages = [];
    for (var j = 0; j < Math.min(dayPhotos.length, 4); j++) {
      var img = await getImageFromIDB(dayPhotos[j].imageRef);
      if (img) photoImages.push(img);
    }

    // PDF生成（jsPDFを使用）
    if (typeof jspdf === 'undefined' && typeof jsPDF === 'undefined') {
      alert('PDF生成ライブラリが読み込まれていません');
      return;
    }

    var JsPDF = (typeof jspdf !== 'undefined') ? jspdf.jsPDF : jsPDF;
    var doc = new JsPDF('p', 'mm', 'a4');

    // フォント設定
    doc.setFont('Helvetica');

    // ヘッダー
    doc.setFillColor(30, 58, 95);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text('作業日報', 105, 18, { align: 'center' });

    // 基本情報
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    var y = 40;

    doc.setFont('Helvetica', 'bold');
    doc.text('日付:', 15, y);
    doc.setFont('Helvetica', 'normal');
    doc.text(date + '  天候: ' + weather, 45, y);
    y += 8;

    doc.setFont('Helvetica', 'bold');
    doc.text('現場:', 15, y);
    doc.setFont('Helvetica', 'normal');
    doc.text(genbaName, 45, y);
    y += 8;

    if (clientName) {
      doc.setFont('Helvetica', 'bold');
      doc.text('お客様:', 15, y);
      doc.setFont('Helvetica', 'normal');
      doc.text(clientName, 45, y);
      y += 8;
    }

    if (workers) {
      doc.setFont('Helvetica', 'bold');
      doc.text('作業員:', 15, y);
      doc.setFont('Helvetica', 'normal');
      doc.text(workers, 45, y);
      y += 8;
    }

    // 区切り線
    y += 4;
    doc.setDrawColor(200, 200, 200);
    doc.line(15, y, 195, y);
    y += 8;

    // 作業内容
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('作業内容', 15, y);
    y += 7;
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    var contentLines = doc.splitTextToSize(content, 170);
    doc.text(contentLines, 15, y);
    y += contentLines.length * 5 + 5;

    // 工程進捗
    if (progressTexts.length > 0) {
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('工程進捗', 15, y);
      y += 7;
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      progressTexts.forEach(function(t) {
        doc.text('・' + t, 20, y);
        y += 5;
      });
      y += 5;
    }

    // 備考
    if (notes) {
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('備考', 15, y);
      y += 7;
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(10);
      var notesLines = doc.splitTextToSize(notes, 170);
      doc.text(notesLines, 15, y);
      y += notesLines.length * 5 + 5;
    }

    // 写真（ページ下部またはnew page）
    if (photoImages.length > 0) {
      if (y > 200) {
        doc.addPage();
        y = 20;
      }
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('現場写真', 15, y);
      y += 8;

      var imgX = 15;
      photoImages.forEach(function(imgData, idx) {
        try {
          doc.addImage(imgData, 'JPEG', imgX, y, 42, 32);
          imgX += 47;
          if (idx === 1) { imgX = 15; y += 37; }
        } catch (e) {}
      });
    }

    // フッター
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('現場Pro 設備くん - 作業日報', 105, 285, { align: 'center' });

    doc.save('日報_' + genbaName + '_' + date + '.pdf');
  } catch (e) {
    console.error('[Nippo] PDF出力エラー:', e);
    alert('PDF出力に失敗しました: ' + e.message);
  }
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
