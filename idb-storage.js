// ==========================================
// IndexedDB ストレージ管理
// 現場Pro 設備くん v1.0
// ==========================================
// Phase 1: 画像データ（レシート画像・ロゴ・印鑑）を
// LocalStorageからIndexedDBに移行するためのモジュール
//
// ★ なぜIndexedDB？
//   LocalStorageは5MB制限 → レシート画像で簡単にパンクする
//   IndexedDBはブラウザ割当量（数百MB〜GB）まで使える
//
// ★ 設計方針：
//   - 画像データだけをIDBに保存（テキストデータはLocalStorageに残す）
//   - レシート履歴は imageData → imageRef（参照キー）に変更
//   - 旧データ自動移行関数（migrateImagesToIDB）を提供
//   - IDB失敗時はLocalStorageにフォールバック
//
// 依存: なし（最初に読み込むこと）
// ==========================================

const IDB_NAME = 'reform_app_idb';
const IDB_VERSION = 12;
const STORE_IMAGES = 'images';
const STORE_GENBA = 'genba';
const STORE_KOUTEI = 'koutei';
const STORE_SHOKUNIN = 'shokunin';
const STORE_SCHEDULE = 'schedule';
const STORE_PHOTO = 'photo';
const STORE_NIPPO = 'nippo';
const STORE_MADORI = 'madori';
const STORE_TALK_ANALYSIS = 'talkAnalysis';
const STORE_KOUTEI_IMPORT = 'kouteiImport';
const STORE_CUSTOM_CATEGORY = 'customCategory'; // v9追加
const STORE_PHOTO_MANAGER = 'photoStore'; // v10追加: Phase6写真管理
const STORE_REPORT = 'reportStore'; // v11追加: Phase7日報・報告書
const STORE_DRAWING = 'drawingStore'; // v12追加: Phase8図面管理
const STORE_DRAWING_PIN = 'drawingPinStore'; // v12追加: Phase8図面ピン

// DB接続（シングルトン）
let _dbPromise = null;

/**
 * IndexedDBへの接続を取得（シングルトン）
 * @returns {Promise<IDBDatabase>}
 */
function getDB() {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise(function(resolve, reject) {
    var req = indexedDB.open(IDB_NAME, IDB_VERSION);

    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      console.log('[IDB] upgrade v' + e.oldVersion + ' → v' + e.newVersion);
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_GENBA)) {
        var gs = db.createObjectStore(STORE_GENBA, { keyPath: 'id' });
        gs.createIndex('status', 'status', { unique: false });
        gs.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_KOUTEI)) {
        var ks = db.createObjectStore(STORE_KOUTEI, { keyPath: 'id' });
        ks.createIndex('genbaId', 'genbaId', { unique: false });
      }
      // v3: 職人ストア
      if (!db.objectStoreNames.contains(STORE_SHOKUNIN)) {
        var ss = db.createObjectStore(STORE_SHOKUNIN, { keyPath: 'id' });
        ss.createIndex('shokuType', 'shokuType', { unique: false });
        ss.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      // v3: スケジュールストア
      if (!db.objectStoreNames.contains(STORE_SCHEDULE)) {
        var sc = db.createObjectStore(STORE_SCHEDULE, { keyPath: 'id' });
        sc.createIndex('date', 'date', { unique: false });
        sc.createIndex('genbaId', 'genbaId', { unique: false });
        sc.createIndex('shokuninId', 'shokuninId', { unique: false });
      }
      // v4: 写真ストア
      if (!db.objectStoreNames.contains(STORE_PHOTO)) {
        var ps = db.createObjectStore(STORE_PHOTO, { keyPath: 'id' });
        ps.createIndex('genbaId', 'genbaId', { unique: false });
        ps.createIndex('kouteiId', 'kouteiId', { unique: false });
        ps.createIndex('date', 'date', { unique: false });
      }
      // v4: 日報ストア
      if (!db.objectStoreNames.contains(STORE_NIPPO)) {
        var ns = db.createObjectStore(STORE_NIPPO, { keyPath: 'id' });
        ns.createIndex('genbaId', 'genbaId', { unique: false });
        ns.createIndex('date', 'date', { unique: false });
      }
      // v5: 間取りストア
      if (!db.objectStoreNames.contains(STORE_MADORI)) {
        var ms = db.createObjectStore(STORE_MADORI, { keyPath: 'id' });
        ms.createIndex('genbaId', 'genbaId', { unique: false });
        ms.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      // v6: トーク解析ストア
      if (!db.objectStoreNames.contains(STORE_TALK_ANALYSIS)) {
        var ts = db.createObjectStore(STORE_TALK_ANALYSIS, { keyPath: 'id', autoIncrement: true });
        ts.createIndex('genbaId', 'genbaId', { unique: false });
        ts.createIndex('analyzedAt', 'analyzedAt', { unique: false });
      }
      // v7: 工程表取込ストア
      if (!db.objectStoreNames.contains(STORE_KOUTEI_IMPORT)) {
        var ki = db.createObjectStore(STORE_KOUTEI_IMPORT, { keyPath: 'id', autoIncrement: true });
        ki.createIndex('genbaId', 'genbaId', { unique: false });
        ki.createIndex('importedAt', 'importedAt', { unique: false });
      }
      // v8: scheduleストアにsourceインデックス追加
      if (db.objectStoreNames.contains(STORE_SCHEDULE)) {
        var schStore = e.target.transaction.objectStore(STORE_SCHEDULE);
        if (!schStore.indexNames.contains('source')) {
          schStore.createIndex('source', 'source', { unique: false });
        }
      }
      // v9: ユーザー追加工種ストア
      if (!db.objectStoreNames.contains(STORE_CUSTOM_CATEGORY)) {
        var ccStore = db.createObjectStore(STORE_CUSTOM_CATEGORY, { keyPath: 'id', autoIncrement: true });
        ccStore.createIndex('name', 'name', { unique: true });
      }
      // v10: Phase6写真管理ストア
      if (!db.objectStoreNames.contains(STORE_PHOTO_MANAGER)) {
        var pmStore = db.createObjectStore(STORE_PHOTO_MANAGER, { keyPath: 'id', autoIncrement: true });
        pmStore.createIndex('genbaId', 'genbaId', { unique: false });
        pmStore.createIndex('category', 'category', { unique: false });
        pmStore.createIndex('takenDate', 'takenDate', { unique: false });
        pmStore.createIndex('genbaId_category', ['genbaId', 'category'], { unique: false });
      }
      // v11: Phase7日報・報告書ストア
      if (!db.objectStoreNames.contains(STORE_REPORT)) {
        var rpStore = db.createObjectStore(STORE_REPORT, { keyPath: 'id', autoIncrement: true });
        rpStore.createIndex('type', 'type', { unique: false });
        rpStore.createIndex('status', 'status', { unique: false });
        rpStore.createIndex('date', 'date', { unique: false });
      }
      // v12: Phase8図面管理ストア
      if (!db.objectStoreNames.contains(STORE_DRAWING)) {
        var dwStore = db.createObjectStore(STORE_DRAWING, { keyPath: 'id' });
        dwStore.createIndex('genbaId', 'genbaId', { unique: false });
        dwStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      // v12: Phase8図面ピンストア
      if (!db.objectStoreNames.contains(STORE_DRAWING_PIN)) {
        var dpStore = db.createObjectStore(STORE_DRAWING_PIN, { keyPath: 'id' });
        dpStore.createIndex('drawingId', 'drawingId', { unique: false });
        dpStore.createIndex('status', 'status', { unique: false });
      }
    };

    req.onblocked = function() {
      console.warn('[IDB] blocked');
    };

    req.onsuccess = function() {
      var db = req.result;
      console.log('[IDB] open OK v' + db.version);
      db.onversionchange = function() { db.close(); _dbPromise = null; };
      resolve(db);
    };

    req.onerror = function() {
      console.error('[IDB] open FAIL:', req.error);
      _dbPromise = null;
      reject(req.error);
    };
  });

  return _dbPromise;
}

// DB接続リセット（エラー回復用）
function resetDB() {
  _dbPromise = null;
}

// DB接続テスト（デバッグ用）
async function testDB() {
  try {
    console.log('[IDB] testDB開始...');
    var db = await getDB();
    console.log('[IDB] testDB: DB取得OK, version=' + db.version);
    console.log('[IDB] testDB: stores=', Array.from(db.objectStoreNames));
    var hasGenba = db.objectStoreNames.contains(STORE_GENBA);
    var hasKoutei = db.objectStoreNames.contains(STORE_KOUTEI);
    console.log('[IDB] testDB: genba=' + hasGenba + ', koutei=' + hasKoutei);
    return { ok: true, version: db.version, hasGenba: hasGenba, hasKoutei: hasKoutei };
  } catch(e) {
    console.error('[IDB] testDB失敗:', e);
    return { ok: false, error: e.message };
  }
}

// ==========================================
// 基本CRUD操作
// ==========================================

/**
 * 画像をIndexedDBに保存
 * @param {string} key - 一意のキー
 * @param {string} dataUrl - base64 data URL
 * @returns {Promise<string>} 保存したキー
 */
async function saveImageToIDB(key, dataUrl) {
  if (!dataUrl) return null;
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_IMAGES, 'readwrite');
      tx.objectStore(STORE_IMAGES).put({ key: key, data: dataUrl });
      tx.oncomplete = function() { resolve(key); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] saveImageToIDB失敗:', key, e);
    return null;
  }
}

/**
 * IndexedDBから画像を取得
 * @param {string} key - キー
 * @returns {Promise<string|null>} data URL or null
 */
async function getImageFromIDB(key) {
  if (!key) return null;
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_IMAGES, 'readonly');
      var req = tx.objectStore(STORE_IMAGES).get(key);
      req.onsuccess = function() {
        resolve(req.result ? req.result.data : null);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getImageFromIDB失敗:', key, e);
    return null;
  }
}

/**
 * IndexedDBから画像を削除
 * @param {string} key - キー
 */
async function deleteImageFromIDB(key) {
  if (!key) return;
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_IMAGES, 'readwrite');
      tx.objectStore(STORE_IMAGES).delete(key);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] deleteImageFromIDB失敗:', key, e);
  }
}

/**
 * 全画像キー一覧を取得
 * @returns {Promise<string[]>}
 */
async function getAllImageKeys() {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_IMAGES, 'readonly');
      var req = tx.objectStore(STORE_IMAGES).getAllKeys();
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getAllImageKeys失敗:', e);
    return [];
  }
}


// ==========================================
// ロゴ・印鑑の便利関数
// ==========================================

async function saveLogoToIDB(dataUrl) {
  return saveImageToIDB('app_logo', dataUrl);
}

/**
 * ロゴを取得（IDB優先 → LocalStorageフォールバック）
 */
async function getLogoFromIDB() {
  var idbData = await getImageFromIDB('app_logo');
  if (idbData) return idbData;
  // フォールバック: 旧LocalStorageデータ
  return localStorage.getItem('reform_app_logo');
}

async function deleteLogoFromIDB() {
  await deleteImageFromIDB('app_logo');
  localStorage.removeItem('reform_app_logo'); // 旧データも消す
}

async function saveStampToIDB(processedDataUrl, originalDataUrl) {
  await saveImageToIDB('app_stamp', processedDataUrl);
  if (originalDataUrl) {
    await saveImageToIDB('app_stamp_original', originalDataUrl);
  }
}

/**
 * 印鑑（処理済み）を取得（IDB優先 → LocalStorageフォールバック）
 */
async function getStampFromIDB() {
  var idbData = await getImageFromIDB('app_stamp');
  if (idbData) return idbData;
  return localStorage.getItem('reform_app_stamp');
}

/**
 * 印鑑（原本）を取得（IDB優先 → LocalStorageフォールバック）
 */
async function getStampOriginalFromIDB() {
  var idbData = await getImageFromIDB('app_stamp_original');
  if (idbData) return idbData;
  return localStorage.getItem('reform_app_stamp_original');
}

async function deleteStampFromIDB() {
  await deleteImageFromIDB('app_stamp');
  await deleteImageFromIDB('app_stamp_original');
  localStorage.removeItem('reform_app_stamp');
  localStorage.removeItem('reform_app_stamp_original');
}


// ==========================================
// レシート画像の便利関数
// ==========================================

function makeReceiptImageKey(receiptId) {
  return 'receipt_img_' + receiptId;
}

async function saveReceiptImageToIDB(receiptId, dataUrl) {
  var key = makeReceiptImageKey(receiptId);
  return saveImageToIDB(key, dataUrl);
}

async function getReceiptImageFromIDB(receiptId) {
  var key = makeReceiptImageKey(receiptId);
  return getImageFromIDB(key);
}

async function deleteReceiptImageFromIDB(receiptId) {
  var key = makeReceiptImageKey(receiptId);
  return deleteImageFromIDB(key);
}


// ==========================================
// IDB使用量の概算
// ==========================================

async function getIDBStorageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      var est = await navigator.storage.estimate();
      return {
        usage: est.usage || 0,
        quota: est.quota || 0,
        usageMB: ((est.usage || 0) / 1024 / 1024).toFixed(1),
        quotaMB: ((est.quota || 0) / 1024 / 1024).toFixed(0)
      };
    } catch (e) {
      return null;
    }
  }
  return null;
}


// ==========================================
// 移行ユーティリティ（初回起動時に1回だけ実行）
// ==========================================

/**
 * LocalStorageの画像データをIndexedDBに移行する
 * 移行済みの場合はスキップ
 * @returns {Promise<object>} 移行結果
 */
async function migrateImagesToIDB() {
  var MIGRATION_KEY = 'reform_app_idb_migration_v1';
  if (localStorage.getItem(MIGRATION_KEY) === 'done') {
    console.log('[IDB] 移行済みのためスキップ');
    return { skipped: true };
  }
  
  console.log('[IDB] ========== 画像データ移行開始 ==========');
  var migrated = { logo: false, stamp: false, stampOriginal: false, receiptImages: 0, errors: 0 };
  
  try {
    // テスト: IDBが使えるか確認
    await getDB();
  } catch (e) {
    console.error('[IDB] IndexedDBが使用できません。移行をスキップします:', e);
    return { skipped: true, error: 'IDB unavailable' };
  }
  
  try {
    // 1. ロゴ
    var logo = localStorage.getItem('reform_app_logo');
    if (logo) {
      await saveImageToIDB('app_logo', logo);
      localStorage.removeItem('reform_app_logo');
      migrated.logo = true;
      console.log('[IDB] ✓ ロゴを移行しました (' + Math.round(logo.length / 1024) + 'KB)');
    }
    
    // 2. 印鑑（処理済み）
    var stamp = localStorage.getItem('reform_app_stamp');
    if (stamp) {
      await saveImageToIDB('app_stamp', stamp);
      localStorage.removeItem('reform_app_stamp');
      migrated.stamp = true;
      console.log('[IDB] ✓ 印鑑(処理済)を移行しました (' + Math.round(stamp.length / 1024) + 'KB)');
    }
    
    // 3. 印鑑（オリジナル）
    var stampOrig = localStorage.getItem('reform_app_stamp_original');
    if (stampOrig) {
      await saveImageToIDB('app_stamp_original', stampOrig);
      localStorage.removeItem('reform_app_stamp_original');
      migrated.stampOriginal = true;
      console.log('[IDB] ✓ 印鑑(原本)を移行しました (' + Math.round(stampOrig.length / 1024) + 'KB)');
    }
    
    // 4. レシート履歴の画像 → imageRef方式に変換
    var historyRaw = localStorage.getItem('reform_app_receipt_history');
    if (historyRaw) {
      var histories = JSON.parse(historyRaw);
      var changed = false;
      
      for (var i = 0; i < histories.length; i++) {
        var h = histories[i];
        if (h.imageData) {
          try {
            var key = makeReceiptImageKey(h.id);
            await saveImageToIDB(key, h.imageData);
            h.imageRef = key;
            delete h.imageData;
            migrated.receiptImages++;
            changed = true;
          } catch (imgErr) {
            console.warn('[IDB] レシート画像移行失敗 (id=' + h.id + '):', imgErr);
            migrated.errors++;
            // この画像は移行失敗だが、他は続行
          }
        }
      }
      
      if (changed) {
        localStorage.setItem('reform_app_receipt_history', JSON.stringify(histories));
        console.log('[IDB] ✓ レシート画像 ' + migrated.receiptImages + '件を移行しました');
      }
    }
    
    // 移行完了フラグ
    localStorage.setItem(MIGRATION_KEY, 'done');
    console.log('[IDB] ========== 移行完了 ==========', migrated);
    
  } catch (e) {
    console.error('[IDB] 移行中にエラー:', e);
    migrated.errors++;
    // エラーでもフラグは立てない → 次回リトライ
  }
  
  return migrated;
}


// ==========================================
// 現場（genba）CRUD
// ==========================================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

async function saveGenba(genba, _retry) {
  if (!genba.id) genba.id = generateId();
  var now = new Date().toISOString();
  if (!genba.createdAt) genba.createdAt = now;
  genba.updatedAt = now;
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_GENBA, 'readwrite');
      tx.objectStore(STORE_GENBA).put(genba);
      tx.oncomplete = function() {
        console.log('[IDB] saveGenba成功:', genba.id);
        resolve(genba);
      };
      tx.onerror = function() {
        console.error('[IDB] saveGenba tx error:', tx.error);
        reject(tx.error);
      };
    });
  } catch (e) {
    console.error('[IDB] saveGenba失敗:', e);
    // 1回だけリトライ（DB接続リセット後）
    if (!_retry) {
      console.log('[IDB] saveGenba リトライします');
      _dbPromise = null;
      return saveGenba(genba, true);
    }
    return null;
  }
}

async function getGenba(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_GENBA, 'readonly');
      var req = tx.objectStore(STORE_GENBA).get(id);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getGenba失敗:', e);
    if (!_retry) {
      _dbPromise = null;
      return getGenba(id, true);
    }
    return null;
  }
}

async function getAllGenba(_retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_GENBA, 'readonly');
      var req = tx.objectStore(STORE_GENBA).getAll();
      req.onsuccess = function() {
        var results = req.result || [];
        results.sort(function(a, b) {
          return (b.updatedAt || '').localeCompare(a.updatedAt || '');
        });
        resolve(results);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getAllGenba失敗:', e);
    if (!_retry) {
      console.log('[IDB] getAllGenba リトライします');
      _dbPromise = null;
      return getAllGenba(true);
    }
    return [];
  }
}

async function deleteGenba(id, _retry) {
  try {
    // 現場に紐づく工程も削除
    var kouteiList = await getKouteiByGenba(id);
    for (var i = 0; i < kouteiList.length; i++) {
      await deleteKoutei(kouteiList[i].id);
    }
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_GENBA, 'readwrite');
      tx.objectStore(STORE_GENBA).delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] deleteGenba失敗:', e);
    if (!_retry) {
      _dbPromise = null;
      return deleteGenba(id, true);
    }
  }
}

// ==========================================
// 工程（koutei）CRUD
// ==========================================

async function saveKoutei(koutei, _retry) {
  if (!koutei.id) koutei.id = generateId();
  var now = new Date().toISOString();
  if (!koutei.createdAt) koutei.createdAt = now;
  koutei.updatedAt = now;
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_KOUTEI, 'readwrite');
      tx.objectStore(STORE_KOUTEI).put(koutei);
      tx.oncomplete = function() { resolve(koutei); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] saveKoutei失敗:', e);
    if (!_retry) { _dbPromise = null; return saveKoutei(koutei, true); }
    return null;
  }
}

async function getKoutei(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_KOUTEI, 'readonly');
      var req = tx.objectStore(STORE_KOUTEI).get(id);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getKoutei失敗:', e);
    if (!_retry) { _dbPromise = null; return getKoutei(id, true); }
    return null;
  }
}

async function getKouteiByGenba(genbaId, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_KOUTEI, 'readonly');
      var idx = tx.objectStore(STORE_KOUTEI).index('genbaId');
      var req = idx.getAll(genbaId);
      req.onsuccess = function() {
        var results = req.result || [];
        results.sort(function(a, b) {
          return (a.startDate || '').localeCompare(b.startDate || '');
        });
        resolve(results);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getKouteiByGenba失敗:', e);
    if (!_retry) { _dbPromise = null; return getKouteiByGenba(genbaId, true); }
    return [];
  }
}

async function deleteKoutei(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_KOUTEI, 'readwrite');
      tx.objectStore(STORE_KOUTEI).delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] deleteKoutei失敗:', e);
    if (!_retry) { _dbPromise = null; return deleteKoutei(id, true); }
  }
}

// ==========================================
// 職人（shokunin）CRUD
// ==========================================

async function saveShokunin(s, _retry) {
  if (!s.id) s.id = generateId();
  var now = new Date().toISOString();
  if (!s.createdAt) s.createdAt = now;
  s.updatedAt = now;
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_SHOKUNIN, 'readwrite');
      tx.objectStore(STORE_SHOKUNIN).put(s);
      tx.oncomplete = function() {
        console.log('[IDB] saveShokunin成功:', s.id);
        resolve(s);
      };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] saveShokunin失敗:', e);
    if (!_retry) { _dbPromise = null; return saveShokunin(s, true); }
    return null;
  }
}

async function getShokunin(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_SHOKUNIN, 'readonly');
      var req = tx.objectStore(STORE_SHOKUNIN).get(id);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getShokunin失敗:', e);
    if (!_retry) { _dbPromise = null; return getShokunin(id, true); }
    return null;
  }
}

async function getAllShokunin(_retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_SHOKUNIN, 'readonly');
      var req = tx.objectStore(STORE_SHOKUNIN).getAll();
      req.onsuccess = function() {
        var results = req.result || [];
        results.sort(function(a, b) {
          return (a.name || '').localeCompare(b.name || '', 'ja');
        });
        resolve(results);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getAllShokunin失敗:', e);
    if (!_retry) { _dbPromise = null; return getAllShokunin(true); }
    return [];
  }
}

async function deleteShokunin(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_SHOKUNIN, 'readwrite');
      tx.objectStore(STORE_SHOKUNIN).delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] deleteShokunin失敗:', e);
    if (!_retry) { _dbPromise = null; return deleteShokunin(id, true); }
  }
}

// ==========================================
// スケジュール（schedule）CRUD
// ==========================================

async function saveSchedule(s, _retry) {
  if (!s.id) s.id = generateId();
  var now = new Date().toISOString();
  if (!s.createdAt) s.createdAt = now;
  s.updatedAt = now;
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_SCHEDULE, 'readwrite');
      tx.objectStore(STORE_SCHEDULE).put(s);
      tx.oncomplete = function() {
        console.log('[IDB] saveSchedule成功:', s.id);
        resolve(s);
      };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] saveSchedule失敗:', e);
    if (!_retry) { _dbPromise = null; return saveSchedule(s, true); }
    return null;
  }
}

async function getSchedule(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_SCHEDULE, 'readonly');
      var req = tx.objectStore(STORE_SCHEDULE).get(id);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getSchedule失敗:', e);
    if (!_retry) { _dbPromise = null; return getSchedule(id, true); }
    return null;
  }
}

async function getScheduleByDate(date, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_SCHEDULE, 'readonly');
      var idx = tx.objectStore(STORE_SCHEDULE).index('date');
      var req = idx.getAll(date);
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getScheduleByDate失敗:', e);
    if (!_retry) { _dbPromise = null; return getScheduleByDate(date, true); }
    return [];
  }
}

async function getScheduleByMonth(yearMonth, _retry) {
  // yearMonth = "2026-02" のような形式
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_SCHEDULE, 'readonly');
      var idx = tx.objectStore(STORE_SCHEDULE).index('date');
      var range = IDBKeyRange.bound(yearMonth + '-01', yearMonth + '-31');
      var req = idx.getAll(range);
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getScheduleByMonth失敗:', e);
    if (!_retry) { _dbPromise = null; return getScheduleByMonth(yearMonth, true); }
    return [];
  }
}

async function getScheduleByGenba(genbaId, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_SCHEDULE, 'readonly');
      var idx = tx.objectStore(STORE_SCHEDULE).index('genbaId');
      var req = idx.getAll(genbaId);
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getScheduleByGenba失敗:', e);
    if (!_retry) { _dbPromise = null; return getScheduleByGenba(genbaId, true); }
    return [];
  }
}

async function getScheduleByShokunin(shokuninId, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_SCHEDULE, 'readonly');
      var idx = tx.objectStore(STORE_SCHEDULE).index('shokuninId');
      var req = idx.getAll(shokuninId);
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getScheduleByShokunin失敗:', e);
    if (!_retry) { _dbPromise = null; return getScheduleByShokunin(shokuninId, true); }
    return [];
  }
}

// v8追加: 月表示用 - endDateを含む全スケジュール取得
async function getScheduleForMonthView(yearMonth, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_SCHEDULE, 'readonly');
      var req = tx.objectStore(STORE_SCHEDULE).getAll();
      req.onsuccess = function() {
        var all = req.result || [];
        var monthStart = yearMonth + '-01';
        var monthEnd = yearMonth + '-31';
        var filtered = all.filter(function(s) {
          var start = s.date || '';
          var end = s.endDate || s.date || '';
          // 期間がこの月と重なるかチェック
          return start <= monthEnd && end >= monthStart;
        });
        filtered.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
        resolve(filtered);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getScheduleForMonthView失敗:', e);
    if (!_retry) { _dbPromise = null; return getScheduleForMonthView(yearMonth, true); }
    return [];
  }
}

async function deleteSchedule(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_SCHEDULE, 'readwrite');
      tx.objectStore(STORE_SCHEDULE).delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] deleteSchedule失敗:', e);
    if (!_retry) { _dbPromise = null; return deleteSchedule(id, true); }
  }
}

// ==========================================
// 写真（photo）CRUD
// ==========================================

async function savePhoto(photo, _retry) {
  if (!photo.id) photo.id = generateId();
  var now = new Date().toISOString();
  if (!photo.createdAt) photo.createdAt = now;
  photo.updatedAt = now;
  if (!photo.date) photo.date = now.split('T')[0];
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_PHOTO, 'readwrite');
      tx.objectStore(STORE_PHOTO).put(photo);
      tx.oncomplete = function() { resolve(photo); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] savePhoto失敗:', e);
    if (!_retry) { _dbPromise = null; return savePhoto(photo, true); }
    return null;
  }
}

async function getPhoto(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_PHOTO, 'readonly');
      var req = tx.objectStore(STORE_PHOTO).get(id);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getPhoto失敗:', e);
    if (!_retry) { _dbPromise = null; return getPhoto(id, true); }
    return null;
  }
}

async function getAllPhotos(_retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_PHOTO, 'readonly');
      var req = tx.objectStore(STORE_PHOTO).getAll();
      req.onsuccess = function() {
        var results = req.result || [];
        results.sort(function(a, b) {
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
        resolve(results);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getAllPhotos失敗:', e);
    if (!_retry) { _dbPromise = null; return getAllPhotos(true); }
    return [];
  }
}

async function getPhotosByGenba(genbaId, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_PHOTO, 'readonly');
      var idx = tx.objectStore(STORE_PHOTO).index('genbaId');
      var req = idx.getAll(genbaId);
      req.onsuccess = function() {
        var results = req.result || [];
        results.sort(function(a, b) {
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
        resolve(results);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getPhotosByGenba失敗:', e);
    if (!_retry) { _dbPromise = null; return getPhotosByGenba(genbaId, true); }
    return [];
  }
}

async function getPhotosByKoutei(kouteiId, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_PHOTO, 'readonly');
      var idx = tx.objectStore(STORE_PHOTO).index('kouteiId');
      var req = idx.getAll(kouteiId);
      req.onsuccess = function() {
        var results = req.result || [];
        results.sort(function(a, b) {
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        });
        resolve(results);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getPhotosByKoutei失敗:', e);
    if (!_retry) { _dbPromise = null; return getPhotosByKoutei(kouteiId, true); }
    return [];
  }
}

async function getPhotosByDate(date, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_PHOTO, 'readonly');
      var idx = tx.objectStore(STORE_PHOTO).index('date');
      var req = idx.getAll(date);
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getPhotosByDate失敗:', e);
    if (!_retry) { _dbPromise = null; return getPhotosByDate(date, true); }
    return [];
  }
}

async function deletePhoto(id, _retry) {
  try {
    // 写真画像も削除
    await deleteImageFromIDB('photo_' + id);
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_PHOTO, 'readwrite');
      tx.objectStore(STORE_PHOTO).delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] deletePhoto失敗:', e);
    if (!_retry) { _dbPromise = null; return deletePhoto(id, true); }
  }
}

// ==========================================
// 日報（nippo）CRUD
// ==========================================

async function saveNippo(nippo, _retry) {
  if (!nippo.id) nippo.id = generateId();
  var now = new Date().toISOString();
  if (!nippo.createdAt) nippo.createdAt = now;
  nippo.updatedAt = now;
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NIPPO, 'readwrite');
      tx.objectStore(STORE_NIPPO).put(nippo);
      tx.oncomplete = function() { resolve(nippo); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] saveNippo失敗:', e);
    if (!_retry) { _dbPromise = null; return saveNippo(nippo, true); }
    return null;
  }
}

async function getNippo(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NIPPO, 'readonly');
      var req = tx.objectStore(STORE_NIPPO).get(id);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getNippo失敗:', e);
    if (!_retry) { _dbPromise = null; return getNippo(id, true); }
    return null;
  }
}

async function getAllNippo(_retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NIPPO, 'readonly');
      var req = tx.objectStore(STORE_NIPPO).getAll();
      req.onsuccess = function() {
        var results = req.result || [];
        results.sort(function(a, b) {
          return (b.date || '').localeCompare(a.date || '');
        });
        resolve(results);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getAllNippo失敗:', e);
    if (!_retry) { _dbPromise = null; return getAllNippo(true); }
    return [];
  }
}

async function getNippoByGenba(genbaId, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NIPPO, 'readonly');
      var idx = tx.objectStore(STORE_NIPPO).index('genbaId');
      var req = idx.getAll(genbaId);
      req.onsuccess = function() {
        var results = req.result || [];
        results.sort(function(a, b) {
          return (b.date || '').localeCompare(a.date || '');
        });
        resolve(results);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getNippoByGenba失敗:', e);
    if (!_retry) { _dbPromise = null; return getNippoByGenba(genbaId, true); }
    return [];
  }
}

async function getNippoByDate(date, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NIPPO, 'readonly');
      var idx = tx.objectStore(STORE_NIPPO).index('date');
      var req = idx.getAll(date);
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getNippoByDate失敗:', e);
    if (!_retry) { _dbPromise = null; return getNippoByDate(date, true); }
    return [];
  }
}

async function deleteNippo(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NIPPO, 'readwrite');
      tx.objectStore(STORE_NIPPO).delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] deleteNippo失敗:', e);
    if (!_retry) { _dbPromise = null; return deleteNippo(id, true); }
  }
}

// ==========================================
// 間取り（madori）CRUD
// ==========================================

async function saveMadoriRecord(m, _retry) {
  if (!m.id) m.id = generateId();
  var now = new Date().toISOString();
  if (!m.createdAt) m.createdAt = now;
  m.updatedAt = now;
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_MADORI, 'readwrite');
      tx.objectStore(STORE_MADORI).put(m);
      tx.oncomplete = function() { resolve(m); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] saveMadoriRecord失敗:', e);
    if (!_retry) { _dbPromise = null; return saveMadoriRecord(m, true); }
    return null;
  }
}

async function getMadoriRecord(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_MADORI, 'readonly');
      var req = tx.objectStore(STORE_MADORI).get(id);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getMadoriRecord失敗:', e);
    if (!_retry) { _dbPromise = null; return getMadoriRecord(id, true); }
    return null;
  }
}

async function getAllMadoriRecords(_retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_MADORI, 'readonly');
      var req = tx.objectStore(STORE_MADORI).getAll();
      req.onsuccess = function() {
        var results = req.result || [];
        results.sort(function(a, b) {
          return (b.updatedAt || '').localeCompare(a.updatedAt || '');
        });
        resolve(results);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getAllMadoriRecords失敗:', e);
    if (!_retry) { _dbPromise = null; return getAllMadoriRecords(true); }
    return [];
  }
}

async function getMadoriByGenba(genbaId, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_MADORI, 'readonly');
      var idx = tx.objectStore(STORE_MADORI).index('genbaId');
      var req = idx.getAll(genbaId);
      req.onsuccess = function() {
        var results = req.result || [];
        results.sort(function(a, b) {
          return (b.updatedAt || '').localeCompare(a.updatedAt || '');
        });
        resolve(results);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getMadoriByGenba失敗:', e);
    if (!_retry) { _dbPromise = null; return getMadoriByGenba(genbaId, true); }
    return [];
  }
}

async function deleteMadoriRecord(id, _retry) {
  try {
    // サムネイルも削除
    await deleteImageFromIDB('madori_thumb_' + id);
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_MADORI, 'readwrite');
      tx.objectStore(STORE_MADORI).delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] deleteMadoriRecord失敗:', e);
    if (!_retry) { _dbPromise = null; return deleteMadoriRecord(id, true); }
  }
}

// ==========================================
// トーク解析（talkAnalysis）CRUD
// ==========================================

async function saveTalkAnalysis(record, _retry) {
  var now = new Date().toISOString();
  if (!record.analyzedAt) record.analyzedAt = now;
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_TALK_ANALYSIS, 'readwrite');
      tx.objectStore(STORE_TALK_ANALYSIS).put(record);
      tx.oncomplete = function() { resolve(record); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] saveTalkAnalysis失敗:', e);
    if (!_retry) { _dbPromise = null; return saveTalkAnalysis(record, true); }
    return null;
  }
}

async function getTalkAnalysis(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_TALK_ANALYSIS, 'readonly');
      var req = tx.objectStore(STORE_TALK_ANALYSIS).get(id);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getTalkAnalysis失敗:', e);
    if (!_retry) { _dbPromise = null; return getTalkAnalysis(id, true); }
    return null;
  }
}

async function getAllTalkAnalysis(_retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_TALK_ANALYSIS, 'readonly');
      var req = tx.objectStore(STORE_TALK_ANALYSIS).getAll();
      req.onsuccess = function() {
        var results = req.result || [];
        results.sort(function(a, b) {
          return (b.analyzedAt || '').localeCompare(a.analyzedAt || '');
        });
        resolve(results);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getAllTalkAnalysis失敗:', e);
    if (!_retry) { _dbPromise = null; return getAllTalkAnalysis(true); }
    return [];
  }
}

async function deleteTalkAnalysis(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_TALK_ANALYSIS, 'readwrite');
      tx.objectStore(STORE_TALK_ANALYSIS).delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] deleteTalkAnalysis失敗:', e);
    if (!_retry) { _dbPromise = null; return deleteTalkAnalysis(id, true); }
  }
}

// ==========================================
// 工程表取込（kouteiImport）CRUD
// ==========================================

async function saveKouteiImport(record, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_KOUTEI_IMPORT, 'readwrite');
      tx.objectStore(STORE_KOUTEI_IMPORT).put(record);
      tx.oncomplete = function() { resolve(record); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] saveKouteiImport失敗:', e);
    if (!_retry) { _dbPromise = null; return saveKouteiImport(record, true); }
    return null;
  }
}

async function getKouteiImport(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_KOUTEI_IMPORT, 'readonly');
      var req = tx.objectStore(STORE_KOUTEI_IMPORT).get(id);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getKouteiImport失敗:', e);
    if (!_retry) { _dbPromise = null; return getKouteiImport(id, true); }
    return null;
  }
}

async function getAllKouteiImport(_retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_KOUTEI_IMPORT, 'readonly');
      var req = tx.objectStore(STORE_KOUTEI_IMPORT).getAll();
      req.onsuccess = function() {
        var results = req.result || [];
        results.sort(function(a, b) {
          return (b.importedAt || '').localeCompare(a.importedAt || '');
        });
        resolve(results);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getAllKouteiImport失敗:', e);
    if (!_retry) { _dbPromise = null; return getAllKouteiImport(true); }
    return [];
  }
}

async function deleteKouteiImport(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_KOUTEI_IMPORT, 'readwrite');
      tx.objectStore(STORE_KOUTEI_IMPORT).delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] deleteKouteiImport失敗:', e);
    if (!_retry) { _dbPromise = null; return deleteKouteiImport(id, true); }
  }
}

// ==========================================
// グローバル公開
// ==========================================
window.getDB = getDB;
window.resetDB = resetDB;
window.testDB = testDB;
window.saveImageToIDB = saveImageToIDB;
window.getImageFromIDB = getImageFromIDB;
window.deleteImageFromIDB = deleteImageFromIDB;
window.getAllImageKeys = getAllImageKeys;

window.saveLogoToIDB = saveLogoToIDB;
window.getLogoFromIDB = getLogoFromIDB;
window.deleteLogoFromIDB = deleteLogoFromIDB;

window.saveStampToIDB = saveStampToIDB;
window.getStampFromIDB = getStampFromIDB;
window.getStampOriginalFromIDB = getStampOriginalFromIDB;
window.deleteStampFromIDB = deleteStampFromIDB;

window.makeReceiptImageKey = makeReceiptImageKey;
window.saveReceiptImageToIDB = saveReceiptImageToIDB;
window.getReceiptImageFromIDB = getReceiptImageFromIDB;
window.deleteReceiptImageFromIDB = deleteReceiptImageFromIDB;

window.getIDBStorageEstimate = getIDBStorageEstimate;
window.migrateImagesToIDB = migrateImagesToIDB;

// 現場・工程
window.generateId = generateId;
window.saveGenba = saveGenba;
window.getGenba = getGenba;
window.getAllGenba = getAllGenba;
window.deleteGenba = deleteGenba;
window.saveKoutei = saveKoutei;
window.getKoutei = getKoutei;
window.getKouteiByGenba = getKouteiByGenba;
window.deleteKoutei = deleteKoutei;

// 職人
window.saveShokunin = saveShokunin;
window.getShokunin = getShokunin;
window.getAllShokunin = getAllShokunin;
window.deleteShokunin = deleteShokunin;

// スケジュール
window.saveSchedule = saveSchedule;
window.getSchedule = getSchedule;
window.getScheduleByDate = getScheduleByDate;
window.getScheduleByMonth = getScheduleByMonth;
window.getScheduleByGenba = getScheduleByGenba;
window.getScheduleByShokunin = getScheduleByShokunin;
window.deleteSchedule = deleteSchedule;
window.getScheduleForMonthView = getScheduleForMonthView;

// 写真
window.savePhoto = savePhoto;
window.getPhoto = getPhoto;
window.getAllPhotos = getAllPhotos;
window.getPhotosByGenba = getPhotosByGenba;
window.getPhotosByKoutei = getPhotosByKoutei;
window.getPhotosByDate = getPhotosByDate;
window.deletePhoto = deletePhoto;

// 日報
window.saveNippo = saveNippo;
window.getNippo = getNippo;
window.getAllNippo = getAllNippo;
window.getNippoByGenba = getNippoByGenba;
window.getNippoByDate = getNippoByDate;
window.deleteNippo = deleteNippo;

// 間取り
window.saveMadoriRecord = saveMadoriRecord;
window.getMadoriRecord = getMadoriRecord;
window.getAllMadoriRecords = getAllMadoriRecords;
window.getMadoriByGenba = getMadoriByGenba;
window.deleteMadoriRecord = deleteMadoriRecord;

// トーク解析
window.saveTalkAnalysis = saveTalkAnalysis;
window.getTalkAnalysis = getTalkAnalysis;
window.getAllTalkAnalysis = getAllTalkAnalysis;
window.deleteTalkAnalysis = deleteTalkAnalysis;

// 工程表取込
window.saveKouteiImport = saveKouteiImport;
window.getKouteiImport = getKouteiImport;
window.getAllKouteiImport = getAllKouteiImport;
window.deleteKouteiImport = deleteKouteiImport;

// ==========================================
// v9追加: ユーザー追加工種（customCategory）CRUD
// ==========================================

async function saveCustomCategory(record, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_CUSTOM_CATEGORY, 'readwrite');
      tx.objectStore(STORE_CUSTOM_CATEGORY).put(record);
      tx.oncomplete = function() {
        console.log('[IDB] saveCustomCategory成功:', record.name);
        resolve(record);
      };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] saveCustomCategory失敗:', e);
    if (!_retry) { _dbPromise = null; return saveCustomCategory(record, true); }
    return null;
  }
}

async function getAllCustomCategory(_retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_CUSTOM_CATEGORY, 'readonly');
      var req = tx.objectStore(STORE_CUSTOM_CATEGORY).getAll();
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getAllCustomCategory失敗:', e);
    if (!_retry) { _dbPromise = null; return getAllCustomCategory(true); }
    return [];
  }
}

async function deleteCustomCategory(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_CUSTOM_CATEGORY, 'readwrite');
      tx.objectStore(STORE_CUSTOM_CATEGORY).delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] deleteCustomCategory失敗:', e);
    if (!_retry) { _dbPromise = null; return deleteCustomCategory(id, true); }
  }
}

// ユーザー追加工種
window.saveCustomCategory = saveCustomCategory;
window.getAllCustomCategory = getAllCustomCategory;
window.deleteCustomCategory = deleteCustomCategory;

// ==========================================
// v10追加: Phase6写真管理（photoStore）CRUD
// ==========================================

async function savePhotoManager(record, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_PHOTO_MANAGER, 'readwrite');
      tx.objectStore(STORE_PHOTO_MANAGER).put(record);
      tx.oncomplete = function() { resolve(record); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] savePhotoManager失敗:', e);
    if (!_retry) { _dbPromise = null; return savePhotoManager(record, true); }
    return null;
  }
}

async function getPhotoManager(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_PHOTO_MANAGER, 'readonly');
      var req = tx.objectStore(STORE_PHOTO_MANAGER).get(id);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getPhotoManager失敗:', e);
    if (!_retry) { _dbPromise = null; return getPhotoManager(id, true); }
    return null;
  }
}

async function getAllPhotoManager(_retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_PHOTO_MANAGER, 'readonly');
      var req = tx.objectStore(STORE_PHOTO_MANAGER).getAll();
      req.onsuccess = function() {
        var results = req.result || [];
        results.sort(function(a, b) {
          return (b.takenDate || '').localeCompare(a.takenDate || '');
        });
        resolve(results);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getAllPhotoManager失敗:', e);
    if (!_retry) { _dbPromise = null; return getAllPhotoManager(true); }
    return [];
  }
}

async function deletePhotoManager(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_PHOTO_MANAGER, 'readwrite');
      tx.objectStore(STORE_PHOTO_MANAGER).delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] deletePhotoManager失敗:', e);
    if (!_retry) { _dbPromise = null; return deletePhotoManager(id, true); }
  }
}

// Phase6写真管理
window.savePhotoManager = savePhotoManager;
window.getPhotoManager = getPhotoManager;
window.getAllPhotoManager = getAllPhotoManager;
window.deletePhotoManager = deletePhotoManager;

// ==========================================
// v11追加: Phase7 日報・報告書（reportStore）CRUD
// ==========================================

async function saveReport(record, _retry) {
  var now = new Date().toISOString();
  if (!record.createdAt) record.createdAt = now;
  record.updatedAt = now;
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_REPORT, 'readwrite');
      tx.objectStore(STORE_REPORT).put(record);
      tx.oncomplete = function() { resolve(record); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] saveReport失敗:', e);
    if (!_retry) { _dbPromise = null; return saveReport(record, true); }
    return null;
  }
}

async function getReport(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_REPORT, 'readonly');
      var req = tx.objectStore(STORE_REPORT).get(id);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getReport失敗:', e);
    if (!_retry) { _dbPromise = null; return getReport(id, true); }
    return null;
  }
}

async function getAllReports(_retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_REPORT, 'readonly');
      var req = tx.objectStore(STORE_REPORT).getAll();
      req.onsuccess = function() {
        var results = req.result || [];
        results.sort(function(a, b) {
          return (b.updatedAt || '').localeCompare(a.updatedAt || '');
        });
        resolve(results);
      };
      req.onerror = function() { reject(req.error); };
    });
  } catch (e) {
    console.error('[IDB] getAllReports失敗:', e);
    if (!_retry) { _dbPromise = null; return getAllReports(true); }
    return [];
  }
}

async function deleteReport(id, _retry) {
  try {
    var db = await getDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_REPORT, 'readwrite');
      tx.objectStore(STORE_REPORT).delete(id);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  } catch (e) {
    console.error('[IDB] deleteReport失敗:', e);
    if (!_retry) { _dbPromise = null; return deleteReport(id, true); }
  }
}

// Phase7日報・報告書
window.saveReport = saveReport;
window.getReport = getReport;
window.getAllReports = getAllReports;
window.deleteReport = deleteReport;

console.log('[idb-storage.js] ✓ IndexedDBストレージモジュール読み込み完了（v12 Phase8図面管理対応）');
