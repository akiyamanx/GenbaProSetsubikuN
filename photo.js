// ==========================================
// 写真管理機能
// 現場Pro 設備くん Phase3
// ==========================================

let _photoTempData = null;  // 撮影した画像の一時データ
let _photoDetailId = null;  // 詳細表示中の写真ID

// ==========================================
// 画面初期化
// ==========================================

async function initPhotoScreen() {
  await loadPhotoFilters();
  await filterPhotos();
}

async function loadPhotoFilters() {
  try {
    var genbaList = await getAllGenba();
    var select = document.getElementById('photoFilterGenba');
    var regSelect = document.getElementById('photoGenbaSelect');
    if (!select) return;

    // フィルター用
    var val = select.value;
    select.innerHTML = '<option value="">全ての現場</option>';
    genbaList.forEach(function(g) {
      select.innerHTML += '<option value="' + g.id + '">' + escapeHtml(g.name) + '</option>';
    });
    select.value = val;

    // 登録モーダル用
    if (regSelect) {
      regSelect.innerHTML = '<option value="">選択してください</option>';
      genbaList.forEach(function(g) {
        regSelect.innerHTML += '<option value="' + g.id + '">' + escapeHtml(g.name) + '</option>';
      });
    }
  } catch (e) {
    console.error('[Photo] フィルター読み込み失敗:', e);
  }
}

// 現場変更時に工程リストを更新
async function onPhotoGenbaChange() {
  var genbaId = document.getElementById('photoGenbaSelect').value;
  var kouteiSelect = document.getElementById('photoKouteiSelect');
  kouteiSelect.innerHTML = '<option value="">選択してください</option>';

  if (!genbaId) return;

  try {
    var kouteiList = await getKouteiByGenba(genbaId);
    kouteiList.forEach(function(k) {
      kouteiSelect.innerHTML += '<option value="' + k.id + '">' + escapeHtml(k.name) + '</option>';
    });
  } catch (e) {
    console.error('[Photo] 工程読み込み失敗:', e);
  }
}

// フィルター変更時に工程リストも更新
async function onFilterGenbaChange() {
  var genbaId = document.getElementById('photoFilterGenba').value;
  var kouteiSelect = document.getElementById('photoFilterKoutei');
  kouteiSelect.innerHTML = '<option value="">全ての工程</option>';

  if (genbaId) {
    try {
      var kouteiList = await getKouteiByGenba(genbaId);
      kouteiList.forEach(function(k) {
        kouteiSelect.innerHTML += '<option value="' + k.id + '">' + escapeHtml(k.name) + '</option>';
      });
    } catch (e) {
      console.error('[Photo] 工程フィルター読み込み失敗:', e);
    }
  }
  filterPhotos();
}

// ==========================================
// 撮影・選択
// ==========================================

function takePhoto() {
  document.getElementById('photoCameraInput').click();
}

function pickPhotoFromGallery() {
  document.getElementById('photoGalleryInput').click();
}

async function handlePhotoCaptured(event) {
  var file = event.target.files[0];
  if (!file) return;

  var reader = new FileReader();
  reader.onload = async function(e) {
    _photoTempData = e.target.result;

    // プレビュー表示
    document.getElementById('photoPreviewImg').src = _photoTempData;

    // フィルターをリセット
    await loadPhotoFilters();
    document.getElementById('photoGenbaSelect').value = '';
    document.getElementById('photoKouteiSelect').innerHTML = '<option value="">選択してください</option>';
    document.getElementById('photoCategorySelect').value = '配管工事';
    document.getElementById('photoMemoInput').value = '';

    // AI結果をリセット
    document.getElementById('photoAiResult').style.display = 'none';

    // モーダル表示
    document.getElementById('photoRegisterModal').classList.remove('hidden');

    // AI自動分類を実行
    classifyPhotoWithAI(_photoTempData);
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

// ==========================================
// Gemini Vision API 自動分類
// ==========================================

async function classifyPhotoWithAI(imageData) {
  var settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  var apiKey = settings.geminiApiKey;
  if (!apiKey) return;

  var loading = document.getElementById('photoAiLoading');
  loading.classList.remove('hidden');

  try {
    var base64 = imageData.split(',')[1];
    var mimeType = imageData.split(';')[0].split(':')[1];

    var prompt = 'この写真は建設・リフォーム現場の写真です。以下の情報をJSON形式で返してください。説明文は不要です。\n\n' +
      '{\n' +
      '  "category": "以下から最適なものを1つ選択: 配管工事, 電気工事, 解体工事, 内装工事, 外装工事, 設備搬入, 完了検査, その他",\n' +
      '  "description": "写真の内容を30文字以内で説明"\n' +
      '}\n\n' +
      '注意: categoryは必ず上記の選択肢から選んでください。';

    var response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 256 }
        })
      }
    );

    if (response.ok) {
      var data = await response.json();
      var text = data.candidates[0].content.parts[0].text;
      var jsonStr = text;
      var jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];

      var result = JSON.parse(jsonStr);

      // カテゴリを反映
      if (result.category) {
        document.getElementById('photoCategorySelect').value = result.category;
        document.getElementById('photoAiCategory').textContent = result.category;
      }
      if (result.description) {
        document.getElementById('photoAiDescription').textContent = result.description;
        document.getElementById('photoMemoInput').value = result.description;
      }
      document.getElementById('photoAiResult').style.display = 'block';
    }
  } catch (e) {
    console.error('[Photo] AI分類エラー:', e);
  } finally {
    loading.classList.add('hidden');
  }
}

// ==========================================
// 保存
// ==========================================

async function saveNewPhoto() {
  var genbaId = document.getElementById('photoGenbaSelect').value;
  if (!genbaId) {
    alert('現場を選択してください');
    return;
  }
  if (!_photoTempData) {
    alert('写真データがありません');
    return;
  }

  var kouteiId = document.getElementById('photoKouteiSelect').value;
  var category = document.getElementById('photoCategorySelect').value;
  var memo = document.getElementById('photoMemoInput').value.trim();

  try {
    var photoId = generateId();

    // 画像をIDBに保存
    await saveImageToIDB('photo_' + photoId, _photoTempData);

    // メタデータを保存
    var photo = {
      id: photoId,
      genbaId: genbaId,
      kouteiId: kouteiId || null,
      category: category,
      memo: memo,
      imageRef: 'photo_' + photoId
    };

    await savePhoto(photo);
    _photoTempData = null;

    closePhotoRegister();
    await filterPhotos();

    alert('写真を保存しました');
  } catch (e) {
    console.error('[Photo] 保存エラー:', e);
    alert('保存に失敗しました: ' + e.message);
  }
}

function closePhotoRegister() {
  document.getElementById('photoRegisterModal').classList.add('hidden');
  _photoTempData = null;
}

// ==========================================
// 一覧表示・フィルター
// ==========================================

async function filterPhotos() {
  var filterGenba = document.getElementById('photoFilterGenba');
  var filterKoutei = document.getElementById('photoFilterKoutei');
  var filterCategory = document.getElementById('photoFilterCategory');

  if (!filterGenba) return;

  var genbaId = filterGenba.value;
  var kouteiId = filterKoutei ? filterKoutei.value : '';
  var category = filterCategory ? filterCategory.value : '';

  try {
    var photos;
    if (genbaId) {
      photos = await getPhotosByGenba(genbaId);
    } else {
      photos = await getAllPhotos();
    }

    // 追加フィルター
    if (kouteiId) {
      photos = photos.filter(function(p) { return p.kouteiId === kouteiId; });
    }
    if (category) {
      photos = photos.filter(function(p) { return p.category === category; });
    }

    document.getElementById('photoCount').textContent = photos.length + '枚';
    renderPhotoGallery(photos);
  } catch (e) {
    console.error('[Photo] 一覧取得エラー:', e);
  }
}

async function renderPhotoGallery(photos) {
  var container = document.getElementById('photoGalleryList');
  if (!container) return;

  if (photos.length === 0) {
    container.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-state-icon">📷</div>' +
        '<div>写真がありません</div>' +
        '<div style="font-size: 12px; margin-top: 8px;">撮影またはギャラリーから追加してください</div>' +
      '</div>';
    return;
  }

  // 現場名キャッシュ
  var genbaCache = {};
  try {
    var allGenba = await getAllGenba();
    allGenba.forEach(function(g) { genbaCache[g.id] = g.name; });
  } catch (e) {}

  // サムネイルグリッド
  var html = '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">';

  for (var i = 0; i < photos.length; i++) {
    var p = photos[i];
    var genbaName = genbaCache[p.genbaId] || '';
    var thumb = await getImageFromIDB(p.imageRef);
    var dateStr = p.date || '';
    if (dateStr.length >= 10) {
      dateStr = dateStr.substring(5, 7) + '/' + dateStr.substring(8, 10);
    }

    html += '<div onclick="showPhotoDetail(\'' + p.id + '\')" style="cursor: pointer; border-radius: 10px; overflow: hidden; border: 1px solid #e5e7eb; background: white;">';
    html += '<div style="position: relative;">';
    if (thumb) {
      html += '<img src="' + thumb + '" style="width: 100%; height: 100px; object-fit: cover;">';
    } else {
      html += '<div style="width: 100%; height: 100px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; color: #9ca3af;">📷</div>';
    }
    // カテゴリバッジ
    html += '<div style="position: absolute; top: 4px; left: 4px; background: rgba(0,0,0,0.6); color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px;">' + escapeHtml(p.category || '') + '</div>';
    html += '</div>';
    // 情報
    html += '<div style="padding: 6px; font-size: 11px;">';
    html += '<div style="color: #374151; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + escapeHtml(genbaName) + '</div>';
    html += '<div style="color: #9ca3af;">' + dateStr + '</div>';
    html += '</div>';
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

// ==========================================
// 写真詳細
// ==========================================

async function showPhotoDetail(photoId) {
  _photoDetailId = photoId;
  try {
    var photo = await getPhoto(photoId);
    if (!photo) { alert('写真が見つかりません'); return; }

    var img = await getImageFromIDB(photo.imageRef);
    if (img) {
      document.getElementById('photoDetailImg').src = img;
    }
    document.getElementById('photoDetailMemo').value = photo.memo || '';

    // 情報表示
    var genbaName = '';
    var kouteiName = '';
    try {
      if (photo.genbaId) {
        var g = await getGenba(photo.genbaId);
        if (g) genbaName = g.name;
      }
      if (photo.kouteiId) {
        var k = await getKoutei(photo.kouteiId);
        if (k) kouteiName = k.name;
      }
    } catch (e) {}

    var info = '<div style="background: #f9fafb; padding: 10px; border-radius: 8px;">';
    info += '<div><strong>現場:</strong> ' + escapeHtml(genbaName) + '</div>';
    if (kouteiName) info += '<div><strong>工程:</strong> ' + escapeHtml(kouteiName) + '</div>';
    info += '<div><strong>カテゴリ:</strong> ' + escapeHtml(photo.category || 'なし') + '</div>';
    info += '<div><strong>日時:</strong> ' + (photo.createdAt || '').replace('T', ' ').substring(0, 16) + '</div>';
    info += '</div>';
    document.getElementById('photoDetailInfo').innerHTML = info;

    document.getElementById('photoDetailModal').classList.remove('hidden');
  } catch (e) {
    console.error('[Photo] 詳細表示エラー:', e);
    alert('写真の読み込みに失敗しました');
  }
}

function closePhotoDetail() {
  document.getElementById('photoDetailModal').classList.add('hidden');
  _photoDetailId = null;
}

async function updatePhotoMemo() {
  if (!_photoDetailId) return;
  try {
    var photo = await getPhoto(_photoDetailId);
    if (!photo) return;
    photo.memo = document.getElementById('photoDetailMemo').value.trim();
    await savePhoto(photo);
    closePhotoDetail();
    await filterPhotos();
    alert('メモを更新しました');
  } catch (e) {
    console.error('[Photo] メモ更新エラー:', e);
    alert('更新に失敗しました');
  }
}

async function deleteCurrentPhoto() {
  if (!_photoDetailId) return;
  if (!confirm('この写真を削除しますか？')) return;
  try {
    await deletePhoto(_photoDetailId);
    closePhotoDetail();
    await filterPhotos();
    alert('削除しました');
  } catch (e) {
    console.error('[Photo] 削除エラー:', e);
    alert('削除に失敗しました');
  }
}

// ==========================================
// AI工程提案
// ==========================================

async function suggestKouteiWithAI(genbaId) {
  var settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
  var apiKey = settings.geminiApiKey;
  if (!apiKey) {
    alert('この機能にはGemini APIキーが必要です。\n設定画面からAPIキーを入力してください。');
    return null;
  }

  var genba = await getGenba(genbaId);
  if (!genba) return null;

  try {
    var prompt = '以下のリフォーム現場の情報から、標準的な工程を提案してください。\n\n' +
      '現場名: ' + genba.name + '\n' +
      'お客様: ' + (genba.clientName || '') + '\n' +
      '住所: ' + (genba.address || '') + '\n' +
      '備考: ' + (genba.notes || '') + '\n\n' +
      '以下のJSON形式で5〜10個の工程を返してください。説明文は不要です。\n' +
      '[\n' +
      '  {"name": "工程名", "days": 予想日数, "description": "簡潔な説明"}\n' +
      ']\n\n' +
      '設備工事（配管・電気・空調）を中心に、解体→配管→電気→内装→設備取付→試運転→清掃→検査 の順序で提案してください。';

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
    var jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (e) {
    console.error('[Photo] AI工程提案エラー:', e);
    alert('AI工程提案に失敗しました: ' + e.message);
    return null;
  }
}

// ==========================================
// 現場クイック追加
// ==========================================

async function quickAddGenbaPhoto(targetSelectId) {
  var name = prompt('新しい現場名を入力してください');
  if (!name || !name.trim()) return;

  try {
    var genba = { name: name.trim(), status: '進行中' };
    var saved = await saveGenba(genba);
    if (!saved) {
      alert('現場の保存に失敗しました');
      return;
    }
    // ドロップダウン再読み込み
    await loadPhotoFilters();
    // 指定セレクトで新規現場を自動選択
    var select = document.getElementById(targetSelectId);
    if (select) {
      select.value = saved.id;
      // 登録モーダル側なら工程リストも更新
      if (targetSelectId === 'photoGenbaSelect') {
        onPhotoGenbaChange();
      } else if (targetSelectId === 'photoFilterGenba') {
        onFilterGenbaChange();
      }
    }
  } catch (e) {
    console.error('[Photo] 現場クイック追加エラー:', e);
    alert('現場の追加に失敗しました: ' + e.message);
  }
}

// ==========================================
// グローバル公開
// ==========================================
window.initPhotoScreen = initPhotoScreen;
window.takePhoto = takePhoto;
window.pickPhotoFromGallery = pickPhotoFromGallery;
window.handlePhotoCaptured = handlePhotoCaptured;
window.onPhotoGenbaChange = onPhotoGenbaChange;
window.filterPhotos = filterPhotos;
window.saveNewPhoto = saveNewPhoto;
window.closePhotoRegister = closePhotoRegister;
window.showPhotoDetail = showPhotoDetail;
window.closePhotoDetail = closePhotoDetail;
window.updatePhotoMemo = updatePhotoMemo;
window.deleteCurrentPhoto = deleteCurrentPhoto;
window.onFilterGenbaChange = onFilterGenbaChange;
window.classifyPhotoWithAI = classifyPhotoWithAI;
window.suggestKouteiWithAI = suggestKouteiWithAI;
window.quickAddGenbaPhoto = quickAddGenbaPhoto;
