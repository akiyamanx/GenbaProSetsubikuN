// ==========================================
// Gemini Vision APIを使った工程表画像の読み取り
// 現場Pro 設備くん v0.52 - Phase5-2
// ==========================================

// Gemini Flash API（画像対応）
var KOUTEI_AI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// ==========================================
// メイン解析関数
// ==========================================

/**
 * 工程表画像をGemini Vision APIで解析
 * @param {string} imageBase64 - base64エンコードされた画像データ
 * @param {string} mimeType - MIMEタイプ（image/jpeg等）
 * @param {string} genbaName - 現場名
 * @returns {Promise<object>} 解析結果
 */
async function analyzeKouteiImage(imageBase64, mimeType, genbaName) {
  var prompt = buildKouteiPrompt(genbaName);
  var responseText = await callKouteiVisionAPI(imageBase64, mimeType, prompt);
  return parseKouteiResponse(responseText);
}

// ==========================================
// プロンプト構築
// ==========================================

function buildKouteiPrompt(genbaName) {
  var today = new Date().toISOString().split('T')[0];
  return 'あなたは建設現場の工程管理AIアシスタントです。\n' +
    'この画像は建設工事の工程表（スケジュール表）です。\n' +
    '画像から工程（作業項目）を読み取って、JSON形式で出力してください。\n\n' +
    '【対象現場】' + (genbaName || '未指定') + '\n\n' +
    '【読み取りルール】\n' +
    '- 工程表に記載されている全ての作業項目を抽出してください\n' +
    '- バーチャート（ガントチャート）の場合、バーの開始位置と終了位置から日付を推定してください\n' +
    '- 手書きの場合も最善の判断で読み取ってください\n' +
    '- 日付が不明確な場合はconfidenceをlowにしてください\n\n' +
    '【建設工程でよくある項目例】\n' +
    '- 仮設工事、解体工事、基礎工事、躯体工事\n' +
    '- 木工事（大工工事）、建具工事、金属工事\n' +
    '- 左官工事、タイル工事、塗装工事\n' +
    '- 内装工事（クロス貼り、床貼り）\n' +
    '- 設備工事（給排水、ガス、電気、空調）\n' +
    '- 防水工事、外壁工事、屋根工事\n' +
    '- 外構工事、クリーニング、検査、引渡し\n\n' +
    '【出力JSON形式】（これ以外のテキストは出力しないでください）\n' +
    '{\n' +
    '  "koutei": [\n' +
    '    {\n' +
    '      "name": "工程名（例：木工事）",\n' +
    '      "startDate": "YYYY-MM-DD",\n' +
    '      "endDate": "YYYY-MM-DD",\n' +
    '      "who": "担当者/担当業者（わかれば。不明なら空文字）",\n' +
    '      "note": "備考（特記事項があれば。なければ空文字）",\n' +
    '      "confidence": "high/medium/low"\n' +
    '    }\n' +
    '  ],\n' +
    '  "metadata": {\n' +
    '    "projectName": "工事名（読み取れれば）",\n' +
    '    "totalPeriod": "全体工期（読み取れれば。例: 2026-01-08〜2026-02-27）",\n' +
    '    "imageQuality": "good/fair/poor（画像の読み取りやすさ）"\n' +
    '  }\n' +
    '}\n\n' +
    '【重要な注意事項】\n' +
    '- 今日の日付は ' + today + ' です\n' +
    '- 年が記載されていない場合は2026年と推定してください\n' +
    '- 工程の順番は工程表の記載順を保持してください\n' +
    '- 読み取れない文字がある場合は「?」を含めて最善の推測をしてください\n' +
    '- JSON以外のテキストは一切出力しないでください';
}

// ==========================================
// Gemini Vision API呼び出し
// ==========================================

async function callKouteiVisionAPI(imageBase64, mimeType, prompt) {
  var apiKey = getKouteiApiKey();
  if (!apiKey) {
    throw new Error('Gemini APIキーが設定されていません。設定画面でAPIキーを入力してください。');
  }

  // API使用量チェック
  var check = canUseApi();
  if (!check.allowed) {
    throw new Error(check.reason);
  }

  var requestBody = {
    contents: [{
      parts: [
        {
          inline_data: {
            mime_type: mimeType,
            data: imageBase64
          }
        },
        {
          text: prompt
        }
      ]
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192
    }
  };

  var response = await fetch(KOUTEI_AI_URL + '?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    var errText = '';
    try { errText = await response.text(); } catch(e) {}
    // v0.52デバッグ用: ステータスコードとレスポンスボディをそのまま返す
    throw new Error('API Error [' + response.status + ']\n' + errText);
  }

  // API使用量を記録
  recordApiUsage();

  var data = await response.json();
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error('AIからの応答が空でした。画像の内容を確認してください。');
  }
  return data.candidates[0].content.parts[0].text;
}

// ==========================================
// APIキー取得
// ==========================================

function getKouteiApiKey() {
  try {
    var settings = JSON.parse(localStorage.getItem('reform_app_settings') || '{}');
    return settings.geminiApiKey || '';
  } catch (e) {
    console.error('[koutei-ai] APIキー取得失敗:', e);
    return '';
  }
}

// ==========================================
// AIレスポンスのパース
// ==========================================

function parseKouteiResponse(responseText) {
  try {
    var jsonStr = responseText;
    // 最初の { から最後の } までを抽出
    var firstBrace = jsonStr.indexOf('{');
    var lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('JSONが見つかりません');
    }
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);

    var parsed = JSON.parse(jsonStr);

    // バリデーション
    if (!Array.isArray(parsed.koutei)) {
      parsed.koutei = [];
    }
    if (!parsed.metadata) {
      parsed.metadata = {};
    }

    return parsed;
  } catch (e) {
    console.error('工程表レスポンスのパースに失敗:', e);
    return {
      koutei: [],
      metadata: {},
      parseError: true,
      rawText: responseText
    };
  }
}

// ==========================================
// 画像リサイズ（長辺2048px以内に縮小）
// ==========================================

function resizeImageForAPI(dataUrl) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var maxSize = 2048;
      var w = img.width;
      var h = img.height;

      // 長辺がmaxSize以内ならそのまま返す
      if (w <= maxSize && h <= maxSize) {
        // data:image/jpeg;base64, のプレフィックスを除去してbase64だけ返す
        resolve({
          base64: dataUrl.split(',')[1],
          mimeType: dataUrl.split(';')[0].split(':')[1]
        });
        return;
      }

      // 縮小
      var ratio = maxSize / Math.max(w, h);
      var newW = Math.round(w * ratio);
      var newH = Math.round(h * ratio);

      var canvas = document.createElement('canvas');
      canvas.width = newW;
      canvas.height = newH;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, newW, newH);

      var resizedUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({
        base64: resizedUrl.split(',')[1],
        mimeType: 'image/jpeg'
      });
    };
    img.onerror = function() {
      // エラー時はそのまま返す
      resolve({
        base64: dataUrl.split(',')[1],
        mimeType: dataUrl.split(';')[0].split(':')[1] || 'image/jpeg'
      });
    };
    img.src = dataUrl;
  });
}

// ==========================================
// グローバル公開
// ==========================================
window.analyzeKouteiImage = analyzeKouteiImage;
window.buildKouteiPrompt = buildKouteiPrompt;
window.callKouteiVisionAPI = callKouteiVisionAPI;
window.getKouteiApiKey = getKouteiApiKey;
window.parseKouteiResponse = parseKouteiResponse;
window.resizeImageForAPI = resizeImageForAPI;

console.log('[koutei-ai.js] ✓ 工程表AI読み取りモジュール読み込み完了（v0.52）');
