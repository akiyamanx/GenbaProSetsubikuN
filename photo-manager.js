// ==========================================
// photo-manager.js
// Phase6: 写真管理メインロジック
// 現場Pro 設備くん v0.97追加
// ==========================================

// v0.97追加 - 現在選択中の写真ファイル
var pmCurrentPhotoFile = null;
// v0.97追加 - 詳細表示中の写真ID
var pmCurrentDetailId = null;
// v0.97追加 - ObjectURL管理（メモリリーク防止）
var pmObjectUrls = [];

// === 初期化 ===
async function initPhotoManager() {
  console.log('[PhotoManager] 初期化開始');
  await pmLoadGenbaFilter();
  pmSetupTabs();
  pmSetupEvents();
  await pmRenderGrid();
  console.log('[PhotoManager] 初期化完了');
}

// === イベント設定 ===
function pmSetupEvents() {
  var addBtn = document.getElementById('pmAddBtn');
  if (addBtn) addBtn.onclick = pmOpenRegisterModal;

  var closeBtn = document.getElementById('pmRegCloseBtn');
  if (closeBtn) closeBtn.onclick = pmCloseRegisterModal;
  var cancelBtn = document.getElementById('pmRegCancelBtn');
  if (cancelBtn) cancelBtn.onclick = pmCloseRegisterModal;

  var cameraBtn = document.getElementById('pmCameraBtn');
  if (cameraBtn) cameraBtn.onclick = function() {
    document.getElementById('pmCameraInput').click();
  };
  var galleryBtn = document.getElementById('pmGalleryBtn');
  if (galleryBtn) galleryBtn.onclick = function() {
    document.getElementById('pmGalleryInput').click();
  };

  var cameraInput = document.getElementById('pmCameraInput');
  if (cameraInput) cameraInput.onchange = pmHandleFileSelect;
  var galleryInput = document.getElementById('pmGalleryInput');
  if (galleryInput) galleryInput.onchange = pmHandleFileSelect;

  var registerBtn = document.getElementById('pmRegisterBtn');
  if (registerBtn) registerBtn.onclick = pmRegisterPhoto;

  var bbCheck = document.getElementById('pmBlackboardCheck');
  if (bbCheck) bbCheck.onchange = function() {
    pmToggleBlackboardForm(this.checked);
  };

  // カテゴリラジオ変更時に黒板区分を連動
  var radios = document.querySelectorAll('input[name="pmCategory"]');
  radios.forEach(function(r) {
    r.addEventListener('change', function() {
      var bbCat = document.getElementById('pmBbCategory');
      if (bbCat) bbCat.value = pmGetCategoryLabelLocal(this.value);
    });
  });

  // 詳細モーダル
  var detailBack = document.getElementById('pmDetailBackBtn');
  if (detailBack) detailBack.onclick = pmCloseDetailModal;
  var deleteBtn = document.getElementById('pmDeleteBtn');
  if (deleteBtn) deleteBtn.onclick = pmDeletePhoto;
  var shareBtn = document.getElementById('pmShareBtn');
  if (shareBtn) shareBtn.onclick = function() { pmSharePhoto(pmCurrentDetailId); };
  var editMemoBtn = document.getElementById('pmEditMemoBtn');
  if (editMemoBtn) editMemoBtn.onclick = function() { pmEditMemo(pmCurrentDetailId); };
}

// === カテゴリラベル（グローバルgetCategoryLabelとの衝突回避） ===
function pmGetCategoryLabelLocal(cat) {
  var labels = { before: '施工前', during: '施工中', after: '施工後', other: 'その他' };
  return labels[cat] || cat;
}

// === 現場フィルター読み込み ===
async function pmLoadGenbaFilter() {
  var select = document.getElementById('pmGenbaFilter');
  if (!select) return;
  select.innerHTML = '<option value="all">全現場</option>';
  try {
    var genbaList = await getAllGenba();
    genbaList.forEach(function(g) {
      var opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name || '(名前なし)';
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('[PhotoManager] 現場読込エラー:', e);
  }
  select.onchange = function() { pmRenderGrid(); };
}

// === カテゴリタブ ===
function pmSetupTabs() {
  var tabs = document.querySelectorAll('.pm-tab');
  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      tabs.forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      pmRenderGrid();
    });
  });
}

// === 写真グリッド描画 ===
async function pmRenderGrid() {
  var container = document.getElementById('pmGridContainer');
  var emptyState = document.getElementById('pmEmptyState');
  var statusBar = document.getElementById('pmStatusBar');
  if (!container) return;

  var genbaId = document.getElementById('pmGenbaFilter')?.value || 'all';
  var activeTab = document.querySelector('.pm-tab.active');
  var category = activeTab?.dataset.category || 'all';

  var photos = await pmGetFilteredPhotos(genbaId, category);

  // ObjectURL解放
  pmRevokeUrls();

  // 空状態以外の要素をクリア
  var children = container.querySelectorAll('.pm-date-separator, .pm-thumbnail-grid');
  children.forEach(function(el) { el.remove(); });

  if (photos.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    if (statusBar) statusBar.textContent = '写真: 0枚';
    return;
  }
  if (emptyState) emptyState.style.display = 'none';

  // 日付でグループ化
  var grouped = pmGroupByDate(photos);
  var keys = Object.keys(grouped).sort(function(a, b) { return b.localeCompare(a); });

  keys.forEach(function(date) {
    var sep = document.createElement('div');
    sep.className = 'pm-date-separator';
    sep.textContent = pmFormatDateJP(date);
    container.appendChild(sep);

    var grid = document.createElement('div');
    grid.className = 'pm-thumbnail-grid';
    grouped[date].forEach(function(photo) {
      var thumb = pmCreateThumbnail(photo);
      grid.appendChild(thumb);
    });
    container.appendChild(grid);
  });

  // ステータスバー
  var allPhotos = await pmGetFilteredPhotos(genbaId, 'all');
  var bc = allPhotos.filter(function(p) { return p.category === 'before'; }).length;
  var dc = allPhotos.filter(function(p) { return p.category === 'during'; }).length;
  var ac = allPhotos.filter(function(p) { return p.category === 'after'; }).length;
  if (statusBar) statusBar.textContent = '写真: ' + allPhotos.length + '枚  施工前:' + bc + ' 中:' + dc + ' 後:' + ac;
}

// === サムネイル要素生成 ===
function pmCreateThumbnail(photo) {
  var div = document.createElement('div');
  div.className = 'pm-thumbnail';
  div.dataset.photoId = photo.id;

  var img = document.createElement('img');
  if (photo.thumbnailBlob) {
    var url = URL.createObjectURL(photo.thumbnailBlob);
    pmObjectUrls.push(url);
    img.src = url;
  }
  img.alt = photo.memo || '現場写真';
  img.loading = 'lazy';
  div.appendChild(img);

  var badge = document.createElement('span');
  badge.className = 'pm-badge pm-badge-' + photo.category;
  badge.textContent = pmGetCategoryLabelLocal(photo.category);
  div.appendChild(badge);

  if (photo.hasBlackboard) {
    var bbIcon = document.createElement('span');
    bbIcon.className = 'pm-bb-icon';
    bbIcon.textContent = '📋';
    div.appendChild(bbIcon);
  }

  div.addEventListener('click', function() { pmShowDetail(photo.id); });
  return div;
}

// === ObjectURL解放 ===
function pmRevokeUrls() {
  pmObjectUrls.forEach(function(u) { URL.revokeObjectURL(u); });
  pmObjectUrls = [];
}

// === フィルタ取得 ===
async function pmGetFilteredPhotos(genbaId, category) {
  try {
    var photos = await getAllPhotoManager();
    if (genbaId !== 'all') {
      photos = photos.filter(function(p) { return p.genbaId === genbaId; });
    }
    if (category !== 'all') {
      photos = photos.filter(function(p) { return p.category === category; });
    }
    return photos;
  } catch (e) {
    console.error('[PhotoManager] 写真取得エラー:', e);
    return [];
  }
}

// === 日付グループ化 ===
function pmGroupByDate(photos) {
  var grouped = {};
  photos.forEach(function(p) {
    var d = p.takenDate || 'unknown';
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(p);
  });
  return grouped;
}

function pmFormatDateJP(dateStr) {
  if (!dateStr || dateStr === 'unknown') return '日付不明';
  var parts = dateStr.split('-');
  return parts[0] + '年' + parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
}

// ==========================================
// 写真登録モーダル
// ==========================================

function pmOpenRegisterModal() {
  document.getElementById('pmRegisterModal').style.display = 'flex';
  pmLoadGenbaSelect('pmRegGenba');
  pmLoadKoujiSelect('pmRegKouji');
  // リセット
  document.getElementById('pmPreviewArea').style.display = 'none';
  document.getElementById('pmRegisterForm').style.display = 'none';
  document.getElementById('pmModalActions').style.display = 'none';
  document.getElementById('pmCameraInput').value = '';
  document.getElementById('pmGalleryInput').value = '';
  pmCurrentPhotoFile = null;
}

function pmCloseRegisterModal() {
  document.getElementById('pmRegisterModal').style.display = 'none';
  pmCurrentPhotoFile = null;
}

// === 現場select読込 ===
async function pmLoadGenbaSelect(selectId) {
  var select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = '<option value="">選択してください</option>';
  try {
    var list = await getAllGenba();
    list.forEach(function(g) {
      var opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name || '(名前なし)';
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('[PhotoManager] 現場select読込エラー:', e);
  }
}

// === 工種select読込 ===
function pmLoadKoujiSelect(selectId) {
  var select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = '<option value="">なし</option>';
  if (typeof KOUTEI_COLORS !== 'undefined') {
    Object.keys(KOUTEI_COLORS).forEach(function(key) {
      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = key;
      select.appendChild(opt);
    });
  }
}

// === ファイル選択 ===
function pmHandleFileSelect(e) {
  var file = e.target.files[0];
  if (!file) return;
  pmCurrentPhotoFile = file;

  var reader = new FileReader();
  reader.onload = function(ev) {
    document.getElementById('pmPreviewImg').src = ev.target.result;
    document.getElementById('pmPreviewArea').style.display = 'block';
    document.getElementById('pmRegisterForm').style.display = 'block';
    document.getElementById('pmModalActions').style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

// === 画像リサイズ ===
function pmResizeImage(file, maxLongSide) {
  return new Promise(function(resolve) {
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var w = img.width, h = img.height;
      if (w > h) {
        if (w > maxLongSide) { h = h * maxLongSide / w; w = maxLongSide; }
      } else {
        if (h > maxLongSide) { w = w * maxLongSide / h; h = maxLongSide; }
      }
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(function(blob) {
        URL.revokeObjectURL(url);
        resolve(blob);
      }, 'image/jpeg', 0.85);
    };
    img.src = url;
  });
}

// === 黒板フォーム表示切替 ===
function pmToggleBlackboardForm(show) {
  var form = document.getElementById('pmBlackboardForm');
  if (!form) return;
  form.style.display = show ? 'block' : 'none';
  if (show) {
    // 前回値を自動入力（localStorageから）
    var saved = JSON.parse(localStorage.getItem('pm_last_blackboard') || '{}');
    document.getElementById('pmBbKojiName').value = saved.kojiName || '';
    document.getElementById('pmBbLocation').value = saved.location || '';
    document.getElementById('pmBbContractor').value = saved.contractor || '';
    document.getElementById('pmBbDate').value = new Date().toISOString().split('T')[0];
    var cat = document.querySelector('input[name="pmCategory"]:checked')?.value || 'before';
    document.getElementById('pmBbCategory').value = pmGetCategoryLabelLocal(cat);
  }
}

// === 写真登録 ===
async function pmRegisterPhoto() {
  if (!pmCurrentPhotoFile) { alert('写真を選択してください'); return; }

  var genbaSelect = document.getElementById('pmRegGenba');
  var genbaId = genbaSelect.value;
  if (!genbaId) { alert('現場を選択してください'); return; }
  var genbaName = genbaSelect.options[genbaSelect.selectedIndex]?.text || '';

  var category = document.querySelector('input[name="pmCategory"]:checked')?.value || 'before';
  var kouji = document.getElementById('pmRegKouji')?.value || '';
  var memo = document.getElementById('pmRegMemo')?.value || '';

  // ボタン無効化
  var btn = document.getElementById('pmRegisterBtn');
  btn.disabled = true;
  btn.textContent = '登録中...';

  try {
    var thumbnailBlob = await pmResizeImage(pmCurrentPhotoFile, 400);
    var originalBlob = await pmResizeImage(pmCurrentPhotoFile, 1600);

    var hasBlackboard = document.getElementById('pmBlackboardCheck')?.checked || false;
    var blackboardData = null;

    if (hasBlackboard) {
      blackboardData = {
        kojiName: document.getElementById('pmBbKojiName')?.value || '',
        location: document.getElementById('pmBbLocation')?.value || '',
        category: pmGetCategoryLabelLocal(category),
        contractor: document.getElementById('pmBbContractor')?.value || '',
        date: document.getElementById('pmBbDate')?.value || ''
      };
      // 前回値を記憶
      localStorage.setItem('pm_last_blackboard', JSON.stringify({
        kojiName: blackboardData.kojiName,
        location: blackboardData.location,
        contractor: blackboardData.contractor
      }));
      // 黒板合成
      if (typeof pmCompositeBlackboard === 'function') {
        originalBlob = await pmCompositeBlackboard(originalBlob, blackboardData);
        // サムネイルも黒板合成版から再生成
        var tmpFile = new File([originalBlob], 'thumb.jpg', { type: 'image/jpeg' });
        thumbnailBlob = await pmResizeImage(tmpFile, 400);
      }
    }

    var now = new Date();
    var record = {
      genbaId: genbaId,
      genbaName: genbaName,
      category: category,
      takenDate: now.toISOString().split('T')[0],
      takenTime: now.toTimeString().slice(0, 5),
      memo: memo,
      kouji: kouji,
      thumbnailBlob: thumbnailBlob,
      originalBlob: originalBlob,
      hasBlackboard: hasBlackboard,
      blackboardData: blackboardData,
      createdAt: now
    };

    await savePhotoManager(record);
    pmCloseRegisterModal();
    await pmRenderGrid();
  } catch (e) {
    console.error('[PhotoManager] 登録エラー:', e);
    alert('写真の登録に失敗しました: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '登録する';
  }
}

// ==========================================
// 写真詳細表示
// ==========================================

async function pmShowDetail(photoId) {
  try {
    var photo = await getPhotoManager(photoId);
    if (!photo) return;

    pmCurrentDetailId = photoId;

    var img = document.getElementById('pmDetailImg');
    if (photo.originalBlob) {
      var url = URL.createObjectURL(photo.originalBlob);
      pmObjectUrls.push(url);
      img.src = url;
    }

    document.getElementById('pmDetailGenba').textContent = photo.genbaName || '未設定';
    document.getElementById('pmDetailCategory').textContent = pmGetCategoryLabelLocal(photo.category);
    document.getElementById('pmDetailKouji').textContent = photo.kouji || 'なし';
    document.getElementById('pmDetailMemo').textContent = photo.memo || 'なし';
    document.getElementById('pmDetailDate').textContent =
      (photo.takenDate || '') + ' ' + (photo.takenTime || '');

    document.getElementById('pmDetailModal').style.display = 'flex';
  } catch (e) {
    console.error('[PhotoManager] 詳細表示エラー:', e);
  }
}

function pmCloseDetailModal() {
  document.getElementById('pmDetailModal').style.display = 'none';
  pmCurrentDetailId = null;
}

// === 写真削除 ===
async function pmDeletePhoto() {
  if (!pmCurrentDetailId) return;
  if (!confirm('この写真を削除しますか？')) return;

  try {
    await deletePhotoManager(pmCurrentDetailId);
    pmCloseDetailModal();
    await pmRenderGrid();
  } catch (e) {
    console.error('[PhotoManager] 削除エラー:', e);
    alert('削除に失敗しました');
  }
}

// === メモ編集 ===
async function pmEditMemo(photoId) {
  if (!photoId) return;
  try {
    var photo = await getPhotoManager(photoId);
    if (!photo) return;
    var newMemo = prompt('メモを編集:', photo.memo || '');
    if (newMemo === null) return;
    photo.memo = newMemo;
    await savePhotoManager(photo);
    document.getElementById('pmDetailMemo').textContent = newMemo || 'なし';
  } catch (e) {
    console.error('[PhotoManager] メモ編集エラー:', e);
  }
}

// ==========================================
// 共有/保存
// ==========================================

async function pmSharePhoto(photoId) {
  if (!photoId) return;
  try {
    var photo = await getPhotoManager(photoId);
    if (!photo || !photo.originalBlob) return;

    var fileName = (photo.genbaName || '現場') + '_' +
      pmGetCategoryLabelLocal(photo.category) + '_' +
      (photo.takenDate || '') + '.jpg';
    var file = new File([photo.originalBlob], fileName, { type: 'image/jpeg' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: (photo.genbaName || '') + ' - ' + pmGetCategoryLabelLocal(photo.category),
          text: photo.memo || ''
        });
      } catch (e) {
        if (e.name !== 'AbortError') console.error('共有エラー:', e);
      }
    } else {
      // フォールバック: ダウンロード
      var a = document.createElement('a');
      a.href = URL.createObjectURL(photo.originalBlob);
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  } catch (e) {
    console.error('[PhotoManager] 共有エラー:', e);
    alert('共有に失敗しました');
  }
}

// グローバル公開
window.initPhotoManager = initPhotoManager;
