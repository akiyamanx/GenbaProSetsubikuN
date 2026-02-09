// ==========================================
// 現場Pro 設備くん - コア機能
// v1.0 - CULOchanKAIKEIproからフォーク
// ==========================================

// ==========================================
// 画面切り替え
// ==========================================
// v0.95改善: 画面が見つからない場合のフェイルセーフ + 遅延ロード対応
async function showScreen(screenId) {
  let targetScreen = document.getElementById(screenId + '-screen');

  // v0.95: 画面が見つからない場合、動的ロードを試みる
  if (!targetScreen) {
    console.warn(`${screenId}-screen が未読込。動的ロードを試行...`);
    if (typeof loadScreen === 'function') {
      await loadScreen(screenId);
      targetScreen = document.getElementById(screenId + '-screen');
    }
  }

  // それでも見つからなければホームに留まる（真っ白防止）
  if (!targetScreen) {
    console.error(`画面が見つかりません: ${screenId}-screen`);
    alert(`⚠️ 「${screenId}」画面の読み込みに失敗しました。\nファイルが配置されているか確認してください。`);
    return; // activeを外さないのでホーム画面のまま
  }

  // ★ 対象が見つかってから他画面を非表示にする（真っ白防止）
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  targetScreen.classList.add('active');
  window.scrollTo(0, 0);
  
  // v0.96: 保存バーの表示制御（設定画面のときだけ表示）
  var saveBar = document.querySelector('.save-bar');
  if (saveBar) {
    saveBar.style.display = (screenId === 'settings') ? 'block' : 'none';
  }
  
  if (screenId === 'home') {
    if (typeof updateDashboard === 'function') updateDashboard();
  } else {
    history.pushState({ screen: screenId }, '', '');
  }
  
  if (screenId === 'materials') {
    if (typeof filterMaster === 'function') filterMaster();
  }
  if (screenId === 'estimate') {
    if (typeof initEstimateScreen === 'function') initEstimateScreen();
  }
  if (screenId === 'invoice') {
    if (typeof initInvoiceScreen === 'function') initInvoiceScreen();
  }
  if (screenId === 'expenses') {
    if (typeof initExpensesScreen === 'function') initExpensesScreen();
  }
  if (screenId === 'data') {
    if (typeof initDataScreen === 'function') initDataScreen();
  }
  if (screenId === 'receipt') {
    if (typeof initReceiptScreen === 'function') initReceiptScreen();
  }
  // v0.95追加: レシートリスト画面の初期化
  if (screenId === 'receipt-list') {
    if (typeof initReceiptList === 'function') initReceiptList();
  }
  // v1.0追加: 現場管理画面の初期化
  if (screenId === 'genba') {
    if (typeof initGenbaScreen === 'function') initGenbaScreen();
  }
  // v1.0追加: 工程表画面の初期化
  if (screenId === 'koutei') {
    if (typeof initKouteiScreen === 'function') initKouteiScreen();
  }
  // v2.0追加: 職人管理画面の初期化
  if (screenId === 'shokunin') {
    if (typeof initShokuninScreen === 'function') initShokuninScreen();
  }
  // v2.0追加: スケジュール画面の初期化
  if (screenId === 'schedule') {
    if (typeof initScheduleScreen === 'function') initScheduleScreen();
  }
  // v3.0追加: 写真管理画面の初期化
  if (screenId === 'photo') {
    if (typeof initPhotoScreen === 'function') initPhotoScreen();
  }
  // v3.0追加: 日報画面の初期化
  if (screenId === 'nippo') {
    if (typeof initNippoScreen === 'function') initNippoScreen();
  }
  // v4.0追加: 間取りエディタ画面の初期化
  if (screenId === 'madori') {
    if (typeof initMadoriScreen === 'function') initMadoriScreen();
  }
  // v0.50追加: トーク解析画面の初期化
  if (screenId === 'talk-analysis') {
    if (typeof initTalkAnalysisScreen === 'function') initTalkAnalysisScreen();
  }
  // v0.52追加: 工程表取込画面の初期化
  if (screenId === 'koutei-import') {
    if (typeof initKouteiImport === 'function') initKouteiImport();
  }
  if (screenId === 'tax') {
    if (typeof selectTaxType === 'function') {
      const savedTaxType = localStorage.getItem('reform_app_tax_type') || 'blue';
      selectTaxType(savedTaxType);
    }
    if (typeof updateTaxSummary === 'function') updateTaxSummary();
  }
  if (screenId === 'customers') {
    if (typeof loadCustomers === 'function') loadCustomers();
  }
  if (screenId === 'settings') {
    if (typeof updateApiUsageDisplay === 'function') updateApiUsageDisplay();
  }
}

// ==========================================
// ホーム画面を表示
// ==========================================
function showHomeScreen() {
  // ★ body背景を元に戻す
  document.body.style.backgroundColor = '#f3f4f6';

  const homeScreen = document.getElementById('home-screen');
  if (homeScreen) {
    homeScreen.classList.add('active');
    console.log('✓ ホーム画面を表示しました');
  } else {
    console.error('home-screen が見つかりません');
  }
  if (typeof checkPasswordOnLoad === 'function') {
    checkPasswordOnLoad();
  }
  // ダッシュボード更新
  updateDashboard();
}

// ==========================================
// ダッシュボード更新
// ==========================================
async function updateDashboard() {
  // サマリーカードのデフォルト値をまず設定
  var elActive = document.getElementById('dash-active-count');
  var elPlanned = document.getElementById('dash-planned-count');
  var elDone = document.getElementById('dash-done-count');
  var listEl = document.getElementById('dash-active-list');

  try {
    if (typeof getAllGenba !== 'function') {
      console.warn('[Dashboard] getAllGenba未定義');
      if (listEl) listEl.innerHTML = '<div style="background:white; border-radius:10px; padding:20px; text-align:center; color:#9ca3af; font-size:13px;">現場管理を準備中...</div>';
      return;
    }

    var genbaList = await getAllGenba();
    console.log('[Dashboard] 現場データ取得:', genbaList.length, '件');

    var active = 0, planned = 0, done = 0;
    var activeList = [];
    for (var i = 0; i < genbaList.length; i++) {
      var g = genbaList[i];
      if (g.status === '進行中') { active++; activeList.push(g); }
      else if (g.status === '予定') planned++;
      else if (g.status === '完了') done++;
    }

    // サマリーカード更新
    if (elActive) elActive.textContent = active;
    if (elPlanned) elPlanned.textContent = planned;
    if (elDone) elDone.textContent = done;

    // 進行中リスト（最大3件）
    if (!listEl) return;
    if (activeList.length === 0) {
      listEl.innerHTML =
        '<div style="background:white; border-radius:10px; padding:20px; text-align:center; color:#9ca3af; font-size:13px;">' +
          (genbaList.length === 0 ? '現場を登録すると、ここに表示されます' : '進行中の現場はありません') +
        '</div>';
      return;
    }
    var html = '';
    var max = Math.min(activeList.length, 3);
    for (var i = 0; i < max; i++) {
      var g = activeList[i];
      var dateStr = '';
      if (g.startDate) {
        var parts = g.startDate.split('-');
        dateStr = parseInt(parts[1]) + '/' + parseInt(parts[2]);
        if (g.endDate) {
          var parts2 = g.endDate.split('-');
          dateStr += ' 〜 ' + parseInt(parts2[1]) + '/' + parseInt(parts2[2]);
        }
      }
      html +=
        '<div onclick="showScreen(\'genba\');" style="background:white; border-radius:10px; padding:12px 14px; margin-bottom:6px; cursor:pointer; display:flex; align-items:center; gap:12px; border-left:4px solid #f59e0b; box-shadow:0 1px 4px rgba(0,0,0,0.06);">' +
          '<div style="font-size:24px;">🔨</div>' +
          '<div style="flex:1; min-width:0;">' +
            '<div style="font-size:14px; font-weight:bold; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + (typeof escapeHtml === 'function' ? escapeHtml(g.name) : g.name) + '</div>' +
            (dateStr ? '<div style="font-size:11px; color:#9ca3af;">📅 ' + dateStr + '</div>' : '') +
          '</div>' +
          '<div style="font-size:20px; color:#d1d5db;">›</div>' +
        '</div>';
    }
    if (activeList.length > 3) {
      html += '<div style="text-align:center; padding:8px; font-size:12px; color:#9ca3af;">他 ' + (activeList.length - 3) + ' 件</div>';
    }
    listEl.innerHTML = html;
  } catch(e) {
    console.error('ダッシュボード更新エラー:', e);
    // エラーでも「読み込み中...」から脱出する
    if (elActive) elActive.textContent = '0';
    if (elPlanned) elPlanned.textContent = '0';
    if (elDone) elDone.textContent = '0';
    if (listEl) listEl.innerHTML =
      '<div style="background:white; border-radius:10px; padding:20px; text-align:center; color:#9ca3af; font-size:13px;">' +
        '現場を登録すると、ここに表示されます' +
      '</div>';
  }
}
window.updateDashboard = updateDashboard;

// ==========================================
// スプラッシュシーケンス
// ★ v0.95: 白画面防止 - body背景黒 + シームレスクロスフェード
// ==========================================
function scheduleSplashSequence() {
  // ★ 白画面防止: スプラッシュ中はbody背景を黒に
  document.body.style.backgroundColor = '#000';
  
  // 1段階目: COCOMI CORE（4秒表示）
  setTimeout(() => {
    const cocomiSplash = document.getElementById('cocomi-splash');
    const perafcaSplash = document.getElementById('perafca-splash');
    const appSplash = document.getElementById('splash-screen');
    
    if (!cocomiSplash) {
      showHomeScreen();
      return;
    }
    
    // ★ perafcaがあれば裏で先に準備（cocomiの下に透明で配置）
    if (perafcaSplash) {
      perafcaSplash.style.display = 'flex';
      perafcaSplash.style.opacity = '0';
      perafcaSplash.style.zIndex = '9998';
      // フェードイン開始（cocomiの下で徐々に見えてくる）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          perafcaSplash.style.transition = 'opacity 0.8s ease';
          perafcaSplash.style.opacity = '1';
        });
      });
    }
    
    // cocomiをフェードアウト（perafcaが下から現れる）
    cocomiSplash.classList.add('fade-out');
    
    setTimeout(() => {
      cocomiSplash.style.display = 'none';
      
      if (perafcaSplash) {
        // perafcaを最前面に
        perafcaSplash.style.zIndex = '10001';
        
        // 2.5秒表示してからフェードアウト
        setTimeout(() => {
          // ★ appSplashを裏で先に準備
          if (appSplash) {
            appSplash.style.opacity = '1';
            appSplash.style.pointerEvents = 'auto';
            appSplash.style.display = 'flex';
          }
          
          perafcaSplash.style.opacity = '0';
          
          setTimeout(() => {
            perafcaSplash.style.display = 'none';
            finishWithAppSplash(appSplash);
          }, 800);
        }, 2500);
        
      } else {
        // perafcaなし → appSplashへ
        finishWithAppSplash(appSplash);
      }
    }, 800);
  }, 4000);
}

// ==========================================
// アプリスプラッシュ → ホーム画面
// ==========================================
function finishWithAppSplash(appSplash) {
  if (appSplash) {
    // appSplashが未表示なら表示
    if (!appSplash.classList.contains('active')) {
      appSplash.classList.add('active');
    }
    
    // 3.5秒表示してからフェードアウト
    setTimeout(() => {
      appSplash.classList.add('fade-out');
      setTimeout(() => {
        appSplash.style.display = 'none';
        showHomeScreen();
      }, 500);
    }, 3500);
  } else {
    showHomeScreen();
  }
}

// ==========================================
// 初期化
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  
  // ★ スプラッシュタイマーを即座に開始
  scheduleSplashSequence();
  
  // ★ 画面HTMLを読み込む
  console.log('画面の読み込みを開始...');
  try {
    await loadAllScreens();
    console.log('✓ 全画面の読み込みが完了しました');
  } catch(e) {
    console.error('画面読み込みエラー:', e);
  }
  
  // v0.96: IndexedDB移行（初回のみ実行）
  try {
    if (typeof migrateImagesToIDB === 'function') {
      const migResult = await migrateImagesToIDB();
      if (!migResult.skipped) {
        console.log('✓ IndexedDB移行結果:', migResult);
      }
    }
  } catch(e) { console.error('IDB migration error:', e); }
  
  // ★ 画面読み込み完了後に各モジュールの初期化
  try {
    if (typeof loadSettings === 'function') loadSettings();
  } catch(e) { console.error('loadSettings error:', e); }
  
  try {
    if (typeof initReceiptScreen === 'function') initReceiptScreen();
  } catch(e) { console.error('initReceiptScreen error:', e); }
  
  try {
    if (typeof loadProductMaster === 'function') loadProductMaster();
  } catch(e) { console.error('loadProductMaster error:', e); }
  
  try {
    if (typeof loadCustomers === 'function') loadCustomers();
  } catch(e) { console.error('loadCustomers error:', e); }
  
  try {
    if (typeof updatePasswordUI === 'function') updatePasswordUI();
  } catch(e) { console.error('updatePasswordUI error:', e); }
  
  // v0.95追加: 自動保存システム初期化
  try {
    if (typeof initAutoSave === 'function') initAutoSave();
  } catch(e) { console.error('initAutoSave error:', e); }

  // v1.0: 初期化完了後にダッシュボードを更新（スプラッシュ中でもデータ準備）
  try {
    await updateDashboard();
  } catch(e) { console.error('updateDashboard error:', e); }

  console.log('✓ アプリ初期化完了 - 現場Pro 設備くん v1.0');
});

// ==========================================
// Androidバックボタン対応
// ==========================================
window.addEventListener('popstate', function(event) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  const homeScreen = document.getElementById('home-screen');
  if (homeScreen) {
    homeScreen.classList.add('active');
  }
  window.scrollTo(0, 0);
  history.pushState({ screen: 'home' }, '', '');
  // ホームに戻った時にダッシュボード更新
  if (typeof updateDashboard === 'function') updateDashboard();
});

history.replaceState({ screen: 'home' }, '', '');
